# Story T2.3: Extraction Pipeline Integration

## Story Info
- **Epic**: T2 — CAM Statement Extraction
- **Estimated Hours**: 8
- **Dependencies**: T2.1 (CAM Statement Extraction Prompt), T2.2 (CAM Extraction Model and Validation)
- **Status**: `pending`

## User Story
As a tenant auditor, I want the CAM statement extraction prompt and models wired into the existing extraction pipeline so that uploading a CAM statement PDF triggers OCR, LLM extraction, validation, and confidence scoring end-to-end without additional manual steps.

## Acceptance Criteria
- `CamStatementOrchestrator` class follows the same pattern as `ExtractionOrchestrator` (dependency injection of `AnthropicClient` and `SupabaseDB`)
- `extract_cam_statement(document_id)` loads OCR results, concatenates pages, calls Claude with `CAM_STATEMENT_EXTRACTION_PROMPT`, parses JSON, validates with `CamStatementExtractionResult.model_validate()`, and returns the typed result
- JSON response parsing strips markdown code blocks (```json ... ```) before `json.loads()`
- Temperature is hardcoded to 0.0 for deterministic extraction
- `max_tokens` is set to 8192 (CAM statements produce larger JSON than lease extractions due to line items)
- Failed JSON parsing raises `ExtractionValidationError` with the raw response for debugging
- Failed Pydantic validation raises `ExtractionValidationError` with the parsed data for debugging
- Empty or whitespace-only OCR text raises `ExtractionError` (not sent to Claude)
- Cross-field validation warnings are returned alongside the result (not blocking)
- Confidence scoring uses `CAM_STATEMENT_FIELD_WEIGHTS` and `CAM_STATEMENT_CONFIDENCE_THRESHOLD`
- `calculate_cam_confidence()` function returns a `ConfidenceResult` for the CAM extraction
- Factory function `create_cam_statement_orchestrator()` exists for dependency injection
- Pipeline integration tested end-to-end with mocked `AnthropicClient` and `SupabaseDB`

## Technical Specifications

### Modifications to Existing Files

**`backend/app/services/extraction/__init__.py`** -- Add exports:

```python
from app.services.extraction.cam_statement_models import (
    CamAdjustments,
    CamStatementExtractionResult,
    CamTotals,
    ExpenseClassification,
    ExpenseLineItem,
    ReconciliationPeriod,
)
from app.services.extraction.cam_statement_orchestrator import (
    CamStatementOrchestrator,
    create_cam_statement_orchestrator,
)
from app.services.extraction.cam_statement_prompt import (
    CAM_STATEMENT_EXTRACTION_PROMPT,
)
```

### New File: `backend/app/services/extraction/cam_statement_orchestrator.py`

