"""Tests for Leakage Calculation Service.

Tests verify leakage calculation by comparing CapVeri calculated amounts
against actual billed amounts to identify recovery opportunities.
"""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.services.calculation.leakage import (
    LeakageBreakdown,
    LeakageResult,
    calculate_leakage,
)
from tests.conftest import MockQueryBuilder


def make_reconciliation_snapshot(
    tenant_name: str,
    total_recovery: float,
    period_start: str,
    period_end: str,
    lease_id: str | None = None,
) -> dict:
    """Create test reconciliation snapshot data.

    Uses lease_id to link to leases table (separate query).
    """
    return {
        "lease_id": lease_id or f"lease_{tenant_name.lower().replace(' ', '_')}",
        "total_recovery": total_recovery,
        "period_start_date": period_start,
        "period_end_date": period_end,
    }


def make_lease(lease_id: str, tenant_name: str) -> dict:
    """Create test lease data for tenant name lookup."""
    return {
        "id": lease_id,
        "tenant_name": tenant_name,
    }


def make_actual_billed(tenant_name: str, billed_amount: float) -> dict:
    """Create test actual billed amount data."""
    return {
        "tenant_name": tenant_name,
        "billed_amount": billed_amount,
    }


@pytest.fixture
def mock_supabase():
    """Mock Supabase admin client."""
    return MagicMock()


def create_mock_table_fn(recon_data, billed_data, leases_data=None):
    """Create a mock table function that handles all three table queries."""
    mock_recon_result = MagicMock()
    mock_recon_result.data = recon_data

    mock_billed_result = MagicMock()
    mock_billed_result.data = billed_data

    mock_leases_result = MagicMock()
    mock_leases_result.data = leases_data or []

    mock_batches_result = MagicMock()
    mock_batches_result.data = []

    mock_property_result = MagicMock()
    mock_property_result.data = [{"id": "property-id"}]

    def mock_table(table_name):
        mock_qb = MagicMock()
        if table_name == "properties":
            mock_qb.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = (
                mock_property_result
            )
        if table_name == "reconciliation_snapshots":
            mock_qb.select.return_value.eq.return_value.eq.return_value.lte.return_value.gte.return_value.eq.return_value.execute.return_value = (
                mock_recon_result
            )
            mock_qb.select.return_value.eq.return_value.eq.return_value.lte.return_value.gte.return_value.in_.return_value.execute.return_value = (
                mock_recon_result
            )
        elif table_name == "import_batches":
            mock_qb.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = (
                mock_batches_result
            )
        elif table_name == "actual_billed_amounts":
            mock_qb.select.return_value.eq.return_value.eq.return_value.lte.return_value.gte.return_value.execute.return_value = (
                mock_billed_result
            )
        elif table_name == "leases":
            # leases is scoped by property_id only (no organization_id column).
            mock_qb.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
                mock_leases_result
            )
        return mock_qb

    return mock_table


