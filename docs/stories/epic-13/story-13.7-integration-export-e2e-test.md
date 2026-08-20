# Story 13.7: INTEGRATION: Export E2E Test

## Story Info
- **Epic**: Reporting & Export UI
- **Estimated Hours**: 4
- **Dependencies**: All Epic 13 stories
- **Status**: `pending`

## User Story
Create comprehensive end-to-end tests verifying the complete export workflow from format selection to file download.

## Acceptance Criteria
- [ ] Playwright test suite for export workflow
- [ ] Test: Open export panel from grid
- [ ] Test: Select PDF format and configure options
- [ ] Test: Preview PDF and verify content
- [ ] Test: Download PDF file
- [ ] Test: Batch export multiple tenants
- [ ] Test: Configure and export ERP file
- [ ] Test: View export history and re-download
- [ ] All tests run in CI pipeline

## Technical Specifications

Playwright E2E test suite for export functionality.

```typescript
// e2e/export.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Export Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reconciliation/property-123?year=2024');
    await page.click('[data-testid="export-button"]');
  });

  test('exports single tenant PDF', async ({ page }) => {
    await page.click('[data-testid="format-pdf"]');
    await page.click('[data-testid="preview-button"]');
    await expect(page.locator('[data-testid="pdf-viewer"]')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-button"]'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test('batch exports to ZIP', async ({ page }) => {
    await page.click('[data-testid="format-pdf"]');
    await page.click('[data-testid="select-all-tenants"]');
    await page.click('[data-testid="export-mode-zip"]');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="batch-export-button"]'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test('exports ERP file', async ({ page }) => {
    await page.click('[data-testid="format-yardi"]');
    await expect(page.locator('[data-testid="erp-config"]')).toBeVisible();
    await page.click('[data-testid="export-erp-button"]');
  });
});
```

## Test Cases
- PDF export workflow complete
- Batch export creates ZIP file
- ERP export generates correct format
- Export history displays and allows re-download
- Variance report generates and exports

## Definition of Done
- [ ] Playwright tests written for all export workflows
- [ ] Tests pass locally
- [ ] Tests integrated into CI pipeline
- [ ] All export scenarios covered
- [ ] Download verification works
