"""Tests for the comparison engine (B1.2).

``build_comparison_result`` is tested with NO mocks (pure math). ``compare_charges``
mocks Supabase only at the boundary, mirroring the leakage test conventions.
"""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.services.comparison.engine import (
    ExplicitCharge,
    _rekey_charged_to_leases,
    build_comparison_result,
    compare_charges,
    compare_explicit_charges,
)
from app.services.comparison.models import VarianceDirection
from tests.conftest import MockQueryBuilder

PROP_ID = uuid4()
P_START = date(2024, 1, 1)
P_END = date(2024, 12, 31)


def _build(correct, charged, tolerance=Decimal("0.01"), names=None):
    return build_comparison_result(
        correct_by_lease=correct,
        charged_by_lease=charged,
        property_id=PROP_ID,
        period_start=P_START,
        period_end=P_END,
        tolerance=tolerance,
        tenant_names=names,
    )


class TestBuildComparisonResult:
    """Pure-math tests for build_comparison_result (no mocks)."""

    def test_overcharge(self):
        result = _build(
            {"l1": Decimal("1000")},
            {"l1": Decimal("1200")},
        )
        tv = result.tenants[0]
        assert tv.variance == Decimal("200")
        assert tv.direction is VarianceDirection.OVERCHARGE
        assert tv.abs_variance == Decimal("200")
        assert tv.variance_pct == Decimal("20")
        assert result.total_overcharge == Decimal("200")
        assert result.total_undercharge == Decimal("0")
        assert result.total_net_variance == Decimal("200")
        assert result.overcharge_count == 1
        assert result.undercharge_count == 0
        assert result.match_count == 0

    def test_undercharge(self):
        result = _build(
            {"l1": Decimal("1000")},
            {"l1": Decimal("800")},
        )
        tv = result.tenants[0]
        assert tv.variance == Decimal("-200")
        assert tv.direction is VarianceDirection.UNDERCHARGE
        assert tv.abs_variance == Decimal("200")
        assert tv.variance_pct == Decimal("-20")
        assert result.total_undercharge == Decimal("200")
        assert result.total_overcharge == Decimal("0")
        assert result.total_net_variance == Decimal("-200")
        assert result.undercharge_count == 1

    def test_exact_match(self):
        result = _build(
            {"l1": Decimal("1000")},
            {"l1": Decimal("1000")},
        )
        tv = result.tenants[0]
        assert tv.variance == Decimal("0")
        assert tv.direction is VarianceDirection.MATCH
        assert result.match_count == 1
        assert result.total_overcharge == Decimal("0")
        assert result.total_undercharge == Decimal("0")

    def test_within_tolerance_is_match(self):
        # 0.01 difference at default tolerance => MATCH (inclusive).
        result = _build(
            {"l1": Decimal("1000.00")},
            {"l1": Decimal("1000.01")},
        )
        assert result.tenants[0].direction is VarianceDirection.MATCH
        assert result.match_count == 1
        # The matched variance does NOT contribute to over/undercharge totals.
        assert result.total_overcharge == Decimal("0")

    def test_zero_correct_yields_none_pct(self):
        # Charged amount with no correct counterpart => overcharge, pct undefined.
        result = _build(
            {},
            {"l1": Decimal("500")},
        )
        tv = result.tenants[0]
        assert tv.capveri_correct == Decimal("0")
        assert tv.actual_charged == Decimal("500")
        assert tv.variance == Decimal("500")
        assert tv.variance_pct is None
        assert tv.direction is VarianceDirection.OVERCHARGE

    def test_missing_charged_side_treated_as_zero(self):
        # Correct amount with no charged counterpart => full undercharge.
        result = _build(
            {"l1": Decimal("1000")},
            {},
        )
        tv = result.tenants[0]
        assert tv.actual_charged == Decimal("0")
        assert tv.variance == Decimal("-1000")
        assert tv.direction is VarianceDirection.UNDERCHARGE
        assert tv.variance_pct == Decimal("-100")
        assert result.total_undercharge == Decimal("1000")

    def test_multi_tenant_mixed_directions_sorted_by_abs(self):
        correct = {
            "over": Decimal("1000"),
            "under": Decimal("1000"),
            "match": Decimal("1000"),
        }
        result = _build(
            correct,
            {
                "over": Decimal("1500"),  # +500 overcharge
                "under": Decimal("100"),  # -900 undercharge
                "match": Decimal("1000"),  # match
            },
        )
        # Sorted by descending abs_variance: under (900), over (500), match (0).
        assert [t.lease_id for t in result.tenants] == ["under", "over", "match"]
        assert result.overcharge_count == 1
        assert result.undercharge_count == 1
        assert result.match_count == 1
        assert result.total_overcharge == Decimal("500")
        assert result.total_undercharge == Decimal("900")
        assert result.total_capveri_correct == Decimal("3000")
        assert result.total_actual_charged == Decimal("2600")
        assert result.total_net_variance == Decimal("-400")
        # No-drop invariant: total correct equals the sum of every input lease.
        assert result.total_capveri_correct == sum(correct.values())

    def test_tenant_names_applied(self):
        result = _build(
            {"l1": Decimal("1000")},
            {"l1": Decimal("1200")},
            names={"l1": "Acme Corp"},
        )
        assert result.tenants[0].tenant_name == "Acme Corp"

    def test_custom_tolerance(self):
        # A $5 variance is a MATCH under a $10 tolerance.
        result = _build(
            {"l1": Decimal("1000")},
            {"l1": Decimal("1005")},
            tolerance=Decimal("10"),
        )
        assert result.tenants[0].direction is VarianceDirection.MATCH
        assert result.tolerance == Decimal("10")

    def test_variance_pct_is_quantized_two_dp(self):
        # 100 / 3000 * 100 = 3.333... must round HALF_UP to 3.33 (two places).
        result = _build(
            {"l1": Decimal("3000")},
            {"l1": Decimal("3100")},
        )
        tv = result.tenants[0]
        assert tv.variance_pct == Decimal("3.33")
        assert tv.variance_pct.as_tuple().exponent == -2

    def test_variance_pct_rounds_half_up(self):
        # 12.5 / 100 * 100 = 12.5 -> exactly .x25 case; 1.25 / 10 = 12.5%.
        # Use a value whose 3rd decimal is 5 to prove ROUND_HALF_UP.
        # 5 / 800 * 100 = 0.625 -> 0.63 (HALF_UP), not 0.62.
        result = _build(
            {"l1": Decimal("800")},
            {"l1": Decimal("805")},
        )
        assert result.tenants[0].variance_pct == Decimal("0.63")

    def test_variance_pct_rounds_half_up_away_from_zero_when_negative(self):
        # Negative undercharge: -5 / 800 * 100 = -0.625 -> -0.63 (HALF_UP rounds
        # away from zero), not -0.62. Locks the sign behavior of the quantization.
        result = _build(
            {"l1": Decimal("800")},
            {"l1": Decimal("795")},
        )
        assert result.tenants[0].variance_pct == Decimal("-0.63")

    def test_variance_pct_negative_correct_baseline_keeps_variance_sign(self):
        # A net-credit correct baseline is possible when reversals/credits exceed
        # charges. The percentage denominator uses abs(correct), so the pct sign
        # still follows the signed variance direction shown to users.
        result = _build(
            {
                "credit_over": Decimal("-100.00"),
                "credit_under": Decimal("-100.00"),
            },
            {
                "credit_over": Decimal("0.00"),
                "credit_under": Decimal("-150.00"),
            },
        )

        by_lease = {tenant.lease_id: tenant for tenant in result.tenants}
        assert by_lease["credit_over"].variance == Decimal("100.00")
        assert by_lease["credit_over"].direction is VarianceDirection.OVERCHARGE
        assert by_lease["credit_over"].variance_pct == Decimal("100.00")
        assert by_lease["credit_under"].variance == Decimal("-50.00")
        assert by_lease["credit_under"].direction is VarianceDirection.UNDERCHARGE
        assert by_lease["credit_under"].variance_pct == Decimal("-50.00")

    def test_negative_tolerance_raises(self):
        # A negative tolerance would make classify_variance reject even an exact
        # zero variance as non-MATCH, silently inverting MATCH semantics. The
        # public service surface must reject it rather than produce wrong output.
        with pytest.raises(ValueError, match="tolerance must be non-negative"):
            _build(
                {"l1": Decimal("1000")},
                {"l1": Decimal("1000")},
                tolerance=Decimal("-0.01"),
            )


