"""
Tests for error response schemas (Story 4.6).

Verifies that all error schemas are properly defined with correct
fields, types, validation, and OpenAPI documentation support.
"""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.errors import (
    HTTP_400_RESPONSE,
    HTTP_401_RESPONSE,
    HTTP_403_RESPONSE,
    HTTP_404_RESPONSE,
    HTTP_409_RESPONSE,
    HTTP_422_RESPONSE,
    HTTP_500_RESPONSE,
    ErrorDetail,
    ErrorResponse,
    NotFoundErrorResponse,
    ValidationErrorResponse,
)


class TestErrorDetailSchema:
    """Tests for ErrorDetail schema."""

    def test_create_error_detail_with_required_fields(self):
        """ErrorDetail should accept required fields."""
        detail = ErrorDetail(
            loc=["body", "email"],
            msg="Invalid email format",
            type="value_error.email",
        )
        assert detail.loc == ["body", "email"]
        assert detail.msg == "Invalid email format"
        assert detail.type == "value_error.email"

    def test_error_detail_with_optional_context(self):
        """ErrorDetail should accept optional context."""
        detail = ErrorDetail(
            loc=["body", "age"],
            msg="Value must be greater than 0",
            type="value_error.number.not_gt",
            ctx={"limit_value": 0},
        )
        assert detail.ctx == {"limit_value": 0}

    def test_error_detail_loc_accepts_integers(self):
        """ErrorDetail loc should accept integers for array indices."""
        detail = ErrorDetail(
            loc=["body", "items", 0, "name"],
            msg="Field required",
            type="value_error.missing",
        )
        assert detail.loc == ["body", "items", 0, "name"]

    def test_error_detail_without_context(self):
        """ErrorDetail should work without context."""
        detail = ErrorDetail(
            loc=["query", "page"],
            msg="Invalid page number",
            type="type_error.integer",
        )
        assert detail.ctx is None

    def test_error_detail_json_serialization(self):
        """ErrorDetail should serialize to JSON correctly."""
        detail = ErrorDetail(
            loc=["body", "email"],
            msg="Invalid email",
            type="value_error.email",
        )
        json_data = detail.model_dump()
        assert json_data["loc"] == ["body", "email"]
        assert json_data["msg"] == "Invalid email"
        assert json_data["type"] == "value_error.email"

    def test_error_detail_from_dict(self):
        """ErrorDetail should be creatable from dict."""
        data = {
            "loc": ["body", "name"],
            "msg": "Field required",
            "type": "value_error.missing",
        }
        detail = ErrorDetail(**data)
        assert detail.loc == ["body", "name"]


class TestErrorResponseSchema:
    """Tests for ErrorResponse schema."""

    def test_create_error_response_with_required_fields(self):
        """ErrorResponse should accept required fields."""
        response = ErrorResponse(
            status_code=400,
            message="Bad request",
        )
        assert response.status_code == 400
        assert response.message == "Bad request"

    def test_error_response_has_timestamp(self):
        """ErrorResponse should have a timestamp."""
        response = ErrorResponse(
            status_code=500,
            message="Internal error",
        )
        assert response.timestamp is not None
        assert isinstance(response.timestamp, datetime)

    def test_error_response_timestamp_is_utc(self):
        """ErrorResponse timestamp should be UTC."""
        before = datetime.now(UTC)
        response = ErrorResponse(
            status_code=400,
            message="Bad request",
        )
        after = datetime.now(UTC)
        assert before <= response.timestamp <= after

    def test_error_response_with_all_optional_fields(self):
        """ErrorResponse should accept all optional fields."""
        response = ErrorResponse(
            status_code=404,
            message="Not found",
            detail="The requested property was not found",
            request_id="req_abc123",
            path="/api/v1/properties/123",
        )
        assert response.detail == "The requested property was not found"
        assert response.request_id == "req_abc123"
        assert response.path == "/api/v1/properties/123"

    def test_error_response_with_errors_list(self):
        """ErrorResponse should accept errors list."""
        errors = [
            ErrorDetail(
                loc=["body", "email"],
                msg="Invalid email",
                type="value_error.email",
            )
        ]
        response = ErrorResponse(
            status_code=422,
            message="Validation failed",
            errors=errors,
        )
        assert len(response.errors) == 1
        assert response.errors[0].msg == "Invalid email"

    def test_error_response_status_code_validation_min(self):
        """ErrorResponse should reject status codes below 400."""
        with pytest.raises(ValidationError) as exc_info:
            ErrorResponse(status_code=200, message="OK")
        assert "status_code" in str(exc_info.value)

    def test_error_response_status_code_validation_max(self):
        """ErrorResponse should reject status codes above 599."""
        with pytest.raises(ValidationError) as exc_info:
            ErrorResponse(status_code=600, message="Invalid")
        assert "status_code" in str(exc_info.value)

    def test_error_response_message_required(self):
        """ErrorResponse should require message."""
        with pytest.raises(ValidationError) as exc_info:
            ErrorResponse(status_code=400)
        assert "message" in str(exc_info.value)

    def test_error_response_json_serialization(self):
        """ErrorResponse should serialize to JSON correctly."""
        response = ErrorResponse(
            status_code=400,
            message="Bad request",
            detail="Invalid data",
        )
        json_data = response.model_dump()
        assert json_data["status_code"] == 400
        assert json_data["message"] == "Bad request"
        assert json_data["detail"] == "Invalid data"
        assert "timestamp" in json_data

    def test_error_response_json_mode(self):
        """ErrorResponse should serialize with JSON-compatible types."""
        response = ErrorResponse(
            status_code=400,
            message="Bad request",
        )
        json_str = response.model_dump_json()
        # Pydantic serializes without spaces after colons
        assert '"status_code":400' in json_str
        assert '"message":"Bad request"' in json_str


