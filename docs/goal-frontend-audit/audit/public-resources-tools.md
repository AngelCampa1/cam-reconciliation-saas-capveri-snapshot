# Frontend Audit: Public Pages — Resources, Tools, VS, Company, Legal, Landing, SampleReport

**Auditor scope:** `frontend/src/pages/resources/*`, `frontend/src/pages/tools/*`, `frontend/src/pages/vs/*`, `frontend/src/pages/company/*`, `frontend/src/pages/legal/*`, `frontend/src/pages/LandingPage.tsx`, `frontend/src/pages/SampleReport.tsx`

**Date:** 2026-05-28

---

## Finding 1 — LandingPage component is completely unrouted (P0)

**File:** `frontend/src/pages/LandingPage.tsx:57` / `frontend/src/App.tsx:222–225`

**What's wrong:** `LandingPage` is exported and fully implemented but is **never imported or registered** in `App.tsx`. The root route `/` is `<Navigate to="/dashboard" replace />` (App.tsx line 224). Unauthenticated visitors who hit `/` are redirected to `/dashboard`, which falls into the `ProtectedRoute` and then redirects them to `/auth/login`. There is no public landing page at all. The `LandingPage` component (with hero, features, pricing teaser, free-tools callout, structured data, etc.) is dead code.

**Expected behavior:** `/` should render `LandingPage` for unauthenticated users, or at minimum not silently redirect to a protected route.

**Severity:** P0 — The entire public marketing funnel is broken. Visitors cannot reach the landing page.

**Fix:** Import `LandingPage` in `App.tsx` and replace (or supplement) the root redirect with a route that shows it to unauthenticated users. A common pattern is a guard component: if `user` is authenticated redirect to `/dashboard`, otherwise render `LandingPage`.

---

## Finding 2 — `/about` route is missing; Footer and About page link to it (P1)

**File:** `frontend/src/components/layout/Footer.tsx:41` / `frontend/src/App.tsx` (no route registered)

**What's wrong:** `Footer.tsx` includes a "Company → About" link with `href: '/about'` (line 41). `About.tsx` exists at `frontend/src/pages/company/About.tsx` and exports `AboutPage`. However, `App.tsx` never imports `AboutPage` and there is no `<Route path="/about" ... />`. Clicking the About link in the footer renders the 404 catch-all page.

The About page itself also links to `/compliance/security-overview` (About.tsx line 217), which is another unregistered route (see Finding 4).

**Severity:** P1 — Feature entirely non-functional. A public marketing page is linked from the footer but unreachable.

**Fix:** Add `import { AboutPage } from '@/pages/company/About'` and `<Route path="/about" element={<AboutPage />} />` in `App.tsx`.

---

## Finding 3 — SB 1103 slug mismatch: ResourcesHub links `/resources/sb-1103-compliance` but route is registered as `/resources/sb1103-compliance` (P1)

**File:** `frontend/src/pages/resources/ResourcesHub.tsx:83` / `frontend/src/App.tsx:700`

**What's wrong:** The ResourcesHub `RESOURCES` array (line 83) sets `href: '/resources/sb-1103-compliance'` (with a hyphen: `sb-1103`). The `Sb1103Compliance.tsx` component itself also uses canonical `/resources/sb-1103-compliance` (Sb1103Compliance.tsx line 121). However, `App.tsx` registers the route at `/resources/sb1103-compliance` (line 700) — without the hyphen between `sb` and `1103`. Clicking the "SB 1103 CAM Reconciliation Compliance" card in the ResourcesHub navigates to a 404.

**Severity:** P1 — One of the nine resource articles is completely unreachable from the hub.

**Fix:** Change the route in `App.tsx` from `/resources/sb1103-compliance` to `/resources/sb-1103-compliance` (or vice versa — but the canonical URL in the component and the hub both use the hyphen form, so the route should match).

---

## Finding 4 — `/compliance/security-overview` route does not exist; linked from About page (P1)

**File:** `frontend/src/pages/company/About.tsx:217`

**What's wrong:** `About.tsx` renders a link `to="/compliance/security-overview"` (line 217). There is no route registered in `App.tsx` for this path. The only compliance route registered is `/compliance/ai-transparency` (App.tsx line 338). Clicking the "Security Overview" link in the About page renders 404.

**Severity:** P1 — Dead navigation link from a public page.

**Fix:** Either register a route for `/compliance/security-overview` with an appropriate page component, or change the link to a valid destination (e.g., `/privacy` or the existing `/compliance/ai-transparency`).

---

## Finding 5 — Contact form: non-audit inquiry types (demo, pricing, support, other) are silently discarded — no backend submission (P1)

**File:** `frontend/src/pages/company/Contact.tsx:132–147`

**What's wrong:** When `isAuditRequest` is false (inquiry types: demo, pricing, support, partnership, other), the form handler (lines 132–147) calls only `logger.debug(...)`, fires a PostHog analytics event, and then sets `submitted = true`. There is **no HTTP request to any backend endpoint**. The form shows a success confirmation ("We've received your message") but the data is never sent anywhere.

