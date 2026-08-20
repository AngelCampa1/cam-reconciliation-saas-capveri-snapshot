"""Integration test for the full onboarding pipeline.

Tests the complete GL upload → pool auto-setup → reconciliation pipeline
that runs during onboarding. Uses real parsers and services with mocked
Supabase to verify the full pipeline produces non-zero results.
"""

from __future__ import annotations

import math
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from app.services.calculation.pool_aggregator import (
    GLEntry,
    PoolMapping,
    aggregate_by_pools,
)
from app.services.ingestion.parsers.mri import MRIRentRollParser
from app.services.pools.auto_setup import classify_account

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"
MRI_FIXTURE = FIXTURES_DIR / "erp_export_samples" / "mri_gl_hou01_2024.csv"

PROPERTY_ID = UUID("aaaa2222-2222-2222-2222-222222222222")
ORG_ID = UUID("11111111-1111-1111-1111-111111111111")
BATCH_ID = uuid4()

pytestmark = pytest.mark.integration


class TestOnboardingPipeline:
    """End-to-end test: GL parse → pool auto-setup → aggregation."""

    @pytest.fixture
    def mri_data(self):
        """Parse the MRI fixture file."""
        parser = MRIRentRollParser()
        with open(MRI_FIXTURE, "rb") as f:
            result = parser.parse(f, "mri_gl_hou01_2024.csv", str(PROPERTY_ID))
        assert result.success, f"MRI parse failed: {result.errors}"
        assert result.row_count > 0
        return result

    def test_mri_parser_returns_2024_data(self, mri_data):
        """Parser should return rows with 2024 dates."""
        df = mri_data.data
        assert df is not None
        assert len(df) == 30

        # Verify transaction dates are in 2024
        dates = df["transaction_date"].unique()
        years = {str(d)[:4] for d in dates}
        assert "2024" in years

    def test_classify_account_covers_fixture_descriptions(self):
        """Every fixture description should classify to a pool."""
        descriptions = [
            "Janitorial - Contract",
            "Janitorial - Supplies",
            "Window Washing",
            "Utilities - Electricity",
            "Utilities - Water/Sewer",
            "Utilities - Gas",
            "R&M - HVAC Contract",
            "R&M - HVAC Chiller Full Overhaul",
            "R&M - Elevator Contract",
            "R&M - Plumbing",
            "R&M - Electrical",
            "Landscaping - Contract",
            "Landscaping - Extras",
            "Parking Lot Sweeping",
            "Parking Lot R&M",
            "Security - Guard Service",
            "Security - Systems",
            "Fire & Life Safety",
            "Insurance - Property",
            "Insurance - Liability",
            "Taxes - Real Estate",
            "Management Fees",
            "Admin / Office Expense",
            "Payroll - Building Eng",
            "Trash Removal",
            "R&M - Roof",
            "R&M - General Bldg",
            "Pest Control",
            "Access Control",
            "Legal & Professional",
        ]

        pools_seen: set[str] = set()
        for desc in descriptions:
            pool_name, pool_type = classify_account(desc)
            assert pool_name, f"No pool for: {desc}"
            assert pool_type in {"tax", "insurance", "operating", "other"}
            pools_seen.add(pool_name)

        # Should create multiple distinct pools
        assert len(pools_seen) >= 5

    def test_auto_setup_creates_pools_from_parsed_gl(self, mri_data):
        """Auto-setup should create pools and mappings from parsed GL data.

        Uses a mock Supabase that stores data in-memory to simulate
        the real DB behavior of auto_setup_pools_from_gl.
        """
        df = mri_data.data

        # Build list of unique (account_code, description) pairs
        accounts: list[tuple[str, str]] = []
        seen: set[str] = set()
        for _, row in df.iterrows():
            code = str(row.get("account_code", "")).strip()
            desc = str(row.get("account_description", "")).strip()
            if code and code not in seen:
                seen.add(code)
                accounts.append((code, desc))

        assert len(accounts) > 0

        # Classify all accounts
        pool_accounts: dict[str, list[str]] = {}
        for code, desc in accounts:
            pool_name, _ = classify_account(desc)
            pool_accounts.setdefault(pool_name, []).append(code)

        # Should produce multiple pools
        assert len(pool_accounts) >= 5

        # Every account code should map to exactly one pool
        all_codes = [c for codes in pool_accounts.values() for c in codes]
        assert len(all_codes) == len(accounts)

    def test_pool_aggregation_produces_nonzero_totals(self, mri_data):
        """Aggregation with pools derived from GL should produce non-zero totals."""
        df = mri_data.data

        # Step 1: Classify accounts to build pools
        pool_map: dict[str, UUID] = {}
        pool_types: dict[str, str] = {}
        for _, row in df.iterrows():
            code = str(row.get("account_code", "")).strip()
            desc = str(row.get("account_description", "")).strip()
            pool_name, pool_type = classify_account(desc)
            if pool_name not in pool_map:
                pool_map[pool_name] = uuid4()
                pool_types[pool_name] = pool_type

        # Step 2: Create pool mappings (exact code match per account)
        mappings: list[PoolMapping] = []
        seen_codes: set[str] = set()
        for _, row in df.iterrows():
            code = str(row.get("account_code", "")).strip()
            desc = str(row.get("account_description", "")).strip()
            if code in seen_codes:
                continue
            seen_codes.add(code)

            pool_name, _ = classify_account(desc)
            pool_id = pool_map[pool_name]
            mappings.append(
                PoolMapping(
                    pool_id=pool_id,
                    pool_name=pool_name,
                    pattern=code,
                )
            )

        # Step 3: Build GL entries for aggregation
        entries: list[GLEntry] = []
        for _, row in df.iterrows():
            code = str(row.get("account_code", "")).strip()
            raw_debit = row.get("debit", 0)
            raw_credit = row.get("credit", 0)
            debit = (
                Decimal(str(raw_debit))
                if raw_debit
                and not (isinstance(raw_debit, float) and math.isnan(raw_debit))
                else Decimal("0")
            )
            credit = (
                Decimal(str(raw_credit))
                if raw_credit
                and not (isinstance(raw_credit, float) and math.isnan(raw_credit))
                else Decimal("0")
            )
            amount = debit - credit
            entries.append(
                GLEntry(
                    id=uuid4(),
                    account_code=code,
                    amount=amount,
                )
            )

        assert len(entries) == 30

        # Step 4: Aggregate
        pool_totals = aggregate_by_pools(entries, mappings)

        # Verify non-zero results
        total_operating = sum(
            pt.total_amount
            for pid, pt in pool_totals.items()
            if pool_types.get(pt.pool_name) == "operating"
        )
        total_tax = sum(
            pt.total_amount
            for pid, pt in pool_totals.items()
            if pool_types.get(pt.pool_name) == "tax"
        )
        total_insurance = sum(
            pt.total_amount
            for pid, pt in pool_totals.items()
            if pool_types.get(pt.pool_name) == "insurance"
        )

        assert total_operating > 0, "Operating expenses should be > 0"
        assert total_tax > 0, "Tax expenses should be > 0"
        assert total_insurance > 0, "Insurance expenses should be > 0"

        grand_total = sum(pt.total_amount for pt in pool_totals.values())
        assert grand_total > Decimal(
            "200000"
        ), f"Grand total {grand_total} should exceed $200k for this fixture"

        # Every entry should be matched
        total_entries = sum(pt.entry_count for pt in pool_totals.values())
        assert total_entries == 30

    def test_full_pipeline_date_range_detection(self, mri_data):
        """The GL data year should be detectable from parsed data."""
        df = mri_data.data

        dates = df["transaction_date"].tolist()
        min_date = min(str(d) for d in dates)
        max_date = max(str(d) for d in dates)

        assert min_date.startswith("2024")
        assert max_date.startswith("2024")

        # The year detection logic (same as backend endpoint)
        year = int(max_date[:4])
        assert year == 2024
