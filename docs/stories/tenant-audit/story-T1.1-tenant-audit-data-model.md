# Story T1.1: Tenant Audit Data Model

## Story Info
- **Epic**: T1 — Backend Payment & Data Model
- **Estimated Hours**: 4
- **Dependencies**: None
- **Status**: `pending`

## User Story
As a platform engineer, I want a standalone data model for tenant audits so that tenants can submit, pay for, and receive CAM audit reports without requiring a platform account or linking to existing tables.

## Acceptance Criteria
- `tenant_audits` table created via Supabase migration with all required columns
- `tenant_audit_events` table created for immutable audit logging
- UUID `access_token` generated per audit, used as public identifier
- Status column enforces valid state machine transitions
- JSONB columns store extraction and calculation results without schema coupling
- Stripe fields (`checkout_session_id`, `payment_intent_id`, `amount_paid`) track payment state
- RLS enabled on both tables with service_role bypass policy
- Pydantic models validate all inputs/outputs with Decimal for money fields
- Status enum covers full lifecycle: created, payment_pending, paid, processing, completed, failed, refunded

## Technical Specifications

### Database Migration

```sql
-- supabase/migrations/YYYYMMDD_create_tenant_audits.sql

-- Status enum
CREATE TYPE tenant_audit_status AS ENUM (
    'created',
    'payment_pending',
    'paid',
    'processing',
    'completed',
    'failed',
    'refunded'
);

-- Pricing tier enum
CREATE TYPE tenant_audit_tier AS ENUM (
    'standard',
    'detailed',
    'expert'
);

-- Main table — no FKs to existing platform tables
CREATE TABLE tenant_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Contact
    email TEXT NOT NULL,
    property_name TEXT,         -- Optional, user-provided label

    -- Files (S3 keys)
    reconciliation_file_key TEXT NOT NULL,
    lease_file_key TEXT NOT NULL,
    supporting_file_keys TEXT[] DEFAULT '{}',

    -- Pricing
    tier tenant_audit_tier NOT NULL DEFAULT 'standard',
    amount_cents INTEGER NOT NULL,   -- Price in cents (4900, 9900, 19900)

    -- Stripe
    checkout_session_id TEXT,
    payment_intent_id TEXT,
    amount_paid_cents INTEGER,       -- Actual amount charged

    -- Status
    status tenant_audit_status NOT NULL DEFAULT 'created',

    -- Results (JSONB — schema evolves with AI extraction)
    extraction_result JSONB,         -- Raw AI extraction output
    calculation_result JSONB,        -- Deterministic calculation output
    report_file_key TEXT,            -- S3 key for generated PDF

    -- Error tracking
    error_message TEXT,
    error_code TEXT,

    -- Refund
    refund_id TEXT,
    refunded_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    processing_started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_amount CHECK (amount_cents > 0),
    CONSTRAINT valid_email CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

-- Indexes
CREATE INDEX idx_tenant_audits_access_token ON tenant_audits (access_token);
CREATE INDEX idx_tenant_audits_email ON tenant_audits (email);
CREATE INDEX idx_tenant_audits_status ON tenant_audits (status);
CREATE INDEX idx_tenant_audits_checkout_session ON tenant_audits (checkout_session_id)
    WHERE checkout_session_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_audits_updated_at
    BEFORE UPDATE ON tenant_audits
    FOR EACH ROW EXECUTE FUNCTION update_tenant_audit_updated_at();

-- Audit log table
CREATE TABLE tenant_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_audit_id UUID NOT NULL REFERENCES tenant_audits(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,       -- 'created', 'payment_initiated', 'paid', 'processing_started', etc.
    event_data JSONB DEFAULT '{}',  -- Additional context per event
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_audit_events_audit_id ON tenant_audit_events (tenant_audit_id);
CREATE INDEX idx_tenant_audit_events_type ON tenant_audit_events (event_type);

-- RLS: Enable but allow service_role full access
ALTER TABLE tenant_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_audit_events ENABLE ROW LEVEL SECURITY;

-- Service role bypass (API server uses service_role key)
CREATE POLICY "Service role full access" ON tenant_audits
    FOR ALL USING (
        current_setting('role') = 'service_role'
    );

CREATE POLICY "Service role full access" ON tenant_audit_events
    FOR ALL USING (
        current_setting('role') = 'service_role'
    );

-- No anon or authenticated policies — all access through API
```

### Pydantic Models

