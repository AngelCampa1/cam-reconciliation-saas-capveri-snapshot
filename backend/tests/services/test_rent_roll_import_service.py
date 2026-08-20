"""Tests for Rent Roll Import Service.

Tests cover file detection, preview, import, and error handling.
"""

from decimal import Decimal
from io import BytesIO
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.services.rent_roll_import import RentRollImportResult, RentRollImportService


@pytest.fixture
def service() -> RentRollImportService:
    """Create import service instance."""
    return RentRollImportService()


@pytest.fixture
def yardi_rent_roll_bytes() -> bytes:
    """Sample Yardi rent roll file."""
    return b"""Yardi Voyager Rent Roll Report
Property: Downtown Tower
Address: 123 Main Street, Austin, TX 78701

Unit,Suite SF,Usable SF,Floor,Tenant Name,Lease Start,Lease End,Monthly Rent,Pro Rata Share
101,1500.00,1350.00,1,Acme Corporation,01/01/2024,12/31/2026,3500.00,0.0523
102,2000.00,1800.00,1,Beta Industries,03/15/2023,03/14/2026,4200.00,0.0698
103,1000.00,900.00,1,,,,,0.0349
"""


@pytest.fixture
def mri_rent_roll_bytes() -> bytes:
    """Sample MRI rent roll file."""
    return b"""MRI Software Rent Roll
Property Name: Downtown Tower
Address: 123 Main Street
City: Austin
State: TX
Zip: 78701

Unit Code,RSF,USF,Floor,Tenant Name,Start Date,End Date,Base Rent,CAM %
101,1500.00,1350.00,1,Acme Corporation,2024-01-01,2026-12-31,3500.00,5.23
102,2000.00,1800.00,1,Beta Industries,2023-03-15,2026-03-14,4200.00,6.98
103,1000.00,900.00,1,,,,,3.49
"""


@pytest.fixture
def mock_db() -> MagicMock:
    """Create a mock Supabase client that returns UUIDs for inserts."""
    mock = MagicMock()

    # Track table calls to return correct UUIDs per table
    def mock_table(table_name):
        table_mock = MagicMock()

        def mock_insert(data):
            insert_mock = MagicMock()

            def mock_execute():
                exec_mock = MagicMock()
                exec_mock.data = [{"id": str(uuid4())}]
                return exec_mock

            insert_mock.execute = mock_execute
            return insert_mock

        table_mock.insert = mock_insert
        return table_mock

    mock.table = mock_table
    return mock


class TestPreview:
    """Tests for preview functionality."""

    def test_preview_detects_yardi_format(
        self, service: RentRollImportService, yardi_rent_roll_bytes: bytes
    ) -> None:
        """Preview correctly detects Yardi format."""
        file = BytesIO(yardi_rent_roll_bytes)
        result = service.preview(file, "yardi_rent_roll.csv")

        assert result.source_system == "yardi_rent_roll"
        assert result.success is True

    def test_preview_detects_mri_format(
        self, service: RentRollImportService, mri_rent_roll_bytes: bytes
    ) -> None:
        """Preview correctly detects MRI format."""
        file = BytesIO(mri_rent_roll_bytes)
        result = service.preview(file, "mri_export.csv")

        assert result.source_system == "mri_rent_roll"
        assert result.success is True

    def test_preview_extracts_property_metadata(
        self, service: RentRollImportService, yardi_rent_roll_bytes: bytes
    ) -> None:
        """Preview extracts property name and address."""
        file = BytesIO(yardi_rent_roll_bytes)
        result = service.preview(file, "rent_roll.csv")

        assert result.property_metadata.name == "Downtown Tower"
        assert result.property_metadata.address_line1 == "123 Main Street"
        assert result.property_metadata.city == "Austin"
        assert result.property_metadata.state == "TX"
        assert result.property_metadata.postal_code == "78701"

    def test_preview_parses_units(
        self, service: RentRollImportService, yardi_rent_roll_bytes: bytes
    ) -> None:
        """Preview extracts unit data."""
        file = BytesIO(yardi_rent_roll_bytes)
        result = service.preview(file, "rent_roll.csv")

        assert len(result.units) == 3
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        assert unit_101.rentable_sqft == Decimal("1500.00")
        assert unit_101.tenant_name == "Acme Corporation"

    def test_preview_identifies_vacant_units(
        self, service: RentRollImportService, yardi_rent_roll_bytes: bytes
    ) -> None:
        """Preview identifies vacant units."""
        file = BytesIO(yardi_rent_roll_bytes)
        result = service.preview(file, "rent_roll.csv")

        vacant_units = [u for u in result.units if u.tenant_name is None]
        assert len(vacant_units) == 1
        assert vacant_units[0].unit_number == "103"

    def test_preview_handles_empty_file(self, service: RentRollImportService) -> None:
        """Preview returns error for empty file."""
        file = BytesIO(b"")
        result = service.preview(file, "empty.csv")

        assert result.success is False
        assert len(result.errors) > 0

    def test_preview_falls_back_to_generic_parser(
        self, service: RentRollImportService
    ) -> None:
        """Preview uses generic parser when format not recognized."""
        csv_content = b"""Unit,SF,Tenant
101,1000,Acme Corp
102,1500,Beta Inc
"""
        file = BytesIO(csv_content)
        result = service.preview(file, "custom_report.csv")

        assert result.source_system == "generic_rent_roll"
        assert len(result.units) == 2


