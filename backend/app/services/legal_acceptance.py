"""Record immutable legal assent events."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status

from app.database.client import SupabaseDB
from app.legal_terms import (
    TERMS_DOCUMENT_TYPE,
    TERMS_HASH,
    TERMS_VERSION,
)


def assert_current_terms_acceptance(
    accepted_terms: bool,
    terms_version: str,
    terms_hash: str,
) -> None:
    """Reject signup attempts that do not assent to the active terms."""
    if (
        accepted_terms is not True
        or terms_version != TERMS_VERSION
        or terms_hash != TERMS_HASH
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You must accept the current CapVeri Terms of Service.",
        )


def record_terms_acceptance(
    db: SupabaseDB,
    *,
    user_id: str,
    organization_id: str,
    source: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Insert an append-only legal acceptance row."""
    row = {
        "user_id": user_id,
        "organization_id": organization_id,
        "document_type": TERMS_DOCUMENT_TYPE,
        "document_version": TERMS_VERSION,
        "document_hash": TERMS_HASH,
        "accepted_at": datetime.now(UTC).isoformat(),
        "ip_address": ip_address,
        "user_agent": user_agent,
        "source": source,
        "metadata": metadata or {},
    }
    db.table("legal_acceptances").insert(row).execute()
