# Story T2.1: CAM Statement Extraction Prompt

## Story Info
- **Epic**: T2 — CAM Statement Extraction
- **Estimated Hours**: 6
- **Dependencies**: Existing extraction pipeline (`backend/app/services/extraction/prompts.py`, `anthropic_client.py`)
- **Status**: `pending`

## User Story
As a tenant auditor, I want the system to extract structured data from CAM reconciliation statement PDFs so that I can automatically compare landlord-stated charges against lease terms without manual data entry.

## Acceptance Criteria
- Prompt instructs Claude to return valid JSON matching the `CamStatementExtractionResult` schema (defined in T2.2)
- Prompt extracts reconciliation period (start date, end date, fiscal year)
- Prompt extracts property name, tenant name, and suite/unit identifier
- Prompt extracts square footage figures: tenant RSF, building RSF, and stated pro-rata share
- Prompt extracts expense line items with category, gross amount, tenant share amount, and expense classification (operating / tax / insurance / capital / other)
- Prompt extracts adjustments: gross-up, occupancy adjustment, base year stop, cap adjustment, admin fee
- Prompt extracts totals: total gross expenses, total tenant share, estimated charges paid, balance due / (credit)
- Prompt includes per-field confidence scoring (0-100) with source text for audit trail
- Prompt enforces JSON-only output (no markdown wrapping, no explanations)
- Temperature is set to 0.0 in the prompt usage documentation
- A `build_cam_statement_prompt()` helper exists for backward compatibility (matching the lease prompt pattern)

## Technical Specifications

### File to Create: `backend/app/services/extraction/cam_statement_prompt.py`

