"""Tests for BOMA 2024 compliance warning logic in the reconciliation orchestrator.

Covers three warning types:
- Warning A: Building RSF measured under pre-2024 BOMA standard
- Warning B: NATA space type with potential load-factor risk
- Warning C: Mixed-vintage lease book (different RSF standards)
"""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models.enums import BomaStandardVersion, CapType, SpaceType
from app.services.calculation.expense_filter import ExpensePoolSummary
from app.services.calculation.orchestrator import (
    ReconciliationInput,
    run_property_reconciliation,
)
from app.services.calculation.tenant_share import LeaseTerms


@pytest.fixture
def property_id():
    return uuid4()


@pytest.fixture
def mock_supabase():
    mock = MagicMock()
    empty_result = type("Result", (), {"data": []})()
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
        empty_result
    )
    return mock


@pytest.fixture
def minimal_pool_summaries():
    return {
        uuid4(): ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name="Operating",
            pool_type="operating",
            total_amount=Decimal("100000.00"),
            is_gross_up_applicable=True,
        )
    }


def make_lease(
    *,
    tenant_name: str = "Test Tenant",
    pro_rata_share: Decimal = Decimal("0.10"),
    unit_space_type: SpaceType | None = None,
    rsf_measurement_standard: BomaStandardVersion | None = None,
) -> LeaseTerms:
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name=tenant_name,
        tenant_sqft=Decimal("10000.00"),
        pro_rata_share=pro_rata_share,
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
        cap_type=CapType.NONE,
        unit_space_type=unit_space_type,
        rsf_measurement_standard=rsf_measurement_standard,
    )


class TestWarningAPreBoma2024Building:
    """Warning A: Building RSF measured under a pre-2024 BOMA standard."""

    @pytest.mark.asyncio
    async def test_warns_when_building_is_boma_2017(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """Warning fires when boma_standard_version is 2017."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
            boma_standard_version=BomaStandardVersion.V2017,
        )
        lease = make_lease()

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=[lease],
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        warning_steps = [
            s
            for s in result.property_trace.steps
            if s.step_name == "BOMA Standard Version Warning"
        ]
        assert len(warning_steps) == 1
        assert warning_steps[0].note is not None
        assert "WARNING:" in warning_steps[0].note
        assert "2017" in warning_steps[0].note

    @pytest.mark.asyncio
    async def test_warns_when_building_is_boma_2010(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """Warning fires when boma_standard_version is 2010."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
            boma_standard_version=BomaStandardVersion.V2010,
        )

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=[],
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        warning_steps = [
            s
            for s in result.property_trace.steps
            if s.step_name == "BOMA Standard Version Warning"
        ]
        assert len(warning_steps) == 1
        assert "WARNING:" in warning_steps[0].note

    @pytest.mark.asyncio
    async def test_no_warning_when_building_is_boma_2024(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """No warning when boma_standard_version is 2024."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
            boma_standard_version=BomaStandardVersion.V2024,
        )

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=[],
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        warning_steps = [
            s
            for s in result.property_trace.steps
            if s.step_name == "BOMA Standard Version Warning"
        ]
        assert len(warning_steps) == 0

    @pytest.mark.asyncio
    async def test_no_warning_when_boma_version_not_set(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """No warning when boma_standard_version is not provided (legacy data)."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
            # boma_standard_version omitted — defaults to V2024
        )

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=[],
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        warning_steps = [
            s
            for s in result.property_trace.steps
            if s.step_name == "BOMA Standard Version Warning"
        ]
        assert len(warning_steps) == 0


