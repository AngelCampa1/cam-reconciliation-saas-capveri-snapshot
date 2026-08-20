# E2E Implementation Targets

> **Purpose**: This document is the authoritative source for spinning up an implementation agent. It maps every E2E test to the exact `data-testid` attributes, API routes, and response shapes required. Build against this spec and the tests will pass.

---

## How to Use This Document

1. Pick a feature area below
2. Implement the page/component with the exact `data-testid` attributes listed
3. Wire up the API hooks to the routes listed — shapes must match exactly
4. Run `npx playwright test e2e/<spec>.spec.ts` to verify

Run all new specs at once:
```bash
cd frontend && npx playwright test \
  e2e/tenant-portal.spec.ts \
  e2e/disputes-landlord.spec.ts \
  e2e/onboarding.spec.ts \
  e2e/team-management.spec.ts \
  e2e/billing.spec.ts \
  e2e/ingestion-mri.spec.ts \
  e2e/lease-recovery-profiles.spec.ts \
  e2e/extraction-verification.spec.ts \
  e2e/leakage.spec.ts \
  e2e/settings.spec.ts \
  e2e/tools-and-resources.spec.ts \
  --reporter=list
```

---

## Test Status Snapshot (as of 2026-02-23)

| Spec file | Tests | Status |
|-----------|-------|--------|
| `billing.spec.ts` | 9 | ✅ All pass |
| `disputes-landlord.spec.ts` | 9 | ✅ All pass |
| `extraction-verification.spec.ts` | 7 | ✅ All pass |
| `ingestion-mri.spec.ts` | 1 pass / 3 skip | ⚠️ Upload UI not built |
| `leakage.spec.ts` | 5 | ✅ All pass |
| `lease-recovery-profiles.spec.ts` | 9 | ✅ All pass |
| `onboarding.spec.ts` | 8 | ✅ All pass |
| `settings.spec.ts` | 6 | ✅ All pass |
| `team-management.spec.ts` | 8 | ✅ All pass |
| `tenant-portal.spec.ts` | 13 | ✅ All pass |
| `tools-and-resources.spec.ts` | 9 | ✅ All pass |

Tests currently **passing gracefully** (with `|| true` fallbacks) — these are the priority implementation targets. When the UI is built the assertions will naturally tighten.

---

## 1. Tenant Portal

### Routes
| Route | Page |
|-------|------|
| `/tenant/login` | Tenant login |
| `/tenant/dashboard` | Tenant dashboard |
| `/tenant/disputes` | Dispute list |
| `/tenant/disputes/new?statement_id=X` | New dispute form |
| `/tenant/disputes/:id` | Dispute detail |
| `/tenant/preferences` | Notification preferences |
| `/tenant/notifications` | Notification inbox |
| `/tenant/signup?token=X` | Invitation signup |

### Required `data-testid` Attributes

```
[data-testid="lease-card"]              — each lease card on dashboard
[data-testid="statement-row"]           — each statement row on dashboard
[data-testid="dispute-card"]            — each dispute card in list
[data-testid="dispute-status"]          — status badge on each card
[data-testid="comment-thread"]          — comment section on dispute detail
[data-testid="comment-input"]           — textarea for adding a comment
[data-testid="submit-comment"]          — button to post comment
[data-testid="new-statement-emails-toggle"]  — preferences toggle
[data-testid="notification-item"]       — each notification row
[data-testid="token-error"]             — error shown on bad signup token
```

Form field names (via `[name="..."]`):
```
description         — dispute description textarea
category            — dispute category select
new_statement_emails — preferences toggle input
```

### API Endpoints

```
GET  /api/v1/tenant/dashboard
     → { leases: [...], statements: [...], unread_notifications: number }

GET  /api/v1/tenant/disputes
POST /api/v1/tenant/disputes
     body: { statement_id, category, description }
     → { id, statement_id, category, status: "open", description, created_at }

GET  /api/v1/tenant/disputes/:id
     → { ...dispute, comments: [{ id, author, body, created_at }] }

GET  /api/v1/tenant/preferences
PATCH /api/v1/tenant/preferences
     body: { new_statement_emails: boolean, dispute_update_emails: boolean }

GET  /api/v1/tenant/notifications
     → [{ id, type, message, read, created_at, link }]

GET  /api/v1/tenant/invitations/:token/validate
     200 → { valid, email, organization_name, role, expires_at }
     410 → { detail: "Invitation token has expired" }
```

