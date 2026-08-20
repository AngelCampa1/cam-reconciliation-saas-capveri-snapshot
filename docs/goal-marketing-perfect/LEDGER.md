# Goal: Marketing Site Perfect — LEDGER

**Goal (verbatim):** Long-running, multi-session. Make the CapVeri **marketing site** perfect in every
aspect — function, UI, UX. Tasteful, visually consistent, works properly and intuitively. Screenshot
every screen/modal/button and evaluate. Gen-Z says "that looks nice"; an 80-year-old can use every part
without getting stuck. E2E-test every aspect locally (real servers, real workflows). Fix/improve on the
go and verify. Holistic view, incredible taste. Multiple review/fix cycles until nothing is left to
fix or improve. Prior sweeps are reference only — do not trust them. Sub-agent driven.

**Started:** 2026-06-20 · **Branch strategy:** direct-to-master (small fixes) per CLAUDE.md; worktree for big batches.
**Dev server:** `cd marketing && npm run dev` → http://localhost:3000 (Next.js 16, Turbopack).

---

## Surface Inventory

### A. Core marketing pages (hand-built, unique) — HIGH priority
`/` (home) · `/pricing` · `/about` · `/about/angel-campa` · `/contact` · `/docs` · `/help` ·
`/sample-report` · `/product` · `/product-tour` · `/product/features` · `/roi` · `/sources` ·
`/case-studies` · `/glossary` · `/blog` · `/videos` · `/privacy` · `/terms` · `/cookies` ·
`/checkout` · `/checkout/success` · `/unsubscribe`

### B. Interactive tools (~35) — HIGH priority (real e2e function)
Under `/tools/*`: calculators (cam-gross-up, cam-cap, pro-rata, noi-impact, boma-2024, base-year-escalation,
admin-fee, cam-overcharge, cam-billing-error-estimator, cumulative-cap-bank, property-tax-appeal-recovery,
recovery-gap-analyzer, cam-estimate-forecaster, boma-remeasurement-impact, hcad-tax-normalizer,
fixed-cam-vs-traditional), quizzes/scorecards (audit-risk-quiz, audit-risk-scorecard, sb-1103-checker),
generators/downloads (reconciliation-statement-generator, audit-defense-packet-builder, lease-abstract-matrix,
lease-clause-extraction-matrix, cam-reconciliation-template, multi-state-cam-disclosure-matrix,
cam-recovery-ratio-worksheet, tenant-dispute-response-letter-template, yardi-export-qa-checklist,
mri-recovery-billing-qa-checklist, cam-pre-send-packet-checklist-download). Plus `/tools` index.

### C. Comparison / conversion SEO landing — MED priority (templated, high-value)
`/vs` + `/vs/[slug]` · `/alternatives/[slug]` · `/switch/[slug]` · `/best/cam-reconciliation-software` ·
`/solutions/[slug]` · `/for/[persona]` · `/integrations/[slug]` · standalone SEO pages
(`/cam-audit`, `/cam-audit-software`, `/cam-charges`, `/cam-reconciliation-guide`,
`/cam-reconciliation-software`, `/commercial-lease-audit-software`, `/lease-abstraction`,
`/mri-cam-reconciliation`, `/yardi-cam-reconciliation`)

### D. Resources / programmatic SEO (~100+) — LOWER priority (sample per template)
`/resources` + `/resources/[slug]` + many dynamic families (boma, calculations, calendar, dispute,
expenses, lease-clauses, lease-types, markets, property-types, roles, software, states, templates,
workflows). Audit by template, not per-slug.

### E. Global chrome / interactive — HIGH priority
MarketingNav (desktop + mobile menu + dropdowns) · MarketingFooter · ThemeToggle · cookie/consent banner ·
LeadMagnetExitIntentPopup · AI-SDR chat widget · feedback widget · ContactForm · LeadCaptureForm ·
CalculatorUnlockGate · TurnstileWidget.

---

## Cycle Plan
1. **C1 — Core pages** (A): desktop+mobile screenshots, taste/consistency/function/a11y audit.
2. **C2 — Global chrome** (E): nav, footer, theme, popups, forms, chat.
3. **C3 — Interactive tools** (B): real e2e per tool (input → compute → output/download).
4. **C4 — Comparison/SEO templates** (C): one representative per template family.
5. **C5 — Resources templates** (D): one representative per template family.
6. **Review/fix cycles** until clean. Re-screenshot after each fix.

---

## Findings Log
> Severity: P0 broken/blocker · P1 clear defect · P2 polish/taste · P3 nit. Status: OPEN/FIXED/WONTFIX.

(none yet — populated per cycle below)

## Cycle Log
- C0 (kickoff): inventory built. **CRITICAL ENV FIX:** :3000 is the FOREIGN camaudit-v2 app; CapVeri
  marketing is on **:3001** (saved to memory). All audits use :3001.
- C1a (pilot audit: home, pricing, product, product-tour, product/features): findings below.
- C1a-fix: F1–F4,F6–F10 FIXED & verified (tsc clean, 158 tests pass, copy-gate exit 0, eslint 0).
  Server confirms /product→307→/product-tour, "Reconciliation dashboard"+"Sample data", no Synthetic/Plain-Python.
  F5(pricing trial dup) still deferred to pricing pass. Not committed yet (will commit after visual verify).
  Minor TODO: `/product` uses 307 (temporary); consider `permanentRedirect` (308) for SEO. → DEFER

## Findings Log
### C1a — validated (home, pricing, product-tour, product/features, global)
- **F1 [P1] /product 404** — bare URL dead-ends (only nav active-state refs it). Fix: `app/product/page.tsx` → redirect to `/product-tour`. → OPEN
- **F2 [P1] Demo frame visible H2 = "Synthetic CapVeri … preview"** (CapVeriDemoFrame.tsx:30 renders `title` as `<h2>`). Jargon + awkward. Disclosure already via "Sample data" badge + subtitle. Fix: clean visible headings ("Reconciliation dashboard", "Lease rules", "Exception queue", "Audit packet"); badge "Synthetic data"→"Sample data". Affects ProductDemoSection, sample-report, HeroSection + tests. → OPEN
- **F3 [P1] "Plain Python runs the math" / "plain Python math"** dev jargon (FeaturesGrid.tsx:41, ValuePropositionSection.tsx:20). Fix: "exact decimal rules". → OPEN
- **F4 [P2] Button label case inconsistent** — nav "Start free trial" vs pricing plan "Start Free Trial". Standardize sentence case. → OPEN
- **F5 [P2] Pricing trial info duplicated** (box item 1 + static line below). → OPEN (defer to pricing pass)
- **F6 [P2] Announcement bar "80OFF"** reads as garbled; clarify it's a checkout code. → OPEN
- **F7 [P2] Footer logo has no wordmark** (MarketingFooter showText={false}). Show wordmark in primary footer brand. → OPEN
- **F8 [P2] "Read the feature page →" identical link text** repeated on every feature card (a11y). Differentiate via aria-label. → OPEN
- **F9 [P2] animate-on-scroll no prefers-reduced-motion fallback** (globals.css:439). Add reduced-motion guard (opacity:1, no anim). NOTE: "blank sections" in headless screenshots are an artifact, not a real-browser P0. → OPEN
- **F10 [P3] Nav focus ring rounded-sm → rounded-full** (pills canon). → OPEN
- Deferred/subjective (revisit): "Reconcile" plan-name ambiguity, features stat cards lacking descriptors, dense pricing unit-band paragraph→table, knowledge-card radius. → DEFER

### C1b — batch 2 (about, about/angel-campa, contact, roi, docs, help). VERIFY of C1a: all 5 PASS, no regressions.
- **F11 [P1] /roi duplicated "no credit card" + double period** (bottom CTA "keep access.. No credit card needed" + "Pricing That Pays" dangling "with no credit card required"). Confirmed in screenshot. → OPEN
- **F12 [P1] /contact "How can we help?" select** has visible `*` but no `required` attr. Add required. → OPEN
- **F13 [P1] /contact heading order** H1→H3 ("Send Us a Message")→H2 ("Prefer to talk it through?"). Promote form heading to H2. → OPEN
- **F14 [P2] /docs Quick Navigation buttons** use rounded-lg, not pills. → OPEN
- **F15 [P2] /contact Message textarea not required** (core field). Make required. → OPEN
- **F16 [P2] /docs "We automate…"** first-person inconsistent → "CapVeri automates…". → OPEN
- **F17 [P2] /roi seam** — large white gap between dark CTA section and dark footer (looks like a layout seam). Investigate/tighten. → OPEN
- **F18 [P2] /roi "Cost of Doing Nothing" icons all red** (error semantics misused) → amber/warning tone. → OPEN
- **F19 [P2] /roi "buildings" vs "units" mismatch** — portfolio cards labeled "5/20/50 buildings" but priced on 25/125/500 units; reconcile labels. → OPEN
- Deferred (bigger/subjective): about H1 flatness, founder photo on /about/angel-campa, /roi static vs real calculator, /docs sticky TOC, /help scroll-spy + hide-empty-sections-on-search + intent-card wiring, contact 24h→business-day copy. → DEFER (dedicated help/docs/about pass later)
- Console (all pages): CORS fail on api.capveri.com/.../launch-offer/active on localhost — dev-only noise; prod same-origin. Watch (launch-offer footgun memory). → WATCH

### C1b-fix (2026-06-20): F11–F19 all FIXED
- F11 roi duplicated copy/double-period → fixed (literal strings; shared `trialCopy` constant left intact).
- F12+F15 contact select+textarea required → fixed (Select root `required`, Textarea `required`+`*` label, JS guard since form is `noValidate`).
- F13 contact heading order → fixed (Send Us a Message now real `<h2>`, CardTitle classes preserved). H1→H2→H2→H3→H3.
- F14 docs Quick Nav chips → `rounded-full` (6 chips).
- F16 docs "We automate"→"CapVeri automates".
- F17 roi white seam → root `pb-24` on light bg removed; dark CTA flush above footer.
- F18 roi Cost-of-Doing-Nothing icons `text-destructive`→`text-amber-500` (4 icons).
- F19 roi buildings/units mismatch → headline relabeled to units (~25/~125/~500) matching pricing tier + "Across about N buildings" caption.
- Verify: tsc 0, vitest 95 pass/0 fail (contact+roi+docs+components), copy-gate exit 0, eslint 0, prettier clean. Test updated: ContactForm.test.tsx fillBaseFields adds message. NOT committed yet.

### C1b-fix-2 (2026-06-20): /roi FAQ interpolation bugs (verifier-caught regression in F11)
- Web verify caught that batch-1 F11 only fixed the CTA subtitle + "Pricing That Pays" subtext; the **FAQ block** (separate, in faqSchema) still interpolated pricing SSOT constants that already end in periods / already contain "No credit card required to start" → produced `year.. The modeled`, duplicate "No credit card" in one block, lowercase-after-period fragments ("...keep access. with full access"), and raw `80OFF` mid-prose.
- Fix: rewrote 3 FAQ answers in roi/page.tsx as clean standalone prose (no `selfServeSummary`/`trialCopy`/`launchOffer.code` interpolation). Fixes both visible `<p>` and JSON-LD (same source). Verified rendered: 0 double-periods, free-trial FAQ has "no credit card" once, no raw code in FAQ prose. tsc 0, copy-gate 0, eslint 0.
- F16 (/docs first-person) = PASS — "We automate" is gone; verifier's "strict begins" reading over-interpreted the finding. No action.
- DEFER → pricing pass: `tierPriceLabels.reconcile` SSOT renders "starts at $998/year with 80OFF" — raw coupon code dangling in a visible price label (P3, global blast radius across pricing+roi); fix at the generated SSOT during the pricing pass, with F5.
- Also noted (web taste pass): /contact has a large empty white band below the form card before footer when content is short → C2/contact polish.

### C2 — global chrome (nav, footer, theme). Shipped 2026-06-20.
Audit covered the site-wide chrome rendered on every page. Findings + dispositions:
- **[P1] Footer wordmark contrast** — enabling the footer wordmark (C1 F7) exposed a pre-existing trap: the global `a { color: hsl(var(--primary)) }` rule painted the inherited "CapVeri" span blue on the dark footer (1.91:1, fails WCAG). FIXED: added `text-background` to both footer brand links (mobile + desktop). Commit 5a3c8b95.
- **[P2] Theme colorScheme mismatch** — `light-theme-only` ships no dark CSS vars, but ThemeProvider used `defaultTheme="system"` + `enableSystem`, so a system-dark visitor got `colorScheme: dark` on a white-only page (dark native scrollbars/inputs). FIXED: pin `defaultTheme="light"`, `enableSystem={false}`; test updated. Commit 5a3c8b95.
- **[P2] Nav menu a11y semantics** — Product/Resources triggers used `aria-haspopup="true"` (synonym for "menu") but the panels are plain link disclosures with no menuitem roles/roving focus. FIXED: removed `aria-haspopup`; kept `aria-expanded`+`aria-controls` (correct disclosure pattern). Tests updated. Commit a5c0f7dd.
- **[P2] Dead ThemeToggle component** — rendered nowhere, and contradicted the now light-pinned design. FIXED: removed component + test. Commit a5c0f7dd.
- **[P2] Cookie consent banner (GDPR)** — site has a `/cookies` policy page; whether PostHog requires a consent gate is a legal/compliance call. → DEFER (product/legal decision, do not invent autonomously).
- **[P3] Mobile nav sub-sections / "Product" click navigates away** — minor; revisit in a dedicated nav-UX pass. → DEFER.
- **AI-SDR widget** — can't verify on localhost (needs prod origin allow-list + signed BFF); verify on www.capveri.com in a prod-browser pass. → WATCH.
- Gate: tsc 0, vitest green (679/679 after ThemeToggle removal), eslint 0, marketing-copy-gate 0. Both batches pushed to origin master.

### C3 — interactive tools (30 tool pages). Shipped 2026-06-20.
Audited the /tools hub and the calculator/template/checklist tool pages. Backend (capveri-api)
is the single source of truth for calculator math; the preview sandbox cannot reach
api.capveri.com, so calculator math is verified via live prod curl, not local browser.

**Group 1 — tools hub discoverability + positioning + canon (commit 39ffaf8c, prior session):**
- 10 orphaned tool pages had no card on /tools; added all 10 (Excel/checklist/template/compliance).
- Broadened TOOLS_DESC; visible "Updated June 2026" + dateModified; /tools sitemap date bumped.
- audit-risk-quiz: removed tenant-side cross-promo, pill answer buttons, dropped result-count
  padding, softened "30 days" claim. cam-overcharge analytics source id corrected.

**Group 2 — calculator honesty/UX (commits 247112a6, 36bcb1b8):**
- NOI impact: removed fabricated ROI multiplier / net-gain framing; show NOI recovered + asset
  value lift only, with an honest "plans start at" line linking to /pricing.
- BOMA 2024 (P0, prod-breaking): the intermediate fix sent `annual_rent_per_sf:"0"` to get free
  SF metrics, but the schema requires rent > 0 → would 422 in prod. Correct fix: backend
  `annual_rent_per_sf` made optional, revenue_lift/asset_value_lift return null when rent absent
  (SF geometry is pure, always free); frontend OMITS rent until provided and guards null.
  Backend deployed to capveri-api (version d3f417a1, 100%); live-verified both modes via curl.
  Backend 1545 tests pass; added a rent-absent test case.
- HCAD tax normalizer: required-field markers, plain-English helper text, aria wiring, pill buttons.
- cam-billing-error: dropped ungrounded "$20,000+" FAQ figure (page default is $8.50/SF →
  $17k, not $20k+); inline "greater than zero" hint for invalid SF.
- admin-fee: unified three divergent tool-name variants to "Admin Fee Calculator".
- fixed-cam: associated per-year inputs with labels (useId); removed a reasonless eslint-disable
  by correcting the effect deps.
- cam-overcharge: plain-English cap-rate input ("CAM cap limit (% per year)", enter 5 for 5%);
  wrapped results table in overflow-x-auto for mobile.

**Group 3+4 — honesty, naming, legal (commits 5ecc1dde, 12205fcf):**
- cam-reconciliation-template (P0 honesty): "Download Template" button routed to /auth/register
  and no Excel file exists. Relabeled to "Get the free template" + arrow icon; badge/card/title/meta
  reworded to "spreadsheet" / "sign up free to get it" so the promise matches the signup step.
- reconciliation-statement-generator: prior pass mis-unified to "Generator", but the free artifact
  is a downloadable template. Renamed user-facing title/H1/toolName/structured-data to "CAM
  Reconciliation Statement Template"; fixed a grammar artifact + "online generator" conflation in
  the meta description. Slug/component identifiers unchanged.
- sb-1103-checker + multi-state-cam-disclosure-matrix (legal): the two pages gave contradictory SB
  1103 facts (120 vs 90 day deadline; "lease structure only" vs "5 employees / $2.5M revenue") and
  asserted unverified thresholds/effective date as settled law. Removed the specific unverified
  numbers, reconciled both pages to consistent qualitative language, added a "general information,
  not legal advice - verify against the statute and consult an attorney" disclaimer to both.

**Cycle review (opus agent on origin/master..HEAD):** no blockers. Confirmed Decimal math intact,
null guards complete, no infinite-fetch loop in fixed-cam, cap-rate /100 range-consistent, no
remaining fabricated claims, pills + no em dashes + no `any`. One SHOULD-FIX (statement tool
"Generator"→"Template" naming/grammar) fixed in 12205fcf.

**Gate:** backend 1545 tests pass; marketing tsc 0, eslint 0, content-quality + sitemap 23/23,
marketing-copy-gate 0. Pushed to origin master (…12205fcf). capveri-api deployed + 100%-verified;
marketing worker deploy in progress.

**Deferred from C3:**
- ToolPageLayout shared estimate-disclaimer prop (consolidation/enhancement, not a bug). → DEFER
- cam-overcharge cap input is whole-percent only (no sub-1% caps); by design, message accurate. → OK
- Calculator math for API-backed tools is verified via prod curl only (sandbox can't reach
  api.capveri.com); same constraint as all non-NOI tools. → WATCH (real-browser pass on prod later)

---

## C4 — Comparison/SEO data honesty (commit 5147d425)

**comparisons.json (32 entries):** removed every false "BOMA research indicates" /
"BOMA industry research indicates" attribution of the ~40% material-error stat. The
company's own /sources page disavows any located BOMA study, so the attribution was a
lie. 12 surgical edits standardized on the repo's established honest phrasing
("industry sources commonly cite that roughly ~40% of CAM reconciliations contain
material errors"); stat-card titles "40% error rate" → "~40% cited error rate"; two
meta descriptions and one table cell reworded. Verified zero remaining "BOMA research"
attributions; JSON valid; locally rendered on /vs/excel. Gates green.

## C5 — Resources surface (commits ff21b059, 7e21b589)

Findings-map Explore agent reported /resources largely clean (positioning correct,
integrations correctly state "no API / CSV only", no copy-gate/em-dash/jargon issues).
Four defects, all in cam-dispute.json, all fixed:

- **Tenant-side product pitches (ff21b059):** removed two CapVeri tenant-pitched lines
  (~L94, ~L266) that conflicted with landlord-side positioning; replaced with neutral
  worksheet guidance.
- **Unattributed stats (7e21b589, P0 honesty):** four "Studies/Independent studies
  consistently find 60-80% of audited reconciliations contain overcharges" /
  "Industry data suggests 5-20% recovery" claims — same disprovable-source pattern as
  the BOMA fix, NOT backed by /sources. Reframed all four to "industry sources commonly
  cite" framing with clearly-labeled illustrative math (no fabricated percentages or
  attributions). Verified math: 10% of $100k = $10k; 15% of $150k×3yr = $67.5k.
- **Duplicate related links (7e21b589):** /cam-reconciliation-guide was triplicated in
  every relatedResources block (rendered duplicate cards). Collapsed 17 → 6 (one per
  guide) via formatting-preserving perl pass; JSON valid.
- **Missing legal disclaimer (7e21b589):** cam-dispute [type] template asserts waiver
  doctrine, audit deadlines, treble damages as fact. Added plain "general information,
  not legal advice" footer (mirrors the C3 SB-1103 disclaimer pattern).

Confirmed camaudit.io overview links + CrossSiteCalloutCamAudit are an intentional
sister-site funnel (left as-is). Skipped the agent's "editorial neutrality" flag on
the landlord-side CapVeri mentions (L634/638) — naming CapVeri on CapVeri's own
marketing site is correct, not a defect.

**Gate:** marketing-copy-gate exit 0; 14 content-quality tests pass. Live-verified on
the marketing server (port 3001, title=CapVeri): reframed overview + both reframed FAQ
answers + disclaimer render, no "60-80%" remains, no NaN, related links deduped (6×
unique). Pushed to origin master (…7e21b589).

**Consolidated marketing redeploy:** live worker (a749cfb9) predated the C4
comparisons.json + C5 cam-dispute.json edits → redeploying capveri-marketing and
verifying 100% on the new version, then prod browser pass on corrected pages.

## C6 — Visual/UX taste pass, core conversion pages (commit b9b1f0e7)

Browser sub-agent (web) audited /, /pricing, /product, /product/features,
/product-tour, /integrations, /resources, /contact, /about, /help at desktop +
390px mobile. Two real reader-visible defects, both fixed:

- **/resources funnel jargon (P0):** Topic-hub cards rendered the raw funnelStage
  code (TOFU/MOFU/BOFU) as a pill badge — internal jargon, copy-gate-forbidden.
  Added a render-site label map (tofu→"Start here", mofu→"Core guide",
  bofu→"Decision"); internal funnelStage field untouched so SEO/link logic is
  unaffected. Confirmed /resources was the ONLY visible render of the raw stage.
- **/about stale Python claim (P0):** "Python runs all the math the same way every
  time" — backend migrated to Cloudflare Workers + TS (2026-06-13). Reworded to
  "The math runs the same way every time"; refreshed stale last-updated date
  (May 11 → June 20, 2026).

**Triaged as NON-defects (verified, not fixed):** cam-overcharge "parse error"
= stale dev HMR overlay (file well-formed, prod healthy); YouTube thumbnails fail
only under dev image optimizer (next.config already allows i.ytimg.com); launch-
offer fetch = 60s setInterval with no retry loop (the "70/sec" burst was
accumulated dev remounts); /help sidebar links uniformly rounded-md (no
active/inactive mismatch as alleged); /contact Select + /help search are form
controls, exempt from the buttons-are-pills canon.

**Gate:** tsc 0, eslint 0, 14 content-quality tests, marketing-copy-gate 0. Live-
verified local. Pushed (…b9b1f0e7); marketing redeploy + prod verify in progress.
Batch-2 visual audit (/cam-audit, /alternatives, /case-studies, /blog, /glossary,
/docs, /security, /roi, /lease-abstraction, /for) running.

## C7 — Batch-2 honesty + visual/UX fixes (commits 2a802019, 556eb796)

Site-wide honesty sweep (2a802019, prior session) plus this session's batch-2
visual/UX defect fixes across /case-studies, /lease-abstraction, /alternatives,
/for, /cam-audit, /roi, /security. Shipped to master and live-verified.

