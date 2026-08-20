# Promo Infrastructure + 80% Offer July 3 Deadline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the single hardcoded launch offer into a config-driven `promos[]` registry, and make the 80% off offer clearly end (and hard-stop) at 11:59pm PT Friday, July 3, 2026 (`2026-07-04T07:00:00Z`) everywhere it appears.

**Architecture:** `plan-tiers.json` becomes the registry SSOT. Two generators (`generate-plan-tiers.mjs`, `generate-public-knowledge.mjs`) derive a back-compat `LAUNCH_OFFER` projection (so all ~12 existing consumers keep working) plus emit a new `PROMOS` array. The Cloudflare backend gates the offer on `now >= endsAt` at the active-phase endpoint and the checkout/plan-selection path (hard server-side). UI surfaces show a consistent deadline line driven by `endsAtDisplay`; they already hide when `all_exhausted`, so expiry hides them automatically.

**Tech Stack:** Node ESM generators, Cloudflare Workers / Hono / TypeScript / Vitest, React 19 / Vite (app), Next.js (marketing), Python (legacy generated mirror).

**Worktree:** Create an isolated worktree off `origin/master` before starting (shared-main-tree churn footgun). Branch suggestion: `feat/promo-registry-80off-deadline`.

**Canonical constants used throughout:**
- `endsAt` (UTC, exclusive): `2026-07-04T07:00:00Z`
- `endsAtDisplay` (UI label): `Friday, July 3`
- Deadline copy line (pending humanizer/third-grade pass): `Offer ends Friday, July 3.`
- Terms end-date phrase: `ends at 11:59pm Pacific on July 3, 2026`

---

### Task 1: Restructure `plan-tiers.json` to a `promos[]` registry

**Files:**
- Modify: `plan-tiers.json:6-14` (replace `launchOffer` object)

- [ ] **Step 1: Replace the `launchOffer` block with a `promos` array**

Replace lines 6-14 (`"launchOffer": { ... },`) with:

```jsonc
  "promos": [
    {
      "id": "launch-80off",
      "code": "80OFF",
      "type": "percent_off_first_year",
      "label": "80% off the first year",
      "discountPercent": 80,
      "checkoutParam": "offer",
      "maxRedemptions": 300,
      "startsAt": null,
      "endsAt": "2026-07-04T07:00:00Z",
      "endsAtDisplay": "Friday, July 3",
      "stripeCouponEnv": "STRIPE_80OFF_COUPON_ID",
      "terms": "80% off the first year, applied once to your first annual subscription invoice.",
      "perks": [],
      "appliesToPlans": ["reconcile"],
      "enabled": true
    }
  ],
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('plan-tiers.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add -- plan-tiers.json
git commit -m "feat(promo): replace launchOffer with promos[] registry in plan-tiers.json"
```

---

### Task 2: Teach `generate-plan-tiers.mjs` to derive from `promos[]` and emit `PROMOS`

**Files:**
- Modify: `scripts/generate-plan-tiers.mjs`
- Regenerated outputs (do not hand-edit): `frontend/src/generated/plan-tiers.ts`, `marketing/src/generated/plan-tiers.ts`, `backend/app/services/billing/generated_plan_tiers.py`

- [ ] **Step 1: Add promo derivation near the top of the script**

After the destructure (`const { tiers, features, trialDays, trialReminderDays, launchOffer } = matrix;` at line 13), replace it with:

