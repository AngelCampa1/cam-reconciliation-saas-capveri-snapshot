# Story T3.2: Extraction-to-Calculation Bridge

## Story Info
- **Epic**: T3 — Audit Pipeline & Report
- **Estimated Hours**: 8
- **Dependencies**: T2.2 (CamStatementExtractionResult model)
- **Status**: `pending`

## User Story
As a platform engineer, I want a bridge layer that converts extraction results into calculation engine inputs so that the tenant audit pipeline can reuse the existing `run_property_reconciliation()` engine without modifying its interface.

## Acceptance Criteria
- `ExtractionToCalculationBridge.convert()` accepts `LeaseExtractionResult` + `CamStatementExtractionResult` and returns `(ReconciliationInput, list[LeaseTerms], dict[UUID, ExpensePoolSummary])`
- Synthetic UUIDs are generated deterministically from audit context (no real DB records)
- `LeaseTerms` is populated from `LeaseExtractionResult` fields: `pro_rata_share`, `base_year`, `base_year_amount`, `cap_type`, `cap_rate`, `admin_fee_percentage`, `excluded_pools`
- `ExpensePoolSummary` entries are built from `CamStatementExtractionResult.line_items`, one per expense category
- `ReconciliationInput` uses property-level totals from the CAM statement: `total_rentable_sqft`, period dates
- All monetary values are `Decimal`, never `float`
- Missing optional fields in extraction results produce sensible defaults (e.g., no cap = `CapType.NONE`, no admin fee = `Decimal("0")`)
- Bridge raises `BridgeValidationError` with descriptive message when required fields are missing (e.g., no `pro_rata_share` in lease extraction)

## Technical Specifications

### Bridge Module