```python
"""
Extraction orchestrator for CAM reconciliation statement processing.

Coordinates the full pipeline:
  OCR results -> Claude (CAM prompt) -> CamStatementExtractionResult

Follows the same pattern as ExtractionOrchestrator for lease extraction,
but uses CAM-specific prompt, models, and confidence weights.
"""

import json
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from pydantic import ValidationError

from app.database.client import SupabaseDB
from app.models.ocr_result import OCRResult
from app.services.extraction.anthropic_client import AnthropicClient
from app.services.extraction.cam_statement_models import (
    CAM_STATEMENT_CONFIDENCE_THRESHOLD,
    CAM_STATEMENT_FIELD_WEIGHTS,
    CamExtractionWarning,
    CamStatementExtractionResult,
)
from app.services.extraction.cam_statement_prompt import (
    CAM_STATEMENT_EXTRACTION_PROMPT,
)
from app.services.extraction.confidence import ConfidenceResult
from app.services.extraction.orchestrator import (
    ExtractionError,
    ExtractionValidationError,
    OCRResultNotFoundError,
)

logger = logging.getLogger(__name__)


@dataclass
class CamExtractionPipelineResult:
    """Complete result from the CAM statement extraction pipeline.

    Bundles the extraction result with confidence scoring and
    cross-field validation warnings for downstream consumers.

    Attributes:
        extraction: Validated CamStatementExtractionResult.
        confidence: Confidence scoring result.
        warnings: Cross-field validation warnings.
        tokens_used: Total tokens consumed by the Claude API call.
    """

    extraction: CamStatementExtractionResult
    confidence: ConfidenceResult
    warnings: list[CamExtractionWarning]
    tokens_used: int


class CamStatementOrchestrator:
    """Coordinates CAM statement extraction from OCR results through Claude.

    This orchestrator manages the full extraction pipeline for CAM
    reconciliation statements:
    1. Load OCR results from database
    2. Concatenate multi-page text with page markers
    3. Send to Claude with CAM statement extraction prompt
    4. Parse and validate JSON response
    5. Run cross-field validation
    6. Calculate confidence scores
    7. Return typed result with warnings and confidence

    Example:
        ```python
        orchestrator = CamStatementOrchestrator(
            anthropic_client=anthropic_client,
            db=db_session,
        )
        pipeline_result = await orchestrator.extract_cam_statement(document_id)

        extraction = pipeline_result.extraction
        if pipeline_result.confidence.needs_review:
            print(f"Low confidence fields: {pipeline_result.confidence.low_confidence_fields}")
        for warning in pipeline_result.warnings:
            print(f"Warning: {warning.field} - {warning.message}")
        ```
    """

    # CAM statements produce larger JSON responses than lease extractions
    # due to the variable number of expense line items
    MAX_TOKENS = 8192

    def __init__(
        self,
        anthropic_client: AnthropicClient,
        db: SupabaseDB,
    ) -> None:
        """Initialize orchestrator with dependencies.

        Args:
            anthropic_client: Claude client for LLM extraction.
            db: Supabase client for OCR result queries.
        """
        self.client = anthropic_client
        self.db = db

    async def extract_cam_statement(
        self, document_id: UUID
    ) -> CamExtractionPipelineResult:
        """Extract CAM statement data from document OCR results.

        Full pipeline: OCR load -> text concatenation -> Claude extraction ->
        JSON parse -> Pydantic validation -> cross-field checks -> confidence.

        Args:
            document_id: UUID of the uploaded CAM statement document.

        Returns:
            CamExtractionPipelineResult with extraction, confidence,
            warnings, and token usage.

        Raises:
            OCRResultNotFoundError: If no OCR results found for document.
            ExtractionError: If OCR text is empty/whitespace.
            ExtractionValidationError: If Claude's response fails parsing or validation.

        Example:
            ```python
            result = await orchestrator.extract_cam_statement(doc_id)
            print(f"Tenant share: {result.extraction.totals.total_tenant_share}")
            print(f"Confidence: {result.confidence.overall_score:.1%}")
            print(f"Tokens used: {result.tokens_used}")
            ```
        """
        # Step 1: Load OCR results
        ocr_results = await self._get_ocr_results(document_id)

        if not ocr_results:
            raise OCRResultNotFoundError(
                f"No OCR results found for document {document_id}"
            )

        # Step 2: Validate content exists
        has_content = any(
            ocr.full_text and ocr.full_text.strip() for ocr in ocr_results
        )
        if not has_content:
            raise ExtractionError(
                f"No OCR text available for document {document_id}. "
                "OCR records exist but contain no text content."
            )

        # Step 3: Concatenate text with page markers
        document_text = self._concatenate_text(ocr_results)

        logger.info(
            f"Sending {len(document_text)} characters to Claude CAM extraction "
            f"for document {document_id}"
        )

        # Step 4: Call Claude with CAM statement prompt
        try:
            response_text, tokens_used = await self.client.extract(
                prompt=CAM_STATEMENT_EXTRACTION_PROMPT,
                document_text=document_text,
                max_tokens=self.MAX_TOKENS,
                temperature=0.0,
            )
        except Exception as e:
            raise ExtractionError(
                f"Claude API call failed for CAM statement {document_id}: {str(e)}"
            ) from e

        # Step 5: Parse JSON (strip markdown code blocks if present)
        extraction_data = self._parse_json_response(response_text)

        # Step 6: Validate against CamStatementExtractionResult schema
        extraction = self._validate_extraction(extraction_data)

        # Step 7: Cross-field validation (non-blocking warnings)
        warnings = extraction.validate_cross_fields()

        # Step 8: Calculate confidence scores
        confidence = calculate_cam_confidence(extraction)

        return CamExtractionPipelineResult(
            extraction=extraction,
            confidence=confidence,
            warnings=warnings,
            tokens_used=tokens_used,
        )

    def _parse_json_response(self, response_text: str) -> dict[str, Any]:
        """Parse Claude's response text as JSON, stripping markdown code blocks.

        Args:
            response_text: Raw text response from Claude.

        Returns:
            Parsed JSON as a dictionary.

        Raises:
            ExtractionValidationError: If response is not valid JSON.
        """
        cleaned_text = response_text.strip()

        # Strip markdown code blocks (```json ... ``` or ``` ... ```)
        if cleaned_text.startswith("```"):
            first_newline = cleaned_text.find("\n")
            if first_newline != -1:
                cleaned_text = cleaned_text[first_newline + 1 :]
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]
            cleaned_text = cleaned_text.strip()

        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError as e:
            raise ExtractionValidationError(
                f"Claude returned invalid JSON for CAM statement: {str(e)}\n"
                f"Response: {response_text[:500]}"
            ) from e

    def _validate_extraction(
        self, extraction_data: dict[str, Any]
    ) -> CamStatementExtractionResult:
        """Validate parsed JSON against the CamStatementExtractionResult schema.

        Args:
            extraction_data: Parsed JSON dictionary from Claude.

        Returns:
            Validated CamStatementExtractionResult.

        Raises:
            ExtractionValidationError: If data fails Pydantic validation.
        """
        try:
            return CamStatementExtractionResult.model_validate(extraction_data)
        except ValidationError as e:
            raise ExtractionValidationError(
                f"CAM statement extraction failed validation: {str(e)}\n"
                f"Data: {json.dumps(extraction_data, indent=2, default=str)}"
            ) from e

    async def _get_ocr_results(self, document_id: UUID) -> list[OCRResult]:
        """Load OCR results for document from database.

        Args:
            document_id: UUID of the document.

        Returns:
            List of OCRResult objects, one per page.
        """
        result = (
            self.db.table("ocr_results")
            .select("*")
            .eq("document_id", str(document_id))
            .execute()
        )

        if result.data:
            data = cast(list[dict[str, Any]], result.data)
            return [OCRResult(**row) for row in data]
        return []

    def _concatenate_text(self, ocr_results: list[OCRResult]) -> str:
        """Concatenate OCR text from multiple pages with page markers.

        Reuses the same page marker format as lease extraction for consistency.

        Args:
            ocr_results: List of OCRResult objects (unsorted).

        Returns:
            Concatenated text with page markers.
        """
        sorted_results = sorted(ocr_results, key=lambda x: x.page_number)
        pages = []
        for ocr_result in sorted_results:
            page_marker = f"--- PAGE {ocr_result.page_number} ---"
            pages.append(f"{page_marker}\n{ocr_result.full_text}")
        return "\n\n".join(pages)


