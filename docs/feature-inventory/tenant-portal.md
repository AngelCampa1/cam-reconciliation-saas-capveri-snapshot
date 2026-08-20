# Tenant Portal
> Last updated: 2026-06-29 - Tenant-aware 404 page: the shared `NotFoundPage` previously offered only landlord destinations (Dashboard, Properties, Upload Rent Roll, Data Ingestion) and pointed its "Go to Dashboard" / no-history "Go Back" buttons at the landlord `/dashboard`. A signed-in tenant who hit a bad URL was sent to routes that 403 them. The page now reads `userRole` and, for a `TENANT`, sends home/back to `/tenant/dashboard` and renders tenant quick links (Dashboard, Disputes, Notifications, Help) instead of the landlord set. Landlord and public behavior unchanged. Regression tests cover the tenant home routing, the tenant link set, and the absence of the landlord-only links. Frontend-only.
> Last updated: 2026-06-12 - Tenant dashboard raw-value humanization (F-437): the tenant dashboard (`TenantDashboard`) rendered the raw backend statement status enum into its `Badge` ("pending"/"paid"/"disputed"/"overdue" lowercase) and printed both the lease period and the statement period as raw ISO date strings ("2024-01-01 - 2024-12-31"). Tenants — the external readers CapVeri's clients invite — saw machine values on the portal's primary surface. Added a `getStatementStatusLabel` map for a title-case badge label, and routed both date ranges through the canonical timezone-safe `formatCalendarDate` (e.g. "Jan 1, 2024 – Dec 31, 2024"), matching the rest of the app. Regression tests assert the humanized badge labels (and the raw lowercase enum is absent) and the formatted period (and the raw ISO range is absent). Frontend-only.
> Last updated: 2026-06-11 - Paused-fetch false-state sweep (F-416): React Query's default `networkMode: 'online'` *pauses* (does not error) a query when the backend is unreachable, leaving `error` null and `isLoading` false. Three tenant-portal surfaces fell through to a misleading state: `NotificationList` rendered a blank area (the `notifications?.length === 0` empty state never fires for `undefined` data), `EmailPreferences` spun forever (`isLoading || !prefs`), and `DisputeDetailPage` showed "Dispute not found" (implying the dispute is gone). Each now destructures `isPaused` and guards on `error || (isPaused && !data)`, rendering a retryable "We can't reach the server right now. Check your connection and try again." notice (AA-contrast `text-destructive-strong`, pill Try again button). Regression-tested with `onlineManager.setOnline(false)` plus an `afterEach` restore to avoid the shared-singleton leak. Companion to F-415 (TenantDisputesPage). Frontend-only.
> Last updated: 2026-06-11 - Dispute status-update form contrast fix (F-381): the landlord StatusUpdateForm validation error ("Please select a status" / "Resolution summary is required…") rendered in the bright mid-red `text-destructive` (`hsl(0 84% 60%)`, ~3.9:1 on white — fails WCAG AA for normal text), while every other error paragraph on the disputes surface already used the darker AA-passing `text-destructive-strong` introduced in F-287. The form now uses `text-destructive-strong` too; regression test asserts the alert carries that class. Frontend-only, no copy/behavior change.
> Last updated: 2026-06-09 - PostHog product-analytics coverage for the dispute lifecycle. The tenant dashboard, tenant disputes list, and tenant dispute detail pages emit privacy-safe view events (`tenant_dashboard_viewed`, `tenant_disputes_viewed`, `tenant_dispute_detail_viewed`); filing and commenting emit `tenant_dispute_create_succeeded` and `tenant_dispute_comment_submit_succeeded`. The landlord dispute surfaces emit the mirror events (`landlord_disputes_viewed`, `landlord_dispute_detail_viewed`, `landlord_dispute_status_update_succeeded`, `landlord_dispute_comment_submit_succeeded`), and the dispute API endpoints (`backend/app/api/v1/disputes.py`, `backend/app/api/v1/tenant/disputes.py`) emit server-truth events. Every payload carries IDs/enums/counts only — no dispute text, names, or attachment contents — and the backend sanitizer was hardened to strip file names, tenant/property names, addresses, document URLs, and free-text note fields.
> Last updated: 2026-06-07 - Dispute status badge consistency (F-267): the landlord dispute detail page now renders status via the shared `DisputeStatusBadge` (sentence-case "Under review") instead of an inline lowercase `<Badge>`, matching the disputes list; dead `getStatusVariant` helper removed (colors unchanged). Known follow-up F-268 (deferred): the tenant-side dispute detail page has the same lowercase-badge issue but a divergent palette, so its fix awaits live tenant-portal verification.
> Last updated: 2026-06-07 - Plain-language copy pass (F-249): the tenant statement disclaimer now reads "We worked out this amount for you. Check it against your lease. If something looks off, ask your property manager." (verify/disclaimer intent kept, plainer verbs); the disputes intro drops the "billing context" jargon ("Start a dispute from a statement. That way the property team can see the exact charges."); the disputes empty state reads "No disputes yet." / "To start one, open a statement from your dashboard." Ran through the humanizer and third-grade-copy passes.
> Last updated: 2026-06-07 - Dispute polish (F-245..F-247): the landlord status-update form now clears its selection and resolution summary when the dispute's status advances (parent refetch), instead of leaving a now-invalid blank selection with stale summary text; the landlord dispute detail metadata grid stacks to one column on small screens (`grid-cols-1 sm:grid-cols-2`) so labels no longer cramp on mobile; the shared dialog close button is now a circular icon button (pill canon).
> Last updated: 2026-06-07 - Dispute detail polish (F-242..F-244): comment authors now resolve through a shared `commentAuthorLabel` helper, so the viewer's own comments read "You" and a missing name falls back to "Participant" instead of "Unknown" (landlord and tenant dispute detail pages); the landlord demand-letter dialog only shows the "Landlord name is required" message after the field is touched (and the Generate button stays disabled while empty); the landlord dispute detail header shows a friendly "Filed {date}" subtitle instead of a truncated raw dispute ID.
> Last updated: 2026-06-05 - Dispute UI accessibility and consistency pass (F-223..F-226): the tenant dispute row is now keyboard-operable (Enter and Space navigate, with a button role and focus handling); tenant and landlord surfaces share one CATEGORY_LABELS map so dispute categories read as title case instead of raw enum values; status chips use pill corners; the "Mark all read" control is a 44px tap target and the dashboard notification skeleton matches the loaded row size.
> Last updated: 2026-06-05 - The landlord disputes list "needs response" summary chip now agrees in number with its count, so a single open dispute reads "1 needs response" instead of "1 need response" (F-194).
> Last updated: 2026-05-20 - Dispute attachment downloads now work: the tenant and landlord get-dispute endpoints return a presigned GET URL (with graceful fallback to the raw key on storage error) instead of an undownloadable object key, and the tenant dispute detail page renders a real download link and the correct file size. Failed tenant dispute comments, email-preference toggles, and notification mark-as-read actions now surface error toasts instead of failing silently.
> Last updated: 2026-05-20 - Dispute comment box now clears only after the comment is saved (a failed submit keeps the typed text for retry), and icon-only dispute attachment download links carry descriptive aria-labels.
> Last updated: 2026-05-19 - Tenant dashboard statements are finalized-only and expose linked-lease PDF downloads through a tenant-scoped statement endpoint.
> Last updated: 2026-05-13 - `/tenant` now redirects to `/tenant/dashboard`, and actionable notification rows render as semantic buttons so keyboard users can open them with Enter or Space.
> Last updated: 2026-04-30 - Tenant and landlord dispute lists now use centralized status styling, count needs-response work, and harden long IDs/descriptions against overflow

