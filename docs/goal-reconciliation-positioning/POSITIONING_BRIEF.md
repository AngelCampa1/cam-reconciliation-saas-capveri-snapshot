# Repositioning: CAM Reconciliation First

**Goal (set 2026-06-08):** Make **CAM reconciliation** CapVeri's primary positioning and primary flow — in both the marketing site and the authenticated app. CapVeri *runs and delivers* CAM reconciliations. It is **not** positioned as a "CAM audit," "CAM recovery," "overcharge-catcher," or "leakage-finder" tool.

This is the source of truth for every sub-agent on this effort. Read it before editing copy.

---

## The one-sentence positioning

> **CapVeri runs your CAM reconciliations and delivers tenant-ready statements you can stand behind.**

The product *does the reconciliation*. The deliverable is a **complete, accurate, defensible reconciliation statement** — produced from the files you already export (GL, rent roll, billed amounts, leases), without a new integration.

## What changes (framing shift)

| FROM (retire) | TO (lead with) |
|---|---|
| "Audit one property free" / "free audit" | "Reconcile your first property free" / "Run a reconciliation free" |
| "CAM audit software" as the product | "CAM reconciliation software" as the product |
| "Find/catch billing errors", "catch overcharges" | "Reconcile correctly the first time", "get every charge right" |
| "Recovery opportunity" as the headline metric | "Reconciliation" as the deliverable; recovered/correct dollars are a *result*, not the pitch |
| "You're leaving money on the table" (payoff) | "Your reconciliation is ready to review and send" (payoff) |
| "Leakage result" | "Reconciliation result / draft reconciliation" |
| "Calculate" (primary button) | "Run reconciliation" |
| "Finalize" | "Finalize & deliver" (or "Finalize reconciliation") |

## What stays true (don't overcorrect)

- The math is real: under-billing and over-billing ARE surfaced **inside** the reconciliation. That's fine — it's an *output* of reconciling correctly, framed as accuracy, not as the product's purpose. Don't delete the numbers; demote them from headline to supporting detail.
- Landlord/PM-side. CapVeri PERFORMS reconciliation for the landlord. (See memory `project-positioning-landlord-side`.) Not tenant-side.
- "Audit-ready" / "defensible" / "stands up to a tenant audit" is an acceptable BENEFIT phrase — it describes the quality of the reconciliation. The product is still reconciliation; surviving an audit is a *result*.
- Anti-integration / "works from a file you export" stays. (Never use the internal "Anti-Integration" codename in public copy — CLAUDE.md gate.)

## Hard rules for this effort

1. **Marketing copy MUST pass the writing gates** before commit (CLAUDE.md): run the `humanizer` skill, then `third-grade-copy`, then `node scripts/marketing-copy-gate.mjs` (exit 0). No internal jargon.
2. Buttons are pills (design canon). Don't change geometry.
3. Don't delete ranking SEO pages. Reframe them reconciliation-first while retaining keyword capture (audit/overcharge pages keep their URL + target term but present reconciliation as THE product and the audit term as the search intent they answer). **DECISION PENDING USER CONFIRMATION — default = reframe, not delete.**
4. Scope quality checks to impacted projects. `frontend/` → `npm test` + `npm run typecheck`. `marketing/` → `npm run typecheck` + copy gate.
5. Multiple review/fix cycles required until nothing is left.

## Workstreams

- **A — Marketing primary surface:** homepage hero, CTA sections, value props, nav CTA, pricing, `/best/cam-reconciliation-software`. (`marketing/src/components/landing/**`, nav, pricing)
- **B — Marketing SEO/long-tail:** `/cam-audit*`, `/commercial-lease-audit-software`, `/cam-charges`, tools (`/tools/*overcharge*`, `recovery-gap-analyzer`, etc.), resources, `product-features.ts`, `public-knowledge.ts`. Reframe, keep keywords.
- **C — App activation flows:** onboarding wizard + PLG wizard (results steps, upload prompts, step labels). (`frontend/src/features/onboarding/**`, `frontend/src/features/plg/**`)
- **D — App core flow & nav:** dashboard hero/cards, reconciliation workflow buttons (Calculate→Run reconciliation), Finalize, FreeAuditUpgradeModal, sidebar, empty states. (`frontend/src/pages/**`, `frontend/src/features/reconciliation/**`, `frontend/src/components/**`, `frontend/src/config/navigation.ts`)

## Progress

See `PROGRESS.md` in this folder.