class TestImport:
    """Tests for import functionality."""

    def test_import_creates_property(
        self,
        service: RentRollImportService,
        yardi_rent_roll_bytes: bytes,
        mock_db: MagicMock,
    ) -> None:
        """Import creates a new property with correct metadata."""
        file = BytesIO(yardi_rent_roll_bytes)
        org_id = uuid4()

        result = service.import_rent_roll(
            file=file,
            file_name="rent_roll.csv",
            organization_id=org_id,
            db=mock_db,
        )

        assert isinstance(result, RentRollImportResult)
        assert result.success is True
        assert result.property_id is not None
        assert result.property_name == "Downtown Tower"

    def test_import_creates_units(
        self,
        service: RentRollImportService,
        yardi_rent_roll_bytes: bytes,
        mock_db: MagicMock,
    ) -> None:
        """Import creates units from rent roll data."""
        file = BytesIO(yardi_rent_roll_bytes)
        org_id = uuid4()

        result = service.import_rent_roll(
            file=file,
            file_name="rent_roll.csv",
            organization_id=org_id,
            db=mock_db,
        )

        assert result.units_created == 3

    def test_import_creates_leases_for_occupied_units(
        self,
        service: RentRollImportService,
        yardi_rent_roll_bytes: bytes,
        mock_db: MagicMock,
    ) -> None:
        """Import creates leases only for occupied units."""
        file = BytesIO(yardi_rent_roll_bytes)
        org_id = uuid4()

        result = service.import_rent_roll(
            file=file,
            file_name="rent_roll.csv",
            organization_id=org_id,
            db=mock_db,
        )

        # 2 occupied units should have leases
        assert result.leases_created == 2

    def test_import_skips_leases_without_dates(
        self, service: RentRollImportService, mock_db: MagicMock
    ) -> None:
        """Import skips lease creation when dates are missing."""
        # Tenant name but no dates
        csv_content = b"""Yardi Rent Roll
Property: Test Building
Address: 100 Test St, Austin, TX 78701

Unit,Suite SF,Usable SF,Floor,Tenant Name,Lease Start,Lease End,Monthly Rent
101,1000,900,1,Acme Corp,,,$2500
"""
        file = BytesIO(csv_content)
        org_id = uuid4()

        result = service.import_rent_roll(
            file=file,
            file_name="rent_roll.csv",
            organization_id=org_id,
            db=mock_db,
        )

        # Unit created but no lease (missing dates)
        assert result.units_created == 1
        assert result.leases_created == 0

    def test_import_allows_property_metadata_override(
        self,
        service: RentRollImportService,
        yardi_rent_roll_bytes: bytes,
        mock_db: MagicMock,
    ) -> None:
        """Import allows overriding detected property metadata."""
        file = BytesIO(yardi_rent_roll_bytes)
        org_id = uuid4()

        result = service.import_rent_roll(
            file=file,
            file_name="rent_roll.csv",
            organization_id=org_id,
            db=mock_db,
            property_name_override="Custom Tower Name",
        )

        assert result.property_name == "Custom Tower Name"

    def test_import_handles_parse_error(self, service: RentRollImportService) -> None:
        """Import returns error when file cannot be parsed."""
        file = BytesIO(b"")
        org_id = uuid4()
        mock_db = MagicMock()

        result = service.import_rent_roll(
            file=file,
            file_name="empty.csv",
            organization_id=org_id,
            db=mock_db,
        )

        assert result.success is False
        assert len(result.errors) > 0


class TestParserSelection:
    """Tests for parser selection logic."""

    def test_selects_yardi_for_yardi_content(
        self, service: RentRollImportService, yardi_rent_roll_bytes: bytes
    ) -> None:
        """Selects Yardi parser for Yardi content."""
        file = BytesIO(yardi_rent_roll_bytes)
        result = service.preview(file, "export.csv")
        assert result.source_system == "yardi_rent_roll"

    def test_selects_mri_for_mri_content(
        self, service: RentRollImportService, mri_rent_roll_bytes: bytes
    ) -> None:
        """Selects MRI parser for MRI content."""
        file = BytesIO(mri_rent_roll_bytes)
        result = service.preview(file, "export.csv")
        assert result.source_system == "mri_rent_roll"

    def test_selects_generic_for_unknown_content(
        self, service: RentRollImportService
    ) -> None:
        """Selects generic parser for unrecognized content."""
        csv_content = b"""Space,Area,Occupant
A-101,1000,Tenant A
A-102,1500,Tenant B
"""
        file = BytesIO(csv_content)
        result = service.preview(file, "custom.csv")
        assert result.source_system == "generic_rent_roll"

    def test_yardi_wins_over_generic_for_yardi_file(
        self, service: RentRollImportService
    ) -> None:
        """Yardi parser has higher score than generic for Yardi files."""
        csv_content = b"""Yardi Rent Roll Report
Property: Test Building

Unit,Suite SF,Tenant
101,1000,Test Tenant
"""
        file = BytesIO(csv_content)
        result = service.preview(file, "export.csv")
        # Should pick Yardi, not generic
        assert result.source_system == "yardi_rent_roll"


