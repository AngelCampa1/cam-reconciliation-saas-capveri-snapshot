"""Authentication dependencies for FastAPI.

Provides JWT token validation and user context extraction
for securing API endpoints.
"""

import logging
import re
from dataclasses import dataclass
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from httpx import HTTPError
from postgrest.exceptions import APIError
from supabase_auth.errors import AuthApiError

from app.database.client import SupabaseDB, get_supabase
from app.models.enums import UserRole
from app.models.tenant import TenantUser
from app.models.user import User

logger = logging.getLogger(__name__)

# Security scheme for OpenAPI documentation
security = HTTPBearer(auto_error=False)

ANONYMOUS_ONBOARDING_ROUTE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("PATCH", re.compile(r"^/api/v1/onboard/upgrade$")),
    ("GET", re.compile(r"^/api/v1/properties/[0-9a-fA-F-]{36}$")),
    ("POST", re.compile(r"^/api/v1/properties$")),
    ("GET", re.compile(r"^/api/v1/properties/[0-9a-fA-F-]{36}/units$")),
    ("GET", re.compile(r"^/api/v1/leases$")),
    ("POST", re.compile(r"^/api/v1/leases$")),
    ("POST", re.compile(r"^/api/v1/ingestion/upload$")),
    ("GET", re.compile(r"^/api/v1/ingestion/gl-date-range/[0-9a-fA-F-]{36}$")),
    ("POST", re.compile(r"^/api/v1/reconciliation/calculate$")),
    ("POST", re.compile(r"^/api/v1/actual-billed/upload$")),
    ("POST", re.compile(r"^/api/v1/actual-billed/manual$")),
    ("GET", re.compile(r"^/api/v1/leakage/[0-9a-fA-F-]{36}$")),
    ("POST", re.compile(r"^/api/v1/rent-roll/preview$")),
    ("POST", re.compile(r"^/api/v1/rent-roll/import$")),
)


def _is_anonymous_auth_user(auth_user: Any) -> bool:
    return getattr(auth_user, "is_anonymous", False) is True


def _anonymous_request_allowed(request: Request | None) -> bool:
    if request is None:
        return False

    method = request.method.upper()
    path = request.url.path
    return any(
        allowed_method == method and pattern.match(path)
        for allowed_method, pattern in ANONYMOUS_ONBOARDING_ROUTE_PATTERNS
    )


class AuthenticationError(HTTPException):
    """Authentication failed exception.

    Raised when JWT validation fails or user cannot be identified.
    """

    def __init__(self, detail: str = "Authentication required"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    request: Request,
) -> User:
    """
    Validate JWT token and return current user.

    This dependency:
    1. Extracts the Bearer token from Authorization header
    2. Validates the JWT with Supabase
    3. Fetches the user profile from the users table
    4. Returns a User model with organization context

    Args:
        credentials: Bearer token from Authorization header
        supabase: Supabase client for auth and database queries

    Returns:
        User model with full profile data

    Raises:
        AuthenticationError: If token is missing, invalid, or expired
    """
    if credentials is None:
        raise AuthenticationError("Authorization header required")

    token = credentials.credentials

    try:
        # Verify JWT and get user from Supabase Auth
        logger.debug("Validating token: %s...", token[:20])
        auth_response = supabase.auth.get_user(token)

        if not auth_response or not auth_response.user:
            logger.debug("Token validation failed: user is None")
            raise AuthenticationError("Invalid token")

        auth_user = auth_response.user
        logger.debug("Authenticated user: %s", auth_user.email)

        if _is_anonymous_auth_user(auth_user) and not _anonymous_request_allowed(
            request
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Anonymous onboarding sessions cannot access this endpoint",
            )

        # Set the JWT on the client so RLS can identify the user
        # This is crucial: without this, auth.uid() returns NULL and RLS
        # blocks the query
        supabase.postgrest.auth(token)

        # Fetch user profile with organization from our users table
        result = (
            supabase.table("users")
            .select(
                "id, organization_id, email, full_name, role, is_platform_admin, "
                "created_at, updated_at"
            )
            .eq("id", str(auth_user.id))
            .single()
            .execute()
        )

        if result.data is None:
            raise AuthenticationError("User profile not found")

        user_data = cast(dict[str, Any], result.data)
        # Carry the anonymous-onboarding flag forward so downstream entitlement
        # checks can exempt the allowlisted onboarding routes (anonymous orgs
        # have no subscription yet). is_anonymous is not stored in the users
        # table — it is a property of the Supabase auth session.
        user_data["is_anonymous"] = _is_anonymous_auth_user(auth_user)
        user = User(**user_data)
        request.state.analytics_user_id = str(user.id)
        request.state.analytics_organization_id = str(user.organization_id)
        request.state.analytics_user_role = str(user.role)
        return user

    except AuthenticationError:
        raise
    except (AuthApiError, APIError, HTTPError, ConnectionError) as e:
        # Catch Supabase auth, PostgREST, network, and connectivity errors
        logger.debug("Exception during auth: %s: %s", type(e).__name__, e)
        error_message = str(e)
        if "Invalid" in error_message or "expired" in error_message.lower():
            raise AuthenticationError("Invalid or expired token")
        raise AuthenticationError(f"Authentication failed: {error_message}")


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Get current user and verify they are active.

    This dependency can be extended to check for:
    - Suspended users
    - Disabled accounts
    - Users pending email verification

    Args:
        current_user: User from get_current_user dependency

    Returns:
        The validated active user
    """
    # Add additional checks here if needed (e.g., user not suspended)
    return current_user


async def get_current_admin_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Get current user and verify they have admin privileges.

    Only users with 'owner' or 'admin' roles pass this check.

    Args:
        current_user: User from get_current_user dependency

    Returns:
        The validated admin user

    Raises:
        HTTPException: 403 if user is not admin/owner
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


async def get_current_landlord_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Require a non-tenant organization user."""
    if current_user.role == UserRole.TENANT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Landlord workspace access required",
        )
    return current_user