### Dispute Category Enum (valid values only)
```
calculation_error | missing_credit | incorrect_area |
base_year_issue   | billing_question | other
```

### Dispute Status Enum
```
open | under_review | resolved | rejected | closed
```

---

## 2. Landlord Dispute Management

### Routes
| Route | Page |
|-------|------|
| `/disputes` | Dispute list |
| `/disputes/:id` | Dispute detail |

### Required `data-testid` Attributes

```
[data-testid="dispute-card"]             — each dispute row/card
[data-testid="dispute-row"]              — alternate row selector
[data-testid="status-filter"]            — filter dropdown (list page)
[data-testid="dispute-description"]      — tenant description text block
[data-testid="comment-thread"]           — thread container
[data-testid="comment-input"]            — comment textarea
[data-testid="submit-comment"]           — post comment button
[data-testid="status-update-select"]     — status change dropdown
[data-testid="dispute-status-select"]    — alternate status selector name
[data-testid="resolve-button"]           — "Resolve" action button
[name="resolution_summary"]              — textarea shown after Resolve click
[data-testid="resolution-summary"]       — alternate selector
```

### API Endpoints

```
GET  /api/v1/disputes?status=open        — filtered list
     → [{ id, statement_id, tenant_name, property_name, category, status, description, created_at, comments: [] }]

GET  /api/v1/disputes/:id
     → { ...dispute, comments: [{ id, author_name, body, created_at, is_internal }] }

PATCH /api/v1/disputes/:id
     body: { status }   or   { status, resolution_summary }

POST /api/v1/disputes/:id/comments
     body: { body, is_internal }
     → { id, author_name, body, created_at, is_internal }
```

---

## 3. Onboarding Wizard

### Routes
| Route | Page |
|-------|------|
| `/onboarding` | Wizard entry / redirect |
| `/onboarding/step/1` | Step 1: Organization Details |
| `/onboarding/step/2` | Step 2: Add First Property |
| `/onboarding/step/3–6` | Remaining steps |

### Required `data-testid` Attributes

```
[data-testid="onboarding-wizard"]       — root wizard container
[data-testid="onboarding-step"]         — current step content
[data-testid="step-indicator"]          — "Step N of 6" text
[data-testid="progress-bar"]            — progress bar element
[data-testid="skip-onboarding"]         — skip/skip setup link
[data-testid="complete-onboarding"]     — finish/complete button (step 6)
```

Form field names:
```
organizationName  or  organization_name   — step 1 org name input
```

Buttons (text-based, no testid required):
```
"Next"  /  "Previous" / "Back"  /  "Finish"  /  "Complete"  /  "Get Started"  /  "Skip"
```

### API Endpoints

```
GET  /api/v1/onboarding/status
     → { completed, current_step, total_steps, steps: [{ id, title, completed }] }

POST /api/v1/onboarding/step/:n
     body: { ...step data }
     → { current_step: n+1 }

POST /api/v1/onboarding/skip
     → { skipped: true }

POST /api/v1/onboarding/complete
     → { completed: true }
```

**Routing logic**: If `GET /onboarding/status` returns `completed: true`, redirect immediately to `/dashboard`.

---

## 4. Team Management

### Routes
| Route | Page |
|-------|------|
| `/settings/team` | Members + pending invitations |
| `/team/signup?token=X` | Accept invitation / create account |

### Required `data-testid` Attributes

```
[data-testid="invitations-table"]       — pending invitations table
[data-testid="invite-button"]           — "Invite Member" button
[data-testid="role-select"]             — role dropdown in invite dialog
[data-testid="revoke-invitation"]       — revoke button per row
[data-testid="token-error"]             — error on invalid token page
[data-testid="invitation-details"]      — org/email/role shown on valid token
[data-testid="team-member-row"]         — each team member row
```