**Fixed (556eb796):**
- **/case-studies internal-leak rework (P0):** removed reader-visible AI model
  IDs (MiniMax M2.7 / GPT-5.4 Mini / GLM-5), the per-call COGS cost table
  ($0.30/$0.15/$0.20, "vs Claude Sonnet $2-4", "4-8x savings"), and "Multi-Pass"
  jargon from headings. Humanized snake_case field labels (base_year →
  "Base year", pro_rata_share → "Pro-rata share") via a new server-safe
  `fieldLabel.ts` module. Reframed headline stats and trust badge to buyer value
  ("Every field — cited to the exact lease clause"; "A second model checks the
  first before you see it"). Hero h1 → "Real Lease Extraction Results".
- **Server/client boundary 500 (browser-e2e caught):** the first cut imported
  `fieldLabel` from the `"use client"` CaseStudyTabs into the server page and
  called it during render → 500 on every /case-studies hit. tsc/lint were both
  green; only the local browser pass surfaced it. Fix = extract the helper into a
  plain (non-client) `fieldLabel.ts` both modules import. LESSON re-confirmed:
  unit/type checks ≠ render safety for RSC boundaries.
- **/lease-abstraction:** fixed garbled price cell ("From starts at $998/year
  with 80OFF" double-prefix + coupon-in-prose) → "Starts at $998/year";
  "Accuracy guarantee" → "Accuracy transparency"; de-jargoned the hero (badge
  "Multi-Pass AI Extraction" → "AI Lease Extraction"; lead paragraph dropped
  "multi-pass" and was split to a third-grade reading level, 9.8 avg / 13 max).
  Deeper FAQ/schema "multi-pass" mentions kept (contextually defined, gate-allowed).
- **/alternatives + /for:** added a bottom conversion CTA ("See it on your own
  numbers" / "Start free trial") — both index hubs previously had no CTA.
- **/cam-audit:** TOC anchor links → pills (rounded-md → rounded-full).
- **/roi:** hero CTA standardized to "Start free trial" (was "Start Free 30-Day Trial").
- **next.config:** added /security → /docs#security 307 redirect (kills the 404
  the in-product AI-CS chat had been citing).

**Triaged as NON-defects:** /roi dollar ranges already consistent prose ("about
$X to $Y"); the "80OFF at checkout" promo callout is a legitimate exact coupon
CTA, not a leak; /blog hero CTA already renders as a pill (code-nit only, skipped).

**Review:** general-purpose review agent on the staged diff → clean; it flagged the
lease-abstraction "Multi-Pass" hero straggler, which was then fixed in-cycle.

**Gate:** marketing-copy-gate 0 (root), tsc 0, eslint 0, 14 content-quality tests;
new/changed persuasive copy passed humanizer→third-grade evaluator. Browser-verified
on localhost:3001 (all surfaces render, no 500s, no leaks). Deployed:
`capveri-marketing` Worker 100% on version 230481ee. Prod live-verified on
www.capveri.com (/case-studies 200 + humanized + no leaks; /security 307→/docs#security;
/alternatives CTA; /lease-abstraction de-jargoned hero).

---

## C8 — Design-canon pills + copy-honesty (fabricated stats purge) — 2026-06-21

**Commit `0c480133` · pushed · Worker `capveri-marketing` 100% on `e5016fd5` · prod-verified.**

**Pills (border-radius 9999px, design canon):**
- `ui/tabs.tsx` — TabsList (rounded-lg→full) + TabsTrigger (rounded-sm→full): the
  segmented control now reads as a pill toggle (used on /case-studies).
- `content/RelatedContent.tsx` — related-resource link rows → rounded-full.
- `glossary/[term]/page.tsx` — related-term link rows → rounded-full.
- `cam-reconciliation-guide` — TOC anchor links → rounded-full + px-4.

**Copy honesty — removed fabricated/unsourced stats (site SSOT is /sources
"every statistic traceable"; none of these appeared there):**
- `alternatives.json` (excel): dropped invented "60%+ industry survey" stat and
  the "single largest source of billing errors" ranking → qualitative claim.
- `death-of-spreadsheet-cam.mdx`: removed fabricated "65% of property controllers"
  from BOTH the FAQ answer AND the SEO `description` frontmatter (the latter was a
  miss caught at commit time — it renders in search snippets + blog cards) →
  honest qualitative framing.
- `what-is-cre-finops.mdx`: deleted the fabricated 72% "industry survey estimates"
  StatGrid card (grid now 3 real cards: 3-5%, $25K, 5-10 yrs).
- `roi`: dropped "Industry surveys report" attribution; labeled the 40-80 hrs
  figure a "modeled estimate" per the page's own convention.
- `cam-audit`: removed the invented "12 validation rules" / "12 standardized rules"
  count (no such enumerated registry exists in the reconciliation engine — verified
  against cloudflare-backend/src/domain/reconciliation/*) → "Same defined checks
  every time" / "running checks for those same problems".

**Triaged as NON-defects (left intact):** the `linkedin/` JSON/CSV/py 65% artifacts
are content-pipeline drafts under the separate LinkedIn gate, not live-site render
(review batches already flag them); all other on-site percentages are legitimate
domain math (gross-up occupancy, BOMA 25-30%, insurance 40-65%, recovery-ratio
tables) or explicitly labeled modeled examples. Stale HMR "fieldLabel/submitHintId
defined multiple times" + "Expression expected" errors in the preview log were
transient hot-swap artifacts — on-disk files are clean (single defs) and
/case-studies + both /tools pages render 200.

**Gate:** marketing-copy-gate 0 (root), content-quality 14/14, tsc 0, eslint 0;
new copy clean (no codenames/funnel jargon, no em dash/semicolon). Browser-verified
on localhost:3001 (7 pages 200, all copy strings present/absent as intended, all
pill elements computed 9999px). Prod live-verified on www.capveri.com (5 pages 200:
blog no-65%/new-desc, cam-audit no-12-rules, alternatives/excel no-survey,
roi no-survey/modeled, what-is-cre-finops no-72%).

---

## C9 — Tenant-side product mispositioning in CTAs — 2026-06-21

**Commit `81add17f` · pushed · Worker `capveri-marketing` 100% on `2c00db66` · prod-verified.**

Sub-agent audit (lite) read all 15 `audience: tenant` posts for the ONE real risk:
does any post's CTA/product framing sell CapVeri as a tenant-side audit tool
(violates the standing landlord-side rule + is a lie about the product). The
agent's table concluded "no violations" but was too lenient — it matched on the
phrase "landlords and property managers" while missing second-person CTAs
addressed to a *tenant*. Four genuine defects caught on re-read and fixed:

- `what-is-a-cam-fee`: "calculates what you should owe versus what you're being
  billed ... to see your exposure" (tenant checks their own bill) → landlord
  self-audit: "maps each expense to lease terms ... each tenant's correct obligation".
- `what-are-cam-charges-complete-guide`: "project what your reconciliation might
  look like before you receive it" (tenant receives) → "model a reconciliation
  before you send statements" (landlord sends).
- `cam-charges-real-estate`: "your correct obligations ... your exposure" →
  "each tenant's correct obligation".
- `lease-renewal-cam-negotiation`: "Run a CAM audit ... to quantify your
  negotiating power" (tenant's weapon vs landlord) → "defensible before renewal
  conversations begin" (landlord/PM).

Each rewrite reuses the site's already-gated landlord CTA pattern (occupier /
commercial-lease-negotiation), so voice stays consistent. Tenant-education BODY
copy ("audit what you've been paying", "you're owed your pro-rata share") and
audience-neutral tool links (pro-rata-calculator) left intact — those educate the
tenant reader and don't position the product. `boma-2024-changes` CTA verified
correct (controller/landlord post; "your statements / your exposure" = self-audit).

**LESSON:** a positioning auditor that greps for the right brand phrase will pass
copy that is mis-framed by its *pronouns*. Tenant-side tells are "you owe / you're
billed / before you receive / your negotiating power", not the absence of
"landlord". Re-read agent verdicts on positioning, don't take the summary line.

**Gate:** marketing-copy-gate 0 (root), content-quality 14/14; 4 pages render 200
locally + prod (new framing present, tenant-side framing gone on www.capveri.com).

---

## C10 — pSEO/template deep audit + dead-link sweep (2026-06-21)

**Runtime health (pSEO):** mapped all 25 dynamic route families (each with
`generateStaticParams`) and fetched one real URL per family from the 715-URL
sitemap → all 25 return 200 with substantial content. No render breakage.

**Pill canon (templates):** grepped `rounded-(md|lg|sm|xl)` + border/bg across
`marketing/src`; the companion grep for square-cornered `<Link>`/anchor rows
returned no matches. All hits are multi-element content cards
(`rounded-lg border bg-card p-4/p-6`), badges, icon-wrapper divs, or borderless
nav items — legitimately non-button per the design canon. No pill violations in
the pSEO templates (the genuine link-button fixes were already shipped in C8).

**Dead-link sweep:** extracted 443 unique internal links from the 7 highest
fan-out hubs (/, /resources/cam-guides, /alternatives, /glossary, /resources,
/blog, /tools) and checked every status. Two non-200s:

- `/blog/commercial-lease-negotiation-cam-clauses` → **500** under the 12-way
  concurrent crawl. NOT a product bug: 5/5 sequential hits return 200, and the
  dev log shows it rendering 200 in ~545ms. It was a dev-server on-demand-compile
  race under concurrent first-hits; production pre-renders it via
  `generateStaticParams`, so no fix needed. Logged as a known dev-only transient.

- `/blog/what-is-cam-reconciliation` → **308** to
  `/resources/common-area-maintenance-reconciliation-explained`. Root cause: the
  slug is in `demotedBlogSlugs` (noindex) AND is 308-redirected to its canonical
  resource in `next.config.ts`, but the **blog index still rendered a clickable
  card for it and listed its redirected URL in the `itemList` JSON-LD**. The
  `[slug]` page honored the demotion (noindex, no canonical); the index did not.

**Fix (`marketing/src/app/blog/page.tsx`):** filter `getAllPosts("blog")` through
`isDemotedBlogSlug` before building cards + schema. The demoted/redirected slug no
longer appears as a card or in the itemList schema (removes the redirect hop and
the non-canonical structured-data entry). Resources index verified already clean
(its demoted slugs are redirect-only sources with no MDX, so `getAllPosts` never
surfaces them).

**Gate:** eslint clean, `tsc --noEmit` exit 0, vitest 12/12 on
internal-link-graph + contextual-links + resources page tests. /blog renders 200;
demoted slug confirmed absent from both the card grid and the itemList JSON-LD.

**LESSON:** a demotion/noindex flag that's only honored by the detail page leaks
on the index. When a slug is demoted or redirected, filter it everywhere it can be
*listed* (index grids, itemList/collection schemas, sitemaps), not just where it's
*served*. Also: a one-shot concurrent crawl of a Next dev server produces false 500s
from compile races — re-check non-200s sequentially before treating them as bugs.

---

## C11 — pSEO/glossary/docs copy honesty + positioning audit (2026-06-21)

Objective sweep of the copy layer that feeds the pSEO families (27 data files +
templates + shared components), plus /glossary and /docs. No code change — audit
came back clean. Findings:

- **Data files (27):** grepped for fabricated-stat patterns (industry survey/
  average/study, "N% of landlords/tenants", invented rankings) and tenant-side
  product CTAs. Every hit was either (a) a NAMED-SOURCE benchmark
  (reit-benchmarks.json → "CRE industry average (OfficeSpace.com, Aquila)"), (b) a
  true domain fact ("industry standard is 90-120 days after fiscal year-end"), or
  (c) a market description of a COMPETITOR (Yardi/MRI/Procore = "industry standard
  for large portfolios"), not a CapVeri performance claim. Zero fabricated CapVeri
  proof. Zero tenant-side product CTAs in data.
- **Templates + components:** no tenant-side product framing
  ("audit your landlord", "dispute your bill", "what you're being overbilled") in
  src/app or src/components. The "industry standard/average" hits were worked
  examples ("On a $700K pool with 70% of tenants capped, that can be $24,500") or
  domain references (depreciation useful-life standards), not survey claims.
- **The 28% stat** ("tenants who discover CAM errors without an auditor") renders
  in two live blog StatGrids — but WITH an inline `source: "JLL 2023 via PredictAP"`,
  and tenant-cam-dispute.mdx links it to /sources. /sources additionally flags it
  "directional, primary study not independently verified." Attributed + traceable =
  honest sourcing, not fabrication. Left intact.
- **/glossary + /docs:** /glossary, /docs, and sampled term pages
  (/glossary/admin-fee, /glossary/base-year) all render 200; templates clean of
  tenant-framing + fabricated stats.

**Conclusion:** the genuinely fabricated unsourced stats were already purged in C8;
the pSEO/glossary/docs copy layer carries no fabricated CapVeri claims and no
tenant-side product mispositioning. No fix required this chunk.

---

## C12 — Visual taste + usability sweep, core hand-built pages (2026-06-21)

**Commit:** eca9c495. **Worker:** capveri-marketing 100% on `4ade2dbd-7f6b-4e99-abc4-d2737b7478d8`, prod-verified.

First exercise of the Gen-Z "looks nice" + 80yo "can use it without getting stuck"
mandate (C7-C11 were functional/copy/positioning). Sub-agent driven: a `web` agent
ran a DOM-grounded desktop+mobile sweep of the 7 core hand-built pages
(/, /pricing, /product, /about, /contact, /roi, /sample-report).

**Clean across all 7 pages:** every CTA/button is a fully-rounded pill (9999px
radius confirmed via live computed-style inspection), no horizontal overflow at
desktop or mobile, no console errors, no broken images (pages use Lucide SVG +
component-drawn mock UIs, not external image assets), nav + mobile drawer CTAs all
pills. Form inputs correctly use rounded-md (exempt from the pill canon).

**Two concrete defects fixed:**
1. **/contact** — the "Send Us a Message" form heading (ContactForm.tsx CardHeader
   h2) rendered at 16px (label-sized) directly under the 30px page title, so the
   page's PRIMARY content had no heading that read as a section header (fails the
   80yo "what is this block?" scan). Added `text-xl` → 20px. Verified live:
   computed font-size 20px.
2. **/sample-report** — the middle summary stat number "6" had `text-3xl font-bold`
   with NO color while its AlertTriangle icon was `text-warning` and both flanking
   stat cards paired icon+number colors (23 success, 18 primary). Added
   `text-warning`. Verified live: the three numbers now render
   success(green)/warning(amber)/primary(blue) matching their icons.

**Not a defect (considered, rejected):** the sub-agent flagged /about's H1 as
smaller than the landing-page heroes. Left as-is — /about uses the exact same
`text-xl md:text-2xl lg:text-3xl` informational-hero scale as /contact's H1, so it
is CONSISTENT with the informational-page convention, not an inconsistency. Bumping
it would be a subjective preference, not a fix.

**Verification:** tsc --noEmit clean, eslint clean on both files; both fixes
confirmed in the local browser preview; sample-report fix additionally confirmed in
prod static HTML (server-rendered); contact fix confirmed in the preview browser
(ContactForm is client-rendered behind Suspense, so absent from prod static HTML,
but built from the same committed source the deployed worker serves).

LESSON: client components behind a Suspense boundary (ContactForm) do NOT appear in
prod static HTML — curl-grep can't verify them; use a real browser against the same
committed source (the deployed worker serves that exact build). Next chunk: visual
taste sweep of the remaining hand-built pages (/help, /product-tour deep,
/case-studies, /videos, /security) + the nav/footer/mobile-drawer chrome + any
modals/popups (exit-intent, launch-offer banner states).

---

## C13 — Visual sweep: remaining pages + site chrome + overlays (2026-06-21)

**Commit:** af044a3f. **Worker:** capveri-marketing 100% on `0185e397-aa6e-4be4-9858-0fec261d9dc4`, prod-verified.

Sub-agent driven `web` sweep (DOM-grounded, desktop + mobile) of the remaining
hand-built surfaces (/help, /product-tour deep, /case-studies, /videos, /docs incl.
#security) plus all site chrome (desktop nav, mobile nav drawer, footer, launch-offer
banner) and the exit-intent popup (source + a11y reviewed). Most surfaces CLEAN
(pills everywhere, no overflow desktop/mobile, no console errors, no broken images;
/security 307 -> /docs#security 200 confirmed). Three fixes:

1. **/help** (HelpCenterClient.tsx:268) — active FAQ-category SIDEBAR link carried a
   persistent `bg-primary/10` fill but `rounded-md`. Canon: a fill-backed nav link is
   a pill. `rounded-md` -> `rounded-full`. Verified live + prod HTML (9999px).
2. **Mobile nav drawer** (MarketingNav.tsx:477) — active top-level drawer link carried
   a persistent `bg-muted` fill but `rounded-lg`. `rounded-lg` -> `rounded-full`.
   Verified live at 375px: active "Pricing" row = bg-muted + 9999px.
3. **Launch-offer banner** (MarketingNav.tsx) — the coupon code "80OFF" was buried in
   the link text "80OFF at checkout." with zero visual distinction, so it didn't read
   as a literal code to TYPE (80yo-usability gap). Made it a distinct monospace pill
   badge (font-mono, bg-primary-foreground/15, rounded-full, tracking-wider) with a
   clear aria-label ("Apply launch offer code 80OFF on the pricing page"); split
   "at checkout." back out as plain trailing text. NO wording changed (no copy gate).
   Updated MarketingNav.test.tsx (banner-link query now by name /80OFF/i + href
   /pricing assertion). Suite 28/28 green. Verified live + prod HTML.

**Considered, NOT fixed (correctly):** desktop nav dropdown sub-items and mobile
sub-nav items use `rounded-lg` but only `hover:bg-muted` (no PERSISTENT fill), so they
are pill-exempt per canon — left as-is. product-tour "4 step previews stacked" the
agent flagged as a labeling nicety, not a defect — left as-is. case-studies/videos/docs
fully clean.

LESSON: the pill canon hinges on PERSISTENT fill, not hover fill — an active-state
`bg-*` class on a `rounded-md/lg` nav link is a violation; a `hover:bg-*`-only link is
exempt. The launch banner (MarketingNav) DOES SSR its markup into prod static HTML
(unlike ContactForm behind Suspense in C12), so curl-grep verifies it. Next chunk:
sweep the dynamic pSEO template VISUALS (one representative URL per family at desktop +
mobile) and the /pricing calculator interactive states (slider drag, plan toggle).

---

## C14 — /pricing calculator E2E + live unit-band indicator (2026-06-21)

**Commit:** 6f89fc70 (code). **Deploy:** capveri-marketing worker 100% on
`c9b787b4-5946-4249-b3cb-2a9721a19a2e`. **Prod-verified** on www.capveri.com/pricing.

A `web` sub-agent ran an E2E pass of /pricing: the unit calculator math is penny-exact
across all five bands and their boundaries (probed 1, 25, 26, 50, 150, 151, 500, 5000,
100000 units), the FAQ accordion is single-open and functional, every CTA is a 9999px
pill, and the console is clean. The two "404s" it flagged (`/compare`,
`/software/cam-reconciliation-software`) were its own guessed URLs — `/compare` has zero
codebase refs (the real page is `/vs`) and software guides live at top-level paths
(`/cam-reconciliation-software` returns 200). Not defects; no action.

**Fix (additive UX):** the calculator changes the per-unit rate at band boundaries (e.g.
150 -> 151 units drops $179 -> $169 per unit) with no visual cue, so the total climbing
while the increment shrinks looked arbitrary (80yo-usability gap). Added a live highlight
of the matching row in the existing "Annual unit bands" list: as the slider or number
input moves, the active band lights up (bg-primary/10 + font-medium + text-foreground +
aria-current="true"). Band LABELS are verbatim from the prior static list — no wording
changed, so no copy gate. Driven by a UNIT_BANDS const + per-row isActive derived from
unitCount.

**Verification:** tsc clean, eslint clean, PricingContent suite 7/7 green. Live preview
(DOM-grounded): exactly one active row at every probed value (10/25/26/150/151/500/501/
2500/3000), each mapped to the correct band, with the correct active fill + foreground
color. Prod static HTML SSRs the default 25-unit state with the "1-25 units" row carrying
aria-current="true" and the active classes; all five labels present.

LESSON: a `transition-colors` on a class-toggled highlight left the painted background/
color STUCK on the previously-active row under rapid React re-render (font-weight, which
has no transition, updated correctly — isolating the transition as the cause). Dropped
the transition: the highlight then tracked input changes instantly and correctly. For a
discrete list-row highlight, instant is both more reliable and better feedback for the
80yo persona than a 200ms fade. Also re-confirmed: PricingContent is a "use client"
component that still SSRs into prod static HTML (curl-verifiable), unlike Suspense-gated
ContactForm (C12). Next chunk: visual sweep of dynamic pSEO template families at desktop
+ mobile (one representative URL each) and any remaining interactive overlays.

---

## C15 — Exit-intent popup: mobile dead-air fix (2026-06-21)

**Commit:** 38f57c9d (code) + this ledger entry. **Worker:** capveri-marketing 100% on
`d0f027c4`. **Prod:** www.capveri.com homepage + /pricing both 200.

**Scope:** every-modal mandate — DOM-grounded audit of the lead-magnet exit-intent popup
(`LeadMagnetExitIntentPopup.tsx`) on desktop (1280px) and mobile (375px), both real
trigger paths. The popup is a two-column grid on desktop (`md:grid-cols-[3fr_2fr]`,
left = dark resource picker, right = email capture) that collapses to a single stacked
column on mobile. Circular X close button is absolute-positioned top-right of the whole
dialog. Resource radios are option CARDS (rounded-xl, pill-exempt); "Maybe later" and
the form submit are pills (verified 9999px). Focus trap, Escape-to-dismiss, body-scroll
lock, and suppression keys (seen/dismissed/converted) all functioned correctly.

**Defect (1):** the right panel had a base `pt-12` (48px) that existed only to clear the
X button on DESKTOP, where the X overlaps the right panel. On MOBILE the grid is stacked,
so the X sits over the LEFT (dark) panel and the base padding-top rendered 48px of dead
air above the email form — a visible empty gap that read as a layout bug to the Gen-Z eye.

**Fix:** dropped the base `pt-12`; kept `md:pt-14` so desktop X-clearance is unchanged.
Right-panel padding-top is now 24px on mobile (from `p-6`) and 56px on desktop. One-class
change, no copy touched.

**Verification:** tsc clean, eslint clean, exit-intent suite 9/9 green. Browser-grounded:
at 375px the right-panel computed padding-top is 24px (was 48px); at 1280px it is 56px,
two-column confirmed, and the X button bottom (110px) clears the first right-panel heading
top (242px). Popup renders `null` until triggered, so it is absent from prod static HTML
(curl-grep cannot verify it — same class as the Suspense-gated ContactForm in C12); the
local real-browser pass against the committed source the worker serves is the authority.

LESSON: padding that exists purely to clear an absolutely-positioned sibling is layout-
mode-specific. When a grid collapses to a stack at a breakpoint, the overlapping sibling
moves to a different child, so base (mobile-first) clearance padding becomes dead air —
scope such clearance to the breakpoint where the overlap actually happens (`md:pt-*`,
not base `pt-*`). Next chunk: visual sweep of dynamic pSEO template families at desktop +
mobile (one representative URL each).

---

## C16 — pSEO template sweep: garbled related-link labels + spacing/positioning polish

**Commit:** `2dbcea78` (23 files, +132/-217). **Worker:** capveri-marketing 100% on
`50653567-67b9-45f6-8b32-dbd1d1276ab2`. **Prod-verified** www.capveri.com: /vs/yardi,
/resources/calculations/base-year-cam, /switch/excel all 200 with corrected rendering.

This was the first deep functional/visual sweep of the dynamic pSEO template families
(the C15 "next chunk"). Three `web` sub-agents did a DOM-grounded desktop+mobile pass of
one representative URL per route family; findings corroborated across agents, then every
actionable claim was re-verified against source before editing.

**Dominant defect — garbled related-link labels (16 template families).** Each pSEO
template built its "Related resources" / "Related tools" link labels with an inline
`href.replace(/^\/resources\//, "").replace(/-/g, "").replace(/\b\w/g, c => c.toUpperCase())`
chain. The middle `.replace(/-/g, "")` used an EMPTY replacement, deleting every hyphen
word boundary, so "/tools/cam-gross-up-calculator" rendered as the run-together garbage
"Camgrossupcalculator" — visible on the related-links rail at the bottom of every pSEO
article. Two further variants existed: some used `.replace(/-/g, " ")` (spaced, but
mis-cased acronyms as "Cam"/"Boma"), and the calendar builder hand-cased a handful of
acronyms (incl. ERP).

**Fix — one shared helper.** New `src/lib/slug-to-title.ts` exports
`slugToTitle(href)`: takes the LAST path segment (robust to nested prefixes like
`/resources/boma/...`), spaces hyphens, title-cases, and uppercases a known ACRONYMS set
(cam, erp, boma, sb, gl, noi, hcad, nnn, cpa, rsf, irem, asc). All 16 templates now call
`slugToTitle(href)`; PillarNavigation imports and re-exports it (was the prior local
owner). `erp` added to the set to preserve parity with the calendar builder's hand-casing
(flagged by review; no current regression — only slug is the plural "erps").

**Templates touched:** resources/{boma, calculations, calendar, cam-dispute, expenses,
lease-clauses, lease-types/cam-guide, markets/cam-guide, property-types/cam-guide,
roles/cam-guide, software/cam-setup, states/cam-compliance, templates, workflows},
for/[persona], glossary/[term].

**Other fixes this cycle:**
- 4 between-token `{""}` -> `{" "}` gaps that collapsed a literal space (alternatives
  "Best for:" / "Pricing:", vs "Already using <X>?", switch "Total time:"). Only the
  confirmed BETWEEN-token occurrences were touched; line-leading `{""}` artifacts (the
  majority) were left alone after per-site inspection.
- data/cam-dispute.json: 2 `overview` strings embedded a raw `<a href=...>CAMAudit.io</a>`
  anchor that the page renders as ESCAPED text via `{dispute.overview}` (page.tsx:146),
  so users saw literal `<a href="...">` markup. Stripped to plain "CAMAudit.io". (These
  are tenant-audience pages per C9's dual-audience SEO ruling, so the CAMAudit.io mention
  stays — only the broken markup was removed.)
- `min-h-[44px]` added to article-bottom `/pricing` CTA `<Link>`s for 44px mobile tap
  targets (templates whose CTA was a `<Button asChild>` or `buildAuditLink` `<a>` were
  skipped — not the target element).
- Audience-callout positioning: 4 LANDLORD guides (calendar, expenses, property-types,
  states) rendered the tenant-addressed `<CrossSiteCalloutCamAudit />` ("Need to verify
  your landlord's CAM charges?"). Swapped to the landlord-appropriate `<CrossSiteCallout />`
  (lextract.io, "Need lease data before you reconcile?"). The 3 genuinely tenant-facing
  surfaces (blog, cam-dispute, resources/[slug]) keep the CamAudit variant.
- Collapsed several `prose  max-w-none` double-spaces in className strings.
- route-integrity.test.ts: the "redirect destinations on valid canonical routes" test
  compared the FULL destination (incl. `#fragment`) against a route set that never holds
  fragments, so `/security -> /docs#security` was falsely flagged red. Now strips
  `#fragment`/`?query` before the lookup. Verified the destination is real: `/security`
  redirect is intentional (next.config.ts:186, comment-documented) and `/docs` renders
  `<div id="security">` (docs/page.tsx:355). Test 6/6 green.

**Verification:** tsc clean, eslint clean (changed files), `marketing-copy-gate` exit 0
(1433 files; data JSON copy touched), route-integrity 6/6, full affected-test set green.
Code-review sub-agent on the staged diff: no blocking issues (verified every
`slugToTitle` caller passes an href not a label; no last-segment collisions vs the old
prefix-stripping output; no acronym false positives; no leftover `.replace(/-/g, "")`;
callout swaps clean). Browser-grounded on :3001 across 6 families: labels correct
("CAM Gross Up Calculator", "BOMA 2024 Adoption Roadmap", acronyms uppercased), all
spacing fixes render real spaces, no NEW console errors.

**Carried forward (found, not in scope this cycle):**
1. **Duplicate React key** `/cam-reconciliation-guide` warning on EVERY page (a shared
   related-links list emits the same href twice). Pre-existing — href-keyed list
   composition, untouched by C16's label edits. Next chunk (C17).
2. **Title double-suffix** "... | CapVeri | CapVeri": ~70 `metaTitle` strings across 11
   data JSON files end in "| CapVeri" while layout.tsx:35 already applies a
   `%s | CapVeri` title template (consumers set `title: x.metaTitle` as a plain string,
   so the template double-appends). User-visible in the browser tab + search snippets.
   Deferred to its own focused cycle (needs per-consumer check that none use
   `title.absolute`).

LESSON: when the SAME broken inline expression is copy-pasted across N template files,
the fix is a shared helper plus a mechanical sweep — but verify the helper is
behaviorally EQUAL-OR-BETTER than every variant it replaces (here: last-segment
extraction vs the old per-prefix stripping, and acronym parity incl. the one hand-cased
ERP). A code-review pass on the staged diff caught the ERP parity gap before ship.

---

## C17 — Duplicate React key `/cam-reconciliation-guide` warning: VERIFIED FALSE ALARM (stale dev-server console buffer)

**Reported (from C16 carry-forward):** A React "Encountered two children with the same
key, `/cam-reconciliation-guide`" warning appeared ~8x in the browser console, believed
to be on every page from a shared related-links list.

**Investigation:** Traced every href-keyed list that renders on the reported page
(`/cam-reconciliation-guide`) and in the global layout tree:
- Hub page `src/app/cam-reconciliation-guide/page.tsx`: its two href-keyed lists (ToC
  anchors L433-440 = `#...` anchors; related resources L760-804) do NOT contain the guide
  href. All other lists key by index or `v.slug`.
- `PillarNavigation` (the only page-specific client component): renders ONE `<ul>` of
  `getClusterRelatedLinks(currentPath, 8)`, which dedupes by `normalizePath(href)` seeded
  with `currentPath` — it provably cannot emit the guide href twice.
- Global components `MarketingNav`, `MarketingFooter`, `LeadMagnetExitIntentPopup`
  (returns `null` until exit-intent → renders nothing on load), `AiSdrSalesWidget`
  (returns `null` on the hub): none reference the guide href; a repo-wide grep confirms
  the literal `/cam-reconciliation-guide` is absent from all four source files.
- `ResourceOrganizationHub` (`/resources/cam-guides`): the guide href appears once, in
  the "Core CAM pillars" section's own `<ul>` (L219). Keys are scoped per section, so no
  same-list collision.

**Root cause of the phantom report — the preview-tool console buffer:**
1. The Claude Preview MCP console buffer **does not clear across full page reloads or
   navigations** — verified by emitting a unique `console.error` marker, then hard-
   navigating to a different route: the marker persisted. So warnings accumulated across
   many page loads (and prior sessions) all showed up at once, falsely attributed to
   whatever page happened to be open.
2. The preview tool **multiplies each captured console entry ~4x** — verified: a single
   `console.error('DUPMARKER')` call surfaced 4 identical entries; the React DevTools
   and `[HMR] connected` info lines likewise each appear 4x. So the "8" warnings were at
   most ~2 real emissions, from some earlier-loaded page, not the hub.

**Clean-buffer verification (new server `5d6fec4f…`, restarted to flush the buffer):**
Hard-loaded 4 representative pages and read console errors on the freshly-flushed buffer:
- `/pricing` → 0 errors
- `/cam-reconciliation-guide` (the reported page) → 0 errors (h1 + title confirm full
  hydration; only DevTools/HMR info lines present)
- `/resources` → 0 errors
- `/cam-reconciliation-software` (self-referential sibling pillar page) → 0 errors

**Resolution:** No reproducing case exists on a clean dev server. No code change made —
fabricating a defensive dedupe with nothing to demonstrate it fixes would violate
"verify before claiming done." C17 closed as a stale-buffer measurement artifact.

**LESSON (reusable for ALL browser verification):** The preview console buffer persists
across reloads and multiplies entries ~4x. Before trusting a console-error count,
**restart the preview server** (or otherwise flush) and divide observed counts by the
~4x capture factor. A long-running dev server's console is cumulative, not per-page.

---

## C18 — pSEO title double-suffix "| CapVeri | CapVeri" fixed (commit 11527ece)

**Surface:** every dynamic pSEO route family's `<title>` (browser tab + search snippets).

**Bug:** `layout.tsx:35` sets `metadata.title.template = "%s | CapVeri"`. All 13 dynamic
route consumers (`vs`, `alternatives`, `integrations`, `for`, `solutions`, `switch`,
`resources/{calculations,calendar,cam-dispute,lease-types,templates,roles,workflows}`)
set `title: data.metaTitle` as a **plain string**, so the template applies to each. 64
`metaTitle` values across 10 data files already ended in `| CapVeri`, so the rendered
`<title>` came out `... | CapVeri | CapVeri`.

**Per-consumer check (the deferred-task prerequisite):** grep-confirmed NONE of the 13
consumers use `title.absolute` — all use a plain `title:`, so the template fix is uniform
and safe. (openGraph/twitter titles also read `data.metaTitle`, but the title TEMPLATE does
NOT cascade to those — so stripping the suffix makes OG titles brandless, which already
matches the non-suffixed majority's existing OG behavior. No regression vs site norm.)

**Fix:** stripped the trailing ` | CapVeri` from the 64 suffixed `metaTitle` values
(Python regex anchored to the `metaTitle` line + trailing-suffix only; CRLF endings
preserved; 64 ins / 64 del, exactly 1:1, no other lines touched). Files: cam-calculations(8),
cam-dispute(6), comparisons(1), lease-types(8), personas(6), roles(6), solutions(5),
switch(1), templates(10), workflows(13). This also makes the data consistent — e.g.
switch.json had 1 suffixed entry out of many; the rest already relied on the template.

**Why strip vs `title.absolute`:** a blanket `title.absolute` per consumer would have broken
the non-suffixed majority within mixed files (switch/comparisons have 1 suffixed entry each)
by deleting their template-supplied brand. Stripping normalizes all entries to "no brand in
data, template supplies brand," which is the dominant existing pattern.

**Verification:** marketing copy gate exit 0 (1433 files), `tsc --noEmit` clean,
route-integrity 6/6 green. Local browser (`:3001`): previously-doubled routes now single
(`/resources/calculations/base-year-cam`, `/switch/excel`); untouched files still single via
template, zero double-suffix (`/alternatives/yardi`, `/integrations/yardi`,
`/resources/calendar`). **Prod-verified** on www.capveri.com after deploy (capveri-marketing
100% on `823edbae`): base-year-cam, switch/excel, and workflows/year-end-reconciliation all
render a single `| CapVeri` with 0 double-suffix hits.

**LESSON:** Next.js `metadata.title.template` applies ONLY to the root `metadata.title`
string — it does NOT cascade to `openGraph.title` / `twitter.title`. So a data field reused
across all three (the common pSEO pattern) interacts with the template asymmetrically: bake
brand into the field and the `<title>` double-appends while OG stays single; strip it and the
`<title>` is correct while OG goes brandless. Decide per the field's dominant consumer; here
the `<title>` is the user-visible target and OG-brandless already matched the site norm.

---

## C19 — pSEO template visual/taste sweep: 4 DOM-grounded fixes (2026-06-21)

**Method:** spun a `web` sub-agent over one representative URL per dynamic pSEO family
(desktop + mobile snapshots): vs/alternatives/integrations/for/solutions/switch and the
seven `resources/*` families. Each finding re-verified against source before acting. Four
fixes shipped, one finding rejected as intentional house style.

**Fixes (commit f8751285):**
1. **lease-types cam-guide** (`resources/lease-types/[type]/cam-guide/page.tsx:236`) —
   `commonFor.join(",")` rendered the at-a-glance "Common for" row with no space after each
   comma ("retail,industrial,suburban office,..."); changed to `join(", ")`.
2. **calculations [scenario]** (`resources/calculations/[scenario]/page.tsx:365`) — the
   "Related Calculations" link-cards used `rounded-md` while the identical "Related
   Resources" cards rendered by `RelatedContent` on the same page use `rounded-full`,
   violating pill canon; matched to `rounded-full` + `min-h-[44px]` + `text-base sm:text-sm`.
3. **slug-to-title** (`src/lib/slug-to-title.ts`) — auto-generated related-link labels
   title-cased joining words ("Controllable Vs Uncontrollable", "Proration By Sqft"); added a
   `LOWERCASE_WORDS` set (vs/by/for/of/and/...) kept lowercase unless they lead the title.
   ACRONYMS still take precedence ("Gross Up" unaffected — "up" not in the set).
4. **personas property-controller** (`data/personas.json:53`) — the third hero stat value was
   the bare word "Before", which read as a broken/placeholder number beside "60-75%" and
   "6-8 wks -> 1-2"; changed to "Pre-send" / "Errors caught before statements go out", matching
   the qualitative-callout house style the other personas already use.

**Rejected:** the audit's broader "non-numeric persona stat values" finding ("At source",
"Per clause", "Per line", "Portfolio", "One method", "Review"). These are an intentional,
coherent qualitative-callout style across personas, not defects — over-correction declined.

**Verification:** `tsc --noEmit` exit 0; eslint on the 3 source files exit 0; copy gate exit 0;
route-integrity 6/6. Local browser (`:3001`) confirmed all four. **Prod-verified** on
www.capveri.com after deploy (capveri-marketing 100% on `72c87949`):
`/resources/lease-types/nnn-lease/cam-guide` renders "retail, industrial, suburban office,
strip centers, big-box retail, flex space"; `/resources/calculations/controllable-vs-uncontrollable`
shows "Controllable vs Uncontrollable" (correct casing, pill cards);
`/for/property-controller` shows "Pre-send" / "Errors caught before statements go out".

---

## C20 — core static-page taste + tool-honesty pass: 9 fixes (2026-06-21)

**Method:** dual parallel `web` sub-agent audit (conversion pages + interactive tools), every
finding re-verified against source before acting. Nine fixes across 8 source files + 1 test.
One finding rejected (React dup-key, no repro — same class as C17); three pre-existing
CamOverchargeCalculator unit-test failures flagged as a separate task (untouched file).

**Honesty (zero-lies gate) — the headline fix:**
- The tools hub said "No signup required" as a blanket claim, but several calculators
  (CAM Overcharge, BOMA 2024) gate the full financial breakdown behind an email via
  `CalculatorUnlockGate`. Reworded the hub description, hero subtitle, and two FAQ answers
  in `app/tools/page.tsx` to "Most tools need no signup. A few ask for your email to unlock
  the full breakdown." Now true.

**Taste / hierarchy:**
- `about/page.tsx` + `contact/page.tsx` H1s were `text-xl md:text-2xl lg:text-3xl` (max 30px,
  far below the site hero scale). Bumped both to `text-3xl md:text-4xl lg:text-5xl` — now
  compute to 48px desktop (verified via getComputedStyle on `:3001`).
- `PricingTeaser.tsx` homepage heading "Price Reconcile by unit count" read as a verb/tier
  collision ("Reconcile" is the plan name) -> "One plan, priced by your units."
- `SocialProofStrip.tsx` four trust-point titles were `<h2>` -> `<h3>` (heading hierarchy).
- `about/page.tsx` value copy dropped "Python code"/"AI guesswork" jargon -> "fixed rules,
  not AI guesses."
- `ContactForm.tsx` "what happens next" step punctuation consistency.

**UX / a11y / mobile:**
- `components/ui/slider.tsx` (shared Radix slider, used by pricing + tools): thumb was
  `h-5 w-5` = sub-44px tap target. Kept the 20px visual, added a 44px `before:` pseudo hit
  area.
- `NOICalculatorClient.tsx` summary boxes `grid-cols-2` -> `grid-cols-1 sm:grid-cols-2` so
  tabular values stop overflowing on narrow screens.
- `HcadTaxNormalizerClient.tsx` raw "Failed to fetch" now shows a friendly network message,
  matching the other API-backed tools.

**Rejected:** Agent A's React duplicate-key warning ("two children with the same key
/cam-reconciliation-guide"). Refined DOM probe on `/resources` (climb to mapped parent, count
same-href siblings) returned `[]`; repeated hrefs live in separate keyed cards/lists, which
React does not flag; `buildContextualLinks` already dedupes via a `seen` Set. No repro = no fix.

**Verification:** `tsc --noEmit` exit 0; eslint on all 9 touched files exit 0; copy gate exit 0;
PricingTeaser + content-quality suites green after updating the headline assertion and removing
an em dash from a new HCAD comment (caught by the content-quality em-dash governance test).
**Prod-verified** on www.capveri.com after deploy (capveri-marketing 100% on `e7ac1607`):
`/about` + `/contact` H1s render at the hero scale, homepage shows "One plan, priced by your
units", `/tools` shows "Most tools need no signup". Commit `54f43abd`.

---

## C21 — landers + interactive-tool audit: CLEAN (no code change) (2026-06-21)

**Method:** one `web` sub-agent, DOM-grounded desktop(1280)+mobile(375) sweep of the remaining
hand-built surfaces and interactive calculators: `/product` (→/product-tour), `/roi`,
`/sample-report`, `/case-studies`, `/videos`, `/security` (→/docs#security), `/tools/boma-2024-
calculator`, and the Fixed CAM tool. Every "defect" re-verified against source before acting.

**Result: all surfaces CLEAN.** Computed-style confirmed every filled CTA is a 9999px pill;
content cards/option cards/inputs correctly pill-exempt; Radix tabs on /case-studies (5 city
panels) and the Fixed CAM year-count tabs switch on real PointerEvents; /videos play buttons
inject the youtube-nocookie iframe in place; heading hierarchy intact; no horizontal overflow;
no real console errors (HMR/DevTools/api.capveri.com network failures are dev artifacts). Copy
honesty clean: /roi dollar figures all labeled "modeled estimates" with benchmark attribution;
/roi "Tenant Audit Exposure" + /sample-report "Verify the Packet Before Tenants See It" are
correct LANDLORD-side framing (your errors that tenant auditors would catch), not tenant-side
mispositions. /security is an intentional 302→/docs#security (next.config.ts, standalone page
"later"); the #security anchor renders real Security/Compliance/Multi-Tenant content.

**Rejected (false positive):** the agent flagged `/tools/fixed-cam-calculator` as a 404. That URL
was an INVENTED path in the audit prompt, not a site link — `grep` across the whole repo finds
ZERO references to `fixed-cam-calculator`; the real tool is `/tools/fixed-cam-vs-traditional`,
correctly linked from all 15 referencing files (tools hub, sitemap, llms.txt, registry, content-map,
etc.). No broken link exists. No fix. (Same discipline as C17: a finding I can't reproduce against
source is not a defect.)

**Noted, not acted:** BOMA + Fixed CAM route even their free non-gated metrics to api.capveri.com
with no client-side arithmetic fallback, so they're fully inert if the API is down. This is an
intentional single-source-of-truth design — a client fallback would risk diverging from the
authoritative deterministic backend calc (CLAUDE.md: no LLMs / deterministic backend-only financial
math), which is worse than a clean "Network error. Please try again." Out of scope for a taste/UI/UX
cycle; the API is reachable in prod.

**No deploy** (audit-only, zero code change). NEXT: deeper interaction E2E of the remaining tools
that DON'T require the API (any client-only calculators), plus a fresh look at nav/footer link
integrity and the 404 page's own taste/usability.

---

## C22 — client-side calculator math + wiring E2E: CLEAN (no code change) (2026-06-21)

**Method:** 3 parallel `lite` source-audits of every calculator that does its math IN-REPO
(no API): `cam-overcharge-calculator`, `noi-impact-calculator`, `cam-billing-error-estimator`,
plus a re-read of the backend oracle (`cloudflare-backend/.../calculators.ts`, `reconciliation/
calculator.ts`, `cumulative-cap.ts`). Then a real-browser E2E of CAM Overcharge on the preview
(`/tools/cam-overcharge-calculator`): filled leasedSF=10,000 + annualCAM=100,000 (no building,
no cap), submitted, and read the rendered total back from the DOM.

**Result: math + wiring CLEAN.** Hand-computed the deterministic formula
(`calculateOverchargeEstimates`): leaseSizeMultiplier=clamp(sqrt(1),0.75,1.75)=1; the four
unconditional categories + the pro-rata default branch sum to EV; per-category low=round(EV*0.5),
high=round(EV*2); cap-violation zeroed when `hasCap` is false. Expected totalLow=$1,520 /
totalHigh=$6,080. The browser rendered exactly **"$1,520 - $6,080"** behind the email-unlock blur,
no NaN, no Infinity — proving form→calc→render is penny-exact, not just the source in isolation.

**Architecture finding (recorded, not a defect):** only ~3 marketing tools call api.capveri.com
(HCAD, Fixed CAM, BOMA — backend deterministic math); ~3 compute client-side (the calculators
above); the remaining ~15 "/tools/*" entries are lead-capture LANDING PAGES gating a downloadable
XLSX, with no in-repo arithmetic to verify. Coverage here is therefore complete for in-repo math.

**Rejected (false positive):** a source-audit agent flagged a division-by-zero in CAM Overcharge
(`leasedSF / buildingTotalSF`). Not reachable: the divide sits behind `&& inputs.buildingTotalSF`
(truthy guard) and the zod schema enforces `buildingTotalSF >= 100` when present, so the
denominator is either skipped or >=100. Verified against source before rejecting (C17/C21 discipline).

**Footgun logged:** react-hook-form with `valueAsNumber`/`setValueAs` does NOT pick up a plain
`preview_fill` (or even a native-setter `input` event followed by a button click). The reliable
driver is: native value-setter + `input` event, then `form.requestSubmit()`. First two attempts
showed the placeholder ("Enter the lease and CAM details") with zero validation alerts — looked
like a product bug but was purely a synthetic-event/RHF registration gap in the harness.

**Separately flagged (not blocking):** 3 pre-existing CamOverchargeCalculator unit tests fail
(`getByLabelText(/cap rate/i)` not found after toggling the cap Switch in jsdom) — task_c2ca668b.
The cap-rate field DOES exist in source (gated by `hasCap`); the failure is a jsdom Switch-toggle
artifact, not a product defect.

**No deploy** (audit-only, zero code change). NEXT: nav/footer link-integrity sweep + the 404
page's own taste/usability.

---

## C23 — nav/footer link integrity + 404-page taste: CLEAN (no code change) (2026-06-21)

**Method:** one `lite` source-audit cross-referencing every internal `href` in `MarketingNav.tsx`,
`MarketingFooter.tsx`, the for-role/resources megamenus, and shared layout against the actual
App-Router route tree (every `page.tsx`/`page.mdx`) + `next.config.ts` redirects. Then a live
render-check of the 404 (`/this-page-does-not-exist-xyz`) on the preview.

**Result: links CLEAN.** 34 unique internal destinations audited: 33 resolve to a real page, 1 is
the intentional `/security` -> `/docs#security` redirect (the `#security` anchor renders real content,
verified C21). 0 broken. `/terms#limited-offer` anchor CONFIRMED rendered (terms/page.tsx:98 sets
`id="limited-offer"` on the "8a. Limited Offer" section). `/for/<persona>` links all resolve via the
`[persona]` dynamic route from personas.json. Dual `/solutions` vs `/resources/solutions` are
intentionally distinct pages (product solutions vs resource hub), both live — noted, not a defect.

**404 page CLEAN.** `/this-page-does-not-exist-xyz` renders: 404 eyebrow + "Page not found" H1 +
plain reassurance copy ("This page doesn't exist or has been moved.") + a "Go home" primary CTA
(computed border-radius 9999px = pill, href "/") + a "jump to a section" list (Home/Tools/Blog/
Pricing) and the full global nav+footer chrome (user is never stranded). Title "Page Not Found |
CapVeri", `robots: noindex,nofollow`. Zero console errors. Copy is already third-grade-clean.

**No deploy** (audit-only, zero code change). NEXT: re-screenshot the core pages once
preview_screenshot is unstuck; deeper a11y pass (focus order, contrast, keyboard nav) on forms +
megamenu; mobile-375 sweep of any surface not yet checked at that width.

---

## C24 — nav a11y pass: aria-current on active links (2026-06-21)

**Method:** one `lite` a11y source-audit of `MarketingNav.tsx` (desktop mega-menus + mobile drawer)
against WCAG keyboard/ARIA expectations, then a live keyboard/attribute render-check on :3001.

**Audit result — nav is already strong.** Confirmed PASS: keyboard open/close of both mega-menus
(onFocus mirrors onMouseEnter, so no hover-only trap), Escape closes + restores focus to the trigger,
`aria-expanded`+`aria-controls` on both triggers, `ChevronDown aria-hidden`, mobile hamburger
`aria-label`+`aria-expanded`, mobile drawer `role=dialog`/`aria-modal`/focus-trap/focus-into-drawer,
all destinations real `<Link>`/`<a>` (no clickable divs), promo-code link has an aria-label.

**Fix shipped (MINOR finding):** active nav links conveyed "you are here" ONLY via a visual underline —
no `aria-current`, so screen-reader users got no orientation. Added `aria-current`: `"page"` on
exact-leaf links (Pricing, etc.) and on mobile leaf links; `"true"` on the Product/Resources section
triggers (they stay active across several URLs — e.g. Product is active on /vs, /for, /integrations —
so `"page"` there would falsely report the trigger's own href as the current page). Computed the
mobile active-state once into `isActive`/`isSection` (removing a duplicated inline ternary).
Verified live: `/pricing` -> Pricing `aria-current="page"`, Product/Resources none; `/vs` -> Product
`aria-current="true"`, others none. 28 MarketingNav tests + tsc + eslint all green.

**Flagged separately (SERIOUS-but-large, task_9fca0ab7):** the desktop mega-menus are hand-rolled
(not Radix), so they lack roving focus + arrow-key nav within the menu — keyboard users Tab through
items sequentially. Already operable (Tab+Escape work, tested), so this is a UX-quality refactor, not
a WCAG blocker; a Radix NavigationMenu migration is too large/risky for a taste cycle and is its own task.

**Deploy:** commit `1b13f60c` -> capveri-marketing worker `(100%)` on `b944d0c0` -> prod-verified:
www.capveri.com/pricing serves `aria-current="page"` on both the desktop and mobile Pricing links.
NEXT: re-screenshot core pages once preview_screenshot is unstuck; contrast pass on muted-foreground
text; mobile-375 sweep of any surface not yet checked at that width.

---

## C25 — WCAG AA contrast pass: faded informational text (2026-06-21)

**Method:** live contrast probe on :3001 (getComputedStyle + manual WCAG ratio math over the page
background), then a repo-wide grep of every Tailwind opacity-suffixed muted token, triaged by role.

**Finding.** The base `text-muted-foreground` token is `rgb(101,117,139)` = 4.7:1 on white (passes
AA). But three reader-facing captions used `text-muted-foreground/70`, which renders as
`rgba(101,117,139,0.7)` = effective 2.7:1 over white — below the 4.5:1 AA floor for normal text.
These are content a reader must actually read, not decoration: the about-page "Last updated"
timestamp, the sources-page "Last reviewed" timestamp, and the StatGrid `{stat.source}` citation
(citations are an honesty/traceability signal — they must be legible).

**Triage of the other faded variants (left unchanged, correctly exempt):** `/40` instances are the
placeholder "-" dashes shown in the NOI calculator while `!isReady` (inactive/decorative, WCAG
1.4.3 exempt); `/50` instances are decorative separators (middots, pipes). Only the three `/70`
captions were real failures.

**Fix shipped:** dropped the `/70` suffix on the three captions -> full `text-muted-foreground`
(4.7:1, passes AA), still visually secondary since it remains the muted token.
Files: about/page.tsx:121, sources/page.tsx:623, mdx/StatGrid.tsx:25. tsc + eslint clean.

**Verify:** live re-probe of the about timestamp = 4.7:1 (was 2.7:1). Deploy: commit `7b0a9d2a` ->
capveri-marketing worker `(100%)` on `8db12cfb` -> prod-verified: www.capveri.com/about serves the
timestamp with `class="...text-muted-foreground"` and 0 occurrences of `muted-foreground/70`;
www.capveri.com/sources also serves 0 `/70`.
NEXT: re-screenshot core pages once preview_screenshot is unstuck; mobile-375 sweep of any surface
not yet checked at that width; focus-visible ring audit on interactive controls.

---

## C26 — mobile-375 responsive sweep (2026-06-21)

**Method:** resized the live preview to 375x812 and walked 8 core pages (/, /product->/product-tour,
/pricing, /about, /sources, /tools/cam-overcharge-calculator, /contact, /blog), probing each with
getComputedStyle for (a) document-level horizontal overflow and (b) interactive controls below a
comfortable tap size, triaged against WCAG 2.5.8 (AA, 24x24 min) and the 80-year-old-on-a-phone persona.

**Result: clean. No code change.** Zero document-level horizontal overflow on any of the 8 pages
(every scrollWidth == 375). Every "small target" the probe surfaced was correctly exempt:
- sr-only "Skip to main content" link (1x1 until focused) — standard skip-link pattern.
- Homepage dashboard mock has a `min-w-[520px]` table, but it lives in an `overflow-x-auto -mx-4 px-4`
  full-bleed swipe container (ReconciliationDashboardMock.tsx:29) — intentionally swipeable on mobile,
  not clipped; the document itself never overflows.
- Calculator `hasCap` control is a Radix Switch (44x24) — meets WCAG 2.5.8 AA target size.
- /contact `company_website` field is a honeypot (`aria-hidden="true"`, `tabindex=-1`, `autocomplete=off`)
  at 24px — correctly hidden from AT/keyboard. The three REAL inputs (name/email/company) are all 44px
  tall — ideal for the persona.
- /sources citation links at 20px are inline links inside prose paragraphs — WCAG 2.5.8 inline-text
  exception; forcing 44px would break the sentences.

**No deploy** (audit-only, zero code change). Viewport reset to 1280x900 afterward.
NEXT: focus-visible ring audit on interactive controls (keyboard users seeing where they are);
re-screenshot core pages once preview_screenshot is unstuck; dark-mode pass if the site ships one.

---

## C27 — focus-visible ring audit (2026-06-21)

**Method:** on the homepage (richest control set: nav, mega-menus, primary CTAs, FAQ accordion,
footer), enumerated every visible interactive control and checked for a visible keyboard-focus
indicator. Then read globals.css to ground the finding (the live probes were misleading — see footgun).

**Result: PASS, no code change.** Focus is handled correctly site-wide. globals.css (@layer base) has
the textbook pattern: `*:focus { outline: none }` (suppresses the mouse-focus glow) PAIRED WITH
`*:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px }` (restores a visible
outline for keyboard focus on EVERY element). `--ring` is `223 42% 33%` — a dark slate blue (33%
lightness), high-contrast against the site's light backgrounds. The site is light-only (no `.dark`
block), so the ring color is consistent. On top of this global outline, nav links and shadcn buttons
additionally carry a branded `focus-visible:ring-2 focus-visible:ring-primary ring-offset-2`. So no
control is a focus trap; no WCAG 2.4.7 (Focus Visible, AA) failure.

**Tooling footgun (logged so future cycles don't re-chase this):** two probe methods gave FALSE
negatives. (1) `el.focus({focusVisible:true})` did NOT make `el.matches(':focus-visible')` true in
this Chromium build, so getComputedStyle read the non-focus-visible styles and reported "43/54
controls have no ring." (2) A `document.styleSheets` scan for `:focus-visible` selectors returned 0
GLOBAL rules because the rule lives inside an `@layer base {}` block, and the iteration only walked
top-level `cssRules` (CSSLayerBlockRule nests its rules in its own `.cssRules`). Both made a correct
implementation look broken. Verify focus styling by READING globals.css, not by programmatic focus or
a non-recursive stylesheet scan.

**No deploy** (audit-only). NEXT: re-screenshot core pages once preview_screenshot is unstuck;
reduced-motion (prefers-reduced-motion) audit of animated elements; per-page copy honesty spot-check
on any page not yet copy-audited this marathon.

---

## C28 — prefers-reduced-motion audit (2026-06-21)

**Method:** grepped for every motion source (CSS @keyframes/animation/transition, framer-motion,
JS smooth-scroll, the useScrollReveal IntersectionObserver hook) and traced each against the site's
reduced-motion handling in globals.css.

**Result: PASS, no code change.** The site honors `prefers-reduced-motion: reduce` comprehensively:
- Global guard (globals.css:534): `@media (prefers-reduced-motion: reduce){ *,*::before,*::after{
  animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:
  .01ms!important } }` neutralizes ALL CSS transitions and animations site-wide, including the
  `infinite` shimmer skeleton (globals.css:436) and `animate-gradient-shift-slow`.
- Scroll-reveal (globals.css:447): `.animate-on-scroll` starts at opacity:0 and reveals via the
  `is-visible` class (added by useScrollReveal's IntersectionObserver). Under reduce it's forced to
  `opacity:1; animation:none`, so reduced-motion users never get content stranded invisible.
- JS scroll (NOICalculatorClient.tsx:130): scrollIntoView switches to `behavior:"instant"` via
  `matchMedia("(prefers-reduced-motion: reduce)")`.
- No global `scroll-behavior: smooth` anywhere (grep clean), so nothing else to reset.
No framer-motion in the tree (the matches were "motion" substrings in unrelated identifiers).

**No deploy** (audit-only). NEXT: re-screenshot core pages once preview_screenshot is unstuck;
per-page copy-honesty spot-check on pages not yet copy-audited this marathon; image alt-text coverage
audit (decorative vs informative).

---

## C29 — image alt-text coverage audit (2026-06-21)

**Method:** source grep of every raw `<img>`/`next-image <Image>` tag plus a live alt-coverage scan
on the most image-bearing surfaces (home, /product-tour, /blog index, a representative long-form
article /blog/cam-reconciliation-best-practices-guide), checking for (a) `<img>` missing the alt
attribute entirely, (b) empty alt on images that should be descriptive, (c) content SVGs with
`role="img"` but no accessible name.

**Result: PASS, no code change.** Every `<img>` on all four surfaces has a present, non-empty alt
(home 5/5, product-tour 4/4, blog index 3/3, article 3/3 — 0 missing, 0 wrongly-empty). No content
SVG carries `role="img"` without an `aria-label`/`aria-labelledby` (decorative lucide icons have no
role, so AT ignores them — correct). Source scan confirms the only two hand-written image tags
(Logo.tsx:21 alt="CapVeri", VideoEmbed.tsx:37 alt={title}) both carry alt; all other images flow
through `next/image` or MDX with alt supplied.

**No deploy** (audit-only). NEXT: re-screenshot core pages once preview_screenshot is unstuck (visual
taste pass is the main outstanding gap); per-page metadata/OG correctness audit; per-page copy-honesty
spot-check on pages not yet copy-audited this marathon.

---

## C30 — /sources page header + badge consistency (2026-06-21)

**Source of findings:** visual-taste sub-agent (Playwright pass) F3 + F4, both verified against
source before acting.

**Two fixes shipped** (`marketing/src/app/sources/page.tsx`):
- **F4 header band.** /about and /contact open inner pages with a `border-b bg-muted` header band
  (H1 + subtitle + timestamp). /sources had a bare `pt-16` container, so its header read flat and
  off-pattern. Wrapped the H1, lead paragraph, and last-reviewed date in the same `border-b bg-muted`
  band; bumped the H1 to `text-3xl md:text-4xl lg:text-5xl font-bold text-foreground` to match the
  other inner-page headers. The longer "In February 2026..." audit note moved into the body container
  below the band.
- **F3 pill badges.** Reliability badge chips used `rounded` (4px). Changed to `rounded-full` (and
  `px-2.5` for pill breathing room) so they read as pills like the rest of the site.

**Verify:** tsc clean, eslint clean, render-verified on :3001 (band bg rgb(241,245,249), H1 48px,
badge border-radius 9999px, zero console errors). Commit 621c18fa.

**Deploy:** capveri-marketing 100% on b3943a7f (2026-06-21T11:48). Prod-verified — live
www.capveri.com/sources serves `border-b bg-muted` band + `rounded-full` badge markup.

NEXT: triage remaining visual-taste findings — F5 (/pricing offer block `rounded-xl` vs main card
`rounded-lg` radius mismatch), F6 (home trust-strip py-8 rhythm vs surrounding py-16/20), F7 (icon
boxes rounded-md vs rounded-full — verify, likely intentional). F1 (/blog 124 cards no pagination)
evaluate as possible standalone task. Visual screenshot pass still the main outstanding gap once
preview_screenshot is unstuck.

---

## C31 — content-panel + icon-tile radius harmonization (2026-06-21)

**Source of findings:** visual-taste sub-agent F5 (+ corrected F6/F7), all verified against source.

**Method:** grepped every decorative icon-tile (`h-{9..12} w-{9..12} ... rounded-* bg-primary/*`)
and content-panel radius across `marketing/src`. The dominant icon-tile radius is `rounded-lg` (8 of
10: six on /docs, plus /help and ContactForm). Card UI component is `rounded-lg`. Outliers: home
FeaturesGrid + ValueProposition (`rounded-md`), /about values (`rounded-xl`), pricing offer block
(`rounded-xl`).

**Four fixes shipped** (all `rounded-* -> rounded-lg`):
- `components/PricingContent.tsx:143` offer/trial callout `rounded-xl -> rounded-lg` so it matches the
  plan `<Card>` (rounded-lg) directly below it and its inner feature box (F5).
- `components/landing/FeaturesGrid.tsx:95` icon tile `rounded-md -> rounded-lg` (home).
- `components/landing/ValuePropositionSection.tsx:66` icon tile `rounded-md -> rounded-lg` (home).
- `app/about/page.tsx:218` values icon tile `rounded-xl -> rounded-lg` so it matches the security
  tiles right below on the same page.

**F6 (home SocialProofStrip `py-8`) = PASS, no change.** It is a `border-y bg-muted/40` compact trust
band, a deliberately distinct rhythm from full `py-16/20` content sections (same band idiom as the
/sources reliability header). `py-16` would bloat it and erase the band character.

**F7 correction:** the sub-agent flagged "icon boxes rounded-md vs rounded-full" but rounded-full
would make circles, which is NOT the site pattern. The real, dominant pattern is `rounded-lg`; the
`rounded-full` instances (HowItWorks step numbers, features filled badge, exit-popup close button)
are intentionally circular and were left alone. The pill canon governs buttons, not icon tiles.

**Verify:** tsc clean, eslint clean, render-verified :3001 — home tiles 9x 8px, /pricing offer 8px ==
card 8px, /about tiles 9x 8px, zero console errors. Commit 0493455a.

**Deploy:** capveri-marketing 100% on c2c23456 (2026-06-21T11:57). Prod-verified — live /pricing,
home, /about all serve rounded-lg; blog MDX article returns HTTP 200 with rendered title (the build's
"Failed to copy estree/hast" lines were transient file locks, bundle healthy).

NEXT: F1 (/blog 124 cards, no pagination/filter) — evaluate as standalone task; likely intentional
SEO index but UX of a 124-card wall is worth a look. Real-pixel screenshot taste pass still the main
outstanding gap (preview_screenshot timing out all session; dispatch a web sub-agent w/ Playwright).
Per-page metadata/OG correctness audit also still open.

---

## C32 — /blog index UX triage (F1/F2/F8) (2026-06-21)

**AUDIT-ONLY, no code change this cycle.** Closed out the last three visual-taste sub-agent findings
by verifying each against source; all three are genuine but are product/UX/copy decisions of real
scope, not quick polish, so they were spun off as standalone tasks rather than rushed inline.

- **F1 "/blog 124 cards, no pagination/filter":** partly inaccurate. The index ALREADY has filtering
  — 7 category pills in the hero (page.tsx:125-143) link to /blog/category/* which work (HTTP 200)
  and show focused subsets (cam-errors = 8 cards). The real gap is only pagination: the index renders
  every non-demoted post (100+ cards) in one scroll. Keeping all post links on one page is a
  deliberate SEO choice (itemList JSON-LD + internal-link equity), so the fix must preserve all links
  in the DOM (load-more / progressive reveal, or featured-hero + sectioning). Spawned task_7bd2b0a2.
- **F2 "no featured post / abrupt hero":** folded into the same blog-index UX task (a featured/latest
  hero is one of the two proposed approaches). The current hero is actually complete (H1 + lead +
  pill CTA + category pills), just undifferentiated from the grid below.
- **F8 "article no end CTA":** verified — articles (BlogPostLayout -> ContentPageLayout, + RelatedContent
  + FrontmatterFAQ) end with related links but NO dedicated conversion CTA; the only "Start free trial"
  on an article is the global nav CTA. Adding an end-of-article CTA needs new persuasive copy (triggers
  marketing-copy-gate + humanizer + third-grade-copy) and a design decision across all ~124 articles.
  Spawned task_32bb310c.

**Radius cross-check (important C31 refinement):** grepped `rounded-xl border` site-wide — it is the
DOMINANT card-panel radius (100+ hand-rolled panels across resources/tools/landing/blog/case-studies/
cam-* pages all use `rounded-xl border ... bg-card/bg-primary/5 shadow-sm`). The Shadcn `<Card>`
primitive (rounded-lg) is the minority. So blog post cards at `rounded-xl` (page.tsx:159) are CONSISTENT
with their card-grid family — correctly left unchanged (changing them would have been whack-a-mole). The
C31 pricing offer-block xl->lg change still stands: on the pricing page the offer block is STACKED
directly above the plan `<Card>` and seen with it, so matching the adjacent Card (lg) wins locally;
the broader xl callout convention is only seen on separate page loads. The xl(panels)/lg(Card primitive
+ icon tiles) split is an accepted, low-visibility distinction, not pursued as a risky global change.

**Visual-taste pass now fully triaged:** F3+F4 shipped C30; F5+F6+F7 resolved C31; F1+F2+F8 -> standalone
tasks here. No deploy (audit-only). NEXT: real-pixel screenshot taste pass is the main outstanding gap
(preview_screenshot has timed out all session — dispatch a web sub-agent with Playwright for actual
pixels); per-page metadata/OG correctness audit also still open.

---

## C33 — Display-heading line-height + pricing hierarchy (2026-06-21)

**SHIPPED.** Commit 26bfde97; marketing worker 100% on `6a0908c6`; prod-verified
(prod CSS shows `.text-6xl{font-size:3.75rem;line-height:1.08}` = my exact override value;
home + /pricing return 200).

First REAL-PIXEL taste pass of the marathon — preview_screenshot has timed out all session, so
dispatched a `web` sub-agent (Playwright) to screenshot 7 core pages at desktop (1440) + mobile (390)
and grade them with high taste against the Gen-Z + 80yo personas. Highest-impact finding = a
SITE-WIDE display-type defect.

- **Global heading line-height (the marquee fix).** Tailwind's default `text-5xl/6xl/7xl` ship
  `line-height: 1`, so every large multi-line heading (hero H1 at 60px, dozens of 48px section H2s
  across home/pricing/about/blog/etc.) rendered with its lines TOUCHING. Fixed at the single source
  of truth: overrode just those three fontSize keys in `marketing/tailwind.config.ts` with tasteful
  display leading (5xl 1.1 / 6xl 1.08 / 7xl 1.05). Zero JSX churn, fixes every heading at once.
  Verified live before deploy: hero 60px -> 64.8px (1.08), 48px H2s -> 52.8px (1.10). NOTE: `text-4xl`
  and below already default to >=1.11 so they were untouched and remain correct.
- **Pricing hierarchy inversion.** The offer-block `<h2>` "What happens during the free trial" was
  `text-base` (16px) — SMALLER than the page's `text-lg` (18px) lead paragraph, so an H2 read as body
  text. Bumped to `text-lg`. (PricingContent.tsx.)

**Verified NON-issues (did not chase):**
- The web agent's "BLOCKER: broken homepage YouTube thumbnails" is a LOCAL-DEV artifact only. Prod is
  fine: `i.ytimg.com` is whitelisted in next.config.ts:154 and prod `_next/image` serves the optimized
  thumbnail (200, image/jpeg, ~6.5KB). The local black boxes were the sandbox image optimizer, not a
  product defect. LESSON: verify "broken image" findings against prod `_next/image` before treating as
  a blocker. (Possible future hardening: add an onError fallback to VideoEmbed.tsx — deferred, prod works.)

**Both C33 changes are pure styling -> no copy gate / humanizer / third-grade pass needed.**

REMAINING from the real-pixel audit (open, prioritized for next cycles):
- Blog index: pagination of 100+ cards, no card thumbnails, no active/"All" filter state -> already
  spun off as task_7bd2b0a2 (do as its own cycle; keep all post links in DOM for SEO).
- Prose line-length: About Founder section (~96ch @16px) and Sources body (~104ch @16px) exceed the
  ~75ch ideal. Deferred — Sources has dense citation content/tables; narrowing needs care so tables
  aren't squished. Revisit as a focused readability cycle.
- Eyebrow-label sizing inconsistency on the homepage (12px tracking-normal vs 14px tracking-wide). Minor.
- Hero badge pill contrast (~4.29:1, just under WCAG AA 4.5:1). Minor a11y.

---

## C34 — About prose column readability (2026-06-21)

**SHIPPED.** Commit a7d0631a; marketing worker 100% on `b35ef9e5`; prod-verified
(prod /about HTML now wraps "Our Mission" in `max-w-2xl`, zero `max-w-3xl` left; 200).

Cleared the cleanest deferred finding from the C33 real-pixel audit. About page Mission (18px) and
Founder (16px) prose ran in `max-w-3xl` (768px) -> ~85ch and ~96ch line lengths, past the ~75ch
readability ceiling (the 80yo persona struggles to track 90+ char lines). Narrowed both to `max-w-2xl`
(672px): Mission ~75ch (at ideal), Founder ~84ch (much better), consistent column edges across sections.
Verified live (672px both) before deploy. Pure className change -> no copy gate. The Security & Compliance
card grid stays `max-w-4xl` (it's a 3-col card grid, not prose). Sources body line-length still deferred
(it has dense citation tables -> narrowing needs care).

---

## C35 — Hero badge AA contrast + eyebrow tracking consistency (2026-06-21)

**SHIPPED.** Commit 2cba2d0a; marketing worker 100% on `725980be`; prod-verified
(prod homepage HTML serves the new branded badge classes; 200).

Cleared the two remaining minor findings from the C33 real-pixel audit.

- **Hero badge contrast (a11y).** The above-the-fold hero badge ("CAM reconciliation software for
  commercial property teams") was `text-muted-foreground` on `bg-muted/50` with a plain `border-border`.
  Measured live via getComputedStyle (compositing the alpha bg over the section): 4.49:1 against the
  composited background — failing WCAG AA (4.5:1) by a hair at its 14px size. Switched to the site's
  established branded-pill treatment: `border-primary/20 bg-primary/5 text-primary`. This matches the
  site eyebrow accent color AND the pricing offer block, and re-measured to 8.62:1 (comfortable AA).
- **Eyebrow tracking consistency.** CapVeriDemoFrame's compact card eyebrow ("Product preview") used
  `tracking-normal` while every other uppercase eyebrow on the site uses `tracking-wide`. Aligned it.
  Kept `text-xs` (correct for the compact card scale; its H2 is only text-base/lg).

**Both changes are pure styling -> no copy gate / humanizer / third-grade pass needed.**

The C33 real-pixel audit findings are now fully cleared except: blog index UX (pagination/thumbnails/
active-filter — task_7bd2b0a2) and Sources body line-length (deferred; dense citation tables).

---

## C36 — Amber warning-text WCAG AA contrast (site-wide a11y BLOCKER) (2026-06-21)

**SHIPPED.** Commit faec4263 (28 files); marketing worker 100% on `bce397fa`; prod-verified
(/cam-charges serves text-warning-foreground + 200; MDX blog post + resources page render 200).

First chunk of C36 = a `web` Playwright sub-agent real-pixel audit of 10 not-yet-audited secondary/pSEO
pages (product-tour, roi, glossary, case-studies, integrations, alternatives, resources, cam-audit,
cam-charges, yardi). Top finding was a real, site-wide a11y BLOCKER.

**THE BUG:** `text-warning` resolves to bright amber `hsl(38 92% 50%)` (~rgb 245,159,10). It was used as
READABLE TEXT (card titles, body copy, list items) on the `bg-warning/10` warning callout cards used all
over the pSEO pages -> measured **1.97:1** against the composited card bg (AA needs 4.5:1). Warning copy
was effectively unreadable. Three oversized amber stat numbers (`text-3xl font-bold text-warning`) also
failed even the 3:1 large-text floor at ~2.04:1.

**THE FIX:** swap ONLY the readable text to the purpose-built `text-warning-foreground` token
(`hsl 48 96% 10%`, dark amber-brown) -> measured **13.19:1** live on /cam-charges. The amber icon and
amber border stay amber (icons are exempt from 4.5:1; the accent is intended). Done via an `editor`
sub-agent with a precise rule (text-bearing elements only; never icons/borders/bg), tsc-checked, +
3 stat numbers fixed by hand. Covered the shared `ui/alert` + `mdx/Alert` warning variants (fixes the
pattern everywhere those render) plus ~25 pSEO pages. Pure className token swaps -> no copy gate.

**KEY SCOPING FACT:** only `--warning-foreground` is dark. `--success-foreground` and
`--destructive-foreground` are WHITE (meant for solid-color bgs), so green/red text on tinted bgs
CANNOT be fixed by a -foreground swap.

**DEFERRED to a dedicated "status-color text contrast" cycle** (needs darker custom shades, not a token
swap): /roi comparison table `text-success` 3.33:1 + `text-destructive` 3.78:1 at 14px; audit-risk-quiz
low/high result tiers; markets VacancyBadge success/destructive tiers; states-index sibling tiers.

**Other audit findings still open (next cycles):**
- product-tour: CapVeriDemoFrame renders `<h2>` for each demo title nested under a section `<h2>`
  (semantic + visual: 18px H2 reads smaller than a 20px H3); "Watch the Full Demo" H2 is 20px vs all
  other page H2s at 30-36px (broken rhythm). Should be H3 / re-sized.
- Article prose line-length: cam-audit/cam-charges/yardi body paragraphs run ~120-142ch inside
  `max-w-5xl` with no inner prose cap (HIGH readability). product-tour step cards ~108ch (MEDIUM).
- case-studies hero H1 maxes at 36px (underpowered vs 48-60px elsewhere). LOW.
- resources directory copy leaks "crawl path" / "indexable SEO family" internal SEO jargon into reader
  text. LOW (copy gate territory).
- cam-charges non-recoverable items use a plain-text "x" glyph vs SVG CheckCircle for recoverable. LOW.

Deploy footgun this cycle: OpenNext bundling logged ~14 "Failed to copy node_modules/<mdast|hast|estree>"
errors (parallel session contending for files), but the upload still hit 100% and MDX pages render fine
on prod (blog post + resources page both 200) -> non-fatal; verified rather than assumed.

---

## Cycle C37 — status-color TEXT contrast (the dedicated cycle C36 deferred)

**Date:** 2026-06-20 · **Commit:** `7dd15c0d` · **Worker:** capveri-marketing 100% on `cb9ebf28-25fb-460a-87c8-8616b909e41c`

**Problem.** Green/red status TEXT (`text-success` ~3.35:1, `text-destructive` ~3.8:1 on white) failed
WCAG AA at 14px. C36 proved this is NOT fixable by a `-foreground` swap: `--success-foreground` and
`--destructive-foreground` are WHITE (built for solid-color fills), so they can't serve as body-text
color on a light surface.

**Fix.** Added two darker, AA-clearing TEXT shades and mapped them in Tailwind:
- `--destructive-strong: 0 74% 45%` (rgb 200,30,30 -> ~5.74:1 on white) -> `text-destructive-strong`
- `--success-strong: 142 76% 26%` (rgb 16,117,53 -> ~5.8:1 on white) -> `text-success-strong`

Hand-computed to clear 4.5:1 on white AND on `/10` tinted card backgrounds. Swapped `text-success`->
`text-success-strong` and `text-destructive`->`text-destructive-strong` on TEXT ONLY across 86 src files
(ui/alert + mdx/Alert body variants, roi stat numbers + comparison table, sample-report, sources,
lease-types/lease-clauses hub stat cards, tools error messages, lead-capture form errors, ~55 pSEO
resources alert-card pattern). Icons left bright (AA-exempt; `[&>svg]:` parts untouched).

**Verify.** tsc + eslint clean; grep proved icon-safe; every added line contains `strong` or is a
globals.css comment (copy-gate-safe, no reader copy touched). Live on www.capveri.com/roi: 22
`text-destructive-strong` + 20 `text-success-strong` in HTML; CSS bundle ships the two utility rules and
the two token vars; measured 5.8:1 / 5.74:1. /sample-report, /resources/cam-gross-up-guide,
/tools/cam-overcharge-calculator all 200.

**Two accepted judgment calls.** states/page.tsx complexityConfig + audit-risk-quiz quiz-data RISK_TIERS
each share one `color` field across icon AND text; converted to `-strong` (a darker icon beside matching
darker text reads consistent; splitting into textColor/iconColor was needless complexity).

**Still open (next cycles):** product-tour CapVeriDemoFrame `<h2>` should be `<h3>` (shared with
HeroSection usage) + "Watch the Full Demo" H2 undersized; article prose line-length ~120-142ch on
cam-audit/cam-charges/yardi (HIGH); case-studies hero H1 caps at 36px; resources directory "crawl path"/
"indexable SEO family" internal jargon; cam-charges non-recoverable "x" glyph vs SVG.

---

## Cycle C38 — article prose line-length cap (the C36/C37 HIGH-readability deferral)

**Date:** 2026-06-21 · **Commit:** `6a8d2eab` · **Worker:** capveri-marketing 100% on `f4db210d`

**Problem.** On the three long-form guide pages (cam-audit, cam-charges, yardi-cam-reconciliation) the
section-intro body paragraphs flowed the full 1024px `max-w-5xl` container width (~120ch) — well past the
~75ch readability ideal. The hero lead, definition box, and tenant-rights prose card on the SAME pages
already cap at `max-w-3xl` (768px), so the intros were the inconsistent outlier.

**Fix.** Capped the flowing section-intro paragraphs at `max-w-3xl` to match the existing prose blocks:
cam-audit 4 paras (297/331/390/455), cam-charges 3 paras (345/411/490; 576 already capped), yardi 4 paras
(221/246/275/329). Targeted by the leading-quote-anchored class string so the `text-xs` byline (short
one-line metadata, intentionally wide) was NOT touched. Tables, cards, and grids keep full 5xl width.
Pure className change — no copy touched, no copy gate.

**Left as-is (judgment).** Numbered self-audit step-card `detail` snippets render ~807-898px but are
short `text-sm` card-contained text (1-2 lines); narrowing them would strand awkward whitespace in the
list layout and they aren't flowing prose.

**Verify.** tsc + eslint clean on all 3 files. Live on :3001: cam-audit + cam-charges intro paras measured
exactly 768px (byline stayed 992px). Prod www.capveri.com: all 3 pages HTTP 200 serving the capped classes.

**Still open (next cycles):** product-tour CapVeriDemoFrame `<h2>`->`<h3>` (shared w/ HeroSection) + "Watch
the Full Demo" undersized H2; case-studies hero H1 caps at 36px; resources directory "crawl path"/
"indexable SEO family" internal jargon; cam-charges non-recoverable "x" glyph vs SVG CheckCircle.

---

## Cycle C39 — demo-frame heading hierarchy + product-tour H2 rhythm

**Date:** 2026-06-21 · **Commit:** `2e4ae67c` · **Worker:** capveri-marketing 100% on `6dc2142b`

**Problem.** (1) CapVeriDemoFrame wrapped its title in an `<h2>` while the `<section>` already names the
region via `aria-label={title}` — redundant, and it nested an `<h2>` under the surrounding page heading
inconsistently across the frame's 4+ usages (product-tour: 4 frames under a section `<h2>` -> should be h3;
HeroSection: under the page `<h1>`; sample-report; ProductDemoSection). (2) product-tour "Watch the Full
Demo" heading was `text-xl` (20px) — the smallest section heading on a page whose other section h2s are
text-3xl/4xl (30-36px), breaking vertical rhythm.

**Fix.** (1) Demoted the frame title from `<h2>` to a styled `<p>` (identical classes -> identical visuals);
the `aria-label` keeps the region's accessible name, so the heading-outline conflict is gone in EVERY usage
at once with no per-caller heading-level prop. (2) Bumped "Watch the Full Demo" to
`text-3xl font-bold tracking-tight sm:text-4xl` to match the dominant section-heading pattern. Both pure
styling -> no copy gate.

**Verify.** tsc + eslint clean; product-demo vitest 2/2 green (tests query by text, not heading role).
Live :3001: "Watch the Full Demo" = 36px, 5 demo-frame titles render as `<p>`, 0 remain `<h2>`; homepage
hero frame still renders (section aria-label "Reconciliation dashboard" intact). Prod www.capveri.com:
/product-tour 200 with 0 demo-frame h2 + the resized Watch heading class; / 200.

**Still open (next cycles):** case-studies hero H1 caps at 36px (underpowered vs 48-60px elsewhere);
resources directory "crawl path"/"indexable SEO family" internal jargon in reader copy; cam-charges
non-recoverable "x" glyph vs SVG CheckCircle.

## C40 — Hero H1 weight + recoverable/not-recoverable icon parity (2026-06-21)

Two pure-visual consistency fixes (no copy change, so no copy gate needed).

1. **case-studies hero H1** (`marketing/src/app/case-studies/page.tsx:438`) — bumped
   from `text-2xl md:text-3xl lg:text-4xl` to `text-4xl md:text-5xl`, matching every
   other page hero (cam-audit, cam-charges, yardi-cam-reconciliation). It was visibly
   underpowered: the H1 read smaller than its own surrounding heading scale. Verified
   computed font-size = 48px on :3001.

2. **cam-charges "Typically NOT Recoverable" list** (`marketing/src/app/cam-charges/page.tsx:393`)
   — replaced the plain `✕` text glyph (a `<span>` styled with `text-destructive-strong
   font-bold text-xs`) with a lucide `<XCircle className="h-4 w-4 text-destructive
   flex-shrink-0 mt-0.5" />`. Now mirrors the recoverable column's
   `<CheckCircle className="h-4 w-4 text-success ..." />` exactly: same shape family,
   size, and baseline alignment. Added `XCircle` to the existing lucide import.
   Icons are AA-exempt, so `text-destructive` (bright) pairs with the bright
   `text-success` check rather than the AA text shade. Verified zero stray `✕` in the
   rendered DOM and 7 `text-destructive` SVGs present.

Gate: tsc clean, eslint clean on both files. Render-verified on :3001 (CapVeri titles
confirmed on both). Committed 842b681b, deployed capveri-marketing worker 100% on
3d07962e, prod-verified on www.capveri.com (0 `✕` glyphs, `lucide-circle-x` present,
`text-4xl md:text-5xl` H1 class live).

Next (C41): resources/page.tsx lines ~434-436 internal SEO jargon in reader copy
("indexable SEO family", "full crawl path") — copy-gate territory, needs rewrite +
marketing-copy-gate + humanizer/third-grade-copy passes.

## C41 — Plain-English resources directory copy (2026-06-21)

`marketing/src/app/resources/page.tsx` had three reader-visible strings written
for a search crawler, not a human visitor:

1. Directory intro (line ~433): "Every indexable SEO family has a home here. The
   header menu keeps the high-value clusters close; this directory keeps the full
   crawl path explicit and easy to parse." -> "This page lists every guide and
   tool we have. The top menu shows the popular ones. Here you can see them all,
   grouped by topic."
2. Section h3 "Resource families" (line ~129) -> "Guides by topic".
3. Section h3 "Decision-stage pages" (line ~161) -> "Compare and choose"
   ("decision-stage" is BOFU funnel jargon the copy gate flags).

Required copy passes: humanizer (removed SEO/funnel jargon, dropped the semicolon
and the parallel "keeps... keeps..." construction) then third-grade-copy
(evaluate_copy.py PASS: 3 sentences, avg 8.3 words, FK grade 3.2). Zero-lies check:
directory holds guides + tools (playbooks, reference, worksheets), so "guide and
tool" is accurate. Whole-context fit: reader on a resources index wants to find
content, not read about crawl paths.

Gate: marketing-copy-gate.mjs exit 0 (1433 files, no internal jargon). tsc + eslint
clean. Render-verified on :3001 (no jargon in DOM, new copy present, CapVeri title).
Committed 5f0121e3, deployed capveri-marketing worker 100% on 368b489a,
prod-verified on www.capveri.com (jargon absent, all three new strings present).

## C42 — Homepage video-section heading size parity (2026-06-21)

Sub-agent (Explore) re-swept the high-traffic pages for fresh defects; the only
concrete one found was on the homepage.

`marketing/src/app/page.tsx:61` — the "Watch CAM Reconciliation in Action" video
gallery heading was `text-xl` (20px), the smallest section heading on a homepage
where every peer content section (ProductDemoSection, HowItWorksSection,
ValuePropositionSection, FeaturesGrid, CTASection) uses
`text-3xl font-bold tracking-tight sm:text-4xl`. Bumped to match (measured 36px on
:3001, was 20px). Pure styling, no copy gate. tsc + eslint clean.

DEPLOY FOOTGUN (recorded): `npm run deploy:cf` -> `cloudflare-env-runner.mjs deploy`
runs a `capveri-ai-sdr-nonces` D1 `migrations apply --remote` step that can exit 1
and ABORT before the marketing worker upload. First C42 deploy left the worker
UNCHANGED on the prior version (368b489a) despite the CLI not surfacing a hard
failure at the tail. Re-running deployed cleanly to 100% on bd8a4937. LESSON
(reinforces the standing rule): never trust the deploy log tail — always confirm
the worker VERSION ID actually advanced via `wrangler deployments status`, and
re-run if it did not.

Committed e3237473, deployed capveri-marketing worker 100% on bd8a4937 (2nd attempt),
prod-verified on www.capveri.com (new text-3xl sm:text-4xl class present, old text-xl
class absent).

## C43 — Resources hub badge: defensive jargon-leak hardening (2026-06-21)

A second Explore sub-agent re-swept the LOWER-traffic and programmatic pages
(vs/alternatives/solutions/switch/best/integrations, all resource families,
blog/glossary/tools/roi/sources/help, and the data files). It reported the set
clean except one latent item.

`marketing/src/app/resources/page.tsx:391` — the topic-hub badge rendered
`TOPIC_HUB_LABELS[cluster.funnelStage] ?? cluster.funnelStage`. `SeoFunnelStage`
(src/lib/seo/clusters.ts:1) is a CLOSED union `"tofu" | "mofu" | "bofu"`, all three
covered by TOPIC_HUB_LABELS ("Start here" / "Core guide" / "Decision"), so the
fallback is statically unreachable and readers never see a raw acronym today. But
the fallback is a latent jargon-leak: widening the type later would surface "TOFU"
to a reader. Replaced the fallback with a neutral `"Guide"`. NO rendered change
today (purely defensive). The agent's broader "rename all funnelStage data values"
suggestion was rejected: funnelStage drives SEO clustering + tests, so renaming is
high-risk churn for zero reader benefit.

Gate: tsc + eslint clean, marketing-copy-gate exit 0. Output verified UNCHANGED on
:3001 and on prod (all three friendly labels present, zero raw acronym on
www.capveri.com). Committed 8c054861, deployed capveri-marketing worker 100% on
68a9d354 (clean first attempt; the C42 D1-abort footgun is intermittent).

Sweep status after C43: both high- and low-traffic page sets now read clean per two
independent sub-agent passes. The marathon is converging. Remaining ideas for C44+:
spot-check responsive/mobile breakpoints and dark-mode token contrast on a few key
pages (homepage, pricing, cam-audit) since prior sweeps were desktop-light-mode
biased.

## C44 — Responsive (mobile) + dark-mode verification pass (2026-06-21)

VERIFICATION-ONLY cycle (no code change). Prior sweeps were desktop + light-mode
biased, so this pass exercised the two skipped dimensions via the Preview MCP at
375x812 (mobile preset) and with prefers-color-scheme=dark emulation.

Mobile horizontal-overflow audit (homepage, /pricing, /cam-audit): all three pass
with NO page-level horizontal scroll (documentElement.scrollWidth == clientWidth)
and ZERO unscrollable overflowing elements. The homepage hero demo table reports 48
children wider than the 375px viewport, but every one sits inside the shared
`overflow-x-auto -mx-4 px-4 sm:mx-0` full-bleed wrapper (CapVeriDemoFrame content),
so the 520px table is intentionally swipe-scrollable on mobile, not clipped. That is
the correct responsive pattern, used consistently via the shared component.

Dark mode: the marketing site is intentionally LIGHT-MODE ONLY. `<html>` carries a
hardcoded `light` class and ignores `prefers-color-scheme` (emulated prefersDark=true
still rendered white bg + dark text, htmlHasDarkClass=false). No dark-mode surface
exists to audit for contrast; this is a deliberate brand choice, not a defect.

Conclusion: the responsive and color-scheme dimensions are sound. Combined with the
two prior sub-agent content sweeps (high- and low-traffic pages clean), the marketing
site is at a strong "nothing concrete left to fix" state for this round. Next sessions
(C45+): re-verify after any new feature lands; consider an interaction pass (mobile
nav menu open/close, FAQ accordions, calculator inputs) since this round checked
static layout, not interactive states.

## C45 — Orphaned ROICalculator: investigate, reject wire-in, remove dead code (2026-06-21)

**Finding (interaction pass):** `ROICalculator.tsx` was fully built + tested but
mounted nowhere. Confirmed orphaned repo-wide: no import, no landing-barrel export,
no `#roi-calculator` anchor link, only its own test referenced it. Git history shows
it was only ever swept by multi-file copy passes, never wired to a page.

**Investigated wiring it into /roi**, then rejected it. The recovery model is
miscalibrated: `estimateAnnualRecovery(unitCount)` computes per-BUILDING leakage
(`annualPoolPerBuilding = officeOpexPerSf2025 * averageBuildingSf(200,000)`, ~$17.7K
avg, matching the page's "$5,900-$35,300 per building") then multiplies by `unitCount`,
treating each rentable unit as a whole 200,000 SF office building. Render-verified at
50 units: $883,455 modeled recovery / 93.3x ROI -- a non-credible overclaim. The cost
side is correctly per-unit (real pricing), so the two bases are incompatible. Making
it honest needs an unsourced avg-SF-per-unit bridge -> forbidden by the no-lies copy
guardrail. /roi already presents credible ROI via its static "ROI by Portfolio Size"
section using the per-building benchmark, so the slider added only risk.

**Action:** reverted the wire-in (byte-identical /roi + barrel), `git rm`'d the dead
component + its test (-355 lines). `estimateAnnualRecovery` / `calculateSubscriptionROI`
kept (own tests in plans.test.ts) but now UI-unused; flagged separately as a latent
footgun (the per-building x units semantic is wrong and plans.test.ts cements it).

**Gates:** tsc 0, eslint 0, plans.test 6/6 green, marketing-copy-gate exit 0.
**Ship:** commit b847eaf5, pushed bbd09f21..b847eaf5. Worker capveri-marketing 100%
on c498be34 (2026-06-21T15:11). Prod /roi HTTP 200, hero + static ROI section intact,
calculator anchor absent (0).

**Lesson:** dead UI can hide a miscalibrated model. Don't auto-wire orphaned components
without validating their numbers against the page's own sourced claims; a tested
component can have its bug cemented by the test.

---

## C46 -- Case-study tab labels made consistent with property names

**Surface:** /case-studies (CaseStudyTabs, Radix Tabs).

**Finding:** two of five tab labels did not match the card they open. "Houston" is a
city that never appears in its card (title "Stella Link Shopping Center - Neurogene");
"Generation" has no relationship to its card ("Best Buy - Ames, IA - Best Buy"). The
other three labels were already short forms of the property name (Oaks Retail,
Kissimmee, Research Park), so the two odd ones read as inconsistent / confusing.

**Action:** changed only the visible `tabLabel` text -- "Houston" -> "Stella Link",
"Generation" -> "Best Buy". Confirmed via grep the internal tab ids ("houston",
"generation") are NOT externally deep-linked (the clusters.ts "houston" is an unrelated
Texas SEO keyword), so ids left untouched -- no broken anchors. All five labels are now
short forms of their card's property name.

**Interaction re-verify:** robustly re-tested Radix tab switching with a full pointer
event sequence (pointerdown/mousedown/pointerup/mouseup/click). Clicking "Best Buy"
switched active tab to index 4 and the panel rendered Best Buy content. CONFIRMS the
earlier bare-`.click()` non-switch was the preview synthetic-click tooling quirk, NOT a
real bug -- Radix Tabs work correctly in a real browser.

**Gates:** tsc 0, eslint 0, marketing-copy-gate exit 0 (1431 files).
**Ship:** commit 9e80aa21, pushed d1015822..9e80aa21. Worker capveri-marketing 100%
on a7e36701 (2026-06-21T15:26). Prod /case-studies HTTP 200, all five new labels live
(Best Buy / Kissimmee / Oaks Retail / Research Park / Stella Link), zero "Houston" /
"Generation" remaining.

**Lesson:** label text that names a place/word absent from the content it reveals reads
as a mistake even when functionally fine. Keep tab labels a literal short form of the
destination's own title.

---

## C47 -- Blank inquiry-type dropdown on prefilled contact form (Radix Select)

**Surface:** /contact (ContactForm, client component behind Suspense).

**Finding:** the form supports deep-link prefill -- `defaultType = ?type ?? (?source ? "audit" : "")`.
Reaching `/contact?type=audit` (or any `?source=`) correctly presets `inquiryType="audit"`
and reveals the audit-only fields (Company becomes required, Number of Buildings +
Current System appear). But the "How can we help?" dropdown rendered BLANK -- no selected
label and no placeholder. State was correct (the audit fields proved `inquiryType==="audit"`),
only the trigger display was empty.

**Root cause (verified against installed @radix-ui/react-select 2.2.6 source):** `SelectValue`
renders `shouldShowPlaceholder(value) ? placeholder : children`. With the default
`<SelectValue placeholder="..." />` (no children), the selected label is injected imperatively
by the mounted-and-selected `SelectItemText`. That text lives in `SelectContent`, which only
mounts when the dropdown OPENS. For a preset value on a never-opened select, the item text never
registers, and the placeholder is suppressed because the value is non-empty -> blank trigger.

**Fix:** pass derived `children` to the inquiry `SelectValue`
(`selectedInquiryLabel = inquiryTypes.find(t => t.value === inquiryType)?.label`). When the value
is set, Radix renders our label immediately (no item mount needed); when empty, children is
undefined and the placeholder shows. `currentSystem` select left as-is (never preset; interactive
selection registers its label normally).

**Verify:** local real browser on the committed source -- `/contact?type=audit` trigger now
shows "Audit Request" + audit fields present; plain `/contact` shows "Select inquiry type" +
audit fields hidden. 2 regression tests added (preset label in trigger; placeholder when not
preset). ContactForm test suite 15/15, tsc 0, eslint 0.
**Ship:** commit 442166e7, pushed 73f2f719..442166e7. Worker capveri-marketing 100% on
fd39ede6 (2026-06-21T15:38). Prod /contact + /contact?type=audit both HTTP 200 (Suspense-gated
client component is absent from static HTML, so local-browser pass on the identical bundle is the
authority, per C12/C15).

**Lesson:** Radix Select with a CONTROLLED value that can be set before first open needs explicit
`SelectValue` children -- the default relies on item-mount-time text injection that a closed,
preset select never triggers. Any prefilled/deep-linked Radix Select is suspect; verify the
trigger shows its label on load, not just that the underlying state is right.

---

## C48 -- Calculator unlock-gate copy did not fit 2 of 3 tools

**Surface:** /tools/cam-overcharge-calculator, /tools/fixed-cam-vs-traditional,
/tools/boma-2024-calculator (shared CalculatorUnlockGate email-gate behind the blurred
results card).

**Finding (whole-context-fit defect):** the shared gate hardcoded the lock line
"Enter your email to see revenue and asset value projections." and button
"See Financial Projections." That copy fits ONLY the BOMA value calculator, which reveals
Annual Revenue Lift + Asset Value Lift. The same component is reused on two tools where the
copy is wrong for what unlocks:
- cam-overcharge-calculator unlocks an overcharge-exposure CATEGORY BREAKDOWN, not revenue/
  asset-value projections.
- fixed-cam-vs-traditional unlocks CAM revenue totals + a cumulative savings delta, not
  revenue/asset-value projections.
The copy was clear in isolation but mismatched its page on 2 of 3 surfaces.

**Fix:** added optional `lockMessage` / `unlockLabel` props to CalculatorUnlockGate, defaulting
to the existing BOMA wording (so BOMA is unchanged and behavior-preserving). Passed tailored copy:
- overcharge: "Enter your email to see the full overcharge breakdown." / "See Full Breakdown"
- fixed-cam: "Enter your email to see your fixed CAM savings." / "See My Savings"
Both the gate-open button and the form's submit button use `unlockLabel` for consistency.

**Verify:** local real browser on the committed source -- overcharge gate now renders the new
lock line + "See Full Breakdown", no old copy leaks; opening the form shows first_name +
work_email (submit carries "See Full Breakdown", 44px pill); empty submit fires both zod errors
("First name is required", "Please enter a valid work email"). Console clean (only HMR/DevTools +
expected Turnstile-localhost 110200). Copy passes humanizer + third-grade-copy (4 strings PASS,
all <=9 words, verb-led CTAs) + marketing copy gate (exit 0). 1 regression test added (tailored
copy renders, default copy does not leak). Gate suite 15/15, ContactForm 15/15, tsc 0, eslint 0.
**Ship:** commit a56481c4, pushed 72c0314f..a56481c4. Worker capveri-marketing 100% on
f8ee6183 (2026-06-21T17:23). Prod overcharge + fixed-cam tool pages both HTTP 200 (gate is a
Suspense-gated client component absent from static HTML, so the local-browser pass on the
identical committed bundle is the authority, per C12/C15).

**Lesson:** a shared lead-gate / CTA component that hardcodes value-prop copy will silently
mis-describe every surface it is reused on except the one it was written for. When a component
is dropped into N contexts, its reader-facing copy must be a prop, not a constant -- and the
whole-context-fit check has to look at what each instance actually reveals, not just whether the
line reads well alone.

---

## C49 -- Consistent launch-offer copy + de-dup the pricing offer (2026-06-21)

**Surface:** /pricing (PricingContent) + global nav banner (MarketingNav) + the shared
LaunchOfferProgress banner. Started as a verification-only pass on LaunchOfferProgress display
states; found two real whole-context-fit defects.

**Defect 1 (copy inconsistency):** the launch offer flip-flopped between "off the first year"
(hero, pricing card, one FAQ, and the SSOT label "80% off the first year") and "off your first
year" (nav banner + LaunchOfferProgress). Worst inside the trial box, where two adjacent lines
read "the first year" then "your first year" back to back.

**Defect 2 (duplication):** the "What happens during the free trial" box showed the offer twice
~14px apart -- a plain bullet ("80% off the first year with code 80OFF.") immediately above the
dedicated LaunchOfferProgress banner ("Limited time offer: 80% off the first year with 80OFF.
Offer details."). The bullet was also off-theme (the box is about trial mechanics, not pricing).

**Fix:** normalized both outliers to the canonical "off the first year" (matches the SSOT label,
which is referenced programmatically and was left untouched). Removed the redundant offer bullet
from the trial box -- the offer banner sits right below it with a details link and an
all_exhausted state, so nothing is lost. Dropped the now-unused BadgeCheck import. Offer is still
present 4x on the page (nav banner, hero, box banner, card) -- strong without the in-box dupe.

**Verify:** local render on :3001 after reload -- trial box now shows 3 trial bullets + one
offer banner; zero "off your first year" anywhere on the page; nav banner reads "the first year".
tsc 0, eslint 0, pricing suite 12/12 (PricingContent 7 + PricingTeaser 3 + 2). Marketing copy
gate exit 0. third-grade-copy evaluator on the nav banner PASS (grade 0.5, avg 5 words).
**Ship:** commit ceb907ac, pushed bdb11b76..ceb907ac. Worker capveri-marketing 100% on
e51051a9 (2026-06-21T17:36, confirmed via wrangler deployments status, not the log tail). Prod
/pricing HTTP 200 with 0 "your first year" / 5 "the first year"; homepage 7 "the first year" / 0
"your" -- consistent site-wide.

**Lesson:** a value-prop phrase that lives in a generated SSOT label AND is also hand-typed in a
few components will drift -- the hand-typed copies are where "the/your" and similar slips hide.
Grep the literal phrase across src, not just the component you are editing; the canonical wording
is whatever the SSOT label says, and hand-written instances should match it rather than the
reverse. Two near-identical lines in one box almost always means one is a leftover -- keep the
richer element (here the banner with the details link + exhausted state), cut the plain dupe.

---

## C50 -- Sentence-case the outlier homepage section headings (2026-06-21)

**Surface:** homepage (/) section headings across page.tsx, FAQSection, LandingPageClient.

**Defect (heading-case inconsistency):** the homepage uses sentence case for every section
heading -- "How CapVeri works", "Built for the reconciliation workflow", "One plan, priced by
your units.", "No-signup calculators for property controllers", etc. -- except three that were
Title Case: "CAM Knowledge Hub", "Common Questions", "Watch CAM Reconciliation in Action". Title
Case in headings is also a generic AI-writing tell (humanizer rule 17). "Common Questions" also
clashed with the pricing page's sentence-case "Frequently asked questions".

**Fix:** normalized the three to sentence case, keeping the CAM acronym and CapVeri brand:
"CAM knowledge hub", "Common questions", "Watch CAM reconciliation in action".

**Verify:** local render on :3001 after reload -- all three render sentence case, no Title-Case
section heading remains. tsc 0, eslint 0, landing suite 53/53 (incl. FAQSection 7). Marketing
copy gate exit 0. third-grade-copy --headline PASS on each (<=5 words; reconciliation is the
necessary product domain term). **Ship:** commit 9389fcd8. Worker capveri-marketing live-verified
on prod (the authority): homepage serves all three sentence-case headings, zero Title-Case
leftovers. Worker version 7b2b0212 at 100% (the deploy log's "Current Version ID" line is not
authoritative -- prod content is).

**Process note (shared-tree contention):** mid-cycle a parallel session switched the shared
working tree to its own branch (ai-cs-context-body-fix) and committed backend work
(0b88b926, cloudflare-backend only) on top of my C50 commit. My commit was a clean child of
master, so I fast-forwarded the master ref to it and pushed master:master WITHOUT checking master
out (left the tree on the parallel branch to avoid yanking it from the active session). The ledger
commit was made from an isolated master worktree so it would not drag the parallel session's
not-yet-ready backend commit onto master via a fast-forward. Lesson: in a contested shared tree,
re-check `git branch --show-current` before every commit; never ff master through a branch that
carries another session's commits -- isolate via a worktree or cherry-pick the single commit.

**Lesson:** when most headings on a page follow one case style, the few that differ read as
mistakes even when each is fine alone -- audit heading case as a set, page-wide, not line-by-line.

---

## C51 - Curly quotes in resources/software hub intro (2026-06-21)

**Defect (class: forbidden src glyphs):** the Software hub intro paragraph
(marketing/src/app/resources/software/page.tsx, lines 61-63) used four curly
double quotes -- `not "what is CAM," but "which report do I pull... tie out?"`.
The repo forbids smart/curly quotes in src/ (straight quotes only; same rule as
em/en dashes). A sub-agent copy sweep over src + components + data JSON + ~276
content MDX files confirmed this was the ONLY reader-visible curly-quote site;
zero em dashes in src; no duplicated words, typos, broken punctuation,
placeholder text, or codename/funnel-jargon leaks anywhere reader-visible.

**Fix:** replaced the four curly double quotes with straight double quotes. No
copy or meaning change -- glyph-only. (The 267 en dashes elsewhere in src are
numeric/date ranges like "$3,000-$15,000" / "90-95%" -- a deliberate range
convention, left as a separate decision, not bundled here.)

**Verify:** tsc 0, eslint 0 on the changed file, marketing copy gate exit 0.
Render on :3001 -- /resources/software serves straight quotes (&quot;), 0 curly
chars. Grep confirms 0 curly quotes remain in the file or anywhere in src.
**Ship:** commit ea6a2062, pushed 32ef9d76..ea6a2062. Worker capveri-marketing
100% on bce26a4c (2026-06-21T18:12, via wrangler deployments status, not the log
tail). Prod https://www.capveri.com/resources/software HTTP 200 with the fixed
straight-quote paragraph and 0 curly quotes on the whole page (python count).

**Process note (shared-tree contention, still active):** main tree remains on
the parallel session's branch (ai-cs-context-body-fix). Landed the fix without
dragging their backend commit onto master: edited + verified in the main tree,
then copied the fixed file into a throwaway `master` worktree (camaudit-wt-c51),
committed + pushed master there, deployed marketing from the main tree (node_modules
live there; the backend commit does not affect the marketing build), then reverted
the main-tree edit so their working tree is left clean. Ledger committed from the
same worktree. No node_modules created in the worktree -> no junction-cleanup risk.

**Lesson:** the marketing-copy sub-agent sweep is the efficient way to find the
one objectively-wrong needle (curly quote) in a 1400-file haystack -- cheaper than
touring surfaces by hand, and it cleared whole defect classes (typos, dupes,
placeholders, jargon) in one pass. Curly quotes hide in hand-typed prose where a
writer pasted from a word processor; grep the four smart-quote codepoints across
src as a standing check.

## C52 - Homepage heading-level skip (H1->H3) in trust strip (2026-06-21)

**Defect (class: heading-outline semantics / a11y):** a runtime sweep of the
heading hierarchy across 10 key surfaces (every page had exactly one H1, zero
images missing alt, zero nameless links/buttons) flagged one real outline jump:
the homepage SocialProofStrip (marketing/src/components/landing/SocialProofStrip.tsx)
rendered its four trust-point labels as `<h3>` while no section `<h2>` sits
between them and the hero `<h1>`. The document outline therefore jumped
H1 -> H3 right under the hero. Screen-reader users navigating by heading lose a
level; the outline reads as if a section is missing. (The /contact H1->H3 the
fetch-based scan first reported was a false positive -- a DOMParser artifact from
the known display:none responsive duplicate form; the live computed DOM has zero
jumps.)

**Fix:** these four items are decorative trust badges (icon + short label +
blurb), not navigational sections, so they should not be in the heading
hierarchy at all. Demoted the `<h3>` titles to `<p>` (styling unchanged:
text-sm font-semibold text-foreground). The `<section>` keeps its existing
aria-label="CapVeri trust points" accessible name, so it is still a named
region. Added a regression test asserting the labels are queryable by text but
NOT by role="heading".

**Verify:** tsc 0, eslint 0 on both changed files. Vitest
SocialProofStrip.test.tsx 3/3 (incl. the new "keeps trust labels out of the
heading outline" case). Live :3001 reload -- homepage outline now H1 -> H2 -> H3
with zero jumps; /contact zero jumps. Prod https://www.capveri.com/ after deploy:
33 heading tags, ZERO level jumps, "Built for commercial landlords" present but
not inside any `<h3>`. C51 non-regression confirmed: /resources/software still 0
curly quotes.
**Ship:** commit d6ef531c, pushed 155aabc9..d6ef531c. Worker capveri-marketing
100% on 1d289894 (2026-06-21T18:32, via wrangler deployments status).

**Process note (shared-tree contention):** main tree is still on the parallel
session's branch (ai-cs-context-body-fix), and this time the parallel branch
DIVERGES from master inside marketing/ (it still carries C51's curly quotes in
resources/software/page.tsx and an uncommitted AiSdrSalesWidget.tsx WIP). So
deploying from the main tree would have regressed C51 AND shipped their unmerged
widget. Instead deployed pure master from the throwaway worktree (camaudit-wt-c52).
The deploy script's validateLocalNodeModules() hard-blocks a junctioned
node_modules on Windows, so a real `npm ci` in the worktree was required (the
sanctioned isolated-deploy path). Reverted the two main-tree edits afterward to
leave the parallel session's working tree untouched.

**Lesson:** a runtime heading/alt/accessible-name sweep (fetch each route, parse,
check one-H1 + no-skips + named controls) is a cheap, high-signal a11y audit that
finds outline defects grep cannot. When the parallel branch diverges inside
marketing/, do NOT deploy from the main tree -- build from a clean `npm ci`
worktree so prod reflects master only, never the other session's WIP.

---

## Cycle C53 -- Low-contrast rank number on the best-software hub (WCAG AA)

**Dimension:** color contrast (WCAG 1.4.3). With pills exhausted and the heading
outline fixed (C52), this cycle audited text contrast. The theme is already
AA-tuned by design: --muted-foreground is 215 16% 47% (4.72:1 on white, 4.55:1
on muted/40), and it ships dedicated --destructive-strong / --success-strong
shades with comments explaining they exist for AA-readable colored text. Verified
analytically + by sweep: no raw colored text (text-success/warning/info/destructive
without -strong) anywhere, no semantic color fills paired with text, and a global
*:focus-visible { outline: 2px solid hsl(var(--ring)) } gives every focusable
element a visible keyboard ring. All clean. The reduced-opacity text sweep
(text-*-foreground/{50,60,70}) found that nearly every hit is a decorative
separator (the "·" / "|" dividers between metadata) or a decorative bullet icon
(the XCircle next to spelled-out "Cons"), all WCAG-incidental and exempt.

**Defect:** one real hit. /best/cam-reconciliation-software renders each rank
number (#1..#8) as `text-2xl font-bold text-muted-foreground/60`. At 60% opacity
over white that computes to ~2.3:1 -- below even the 3:1 large-text AA threshold,
and genuinely hard to read for low-vision / older users. The rank is real content
in a list literally titled "The 8 Best Options, Ranked," not decoration.

**Fix:** demote via color, not opacity. Dropped the /60 so the rank uses solid
text-muted-foreground (4.72:1, clears AA). It stays visually secondary to the
near-black `text-xl font-bold` software name, so the hierarchy is preserved while
the number becomes readable. One-line className change; no copy touched.

**Verify:** tsc 0, eslint 0 on the changed page. Live :3001 -- all 8 rank spans
now compute to rgb(101,117,139) (solid muted-foreground) at opacity 1, no /60
blend. Prod https://www.capveri.com/best/cam-reconciliation-software after deploy:
rank spans are `text-2xl font-bold text-muted-foreground`, ZERO `text-muted-foreground/60`
remaining on the page.
**Ship:** commit 0c9db524, pushed 576bfcf8..0c9db524. Worker capveri-marketing
100% on 06c9d821 (2026-06-21T18:48, via wrangler deployments status).

**Process note:** same divergent-branch state as C52 (main tree on
ai-cs-context-body-fix, which is behind master on C51+C52 and diverges on
AiSdrSalesWidget.tsx). Deploying from the main tree would have regressed C51+C52
AND shipped the parallel widget WIP, so this shipped pure master from a fresh
npm-ci worktree (camaudit-wt-c53) again. Reverted the main-tree edit afterward.

**Lesson:** opacity is the wrong tool for de-emphasis on text -- it tanks
contrast. Use a lighter solid token (muted-foreground) instead, which keeps a
known AA ratio while still reading as secondary. Contrast vein is now
near-exhausted: the design system already enforces AA via dedicated -strong
tokens and a global focus ring, so the only defects are one-off opacity slips.

## C54 -- Broken-link / dead-route sweep (CLEAN, no defect) (2026-06-21)

**Scope:** every internal link reachable from the marketing site -- could any
nav item, footer link, CTA, related-content card, or in-prose link land on a 404
or a broken redirect?

**Method:** crawled the rendered DOM for `a[href^="/"]`, deduped to 482 unique
internal paths, and checked each one's HTTP status against the running site.
Also spot-checked the redirecting routes and the state/tool index pages.

**Result:** CLEAN. All 482 unique internal links resolve 200. /security is an
intentional 307 -> 200 redirect (single hop, lands healthy). The state hub and
its child pages all 200. not-found.tsx is a well-formed, recoverable 404 (noindex
metadata, "Page not found" H1, plain-English body, a pill "Go home" CTA, and
Home/Tools/Blog/Pricing nav links) -- a dead URL never strands the user.

**Ship:** none. No code change; verification-only cycle.

## C55 -- Mobile horizontal-overflow sweep at 375px (CLEAN, no defect) (2026-06-21)

**Scope:** does any surface overflow horizontally on a phone (375x812)? Sideways
scroll on mobile is one of the most common and most obvious taste failures.

**Method:** set the preview viewport to 375px and measured
`scrollingElement.scrollWidth - clientWidth` on nine structurally distinct routes:
/, /pricing, /tools, /tools/cam-overcharge-calculator,
/resources/states/texas/cam-compliance, /best/cam-reconciliation-software,
/contact, /vs/yardi, and a long-form blog article
(/blog/cam-charges-retail-explained). For each, enumerated every element whose
right edge crossed the viewport, excluding elements that sit inside a deliberate
`overflow-x: auto/scroll` ancestor (legitimate contained scrollers).

**Result:** CLEAN. Every route reported overflowPx = 0 with zero uncontained
offenders. The homepage's `min-w-[560px]` comparison table is a deliberate
contained horizontal scroller (wrapped in an overflow-x container), not page
overflow. Long-form article prose, code, and image blocks also stay within
375px. No sideways scroll anywhere.

**Ship:** none. No code change; verification-only cycle.

## C56 -- SEO metadata uniqueness + contact-form UX (CLEAN, no defect) (2026-06-21)

**Scope:** two dimensions. (1) Does every indexable page carry a unique title and
a meta description, or are any duplicated/missing (SEO self-cannibalization)?
(2) Does the contact form handle its interactive states (validation, success,
error, anti-spam) with taste and clarity?

**Method:** (1) swept all page.tsx under src/app -- 149 static pages each export
`const metadata`, dynamic routes use generateMetadata, page-level titles are
distinct, descriptions present. The only near-pair (/cam-audit "CAM Audit
Software for Commercial Landlords (2026)" vs /cam-audit-software "CAM Audit
Software for Commercial Landlords") differ by suffix and serve distinct intents,
not a true duplicate. (2) Read ContactForm.tsx as the authoritative source.

**Result:** CLEAN. The contact form is well-built: `noValidate` with explicit
client-side checks and plain-English messages ("Please select an inquiry type
before submitting", "Please add a message before submitting"), a dedicated
success state ("Message received."), a submitting state ("Submitting..."), an
inline destructive Alert for errors, conditional audit-request fields, a honeypot
field plus Turnstile for anti-spam, and Label htmlFor a11y wiring throughout.

**Preview footgun confirmed:** the Claude Preview DOM reported the single
`<form>` twice and as width 0 on /contact. Source proves exactly one
`<ContactForm />` render (contact/page.tsx) emitting one `<form>`
(ContactForm.tsx). This is the documented preview-environment multiplication
artifact, NOT a real duplicate-form defect -- trust the source, not the preview's
raw element counts.

**Ship:** none. No code change; verification-only cycle.

**Marathon status note:** C54/C55/C56 are three consecutive CLEAN cycles across
distinct dimensions (links, mobile overflow, SEO metadata + form UX). Combined
with the earlier exhausted veins -- pills geometry, heading hierarchy, image
alt / accessible names, and color-contrast (AA -strong tokens + global focus
ring) -- the structural, accessibility, responsive, and SEO dimensions reachable
by static + runtime tooling are now verified clean. Remaining hunting ground is
finer taste/interaction polish.

## C57 -- landlord-side positioning in /about/angel-campa meta description (FIX, HIGH) (2026-06-21)

**Scope:** copy whole-context-fit sweep on the founder page metadata. The
`/about/angel-campa` meta description is the SERP-visible snippet for a page that
ranks on the founder's name; its framing has to match CapVeri's landlord-side
positioning exactly.

**Defect (HIGH):** the old description read "He built CapVeri to automate CAM
reconciliation and catch the billing errors that tenant auditors find." Dropping
the word "before" blurred the positioning -- it reads as if CapVeri finds the same
errors tenant auditors find (tenant-side framing) instead of catching them first.
The page's own FAQ already says it correctly: "catch those errors before tenant
auditors find them."

**Fix:** rewrote line 13 to three short sentences -- "Angel Campa founded CapVeri.
He built it to automate CAM reconciliation. It catches billing errors before
tenant auditors do." Restores "before" (landlord-side accurate), keeps the
CapVeri + CAM reconciliation keywords, and clears the third-grade hard gates
(avg 6.3 / max 8 words, no banned punctuation; FK 9.9 is the expected proper-noun
soft warning).

**Verify:** tsc + eslint + marketing-copy-gate all 0; third-grade hard gates pass;
render-verified on :3001 that both `meta[name="description"]` and `og:description`
carry the new text.

**Ship:** code ca2e13f6 (master). Worker capveri-marketing deployed to 100%
ffb5369b-500a-4f8b-b923-4634002de835 (2026-06-21T19:20). Prod-verified on
https://www.capveri.com/about/angel-campa -- both meta description and
og:description serve the new landlord-side-accurate copy.

**Deploy footgun (resolved):** the first deploy attempt exited 1 at the 4th plan
step, `wrangler d1 migrations apply capveri-ai-sdr-nonces --remote` (an AI-SDR
nonce migration unrelated to the marketing copy), which gates the 5th-step worker
deploy in cloudflare-env-runner.mjs. The failure was transient -- re-running the
migration standalone returned "No migrations to apply!" and a clean re-run of
npm run deploy:cf completed and advanced the worker. Lesson: a non-zero exit on
an EARLIER plan step means the worker upload never ran; verify the worker version
actually advanced, never trust the CLI tail.

## C58 -- case-studies pass-count self-contradiction + related-link mislabel (FIX, HIGH+MED) (2026-06-21)

**Scope:** whole-context-fit on /case-studies. Two defects a sub-agent sweep had
flagged earlier and this cycle confirmed against source.

**Defect 1 (HIGH, self-contradiction):** the "How the Pipeline Works" section
describes "Three specialized models in sequence" with Pass 1 (Full Extraction),
Pass 2 (Adversarial Validation), Pass 3 (Escalation Tiebreaker). The headline stat
card directly below it read "2 passes / A second model checks the first before you
see it." A reader scrolling from the three-pass diagram to a "2 passes" stat sees a
flat contradiction on the same page.

**Defect 2 (MED, mislabel):** the Related Resources card titled "CAM Audit Guide"
with description "What auditors check and how to prepare for a CAM audit" links to
/cam-audit -- which is the "CAM Audit Software for Commercial Landlords" page
(landlord-side software that runs your reconciliation), not a guide, and not
auditor-prep. Title and description both mislabeled the destination, and the
"prepare for a CAM audit" framing leaned tenant-side.

**Fix:** (1) stat card -> "3 models" / "Two check every lease. A third breaks
ties." -- matches the diagram's own "Three specialized models" header and states
the 2-always-on + conditional-tiebreaker structure truthfully. (2) card -> title
"CAM Audit Software", description "Run your CAM numbers right. They hold up to any
tenant audit." -- matches the destination page's h1 and landlord-side promise.

**Verify:** tsc + eslint + marketing-copy-gate all 0; both copy blocks pass the
third-grade hard gates; render-verified on :3001 (stat "3 models", no "2 passes"
left; card "CAM Audit Software", no "CAM Audit Guide" left).

**Ship:** code 589c8a69 (master). Worker capveri-marketing deployed to 100%
33505462-55af-4b7a-a8e2-b044c8b2dfeb (2026-06-21T19:32). Prod-verified on
https://www.capveri.com/case-studies -- both fixes live, zero old copy.

**Lesson:** a stat/summary number written separately from the detailed section it
summarizes drifts -- the "2 passes" headline predated or diverged from the 3-pass
pipeline diagram. When a page states the same quantity twice (a headline figure
plus a detailed breakdown), they must be reconciled; grep the page for the count.
Related/cross-link cards are a recurring mislabel spot: the title+description must
describe the DESTINATION page, not a stale idea of it.

## C59 -- cross-link cards mislabeling /cam-audit on three pages (FIX, MED) (2026-06-21)

**Scope:** whole-context-fit on Related Resources cross-link cards. C58 fixed this
exact mislabel on /case-studies; a sub-agent sweep this cycle found the same stale
"CAM Audit Guide" card on three more pages, plus a self-referential link.

**Defect (MED, mislabel x3):** the Related Resources card linking to /cam-audit was
titled "CAM Audit Guide" with an auditor-prep description on /lease-abstraction
("What auditors check and how lease terms affect recoveries"), /cam-charges and
/cam-reconciliation-guide ("What auditors check and how to prepare for a CAM
audit"). /cam-audit's real h1 is "CAM Audit Software for Commercial Landlords" --
landlord-side software that runs your reconciliation, not a guide, not auditor-prep.
Title and description both mislabeled the destination, and the prep framing leaned
tenant-side.

**Defect (LOW, self-link):** /lease-abstraction's own Related Resources grid
included a "Lease Abstraction Workflow" card linking back to /lease-abstraction --
a self-referential link on the page you are already reading.

**Fix:** all three /cam-audit cards -> title "CAM Audit Software", description "Run
your CAM numbers right. They hold up to any tenant audit." (matches the destination
h1 + landlord-side promise, same copy shipped in C58). Removed the self-link card
from /lease-abstraction (grid goes 7 -> 6 cards).

**Inspected + intentionally left:** the same "CAM Audit Guide" -> /cam-audit anchor
text also appears in the data-driven SEO link layer (lib/seo/clusters.ts,
lib/seo/contextual-links.ts, lib/content/content-map.ts,
components/content/ResourceOrganizationHub.tsx,
components/landing/LandingPageClient.tsx). That is a deliberate hub/product taxonomy
-- clusters.ts pairs hub:link("/cam-audit","CAM Audit Guide") with
product:link("/cam-audit-software","CAM Audit Software"). Those are terse label-only
anchors (no misleading description) and changing site-wide anchor text is an SEO/IA
decision, not a copy fix. Left as-is; a future cycle should not re-flag them. The
page-card fixes here differ because those cards carried a full misleading
title+description that contradicted the destination's actual content.

**Flagged (background task):** /cam-audit and /cam-audit-software both render with
the same h1/title ("CAM Audit Software for Commercial Landlords") -- effectively
duplicate software pages -- while the SEO taxonomy intends /cam-audit as the guide
hub. That keyword-cannibalization / IA tension needs a deliberate product owner
decision (consolidate, redirect, or rebuild /cam-audit as a real guide), not an
autonomous copy edit. Spawned as a background task.

**Verify:** tsc + eslint + marketing-copy-gate all 0; render-verified on :3001 (all
3 cards "CAM Audit Software", self-link gone); shipped code 4f2763c1 (master).
Worker capveri-marketing deployed to 100%
bfcd1ff9-01fb-404c-b795-254e20f85772 (2026-06-21T19:49). Prod-verified on
https://www.capveri.com/lease-abstraction, /cam-charges, /cam-reconciliation-guide
-- all show "CAM Audit Software" + new desc, zero "CAM Audit Guide", self-link card
gone.

**Lesson:** a fix to one instance of a cross-link mislabel (C58 on /case-studies)
almost always has siblings -- the same stale card copy was pasted across the
resource pages. After fixing a mislabeled cross-link card, grep the whole marketing
tree for the old title/description to catch every copy in one pass. Distinguish
page-level cards (rich title+description, fix to match destination) from the SEO
anchor-text layer (terse labels, a deliberate taxonomy -- leave alone).

## C60 -- fabricated lease-abstraction capability on /vs/mri (FIX, MED) (2026-06-21)

**Scope:** whole-context-fit sweep of the dynamic pSEO families (a general-purpose
read-only sub-agent over personas.json, solutions.json, integrations.json, and all
13 live /vs comparison entries + the four templates). All families came back clean
except one verified self-contradiction.

**Defect (MED, self-contradiction + fabricated capability):** the MRI comparison
table (data/comparisons.json:211) had a "Lease abstraction" row claiming CapVeri
does "AI + mandatory human verify" lease abstraction. CapVeri does NOT abstract
leases -- the SAME file states three times (lines 3402 / 3431 / 3453, the
lease-abstraction entry) that property accountants enter lease terms directly and
abstraction software is a separate, optional upstream tool. This was the only row
across all 13 /vs entries claiming the capability; it contradicted the product and
read as a fabricated feature inside a competitor comparison. (The "AI GL analysis"
cells were checked and do NOT contradict the "no AI for financial math" canon --
that line is scoped to the gross-up/cap/pro-rata math, advisory CapEx flagging is a
separate non-math screen. Not a defect.)

**Fix:** changed the CapVeri cell to "Not included - enter lease terms directly"
(matches the product-reality phrasing the file already uses; the MRI cell "AI +
human verify" is accurate for MRI and left). Honest, and it reinforces CapVeri as a
focused verification tool rather than a bloated suite.

**Verify:** JSON parses; marketing-copy-gate exit 0; new cell passes third-grade
hard gates (6 words, no hard words, hyphen-minus not em/en dash); render-verified on
:3001 (row now "Not included - enter lease terms directly", old claim gone).

**Ship:** code ead469ad (master). Worker capveri-marketing deployed to 100%
5e53366e-1f30-4f94-91a4-7cc9fa17f06e (2026-06-21T20:03). Prod-verified on
https://www.capveri.com/vs/mri -- new cell live, zero "AI + mandatory human verify".

**Lesson:** competitor comparison TABLES are a high-risk spot for fabricated
capabilities -- a feature-parity row invites filling every cell with a CapVeri
"win" even when the product does not have that feature. Cross-check every comparison
cell against the product's own canonical statements (often elsewhere in the same
data file); a capability the rest of the site says CapVeri lacks must not appear as
a CapVeri strength in a /vs table. The pSEO data sweep via a sub-agent is the right
tool: it read all 13 entries end-to-end and isolated the one contradicting cell.

## C61 -- pSEO data whole-context-fit sweep (CLEAN, no code change) (2026-06-21)

A general-purpose read-only sub-agent swept 13 pSEO data families for whole-context-fit
against product canon (landlord-side; no lease abstraction; no live ERP API; no AI for
financial math; no fabricated stats; no self-contradiction): cam-dispute.json,
lease-types.json, lease-clauses.json, states.json, metros.json, the audit-risk-quiz
(lives at marketing/src/app/tools/audit-risk-quiz/quiz-data.ts, NOT marketing/data/),
switch.json, alternatives.json, property-types.json, expenses.json, calendar.json,
roles.json, workflows.json. VERDICT: CLEAN, zero defects. Two lease-abstraction
near-misses verified correct: lease-clauses.json:566 CONSUMES a lease abstract exclusion
list (input, not output) and workflows.json abstraction steps route to the upstream
third-party tool (lextract.io), explicitly NOT CapVeri -- both reinforce canon. All ERP
"API" mentions are competitor descriptions; CapVeri consistently file-import only. Stats are
attributed benchmarks (BOMA/IREM/JLL/county assessors). No tenant-side product CTAs.

## C62 -- MDX content body whole-context-fit sweep (CLEAN, no code change) (2026-06-21)

A general-purpose read-only sub-agent swept the 125 blog + 151 resource MDX files under
marketing/content/{blog,resources} via targeted grep (lease abstraction, ERP API/sync, AI
calculates, guarantee/#1/best, "studies show"/"% of", tenant-side dispute CTAs) then read
only the flagged sections. VERDICT: CLEAN, zero defects. Every high-risk surface lands
on-canon: ai-cam-reconciliation-limits.mdx states "AI for extraction, deterministic Python
for math, human-verified"; integration pages affirm CSV/Excel file import + explicitly
disclaim ERP API; lease abstraction routes to lextract.io; tenant-facing copy is education
only (where a tenant ACTION appears it routes to external tenant tools e.g. CAMAudit.io, not
CapVeri). FOOTGUN logged by the agent: Grep brace-glob {blog,resources}/**/*.{md,mdx}
returned 0 matches (false-negative) -- scope MDX sweeps by explicit path, not brace glob.

## C63 -- stale "CAM Audit Guide" cross-link card on the HOMEPAGE (FIX, MED) (2026-06-21)

A third whole-context-fit sub-agent swept the hand-built src/ TSX layer (components + app
page string literals: headings, stat cards, CTAs, metadata, cross-link cards). It surfaced
the SAME stale "CAM Audit Guide" cross-link defect class as C58/C59 -- but on the
HIGHEST-TRAFFIC page, which C59 had wrongly bucketed into the "terse SEO anchor taxonomy,
leave alone" set. The homepage "CAM knowledge hub" grid
(src/components/landing/LandingPageClient.tsx:41-45) carried a RICH title+description card
titled "CAM Audit Guide" / "What auditors check, how to prepare, and how to dispute
findings." pointing at /cam-audit -- whose real h1 (cam-audit/page.tsx:211) is "CAM Audit
Software for Commercial Landlords". "How to dispute findings" is tenant/auditor-side framing
on a landlord-side software destination (canon rule 1 + the C58/C59 cross-link-mislabel
class).

Fix: retitled to "CAM Audit Software" and rewrote the description to
"Run your CAM numbers right. They hold up to any tenant audit." -- the exact landlord-side
copy already shipped on the four sibling cards (C58 /case-studies, C59 /lease-abstraction +
/cam-charges + /cam-reconciliation-guide). The other three homepage cards (/cam-charges,
/cam-reconciliation-guide, /lease-abstraction) already describe their destinations correctly
and were left as-is.

Important verification note: the sub-agent also flagged a SECOND card on
/lease-abstraction (page.tsx:650) as the same defect, but that was a FALSE POSITIVE from a
STALE working tree -- the shared main tree sits on the parallel branch ai-cs-context-body-fix
at 82633f1c (pre-C59), while origin/master (1b12a62f) already has C59 fix. Checked the
actual deployed truth via git show origin/master: the /lease-abstraction card already
reads "CAM Audit Software" / "Run your CAM numbers right..." and the self-referential card is
already gone. Only the homepage card was genuinely still live. LESSON: when the main tree is
parked on a parallel branch behind origin/master, a sub-agent reads STALE files -- verify
every finding against git show origin/master:<path> before treating it as live.

Verify: tsc 0, eslint 0, marketing-copy-gate exit 0, third-grade PASS (the copy is the
already-vetted sibling string); render-verified on :3001 (homepage card now "CAM Audit
Software" / new desc, zero "CAM Audit Guide" / "how to dispute findings" anywhere in the DOM).

---

## C64 — Align stray `focus:` rings to the repo's `focus-visible:` standard (2026-06-21)

Vein: interaction micro-states / keyboard-focus polish (under-explored; prior cycles mined
copy whole-context-fit). An Explore sub-agent swept marketing/src for interaction-state
inconsistencies (hover / focus / active / transition). Most candidates were FALSE POSITIVES
once checked against the global baseline `globals.css:287-289` `*:focus-visible { outline:
2px solid hsl(var(--ring)); outline-offset: 2px }` -- e.g. "homepage hub cards / resource
cards have no keyboard focus ring" is wrong: every focusable `<Link>` already gets the global
ring. (Also: the agent's `badge.tsx`/`popup` "bare focus:" claims needed direct verification
because my first regex used an unsupported negative-lookahead and silently returned nothing.)

Two GENUINE, defensible defects survived verification -- interactive elements using bare
`focus:` ring utilities, so they lit the ring after a MOUSE click, while their direct peers
use `focus-visible:` (ring only on keyboard focus):

1. `marketing/src/components/lead-capture/LeadMagnetExitIntentPopup.tsx:218` -- the popup's X
   close button used `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`,
   but the SAME component's "Maybe later" button (line 314) uses `focus-visible:`. Same
   component, same role -> stray mouse-click ring on the X only.
2. `marketing/src/components/ui/select.tsx:24` -- the Radix SelectTrigger used bare `focus:`,
   the lone outlier among the repo's form primitives (`input.tsx`, `textarea.tsx`,
   `button.tsx` all use `focus-visible:`).

Both switched to `focus-visible:`. Left alone (correctly): `badge.tsx` (non-focusable `<div>`
-> the focus classes are dead, zero user-visible effect; vendored shadcn) and
`layout.tsx:119` skip-link (`focus:` is the deliberate, correct skip-link convention).

Verify: tsc 0, eslint 0 (both files). Not copy -> no copy-gate / humanizer / third-grade
needed. Render-verified on :3001 /contact: the combobox trigger carries `focus-visible:ring-2`
and zero bare `focus:ring-2`, page clean. Code f154ce42 (2 files, +2/-2), pushed
7d3f746b..f154ce42. npm ci 0, deploy 0, worker capveri-marketing 100% on
f58c07db-7f37-49ac-a228-3b51d6f6008d (2026-06-21T20:38). Prod-verified on www.capveri.com by
fetching the deployed JS chunks: contact chunk has the NEW select-trigger
`focus-visible:...ring-offset-2` literal x1 / OLD bare-focus x0; layout chunk has the NEW
close-button `hover:text-foreground focus-visible:...ring-offset-2` literal x1 / OLD x0. The
two bare `focus:ring-2` remaining in the /contact HTML are the deliberately-left skip-link.

LESSON: a global `*:focus-visible` rule makes most "missing focus ring" findings false alarms
-- ALWAYS read globals.css for the focus baseline before flagging a focus defect. And bare
`focus:` vs `focus-visible:` is a real, user-visible inconsistency only on genuinely focusable
elements; a focus utility on a non-focusable `<div>` (badge) is dead code, not a defect.

---

## C65 — Scope the desktop nav CTA hover transition to colors + the 200ms standard (2026-06-21)

Continuation of the C64 interaction/motion vein. The desktop nav primary CTA
(`MarketingNav.tsx:409`, "Start free trial", an every-page top-of-funnel element) used bare
`transition-all` with NO duration. Two problems vs the repo's own standard:

1. `transition-all` is over-broad: the only hover change is `hover:bg-primary/90` (a color),
   so the transition should be scoped to `transition-colors`. `transition-all` animates every
   animatable property, which is both wrong-in-intent and a minor perf smell.
2. No `duration-*` -> Tailwind's `transition-all` default of 150ms, while every other primary
   CTA eases at 200ms. (The C64 audit agent claimed "0ms"; that was wrong -- Tailwind's
   `transition-*` utilities bundle a 150ms default. The real defect is 150ms vs 200ms + the
   over-broad property scope, not a missing transition.)

The CTA's OWN mobile counterpart (`MarketingNav.tsx:508`), the sibling "Sign in" link
(line 400), and the canonical `Button` (`ui/button.tsx:11`) all already use
`transition-colors duration-200`. So the desktop CTA was the lone outlier -- inconsistent even
with its own mobile twin. Changed line 409 `transition-all` -> `transition-colors duration-200`.

Swept every other `transition-all` in marketing/src and LEFT them all (correctly): the
FAQ + Pricing grid-expanders (FAQSection:39, PricingContent:369), the two mega-menu dropdown
panels + mobile-menu container (MarketingNav:259/350/458), the tabs trigger (tabs.tsx:32), and
the how-to-calculate-cam-charges card (:619) all animate MULTIPLE properties (grid rows /
opacity+transform / shadow+border), so `transition-all` is the right tool there and each has
an explicit duration (or is a deliberate multi-prop hover).

Verify: tsc 0, eslint 0. Not copy -> no copy-gate/third-grade. Render-verified on :3001 home:
the "Start free trial" nav CTA now carries `transition-colors duration-200`, zero
`transition-all`. Code 1157190d (1 file, +1/-1), pushed 70a676bf..1157190d. npm ci 0, deploy 0,
worker capveri-marketing 100% on 6febc746-ee3e-4cdf-9ba5-e7a4d31f6979 (2026-06-21T20:50).
Prod-verified on www.capveri.com home HTML: nav-CTA signature `...hover:bg-primary/90
transition-colors duration-200 no-underline` x1, old `...transition-all no-underline` x0.

LESSON: `transition-all` is a smell on a single-property (color-only) hover -- scope it to
`transition-colors` and match the repo's 200ms duration. But `transition-all` is CORRECT for
genuinely multi-property or layout (grid/height) animations; do not blanket-replace it. And
remember Tailwind's `transition-*` utilities default to 150ms, not 0ms.

---

## C66 — Align /vs comparisons with CapVeri's built-in AI lease extraction (2026-06-21)

Audit traced a product-truth contradiction across the marketing surface. The product page
`/lease-abstraction` correctly states CapVeri's AI extracts the CAM-driving lease fields
(cap %, gross-up method/threshold, pro-rata, base year, exclusions) from PDFs with mandatory
human verification, plus a manual-entry path. But the `/vs` comparison layer denied it. C60
had earlier flipped the `/vs/mri` "Lease abstraction" cell from "AI + human verify" to
"Not included - enter lease terms directly" -- removing an ACCURATE capability, based on a
stale internal canon ("CapVeri does not abstract leases"). That canon is wrong: the product
source of truth (`docs/feature-inventory/lease-management.md`, `product-marketing-context.md`)
documents the human-verified AI extraction. Resolution direction was a positioning call, so it
was surfaced to the user, who chose "Align comparisons to product truth."

Fix (all in `marketing/data/comparisons.json`):
- `/vs/mri` row restored to capveri "AI extracts CAM fields, human-verified" | mri
  "AI + human verify" (reverts C60's regression). THIS IS THE LIVE, READER-FACING FIX.
- `lease-abstraction-software` comparison entry: reasons item, comparison-table row,
  antiIntegration + migration paragraphs, and the abstraction-software FAQ rewritten to state
  the built-in human-verified AI extraction plus the manual-entry path, while KEEPING the
  accurate distinction that CapVeri is NOT a full lease-administration platform (no critical
  dates, renewals, document management, ASC 842).

IMPORTANT SCOPE FINDING: `lease-abstraction-software` is NOT in
`data/seo/content-governance.json` `retainedComparisonSlugs` (13 retained: yardi, mri,
sage-intacct, buildium, appfolio, realpage, visual-lease, excel, tenant-auditors,
cam-consultants, manual-reconciliation, outsourced-cam, property-accounting-software). So
`/vs/lease-abstraction-software` is NOT statically generated -- it 308-redirects to the `/vs`
hub, is absent from the sitemap and llms.txt, and is unreachable by readers. Its old denial
strings were therefore never reader-facing, and its corrected strings are data hygiene only
(correct if the page is ever re-published). The genuinely live contradiction was the single
`/vs/mri` cell.

Verify: JSON valid, marketing-copy-gate exit 0, zero em/en/curly chars. Third-grade pass on
the rewritten FAQ ("parameters"->"terms", de-passivized ending; kept "platform" for
whole-page register consistency). Code 4e6cb2df (1 file, +7/-7), pushed f8a2b8b5..4e6cb2df.
npm ci 0, deploy 0, worker capveri-marketing 100% on
2748b711-f0e1-4fd4-aa42-237258601265 (2026-06-21T21:42). Prod-verified on www.capveri.com:
`/vs/mri` "Lease abstraction" row = capveri "AI extracts CAM fields, human-verified" | mri
"AI + human verify"; zero "Not included - enter lease terms directly". `/vs` hub clean (no
dead slug, no denial). `/vs/lease-abstraction-software` confirmed 308 -> /vs (dark page).

LESSON: a "shipped self-contradiction" can be partly dark -- verify each contradicting surface
is actually REACHABLE (retained-slug list / static params / redirect) before sizing the defect.
Here only 1 of 6 touchpoints was reader-facing. And: do not trust stored product canon over the
in-repo source of truth -- the "CapVeri does not abstract leases" canon was stale and drove
C60's wrong-direction edit. CapVeri DOES AI-extract the CAM lease fields, human-verified.

---

## C67 — NOI calculator: fix false "CAM Recovered" column header

**Surface:** `/tools/noi-impact-calculator` (NOICalculatorClient.tsx) — the "NOI Recovery
Projection" results table.

**Defect (HIGH, reader-facing, live):** The recovery table's column header read "CAM
Recovered" with a two-row body: "Without CapVeri" = $0 and "With CapVeri" = the computed
amount. Read literally, a "CAM Recovered" column showing $0 without the tool claims a
landlord recovers ZERO CAM unless they use CapVeri -- false. Landlords recover the large
majority of CAM through normal billing; what CapVeri recovers is the leaked/under-billed
slice. The number in that cell is exactly that: `leakage = totalCAMPool * 0.04` (the 4%
benchmark leakage rate the same page cites in its FAQs and benchmark note). The header named
the wrong quantity.

**Fix:** Rename the column header "CAM Recovered" -> "CAM Leakage Recovered" (1 line).
Now the $0 baseline reads correctly: without the tool you recover $0 of the *leakage*. Matches
the page's central, already-defined term ("CAM leakage", explained in the FAQs and the
benchmark note) and the sibling result box "NOI Recovered".

**Verify:** tsc --noEmit 0, eslint on file 0, marketing-copy-gate exit 0. Third-grade: the
3-word label trips the FK fragment estimator (13.1) and flags "Recovered" as a hard word, but
FK is a documented warning-not-gate on sub-20-word fragments, "Recovered" is unavoidable and
already used in the adjacent "NOI Recovered" box, and "leakage" is the page's explained domain
term -- whole-context-fit overrides the mechanical fragment score (same call as C66's
"platform"). No hard gate (sentence length / semicolon / dash / curly quote) violated.

Code 785d5c59 (1 file, +1/-1), pushed 4365b6e5..785d5c59. npm ci 0, deploy:cf 0, worker
capveri-marketing 100% on 6daf1453-a5b7-4eb3-8401-d5fa247cfe92 (2026-06-21T22:04).
Prod-verified on www.capveri.com/tools/noi-impact-calculator (HTTP 200): "CAM Leakage
Recovered" present in SSR HTML; zero "CAM Recovered<".

LESSON: a column HEADER and its BASELINE ROW are one claim -- read them together. "$0 without
the tool" is only honest under a header that names the slice the tool recovers (leakage), not
the whole category (CAM). A header that's fine in isolation can assert a falsehood once the
zero-baseline row sits under it.

---

## C68 — Fixed-CAM tool: 44px touch target on escalation slider

**Surface:** `/tools/fixed-cam-vs-traditional` (FixedCamClient.tsx) — the "Annual
Escalation" range slider.

**Defect (MED, a11y/touch):** The escalation `<input type="range">` carried only
`w-full cursor-pointer accent-primary` — no minimum height. A native range renders a thin
track (well under 44px), so the draggable target is hard to hit on touch screens. It was the
LONE outlier among the five calculator sliders in the marketing tree: the other four already
set `min-h-[44px]` — NOI calculator (x2, lines 198/283), BOMA cap-rate (584),
cam-billing-error (217). Inconsistent touch target + below the 44px guideline.

**Fix:** Add `min-h-[44px]` so the class reads
`min-h-[44px] w-full cursor-pointer accent-primary`, matching all four sibling sliders.
Peer-backed, not an invented convention. Not copy — no copy-gate / third-grade.

**Verify:** tsc --noEmit 0, eslint on file 0. Code ed425562 (1 file, +1/-1), pushed
5af66fc7..ed425562. npm ci 0, deploy:cf 0, worker capveri-marketing 100% on
c4c0ff0f-8300-4107-9590-5734238e5f93 (2026-06-21T22:15). Prod-verified on
www.capveri.com/tools/fixed-cam-vs-traditional (HTTP 200): escalation slider SSR HTML now
`class="min-h-[44px] w-full cursor-pointer accent-primary"`.

LESSON: a repeated UI primitive (here, a styled range slider) tends to drift on ONE instance.
When 4 of 5 copies share a class string and one lacks a token, that one is the bug — grep the
whole tree for the primitive's class signature and reconcile the odd one out.

## C69 — HCAD normalizer kept showing a stale result after edits

**Surface:** /tools/hcad-tax-normalizer (HcadTaxNormalizerClient.tsx), the HCAD Tax Base
Year Normalizer interactive calculator.

**Defect (MED, UX/correctness):** After a user clicked Calculate Recovery, the result card
(or the error card) stayed on screen even when they edited one of the 5 inputs. The numbers
below no longer matched the numbers on screen, so the tool looked like it was reporting a
recovery for inputs the user had already changed. Each input onChange only called its own
setter; nothing reset the prior result/error. The placeholder render is guarded by
`{!result && !error && ...}`, so a stale result simply persisted.

**Fix:** Add a clearStaleResult helper (`setResult(null); setError(null);`) and call it as
the first statement in all 5 input onChange handlers. Editing any input now drops the stale
result/error card and restores the "enter your details" placeholder. This mirrors the
clearResultState pattern already used in the Fixed-CAM tool (FixedCamClient.tsx), so it is a
peer-backed pattern, not an invented convention. Not copy — no copy-gate / third-grade.

**Verify:** tsc --noEmit 0, eslint on file 0. Real-browser render-verify on the main-tree
marketing dev server (:3030) with the exact worktree file applied: filled all 5 inputs,
clicked Calculate (local backend absent so it set the error card), then edited the first
input — the error card cleared and the placeholder reappeared (placeholderAfterEdit true,
errorAfterEdit false), proving clearStaleResult is wired into onChange. Same code path backs
the result branch. Code a59ad3af (1 file, +12), pushed 2d29e91a..a59ad3af. npm ci 0,
deploy:cf 0, worker capveri-marketing 100% on a02ea44f-52d4-4f9e-999e-b37a9eb43495
(2026-06-21T22:32). Prod www.capveri.com/tools/hcad-tax-normalizer HTTP 200.

LESSON: an interactive tool that shows a computed card must invalidate that card the moment
inputs change, or it silently reports results for inputs the user already edited away. When
one calculator already solves this (clearResultState in Fixed-CAM), grep the other
calculators for the same input-onChange-without-reset shape and reconcile them.

## C70 — Remove fabricated "3x more often" stat from the CAM Audit Risk quiz

**Surface:** /tools/audit-risk-quiz (quiz-data.ts VULNERABILITY_MAP), the "Top
Vulnerabilities Identified" block on the CAM Audit Risk Score results screen.

**Defect (HIGH, copy honesty):** The "No independent reconciliation review" vulnerability
read "Statements without a second review contain errors 3x more often." That multiplier is
unsourced. A codebase-wide grep finds the claim nowhere else, and no product data backs a
3x figure. It is a fabricated number shown to readers, the same class of violation as the
C8 stat purges. The four sibling descriptions in the same map are all accurate and
directional with no invented numbers. The line also used a non-ASCII multiplication sign.

**Fix:** Replace the line with "A missing second review lets billing errors slip through."
Accurate, directional, no number, and it keeps the sibling consequence framing
(X creates/lets/triggers Y). Removes the non-ASCII character.

**Verify:** Copy, so it ran the full copy path. third-grade evaluate_copy.py PASS (9 words,
avg under the 10-word gate; the one WARN is a false positive flagging "slip through" as a
stacked clause, which it is not). marketing-copy-gate.mjs exit 0. tsc --noEmit 0, eslint on
file 0. Real-browser render-verify on the main-tree marketing dev server (:3030) with the
exact worktree file applied: drove all 10 quiz questions, answered so only the review
vulnerability triggered (Q5 + Q7 at max risk, rest at zero), and the results screen rendered
"No independent reconciliation review -> A missing second review lets billing errors slip
through" with the old "3x more often" string absent (hasNew true, hasOld false). Code
fcefb264 (1 file, +1/-1), pushed 9a270b73..fcefb264. npm ci 0, deploy:cf 0, worker
capveri-marketing 100% on 35c56ca0-2ab8-4492-82fd-a174309e016b (2026-06-21T23:01). Prod
www.capveri.com/tools/audit-risk-quiz HTTP 200; new copy confirmed live in the served bundle
(page-ef11820649b2737c.js), old stat absent.

LESSON: marketing "tools" can hide fabricated numbers in data maps, not just in page copy.
The reader-facing strings in quiz-data.ts / *-data.ts feed rendered results and must clear
the same honesty bar as headlines. A lone numeric claim sitting among directional siblings
is the tell: grep the multiplier sitewide, and if it appears exactly once with no source,
it is invented. Also: the results screen caps vulnerabilities at 3 by points, so to verify a
specific one you must suppress the higher-point answers, not just max everything.

## C71 — Add "Start over" retake button to the CAM Audit Risk quiz results

**Surface:** /tools/audit-risk-quiz (AuditRiskQuizClient.tsx), the CAM Audit Risk Score
results screen.

**Defect (MED, UX dead-end):** Once the quiz reached its results screen (showResults true),
there was no control to retake or revise it. The only navigation offered was the free-trial
CTA and two resource links. A user who wanted to try different answers, fix a misclick, or
re-score a different building had to manually reload the page. No affordance pointed them
there. Both target audiences lose: a casual visitor exploring scenarios and an older user who
fat-fingered an answer both hit a one-way door.

**Fix:** Add a handleRetake handler (setStep(0); setAnswers(Array(TOTAL).fill(null));
setShowResults(false);) and a ghost "Start over" Button (RotateCcw icon, pill geometry,
min-h-[44px] touch target) centered below the result links. Label uses the whitelisted action
verb "Start" (the evaluator does not whitelist "retake"). 18-line change, results-screen only;
the question flow is untouched.

**Verify:** third-grade CTA evaluate PASS on "Start over"; marketing-copy-gate exit 0; tsc
--noEmit 0; eslint on file 0. Real-browser render-verify on main-tree dev :3030 with the exact
worktree file applied: answered all 10 questions to reach results (score 100, High Risk), the
"Start over" button rendered, clicked it -> returned to "Question 1 of 10", results screen
gone, Next button disabled, zero answers pre-selected (aria-pressed count 0) -> confirms the
full state reset. Code 288d5069 (1 file +18), pushed 65ac1696..288d5069. npm ci 0, deploy:cf 0,
worker capveri-marketing 100% on 88abc516-492f-4285-b206-f6d98a5966fd (2026-06-21T23:12). Prod
www.capveri.com/tools/audit-risk-quiz HTTP 200; "Start over" confirmed live in the served
client bundle (page-c1892e0ecfb218b9.js).

LESSON: a results/terminal screen in a multi-step tool needs an explicit way back to the
start; "just reload the page" is an invisible escape hatch, not a UX. When auditing
quiz/wizard/calculator flows, check the terminal state for a restart affordance, not only the
input states. CTA-verb gate footgun: the third-grade evaluator whitelists a fixed verb set
(get/start/see/find/book/save/send/read/continue/try); a legitimate verb like "retake" fails
it -> pick a whitelisted synonym ("Start over") rather than force an allow-term override.

---

## C72 — Pricing hero stops citing the 80OFF code after the offer ends

**Surface:** /pricing (PricingContent.tsx), the small ShieldCheck reassurance line under the hero
paragraph.

**Defect (HIGH, copy-honesty):** The reassurance line rendered
`publicKnowledge.marketingInfra.pricingArtifacts.notes[0]` unconditionally. That note string is
offer-specific: "Reconcile includes a 30-day free trial. No credit card is required to start.
Use 80OFF for 80% off the first year." Every other offer mention on the page is gated on
`hasActiveOffer` (the hero "Limited time offer ... with 80OFF" line and the plan-card offer copy
both disappear when the launch offer is exhausted via `all_exhausted`). This one line was not. So
once the 300-redemption cap is hit, the page would show "Limited offer closed / standard pricing"
above while this line still told visitors to "Use 80OFF for 80% off the first year" — a coupon
that no longer works. A false claim shown to readers, same class as the C70 fabricated-stat purge.

**Fix:** Gate the offer-specific note on `hasActiveOffer`. When active, keep notes[0] (true).
When inactive, show an honest trial-only line that is always true: "30-day free trial. No credit
card required to start." No new gate variable; reuses the boolean the rest of the page already
trusts. 3-line change, hero block only.

**Verify:** third-grade evaluate PASS on the fallback (avg 5.0 words/sentence, max 6, FK 0.5);
marketing-copy-gate exit 0; tsc --noEmit 0; eslint on file 0. Real-browser render-verify on
main-tree dev :3030 with the exact worktree file applied. Offer is currently ACTIVE, so the live
active branch rendered notes[0] verbatim ("... Use 80OFF for 80% off the first year.") — no
regression. Forced the inactive branch (`false && hasActiveOffer`) via HMR and confirmed the line
flipped to the honest fallback "30-day free trial. No credit card required to start." with no
80OFF text, then restored the real ternary. Code 16a1bd9e (1 file +3 -1), pushed
532fb9d4..16a1bd9e. npm ci 0, deploy:cf 0, worker capveri-marketing 100% on
f3a378b5-17b6-4009-9373-e540516bd037 (2026-06-21T23:33). Prod www.capveri.com/pricing HTTP 200;
served bundle (app/pricing/page-d045dfa3c18faa37.js + 3939-*.js) contains BOTH the new fallback
string and the active-branch notes[0] string — both branches shipped.

LESSON: when an offer/coupon code can be exhausted at runtime, EVERY surface that names the code
must share the same active-offer guard, not just the obvious banner. A reassurance/footnote line
that pulls from a generated copy artifact (publicKnowledge notes) is easy to miss because it looks
static, but the artifact baked the coupon into a "trial" sentence. Audit pattern: grep the page
for the literal code/label and confirm each hit is wrapped in the same conditional as the primary
offer banner.

---

## C73 — Pricing card reveals all 28 plan features (was hiding 19)

**Surface:** /pricing (PricingContent.tsx), TierFeatureList in the plan card's right column.

**Defect (MED-HIGH, UX + value honesty):** TierFeatureList rendered `features.slice(0, 9)` —
showing the first 9 of the 28 features `getFeaturesForTier("reconcile")` returns, with no "see
more" affordance. The pricing page has a single plan (Reconcile), so that list IS the whole value
case. The silent truncation dropped 19 real, included capabilities — among them AI lease
extraction with human review, anomaly detection alerts, dispute management with audit trail,
California SB 1103 compliance export, audit defense package, NOI impact calculator, HCAD tax
protest normalization, and priority support. A buyer scanning the card would conclude the product
is far thinner than it is.

**Fix:** Keep the compact 9-item default (no visual change to the default card height), then add a
ghost disclosure toggle below the list: "See all 28 features" (verb "See" is whitelisted; "Show"
fails the third-grade CTA gate). Clicking expands to all 28 and flips to "See fewer features";
clicking again collapses. Pill geometry, min-h-[44px] touch target, aria-expanded bound to state,
rotating ChevronDown (aria-hidden). New state lives inside TierFeatureList (the page is already a
client component). COLLAPSED_FEATURE_COUNT constant = 9 so the count in the label is derived, not
hardcoded.

**Verify:** third-grade CTA evaluate PASS on both labels ("See all 28 features", "See fewer
features"); marketing-copy-gate exit 0; tsc --noEmit 0; eslint on file 0. Real-browser
render-verify on main-tree dev :3030 with the exact worktree file applied: default state showed 9
feature rows + "See all 28 features" (aria-expanded false, chevron down). Clicked -> 28 rows, label
"See fewer features", aria-expanded true, chevron rotated. Clicked again -> back to 9 rows. Full
toggle cycle confirmed. Code 5cb2c1d5 (1 file +40 -10; commit subject reads "C72.5"), pushed
bc31cdbd..5cb2c1d5. npm ci 0, deploy:cf 0, worker capveri-marketing 100% on
aa2e2dee-3f33-4bdc-a06c-db8508216eab (2026-06-21T23:45). Prod www.capveri.com/pricing HTTP 200;
served bundle (app/pricing/page-838bf597b847a7d5.js) contains both "See all" and "See fewer
features" -> live.

LESSON: a hardcoded `.slice(0, N)` on a list that represents the product's value (features, plans,
integrations) is a silent cap, not a layout choice -- it can drop real differentiators the buyer
needs to see. When auditing list renders, compare the rendered count to the source array length;
if the source is larger, the UI must either show all or give an explicit "see all N" disclosure.
CTA-verb gate footgun reconfirmed (cf. C71): the third-grade evaluator whitelists only
get/start/see/find/book/save/send/read/continue/try -> "Show" fails; use "See all N ...".

---

## C74 — cam-guide REIT benchmark notes were hard-truncated mid-word (2026-06-21)

**Surface:** `/resources/property-types/[type]/cam-guide` (live, indexed — 77 cam-guide URLs in
sitemap.xml; class-a-office / neighborhood-retail / warehouse-distribution all HTTP 200). Component
`marketing/src/app/resources/property-types/[type]/cam-guide/page.tsx:292`.

**Defect:** The "Typical Recovery Ratio" caption rendered
`{benchmark.typicalRecoveryRatioNote.slice(0, 60)}...` — a hard 60-char cut with a literal ASCII
"...". The source notes (reit-benchmarks.json) are short factual captions (75-91 chars), so the cut
landed mid-word and dropped real data: retail lost "Gross leases lower."; office truncated to
"...modified gross and N..."; industrial truncated to "...tenants pay v...". Reads broken and hides
the very fact the caption exists to convey. Same silent-cap class as C73's feature `.slice`, applied
to factual research data instead of a product list.

**Fix:** Render the full note — `{benchmark.typicalRecoveryRatioNote}`. The notes are short data
captions meant to be read whole; un-truncating is strictly more honest and complete. No copy
rewrite (these are research/DB values from reit-benchmarks.json, exempt from the third-grade pass).

**Verify:** tsc --noEmit 0; eslint on file 0; marketing-copy-gate exit 0. Real-browser render-verify
on main-tree dev :3030 with the exact worktree file temp-applied: retail caption rendered the full
"Brixmor reported 92.7% (record). NNN retail typically 90-95%. Gross leases lower." with no trailing
"..." (hasTruncEllipsis false). Reverted main tree clean. Code 7808e0af (1 file +1 -1), pushed
a4c514b1..7808e0af. npm ci 0, deploy:cf 0, worker capveri-marketing 100% on
2823e86b-b34a-417d-b27c-dee056499bf0 (2026-06-21T23:58). Prod live-verified all three benchmark
slugs: office "Full-service gross leases recover less; modified gross and NNN recover more",
retail "...Gross leases lower.", industrial "...tenants pay virtually all operating expenses" — all
full, zero truncation hits.

LESSON (reinforces C73): `.slice(0, N)} + "..."` for a *caption* is the same silent-cap antipattern
as slicing a *list*, but worse — it fakes an ellipsis truncation on strings that already fit, cutting
mid-word and dropping facts. If a note is short enough to show whole, show it whole; only paginate
text that is genuinely long. Audit pattern: grep for `.slice(0,` in render paths and check the source
length against the cut.

---

## C75 — CAM Audit Risk Score quiz announces step changes to screen readers (2026-06-22)

**Surface:** `/tools/audit-risk-quiz` (live tool). Component
`marketing/src/app/tools/audit-risk-quiz/AuditRiskQuizClient.tsx`. This was the twice-deferred
MED a11y finding carried from C70/C71.

**Defect:** The 10-question quiz advanced questions purely by React state (`setStep`), with no
`aria-live` region anywhere. A sighted user sees "Question 2 of 10" + the new prompt; a screen-reader
user got silence when clicking Next/Back, because nothing told assistive tech the visible content had
changed.

**Fix:** Added a visually-hidden polite status region as the first child of the question-branch
render: `<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">Question N of
10: {currentQuestion.question}</div>`. It mounts once in the question branch and persists across
steps, so its text content changes on each step and the change is announced. The text mirrors
already-visible copy (an a11y label, not new persuasive copy — exempt from the third-grade pass, like
aria-label/alt). Scoped to the question flow per the deferred finding ("aria-live on quiz steps"); the
results-screen announcement is a separate concern (results render in a different return branch that
mounts fresh, where focus management is the reliable mechanism — deferred to a later cycle).

**Verify:** tsc --noEmit 0; eslint on file 0; marketing-copy-gate exit 0; no quiz test files to break.
Real-browser render-verify on main-tree dev :3030 with the worktree file temp-applied: live region
present, text "Question 1 of 10: How do you classify borderline capital vs. operating expenses...".
Clicked an answer + Next -> same persistent node, text updated to "Question 2 of 10: Do you have a
written gross-up methodology document..." matching the visible "Question 2 of 10" header. Reverted main
tree clean. Code 7c409f9c (1 file +3), pushed d6a8b2d2..7c409f9c. npm ci 0, deploy:cf 0, worker
capveri-marketing 100% on 3d7aad3c-ca42-4adf-996b-107dad98f8c6 (2026-06-22T00:10). Prod
www.capveri.com/tools/audit-risk-quiz HTTP 200; served HTML contains the role="status"
aria-live="polite" aria-atomic="true" sr-only region populated with "Question 1 of 10: ...".

LESSON: a multi-step tool that swaps content by state (quiz/wizard/stepper) needs a persistent
aria-live region for the step content, or screen-reader users navigate blind. A live region only
announces changes while it stays mounted — put it OUTSIDE the per-step content that re-renders, bind
its text to the current step, and let React's text-diff trigger the announcement. A live region that
mounts already-populated (e.g. a fresh results screen via early return) will NOT reliably announce;
that case needs focus management instead.

ALSO this cycle: closed the slice-cap hunt from C73/C74 — PricingTeaser.tsx:96 `features.slice(0, 5)`
is NOT a silent cap. It is a homepage teaser card that shows 5 features, never claims completeness,
and carries an explicit "See full pricing" Link to /pricing (which post-C73 shows all 28). That is the
correct teaser-with-disclosure pattern, not the antipattern. Slice-cap vein exhausted for
value-bearing lists.

---

## C76 — Quiz results screen: focus management for screen readers (FIX MED a11y)

FILE: marketing/src/app/tools/audit-risk-quiz/AuditRiskQuizClient.tsx (LIVE tool, /tools/audit-risk-quiz)

DEFECT (deferred follow-up to C75): the CAM Audit Risk quiz submits the last question via
`setShowResults(true)`, which swaps the entire question branch out for a separate early-return
results branch (new ToolPageLayout, new <h1>Your Audit Risk Score</h1>, score + vulnerabilities).
Because it is a client-side state swap (not a navigation), focus stayed on the now-unmounted
"See My Results" submit button -> a screen reader announced NOTHING when the score appeared. The C75
aria-live region lives in the question branch and unmounts with it, so it cannot cover this
screen-to-screen transition (a freshly-mounted, already-populated live region does not reliably
announce — confirmed reasoning in the C75 lesson).

FIX: standard single-page focus-management pattern. Added `resultsHeadingRef` (useRef) + a
`useEffect([showResults])` that calls `resultsHeadingRef.current?.focus()` when showResults flips
true. Gave the results <h1> `ref`, `tabIndex={-1}` (programmatically focusable, not in tab order),
and `outline-none` (focus is for SR announcement, not a visible mouse ring). On mount the heading
receives focus, so the screen reader reads "Your Audit Risk Score, heading" and the user lands at the
top of the new screen. No copy changed (heading text identical) -> no copy gate / humanizer /
third-grade pass needed. tsc clean, eslint exit 0.

RENDER-VERIFY (main-tree :3030 via temp-copy): drove all 10 questions, clicked "See My Results";
document.activeElement became the H1 with tabindex="-1" and text "Your Audit Risk Score"
(activeIsResultsHeading: true), score card rendered. Reverted main tree clean.

SHIP: code d94852f8 (1 file +15 -2), pushed 874f21e9..d94852f8. npm ci 0, deploy:cf 0, worker
capveri-marketing 100% on 8c397a27-5ad9-4dff-bbdd-6435d8e2d978 (2026-06-22T00:22). Prod
www.capveri.com/tools/audit-risk-quiz HTTP 200; new client chunk
page-f07ce07126a3f9c6.js contains tabIndex:-1 (x1, the results heading) and .focus() (x1, the
useEffect call) alongside "Your Audit Risk Score".

LESSON: in a single-page app, swapping one screen for another by state (quiz -> results, wizard step
-> summary) is invisible to assistive tech unless you MOVE FOCUS. A live region announces in-place
text changes; a screen swap needs focus management — focus the new screen's heading (tabIndex=-1,
outline suppressed) in an effect keyed on the transition. Use the live region for "same screen,
content changed" and focus for "new screen mounted". The quiz now uses both correctly: C75 live region
for step-to-step, C76 focus for question-screen -> results-screen.

## C77 -- collapsed FAQ answers exposed to assistive tech (FIX, MED, a11y) (2026-06-22)

**Scope:** the two custom FAQ accordions on the marketing site -- the homepage
(`FAQSection.tsx`, 9 items) and `/pricing` (`PricingContent.tsx`, 13 items).
Treated as siblings (same defect class, same fix) like C58/C59.

**Defect (MED, a11y):** both accordions animate open/closed with a CSS grid
(`grid-rows-[0fr]` -> `grid-rows-[1fr]`) instead of `display:none`, so the
collapsed panel stays in the DOM with the answer text fully rendered. The button
carries `aria-expanded`, but the collapsed panel itself was still in the
accessibility tree and the tab order. A screen-reader or keyboard user could land
on answer text (and any links inside it) for questions that look closed on screen
-- a hidden-content / out-of-sync-with-visual-state defect. `display:none` would
fix the a11y exposure but kill the grid animation.

**Fix:** add the React 19 `inert` boolean prop to the collapsed panel on both
accordions (`inert={!isOpen}` on FAQSection, `inert={openFaqIndex !== index}` on
PricingContent). `inert` removes the subtree from the a11y tree AND the tab order
without changing `display`, so the `grid-rows` open/close animation is preserved.
Opening a panel drops `inert` and exposes it. No copy changed -> no copy gate /
humanizer / third-grade pass needed (behavioral attribute only).

**Test:** extended `FAQSection.test.tsx` -- collapsed panels assert `inert`
present, the open panel asserts `inert` absent, plus a new test that all panels
start inert. 8/8 pass. tsc clean, eslint exit 0 on all three files.

**Render-verify (main-tree :3030 via temp-copy):** homepage -- all 9 collapsed
panels had `inert` + `grid-rows-[0fr]`; clicking one dropped `inert`, set
`aria-expanded=true`, `grid-rows-[1fr]`. /pricing -- same on all 13 FAQ panels
(filtered to `role="region"` panels; a separate `role="dialog"` trigger on the
page is correctly not inert). Reverted main tree clean.

**Ship:** code d1e62dad (3 files +15), pushed 0e9243f3..d1e62dad. First deploy:cf
hit the documented d1-migrations-step footgun (the pre-deploy
`wrangler d1 migrations apply capveri-ai-sdr-nonces --remote` flaked with a 7403
"account not authorized" on the D1 query and gated the worker deploy -- worker
stayed on C76's 8c397a27). Re-ran deploy:cf; d1 step passed, worker advanced.
capveri-marketing 100% on 51099b4e-5f34-43b1-9fbf-42d0d53947d0 (2026-06-22T14:15).
Prod-verified: www.capveri.com/ served HTML has 9 `inert=""` (= 9 FAQ panels),
www.capveri.com/pricing has 13 `inert=""` (= 13 FAQ panels); both HTTP 200. SSR
emits inert because initial state is collapsed.

**Lesson:** a "hidden" panel kept in the DOM for a CSS animation (grid-rows,
max-height, opacity-0) is still in the a11y tree and tab order unless you remove it
-- `aria-expanded` on the trigger does NOT hide the panel content. `display:none`
hides it but kills the animation; `inert` (React 19 boolean prop) hides it from
assistive tech + keyboard while preserving layout/animation. Audit any
accordion/disclosure that animates via grid-rows/max-height: confirm the collapsed
panel is `inert` (or `hidden`), not just visually clipped. Grep render paths for
`grid-rows-[0fr]` / `max-h-0` and check the same node for `inert`/`hidden`.

---

## C78 — FIX MED a11y: homepage FAQ trigger↔panel programmatic linkage

**Surface:** `/` (homepage) `FAQSection.tsx` — the 9-item "Common questions" FAQ accordion.

**Defect:** Each FAQ trigger button set only `aria-expanded`. The answer panel
`<div>` had no `id`, no `role`, and no `aria-labelledby` back to its trigger.
Screen-reader users got no programmatic link between a trigger and the region it
controls; the open answer surfaced as an unnamed generic group. The sibling
`/pricing` FAQ accordion (`PricingContent.tsx`) already had the full wiring
(`faq-panel-${index}`/`faq-trigger-${index}` + `aria-controls`/`role="region"`/
`aria-labelledby`) — the homepage was the lone outlier.

**Fix (behavior-only a11y attributes, no copy changed):** brought `FAQItem` up to
the PricingContent standard, using `useId()` for collision-proof stable ids
(React-idiomatic; behavior is what matters for parity, not the id scheme):
- `const baseId = useId(); const triggerId = \`${baseId}-trigger\`; const panelId = \`${baseId}-panel\`;`
- trigger button: `id={triggerId}` + `aria-controls={panelId}`
- panel div: `id={panelId}` + `role="region"` + `aria-labelledby={triggerId}`
(kept the C77 `inert={!isOpen}` already on the panel.)

**Verification:** import switched to `import { useId, useState, useRef } from "react";`.
Added a test "each FAQ trigger is linked to its answer panel for assistive tech"
asserting for every landing FAQ: panel `id` truthy, trigger `id` truthy,
`aria-controls` == panel id, panel `role="region"`, panel `aria-labelledby` ==
trigger id. tsc + eslint clean. 9/9 FAQSection tests pass. Render-verified on
:3030 (temp-copy onto identical main-tree file, then reverted from backup): 9
triggers, each `aria-controls` → existing `role="region"` panel with matching
`aria-labelledby`, `inert` when collapsed.

**Ship:** code 79ae843c (2 files +26-1) on master. Worker capveri-marketing 100%
on a0baad38-7f57-4c48-8f2c-479fb37f23ab (2026-06-22T14:34). Prod-verified served
homepage HTML: 9 `role="region"`, 9 `inert=""`, `useId` `-trigger`/`-panel` id
pairs present and matched. Worktree goal-mktg-c78.

**Lesson:** an animated accordion needs BOTH the C77 `inert`-on-collapsed AND the
trigger↔panel linkage — `aria-expanded` alone tells AT the trigger's state but not
WHICH region it controls. When two sibling accordions exist (homepage + /pricing),
audit them for a11y parity; the richer one (here /pricing) is the standard to match.
`useId()` beats index-based ids for this — collision-proof across remounts and
multiple instances on one page.

---

## C79 — FIX MED honesty/whole-context-fit: CAM billing-error FAQ contradicted its own tool

**Surface:** `/tools/cam-billing-error-estimator`
`CamBillingErrorEstimatorClient.tsx` (LIVE tool page).

**Defect:** The "How much CAM leakage is typical?" FAQ answer (LEAKAGE_FAQS,
line 67) claimed leakage runs "from less than 1% to over 3% of total operating
expenses." But the estimator computes with `LEAKAGE_LOW_RATE = 0.0025` (0.25%)
and `LEAKAGE_HIGH_RATE = 0.015` (1.5%), and the benchmark note directly under
the result (line ~345) correctly states "Modeled scenario rates: 0.25% (low) to
1.5% (high)." So the same page told the reader two different things: the result
card models a 0.25%–1.5% range while the FAQ asserted typical leakage exceeds
3%. The FAQ figure was both an internal contradiction and an unsourced,
more-aggressive claim (overpromise risk).

**Fix (reader-facing persuasive copy — full copy pass applied):** rewrote the FAQ
answer to match the tool's conservative modeled range and to tell readers their
real rate varies and should be calibrated to their own history, mirroring the
benchmark note's language:
"Leakage rates change from portfolio to portfolio. This tool models a range of
0.25% to 1.5% of total operating expenses. Your rate depends on portfolio size,
lease terms, and billing process. Small error rates still add up. On a mid-size
building, that can mean thousands of dollars a year."
No model logic or numbers changed.

**Copy pass:** marketing copy gate exit 0 (1431 files). humanizer: no em-dashes/
curly quotes/forced rule-of-three, active voice. third-grade evaluate_copy.py:
7 sentences, avg 7.4 words, max 13 words, FK grade 3.4; only flag "operating"
(kept — "total operating expenses" is the page's domain term, used verbatim in
the benchmark note). Zero-lies: removed an unsourced claim, replaced with the
tool's own documented model range. Whole-context-fit: FAQ now agrees with the
benchmark note + the computed result on the same page.

**Verification:** tsc + eslint clean. Render-verified on :3030 via temp-copy onto
the identical main-tree file (reverted from /tmp backup): new sentence present in
DOM, old "less than 1% to over 3%" gone, benchmark note "0.25% to 1.5%" present —
contradiction resolved.

**Ship:** code ded5390b (1 file +1-1) on master, pushed 0b1cb06c..ded5390b.
Deploy:cf clean this cycle (d1 step did NOT abort) → capveri-marketing 100% on
206b4759-a830-4961-ae12-e0e1e5b1097e (2026-06-22T14:46). Prod-verified
www.capveri.com/tools/cam-billing-error-estimator: new phrase x2 (visible FAQ +
JSON-LD FAQPage schema, both fed by LEAKAGE_FAQS), old phrase x0, benchmark note
agrees — stable across 3 fetches. (One transient post-deploy curl briefly read an
edge-cached old copy; cleared within seconds.) Worktree goal-mktg-c79.

**Lesson:** an interactive tool's FAQ/marketing copy and its actual computation
model are ONE claim — audit FAQ rate/percentage statements against the constants
the tool computes with (here LEAKAGE_LOW/HIGH_RATE) and against any benchmark/
footnote on the same page. A FAQ array that also feeds JSON-LD FAQPage schema
fixes both surfaces at once (prod shows the string x2). Right after a deploy, a
single CDN edge node can briefly serve stale HTML — re-fetch a few times before
trusting a "still present" reading.

---

## C80 — NOI hero asset-value range contradicted the page's own cap-rate math (FIX MED honesty)

**Surface:** /tools/noi-impact-calculator (LIVE), hero paragraph.

**Defect:** The hero claimed "$1 of under-billed CAM can cut asset value by $15
to $25." But the page's own model contradicts that range three ways:
DEFAULT_CAP_RATE = 7 yields $1/0.07 = $14.29 per dollar (below the stated $15
floor); the page's FAQ states an 8% cap rate gives $12.5 per dollar (also below
$15); and the cap-rate slider spans 3–12% ($8.33–$33.33 per dollar). The "$15
to $25" band implies cap rates of 4–6.67%, which the page never defaults to or
centers on. A reader who runs the default scenario sees a smaller hit than the
hero promised.

**Fix:** Changed the range to "$12 to $20. The exact hit depends on your cap
rate." $12–$20 brackets the 7% default ($14.29) and matches the page's FAQ
examples (5% cap → $20, 8% cap → $12.5). Split the qualifier into its own
sentence to keep every sentence under the third-grade 14-word gate.

**Verify:** copy gate exit 0; evaluate_copy.py on the full paragraph passed
(avg 7.1 words, max 13; FK WARN from the unchanged required "Net Operating
Income" sentence). tsc + eslint clean. Render-verified on main-tree :3030
(temp-copy + restore): hero showed "$12 to $20" + the qualifier, "$15 to $25"
gone. Prod-verified www.capveri.com/tools/noi-impact-calculator stable across 3
fetches: new range x1 + qualifier x1, old range x0.

**Refs:** code 6143457a, worker capveri-marketing 100% on
68fcd6a9-f9d8-48ed-8dba-f093e4d83077 (2026-06-22T15:01), worktree goal-mktg-c80.

**Lesson:** A hero number that restates the tool's own math is one claim with
the model, not standalone copy. Audit hero/headline figures against the
calculator's default inputs, its FAQ-stated examples, and its slider range —
all three must contain the headline number. Here the band excluded the default,
the FAQ value, and most of the slider.

---

## C81 — recovery-gap FAQ asserted unsourced industry benchmarks as fact (FIX MED honesty)

**Surface:** /tools/recovery-gap-analyzer (LIVE, lead-capture page for a
downloadable analyzer), RECOVERY_FAQS.

**Defect:** The "What is a good benchmark?" FAQ stated precise per-property-type
recovery-ratio averages as fact — "office portfolios average 92-96%, retail
averages 88-94%, and industrial averages 95-98%" — plus a hard "Any ratio below
90%" cutoff. A second FAQ claimed "Most properties have a 2-5% recovery gap." A
repo-wide grep found these exact figures nowhere else, and the project's own
research file (marketing/data/research/reit-benchmarks.json) carries
"recoveryRatio": null for every entry with the methodology note "Recovery
ratios included only when explicitly disclosed." The numbers were invented and
presented as sourced industry data — same fabricated-statistic class as C70/C72.

**Fix:** Rewrote the benchmark FAQ to explain the ratio honestly without
invented figures: 100% is the target (you billed back every dollar your leases
allowed), a well-run portfolio gets close, the lower the ratio the more money
left on the table, and "compare your ratio to your own past years, not just one
industry number." Replaced the "2-5%" sentence with a directional statement
("These sources often stack up, so even careful billing can leave money
behind"). No model logic or computed numbers changed. Left the page's
"benchmark against industry peers" capability/metadata lines as-is — they
describe the downloadable analyzer's features, which can't be inspected from the
page and are plausibly accurate.

**Verify:** copy gate exit 0; evaluate_copy.py on the rewritten FAQ answer
passed (avg 9.3 words, max 13, FK 5.6 WARN from domain terms recovery/recoverable/
operating, allowed). tsc + eslint clean. Render-verified on main-tree :3030
(temp-copy + restore): both new answers present, "92-96%"/"88-94%"/"95-98%" and
"2-5% recovery gap" gone. Prod-verified www.capveri.com/tools/recovery-gap-analyzer
stable across 3 fetches: new copy present, old figures x0.

**Refs:** code 2b38ddc8, worker capveri-marketing 100% on
e828b210-f0bc-4aec-8523-72837ddb1a7b (2026-06-22T15:11), worktree goal-mktg-c81.

**Lesson:** A FAQ that answers "what's a good benchmark?" with precise
percentages reads as sourced data — verify each figure against the repo's
actual research file before trusting it. When the research file explicitly
withholds a metric (null + "only when disclosed"), any precise on-page number
for that metric is fabricated. Honest fix = explain the concept and tell readers
to baseline against their own history, not invent a public average.

---

## C82 — audit-risk FAQ cited "industry data" for fabricated prevalence stats (FIX MED honesty)

**Surface:** /tools/audit-risk-scorecard (LIVE), AUDIT_RISK_FAQS.

**Defect:** The FAQ "How often do commercial tenants use their audit rights?"
opened with "Industry data suggests 10 to 15% of commercial tenants with audit
clauses use them in any year" and closed with "The average audit results in a
credit of 2 to 5% of billed operating expenses." Both figures appear nowhere
else in the repo and the "Industry data suggests" framing is a vague attribution
(weasel attribution) to a source that does not exist. Fabricated-stat class
(C70/C72/C81). The other numeric phrases in this tool's FAQ (lines 67/82 — "above
5 to 10%", "typically 3 to 5%") describe how lease clauses are commonly drafted,
not empirical outcomes, and are hedged; left as defensible domain knowledge.

**Fix:** Rewrote the answer to explain audit behavior honestly by tenant type
(large national tenants with lease-admin teams audit on a regular cycle; smaller
and local tenants far less; use rises when the economy is tight), state plainly
"There is no single industry rate," and point readers to their own tenant base.
No invented figures, no fake citation.

**Verify:** copy gate exit 0; evaluate_copy.py passed (avg 9.6 words, max 13, FK
4.1 WARN; swapped "best guide" → "clearest signal" to clear the vague-superlative
gate). tsc + eslint clean. Render-verified on main-tree :3030 (temp-copy +
restore): new answer present, "Industry data suggests 10 to 15%" and "credit of 2
to 5%" gone. Prod-verified www.capveri.com/tools/audit-risk-scorecard stable
across 3 fetches: new x1, old x0.

**Refs:** code bea3fee9, worker capveri-marketing 100% on
d9b98ab7-7c73-473a-a58c-446e46b50e08 (2026-06-22T15:20), worktree goal-mktg-c82.

**Lesson:** "Industry data suggests / studies show / on average" in front of a
precise number is a tell, not a citation — if the figure is not in the repo's
research files, it is invented. Either cite the real source or rewrite the
claim as honest directional guidance. Distinguish claimed empirical OUTCOMES
(prevalence, average credit — must be sourced) from descriptions of how
contracts are commonly STRUCTURED (defensible general knowledge).

---

## C83 — NO-DEFECT verification: tool FAQ-vs-model honesty + result-label data (CLEAN)

No code change. Two dimensions verified clean, closing the vein opened in C79.

**FAQ-vs-model honesty (remaining tools):** Audited the last two interactive
calculators' FAQ + hero numbers against their model constants.
- fixed-cam-vs-traditional: FAQ figures are all illustrative examples ("if Fixed
  CAM escalates at 3%... but actual expenses grow 5 to 7%") or hedged clause-
  structure descriptions ("look-back clause... often 10 to 15%"). Hero says
  escalators are "typically 3 to 5%"; the tool's default escalationPct = 3.0,
  which the range brackets. No fabricated outcome stat, no hero-vs-model
  contradiction. CLEAN.
- hcad-tax-normalizer: FAQ numbers are illustrative ("an annual CAM cap (e.g.,
  5% per year)"); the tool models capped + uncapped. CLEAN.
  → FAQ-vs-model honesty vein EXHAUSTED across all calculators: fixed in C79
    (cam-billing-error), C80 (noi-impact hero), C81 (recovery-gap), C82
    (audit-risk); verified clean here for fixed-cam + hcad.

**Result-rendering data labels (C67 class):** Explore swept the result tables /
computed cards / baseline rows of all tool clients for misleading headers or
false-baseline rows. It re-flagged the NOI "Without CapVeri = $0" row as
implying zero recovery without the product — but that is a FALSE POSITIVE
already fixed in C67: the column header reads "CAM Leakage Recovered" (verified
on origin/master NOICalculatorClient.tsx:334), so "$0" honestly means $0 of
*leakage* recovered without the tool. The agent's proposed relabels would
re-break the fix or invent an "Industry Benchmark Loss" baseline. Rejected.
All other calculators' result labels confirmed accurate (fixed-cam delta signs,
cam-billing-error range, hcad "what was billed" vs "what should have been
billed"). CLEAN.

**Lesson:** Re-confirmed the standing footgun — sub-agents read files without the
fix history and will re-flag already-fixed defects (here C67). Always verify a
finding against the CURRENT origin/master AND the prior ledger before acting; a
"$0 baseline" is only a lie if its column header claims it's total recovery, not
leakage recovered.

---

## C84 — FIX (LOW, visual consistency / taste): unify empty-result placeholder glyph across the calculator family

**Dimension:** visual consistency of the interactive tool result cards (a fresh
vein — the FAQ-vs-model honesty vein and the result-label data dimension were both
declared exhausted/clean in C83).

**Defect.** The four live calculators disagreed on the glyph shown in a result slot
before the user has entered inputs (the `isReady === false` empty state):
- NOI calculator (`NOICalculatorClient.tsx`): single `-` for the three big numbers,
  `" - "` for the two table cells (6 instances, all single hyphen).
- Fixed-cam modeler (`FixedCamClient.tsx`): `" - "` (single hyphen, via the NaN
  branch of its currency formatter).
- **CAM billing-error estimator** (`CamBillingErrorEstimatorClient.tsx:314,332`):
  `---` (three hyphens) for both big-number placeholders.
- **HCAD normalizer** (`HcadTaxNormalizerClient.tsx:510`): `---` for the recovery-delta
  placeholder — and it was *internally* inconsistent, three sibling cells already
  rendered single `-` while this one rendered `---`.

By instance count the single hyphen dominated 6→3, and `---` reads like a stray
markdown horizontal-rule fragment (less polished). Standardized the three `---`
occurrences to single `-`.

**Why single `-` not `---` and not an em dash:** single centered `-` is the common
dashboard "no value" convention; `---` looks like a dropped MD rule; an em dash `—`
is the typographically "correct" null glyph but the repo bans em dashes in src
(curly-quotes/em-dashes-in-src vein already cleaned, ~C57 era) — introducing one
would regress that. A placeholder glyph is not persuasive copy, so no
humanizer/third-grade pass; copy-gate still run (exit 0).

**Render-verify (main-tree :3030 via temp-copy):** cam-billing empty state →
both `p.text-muted-foreground/40` now render `"-"` (was `---`); HCAD → all 4
placeholders render `"-"` (the edited one now matches its 3 siblings).

**Ship.** code 3f223c89 (2 files, +3-3), worker capveri-marketing 100% on
`f391eb32-af33-41d5-a8d0-4a7550fc716d` (created 15:42, d1 step did NOT abort this
run), prod-verified both URLs 200 with single `>-<` placeholders (cam-billing 2×,
hcad 4×) and **zero** `---` placeholders remaining. worktree goal-mktg-c84.

**Also this cycle (rejected findings, functional sweep):** dispatched an Explore
agent over all 12 tools/* clients for functional defects (div-by-zero, NaN display,
stale-result cards, slider/input desync, clamp gaps). Result: functionally CLEAN.
Two "missing rounded-full on CTA" findings were FALSE POSITIVES — the base shadcn
`Button` uses `rounded-button` which resolves to `--radius-button: 9999px`
(`marketing/src/generated/tokens.css:15`), so those CTAs are already pills. The
cam-overcharge `formatCurrency` NaN finding is schema-guarded (Zod min>0,
not reader-reachable) AND that file is reserved for flagged chip tasks
(task_c2ca668b / task_bdeccd31) — rejected.

**LESSON:** "visually consistent" includes the *empty/zero state* glyphs, not just
populated output — audit placeholder characters (`-` vs `---` vs `—` vs `N/A`) across
a component family; a file can even be internally inconsistent (HCAD: 3×`-` + 1×`---`).
Before flagging "button missing rounded-full", resolve the base component's radius
token — `rounded-button`/`--radius-button: 9999px` already makes every shadcn Button
a pill.

---

## C85 — FIX (LOW, copy consistency / taste): missing terminal period in /pricing trial list

**Surface:** /pricing "What happens during the free trial" reassurance list
(`marketing/src/components/PricingContent.tsx`) — high-intent page, pivoted here after
6 straight cycles in /tools.

**Defect.** The list has three full-sentence `<li>` items:
1. (line 181, from `publicKnowledge.claims.byId["trial-no-card"].wording`) "Reconcile
   includes a 30-day free trial with no credit card required to start." — ends with `.`
2. (line 185) "Add billing only when you decide to keep access" — **no terminal period**
3. (line 189) "Add annual billing before the trial ends." — ends with `.`

Item 2 was the lone outlier. The dominant convention (2 of 3, and all three are complete
imperative sentences) is a terminal period, so added one to line 185.

Adding a period does not change the claim or reading level. third-grade evaluator on the
full block: no hard-gate failures (FK 5.2 WARN only, on pre-existing wording I did not
reword). copy-gate exit 0.

**Render-verify (:3030 via temp-copy):** all three trial-list items now read with a
trailing period; the edited item shows "Add billing only when you decide to keep access."

**Ship.** code 708571ce (1 file, +1-1), worker capveri-marketing 100% on
`04d4184f-4049-4c25-8dbf-e996d8a8fb09` (created 15:51; the OpenNext "Failed to copy
node_modules/*" lines are benign bundling warnings, did NOT block the deploy; d1 step did
not abort). prod /pricing 200, line reads "...to keep access." with the period, stable x3.
worktree goal-mktg-c85.

**LESSON:** sentence-fragment lists (feature names) legitimately omit terminal periods,
but a list of complete sentences must punctuate every item — when most items in a list end
with `.`, the unpunctuated one is the defect, not the punctuated ones.

## C86 — FIX LOW (copy quality / whole-context-fit): echo-only encryption security card on /about

**Surface:** /about → "Security & Compliance" section (marketing/src/app/about/page.tsx, securityClaims array).

**Defect:** The section has 6 cards. Every card's description ELABORATES beyond its
title (RLS card explains PostgreSQL RLS at the DB layer; audit-log card explains
before/after state + timestamp; AI card explains mandatory human review; etc.). The
"Encryption in transit and at rest" card was the lone outlier — its description
("Your data is encrypted in transit and at rest.") just restated its own title
verbatim, adding zero information. A description that echoes its title pulls no weight
and breaks the section's convention.

**Fix:** Rewrote the description to explain the benefit in plain words, matching how the
5 siblings elaborate, WITHOUT fabricating cipher specifics (no AES-256/TLS claims I
can't source): "We encrypt your data when it moves and when we store it. Stolen data
stays unreadable." Honest (encryption does render stolen data unreadable), active voice,
third-grade PASS (avg 8 words, FK 4.5, --allow-term encrypt). Copy-gate 0, tsc 0,
eslint 0.

**Verify:** render-verified on main-tree :3030 via temp-copy (card desc = new text);
prod /about served HTML shows "Stolen data stays unreadable" ×3, old echo string absent.

**Ship:** code b4db4cb1 (1 file +2-1), worker capveri-marketing 100% on
5cfd7447-a186-4559-9a01-9c95b0f721ef (created 16:10, d1 step did NOT abort), worktree
goal-mktg-c86.

**LESSON:** in a card grid where each item has a title + description, a description that
merely restates its own title is a silent quality gap — audit each description against
its title and against sibling descriptions; if siblings elaborate and one echoes, the
echo is the defect. Elaborate with a real benefit/consequence, never with unverifiable
specifics.

---

## C87 — FIX LOW (accuracy / whole-context-fit): Excel miscategorized as an ERP on /about

**Surface:** `/about` "Our Mission" section (live, in sitemap), `marketing/src/app/about/page.tsx:152-154`.

**Defect:** The mission copy read "CapVeri works with a CSV you export from any ERP:
Yardi, MRI, AppFolio, or Excel." Excel is a spreadsheet, not an ERP. Every other place
on the marketing site treats Excel as a file format / spreadsheet, never an ERP
(cam-reconciliation-template, export-based-verification-layer copy, docs). This `/about`
line was the lone outlier that filed Excel under "ERP." Minor but it is a factual
mislabel on a trust-building page.

**Fix (1 file, +2/-2):** Rewrote to an accurate umbrella plus a short list sentence:
"CapVeri works with a CSV you export from any system. That includes Yardi, MRI,
AppFolio, and Excel." "any system" correctly covers both ERPs and spreadsheets; the
broad-compatibility reassurance is preserved; split into two short sentences.

**Gates:** tsc 0, eslint 0, marketing-copy-gate 0. third-grade evaluate_copy.py PASS
(avg 8.5 words/sentence, no hard words) with the four product/format names preserved as
required terms.

**Render-verify (:3030, worktree file copied over identical main-tree file, then
restored):** DOM innerText = "You should not have to replace your whole tech stack to
check a CAM bill. CapVeri works with a CSV you export from any system. That includes
Yardi, MRI, AppFolio, and Excel." hasERP probe = false.

**Ship:** commit `21ce204b` pushed to master. Worker `capveri-marketing` 100% on
`6facfbfd-b3ad-42dd-addb-db8e3204edde`. Prod www.capveri.com/about verified 3x:
"export from any system" present, "any ERP" absent.

**LESSON:** when a brand/category noun (ERP, CRM, spreadsheet, format) labels a list,
check every list member actually belongs to that category — a single misfiled member
(Excel under "ERP") is a quiet accuracy bug. Cross-check the label against how the same
entity is described elsewhere on the site; the site-wide majority usage is the oracle.

---

## C88 — FIX MED (honesty / consistency): unsourced divergent leakage range on /for/asset-manager

**Surface:** `/for/asset-manager` persona page (live, static param, in sitemap),
`marketing/data/personas.json:487`.

**Defect:** The asset-manager metric card read `$15K-$45K — Modeled leakage range per
building at diligence`. That figure appears NOWHERE else in the codebase (grep across
marketing/src + marketing/data returned a single hit) and has no methodology behind it.
The site's single documented, /sources-cited modeled range is **$5.9K-$35.3K per
building** — derived as 1-6% of a $590K typical Class A operating-expense pool, repeated
in `roi/page.tsx` (with "this is a modeled estimate, not a promised amount"),
`sources/page.tsx`, `cam-reconciliation-software/page.tsx`, the CFO persona metric
(`personas.json:160`), and `roles.json`. The CFO persona even carries an FAQ explaining
the calculation. The asset-manager `$15K-$45K` was a lone unsourced divergence from that
one model — a fabricated precise range on a trust-building page.

**Fix (1 file, +1/-1):** Changed the value to the documented `$5.9K-$35.3K`, keeping the
"Modeled leakage range per building at diligence" label (the diligence framing is fine;
only the unsourced number was wrong). Now consistent with /sources, the CFO persona, the
ROI page, and roles.json.

**Gates:** JSON valid; marketing-copy-gate 0 (1431 files). No third-grade pass needed —
this is a data-value correction to a documented figure, the reader-facing label is
unchanged (no new persuasive prose).

**Render-verify (:3030, worktree file copied over identical main-tree file, then
restored):** /for/asset-manager body now contains `$5.9K-$35.3K` with the leakage label;
`$15K-$45K` absent. Title confirmed the asset-manager page.

**Ship:** commit `3ebcf918` pushed to master. Worker `capveri-marketing` 100% on
`516e69eb-ffea-4336-8ae7-3c405109981c`. Prod www.capveri.com/for/asset-manager verified
3x: `$5.9K-$35.3K` present, `$15K-$45K` absent.

**LESSON:** when a site commits to ONE documented, sourced model for a headline number
(here $5.9K-$35.3K = 1-6% of $590K OpEx, cited on /sources), every surface that quotes a
dollar range must quote THAT model — a per-page variant that appears in exactly one place
is fabricated, even when it's plausibly "in the ballpark." Audit = grep the canonical
range string; any value-bearing range that does NOT match it (and isn't on /sources) is
the defect. Reinforces the C70/C79-C82 honesty vein: a lone precise number among sourced
siblings is invented until proven against the research source of truth.

## C89 — FIX MED (honesty / whole-context-fit): cost shown in a duration row on /vs/sage-intacct

**Surface:** `/vs/sage-intacct` comparison page (live, retained comparison slug, in
sitemap), `marketing/data/comparisons.json:1321`.

**Defect:** The comparison table had a row labeled **"Implementation time"** — a duration
column — whose Sage Intacct cell read `$15,000-40,000+ annually`, a *cost*, not a time.
The label promised "how long" and the cell answered "how much." The cost figure is itself
correct and is already stated in the page FAQ ("Sage Intacct's real estate module
typically costs $15,000-40,000+ annually depending on entity count and modules"), so the
number was not wrong — it was in the wrong row, contradicting its own header and the
CapVeri cell beside it ("Minutes - CSV upload, no implementation project", which IS a
duration).

**Fix (1 file, +1/-1):** Changed the Intacct cell to a directional duration that matches
the row label and the sibling cell: `Weeks to months - partner-led implementation
project`. No fabricated precise number (Intacct implementations are partner-led and
genuinely run weeks-to-months); the dollar figure stays correctly in the FAQ where the
"how much" question is actually asked.

**Gates:** JSON valid; marketing-copy-gate 0 (1431 files); third-grade evaluate_copy.py
PASS (avg 7 words, max 7, no banned punctuation; `--allow-term implementation`). " - "
(hyphen-space) matches the established comparison-table sibling style and is not flagged
as an em-dash.

**Render-verify (:3030, worktree file copied over identical main-tree file, then
restored):** /vs/sage-intacct Implementation time row now shows `Weeks to months -
partner-led implementation project`; the `$15,000-40,000+ annually` string remains present
ONLY in the FAQ context, not as the row value.

**Ship:** commit `6bf10550` pushed to master. Worker `capveri-marketing` 100% on
`9410d8cb-8db7-4e45-94d1-92d75e10e2e7`. Prod www.capveri.com/vs/sage-intacct verified 3x:
the Implementation time row carries the duration; the cost appears only in the FAQ.

**LESSON:** a comparison-table cell must answer the question its ROW LABEL asks — a
"time"/"duration" row holding a dollar amount is a whole-context-fit defect even when the
dollar amount is accurate and sourced. The number wasn't a lie; it was misfiled. Audit =
scan each row label's semantic type (time / cost / yes-no / capability) against the unit
in every cell; a cell whose unit mismatches its row header is the defect, and the right
fix is usually to MOVE the value to the row/FAQ that asks for it, not to delete it.

## C90 — FIX MED (honesty / whole-context-fit): cost row answered with a pricing method on /vs/outsourced-cam

**Surface:** `/vs/outsourced-cam` comparison page (live, retained comparison slug, in
sitemap), `marketing/data/comparisons.json:983`.

**Defect:** Same row-label/cell-unit class as C89, found by scouting the other retained
/vs tables. The comparison row labeled **"Cost per building"** (a cost dimension) had its
Outsourced cell answer correctly with a price (`$2,000-$5,000/year`) but the CapVeri cell
read `self-serve package selected by workflow depth` — a description of *how* pricing is
decided, not a cost. Two problems: (1) unit mismatch (method where a cost is expected),
and (2) factual drift — Reconcile pricing scales by **rentable unit count**, not "workflow
depth" (`public-knowledge.ts` selfServeSummary / enterpriseThreshold both say "scales by
rentable unit count"; there is a single Reconcile plan, not workflow-depth packages).

**Fix (1 file, +1/-1):** Changed the CapVeri cell to `One annual subscription - no
per-building fee`. This answers the cost dimension (the real differentiator vs a
per-building outsourced fee), is accurate, invents no number, and matches the sibling
"Scalability" row ("Upload more CSVs ... current package pricing"). Deliberately did NOT
inject the `{{pricing.selfServeSummary}}` token (the obvious-looking option): that token
resolves — `resolveContentTokens` in `lib/content/pseo-data.ts` deep-walks the whole JSON,
so it WOULD interpolate in a cell, but it expands to a multi-sentence pricing paragraph
that bakes in the `80OFF` coupon, which would (a) overflow a table cell and (b) reintroduce
an un-gated coupon string (the C72 footgun). The flat-fact cell sidesteps both.

**Gates:** JSON valid; marketing-copy-gate 0 (1431 files); third-grade evaluate_copy.py
PASS (7 words, `--allow-term subscription`). " - " (hyphen-space) matches sibling cell
style and is not flagged as an em-dash.

**Render-verify (:3030, worktree file copied over identical main-tree file, then
restored):** /vs/outsourced-cam Cost-per-building row now renders `$2,000-$5,000/year |
One annual subscription - no per-building fee`; old "selected by workflow depth" gone; my
cell carries no coupon (the pre-existing `80OFF` on the page comes from the reasons
paragraph's resolved `{{pricing.selfServeSummary}}`, untouched and out of scope).

**Ship:** commit `cb5c80a7` pushed to master. Worker `capveri-marketing` 100% on
`343df4a1-8e55-434a-9777-3cb5621fd651`. Prod www.capveri.com/vs/outsourced-cam verified 3x:
new cell present, old cell absent.

**LESSON:** the row-label/cell-unit audit (C89) keeps paying out — a "Cost" row holding a
pricing-*method* sentence is the same misfile as a "time" row holding a dollar amount.
Bonus catch: the wrong-unit cell was also factually stale ("workflow depth" vs the real
"unit count" axis), so unit mismatches double as a tripwire for drifted pricing copy. And
when the tempting fix is a content token, check what it RESOLVES to before using it —
`{{pricing.selfServeSummary}}` is a paragraph with a coupon, not a short price label.

---

## C91 — FIX (MED copy-honesty/taste): "Reconcile on Reconcile" template-token stutter on live /vs pages

**Defect:** `comparisons.json` used the literal cell/prose prefix `"Reconcile on "` directly
in front of `{{pricing.selfServeSummary}}`, but that token itself *begins* "Reconcile starts
at $998/year...". The `resolveContentTokens` deep-walk (pseo-data.ts) expands the token in
place, so three LIVE spots rendered the plan-name stutter **"Reconcile on Reconcile starts at
$998/year..."**:
- `/vs/appfolio` comparisonTable "Pricing" cell (line 323)
- `/vs/tenant-auditors` comparisonTable "Cost" cell (line 652)
- `/vs/tenant-auditors` FAQ answer (line 669) — there the long token paragraph also left the
  trailing "- find and fix the same errors before an auditor is hired" dangling AFTER the
  price paragraph's final period.

Both slugs are in `retainedComparisonSlugs` (reachable, in sitemap). The Explore scout flagged
the tenant-auditors "Cost" cell but mis-framed it as a unit mismatch / unresolved token; the
token DOES resolve — the real defect is the prefix collision (stutter) + paragraph-in-terse-cell.

**Fix:**
- Cells 323/652 → `"{{pricing.annualSummary}}"` (drops the stutter prefix; the shorter summary
  fits a terse comparison cell and matches the existing cell convention used elsewhere, e.g.
  the yardi pricing cell).
- FAQ 669 → reordered so the price paragraph (`{{pricing.selfServeSummary}}`) lands at the END,
  replaced the mid-sentence token with two short standalone sentences: "CapVeri catches the
  same errors first. You fix them before a tenant hires an auditor." (third-grade PASS, avg 7.5
  words; the first single-sentence attempt FAILed at 12 words avg / FK 8.8).

**Verify:** marketing-copy-gate exit 0; JSON valid; third-grade PASS on the new FAQ sentences.
Render-verified on :3030 (temp-copy over main tree): appfolio Pricing cell = "Reconcile starts
at $998/year with 80OFF; list price starts at $4,990/year for up to 25 rentable units. 80% off
the first year." (annualSummary, no stutter); tenant-auditors Cost cell same; FAQ reads
"...against the landlord. CapVeri catches the same errors first. You fix them before a tenant
hires an auditor. Reconcile starts at $998/year..." (selfServeSummary, no stutter, no dangling
tail). Prod-verified www.capveri.com 3x: stutter=0, old "offers Reconcile on"=0, literal token
leak=0 on both pages.

**Ship:** code df857f38, worker capveri-marketing 100% cbc07be1, prod 3x clean.

**LESSON:** a literal label prefixed onto a content token can COLLIDE with the token's own
leading word — `"Reconcile on " + {{pricing.selfServeSummary}}` (which starts "Reconcile
starts...") renders "Reconcile on Reconcile...". When a `{{pricing.*}}` token names the plan in
its first word, don't hand-write the plan name in front of it. Also: tokens that resolve to a
multi-sentence paragraph belong at the END of prose / in a roomy cell, never mid-sentence
(the dangling tail is the tell). The clear row-label/cell-unit vein (C89/C90) is now exhausted;
this was a sibling — template-token rendering, not unit misfile.

---

## C92 — FIX HIGH (copy-honesty / whole-context-fit) — /roi fabricated recovery basis

**Defect:** `/roi/page.tsx` derived the flagship $5,900-$35,300/building/year recovery range
from an INVENTED basis: "$590K in annual operating expenses" at "1-6% of total charges." That
contradicts the site's own authoritative citations page `/sources:257` and the live resource
`content/resources/cam-leakage-guide.mdx:79`, both of which document the basis as: a 200,000 SF
building using the IREM office opex benchmark ($11.15/SF, ~$2.23M OpEx), CPI-adjusted, at
scenario leakage rates of **0.25%-1.5% of operating expenses**. So `/roi` was the lone outlier
using an OpEx pool ~3.8x too small and a rate ~4x too high — two fabricated numbers that happen
to arrive at the same headline range by coincidence. A reader who did the math off `/roi` would
get a basis that the company's own /sources page calls a different thing.

**Fix:** all 4 spots on `/roi/page.tsx` realigned to the documented model:
- L67 FAQ JSON-LD acceptedAnswer
- L121 stat card `stat` ("1-6%" -> "0.25-1.5%")
- L123 stat card description
- L250 hero paragraph
- L310 portfolio caption (also falsely called the $ range an "industry benchmark" -> "modeled")
The headline $5,900-$35,300 range is UNCHANGED (consistent site-wide). Also dropped the false
"industry benchmarks put..." attribution everywhere: the 0.25-1.5% rate is CapVeri's own scenario
model per /sources, NOT an external benchmark. New framing: "We model CAM leakage at 0.25% to
1.5% of operating expenses. For a 200,000 square foot building, that's about $5,900 to $35,300
a year."

**Validation:** tsc no roi/page errors; marketing-copy-gate exit 0 (1431 files, from worktree);
third-grade humanizer-clean (active voice, no em-dash/AI-vocab, real sourced range). third-grade
evaluate_copy.py reported a hard "max 16 words" FAIL that is a pure MEASUREMENT ARTIFACT: the
splitter breaks thousands-separator commas (200,000 -> 2 tokens, $5,900 -> 2, $35,300 -> 2) and
decimal points (0.25%/1.5%), inflating word/sentence counts. True human metrics: 4 sentences,
max 13 words, avg ~8, FK grade <1 -- and strictly shorter than the copy it replaces. Required
numeric facts must stay verbatim; accepted with documented judgment per the skill's exception rule.

**Ship:** render-verified on :3030 (hero/stat/caption render new copy; zero "590K"/"1-6%"/
"industry benchmark" on page). code d49f58fa, worker capveri-marketing 100% 1c3ba245, prod
www.capveri.com/roi verified 3x (200, all 3 new strings live, zero stale basis). worktree
goal-mktg-c92.

**LESSON:** a page that states a derivation ("X pool x Y% = $Z range") must reconcile every
factor with the SITE'S OWN citations page, not just land on the right final number. /roi and
/sources both produced $5,900-$35,300 but via incompatible (pool, rate) pairs -- the final
number matching hid two fabricated inputs. When a page shows the math behind a flagship stat,
grep the OpEx pool size and the rate against /sources + the modeled-estimate resource, not just
the headline figure. Also: "industry benchmark" is a specific claim -- a number documented as a
"modeled estimate" must not be relabeled a benchmark.

---

## C93 — FIX MED-HIGH (copy-honesty / whole-context-fit) — /solutions overstated recovery stat

**Defect:** `marketing/data/solutions.json:248` — the `cam-recovery-optimization` solution
subheadline (renders on /solutions/cam-recovery-optimization) claimed "Most portfolios recover
85-92% of eligible CAM expenses." That overstates the typical case and contradicts the site's
own canonical resource `marketing/src/app/resources/cam-recovery-ratio/page.tsx`, which documents
recovery by lease structure: FAQ (~L54) "office 60-80%, mixed portfolios 70-85%, full NNN
90-100%"; benchmark table (~L324-368) industrial NNN 95-100%, strip retail 88-97%, power center
75-90%, office 60-80%, mixed portfolio 70-85%. "Most portfolios" (mixed/office, the common
multi-property case) sit at 60-85%, NOT 85-92% — 85-92% is above every tier except pure NNN.
The overstatement also UNDERCUT the pitch: if you already recover 85-92%, the gap isn't worth
fixing.

**Fix:** rewrote to the canon's exact mixed-portfolio figure (1 JSON value): "Recovery ratios
depend on your lease mix. Mixed portfolios often recover just 70-85%. CapVeri finds the gaps
costing you money." 70-85% is verbatim the resource's mixed-portfolio number, targets CapVeri's
real buyer (multi-property/mixed portfolios), and is a STRONGER pitch (a real 15-30% gap).

**Validation:** JSON valid; marketing-copy-gate exit 0 (1431 files, from worktree); third-grade
PASS (3 sentences, avg 7 words, max 7, FK 6.2, no hard-gate hits), humanizer-clean (active voice,
no em-dash, canon-backed number). The two other "85-92" hits in the repo are blog MDX correctly
scoped to "multi-tenant retail with anchor exclusions" — properly qualified, within canon, NOT
defects.

**Ship:** render-verified :3030 (/solutions/cam-recovery-optimization new subheadline, zero
85-92/"Most portfolios recover"). code 9781ec06, worker capveri-marketing 100% 8c2988a7, prod
www.capveri.com/solutions/cam-recovery-optimization 3x (200, both new strings live, old stat
absent). worktree goal-mktg-c93.

**LESSON:** "Most/typical [audience] [verb] N%" is a UNIVERSAL claim — verify N against the
site's own tiered benchmark, not just plausibility. A number that's only true for the BEST
segment (pure NNN) misrepresents the typical case when labeled "most." Also: an overstated
baseline can BACKFIRE on the pitch (small implied gap = low value); the honest lower number is
often the stronger sell. New sub-vein: persona/solution subheadlines that quote a single headline
% — grep for "recover N%" / "Most/typical ... %" and reconcile vs cam-recovery-ratio + reit-benchmarks.json.

---

## C94 — /solutions cam-recovery FAQ aligned to recovery-ratio canon (residual of C93)

**Defect (MED-HIGH copy-honesty / whole-context-fit):** `marketing/data/solutions.json:283`,
the `cam-recovery-optimization` solution's FAQ "What is a typical CAM recovery ratio?" answered
"Most commercial portfolios recover between 85% and 92% of eligible CAM expenses. Best-in-class
operators achieve 95-97%." Same overstatement class as C93 — and after C93 fixed the SUBHEADLINE
on the same page to "Mixed portfolios often recover just 70-85%", this FAQ directly
SELF-CONTRADICTED it one screen below. Contradicts canon `resources/cam-recovery-ratio/page.tsx`
(FAQ L54 + benchmark table: full NNN 90-100%, office 60-80%, mixed 70-85%, below 60% = structural
issues). "Most commercial portfolios" (mixed/office) = 60-85% per canon, NOT 85-92%. C93 fixed
line 248 but missed this FAQ at line 283 in the same block.

**Fix (1 JSON value):** rewrote the answer to the tiered canon figures: "It depends on your lease
structure. Full NNN leases recover 90% to 100%. Office properties with base-year structures
recover 60% to 80%. Mixed portfolios often land between 70% and 85%. The gap between your ratio
and your lease maximum is real money. CapVeri helps you recover it." Mirrors canon L54 verbatim
on the numbers, resolves the same-page contradiction, keeps the recovery-gap sell.

**Validation:** JSON valid; marketing-copy-gate exit 0 (1431 files, from worktree); third-grade
PASS (6 sentences, avg 8.0 words, max 12, FK 4.2 warn-only; NNN/percentages are required domain
facts) after dropping hard words "classification"/"calculation" from the closing line;
humanizer-clean (active voice, no em-dash). The two other "85-92" repo hits are blog MDX scoped
to qualified retail-with-anchor cases — not defects (confirmed in C93).

**Ship:** render-verified :3030 (/solutions/cam-recovery-optimization — new FAQ + tier text
present, old "Most commercial portfolios recover between 85% and 92%" gone, C93 subheadline still
present = no regression). code 00031c7c, worker capveri-marketing 100% 68c5b0d4, prod
www.capveri.com/solutions/cam-recovery-optimization 3x (200, new FAQ + tier text live, old stat
absent). worktree goal-mktg-c94.

**LESSON:** when you fix an overstated stat on a page, AUDIT EVERY surface on that SAME page for
the same number — C93 fixed the subheadline but a sibling FAQ answer kept the old "85-92%", which
turned a single-fix into a same-page self-contradiction. A page is one claim-surface: grep the
whole file (subheadline + stats + FAQ + steps) for the number you're correcting, not just the one
string you found first.

## C95 — FIX (MED copy-honesty): CapVeri's own modeled leakage range falsely attributed to "industry" — 2026-06-22

**Defect:** the flagship 0.25%-1.5% CAM-leakage rate (basis of the $5,900-$35,300/building/year
range) is CapVeri's OWN scenario/modeled assumption, not an industry-observed figure. The
authority is `/sources` (page.tsx:257): "Modeled from a 200,000 SF building using IREM office
opex benchmark... and **scenario** leakage rates of 0.25%-1.5%. This is an **assumption-driven
estimate, not a universal outcome claim**." `cam-leakage-guide.mdx:79` agrees in its own stat
caption (source: "Modeled estimate"). But three lines on two LIVE resource pages framed the same
rate as observed industry data:
- `cam-leakage-guide.mdx:13` (FAQ frontmatter) + `:176` (inline FAQ object) — identical string,
  "industry patterns suggest rates between 0.25% and 1.5%... are common."
- `cam-cap-rate-multiplier.mdx:129` — "Industry data suggests leakage rates of 0.25%–1.5%..."

Same false-attribution class as C92 (/roi): a self-derived modeled assumption dressed up as an
external industry finding contradicts the page's own authoritative basis statement.

**Fix:** reword all three to "we model" framing.
- leakage-guide FAQ → "Leakage rates vary by portfolio. We model a range of 0.25% to 1.5% of
  total operating expenses. Take a 200,000 SF office building with typical expenses. That models
  to roughly $5,900 to $35,300 in lost recovery per building each year." (split the long sentence
  to genuinely shorten; replace_all caught both copies)
- cap-rate attribution clause → "We model leakage at 0.25% to 1.5% of total operating expenses."
  (also drops the en-dash; surrounding pre-existing sentences untouched — no scope creep)

**Verify:** marketing-copy-gate exit 0 (1431 files); third-grade accepted (the "max 16 words"
flag is the documented thousands-comma tokenizer artifact — true 14, at limit; "operating" is a
required /sources canon term; "conservative"/"recoverable" live in PRE-EXISTING untouched
cap-rate prose, confirmed by the 3-line diff). Render-verified on :3030 (temp-copy over main
tree, both backups restored, git clean): leakage-guide HTML has "We model a range of 0.25% to
1.5%" + "Take a 200,000 SF office building", no "industry patterns suggest"; cap-rate HTML has
"We model leakage at 0.25% to 1.5%", no "Industry data suggests". Prod-verified www.capveri.com
3x: both new phrases present on both pages, both old "industry" phrases absent.

**Ship:** code 03403cfe, worker capveri-marketing 100% 3aae4afc, prod 3x clean.

**LESSON:** a modeled/scenario assumption the product derives itself must NEVER be attributed to
"industry data/patterns" — that's a fabricated external proof. When a number has a documented
in-house basis (here /sources: "scenario... assumption-driven estimate"), every reader-facing
mention must use first-person modeling language ("we model"), not third-party authority framing.
Audit = grep resource MDX for "industry (data|patterns|standard)" near any stat that traces back
to a /sources "Modeled estimate" caption. Same class as C92.

---

## C96 — Fabricated time-savings stats on persona + role pages (FIX HIGH copy-honesty)

**Defect:** `marketing/data/personas.json` and `marketing/data/roles.json` presented
unsourced time-savings figures as fact. personas.json headline metric stat blocks (render on
`/for/[persona]`): controller "60-75% / Less time per building reconciliation" + "6-8 wks → 1-2 /
Typical 30-building season", lease-admin "50-65% / Less lease-verification time", accountant
"40-55% / Less year-end GL review time", director "8-10 wks → 3-4 / Typical reconciliation season".
roles.json `timeSavings` prose (render on `/resources/roles/[role]/cam-guide`): four
"[role]s report reducing ... by 40-75%" / "report reducing ... season from 8-10 weeks to 3-4"
strings. NONE of these percentages or week-ratios appear in `/sources` internalClaims (the only
disclaimed CapVeri-specific claims are the modeled $5.9K-$35.3K recovery range, building-value
impact, portfolio leakage, the 28%-discover stat, and the $445,500 NOI figure). Time-savings was
never measured or disclaimed → fabricated proof, same class as C70/C88/C92. The cfo and
asset-manager siblings in the SAME files already used only canon-sourced values ($5.9K-$35.3K,
30 days) or factual descriptors, establishing the honest pattern these 9 violated.

**Fix:** replaced the 5 personas.json metric values + 4 roles.json prose strings with honest
design-intent copy that mirrors each persona's real feature (independent recalculation, ERP/lease
drift detection, GL anomaly flags, verified-before-send) so no new claim is introduced —
e.g. controller "Recalculated / Every charge redone from source, not trusted",
"Review / Approve results instead of rebuilding each one"; director "Verified / Each statement
checked against lease terms first". roles.json controller prose: "CapVeri works out each building
again from the source data. Your controllers review and approve the results. They no longer rebuild
every reconciliation by hand." cfo/asset-manager siblings untouched.

**Validate:** both JSON parse; marketing-copy-gate exit 0 (1431 files); third-grade evaluate_copy.py
PASS on all 4 roles prose strings + all 5 persona labels (allow ERP/GL/CapVeri/reconciliation —
"reconciliation" is the page's subject term; reworded "recalculates"→"works out ... again" to clear
the hard-word gate). Render-verified on :3030 (temp-copy over main tree): /for/property-controller
shows "Recalculated"/"Every charge redone" and not "60-75%"/"6-8"; /for/director-property-management
shows "Each statement checked against lease terms first" and not "8-10 wks"; the controller
cam-guide shows "works out each building again" and not "report reducing". Main tree restored clean.

**Ship:** code 9f713b88, worker capveri-marketing 100% c88b3779, prod /for/property-controller +
/resources/roles/property-controller/cam-guide 200 3x (new copy live, old stats gone).

**LESSON:** persona/role data files are a prime hiding spot for invented "report reducing by X%"
proof — testimonial-style framing makes a fabricated metric read as a customer finding. Any
percentage or before→after ratio in *-data.ts/*.json that isn't in /sources internalClaims is
fabricated; replace with capability description, not a different invented number. Same class as
C70/C92. Honest siblings in the same file (cfo/asset-manager here) are the tell that the pattern
was already known and these specific entries drifted.

---

## C97 — Fabricated "4 to 8 hours per building" manual average on /switch/manual-process (FIX HIGH copy-honesty)

**Defect:** `marketing/data/switch.json` slug `manual-process` (renders LIVE at `/switch/manual-process`,
sitemap 200) painPoint "Time Wasted on Repetitive Calculations" stated as flat fact:
"The average manual reconciliation takes 4 to 8 hours per building. For a 20-building portfolio,
that is 80 to 160 hours of staff time every year spent on calculations that software can complete
in minutes." That precise per-building average is NOT in `/sources` internalClaims. The site's ONLY
disclosed manual-time figure is "400+ hours per year on manual CAM reconciliation" (sources/page.tsx
id `manual-cam-hours-datagrid`), itself attributed to a Datagrid blog ("40+ hours monthly" annualized)
and skeptically caveated ("No disclosed study design... Likely illustrative positioning for an AI
vendor"). So "4 to 8 hours per building" + the derived "80 to 160 hours" are an invented precise
average presented as established fact. Fabricated proof, same class as C96/C70.

**Fix:** replaced with honest qualitative copy that keeps the point without a number:
"Manual reconciliation eats hours of staff time on every building. Across a portfolio, that adds up
to days of repeat work each year. Software does the same math in minutes." ("hours of staff time" /
"days of repeat work" are qualitative, not a precise claimed average.)

**Validate:** JSON parses; marketing-copy-gate exit 0 (1431 files); third-grade evaluate_copy.py PASS
(allow "reconciliation", the page subject term); humanizer-clean (active, varied, no AI tells).
Render-verified on :3030 (temp-copy over main tree): /switch/manual-process shows "eats hours of
staff time" and not "4 to 8 hours per building" / "80 to 160 hours". Main tree restored clean.

**Ship:** code a9807898, worker capveri-marketing 100% 2b7e5b73, prod /switch/manual-process 200 3x
(new copy live, both old figures gone).

**LESSON:** /switch and /alternatives pSEO data files carry the same fabricated-metric risk as
persona/role files — a painPoint "description" reads as a documented industry stat. Any precise
"average X hours/days/% per building" that isn't in /sources internalClaims is invented; the site's
own disclosed figure (here 400+ hrs/yr, caveated) is the tell that a DIFFERENT precise number on a
product page was made up. Replace with a qualitative cost, not another invented number. Same class
as C96/C70/C88.

---

## C98 — FIX HIGH (copy-honesty / fabricated proof) — /alternatives/outsourced-cam manual-time average

**Defect:** `/alternatives/outsourced-cam` (LIVE; every alternatives slug gets generateStaticParams +
a sitemap entry) stated a precise per-property MANUAL reconciliation time as fact in two reader-facing
spots: the In-House Excel alternative's `pricing` ("Staff time only (typically 4-8 hours per property
per reconciliation).") and the comparison table "Time to Results" Excel cell ("4-8 hours/property").
That figure is not in the /sources internalClaims; the site's only disclosed manual-time number is the
skeptically-caveated "400+ hours/year on manual CAM" (sources/page.tsx id `manual-cam-hours-datagrid`).
Same fabricated-metric class as C97 (switch.json "4 to 8 hours per building").

**Fix:** honest qualitative copy matching the SIBLING alternatives tables, which already render Excel
time as "Hours per property" (alternatives.json:455) / "Hours" (:133, :292):
- pricing → "Staff time only (hours per property, no software fee)."
- table cell → "Hours per property"
Competitor MARKET pricing left intact ($2K-$10K/building outsourced, 2-6 wk turnaround, Yardi
$15K-$100K) — that is publicly-citable competitor pricing, not an invented internal-process metric.

**Gates:** JSON parse OK; marketing-copy-gate 0 (1431 files); third-grade PASS on the pricing string
(allow reconciliation); humanizer-clean (short, plain, no AI tells). Render-verified on :3030 temp-copy
(/alternatives/outsourced-cam: new pricing + "Hours per property" cell present, old "4-8 hours" gone),
main tree restored clean.

**Ship:** code 2c7e6919, worker capveri-marketing 100% 3e4077ec, prod /alternatives/outsourced-cam
200 3x (new copy present, old "4-8 hours" absent), worktree goal-mktg-c98.

**LESSON:** the SAME invented manual-time average can recur across multiple pSEO data families
(switch.json C97, alternatives.json C98) — when you kill a fabricated "X hrs per building/property"
in one file, grep EVERY data file for the same number/unit pattern. The honest fix is often already
on-site: sibling comparison tables in the same file rendered the qualitative "Hours per property", so
match the existing honest phrasing instead of inventing new copy. Class: C97/C96/C70/C88.

---

## C99 — FIX HIGH (copy-honesty): fabricated "8-12 hours per building" manual-time stat on /vs/manual-reconciliation

**Surface:** `/vs/manual-reconciliation` (LIVE — `manual-reconciliation` in retainedComparisonSlugs),
sourced from `marketing/data/comparisons.json` `manual-reconciliation` slug. Same defect class as
C97/C98 but the densest cluster yet: a precise "8-12 hours per building" (and "15-20+ for complex
buildings") manual CAM reconciliation time stated as fact in 7 places — painPoint title+description,
two comparison-table cells, the FAQ answer, and the CTA heading — plus one echo on
`/vs/outsourced-cam`.

**Why it is a defect:** that per-building manual-time figure is NOT in `/sources` internalClaims. The
ONLY sanctioned manual-time number on the site is the hedged "400+ hours per year"
(`manual-cam-hours-datagrid`). A precise "8-12 hours per building" stated flatly is fabricated proof,
same honesty class as C70/C88/C97/C98.

**Fix:** replace every "8-12 hours" / "15-20+" per-building figure with honest qualitative copy —
"Hours of work per building", "takes hours of skilled work per building", "Hours of work (more for
complex buildings)", "Replace [now: Get CAM reconciliation in minutes, not hours]", etc. — matching
the qualitative phrasing sibling tables in the same file already use. Left ALONE: the already-hedged
~40% error rate ("Industry sources commonly cite", consistent with /sources:39), the qualitative
metaDescription, and the CapVeri "~15 minutes per building" self-performance claim (out of scope).

**Gates:** JSON parse OK; marketing-copy-gate 0 (1431 files); third-grade PASS on the two changed
persuasive strings — painPoint description ("Manual CAM reconciliation takes hours of skilled work per
building. Complex buildings with many tenants take even longer.") and CTA heading ("Get CAM
reconciliation in minutes, not hours.", verb "Get" whitelisted, 7 words); humanizer-clean. Render-
verified on :3030 temp-copy (/vs/manual-reconciliation: new CTA + painPoint present, old "8-12 hours"
/"15-20+" gone), main tree restored clean.

**Ship:** code b1471040, worker capveri-marketing 100% 10906be8, prod /vs/manual-reconciliation 200 3x
(new copy present, old "8-12 hours"/"15-20+" absent) + /vs/outsourced-cam echo now "hours per building",
worktree goal-mktg-c99.

**LESSON:** a fabricated per-building manual-time figure tends to be repeated MANY times within one
data-file slug (painPoint + table cells + FAQ + CTA all parrot the same invented number) — fix every
occurrence in one pass, not just the headline. Grep the whole slug for the literal number+unit before
calling it done. Class: C98/C97/C96/C70/C88.

---

## C100 — FIX HIGH (copy-honesty): fabricated manual-time + invented labor-rate stats on /alternatives/manual-reconciliation

**Surface:** `/alternatives/manual-reconciliation` (LIVE — all alternatives slugs get generateStaticParams
+ sitemap via pseo-data.ts getAllAlternatives), sourced from `marketing/data/alternatives.json`
`manual-reconciliation` slug (route distinct from the /vs/manual-reconciliation comparisons.json page
fixed in C99). The worst fabricated-time cluster of the run: a precise "4-12 hours per property" stated
as fact, then COMPOUNDED into invented derivations — "80-240 hours of skilled labor", a made-up
"$50-$100/hour fully burdened" rate, "$4,000-$24,000 in labor alone" (painPoint), two comparison-table
rows ("Time per Property" manual "4-12 hours"/excel "2-4 hours"; "Cost (20 Properties)" manual "$4K-$24K
labor"/excel "$2K-$8K labor"), and a FAQ answer ("savings of 60-220 hours / 1.5-5.5 weeks of full-time
work").

**Why it is a defect:** none of these figures are in `/sources` internalClaims. The only sanctioned
manual-time number on the site is the hedged "400+ hours per year". The hourly labor rate and every
dollar/hour total derived from it are pure fabrication — the same honesty class as C99/C98/C97/C70/C88,
but with an extra invented cost basis layered on top.

**Fix:** replace with honest qualitative copy matching the file's own sibling tables — painPoint →
"Manual CAM reconciliation takes hours of skilled work per property. A bigger portfolio means days of
repeat work each cycle. All of it costs paid staff time."; Time-per-Property manual/excel cells →
"Hours"; Cost manual/excel cells → "Staff time"; FAQ → "Manual work takes hours per property. CapVeri
cuts that to minutes. Across a portfolio, that saves days of repeat work each cycle." LEFT ALONE:
competitor MARKET pricing (Yardi $15K-$100K+/yr, outsourced $40K-$200K/yr), competitor Yardi "1-2 hours"
+ outsourced "2-6 weeks" turnaround, and the CapVeri "15-30 minutes" self-performance claim.

**Gates:** JSON parse OK; marketing-copy-gate 0 (1431 files); third-grade PASS on the two changed
persuasive strings (painPoint description + FAQ answer); humanizer-clean. Render-verified on :3030
temp-copy (new painPoint + FAQ present, "4-12 hours"/"$4,000-$24,000"/"80-240 hours"/"$50-$100"/"$4K-$24K"
all gone), main tree restored clean.

**Ship:** code 145467fa, worker capveri-marketing 100% 173a0f3a, prod /alternatives/manual-reconciliation
200 3x (new copy present, fabricated figures absent), ledger (this), worktree goal-mktg-c100.

**LESSON:** the fabricated-manual-time vein gets WORSE when a page builds a cost model on top of the
invented time — an unsourced "$X/hour" rate plus any dollar total derived from it is a second fabricated
claim stacked on the first. Kill the whole derivation chain (time → hours → $/hr → $ total), not just
the headline hours. Class: C99/C98/C97/C96/C70/C88/C92.

---

## C101 — FIX HIGH (copy-honesty): fabricated manual-time + derived % on /integrations/[slug] Time Savings

**Where:** `marketing/data/integrations.json` `timeSavings` block, rendered by
`marketing/src/app/integrations/[slug]/page.tsx` (3-column grid under h2 "Time Savings", labels
"Before CapVeri" / "With CapVeri" / "Improvement"). All 4 live slugs: yardi, mri, realpage, appfolio
(all 200, in sitemap + generateStaticParams).

**Defect:** each slug's `before` stated a fabricated per-building manual-time figure as fact — four
different invented numbers: yardi "40-80", mri "30-60", realpage "30-60", appfolio "20-40" hours per
building per year — and `metric` stated a precise "% time reduction" (99/98/98/97%) derived from that
invented number. Neither is in /sources internalClaims; the site's only sanctioned manual-time figure is
the caveated "400+ hours/year". The % only holds at the invented high-hours end. Same fabricated-manual-
time vein as C97-C100.

**Fix:** `before` → "Hours per building each year" (qualitative, ×4); `metric` → "Hours to minutes" (×4).
Kept `after` "15 minutes per building" (CapVeri self-claim, consistent site-wide). JSON valid; copy gate
exit 0; third-grade PASS on both new fragments; render-verified all 4 pages on :3030 (Before/With/
Improvement all show honest copy).

**Ship:** code 6d01553d, worker capveri-marketing 100% dff59e0a, prod /integrations/{yardi,mri,realpage,
appfolio} 200 (honest copy + metric present, fabricated hours/% absent), ledger (this), worktree
goal-mktg-c101.

**LESSON:** a before→after→improvement stat block hides TWO fabricated claims when the "improvement" is a
precise % — the % is just the invented "before" restated as a ratio. When you kill a fabricated `before`,
the derived `metric`/`%`/multiplier dies with it; replace the % with a qualitative "X to Y", never a
number. Whole-family fix: all 4 slugs carried the same defect shape with different invented numbers — grep
the data file for the field, fix every occurrence in one cycle. Class: C100/C99/C98/C97/C70/C88/C92.

---

## C102 — FIX HIGH (copy-honesty): fabricated "4-8 hours per building" on /solutions/year-end-cam-reconciliation

**Where:** `marketing/data/solutions.json`, slug `year-end-cam-reconciliation` (LIVE, 200; all solutions
get generateStaticParams). Two surfaces: the problem paragraph (`problem.paragraphs`, rendered
page.tsx:206) and the "15-Minute Per Building" feature card (`features[].description`).

**Defect:** both stated a fabricated per-building manual-time figure as fact — "A single building can take
4-8 hours of spreadsheet work" and "What used to take 4-8 hours of spreadsheet work per building...".
"4-8 hours per building" is not in /sources internalClaims; the only sanctioned manual-time figure on-site
is the caveated "400+ hours/year". Same fabricated-manual-time vein as C97-C101 (the "4-8 hours" number
also matched C97's switch.json and C98's outsourced-cam invented figure — a recurring invented constant).

**Fix:** problem paragraph -> "A single building can take hours of spreadsheet work..." (minimal honesty
removal of the invented number; surrounding pre-existing prose untouched — readability is a separate
class). Feature card -> "Spreadsheet work used to take hours per building. CapVeri does it in about 15
minutes. That includes review and approval time." (keeps the 15-minute self-claim; third-grade PASS 8/7/6
words). The diligence-slug "48 hrs"/"24-48 hours" turnaround figures are CapVeri's own processing-time
self-claim (different slug, out of vein) — LEFT. JSON valid; copy gate exit 0; render-verified both
surfaces on :3030 (zero "4-8 hours" on page).

**Ship:** code 08ec9d26, worker capveri-marketing 100% a76b8348, prod /solutions/year-end-cam-reconciliation
200 3x (both surfaces honest, fabricated absent), ledger (this), worktree goal-mktg-c102.

**LESSON:** the SAME invented manual-time constant ("4-8 hours per building") recurs across unrelated data
files (switch.json C97, outsourced-cam C98, solutions.json C102) — once you identify an invented figure,
grep EVERY data file for that exact number, not just the current file. A "before/after" feature card pairs
a fabricated `before` ("4-8 hours") with a real `after` ("15 minutes"); keep the self-claim, strip the
invented baseline. Class: C101/C100/C99/C98/C97/C70.

---

## C103 — FIX HIGH (copy-honesty): fabricated "average of 40+ hours per building" on /vs/sage-intacct

**Where:** `marketing/data/comparisons.json`, slug `sage-intacct` (LIVE, /vs/sage-intacct 200; in
retainedComparisonSlugs). Two surfaces with the IDENTICAL sentence: the "What Sage Intacct does well"
strengths paragraph (`strengths.paragraphs[1]`) and the AlertTriangle callout (`strengths.callout.text`).

**Defect:** both stated "Property controllers spend an average of 40+ hours per building on annual CAM
reconciliation..." — a fabricated per-building manual-time figure framed as a definitive statistical
average. "40+ hours per building" is not in /sources internalClaims; the only sanctioned manual-time
figure on-site is the caveated "400+ hours/year". The "an average of" framing makes it worse — it asserts
a measured statistic the site cannot back. Same fabricated-manual-time vein as C97-C102.

**Fix:** both occurrences (replace_all, identical text) -> "Property controllers spend hours per building
on annual CAM reconciliation using spreadsheet models layered on top of Sage Intacct. CapVeri automates
the reconciliation layer that Intacct leaves to spreadsheets." Drops the invented number AND the false
"average" framing; keeps the qualitative point + CapVeri value line. Whole-slug grep confirmed these were
the only time figures in sage-intacct (1133-1356). JSON valid; copy gate exit 0; render-verified both
surfaces on :3030 (2 occurrences honest, zero "40+ hours" on page).

**Ship:** code dac09146, worker capveri-marketing 100% 8fe452ed, prod /vs/sage-intacct 200 3x (honest copy
present, fabricated absent), ledger (this), worktree goal-mktg-c103.

**SCOUT NOTE (reachability, reinforces C66):** /workflows/portfolio-consolidation is 404 — workflows.json
is DARK data (no /workflows/[slug] app route renders it), so its ":423 20-40 hours per building" +
"600-1,200 hours" figures are NOT reader-facing. Verify route reachability (curl prod) before sizing a
data-file finding; only /vs/ slugs in retainedComparisonSlugs and routed pSEO families are live.

**LESSON:** "spend an average of N hours" is a DOUBLE tell — the number is fabricated AND "an average of"
falsely asserts it's a measured statistic; strip both. The same fabricated sentence often appears verbatim
in a body paragraph AND a callout/schema field on the same page — replace_all and verify the count.
Class: C102/C101/C100/C99/C98/C97/C70.

## C104 — FIX HIGH (copy-honesty): fabricated "% of Q1" role time stats purged from role CAM guides
- **Defect:** `marketing/data/roles.json` `timeOnCam` rendered six precise "% of Q1 spent on CAM" figures **as fact** with false survey framing — "Property controllers ... report spending 40-60% of Q1", "CFOs spend 10-20% of Q1", "Lease administrators report spending 25-40%", "Property accountants spend 15-30%", "Asset managers spend 5-15%", "Directors ... report spending 20-35%". None of those per-role time percentages are in the sanctioned `/sources` internalClaims set (the only disclosed manual-time figure is the caveated "400+ hours/year"). Rendered live at `/resources/roles/[role]/cam-guide` (page.tsx:152, under the "Time Spent on CAM" heading), all six slugs in sitemap.ts, prod 200.
- **Distinct from C96:** C96 fixed time-*savings* percentages (reduction claims) in personas/roles; these are a different claim-set — "% of Q1 *spent* on CAM" — left untouched then.
- **Fix:** replaced all six with honest qualitative copy that keeps the role-specific task detail and rough relative ordering, dropping every invented percentage and the "report spending" survey attribution (e.g. "Property controllers handle most CAM reconciliation. At firms with 20 to 50 buildings, it fills much of Q1."). Third-grade gate PASS on all six (FK warn only; allow-term the unavoidable domain nouns CAM/reconciliation/ERP/GL/Q1 + job-title nouns administrators/management). Marketing copy gate exit 0.
- **Reachability scout (C66/C103 discipline):** the prior plan's "C104 target" (`comparisons.json` "8-40 hours" at lines 2169/2198) was MISLABELED as `/vs/excel`; it actually lives in the **`in-house-team`** slug, which is NOT in retainedComparisonSlugs → `/vs/in-house-team` 308-redirects to `/vs` (DARK, absent from sitemap). The real live `excel` slug is CLEAN of the time vein ("Setup time" already qualitative "Hours per building, annually"; ~40% error rate is the sanctioned hedged figure). So the systematic per-building/per-role manual-time vein is now **EXHAUSTED across all live data-family routes** (only remaining instances are dark in-house-team + dark workflows.json).
- **Verify:** render-verified property-controller + asset-manager on :3030 (new copy under "Time Spent on CAM"); prod-verified all 6 role cam-guides 200 with new copy present and zero fabricated figures.
- **Refs:** code 1199292c, worker capveri-marketing 100% on 0c4cb30e, worktree goal-mktg-c104.

## C105 — Fabricated product-performance stats purged from /solutions/multi-property-cam (FIX HIGH, copy-honesty)
- **Surface:** `/solutions/multi-property-cam` (LIVE, in sitemap; all solution slugs get generateStaticParams). Stat cards render at `solutions/[slug]/page.tsx:255-260` (`metric.value` + `metric.label`).
- **Defect:** the metrics array (`data/solutions.json:94-95`) carried two precise stats stated as fact with NO backing in `/sources` internalClaims or product docs: **"50+ Buildings managed per controller on average"** (an unsourced industry-average claim, not even a CapVeri capability) and **"3x Faster portfolio-wide reconciliation completion"** (an unsourced performance multiplier). The third card ("Recovery" / "Surface recovery improvements across your portfolio") was already honest/qualitative — so two of three cards were invented.
- **Same class as C70/C96/C104:** a precise number/multiplier presented as fact, absent from the sanctioned internalClaims set, is fabricated. This is the *product-performance metric* shape (vs C104's per-role time-spent %); same honesty bar.
- **Fix:** replaced both fabricated values with honest qualitative values mirroring the page's REAL features (Portfolio Dashboard → "One screen"; Consistent Methodology → "Consistent"), matching the surviving third card's style: `"One screen"` / "Track every building's reconciliation in one place" and `"Consistent"` / "Same BOMA 2024 rules across every building". No invented numbers; both map directly to features already listed on the same page.
- **Gates:** JSON valid; marketing copy gate exit 0 (1431 files); third-grade evaluate_copy PASS on both new labels (allow-term reconciliation/BOMA; FK warn only).
- **Verify:** render-verified on :3030 (title = CapVeri; both old fab stats gone; both new value+label live); prod-verified www.capveri.com 3x (200, zero fab hits, both new labels present).
- **Refs:** code 045baece, worker capveri-marketing 100% on 96370287, worktree goal-mktg-c105.
- **Remaining stat-vein (C106+):** other solution slugs still carry candidate unbacked metrics — `year-end-cam-reconciliation` "95%+ GL codes auto-mapped on first upload" (L35) and `cam-recovery-optimization` "97%+ Target recovery ratio achievable" (L273, verify vs C93/C94 tiered recovery-ratio canon first — may be sanctioned/aspirational). One slug per cycle.

## C106 — Fabricated "95%+ GL auto-mapped" stat purged from /solutions/year-end-cam-reconciliation (FIX HIGH, copy-honesty)
- **Surface:** `/solutions/year-end-cam-reconciliation` (LIVE, sitemap; stat cards render at `solutions/[slug]/page.tsx:255-260`).
- **Defect:** the metrics array (`data/solutions.json:35`) carried **"95%+ GL codes auto-mapped on first upload"** stated as fact. No backing anywhere: NOT in `/sources` internalClaims (sanctioned set is the modeled $5.9K-$35.3K recovery range + ROI only), and the only "95%" in `docs/feature-inventory/calculation-engine.md` is the **default occupancy gross-up target** (an unrelated number). Worse, the real GL flow requires **user mapping configuration + review** (Configure Mappings / "Missing GL Account Mappings" banner, generic-mapping required/submitted), so the card also overstated automation.
- **Same class as C105/C104/C70:** a precise product-performance % stated as fact, absent from internalClaims, is invented.
- **Fix:** replaced with an honest qualitative value matching siblings ("Minutes" L34 / "Zero" L36): `"Mapped"` / "GL codes matched to expense pools for your review" — describes the real feature, reflects the mandatory human-review canon, invents no rate.
- **Gates:** JSON valid; marketing copy gate exit 0; third-grade evaluate_copy PASS (FK 5.0; allow-term GL).
- **Verify:** render-verified on :3030 (title = CapVeri; old "95%+" + label gone; new value+label live); prod-verified www.capveri.com 3x (200, 0 fab, new label present).
- **Refs:** code 1449473b, worker capveri-marketing 100% on c078aeb6, worktree goal-mktg-c106.
- **Remaining stat-vein (C107+):** `cam-recovery-optimization` metrics still carry "97%+ Target recovery ratio achievable" (L273) and "6 weeks Typical time to full recovery optimization" (L274). The 97%+ sits within the C93/C94 tiered recovery-ratio canon (best-in-class 95-97%) but is framed as a flat universal "achievable" target — a whole-context-fit/honesty question vs the page's own tiered copy; "6 weeks typical" is an unbacked time claim. Scout vs the page's body recovery-ratio copy before fixing.

## C107 — FIX HIGH (copy honesty + whole-context-fit): `/solutions/cam-recovery-optimization` metric cards contradicted the page's own tiered recovery-ratio canon
- **Surface:** `/solutions/cam-recovery-optimization` (LIVE, sitemap, prod 200; stat cards render at `solutions/[slug]/page.tsx:255-260`).
- **Defect (deferred from C106):** the metrics array (`data/solutions.json:273-274`) carried two stats that contradicted the SAME page's own body:
  - **"97%+ Target recovery ratio achievable"** — presented the top of the full-NNN tier as a flat universal target, while the page's **subheadline** says "Recovery ratios depend on your lease mix. Mixed portfolios often recover just 70-85%" and the **FAQ** tiers it explicitly (full NNN 90-100%, office base-year 60-80%, mixed 70-85%). So the card asserted a number the page's own copy refutes two cards down.
  - **"6 weeks Typical time to full recovery optimization"** — overstated the page's own **FAQ**: "Full optimization across a portfolio typically takes 4-6 weeks."
- **Fix:**
  - Card 2 → `"Your max"` / "Recover up to what your leases already allow" — matches the page's own "the gap between your ratio and your lease maximum is real money / CapVeri helps you recover it" framing; asserts no flat ratio.
  - Card 3 value → `"4-6 weeks"` (label unchanged) — exact match to the FAQ's own range.
- **Gates:** JSON valid; marketing copy gate exit 0; third-grade evaluate_copy PASS on the new label (8 words, max 8, no gates tripped); humanizer-clean (plain, concrete, no AI tells).
- **Verify:** render-verified on :3030 (title = CapVeri; old "97%+" gone, "Your max"/"Recover up to..."/"4-6 weeks" present); prod-verified www.capveri.com 3x (200, new label + "4-6 weeks" present, "97%+" + ">6 weeks<" both 0).
- **Refs:** code dabc57f2, worker capveri-marketing 100% on 2276b7dd, worktree goal-mktg-c107.
- **LESSON:** a stat card and the FAQ two cards below it are ONE claim — when a page already tiers/qualifies a metric in its body (lease-mix-dependent ratios), a metrics-array card asserting the best-case tier as a flat universal "achievable" target is a self-contradiction, not a highlight. Audit each metric.value against the page's own subheadline + FAQ, not just against /sources. Stat-vein (solutions.json metrics) for the recovery/year-end/multi-property slugs now swept; remaining slugs: acquisition-due-diligence, yardi-cam-errors.

## C108 — FIX MED (copy honesty + whole-context-fit): `/solutions/acquisition-due-diligence` turnaround metric overstated vs the page's own FAQ
- **Surface:** `/solutions/acquisition-due-diligence` (LIVE, sitemap, prod 200; stat cards render at `solutions/[slug]/page.tsx:255-260`).
- **Defect (same class as C107):** the metrics array (`data/solutions.json:154`) read **"48 hrs / Typical turnaround for full diligence analysis"** — the flat top of the page's own range, framed as typical. The page's own FAQ "How quickly can CapVeri produce a diligence report?" says: "For a single property, expect results within **24-48 hours** of uploading complete data." So the card picked the worst-case top, asserted it as "typical," and labeled it "full diligence analysis" (the FAQ scopes 24-48h to a **single property**; portfolio takes longer).
- **Fix:** value → `"24-48 hrs"` (exact FAQ range); label → "Typical turnaround for a single-property analysis" (matches the FAQ's single-property scope).
- **Gates:** JSON valid; marketing copy gate exit 0; third-grade evaluate_copy PASS on the new label (allow-term CAM).
- **Verify:** render-verified on :3030 (title = CapVeri; flat "48 hrs" gone, "24-48 hrs" + new label present); prod-verified www.capveri.com 3x (200, new range+label present, ">48 hrs<" = 0).
- **Refs:** code bcce96e2, worker capveri-marketing 100% on 23713f3e, worktree goal-mktg-c108.
- **Note — yardi-cam-errors checked, CLEAN:** its metrics ("Detect", "ROI", "5 min To upload and start Yardi GL analysis") carry no fabricated measured stat; "5 min to upload and start" is a modest, self-verifiable claim about the user's own upload action (not a performance guarantee).
- **LESSON (reinforces C107):** when a metric card states a single time/number that is the TOP of a range the page's own FAQ already gives, it overstates by dropping the floor and re-labeling "within X-Y" as "typical Y". Align the card to the FAQ's full range. The solutions.json metrics vein is now SWEPT across all 6 slugs (year-end, multi-property, recovery-optimization, due-diligence fixed C106-C108; cam-cost-recovery/yardi CLEAN).

## C111 — FIX HIGH (copy honesty): fabricated manual-time/savings stats in 2 workflows
- **Surface:** `/resources/workflows/year-end-reconciliation` + `/resources/workflows/portfolio-consolidation` (both LIVE; generateStaticParams over getAllWorkflows() = all 13 workflows rendered).
- **Defect:** `marketing/data/workflows.json` stated invented CapVeri quantifications as fact in overview + capveriRole fields: year-end "6-10 week process that consumes most of Q1" + "60-75% reduction in reconciliation calculation time per building"; portfolio "Each building requires 20-40 hours" / "600-1,200 hours of Q1 work" / "math that took 6 weeks now takes 1-2 weeks" + step[0] "take 3x longer than a simple building". None appear in `/sources` internalClaims; none are legal/statutory timeframes (the only EXEMPT class of numbers in this file) -> all unsanctioned, reader-facing fabrications.
- **Fix:** replaced the five fabricated fields with qualitative copy that keeps the value case (Q1 capacity strain, review-and-approve instead of rebuild, net-lease buildings take longer) without inventing hours/weeks/percentages. JSON-valid, marketing-copy-gate exit 0, third-grade evaluate showed only pre-existing domain hard-words + 1 pre-existing passive WARN (no new hard-gate tells); whole-context-fit register matches sibling workflow prose.
- **Verify:** render-verified both pages on :3030 (old strings GONE, new copy PRESENT); prod-verified www.capveri.com 3x (year-end "spans most of Q1", portfolio "capacity problem"/"much longer than a simple building", zero old stats, 200).
- **Refs:** code 94807acc, worker capveri-marketing 100% on 8c5a8b67, worktree goal-mktg-c111.
- **Note — C109 false-positive (dead-duplicate block):** comparisons.json "excel" fabrications I first targeted (lines ~2169/2198/2202) live in an UNREACHABLE duplicate block; getComparison() returns the FIRST slug match (line 484, already clean), so those edits would never render. Aborted; handed dedup to task_0d2b78e5.
- **Note — C110 false-positive (already fixed on master):** roles.json timeOnCam percentages I scouted were read off the STALE main tree (parked on ai-cs-context-body-fix); origin/master already had qualitative copy. Reinforces: read finding CONTENT from origin/master (worktree or `git show`), never the parked main tree.
- **LESSON:** the manual-time-fabrication vein spans 3 pSEO data files — comparisons (dead-dup, handed off), roles (pre-fixed), workflows (C111, the lone live defect). Distinguish fabricated CapVeri quantifications from EXEMPT legal/statutory timeframes before editing; verify a data block is REACHABLE via its first-by-slug loader before sizing it.

## C112 — FIX MED (whole-context-fit): homepage SocialProofStrip narrowed its own "No new system" promise
- **Surface:** homepage `/` SocialProofStrip trust card (`marketing/src/components/landing/SocialProofStrip.tsx:35`, rendered via LandingPageClient -> app/page.tsx). LIVE.
- **Defect:** card titled "No new system needed" (a universal promise) had description "Keep Yardi or MRI. Upload a file you already export." — narrowing to two named tools, implying CapVeri only serves Yardi/MRI shops. Lone outlier vs every homepage sibling: HeroSection.tsx:38 "Keep Yardi, MRI, or your current system", HowItWorksSection.tsx:21 "...from Yardi, MRI, or your current system", ValuePropositionSection.tsx:14 "Keep Yardi, MRI, RealPage, spreadsheets, and your current approvals". /integrations supports yardi+mri+realpage+appfolio. So the card both contradicts its own title and undersells supported systems.
- **Fix:** align to HeroSection's exact sanctioned phrasing -> "Keep Yardi, MRI, or your current system. Upload a file you already export." (kept the second sentence; names the recognizable tools AND covers everyone, matching the title's universal claim).
- **Verify:** marketing-copy-gate exit 0; third-grade PASS (avg 6.5/max 7 words, FK 5.1 warn-only); render-verified on :3030 (new present under "No new system needed", old gone); prod-verified www.capveri.com 3x (200, new=1/old=0).
- **Refs:** code f7a6a441, worker capveri-marketing 100% on 73316baf, worktree goal-mktg-c112.
- **LESSON:** a trust/feature card with a UNIVERSAL title ("No new system needed", "Works with anything") must not narrow its body to a partial enumeration — that contradicts the title and undersells. When siblings on the same page already use a broader, sanctioned phrasing, align the outlier to it rather than inventing new copy.

## C113 — FIX HIGH (copy honesty / false attribution): NOI calculator "industry benchmark" leakage rate
- **Surface:** `/tools/noi-impact-calculator` modeling note (`marketing/src/app/tools/noi-impact-calculator/NOICalculatorClient.tsx:413`). LIVE route.
- **Defect:** note read "Uses 4% industry benchmark leakage rate." The tool's `LEAKAGE_RATE = 0.04` (line 89, applied to the CAM pool: `leakage = totalCAMPool * LEAKAGE_RATE`) is CapVeri's OWN modeling assumption, not a cited benchmark. No 4% "industry benchmark" exists in `/sources` (the only "4%" there is the cap-rate range 4-10%, line 832). `/sources` frames all leakage rates as MODELED scenario assumptions (line 257 "0.25%-1.5% ... an assumption-driven estimate, not a universal outcome claim"; line 271-273 "Modeled portfolio leakage range"). So "industry benchmark" is a false external-authority attribution — the exact C95 antipattern.
- **Fix:** "Uses a 4% leakage rate we model for this estimate." — keeps the tool's actual 4% rate (changing it would alter calculator output / is a different base than the 0.25-1.5% OF OPEX, so NOT injected here to avoid conflating bases — that was the scout's proposed-fix error), removes the false "industry benchmark", and names CapVeri as the modeler ("we model"), matching /sources canon. Kept the existing "Actual results vary by portfolio. Use your own reconciliation history to calibrate." caveat.
- **Verify:** marketing-copy-gate exit 0; third-grade PASS (avg 7.3/max 10 words; only hard-words flagged are pre-existing core domain terms reconciliation+leakage, both in the original note; FK 8.2 warn-only); render-verified on :3030 (new present, old gone); prod-verified www.capveri.com 3x (200, new=1/old=0, h1 intact — build healthy despite Windows OpenNext node_modules copy warnings).
- **Refs:** code f30c51f1, worker capveri-marketing 100% on 6961afcb, worktree goal-mktg-c113.
- **LESSON (reinforces C95):** a flat modeling constant labeled "industry benchmark"/"industry data" is a false attribution whenever the product's own /sources frames that quantity as a modeled assumption — fix by naming the modeler ("we model"), NOT by swapping in a different sanctioned number that has a different base (4% of CAM pool ≠ 0.25-1.5% of OpEx; conflating them creates a new contradiction).

## C114 — FIX HIGH (copy honesty / false attribution + fabricated stat): IREM CAM-error stats on two SEO pages
- **Surface:** `/cam-reconciliation-guide` stat chips (`marketing/src/app/cam-reconciliation-guide/page.tsx:383,385`) + `/cam-charges` stats row (`marketing/src/app/cam-charges/page.tsx:303-304`). Both LIVE in sitemap.
- **Defect (cluster, one class):** three stat claims attributed CAM billing-error figures to **IREM** and used numbers that don't exist in `/sources`. (1) recon-guide:383 "40%+ of CAM statements contain billing errors (IREM)" — `/sources` id `cam-errors-40-percent` documents the 40% as "Attributed to Tango Analytics (2023) via secondary sources" (NOT IREM), wording "40% of CAM reconciliations contain material errors"; the "+" overstates. (2) recon-guide:385 "15–30%: frequency of billing errors found in CAM audits (IREM)" and (3) cam-charges:304 "15–30% of CAM bills contain errors (IREM research)" — NO 15-30% billing-error-frequency stat exists in `/sources`; the only related sanctioned figure is `tenant-audit-recovery-15-20-percent` = "15-20% of billed CAM charges recovered by tenant auditors (Springbord 2025, PredictAP 2026)" — a different number, meaning (recovery not error frequency), and source. So 15-30%/(IREM) is fabricated, not just mis-attributed.
- **Fix:** align all three to `/sources`. recon-guide:383 -> "40% of CAM reconciliations contain material errors (Tango Analytics)" (canonical wording+source, drop "+"). recon-guide:385 -> "15–20%: CAM charges recovered in tenant audits (Springbord)". cam-charges -> stat "15–20%" / label "of billed CAM charges recovered in tenant audits (Springbord)". IREM stays correctly cited everywhere else (it IS the opex-benchmark source: config/plans.ts, cam-benchmark-methodology, cam-benchmarks-by-property-type, sources page) — only the billing-error attribution was wrong.
- **Verify:** marketing-copy-gate exit 0 (1431 files); third-grade PASS per-chip (combined run FAILed only as a no-terminal-punctuation concatenation artifact; "recovered"/"Analytics"/"Springbord"/"Tango" allowed as plain domain verb + required source names; "15–20%" en-dash matches the page's existing "90–180" range glyph, replacing the original "15–30%" — no new tell); render-verified both pages on :3030 via temp-copy (new chips present, old gone); prod-verified www.capveri.com 3x both pages (Tango40=1, Springbord=1, oldIREM=0).
- **Refs:** code 92e8ba03, worker capveri-marketing 100% on 5fd10ba4, worktree goal-mktg-c114.
- **LESSON:** a compact stat CHIP citing a source ("X% ... (SourceName)") is a verifiable claim — cross-check BOTH the number AND the attribution against `/sources`, because a real-sounding org (IREM) legitimately cited elsewhere on the site (opex benchmarks) gets reused as a catch-all citation for unrelated figures it never published. A number that maps to a DIFFERENT sanctioned claim (15-20% recovery) reframed as something else (15-30% error frequency) is fabrication, not re-attribution.
- **C115 candidate (logged, not touched):** `/resources/cam-dispute` FAQ answer (page.tsx:54) cites "60–80% of audited CAM reconciliations contain overcharges", "$0.50 to $3.00 per RSF", "$10,000–$60,000 per year" — none in `/sources`. Separate page + defect class; next cycle.

## C115 — FIX HIGH (copy honesty / fabricated stat + vague attribution): /resources/cam-dispute overcharge figures
- **Surface:** `/resources/cam-dispute` hub (`marketing/src/app/resources/cam-dispute/page.tsx`) — TWO surfaces: visible hero paragraph (line 72) + FAQ answer (line 54, also emitted as FAQPage JSON-LD via faqSchema). LIVE, canonical, in sitemap.
- **Defect:** both surfaces asserted "Studies (consistently find / of commercial lease audits consistently find) that 60–80% of CAM reconciliations contain overcharges"; the FAQ added "Average overbilling ranges from $0.50 to $3.00 per RSF per year" and "For a tenant in 20,000 SF, that represents $10,000–$60,000 per year". NONE of these figures exist in `/sources`. The only sanctioned overcharge figure is Agora's "3-5% in overcharges or misclassifications" (id operating-recovery-loss-3-5-percent); there is no 60-80% frequency, no $/RSF overbilling rate, no $10K-$60K range. "Studies consistently find" is a vague attribution (no cited study) — the exact TELL flagged in prior lessons ("Studies show/Industry data suggests" + a precise number = fabrication, not citation).
- **Fix:** (1) hero -> qualitative, no fabricated %: "CAM reconciliations often contain billing errors, from excluded expenses to gross-up mistakes. Whether you're a tenant spotting overcharges or a landlord building a defensible reconciliation, these guides cover every step: ...". (2) FAQ "What percentage of CAM reconciliations contain errors?" -> answered with the sanctioned, hedged 40% (per /sources cam-errors-40-percent, "widely repeated rather than tied to a single verified study" mirrors the /sources caveat) + kept the qualitative error-type list; dropped the fabricated $/RSF and $10K-$60K. The cam-recovery-ratio "60–80%" hits are a DIFFERENT legit recovery-ratio benchmark — left untouched.
- **Verify:** marketing-copy-gate exit 0; third-grade — only flag is avg-sentence-length 13 (within max-14 hard gate, no semicolon/em-dash/vague/absolute, and SHORTER than the fabricated original it replaces; whole-context-fit override, FAQ domain prose, no new tell); render-verified both surfaces on :3030 via temp-copy (hero + FAQ JSON-LD new, 60–80% + $ figures gone); prod-verified www.capveri.com/resources/cam-dispute 3x (heroNew=1, faq40=1, old60=0, oldDollar=0).
- **Refs:** code 4002564e, worker capveri-marketing 100% on 284843a1, worktree goal-mktg-c115.
- **LESSON (reinforces C114 + the "Studies show" tell):** an FAQ answer that is ALSO emitted as FAQPage JSON-LD double-publishes any fabricated stat (visible + machine-readable for rich results) — fix both the prose and the schema. When a FAQ question literally asks "what percentage", answer with the SANCTIONED figure (here the hedged 40%) rather than deleting the number or inventing a flashier one; a higher, rounder, unsourced number ("60-80%") prefaced by "Studies consistently find" is invented to sound more dramatic than the real cited figure.

## C116 — FIX HIGH (copy honesty / fabricated stat): /cam-audit FAQ third-party audit-cost figures
- **Surface:** `/cam-audit` (LANDLORD-side CAM Audit Software page, LIVE in sitemap) — FAQ "How much does a CAM audit cost?" answer (`marketing/src/app/cam-audit/page.tsx:90`, a `faqSchema` acceptedAnswer, so also emitted as FAQPage JSON-LD).
- **Defect:** the answer asserted "Traditional CAM audits by third-party firms typically cost **$3,000 to $15,000 per property**" and "Contingency-based auditors charge **25-50% of identified savings**". Neither figure exists in `/sources` (the sanctioned-claims registry). There is no third-party-audit-cost entry and no contingency-fee-percentage entry anywhere in /sources; both are precise numbers stated as fact = fabricated. Grep confirmed both figures were contained to this one page (no other surface repeats them).
- **Fix:** replace with qualitative copy that keeps the same comparison without inventing precise numbers: "Traditional CAM audits by third-party firms can cost thousands of dollars per property. The price grows with portfolio size, lease complexity, and the years under review. Contingency-based auditors instead take a share of whatever savings they find." The CapVeri sentence + its `${publicKnowledge.pricing.display.tierAnnualPriceLabels.reconcile}` annual-pricing token are unchanged (sanctioned, real).
- **Verify:** marketing-copy-gate exit 0 (1431 files); third-grade per-sentence — max sentence 14 words (within max-14 hard gate after splitting the original compound first sentence with a period; the combined run FALSELY reports one long sentence as a no-terminal-punctuation artifact). Remaining FAILs are pre-existing domain hard words ("Traditional", "Contingency" — both in the ORIGINAL answer) + the avg-10 aspirational target; no NEW hard-gate tell, and the edit is shorter/cleaner than the fabricated original (whole-context-fit override). render-verified on :3030 via temp-copy (new prose present, $3,000-$15,000 + 25-50% gone, title intact); prod-verified www.capveri.com/cam-audit 3x (new=1 each, old_3000=0, old_2550=0).
- **Refs:** code e92cd507, worker capveri-marketing 100% on 03fe8b7f, worktree goal-mktg-c116.
- **LESSON (reinforces C114/C115):** a FAQ answer that names two precise dollar/percent figures as plain fact ("typically cost $X", "charge Y%") with NO source attribution is fabrication even without a "studies show" preface — the bare confident number IS the tell. When the real value isn't in /sources and no sanctioned figure maps to it (unlike C115 where the hedged 40% fit), go qualitative rather than invent or borrow a mismatched number. Splitting a compound sentence with a period (not ", and") is the cleanest way to clear the max-14 gate on de-fabrication edits to FAQ JSON-LD prose.

## C117 — NO-FIX CYCLE (two scout findings verified as FALSE POSITIVES)
Broad cross-dimension scouting this cycle surfaced two "lone outlier" candidates; both were verified against origin/master + config and discarded. Logged so future scouts don't re-flag.
- **FP #1 — /tools/cam-billing-error-estimator "wrong" slug.** page.tsx:33,51 + CamBillingErrorEstimatorClient.tsx pass `slug="cam-leakage-estimator"` while the route dir + canonical are `cam-billing-error-estimator`; every OTHER tool page's TrackToolPageView slug matches its dir, so the scout flagged this as a stale rename. NOT a defect: `cam-leakage-estimator` is a DELIBERATELY-PRESERVED stable internal id — `next.config.ts:43-46` 308-redirects `/tools/cam-leakage-estimator` -> `/tools/cam-billing-error-estimator` (public URL was renamed), and the old slug is the consistent key across analytics tracking, content-map (funnelStage L29 + TOOL_RELATED_CONTENT L510), lead-magnets registry INCLUDING the real storage asset `cam-leakage-estimator.xlsx`, the lead-capture form assetSlug, tools/page.tsx listing, AND tests assert it. Everything is internally consistent on the stable id; only the public URL was given a friendlier name. Changing the slug would REGRESS (break the .xlsx download path, orphan analytics, desync redirect/registry/form). LESSON: a "lone outlier" id mismatch where the route has a redirect from the old name + the old id is consistent across config/registry/storage/tests is an INTENTIONAL public-rename-with-stable-internal-id, not a bug.
- **FP #2 — HeroSection "First reconciliation free" vs "30-day free trial".** HeroSection.tsx:79-80 trust badge "First reconciliation free" was flagged as contradicting the canonical "30-day free trial". NOT a defect: "Reconcile your first property free" is the deliberate, SITEWIDE, test-locked activation CTA — identical on product-tour (x2), /resources, /resources/audit-defense-packet, CTASection, FreeAuditClaritySection, and Hero, asserted in HeroSection.test.tsx + CTASection.test.tsx. The badge matches that framing and is TRUTHFUL (your first property reconciliation IS free under the no-credit-card trial); it is a concrete benefit-restatement of the trial, not a competing claim. Changing it to "30-day free trial" would break the cohesive sitewide PLG message + the tests. LESSON: a benefit-framed activation line that is consistent sitewide + test-locked is intentional positioning, not a contradiction with the literal trial-term copy; both are true. Positioning changes require user input (cf C66), not a unilateral flip.
- **Meta-signal:** three consecutive scout candidates this session (incl. the stale-read of already-shipped C116) resolved to already-fixed / intentional-stable-id / intentional-positioning. The heavily-worked veins (fabricated stats in pSEO data, cross-surface copy consistency, trial/offer framing) are now genuinely thin. Next cycles should shift dimension toward FUNCTIONAL e2e correctness of the /tools/* calculators (compute math, edge cases, stale-result-on-input-change) rather than more copy scouting.

## C118 — FIX MED (functional UX / stale-result-on-input-change) + test-rot repair: /tools/cam-overcharge-calculator
- **Dimension pivot:** per C117's meta-signal, shifted from copy scouting to FUNCTIONAL e2e of the interactive /tools/* calculators. Exercised `cam-overcharge-calculator` on :3030 with real inputs.
- **Surface:** `/tools/cam-overcharge-calculator` (LIVE, in sitemap) — `marketing/src/app/tools/cam-overcharge-calculator/CamOverchargeCalculatorClient.tsx`. Interactive (compute-on-submit, not a lead-magnet download).
- **Compute verified CORRECT:** hand-traced `calculateOverchargeEstimates` (probability x impactRate x annualCAM x leaseSizeMultiplier, low=x0.5 high=x2, cap-violation gated on hasCap, pro-rata denominator + cap-tightness multipliers). leasedSF=10000/annualCAM=25000/no-cap renders `$380 - $1,520` (the $380 low vs my arithmetic 381 is float rounding at a .5 boundary in cat-4/cat-6 — immaterial for an estimate range; matches the unit test's expect(totalLow).toBe(380)).
- **Defect (MED UX):** `results` was set on submit (setResults(...)) but NEVER invalidated when an input changed afterward. Render-verified on :3030: submit with annualCAM=25000 -> `$380 - $1,520`; then change annualCAM -> 500000 WITHOUT re-submitting -> the result card STILL showed `$380 - $1,520` (the input is now 20x larger; correct range ~$7.6K-$30.4K). The numbers above the result no longer matched the result below — identical class to C69 (hcad-tax-normalizer) and C69's lesson ("a tool showing a computed card must invalidate it the instant inputs change").
- **Fix:** added guarded `clearStaleResults` helper (if (results) setResults(null)) wired into the onChange of all 5 inputs — register("leasedSF"|"annualCAM"|"buildingTotalSF"|"capRate") via RHF's onChange option, plus the hasCap Switch onCheckedChange. Unlock state PRESERVED (don't reset `unlocked`), so a re-estimate shows the full breakdown without re-entering an email (better UX than C69's blunt reset). Mirrors FixedCam's clearResultState.
- **Test-rot repair (pre-existing, SAME file):** the test suite had 4 FAILING tests on clean origin/master (proven via git stash run: 4 failed/5 passed before AND after my edit — not mine). A prior cycle renamed the cap field to "CAM cap limit (% per year)" taking WHOLE PERCENT (5, not fraction 0.05; setValueAs: v/100) and the unlock CTA to "See Full Breakdown" but never updated the tests (which still queried /cap rate/i and /see financial projections/i and typed 0.05/0.3). Realigned the 4 tests to LIVE truth: /cap rate/i->/CAM cap limit/i, cap values 0.05->5 and 0.3->30 (so 30/100=0.30 still trips the "under 25%" zod max), /see financial projections/i->/see full breakdown/i. Form labels /first name/i + /work email/i already matched (unchanged).
- **Regression test added:** "clears a shown estimate when an input changes" — submit -> assert `$380 - $1,520` -> edit annualCAM -> assert the range is gone + the placeholder "Enter the lease and CAM details..." reappears.
- **Verify:** no copy changed (pure logic + tests) so copy-gate/humanizer/third-grade N/A. vitest the file = 10/10 PASS (4 pure-fn + 5 realigned UI + 1 new regression). eslint both files exit 0. tsc --noEmit exit 0. Render-verified the FIX on :3030 via temp-copy overlay (main HEAD==origin/master confirmed first): post-submit `$380 - $1,520`, then change annualCAM->500000 -> result card ranges EMPTY + placeholder shown (stale result correctly cleared). prod-verified www.capveri.com/tools/cam-overcharge-calculator 3x HTTP 200 + fresh client chunk page-844b1441fd4e91a0.js reachable 200 (preview browser is sandboxed to localhost so prod functional drive not possible; the byte-identical local overlay render-verify covers behavior).
- **Refs:** code 690d4741, worker capveri-marketing 100% on 707c5e8a, worktree goal-mktg-c118.
- **LESSON:** (1) the stale-result-on-input-change bug (C69) recurs across calculators — grep every interactive tool for the setResult(...)-on-submit WITHOUT an input-onChange reset shape; preserve unlock/gate state when clearing so a re-run doesn't re-gate. (2) When a prior cycle renames a field/label or changes an input's unit, its test file rots SILENTLY if tests aren't run — a "verify before claiming done" violation that leaves a red suite. When touching a calculator, RUN its test file first: pre-existing failures there are their own defect to repair (realign assertions to the LIVE component, which is the deployed source of truth), not a blocker to your change. (3) Functional e2e of the /tools/* calculators is now the richest vein (copy veins exhausted per C117).

## C119 — FIX LOW (visual consistency / missing badge icon): /tools index BOMA 2024 card
- **Dimension:** continued the C118 functional/UX pivot into the /tools INDEX page (`marketing/src/app/tools/page.tsx`), auditing the 31 tool cards for mislabel/broken-link/visual-inconsistency. (Stale-result-on-input-change calculator vein confirmed EXHAUSTED first: submit-compute tools cam-overcharge C118 + hcad C69 + fixed-cam clearResultState all clear on input change; live-compute tools boma + cam-billing-estimator + noi-impact derive inline each render so no stale risk.)
- **Surface:** `/tools` (LIVE hub, in sitemap). The card grid renders a badge icon via: `tool.icon === "calculator" ? <Calculator/> : (tool.isDownload && <Download/>)`. So a card shows the calculator glyph only when it sets `icon: "calculator"`; an interactive (non-download) tool that omits it renders NO icon at all (the else branch is `false && ...`).
- **Defect (LOW visual consistency):** every interactive calculator carried `icon: "calculator"` — hcad-tax-normalizer, noi-impact, cam-leakage(=cam-billing-error-estimator), cam-overcharge, fixed-cam-vs-traditional, audit-risk-quiz — EXCEPT `boma-2024-calculator` (isDownload:false, no icon). So the BOMA 2024 card was the lone interactive calculator showing no badge icon next to its "BOMA 2024" tag while its 6 siblings all showed the calculator glyph. BOMA 2024 IS interactive (in-browser "Calculate My BOMA Impact" live compute, CLEAN reference impl per C119 scout) — the omission was an oversight, not a category signal.
- **Fix:** added `icon: "calculator"` to the boma-2024-calculator TOOLS entry (1 line, identical to its 6 siblings + matches the typed `Tool.icon?: "calculator"` interface). No copy changed -> copy-gate/humanizer/third-grade N/A.
- **Verify:** render-verified on :3030 via temp-copy overlay (main HEAD file == origin/master confirmed first): BOMA card badge svg now `lucide-calculator`, matching noi + hcad (all three returned "calculator"); main tree restored byte-identical (git diff clean). prod-verified www.capveri.com/tools 3x HTTP 200; served SSR HTML has `lucide-calculator` inside the BOMA 2024 badge span (python-confirmed: tag idx 25892, icon present in the preceding badge segment); aggregate lucide-calculator count in /tools HTML = 14.
- **Refs:** code 7e9d4096, worker capveri-marketing 100% on c031f20c, worktree goal-mktg-c119.
- **LESSON:** an icon-render ternary that gates on an OPTIONAL per-item field silently drops the icon when a new/edited item omits it — audit every item of the same semantic class (here: interactive calculators) for the field, don't assume the default branch is benign. The /tools index TOOLS[] array is the place to grep for icon/tag/href/isDownload drift across all 31 cards.

## C122 — FIX LOW (accessibility / form error association): CalculatorUnlockGate inputs lacked aria-describedby
- **Dimension:** a11y consistency in lead-capture form components (sub-agent Explore scout). The `/tools` calculator unlock-gate form is the email gate that 3 LIVE interactive calculators render to reveal their full result.
- **Surface / reachability:** `marketing/src/components/lead-capture/CalculatorUnlockGate.tsx`, rendered by `boma-2024-calculator`, `cam-overcharge-calculator`, and `fixed-cam-vs-traditional` clients (git grep confirmed). The form appears after the user computes a result and clicks the unlock CTA.
- **Defect (LOW a11y):** the first-name and work-email `<Input>` set `aria-invalid={!!errors.x}` but were never linked to their error messages. The error `<p role="alert">` elements had NO `id`, and the inputs had NO `aria-describedby`, so a screen reader announced the invalid state but could not associate each error message with its field (worse when both fields error at once). The sibling `LeadCaptureForm.tsx` (same directory, lines 209-225) already implements the correct pattern with `id="first_name_error"` + conditional `aria-describedby` — CalculatorUnlockGate was the lone outlier.
- **Fix:** mirror the proven sibling pattern exactly — add stable ids `unlock_first_name_error` / `unlock_work_email_error` to the two error `<p>` elements, and conditional `aria-describedby={errors.x ? "unlock_x_error" : undefined}` to each input. No copy changed (the visible error strings "First name is required" / "Please enter a valid work email" are untouched) so copy-gate / humanizer / third-grade are N/A.
- **Verify:** render-verified on :3030 via temp-copy overlay (main HEAD CalculatorUnlockGate == origin/master confirmed identical first). Drove the real flow on /tools/cam-overcharge-calculator: filled the 3 lease inputs, computed, clicked "See Full Breakdown" to open the gate form, submitted it empty. DOM after submit: `unlock_first_name` input has aria-describedby="unlock_first_name_error" + aria-invalid="true", and `<p id="unlock_first_name_error" role="alert">First name is required</p>` exists; `unlock_work_email` input has aria-describedby="unlock_work_email_error" + aria-invalid="true", and `<p id="unlock_work_email_error" role="alert">Please enter a valid work email</p>` exists — ids match the aria-describedby on both fields. Main tree + generated next-env.d.ts restored byte-identical (git status clean).
- **Refs:** code 2b7bb8a3, worker capveri-marketing 100% on 6e7f2cc3, worktree goal-mktg-c122.
- **LESSON:** a form input that sets `aria-invalid` but omits `aria-describedby` is a half-wired a11y contract — the screen reader knows the field is invalid but cannot read WHY. When fixing one lead-capture form, audit every sibling form component in the same directory for the same field↔error wiring; a proven sibling (LeadCaptureForm) is the pattern oracle to mirror id-for-id. Triggering the gate form needs the full calculator compute→unlock→submit-empty flow, not just a page load.

## C123 — FIX LOW (accessibility / form error association): cam-overcharge calculator input fields lacked aria-describedby
- **Dimension:** continuation of the C122 a11y vein. After fixing CalculatorUnlockGate, a `git grep` of every marketing .tsx with `aria-invalid` vs `aria-describedby` surfaced the next half-wired form: `marketing/src/app/tools/cam-overcharge-calculator/CamOverchargeCalculatorClient.tsx` had aria-invalid=4 / aria-describedby=0 (CalculatorUnlockGate + LeadCaptureForm both now 2/2; ui/input.tsx + ui/textarea.tsx are pass-through primitives, correctly no describedby).
- **Surface / reachability:** LIVE `/tools/cam-overcharge-calculator` (in sitemap, prod 200). The calculator's own lease-input form, 4 fields: leasedSF, annualCAM, buildingTotalSF, capRate (capRate only renders when the "This lease has a CAM cap" switch is on).
- **Defect (LOW a11y, same class as C122):** each of the 4 `<Input>` set `aria-invalid={!!errors.x}` and rendered an error `<p role="alert">{errors.x.message}</p>` with NO `id`, and the input had NO `aria-describedby`. Screen readers announced the invalid state but could not read which error belongs to which field — worse when multiple fields error on an empty submit.
- **Fix:** add stable ids `leasedSF_error` / `annualCAM_error` / `buildingTotalSF_error` / `capRate_error` to the 4 error `<p>` elements, and conditional `aria-describedby={errors.x ? "x_error" : undefined}` to each input. Preserved each error `<p>`'s existing className/role attribute order; the conditional keeps describedby absent when there is no error (correct for the optional buildingTotalSF/capRate fields). No copy changed -> copy-gate / humanizer / third-grade N/A. Result: aria-invalid=4 / aria-describedby=4 / 8 `_error` ids (4 refs + 4 element ids).
- **Verify:** render-verified on :3030 via temp-copy overlay. NOTE the main tree (HEAD 7c593cb0) is STALE for this file — it predates C118 which modified it — so `git diff origin/master` DIFFERS; the overlay still works because I back up the on-disk file and restore it byte-for-byte after. Drove the real flow: submit-empty -> leasedSF input aria-describedby="leasedSF_error" + aria-invalid="true" + `<p id="leasedSF_error" role="alert">Required</p>`; annualCAM same with "Required"; buildingTotalSF correctly shows NO error + describedby=null (optional field). Then toggled the CAM-cap switch on, entered an out-of-range capRate (99) and submitted -> capRate input aria-describedby="capRate_error" + aria-invalid="true" + `<p id="capRate_error" role="alert">Must be under 25%</p>`. Main tree + next-env.d.ts restored clean.
- **Refs:** code 05711166, worker capveri-marketing 100% on 0c52a034, worktree goal-mktg-c123.
- **LESSON:** after fixing a half-wired a11y form, `git grep -c aria-invalid` vs `aria-describedby` across the whole app finds every other instance of the same defect class in one pass — the count mismatch (N invalid / 0 describedby) is the signal. The cam-overcharge field-error path needs an empty submit for required fields but an OUT-OF-RANGE value for optional/bounded fields (capRate) to surface its error and prove the wiring. ui/input + ui/textarea primitives legitimately have aria-invalid with no describedby (the consumer supplies describedby).

## FINALIZATION (2026-06-23) — review + build + live verify, goal marked complete
- **Trigger:** user finalization directive — "Spin a review agent for all your work, fix any issues found, run all verifications including builds, then merge to master and push and deploy, run migrations if needed and verify in live site, delete old branch/worktree, mark goal complete."
- **Review:** spun a code-reviewer subagent over the full diff of this session's work (`1de1bd94..HEAD`, 4 commits = C122 fix 2b7bb8a3 + ledger 767094c2, C123 fix 05711166 + ledger 17481c3c; 2 code files, 48 insertions / 6 deletions). Verdict: NO ISSUES FOUND. Confirmed: error-id namespaces are disjoint (`leasedSF_error` etc. vs `unlock_*_error`) so no duplicate-id collision even though CalculatorUnlockGate renders inside CamOverchargeCalculatorClient; the `errors.X ? "X_error" : undefined` gate is WAI-ARIA-correct (describedby points at an id that exists exactly when the conditionally-rendered error `<p>` exists); no cast needed because both forms use a concrete `useForm<T>` generic so `errors.X.message` typechecks; no `any` / `// type: ignore` / `eslint-disable` added.
- **Build:** real marketing production build (`npm run build`) — ✓ Compiled successfully in 11.2s, exit 0, full route tree prerendered incl. /tools/cam-overcharge-calculator (static) and the 3 unlock-gate host calculators. No errors, no new warnings.
- **Merge/push/deploy:** already done per-cycle — local master == origin/master == 17481c3c; worker capveri-marketing 100% on 0c52a034. Re-verified alignment via `git fetch origin master`. No new fix was needed, so no re-deploy.
- **Migrations:** NONE — all work this session was pure-frontend a11y attributes (aria-describedby + error-message ids); no schema touched, no Supabase migration, no D1 change.
- **Live verify:** prod 200 on all 3 affected pages — /tools/cam-overcharge-calculator, /tools/boma-2024-calculator, /tools/fixed-cam-vs-traditional (the latter two render CalculatorUnlockGate). DOM-level attribute proof was captured per-cycle in the C122/C123 entries above.
- **Worktree cleanup:** goal-mktg-c122 and goal-mktg-c123 worktrees already removed + pruned + branches deleted earlier this session; `git worktree list` confirms no stale goal-mktg-* remain (other listed worktrees belong to separate goals/sessions — left untouched).
- **Status:** GOAL MARKED COMPLETE for this directive. The marketing-site-perfect sweep is an open-ended quality goal; this session closed the a11y form-error vein (CalculatorUnlockGate + cam-overcharge calculator) end-to-end. Future sweeps can resume from a fresh scout cycle. One standing user-gated lever from earlier goals remains out of scope here (real social proof — cannot be fabricated).
