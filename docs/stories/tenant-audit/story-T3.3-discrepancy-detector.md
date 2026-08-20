# Story T3.3: Discrepancy Detector

## Story Info
- **Epic**: T3 — Audit Pipeline & Report
- **Estimated Hours**: 6
- **Dependencies**: T3.2 (bridge produces calculation results comparable to CAM extraction)
- **Status**: `pending`

## User Story
As a commercial tenant, I want the system to compare the landlord's CAM statement values against independently calculated correct values so that I can see exactly where and by how much my charges are incorrect.

## Acceptance Criteria
- `DiscrepancyDetector.detect()` compares `CamStatementExtractionResult` (landlord's numbers) against `PropertyReconciliation` (our calculation)
- Each discrepancy includes: category, landlord_value, calculated_value, difference, impact_amount, and a human-readable explanation
- Discrepancy categories: `pro_rata_share`, `gross_up`, `cap_enforcement`, `admin_fee`, `base_year_stop`, `total`, `capital_classification`, `occupancy_adjustment`
- $1.00 tolerance applied to all monetary comparisons to avoid false positives from rounding
- Percentage comparisons use 0.001 (0.1%) tolerance
- Discrepancies are sorted by absolute `impact_amount` descending (biggest issue first)
- `total_overcharge` is the sum of all positive discrepancy impact amounts (what the tenant is being overcharged)
- Zero-impact comparisons (within tolerance) are not included in the discrepancy list
- All monetary values use `Decimal`

## Technical Specifications

### Discrepancy Models

```python
# backend/app/services/tenant_audit/discrepancy_detector.py
import logging
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum

from pydantic import BaseModel, Field

from app.services.calculation.orchestrator import PropertyReconciliation
from app.services.extraction.cam_statement_models import CamStatementExtractionResult

logger = logging.getLogger(__name__)

# Tolerance thresholds
MONETARY_TOLERANCE = Decimal("1.00")   # $1 for rounding differences
PERCENTAGE_TOLERANCE = Decimal("0.001")  # 0.1% for share/rate comparisons


class DiscrepancyCategory(str, Enum):
    """Categories of CAM reconciliation discrepancies."""

    PRO_RATA_SHARE = "pro_rata_share"
    GROSS_UP = "gross_up"
    CAP_ENFORCEMENT = "cap_enforcement"
    ADMIN_FEE = "admin_fee"
    BASE_YEAR_STOP = "base_year_stop"
    TOTAL = "total"
    CAPITAL_CLASSIFICATION = "capital_classification"
    OCCUPANCY_ADJUSTMENT = "occupancy_adjustment"


class Discrepancy(BaseModel):
    """A single discrepancy between landlord's statement and calculated values."""

    category: DiscrepancyCategory = Field(
        description="Type of discrepancy found"
    )
    field_name: str = Field(
        description="Specific field being compared (e.g., 'tenant_share_after_cap')"
    )
    landlord_value: Decimal = Field(
        description="Value stated on the landlord's CAM reconciliation"
    )
    calculated_value: Decimal = Field(
        description="Independently calculated correct value"
    )
    difference: Decimal = Field(
        description="landlord_value - calculated_value (positive = overcharge)"
    )
    impact_amount: Decimal = Field(
        description="Dollar impact on tenant (positive = tenant overpaying)"
    )
    explanation: str = Field(
        description="Human-readable explanation of the discrepancy"
    )
    severity: str = Field(
        description="low (<$100), medium ($100-$1000), high (>$1000)"
    )


class DiscrepancyReport(BaseModel):
    """Complete discrepancy analysis between landlord's statement and calculation."""

    discrepancies: list[Discrepancy] = Field(default_factory=list)
    total_overcharge: Decimal = Field(
        default=Decimal("0"),
        description="Sum of all positive impact amounts (how much tenant is overpaying)",
    )
    total_undercharge: Decimal = Field(
        default=Decimal("0"),
        description="Sum of all negative impact amounts (how much tenant is underpaying)",
    )
    checks_performed: int = Field(
        default=0,
        description="Total number of comparison checks performed",
    )
    discrepancy_count: int = Field(
        default=0,
        description="Number of material discrepancies found",
    )


class DiscrepancyDetector:
    """Compares landlord's CAM statement against independently calculated values.

    The detector performs category-specific comparisons and produces a
    prioritized list of discrepancies with dollar impact and explanations.
    """

    def detect(
        self,
        cam_extraction: CamStatementExtractionResult,
        calculation: PropertyReconciliation,
    ) -> list[Discrepancy]:
        """
        Compare CAM statement values against calculation results.

        Args:
            cam_extraction: Landlord's stated values from the CAM statement.
            calculation: Independently calculated reconciliation result.

        Returns:
            List of Discrepancy objects sorted by absolute impact_amount descending.
        """
        discrepancies: list[Discrepancy] = []
        tenant_recon = calculation.tenant_reconciliations[0] if calculation.tenant_reconciliations else None

        if tenant_recon is None:
            logger.warning("No tenant reconciliation in calculation result")
            return discrepancies

        # Check 1: Pro-rata share
        discrepancies.extend(
            self._check_pro_rata_share(cam_extraction, tenant_recon, calculation)
        )

        # Check 2: Gross-up
        discrepancies.extend(
            self._check_gross_up(cam_extraction, calculation)
        )

        # Check 3: Cap enforcement
        discrepancies.extend(
            self._check_cap_enforcement(cam_extraction, tenant_recon)
        )

        # Check 4: Admin fee
        discrepancies.extend(
            self._check_admin_fee(cam_extraction, tenant_recon)
        )

        # Check 5: Base year / expense stop
        discrepancies.extend(
            self._check_base_year_stop(cam_extraction, tenant_recon)
        )

        # Check 6: Total tenant recovery
        discrepancies.extend(
            self._check_total(cam_extraction, tenant_recon)
        )

        # Check 7: Capital vs operating classification
        discrepancies.extend(
            self._check_capital_classification(cam_extraction, calculation)
        )

        # Check 8: Occupancy adjustment
        discrepancies.extend(
            self._check_occupancy_adjustment(cam_extraction, calculation)
        )

        # Sort by absolute impact descending
        discrepancies.sort(key=lambda d: abs(d.impact_amount), reverse=True)

        return discrepancies

    def build_report(self, discrepancies: list[Discrepancy]) -> DiscrepancyReport:
        """Build a summary report from a list of discrepancies."""
        total_overcharge = sum(
            d.impact_amount for d in discrepancies if d.impact_amount > Decimal("0")
        )
        total_undercharge = sum(
            d.impact_amount for d in discrepancies if d.impact_amount < Decimal("0")
        )
        return DiscrepancyReport(
            discrepancies=discrepancies,
            total_overcharge=total_overcharge,
            total_undercharge=total_undercharge,
            checks_performed=8,
            discrepancy_count=len(discrepancies),
        )

    def _check_pro_rata_share(
        self, cam, tenant_recon, calculation
    ) -> list[Discrepancy]:
        """Compare stated pro-rata share against calculated share."""
        results = []
        if cam.stated_pro_rata_share is not None:
            landlord_share = cam.stated_pro_rata_share
            calculated_share = tenant_recon.pro_rata_share

            diff = landlord_share - calculated_share
            if abs(diff) > PERCENTAGE_TOLERANCE:
                # Impact = difference in share * total recoverable expenses
                impact = diff * calculation.total_grossed_up_expenses
                impact = impact.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                results.append(Discrepancy(
                    category=DiscrepancyCategory.PRO_RATA_SHARE,
                    field_name="pro_rata_share",
                    landlord_value=landlord_share,
                    calculated_value=calculated_share,
                    difference=diff,
                    impact_amount=impact,
                    explanation=(
                        f"Landlord states pro-rata share as "
                        f"{landlord_share:.4%} but lease terms indicate "
                        f"{calculated_share:.4%}. This {"overcharges" if impact > 0 else "undercharges"} "
                        f"the tenant by ${abs(impact):,.2f}."
                    ),
                    severity=self._severity(impact),
                ))

        return results

    def _check_gross_up(self, cam, calculation) -> list[Discrepancy]:
        """Compare stated grossed-up expenses against calculated gross-up."""
        results = []
        if cam.stated_grossed_up_expenses is not None:
            landlord_val = cam.stated_grossed_up_expenses
            calculated_val = calculation.total_grossed_up_expenses

            diff = landlord_val - calculated_val
            if abs(diff) > MONETARY_TOLERANCE:
                results.append(Discrepancy(
                    category=DiscrepancyCategory.GROSS_UP,
                    field_name="grossed_up_expenses",
                    landlord_value=landlord_val,
                    calculated_value=calculated_val,
                    difference=diff,
                    impact_amount=(diff * calculation.tenant_reconciliations[0].pro_rata_share).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    ),
                    explanation=(
                        f"Landlord states grossed-up expenses as ${landlord_val:,.2f} "
                        f"but calculated gross-up (using {calculation.actual_occupancy:.1%} "
                        f"actual occupancy, {calculation.target_occupancy:.1%} target) "
                        f"produces ${calculated_val:,.2f}."
                    ),
                    severity=self._severity(diff),
                ))

        return results

    def _check_cap_enforcement(self, cam, tenant_recon) -> list[Discrepancy]:
        """Check if expense cap was properly applied."""
        results = []
        if cam.stated_tenant_share is not None and tenant_recon.tenant_share_after_cap != tenant_recon.tenant_share_before_cap:
            # Cap was applied in our calculation — check if landlord also applied it
            landlord_val = cam.stated_tenant_share
            calculated_val = tenant_recon.tenant_share_after_cap

            diff = landlord_val - calculated_val
            if abs(diff) > MONETARY_TOLERANCE:
                cap_savings = tenant_recon.tenant_share_before_cap - tenant_recon.tenant_share_after_cap
                results.append(Discrepancy(
                    category=DiscrepancyCategory.CAP_ENFORCEMENT,
                    field_name="tenant_share_after_cap",
                    landlord_value=landlord_val,
                    calculated_value=calculated_val,
                    difference=diff,
                    impact_amount=diff.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                    explanation=(
                        f"The lease includes an expense cap that should limit increases. "
                        f"Correct application saves the tenant ${cap_savings:,.2f}, "
                        f"but the landlord's statement shows ${landlord_val:,.2f} "
                        f"instead of the capped amount ${calculated_val:,.2f}."
                    ),
                    severity=self._severity(diff),
                ))

        return results

    def _check_admin_fee(self, cam, tenant_recon) -> list[Discrepancy]:
        """Compare stated admin fee against calculated admin fee."""
        results = []
        if cam.stated_admin_fee is not None:
            landlord_val = cam.stated_admin_fee
            calculated_val = tenant_recon.admin_fee

            diff = landlord_val - calculated_val
            if abs(diff) > MONETARY_TOLERANCE:
                results.append(Discrepancy(
                    category=DiscrepancyCategory.ADMIN_FEE,
                    field_name="admin_fee",
                    landlord_value=landlord_val,
                    calculated_value=calculated_val,
                    difference=diff,
                    impact_amount=diff.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                    explanation=(
                        f"Landlord charges admin fee of ${landlord_val:,.2f} but "
                        f"the lease-specified admin fee percentage applied to the "
                        f"correct expense base produces ${calculated_val:,.2f}."
                    ),
                    severity=self._severity(diff),
                ))

        return results

    def _check_base_year_stop(self, cam, tenant_recon) -> list[Discrepancy]:
        """Check base year / expense stop application."""
        results = []
        if (
            cam.stated_base_year_amount is not None
            and tenant_recon.base_year_amount is not None
        ):
            landlord_val = cam.stated_base_year_amount
            calculated_val = tenant_recon.base_year_amount

            diff = landlord_val - calculated_val
            if abs(diff) > MONETARY_TOLERANCE:
                results.append(Discrepancy(
                    category=DiscrepancyCategory.BASE_YEAR_STOP,
                    field_name="base_year_amount",
                    landlord_value=landlord_val,
                    calculated_value=calculated_val,
                    difference=diff,
                    impact_amount=diff.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                    explanation=(
                        f"The base year amount used by the landlord (${landlord_val:,.2f}) "
                        f"differs from the lease-documented base year amount "
                        f"(${calculated_val:,.2f}). A lower base year amount increases "
                        f"the tenant's share of expenses above the stop."
                    ),
                    severity=self._severity(diff),
                ))

        return results

    def _check_total(self, cam, tenant_recon) -> list[Discrepancy]:
        """Compare stated total tenant charge against calculated total recovery."""
        results = []
        if cam.stated_total_tenant_charge is not None:
            landlord_val = cam.stated_total_tenant_charge
            calculated_val = tenant_recon.total_recovery

            diff = landlord_val - calculated_val
            if abs(diff) > MONETARY_TOLERANCE:
                results.append(Discrepancy(
                    category=DiscrepancyCategory.TOTAL,
                    field_name="total_recovery",
                    landlord_value=landlord_val,
                    calculated_value=calculated_val,
                    difference=diff,
                    impact_amount=diff.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                    explanation=(
                        f"The landlord's total charge of ${landlord_val:,.2f} differs "
                        f"from the independently calculated total of ${calculated_val:,.2f}. "
                        f"Net difference: ${abs(diff):,.2f} "
                        f"{"overcharge" if diff > 0 else "undercharge"}."
                    ),
                    severity=self._severity(diff),
                ))

        return results

    def _check_capital_classification(self, cam, calculation) -> list[Discrepancy]:
        """Check for expenses that should be classified as capital (non-recoverable)."""
        results = []
        if cam.potentially_capital_items:
            total_capital = sum(
                item.amount for item in cam.potentially_capital_items
            )
            if total_capital > MONETARY_TOLERANCE:
                tenant_share = calculation.tenant_reconciliations[0].pro_rata_share if calculation.tenant_reconciliations else Decimal("0")
                impact = (total_capital * tenant_share).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
                results.append(Discrepancy(
                    category=DiscrepancyCategory.CAPITAL_CLASSIFICATION,
                    field_name="capital_expenses_in_operating",
                    landlord_value=total_capital,
                    calculated_value=Decimal("0"),
                    difference=total_capital,
                    impact_amount=impact,
                    explanation=(
                        f"${total_capital:,.2f} in expenses appear to be capital in nature "
                        f"(roof replacement, HVAC, parking lot resurfacing, etc.) but are "
                        f"included in operating expenses. If these are capital, the tenant's "
                        f"share should exclude them, saving approximately ${impact:,.2f}."
                    ),
                    severity=self._severity(impact),
                ))

        return results

    def _check_occupancy_adjustment(self, cam, calculation) -> list[Discrepancy]:
        """Check if occupancy-based gross-up was applied correctly."""
        results = []
        if cam.stated_occupancy is not None:
            landlord_occupancy = cam.stated_occupancy
            calculated_occupancy = calculation.actual_occupancy

            diff = landlord_occupancy - calculated_occupancy
            if abs(diff) > PERCENTAGE_TOLERANCE:
                # Impact: different occupancy means different gross-up factor
                # which affects total recoverable expenses
                tenant_share = calculation.tenant_reconciliations[0].pro_rata_share if calculation.tenant_reconciliations else Decimal("0")
                expense_diff = abs(
                    calculation.total_grossed_up_expenses - calculation.total_operating_expenses
                )
                impact = (expense_diff * tenant_share * abs(diff)).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )

                results.append(Discrepancy(
                    category=DiscrepancyCategory.OCCUPANCY_ADJUSTMENT,
                    field_name="actual_occupancy",
                    landlord_value=landlord_occupancy,
                    calculated_value=calculated_occupancy,
                    difference=diff,
                    impact_amount=impact,
                    explanation=(
                        f"Landlord states building occupancy as {landlord_occupancy:.1%} "
                        f"but calculation shows {calculated_occupancy:.1%}. A lower occupancy "
                        f"increases the gross-up factor and therefore the tenant's share."
                    ),
                    severity=self._severity(impact),
                ))

        return results

    @staticmethod
    def _severity(impact: Decimal) -> str:
        """Classify severity by absolute dollar impact."""
        abs_impact = abs(impact)
        if abs_impact > Decimal("1000"):
            return "high"
        if abs_impact > Decimal("100"):
            return "medium"
        return "low"
```

## Test Cases
- Test `detect()` with perfectly matching values (no discrepancies) returns empty list
- Test `detect()` with all values within $1 tolerance returns empty list (rounding tolerance)
- Test pro-rata share discrepancy: landlord states 5.50%, calculation shows 5.25%, verify correct impact amount
- Test pro-rata share within 0.1% tolerance produces no discrepancy
- Test gross-up discrepancy: landlord states $120,000 grossed-up, calculation shows $115,000
- Test cap enforcement discrepancy: landlord ignores cap, our calculation applies it
- Test admin fee discrepancy: landlord charges $5,000 admin fee, calculation shows $3,750
- Test base year stop discrepancy: landlord uses wrong base year amount
- Test total discrepancy: landlord's total charge differs from calculated total recovery
- Test capital classification: expenses flagged as capital but included in operating
- Test occupancy adjustment: landlord uses different occupancy rate
- Test discrepancies are sorted by absolute impact_amount descending
- Test severity classification: <$100 = low, $100-$1000 = medium, >$1000 = high
- Test `build_report()` correctly sums overcharge and undercharge amounts
- Test `build_report()` with mixed over/under discrepancies
- Test all monetary values in discrepancies are `Decimal`
- Test with empty `tenant_reconciliations` list returns empty discrepancy list
- Test with `None` stated values (fields not present on CAM statement) skips those checks
- Test tolerance is exactly $1.00: $1.01 difference produces discrepancy, $1.00 does not
- Test percentage tolerance: 0.11% difference in pro-rata share produces discrepancy, 0.09% does not

## Definition of Done
- [ ] `DiscrepancyDetector` class implemented in `backend/app/services/tenant_audit/discrepancy_detector.py`
- [ ] `Discrepancy` model with all required fields
- [ ] `DiscrepancyCategory` enum with all 8 categories
- [ ] `DiscrepancyReport` model with summary statistics
- [ ] $1.00 monetary tolerance and 0.1% percentage tolerance applied
- [ ] 8 comparison checks implemented: pro-rata share, gross-up, cap enforcement, admin fee, base year stop, total, capital classification, occupancy adjustment
- [ ] Each discrepancy has a human-readable `explanation` string
- [ ] Severity classification: low/medium/high based on dollar impact
- [ ] Results sorted by absolute impact_amount descending
- [ ] All monetary values use `Decimal`
- [ ] All unit tests pass with `pytest --tb=short`
- [ ] Coverage maintained at >= 95%