class TestRekeyChargedToLeases:
    """Pure-helper tests for the shared name->lease re-key/combine logic (no mocks)."""

    def test_combines_sibling_without_correct_amount(self):
        # Two leases share "Acme" but only l1 has a correct amount (l2 has a name
        # but no snapshot row). The combine bucket must sum present-correct + 0 for
        # the missing sibling: no KeyError, no drop, no phantom. Charged 1000 vs
        # combined correct 1000 -> the bucket pairs evenly.
        correct, charged, names = _rekey_charged_to_leases(
            correct_by_lease={"l1": Decimal("1000")},  # l2 absent from correct map
            tenant_names={"l1": "Acme", "l2": "Acme"},
            charged_by_name={"Acme": Decimal("1000")},
            unidentified_rows=[],
        )
        # Both siblings collapse into one bucket; the missing sibling contributes 0.
        assert correct == {"name::Acme": Decimal("1000")}
        assert charged == {"name::Acme": Decimal("1000")}
        # Per-lease keys are removed (represented once inside the bucket).
        assert "l1" not in correct
        assert "l2" not in correct
        assert names["name::Acme"] == "Acme"

    def test_three_way_combine_sums_all_siblings(self):
        # Three leases share "Acme" (1000 + 1000 + 1000). A single 3000 charge must
        # collapse to ONE bucket whose correct is the full 3000 sum (no-drop).
        correct, charged, _ = _rekey_charged_to_leases(
            correct_by_lease={
                "l1": Decimal("1000"),
                "l2": Decimal("1000"),
                "l3": Decimal("1000"),
            },
            tenant_names={"l1": "Acme", "l2": "Acme", "l3": "Acme"},
            charged_by_name={"Acme": Decimal("3000")},
            unidentified_rows=[],
        )
        assert correct == {"name::Acme": Decimal("3000")}
        assert charged == {"name::Acme": Decimal("3000")}


def _table_fn(table_data):
    def mock_table(table_name):
        return MockQueryBuilder(data=table_data.get(table_name, []))

    return mock_table


