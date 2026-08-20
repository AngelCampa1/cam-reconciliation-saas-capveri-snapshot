# Audit: App Shell / Layout / Navigation + Buttons-to-Pills Inventory

Auditor domain: Layout, Navigation, PWA, Buttons-to-Pills
Codebase snapshot: 2026-05-28
Files read: `frontend/src/App.tsx`, `frontend/src/config/navigation.ts`, `frontend/src/components/layout/{Sidebar,BottomNav,Header,ScrollToTop,NavItem}.tsx`, `frontend/src/components/ErrorBoundary.tsx`, `frontend/src/components/pwa/OfflineIndicator.tsx`, `frontend/src/features/help/components/HelpDrawer.tsx`, `frontend/src/components/ui/button.tsx`, `frontend/src/generated/tokens.css`, `frontend/src/index.css`, plus 30+ page/component files for pill inventory.

---

## Part 1 — Layout / Navigation Audit

### Finding 1 — Dashboard nav item points to `/` instead of `/dashboard` (P1)

**File:** `frontend/src/config/navigation.ts:51`

```ts
{
  id: 'dashboard',
  label: 'Dashboard',
  icon: Home,
  href: '/',          // <-- routes to root, not /dashboard
}
```

The App.tsx root route is `<Route path="/" element={<Navigate to="/dashboard" replace />} />`, so navigation works incidentally via redirect — but the active-state logic in `Sidebar.tsx:307-309` marks the item active when `location.pathname === item.href || location.pathname.startsWith(item.href + '/')`. Since `item.href` is `'/'`, `startsWith('/' + '/')` means **every route** activates the Dashboard nav item simultaneously with its real item. Every authenticated page will show both Dashboard and the current page as active.

**Expected:** `href: '/dashboard'`
**Severity:** P1 — wrong active state on every authenticated page, confusing UX.
**Fix:** Change `href: '/'` to `href: '/dashboard'` in `navigation.ts`.

---

### Finding 2 — `/pools` route has no sidebar nav entry (orphan page) (P2)

**File:** `frontend/src/App.tsx:453-459`, `frontend/src/config/navigation.ts` (absent)

`PoolsPage` is a protected route at `/pools` but has no corresponding entry in either `mainNavigation` or `secondaryNavigation`. The BottomNav also has no "Pools" item. Users can only reach the page if something deep-links them to `/pools`.

**Expected:** A "Pools" nav item or at minimum a link from the Properties or Reconciliation pages.
**Severity:** P2 — feature exists but is unreachable through normal navigation.

---

### Finding 3 — `/portfolio/pipeline` is a nav child with no top-level standalone route guard mismatch (P2)

**File:** `frontend/src/config/navigation.ts:66-69`, `frontend/src/App.tsx:283-291`

The Portfolio > Pipeline child nav item points to `/portfolio/pipeline`. The route exists but it is wrapped in a plain `<ProtectedRoute>` (no `requiredRoles`), while the parent Portfolio nav item also has no `requiredRoles`. This is consistent and fine.
However, the parent `portfolio` nav item's `href` is `/portfolio`, which is a separate page (`PortfolioPage`). The child `portfolio-overview` also has `href: '/portfolio'`. Both the parent button and the first child link to the same route. Clicking the parent in collapsed mode navigates to `/portfolio`; clicking it in expanded mode opens the submenu — but since the parent's href IS `/portfolio`, after expanding the submenu the parent item itself has no distinct target. This creates a redundant hover UX that can confuse; the parent duplicates the child.

**Severity:** P2 — cosmetic/UX confusion (redundant parent+child pointing at same route).

---

### Finding 4 — `/cookies` route renders with the app shell (sidebar/header visible) (P2)

**File:** `frontend/src/App.tsx:128-142, 335`

`/privacy`, `/terms`, and `/compliance/ai-transparency` are all in `shelllessRoutes`, rendering without the app shell. But `/cookies` (the Cookie Policy page) is NOT in `shelllessRoutes` and is NOT covered by `shelllessPrefixes`. If an authenticated landlord user navigates to `/cookies`, they see the full sidebar and header over a public legal page.

