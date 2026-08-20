# Roadmap / Work Ledger

Master list of batches and findings for the FinOps Correctness goal. This table is the
actionable tracker; deeper specs live in `batches/<batch>.md` when a batch needs one.

**Status values:** `TODO` | `IN-PROGRESS` | `DONE` (merged + verified) | `BLOCKED` | `WONTFIX`
**Severity / value:** `P0` (core to the goal) | `P1` (important) | `P2` (polish) | `P3` (nice-to-have)

---

## Phase 1 — Backend correctness core

| ID | Sev | Status | Summary | Scope |
|----|-----|--------|---------|-------|
| B1.1 | P0 | DONE | **Bidirectional variance model.** `VarianceDirection` (OVERCHARGE / UNDERCHARGE / MATCH), `TenantVariance`, `ComparisonResult` in `comparison/models.py`. Signed `variance = actual_charged − capveri_correct`; tolerance-based MATCH. | `backend/app/services/comparison/models.py` |
| B1.2 | P0 | DONE | **Comparison engine.** `comparison/engine.py`: pure `build_comparison_result(...)` (sync, no deps) + async `compare_charges(...)` (reads same snapshots + actual_billed sources as leakage). Duplicate tenant_name → ONE combined finding (sum siblings' correct vs the shared charge — no phantom, no-drop invariant holds). Null-name → separate `id::<row_id>` findings. `leakage.py` untouched. 3 review/fix cycles. | `backend/app/services/comparison/engine.py` |
| B1.3 | P0 | DONE | **Source-agnostic charged-input.** The "other system" charges can now come from a caller-supplied explicit set, not only `actual_billed_amounts`. `engine.py`: extracted shared `_rekey_charged_to_leases` helper (combine + no-drop logic) and added `_normalize_explicit_charges` + `compare_explicit_charges`. Explicit duplicate-name combine and blank-name (`explicit::<index>`) isolation match the DB path exactly. Reviewed CLEAN (behavior byte-for-byte preserved). | `backend/app/services/comparison/engine.py` |
| B1.4 | P0 | DONE | **API.** `/api/v1/comparison/{property_id}`: GET (default `actual_billed_amounts` source) + POST (explicit charged set, never reads `actual_billed_amounts`). Returns `ComparisonResult` via `response_model` (Decimal-as-string; `variance_pct` null when correct=0). Org-scoped; `period_start>=period_end` → 400. Decoupled from `/reconciliation`; `/leakage` untouched. | `backend/app/api/v1/comparison.py` (new), `backend/app/api/v1/__init__.py` |
| B1.5a | P1 | DONE | **Pool variance — engine plumbing (do-now, non-breaking).** Optional `correct_by_lease_and_pool` / `charged_by_lease_and_pool` / `pool_names` params on `build_comparison_result` + optional `pool_breakdowns` (`list[PoolVariance] \| None`) on `TenantVariance`. New `PoolVariance` model + shared `_signed_variance_pct` / `_build_pool_breakdowns` helpers. Both maps absent ⇒ `pool_breakdowns` is `None` everywhere (byte-for-byte identical). Pool mode (≥1 map) ⇒ every tenant gets a list, `[]` when no pool data for that lease. 10 new tests; reviewed (no blockers); gate 6714 passed / 95.26%. Inert until B1.5b feeds pool data. | comparison service |
| B1.5b-S1 | P1 | DONE | **Pool variance — charged-side data model (Slice 1, non-breaking storage groundwork).** Migration `20260601000200_add_pool_to_actual_billed.sql` adds a NULLABLE `pool_id` (FK `expense_pools` ON DELETE SET NULL; NULL = tenant-level total) to `actual_billed_amounts` — no uniqueness constraint, so the read path still sums duplicate (property, period, pool) rows. Manual-entry endpoint accepts/verifies (pool must belong to the org-verified property)/stores/returns `pool_id`; upload path stays NULL; GET surfaces it via `select(*)`. Comparison engine deliberately UNCHANGED (no consumption yet). 4 new tests; two-stage review COMPLIANT/APPROVE (NITs applied); migration validated via psycopg2 rollback; gate 6757 passed / 95.26%. | `supabase/migrations/`, `api/v1/actual_billed.py` |
| B1.5b-S2a | P1 | DONE | **Per-pool allocator (pure module).** `calculation/pool_allocation.py` — `PoolRecovery` model + `allocate_pool_recoveries(...)` implementing the **Option B layer-faithful** rule (cap → controllable pools only; admin fee → fee-eligible pools; exact-to-the-cent largest-remainder rounding; `[]` on no/zero pools). Deterministic Python, no LLM. Reviewed APPROVE; merged to `master`. | `calculation/pool_allocation.py` |
| B1.5b-S2b | P1 | DONE | **Wire allocator into the produce engine.** `tenant_share.py` builds `recoverable_by_pool`, adds the **safe-withholding gate** (withhold when a cap reduced the share but pool classification is unavailable), and returns `pool_breakdowns: list[PoolRecovery]` on `TenantShareResult`. Orchestrator passes `pool_types` from the lease pool summaries. Reviewed APPROVE; merged to `master`. | `calculation/tenant_share.py`, `calculation/orchestrator.py` |
| B1.5b-S2c | P1 | DONE | **Persist + surface correct-side breakdowns (Module A "Produce" complete).** `pool_breakdowns: list[PoolRecovery]` on `TenantReconciliation`; nullable `pool_breakdowns` JSONB on `reconciliation_snapshots` (migration `20260602000000_add_pool_breakdowns_to_snapshots.sql`; NULL = aggregate-only), written by the snapshot writer (`[]` → NULL) and surfaced on the read model via `select(*)`. Stored as `list[dict]` (matches `calculation_trace` convention; avoids a models→services import cycle). Comparison engine deliberately UNCHANGED — wiring deferred to S2d to preserve the byte-identical invariant (activating pool mode with only the correct side would fabricate all-undercharge output). | `supabase/migrations/`, `calculation/orchestrator.py`, `models/reconciliation_snapshot.py`, `api/v1/reconciliation.py` |
| B1.5b-S2d | P1 | DONE | **Activate bidirectional per-pool Compare (Slice 2d) — Module B "Compare" complete.** Wired charged-side `actual_billed_amounts.pool_id` (+ explicit-charge `pool_id`) into the loaders, resolve `pool_id`↔name via `expense_pools` (UNIQUE(property_id,name) → 1:1 inversion), build `correct_by_lease_and_pool` from `snapshot.pool_breakdowns` (NAME-keyed) + `charged_by_lease_and_pool` (id-keyed), and feed pool maps + `pool_names` into `build_comparison_result` for both `compare_charges`/`compare_explicit_charges`. Two non-fabrication guards: **intersection gate** (`_build_pool_dimension` returns None unless a lease has pool data on BOTH sides → pool mode OFF → byte-identical) and **cleanly-paired-only** (duplicate/unmatched/blank names get no breakdown). Unresolved correct-side pool names drop from the pool view but stay in the tenant total. Skips the `expense_pools` query when pool mode can't activate. No migration (all columns pre-existed). 6 new tests; full gate 6778 passed, 95.22% cov. | `services/comparison/engine.py`, `tests/services/comparison/test_engine.py` |
| B1.6 | P1 | DONE | **Persistence (stored comparison runs).** Decision: keep derive-on-read AND add an optional stored point-in-time audit trail. New `comparison_runs` + `comparison_findings` tables (immutable — no UPDATE grant, no `updated_at`; a correction is a new run), org/property RLS, signed-variance findings with nullable per-pool JSONB (ready for B1.5b). `persistence.py` save/list/get (admin client + explicit org filters, Decimal-safe, all-or-nothing header+findings). Endpoints: `POST`/`GET /api/v1/comparison/{propertyId}/runs`, `GET /api/v1/comparison/runs/{runId}`. 15 new tests; review APPROVE-WITH-NITS (all applied); migration validated via psycopg2 rollback; gate 6754 passed / 95.26%. Migration `20260601000100_create_comparison_runs.sql`. | `supabase/migrations/`, `services/comparison/persistence.py`, `api/v1/comparison.py` |

## Phase 2 — Frontend

| ID | Sev | Status | Summary | Scope |
|----|-----|--------|---------|-------|
| B2.1 | P1 | TODO | Comparison results UI: a distinct view from reconciliation production, showing over/under/match findings with direction + amounts. Pills. | `frontend/src/features/...` |
| B2.2 | P1 | TODO | Wire upload/select of "other system" charges → run comparison → show `ComparisonResult`. E2E. | frontend |

## Phase 3 — Positioning / copy

| ID | Sev | Status | Summary | Scope |
|----|-----|--------|---------|-------|
| B3.1 | P1 | TODO | Reframe marketing copy: "recover money" → "charge the right amount / verify correctness (CRE FinOps)". Gated by `humanizer` + `third-grade-copy`. | `marketing/` |
| B3.2 | P2 | TODO | Reframe in-app UX copy for leakage/recovery → bidirectional correctness. Gated by both copy skills. | frontend |
| B3.3 | P2 | TODO | Update architecture docs to describe Produce vs Compare as separate modules. | `docs/architecture/` |

## Phase 4 — Review/fix loop

| ID | Sev | Status | Summary |
|----|-----|--------|---------|
| B4.x | — | TODO | Repeat spec + code-quality review cycles across impacted projects until nothing is left. |

---

## Decision log

- **2026-06-01** — Signed convention: `variance = actual_charged − capveri_correct`.
  `+` ⇒ OVERCHARGE (other system billed too much; tenant exposure / refund). `−` ⇒ UNDERCHARGE
  (recovery opportunity). `|variance| ≤ tolerance` ⇒ MATCH. This subsumes today's one-directional
  `leakage` (which only surfaced the undercharge side) and makes correctness, not recovery, primary.
- **2026-06-01** — Module B lives in a new `backend/app/services/comparison/` package, separate
  from `calculation/` (Module A), to enforce the produce/compare decoupling the goal requires.
- **2026-06-01** — Two charged-input sources at the API boundary: GET = default
  `actual_billed_amounts`; POST = explicit caller-supplied set (manual or parsed legacy
  reconciliation), which never reads `actual_billed_amounts`. Both run through the same
  `_rekey_charged_to_leases` combine/no-drop helper so duplicate-name and blank-name semantics
  are identical regardless of source.
- **2026-06-01** — Pool-level variance is **data-blocked, not engine-blocked**: split into B1.5a
  (cheap non-breaking engine plumbing) and B1.5b (the migration + snapshot enrichment that must
  exist before per-pool numbers are real). Do not ship per-pool output from synthetic/empty pool
  data — it would fabricate breakdowns.
- **2026-06-01** — Integration is a **local merge to `master`, not a PR**. This team does not use
  GitHub Pull Requests for the normal flow: review the worktree branch, fix findings, then
  `git merge --no-ff` into `master` locally and `git push origin master`. Documented as CLAUDE.md
  rule 12a. Any PR opened by mistake is closed after the local merge lands.
- **2026-06-01** — Post-review hardening on B1.3/B1.4 (review cycle: 2 agents, no BLOCKERS):
  added a negative-`tolerance` guard in `build_comparison_result` (the single chokepoint both
  compare paths route through — a negative threshold would invert MATCH semantics); documented
  `ExplicitCharge.amount` negatives as intentionally allowed (credits/reversals, matching the
  unconstrained DB `billed_amount`); added edge-case tests (3-way duplicate-name combine end-to-end
  + via the shared helper, combine-with-missing-sibling-correct, negative-amount signed undercharge,
  negative `variance_pct` HALF_UP-away-from-zero). Deliberately did NOT add a "partial-period
  overlap" test: that date filter runs server-side in PostgREST and `MockQueryBuilder` does not
  apply `.lte`/`.gte`, so such a test would assert nothing real (no-mock-only-tests rule).
- **2026-06-02** — Per-pool tenant-share allocation rule (B1.5b-S2): **Option B — LAYER-FAITHFUL**
  (user answered "not sure, research please"; researched and chose). Redistribute the aggregate
  tenant-share scalars back onto expense pools: each pool's weighting basis is its clamped (≥0)
  recoverable amount; the cap reduction (`before − after`) is attributed **only to cap-eligible
  (controllable) pools** — tax/insurance/capital are cap-exempt by default (`_CAP_EXEMPT_POOL_TYPES`),
  overridable per lease via `LeaseTerms.cap_excluded_pools`; the admin fee is attributed **only to
  fee-eligible pools** (weight-based among post-cap shares). Per-pool sums reconcile **EXACTLY** to
  the cent (largest-remainder rounding). **Safe-withholding gate:** if a cap reduced the share but
  pool classification is unavailable (no `pool_types` and no `cap_excluded_pools`), the breakdown is
  deliberately withheld (empty) rather than guessing where the cap lands — never fabricate. Pure
  deterministic Python (`pool_allocation.py`), no LLM. Sliced: **2a** pure module + tests, **2b**
  wire into `tenant_share` + orchestrator, **2c** persist + surface correct-side breakdowns
  (Module A "Produce" complete), **2d** charged-side `pool_id` loader + activate bidirectional
  per-pool Compare (only when BOTH sides have pool data, to preserve the byte-identical invariant).
- **2026-06-01** — Full backend gate runs in parallel (`pytest -n 12 --dist loadscope`): ~38 min
  serial → ~5 min on this box, 6698 passed, 95.26% cov. Use a BOUNDED worker count, not `-n auto`:
  `-n auto`=32 workers each load heavy PDF fixtures (`test_documents_api.py`) and intermittently
  hit `MemoryError` under concurrent multi-agent load; `-n 12` is memory-safe and actually faster
  (less import/memory thrash). Also fixed a latent `HealthCheck.too_slow` flake in
  `test_clean_account_code_handles_mixed_input` (slow `st.lists` generation trips the timing health
  check under CPU saturation) by mirroring the existing `suppress_health_check` remedy on the
  identical date-cleaner test. Kept out of always-on `addopts` so single-test `--pdb` debugging
  stays serial; parallel applies to the full gate only.
