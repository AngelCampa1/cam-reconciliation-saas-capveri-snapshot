# Tenant CAM Audit — Engineering

> Last updated: 2026-02-28

## Overview

This document covers the technical implementation details for the tenant CAM audit product. It builds on the [architecture](./architecture.md) and [design](./design.md) documents, focusing on extraction prompts, orchestration pipeline, bridge functions, payment integration, report generation, and the marketing-tenant/ scaffold.

---

## 1. CAM Statement Extraction

### New Extraction Prompt

The existing extraction pipeline handles lease PDFs via `LEASE_EXTRACTION_PROMPT` in `backend/app/services/extraction/prompts.py`. The tenant audit product adds a second prompt for CAM reconciliation statements.

```python
CAM_STATEMENT_EXTRACTION_PROMPT = """
You are an expert commercial real estate accountant. Extract the following
structured data from this CAM reconciliation statement.

Return a JSON object with these fields:

{
  "reconciliation_period": {
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD"
  },
  "property_name": "string",
  "tenant_name": "string",
  "suite_number": "string",
  "rentable_sqft_tenant": decimal,
  "rentable_sqft_building": decimal,
  "pro_rata_share_stated": decimal,  // as percentage, e.g., 12.5

  "expense_line_items": [
    {
      "category": "string",          // e.g., "Janitorial", "Utilities", "Taxes"
      "account_code": "string|null",
      "budget_amount": decimal|null,
      "actual_amount": decimal,
      "tenant_share": decimal,
      "is_capital": boolean,          // true if CapEx, false if OpEx
      "classification": "fixed|variable|unknown"
    }
  ],

  "adjustments": {
    "gross_up_applied": boolean,
    "gross_up_factor": decimal|null,
    "occupancy_rate_stated": decimal|null,  // e.g., 0.87
    "base_year_amount": decimal|null,
    "base_year_period": "string|null",
    "cap_applied": boolean,
    "cap_amount": decimal|null,
    "admin_fee_percent": decimal|null,
    "admin_fee_amount": decimal|null
  },

  "totals": {
    "total_operating_expenses": decimal,
    "total_tenant_share": decimal,
    "estimated_charges_paid": decimal,   // monthly estimates already paid
    "adjustment_due": decimal            // positive = tenant owes, negative = refund
  }
}

Rules:
- Use Decimal values for all money amounts (never float)
- If a field is not present in the document, use null
- For expense categories, use standard BOMA categories when possible
- Flag any expense that appears to be a capital expenditure
- Classify expenses as "fixed" (taxes, insurance) or "variable" (janitorial, utilities, repairs)
- If the statement shows a gross-up, extract both the factor and the target occupancy
- Extract the exact pro-rata share percentage stated on the document
"""
```

### New Extraction Model

```python
class ReconciliationPeriod(BaseModel):
    start_date: date
    end_date: date

class ExpenseLineItem(BaseModel):
    category: str
    account_code: Optional[str] = None
    budget_amount: Optional[Decimal] = None
    actual_amount: Decimal
    tenant_share: Decimal
    is_capital: bool = False
    classification: Literal["fixed", "variable", "unknown"] = "unknown"

class CamAdjustments(BaseModel):
    gross_up_applied: bool = False
    gross_up_factor: Optional[Decimal] = None
    occupancy_rate_stated: Optional[Decimal] = None
    base_year_amount: Optional[Decimal] = None
    base_year_period: Optional[str] = None
    cap_applied: bool = False
    cap_amount: Optional[Decimal] = None
    admin_fee_percent: Optional[Decimal] = None
    admin_fee_amount: Optional[Decimal] = None

class CamTotals(BaseModel):
    total_operating_expenses: Decimal
    total_tenant_share: Decimal
    estimated_charges_paid: Optional[Decimal] = None
    adjustment_due: Optional[Decimal] = None

class CamStatementExtractionResult(BaseModel):
    reconciliation_period: ReconciliationPeriod
    property_name: Optional[str] = None
    tenant_name: Optional[str] = None
    suite_number: Optional[str] = None
    rentable_sqft_tenant: Optional[Decimal] = None
    rentable_sqft_building: Optional[Decimal] = None
    pro_rata_share_stated: Optional[Decimal] = None
    expense_line_items: list[ExpenseLineItem]
    adjustments: CamAdjustments
    totals: CamTotals
    confidence_scores: dict[str, float] = {}
    low_confidence_fields: list[str] = []
```