```js
const { tiers, features, trialDays, trialReminderDays } = matrix;

// promos[] is the registry SSOT. The active promo is the first enabled one.
// Date-based expiry is enforced at RUNTIME by the backend, not at build time.
const promos = matrix.promos ?? [];
const activePromo = promos.find((p) => p.enabled !== false) ?? promos[0] ?? null;

// Back-compat projection: existing consumers read LAUNCH_OFFER with the old shape
// plus additive fields (endsAt, endsAtDisplay, type, terms, perks).
const launchOffer = activePromo
  ? {
      checkoutParam: activePromo.checkoutParam,
      code: activePromo.code,
      label: activePromo.label,
      discountPercent: activePromo.discountPercent ?? 0,
      type: activePromo.type,
      endsAt: activePromo.endsAt ?? null,
      endsAtDisplay: activePromo.endsAtDisplay ?? null,
      terms: activePromo.terms ?? `${activePromo.label}.`,
      perks: activePromo.perks ?? [],
      phases: [
        {
          code: activePromo.code,
          label: activePromo.label,
          discountPercent: activePromo.discountPercent ?? 0,
          maxRedemptions: activePromo.maxRedemptions ?? 0,
        },
      ],
    }
  : null;
```

- [ ] **Step 2: Emit the `PROMOS` registry in the generated TS**

In `tsFile()`, after the `export const LAUNCH_OFFER = ...;` line (line 75), add:

```js
  // emitted just after LAUNCH_OFFER
```

Concretely, change the template so it includes:

```js
export const PROMOS = ${JSON.stringify(promos, null, 2)};
```

immediately after the `LAUNCH_OFFER` export. The `LAUNCH_OFFER` export stays `export const LAUNCH_OFFER = ${JSON.stringify(launchOffer, null, 2)};`.

- [ ] **Step 3: Keep the Python `LAUNCH_OFFER` generation working**

The Python section reads `launchOffer.checkoutParam`, `.code`, `.label`, `.discountPercent`, `launchOfferMaxRedemptions` (from `launchOffer.phases[0].maxRedemptions`), and `launchOffer.phases`. With the derived `launchOffer` above these all resolve. Leave the Python `LaunchOffer` TypedDict as-is (the new fields are TS-only; Python does not need `endsAt`).

Verify `launchOfferMaxRedemptions` (line 23-24) still resolves: it reads `launchOffer.phases?.[0]?.maxRedemptions` — yes, the derived projection provides `phases[0].maxRedemptions`.

- [ ] **Step 4: Regenerate and verify**

Run: `node scripts/generate-plan-tiers.mjs`
Expected: `Generated subscription plan tier artifacts.`

Run: `node -e "const m=require('./frontend/src/generated/plan-tiers.ts'.replace(/\.ts$/,'')); " 2>/dev/null; grep -c "endsAt" frontend/src/generated/plan-tiers.ts marketing/src/generated/plan-tiers.ts`
Expected: each file reports `>= 1` (the `endsAt` field is present in `LAUNCH_OFFER`).

Confirm `PROMOS` is present: `grep -c "export const PROMOS" frontend/src/generated/plan-tiers.ts marketing/src/generated/plan-tiers.ts` → each `1`.

- [ ] **Step 5: Commit**

```bash
git add -- scripts/generate-plan-tiers.mjs frontend/src/generated/plan-tiers.ts marketing/src/generated/plan-tiers.ts backend/app/services/billing/generated_plan_tiers.py
git commit -m "feat(promo): derive LAUNCH_OFFER + emit PROMOS registry from promos[]"
```

---

### Task 3: Update `generate-public-knowledge.mjs` for `promos[]` + deadline display string

**Files:**
- Modify: `scripts/generate-public-knowledge.mjs`
- Regenerated outputs: `knowledge/generated/public-knowledge.json`, `backend/app/generated/public-knowledge.json`, `cloudflare-backend/src/generated/public-knowledge.json`, `frontend/src/generated/public-knowledge.ts`, `marketing/src/generated/public-knowledge.ts`, `knowledge/generated/public-knowledge.ts`

- [ ] **Step 1: Derive `launchOffer` from `promos[]` inside `buildPricing`**

In `buildPricing(planTiers, ...)`, replace `const launchOffer = planTiers.launchOffer;` (line 80) with:

