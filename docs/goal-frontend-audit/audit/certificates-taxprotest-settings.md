# Frontend Audit: Certificates / Warranty + Tax Protest + Settings + Help / Feedback + Admin

Audited domains: `frontend/src/features/warranty`, `frontend/src/pages/tax-protest`, `frontend/src/features/tax-protest`, `frontend/src/pages/settings`, `frontend/src/pages/help`, `frontend/src/features/help`, `frontend/src/pages/admin/Feedback.tsx`, `frontend/src/components/FeedbackWidget`.

Backend cross-checked: `backend/app/api/v1/warranty.py`, `backend/app/api/v1/tax_protest.py`, `backend/app/api/v1/feedback.py`, `backend/app/api/v1/organization.py`, `backend/app/api/v1/team/members.py`, `backend/app/api/v1/team/invitations.py`.

---

## Finding 1 — Warranty `createCertificate` route sends no-auth body but backend requires `CurrentAdminUser`

**File:** `frontend/src/features/warranty/api/warrantyApi.ts:42-51`

**What's wrong:** `warrantyApi.createCertificate(snapshotId)` POSTs to `/api/v1/warranty/snapshots/{snapshotId}/certificates` with `body: {} as never`. The backend route (`warranty.py:108`) demands `CurrentAdminUser` as a dependency — a non-admin user calling this will receive HTTP 403. There is no frontend guard or error message specific to the admin-only restriction; the generic "Failed to create certificate" toast fires. The `WarrantyEligibilityBadge` links non-admin users to `/certificates/new?snapshotId=…` where they would hit this wall.

**Expected:** The warranty certificate creation flow should either be hidden from non-admin users (check `isAdmin` from auth context before rendering the link/button) or show a clear "admin required" message on 403.

**Severity:** P1 — The create action is exposed to all roles but always fails for non-admins.

**Suggested fix:** In `WarrantyEligibilityBadge.tsx`, read `isAdmin` from `useAuth()` and only show the "Certificate Available" link when the user is an admin; otherwise show a read-only status badge.

---

## Finding 2 — Warranty state-transition endpoints (`/attest`, `/issue`, `/void`) all require `CurrentAdminUser` — frontend does not enforce this

**File:** `frontend/src/features/warranty/components/WarrantyCertificateDetail.tsx:75-78`

**What's wrong:** `WarrantyCertificateDetail` renders Attest, Finalize, and Revoke buttons (`useAttestData`, `useIssueCertificate`, `useVoidCertificate`) for **all** users who can load the certificate detail page. All three backend endpoints (`warranty.py:159,197,301`) require `CurrentAdminUser`. A `member` or `viewer` will see these buttons, click them, and receive an opaque toast error ("Attestation failed", "Failed to finalize certificate", "Failed to revoke certificate") from the generic `onError` handlers. No 403-specific message is shown.

**Expected:** Attest / Finalize / Revoke action cards should be conditionally rendered only when `isAdmin` is true. Non-admins should see a read-only view of the certificate status.

**Severity:** P1 — Action buttons are non-functional for non-admin users with no UX explanation.

**Suggested fix:** Wrap the `cert.status === 'pending_attestation'`, `'eligible'`, and `'issued'` action cards in `{isAdmin && (…)}`, using `useAuth().isAdmin`.

---

## Finding 3 — `WarrantyEligibilityBadge` uses a non-canonical query key inconsistent with `useWarranty` hooks

**File:** `frontend/src/features/warranty/components/WarrantyEligibilityBadge.tsx:63-73`

**What's wrong:** `WarrantyEligibilityBadge` creates its own inline `useQuery` calls with query keys `['warranty-eligibility', snapshotId]` and `['warranty-certificate', existingCertificateId]`. The canonical `useWarranty.ts` hooks use `warrantyKeys.eligibility(snapshotId)` → `['warranty','eligibility',snapshotId]` and `warrantyKeys.certificate(id)` → `['warranty','certificate',id]`. The key mismatch means that mutations (attest, issue, void) in `WarrantyCertificateDetail` call `qc.invalidateQueries({ queryKey: warrantyKeys.certificate(id) })` but the badge query will **not** be invalidated, leaving stale badge state after a state transition.