### Extraction Pipeline (per document)

```
PDF upload → S3 storage
         → document reader async job (submit)
         → Poll for completion (exponential backoff, max 5 min)
         → Parse document reader response → OCRResult
         → Claude 3.5 Sonnet (temperature=0.0)
         → JSON parse + Pydantic validation
         → Confidence scoring per field
         → Store in tenant_audits JSONB column
```

Both documents (lease + CAM statement) are processed in parallel via Celery tasks.

---

## 2. Audit Orchestrator Pipeline

### State Machine

```
CREATED ──────▶ PAID ──────▶ EXTRACTING_LEASE ──────▶ EXTRACTING_CAM
                                                           │
                                                           ▼
COMPLETED ◀── GENERATING_REPORT ◀── REVIEWING ◀── CALCULATING
    │
    ▼
(email sent)

At any point: ──▶ FAILED (with error_message)
```

### State Transitions

| From | To | Trigger |
|------|----|---------|
| `created` | `paid` | Stripe webhook `checkout.session.completed` |
| `paid` | `extracting_lease` | Celery task starts lease extraction |
| `extracting_lease` | `extracting_cam` | Lease extraction completes successfully |
| `extracting_cam` | `calculating` | CAM extraction completes successfully |
| `calculating` | `reviewing` | Calculation engine produces results |
| `reviewing` | `generating_report` | Automated review passes quality checks |
| `generating_report` | `completed` | PDF generated and stored in S3 |
| Any | `failed` | Unrecoverable error (logged with error_message) |

### Orchestrator Implementation

```python
class TenantAuditOrchestrator:
    """Drives a tenant audit through its lifecycle."""

    def __init__(self, supabase: SupabaseDB, s3: S3Client):
        self.supabase = supabase
        self.s3 = s3
        self.extraction = ExtractionOrchestrator(...)
        self.bridge = ExtractionToCalculationBridge()
        self.report_gen = ReportGenerator()
        self.email = EmailService()

    async def process_audit(self, audit_id: UUID) -> None:
        """Main entry point — called by Celery after payment."""
        audit = await self._get_audit(audit_id)

        try:
            # Phase 1: Extract lease terms
            await self._transition(audit, "extracting_lease")
            lease_result = await self._extract_lease(audit)

            # Phase 2: Extract CAM statement
            await self._transition(audit, "extracting_cam")
            cam_result = await self._extract_cam_statement(audit)

            # Phase 3: Calculate correct amounts
            await self._transition(audit, "calculating")
            calc_result = await self._calculate(lease_result, cam_result)

            # Phase 4: Compare and find discrepancies
            await self._transition(audit, "reviewing")
            discrepancies = self._compare(cam_result, calc_result)

            # Phase 5: Generate report
            await self._transition(audit, "generating_report")
            report_key = await self._generate_report(
                audit, lease_result, cam_result, calc_result, discrepancies
            )

            # Phase 6: Complete
            await self._complete(audit, report_key, discrepancies)
            await self._send_completion_email(audit)

        except Exception as e:
            await self._fail(audit, str(e))
            await self._send_failure_email(audit)
            raise
```

### Error Handling & Retries

