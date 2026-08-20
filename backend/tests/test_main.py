"""Tests for FastAPI application main module."""

from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app, create_app

# Reusable mock for run_health_checks returning a healthy response.
_HEALTHY_RESPONSE = (
    {
        "status": "healthy",
        "version": "0.1.0",
        "environment": "development",
        "timestamp": "2026-01-01T00:00:00+00:00",
        "checks": {
            "database": {"status": "healthy", "latency_ms": 5},
            "storage": {"status": "healthy"},
            "document_reader": {"status": "healthy"},
            "payments": {"status": "healthy"},
            "email": {"status": "healthy"},
        },
    },
    200,
)


class TestAppCreation:
    """Test suite for application factory."""

    def test_create_app_returns_fastapi_instance(self) -> None:
        """Test that create_app returns a FastAPI instance."""
        test_app = create_app()

        assert isinstance(test_app, FastAPI)

    def test_app_has_correct_title(self) -> None:
        """Test that app has the correct title."""
        test_app = create_app()

        assert test_app.title == "CapVeri API"

    def test_app_has_correct_description(self) -> None:
        """Test that app has the correct description."""
        test_app = create_app()

        assert "CRE FinOps" in test_app.description

    def test_app_has_version(self) -> None:
        """Test that app has a version set."""
        test_app = create_app()

        assert test_app.version is not None
        assert test_app.version == "0.1.0"

    def test_global_app_instance_exists(self) -> None:
        """Test that the global app instance is created."""
        assert app is not None
        assert isinstance(app, FastAPI)


class TestHealthEndpoint:
    """Test suite for health check endpoint."""

    def test_health_endpoint_returns_200(self) -> None:
        """Test that /health returns 200 OK when all checks pass."""
        with patch(
            "app.main.run_health_checks",
            new_callable=AsyncMock,
            return_value=_HEALTHY_RESPONSE,
        ):
            client = TestClient(app)
            response = client.get("/health")

        assert response.status_code == 200

    def test_health_endpoint_has_noindex_header(self) -> None:
        """Test that /health is reachable but not indexable."""
        with patch(
            "app.main.run_health_checks",
            new_callable=AsyncMock,
            return_value=_HEALTHY_RESPONSE,
        ):
            client = TestClient(app)
            response = client.get("/health")

        assert response.status_code == 200
        assert response.headers["X-Robots-Tag"] == "noindex, nofollow"

    def test_health_endpoint_returns_healthy_status(self) -> None:
        """Test that /health returns healthy status."""
        with patch(
            "app.main.run_health_checks",
            new_callable=AsyncMock,
            return_value=_HEALTHY_RESPONSE,
        ):
            client = TestClient(app)
            response = client.get("/health")
            data = response.json()

        assert data["status"] == "healthy"

    def test_health_endpoint_returns_version(self) -> None:
        """Test that /health returns version info."""
        with patch(
            "app.main.run_health_checks",
            new_callable=AsyncMock,
            return_value=_HEALTHY_RESPONSE,
        ):
            client = TestClient(app)
            response = client.get("/health")
            data = response.json()

        assert "version" in data
        assert data["version"] == "0.1.0"

    def test_health_endpoint_returns_environment(self) -> None:
        """Test that /health returns environment info."""
        with patch(
            "app.main.run_health_checks",
            new_callable=AsyncMock,
            return_value=_HEALTHY_RESPONSE,
        ):
            client = TestClient(app)
            response = client.get("/health")
            data = response.json()

        assert "environment" in data
        assert data["environment"] == "development"

    def test_health_endpoint_json_structure(self) -> None:
        """Test that /health returns expected JSON structure including checks."""
        with patch(
            "app.main.run_health_checks",
            new_callable=AsyncMock,
            return_value=_HEALTHY_RESPONSE,
        ):
            client = TestClient(app)
            response = client.get("/health")
            data = response.json()

        assert {"status", "version", "environment", "timestamp", "checks"}.issubset(
            data.keys()
        )
        assert set(data["checks"].keys()) == {
            "database",
            "storage",
            "document_reader",
            "payments",
            "email",
        }

    def test_health_version_endpoint_returns_build_metadata(self) -> None:
        """Test that /health.version exposes public deployment metadata."""
        with patch.dict("os.environ", {"CAPVERI_BUILD_COMMIT": "abc123"}):
            client = TestClient(app)
            response = client.get("/health.version")

        assert response.status_code == 200
        assert response.json() == {
            "version": "0.1.0",
            "environment": "development",
            "commit": "abc123",
        }

    def test_health_version_endpoint_has_noindex_header(self) -> None:
        """Test that /health.version is reachable but not indexable."""
        client = TestClient(app)
        response = client.get("/health.version")

        assert response.status_code == 200
        assert response.headers["X-Robots-Tag"] == "noindex, nofollow"

    def test_health_version_reads_railway_commit_metadata(self) -> None:
        """Test that Railway's deployment commit variable is exposed."""
        with patch.dict(
            "os.environ",
            {
                "CAPVERI_BUILD_COMMIT": "",
                "RAILWAY_GIT_COMMIT_SHA": "railway123",
            },
        ):
            client = TestClient(app)
            response = client.get("/health.version")

        assert response.status_code == 200
        assert response.json()["commit"] == "railway123"


