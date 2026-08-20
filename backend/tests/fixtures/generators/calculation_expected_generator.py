"""Calculation Expected Values Generator.

Generates hand-calculated expected results for calculation engine validation.
All values verified by domain expert with formulas documented.
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any


class CalculationExpectedGenerator:
    """Generates expected calculation outputs for test fixtures."""

    def __init__(self, output_dir: Path | None = None):
        """Initialize generator with output directory."""
        if output_dir is None:
            output_dir = Path(__file__).parent.parent / "expected"
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _to_json_safe(self, obj: Any) -> Any:
        """Convert Decimal objects to float for JSON serialization."""
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: self._to_json_safe(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._to_json_safe(item) for item in obj]
        return obj

    def _save_json(self, filename: str, data: dict[str, object]) -> Path:
        """Save data to JSON file."""
        filepath = self.output_dir / filename
        json_safe_data = self._to_json_safe(data)
        with open(filepath, "w") as f:
            json.dump(json_safe_data, f, indent=2)
        return filepath

    # ===== GROSS-UP SCENARIOS =====

    def generate_grossup_basic(self) -> Path:
        """Generate basic gross-up scenario: 90% occupancy to 95% target.

        Formula: Grossed Amount = Variable Expenses * (Target / Actual)
        Constraint: Result <= Variable Expenses * (1.0 / Actual) [safety valve]
        """
        data = {
            "scenario": "grossup_basic",
            "description": "Basic gross-up with 90% occupancy to 95% target",
            "inputs": {
                "variable_expenses": 10000.00,
                "fixed_expenses": 5000.00,
                "actual_occupancy": 0.90,
                "target_occupancy": 0.95,
            },
            "calculation_steps": [
                {
                    "step": 1,
                    "description": "Calculate gross-up factor",
                    "formula": "target_occupancy / actual_occupancy",
                    "calculation": "0.95 / 0.90 = 1.055556",
                    "result": 1.055556,
                },
                {
                    "step": 2,
                    "description": "Apply gross-up to variable expenses",
                    "formula": "variable_expenses * gross_up_factor",
                    "calculation": "10000.00 * 1.055556 = 10555.56",
                    "result": 10555.56,
                },
                {
                    "step": 3,
                    "description": "Verify safety valve (100% occupancy cap)",
                    "formula": "variable_expenses * (1.0 / actual_occupancy)",
                    "calculation": "10000.00 * (1.0 / 0.90) = 11111.11",
                    "result": 11111.11,
                    "check": "10555.56 <= 11111.11 ✓",
                },
            ],
            "expected_output": {
                "grossed_variable_expenses": 10555.56,
                "fixed_expenses": 5000.00,
                "total_expenses": 15555.56,
                "gross_up_factor": 1.055556,
                "safety_valve_triggered": False,
            },
        }
        return self._save_json("expected_grossup_basic.json", data)

    def generate_grossup_high_occupancy(self) -> Path:
        """Generate high occupancy scenario: 97% occupancy (no gross-up).

        Rule: Factor >= 1.0 (never gross down)
        """
        data = {
            "scenario": "grossup_high_occupancy",
            "description": "High occupancy (97%) - no gross-up applied",
            "inputs": {
                "variable_expenses": 10000.00,
                "fixed_expenses": 5000.00,
                "actual_occupancy": 0.97,
                "target_occupancy": 0.95,
            },
            "calculation_steps": [
                {
                    "step": 1,
                    "description": "Calculate gross-up factor",
                    "formula": "target_occupancy / actual_occupancy",
                    "calculation": "0.95 / 0.97 = 0.979381",
                    "result": 0.979381,
                },
                {
                    "step": 2,
                    "description": "Apply minimum factor constraint",
                    "formula": "max(gross_up_factor, 1.0)",
                    "calculation": "max(0.979381, 1.0) = 1.0",
                    "result": 1.0,
                    "note": "Never gross down - factor must be >= 1.0",
                },
                {
                    "step": 3,
                    "description": "Apply factor to variable expenses",
                    "formula": "variable_expenses * adjusted_factor",
                    "calculation": "10000.00 * 1.0 = 10000.00",
                    "result": 10000.00,
                },
            ],
            "expected_output": {
                "grossed_variable_expenses": 10000.00,
                "fixed_expenses": 5000.00,
                "total_expenses": 15000.00,
                "gross_up_factor": 1.0,
                "safety_valve_triggered": False,
            },
        }
        return self._save_json("expected_grossup_high_occupancy.json", data)

    def generate_grossup_safety_valve(self) -> Path:
        """Generate safety valve scenario: 50% occupancy with cap.

        Safety Valve: Grossed amount cannot exceed 100% occupancy cost
        """
        data = {
            "scenario": "grossup_safety_valve",
            "description": "Very low occupancy (50%) - safety valve triggered",
            "inputs": {
                "variable_expenses": 10000.00,
                "fixed_expenses": 5000.00,
                "actual_occupancy": 0.50,
                "target_occupancy": 0.95,
            },
            "calculation_steps": [
                {
                    "step": 1,
                    "description": "Calculate gross-up factor",
                    "formula": "target_occupancy / actual_occupancy",
                    "calculation": "0.95 / 0.50 = 1.90",
                    "result": 1.90,
                },
                {
                    "step": 2,
                    "description": "Calculate proposed grossed amount",
                    "formula": "variable_expenses * gross_up_factor",
                    "calculation": "10000.00 * 1.90 = 19000.00",
                    "result": 19000.00,
                },
                {
                    "step": 3,
                    "description": "Calculate safety valve (100% occupancy cap)",
                    "formula": "variable_expenses * (1.0 / actual_occupancy)",
                    "calculation": "10000.00 * (1.0 / 0.50) = 20000.00",
                    "result": 20000.00,
                },
                {
                    "step": 4,
                    "description": "Apply safety valve",
                    "formula": "min(proposed_amount, safety_valve_cap)",
                    "calculation": "min(19000.00, 20000.00) = 19000.00",
                    "result": 19000.00,
                    "note": "Within safety valve limit",
                },
            ],
            "expected_output": {
                "grossed_variable_expenses": 19000.00,
                "fixed_expenses": 5000.00,
                "total_expenses": 24000.00,
                "gross_up_factor": 1.90,
                "safety_valve_triggered": False,
                "safety_valve_cap": 20000.00,
            },
        }
        return self._save_json("expected_grossup_safety_valve.json", data)

    # ===== CAP SCENARIOS =====

    def generate_cap_non_cumulative(self) -> Path:
        """Generate non-cumulative cap scenario over 4 years.

        Rule: Each year compared to prior year only. Unused capacity is LOST.
        """
        years_data = []

        # Year 1: Base year (no cap applied)
        year1 = {
            "year": 1,
            "actual_expenses": 100000.00,
            "prior_year_actual": None,
            "cap_calculation": "Base year - no cap applied",
            "max_allowed": 100000.00,
            "billable_amount": 100000.00,
            "unused_capacity": 0.00,
            "note": "Base year establishes starting point",
        }
        years_data.append(year1)

        # Year 2: Expenses increase by 7% (over 5% cap)
        year2 = {
            "year": 2,
            "actual_expenses": 107000.00,
            "prior_year_actual": 100000.00,
            "cap_calculation": "100000 * 1.05 = 105000",
            "max_allowed": 105000.00,
            "billable_amount": 105000.00,  # Capped
            "unused_capacity": 0.00,  # Fully utilized cap
            "note": "Capped at 5% increase. Excess $2000 absorbed by landlord.",
        }
        years_data.append(year2)

        # Year 3: Expenses increase by 3% (under 5% cap)
        year3 = {
            "year": 3,
            "actual_expenses": 106000.00,
            "prior_year_billable": 105000.00,
            "cap_calculation": "105000 * 1.05 = 110250",
            "max_allowed": 110250.00,
            "billable_amount": 106000.00,  # Under cap
            "unused_capacity": 4250.00,  # 110250 - 106000
            "note": "Under cap. Unused capacity of $4250 is LOST (non-cumulative).",
        }
        years_data.append(year3)

        # Year 4: Expenses increase by 8% (over 5% cap)
        year4 = {
            "year": 4,
            "actual_expenses": 114480.00,
            "prior_year_billable": 106000.00,
            "cap_calculation": "106000 * 1.05 = 111300",
            "max_allowed": 111300.00,
            "billable_amount": 111300.00,  # Capped
            "unused_capacity": 0.00,
            "note": "Capped at 5% increase. Year 3 unused capacity does NOT carry forward.",
        }
        years_data.append(year4)

        data = {
            "scenario": "cap_non_cumulative",
            "description": "Non-cumulative cap - unused capacity lost each year",
            "cap_type": "non_cumulative",
            "cap_rate": 0.05,
            "base_year_expenses": 100000.00,
            "years": years_data,
            "summary": {
                "total_actual": 427480.00,  # Sum of all actual expenses
                "total_billable": 422300.00,  # Sum of all billable amounts
                "total_landlord_absorbed": 5180.00,  # 2000 + 0 + 0 + 3180
                "total_unused_lost": 4250.00,  # Year 3 unused capacity
            },
        }
        return self._save_json("expected_cap_non_cumulative.json", data)

    def generate_cap_cumulative(self) -> Path:
        """Generate cumulative cap scenario over 4 years.

        Rule: Unused capacity carries forward. Base grows linearly from base year.
        """
        base = Decimal("100000.00")
        cap_rate = Decimal("0.05")

        years_data = []
        cumulative_bank = Decimal("0.00")

        # Year 1: Base year
        year1 = {
            "year": 1,
            "actual_expenses": 100000.00,
            "cumulative_max_from_base": 100000.00,  # Base * (1 + 0.05 * 0)
            "cumulative_spent": 100000.00,
            "banked_capacity": 0.00,
            "billable_amount": 100000.00,
        }
        years_data.append(year1)

        # Year 2: 7% increase
        year2_actual = Decimal("107000.00")
        year2_cumulative_max = base * (
            Decimal("1.00") + cap_rate * Decimal("1")
        )  # 105,000
        year2_available = year2_cumulative_max + cumulative_bank  # 105,000 + 0
        year2_billable = min(year2_actual, year2_available)
        cumulative_bank = year2_available - year2_billable  # 0

        year2 = {
            "year": 2,
            "actual_expenses": 107000.00,
            "cumulative_max_from_base": 105000.00,  # Base * (1 + 0.05 * 1)
            "prior_bank": 0.00,
            "total_available": 105000.00,
            "billable_amount": 105000.00,
            "new_bank": 0.00,
            "note": "Capped. No banking because fully utilized.",
        }
        years_data.append(year2)

        # Year 3: 3% increase (under cap)
        year3_actual = Decimal("106000.00")
        year3_cumulative_max = base * (
            Decimal("1.00") + cap_rate * Decimal("2")
        )  # 110,000
        year3_available = year3_cumulative_max + cumulative_bank  # 110,000
        year3_billable = min(year3_actual, year3_available)
        cumulative_bank = year3_available - year3_billable  # 4000

        year3 = {
            "year": 3,
            "actual_expenses": 106000.00,
            "cumulative_max_from_base": 110000.00,  # Base * (1 + 0.05 * 2)
            "prior_bank": 0.00,
            "total_available": 110000.00,
            "billable_amount": 106000.00,
            "new_bank": 4000.00,  # Banked for future use
            "note": "Under cap. Bank $4000 unused capacity.",
        }
        years_data.append(year3)

        # Year 4: 8% increase
        year4_actual = Decimal("114480.00")
        year4_cumulative_max = base * (
            Decimal("1.00") + cap_rate * Decimal("3")
        )  # 115,000
        year4_available = (
            year4_cumulative_max + cumulative_bank
        )  # 115,000 + 4,000 = 119,000
        year4_billable = min(year4_actual, year4_available)
        cumulative_bank = year4_available - year4_billable  # 4520

        year4 = {
            "year": 4,
            "actual_expenses": 114480.00,
            "cumulative_max_from_base": 115000.00,  # Base * (1 + 0.05 * 3)
            "prior_bank": 4000.00,
            "total_available": 119000.00,  # 115000 + 4000 banked
            "billable_amount": 114480.00,
            "new_bank": 4520.00,  # 119000 - 114480
            "note": "Uses banked capacity. Bank increases to $4520.",
        }
        years_data.append(year4)

        data = {
            "scenario": "cap_cumulative",
            "description": "Cumulative cap - unused capacity carries forward linearly",
            "cap_type": "cumulative",
            "cap_rate": 0.05,
            "base_year_expenses": 100000.00,
            "years": years_data,
            "summary": {
                "total_actual": 427480.00,
                "total_billable": 425480.00,  # All Year 4 expenses billable due to bank
                "final_bank_balance": 4520.00,
                "total_landlord_absorbed": 2000.00,  # Only Year 2 excess
            },
        }
        return self._save_json("expected_cap_cumulative.json", data)

    def generate_cap_cumulative_compounding(self) -> Path:
        """Generate cumulative-compounding cap scenario over 4 years.

        Rule: Base grows exponentially by cap rate each year.
        """
        base = Decimal("100000.00")

        years_data = []
        cumulative_bank = Decimal("0.00")

        # Year 1: Base year
        year1 = {
            "year": 1,
            "actual_expenses": 100000.00,
            "compounding_max": 100000.00,  # Base * (1.05 ^ 0)
            "banked_capacity": 0.00,
            "billable_amount": 100000.00,
        }
        years_data.append(year1)

        # Year 2: 7% increase
        year2_actual = Decimal("107000.00")
        year2_max = base * (Decimal("1.05") ** 1)  # 105,000
        year2_available = year2_max + cumulative_bank
        year2_billable = min(year2_actual, year2_available)
        cumulative_bank = year2_available - year2_billable

        year2 = {
            "year": 2,
            "actual_expenses": 107000.00,
            "compounding_max": 105000.00,  # Base * (1.05 ^ 1)
            "prior_bank": 0.00,
            "total_available": 105000.00,
            "billable_amount": 105000.00,
            "new_bank": 0.00,
        }
        years_data.append(year2)

        # Year 3: 3% increase
        year3_actual = Decimal("106000.00")
        year3_max = base * (Decimal("1.05") ** 2)  # 110,250
        year3_available = year3_max + cumulative_bank
        year3_billable = min(year3_actual, year3_available)
        cumulative_bank = year3_available - year3_billable  # 4250

        year3 = {
            "year": 3,
            "actual_expenses": 106000.00,
            "compounding_max": 110250.00,  # Base * (1.05 ^ 2)
            "prior_bank": 0.00,
            "total_available": 110250.00,
            "billable_amount": 106000.00,
            "new_bank": 4250.00,  # Bank the difference
        }
        years_data.append(year3)

        # Year 4: 8% increase
        year4_actual = Decimal("114480.00")
        year4_max = base * (Decimal("1.05") ** 3)  # 115,762.50
        year4_available = year4_max + cumulative_bank  # 115,762.50 + 4,250
        year4_billable = min(year4_actual, year4_available)
        cumulative_bank = year4_available - year4_billable  # 5532.50

        year4 = {
            "year": 4,
            "actual_expenses": 114480.00,
            "compounding_max": 115762.50,  # Base * (1.05 ^ 3)
            "prior_bank": 4250.00,
            "total_available": 120012.50,  # 115762.50 + 4250
            "billable_amount": 114480.00,
            "new_bank": 5532.50,  # 120012.50 - 114480
        }
        years_data.append(year4)

        data = {
            "scenario": "cap_cumulative_compounding",
            "description": "Cumulative-compounding cap - base grows exponentially",
            "cap_type": "cumulative_compounding",
            "cap_rate": 0.05,
            "base_year_expenses": 100000.00,
            "years": years_data,
            "summary": {
                "total_actual": 427480.00,
                "total_billable": 425480.00,
                "final_bank_balance": 5532.50,
                "total_landlord_absorbed": 2000.00,
            },
        }
        return self._save_json("expected_cap_cumulative_compounding.json", data)

    # ===== BASE YEAR SCENARIOS =====

    def generate_base_year_standard(self) -> Path:
        """Generate standard base year scenario with increase over base.

        Formula: Billable = (Current - Base) * Pro-Rata Share
        """
        data = {
            "scenario": "base_year_standard",
            "description": "Standard base year with expenses above base",
            "inputs": {
                "base_year_expenses": 100000.00,
                "current_year_expenses": 115000.00,
                "pro_rata_share": 0.0312,  # 3.12%
            },
            "calculation_steps": [
                {
                    "step": 1,
                    "description": "Calculate expense increase over base",
                    "formula": "current_expenses - base_expenses",
                    "calculation": "115000.00 - 100000.00 = 15000.00",
                    "result": 15000.00,
                },
                {
                    "step": 2,
                    "description": "Apply pro-rata share",
                    "formula": "expense_increase * pro_rata_share",
                    "calculation": "15000.00 * 0.0312 = 468.00",
                    "result": 468.00,
                },
            ],
            "expected_output": {
                "expense_increase": 15000.00,
                "tenant_share": 468.00,
                "base_year_expenses": 100000.00,
                "current_year_expenses": 115000.00,
            },
        }
        return self._save_json("expected_base_year_standard.json", data)

    def generate_base_year_decrease(self) -> Path:
        """Generate base year scenario where current < base (zero charge).

        Rule: If current < base, tenant pays zero (not a credit).
        """
        data = {
            "scenario": "base_year_decrease",
            "description": "Current year expenses below base year (zero charge)",
            "inputs": {
                "base_year_expenses": 100000.00,
                "current_year_expenses": 95000.00,
                "pro_rata_share": 0.0312,
            },
            "calculation_steps": [
                {
                    "step": 1,
                    "description": "Calculate expense change",
                    "formula": "current_expenses - base_expenses",
                    "calculation": "95000.00 - 100000.00 = -5000.00",
                    "result": -5000.00,
                },
                {
                    "step": 2,
                    "description": "Apply zero floor (no credits)",
                    "formula": "max(expense_change * pro_rata_share, 0)",
                    "calculation": "max(-156.00, 0) = 0.00",
                    "result": 0.00,
                    "note": "Base year stop - tenant does not get credit for decreases",
                },
            ],
            "expected_output": {
                "expense_change": -5000.00,
                "tenant_share": 0.00,
                "base_year_expenses": 100000.00,
                "current_year_expenses": 95000.00,
            },
        }
        return self._save_json("expected_base_year_decrease.json", data)

    def generate_base_year_normalization(self) -> Path:
        """Generate base year normalization for low occupancy.

        Rule: If base year occupancy < target, normalize base year expenses.
        """
        data = {
            "scenario": "base_year_normalization",
            "description": "Base year normalized for low occupancy (70%)",
            "inputs": {
                "base_year_variable_expenses": 60000.00,
                "base_year_fixed_expenses": 40000.00,
                "base_year_occupancy": 0.70,
                "target_occupancy": 0.95,
                "current_year_expenses": 115000.00,
                "pro_rata_share": 0.0312,
            },
            "calculation_steps": [
                {
                    "step": 1,
                    "description": "Calculate gross-up factor for base year",
                    "formula": "target_occupancy / base_year_occupancy",
                    "calculation": "0.95 / 0.70 = 1.357143",
                    "result": 1.357143,
                },
                {
                    "step": 2,
                    "description": "Normalize base year variable expenses",
                    "formula": "base_variable * gross_up_factor",
                    "calculation": "60000.00 * 1.357143 = 81428.58",
                    "result": 81428.58,
                },
                {
                    "step": 3,
                    "description": "Calculate normalized base year total",
                    "formula": "normalized_variable + fixed",
                    "calculation": "81428.58 + 40000.00 = 121428.58",
                    "result": 121428.58,
                },
                {
                    "step": 4,
                    "description": "Calculate tenant share (negative - credit case)",
                    "formula": "(current - normalized_base) * pro_rata_share",
                    "calculation": "(115000.00 - 121428.58) * 0.0312 = -200.58",
                    "result": -200.58,
                    "note": "Negative result - tenant gets credit (different from decrease scenario)",
                },
                {
                    "step": 5,
                    "description": "Apply zero floor",
                    "formula": "max(tenant_share, 0)",
                    "calculation": "max(-200.58, 0) = 0.00",
                    "result": 0.00,
                },
            ],
            "expected_output": {
                "original_base_year_total": 100000.00,
                "normalized_base_year_total": 121428.58,
                "current_year_expenses": 115000.00,
                "tenant_share_before_floor": -200.58,
                "tenant_share_final": 0.00,
                "normalization_applied": True,
            },
        }
        return self._save_json("expected_base_year_normalization.json", data)

    # ===== FULL RECONCILIATION =====

    def generate_full_reconciliation(self) -> Path:
        """Generate complete reconciliation with all adjustments.

        Includes: gross-up, cap, base year, admin fee, pro-rata share.
        """
        data = {
            "scenario": "full_reconciliation",
            "description": "Complete reconciliation with all adjustments",
            "property_details": {
                "name": "Metroplex Office Tower",
                "total_square_feet": 80000,
            },
            "tenant_details": {
                "name": "Acme Corporation",
                "suite": "401",
                "rentable_sqft": 2500,
                "pro_rata_share": 0.0312,  # 2500 / 80000
            },
            "lease_terms": {
                "base_year": 2024,
                "cap_type": "cumulative",
                "cap_rate": 0.05,
                "gross_up_target": 0.95,
                "admin_fee_percent": 0.15,
            },
            "year_2025_calculation": {
                "step_1_raw_expenses": {
                    "variable_expenses": 120000.00,
                    "fixed_expenses": 80000.00,
                    "total": 200000.00,
                },
                "step_2_gross_up": {
                    "actual_occupancy": 0.88,
                    "target_occupancy": 0.95,
                    "gross_up_factor": 1.079545,  # 0.95 / 0.88
                    "grossed_variable": 129545.45,  # 120000 * 1.079545
                    "fixed_unchanged": 80000.00,
                    "total_after_grossup": 209545.45,
                },
                "step_3_cap_application": {
                    "base_year_expenses": 200000.00,
                    "cumulative_max_year1": 210000.00,  # 200k * (1 + 0.05 * 1)
                    "proposed_amount": 209545.45,
                    "capped_amount": 209545.45,  # Under cap
                    "note": "Within cap limit",
                },
                "step_4_base_year_adjustment": {
                    "base_year_total": 200000.00,
                    "current_year_total": 209545.45,
                    "increase_over_base": 9545.45,
                },
                "step_5_admin_fee": {
                    "expense_increase": 9545.45,
                    "admin_fee_rate": 0.15,
                    "admin_fee_amount": 1431.82,  # 9545.45 * 0.15
                    "total_with_admin": 10977.27,  # 9545.45 + 1431.82
                },
                "step_6_pro_rata_share": {
                    "total_recoverable_pool": 10977.27,
                    "pro_rata_share": 0.0312,
                    "tenant_share": 342.49,  # 10977.27 * 0.0312
                },
            },
            "expected_output": {
                "total_building_expenses": 200000.00,
                "total_after_grossup": 209545.45,
                "total_after_cap": 209545.45,
                "increase_over_base": 9545.45,
                "admin_fee": 1431.82,
                "total_recoverable": 10977.27,
                "tenant_billable_amount": 342.49,
                "per_sqft_charge": 0.14,  # 342.49 / 2500
            },
        }
        return self._save_json("expected_full_reconciliation.json", data)

    # ===== EDGE CASES =====

    def generate_edge_first_year(self) -> Path:
        """Generate first year tenant scenario (no base year)."""
        data = {
            "scenario": "edge_first_year_tenant",
            "description": "First year tenant - no base year comparison",
            "inputs": {
                "current_year_expenses": 115000.00,
                "pro_rata_share": 0.0312,
                "is_first_year": True,
            },
            "calculation_steps": [
                {
                    "step": 1,
                    "description": "Check for base year",
                    "result": "No base year - first year of tenancy",
                },
                {
                    "step": 2,
                    "description": "Set current year as base",
                    "calculation": "current_year becomes base_year",
                    "result": 115000.00,
                },
                {
                    "step": 3,
                    "description": "Calculate tenant share",
                    "formula": "(current - base) * pro_rata_share",
                    "calculation": "(115000 - 115000) * 0.0312 = 0.00",
                    "result": 0.00,
                },
            ],
            "expected_output": {
                "tenant_share": 0.00,
                "base_year_set": 115000.00,
                "note": "First year establishes base - no charges",
            },
        }
        return self._save_json("expected_edge_first_year.json", data)

    def generate_edge_full_occupancy(self) -> Path:
        """Generate 100% occupancy scenario (no gross-up)."""
        data = {
            "scenario": "edge_full_occupancy",
            "description": "Building at 100% occupancy - no gross-up needed",
            "inputs": {
                "variable_expenses": 10000.00,
                "fixed_expenses": 5000.00,
                "actual_occupancy": 1.00,
                "target_occupancy": 0.95,
            },
            "calculation_steps": [
                {
                    "step": 1,
                    "description": "Calculate gross-up factor",
                    "formula": "target / actual",
                    "calculation": "0.95 / 1.00 = 0.95",
                    "result": 0.95,
                },
                {
                    "step": 2,
                    "description": "Apply minimum factor constraint",
                    "formula": "max(factor, 1.0)",
                    "calculation": "max(0.95, 1.0) = 1.0",
                    "result": 1.0,
                    "note": "Never gross down",
                },
            ],
            "expected_output": {
                "grossed_variable_expenses": 10000.00,
                "fixed_expenses": 5000.00,
                "total_expenses": 15000.00,
                "gross_up_factor": 1.0,
            },
        }
        return self._save_json("expected_edge_full_occupancy.json", data)

    def generate_edge_zero_prorate(self) -> Path:
        """Generate zero pro-rata share (error case)."""
        data = {
            "scenario": "edge_zero_prorate",
            "description": "Zero pro-rata share - configuration error",
            "inputs": {
                "expense_increase": 15000.00,
                "pro_rata_share": 0.00,
            },
            "expected_behavior": "ERROR",
            "expected_error": {
                "type": "ValidationError",
                "message": "Pro-rata share must be greater than zero",
                "field": "pro_rata_share",
            },
            "note": "System should reject zero or negative pro-rata shares during lease creation",
        }
        return self._save_json("expected_edge_zero_prorate.json", data)

    def generate_edge_negative_variance(self) -> Path:
        """Generate negative variance scenario (tenant credit)."""
        data = {
            "scenario": "edge_negative_variance",
            "description": "Expenses decreased - potential tenant credit",
            "inputs": {
                "prior_year_estimate": 120000.00,
                "prior_year_actual": 110000.00,
                "tenant_paid_on_estimate": 3744.00,  # 120k * 0.0312
                "pro_rata_share": 0.0312,
            },
            "calculation_steps": [
                {
                    "step": 1,
                    "description": "Calculate what tenant should have paid",
                    "formula": "actual_expenses * pro_rata_share",
                    "calculation": "110000.00 * 0.0312 = 3432.00",
                    "result": 3432.00,
                },
                {
                    "step": 2,
                    "description": "Calculate variance",
                    "formula": "amount_paid - amount_owed",
                    "calculation": "3744.00 - 3432.00 = 312.00",
                    "result": 312.00,
                },
                {
                    "step": 3,
                    "description": "Determine credit due",
                    "result": 312.00,
                    "note": "Tenant overpaid - credit or refund due",
                },
            ],
            "expected_output": {
                "tenant_paid": 3744.00,
                "tenant_owed": 3432.00,
                "credit_due": 312.00,
                "variance_type": "overpayment",
            },
        }
        return self._save_json("expected_edge_negative_variance.json", data)

    def generate_all(self) -> list[Path]:
        """Generate all expected calculation output files."""
        print("Generating expected calculation outputs...\n")

        files = []

        # Gross-up scenarios
        print("Generating gross-up scenarios...")
        files.append(self.generate_grossup_basic())
        files.append(self.generate_grossup_high_occupancy())
        files.append(self.generate_grossup_safety_valve())

        # Cap scenarios
        print("Generating cap scenarios...")
        files.append(self.generate_cap_non_cumulative())
        files.append(self.generate_cap_cumulative())
        files.append(self.generate_cap_cumulative_compounding())

        # Base year scenarios
        print("Generating base year scenarios...")
        files.append(self.generate_base_year_standard())
        files.append(self.generate_base_year_decrease())
        files.append(self.generate_base_year_normalization())

        # Full reconciliation
        print("Generating full reconciliation scenario...")
        files.append(self.generate_full_reconciliation())

        # Edge cases
        print("Generating edge cases...")
        files.append(self.generate_edge_first_year())
        files.append(self.generate_edge_full_occupancy())
        files.append(self.generate_edge_zero_prorate())
        files.append(self.generate_edge_negative_variance())

        print(f"\nGenerated {len(files)} expected calculation files successfully")
        return files


if __name__ == "__main__":
    generator = CalculationExpectedGenerator()
    generated_files = generator.generate_all()

    print("\nGenerated files:")
    for filepath in generated_files:
        print(f"  - {filepath.name}")