**Expected:** `/cookies` added to `shelllessRoutes`.
**Severity:** P2 — authenticated users see full app shell on a public-content page.

---

### Finding 5 — BottomNav shows 4 primary routes, sidebar has many more — mismatch in key omissions (P2)

**File:** `frontend/src/components/layout/BottomNav.tsx:35-67`

BottomNav surfaces: Dashboard, Properties, Upload (`/ingestion`), Reconcile, More. Sidebar exposes additionally: Portfolio, Analysis (2 sub-routes), Documents (4 sub-routes), Disputes, Tax Protest, Certificates, Help, Settings/Admin. "More" opens the slide-in sidebar drawer (correct behavior). The main mismatch is that `Upload` in BottomNav maps to `/ingestion` ("Upload GL") whereas sidebar shows it labelled "Documents" with a parent item (`href: '/ingestion'`). The labels don't match ("Upload" vs "Documents / Upload GL"), which can confuse mobile users who expect the same vocabulary on both navs.

**Severity:** P2 — vocabulary mismatch between mobile bottom-nav and sidebar.

---

### Finding 6 — NavItem.tsx (`rounded-md`) and Sidebar NavItemButton (`rounded-lg`) are dead components or create a second nav system (P3)

**Files:** `frontend/src/components/layout/NavItem.tsx:86`, `frontend/src/components/layout/Sidebar.tsx:128`

There are **two** nav-item implementations:
1. `NavItem.tsx` + `NavItemList` — standalone component with `rounded-md`, exported from layout index, appears unused in the actual Sidebar.
2. `NavItemButton` inside `Sidebar.tsx` — what the Sidebar actually renders, with `rounded-lg`.

`NavItem.tsx` is not imported anywhere in `Sidebar.tsx`; the Sidebar has its own inline `NavItemButton`. This duplication means any fix to one doesn't propagate to the other.

**Severity:** P3 — dead code risk; both use non-pill radius on nav buttons (see Part 2).

---

### Finding 7 — Active state for parent nav items never auto-expands (P2)

**File:** `frontend/src/components/layout/Sidebar.tsx:296-317, 337-347`

`expandedIds` starts as an empty `Set`. When the user lands on `/analysis/year-over-year`, the `analysis` nav item's children are marked active (by `markActive`), but `expandedIds` will not contain `'analysis'` unless the user has manually clicked it. The parent "Analysis" item will show `isActive: true` (because `/analysis/year-over-year`.startsWith(`/analysis/year-over-year/`) is false but `=== href` for child items is true), but the children will be hidden behind a collapsed accordion.

Actually checking closer: the parent `analysis` item has `href: '/analysis/year-over-year'` — so when at `/analysis/year-over-year` the parent itself becomes active (`location.pathname === item.href`). But its children are inside an accordion that won't open unless the user has expanded it. So the child items never auto-expand to reveal what section is active.

**Expected:** On page load, if the current pathname matches a child href, the parent's ID should be added to `expandedIds`.
**Severity:** P2 — nav parent items with children don't auto-open on matching child route.

---

### Finding 8 — HelpDrawer "Open full help center" button navigates to `/help` which IS a shellless-excluded route BUT it is actually in the app shell (P3)

**File:** `frontend/src/features/help/components/HelpDrawer.tsx:119-123`

The `/help` route is a `<ProtectedRoute>` at `App.tsx:376-382`. It is NOT in `shelllessRoutes`, so it correctly renders with the sidebar/header. The `HelpDrawer` button links to it correctly. No real issue, just worth confirming.

**Severity:** P3 — no real issue, confirmed OK.

---

### Finding 9 — OfflineIndicator positioned at `bottom-20` on mobile but BottomNav is `h-14` (`pb-14`) — values don't align (P3)

**File:** `frontend/src/components/pwa/OfflineIndicator.tsx:34`

`OfflineIndicator` uses `bottom-20` (5rem = 80px) on mobile. The `<main>` element has `pb-14` (56px) for the BottomNav. The BottomNav itself is `fixed bottom-0` without an explicit height. `bottom-20` puts the offline banner roughly 24px above the bottom nav, which is reasonable, but was clearly a manual estimate — if BottomNav height changes, this will break.

