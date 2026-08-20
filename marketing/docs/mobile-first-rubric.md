# Marketing Mobile-First Rubric

50–90% of capveri.com / camaudit.io traffic is mobile. Every page, component, and
button on the marketing site must pass this rubric before merging. Reviewer
agents enforce it; the Playwright `mobile-*.spec.ts` suite catches regressions
in CI; the vitest `mobile-first-patterns.test.ts` blocks the worst offenders
at the source.

## Tested viewports

- 360 × 640 - small Android (worst case in production)
- 390 × 844 - iPhone 13/14 (Playwright `mobile-iphone` project)
- 412 × 915 - Pixel 7 (Playwright `mobile-android` project)
- 768 × 1024 - iPad portrait (transition into tablet layout)

No route may produce horizontal scroll at any of these widths.

## Rules

1. **Tap targets ≥ 44 × 44 px** for every interactive element outside of inline
   prose (button, icon button, link, form control). Wrap small icons in `p-2.5`
   or upgrade to `h-icon w-icon`. Inline links inside `<p>/<li>/<h*>` are
   exempt - line height makes 44 px impractical there.
2. **Body text ≥ 16 px on mobile** to prevent iOS zoom-on-focus. `text-xs` is
   reserved for badges, microcopy, table cells. Never on `<p>` or `<li>` body
   copy.
3. **Headlines responsive.** Minimum gating `text-3xl sm:text-4xl lg:text-6xl`,
   or prefer the `text-fluid-*` clamp tokens in `tailwind.config.ts`. No raw
   `text-6xl` at base.
4. **No fixed pixel widths ≥ 300 px on layout containers.** Replace
   `w-[400px]` with `w-full max-w-[400px]` or breakpoint-gate it
   (`sm:w-[400px]`). Inline `style={{ width: 600 }}` is forbidden.
5. **Grids start at 1 column.** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`.
   `grid-cols-3+` at the base breakpoint is a bug.
6. **Data tables** wrap in `<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">`.
   Tables with ≥ 4 columns must also ship a stacked card variant for mobile
   (use the `MobileDataCards` helper once introduced, or render cards via a
   `md:hidden` block + the table inside a `hidden md:block`).
7. **No hover-only affordances on critical disclosures.** If hover reveals
   something, focus and tap must reveal it too. The shared megamenu pattern in
   `MarketingNav.tsx` already does this via `group-focus-within`; mirror it.
8. **CTAs full-width on mobile.** Primary hero/CTA buttons render
   `w-full sm:w-auto`. CTA stacks use `flex flex-col gap-3 sm:flex-row`.
9. **Forms.**
   - Inputs/selects: minimum `h-11` (44 px) on mobile.
   - Always set `autoComplete` (and `inputMode` for numeric/email/tel/url).
   - Label above the field. Placeholder is hint, not label.
   - Submit button `w-full sm:w-auto`.
10. **Page padding.** Every page-level container uses `px-4 sm:px-6 lg:px-8`.
    Never `px-8` at base.
11. **Safe area for sticky elements.** Pages must reserve `pb-24` of bottom
    padding so the floating AI SDR launcher and any sticky CTAs don't cover
    primary content.
12. **Images.** Use `next/image` with `sizes` set (e.g.
    `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`). Never
    a raw `<img>` with fixed `width`/`height` styling at full-bleed.
13. **Content parity.** Anything in `hidden md:block` must have an equivalent
    in the mobile flow. Anything in `md:hidden` must keep all essential info,
    not just a degraded shadow.
14. **Reduced motion.** Animations honor `prefers-reduced-motion`. Use the
    Tailwind `motion-safe:` and `motion-reduce:` variants for non-essential
    transitions.
15. **Lighthouse mobile** on representative routes:
    - Performance ≥ 85, Accessibility = 100, LCP < 2.5s on simulated 4G.

## Workflow for reviewers

Run, in order:

```bash
cd marketing
npm run typecheck
npm run lint
npm test                    # vitest, includes mobile-first-patterns.test.ts
npm run test:mobile         # Playwright mobile-iphone + mobile-android projects
```

Then open the changed routes locally at 360 px and 390 px in
`playwright-cli` or Chrome devtools and confirm:

- No horizontal scrollbar.
- Hamburger menu opens, closes (X, backdrop, ESC), and shows every nav link.
- Hero / primary CTA is reachable above the fold (no need to scroll past a
  full-screen hero image).
- Long tables stack into cards (or scroll with a sticky first column +
  visible "scroll for more" affordance).
- No focusable element fails the 44 px tap-target check.

Pages that don't appear in the curated route list in `mobile-smoke.spec.ts`
are still in scope - that list is a smoke layer, not a full sweep.