class TestCompareCharges:
    """Boundary tests for compare_charges (Supabase mocked at the edge)."""

    @pytest.fixture
    def mock_supabase(self):
        return MagicMock()

    async def test_pairs_snapshots_and_charges_by_lease(self, mock_supabase):
        org_id = uuid4()
        lease_a = str(uuid4())
        lease_b = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "6000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
                {
                    **scope,
                    "lease_id": lease_b,
                    "total_recovery": "4000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
            ],
            "leases": [
                {**scope, "id": lease_a, "tenant_name": "Acme Corp"},
                {**scope, "id": lease_b, "tenant_name": "XYZ Inc"},
            ],
            "actual_billed_amounts": [
                {
                    **scope,
                    "tenant_name": "Acme Corp",
                    "billed_amount": "6500.00",  # +500 overcharge
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                },
                {
                    **scope,
                    "tenant_name": "XYZ Inc",
                    "billed_amount": "3000.00",  # -1000 undercharge
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                },
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        assert result.total_capveri_correct == Decimal("10000.00")
        assert result.total_actual_charged == Decimal("9500.00")
        assert result.total_overcharge == Decimal("500.00")
        assert result.total_undercharge == Decimal("1000.00")
        assert result.overcharge_count == 1
        assert result.undercharge_count == 1
        by_lease = {t.lease_id: t for t in result.tenants}
        assert by_lease[lease_a].tenant_name == "Acme Corp"
        assert by_lease[lease_a].direction is VarianceDirection.OVERCHARGE
        assert by_lease[lease_b].direction is VarianceDirection.UNDERCHARGE

    async def test_charged_without_snapshot_is_overcharge(self, mock_supabase):
        org_id = uuid4()
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [],
            "leases": [],
            "actual_billed_amounts": [
                {
                    **scope,
                    "tenant_name": "Ghost Tenant",
                    "billed_amount": "750.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        assert result.total_actual_charged == Decimal("750.00")
        assert result.total_capveri_correct == Decimal("0")
        assert result.overcharge_count == 1
        tv = result.tenants[0]
        assert tv.tenant_name == "Ghost Tenant"
        assert tv.variance_pct is None
        assert tv.direction is VarianceDirection.OVERCHARGE

    async def test_snapshot_without_charge_is_undercharge(self, mock_supabase):
        org_id = uuid4()
        lease_a = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "5000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        assert result.undercharge_count == 1
        assert result.total_undercharge == Decimal("5000.00")
        assert result.tenants[0].direction is VarianceDirection.UNDERCHARGE

    async def test_cross_org_property_returns_empty(self, mock_supabase):
        org_id = uuid4()
        other_org_id = uuid4()
        table_data = {
            # Property belongs to a different org => filtered out, no data.
            "properties": [{"id": str(PROP_ID), "organization_id": str(other_org_id)}],
            "reconciliation_snapshots": [],
            "leases": [],
            "actual_billed_amounts": [],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        assert result.tenants == []
        assert result.total_capveri_correct == Decimal("0")
        assert result.total_actual_charged == Decimal("0")

    async def test_include_drafts_passes_through(self, mock_supabase):
        org_id = uuid4()
        lease_a = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "draft",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Draft Tenant"}],
            "actual_billed_amounts": [],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
                include_drafts=True,
            )

        assert result.total_capveri_correct == Decimal("1000.00")
        assert result.undercharge_count == 1

    async def test_custom_tolerance_classifies_match(self, mock_supabase):
        org_id = uuid4()
        lease_a = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [
                {
                    **scope,
                    "tenant_name": "Acme Corp",
                    "billed_amount": "1005.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
                tolerance=Decimal("10"),
            )

        assert result.match_count == 1
        assert result.tenants[0].direction is VarianceDirection.MATCH

    async def test_duplicate_tenant_name_produces_no_phantom_findings(
        self, mock_supabase
    ):
        # Two leases share the tenant_name "Acme Corp" (one tenant, two suites),
        # each CapVeri-correct $1000 (true total correct $2000). A single charged
        # row "Acme Corp" = $2000 means the TRUE variance is $0 -> MATCH. The engine
        # must COMBINE the siblings' correct amounts into ONE bucket and compare the
        # charge against that combined total, NOT fabricate a $2000 overcharge or
        # drop the siblings' correct amounts.
        org_id = uuid4()
        lease_a = str(uuid4())
        lease_b = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
                {
                    **scope,
                    "lease_id": lease_b,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
            ],
            "leases": [
                {**scope, "id": lease_a, "tenant_name": "Acme Corp"},
                {**scope, "id": lease_b, "tenant_name": "Acme Corp"},
            ],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "2000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        # The shared-name leases must NOT appear as separate findings.
        lease_keys = {t.lease_id for t in result.tenants}
        assert lease_a not in lease_keys
        assert lease_b not in lease_keys
        # Exactly one combined finding, classified as MATCH (variance 0).
        assert len(result.tenants) == 1
        combined = result.tenants[0]
        assert combined.lease_id == "name::Acme Corp"
        assert combined.tenant_name == "Acme Corp"
        assert combined.capveri_correct == Decimal("2000.00")
        assert combined.actual_charged == Decimal("2000.00")
        assert combined.variance == Decimal("0.00")
        assert combined.direction is VarianceDirection.MATCH
        assert result.overcharge_count == 0
        assert result.undercharge_count == 0
        assert result.match_count == 1
        # No-drop invariant: every lease's correct amount survives inside the bucket.
        assert result.total_capveri_correct == Decimal("2000.00")

    async def test_duplicate_tenant_name_with_excess_charge_is_one_overcharge(
        self, mock_supabase
    ):
        # Two leases share "Acme Corp", each correct $1000 (combined $2000). Charged
        # $2500 -> ONE combined finding with a $500 overcharge, not two findings and
        # not a phantom inflated by dropping correct amounts.
        org_id = uuid4()
        lease_a = str(uuid4())
        lease_b = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
                {
                    **scope,
                    "lease_id": lease_b,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
            ],
            "leases": [
                {**scope, "id": lease_a, "tenant_name": "Acme Corp"},
                {**scope, "id": lease_b, "tenant_name": "Acme Corp"},
            ],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "2500.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        assert len(result.tenants) == 1
        combined = result.tenants[0]
        assert combined.lease_id == "name::Acme Corp"
        assert combined.capveri_correct == Decimal("2000.00")
        assert combined.actual_charged == Decimal("2500.00")
        assert combined.variance == Decimal("500.00")
        assert combined.direction is VarianceDirection.OVERCHARGE
        assert result.overcharge_count == 1
        assert result.total_overcharge == Decimal("500.00")
        assert result.undercharge_count == 0
        # No-drop invariant: combined correct still equals the sum of both leases.
        assert result.total_capveri_correct == Decimal("2000.00")

    async def test_three_way_duplicate_name_combines_into_one_match(
        self, mock_supabase
    ):
        # THREE leases share "Acme Corp", each correct $1000 (combined $3000). A
        # single charged row "Acme Corp" = $3000 must collapse to ONE MATCH finding
        # whose correct is the full $3000 sum across all three siblings (no-drop),
        # exercising the loaders' 3-snapshot roll-up end-to-end.
        org_id = uuid4()
        lease_a = str(uuid4())
        lease_b = str(uuid4())
        lease_c = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        snap = {
            "total_recovery": "1000.00",
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "status": "finalized",
        }
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {**scope, "lease_id": lease_a, **snap},
                {**scope, "lease_id": lease_b, **snap},
                {**scope, "lease_id": lease_c, **snap},
            ],
            "leases": [
                {**scope, "id": lease_a, "tenant_name": "Acme Corp"},
                {**scope, "id": lease_b, "tenant_name": "Acme Corp"},
                {**scope, "id": lease_c, "tenant_name": "Acme Corp"},
            ],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "3000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        # None of the three shared-name leases appear as separate findings.
        lease_keys = {t.lease_id for t in result.tenants}
        assert lease_a not in lease_keys
        assert lease_b not in lease_keys
        assert lease_c not in lease_keys
        assert len(result.tenants) == 1
        combined = result.tenants[0]
        assert combined.lease_id == "name::Acme Corp"
        assert combined.capveri_correct == Decimal("3000.00")
        assert combined.actual_charged == Decimal("3000.00")
        assert combined.direction is VarianceDirection.MATCH
        assert result.match_count == 1
        # No-drop invariant: all three leases' correct amounts survive in the bucket.
        assert result.total_capveri_correct == Decimal("3000.00")

    async def test_duplicate_name_without_matching_charge_pairs_normally(
        self, mock_supabase
    ):
        # If two leases share a name but there is NO charged row for that name,
        # the leases are not ambiguous to attribute (no charge to split). They are
        # full undercharges (charged = 0), which is correct, not phantom.
        org_id = uuid4()
        lease_a = str(uuid4())
        lease_b = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "5000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
                {
                    **scope,
                    "lease_id": lease_b,
                    "total_recovery": "3000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
            ],
            "leases": [
                {**scope, "id": lease_a, "tenant_name": "Acme Corp"},
                {**scope, "id": lease_b, "tenant_name": "Acme Corp"},
            ],
            "actual_billed_amounts": [],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        assert result.undercharge_count == 2
        assert result.total_undercharge == Decimal("8000.00")
        assert {t.lease_id for t in result.tenants} == {lease_a, lease_b}

    async def test_blank_name_charges_stay_separate_findings(self, mock_supabase):
        # Two charged rows with blank/missing tenant_name and a real lease named
        # "Acme Corp". The blank rows must NOT merge with each other and must NOT
        # attach to the real lease; each is its own id-keyed finding.
        org_id = uuid4()
        lease_a = str(uuid4())
        blank_id_1 = str(uuid4())
        blank_id_2 = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                },
                {
                    **scope,
                    "id": blank_id_1,
                    "tenant_name": None,
                    "billed_amount": "200.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                },
                {
                    **scope,
                    "id": blank_id_2,
                    "tenant_name": "   ",  # whitespace-only is also blank
                    "billed_amount": "300.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                },
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        by_lease = {t.lease_id: t for t in result.tenants}
        # Real lease matched cleanly (1000 vs 1000).
        assert by_lease[lease_a].direction is VarianceDirection.MATCH
        assert by_lease[lease_a].actual_charged == Decimal("1000.00")
        # Each blank-name row is its own overcharge finding, not merged.
        assert by_lease[f"id::{blank_id_1}"].actual_charged == Decimal("200.00")
        assert by_lease[f"id::{blank_id_2}"].actual_charged == Decimal("300.00")
        assert by_lease[f"id::{blank_id_1}"].capveri_correct == Decimal("0")
        assert by_lease[f"id::{blank_id_2}"].capveri_correct == Decimal("0")
        assert by_lease[f"id::{blank_id_1}"].direction is VarianceDirection.OVERCHARGE
        assert by_lease[f"id::{blank_id_2}"].direction is VarianceDirection.OVERCHARGE
        # Two distinct unidentified findings + the matched lease.
        assert result.overcharge_count == 2
        assert result.total_actual_charged == Decimal("1500.00")

    async def test_blank_name_row_without_id_is_dropped(self, mock_supabase):
        # A charged row with neither a tenant_name NOR a stable id has no identity
        # to anchor a distinct finding to. It must be dropped, never merged into a
        # real lease or another row.
        org_id = uuid4()
        lease_a = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": None,
                    "tenant_name": None,
                    "billed_amount": "999.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        # The orphan charge is dropped; only the (uncharged) real lease remains.
        assert {t.lease_id for t in result.tenants} == {lease_a}
        assert result.tenants[0].actual_charged == Decimal("0")
        assert result.total_actual_charged == Decimal("0")


class TestCompareExplicitCharges:
    """Boundary tests for compare_explicit_charges (B1.3, Supabase mocked)."""

    @pytest.fixture
    def mock_supabase(self):
        return MagicMock()

    async def test_explicit_charges_pair_by_name_ignoring_actual_billed(
        self, mock_supabase
    ):
        # The explicit set is the charged side; actual_billed_amounts is NOT read,
        # so a decoy billed row must not affect the result.
        org_id = uuid4()
        lease_a = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "99999.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_explicit_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
                charges=[
                    ExplicitCharge(tenant_name="Acme Corp", amount=Decimal("1200.00"))
                ],
            )

        assert result.total_actual_charged == Decimal("1200.00")
        assert result.total_capveri_correct == Decimal("1000.00")
        assert result.overcharge_count == 1
        tv = result.tenants[0]
        assert tv.lease_id == lease_a
        assert tv.direction is VarianceDirection.OVERCHARGE
        assert tv.variance == Decimal("200.00")

    async def test_explicit_duplicate_name_combines_via_shared_helper(
        self, mock_supabase
    ):
        # Two leases share "Acme Corp" (combined correct $2000). An explicit $2000
        # charge must combine into ONE MATCH finding — proving the explicit path
        # reuses the engine's combine logic, not a duplicate.
        org_id = uuid4()
        lease_a = str(uuid4())
        lease_b = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
                {
                    **scope,
                    "lease_id": lease_b,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
            ],
            "leases": [
                {**scope, "id": lease_a, "tenant_name": "Acme Corp"},
                {**scope, "id": lease_b, "tenant_name": "Acme Corp"},
            ],
            "actual_billed_amounts": [],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_explicit_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
                charges=[
                    ExplicitCharge(tenant_name="Acme Corp", amount=Decimal("2000.00"))
                ],
            )

        assert len(result.tenants) == 1
        combined = result.tenants[0]
        assert combined.lease_id == "name::Acme Corp"
        assert combined.capveri_correct == Decimal("2000.00")
        assert combined.actual_charged == Decimal("2000.00")
        assert combined.direction is VarianceDirection.MATCH
        assert result.match_count == 1

    async def test_explicit_blank_name_charges_stay_separate(self, mock_supabase):
        # Blank/whitespace names get their own positional id keys, never merged.
        org_id = uuid4()
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [],
            "leases": [],
            "actual_billed_amounts": [],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_explicit_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
                charges=[
                    ExplicitCharge(amount=Decimal("200.00")),
                    ExplicitCharge(tenant_name="   ", amount=Decimal("300.00")),
                ],
            )

        assert result.overcharge_count == 2
        assert {t.lease_id for t in result.tenants} == {
            "id::explicit::0",
            "id::explicit::1",
        }
        assert result.total_actual_charged == Decimal("500.00")

    async def test_explicit_negative_amount_is_signed_undercharge(self, mock_supabase):
        # A negative explicit charge (e.g. a credit/reversal from the other system)
        # is accepted and flows through as a signed variance: charged -200 vs
        # correct 1000 -> variance -1200 (undercharge), not rejected or clamped.
        org_id = uuid4()
        lease_a = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_explicit_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
                charges=[
                    ExplicitCharge(tenant_name="Acme Corp", amount=Decimal("-200.00"))
                ],
            )

        tv = result.tenants[0]
        assert tv.actual_charged == Decimal("-200.00")
        assert tv.variance == Decimal("-1200.00")
        assert tv.direction is VarianceDirection.UNDERCHARGE
        assert result.total_undercharge == Decimal("1200.00")

    async def test_explicit_cross_org_property_returns_empty(self, mock_supabase):
        org_id = uuid4()
        other_org_id = uuid4()
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(other_org_id)}],
            "reconciliation_snapshots": [],
            "leases": [],
            "actual_billed_amounts": [],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_explicit_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
                charges=[
                    ExplicitCharge(tenant_name="Acme Corp", amount=Decimal("500.00"))
                ],
            )

        assert result.tenants == []
        assert result.total_actual_charged == Decimal("0")


