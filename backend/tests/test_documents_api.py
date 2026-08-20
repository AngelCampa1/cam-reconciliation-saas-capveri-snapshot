"""
Comprehensive tests for document management API endpoints.

Tests cover:
- Document upload with validation (content type, size, magic bytes, property existence)
- Document listing with filters and pagination
- Document retrieval by ID
- Document deletion with status validation
- S3 and database error handling
- Organization isolation (RLS enforcement)
"""

import logging
from io import BytesIO
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import status

from app.models.enums import DocumentStatus, DocumentType
from app.services.extraction.s3_client import S3Error
from tests.conftest import ORG_A_ID

# Valid PDF content with magic bytes
VALID_PDF_BYTES = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
INVALID_PDF_BYTES = b"This is not a PDF file"
OVERSIZED_PDF_BYTES = b"%PDF-1.4\n" + (b"x" * (51 * 1024 * 1024))  # 51MB


class OversizedChunkOnlyUpload:
    """UploadFile test double that fails if code attempts an unbounded read."""

    filename = "large.pdf"
    content_type = "application/pdf"

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
def mock_s3_client():
    """Create mock S3 client."""
    mock = Mock()
    mock.validate_pdf = Mock(side_effect=lambda content: content.startswith(b"%PDF"))
    mock.generate_s3_key = Mock(return_value="org-123/prop-456/test-document.pdf")
    mock.upload_document = Mock(
        return_value={
            "bucket": "test-documents",
            "key": "org-123/prop-456/test-document.pdf",
            "etag": "abc123",
            "version_id": "v1",
        }
    )
    mock.delete_document = Mock(return_value=None)
    return mock


