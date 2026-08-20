"""
API Version 1 Router.

Aggregates all v1 resource routers with appropriate prefixes and tags.
Each resource router handles CRUD operations for its domain.
"""

# isort: skip_file  # ruff handles import sorting; alias pattern conflicts with isort
from fastapi import APIRouter

from app.api.v1.actual_billed import router as actual_billed_router
from app.api.v1.cross_doc_analysis import router as cross_doc_analysis_router
from app.api.v1.analysis import router as analysis_router
from app.api.v1.audit_requests import router as audit_requests_router
from app.api.v1.contact_requests import router as contact_requests_router
from app.api.v1.audit_trail import router as audit_trail_router
from app.api.v1.auth import router as auth_router
from app.api.v1.ai_cs import router as ai_cs_router
from app.api.v1.ai_sdr import router as ai_sdr_router
from app.api.v1.billing import router as billing_router
from app.api.v1.campaigns import router as campaigns_router
from app.api.v1.comparison import router as comparison_router
from app.api.v1.compliance import router as compliance_router
from app.api.v1.dashboard import router as landlord_dashboard_router
from app.api.v1.demand_letter import router as demand_letter_router
from app.api.v1.tax_protest import router as tax_protest_router
from app.api.v1.disputes import router as admin_disputes_router
from app.api.v1.documents import router as documents_router
from app.api.v1.expense_pools import router as expense_pools_router
from app.api.v1.export import router as export_v2_router
from app.api.v1.exports import router as exports_router
from app.api.v1.extraction import router as extraction_router
from app.api.v1.feedback import router as feedback_router
from app.api.v1.ingestion import router as ingestion_router
from app.api.v1.leads import router as leads_router
from app.api.v1.onboard import router as onboard_router
from app.api.v1.leakage import router as leakage_router
from app.api.v1.lease_term_versions import router as lease_term_versions_router
from app.api.v1.leases import router as leases_router
from app.api.v1.organization import router as organization_router
from app.api.v1.pool_allocations import router as pool_allocations_router
from app.api.v1.pool_mappings import router as pool_mappings_router
from app.api.v1.pool_templates import router as pool_templates_router
from app.api.v1.portfolio import router as portfolio_router
from app.api.v1.properties import router as properties_router
from app.api.v1.reconciliation import router as reconciliation_router
from app.api.v1.rent_roll import router as rent_roll_router
from app.api.v1.reports import router as reports_router
from app.api.v1.tools import router as tools_router
from app.api.v1.units import router as units_router
from app.api.v1.team import invitations_router as team_invitations_router
from app.api.v1.team import members_router as team_members_router
from app.api.v1.team import signup_router as team_signup_router
from app.api.v1.tenant import (
    dashboard_router,
    disputes_router,
    invitations_router,
    notifications_router,
    signup_router,
)

# Version 1 router - aggregates all resource routers
router = APIRouter()

# Auth support endpoints
router.include_router(
    auth_router,
    prefix="/auth",
    tags=["Auth"],
)

# Signed public context consumed by the Ventora AI SDR worker
router.include_router(ai_sdr_router)

# Signed authenticated context consumed by the Ventora AI CS worker
router.include_router(ai_cs_router)

# Dashboard endpoint (landlord)
router.include_router(
    landlord_dashboard_router,
    prefix="/dashboard",
    tags=["Dashboard"],
)

# Property management endpoints
router.include_router(
    properties_router,
    prefix="/properties",
    tags=["Properties"],
)

# Unit endpoints - nested under properties
router.include_router(
    units_router,
    prefix="/properties/{property_id}/units",
    tags=["Units"],
)

# Expense pool endpoints - nested under properties
router.include_router(
    expense_pools_router,
    prefix="/properties/{property_id}/expense-pools",
    tags=["Expense Pools"],
)

# Pool mapping endpoints - nested under properties
router.include_router(
    pool_mappings_router,
    prefix="/properties/{property_id}/pool-mappings",
    tags=["Pool Mappings"],
)

# Pool allocation endpoints - nested under properties
router.include_router(
    pool_allocations_router,
    prefix="/properties/{property_id}/pool-allocations",
    tags=["Pool Allocations"],
)

# Lease management endpoints
router.include_router(
    leases_router,
    prefix="/leases",
    tags=["Leases"],
)

# Lease term version endpoints (nested under leases)
router.include_router(
    lease_term_versions_router,
    prefix="/leases",
    tags=["Lease Term Versions"],
)

# Data ingestion endpoints
router.include_router(
    ingestion_router,
    prefix="/ingestion",
    tags=["Data Ingestion"],
)