| Error Type | Retry Strategy | Max Retries |
|------------|---------------|:-----------:|
| document reader timeout | Exponential backoff (30s, 60s, 120s) | 3 |
| Claude API error | Exponential backoff (5s, 15s, 45s) | 3 |
| Claude JSON parse failure | Re-prompt with "Return valid JSON only" | 2 |
| Calculation error | No retry (deterministic — bug if it fails) | 0 |
| ReportLab error | No retry (deterministic) | 0 |
| S3 upload failure | Linear retry (5s) | 3 |
| Stripe webhook miss | Stripe auto-retries for 72 hours | N/A |

### Quality Gate (Review Phase)

Before generating the report, an automated review checks:

```python
def review_audit_quality(
    lease: LeaseExtractionResult,
    cam: CamStatementExtractionResult,
    calc: TenantReconciliation,
) -> ReviewResult:
    """Check extraction quality before generating report."""
    issues = []

    # Check extraction confidence
    low_conf_fields = lease.low_confidence_fields + cam.low_confidence_fields
    if len(low_conf_fields) > 5:
        issues.append("Too many low-confidence extractions")

    # Check for impossible values
    if cam.totals.total_operating_expenses <= 0:
        issues.append("Total operating expenses is zero or negative")

    if lease.pro_rata_share and lease.pro_rata_share > Decimal("100"):
        issues.append("Pro-rata share exceeds 100%")

    # Check lease/CAM consistency
    if lease.pro_rata_share and cam.pro_rata_share_stated:
        diff = abs(lease.pro_rata_share - cam.pro_rata_share_stated)
        if diff > Decimal("0.5"):
            issues.append(f"Pro-rata share mismatch: lease={lease.pro_rata_share}, CAM={cam.pro_rata_share_stated}")

    return ReviewResult(passed=len(issues) == 0, issues=issues)
```

If the review fails, the audit transitions to `failed` with the issues listed. The tenant receives an email explaining that the documents couldn't be processed automatically and offering a refund.

---

## 3. Bridge Functions

The bridge translates extraction results into the existing calculation engine's input types.

```python
class ExtractionToCalculationBridge:
    """Converts extraction results into calculation engine inputs."""

    def build_reconciliation_input(
        self,
        cam: CamStatementExtractionResult,
    ) -> ReconciliationInput:
        """Build ReconciliationInput from CAM statement extraction."""
        return ReconciliationInput(
            property_id=uuid4(),  # Synthetic — not a real property
            period_start=cam.reconciliation_period.start_date,
            period_end=cam.reconciliation_period.end_date,
            total_rentable_sqft=cam.rentable_sqft_building or Decimal("0"),
            target_occupancy=cam.adjustments.occupancy_rate_stated or Decimal("0.95"),
        )

    def build_lease_terms(
        self,
        lease: LeaseExtractionResult,
        cam: CamStatementExtractionResult,
    ) -> LeaseTerms:
        """Build LeaseTerms from lease + CAM extraction."""
        return LeaseTerms(
            lease_id=uuid4(),  # Synthetic
            tenant_name=cam.tenant_name or "Tenant",
            rentable_sqft=cam.rentable_sqft_tenant or Decimal("0"),
            pro_rata_share=lease.pro_rata_share,
            base_year=lease.base_year,
            admin_fee_percent=lease.admin_fee_percent,
            gross_up_target=lease.gross_up_target,
            cap_type=lease.cap_type,
            cap_rate=lease.cap_rate,
            excluded_categories=[],  # Extracted from lease if available
        )

    def build_expense_pools(
        self,
        cam: CamStatementExtractionResult,
    ) -> dict[UUID, ExpensePoolSummary]:
        """Convert CAM line items into expense pool summaries."""
        pools = {}
        for item in cam.expense_line_items:
            pool_id = uuid4()
            pools[pool_id] = ExpensePoolSummary(
                pool_id=pool_id,
                pool_name=item.category,
                total_amount=item.actual_amount,
                is_variable=(item.classification == "variable"),
                is_capital=item.is_capital,
            )
        return pools
```

### Discrepancy Detection

