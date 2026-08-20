"""
Tests for API router structure (Story 4.5).

Verifies that all routers are properly configured with correct
prefixes, tags, and OpenAPI documentation.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import router as api_router
from app.api.v1 import ingestion, leases, properties
from app.api.v1 import router as v1_router
from app.api.v1 import units
from app.main import app, create_app


class TestRouterModuleImports:
    """Test that all router modules are properly importable."""

    def test_api_router_importable(self):
        """The main API router should be importable."""
        assert api_router is not None

    def test_v1_router_importable(self):
        """The v1 router should be importable."""
        assert v1_router is not None

    def test_properties_router_importable(self):
        """The properties router should be importable."""
        assert properties.router is not None

    def test_units_router_importable(self):
        """The units router should be importable."""
        assert units.router is not None

    def test_leases_router_importable(self):
        """The leases router should be importable."""
        assert leases.router is not None

    def test_ingestion_router_importable(self):
        """The ingestion router should be importable."""
        assert ingestion.router is not None


class TestRouterConfiguration:
    """Test that routers are configured correctly."""

    def test_v1_router_includes_properties(self):
        """V1 router should include properties router."""
        routes = [route.path for route in v1_router.routes]
        assert any("/properties" in route for route in routes)

    def test_v1_router_includes_units(self):
        """V1 router should include units router (nested under properties)."""
        routes = [route.path for route in v1_router.routes]
        assert any("/properties/{property_id}/units" in route for route in routes)

    def test_v1_router_includes_leases(self):
        """V1 router should include leases router."""
        routes = [route.path for route in v1_router.routes]
        assert any("/leases" in route for route in routes)

    def test_v1_router_includes_ingestion(self):
        """V1 router should include ingestion router."""
        routes = [route.path for route in v1_router.routes]
        assert any("/ingestion" in route for route in routes)


class TestPropertiesRouterEndpoints:
    """Test that properties router has all expected endpoints."""

    def test_list_properties_endpoint_exists(self):
        """GET /properties endpoint should exist."""
        routes = [(r.path, r.methods) for r in properties.router.routes]
        assert ("", {"GET"}) in routes or ("/", {"GET"}) in routes

    def test_get_property_endpoint_exists(self):
        """GET /properties/{property_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in properties.router.routes]
        assert ("/{property_id}", {"GET"}) in routes

    def test_create_property_endpoint_exists(self):
        """POST /properties endpoint should exist."""
        routes = [(r.path, r.methods) for r in properties.router.routes]
        assert ("", {"POST"}) in routes or ("/", {"POST"}) in routes

    def test_update_property_endpoint_exists(self):
        """PUT /properties/{property_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in properties.router.routes]
        assert ("/{property_id}", {"PUT"}) in routes

    def test_delete_property_endpoint_exists(self):
        """DELETE /properties/{property_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in properties.router.routes]
        assert ("/{property_id}", {"DELETE"}) in routes


class TestUnitsRouterEndpoints:
    """Test that units router has all expected endpoints."""

    def test_list_units_endpoint_exists(self):
        """GET / (units list) endpoint should exist."""
        routes = [(r.path, r.methods) for r in units.router.routes]
        assert ("", {"GET"}) in routes or ("/", {"GET"}) in routes

    def test_get_unit_endpoint_exists(self):
        """GET /{unit_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in units.router.routes]
        assert ("/{unit_id}", {"GET"}) in routes

    def test_create_unit_endpoint_exists(self):
        """POST / endpoint should exist."""
        routes = [(r.path, r.methods) for r in units.router.routes]
        assert ("", {"POST"}) in routes or ("/", {"POST"}) in routes

    def test_update_unit_endpoint_exists(self):
        """PUT /{unit_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in units.router.routes]
        assert ("/{unit_id}", {"PUT"}) in routes

    def test_delete_unit_endpoint_exists(self):
        """DELETE /{unit_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in units.router.routes]
        assert ("/{unit_id}", {"DELETE"}) in routes


class TestLeasesRouterEndpoints:
    """Test that leases router has all expected endpoints."""

    def test_list_leases_endpoint_exists(self):
        """GET /leases endpoint should exist."""
        routes = [(r.path, r.methods) for r in leases.router.routes]
        assert ("", {"GET"}) in routes or ("/", {"GET"}) in routes

    def test_get_lease_endpoint_exists(self):
        """GET /leases/{lease_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in leases.router.routes]
        assert ("/{lease_id}", {"GET"}) in routes

    def test_create_lease_endpoint_exists(self):
        """POST /leases endpoint should exist."""
        routes = [(r.path, r.methods) for r in leases.router.routes]
        assert ("", {"POST"}) in routes or ("/", {"POST"}) in routes

    def test_update_lease_endpoint_exists(self):
        """PUT /leases/{lease_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in leases.router.routes]
        assert ("/{lease_id}", {"PUT"}) in routes

    def test_delete_lease_endpoint_exists(self):
        """DELETE /leases/{lease_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in leases.router.routes]
        assert ("/{lease_id}", {"DELETE"}) in routes

    def test_get_recovery_profile_endpoint_exists(self):
        """GET /leases/{lease_id}/recovery-profile endpoint should exist."""
        routes = [(r.path, r.methods) for r in leases.router.routes]
        assert ("/{lease_id}/recovery-profile", {"GET"}) in routes

    def test_update_recovery_profile_endpoint_exists(self):
        """PUT /leases/{lease_id}/recovery-profile endpoint should exist."""
        routes = [(r.path, r.methods) for r in leases.router.routes]
        assert ("/{lease_id}/recovery-profile", {"PUT"}) in routes