```js
  const promos = planTiers.promos ?? [];
  const activePromo = promos.find((p) => p.enabled !== false) ?? promos[0] ?? null;
  const launchOffer = activePromo
    ? {
        checkoutParam: activePromo.checkoutParam,
        code: activePromo.code,
        label: activePromo.label,
        discountPercent: activePromo.discountPercent ?? 0,
        type: activePromo.type,
        endsAt: activePromo.endsAt ?? null,
        endsAtDisplay: activePromo.endsAtDisplay ?? null,
        terms: activePromo.terms ?? `${activePromo.label}.`,
        perks: activePromo.perks ?? [],
        phases: [
          {
            code: activePromo.code,
            label: activePromo.label,
            discountPercent: activePromo.discountPercent ?? 0,
            maxRedemptions: activePromo.maxRedemptions ?? 0,
          },
        ],
      }
    : null;
```

- [ ] **Step 2: Add a deadline display string**

In the `display:` object returned by `buildPricing` (around line 246-262), add an `endsLabel` field after `launchOfferTerms`:

```js
      launchOfferTerms,
      launchOfferEndsLabel: launchOffer?.endsAtDisplay
        ? `Offer ends ${launchOffer.endsAtDisplay}.`
        : null,
```

(The `launchOfferTerms` const is already computed at line 83: `const launchOfferTerms = `${launchOffer.label}.`;` — guard it for null: change to `const launchOfferTerms = launchOffer ? `${launchOffer.label}.` : "";`.)

- [ ] **Step 3: Expose `PROMOS` in the knowledge object**

In `buildPricing`'s return object (line 235-263), add `promos,` alongside `launchOffer,` (line 239) so `publicKnowledge.pricing.promos` is available.

- [ ] **Step 4: Regenerate and verify `--check` stays green**

Run: `node scripts/generate-public-knowledge.mjs`
Expected: `Generated public knowledge artifacts.`

Run: `node scripts/generate-public-knowledge.mjs --check`
Expected: `Generated public knowledge artifacts are current.`

Run: `grep -c "endsAt\|launchOfferEndsLabel" marketing/src/generated/public-knowledge.ts`
Expected: `>= 1`

- [ ] **Step 5: Commit**

```bash
git add -- scripts/generate-public-knowledge.mjs knowledge/generated/public-knowledge.json knowledge/generated/public-knowledge.ts backend/app/generated/public-knowledge.json cloudflare-backend/src/generated/public-knowledge.json frontend/src/generated/public-knowledge.ts marketing/src/generated/public-knowledge.ts
git commit -m "feat(promo): derive launchOffer from promos[] + add deadline display label in public-knowledge"
```

---

### Task 4: Add `ends_at` to the Cloudflare backend `LAUNCH_OFFER` + drift guard test

**Files:**
- Modify: `cloudflare-backend/src/domain/billing/plan-tiers.ts:3-18`
- Test: `cloudflare-backend/src/test/promo-deadline.test.ts` (create)

- [ ] **Step 1: Write the failing drift-guard test**

Create `cloudflare-backend/src/test/promo-deadline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LAUNCH_OFFER } from "../domain/billing/plan-tiers";

describe("launch offer deadline parity", () => {
  it("CF LAUNCH_OFFER.ends_at matches the active promo in plan-tiers.json", () => {
    const planTiers = JSON.parse(
      readFileSync(resolve(__dirname, "../../../plan-tiers.json"), "utf8"),
    );
    const active = planTiers.promos.find((p: { enabled?: boolean }) => p.enabled !== false);
    expect(LAUNCH_OFFER.ends_at).toBe(active.endsAt);
    expect(LAUNCH_OFFER.code).toBe(active.code);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd cloudflare-backend && npx vitest run src/test/promo-deadline.test.ts`
Expected: FAIL — `LAUNCH_OFFER.ends_at` is `undefined`.

- [ ] **Step 3: Add `ends_at`/`ends_at_display` to `LAUNCH_OFFER`**

In `cloudflare-backend/src/domain/billing/plan-tiers.ts`, update the `LAUNCH_OFFER` const:

