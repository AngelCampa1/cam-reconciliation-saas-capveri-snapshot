"""E2E-style test for queue-first extraction API flow."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.database.client import get_supabase, get_supabase_admin
from app.main import app
from app.models.enums import DocumentType, UserRole
from app.models.user import User
from app.services.extraction.job_queue import ExtractionJob


@pytest.mark.e2e
def test_process_endpoint_queues_job_e2e() -> None:
    """Queue-first process endpoint returns 202 + job id."""
    user = User(
        id=uuid4(),
        organization_id=uuid4(),
        email="e2e@capveri.com",
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    doc_id = uuid4()
    mock_supabase = MagicMock()
    mock_admin = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "id": str(doc_id),
        "organization_id": str(user.organization_id),
        "property_id": str(uuid4()),
        "filename": "lease.pdf",
        "storage_key": "docs/lease.pdf",
        "storage_bucket": "bucket",
        "content_type": "application/pdf",
        "file_size_bytes": 1024,
        "document_type": DocumentType.LEASE.value,
        "status": "pending",
        "reader_job_id": None,
        "extraction_result": None,
        "error_message": None,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
        "processed_at": None,
        "verified_by": None,
        "verified_at": None,
        "edit_history": [],
        "lease_id": str(uuid4()),
    }
    mock_admin.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"id": str(doc_id)}
    ]

    async def _user() -> User:
        return user

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_supabase_admin] = lambda: mock_admin
    client = TestClient(app)
    try:
        with patch(
            "app.api.v1.extraction.create_extraction_job",
            AsyncMock(
                return_value=ExtractionJob(
                    id=uuid4(),
                    document_id=doc_id,
                    organization_id=user.organization_id,
                )
            ),
        ):
            response = client.post(f"/api/v1/extractions/{doc_id}/process")
        assert response.status_code == 202
        body = response.json()
        assert body["document_id"] == str(doc_id)
        assert body["job_id"] is not None
    finally:
        app.dependency_overrides.clear()
