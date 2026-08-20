"""
Unit tests for confidence scoring system.

Tests cover:
- Weighted overall confidence calculation
- Low confidence field identification
- Review flagging logic
- Threshold configuration
- Missing field handling
- Helper function behavior
"""

from decimal import Decimal

import pytest

from app.models.enums import CapType
from app.services.extraction.confidence import (
    DEFAULT_THRESHOLD,
    FIELD_WEIGHTS,
    ConfidenceResult,
    calculate_confidence,
    get_low_confidence_extractions,
)
from app.services.extraction.extraction_models import (
    FieldExtraction,
    LeaseExtractionResult,
)


class TestFieldWeights:
    """Test field weight constants."""

    def test_weights_sum_to_one(self):
        """Test field weights sum to 1.0 for proper weighted average."""
        total = sum(FIELD_WEIGHTS.values())
        assert total == Decimal("1.00")

    def test_critical_fields_weighted_highest(self):
        """Test pro_rata_share and base_year have highest weights."""
        assert FIELD_WEIGHTS["pro_rata_share"] == Decimal("0.25")
        assert FIELD_WEIGHTS["base_year"] == Decimal("0.20")

        # Ensure these are the top 2 weights
        sorted_weights = sorted(FIELD_WEIGHTS.values(), reverse=True)
        assert FIELD_WEIGHTS["pro_rata_share"] == sorted_weights[0]
        assert FIELD_WEIGHTS["base_year"] == sorted_weights[1]