```python
# backend/app/models/tenant_audit.py
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


class TenantAuditStatus(str, Enum):
    """Status state machine for tenant audits."""

    CREATED = "created"
    PAYMENT_PENDING = "payment_pending"
    PAID = "paid"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


# Valid state transitions
VALID_STATUS_TRANSITIONS: dict[TenantAuditStatus, list[TenantAuditStatus]] = {
    TenantAuditStatus.CREATED: [TenantAuditStatus.PAYMENT_PENDING],
    TenantAuditStatus.PAYMENT_PENDING: [
        TenantAuditStatus.PAID,
        TenantAuditStatus.CREATED,  # Allow retry if checkout abandoned
    ],
    TenantAuditStatus.PAID: [TenantAuditStatus.PROCESSING],
    TenantAuditStatus.PROCESSING: [
        TenantAuditStatus.COMPLETED,
        TenantAuditStatus.FAILED,
    ],
    TenantAuditStatus.FAILED: [TenantAuditStatus.REFUNDED],
    TenantAuditStatus.COMPLETED: [],  # Terminal state
    TenantAuditStatus.REFUNDED: [],   # Terminal state
}


class TenantAuditTier(str, Enum):
    """Pricing tiers for tenant audits."""

    STANDARD = "standard"
    DETAILED = "detailed"
    EXPERT = "expert"


# Prices in cents — single source of truth
TIER_PRICES_CENTS: dict[TenantAuditTier, int] = {
    TenantAuditTier.STANDARD: 4900,   # $49
    TenantAuditTier.DETAILED: 9900,   # $99
    TenantAuditTier.EXPERT: 19900,    # $199
}


def validate_status_transition(
    current: TenantAuditStatus,
    target: TenantAuditStatus,
) -> None:
    """Raise ValueError if the status transition is not allowed."""
    allowed = VALID_STATUS_TRANSITIONS.get(current, [])
    if target not in allowed:
        raise ValueError(
            f"Invalid status transition: {current.value} -> {target.value}. "
            f"Allowed transitions: {[s.value for s in allowed]}"
        )


class TenantAudit(BaseModel):
    """Core tenant audit domain model."""

    id: UUID
    access_token: UUID
    email: EmailStr
    property_name: str | None = None

    # Files
    reconciliation_file_key: str
    lease_file_key: str
    supporting_file_keys: list[str] = Field(default_factory=list)

    # Pricing
    tier: TenantAuditTier
    amount_cents: int = Field(gt=0)

    # Stripe
    checkout_session_id: str | None = None
    payment_intent_id: str | None = None
    amount_paid_cents: int | None = None

    # Status
    status: TenantAuditStatus = TenantAuditStatus.CREATED

    # Results
    extraction_result: dict[str, Any] | None = None
    calculation_result: dict[str, Any] | None = None
    report_file_key: str | None = None

    # Error
    error_message: str | None = None
    error_code: str | None = None

    # Refund
    refund_id: str | None = None
    refunded_at: datetime | None = None

    # Timestamps
    created_at: datetime
    updated_at: datetime
    paid_at: datetime | None = None
    processing_started_at: datetime | None = None
    completed_at: datetime | None = None
    failed_at: datetime | None = None

    @property
    def amount_dollars(self) -> Decimal:
        """Return amount in dollars as Decimal."""
        return Decimal(self.amount_cents) / Decimal(100)

    @property
    def amount_paid_dollars(self) -> Decimal | None:
        """Return amount paid in dollars as Decimal."""
        if self.amount_paid_cents is None:
            return None
        return Decimal(self.amount_paid_cents) / Decimal(100)


class TenantAuditEvent(BaseModel):
    """Immutable audit log entry."""

    id: UUID
    tenant_audit_id: UUID
    event_type: str
    event_data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
```

### Request/Response Schemas

```python
# backend/app/schemas/tenant_audit.py
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.tenant_audit import TenantAuditStatus, TenantAuditTier


class CreateTenantAuditRequest(BaseModel):
    """Request to create a new tenant audit."""

    email: EmailStr
    tier: TenantAuditTier = TenantAuditTier.STANDARD
    property_name: str | None = Field(
        None,
        max_length=255,
        description="Optional label for the property being audited",
    )

    # File keys are set server-side after upload, not in the request body.
    # Files are uploaded via multipart form data.


class TenantAuditResponse(BaseModel):
    """Public response for tenant audit status."""

    access_token: UUID
    email: EmailStr
    property_name: str | None
    tier: TenantAuditTier
    status: TenantAuditStatus
    amount_cents: int
    created_at: datetime
    updated_at: datetime
    paid_at: datetime | None = None
    completed_at: datetime | None = None

    # Only included when status is 'completed'
    has_report: bool = False


class TenantAuditDetailResponse(TenantAuditResponse):
    """Extended response with calculation summary (after completion)."""

    calculation_summary: dict[str, Any] | None = None


class TenantAuditCreatedResponse(BaseModel):
    """Response after creating a tenant audit."""

    access_token: UUID
    status: TenantAuditStatus
    tier: TenantAuditTier
    amount_cents: int
    message: str = "Audit created. Proceed to payment."
```

