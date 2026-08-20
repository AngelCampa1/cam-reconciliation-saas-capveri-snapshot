# Story 15.2: Create Extraction Prompt

## Story Info
- **Epic**: LLM Lease Extraction
- **Estimated Hours**: 3
- **Dependencies**: Story 15.1, Epic 2 (LeaseRecoveryProfile Model)
- **Status**: `completed`

## User Story
Design and implement the Claude prompt template for extracting "Financial DNA" (pro-rata share, caps, base year, etc.) from lease text.

## Acceptance Criteria
- [x] Prompt extracts all LeaseRecoveryProfile fields
- [x] Output formatted as valid JSON matching Pydantic schema
- [x] Handles variations in lease terminology
- [x] Includes confidence indicators for each field
- [x] Provides source text references for each extraction
- [x] Handles missing fields gracefully (null values)
- [x] Prompt tested on sample lease documents

## Technical Specifications

Structured extraction prompt with JSON output format.

```python
# backend/app/services/extraction/prompts.py
LEASE_EXTRACTION_PROMPT = """
You are an expert commercial real estate analyst extracting CAM reconciliation terms from lease documents.

Extract the following fields from the lease text. Return valid JSON matching this exact schema:

{
  "base_year": <integer or null>,
  "pro_rata_share": <decimal 0-1 or null>,
  "admin_fee_percent": <decimal 0-1 or null>,
  "gross_up_target": <decimal 0-1, default 0.95>,
  "cap_type": <"none" | "cumulative" | "non_cumulative" | "cumulative_compounding">,
  "cap_rate": <decimal or null>,
  "extractions": [
    {
      "field": "<field_name>",
      "value": "<extracted_value>",
      "confidence": <0-100>,
      "source_text": "<exact quote from document>"
    }
  ]
}

Guidelines:
- Pro-rata share may be expressed as percentage (e.g., "5.25%") - convert to decimal (0.0525)
- Base year is the calendar year for expense comparison
- Cap rate is annual limit on expense increases (e.g., "5% annual cap" = 0.05)
- If a field is not found, set to null
- Include source_text for audit trail
- Confidence: 90+ if explicit, 70-89 if inferred, <70 if uncertain

Document text:
"""
```

## Test Cases
- Extracts explicit pro-rata share correctly
- Converts percentage to decimal
- Identifies cap type from various phrasings
- Returns null for missing fields
- Confidence reflects certainty level

## Definition of Done
- [x] Prompt template finalized
- [x] Tested on 5+ sample leases (fixtures created)
- [x] JSON output validates against schema
- [x] Source text references included
- [x] Unit tests passing with 95%+ coverage (24 tests, 100% for new modules)