class TestCalculateLeakage:
    """Tests for calculate_leakage function."""

    def test_cross_org_property_returns_no_data(self, mock_supabase):
        """Service-role queries must not read another org's property data."""
        org_id = uuid4()
        other_org_id = uuid4()
        property_id = uuid4()
        lease_id = str(uuid4())

        table_data = {
            "properties": [
                {
                    "id": str(property_id),
                    "organization_id": str(other_org_id),
                    "name": "Other Org Property",
                }
            ],
            "reconciliation_snapshots": [
                {
                    "property_id": str(property_id),
                    "lease_id": lease_id,
                    "total_recovery": "9000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "import_batches": [
                {
                    "id": str(uuid4()),
                    "property_id": str(property_id),
                    "organization_id": str(other_org_id),
                }
            ],
            "leases": [
                {
                    "id": lease_id,
                    "property_id": str(property_id),
                    "organization_id": str(other_org_id),
                    "tenant_name": "Other Tenant",
                }
            ],
            "actual_billed_amounts": [
                {
                    "organization_id": str(other_org_id),
                    "property_id": str(property_id),
                    "tenant_name": "Other Tenant",
                    "billed_amount": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }

        def mock_table(table_name):
            return MockQueryBuilder(data=table_data.get(table_name, []))

        mock_supabase.table = mock_table

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        assert result.capveri_calculated == Decimal("0")
        assert result.actual_billed == Decimal("0")
        assert result.has_reconciliation_data is False
        assert result.has_gl_data is False
        assert result.has_billing_data is False

    @pytest.mark.parametrize(
        ("record_start", "record_end"),
        [
            ("2024-01-01", "2024-12-31"),
            ("2024-03-01", "2024-04-30"),
            ("2023-12-01", "2025-01-31"),
            ("2023-12-01", "2024-01-15"),
            ("2024-12-15", "2025-01-31"),
        ],
    )
    def test_billed_records_use_period_overlap_semantics(
        self, mock_supabase, record_start, record_end
    ):
        """Billed records overlapping the requested period are included."""
        property_id = uuid4()
        org_id = uuid4()

        table_data = {
            "properties": [
                {"id": str(property_id), "organization_id": str(org_id)},
            ],
            "reconciliation_snapshots": [],
            "import_batches": [],
            "actual_billed_amounts": [
                {
                    "organization_id": str(org_id),
                    "property_id": str(property_id),
                    "tenant_name": "Tenant A",
                    "billed_amount": "123.45",
                    "period_start_date": record_start,
                    "period_end_date": record_end,
                }
            ],
        }

        def mock_table(table_name):
            return MockQueryBuilder(data=table_data.get(table_name, []))

        mock_supabase.table = mock_table

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        assert result.actual_billed == Decimal("123.45")
        assert result.has_billing_data is True

    def test_calculates_positive_leakage(self, mock_supabase):
        """Should calculate positive leakage when calculated > billed (lines 51-127)."""
        property_id = uuid4()
        org_id = uuid4()

        # CapVeri calculated $10,000 should be billed
        recon_data = [
            make_reconciliation_snapshot("Acme Corp", 6000, "2024-01-01", "2024-12-31"),
            make_reconciliation_snapshot("XYZ Inc", 4000, "2024-01-01", "2024-12-31"),
        ]

        # But only $8,000 was actually billed
        billed_data = [
            make_actual_billed("Acme Corp", 5000),
            make_actual_billed("XYZ Inc", 3000),
        ]

        # Leases lookup data
        leases_data = [
            make_lease("lease_acme_corp", "Acme Corp"),
            make_lease("lease_xyz_inc", "XYZ Inc"),
        ]

        mock_supabase.table = create_mock_table_fn(recon_data, billed_data, leases_data)

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        assert result.property_id == property_id
        assert result.capveri_calculated == Decimal("10000")
        assert result.actual_billed == Decimal("8000")
        assert result.leakage == Decimal("2000")
        assert result.leakage_pct == 20.0
        assert result.has_reconciliation_data is True
        assert result.has_billing_data is True

    def test_calculates_zero_leakage_when_equal(self, mock_supabase):
        """Should calculate zero leakage when calculated equals billed."""
        property_id = uuid4()
        org_id = uuid4()

        recon_data = [
            make_reconciliation_snapshot("Acme Corp", 5000, "2024-01-01", "2024-12-31"),
        ]
        billed_data = [
            make_actual_billed("Acme Corp", 5000),
        ]
        leases_data = [
            make_lease("lease_acme_corp", "Acme Corp"),
        ]

        mock_supabase.table = create_mock_table_fn(recon_data, billed_data, leases_data)

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        assert result.leakage == Decimal("0")
        assert result.leakage_pct == 0.0
        assert len(result.breakdown) == 0  # No differences = no breakdown

    def test_calculates_negative_leakage_when_overbilled(self, mock_supabase):
        """Should calculate negative leakage when billed > calculated (overbilling)."""
        property_id = uuid4()
        org_id = uuid4()

        recon_data = [
            make_reconciliation_snapshot("Acme Corp", 3000, "2024-01-01", "2024-12-31"),
        ]
        billed_data = [
            make_actual_billed("Acme Corp", 5000),
        ]
        leases_data = [
            make_lease("lease_acme_corp", "Acme Corp"),
        ]

        mock_supabase.table = create_mock_table_fn(recon_data, billed_data, leases_data)

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        assert result.leakage == Decimal("-2000")  # Negative = overbilled
        assert result.leakage_pct < 0

    def test_handles_no_reconciliation_data(self, mock_supabase):
        """Should handle case with no reconciliation data (lines 82-83)."""
        property_id = uuid4()
        org_id = uuid4()

        recon_data = []  # No reconciliation data
        billed_data = [make_actual_billed("Acme Corp", 5000)]
        leases_data = []

        mock_supabase.table = create_mock_table_fn(recon_data, billed_data, leases_data)

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        assert result.has_reconciliation_data is False
        assert result.has_billing_data is True
        assert result.capveri_calculated == Decimal("0")

    def test_handles_no_billing_data(self, mock_supabase):
        """Should handle case with no billing data (lines 108-109)."""
        property_id = uuid4()
        org_id = uuid4()

        recon_data = [
            make_reconciliation_snapshot("Acme Corp", 5000, "2024-01-01", "2024-12-31")
        ]
        billed_data = []  # No billing data
        leases_data = [
            make_lease("lease_acme_corp", "Acme Corp"),
        ]

        mock_supabase.table = create_mock_table_fn(recon_data, billed_data, leases_data)

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        assert result.has_reconciliation_data is True
        assert result.has_billing_data is False
        assert result.actual_billed == Decimal("0")

    def test_generates_tenant_breakdown(self, mock_supabase):
        """Should generate per-tenant breakdown with differences (lines 129-151)."""
        property_id = uuid4()
        org_id = uuid4()

        recon_data = [
            make_reconciliation_snapshot("Acme Corp", 6000, "2024-01-01", "2024-12-31"),
            make_reconciliation_snapshot("XYZ Inc", 4000, "2024-01-01", "2024-12-31"),
            make_reconciliation_snapshot(
                "Perfect Co", 2000, "2024-01-01", "2024-12-31"
            ),
        ]
        billed_data = [
            make_actual_billed("Acme Corp", 5000),  # Underbilled by 1000
            make_actual_billed("XYZ Inc", 3500),  # Underbilled by 500
            make_actual_billed("Perfect Co", 2000),  # Exact match
        ]
        leases_data = [
            make_lease("lease_acme_corp", "Acme Corp"),
            make_lease("lease_xyz_inc", "XYZ Inc"),
            make_lease("lease_perfect_co", "Perfect Co"),
        ]

        mock_supabase.table = create_mock_table_fn(recon_data, billed_data, leases_data)

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        # Only tenants with differences should be in breakdown
        assert len(result.breakdown) == 2  # Perfect Co excluded (no diff)

        # Sorted by largest difference first
        assert result.breakdown[0].tenant_name == "Acme Corp"
        assert result.breakdown[0].difference == Decimal("1000")
        assert result.breakdown[1].tenant_name == "XYZ Inc"
        assert result.breakdown[1].difference == Decimal("500")

    def test_aggregates_multiple_snapshots_per_tenant(self, mock_supabase):
        """Should aggregate multiple snapshots for same tenant (lines 93-95)."""
        property_id = uuid4()
        org_id = uuid4()

        # Multiple snapshots for same tenant (e.g., different periods)
        # Use the same lease_id for aggregation
        recon_data = [
            make_reconciliation_snapshot(
                "Acme Corp", 3000, "2024-01-01", "2024-06-30", "lease_acme"
            ),
            make_reconciliation_snapshot(
                "Acme Corp", 2000, "2024-07-01", "2024-12-31", "lease_acme"
            ),
        ]
        billed_data = [
            make_actual_billed("Acme Corp", 4000),
        ]
        leases_data = [
            make_lease("lease_acme", "Acme Corp"),
        ]

        mock_supabase.table = create_mock_table_fn(recon_data, billed_data, leases_data)

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        # Should aggregate: 3000 + 2000 = 5000 calculated
        assert result.capveri_calculated == Decimal("5000")
        assert result.actual_billed == Decimal("4000")
        assert result.leakage == Decimal("1000")

    def test_includes_second_page_reconciliation_leases_and_billed_rows(
        self, mock_supabase
    ):
        """Leakage math includes service rows beyond Supabase's first page."""
        property_id = uuid4()
        org_id = uuid4()
        snapshots = []
        leases = []
        billed = []

        for index in range(1001):
            lease_id = str(uuid4())
            tenant_name = f"Tenant {index}"
            snapshots.append(
                {
                    "organization_id": str(org_id),
                    "property_id": str(property_id),
                    "lease_id": lease_id,
                    "total_recovery": "10.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            )
            leases.append(
                {
                    "organization_id": str(org_id),
                    "property_id": str(property_id),
                    "id": lease_id,
                    "tenant_name": tenant_name,
                }
            )
            billed.append(
                {
                    "organization_id": str(org_id),
                    "property_id": str(property_id),
                    "tenant_name": tenant_name,
                    "billed_amount": "7.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            )

        table_data = {
            "properties": [{"id": str(property_id), "organization_id": str(org_id)}],
            "reconciliation_snapshots": snapshots,
            "import_batches": [],
            "leases": leases,
            "actual_billed_amounts": billed,
        }

        def mock_table(table_name):
            return MockQueryBuilder(data=table_data.get(table_name, []))

        mock_supabase.table = mock_table

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        assert result.capveri_calculated == Decimal("10010.00")
        assert result.actual_billed == Decimal("7007.00")
        assert result.leakage == Decimal("3003.00")
        assert len(result.breakdown) == 1001

    def test_handles_unknown_tenant_names(self, mock_supabase):
        """Should handle missing tenant names gracefully (lines 92, 118)."""
        property_id = uuid4()
        org_id = uuid4()

        # No lease_id - should fall back to "Unknown"
        recon_data = [
            {
                "total_recovery": 5000,
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                # No lease_id
            },
        ]
        # No 'tenant_name' key - should fall back to "Unknown"
        billed_data = [
            {"billed_amount": 4000},
        ]
        leases_data = []  # No leases returned

        mock_supabase.table = create_mock_table_fn(recon_data, billed_data, leases_data)

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        # Should use "Unknown" as default tenant name
        assert result.capveri_calculated == Decimal("5000")
        assert result.actual_billed == Decimal("4000")

    def test_include_drafts_returns_draft_snapshots(self, mock_supabase):
        """Should return draft snapshot data when include_drafts=True."""
        property_id = uuid4()
        org_id = uuid4()

        recon_data = [
            make_reconciliation_snapshot("Acme Corp", 6000, "2024-01-01", "2024-12-31"),
        ]
        billed_data = []
        leases_data = [
            make_lease("lease_acme_corp", "Acme Corp"),
        ]

        # For include_drafts=True, the query chain uses .in_() instead of .eq()
        mock_recon_result = MagicMock()
        mock_recon_result.data = recon_data
        mock_billed_result = MagicMock()
        mock_billed_result.data = billed_data
        mock_leases_result = MagicMock()
        mock_leases_result.data = leases_data
        mock_property_result = MagicMock()
        mock_property_result.data = [{"id": str(property_id)}]
        mock_batches_result = MagicMock()
        mock_batches_result.data = []

        def mock_table(table_name):
            mock_qb = MagicMock()
            if table_name == "properties":
                mock_qb.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = (
                    mock_property_result
                )
            elif table_name == "reconciliation_snapshots":
                # include_drafts uses .in_() for status instead of .eq()
                mock_qb.select.return_value.eq.return_value.eq.return_value.lte.return_value.gte.return_value.in_.return_value.execute.return_value = (
                    mock_recon_result
                )
            elif table_name == "import_batches":
                mock_qb.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = (
                    mock_batches_result
                )
            elif table_name == "actual_billed_amounts":
                mock_qb.select.return_value.eq.return_value.eq.return_value.lte.return_value.gte.return_value.execute.return_value = (
                    mock_billed_result
                )
            elif table_name == "leases":
                mock_qb.select.return_value.eq.return_value.eq.return_value.in_.return_value.execute.return_value = (
                    mock_leases_result
                )
            return mock_qb

        mock_supabase.table = mock_table

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
                include_drafts=True,
            )

        assert result.has_reconciliation_data is True
        assert result.capveri_calculated == Decimal("6000")

    def test_default_excludes_draft_snapshots(self, mock_supabase):
        """Default (include_drafts=False) should use finalized-only filter."""
        property_id = uuid4()
        org_id = uuid4()

        recon_data = []
        billed_data = []
        leases_data = []

        mock_supabase.table = create_mock_table_fn(recon_data, billed_data, leases_data)

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        # Verify .eq("status", "finalized") was used (original chain)
        assert result.has_reconciliation_data is False


class TestLeakageChunkedInFilter:
    """Regression tests for BUG-10: large lease-id lists must be chunked."""

    def test_leases_lookup_issues_multiple_chunked_in_calls(self, mock_supabase):
        """With >100 lease_ids the leases query must be split into <=100-sized chunks.

        Every chunk is queried and all results are combined, so the sum of all
        chunk sizes equals the total number of distinct lease_ids.
        """
        property_id = uuid4()
        org_id = uuid4()

        # Build 150 tenants — more than the 100-id default chunk size.
        n = 150
        lease_ids = [str(uuid4()) for _ in range(n)]
        snapshots = [
            {
                "lease_id": lid,
                "total_recovery": "10.00",
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
            }
            for lid in lease_ids
        ]
        leases = [
            {"id": lid, "tenant_name": f"Tenant {i}"} for i, lid in enumerate(lease_ids)
        ]

        # Track which id-lists are passed to .in_("id", ...)
        recorded_in_chunks: list[list[str]] = []

        def mock_table(table_name: str):
            from unittest.mock import MagicMock

            mock_qb = MagicMock()
            if table_name == "properties":
                mock_qb.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    data=[{"id": str(property_id)}]
                )
            elif table_name == "reconciliation_snapshots":
                mock_qb.select.return_value.eq.return_value.eq.return_value.lte.return_value.gte.return_value.eq.return_value.execute.return_value = MagicMock(
                    data=snapshots
                )
            elif table_name == "import_batches":
                mock_qb.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    data=[]
                )
            elif table_name == "actual_billed_amounts":
                mock_qb.select.return_value.eq.return_value.eq.return_value.lte.return_value.gte.return_value.execute.return_value = MagicMock(
                    data=[]
                )
            elif table_name == "leases":
                # Build a recording chain: each .in_("id", chunk) call records the chunk.
                leases_by_id = {lrow["id"]: lrow for lrow in leases}

                def make_in_chain(prev):
                    def in_(field, values):
                        if field == "id":
                            recorded_in_chunks.append(list(values))
                        result_mock = MagicMock()
                        result_mock.execute.return_value = MagicMock(
                            data=[leases_by_id[v] for v in values if v in leases_by_id]
                        )

                        # Support .range() for paginated fetch
                        def range_(start, end):
                            subset = [
                                leases_by_id[v] for v in values if v in leases_by_id
                            ]
                            return MagicMock(
                                execute=lambda: MagicMock(data=subset[start : end + 1])
                            )

                        result_mock.range.side_effect = range_
                        return result_mock

                    prev.in_.side_effect = in_
                    return prev

                # leases is scoped by property_id only (single .eq), then .in_("id").
                eq1 = MagicMock()
                make_in_chain(eq1)
                mock_qb.select.return_value.eq.return_value = eq1
                eq1.eq = MagicMock(return_value=eq1)

            return mock_qb

        mock_supabase.table = mock_table

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        # Must have issued more than one .in_() call (chunked, not a single huge filter).
        assert len(recorded_in_chunks) > 1, (
            "Expected multiple chunked .in_() calls for >100 lease_ids; "
            f"got {len(recorded_in_chunks)}"
        )
        # No single chunk must exceed 100 ids.
        assert all(
            len(chunk) <= 100 for chunk in recorded_in_chunks
        ), f"A chunk exceeded 100 ids: {[len(c) for c in recorded_in_chunks]}"
        # All lease_ids must have been covered (sum of chunk sizes == total).
        total_queried = sum(len(c) for c in recorded_in_chunks)
        assert (
            total_queried == n
        ), f"Expected {n} total ids queried, got {total_queried}"
        # Service still returns correct result (has_reconciliation_data).
        assert result.has_reconciliation_data is True


class TestLeakageResultModel:
    """Tests for LeakageResult Pydantic model."""

    def test_creates_valid_result(self):
        """Should create valid leakage result."""
        property_id = uuid4()
        result = LeakageResult(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            capveri_calculated=Decimal("10000"),
            actual_billed=Decimal("8000"),
            leakage=Decimal("2000"),
            leakage_pct=20.0,
            has_reconciliation_data=True,
            has_gl_data=True,
            has_billing_data=True,
        )

        assert result.property_id == property_id
        assert result.leakage == Decimal("2000")
        assert result.breakdown == []

    def test_includes_breakdown(self):
        """Should include per-tenant breakdown."""
        breakdown = [
            LeakageBreakdown(
                tenant_name="Acme Corp",
                calculated_amount=Decimal("6000"),
                billed_amount=Decimal("5000"),
                difference=Decimal("1000"),
                difference_pct=16.67,
            )
        ]
        result = LeakageResult(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            capveri_calculated=Decimal("6000"),
            actual_billed=Decimal("5000"),
            leakage=Decimal("1000"),
            leakage_pct=16.67,
            has_reconciliation_data=True,
            has_gl_data=True,
            has_billing_data=True,
            breakdown=breakdown,
        )

        assert len(result.breakdown) == 1
        assert result.breakdown[0].tenant_name == "Acme Corp"


class TestLeakageBreakdownModel:
    """Tests for LeakageBreakdown Pydantic model."""

    def test_creates_valid_breakdown(self):
        """Should create valid breakdown entry."""
        breakdown = LeakageBreakdown(
            tenant_name="Acme Corp",
            calculated_amount=Decimal("6000"),
            billed_amount=Decimal("5000"),
            difference=Decimal("1000"),
            difference_pct=16.67,
        )

        assert breakdown.tenant_name == "Acme Corp"
        assert breakdown.calculated_amount == Decimal("6000")
        assert breakdown.billed_amount == Decimal("5000")
        assert breakdown.difference == Decimal("1000")
        assert breakdown.difference_pct == 16.67


class TestLeakageLeasesSchemaScoping:
    """Regression for BUG-11: leases has no organization_id column.

    Uses the filter-applying MockQueryBuilder with schema-accurate lease rows
    (NO organization_id key). The previous code filtered the leases query by
    ``organization_id``; against a row that lacks that column the filter drops
    every lease, so tenant names fail to resolve. These tests therefore fail on
    the buggy query and pass once scoping relies on property_id alone.
    """

    def test_tenant_names_resolve_without_organization_id_column(self, mock_supabase):
        org_id = uuid4()
        property_id = uuid4()
        lease_id = str(uuid4())
        table_data = {
            "properties": [{"id": str(property_id), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    "organization_id": str(org_id),
                    "property_id": str(property_id),
                    "lease_id": lease_id,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "import_batches": [],
            "actual_billed_amounts": [
                {
                    "organization_id": str(org_id),
                    "property_id": str(property_id),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "800.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
            # Schema-accurate: leases rows have property_id but NO
            # organization_id column.
            "leases": [
                {
                    "id": lease_id,
                    "property_id": str(property_id),
                    "tenant_name": "Acme Corp",
                }
            ],
        }

        def mock_table(table_name):
            return MockQueryBuilder(data=table_data.get(table_name, []))

        mock_supabase.table = mock_table

        with patch(
            "app.services.calculation.leakage.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = calculate_leakage(
                organization_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
            )

        # Calculated and billed land on the SAME real tenant -> one net entry.
        # Under the buggy org filter the lease drops out, so the calculated
        # amount is attributed to "Unknown" and a second phantom row appears.
        assert result.capveri_calculated == Decimal("1000.00")
        assert result.actual_billed == Decimal("800.00")
        assert len(result.breakdown) == 1
        entry = result.breakdown[0]
        assert entry.tenant_name == "Acme Corp"
        assert entry.calculated_amount == Decimal("1000.00")
        assert entry.billed_amount == Decimal("800.00")
        assert entry.difference == Decimal("200.00")
