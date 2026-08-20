# Progress Log

Append-only. The **NEXT ACTION** block is the single pointer for the next agent.

## CURRENT STATE

- **Phase:** 4 — Site-wide leakage→correctness sweep — **DONE** (slices 1–7b + final sweep)
- **Cycle:** 2
- **Status:** Phase 1 backend correctness core, Phase 2 frontend Module B Compare UI, and **Phase 3
  marketing copy reframe** are all DONE and merged to `master`. **Module A "Produce"** and **Module B
  "Compare"** are complete end-to-end (backend + `/compare` page). **Phase 3** reframed the four
  highest-visibility marketing surfaces away from "recover money / recovery / leakage" framing toward
  CRE FinOps correctness ("charge the right amount", catching BOTH over-billing and under-billing,
  and verifying what other systems billed): homepage hero (`HeroSection`), value-prop trio
  (`ValuePropositionSection` — all 3 cards now in one correctness voice, including card 2
  "Get every CAM number right"), CTA (`CTASection`), and pricing (`PricingContent`). Every changed
  string passed the `humanizer` then `third-grade-copy` gates (no em/en dashes, headlines <=8 words
  leading with outcome, sentences <=14 words; domain terms CAM/GL/recovery-terms preserved). Marketing
  gate green on merged master: **573 tests passed**, typecheck / format / lint clean (3 pre-existing
  unrelated unsubscribe-page warnings). Merged `feature/finops-copy-reframe` → `master` (`b2acdd75`),
  worktree removed, branch deleted. No PR (rule 12a).
- **WORKFLOW NOTE (2026-06-02):** Per the user, STOP spinning review/fan-out sub-agents (they were
  triggering rate limits). Do the goal work inline. There is no scheduled task / cron / Stop hook to
  delete — the cost came from the sub-agent review workflow pattern itself, now retired for this goal.
- **PHASE 4 SCOPE (user AskUserQuestion answers):** (1) "Copy + rename tools/URLs" — reframe visible
  copy AND rename leakage-framed routes/slugs with 301 redirects; (2) "Keep, add over-billing framing"
  — keep the leakage tools but reframe copy to read as "charge the right amount / catch both over- and
  under-billing." SEQUENCING DECISION (orchestrator judgment): do the safe high-value COPY reframes
  first in verified slices, then handle URL/slug renames as a later slice with explicit SEO 301s.
  Note: tool analytics `slug` strings and lead-magnet `storagePath` (`*.xlsx`) are code/DB identifiers
  — keep stable even when the public URL changes (decouple URL from asset id).
- **PHASE 4 SLICE 1 — DONE (merged `8c5619a4`):** Reframed `cam-leakage-estimator` tool copy
  (`page.tsx` + `CamLeakageEstimatorClient.tsx`) from one-directional "recover lost revenue" to
  CRE FinOps correctness (both over- and under-billing; "charge the right amount"). Reframed meta
  description, OG/Twitter, H1 subhead, intro block, ToolPageLayout description. Replaced the stale
  tenant-side `camaudit.io` "forensic scan" link with CapVeri's both-ways check. Dropped en-dash range
  separators (use "to"). Copy passed humanizer + third-grade-copy (FK 3.6, avg 6.9 w/sentence). URL/slug
  kept this slice (rename deferred). Marketing gate green on merged master: 574 tests, typecheck/lint/build clean.
  `CrossSiteCallout` (camaudit.io across cam-audit/cam-charges/etc.) is a separate deliberate cross-site
  component — left untouched (a product/SEO decision, not a copy reframe).
- **PHASE 4 SLICE 2 — DONE (merged `01fa7a68`):** Reframed the NOI Impact Calculator
  (`noi-impact-calculator/NOICalculatorClient.tsx` + `page.tsx`) and its tools-index card +
  the leakage-estimator FAQ answer (`tools/page.tsx`) from one-directional "CAM leakage recovery"
  to billing accuracy (both over- and under-billing). WebApplication/HowTo schema + meta/OG/twitter
  + H1 subhead + intro reframed; results-UI labels and the 4% benchmark math left intact (they
  accurately describe the under-billing the tool models). Copy passed humanizer + third-grade-copy.