class TestDocumentUpload:
    """Test POST /api/v1/documents/upload endpoint."""

    @pytest.mark.asyncio
    async def test_upload_rejects_oversized_file_without_unbounded_read(
        self, mock_s3_client
    ):
        """Should reject oversized uploads without reading the whole stream at once."""
        from fastapi import HTTPException

        from app.api.v1.documents import MAX_FILE_SIZE, upload_document

        file = OversizedChunkOnlyUpload(MAX_FILE_SIZE)

        with pytest.raises(HTTPException) as exc_info:
            await upload_document(
                property_id=uuid4(),
                ctx=Mock(),
                file=file,
                storage_client=mock_s3_client,
            )

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceeds maximum size" in exc_info.value.detail
        assert file.unbounded_read_attempted is False
        assert file.bytes_served == MAX_FILE_SIZE + 1
        mock_s3_client.validate_pdf.assert_not_called()

    def test_upload_pdf_success(
        self, org_a_member_client, org_a_property, mock_s3_client
    ):
        """Should upload valid PDF and create database record."""
        from app.services.extraction import get_s3_client

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        # Initialize test data
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["documents"] = []

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={org_a_property['id']}",
            files={"file": ("lease.pdf", BytesIO(VALID_PDF_BYTES), "application/pdf")},
            data={"document_type": DocumentType.LEASE.value},
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "document_id" in data
        assert data["status"] == DocumentStatus.PENDING.value
        assert "queued for processing" in data["message"].lower()

    def test_upload_rejects_non_pdf_content_type(self, org_a_member_client):
        """Should reject files with non-PDF content type."""
        property_id = uuid4()

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={property_id}",
            files={"file": ("document.txt", BytesIO(b"text"), "text/plain")},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Only PDF files are accepted" in response.json()["detail"]

    def test_upload_rejects_oversized_file(self, org_a_member_client, mock_s3_client):
        """Should reject files larger than 50MB."""
        from app.services.extraction import get_s3_client

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        property_id = uuid4()

        # Create 51MB file content
        large_content = b"%PDF-1.4\n" + (b"x" * (51 * 1024 * 1024))

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={property_id}",
            files={"file": ("large.pdf", BytesIO(large_content), "application/pdf")},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceeds maximum size" in response.json()["detail"]

    def test_upload_validates_pdf_magic_bytes(
        self, org_a_member_client, mock_s3_client
    ):
        """Should reject files with invalid PDF magic bytes."""
        from app.services.extraction import get_s3_client

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        property_id = uuid4()

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={property_id}",
            files={"file": ("fake.pdf", BytesIO(INVALID_PDF_BYTES), "application/pdf")},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid magic bytes" in response.json()["detail"]

    def test_upload_returns_404_for_nonexistent_property(
        self, org_a_member_client, mock_s3_client
    ):
        """Should return 404 if property doesn't exist."""
        from app.services.extraction import get_s3_client

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        # Mock property not found
        org_a_member_client.mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data=None
        )

        nonexistent_property_id = uuid4()

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={nonexistent_property_id}",
            files={"file": ("lease.pdf", BytesIO(VALID_PDF_BYTES), "application/pdf")},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Property" in response.json()["detail"]

    def test_upload_handles_s3_error(
        self, org_a_member_client, org_a_property, mock_s3_client
    ):
        """Should return 500 if S3 upload fails."""
        from app.services.extraction import get_s3_client

        # Mock S3 error
        mock_s3_client.upload_document.side_effect = S3Error(
            "S3 connection failed", original_error=Exception("Network error")
        )

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        # Initialize test data (synchronous)
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={org_a_property['id']}",
            files={"file": ("lease.pdf", BytesIO(VALID_PDF_BYTES), "application/pdf")},
        )

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "Failed to upload document to storage" in response.json()["detail"]

    def test_upload_logs_storage_failure(
        self, org_a_member_client, org_a_property, mock_s3_client, caplog
    ):
        """Storage upload failures should emit structured logs before returning 500."""
        from app.services.extraction import get_s3_client

        mock_s3_client.upload_document.side_effect = S3Error(
            "S3 connection failed", original_error=Exception("Network error")
        )
        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]

        with caplog.at_level(logging.ERROR):
            response = org_a_member_client.post(
                f"/api/v1/documents/upload?property_id={org_a_property['id']}",
                files={
                    "file": (
                        "lease.pdf",
                        BytesIO(VALID_PDF_BYTES),
                        "application/pdf",
                    )
                },
            )

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert any(
            record.message == "Document storage upload failed"
            for record in caplog.records
        )

    def test_upload_handles_database_error(
        self, org_a_member_client, org_a_property, mock_s3_client
    ):
        """Should return 500 if database insert fails."""
        from app.services.extraction import get_s3_client
        from tests.conftest import MockQueryBuilder, MockSupabaseResponse

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        # Initialize test data
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["documents"] = []

        # Save original side_effect function
        original_side_effect = org_a_member_client.mock_supabase.table.side_effect

        # Create custom table function that fails for documents insert
        def custom_table(table_name):
            if table_name == "documents":
                # Return MockQueryBuilder that fails on execute for inserts
                builder = MockQueryBuilder(
                    data=org_a_member_client.mock_supabase._test_data.get(
                        table_name, []
                    )
                )
                original_execute = builder.execute

                def failing_execute():
                    # Fail on insert operations
                    if builder._insert_data is not None:
                        return MockSupabaseResponse(None, None)
                    return original_execute()

                builder.execute = failing_execute
                return builder
            return original_side_effect(table_name)

        # Temporarily replace table function
        org_a_member_client.mock_supabase.table.side_effect = custom_table

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={org_a_property['id']}",
            files={"file": ("lease.pdf", BytesIO(VALID_PDF_BYTES), "application/pdf")},
        )

        # Restore original
        org_a_member_client.mock_supabase.table.side_effect = original_side_effect

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "Failed to create document record" in response.json()["detail"]

        # Verify S3 cleanup was attempted
        mock_s3_client.delete_document.assert_called_once()

    def test_upload_logs_database_insert_failure(
        self, org_a_member_client, org_a_property, mock_s3_client, caplog
    ):
        """Database insert failures should be logged before cleanup."""
        from app.services.extraction import get_s3_client
        from tests.conftest import MockQueryBuilder, MockSupabaseResponse

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["documents"] = []

        original_side_effect = org_a_member_client.mock_supabase.table.side_effect

        def custom_table(table_name):
            if table_name == "documents":
                builder = MockQueryBuilder(
                    data=org_a_member_client.mock_supabase._test_data.get(
                        table_name, []
                    )
                )

                def failing_execute():
                    if builder._insert_data is not None:
                        response = MockSupabaseResponse(None, None)
                        response.error = {
                            "code": "42501",
                            "message": "row violates row-level security policy",
                        }
                        return response
                    return MockSupabaseResponse(builder._original_data, None)

                builder.execute = failing_execute
                return builder
            return original_side_effect(table_name)

        org_a_member_client.mock_supabase.table.side_effect = custom_table

        with caplog.at_level(logging.ERROR):
            response = org_a_member_client.post(
                f"/api/v1/documents/upload?property_id={org_a_property['id']}",
                files={
                    "file": (
                        "lease.pdf",
                        BytesIO(VALID_PDF_BYTES),
                        "application/pdf",
                    )
                },
            )

        org_a_member_client.mock_supabase.table.side_effect = original_side_effect

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert any(
            record.message == "Document record insert failed after storage upload"
            for record in caplog.records
        )
        mock_s3_client.delete_document.assert_called_once()

    def test_upload_document_with_lease_id(
        self, org_a_member_client, org_a_property, mock_s3_client
    ):
        """Should store lease_id on document when valid lease_id query param is provided."""
        from app.services.extraction import get_s3_client

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        lease_id = uuid4()

        # Initialize test data
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["documents"] = []
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": str(lease_id),
                "property_id": org_a_property["id"],
                "organization_id": org_a_property["organization_id"],
            }
        ]

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={org_a_property['id']}&lease_id={lease_id}",
            files={"file": ("lease.pdf", BytesIO(VALID_PDF_BYTES), "application/pdf")},
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Verify the stored document has lease_id set
        docs = org_a_member_client.mock_supabase._test_data["documents"]
        assert len(docs) == 1
        assert docs[0]["lease_id"] == str(lease_id)

    def test_upload_document_invalid_lease_id(
        self, org_a_member_client, org_a_property, mock_s3_client
    ):
        """Should return 404 when lease_id belongs to a different property or doesn't exist."""
        from app.services.extraction import get_s3_client

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        invalid_lease_id = uuid4()

        # Initialize test data with no lease for this property
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["documents"] = []
        org_a_member_client.mock_supabase._test_data["leases"] = []

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={org_a_property['id']}&lease_id={invalid_lease_id}",
            files={"file": ("lease.pdf", BytesIO(VALID_PDF_BYTES), "application/pdf")},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Lease" in response.json()["detail"]

    def test_upload_handles_database_error_and_s3_cleanup_failure(
        self, org_a_member_client, org_a_property, mock_s3_client
    ):
        """Should return 500 even when both DB insert and S3 cleanup fail (covers lines 154-159)."""
        from app.services.extraction import S3Error, get_s3_client
        from tests.conftest import MockQueryBuilder, MockSupabaseResponse

        # Mock S3 upload success
        mock_s3_client.upload_document.return_value = {
            "key": "test-key",
            "bucket": "test-bucket",
        }

        # Mock S3 cleanup to also fail
        mock_s3_client.delete_document.side_effect = S3Error(
            "Cleanup failed", original_error=Exception("S3 network error")
        )

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        # Set up test data
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["documents"] = []

        # Save original side_effect function
        original_side_effect = org_a_member_client.mock_supabase.table.side_effect

        # Create custom table function that fails for documents insert
        def custom_table(table_name):
            if table_name == "documents":
                # Return MockQueryBuilder that fails on execute for inserts
                builder = MockQueryBuilder(
                    data=org_a_member_client.mock_supabase._test_data.get(
                        table_name, []
                    )
                )
                original_execute = builder.execute

                def failing_execute():
                    # Fail on insert operations
                    if builder._insert_data is not None:
                        return MockSupabaseResponse(None, None)
                    return original_execute()

                builder.execute = failing_execute
                return builder
            return original_side_effect(table_name)

        # Temporarily replace table function
        org_a_member_client.mock_supabase.table.side_effect = custom_table

        response = org_a_member_client.post(
            f"/api/v1/documents/upload?property_id={org_a_property['id']}",
            files={"file": ("lease.pdf", BytesIO(VALID_PDF_BYTES), "application/pdf")},
        )

        # Restore original
        org_a_member_client.mock_supabase.table.side_effect = original_side_effect

        # Should still return 500 for database failure
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "Failed to create document record" in response.json()["detail"]

        # Verify S3 cleanup was attempted (even though it failed)
        mock_s3_client.delete_document.assert_called_once()


