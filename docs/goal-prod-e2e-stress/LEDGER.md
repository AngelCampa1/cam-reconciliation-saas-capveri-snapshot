# Goal: Prod E2E Stress, Fixture-Driven Find/Fix/Verify Loop

**Started:** 2026-07-01. Stop-hook enforced goal (verbatim): test the system E2E in prod, in depth,
edge cases, generate lots of new scenarios/documents/fixtures, pass them through the system, review
input AND output, find/fix/verify on a loop until nothing more is found. Sub-agent driven, multiple
review/fix cycles.

## Method

- Prod creds: `.env.local` (E2E_PROD_*: landlord `e2e-prod-20260626003931-6aa5f2@example.com`,
  user id `91d2740b-240b-4282-b897-f9a84579d750`, org starts EMPTY). Tenant creds also present.
- Harness: self-contained `frontend/scripts/prod-*-scenario.mjs` scripts (Supabase password grant →
  prod API; `[PROD-TEST]` prefixed entities; exact-value checks; cleanup; report.json → `e2e-adhoc/`).
  ~75 prior scripts exist from earlier goals. New scenarios must go DEEPER (penny-exact expected
  values computed offline, adversarial fixtures, cross-surface verification).
- Security constraint (standing): do NOT register hundreds of accounts; reuse the E2E accounts or
  DB-level state.
- Per cycle: launch parallel disjoint sub-agents (author + run scenario, report findings with
  evidence + adversarial self-disproof) → orchestrator triages adversarially → unambiguous
  fail-closed fixes ship direct-to-master (gate: tsc/eslint/vitest, code review, deploy capveri-api
  and/or capveri-app to 100%, live verify) → policy/product items get decision-gated tasks →
  ledger + next cycle.
- Prior related goal: `docs/goal-e2e-stress/` (code-audit finder loop, 82 cycles, converged).
  Its HANDOFF.md §7 decision-gated backlog and §8 false-positive veins still apply. Check new
  findings against them before shipping.

## Cycles

### Cycle 1: 2026-07-01 · 1 bug fixed+deployed, 2 decision-gated, 1 observation

Three parallel scenario agents against api.capveri.com (clean E2E org):

