# Goal: CRO on Top 10 Most-Visited Public Pages (incl. sign-up)

Started 2026-06-22. Sub-agent driven. Data from PostHog (project REDACTED_PH_PROJECT) / Cloudflare.
Every reader-visible copy change must pass: humanizer -> third-grade-copy -> honesty check
-> `node scripts/marketing-copy-gate.mjs` (exit 0). Multiple review/fix cycles until clean.

## Honesty guardrail (CRITICAL for this goal)
CapVeri is early-stage. CRO here MUST be honesty-safe. Do NOT fabricate:
testimonials, customer counts ("Trusted by 500+"), NPS, SOC2/security certs, ratings,
or any number not backed by the product source of truth. CRO wins must come from:
value-prop clarity, message-match, CTA copy/hierarchy, friction reduction, objection
handling, scannability, trust signals that are TRUE (deterministic math, no integration,
free first audit, BOMA 2024, real ROI model ranges already on ROI page).

## Data source status
- Cloudflare GraphQL analytics: BLOCKED (wrangler OAuth token lacks analytics:read).
- PostHog MCP: OAuth in progress (user authorizing). Insight iBTDr03r = "01.01 Pageview
  traffic by available URL fields - 180d" is the ranking source. Events sparse (pageviews
  + autocapture only in last 180d; none in 30d per dashboards doc).