> Previous: 2026-04-23 - Tenant help route and navigation added for statement reading, PDF downloads, charge explanations, and dispute filing guidance

> Previous: 2026-04-21 - Tenant routes are frontend-gated to the `TENANT` role before the tenant shell renders
> Last updated: 2026-05-08 — Updated plan-tier annotations for Reconcile/Control/Defend packaging

> Plan tier: **Defend** — Canonical keys: `tenantPortal`, `disputeManagement`, `tenantCommunications`

## Overview

Invitation-only tenant portal for viewing CAM reconciliation statements, filing disputes, and
tracking resolution. Complete data isolation enforced via RLS — tenants see only leases they are
linked to, with no access to GL data, calculations, or organization settings.

## Features

### Tenant Onboarding
- Landlord sends invitation email containing a secure token (64-char, cryptographically random via `secrets`)
- Token expires after 7 days (`INVITATION_EXPIRY_DAYS = 7`); can be revoked before use
- Token validation: format/length checks (32-128 chars) to prevent DoS, then DB lookup for expiry/used/revoked status
- Tenant self-registers at `/tenant/signup`, creating `tenant_user` + `tenant_lease_link` records
- **Endpoint**: `GET /api/v1/tenant-invitations/{token}/validate`
- **Service**: `backend/app/services/tenant_invitation.py`

### Tenant Dashboard
- Shows all linked leases with property details
- Reconciliation statements per lease: period, amount, status (PENDING / PAID / DISPUTED / OVERDUE)
- Statement list only includes finalized reconciliation snapshots; draft snapshots remain hidden from tenant users.
- Finalized statement cards include a tenant-scoped PDF download URL.
- Notification count badge
- Frontend route guard on `/tenant/*` now requires `UserRole.TENANT`, preventing authenticated landlord users from entering the tenant shell and failing only after tenant-only API calls
- **Endpoint**: `GET /api/v1/tenant/dashboard`
- **PDF endpoint**: `GET /api/v1/tenant/statements/{statement_id}/pdf`
- **Frontend**: `/tenant/dashboard`