**Expected:** Use `useEligibility(snapshotId)` and `useCertificate(existingCertificateId)` from `useWarranty.ts`, or adopt the canonical keys.

**Severity:** P2 — Badge remains stale after certificate state transitions until the user navigates away and back.

---

## Finding 4 — `WarrantyPage` uses `useParams` to detect certificate detail but is mounted at an ambiguous route

**File:** `frontend/src/features/warranty/components/WarrantyPage.tsx:31`

**What's wrong:** `WarrantyPage` reads `const { certificateId } = useParams<{ certificateId?: string }>()` and renders `WarrantyCertificateDetail` inline when `certificateId` is present. If the router mounts `WarrantyPage` at `/certificates` without a child route for `/certificates/:certificateId`, the param will always be `undefined` and the detail view never renders. Conversely, if a route like `/certificates/:certificateId` exists, it is ambiguous whether `WarrantyPage` or a dedicated detail component is intended. The certificate list cards link to `/certificates/${cert.id}` (`WarrantyPage.tsx:102`), implying a nested route must exist.

**Expected:** The route configuration should explicitly define `/certificates/:certificateId` as a child route and let `WarrantyCertificateDetail` be its own page component, or `WarrantyPage` must be registered under a route that provides the `certificateId` param.

**Severity:** P1 — If the route is not configured with the param, clicking any certificate card renders the list again (detail view never appears) — broken navigation.

---

## Finding 5 — `WarrantyEligibilityBadge` fetches eligibility only when `!existingCertificateId` but shows a "Certificate Available" badge even for ineligible snapshots

**File:** `frontend/src/features/warranty/components/WarrantyEligibilityBadge.tsx:63-81`

**What's wrong:** When `existingCertificateId` is null, the badge renders `statusKey = 'none'` → "Certificate Available" regardless of whether the snapshot is actually eligible. The `checkEligibility` query result (`eligibilityLoading`) is only used to show a spinner; the `data` (the `WarrantyEligibility` response) is never read. The badge ignores `is_eligible` and `reasons` entirely. A user sees "Certificate Available" even for unfinalized snapshots that would be rejected by the backend on create with a 422.

**Expected:** When the snapshot is not eligible (`!eligibility.is_eligible`), the badge should show "Not Eligible" (perhaps with a tooltip listing `eligibility.reasons`) instead of "Certificate Available."

**Severity:** P2 — Misleads users into initiating the certificate flow for ineligible snapshots, leading to a 422 error with no clear explanation.

---

## Finding 6 — Tax Protest `TaxProtestPanel` error handler reads `err.statusCode` but `ApiError` has a numeric `status` field

**File:** `frontend/src/features/tax-protest/components/TaxProtestPanel.tsx:47-49`

**What's wrong:**
```ts
onError: (err) => {
  if (err.statusCode === 402) {          // line 48 — property does not exist
    toast.error('Subscription required…')
  } else {
    toast.error('Failed to generate…')
  }
}
```
`useTaxProtestExport` returns `ApiError` (defined in `hooks.ts`). `ApiError` exposes a `.status` field (not `.statusCode`). As written, the 402 branch is **dead code**: `err.statusCode` is always `undefined`, so the "Subscription required" message is never shown. Every 402 response from the backend (missing entitlement) silently shows the generic failure toast.

**Expected:** Change `err.statusCode` to `err.status` to surface the subscription-required message.

**Severity:** P1 — Users without the Control/Defend plan receive a generic error instead of a meaningful "upgrade required" prompt.

---

## Finding 7 — Tax Protest `TaxProtestPage` does not handle the error state from `useTaxProtestDeadlines`

**File:** `frontend/src/pages/tax-protest/TaxProtestPage.tsx:24-134`

**What's wrong:** `useTaxProtestDeadlines()` is called as `const { data, isLoading } = …` — the `error` return value is never destructured or checked. If the API call fails (network error, 401, 500), the page renders nothing (no loading spinner, no empty state, no error message) because `isLoading` becomes `false` and `data` is `undefined`, so none of the conditional branches match.