```python
# backend/app/services/tenant_audit/bridge.py
import logging
from datetime import date
from decimal import Decimal
from uuid import UUID, uuid5, NAMESPACE_URL

from pydantic import BaseModel, Field

from app.models.enums import BomaStandardVersion, CapType, PoolType
from app.services.calculation.expense_filter import ExpensePoolSummary
from app.services.calculation.orchestrator import ReconciliationInput
from app.services.calculation.tenant_share import LeaseTerms
from app.services.extraction.cam_statement_models import (
    CamStatementExtractionResult,
    CamLineItem,
)
from app.services.extraction.extraction_models import LeaseExtractionResult

logger = logging.getLogger(__name__)


class BridgeValidationError(ValueError):
    """Raised when extraction results cannot be bridged to calculation inputs."""

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        super().__init__(f"Bridge validation failed on '{field}': {message}")


# Deterministic UUID namespace for synthetic IDs
_TENANT_AUDIT_NS = UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")


def _synthetic_uuid(seed: str) -> UUID:
    """Generate a deterministic UUID from a seed string.

    Used to create stable IDs for synthetic property/lease/pool records
    that do not exist in the database. Deterministic so re-running the
    same audit produces the same UUIDs (helpful for debugging).
    """
    return uuid5(_TENANT_AUDIT_NS, seed)


# Map PoolType enum to gross-up applicability
_GROSS_UP_MAP: dict[PoolType, bool] = {
    PoolType.OPERATING: True,
    PoolType.TAX: False,
    PoolType.INSURANCE: False,
    PoolType.CAPITAL: False,
    PoolType.OTHER: True,
}


class ExtractionToCalculationBridge:
    """Converts extraction results into calculation engine inputs.

    The calculation engine (run_property_reconciliation) expects:
    - ReconciliationInput: property ID, period, total RSF
    - list[LeaseTerms]: one entry per tenant (tenant audit = single tenant)
    - dict[UUID, ExpensePoolSummary]: one entry per expense pool

    The extraction pipeline produces:
    - LeaseExtractionResult: pro_rata_share, caps, base year, admin fee
    - CamStatementExtractionResult: line items, totals, period, RSF

    This bridge converts between the two schemas.
    """

    def convert(
        self,
        lease_extraction: LeaseExtractionResult,
        cam_extraction: CamStatementExtractionResult,
        audit_id: str | None = None,
    ) -> tuple[ReconciliationInput, list[LeaseTerms], dict[UUID, ExpensePoolSummary]]:
        """
        Convert extraction results into calculation engine inputs.

        Args:
            lease_extraction: Extracted lease recovery terms.
            cam_extraction: Extracted CAM statement values.
            audit_id: Optional audit ID for deterministic UUID generation.

        Returns:
            Tuple of (ReconciliationInput, [LeaseTerms], {pool_id: ExpensePoolSummary}).

        Raises:
            BridgeValidationError: When required fields are missing or invalid.
        """
        seed_prefix = audit_id or "tenant-audit"

        # Validate required fields
        self._validate_inputs(lease_extraction, cam_extraction)

        # Build ReconciliationInput
        recon_input = self._build_reconciliation_input(
            cam_extraction, seed_prefix
        )

        # Build LeaseTerms (single tenant)
        lease_terms = self._build_lease_terms(
            lease_extraction, cam_extraction, seed_prefix
        )

        # Build ExpensePoolSummary entries
        pool_summaries = self._build_pool_summaries(
            cam_extraction, seed_prefix
        )

        return recon_input, [lease_terms], pool_summaries

    def _validate_inputs(
        self,
        lease: LeaseExtractionResult,
        cam: CamStatementExtractionResult,
    ) -> None:
        """Validate that required fields are present in both extractions."""
        if lease.pro_rata_share is None:
            raise BridgeValidationError(
                "pro_rata_share",
                "Lease extraction is missing pro_rata_share (required)",
            )

        if lease.pro_rata_share <= Decimal("0"):
            raise BridgeValidationError(
                "pro_rata_share",
                f"pro_rata_share must be positive, got {lease.pro_rata_share}",
            )

        if not cam.line_items:
            raise BridgeValidationError(
                "line_items",
                "CAM statement has no line items to calculate against",
            )

        if cam.total_operating_expenses is None:
            raise BridgeValidationError(
                "total_operating_expenses",
                "CAM statement is missing total operating expenses",
            )

        if cam.total_rentable_sqft is None or cam.total_rentable_sqft <= Decimal("0"):
            raise BridgeValidationError(
                "total_rentable_sqft",
                f"CAM statement has invalid total rentable sqft: {cam.total_rentable_sqft}",
            )

    def _build_reconciliation_input(
        self,
        cam: CamStatementExtractionResult,
        seed_prefix: str,
    ) -> ReconciliationInput:
        """Build ReconciliationInput from CAM statement extraction."""
        property_id = _synthetic_uuid(f"{seed_prefix}:property")

        return ReconciliationInput(
            property_id=property_id,
            period_start=cam.period_start or date(date.today().year - 1, 1, 1),
            period_end=cam.period_end or date(date.today().year - 1, 12, 31),
            total_rentable_sqft=cam.total_rentable_sqft,
            target_occupancy=cam.target_occupancy or Decimal("0.95"),
            boma_standard_version=BomaStandardVersion.V2024,
        )

    def _build_lease_terms(
        self,
        lease: LeaseExtractionResult,
        cam: CamStatementExtractionResult,
        seed_prefix: str,
    ) -> LeaseTerms:
        """Build LeaseTerms from lease extraction + CAM statement context."""
        lease_id = _synthetic_uuid(f"{seed_prefix}:lease")

        # Derive tenant sqft from pro_rata_share and total RSF
        tenant_sqft: Decimal | None = None
        if cam.total_rentable_sqft and lease.pro_rata_share:
            tenant_sqft = (
                cam.total_rentable_sqft * lease.pro_rata_share
            ).quantize(Decimal("0.01"))

        # Map excluded_pools from PoolType enum to pool name strings
        excluded_pool_names = [p.value for p in lease.excluded_pools]

        return LeaseTerms(
            lease_id=lease_id,
            tenant_name=cam.tenant_name or "Tenant",
            pro_rata_share=lease.pro_rata_share,
            admin_fee_percentage=lease.admin_fee_percentage or Decimal("0"),
            admin_fee_cap=None,
            admin_fee_excludes_tax_insurance=False,
            admin_fee_excluded_pools=[],
            tenant_sqft=tenant_sqft,
            expense_stops=None,
            base_year=lease.base_year,
            base_year_amount=lease.base_year_amount,
            cap_type=lease.cap_type.value if lease.cap_type else CapType.NONE,
            cap_rate=lease.cap_rate,
            excluded_pools=excluded_pool_names,
            start_date=cam.period_start,
            end_date=cam.period_end,
        )

    def _build_pool_summaries(
        self,
        cam: CamStatementExtractionResult,
        seed_prefix: str,
    ) -> dict[UUID, ExpensePoolSummary]:
        """Build ExpensePoolSummary dict from CAM statement line items.

        Each line item in the CAM statement becomes a separate expense pool.
        The pool_type is inferred from the line item category, which determines
        gross-up applicability.
        """
        pool_summaries: dict[UUID, ExpensePoolSummary] = {}

        for i, item in enumerate(cam.line_items):
            pool_id = _synthetic_uuid(f"{seed_prefix}:pool:{i}:{item.category}")
            pool_type = self._infer_pool_type(item)
            is_gross_up = _GROSS_UP_MAP.get(pool_type, True)

            pool_summaries[pool_id] = ExpensePoolSummary(
                pool_id=pool_id,
                pool_name=item.description or item.category,
                pool_type=pool_type.value,
                total_amount=item.amount,
                is_gross_up_applicable=is_gross_up,
            )

        return pool_summaries

    def _infer_pool_type(self, item: CamLineItem) -> PoolType:
        """Infer PoolType from a CAM line item's category string.

        Uses keyword matching on the category/description to classify
        the expense into one of the standard pool types.
        """
        category_lower = item.category.lower()
        description_lower = (item.description or "").lower()
        combined = f"{category_lower} {description_lower}"

        if any(kw in combined for kw in ["tax", "real estate tax", "property tax"]):
            return PoolType.TAX

        if any(kw in combined for kw in ["insurance", "liability", "casualty"]):
            return PoolType.INSURANCE

        if any(kw in combined for kw in [
            "capital", "capex", "improvement", "replacement",
            "roof", "hvac replacement", "parking lot resurfacing",
        ]):
            return PoolType.CAPITAL

        return PoolType.OPERATING
```

