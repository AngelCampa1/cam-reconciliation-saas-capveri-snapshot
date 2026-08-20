# Story T2.2: CAM Extraction Model and Validation

## Story Info
- **Epic**: T2 — CAM Statement Extraction
- **Estimated Hours**: 8
- **Dependencies**: None (can be developed in parallel with T2.1; models match the prompt schema)
- **Status**: `pending`

## User Story
As a tenant auditor, I want extracted CAM statement data validated against a strict Pydantic schema with per-field confidence scoring so that downstream audit calculations receive clean, typed data with transparent quality indicators.

## Acceptance Criteria
- `CamStatementExtractionResult` Pydantic model validates the full JSON schema from the extraction prompt
- Nested models: `ReconciliationPeriod`, `ExpenseLineItem`, `CamAdjustments`, `CamTotals`, `OtherAdjustment`
- All monetary fields use `Decimal` (never `float`)
- Expense classification enforced via `ExpenseClassification` enum (operating, tax, insurance, capital, other)
- Per-field confidence scores stored in `extractions` list using the existing `FieldExtraction` model
- `get_low_confidence_fields(threshold)` returns fields below the given threshold
- `get_extraction(field_name)` retrieves extraction metadata by dot-notation field path
- Cross-field validation: if `pro_rata_share_stated` is provided and `tenant_rsf` and `building_rsf` are both provided, warn if `tenant_rsf / building_rsf` diverges from `pro_rata_share_stated` by more than 1%
- Totals validation: if `balance_due` is provided along with `total_tenant_share` and `estimated_charges_paid`, warn if the math does not reconcile within $0.01
- All Decimal fields use proper `ge`/`le` bounds in Field definitions
- CAM-specific confidence weights defined for weighted scoring

## Technical Specifications

### File to Create: `backend/app/services/extraction/cam_statement_models.py`

