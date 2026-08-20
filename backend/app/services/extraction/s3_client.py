"""
Object storage client backed by Cloudflare R2.

The module keeps the legacy ``s3_client`` filename so existing imports continue
to resolve during the migration, but the runtime implementation now targets
Cloudflare R2 via the S3-compatible API.
"""

import logging
from typing import Any, cast
from uuid import UUID, uuid4

import boto3
import pybreaker
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.core.circuit_breakers import get_s3_breaker
from app.exceptions.handlers import ServiceUnavailableError

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """Base exception for object-storage errors."""

    def __init__(self, message: str, original_error: Exception | None = None):
        self.message = message
        self.original_error = original_error
        super().__init__(message)


class StorageClient:
    """Cloudflare R2 client wrapper.

    Compatibility aliases are retained for older storage config imports.
    """

    PDF_MAGIC_BYTES = b"%PDF"
    MAX_FILE_SIZE = 50 * 1024 * 1024
    HEALTH_CHECK_PREFIX = "__healthchecks__/documents"
    _owns_client: bool = True

    def __init__(
        self,
        client: Any | None = None,
        bucket: str | None = None,
        endpoint_url: str | None = None,
        region_name: str | None = None,
    ) -> None:
        self.config = Config(
            retries={"max_attempts": 3, "mode": "adaptive"},
            connect_timeout=5,
            read_timeout=30,
            signature_version="s3v4",
        )
        self.bucket = bucket or settings.documents_r2_bucket
        self.endpoint_url = endpoint_url or settings.documents_r2_endpoint_url or None
        self.region_name = region_name or settings.documents_r2_region

        if client is not None:
            self._client = client
            self._owns_client = False
        else:
            self._owns_client = True
            client_kwargs: dict[str, Any] = {
                "service_name": "s3",
                "region_name": self.region_name,
                "config": self.config,
            }
            if self.endpoint_url:
                client_kwargs["endpoint_url"] = self.endpoint_url

            access_key = settings.documents_r2_access_key_id
            secret_key = settings.documents_r2_secret_access_key
            if access_key and secret_key:
                client_kwargs["aws_access_key_id"] = access_key
                client_kwargs["aws_secret_access_key"] = secret_key

            self._client = boto3.client(**client_kwargs)

    def close(self) -> None:
        if self._owns_client and self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None

    @property
    def client(self) -> Any:
        return self._client

    def generate_storage_key(
        self,
        organization_id: UUID,
        property_id: UUID,
        filename: str,
    ) -> str:
        ext = ".pdf"
        if "." in filename:
            ext = "." + filename.rsplit(".", 1)[-1].lower()
        unique_id = uuid4()
        return f"{organization_id}/{property_id}/{unique_id}{ext}"

    def generate_s3_key(
        self,
        organization_id: UUID,
        property_id: UUID,
        filename: str,
    ) -> str:
        """Compatibility wrapper for older call sites/tests."""
        return self.generate_storage_key(organization_id, property_id, filename)

    def validate_pdf(self, content: bytes) -> bool:
        return len(content) >= 4 and content[:4] == self.PDF_MAGIC_BYTES

    def validate_file_size(self, content: bytes) -> bool:
        return len(content) <= self.MAX_FILE_SIZE

    def upload_document(
        self,
        key: str,
        content: bytes,
        content_type: str = "application/pdf",
        metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        try:
            put_kwargs: dict[str, Any] = {
                "Bucket": self.bucket,
                "Key": key,
                "Body": content,
                "ContentType": content_type,
            }
            if metadata:
                put_kwargs["Metadata"] = metadata

            response = get_s3_breaker().call(
                lambda: self._client.put_object(**put_kwargs)
            )
            return {
                "bucket": self.bucket,
                "key": key,
                "etag": response.get("ETag", "").strip('"'),
                "version_id": response.get("VersionId"),
            }
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Object storage", original_error=e, retry_after=30
            ) from e
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            error_msg = e.response.get("Error", {}).get("Message", str(e))
            raise StorageError(
                f"Failed to upload document: {error_code} - {error_msg}",
                original_error=e,
            ) from e
        except BotoCoreError as e:
            raise StorageError(
                f"Object storage client error uploading document: {str(e)}",
                original_error=e,
            ) from e

    def delete_document(self, key: str) -> bool:
        try:
            get_s3_breaker().call(
                lambda: self._client.delete_object(Bucket=self.bucket, Key=key)
            )
            return True
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Object storage", original_error=e, retry_after=30
            ) from e
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            error_msg = e.response.get("Error", {}).get("Message", str(e))
            raise StorageError(
                f"Failed to delete document: {error_code} - {error_msg}",
                original_error=e,
            ) from e
        except BotoCoreError as e:
            raise StorageError(
                f"Object storage client error deleting document: {str(e)}",
                original_error=e,
            ) from e

    def get_document_url(self, key: str, expires_in: int = 3600) -> str:
        try:
            return cast(
                str,
                self._client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self.bucket, "Key": key},
                    ExpiresIn=expires_in,
                ),
            )
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            error_msg = e.response.get("Error", {}).get("Message", str(e))
            raise StorageError(
                f"Failed to generate presigned URL: {error_code} - {error_msg}",
                original_error=e,
            ) from e
        except BotoCoreError as e:
            raise StorageError(
                f"Object storage client error generating URL: {str(e)}",
                original_error=e,
            ) from e

    def get_document_bytes(self, key: str) -> bytes:
        try:
            response = get_s3_breaker().call(
                lambda: self._client.get_object(Bucket=self.bucket, Key=key)
            )
            body = response["Body"].read()
            if not isinstance(body, bytes):
                raise StorageError("Object storage returned a non-bytes response body")
            return body
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Object storage", original_error=e, retry_after=30
            ) from e
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            error_msg = e.response.get("Error", {}).get("Message", str(e))
            raise StorageError(
                f"Failed to download document: {error_code} - {error_msg}",
                original_error=e,
            ) from e
        except BotoCoreError as e:
            raise StorageError(
                f"Object storage client error downloading document: {str(e)}",
                original_error=e,
            ) from e

    def _health_client_error(
        self, operation: str, error: ClientError
    ) -> dict[str, Any]:
        error_code = error.response.get("Error", {}).get("Code", "")
        if error_code == "404":
            message = f"Object storage bucket '{self.bucket}' does not exist"
        elif error_code == "403":
            message = f"Access denied during {operation}"
        else:
            message = f"Object storage error during {operation}: {error_code}"
        return {
            "healthy": False,
            "bucket": self.bucket,
            "provider": "cloudflare_r2",
            "endpoint": self.endpoint_url,
            "message": message,
        }

    def check_health(self) -> dict[str, Any]:
        probe_key = f"{self.HEALTH_CHECK_PREFIX}/{uuid4()}.txt"
        head_bucket_denied = False
        try:
            try:
                self._client.head_bucket(Bucket=self.bucket)
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                if error_code == "403":
                    head_bucket_denied = True
                else:
                    return self._health_client_error("head_bucket", e)

            try:
                self._client.put_object(
                    Bucket=self.bucket,
                    Key=probe_key,
                    Body=b"ok",
                    ContentType="text/plain",
                )
            except ClientError as e:
                return self._health_client_error("put_object", e)

            try:
                self._client.delete_object(Bucket=self.bucket, Key=probe_key)
            except ClientError as e:
                return self._health_client_error("delete_object", e)

            message = "Object storage bucket is writable"
            if head_bucket_denied:
                message += "; bucket-level head check denied"
            return {
                "healthy": True,
                "bucket": self.bucket,
                "provider": "cloudflare_r2",
                "endpoint": self.endpoint_url,
                "message": message,
            }
        except BotoCoreError as e:
            return {
                "healthy": False,
                "bucket": self.bucket,
                "provider": "cloudflare_r2",
                "endpoint": self.endpoint_url,
                "message": f"Object storage client error: {str(e)}",
            }


_storage_client: StorageClient | None = None


def get_storage_client() -> StorageClient:
    global _storage_client
    if _storage_client is None:
        _storage_client = StorageClient()
    return _storage_client


def reset_storage_client() -> None:
    global _storage_client
    if _storage_client is not None:
        _storage_client.close()
    _storage_client = None


# Backwards-compatible aliases for older imports/tests.
S3Client = StorageClient
S3Error = StorageError
get_s3_client = get_storage_client
reset_s3_client = reset_storage_client