```python
"""
Extraction prompt for CAM reconciliation statement processing.

This module contains the structured prompt for extracting financial data
from landlord-provided CAM reconciliation statements using Claude.
Unlike lease extraction (which captures recovery terms), this captures
reconciliation actuals: expense line items, adjustments, and totals.
"""

# CAM statement extraction prompt template
CAM_STATEMENT_EXTRACTION_PROMPT = """You are an expert commercial real estate CAM (Common Area Maintenance) auditor extracting reconciliation data from a landlord-provided CAM statement.

Your task is to extract the following fields from the CAM reconciliation statement and return them as valid JSON matching the exact schema below.

**JSON Schema:**

```json
{
  "reconciliation_period": {
    "start_date": "<YYYY-MM-DD>",
    "end_date": "<YYYY-MM-DD>",
    "fiscal_year": <integer 2000-2100>
  },
  "property_name": "<string or null>",
  "tenant_name": "<string or null>",
  "suite_unit": "<string or null>",
  "tenant_rsf": <decimal or null>,
  "building_rsf": <decimal or null>,
  "pro_rata_share_stated": <decimal 0-1 or null>,
  "expense_line_items": [
    {
      "category": "<string>",
      "description": "<string or null>",
      "gross_amount": <decimal>,
      "tenant_share_amount": <decimal or null>,
      "classification": "<operating | tax | insurance | capital | other>",
      "account_code": "<string or null>"
    }
  ],
  "adjustments": {
    "gross_up_amount": <decimal or null>,
    "gross_up_occupancy_pct": <decimal 0-1 or null>,
    "occupancy_adjustment": <decimal or null>,
    "base_year_stop_amount": <decimal or null>,
    "cap_adjustment": <decimal or null>,
    "admin_fee_amount": <decimal or null>,
    "admin_fee_pct": <decimal 0-0.25 or null>,
    "other_adjustments": [
      {
        "label": "<string>",
        "amount": <decimal>
      }
    ]
  },
  "totals": {
    "total_gross_expenses": <decimal>,
    "total_tenant_share": <decimal>,
    "estimated_charges_paid": <decimal or null>,
    "balance_due": <decimal or null>
  },
  "extractions": [
    {
      "field": "<field_name>",
      "value": "<extracted_value>",
      "confidence": <integer 0-100>,
      "source_text": "<exact quote from document>"
    }
  ]
}
```

**Field Definitions:**

1. **reconciliation_period**: The time period covered by the reconciliation.
   - start_date: First day of the reconciliation period (YYYY-MM-DD)
   - end_date: Last day of the reconciliation period (YYYY-MM-DD)
   - fiscal_year: The fiscal year as integer (e.g., 2024)

2. **property_name**: Name of the property as stated on the document. Set to null if not found.

3. **tenant_name**: Name of the tenant receiving the reconciliation. Set to null if not found.

4. **suite_unit**: Suite or unit number/identifier. Set to null if not found.

5. **tenant_rsf**: Tenant's rentable square footage as a decimal. Set to null if not found.

6. **building_rsf**: Total building rentable square footage as a decimal. Set to null if not found.

7. **pro_rata_share_stated**: The tenant's pro-rata share as stated on the document, as a decimal (0-1).
   - "5.25%" -> 0.0525
   - "12.5%" -> 0.125
   Set to null if not explicitly stated.

8. **expense_line_items**: Array of individual expense categories from the statement.
   - category: Expense category name (e.g., "Property Taxes", "Insurance", "Utilities")
   - description: Additional description if provided, otherwise null
   - gross_amount: Total property-level expense amount for this category
   - tenant_share_amount: Tenant's allocated share if shown separately, otherwise null
   - classification: One of "operating", "tax", "insurance", "capital", "other"
   - account_code: GL account code if shown, otherwise null

9. **adjustments**: Adjustments applied to arrive at the tenant's final share.
   - gross_up_amount: Dollar amount of gross-up adjustment (null if none)
   - gross_up_occupancy_pct: Occupancy percentage used for gross-up (null if none)
   - occupancy_adjustment: Occupancy-based adjustment amount (null if none)
   - base_year_stop_amount: Base year or expense stop deduction (null if none)
   - cap_adjustment: Cap-related adjustment (null if none)
   - admin_fee_amount: Administrative/management fee dollar amount (null if none)
   - admin_fee_pct: Administrative fee percentage as decimal 0-0.25 (null if none)
   - other_adjustments: Array of any other labeled adjustments not covered above

10. **totals**: Summary totals from the statement.
    - total_gross_expenses: Sum of all expense line items (REQUIRED)
    - total_tenant_share: Tenant's total share after adjustments (REQUIRED)
    - estimated_charges_paid: Amount already paid by tenant as estimates (null if not shown)
    - balance_due: Amount owed (positive) or credit (negative) (null if not shown)

11. **extractions**: Array of extraction details for audit trail. Each extraction must include:
    - field: Dot-notation path to the field (e.g., "totals.total_gross_expenses")
    - value: The extracted value before normalization
    - confidence: Confidence score 0-100 (see guidelines below)
    - source_text: Exact quote from the CAM statement document

**Classification Guidelines:**

Classify each expense line item using these rules:
- **operating**: General building operations (utilities, janitorial, repairs, maintenance, management, landscaping, security, elevator, HVAC, common area supplies, pest control)
- **tax**: Real estate taxes, property taxes, special assessments, tax protests
- **insurance**: Property insurance, liability insurance, umbrella coverage
- **capital**: Roof replacement, parking lot resurfacing, elevator modernization, structural repairs, HVAC system replacement (not routine maintenance)
- **other**: Anything that does not clearly fit the above categories

**Extraction Guidelines:**

1. **Dollar Amounts**: Extract as decimal numbers without currency symbols or commas:
   - "$1,234.56" -> 1234.56
   - "($500.00)" or "-$500.00" -> -500.00
   - Credits or refunds should be negative values

2. **Percentage Conversion**: Always convert percentages to decimals:
   - "5.25%" -> 0.0525
   - "95% occupied" -> 0.95

3. **Date Format**: Use ISO format YYYY-MM-DD:
   - "January 1, 2024" -> "2024-01-01"
   - "12/31/2024" -> "2024-12-31"

4. **Missing Fields**: If a field is not found or cannot be confidently determined, set it to null. Do not guess or fabricate values.

5. **Source Text**: Include the exact phrase or sentence from the statement that supports each extraction. This is critical for the audit trail.

6. **Confidence Scoring**:
   - **90-100**: Value is explicitly stated with clear labeling (e.g., "Total Operating Expenses: $125,000.00")
   - **70-89**: Value can be calculated or inferred from context (e.g., summing line items to get a total)
   - **50-69**: Value is ambiguous — unclear labeling, possible OCR artifacts, or multiple interpretations
   - **0-49**: Very uncertain — partial data, illegible text, or conflicting values on the statement

7. **Line Item Completeness**: Extract ALL expense line items shown on the statement, even if some have zero amounts. Do not aggregate or summarize categories.

8. **Adjustment Identification**: Look for sections labeled "Adjustments", "Gross-Up", "Base Year", "Cap", "Management Fee", "Administrative Fee", or similar terms. If a gross-up is applied, try to identify both the dollar adjustment and the occupancy percentage used.

9. **Balance Calculation**: If balance_due is not explicitly stated but total_tenant_share and estimated_charges_paid are both available, calculate: balance_due = total_tenant_share - estimated_charges_paid.

**Output Format:**

Return ONLY valid JSON matching the schema above. Do not include markdown code blocks, explanations, or any text outside the JSON structure.

**CAM Reconciliation Statement Text:**

"""


def build_cam_statement_prompt(document_text: str) -> str:
    """Build the full CAM statement extraction prompt with document text appended.

    DEPRECATED: Use CAM_STATEMENT_EXTRACTION_PROMPT directly with AnthropicClient.extract()
    which properly separates prompt (instructions) from document_text (content).

    Args:
        document_text: The full text of the CAM reconciliation statement.

    Returns:
        Complete prompt ready to send to Claude.

    Example (preferred usage):
        ```python
        from app.services.extraction.cam_statement_prompt import (
            CAM_STATEMENT_EXTRACTION_PROMPT,
        )

        response, tokens = await anthropic_client.extract(
            prompt=CAM_STATEMENT_EXTRACTION_PROMPT,  # Instructions
            document_text=statement_text,             # Raw document content
            temperature=0.0,
        )
        ```
    """
    return f"{CAM_STATEMENT_EXTRACTION_PROMPT}{document_text}"
```