class TestPerPoolCompare:
    """Bidirectional per-pool comparison wiring (B1.5b-S2d).

    Exercises the full ``compare_charges`` / ``compare_explicit_charges`` path with
    per-pool data on BOTH sides: snapshots carrying ``pool_breakdowns`` (NAME-keyed)
    and charged rows carrying ``pool_id``, bridged through ``expense_pools``. Also
    pins the two guards that keep the feature non-fabricating: the intersection gate
    (pool data on only one side -> pool mode OFF, byte-identical to tenant totals)
    and the cleanly-paired-only rule (duplicate names carry no pool breakdown).
    """

    @pytest.fixture
    def mock_supabase(self):
        return MagicMock()

    async def test_compare_charges_populates_pool_breakdowns(self, mock_supabase):
        # Snapshot splits Acme's $1000 into CAM $600 + Insurance $400; the other
        # system billed CAM $650 (overcharge) and Insurance $400 (match). With pool
        # data on BOTH sides, the tenant carries a signed per-pool breakdown while the
        # tenant total still reconciles ($1000 correct vs $1050 charged, +$50).
        org_id = uuid4()
        lease_a = str(uuid4())
        pool_cam = str(uuid4())
        pool_ins = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "expense_pools": [
                {"id": pool_cam, "name": "CAM", "property_id": str(PROP_ID)},
                {"id": pool_ins, "name": "Insurance", "property_id": str(PROP_ID)},
            ],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "pool_breakdowns": [
                        {"pool_name": "CAM", "total_recovery": "600.00"},
                        {"pool_name": "Insurance", "total_recovery": "400.00"},
                    ],
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "650.00",
                    "pool_id": pool_cam,
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                },
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "400.00",
                    "pool_id": pool_ins,
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                },
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        tv = result.tenants[0]
        assert tv.lease_id == lease_a
        assert tv.capveri_correct == Decimal("1000.00")
        assert tv.actual_charged == Decimal("1050.00")
        assert tv.variance == Decimal("50.00")
        assert tv.pool_breakdowns is not None
        by_pool = {pv.pool_id: pv for pv in tv.pool_breakdowns}
        assert by_pool[pool_cam].pool_name == "CAM"
        assert by_pool[pool_cam].capveri_correct == Decimal("600.00")
        assert by_pool[pool_cam].actual_charged == Decimal("650.00")
        assert by_pool[pool_cam].variance == Decimal("50.00")
        assert by_pool[pool_cam].direction is VarianceDirection.OVERCHARGE
        assert by_pool[pool_ins].capveri_correct == Decimal("400.00")
        assert by_pool[pool_ins].actual_charged == Decimal("400.00")
        assert by_pool[pool_ins].direction is VarianceDirection.MATCH

    async def test_charged_side_without_pool_id_keeps_pool_mode_off(
        self, mock_supabase
    ):
        # Snapshot HAS a per-pool split but the billed row carries NO pool_id (a
        # tenant-total charge). The intersection gate must leave pool mode OFF so the
        # result is byte-identical to a tenant-total comparison: pool_breakdowns None,
        # totals unchanged.
        org_id = uuid4()
        lease_a = str(uuid4())
        pool_cam = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "expense_pools": [
                {"id": pool_cam, "name": "CAM", "property_id": str(PROP_ID)}
            ],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "pool_breakdowns": [
                        {"pool_name": "CAM", "total_recovery": "1000.00"},
                    ],
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "1200.00",
                    "pool_id": None,
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        tv = result.tenants[0]
        assert tv.pool_breakdowns is None
        assert tv.capveri_correct == Decimal("1000.00")
        assert tv.actual_charged == Decimal("1200.00")
        assert tv.variance == Decimal("200.00")

    async def test_duplicate_name_carries_no_pool_breakdown(self, mock_supabase):
        # Two leases share "Acme Corp", each with a per-pool snapshot, and the charge
        # carries a pool_id. Because the name is ambiguous (combined bucket), it is
        # cleanly-paired to NO lease, so no charged pool re-keys -> the intersection is
        # empty -> pool mode OFF. The combined tenant has pool_breakdowns None.
        org_id = uuid4()
        lease_a = str(uuid4())
        lease_b = str(uuid4())
        pool_cam = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "expense_pools": [
                {"id": pool_cam, "name": "CAM", "property_id": str(PROP_ID)}
            ],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "pool_breakdowns": [
                        {"pool_name": "CAM", "total_recovery": "1000.00"},
                    ],
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
                {
                    **scope,
                    "lease_id": lease_b,
                    "total_recovery": "1000.00",
                    "pool_breakdowns": [
                        {"pool_name": "CAM", "total_recovery": "1000.00"},
                    ],
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
            ],
            "leases": [
                {**scope, "id": lease_a, "tenant_name": "Acme Corp"},
                {**scope, "id": lease_b, "tenant_name": "Acme Corp"},
            ],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "2000.00",
                    "pool_id": pool_cam,
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        assert len(result.tenants) == 1
        combined = result.tenants[0]
        assert combined.lease_id == "name::Acme Corp"
        assert combined.capveri_correct == Decimal("2000.00")
        assert combined.actual_charged == Decimal("2000.00")
        assert combined.pool_breakdowns is None

    async def test_unresolvable_pool_name_drops_from_pool_view_only(
        self, mock_supabase
    ):
        # The snapshot splits into CAM $600 + a "Ghost Pool" $400 that no longer
        # exists in expense_pools (renamed/deleted since the snapshot). The unresolved
        # pool is dropped from the per-pool view but its amount stays in the tenant
        # total ($1000 correct). Only CAM appears in pool_breakdowns.
        org_id = uuid4()
        lease_a = str(uuid4())
        pool_cam = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "expense_pools": [
                {"id": pool_cam, "name": "CAM", "property_id": str(PROP_ID)}
            ],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "pool_breakdowns": [
                        {"pool_name": "CAM", "total_recovery": "600.00"},
                        {"pool_name": "Ghost Pool", "total_recovery": "400.00"},
                    ],
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "600.00",
                    "pool_id": pool_cam,
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        tv = result.tenants[0]
        assert tv.capveri_correct == Decimal("1000.00")
        assert tv.pool_breakdowns is not None
        assert len(tv.pool_breakdowns) == 1
        pv = tv.pool_breakdowns[0]
        assert pv.pool_id == pool_cam
        assert pv.capveri_correct == Decimal("600.00")
        assert pv.actual_charged == Decimal("600.00")
        assert pv.direction is VarianceDirection.MATCH

    async def test_compare_explicit_charges_populates_pool_breakdowns(
        self, mock_supabase
    ):
        # The explicit-charge path carries pool_id per charge. CapVeri splits Acme's
        # $1000 into CAM $600 + Insurance $400; explicit charges bill CAM $700
        # (overcharge) and Insurance $400 (match). Pool data on both sides -> per-pool
        # breakdown, identical wiring to the actual_billed path.
        org_id = uuid4()
        lease_a = str(uuid4())
        pool_cam = str(uuid4())
        pool_ins = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "expense_pools": [
                {"id": pool_cam, "name": "CAM", "property_id": str(PROP_ID)},
                {"id": pool_ins, "name": "Insurance", "property_id": str(PROP_ID)},
            ],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "pool_breakdowns": [
                        {"pool_name": "CAM", "total_recovery": "600.00"},
                        {"pool_name": "Insurance", "total_recovery": "400.00"},
                    ],
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            "leases": [{**scope, "id": lease_a, "tenant_name": "Acme Corp"}],
            "actual_billed_amounts": [],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_explicit_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
                charges=[
                    ExplicitCharge(
                        tenant_name="Acme Corp",
                        pool_id=pool_cam,
                        amount=Decimal("700.00"),
                    ),
                    ExplicitCharge(
                        tenant_name="Acme Corp",
                        pool_id=pool_ins,
                        amount=Decimal("400.00"),
                    ),
                ],
            )

        tv = result.tenants[0]
        assert tv.capveri_correct == Decimal("1000.00")
        assert tv.actual_charged == Decimal("1100.00")
        assert tv.pool_breakdowns is not None
        by_pool = {pv.pool_id: pv for pv in tv.pool_breakdowns}
        assert by_pool[pool_cam].variance == Decimal("100.00")
        assert by_pool[pool_cam].direction is VarianceDirection.OVERCHARGE
        assert by_pool[pool_ins].direction is VarianceDirection.MATCH

    async def test_mixed_population_only_shared_lease_gets_breakdown(
        self, mock_supabase
    ):
        # Two tenants. Acme has pool data on BOTH sides (qualifies); Beta is charged
        # with a pool_id but its snapshot is aggregate-only (no pool_breakdowns), so
        # it has correct-side pool data on NEITHER side of the shared test. Once pool
        # mode is on (because Acme qualifies), every tenant carries a list: Acme a
        # populated one, Beta an EMPTY one ("pool mode on, no pool data for this
        # lease"). This pins the gate ∩ build_comparison_result per-lease interaction.
        org_id = uuid4()
        lease_a = str(uuid4())
        lease_b = str(uuid4())
        pool_cam = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "expense_pools": [
                {"id": pool_cam, "name": "CAM", "property_id": str(PROP_ID)}
            ],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "1000.00",
                    "pool_breakdowns": [
                        {"pool_name": "CAM", "total_recovery": "1000.00"},
                    ],
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
                {
                    **scope,
                    "lease_id": lease_b,
                    "total_recovery": "500.00",
                    "pool_breakdowns": None,
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                },
            ],
            "leases": [
                {**scope, "id": lease_a, "tenant_name": "Acme Corp"},
                {**scope, "id": lease_b, "tenant_name": "Beta LLC"},
            ],
            "actual_billed_amounts": [
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Acme Corp",
                    "billed_amount": "1100.00",
                    "pool_id": pool_cam,
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                },
                {
                    **scope,
                    "id": str(uuid4()),
                    "tenant_name": "Beta LLC",
                    "billed_amount": "500.00",
                    "pool_id": pool_cam,
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                },
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        by_lease = {t.lease_id: t for t in result.tenants}
        # Acme qualifies (pool data both sides) -> populated breakdown.
        assert by_lease[lease_a].pool_breakdowns is not None
        assert len(by_lease[lease_a].pool_breakdowns) == 1
        assert by_lease[lease_a].pool_breakdowns[0].pool_id == pool_cam
        # Beta is aggregate-only on the correct side -> pool mode ON but empty list,
        # NOT a fabricated all-overcharge breakdown. Its tenant total still holds.
        assert by_lease[lease_b].pool_breakdowns == []
        assert by_lease[lease_b].capveri_correct == Decimal("500.00")
        assert by_lease[lease_b].actual_charged == Decimal("500.00")
        assert by_lease[lease_b].direction is VarianceDirection.MATCH