After the calculation engine produces the "correct" result, compare against what the landlord charged:

```python
class DiscrepancyDetector:
    """Compare landlord's CAM statement against calculated correct amounts."""

    TOLERANCE = Decimal("1.00")  # $1 tolerance for rounding

    def detect(
        self,
        cam: CamStatementExtractionResult,
        calc: TenantReconciliation,
    ) -> list[Discrepancy]:
        discrepancies = []

        # 1. Pro-rata share
        self._check_pro_rata(cam, calc, discrepancies)

        # 2. Gross-up
        self._check_gross_up(cam, calc, discrepancies)

        # 3. Cap enforcement
        self._check_caps(cam, calc, discrepancies)

        # 4. Admin fee
        self._check_admin_fee(cam, calc, discrepancies)

        # 5. Base year stop
        self._check_base_year(cam, calc, discrepancies)

        # 6. Total tenant share
        self._check_total(cam, calc, discrepancies)

        # 7. Capital vs. operating classification
        self._check_capital_classification(cam, discrepancies)

        # 8. Occupancy adjustment
        self._check_occupancy(cam, calc, discrepancies)

        return discrepancies

class Discrepancy(BaseModel):
    category: str                           # "Gross-Up", "Cap Enforcement", etc.
    field: str                              # specific field name
    landlord_value: Decimal                 # what landlord charged
    correct_value: Decimal                  # what calculation says
    difference: Decimal                     # landlord - correct (positive = overcharge)
    severity: Literal["info", "warning", "error"]
    explanation: str                        # human-readable explanation
    lease_reference: Optional[str] = None   # e.g., "Section 8.2"
```

---

## 4. Stripe One-Time Payment

### Integration Pattern

Uses Stripe Checkout Sessions (hosted payment page) for one-time payments. No subscriptions, no recurring billing.

```python
# backend/app/services/billing/tenant_audit_payments.py

class TenantAuditPaymentService:
    """Manages one-time payments for tenant audits."""

    TIER_PRICES = {
        "standard": 4900,   # $49.00 in cents
        "detailed": 9900,   # $99.00
        "expert": 19900,    # $199.00
    }

    async def create_checkout_session(
        self, audit_id: UUID, access_token: UUID, tier: str, email: str
    ) -> str:
        """Create Stripe Checkout Session and return URL."""
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "unit_amount": self.TIER_PRICES[tier],
                    "product_data": {
                        "name": f"CAM Audit — {tier.title()}",
                        "description": self._tier_description(tier),
                    },
                },
                "quantity": 1,
            }],
            customer_email=email,
            success_url=f"{settings.TENANT_FRONTEND_URL}/audit/{access_token}?status=paid",
            cancel_url=f"{settings.TENANT_FRONTEND_URL}/audit/{access_token}?status=cancelled",
            metadata={
                "audit_id": str(audit_id),
                "access_token": str(access_token),
                "tier": tier,
            },
        )
        return session.url

    async def handle_webhook(self, payload: bytes, signature: str) -> None:
        """Handle Stripe webhook for payment completion."""
        event = stripe.Webhook.construct_event(
            payload, signature, settings.STRIPE_WEBHOOK_SECRET
        )

        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            audit_id = UUID(session["metadata"]["audit_id"])

            # Update audit status
            await self._mark_paid(audit_id, session["id"], session["amount_total"])

            # Trigger processing pipeline
            process_tenant_audit.delay(str(audit_id))
```

### Refund Policy

If the audit fails (extraction quality too low), issue an automatic full refund:

```python
async def refund_audit(self, audit_id: UUID) -> None:
    audit = await self._get_audit(audit_id)
    if audit.stripe_payment_intent_id:
        stripe.Refund.create(payment_intent=audit.stripe_payment_intent_id)
```

---

## 5. Report Generation

### ReportLab PDF