### Test File: `backend/tests/services/extraction/test_cam_statement_prompt.py`

```python
"""Tests for CAM statement extraction prompt construction."""

from app.services.extraction.cam_statement_prompt import (
    CAM_STATEMENT_EXTRACTION_PROMPT,
    build_cam_statement_prompt,
)


class TestCamStatementExtractionPrompt:
    """Tests for the CAM statement extraction prompt template."""

    def test_prompt_is_non_empty_string(self):
        assert isinstance(CAM_STATEMENT_EXTRACTION_PROMPT, str)
        assert len(CAM_STATEMENT_EXTRACTION_PROMPT) > 500

    def test_prompt_requests_json_output(self):
        assert "JSON" in CAM_STATEMENT_EXTRACTION_PROMPT
        assert "valid JSON" in CAM_STATEMENT_EXTRACTION_PROMPT

    def test_prompt_defines_required_top_level_fields(self):
        required_fields = [
            "reconciliation_period",
            "property_name",
            "tenant_name",
            "suite_unit",
            "tenant_rsf",
            "building_rsf",
            "pro_rata_share_stated",
            "expense_line_items",
            "adjustments",
            "totals",
            "extractions",
        ]
        for field in required_fields:
            assert field in CAM_STATEMENT_EXTRACTION_PROMPT, (
                f"Missing field: {field}"
            )

    def test_prompt_defines_expense_classifications(self):
        classifications = ["operating", "tax", "insurance", "capital", "other"]
        for classification in classifications:
            assert classification in CAM_STATEMENT_EXTRACTION_PROMPT

    def test_prompt_defines_adjustment_fields(self):
        adjustment_fields = [
            "gross_up_amount",
            "gross_up_occupancy_pct",
            "occupancy_adjustment",
            "base_year_stop_amount",
            "cap_adjustment",
            "admin_fee_amount",
            "admin_fee_pct",
        ]
        for field in adjustment_fields:
            assert field in CAM_STATEMENT_EXTRACTION_PROMPT, (
                f"Missing adjustment field: {field}"
            )

    def test_prompt_defines_totals_fields(self):
        totals_fields = [
            "total_gross_expenses",
            "total_tenant_share",
            "estimated_charges_paid",
            "balance_due",
        ]
        for field in totals_fields:
            assert field in CAM_STATEMENT_EXTRACTION_PROMPT, (
                f"Missing totals field: {field}"
            )

    def test_prompt_includes_confidence_scoring_guidelines(self):
        assert "Confidence Scoring" in CAM_STATEMENT_EXTRACTION_PROMPT
        assert "90-100" in CAM_STATEMENT_EXTRACTION_PROMPT
        assert "70-89" in CAM_STATEMENT_EXTRACTION_PROMPT
        assert "50-69" in CAM_STATEMENT_EXTRACTION_PROMPT
        assert "0-49" in CAM_STATEMENT_EXTRACTION_PROMPT

    def test_prompt_includes_date_format_instructions(self):
        assert "YYYY-MM-DD" in CAM_STATEMENT_EXTRACTION_PROMPT

    def test_prompt_includes_dollar_parsing_instructions(self):
        assert "1234.56" in CAM_STATEMENT_EXTRACTION_PROMPT
        assert "currency symbols" in CAM_STATEMENT_EXTRACTION_PROMPT

    def test_prompt_ends_with_document_placeholder(self):
        """Prompt should end ready to receive document text."""
        assert CAM_STATEMENT_EXTRACTION_PROMPT.rstrip().endswith(
            "CAM Reconciliation Statement Text:"
        ) or CAM_STATEMENT_EXTRACTION_PROMPT.rstrip().endswith(
            "CAM Reconciliation Statement Text:\n"
        )

    def test_prompt_forbids_markdown_output(self):
        assert "Do not include markdown code blocks" in CAM_STATEMENT_EXTRACTION_PROMPT


class TestBuildCamStatementPrompt:
    """Tests for the deprecated build_cam_statement_prompt helper."""

    def test_appends_document_text(self):
        doc_text = "--- PAGE 1 ---\nTotal Expenses: $100,000.00"
        result = build_cam_statement_prompt(doc_text)
        assert result.startswith(CAM_STATEMENT_EXTRACTION_PROMPT)
        assert doc_text in result

    def test_returns_string(self):
        result = build_cam_statement_prompt("sample text")
        assert isinstance(result, str)

    def test_empty_document_text(self):
        result = build_cam_statement_prompt("")
        assert result == CAM_STATEMENT_EXTRACTION_PROMPT
```

