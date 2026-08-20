# Story 24.8: Verify Data Ingestion & Reconciliation UI (Epics 11-12)

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 6 hours
**Status**: `pending`
**Dependencies**: Epics 11, 12

---

## User Story

As a **CAM accountant**,
I want to **verify that the data ingestion UI and reconciliation grid work correctly**,
So that **I can upload GL data and view reconciliation results with confidence**.

---

## Acceptance Criteria

### Data Ingestion UI (Epic 11)
- [ ] File uploader accepts drag-and-drop
- [ ] Upload progress displays correctly
- [ ] Source system is auto-detected and displayed
- [ ] Column mapping wizard works for generic CSVs
- [ ] Import history shows all past imports
- [ ] Import errors are displayed with details
- [ ] GL entry preview shows imported data
- [ ] File validation errors are shown before upload

### Reconciliation Grid UI (Epic 12)
- [ ] Grid renders large datasets (10,000+ rows) smoothly
- [ ] Virtual scrolling works correctly
- [ ] Cell renderers display correct data types (currency, dates, percentages)
- [ ] Sorting works on all columns
- [ ] Column configuration allows show/hide columns
- [ ] Expense pool grouping collapses/expands correctly
- [ ] Tenant summary view shows aggregated data
- [ ] Calculation trace drawer shows step-by-step details
- [ ] Calculate button triggers reconciliation
- [ ] Finalize workflow locks snapshot

### Integration
- [ ] Uploaded GL data flows to reconciliation grid
- [ ] Calculate button uses uploaded data
- [ ] Reconciliation results are saved to backend
- [ ] Grid updates optimistically during edits

---

## Technical Specifications

### E2E Ingestion UI Test

```typescript
// frontend/tests/e2e/ingestion-ui.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Data Ingestion UI', () => {
  test.use({ storageState: 'auth-state.json' });

  test('Complete file upload workflow', async ({ page }) => {
    await page.goto('/ingestion');

    // 1. Drag and drop file
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/yardi/yardi_gl_sample.csv');

    // Should show upload progress
    await expect(page.locator('text=Uploading')).toBeVisible();

    // Should complete upload
    await expect(page.locator('text=Upload complete'), { timeout: 10000 }).toBeVisible();

    // Should detect source system
    await expect(page.locator('text=Yardi Voyager')).toBeVisible();

    // 2. View import history
    await page.click('text=Import History');
    await expect(page.locator('text=yardi_gl_sample.csv')).toBeVisible();
    await expect(page.locator('text=513 rows')).toBeVisible();

    // 3. Preview GL entries
    await page.click('text=View Entries');
    await expect(page.locator('text=GL Entry Preview')).toBeVisible();

    // Should show data table with entries
    const rows = await page.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(0);

    // Should allow search
    await page.fill('input[placeholder="Search"]', '6000');
    await expect(page.locator('text=6000')).toBeVisible();
  });

  test('Generic CSV with column mapping', async ({ page }) => {
    await page.goto('/ingestion');

    // Upload generic CSV
    await page.locator('input[type="file"]').setInputFiles('tests/fixtures/generic/custom_columns.csv');

    // Should open column mapping wizard
    await expect(page.locator('text=Map Columns')).toBeVisible();

    // Map columns
    await page.selectOption('select[data-field="account_number"]', 'Account');
    await page.selectOption('select[data-field="amount"]', 'Debit');
    await page.selectOption('select[data-field="transaction_date"]', 'Date');

    await page.click('button:has-text("Save Mapping")');

    // Should complete import
    await expect(page.locator('text=Import complete')).toBeVisible();
  });

  test('Error handling for malformed files', async ({ page }) => {
    await page.goto('/ingestion');

    // Upload malformed file
    await page.locator('input[type="file"]').setInputFiles('tests/fixtures/malformed/encoding_invalid_utf8.csv');

    // Should show error message
    await expect(page.locator('text=encoding error')).toBeVisible();

    // Should not create import batch
    await page.click('text=Import History');
    await expect(page.locator('text=encoding_invalid_utf8.csv')).not.toBeVisible();
  });
});
```

### E2E Reconciliation Grid Test

