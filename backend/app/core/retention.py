"""Data retention policy configuration for CapVeri.

Pure declarations — no database logic. Mirrors the migration 068 seed exactly.

Legal framework:
- IRS § 6001 / Rev. Proc. 98-25: financial records ≥ 7 years (we keep 10)
- GAAP: financial records retained for their useful life
- State tenancy law: lease records through term + statutory period
"""

from dataclasses import dataclass, field
from enum import Enum


class RetentionCategory(str, Enum):
    """Three-tier retention classification."""

    FINANCIAL_PERMANENT = "financial_permanent"
    OPERATIONAL = "operational"
    TRANSIENT = "transient"


# ---------------------------------------------------------------------------
# Constants — single source of truth for purge windows
# ---------------------------------------------------------------------------

FINANCIAL_RETENTION_YEARS: int = 10
"""IRS § 6001 minimum is 7 years; CapVeri retains 10 for audit safety margin."""

TRANSIENT_EMAIL_LOG_PURGE_DAYS: int = 2
"""Rate-limit email logs: 48 hours is sufficient for dedup."""

TRANSIENT_JOB_PURGE_DAYS: int = 90
"""Completed/failed job queue rows: 90 days for debugging, then purged."""

TRANSIENT_NOTIFICATION_PURGE_DAYS: int = 90
"""Read tenant notifications: 90 days. Unread notifications are NEVER purged."""

TRANSIENT_WEBHOOK_PURGE_DAYS: int = 90
"""Stripe webhook events: 90 days for reconciliation window."""

TRANSIENT_AUTH_EVENT_PURGE_DAYS: int = 365
"""Auth events: 1 year for SOC 2 / incident-response lookback."""


@dataclass(frozen=True)
class RetentionPolicy:
    """Retention rule for a single database table."""

    table_name: str
    category: RetentionCategory
    retention_years: int | None
    """Years to retain. None for transient tables."""
    purge_after_days: int | None
    """Days after which rows are eligible for automated purge."""
    purge_condition: str
    """Human-readable description of the SQL purge condition."""
    legal_basis: str
    """Regulation or policy justifying the retention period."""
    notes: str = field(default="")


# Module-level shorthands to keep individual entries under the 88-char line limit.
_IRS = "IRS § 6001"
_IRS_GAAP = f"{_IRS}, GAAP"
_IRS_TENANCY = f"{_IRS}, state tenancy law"
_IRS_REV = f"{_IRS}, Rev. Proc. 98-25"
_NEVER_PURGED = "Never purged automatically; retained for full 10-year period"
_BIZ = "Business necessity"

