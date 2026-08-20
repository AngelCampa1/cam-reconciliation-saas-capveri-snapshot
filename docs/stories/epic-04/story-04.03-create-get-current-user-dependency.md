# Story 4.3: Create Get Current User Dependency

### User Story
**As an** API developer
**I want** a dependency that validates JWT tokens and returns the current user
**So that** I can secure endpoints and identify the calling user

### Acceptance Criteria

- [x] **AC1**: `get_current_user` dependency validates JWT from Authorization header
- [x] **AC2**: Returns User model with organization_id populated
- [x] **AC3**: Returns 401 Unauthorized for missing/invalid tokens
- [x] **AC4**: Returns 401 for expired tokens
- [x] **AC5**: Caches user lookup for request duration

### Technical Specifications

**Files to Create**:
```
backend/app/
├── auth/
│   ├── __init__.py
│   └── dependencies.py
└── models/
    ├── __init__.py
    └── user.py
```

**models/user.py**:
```python
"""User model for authentication context."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserRole:
    """User role constants."""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class User(BaseModel):
    """Authenticated user model."""
    id: UUID
    organization_id: UUID
    email: EmailStr
    full_name: Optional[str] = None
    role: str = UserRole.MEMBER
    created_at: datetime
    updated_at: datetime

    @property
    def is_admin(self) -> bool:
        """Check if user has admin privileges."""
        return self.role in (UserRole.OWNER, UserRole.ADMIN)

    @property
    def is_owner(self) -> bool:
        """Check if user is organization owner."""
        return self.role == UserRole.OWNER
```

**auth/dependencies.py**:
```python
"""Authentication dependencies for FastAPI."""
from typing import Annotated, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database.client import get_supabase, Client
from app.models.user import User


# Security scheme for OpenAPI documentation
security = HTTPBearer(auto_error=False)


class AuthenticationError(HTTPException):
    """Authentication failed exception."""
    def __init__(self, detail: str = "Authentication required"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(security)
    ],
    supabase: Annotated[Client, Depends(get_supabase)],
) -> User:
    """
    Validate JWT token and return current user.

    This dependency:
    1. Extracts the Bearer token from Authorization header
    2. Validates the JWT with Supabase
    3. Fetches the user profile from the users table
    4. Returns a User model with organization context

    Raises:
        AuthenticationError: If token is missing, invalid, or expired
    """
    if credentials is None:
        raise AuthenticationError("Authorization header required")

    token = credentials.credentials

    try:
        # Verify JWT and get user from Supabase Auth
        auth_response = supabase.auth.get_user(token)

        if auth_response.user is None:
            raise AuthenticationError("Invalid token")

        auth_user = auth_response.user

        # Fetch user profile with organization from our users table
        # Set the auth context for RLS
        supabase.auth.set_session(token, "")

        result = supabase.table("users").select(
            "id, organization_id, email, full_name, role, created_at, updated_at"
        ).eq("id", str(auth_user.id)).single().execute()

        if result.data is None:
            raise AuthenticationError("User profile not found")

        return User(**result.data)

    except AuthenticationError:
        raise
    except Exception as e:
        raise AuthenticationError(f"Authentication failed: {str(e)}")


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Get current user and verify they are active.

    Extend this to check for suspended/disabled users.
    """
    # Add additional checks here (e.g., user not suspended)
    return current_user


async def get_current_admin_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Get current user and verify they have admin privileges.

    Raises:
        HTTPException: 403 if user is not admin/owner
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


# Type aliases for cleaner dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentActiveUser = Annotated[User, Depends(get_current_active_user)]
CurrentAdminUser = Annotated[User, Depends(get_current_admin_user)]
```

### Definition of Done
- [x] JWT validation works
- [x] User profile fetched from database
- [x] 401 returned for invalid tokens
- [x] Organization ID available

### Estimated Time: 3 hours

### Completion Notes

**Completed**: 2025-12-28

**Implementation**:
- Created `backend/app/auth/__init__.py` with module exports
- Created `backend/app/auth/dependencies.py` with authentication dependencies
- Added `is_admin` and `is_owner` properties to User model
- `get_current_user` - Validates JWT, fetches user from DB
- `get_current_active_user` - Extension point for additional checks
- `get_current_admin_user` - Requires admin/owner role (403 if not)
- `AuthenticationError` - Custom 401 exception with WWW-Authenticate header
- Type aliases: `CurrentUser`, `CurrentActiveUser`, `CurrentAdminUser`

**Files Created/Modified**:
- `backend/app/auth/__init__.py` (new)
- `backend/app/auth/dependencies.py` (new)
- `backend/app/models/user.py` (modified - added is_admin, is_owner properties)
- `backend/tests/test_auth_dependencies.py` (new, 28 tests)

**Test Results**: 28 new tests, 774 total backend tests passing, 99.74% coverage

---
