# Production E2E Rest-of-Scope Bug Report - 2026-05-07

## Scope

- App: `https://app.capveri.com`
- Marketing: `https://www.capveri.com`
- API: `https://api.capveri.com`
- Evidence directory: `output/playwright/prod-e2e-rest-2026-05-07/`
- Accounts: ignored `.env.local` production QA landlord and tenant credentials only.
- Data policy: all mutations used QA-created or QA-owned records.

This pass targeted the gaps left after the prior production sweep: accepted team-invite flow, byte-level export validation, clean tenant UI contexts, PWA offline behavior, responsive authenticated screens, and billing/checkout launch boundaries.

## Coverage

- Reused prior QA-owned finalized records:
  - Property: `7f1b22a4-89a6-4b9a-8f6c-cf60f23ab882`
  - Lease: `5dd80f7e-1a54-4a02-95ac-4dc801e34197`
  - Snapshot: `56d4ffc8-1c82-4a72-b498-a1ee1600dd39`
- Verified byte signatures and response metadata for snapshot PDF, snapshot ZIP, combined PDF, property PDF preview/download, property ZIP, Yardi CSV, and MRI fixed-width export.
- Checked certificate eligibility/create boundary. Certificate creation returned a validation/gating response, so certificate PDF bytes were not available in production for this QA snapshot.
- Created fresh QA team invite tokens and attempted public validation/signup.
- Exercised authenticated landlord responsive routes at tablet and mobile widths.
- Exercised clean tenant-context dashboard, disputes, and preferences at desktop and mobile widths.
- Verified service worker registration, offline reload boundary, and offline indicator text.
- Opened billing/checkout launch and return-state boundaries only. No real card data or payment submission was attempted.

## Confirmed Bugs

### P2 - Team Invite Signup Could Not See Fresh Invite Tokens

- Route/workflow: `POST /api/v1/team/signup`
- Related route: `GET /api/v1/team/invitations/{token}/validate`
- Role: production QA landlord creates invite; public invited user attempts signup.
- Evidence: `prod-rest-summary.json`, checks `team-invite-create-rest`, `team-invite-token-validate`, and `team-invite-signup-complete`.
- Repro:
  1. Sign in as the production QA landlord.
  2. Create a team invite through `POST /api/v1/team/invitations`.
  3. Use the returned token with the public validation/signup flow.
  4. Attempt `POST /api/v1/team/signup` with the token, full name, and strong password.
- Expected: the public flow can validate and complete signup for a fresh, unexpired token.
- Actual before fix: production returned `410` with `reason: not_found` for a fresh token created moments earlier.
- Root cause: `TeamInvitationService.validate_token()` queried `team_member_invitations` through the injected RLS-scoped client. Team invites are inserted through the service-role client and are intentionally hidden from anonymous/public RLS reads, so public validation/signup could not see valid tokens.

### Fix

- Updated `backend/app/services/team_invitation.py` so team invitation token lookup and organization-name lookup use the service-role client first, with the injected client retained as a fallback for local/test setups.
- Added regression coverage in `backend/tests/services/test_team_invitation.py` for an RLS-hidden but valid public team invite token.

### P2 - Team Invite Signup Failed When Auth Trigger Precreated Public User Row

- Route/workflow: `POST /api/v1/team/signup`
- Role: production QA landlord creates invite; public invited user completes signup.
- Evidence: `prod-rest-summary.json`, check `team-invite-signup-complete`, and Sentry issue `CAPVERI-BACKEND-20`.
- Repro:
  1. Deploy the token-visibility fix above.
  2. Sign in as the production QA landlord.
  3. Create a fresh team invite.
  4. Complete public team signup with the returned token, full name, and strong password.
- Expected: signup creates/signs in the invited user and marks the invite used.
- Actual before fix: production returned `500`. Sentry showed `duplicate key value violates unique constraint "users_pkey"` for the newly created auth user id.
- Root cause: Supabase auth user creation can create the matching public `users` row through an auth trigger. `TeamInvitationService.complete_signup()` then attempted a plain insert into `users`, which failed when the row already existed.

### Fix

- Updated `backend/app/services/team_invitation.py` so invited team signup upserts the public `users` row instead of inserting it.
- Added regression coverage in `backend/tests/services/test_team_invitation.py` for the auth-trigger-created public user row path.
- Updated API and edge-case tests to assert the new idempotent upsert behavior.
- Stabilized date parser fuzz tests by disabling Hypothesis timing deadlines for date parsing cases; generated input coverage remains unchanged, but full-suite coverage validation is no longer sensitive to local machine load.

## Non-Bug Notes

- MRI ERP exports are fixed-width text, not comma-delimited CSV. The runner was corrected to validate those bytes as printable fixed-width content.
- The PWA offline indicator was present in captured page text. The initial probe checked visibility after returning the context online and was corrected.
- Responsive probes initially used synthetic localStorage and were redirected to login. The runner was corrected to reuse real Supabase storage state from the authenticated QA contexts.
- Certificate PDF byte validation remains a gap because production did not return a certificate ID for the reused QA snapshot.
- Real Stripe card entry/payment remains intentionally untested.

## Validation

- Regression before fix: `cd backend && python -m pytest tests/services/test_team_invitation.py::TestValidateToken::test_valid_token_success_when_invitation_is_hidden_by_rls -q --no-cov` failed with `InvalidInvitationTokenError: not_found`.
- Focused after fix: `cd backend && python -m pytest tests/services/test_team_invitation.py tests/api/v1/test_team_invitations.py -q --no-cov`: 41 passed.
- Regression before second fix: `cd backend && python -m pytest tests/services/test_team_invitation.py::TestCompleteSignup::test_upserts_public_user_created_by_auth_trigger -q --no-cov` failed because `upsert` was not called.
- Focused after second fix: `cd backend && python -m pytest tests/services/test_team_invitation.py tests/api/v1/test_team_invitations.py -q --no-cov`: 42 passed.
- Focused invite edge coverage: `cd backend && python -m pytest tests/services/test_team_invitation.py tests/services/test_team_invitation_edge_cases.py tests/api/v1/test_team_invitations.py -q --no-cov`: 56 passed.
- Parser fuzz stability: `cd backend && python -m pytest tests/test_parser_fuzzing.py::TestCleanDateFuzzing -q --no-cov`: 4 passed, 1 skipped.
- `python backend/scripts/sync_requirements.py --check`: passed.
- `cd backend && python -m black app tests`: passed.
- `cd backend && python -m isort app tests --profile black`: passed.
- `cd backend && python -m ruff check app tests --fix`: passed.
- Focused after formatting/lint: `cd backend && python -m pytest tests/services/test_team_invitation.py tests/services/test_team_invitation_edge_cases.py tests/api/v1/test_team_invitations.py -q --no-cov`: 56 passed.
- `cd backend && python -m pytest -q --tb=short`: 6373 passed, 50 skipped, 22 deselected, coverage 95.07%.
- `cd backend && python -m pytest --cov=app --cov-fail-under=95 -q`: 6373 passed, 50 skipped, 22 deselected, coverage 95.07%.

## Deployment Recheck

- Production API health confirmed deployment of commit `7be4a31489bd674c5b412f101b5aaa42e2582ffb`.
- Production rest-of-scope runner: `node output\playwright\prod-e2e-rest-2026-05-07\prod-rest-runner.mjs`.
- Recheck result: 40 checks, 0 findings.
