"""Tests for calculation expected values fixtures.

Validates that all hand-calculated expected outputs are properly structured
and contain valid data for calculation engine verification.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

EXPECTED_DIR = Path(__file__).parent / "fixtures" / "expected"


class TestGrossUpExpectedValues:
    """Tests for gross-up expected value fixtures."""

    @pytest.fixture
    def grossup_basic(self) -> dict:
        """Load basic gross-up expected values."""
        with open(EXPECTED_DIR / "expected_grossup_basic.json") as f:
            return json.load(f)

    @pytest.fixture
    def grossup_high_occupancy(self) -> dict:
        """Load high occupancy expected values."""
        with open(EXPECTED_DIR / "expected_grossup_high_occupancy.json") as f:
            return json.load(f)

    @pytest.fixture
    def grossup_safety_valve(self) -> dict:
        """Load safety valve expected values."""
        with open(EXPECTED_DIR / "expected_grossup_safety_valve.json") as f:
            return json.load(f)

    def test_basic_grossup_structure(self, grossup_basic: dict) -> None:
        """Basic gross-up has required structure."""
        assert "scenario" in grossup_basic
        assert "inputs" in grossup_basic
        assert "calculation_steps" in grossup_basic
        assert "expected_output" in grossup_basic
        assert grossup_basic["scenario"] == "grossup_basic"

    def test_basic_grossup_inputs(self, grossup_basic: dict) -> None:
        """Basic gross-up has valid inputs."""
        inputs = grossup_basic["inputs"]
        assert inputs["variable_expenses"] == 10000.00
        assert inputs["fixed_expenses"] == 5000.00
        assert inputs["actual_occupancy"] == 0.90
        assert inputs["target_occupancy"] == 0.95

    def test_basic_grossup_calculation(self, grossup_basic: dict) -> None:
        """Basic gross-up calculation is correct."""
        output = grossup_basic["expected_output"]
        # Gross-up factor: 0.95 / 0.90 = 1.055556
        # Variable: 10000 * 1.055556 = 10555.56
        assert output["grossed_variable_expenses"] == pytest.approx(10555.56, rel=0.01)
        assert output["fixed_expenses"] == 5000.00
        assert output["total_expenses"] == pytest.approx(15555.56, rel=0.01)
        assert output["gross_up_factor"] == pytest.approx(1.055556, rel=0.0001)

    def test_basic_grossup_steps_documented(self, grossup_basic: dict) -> None:
        """Basic gross-up has documented calculation steps."""
        steps = grossup_basic["calculation_steps"]
        assert len(steps) == 3
        # Each step should have description and formula
        for step in steps:
            assert "description" in step
            assert "formula" in step
            assert "result" in step

    def test_high_occupancy_no_grossup(self, grossup_high_occupancy: dict) -> None:
        """High occupancy scenario applies minimum factor of 1.0."""
        output = grossup_high_occupancy["expected_output"]
        # 97% > 95%, so factor would be < 1.0, but minimum is 1.0
        assert output["gross_up_factor"] == 1.0
        assert output["grossed_variable_expenses"] == 10000.00  # No gross-up

    def test_safety_valve_documented(self, grossup_safety_valve: dict) -> None:
        """Safety valve scenario documents the cap."""
        output = grossup_safety_valve["expected_output"]
        assert "safety_valve_cap" in output
        assert output["gross_up_factor"] == 1.90
        # Safety valve cap: 10000 / 0.50 = 20000
        assert output["safety_valve_cap"] == 20000.00


class TestCapExpectedValues:
    """Tests for expense cap expected value fixtures."""

    @pytest.fixture
    def cap_non_cumulative(self) -> dict:
        """Load non-cumulative cap expected values."""
        with open(EXPECTED_DIR / "expected_cap_non_cumulative.json") as f:
            return json.load(f)

    @pytest.fixture
    def cap_cumulative(self) -> dict:
        """Load cumulative cap expected values."""
        with open(EXPECTED_DIR / "expected_cap_cumulative.json") as f:
            return json.load(f)

    @pytest.fixture
    def cap_compounding(self) -> dict:
        """Load cumulative-compounding cap expected values."""
        with open(EXPECTED_DIR / "expected_cap_cumulative_compounding.json") as f:
            return json.load(f)

    def test_non_cumulative_structure(self, cap_non_cumulative: dict) -> None:
        """Non-cumulative cap has 4-year structure."""
        assert cap_non_cumulative["cap_type"] == "non_cumulative"
        assert cap_non_cumulative["cap_rate"] == 0.05
        assert len(cap_non_cumulative["years"]) == 4

    def test_non_cumulative_year1_base(self, cap_non_cumulative: dict) -> None:
        """Year 1 is base year with no cap."""
        year1 = cap_non_cumulative["years"][0]
        assert year1["year"] == 1
        assert year1["actual_expenses"] == 100000.00
        assert year1["billable_amount"] == 100000.00

    def test_non_cumulative_year2_capped(self, cap_non_cumulative: dict) -> None:
        """Year 2 is capped at 5% increase."""
        year2 = cap_non_cumulative["years"][1]
        assert year2["year"] == 2
        assert year2["actual_expenses"] == 107000.00
        # Capped at 100000 * 1.05 = 105000
        assert year2["billable_amount"] == 105000.00

    def test_non_cumulative_unused_lost(self, cap_non_cumulative: dict) -> None:
        """Non-cumulative unused capacity is lost."""
        year3 = cap_non_cumulative["years"][2]
        assert year3["unused_capacity"] == 4250.00
        # Verify Year 4 doesn't benefit from Year 3 unused
        summary = cap_non_cumulative["summary"]
        assert summary["total_unused_lost"] == 4250.00

    def test_cumulative_banking(self, cap_cumulative: dict) -> None:
        """Cumulative cap banks unused capacity."""
        years = cap_cumulative["years"]
        # Year 3 should have banked capacity
        year3 = years[2]
        assert year3["new_bank"] == 4000.00
        # Year 4 should use banked capacity
        year4 = years[3]
        assert year4["prior_bank"] == 4000.00
        assert year4["billable_amount"] == 114480.00  # All expenses billable

    def test_cumulative_linear_growth(self, cap_cumulative: dict) -> None:
        """Cumulative cap grows linearly from base."""
        years = cap_cumulative["years"]
        # Year 2: 100k * (1 + 0.05 * 1) = 105k
        assert years[1]["cumulative_max_from_base"] == 105000.00
        # Year 3: 100k * (1 + 0.05 * 2) = 110k
        assert years[2]["cumulative_max_from_base"] == 110000.00
        # Year 4: 100k * (1 + 0.05 * 3) = 115k
        assert years[3]["cumulative_max_from_base"] == 115000.00

    def test_compounding_exponential_growth(self, cap_compounding: dict) -> None:
        """Compounding cap grows exponentially."""
        years = cap_compounding["years"]
        # Year 2: 100k * 1.05^1 = 105,000
        assert years[1]["compounding_max"] == 105000.00
        # Year 3: 100k * 1.05^2 = 110,250
        assert years[2]["compounding_max"] == 110250.00
        # Year 4: 100k * 1.05^3 = 115,762.50
        assert years[3]["compounding_max"] == 115762.50


class TestBaseYearExpectedValues:
    """Tests for base year expected value fixtures."""

    @pytest.fixture
    def base_year_standard(self) -> dict:
        """Load standard base year expected values."""
        with open(EXPECTED_DIR / "expected_base_year_standard.json") as f:
            return json.load(f)

    @pytest.fixture
    def base_year_decrease(self) -> dict:
        """Load decrease scenario expected values."""
        with open(EXPECTED_DIR / "expected_base_year_decrease.json") as f:
            return json.load(f)

    @pytest.fixture
    def base_year_normalization(self) -> dict:
        """Load normalization scenario expected values."""
        with open(EXPECTED_DIR / "expected_base_year_normalization.json") as f:
            return json.load(f)

    def test_standard_increase_calculation(self, base_year_standard: dict) -> None:
        """Standard base year calculates increase correctly."""
        output = base_year_standard["expected_output"]
        # Increase: 115000 - 100000 = 15000
        assert output["expense_increase"] == 15000.00
        # Tenant share: 15000 * 0.0312 = 468
        assert output["tenant_share"] == pytest.approx(468.00, rel=0.01)

    def test_decrease_zero_floor(self, base_year_decrease: dict) -> None:
        """Decrease scenario applies zero floor (no credits)."""
        output = base_year_decrease["expected_output"]
        assert output["expense_change"] == -5000.00  # Negative
        assert output["tenant_share"] == 0.00  # Floor applied

    def test_normalization_structure(self, base_year_normalization: dict) -> None:
        """Normalization scenario has required fields."""
        inputs = base_year_normalization["inputs"]
        assert "base_year_variable_expenses" in inputs
        assert "base_year_fixed_expenses" in inputs
        assert "base_year_occupancy" in inputs
        assert inputs["base_year_occupancy"] == 0.70

    def test_normalization_calculation(self, base_year_normalization: dict) -> None:
        """Normalization grosses up base year correctly."""
        output = base_year_normalization["expected_output"]
        # Original base: 60k + 40k = 100k
        assert output["original_base_year_total"] == 100000.00
        # Normalized: (60k * 1.357143) + 40k = 121,428.58
        assert output["normalized_base_year_total"] == pytest.approx(
            121428.58, rel=0.01
        )
        assert output["normalization_applied"] is True


class TestFullReconciliationExpected:
    """Tests for full reconciliation expected values."""

    @pytest.fixture
    def full_reconciliation(self) -> dict:
        """Load full reconciliation expected values."""
        with open(EXPECTED_DIR / "expected_full_reconciliation.json") as f:
            return json.load(f)

    def test_reconciliation_all_steps_present(self, full_reconciliation: dict) -> None:
        """Full reconciliation has all calculation steps."""
        calc = full_reconciliation["year_2025_calculation"]
        assert "step_1_raw_expenses" in calc
        assert "step_2_gross_up" in calc
        assert "step_3_cap_application" in calc
        assert "step_4_base_year_adjustment" in calc
        assert "step_5_admin_fee" in calc
        assert "step_6_pro_rata_share" in calc

    def test_reconciliation_grossup_step(self, full_reconciliation: dict) -> None:
        """Gross-up step is calculated correctly."""
        grossup = full_reconciliation["year_2025_calculation"]["step_2_gross_up"]
        # Factor: 0.95 / 0.88 = 1.079545
        assert grossup["gross_up_factor"] == pytest.approx(1.079545, rel=0.0001)
        # Variable: 120000 * 1.079545 = 129545.45
        assert grossup["grossed_variable"] == pytest.approx(129545.45, rel=0.01)

    def test_reconciliation_admin_fee(self, full_reconciliation: dict) -> None:
        """Admin fee is calculated on expense increase."""
        admin_fee = full_reconciliation["year_2025_calculation"]["step_5_admin_fee"]
        # 9545.45 * 0.15 = 1431.82
        assert admin_fee["admin_fee_amount"] == pytest.approx(1431.82, rel=0.01)

    def test_reconciliation_final_amount(self, full_reconciliation: dict) -> None:
        """Final tenant billable amount is correct."""
        output = full_reconciliation["expected_output"]
        # Tenant share: 10977.27 * 0.0312 = 342.49
        assert output["tenant_billable_amount"] == pytest.approx(342.49, rel=0.01)
        # PSF: 342.49 / 2500 = 0.137 (rounded to 0.14)
        assert output["per_sqft_charge"] == pytest.approx(0.14, abs=0.01)


class TestEdgeCaseExpectedValues:
    """Tests for edge case expected value fixtures."""

    @pytest.fixture
    def edge_first_year(self) -> dict:
        """Load first year tenant expected values."""
        with open(EXPECTED_DIR / "expected_edge_first_year.json") as f:
            return json.load(f)

    @pytest.fixture
    def edge_full_occupancy(self) -> dict:
        """Load full occupancy expected values."""
        with open(EXPECTED_DIR / "expected_edge_full_occupancy.json") as f:
            return json.load(f)

    @pytest.fixture
    def edge_zero_prorate(self) -> dict:
        """Load zero pro-rata expected values."""
        with open(EXPECTED_DIR / "expected_edge_zero_prorate.json") as f:
            return json.load(f)

    @pytest.fixture
    def edge_negative_variance(self) -> dict:
        """Load negative variance expected values."""
        with open(EXPECTED_DIR / "expected_edge_negative_variance.json") as f:
            return json.load(f)

    def test_first_year_zero_charge(self, edge_first_year: dict) -> None:
        """First year tenant has zero charge (establishes base)."""
        output = edge_first_year["expected_output"]
        assert output["tenant_share"] == 0.00
        assert output["base_year_set"] == 115000.00

    def test_full_occupancy_no_grossup(self, edge_full_occupancy: dict) -> None:
        """100% occupancy applies no gross-up."""
        output = edge_full_occupancy["expected_output"]
        assert output["gross_up_factor"] == 1.0
        assert output["grossed_variable_expenses"] == 10000.00

    def test_zero_prorate_error_case(self, edge_zero_prorate: dict) -> None:
        """Zero pro-rata share is documented as error."""
        assert edge_zero_prorate["expected_behavior"] == "ERROR"
        assert "expected_error" in edge_zero_prorate
        error = edge_zero_prorate["expected_error"]
        assert error["type"] == "ValidationError"

    def test_negative_variance_credit(self, edge_negative_variance: dict) -> None:
        """Negative variance results in tenant credit."""
        output = edge_negative_variance["expected_output"]
        assert output["credit_due"] == 312.00
        assert output["variance_type"] == "overpayment"


class TestCalculationExpectedCompleteness:
    """Tests for overall completeness of expected fixtures."""

    def test_all_scenarios_present(self) -> None:
        """All required scenario files exist."""
        required_files = [
            "expected_grossup_basic.json",
            "expected_grossup_high_occupancy.json",
            "expected_grossup_safety_valve.json",
            "expected_cap_non_cumulative.json",
            "expected_cap_cumulative.json",
            "expected_cap_cumulative_compounding.json",
            "expected_base_year_standard.json",
            "expected_base_year_decrease.json",
            "expected_base_year_normalization.json",
            "expected_full_reconciliation.json",
            "expected_edge_first_year.json",
            "expected_edge_full_occupancy.json",
            "expected_edge_zero_prorate.json",
            "expected_edge_negative_variance.json",
        ]

        for filename in required_files:
            filepath = EXPECTED_DIR / filename
            assert filepath.exists(), f"Missing required file: {filename}"

    def test_all_files_valid_json(self) -> None:
        """All expected files contain valid JSON."""
        for json_file in EXPECTED_DIR.glob("expected_*.json"):
            with open(json_file) as f:
                data = json.load(f)
                assert isinstance(data, dict), f"{json_file.name} is not a JSON object"

    def test_calculation_files_have_scenarios(self) -> None:
        """All calculation expected files have scenario field."""
        calc_files = [
            "expected_grossup_basic.json",
            "expected_cap_non_cumulative.json",
            "expected_base_year_standard.json",
            "expected_full_reconciliation.json",
        ]

        for filename in calc_files:
            with open(EXPECTED_DIR / filename) as f:
                data = json.load(f)
                assert "scenario" in data, f"{filename} missing scenario field"