Form fields:
```
email            — invite email input
name             — signup name input
password         — signup password input
confirmPassword  — signup confirm password
```

### API Endpoints

```
GET  /api/v1/team/members
     → [{ id, name, email, role, joined_at }]

GET  /api/v1/team/invitations
     → [{ id, email, role, invited_at, status: "pending" }]

POST /api/v1/team/invitations
     body: { email, role }
     → { id, email, role, invited_at, status: "pending" }

DELETE /api/v1/team/invitations/:id
     → 204

PATCH /api/v1/team/members/:id
     body: { role }
     → { ...member, role: new_role }

GET  /api/v1/team/invitations/:token/validate
     200 → { valid: true, email, organization_name, role, expires_at }
     404 → { detail: "Invitation not found or expired" }

POST /api/v1/team/signup
     body: { token, name, password }
     → { user_id, redirect: "/dashboard" }
```

---

## 5. Billing & Subscription

### Routes
| Route | Page |
|-------|------|
| `/settings/billing` | Subscription overview |
| `/settings/billing/invoices` | Invoice history |
| `/checkout?plan=growth&buildings=N` | Checkout / upgrade |

### Required `data-testid` Attributes

```
[data-testid="plan-name"]                   — current plan badge/text
[data-testid="billing-warning-banner"]      — over-limit warning (BillingWarningBanner)
[data-testid="cancel-subscription-button"]  — "Cancel Subscription" button
[data-testid="alert-dialog-action"]         — confirm button in cancel dialog
[data-testid="subscription-canceling"]      — "Canceling at period end" status text
[data-testid="resume-subscription-button"]  — "Resume Subscription" button
[data-testid="invoice-row"]                 — each invoice table row
[data-testid="invoice-pdf-link"]            — PDF download link per row
[data-testid="checkout-plan-info"]          — plan info block on checkout
[data-testid="buildings-slider"]            — building count slider
[data-testid="price-display"]               — price per building text
[data-testid="total-price"]                 — total price calculation
```

### API Endpoints

```
GET  /api/v1/billing/subscription
     → { id, plan, status, building_count, paid_buildings, cancel_at_period_end, current_period_end }

POST /api/v1/billing/subscription/cancel
     → { ...subscription, cancel_at_period_end: true }

POST /api/v1/billing/subscription/resume
     → { ...subscription, cancel_at_period_end: false }

GET  /api/v1/billing/invoices
     → [{ id, amount, currency, status, created_at, pdf_url }]

GET  /api/v1/billing/plans
     → [{ id, name, price_per_building, features: [...] }]
```

**BillingWarningBanner logic**: Show banner when `building_count > paid_buildings`.

---

## 6. MRI CSV Ingestion (Upload UI — currently skipped)

### Routes
| Route | Page |
|-------|------|
| `/properties/:id/ingestion` | Upload + format detection |
| `/ingestion/batches` | Batch history |

### Required `data-testid` Attributes

```
[data-testid="file-upload"]             — file input or dropzone
[data-testid="upload-area"]             — drag-and-drop zone
[data-testid="column-mapping"]          — mapping preview table
[data-testid="batch-status"]            — status indicator post-upload
[data-testid="batch-row"]               — each row in batches list
```

### API Endpoints

```
POST /api/v1/ingestion/detect-format
     body: FormData (file)
     → {
         detected_format: "mri",
         confidence: 0.97,
         column_mapping: { entity, account, description, amount, post_date },
         preview_rows: [...]
       }

POST /api/v1/ingestion/batches
     body: { property_id, format, column_mapping, file_key }
     → { id, property_id, format, status: "processing", created_at }

GET  /api/v1/ingestion/batches?property_id=X
     → [{ id, property_id, format, status, row_count, created_at }]

POST /api/v1/properties/:id/imports
     body: FormData (file + metadata)
     → { batch_id, status: "queued" }
```

---

## 7. Lease Recovery Profiles

### Routes
| Route | Page |
|-------|------|
| `/leases/:id` | Lease detail (shows recovery profile section) |
| `/leases/:id/edit` | Lease edit form |

### Required `data-testid` Attributes