class TestErrorResponseFactoryMethods:
    """Tests for ErrorResponse factory class methods."""

    def test_bad_request_factory(self):
        """bad_request should create 400 error."""
        response = ErrorResponse.bad_request(
            message="Invalid input",
            detail="Field 'name' is required",
        )
        assert response.status_code == 400
        assert response.message == "Invalid input"
        assert response.detail == "Field 'name' is required"

    def test_bad_request_default_message(self):
        """bad_request should have default message."""
        response = ErrorResponse.bad_request()
        assert response.message == "Bad request"

    def test_unauthorized_factory(self):
        """unauthorized should create 401 error."""
        response = ErrorResponse.unauthorized(
            message="Token expired",
            request_id="req_123",
        )
        assert response.status_code == 401
        assert response.message == "Token expired"
        assert response.request_id == "req_123"

    def test_unauthorized_default_message(self):
        """unauthorized should have default message."""
        response = ErrorResponse.unauthorized()
        assert response.message == "Authentication required"

    def test_forbidden_factory(self):
        """forbidden should create 403 error."""
        response = ErrorResponse.forbidden(
            message="Admin access required",
            path="/api/v1/admin/users",
        )
        assert response.status_code == 403
        assert response.message == "Admin access required"
        assert response.path == "/api/v1/admin/users"

    def test_forbidden_default_message(self):
        """forbidden should have default message."""
        response = ErrorResponse.forbidden()
        assert response.message == "Access denied"

    def test_not_found_factory(self):
        """not_found should create 404 error."""
        response = ErrorResponse.not_found(
            message="Property not found",
            detail="No property with ID '123'",
        )
        assert response.status_code == 404
        assert response.message == "Property not found"

    def test_not_found_default_message(self):
        """not_found should have default message."""
        response = ErrorResponse.not_found()
        assert response.message == "Resource not found"

    def test_conflict_factory(self):
        """conflict should create 409 error."""
        response = ErrorResponse.conflict(
            message="Duplicate entry",
            detail="An organization with this name already exists",
        )
        assert response.status_code == 409
        assert response.message == "Duplicate entry"

    def test_conflict_default_message(self):
        """conflict should have default message."""
        response = ErrorResponse.conflict()
        assert response.message == "Resource conflict"

    def test_internal_error_factory(self):
        """internal_error should create 500 error."""
        response = ErrorResponse.internal_error(
            message="Database connection failed",
            request_id="req_xyz",
        )
        assert response.status_code == 500
        assert response.message == "Database connection failed"

    def test_internal_error_default_message(self):
        """internal_error should have default message."""
        response = ErrorResponse.internal_error()
        assert response.message == "Internal server error"


