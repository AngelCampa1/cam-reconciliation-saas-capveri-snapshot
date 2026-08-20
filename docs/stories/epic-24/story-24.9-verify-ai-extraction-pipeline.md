# Story 24.9: Verify AI Extraction Pipeline (Epics 14-16)

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 6 hours
**Status**: `pending`
**Dependencies**: Epics 14, 15, 16

---

## User Story

As a **CAM accountant**,
I want to **verify that the AI extraction pipeline correctly extracts lease terms from PDF documents**,
So that **I can save time entering lease data manually**.

---

## Acceptance Criteria

### OCR Pipeline (Epic 14)
- [ ] document reader extracts text from PDF lease documents
- [ ] Table extraction works correctly
- [ ] Bounding box coordinates are accurate
- [ ] OCR results are persisted to database
- [ ] Job polling handles async document reader jobs

### LLM Extraction (Epic 15)
- [ ] Claude extracts base year from lease
- [ ] Claude extracts pro-rata share from lease
- [ ] Claude extracts cap type and cap rate from lease
- [ ] Claude extracts admin fee percentage from lease
- [ ] Confidence scoring flags low-confidence extractions
- [ ] Validation layer catches invalid values

### HITL Verification UI (Epic 16)
- [ ] PDF viewer renders lease documents
- [ ] Split-screen layout shows PDF and extracted fields side-by-side
- [ ] Bounding boxes highlight extracted text in PDF
- [ ] Click on field navigates to corresponding location in PDF
- [ ] User can edit extracted values
- [ ] Auto-save works correctly
- [ ] Approval workflow creates lease record
- [ ] Reject workflow allows re-extraction

### Integration
- [ ] Upload PDF → OCR → LLM → HITL → Lease creation works end-to-end
- [ ] Confidence indicators show extraction quality
- [ ] Low-confidence fields are flagged for review
- [ ] Approved extractions create valid lease records

---

## Technical Specifications

### E2E AI Extraction Test

```typescript
// frontend/tests/e2e/ai-extraction.spec.ts
import { test, expect } from '@playwright/test';

test.describe('AI Extraction Pipeline', () => {
  test.use({ storageState: 'auth-state.json' });

  test('Complete PDF extraction workflow', async ({ page }) => {
    // 1. Upload lease PDF
    await page.goto('/leases/new');
    await page.locator('input[type="file"]').setInputFiles('tests/fixtures/sample_commercial_lease.pdf');

    // Should show upload progress
    await expect(page.locator('text=Uploading')).toBeVisible();

    // Should trigger OCR
    await expect(page.locator('text=Processing document')).toBeVisible({ timeout: 30000 });

    // Should trigger LLM extraction
    await expect(page.locator('text=Extracting lease terms')).toBeVisible();

    // Should redirect to HITL verification
    await expect(page.locator('text=Verify Extraction'), { timeout: 60000 }).toBeVisible();

    // 2. Verify extraction UI
    // PDF should be visible
    await expect(page.locator('.pdf-viewer')).toBeVisible();

    // Extracted fields should be visible
    await expect(page.locator('input[name="baseYear"]')).toBeVisible();
    await expect(page.locator('input[name="proRataShare"]')).toBeVisible();
    await expect(page.locator('select[name="capType"]')).toBeVisible();

    // Confidence indicators should be visible
    await expect(page.locator('.confidence-indicator')).toBeVisible();

    // 3. Click on field to navigate PDF
    await page.click('input[name="baseYear"]');

    // PDF should scroll to highlighted region
    await page.waitForTimeout(500); // Wait for scroll animation
    await expect(page.locator('.bounding-box-highlight')).toBeVisible();

    // 4. Edit field value
    const baseYearInput = page.locator('input[name="baseYear"]');
    await baseYearInput.fill('2023');

    // Should auto-save
    await expect(page.locator('text=Saved')).toBeVisible({ timeout: 2000 });

    // 5. Approve extraction
    await page.click('button:has-text("Approve")');

    // Should show confirmation dialog
    await expect(page.locator('text=Create lease with these values?')).toBeVisible();
    await page.click('button:has-text("Confirm")');

    // Should create lease and redirect
    await expect(page.locator('text=Lease created')).toBeVisible();
    await expect(page).toHaveURL(/\/leases\/.+/);

    // 6. Verify lease was created correctly
    const baseYear = await page.locator('text=Base Year').locator('..').locator('dd').textContent();
    expect(baseYear).toBe('2023');
  });

  test('Low-confidence fields are flagged', async ({ page }) => {
    // Upload PDF with ambiguous lease terms
    await page.goto('/leases/new');
    await page.locator('input[type="file"]').setInputFiles('tests/fixtures/ambiguous_lease.pdf');

    // Wait for extraction
    await expect(page.locator('text=Verify Extraction'), { timeout: 60000 }).toBeVisible();

    // Low-confidence fields should be flagged
    const lowConfidenceFields = await page.locator('.confidence-indicator.low').count();
    expect(lowConfidenceFields).toBeGreaterThan(0);

    // Should show warning message
    await expect(page.locator('text=Some fields have low confidence')).toBeVisible();
  });

  test('Reject workflow allows re-extraction', async ({ page }) => {
    await page.goto('/verification/test-extraction-id');

    // Click reject button
    await page.click('button:has-text("Reject")');

    // Should show reject dialog
    await expect(page.locator('text=Why are you rejecting')).toBeVisible();
    await page.fill('textarea[name="reason"]', 'Incorrect base year extraction');
    await page.click('button:has-text("Submit")');

    // Should mark extraction as rejected
    await expect(page.locator('text=Extraction rejected')).toBeVisible();

    // User should be able to re-upload or manually enter data
    await expect(page.locator('button:has-text("Upload New PDF")')).toBeVisible();
    await expect(page.locator('button:has-text("Enter Manually")')).toBeVisible();
  });
});
```

