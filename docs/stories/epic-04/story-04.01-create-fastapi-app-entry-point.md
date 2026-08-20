# Story 4.1: Create FastAPI App Entry Point

### User Story
**As a** developer
**I want** a FastAPI application with proper configuration
**So that** I have a foundation for building API endpoints

### Acceptance Criteria

- [x] **AC1**: `backend/app/main.py` exists with FastAPI app instance
- [x] **AC2**: CORS configured for frontend origin
- [x] **AC3**: OpenAPI documentation available at `/docs`
- [x] **AC4**: Health check endpoint at `/health` returns 200 with version info
- [x] **AC5**: Environment variables loaded via Pydantic Settings

### Technical Specifications

**Files to Create**:
```
backend/app/
├── __init__.py
├── main.py
├── config.py
└── api/
    ├── __init__.py  # exports router (added in Story 4.2+)
    └── v1/          # API v1 routes (added in Story 4.2+)
```

**Note**: The `api/__init__.py` file will initially be empty or contain a placeholder router. Story 4.2 and subsequent stories will add routes and export them via `router` from this module. For now, you can comment out line 73-74 in main.py or add a placeholder router in `api/__init__.py`:

```python
# api/__init__.py (placeholder until Story 4.2)
from fastapi import APIRouter

router = APIRouter()
```

**main.py**:
```python
"""
CapVeri FastAPI Application

Main entry point for the backend API.
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler for startup/shutdown events."""
    # Startup: initialize connections, etc.
    yield
    # Shutdown: cleanup resources


def create_app() -> FastAPI:
    """Application factory pattern for creating FastAPI instance."""
    app = FastAPI(
        title="CapVeri API",
        description="Commercial real estate CAM reconciliation platform",
        version=settings.app_version,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        lifespan=lifespan,
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    from app.api import router as api_router
    app.include_router(api_router, prefix="/api/v1")

    @app.get("/health", tags=["System"])
    async def health_check():
        """Health check endpoint for load balancers and monitoring."""
        return {
            "status": "healthy",
            "version": settings.app_version,
            "environment": settings.environment,
        }

    return app


app = create_app()
```

**config.py**:
```python
"""
Application configuration via Pydantic Settings.

Loads from environment variables with validation.
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App settings
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True

    # CORS
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # Database
    database_url: str


settings = Settings()
```

**Note**: This uses `SettingsConfigDict` from pydantic-settings, which differs from `ConfigDict` used in standard Pydantic models. This is correct for settings/config classes.

### Definition of Done
- [x] `uvicorn app.main:app` starts server
- [x] `/health` returns 200
- [x] `/docs` shows OpenAPI spec
- [x] CORS allows frontend origin

### Estimated Time: 2 hours

### Completion Notes

**Completed**: 2025-12-28

**Implementation**:
- Created `backend/app/config.py` with Pydantic Settings for environment configuration
- Created `backend/app/main.py` with FastAPI app factory pattern
- Created `backend/app/api/__init__.py` with placeholder router for future API routes
- Created `backend/app/api/v1/__init__.py` for versioned API structure
- Health check endpoint returns status, version, and environment
- CORS configured for localhost:5173 and localhost:3000 (frontend dev servers)
- OpenAPI docs at /docs and /redoc (disabled in production)
- Application factory pattern with lifespan handler for startup/shutdown

**Files Created/Modified**:
- `backend/app/config.py` (new)
- `backend/app/main.py` (new)
- `backend/app/api/__init__.py` (new)
- `backend/app/api/v1/__init__.py` (new)
- `backend/tests/test_config.py` (new, 14 tests)
- `backend/tests/test_main.py` (new, 24 tests)

**Test Results**: 38 new tests, 668 total backend tests passing, 99.71% coverage

---
