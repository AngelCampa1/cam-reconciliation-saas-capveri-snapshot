# Epic T5: Audit Wizard

## Epic Info
- **Product**: Tenant CAM Audit
- **Estimated Hours**: 34
- **Status**: `pending`

## Goal

Build the multi-step audit wizard that guides a commercial tenant from file upload through payment to report delivery. The entire flow lives at `/audit/[token]` and requires no authentication -- the UUID access token IS the credential.

## Business Value

This is the core conversion funnel for the tenant CAM audit product. A frictionless wizard that takes a tenant from "I think my landlord is overcharging me" to "here's proof" in under 5 minutes (upload + pay) with automated delivery (processing + report). Every step must feel fast, trustworthy, and dead simple.

## User Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Upload     │───>│   Details    │───>│   Checkout   │───>│  Processing  │───>│    Report    │
│              │    │              │    │              │    │              │    │              │
│ Lease PDF    │    │ Email        │    │ Stripe       │    │ Status poll  │    │ Summary      │
│ CAM stmt PDF │    │ Property     │    │ Checkout     │    │ Progress bar │    │ Discrepancies│
│              │    │ Tier select  │    │ Session      │    │ "Bookmark"   │    │ Download PDF │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

## Architecture

### Route Structure

All wizard steps render under a single dynamic route:

```
marketing-tenant/src/app/audit/[token]/page.tsx
```

The page reads the audit status from `GET /api/v1/tenant-audits/{token}` and renders the appropriate step component. On first visit (no token yet), a `POST /api/v1/tenant-audits/` creates the audit and redirects to `/audit/{new_token}`.

### State Management

Wizard state is server-driven. The audit record's `status` field determines which step is shown:

| Status | Step Component |
|--------|---------------|
| `created` | `UploadStep` (if no files) or `DetailsStep` (if files uploaded) |
| `payment_pending` | `CheckoutStep` |
| `paid` | `ProcessingStep` |
| `processing` | `ProcessingStep` |
| `completed` | `ReportViewer` |
| `failed` | Error state with refund notice |
| `refunded` | Refund confirmation |

### API Integration

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/tenant-audits/` | POST | Create audit + upload files |
| `/api/v1/tenant-audits/{token}` | GET | Poll status, get audit data |
| `/api/v1/tenant-audits/{token}` | PATCH | Update details (email, tier, property info) |
| `/api/v1/tenant-audits/{token}/pay` | POST | Create Stripe Checkout Session |
| `/api/v1/tenant-audits/{token}/report` | GET | Download PDF report |

### Component Tree

```
AuditWizardPage
├── WizardProgress (step indicator)
├── UploadStep
│   ├── FileDropZone (lease)
│   └── FileDropZone (CAM statement)
├── DetailsStep
│   ├── EmailInput
│   ├── PropertyFields (optional)
│   └── TierSelector
├── CheckoutStep
│   └── StripeRedirect
├── ProcessingStep
│   ├── PhaseIndicator[]
│   └── ProgressBar
└── ReportViewer
    ├── ExecutiveSummary
    ├── DiscrepancyTable
    ├── DetailedFindings
    ├── CalculationTrace
    ├── DownloadPdfButton
    └── NextSteps
```

## Key Design Decisions

1. **Server-driven step routing** -- The wizard does not use client-side step state. The audit record's `status` is the single source of truth for which step to show. This means bookmarked URLs always show the correct step, and browser refreshes never lose progress.

2. **Token-as-credential** -- No login required. The UUID token in the URL grants read/write access to that specific audit. This is the same pattern used by services like Typeform, Calendly, and DocuSign.

3. **Stripe hosted checkout** -- We redirect to Stripe's hosted checkout page rather than embedding Stripe Elements. This avoids PCI scope, is faster to implement, and has higher conversion rates for one-time payments.

4. **Polling over WebSocket** -- The processing step uses `GET` polling (every 3 seconds) rather than WebSocket connections. Simpler infrastructure, works through CDN/proxy layers, and the processing step is visited infrequently enough that polling overhead is negligible.

5. **Progressive tier disclosure** -- The Details step defaults to the Detailed tier ($99) which is the best value. Standard and Expert tiers are visible but the Detailed tier is pre-selected and visually emphasized.

## Stories

| Story | Title | Hours | Dependencies |
|-------|-------|-------|-------------|
| [T5.1](./story-T5.1-upload-step.md) | Upload Step | 6 | T1.4 (API endpoints), T4.1 (scaffold) |
| [T5.2](./story-T5.2-details-step.md) | Details Step | 6 | T5.1 |
| [T5.3](./story-T5.3-checkout-step.md) | Checkout Step | 5 | T1.2 (Stripe payment), T5.2 |
| [T5.4](./story-T5.4-processing-step.md) | Processing Step | 6 | T1.4 (status endpoint), T5.3 |
| [T5.5](./story-T5.5-report-viewer.md) | Report Viewer | 11 | T1.4 (report endpoint), T5.4 |

**Total Hours**: 34

## Dependencies

- **T1.4**: Tenant Audit API Endpoints (all CRUD + status + report)
- **T1.2**: Stripe One-Time Payment (checkout session creation)
- **T4.1**: Marketing-tenant scaffold (Next.js app shell, routing, shared components)
- **T2/T3**: Extraction + calculation pipeline (for processing step to actually complete)
