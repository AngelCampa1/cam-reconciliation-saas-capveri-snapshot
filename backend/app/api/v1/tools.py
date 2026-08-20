"""
Public tools API endpoints.

Free-tier calculator endpoints — no authentication required.
All financial math is handled by deterministic Python services (no LLMs).
"""

from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.calculation.boma_2024 import (
    BomaCalculationInput,
    BomaCalculationResult,
    calculate_boma_2024,
)
from app.services.calculation.fixed_cam_modeler import (
    FixedCamModelerInput,
    FixedCamModelerResult,
    calculate_fixed_cam_model,
)
from app.services.calculation.hcad_tax_normalizer import (
    HcadInput,
    calculate_hcad_tax_normalization,
)

router = APIRouter(prefix="/tools", tags=["Tools"])

# Returned (422) when a schema-valid payload carries magnitudes so large the
# Decimal math overflows the arithmetic context. These are public calculators
# for real-world CRE figures, not arbitrary-precision compute services.
_OUT_OF_RANGE_DETAIL = (
    "One or more values are too large to compute. Enter realistic figures."
)


@router.post(
    "/boma-2024-calculator",
    response_model=BomaCalculationResult,
    status_code=status.HTTP_200_OK,
    summary="BOMA 2024 Rentable Area Calculator",
    description=(
        "Public endpoint — no authentication required. "
        "Computes hidden rentable SF under BOMA 2024 standard by deriving the "
        "existing load factor and applying it to expanded usable SF (including "
        "outdoor amenity spaces). Returns both free-tier (SF) and financial "
        "projection results."
    ),
)
async def calculate_boma_rentable_area(
    payload: BomaCalculationInput,
) -> BomaCalculationResult:
    """Calculate BOMA 2024 hidden rentable area and financial projections."""
    try:
        return calculate_boma_2024(payload)
    except (ValueError, ArithmeticError) as exc:
        # ArithmeticError covers decimal.InvalidOperation: a schema-valid but
        # absurdly large input can push the Decimal math past the context
        # precision on quantize. That is unprocessable input (422), not a 500.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                _OUT_OF_RANGE_DETAIL if isinstance(exc, ArithmeticError) else str(exc)
            ),
        ) from exc


class HcadNormalizerResponse(BaseModel):
    """Response from HCAD Tax Base Year Normalizer."""

    adjusted_base_year: Decimal
    original_passthrough: Decimal
    corrected_passthrough: Decimal
    recovery_delta: Decimal
    capped_corrected_passthrough: Decimal | None = None
    capped_recovery: Decimal | None = None
    cap_was_applied: bool | None = None


@router.post(
    "/hcad-tax-normalizer/calculate",
    response_model=HcadNormalizerResponse,
    summary="HCAD Tax Base Year Normalizer",
    description=(
        "Public endpoint — no auth required. "
        "Quantifies the retroactive CAM tax recovery opportunity when an HCAD "
        "ARB protest lowers the tenant's base year expense stop."
    ),
)
async def calculate_hcad(payload: HcadInput) -> HcadNormalizerResponse:
    """Calculate HCAD tax base year normalization."""
    try:
        result = calculate_hcad_tax_normalization(payload)
    except (ValueError, ArithmeticError) as exc:
        # See calculate_boma_rentable_area: absurd magnitudes overflow Decimal
        # quantize (ArithmeticError) — unprocessable input, not a server error.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                _OUT_OF_RANGE_DETAIL if isinstance(exc, ArithmeticError) else str(exc)
            ),
        ) from exc
    return HcadNormalizerResponse(
        adjusted_base_year=result.adjusted_base_year,
        original_passthrough=result.original_passthrough,
        corrected_passthrough=result.corrected_passthrough,
        recovery_delta=result.recovery_delta,
        capped_corrected_passthrough=result.capped_corrected_passthrough,
        capped_recovery=result.capped_recovery,
        cap_was_applied=result.cap_was_applied,
    )


@router.post(
    "/fixed-cam-modeler",
    response_model=FixedCamModelerResult,
    status_code=status.HTTP_200_OK,
    summary="Fixed CAM vs Traditional Reconciliation Modeler",
    description="Public endpoint — no authentication required.",
)
async def calculate_fixed_cam(
    payload: FixedCamModelerInput,
) -> FixedCamModelerResult:
    """Compare Fixed CAM revenue vs traditional reconciliation recovery."""
    try:
        return calculate_fixed_cam_model(payload)
    except (ValueError, ArithmeticError) as exc:
        # See calculate_boma_rentable_area: absurd magnitudes overflow Decimal
        # quantize (ArithmeticError) — unprocessable input, not a server error.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                _OUT_OF_RANGE_DETAIL if isinstance(exc, ArithmeticError) else str(exc)
            ),
        ) from exc