**Severity:** P3 — fragile pixel offset, not a functional bug today.

---

### Finding 10 — TrialBillingBanner "Add Billing" link styled as a button with `rounded-md`, bypassing Button component (P3 / Part 2 overlap)

**File:** `frontend/src/App.tsx:797-802`

```tsx
<Link
  to="/settings/billing?intent=select-plan"
  className="inline-flex w-fit items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold..."
>
  Add Billing
</Link>
```

Uses `rounded-md` directly. Detailed in Part 2.

---

## Part 2 — Buttons-to-Pills Inventory

### Base Button Component Radius

**File:** `frontend/src/components/ui/button.tsx:9`
**Token:** `frontend/src/generated/tokens.css:15`

```css
--radius-button: 9999px;  /* pill = rounded-full */
```

```ts
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button ...'
)
```

**The base `Button` component is already pill-shaped** (`rounded-button` = `9999px`). No change needed to the base component itself.

The `--radius` CSS variable in `index.css:74` is `0.5rem` (rounded-md) and is used by many Shadcn primitives (dialogs, cards, etc.) — this is intentional and separate from the button pill mandate.

---

### (a) Base Button Component — Status

**No fix needed.** `button.tsx` already uses `rounded-button` which resolves to `9999px` (full pill). All `<Button>` instances in the app inherit the pill shape.

---

### (b) One-off buttons and Links-styled-as-buttons to fix

The following are clickable elements that do NOT use `<Button>` and either carry an explicit non-pill radius or carry no radius at all (raw `<button>` elements that should match the design system).

#### Priority: P3 — cosmetic radius violations on interactive elements