```ts
export const LAUNCH_OFFER = {
  checkout_param: "offer",
  code: "80OFF",
  label: "80% off the first year",
  discount_percent: 80,
  max_redemptions: 300,
  ends_at: "2026-07-04T07:00:00Z",
  ends_at_display: "Friday, July 3",
  phases: [
    {
      phase_index: 1,
      code: "80OFF",
      label: "80% off the first year",
      discount_percent: 80,
      max_redemptions: 300,
    },
  ],
} as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd cloudflare-backend && npx vitest run src/test/promo-deadline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- cloudflare-backend/src/domain/billing/plan-tiers.ts cloudflare-backend/src/test/promo-deadline.test.ts
git commit -m "feat(promo): add ends_at to CF LAUNCH_OFFER + drift-guard test"
```

---

### Task 5: Gate `getActiveLaunchPhase` on the deadline

**Files:**
- Modify: `cloudflare-backend/src/domain/billing/repository.ts:1-9` (`ActiveLaunchPhase` type)
- Modify: `cloudflare-backend/src/http/billing-routes.ts` (`fallbackLaunchPhase`, `getActiveLaunchPhase`, the route at ~line 212)
- Test: `cloudflare-backend/src/test/billing-routes.test.ts` (existing — add cases)

- [ ] **Step 1: Extend the `ActiveLaunchPhase` type**

In `repository.ts`, add two fields:

```ts
export type ActiveLaunchPhase = {
  code: string | null;
  label: string | null;
  discount_percent: number | null;
  times_redeemed: number;
  max_redemptions: number;
  phase_index: number;
  all_exhausted: boolean;
  ends_at: string | null;
  ends_at_display: string | null;
};
```

- [ ] **Step 2: Write failing tests for deadline behavior**

In `billing-routes.test.ts`, add (near the existing launch-offer tests ~line 775):

```ts
it("returns ends_at and stays active before the deadline", async () => {
  const before = new Date("2026-07-01T00:00:00Z");
  const app = createTestApp({ clock: () => before /* plus existing stripe mock */ });
  const response = await app.request("/billing/launch-offer/active");
  const body = await response.json();
  expect(body.ends_at).toBe("2026-07-04T07:00:00Z");
  expect(body.ends_at_display).toBe("Friday, July 3");
  expect(body.all_exhausted).toBe(false);
});

it("marks the offer exhausted after the deadline", async () => {
  const after = new Date("2026-07-04T07:00:01Z");
  const app = createTestApp({ clock: () => after /* plus existing stripe mock */ });
  const response = await app.request("/billing/launch-offer/active");
  const body = await response.json();
  expect(body.all_exhausted).toBe(true);
  expect(body.code).toBeNull();
  expect(body.discount_percent).toBeNull();
});
```

> Note: match `createTestApp`/clock-injection to the existing harness in this file — reuse whatever pattern the current launch-offer tests use to inject `clock` and the Stripe coupon fetch mock. Read the existing test (~line 775-828) first and mirror it.

- [ ] **Step 3: Run to verify failure**

Run: `cd cloudflare-backend && npx vitest run src/test/billing-routes.test.ts -t "deadline"`
Expected: FAIL — `ends_at` undefined / still active after deadline.

- [ ] **Step 4: Implement the deadline gate**

In `billing-routes.ts`, update `fallbackLaunchPhase` to include the new fields:

```ts
function fallbackLaunchPhase(): ActiveLaunchPhase {
  const phase = LAUNCH_OFFER.phases[0];
  return {
    code: phase.code,
    label: phase.label,
    discount_percent: phase.discount_percent,
    times_redeemed: 0,
    max_redemptions: phase.max_redemptions,
    phase_index: phase.phase_index,
    all_exhausted: false,
    ends_at: LAUNCH_OFFER.ends_at,
    ends_at_display: LAUNCH_OFFER.ends_at_display,
  };
}
```

Add an expired-shape helper and a deadline check at the top of `getActiveLaunchPhase`. Change its signature to accept `now: Date`:

```ts
function expiredLaunchPhase(timesRedeemed = 0): ActiveLaunchPhase {
  const phase = LAUNCH_OFFER.phases[0];
  return {
    code: null,
    label: null,
    discount_percent: null,
    times_redeemed: timesRedeemed,
    max_redemptions: phase.max_redemptions,
    phase_index: phase.phase_index,
    all_exhausted: true,
    ends_at: LAUNCH_OFFER.ends_at,
    ends_at_display: LAUNCH_OFFER.ends_at_display,
  };
}

function isPastDeadline(now: Date): boolean {
  return now.getTime() >= new Date(LAUNCH_OFFER.ends_at).getTime();
}

async function getActiveLaunchPhase(env: AppEnv, now: Date): Promise<ActiveLaunchPhase> {
  if (isPastDeadline(now)) {
    return expiredLaunchPhase();
  }
  // ... existing body unchanged, but every returned object must include
  // ends_at: LAUNCH_OFFER.ends_at and ends_at_display: LAUNCH_OFFER.ends_at_display.
  // The exhausted-by-redemption branch should return expiredLaunchPhase(timesRedeemed)
  // (it already nulls code/label/discount and sets all_exhausted).
}
```

Update the existing redemption-exhausted branch (lines ~1363-1373) to `return expiredLaunchPhase(timesRedeemed);` and ensure the active `return { ...fallback, times_redeemed, max_redemptions }` keeps `ends_at`/`ends_at_display` (it inherits them from `fallback`).

- [ ] **Step 5: Pass `now` from the route**

At the route (line ~212):

```ts
app.get("/billing/launch-offer/active", async (c) =>
  c.json(await getActiveLaunchPhase(c.env, now(dependencies))),
);
```

Confirm `dependencies`/`now(dependencies)` is in scope at the route registration (the file already defines `function now(dependencies)` at line 1313). If the route closure doesn't have `dependencies`, use `new Date()` and inject via the existing test clock the same way other routes do — match the file's established pattern.

- [ ] **Step 6: Run tests to verify pass**

Run: `cd cloudflare-backend && npx vitest run src/test/billing-routes.test.ts`
Expected: PASS (new deadline cases + all existing launch-offer cases).

- [ ] **Step 7: Commit**

```bash
git add -- cloudflare-backend/src/domain/billing/repository.ts cloudflare-backend/src/http/billing-routes.ts cloudflare-backend/src/test/billing-routes.test.ts
git commit -m "feat(promo): expire launch offer at deadline in active-phase endpoint"
```

---

### Task 6: Hard-enforce the deadline in the checkout/plan-selection path

**Files:**
- Modify: `cloudflare-backend/src/http/billing-routes.ts` (`validateLaunchOfferCode` / `resolveLaunchOfferCoupon` and their callers)
- Test: `cloudflare-backend/src/test/billing-routes.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it("rejects the launch code after the deadline at checkout", async () => {
  const after = new Date("2026-07-04T07:00:01Z");
  const app = createTestApp({ clock: () => after /* + auth + stripe mocks as existing checkout tests use */ });
  const response = await app.request("/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", /* auth header as existing */ },
    body: JSON.stringify({
      plan_id: "reconcile",
      unit_count: 25,
      launch_offer_code: "80OFF",
      success_url: "https://app.capveri.com/ok",
      cancel_url: "https://app.capveri.com/cancel",
    }),
  });
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.error).toBe("offer_expired");
});
```

> Mirror the existing checkout test setup in this file for auth + Stripe customer/session mocks. Read an existing `/billing/checkout` test first.

- [ ] **Step 2: Run to verify failure**

Run: `cd cloudflare-backend && npx vitest run src/test/billing-routes.test.ts -t "after the deadline at checkout"`
Expected: FAIL (currently 200 / coupon applied).

- [ ] **Step 3: Add the deadline check to coupon resolution**

