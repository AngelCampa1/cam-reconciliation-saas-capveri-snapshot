# Tenant Attachment Rollback Prod E2E Handoff

## Location

- Repo: `<repo-root>`
- Active worktree: `<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e`
- Branch: `add-tenant-attachment-rollback-prod-e2e`
- Base commit: `7698df3f669f4e1506f2e1e53c7eafa5a8e1bf91`

## Overarching Objective

Expand production E2E coverage beyond superficial checks by using real production fixture data, proving tenant isolation/security boundaries, and independently auditing cleanup of all generated data.

This branch focuses on the tenant dispute attachment upload boundary. The objective is to ensure a tenant cannot upload an attachment to another tenant's dispute and that the route rejects the request before it writes anything to R2.

## Bug Found

The tenant attachment upload route wrote to R2 before proving the tenant owned the dispute.

Observed pre-fix production behavior:

- Tenant A attempted to upload a valid PDF to Tenant B's dispute.
- The route wrote to storage first.
- The DB insert/ownership step failed.
- The route attempted rollback.
- The response was `500 storage_error`.

That is not acceptable for an authorization boundary. Wrong-tenant attachment upload should be rejected before storage key generation or object write.

## Current Branch Changes

### `cloudflare-backend/src/http/tenant-disputes-routes.ts`

Adds a pre-storage ownership check in `POST /tenant/disputes/:disputeId/attachments`:

- Calls `repo.getDispute({ disputeId, tenantUserId: tenant.id })`.
- If no dispute is returned, throws `404 not_found`, message `Dispute not found`.
- This runs before `storage.generateKey`, `file.arrayBuffer`, or `storage.putAttachment`.

### `cloudflare-backend/src/test/tenant-disputes-routes.test.ts`

Adds a regression test:

- Sets the in-memory repository's `disputeDetail` to `null`.
- Posts a valid PDF to the tenant attachment upload route.
- Expects `404`.
- Asserts fake storage does not contain the deterministic key.
- Asserts `storage.deletedKeys` is `[]`, proving no storage write or rollback path occurred.

Also changes the default in-memory `disputeDetail` to a tenant-owned dispute so existing attachment upload tests still represent the owned-dispute path.

### `frontend/scripts/prod-tenant-attachment-rollback-boundary-scenario.mjs`

New production E2E harness:

- Creates two marked synthetic same-org tenant fixtures.
- Signs in both synthetic tenants.
- Verifies each tenant can access its own statement and dispute.
- Verifies Tenant B has zero attachment metadata before the wrong-tenant upload.
- Tenant A attempts to upload a valid PDF to Tenant B's dispute.
- Expects `404 not_found`, message `Dispute not found`.
- Verifies Tenant B still has zero attachment metadata after the wrong-tenant upload.
- Cleans both fixtures.
- Verifies deleted synthetic tenant auth users cannot sign in.

The harness cannot directly list arbitrary R2 prefixes with the installed Wrangler command set. The security proof is therefore:

- Backend route now validates ownership before storage key generation/write.
- Unit regression proves no storage call occurs on not-owned dispute.
- Production black-box scenario proves no attachment metadata is created and the request returns the intended authorization-shaped `404`.

## Production Evidence

### Pre-Fix Evidence

Pre-fix prod harness run showed the bad behavior:

- Report root: `<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e\e2e-adhoc\prod-tenant-attachment-rollback-boundary-2026-06-28T13-26-37-438Z`
- Wrong-tenant upload returned `500 storage_error`.
- Message: `Failed to record attachment; upload rolled back`.
- Cleanup succeeded.

Independent cleanup audit for that pre-fix run:

- Report root: `<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e\e2e-adhoc\prod-cleanup-audit-2026-06-28T13-26-56-126Z`
- `ok: true`
- `source_reports: 1`
- `checks: 12`
- `failures: []`

### Latest Post-Fix Evidence

Backend deploy:

- Code deploy version: `25c08d8f-c475-44de-b562-4974f49399fa`
- After final fixture secret rotation, active Worker version: `4fca29ac-1693-499f-b816-fd207155e629`
- `npx wrangler deployments status --name capveri-api` showed `100%`.
- `curl.exe -fsS https://api.capveri.com/health` returned healthy JSON.

Latest production scenario report:

- Report root: `<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e\e2e-adhoc\prod-tenant-attachment-rollback-boundary-2026-06-28T13-35-49-610Z`
- `ok: true`
- Wrong-tenant upload returned `404`.
- Error code: `not_found`.
- Message: `Dispute not found`.
- `attachment_ids_created: 0`.
- Tenant B attachment metadata remained `0` before and after.

Latest independent cleanup audit:

- Report root: `<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e\e2e-adhoc\prod-cleanup-audit-2026-06-28T13-36-07-167Z`
- `ok: true`
- `source_reports: 1`
- `checks: 12`
- `failures: []`

## Checks Already Run

Passed:

```powershell
cd "<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e\cloudflare-backend"
npx prettier --write "src/http/tenant-disputes-routes.ts" "src/test/tenant-disputes-routes.test.ts"
npx vitest run src/test/tenant-disputes-routes.test.ts
```

Latest focused test result:

- `1` test file passed.
- `31` tests passed.

Also passed before the final harness naming-only patch:

```powershell
npm run typecheck
npm run lint
```

Passed after the final harness naming-only patch:

```powershell
cd "<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e"
node --check "frontend\scripts\prod-tenant-attachment-rollback-boundary-scenario.mjs"
git diff --check
```

## Where Work Stopped

The user asked to stop while the final backend typecheck rerun was in progress.

Treat the final post-patch typecheck as incomplete.

No commit was made.

No merge to `master` was made.

No push was made.

The required code review was not completed. Two review attempts were started but interrupted/closed. Do not rely on either as completed review.

## Current Git State

Expected changed files:

```text
cloudflare-backend/src/http/tenant-disputes-routes.ts
cloudflare-backend/src/test/tenant-disputes-routes.test.ts
frontend/scripts/prod-tenant-attachment-rollback-boundary-scenario.mjs
docs/handoffs/20260628-084044-tenant-attachment-rollback-prod-e2e.md
```

The handoff doc itself is newly added by request and should be included only if the next agent wants to keep the handoff in git. Otherwise leave it uncommitted or delete it before final commit.

## Next Steps

1. Refresh status.

```powershell
cd "<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e"
git status --short --branch
git diff --stat
```

2. Run the remaining local backend checks sequentially.

```powershell
cd "<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e\cloudflare-backend"
npm run typecheck
npm run lint
```

3. Run required code review against the current diff.

Review must inspect the actual uncommitted diff in:

```powershell
<repo-root>\.worktrees\add-tenant-attachment-rollback-prod-e2e
```

Fix any real review findings, then rerun impacted checks.

4. Commit exact intended files.

Likely commit files:

```text
cloudflare-backend/src/http/tenant-disputes-routes.ts
cloudflare-backend/src/test/tenant-disputes-routes.test.ts
frontend/scripts/prod-tenant-attachment-rollback-boundary-scenario.mjs
```

Decide separately whether to commit this handoff doc.

Do not stage generated E2E report directories.

5. Merge locally to `master` per repo rules.

From main repo:

```powershell
cd "<repo-root>"
git pull
git merge --no-ff add-tenant-attachment-rollback-prod-e2e
```

6. Rerun appropriate post-merge checks.

At minimum:

```powershell
cd "<repo-root>\cloudflare-backend"
npm run typecheck
npm run lint
npx vitest run src/test/tenant-disputes-routes.test.ts
cd "<repo-root>"
node --check "frontend\scripts\prod-tenant-attachment-rollback-boundary-scenario.mjs"
```

7. Push.

```powershell
cd "<repo-root>"
git push origin master
```

8. Clean up worktree only after merge/push is complete and no processes are using it.

## Important Cautions

- Do not rerun the prod harness without running the independent cleanup audit immediately afterward.
- If rerunning prod:
  - Load env from `<repo-root>\.env.local` and `<repo-root>\frontend\.env.production.local` without copying secrets into git.
  - Rotate/set `PROD_E2E_FIXTURE_SECRET` in the same shell that runs the harness.
  - Verify `capveri-api` reaches `100%` current version after secret rotation.
  - Verify `/health`.
  - Run the scenario.
  - Scope `PROD_CLEANUP_AUDIT_REPORT_ROOTS` to the latest scenario report root.
  - Run `frontend/scripts/prod-cleanup-audit.mjs`.
- Railway is retired. Do not use Railway as a deploy or verification target.
- Do not stage `.env`, generated report directories, `node_modules`, or unrelated files.
- Run checks sequentially, not in parallel.
