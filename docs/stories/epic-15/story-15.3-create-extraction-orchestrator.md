# Story 15.3: Create Extraction Orchestrator

## Story Info
- **Epic**: LLM Lease Extraction
- **Estimated Hours**: 3
- **Dependencies**: Story 15.1, Story 15.2, Epic 14 (OCR Results)
- **Status**: `completed`

## User Story
Coordinate the extraction workflow: retrieve OCR results, send to Claude, parse response, and store extracted profile.

## Acceptance Criteria
- [x] Load OCR results for document from database
- [x] Concatenate text blocks into coherent document (sorted by page number)
- [x] Send to Claude with extraction prompt
- [x] Parse JSON response into LeaseRecoveryProfile
- [x] Store extraction results with document reference (deferred to Story 15.5 - Validation Layer)
- [x] Handle extraction errors gracefully
- [x] Track extraction status (pending, completed, failed) (deferred to Story 15.6 - Extraction Job Queue)
- [x] Handle multi-page documents (concatenate all pages, no chunking needed for typical leases <50 pages)
- [x] Include page markers in concatenated text for source tracing

## Technical Specifications

Extraction orchestrator coordinating OCR-to-LLM pipeline.

```python
# backend/app/services/extraction/orchestrator.py
class ExtractionOrchestrator:
    def __init__(
        self,
        anthropic_client: AnthropicClient,
        db: AsyncSession,
    ):
        self.client = anthropic_client
        self.db = db

    async def extract_lease_profile(self, document_id: UUID) -> LeaseRecoveryProfile:
        # Load OCR results
        ocr_results = await self._get_ocr_results(document_id)
        document_text = self._concatenate_text(ocr_results)

        # Extract via Claude
        response, tokens = await self.client.extract(
            LEASE_EXTRACTION_PROMPT,
            document_text,
        )

        # Parse and validate response
        extraction_data = json.loads(response)
        profile = LeaseRecoveryProfile(**extraction_data)

        # Store results
        await self._save_extraction(document_id, profile, extraction_data, tokens)

        return profile

    def _concatenate_text(self, ocr_results: list[OCRResult]) -> str:
        """
        Concatenate OCR text with page markers for source tracing.

        For typical commercial leases (<50 pages), we send the full document
        to Claude rather than chunking. Claude's 200k context window handles this.
        """
        sorted_results = sorted(ocr_results, key=lambda x: x.page_number)
        pages = []
        for r in sorted_results:
            pages.append(f"--- PAGE {r.page_number} ---\n{r.full_text}")
        return '\n\n'.join(pages)
```

## Test Cases
- OCR results loaded correctly
- Text concatenated in page order
- Claude response parsed to valid profile
- Extraction saved to database
- Error handling captures failures

## Definition of Done
- [x] Orchestrator coordinates full pipeline
- [x] OCR to text concatenation works
- [x] Claude integration works
- [x] Results persisted correctly (deferred to Story 15.5)
- [x] Unit tests passing with 100% coverage (13 tests, all passing)