async def get_current_editor_user(
    current_user: Annotated[User, Depends(get_current_landlord_user)],
) -> User:
    """Require write access for landlord workspace mutations."""
    if current_user.role not in {UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor privileges required",
        )
    return current_user


async def get_current_owner_user(
    current_user: Annotated[User, Depends(get_current_landlord_user)],
) -> User:
    """Require organization owner privileges."""
    if current_user.role != UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner privileges required",
        )
    return current_user


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    """
    Require admin privileges without returning the user.

    This is a lightweight dependency for endpoints that only need
    to verify admin access but don't use the user object.

    Args:
        current_user: User from get_current_user dependency

    Raises:
        HTTPException: 403 if user is not admin/owner
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )


async def get_current_platform_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Get current user and verify they have PLATFORM admin privileges.

    This is different from organization admin - only specific users
    designated as platform admins can access platform-wide resources
    like the admin dashboard and all audit requests across orgs.

    Args:
        current_user: User from get_current_user dependency

    Returns:
        The validated platform admin user

    Raises:
        HTTPException: 403 if user is not a platform admin
    """
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin privileges required",
        )
    return current_user


async def get_current_tenant_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    request: Request,
) -> TenantUser:
    """
    Validate JWT token and return current tenant user.

    This dependency validates token via Supabase, verifies the user has
    the tenant role, and fetches their tenant profile. Tenant users have
    restricted access compared to organization users.

    Args:
        credentials: Bearer token from Authorization header
        supabase: Supabase client for auth and database queries

    Returns:
        TenantUser model with tenant profile data

    Raises:
        AuthenticationError: Invalid/missing token (401)
        HTTPException 403: User is not a tenant
        HTTPException 404: Tenant profile not found
    """
    # Reuse existing validation logic
    user = await get_current_user(credentials, supabase, request)

    # Verify tenant role
    if user.role != UserRole.TENANT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Tenant access required. "
                "This endpoint is for tenant portal users only."
            ),
        )

    # Fetch tenant profile (RLS automatically enforces user_id = auth.uid())
    result = (
        supabase.table("tenant_users")
        .select("id, user_id, organization_id, contact_name, contact_email, created_at")
        .eq("user_id", str(user.id))
        .maybe_single()
        .execute()
    )

    # Defensive null check
    if result is None or not hasattr(result, "data"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant user profile not found. Contact your landlord for access.",
        )

    if result.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant user profile not found. Contact your landlord for access.",
        )

    return TenantUser(**cast(dict[str, Any], result.data))


# Type aliases for cleaner dependency injection
# Usage: async def endpoint(user: CurrentUser) -> ...
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentActiveUser = Annotated[User, Depends(get_current_active_user)]
CurrentLandlordUser = Annotated[User, Depends(get_current_landlord_user)]
CurrentEditorUser = Annotated[User, Depends(get_current_editor_user)]
CurrentAdminUser = Annotated[User, Depends(get_current_admin_user)]
CurrentOwnerUser = Annotated[User, Depends(get_current_owner_user)]
CurrentPlatformAdmin = Annotated[User, Depends(get_current_platform_admin)]
CurrentTenantUser = Annotated[TenantUser, Depends(get_current_tenant_user)]