class TestIngestionRouterEndpoints:
    """Test that ingestion router has all expected endpoints."""

    def test_upload_file_endpoint_exists(self):
        """POST /ingestion/upload endpoint should exist."""
        routes = [(r.path, r.methods) for r in ingestion.router.routes]
        assert ("/upload", {"POST"}) in routes

    def test_list_batches_endpoint_exists(self):
        """GET /ingestion/batches endpoint should exist."""
        routes = [(r.path, r.methods) for r in ingestion.router.routes]
        assert ("/batches", {"GET"}) in routes

    def test_get_batch_endpoint_exists(self):
        """GET /ingestion/batches/{batch_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in ingestion.router.routes]
        assert ("/batches/{batch_id}", {"GET"}) in routes

    def test_retry_batch_endpoint_exists(self):
        """POST /ingestion/batches/{batch_id}/retry endpoint should exist."""
        routes = [(r.path, r.methods) for r in ingestion.router.routes]
        assert ("/batches/{batch_id}/retry", {"POST"}) in routes

    def test_delete_batch_endpoint_exists(self):
        """DELETE /ingestion/batches/{batch_id} endpoint should exist."""
        routes = [(r.path, r.methods) for r in ingestion.router.routes]
        assert ("/batches/{batch_id}", {"DELETE"}) in routes

    def test_list_mappings_endpoint_exists(self):
        """GET /ingestion/mappings endpoint should exist."""
        routes = [(r.path, r.methods) for r in ingestion.router.routes]
        assert ("/mappings", {"GET"}) in routes

    def test_create_mapping_endpoint_exists(self):
        """POST /ingestion/mappings endpoint should exist."""
        routes = [(r.path, r.methods) for r in ingestion.router.routes]
        assert ("/mappings", {"POST"}) in routes


class TestOpenAPIDocumentation:
    """Test that OpenAPI documentation is properly generated."""

    @pytest.fixture
    def client(self):
        """Create test client with debug enabled for docs."""
        test_app = FastAPI(
            title="Test API",
            docs_url="/docs",
            redoc_url="/redoc",
        )
        test_app.include_router(api_router, prefix="/api/v1")
        return TestClient(test_app)

    def test_openapi_schema_generated(self, client):
        """OpenAPI schema should be generated."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        schema = response.json()
        assert "openapi" in schema
        assert "paths" in schema

    def test_openapi_has_properties_endpoints(self, client):
        """OpenAPI should document properties endpoints."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]
        assert "/api/v1/properties" in paths
        assert "/api/v1/properties/{property_id}" in paths

    def test_openapi_has_units_endpoints(self, client):
        """OpenAPI should document units endpoints."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]
        assert "/api/v1/properties/{property_id}/units" in paths
        assert "/api/v1/properties/{property_id}/units/{unit_id}" in paths

    def test_openapi_has_leases_endpoints(self, client):
        """OpenAPI should document leases endpoints."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]
        assert "/api/v1/leases" in paths
        assert "/api/v1/leases/{lease_id}" in paths
        assert "/api/v1/leases/{lease_id}/recovery-profile" in paths

    def test_openapi_has_ingestion_endpoints(self, client):
        """OpenAPI should document ingestion endpoints."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]
        assert "/api/v1/ingestion/upload" in paths
        assert "/api/v1/ingestion/batches" in paths
        assert "/api/v1/ingestion/batches/{batch_id}" in paths

    def test_openapi_has_tags(self, client):
        """OpenAPI should have tags for organization."""
        response = client.get("/openapi.json")
        schema = response.json()
        # Check that endpoints have tags
        paths = schema["paths"]

        # Properties endpoints should have Properties tag
        properties_path = paths.get("/api/v1/properties", {})
        if "get" in properties_path:
            assert "Properties" in properties_path["get"].get("tags", [])

        # Leases endpoints should have Leases tag
        leases_path = paths.get("/api/v1/leases", {})
        if "get" in leases_path:
            assert "Leases" in leases_path["get"].get("tags", [])

    def test_openapi_properties_tag_present(self, client):
        """Properties tag should be in OpenAPI spec."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]
        props_path = paths["/api/v1/properties"]
        assert "Properties" in props_path["get"]["tags"]

    def test_openapi_units_tag_present(self, client):
        """Units tag should be in OpenAPI spec."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]
        units_path = paths["/api/v1/properties/{property_id}/units"]
        assert "Units" in units_path["get"]["tags"]

    def test_openapi_leases_tag_present(self, client):
        """Leases tag should be in OpenAPI spec."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]
        leases_path = paths["/api/v1/leases"]
        assert "Leases" in leases_path["get"]["tags"]

    def test_openapi_ingestion_tag_present(self, client):
        """Data Ingestion tag should be in OpenAPI spec."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]
        ingestion_path = paths["/api/v1/ingestion/upload"]
        assert "Data Ingestion" in ingestion_path["post"]["tags"]


