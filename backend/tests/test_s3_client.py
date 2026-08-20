"""
Unit tests for S3Client wrapper.

Tests cover:
- Document upload
- PDF validation
- S3 key generation
- Error handling
- Health checks
"""

from unittest.mock import MagicMock, patch
from uuid import UUID

import pybreaker
import pytest
from botocore.exceptions import BotoCoreError, ClientError

from app.exceptions.handlers import ServiceUnavailableError
from app.services.extraction.s3_client import (
    S3Client,
    S3Error,
    get_s3_client,
    reset_s3_client,
    reset_storage_client,
)


class TestS3ClientInitialization:
    """Test S3Client initialization."""

    def test_init_with_custom_client(self):
        """Should accept custom boto3 client for testing."""
        mock_client = MagicMock()
        client = S3Client(client=mock_client, bucket="test-bucket")

        assert client.client is mock_client
        assert client.bucket == "test-bucket"

    def test_init_creates_boto3_client_when_none_provided(self):
        """Should create boto3 client when not provided."""
        with patch("app.services.extraction.s3_client.boto3") as mock_boto3:
            mock_boto3.client.return_value = MagicMock()
            client = S3Client(bucket="test-bucket")

            mock_boto3.client.assert_called_once()
            assert client.bucket == "test-bucket"

    def test_init_passes_r2_endpoint_and_credentials(self):
        """Should wire endpoint and explicit credentials into boto3."""
        with (
            patch("app.services.extraction.s3_client.boto3") as mock_boto3,
            patch("app.services.extraction.s3_client.settings") as mock_settings,
        ):
            mock_boto3.client.return_value = MagicMock()
            mock_settings.documents_r2_bucket = "tenant-docs"
            mock_settings.documents_r2_endpoint_url = (
                "https://example.r2.cloudflarestorage.com"
            )
            mock_settings.documents_r2_region = "auto"
            mock_settings.documents_r2_access_key_id = "key-id"
            mock_settings.documents_r2_secret_access_key = "secret"

            client = S3Client()

        assert client.bucket == "tenant-docs"
        mock_boto3.client.assert_called_once()
        kwargs = mock_boto3.client.call_args.kwargs
        assert kwargs["endpoint_url"] == "https://example.r2.cloudflarestorage.com"
        assert kwargs["aws_access_key_id"] == "key-id"
        assert kwargs["aws_secret_access_key"] == "secret"
        assert kwargs["region_name"] == "auto"

    def test_init_ignores_legacy_aws_credentials(self):
        """Should not fall back to legacy AWS env vars for document storage."""
        with (
            patch("app.services.extraction.s3_client.boto3") as mock_boto3,
            patch("app.services.extraction.s3_client.settings") as mock_settings,
        ):
            mock_boto3.client.return_value = MagicMock()
            mock_settings.documents_r2_bucket = "tenant-docs"
            mock_settings.documents_r2_endpoint_url = (
                "https://example.r2.cloudflarestorage.com"
            )
            mock_settings.documents_r2_region = "auto"
            mock_settings.documents_r2_access_key_id = ""
            mock_settings.documents_r2_secret_access_key = ""

            client = S3Client()

        assert client.bucket == "tenant-docs"
        mock_boto3.client.assert_called_once()
        kwargs = mock_boto3.client.call_args.kwargs
        assert "aws_access_key_id" not in kwargs
        assert "aws_secret_access_key" not in kwargs


class TestPDFValidation:
    """Test PDF magic bytes validation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.client = S3Client(client=MagicMock(), bucket="test-bucket")

    def test_validate_pdf_with_valid_pdf(self):
        """Should return True for valid PDF content."""
        # PDF magic bytes are %PDF
        valid_pdf = b"%PDF-1.4 some content here"
        assert self.client.validate_pdf(valid_pdf) is True

    def test_validate_pdf_with_invalid_content(self):
        """Should return False for non-PDF content."""
        invalid_content = b"This is not a PDF file"
        assert self.client.validate_pdf(invalid_content) is False

    def test_validate_pdf_with_too_short_content(self):
        """Should return False for content shorter than magic bytes."""
        short_content = b"AB"
        assert self.client.validate_pdf(short_content) is False

    def test_validate_pdf_with_empty_content(self):
        """Should return False for empty content."""
        assert self.client.validate_pdf(b"") is False


class TestFileSizeValidation:
    """Test file size validation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.client = S3Client(client=MagicMock(), bucket="test-bucket")

    def test_validate_file_size_under_limit(self):
        """Should return True for file under 50MB limit."""
        small_content = b"x" * 1024  # 1KB
        assert self.client.validate_file_size(small_content) is True

    def test_validate_file_size_at_limit(self):
        """Should return True for file exactly at 50MB limit."""
        content = b"x" * (50 * 1024 * 1024)  # 50MB exactly
        assert self.client.validate_file_size(content) is True

    def test_validate_file_size_over_limit(self):
        """Should return False for file over 50MB limit."""
        content = b"x" * (50 * 1024 * 1024 + 1)  # 50MB + 1 byte
        assert self.client.validate_file_size(content) is False


