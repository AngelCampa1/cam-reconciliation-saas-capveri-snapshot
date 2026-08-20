# Tenant CAM Audit — Architecture

> Last updated: 2026-02-28

## Overview

A pay-per-audit product where commercial tenants upload their lease + CAM reconciliation statement, pay a one-time fee, and receive a PDF report detailing discrepancies. The product reuses CapVeri's existing calculation, extraction, and ingestion engines — no new financial math required.

**Domain split:**
- `capveri.com` — tenant-facing product (this document)
- Future: separate domain for landlord SaaS (existing product, to be migrated later)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        capveri.com (Vercel)                        │
│                                                                     │
│  marketing-tenant/  (Next.js App Router)                           │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │ Landing  │  │  Wizard  │  │ Checkout │  │  Report Viewer   │    │
│  │  Pages   │  │ (Upload) │  │ (Stripe) │  │  (PDF + HTML)    │    │
│  └─────────┘  └──────────┘  └──────────┘  └──────────────────┘    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────────┐
│                    api.capveri.com (Railway)                        │
│                                                                     │
│  backend/ (FastAPI)                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Tenant Audit API │  │ Payment API      │  │ Report API       │  │
│  │ /api/v1/tenant-  │  │ /api/v1/tenant-  │  │ /api/v1/tenant-  │  │
│  │ audits/          │  │ audits/pay       │  │ audits/{id}/     │  │
│  │                  │  │                  │  │ report           │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                      │            │
│  ┌────────▼─────────────────────▼──────────────────────▼─────────┐  │
│  │                 Audit Orchestrator Service                     │  │
│  │  (State machine: CREATED → PAID → EXTRACTING → CALCULATING   │  │
│  │   → REVIEWING → GENERATING_REPORT → COMPLETED | FAILED)      │  │
│  └──┬────────────────┬───────────────────┬───────────────────┬───┘  │
│     │                │                   │                   │      │
│  ┌──▼──┐  ┌──────────▼────────┐  ┌──────▼───────┐  ┌───────▼───┐  │
│  │ S3  │  │ Extraction Engine │  │  Calculation  │  │  Report   │  │
│  │     │  │ (document reader+Claude) │  │  Engine       │  │  Gen      │  │
│  └─────┘  └───────────────────┘  └──────────────┘  └───────────┘  │
│                                                                     │
│  EXISTING engines — reused as-is with bridge functions              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
  ┌───────▼──────┐ ┌──────▼──────┐ ┌───────▼──────┐
  │   Supabase   │ │   Stripe    │ │   Resend     │
  │  (Postgres)  │ │  (Payments) │ │  (Email)     │
  └──────────────┘ └─────────────┘ └──────────────┘
```

---

## Data Model

### `tenant_audits` Table

Primary table for the tenant audit product. Each row represents one audit request.

```sql
CREATE TABLE tenant_audits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Access & identity
    access_token    UUID NOT NULL DEFAULT gen_random_uuid(),  -- URL-based access (no auth required)
    email           TEXT NOT NULL,                            -- Tenant's email for delivery

    -- Audit context
    property_name   TEXT,                                     -- e.g., "Galleria Tower III"
    tenant_name     TEXT,                                     -- e.g., "Acme Corp"
    suite_number    TEXT,

    -- File references (S3 keys)
    lease_file_key          TEXT,         -- Uploaded lease PDF
    cam_statement_file_key  TEXT,         -- Uploaded CAM reconciliation statement

    -- Extraction results (JSONB)
    lease_extraction    JSONB,           -- LeaseExtractionResult
    cam_extraction      JSONB,           -- CamStatementExtractionResult (new)

    -- Calculation results
    calculation_result  JSONB,           -- TenantReconciliation output
    discrepancies       JSONB,           -- Array of {field, expected, actual, impact_amount}

    -- Report
    report_file_key     TEXT,            -- Generated PDF S3 key
    report_html         TEXT,            -- HTML version for in-browser viewing

    -- Payment
    stripe_payment_intent_id  TEXT,
    stripe_checkout_session   TEXT,
    amount_paid               INTEGER,   -- cents
    tier                      TEXT NOT NULL DEFAULT 'standard',  -- standard | detailed | expert

    -- State machine
    status          TEXT NOT NULL DEFAULT 'created',
    -- Values: created, paid, extracting_lease, extracting_cam,
    --         calculating, reviewing, generating_report, completed, failed
    error_message   TEXT,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at         TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UUID-based access (no auth required, link-based)