class TestAPIVersionPrefix:
    """Test that API version prefix is correctly applied."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        test_app = FastAPI()
        test_app.include_router(api_router, prefix="/api/v1")
        return TestClient(test_app)

    def test_v1_prefix_on_properties(self, client):
        """Properties should be under /api/v1/properties."""
        response = client.get("/openapi.json")
        schema = response.json()
        assert "/api/v1/properties" in schema["paths"]

    def test_v1_prefix_on_leases(self, client):
        """Leases should be under /api/v1/leases."""
        response = client.get("/openapi.json")
        schema = response.json()
        assert "/api/v1/leases" in schema["paths"]

    def test_v1_prefix_on_ingestion(self, client):
        """Ingestion should be under /api/v1/ingestion."""
        response = client.get("/openapi.json")
        schema = response.json()
        assert "/api/v1/ingestion/upload" in schema["paths"]

    def test_no_routes_without_prefix(self, client):
        """No routes should exist without /api/v1 prefix."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]
        for path in paths:
            if path != "/openapi.json":
                assert path.startswith("/api/v1")


class TestMainAppIntegration:
    """Test that main app integrates routers correctly."""

    @pytest.fixture
    def client(self):
        """Create test client from main app."""
        return TestClient(app)

    def test_health_endpoint_works(self, client):
        """Health check should still work."""
        mock_body = {"status": "healthy", "checks": {}}
        with patch("app.main.run_health_checks", new_callable=AsyncMock) as mock_health:
            mock_health.return_value = (mock_body, 200)
            response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_properties_route_registered(self, client):
        """Properties route should be registered in main app."""
        # This will return 401 because auth is required, but route exists
        response = client.get("/api/v1/properties")
        # Should not be 404 (route not found)
        assert response.status_code != 404

    def test_leases_route_registered(self, client):
        """Leases route should be registered in main app."""
        response = client.get("/api/v1/leases")
        assert response.status_code != 404

    def test_ingestion_route_registered(self, client):
        """Ingestion route should be registered in main app."""
        response = client.get("/api/v1/ingestion/batches")
        assert response.status_code != 404


class TestAPIDepsDependencies:
    """Test the common API dependencies module."""

    def test_current_user_reexported(self):
        """CurrentUser should be re-exported from deps."""
        from app.api.deps import CurrentUser

        assert CurrentUser is not None

    def test_current_active_user_reexported(self):
        """CurrentActiveUser should be re-exported from deps."""
        from app.api.deps import CurrentActiveUser

        assert CurrentActiveUser is not None

    def test_current_admin_user_reexported(self):
        """CurrentAdminUser should be re-exported from deps."""
        from app.api.deps import CurrentAdminUser

        assert CurrentAdminUser is not None

    def test_org_context_reexported(self):
        """OrgContext should be re-exported from deps."""
        from app.api.deps import OrgContext

        assert OrgContext is not None

    def test_organization_context_reexported(self):
        """OrganizationContext should be re-exported from deps."""
        from app.api.deps import OrganizationContext

        assert OrganizationContext is not None

    def test_pagination_params_function(self):
        """pagination_params should return skip and limit."""
        from app.api.deps import pagination_params

        result = pagination_params()
        assert result == {"skip": 0, "limit": 20}

    def test_pagination_params_custom_values(self):
        """pagination_params should accept custom values."""
        from app.api.deps import pagination_params

        result = pagination_params(skip=10, limit=50)
        assert result == {"skip": 10, "limit": 50}


class TestCreateAppFactory:
    """Test the create_app factory function."""

    def test_create_app_returns_fastapi_instance(self):
        """create_app should return a FastAPI instance."""
        test_app = create_app()
        assert isinstance(test_app, FastAPI)

    def test_create_app_includes_api_routes(self):
        """create_app should include API routes."""
        test_app = create_app()
        route_paths = [route.path for route in test_app.routes]
        assert any("/api/v1/properties" in path for path in route_paths)

    def test_create_app_includes_health_check(self):
        """create_app should include health check endpoint."""
        test_app = create_app()
        route_paths = [route.path for route in test_app.routes]
        assert "/health" in route_paths