# Reconciliation calculation endpoints
router.include_router(
    reconciliation_router,
    prefix="/reconciliation",
    tags=["Reconciliation"],
)

# Reconciliation campaign workflow endpoints
router.include_router(
    campaigns_router,
    prefix="/campaigns",
    tags=["Campaigns"],
)

# Pool template endpoints
router.include_router(
    pool_templates_router,
)

# Historical analysis endpoints
router.include_router(
    analysis_router,
    prefix="/analysis",
    tags=["Historical Analysis"],
)

# Report generation endpoints
router.include_router(
    reports_router,
    prefix="/reports",
    tags=["Reports"],
)

# Export endpoints (snapshot-level)
router.include_router(
    exports_router,
    prefix="/exports",
    tags=["Exports"],
)

# Export v2 endpoints (property-level)
router.include_router(
    export_v2_router,
    prefix="/export",
    tags=["Export"],
)

# Audit trail query endpoints
router.include_router(
    audit_trail_router,
    prefix="/audit-trail",
    tags=["Audit Trail"],
)

# Extraction (OCR) endpoints
router.include_router(
    extraction_router,
    prefix="/extractions",
    tags=["Extraction"],
)

# Document management endpoints
router.include_router(
    documents_router,
    prefix="/documents",
    tags=["Documents"],
)

# Billing and customer management endpoints
router.include_router(
    billing_router,
    prefix="/billing",
    tags=["Billing"],
)

# Organization management endpoints
router.include_router(
    organization_router,
    prefix="/organization",
    tags=["Organization"],
)

# User feedback endpoints
router.include_router(
    feedback_router,
    prefix="/feedback",
    tags=["Feedback"],
)

# Audit request endpoints (public lead capture)
router.include_router(
    audit_requests_router,
    tags=["Audit Requests"],
)

# General contact form endpoints (public, non-audit inquiries)
router.include_router(
    contact_requests_router,
    tags=["Contact Requests"],
)

# Content lead capture endpoints (lead magnets / gated downloads)
router.include_router(
    leads_router,
    tags=["Leads"],
)

# PLG onboarding endpoints (anonymous bootstrap + account upgrade)
router.include_router(
    onboard_router,
    tags=["PLG Onboard"],
)

# Dispute management endpoints (admin)
router.include_router(
    admin_disputes_router,
    prefix="/disputes",
    tags=["Disputes"],
)

# Tenant portal endpoints
router.include_router(
    invitations_router,
    tags=["Tenant Portal"],
)
router.include_router(
    signup_router,
    tags=["Tenant Portal"],
)
router.include_router(
    dashboard_router,
    tags=["Tenant Portal"],
)
router.include_router(
    notifications_router,
    tags=["Tenant Portal"],
)
router.include_router(
    disputes_router,
    tags=["Tenant Portal"],
)

# Team management endpoints
router.include_router(
    team_invitations_router,
    tags=["Team Management"],
)
router.include_router(
    team_members_router,
    tags=["Team Management"],
)
router.include_router(
    team_signup_router,
    tags=["Team Management"],
)

# Actual billed amounts endpoints (for leakage comparison)
router.include_router(
    actual_billed_router,
    prefix="/actual-billed",
    tags=["Actual Billed"],
)

# Leakage analysis endpoints
router.include_router(
    leakage_router,
    prefix="/leakage",
    tags=["Leakage"],
)

# Bidirectional system comparison endpoints (over/under/match variance).
# Separate from /leakage (one-directional, DB-source-only) — this surface is
# bidirectional and also accepts an explicit charged set. /leakage is untouched.
router.include_router(
    comparison_router,
    prefix="/comparison",
    tags=["Comparison"],
)

# Portfolio summary endpoints
router.include_router(
    portfolio_router,
    prefix="/portfolio",
    tags=["Portfolio"],
)

# Rent Roll import endpoints
router.include_router(
    rent_roll_router,
    prefix="/rent-roll",
    tags=["Rent Roll"],
)

# Demand Letter generation endpoints
router.include_router(
    demand_letter_router, prefix="/demand-letter", tags=["Demand Letter"]
)

# Tax Protest Data Package endpoints
router.include_router(tax_protest_router, prefix="/tax-protest", tags=["Tax Protest"])

# Free public tools endpoints (no auth required)
router.include_router(tools_router)

# California SB 1103 compliance endpoints
router.include_router(
    compliance_router,
    prefix="/compliance/sb1103",
    tags=["Compliance"],
)

# Cross-document analysis endpoints
router.include_router(
    cross_doc_analysis_router,
    tags=["Cross-Document Analysis"],
)

__all__ = ["router"]
