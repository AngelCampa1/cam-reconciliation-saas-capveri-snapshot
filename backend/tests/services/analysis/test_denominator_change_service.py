"""Tests for denominator change detection service."""

from datetime import date, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest

from app.models.denominator_change import (
    DenominatorChangeReport,
    DenominatorChangeType,
)
from app.services.analysis.denominator_change import (
    DenominatorChangeService,
    NoComparableSnapshotsError,
)

PROP_ID = UUID("00000000-0000-0000-0000-000000000001")
PROP_NAME = "Oakwood Plaza"
ORG_A_ID = UUID("10000000-0000-0000-0000-000000000001")
ORG_B_ID = UUID("20000000-0000-0000-0000-000000000001")


def _make_snapshot(
    lease_id: UUID,
    tenant_name: str,
    pro_rata_share: str,
    rsf: str,
    excluded_pools: list[str] | None = None,
    boma_standard: str | None = None,
    total_recovery: str = "50000.00",
    organization_id: UUID | None = None,
) -> dict:
    """Build a fake finalized snapshot row as returned from Supabase."""
    return {
        "id": str(uuid4()),
        "property_id": str(PROP_ID),
        "organization_id": str(organization_id) if organization_id else None,
        "lease_id": str(lease_id),
        "status": "finalized",
        "period_start_date": "2024-01-01",
        "period_end_date": "2024-12-31",
        "total_operating_expenses": "500000.00",
        "grossed_up_expenses": "500000.00",
        "base_year_amount": "0",
        "tenant_share_before_cap": total_recovery,
        "tenant_share_after_cap": total_recovery,
        "admin_fee": "0",
        "total_recovery": total_recovery,
        "calculation_trace": [],
        "lease_terms_snapshot": {
            "tenant_name": tenant_name,
            "pro_rata_share": pro_rata_share,
            "rentable_square_feet": rsf,
            "excluded_pools": excluded_pools or [],
            "rsf_measurement_standard": boma_standard,
        },
        "finalized_at": "2024-12-31T00:00:00",
        "created_at": "2024-01-01T00:00:00",
        "updated_at": "2024-12-31T00:00:00",
    }


def _make_property(rsf: str = "100000") -> dict:
    return {
        "id": str(PROP_ID),
        "organization_id": str(ORG_A_ID),
        "name": PROP_NAME,
        "total_rentable_sqft": rsf,
    }


class _FilteringQuery:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._single = False
        self._start: int | None = None
        self._end: int | None = None

    def select(self, *_args):
        return self

    def eq(self, field, value):
        self._rows = [row for row in self._rows if row.get(field) == value]
        return self

    def gte(self, field, value):
        self._rows = [row for row in self._rows if row.get(field) >= value]
        return self

    def lte(self, field, value):
        self._rows = [row for row in self._rows if row.get(field) <= value]
        return self

    def lt(self, field, value):
        self._rows = [row for row in self._rows if row.get(field) < value]
        return self

    def range(self, start, end):
        self._start = start
        self._end = end
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        rows = self._rows
        if self._start is not None and self._end is not None:
            rows = rows[self._start : self._end + 1]
        data = rows[0] if self._single and rows else rows
        return MagicMock(data=data)


class _FilteringSupabase:
    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables

    def table(self, table_name: str):
        return _FilteringQuery(list(self._tables.get(table_name, [])))


def _mock_supabase(
    prior_snapshots: list[dict],
    current_snapshots: list[dict],
    prior_property: dict | None = None,
    current_property: dict | None = None,
):
    """Create a mock supabase client that returns different data per query."""
    mock_client = MagicMock()

    # Track call order to distinguish prior vs current queries
    snapshot_call_count = {"count": 0}
    property_call_count = {"count": 0}

    def make_snapshot_chain(snapshots):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.gte.return_value = chain
        chain.lte.return_value = chain
        chain.lt.return_value = chain
        chain.execute.return_value = MagicMock(data=snapshots)
        return chain

    def make_property_chain(prop):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.single.return_value = chain
        chain.execute.return_value = MagicMock(data=prop)
        return chain

    def table_side_effect(table_name):
        if table_name == "reconciliation_snapshots":
            idx = snapshot_call_count["count"]
            snapshot_call_count["count"] += 1
            if idx == 0:
                return make_snapshot_chain(current_snapshots)
            else:
                return make_snapshot_chain(prior_snapshots)
        elif table_name == "properties":
            idx = property_call_count["count"]
            property_call_count["count"] += 1
            prop = current_property or prior_property or _make_property()
            return make_property_chain(prop)
        return MagicMock()

    mock_client.table.side_effect = table_side_effect
    return mock_client


@pytest.fixture
def service():
    return DenominatorChangeService()