| # | File:Line | Element | Current Class | Issue |
|---|-----------|---------|---------------|-------|
| 1 | `frontend/src/App.tsx:797-802` | `<Link>` styled as CTA button (TrialBillingBanner "Add Billing") | `rounded-md` | Should use `<Button asChild>` with pill radius |
| 2 | `frontend/src/components/dashboard/ReconciliationStatusCard.tsx:160-163` | `<Link>` styled as button ("View All Reconciliations") | `rounded-lg` | Should use `<Button asChild variant="outline">` |
| 3 | `frontend/src/components/dashboard/QuickActionsCard.tsx:89-101` | `<Link>` items styled as interactive cards | `rounded-lg` | Non-pill card-style links; acceptable as card, not a CTA button |
| 4 | `frontend/src/pages/tools/AuditRiskQuiz.tsx:150-157` | `<Link>` guide links styled as bordered buttons | `rounded-lg` | Should use `<Button asChild variant="outline">` |
| 5 | `frontend/src/pages/tools/AuditRiskQuiz.tsx:212-222` | `<button>` quiz answer options | `rounded-lg` | Interactive selection button — should use pill or `<Button>` |
| 6 | `frontend/src/pages/Checkout.tsx:283-325` | `<button>` tier-selector cards | `rounded-lg` | Card-selection widget; rounded-lg is intentional card UI, debatable |
| 7 | `frontend/src/pages/Checkout.tsx:333-352` | `<button>` billing period toggle (Monthly/Annual) | `rounded-full` | Already pill — OK |
| 8 | `frontend/src/components/onboarding/ExportGuide.tsx:110-116` | `<button>` accordion trigger | `rounded-lg` | Functional control, should use `<Button variant="ghost">` or pill |
| 9 | `frontend/src/features/onboarding/steps/CompletionStep.tsx:137-152` | `<button>` "next step" navigation cards | `rounded-lg` | Card-style nav button, debatable |
| 10 | `frontend/src/features/reconciliation/components/TenantSummary.tsx:84-90` | `<button>` tenant row selector | `rounded-md` | Interactive selection — should match pill or use `<Button variant="ghost">` |
| 11 | `frontend/src/features/reconciliation/components/ReconciliationWorkflowStepper.tsx:114-128` | `<button>` stepper steps | `rounded-lg` | Step indicator buttons — should use pill |
| 12 | `frontend/src/pages/reconciliation/components/ReconciliationMobileView.tsx:52-70` | `<button>` filter chip | `rounded-full` | Already pill — OK |
| 13 | `frontend/src/pages/reconciliation/components/ReconciliationMobileView.tsx:199-205` | `<button>` clear search icon button | `rounded-full` | Already pill — OK |
| 14 | `frontend/src/features/tenant-portal/components/NotificationList.tsx:127-135` | `<button>` notification row | `rounded-lg` | Should use `<Button asChild variant="ghost">` or pill |
| 15 | `frontend/src/components/layout/NavItem.tsx:81-126` | `<button>` sidebar nav item (dead component, not rendered) | `rounded-md` | Dead code; if used, must be pill |
| 16 | `frontend/src/components/layout/Sidebar.tsx:125-195` | `<button>` NavItemButton (actual rendered nav button) | `rounded-lg` | Should use `rounded-button` token |
| 17 | `frontend/src/pages/resources/HelpCenter.tsx:92-103` | `<button>` FAQ accordion trigger | no explicit radius | No radius class — inherits browser default (0). Should add `rounded-button` |
| 18 | `frontend/src/components/ingestion/ImportHistoryList.tsx:265` | `<span>` badge-like label | `rounded-md` | Badge, not a CTA — use `rounded-full` for badge |
| 19 | `frontend/src/features/disputes/pages/DisputesListPage.tsx:192` | `<span>` status badge | `rounded-md` | Badge — use `rounded-full` |
| 20 | `frontend/src/features/tenant-portal/pages/TenantDisputesPage.tsx:139` | `<span>` status badge | `rounded-md` | Badge — use `rounded-full` |
| 21 | `frontend/src/pages/auth/LoginPage.tsx:205-214` | `<button>` show/hide password toggle | no rounded class | Inline icon button — add `rounded-button` or use `<Button size="icon" variant="ghost">` |
| 22 | `frontend/src/pages/auth/RegisterPage.tsx:216-225` | `<button>` show/hide password toggle | no rounded class | Same as above |
| 23 | `frontend/src/features/reconciliation/components/ReconciliationGrid.tsx:318-328` | `<button>` trace icon button | no rounded class | Icon-only button — use `<Button size="icon" variant="ghost">` |
| 24 | `frontend/src/features/help/components/HelpTip.tsx:22-33` | `<button>` tooltip trigger (help icon) | `rounded-full` | Already pill — OK |
| 25 | `frontend/src/features/tenant-portal/components/NotificationList.tsx:113-121` | `<button>` "Mark all read" text button | no rounded class | Text-style button — use `<Button variant="link">` |
| 26 | `frontend/src/features/plg/OnboardFlowWizard.tsx:90-96` | `<button>` "Exit demo" inline text link | no rounded class | Text action — use `<Button variant="link">` |
| 27 | `frontend/src/features/plg/OnboardFlowWizard.tsx:121-130` | `<button>` "Try with sample data →" | no rounded class | Text action — use `<Button variant="link">` |
| 28 | `frontend/src/pages/DashboardPage.tsx:346-350` | `<button>` "Retry" text link | no rounded class | Use `<Button variant="link">` |
| 29 | `frontend/src/pages/portfolio/PortfolioPage.tsx:332-337` | `<button>` "Retry" text link | no rounded class | Use `<Button variant="link">` |

#### Summary grouping

**Group A — Link styled as primary CTA (must be pill):**
- `App.tsx:799` — "Add Billing" (`rounded-md`) → `<Button asChild>`
- `ReconciliationStatusCard.tsx:162` — "View All" (`rounded-lg`) → `<Button asChild variant="outline">`
- `AuditRiskQuiz.tsx:150,156` — guide CTAs (`rounded-lg`) → `<Button asChild variant="outline">`

