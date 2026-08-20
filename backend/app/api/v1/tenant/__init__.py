"""Tenant Portal API endpoints."""

from app.api.v1.tenant.dashboard import router as dashboard_router
from app.api.v1.tenant.disputes import router as disputes_router
from app.api.v1.tenant.invitations import router as invitations_router
from app.api.v1.tenant.notifications import router as notifications_router
from app.api.v1.tenant.signup import router as signup_router

__all__ = [
    "dashboard_router",
    "disputes_router",
    "invitations_router",
    "notifications_router",
    "signup_router",
]