Change `resolveLaunchOfferCoupon` to take `now` and reject when expired. Update `validateLaunchOfferCode` to accept `now`:

```ts
function validateLaunchOfferCode(code: string | null | undefined, now: Date): void {
  if (code === null || code === undefined) return;
  if (code !== LAUNCH_OFFER.code) {
    throw new HttpError(400, "invalid_offer_code", "Invalid limited offer code");
  }
  if (isPastDeadline(now)) {
    throw new HttpError(400, "offer_expired", "This limited offer has ended");
  }
}

function resolveLaunchOfferCoupon(env: AppEnv, code: string | null | undefined, now: Date): string | null {
  validateLaunchOfferCode(code, now);
  if (code === null || code === undefined) return null;
  const couponId = env.STRIPE_80OFF_COUPON_ID;
  if (!couponId) {
    throw new HttpError(500, "limited_offer_coupon_not_configured", "Limited offer coupon is not configured");
  }
  return couponId;
}
```

Find every call site of `resolveLaunchOfferCoupon(` and `validateLaunchOfferCode(` (checkout handler + plan-selection handler) and pass `now(dependencies)` (or the in-scope clock). Search: `grep -n "resolveLaunchOfferCoupon\|validateLaunchOfferCode" cloudflare-backend/src/http/billing-routes.ts`.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd cloudflare-backend && npx vitest run src/test/billing-routes.test.ts`
Expected: PASS (new case + all existing checkout/plan-selection cases).

- [ ] **Step 5: Commit**

```bash
git add -- cloudflare-backend/src/http/billing-routes.ts cloudflare-backend/src/test/billing-routes.test.ts
git commit -m "feat(promo): reject expired launch code at checkout (offer_expired)"
```

---

### Task 7: Thread `ends_at`/`endsAt` through config wrappers + polling hooks

**Files:**
- Modify: `marketing/src/config/launch-offer.ts:12-20`
- Modify: `frontend/src/config/launch-offer.ts:10-18`
- Modify: `marketing/src/lib/launch-phase.ts:9-29`
- Modify: frontend launch-phase hook (find it: `grep -rl "launch-offer/active" frontend/src`)

- [ ] **Step 1: Add `endsAt`/`endsAtDisplay` to both config `LAUNCH_OFFER` wrappers**

Marketing (`marketing/src/config/launch-offer.ts`) — add inside the `LAUNCH_OFFER` object:

```ts
  endsAt: publicKnowledge.pricing.launchOffer.endsAt ?? null,
  endsAtDisplay: publicKnowledge.pricing.launchOffer.endsAtDisplay ?? null,
  endsLabel: publicKnowledge.pricing.display.launchOfferEndsLabel ?? null,
```

Apply the identical three lines to `frontend/src/config/launch-offer.ts`'s `LAUNCH_OFFER` object.

- [ ] **Step 2: Add the fields to the polling `LaunchPhaseData` + fallback**

In `marketing/src/lib/launch-phase.ts`, add to the interface:

```ts
  ends_at: string | null;
  ends_at_display: string | null;
```

and to `fallbackPhase()`:

```ts
    ends_at: LAUNCH_OFFER.endsAt,
    ends_at_display: LAUNCH_OFFER.endsAtDisplay,