class TestValidationErrorResponseSchema:
    """Tests for ValidationErrorResponse schema."""

    def test_create_validation_error_response(self):
        """ValidationErrorResponse should accept errors list."""
        errors = [
            ErrorDetail(
                loc=["body", "email"],
                msg="Invalid email format",
                type="value_error.email",
            ),
            ErrorDetail(
                loc=["body", "name"],
                msg="Field required",
                type="value_error.missing",
            ),
        ]
        response = ValidationErrorResponse(errors=errors)
        assert response.status_code == 422
        assert response.message == "Validation failed"
        assert len(response.errors) == 2

    def test_validation_error_response_default_status_code(self):
        """ValidationErrorResponse should default to 422."""
        errors = [ErrorDetail(loc=["body", "x"], msg="Error", type="error")]
        response = ValidationErrorResponse(errors=errors)
        assert response.status_code == 422

    def test_validation_error_response_default_message(self):
        """ValidationErrorResponse should default to 'Validation failed'."""
        errors = [ErrorDetail(loc=["body", "x"], msg="Error", type="error")]
        response = ValidationErrorResponse(errors=errors)
        assert response.message == "Validation failed"

    def test_validation_error_response_requires_errors(self):
        """ValidationErrorResponse should require errors list."""
        with pytest.raises(ValidationError) as exc_info:
            ValidationErrorResponse()
        assert "errors" in str(exc_info.value)

    def test_validation_error_response_requires_non_empty_errors(self):
        """ValidationErrorResponse should require non-empty errors list."""
        with pytest.raises(ValidationError) as exc_info:
            ValidationErrorResponse(errors=[])
        assert "errors" in str(exc_info.value)

    def test_validation_error_from_errors_factory(self):
        """from_errors should create validation error response."""
        errors = [
            ErrorDetail(
                loc=["body", "age"], msg="Must be positive", type="value_error"
            ),
        ]
        response = ValidationErrorResponse.from_errors(
            errors=errors,
            request_id="req_123",
            path="/api/v1/users",
        )
        assert response.status_code == 422
        assert len(response.errors) == 1
        assert response.request_id == "req_123"
        assert response.path == "/api/v1/users"

    def test_validation_error_json_serialization(self):
        """ValidationErrorResponse should serialize correctly."""
        errors = [
            ErrorDetail(loc=["body", "email"], msg="Invalid", type="error"),
        ]
        response = ValidationErrorResponse(errors=errors)
        json_data = response.model_dump()
        assert json_data["status_code"] == 422
        assert json_data["message"] == "Validation failed"
        assert len(json_data["errors"]) == 1


class TestNotFoundErrorResponseSchema:
    """Tests for NotFoundErrorResponse schema."""

    def test_create_not_found_error_response(self):
        """NotFoundErrorResponse should work with minimal fields."""
        response = NotFoundErrorResponse()
        assert response.status_code == 404
        assert response.message == "Resource not found"

    def test_not_found_with_resource_info(self):
        """NotFoundErrorResponse should accept resource type and id."""
        response = NotFoundErrorResponse(
            resource_type="Property",
            resource_id="123e4567-e89b-12d3-a456-426614174000",
        )
        assert response.resource_type == "Property"
        assert response.resource_id == "123e4567-e89b-12d3-a456-426614174000"

    def test_not_found_for_resource_factory(self):
        """for_resource should create detailed not found error."""
        response = NotFoundErrorResponse.for_resource(
            resource_type="Lease",
            resource_id="abc-123",
            path="/api/v1/leases/abc-123",
        )
        assert response.status_code == 404
        assert response.message == "Lease not found"
        assert response.detail == "Lease with ID 'abc-123' not found"
        assert response.resource_type == "Lease"
        assert response.resource_id == "abc-123"
        assert response.path == "/api/v1/leases/abc-123"

    def test_not_found_json_serialization(self):
        """NotFoundErrorResponse should serialize correctly."""
        response = NotFoundErrorResponse.for_resource(
            resource_type="Unit",
            resource_id="unit-456",
        )
        json_data = response.model_dump()
        assert json_data["status_code"] == 404
        assert json_data["resource_type"] == "Unit"
        assert json_data["resource_id"] == "unit-456"


class TestHTTPResponseDefinitions:
    """Tests for HTTP response definitions used in OpenAPI docs."""

    def test_http_400_response_structure(self):
        """HTTP_400_RESPONSE should have correct structure."""
        assert "model" in HTTP_400_RESPONSE
        assert "description" in HTTP_400_RESPONSE
        assert HTTP_400_RESPONSE["model"] == ErrorResponse
        assert "Bad Request" in HTTP_400_RESPONSE["description"]

    def test_http_401_response_structure(self):
        """HTTP_401_RESPONSE should have correct structure."""
        assert HTTP_401_RESPONSE["model"] == ErrorResponse
        assert "Unauthorized" in HTTP_401_RESPONSE["description"]

    def test_http_403_response_structure(self):
        """HTTP_403_RESPONSE should have correct structure."""
        assert HTTP_403_RESPONSE["model"] == ErrorResponse
        assert "Forbidden" in HTTP_403_RESPONSE["description"]

    def test_http_404_response_structure(self):
        """HTTP_404_RESPONSE should use NotFoundErrorResponse."""
        assert HTTP_404_RESPONSE["model"] == NotFoundErrorResponse
        assert "Not Found" in HTTP_404_RESPONSE["description"]

    def test_http_409_response_structure(self):
        """HTTP_409_RESPONSE should have correct structure."""
        assert HTTP_409_RESPONSE["model"] == ErrorResponse
        assert "Conflict" in HTTP_409_RESPONSE["description"]

    def test_http_422_response_structure(self):
        """HTTP_422_RESPONSE should use ValidationErrorResponse."""
        assert HTTP_422_RESPONSE["model"] == ValidationErrorResponse
        assert "Validation Error" in HTTP_422_RESPONSE["description"]

    def test_http_500_response_structure(self):
        """HTTP_500_RESPONSE should have correct structure."""
        assert HTTP_500_RESPONSE["model"] == ErrorResponse
        assert "Internal Server Error" in HTTP_500_RESPONSE["description"]