### Tenant Help
- Tenant navigation includes `Help`.
- `/tenant/help` explains how to read a CAM statement, open or download PDF reports, review charge details, and start a dispute when something needs review.
- Help copy avoids landlord accounting jargon and directs tenants to `/tenant/dashboard`, `/tenant/disputes/new`, and notification preferences.

### Dispute Filing
- Tenants create disputes against reconciliation statements
- Rate limited: max 3 disputes per day per tenant (`MAX_DISPUTES_PER_DAY = 3`)
- Categories: CALCULATION_ERROR, MISSING_CREDIT, INCORRECT_AREA, BASE_YEAR_ISSUE, BILLING_QUESTION, OTHER
- Description field: max 5,000 characters
- Tenant dispute list surfaces total/open/needs-response counts, uses shared status badges, and wraps long dispute IDs or descriptions so cards remain readable on mobile.
- **Endpoint**: `POST /api/v1/tenant/disputes`
- **Service**: `backend/app/services/tenant/dispute_service.py`

### Dispute State Machine
- `OPEN` → `UNDER_REVIEW` → `RESOLVED` / `REJECTED` → `CLOSED`
- Closed disputes cannot be reopened (enforced by RLS policy)
- Landlord transitions status via `PATCH /api/v1/disputes/{id}/status`
- Resolution tracking: `resolved_at`, `resolved_by`, `resolution_summary`
- **Enums**: `DisputeStatus`, `DisputeCategory` in `backend/app/models/enums.py`

### Comment Threads
- Two-way communication between landlord and tenant on disputes
- Landlord can post internal comments (`is_internal = true`) hidden from tenants
- Tenants see only public comments; RLS filters internal comments from tenant queries
- File attachments supported on tenant comments (stored with path, size, MIME type)
- **Endpoints**: `POST /api/v1/disputes/{id}/comments` (admin), `POST /api/v1/tenant/disputes/{id}/comments` (tenant), `POST /api/v1/tenant/disputes/{id}/attachments`

### Dispute Management (Landlord)
- List all organization disputes with filters: property, tenant, status
- Assign disputes to staff members
- View both internal and public comments
- Landlord dispute list uses the same centralized status styling as tenant dispute pages and highlights open disputes needing a response.
- **Endpoints**: `GET /api/v1/disputes/`, `GET /api/v1/disputes/{id}`

### Notifications
- Types: NEW_STATEMENT, DISPUTE_UPDATE, STATEMENT_REMINDER, SYSTEM
- Email delivery preferences: instant, daily digest, or weekly digest
- Mark read/unread in-app
- Rate limited: max 10 emails per hour per tenant (`MAX_EMAILS_PER_HOUR = 10`)
- **Endpoints**: `GET /api/v1/tenant/notifications`, email preference endpoints
- **Service**: `backend/app/services/tenant/notification_service.py`

### Data Isolation
- Tenants see ONLY leases they are linked to via `tenant_lease_links` junction table
- Tenant statement PDF downloads are constrained by the current tenant's linked lease IDs and require a finalized snapshot.
- No access to: GL entries, calculation internals, pool mappings, organization settings
- Internal dispute comments (`is_internal = true`) hidden from tenant queries
- All isolation enforced at the PostgreSQL RLS level — not just application code

## Frontend Pages

- `/tenant/signup` — Token validation and self-registration form
- `/tenant/dashboard` — Lease list, statement cards, notification count badge
- `/tenant/help` - Plain-language help for statements, PDFs, charges, disputes, and notifications
- `/tenant/disputes` — Dispute list with status/category filters
- `/tenant/disputes/{id}` — Dispute detail with comment thread, file attachments, status history
- `/tenant/notifications` — Notification list, mark read/unread, email preference settings

## Database Tables

- **tenant_users** — `contact_name`, `contact_email`, org-scoped
- **tenant_lease_links** — `tenant_user_id`, `lease_id` junction table for data isolation
- **tenant_invitations** — `token` (64-char secure), `expires_at`, `used_at`, `is_revoked`, `lease_id`, `tenant_email`
- **disputes** — `tenant_user_id`, `statement_id`, `category` enum, `status` enum, `description` (max 5000), `assigned_to`, `resolution_summary`, `resolved_at`, `resolved_by`
- **dispute_comments** — `dispute_id`, `user_id`, `content`, `is_internal` boolean (hidden from tenants)
- **dispute_attachments** — `dispute_id`, `storage_path`, `file_size`, `mime_type`, `uploaded_by`

## Key Files

- `backend/app/services/tenant_invitation.py` — Token generation, validation, signup flow
- `backend/app/services/tenant/dispute_service.py` — Dispute CRUD with rate limiting
- `backend/app/services/tenant/notification_service.py` — In-app + email notifications
- `backend/app/api/v1/tenant/` — Tenant-facing REST endpoints
- `backend/app/api/v1/disputes.py` — Landlord-facing dispute management endpoints
- `backend/app/models/enums.py` — DisputeStatus, DisputeCategory, NotificationType, StatementStatus enums
