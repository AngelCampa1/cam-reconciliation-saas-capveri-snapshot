"""
Unit tests for extraction prompts and models.

Tests cover:
- Prompt template structure and formatting
- build_extraction_prompt function
- LeaseExtractionResult validation
- FieldExtraction validation
- Confidence scoring patterns
- JSON schema compliance
"""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.models.enums import CapType, PoolType
from app.services.extraction.extraction_models import (
    FieldExtraction,
    LeaseExtractionResult,
)
from app.services.extraction.prompts import (
    LEASE_EXTRACTION_PROMPT,
    build_extraction_prompt,
)

#######################
# Sample Lease Fixtures
#######################

SAMPLE_LEASE_EXPLICIT = """
COMMERCIAL LEASE AGREEMENT

ARTICLE V - OPERATING EXPENSES

Tenant shall pay as additional rent Tenant's Pro-Rata Share of all Operating Expenses.

Tenant's Pro-Rata Share: 5.25% (being Tenant's 1,575 square feet of the
30,000 square foot Building).

Base Year: 2020

Operating Expenses shall be subject to an annual cap of 5% per year, cumulative.

Landlord may charge an administrative fee of 15% of recoverable expenses.
"""

SAMPLE_LEASE_PERCENTAGE_VARIANTS = """
ARTICLE VIII - CAM RECONCILIATION

Tenant's Proportionate Share shall be twelve and one-half percent (12.5%).

Expenses shall not increase more than five percent (5%) annually on a
non-cumulative basis.
"""

SAMPLE_LEASE_FRACTION = """
Tenant shall pay one-twentieth (1/20) of all Common Area Maintenance expenses.

No caps or limitations apply.
"""

SAMPLE_LEASE_MINIMAL = """
Tenant's pro-rata share: 0.08 (8%)

Base Year: 2019
"""

SAMPLE_LEASE_COMPLEX = """
SECTION 4 - EXPENSE RECOVERY

Pro-Rata Share: 7.35%
Base Year: 2021 (expenses totaling $250,000)
Cap: 4% annual compounding cumulative cap
Admin Fee: 10%
Excluded: Capital improvements and property taxes
"""


class TestPromptTemplate:
    """Test prompt template structure and content."""

    def test_prompt_contains_json_schema(self):
        """Test prompt includes the JSON schema definition."""
        assert "base_year" in LEASE_EXTRACTION_PROMPT
        assert "pro_rata_share" in LEASE_EXTRACTION_PROMPT
        assert "cap_type" in LEASE_EXTRACTION_PROMPT
        assert "extractions" in LEASE_EXTRACTION_PROMPT
        assert "confidence" in LEASE_EXTRACTION_PROMPT
        assert "source_text" in LEASE_EXTRACTION_PROMPT

    def test_prompt_contains_field_definitions(self):
        """Test prompt includes detailed field definitions."""
        assert "Field Definitions" in LEASE_EXTRACTION_PROMPT
        assert "pro_rata_share" in LEASE_EXTRACTION_PROMPT
        assert "REQUIRED" in LEASE_EXTRACTION_PROMPT

    def test_prompt_contains_extraction_guidelines(self):
        """Test prompt includes extraction guidelines."""
        assert "Extraction Guidelines" in LEASE_EXTRACTION_PROMPT
        assert "Percentage Conversion" in LEASE_EXTRACTION_PROMPT
        assert "Confidence Scoring" in LEASE_EXTRACTION_PROMPT

    def test_prompt_contains_management_fee_guidance(self):
        """Prompt distinguishes management fee from admin fee."""
        assert "management_fee_percentage" in LEASE_EXTRACTION_PROMPT
        assert "Management Fee vs Admin Fee" in LEASE_EXTRACTION_PROMPT
        assert "administrative and overhead" in LEASE_EXTRACTION_PROMPT

    def test_prompt_specifies_cap_types(self):
        """Test prompt lists all valid cap types."""
        assert "none" in LEASE_EXTRACTION_PROMPT
        assert "non_cumulative" in LEASE_EXTRACTION_PROMPT
        assert "cumulative" in LEASE_EXTRACTION_PROMPT
        assert "cumulative_compounding" in LEASE_EXTRACTION_PROMPT

    def test_prompt_specifies_confidence_ranges(self):
        """Test prompt defines confidence score ranges."""
        assert "90-100" in LEASE_EXTRACTION_PROMPT
        assert "70-89" in LEASE_EXTRACTION_PROMPT
        assert "explicit" in LEASE_EXTRACTION_PROMPT.lower()
        assert "inferred" in LEASE_EXTRACTION_PROMPT.lower()


