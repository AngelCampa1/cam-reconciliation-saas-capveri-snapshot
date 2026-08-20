"""Confidence scoring for lease extraction results.

Implements weighted confidence scoring to identify extractions
that require human review based on field-level confidence scores.

SCALE CONVENTIONS (FIX EXT-2: Document scale handling for clarity):
--------------------------------------------------------------------
- FieldExtraction.confidence: 0-100 scale (e.g., 85 = 85% confident)
  This is the raw LLM output format, natural for human reading.

- Threshold parameters: 0.0-1.0 scale (e.g., 0.80 = 80% threshold)
  This is the API convention for all function parameters.

- Internal calculations: 0.0-1.0 scale
  Field scores are converted to 0-1 for weighted average calculation.

Functions handle the scale conversion internally, so callers always
pass thresholds in 0-1 format (e.g., Decimal("0.80") for 80%).
"""

from dataclasses import dataclass
from decimal import Decimal

from app.services.extraction.extraction_models import (
    FieldExtraction,
    LeaseExtractionResult,
)

# Field weights for overall confidence calculation
# Critical financial fields weighted higher
FIELD_WEIGHTS = {
    "pro_rata_share": Decimal("0.25"),  # Most critical - tenant's share
    "base_year": Decimal("0.20"),  # Critical for reconciliation baseline
    "cap_type": Decimal("0.15"),  # Important for expense growth limits
    "cap_rate": Decimal("0.15"),  # Important when cap_type is set
    "admin_fee_percentage": Decimal("0.10"),  # Affects total recoverable
    "gross_up_base_year": Decimal("0.15"),  # Affects base year normalization
}

# Default confidence threshold (80%)
DEFAULT_THRESHOLD = Decimal("0.80")


@dataclass
class ConfidenceResult:
    """Result of confidence scoring analysis.

    Attributes:
        overall_score: Weighted average confidence (0.0-1.0)
        field_scores: Confidence score for each extracted field (0.0-1.0)
        needs_review: True if extraction should be reviewed by human
        low_confidence_fields: List of fields below threshold
        threshold: Threshold used for review flagging
    """

    overall_score: Decimal
    field_scores: dict[str, Decimal]
    needs_review: bool
    low_confidence_fields: list[str]
    threshold: Decimal


def calculate_confidence(
    extraction_result: LeaseExtractionResult,
    threshold: Decimal = DEFAULT_THRESHOLD,
) -> ConfidenceResult:
    """Calculate overall confidence score from field-level extractions.

    Computes a weighted average of field confidence scores, with critical
    fields (pro-rata share, base year) weighted higher. Flags extraction
    for review if overall score or any critical field is below threshold.

    Args:
        extraction_result: Extraction result with field-level metadata
        threshold: Minimum confidence for auto-approval (0.0-1.0)

    Returns:
        ConfidenceResult with overall score, field scores, and review flag

    Example:
        ```python
        result, tokens = await orchestrator.extract_lease_profile(doc_id)
        confidence = calculate_confidence(result, threshold=Decimal("0.85"))

        if confidence.needs_review:
            # Queue for human review
            print(f"Low confidence fields: {confidence.low_confidence_fields}")
        else:
            # Auto-approve extraction
            profile = result.to_recovery_profile_dict()
        ```
    """
    # Build field scores dictionary (convert 0-100 to 0.0-1.0)
    field_scores: dict[str, Decimal] = {}
    for extraction in extraction_result.extractions:
        field_scores[extraction.field] = Decimal(str(extraction.confidence)) / Decimal(
            "100"
        )

    # Calculate weighted overall score
    # Only include fields that have weights defined
    weighted_sum = Decimal("0")
    total_weight = Decimal("0")

    for field, weight in FIELD_WEIGHTS.items():
        if field in field_scores:
            weighted_sum += field_scores[field] * weight
            total_weight += weight

    # If no weighted fields were extracted, overall score is 0
    # FIX EXT-5: Quantize to prevent precision issues (e.g., 79.9999999 vs 80.0)
    # 4 decimal places provides sufficient precision for threshold comparisons
    overall_score = (
        (weighted_sum / total_weight).quantize(Decimal("0.0001"))
        if total_weight > 0
        else Decimal("0")
    )

    # Identify low confidence fields
    low_confidence = [
        field for field, score in field_scores.items() if score < threshold
    ]

    # Flag for review if:
    # 1. Overall weighted score is below threshold, OR
    # 2. Any field has confidence below threshold
    needs_review = overall_score < threshold or len(low_confidence) > 0

    return ConfidenceResult(
        overall_score=overall_score,
        field_scores=field_scores,
        needs_review=needs_review,
        low_confidence_fields=low_confidence,
        threshold=threshold,
    )


def get_low_confidence_extractions(
    extraction_result: LeaseExtractionResult,
    threshold: Decimal = DEFAULT_THRESHOLD,
) -> list[FieldExtraction]:
    """Get list of field extractions with confidence below threshold.

    Convenience function to retrieve the actual FieldExtraction objects
    for low-confidence fields, useful for displaying to reviewers.

    Args:
        extraction_result: Extraction result with field-level metadata
        threshold: Minimum confidence for filtering (0.0-1.0)

    Returns:
        List of FieldExtraction objects with confidence < threshold

    Example:
        ```python
        low_conf = get_low_confidence_extractions(result, Decimal("0.70"))
        for extraction in low_conf:
            print(f"{extraction.field}: {extraction.confidence}%")
            print(f"Source: {extraction.source_text}")
        ```
    """
    threshold_percent = threshold * Decimal("100")
    return [
        extraction
        for extraction in extraction_result.extractions
        if Decimal(str(extraction.confidence)) < threshold_percent
    ]
