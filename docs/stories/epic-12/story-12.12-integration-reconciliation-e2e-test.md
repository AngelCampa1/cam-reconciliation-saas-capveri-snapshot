# Story 12.12: INTEGRATION: Reconciliation E2E Test

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 4
- **Dependencies**: All Epic 12 stories
- **Status**: `pending`

## User Story
Create comprehensive end-to-end tests verifying the complete reconciliation grid workflow from data load to finalization.

## Acceptance Criteria
- [ ] Playwright test suite for reconciliation workflow
- [ ] Test: Load grid with sample property data
- [ ] Test: Navigate grid using keyboard
- [ ] Test: Edit cell and verify optimistic update
- [ ] Test: Trigger calculation and verify results
- [ ] Test: Open calculation trace drawer
- [ ] Test: Finalize reconciliation
- [ ] Test: Verify finalized grid is read-only
- [ ] All tests run in CI pipeline

## Technical Specifications

Playwright E2E test suite for reconciliation grid.

```typescript
// e2e/reconciliation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Reconciliation Grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reconciliation/property-123?year=2024');
    await page.waitForSelector('[data-testid="reconciliation-grid"]');
  });

  test('loads grid with data', async ({ page }) => {
    const rows = page.locator('[data-testid="grid-row"]');
    await expect(rows).toHaveCount.greaterThan(0);
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    const focused = page.locator('[data-focused="true"]');
    await expect(focused).toBeVisible();
  });

  test('edit cell with optimistic update', async ({ page }) => {
    const cell = page.locator('[data-testid="editable-cell"]').first();
    await cell.dblclick();
    await page.keyboard.type('1500.00');
    await page.keyboard.press('Enter');
    await expect(cell).toContainText('$1,500.00');
  });
});
```

## Test Cases
- Grid loads with fixture data
- Keyboard navigation functions correctly
- Cell editing triggers optimistic update
- Calculate button triggers API and refreshes
- Finalize workflow completes successfully
- Read-only mode enforced after finalization

## Definition of Done
- [ ] Playwright tests written for all workflows
- [ ] Tests pass locally
- [ ] Tests integrated into CI pipeline
- [ ] Test fixtures created for sample data
- [ ] All E2E scenarios covered
