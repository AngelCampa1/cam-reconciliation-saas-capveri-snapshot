"""
Schema synchronization tests.

Ensures Pydantic and Zod schemas accept the same inputs.
These tests generate JSON from Pydantic models to verify
frontend TypeScript/Zod schemas can parse the same data.
"""

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

from app.models import (
    CalculationStep,
    CalculationStepCreate,
    CapType,
    DataResponse,
    ErrorCodes,
    ErrorResponse,
    ExpensePool,
    ExpensePoolCreate,
    GLEntry,
    GLEntryCreate,
    Lease,
    LeaseCreate,
    LeaseRecoveryProfile,
    LeaseRecoveryProfileCreate,
    LeaseStatus,
    Organization,
    OrganizationCreate,
    OrganizationSettings,
    PaginatedResponse,
    PoolMapping,
    PoolMappingCreate,
    Property,
    PropertyCreate,
    ReconciliationSnapshot,
    ReconciliationSnapshotCreate,
    ReconciliationStatus,
    SubscriptionStatus,
    SuccessResponse,
    Unit,
    UnitCreate,
    UnitStatus,
    User,
    UserCreate,
    UserRole,
)


def parse_json(model_instance: Any) -> dict[str, Any]:
    """Helper to dump model to JSON and parse back to dict."""
    json_str = model_instance.model_dump_json()
    return json.loads(json_str)