### OCR Accuracy Test

```python
# backend/tests/integration/test_ocr_accuracy.py
import pytest
from app.services.extraction.ocr import document readerClient

@pytest.mark.integration
async def test_document_reader_extracts_lease_correctly():
    """Verify document reader extracts all key fields from sample lease."""
    client = document readerClient()

    # Upload sample lease PDF
    with open("tests/fixtures/sample_commercial_lease.pdf", "rb") as f:
        result = await client.extract_document(f)

    # Verify text extraction
    extracted_text = result.get_full_text()
    assert "Base Year: 2022" in extracted_text
    assert "Pro-Rata Share: 5.0%" in extracted_text
    assert "Administrative Fee: 15%" in extracted_text

    # Verify table extraction
    tables = result.get_tables()
    assert len(tables) > 0

    # Verify bounding boxes
    blocks = result.get_blocks()
    base_year_blocks = [b for b in blocks if "Base Year" in b.text]
    assert len(base_year_blocks) > 0
    assert base_year_blocks[0].bounding_box is not None
```

### LLM Extraction Accuracy Test

```python
# backend/tests/integration/test_llm_extraction_accuracy.py
import pytest
from app.services.extraction.llm import LeaseExtractionOrchestrator

@pytest.mark.integration
async def test_claude_extracts_financial_dna_correctly():
    """Verify Claude extracts all financial DNA fields with high confidence."""
    orchestrator = LeaseExtractionOrchestrator()

    # Use sample lease with known values
    result = await orchestrator.extract("tests/fixtures/sample_commercial_lease.pdf")

    # Verify extracted values match expected
    assert result.base_year == 2022
    assert result.pro_rata_share == 0.05  # 5%
    assert result.cap_type == "cumulative"
    assert result.cap_rate == 0.03  # 3%
    assert result.admin_fee_percent == 0.15  # 15%

    # Verify confidence scores
    assert result.confidence_scores["base_year"] > 0.9
    assert result.confidence_scores["pro_rata_share"] > 0.9
    assert result.confidence_scores["cap_type"] > 0.8

    # Verify no validation errors
    assert len(result.validation_errors) == 0
```

### Confidence Scoring Test

```python
# backend/tests/test_confidence_scoring.py
import pytest
from app.services.extraction.confidence import calculate_confidence

def test_confidence_flags_low_confidence_extractions():
    """Verify low-confidence extractions are flagged for review."""
    extraction = {
        "base_year": {"value": 2022, "confidence": 0.95},
        "pro_rata_share": {"value": 0.05, "confidence": 0.60},  # Low
        "cap_type": {"value": "cumulative", "confidence": 0.85},
    }

    result = calculate_confidence(extraction)

    assert result.overall_confidence == 0.80  # Weighted average
    assert result.requires_review is True  # Because pro_rata_share < 0.8
    assert "pro_rata_share" in result.flagged_fields
```

---

## Files to Audit

### OCR (Epic 14)
- `backend/app/services/extraction/ocr/document_reader_client.py`
- `backend/app/services/extraction/ocr/document_handler.py`
- `backend/app/services/extraction/ocr/job_poller.py`
- `backend/app/services/extraction/ocr/result_parser.py`

### LLM Extraction (Epic 15)
- `backend/app/services/extraction/llm/anthropic_client.py`
- `backend/app/services/extraction/llm/prompts.py`
- `backend/app/services/extraction/llm/orchestrator.py`
- `backend/app/services/extraction/llm/confidence_scoring.py`
- `backend/app/services/extraction/llm/validation.py`

### HITL UI (Epic 16)
- `frontend/src/features/verification/PDFViewer.tsx`
- `frontend/src/features/verification/VerificationLayout.tsx`
- `frontend/src/features/verification/BoundingBoxOverlay.tsx`
- `frontend/src/features/verification/EditableField.tsx`
- `frontend/src/features/verification/ApprovalDialog.tsx`
- `frontend/src/features/verification/RejectDialog.tsx`

---

## Definition of Done

- [ ] E2E extraction workflow test passes (PDF → OCR → LLM → HITL → Lease)
- [ ] OCR extracts text accurately from sample lease
- [ ] LLM extracts all financial DNA fields with >90% confidence
- [ ] Low-confidence fields are flagged for review
- [ ] HITL UI allows user to edit and approve extractions
- [ ] Bounding box overlay highlights extracted text correctly
- [ ] Click-to-navigate works (field → PDF location)
- [ ] Auto-save works correctly
- [ ] Approval creates valid lease record
- [ ] Reject workflow works correctly
- [ ] Any extraction accuracy issues are documented

---

## Notes

- This epic requires **AWS credentials** for document reader and **Anthropic API key** for Claude
- Use **real sample lease PDF** from Epic 8 fixtures
- Verify **Zero Data Retention** (ZDR) is configured for Anthropic API
- Test with **multiple lease formats** (different vendors, templates)
- Document any extraction patterns that need improvement

---

*Created: 2025-12-30*
*Status: pending*