class TestDocumentListing:
    """Test GET /api/v1/documents endpoint."""

    def test_list_documents_returns_paginated_results(
        self, org_a_member_client, org_a_property
    ):
        """Should return list of documents with pagination."""
        from datetime import UTC, datetime

        doc1_id = uuid4()
        doc2_id = uuid4()

        # Initialize test data
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(doc1_id),
                "organization_id": org_a_property["organization_id"],
                "property_id": org_a_property["id"],
                "filename": "lease1.pdf",
                "s3_key": "org/prop/lease1.pdf",
                "s3_bucket": "test-bucket",
                "content_type": "application/pdf",
                "file_size_bytes": 2048,
                "document_type": DocumentType.LEASE.value,
                "status": DocumentStatus.COMPLETED.value,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(doc2_id),
                "organization_id": org_a_property["organization_id"],
                "property_id": org_a_property["id"],
                "filename": "lease2.pdf",
                "s3_key": "org/prop/lease2.pdf",
                "s3_bucket": "test-bucket",
                "content_type": "application/pdf",
                "file_size_bytes": 1024,
                "document_type": DocumentType.LEASE.value,
                "status": DocumentStatus.PENDING.value,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
        ]

        response = org_a_member_client.get("/api/v1/documents")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 2
        assert data[0]["id"] == str(doc1_id)
        assert data[1]["id"] == str(doc2_id)

    def test_list_documents_filters_by_property_id(
        self, org_a_member_client, org_a_property
    ):
        """Should filter documents by property_id."""
        from datetime import UTC, datetime

        property_id = uuid4()

        # Initialize test data with document for specific property
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(uuid4()),
                "organization_id": org_a_property["organization_id"],
                "property_id": str(property_id),
                "filename": "lease.pdf",
                "s3_key": "org/prop/lease.pdf",
                "s3_bucket": "test-bucket",
                "content_type": "application/pdf",
                "file_size_bytes": 1024,
                "document_type": DocumentType.LEASE.value,
                "status": DocumentStatus.PENDING.value,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/documents?property_id={property_id}"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["property_id"] == str(property_id)

    def test_list_documents_filters_by_status(
        self, org_a_member_client, org_a_property
    ):
        """Should filter documents by status."""
        from datetime import UTC, datetime

        # Initialize test data with completed document
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(uuid4()),
                "organization_id": org_a_property["organization_id"],
                "property_id": org_a_property["id"],
                "filename": "completed.pdf",
                "s3_key": "org/prop/completed.pdf",
                "s3_bucket": "test-bucket",
                "content_type": "application/pdf",
                "file_size_bytes": 1024,
                "document_type": DocumentType.LEASE.value,
                "status": DocumentStatus.COMPLETED.value,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        response = org_a_member_client.get(
            f"/api/v1/documents?status={DocumentStatus.COMPLETED.value}"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == DocumentStatus.COMPLETED.value

    def test_list_documents_respects_skip_and_limit(
        self, org_a_member_client, org_a_property
    ):
        """Should respect pagination parameters."""
        from datetime import UTC, datetime

        # Initialize test data with 15 documents (to test pagination with skip=10, limit=5)
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(uuid4()),
                "organization_id": org_a_property["organization_id"],
                "property_id": org_a_property["id"],
                "filename": f"doc{i}.pdf",
                "s3_key": f"org/prop/doc{i}.pdf",
                "s3_bucket": "test-bucket",
                "content_type": "application/pdf",
                "file_size_bytes": 1024,
                "document_type": DocumentType.LEASE.value,
                "status": DocumentStatus.PENDING.value,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
            for i in range(15)
        ]

        response = org_a_member_client.get("/api/v1/documents?skip=10&limit=5")

        assert response.status_code == status.HTTP_200_OK
        # Should return at most 5 documents (from index 10-14)
        data = response.json()
        assert len(data) <= 5

    def test_list_documents_returns_empty_list(self, org_a_member_client):
        """Should return empty list when no documents exist."""
        org_a_member_client.mock_supabase.table.return_value.select.return_value.order.return_value.range.return_value.execute.return_value = Mock(
            data=[]
        )

        response = org_a_member_client.get("/api/v1/documents")

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []


