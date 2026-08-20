# Cloudflare Railway Migration Handoff

Date: 2026-06-13

## Objective

Eliminate the CapVeri Railway bill by moving Railway-hosted backend compute to
Cloudflare-native services, not containers. Keep the current production Postgres
provider for now. Do not silently move Supabase/Auth/Postgres/storage just
because the backend compute is moving.

Completion is not proven until Railway billable resources are actually removed
or shown to have zero active billable usage after production cutover. Current
work is implementation progress only.

## Current Worktree

- Repo root: `<repo-root>`
- Active worktree: `<repo-root>\.worktrees\feature-cloudflare-railway-migration`
- Branch: `feature/cloudflare-railway-migration`
- Current head at handoff: `b380c696 docs: update cloudflare payment method migration ledger`
- Worktree status at handoff: clean
- `git pull origin master` at handoff: already up to date

Do not push or merge without following the repo deployment verification rules.
Pushing to `master` triggers Vercel and Railway production builds.

## User Direction To Preserve

- The goal is eliminating the Railway bill, not changing database providers.
- Use Cloudflare Workers paid/native capabilities where they replace Railway
  compute cheaply.
- No containers.
- Time and language changes are acceptable if they move toward the real end
  state.
- Keep the current production Postgres provider for now.
- Use subagents for exploration/review. Multiple review/fix cycles are expected.

## Repo Rules That Matter Most

- Run `git pull` before work.
- Use the worktree-first workflow.
- Run only relevant checks, sequentially.
- Stage exact paths only. Do not use `git add -A` or `git add .`.
- No placeholder code and no TODO/FIXME comments.
- Run review before commit.
- Commit all completed changes.
- Do not push unless the user explicitly asks and deployment verification can be
  completed.

## Completed Migration Slices

The authoritative ledger is
`docs/architecture/cloudflare-railway-migration-inventory.md`.

Recent completed slices on this branch:

| Commit | Slice |
|---|---|
| `f4ee57a2` | Analysis routes |
| `d9991caf` | Team admin routes |
| `bcdec151` | Team signup routes |
| `edb8d5c7` | Tenant auth routes |
| `e789d817` | Tenant portal dashboard and notifications |
| `cf5fc857` | Auth/account lifecycle |
| `0dd69a39` | Billing trial and invoices |
| `6cac4090` | Billing subscription lifecycle |
| `d6d32242` | Billing save-offer flow |
| `0758b457` | Billing money-back guarantee |
| `2b891b35` | Billing payment methods |
| `b380c696` | Ledger update for billing payment methods |

Billing self-serve is no longer listed as a remaining cutover blocker in the
ledger.

## Last Completed Slice

Commit `2b891b35` added Cloudflare Worker payment-method billing routes:

- `GET /api/v1/billing/payment-methods`
- `POST /api/v1/billing/payment-methods/setup`
- `POST /api/v1/billing/payment-methods/:paymentMethodId/default`
- `DELETE /api/v1/billing/payment-methods/:paymentMethodId`

Important behavior:

- List is landlord-readable.
- Setup/default/delete are owner-only.
- Stripe payment methods are verified against the org Stripe customer before
  mutation.
- Deleting the only card returns `400`.
- Missing or foreign Stripe payment methods return not found instead of leaking
  another customer's existence.
- Missing SetupIntent `client_secret` returns a structured `400`.

Validation run for the last slice:

```text
npm test -- billing
Test Files  2 passed (2)
Tests       93 passed (93)

npm run typecheck
tsc --noEmit passed

npm run lint
eslint . passed

npm test
Test Files  50 passed (50)
Tests       611 passed (611)

npx wrangler deploy --dry-run --env production --outdir ".wrangler-dry-run-production"
Dry-run bundle succeeded.
```

The dry-run output directory was removed safely after validation.

## Review Status

A code review subagent reviewed the payment-method slice and found:

1. Missing Stripe payment methods would map to `502`.
2. Mutation auth coverage was incomplete for default/delete.

Both findings were fixed before commit. The focused billing tests were rerun
after the fixes.