def calculate_cam_confidence(
    extraction: CamStatementExtractionResult,
    threshold: Decimal = CAM_STATEMENT_CONFIDENCE_THRESHOLD,
) -> ConfidenceResult:
    """Calculate confidence scores for a CAM statement extraction.

    Uses CAM-specific field weights that prioritize totals and tenant share
    accuracy. Threshold defaults to 0.75 (lower than lease extraction's 0.80
    due to higher format variability in CAM statements).

    Args:
        extraction: Validated CamStatementExtractionResult.
        threshold: Minimum confidence for auto-approval (0.0-1.0).

    Returns:
        ConfidenceResult with overall score, field scores, and review flag.

    Example:
        ```python
        result = CamStatementExtractionResult.model_validate(data)
        confidence = calculate_cam_confidence(result)
        if confidence.needs_review:
            print(f"Review needed: {confidence.low_confidence_fields}")
        print(f"Overall: {confidence.overall_score:.1%}")
        ```
    """
    # Build field scores dictionary (convert 0-100 to 0.0-1.0)
    field_scores: dict[str, Decimal] = {}
    for ext in extraction.extractions:
        field_scores[ext.field] = Decimal(str(ext.confidence)) / Decimal("100")

    # Calculate weighted overall score using CAM-specific weights
    weighted_sum = Decimal("0")
    total_weight = Decimal("0")

    for field, weight in CAM_STATEMENT_FIELD_WEIGHTS.items():
        if field in field_scores:
            weighted_sum += field_scores[field] * weight
            total_weight += weight

    overall_score = (
        (weighted_sum / total_weight).quantize(Decimal("0.0001"))
        if total_weight > 0
        else Decimal("0")
    )

    # Identify low confidence fields
    low_confidence = [
        field for field, score in field_scores.items() if score < threshold
    ]

    needs_review = overall_score < threshold or len(low_confidence) > 0

    return ConfidenceResult(
        overall_score=overall_score,
        field_scores=field_scores,
        needs_review=needs_review,
        low_confidence_fields=low_confidence,
        threshold=threshold,
    )


