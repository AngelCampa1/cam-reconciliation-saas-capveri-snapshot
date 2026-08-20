# Goal: New List Price Rollout (2026-06-01)

Replace every reference to old CapVeri pricing with new list prices. Stripe already updated. **Use 80OFF, recompute** discounted prices from new base.

## Price mapping

| Tier | OLD list /mo | NEW list /mo | OLD list /yr | NEW list /yr |
|---|---|---|---|---|
| Reconcile | $199 | **$699** | $1,980 | **$4,990** |
| Control | $499 | **$1,749** | $4,980 | **$4,990** |
| Defend | $999 | **$3,499** | $9,948 | **$4,990** |

80OFF = first annual invoice at 20% of list:

| Tier | OLD offer /mo | NEW first year | OLD offer /yr | NEW first year | OLD /mo-equiv | NEW /mo-equiv |
|---|---|---|---|---|---|---|
| Reconcile | $100 | **$998/yr** | $990 | **$998** | $83 | **$117** |
| Control | $250 | **$998/yr** | $2,490 | **$998** | $208 | **$292** |
| Defend | $500 | **$998/yr** | $4,974 | **$998** | $415 | **$583** |

## Generation chain (DO NOT hand-edit generated outputs)

- Tier-1 sources: `plan-tiers.json`, `knowledge/source/product.ts` (landing-pricing FAQ), `marketing/data/seo/llms-sections.json`
- `scripts/generate-public-knowledge.mjs` -> knowledge/generated/public-knowledge.{json,ts}, frontend+marketing src/generated/public-knowledge.ts
- `scripts/generate-plan-tiers.mjs` -> frontend+marketing src/generated/plan-tiers.ts, backend generated_plan_tiers.py
- `marketing/scripts/generate-llms.mjs` -> marketing/public/{llms.txt,llms-full.txt,pricing.md,pricing.txt}

## Collision warning

`$100/$250/$500/month` also appear as NON-CapVeri example amounts (NNN rent, competitor tools). Only change references anchored by: tier name (Reconcile/Control/Defend), "80OFF", "list price", "self-serve package", or package monthly/annual context. NEVER touch example/competitor CAM dollar amounts.

## Progress log

- [done] Phase A: canonical core — plan-tiers.json + product.ts edited, 3 generators run, outputs verified.
- [done] Phase B: parallel sub-agent sweep (5 disjoint scopes):
  - backend: 4 files (test_plan_tier_matrix, test_plans, audit_results.html ROI divisor, email design e2e) — 358 tests pass.
  - frontend: 12 test/e2e files — 173 tests pass, typecheck clean.
  - marketing code: 7 test/e2e files + offering-consistency guard regex — full suite 571 pass, typecheck clean.
  - marketing content: 0 changes (all CapVeri pricing is abstract / points to pricing page).
  - docs/brochure/skills: ~20 files (product-marketing-context, billing-subscriptions, system-architecture, brochure HTML, GTM listings, testing docs, .codex) — re-grep clean.
- Ambiguous-left flagged for orchestrator review:
  - build_claim_audit.py Growth-tier exclusion regex ($99/$990/Growth/$2-unit) — RETIRED legacy model, not in mapping. Verify retired, leave.
  - business-case-cam-software.mdx:97 "Validation-only (CapVeri) | $4,000-$10,000" — TCO range, not a package price. Leave.
- [in progress] Phase C: verification + review cycles.
