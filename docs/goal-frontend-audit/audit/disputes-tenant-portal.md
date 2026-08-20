# Frontend Audit: Disputes (Landlord) + Tenant Portal

**Auditor domain:** Disputes + Tenant Portal
**Date:** 2026-05-28
**Scope:** `frontend/src/features/disputes/`, `frontend/src/features/tenant-portal/`, related hooks/backend routes

---

## Finding 1 — Tenant signup bypasses Supabase auth: user redirected out immediately after registration

**Severity:** P0

**File/line evidence:**
- `frontend/src/features/tenant-portal/pages/TenantSignupPage.tsx:116–120`
- `frontend/src/contexts/AuthContext.tsx:267` (`supabase.auth.onAuthStateChange`)

**What's wrong:**
After a successful tenant signup, `TenantSignupPage` stores the returned JWT tokens in raw `localStorage` keys (`access_token`, `refresh_token`):

```ts
localStorage.setItem('access_token', response.data.access_token)
localStorage.setItem('refresh_token', response.data.refresh_token)
```

The `AuthContext` is driven by `supabase.auth.onAuthStateChange` — it only picks up a session when Supabase's own storage key is written (via `supabase.auth.setSession()` or a sign-in call). Writing to arbitrary localStorage keys never triggers this. After navigating to `/tenant/dashboard`, `ProtectedRoute` checks `auth.isAuthenticated`, finds no Supabase session, and redirects the tenant back to `/tenant/login`. The newly created account is unusable without an explicit second login.

**Expected behavior:**
After receiving tokens from the backend, call `supabase.auth.setSession({ access_token, refresh_token })` so the Supabase client registers the session and `AuthContext` transitions to authenticated.

**Suggested fix:**
Replace the `localStorage.setItem` calls with `await supabase.auth.setSession({ access_token: response.data.access_token, refresh_token: response.data.refresh_token })`.

---

## Finding 2 — No path for tenant to create a dispute from a statement

**Severity:** P0

**File/line evidence:**
- `frontend/src/features/tenant-portal/pages/TenantDashboard.tsx:246–280` (`StatementRow` — no dispute button)
- `frontend/src/features/tenant-portal/pages/TenantDisputesPage.tsx:64–69` ("Choose Statement" → navigates to `/tenant/dashboard`)
- `frontend/src/features/tenant-portal/pages/CreateDisputePage.tsx:19–38` (requires `?statement_id=` query param)
- `frontend/src/features/tenant-portal/pages/TenantHelpPage.tsx:29` ("open the statement from your dashboard and choose the dispute option")

**What's wrong:**
`CreateDisputePage` requires a `?statement_id=` query parameter and shows an error if it's absent. The only way to supply this is via a link like `/tenant/disputes/new?statement_id={id}`. However:

1. `StatementRow` in `TenantDashboard` has no "Dispute" or "File a dispute" button — only a "Download" button for the PDF.
2. The "Choose Statement" button in `TenantDisputesPage` navigates to `/tenant/dashboard`, which has no dispute-creation affordance.
3. No other component constructs a link to `/tenant/disputes/new?statement_id=...`.

There is no end-to-end path for a tenant to file a dispute. The route exists (`/tenant/disputes/new`) and the form exists (`DisputeForm`), but the entry point is completely missing.

**Expected behavior:**
Each `StatementRow` should include a "Dispute" button that navigates to `/tenant/disputes/new?statement_id={statement.id}`.

**Suggested fix:**
Add a `<Button onClick={() => navigate('/tenant/disputes/new?statement_id=' + statement.id)}>Dispute</Button>` (or similar) to `StatementRow`, and remove the broken "Choose Statement" navigation in `TenantDisputesPage`.

---

## Finding 3 — `useUpdateDisputeStatus` casts `DisputeSummaryDTO` as `DisputeDetailDTO` and stores it in the detail cache

**Severity:** P1