class TestCompareChargesLeasesSchemaScoping:
    """Regression for BUG-11: leases has no organization_id column.

    The filter-applying MockQueryBuilder is fed schema-accurate lease rows that
    omit ``organization_id``. The previous code filtered the leases lookup by
    ``organization_id``; against rows lacking that column the filter dropped
    every lease and tenant names never resolved. Scoping now relies on
    property_id (lease ids already come from org-scoped snapshots).
    """

    @pytest.fixture
    def mock_supabase(self):
        return MagicMock()

    async def test_tenant_names_resolve_without_organization_id_column(
        self, mock_supabase
    ):
        org_id = uuid4()
        lease_a = str(uuid4())
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": [
                {
                    **scope,
                    "lease_id": lease_a,
                    "total_recovery": "6000.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": "finalized",
                }
            ],
            # Schema-accurate: leases rows have property_id but NO
            # organization_id column.
            "leases": [
                {
                    "id": lease_a,
                    "property_id": str(PROP_ID),
                    "tenant_name": "Acme Corp",
                }
            ],
            "actual_billed_amounts": [
                {
                    **scope,
                    "tenant_name": "Acme Corp",
                    "billed_amount": "6500.00",
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                }
            ],
        }
        mock_supabase.table = _table_fn(table_data)

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        by_lease = {t.lease_id: t for t in result.tenants}
        # Under the buggy org filter the lease drops out and tenant_name would
        # not resolve to the real name.
        assert by_lease[lease_a].tenant_name == "Acme Corp"
        assert by_lease[lease_a].capveri_correct == Decimal("6000.00")
        assert by_lease[lease_a].actual_charged == Decimal("6500.00")