```python
"""
Pydantic models for CAM reconciliation statement extraction responses.

These models validate the JSON output from Claude when extracting data
from landlord-provided CAM statements. Unlike LeaseExtractionResult
(which captures recovery terms), these models capture reconciliation
actuals: expense line items, adjustments, and totals.

All monetary fields use Decimal. No floats allowed for financial data.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.services.extraction.extraction_models import FieldExtraction


class ExpenseClassification(str, Enum):
    """Classification of CAM expense line items.

    Maps to the pool types used in the landlord-side calculation engine,
    but is extracted from the statement rather than configured in a lease.
    """

    OPERATING = "operating"
    TAX = "tax"
    INSURANCE = "insurance"
    CAPITAL = "capital"
    OTHER = "other"


class ReconciliationPeriod(BaseModel):
    """Time period covered by the CAM reconciliation statement.

    Attributes:
        start_date: First day of the reconciliation period.
        end_date: Last day of the reconciliation period.
        fiscal_year: The fiscal year as integer (e.g., 2024).
    """

    model_config = ConfigDict(frozen=True)

    start_date: date = Field(
        ...,
        description="First day of reconciliation period (YYYY-MM-DD)",
    )
    end_date: date = Field(
        ...,
        description="Last day of reconciliation period (YYYY-MM-DD)",
    )
    fiscal_year: int = Field(
        ...,
        ge=2000,
        le=2100,
        description="Fiscal year of the reconciliation",
    )


class ExpenseLineItem(BaseModel):
    """Single expense category extracted from the CAM statement.

    Each line item represents one row in the expense breakdown section
    of the reconciliation statement.

    Attributes:
        category: Expense category name (e.g., "Property Taxes").
        description: Additional description if provided.
        gross_amount: Total property-level expense for this category.
        tenant_share_amount: Tenant's allocated share if shown separately.
        classification: Expense pool classification.
        account_code: GL account code if shown on the statement.
    """

    model_config = ConfigDict(frozen=True)

    category: str = Field(
        ...,
        min_length=1,
        description="Expense category name",
    )
    description: str | None = Field(
        None,
        description="Additional description if provided",
    )
    gross_amount: Decimal = Field(
        ...,
        description="Total property-level expense amount",
    )
    tenant_share_amount: Decimal | None = Field(
        None,
        description="Tenant's allocated share if shown separately",
    )
    classification: ExpenseClassification = Field(
        ...,
        description="Expense pool classification",
    )
    account_code: str | None = Field(
        None,
        description="GL account code if shown",
    )


class OtherAdjustment(BaseModel):
    """An adjustment not covered by the standard adjustment fields.

    Captures miscellaneous labeled adjustments that appear on some
    CAM statements (e.g., "Snow Removal Credit", "Audit Adjustment").
    """

    model_config = ConfigDict(frozen=True)

    label: str = Field(
        ...,
        min_length=1,
        description="Adjustment label as shown on the statement",
    )
    amount: Decimal = Field(
        ...,
        description="Adjustment amount (positive=charge, negative=credit)",
    )


class CamAdjustments(BaseModel):
    """Adjustments applied to arrive at the tenant's final CAM share.

    These represent the landlord's adjustments between gross expenses
    and the tenant's final share. The audit engine will independently
    recalculate these based on lease terms and compare.

    Attributes:
        gross_up_amount: Dollar amount of gross-up adjustment.
        gross_up_occupancy_pct: Occupancy % used for gross-up (0-1).
        occupancy_adjustment: Occupancy-based adjustment amount.
        base_year_stop_amount: Base year or expense stop deduction.
        cap_adjustment: Cap-related adjustment amount.
        admin_fee_amount: Administrative/management fee dollar amount.
        admin_fee_pct: Administrative fee percentage as decimal.
        other_adjustments: Any other labeled adjustments.
    """

    model_config = ConfigDict(frozen=True)

    gross_up_amount: Decimal | None = Field(
        None,
        description="Dollar amount of gross-up adjustment",
    )
    gross_up_occupancy_pct: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Occupancy percentage used for gross-up calculation",
    )
    occupancy_adjustment: Decimal | None = Field(
        None,
        description="Occupancy-based adjustment amount",
    )
    base_year_stop_amount: Decimal | None = Field(
        None,
        description="Base year or expense stop deduction",
    )
    cap_adjustment: Decimal | None = Field(
        None,
        description="Cap-related adjustment amount",
    )
    admin_fee_amount: Decimal | None = Field(
        None,
        description="Administrative/management fee dollar amount",
    )
    admin_fee_pct: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("0.25"),
        description="Administrative fee percentage (0-25%)",
    )
    other_adjustments: list[OtherAdjustment] = Field(
        default_factory=list,
        description="Any other labeled adjustments not covered above",
    )


class CamTotals(BaseModel):
    """Summary totals from the CAM reconciliation statement.

    These are the landlord's stated totals. The audit engine compares
    these against independently calculated values.

    Attributes:
        total_gross_expenses: Sum of all expense line items (REQUIRED).
        total_tenant_share: Tenant's total share after adjustments (REQUIRED).
        estimated_charges_paid: Amount already paid as monthly estimates.
        balance_due: Amount owed (positive) or credit due (negative).
    """

    model_config = ConfigDict(frozen=True)

    total_gross_expenses: Decimal = Field(
        ...,
        description="Sum of all expense line items",
    )
    total_tenant_share: Decimal = Field(
        ...,
        description="Tenant's total share after all adjustments",
    )
    estimated_charges_paid: Decimal | None = Field(
        None,
        description="Amount already paid by tenant as monthly estimates",
    )
    balance_due: Decimal | None = Field(
        None,
        description="Amount owed (positive) or credit (negative)",
    )


@dataclass
class CamExtractionWarning:
    """Warning for cross-field inconsistencies in CAM extraction.

    These are non-blocking warnings surfaced in the audit report
    to help the auditor identify potential data quality issues.
    """

    field: str
    message: str
    expected: Decimal | None = None
    actual: Decimal | None = None


class CamStatementExtractionResult(BaseModel):
    """Complete extraction result from a CAM reconciliation statement.

    This model matches the JSON schema defined in CAM_STATEMENT_EXTRACTION_PROMPT
    and validates that Claude's response conforms to expectations. All monetary
    fields use Decimal (never float).

    Unlike the landlord-side LeaseExtractionResult which gates on HITL
    verification, this model flows straight through to the audit calculation
    engine. Confidence scores are surfaced in the audit report instead.
    """

    # Period & Identification
    reconciliation_period: ReconciliationPeriod = Field(
        ...,
        description="Time period covered by the reconciliation",
    )
    property_name: str | None = Field(
        None,
        description="Property name as stated on the document",
    )
    tenant_name: str | None = Field(
        None,
        description="Tenant name as stated on the document",
    )
    suite_unit: str | None = Field(
        None,
        description="Suite or unit identifier",
    )

    # Square Footage & Share
    tenant_rsf: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        description="Tenant rentable square footage",
    )
    building_rsf: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        description="Total building rentable square footage",
    )
    pro_rata_share_stated: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Tenant's stated pro-rata share as decimal (e.g., 0.0525)",
    )

    # Expense Data
    expense_line_items: list[ExpenseLineItem] = Field(
        ...,
        description="Individual expense categories from the statement",
        min_length=1,
    )

    # Adjustments
    adjustments: CamAdjustments = Field(
        default_factory=CamAdjustments,
        description="Adjustments applied to arrive at tenant's final share",
    )

    # Totals
    totals: CamTotals = Field(
        ...,
        description="Summary totals from the statement",
    )

    # Extraction Metadata (reuses existing FieldExtraction model)
    extractions: list[FieldExtraction] = Field(
        ...,
        description="Per-field extraction metadata for audit trail",
        min_length=1,
    )

    def get_extraction(self, field_name: str) -> FieldExtraction | None:
        """Get extraction metadata for a specific field by dot-notation path.

        Args:
            field_name: Dot-notation field path (e.g., "totals.total_gross_expenses").

        Returns:
            FieldExtraction if found, None otherwise.

        Example:
            ```python
            result = CamStatementExtractionResult.model_validate(data)
            ext = result.get_extraction("totals.total_tenant_share")
            if ext and ext.confidence < 70:
                print(f"Low confidence: {ext.source_text}")
            ```
        """
        for extraction in self.extractions:
            if extraction.field == field_name:
                return extraction
        return None

    def get_low_confidence_fields(
        self, threshold: int = 75
    ) -> list[FieldExtraction]:
        """Get all fields with confidence below threshold.

        Default threshold is 75 (lower than lease extraction's 80)
        because CAM statements have more format variability.

        Args:
            threshold: Minimum confidence score (default 75).

        Returns:
            List of FieldExtraction objects below threshold.

        Example:
            ```python
            result = CamStatementExtractionResult.model_validate(data)
            low_conf = result.get_low_confidence_fields(threshold=70)
            for ext in low_conf:
                print(f"{ext.field}: {ext.confidence}% - {ext.source_text}")
            ```
        """
        return [e for e in self.extractions if e.confidence < threshold]

    def get_expense_total_by_classification(
        self, classification: ExpenseClassification
    ) -> Decimal:
        """Sum gross_amount for all line items of a given classification.

        Args:
            classification: The expense classification to filter by.

        Returns:
            Sum of gross_amount for matching line items.

        Example:
            ```python
            tax_total = result.get_expense_total_by_classification(
                ExpenseClassification.TAX
            )
            ```
        """
        return sum(
            (
                item.gross_amount
                for item in self.expense_line_items
                if item.classification == classification
            ),
            Decimal("0"),
        )

    def validate_cross_fields(self) -> list[CamExtractionWarning]:
        """Run cross-field consistency checks and return warnings.

        Checks:
        1. Pro-rata share vs. tenant_rsf / building_rsf (within 1%)
        2. Balance due vs. total_tenant_share - estimated_charges_paid (within $0.01)
        3. Sum of line item gross_amounts vs. total_gross_expenses (within $0.01)

        Returns:
            List of CamExtractionWarning for any inconsistencies found.

        Example:
            ```python
            result = CamStatementExtractionResult.model_validate(data)
            warnings = result.validate_cross_fields()
            for w in warnings:
                print(f"{w.field}: {w.message}")
            ```
        """
        warnings: list[CamExtractionWarning] = []

        # Check 1: Pro-rata share consistency
        if (
            self.pro_rata_share_stated is not None
            and self.tenant_rsf is not None
            and self.building_rsf is not None
            and self.building_rsf > Decimal("0")
        ):
            calculated_share = self.tenant_rsf / self.building_rsf
            divergence = abs(calculated_share - self.pro_rata_share_stated)
            if divergence > Decimal("0.01"):
                warnings.append(
                    CamExtractionWarning(
                        field="pro_rata_share_stated",
                        message=(
                            f"Stated pro-rata share ({self.pro_rata_share_stated}) "
                            f"diverges from tenant_rsf/building_rsf "
                            f"({calculated_share:.6f}) by {divergence:.4f}"
                        ),
                        expected=calculated_share,
                        actual=self.pro_rata_share_stated,
                    )
                )

        # Check 2: Balance due reconciliation
        if (
            self.totals.balance_due is not None
            and self.totals.estimated_charges_paid is not None
        ):
            expected_balance = (
                self.totals.total_tenant_share
                - self.totals.estimated_charges_paid
            )
            balance_diff = abs(expected_balance - self.totals.balance_due)
            if balance_diff > Decimal("0.01"):
                warnings.append(
                    CamExtractionWarning(
                        field="totals.balance_due",
                        message=(
                            f"Stated balance_due ({self.totals.balance_due}) "
                            f"does not match total_tenant_share - estimated_charges_paid "
                            f"({expected_balance}). Difference: ${balance_diff}"
                        ),
                        expected=expected_balance,
                        actual=self.totals.balance_due,
                    )
                )

        # Check 3: Line item sum vs. total_gross_expenses
        line_item_sum = sum(
            (item.gross_amount for item in self.expense_line_items),
            Decimal("0"),
        )
        gross_diff = abs(line_item_sum - self.totals.total_gross_expenses)
        if gross_diff > Decimal("0.01"):
            warnings.append(
                CamExtractionWarning(
                    field="totals.total_gross_expenses",
                    message=(
                        f"Sum of expense line items ({line_item_sum}) "
                        f"does not match total_gross_expenses "
                        f"({self.totals.total_gross_expenses}). "
                        f"Difference: ${gross_diff}"
                    ),
                    expected=line_item_sum,
                    actual=self.totals.total_gross_expenses,
                )
            )

        return warnings


# Confidence weights for CAM statement extraction
# Totals and tenant share are weighted highest for audit accuracy
CAM_STATEMENT_FIELD_WEIGHTS = {
    "totals.total_gross_expenses": Decimal("0.15"),
    "totals.total_tenant_share": Decimal("0.15"),
    "totals.balance_due": Decimal("0.10"),
    "pro_rata_share_stated": Decimal("0.12"),
    "reconciliation_period.fiscal_year": Decimal("0.08"),
    "tenant_rsf": Decimal("0.08"),
    "building_rsf": Decimal("0.08"),
    "adjustments.base_year_stop_amount": Decimal("0.08"),
    "adjustments.admin_fee_amount": Decimal("0.08"),
    "adjustments.gross_up_amount": Decimal("0.08"),
}

# Confidence threshold for CAM statement extraction (75%)
# Lower than lease extraction (80%) due to higher format variability
CAM_STATEMENT_CONFIDENCE_THRESHOLD = Decimal("0.75")
```

