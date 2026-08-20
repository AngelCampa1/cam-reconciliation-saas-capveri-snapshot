# Promo Infrastructure + 80% Launch Offer Deadline — Design

**Date:** 2026-06-23
**Author:** Angel (via Claude)
**Status:** Awaiting approval

## Goal

Two deliverables, one change:

1. **Make the "80% off first year" launch offer clearly end Friday, July 3, 2026** everywhere it makes sense, and enforce that deadline server-side (offer stops applying after the cutoff).
2. **Generalize the single hardcoded launch offer into reusable promo infrastructure** so future promos (limited-time discounts, bonus perks, extra support, etc.) can be added by editing config — without rewiring the codebase each time.

### Decisions locked with Angel

| Fork | Decision |
|------|----------|
| Infra depth | **Config-driven promo registry** in `plan-tiers.json`. Keep Stripe coupons as the discount mechanism. Do NOT wire the unused Supabase `promotions` table (it stays available for a future analytics-driven migration). |
| Non-discount promo types | **Model + display now, entitlement-wiring later.** Schema supports arbitrary `type` values and a `perks` list so marketing/pricing can describe any promo. Actually granting non-discount perks in-product is wired per-promo when a concrete one launches (YAGNI — only the 80% discount is live today). |
| Cutoff + enforcement | **Ends 11:59pm PT Friday, July 3, 2026 → exclusive UTC boundary `2026-07-04T07:00:00Z`** (PDT = UTC−7). **Hard server-side enforcement**: backend refuses to apply the coupon after the cutoff (in addition to the existing 300-seat cap — whichever hits first), and all UI/marketing stops advertising it automatically. |

## Current state (as mapped)