### Service Layer

```python
# backend/app/services/tenant_audit/repository.py
from datetime import datetime
from typing import Any
from uuid import UUID

from app.models.tenant_audit import (
    TenantAudit,
    TenantAuditEvent,
    TenantAuditStatus,
    validate_status_transition,
)


class TenantAuditRepository:
    """Data access for tenant audits using Supabase service_role client."""

    def __init__(self, supabase_client: Any) -> None:
        self.client = supabase_client

    async def create(self, audit: TenantAudit) -> TenantAudit:
        """Insert a new tenant audit record."""
        data = audit.model_dump(mode="json")
        result = (
            self.client.table("tenant_audits")
            .insert(data)
            .execute()
        )
        return TenantAudit(**result.data[0])

    async def get_by_access_token(self, access_token: UUID) -> TenantAudit | None:
        """Retrieve audit by its public access token."""
        result = (
            self.client.table("tenant_audits")
            .select("*")
            .eq("access_token", str(access_token))
            .maybe_single()
            .execute()
        )
        if result.data is None:
            return None
        return TenantAudit(**result.data)

    async def get_by_checkout_session_id(
        self, session_id: str
    ) -> TenantAudit | None:
        """Retrieve audit by Stripe checkout session ID."""
        result = (
            self.client.table("tenant_audits")
            .select("*")
            .eq("checkout_session_id", session_id)
            .maybe_single()
            .execute()
        )
        if result.data is None:
            return None
        return TenantAudit(**result.data)

    async def update_status(
        self,
        audit_id: UUID,
        current_status: TenantAuditStatus,
        new_status: TenantAuditStatus,
        extra_fields: dict[str, Any] | None = None,
    ) -> TenantAudit:
        """Transition audit status with validation."""
        validate_status_transition(current_status, new_status)

        update_data: dict[str, Any] = {"status": new_status.value}
        if extra_fields:
            update_data.update(extra_fields)

        result = (
            self.client.table("tenant_audits")
            .update(update_data)
            .eq("id", str(audit_id))
            .eq("status", current_status.value)  # Optimistic concurrency
            .execute()
        )

        if not result.data:
            raise ValueError(
                f"Status transition failed — audit {audit_id} is no longer "
                f"in status '{current_status.value}' (concurrent update)."
            )

        return TenantAudit(**result.data[0])

    async def log_event(
        self,
        audit_id: UUID,
        event_type: str,
        event_data: dict[str, Any] | None = None,
    ) -> TenantAuditEvent:
        """Append an immutable event to the audit log."""
        result = (
            self.client.table("tenant_audit_events")
            .insert({
                "tenant_audit_id": str(audit_id),
                "event_type": event_type,
                "event_data": event_data or {},
            })
            .execute()
        )
        return TenantAuditEvent(**result.data[0])
```

## Test Cases
- Create a `TenantAudit` model with all required fields and verify serialization round-trip
- Verify `TenantAuditStatus` enum contains all expected values
- Verify `TIER_PRICES_CENTS` maps all three tiers to correct cent values
- Test `validate_status_transition` allows `created -> payment_pending`
- Test `validate_status_transition` rejects `created -> paid` (must go through payment_pending)
- Test `validate_status_transition` rejects transitions from terminal states (completed, refunded)
- Test `amount_dollars` property returns correct `Decimal` (4900 -> `Decimal("49.00")`)
- Test `amount_paid_dollars` returns `None` when `amount_paid_cents` is `None`
- Test `CreateTenantAuditRequest` validates email format
- Test `CreateTenantAuditRequest` rejects `property_name` exceeding 255 characters
- Test `TenantAuditResponse` serializes `has_report` as `False` when status is not completed
- Test repository `update_status` with optimistic concurrency check (mock Supabase)
- Test repository `log_event` creates immutable event record (mock Supabase)
- Verify migration SQL runs without errors against a fresh database

## Definition of Done
- [ ] Supabase migration file created and tested
- [ ] `TenantAuditStatus` enum with all 7 states
- [ ] `VALID_STATUS_TRANSITIONS` dict enforces state machine
- [ ] `validate_status_transition()` raises `ValueError` for invalid transitions
- [ ] `TenantAuditTier` enum with 3 tiers
- [ ] `TIER_PRICES_CENTS` maps tiers to cent amounts
- [ ] `TenantAudit` Pydantic model with all fields, Decimal properties
- [ ] `TenantAuditEvent` Pydantic model for audit log
- [ ] Request/response schemas with proper validation
- [ ] `TenantAuditRepository` with create, get, update_status, log_event
- [ ] RLS policies enable service_role bypass, block anon/authenticated
- [ ] Unit tests pass for all models, validation, and state transitions
- [ ] Coverage maintained at >= 95%
