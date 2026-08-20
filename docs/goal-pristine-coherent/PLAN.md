# Goal: Pristine & Coherent System — Master Plan

> **Status:** v1.0 (incorporates 2 sub-agent reviews: completeness + feasibility/risk)
> **Set:** 2026-06-29
> **Owner loop:** orchestrator (this session) + sub-agents (cheap models by default)
> **Ledger:** [LEDGER.md](./LEDGER.md) · **Surface map:** [SURFACE-MAP.md](./SURFACE-MAP.md)

## 1. The Mandate (verbatim intent)

Make the **entire CapVeri system pristine and coherent** — functionally, visually, and in UX —
across **every marketing page and every app page**, every modal, button, scroll state, and flow.

Two acceptance personas, both must pass on **every** surface:
- **Gen-Z taste test:** looks at any part and says "that looks nice." (visual taste, modernity,
  consistency, polish, delight)
- **80-year-old usability test:** figures out how to use any part without getting stuck.
  (clarity, affordance, error recovery, no dead ends, legible, forgiving)

Coherence has two axes that BOTH must hold for every element:
- **Local coherence:** the element makes sense as the thing it is.
- **System coherence:** the element makes sense as a part of the whole system (consistent with
  siblings, shared design language, shared copy voice, shared interaction patterns).

Method: screenshot/snapshot every screen, modal, button, scroll state; run **real local E2E**
(spin up servers, do actual workflows); fix and improve on the go; **verify** each fix; iterate
**review → fix → verify** cycles until nothing is left to improve. Fresh eyes — ignore prior
sweeps. **Sub-agent driven**, cheap models by default.

**Clarification (per review REC-16):** "do not stop mid-goal" = do not wait for user input
between surfaces/cycles. It does NOT mean "never persist state" — write ledger state per surface
so any session can resume cleanly (§5.7).

## 2. Non-Negotiables (inherited from CLAUDE.md — never violate)

1. **Verify before claiming done.** Real test output / real render proof per fix. No placeholders.
2. **Verify every deployment** to 100% on the impacted Worker before claiming deployed. Railway retired.
3. **Money is `Decimal`/deterministic** — never float, no LLMs for financial math.
4. **Every table needs RLS.**
5. **Merges are local to `master`** — `git merge --no-ff`, re-run gate, push. No PRs.
6. **`git pull` before starting** each session.
7. **Windows/PowerShell quoting**; `--` before paths in git; quote `(marketing)` route groups.
8. **Buttons are pills** (`rounded-full`). Standing design canon.
9. **Marketing copy gate** + **humanizer → third-grade-copy** on any user-facing persuasive copy
   AND on transactional emails (CLAUDE.md lists emails explicitly).
10. **Code review before merge** (review-merge / requesting-code-review), fix all, re-run gate.
11. **Scope quality checks to impacted project**, run sequentially, never `-n auto`.
12. **Isolated worktree** for feature work (shared main tree is contested by parallel sessions).

## 3. The Taste & Coherence Rubric (the scoring lens for every surface)

A surface is "pristine" only when all applicable dimensions are GREEN. Severity per finding:
**P0** broken/blocks · **P1** clearly wrong/ugly/confusing · **P2** taste/polish · **P3** nice-to-have.

**A. Visual taste (Gen-Z lens)**
- A1 Typographic hierarchy · A2 Spacing & rhythm (4/8px scale, aligned grids) · A3 Color & contrast
  (brand palette, WCAG AA) · A4 Component consistency (pills, radii/shadows/borders) · A5 Imagery/
  iconography (one icon set, no broken/placeholder art) · A6 Motion/feedback (hover/active/focus,
  skeleton/loading) · A7 Empty/loading/error states designed · A8 Dark mode parity (where supported)
  · A9 Responsive (375/390/768/1280/1440, no overflow) · **A10 Perceived performance** (skeleton
  appears <500ms, no blank flash, no post-hydration layout shift, heavy tables virtualized).

**B. Usability (80-yo lens)**
- B1 Affordance · B2 Labeling (plain English, no jargon/codenames, icons + text/tooltip) · B3
  Wayfinding (always know where/how-back, consistent nav) · B4 Error recovery (no dead ends) · B5
  Forgiveness (confirm destructive, undo) · B6 Touch targets ≥44px · B7 Reading level (third-grade
  where it sells/explains/reassures) · B8 A11y (labels/aria, focus order, keyboard, SR names,
  role=alert errors).