**File/line evidence:**
- `frontend/src/api/hooks.ts:1652` (type parameter `DisputeDetailDTO`)
- `frontend/src/api/hooks.ts:1670` (`return response.data as DisputeDetailDTO`)
- `frontend/src/api/hooks.ts:1675–1678` (`queryClient.setQueryData(queryKeys.disputes.detail(disputeId), updatedDispute)`)
- `frontend/src/api/generated/types.gen.ts:6954–6955` (`UpdateDisputeStatusApiV1...Response = DisputeSummaryDTO`)
- `backend/app/api/v1/disputes.py:219` (`response_model=DisputeSummaryDTO`)

**What's wrong:**
The backend `PUT /api/v1/disputes/{dispute_id}/status` returns a `DisputeSummaryDTO` (fields: `id`, `category`, `status`, `description`, `created_at`, `statement_id`). The generated type `UpdateDisputeStatusApiV1DisputesDisputeIdStatusPutResponse` correctly reflects this as `DisputeSummaryDTO`.

The hook casts the response to `DisputeDetailDTO` and then writes it into the `disputes.detail` cache (`queryClient.setQueryData`). `DisputeDetailDTO` additionally requires `tenant_user_id`, `organization_id`, `updated_at`, `comments`, `attachments`, etc. After a status update, the detail cache now contains an incomplete object lacking these fields. When the `LandlordDisputeDetailPage` next reads from cache, it will access `dispute.updated_at` (line 316), `dispute.comments` (line 374), and `dispute.attachments` (line 353) on an object that does not have them, causing runtime errors or blank sections.

**Expected behavior:**
After a status update, invalidate the detail cache instead of writing a partial summary object to it:
```ts
queryClient.invalidateQueries({ queryKey: queryKeys.disputes.detail(disputeId) })
```

---

## Finding 4 — Demand letter dialog sends empty `landlord_name` without frontend validation

**Severity:** P1

**File/line evidence:**
- `frontend/src/features/disputes/pages/LandlordDisputeDetailPage.tsx:102` (`const [landlordName, setLandlordName] = useState('')`)
- `frontend/src/features/disputes/pages/LandlordDisputeDetailPage.tsx:115–129` (`handleGenerate` sends `landlord_name: landlordName` without validation)
- `backend/app/api/v1/demand_letter.py:44` (`landlord_name: str = Field(..., min_length=1, max_length=255)`)

**What's wrong:**
The "Generate Demand Letter" dialog initializes `landlordName` as an empty string and the "Generate & Download" button is only disabled while `isPending`. If a user clicks the button with an empty landlord name, the POST to `/api/v1/demand-letter/generate` reaches the backend with `landlord_name: ""`, which violates the `min_length=1` constraint. The backend returns a 422 Unprocessable Entity, which is surfaced as a toast error `"Failed: ..."`. The user has no UI-level validation error message on the `landlord_name` field and must guess what went wrong.

**Expected behavior:**
Disable the button (or show an inline validation error) when `landlordName` is empty or whitespace-only.

---

## Finding 5 — `DisputesListPage` has no error state

**Severity:** P1

**File/line evidence:**
- `frontend/src/features/disputes/pages/DisputesListPage.tsx:65` (`const { data: disputes, isLoading } = useDisputes(...)`)
- Line 132 onwards — only `isLoading` and `!disputes || disputes.length === 0` are handled

**What's wrong:**
`useDisputes` is destructured with only `data` and `isLoading`. The `error` field is never read. If the backend returns an error (network failure, 401, 500), `disputes` will be `undefined` and `isLoading` will be `false`. The page renders the empty-state message "No disputes found." with no indication of an error. Users cannot distinguish a network failure from genuinely having zero disputes.

**Expected behavior:**
Destructure `error` from `useDisputes` and render an error message (e.g., "Failed to load disputes. Try refreshing.") when `error` is truthy.

---

## Finding 6 — `TenantDisputesPage` has no error state and local type declares uppercase statuses that don't match backend

**Severity:** P1 (error state) / P2 (type mismatch — functionally harmless due to `.toLowerCase()` in badge)