class TestCompareChargesChunkedInFilter:
    """Regression for BUG-12: large lease-id lists must be chunked.

    ``compare_charges`` resolves tenant names via ``.in_("id", lease_ids)``.
    PostgREST encodes ``.in_()`` values into the GET URL, so hundreds of lease
    ids (e.g. a 400-unit property) overflow the request-line buffer and return
    414 (URI too long). The lookup must split the id list into <=100-id chunks
    and combine the results.
    """

    @pytest.fixture
    def mock_supabase(self):
        return MagicMock()

    async def test_leases_lookup_issues_multiple_chunked_in_calls(self, mock_supabase):
        org_id = uuid4()
        scope = {"organization_id": str(org_id), "property_id": str(PROP_ID)}

        # 150 leases — more than the 100-id default chunk size, so a single
        # un-chunked .in_() would be issued by the buggy code.
        n = 150
        lease_ids = [str(uuid4()) for _ in range(n)]
        snapshots = [
            {
                **scope,
                "lease_id": lid,
                "total_recovery": "10.00",
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "status": "finalized",
            }
            for lid in lease_ids
        ]
        # Schema-accurate: leases rows carry property_id but NO organization_id.
        leases = [
            {"id": lid, "property_id": str(PROP_ID), "tenant_name": f"Tenant {i:03d}"}
            for i, lid in enumerate(lease_ids)
        ]
        table_data = {
            "properties": [{"id": str(PROP_ID), "organization_id": str(org_id)}],
            "reconciliation_snapshots": snapshots,
            "leases": leases,
            "actual_billed_amounts": [],
        }

        # Record every id-list passed to .in_("id", ...) on the leases table.
        recorded_in_chunks: list[list[str]] = []

        def table_fn(table_name):
            qb = MockQueryBuilder(data=table_data.get(table_name, []))
            if table_name == "leases":
                original_in = qb.in_

                def recording_in(column, values):
                    if column == "id":
                        recorded_in_chunks.append(list(values))
                    return original_in(column, values)

                qb.in_ = recording_in
            return qb

        mock_supabase.table = table_fn

        with patch(
            "app.services.comparison.engine.get_supabase_admin",
            return_value=mock_supabase,
        ):
            result = await compare_charges(
                organization_id=org_id,
                property_id=PROP_ID,
                period_start=P_START,
                period_end=P_END,
            )

        # Chunked: more than one .in_() call, none exceeding 100 ids.
        assert len(recorded_in_chunks) > 1, (
            "Expected multiple chunked .in_() calls for >100 lease_ids; "
            f"got {len(recorded_in_chunks)}"
        )
        assert all(
            len(chunk) <= 100 for chunk in recorded_in_chunks
        ), f"A chunk exceeded 100 ids: {[len(c) for c in recorded_in_chunks]}"
        # All lease ids covered exactly once across the chunks.
        total_queried = sum(len(c) for c in recorded_in_chunks)
        assert (
            total_queried == n
        ), f"Expected {n} total ids queried, got {total_queried}"
        # Tenant names resolved across every chunk (no lease dropped).
        assert len(result.tenants) == n
        assert all(t.tenant_name.startswith("Tenant ") for t in result.tenants)
