"""Tests for PDF export — tenant name display and context loading.

Verifies that:
1. TenantPacketGenerator._build_tenant_info shows the tenant_name, not lease ID.
2. _load_export_context selects tenant_name from the leases table.
"""

from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

from app.api.v1.exports import (
    TenantPacketGenerator,
    _load_export_context,
    _verify_snapshot_property_scope,
)
from tests.conftest import MockQueryBuilder


class TestTenantPacketGeneratorTenantInfo:
    def test_build_tenant_info_shows_tenant_name(self) -> None:
        """_build_tenant_info should display tenant_name, not lease ID."""
        generator = TenantPacketGenerator(
            snapshot_data={
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
            },
            lease_data={"id": "some-lease-id", "tenant_name": "Acme Corp"},
            property_data={"name": "Downtown Tower", "address": "123 Main St"},
            org_data={"name": "Landlord LLC"},
        )
        elements = generator._build_tenant_info()

        # elements[0] = section header, elements[1] = info paragraph
        paragraph_text = elements[1].text
        assert "Acme Corp" in paragraph_text
        assert "Lease ID" not in paragraph_text

    def test_build_tenant_info_falls_back_gracefully(self) -> None:
        """_build_tenant_info should show N/A when tenant_name is missing."""
        generator = TenantPacketGenerator(
            snapshot_data={
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
            },
            lease_data={"id": "some-lease-id"},  # no tenant_name
            property_data={"name": "Downtown Tower", "address": "123 Main St"},
            org_data={"name": "Landlord LLC"},
        )
        elements = generator._build_tenant_info()
        paragraph_text = elements[1].text
        assert "N/A" in paragraph_text
        assert "Lease ID" not in paragraph_text


class TestTenantPacketCurrencyFormatting:
    """A reconciliation credit (tenant overpaid) must read as -$X, not $-X."""

    def _generator(self) -> TenantPacketGenerator:
        return TenantPacketGenerator(
            snapshot_data={
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
            },
            lease_data={"tenant_name": "Acme Corp"},
            property_data={"name": "Downtown Tower", "address": "123 Main St"},
            org_data={"name": "Landlord LLC"},
        )

    def test_negative_amount_leads_with_minus_then_symbol(self) -> None:
        assert self._generator()._format_currency(Decimal("-5000")) == "-$5,000.00"

    def test_positive_amount_unchanged(self) -> None:
        assert self._generator()._format_currency(Decimal("12345.67")) == "$12,345.67"

    def test_zero_has_no_minus(self) -> None:
        assert self._generator()._format_currency(Decimal("0")) == "$0.00"

    def test_accepts_string_amount(self) -> None:
        assert self._generator()._format_currency("-1234.56") == "-$1,234.56"


class TestCalculationBreakdownUnitFormatting:
    """The tenant-facing audit trail must render each trace step by its unit
    tag, matching the in-app trace and the summary table -- a currency step
    prints $5,000.00 (not bare 5000.00), an area prints sq ft, a credit -$X."""

    def _generator(self) -> TenantPacketGenerator:
        return TenantPacketGenerator(
            snapshot_data={
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "calculation_trace": [
                    {
                        "step_name": "Calculate Actual Occupancy",
                        "operation": "occupied/total",
                        "output_value": "0.95",
                        "output_unit": "ratio",
                    },
                    {
                        "step_name": "Calculate Tenant Share",
                        "operation": "share*expenses",
                        "output_value": "5000.00",
                        "output_unit": "currency",
                    },
                    {
                        "step_name": "Building Area",
                        "operation": "sum rsf",
                        "output_value": "10000",
                        "output_unit": "area",
                    },
                    {
                        "step_name": "Calculate Total Recovery",
                        "operation": "share-estimates",
                        "output_value": "-5000.00",
                        "output_unit": "currency",
                    },
                ],
            },
            lease_data={"tenant_name": "Acme Corp"},
            property_data={"name": "Downtown Tower", "address": "123 Main St"},
            org_data={"name": "Landlord LLC"},
        )

    def _rendered_lines(self) -> list[str]:
        elements = self._generator()._build_calculation_breakdown()
        return [getattr(el, "text", "") for el in elements]

    def test_currency_step_formats_with_symbol_and_separators(self) -> None:
        lines = self._rendered_lines()
        assert any("$5,000.00" in line for line in lines)

    def test_credit_step_leads_with_minus_then_symbol(self) -> None:
        lines = self._rendered_lines()
        assert any("-$5,000.00" in line for line in lines)
        assert not any("$-5,000.00" in line for line in lines)

    def test_area_step_renders_sq_ft(self) -> None:
        lines = self._rendered_lines()
        assert any("10,000 sq ft" in line for line in lines)

    def test_ratio_step_keeps_decimals_not_dollars(self) -> None:
        lines = self._rendered_lines()
        assert any("0.9500" in line for line in lines)
        assert not any("$0.95" in line for line in lines)


class TestLoadExportContext:
    def test_load_export_context_fetches_tenant_name(self) -> None:
        """_load_export_context should select tenant_name from leases."""
        lease_id = uuid4()
        property_id = uuid4()
        org_id = uuid4()

        ctx = MagicMock()
        ctx.org_id = org_id

        # Return a lease with tenant_name from the leases table
        lease_chain = MagicMock()
        lease_chain.select.return_value = lease_chain
        lease_chain.eq.return_value = lease_chain
        lease_chain.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(lease_id),
                    "property_id": str(property_id),
                    "tenant_name": "Acme Corp",
                }
            ]
        )

        # Return empty for other tables
        empty_chain = MagicMock()
        empty_chain.select.return_value = empty_chain
        empty_chain.eq.return_value = empty_chain
        empty_chain.execute.return_value = MagicMock(data=[])

        def _table_side_effect(name: str) -> MagicMock:
            if name == "leases":
                return lease_chain
            return empty_chain

        ctx.table.side_effect = _table_side_effect

        snapshot_data = {"lease_id": str(lease_id)}
        _load_export_context(ctx, snapshot_data)

        # The leases select must include tenant_name
        lease_chain.select.assert_called_with("id, property_id, tenant_name")


class TestVerifySnapshotPropertyScopeLeasesSchema:
    """Regression for BUG-11: leases has no organization_id column.

    ``_verify_snapshot_property_scope`` derives property_id from the lease when
    the snapshot has none, then org-verifies that property (the real scope gate).
    The filter-applying MockQueryBuilder is fed a schema-accurate lease row that
    omits ``organization_id``. The previous code filtered the leases lookup by
    ``organization_id``; against that row the filter dropped the lease, leaving
    property_id unresolved and raising a spurious NotFoundError. This test fails
    on the buggy query and passes once the lease lookup scopes by id alone.
    """

    def test_resolves_property_from_lease_without_organization_id_column(
        self,
    ) -> None:
        org_id = uuid4()
        property_id = uuid4()
        lease_id = uuid4()
        table_data = {
            # Schema-accurate: leases rows have NO organization_id column.
            "leases": [{"id": str(lease_id), "property_id": str(property_id)}],
            "properties": [{"id": str(property_id), "organization_id": str(org_id)}],
        }

        ctx = MagicMock()
        ctx.organization_id = org_id
        ctx.org_id = org_id
        ctx.table.side_effect = lambda name: MockQueryBuilder(
            data=table_data.get(name, [])
        )

        snapshot_data = {"lease_id": str(lease_id)}
        resolved = _verify_snapshot_property_scope(ctx, snapshot_data, lease_id)

        assert resolved == str(property_id)
