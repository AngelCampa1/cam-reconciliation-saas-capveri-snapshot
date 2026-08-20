"""
HCAD Tax Base Year Normalizer.

Texas ARB retroactive property tax reductions lower the tenant's base year
expense stop. This means more tax can legally pass through to tenants.
Landlords who win HCAD protests often miss this recovery permanently.

Formula:
    adjusted_base = original_base_year - retroactive_adjustment

    original_passthrough  = max(0, current_year_tax - original_base_year) * pro_rata
    corrected_passthrough = max(0, current_year_tax - adjusted_base) * pro_rata

    recovery_delta = corrected_passthrough - original_passthrough  # always >= 0

    Cap (optional — non-cumulative percentage cap):
        max_allowed = original_passthrough * (1 + cap_rate)
        capped_corrected = min(corrected_passthrough, max_allowed)
        capped_recovery  = capped_corrected - original_passthrough
"""

from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.services.calculation.base_year import (
    BaseYearInput,
    calculate_base_year_increase,
)
from app.services.calculation.caps import calculate_non_cumulative_cap


class HcadInput(BaseModel):
    """Input for HCAD tax base year normalization."""

    original_base_year_assessment: Decimal = Field(
        ge=0,
        description="Original base year property tax assessment ($)",
    )
    retroactive_adjustment: Decimal = Field(
        ge=0,
        description="ARB retroactive reduction to the base year assessment ($)",
    )
    current_year_tax: Decimal = Field(
        gt=0,
        description="Current year property tax amount ($)",
    )
    pro_rata_pct: Decimal = Field(
        gt=0,
        le=1,
        description="Tenant's pro-rata share as decimal (e.g. 0.05 = 5%)",
    )
    cap_rate: Decimal | None = Field(
        default=None,
        gt=0,
        lt=1,
        description="Lease expense cap rate as decimal (e.g. 0.05 = 5%), optional",
    )

    @model_validator(mode="after")
    def retro_adj_cannot_exceed_base(self) -> "HcadInput":
        if self.retroactive_adjustment > self.original_base_year_assessment:
            raise ValueError(
                "retroactive_adjustment cannot exceed original_base_year_assessment"
            )
        return self


class HcadResult(BaseModel):
    """Result of HCAD tax base year normalization."""

    adjusted_base_year: Decimal = Field(
        description="Base year assessment after retroactive adjustment"
    )
    original_passthrough: Decimal = Field(
        description="Tax the tenant was billed (based on original base year)"
    )
    corrected_passthrough: Decimal = Field(
        description="Tax the tenant should have been billed (based on adjusted base)"
    )
    recovery_delta: Decimal = Field(
        description="Uncapped recovery opportunity (corrected - original)"
    )
    capped_corrected_passthrough: Decimal | None = Field(
        default=None,
        description="Corrected passthrough after applying lease cap (if cap provided)",
    )
    capped_recovery: Decimal | None = Field(
        default=None,
        description="Recovery opportunity after applying lease cap (if cap provided)",
    )
    cap_was_applied: bool | None = Field(
        default=None,
        description="True if the cap reduced the corrected passthrough",
    )


def calculate_hcad_tax_normalization(input_data: HcadInput) -> HcadResult:
    """
    Calculate the retroactive recovery opportunity from an HCAD ARB protest.

    Reuses calculate_base_year_increase() for both the original and corrected
    passthroughs. Optionally applies calculate_non_cumulative_cap() to model
    lease expense caps.

    Args:
        input_data: HCAD normalization inputs

    Returns:
        HcadResult with original/corrected passthroughs and recovery delta
    """
    adjusted_base = (
        input_data.original_base_year_assessment - input_data.retroactive_adjustment
    )

    # Original passthrough: what was billed (using original base year)
    original_result = calculate_base_year_increase(
        BaseYearInput(
            current_year_expenses=input_data.current_year_tax,
            base_year_amount=input_data.original_base_year_assessment,
            pro_rata_share=input_data.pro_rata_pct,
        )
    )

    # Corrected passthrough: what should have been billed (using adjusted base)
    corrected_result = calculate_base_year_increase(
        BaseYearInput(
            current_year_expenses=input_data.current_year_tax,
            base_year_amount=adjusted_base,
            pro_rata_share=input_data.pro_rata_pct,
        )
    )

    original_passthrough = original_result.tenant_share
    corrected_passthrough = corrected_result.tenant_share
    recovery_delta = corrected_passthrough - original_passthrough

    # Optional cap calculation
    capped_corrected_passthrough: Decimal | None = None
    capped_recovery: Decimal | None = None
    cap_was_applied: bool | None = None

    if input_data.cap_rate is not None:
        cap_result = calculate_non_cumulative_cap(
            current_amount=corrected_passthrough,
            prior_amount=original_passthrough,
            cap_rate=input_data.cap_rate,
        )
        capped_corrected_passthrough = cap_result.capped_amount
        capped_recovery = capped_corrected_passthrough - original_passthrough
        cap_was_applied = cap_result.cap_applied

    return HcadResult(
        adjusted_base_year=adjusted_base,
        original_passthrough=original_passthrough,
        corrected_passthrough=corrected_passthrough,
        recovery_delta=recovery_delta,
        capped_corrected_passthrough=capped_corrected_passthrough,
        capped_recovery=capped_recovery,
        cap_was_applied=cap_was_applied,
    )
