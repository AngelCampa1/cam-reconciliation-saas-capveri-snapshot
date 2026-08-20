"""Tests for Rent Roll API endpoints.

Tests cover preview and import functionality for rent roll files.
"""

from datetime import UTC, datetime
from io import BytesIO
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.auth.dependencies import OrganizationContext
from app.models.enums import UserRole
from app.models.user import User
from tests.conftest import MockQueryBuilder


class OversizedChunkOnlyUpload:
    """UploadFile test double that fails if code attempts an unbounded read."""

    filename = "large_rent_roll.csv"
    content_type = "text/csv"

    def __init__(self, max_size: int):
        self.max_size = max_size
        self.bytes_served = 0
        self.unbounded_read_attempted = False

    async def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            self.unbounded_read_attempted = True
            raise AssertionError("unbounded read attempted")
        remaining = self.max_size + 1 - self.bytes_served
        if remaining <= 0:
            return b""
        chunk_size = min(size, remaining)
        self.bytes_served += chunk_size
        return b"x" * chunk_size


@pytest.fixture
def org_context() -> OrganizationContext:
    """Organization context for direct endpoint tests."""
    org_id = uuid4()
    return OrganizationContext(
        client=MagicMock(),
        organization_id=org_id,
        user=User(
            id=uuid4(),
            email="admin@example.com",
            organization_id=org_id,
            role=UserRole.ADMIN,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    )


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


class TestRentRollPreview:
    """Tests for POST /rent-roll/preview endpoint."""

    @pytest.mark.asyncio
    async def test_preview_rejects_oversized_file_without_unbounded_read(
        self, org_context
    ):
        """Should reject oversized preview uploads before parsing."""
        from fastapi import HTTPException

        from app.api.v1 import rent_roll

        file = OversizedChunkOnlyUpload(rent_roll.MAX_RENT_ROLL_UPLOAD_SIZE)

        with patch.object(rent_roll, "RentRollImportService") as mock_service:
            with pytest.raises(HTTPException) as exc_info:
                await rent_roll.preview_rent_roll(ctx=org_context, file=file)

        assert exc_info.value.status_code == 400
        assert "File too large" in exc_info.value.detail
        assert file.unbounded_read_attempted is False
        assert file.bytes_served == rent_roll.MAX_RENT_ROLL_UPLOAD_SIZE + 1
        mock_service.return_value.preview.assert_not_called()

    def test_preview_requires_authentication(self, base_client):
        """Unauthenticated requests should fail."""
        csv_content = b"Unit,SF,Tenant\n101,1000,Test"
        file = ("test.csv", BytesIO(csv_content), "text/csv")

        response = base_client.post(
            "/api/v1/rent-roll/preview",
            files={"file": file},
        )

        # Should require auth
        assert response.status_code in [401, 403]

    def test_preview_parses_yardi_file(
        self, org_a_member_client, yardi_rent_roll_bytes
    ):
        """Preview parses Yardi rent roll and returns structured data."""
        file = ("yardi_export.csv", BytesIO(yardi_rent_roll_bytes), "text/csv")

        response = org_a_member_client.post(
            "/api/v1/rent-roll/preview",
            files={"file": file},
        )

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert data["success"] is True
        assert data["source_system"] == "yardi_rent_roll"
        assert "property_metadata" in data
        assert "units" in data
        assert data["row_count"] == 3

        # Check property metadata
        assert data["property_metadata"]["name"] == "Downtown Tower"
        assert data["property_metadata"]["city"] == "Austin"
        assert data["property_metadata"]["state"] == "TX"

    def test_preview_parses_mri_file(self, org_a_member_client, mri_rent_roll_bytes):
        """Preview parses MRI rent roll and returns structured data."""
        file = ("mri_export.csv", BytesIO(mri_rent_roll_bytes), "text/csv")

        response = org_a_member_client.post(
            "/api/v1/rent-roll/preview",
            files={"file": file},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert data["source_system"] == "mri_rent_roll"
        assert data["row_count"] == 3

    def test_preview_returns_unit_data(
        self, org_a_member_client, yardi_rent_roll_bytes
    ):
        """Preview includes detailed unit information."""
        file = ("rent_roll.csv", BytesIO(yardi_rent_roll_bytes), "text/csv")

        response = org_a_member_client.post(
            "/api/v1/rent-roll/preview",
            files={"file": file},
        )

        assert response.status_code == 200
        data = response.json()

        units = data["units"]
        assert len(units) == 3

        # Check occupied unit
        unit_101 = next(u for u in units if u["unit_number"] == "101")
        assert unit_101["rentable_sqft"] == "1500.00"
        assert unit_101["tenant_name"] == "Acme Corporation"
        assert unit_101["lease_start"] == "2024-01-01"

        # Check vacant unit
        unit_103 = next(u for u in units if u["unit_number"] == "103")
        assert unit_103["tenant_name"] is None

    def test_preview_handles_empty_file(self, org_a_member_client):
        """Preview returns error for empty file."""
        file = ("empty.csv", BytesIO(b""), "text/csv")

        response = org_a_member_client.post(
            "/api/v1/rent-roll/preview",
            files={"file": file},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is False
        assert len(data["errors"]) > 0

    def test_preview_returns_summary_stats(
        self, org_a_member_client, yardi_rent_roll_bytes
    ):
        """Preview includes summary statistics."""
        file = ("rent_roll.csv", BytesIO(yardi_rent_roll_bytes), "text/csv")

        response = org_a_member_client.post(
            "/api/v1/rent-roll/preview",
            files={"file": file},
        )

        assert response.status_code == 200
        data = response.json()

        # Summary stats
        assert data["total_units"] == 3
        assert data["occupied_units"] == 2


class TestRentRollImport:
    """Tests for POST /rent-roll/import endpoint."""

    @pytest.mark.asyncio
    async def test_import_rejects_oversized_file_without_unbounded_read(
        self, org_context
    ):
        """Should reject oversized import uploads before parsing or storage."""
        from fastapi import HTTPException

        from app.api.v1 import rent_roll

        file = OversizedChunkOnlyUpload(rent_roll.MAX_RENT_ROLL_UPLOAD_SIZE)
        stripe_service = MagicMock()

        with patch.object(rent_roll, "RentRollImportService") as mock_service:
            with pytest.raises(HTTPException) as exc_info:
                await rent_roll.import_rent_roll(
                    ctx=org_context,
                    admin=org_context.user,
                    stripe_service=stripe_service,
                    file=file,
                )

        assert exc_info.value.status_code == 400
        assert "File too large" in exc_info.value.detail
        assert file.unbounded_read_attempted is False
        assert file.bytes_served == rent_roll.MAX_RENT_ROLL_UPLOAD_SIZE + 1
        mock_service.return_value.preview.assert_not_called()
        mock_service.return_value.import_rent_roll.assert_not_called()

    def test_import_requires_authentication(self, base_client):
        """Unauthenticated requests should fail."""
        csv_content = b"Unit,SF,Tenant\n101,1000,Test"
        file = ("test.csv", BytesIO(csv_content), "text/csv")

        response = base_client.post(
            "/api/v1/rent-roll/import",
            files={"file": file},
        )

        assert response.status_code in [401, 403]

    def test_import_requires_admin_privileges(
        self, org_a_member_client, yardi_rent_roll_bytes
    ):
        """Import requires admin role."""
        file = ("rent_roll.csv", BytesIO(yardi_rent_roll_bytes), "text/csv")

        response = org_a_member_client.post(
            "/api/v1/rent-roll/import",
            files={"file": file},
        )

        assert response.status_code == 403
        assert "Admin privileges required" in response.json()["detail"]

    def test_import_creates_property_and_units(
        self, org_a_admin_client, yardi_rent_roll_bytes
    ):
        """Import creates property, units, and leases in database."""

        # Set up mock database to return UUIDs for inserts
        def mock_table(table_name):
            return MockQueryBuilder(
                data=[
                    {
                        "id": str(uuid4()),
                        "name": "Downtown Tower",
                    }
                ]
            )

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        file = ("rent_roll.csv", BytesIO(yardi_rent_roll_bytes), "text/csv")

        response = org_a_admin_client.post(
            "/api/v1/rent-roll/import",
            files={"file": file},
        )

        assert response.status_code == 201
        data = response.json()

        assert data["success"] is True
        assert data["property_id"] is not None
        assert data["property_name"] == "Downtown Tower"
        assert data["units_created"] == 3
        assert data["leases_created"] == 2

    def test_import_allows_property_metadata_override(
        self, org_a_admin_client, yardi_rent_roll_bytes
    ):
        """Import accepts property metadata overrides."""

        # Set up mock database
        def mock_table(table_name):
            return MockQueryBuilder(data=[{"id": str(uuid4()), "name": "Custom Name"}])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        file = ("rent_roll.csv", BytesIO(yardi_rent_roll_bytes), "text/csv")

        response = org_a_admin_client.post(
            "/api/v1/rent-roll/import",
            files={"file": file},
            data={
                "property_name": "Custom Name",
                "address": "456 Custom St",
                "city": "Houston",
                "state": "TX",
                "postal_code": "77001",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["property_name"] == "Custom Name"

    def test_import_returns_error_for_parse_failure(self, org_a_admin_client):
        """Import returns error when file parsing fails."""
        file = ("empty.csv", BytesIO(b""), "text/csv")

        response = org_a_admin_client.post(
            "/api/v1/rent-roll/import",
            files={"file": file},
        )

        assert response.status_code == 400
        data = response.json()
        assert "detail" in data

    def test_import_returns_warnings(self, org_a_admin_client):
        """Import includes warnings in response."""
        # File with data but some warning-worthy content
        csv_content = b"""Yardi Rent Roll Report
Property: Test Building
Address: 100 Test St, Austin, TX 78701

Unit,Suite SF,Usable SF,Floor,Tenant Name,Lease Start,Lease End,Monthly Rent
101,1000.00,900.00,1,Acme Corp,01/01/2024,12/31/2026,2500.00
"""

        # Set up mock database
        def mock_table(table_name):
            return MockQueryBuilder(data=[{"id": str(uuid4())}])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        file = ("rent_roll.csv", BytesIO(csv_content), "text/csv")

        response = org_a_admin_client.post(
            "/api/v1/rent-roll/import",
            files={"file": file},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