class TestGenerateReport:
    @pytest.mark.asyncio
    async def test_requires_explicit_database_client(self, service):
        with pytest.raises(
            ValueError,
            match="requires an organization-scoped database client",
        ):
            await service.generate_report(
                property_id=PROP_ID,
                current_period_start=date(2024, 1, 1),
                current_period_end=date(2024, 12, 31),
                prior_period_start=date(2023, 1, 1),
                prior_period_end=date(2023, 12, 31),
            )

    @pytest.mark.asyncio
    async def test_explicit_organization_scope_excludes_cross_org_snapshots(
        self, service
    ):
        org_a_lease = uuid4()
        org_b_lease = uuid4()

        prior_org_a = _make_snapshot(
            org_a_lease,
            "Org A Tenant",
            "0.10",
            "10000",
            organization_id=ORG_A_ID,
        )
        prior_org_a["period_start_date"] = "2023-01-01"
        prior_org_a["period_end_date"] = "2023-12-31"

        current_org_a = _make_snapshot(
            org_a_lease,
            "Org A Tenant",
            "0.10",
            "10000",
            organization_id=ORG_A_ID,
        )
        current_org_b = _make_snapshot(
            org_b_lease,
            "Org B Tenant",
            "0.90",
            "90000",
            organization_id=ORG_B_ID,
        )

        mock_client = _FilteringSupabase(
            {
                "reconciliation_snapshots": [
                    prior_org_a,
                    current_org_a,
                    current_org_b,
                ],
                "properties": [_make_property("100000")],
            }
        )

        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            db=mock_client,
            organization_id=ORG_A_ID,
        )

        report_text = " ".join(
            [change.description for change in report.changes]
            + [impact.tenant_name for impact in report.tenant_impacts]
        )
        assert "Org B Tenant" not in report_text
        assert report.property_name == PROP_NAME

    @pytest.mark.asyncio
    async def test_explicit_organization_scope_rejects_cross_org_only_data(
        self, service
    ):
        prior_org_b = _make_snapshot(
            uuid4(),
            "Org B Tenant",
            "0.90",
            "90000",
            organization_id=ORG_B_ID,
        )
        prior_org_b["period_start_date"] = "2023-01-01"
        prior_org_b["period_end_date"] = "2023-12-31"
        current_org_b = _make_snapshot(
            uuid4(),
            "Org B Tenant",
            "0.90",
            "90000",
            organization_id=ORG_B_ID,
        )

        mock_client = _FilteringSupabase(
            {
                "reconciliation_snapshots": [prior_org_b, current_org_b],
                "properties": [
                    {
                        **_make_property("100000"),
                        "organization_id": str(ORG_B_ID),
                        "name": "Org B Property",
                    }
                ],
            }
        )

        with pytest.raises(ValueError, match="No finalized snapshots found"):
            await service.generate_report(
                property_id=PROP_ID,
                current_period_start=date(2024, 1, 1),
                current_period_end=date(2024, 12, 31),
                prior_period_start=date(2023, 1, 1),
                prior_period_end=date(2023, 12, 31),
                db=mock_client,
                organization_id=ORG_A_ID,
            )

    @pytest.mark.asyncio
    async def test_no_prior_period_raises_no_comparable_snapshots_error(self, service):
        mock_client = _mock_supabase(
            prior_snapshots=[],
            current_snapshots=[
                _make_snapshot(uuid4(), "Tenant A", "0.10", "10000"),
            ],
        )
        with pytest.raises(NoComparableSnapshotsError) as exc_info:
            await service.generate_report(
                property_id=PROP_ID,
                current_period_start=date(2024, 1, 1),
                current_period_end=date(2024, 12, 31),
                prior_period_start=date(2023, 1, 1),
                prior_period_end=date(2023, 12, 31),
                db=mock_client,
            )
        assert exc_info.value.period == "prior"
        assert "No finalized snapshots found" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_no_current_period_raises_no_comparable_snapshots_error(
        self, service
    ):
        mock_client = _mock_supabase(
            prior_snapshots=[_make_snapshot(uuid4(), "Tenant A", "0.10", "10000")],
            current_snapshots=[],
        )
        with pytest.raises(NoComparableSnapshotsError) as exc_info:
            await service.generate_report(
                property_id=PROP_ID,
                current_period_start=date(2024, 1, 1),
                current_period_end=date(2024, 12, 31),
                prior_period_start=date(2023, 1, 1),
                prior_period_end=date(2023, 12, 31),
                db=mock_client,
            )
        assert exc_info.value.period == "current"
        assert "No finalized snapshots found" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_identical_denominators_empty_changes(self, service):
        lease_a = uuid4()
        snapshots = [
            _make_snapshot(lease_a, "Tenant A", "0.10", "10000"),
        ]
        mock_client = _mock_supabase(
            prior_snapshots=snapshots,
            current_snapshots=snapshots,
            prior_property=_make_property("100000"),
            current_property=_make_property("100000"),
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            db=mock_client,
        )
        assert isinstance(report, DenominatorChangeReport)
        assert len(report.changes) == 0
        assert report.rsf_delta == Decimal("0")

    @pytest.mark.asyncio
    async def test_generate_report_includes_second_page_snapshots(self, service):
        target_lease = uuid4()
        prior_snapshots = []
        current_snapshots = []
        for index in range(1000):
            lease_id = uuid4()
            prior = _make_snapshot(
                lease_id,
                f"Tenant {index}",
                "0.001",
                "1000",
                organization_id=ORG_A_ID,
            )
            prior["period_start_date"] = "2023-01-01"
            prior["period_end_date"] = "2023-12-31"
            current = _make_snapshot(
                lease_id,
                f"Tenant {index}",
                "0.001",
                "1000",
                organization_id=ORG_A_ID,
            )
            prior_snapshots.append(prior)
            current_snapshots.append(current)

        prior_target = _make_snapshot(
            target_lease,
            "Second Page Tenant",
            "0.001",
            "1000",
            organization_id=ORG_A_ID,
        )
        prior_target["period_start_date"] = "2023-01-01"
        prior_target["period_end_date"] = "2023-12-31"
        current_target = _make_snapshot(
            target_lease,
            "Second Page Tenant",
            "0.002",
            "2000",
            organization_id=ORG_A_ID,
        )
        prior_snapshots.append(prior_target)
        current_snapshots.append(current_target)

        mock_client = _FilteringSupabase(
            {
                "reconciliation_snapshots": prior_snapshots + current_snapshots,
                "properties": [_make_property("100000")],
            }
        )

        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            db=mock_client,
            organization_id=ORG_A_ID,
        )

        assert any(
            "Second Page Tenant" in change.description for change in report.changes
        )
        assert any(
            impact.tenant_name == "Second Page Tenant"
            for impact in report.tenant_impacts
        )

    @pytest.mark.asyncio
    async def test_rsf_increased_detects_remeasurement(self, service):
        lease_a = uuid4()
        prior = [_make_snapshot(lease_a, "Tenant A", "0.10", "10000")]
        current = [_make_snapshot(lease_a, "Tenant A", "0.10", "10000")]
        mock_client = _mock_supabase(
            prior_snapshots=prior,
            current_snapshots=current,
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            prior_total_rsf=Decimal("100000"),
            current_total_rsf=Decimal("105000"),
            db=mock_client,
        )
        rsf_changes = [
            c
            for c in report.changes
            if c.change_type == DenominatorChangeType.RSF_REMEASUREMENT
        ]
        assert len(rsf_changes) == 1
        assert report.rsf_delta == Decimal("5000")
        assert report.rsf_delta_percent > Decimal("0")

    @pytest.mark.asyncio
    async def test_rsf_decreased_detects_remeasurement(self, service):
        lease_a = uuid4()
        prior = [_make_snapshot(lease_a, "Tenant A", "0.10", "10000")]
        current = [_make_snapshot(lease_a, "Tenant A", "0.10", "10000")]
        mock_client = _mock_supabase(
            prior_snapshots=prior,
            current_snapshots=current,
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            prior_total_rsf=Decimal("100000"),
            current_total_rsf=Decimal("95000"),
            db=mock_client,
        )
        assert report.rsf_delta == Decimal("-5000")
        assert report.rsf_delta_percent < Decimal("0")

    @pytest.mark.asyncio
    async def test_tenant_added_detects_dilution(self, service):
        lease_a = uuid4()
        lease_b = uuid4()
        prior = [_make_snapshot(lease_a, "Tenant A", "0.10", "10000")]
        current = [
            _make_snapshot(lease_a, "Tenant A", "0.10", "10000"),
            _make_snapshot(lease_b, "Tenant B", "0.05", "5000"),
        ]
        mock_client = _mock_supabase(
            prior_snapshots=prior,
            current_snapshots=current,
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            db=mock_client,
        )
        added_changes = [
            c
            for c in report.changes
            if c.change_type == DenominatorChangeType.TENANT_ADDED
        ]
        assert len(added_changes) == 1
        assert "Tenant B" in added_changes[0].description

    @pytest.mark.asyncio
    async def test_tenant_removed_detects_concentration(self, service):
        lease_a = uuid4()
        lease_b = uuid4()
        prior = [
            _make_snapshot(lease_a, "Tenant A", "0.10", "10000"),
            _make_snapshot(lease_b, "Tenant B", "0.05", "5000"),
        ]
        current = [_make_snapshot(lease_a, "Tenant A", "0.10", "10000")]
        mock_client = _mock_supabase(
            prior_snapshots=prior,
            current_snapshots=current,
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            db=mock_client,
        )
        removed_changes = [
            c
            for c in report.changes
            if c.change_type == DenominatorChangeType.TENANT_REMOVED
        ]
        assert len(removed_changes) == 1
        assert "Tenant B" in removed_changes[0].description

    @pytest.mark.asyncio
    async def test_exclusion_change_detected(self, service):
        lease_a = uuid4()
        prior = [
            _make_snapshot(lease_a, "Tenant A", "0.10", "10000", excluded_pools=[])
        ]
        current = [
            _make_snapshot(
                lease_a, "Tenant A", "0.10", "10000", excluded_pools=["utilities"]
            )
        ]
        mock_client = _mock_supabase(
            prior_snapshots=prior,
            current_snapshots=current,
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            db=mock_client,
        )
        exclusion_changes = [
            c
            for c in report.changes
            if c.change_type == DenominatorChangeType.EXCLUSION_CHANGE
        ]
        assert len(exclusion_changes) >= 1

    @pytest.mark.asyncio
    async def test_boma_standard_change_detected(self, service):
        lease_a = uuid4()
        prior = [
            _make_snapshot(
                lease_a, "Tenant A", "0.10", "10000", boma_standard="boma_2017"
            )
        ]
        current = [
            _make_snapshot(
                lease_a, "Tenant A", "0.10", "10000", boma_standard="boma_2024"
            )
        ]
        mock_client = _mock_supabase(
            prior_snapshots=prior,
            current_snapshots=current,
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            db=mock_client,
        )
        boma_changes = [
            c
            for c in report.changes
            if c.change_type == DenominatorChangeType.BOMA_STANDARD_CHANGE
        ]
        assert len(boma_changes) == 1

    @pytest.mark.asyncio
    async def test_multiple_simultaneous_changes(self, service):
        lease_a = uuid4()
        lease_b = uuid4()
        prior = [_make_snapshot(lease_a, "Tenant A", "0.10", "10000")]
        current = [
            _make_snapshot(lease_a, "Tenant A", "0.12", "12000"),
            _make_snapshot(lease_b, "Tenant B", "0.05", "5000"),
        ]
        mock_client = _mock_supabase(
            prior_snapshots=prior,
            current_snapshots=current,
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            prior_total_rsf=Decimal("100000"),
            current_total_rsf=Decimal("110000"),
            db=mock_client,
        )
        # Should detect RSF change + tenant added + share recalculation
        assert len(report.changes) >= 2
        change_types = {c.change_type for c in report.changes}
        assert DenominatorChangeType.TENANT_ADDED in change_types
        assert DenominatorChangeType.RSF_REMEASUREMENT in change_types

    @pytest.mark.asyncio
    async def test_share_delta_math_precision(self, service):
        lease_a = uuid4()
        prior = [
            _make_snapshot(
                lease_a, "Tenant A", "0.10", "10000", total_recovery="50000.00"
            )
        ]
        current = [
            _make_snapshot(
                lease_a, "Tenant A", "0.1667", "10000", total_recovery="83350.00"
            )
        ]
        mock_client = _mock_supabase(
            prior_snapshots=prior,
            current_snapshots=current,
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            db=mock_client,
        )
        # Find Tenant A impact
        impacts = [i for i in report.tenant_impacts if i.tenant_name == "Tenant A"]
        assert len(impacts) == 1
        impact = impacts[0]
        assert impact.prior_pro_rata_share == Decimal("0.10")
        assert impact.current_pro_rata_share == Decimal("0.1667")
        # Delta = 0.1667 - 0.10 = 0.0667 → 6.67 pct points
        assert impact.share_delta_pct_points == Decimal("6.67")
        assert impact.recovery_delta == Decimal("33350.00")

    @pytest.mark.asyncio
    async def test_summary_generation(self, service):
        lease_a = uuid4()
        prior = [_make_snapshot(lease_a, "Tenant A", "0.10", "10000")]
        current = [_make_snapshot(lease_a, "Tenant A", "0.10", "10000")]
        mock_client = _mock_supabase(
            prior_snapshots=prior,
            current_snapshots=current,
        )
        report = await service.generate_report(
            property_id=PROP_ID,
            current_period_start=date(2024, 1, 1),
            current_period_end=date(2024, 12, 31),
            prior_period_start=date(2023, 1, 1),
            prior_period_end=date(2023, 12, 31),
            prior_total_rsf=Decimal("100000"),
            current_total_rsf=Decimal("105000"),
            db=mock_client,
        )
        assert "100,000" in report.summary
        assert "105,000" in report.summary
        assert isinstance(report.generated_at, datetime)