**File/line evidence:**
- `frontend/src/features/tenant-portal/pages/TenantDisputesPage.tsx:37` (`const { data: disputes, isLoading } = useQuery<Dispute[]>(...)`)
- `frontend/src/features/tenant-portal/pages/TenantDisputesPage.tsx:30` (`status: 'OPEN' | 'UNDER_REVIEW' | ...`)
- `backend/app/api/v1/tenant/disputes.py:107` (returns `DisputeSummaryDTO` with lowercase statuses)

**What's wrong:**
1. `useQuery` error state is never destructured. A backend error shows no feedback.
2. The local `Dispute` interface declares `status` as `'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED' | 'CLOSED'` (uppercase). The backend returns lowercase (`'open' | 'under_review' | ...`). The badge component calls `.toLowerCase()` so renders correctly, but the TypeScript interface is wrong and the `canComment` logic (in `DisputeDetailPage`) does a lowercase string comparison that works only because of `.toLowerCase()` in `isNeedsResponseStatus`. This is a latent type-safety gap.

**Expected behavior:**
Destructure and handle `error` from `useQuery`. Change the local `Dispute.status` type to lowercase to match the backend contract and generated `DisputeStatus` type.

---

## Finding 7 — Tenant `DisputeDetailPage` has no error state

**Severity:** P1

**File/line evidence:**
- `frontend/src/features/tenant-portal/pages/DisputeDetailPage.tsx:71–82`

**What's wrong:**
`useQuery` is called but only `data` and `isLoading` are destructured. The `error` field is ignored. When the API returns an error (e.g., 404 or 500), the page shows a blank loading spinner that never resolves (since `isLoading` becomes `false` and `dispute` is `undefined`), rendering only "Dispute not found" with no actionable message.

**Expected behavior:**
Destructure `error` from `useQuery` and render an appropriate error state with retry option.

---

## Finding 8 — All new landlord comments show "Unknown" as author

**Severity:** P2

**File/line evidence:**
- `backend/app/api/v1/disputes.py:317–324` (`add_admin_comment` returns `DisputeCommentDTO` without setting `author_name`)
- `backend/app/models/dispute.py:162` (`author_name: str = "Unknown"`)

**What's wrong:**
After a landlord adds a comment, the backend `add_admin_comment` endpoint returns a `DisputeCommentDTO` constructed without looking up the author's name:
```python
return DisputeCommentDTO(
    id=..., dispute_id=..., author_id=..., content=..., is_internal=..., created_at=...
)
```
`author_name` is not passed, so it defaults to `"Unknown"`. The frontend's `CommentThread` renders the new comment with "Unknown" as the author name immediately after submission (before a refetch). After the query is invalidated and refetched, the `get_dispute` endpoint does join with `users!author_id(full_name)` and populates the name correctly. But the optimistic-display issue means the UX shows "Unknown" briefly.

The tenant-side `add_comment` endpoint has the same issue (`backend/app/api/v1/tenant/disputes.py:308–315`).

**Expected behavior:**
The backend `add_admin_comment` should join or look up the author's full name and include it in the returned DTO, or the frontend should optimistically merge the current user's name into the comment after success.

---

## Finding 9 — Dashboard `map_statement_status` always returns `"pending"` regardless of actual state

**Severity:** P2

**File/line evidence:**
- `backend/app/api/v1/tenant/dashboard.py:234–243`

**What's wrong:**
```python
def map_statement_status(db_status: str) -> StatementStatus:
    if db_status == "draft":
        return StatementStatus.PENDING
    elif db_status == "finalized":
        return StatementStatus.PENDING  # Finalized but not yet paid
    else:
        return StatementStatus.PENDING
```
Every branch returns `PENDING`. Since the dashboard query only fetches `finalized` statements, all statements always display with a "pending" badge even if they are disputed, overdue, or paid. The `StatementStatus` enum supports `paid`, `disputed`, `overdue` but none are ever used.

**Expected behavior:**
The status should be derived from actual payment or dispute state. At minimum the stub should be documented and the always-pending behavior should not silently mislead tenants.

---

## Finding 10 — `DisputeDetailPage` (tenant) uses `apiClient.get` with `as never` type cast instead of generated SDK

**Severity:** P2