## Test Cases
- Prompt string is non-empty and substantial (>500 chars)
- Prompt references all required top-level schema fields (reconciliation_period, expense_line_items, adjustments, totals, extractions)
- Prompt defines all five expense classifications (operating, tax, insurance, capital, other)
- Prompt defines all adjustment sub-fields (gross_up_amount, base_year_stop_amount, cap_adjustment, admin_fee_amount, etc.)
- Prompt defines all totals sub-fields (total_gross_expenses, total_tenant_share, estimated_charges_paid, balance_due)
- Prompt includes confidence scoring guidelines with all four tiers (90-100, 70-89, 50-69, 0-49)
- Prompt instructs ISO date format (YYYY-MM-DD)
- Prompt instructs dollar amount parsing (strip symbols, handle negatives/parens)
- Prompt ends with placeholder for document text concatenation
- Prompt explicitly forbids markdown code block wrapping in output
- `build_cam_statement_prompt()` correctly appends document text to the prompt template
- `build_cam_statement_prompt("")` returns the raw prompt template unchanged

## Definition of Done
- [ ] `cam_statement_prompt.py` created in `backend/app/services/extraction/`
- [ ] `CAM_STATEMENT_EXTRACTION_PROMPT` constant exported and covers all required fields
- [ ] `build_cam_statement_prompt()` helper function implemented for backward compatibility
- [ ] All test cases pass (`cd backend && pytest tests/services/extraction/test_cam_statement_prompt.py --tb=short`)
- [ ] Code formatted (`black`, `isort`, `ruff`)
- [ ] No placeholder code or TODO comments
- [ ] Changes committed