RETENTION_POLICY: dict[str, RetentionPolicy] = {
    # ------------------------------------------------------------------
    # FINANCIAL_PERMANENT — 21 tables, 10-year IRS retention
    # ------------------------------------------------------------------
    "organizations": RetentionPolicy(
        table_name="organizations",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "users": RetentionPolicy(
        table_name="users",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=(
            "Personal data anonymized within 30 days of account deletion;"
            " record retained"
        ),
        legal_basis=f"{_IRS}, GDPR Art. 17",
    ),
    "properties": RetentionPolicy(
        table_name="properties",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "units": RetentionPolicy(
        table_name="units",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "leases": RetentionPolicy(
        table_name="leases",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_TENANCY,
    ),
    "import_batches": RetentionPolicy(
        table_name="import_batches",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_REV,
    ),
    "gl_entries": RetentionPolicy(
        table_name="gl_entries",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
        notes="Core financial ledger — must never be purged",
    ),
    "reconciliation_snapshots": RetentionPolicy(
        table_name="reconciliation_snapshots",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "actual_billed_amounts": RetentionPolicy(
        table_name="actual_billed_amounts",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "expense_pools": RetentionPolicy(
        table_name="expense_pools",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "pool_mappings": RetentionPolicy(
        table_name="pool_mappings",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "pool_allocations": RetentionPolicy(
        table_name="pool_allocations",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "pool_templates": RetentionPolicy(
        table_name="pool_templates",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "subscriptions": RetentionPolicy(
        table_name="subscriptions",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "invoices": RetentionPolicy(
        table_name="invoices",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "audit_log": RetentionPolicy(
        table_name="audit_log",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=f"{_IRS}, SOC 2",
    ),
    "disputes": RetentionPolicy(
        table_name="disputes",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_TENANCY,
    ),
    "dispute_comments": RetentionPolicy(
        table_name="dispute_comments",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_TENANCY,
    ),
    "dispute_attachments": RetentionPolicy(
        table_name="dispute_attachments",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_TENANCY,
    ),
    "audit_requests": RetentionPolicy(
        table_name="audit_requests",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_GAAP,
    ),
    "column_mappings": RetentionPolicy(
        table_name="column_mappings",
        category=RetentionCategory.FINANCIAL_PERMANENT,
        retention_years=FINANCIAL_RETENTION_YEARS,
        purge_after_days=None,
        purge_condition=_NEVER_PURGED,
        legal_basis=_IRS_REV,
    ),
    # ------------------------------------------------------------------
    # OPERATIONAL — 10 tables, 2–3 year retention
    # ------------------------------------------------------------------
    "tenant_users": RetentionPolicy(
        table_name="tenant_users",
        category=RetentionCategory.OPERATIONAL,
        retention_years=3,
        purge_after_days=None,
        purge_condition="Removed on tenant offboarding after 3-year retention period",
        legal_basis=f"{_BIZ}, state tenancy law",
    ),
    "tenant_lease_links": RetentionPolicy(
        table_name="tenant_lease_links",
        category=RetentionCategory.OPERATIONAL,
        retention_years=3,
        purge_after_days=None,
        purge_condition="Removed on tenant offboarding after 3-year retention period",
        legal_basis="State tenancy law",
    ),
    "tenant_invitations": RetentionPolicy(
        table_name="tenant_invitations",
        category=RetentionCategory.OPERATIONAL,
        retention_years=3,
        purge_after_days=None,
        purge_condition="Removed on tenant offboarding after 3-year retention period",
        legal_basis=_BIZ,
    ),
    "team_member_invitations": RetentionPolicy(
        table_name="team_member_invitations",
        category=RetentionCategory.OPERATIONAL,
        retention_years=3,
        purge_after_days=None,
        purge_condition="Removed on account offboarding after 3-year retention period",
        legal_basis=_BIZ,
    ),
    "tenant_email_preferences": RetentionPolicy(
        table_name="tenant_email_preferences",
        category=RetentionCategory.OPERATIONAL,
        retention_years=3,
        purge_after_days=None,
        purge_condition="Removed on tenant offboarding after 3-year retention period",
        legal_basis=f"CAN-SPAM, {_BIZ.lower()}",
    ),
    "promotions": RetentionPolicy(
        table_name="promotions",
        category=RetentionCategory.OPERATIONAL,
        retention_years=3,
        purge_after_days=None,
        purge_condition="Retained for 3 years for marketing analysis",
        legal_basis=_BIZ,
    ),
    "promotion_redemptions": RetentionPolicy(
        table_name="promotion_redemptions",
        category=RetentionCategory.OPERATIONAL,
        retention_years=3,
        purge_after_days=None,
        purge_condition="Retained for 3 years for billing audit trail",
        legal_basis=f"{_BIZ}, {_IRS}",
    ),
    "feedback": RetentionPolicy(
        table_name="feedback",
        category=RetentionCategory.OPERATIONAL,
        retention_years=3,
        purge_after_days=None,
        purge_condition="Retained for 3 years for product analysis",
        legal_basis=_BIZ,
    ),
    "ocr_results": RetentionPolicy(
        table_name="ocr_results",
        category=RetentionCategory.OPERATIONAL,
        retention_years=2,
        purge_after_days=None,
        purge_condition=(
            "Retained for 2 years; source documents retained separately per IRS rules"
        ),
        legal_basis=_BIZ,
        notes="Raw OCR output only; underlying financial data lives in gl_entries",
    ),
    "content_leads": RetentionPolicy(
        table_name="content_leads",
        category=RetentionCategory.OPERATIONAL,
        retention_years=3,
        purge_after_days=None,
        purge_condition="Retained for 3 years for marketing analysis",
        legal_basis=f"{_BIZ}, CAN-SPAM",
    ),
    # ------------------------------------------------------------------
    # TRANSIENT — 6 tables, automated weekly purge
    # ------------------------------------------------------------------
    "tenant_email_logs": RetentionPolicy(
        table_name="tenant_email_logs",
        category=RetentionCategory.TRANSIENT,
        retention_years=None,
        purge_after_days=TRANSIENT_EMAIL_LOG_PURGE_DAYS,
        purge_condition="DELETE WHERE sent_at < NOW() - INTERVAL '48 hours'",
        legal_basis="Operational necessity; email rate-limit dedup only",
        notes="Uses sent_at column (not created_at) — verified in migration 026",
    ),
    "extraction_jobs": RetentionPolicy(
        table_name="extraction_jobs",
        category=RetentionCategory.TRANSIENT,
        retention_years=None,
        purge_after_days=TRANSIENT_JOB_PURGE_DAYS,
        purge_condition=(
            "DELETE WHERE status IN ('completed', 'failed')"
            " AND completed_at < NOW() - INTERVAL '90 days'"
        ),
        legal_basis="Operational necessity; job metadata only",
        notes="In-progress and pending rows are never purged",
    ),
    "calculation_jobs": RetentionPolicy(
        table_name="calculation_jobs",
        category=RetentionCategory.TRANSIENT,
        retention_years=None,
        purge_after_days=TRANSIENT_JOB_PURGE_DAYS,
        purge_condition=(
            "DELETE WHERE status IN ('completed', 'failed')"
            " AND completed_at < NOW() - INTERVAL '90 days'"
        ),
        legal_basis="Operational necessity; job metadata only",
        notes="In-progress and pending rows are never purged",
    ),
    "tenant_notifications": RetentionPolicy(
        table_name="tenant_notifications",
        category=RetentionCategory.TRANSIENT,
        retention_years=None,
        purge_after_days=TRANSIENT_NOTIFICATION_PURGE_DAYS,
        purge_condition=(
            "DELETE WHERE read_at IS NOT NULL"
            " AND created_at < NOW() - INTERVAL '90 days'"
        ),
        legal_basis="Operational necessity; UI notifications only",
        notes="Unread notifications (read_at IS NULL) are NEVER purged",
    ),
    "stripe_webhook_events": RetentionPolicy(
        table_name="stripe_webhook_events",
        category=RetentionCategory.TRANSIENT,
        retention_years=None,
        purge_after_days=TRANSIENT_WEBHOOK_PURGE_DAYS,
        purge_condition="DELETE WHERE created_at < NOW() - INTERVAL '90 days'",
        legal_basis="Operational necessity; idempotency dedup only",
        notes=(
            "Billing outcomes are mirrored to the financial"
            " invoices/subscriptions tables"
        ),
    ),
    "auth_events": RetentionPolicy(
        table_name="auth_events",
        category=RetentionCategory.TRANSIENT,
        retention_years=None,
        purge_after_days=TRANSIENT_AUTH_EVENT_PURGE_DAYS,
        purge_condition="DELETE WHERE timestamp < NOW() - INTERVAL '365 days'",
        legal_basis="SOC 2 / incident-response lookback",
        notes="Uses timestamp column (not created_at) — verified in migration 047",
    ),
}


def get_tables_by_category(category: RetentionCategory) -> list[str]:
    """Return all table names belonging to the given retention category."""
    return [
        table
        for table, policy in RETENTION_POLICY.items()
        if policy.category == category
    ]
