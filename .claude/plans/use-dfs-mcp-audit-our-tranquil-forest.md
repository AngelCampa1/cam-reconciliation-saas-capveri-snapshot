# SEO Audit + 100 New High-Quality Pages (DataForSEO MCP)

## Context

Capveri / camaudit.io already has a substantial programmatic SEO footprint in `marketing/` (Next.js App Router):

- **75 blog MDX posts** in `marketing/content/blog/`
- **101 resource MDX posts** in `marketing/content/resources/`
- **20+ JSON-driven programmatic clusters** in `marketing/data/`: alternatives (6), boma-topics (12), expenses (15), integrations (4), lease-clauses (20), metros (43), property-types (18), solutions (5), states (50), switch (3), plus glossary-terms, comparisons (`/vs/[slug]`), software (`/resources/software/[product]/cam-setup`), lease-types, roles, workflows, calendar, calculations, cam-dispute, templates
- **23 interactive `/tools/*` pages**, sitemap.ts, robots.ts, JSON-LD via `src/lib/structured-data.ts`, OG image generation at `/api/og`, governance file at `data/seo/content-governance.json` already DEMOTING low-value pages

The user wants to (a) **audit the SEO baseline** with `dfs-mcp`, (b) **find competitor gaps**, then (c) **publish 100 brand-new, non-duplicative, high-quality pages** that follow our AI-SEO/funnel/humanizer playbook and pass sub-agent review. Goal: net-new high-intent organic surface area for both `capveri.com` (CRE FinOps) and `camaudit.io` (CAM-audit niche), without cannibalizing existing URLs.

Constraints from CLAUDE.md and memory:
- Worktree-isolated work, two-stage review, no AI slop, run humanizer.
- Keyword split: capveri.com = CRE FinOps platform terms; camaudit.io = CAM-audit/charges niche.
- Marketing site lives in `marketing/`; deploys to Vercel on push to `master` when `marketing/` changes.

---

## Phase 1 — Baseline SEO audit (dfs-mcp, READ-only)

Goal: understand what's already ranking, what's indexed but underperforming, and which existing URLs to either improve or *avoid duplicating*. Output: `docs/seo/2026-04-audit/baseline.md`.

For BOTH `capveri.com` and `camaudit.io`, US English (`location_code: 2840`, `language_code: "en"`):

1. `mcp__dfs-mcp__dataforseo_labs_google_domain_rank_overview` — health snapshot.
2. `mcp__dfs-mcp__dataforseo_labs_google_ranked_keywords` (top 1000 by traffic) — current ranking universe.
3. `mcp__dfs-mcp__dataforseo_labs_google_relevant_pages` — top URLs by est. traffic.
4. `mcp__dfs-mcp__dataforseo_labs_google_keywords_for_site` — Ads-side keyword inventory.
5. `mcp__dfs-mcp__on_page_instant_pages` on top 10 URLs per domain — Core Web Vitals + on-page issues.
6. `mcp__dfs-mcp__on_page_content_parsing` on top 5 URLs — extract H1/H2/structured data for AI-SEO gap.
7. `mcp__dfs-mcp__ai_optimization_llm_response` (or `ai_opt_llm_ment_search`) for top 20 commercial queries — AI-Overview / LLM citation baseline.

Cross-reference results against existing slugs (compiled from `find marketing/src/app -name page.tsx` + `marketing/content/{blog,resources}/*.mdx` + `marketing/data/*.json`) and the demoted-slug lists in `data/seo/content-governance.json` so we don't pitch slugs the team already killed.

## Phase 2 — Competitor + gap analysis