**C. Functional correctness**
- C1 The thing works end-to-end locally · C2 No console errors / 4xx-5xx in normal use · C3 Data
  correctness (Decimal, no NaN/zeros, correct dates) · C4 State integrity (stale results cleared on
  input change; gates/role-scoping correct) · C5 No broken links/404s/dead routes · **C6 Number/
  currency display** (locale commas, 2dp for money, sane ratio precision, negatives visually
  distinct, zero≠blank, unambiguous fiscal-year labels) · **C7 Data-viz honesty** (no truncated/
  inverted axes, no misleading metric framing on charts/trend cards).

**D. Coherence (system lens)**
- D1 Cross-surface consistency (matches siblings) · D2 Whole-product fit (landlord/PM-side,
  reconciliation-first positioning) · D3 Copy voice + honesty (one voice marketing↔app; no
  fabricated stats/claims/testimonials) · D4 Navigation/IA fit · **D5 Micro-copy** (labels,
  placeholders, tooltips, confirmations, toasts, loading & empty-state text are human, consistent,
  not dev-speak/generic) · **D6 Meta & brand artifacts** (favicon, OG image, webmanifest name/icon,
  JSON-LD, social card preview correct & on-brand) · **D7 Marketing→app seam** (the CTA→login/
  register/onboard handoff is visually & tonally seamless; palette, type, button geometry match).

**Print (where a print/PDF flow exists):** the printed/exported artifact is legible, on-brand,
correctly paginated, no clipped/overlapping elements — graded under the P-domain DoD (§8).

## 4. Surface Domains & Sweep Order (the work breakdown)

Authoritative enumerated checklist: [SURFACE-MAP.md](./SURFACE-MAP.md). Domains:
- **X. Cross-cutting** (tokens, pill canon, shared shells) — FIRST (cascades to everything).
- **M. Marketing site** (Next.js) — second (only needs one server, fastest wins).
- **E. Transactional emails** (7 templates) + Supabase auth emails.
- **P. PDF output documents** (8+ artifacts) — highest stakes (sent to tenants/courts).
- **A. App — Landlord/PM side** (React).
- **T. App — Tenant portal** (React).

**Global sweep order (per review REC-2/REC-3):**
1. **X1 tokens + X2 pill canon + AS10/MS10 UI primitives + AS01-04 app shell + MS01-02 nav/footer**
   — the shared layer. Page-level fixes are unstable until this is DONE. ~1–2 cycles.
2. **M-static** (hand-built pages) → **MP-templates** (template component + 3 slugs) →
   **MT-tools** (each, full flow, highest functional risk) — in that order.
3. **E-emails** (render via Inbucket :54324) and **P-PDFs** (download + inspect).
4. **A-auth → A-core → A-onboard → A-public → A-modals**.
5. **T-tenant**.
6. **X cross-cutting** become per-surface checks DURING each cycle (A9/A8/B8 logged under both the
   surface row AND the X-row); the final X pass is **sampling verification only**, not a full
   600-URL re-audit (review process-gap).

## 5. The Cycle Protocol

**Cycle sizing (REC-1):** each cycle covers **≤5 surfaces**, or **1** if complex (recon workbench
A20, GL ingestion A26, any large multi-field modal, any tool MT*). Prefer 3 on first passes. Write
the surface IDs at the top of the cycle's ledger entry before SCOUT.

**Step 0 — Pre-cycle guard (REC-9):** verify env before scouting.
- Marketing in use: `(Invoke-WebRequest http://127.0.0.1:3007).Content` contains "CapVeri".
- CF Worker in use: `(Invoke-WebRequest http://127.0.0.1:8797/health).StatusCode` == 200.
- If a check fails, fix/restart before scouting. **:3000 & :8000 are FOREIGN — never use.**

**Step 1 — SCOUT (cheap sub-agent, read + render).** For each surface:
- Spin only the servers needed. **Lean render mode (REC-6):** pure-visual marketing surfaces
  (M-static, MP-templates, M-shared, legal) need ONLY marketing :3007 — do NOT start Supabase/Worker.
  Full stack only for MT-tools, A-*, T-*, checkout/PLG, emails, PDFs.
- Render at **1280 desktop + 375 mobile** minimum (768 tablet for layout-heavy). **Scroll-depth
  (process-gap):** for any surface taller than one viewport, snapshot at 25/50/75/100% (or each
  section boundary).