## Funnel map
- Marketing = Next.js (marketing/src/app/*). Signup = frontend React app
  frontend/src/pages/auth/RegisterPage.tsx -> app.capveri.com/auth/register.
- Marketing primary CTA everywhere: "Start free trial" / "Reconcile your first property
  free" -> buildTrialLink/buildAuditLink -> /auth/register?...&offer=80OFF.
- Nav: "Start free trial" + "Sign in". Footer: no primary CTA button (informational).

## Page inventory (current state) — captured C0
- / homepage: H="Bill CAM correctly before statements go to tenants." Sub reads GL/rent
  roll/billed/lease, flags over+under bill. CTA "Reconcile your first property free" +
  "See the workflow". Badges: First audit free / No credit card / No integration needed.
  SocialProofStrip = 4 FEATURE cards (not social proof). No customer logos/testimonials.
- /pricing: H="Priced for the cost of one CAM error". Unit calculator (slider+input).
  "What happens during the free trial" reassurance. CTA "Start free trial".
- /product-tour: H="From ERP export to tenant-ready CAM packet". CTA "Reconcile your first
  property free" + "View sample packet".
- /cam-reconciliation-software: H="CAM Reconciliation Software for Pre-Statement
  Verification". ROI callout $5.9K-$35.3K/building. Comparison table. CTA "Start free trial".
- /cam-audit-software: H="CAM Audit Software for Commercial Landlords" (SEO message-match
  for "cam audit software" -> reframes to reconciliation). CTA "Start free trial".
- /sample-report: H="Sample CAM Audit Packet". 6 demo buildings w/ $ findings. CTA trial.
- /roi: H="What CAM Reconciliation Software Saves You". 3 ROI scenarios, time tables.
- /tools + tools/* family: interactive calculators (lead-intent surfaces).
- Signup (RegisterPage.tsx): "Create your account" / "Just an email and a password to get
  started." Fields: Work Email, Password (8+/upper/lower/number, strength meter), Terms
  checkbox. CTA "Create account". Reassurance "Start your free trial. No credit card. Full
  access... Pick a plan from billing settings when you're ready." Social login + exit-intent.

## Real data — GSC (capveri.com, organic search, 2026-03-24..06-22)
GSC = organic ONLY (under-counts direct/paid/email pages like pricing/product/signup).
Top by clicks/impressions:
1. /resources/software/yardi-voyager/cam-setup  14 clk / 870 imp
2. / (homepage)                                 12 clk / 348 imp
3. /blog/yardi-cam-recovery-pool-setup          12 clk / 404 imp
4. /blog/boma-2024-changes                      10 clk / 632 imp
5. /blog/irem-operating-expense-benchmarks       5 clk / 508 imp
6. /blog/yardi-charge-code-vs-recovery-code      5 clk / 663 imp
7. /resources/cam-cap-types                      5 clk / 794 imp
8. /resources/software/mri-software/cam-setup    5 clk / 185 imp
9. /resources/export-guide                       4 / 1002 imp (highest imp, low CTR)
10. /cam-charges                                 3 / 636 (pos 25.7 — ranking weak)
   also: /tools/cam-gross-up-calculator, /cam-reconciliation-guide.

## PROVISIONAL working top-10 (GSC + funnel-critical; refine w/ PostHog)
CERTAIN (any definition): 1) / homepage  2) /pricing  3) /auth/register (signup, required).
GSC-confirmed organic leaders: 4) /resources/software/yardi-voyager/cam-setup
5) /blog/yardi-cam-recovery-pool-setup  6) /blog/boma-2024-changes  7) /cam-charges
8) /tools/cam-gross-up-calculator  9) /cam-reconciliation-guide  10) /product (nav-critical).

## Cycle log
- C0 (2026-06-22): CRO framework loaded, funnel mapped, inventory captured, ledger created.
  GSC real organic data pulled. PostHog OAuth pending (user). Starting CRO on the 3 CERTAIN
  pages (home/pricing/signup) without waiting; PostHog will refine remaining slots.
- C1 (2026-06-22): HOMEPAGE. HeroSection.tsx: fixed secondary-CTA tracking mismatch
  ("See how it works" -> "See the workflow"); badge "First audit free" -> "First reconciliation
  free" (purges stray "audit" framing on hero, matches primary CTA + landlord-side canon).
  SocialProofStrip.tsx: replaced 4 wordy feature cards w/ 4 true scannable credibility chips
  (Catches errors both ways / Math you can trace, fixed rules not AI / Built on BOMA 2024 /
  No new system needed - keep Yardi or MRI). All claims verified vs product truth. Copy passes:
  humanizer + third-grade (eval grade 2.7, max 11 words) + gate 0. Verified live :3030.
- C2 (2026-06-22): PRICING. PricingContent.tsx: H1 "Priced for the cost of one CAM error"
  -> "Start free. Pay only when you keep it." (8 words, risk-reversal, the page goal is trial
  starts). Tightened repetitive 5-sentence subhead. Review flagged lost WTP anchor (SHOULD-FIX);
  product SOT (public-knowledge 1641) explicitly REFUSES a set $ promise + says "model your own
  building" -> so restored anchor as muted /roi link "See what CapVeri could find for your
  building." (honest, hedged, no fabricated number). Copy passes humanizer+third-grade+gate 0.
  Verified live :3030 (H1, subhead, roi link).
- C3 (2026-06-22): SIGNUP (frontend RegisterPage.tsx, capveri-app target). Title "Create your
  account" -> "Create your free account" (message-match w/ marketing "free" CTAs; honest, no
  offer banner since startDefaultTrial carries no plan/offer). Replaced empty-only static
  password rule list w/ LIVE ticking checklist (Check/Circle, shows while focused OR typing,
  ticks each rule as met). Zod regexes UNTOUCHED (security boundary intact) - list is display
  only. Review SHOULD-FIX: added role=status aria-live=polite sr-only summary ("Password meets
  N of 4 requirements.") for calm SR announcement (one summary, not 4 chatty rows). Verified:
  tsc 0, eslint 0, prettier, vitest 21/21 (incl. existing "shows requirements on focus").
- C4 (2026-06-22): PRODUCT-TOUR (nav-critical). product-tour/page.tsx: "Sample Report CTA"
  section reworded for buyer clarity. H2 "See a synthetic audit packet" -> "See a sample
  audit packet" ("synthetic" is a hard word + sounds fake; "sample" is the honest, plain
  term and matches the existing "View sample packet" button). Body dropped dev jargon
  ("generated", "calculation context", "GL-to-lease traceability") for plain language while
  KEEPING the traceability proof: "See a sample CapVeri packet. It shows flagged issues and
  the math behind each one. Every number ties back to the lease. No signup needed." Copy
  passes third-grade (4 sentences, avg 7.5 words, max 10, FK 4.2 warn from product term
  "packet") + gate 0. Verified live :3030 (prod HTML contains new block).
- C5 (2026-06-22): CAM-RECONCILIATION-GUIDE hero CTA. "Free Reconciliation Review" (-> /pricing)
  was a MISLABEL: "Review" implies a done-for-you service, but CapVeri is self-serve and the
  button just lands on /pricing. The page's OWN bottom CTA already says "Start free trial" ->
  /pricing. Changed hero CTA to "Start free trial" for honesty + intra-page consistency (same
  destination, no service implication). CTA third-grade PASS. Verified live :3030.
- C6 (2026-06-22): TOOLS/CAM-GROSS-UP-CALCULATOR hero subhead. "Model gross-up expenses across
  occupancy thresholds." (mechanism-focused) -> "See how gross-up changes your CAM at any
  occupancy." (outcome-first, "See"-led). Kept "Download free." H1 unchanged (keyword-rich SEO
  title "Free CAM Gross-Up Scenario Calculator"). No numbers added. third-grade PASS (occupancy
  + gross-up allowed as necessary domain terms, explained in page context box) + gate 0.
  Verified live :3030.
- AUDIT (2026-06-22): Explore agent swept 6 high-intent pages (cam-reconciliation-software,
  cam-audit-software, cam-charges, cam-reconciliation-guide, gross-up-calc, yardi-cam-recon).
  Took only the honesty-safe, third-grade-clean wins (C5/C6). REJECTED agent suggestions that
  ADD precise stats ($14k, 1,200+ downloads, "1 in 3") = fabrication; agent's "lextract.io is a
  competitor leak" = WRONG (lextract is a sibling Ventora product, leave it); many proposed
  rewrites had semicolons/em-dashes/>14-word sentences = failed gates. Remaining flagged items
  for later cycles: cam-reconciliation-software H1 outcome-vs-keyword tradeoff (SEO-sensitive,
  hold), micro-CTAs after problem sections, $5.9K-$35.3K ROI range qualifier wording.
- C1-C3 REVIEW CYCLE (2026-06-22): general-purpose review agent on full diff -> 0 honesty
  violations, 0 gate violations (no dashes/semicolons/curly quotes), no offer banner at signup,
  Zod untouched. 2 SHOULD-FIX (pricing WTP anchor + signup a11y live region) both fixed above
  and re-verified. Diff snapshot at docs/goal-cro-top-pages/c1-c3-diff.patch.
- C7 (2026-06-22): CAM-CHARGES hero subhead (GSC top-10, organic, weak rank pos 25.7).
  Real defect: subhead's first 2 sentences DUPLICATED the Definition block directly below it
  ("operating expense recoveries that commercial landlords bill to tenants under NNN...
  reconciled annually"), wasting above-the-fold space and burying the value-prop sentence.
  Removed the duplication; new subhead leads with a plain one-line answer then surfaces what
  the guide gives: "CAM charges are what landlords bill tenants for shared building costs. This
  guide shows what's included. You will learn how to split costs by tenant. You will also see
  how to check for overbilling." Formal definition (NNN/modified-gross/annual reconciliation)
  PRESERVED intact in the Definition block, so no facts lost. No numbers touched (stats row
  untouched). third-grade PASS (avg 8.5, max 11, CAM + overbilling allowed as domain terms;
  FK 3.7 warn) + gate 0. Verified live :3030 (new subhead renders, definition box still the
  single source of the formal definition).
- C7 NOTE: GSC #1 organic page (/resources/software/yardi-voyager/cam-setup) reviewed but NOT
  edited -- it is a TEMPLATED dynamic route (renders for all software setup pages) and its
  hard-coded copy (H1/subhead/CTA "Start free trial"->/pricing) is already clean and
  consistent. Over-editing good copy is an anti-pattern; left as-is. Mid-page micro-CTA after
  "Common Mistakes" remains a held candidate (structural change across N pages).
- C8 (2026-06-22): BLOG CTA leak. Compared the two GSC top-10 blog posts:
  /blog/boma-2024-changes ALREADY has a well-placed <CTABox> ("See Where Your CAM Denominators
  Stand" / "Start your free trial") at the natural stopping point before Related Resources --
  left unchanged (already converts). /blog/yardi-cam-recovery-pool-setup (GSC #3, 12 clk) had
  NO CTA button at all -- only a soft text mention ("CapVeri automates this validation. Upload
  your Yardi export...") then straight to Related Resources/Sources. Real conversion leak: a
  high-intent reader who just read "6 fields cause 90% of errors" had nothing to click. Added a
  <CTABox> (registered MDX component) at the same natural stopping point, message-matched to the
  post: title "Check your Yardi CAM against every lease" / desc "Upload your Yardi export and
  lease terms. CapVeri checks your CAM math against every lease. It flags the errors before
  tenants see them." / buttonText "Start free trial" (site-dominant CTA) / utmContent
  yardi_recovery_pool_cta. Claims verified vs product canon (CapVeri checks every CAM calc vs
  every lease, flags before tenants see -- already stated in the post body). No numbers added.
  third-grade PASS (headline 7w; body avg 7.7/max 8, CAM/Yardi/CapVeri allowed as names;
  "calculation" hard word swapped to plain "CAM math"; CTA "Start free trial" PASS) + gate 0.
  Verified live :3030 (CTABox renders).
- C4-C8 REVIEW CYCLE (2026-06-22): general-purpose review agent on docs/goal-cro-top-pages/
  c4-c8-diff.patch (all 5 changes). Verdict: ALL 5 PASS, 0 MUST-FIX, 0 SHOULD-FIX. No honesty
  violations (no new fabricated numbers/proof), no gate failures (no dashes/semicolons/curly
  quotes, every sentence <=14w, CTA verbs Start/See whitelisted, headlines <=8w outcome-led),
  all product claims accurate + message-matched, the 2 CTA relabels improve message-match with
  their /pricing + trial destinations. Diff is safe to ship.
- C9 (2026-06-22): EXPORT-GUIDE CTABox message-mismatch (/resources/export-guide, GSC #9 by
  clicks but HIGHEST impressions 1002). The page's <CTABox> button said "Get the Export Steps"
  but the CTABox links via buildAuditLink (= buildTrialLink -> /auth/register trial signup), so
  the button promised a checklist and delivered a signup -- same class of bait/mismatch as C5,
  and circular (reader is already ON the export guide). Also the description's 2nd sentence ran
  ~22 words (fails third-grade 14-word max) with a rule-of-three "checks/maps/flags". Rewrote:
  title "Check your exports before you reconcile" (outcome-led, 6w); description "Upload your
  rent roll, GL, and billing files to CapVeri. CapVeri checks them for gaps. It flags where the
  reconciliation would fail before statements go out." (avg 8.7, max 11); buttonText
  "Start free trial" (matches the trial destination + site-dominant CTA); utmContent ->
  export_guide_cta. Claims verified vs product (export-completeness/gap check + flags failures
  before statements go out -- the page body already describes this). No numbers added. third-
  grade PASS (headline + body + CTA) + gate 0. Verified live :3030 (new title renders, "Get the
  Export Steps" count 0 on page).
- C10 (2026-06-22): CTABox href-IGNORED FUNCTIONAL BUG + cap-types description rewrite.
  ROOT CAUSE: marketing/src/components/mdx/CTABox.tsx had NO href prop -- it hardcoded
  href={buildAuditLink({content})} (= trial signup) for every usage. 3 MDX files passed
  href= expecting a custom destination and React SILENTLY DROPPED it: cam-cap-types.mdx +
  cam-reconciliation-cost.mdx ("See Pricing" href="/pricing") and base-year-expense-stop.mdx
  ("Try the Base Year Escalation Tool" href="/tools/base-year-escalation"). So every "See
  Pricing" button actually dumped readers on a signup wall -- a label-vs-destination LIE +
  conversion leak, worst on cam-cap-types (GSC #7 top-10). FIX: added optional href prop
  (linkHref = href ?? buildAuditLink(...)); backward-compatible -- the ~37 usages without href
  still go to trial signup; only the 3 href-passing files change. Verified all 3 routes exist
  (/pricing, /tools/base-year-escalation). tsc --noEmit clean. ALSO rewrote 2 jargon/rule-of-
  three CTABox descriptions that failed third-grade 14-word max: cam-cap-types "CapVeri checks
  both cap types for every lease. It splits controllable and uncontrollable costs. It flags
  overages before statements go out." (avg 7, max 8); cam-reconciliation-cost "CapVeri reads
  your Yardi or MRI files. It checks lease rules for every tenant. It builds reconciliation
  packages you can defend. It costs far less than a consultant." (avg 7, max 7). CTAs unchanged
  ("See" + "Try" already whitelisted verbs). No numbers added/changed. third-grade PASS both
  (FK warn only, domain terms) + gate 0. Verified live :3030: both pages 200, new descriptions
  render, "See Pricing" buttons now href="/pricing" (component fix proven end-to-end).
- C9+C10 DEPLOY + VERIFY (2026-06-22): fresh worktree off origin/master e144f30d, npm ci
  (1151 pkgs), npm run deploy:cf succeeded FIRST try (no d1 flake). capveri-marketing 100% on
  7d03e6fb-ec36-4306-a1dd-d1bdc5a71e57 (17:19, supersedes the C7/C8 a6904787 @ 17:06). Prod
  live-verified: /resources/export-guide shows "Check your exports before you reconcile" (C9);
  /resources/cam-cap-types shows "checks both cap types for every lease" AND its "See Pricing"
  anchor now href="/pricing" (C10 component fix proven in prod); /resources/cam-reconciliation-
  cost shows "reads your Yardi or MRI files" AND "See Pricing" -> href="/pricing". Worktree
  removed (git worktree remove --force, junction-safe); main tree intact (marketing+frontend
  node_modules OK). C9+C10 independent review: 0 MUST-FIX, 0 SHOULD-FIX.
- TOP-10 CRO STATUS: all 10 slots have a shipped+verified CRO pass (C1 home, C2 pricing, C3
  signup, C4 product-tour, C5 cam-reconciliation-guide, C6 gross-up calc, C7 cam-charges, C8
  yardi-recovery-pool + boma-2024, C9 export-guide, C10 cam-cap-types) + the systematic CTABox
  href-ignored functional bug fixed (helps every href-passing usage). GSC#1 yardi-voyager/cam-
  setup reviewed + left as-is (templated/clean, over-editing avoided). Remaining levers are
  user-gated: (a) PostHog OAuth to validate the definitive top-10 vs the GSC organic proxy;
  (b) REAL social proof (customer logos/counts/testimonials) which cannot be fabricated per the
  honesty constraint and needs real customer data from the user.
- GOAL CLOSED (2026-06-22, by Angel): both user-gated levers resolved by user choice.
  (1) Ranking: ACCEPT GSC-organic proxy as the definitive top-10 — no PostHog/Cloudflare
  re-pull, no re-ranking. (2) Social proof: SHIP WITHOUT IT for now (no fabricated trust
  signals per honesty constraint; revisit when real customer evidence exists). All 10 top-page
  CRO cycles + the CTABox href bug are shipped & prod-verified. Nothing left to fix that does
  not require user-provided data. GOAL COMPLETE.

- GOAL REOPENED (2026-06-22, by Angel): Angel supplied a PostHog PERSONAL API key
  (phx_ prefix, read scopes) which unblocked lever (a). Ran HogQL pageview queries against
  project REDACTED_PH_PROJECT (90-day window): the GSC organic proxy MIS-RANKED content pages. The real
  most-visited content page is the IREM operating-expense-benchmarks blog (93 views, ABOVE
  /pricing) and it had NO conversion CTA. Several pages CRO'd in C5-C10 rank low; the genuine
  top content pages were never CRO'd. Home/pricing/signup (C1-C3) confirmed as the true top 3.
  Angel chose "Reopen + CRO all 6": CRO the 6 genuinely top-traffic public pages the proxy
  missed, full copy gates + deploy + prod-verify. (Key lives in Angel's chat only; NOT persisted.)
- C11 CRO 6 REAL TOP PAGES (2026-06-22): added/improved a conversion CTA on the 6 highest-
  traffic content pages that lacked one (or had a weak/off-voice one), all honesty-safe and
  third-grade-clean:
  1. blog/irem-operating-expense-benchmarks.mdx (#2 page, no prior CTA) -> CTABox
     "Find CAM charges that look wrong" (utm irem_benchmarks_cta).
  2. resources/benchmarking-operating-expenses.mdx -> CTABox "See how your buildings compare"
     (utm benchmarking_opex_cta).
  3. resources/operating-lease-accounting-entries.mdx (ASC 842) -> CTABox "Get the CAM true-up
     right" (utm operating_lease_entries_cta). HONEST: claims only that CapVeri makes the CAM
     true-up NUMBER correct, NOT that it books journal entries.
  4. resources/asc-842-lease-accounting-example.mdx (ASC 842) -> CTABox "Trust the CAM numbers
     you book" (utm asc842_example_cta). Same honesty guard: validates the CAM number, not entries.
  5. resources/what-is-included-in-cam-expenses.mdx -> improved existing CTABox to "Check every
     line in your CAM pool" (utm u_cta); dropped non-whitelisted CTA verb "Verify".
  6. src/app/resources/boma/page.tsx (React hub) -> bottom CTA reworked to "Catch billing errors
     before tenants do" + plain 3-sentence body + "See plans" button (was a dense 3-clause block).
  QUALITY: marketing-copy-gate exit 0; third-grade hard gates pass on all 6 CTA blocks (hard-word
  rewrites for "overcharges/undercharges" -> "too high or too low" and "recoverable" -> "costs you
  should have billed back"); eslint clean; MDX tags balanced; render-verified on :3030 (all 6 = 200
  with new CTA text). Independent review sub-agent: 0 MUST-FIX / 0 SHOULD-FIX, ASC 842 honesty
  explicitly confirmed. No auto-CTA is injected by MDXRemote/ContentPageLayout, so inline CTABoxes
  add no duplicates.