**File/line evidence:**
- `frontend/src/features/tenant-portal/pages/DisputeDetailPage.tsx:74–75`
- `frontend/src/features/tenant-portal/pages/TenantDisputesPage.tsx:40–41`
- `frontend/src/features/tenant-portal/components/DisputeForm.tsx:46–47`

**What's wrong:**
Three files make raw API calls using `apiClient.get`/`apiClient.post` with manual URL strings cast to `never`:
```ts
const response = await apiClient.get({ url: `/api/v1/tenant/disputes/${disputeId}` as never })
```
This bypasses generated SDK functions (`getDisputeApiV1TenantDisputesDisputeIdGet` etc.) and all compile-time type checking. Contract changes (path, request shape, response shape) will not be caught by TypeScript. The correct generated SDK functions for tenant disputes are present in `sdk.gen.ts`.

**Expected behavior:**
Use the generated typed SDK functions (e.g., `getDisputeApiV1TenantDisputesDisputeIdGet`, `listDisputesApiV1TenantDisputesGet`, `createDisputeApiV1TenantDisputesPost`) for all tenant dispute API calls.

---

## Finding 11 — Tenant login uses a 100 ms arbitrary sleep to wait for auth state

**Severity:** P2

**File/line evidence:**
- `frontend/src/features/tenant-portal/pages/TenantLoginPage.tsx:55` (`await new Promise((resolve) => setTimeout(resolve, 100))`)

**What's wrong:**
After `auth.login()`, the code sleeps 100 ms to allow Supabase's `onAuthStateChange` to update `auth.userRole`. On slow devices or networks this delay is insufficient, causing the role check at line 59 to read stale state (`auth.userRole` still `null`) and incorrectly show "This login is for tenant users only" and log out the user.

**Expected behavior:**
Use the `resolvedRole` returned directly from `auth.login()` for the role check, not `auth.userRole` (which lags behind). The existing code already has `resolvedRole` but then also falls back to `auth.userRole`. The condition on line 66 should be removed and only `resolvedRole` should be used.

---

## Finding 12 — `LandlordDisputeDetailPage` passes `dispute.statement_id` as `snapshotId` to demand letter dialog

**Severity:** P2

**File/line evidence:**
- `frontend/src/features/disputes/pages/LandlordDisputeDetailPage.tsx:279` (`snapshotId={dispute.statement_id}`)
- `backend/app/api/v1/demand_letter.py:42` (`snapshot_id: UUID` — must be a `reconciliation_snapshot` ID)

**What's wrong:**
`dispute.statement_id` comes from the `disputes` table and references a `reconciliation_snapshot.id`. If this foreign key is indeed a reconciliation snapshot ID, the field name is semantically confusing (`statement_id` vs `snapshot_id`) but functionally correct. However, the data model should be verified: if `statement_id` in the `disputes` table refers to a different entity than `reconciliation_snapshots.id`, the backend will return a 404. The naming discrepancy risks future breakage if the schema is refactored.

**Expected behavior:**
Confirm that `disputes.statement_id` always references `reconciliation_snapshots.id`. If it does, add a comment or rename for clarity. If it doesn't, the wrong ID is being sent.

---

## Finding 13 — `TenantDisputesPage` "Choose Statement" button navigates to dashboard, not to dispute creation flow

**Severity:** P2

**File/line evidence:**
- `frontend/src/features/tenant-portal/pages/TenantDisputesPage.tsx:64–69`

**What's wrong:**
The button labeled "Choose Statement" in `TenantDisputesPage` navigates to `/tenant/dashboard` rather than providing a workflow to select a statement and then reach `CreateDisputePage`. Since `StatementRow` on the dashboard has no dispute affordance (Finding 2), this creates a dead end. The tooltip says "Select a statement from your dashboard to create a dispute" — but users have no mechanism to do so once on the dashboard.

**Expected behavior:**
Either navigate directly to `/tenant/disputes/new` (if a statement is pre-selected) or the dashboard should provide a "Dispute" link on each statement row.

---

## Finding 14 — `NotificationList` loading state is a bare text string, not a skeleton

**Severity:** P3