class TestModuleImports:
    """Tests for module-level imports."""

    def test_import_error_detail_from_schemas(self):
        """ErrorDetail should be importable from app.schemas."""
        from app.schemas import ErrorDetail as ED

        assert ED is ErrorDetail

    def test_import_error_response_from_schemas(self):
        """ErrorResponse should be importable from app.schemas."""
        from app.schemas import ErrorResponse as ER

        assert ER is ErrorResponse

    def test_import_validation_error_from_schemas(self):
        """ValidationErrorResponse should be importable from app.schemas."""
        from app.schemas import ValidationErrorResponse as VER

        assert VER is ValidationErrorResponse

    def test_import_not_found_error_from_schemas(self):
        """NotFoundErrorResponse should be importable from app.schemas."""
        from app.schemas import NotFoundErrorResponse as NFER

        assert NFER is NotFoundErrorResponse

    def test_import_http_responses_from_schemas(self):
        """HTTP response constants should be importable from app.schemas."""
        from app.schemas import HTTP_400_RESPONSE as H400
        from app.schemas import HTTP_401_RESPONSE as H401
        from app.schemas import HTTP_403_RESPONSE as H403
        from app.schemas import HTTP_404_RESPONSE as H404
        from app.schemas import HTTP_409_RESPONSE as H409
        from app.schemas import HTTP_422_RESPONSE as H422
        from app.schemas import HTTP_500_RESPONSE as H500

        assert H400 is HTTP_400_RESPONSE
        assert H401 is HTTP_401_RESPONSE
        assert H403 is HTTP_403_RESPONSE
        assert H404 is HTTP_404_RESPONSE
        assert H409 is HTTP_409_RESPONSE
        assert H422 is HTTP_422_RESPONSE
        assert H500 is HTTP_500_RESPONSE


class TestOpenAPISchemaGeneration:
    """Tests for OpenAPI schema generation from error models."""

    def test_error_response_has_json_schema(self):
        """ErrorResponse should generate JSON schema."""
        schema = ErrorResponse.model_json_schema()
        assert "properties" in schema
        assert "status_code" in schema["properties"]
        assert "message" in schema["properties"]
        assert "timestamp" in schema["properties"]

    def test_error_detail_has_json_schema(self):
        """ErrorDetail should generate JSON schema."""
        schema = ErrorDetail.model_json_schema()
        assert "properties" in schema
        assert "loc" in schema["properties"]
        assert "msg" in schema["properties"]
        assert "type" in schema["properties"]

    def test_validation_error_has_json_schema(self):
        """ValidationErrorResponse should generate JSON schema."""
        schema = ValidationErrorResponse.model_json_schema()
        assert "properties" in schema
        assert "errors" in schema["properties"]

    def test_not_found_error_has_json_schema(self):
        """NotFoundErrorResponse should generate JSON schema."""
        schema = NotFoundErrorResponse.model_json_schema()
        assert "properties" in schema
        assert "resource_type" in schema["properties"]
        assert "resource_id" in schema["properties"]

    def test_error_response_schema_has_examples(self):
        """ErrorResponse should have example in schema config."""
        config = ErrorResponse.model_config
        assert "json_schema_extra" in config
        example = config["json_schema_extra"]["example"]
        assert "status_code" in example
        assert "message" in example

    def test_validation_error_schema_has_examples(self):
        """ValidationErrorResponse should have example in schema config."""
        config = ValidationErrorResponse.model_config
        assert "json_schema_extra" in config
        example = config["json_schema_extra"]["example"]
        assert example["status_code"] == 422
        assert "errors" in example