```

Apply the same to the frontend launch-phase hook.

- [ ] **Step 3: Typecheck both apps**

Run: `cd marketing && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add -- marketing/src/config/launch-offer.ts frontend/src/config/launch-offer.ts marketing/src/lib/launch-phase.ts frontend/src/<launch-phase-hook>
git commit -m "feat(promo): expose endsAt/endsAtDisplay in config wrappers + polling hooks"
```

---

### Task 8: Show the deadline on marketing surfaces

**Files (deadline line adjacent to existing offer copy):**
- Modify: `marketing/src/components/MarketingNav.tsx:187-202` (banner)
- Modify: `marketing/src/components/PricingContent.tsx:168-201, 213-227` (hero, LaunchOfferProgress, card)
- Modify: `marketing/src/components/landing/PricingTeaser.tsx:81-87`

**Canonical line:** render `phase.ends_at_display` (dynamic) or `LAUNCH_OFFER.endsAtDisplay` (static fallback) as: `Offer ends {endsAtDisplay}.`

- [ ] **Step 1: Banner (`MarketingNav.tsx`)** — the banner already reads `useActiveLaunchPhase()`. Append the deadline to the existing line so it reads: `Limited-time launch offer. Get 80% off the first year. Use code 80OFF at checkout. Offer ends Friday, July 3.` Source the date from `phase.ends_at_display` (fall back to nothing if null). Only render when `!phase.all_exhausted` (already the case).

- [ ] **Step 2: Pricing hero + `LaunchOfferProgress` + card (`PricingContent.tsx`)** — after each existing "Limited time offer: ... with 80OFF." line, add a sibling line: `Offer ends {endsAtDisplay}.` using the active-phase value where the component already has it, else `LAUNCH_OFFER.endsLabel`.

- [ ] **Step 3: Homepage teaser (`PricingTeaser.tsx`)** — after the existing "Limited time offer: ... Use code 80OFF." line, add `Offer ends {LAUNCH_OFFER.endsAtDisplay}.` (this is SSR/static; uses the config value).

- [ ] **Step 4: Typecheck + lint marketing**

Run: `cd marketing && npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -- marketing/src/components/MarketingNav.tsx marketing/src/components/PricingContent.tsx marketing/src/components/landing/PricingTeaser.tsx
git commit -m "feat(promo): show July 3 deadline on marketing offer surfaces"
```

---

### Task 9: Show the deadline on app surfaces

**Files (same canonical line, beside existing offer copy):**
- Modify: `frontend/src/pages/Pricing.tsx:94-120`
- Modify: `frontend/src/pages/Checkout.tsx:371-393`
- Modify: `frontend/src/components/billing/CheckoutDialog.tsx:201-214`
- Modify: `frontend/src/components/billing/PlanComparison.tsx:66-73`
- Modify: `frontend/src/components/landing/PricingTeaser.tsx:69-75`
- Modify: `frontend/src/components/billing/FreeAuditUpgradeModal.tsx:96-100`

- [ ] **Step 1: Add the deadline line in each component** — after the existing `LAUNCH_OFFER.terms` / "Limited time offer" line, render `Offer ends {LAUNCH_OFFER.endsAtDisplay}.` (guard: only when `endsAtDisplay` is non-null and the offer is being shown). For `FreeAuditUpgradeModal`, append to the existing sentence: `... Use {LAUNCH_OFFER.code} for {LAUNCH_OFFER.terms} Offer ends {LAUNCH_OFFER.endsAtDisplay}.`

- [ ] **Step 2: Typecheck + lint frontend**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add -- frontend/src/pages/Pricing.tsx frontend/src/pages/Checkout.tsx frontend/src/components/billing/CheckoutDialog.tsx frontend/src/components/billing/PlanComparison.tsx frontend/src/components/landing/PricingTeaser.tsx frontend/src/components/billing/FreeAuditUpgradeModal.tsx
git commit -m "feat(promo): show July 3 deadline on app offer surfaces"
```

---

### Task 10: Terms legal text + machine-readable files

**Files:**
- Modify: `marketing/src/app/terms/page.tsx:50-52`
- Regenerated: `marketing/public/pricing.md`, `marketing/public/pricing.txt`, `marketing/public/llms.txt`

- [ ] **Step 1: Update the Terms "Limited Offer" clause**

Change the clause to state the deadline explicitly (legal text — exact wording, not third-grade-rewritten):

```
80OFF gives 80% off the first year, applied once to your first annual
subscription invoice. It applies only to subscriptions and ends at
11:59pm Pacific on July 3, 2026.
```

- [ ] **Step 2: Regenerate machine-readable pricing/llms files**