def create_cam_statement_orchestrator(
    anthropic_client: AnthropicClient, db: SupabaseDB
) -> CamStatementOrchestrator:
    """Factory function to create CamStatementOrchestrator instance.

    Args:
        anthropic_client: Configured AnthropicClient instance.
        db: Supabase client for database operations.

    Returns:
        CamStatementOrchestrator ready for use.

    Example:
        ```python
        client = AnthropicClient()
        orchestrator = create_cam_statement_orchestrator(client, supabase_client)
        result = await orchestrator.extract_cam_statement(doc_id)
        ```
    """
    return CamStatementOrchestrator(
        anthropic_client=anthropic_client, db=db
    )
```

### Test File: `backend/tests/services/extraction/test_cam_statement_extraction.py`

```python
"""Integration tests for CAM statement extraction pipeline.

Tests the full orchestrator flow with mocked AnthropicClient and SupabaseDB.
Only external dependencies (Claude API, Supabase) are mocked.
"""

import json
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.services.extraction.cam_statement_models import (
    CAM_STATEMENT_CONFIDENCE_THRESHOLD,
    CamStatementExtractionResult,
)
from app.services.extraction.cam_statement_orchestrator import (
    CamExtractionPipelineResult,
    CamStatementOrchestrator,
    calculate_cam_confidence,
    create_cam_statement_orchestrator,
)
from app.services.extraction.confidence import ConfidenceResult
from app.services.extraction.extraction_models import FieldExtraction
from app.services.extraction.orchestrator import (
    ExtractionError,
    ExtractionValidationError,
    OCRResultNotFoundError,
)


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

VALID_CAM_JSON = {
    "reconciliation_period": {
        "start_date": "2024-01-01",
        "end_date": "2024-12-31",
        "fiscal_year": 2024,
    },
    "property_name": "Westfield Plaza",
    "tenant_name": "Acme Corp",
    "suite_unit": "Suite 200",
    "tenant_rsf": 5000.00,
    "building_rsf": 100000.00,
    "pro_rata_share_stated": 0.05,
    "expense_line_items": [
        {
            "category": "Property Taxes",
            "gross_amount": 50000.00,
            "classification": "tax",
        },
        {
            "category": "Insurance",
            "gross_amount": 25000.00,
            "classification": "insurance",
        },
        {
            "category": "Utilities",
            "gross_amount": 50000.00,
            "classification": "operating",
        },
    ],
    "adjustments": {
        "admin_fee_amount": 1250.00,
        "admin_fee_pct": 0.10,
    },
    "totals": {
        "total_gross_expenses": 125000.00,
        "total_tenant_share": 7500.00,
        "estimated_charges_paid": 7000.00,
        "balance_due": 500.00,
    },
    "extractions": [
        {
            "field": "totals.total_gross_expenses",
            "value": "$125,000.00",
            "confidence": 95,
            "source_text": "Total Operating Expenses: $125,000.00",
        },
        {
            "field": "totals.total_tenant_share",
            "value": "$7,500.00",
            "confidence": 92,
            "source_text": "Tenant Share: $7,500.00",
        },
        {
            "field": "pro_rata_share_stated",
            "value": "5.00%",
            "confidence": 98,
            "source_text": "Pro-Rata Share: 5.00%",
        },
    ],
}


def _make_mock_ocr_result(page_number: int = 1, text: str = "Sample CAM statement"):
    """Create a mock OCRResult."""
    mock = MagicMock()
    mock.page_number = page_number
    mock.full_text = text
    mock.text_blocks = []
    return mock


