"""
Pydantic models for LLM extraction responses.

These models validate the JSON output from Claude to ensure it matches
the expected schema and includes confidence scores for human verification.
"""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from app.models.enums import AccountingBasis, CapType, PoolType


class FieldExtraction(BaseModel):
    """Individual field extraction with confidence and source reference.

    This model captures not just the extracted value, but also metadata
    about the extraction quality for human-in-the-loop verification.
    """

    field: str = Field(
        ...,
        description="Name of the field that was extracted",
        min_length=1,
    )
    value: str = Field(
        ...,
        description="Extracted value as string (before type conversion)",
    )
    confidence: int = Field(
        ...,
        ge=0,
        le=100,
        description="Confidence score: 90-100 explicit, 70-89 inferred, <70 uncertain",
    )
    source_text: str = Field(
        ...,
        description="Exact quote from lease document supporting this extraction",
        min_length=1,
    )
    page: int | None = Field(
        None,
        ge=1,
        description="Page number where source text was found (1-indexed)",
    )
    bounding_box: dict[str, float] | None = Field(
        None,
        description=(
            "Bounding box coordinates {left, top, width, height} "
            "in normalized 0-1 scale"
        ),
    )


class LeaseExtractionResult(BaseModel):
    """Complete extraction result from Claude including all recovery profile fields.

    This model matches the JSON schema defined in LEASE_EXTRACTION_PROMPT
    and validates that Claude's response conforms to expectations.
    """

    # Base Year Terms
    base_year: int | None = Field(
        None,
        ge=1990,
        le=2100,
        description="Base year for expense stop calculation",
    )
    base_year_amount: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        description="Pre-calculated base year expense amount",
    )
    gross_up_base_year: bool = Field(
        default=False,
        description="Whether to gross-up base year if occupancy < 95%",
    )

    # Tenant Share (REQUIRED)
    pro_rata_share: Decimal = Field(
        ...,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Tenant's proportionate share as decimal (e.g., 0.0525 for 5.25%)",
    )

    # Cap Terms
    cap_type: CapType = Field(
        default=CapType.NONE,
        description="Type of cap applied to expense increases",
    )
    cap_rate: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Cap rate as decimal (e.g., 0.05 for 5% annual cap)",
    )

    # Admin Fee
    admin_fee_percentage: Decimal = Field(
        default=Decimal("0"),
        ge=Decimal("0"),
        le=Decimal("0.20"),
        description="Admin fee as decimal (0-20%)",
    )

    # Management Fee Percentage (distinct from admin fee)
    management_fee_percentage: Decimal | None = Field(
        default=None,
        ge=Decimal("0"),
        le=Decimal("0.20"),
        description=(
            "Permitted management fee as decimal (0-20%), distinct from admin "
            "fee. None when no management fee cap is found in the lease."
        ),
    )

    # Exclusions
    excluded_pools: list[PoolType] = Field(
        default_factory=list,
        description="Expense pool types excluded from recovery",
    )

    # Accounting Basis
    accounting_basis: AccountingBasis | None = Field(
        default=None,
        description="Cash or accrual basis for GL date filtering",
    )

    # Extraction Metadata
    extractions: list[FieldExtraction] = Field(
        ...,
        description="Detailed extraction data for each field (audit trail)",
        min_length=1,
    )

    @field_validator("cap_rate")
    @classmethod
    def validate_cap_rate_when_cap_exists(
        cls, v: Decimal | None, info: ValidationInfo
    ) -> Decimal | None:
        """Validate cap_rate is provided when cap_type is not NONE."""
        # Note: info.data contains previously validated fields
        cap_type = info.data.get("cap_type", CapType.NONE)
        if cap_type != CapType.NONE and v is None:
            raise ValueError(
                f"cap_rate is required when cap_type is '{cap_type.value}'"
            )
        return v

    def get_extraction(self, field_name: str) -> FieldExtraction | None:
        """Get extraction metadata for a specific field.

        Args:
            field_name: Name of the field to retrieve.

        Returns:
            FieldExtraction object if found, None otherwise.

        Example:
            ```python
            result = LeaseExtractionResult.model_validate(json_response)
            pro_rata_extraction = result.get_extraction("pro_rata_share")
            if pro_rata_extraction and pro_rata_extraction.confidence < 70:
                print(f"Low confidence: {pro_rata_extraction.source_text}")
            ```
        """
        for extraction in self.extractions:
            if extraction.field == field_name:
                return extraction
        return None

    def get_low_confidence_fields(self, threshold: int = 70) -> list[FieldExtraction]:
        """Get all fields with confidence below threshold.

        Args:
            threshold: Minimum confidence score (default 70).

        Returns:
            List of FieldExtraction objects with confidence < threshold.

        Example:
            ```python
            result = LeaseExtractionResult.model_validate(json_response)
            low_conf = result.get_low_confidence_fields(threshold=80)
            if low_conf:
                print(f"Review needed for: {[e.field for e in low_conf]}")
            ```
        """
        return [e for e in self.extractions if e.confidence < threshold]

    def to_recovery_profile_dict(self) -> dict[str, Any]:
        """Convert to dictionary matching LeaseRecoveryProfile schema.

        Returns:
            Dictionary with keys matching LeaseRecoveryProfile model,
            excluding the extractions metadata.

        Example:
            ```python
            result = LeaseExtractionResult.model_validate(json_response)
            profile_data = result.to_recovery_profile_dict()
            profile = LeaseRecoveryProfile(**profile_data)
            ```
        """
        return {
            "base_year": self.base_year,
            "base_year_amount": self.base_year_amount,
            "gross_up_base_year": self.gross_up_base_year,
            "pro_rata_share": self.pro_rata_share,
            "cap_type": self.cap_type,
            "cap_rate": self.cap_rate,
            "admin_fee_percentage": self.admin_fee_percentage,
            "management_fee_percentage": self.management_fee_percentage,
            "excluded_pools": self.excluded_pools,
            "accounting_basis": self.accounting_basis,
        }