CREATE UNIQUE INDEX idx_tenant_audits_access_token ON tenant_audits(access_token);

-- Email lookup (for "my audits" page)
CREATE INDEX idx_tenant_audits_email ON tenant_audits(email);

-- Status queries for admin/monitoring
CREATE INDEX idx_tenant_audits_status ON tenant_audits(status);

-- RLS: tenant_audits is NOT org-scoped. Access is via access_token only.
-- No RLS policy needed — access controlled at API layer via access_token validation.
ALTER TABLE tenant_audits ENABLE ROW LEVEL SECURITY;

-- Service role bypass for backend
CREATE POLICY "service_role_all" ON tenant_audits
    FOR ALL
    USING (auth.role() = 'service_role');
```

### `tenant_audit_events` Table

Audit log for state transitions and processing events.

```sql
CREATE TABLE tenant_audit_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id        UUID NOT NULL REFERENCES tenant_audits(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,   -- status_change, extraction_complete, payment_received, etc.
    event_data      JSONB,           -- Event-specific payload
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_audit_events_audit_id ON tenant_audit_events(audit_id);
```

### Relationship to Existing Tables

The tenant audit product does **not** touch existing tables (`organizations`, `properties`, `leases`, `gl_entries`, etc.). It is a standalone data path:

```
tenant_audits (standalone)
    ├── lease_extraction (JSONB, same schema as LeaseExtractionResult)
    ├── cam_extraction (JSONB, new CamStatementExtractionResult)
    ├── calculation_result (JSONB, same schema as TenantReconciliation)
    └── discrepancies (JSONB, derived comparison)

Existing tables (landlord product):
    organizations → properties → leases → gl_entries → reconciliation_snapshots
```

No foreign keys between the two. The tenant audit product reuses the same **service code** (extraction, calculation) but stores results in its own table.

---

## API Design

All tenant audit endpoints live under `/api/v1/tenant-audits/`.

### Endpoints

```
POST   /api/v1/tenant-audits/                    Create audit + upload files
GET    /api/v1/tenant-audits/{access_token}       Get audit status + results
POST   /api/v1/tenant-audits/{access_token}/pay   Create Stripe checkout session
GET    /api/v1/tenant-audits/{access_token}/report Download PDF report
POST   /api/v1/tenant-audits/webhooks/stripe      Stripe webhook handler
```

### Request/Response Schemas

```python
# Create audit
class TenantAuditCreateRequest(BaseModel):
    email: EmailStr
    property_name: Optional[str] = None
    tenant_name: Optional[str] = None
    suite_number: Optional[str] = None
    tier: Literal["standard", "detailed", "expert"] = "standard"
    # Files sent as multipart/form-data

class TenantAuditCreateResponse(BaseModel):
    id: UUID
    access_token: UUID
    status: str
    checkout_url: str  # Stripe checkout URL

# Audit status
class TenantAuditStatusResponse(BaseModel):
    id: UUID
    status: str
    property_name: Optional[str]
    tenant_name: Optional[str]
    tier: str
    created_at: datetime
    completed_at: Optional[datetime]
    discrepancy_summary: Optional[DiscrepancySummary]
    report_available: bool

class DiscrepancySummary(BaseModel):
    total_overcharge: Decimal
    discrepancy_count: int
    categories: list[DiscrepancyCategory]

class DiscrepancyCategory(BaseModel):
    name: str           # e.g., "Gross-Up Calculation", "Cap Enforcement"
    expected: Decimal
    actual: Decimal
    difference: Decimal
    severity: Literal["info", "warning", "error"]
```

### Authentication Model

The tenant audit product uses **no user authentication**. Access is controlled entirely by UUID access tokens:

1. **Create audit** — no auth required. Returns `access_token`.
2. **All subsequent requests** — `access_token` in URL path. Token is a UUID4 (122 bits of entropy). Unguessable by brute force.
3. **Stripe webhook** — verified via Stripe signature header.
4. **Optional email verification** — for "my audits" page, send a magic link to the email on file. No passwords, no accounts.

This mirrors patterns used by services like Loom (share links), Typeform (results links), and DocuSign (signing links).

### Rate Limiting

- `POST /tenant-audits/` — 5 per hour per IP (prevent abuse)
- `GET /tenant-audits/{token}` — 60 per minute per IP (normal polling)
- Stripe webhook — no rate limit (verified by signature)

---

## Integration with Existing Engines

### Extraction Engine (reused)

The existing extraction pipeline (`backend/app/services/extraction/`) handles lease PDF extraction. For tenant audits, we add a **second extraction prompt** for CAM reconciliation statements.

```
Existing:  Lease PDF  → document reader → Claude → LeaseExtractionResult
New:       CAM PDF    → document reader → Claude → CamStatementExtractionResult
```

The new `CamStatementExtractionResult` captures:
- Line-item expenses (account, amount, category)
- Tenant's pro-rata share as stated
- Total CAM charged to tenant
- Base year amounts (if base year lease)
- Cap amounts applied
- Admin/management fee charged
- Gross-up adjustments shown

**Key difference from landlord flow**: No HITL review step. The tenant audit runs extraction → calculation → comparison automatically. Confidence scores are included in the report so tenants can see which extractions are high/low confidence.

### Calculation Engine (reused)

The existing calculation engine (`backend/app/services/calculation/`) is reused directly. A **bridge function** translates extraction results into `ReconciliationInput` + `LeaseTerms`:

```python
def extraction_to_reconciliation_input(
    lease: LeaseExtractionResult,
    cam: CamStatementExtractionResult,
) -> tuple[ReconciliationInput, LeaseTerms, dict[UUID, ExpensePoolSummary]]:
    """Bridge: extraction results → calculation engine inputs."""
```

The calculation engine produces a `TenantReconciliation` with the mathematically correct amounts. The report then compares these against what the landlord actually charged (from the CAM statement extraction).

### Ingestion Engine (not reused)

The ingestion engine parses Yardi/MRI GL exports — not relevant to tenant audits. Tenants upload CAM statements (PDFs), not GL exports. The CAM statement extraction handles this directly.

---

## Infrastructure

| Component | Service | Notes |
|-----------|---------|-------|
| marketing-tenant/ | Vercel | Next.js App Router, same deploy pipeline as marketing/ |
| Backend API | Railway | Same FastAPI instance, new router mounted |
| Database | Supabase | New `tenant_audits` + `tenant_audit_events` tables |
| File storage | S3 | New prefix: `tenant-audits/{audit_id}/` |
| Async jobs | Celery + Redis | Extraction + calculation run as background tasks |
| PDF generation | ReportLab | Server-side PDF generation |
| Email | Resend | Report delivery + status notifications |
| Payments | Stripe | One-time checkout sessions (not subscriptions) |
| OCR | document reader | Same document reader pipeline, shared cost |
| AI extraction | Claude 3.5 Sonnet | Same client, new prompt for CAM statements |

### Cost Model per Audit

| Step | Cost |
|------|------|
| document reader (2 docs, ~10 pages each) | ~$0.30 |
| Claude 3.5 Sonnet (2 extractions) | ~$0.15 |
| S3 storage | ~$0.01 |
| Resend email | ~$0.001 |
| Railway compute | ~$0.05 |
| **Total per audit** | **~$0.51** |

At $49–$199 per audit pricing, margins are >95%.

---

## Security Considerations

1. **No PII storage beyond email** — no names, SSNs, or financial account numbers stored in database. Lease/CAM documents stored in S3 with server-side encryption.
2. **Access token expiry** — access tokens remain valid for 90 days after audit completion. After that, documents are purged from S3, results remain in DB.
3. **S3 access** — pre-signed URLs with 15-minute expiry for document downloads. No direct S3 access.
4. **Stripe security** — webhook signature verification. No card data touches our servers.
5. **Input validation** — file type validation (PDF only), file size limits (25MB per file), virus scanning via ClamAV before processing.
6. **Rate limiting** — per-IP rate limits on creation endpoint to prevent abuse.
7. **Privacy-safe AI** — Claude API calls use Anthropic's zero-data-retention policy. No tenant data used for model training.

---

## Deployment Strategy

The tenant audit product deploys alongside the existing infrastructure:

1. **marketing-tenant/** deploys to Vercel as a separate project (capveri.com domain)
2. **Backend** — new router added to existing FastAPI app, deploys via Railway on push to master
3. **Database** — migration adds new tables, no changes to existing tables
4. **S3** — new prefix in existing bucket

No new infrastructure to provision. The product is additive — zero risk to existing landlord product.
