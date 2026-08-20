# HANDOFF: E2E Stress / Bug-Find Goal (Worker-engine parity phase)

**Written:** 2026-06-29, mid-Cycle 57. For the next agent to pick up and finish the persistent `/goal`.

---

## 0. The goal (verbatim intent, Stop-hook enforced, carries across sessions)

> "Find out everything that was tested in the original session and expand, test more areas, more edge cases, find high-risk areas and find bugs on them." Test the system E2E, generate scenarios to stress it, review input AND output for correctness, find/fix/verify on a loop. "Bug finding cycle then bug fixing cycle on and on until nothing more is found. Sub-agent driven effort. Multiple review/fix cycles are required until there's nothing left to fix or complete." Continue chunk-to-chunk, don't idle-wait, until verified complete.

Two standing mandates that **cut both ways**, do not forget them:

- **RESEARCH mandate (verbatim):** *"you need to do in depth research to find out what's correct."* Research determines the financially/technically-correct answer. **Matching the Python oracle is NOT automatically correct, AND diverging from it is NOT automatically a bug.** Adversarially verify every finding against real source before fixing. A finder's claim is not auto-true; an oracle divergence is not auto-a-bug.
- **SECURITY constraint (verbatim, MUST stay in effect):** *"please don't register hundreds of new accounts, use real emails, you may use variations of angel.campa@capveri.com or mess directly with the db to get the state you need."*

This is an **open-ended quality goal**. It does not "finish" at a fixed count. It converges when fresh, well-targeted finder sweeps stop producing genuine fail-closed defects and only surface decision-gated/by-design items. The honest end state is "diminishing returns: N consecutive CLEAN cycles + a clean decision-gated backlog handed to Angel," not "zero possible findings."

---

## 1. Current phase & architecture (READ THIS FIRST)

**CURRENT PHASE: Worker-engine parity / high-risk hunt (Cycles 19 to 57+).**

- **PRODUCTION backend = the TypeScript Cloudflare Worker** at `cloudflare-backend/` (prod `api.capveri.com`, worker name `capveri-api`). All finders MUST be pinned to this path **in the prompt** ("ignore `backend/` Python, cite `cloudflare-backend/src/...`"). Finders drift onto the Python oracle if you don't pin them (see C50 Finder A miss).
- **Python `backend/` = NON-DEPLOYED ORACLE / source of truth only.** Read it to determine the correct answer; never treat "ported to oracle" as automatically right or as a deployable change.
- The Worker connects via a **Hyperdrive transaction-mode pooler that BYPASSES Postgres RLS.** The ONLY tenant boundary is explicit `where organization_id=$N` / `tenant_user_id=$N` SQL predicates. **Tenant org id == landlord org id**, so tenant-portal routes MUST scope by `tenant_user_id`, not org.
- **Money** = integer-cents `Money` (scale 100) / `Rate` (scale 1e8) in `cloudflare-backend/src/domain/reconciliation/money.ts` (bigint internally, the 2^53 precision class does NOT apply), plus `decimal.js` (`PyDecimal`, precision 28, HALF_UP) for oracle-parity paths. `new Decimal(jsFloat)` is EXACT for ≤15 sig digits, so "float decode drifts pennies" is usually FALSE. `NUMERIC(14,2)` DB cols round-trip exactly.

---

## 2. The per-cycle loop (the method, follow it exactly)

Each cycle:

1. **Launch 3 parallel read-only `Explore` finders, `run_in_background: true`**, each pinned to the deployed worker, each on a DISJOINT dimension. Prompt template: forensic auditor, scope = `cloudflare-backend/src`, oracle = read-only reference, cite file:line, **adversarially try to DISPROVE each finding before reporting**, report honest severity + disproof attempt, say CLEAN explicitly with evidence if clean. Use the three live Cycle-57 prompts (in the transcript / task descriptions) as the model.
2. **Poll, don't idle.** You get a completion notification per finder. Triage each on arrival.
3. **Adversarially triage every finding** against real source (read the actual code + oracle + tests). The research mandate cuts both ways. Most HIGH/CRITICAL finder claims this goal have been over-labeled or false positives. Verify before shipping.
4. **Classify each finding:**
   - **Unambiguous fail-closed, zero-behavior-change correctness fix** → ship direct-to-master (procedure §3).
   - **Outward-facing / high-blast / schema / policy / product-intent change** → DO NOT ship autonomously. Surface as a `TaskCreate` `[DECISION-GATED]` (or `[NEEDS-RESEARCH]`) task for Angel.
   - **By-design / false positive** → record the disproof, do not touch.
5. **Close the cycle:** write `scratchpad/cycleNN.md`, append to the ledger (§4), update memory (§5), complete the cycle's task, create the next cycle's task, launch the next cycle. **Don't stop between cycles**, continue until genuinely blocked or the user intervenes.