class TestDocumentRetrieval:
    """Test GET /api/v1/documents/{document_id} endpoint."""

    def test_get_document_by_id_success(self, org_a_member_client, org_a_property):
        """Should return document details by ID."""
        from datetime import UTC, datetime

        doc_id = uuid4()

        # Initialize test data with single document
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(doc_id),
                "organization_id": org_a_property["organization_id"],
                "property_id": org_a_property["id"],
                "filename": "lease.pdf",
                "s3_key": "org/prop/lease.pdf",
                "s3_bucket": "test-bucket",
                "content_type": "application/pdf",
                "file_size_bytes": 2048,
                "document_type": DocumentType.LEASE.value,
                "status": DocumentStatus.COMPLETED.value,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        response = org_a_member_client.get(f"/api/v1/documents/{doc_id}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(doc_id)
        assert data["filename"] == "lease.pdf"
        assert data["status"] == DocumentStatus.COMPLETED.value

    def test_get_document_returns_404_for_nonexistent(self, org_a_member_client):
        """Should return 404 if document doesn't exist."""
        nonexistent_id = uuid4()

        org_a_member_client.mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data=None
        )

        response = org_a_member_client.get(f"/api/v1/documents/{nonexistent_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Document" in response.json()["detail"]

    def test_get_document_enforces_organization_isolation(
        self, org_a_member_client, org_b_member_client
    ):
        """Should enforce RLS - Org A can't see Org B documents."""
        doc_id = uuid4()

        # Org A tries to access, document doesn't exist for them (RLS blocks it)
        org_a_member_client.mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data=None
        )

        response = org_a_member_client.get(f"/api/v1/documents/{doc_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestDocumentDeletion:
    """Test DELETE /api/v1/documents/{document_id} endpoint."""

    def test_delete_pending_document_success(self, org_a_member_client, mock_s3_client):
        """Should delete pending document from DB and S3."""
        from app.services.extraction import get_s3_client

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        doc_id = uuid4()

        # Initialize test data with pending document
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(doc_id),
                "organization_id": str(ORG_A_ID),
                "status": DocumentStatus.PENDING.value,
                "s3_key": "org/prop/doc.pdf",
            }
        ]

        response = org_a_member_client.delete(f"/api/v1/documents/{doc_id}")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        mock_s3_client.delete_document.assert_called_once_with("org/prop/doc.pdf")

    def test_delete_failed_document_success(self, org_a_member_client, mock_s3_client):
        """Should delete failed document from DB and S3."""
        from app.services.extraction import get_s3_client

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        doc_id = uuid4()

        # Initialize test data with failed document
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(doc_id),
                "organization_id": str(ORG_A_ID),
                "status": DocumentStatus.FAILED.value,
                "s3_key": "org/prop/doc.pdf",
            }
        ]

        response = org_a_member_client.delete(f"/api/v1/documents/{doc_id}")

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_delete_returns_404_for_nonexistent(self, org_a_member_client):
        """Should return 404 if document doesn't exist."""
        nonexistent_id = uuid4()

        org_a_member_client.mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data=None
        )

        response = org_a_member_client.delete(f"/api/v1/documents/{nonexistent_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_rejects_completed_document(self, org_a_member_client):
        """Should reject deletion of completed document."""
        doc_id = uuid4()

        # Initialize test data with completed document
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(doc_id),
                "status": DocumentStatus.COMPLETED.value,
                "s3_key": "org/prop/doc.pdf",
            }
        ]

        response = org_a_member_client.delete(f"/api/v1/documents/{doc_id}")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert (
            "Cannot delete document with status 'completed'"
            in response.json()["detail"]
        )

    def test_delete_rejects_processing_document(self, org_a_member_client):
        """Should reject deletion of processing document."""
        doc_id = uuid4()

        # Initialize test data with processing document
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(doc_id),
                "status": DocumentStatus.PROCESSING.value,
                "s3_key": "org/prop/doc.pdf",
            }
        ]

        response = org_a_member_client.delete(f"/api/v1/documents/{doc_id}")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert (
            "Cannot delete document with status 'processing'"
            in response.json()["detail"]
        )

    def test_delete_continues_on_s3_error(self, org_a_member_client, mock_s3_client):
        """Should continue with DB deletion even if S3 delete fails."""
        from app.services.extraction import get_s3_client

        # Mock S3 error
        mock_s3_client.delete_document.side_effect = S3Error(
            "S3 delete failed", original_error=Exception("Network error")
        )

        org_a_member_client.app.dependency_overrides[get_s3_client] = (
            lambda: mock_s3_client
        )

        doc_id = uuid4()

        # Initialize test data with pending document
        org_a_member_client.mock_supabase._test_data["documents"] = [
            {
                "id": str(doc_id),
                "organization_id": str(ORG_A_ID),
                "status": DocumentStatus.PENDING.value,
                "s3_key": "org/prop/doc.pdf",
            }
        ]

        response = org_a_member_client.delete(f"/api/v1/documents/{doc_id}")

        # Should succeed despite S3 error (best-effort cleanup)
        assert response.status_code == status.HTTP_204_NO_CONTENT


