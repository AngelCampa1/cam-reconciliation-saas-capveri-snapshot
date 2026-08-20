  # Backend/Frontend Wiring Gap Closure (Full API Sweep)

  ## Summary

  Perform a full production-code API wiring sweep and fix all
  confirmed contract/route/auth mismatches between frontend and
  backend, then harden tests so drift is caught earlier.
  Scope includes reconciliation, auth callback invitation flow,
  export/report flows, billing/payment hooks, and endpoint contract
  consistency checks.

  ## Public API / Interface Changes

  1. Add team invitation accept endpoint for OAuth callback

  - Backend: add POST /api/v1/team/invitations/accept.
  - Request body:
      - token: string
      - user_id: UUID
  - Response body:
      - success: boolean
      - message?: string
  - Behavior:
      - Validate token via team invitation service.
      - Validate invited email matches OAuth user email.
      - Attach existing user to invited org/role (team invitation
        only).
      - Mark invitation as used.
      - Return deterministic non-500 errors for invalid/expired/
        used/revoked/mismatched token-user cases.
  - Frontend: update AuthCallback invitation processing to call this
    endpoint (replace nonexistent /api/v1/invitations/accept path).

  2. Add batch PDF export endpoint (to match existing frontend
     capability)

  - Backend: add GET /api/v1/exports/reconciliation/snapshots/
    {snapshot_id}/export/batch-pdf.
  - Query params:
      - tenant_ids (repeatable string list; interpreted as snapshot
        IDs for export selection in current implementation)
      - mode: zip | combined
      - include_cover_page: bool
      - include_calculation_details: bool
  - Response:
      - application/zip for zip
      - application/pdf for combined
      - Content-Disposition with filename
      - progress headers:
          - X-Total-Tenants
          - X-Completed-Tenants
  - Auth/Gating:
      - enforce org scoping + bounty paid gate (same as other export
        endpoints).

  3. Refactor variance export contract to backend-native shape

  - Frontend: replace snapshot-id-based variance hook contract.
  - New hook/component contract uses:
      - property_id
      - years[]
      - optional use_fuzzy_matching
  - Use existing POST /api/v1/analysis/year-over-year response shape
    (YearOverYearComparison) and map UI fields from backend model.
  - Remove incorrect /api/reconciliation/variance?
    current=...&prior=... usage.

  4. Auth normalization for direct fetch calls

  - Centralize authenticated network calls through API client layer
    (recommended path selected):
      - either generated SDK ops where available
      - or shared authenticated request helper using current session
        + consistent error handling.
  - Apply to currently non-unified calls in:
      - payment methods hook
      - PDF export hook
      - report generation button
      - any other protected endpoint still using raw unauthenticated
        fetch.

  5. Reconciliation test contract corrections

  - Update stale test fixtures to current API schema:
      - BatchFinalizeResponse (results[], total_*) instead of legacy
        finalized_count/snapshot_ids.
      - job status uses 'completed' enum (not 'complete').
  - Strengthen tests to assert optimistic cache updates run against
    real response shape.

  ## Implementation Plan (Decision-Complete)

  1. Build endpoint/wiring inventory and mark each callsite

  - Enumerate all non-test, non-generated frontend network calls.
  - For each: endpoint, auth requirement, request/response schema
    source, and whether SDK op exists.
  - Use this as checklist and commit unit-by-unit.

  2. Backend: implement invitation accept flow for OAuth users

  - Extend team invitation service with “accept for existing user”
    method.
  - Add route + request/response schemas.
  - Enforce idempotency and safe conflict semantics (already-linked
    user, token already used, wrong org, email mismatch).
  - Register route under v1 team router and include in OpenAPI.

  3. Frontend: migrate AuthCallback invitation processing

  - Replace endpoint path and align body/response handling with new
    contract.
  - Keep non-blocking behavior (login should succeed even if
    invitation accept fails), but log structured errors and preserve
    warning toast behavior if already present.

  4. Backend: implement batch PDF endpoint

  - Reuse existing single-snapshot PDF generation logic.
  - Resolve selected snapshot set from snapshot_id + tenant_ids.
  - Validate org ownership + finalized status rules.
  - Produce ZIP (multiple PDFs) and combined PDF modes.
  - Return progress headers and predictable file naming.

  5. Frontend: align export hooks to backend contracts

  - useBatchPDFExport:
      - keep endpoint path now backed by backend.
      - include auth through centralized API client path.
  - useGeneratePDF:
      - route through authenticated API client request.
  - ReportGenerationButton:
      - switch to authenticated request path (API client/SDK),
        preserve UX behavior.
  - useVarianceComparison + VarianceReport:
      - change inputs to property+years.
      - map backend YearOverYearComparison fields into table model.

  6. Full auth/request normalization sweep

  - Replace remaining protected raw fetch usages with API client/
    SDK.
  - Keep true public endpoints as raw fetch only where intentionally
    public.
  - Ensure consistent ApiError mapping and correlation-id behavior.

  7. Update generated client artifacts if OpenAPI changed

  - Regenerate frontend API client/types after backend endpoint
    additions.
  - Update any schema sync/contract tests expecting generated types.

  8. Testing and validation

  - Frontend targeted:
      - src/api/hooks.test.ts
      - src/pages/auth/AuthCallback.test.tsx
      - src/features/export/hooks/useBatchPDFExport.test.tsx
      - src/features/export/hooks/useGeneratePDF.test.tsx
      - src/features/export/hooks/useVarianceComparison.test.tsx
      - src/features/analysis/components/
        ReportGenerationButton.test.tsx
      - src/hooks/use-payment-methods.test.ts
  - Backend targeted:
      - add/extend tests for new invitation accept route
      - add/extend export endpoint tests for batch PDF (zip and
        combined)
      - org isolation + auth failure cases
      - OpenAPI/router structure tests if required
  - End-to-end sanity:
      - OAuth callback with invite token
      - finalize snapshots mutation cache path
      - batch export request from UI path.

  ## Test Cases and Scenarios

  1. OAuth callback invitation acceptance

  - valid token + matching user email links org role and marks used.
  - invalid/expired/revoked/used token returns safe failure; login
    still completes frontend-side.
  - mismatch between token email and user email is rejected.

  2. Reconciliation finalize contract

  - mutation handles results[] response and updates cache
    immediately.
  - polling stops on 'completed' status only.
  - stale 'complete' fixtures removed.

  3. Batch PDF export

  - ZIP mode returns downloadable archive with expected filenames.
  - invalid snapshot selection returns 4xx, not 500.
  4. Variance flow alignment

  - hook sends valid YearOverYearRequest.
  - UI renders values from backend YearOverYearComparison.
  - error states map correctly for invalid years/no data.

  5. Auth normalization

  - protected endpoints fail gracefully when session missing.
  - authenticated endpoints include bearer token consistently.
  - public endpoints remain callable without token.

  ## Assumptions and Defaults Chosen

  - Full sweep includes all production frontend network calls
    (excluding tests/mocks/generated files).
  - OAuth callback invitation processing supports team invitations
    only.
  - Batch PDF endpoint is implemented server-side (not disabled/
    refactored away).
  - Variance export flow is refactored to backend-native property_id
    + years contract.
  - Centralized API-client-based auth/error handling is preferred
    over per-call ad hoc headers.