**Sub-agent model:** default finders to cheap/small models where possible; reserve heavier reasoning for genuinely hard triage. `Explore` agents are read-only (good, they locate, they don't edit).

---

## 3. Ship / gate / deploy procedure (when a fix is justified)

All from `cloudflare-backend/`:

```bash
# Gate (scope to impacted files/suites; sequential, never -n auto, never across projects in parallel)
npx tsc --noEmit
npx eslint <changed files>
npx vitest run <impacted suites>     # "close timed out after 10000ms" = BENIGN Vite-exit hang, NOT a failure
```

- **Stage ONLY files you changed:** `git add -- "path1" "path2"`. NEVER `git add -A`/`.`, never commit `.env` or another track's generated files.
- **Commit** (sign-off disabled per repo norm): `git -c commit.gpgsign=false commit -m "..."` with trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Pull before push** (multi-machine repo): `git stash` (if dirty) → `git pull --rebase origin master` → `git stash pop`.
- **Merges are LOCAL to master: do NOT open PRs.** If you used a worktree/branch: `git merge --no-ff <branch>`, re-run the gate, then push. Close any PR opened by mistake.
- **Code review before merge** for non-trivial changes: invoke `superpowers:requesting-code-review` (or the `review-merge` skill), fix every flagged issue, re-run tests.
- **Push:** `git push origin master`.
- **Deploy:** `npx wrangler deploy --env production`.
- **VERIFY the deploy reaches a healthy terminal state** (non-negotiable): `npx wrangler deployments status --name capveri-api` shows **100% current version**, AND `curl https://api.capveri.com/health` is healthy. A CLI "success" only means the upload was accepted. Railway is RETIRED, never a deploy/verify target.

**Migration-first:** if a fix touches schema, write the migration in `supabase/migrations/` first, apply+verify locally, then code/tests, commit together. (Most decision-gated items are schema-touching: that's WHY they're gated.)

---

## 4. Ledger (durable record)

- Path: `docs/goal-e2e-stress/LEDGER.md` (currently **6689 lines** as of Cycle 56). Read it first when resuming for full per-cycle history.
- **Append footgun:** write `scratchpad/cycleNN.md` first, then append with ABSOLUTE paths:
  `cat <repo-root>/scratchpad/cycleNN.md >> <repo-root>/docs/goal-e2e-stress/LEDGER.md`

## 5. Memory

- Topic file: `<claude-home>\projects\<repo-project-id>\memory\goal_e2e_stress.md`. Each cycle: prepend the new cycle to the **"Latest:"** line (line ~32), demote the prior cycle to "PRIOR".
- **MEMORY.md index is OVER its size limit (24.9KB vs 24.4KB). Do NOT add new lines to it.** Edit only the `goal_e2e_stress.md` topic file.

---

## 6. Current state (Cycle 76 closed)

**Cycle 76 is CLOSED and DEPLOYED.** It launched three fresh Worker-pinned read-only finder sweeps from clean `origin/master` head `f6899ba86`:

- Lagrange audited AI extraction, HITL approval, document processing, OpenRouter calls, R2 lifecycle, and extraction queue retry/DLQ paths. Result: CLEAN for shippable extraction/HITL bugs.
- Tesla audited public unauthenticated and low-auth surfaces: leads/download tokens, contact requests, AI SDR/AI-CS signed routes, feedback screenshot signing, CORS, and duplicate side effects. Result: found the shipped contact-form PII logging bug; lead duplicate behavior and Resend bounce suppression remain decision-gated/feature work.
- Turing audited admin/platform/prod-test/helper routes and cleanup flows. Result: CLEAN for shippable admin/helper bugs. Production E2E helper exposure and residue cleanup hardening remain policy/hardening choices.

Cycle 76 shipped contact form failure log redaction:

- `ContactRequestService` no longer logs the explicit requester email field when contact notification sending fails.
- `redactContactEmail` redacts both the submitted spelling and normalized lowercase email from the logged error string.
- Existing public behavior is preserved: send failures are swallowed and `/contact-requests` still returns the existing success response.
- No schema migration was introduced.

Ship state:
- Fix commit: `0850824c9`.
- Merge commit / pushed head: `20682f4be`.
- Deploy: `capveri-api` version `a08872a2-6a73-4ea0-9e60-88dc6c96cce5`.
- `npx wrangler deployments status --name capveri-api` showed `(100%) a08872a2-6a73-4ea0-9e60-88dc6c96cce5`.
- `curl.exe -i https://api.capveri.com/health` returned `HTTP/1.1 200 OK`.

Verification:
- Branch focused test: `npm test -- src/test/contact-request-routes.test.ts` - 1 file, 8 passed.
- Branch typecheck: pass.
- Branch lint: pass.
- Branch full backend `npm test`: 121 files passed, 1896 passed, 12 skipped.
- Code review: initial review found error-string email leak; fixed and re-reviewed clean / ready to merge.
- Rebased branch focused/typecheck/lint/full backend: pass.
- Merged-head focused/typecheck/lint/full backend: pass; full backend `npm test` 121 files, 1896 passed, 12 skipped.

**Cycle 75 is CLOSED with no code ship.** It launched three fresh Worker-pinned read-only finder sweeps from clean `origin/master` head `f6899ba86`:

- Darwin audited billing redirects, entitlement boundaries, save-offer, guarantee, subscription/account routes, and Stripe webhook convergence. Result: no shippable findings. It re-confirmed checkout and billing-portal redirect URL allow-listing as decision-gated (`C74-B1`).
- Euclid audited finalized source evidence and mutable source-fact surfaces. Result: re-confirmed pool/config/template mutation after finalization, which maps to existing decision-gated `C63-P1`. No narrower zero-policy-change guard was accepted.
- Fermat audited tenant-facing document/comment/notification/download state machines. Result: CLEAN for shippable tenant scope, signed-token, R2 ordering, notification leakage, and statement/attachment access bugs. Closed-dispute writes remain known policy-gated `#65`.

No new unambiguous fail-closed, zero-behavior-change bug was found. No code was edited, no tests were run, no merge/push/deploy was needed.

Cycle 75 decision-gated re-confirmations:

- `C74-B1`: checkout `success_url` / `cancel_url`, legacy subscribe URLs, and billing portal `return_url` are caller-provided and passed to Stripe. Needs allowed-host policy before changing behavior.
- `C63-P1`: pool/config/template rewrite paths can mutate source facts used by finalized calculations. Needs explicit pool/template version/history policy before blocking or rewriting behavior.
- `#65`: tenant/admin comments and attachments on closed/resolved/rejected disputes remain policy-gated.

**Cycle 74 is CLOSED and DEPLOYED.** It launched three fresh Worker-pinned read-only finder sweeps from clean `origin/master` head `c2ef258e1`:

- Ohm audited Settings/Profile/account, auth lifecycle, organization, and billing/account surfaces. Result: CLEAN for deployed Worker profile/account bugs. Decision-gated: checkout and billing-portal redirect URL host allow-listing needs product/security policy before tightening.
- Anscombe audited report/export/download/signed-token surfaces after the Cycle 72 MIME fix. Result: CLEAN for current export history, R2 key, signed-token, historical PDF, tenant statement, and attachment scoping bugs.
- Galileo audited low-traffic state machines: feedback, cross-doc, CapEx, campaign/finalization/email, SB1103, and tax-protest. Result: found the shipped CapEx bulk-review partial-update race. Campaign, tenant-dispute, cross-doc, and tax-protest transition/read paths were clean.

Cycle 74 shipped atomic CapEx bulk review:

- `POST /api/v1/analysis/capex-flags/bulk-review` now delegates to repository-level `reviewFlags`.
- `PostgresCapExRepository.reviewFlags` validates and mutates inside one transaction, locks unique requested flags with `for update`, returns `not_found` before any update if any requested ID is missing/wrong org, updates all locked flags in one statement, and expands the response back to original request order including duplicates.
- Single-flag review remains unchanged.
- No schema migration was introduced.

Ship state:
- Fix commit: `c37bc3d0a`.
- Merge commit / pushed head: `f6899ba86`.
- Deploy: `capveri-api` version `efe86fcd-5142-4ffb-80ae-4811aa83e22a`.
- `npx wrangler deployments status --name capveri-api` showed `(100%) efe86fcd-5142-4ffb-80ae-4811aa83e22a`.
- `curl.exe -i https://api.capveri.com/health` returned `HTTP/1.1 200 OK`.

Verification:
- Branch focused tests: `npm test -- src/test/capex-routes.test.ts src/test/capex-repository.test.ts` - 2 files, 39 passed.
- Branch typecheck: pass.
- Branch lint: pass.
- Branch full backend `npm test`: 121 files passed, 1896 passed, 12 skipped.
- Branch local CapEx E2E: `npm run test:local-capex` - ok true, 9 flags, total `260000.00`.
- Code review: no Critical or Important findings; ready to merge. Minor duplicate-ID route coverage suggestion was fixed.
- Merged-head focused tests: 2 files, 39 passed.
- Merged-head typecheck: pass.
- Merged-head lint: pass.
- Merged-head full backend `npm test`: 121 files passed, 1896 passed, 23 skipped.
- Merged-head local CapEx E2E: ok true, 9 flags, total `260000.00`.

Cycle 74 decision-gated finding:

- `C74-B1`: checkout and billing-portal redirect URL host allow-listing (`success_url`, `cancel_url`, and portal `return_url`). Decide allowed return hosts before changing behavior.

**Cycle 73 is CLOSED with no code ship.** It launched three fresh Worker-pinned read-only finder sweeps from clean `origin/master` head `134f16467`:

- Euler audited auth, team membership, organization roles, tenant auth, and account lifecycle. Result: CLEAN for shippable tenant-boundary, role-management, invite-token, and account-deletion bugs. Tenant self-deletion remains policy-gated because tenant accounts are currently blocked by the `tenant_users.user_id` deletion blocker.
- Mendel audited actual-billed, rent-roll, property/unit/lease imports, source evidence, and finalized-snapshot interactions. It re-confirmed actual-billed duplicate upload idempotency as decision-gated, and found a narrower lease-fact mutation gap that still belongs in the source-evidence/versioning policy bucket.
- Socrates audited workflows, queues, email/Resend, analytics, export/report async paths, and cron-ish handlers. Result: CLEAN for shippable retry/ack/idempotency/status-regression bugs. Only extraction and reconciliation queues have active runtime handlers; export/email/analytics producer scaffolding has no production call sites and missing handlers retry rather than ack-drop.

No unambiguous fail-closed, zero-behavior-change bug was found. No code was edited, no tests were run, no merge/push/deploy was needed.

Cycle 73 decision-gated findings:

- `C73-A1` / existing `#60`: actual-billed file re-upload for the same property and period appends duplicate billed rows. This needs a product/data policy: reject duplicates, replace period rows, version upload batches, or require an explicit idempotency key.
- `C73-L1`: `PUT /leases/:leaseId` can mutate lease source facts after finalized snapshots exist. The dedicated recovery-profile update and lease delete paths block finalized references, but the general lease update path can still change `unit_id`, `tenant_name`, `start_date`, `end_date`, `status`, and `document_url`. This is narrower than the older broad source-evidence item, but still policy-gated because the durable fix needs an explicit finalization/versioning rule for which lease facts freeze, which can be corrected, and how history is preserved.

**Cycle 72 prior ship:** It shipped the export public re-download MIME fix found by Wegener:

- `ExportDownloadTokenPayload` now optionally carries signed `contentType`.
- Authenticated `/export/download/:exportId` derives the signed content type from trusted export history format / filename.
- Public `/export/download/file` uses only allowlisted signed content types, with filename-extension fallback for legacy tokens that lack `contentType`.
- ZIP, XLSX, CSV, and PDF are the only honored MIME families.
- No schema migration was introduced.

Ship state:
- Fix commit: `d6d77b5ec`.
- Final pushed head: `134f16467`.
- Deploy: `capveri-api` version `20a37d49-f5bc-4ff1-a212-afc86ffec5e8`.
- `npx wrangler deployments status --name capveri-api` showed `(100%) 20a37d49-f5bc-4ff1-a212-afc86ffec5e8`.
- `curl.exe -i https://api.capveri.com/health` returned `HTTP/1.1 200 OK`.

Verification:
- Focused tests before sync: `npm test -- src/test/export-reports-routes.test.ts src/test/export-c2-routes.test.ts src/test/export-c3-routes.test.ts` - 3 files, 97 passed.
- Typecheck: pass.
- Lint: pass.
- Full backend `npm test`: 121 files passed, 1892 passed, 12 skipped.
- Synced-head focused tests: 3 files, 97 passed.
- Synced-head typecheck: pass.
- Synced-head lint: pass.
- Synced-head full backend `npm test`: 121 files passed, 1892 passed, 12 skipped.
- Code review: no Critical or Important findings; ready to merge. Minor malformed-`contentType` token test gap was fixed.
- After review test focused tests: 3 files, 98 passed.
- After review test typecheck: pass.
- After review test lint: pass.
- After review test full backend `npm test`: 121 files passed, 1893 passed, 12 skipped.

Cycle 72 finder outcomes:
- Chandrasekhar billing/guarantee/subscription sweep: re-confirmed checkout exact-replay/double-submit and money-back guarantee refund/cancel compensation as real but decision-gated; stale subscription webhooks and paid-invoice reopening are guarded.
- Sartre tenant portal/dispute/attachment sweep: CLEAN for cross-tenant access, attachment/R2 lifecycle, public/downloadable URLs, tenant statement/report access, and notification side effects. Closed-dispute writes remain known policy-gated `#65`.
- Wegener export/statement/report generation sweep: shipped re-download MIME bug; persisted export creation without an idempotency key is decision-gated; status regression and source scoping were clean.

Cycle 71 prior ship, still relevant context:

- `ExtractionJobRepository.markProcessing(jobId, expectedStatus)` returns `boolean`.
- The Postgres adapter claims only rows currently `pending`, or currently `retrying` with `next_retry_at <= now()`, using `returning id` to prove the claim.
- Already-`processing` redeliveries no longer rerun the extraction pipeline.
- Early `retrying` deliveries and `retrying` rows with null/invalid retry timestamps now throw `ExtractionRetryScheduledError`, so the queue consumer retries instead of acknowledging and losing the only scheduled retry.
- No schema migration was introduced.

Cycle 70 prior ship, still relevant context:

- `PostgresAnalysisRepository.dismissGlAnalysis` updates only rows where `dismissed_at is null`.
- Repeated dismissals or races no longer overwrite the first `dismissed_at` / `dismissed_by_user_id` metadata.
- Guarded misses still use the existing not-found path, so the route keeps returning the existing `404 gl_analysis_not_found` shape for missing or already-dismissed rows.
- CapEx review remains policy-gated: Worker and legacy Python both currently allow terminal-to-terminal review writes by `id + organization_id`, and existing tests do not prove pending-only intent.

Cycle 69 prior ship, still relevant context:

- `POST /api/v1/tax-protest/generate` falls back to configured `property.taxProtestCounty` and `property.state` when request county/state are omitted, null, or empty.
- ZIP cover sheets use `property.taxProtestDeadlineOverride` through `computeEffectiveDeadline`, so the configured override wins over the county deadline.
- Request county/state still win over property fields.
- The fallback logic is covered by a pure resolver helper and tests for property fallback, empty-string fallback, override precedence, and request override.

Cycle 68 prior ship, still relevant context:

- Stripe `invoice.paid` can no longer be regressed back to `open`/non-paid by a delayed `invoice.created` conflict update or delayed `invoice.payment_failed` webhook.
- `PostgresStripeWebhookRepository.upsertInvoice` keeps existing paid invoices intact on the `on conflict (stripe_invoice_id)` update path.
- `PostgresStripeWebhookRepository.markInvoiceOpen` refuses to reopen rows whose current status is `paid`.
- `markInvoicePaid` is unchanged, so `invoice.paid` can still create/match a missing invoice and mark it paid.
- No invoice schema migration was introduced; broader invoice event-timestamp ordering remains out of scope for this narrow paid-state guard.

Cycle 67 prior ship, still relevant context:

- Linked source documents can no longer be deleted after finalized reconciliation snapshots exist for the same lease/org.
- `PostgresDocumentSubmissionRepository.deleteDocument` now checks finalized snapshots before storage deletion when `documents.lease_id` is non-null.
- The guard takes the existing property financial-evidence advisory lock before counting finalized snapshots, matching the finalization/approval critical section.
- The existing `LeaseFinalizedReferenceError` mapping returns `409 lease_in_finalized_snapshot`.
- Unlinked documents, not-found behavior, `processing` rejection, and non-finalized deletes keep existing behavior.

Cycle 66 prior ship, still relevant context:

- SB1103 export can no longer regress a terminal `delivered` request back to `exported`.
- `Sb1103Repository.markExported` now returns `boolean`.
- The Postgres adapter adds `and status != 'delivered'` plus `returning id`.
- The export route maps a guarded miss to `409 sb1103_status_conflict`.
- File generation still happens before status marking; successful exports from non-delivered states remain valid.

Cycle 65 prior ship, still relevant context:

- Redelivered reconciliation queue messages for jobs already stuck in `running` no longer silently ack and leave the job permanently running.
- The workflow now passes the raw queue message into the reconciliation runner.
- If `attempts > 1` and the loaded calculation job is still `running`, the runner marks that same job failed through a guarded repository method.
- The guarded DB update requires `id`, `organization_id`, and `status = 'running'`, with `returning id`; it does not use the existing unguarded failure method.
- Normal `pending` jobs keep the existing claim/calculate path. First-delivery `running` jobs and redelivered `completed`/`failed` jobs remain no-op.

Working tree note: local `master` still has unrelated dirty files and untracked goal docs/scratchpad. Cycle 72 used a clean worktree from `origin/master`; do not stage unrelated local files accidentally.

**Next agent's immediate task:** start Cycle 79 with fresh, disjoint read-only finders pinned to `cloudflare-backend/src`, or triage one of the remaining decision-gated items with Angel. Best next candidates: fresh finders, single-snapshot finalize campaign state only after product flow is decided, actual-billed upload idempotency only after duplicate/replacement/versioning policy is accepted, lease/source-fact and pool/template finalization only after versioning/retention semantics are decided, persisted-export idempotency only after duplicate export-history policy is accepted, Resend inbound webhook ledger only after duplicate-forwarding policy is accepted, feedback/auth lifecycle only after transition semantics are decided, billing redirect allow-listing only after allowed-host policy is accepted, historical PDF revocation only after retention/revocation policy is accepted, or export token defense-in-depth if the user explicitly wants low-risk hardening. Decision-gated backlog: arbitrary stale-running watchdog without redelivery, sqft/source-evidence versioning, lease source-fact mutation after finalization, pool/config/template versioning after finalization, property denominator provenance, CapEx re-review semantics, billing save-offer claim-before-side-effect policy, Resend inbound webhook ledger, auth lifecycle account-deletion race, feedback terminal status/metadata semantics, historical PDF revocation, checkout exact replay/double-submit, money-back guarantee refund/cancel compensation, closed-dispute writes, actual-billed upload idempotency, persisted export idempotency, lead/content duplicate policy, Resend bounce/complaint suppression, production E2E helper exposure policy, billing redirect allow-listing, and single-snapshot finalize campaign state.
## Cycle 77 - SB1103 terminal status regression guard

Cycle 77 launched three fresh Worker-pinned read-only finder sweeps from clean `origin/master` head `20682f4be`:

- Hume audited import/parser/idempotency/retry paths. Result: CLEAN for shippable bugs; actual-billed duplicate upload, rent-roll new-property import, and source-evidence versioning remain decision-gated.
- Avicenna audited reconciliation/finalization. Result: re-surfaced the known single-snapshot finalize campaign-stuck issue, already decision-gated as task `#56`.
- Kierkegaard audited tax/SB1103/historical/legal tools. Result: found the shipped SB1103 PATCH terminal-status regression bug; tax protest, historical export access, cross-doc edits, GL narrative/detail advisor, and denominator-change paths remained clean or decision-gated.

### SHIPPED - SB1103 PATCH cannot regress delivered requests

`PATCH /api/v1/compliance/sb1103/:id` accepted `pending|exported|delivered|overdue` and passed the status straight to `updateRequest`. The export endpoint already prevented `delivered -> exported`, but the generic PATCH path could still move a delivered legal-delivery record back to an active/export state.

Fix:

- Added `Sb1103StatusConflictError`.
- Added an atomic Postgres update predicate for manual non-terminal status updates: `status != 'delivered'`.
- Preserved existing behavior for notes-only updates and `status: "delivered"` updates.
- If the guarded update misses because the existing row is delivered, the route now returns `409 sb1103_status_conflict`.
- Missing rows keep the existing 404 path.
- No schema migration was introduced.

Ship:

- Fix commit `0fc3cea00`.
- Merge commit `74d641f7f`.
- Pushed `master` to `origin/master`.
- Deployed `capveri-api` version `8e9bbb21-3804-4eaa-afa1-8a8bc1d95952`.
- `npx wrangler deployments status --name capveri-api` showed `(100%) 8e9bbb21-3804-4eaa-afa1-8a8bc1d95952`.
- `curl.exe -i https://api.capveri.com/health` returned `HTTP/1.1 200 OK`.

Verification:

- Branch focused test: `npm test -- src/test/sb1103-routes.test.ts src/test/sb1103-repository.test.ts` - 2 files, 66 passed.
- Branch typecheck: pass.
- Branch lint: pass.
- Branch full backend `npm test`: 121 files passed, 1899 passed, 12 skipped.
- Branch local SB1103 E2E: `npm run test:local-sb1103` - `ok: true`.
- Code review: clean / ready to merge; one minor test-name recommendation applied.
- Rebased branch focused test: 2 files, 66 passed.
- Rebased branch typecheck: pass.
- Rebased branch lint: pass.
- Rebased branch full backend `npm test`: 121 files passed, 1899 passed, 12 skipped.
- Rebased branch local SB1103 E2E: `ok: true`.
- Merged-head focused test: 2 files, 66 passed.
- Merged-head typecheck: pass.
- Merged-head lint: pass.
- Merged-head full backend `npm test`: 121 files passed, 1899 passed, 12 skipped.
- Merged-head local SB1103 E2E: `ok: true`.

### Decision-gated / clean notes

- **Decision-gated #56 re-confirmed:** single-snapshot finalization can leave a campaign in `draft`; batch finalization handles this path. Needs product/flow decision before changing single-finalize behavior.
- **Decision-gated:** actual-billed duplicate upload idempotency remains policy/schema work.
- **Decision-gated:** rent-roll re-upload/new-property behavior remains policy/schema work.
- **Decision-gated:** source-evidence/versioning surfaces remain policy/schema work.
- **Decision-gated:** historical PDF public link revocation and export-token defense-in-depth remain policy/hardening choices.
- Tax protest, cross-doc reviewed edits, GL narrative/detail advisor, denominator-change, and import retry/delete paths were clean for this cycle's shippable-bug scope.

### Durable lesson

The SB1103 terminal-state class has two paths: export status marking and generic manual PATCH. A guard on the specialized export endpoint does not protect the generic status mutation path. For terminal legal/compliance records, audit every status writer, not only the most common workflow endpoint.

## 7. Decision-gated / needs-research backlog (DO NOT autonomously ship: these are Angel's calls)

These are REAL but require product/policy/schema decisions. They are tracked as tasks; surface them to Angel, don't unilaterally change behavior:

| Task | Summary |
|---|---|
| #38 | [DECISION-GATED] mid-period term-version segmentation port |
| #39 | Oracle+Worker cap-history double-count under segmentation (#38 prereq) |
| #42 | [DECISION-GATED] Finalization email exposure: exact-period vs overlap join |
| #44 | [DECISION-GATED] Duplicate-finalized-snapshot race: unique constraint / concurrency guard |
| #48 | [DECISION-GATED] Block re-trial for orgs that already had a subscription (canceled+past_due re-arm unlimited 30d trials) |
| #49 | Populate `email_suppressions` from Resend bounce/complaint webhooks (missing feature) |
| #52 | [DECISION-GATED] Credit-pack refund/chargeback does not claw back paid access |
| #53 | [DECISION-GATED] content_leads dup-lead/dup-email TOCTOU: unique index + on-conflict |
| #56 | [DECISION-GATED] Single-snapshot finalize leaves campaign permanently stuck 'draft' (unsendable, no recovery) |
| #58 | [DECISION-GATED] Finalized PDF shows stale engine trace next to overridden total (no manual_overrides disclosure) |
| #60 | [DECISION-GATED] actual-billed re-upload has no idempotency guard (duplicate billed rows) |
| #61 | [DECISION-GATED] rent-roll re-upload always inserts new property+units (no dedup) |
| #62 | [NEEDS-RESEARCH] Cumulative cap history divergence: Worker loads ALL prior finalized snapshots; oracle filters base_year-onward. Re-confirmed C56. Needs CAM research + product intent. Do NOT reflexively port to oracle. |
| #65 | [DECISION-GATED] Comments/attachments can be added to closed/resolved/rejected disputes (no terminal-status guard) |
| C63-U1 | [NEEDS-RESEARCH] Unit delete can destroy square-footage source evidence for leases tied to finalized snapshots, but it is not a direct finalized-snapshot cascade. Decide whether to block, version, or preserve source evidence. |
| C63-P1 | [DECISION-GATED] Pool/config/template deletes and replacements after finalization need explicit version/history policy before blocking or rewriting behavior. |
| C64-S1 | [DECISION-GATED] Finalized source-evidence mutation policy: unit sqft, lease/unit association, property sqft denominator, and source document deletion can alter live provenance for finalized `tenant_sqft_estimate` snapshots. Needs versioning/retention decision, not blanket autonomous block. |
| C64-Q1 | [PARTIALLY SHIPPED C65] Reconciliation queue redelivery for still-`running` jobs now fails the job recoverably. Remaining decision-gated gap: arbitrary old `running` jobs with no future redelivery need stale-running retry/watchdog policy. |
| C64-R1 | [DECISION-GATED] Resend inbound webhook redelivery can duplicate forwarded admin emails; decide whether admin-forwarding needs persisted Svix idempotency. |
| C65-D1 | [SHIPPED C67] Linked/verified source documents can no longer be deleted after finalized snapshots exist. Before storage delete, linked docs now reject when that lease/org has finalized reconciliation snapshots. |
| C65-S1 | [DECISION-GATED] Unit sqft edits/deletes, lease `unit_id` reassignment, and property `total_rentable_sqft` edits can change live sqft provenance for finalized `tenant_sqft_estimate` snapshots. Durable fix likely needs frozen operands or source versioning. |
| C65-O1 | [SHIPPED C66] SB1103 export can no longer regress `delivered` requests back to `exported`; `markExported` now guards `status != 'delivered'` and returns 409 on miss. |
| C65-O2 | [POLICY-GATED] CapEx review can last-write-win terminal dispositions, but Cycle 70 sidecar triage found Worker and legacy Python both currently allow terminal-to-terminal review writes. If Angel decides review is `pending -> terminal`, guard `where disposition = 'pending'`; otherwise explicitly allow re-review. |
| C65-O3 | [SHIPPED C70] GL narrative dismissal now preserves first dismissal metadata by updating only rows where `dismissed_at is null`; guarded misses keep the existing not-found path. |
| C65-B1 | [DECISION-GATED] Billing save-offer accept/decline has a side-effect ordering gap around Stripe coupon application before local accepted marker. Needs claim-before-side-effect or compensation policy. |
| C68-S1 | [SHIPPED C68] Stripe paid invoices can no longer regress to `open`/non-paid from delayed `invoice.created` or `invoice.payment_failed`; invoice conflict/open writes now preserve `paid`. |
| C68-T1 | [SHIPPED C69] Tax-protest ZIP cover sheet now falls back to configured property `tax_protest_county`, property state, and `tax_protest_deadline_override` when request county/state are omitted, null, or empty; request values still win. |
| C68-X1 | [DEFENSE-IN-DEPTH] Export download tokens could bind `organizationId` and `exportId` as first-class payload fields and assert R2 key prefix on the public file route; no current IDOR found. |
| C71-Q1 | [SHIPPED C71] Extraction queue redeliveries no longer rerun already-processing jobs, bypass retry backoff, or lose early/null-timestamp retry deliveries; processing claim now requires observed pending or due retrying state. |
| C71-R1 | [DECISION-GATED] Resend inbound webhook forwarding has no persisted Svix event ledger; decide duplicate/failed forwarding semantics before adding idempotency. |
| C71-A1 | [DECISION-GATED] Auth lifecycle account deletion can race after read/validate and before external deletion; decide delete serialization / DB-conditional policy. |
| C71-F1 | [DECISION-GATED] Feedback status/metadata patching can regress terminal statuses or replace metadata; decide transition and merge semantics. |
| C71-X1 | [DECISION-GATED] Historical PDF public links are 7-day HMAC URLs without export-history revocation rows; decide revocation/retention semantics. |
| C72-E1 | [SHIPPED C72] R2-backed export re-download tokens now preserve PDF/ZIP/XLSX/CSV content type instead of the public file route hardcoding `application/pdf`. |
| C72-E2 | [DECISION-GATED] Persisted export generation has no idempotency key; retry/double-click can create duplicate export-history rows and R2 objects. Decide whether duplicate history is acceptable. |
| C73-A1 | [DECISION-GATED] Actual-billed file re-upload for the same property and period appends duplicate billed rows. Decide whether to reject duplicates, replace period rows, version upload batches, or require an explicit idempotency key. |
| C73-L1 | [DECISION-GATED] `PUT /leases/:leaseId` can mutate finalized lease source facts (`unit_id`, tenant name, dates, status, document URL) even though recovery-profile updates and lease deletes block finalized references. Needs finalization/versioning policy before freezing or rewriting behavior. |
| C74-B1 | [DECISION-GATED] Checkout and billing-portal redirect URL host allow-listing. Decide allowed hosts for checkout `success_url` / `cancel_url` and portal `return_url` before tightening behavior. |
| C62-G1 | [DECISION-GATED] Money-back guarantee refund/cancel compensation if refund succeeds but cancellation/local cancellation fails after claim. |
| C62-G2 | [DECISION-GATED] Checkout exact-replay/double-submit policy before webhook-created subscription state exists. |
| C62-G3 | [DECISION-GATED] Broader property/unit/lease/pool updates after finalization need explicit block vs version/effective-date policy; do not blanket-block autonomously. |

**Consider proactively presenting this backlog to Angel**, the goal may be near its real convergence point, and these gated items are where the remaining value is. A good handoff-back to Angel is: "the autonomous fail-closed vein is largely exhausted; here are N decisions only you can make."

---

## 8. Durable lessons (recurring false-positive veins + real ship tells)

**Real ship tells (shippable fail-closed, zero-behavior-change):**
- **success-atomic / failure-not asymmetry:** a handler's happy path wraps a multi-table write in `executor.transaction` but its error path issues the same writes un-wrapped (often inconsistent orderings across two failure sites) → mirror the happy path. (C44/C54 class.) Rank by reachable bad state: "blocks the recovery path / strands a row out of its recoverable set" is non-benign even at low probability; but if the FIRST-committed write is the authoritative/fail-safe control, the partial state is benign + retry-healing (don't ship).
- **lone-outlier sibling:** a method/query omits a scoping/safety arg (`organization_id`, `::text` cast, a checked boolean return) that every sibling in the same file/flow includes → tautological-for-legit-data, zero-change fail-closed align. (C48/C50/C51 class.)
- **`::text`-cast test is PRECISE: INTERNAL consumer only.** Cast a bare NUMERIC/date read when the value feeds `String()`/`new Decimal()`/date-math (zero observable change). EXCLUDE when returned DIRECTLY via `c.json` (cast flips wire type number→string = OUTWARD API change). The DECLARED TYPE is the oracle: money cols typed `string|number` deliberately admit porsager's float; date cols typed pure `string` do NOT (a runtime Date is a real violation → the C25 getSnapshot ship). **This internal-consumer vein is EXHAUSTED across adapters/db**. The remaining uncast money reads are deliberate JSON-number responses. Stop re-sweeping bare-NUMERIC reads as defects.