**Expected:** Destructure `error` from the hook and render an error state (e.g., "Failed to load deadlines. Try again.").

**Severity:** P2 — Silent failure; users see a blank page on any API error.

---

## Finding 8 — Admin `FeedbackPage` does not handle non-OK HTTP responses from `fetch`

**File:** `frontend/src/pages/admin/Feedback.tsx:67-85`

**What's wrong:** The `queryFn` for the feedback list calls `fetch(…)` and does `return res.json()` without checking `res.ok`. If the server returns 403 (non-platform-admin hitting the admin endpoint), 500, or any other error status, `res.json()` resolves with the error body, and `useQuery` treats the result as successful data. The table then attempts to render the error object as `Feedback[]`, likely producing blank rows or a runtime crash (`item.type` undefined → `typeIcons[undefined]` throws).

The same pattern applies to `get_feedback_stats` at line 95-101.

**Expected:** After `fetch(…)`, check `if (!res.ok) throw new Error(…)` before calling `res.json()`.

**Severity:** P1 — On 403/500, the page silently renders corrupt data or crashes.

---

## Finding 9 — Admin `FeedbackPage` route guard uses `OWNER | ADMIN` role but backend `list_feedback` uses `get_current_admin_user` which may include platform admins separately

**File:** `frontend/src/App.tsx:368-370`, `frontend/src/pages/admin/Feedback.tsx:80`

