# Story 24.6: Verify UI Components & Design System (Epic 1)

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 3 hours
**Status**: `pending`
**Dependencies**: Epic 1

---

## User Story

As a **frontend developer**,
I want to **verify that all Shadcn/UI components render correctly and are accessible**,
So that **the UI is consistent, usable, and meets accessibility standards**.

---

## Acceptance Criteria

### Component Functionality
- [ ] All Shadcn/UI components render without errors
- [ ] Button component has all variants (default, destructive, outline, ghost, link)
- [ ] Form components handle validation correctly
- [ ] DataTable supports sorting, pagination, and row selection
- [ ] Modal/Dialog components trap focus correctly
- [ ] Toast notifications display and dismiss correctly
- [ ] Loading states (Skeleton, Spinner, Progress) render correctly
- [ ] Error boundaries catch errors and display fallback UI
- [ ] Empty states display helpful messages

### Design Tokens
- [ ] CSS custom properties are defined correctly
- [ ] Tailwind theme extends base config
- [ ] Brand colors are used consistently (#1a56db primary)
- [ ] Border radius is consistent (0.625rem = 10px)
- [ ] Focus styles are visible and consistent

### Accessibility
- [ ] All interactive elements are keyboard accessible
- [ ] Focus indicators are visible
- [ ] ARIA labels are present where needed
- [ ] Color contrast meets WCAG AA standards
- [ ] Screen readers can navigate the UI

### Responsiveness
- [ ] Components adapt to mobile, tablet, and desktop viewports
- [ ] Text is readable at all sizes
- [ ] Touch targets are at least 44x44px on mobile

---

## Technical Specifications

### Visual Regression Test

```typescript
// frontend/tests/visual-regression.test.ts
import { test, expect } from '@playwright/test';

test.describe('Component Visual Regression', () => {
  test('Button variants render correctly', async ({ page }) => {
    await page.goto('/storybook?path=/story/components-button--all-variants');
    await expect(page).toHaveScreenshot('button-variants.png');
  });

  test('Form components render correctly', async ({ page }) => {
    await page.goto('/storybook?path=/story/components-form--all-fields');
    await expect(page).toHaveScreenshot('form-components.png');
  });

  test('DataTable renders correctly', async ({ page }) => {
    await page.goto('/storybook?path=/story/components-datatable--with-data');
    await expect(page).toHaveScreenshot('datatable.png');
  });
});
```

### Accessibility Audit

```typescript
// frontend/tests/accessibility.test.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Audit', () => {
  test('Home page has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Form components are accessible', async ({ page }) => {
    await page.goto('/properties/new');
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('#property-form')
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Modal is keyboard accessible', async ({ page }) => {
    await page.goto('/properties');
    await page.click('button:has-text("Add Property")');

    // Verify focus is trapped in modal
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).not.toBe('BODY');

    // Verify Escape closes modal
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });
});
```

### Responsive Design Test

```typescript
// frontend/tests/responsive.test.ts
import { test, expect, devices } from '@playwright/test';

const viewports = [
  { name: 'Mobile', device: devices['iPhone 12'] },
  { name: 'Tablet', device: devices['iPad Pro'] },
  { name: 'Desktop', device: { viewport: { width: 1920, height: 1080 } } },
];

viewports.forEach(({ name, device }) => {
  test.describe(`Responsive - ${name}`, () => {
    test.use(device);

    test('Sidebar adapts to viewport', async ({ page }) => {
      await page.goto('/');

      if (name === 'Mobile') {
        // On mobile, sidebar should be hidden initially
        await expect(page.locator('nav[role="navigation"]')).not.toBeVisible();

        // Click hamburger to open
        await page.click('button[aria-label="Open menu"]');
        await expect(page.locator('nav[role="navigation"]')).toBeVisible();
      } else {
        // On tablet/desktop, sidebar should be visible
        await expect(page.locator('nav[role="navigation"]')).toBeVisible();
      }
    });

    test('DataTable adapts to viewport', async ({ page }) => {
      await page.goto('/properties');

      if (name === 'Mobile') {
        // On mobile, table should show card view
        await expect(page.locator('.data-table-card-view')).toBeVisible();
      } else {
        // On tablet/desktop, table should show table view
        await expect(page.locator('table')).toBeVisible();
      }
    });
  });
});
```

### Design Token Verification

```typescript
// frontend/tests/design-tokens.test.ts
import { test, expect } from '@playwright/test';

test('Design tokens are applied correctly', async ({ page }) => {
  await page.goto('/');

  // Verify brand color
  const primaryButton = page.locator('button.bg-primary');
  const bgColor = await primaryButton.evaluate(
    (el) => getComputedStyle(el).backgroundColor
  );
  expect(bgColor).toBe('rgb(26, 86, 219)'); // #1a56db

  // Verify border radius
  const card = page.locator('.rounded-lg').first();
  const borderRadius = await card.evaluate(
    (el) => getComputedStyle(el).borderRadius
  );
  expect(borderRadius).toBe('10px'); // 0.625rem

  // Verify font sizes
  const heading = page.locator('h1').first();
  const fontSize = await heading.evaluate(
    (el) => getComputedStyle(el).fontSize
  );
  expect(parseInt(fontSize)).toBeGreaterThan(24); // Headings should be large
});
```

### Component Test Coverage

```bash
# Run frontend tests
cd frontend
npm test

# Should show high coverage for all components
# - Button: 100%
# - Form: 100%
# - DataTable: 100%
# - Modal: 100%
# - Toast: 100%
# - etc.
```

---

## Files to Audit

### Components (Epic 1)
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/form.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/select.tsx`
- `frontend/src/components/ui/checkbox.tsx`
- `frontend/src/components/ui/data-table.tsx`
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/components/ui/toast.tsx`
- `frontend/src/components/ui/skeleton.tsx`
- `frontend/src/components/ui/spinner.tsx`
- `frontend/src/components/ui/progress.tsx`
- `frontend/src/components/ui/error-boundary.tsx`
- `frontend/src/components/ui/empty-state.tsx`

### Layout Components
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/PageHeader.tsx`

### Theme Configuration
- `frontend/tailwind.config.ts`
- `frontend/src/index.css`

### Tests
- `frontend/tests/components/*.test.tsx`
- `frontend/tests/visual-regression.test.ts`
- `frontend/tests/accessibility.test.ts`

---

## Definition of Done

- [ ] All component tests pass
- [ ] Visual regression tests pass (or screenshots updated if intentional changes)
- [ ] Accessibility audit passes with 0 violations
- [ ] Responsive tests pass on mobile, tablet, and desktop
- [ ] Design tokens are applied consistently
- [ ] All components are keyboard accessible
- [ ] Focus indicators are visible
- [ ] Color contrast meets WCAG AA
- [ ] Touch targets are at least 44x44px on mobile
- [ ] Any visual inconsistencies are fixed

---

## Notes

- Use **Playwright** for E2E and visual regression tests
- Use **axe-core** for accessibility auditing
- Test on **real devices** when possible (not just emulators)
- Document any design system violations found
- Consider creating a **Storybook** for component documentation

---

*Created: 2025-12-30*
*Status: pending*
