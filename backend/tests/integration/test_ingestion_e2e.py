"""Integration tests for data ingestion pipeline (mocked database).

Tests the complete ingestion workflow from file upload through batch
tracking to GL entries creation using mocked database infrastructure.

For true e2e tests with real database, see test_ingestion_e2e_real.py
"""

from __future__ import annotations

import hashlib
from decimal import Decimal
from io import BytesIO
from pathlib import Path

import pytest
from fastapi import status

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"

pytestmark = pytest.mark.integration


@pytest.mark.integration
class TestYardiGLIngestionE2E:
    """End-to-end tests for Yardi GL ingestion workflow."""

    @pytest.fixture
    def client(self, ingestion_client):
        """Test client with organization context and ingestion infrastructure."""
        return ingestion_client

    @pytest.fixture
    def property_id(self, org_a_property):
        """Property ID for testing."""
        return org_a_property["id"]

    @pytest.fixture
    def yardi_gl_file(self):
        """Load Yardi GL fixture file."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"
        with open(fixture_path, "rb") as f:
            content = f.read()
        return BytesIO(content)

    @pytest.fixture
    def yardi_gl_hash(self):
        """SHA256 hash of the Yardi GL fixture."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"
        with open(fixture_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()

    def test_yardi_gl_complete_workflow(
        self,
        client,
        property_id,
        yardi_gl_file,
        yardi_gl_hash,
    ):
        """Test complete Yardi GL ingestion workflow.

        Workflow:
        1. Upload CSV file
        2. Verify import_batches record created
        3. Verify GL entries created
        4. Verify data quality (correct types, organization_id, property_id)
        5. Verify duplicate detection
        """
        # Step 1: Upload file
        response = client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("gl_export.csv", yardi_gl_file, "text/csv")},
            data={"property_id": property_id},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "batch_id" in data
        batch_id = data["batch_id"]

        # Step 2: Verify import_batches record via mock client
        # Access the mock client from the test client fixture
        client_db = client.mock_supabase

        batch_response = (
            client_db.table("import_batches")
            .select("*")
            .eq("id", batch_id)
            .single()
            .execute()
        )

        assert batch_response.data is not None
        batch = batch_response.data
        assert batch["status"] == "completed"
        assert batch["source_system"] == "yardi"
        assert batch["row_count"] > 0
        assert batch["error_count"] == 0
        assert batch["file_hash"] == yardi_gl_hash

        # Step 3: Verify GL entries created
        entries_response = (
            client_db.table("gl_entries")
            .select("*")
            .eq("import_batch_id", batch_id)
            .execute()
        )

        assert len(entries_response.data) > 0
        assert len(entries_response.data) == batch["row_count"]

        # Step 4: Verify data quality
        first_entry = entries_response.data[0]
        # NOTE: organization_id NOT in gl_entries table - scoped via property_id
        assert first_entry["property_id"] == property_id
        assert "account_code" in first_entry
        assert first_entry["account_code"] is not None
        assert "amount" in first_entry
        # Amount serialized as string for Decimal precision; PostgreSQL NUMERIC
        # auto-casts on insert. Mock DB returns str, real DB returns numeric.
        assert isinstance(first_entry["amount"], str)
        assert "transaction_date" in first_entry
        assert first_entry["transaction_date"] is not None

        # Step 5: Verify duplicate detection
        yardi_gl_file.seek(0)  # Reset file pointer
        duplicate_response = client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("gl_export.csv", yardi_gl_file, "text/csv")},
            data={"property_id": property_id},
        )

        assert duplicate_response.status_code == status.HTTP_409_CONFLICT
        detail = duplicate_response.json()["detail"]
        if isinstance(detail, dict):
            assert "already been imported" in detail.get("message", "").lower()
        else:
            assert (
                "already been imported" in detail.lower()
                or "duplicate" in detail.lower()
            )

    def test_yardi_gl_source_detection(
        self,
        client,
        property_id,
        yardi_gl_file,
    ):
        """Verify file fingerprinting correctly identifies Yardi source."""
        response = client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("yardi_export.csv", yardi_gl_file, "text/csv")},
            data={"property_id": property_id},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Check that source was detected
        # Access the mock client from the test client fixture
        client_db = client.mock_supabase
        batch_response = (
            client_db.table("import_batches")
            .select("source_system")
            .eq("id", data["batch_id"])
            .single()
            .execute()
        )

        assert batch_response.data["source_system"] == "yardi"