### Test File: `backend/tests/services/extraction/test_cam_statement_models.py`

```python
"""Tests for CAM statement extraction Pydantic models."""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.services.extraction.cam_statement_models import (
    CAM_STATEMENT_CONFIDENCE_THRESHOLD,
    CAM_STATEMENT_FIELD_WEIGHTS,
    CamAdjustments,
    CamExtractionWarning,
    CamStatementExtractionResult,
    CamTotals,
    ExpenseClassification,
    ExpenseLineItem,
    OtherAdjustment,
    ReconciliationPeriod,
)
from app.services.extraction.extraction_models import FieldExtraction


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_extraction(field: str, confidence: int = 95) -> FieldExtraction:
    """Helper to create a FieldExtraction with defaults."""
    return FieldExtraction(
        field=field,
        value="test",
        confidence=confidence,
        source_text="Total Operating Expenses: $125,000.00",
    )


def _make_line_item(
    category: str = "Property Taxes",
    gross_amount: Decimal = Decimal("50000.00"),
    classification: ExpenseClassification = ExpenseClassification.TAX,
) -> ExpenseLineItem:
    """Helper to create an ExpenseLineItem with defaults."""
    return ExpenseLineItem(
        category=category,
        gross_amount=gross_amount,
        classification=classification,
    )


def _make_valid_result(**overrides) -> CamStatementExtractionResult:
    """Build a valid CamStatementExtractionResult with sensible defaults."""
    defaults = {
        "reconciliation_period": ReconciliationPeriod(
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            fiscal_year=2024,
        ),
        "property_name": "Westfield Plaza",
        "tenant_name": "Acme Corp",
        "suite_unit": "Suite 200",
        "tenant_rsf": Decimal("5000.00"),
        "building_rsf": Decimal("100000.00"),
        "pro_rata_share_stated": Decimal("0.05"),
        "expense_line_items": [
            _make_line_item("Property Taxes", Decimal("50000.00"), ExpenseClassification.TAX),
            _make_line_item("Insurance", Decimal("25000.00"), ExpenseClassification.INSURANCE),
            _make_line_item("Utilities", Decimal("50000.00"), ExpenseClassification.OPERATING),
        ],
        "adjustments": CamAdjustments(
            admin_fee_amount=Decimal("1250.00"),
            admin_fee_pct=Decimal("0.10"),
        ),
        "totals": CamTotals(
            total_gross_expenses=Decimal("125000.00"),
            total_tenant_share=Decimal("7500.00"),
            estimated_charges_paid=Decimal("7000.00"),
            balance_due=Decimal("500.00"),
        ),
        "extractions": [
            _make_extraction("totals.total_gross_expenses"),
            _make_extraction("totals.total_tenant_share"),
        ],
    }
    defaults.update(overrides)
    return CamStatementExtractionResult(**defaults)


# ---------------------------------------------------------------------------
# ReconciliationPeriod
# ---------------------------------------------------------------------------

class TestReconciliationPeriod:
    def test_valid_period(self):
        period = ReconciliationPeriod(
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            fiscal_year=2024,
        )
        assert period.fiscal_year == 2024

    def test_fiscal_year_out_of_range(self):
        with pytest.raises(ValidationError):
            ReconciliationPeriod(
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
                fiscal_year=1999,
            )

    def test_frozen_model(self):
        period = ReconciliationPeriod(
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            fiscal_year=2024,
        )
        with pytest.raises(ValidationError):
            period.fiscal_year = 2025


# ---------------------------------------------------------------------------
# ExpenseLineItem
# ---------------------------------------------------------------------------

class TestExpenseLineItem:
    def test_valid_line_item(self):
        item = ExpenseLineItem(
            category="Property Taxes",
            gross_amount=Decimal("50000.00"),
            classification=ExpenseClassification.TAX,
        )
        assert item.category == "Property Taxes"
        assert item.gross_amount == Decimal("50000.00")

    def test_empty_category_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseLineItem(
                category="",
                gross_amount=Decimal("50000.00"),
                classification=ExpenseClassification.TAX,
            )

    def test_optional_fields_default_to_none(self):
        item = ExpenseLineItem(
            category="Utilities",
            gross_amount=Decimal("30000.00"),
            classification=ExpenseClassification.OPERATING,
        )
        assert item.description is None
        assert item.tenant_share_amount is None
        assert item.account_code is None

    def test_all_classifications_valid(self):
        for cls in ExpenseClassification:
            item = ExpenseLineItem(
                category="Test",
                gross_amount=Decimal("100.00"),
                classification=cls,
            )
            assert item.classification == cls

    def test_negative_gross_amount_allowed(self):
        """Credits can be negative."""
        item = ExpenseLineItem(
            category="Tax Refund",
            gross_amount=Decimal("-5000.00"),
            classification=ExpenseClassification.TAX,
        )
        assert item.gross_amount == Decimal("-5000.00")


# ---------------------------------------------------------------------------
# CamAdjustments
# ---------------------------------------------------------------------------

class TestCamAdjustments:
    def test_all_none_defaults(self):
        adj = CamAdjustments()
        assert adj.gross_up_amount is None
        assert adj.admin_fee_amount is None
        assert adj.other_adjustments == []

    def test_admin_fee_pct_bounds(self):
        adj = CamAdjustments(admin_fee_pct=Decimal("0.15"))
        assert adj.admin_fee_pct == Decimal("0.15")

    def test_admin_fee_pct_over_25_rejected(self):
        with pytest.raises(ValidationError):
            CamAdjustments(admin_fee_pct=Decimal("0.30"))

    def test_gross_up_occupancy_bounds(self):
        with pytest.raises(ValidationError):
            CamAdjustments(gross_up_occupancy_pct=Decimal("1.5"))

    def test_other_adjustments(self):
        adj = CamAdjustments(
            other_adjustments=[
                OtherAdjustment(label="Snow Removal Credit", amount=Decimal("-500.00")),
            ]
        )
        assert len(adj.other_adjustments) == 1
        assert adj.other_adjustments[0].amount == Decimal("-500.00")


# ---------------------------------------------------------------------------
# CamTotals
# ---------------------------------------------------------------------------

class TestCamTotals:
    def test_required_fields(self):
        totals = CamTotals(
            total_gross_expenses=Decimal("125000.00"),
            total_tenant_share=Decimal("7500.00"),
        )
        assert totals.estimated_charges_paid is None
        assert totals.balance_due is None

    def test_missing_total_gross_expenses_rejected(self):
        with pytest.raises(ValidationError):
            CamTotals(total_tenant_share=Decimal("7500.00"))

    def test_negative_balance_due_is_credit(self):
        totals = CamTotals(
            total_gross_expenses=Decimal("100000.00"),
            total_tenant_share=Decimal("5000.00"),
            estimated_charges_paid=Decimal("6000.00"),
            balance_due=Decimal("-1000.00"),
        )
        assert totals.balance_due == Decimal("-1000.00")


# ---------------------------------------------------------------------------
# CamStatementExtractionResult
# ---------------------------------------------------------------------------

class TestCamStatementExtractionResult:
    def test_valid_full_result(self):
        result = _make_valid_result()
        assert result.property_name == "Westfield Plaza"
        assert len(result.expense_line_items) == 3

    def test_minimum_required_fields(self):
        """Only truly required fields provided."""
        result = CamStatementExtractionResult(
            reconciliation_period=ReconciliationPeriod(
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
                fiscal_year=2024,
            ),
            expense_line_items=[
                _make_line_item(),
            ],
            totals=CamTotals(
                total_gross_expenses=Decimal("50000.00"),
                total_tenant_share=Decimal("2500.00"),
            ),
            extractions=[_make_extraction("totals.total_gross_expenses")],
        )
        assert result.property_name is None
        assert result.pro_rata_share_stated is None

    def test_empty_expense_line_items_rejected(self):
        with pytest.raises(ValidationError):
            CamStatementExtractionResult(
                reconciliation_period=ReconciliationPeriod(
                    start_date=date(2024, 1, 1),
                    end_date=date(2024, 12, 31),
                    fiscal_year=2024,
                ),
                expense_line_items=[],
                totals=CamTotals(
                    total_gross_expenses=Decimal("0"),
                    total_tenant_share=Decimal("0"),
                ),
                extractions=[_make_extraction("totals.total_gross_expenses")],
            )

    def test_empty_extractions_rejected(self):
        with pytest.raises(ValidationError):
            CamStatementExtractionResult(
                reconciliation_period=ReconciliationPeriod(
                    start_date=date(2024, 1, 1),
                    end_date=date(2024, 12, 31),
                    fiscal_year=2024,
                ),
                expense_line_items=[_make_line_item()],
                totals=CamTotals(
                    total_gross_expenses=Decimal("50000.00"),
                    total_tenant_share=Decimal("2500.00"),
                ),
                extractions=[],
            )

    def test_pro_rata_share_bounds(self):
        with pytest.raises(ValidationError):
            _make_valid_result(pro_rata_share_stated=Decimal("1.5"))

    def test_tenant_rsf_non_negative(self):
        with pytest.raises(ValidationError):
            _make_valid_result(tenant_rsf=Decimal("-100"))


class TestGetExtraction:
    def test_returns_matching_extraction(self):
        result = _make_valid_result()
        ext = result.get_extraction("totals.total_gross_expenses")
        assert ext is not None
        assert ext.field == "totals.total_gross_expenses"

    def test_returns_none_for_missing_field(self):
        result = _make_valid_result()
        assert result.get_extraction("nonexistent.field") is None


class TestGetLowConfidenceFields:
    def test_returns_fields_below_threshold(self):
        result = _make_valid_result(
            extractions=[
                _make_extraction("totals.total_gross_expenses", confidence=95),
                _make_extraction("totals.total_tenant_share", confidence=60),
                _make_extraction("pro_rata_share_stated", confidence=45),
            ]
        )
        low = result.get_low_confidence_fields(threshold=75)
        assert len(low) == 2
        fields = {e.field for e in low}
        assert "totals.total_tenant_share" in fields
        assert "pro_rata_share_stated" in fields

    def test_returns_empty_when_all_above_threshold(self):
        result = _make_valid_result()
        low = result.get_low_confidence_fields(threshold=75)
        assert low == []

    def test_default_threshold_is_75(self):
        result = _make_valid_result(
            extractions=[
                _make_extraction("totals.total_gross_expenses", confidence=74),
            ]
        )
        low = result.get_low_confidence_fields()
        assert len(low) == 1


class TestGetExpenseTotalByClassification:
    def test_sums_matching_items(self):
        result = _make_valid_result()
        tax_total = result.get_expense_total_by_classification(
            ExpenseClassification.TAX
        )
        assert tax_total == Decimal("50000.00")

    def test_returns_zero_for_no_matches(self):
        result = _make_valid_result()
        capital_total = result.get_expense_total_by_classification(
            ExpenseClassification.CAPITAL
        )
        assert capital_total == Decimal("0")


class TestValidateCrossFields:
    def test_no_warnings_for_consistent_data(self):
        result = _make_valid_result()
        warnings = result.validate_cross_fields()
        assert len(warnings) == 0

    def test_warns_on_pro_rata_share_divergence(self):
        result = _make_valid_result(
            tenant_rsf=Decimal("5000.00"),
            building_rsf=Decimal("100000.00"),
            pro_rata_share_stated=Decimal("0.10"),  # 10% vs 5% calculated
        )
        warnings = result.validate_cross_fields()
        share_warnings = [w for w in warnings if w.field == "pro_rata_share_stated"]
        assert len(share_warnings) == 1
        assert "diverges" in share_warnings[0].message

    def test_no_warning_when_share_within_tolerance(self):
        result = _make_valid_result(
            tenant_rsf=Decimal("5000.00"),
            building_rsf=Decimal("100000.00"),
            pro_rata_share_stated=Decimal("0.0505"),  # within 1%
        )
        warnings = result.validate_cross_fields()
        share_warnings = [w for w in warnings if w.field == "pro_rata_share_stated"]
        assert len(share_warnings) == 0

    def test_warns_on_balance_due_mismatch(self):
        result = _make_valid_result(
            totals=CamTotals(
                total_gross_expenses=Decimal("125000.00"),
                total_tenant_share=Decimal("7500.00"),
                estimated_charges_paid=Decimal("7000.00"),
                balance_due=Decimal("1000.00"),  # should be 500.00
            ),
        )
        warnings = result.validate_cross_fields()
        balance_warnings = [w for w in warnings if w.field == "totals.balance_due"]
        assert len(balance_warnings) == 1

    def test_no_balance_warning_when_within_penny(self):
        result = _make_valid_result(
            totals=CamTotals(
                total_gross_expenses=Decimal("125000.00"),
                total_tenant_share=Decimal("7500.00"),
                estimated_charges_paid=Decimal("7000.00"),
                balance_due=Decimal("500.00"),
            ),
        )
        warnings = result.validate_cross_fields()
        balance_warnings = [w for w in warnings if w.field == "totals.balance_due"]
        assert len(balance_warnings) == 0

    def test_warns_on_line_item_sum_mismatch(self):
        result = _make_valid_result(
            expense_line_items=[
                _make_line_item("Tax", Decimal("50000.00"), ExpenseClassification.TAX),
                _make_line_item("Ins", Decimal("25000.00"), ExpenseClassification.INSURANCE),
            ],
            totals=CamTotals(
                total_gross_expenses=Decimal("100000.00"),  # items sum to 75000
                total_tenant_share=Decimal("5000.00"),
            ),
        )
        warnings = result.validate_cross_fields()
        gross_warnings = [
            w for w in warnings if w.field == "totals.total_gross_expenses"
        ]
        assert len(gross_warnings) == 1

    def test_skips_share_check_when_sqft_missing(self):
        result = _make_valid_result(
            tenant_rsf=None,
            building_rsf=None,
            pro_rata_share_stated=Decimal("0.05"),
        )
        warnings = result.validate_cross_fields()
        share_warnings = [w for w in warnings if w.field == "pro_rata_share_stated"]
        assert len(share_warnings) == 0

    def test_skips_balance_check_when_estimates_missing(self):
        result = _make_valid_result(
            totals=CamTotals(
                total_gross_expenses=Decimal("125000.00"),
                total_tenant_share=Decimal("7500.00"),
                estimated_charges_paid=None,
                balance_due=None,
            ),
        )
        warnings = result.validate_cross_fields()
        balance_warnings = [w for w in warnings if w.field == "totals.balance_due"]
        assert len(balance_warnings) == 0


class TestConfidenceWeights:
    def test_weights_sum_to_one(self):
        total = sum(CAM_STATEMENT_FIELD_WEIGHTS.values())
        assert total == Decimal("1.00") or total == Decimal("1")

    def test_threshold_is_075(self):
        assert CAM_STATEMENT_CONFIDENCE_THRESHOLD == Decimal("0.75")

    def test_totals_fields_weighted_highest(self):
        assert CAM_STATEMENT_FIELD_WEIGHTS["totals.total_gross_expenses"] >= Decimal("0.15")
        assert CAM_STATEMENT_FIELD_WEIGHTS["totals.total_tenant_share"] >= Decimal("0.15")
```