def _make_mock_db(ocr_results=None):
    """Create a mock SupabaseDB that returns the given OCR results."""
    db = MagicMock()
    mock_response = MagicMock()

    if ocr_results is None:
        mock_response.data = None
    else:
        mock_response.data = ocr_results

    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        mock_response
    )
    return db


def _make_mock_client(response_json=None, response_text=None, tokens=1500):
    """Create a mock AnthropicClient that returns given JSON."""
    client = MagicMock()
    if response_text is not None:
        text = response_text
    elif response_json is not None:
        text = json.dumps(response_json)
    else:
        text = json.dumps(VALID_CAM_JSON)
    client.extract = AsyncMock(return_value=(text, tokens))
    return client


# ---------------------------------------------------------------------------
# CamStatementOrchestrator tests
# ---------------------------------------------------------------------------

class TestExtractCamStatement:
    @pytest.mark.asyncio
    async def test_successful_extraction(self):
        """Full pipeline: OCR -> Claude -> validated result."""
        ocr = _make_mock_ocr_result(text="CAM Reconciliation for 2024...")
        client = _make_mock_client()
        # We need to mock _get_ocr_results since the DB mock is complex
        orchestrator = CamStatementOrchestrator(
            anthropic_client=client, db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr])

        result = await orchestrator.extract_cam_statement(uuid4())

        assert isinstance(result, CamExtractionPipelineResult)
        assert isinstance(result.extraction, CamStatementExtractionResult)
        assert result.extraction.property_name == "Westfield Plaza"
        assert result.extraction.totals.total_gross_expenses == Decimal("125000.00")
        assert result.tokens_used == 1500
        assert isinstance(result.confidence, ConfidenceResult)

    @pytest.mark.asyncio
    async def test_temperature_is_zero(self):
        """Claude is called with temperature=0.0 for deterministic output."""
        ocr = _make_mock_ocr_result(text="Statement text")
        client = _make_mock_client()
        orchestrator = CamStatementOrchestrator(
            anthropic_client=client, db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr])

        await orchestrator.extract_cam_statement(uuid4())

        call_kwargs = client.extract.call_args
        assert call_kwargs.kwargs.get("temperature") == 0.0 or (
            len(call_kwargs.args) > 3 and call_kwargs.args[3] == 0.0
        )

    @pytest.mark.asyncio
    async def test_max_tokens_is_8192(self):
        """Claude is called with max_tokens=8192 for larger CAM responses."""
        ocr = _make_mock_ocr_result(text="Statement text")
        client = _make_mock_client()
        orchestrator = CamStatementOrchestrator(
            anthropic_client=client, db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr])

        await orchestrator.extract_cam_statement(uuid4())

        call_kwargs = client.extract.call_args
        assert call_kwargs.kwargs.get("max_tokens") == 8192

    @pytest.mark.asyncio
    async def test_no_ocr_results_raises(self):
        """Raises OCRResultNotFoundError when no OCR results exist."""
        orchestrator = CamStatementOrchestrator(
            anthropic_client=MagicMock(), db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[])

        with pytest.raises(OCRResultNotFoundError):
            await orchestrator.extract_cam_statement(uuid4())

    @pytest.mark.asyncio
    async def test_empty_ocr_text_raises(self):
        """Raises ExtractionError when OCR text is whitespace-only."""
        ocr = _make_mock_ocr_result(text="   \n  ")
        orchestrator = CamStatementOrchestrator(
            anthropic_client=MagicMock(), db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr])

        with pytest.raises(ExtractionError, match="No OCR text available"):
            await orchestrator.extract_cam_statement(uuid4())

    @pytest.mark.asyncio
    async def test_claude_api_failure_raises(self):
        """Raises ExtractionError when Claude API call fails."""
        ocr = _make_mock_ocr_result(text="Real text")
        client = MagicMock()
        client.extract = AsyncMock(side_effect=RuntimeError("API timeout"))
        orchestrator = CamStatementOrchestrator(
            anthropic_client=client, db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr])

        with pytest.raises(ExtractionError, match="Claude API call failed"):
            await orchestrator.extract_cam_statement(uuid4())

    @pytest.mark.asyncio
    async def test_invalid_json_raises(self):
        """Raises ExtractionValidationError on invalid JSON from Claude."""
        ocr = _make_mock_ocr_result(text="Real text")
        client = _make_mock_client(response_text="This is not JSON at all")
        orchestrator = CamStatementOrchestrator(
            anthropic_client=client, db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr])

        with pytest.raises(ExtractionValidationError, match="invalid JSON"):
            await orchestrator.extract_cam_statement(uuid4())

    @pytest.mark.asyncio
    async def test_invalid_schema_raises(self):
        """Raises ExtractionValidationError when JSON doesn't match schema."""
        invalid_data = {"property_name": "Test"}  # missing required fields
        ocr = _make_mock_ocr_result(text="Real text")
        client = _make_mock_client(response_json=invalid_data)
        orchestrator = CamStatementOrchestrator(
            anthropic_client=client, db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr])

        with pytest.raises(ExtractionValidationError, match="failed validation"):
            await orchestrator.extract_cam_statement(uuid4())

    @pytest.mark.asyncio
    async def test_strips_markdown_code_blocks(self):
        """JSON wrapped in ```json ... ``` is parsed correctly."""
        wrapped = f"```json\n{json.dumps(VALID_CAM_JSON)}\n```"
        ocr = _make_mock_ocr_result(text="Real text")
        client = _make_mock_client(response_text=wrapped)
        orchestrator = CamStatementOrchestrator(
            anthropic_client=client, db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr])

        result = await orchestrator.extract_cam_statement(uuid4())
        assert result.extraction.property_name == "Westfield Plaza"

    @pytest.mark.asyncio
    async def test_multi_page_concatenation(self):
        """Multi-page OCR results are sorted and concatenated with markers."""
        ocr1 = _make_mock_ocr_result(page_number=2, text="Page 2 text")
        ocr2 = _make_mock_ocr_result(page_number=1, text="Page 1 text")
        client = _make_mock_client()
        orchestrator = CamStatementOrchestrator(
            anthropic_client=client, db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr1, ocr2])

        await orchestrator.extract_cam_statement(uuid4())

        # Verify the document_text sent to Claude has pages in order
        call_kwargs = client.extract.call_args
        doc_text = call_kwargs.kwargs.get("document_text", "")
        page1_pos = doc_text.find("PAGE 1")
        page2_pos = doc_text.find("PAGE 2")
        assert page1_pos < page2_pos

    @pytest.mark.asyncio
    async def test_cross_field_warnings_returned(self):
        """Cross-field validation warnings are included in result."""
        data = VALID_CAM_JSON.copy()
        data["pro_rata_share_stated"] = 0.50  # 50% vs 5% calculated
        ocr = _make_mock_ocr_result(text="Real text")
        client = _make_mock_client(response_json=data)
        orchestrator = CamStatementOrchestrator(
            anthropic_client=client, db=MagicMock()
        )
        orchestrator._get_ocr_results = AsyncMock(return_value=[ocr])

        result = await orchestrator.extract_cam_statement(uuid4())
        assert len(result.warnings) > 0
        assert any(w.field == "pro_rata_share_stated" for w in result.warnings)


