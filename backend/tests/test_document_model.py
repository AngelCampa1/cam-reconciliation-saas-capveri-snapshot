"""
Unit tests for Document Pydantic models.

Tests cover:
- Document model field validation
- DocumentCreate/Update DTOs
- DocumentResponse model
"""

from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.document import (
    Document,
    DocumentCreate,
    DocumentResponse,
    DocumentUpdate,
    DocumentUploadResponse,
)
from app.models.enums import DocumentStatus, DocumentType


class TestDocumentModel:
    """Test full Document model."""

    def test_document_all_fields(self):
        """Should accept all valid fields."""
        now = datetime.now()
        doc = Document(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            filename="lease.pdf",
            storage_key="org/prop/doc.pdf",
            storage_bucket="test-bucket",
            content_type="application/pdf",
            file_size_bytes=1024,
            document_type=DocumentType.LEASE,
            status=DocumentStatus.PENDING,
            reader_job_id="job-123",
            extraction_result={"key": "value"},
            error_message=None,
            created_at=now,
            updated_at=now,
            processed_at=now,
        )

        assert doc.filename == "lease.pdf"
        assert doc.file_size_bytes == 1024
        assert doc.reader_job_id == "job-123"

    def test_document_validates_filename_length(self):
        """Should reject filename over 255 chars."""
        with pytest.raises(ValidationError) as exc_info:
            Document(
                id=uuid4(),
                organization_id=uuid4(),
                property_id=uuid4(),
                filename="x" * 256,  # Too long
                storage_key="key",
                storage_bucket="bucket",
                file_size_bytes=100,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )

        assert "filename" in str(exc_info.value)

    def test_document_validates_file_size_non_negative(self):
        """Should reject negative file size."""
        with pytest.raises(ValidationError):
            Document(
                id=uuid4(),
                organization_id=uuid4(),
                property_id=uuid4(),
                filename="doc.pdf",
                storage_key="key",
                storage_bucket="bucket",
                file_size_bytes=-1,  # Invalid
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )

    def test_document_accepts_legacy_storage_aliases(self):
        """Should continue accepting legacy storage aliases from mixed-schema rows."""
        now = datetime.now()

        doc = Document.model_validate(
            {
                "id": str(uuid4()),
                "organization_id": str(uuid4()),
                "property_id": str(uuid4()),
                "filename": "lease.pdf",
                "s3_key": "org/prop/doc.pdf",
                "s3_bucket": "legacy-bucket",
                "file_size_bytes": 1024,
                "textract_job_id": "legacy-job-123",
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
        )

        assert doc.storage_key == "org/prop/doc.pdf"
        assert doc.storage_bucket == "legacy-bucket"
        assert doc.reader_job_id == "legacy-job-123"


class TestDocumentCreate:
    """Test DocumentCreate DTO."""

    def test_document_create_required_fields(self):
        """Should require property_id, filename, storage_key, storage_bucket, file_size."""
        doc = DocumentCreate(
            property_id=uuid4(),
            filename="lease.pdf",
            storage_key="org/prop/doc.pdf",
            storage_bucket="bucket",
            file_size_bytes=2048,
        )

        assert doc.content_type == "application/pdf"  # Default
        assert doc.document_type == DocumentType.LEASE  # Default

    def test_document_create_custom_type(self):
        """Should accept custom document type."""
        doc = DocumentCreate(
            property_id=uuid4(),
            filename="amendment.pdf",
            storage_key="key",
            storage_bucket="bucket",
            file_size_bytes=1024,
            document_type=DocumentType.AMENDMENT,
        )

        assert doc.document_type == DocumentType.AMENDMENT


class TestDocumentUpdate:
    """Test DocumentUpdate DTO."""

    def test_document_update_all_optional(self):
        """All fields should be optional for partial updates."""
        update = DocumentUpdate()
        assert update.status is None
        assert update.reader_job_id is None

    def test_document_update_status_change(self):
        """Should update processing status."""
        update = DocumentUpdate(
            status=DocumentStatus.COMPLETED,
            processed_at=datetime.now(),
        )

        assert update.status == DocumentStatus.COMPLETED
        assert update.processed_at is not None

    def test_document_update_with_error(self):
        """Should update with error details."""
        update = DocumentUpdate(
            status=DocumentStatus.FAILED,
            error_message="Document reader job timed out",
        )

        assert update.status == DocumentStatus.FAILED
        assert "timed out" in update.error_message

    def test_document_update_error_message_max_length(self):
        """Should reject error message over 2000 chars."""
        with pytest.raises(ValidationError):
            DocumentUpdate(error_message="x" * 2001)


class TestDocumentResponse:
    """Test DocumentResponse model."""

    def test_document_response_excludes_internal_fields(self):
        """Should not expose s3_key and s3_bucket in response."""
        now = datetime.now()
        response = DocumentResponse(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            filename="lease.pdf",
            content_type="application/pdf",
            file_size_bytes=1024,
            document_type=DocumentType.LEASE,
            status=DocumentStatus.PENDING,
            created_at=now,
            updated_at=now,
        )

        # s3_key and s3_bucket are not in DocumentResponse
        assert (
            not hasattr(response, "s3_key") or getattr(response, "s3_key", None) is None
        )
        assert (
            not hasattr(response, "s3_bucket")
            or getattr(response, "s3_bucket", None) is None
        )


class TestDocumentUploadResponse:
    """Test DocumentUploadResponse model."""

    def test_upload_response_defaults(self):
        """Should have default status and message."""
        response = DocumentUploadResponse(document_id=uuid4())

        assert response.status == DocumentStatus.PENDING
        assert "successfully" in response.message

    def test_upload_response_custom_message(self):
        """Should accept custom message."""
        response = DocumentUploadResponse(
            document_id=uuid4(),
            status=DocumentStatus.PROCESSING,
            message="Processing started",
        )

        assert response.status == DocumentStatus.PROCESSING
        assert response.message == "Processing started"
