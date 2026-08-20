"""
Authentication module for FastAPI.

Provides JWT validation, user context, and organization-scoped dependencies.
"""

from app.auth.dependencies import (
    AuthenticationError,
    CurrentActiveUser,
    CurrentAdminUser,
    CurrentEditorUser,
    CurrentLandlordUser,
    CurrentOwnerUser,
    CurrentPlatformAdmin,
    CurrentTenantUser,
    CurrentUser,
    OrganizationContext,
    OrgContext,
    get_current_active_user,
    get_current_admin_user,
    get_current_editor_user,
    get_current_landlord_user,
    get_current_owner_user,
    get_current_platform_admin,
    get_current_tenant_user,
    get_current_user,
    get_org_scoped_context,
    require_org_admin,
    require_org_editor,
    require_org_owner,
)

__all__ = [
    "AuthenticationError",
    "CurrentActiveUser",
    "CurrentAdminUser",
    "CurrentEditorUser",
    "CurrentLandlordUser",
    "CurrentOwnerUser",
    "CurrentPlatformAdmin",
    "CurrentTenantUser",
    "CurrentUser",
    "OrgContext",
    "OrganizationContext",
    "get_current_active_user",
    "get_current_admin_user",
    "get_current_editor_user",
    "get_current_landlord_user",
    "get_current_owner_user",
    "get_current_platform_admin",
    "get_current_tenant_user",
    "get_current_user",
    "get_org_scoped_context",
    "require_org_admin",
    "require_org_editor",
    "require_org_owner",
]