class TestS3KeyGeneration:
    """Test S3 key generation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.client = S3Client(client=MagicMock(), bucket="test-bucket")
        self.org_id = UUID("11111111-1111-1111-1111-111111111111")
        self.property_id = UUID("22222222-2222-2222-2222-222222222222")

    def test_generate_s3_key_basic_structure(self):
        """Should generate key with org/property/uuid.pdf structure."""
        key = self.client.generate_s3_key(
            organization_id=self.org_id,
            property_id=self.property_id,
            filename="lease.pdf",
        )

        parts = key.split("/")
        assert len(parts) == 3
        assert parts[0] == str(self.org_id)
        assert parts[1] == str(self.property_id)
        assert parts[2].endswith(".pdf")

    def test_generate_s3_key_preserves_extension(self):
        """Should preserve file extension from original filename."""
        key = self.client.generate_s3_key(
            organization_id=self.org_id,
            property_id=self.property_id,
            filename="document.PDF",  # uppercase
        )
        assert key.endswith(".pdf")  # normalized to lowercase

    def test_generate_s3_key_defaults_to_pdf(self):
        """Should default to .pdf if no extension in filename."""
        key = self.client.generate_s3_key(
            organization_id=self.org_id,
            property_id=self.property_id,
            filename="document",  # no extension
        )
        assert key.endswith(".pdf")

    def test_generate_s3_key_unique_each_call(self):
        """Should generate unique keys on each call."""
        key1 = self.client.generate_s3_key(self.org_id, self.property_id, "doc.pdf")
        key2 = self.client.generate_s3_key(self.org_id, self.property_id, "doc.pdf")
        assert key1 != key2


class TestUploadDocument:
    """Test document upload functionality."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_boto = MagicMock()
        self.client = S3Client(client=self.mock_boto, bucket="test-bucket")

    def test_upload_document_success(self):
        """Should upload document and return result."""
        self.mock_boto.put_object.return_value = {
            "ETag": '"abc123"',
            "VersionId": "v1",
        }

        result = self.client.upload_document(
            key="org/prop/doc.pdf",
            content=b"%PDF-1.4 content",
            content_type="application/pdf",
            metadata={"original_filename": "lease.pdf"},
        )

        # Verify put_object was called with expected storage params
        call_kwargs = self.mock_boto.put_object.call_args.kwargs
        assert call_kwargs["Bucket"] == "test-bucket"
        assert call_kwargs["Key"] == "org/prop/doc.pdf"
        assert call_kwargs["Metadata"] == {"original_filename": "lease.pdf"}

        # Verify return value
        assert result["bucket"] == "test-bucket"
        assert result["key"] == "org/prop/doc.pdf"
        assert result["etag"] == "abc123"
        assert result["version_id"] == "v1"

    def test_upload_document_client_error(self):
        """Should raise S3Error on ClientError."""
        self.mock_boto.put_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchBucket", "Message": "Bucket not found"}},
            "PutObject",
        )

        with pytest.raises(S3Error) as exc_info:
            self.client.upload_document(
                key="org/prop/doc.pdf",
                content=b"%PDF-1.4",
            )

        assert "NoSuchBucket" in str(exc_info.value.message)

    def test_upload_document_botocore_error(self):
        """Should raise S3Error on BotoCoreError."""
        self.mock_boto.put_object.side_effect = BotoCoreError()

        with pytest.raises(S3Error) as exc_info:
            self.client.upload_document(
                key="org/prop/doc.pdf",
                content=b"%PDF-1.4",
            )

        assert "Object storage client error" in str(exc_info.value.message)

    def test_upload_document_circuit_breaker_error(self):
        """Should surface breaker failures as service-unavailable errors."""
        with patch("app.services.extraction.s3_client.get_s3_breaker") as mock_breaker:
            mock_breaker.return_value.call.side_effect = pybreaker.CircuitBreakerError(
                "open"
            )

            with pytest.raises(ServiceUnavailableError):
                self.client.upload_document(
                    key="org/prop/doc.pdf",
                    content=b"%PDF-1.4",
                )


