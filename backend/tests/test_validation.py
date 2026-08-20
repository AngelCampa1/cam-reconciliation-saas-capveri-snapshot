"""
Unit tests for lease extraction validation layer.

Tests cover:
- Business rule validation for financial values
- Reasonableness checks for dates
- Consistency checks between related fields
- Warning vs error distinction
- Edge cases and boundary conditions
"""

from decimal import Decimal

import pytest

from app.models.enums import CapType
from app.services.extraction.extraction_models import (
    FieldExtraction,
    LeaseExtractionResult,
)
from app.services.extraction.validation import (
    LeaseExtractionValidator,
    ValidationError,
    ValidationResult,
    ValidationWarning,
    validate_extraction,
)


class TestLeaseExtractionValidator:
    """Test LeaseExtractionValidator class."""

    @pytest.fixture
    def validator(self):
        """Create validator instance."""
        return LeaseExtractionValidator()

    @pytest.fixture
    def valid_extraction(self):
        """Create a valid lease extraction result."""
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
            ],
        )

    def test_valid_extraction_passes(self, validator, valid_extraction):
        """Test that a valid extraction passes without warnings or errors."""
        result = validator.validate(valid_extraction)

        assert result.is_valid
        assert len(result.errors) == 0
        assert len(result.warnings) == 0

    def test_pro_rata_share_zero_warning(self, validator):
        """Test warning when pro-rata share is 0%."""
        extraction = LeaseExtractionResult(
            pro_rata_share=Decimal("0"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="0%",
                    confidence=90,
                    source_text="no CAM charges",
                ),
            ],
        )

        result = validator.validate(extraction)

        assert result.is_valid  # Warnings don't make it invalid
        assert len(result.errors) == 0
        assert len(result.warnings) == 1
        assert result.warnings[0].field == "pro_rata_share"
        assert "0%" in result.warnings[0].message
        assert result.warnings[0].severity == "warning"

    def test_pro_rata_share_one_hundred_percent_info(self, validator):
        """Test info message when pro-rata share is 100%."""
        extraction = LeaseExtractionResult(
            pro_rata_share=Decimal("1"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="100%",
                    confidence=95,
                    source_text="single tenant building",
                ),
            ],
        )

        result = validator.validate(extraction)

        assert result.is_valid
        assert len(result.errors) == 0
        assert len(result.warnings) == 1
        assert result.warnings[0].field == "pro_rata_share"
        assert "100%" in result.warnings[0].message
        assert result.warnings[0].severity == "info"

    def test_base_year_future_warning(self, validator):
        """Test warning when base year is in the future."""
        extraction = LeaseExtractionResult(
            base_year=2099,
            pro_rata_share=Decimal("0.05"),
            extractions=[
                FieldExtraction(
                    field="base_year",
                    value="2099",
                    confidence=80,
                    source_text="Base Year: 2099",
                ),
            ],
        )

        result = validator.validate(extraction)

        assert result.is_valid
        assert len(result.errors) == 0
        assert len(result.warnings) == 1
        assert result.warnings[0].field == "base_year"
        assert "future" in result.warnings[0].message.lower()

    def test_base_year_exactly_1990_no_warning(self, validator):
        """Test no warning when base year is exactly 1990 (boundary)."""
        extraction = LeaseExtractionResult(
            base_year=1990,
            pro_rata_share=Decimal("0.05"),
            extractions=[
                FieldExtraction(
                    field="base_year",
                    value="1990",
                    confidence=90,
                    source_text="Base Year: 1990",
                ),
            ],
        )

        result = validator.validate(extraction)

        assert result.is_valid
        assert len(result.errors) == 0
        assert len(result.warnings) == 0  # 1990 is valid

    def test_cap_rate_exceeds_25_percent_warning(self, validator):
        """Test warning when cap rate exceeds 25%."""
        extraction = LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.50"),  # 50% cap rate is unusual
            extractions=[
                FieldExtraction(
                    field="cap_rate",
                    value="50%",
                    confidence=70,
                    source_text="50% annual cap",
                ),
            ],
        )

        result = validator.validate(extraction)

        assert result.is_valid
        assert len(result.errors) == 0
        assert len(result.warnings) == 1
        assert result.warnings[0].field == "cap_rate"
        assert "25%" in result.warnings[0].message

    def test_admin_fee_exactly_20_percent_no_warning(self, validator):
        """Test no warning when admin fee is exactly 20% (boundary)."""
        extraction = LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            admin_fee_percentage=Decimal("0.20"),  # Max allowed
            extractions=[
                FieldExtraction(
                    field="admin_fee_percentage",
                    value="20%",
                    confidence=90,
                    source_text="20% administrative fee",
                ),
            ],
        )

        result = validator.validate(extraction)

        assert result.is_valid
        assert len(result.errors) == 0
        # No warning at exactly 20% since Pydantic allows it
        warnings_for_admin = [
            w for w in result.warnings if w.field == "admin_fee_percentage"
        ]
        assert len(warnings_for_admin) == 0

    def test_cap_type_without_cap_rate_error(self, validator):
        """Test error when cap type is set but cap rate is missing."""
        # This is caught by Pydantic validator first
        with pytest.raises(ValueError, match="cap_rate is required"):
            LeaseExtractionResult(
                pro_rata_share=Decimal("0.05"),
                cap_type=CapType.CUMULATIVE,
                cap_rate=None,  # Missing cap rate
                extractions=[
                    FieldExtraction(
                        field="cap_type",
                        value="cumulative",
                        confidence=90,
                        source_text="cumulative cap",
                    ),
                ],
            )

    def test_cap_rate_without_cap_type_error(self, validator):
        """Test error when cap rate exists but cap type is NONE.

        FIX EXT-6: Changed from warning to error for symmetric validation.
        Cap rate without cap type is invalid data since you can't apply a cap
        without knowing the cap type.
        """
        extraction = LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.NONE,
            cap_rate=Decimal("0.05"),  # Cap rate specified
            extractions=[
                FieldExtraction(
                    field="cap_rate",
                    value="5%",
                    confidence=80,
                    source_text="5% cap",
                ),
            ],
        )

        result = validator.validate(extraction)

        # FIX EXT-6: Now an error, not a warning
        assert not result.is_valid
        assert len(result.errors) == 1
        assert result.errors[0].field == "cap_type"
        assert "cap type is required" in result.errors[0].message.lower()

    def test_multiple_warnings_and_errors(self, validator):
        """Test multiple warnings and errors are collected.

        FIX EXT-6: cap_rate without cap_type is now an error, not warning.
        """
        extraction = LeaseExtractionResult(
            base_year=2099,  # Future year warning
            pro_rata_share=Decimal("0"),  # Zero percent warning
            cap_type=CapType.NONE,
            cap_rate=Decimal(
                "0.30"
            ),  # Cap rate > 25% warning + cap type mismatch ERROR
            extractions=[
                FieldExtraction(
                    field="base_year",
                    value="2099",
                    confidence=80,
                    source_text="Base Year: 2099",
                ),
                FieldExtraction(
                    field="pro_rata_share",
                    value="0%",
                    confidence=75,
                    source_text="no CAM",
                ),
                FieldExtraction(
                    field="cap_rate",
                    value="30%",
                    confidence=70,
                    source_text="30% cap",
                ),
            ],
        )

        result = validator.validate(extraction)

        # FIX EXT-6: Now invalid because cap_rate without cap_type is an error
        assert not result.is_valid
        assert len(result.errors) == 1  # cap type mismatch is now an error
        assert len(result.warnings) == 3  # Future year, 0%, >25%

    def test_validation_result_dataclass(self):
        """Test ValidationResult dataclass structure."""
        result = ValidationResult(
            warnings=[
                ValidationWarning(
                    field="test_field",
                    message="test warning",
                    value=Decimal("0.5"),
                    severity="warning",
                )
            ],
            errors=[],
            is_valid=True,
        )

        assert len(result.warnings) == 1
        assert len(result.errors) == 0
        assert result.is_valid

    def test_validation_warning_dataclass(self):
        """Test ValidationWarning dataclass structure."""
        warning = ValidationWarning(
            field="pro_rata_share",
            message="Test warning",
            value=Decimal("0.05"),
            severity="info",
        )

        assert warning.field == "pro_rata_share"
        assert warning.message == "Test warning"
        assert warning.value == Decimal("0.05")
        assert warning.severity == "info"

    def test_validation_error_dataclass(self):
        """Test ValidationError dataclass structure."""
        error = ValidationError(
            field="cap_rate",
            message="Cap rate required",
            value=None,
        )

        assert error.field == "cap_rate"
        assert error.message == "Cap rate required"
        assert error.value is None


class TestValidateExtractionHelper:
    """Test validate_extraction convenience function."""

    def test_validate_extraction_function(self):
        """Test convenience function works."""
        extraction = LeaseExtractionResult(
            base_year=2020,
            pro_rata_share=Decimal("0.05"),
            extractions=[
                FieldExtraction(
                    field="base_year",
                    value="2020",
                    confidence=95,
                    source_text="Base Year: 2020",
                ),
            ],
        )

        result = validate_extraction(extraction)

        assert isinstance(result, ValidationResult)
        assert result.is_valid
        assert len(result.errors) == 0
        assert len(result.warnings) == 0

    def test_validate_extraction_with_warnings(self):
        """Test convenience function returns warnings."""
        extraction = LeaseExtractionResult(
            base_year=2099,  # Future year
            pro_rata_share=Decimal("0.05"),
            extractions=[
                FieldExtraction(
                    field="base_year",
                    value="2099",
                    confidence=80,
                    source_text="Base Year: 2099",
                ),
            ],
        )

        result = validate_extraction(extraction)

        assert result.is_valid
        assert len(result.warnings) == 1
        assert result.warnings[0].field == "base_year"