class TestCalculateConfidence:
    """Test calculate_confidence function."""

    @pytest.fixture
    def high_confidence_extraction(self):
        """Create extraction with all high confidence scores."""
        return LeaseExtractionResult(
            base_year=2020,
            pro_rata_share=Decimal("0.0525"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),
            admin_fee_percentage=Decimal("0.15"),
            gross_up_base_year=True,
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="5.25%",
                    confidence=95,
                    source_text="Tenant's Pro-Rata Share: 5.25%",
                ),
                FieldExtraction(
                    field="base_year",
                    value="2020",
                    confidence=100,
                    source_text="Base Year: 2020",
                ),
                FieldExtraction(
                    field="cap_type",
                    value="cumulative",
                    confidence=90,
                    source_text="cumulative annual cap",
                ),
                FieldExtraction(
                    field="cap_rate",
                    value="5%",
                    confidence=90,
                    source_text="5% annual cap",
                ),
                FieldExtraction(
                    field="admin_fee_percentage",
                    value="15%",
                    confidence=85,
                    source_text="administrative fee of 15%",
                ),
                FieldExtraction(
                    field="gross_up_base_year",
                    value="true",
                    confidence=92,
                    source_text="base year shall be grossed up",
                ),
            ],
        )

    @pytest.fixture
    def low_confidence_extraction(self):
        """Create extraction with some low confidence scores."""
        return LeaseExtractionResult(
            base_year=2021,
            pro_rata_share=Decimal("0.08"),
            cap_type=CapType.NONE,
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="8%",
                    confidence=65,  # Low confidence
                    source_text="approximately eight percent",
                ),
                FieldExtraction(
                    field="base_year",
                    value="2021",
                    confidence=70,  # Borderline
                    source_text="calendar year 2021",
                ),
                FieldExtraction(
                    field="cap_type",
                    value="none",
                    confidence=90,  # High confidence
                    source_text="no expense caps",
                ),
            ],
        )

    @pytest.fixture
    def mixed_confidence_extraction(self):
        """Create extraction with one critical low-confidence field."""
        return LeaseExtractionResult(
            base_year=2022,
            pro_rata_share=Decimal("0.12"),
            cap_type=CapType.NON_CUMULATIVE,
            cap_rate=Decimal("0.04"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="12%",
                    confidence=60,  # Critical field, low confidence
                    source_text="inferred from rentable area calculation",
                ),
                FieldExtraction(
                    field="base_year",
                    value="2022",
                    confidence=95,  # High confidence
                    source_text="Base Year: 2022",
                ),
                FieldExtraction(
                    field="cap_type",
                    value="non_cumulative",
                    confidence=88,
                    source_text="annual non-cumulative cap",
                ),
                FieldExtraction(
                    field="cap_rate",
                    value="4%",
                    confidence=85,
                    source_text="4% per annum",
                ),
            ],
        )

    def test_high_confidence_passes_review(self, high_confidence_extraction):
        """Test extraction with all high scores passes without review."""
        result = calculate_confidence(high_confidence_extraction)

        assert result.overall_score >= DEFAULT_THRESHOLD
        assert not result.needs_review
        assert len(result.low_confidence_fields) == 0
        assert result.threshold == DEFAULT_THRESHOLD

    def test_low_confidence_fails_review(self, low_confidence_extraction):
        """Test extraction with low scores flagged for review."""
        result = calculate_confidence(low_confidence_extraction)

        assert result.needs_review
        assert "pro_rata_share" in result.low_confidence_fields
        assert "base_year" in result.low_confidence_fields

    def test_mixed_confidence_fails_on_critical_field(
        self, mixed_confidence_extraction
    ):
        """Test extraction fails if critical field has low confidence."""
        result = calculate_confidence(mixed_confidence_extraction)

        assert result.needs_review
        assert "pro_rata_share" in result.low_confidence_fields
        # Overall score might be high, but we still flag for review
        # because a critical field is low

    def test_field_scores_converted_to_decimal_range(self, high_confidence_extraction):
        """Test confidence scores converted from 0-100 to 0.0-1.0."""
        result = calculate_confidence(high_confidence_extraction)

        assert result.field_scores["pro_rata_share"] == Decimal("0.95")
        assert result.field_scores["base_year"] == Decimal("1.00")
        assert all(
            Decimal("0") <= score <= Decimal("1")
            for score in result.field_scores.values()
        )

    def test_weighted_score_calculation(self, high_confidence_extraction):
        """Test weighted average calculation with field weights."""
        result = calculate_confidence(high_confidence_extraction)

        # Manual calculation:
        # pro_rata_share: 0.95 * 0.25 = 0.2375
        # base_year: 1.00 * 0.20 = 0.20
        # cap_type: 0.90 * 0.15 = 0.135
        # cap_rate: 0.90 * 0.15 = 0.135
        # admin_fee: 0.85 * 0.10 = 0.085
        # gross_up: 0.92 * 0.15 = 0.138
        # Total: 0.931
        expected = Decimal("0.931")

        assert abs(result.overall_score - expected) < Decimal("0.001")

    def test_custom_threshold(self, high_confidence_extraction):
        """Test confidence with custom threshold."""
        # Set very high threshold (95%)
        result = calculate_confidence(
            high_confidence_extraction, threshold=Decimal("0.95")
        )

        # Overall score is 93.1%, which is below 95% threshold
        assert result.threshold == Decimal("0.95")
        # Some fields should be flagged as low confidence
        assert len(result.low_confidence_fields) > 0
        assert result.needs_review

    def test_missing_weighted_fields(self):
        """Test extraction with missing weighted fields."""
        # Only extract pro_rata_share, no other weighted fields
        minimal_extraction = LeaseExtractionResult(
            pro_rata_share=Decimal("0.10"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="10%",
                    confidence=90,
                    source_text="10% pro-rata share",
                ),
                # Include a non-weighted field
                FieldExtraction(
                    field="excluded_pools",
                    value="taxes",
                    confidence=80,
                    source_text="taxes excluded",
                ),
            ],
        )

        result = calculate_confidence(minimal_extraction)

        # Only pro_rata_share contributes to weighted score
        # Overall = 0.90 (pro_rata_share score)
        assert result.overall_score == Decimal("0.90")
        assert result.field_scores["pro_rata_share"] == Decimal("0.90")
        assert "excluded_pools" in result.field_scores
        assert not result.needs_review  # 90% is above 80% threshold

    def test_no_weighted_fields_extracted(self):
        """Test extraction with zero weighted fields."""
        # Extract only non-weighted fields
        no_weighted = LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),  # Required field, but no extraction
            extractions=[
                FieldExtraction(
                    field="some_custom_field",
                    value="value",
                    confidence=95,
                    source_text="some text",
                ),
            ],
        )

        result = calculate_confidence(no_weighted)

        # No weighted fields extracted, overall score should be 0
        assert result.overall_score == Decimal("0")
        assert result.needs_review  # 0% is below threshold