class TestBuildExtractionPrompt:
    """Test build_extraction_prompt function."""

    def test_build_prompt_appends_document_text(self):
        """Test function appends document text to prompt."""
        document = "Sample lease text here"
        result = build_extraction_prompt(document)

        assert LEASE_EXTRACTION_PROMPT in result
        assert document in result
        assert result.endswith(document)

    def test_build_prompt_handles_empty_document(self):
        """Test function handles empty document gracefully."""
        result = build_extraction_prompt("")

        assert LEASE_EXTRACTION_PROMPT in result
        assert result.endswith("")

    def test_build_prompt_handles_long_document(self):
        """Test function handles long documents."""
        document = "Long lease text\n" * 1000
        result = build_extraction_prompt(document)

        assert LEASE_EXTRACTION_PROMPT in result
        assert document in result


class TestFieldExtraction:
    """Test FieldExtraction model validation."""

    def test_valid_field_extraction(self):
        """Test creating valid FieldExtraction."""
        extraction = FieldExtraction(
            field="pro_rata_share",
            value="5.25%",
            confidence=95,
            source_text="Tenant's Pro-Rata Share: 5.25%",
        )

        assert extraction.field == "pro_rata_share"
        assert extraction.value == "5.25%"
        assert extraction.confidence == 95
        assert extraction.source_text == "Tenant's Pro-Rata Share: 5.25%"

    def test_confidence_bounds(self):
        """Test confidence must be 0-100."""
        # Valid boundaries
        FieldExtraction(
            field="base_year",
            value="2020",
            confidence=0,
            source_text="Base Year: 2020",
        )
        FieldExtraction(
            field="base_year",
            value="2020",
            confidence=100,
            source_text="Base Year: 2020",
        )

        # Invalid: below 0
        with pytest.raises(ValidationError):
            FieldExtraction(
                field="base_year",
                value="2020",
                confidence=-1,
                source_text="Base Year: 2020",
            )

        # Invalid: above 100
        with pytest.raises(ValidationError):
            FieldExtraction(
                field="base_year",
                value="2020",
                confidence=101,
                source_text="Base Year: 2020",
            )

    def test_field_name_required(self):
        """Test field name is required and non-empty."""
        with pytest.raises(ValidationError):
            FieldExtraction(
                field="",
                value="test",
                confidence=80,
                source_text="test",
            )

    def test_source_text_required(self):
        """Test source text is required and non-empty."""
        with pytest.raises(ValidationError):
            FieldExtraction(
                field="base_year",
                value="2020",
                confidence=90,
                source_text="",
            )