- **Screenshot circuit-breaker (REC-7):** if `preview_screenshot` doesn't return in ~25s, switch to
  `preview_snapshot` + `preview_eval(document.title + body.innerText.slice(0,2000))` + `preview_inspect`
  for key CSS. Never retry screenshot >1×/surface. Note snapshot-only fallbacks in the ledger.
- **Modal enumeration (process-gap):** a screen SCOUT must open every modal/drawer triggerable from
  it and grade it inline; findings report against the modal's own SURFACE-MAP row ID; the parent
  screen is NOT done until all its triggerable modals are graded.
- Interact: click every button, submit forms with good + bad input, exercise gates/stale-result.
- Grade against §3. **Compact findings schema (REC-11)** — return ONLY:
  `{surface_id, dimension, severity, finding (≤200 chars), evidence_ref (what was seen, NOT raw DOM),
  proposed_fix (≤300 chars)}`. Raw DOM/screenshots stay in the sub-agent session, never returned.
- **Persona lens (process-gap, REQUIRED in every SCOUT output):** one line each —
  `Gen-Z verdict` (does it feel polished/current? imagine a screenshot shared on social) and
  `80-yo verdict` (could someone with no CRE-software experience, no acronym knowledge, complete the
  task?).

**Step 2 — TRIAGE (orchestrator).** Dedup; confirm vs source — **verify findings against
`git show origin/master:<path>`** (main tree may be stale); reject false positives; prioritize P0–P2.

**Step 3 — FIX (sub-agent/orchestrator, in worktree).** Smallest correct fix. Money/logic =
deterministic + tested. Copy = humanizer→third-grade + gate scripts. Respect disjoint write scopes (§7).

**Step 4 — VERIFY (render proof).** Re-render locally; confirm fix + zero regressions (console clean,
flow still works). **Render-proof format (DoD-gap):** screenshot at 1280 + 375; if screenshot fails,
a saved `preview_snapshot` HTML artifact + `preview_inspect` computed values for key elements. DOM
text alone is NOT proof for visual surfaces. Copy → gate exit 0. Emails → inspect in Inbucket. PDFs →
download + inspect. **Shared-component regression scope (REC-13):** any edit to `*/components/ui/*`,
`*/components/shared/*`, or token files → re-render ≥3 surfaces per consuming domain in a FRESH
preview session.

**Step 5 — REVIEW (sub-agent, two-stage).** Spec-review then quality-review the cycle diff; fix all;
re-run impacted tests/lint/typecheck (sequential, scoped).

**Step 6 — MERGE.** `git merge --no-ff` to master locally, re-run gate, push. **Merge cadence
(REC-12):** visual/copy-only surfaces (M-static, MP slugs) may BATCH — one merge per sub-domain
sweep. Per-surface merges for functional tools (MT*), app screens (A*), and any P0. **Worktree
lifecycle (REC-14):** name `worktree-<cycle>-<domain>`; after merge `git worktree remove <path>
--force` + `git worktree prune`; never reuse a worktree dir.

**Step 7 — LOG & LOOP.** Append the cycle to LEDGER. **Per-surface state (REC-16):** as each surface
resolves, write its row to ledger `{surface_id, status, findings_count, last_action}` so a crash mid-
cycle is recoverable. Continue to the next surface — do NOT stop mid-goal.

## 6. Local E2E Environment