class TestImportEdgeCases:
    """Tests for edge cases in import logic."""

    def test_import_fails_when_no_units_parsed(
        self, service: RentRollImportService, mock_db: MagicMock
    ) -> None:
        """Import returns error when parser succeeds but no units found."""
        # CSV with only headers - no actual data rows
        csv_content = b"Unit,Suite SF,Tenant\n"
        file = BytesIO(csv_content)
        org_id = uuid4()

        result = service.import_rent_roll(
            file=file,
            file_name="empty_units.csv",
            organization_id=org_id,
            db=mock_db,
        )

        assert result.success is False
        assert any("No units" in e for e in result.errors)

    def test_import_adjusts_usable_sqft_when_greater_than_rentable(
        self, service: RentRollImportService, mock_db: MagicMock
    ) -> None:
        """Import adjusts usable sqft to 90% of rentable when usable > rentable."""
        # Units where usable > rentable (data anomaly)
        csv_content = b"""Yardi Rent Roll
Property: Test Building
Address: 123 Test St, Austin, TX 78701

Unit,Suite SF,Usable SF,Tenant Name,Lease Start,Lease End,Monthly Rent
101,1000.00,1200.00,Acme Corp,01/01/2024,12/31/2026,2500.00
"""
        file = BytesIO(csv_content)
        org_id = uuid4()

        result = service.import_rent_roll(
            file=file,
            file_name="test.csv",
            organization_id=org_id,
            db=mock_db,
        )

        # Should succeed (anomaly corrected internally)
        assert result.success is True

    def test_import_catches_db_exception_and_translates(
        self, service: RentRollImportService
    ) -> None:
        """Import catches DB exception and returns translated error."""
        csv_content = b"""Yardi Rent Roll
Property: Test Building
Address: 123 Test St, Austin, TX 78701

Unit,Suite SF,Tenant Name,Lease Start,Lease End,Monthly Rent
101,1000.00,Acme Corp,01/01/2024,12/31/2026,2500.00
"""
        file = BytesIO(csv_content)
        org_id = uuid4()

        # Mock DB that raises an exception on insert
        bad_db = MagicMock()
        bad_db.table.return_value.insert.return_value.execute.side_effect = Exception(
            "unique_unit_per_property constraint violated"
        )

        result = service.import_rent_roll(
            file=file,
            file_name="test.csv",
            organization_id=org_id,
            db=bad_db,
        )

        assert result.success is False
        assert len(result.errors) > 0
        # Error should be translated to user-friendly message
        assert "Duplicate unit" in result.errors[0]

    def test_import_unknown_db_error_uses_prefix(
        self, service: RentRollImportService
    ) -> None:
        """Unknown DB error uses generic prefix."""
        assert service._translate_db_error("some_unknown_error_key") == (
            "Import failed: some_unknown_error_key"
        )

    def test_create_property_raises_when_no_data_returned(
        self, service: RentRollImportService
    ) -> None:
        """_create_property raises ValueError when DB returns empty data."""
        mock_db = MagicMock()
        mock_db.table.return_value.insert.return_value.execute.return_value.data = []

        with pytest.raises(ValueError, match="Failed to create property"):
            service._create_property(
                db=mock_db,
                organization_id=uuid4(),
                name="Test",
                address_line1="123 Main",
                city="Austin",
                state="TX",
                postal_code="78701",
                total_rentable_sqft=__import__("decimal").Decimal("1000"),
                total_usable_sqft=__import__("decimal").Decimal("900"),
            )

    def test_create_unit_raises_when_no_data_returned(
        self, service: RentRollImportService
    ) -> None:
        """_create_unit raises ValueError when DB returns empty data."""
        mock_db = MagicMock()
        mock_db.table.return_value.insert.return_value.execute.return_value.data = []

        with pytest.raises(ValueError, match="Failed to create unit"):
            service._create_unit(
                db=mock_db,
                property_id=uuid4(),
                unit_number="101",
                rentable_sqft=__import__("decimal").Decimal("1000"),
                usable_sqft=__import__("decimal").Decimal("900"),
                floor=1,
                is_occupied=False,
            )

    def test_create_lease_raises_when_no_data_returned(
        self, service: RentRollImportService
    ) -> None:
        """_create_lease raises ValueError when DB returns empty data."""
        from datetime import date

        mock_db = MagicMock()
        mock_db.table.return_value.insert.return_value.execute.return_value.data = []

        with pytest.raises(ValueError, match="Failed to create lease"):
            service._create_lease(
                db=mock_db,
                property_id=uuid4(),
                unit_id=uuid4(),
                tenant_name="Acme Corp",
                start_date=date(2024, 1, 1),
                end_date=date(2026, 12, 31),
                pro_rata_share=__import__("decimal").Decimal("0.05"),
            )