class TestOpenAPIDocs:
    """Test suite for OpenAPI documentation endpoints."""

    def test_docs_endpoint_available_in_debug_mode(self) -> None:
        """Test that /docs is available when debug is True."""
        # Default is debug=True
        client = TestClient(app)

        response = client.get("/docs")

        # Should return 200 (HTML page) or redirect
        assert response.status_code in [200, 307]

    def test_redoc_endpoint_available_in_debug_mode(self) -> None:
        """Test that /redoc is available when debug is True."""
        client = TestClient(app)

        response = client.get("/redoc")

        assert response.status_code in [200, 307]

    def test_openapi_json_available(self) -> None:
        """Test that OpenAPI JSON schema is available."""
        client = TestClient(app)

        response = client.get("/openapi.json")

        assert response.status_code == 200
        data = response.json()
        assert "openapi" in data
        assert "info" in data
        assert data["info"]["title"] == "CapVeri API"

    def test_openapi_json_has_noindex_header(self) -> None:
        """Test that /openapi.json is reachable but not indexable."""
        client = TestClient(app)

        response = client.get("/openapi.json")

        assert response.status_code == 200
        assert response.headers["X-Robots-Tag"] == "noindex, nofollow"

    def test_docs_disabled_in_production(self) -> None:
        """Test that /docs is disabled when debug is False."""
        with patch("app.main.settings") as mock_settings:
            mock_settings.debug = False
            mock_settings.app_version = "0.1.0"
            mock_settings.cors_origins = ["http://localhost:5173"]
            mock_settings.environment = "production"

            test_app = create_app()
            client = TestClient(test_app)

            response = client.get("/docs")

            assert response.status_code == 404

    def test_redoc_disabled_in_production(self) -> None:
        """Test that /redoc is disabled when debug is False."""
        with patch("app.main.settings") as mock_settings:
            mock_settings.debug = False
            mock_settings.app_version = "0.1.0"
            mock_settings.cors_origins = ["http://localhost:5173"]
            mock_settings.environment = "production"

            test_app = create_app()
            client = TestClient(test_app)

            response = client.get("/redoc")

            assert response.status_code == 404


class TestCORS:
    """Test suite for CORS configuration."""

    def test_cors_allows_configured_origin(self) -> None:
        """Test that CORS allows configured frontend origin."""
        client = TestClient(app)

        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

        assert (
            response.headers.get("access-control-allow-origin")
            == "http://localhost:5173"
        )

    def test_cors_allows_localhost_3000(self) -> None:
        """Test that CORS allows localhost:3000."""
        client = TestClient(app)

        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

        assert (
            response.headers.get("access-control-allow-origin")
            == "http://localhost:3000"
        )

    def test_cors_allows_credentials(self) -> None:
        """Test that CORS allows credentials."""
        client = TestClient(app)

        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

        assert response.headers.get("access-control-allow-credentials") == "true"

    def test_cors_allows_all_methods(self) -> None:
        """Test that CORS allows all HTTP methods."""
        client = TestClient(app)

        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )

        # Should allow POST method
        allow_methods = response.headers.get("access-control-allow-methods", "")
        assert "POST" in allow_methods or "*" in allow_methods

    def test_cors_rejects_unknown_origin(self) -> None:
        """Test that CORS rejects unconfigured origins."""
        client = TestClient(app)

        response = client.options(
            "/health",
            headers={
                "Origin": "http://malicious-site.com",
                "Access-Control-Request-Method": "GET",
            },
        )

        # Should not include the malicious origin in allowed origins
        allowed_origin = response.headers.get("access-control-allow-origin")
        assert allowed_origin != "http://malicious-site.com"

    def test_production_cors_allows_app_origin_for_billing_trial_routes(self) -> None:
        """Production app origin must be allowed on billing activation endpoints."""
        with patch("app.main.settings") as mock_settings:
            mock_settings.debug = False
            mock_settings.app_version = "0.1.0"
            mock_settings.cors_origins = ["https://app.capveri.com"]
            mock_settings.environment = "production"

            test_app = create_app()
            client = TestClient(test_app)

            for path in [
                "/api/v1/billing/checkout",
                "/api/v1/billing/trial/start",
            ]:
                response = client.options(
                    path,
                    headers={
                        "Origin": "https://app.capveri.com",
                        "Access-Control-Request-Method": "POST",
                    },
                )

                assert (
                    response.headers.get("access-control-allow-origin")
                    == "https://app.capveri.com"
                )


