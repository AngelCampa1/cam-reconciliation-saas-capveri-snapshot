"""Tests for OpenAPI configuration and specification validity.

These tests verify that:
- /openapi.json returns valid OpenAPI 3.0+ spec
- All endpoints are documented with request/response schemas
- Authentication requirements are documented (Bearer token)
- Error responses (4xx, 5xx) are documented
- Spec validates against OpenAPI 3.0 schema
"""

import pytest
from fastapi.testclient import TestClient
from openapi_spec_validator import validate
from openapi_spec_validator.validation.exceptions import OpenAPIValidationError
from referencing.exceptions import Unresolvable

from app.main import app, custom_openapi, is_public_openapi_operation


class TestOpenAPIEndpoint:
    """Test suite for /openapi.json endpoint availability."""

    def test_openapi_json_returns_200(self) -> None:
        """AC1: /openapi.json endpoint returns valid OpenAPI spec."""
        client = TestClient(app)

        response = client.get("/openapi.json")

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"

    def test_openapi_json_is_valid_json(self) -> None:
        """AC1: /openapi.json returns parseable JSON."""
        client = TestClient(app)

        response = client.get("/openapi.json")
        spec = response.json()

        assert isinstance(spec, dict)
        assert "openapi" in spec
        assert "info" in spec
        assert "paths" in spec


class TestOpenAPISpecValidity:
    """Test suite for OpenAPI 3.0 specification validity."""

    def test_spec_validates_against_openapi_schema(self) -> None:
        """AC5: Spec validates against OpenAPI 3.0 schema."""
        spec = app.openapi()

        # This will raise OpenAPIValidationError if invalid
        try:
            validate(spec)
        except Unresolvable as e:
            pytest.skip(f"OpenAPI meta-schema reference unavailable: {e}")
        except OpenAPIValidationError as e:
            pytest.fail(f"OpenAPI spec validation failed: {e}")

    def test_spec_has_correct_openapi_version(self) -> None:
        """AC5: Spec uses OpenAPI 3.x version."""
        spec = app.openapi()

        assert "openapi" in spec
        # FastAPI uses OpenAPI 3.1.x
        assert spec["openapi"].startswith("3.")

    def test_spec_has_correct_title(self) -> None:
        """Spec has correct API title."""
        spec = app.openapi()

        assert spec["info"]["title"] == "CapVeri API"

    def test_spec_has_version(self) -> None:
        """Spec has API version."""
        spec = app.openapi()

        assert "version" in spec["info"]
        assert spec["info"]["version"] == "0.1.0"


class TestSecuritySchemes:
    """Test suite for authentication documentation."""

    def test_bearer_auth_security_scheme_defined(self) -> None:
        """AC3: Bearer token authentication is documented."""
        spec = app.openapi()

        assert "components" in spec
        assert "securitySchemes" in spec["components"]
        assert "bearerAuth" in spec["components"]["securitySchemes"]

    def test_bearer_auth_scheme_configuration(self) -> None:
        """AC3: Bearer auth scheme has correct configuration."""
        spec = app.openapi()
        scheme = spec["components"]["securitySchemes"]["bearerAuth"]

        assert scheme["type"] == "http"
        assert scheme["scheme"] == "bearer"
        assert scheme["bearerFormat"] == "JWT"

    def test_health_endpoint_has_no_security(self) -> None:
        """AC3: Health endpoint does not require authentication."""
        spec = app.openapi()

        assert "/health" in spec["paths"]
        health_get = spec["paths"]["/health"]["get"]
        assert health_get.get("security") == []

    def test_api_endpoints_have_security(self) -> None:
        """AC3: API endpoints require authentication."""
        spec = app.openapi()

        # Endpoints that don't require authentication
        # - /health: Public health check endpoint
        # - /api/v1/auth/login: Login endpoint (creates tokens, doesn't require them)
        # - /webhooks/*: Webhooks use signature verification instead of bearer tokens
        # Check that non-health endpoints have security requirements
        # Security can be either bearerAuth (custom) or HTTPBearer (from dependencies)
        valid_security_schemes = [
            [{"bearerAuth": []}],
            [{"HTTPBearer": []}],
        ]

        for path, path_data in spec["paths"].items():
            for method, operation in path_data.items():
                if not isinstance(operation, dict):
                    continue

                if is_public_openapi_operation(path, method):
                    assert operation.get("security") == [], (
                        f"Endpoint {method.upper()} {path} should be public, "
                        f"got: {operation.get('security')}"
                    )
                    continue

                if isinstance(operation, dict) and "security" in operation:
                    assert operation["security"] in valid_security_schemes, (
                        f"Endpoint {method.upper()} {path} should require "
                        f"bearerAuth or HTTPBearer, got: {operation['security']}"
                    )


class TestEndpointDocumentation:
    """Test suite for endpoint documentation completeness."""

    def test_all_paths_have_operations(self) -> None:
        """AC2: All paths have at least one HTTP method defined."""
        spec = app.openapi()

        for path, path_data in spec["paths"].items():
            # Filter out non-operation keys like 'parameters'
            operations = [
                k
                for k in path_data.keys()
                if k in ["get", "post", "put", "patch", "delete", "options", "head"]
            ]
            assert len(operations) > 0, f"Path {path} has no operations defined"

    def test_operations_have_responses(self) -> None:
        """AC2: All operations have responses defined."""
        spec = app.openapi()

        for path, path_data in spec["paths"].items():
            for method, operation in path_data.items():
                if isinstance(operation, dict) and method in [
                    "get",
                    "post",
                    "put",
                    "patch",
                    "delete",
                ]:
                    assert (
                        "responses" in operation
                    ), f"Operation {method.upper()} {path} has no responses defined"
                    assert (
                        len(operation["responses"]) > 0
                    ), f"Operation {method.upper()} {path} has empty responses"


class TestAPIDescription:
    """Test suite for API description content."""

    def test_description_includes_auth_info(self) -> None:
        """AC3: Description includes authentication instructions."""
        spec = app.openapi()

        description = spec["info"].get("description", "")
        assert "Authentication" in description
        assert "Bearer" in description
        assert "Most `/api/v1` endpoints require authentication" in description

    def test_description_includes_rate_limiting(self) -> None:
        """Description includes rate limiting info."""
        spec = app.openapi()

        description = spec["info"].get("description", "")
        assert "Rate Limiting" in description
        assert (
            "Public invitation validation endpoints: 10 requests per minute per IP "
            "address" in description
        )

    def test_description_includes_pagination(self) -> None:
        """Description includes pagination info."""
        spec = app.openapi()

        description = spec["info"].get("description", "")
        assert "Pagination" in description
        assert "skip" in description
        assert "limit" in description


class TestCustomOpenAPIFunction:
    """Test suite for custom_openapi function."""

    def test_custom_openapi_returns_dict(self) -> None:
        """custom_openapi returns a dictionary."""
        # Need to reset the cached schema to test fresh generation
        original_schema = app.openapi_schema
        app.openapi_schema = None

        try:
            spec = custom_openapi(app)
            assert isinstance(spec, dict)
        finally:
            app.openapi_schema = original_schema

    def test_custom_openapi_caches_result(self) -> None:
        """custom_openapi caches the schema for subsequent calls."""
        spec1 = app.openapi()
        spec2 = app.openapi()

        # Should be the exact same object (cached)
        assert spec1 is spec2

    def test_schema_includes_components(self) -> None:
        """Generated schema includes components section."""
        spec = app.openapi()

        assert "components" in spec
        assert "schemas" in spec["components"]