**File/line evidence:**
- `frontend/src/features/tenant-portal/components/NotificationList.tsx:102–103`

**What's wrong:**
```tsx
if (isLoading) {
  return <div className="p-4">Loading notifications...</div>
}
```
All other loading states in the tenant portal use `<SkeletonCard>` or `<Loader2>` spinner components for visual consistency.

**Expected behavior:**
Replace the loading text with a skeleton or spinner consistent with the rest of the portal UI.

---

## Finding 15 — `DisputesListPage` "needs response" count is client-side filtered from a paginated list

**Severity:** P3

**File/line evidence:**
- `frontend/src/features/disputes/pages/DisputesListPage.tsx:68–70`

**What's wrong:**
The "need response" count is computed by filtering the currently loaded disputes array:
```ts
const needsResponseCount = disputes?.filter(...).length ?? 0
```
Since the API defaults to `limit=50`, this count is only accurate for the first 50 disputes. If there are >50 disputes and some after position 50 need response, the count will be understated.

**Expected behavior:**
Either fetch a separate count endpoint/query, or document that the count is approximate.

---

## Summary (most severe first)

- **P0** `frontend/src/features/tenant-portal/pages/TenantSignupPage.tsx:116–120` — Signup stores tokens in raw localStorage bypassing Supabase auth; tenant is immediately redirected away from dashboard after registration.
- **P0** `frontend/src/features/tenant-portal/pages/TenantDashboard.tsx:246–280` + `TenantDisputesPage.tsx:64` — No path exists for tenants to create a dispute; `StatementRow` has no dispute button and "Choose Statement" navigates nowhere useful.
- **P1** `frontend/src/api/hooks.ts:1670,1675` — `useUpdateDisputeStatus` casts `DisputeSummaryDTO` as `DisputeDetailDTO` and stores it in detail cache, corrupting the cached dispute object used by `LandlordDisputeDetailPage`.
- **P1** `frontend/src/features/disputes/pages/LandlordDisputeDetailPage.tsx:102,115–129` — Demand letter dialog allows submission with empty `landlord_name`; backend returns 422 with no field-level feedback shown.
- **P1** `frontend/src/features/disputes/pages/DisputesListPage.tsx:65` — No error state; API failure silently shows empty-state "No disputes found."
- **P1** `frontend/src/features/tenant-portal/pages/TenantDisputesPage.tsx:37,30` — No error state on fetch failure; local status type is uppercase while backend returns lowercase.
- **P1** `frontend/src/features/tenant-portal/pages/DisputeDetailPage.tsx:71` — No error state for dispute fetch; failure renders only "Dispute not found" with no retry.
- **P2** `backend/app/api/v1/disputes.py:317–324` — Landlord comments always display "Unknown" as author name in the POST response (before refetch resolves names).
- **P2** `backend/app/api/v1/tenant/dashboard.py:234–243` — `map_statement_status` always returns `"pending"`; paid/disputed/overdue statuses are never shown to tenants.
- **P2** `frontend/src/features/tenant-portal/pages/DisputeDetailPage.tsx:74–75` — Raw `apiClient.get` with `as never` cast bypasses generated SDK and type safety.
- **P2** `frontend/src/features/tenant-portal/pages/TenantLoginPage.tsx:55` — 100 ms arbitrary sleep for auth state propagation is race-condition prone; on slow connections tenant is logged out immediately after login.
- **P2** `frontend/src/features/disputes/pages/LandlordDisputeDetailPage.tsx:279` — `dispute.statement_id` passed as `snapshotId` to demand letter; naming discrepancy with `reconciliation_snapshots.id` risks breakage.
- **P2** `frontend/src/features/tenant-portal/pages/TenantDisputesPage.tsx:64–69` — "Choose Statement" button goes to `/tenant/dashboard` which has no dispute-creation affordance.
- **P3** `frontend/src/features/tenant-portal/components/NotificationList.tsx:102–103` — Loading state is bare text string instead of skeleton/spinner.
- **P3** `frontend/src/features/disputes/pages/DisputesListPage.tsx:68–70` — "Needs response" count is computed from paginated list; understated when >50 disputes exist.
