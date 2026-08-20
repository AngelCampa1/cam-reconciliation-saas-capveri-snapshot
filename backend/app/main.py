"""
CapVeri FastAPI Application.
Main entry point for the backend API.
"""

import asyncio
import logging
import os
import time
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from starlette.responses import Response

from app.config import settings
from app.core.logging import configure_logging
from app.core.sentry import init_sentry
from app.exceptions import (
    register_custom_exception_handlers,
    register_exception_handlers,
)
from app.middleware import CorrelationIdMiddleware, RateLimitMiddleware
from app.services.analytics.api_usage import (
    capture_api_request_event,
    should_track_api_request,
)
from app.services.health import run_health_checks

# Initialize logging before anything else
configure_logging(
    log_level=settings.log_level,
    log_format=settings.log_format,
)

logger = logging.getLogger(__name__)

PUBLIC_PREFIX_PATHS = (
    "/api/v1/leads/",
    "/api/v1/tools/",
)

NOINDEX_PATHS = frozenset(("/openapi.json", "/health", "/health.version"))


def is_public_openapi_operation(path: str, method: str) -> bool:
    """Return True when an endpoint should be documented without bearer auth."""
    method = method.lower()

    if path in {"/health", "/health.version"}:
        return True

    if path in {"/webhooks/stripe", "/webhooks/resend"}:
        return True

    if path.startswith(PUBLIC_PREFIX_PATHS):
        return True

    if path == "/api/v1/auth/login" and method == "post":
        return True

    if path == "/api/v1/audit-requests" and method == "post":
        return True

    if path == "/api/v1/contact-requests" and method == "post":
        return True

    if path == "/api/v1/team/signup" and method == "post":
        return True

    if path == "/api/v1/tenant/signup" and method == "post":
        return True

    if path == "/api/v1/team/invitations/{token}/validate" and method == "get":
        return True

    if path == "/api/v1/tenant/invitations/{token}/validate" and method == "get":
        return True

    if path == "/api/v1/billing/launch-offer/active" and method == "get":
        return True

    return False


def get_build_metadata() -> dict[str, str]:
    """Return public, non-secret deployment metadata."""
    commit = next(
        (
            value
            for name in (
                "CAPVERI_BUILD_COMMIT",
                "RAILWAY_GIT_COMMIT_SHA",
                "VERCEL_GIT_COMMIT_SHA",
                "RENDER_GIT_COMMIT",
                "GIT_COMMIT",
                "SOURCE_VERSION",
                "COMMIT_SHA",
                "HEROKU_SLUG_COMMIT",
            )
            if (value := os.getenv(name))
        ),
        "unknown",
    )
    return {
        "version": settings.app_version,
        "environment": settings.environment,
        "commit": commit,
    }


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler for startup/shutdown events.
    Use this for:
    - Initializing database connections
    - Setting up background tasks
    - Cleaning up resources on shutdown
    """
    # Startup - reset Supabase clients to ensure fresh connections
    from app.database.client import SupabaseClientManager

    SupabaseClientManager.reset_clients()

    logger.info(
        "Application starting",
        extra={
            "version": settings.app_version,
            "environment": settings.environment,
            "log_level": settings.log_level,
        },
    )
    yield
    # Shutdown
    logger.info("Application shutting down")


def custom_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate custom OpenAPI schema with enhanced documentation.
    This function customizes the OpenAPI specification to include:
    - Detailed API description with authentication instructions
    - Security schemes (Bearer token authentication)
    - Applied security requirements to all endpoints except /health
    Args:
        app: The FastAPI application instance
    Returns:
        The customized OpenAPI schema dictionary
    """
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="CapVeri API",
        version=settings.app_version,
        description="""
## CapVeri API
CRE FinOps and compliance platform API.
### Authentication
Most `/api/v1` endpoints require authentication via Bearer token.
Public endpoints include `/health`, `POST /api/v1/auth/login`, signup flows,
invitation validation endpoints, public lead/contact intake, tool endpoints,
and signed webhooks. Include the token in the `Authorization` header for
authenticated routes:
```
Authorization: Bearer <your-jwt-token>
```
### Rate Limiting
- Authenticated: 100 requests per minute per user (identified by JWT `sub`)
- Public unauthenticated endpoints: 20 requests per minute per IP address
- Public invitation validation endpoints: 10 requests per minute per IP address
### Pagination
List endpoints support pagination via `skip` and `limit` query parameters:
- `skip`: Number of records to skip (default: 0)
- `limit`: Maximum records to return (default: 100, max: 1000)
        """,
        routes=app.routes,
    )
    # Ensure components exist
    if "components" not in openapi_schema:
        openapi_schema["components"] = {}
    # Add security scheme
    openapi_schema["components"]["securitySchemes"] = {
        "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Enter your JWT token",
        }
    }
    # Apply security to all endpoints except health and webhooks
    for path, path_data in openapi_schema["paths"].items():
        for method, operation in path_data.items():
            if isinstance(operation, dict):
                # Skip health, auth, webhook endpoints (public/use signature)
                if is_public_openapi_operation(path, method):
                    operation["security"] = []
                else:
                    operation.setdefault("security", [{"bearerAuth": []}])
    app.openapi_schema = openapi_schema
    return app.openapi_schema


