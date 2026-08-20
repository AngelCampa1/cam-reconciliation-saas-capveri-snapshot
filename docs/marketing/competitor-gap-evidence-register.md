# Competitor Gap Evidence Register

Last updated: 2026-04-28

This register keeps competitor claims traceable before they appear on comparison, alternatives, switch, or sales enablement pages.

## Evidence Rules

- Use public review pages and official vendor pages for claims.
- Prefer dated, visible review excerpts over summaries when available.
- Do not cite exact competitor pricing, implementation time, or support SLAs unless a source supports the wording.
- Recheck public review pages quarterly or when a prospect mentions a competitor change.

## Current Sources

| Competitor | Source | Checked | Safe wording |
|---|---|---:|---|
| Yardi Voyager | G2 Yardi Voyager reviews | 2026-04-28 | Review themes include learning difficulty, interface complexity, and poor support mentions. Position CapVeri as a focused verification layer, not a Yardi replacement. |
| MRI Property Management | G2 MRI Property Management reviews | 2026-04-28 | Review themes include reporting complexity, report discovery friction, support delays, and configuration dependence. Position CapVeri around finance-first CAM proof and traceable exceptions. |
| AppFolio Property Manager | G2 AppFolio reviews | 2026-04-28 | AppFolio is praised for ease of use and centralized operations, while some reviewers mention limited reporting/customization. Position CapVeri as a commercial CAM add-on, not a full PM replacement. |
| RealPage Commercial | RealPage commercial property management pages and G2 RealPage reviews | 2026-04-28 | RealPage publicly claims commercial CAM recovery capabilities. Review material includes support handoff/friction signals. Position CapVeri as independent CAM verification for RealPage exports. |

## Product Proof Mapping

| Competitor gap | App proof point | Marketing proof point |
|---|---|---|
| Setup burden | Onboarding now states the first useful output: leakage and variance preview after billed amounts upload. | Switch pages describe export, upload, lease-term confirmation, exception review, and packet export. |
| Support friction | Calculation trace drawer now includes support context for disputed number escalation. | Alternatives pages emphasize specialist CAM verification rather than generic full-suite support. |
| Reporting friction | Calculation trace keeps tenant, pool, steps, and final amount visible in one drawer. | RealPage/Yardi/MRI copy points users to sample report, integrations, and setup guides. |
| Need for independent proof | Deterministic trace and immutable snapshots remain core app proof. | Messaging uses "independent verification layer" and avoids full ERP replacement framing. |
| Pricing confusion | Competitor data now uses Reconcile, Control, Defend, and Enterprise packaging. | Old Growth pricing is covered by a regression test. |

## Refresh Checklist

- Review G2 pages for Yardi, MRI, AppFolio, and RealPage.
- Review official vendor pages for product-scope changes.
- Update `marketing/data/alternatives.json`, `marketing/data/comparisons.json`, and `marketing/data/switch.json`.
- Run `npm test -- competitor-gap-content.test.ts` in `marketing/`.
- If links change, run route integrity tests and sitemap tests.
