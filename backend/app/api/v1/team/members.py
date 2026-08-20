"""Current team member management endpoints."""

from datetime import UTC, datetime
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.auth.dependencies import OrgContext, get_current_admin_user
from app.database.client import get_supabase_admin
from app.models.enums import UserRole
from app.models.user import User

router = APIRouter(prefix="/team/members", tags=["team-management"])

AssignableTeamRole = Literal["admin", "member", "viewer"]
LANDLORD_TEAM_ROLES = (
    UserRole.OWNER.value,
    UserRole.ADMIN.value,
    UserRole.MEMBER.value,
    UserRole.VIEWER.value,
)
MANAGEABLE_TEAM_ROLES = (
    UserRole.ADMIN.value,
    UserRole.MEMBER.value,
    UserRole.VIEWER.value,
)


class TeamMember(BaseModel):
    """Organization user shown in team management."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str | None = None
    role: UserRole
    created_at: datetime
    updated_at: datetime
    is_current_user: bool = False


class TeamMemberRoleUpdateRequest(BaseModel):
    """Request to change a team member role."""

    role: AssignableTeamRole = Field(description="New non-owner team role")


def _team_member_from_row(row: dict[str, Any], current_user_id: UUID) -> TeamMember:
    member = TeamMember.model_validate(row)
    member.is_current_user = member.id == current_user_id
    return member


def _fetch_org_member(ctx: OrgContext, member_id: UUID) -> TeamMember:
    response = (
        ctx.table("users")
        .select("id, organization_id, email, full_name, role, created_at, updated_at")
        .eq("id", str(member_id))
        .eq("organization_id", str(ctx.organization_id))
        .in_("role", list(LANDLORD_TEAM_ROLES))
        .maybe_single()
        .execute()
    )

    if response is None or not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found",
        )

    return TeamMember.model_validate(cast(dict[str, Any], response.data))


def _ensure_member_can_be_managed(*, target: TeamMember) -> None:
    if target.role == UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization owners cannot be managed from this page",
        )


@router.get("", response_model=list[TeamMember])
async def list_team_members(
    ctx: OrgContext,
    user: Annotated[User, Depends(get_current_admin_user)],
) -> list[TeamMember]:
    """List current organization members for admins."""
    response = (
        ctx.table("users")
        .select("id, organization_id, email, full_name, role, created_at, updated_at")
        .eq("organization_id", str(ctx.organization_id))
        .in_("role", list(LANDLORD_TEAM_ROLES))
        .order("created_at", desc=False)
        .execute()
    )

    rows = response.data if response and response.data else []
    return [_team_member_from_row(cast(dict[str, Any], row), user.id) for row in rows]


@router.patch("/{member_id}", response_model=TeamMember)
async def update_team_member_role(
    member_id: UUID,
    request: TeamMemberRoleUpdateRequest,
    ctx: OrgContext,
    user: Annotated[User, Depends(get_current_admin_user)],
    supabase_admin: Annotated[Any, Depends(get_supabase_admin)],
) -> TeamMember:
    """Update another non-owner member's organization role."""
    if member_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role",
        )

    target = _fetch_org_member(ctx, member_id)
    _ensure_member_can_be_managed(target=target)

    response = (
        supabase_admin.table("users")
        .update(
            {
                "role": request.role,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )
        .eq("id", str(member_id))
        .eq("organization_id", str(ctx.organization_id))
        .in_("role", list(MANAGEABLE_TEAM_ROLES))
        .execute()
    )

    if response is None or not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found",
        )

    return _team_member_from_row(cast(dict[str, Any], response.data[0]), user.id)


@router.delete("/{member_id}")
async def remove_team_member(
    member_id: UUID,
    ctx: OrgContext,
    user: Annotated[User, Depends(get_current_admin_user)],
    supabase_admin: Annotated[Any, Depends(get_supabase_admin)],
) -> dict[str, str]:
    """Remove another non-owner member from the organization."""
    if member_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own account",
        )

    target = _fetch_org_member(ctx, member_id)
    _ensure_member_can_be_managed(target=target)

    response = (
        supabase_admin.table("users")
        .delete()
        .eq("id", str(member_id))
        .eq("organization_id", str(ctx.organization_id))
        .in_("role", list(MANAGEABLE_TEAM_ROLES))
        .execute()
    )

    if response is None or not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found",
        )

    return {"status": "removed", "member_id": str(member_id)}