class TestLeaseExtractionResult:
    """Test LeaseExtractionResult model validation."""

    def test_valid_extraction_result_minimal(self):
        """Test creating valid extraction result with minimal fields."""
        result = LeaseExtractionResult(
            pro_rata_share=Decimal("0.0525"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="5.25%",
                    confidence=95,
                    source_text="Pro-Rata Share: 5.25%",
                )
            ],
        )

        assert result.pro_rata_share == Decimal("0.0525")
        assert result.base_year is None
        assert result.cap_type == CapType.NONE
        assert result.admin_fee_percentage == Decimal("0")
        assert result.management_fee_percentage is None
        assert len(result.extractions) == 1

    def test_valid_extraction_result_complete(self):
        """Test creating extraction result with all fields."""
        result = LeaseExtractionResult(
            base_year=2020,
            base_year_amount=Decimal("250000.00"),
            gross_up_base_year=True,
            pro_rata_share=Decimal("0.0735"),
            cap_type=CapType.CUMULATIVE_COMPOUNDING,
            cap_rate=Decimal("0.04"),
            admin_fee_percentage=Decimal("0.10"),
            excluded_pools=[PoolType.CAPITAL, PoolType.TAX],
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="7.35%",
                    confidence=95,
                    source_text="Pro-Rata Share: 7.35%",
                ),
                FieldExtraction(
                    field="base_year",
                    value="2020",
                    confidence=100,
                    source_text="Base Year: 2020",
                ),
            ],
        )

        assert result.base_year == 2020
        assert result.base_year_amount == Decimal("250000.00")
        assert result.gross_up_base_year is True
        assert result.pro_rata_share == Decimal("0.0735")
        assert result.cap_type == CapType.CUMULATIVE_COMPOUNDING
        assert result.cap_rate == Decimal("0.04")
        assert result.admin_fee_percentage == Decimal("0.10")
        assert result.excluded_pools == [PoolType.CAPITAL, PoolType.TAX]
        assert len(result.extractions) == 2

    def test_pro_rata_share_required(self):
        """Test pro_rata_share is required."""
        with pytest.raises(ValidationError):
            LeaseExtractionResult(
                extractions=[
                    FieldExtraction(
                        field="base_year",
                        value="2020",
                        confidence=90,
                        source_text="Base Year: 2020",
                    )
                ]
            )

    def test_pro_rata_share_bounds(self):
        """Test pro_rata_share must be 0-1."""
        # Valid boundaries
        LeaseExtractionResult(
            pro_rata_share=Decimal("0"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="0%",
                    confidence=90,
                    source_text="0%",
                )
            ],
        )
        LeaseExtractionResult(
            pro_rata_share=Decimal("1"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="100%",
                    confidence=90,
                    source_text="100%",
                )
            ],
        )

        # Invalid: above 1
        with pytest.raises(ValidationError):
            LeaseExtractionResult(
                pro_rata_share=Decimal("1.5"),
                extractions=[
                    FieldExtraction(
                        field="pro_rata_share",
                        value="150%",
                        confidence=90,
                        source_text="150%",
                    )
                ],
            )

    def test_cap_rate_required_when_cap_type_not_none(self):
        """Test cap_rate is required when cap_type is not NONE."""
        # Valid: cap_type=NONE, cap_rate=None
        LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.NONE,
            cap_rate=None,
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="5%",
                    confidence=90,
                    source_text="5%",
                )
            ],
        )

        # Valid: cap_type set, cap_rate provided
        LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.NON_CUMULATIVE,
            cap_rate=Decimal("0.05"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="5%",
                    confidence=90,
                    source_text="5%",
                )
            ],
        )

        # Invalid: cap_type set, cap_rate=None
        with pytest.raises(ValidationError, match="cap_rate is required"):
            LeaseExtractionResult(
                pro_rata_share=Decimal("0.05"),
                cap_type=CapType.CUMULATIVE,
                cap_rate=None,
                extractions=[
                    FieldExtraction(
                        field="pro_rata_share",
                        value="5%",
                        confidence=90,
                        source_text="5%",
                    )
                ],
            )

    def test_admin_fee_percentage_bounds(self):
        """Test admin_fee_percentage must be 0-0.20."""
        # Valid boundaries
        LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            admin_fee_percentage=Decimal("0"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="5%",
                    confidence=90,
                    source_text="5%",
                )
            ],
        )
        LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            admin_fee_percentage=Decimal("0.20"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="5%",
                    confidence=90,
                    source_text="5%",
                )
            ],
        )

        # Invalid: above 0.20
        with pytest.raises(ValidationError):
            LeaseExtractionResult(
                pro_rata_share=Decimal("0.05"),
                admin_fee_percentage=Decimal("0.25"),
                extractions=[
                    FieldExtraction(
                        field="pro_rata_share",
                        value="5%",
                        confidence=90,
                        source_text="5%",
                    )
                ],
            )

    def test_management_fee_percentage_bounds(self):
        """Test management_fee_percentage must be 0-0.20 and defaults to None."""
        # Default None when omitted
        default_result = LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="5%",
                    confidence=90,
                    source_text="5%",
                )
            ],
        )
        assert default_result.management_fee_percentage is None

        # Valid boundary 0.20
        valid = LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            management_fee_percentage=Decimal("0.20"),
            extractions=[
                FieldExtraction(
                    field="management_fee_percentage",
                    value="20%",
                    confidence=90,
                    source_text="management fee of 20% of operating expenses",
                )
            ],
        )
        assert valid.management_fee_percentage == Decimal("0.20")

        # Invalid: above 0.20
        with pytest.raises(ValidationError):
            LeaseExtractionResult(
                pro_rata_share=Decimal("0.05"),
                management_fee_percentage=Decimal("0.25"),
                extractions=[
                    FieldExtraction(
                        field="management_fee_percentage",
                        value="25%",
                        confidence=90,
                        source_text="25%",
                    )
                ],
            )

    def test_extractions_required_non_empty(self):
        """Test extractions array is required and non-empty."""
        with pytest.raises(ValidationError):
            LeaseExtractionResult(
                pro_rata_share=Decimal("0.05"),
                extractions=[],
            )