@pytest.mark.integration
class TestMRIRentRollIngestionE2E:
    """End-to-end tests for MRI Rent Roll ingestion workflow."""

    @pytest.fixture
    def client(self, ingestion_client):
        """Test client with organization context and ingestion infrastructure."""
        return ingestion_client

    @pytest.fixture
    def property_id(self, org_a_property):
        """Property ID for testing."""
        return org_a_property["id"]

    @pytest.fixture
    def mri_rentroll_file(self):
        """Load MRI Rent Roll fixture file."""
        fixture_path = FIXTURES_DIR / "mri" / "rent_roll_standard.csv"
        with open(fixture_path, "rb") as f:
            content = f.read()
        return BytesIO(content)

    def test_mri_rentroll_complete_workflow(
        self,
        client,
        property_id,
        mri_rentroll_file,
    ):
        """Test complete MRI Rent Roll ingestion workflow."""
        # Upload file
        response = client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("mri_rentroll.csv", mri_rentroll_file, "text/csv")},
            data={"property_id": property_id},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "batch_id" in data
        batch_id = data["batch_id"]

        # Verify batch record
        # Access the mock client from the test client fixture
        client_db = client.mock_supabase
        batch_response = (
            client_db.table("import_batches")
            .select("*")
            .eq("id", batch_id)
            .single()
            .execute()
        )

        assert batch_response.data is not None
        batch = batch_response.data
        assert batch["status"] == "completed"
        assert batch["source_system"] == "mri"
        assert batch["row_count"] > 0

        # Verify GL entries
        entries_response = (
            client_db.table("gl_entries")
            .select("*")
            .eq("import_batch_id", batch_id)
            .execute()
        )

        assert len(entries_response.data) > 0

    def test_mri_source_detection(
        self,
        client,
        property_id,
        mri_rentroll_file,
    ):
        """Verify file fingerprinting correctly identifies MRI source."""
        response = client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("mri_export.csv", mri_rentroll_file, "text/csv")},
            data={"property_id": property_id},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Verify source system
        # Access the mock client from the test client fixture
        client_db = client.mock_supabase
        batch_response = (
            client_db.table("import_batches")
            .select("source_system")
            .eq("id", data["batch_id"])
            .single()
            .execute()
        )

        assert batch_response.data["source_system"] == "mri"


@pytest.mark.integration
class TestErrorHandlingE2E:
    """End-to-end tests for error handling during ingestion."""

    @pytest.fixture
    def client(self, ingestion_client):
        """Test client with organization context and ingestion infrastructure."""
        return ingestion_client

    @pytest.fixture
    def property_id(self, org_a_property):
        """Property ID for testing."""
        return org_a_property["id"]

    def test_empty_file_rejection(self, client, property_id):
        """Verify empty files are rejected."""
        empty_file = BytesIO(b"")

        response = client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("empty.csv", empty_file, "text/csv")},
            data={"property_id": property_id},
        )

        # Should reject with 400 or 422
        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]

    def test_missing_columns_rejection(self, client, property_id):
        """Verify files with missing values in rows are handled gracefully."""
        fixture_path = FIXTURES_DIR / "malformed" / "structural_missing_columns.csv"

        with open(fixture_path, "rb") as f:
            content = f.read()

        malformed_file = BytesIO(content)

        response = client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("malformed.csv", malformed_file, "text/csv")},
            data={"property_id": property_id},
        )

        # File has all required columns but some rows have missing values
        # Parser should accept the file and handle missing values gracefully
        assert response.status_code == status.HTTP_200_OK

    def test_invalid_property_id(self, client):
        """Verify invalid property_id is rejected."""
        valid_file = BytesIO(b"Account,Amount,Date\n1000,100.00,2024-01-01\n")

        response = client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("test.csv", valid_file, "text/csv")},
            data={"property_id": "nonexistent-property-id"},
        )

        # Should reject with 400, 404, or 422
        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]


@pytest.mark.integration
class TestDataQualityE2E:
    """End-to-end tests for data quality during ingestion."""

    @pytest.fixture
    def client(self, ingestion_client):
        """Test client with organization context and ingestion infrastructure."""
        return ingestion_client

    @pytest.fixture
    def property_id(self, org_a_property):
        """Property ID for testing."""
        return org_a_property["id"]

    def test_currency_formats_handled(self, client, property_id):
        """Verify various currency formats are cleaned correctly.

        Exercises the full upload, parse, validation, and persistence path rather
        than only the lower-level currency cleaner.
        """
        # Create CSV with various currency formats in Yardi format
        csv_content = b"""Yardi Voyager GL Detail
Account,Description,Amount,Date,Period
1000,Test Entry 1,"$1,234.56",2024-01-01,01/2024
2000,Test Entry 2,(500.00),2024-01-02,01/2024
3000,Test Entry 3,750.00 CR,2024-01-03,01/2024
4000,Test Entry 4,"  $250.00  ",2024-01-04,01/2024
"""
        currency_file = BytesIO(csv_content)

        response = client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("yardi_currency_test.csv", currency_file, "text/csv")},
            data={"property_id": property_id},
        )

        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()

        # Verify entries were created with cleaned amounts
        # Access the mock client from the test client fixture
        client_db = client.mock_supabase
        entries_response = (
            client_db.table("gl_entries")
            .select("account_code, amount")
            .eq("import_batch_id", data["batch_id"])
            .order("account_code")
            .execute()
        )

        entries = entries_response.data
        assert len(entries) == 4

        # Verify amounts were cleaned:
        # $1,234.56 -> 1234.56
        # (500.00) -> -500.00
        # 750.00 CR -> -750.00
        # $250.00 -> 250.00
        amounts_by_account = {
            entry["account_code"]: Decimal(str(entry["amount"])) for entry in entries
        }
        assert amounts_by_account == {
            "1000": Decimal("1234.56"),
            "2000": Decimal("-500.0"),
            "3000": Decimal("-750.0"),
            "4000": Decimal("250.0"),
        }