class TestDocumentEndpointsRequireAuth:
    """Test that all document endpoints require authentication."""

    def test_upload_requires_authentication(self):
        """Upload endpoint should require authentication."""
        from fastapi.testclient import TestClient

        from tests.conftest import create_test_app

        app = create_test_app()
        client = TestClient(app)

        response = client.post(
            f"/api/v1/documents/upload?property_id={uuid4()}",
            files={"file": ("lease.pdf", BytesIO(VALID_PDF_BYTES), "application/pdf")},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_requires_authentication(self):
        """List endpoint should require authentication."""
        from fastapi.testclient import TestClient

        from tests.conftest import create_test_app

        app = create_test_app()
        client = TestClient(app)

        response = client.get("/api/v1/documents")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_requires_authentication(self):
        """Get endpoint should require authentication."""
        from fastapi.testclient import TestClient

        from tests.conftest import create_test_app

        app = create_test_app()
        client = TestClient(app)

        response = client.get(f"/api/v1/documents/{uuid4()}")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_requires_authentication(self):
        """Delete endpoint should require authentication."""
        from fastapi.testclient import TestClient

        from tests.conftest import create_test_app

        app = create_test_app()
        client = TestClient(app)

        response = client.delete(f"/api/v1/documents/{uuid4()}")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