class TestDeleteDocument:
    """Test document deletion."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_boto = MagicMock()
        self.client = S3Client(client=self.mock_boto, bucket="test-bucket")

    def test_delete_document_success(self):
        """Should delete document and return True."""
        self.mock_boto.delete_object.return_value = {}

        result = self.client.delete_document("org/prop/doc.pdf")

        assert result is True
        self.mock_boto.delete_object.assert_called_once_with(
            Bucket="test-bucket", Key="org/prop/doc.pdf"
        )

    def test_delete_document_client_error(self):
        """Should raise S3Error on ClientError."""
        self.mock_boto.delete_object.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access denied"}},
            "DeleteObject",
        )

        with pytest.raises(S3Error) as exc_info:
            self.client.delete_document("org/prop/doc.pdf")

        assert "AccessDenied" in str(exc_info.value.message)

    def test_delete_document_botocore_error(self):
        """Should raise S3Error on low-level boto errors."""
        self.mock_boto.delete_object.side_effect = BotoCoreError()

        with pytest.raises(S3Error) as exc_info:
            self.client.delete_document("org/prop/doc.pdf")

        assert "client error deleting document" in str(exc_info.value.message)

    def test_delete_document_circuit_breaker_error(self):
        """Should surface delete breaker failures as service-unavailable errors."""
        with patch("app.services.extraction.s3_client.get_s3_breaker") as mock_breaker:
            mock_breaker.return_value.call.side_effect = pybreaker.CircuitBreakerError(
                "open"
            )

            with pytest.raises(ServiceUnavailableError):
                self.client.delete_document("org/prop/doc.pdf")


class TestGetDocumentUrl:
    """Test presigned URL generation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_boto = MagicMock()
        self.client = S3Client(client=self.mock_boto, bucket="test-bucket")

    def test_get_document_url_success(self):
        """Should generate presigned URL."""
        expected_url = "https://bucket.s3.amazonaws.com/key?signature=xxx"
        self.mock_boto.generate_presigned_url.return_value = expected_url

        url = self.client.get_document_url("org/prop/doc.pdf", expires_in=7200)

        assert url == expected_url
        self.mock_boto.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={"Bucket": "test-bucket", "Key": "org/prop/doc.pdf"},
            ExpiresIn=7200,
        )

    def test_get_document_url_botocore_error(self):
        """Should raise S3Error on boto-core URL generation failures."""
        self.mock_boto.generate_presigned_url.side_effect = BotoCoreError()

        with pytest.raises(S3Error) as exc_info:
            self.client.get_document_url("org/prop/doc.pdf")

        assert "client error generating URL" in str(exc_info.value.message)


class TestGetDocumentBytes:
    """Test document downloads from object storage."""

    def setup_method(self):
        self.mock_boto = MagicMock()
        self.client = S3Client(client=self.mock_boto, bucket="test-bucket")

    def test_get_document_bytes_success(self):
        body = MagicMock()
        body.read.return_value = b"%PDF-1.4 bytes"
        self.mock_boto.get_object.return_value = {"Body": body}

        result = self.client.get_document_bytes("org/prop/doc.pdf")

        assert result == b"%PDF-1.4 bytes"
        self.mock_boto.get_object.assert_called_once_with(
            Bucket="test-bucket", Key="org/prop/doc.pdf"
        )

    def test_get_document_bytes_raises_on_non_bytes_body(self):
        body = MagicMock()
        body.read.return_value = "not-bytes"
        self.mock_boto.get_object.return_value = {"Body": body}

        with pytest.raises(S3Error) as exc_info:
            self.client.get_document_bytes("org/prop/doc.pdf")

        assert "non-bytes response body" in str(exc_info.value)

    def test_get_document_bytes_client_error(self):
        self.mock_boto.get_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "missing"}},
            "GetObject",
        )

        with pytest.raises(S3Error) as exc_info:
            self.client.get_document_bytes("org/prop/doc.pdf")

        assert "NoSuchKey" in str(exc_info.value)

    def test_get_document_bytes_circuit_breaker_error(self):
        with patch("app.services.extraction.s3_client.get_s3_breaker") as mock_breaker:
            mock_breaker.return_value.call.side_effect = pybreaker.CircuitBreakerError(
                "open"
            )

            with pytest.raises(ServiceUnavailableError):
                self.client.get_document_bytes("org/prop/doc.pdf")

    def test_get_document_bytes_botocore_error(self):
        self.mock_boto.get_object.side_effect = BotoCoreError()

        with pytest.raises(S3Error) as exc_info:
            self.client.get_document_bytes("org/prop/doc.pdf")

        assert "client error downloading document" in str(exc_info.value)