@dataclass
class OrganizationContext:
    """
    Organization-scoped database context.

    This provides a Supabase client that has been configured with
    the user's auth token, ensuring RLS policies are enforced.

    Additionally, it provides the organization_id for use in
    queries that need explicit filtering.

    Attributes:
        client: Supabase client for database operations
        organization_id: UUID of the user's organization
        user: The authenticated user

    Example:
        @router.get("/properties")
        async def list_properties(ctx: OrgContext):
            result = ctx.table("properties").select("*").execute()
            return result.data
    """

    client: SupabaseDB
    organization_id: UUID
    user: User

    @property
    def supabase(self) -> SupabaseDB:
        """Alias for client attribute for backward compatibility."""
        return self.client

    @property
    def org_id(self) -> UUID:
        """Alias for organization_id for backward compatibility."""
        return self.organization_id

    def table(self, name: str) -> Any:
        """
        Get a table reference with organization context.

        While RLS handles security, explicit org filtering
        can improve query performance.

        Args:
            name: Name of the database table

        Returns:
            Supabase table reference for chaining queries
        """
        return self.client.table(name)

    def filter_by_org(self, query: Any) -> Any:
        """
        Add organization_id filter to a query.

        Helper method to add explicit org filtering for
        tables that have organization_id column.

        Args:
            query: Supabase query builder

        Returns:
            Query with organization_id filter applied
        """
        return query.eq("organization_id", str(self.organization_id))


async def get_org_scoped_context(
    current_user: Annotated[User, Depends(get_current_landlord_user)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
) -> OrganizationContext:
    """
    Get database context scoped to user's organization.

    This dependency:
    1. Gets the authenticated user
    2. Returns a context with the user's organization_id
    3. The Supabase client has RLS enabled via the user's token

    Usage in endpoints:
        @router.get("/properties")
        async def list_properties(ctx: OrgContext):
            result = ctx.table("properties").select("*").execute()
            return result.data

    Args:
        current_user: Authenticated user from get_current_user
        supabase: Supabase client for database operations

    Returns:
        OrganizationContext with client, org_id, and user
    """
    return OrganizationContext(
        client=supabase,
        organization_id=current_user.organization_id,
        user=current_user,
    )


async def require_org_editor(
    ctx: Annotated[OrganizationContext, Depends(get_org_scoped_context)],
) -> None:
    """Require owner/admin/member using the already-resolved org context."""
    if ctx.user.role not in {UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor privileges required",
        )


async def require_org_admin(
    ctx: Annotated[OrganizationContext, Depends(get_org_scoped_context)],
) -> None:
    """Require owner/admin using the already-resolved org context."""
    if not ctx.user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )


async def require_org_owner(
    ctx: Annotated[OrganizationContext, Depends(get_org_scoped_context)],
) -> None:
    """Require owner using the already-resolved org context."""
    if ctx.user.role != UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner privileges required",
        )


async def require_full_access(
    ctx: Annotated[OrganizationContext, Depends(get_org_scoped_context)],
) -> None:
    """Require an org with full entitlement access for a mutating action.

    Read-only lock: an org without full access (no subscription, or a trial
    that has ended — a card-less trial whose window lapsed resolves to
    ``paused`` inside ``has_full_access``) can still view existing data, but
    every product-consuming action raises ``402`` so the app can route the
    user to plan selection. Apply this only to mutating/consuming endpoints;
    leave GET/read routes open so data stays viewable.
    """
    # Anonymous PLG onboarding sessions have a freshly bootstrapped org with no
    # subscription, but they are only ever allowed to reach the allowlisted
    # onboarding routes (enforced in get_current_user). Exempt them here so the
    # onboarding flow (create property/lease, upload GL + billed, calculate
    # leakage) is not blocked by the trial gate before the user picks a plan.
    if ctx.user.is_anonymous:
        return

    # Imported lazily to keep the auth-dependency module free of a hard import
    # cycle with the billing services package.
    from app.services.billing.entitlements import has_full_access

    if not has_full_access(ctx):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "subscription_required: Your free trial has ended. Choose a plan"
                " and add billing to keep using this feature."
            ),
        )


# Type alias for organization-scoped context
OrgContext = Annotated[OrganizationContext, Depends(get_org_scoped_context)]
