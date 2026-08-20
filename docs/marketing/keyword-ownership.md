# Keyword Ownership: capveri.com vs camaudit.io

Last updated: 2026-04-17
**Decision: Option B implemented 2026-04-17** — differentiate by intent within capveri.com (no redirects, no domain moves)

## The Problem

Two domains — capveri.com and camaudit.io — currently target overlapping CAM-related queries. Google sees both as competing for the same intent and splits PageRank between them. This is known as domain cannibalization and actively hurts both domains.

## Decision Framework

Split ownership by **search intent**, not just keywords:

| Intent type | Owns it | Signal words |
|-------------|---------|--------------|
| **Software/platform** — "I want a tool to run reconciliations" | capveri.com | software, platform, automate, detect, calculate |
| **Audit/service** — "I want to understand CAM or audit a statement" | camaudit.io | audit, guide, what is, how to, checklist, dispute |

## Current Ownership Map

### capveri.com (platform intent)

| Page | Keyword | Intent | Status |
|------|---------|--------|--------|
| /cam-reconciliation-software | cam reconciliation software | platform | ✅ correct |
| /cam-reconciliation-guide | cam reconciliation guide | informational | ⚠️ at risk |
| /cam-charges | what are cam charges | informational | ⚠️ at risk |
| /cam-audit | cam audit | ambiguous | ⚠️ at risk |
| /vs/* | capveri vs [competitor] | comparison | ✅ correct |
| /tools/* | cam calculator, boma calculator | tool | ✅ correct |
| /pricing | capveri pricing | branded | ✅ correct |
| /resources/* | cam reconciliation how to | educational | ✅ correct (link to software) |

### camaudit.io (education/audit intent)

| Page | Keyword | Intent | Notes |
|------|---------|--------|-------|
| (TBD) | cam audit guide | educational | If camaudit.io covers this, remove /cam-audit from capveri.com |
| (TBD) | what are cam charges | informational | If camaudit.io covers this, redirect /cam-charges → camaudit.io or differentiate |

## ✅ Implemented: Option B

Changes shipped 2026-04-17 (commit `42200652`):

| Page | Before | After |
|------|--------|-------|
| `/cam-audit` | "CAM Audit: What It Is, How to Prepare" | "CAM Audit Software for Commercial Landlords" |
| `/cam-charges` | "What Are CAM Charges? Complete Guide" | "What Are CAM Charges? How to Calculate and Audit Them" |

Both pages keep their educational body content — only title, H1, hero subtitle, and Article schema headline were changed to signal platform/calculation intent rather than pure "what is" intent.

**Next step**: verify camaudit.io is not targeting the exact same reworded queries. If it is, either differentiate camaudit.io's copy or proceed to Option A.

---

## Recommended Actions (reference)

### Option A: Hard split (preferred for long-term authority)
- Move pure-education pages (/cam-audit as an audit-service page, /cam-charges) to camaudit.io
- 301 redirect from capveri.com → camaudit.io for those slugs
- All platform/software pages stay on capveri.com
- Internal links on camaudit.io point to capveri.com product pages with "Try the software" CTAs

### Option B: Differentiate by intent within capveri.com (acceptable short-term)
- Rename /cam-audit to "CAM Audit Software" — rewrite H1/meta to target "automate cam audit" not "what is cam audit"
- /cam-reconciliation-guide stays on capveri.com because it positions CapVeri as the expert and drives product CTAs
- /cam-charges rewritten to "How to Calculate CAM Charges" with a heavy product CTA
- Ensure camaudit.io pages don't overlap these same queries (check meta titles)

### Option C: 301 camaudit.io → capveri.com (nuclear, simple)
- Redirect the entire camaudit.io domain to capveri.com
- Consolidates all link equity into one domain
- Risk: lose any traffic camaudit.io currently ranks for independently

## Action Required

**Before any code changes**, audit camaudit.io current rankings to understand what it owns today. Use Search Console for camaudit.io or an Ahrefs/Semrush query.

Once the split is decided:
1. Update `marketing/src/app/sitemap.ts` LAST_MODIFIED_BY_ROUTE if pages are removed
2. Update `marketing/src/app/robots.ts` if pages move
3. Add redirects to `marketing/next.config.ts` if 301ing capveri.com pages to camaudit.io
4. Remove/update entries in `marketing/public/llms.txt` for any pages that move

## Related Files

- `marketing/src/app/sitemap.ts` — sitemap priority per route
- `marketing/src/lib/seo/content-governance.ts` — RETAINED_* slug lists
- `marketing/public/llms.txt` — AI training allowlist (update if pages move)