# ---------------------------------------------------------------------------
# calculate_cam_confidence tests
# ---------------------------------------------------------------------------

class TestCalculateCamConfidence:
    def _make_extraction_with_fields(
        self, field_confidences: dict[str, int]
    ) -> CamStatementExtractionResult:
        """Build a minimal valid result with specified field confidences."""
        from app.services.extraction.cam_statement_models import (
            CamTotals,
            ExpenseLineItem,
            ReconciliationPeriod,
        )

        extractions = [
            FieldExtraction(
                field=field,
                value="test",
                confidence=conf,
                source_text="source text",
            )
            for field, conf in field_confidences.items()
        ]

        return CamStatementExtractionResult(
            reconciliation_period=ReconciliationPeriod(
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
                fiscal_year=2024,
            ),
            expense_line_items=[
                ExpenseLineItem(
                    category="Taxes",
                    gross_amount=Decimal("50000"),
                    classification="tax",
                ),
            ],
            totals=CamTotals(
                total_gross_expenses=Decimal("50000"),
                total_tenant_share=Decimal("2500"),
            ),
            extractions=extractions,
        )

    def test_high_confidence_no_review(self):
        extraction = self._make_extraction_with_fields({
            "totals.total_gross_expenses": 95,
            "totals.total_tenant_share": 92,
            "pro_rata_share_stated": 98,
        })
        result = calculate_cam_confidence(extraction)
        assert result.overall_score > Decimal("0.75")
        assert result.needs_review is False
        assert result.low_confidence_fields == []

    def test_low_confidence_triggers_review(self):
        extraction = self._make_extraction_with_fields({
            "totals.total_gross_expenses": 50,
            "totals.total_tenant_share": 40,
        })
        result = calculate_cam_confidence(extraction)
        assert result.needs_review is True
        assert len(result.low_confidence_fields) > 0

    def test_uses_cam_specific_threshold(self):
        result = calculate_cam_confidence(
            self._make_extraction_with_fields({
                "totals.total_gross_expenses": 95,
            })
        )
        assert result.threshold == CAM_STATEMENT_CONFIDENCE_THRESHOLD

    def test_custom_threshold(self):
        extraction = self._make_extraction_with_fields({
            "totals.total_gross_expenses": 85,
        })
        result = calculate_cam_confidence(extraction, threshold=Decimal("0.90"))
        assert result.threshold == Decimal("0.90")
        # 85/100 = 0.85 < 0.90 threshold
        assert result.needs_review is True

    def test_no_weighted_fields_returns_zero(self):
        extraction = self._make_extraction_with_fields({
            "property_name": 95,  # not in weight map
        })
        result = calculate_cam_confidence(extraction)
        assert result.overall_score == Decimal("0")