class TestStorageHealth:
    """Test object storage health checks."""

    def setup_method(self):
        self.mock_boto = MagicMock()
        self.client = S3Client(client=self.mock_boto, bucket="test-bucket")

    def test_check_health_success(self):
        self.mock_boto.head_bucket.return_value = {}
        self.mock_boto.put_object.return_value = {}
        self.mock_boto.delete_object.return_value = {}

        result = self.client.check_health()

        assert result["healthy"] is True
        assert result["provider"] == "cloudflare_r2"
        assert result["bucket"] == "test-bucket"
        self.mock_boto.put_object.assert_called_once()
        self.mock_boto.delete_object.assert_called_once()

    def test_check_health_handles_not_found(self):
        self.mock_boto.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "404", "Message": "missing"}},
            "HeadBucket",
        )

        result = self.client.check_health()

        assert result["healthy"] is False
        assert "does not exist" in result["message"]

    def test_check_health_handles_access_denied(self):
        self.mock_boto.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "403", "Message": "forbidden"}},
            "HeadBucket",
        )

        result = self.client.check_health()

        assert result["healthy"] is True
        assert "bucket-level head check denied" in result["message"]
        self.mock_boto.put_object.assert_called_once()
        self.mock_boto.delete_object.assert_called_once()

    def test_check_health_reports_put_denied_after_head_denied(self):
        self.mock_boto.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "403", "Message": "forbidden"}},
            "HeadBucket",
        )
        self.mock_boto.put_object.side_effect = ClientError(
            {"Error": {"Code": "403", "Message": "forbidden"}},
            "PutObject",
        )

        result = self.client.check_health()

        assert result["healthy"] is False
        assert result["message"] == "Access denied during put_object"
        self.mock_boto.delete_object.assert_not_called()

    def test_check_health_handles_botocore_error(self):
        self.mock_boto.head_bucket.side_effect = BotoCoreError()

        result = self.client.check_health()

        assert result["healthy"] is False
        assert "client error" in result["message"]

    def test_check_health_handles_generic_client_error(self):
        self.mock_boto.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "500", "Message": "server error"}},
            "HeadBucket",
        )

        result = self.client.check_health()

        assert result["healthy"] is False
        assert result["message"] == "Object storage error during head_bucket: 500"


class TestSingletonHelpers:
    """Test compatibility singleton helpers."""

    def setup_method(self):
        self.mock_boto = MagicMock()
        self.client = S3Client(client=self.mock_boto, bucket="test-bucket")

    def test_get_and_reset_storage_client(self):
        reset_s3_client()

        with patch(
            "app.services.extraction.s3_client.StorageClient"
        ) as mock_client_cls:
            mock_instance = MagicMock()
            mock_client_cls.return_value = mock_instance

            first = get_s3_client()
            second = get_s3_client()
            reset_s3_client()

        assert first is mock_instance
        assert second is mock_instance
        mock_client_cls.assert_called_once_with()
        mock_instance.close.assert_called_once_with()

    def test_close_swallow_client_close_errors(self):
        self.client._owns_client = True
        self.client.client.close.side_effect = RuntimeError("boom")

        self.client.close()

        assert self.client.client is None

    def test_close_noop_when_client_not_owned(self):
        self.client._owns_client = False

        self.client.close()

        self.client.client.close.assert_not_called()

    def test_get_document_url_default_expiry(self):
        """Should use 1 hour default expiry."""
        self.mock_boto.generate_presigned_url.return_value = "https://url"

        self.client.get_document_url("org/prop/doc.pdf")

        call_kwargs = self.mock_boto.generate_presigned_url.call_args
        assert call_kwargs.kwargs["ExpiresIn"] == 3600

    def test_get_document_url_client_error(self):
        """Should raise S3Error on ClientError."""
        self.mock_boto.generate_presigned_url.side_effect = ClientError(
            {"Error": {"Code": "InvalidKey", "Message": "Invalid key"}},
            "GeneratePresignedUrl",
        )

        with pytest.raises(S3Error):
            self.client.get_document_url("invalid/key")