```typescript
// frontend/tests/e2e/reconciliation-grid.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Reconciliation Grid UI', () => {
  test.use({ storageState: 'auth-state.json' });

  test('Grid renders and is interactive', async ({ page }) => {
    // Setup: Create property with GL data
    await page.goto('/reconciliation/new');
    await page.selectOption('select[name="propertyId"]', 'test-property-id');
    await page.fill('input[name="periodStart"]', '2024-01-01');
    await page.fill('input[name="periodEnd"]', '2024-12-31');
    await page.click('button:has-text("Load Data")');

    // Should render grid
    await expect(page.locator('.reconciliation-grid')).toBeVisible();

    // Should show data
    const rows = await page.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(0);

    // 1. Test sorting
    await page.click('th:has-text("Account")');
    const firstCell = await page.locator('table tbody tr:first-child td:nth-child(1)').textContent();
    await page.click('th:has-text("Account")'); // Sort descending
    const newFirstCell = await page.locator('table tbody tr:first-child td:nth-child(1)').textContent();
    expect(firstCell).not.toBe(newFirstCell);

    // 2. Test column configuration
    await page.click('button[aria-label="Configure columns"]');
    await page.click('text=Hide Amount');
    await expect(page.locator('th:has-text("Amount")')).not.toBeVisible();

    // 3. Test expense pool grouping
    await page.click('button:has-text("Group by Pool")');
    await expect(page.locator('.expense-pool-group')).toBeVisible();
    await page.click('.expense-pool-group:first-child'); // Expand
    await expect(page.locator('.expense-pool-items')).toBeVisible();

    // 4. Test tenant summary
    await page.click('button:has-text("Tenant Summary")');
    await expect(page.locator('.tenant-summary-panel')).toBeVisible();
    await expect(page.locator('text=Tenant')).toBeVisible();
    await expect(page.locator('text=Billable Amount')).toBeVisible();

    // 5. Test calculation
    await page.click('button:has-text("Calculate")');
    await expect(page.locator('text=Calculating')).toBeVisible();
    await expect(page.locator('text=Calculation complete'), { timeout: 10000 }).toBeVisible();

    // 6. Test calculation trace
    await page.click('button:has-text("View Trace")');
    await expect(page.locator('.calculation-trace-drawer')).toBeVisible();
    await expect(page.locator('text=Occupancy Calculation')).toBeVisible();
    await expect(page.locator('text=Gross-Up Factor')).toBeVisible();

    // 7. Test finalize
    await page.click('button:has-text("Finalize")');
    await expect(page.locator('text=Are you sure')).toBeVisible();
    await page.click('button:has-text("Confirm")');
    await expect(page.locator('text=Snapshot finalized')).toBeVisible();

    // Grid should be read-only now
    await expect(page.locator('button:has-text("Calculate")')).toBeDisabled();
  });

  test('Virtual scrolling handles large datasets', async ({ page }) => {
    // Setup: Create property with 10,000 GL entries
    await page.goto('/reconciliation/large-dataset');

    // Should render grid without lag
    await expect(page.locator('.reconciliation-grid')).toBeVisible({ timeout: 5000 });

    // Scroll to bottom
    await page.evaluate(() => {
      const grid = document.querySelector('.reconciliation-grid');
      grid?.scrollTo(0, 999999);
    });

    // Should render bottom rows
    await page.waitForTimeout(500); // Wait for virtual scroll to render
    const lastRowIndex = await page.locator('table tbody tr:last-child td:first-child').textContent();
    expect(parseInt(lastRowIndex || '0')).toBeGreaterThan(9000);

    // Should not have performance issues
    const scrollStart = Date.now();
    await page.evaluate(() => {
      const grid = document.querySelector('.reconciliation-grid');
      for (let i = 0; i < 100; i++) {
        grid?.scrollBy(0, 100);
      }
    });
    const scrollDuration = Date.now() - scrollStart;
    expect(scrollDuration).toBeLessThan(2000); // Should scroll smoothly
  });
});
```

### Performance Test

```typescript
// frontend/tests/performance.test.ts
import { test, expect } from '@playwright/test';

test('Reconciliation grid performance', async ({ page }) => {
  await page.goto('/reconciliation/large-dataset');

  // Measure initial render time
  const renderStart = Date.now();
  await expect(page.locator('.reconciliation-grid')).toBeVisible();
  const renderDuration = Date.now() - renderStart;

  expect(renderDuration).toBeLessThan(3000); // Should render in <3s

  // Measure sorting performance
  const sortStart = Date.now();
  await page.click('th:has-text("Account")');
  await page.waitForTimeout(500); // Wait for re-render
  const sortDuration = Date.now() - sortStart;

  expect(sortDuration).toBeLessThan(1000); // Should sort in <1s
});
```

---

## Files to Audit

### Ingestion UI (Epic 11)
- `frontend/src/features/ingestion/FileUploader.tsx`
- `frontend/src/features/ingestion/UploadProgress.tsx`
- `frontend/src/features/ingestion/SourceDetection.tsx`
- `frontend/src/features/ingestion/ColumnMappingWizard.tsx`
- `frontend/src/features/ingestion/ImportHistoryList.tsx`
- `frontend/src/features/ingestion/ImportErrorDisplay.tsx`
- `frontend/src/features/ingestion/GLEntryPreview.tsx`

### Reconciliation Grid UI (Epic 12)
- `frontend/src/features/reconciliation/ReconciliationGrid.tsx`
- `frontend/src/features/reconciliation/CellRenderers.tsx`
- `frontend/src/features/reconciliation/ColumnConfiguration.tsx`
- `frontend/src/features/reconciliation/ExpensePoolGrouping.tsx`
- `frontend/src/features/reconciliation/TenantSummaryView.tsx`
- `frontend/src/features/reconciliation/CalculationTraceDrawer.tsx`
- `frontend/src/features/reconciliation/FinalizeWorkflow.tsx`

---

## Definition of Done

- [ ] All ingestion UI tests pass
- [ ] All reconciliation grid tests pass
- [ ] Virtual scrolling handles 10,000+ rows smoothly
- [ ] Drag-and-drop file upload works
- [ ] Column mapping wizard works for generic CSVs
- [ ] Source detection correctly identifies Yardi/MRI files
- [ ] Sorting, filtering, and grouping work correctly
- [ ] Calculation trace shows complete step-by-step details
- [ ] Finalize workflow locks snapshot correctly
- [ ] Performance benchmarks pass (<3s render, <1s sort)
- [ ] Any UI/UX issues found are fixed

---

## Notes

- Test with **large datasets** (10,000+ rows) to verify virtual scrolling
- Use **Playwright** for E2E tests
- Measure **performance** with Chrome DevTools
- Document any grid optimization opportunities

---

*Created: 2025-12-30*
*Status: pending*