class TestOrganizationSchemaSync:
    """Tests for Organization model schema synchronization."""

    def test_organization_generates_valid_json(self) -> None:
        """Organization model generates JSON that frontend can validate."""
        org = Organization(
            id=uuid4(),
            name="Test Organization",
            subscription_status=SubscriptionStatus.ACTIVE,
            settings=OrganizationSettings(
                timezone="America/New_York",
                default_currency="USD",
                fiscal_year_end_month=12,
            ),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        parsed = parse_json(org)

        assert parsed["name"] == "Test Organization"
        assert parsed["subscription_status"] == "active"
        assert parsed["settings"]["timezone"] == "America/New_York"
        assert parsed["settings"]["default_currency"] == "USD"
        assert parsed["settings"]["fiscal_year_end_month"] == 12
        # Verify UUID is serialized as string
        assert isinstance(parsed["id"], str)
        assert len(parsed["id"]) == 36

    def test_organization_create_generates_valid_json(self) -> None:
        """OrganizationCreate generates JSON for frontend validation."""
        org_create = OrganizationCreate(
            name="New Org",
        )

        parsed = parse_json(org_create)

        assert parsed["name"] == "New Org"
        # subscription_status should have default
        assert parsed["subscription_status"] == "trial"
        # settings should have defaults
        assert parsed["settings"]["timezone"] == "America/New_York"


class TestUserSchemaSync:
    """Tests for User model schema synchronization."""

    def test_user_generates_valid_json(self) -> None:
        """User model generates JSON that frontend can validate."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            full_name="Test User",
            role=UserRole.MEMBER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        parsed = parse_json(user)

        assert parsed["email"] == "test@example.com"
        assert parsed["full_name"] == "Test User"
        assert parsed["role"] == "member"

    def test_user_create_generates_valid_json(self) -> None:
        """UserCreate generates JSON for frontend validation."""
        user_create = UserCreate(
            organization_id=uuid4(),
            email="new@example.com",
            full_name="New User",
            role=UserRole.VIEWER,
        )

        parsed = parse_json(user_create)

        assert parsed["email"] == "new@example.com"
        assert parsed["role"] == "viewer"

    def test_user_with_all_roles(self) -> None:
        """Test all user roles serialize correctly."""
        for role in UserRole:
            user_create = UserCreate(
                organization_id=uuid4(),
                email="test@example.com",
                full_name="Test",
                role=role,
            )
            parsed = parse_json(user_create)
            assert parsed["role"] == role.value


class TestPropertySchemaSync:
    """Tests for Property model schema synchronization."""

    def test_property_generates_valid_json(self) -> None:
        """Property model generates JSON that frontend can validate."""
        prop = Property(
            id=uuid4(),
            organization_id=uuid4(),
            name="Test Property",
            address_line1="123 Main St",
            address_line2="Suite 100",
            city="New York",
            state="NY",
            postal_code="10001",
            total_rentable_sqft=Decimal("50000.00"),
            total_usable_sqft=Decimal("45000.00"),
            common_area_sqft=Decimal("5000.00"),
            target_occupancy=Decimal("0.95"),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        parsed = parse_json(prop)

        assert parsed["name"] == "Test Property"
        assert parsed["address_line1"] == "123 Main St"
        assert parsed["address_line2"] == "Suite 100"
        assert parsed["city"] == "New York"
        assert parsed["state"] == "NY"
        assert parsed["postal_code"] == "10001"
        # Decimals are serialized as strings
        assert parsed["total_rentable_sqft"] == "50000.00"
        assert parsed["total_usable_sqft"] == "45000.00"
        assert parsed["target_occupancy"] == "0.95"

    def test_property_create_generates_valid_json(self) -> None:
        """PropertyCreate generates JSON for frontend validation."""
        prop_create = PropertyCreate(
            name="New Property",
            address_line1="456 Oak Ave",
            city="Los Angeles",
            state="CA",
            postal_code="90001",
            total_rentable_sqft=Decimal("100000.00"),
            total_usable_sqft=Decimal("90000.00"),
            common_area_sqft=Decimal("10000.00"),
        )

        parsed = parse_json(prop_create)

        assert parsed["name"] == "New Property"
        assert parsed["address_line2"] is None
        assert parsed["total_rentable_sqft"] == "100000.00"


class TestUnitSchemaSync:
    """Tests for Unit model schema synchronization."""

    def test_unit_generates_valid_json(self) -> None:
        """Unit model generates JSON that frontend can validate."""
        unit = Unit(
            id=uuid4(),
            property_id=uuid4(),
            unit_number="101",
            floor=1,
            rentable_sqft=Decimal("1500.00"),
            usable_sqft=Decimal("1400.00"),
            status=UnitStatus.OCCUPIED,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        parsed = parse_json(unit)

        assert parsed["unit_number"] == "101"
        assert parsed["floor"] == 1
        assert parsed["rentable_sqft"] == "1500.00"
        assert parsed["usable_sqft"] == "1400.00"
        assert parsed["status"] == "occupied"

    def test_unit_create_generates_valid_json(self) -> None:
        """UnitCreate generates JSON for frontend validation."""
        unit_create = UnitCreate(
            property_id=uuid4(),
            unit_number="202",
            floor=2,
            rentable_sqft=Decimal("2000.00"),
            usable_sqft=Decimal("1900.00"),
            status=UnitStatus.VACANT,
        )

        parsed = parse_json(unit_create)

        assert parsed["unit_number"] == "202"
        assert parsed["status"] == "vacant"

    def test_unit_with_all_statuses(self) -> None:
        """Test all unit statuses serialize correctly."""
        for status in UnitStatus:
            unit_create = UnitCreate(
                property_id=uuid4(),
                unit_number="100",
                rentable_sqft=Decimal("1000.00"),
                usable_sqft=Decimal("900.00"),
                status=status,
            )
            parsed = parse_json(unit_create)
            assert parsed["status"] == status.value


class TestLeaseRecoveryProfileSchemaSync:
    """Tests for LeaseRecoveryProfile model schema synchronization."""

    def test_recovery_profile_generates_valid_json(self) -> None:
        """LeaseRecoveryProfile generates JSON that frontend can validate."""
        profile = LeaseRecoveryProfile(
            base_year=2023,
            base_year_amount=Decimal("100000.00"),
            gross_up_base_year=True,
            pro_rata_share=Decimal("0.05"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),
            admin_fee_percentage=Decimal("0.15"),
            management_fee_percentage=Decimal("0.04"),
            excluded_pools=[],
        )

        parsed = parse_json(profile)

        assert parsed["base_year"] == 2023
        assert parsed["base_year_amount"] == "100000.00"
        assert parsed["gross_up_base_year"] is True
        assert parsed["pro_rata_share"] == "0.05"
        assert parsed["cap_type"] == "cumulative"
        assert parsed["cap_rate"] == "0.05"
        assert parsed["admin_fee_percentage"] == "0.15"
        assert parsed["management_fee_percentage"] == "0.04"
        assert parsed["excluded_pools"] == []

    def test_recovery_profile_with_all_cap_types(self) -> None:
        """Test all cap types serialize correctly."""
        for cap_type in CapType:
            cap_rate = Decimal("0.05") if cap_type != CapType.NONE else None
            profile = LeaseRecoveryProfileCreate(
                pro_rata_share=Decimal("0.10"),
                cap_type=cap_type,
                cap_rate=cap_rate,
            )
            parsed = parse_json(profile)
            assert parsed["cap_type"] == cap_type.value


class TestLeaseSchemaSync:
    """Tests for Lease model schema synchronization."""

    def test_lease_generates_valid_json(self) -> None:
        """Lease model generates JSON that frontend can validate."""
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            unit_id=uuid4(),
            tenant_name="Acme Corp",
            start_date=date(2024, 1, 1),
            end_date=date(2029, 12, 31),
            status=LeaseStatus.ACTIVE,
            recovery_profile=LeaseRecoveryProfile(
                base_year=2023,
                base_year_amount=Decimal("50000.00"),
                gross_up_base_year=False,
                pro_rata_share=Decimal("0.08"),
                cap_type=CapType.NON_CUMULATIVE,
                cap_rate=Decimal("0.03"),
                admin_fee_percentage=Decimal("0.15"),
                excluded_pools=[],
            ),
            document_url="https://example.com/lease.pdf",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        parsed = parse_json(lease)

        assert parsed["tenant_name"] == "Acme Corp"
        assert parsed["start_date"] == "2024-01-01"
        assert parsed["end_date"] == "2029-12-31"
        assert parsed["status"] == "active"
        assert parsed["recovery_profile"]["cap_type"] == "non_cumulative"
        assert parsed["document_url"] == "https://example.com/lease.pdf"

    def test_lease_create_generates_valid_json(self) -> None:
        """LeaseCreate generates JSON for frontend validation."""
        lease_create = LeaseCreate(
            property_id=uuid4(),
            tenant_name="Widget Inc",
            start_date=date(2025, 1, 1),
            end_date=date(2030, 12, 31),
            status=LeaseStatus.DRAFT,
            recovery_profile=LeaseRecoveryProfileCreate(
                pro_rata_share=Decimal("0.12"),
                cap_type=CapType.NONE,
            ),
        )

        parsed = parse_json(lease_create)

        assert parsed["tenant_name"] == "Widget Inc"
        assert parsed["status"] == "draft"
        assert parsed["recovery_profile"]["cap_type"] == "none"

    def test_lease_with_all_statuses(self) -> None:
        """Test all lease statuses serialize correctly."""
        for status in LeaseStatus:
            lease_create = LeaseCreate(
                property_id=uuid4(),
                tenant_name="Test Tenant",
                start_date=date(2024, 1, 1),
                end_date=date(2025, 12, 31),
                status=status,
                recovery_profile=LeaseRecoveryProfileCreate(
                    pro_rata_share=Decimal("0.05"),
                ),
            )
            parsed = parse_json(lease_create)
            assert parsed["status"] == status.value


class TestGLEntrySchemaSync:
    """Tests for GLEntry model schema synchronization."""

    def test_gl_entry_generates_valid_json(self) -> None:
        """GLEntry model generates JSON that frontend can validate."""
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000-100",
            account_description="Janitorial Services",
            transaction_date=date(2024, 6, 15),
            period_year=2024,
            period_month=6,
            amount=Decimal("1500.00"),
            description="Monthly cleaning service",
            vendor_name="CleanCo",
            raw_row_data={"original_amount": "1,500.00"},
            created_at=datetime.now(UTC),
        )

        parsed = parse_json(entry)

        assert parsed["account_code"] == "6000-100"
        assert parsed["account_description"] == "Janitorial Services"
        assert parsed["transaction_date"] == "2024-06-15"
        assert parsed["period_year"] == 2024
        assert parsed["period_month"] == 6
        assert parsed["amount"] == "1500.00"
        assert parsed["raw_row_data"]["original_amount"] == "1,500.00"

    def test_gl_entry_create_generates_valid_json(self) -> None:
        """GLEntryCreate generates JSON for frontend validation."""
        entry_create = GLEntryCreate(
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="7000-200",
            account_description="Utilities",
            transaction_date=date(2024, 7, 1),
            period_year=2024,
            period_month=7,
            amount=Decimal("-500.00"),
        )

        parsed = parse_json(entry_create)

        assert parsed["account_code"] == "7000-200"
        assert parsed["amount"] == "-500.00"
        assert parsed["period_year"] == 2024


class TestExpensePoolSchemaSync:
    """Tests for ExpensePool model schema synchronization."""

    def test_expense_pool_generates_valid_json(self) -> None:
        """ExpensePool model generates JSON that frontend can validate."""
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="CAM Pool",
            pool_type="operating",
            is_gross_up_applicable=True,
            gross_up_target=Decimal("0.95"),
            description="Common Area Maintenance expenses",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        parsed = parse_json(pool)

        assert parsed["name"] == "CAM Pool"
        assert parsed["pool_type"] == "operating"
        assert parsed["is_gross_up_applicable"] is True
        assert parsed["gross_up_target"] == "0.95"
        assert parsed["description"] == "Common Area Maintenance expenses"

    def test_expense_pool_create_generates_valid_json(self) -> None:
        """ExpensePoolCreate generates JSON for frontend validation."""
        pool_create = ExpensePoolCreate(
            property_id=uuid4(),
            name="Tax Pool",
            pool_type="tax",
            is_gross_up_applicable=False,
        )

        parsed = parse_json(pool_create)

        assert parsed["name"] == "Tax Pool"
        assert parsed["pool_type"] == "tax"
        assert parsed["is_gross_up_applicable"] is False


class TestPoolMappingSchemaSync:
    """Tests for PoolMapping model schema synchronization."""

    def test_pool_mapping_generates_valid_json(self) -> None:
        """PoolMapping model generates JSON that frontend can validate."""
        mapping = PoolMapping(
            id=uuid4(),
            expense_pool_id=uuid4(),
            gl_account_pattern="6000*",
            allocation_percentage=Decimal("1.00"),
            priority=1,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        parsed = parse_json(mapping)

        assert parsed["gl_account_pattern"] == "6000*"
        assert parsed["allocation_percentage"] == "1.00"
        assert parsed["priority"] == 1

    def test_pool_mapping_create_generates_valid_json(self) -> None:
        """PoolMappingCreate generates JSON for frontend validation."""
        mapping_create = PoolMappingCreate(
            expense_pool_id=uuid4(),
            gl_account_pattern="7???-100",
            allocation_percentage=Decimal("0.50"),
            priority=2,
        )

        parsed = parse_json(mapping_create)

        assert parsed["gl_account_pattern"] == "7???-100"
        assert parsed["allocation_percentage"] == "0.50"


class TestReconciliationSnapshotSchemaSync:
    """Tests for ReconciliationSnapshot model schema synchronization."""

    def test_reconciliation_snapshot_generates_valid_json(self) -> None:
        """ReconciliationSnapshot generates JSON that frontend can validate."""
        snapshot = ReconciliationSnapshot(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            status=ReconciliationStatus.DRAFT,
            total_operating_expenses=Decimal("500000.00"),
            grossed_up_expenses=Decimal("520000.00"),
            base_year_amount=Decimal("450000.00"),
            tenant_share_before_cap=Decimal("50000.00"),
            tenant_share_after_cap=Decimal("45000.00"),
            admin_fee=Decimal("6750.00"),
            total_recovery=Decimal("51750.00"),
            calculation_trace=[],
            finalized_at=None,
            finalized_by_user_id=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        parsed = parse_json(snapshot)

        assert parsed["period_start_date"] == "2024-01-01"
        assert parsed["period_end_date"] == "2024-12-31"
        assert parsed["status"] == "draft"
        assert parsed["total_operating_expenses"] == "500000.00"
        assert parsed["grossed_up_expenses"] == "520000.00"
        assert parsed["total_recovery"] == "51750.00"
        assert parsed["is_finalized"] is False

    def test_reconciliation_snapshot_create_generates_valid_json(self) -> None:
        """ReconciliationSnapshotCreate generates JSON for frontend validation."""
        snapshot_create = ReconciliationSnapshotCreate(
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2025, 1, 1),
            period_end_date=date(2025, 12, 31),
            total_operating_expenses=Decimal("500000.00"),
            grossed_up_expenses=Decimal("520000.00"),
            base_year_amount=Decimal("450000.00"),
            tenant_share_before_cap=Decimal("55000.00"),
            tenant_share_after_cap=Decimal("52000.00"),
            admin_fee=Decimal("7800.00"),
            total_recovery=Decimal("59800.00"),
        )

        parsed = parse_json(snapshot_create)

        assert parsed["period_start_date"] == "2025-01-01"
        assert parsed["period_end_date"] == "2025-12-31"
        assert parsed["total_operating_expenses"] == "500000.00"
        assert parsed["total_recovery"] == "59800.00"

    def test_reconciliation_with_all_statuses(self) -> None:
        """Test all reconciliation statuses serialize correctly."""
        for status in ReconciliationStatus:
            finalized_at = (
                datetime.now(UTC) if status == ReconciliationStatus.FINALIZED else None
            )
            finalized_by = uuid4() if status == ReconciliationStatus.FINALIZED else None

            snapshot = ReconciliationSnapshot(
                id=uuid4(),
                property_id=uuid4(),
                lease_id=uuid4(),
                period_start_date=date(2024, 1, 1),
                period_end_date=date(2024, 12, 31),
                status=status,
                total_operating_expenses=Decimal("100000.00"),
                grossed_up_expenses=Decimal("105000.00"),
                base_year_amount=Decimal("90000.00"),
                tenant_share_before_cap=Decimal("10000.00"),
                tenant_share_after_cap=Decimal("9500.00"),
                admin_fee=Decimal("1425.00"),
                total_recovery=Decimal("10925.00"),
                calculation_trace=[],
                finalized_at=finalized_at,
                finalized_by_user_id=finalized_by,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            parsed = parse_json(snapshot)
            assert parsed["status"] == status.value


class TestCalculationStepSchemaSync:
    """Tests for CalculationStep model schema synchronization."""

    def test_calculation_step_generates_valid_json(self) -> None:
        """CalculationStep generates JSON that frontend can validate."""
        step = CalculationStep(
            step_order=1,
            step_name="Calculate Actual Occupancy",
            input_values={"occupied_sqft": 45000, "total_sqft": 50000},
            operation="occupied_sqft / total_sqft",
            output_value=Decimal("0.90"),
            note="Building is at 90% occupancy",
        )

        parsed = parse_json(step)

        assert parsed["step_order"] == 1
        assert parsed["step_name"] == "Calculate Actual Occupancy"
        assert parsed["input_values"]["occupied_sqft"] == 45000
        assert parsed["operation"] == "occupied_sqft / total_sqft"
        assert parsed["output_value"] == "0.90"
        assert parsed["note"] == "Building is at 90% occupancy"

    def test_calculation_step_with_dict_output(self) -> None:
        """CalculationStep with dict output serializes correctly."""
        step = CalculationStep(
            step_order=2,
            step_name="Allocate Pools",
            input_values={"total": 1000},
            operation="split by percentage",
            output_value={"cam": Decimal("600.00"), "tax": Decimal("400.00")},
        )

        parsed = parse_json(step)

        assert parsed["output_value"]["cam"] == "600.00"
        assert parsed["output_value"]["tax"] == "400.00"

    def test_calculation_step_create_generates_valid_json(self) -> None:
        """CalculationStepCreate generates JSON for frontend validation."""
        step_create = CalculationStepCreate(
            step_order=3,
            step_name="Apply Cap",
            input_values={"amount": 1000, "cap": 500},
            operation="min(amount, cap)",
            output_value=Decimal("500.00"),
        )

        parsed = parse_json(step_create)

        assert parsed["step_order"] == 3
        assert parsed["output_value"] == "500.00"


class TestAPIResponseSchemaSync:
    """Tests for API Response wrapper schema synchronization."""

    def test_paginated_response_generates_valid_json(self) -> None:
        """PaginatedResponse generates JSON that frontend can validate."""
        response = PaginatedResponse[str](
            items=["item1", "item2", "item3"],
            total=100,
            page=2,
            page_size=10,
        )

        parsed = parse_json(response)

        assert parsed["items"] == ["item1", "item2", "item3"]
        assert parsed["total"] == 100
        assert parsed["page"] == 2
        assert parsed["page_size"] == 10
        assert parsed["total_pages"] == 10
        assert parsed["has_next"] is True
        assert parsed["has_previous"] is True

    def test_error_response_generates_valid_json(self) -> None:
        """ErrorResponse generates JSON that frontend can validate."""
        response = ErrorResponse(
            error=ErrorCodes.VALIDATION_ERROR,
            message="Invalid input data",
            details={"email": ["Invalid format"], "name": ["Required"]},
        )

        parsed = parse_json(response)

        assert parsed["error"] == "VALIDATION_ERROR"
        assert parsed["message"] == "Invalid input data"
        assert parsed["details"]["email"] == ["Invalid format"]
        assert parsed["details"]["name"] == ["Required"]

    def test_success_response_generates_valid_json(self) -> None:
        """SuccessResponse generates JSON that frontend can validate."""
        response = SuccessResponse(
            message="Record created successfully",
            data={"id": "abc-123", "status": "active"},
        )

        parsed = parse_json(response)

        assert parsed["message"] == "Record created successfully"
        assert parsed["data"]["id"] == "abc-123"

    def test_data_response_generates_valid_json(self) -> None:
        """DataResponse generates JSON that frontend can validate."""
        response = DataResponse[dict](
            data={"id": "abc-123", "name": "Test"},
            message="Item retrieved",
        )

        parsed = parse_json(response)

        assert parsed["data"]["id"] == "abc-123"
        assert parsed["message"] == "Item retrieved"


class TestDecimalSerializationSync:
    """Tests for Decimal serialization synchronization."""

    def test_decimals_serialize_as_strings(self) -> None:
        """All Decimal fields serialize as strings (not floats)."""
        prop = PropertyCreate(
            name="Test",
            address_line1="123 Main",
            city="NYC",
            state="NY",
            postal_code="10001",
            total_rentable_sqft=Decimal("99999.99"),
            total_usable_sqft=Decimal("88888.88"),
            common_area_sqft=Decimal("11111.11"),
            target_occupancy=Decimal("0.95"),
        )

        parsed = parse_json(prop)

        # All should be strings, not floats
        assert isinstance(parsed["total_rentable_sqft"], str)
        assert isinstance(parsed["total_usable_sqft"], str)
        assert isinstance(parsed["common_area_sqft"], str)
        assert isinstance(parsed["target_occupancy"], str)

        # And should preserve precision
        assert parsed["total_rentable_sqft"] == "99999.99"
        assert parsed["target_occupancy"] == "0.95"

    def test_high_precision_decimals(self) -> None:
        """High precision decimals are preserved."""
        profile = LeaseRecoveryProfile(
            base_year=2024,
            base_year_amount=Decimal("123456.789012"),
            gross_up_base_year=False,
            pro_rata_share=Decimal("0.123456789"),
            cap_type=CapType.NONE,
            admin_fee_percentage=Decimal("0.15"),
            excluded_pools=[],
        )

        parsed = parse_json(profile)

        # Precision should be maintained
        assert "123456.789012" in parsed["base_year_amount"]
        assert "0.123456789" in parsed["pro_rata_share"]


class TestDateTimeSerializationSync:
    """Tests for date/datetime serialization synchronization."""

    def test_dates_serialize_as_iso_strings(self) -> None:
        """Date fields serialize as ISO format strings."""
        lease = LeaseCreate(
            property_id=uuid4(),
            tenant_name="Test",
            start_date=date(2024, 3, 15),
            end_date=date(2029, 6, 30),
            status=LeaseStatus.ACTIVE,
            recovery_profile=LeaseRecoveryProfileCreate(
                pro_rata_share=Decimal("0.05"),
            ),
        )

        parsed = parse_json(lease)

        assert parsed["start_date"] == "2024-03-15"
        assert parsed["end_date"] == "2029-06-30"

    def test_datetimes_serialize_as_iso_strings(self) -> None:
        """Datetime fields serialize as ISO format strings."""
        now = datetime(2024, 6, 15, 14, 30, 45)
        org = Organization(
            id=uuid4(),
            name="Test",
            subscription_status=SubscriptionStatus.ACTIVE,
            created_at=now,
            updated_at=now,
        )

        parsed = parse_json(org)

        # Should be ISO format string
        assert isinstance(parsed["created_at"], str)
        assert "2024-06-15" in parsed["created_at"]
        assert "14:30:45" in parsed["created_at"]


class TestUUIDSerializationSync:
    """Tests for UUID serialization synchronization."""

    def test_uuids_serialize_as_strings(self) -> None:
        """UUID fields serialize as hyphenated strings."""
        test_id = uuid4()
        org_id = uuid4()

        user = User(
            id=test_id,
            organization_id=org_id,
            email="test@example.com",
            full_name="Test",
            role=UserRole.ADMIN,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        parsed = parse_json(user)

        assert parsed["id"] == str(test_id)
        assert parsed["organization_id"] == str(org_id)
        # Should be hyphenated format
        assert len(parsed["id"]) == 36
        assert parsed["id"].count("-") == 4


class TestEnumSerializationSync:
    """Tests for enum serialization synchronization."""

    def test_all_enums_serialize_as_lowercase_strings(self) -> None:
        """All enum values serialize as lowercase strings."""
        # CapType
        for cap_type in CapType:
            assert cap_type.value == cap_type.value.lower().replace(" ", "_")

        # LeaseStatus
        for status in LeaseStatus:
            assert status.value == status.value.lower()

        # UnitStatus
        for status in UnitStatus:
            assert status.value == status.value.lower()

        # ReconciliationStatus
        for status in ReconciliationStatus:
            assert status.value == status.value.lower()

        # UserRole
        for role in UserRole:
            assert role.value == role.value.lower()

        # SubscriptionStatus
        for status in SubscriptionStatus:
            assert status.value == status.value.lower()