```python
# backend/app/services/tenant_audit/report_generator.py

class ReportGenerator:
    """Generates PDF audit reports using ReportLab."""

    def generate(
        self,
        audit: TenantAudit,
        lease: LeaseExtractionResult,
        cam: CamStatementExtractionResult,
        calc: TenantReconciliation,
        discrepancies: list[Discrepancy],
        tier: str,
    ) -> bytes:
        """Generate PDF report and return bytes."""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        elements = []

        # All tiers
        elements.extend(self._build_header(audit))
        elements.extend(self._build_executive_summary(discrepancies))
        elements.extend(self._build_lease_terms_summary(lease))
        elements.extend(self._build_cam_statement_summary(cam))
        elements.extend(self._build_discrepancy_table(discrepancies))

        # Detailed + Expert tiers
        if tier in ("detailed", "expert"):
            elements.extend(self._build_detailed_findings(discrepancies))
            elements.extend(self._build_calculation_trace(calc))
            elements.extend(self._build_confidence_report(lease, cam))

        # Expert tier only
        if tier == "expert":
            elements.extend(self._build_dispute_letter(audit, discrepancies))

        # All tiers
        elements.extend(self._build_methodology())
        elements.extend(self._build_disclaimer())

        doc.build(elements)
        return buffer.getvalue()
```

### HTML Report

The same data powers an in-browser HTML report viewer (React component on the marketing-tenant/ frontend). The API returns structured JSON; the frontend renders it.

---

## 6. Email Delivery

Uses the existing Resend email service (`backend/app/services/email/`).

### Email Templates

| Email | Trigger | Content |
|-------|---------|---------|
| **Audit Started** | After payment | "We've received your documents and payment. Your audit is being processed." |
| **Audit Complete** | Report generated | "Your CAM audit report is ready. [View Report] [Download PDF]" |
| **Audit Failed** | Processing error | "We couldn't process your documents automatically. A full refund has been issued." |

### Email Content (Completion)

```
Subject: Your CAM Audit Report is Ready — {property_name}

Hi,

Your CAM audit for {property_name} is complete.

Summary:
- Discrepancies found: {count}
- Total overcharge identified: ${total}
- Confidence level: {confidence}%

View your full report: {report_url}
Download PDF: {pdf_url}

This link will remain active for 90 days.

— CapVeri
```

---

## 7. marketing-tenant/ Scaffold

### What to Keep from marketing/

The marketing-tenant/ site is a fork of the existing marketing/ project, stripped down and refocused for the tenant product.

**Keep (reuse as-is):**
- `components/ui/` — Shadcn/UI primitives
- `components/content/` — content layout components
- `components/mdx/` — MDX components
- `lib/structured-data.ts` — JSON-LD helpers
- `lib/content/mdx.ts` — MDX processing
- `lib/citations/` — citation system
- `generated/tokens.css` — design tokens
- Tailwind config, PostCSS config, tsconfig
- Playwright config, Vitest config

**Strip (remove):**
- `components/landing/` — landlord-specific landing components (replace with tenant versions)
- `app/checkout/` — landlord checkout flow (replace with tenant checkout)
- `app/vs/` — landlord comparison pages (replace with tenant comparisons)
- `app/tools/` — landlord calculators (keep structure, replace content)
- `config/plans.ts` — landlord plans (replace with tenant tiers)
- `data/faq-data.tsx` — landlord FAQs (replace with tenant FAQs)
- `data/pricing-faqs.ts` — landlord pricing FAQs (replace)

**Create new:**
- `app/page.tsx` — tenant landing page
- `app/audit/[token]/page.tsx` — audit wizard + status + report viewer
- `app/pricing/page.tsx` — tenant pricing
- `app/how-it-works/page.tsx` — explainer page
- `app/sample-report/page.tsx` — sample report viewer
- `app/blog/` — tenant-focused blog (same MDX infrastructure)
- `components/wizard/` — upload wizard components
- `components/report/` — report viewer components
- `config/tiers.ts` — tenant tier definitions

### File Structure