### Bridge Output Models (for documentation)

```python
# The bridge produces these existing types (no new models needed):

# From app.services.calculation.orchestrator:
# ReconciliationInput(
#     property_id=UUID,      # synthetic
#     period_start=date,     # from CAM statement
#     period_end=date,       # from CAM statement
#     total_rentable_sqft=Decimal,  # from CAM statement
#     target_occupancy=Decimal,     # from CAM statement or default 0.95
# )

# From app.services.calculation.tenant_share:
# LeaseTerms(
#     lease_id=UUID,         # synthetic
#     tenant_name=str,       # from CAM statement
#     pro_rata_share=Decimal,       # from lease extraction
#     admin_fee_percentage=Decimal,  # from lease extraction
#     base_year=int | None,          # from lease extraction
#     base_year_amount=Decimal | None, # from lease extraction
#     cap_type=str,                  # from lease extraction
#     cap_rate=Decimal | None,       # from lease extraction
#     excluded_pools=list[str],      # from lease extraction
#     tenant_sqft=Decimal | None,    # derived: total_rsf * pro_rata_share
# )

# From app.services.calculation.expense_filter:
# dict[UUID, ExpensePoolSummary(
#     pool_id=UUID,          # synthetic
#     pool_name=str,         # from CAM line item
#     pool_type=str,         # inferred from category keywords
#     total_amount=Decimal,  # from CAM line item
#     is_gross_up_applicable=bool,  # based on pool_type
# )]
```

## Test Cases
- Test `convert()` with valid lease + CAM extraction produces all three output components
- Test `ReconciliationInput` has correct period dates from CAM extraction
- Test `ReconciliationInput` uses default period (previous calendar year) when CAM extraction has no dates
- Test `LeaseTerms.pro_rata_share` matches `LeaseExtractionResult.pro_rata_share` exactly
- Test `LeaseTerms.tenant_sqft` is calculated as `total_rentable_sqft * pro_rata_share`
- Test `LeaseTerms.cap_type` and `cap_rate` are passed through from lease extraction
- Test `LeaseTerms.base_year` and `base_year_amount` are passed through from lease extraction
- Test `LeaseTerms.admin_fee_percentage` defaults to `Decimal("0")` when not in lease extraction
- Test `LeaseTerms.excluded_pools` maps `PoolType` enum values to string list
- Test pool summaries contain one entry per CAM line item
- Test pool type inference: "Real Estate Taxes" -> `PoolType.TAX`
- Test pool type inference: "Property Insurance" -> `PoolType.INSURANCE`
- Test pool type inference: "HVAC Replacement" -> `PoolType.CAPITAL`
- Test pool type inference: "Janitorial" -> `PoolType.OPERATING` (default)
- Test gross-up applicability: operating pools are `True`, tax/insurance/capital are `False`
- Test `BridgeValidationError` raised when `pro_rata_share` is missing
- Test `BridgeValidationError` raised when `pro_rata_share` is zero or negative
- Test `BridgeValidationError` raised when CAM statement has no line items
- Test `BridgeValidationError` raised when `total_operating_expenses` is missing
- Test `BridgeValidationError` raised when `total_rentable_sqft` is zero or missing
- Test synthetic UUIDs are deterministic: same inputs produce same UUIDs
- Test synthetic UUIDs differ for different audit_id values
- Test all monetary values in output are `Decimal`, not `float`
- Test end-to-end: bridge output can be passed directly to `run_property_reconciliation()` without error

## Definition of Done
- [ ] `ExtractionToCalculationBridge` class implemented in `backend/app/services/tenant_audit/bridge.py`
- [ ] `BridgeValidationError` exception with field name and descriptive message
- [ ] `convert()` returns `(ReconciliationInput, list[LeaseTerms], dict[UUID, ExpensePoolSummary])`
- [ ] Synthetic UUIDs generated deterministically via `uuid5`
- [ ] Pool type inference from category keywords with keyword-matching logic
- [ ] Gross-up applicability mapped from pool type
- [ ] Missing optional fields produce sensible defaults
- [ ] All monetary values use `Decimal`
- [ ] All unit tests pass with `pytest --tb=short`
- [ ] Coverage maintained at >= 95%