- **PHASE 4 SLICE 3 — DONE (merged `99663aeb`):** Reframed the two highest-visibility SHARED SEO
  surfaces: `src/app/layout.tsx` root metadata description (dropped "leakage detection" + "every
  dollar recovered"; names both directions; removed spaced-hyphen dash) and `src/lib/structured-data.ts`
  service-schema description. The `"leakage-detection"` PUBLIC_ROUTE_FEATURE_MAP entries are
  feature-KEY code identifiers (map to the feature registry) — kept stable like analytics slugs.
- **PHASE 4 SLICE 4 — DONE (merged `29261431`):** Reframed the recovery-gap analyzer
  (`recovery-gap-analyzer/RecoveryGapAnalyzerClient.tsx` + `page.tsx`) — the strongest one-directional
  "CAM leakage" artifact. Kept its legitimate cost-recovery domain math (recovery ratio, recoverable
  expenses, benchmark %) intact; dropped the "leakage" jargon (-> "recovery gap"/"under-billed");
  added "CapVeri then checks both over-billing and under-billing" at the product level; removed two
  spaced-hyphen dashes. All facts (12-20x, $50,000, 6%, $833,000) preserved. 574 marketing tests green.
- **REMAINING SWEEP (scan 2026-06-02):** ~458 visible "leakage" occurrences remain across ~40 files
  (excluding feature-key identifiers / slugs / generated). Most are LEGITIMATE domain-term usage in
  long-tail SEO/blog MDX (CAM leakage = the under-billing direction, a real concept) — do NOT blanket
  eradicate. Prioritize POSITIONING surfaces that frame the whole product as one-directional, in this
  order: (1) `src/lib/product-features.ts` + `src/config/plans.ts` (the "leakage-detection" feature
  visible NAME/description — distinct from the key), (2) `src/components/MarketingFooter.tsx`,
  (3) `src/app/glossary/page.tsx` (add the over-billing counterpart to the CAM-leakage definition),
  (4) `src/app/docs/page.tsx`, (5) the generated `src/generated/public-knowledge.ts` SOURCE (find the
  generator input; lines ~1548/1804 carry "leakage detection / every dollar recovered" Q&A framing).
  Then the deferred URL/slug renames (cam-leakage-estimator public name/buttonText + 301s) and a final
  full-sweep pass. Gate each slice through humanizer + third-grade-copy, marketing copy-jargon gate,
  574-test marketing suite; local-merge to `master` (no PR).
- **PHASE 4 SLICE 5 — DONE (merged `8d06a391`):** Reframed the "leakage-detection" feature
  positioning copy at its real (non-generated) SOURCE. The visible feature NAME lives in
  `knowledge/source/product.ts` (NOT `product-features.ts`), and the FAQ/help bodies live in
  `knowledge/source/{marketing-faqs,app-help}.ts`; all four `public-knowledge` artifacts
  (`knowledge/generated/*`, `frontend/src/generated/`, `marketing/src/generated/`) are
  AUTO-GENERATED by `scripts/generate-public-knowledge.mjs` and must be regenerated, never
  hand-edited. Changes: feature name "Leakage detection" → "Billing error detection" (key
  `leakage-detection` unchanged; description was already bidirectional); marketing-faqs
  "leakage detection" → "billing-error detection", "0.25%-1.5% leakage scenarios" →
  "under-billing scenarios", "Every dollar recovered flows" → "Correct CAM billing flows";
  app-help CAM-billed-report body now "flags over-billing or under-billing" (also dropped the
  hard word "calculated" → "correct amount"). Confirmed already-bidirectional and LEFT ALONE:
  `product-features.ts` line 52 `featureProblem`, the product.ts feature `description`,
  `plan-tiers.json` "Exception summary" label, and the `*LeakageRate`/`modeled-leakage-scenarios`
  code identifiers + anchor ids. All $/% facts preserved. Every changed string passed humanizer +
  third-grade-copy (NOI FAQ avg 8.0; app-help avg 7.0; feature name 3 words). Marketing copy-jargon
  gate exit 0, typecheck clean, 574 marketing tests, lint 0 errors (3 pre-existing unsubscribe
  warnings); frontend pre-commit hooks (prettier/eslint/dev build) ran green after `npm ci` in the
  worktree. Local-merge to `master`, pushed. No PR (rule 12a).
- **PHASE 4 SLICE 6 — DONE (merged `94088ee5`):** Reframed the `/docs` Product Overview
  (`src/app/docs/page.tsx`) from one-directional "Revenue Recovery Platform" positioning
  (recover 3-5% of lost revenue / "systematic revenue leakage" / "every dollar of recoverable
  expenses is accurately billed") to CRE FinOps correctness: manual errors move CAM bills 3-5%
  off the correct amount in BOTH directions; CapVeri catches over-billing and under-billing. Kept
  the 3-5% fact and the Common Area Maintenance (CAM) expansion; heading "Revenue Recovery
  Platform" → "Get every CAM number right"; kept "deterministic calculation engine". INSPECTED and
  intentionally LEFT untouched: `MarketingFooter.tsx` line 37 "CAM Leakage Estimator" (tool public
  name — bundled with the deferred URL/slug rename so footer ↔ tool stay consistent),
  `glossary/page.tsx` (no one-directional product positioning; the only hits are a real
  `/resources/cam-leakage-guide` resource link title and domain terms like "recovery ratio"), and
  docs `Cumulative Caps` "maximize recoverable amounts" (accurate cap-mechanics domain copy). Copy
  passed humanizer + third-grade-copy (block1 avg 8.0, block2 avg 7.2, heading 5 words); copy-jargon
  gate exit 0, no dashes, typecheck clean, 574 marketing tests, lint 0 errors. Local-merge, pushed.
- **PHASE 4 SLICE 7a — DONE (merged `e07ab2b5`, feat `17eb895b`):** Reframed the `/about` page
  positioning (`src/app/about/page.tsx`) off one-directional recovery framing. Subhead "Recovering
  lost revenue for commercial landlords" → "Correct CAM billing for commercial landlords"; CTA
  heading "Ready to Recover Your Missing Revenue?" → "Ready to charge the right amount?"; CTA body
  "...how much you are leaving on the table." → "See where your CAM bills run high or low." (free
  trial offer kept). Left "operating expense recovery exposure" in the mission copy (legitimate
  cost-recovery modeling term); metadata + values copy were already neutral. Copy passed humanizer +
  third-grade-copy; copy-jargon gate exit 0, no dashes, typecheck clean, 574 marketing tests, lint 0
  errors. Local-merge to `master`, pushed. No PR (rule 12a). (Ledger entry backfilled in slice 7b.)
- **PHASE 4 SLICE 7b — DONE (committed `2b731559`):** The deferred URL/slug rename. User chose
  "Rename URL with 301s" (AskUserQuestion). Renamed the route folder + client/test files
  `tools/cam-leakage-estimator` → `tools/cam-billing-error-estimator` (git mv), added a permanent
  (301) redirect in `next.config.ts`, and updated sitemap + sitemap-dates + sitemap test. Updated
  ALL internal references to the new slug and the "CAM Billing Error Estimator" label: footer, tools
  index card (title + `Get your CAM estimate` button — note CTA verb "Estimate" is NOT allowlisted,
  so the button leads with "Get"), SEO clusters, contextual-links, content-map href/label, the
  how-to-calculate-cam-charges + software/[product]/cam-setup resource pages, and the four cross-tool
  client links (BOMA / FixedCam / HCAD / NOI). Reframed the tool NAME + links across ~21 blog/resource
  MDX files and ~10 data JSON files; regenerated `public/llms.txt` + `public/llms-full.txt` from the
  updated `data/seo/llms-sections.json` source (title + path + description "Estimate yearly CAM billing
  errors across your portfolio."). Reframed lead-magnet `displayName` → "CAM Billing Error Estimator".
  Tightened one trailing one-directional descriptor ("Quantify how much is leaking" → "Size your
  billing error exposure"). **Stable code identifiers kept unchanged on purpose:** analytics
  `slug="cam-leakage-estimator"` (TrackToolPageView + `trackMarketingEvent`) + location
  `cam_leakage_estimator_result`, content-map KEYS (`TOOL_FUNNEL_STAGES`/`TOOL_RELATED_CONTENT`),
  lead-magnet registry `slug` + `storagePath("cam-leakage-estimator.xlsx")` + `LeadCaptureForm.test`
  `assetSlug`, and `tools/page.tsx` `slug` field — decoupling public URL from asset id. The
  educational "CAM leakage" domain concept (the `/resources/cam-leakage-guide` page + concept prose)
  is preserved. 56 files changed. Verified: marketing copy gate exit 0, typecheck clean, **574/574
  marketing tests pass**, format + lint clean (0 errors, 3 pre-existing unsubscribe warnings), no
  em/en dashes introduced. Local-merge to `master` next.
- **PHASE 4 FINAL SWEEP — DONE (this slice):** Ran the closing positioning sweep across
  `marketing/src` (app + components + lib), `marketing/content` (blog + resources + LinkedIn), and
  `marketing/data`. Scanned for one-directional product framing: "recover lost/missing revenue",
  "Revenue Recovery", "every dollar recovered", "stop leakage", "money on the table", "find the
  money", "leakage detection" as a product name. **Result: nothing left to reframe.** Every remaining
  "leakage"/"recovery"/"lost revenue"/"money on the table" hit is one of: (a) legitimate domain-term
  education — gross-up math, cumulative-vs-non-cumulative cap mechanics, recovery-ratio benchmarks,
  the `/resources/cam-leakage-guide` concept page; (b) explicitly BIDIRECTIONAL content (LinkedIn
  posts that state "errors run both ways" and use "leaving money on the table" for the UNDER-billing
  direction); (c) code identifiers (the `leakage-detection` feature KEY, whose visible name is already
  "Billing error detection" with a both-ways description; analytics slug; content-map keys); (d) a
  factual one-directional consequence (ROI page: missing the reconciliation deadline forfeits true-up
  rights — genuinely one-directional); (e) the `cam-recovery-optimization` solution page, which
  legitimately targets the recovery-ratio (under-billing) correctness direction — part of the FinOps
  "charge the right amount you are owed" objective, not blanket recovery positioning. The
  product-LEVEL positioning surfaces (homepage hero, value-prop trio, CTA, pricing, about page, the
  primary tool name + URL `cam-billing-error-estimator`, and the "Billing error detection" feature)
  are all reframed to bidirectional CRE FinOps correctness. No copy changes were required by this
  sweep, so no functional diff — this ledger entry records the verification result.
- **NEXT ACTION:** **Goal complete for the marketing reframe track — reviewed, merged, deployed, and
  live-verified in production.** Module A "Produce" + Module B "Compare" are DONE end-to-end (backend +
  `/compare`). Phases 1–4 of the leakage→correctness reframe are DONE and merged to `master`. The
  marketing site now positions CapVeri as CRE FinOps correctness (charge the right amount; catch BOTH
  over- and under-billing; verify what other systems billed), not one-directional revenue recovery.
  Production (`www.capveri.com`) verified live: new tool route `/tools/cam-billing-error-estimator`
  200, old `/tools/cam-leakage-estimator` 308→new, reframed resource-card copy "Estimate billing
  errors…" live. No open reframe work remains. If the goal is revisited, the next candidate area would
  be the authenticated `frontend/` app selling/empty-state copy (not part of this Phase 1–4
  marketing-site scope) — scan it the same way before assuming work exists.

## Session Log

### 2026-06-02 — Session 12 — Phase 4 review fix + merge + production deploy/verify
- User directive (this request only, overriding the inline-only workflow note): pull master + origin,
  spin review agent(s) for all work, fix issues, run all verifications incl. builds, merge to master,
  push, deploy, run migrations if needed, verify on the live site, delete worktree/branch.
- Review agents (2 parallel, general-purpose) on the Phase 4 route-rename + reframe: both APPROVE.
  One minor actionable: a one-directional related-tool card on `how-to-calculate-cam-charges`
  ("Estimate underbilling…"). Fixed → "Estimate billing errors…" (bidirectional, matches the renamed
  tool). Worktree `.worktrees/finops-p4rf`, branch `feature/finops-p4-review-fix`, commit `d17e0c6f`.
- Verified on merged `master`: marketing copy gate exit 0 (1423 files), `npm run typecheck` clean
  (initial errors were stale `.next` validator artifacts referencing the old route — cleared `.next`,
  re-ran clean), `npm test` **574 passed / 93 files**, `npm run build` exit 0 (all routes prerendered).
- Merged `feature/finops-p4-review-fix` → `master` (`--no-ff`, `74148491`), pushed origin, removed
  worktree, deleted branch. No PR (rule 12a). **Migrations: none** — marketing-only, no schema touched.
- **Deploy blocker found + resolved:** Vercel marketing build for `74148491` FAILED on a Hobby-plan
  `build-rate-limit` (the `content/youtube-production` branch preview builds were consuming the budget),
  so production stayed on `2b79e5f` (route rename live, card fix not). After the rate-limit window
  cleared, re-triggered the GitHub→Vercel production pipeline with an empty commit `c3eab9ea`; deploy
  `dpl_ED8oNjbwHN1DtrtQfViSxxCKSuSG` built READY and promoted to `www.capveri.com` / `capveri.com`.
- **Live production verified:** `/tools/cam-billing-error-estimator` → 200; `/tools/cam-leakage-estimator`
  → 308 → new route; `how-to-calculate-cam-charges` card now reads "Estimate billing errors from
  building area" (zero stale "underbilling" hits). Full review/merge/deploy/verify cycle complete.

### 2026-06-01 — Session 1 (kickoff + discovery)
- Set goal: produce reconciliations standalone, then compare with other systems as a separate
  part; objective is CRE FinOps correctness ("charge the right amount" / verify other systems),
  not just recovery.
- Discovery (parallel sub-agents): mapped the produce engine (`calculation/orchestrator.py`,
  works standalone) and the compare side (`calculation/leakage.py`, one-directional, totals-only,
  own-data-only).
- Created durable ledger at `docs/goal-finops-correctness/`.
- Baseline: master full backend suite **6629 passed, 95.22% coverage**.

### 2026-06-01 — Session 1 (cont.) — B1.1/B1.2 comparison core
- Built `backend/app/services/comparison/` in worktree `feature/finops-comparison-core`:
  `models.py` (`VarianceDirection`/`TenantVariance`/`ComparisonResult`, signed `variance =
  actual_charged − capveri_correct`, tolerance MATCH) + `engine.py` (pure
  `build_comparison_result` + async `compare_charges`). TDD.
- Review cycle 1 found a BLOCKER: duplicate `tenant_name` collapsed leases → phantom
  over/undercharges. Fix cycle 1 routed ambiguous names to a synthetic bucket but zeroed the
  siblings' correct (a NEW phantom-overcharge / total-distortion bug).
- Fix cycle 2: ambiguous name (dup leases + a charge) → ONE combined finding, bucket.correct =
  Σ siblings' correct vs the shared charge; no-drop invariant (`total_capveri_correct` always =
  Σ all leases' correct). Also: quantized `variance_pct` (2dp, HALF_UP); null-name charges become
  separate `id::<row_id>` findings (never merge into a real lease).
- Independent verification agent: PASS — no fabrication vector, no-drop invariant holds for
  unique / 2-way / 3-way / no-charge-dup / mixed; 35 comparison tests pass.
- NEXT FOCUS — merge branch to master, then B1.4 (API) + B1.3 (source-agnostic input).

### 2026-06-01 — Session 2 — B1.3 + B1.4 (source-agnostic input + API)
- Implemented on worktree branch `feature/finops-comparison-api`:
  - **B1.3** — `engine.py`: extracted shared `_rekey_charged_to_leases` helper (combine + no-drop
    logic, byte-for-byte preserved from the DB path); added `_normalize_explicit_charges` +
    `compare_explicit_charges`. Explicit duplicate-name combine and blank-name (`explicit::<index>`)
    isolation match the DB path exactly. Added 4 engine tests.
  - **B1.4** — new `backend/app/api/v1/comparison.py`: GET `/{property_id}` (default
    `actual_billed_amounts` source) + POST `/{property_id}` (explicit charged set, never reads
    `actual_billed_amounts`). Returns `ComparisonResult` via `response_model` (Decimal-as-string,
    `variance_pct` null when correct=0). Org-scoped; `period_start>=period_end` → 400. Router
    registered in `__init__.py` with `prefix="/comparison"`. Added 12 API tests.
- Review: CLEAN — no BLOCKER/SHOULD-FIX. Refactor behavior preserved; tolerance Decimal end-to-end;
  no `/leakage` collision.
- **Test-speed fix (durable):** the full backend gate was ~38 min serial. Switched the full gate to
  parallel xdist (`pytest -n 12 --dist loadscope`) — verified xdist-safe (per-worker processes,
  autouse singleton resets, mocked Supabase, no shared files/ports). Result on the merged result:
  **6698 passed, 95.26% cov, 4m51s** (~7× faster). Two robustness fixes surfaced while verifying:
  (1) use a BOUNDED `-n 12`, not `-n auto`=32 — 32 workers each load heavy PDF fixtures and hit
  `MemoryError` under concurrent multi-agent load, and `-n 12` is also faster; (2) fixed a latent
  `HealthCheck.too_slow` flake in `test_clean_account_code_handles_mixed_input` (mirrors the
  existing `suppress_health_check` remedy on the identical date-cleaner fuzz test). Kept out of
  always-on `addopts` so single-test `--pdb` debugging stays serial. Updated camaudit `CLAUDE.md`
  Quick Reference full-gate lines (separate commit).
- NEXT FOCUS — B1.5a (engine pool plumbing, non-breaking), then B1.6 (persistence, migration-first).

### 2026-06-01 — Session 3 — review/fix cycle + local-merge policy
- Pulled latest master, re-merged into `feature/finops-comparison-api` (clean).
- Ran two parallel review agents over the full integrated diff (correctness/spec +
  code-quality/security). Verdict: **NO BLOCKERS** on either pass. Confirmed: signed convention,
  no-drop invariant (unique / 2-way / 3-way / no-charge-dup / mixed-blank), combine semantics,
  shared `_rekey_charged_to_leases` reuse across DB and explicit paths, org-scoping, Decimal
  end-to-end, `variance_pct` null-on-zero, tests assert real math (no mock-only).
- Fixed worthwhile SHOULD-FIX items (commit `e7ef0362`): negative-`tolerance` guard,
  `ExplicitCharge.amount` negative-semantics docstring, and four new edge-case tests. Skipped a
  "partial-period overlap" test on principle — that filter is server-side (PostgREST) and the
  Supabase mock does not apply `.lte`/`.gte`, so the test would assert nothing real.
- Verified: full gate **6704 passed, 95.26% cov** (`-n 12 --dist loadscope`); mypy clean.
- **Policy documented:** integration is a **local merge to `master`, not a PR** (CLAUDE.md rule
  12a + ROADMAP decision log). Closed the stray PR #1.
- Merged `feature/finops-comparison-api` → `master` locally (`--no-ff`) and pushed origin.
- NEXT FOCUS — B1.5a (engine pool plumbing, non-breaking), then B1.6 (persistence, migration-first).

### 2026-06-01 — Session 4 — B1.5a (non-breaking per-pool engine plumbing)
- Implemented on worktree `feature/finops-pool-plumbing` (off `master` `4d0f2873`), TDD:
  - `comparison/models.py`: new `PoolVariance` model (pool_id, pool_name, capveri_correct,
    actual_charged, variance, direction, abs_variance, variance_pct) + optional
    `pool_breakdowns: list[PoolVariance] | None` on `TenantVariance`.
  - `comparison/engine.py`: `build_comparison_result` gained 3 optional params
    (`correct_by_lease_and_pool`, `charged_by_lease_and_pool`, `pool_names`). Extracted the
    tenant-level percentage rule into a shared `_signed_variance_pct` (single source of truth)
    and added `_build_pool_breakdowns` (per-lease union of pool ids, same signed convention /
    classification / tolerance, sorted by descending abs variance).
  - Contract: "pool mode" active iff ≥1 pool map provided. Both absent ⇒ `pool_breakdowns` is
    `None` everywhere (byte-for-byte identical to per-tenant-total behavior). In pool mode every
    tenant gets a list; `[]` distinguishes "pool mode on, no data for this lease" from "off".
- 10 new tests in `test_pool_breakdowns.py` (non-breaking guarantee, signed/classified/sorted,
  one-sided pools, empty-list signal, single-map activation, HALF_UP symmetry on negatives,
  per-lease activation from a global map, custom tolerance).
- Review: one general-purpose review agent over the diff — **NO BLOCKERS**; upheld all five
  contract points, confirmed no caller-dict mutation, helpers reused cleanly. Added its two
  cheap test-gap NITs (negative-pct symmetry + per-lease activation).
- Verified: full gate **6714 passed, 95.26% cov, 7m19s** (`-n 12 --dist loadscope`); mypy clean;
  black/isort/ruff clean.
- Merged `feature/finops-pool-plumbing` → `master` locally (fast-forward, via temp worktree since
  the main tree is on another agent's branch) and pushed origin (`80a23da3`). No PR (rule 12a).
- NEXT FOCUS — B1.6 (persistence): decide derive-on-read vs stored comparison runs, migration-first.

### 2026-06-01 — Session 5 — B1.6 (stored comparison runs / immutable audit trail)
- Decision: keep the existing derive-on-read comparison endpoints AND add an optional stored
  point-in-time audit record so CapVeri can defend "the right amount was charged on date X"
  (a recompute drifts as data changes). Implemented on worktree `feature/finops-comparison-persistence`.
- Migration-first: `supabase/migrations/20260601000100_create_comparison_runs.sql` —
  `comparison_runs` (header + signed aggregate totals + counts + source + created_by) and
  `comparison_findings` (one signed `TenantVariance` per tenant; `lease_id` TEXT to hold synthetic
  `name::`/`id::`/`explicit::` keys; nullable `pool_breakdowns` JSONB ready for B1.5b). **Immutable
  audit records**: no `updated_at`, no UPDATE grant, no update trigger — a correction is a NEW run.
  Org/property RLS mirrors `reconciliation_snapshots`. Validated non-destructively against the live
  local DB via a psycopg2 transaction + `conn.rollback()`.
- `services/comparison/persistence.py`: `save_comparison_run` (insert header → bulk-insert findings;
  all-or-nothing: on findings failure the orphaned header is deleted), `list_comparison_runs`
  (newest-first, paged), `get_comparison_run` (header + findings, sorted by abs variance). Admin
  client with EXPLICIT `organization_id` filters (RLS is defense-in-depth); Decimal⇄string and
  date/UUID/enum (de)serialization to preserve `NUMERIC(14,2)` precision.
- API: `POST /api/v1/comparison/{propertyId}/runs` (persist; `charges` absent ⇒ actual_billed
  source, present ⇒ explicit), `GET …/runs` (list summaries), `GET /api/v1/comparison/runs/{runId}`
  (full run + findings). Routing verified collision-free against the existing `{propertyId}` route.
- 15 new tests (8 persistence via in-memory Supabase stub incl. pool JSONB round-trip + rollback;
  7 API incl. list→get round-trip and 404s). Review (general-purpose agent): APPROVE-WITH-NITS —
  applied all 3 (audit immutability hardening, `created_by` None-check, dropped unused index).
- Merge surfaced a migration-timestamp collision: master's B4.3 added `20260601000000_add_management_fee_percentage.sql`;
  renamed mine to `…000100…` (no schema dependency) — migration-uniqueness tests green.
- Verified on the merged result: full parallel gate **6754 passed, 95.26% cov, 6m45s**
  (`-n 12 --dist loadscope`), mypy/ruff/black clean. Merged `feature/finops-comparison-persistence`
  → `master` locally (`--no-ff`, temp worktree) and pushed origin (`90c7e5d9`). No PR (rule 12a).
- NEXT FOCUS — B1.5b: pool-dimension migration (`actual_billed_amounts` pool column) + produce-engine
  snapshot enrichment. The B1.5a/B1.6 plumbing already persists `pool_breakdowns` with no further
  migration. Then Phase 2 (frontend comparison UI, pills) and Phase 3 (copy reframe).

### 2026-06-01 — Session 6 — B1.5b-S1 (charged-side pool data model)
- Scoped B1.5b via an exploration agent: per-pool detail does NOT exist end-to-end. Split into
  **Slice 1** (charged-side `pool_id` storage groundwork — non-breaking, no engine consumption)
  and **Slice 2** (correct-side enrichment + new per-pool tenant-share financial logic, which
  needs a domain allocation-rule decision). Did Slice 1 this session on worktree
  `feature/finops-billed-pool-dimension`.
- Migration-first: `supabase/migrations/20260601000200_add_pool_to_actual_billed.sql` adds a
  NULLABLE `pool_id UUID REFERENCES expense_pools(id) ON DELETE SET NULL` to
  `actual_billed_amounts` (NULL = tenant-level total). Deliberately **no uniqueness constraint**
  — the read path sums duplicate (property, period, pool) rows by design. Non-UNIQUE index on
  `(property_id, period_start_date, period_end_date, pool_id)`. Validated non-destructively
  against the live local DB via psycopg2 transaction + `conn.rollback()` (column nullable, FK
  confdeltype `n`=SET NULL, index present).
- `api/v1/actual_billed.py`: manual-entry endpoint accepts optional `pool_id`, verifies it via
  the **org-scoped (RLS) client** matched on `(id, property_id)` of the already-org-verified
  property (blocks cross-org/cross-property attach) BEFORE the service-role insert, stores and
  echoes it; upload path stays NULL (parser has no pool concept); GET surfaces `pool_id` via
  `select(*)`. Comparison engine UNCHANGED (no Slice-2 consumption leaked in).
- 4 new tests (null-default, pool round-trip with explicit positive stub, unknown-pool 404 with
  `admin.table.assert_not_called()`). Mocks confined to the Supabase boundary.
- Two-stage review (two parallel general-purpose agents): spec-compliance **COMPLIANT** + code-
  quality **APPROVE**, NITs only; applied the round-trip-test explicit-stub NIT.
- Verified: full parallel gate **6757 passed, 95.26% cov** (`-n 12 --dist loadscope`),
  black/isort/ruff clean. Merged → `master` locally (`--no-ff`), pushed origin. No PR (rule 12a).
- NEXT FOCUS — B1.5b-S2: surface the per-pool tenant-share allocation-rule decision to the user
  (AskUserQuestion), then correct-side snapshot enrichment + engine wire-up, preserving the
  no-pool-data byte-for-byte invariant.

### 2026-06-02 — Session 7 — B1.5b-S2a/S2b (per-pool allocator + produce-engine wire-up)
- Decision (user answered "not sure, research please"): researched and chose **Option B —
  LAYER-FAITHFUL** (full rationale in ROADMAP decision log, 2026-06-02). Redistribute the aggregate
  tenant-share scalars back onto expense pools; cap reduction attributed to **cap-eligible
  (controllable) pools only** (tax/insurance/capital cap-exempt by default, lease-overridable via
  `cap_excluded_pools`); admin fee to **fee-eligible pools only**; per-pool sums reconcile EXACTLY
  to the cent via largest-remainder rounding. Pure deterministic Python, no LLM.
- **S2a** (worktree `feature/finops-pool-allocation-s2`): new `calculation/pool_allocation.py` —
  `PoolRecovery` model + `allocate_pool_recoveries(...)` (3-layer: weight by clamped recoverable
  basis → attribute cap to controllable pools → attribute admin fee to fee-eligible pools; `[]` on
  no/zero pools). TDD. Reviewed APPROVE. Merged to `master` (fast-forward via temp worktree).
- **S2b** (same effort): wired into `tenant_share.py` — builds `recoverable_by_pool`, adds the
  **safe-withholding gate** (`if recoverable_by_pool and (cap_reduction == 0 or
  classification_available)`; the `elif` logs a "Skip per-pool allocation" trace step), returns
  `pool_breakdowns: list[PoolRecovery]` on `TenantShareResult`. Orchestrator passes `pool_types`
  from the lease pool summaries into `TenantShareInput`. Reviewed APPROVE. Merged to `master`.
- Verified S2a/S2b on the merged result: full parallel gate **6770 passed, 95.26% cov, exit 0**
  (`-n 12 --dist loadscope`); review APPROVE (no CRITICAL, all 3 contracts hold).

### 2026-06-02 — Session 8 — B1.5b-S2c (persist + surface correct-side breakdowns → Module A done)
- Worktree `feature/finops-pool-persist-s2c` (off `master` `dce3687a`). Scoped conservatively to
  the PRODUCE side only; deferred bidirectional Compare to a new **S2d** because activating pool
  mode with only the correct side wired would emit misleading all-undercharge output and break the
  byte-identical invariant.
- Migration-first: `supabase/migrations/20260602000000_add_pool_breakdowns_to_snapshots.sql` adds
  a NULLABLE `pool_breakdowns JSONB` to `reconciliation_snapshots` (NULL = aggregate-only snapshot,
  distinct from `[]`). Applied + verified against the local Supabase Docker DB before writing
  dependent code (`pool_breakdowns|jsonb|YES`).
- Engine: `pool_breakdowns: list[PoolRecovery] = Field(default_factory=list)` on
  `TenantReconciliation`, threaded from `tenant_result.pool_breakdowns` (orchestrator).
- Persistence: `reconciliation_snapshot.py` gained `pool_breakdowns: list[dict[str, Any]] | None`
  on BOTH the read model and `ReconciliationSnapshotCreate`. **Stored as `list[dict]`, not typed
  `PoolRecovery`** — matches the existing `calculation_trace`/`lease_terms_snapshot` JSONB
  convention AND avoids a real circular import (models → `services.calculation.__init__` →
  `trace_persistence`/`orchestrator` → models). Writer (`reconciliation.py`) maps the engine's `[]`
  → DB NULL via `[pool.model_dump() for pool in getattr(tenant_result, "pool_breakdowns", [])] or
  None` (the `getattr` mirrors the sibling `lease_terms_snapshot=getattr(...)` so SimpleNamespace
  test stubs without the attr don't raise). Read-back is automatic via `select(*)` +
  `ReconciliationSnapshot(**row)`.
- TDD: 4 snapshot tests (`TestSnapshotPoolBreakdowns`: read-model None default, populated round-trip,
  Create None default, `model_dump(mode="json")` Decimal→string + reconstruct-from-JSONB) + 1
  end-to-end orchestrator test (per-pool split threads onto `TenantReconciliation` and reconciles
  EXACTLY to `total_recovery`, names preserved).
- First full gate surfaced 3 pre-existing background-job tests failing because their
  `SimpleNamespace` `tenant_result` stubs have no `pool_breakdowns` attr — fixed with the `getattr`
  default above (not a test hack; the writer must tolerate stub/partial results just as it already
  does for `lease_terms_snapshot`/`term_version_id`).
- Verified: full parallel gate **6776 passed, 95.26% cov, 5m11s** (`-n 12 --dist loadscope`);
  mypy clean on impacted modules; black/isort/ruff clean.
- Docs: updated `docs/feature-inventory/calculation-engine.md` (+ `INDEX.md` date bump) for the
  marketing-context-drift hook; recorded the Option B decision + S2a/b/c/d slice rows in ROADMAP.
- NEXT FOCUS — merge S2c → `master` locally (no PR, rule 12a), then **B1.5b-S2d** (bidirectional
  per-pool Compare; see NEXT ACTION).

### 2026-06-02 — Session 9 — B1.5b-S2d (bidirectional per-pool Compare → Module B done)
- Goal: activate per-pool comparison end-to-end in `comparison/engine.py`, preserving the
  byte-for-byte-identical invariant whenever pool data is missing on either side. Worktree
  `feature/finops-pool-compare-s2d` off `master` (S2c, 95f1778c). No migration —
  `actual_billed_amounts.pool_id` (S1), `reconciliation_snapshots.pool_breakdowns` (S2b), and
  `comparison_findings.pool_breakdowns` (B1.5a/B1.6) all already exist. Confirmed the engine/model/
  persistence plumbing (`PoolVariance`, `TenantVariance.pool_breakdowns`, `_build_pool_breakdowns`,
  `build_comparison_result` pool kwargs, findings round-trip) was pre-built in B1.5a — so S2d was a
  SINGLE-FILE change to `engine.py` (loaders + callers) + tests.
- Implementation (`engine.py`): added `pool_id` to `ExplicitCharge` (optional, backward-compatible,
  auto-extends the API `ExplicitChargesRequest`); `_extract_correct_pools` (snapshot
  `pool_breakdowns` JSONB → `{pool_name: total_recovery}`, Decimal via `Decimal(str(...))`);
  `_load_correct_by_lease` now also returns `correct_pools_by_lease` (lease_id → {pool_name: amt});
  `_load_pool_names` (`expense_pools.select(id,name).eq(property_id)` → `{id: name}`);
  `_load_charged_rows` / `_normalize_explicit_charges` now also build `charged_pools_by_name`
  (name → {pool_id: amt}) from rows/charges carrying a non-null `pool_id`;
  `_rekey_charged_pools_to_leases` (cleanly-paired-only: mirrors the duplicate-name combine predicate,
  only `len==1`, non-combined names get `{lease_id: {pool_id: amt}}`); `_build_pool_dimension`
  (resolves correct name→id via `expense_pools`, drops unresolvable names, restricts to the
  INTERSECTION of leases with pool data on BOTH sides, returns None when empty). Both
  `compare_charges` and `compare_explicit_charges` wire these, guarded by
  `if correct_pools_by_lease and charged_pools_by_lease:` so the `expense_pools` query is SKIPPED
  entirely when pool mode can't activate (no wasted round-trip; result byte-identical).
- Key correctness decisions: **intersection gate** prevents fabricating an all-over/all-undercharge
  breakdown for a one-sided lease; **cleanly-paired-only** keeps duplicate/unmatched/blank names at
  the tenant-total level; an unresolved correct-side pool name is dropped from the pool view but kept
  in the tenant total (total comes from `total_recovery`, independent of pool resolution); the
  `expense_pools` `UNIQUE(property_id, name)` constraint makes the name→id inversion genuinely 1:1.
- Tests: new `TestPerPoolCompare` (6 tests) — happy-path populated breakdown (`compare_charges`);
  charged side without `pool_id` → pool mode OFF; duplicate name → no breakdown; unresolvable pool
  name dropped from view only; explicit-charge `pool_id` path; mixed-population (one lease qualifies,
  another aggregate-only → empty list, not fabricated breakdown). Existing 63 comparison tests
  unchanged and green (the mock `_table_fn` serves the new `expense_pools`/`pool_id` queries; unknown
  tables return `[]` → gate returns None → byte-identical).
- Review: one general-purpose review agent — **approved, no blockers**. Applied 2 NITs: (1) skip the
  `expense_pools` lookup when either side lacks pool data; (2) added the mixed-population test.
- Verified: full parallel gate **6778 passed, 95.22% cov, 3m30s** (`-n 12 --dist loadscope`); mypy
  clean on `comparison/`; black/isort/ruff clean. CRLF churn on `expected_grossup_basic.json`
  restored, never staged (rule 9). Staged only the 2 changed files + these docs.
- NEXT FOCUS — merge S2d → `master` locally (no PR, rule 12a). Phase 1 backend correctness core
  (Produce + Compare) is COMPLETE. Next: **Phase 2** frontend comparison UI (per-tenant + per-pool
  signed variances, pills), then **Phase 3** copy reframe (humanizer + third-grade-copy).

### 2026-06-02 — Session 10 — Phase 2 (frontend Module B Compare UI → Phase 2 done)
- Built the user-facing Module B surface on worktree `feature/module-b-compare-ui` off `master`
  (S2d, `25a32aac`). The generated API client is stale legacy (`@hey-api/client-fetch`); regenerating
  is an out-of-scope repo-wide migration, so hand-authored `frontend/src/api/comparison.ts` mirroring
  the legacy `{ data, error }` call convention (typed: `VarianceDirection`, `PoolVariance`,
  `TenantVariance`, `ComparisonResult`, `ExplicitCharge`, persist/run request + summary types; funcs
  `getComparison`/`compareExplicitCharges`/`createComparisonRun`/`listComparisonRuns`/`getComparisonRun`).
- Feature module `frontend/src/features/comparison/`: React Query hooks (`useComparison.ts` —
  `useRunComparison` mutation routes to the explicit-charges POST when `charges !== undefined` else the
  default GET; `useSaveComparisonRun` invalidates the runs query; `useComparisonRuns`/`useComparisonRun`
  queries; all surface `ApiError`); pure display helpers (`utils/variance.ts` — direction label/badge/
  color, `signedMoney`, `formatVariancePct`, NO money math); components `ComparisonSummary`,
  `TenantVarianceTable` (expandable per-pool rows, `aria-expanded`), `ExplicitChargesEditor`
  (`draftsToCharges`). Page `pages/comparison/ComparePage.tsx`; route `/compare` registered in
  `App.tsx` (ProtectedRoute); nav entry "Compare systems" under Analysis (`config/navigation.ts`).
- `exactOptionalPropertyTypes: true` handled via conditional spreads + index signatures on request
  bodies. Money displayed from backend Decimal strings only. Buttons/toggles are pills (design canon).
- Mandatory copy gate: ran `humanizer` + `third-grade-copy` over the user-facing strings (only fix
  needed was an en-dash → "to"; domain terms reconciliation/GL/expense pool kept).
- Review: general-purpose review agent over the diff — **no blockers**, two real bugs fixed:
  (1) `signedMoney`/`formatVariancePct` dropped the leading "+" for sub-dollar/sub-1% positives
  (leading-digit regex never matched `0.50`/`0.5%`) → now positive iff any non-zero digit and not
  negative; (2) `ComparePage` only cleared the shown result on property/source change → now clears on
  any run input (period, include-drafts, manual charges) so a saved audit run always matches the
  inputs on screen. Added regression tests for both.
- Verified on merged `master`: full frontend suite **6122 passed** (`npm test`), typecheck / lint /
  format / `npm run build` all clean. Merged `feature/module-b-compare-ui` → `master` locally
  (`--no-ff`, commits `ca4c5788` + review-fix `1ee4b2b4`), pushed origin (`9b3b72b7`), removed the
  worktree and deleted the branch. No PR (rule 12a). Updated `docs/feature-inventory/calculation-engine.md`
  + `INDEX.md` for the marketing-context-drift hook.
- NEXT FOCUS — **Phase 3**: marketing/user-facing copy reframe to CRE FinOps correctness (charge the
  right amount / verify other systems, not "recover money"), gated by `humanizer` + `third-grade-copy`.
  Then **Phase 4** review/fix loops until nothing remains.

### 2026-06-02 — Session 11 — Phase 3 (marketing copy reframe → Phase 3 done) + workflow change
- Reframed the four highest-visibility marketing surfaces on worktree `feature/finops-copy-reframe`
  off `master`: `HeroSection` (H1 "Bill CAM correctly before statements go to tenants"; subhead names
  over-billed AND under-billed), `ValuePropositionSection` (card 3 "Check what your other system
  billed" surfaces Module B Compare; card 2 retitled "Use deterministic math for recoveries" →
  "Get every CAM number right" so the trio reads in one correctness voice), `CTASection` (subhead
  "where you under-billed and where you over-billed"), `PricingContent` (H1 "Priced for the cost of
  one CAM error"). Scoped to these surfaces to avoid churning ~200 SEO MDX files + snapshots this pass.
- Every changed string validated through the `third-grade-copy` evaluator (headlines <=8 words, leads
  with outcome; sentences <=14 words; no semicolons/em/en dashes) and humanizer principles. Domain
  terms kept: "CAM", "GL", "recovery terms" (the CRE lease-clause noun, not "recover money" framing).
- Two commits on the branch: `f6593510` (4 sources + 6 test files) and `b3e865aa` (card-2 consistency
  fix from the inline review NIT). Updated 6 test files in BOTH parallel paths
  (`landing/X.test.tsx` and `landing/__tests__/X.test.tsx`) to match the new copy; fixed a
  `getByText` multi-match in `LandingPageClient.test.tsx` by asserting hero-unique copy.
- Inline review (one review agent — then retired per the workflow change below): verdict APPROVE,
  no BLOCKER/SHOULD-FIX, framing/tests/gates/positioning all clean; applied its one consistency NIT.
- **Workflow change (user directive):** the sub-agent review/fan-out workflow was triggering rate
  limits. Retired it for this goal — goal work now proceeds INLINE. Confirmed there is no scheduled
  task, cron job, or Stop hook artifact to delete (checked `scheduled-tasks`, `CronList`, all
  settings files); the cost was the review-agent pattern itself.
- Verified on merged `master`: marketing gate **573 passed** (`npm test`), `npm run typecheck` clean,
  `npm run format` clean, `npm run lint:fix` 0 errors (3 pre-existing unrelated unsubscribe-page
  warnings). Merged `feature/finops-copy-reframe` → `master` locally (`--no-ff`, `b2acdd75`), pushed
  origin, removed worktree, deleted branch. No PR (rule 12a).
- NEXT FOCUS — **Phase 4**: inline review/fix sweep for any remaining recover/recovery/leakage outcome
  framing in user-facing copy (marketing MDX/metadata/structured-data + frontend selling copy +
  in-app `/compare`), gated by humanizer + third-grade-copy, local-merge per fix, until a full sweep
  finds nothing left.