Check how `pricing.md`/`pricing.txt` are produced. Run: `grep -rn "pricing.md\|pricing.txt" marketing/scripts package.json scripts`. If generated, run that generator; if hand-maintained, edit them to append the deadline to the existing "Use 80OFF for 80% off the first year." line: `Offer ends Friday, July 3, 2026.`

Run: `cd marketing && node scripts/generate-llms.mjs` then `node scripts/generate-llms.mjs --check`
Expected: `--check` green.

- [ ] **Step 3: Commit**

```bash
git add -- marketing/src/app/terms/page.tsx marketing/public/pricing.md marketing/public/pricing.txt marketing/public/llms.txt
git commit -m "feat(promo): state July 3 deadline in terms + machine-readable pricing files"
```

---

### Task 11: Copy gates on all new reader-visible deadline copy

**Files:** any touched in Tasks 8-10 with new persuasive copy.

- [ ] **Step 1: Run humanizer** on each new deadline copy string (banner, hero, card, teaser, modal). Apply edits.

- [ ] **Step 2: Run third-grade-copy** on the same strings. Confirm reading level + CTA verb whitelist (get/start/see/find/book/save/send/read/continue/try). Apply edits.

- [ ] **Step 3: Run the marketing copy gate**

Run: `node scripts/marketing-copy-gate.mjs`
Expected: exit 0.

- [ ] **Step 4: Commit any copy edits**

```bash
git add -- <edited files>
git commit -m "chore(promo): copy-gate pass on deadline copy (humanizer + third-grade)"
```

---

### Task 12: Full verification (scoped, sequential) + live render check

- [ ] **Step 1: Backend tests + lint**

Run: `cd cloudflare-backend && npx vitest run && npm run lint`
Expected: all green.

- [ ] **Step 2: Frontend tests + typecheck + lint**

Run: `cd frontend && npm test -- --run && npx tsc --noEmit && npm run lint`
Expected: green.

- [ ] **Step 3: Marketing tests + typecheck + lint + generators --check**

Run: `cd marketing && npx tsc --noEmit && npm run lint && npm run llms:check` and from repo root `node scripts/generate-public-knowledge.mjs --check`
Expected: green.

- [ ] **Step 4: Render-verify the deadline on the dev server**

Start the marketing dev server (binds :3030/:3001 — confirm `<title>` contains "CapVeri"). Use `preview_snapshot` + `preview_eval` DOM-text (screenshots time out per the marketing-perfect playbook) to confirm the deadline line "Offer ends Friday, July 3." appears on the pricing page and in the nav banner. Render-verify the app pricing/checkout deadline line likewise.

- [ ] **Step 5: Code review + merge**

Invoke `superpowers:requesting-code-review` (or `review-merge`). Fix every flagged issue, re-run impacted tests, then `git merge --no-ff` into local `master`, push `origin master`. Verify `capveri-api`, `capveri-app`, `capveri-marketing` Workers reach 100% current version. Live-verify on www.capveri.com that the deadline shows and the offer still applies (pre-deadline).

---

## Self-Review notes

- **Spec coverage:** registry (T1-3), endsAt enforcement endpoint (T5) + checkout (T6), CF drift guard (T4), config/hook plumbing (T7), deadline display marketing (T8) + app (T9) + terms/machine files (T10), copy gates (T11), verification + deploy (T12). All spec sections covered.
- **Type consistency:** new fields named `ends_at`/`ends_at_display` (snake_case) on backend types + API payloads; `endsAt`/`endsAtDisplay` (camelCase) in JSON/TS config + generated TS. Display label `launchOfferEndsLabel` (public-knowledge) → `endsLabel` (config wrapper). Helpers: `isPastDeadline`, `expiredLaunchPhase`, `fallbackLaunchPhase`.
- **Open implementation detail:** the exact test-harness clock/Stripe-mock pattern in `billing-routes.test.ts` must be read and mirrored (Tasks 5-6) rather than assumed.
