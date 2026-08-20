"""
Tests for exception handlers (Story 4.7).

Verifies that all exceptions are converted to consistent JSON responses
with appropriate status codes and error details.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.exceptions import (
    ConflictError,
    DatabaseError,
    NotFoundError,
    register_custom_exception_handlers,
    register_exception_handlers,
)
from app.exceptions.handlers import _get_status_message, _json_safe_ctx
from app.main import app as main_app


class TestCustomExceptions:
    """Tests for custom exception classes."""

    def test_not_found_error_attributes(self):
        """NotFoundError should store resource and identifier."""
        exc = NotFoundError(resource="Property", identifier="123")
        assert exc.resource == "Property"
        assert exc.identifier == "123"
        assert "Property" in str(exc)
        assert "123" in str(exc)

    def test_not_found_error_message_format(self):
        """NotFoundError should have descriptive message."""
        exc = NotFoundError(resource="Lease", identifier="abc-456")
        assert str(exc) == "Lease with id 'abc-456' not found"

    def test_conflict_error_basic(self):
        """ConflictError should store message."""
        exc = ConflictError(message="Duplicate entry exists")
        assert str(exc) == "Duplicate entry exists"

    def test_conflict_error_with_resource_info(self):
        """ConflictError should accept optional resource info."""
        exc = ConflictError(
            message="Property name already exists",
            resource_type="Property",
            resource_id="prop-123",
        )
        assert exc.resource_type == "Property"
        assert exc.resource_id == "prop-123"

    def test_database_error_basic(self):
        """DatabaseError should store message."""
        exc = DatabaseError(message="Connection failed")
        assert str(exc) == "Connection failed"
        assert exc.original_error is None

    def test_database_error_with_original(self):
        """DatabaseError should store original exception."""
        original = ValueError("Original error")
        exc = DatabaseError(message="Database error", original_error=original)
        assert exc.original_error is original


class TestValidationErrorHandler:
    """Tests for request validation error handling."""

    @pytest.fixture
    def app(self):
        """Create test app with validation endpoint."""
        app = FastAPI()
        register_exception_handlers(app)

        class TestModel(BaseModel):
            email: str = Field(pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
            age: int = Field(ge=0, le=150)

        @app.post("/validate")
        async def validate_endpoint(data: TestModel):
            return {"status": "ok"}

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_validation_error_returns_422(self, client):
        """Validation errors should return 422 status."""
        response = client.post("/validate", json={"email": "invalid", "age": -1})
        assert response.status_code == 422

    def test_validation_error_returns_json(self, client):
        """Validation errors should return JSON."""
        response = client.post("/validate", json={"email": "invalid", "age": -1})
        assert response.headers["content-type"] == "application/json"

    def test_validation_error_has_errors_list(self, client):
        """Validation errors should include errors list."""
        response = client.post("/validate", json={"email": "invalid", "age": -1})
        data = response.json()
        assert "errors" in data
        assert isinstance(data["errors"], list)
        assert len(data["errors"]) >= 1

    def test_validation_error_has_field_locations(self, client):
        """Validation errors should include field locations."""
        response = client.post("/validate", json={"email": "invalid", "age": -1})
        data = response.json()
        # Check that at least one error has loc
        assert any("loc" in error for error in data["errors"])

    def test_validation_error_has_message(self, client):
        """Validation errors should have message field."""
        response = client.post("/validate", json={"email": "invalid", "age": -1})
        data = response.json()
        assert data["message"] == "Validation failed"

    def test_validation_error_has_status_code(self, client):
        """Validation errors should include status_code in body."""
        response = client.post("/validate", json={"email": "invalid", "age": -1})
        data = response.json()
        assert data["status_code"] == 422

    def test_validation_error_has_timestamp(self, client):
        """Validation errors should include timestamp."""
        response = client.post("/validate", json={"email": "invalid", "age": -1})
        data = response.json()
        assert "timestamp" in data

    def test_validation_error_has_path(self, client):
        """Validation errors should include request path."""
        response = client.post("/validate", json={"email": "invalid", "age": -1})
        data = response.json()
        assert data["path"] == "/validate"

    def test_missing_field_validation_error(self, client):
        """Missing required fields should trigger validation error."""
        response = client.post("/validate", json={})
        assert response.status_code == 422
        data = response.json()
        assert len(data["errors"]) >= 2  # email and age are missing


class TestJsonSafeCtx:
    """Regression for FINDING-S18: a model validator that raises ValueError
    must still produce a clean, serializable 422 — not an opaque 400.

    Pydantic v2 stores the raising exception object itself in the validation
    error's ``ctx`` (``ctx["error"] = ValueError(...)``). Copying that verbatim
    into the response made ``model_dump(mode="json")`` fail, degrading the 422
    into a 400 ("Unable to serialize unknown type: <class 'ValueError'>") that
    also leaked the internal exception class.
    """

    def test_none_and_empty_pass_through(self):
        assert _json_safe_ctx(None) is None
        assert _json_safe_ctx({}) is None

    def test_serializable_values_are_preserved(self):
        ctx = {"limit_value": 150, "expected": "an int", "ok": True}
        assert _json_safe_ctx(ctx) == ctx

    def test_exception_value_is_stringified(self):
        ctx = {"error": ValueError("retro cannot exceed base")}
        safe = _json_safe_ctx(ctx)
        assert safe == {"error": "retro cannot exceed base"}
        # The result must be JSON-serializable (the whole point).
        json.dumps(safe)

    def test_validator_that_raises_returns_clean_422(self):
        """End-to-end: a route whose model validator raises ValueError returns a
        proper 422 with field-level errors, and the body serializes cleanly."""
        from pydantic import field_validator

        app = FastAPI()
        register_exception_handlers(app)

        class Model(BaseModel):
            amount: int

            @field_validator("amount")
            @classmethod
            def _check(cls, v: int) -> int:
                if v > 100:
                    raise ValueError("amount is too large")
                return v

        @app.post("/v")
        async def route(data: Model):
            return {"ok": True}

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/v", json={"amount": 999})
        assert resp.status_code == 422
        body = resp.json()
        assert body["errors"]
        # ctx carries the validator message as a plain string, not an object.
        ctx = body["errors"][0].get("ctx") or {}
        assert ctx.get("error") == "amount is too large"


class TestHTTPExceptionHandler:
    """Tests for HTTP exception handling."""

    @pytest.fixture
    def app(self):
        """Create test app with HTTP exception endpoints."""
        app = FastAPI()
        register_exception_handlers(app)

        @app.get("/401")
        async def unauthorized():
            raise HTTPException(status_code=401, detail="Token invalid")

        @app.get("/403")
        async def forbidden():
            raise HTTPException(status_code=403, detail="Access denied")

        @app.get("/404")
        async def not_found():
            raise HTTPException(status_code=404, detail="Resource not found")

        @app.get("/custom-header")
        async def with_header():
            raise HTTPException(
                status_code=401,
                detail="Need auth",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_http_401_returns_json(self, client):
        """401 should return JSON response."""
        response = client.get("/401")
        assert response.status_code == 401
        assert response.headers["content-type"] == "application/json"

    def test_http_403_returns_json(self, client):
        """403 should return JSON response."""
        response = client.get("/403")
        assert response.status_code == 403
        data = response.json()
        assert data["status_code"] == 403

    def test_http_404_returns_json(self, client):
        """404 should return JSON response."""
        response = client.get("/404")
        assert response.status_code == 404
        data = response.json()
        assert data["detail"] == "Resource not found"

    def test_http_exception_preserves_headers(self, client):
        """HTTP exception should preserve custom headers."""
        response = client.get("/custom-header")
        assert response.headers.get("WWW-Authenticate") == "Bearer"

    def test_http_exception_has_message(self, client):
        """HTTP exception should have descriptive message."""
        response = client.get("/401")
        data = response.json()
        assert data["message"] == "Authentication required"


class TestValueErrorHandler:
    """Tests for ValueError handling."""

    @pytest.fixture
    def app(self):
        """Create test app with ValueError endpoint."""
        app = FastAPI()
        register_exception_handlers(app)

        @app.get("/value-error")
        async def raise_value_error():
            raise ValueError("Invalid value provided")

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_value_error_returns_400(self, client):
        """ValueError should return 400 status."""
        response = client.get("/value-error")
        assert response.status_code == 400

    def test_value_error_returns_json(self, client):
        """ValueError should return JSON."""
        response = client.get("/value-error")
        assert response.headers["content-type"] == "application/json"

    def test_value_error_has_detail(self, client):
        """ValueError should include error message in detail."""
        response = client.get("/value-error")
        data = response.json()
        assert data["detail"] == "Invalid value provided"

    def test_value_error_has_message(self, client):
        """ValueError should have 'Bad request' message."""
        response = client.get("/value-error")
        data = response.json()
        assert data["message"] == "Bad request"


class TestPermissionErrorHandler:
    """Tests for PermissionError handling."""

    @pytest.fixture
    def app(self):
        """Create test app with PermissionError endpoint."""
        app = FastAPI()
        register_exception_handlers(app)

        @app.get("/permission-error")
        async def raise_permission_error():
            raise PermissionError("You cannot access this resource")

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_permission_error_returns_403(self, client):
        """PermissionError should return 403 status."""
        response = client.get("/permission-error")
        assert response.status_code == 403

    def test_permission_error_returns_json(self, client):
        """PermissionError should return JSON."""
        response = client.get("/permission-error")
        assert response.headers["content-type"] == "application/json"

    def test_permission_error_has_message(self, client):
        """PermissionError should have 'Access denied' message."""
        response = client.get("/permission-error")
        data = response.json()
        assert data["message"] == "Access denied"


class TestGeneralExceptionHandler:
    """Tests for general (catch-all) exception handling."""

    @pytest.fixture
    def app(self):
        """Create test app with unhandled exception endpoint."""
        app = FastAPI()
        register_exception_handlers(app)

        @app.get("/unhandled")
        async def raise_unhandled():
            raise RuntimeError("Something went very wrong")

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_unhandled_exception_returns_500(self, client):
        """Unhandled exception should return 500 status."""
        response = client.get("/unhandled")
        assert response.status_code == 500

    def test_unhandled_exception_returns_json(self, client):
        """Unhandled exception should return JSON."""
        response = client.get("/unhandled")
        assert response.headers["content-type"] == "application/json"

    def test_unhandled_exception_has_message(self, client):
        """Unhandled exception should have generic message."""
        response = client.get("/unhandled")
        data = response.json()
        assert data["message"] == "Internal server error"

    def test_unhandled_exception_has_timestamp(self, client):
        """Unhandled exception should include timestamp."""
        response = client.get("/unhandled")
        data = response.json()
        assert "timestamp" in data

    def test_unhandled_exception_is_reported_to_sentry(self, client):
        """Unhandled 500 errors should be captured by Sentry."""
        with patch(
            "app.exceptions.handlers.capture_unexpected_exception"
        ) as mock_capture:
            response = client.get("/unhandled")

        assert response.status_code == 500
        mock_capture.assert_called_once()

    def test_value_error_is_not_reported_to_sentry(self):
        """Expected 400 business validation errors should not be bug reports."""
        app = FastAPI()
        register_exception_handlers(app)

        @app.get("/value-error")
        async def raise_value_error():
            raise ValueError("Invalid value provided")

        client = TestClient(app, raise_server_exceptions=False)
        with patch(
            "app.exceptions.handlers.capture_unexpected_exception"
        ) as mock_capture:
            response = client.get("/value-error")

        assert response.status_code == 400
        mock_capture.assert_not_called()


class TestNotFoundErrorHandler:
    """Tests for NotFoundError handling."""

    @pytest.fixture
    def app(self):
        """Create test app with NotFoundError endpoint."""
        app = FastAPI()
        register_exception_handlers(app)
        register_custom_exception_handlers(app)

        @app.get("/property/{id}")
        async def get_property(id: str):
            raise NotFoundError(resource="Property", identifier=id)

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_not_found_error_returns_404(self, client):
        """NotFoundError should return 404 status."""
        response = client.get("/property/123")
        assert response.status_code == 404

    def test_not_found_error_returns_json(self, client):
        """NotFoundError should return JSON."""
        response = client.get("/property/123")
        assert response.headers["content-type"] == "application/json"

    def test_not_found_error_has_resource_message(self, client):
        """NotFoundError should mention resource type in message."""
        response = client.get("/property/abc")
        data = response.json()
        assert "Property" in data["message"]

    def test_not_found_error_has_detail(self, client):
        """NotFoundError should have detail with identifier."""
        response = client.get("/property/xyz-789")
        data = response.json()
        assert "xyz-789" in data["detail"]


class TestConflictErrorHandler:
    """Tests for ConflictError handling."""

    @pytest.fixture
    def app(self):
        """Create test app with ConflictError endpoint."""
        app = FastAPI()
        register_exception_handlers(app)
        register_custom_exception_handlers(app)

        @app.post("/property")
        async def create_property():
            raise ConflictError(message="Property with this name already exists")

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_conflict_error_returns_409(self, client):
        """ConflictError should return 409 status."""
        response = client.post("/property")
        assert response.status_code == 409

    def test_conflict_error_returns_json(self, client):
        """ConflictError should return JSON."""
        response = client.post("/property")
        assert response.headers["content-type"] == "application/json"

    def test_conflict_error_has_message(self, client):
        """ConflictError should have 'Conflict' message."""
        response = client.post("/property")
        data = response.json()
        assert data["message"] == "Conflict"

    def test_conflict_error_has_detail(self, client):
        """ConflictError should include error detail."""
        response = client.post("/property")
        data = response.json()
        assert "already exists" in data["detail"]


class TestDatabaseErrorHandler:
    """Tests for DatabaseError handling."""

    @pytest.fixture
    def app(self):
        """Create test app with DatabaseError endpoint."""
        app = FastAPI()
        register_exception_handlers(app)
        register_custom_exception_handlers(app)

        @app.get("/db-error")
        async def raise_db_error():
            raise DatabaseError(
                message="Connection pool exhausted",
                original_error=ConnectionError("Pool full"),
            )

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_database_error_returns_500(self, client):
        """DatabaseError should return 500 status."""
        response = client.get("/db-error")
        assert response.status_code == 500

    def test_database_error_returns_json(self, client):
        """DatabaseError should return JSON."""
        response = client.get("/db-error")
        assert response.headers["content-type"] == "application/json"

    def test_database_error_has_message(self, client):
        """DatabaseError should have 'Database error' message."""
        response = client.get("/db-error")
        data = response.json()
        assert data["message"] == "Database error"


class TestGetStatusMessage:
    """Tests for _get_status_message helper function."""

    def test_400_message(self):
        """400 should return 'Bad request'."""
        assert _get_status_message(400) == "Bad request"

    def test_401_message(self):
        """401 should return 'Authentication required'."""
        assert _get_status_message(401) == "Authentication required"

    def test_403_message(self):
        """403 should return 'Access denied'."""
        assert _get_status_message(403) == "Access denied"

    def test_404_message(self):
        """404 should return 'Not found'."""
        assert _get_status_message(404) == "Not found"

    def test_422_message(self):
        """422 should return 'Validation failed'."""
        assert _get_status_message(422) == "Validation failed"

    def test_500_message(self):
        """500 should return 'Internal server error'."""
        assert _get_status_message(500) == "Internal server error"

    def test_unknown_status_message(self):
        """Unknown status should return 'Error'."""
        assert _get_status_message(418) == "Error"


class TestMainAppExceptionHandlers:
    """Tests that exception handlers are registered in main app."""

    @pytest.fixture
    def client(self):
        """Create test client from main app."""
        return TestClient(main_app, raise_server_exceptions=False)

    def test_main_app_handles_404(self, client):
        """Main app should return JSON for 404."""
        response = client.get("/api/v1/nonexistent")
        assert response.status_code == 404
        data = response.json()
        assert "status_code" in data
        assert "message" in data

    def test_main_app_handles_validation_error(self, client):
        """Main app should return JSON for validation errors."""
        # Property endpoints require auth but will validate request first
        response = client.post("/api/v1/properties", json={})
        # Should be 401 (auth) or 422 (validation)
        assert response.status_code in [401, 422]
        data = response.json()
        assert "status_code" in data

    def test_health_endpoint_still_works(self, client):
        """Health endpoint should not be affected by handlers."""
        mock_body = {"status": "healthy", "checks": {}}
        with patch("app.main.run_health_checks", new_callable=AsyncMock) as mock_health:
            mock_health.return_value = (mock_body, 200)
            response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


class TestModuleImports:
    """Tests for module-level imports."""

    def test_import_not_found_error(self):
        """NotFoundError should be importable from app.exceptions."""
        from app.exceptions import NotFoundError as NFE

        assert NFE is NotFoundError

    def test_import_conflict_error(self):
        """ConflictError should be importable from app.exceptions."""
        from app.exceptions import ConflictError as CE

        assert CE is ConflictError

    def test_import_database_error(self):
        """DatabaseError should be importable from app.exceptions."""
        from app.exceptions import DatabaseError as DE

        assert DE is DatabaseError

    def test_import_register_functions(self):
        """Registration functions should be importable."""
        from app.exceptions import register_custom_exception_handlers as rceh
        from app.exceptions import register_exception_handlers as reh

        assert reh is register_exception_handlers
        assert rceh is register_custom_exception_handlers


class TestBadRequestError:
    """Tests for BadRequestError exception class."""

    def test_bad_request_error_message(self):
        """BadRequestError should store message."""
        from app.exceptions import BadRequestError

        exc = BadRequestError(message="Invalid request data")
        assert str(exc) == "Invalid request data"

    def test_bad_request_error_is_exception(self):
        """BadRequestError should be an Exception subclass."""
        from app.exceptions import BadRequestError

        exc = BadRequestError(message="test")
        assert isinstance(exc, Exception)


class TestInvalidInvitationTokenError:
    """Tests for InvalidInvitationTokenError exception class."""

    def test_invalid_invitation_token_error_reason(self):
        """InvalidInvitationTokenError should store the reason."""
        from app.exceptions.handlers import InvalidInvitationTokenError

        exc = InvalidInvitationTokenError(reason="expired")
        assert exc.reason == "expired"

    def test_invalid_invitation_token_error_message(self):
        """InvalidInvitationTokenError should include reason in message."""
        from app.exceptions.handlers import InvalidInvitationTokenError

        exc = InvalidInvitationTokenError(reason="revoked")
        assert "revoked" in str(exc)

    def test_invalid_invitation_token_error_used(self):
        """InvalidInvitationTokenError should work with 'used' reason."""
        from app.exceptions.handlers import InvalidInvitationTokenError

        exc = InvalidInvitationTokenError(reason="used")
        assert exc.reason == "used"
        assert str(exc) == "Invalid invitation token: used"


class TestServiceUnavailableError:
    """Tests for ServiceUnavailableError exception class."""

    def test_service_unavailable_error_basic(self):
        """ServiceUnavailableError should store service name."""
        from app.exceptions import ServiceUnavailableError

        exc = ServiceUnavailableError(service_name="Stripe")
        assert exc.service_name == "Stripe"
        assert exc.original_error is None
        assert exc.retry_after == 60

    def test_service_unavailable_error_message(self):
        """ServiceUnavailableError should include service name in message."""
        from app.exceptions import ServiceUnavailableError

        exc = ServiceUnavailableError(service_name="Resend")
        assert "Resend" in str(exc)

    def test_service_unavailable_error_with_original(self):
        """ServiceUnavailableError should store original error."""
        from app.exceptions import ServiceUnavailableError

        original = ConnectionError("Timeout")
        exc = ServiceUnavailableError(
            service_name="Stripe",
            original_error=original,
            retry_after=120,
        )
        assert exc.original_error is original
        assert exc.retry_after == 120


class TestBadRequestErrorHandler:
    """Tests for BadRequestError HTTP handler."""

    @pytest.fixture
    def app(self):
        """Create test app with BadRequestError endpoint."""
        app = FastAPI()
        register_exception_handlers(app)
        register_custom_exception_handlers(app)

        @app.get("/bad-request")
        async def raise_bad_request():
            from app.exceptions import BadRequestError

            raise BadRequestError(message="Invalid query parameter")

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_bad_request_error_returns_400(self, client):
        """BadRequestError should return 400 status."""
        response = client.get("/bad-request")
        assert response.status_code == 400

    def test_bad_request_error_returns_json(self, client):
        """BadRequestError should return JSON."""
        response = client.get("/bad-request")
        assert response.headers["content-type"] == "application/json"

    def test_bad_request_error_has_message(self, client):
        """BadRequestError should have 'Bad Request' message."""
        response = client.get("/bad-request")
        data = response.json()
        assert data["message"] == "Bad Request"

    def test_bad_request_error_has_detail(self, client):
        """BadRequestError should include error detail."""
        response = client.get("/bad-request")
        data = response.json()
        assert "Invalid query parameter" in data["detail"]


class TestServiceUnavailableHandler:
    """Tests for ServiceUnavailableError HTTP handler."""

    @pytest.fixture
    def app(self):
        """Create test app with ServiceUnavailableError endpoint."""
        app = FastAPI()
        register_exception_handlers(app)
        register_custom_exception_handlers(app)

        @app.get("/service-down")
        async def raise_service_unavailable():
            from app.exceptions import ServiceUnavailableError

            raise ServiceUnavailableError(
                service_name="Stripe",
                retry_after=30,
            )

        @app.get("/service-down-with-error")
        async def raise_service_unavailable_with_error():
            from app.exceptions import ServiceUnavailableError

            raise ServiceUnavailableError(
                service_name="Resend",
                original_error=ConnectionError("refused"),
                retry_after=60,
            )

        return app

    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return TestClient(app, raise_server_exceptions=False)

    def test_service_unavailable_returns_503(self, client):
        """ServiceUnavailableError should return 503 status."""
        response = client.get("/service-down")
        assert response.status_code == 503

    def test_service_unavailable_returns_json(self, client):
        """ServiceUnavailableError should return JSON."""
        response = client.get("/service-down")
        assert response.headers["content-type"] == "application/json"

    def test_service_unavailable_has_message(self, client):
        """ServiceUnavailableError should have 'Service unavailable' message."""
        response = client.get("/service-down")
        data = response.json()
        assert data["message"] == "Service unavailable"

    def test_service_unavailable_has_retry_after_header(self, client):
        """ServiceUnavailableError should include Retry-After header."""
        response = client.get("/service-down")
        assert response.headers.get("retry-after") == "30"

    def test_service_unavailable_with_original_error(self, client):
        """ServiceUnavailableError with original_error should return 503."""
        response = client.get("/service-down-with-error")
        assert response.status_code == 503
        data = response.json()
        assert data["message"] == "Service unavailable"

    def test_service_unavailable_with_original_error_is_reported(self, client):
        """Unexpected service failures should be captured by Sentry."""
        with patch(
            "app.exceptions.handlers.capture_unexpected_exception"
        ) as mock_capture:
            response = client.get("/service-down-with-error")

        assert response.status_code == 503
        mock_capture.assert_called_once()