def create_app() -> FastAPI:
    """Application factory pattern for creating FastAPI instance.
    Returns:
        Configured FastAPI application instance.
    """
    init_sentry()
    app = FastAPI(
        title="CapVeri API",
        description="CRE FinOps and compliance platform",
        version=settings.app_version,
        openapi_url="/openapi.json",
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        lifespan=lifespan,
    )
    # Set custom OpenAPI function for enhanced documentation
    app.openapi = lambda: custom_openapi(app)  # type: ignore[method-assign]
    # Add correlation ID middleware (must be first to capture all requests)
    app.add_middleware(CorrelationIdMiddleware)
    # Add rate limiting (runs after CORS, before endpoint dispatch)
    app.add_middleware(RateLimitMiddleware)
    # Configure CORS for frontend access
    # In development, allow all localhost origins
    if settings.environment == "development":
        # Custom CORS to allow any localhost port
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            # Expose Content-Disposition so the browser/JS can read the
            # server-provided download filename on cross-origin file downloads
            # (demand letters, SB 1103 packets, board PDFs, CSV/ERP exports).
            # Without this the fetch() response hides the header and downloads
            # fall back to a generic name like "export.pdf".
            expose_headers=["Content-Disposition"],
        )
    else:
        # Production: use explicit whitelist
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["Content-Disposition"],
        )

    # Add security headers middleware
    @app.middleware("http")
    async def capture_backend_api_usage(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Capture safe API route usage telemetry after response dispatch."""
        start_time = time.perf_counter()
        response: Response | None = None
        try:
            response = await call_next(request)
            return response
        finally:
            if should_track_api_request(request.url.path):
                duration_ms = (time.perf_counter() - start_time) * 1000
                status_code = response.status_code if response else 500
                asyncio.create_task(
                    capture_api_request_event(
                        request,
                        status_code=status_code,
                        duration_ms=duration_ms,
                    )
                )

    @app.middleware("http")
    async def add_security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Add security headers to all responses.
        Protects against common web vulnerabilities:
        - X-Content-Type-Options: Prevents MIME type sniffing
        - X-Frame-Options: Prevents clickjacking attacks
        - X-XSS-Protection: Enables browser XSS protection
        - Strict-Transport-Security: Enforces HTTPS connections
        """
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        if request.url.path in NOINDEX_PATHS:
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response

    # Register exception handlers for consistent JSON error responses
    register_exception_handlers(app)
    register_custom_exception_handlers(app)
    # Register API routers
    from app.api import router as api_router
    from app.api.routes import webhooks_router

    app.include_router(api_router, prefix="/api/v1")
    app.include_router(webhooks_router)  # Root level, no prefix

    @app.get("/health", tags=["System"])
    async def health_check() -> Any:
        """Health check endpoint for load balancers and monitoring."""
        from fastapi.responses import JSONResponse

        body, status_code = await run_health_checks()
        body.update(get_build_metadata())
        return JSONResponse(content=body, status_code=status_code)

    @app.get("/health.version", tags=["System"])
    async def health_version() -> dict[str, str]:
        """Public build metadata endpoint for deployment freshness checks."""
        return get_build_metadata()

    return app


# Create the application instance
app = create_app()