# ---------------------------------------------------------------------------
# Factory function tests
# ---------------------------------------------------------------------------

class TestCreateCamStatementOrchestrator:
    def test_returns_orchestrator_instance(self):
        client = MagicMock()
        db = MagicMock()
        orchestrator = create_cam_statement_orchestrator(client, db)
        assert isinstance(orchestrator, CamStatementOrchestrator)
        assert orchestrator.client is client
        assert orchestrator.db is db
```

## Test Cases
- Successful end-to-end extraction: OCR load, Claude call, JSON parse, Pydantic validate, confidence score, warnings
- Claude is called with `temperature=0.0` (deterministic)
- Claude is called with `max_tokens=8192` (larger than lease extraction)
- `OCRResultNotFoundError` raised when no OCR results for document
- `ExtractionError` raised when OCR text is whitespace-only (not sent to Claude)
- `ExtractionError` raised when Claude API call fails (wraps original exception)
- `ExtractionValidationError` raised when Claude returns non-JSON text
- `ExtractionValidationError` raised when JSON does not match `CamStatementExtractionResult` schema
- Markdown code blocks (```json ... ```) stripped before JSON parsing
- Multi-page OCR results sorted by page number and concatenated with `--- PAGE N ---` markers
- Cross-field validation warnings included in pipeline result
- `calculate_cam_confidence()` returns `ConfidenceResult` with weighted scores using CAM-specific weights
- High-confidence extraction (all fields > 75%) does not trigger review
- Low-confidence fields trigger `needs_review = True`
- Custom threshold overrides the default 0.75
- Fields not in the weight map produce overall_score of 0
- `create_cam_statement_orchestrator()` factory returns correctly wired instance

## Definition of Done
- [ ] `cam_statement_orchestrator.py` created in `backend/app/services/extraction/`
- [ ] `CamStatementOrchestrator` class with `extract_cam_statement()` method
- [ ] `CamExtractionPipelineResult` dataclass bundles extraction + confidence + warnings + tokens
- [ ] `calculate_cam_confidence()` function uses CAM-specific field weights
- [ ] `create_cam_statement_orchestrator()` factory function implemented
- [ ] `__init__.py` updated with new exports
- [ ] All test cases pass (`cd backend && pytest tests/services/extraction/test_cam_statement_extraction.py --tb=short`)
- [ ] All existing extraction tests still pass (`cd backend && pytest tests/services/extraction/ --tb=short`)
- [ ] Backend coverage maintained at >= 95% (`cd backend && pytest --cov=app --cov-fail-under=95`)
- [ ] Code formatted (`black`, `isort`, `ruff`)
- [ ] No placeholder code or TODO comments
- [ ] Changes committed