**What's wrong:** The route is protected with `requiredRoles={[UserRole.OWNER, UserRole.ADMIN]}`. This is organisation-scoped role gating. The backend's `list_feedback` uses `get_current_admin_user` (which checks the user's org role) — that is consistent. However, the `list_feedback` endpoint filters by `_admin.organization_id`, meaning a platform-admin who is not an org admin of that specific organization cannot see cross-org feedback. No cross-org admin panel exists. If this is intentional, it should be documented; if the intent is to let platform admins see all feedback, the backend query must be unfiltered for platform admins. The frontend does not distinguish these cases.

**Severity:** P3 — Potential scope limitation for platform admins; no immediate crash, but incorrect data access.

---

## Finding 10 — `FeedbackPage` pagination "Next" button is based on `feedback.length < 20` but `feedback` can be `undefined`

**File:** `frontend/src/pages/admin/Feedback.tsx:325-329`

**What's wrong:**
```tsx
disabled={!feedback || feedback.length < 20}
```
When `isLoading` is true (first load or page change), `feedback` is `undefined`. The `!feedback` guard correctly disables the button during load. However, once data loads but is exactly 0 items (all filtered out), `feedback.length === 0 < 20` correctly disables Next. The issue is the previous-page button decrements to `page = 0` if the user clicks "Previous" on page 1 — but this is guarded by `disabled={page === 1}`.

More critically, changing `typeFilter` or `statusFilter` does **not** reset `page` to 1. If the user is on page 3 of "bugs" and switches to "features" which has only 1 page, the query fires with `page=3`, returns an empty array, and the user sees "No feedback found" instead of page 1 results.

**Expected:** Reset `setPage(1)` whenever `typeFilter` or `statusFilter` changes.

**Severity:** P2 — Filtering while on a page > 1 appears to return no results even when data exists.

---

## Finding 11 — `OrganizationPage` duplicates `isAdmin` derivation instead of using `useAuth().isAdmin`

**File:** `frontend/src/pages/settings/OrganizationPage.tsx:58-62`

**What's wrong:**
```ts
const { user, userRole } = useAuth()
const isAdmin = userRole === 'admin' || userRole === 'owner'
```
`AuthContext` already computes and exposes `isAdmin` (line 579-581 of `AuthContext.tsx`). The page re-derives it with string comparison against lowercase `'admin'` and `'owner'`. The `UserRole` enum values are `ADMIN = "admin"` and `OWNER = "owner"`, so the comparison is functionally correct for current values. However, if the enum changes or a new privileged role is added, this local copy will silently diverge from the authoritative `isAdmin` in context.

**Expected:** Destructure `isAdmin` directly: `const { user, isAdmin } = useAuth()`.

**Severity:** P3 — Cosmetic / maintainability; not a runtime bug today.

---

## Finding 12 — `OrganizationPage` uses `useUpdateOrganization` which calls Supabase directly, bypassing the backend `PATCH /api/v1/organization/settings` admin guard

**File:** `frontend/src/hooks/use-organization.ts:82-102`

**What's wrong:** `useUpdateOrganization` issues a Supabase `.update()` directly on the `organizations` table. The backend exposes `PATCH /api/v1/organization/settings` which requires `CurrentAdminUser`. The direct Supabase call is only protected by RLS. If Supabase RLS allows any authenticated org member to `UPDATE` the organization name (e.g., if RLS only checks `organization_id = auth.jwt()->>'organization_id'` without role checking), then non-admin members can rename the org from the frontend even though the `isAdmin` guard hides the form inputs — the mutation itself is still callable.

**Expected:** The update should go through the backend `PATCH /api/v1/organization/settings` route which enforces the admin role at the application layer, not rely solely on Supabase RLS.

**Severity:** P1 — Potential privilege escalation; non-admin users could bypass the frontend guard by calling `useUpdateOrganization` directly.

---

## Finding 13 — `ProfilePage` "Role" field shows `user.role` from Supabase Auth metadata, not the application `userRole`

**File:** `frontend/src/pages/settings/ProfilePage.tsx:210`

**What's wrong:**
```tsx
<Input value={user.role || 'User'} disabled />
```
`user` here is the Supabase `User` object returned by `useAuth().user`. `user.role` is the JWT role claim (typically `'authenticated'` for all users in Supabase), not the application role (owner/admin/member/viewer) stored in the `users` table. Non-admin users will see `'authenticated'` displayed as their role, which is meaningless and confusing.

**Expected:** Display `userRole` from `useAuth()` instead: `<Input value={userRole || 'User'} disabled />`.

**Severity:** P2 — Users see a Supabase internal role string (`'authenticated'`) rather than their meaningful app role.

---

## Finding 14 — `ProfilePage` password change calls `supabase.auth.signInWithPassword` to verify current password, which creates a new session and may trigger auth state side effects

**File:** `frontend/src/pages/settings/ProfilePage.tsx:118-128`

**What's wrong:** To "verify" the current password, the page calls `supabase.auth.signInWithPassword({ email, password })`. This is not an isolated verification — it issues a full sign-in, which:
1. May overwrite the in-memory session tokens, triggering auth state listeners.
2. On Supabase, repeated `signInWithPassword` calls on already-authenticated sessions can cause rate-limiting or session conflicts.
3. If the user is signed in via OAuth (Google/GitHub), `user.email` may still be set but the account has no password, causing a misleading "Current password is incorrect" error.

**Expected:** Supabase does not have a dedicated "verify password" endpoint. The typical pattern is to attempt `updateUser({ password: newPassword })` and rely on the server-side session to authenticate. Alternatively, use `reauthenticate()` (available in Supabase JS v2) followed by `updateUser`. The current approach has unintended side effects.

**Severity:** P2 — May cause session flicker/logout for OAuth users; potential rate-limit issues.

---

## Finding 15 — `TeamMembersPage` "Pending Invitations" section is only visible to admins via nav but non-admin users who reach the page still see the full member table

**File:** `frontend/src/pages/settings/TeamMembersPage.tsx:300-301`

**What's wrong:** The "Actions" column (role change dropdown, remove button) is correctly gated with `{isAdmin && …}`. However, `useTeamMembers` and `useTeamInvitations` both call admin-only backend endpoints (`GET /api/v1/team/members` and `GET /api/v1/team/invitations` both require `get_current_admin_user`). A non-admin who reaches this page will get 403 on both queries, triggering the error state ("Failed to load team data"), which replaces the entire page with a full-screen error. There is no graceful degradation for non-admins (e.g., a read-only list).

**Expected:** Either gate the entire page behind `isAdmin` (redirect or show "Access denied"), or use member-accessible endpoints for the read-only member list.

**Severity:** P2 — Non-admin users who navigate to `/settings/team` see a full-screen error instead of a useful view.

---

## Finding 16 — `useTeamInvitations` query key does not invalidate when `useCreateTeamInvitation` succeeds

**File:** `frontend/src/hooks/use-team-invitations.ts:263-264`

**What's wrong:** `useCreateTeamInvitation.onSuccess` invalidates `teamInvitationKeys.lists()` → `['team-invitations', 'list']`. `useTeamInvitations` uses `teamInvitationKeys.list(includeUsed)` → `['team-invitations', 'list', { includeUsed: false }]`. The invalidation of the parent key `['team-invitations', 'list']` should cascade to the child key via TanStack Query's prefix invalidation. This is technically correct in TanStack Query v5 (partial key match). However, `useRevokeTeamInvitation.onSuccess` at line 291 also invalidates `teamInvitationKeys.lists()` — this is correct too. No bug here, but confirm TanStack Query v5 is in use.

**Severity:** N/A — No bug confirmed, noting for completeness.

---

## Finding 17 — `HelpPage` search filters `helpTopics` against `topic.terms` but `topic.terms` is typed as optional (`string[] | undefined`)

**File:** `frontend/src/pages/help/HelpPage.tsx:19-22`

**What's wrong:**
```ts
...(topic.terms ?? []),
```
The `?? []` guard correctly handles `undefined`. This is safe. No bug.

**Severity:** N/A — Clean code.

---

## Summary Table

| # | Severity | File:Line | Summary |
|---|----------|-----------|---------|
| 1 | P1 | `features/warranty/api/warrantyApi.ts:42` | Certificate create exposed to non-admins; 403 with no UX explanation |
| 2 | P1 | `features/warranty/components/WarrantyCertificateDetail.tsx:75-78` | Attest/Finalize/Revoke buttons rendered for all roles; fail silently for non-admins |
| 4 | P1 | `features/warranty/components/WarrantyPage.tsx:31` | `useParams` cert detail branch only works if router provides `:certificateId` param — nav broken if route not configured |
| 6 | P1 | `features/tax-protest/components/TaxProtestPanel.tsx:48` | `err.statusCode` is undefined; 402 "subscription required" toast is dead code — always shows generic error |
| 8 | P1 | `pages/admin/Feedback.tsx:83` | `fetch` result not checked for `res.ok`; non-2xx responses returned as data, causing crash or corrupted table |
| 12 | P1 | `hooks/use-organization.ts:86-102` | `useUpdateOrganization` bypasses backend admin guard by calling Supabase directly |
| 3 | P2 | `features/warranty/components/WarrantyEligibilityBadge.tsx:63` | Non-canonical query keys break invalidation after cert state transitions; badge stays stale |
| 5 | P2 | `features/warranty/components/WarrantyEligibilityBadge.tsx:81` | Eligibility `data` never read; badge shows "Available" for ineligible snapshots |
| 7 | P2 | `pages/tax-protest/TaxProtestPage.tsx:24` | `error` from `useTaxProtestDeadlines` not handled; blank page on API failure |
| 10 | P2 | `pages/admin/Feedback.tsx:325` | Filter change while on page > 1 appears to return no results; `page` not reset on filter change |
| 13 | P2 | `pages/settings/ProfilePage.tsx:210` | Role field shows Supabase JWT role (`'authenticated'`) instead of app role |
| 14 | P2 | `pages/settings/ProfilePage.tsx:118` | Password verification via `signInWithPassword` has session side effects; fails silently for OAuth users |
| 15 | P2 | `pages/settings/TeamMembersPage.tsx:134-145` | Non-admin reaching team page hits 403 on both queries; full-screen error, no graceful degradation |
| 9 | P3 | `pages/admin/Feedback.tsx:68` + `App.tsx:369` | Platform-admin cross-org feedback scope not addressed; list filtered by org_id only |
| 11 | P3 | `pages/settings/OrganizationPage.tsx:62` | Local `isAdmin` derivation duplicates `AuthContext.isAdmin`; diverges if roles change |