class TestGetLowConfidenceExtractions:
    """Test get_low_confidence_extractions helper function."""

    @pytest.fixture
    def mixed_extraction(self):
        """Create extraction with mixed confidence levels."""
        return LeaseExtractionResult(
            base_year=2020,
            pro_rata_share=Decimal("0.075"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="7.5%",
                    confidence=65,  # Low
                    source_text="approximately 7.5%",
                ),
                FieldExtraction(
                    field="base_year",
                    value="2020",
                    confidence=100,  # High
                    source_text="Base Year: 2020",
                ),
                FieldExtraction(
                    field="cap_type",
                    value="cumulative",
                    confidence=75,  # Medium
                    source_text="cumulative cap",
                ),
                FieldExtraction(
                    field="cap_rate",
                    value="5%",
                    confidence=60,  # Low
                    source_text="about 5%",
                ),
            ],
        )

    def test_returns_low_confidence_extractions(self, mixed_extraction):
        """Test function returns only low-confidence extractions."""
        low_conf = get_low_confidence_extractions(
            mixed_extraction, threshold=Decimal("0.70")
        )

        assert len(low_conf) == 2
        fields = [e.field for e in low_conf]
        assert "pro_rata_share" in fields
        assert "cap_rate" in fields

    def test_custom_threshold(self, mixed_extraction):
        """Test function respects custom threshold."""
        # Threshold 80% should capture more fields
        low_conf = get_low_confidence_extractions(
            mixed_extraction, threshold=Decimal("0.80")
        )

        assert len(low_conf) == 3  # All except base_year (100%)

    def test_empty_result_when_all_high(self):
        """Test returns empty list when all extractions are high confidence."""
        high_conf = LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="5%",
                    confidence=95,
                    source_text="5%",
                ),
                FieldExtraction(
                    field="base_year",
                    value="2020",
                    confidence=100,
                    source_text="2020",
                ),
            ],
        )

        low_conf = get_low_confidence_extractions(high_conf, Decimal("0.80"))
        assert len(low_conf) == 0

    def test_returns_actual_extraction_objects(self, mixed_extraction):
        """Test function returns actual FieldExtraction objects."""
        low_conf = get_low_confidence_extractions(
            mixed_extraction, threshold=Decimal("0.70")
        )

        # Verify these are FieldExtraction objects with all fields
        for extraction in low_conf:
            assert isinstance(extraction, FieldExtraction)
            assert extraction.field is not None
            assert extraction.value is not None
            assert extraction.confidence is not None
            assert extraction.source_text is not None


class TestConfidenceResult:
    """Test ConfidenceResult dataclass."""

    def test_dataclass_fields(self):
        """Test ConfidenceResult has all required fields."""
        result = ConfidenceResult(
            overall_score=Decimal("0.85"),
            field_scores={"pro_rata_share": Decimal("0.90")},
            needs_review=False,
            low_confidence_fields=[],
            threshold=Decimal("0.80"),
        )

        assert result.overall_score == Decimal("0.85")
        assert result.field_scores == {"pro_rata_share": Decimal("0.90")}
        assert result.needs_review is False
        assert result.low_confidence_fields == []
        assert result.threshold == Decimal("0.80")