**Group B — `<button>` interactive selection widgets with explicit non-pill radius:**
- `AuditRiskQuiz.tsx:215` — quiz answers (`rounded-lg`)
- `TenantSummary.tsx:87` — tenant row selector (`rounded-md`)
- `NotificationList.tsx:130` — notification row (`rounded-lg`)
- `ReconciliationWorkflowStepper.tsx:118` — stepper buttons (`rounded-lg`)
- `CompletionStep.tsx:140` — next-step nav buttons (`rounded-lg`)
- `ExportGuide.tsx:113` — accordion toggle (`rounded-lg`)

**Group C — `<button>` with no radius (invisible inconsistency):**
- `LoginPage.tsx:205`, `RegisterPage.tsx:216` — show/hide password (icon buttons)
- `ReconciliationGrid.tsx:318` — trace icon button
- `HelpCenter.tsx:92` — FAQ accordion trigger
- `NotificationList.tsx:113`, `OnboardFlowWizard.tsx:90,121`, `DashboardPage.tsx:346`, `PortfolioPage.tsx:332` — text/link action buttons

**Group D — Sidebar nav buttons (structural):**
- `Sidebar.tsx:128` — `NavItemButton` uses `rounded-lg` for nav items; the design system token is `rounded-button` (9999px). Nav buttons are not pill-shaped today.
- `NavItem.tsx:86` — dead component, uses `rounded-md`

---

## Summary Table

| Sev | File:Line | Summary |
|-----|-----------|---------|
| P1 | `config/navigation.ts:51` | Dashboard nav `href: '/'` causes every page to mark Dashboard as active simultaneously |
| P2 | `App.tsx:453` + `navigation.ts` | `/pools` route is orphan — no sidebar or bottom-nav entry |
| P2 | `App.tsx:335` + `App.tsx:128-142` | `/cookies` route renders with full app shell for authenticated users; missing from `shelllessRoutes` |
| P2 | `Sidebar.tsx:296-317` + `Sidebar.tsx:337-347` | Nav parent items with children never auto-expand when landing on a child route |
| P2 | `BottomNav.tsx:35-67` + `navigation.ts` | "Upload" (bottom-nav) vs "Documents" (sidebar) label mismatch; vocabulary inconsistency on mobile |
| P2 | `navigation.ts:57-70` | Portfolio parent + child both `href: '/portfolio'`; parent nav button is redundant on expand |
| P3 | `App.tsx:799` | `<Link>` "Add Billing" uses `rounded-md`, not pill radius — should be `<Button asChild>` |
| P3 | `Sidebar.tsx:128` | All sidebar `NavItemButton` elements use `rounded-lg` instead of `rounded-button` (pill) |
| P3 | `ReconciliationStatusCard.tsx:162` | `<Link>` "View All Reconciliations" uses `rounded-lg` — should be `<Button asChild>` |
| P3 | `AuditRiskQuiz.tsx:150,156,215` | Two `<Link>` CTAs and one `<button>` quiz-answer button use `rounded-lg` |
| P3 | `TenantSummary.tsx:87` | `<button>` tenant selector uses `rounded-md` |
| P3 | `NotificationList.tsx:113,130` | "Mark all read" text button (no radius) and notification-row button (`rounded-lg`) |
| P3 | `ReconciliationWorkflowStepper.tsx:118` | Stepper `<button>` uses `rounded-lg` |
| P3 | `NavItem.tsx:86` | Dead nav component uses `rounded-md` (inconsistent with active Sidebar impl) |
| P3 | `LoginPage.tsx:205`, `RegisterPage.tsx:216` | Show/hide password `<button>` has no radius class |
| P3 | `ReconciliationGrid.tsx:318` | Trace icon `<button>` has no radius class |
| P3 | `OnboardFlowWizard.tsx:90,121` | Two inline text `<button>` elements have no radius class — use `<Button variant="link">` |
| P3 | `ExportGuide.tsx:113` | Accordion toggle `<button>` uses `rounded-lg` |
| P3 | `OfflineIndicator.tsx:34` | `bottom-20` offset is a fragile pixel estimate vs. BottomNav height |
| P3 | `CompletionStep.tsx:140` | Next-step nav `<button>` uses `rounded-lg` |