class TestHealthCheck:
    """Test S3 health check."""

    def setup_method(self):
        """Set up test fixtures."""
        self.mock_boto = MagicMock()
        self.client = S3Client(client=self.mock_boto, bucket="test-bucket")

    def test_check_health_success(self):
        """Should return healthy status when bucket accessible."""
        self.mock_boto.head_bucket.return_value = {}
        self.mock_boto.put_object.return_value = {}
        self.mock_boto.delete_object.return_value = {}

        result = self.client.check_health()

        assert result["healthy"] is True
        assert result["bucket"] == "test-bucket"
        assert "writable" in result["message"]

    def test_check_health_write_probe_failure(self):
        """Should return unhealthy when the bucket exists but write access fails."""
        self.mock_boto.head_bucket.return_value = {}
        self.mock_boto.put_object.side_effect = ClientError(
            {"Error": {"Code": "403", "Message": "Forbidden"}},
            "PutObject",
        )

        result = self.client.check_health()

        assert result["healthy"] is False
        assert result["message"] == "Access denied during put_object"

    def test_check_health_bucket_not_found(self):
        """Should return unhealthy when bucket not found."""
        self.mock_boto.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "404", "Message": "Not found"}},
            "HeadBucket",
        )

        result = self.client.check_health()

        assert result["healthy"] is False
        assert "does not exist" in result["message"]

    def test_check_health_access_denied(self):
        """Should accept scoped tokens that deny bucket-level head checks."""
        self.mock_boto.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "403", "Message": "Forbidden"}},
            "HeadBucket",
        )

        result = self.client.check_health()

        assert result["healthy"] is True
        assert "bucket-level head check denied" in result["message"]

    def test_check_health_delete_probe_failure(self):
        """Should return unhealthy when the health object cannot be cleaned up."""
        self.mock_boto.head_bucket.return_value = {}
        self.mock_boto.put_object.return_value = {}
        self.mock_boto.delete_object.side_effect = ClientError(
            {"Error": {"Code": "403", "Message": "Forbidden"}},
            "DeleteObject",
        )

        result = self.client.check_health()

        assert result["healthy"] is False
        assert result["message"] == "Access denied during delete_object"

    def test_check_health_reports_delete_denied_after_head_denied(self):
        """Should still require cleanup access when bucket-level head is denied."""
        self.mock_boto.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "403", "Message": "Forbidden"}},
            "HeadBucket",
        )
        self.mock_boto.put_object.return_value = {}
        self.mock_boto.delete_object.side_effect = ClientError(
            {"Error": {"Code": "403", "Message": "Forbidden"}},
            "DeleteObject",
        )

        result = self.client.check_health()

        assert result["healthy"] is False
        assert result["message"] == "Access denied during delete_object"


class TestSingleton:
    """Test singleton pattern."""

    def teardown_method(self):
        """Reset singleton after each test."""
        reset_s3_client()

    def test_get_s3_client_returns_same_instance(self):
        """Should return the same instance on multiple calls."""
        with patch("app.services.extraction.s3_client.boto3"):
            client1 = get_s3_client()
            client2 = get_s3_client()

            assert client1 is client2

    def test_reset_s3_client_clears_singleton(self):
        """Should clear singleton and allow new instance."""
        with patch("app.services.extraction.s3_client.boto3"):
            client1 = get_s3_client()
            reset_s3_client()
            client2 = get_s3_client()

            assert client1 is not client2

    def test_reset_storage_client_handles_empty_singleton(self):
        """The renamed reset helper is a no-op when no singleton exists yet."""
        reset_storage_client()