## Remaining Cutover Blockers

From the ledger, current remaining blockers are:

1. Tenant portal remainder: statement PDF generation/download and tenant
   dispute routes.
2. Export/report document generation: reconciliation exports, report download
   flows, demand-letter generation.
3. Compliance/tax protest, warranty, campaigns, property import history,
   cap-bank ledger, and remaining analysis gaps.

There are also production cutover unknowns that must be resolved before Railway
can be deleted:

- Railway services/plugins/volumes/domains/add-ons inventory.
- Whether Redis/Celery is Railway-hosted or external.
- Whether Railway GitHub auto-deploy is still active.
- DNS for `api.capveri.com` before and after cutover.
- Webhook endpoints in Stripe and Resend.
- Scheduled work and cron triggers.
- Production `DATABASE_URL` host and current Postgres owner.
- Storage object locations across Supabase Storage and R2.

## Recommended Next Slice

Start with tenant portal statement PDF and dispute routes because the ledger
lists it as the top remaining blocker.

Suggested first exploration targets:

- `backend/app/api/v1/tenant_portal.py`
- `backend/app/api/v1/tenant*.py`
- `backend/app/services/tenant*`
- `backend/app/services/*statement*`
- `backend/app/services/*dispute*`
- `frontend/src/features/tenant*`
- `frontend/src/pages/tenant*`
- `cloudflare-backend/src/http/*tenant*`
- `cloudflare-backend/src/test/*tenant*`
- `docs/architecture/tenant-portal-architecture.md`

Use `rg` first, for example:

```powershell
rg -n "statement|dispute|tenant portal|tenant_portal|pdf" backend frontend cloudflare-backend docs
```

Expected shape of the next turn:

1. Run `git pull origin master`.
2. Read the Cloudflare Workers best-practices skill and fetch current
   Cloudflare Workers guidance before Worker edits.
3. Spawn a read-only exploration subagent to map the FastAPI contract and
   frontend usage for statement PDF/disputes.
4. Implement the Worker slice locally while exploration runs, but only after the
   contract is clear enough.
5. Add focused route/repository tests.
6. Run focused tests, typecheck, lint, full Worker tests, and
   `wrangler deploy --dry-run --env production`.
7. Spawn a review subagent.
8. Fix every review finding and rerun relevant checks.
9. Commit implementation.
10. Update the migration ledger and commit docs.

## Cloudflare Worker Patterns To Reuse

Existing Worker billing and tenant slices show the local style:

- `cloudflare-backend/src/http/billing-routes.ts`
- `cloudflare-backend/src/http/tenant-portal-routes.ts` if present
- `cloudflare-backend/src/domain/*/repository.ts`
- `cloudflare-backend/src/adapters/db/*`
- `cloudflare-backend/src/test/*routes.test.ts`

Keep these patterns:

- Hono route modules with injected repositories for tests.
- Auth through `authMiddleware` and route-level role checks.
- Structured `HttpError` responses.
- Direct Postgres executor through existing DB adapters unless a binding already
  exists.
- R2 bindings for document object access where available.
- No request-scoped mutable module state.
- Await every `fetch`/Promise.
- Use `ctx.waitUntil()` only for actual post-response work and do not destructure
  `ctx`.

## Completion Definition

Do not mark the Railway-elimination goal complete until current evidence proves:

- `api.capveri.com` production traffic is served by Cloudflare Worker, not
  Railway.
- All production webhooks and scheduled jobs target Cloudflare or another
  retained non-Railway service.
- The Railway `camaudit` service is not needed for rollback and has been deleted
  or scaled/stopped according to the approved cutover plan.
- The Railway `Worker service` is not processing jobs and has been deleted or
  scaled/stopped according to the approved cutover plan.
- Any Railway Redis/plugin/volume/domain/add-on billable resources are deleted
  or explicitly retained with evidence that they do not create a CapVeri Railway
  bill.
- Railway usage/billing/resource screens show no active billable source for the
  project.

Until those are proven, leave the goal active or hand it off. Do not redefine
success around committed code alone.
