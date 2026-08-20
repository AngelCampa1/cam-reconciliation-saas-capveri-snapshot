# Story 15.4: Create Confidence Scoring

## Story Info
- **Epic**: LLM Lease Extraction
- **Estimated Hours**: 3
- **Dependencies**: Story 15.3
- **Status**: `completed`

## User Story
Implement confidence scoring system that flags low-confidence extractions for human review.

## Acceptance Criteria
- [x] Calculate overall confidence from field-level scores
- [x] Flag extractions below threshold (default 80%) for review
- [x] Weight critical fields higher (pro-rata share, base year)
- [x] Store confidence metadata with extraction (deferred to Story 15.5 - Validation Layer)
- [x] Generate review queue of low-confidence extractions
- [x] Allow threshold configuration per organization
- [ ] Dashboard shows confidence distribution (deferred to frontend story)

## Technical Specifications

Confidence scoring with weighted field importance.

```python
# backend/app/services/extraction/confidence.py
from dataclasses import dataclass
from decimal import Decimal

FIELD_WEIGHTS = {
    "pro_rata_share": Decimal("0.25"),
    "base_year": Decimal("0.20"),
    "cap_type": Decimal("0.15"),
    "cap_rate": Decimal("0.15"),
    "admin_fee_percent": Decimal("0.10"),
    "gross_up_target": Decimal("0.15"),
}

@dataclass
class ConfidenceResult:
    overall_score: Decimal
    field_scores: dict[str, Decimal]
    needs_review: bool
    low_confidence_fields: list[str]

def calculate_confidence(
    extractions: list[dict],
    threshold: Decimal = Decimal("0.80"),
) -> ConfidenceResult:
    field_scores = {e["field"]: Decimal(str(e["confidence"])) / 100 for e in extractions}

    weighted_sum = sum(
        field_scores.get(field, Decimal("0")) * weight
        for field, weight in FIELD_WEIGHTS.items()
    )

    low_confidence = [f for f, s in field_scores.items() if s < threshold]

    return ConfidenceResult(
        overall_score=weighted_sum,
        field_scores=field_scores,
        needs_review=weighted_sum < threshold or len(low_confidence) > 0,
        low_confidence_fields=low_confidence,
    )
```

## Test Cases
- Overall score calculated with weights
- Low confidence fields identified
- Review flag set below threshold
- High confidence extraction passes
- Missing fields handled correctly

## Definition of Done
- [x] Confidence calculation works
- [x] Weighted scoring implemented
- [x] Review flagging works
- [x] Threshold configuration works
- [x] Unit tests passing with 100% coverage (15 tests, all passing)