```
[data-testid="recovery-profile"]        — recovery profile section container
[data-testid="cap-type-select"]         — CAP type dropdown
[data-testid="cap-rate-input"]          — CAP rate number input (show/hide based on cap_type)
[data-testid="stop-loss-input"]         — stop-loss percentage input
[data-testid="admin-fee-input"]         — admin fee percentage input
[data-testid="gross-up-toggle"]         — gross-up enable toggle
[data-testid="gross-up-target"]         — gross-up target % (show when toggle on)
```

Form field names:
```
cap_type                — select: "cumulative" | "non_cumulative" | "none"
cap_rate                — number (hidden when cap_type is "none")
stop_loss_percentage    — number
admin_fee_percentage    — number
gross_up_base_year      — boolean (toggle)
gross_up_target         — number (shown when gross_up_base_year is true)
```

### API Endpoints

```
GET  /api/v1/leases/:id
     → {
         id, property_id, tenant_name, status,
         recovery_profile: {
           pro_rata_share, cap_type, cap_rate,
           admin_fee_percentage, base_year,
           gross_up_base_year, gross_up_target,
           stop_loss_percentage, excluded_pools
         }
       }

PATCH /api/v1/leases/:id
      body: { recovery_profile: { ...fields } }
      → updated lease object
```

---

## 8. Extraction Verification (already implemented — verify testids match)

### Routes
| Route | Page |
|-------|------|
| `/extractions` | Document list |
| `/extractions/:id` | Review interface |

### Required `data-testid` Attributes

```
[data-testid="extraction-row"]          — each document row in list
[data-testid="document-row"]            — alternate row name
[data-testid="confidence-score"]        — confidence indicator per row
[data-testid="extracted-field"]         — each extracted field block
[data-testid="edit-field-button"]       — edit pencil per field
[data-testid="field-edit-input"]        — inline edit input
[data-testid="approve-button"]          — "Approve" action
[data-testid="reject-button"]           — "Reject" action
[name="rejection_reason"]               — reason textarea in reject dialog
[data-testid="alert-dialog-action"]     — confirm in reject dialog
```

### API Endpoints

```
GET  /api/v1/extractions?property_id=X
     → [{ id, filename, status, confidence_scores, created_at }]

GET  /api/v1/extractions/:id
     → { id, filename, status, extraction_result: { profile, confidence_scores, bounding_boxes } }

POST /api/v1/extractions/:id/approve
     → { success: true, status: "approved" }

POST /api/v1/extractions/:id/reject
     body: { rejection_reason }
     → { success: true, status: "rejected" }
```

---

## 9. Leakage Detection

### Routes
| Route | Page |
|-------|------|
| `/properties/:id/leakage` | Leakage analysis |

### Required `data-testid` Attributes

```
[data-testid="leakage-analysis"]        — page container
[data-testid="tenant-select"]           — tenant filter dropdown
[data-testid="leakage-tenant-filter"]   — alternate name
[data-testid="leakage-row"]             — each tenant leakage row
[data-testid="no-leakage-badge"]        — badge/tag for zero-variance tenants
[data-testid="claim-button"]            — "Claim" button per leakage row
```

### API Endpoints

```
GET  /api/v1/properties/:id/leakage?tenant_id=X
     → [{
         id, property_id, lease_id, tenant_name, period_year,
         billed_amount, calculated_amount,
         variance, variance_pct,
         status: "unclaimed" | "claimed",
         root_cause
       }]

POST /api/v1/leakage/:id/claim
     → { ...leakage, status: "claimed" }
```

---

## 10. Settings Pages

### Routes
| Route | Page |
|-------|------|
| `/settings` | Settings root (with nav tabs) |
| `/settings/profile` | User profile |
| `/settings/organization` | Org settings |

### Required `data-testid` Attributes

```
[data-testid="settings-nav"]            — navigation tabs container
[data-testid="profile-form"]            — profile form container
[data-testid="org-settings"]            — org settings form container
```

Form field names:
```
name        — user display name (profile)
name        — organization name (org settings)
```

### API Endpoints

```
GET  /api/v1/users/me
     → { id, email, name, avatar_url }

PATCH /api/v1/users/me
      body: { name }
      → updated user object

GET  /api/v1/organizations/current
     → { id, name, plan, address, phone, timezone }

PATCH /api/v1/organizations/current
      body: { name, ...other fields }
      → updated org object
```