1. Seed list (CAM/CRE-FinOps): `cam reconciliation`, `cam audit`, `cam charges`, `cam reconciliation software`, `lease audit`, `cre finops`, `commercial lease accounting`, `gross-up cam`, `boma 2024`, `tenant recovery audit`.
2. `mcp__dfs-mcp__serp_organic_live_advanced` for each seed → harvest *real* top-10 domains (don't assume Leasecake/Visual Lease/Trullion/Occupier/Lucernex/Yardi).
3. `mcp__dfs-mcp__dataforseo_labs_google_competitors_domain` on both our domains → confirmed competitor set.
4. For each competitor: `dataforseo_labs_google_ranked_keywords` (top 500 by traffic) → union, subtract our ranked set = **raw gap list**.
5. `dataforseo_labs_google_domain_intersection` (us vs each competitor) for pairwise diffs.
6. `dataforseo_labs_google_relevant_pages` per competitor → identify the *page archetypes* they win with (e.g. "[city] CAM laws", "CAM clause [n] explained", role-based playbooks).

## Phase 3 — Keyword expansion + clustering (target 100 net-new pages)

1. Feed gap list + seeds into `dataforseo_labs_google_keyword_suggestions` and `keyword_ideas` and `related_keywords`.
2. Score with `dataforseo_labs_bulk_keyword_difficulty` + `kw_data_google_ads_search_volume` (or `ai_optimization_keyword_data_search_volume`) + `bulk_traffic_estimation`.
3. Filter:
   - Min volume 50/mo OR clearly commercial.
   - KD ≤ 35 (or higher if SERP is weak/AI-Overview present).
   - **Exclude any keyword where existing slug already targets it** — diff against existing-slug map.
4. `serp_organic_live_advanced` on the 150 finalists to read intent, AI-Overview, PAA, featured snippet → cluster by SERP overlap into pillar/supporting groups.
5. `dataforseo_labs_search_intent` to tag funnel stage (TOFU informational / MOFU comparison / BOFU commercial).

Output: `docs/seo/2026-04-audit/keyword-map.md` — 100 finalist topics, each row: { target keyword, secondary KWs, intent, funnel stage, target URL, target domain (capveri vs camaudit), KD, volume, AI-Overview Y/N, primary competitor, content type }.

## Phase 4 — Content production (100 net-new pages, capveri.com only, MDX only)

Per user decisions: **100 hand-authored MDX pages on capveri.com, zero programmatic JSON additions, zero camaudit.io pages this round.**

Page-type mix (tune after Phase 3 SERP read; all live in `marketing/content/`):

| # | Type | Path | Funnel |
|---|---|---|---|
| 50 | Blog posts — thought leadership, opinion, market commentary, original analysis | `marketing/content/blog/*.mdx` | TOFU/MOFU |
| 50 | Resource posts — deep how-tos, playbooks, calculation walkthroughs, role-based guides, scenario explainers | `marketing/content/resources/*.mdx` | MOFU/BOFU |

All new MDX is auto-picked up by `getAllPosts()` in `marketing/src/lib/content/mdx.ts` and flows into `sitemap.ts` automatically — no JSON or `[slug]` route work needed.

### Quality bar (every page)

Apply `ai-seo` skill conventions:
- One primary keyword in `<title>`, H1, first 100 words, slug.
- ≥3 secondary keywords from `keyword-map.md`.
- Direct-answer paragraph in first 80 words (AI-Overview / featured-snippet bait).
- Short FAQ block answering 3–5 PAA questions verbatim — wired into `FAQPage` JSON-LD via `src/lib/structured-data.ts`.
- Article/HowTo/Product schema as appropriate.
- Internal links: ≥5 contextual links to existing pillar pages (`cam-reconciliation-guide`, relevant `/tools/*`, related glossary/resources).
- ≥1 link from an existing high-authority page back to the new page.
- Original data, calculator embeds, screenshots, or worked examples — no thin paraphrase.
- Canonical, OG image via existing `/api/og`, `dateModified` populated, `LAST_MODIFIED_BY_ROUTE` updated when needed.
- All MDX pages registered in `marketing/src/app/sitemap.ts` automatically via `getAllPosts()`; programmatic JSON additions auto-flow.

### Funnel coverage (enforce in keyword-map)

- ~40 TOFU (definitions, "what is X", problem-aware blog/resources)
- ~40 MOFU (how-to, comparisons, calculators+context, role/persona playbooks)
- ~20 BOFU (alternatives, switch, vs, "best X 2026", pricing-adjacent)

## Phase 5 — Sub-agent execution workflow

Per `superpowers:using-git-worktrees`, `dispatching-parallel-agents`, `executing-plans`:

1. Create worktree `feature/seo-100-pages` via `scripts/new-worktree.ps1`.
2. Drop the keyword map into a tracker file (`docs/seo/2026-04-audit/production-tracker.md`) with one row per page.
3. Dispatch in batches of ~10 parallel `general-purpose` agents. Each agent receives:
   - Target keyword + cluster row from `keyword-map.md`
   - Page archetype + path
   - Brand voice + `ai-seo` + funnel-stage + schema-markup requirements
   - Hard rule: invoke `humanizer` (or `marketing-skills:humanizer`) on the draft before saving
   - Hard rule: cite ≥3 authoritative sources, original examples only — no fabricated stats
4. After each batch, dispatch a `superpowers:code-reviewer` (or `content-quality` skill) sub-agent to grade the batch on: factual accuracy, slop signals, SEO checklist compliance, internal-link density, schema validity. Reject + regenerate any page below bar.
5. Update `LAST_MODIFIED_BY_ROUTE` and `data/seo/content-governance.json` retain-lists for new programmatic slugs.
6. Validate: `cd marketing && npm run typecheck && npm run lint && npm run build` (must pass).
7. Inspect generated sitemap by `curl http://localhost:3000/sitemap.xml` from `npm run dev`.
8. Spot-check 10 random pages with `mcp__dfs-mcp__on_page_content_parsing` once deployed.

## Phase 6 — Merge + post-launch

- `superpowers:requesting-code-review` on the worktree branch — fix everything reviewer flags.
- `superpowers:finishing-a-development-branch` to merge to master.
- Push master → Vercel auto-deploys.
- Submit updated sitemap in GSC via `mcp__gsc__submit_sitemap`.
- Schedule a 14-day check: `mcp__dfs-mcp__dataforseo_labs_google_ranked_keywords` on the 100 new URLs to track first-page entries.

---

## Critical files to modify

- `marketing/content/blog/*.mdx` — 50 new posts
- `marketing/content/resources/*.mdx` — 50 new posts
- `docs/seo/2026-04-audit/{baseline.md, keyword-map.md, production-tracker.md}` — audit + production artifacts

(No JSON cluster edits, no `[slug]` route changes, no governance file edits this round.)

## Existing utilities to reuse (do NOT rebuild)

- `marketing/src/lib/content/mdx.ts` — `getAllPosts(collection)` auto-includes new MDX in sitemap
- `marketing/src/lib/content/pseo-data.ts` — `getAllAlternatives/Comparisons/Glossary/Integrations/Solutions/Software/SwitchGuides`
- `marketing/src/lib/structured-data.ts` — JSON-LD helpers
- `marketing/src/lib/seo/meta-templates.ts` — metadata templates
- `marketing/src/lib/seo/content-governance.ts` — retain/demote filters
- `marketing/src/app/api/og/` — OG image generation

## Verification

1. `cd marketing && npm run typecheck` — passes
2. `cd marketing && npm run lint` — passes
3. `cd marketing && npm run build` — passes; sitemap.xml renders all 100 new URLs
4. `cd marketing && npm test` — existing tests still green
5. Manual: `npm run dev`, click through 5 random new pages — links work, OG images render, schema valid (paste into Google's Rich Results test).
6. Post-deploy: spot-check via `mcp__dfs-mcp__on_page_instant_pages` on 5 production URLs (Lighthouse ≥85).
7. 14-day post-launch: `dataforseo_labs_google_ranked_keywords` on the 100 URLs — at least 30% indexed and ranking somewhere in top 100.

## Decisions locked in

- Domain: 100% capveri.com (camaudit.io skipped this round)
- Format: 100% hand-authored MDX (no programmatic JSON additions)
- DFS budget: standard ~200–300 paid calls across Phase 1–3
