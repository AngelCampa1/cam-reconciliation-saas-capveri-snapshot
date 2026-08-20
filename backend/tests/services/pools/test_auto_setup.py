"""Tests for auto-setup expense pools from GL data.

Tests verify keyword-based classification of GL account descriptions
into expense pools, idempotent pool/mapping creation, and edge cases.
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.services.pools.auto_setup import (
    auto_setup_pools_from_gl,
    classify_account,
)


class TestClassifyAccount:
    """Tests for classify_account function."""

    def test_classifies_janitorial(self):
        assert classify_account("Janitorial Services") == ("Janitorial", "operating")

    def test_classifies_janitorial_partial_match(self):
        assert classify_account("Custodial & Cleaning") == ("Janitorial", "operating")

    def test_classifies_utilities(self):
        assert classify_account("Electric & Gas") == ("Utilities", "operating")

    def test_classifies_water_utility(self):
        assert classify_account("Water/Sewer Charges") == ("Utilities", "operating")

    def test_classifies_taxes(self):
        assert classify_account("Real Estate Tax 2024") == (
            "Real Estate Taxes",
            "tax",
        )

    def test_classifies_hcad_assessment(self):
        assert classify_account("HCAD Assessment") == ("Real Estate Taxes", "tax")

    def test_classifies_insurance(self):
        assert classify_account("Property Insurance Premium") == (
            "Insurance",
            "insurance",
        )

    def test_classifies_repairs_maintenance(self):
        assert classify_account("HVAC Maintenance Contract") == (
            "Repairs & Maintenance",
            "operating",
        )

    def test_classifies_rm_abbreviation(self):
        assert classify_account("R&M Supplies") == (
            "Repairs & Maintenance",
            "operating",
        )

    def test_classifies_landscaping(self):
        assert classify_account("Landscaping & Snow Removal") == (
            "Grounds & Parking",
            "operating",
        )

    def test_classifies_security(self):
        assert classify_account("Security Guard Services") == (
            "Security",
            "operating",
        )

    def test_classifies_fire_safety(self):
        assert classify_account("Fire & Life Safety") == (
            "Fire & Life Safety",
            "operating",
        )

    def test_classifies_management_fee(self):
        assert classify_account("Management Fee - Monthly") == (
            "Management Fee",
            "operating",
        )

    def test_classifies_payroll(self):
        assert classify_account("Building Engineer Salary") == (
            "Building Payroll",
            "operating",
        )

    def test_classifies_professional_fees(self):
        assert classify_account("Legal & Accounting Fees") == (
            "Professional Fees",
            "other",
        )

    def test_classifies_leasing_as_non_recoverable(self):
        assert classify_account("Leasing Commissions") == (
            "Non-Recoverable",
            "other",
        )

    def test_classifies_software_as_non_recoverable(self):
        assert classify_account("Software Subscriptions") == (
            "Non-Recoverable",
            "other",
        )

    def test_unknown_description_falls_to_catch_all(self):
        assert classify_account("Miscellaneous Expense XYZ") == (
            "Other Operating",
            "operating",
        )

    def test_empty_description_falls_to_catch_all(self):
        assert classify_account("") == ("Other Operating", "operating")

    def test_case_insensitive_matching(self):
        assert classify_account("JANITORIAL SERVICES") == ("Janitorial", "operating")

    def test_taxes_before_insurance_priority(self):
        """Tax keywords should match before insurance for 'taxes & insurance'."""
        pool_name, _ = classify_account("Taxes & Insurance Combined")
        assert pool_name == "Real Estate Taxes"


def _make_gl_entries(accounts: list[tuple[str, str]]) -> list[dict]:
    """Helper to create GL entry rows from (code, description) pairs."""
    return [
        {"account_code": code, "account_description": desc} for code, desc in accounts
    ]


class _PagedQuery:
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self._start: int | None = None
        self._end: int | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def range(self, start, end):
        self._start = start
        self._end = end
        return self

    def execute(self):
        rows = self.rows
        if self._start is not None and self._end is not None:
            rows = rows[self._start : self._end + 1]
        return MagicMock(data=rows)


def _mock_supabase(
    gl_data: list[dict],
    existing_pools: list[dict] | None = None,
    existing_mappings: list[dict] | None = None,
):
    """Create a mock Supabase client for auto_setup tests."""
    mock = MagicMock()
    inserted_pools: list[dict] = []
    inserted_mappings: list[dict] = []

    pool_counter = [0]

    def mock_table(table_name):
        mock_qb = MagicMock()

        if table_name == "gl_entries":
            mock_qb.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=gl_data)
            )
        elif table_name == "expense_pools":
            # select query
            mock_qb.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=existing_pools or [])
            )

            # insert query
            def capture_pool_insert(data):
                pool_counter[0] += 1
                pool_id = f"pool-{pool_counter[0]}"
                inserted_pools.append({**data, "id": pool_id})
                insert_mock = MagicMock()
                insert_mock.execute.return_value = MagicMock(
                    data=[{**data, "id": pool_id}]
                )
                return insert_mock

            mock_qb.insert = capture_pool_insert
        elif table_name == "pool_mappings":
            # select query (uses .in_ for expense_pool_id filtering)
            mock_qb.select.return_value.in_.return_value.execute.return_value = (
                MagicMock(data=existing_mappings or [])
            )

            # insert query
            def capture_mapping_insert(data):
                inserted_mappings.append(data)
                insert_mock = MagicMock()
                insert_mock.execute.return_value = MagicMock(data=[data])
                return insert_mock

            mock_qb.insert = capture_mapping_insert

        return mock_qb

    mock.table = mock_table
    mock._inserted_pools = inserted_pools
    mock._inserted_mappings = inserted_mappings
    return mock


class TestAutoSetupPoolsFromGl:
    """Tests for auto_setup_pools_from_gl function."""

    def test_creates_pools_from_yardi_style_gl(self):
        """Should classify Yardi-style codes (5xxx.xx) by description."""
        gl_data = _make_gl_entries(
            [
                ("5100.10", "Janitorial Services"),
                ("5200.10", "Utilities - Electric"),
                ("5300.10", "Real Estate Tax"),
            ]
        )
        mock = _mock_supabase(gl_data)

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 3
        assert result.mappings_created == 3
        assert "Janitorial" in result.classification_summary
        assert "Utilities" in result.classification_summary
        assert "Real Estate Taxes" in result.classification_summary

    def test_creates_pools_from_mri_style_gl(self):
        """Should classify MRI-style codes (5xxx) by description."""
        gl_data = _make_gl_entries(
            [
                ("5001", "Insurance Premium"),
                ("5002", "Security Services"),
            ]
        )
        mock = _mock_supabase(gl_data)

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 2
        assert result.mappings_created == 2
        assert "Insurance" in result.classification_summary
        assert "Security" in result.classification_summary

    def test_creates_pools_from_generic_style_gl(self):
        """Should classify generic-style codes (6xxx) by description."""
        gl_data = _make_gl_entries(
            [
                ("6000", "Landscaping & Grounds"),
                ("6100", "Elevator Maintenance"),
                ("6200", "Fire Sprinkler Inspection"),
            ]
        )
        mock = _mock_supabase(gl_data)

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 3
        assert result.mappings_created == 3

    def test_unknown_descriptions_get_catch_all_pool(self):
        """Should assign unknown descriptions to 'Other Operating' pool."""
        gl_data = _make_gl_entries(
            [
                ("9999", "Miscellaneous Expense"),
                ("9998", "Random Charge"),
            ]
        )
        mock = _mock_supabase(gl_data)

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 1  # One "Other Operating" pool
        assert result.mappings_created == 2  # Both codes mapped
        assert "Other Operating" in result.classification_summary

    def test_idempotent_no_duplicate_pools(self):
        """Calling twice should not duplicate pools."""
        gl_data = _make_gl_entries([("5100", "Janitorial")])
        existing_pools = [{"id": "existing-pool-1", "name": "Janitorial"}]

        mock = _mock_supabase(gl_data, existing_pools=existing_pools)

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 0  # Pool already exists

    def test_idempotent_no_duplicate_mappings(self):
        """Calling twice should not duplicate mappings."""
        gl_data = _make_gl_entries([("5100", "Janitorial")])
        existing_pools = [{"id": "existing-pool-1", "name": "Janitorial"}]
        existing_mappings = [{"gl_account_pattern": "5100"}]

        mock = _mock_supabase(
            gl_data,
            existing_pools=existing_pools,
            existing_mappings=existing_mappings,
        )

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 0
        assert result.mappings_created == 0

    def test_adds_new_mappings_to_existing_pool(self):
        """Should add new mappings for unmapped codes to existing pools."""
        gl_data = _make_gl_entries(
            [
                ("5100", "Janitorial Supplies"),
                ("5101", "Janitorial Contract"),
            ]
        )
        existing_pools = [{"id": "existing-pool-1", "name": "Janitorial"}]
        existing_mappings = [{"gl_account_pattern": "5100"}]  # 5101 not yet mapped

        mock = _mock_supabase(
            gl_data,
            existing_pools=existing_pools,
            existing_mappings=existing_mappings,
        )

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 0  # Pool exists
        assert result.mappings_created == 1  # Only 5101 added

    def test_empty_gl_entries_returns_zero(self):
        """Should return empty result for batch with no GL entries."""
        mock = _mock_supabase(gl_data=[])

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 0
        assert result.mappings_created == 0
        assert result.classification_summary == {}

    def test_deduplicates_account_codes(self):
        """Should handle duplicate account codes in GL entries."""
        gl_data = [
            {"account_code": "5100", "account_description": "Janitorial"},
            {"account_code": "5100", "account_description": "Janitorial"},
            {"account_code": "5100", "account_description": "Janitorial"},
        ]
        mock = _mock_supabase(gl_data)

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 1
        assert result.mappings_created == 1

    def test_recoverable_pools_get_gross_up(self):
        """Recoverable pool types should have gross_up_applicable=True."""
        gl_data = _make_gl_entries(
            [
                ("5100", "Janitorial"),  # operating → recoverable
                ("5200", "Leasing Commissions"),  # other → non-recoverable
            ]
        )
        mock = _mock_supabase(gl_data)

        auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        inserted = mock._inserted_pools
        janitorial = next(p for p in inserted if p["name"] == "Janitorial")
        non_recov = next(p for p in inserted if p["name"] == "Non-Recoverable")

        assert janitorial["is_gross_up_applicable"] is True
        assert janitorial["gross_up_target"] == str(Decimal("0.95"))

        assert non_recov["is_gross_up_applicable"] is False
        assert "gross_up_target" not in non_recov

    def test_pool_types_set_correctly(self):
        """Pool types should match classification."""
        gl_data = _make_gl_entries(
            [
                ("5100", "Real Estate Tax"),
                ("5200", "Insurance Premium"),
                ("5300", "Janitorial"),
            ]
        )
        mock = _mock_supabase(gl_data)

        auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        inserted = mock._inserted_pools
        tax_pool = next(p for p in inserted if p["name"] == "Real Estate Taxes")
        ins_pool = next(p for p in inserted if p["name"] == "Insurance")
        jan_pool = next(p for p in inserted if p["name"] == "Janitorial")

        assert tax_pool["pool_type"] == "tax"
        assert ins_pool["pool_type"] == "insurance"
        assert jan_pool["pool_type"] == "operating"

    def test_uses_admin_client_by_default(self):
        """Should use get_supabase_admin when no client provided."""
        mock_admin = _mock_supabase(gl_data=[])

        with patch(
            "app.services.pools.auto_setup.get_supabase_admin",
            return_value=mock_admin,
        ):
            result = auto_setup_pools_from_gl(
                property_id=uuid4(),
                batch_id=uuid4(),
                organization_id=uuid4(),
            )

        assert result.pools_created == 0

    def test_handles_blank_account_codes(self):
        """Should skip entries with blank account codes."""
        gl_data = [
            {"account_code": "", "account_description": "Janitorial"},
            {"account_code": "  ", "account_description": "Utilities"},
            {"account_code": "5100", "account_description": "Insurance"},
        ]
        mock = _mock_supabase(gl_data)

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 1  # Only Insurance
        assert result.mappings_created == 1

    def test_multiple_accounts_same_pool(self):
        """Multiple account codes classified to same pool should create one pool."""
        gl_data = _make_gl_entries(
            [
                ("5100", "Janitorial Supplies"),
                ("5101", "Janitorial Contract"),
                ("5102", "Window Washing"),
            ]
        )
        mock = _mock_supabase(gl_data)

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=mock,
        )

        assert result.pools_created == 1  # All under "Janitorial"
        assert result.mappings_created == 3  # Three distinct codes
        assert sorted(result.classification_summary["Janitorial"]) == [
            "5100",
            "5101",
            "5102",
        ]

    def test_includes_second_page_gl_account_codes(self):
        """Auto-setup creates mappings for account codes beyond the first page."""
        gl_data = _make_gl_entries(
            [(f"510{index}", "Janitorial") for index in range(1000)]
            + [("9999", "Miscellaneous Expense")]
        )
        mock = _mock_supabase(gl_data)

        def table_side_effect(table_name):
            if table_name == "gl_entries":
                return _PagedQuery(gl_data)
            return mock.table(table_name)

        paged_mock = MagicMock()
        paged_mock.table.side_effect = table_side_effect

        result = auto_setup_pools_from_gl(
            property_id=uuid4(),
            batch_id=uuid4(),
            organization_id=uuid4(),
            supabase=paged_mock,
        )

        assert "Other Operating" in result.classification_summary
        assert result.classification_summary["Other Operating"] == ["9999"]
        assert result.mappings_created == 1001