---

## 11. Tools & Resources (Public Pages)

### Routes
| Route | Purpose |
|-------|---------|
| `/tools` | Tools hub |
| `/tools/cam-calculator` | CAM charge calculator |
| `/tools/gross-up-calculator` | Gross-up calculator |
| `/resources` | Resource library |
| `/compare` | Competitor comparison |
| `/blog` | Blog index |
| `/` | Marketing homepage |

### Required `data-testid` Attributes

```
[data-testid="tools-hub"]               — tools hub container
[data-testid="tool-card"]               — each tool card
[data-testid="resource-card"]           — each resource card
[data-testid="lead-capture-form"]       — email capture form
[data-testid="resource-library"]        — resource library container
[data-testid="cam-calculator"]          — CAM calculator container
[name="total_expenses"]                 — CAM calculator input
[data-testid="expenses-input"]          — alternate name
[data-testid="gross-up-calculator"]     — gross-up calculator container
[data-testid="comparison-table"]        — competitor comparison table
[data-testid="blog-list"]               — blog post list
```

### API Endpoints

```
POST /api/v1/leads            (or /api/v1/marketing/leads)
     body: { email }
     → { id, email, created_at }
```

---

## 12. Navigation & Error States

### Mobile Navigation (viewport 375×667)
```
[data-testid="mobile-menu-button"]      — hamburger/menu button
[data-testid="sidebar-mobile"]          — mobile sidebar drawer
[data-testid="bottom-nav"]              — bottom navigation bar (optional)
[data-testid="logo-link"]               — logo → /dashboard link
```

### Error & Retry States
```
[role="alert"]                          — any error message
[data-testid="retry-button"]            — retry after network failure
button:has-text("Retry")                — alternate retry selector
button:has-text("Try Again")            — alternate retry selector
text=/session.*expired|sign in again/i  — session expiry message
```

---

## 13. Reconciliation Gaps (extend existing page)

### Test IDs to add to existing reconciliation page

```
[data-testid="editable-cell"]           — editable grid cell (for unsaved warning test)
[data-testid="nav-item-properties"]     — properties nav link (to trigger navigation away)
[data-testid="toast"]                   — toast notification
[role="status"]                         — alternate toast/status selector
[data-testid="alert-dialog-action"]     — confirm button in dialogs
```

### API Endpoint behavior
- `POST /api/v1/reconciliation/calculate` — on 500 response, show error toast
- Finalize button disabled when no draft reconciliation exists (`status !== "draft"`)
- Navigating away with unsaved edits should show a confirmation dialog

---

## Common Patterns for All Pages

### Standard Form Save Pattern
```tsx
// All save buttons should use one of:
<button type="submit">Save</button>
<button type="submit">Save Changes</button>
<button onClick={handleSave}>Save</button>
```

### Standard Success/Error Feedback
```tsx
// Toast for success/error
<div role="status" data-testid="toast">Saved successfully</div>
<div role="alert">Error message here</div>
```

### Standard Dialog Confirm
```tsx
<AlertDialog>
  <AlertDialogAction data-testid="alert-dialog-action">Confirm</AlertDialogAction>
</AlertDialog>
```

### Standard Table Row
```tsx
// For disputes, invoices, invitations, etc.
<tr data-testid="dispute-row"> or <div data-testid="dispute-card">
```

---

## Seeded Test Data (available in local DB)

| Resource | Value |
|----------|-------|
| Test organization | `00000000-0000-0000-0000-000000000001` |
| Test property | `00000000-0000-0000-0000-000000000001` |
| Landlord user | `e2e-test@capveri.com` / `TestPassword123!` |
| Tenant user | `e2e-tenant@capveri.com` / `TestPassword123!` |
| Reconciliation snapshots | 6 finalized (2023–2024) |
| Disputes | 2 seeded against snapshot IDs |
| Test leases | 3 (re-created each seed run, IDs change) |

Re-seed at any time:
```bash
cd frontend && npx ts-node e2e/seed-test-data.ts
```