- **SSOT:** `plan-tiers.json` → `launchOffer` object → `scripts/generate-plan-tiers.mjs` (emits Python + `frontend/src/generated/plan-tiers.ts` + `marketing/src/generated/plan-tiers.ts`) and `scripts/generate-public-knowledge.mjs` (emits `public-knowledge.json` + both apps' `public-knowledge.ts`; the JSON also feeds the Cloudflare backend AI-CS context).
- **Display config wrappers** (`frontend/src/config/launch-offer.ts`, `marketing/src/config/launch-offer.ts`) read `publicKnowledge.pricing.launchOffer`.
- **Runtime state:** `GET /api/v1/billing/launch-offer/active` → `getActiveLaunchPhase()` reads `times_redeemed`/`max_redemptions` from the Stripe coupon; returns `ActiveLaunchPhase`. Polled every 60s by `useActiveLaunchPhase()`. UI hides the offer when `all_exhausted: true`.
- **Cloudflare backend `LAUNCH_OFFER`** in `cloudflare-backend/src/domain/billing/plan-tiers.ts` is **hand-maintained** (snake_case), not generated.
- **There is no end date anywhere today.** "Limited time offer" copy exists but nothing expires by date; the only gate is the 300-redemption Stripe cap.
- **~12 display surfaces** consume `LAUNCH_OFFER`: marketing nav banner, pricing page (hero + `LaunchOfferProgress` + card), homepage pricing teaser, pricing SEO metadata, `/terms#limited-offer`, `public/pricing.md|txt`, `public/llms.txt`; app: `Pricing.tsx`, `Checkout.tsx`, `CheckoutDialog.tsx`, `PlanComparison.tsx`, `PricingTeaser.tsx`, `FreeAuditUpgradeModal.tsx`.

## Design

### 1. Data model — promo registry (SSOT)

Restructure `plan-tiers.json`: replace the single `launchOffer` object with a `promos` array (the registry). Each promo:

```jsonc
{
  "id": "launch-80off",                 // stable internal id
  "code": "80OFF",                       // checkout code / Stripe-facing
  "type": "percent_off_first_year",      // see promo types below
  "label": "80% off the first year",
  "discountPercent": 80,                 // for percent_* types; null otherwise
  "checkoutParam": "offer",
  "maxRedemptions": 300,                  // null = no seat cap
  "startsAt": null,                       // ISO8601 UTC or null = already live
  "endsAt": "2026-07-04T07:00:00Z",      // ISO8601 UTC exclusive boundary; null = no deadline
  "endsAtDisplay": "Friday, July 3",     // human label for UI/marketing
  "stripeCouponEnv": "STRIPE_80OFF_COUPON_ID",
  "terms": "80% off the first year, applied once to your first annual subscription invoice.",
  "perks": [],                            // non-discount perks (extra support, bonus features) for display
  "appliesToPlans": ["reconcile"],
  "enabled": true
}
```

**Supported `type` values** (forward-looking; only the first is live):
`percent_off_first_year`, `percent_off`, `fixed_off`, `bonus_perk`, `extra_support`. Unknown/non-discount types are modeled + displayed but grant no in-product entitlement until wired per-promo.

**Active/featured promo selection (build time):** first promo with `enabled !== false`. Build time ≠ request time, so date-expiry is NOT resolved at build — it is enforced at runtime by the backend. The generator emits the registry plus a derived legacy projection.

### 2. Generator changes (back-compat preserving)

`scripts/generate-plan-tiers.mjs` and `scripts/generate-public-knowledge.mjs`:

- Read `matrix.promos`; compute `activePromo = promos.find(p => p.enabled !== false) ?? promos[0]`.
- **Emit `PROMOS` registry** (new) in the generated TS for future multi-promo consumers.
- **Derive the legacy `LAUNCH_OFFER` / `launchOffer` projection** from `activePromo` — same shape as today **plus** new fields `endsAt`, `endsAtDisplay`, `type`, `terms`, `perks`. This keeps all ~12 existing consumers working unchanged; they pick up the deadline via the new fields.
  - `phases` is derived as a single phase `[{ code, label, discountPercent, maxRedemptions }]` so the Python/back-compat consumers are unaffected.
- `buildPricing` in the public-knowledge generator gains display strings that include the deadline (e.g. an `endsLabel: "Offer ends Friday, July 3"`), surfaced through `publicKnowledge.pricing.display` and `pricing.launchOffer`.
- Existing `--check` modes (`generate-public-knowledge.mjs --check`, `llms:check`) must stay green: regenerate all artifacts and commit them.

Config wrappers (`config/launch-offer.ts` in both apps) gain `endsAt` and `endsAtDisplay` passthrough from `publicKnowledge.pricing.launchOffer`.

### 3. Backend runtime enforcement (Cloudflare)

`cloudflare-backend/src/domain/billing/plan-tiers.ts`:
- Add `ends_at: "2026-07-04T07:00:00Z"` (and `ends_at_display`) to the hand-maintained `LAUNCH_OFFER`. **Guard against drift** with a unit test asserting it equals the generated value.

`cloudflare-backend/src/domain/billing/repository.ts` — `ActiveLaunchPhase` type:
- Add `ends_at: string | null` and `ends_at_display: string | null`.

`getActiveLaunchPhase(env, now)` + `fallbackLaunchPhase()` (`billing-routes.ts`):
- Thread the route's `now` clock in (the route already has a `clock` dependency for testability).
- Include `ends_at` / `ends_at_display` in the response.
- **Expiry gate:** if `now >= ends_at`, return the exhausted shape (`code/label/discount_percent = null`, `all_exhausted: true`). Reusing `all_exhausted` means every existing UI consumer hides the offer automatically — no per-surface logic change needed for hide-after-expiry. (Redemption-cap exhaustion still works as before; whichever triggers first wins.)

`resolveLaunchOfferCoupon()` / `validateLaunchOfferCode()` (checkout + plan-selection path):
- Add a deadline check: if `now >= ends_at`, reject with `HttpError(400, "offer_expired", ...)`. This is the hard server-side enforcement — the coupon cannot be applied after the cutoff even via a crafted `?offer=80OFF` request.

`marketing/src/lib/launch-phase.ts` (`LaunchPhaseData`) + frontend equivalent: add `ends_at` / `ends_at_display` fields and carry them through the fallback.

### 4. Deadline display ("clear wherever it makes sense")

Surface a single, consistent deadline line driven by `endsAtDisplay`, on every surface that already advertises the offer:

- **Marketing:** nav banner, pricing hero, `LaunchOfferProgress`, pricing card, homepage pricing teaser. Add "Offer ends Friday, July 3." after the existing offer line.
- **App:** `Pricing.tsx`, `Checkout.tsx`, `CheckoutDialog.tsx`, `PlanComparison.tsx`, `PricingTeaser.tsx`, `FreeAuditUpgradeModal.tsx` — same deadline line beside the offer copy.
- **Terms `/terms#limited-offer`:** add the explicit end date to the legal text (exact text, not subject to third-grade rewrite, but must state "ends 11:59pm PT on July 3, 2026").
- **Machine-readable:** `public/pricing.md`, `public/pricing.txt`, `public/llms.txt` (regenerated) include the deadline.

**No live countdown timer for now** — a static, clear deadline line is lower-risk (no hydration/timezone footguns) and sufficient. A reusable countdown component is a documented future enhancement for "limited time" promos.

When the cutoff passes, the backend returns `all_exhausted: true`, so all dynamic surfaces stop showing the offer (and its deadline) automatically within one 60s poll. Static/SSR copy (teaser fallback, machine files) returns to list pricing on the next deploy; this is acceptable since the polled banner/hero are the authoritative live surfaces.

### 5. Copy gates (mandatory before completion)

All new reader-visible deadline copy is persuasive marketing copy, so it must pass, in order:
1. `humanizer` skill
2. `third-grade-copy` skill (CTA verb whitelist: get/start/see/find/book/save/send/read/continue/try)
3. `node scripts/marketing-copy-gate.mjs` (exit 0) — no internal jargon.

Terms legal text and code identifiers are exempt.

## Testing

- **Backend (Vitest, `cloudflare-backend`):**
  - `getActiveLaunchPhase` returns `ends_at`/`ends_at_display` and `all_exhausted: false` before the cutoff.
  - After the cutoff (mocked `now`), returns expired shape (`all_exhausted: true`, null code/label/discount).
  - Checkout/plan-selection with `80OFF` after cutoff → `400 offer_expired`; before cutoff → coupon applied (existing tests stay green).
  - Drift guard: CF `LAUNCH_OFFER.ends_at` === generated `plan-tiers.ts` `LAUNCH_OFFER.endsAt`.
- **Generators:** run both generators; `--check`/`llms:check` modes green; committed artifacts regenerated.
- **Frontend/marketing:** typecheck + lint + existing pricing/checkout tests green. Render-verify the deadline line on pricing + checkout via the dev server (`:3030`), per the marketing-perfect playbook (preview_snapshot + preview_eval DOM-text; screenshots time out).

## Out of scope (YAGNI)

- Wiring the Supabase `promotions`/`promotion_redemptions` tables.
- Per-org redemption analytics.
- In-product entitlement granting for non-discount promo types.
- Live countdown timer component.
- Admin UI for managing promos (config-file edit + deploy is the workflow).

## Rollout / verification

Standard CapVeri deploy: regenerate artifacts, run scoped tests/lint sequentially per impacted project, code review, merge `--no-ff` to local `master`, push. Verify `capveri-api`, `capveri-app`, `capveri-marketing` Workers reach 100% current version. Live-verify the deadline shows on www.capveri.com pricing + that the offer is still applying (pre-deadline).