The `contact_requests.py` backend endpoint at `/api/v1/contact-requests` exists and is designed for non-audit contact submissions, but the frontend never calls it.

**Severity:** P1 — Non-audit contact inquiries (demo requests, pricing questions, support tickets, partnerships) are silently dropped. Users believe they submitted; the team never receives the message.

**Fix:** For non-audit inquiry types, send a POST to `/api/v1/contact-requests` with name, email, message, inquiryType, and company. Only show the success state after a confirmed 2xx response.

---

## Finding 6 — ToolsHub is missing `AuditRiskQuiz` and `CamLeakageEstimator` from its cards (P2)

**File:** `frontend/src/pages/tools/ToolsHub.tsx:22–64` / `frontend/src/App.tsx:711–732`

**What's wrong:** Both `/tools/audit-risk-quiz` and `/tools/cam-leakage-estimator` are registered as routes in `App.tsx` (lines 711, 724) and are full, working interactive tools. However, the `TOOLS` array in `ToolsHub.tsx` only lists four tools: HCAD Tax Normalizer, BOMA 2024 Calculator, CAM Gross-Up Calculator, and Lease Abstract Matrix. The Audit Risk Quiz and CAM Leakage Estimator are unreachable from the Tools Hub index page.

The Footer does link to both (Footer.tsx lines 27–28), but a user browsing `/tools` has no way to discover them.

**Severity:** P2 — Two fully implemented tools are hidden from the index page; reachable only via the footer or direct URL.

**Fix:** Add `AuditRiskQuiz` and `CamLeakageEstimator` entries to the `TOOLS` array in `ToolsHub.tsx`.

---

## Finding 7 — BOMA 2024 Calculator: stale `fetchCalculation` dependency suppressed with eslint-disable comment — cap rate slider does not trigger a backend recalculation (P2)

**File:** `frontend/src/pages/tools/Boma2024Calculator.tsx:177–187`

**What's wrong:** The `fetchCalculation` `useCallback` at line 128 captures `capRate` in its closure (`[capRate]` in its deps array, line 174). The `useEffect` that fires the API call at line 177 only depends on `[inputs]` — the `fetchCalculation` reference (which changes when `capRate` changes) is deliberately excluded with `// eslint-disable-next-line react-hooks/exhaustive-deps` at line 186.

When the user moves the cap rate slider (after unlock), `fetchCalculation` gets a new reference with the new `capRate` value, but the `useEffect` does not re-run. The `cap_rate` field in the API payload remains the value from the **last inputs change**, not the current slider position.

The backend's `boma_2024.py` service does use `cap_rate` to compute `asset_value_lift` (line 118: `revenue_lift / inputs.cap_rate`). The frontend discards the API's `asset_value_lift` field entirely and recalculates locally (line 196: `parseFloat(result.revenue_lift) / (capRate / 100)`). Since `revenue_lift` is cap-rate-independent on the backend, this local recalculation is correct. However, the stale `cap_rate` in the payload means the API call (when inputs do change) will compute `asset_value_lift` with a stale cap rate — a wasted computation, but not a visible bug given the frontend ignores that field.

The real behavioral issue: if a user unlocks the gate and then moves the cap rate slider **before** changing any inputs, the `cap_rate` sent in the **next** API call will be stale from the slider's initial value, not the current position.

**Severity:** P2 — Financial projection may silently compute with wrong cap rate on next input change after slider interaction.

**Fix:** Remove the `eslint-disable` comment and add `fetchCalculation` to the `useEffect` dependency array, or separate the cap-rate-dependent logic. Since `revenue_lift` is cap-rate-independent, the simplest fix is to remove `cap_rate` from the API payload entirely and always compute `asset_value_lift` locally using the current `capRate` state.

---

## Finding 8 — CamLeakageEstimator: benchmark note in UI contradicts the actual computation rates (P2)

**File:** `frontend/src/pages/tools/CamLeakageEstimator.tsx:60–61, 289–291`

**What's wrong:** The computation constants at lines 60–61 are `LEAKAGE_LOW_RATE = 0.0025` (0.25%) and `LEAKAGE_HIGH_RATE = 0.015` (1.5%). The note shown to users at line 282–284 accurately describes these as "0.25% (low) to 1.5% (high)." However, the second benchmark note at lines 289–291 states "Based on industry benchmarks: 3% (conservative) to 5% (likely) annual CAM leakage" — a completely different set of numbers (3%–5%) that contradicts the 0.25%–1.5% used in the actual computation. Users reading both notes will see conflicting figures.

**Severity:** P2 — Misleading UI copy that contradicts the displayed result.

**Fix:** Remove the "3% (conservative) to 5% (likely)" note, or reconcile the benchmark note with the actual computation rates. If 3%–5% is the intended leakage benchmark, the `LEAKAGE_LOW_RATE` and `LEAKAGE_HIGH_RATE` constants should be updated accordingly.

---

## Finding 9 — Duplicate `trackEvent('tool_page_view')` and `trackEvent('lead_form_view')` useEffect calls in CamGrossUpCalculator and LeaseAbstractMatrix (P3)

**File:** `frontend/src/pages/tools/CamGrossUpCalculator.tsx:73–79` / `frontend/src/pages/tools/LeaseAbstractMatrix.tsx:23–28`

