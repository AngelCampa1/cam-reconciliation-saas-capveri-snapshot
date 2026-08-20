"""Tests for File Upload Endpoint.

Tests the data ingestion upload endpoint including:
- POST /api/v1/ingestion/upload accepts multipart file
- Returns batch ID and row count on success
- Source detection reported to user
- Duplicate files return 409 with details
- Batch status retrieval
"""

import io
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from app.api.v1.ingestion import router
from app.auth.dependencies import (
    OrganizationContext,
    get_org_scoped_context,
)
from app.models.user import User
from app.services.ingestion.validation import GLValidationResult

# Test data fixtures
SAMPLE_ORG_ID = uuid4()
SAMPLE_USER_ID = uuid4()
SAMPLE_PROPERTY_ID = uuid4()
SAMPLE_BATCH_ID = uuid4()


def create_test_user() -> User:
    """Create a test user."""
    return User(
        id=SAMPLE_USER_ID,
        organization_id=SAMPLE_ORG_ID,
        email="test@example.com",
        full_name="Test User",
        role="member",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def create_mock_org_context() -> OrganizationContext:
    """Create a mock organization context."""
    mock_client = MagicMock()
    return OrganizationContext(
        client=mock_client,
        organization_id=SAMPLE_ORG_ID,
        user=create_test_user(),
    )


@pytest.fixture
def app():
    """Create a FastAPI test app with ingestion router."""
    test_app = FastAPI()
    test_app.include_router(router, prefix="/api/v1/ingestion")
    return test_app


@pytest.fixture
def client(app):
    """Create a test client with mocked auth."""
    app.dependency_overrides[get_org_scoped_context] = create_mock_org_context
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def sample_csv_content():
    """Sample CSV file content for testing."""
    return b"""Account Code,Description,Amount,Date
6000,Utilities,1000.00,2024-01-15
6100,Janitorial,500.00,2024-01-20
6200,Insurance,2000.00,2024-01-25"""


class TestUploadEndpoint:
    """Tests for POST /api/v1/ingestion/upload."""

    @pytest.fixture(autouse=True)
    def mock_gl_persistence(self):
        """Isolate endpoint behavior from GL persistence validation."""
        with patch("app.api.v1.ingestion.persist_gl_entries") as mock_persist:
            mock_persist.return_value = (
                3,
                GLValidationResult(valid_count=3, invalid_count=0),
            )
            yield mock_persist

    def test_accepts_multipart_file(self, client, sample_csv_content):
        """AC1: POST /api/v1/ingestion/upload accepts multipart file."""
        with (
            patch("app.api.v1.ingestion.compute_file_hash") as mock_hash,
            patch("app.api.v1.ingestion.check_duplicate") as mock_check,
            patch("app.api.v1.ingestion.get_dispatcher") as mock_dispatcher,
            patch("app.api.v1.ingestion.create_batch") as mock_create,
            patch("app.api.v1.ingestion.update_batch_status"),
        ):
            # Setup mocks
            mock_hash.return_value = "abc123hash"
            mock_check.return_value = None  # No duplicate

            mock_parser = MagicMock()
            mock_parser.parse.return_value = MagicMock(
                success=True,
                row_count=3,
                error_count=0,
                errors=[],
                warnings=[],
            )

            mock_fingerprint = MagicMock()
            mock_fingerprint.source_system = "generic"
            mock_fingerprint.confidence = 0.8

            mock_dispatcher.return_value.get_parser.return_value = (
                mock_parser,
                mock_fingerprint,
            )

            mock_batch = MagicMock()
            mock_batch.id = SAMPLE_BATCH_ID
            mock_create.return_value = mock_batch

            # Make request with file upload
            files = {"file": ("test.csv", io.BytesIO(sample_csv_content), "text/csv")}
            data = {"property_id": str(SAMPLE_PROPERTY_ID)}

            response = client.post("/api/v1/ingestion/upload", files=files, data=data)

            assert response.status_code == status.HTTP_200_OK

    def test_returns_batch_id_and_row_count(self, client, sample_csv_content):
        """AC2: Returns batch ID and row count on success."""
        with (
            patch("app.api.v1.ingestion.compute_file_hash") as mock_hash,
            patch("app.api.v1.ingestion.check_duplicate") as mock_check,
            patch("app.api.v1.ingestion.get_dispatcher") as mock_dispatcher,
            patch("app.api.v1.ingestion.create_batch") as mock_create,
            patch("app.api.v1.ingestion.update_batch_status"),
        ):
            mock_hash.return_value = "abc123hash"
            mock_check.return_value = None

            mock_parser = MagicMock()
            mock_parser.parse.return_value = MagicMock(
                success=True,
                row_count=3,
                error_count=0,
                errors=[],
                warnings=["Sample warning"],
            )

            mock_fingerprint = MagicMock()
            mock_fingerprint.source_system = "yardi"
            mock_fingerprint.confidence = 0.95

            mock_dispatcher.return_value.get_parser.return_value = (
                mock_parser,
                mock_fingerprint,
            )

            mock_batch = MagicMock()
            mock_batch.id = SAMPLE_BATCH_ID
            mock_create.return_value = mock_batch

            files = {"file": ("test.csv", io.BytesIO(sample_csv_content), "text/csv")}
            data = {"property_id": str(SAMPLE_PROPERTY_ID)}

            response = client.post("/api/v1/ingestion/upload", files=files, data=data)

            assert response.status_code == status.HTTP_200_OK
            result = response.json()
            assert "batch_id" in result
            assert result["batch_id"] == str(SAMPLE_BATCH_ID)
            assert result["row_count"] == 3

    def test_reports_source_detection(self, client, sample_csv_content):
        """AC3: Source detection reported to user."""
        with (
            patch("app.api.v1.ingestion.compute_file_hash") as mock_hash,
            patch("app.api.v1.ingestion.check_duplicate") as mock_check,
            patch("app.api.v1.ingestion.get_dispatcher") as mock_dispatcher,
            patch("app.api.v1.ingestion.create_batch") as mock_create,
            patch("app.api.v1.ingestion.update_batch_status"),
        ):
            mock_hash.return_value = "abc123hash"
            mock_check.return_value = None

            mock_parser = MagicMock()
            mock_parser.parse.return_value = MagicMock(
                success=True,
                row_count=3,
                error_count=0,
                errors=[],
                warnings=[],
            )

            mock_fingerprint = MagicMock()
            mock_fingerprint.source_system = "mri"
            mock_fingerprint.confidence = 0.9

            mock_dispatcher.return_value.get_parser.return_value = (
                mock_parser,
                mock_fingerprint,
            )

            mock_batch = MagicMock()
            mock_batch.id = SAMPLE_BATCH_ID
            mock_create.return_value = mock_batch

            files = {
                "file": ("mri_export.csv", io.BytesIO(sample_csv_content), "text/csv")
            }
            data = {"property_id": str(SAMPLE_PROPERTY_ID)}

            response = client.post("/api/v1/ingestion/upload", files=files, data=data)

            assert response.status_code == status.HTTP_200_OK
            result = response.json()
            assert result["source_system"] == "mri"
            assert result["source_confidence"] == 0.9

    def test_duplicate_file_returns_409(self, client, sample_csv_content):
        """AC4: Duplicate files return 409 with details."""
        with (
            patch("app.api.v1.ingestion.compute_file_hash") as mock_hash,
            patch("app.api.v1.ingestion.check_duplicate") as mock_check,
        ):
            mock_hash.return_value = "duplicate_hash"

            # Simulate duplicate found
            existing_batch = MagicMock()
            existing_batch.id = uuid4()
            existing_batch.created_at = datetime.now(UTC)
            mock_check.return_value = existing_batch

            files = {"file": ("test.csv", io.BytesIO(sample_csv_content), "text/csv")}
            data = {"property_id": str(SAMPLE_PROPERTY_ID)}

            response = client.post("/api/v1/ingestion/upload", files=files, data=data)

            assert response.status_code == status.HTTP_409_CONFLICT
            result = response.json()
            assert "detail" in result
            assert "existing_batch_id" in result["detail"]
            assert "imported_at" in result["detail"]
            mock_check.assert_called_once_with(
                SAMPLE_ORG_ID,
                "duplicate_hash",
                allow_failed_reimport=False,
            )

    def test_allows_source_override(self, client, sample_csv_content):
        """Allows manual source override."""
        with (
            patch("app.api.v1.ingestion.compute_file_hash") as mock_hash,
            patch("app.api.v1.ingestion.check_duplicate") as mock_check,
            patch("app.api.v1.ingestion.get_dispatcher") as mock_dispatcher,
            patch("app.api.v1.ingestion.create_batch") as mock_create,
            patch("app.api.v1.ingestion.update_batch_status"),
        ):
            mock_hash.return_value = "abc123hash"
            mock_check.return_value = None

            mock_parser = MagicMock()
            mock_parser.parse.return_value = MagicMock(
                success=True,
                row_count=3,
                error_count=0,
                errors=[],
                warnings=[],
            )

            mock_fingerprint = MagicMock()
            mock_fingerprint.source_system = "yardi"
            mock_fingerprint.confidence = 1.0

            mock_dispatcher.return_value.get_parser.return_value = (
                mock_parser,
                mock_fingerprint,
            )

            mock_batch = MagicMock()
            mock_batch.id = SAMPLE_BATCH_ID
            mock_create.return_value = mock_batch

            files = {"file": ("test.csv", io.BytesIO(sample_csv_content), "text/csv")}
            data = {
                "property_id": str(SAMPLE_PROPERTY_ID),
                "source_override": "yardi",
            }

            response = client.post("/api/v1/ingestion/upload", files=files, data=data)

            assert response.status_code == status.HTTP_200_OK
            # Verify override was passed to dispatcher
            mock_dispatcher.return_value.get_parser.assert_called()
            call_args = mock_dispatcher.return_value.get_parser.call_args
            assert (
                call_args[1].get("source_override") == "yardi"
                or call_args[0][2] == "yardi"
            )

    def test_parse_failure_returns_422(self, client, sample_csv_content):
        """Parse failures return 422 with error details."""
        with (
            patch("app.api.v1.ingestion.compute_file_hash") as mock_hash,
            patch("app.api.v1.ingestion.check_duplicate") as mock_check,
            patch("app.api.v1.ingestion.get_dispatcher") as mock_dispatcher,
            patch("app.api.v1.ingestion.create_batch") as mock_create,
            patch("app.api.v1.ingestion.update_batch_status"),
        ):
            mock_hash.return_value = "abc123hash"
            mock_check.return_value = None

            mock_parser = MagicMock()
            mock_parser.parse.return_value = MagicMock(
                success=False,
                row_count=0,
                error_count=2,
                errors=["Row 1: Invalid amount", "Row 3: Missing date"],
                warnings=[],
            )

            mock_fingerprint = MagicMock()
            mock_fingerprint.source_system = "generic"
            mock_fingerprint.confidence = 0.5

            mock_dispatcher.return_value.get_parser.return_value = (
                mock_parser,
                mock_fingerprint,
            )

            mock_batch = MagicMock()
            mock_batch.id = SAMPLE_BATCH_ID
            mock_create.return_value = mock_batch

            files = {"file": ("test.csv", io.BytesIO(sample_csv_content), "text/csv")}
            data = {"property_id": str(SAMPLE_PROPERTY_ID)}

            response = client.post("/api/v1/ingestion/upload", files=files, data=data)

            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
            result = response.json()
            assert "detail" in result
            assert "errors" in result["detail"]

    def test_malformed_file_parser_error_returns_422(self, client, sample_csv_content):
        """Parser exceptions from malformed user files return 422."""
        with (
            patch("app.api.v1.ingestion.compute_file_hash") as mock_hash,
            patch("app.api.v1.ingestion.check_duplicate") as mock_check,
            patch("app.api.v1.ingestion.get_dispatcher") as mock_dispatcher,
            patch("app.api.v1.ingestion.create_batch") as mock_create,
            patch("app.api.v1.ingestion.update_batch_status") as mock_update,
        ):
            mock_hash.return_value = "abc123hash"
            mock_check.return_value = None

            mock_parser = MagicMock()
            mock_parser.parse.side_effect = ValueError("EOF inside string")

            mock_fingerprint = MagicMock()
            mock_fingerprint.source_system = "generic"
            mock_fingerprint.confidence = 0.5

            mock_dispatcher.return_value.get_parser.return_value = (
                mock_parser,
                mock_fingerprint,
            )

            mock_batch = MagicMock()
            mock_batch.id = SAMPLE_BATCH_ID
            mock_create.return_value = mock_batch

            files = {"file": ("test.csv", io.BytesIO(sample_csv_content), "text/csv")}
            data = {"property_id": str(SAMPLE_PROPERTY_ID)}

            response = client.post("/api/v1/ingestion/upload", files=files, data=data)

            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
            result = response.json()
            assert result["detail"]["message"] == "Failed to parse file"
            assert result["detail"]["errors"] == ["EOF inside string"]
            mock_update.assert_any_call(
                SAMPLE_BATCH_ID,
                SAMPLE_ORG_ID,
                "failed",
                error_count=1,
                error_log=[{"message": "EOF inside string"}],
            )

    def test_updates_batch_status_to_processing(self, client, sample_csv_content):
        """Updates batch status to processing during parse."""
        with (
            patch("app.api.v1.ingestion.compute_file_hash") as mock_hash,
            patch("app.api.v1.ingestion.check_duplicate") as mock_check,
            patch("app.api.v1.ingestion.get_dispatcher") as mock_dispatcher,
            patch("app.api.v1.ingestion.create_batch") as mock_create,
            patch("app.api.v1.ingestion.update_batch_status") as mock_update,
        ):
            mock_hash.return_value = "abc123hash"
            mock_check.return_value = None

            mock_parser = MagicMock()
            mock_parser.parse.return_value = MagicMock(
                success=True,
                row_count=3,
                error_count=0,
                errors=[],
                warnings=[],
            )

            mock_fingerprint = MagicMock()
            mock_fingerprint.source_system = "generic"
            mock_fingerprint.confidence = 0.5

            mock_dispatcher.return_value.get_parser.return_value = (
                mock_parser,
                mock_fingerprint,
            )

            mock_batch = MagicMock()
            mock_batch.id = SAMPLE_BATCH_ID
            mock_create.return_value = mock_batch

            files = {"file": ("test.csv", io.BytesIO(sample_csv_content), "text/csv")}
            data = {"property_id": str(SAMPLE_PROPERTY_ID)}

            client.post("/api/v1/ingestion/upload", files=files, data=data)

            # Verify status was updated to processing, then completed
            calls = mock_update.call_args_list
            assert len(calls) >= 2
            assert calls[0][0][1] == SAMPLE_ORG_ID
            assert calls[0][0][2] == "processing"
            assert calls[1][0][1] == SAMPLE_ORG_ID
            assert calls[1][0][2] == "completed"

    def test_returns_warnings(self, client, sample_csv_content):
        """Returns parser warnings in response."""
        with (
            patch("app.api.v1.ingestion.compute_file_hash") as mock_hash,
            patch("app.api.v1.ingestion.check_duplicate") as mock_check,
            patch("app.api.v1.ingestion.get_dispatcher") as mock_dispatcher,
            patch("app.api.v1.ingestion.create_batch") as mock_create,
            patch("app.api.v1.ingestion.update_batch_status"),
        ):
            mock_hash.return_value = "abc123hash"
            mock_check.return_value = None

            mock_parser = MagicMock()
            mock_parser.parse.return_value = MagicMock(
                success=True,
                row_count=3,
                error_count=0,
                errors=[],
                warnings=["Row 5: Amount truncated", "Using default date format"],
            )

            mock_fingerprint = MagicMock()
            mock_fingerprint.source_system = "generic"
            mock_fingerprint.confidence = 0.5

            mock_dispatcher.return_value.get_parser.return_value = (
                mock_parser,
                mock_fingerprint,
            )

            mock_batch = MagicMock()
            mock_batch.id = SAMPLE_BATCH_ID
            mock_create.return_value = mock_batch

            files = {"file": ("test.csv", io.BytesIO(sample_csv_content), "text/csv")}
            data = {"property_id": str(SAMPLE_PROPERTY_ID)}

            response = client.post("/api/v1/ingestion/upload", files=files, data=data)

            assert response.status_code == status.HTTP_200_OK
            result = response.json()
            assert "warnings" in result
            assert len(result["warnings"]) == 2


class TestGetBatchStatus:
    """Tests for GET /api/v1/ingestion/batches/{batch_id}."""

    def test_returns_batch_details(self, client):
        """Returns batch details for valid batch ID."""
        mock_context = create_mock_org_context()
        mock_chain = mock_context.client.table.return_value
        exec_chain = (
            mock_chain.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value
        )
        exec_chain.execute.return_value.data = {
            "id": str(SAMPLE_BATCH_ID),
            "organization_id": str(SAMPLE_ORG_ID),
            "property_id": str(SAMPLE_PROPERTY_ID),
            "file_name": "test.csv",
            "file_hash": "abc123",
            "source_system": "yardi",
            "status": "completed",
            "row_count": 100,
            "error_count": 0,
            "error_log": [],
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        # Override context with configured mock
        def override_context():
            return mock_context

        client.app.dependency_overrides[get_org_scoped_context] = override_context

        response = client.get(f"/api/v1/ingestion/batches/{SAMPLE_BATCH_ID}")

        assert response.status_code == status.HTTP_200_OK
        result = response.json()
        assert result["id"] == str(SAMPLE_BATCH_ID)
        assert result["status"] == "completed"
        assert result["row_count"] == 100

    def test_returns_404_for_unknown_batch(self, client):
        """Returns 404 for unknown batch ID."""
        mock_context = create_mock_org_context()
        mock_chain = mock_context.client.table.return_value
        exec_chain = (
            mock_chain.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value
        )
        exec_chain.execute.return_value.data = None

        def override_context():
            return mock_context

        client.app.dependency_overrides[get_org_scoped_context] = override_context

        unknown_id = uuid4()
        response = client.get(f"/api/v1/ingestion/batches/{unknown_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_returns_preview_entries_for_batch(self, client):
        """Returns ordered preview rows sourced from gl_entries for the batch."""
        mock_context = create_mock_org_context()

        def mock_table(table_name: str):
            builder = MagicMock()
            if table_name == "import_batches":
                (
                    builder.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
                ).data = {
                    "id": str(SAMPLE_BATCH_ID),
                    "status": "completed",
                    "row_count": 2,
                }
                return builder

            if table_name == "gl_entries":
                gl_query = builder.select.return_value.eq.return_value
                gl_query.order.return_value.order.return_value.order.return_value.limit.return_value.execute.return_value.data = [
                    {
                        "id": "entry-1",
                        "transaction_date": "2024-01-01",
                        "account_code": "5100",
                        "account_description": "Janitorial",
                        "description": "Lobby cleaning",
                        "amount": "125.50",
                    },
                    {
                        "id": "entry-2",
                        "transaction_date": "2024-01-02",
                        "account_code": "5200",
                        "account_description": "Utilities",
                        "description": None,
                        "amount": "-25.00",
                    },
                ]
                return builder

            return MagicMock()

        mock_context.client.table.side_effect = mock_table

        def override_context():
            return mock_context

        client.app.dependency_overrides[get_org_scoped_context] = override_context

        response = client.get(f"/api/v1/ingestion/batches/{SAMPLE_BATCH_ID}")

        assert response.status_code == status.HTTP_200_OK
        result = response.json()
        assert result["id"] == str(SAMPLE_BATCH_ID)
        assert result["preview_entries"] == [
            {
                "id": "entry-1",
                "transaction_date": "2024-01-01",
                "account_code": "5100",
                "account_description": "Janitorial",
                "description": "Lobby cleaning",
                "debit": "125.50",
                "credit": None,
                "balance": "125.50",
            },
            {
                "id": "entry-2",
                "transaction_date": "2024-01-02",
                "account_code": "5200",
                "account_description": "Utilities",
                "description": None,
                "debit": None,
                "credit": "25.00",
                "balance": "-25.00",
            },
        ]


class TestListBatches:
    """Tests for GET /api/v1/ingestion/batches."""

    def test_returns_batch_list(self, client):
        """Returns list of batches for organization."""
        mock_context = create_mock_org_context()
        mock_chain = mock_context.client.table.return_value
        exec_chain = (
            mock_chain.select.return_value.eq.return_value.order.return_value.limit.return_value
        )
        exec_chain.execute.return_value.data = [
            {
                "id": str(uuid4()),
                "file_name": "test1.csv",
                "source_system": "yardi",
                "status": "completed",
                "row_count": 100,
                "created_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(uuid4()),
                "file_name": "test2.csv",
                "source_system": "mri",
                "status": "processing",
                "row_count": 0,
                "created_at": datetime.now(UTC).isoformat(),
            },
        ]

        def override_context():
            return mock_context

        client.app.dependency_overrides[get_org_scoped_context] = override_context

        response = client.get("/api/v1/ingestion/batches")

        assert response.status_code == status.HTTP_200_OK
        result = response.json()
        assert "batches" in result
        assert len(result["batches"]) == 2
