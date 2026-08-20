# Story 4.5.1: Configure OpenAPI Export

### User Story
**As a** developer
**I want** FastAPI to export a valid OpenAPI specification
**So that** I can generate clients and documentation from it

### Acceptance Criteria

- [x] **AC1**: `/openapi.json` endpoint returns valid OpenAPI 3.0 spec
- [x] **AC2**: All endpoints documented with request/response schemas
- [x] **AC3**: Authentication requirements documented (Bearer token)
- [x] **AC4**: Error responses (4xx, 5xx) documented
- [x] **AC5**: Spec validates against OpenAPI 3.0 schema

### Technical Specifications

**Files to Modify**:
```
backend/app/
└── main.py (update OpenAPI config)
```

**OpenAPI Configuration**:
```python
"""Enhanced OpenAPI configuration."""
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from app.config import settings


def custom_openapi(app: FastAPI):
    """Generate custom OpenAPI schema with enhanced documentation."""
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title="CapVeri API",
        version=settings.app_version,
        description="""
## CapVeri API

Commercial real estate CAM reconciliation platform API.

### Authentication

All endpoints (except `/health`) require authentication via Bearer token.
Include the token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

### Rate Limiting

- 100 requests per minute per user
- 1000 requests per minute per organization

### Pagination

List endpoints support pagination via `skip` and `limit` query parameters:
- `skip`: Number of records to skip (default: 0)
- `limit`: Maximum records to return (default: 100, max: 1000)
        """,
        routes=app.routes,
    )

    # Add security scheme
    openapi_schema["components"]["securitySchemes"] = {
        "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Enter your JWT token",
        }
    }

    # Apply security to all endpoints except health
    for path_data in openapi_schema["paths"].values():
        for operation in path_data.values():
            if isinstance(operation, dict):
                operation.setdefault("security", [{"bearerAuth": []}])

    # Remove security from health endpoint
    if "/health" in openapi_schema["paths"]:
        for operation in openapi_schema["paths"]["/health"].values():
            if isinstance(operation, dict):
                operation["security"] = []

    app.openapi_schema = openapi_schema
    return app.openapi_schema


def create_app() -> FastAPI:
    """Application factory with custom OpenAPI."""
    app = FastAPI(
        title="CapVeri API",
        version=settings.app_version,
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Set custom OpenAPI function
    app.openapi = lambda: custom_openapi(app)

    # ... rest of app setup
    return app
```

**Validation Script** (`scripts/validate_openapi.py`):
```python
"""Validate OpenAPI spec against official schema."""
import json
import sys
import requests
from openapi_spec_validator import validate_spec


def main():
    """Fetch and validate OpenAPI spec."""
    # Fetch spec from running server or file
    try:
        response = requests.get("http://localhost:8000/openapi.json")
        spec = response.json()
    except requests.RequestException:
        # Fallback to generating from app
        from app.main import app
        spec = app.openapi()

    # Validate against OpenAPI 3.0 schema
    try:
        validate_spec(spec)
        print("OpenAPI spec is valid!")
        return 0
    except Exception as e:
        print(f"OpenAPI spec validation failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
```

### Definition of Done
- [x] /openapi.json returns valid spec
- [x] Spec passes validation
- [x] Auth documented
- [x] All endpoints included

### Estimated Time: 1 hour

---