**What's wrong:** Both components call `trackEvent('tool_page_view', ...)` and `trackEvent('lead_form_view', ...)` each in a separate `useEffect` with `[]` deps — two useEffects that each fire once on mount. This results in two separate analytics events fired on mount, with both events firing at the same time. More relevantly, `lead_form_view` should be fired when the lead form first becomes visible, not at mount (especially if the form is below the fold).

**Severity:** P3 — Cosmetic/analytics accuracy issue. Not a functional bug.

**Fix:** Combine into a single `useEffect` with both tracking calls, or use `IntersectionObserver` for the `lead_form_view` event.

---

## Finding 10 — MriComparison and AppFolioComparison bylines contain a broken separator character (P3)

**File:** `frontend/src/pages/vs/MriComparison.tsx:96` / `frontend/src/pages/vs/AppFolioComparison.tsx:94`

**What's wrong:** Both comparison pages render a `<span aria-hidden="true">` with a garbled/broken Unicode character (shown as `?`) as a bullet separator in the author byline. `YardiComparison.tsx` renders "·" (Unicode middle dot `·`) inline via text content and is fine. The MRI and AppFolio bylines use what appears to be a corrupted character that will render as a box or question mark in browsers.

**Severity:** P3 — Cosmetic rendering issue on two public marketing pages.

**Fix:** Replace the broken character with `·` (middle dot) or `&middot;` as used in `YardiComparison.tsx`.

---

## Finding 11 — ResourcesHub `dateModified` is hardcoded to `2026-02-23` in SEO structured data (P3)

**File:** `frontend/src/pages/resources/ResourcesHub.tsx:101`

**What's wrong:** The SEO structured data for the ResourcesHub sets `dateModified: '2026-02-23'` hardcoded. This date will never update as content changes. The same pattern appears in `SampleReport.tsx` line 36 (`datePublished: '2026-02-23'`).

**Severity:** P3 — SEO metadata staleness.

**Fix:** Pull `dateModified` from a config constant or last-updated date that is updated when content changes.

---

## Finding 12 — `DownloadThankYou` has no redirect or guard for direct URL access (P2)

**File:** `frontend/src/pages/tools/DownloadThankYou.tsx:16–61`

**What's wrong:** The thank-you page at `/tools/:slug/thank-you` can be navigated to directly by anyone without going through the lead capture form. The page will render for any `:slug` value, including slugs not in `ASSET_DISPLAY_NAMES` (which only contains 2 entries: `cam-gross-up-calculator` and `lease-abstract-matrix`), defaulting to "your resource" as the asset name. There is no check that the user actually completed the lead form — anyone who bookmarks or directly visits the URL sees the "Check your email" confirmation without having submitted.

**Severity:** P2 — UX gap: thank-you page is reachable without form completion.

**Fix:** Navigate from `LeadCaptureForm`/`CamGrossUpCalculator` with `state: { fromForm: true }` and redirect to `/tools` if `location.state?.fromForm` is falsy on `DownloadThankYou` mount.

---

## Summary Table

| # | Severity | File:Line | Summary |
|---|----------|-----------|---------|
| 1 | P0 | `App.tsx:224` | `LandingPage` is unrouted; root `/` redirects authenticated-only to `/dashboard` — no public landing page exists |
| 2 | P1 | `Footer.tsx:41`, `App.tsx` (missing) | `/about` route not registered; `About` page component exists but is unreachable |
| 3 | P1 | `ResourcesHub.tsx:83`, `App.tsx:700` | SB 1103 resource slug mismatch: hub links `sb-1103-compliance`, route is `sb1103-compliance` → 404 |
| 4 | P1 | `About.tsx:217` | `/compliance/security-overview` link in About page has no route registered → 404 |
| 5 | P1 | `Contact.tsx:132–147` | Non-audit contact form (demo, pricing, support, other) silently discards submissions — never calls backend |
| 6 | P2 | `ToolsHub.tsx:22–64` | AuditRiskQuiz and CamLeakageEstimator are routed but absent from ToolsHub cards — invisible from the index |
| 7 | P2 | `Boma2024Calculator.tsx:177–187` | `eslint-disable` suppresses missing `fetchCalculation` dep; cap rate slider does not trigger API re-call when inputs are unchanged |
| 8 | P2 | `CamLeakageEstimator.tsx:60–61,289` | Benchmark note (3%–5%) contradicts actual computation rates (0.25%–1.5%) shown to user |
| 9 | P2 | `DownloadThankYou.tsx:16` | Thank-you page is reachable without form submission; no guard or redirect |
| 10 | P3 | `CamGrossUpCalculator.tsx:73–79` | Duplicate `useEffect` fires both `tool_page_view` and `lead_form_view` separately on mount |
| 11 | P3 | `MriComparison.tsx:96`, `AppFolioComparison.tsx:94` | Broken/garbled separator character in byline on MRI and AppFolio comparison pages |
| 12 | P3 | `ResourcesHub.tsx:101` | `dateModified` hardcoded to `2026-02-23` in SEO structured data; never updates |
