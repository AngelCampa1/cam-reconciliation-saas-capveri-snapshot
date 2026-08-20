"""
R2-backed storage for lead-magnet downloadable assets.

Thin singleton over StorageClient pointed at the lead-magnets bucket.
The documents bucket (capveri-documents) is for tenant PDF uploads;
this bucket (capveri-lead-magnets) is for gated marketing assets.
"""

import logging

from app.config import settings
from app.services.extraction.s3_client import StorageClient

logger = logging.getLogger(__name__)

PRESIGN_TTL = 604800  # 7 days

_client: StorageClient | None = None


def _get_client() -> StorageClient:
    global _client
    if _client is None:
        _client = StorageClient(
            bucket=settings.lead_magnets_r2_bucket,
            endpoint_url=settings.documents_r2_endpoint_url or None,
            region_name=settings.documents_r2_region,
        )
    return _client


def reset_asset_storage_client() -> None:
    global _client
    if _client is not None:
        _client.close()
    _client = None


def get_lead_magnet_url(storage_path: str) -> str:
    """Return a 7-day presigned GET URL for a lead-magnet asset key."""
    return _get_client().get_document_url(storage_path, expires_in=PRESIGN_TTL)