class TestLeaseExtractionResultMethods:
    """Test LeaseExtractionResult helper methods."""

    @pytest.fixture
    def sample_result(self):
        """Create sample extraction result for testing."""
        return LeaseExtractionResult(
            base_year=2020,
            pro_rata_share=Decimal("0.0525"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),
            admin_fee_percentage=Decimal("0.15"),
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
                    field="cap_rate",
                    value="5%",
                    confidence=65,
                    source_text="expenses shall not exceed 5% annually",
                ),
            ],
        )

    def test_get_extraction(self, sample_result):
        """Test get_extraction retrieves correct extraction."""
        pro_rata_extraction = sample_result.get_extraction("pro_rata_share")
        assert pro_rata_extraction is not None
        assert pro_rata_extraction.field == "pro_rata_share"
        assert pro_rata_extraction.confidence == 95

        base_year_extraction = sample_result.get_extraction("base_year")
        assert base_year_extraction is not None
        assert base_year_extraction.value == "2020"

    def test_get_extraction_not_found(self, sample_result):
        """Test get_extraction returns None for missing field."""
        missing = sample_result.get_extraction("nonexistent_field")
        assert missing is None

    def test_get_low_confidence_fields_default_threshold(self, sample_result):
        """Test get_low_confidence_fields with default threshold (70)."""
        low_conf = sample_result.get_low_confidence_fields()
        assert len(low_conf) == 1
        assert low_conf[0].field == "cap_rate"
        assert low_conf[0].confidence == 65

    def test_get_low_confidence_fields_custom_threshold(self, sample_result):
        """Test get_low_confidence_fields with custom threshold."""
        # Threshold 96: only cap_rate (65) and pro_rata (95) qualify
        low_conf = sample_result.get_low_confidence_fields(threshold=96)
        assert len(low_conf) == 2

        # Threshold 50: no fields qualify
        low_conf = sample_result.get_low_confidence_fields(threshold=50)
        assert len(low_conf) == 0

    def test_to_recovery_profile_dict(self, sample_result):
        """Test to_recovery_profile_dict creates valid dict."""
        profile_dict = sample_result.to_recovery_profile_dict()

        assert profile_dict["base_year"] == 2020
        assert profile_dict["pro_rata_share"] == Decimal("0.0525")
        assert profile_dict["cap_type"] == CapType.CUMULATIVE
        assert profile_dict["cap_rate"] == Decimal("0.05")
        assert profile_dict["admin_fee_percentage"] == Decimal("0.15")
        assert profile_dict["management_fee_percentage"] is None
        assert "extractions" not in profile_dict  # Metadata excluded
        assert profile_dict["accounting_basis"] is None

    def test_to_recovery_profile_dict_with_management_fee(self):
        """management_fee_percentage flows through to_recovery_profile_dict."""
        result = LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            management_fee_percentage=Decimal("0.04"),
            extractions=[
                FieldExtraction(
                    field="management_fee_percentage",
                    value="4%",
                    confidence=90,
                    source_text="administrative and overhead charge equal to 4%",
                ),
            ],
        )
        profile = result.to_recovery_profile_dict()
        assert profile["management_fee_percentage"] == Decimal("0.04")
        # Distinct from admin fee, which stays at its default
        assert profile["admin_fee_percentage"] == Decimal("0")

    def test_to_recovery_profile_dict_with_accounting_basis(self):
        """Test accounting_basis flows through to_recovery_profile_dict."""
        result = LeaseExtractionResult(
            pro_rata_share=Decimal("0.05"),
            accounting_basis="accrual",
            extractions=[
                FieldExtraction(
                    field="pro_rata_share",
                    value="5%",
                    confidence=90,
                    source_text="Tenant share: 5%",
                ),
            ],
        )
        profile = result.to_recovery_profile_dict()
        assert profile["accounting_basis"] == "accrual"

    def test_extraction_result_accepts_accounting_basis_values(self):
        """LeaseExtractionResult accepts cash, accrual, or None."""
        for basis in ["cash", "accrual", None]:
            result = LeaseExtractionResult(
                pro_rata_share=Decimal("0.05"),
                accounting_basis=basis,
                extractions=[
                    FieldExtraction(
                        field="pro_rata_share",
                        value="5%",
                        confidence=90,
                        source_text="Tenant share: 5%",
                    ),
                ],
            )
            assert result.accounting_basis == basis