class TestAPIRouter:
    """Test suite for API router configuration."""

    def test_api_v1_prefix_exists(self) -> None:
        """Test that /api/v1 prefix is configured."""
        client = TestClient(app)

        # The router is empty but should not 404 on the prefix
        # Empty router returns 404 for any specific route but prefix is valid
        response = client.get("/api/v1/nonexistent")

        # 404 is expected since no routes are defined yet
        # But the prefix itself should be recognized (not 405 Method Not Allowed)
        assert response.status_code == 404

    def test_openapi_includes_health_endpoint(self) -> None:
        """Test that OpenAPI spec includes health endpoint."""
        client = TestClient(app)

        response = client.get("/openapi.json")
        data = response.json()

        assert "/health" in data["paths"]
        assert "get" in data["paths"]["/health"]


class TestLifespan:
    """Test suite for application lifespan."""

    def test_lifespan_resets_db_clients_on_startup(self) -> None:
        """Test that lifespan resets Supabase clients during startup."""
        with (
            patch(
                "app.main.run_health_checks",
                new_callable=AsyncMock,
                return_value=_HEALTHY_RESPONSE,
            ),
            patch(
                "app.database.client.SupabaseClientManager.reset_clients"
            ) as mock_reset,
        ):
            with TestClient(app) as client:
                client.get("/health")

        mock_reset.assert_called_once()

    def test_lifespan_shuts_down_without_error(self) -> None:
        """Test that the app exits the lifespan context manager cleanly."""
        with patch(
            "app.main.run_health_checks",
            new_callable=AsyncMock,
            return_value=_HEALTHY_RESPONSE,
        ):
            with TestClient(app):
                pass  # context exit triggers shutdown; no exception = success


class TestCORSExposeHeaders:
    """CORS expose_headers must include Content-Disposition in both environments."""

    def test_dev_cors_exposes_content_disposition(self) -> None:
        """Development CORS middleware exposes Content-Disposition."""
        # The global `app` is created in development mode (settings.environment ==
        # "development").  Verify the CORS middleware was registered with the
        # Content-Disposition expose header by inspecting the middleware stack.
        from fastapi.middleware.cors import CORSMiddleware as _CORSMiddleware

        found = False
        for middleware in app.user_middleware:
            if middleware.cls is _CORSMiddleware:
                expose = middleware.kwargs.get("expose_headers", [])
                if "Content-Disposition" in expose:
                    found = True
                    break
        assert found, (
            "CORSMiddleware must expose Content-Disposition so cross-origin "
            "file downloads can read the server-provided filename."
        )

    def test_prod_cors_exposes_content_disposition(self) -> None:
        """Production CORS middleware exposes Content-Disposition."""
        with patch("app.main.settings") as mock_settings:
            mock_settings.debug = False
            mock_settings.app_version = "0.1.0"
            mock_settings.cors_origins = ["https://app.capveri.com"]
            mock_settings.environment = "production"

            from fastapi.middleware.cors import CORSMiddleware as _CORSMiddleware

            from app.main import create_app

            prod_app = create_app()

        found = False
        for middleware in prod_app.user_middleware:
            if middleware.cls is _CORSMiddleware:
                expose = middleware.kwargs.get("expose_headers", [])
                if "Content-Disposition" in expose:
                    found = True
                    break
        assert found, "Production CORSMiddleware must also expose Content-Disposition."