**A. Recon cap/gross-up torture** (`prod-stress-recon-cap-grossup-torture-scenario.mjs`):
engine PENNY-EXACT under combined torture: binding cumulative_compounding 5% cap
(seed-year-as-prior), gross-up at 12 to 27% occupancy vs 0.95 target, mid-year proration
260/365, admin-fee pool exclusion, repeating-decimal share.
- **A1 (decision-gate → task #2):** `admin_fee_excluded_pools` honored by engine but no HTTP
  write path (Zod strips unknowns) AND PostgREST/RLS lets a user JWT write arbitrary
  `recovery_profile` JSON, bypassing API validation.

**B. GL ingestion adversarial formats** (`prod-stress-gl-adversarial-formats-scenario.mjs`):
CLEAN 27/27: amount sign zoo, BOM/CRLF/quotes, sub-cent HALF_UP, duplicates preserved,
boundary amounts, DD/MM disambiguation, malformed paths all fail safely (400/413/415/422/409),
dedupe hash scoped org+property.

**C. Rentroll→billing consistency** (`prod-stress-rentroll-billing-consistency-scenario.mjs`):
27/27 checks (unicode round-trip, BigInt cents identities, cross-surface equalities).
- **C1 (FIXED + DEPLOYED):** parser accepted 0.00/negative-sqft row at preview silently; import
  then 400'd the WHOLE file via `units_rentable_sqft_check` rollback. Fix = per-row gate in
  `parseRecord` matching the oracle (schemas.RentRollRow validators → error_count + warning,
  row excluded). Commit `e8697cab8`; capveri-api version `cd313d7e` 100%, health 200;
  live re-run 28/28 incl. new row-exclusion probes. Reviewer verdict SHIP (verified quantize-
  before-gate parity, null usable_sqft allowed, no downstream 0-sqft dependency).
- **C2 (decision-gate → task #3):** month-to-month rows (no lease end) create occupied unit but
  NO lease: silently absent from recon/billing (`tenant_name && lease_start && lease_end` in
  adapters/db/rent-roll.ts).
- **C3 (observation → task #4):** expired lease imported hardcoded `status:'active'` (label
  only; math date-filtered correctly).

Gate note: 5 pre-existing `extraction-workflow.test.ts` failures on clean HEAD (queue retry
claim paths). Verified via stash; unrelated to C1, flagged for a later cycle.
Cleanup: prod verified clean (0 `[PROD-TEST]` properties; finalize-pinned property definalized
via direct SQL then API-deleted).

### Cycle 2: 2026-07-01 · 3 RLS defects fixed+deployed, 1 money finding decision-gated

Three parallel scenario agents, new disjoint domains. Focus: multi-tenant isolation via direct
customer-JWT PostgREST probing (the RLS layer is the only guard there, the backend uses the
service role, which bypasses RLS).

**A. RLS + authz isolation** (`prod-stress-rls-authz-isolation-scenario.mjs`): 3 defects, all
found + fixed + live-verified. Shipped as commit `666a0d914` (migrations
`20260701000000` + `20260701000100`); DB-only, applied to prod via MCP (no Worker deploy).
Security review verdict SHIP.
- **A-CRIT-1 (audit_log cross-org leak, LIVE):** SELECT policy gated only on role owner/admin,
  no org scope → any owner/admin read ALL orgs' audit_log (rows embed foreign
  lease/recovery_profile/tenant/GL data). Reproduced: E2E JWT saw 1000 rows / 11 orgs. Fix:
  `organization_id = get_user_organization_id()`. Post-fix: 1 org. Root: `20240101000060:458`.
- **A-CRIT-2 (audit_requests cross-org lead-PII leak, LATENT):** same unscoped owner/admin gate
  on the platform lead inbox (leads INSERT org=NULL; backend reads via service role). Any
  owner/admin could read+write EVERY org's lead PII. Table empty → latent. Fix: restrict
  SELECT+UPDATE to `assigned_to = auth.uid() OR current_user_is_platform_admin()`. Verified with
  an inserted foreign (unassigned) row → customer JWT read 200 [] (blocked); probe deleted.
- **A-MED (users UPDATE 42P17 recursion):** `20260522000001:42-49` inline
  `SELECT is_platform_admin FROM users` correlated subquery in WITH CHECK re-entered users RLS →
  every self-service profile PATCH 500'd (fail-closed, no escalation). Fix: new
  `current_user_is_platform_admin()` SECURITY DEFINER helper (row_security off, mirrors
  get_user_organization_id). Also added valid `'tenant'` role to the policy role lists (was
  omitted → fail-closed tenant self-updates; review WARN, folded in). Verified: full_name
  self-update 200; escalation 403 + value stays false.
- Confirmed SAFE: API cross-org reads 404; leases cross-org INSERT blocked, UPDATE/DELETE 0 rows;
  within-org recovery_profile write = by-design (A1); party guard tenant↔landlord 403; IDOR
  random-UUID PATCH/DELETE 404; JWT edges 401.

**B. Actual-billed matching + dispute lifecycle** (`prod-stress-actualbilled-dispute-scenario.mjs`):
Matching by tenant_name+suite correct; whole-dollar trailing-zero normalization preserves value;
downstream sums use decimal.js.
- **B1 (decision-gate → task #7, low-med, benign):** actual-billed parser echoes billed amounts +
  total at full precision (`amount.toFixed()`, e.g. `100.005`) but the `billed_amount` column is
  `NUMERIC(14,2)` → persists `100.01`. Upload-response total over-promises precision the storage
  can't keep (per-row 5-milli delta); downstream reads the authoritative persisted value. NOT a
  clean oracle-parity bug: the Python oracle also preserves sub-cent, so the DB column is the real
  authority. Money-precision policy choice (recommend: quantize per-row to 2dp HALF_UP at parse so
  echo == persistence, matching money canon). `billing-parser.ts:215-237`.

**C. Finalization + export + concurrency** (`prod-stress-finalization-export-scenario.mjs`):
CLEAN 22/22. Re-finalize→409 (consistent); finalized totals byte-identical before/after/rerun;
immutability DB-enforced (user PATCH status=draft → 0 rows); no unfinalize route; concurrency
single-winner (atomic update…where status='draft' returning); export penny-exact CSV = API totals,
PDF renders, draft gating correct, nonexistent→404. Findings: none. Residue cleaned (property
definalized via SQL then deleted, 404 confirmed).

### Fast-follow (task #5): queue consumer retry robustness · fixed+deployed

Triaged the 5 pre-existing `extraction-workflow.test.ts` failures flagged in Cycle 1. Root cause:
commit `00e906d39` sequenced best-effort Sentry telemetry
(`executionContext.waitUntil(captureWorkerException(...))`) BEFORE the critical
`rawMessage.retry()` in `consumeQueueMessage`'s handler catch. For a durable job queue, a
telemetry throw would skip the retry AND escape into the batch loop, aborting the batch and
dropping lease-extraction jobs. Fix (`consumers.ts`): retry first, then telemetry wrapped in a
best-effort try/catch. Order is functionally irrelevant on the normal (waitUntil-present) path;
this only hardens the degraded path. The 5 prior tests (empty `{}` context) now serve as
resilience regressions; added 2 tests (happy-path telemetry scheduled; throwing waitUntil still
retries). Gate: tsc 0, eslint 0, vitest 123 files / 1925 passed / 23 skipped. Reviewed SHIP.
Shipped commit `04e6dffe0`; capveri-api version `037d3f9c` 100%, health 200.

### Cycle 3: 2026-07-01 · CLEAN across all 3 agents (0 new defects, convergence signal)

Three parallel disjoint scenario agents, new domains. All penny-exact vs independent offline
re-implementations (decimal.js precision-28 HALF_UP / BigInt cents), values never echoed from API.

**A. Multi-year cap-bank carryforward** (`prod-stress-recon-multiyear-capbank-scenario.mjs`):
CLEAN 18/18. Cap isolated as sole moving part (pro_rata=1.0, occ 100%, 0% admin, no base-year),
3 consecutive FINALIZED years. 2023 seed 100000.00 → 2024 under-cap 103000.00 (allowance accrues)
→ 2025 GL 140000.00 BINDS at **128012.50** (offline effMax = maxAllowed 115762.50 + carried bank
12250.00). Disproves the once-vs-per-year bank-flooring footgun
(`project_cf_reconciliation_cap_parity`): per-year flooring would collapse effMax to 115762.50, a
$2,250 under-bill; engine returned the once-floored 128012.50 (asserted effMax > maxAllowed).
Carryforward integrity: finalized-2024 re-run w/ `force_recalculate` → 409 `period_already_finalized`
(guard precedes enqueue; force_recalculate only deletes drafts), 2024 after-cap byte-identical +
still finalized. Cleanup via service role (finalized snapshots user-immutable by design): 0 CY3A
residue. Per-pool line-item cross-check auto-skipped (single-pool shape), recorded truthfully.

**B. Lease/recovery_profile config → engine integrity** (`prod-stress-lease-config-integrity-scenario.mjs`):
CLEAN 11/11 penny + 12/12 adversarial. 7 leases, gross-up engaged (occ 0.7508, factor 1.2653);
matched an offline port of money.ts+calculator.ts: base-year subtraction + `base_year_adjustments`,
`management_fee_percentage` cap (binds, 285101→229427.80), `excluded_pools`, 184/365 day-weight
proration, sqft-derived `pro_rata_share` fallback, `admin_fee_excluded_pools` explicit list. API
validation returns **422 (Zod, not 400)** for all out-of-bound configs; unknown keys stripped on
CREATE (`.strip()`) / rejected on PUT (`.strict()`). **P10 defense-in-depth:** PostgREST-injected
`pro_rata_share=1.5` (past the API's [0,1] bound) fails the recon job (`assertProRataShareInRange`)
rather than silently miscomputing. Reconfirms **A1** (task #2: `admin_fee_excluded_pools` +
`admin_fee_excludes_tax_insurance` engine-honored but PostgREST-only) as the KNOWN gated gap, not a
new finding. Agent self-disproved a first-run ~10% divergence as its own occupancy mis-sum. 0 CY3B
residue.

**C. Cross-doc comparison + variance + dispute lifecycle** (`prod-stress-comparison-dispute-scenario.mjs`):
CLEAN 49/49. Comparison variance penny-exact vs offline decimal.js (HALF_UP 2dp variance_pct):
zero-variance→match, sub-cent tolerance inclusive (`abs(var)<=0.01`), 2¢→overcharge, undercharge,
full-undercharge -100.00%, duplicate-line aggregation by lease_id, unmatched-lease→needs_review,
div-by-zero-safe null variance_pct, 9999999999.99→199800099.80 no drift. Cross-surface identities
held (net == charged−correct == Σ signed line var; over/under totals == Σ classified). Persisted
runs byte-identical round-trip; unknown run→404, reversed period→400. Dispute authz sound: tenant
→/disputes 403, landlord→/tenant/disputes 403, IDOR→404, cross-org→404 (no leak). Non-defect gap:
landlord dispute STATE MACHINE not drivable in prod (no `PROD_E2E_FIXTURE_SECRET`; E2E landlord+tenant
in different orgs): covered structurally by `prod-admin-dispute-lifecycle-scenario.mjs` +
`prod-admin-disputes-negative-scenario.mjs`. 0 CY3C residue.

Cycle 3 outcome: no code shipped (nothing to fix). Engine math, config handling, comparison/variance,
and multi-tenant/dispute authz all hold under fresh adversarial fixtures. Open items remain the
already-decision-gated tasks #2/#3/#4/#7 (need Angel). Proceeding to Cycle 4 on fresh disjoint domains.

### Cycle 4C: 2026-07-02 · DATE / TIMEZONE / PERIOD-BOUNDARY · 1 fail-closed BUG found (task_8a271343)

Domain: date/timezone/period-boundary correctness. Script (NOT committed; gitignored report):
`frontend/scripts/prod-stress-date-period-boundary-scenario.mjs` → `node scripts/prod-stress-date-period-boundary-scenario.mjs`
(cwd `frontend/`). 19/19 checks + 6/6 probes PASS, 0 cleanup failures, 0 CY4C residue.
Date isolated as sole variable (occ=100% → no gross-up, no cap, no base-year, admin 0); proration
factors + day counts computed offline (BigInt cents / 1e8 rate, inclusive `(b−a)+1`), never echoed.

MATH IS PENNY/DAY-EXACT (engine actual vs offline):
- D1 leap 2024 (366d), lease 2024-07-01 (184d) → 184/366 → **$5,027.32** ✓
- D2 non-leap 2025 (365d), same window (184d) → 184/365 → **$5,041.10** ✓ (denominator is
  period-driven, not calendar-hardcoded; same window differs by year)
- D3 Feb-1..Feb-29 2024 = 29 inclusive days → 29/366 → **$792.35** ✓ (leap Feb in denominator)
- D4 FISCAL 2023-07-01..2024-06-30 = 366d (contains Feb 29): full-period lease factor 1.0
  ($10,000.00); partial 2024-02-15.. = 137/366 → **$3,743.17** ✓ (engine uses PERIOD span, not
  a calendar year)
- D5 endpoint inclusivity (off-by-one hunt): exact-cover / start-on-period_start /
  end-on-period_end all factor 1.0; single-day overlap (start==period_end) = 1/365 → **$27.40** ✓
- D6 zero-overlap future lease → proration 0, engine emits NO snapshot (no phantom charge, no negative) ✓
- D7 TZ round-trip: lease start 2025-01-01 reads back 2025-01-01 (no day-shift); GL txn ON
  period_start included → full share ✓
- P6 GL boundary: txn ON period_end INCLUDED, txn one day AFTER EXCLUDED (inclusive upper bound) ✓
- P1 reversed period → 422; P2 single-day period (start==end) → 422 (strict `>` refine); P5 reversed
  lease dates on CREATE → 422 (`z.string().date()` + refine on lease schema) ✓

**DEFECT CY4C-1 (fail-closed BUG → task_8a271343):** recon period endpoints accept IMPOSSIBLE
calendar dates and silently roll them forward → wrong money.
- Site: `cloudflare-backend/src/http/reconciliation-routes.ts`: `calculateSchema` (L99-100),
  `batchFinalizeSchema` (L93-94), `snapshotListQuerySchema` (L75-82) all use shape-only
  `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`, which accepts `2025-02-30`, `2025-04-31`, `2025-13-01`,
  `2025-00-05`.
- Repro (VERIFIED PROD): POST /reconciliation/calculate with `period_start=2025-02-30` →
  **HTTP 202, job COMPLETED, period_start silently normalized to 2025-03-02** (JS `new Date("2025-02-30")`
  rolls +2d before the porsager `$3::date` bind at `adapters/db/reconciliation.ts:172`). Shifts the
  denominator + every proration/occupancy day-count → wrong dollars, no error surfaced. Adversarial
  disproof: direct SQL `'2025-02-30'::date` REJECTS ("out of range"), so the roll is the JS driver
  coercion, not Postgres; confirmed `new Date("2025-02-30")→2025-03-02` matches observed value exactly.
- P4 near-miss: `2025-13-01` caught only INCIDENTALLY by lexicographic `.refine(end>start)`, not by
  any calendar check; a bogus `period_end` with an earlier valid start would slip through → NaN day-count.
- Fix (task_8a271343): replace the regex with calendar-validating `z.string().date()` in all three
  schemas (matches the already-correct lease schemas in core-data-routes.ts). Verified `.date()`
  rejects 2025-02-30 / 2025-13-01 / 2025-04-31 / 2025-00-05 and accepts real dates incl. 2024-02-29.
  NOT applied in this cycle (fixes go through migration-first/review/deploy gate).

Harness bugs found+fixed during the cycle (self-disproof, not engine): (1) offline `prorationFactor`
divided by `totalDays*RATE` instead of `totalDays`, flooring every partial to $0.00: the 6 initial
"failures" were the harness, the engine was right; (2) `registerProp` pushed to a dead local array so
`cleanup()` deleted nothing, rewired to the module-level `registered`. Transient prod 500s (lease
create / calculate) + a queue "redelivered while running → failed" blip hit on 2-3 mid-runs; all were
infra flakiness (identical calls succeeded on retry), not date defects; final clean run + explicit
prod sweep both show 0 residue.

---

## Cycle 05A: Adversarial file-parsing robustness (agent 5A), 2026-07-01

Scenario: `frontend/scripts/prod-stress-parsing-robustness-scenario.mjs`. Pushed a battery of
adversarial CSVs through the three live prod upload parsers (actual-billed, rent-roll, GL) and
read persisted values back. Focus: numeric-contract, encoding, injection, structural, oversize,
MIME/empty. All [PROD-TEST] entities cleaned (2 props deleted 204, 0 residual billing periods).

CONFIRMED DEFECTS (all reproduced over prod HTTP + read-back):
- **CY5A-1 billing parseMoney fail-OPEN on non-finite/non-decimal money (MEDIUM).**
  `billing-parser.ts:347 parseMoney` did `new Decimal(normalized)` with NO numeric contract.
  Prod repro: `billed_amount="NaN"` → HTTP 200, echoed + PERSISTED `total_billed="NaN"`,
  `billed_amount="NaN"` (guard `amount.lte(0)` is false for NaN; PG `'NaN'::numeric` valid).
  `"1e3"→1000.00`, `"0x10"→16.00`, `"0b101"→5.00` all silently persisted. `"Infinity"`→HTTP **500**
  (DB numeric overflow after preview OK). Corrupts every downstream billed total/leakage/comparison.
- **CY5A-2 rent-roll decimalValue silent misparse (MEDIUM).** `rent-roll/parser.ts:521 decimalValue`
  same bare-`new Decimal()` gap. Preview: `rentable_sqft "1e3"→1000.00`, `"0x64"→100.00` kept;
  poisons the pro-rata denominator. `"Infinity"`→import HTTP 400 (DB overflow, message leaks DB
  internals). NOTE: `"NaN"` is already rejected upstream by rent-roll's stringValue nan/none
  blocklist. Only hex/scientific slip through here.
- **CY5A-3 rent-roll decode inconsistency (LOW).** `rent-roll-routes.ts readCsvFile` uses
  `file.text()` (UTF-8, lossy) while GL + billing `decodeCsv` fall back to windows-1252; a 0xE9
  tenant-name byte → "Caf� Tenant" mojibake. Name-only, not money.

FIXES (COMMITTED f1e78e047 + ece55989c; reviewed SHIP; gate green 124 files/1949 pass):
- `billing-parser.ts` parseMoney: strip decoration + sign, then require `/^\d+(\.\d+)?$/` (mirrors
  GL cleanCurrency), re-apply sign; rejects NaN/Inf/1e3/hex/bin. Handles bare `-` and paren-negatives.
- `rent-roll/parser.ts` decimalValue: same plain-decimal contract before `new Decimal()`.
- `cross-doc-analysis/orchestrator.ts` (CY5B-1): openRouter.chat() now sends
  DEFAULT_OPENROUTER_PROVIDER_CONFIG (ZDR opt-out + non-China allowlist) like every other call site.
- NEW regression test `parser-money-integrity.test.ts` (16 cases): poison tokens skipped/not
  persisted; valid decorated money (`$1,234.56`, `(500.00)`, `-500`, `1,000.00`) accepted.
- Code review (base 4f4b9dbe4..ece55989c): 0 Critical, 0 Important; verdict READY TO MERGE. Two
  MINORS deferred to Cycle 6: (a) parity gap vs GL cleanCurrency: no U+2212/trailing-minus/CR/DR,
  PRE-EXISTING not regression, inert (positive-only gates drop negatives); (b) usable_sqft poison
  drops value with no warning (fail-closed & correct, cosmetic audit-trail gap).
- CY5A-3 decode fix (rent-roll file.text() UTF-8 lossy vs GL/billing windows-1252 fallback) NOT
  written, name-only, clustered with review-minor (a) into a Cycle-6 rent-roll parity batch.

CHECKED-CORRECT (fail-closed / safe, no action): BILL UTF-16LE→422, dup amount cols deterministic
first-col-wins, quoted embedded newline 2 rows, missing amount col→422, empty→400, .pdf→415;
RR BOM stripped, dup unit skipped+warn, injection tenant name literal, negative sqft excluded,
empty preview success:false, .xlsx→415, .pdf reaches file.text()→0 units no crash; RR NaN sqft
rejected at preview. GL parser confirmed robust in Cycle 1 (strict cleanCurrency regex).

OBSERVATION (low, not clearly a defect): BILL 5-row formula-injection file imported 4 rows
(total 1300 vs 1500): the row whose TENANT-NAME cell is `+SUM(A1:A9)` dropped; other 4 payloads
(`=cmd|calc`, `@formula`, `-2+3`, `tab\tinject`) round-tripped as literal names with correct
amounts. No code execution, no crash. A leading-`+` name cell silently dropped its whole row:
minor data-loss edge on the tenant-name column, worth a follow-up but not money-corrupting.

DISPLAY-ONLY NON-ISSUE (do not report): `total_billed` echoed as `Decimal.toString()` ("1300" not
"1300.00"); persisted `billed_amount` is NUMERIC(14,2) → "1300.00". Echo-only cosmetic.

## Cycle 6: 2026-07-02 · 2 defect classes fixed+deployed, 1 decision-gated · export/HITL domains CLEAN (convergence)

Four self-run agents (no delegation, 6B's original nested-delegate footgun recorded in memory
`feedback_subagent_no_deploy`): 6-FIX (parser parity batch), 6A (lease-extraction HITL integrity),
6B-redo (export content parity), and export penny-parity (gross-up / excluded-pools / variance-XLSX).

CONFIRMED DEFECTS (fixed this cycle):
- **CY6-2: PDF exports silently blank the "Calculation Summary" trace (MEDIUM, display/reporting;
  money values were always penny-exact).** The reconciliation engine persists each trace step as
  `{name, operation, output}` (`calculator.ts:343-371`), but every PDF adapter mapped from
  `{step_name, output_value, output_unit}` → each step degraded to `""`/null; AND none normalized
  the JSONB string-decode path (porsager may hand back the column as a JSON string → `Array.isArray`
  false → `[]` → "No detailed calculation trace available" on a NON-EMPTY trace). Found in `exports.ts`
  (landlord snapshot PDF, by 6B-redo), then code review found the identical bug in `tax-protest.ts`
  (expense-summary PDF) and (the review blocker, C1) `tenant-disputes.ts` `safeTrace` feeding the
  tenant statement PDF (`statement-pdf.ts`). THREE call sites of one defect class; a two-of-three fix
  would have shipped the tenant PDF still broken. `reconciliation.ts`'s own snapshot-GET already
  guarded this via `normalizeJsonArray`: the export/tax-protest/tenant paths did not.
  FIX: new dependency-free leaf util `adapters/db/calculation-trace.ts` `normalizeCalculationTrace`
  (string→JSON.parse, array-check, `name→step_name` / `output→output_value` with presentation-key
  fallback, numeric-0 preserved via `??`); all three adapters now import it (DRY). New regression test
  `calculation-trace-normalize.test.ts` (6 cases incl string-decode, numeric-zero, and a PDF-render-gate
  assertion `step_name && output_value` shared by all three templates).

- **6-FIX parser parity batch (closes Cycle-5 deferred CY5A-3 + both review minors).**
  * CY5A-3 decode parity: extracted shared leaf `http/decode-csv.ts` (strict UTF-8 `fatal:true` →
    windows-1252 fallback); rent-roll `readCsvFile` now decodes `file.arrayBuffer()` (was lossy
    `file.text()`), and the two prior duplicate copies in actual-billed/ingestion routes fold into it.
  * Review-minor (a): billing `parseMoney` + rent-roll `decimalValue` now canonicalize Unicode-minus
    U+2212 (`−`→`-`) before sign detection (GL `cleanCurrency` parity). Inert-but-consistent (positivity
    gates drop negatives regardless of glyph, pinned by parity tests). Trailing-minus/CR-DR still
    GL-only by design (only GL retains signed values).
  * Review-minor (b): rent-roll now warns on invalid usable_sqft/base_rent ONLY when the raw cell is
    non-empty but fails the numeric contract (absent optional column → no spurious warning).
  * Tests extended: parser-money-integrity (+U+2212 parity), rent-roll-parser-rounding, rent-roll-routes
    (windows-1252 0xE9→"Café" decode).

DECISION-GATED (NOT auto-fixed, needs Angel, task #13):
- **CY6-1: billing `isAggregateTenantRow` loose substring drops REAL tenants.**
  `billing-parser.ts:331` skips any tenant whose name *contains* "total"/"subtotal"/"sum"/"grand"
  (faithful port of Python oracle `billing.py:199-201`, so NOT a divergence: the oracle itself is too
  loose). Silently drops "Total Wine & More", "Summit Sports", "Sumo Sushi", "Grand Furniture" → their
  billed amount vanishes from recon. TWO-SIDED (tighten too far → a real ERP aggregate row gets summed
  as a phantom tenant). Recommendation: leading whole-token match `^(total|subtotal|grand\s*total|sum)\b`,
  mirrored in the Python oracle for parity.

CHECKED-CORRECT (convergence, 0 defects across two whole domains):
- **6A lease-extraction HITL integrity** (`prod-stress-hitl-verification-integrity-scenario.mjs`):
  50/50 live prod checks. ZDR present on ALL LLM call sites incl cross-doc (confirms Cycle-5 CY5B-1 fix
  holds). HITL value validation fail-closed (422, no recovery_profile mutation); draft accepts off-schema
  but never flips status/verified_at/lease_id. `FOR UPDATE` serializes concurrent approves (REFUTES an
  earlier race claim); idempotent re-approve→400; cross-party IDOR→403.
- **Export penny-parity** (`prod-stress-export-{erp-batch,pdf-content,grossup-variance}-scenario.mjs`):
  ERP CSV/Yardi/MRI 46/46 penny-exact (Yardi double-entry sums 0.00; MRI 98-char fixed-width);
  PDF money fields byte-exact draft+finalized; gross-up G1 (grossed-up ≠ operating when occ<target) 3/3;
  excluded-pools G2 (property-level totals include ALL pools BY DESIGN: `calculator.ts:288,302-317`;
  exclusion applied only at tenant-recovery layer, reclassified suspected→correct via source trace,
  not assumption) 4/4; variance-XLSX G3 (ExcelJS: year labels, `$#,##0.00`/`0.00%` numFmts, fraction
  convention) 5/5.

OPEN GAPS → Cycle 7 backlog: negative/credit `total_recovery` sign in exports UNTESTED (no genuine
negative repro achieved); cross-org export authz (404-vs-leak) not exercised at export-byte level.

RESIDUE CLEANUP: purged 32 orphan `[PROD-TEST]` properties (+ cascade: 73 leases, 76 units, 66 draft
snapshots, pools/gl_entries) under test org `[PROD-TEST] E2E 20260626003931`, all created tonight in a
12-min burst (02:46-02:58 UTC), the original 6B's orphaned-nested-agent residue. Verified 0 properties /
0 orphan snapshots/leases/units. One unrelated `[PROD-TEST]` lease from 2026-05-06 under the shared
`Example` org left untouched (predates this goal; not mine to delete).

GATE: tsc 0, eslint 0, vitest 125 files / 1962 pass / 23 skipped (final tree). Code review verdict
FIX-FIRST → C1 blocker resolved → clean.

SHIPPED: commits `8b2318a29` (parser parity), `94c9f97db` (PDF trace fix), `46e8ec270` (ledger +
scenarios); code-tip `46e8ec270`, pushed to `origin/master`. Deployed capveri-api Worker to prod
`fc670e50-ae2b-4647-a371-e4987cf0433b` @ 100% (`wrangler deployments list` tail), verified
`GET https://api.capveri.com/health` → 200 `{"status":"healthy","version":"0.1.0","environment":"production"}`.
Cycle 6 CLOSED.

## Cycle 7: 2026-07-02 · 0 product defects across 3 domains (STRONG CONVERGENCE) · 1 test-harness fix

Three self-run agents (no delegation, no deploy/push/commit, orchestrator-only), disjoint domains
picked from Cycle-6's open gaps + un-stressed surfaces. **All three CHECKED-CORRECT: zero product
bugs.**

- **7A: negative/credit `total_recovery` sign integrity across all export surfaces → CONVERGENT.**
  DECISIVE reachability result (verified live, not assumed): a negative `total_recovery` **cannot be
  produced by any deployed path**: engine clamps `tenantShareBeforeCap` with `.max(Money.zero())`
  (`calculator.ts:1132`); the manual-override boundary rejects negatives (fired live: `PATCH
  /reconciliation/cells/...` value `"-5000.00"` → **422 "must be a non-negative number"**, regex
  `^\d+(\.\d{1,2})?$` at `reconciliation-routes.ts:115`). Two independent defense layers. Drove a
  DB-injected `[PROD-TEST]` snapshot at `total_recovery=-5000.00` through EVERY export surface (generic
  CSV / Yardi / MRI / variance PDF+XLSX / tax-protest ZIP / landlord PDF / tenant statement PDF),
  decoding real bytes (RFC-4180, MRI fixed-width, XLSX-zip, pdfjs text), all HTTP 200, penny-exact vs
  BigInt oracle (-500000 cents), sign preserved; Yardi/MRI double-entry sign-flip sums 0.00 (correct
  accounting). Finding A (LOW, UNREACHABLE): a credit renders as `-$5,000.00` under the hard-coded
  "Total Amount Due"/"Amount Due" label (`property-pdf.ts:209/216`, `statement-pdf.ts:164/171`,
  `erp-formatters.ts:356/385`): sign correct but label means "tenant owes," so easy to misread AS a
  charge. Agent honestly disclosed the helpful "(credit)" prose in its PDF was its OWN fixture's
  `calculation_trace`, not renderer logic. **NOT shipped**: unreachable + doubly-defended; a DB
  `CHECK (total_recovery >= 0)` would harden the invariant but is a schema change with roadmap
  implications (credits/refunds may be a real future feature) → Cycle-8 decision candidate, not
  auto-decided.
- **7B: cross-org / cross-party export authz at the export-BYTE level → CLEAN 25/25.** Statically
  mapped every export/download route in `src/http/`; each landlord route passes
  `organizationId = auth.actor.organizationId` into an org-scoped query. Seeded a disjoint `[PROD-TEST]`
  org B (DB-cloned real finalized snapshot w/ genuine artifacts incl an `export_history` row bearing a
  secret filename + R2 key), then probed EVERY export endpoint with org A's JWT against org B's ids
  (ERP CSV/MRI/batch, snapshot PDF +`allow_draft` bypass, PDF preview/download/ZIP, variance PDF/XLSX,
  board, demand-letter, tax-protest, historical, sb1103, `export/history` listing, `export/download/
  :exportId` token-mint, DELETE `export/history` IDOR, and the public `export/download/file` with a
  **forged HMAC token for org B's real R2 key**, plus tenant→landlord party guards). Every attempt →
  404 (existence hidden) or 403 (party guard), ZERO of org B's bytes leaked; positive control confirms
  org A exports its own (200). Not over-blocking. Unauthenticated `GET /export/download/file` safe by
  construction: HMAC-signed tokens minted only for caller's own-org R2 key, keys `crypto.randomUUID()`,
  forged token for org B's real key → **400 invalid_export_token**. Adversarial correction: first pass
  false-flagged 3 routes whose 404 echoes the attacker-SUPPLIED id (not a leak), refined detector to
  match only org B's secret content, re-verified clean. Report `frontend/e2e-adhoc/prod-stress-
  cycle07b-report.json`.
- **7C: JWT lifecycle + concurrency races → CLEAN (all CHECKED-CORRECT).** 10/10 live JWT checks:
  expired / `alg:none` / HS256 algorithm-confusion / bit-flipped sig / forged `role`+`is_platform_admin`
  / swapped `sub` / garbage → all **401, no 500s**. KEY architectural strength: the backend trusts NO
  authz claim from the JWT: role/org/party/`is_platform_admin` are all re-read from DB `users` by `sub`
  every request (`postgres.ts:245-297`), algs pinned ES256/RS256 (`supabase-jwt.ts:35`); a forged
  elevated claim is inert. Deleted user → 401 `user_not_found`, disabled → 403 `user_inactive`
  (fail-closed, source-traced not destructively tested). No stale-role window (DB-derived role effective
  next request). Concurrency: `pg_advisory_xact_lock` on (org,property) serializes every persist/finalize
  (`financial-evidence-lock.ts`) + finalize holds `FOR UPDATE` + guarded `where status != 'finalized'`
  → concurrent finalize = exactly one 200, rest 409; live 4×`POST /reconciliation/calculate` = clean
  4×409 / 4×422, no 500s. Benign: `createCalculationJob` has no (property,period,pending) uniqueness so
  redundant pending rows can form, but processing serializes on the advisory lock (delete-then-insert)
  → terminal snapshot set stays single/consistent (wasted compute only, not a correctness bug).

TEST-HARNESS FIX (shipped this cycle, test-only, not deployable backend): `prod-stress-authz-boundary-
scenario.mjs` `tamperJwt()` flipped only the trailing base64url char of the ES256 signature; for a
64-byte sig that char can carry non-significant padding bits, so decoded bytes stayed unchanged → token
VALID → the "tampered→401" assertion was a latent FALSE-NEGATIVE (could pass on an unmutated token).
Fixed to XOR a real interior signature byte with a `Buffer.equals` guard that throws if bytes are
unchanged. Live-verified: valid landlord token → 200, tampered → 401 on `GET /api/v1/properties`.

NEW HARNESS SCRIPTS: `prod-stress-jwt-lifecycle-scenario.mjs` (7C; imports `jose` from backend
node_modules via file URL as frontend lacks the dep, relocate if desired), `prod-stress-cycle07b-
export-authz-scenario.mjs` (7B).

RESIDUE: 7A/7B DB fixtures deleted cascade-aware, 0 residual verified across all tables; both real E2E
accounts re-verified authenticating post-run (no lockout). 7C created 0 new rows (probes hit guards
pre-INSERT).

CONVERGENCE ASSESSMENT: Cycle 7 found 0 product defects across 3 fresh/high-risk domains (negative-sign,
export byte-authz, auth+concurrency); Cycle 6 found 0 in its 2 checked domains (HITL, export penny-parity).
The remaining defect surface is decision-gated items needing Angel (#2/#3/#4/#7/#10/#13), not new
discoverable bugs. Goal is at a strong convergence point.

## Cycle 8: 2026-07-02 · 2 fail-closed 500→422 defects fixed+deployed · export formula-injection CLEAN

SHIPPED: commit `61d05a1fd` on master; deployed `capveri-api` production version
`1fd7135b-d05d-4919-b69c-819821057532` @ 100%, `GET /health` 200. Full backend gate green (tsc,
eslint, 1968 passed / 23 skipped). Code-reviewed twice (parse-time guards + normalizeFilename in a
prior review; the DB-boundary net delta in a focused review: clean, no CRITICAL/IMPORTANT, 22003
detection confirmed against postgres.js source).

Three fresh/high-risk domains probed live on api.capveri.com; 2 real defects (both MEDIUM,
fail-closed-on-data but 500-on-status), 1 domain clean.

- **8A: CSV/XLSX formula injection (CWE-1236) on EVERY export surface → CLEAN, 0 vulnerable.**
  Static source-trace + live prod round-trip with real payloads (`=HYPERLINK`, `@SUM`, `=cmd|…!A1`,
  RFC-4180 stressor, leading-tab), byte-decoded exported cells. Shared `neutralizeFormula`
  (`erp-formatters.ts:15-32`) prepends `'` to any cell starting `=+-@\t\r`, composed with RFC-4180
  quoting. Verified across 8 surfaces: generic CAM CSV, Yardi CSV (both live), MRI fixed-width
  (not a spreadsheet sink, uses `stripControlChars`, correct), tax-protest GL CSV, historical XLSX,
  variance XLSX (propertyName only ever mid-string, not a formula sink), SB1103 XLSX/PDF/ZIP,
  audit-log CSV (only CSV without neutralize: adversarially confirmed no field can start with a
  trigger: PKs/UUIDs/timestamps/jsonb-dict repr; unreachable, P4 defense-in-depth note only).
  Neutralized cells still round-trip (parsed back byte-exact); numeric cells never neutralized.
  Harness `frontend/scripts/prod-stress-export-formula-injection-scenario.mjs`.

- **8B: numeric extreme-magnitude / precision / overflow → 25/27, 1 defect (F-8B-1).**
  Independent BigInt-cents oracle, penny-exact vs what prod persists. CHECKED-CORRECT: MEGA pool at
  the NUMERIC(14,2) top computes byte-exact; largest-remainder cent conservation on 1/3 pro-rata;
  zero pool; sub-cent gross-up; snapshot-magnitude overflow FAILS CLOSED (job `failed`
  "numeric field overflow", 0 partial snapshots, correct); target_occupancy data-slip clamps
  gross-up to 1.0; occupancy→0 guarded (factor 1.0, no div-by-zero); `1e13` exponential-string GL
  dropped not 500; admin_fee >1 Zod-bounded.
  **F-8B-1 [MEDIUM] FIXED:** an over-NUMERIC(14,2) amount (13+ integer digits, past
  999,999,999,999.99) returned an opaque HTTP 500 instead of a validation error: Postgres raised
  SQLSTATE 22003 (numeric_value_out_of_range) which was unmapped (only the XX000 pool-exhaustion
  code was special-cased). Fail-closed on data, but a 500 on user-supplied input (fat-fingered /
  corrupt ERP export).

- **8C: adversarial FILE ENVELOPE robustness → 31/32, 1 defect (FN-NUL).**
  32 probes across `/ingestion/upload`, `/rent-roll/preview|import`, `/actual-billed/upload`,
  `/documents/upload`. CHECKED-CORRECT: filename path-injection family all land as
  `org/property/UUID.ext` (user filename never a path segment, `generateStorageKey` +
  `assertPathSegment`); disguised/structural/encoding envelopes (PNG-as-CSV, mixed CRLF/CR/LF,
  50k-column row, UTF-16+BOM, invalid-UTF-8 tail, 0-byte, spoofed/oversize Content-Length all
  fail-closed or edge-bounded, no 5xx/hang); billing XLSX zip/worksheet envelopes → 422
  billing_parse_failed; rent-roll 0-byte → 400; PDF magic-byte gate on lease docs.
  **FN-NUL [MEDIUM] FIXED:** a NUL/control char in an uploaded filename crashed
  `POST /documents/upload` with a 500 (R2 metadata / Postgres text reject U+0000; the R2 put was
  even outside the try/catch). `normalizeFilename` stripped only path separators, not control chars.
  Harness `frontend/scripts/prod-stress-file-envelope-scenario.mjs`.

FIXES (all in `cloudflare-backend/`):
- Parse-time 422 guards on the high-volume CSV/billing paths via shared dependency-free leaf
  `domain/core-data/numeric-14-2.ts` (`findFirstAmountOutOfRange`): GL upload + apply-mapping →
  `422 gl_amount_out_of_range`; actual-billed upload + manual → `422 billed_amount_out_of_range`.
  Parse-time is preferable (specific message, whole-batch not opaque-500).
- DB-boundary net for the WHOLE 22003 class (covers `base_year_amount`, sqft NUMERIC(12,2)/(10,2),
  and any future numeric column without per-field guards): new dependency-free leaf
  `adapters/db/numeric-overflow-error.ts` (mirrors `pool-exhaustion-error.ts` to avoid the
  `errors.ts → postgres.ts` import cycle); `postgres.ts` `isNumericOverflowError` detects top-level
  string `code === "22003"` inside `withPoolExhaustionRetry` (covers both `query` and `transaction`;
  overflow is thrown, never retried) → `NumericOverflowError`; `errors.ts` maps it → `422
  numeric_out_of_range`. This resolved reviewer finding I-1 (unguarded `base_year_amount` route).
  Caveat documented in both leaf + postgres.ts: a future in-SQL-arithmetic overflow (SUM/*/cast)
  would be a server bug wrongly downgraded to 422 + skip Sentry, revisit before adding
  computed-numeric writes.
- FN-NUL: `document-extraction-routes.ts` `normalizeFilename` now drops C0/C1 control chars via a
  code-point filter (no eslint-disable) before slicing; exported + unit-tested directly (the undici
  multipart serializer in the vitest harness mangles a raw NUL before the handler runs, so a
  route-level NUL test is unreliable, real browser clients send it raw, as the prod finding proved).

TESTS: new `test/errors.test.ts` (422 numeric_out_of_range / 503 pool-exhaustion / 404 HttpError
passthrough contract via Hono onError); GL + billed over-ceiling 422+no-persist tests; normalizeFilename
control-char-strip unit test.

LIVE POST-DEPLOY VERIFICATION (was 500 pre-fix, now clean 422):
- `base_year_amount = 9999999999999.99` on `POST /leases/:id/term-versions` (NO parse guard, exercises
  the full 22003→NumericOverflowError→422 DB-net chain end-to-end) → **422 numeric_out_of_range**;
  positive control `125000.00` → 201. This is the definitive proof of the DB net (I-1).
- Yardi GL CSV with `9999999999999.99` → **422 gl_amount_out_of_range** ("…exceed the maximum
  supported value of 999,999,999,999.99."). All PROD-TEST entities cleaned (204 cascade deletes),
  0 residual.
- FN-NUL: covered by the deployed `normalizeFilename` strip + unit test (route-level live probe
  unreliable per the harness-serializer note above; the sanitizer strips the control byte before any
  R2/DB sink).

CONVERGENCE ASSESSMENT: Cycle 8 found 2 genuinely NEW defects (both a 500→422 status-code class on
fail-closed input-boundary paths, no data corruption) in 2 of 3 fresh domains; the export-formula
domain was clean. Both were the same underlying pattern: unmapped driver/DB error surfacing as an
opaque 500, now closed both at parse time (UX) and at the DB boundary (completeness). The remaining
defect surface stays the decision-gated backlog needing Angel (#2/#3/#4/#7/#10/#13), not new
discoverable product bugs.

---

## Cycle 9: fiscal-year/proration math · intra-org authz matrix · listing/pagination + query-injection

CODE-TIP `d15d28dfb` · live `capveri-api` version `8d9627c1` @ 100% · health 200.

3 finders (fresh/high-risk domains). 2 genuinely NEW defects, both fail-closed 4xx that
were previously an opaque 500 or a least-privilege hole; the proration-math domain was CLEAN.

- **9A proration math: CLEAN.** Fiscal-year boundary + partial-period recovery proration verified
  penny-/day-exact against the Python oracle across leap-year, mid-month start/end, and FY-straddling
  windows. No divergence; day-count denominators and rounding match. (Adversarially re-checked, the
  engine's day-weighting is the same code path already proven in the Cycle-4 date/period sweep.)

- **9B intra-org authz: DEFECT (fixed).** `DELETE /export/history/:exportId` used `requireLandlord`
  (party-only), which admitted the read-only `viewer` role to a **destructive** delete that also
  permanently removes the underlying R2 object. Fixed → `requireAdmin` (owner|admin), matching the
  documented org-editor policy (viewer is excluded from all mutations). No frontend caller invokes
  this endpoint (only GET /export/history is wired), so blocking `member` is safe in practice.
  Full authz-matrix tests added (401 no-auth / 403 viewer+member+tenant / 422 bad-uuid / admin
  pass-through to repo). LOW-MED (least-privilege).

- **9C pagination overflow: DEFECT (fixed).** Offset-style query params (`skip` on
  properties/units/leases + documents; `page` on reconciliation snapshots + audit-trail) were
  unbounded. Root cause: Zod `z.coerce.number().int().min(0)` accepts JS floats ≥ 1e21; `String(1e21)`
  = `"1e+21"` (exponent notation). porsager `postgres` serializes numbers via `String()`, and Postgres
  rejects `"1e+21"` as int8 in OFFSET → SQLSTATE **22P02** (invalid_text_representation). The Cycle-8
  DB net only maps 22003, so 22P02 fell through to an **opaque 500**. Values in
  `[int8max+1, <1e21)` stringify plainly, overflow int8 → 22003 → caught → 422; only the exponent
  band produced the 500. Fix = `.max(Number.MAX_SAFE_INTEGER)` at parse time on every offset param
  (9007199254740991 stringifies plain-digit and fits int8; `(MSI-1)*100 ≈ 9.0e17 < int8max`, so the
  `(page-1)*size` product is also safe). Fails closed 422 (reconciliation/core-data/documents) /
  400 (audit-trail, which maps all query validation to 400). LOW. Reviewer I-1 (the `page`-param
  completeness gap on reconciliation + audit-trail that the initial `skip`-only diff missed) was
  caught and closed in the same change.

REVIEW: code-reviewer confirmed both fixes sound; I-1 (page completeness gap) fixed pre-ship;
M-1 (inaccurate "every destructive DELETE" comment in exports-routes) softened to state the actual
tier + the viewer hole it closed. Gate green: tsc 0 / eslint 0 / vitest 1977 passed, 23 skipped.

CONVERGENCE: Cycle 9's one product-defect class was again the opaque-500-on-hostile-input pattern
(same family as Cycle 8's 22003), now closed for the 22P02/exponent-notation band too, plus one
least-privilege gap. No value-correctness or data-corruption bugs surfaced in three fresh domains.
Remaining defect surface stays the decision-gated backlog needing Angel (#2/#3/#4/#7/#10/#13).

---

## Cycle 10: timezone/DST end-to-end · resource-exhaustion/large-payload boundaries · sort/filter query-param injection + allowlist integrity

CODE-TIP `0e4253265` · live `capveri-api` version `820b78e7` @ 100% · health 200.

3 finders (fresh/high-risk domains). 2 genuinely NEW defects, both the same
opaque-500-on-hostile-input class already seen in C8/C9. Now closed. The
timezone/DST and query-injection domains were both CLEAN.

- **10A timezone/DST: CLEAN.** End-to-end DST/timezone handling verified penny-exact
  (11/11): day counts are UTC-pinned, occupancy day-weighting is DST-agnostic, and the
  `::text`-cast SQL date reads (the CF-date-decode fix) defend `erp-formatters.parseDate`
  from the porsager bare-`Date` decode. No spring-forward/fall-back drift in the period math.

- **10C sort/filter query-param injection + allowlist integrity: CLEAN.** 42/42. Sort/filter
  params are allowlist-validated; the single interpolated `ORDER BY` (reconciliation.ts:572) is
  double-guarded (enum-checked column + direction). No SQLi, no allowlist bypass, no error leak.

- **10B resource-exhaustion/large-payload: 2 DEFECTS (fixed) + 1 decision-gate.**
  - **D1 (over-length text -> opaque 500).** A GL CSV cell wider than its `gl_entries` column
    (account_code 50 / account_description 255 / vendor_name 255 / description 1000) raised
    Postgres SQLSTATE **22001** (string_data_right_truncation) at insert time; the C8 DB net only
    mapped 22003, so 22001 fell through to a **500** on the whole import. Fixed in three layers,
    mirroring the proven 22003 net: (1) DB-boundary net -- new `StringTooLongError` leaf,
    `postgres.ts` rethrows 22001 as it, `errors.ts` -> **422 field_too_long** (app-wide
    completeness); (2) parse-time GL guard -- new `gl-text-limits.ts` (widths sourced from the
    migration) + `ensureTextFieldsWithinLimits` at both ingestion routes, **422 gl_field_too_long**
    naming the row+field, BEFORE any DB write so nothing persists; (3) covered by the DB net for
    any non-GL text sink. LOW (fail-closed status class, no corruption).
  - **D2 (non-multipart upload body -> opaque 500).** `c.req.formData()` throws a TypeError for a
    JSON/wrong-content-type body; unguarded it hit the catch-all **500**. Fixed = shared
    `readMultipartForm` guard -> **400 invalid_multipart_body**, applied to all 8 upload call sites
    (actual-billed, document-extraction, feedback, ingestion x2, rent-roll x2, tenant-disputes). LOW.
  - **Decision-gate (needs Angel):** GL import row count is unbounded -- a multi-million-row CSV is
    bounded only by the 25 MB body cap + Worker CPU/subrequest limits, not an explicit row ceiling.
    No crash observed (the size guards hold), but a hard `max_rows` with a clean 413/422 would be
    more predictable than leaning on the byte cap. Filed as a decision-gate, not auto-decided.

LIVE PROD PROOF (post-deploy, real prod token):
- Non-multipart JSON body -> **400 invalid_multipart_body** (D2).
- Yardi GL CSV with a 51-char account_code -> **422 gl_field_too_long** ("GL entry 1 has a
  account_code value longer than the maximum of 50 characters."); exactly-50 positive control
  passed the guard (404 property_not_found on the placeholder UUID -- correct next-step failure,
  proving no false-positive at the boundary and no persist) (D1 Layer 2).

REVIEW: code-reviewer verified all three layers independently (SQLSTATE read, rethrow ordering, no
import cycle, column widths vs migration, boundary logic, guard-before-write at both routes,
structural typing across all 8 sites, no-persist test invariant) -> **SHIP**, no Critical/Important.
Two fail-safe Minor notes: bare-catch->400 kept (goal-aligned: bad input should 400, not 500+Sentry);
UTF-16-code-unit vs Postgres-code-point length noted with an inline comment (can only fail *safe*,
stricter than the DB). Gate green: tsc 0 / eslint 0 / vitest 1987 passed, 23 skipped.

CONVERGENCE: STRONG. Three fresh domains -> 2 CLEAN, and the 1 defect-bearing domain yielded only the
**same opaque-500-on-hostile-input class** as C8 (22003) and C9 (22P02), now closed for 22001 +
non-multipart too. Four consecutive cycles (C7-C10) have surfaced no value-correctness or
data-corruption bug -- only fail-closed status-code hardening on input boundaries, all of one family,
plus decision-gated backlog items needing Angel (#2/#3/#4/#7/#10/#13 + the new unbounded-row-count
gate). The discoverable product-bug surface for input-boundary hostility is effectively exhausted;
remaining risk is concentrated in the human-decision backlog, not in new automatically-findable bugs.

---

## Cycle 11 - structural parser robustness + draft lifecycle guard

CODE-TIP before backend race fix: `5f41aee58` live `capveri-api` still at the Cycle 10 version.

Two fresh production probes were reconciled from untracked work and run against `https://api.capveri.com`.

- **11A structural parser robustness - CLEAN.** Harness
  `frontend/scripts/prod-stress-cycle11a-structural-parse-scenario.mjs`, final report
  `e2e-adhoc/prod-stress-cycle11a-structural-2026-07-02T11-26-50-150Z/report.json`.
  20/20 checks passed. Rent-roll preview stayed aligned across BOM, UTF-16 fail-safe,
  CR/LF variants, RFC-4180 quoted embedded comma/newline/quote, unbalanced quotes, ragged rows,
  duplicate headers, header-only, blank rows, windows-1252 high byte, and duplicate unit numbers.
  GL upload stayed non-500 on duplicate amount columns, header-only files, and non-multipart JSON.
  Header-only GL is current-contract `200` with `row_count=0` and `error_count=1`, not a 4xx.
  Billing upload stayed clean on leading-title rows and single-column tenant/amount collisions.
  Temporary properties, batches, and billing rows were deleted.

- **11B draft lifecycle duplicate guard - one backend race fixed.** Harness
  `frontend/scripts/prod-stress-cycle11b-duplicate-draft-leakage-scenario.mjs`, final report
  `e2e-adhoc/prod-stress-cycle11b-duplicate-draft-leakage-2026-07-02T11-27-49-609Z/report.json`.
  Sequential duplicate-draft value-corruption was **refuted**: compute #1 produced one draft
  with recovery `120000.00`; compute #2 with `force_recalculate=false` failed with the existing
  draft-exists guard; leakage remained `120000`; `force_recalculate=true` replaced the draft and
  stayed correct. Cleanup verified zero `CY11B` residual properties.
  Source review found a narrower concurrent stale-check window: two non-force jobs could both pass
  the pre-compute draft count, then serialize only inside `persistCalculationResults`, whose
  transaction re-checked finalized snapshots but not drafts. Fix: `persistCalculationResults`
  now re-checks draft count after `lockPropertyFinancialEvidence` and before insert; non-force
  jobs fail with the same draft-exists message if another job inserted first. Added repository
  coverage proving no insert/complete happens in that stale-check case.

Targeted local test: `npm test -- --run src/test/reconciliation-repository.test.ts src/test/reconciliation-workflow.test.ts`
passed (2 files, 36 tests).

DEPLOY: shipped on `master` as `d8bddc5ba`; `capveri-api` production version
`1ff882b9-4139-4c51-8b0a-670b8a722c11` reached 100% traffic, and
`GET https://api.capveri.com/health` returned 200.