class TestWarningBNataSpaceType:
    """Warning B: NATA space type without load-factor documentation."""

    @pytest.mark.asyncio
    async def test_warns_for_outdoor_amenity_unit(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """Warning fires for outdoor_amenity space type."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        lease = make_lease(
            tenant_name="Patio Tenant",
            unit_space_type=SpaceType.OUTDOOR_AMENITY,
        )

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=[lease],
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        nata_warnings = [
            s
            for s in result.property_trace.steps
            if "BOMA 2024 NATA Space" in s.step_name
        ]
        assert len(nata_warnings) == 1
        assert "WARNING:" in nata_warnings[0].note
        assert "outdoor_amenity" in nata_warnings[0].note

    @pytest.mark.asyncio
    async def test_warns_for_storage_unit(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """Warning fires for storage space type."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        lease = make_lease(
            tenant_name="Storage Tenant", unit_space_type=SpaceType.STORAGE
        )

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=[lease],
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        nata_warnings = [
            s
            for s in result.property_trace.steps
            if "BOMA 2024 NATA Space" in s.step_name
        ]
        assert len(nata_warnings) == 1
        assert "WARNING:" in nata_warnings[0].note

    @pytest.mark.asyncio
    async def test_warns_for_equipment_shaft_unit(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """Warning fires for equipment_shaft space type."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        lease = make_lease(
            tenant_name="Shaft Tenant", unit_space_type=SpaceType.EQUIPMENT_SHAFT
        )

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=[lease],
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        nata_warnings = [
            s
            for s in result.property_trace.steps
            if "BOMA 2024 NATA Space" in s.step_name
        ]
        assert len(nata_warnings) == 1

    @pytest.mark.asyncio
    async def test_no_warning_for_office_unit(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """No warning for standard office space type."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        lease = make_lease(unit_space_type=SpaceType.OFFICE)

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=[lease],
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        nata_warnings = [
            s
            for s in result.property_trace.steps
            if "BOMA 2024 NATA Space" in s.step_name
        ]
        assert len(nata_warnings) == 0

    @pytest.mark.asyncio
    async def test_no_warning_when_space_type_not_set(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """No warning when unit_space_type is None (legacy data)."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        lease = make_lease(unit_space_type=None)

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=[lease],
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        nata_warnings = [
            s
            for s in result.property_trace.steps
            if "BOMA 2024 NATA Space" in s.step_name
        ]
        assert len(nata_warnings) == 0

    @pytest.mark.asyncio
    async def test_multiple_nata_tenants_each_get_warning(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """Each NATA tenant gets its own warning step."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        leases = [
            make_lease(
                tenant_name="Patio A",
                pro_rata_share=Decimal("0.05"),
                unit_space_type=SpaceType.OUTDOOR_AMENITY,
            ),
            make_lease(
                tenant_name="Storage B",
                pro_rata_share=Decimal("0.03"),
                unit_space_type=SpaceType.STORAGE,
            ),
        ]

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=leases,
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        nata_warnings = [
            s
            for s in result.property_trace.steps
            if "BOMA 2024 NATA Space" in s.step_name
        ]
        assert len(nata_warnings) == 2


class TestWarningCMixedVintageLeases:
    """Warning C: Mixed BOMA standards across the lease book."""

    @pytest.mark.asyncio
    async def test_warns_when_leases_have_different_standards(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """Warning fires when leases use different RSF measurement standards."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        leases = [
            make_lease(
                tenant_name="Old Tenant",
                rsf_measurement_standard=BomaStandardVersion.V2017,
            ),
            make_lease(
                tenant_name="New Tenant",
                rsf_measurement_standard=BomaStandardVersion.V2024,
            ),
        ]

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=leases,
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        mixed_warnings = [
            s
            for s in result.property_trace.steps
            if s.step_name == "Mixed-Vintage RSF Warning"
        ]
        assert len(mixed_warnings) == 1
        assert "WARNING:" in mixed_warnings[0].note
        assert "2017" in mixed_warnings[0].note
        assert "2024" in mixed_warnings[0].note

    @pytest.mark.asyncio
    async def test_no_warning_when_all_leases_same_standard(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """No warning when all leases share the same RSF measurement standard."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        leases = [
            make_lease(
                tenant_name="Tenant A",
                rsf_measurement_standard=BomaStandardVersion.V2024,
            ),
            make_lease(
                tenant_name="Tenant B",
                rsf_measurement_standard=BomaStandardVersion.V2024,
            ),
        ]

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=leases,
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        mixed_warnings = [
            s
            for s in result.property_trace.steps
            if s.step_name == "Mixed-Vintage RSF Warning"
        ]
        assert len(mixed_warnings) == 0

    @pytest.mark.asyncio
    async def test_no_warning_when_standards_not_set(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """No warning when all leases have no RSF standard set (legacy data)."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        leases = [
            make_lease(tenant_name="Legacy A", rsf_measurement_standard=None),
            make_lease(tenant_name="Legacy B", rsf_measurement_standard=None),
        ]

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=leases,
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        mixed_warnings = [
            s
            for s in result.property_trace.steps
            if s.step_name == "Mixed-Vintage RSF Warning"
        ]
        assert len(mixed_warnings) == 0

    @pytest.mark.asyncio
    async def test_no_warning_when_only_one_lease_has_standard(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """No warning when only one lease has standard set (can't determine mix)."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
        )
        leases = [
            make_lease(
                tenant_name="Tenant With Standard",
                rsf_measurement_standard=BomaStandardVersion.V2024,
            ),
            make_lease(
                tenant_name="Tenant Without Standard",
                rsf_measurement_standard=None,
            ),
        ]

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=leases,
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        mixed_warnings = [
            s
            for s in result.property_trace.steps
            if s.step_name == "Mixed-Vintage RSF Warning"
        ]
        assert len(mixed_warnings) == 0


class TestAllWarningsCombined:
    """Test that all three warnings can fire simultaneously."""

    @pytest.mark.asyncio
    async def test_all_three_warnings_can_fire_together(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """All three warnings fire when conditions are met simultaneously."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
            boma_standard_version=BomaStandardVersion.V2017,
        )
        leases = [
            make_lease(
                tenant_name="Patio Tenant",
                pro_rata_share=Decimal("0.05"),
                unit_space_type=SpaceType.OUTDOOR_AMENITY,
                rsf_measurement_standard=BomaStandardVersion.V2017,
            ),
            make_lease(
                tenant_name="Office Tenant",
                pro_rata_share=Decimal("0.10"),
                unit_space_type=SpaceType.OFFICE,
                rsf_measurement_standard=BomaStandardVersion.V2024,
            ),
        ]

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=leases,
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        step_names = [s.step_name for s in result.property_trace.steps]
        assert "BOMA Standard Version Warning" in step_names
        assert any("BOMA 2024 NATA Space" in n for n in step_names)
        assert "Mixed-Vintage RSF Warning" in step_names

    @pytest.mark.asyncio
    async def test_no_warnings_when_all_2024_compliant(
        self, property_id, minimal_pool_summaries, mock_supabase
    ):
        """No BOMA warnings when all data is 2024-compliant."""
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000.00"),
            boma_standard_version=BomaStandardVersion.V2024,
        )
        leases = [
            make_lease(
                tenant_name="Office A",
                unit_space_type=SpaceType.OFFICE,
                rsf_measurement_standard=BomaStandardVersion.V2024,
            ),
            make_lease(
                tenant_name="Office B",
                pro_rata_share=Decimal("0.08"),
                unit_space_type=SpaceType.OFFICE,
                rsf_measurement_standard=BomaStandardVersion.V2024,
            ),
        ]

        result = await run_property_reconciliation(
            input_data=input_data,
            leases=leases,
            pool_summaries=minimal_pool_summaries,
            supabase_client=mock_supabase,
        )

        boma_warning_names = {
            "BOMA Standard Version Warning",
            "Mixed-Vintage RSF Warning",
        }
        fired_steps = {
            s.step_name
            for s in result.property_trace.steps
            if s.step_name in boma_warning_names
            or "BOMA 2024 NATA Space" in s.step_name
        }
        assert fired_steps == set()