## Test Cases
- `ReconciliationPeriod` validates fiscal_year range (2000-2100) and is frozen
- `ExpenseLineItem` rejects empty category, accepts all five classifications, allows negative amounts (credits)
- `CamAdjustments` defaults all fields to None, rejects admin_fee_pct > 0.25 and gross_up_occupancy_pct > 1.0
- `CamTotals` requires total_gross_expenses and total_tenant_share, allows negative balance_due
- `CamStatementExtractionResult` requires at least 1 expense_line_item and 1 extraction
- `get_extraction()` returns matching FieldExtraction by dot-notation path or None
- `get_low_confidence_fields()` filters by threshold (default 75), returns empty list when all above
- `get_expense_total_by_classification()` sums gross_amount for matching items, returns 0 for no matches
- `validate_cross_fields()` warns on pro-rata share divergence > 1%
- `validate_cross_fields()` warns on balance_due mismatch > $0.01
- `validate_cross_fields()` warns on line item sum vs. total_gross_expenses mismatch > $0.01
- `validate_cross_fields()` skips checks when prerequisite fields are None
- `CAM_STATEMENT_FIELD_WEIGHTS` values sum to 1.0
- `CAM_STATEMENT_CONFIDENCE_THRESHOLD` is 0.75

## Definition of Done
- [ ] `cam_statement_models.py` created in `backend/app/services/extraction/`
- [ ] All models defined: `ReconciliationPeriod`, `ExpenseLineItem`, `OtherAdjustment`, `CamAdjustments`, `CamTotals`, `CamStatementExtractionResult`
- [ ] `ExpenseClassification` enum with all five values
- [ ] `CamExtractionWarning` dataclass for cross-field warnings
- [ ] All monetary fields use `Decimal` with appropriate bounds
- [ ] `get_extraction()`, `get_low_confidence_fields()`, `get_expense_total_by_classification()`, `validate_cross_fields()` methods implemented
- [ ] `CAM_STATEMENT_FIELD_WEIGHTS` and `CAM_STATEMENT_CONFIDENCE_THRESHOLD` constants exported
- [ ] All test cases pass (`cd backend && pytest tests/services/extraction/test_cam_statement_models.py --tb=short`)
- [ ] Backend coverage maintained at >= 95% (`cd backend && pytest --cov=app --cov-fail-under=95`)
- [ ] Code formatted (`black`, `isort`, `ruff`)
- [ ] No placeholder code or TODO comments
- [ ] Changes committed