**Recurring FALSE-POSITIVE veins (disprove fast, don't ship):**
- **NAME-vs-TYPE admin-fee exclusion (C56):** CapVeri has TWO pool-exclusion fields: `excluded_pools` (typed `list[PoolType]` → type-match; `isPoolExcluded` does type-OR-name) vs `admin_fee_excluded_pools` (free-form `string[]` of NAMES → name-match; `computeAdminFee` filters by `pool.name`). The oracle `tenant_share.py` admin-fee path keys off the pool NAME; the `reconciliation-admin-fee-exclusion-cap.test.ts` ("by name") is the disproof. A `poolType` "fix" DIVERGES from the oracle + breaks tests.
- **admin-fee integer-rational inclusion ratio** (`included_cents/total_cents` HALF_UP) is a DELIBERATE, documented divergence from the oracle's lossy float division, mathematically superior, NOT a bug.
- **"penny drift over N-month aggregation":** FALSE unless raw floats are summed as floats. `new Decimal(jsFloat)` is exact ≤15 sig digits, so a Decimal sum of NUMERIC(14,2) terms has zero drift. Check HOW the float is consumed.
- **"double-rounding" on a column:** false positive when the column is `NUMERIC(_,2)` AND the write route validates ≤2dp: sub-cent precondition unreachable; HALF_UP-to-2dp on already-2dp money is a no-op and is the documented billing convention.
- **manual cell-override "missing cascade":** by-design EVERY time as long as the BILLED total stays internally consistent (`total_recovery = tenant_share_after_cap + admin_fee` or its own override). A cell-override is a SURGICAL single-field correction, not a cascade trigger. Cascade-on-override would clobber sibling overrides + run the engine on partial input → decision-gated (#58), never autonomous.
- **credit "drained-pack leak":** recurring false positive: there is NO writer to `credits_used`; `credits_remaining` is a GENERATED column. Credit pack is a one-time license (`has_ever_purchased`), not metered. No double-spend.
- **"missing org filter" on a tenant-PII query:** false positive on reachability when the id it receives is sourced from an already-org-verified row (e.g. `snapshot.lease_id`) not request input. Trace id provenance to the route first. (Still a shippable zero-change defense-in-depth align under the lone-outlier rule.)
- **ERP/report `formatCurrency` HALF_UP:** no-op on already-2dp NUMERIC(14,2), not a rounding defect.
- **calc-engine numeric robustness** (NaN/Inf/negative/zero-denominator) is comprehensively defended at Money.parse/Rate.parse regex + Zod boundary + engine guards. Deprioritize re-sweeping.
- **date/period arithmetic** (inclusive-day, UTC `::text`-cast decode, base-year-not-prorated, integer-cent no-drift) deeply re-audited CLEAN through C56. High bar to find anything new here.

**Process lessons:**
- Re-running an atomicity/authz finder a cycle after a fix is a cheap, high-value regression check (Finder A re-confirmed the C54 ship).
- Two finders converging on the same spot proves PRESENCE, not SEVERITY: both over-labeled the GL `::text` cast CRITICAL/HIGH; honest impact was LOW.
- Request the **adversarial self-disproof format** from finders (each "could X drift?" answered with the exact preventing mechanism), high-signal output.

---

## 9. Standing footguns (environment)

- **Shared main tree is contested by parallel sessions** (git reset --hard / pre-commit auto-stash). Verify every finding vs `git show origin/master:<path>` if files on disk look stale; ensure zero unstaged tracked changes before committing; verify commits landed via `git log`.
- **Windows / PowerShell + Bash both available.** Quote every path; use `--` before paths in git ops. The Bash tool is Git Bash (POSIX): use `/dev/null`, forward slashes.
- **vitest "close timed out after 10000ms"** = benign Vite-server-exit hang, NOT a test failure.
- **TaskUpdate** uses `taskId` (singular) + `status`. **TaskCreate** uses `subject` + `description`.
- Marketing/copy gates (CLAUDE.md) apply to user-facing copy only, N/A for this backend-correctness goal unless a fix touches UI text.

---

## 10. TL;DR for the next agent

1. Read `git status` + this doc + the "Latest:" line of `goal_e2e_stress.md`.
2. Await the 3 in-flight Cycle-57 finder notifications (agentIds in §6); adversarially triage each.
3. Ship only unambiguous fail-closed zero-change fixes (§3); decision-gate everything else (§7).
4. Close Cycle 57 (scratchpad → ledger → memory → tasks), launch Cycle 58, keep looping.
5. Strongly consider surfacing the §7 decision-gated backlog to Angel, the autonomous fail-closed vein is largely exhausted, and that backlog is where the remaining value lives. That may be the honest "the goal is converged" conversation.

## Cycle 78 - reconciliation persistence finalized-race guard

Cycle 78 launched three fresh Worker-pinned read-only finder sweeps from clean `origin/master` head `74d641f7f`. Pasteur found billing/export state machines clean except known gated policy items. Meitner found the shipped reconciliation persistence finalized-race guard. Epicurus found tenant/dispute/notification/admin lifecycle surfaces clean except known gated policy items.

### SHIPPED - reconciliation result persistence rechecks finalized periods under lock

The workflow checked for finalized snapshots before loading data and computing reconciliation results. But `persistCalculationResults()` later deleted draft snapshots, inserted new draft snapshots, and completed the job in a transaction without taking the property financial-evidence advisory lock or re-checking finalized snapshots inside that same transaction.

Race fixed: a queued `force_recalculate` job could pass the pre-compute finalized check, another request could finalize the same property/period under `lockPropertyFinancialEvidence`, then the queued job could persist new draft snapshots after a finalized period already existed.

Fix: `persistCalculationResults()` now calls `lockPropertyFinancialEvidence()` at the start of its transaction, then re-runs `hasFinalizedSnapshotForPeriod()` inside the locked transaction before draft delete/insert/complete. If a finalized snapshot exists, it throws the existing immutable-period message so the workflow marks the job failed through the existing catch path. No schema or route contract change.

Ship: fix commit `8f7b02171`; merge commit `955a66525`; pushed `master` to `origin/master`; deployed `capveri-api` version `7bfcc6cf-5bf7-4404-8c1e-5cd3c37eddde`; Cloudflare deployment status showed `(100%) 7bfcc6cf-5bf7-4404-8c1e-5cd3c37eddde`; `curl.exe -i https://api.capveri.com/health` returned `HTTP/1.1 200 OK`.

Verification: branch focused reconciliation tests 2 files/33 passed; branch typecheck pass; branch lint pass; branch full backend `npm test` 121 files/1901 passed/12 skipped; code review clean/ready with lock/finalized-check parameter assertions added; rebased branch repeated focused/typecheck/lint/full all green; merged-head repeated focused/typecheck/lint/full all green. Local reconciliation E2E was attempted and failed with expected `1992.02`, got `2267.12`; the identical failure reproduced on clean `origin/master`, so this is pre-existing local harness/data drift, not caused by the patch.

Decision-gated / clean notes: billing/export state machines clean; tenant/dispute/notification lifecycle surfaces clean; actual-billed finalized mutation guards already lock then check finalized overlap; document approve/delete finalized lease-reference guards already lock before checking. Decision-gated backlog remains: `#56`, `#60`, `#61`, `C73-L1`, `C65-S1`, `C63-P1`, `#65`, `C74-B1`, `C72-E2`, `C62-G1`, `C62-G2`, `#52`, `#48`, and related source-evidence/versioning policies.

Durable lesson: pre-compute immutability checks are not enough when calculation can take time. Any queue workflow that computes outside the write transaction must re-acquire the same domain lock and re-check terminal/finalized state immediately before persistence.

## Cycle 79 - extraction queue org scoping and public export download headers

Cycle 79 launched three fresh Worker-pinned read-only finder sweeps from clean `origin/master` head `955a66525`. Newton found the shipped extraction queue cross-org mutation bug. Ramanujan found the shipped public signed export download header gap. Curie found broader artifact hardening backlog items around PDF Unicode text and header-safe filenames.

### SHIPPED - extraction queue cannot fail or process another org's job/document from a stale/wrong-org message

`processExtractionQueueMessage()` previously loaded a job by id, then fell back by document id, without scoping those loads to the queued organization. If the loaded job/document context mismatched, it marked that loaded job and document failed and returned, causing the poison message to be acked after cross-org mutation.

Fix: extraction job lookups now require `organizationId`; SQL filters `jobs.organization_id` and requires the joined document to share the job organization; `markJobAndDocumentFailed()` now scopes both `extraction_jobs` and `documents` updates by organization; context mismatches return without mutation.

### SHIPPED - public signed export downloads send private/no-sniff headers

`GET /api/v1/export/download/file` now returns `Cache-Control: private, max-age=0, no-store` and `X-Content-Type-Options: nosniff`. The local exports E2E now asserts those headers on public XLSX re-download and corrects a stale expectation to the existing spreadsheet MIME route behavior.

Ship: fix commit `15f0093d9`; merge commit `951e2c8ac`; pushed `master` to `origin/master`; deployed `capveri-api` version `e89ceb11-5d8e-4c0a-a171-934c79f36656`; Cloudflare deployment status showed `(100%) e89ceb11-5d8e-4c0a-a171-934c79f36656`; `curl.exe -i https://api.capveri.com/health` returned `HTTP/1.1 200 OK`.

Verification: branch focused tests 3 files/135 passed; branch typecheck pass; branch lint pass; branch full backend `npm test` 121 files/1902 passed/12 skipped; branch local exports E2E `ok: true`; code review found a P2 join-level org-scope gap, fixed, and follow-up review returned no findings. Merged-head focused tests 3 files/135 passed; merged-head typecheck pass; merged-head lint pass; merged-head full backend `npm test` 121 files/1902 passed/12 skipped; merged-head local exports E2E `ok: true`.

Decision-gated / backlog notes: PDF Unicode text and centralized header-safe filename handling are real artifact hardening items but broader than this zero-policy-change patch. Existing decision-gated backlog remains unchanged.

Durable lesson: tenant scoping on a queue lookup is not complete if the selected row joins to another tenant-owned row. For queue consumers that bypass request-time RLS, scope the requested entity, scope the joined evidence row, and scope terminal writes. Poison/stale messages should be acked without mutating rows when they cannot become valid.

## Cycle 80 - reconciliation redelivery guard, header-safe downloads, SB1103 export cache

Cycle 80 launched three fresh read-only finder sweeps from clean `origin/master` head `951e2c8ac`, then integrated over current `origin/master` head `d508ac09d`. Plato found the shipped reconciliation queue stale-completion race. Hilbert found the shipped property-derived filename header-safety gaps. Schrodinger found the shipped SB1103 export cache invalidation gap.

### SHIPPED - reconciliation result persistence refuses stale completions

If Cloudflare redelivered a reconciliation message while the first worker was still computing, the redelivery path could mark the `running` job failed. The original worker still held its in-memory job and later called `persistCalculationResults()`, which inserted snapshots and completed the job without rechecking job state.

Fix: `persistCalculationResults()` now locks and verifies the calculation job is still `running` before financial-evidence lock, finalized-period recheck, draft deletion, snapshot insertion, or job completion. `completeCalculationJobRow()` updates only `status = 'running'` and throws if no row matched. Repository tests prove stale/non-running jobs abort before snapshot mutation.

### SHIPPED - property-derived download filenames are header-safe

Added a shared attachment filename helper that strips C0 controls/DEL and replaces quotes. Applied to tenant statement PDFs, tenant/admin dispute attachments, public export token downloads, and tax protest ZIPs.

### SHIPPED - SB1103 export invalidates the request list

`useExportSB1103Request()` now invalidates the full SB1103 query namespace after successful export, so the list refetches `status`, `export_format`, and `exported_at` after the backend marks a request exported.

Ship: fix commit `f6c9d6d4e`; merge commit `5f9d9a1bc`; pushed `master` to `origin/master`; deployed `capveri-api` version `9f150466-c794-4778-acdf-b2827ec1d24c`; `capveri-api` deployment status showed `(100%) 9f150466-c794-4778-acdf-b2827ec1d24c`; `curl.exe -i https://api.capveri.com/health` returned `HTTP/1.1 200 OK`; deployed `capveri-app` version `2c0976fb-758a-4437-a0f0-a7ad5b33b48e`; `capveri-app` deployment status showed `(100%) 2c0976fb-758a-4437-a0f0-a7ad5b33b48e`; `curl.exe -I https://app.capveri.com/` returned `HTTP/1.1 200 OK`.

Verification: branch and merged-head backend focused tests 6 files/231 passed; backend typecheck pass; backend lint pass; backend full `npm test` 121 files/1905 passed/12 skipped; backend local E2Es exports/tax-protest/tenant-portal-disputes all `ok: true`; frontend typecheck pass; frontend lint pass; focused SB1103 hooks test 1 file/3 passed; code review no findings.

Known unrelated failures: frontend full `npx vitest run` failed only two `PropertyFormPage` cancel tests expecting `navigate(-1)` while current app calls `navigate('/properties')`; the same two failures reproduced on a clean `origin/master` baseline worktree. Local reconciliation E2E still fails with the known pre-existing total drift expected `1992.02`, got `2267.12`.

Durable lesson: atomic result persistence must prove both domain immutability and job ownership/state at the moment of write. A queue redelivery can legitimately fail a still-running job; the original worker must not later complete from stale memory. Lock the job row and require the expected state before inserting any derived results.

## Cycle 81 - closed/deployed 2026-06-30

Cycle81 shipped four bounded ingestion/export hardening fixes: property-scoped GL import dedupe, single-file uploader replacement, failed-import retry returning users to Upload, and safe export PDF attachment filenames. Fix commit `2904624a5`; final pushed head `51156bde0`.

Production state:
- Supabase Capveri project `REDACTED_SUPABASE_PROJECT_REF`: migration `20260630000000_scope_import_batch_hash_to_property` applied; fresh schema dump shows `unique_file_per_property` on `(organization_id, property_id, file_hash)`.
- `capveri-api`: version `c4dc23c3-75fb-4a09-a74d-787c78d5eece` at 100%; `/health` returned 200.
- `capveri-app`: version `bf1e44a2-4bea-4461-97c4-1b55e90af915` at 100%; app root returned 200.

Verification highlights:
- Backend focused ingestion/export tests: 3 files / 136 passed.
- Frontend focused ingestion tests: 3 files / 88 passed.
- Backend full suite: 121 files / 1907 passed / 12 skipped.
- Backend/frontend typecheck and lint passed on branch and integration heads.
- Code review had no correctness findings for the Cycle81 fixes. The stale-base/scope concern was resolved by merging later `origin/master` and rerunning gates.

Known residuals:
- Full frontend suite still has the pre-existing PropertyForm cancel expectation failures proven in Cycle80 (`navigate(-1)` expected, `/properties` actual).
- Supabase migration history has a remote-only `20260629133519`, so repo-level `supabase db push` remains drift-blocked unless migration history/local files are reconciled.

Post-close deploy note: `origin/master` advanced to `b41d6d8a7` after the Cycle81 deploy with unrelated frontend auth a11y work. Current `master` frontend was then deployed as `capveri-app` version `699b98c6-ec0b-4063-9193-e3de7c12e97e`; Cloudflare status 100%, app root 200. Cycle81 backend remains `capveri-api` version `c4dc23c3-75fb-4a09-a74d-787c78d5eece` at 100%, health 200.

## Cycle 82 - closed/deployed 2026-06-30

Cycle82 shipped three bounded hardening fixes from fresh finder sweeps:

- Existing-user team invites: `/team/signup?token=...` now accepts the invite before redirecting a signed-in user, and the email/password sign-in link preserves the invite token in `returnUrl`.
- Extraction queue status writes: `markProcessing`, `markCompleted`, `markRetrying`, `markFailed`, and `markDocumentFailed` now require `organizationId`; the queue service passes the loaded job org into claim/complete/retry writes, and completion scopes the linked `documents` update by org.
- Historical PDF reports: signing secret is resolved before R2 upload, and any token mint failure after upload deletes the just-written report object before rethrowing.

Review: required code review found one Important test gap for post-upload token mint cleanup. Fixed with an injectable historical PDF token builder and a regression that forces token mint failure, asserts the exact uploaded key is deleted, and confirms the fake storage no longer has the object. No Critical findings remained.

Verification on branch and merged `master`:

- Backend focused tests: historical PDF 21 passed; extraction job repository 17 passed; extraction workflow 65 passed; queue messages 15 passed; team routes 13 passed.
- Backend `npm run typecheck` and `npm run lint` passed.
- Frontend focused tests: `TeamSignupPage.test.tsx` 2 passed; `AuthCallback.test.tsx` 24 passed across 2 files.
- Frontend `npm run typecheck` and `npm run lint` passed.
- Commit hook passed prettier, eslint, frontend dev build, and marketing context drift.

Ship:

- Fix commit in Cycle82 branch: `3444afe95`.
- Current branch wrapper after `origin/master` merge/review fix: `1791841ca`.
- Local master merge pushed to origin: `6f2316ba8`.
- `capveri-api` deployed version `1906c6ce-e4c1-412b-bfb3-6f9b6f048a59`; Cloudflare status `(100%)`; `curl.exe -I https://api.capveri.com/health` returned `HTTP/1.1 200 OK`.
- `capveri-app` deployed version `9356e379-35bb-4bb2-bc89-9548ccc5267e`; Cloudflare status `(100%)`; `curl.exe -I https://app.capveri.com/` returned `HTTP/1.1 200 OK`.

Known residuals:

- Primary checkout has unrelated unstaged dashboard edits in `frontend/src/components/dashboard/GettingStartedChecklist.tsx`, `frontend/src/components/dashboard/TaxProtestDeadlineCard.tsx`, and `frontend/src/pages/DashboardPage.tsx`; they were explicitly unstaged before pushing Cycle82.
- Full frontend suite still has the pre-existing `PropertyFormPage` cancel expectation failures proven in Cycle80.
- Supabase migration-history drift from Cycle81 remains unresolved (`20260629133519` remote-only plus older local pending migrations).

Next: start fresh Cycle83 finder sweeps from current `origin/master` (`6f2316ba8`) or reconcile Supabase migration-history drift before relying on ordinary repo-level `supabase db push`.
