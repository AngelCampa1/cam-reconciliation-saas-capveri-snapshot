# Goal: FinOps Correctness Engine — Produce, then Compare

**Status:** ACTIVE (goal-mode, multi-session, multi-agent, sub-agent driven, review/fix cycles until nothing is left)
**Started:** 2026-06-01
**Baseline commit:** `735e826b` (master)

This is the **durable, in-repo ledger** for this goal. It is the source of truth, not any chat
history or agent memory. A new agent resuming this work should read this file first, then
`PROGRESS.md` (for the single NEXT ACTION pointer), then `ROADMAP.md` (the work ledger).

---

## The Goal (verbatim intent)

> Modify the system. CapVeri should be able to **produce reconciliations on its own**, then be
> able to **compare with other systems as a separate part**. The objective of CapVeri is **CRE
> FinOps, not "just recovering money"** because that might not be the case. It should be able to
> **charge the right amount** and/or **make sure that, from other systems, the right amount is
> charged**. Sub-agent driven. Multiple review/fix cycles until there is nothing left to fix or
> complete.

### What this means, decoded

1. **Two cleanly separated capabilities:**
   - **Module A — Produce.** CapVeri computes the *correct* CAM reconciliation from source GL +
     lease terms, standalone, with no external statement required. (Largely exists today via
     `backend/app/services/calculation/orchestrator.py`.)
   - **Module B — Compare.** A *separate* capability that takes another system's reconciliation
     or billed charges and checks them against CapVeri's correct number.

2. **Correctness, not recovery.** The north-star metric is "was the right amount charged?", not
   "how much money can we claw back." A deviation is a **finding regardless of direction**:
   - **Overcharge** — the other system billed *more* than correct → tenant exposure / refund risk.
   - **Undercharge** — the other system billed *less* than correct → recovery opportunity.
   - **Match** — within tolerance → confirmed correct.

3. **"Other systems" is general.** Not just CapVeri's own "actual billed" totals — any external
   reconciliation (Yardi/MRI export, a landlord-issued statement, a manually entered set of
   charges). Line-item granularity where the source allows; totals otherwise.

---

## Current-state findings (from discovery, 2026-06-01)

- **Produce (Module A) — works.** `run_property_reconciliation()` is a single deterministic
  orchestrator: occupancy → gross-up → expense filtering → per-tenant (exclude pools → base-year
  stop → pro-rata → cap → admin fee) → `PropertyReconciliation` → `reconciliation_snapshots`.
  Produces a correct reconciliation from GL + leases alone. No external statement needed.
- **Compare (Module B) — partial and one-directional.** Only `backend/app/services/calculation/
  leakage.py` exists. It computes `leakage = capveri_calculated − actual_billed` and frames the
  result solely as "money left on the table" (underbilling). It does **not** report overbilling,
  is **totals-only**, and compares only against our own `actual_billed_amounts` table.
- **Positioning — recovery-framed.** Demand letters + "recovery opportunity" copy frame the
  product around clawing back money, not around correctness.

**Gap to close:** turn Module B into a first-class, bidirectional, source-agnostic **System
Comparison / Variance** capability; keep it decoupled from Module A; reframe semantics + UX +
marketing from "recover money" to "charge the right amount / verify correctness."

---

## Workflow (per repo CLAUDE.md — non-negotiable)

- **Worktree isolation.** All implementation happens in a git worktree (`using-git-worktrees` /
  `.\scripts\new-worktree.ps1`). Never edit master directly.
- **Sub-agent driven.** Orchestrator decomposes; sub-agents implement bounded batches with exact
  file paths, specs, and verification commands. Parallel where write-scopes are disjoint.
- **Two-stage review before merge.** (1) spec-compliance, (2) code-quality via
  `requesting-code-review` / `review-merge`. Fix every flagged issue, re-run tests, then merge.
- **Verify before claiming done.** Run tests and SHOW output. No placeholder code, no TODOs.
- **Migration-first.** Schema changes: write migration in `supabase/migrations/` first, apply +
  verify locally, then write code against it.
- **Money = Decimal**, never float. No LLMs for financial math.
- **Marketing-copy gate.** Any user-facing sales/explainer copy must pass `humanizer` **and**
  `third-grade-copy` before completion.
- **Pills.** All buttons are pills (`rounded-full`).

### Validation commands (run only for impacted projects, sequentially — never in parallel)

```bash
cd backend && pytest --tb=short
cd backend && pytest --cov=app --cov-fail-under=95
cd frontend && npm test && npm run typecheck
cd marketing && npm run typecheck
```

---

## Phases

- **Phase 0 — Discovery** ✅ (2026-06-01). Mapped Module A (works) and Module B (partial). This ledger.
- **Phase 1 — Backend correctness core.** Bidirectional, source-agnostic variance engine + model +
  API + tests. Decouple "compare" from "produce" in domain semantics.
- **Phase 2 — Frontend.** Surface comparison findings (over/under/match) as a distinct flow from
  reconciliation production. Pills, real wiring, E2E.
- **Phase 3 — Positioning/copy.** Reframe marketing + UX copy to correctness/FinOps (gated by
  humanizer + third-grade-copy).
- **Phase 4 — Review/fix loop.** Repeat spec+quality review cycles across all impacted projects
  until nothing is left.

See `ROADMAP.md` for the batch-level work ledger and `PROGRESS.md` for the current pointer.