```
marketing-tenant/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Tenant landing page
│   │   ├── layout.tsx                        # Root layout
│   │   ├── pricing/page.tsx                  # Tenant pricing
│   │   ├── how-it-works/page.tsx             # Explainer
│   │   ├── sample-report/page.tsx            # Sample report
│   │   ├── audit/
│   │   │   └── [token]/
│   │   │       └── page.tsx                  # Wizard + status + report
│   │   ├── blog/
│   │   │   ├── page.tsx                      # Blog index
│   │   │   └── [slug]/page.tsx               # Blog post
│   │   ├── vs/
│   │   │   └── traditional-auditors/page.tsx # Comparison
│   │   ├── glossary/page.tsx                 # CAM glossary
│   │   ├── tools/
│   │   │   └── cam-overcharge-calculator/    # Free tool
│   │   ├── contact/page.tsx
│   │   ├── terms/page.tsx
│   │   ├── privacy/page.tsx
│   │   └── api/og/route.tsx                  # OG image generation
│   ├── components/
│   │   ├── ui/                               # Shadcn (copied from marketing/)
│   │   ├── content/                          # Content layouts (copied)
│   │   ├── mdx/                              # MDX components (copied)
│   │   ├── landing/                          # Tenant-specific landing
│   │   │   ├── TenantHeroSection.tsx
│   │   │   ├── WhatWeCheck.tsx
│   │   │   ├── HowItWorksSection.tsx
│   │   │   ├── PricingSection.tsx
│   │   │   ├── FAQSection.tsx
│   │   │   └── TrustSignals.tsx
│   │   ├── wizard/                           # Audit wizard
│   │   │   ├── WizardShell.tsx
│   │   │   ├── UploadStep.tsx
│   │   │   ├── DetailsStep.tsx
│   │   │   ├── CheckoutStep.tsx
│   │   │   └── ProcessingStep.tsx
│   │   ├── report/                           # Report viewer
│   │   │   ├── ReportViewer.tsx
│   │   │   ├── DiscrepancyTable.tsx
│   │   │   ├── DetailedFinding.tsx
│   │   │   ├── CalculationTrace.tsx
│   │   │   └── ExecutiveSummary.tsx
│   │   ├── MarketingNav.tsx                  # Tenant nav
│   │   ├── MarketingFooter.tsx               # Tenant footer
│   │   └── JsonLd.tsx                        # Structured data
│   ├── config/
│   │   └── tiers.ts                          # Tenant tier definitions
│   ├── data/
│   │   └── faq-data.tsx                      # Tenant FAQs
│   ├── lib/
│   │   ├── structured-data.ts
│   │   ├── citations/
│   │   └── content/
│   └── generated/
│       └── tokens.css
├── content/
│   └── blog/                                 # MDX blog posts
│       ├── what-is-cam-reconciliation.mdx
│       ├── cam-overcharges-common-errors.mdx
│       └── tenant-rights-cam-audit.mdx
├── public/
├── package.json
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## 8. Testing Strategy

### Backend Tests

| Area | Test Type | Coverage Target |
|------|-----------|:--------------:|
| CAM extraction prompt | Unit (mock Claude response) | 95%+ |
| CamStatementExtractionResult model | Unit (Pydantic validation) | 100% |
| Bridge functions | Unit (extraction → calculation input) | 100% |
| Discrepancy detector | Unit (known inputs → expected discrepancies) | 100% |
| Orchestrator state machine | Unit (state transitions, error paths) | 95%+ |
| Stripe payment flow | Unit (mock Stripe API) | 95%+ |
| Report generator | Unit (check PDF bytes produced) | 90%+ |
| API endpoints | Integration (TestClient) | 95%+ |
| Full pipeline | Integration (mock document reader + Claude) | Key happy paths |

### Frontend Tests

| Area | Test Type | Coverage Target |
|------|-----------|:--------------:|
| Wizard components | Unit (Vitest + Testing Library) | 90%+ |
| Report viewer | Unit (render with mock data) | 90%+ |
| File upload | Unit (drag-and-drop, validation) | 90%+ |
| API hooks | Unit (mock fetch) | 90%+ |
| Landing page | Unit (render, CTA links) | 80%+ |
| Full wizard flow | E2E (Playwright) | Happy path |

### Test Data

Create fixture files in `backend/tests/fixtures/tenant_audit/`:

```
fixtures/tenant_audit/
├── sample_lease_extraction.json           # LeaseExtractionResult
├── sample_cam_extraction.json             # CamStatementExtractionResult
├── sample_cam_extraction_no_errors.json   # Clean CAM statement
├── sample_cam_extraction_overcharges.json # CAM with known errors
├── sample_calculation_result.json         # TenantReconciliation
└── sample_discrepancies.json             # Expected discrepancies
```

### What to Mock

- **Mock**: document reader API, Claude API, Stripe API, S3, Resend
- **Do not mock**: Calculation engine, bridge functions, discrepancy detector, Pydantic models

---

## 9. New Dependencies

### Backend

| Package | Version | Purpose |
|---------|---------|---------|
| `reportlab` | ^4.0 | PDF generation |
| (existing) `stripe` | - | Already installed for landlord billing |
| (existing) `anthropic` | - | Already installed for extraction |
| (existing) `boto3` | - | Already installed for document reader/S3 |
| (existing) `celery` | - | Already installed for async jobs |

### marketing-tenant/

| Package | Version | Purpose |
|---------|---------|---------|
| `@stripe/stripe-js` | ^2.0 | Stripe.js for checkout redirect |
| `react-dropzone` | ^14.0 | File upload drag-and-drop |
| (rest inherited from marketing/ package.json) | | |

---

## 10. Backend File Structure (New Files)

```
backend/app/
├── api/v1/
│   └── tenant_audits.py              # API router
├── services/
│   ├── extraction/
│   │   ├── cam_statement_prompt.py   # New CAM statement prompt
│   │   └── cam_statement_models.py   # CamStatementExtractionResult
│   └── tenant_audit/
│       ├── __init__.py
│       ├── orchestrator.py           # TenantAuditOrchestrator
│       ├── bridge.py                 # ExtractionToCalculationBridge
│       ├── discrepancy.py            # DiscrepancyDetector
│       ├── report_generator.py       # ReportGenerator (ReportLab)
│       ├── payment.py                # TenantAuditPaymentService
│       ├── email.py                  # Audit-specific email templates
│       └── models.py                 # TenantAudit, Discrepancy models
├── models/
│   └── tenant_audit.py               # Pydantic request/response schemas
└── tests/
    ├── services/tenant_audit/
    │   ├── test_orchestrator.py
    │   ├── test_bridge.py
    │   ├── test_discrepancy.py
    │   ├── test_report_generator.py
    │   └── test_payment.py
    ├── api/
    │   └── test_tenant_audits.py
    └── fixtures/tenant_audit/
        └── (fixture JSON files)
```

---

## 11. Migration

```sql
-- migrations/YYYYMMDD_create_tenant_audits.sql

-- See architecture.md for full schema
-- Key points:
-- 1. No FK to organizations/properties (standalone)
-- 2. RLS enabled, service_role bypass only
-- 3. JSONB for extraction/calculation results
-- 4. UUID access_token for unauthenticated access
```

---

## 12. Environment Variables (New)

```bash
# Tenant audit specific
TENANT_FRONTEND_URL=https://capveri.com
STRIPE_TENANT_WEBHOOK_SECRET=whsec_...   # Separate webhook endpoint

# Reused from existing
STRIPE_SECRET_KEY=sk_...
ANTHROPIC_API_KEY=sk-ant-...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=capveri-documents
RESEND_API_KEY=re_...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CELERY_BROKER_URL=redis://...
```