Full runbook lives in [SURFACE-MAP.md](./SURFACE-MAP.md#runbook-local-e2e--filled-in-c0). Summary:
- **Lean (visual marketing):** marketing :3007 only.
- **Full stack:** Supabase (54321/54322, Inbucket 54324) → CF Worker :8797 (`DB_ACCESS_MODE:
  direct-postgres`) → frontend :5173 → marketing :3007.
- **wrangler flake recovery (REC-8):** if `/health` ≠ 200 after 30s → kill wrangler, `supabase db
  reset`, restart wrangler; if still failing, do marketing-only this cycle and log the flake.
- Creds: landlord `owner@acme.example.com / TestPass123!`, tenant `sarah.tenant@retailstore.com`.
- Emails verified in **Inbucket :54324** (not Claude Preview). Supabase auth emails are configured in
  Supabase dashboard templates — separate tooling; audit for brand/voice as a note-level surface.

## 7. Sub-Agent Policy for this goal

**Model-per-role (REC-10):**
| Role | Model |
|------|-------|
| SCOUT static/visual pages | haiku |
| SCOUT functional tools / multi-step modals | sonnet |
| FIX copy / CSS / simple JSX | haiku |
| FIX logic / TypeScript / math | sonnet |
| REVIEW CSS/copy diffs | haiku |
| REVIEW logic/architecture/security | sonnet |
| ORCHESTRATOR triage | sonnet (opus only for 3+-pass conflicts) |

**Disjoint write scopes (REC-5):**
- M-static: parallel OK if each agent owns disjoint route files under `marketing/src/app/`.
- MP-templates: parallel OK only on disjoint data JSON; NEVER parallel on a shared template component.
- A-screens: parallel OK on disjoint route components; NEVER if touching `frontend/src/components/ui|shared`.
- Any X cross-cutting / shared component (MS*, AS*, X*): **always single agent, serialized**.

Orchestrator holds the map + ledger; sub-agents return compact findings only (§5 step 1).

## 8. Definition of Done

**Render proof (DoD-gap):** screenshot 1280 + 375 (or snapshot-artifact + inspect fallback).
**Independent pass (REC-15 / DoD-gap):** a NEW SCOUT invocation given only the surface ID + rubric
(no prior findings in context); passes are sequential, not concurrent.

**Tiered convergence (REC-15)** — overall DONE per dimension class:
- **Functional (C1–C7):** zero new findings across 2 independent passes (binary, achievable).
- **Structural/usability (B1–B8, D1–D7):** zero new P0/P1 across 2 passes; all P2s logged.
- **Taste/polish (A1–A10, B7):** pass 1 fixes all P0/P1/P2; P3s logged (don't block); pass 2 confirms
  **no new P0/P1 regressions** (regressions only — not "zero findings", which is unreachable for taste).
- If pass 2 finds any P0–P2, the surface reverts to FIXING and the pass counter resets.

**Per-surface DoD:** all applicable §3 dims GREEN per the tier above · render proof captured · flows
pass E2E locally · no console/network errors · copy gates pass (incl. emails) · logged DONE w/ evidence.

**Email DoD:** sent through local flow, inspected in Inbucket; brand/voice/pill/legible; copy gate +
humanizer + third-grade pass. **PDF DoD:** downloaded + inspected; brand layout, Decimal formatting,
no jsPDF artifacts, key fields (totals/dates/names) match source data.

**Overall DONE:** every SURFACE-MAP row DONE under its tier; X cross-cutting sampling-verified system-
wide; all work merged to master + deploy-verified where it ships.

## 9. Risks & Footguns (carry forward)

- Shared main tree contested by parallel sessions → isolated worktree; verify findings vs
  `git show origin/master:<path>`; deploy from fresh worktree off origin/master.
- Foreign apps: marketing `:3000` & backend `:8000` are CAMAudit-v2 — verify marketing `<title>`
  has "CapVeri"; verify backend `/openapi.json` title=="CapVeri API" or Worker `/health`==200.
- `preview_screenshot` may time out → snapshot+eval+inspect fallback (§5 step 1).
- wrangler dev :8797 D1/postgres flake → recovery in §6.
- Copy must never carry codenames / funnel-jargon / fabricated stats into reader-visible text.
- Deploy plan d1 migration step can flake (7403) → verify worker version advanced post-deploy.
- webmanifest name has a double-space ("CapVeri  -  CRE FinOps Platform") — likely a real bug to fix.

## 10. Review history of THIS plan

- **v0.1** drafted by orchestrator 2026-06-29.
- **v1.0** 2026-06-29 — folded 2 sub-agent reviews:
  - *Completeness:* added domains E (emails) & P (PDFs); rubric A10/C6/C7/D5/D6/D7 + print; OG/
    sitemap/robots/manifest/email-logo/favicon surfaces; persona-lens output; modal-enumeration rule;
    scroll-depth; render-proof + independent-pass definitions; email/PDF DoD; Supabase auth emails.
  - *Feasibility:* shared-layer-first sequencing; ≤5-surface cycle cap; lean render mode; screenshot
    circuit-breaker; disjoint write-scope table; compact findings schema; model-per-role table; merge
    batching; worktree lifecycle; tiered convergence; per-surface ledger writes; pre-cycle port guard;
    wrangler flake recovery; template-slug selection (first/median/last alphabetical default).
- Next: SURFACE-MAP gets E + P sections; then SCOUT cycle **C1 = shared layer** (X1/X2/AS10/MS10/shell).
