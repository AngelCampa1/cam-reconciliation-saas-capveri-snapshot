"""API tests for the `/api/v1/extractions` endpoints."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.database.client import get_supabase, get_supabase_admin
from app.main import app
from app.models.enums import DocumentStatus, DocumentType, UserRole
from app.models.user import User
from app.services.extraction.job_queue import ExtractionJob
from app.services.extraction.openrouter_client import get_openrouter_client
from app.services.extraction.s3_client import get_storage_client


def _document_row(
    *,
    org_id: str,
    status: str = "pending",
    with_storage: bool = True,
    document_type: str = DocumentType.LEASE.value,
) -> dict:
    return {
        "id": str(uuid4()),
        "organization_id": org_id,
        "property_id": str(uuid4()),
        "filename": "lease.pdf",
        "storage_key": "docs/lease.pdf" if with_storage else "",
        "storage_bucket": "tenant-docs" if with_storage else "",
        "content_type": "application/pdf",
        "file_size_bytes": 1024,
        "document_type": document_type,
        "status": status,
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


def _setup_process_doc_query(
    test_client: TestClient, document_data: dict | None
) -> None:
    doc_query = MagicMock()
    (
        doc_query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data=document_data)
    test_client.mock_supabase.table.return_value = doc_query


@pytest.fixture
def test_user() -> User:
    return User(
        id=uuid4(),
        organization_id=uuid4(),
        email="extractor@example.com",
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def test_client(test_user: User):
    mock_supabase = MagicMock()
    mock_supabase_admin = MagicMock()

    async def mock_get_user() -> User:
        return test_user

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin

    client = TestClient(app)
    client.mock_supabase = mock_supabase
    client.mock_supabase_admin = mock_supabase_admin
    client.test_user = test_user
    yield client
    app.dependency_overrides.clear()


def test_list_extractions_returns_items_with_confidence_summary(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    query = MagicMock()
    list_response = MagicMock(
        data=[
            _document_row(
                org_id=org_id,
                status=DocumentStatus.READY_FOR_REVIEW.value,
            )
            | {
                "extraction_result": {
                    "confidence_scores": {"pro_rata_share": 0.95, "cap_rate": 0.6}
                }
            },
            _document_row(
                org_id=org_id,
                status=DocumentStatus.PENDING.value,
            ),
        ],
        count=2,
    )
    org_query = query.select.return_value.eq.return_value
    org_query.order.return_value.range.return_value.execute.return_value = list_response
    (
        org_query.in_.return_value.order.return_value.range.return_value.execute.return_value
    ) = list_response
    test_client.mock_supabase.table.return_value = query

    response = test_client.get("/api/v1/extractions?page=1&page_size=20")

    assert response.status_code == 200
    org_query.in_.assert_called_once_with(
        "document_type", [DocumentType.LEASE.value, DocumentType.AMENDMENT.value]
    )
    payload = response.json()
    assert payload["total"] == 2
    assert payload["has_next"] is False
    assert len(payload["items"]) == 2
    assert payload["items"][0]["average_confidence"] == pytest.approx(0.775)
    assert payload["items"][0]["low_confidence_count"] == 1


def test_list_extractions_applies_status_filter_and_handles_empty_scores(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    query = MagicMock()
    list_response = MagicMock(
        data=[
            _document_row(
                org_id=org_id,
                status=DocumentStatus.READY_FOR_REVIEW.value,
            )
            | {"extraction_result": {"confidence_scores": {}}},
            _document_row(
                org_id=org_id,
                status=DocumentStatus.READY_FOR_REVIEW.value,
            )
            | {"extraction_result": {"confidence_scores": {"base_year": "high"}}},
        ],
        count=2,
    )
    org_query = query.select.return_value.eq.return_value
    type_query = org_query.in_.return_value
    status_query = type_query.order.return_value.eq.return_value
    status_query.range.return_value.execute.return_value = list_response
    test_client.mock_supabase.table.return_value = query

    response = test_client.get(
        f"/api/v1/extractions?status={DocumentStatus.READY_FOR_REVIEW.value}"
    )

    assert response.status_code == 200
    status_query.range.assert_called_once_with(0, 19)
    payload = response.json()
    assert payload["total"] == 2
    assert payload["items"][0]["average_confidence"] is None
    assert payload["items"][1]["low_confidence_count"] == 0


def test_list_extractions_returns_empty_page(test_client: TestClient):
    query = MagicMock()
    org_query = query.select.return_value.eq.return_value
    org_query.in_.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
        data=[], count=0
    )
    test_client.mock_supabase.table.return_value = query

    response = test_client.get("/api/v1/extractions?page=2&page_size=10")

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "total": 0,
        "page": 2,
        "page_size": 10,
        "has_next": False,
    }


def test_list_extractions_validates_pagination_inputs(test_client: TestClient):
    page_response = test_client.get("/api/v1/extractions?page=0&page_size=20")
    assert page_response.status_code == 400
    assert "Page must be >= 1" in page_response.json()["detail"]

    size_response = test_client.get("/api/v1/extractions?page=1&page_size=101")
    assert size_response.status_code == 400
    assert "Page size must be 1-100" in size_response.json()["detail"]


def test_health_check_reports_storage_and_document_reader(test_client: TestClient):
    storage_client = MagicMock()
    storage_client.check_health.return_value = {
        "healthy": True,
        "provider": "cloudflare_r2",
        "bucket": "tenant-docs",
    }
    app.dependency_overrides[get_storage_client] = lambda: storage_client
    app.dependency_overrides[get_openrouter_client] = lambda: MagicMock()

    response = test_client.get("/api/v1/extractions/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["healthy"] is True
    assert payload["storage"]["provider"] == "cloudflare_r2"
    assert "document_reader" in payload
    app.dependency_overrides.pop(get_storage_client, None)
    app.dependency_overrides.pop(get_openrouter_client, None)


def test_process_extraction_success_path(test_client: TestClient):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()

    _setup_process_doc_query(
        test_client,
        _document_row(
            org_id=org_id,
            status=DocumentStatus.PENDING.value,
            with_storage=True,
        )
        | {"id": str(document_id)},
    )

    admin_query = MagicMock()
    admin_query.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(document_id)}]
    )
    test_client.mock_supabase_admin.table.return_value = admin_query

    with patch(
        "app.api.v1.extraction.create_extraction_job",
        AsyncMock(
            return_value=ExtractionJob(
                id=uuid4(),
                document_id=document_id,
                organization_id=test_client.test_user.organization_id,
            )
        ),
    ):
        response = test_client.post(f"/api/v1/extractions/{document_id}/process")

    assert response.status_code == 202
    payload = response.json()
    assert payload["success"] is True
    assert payload["document_id"] == str(document_id)
    assert payload["status"] == DocumentStatus.PROCESSING.value
    assert payload["message"] == "Extraction job queued"


def test_process_extraction_accepts_amendment_document_type(test_client: TestClient):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()

    _setup_process_doc_query(
        test_client,
        _document_row(
            org_id=org_id,
            status=DocumentStatus.PENDING.value,
            with_storage=True,
            document_type=DocumentType.AMENDMENT.value,
        )
        | {"id": str(document_id)},
    )
    admin_query = MagicMock()
    admin_query.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(document_id)}]
    )
    test_client.mock_supabase_admin.table.return_value = admin_query

    with patch(
        "app.api.v1.extraction.create_extraction_job",
        AsyncMock(
            return_value=ExtractionJob(
                id=uuid4(),
                document_id=document_id,
                organization_id=test_client.test_user.organization_id,
            )
        ),
    ):
        response = test_client.post(f"/api/v1/extractions/{document_id}/process")

    assert response.status_code == 202


def test_process_extraction_rejects_missing_storage_location(test_client: TestClient):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()

    _setup_process_doc_query(
        test_client,
        _document_row(
            org_id=org_id,
            status=DocumentStatus.PENDING.value,
            with_storage=False,
        )
        | {"id": str(document_id)},
    )
    response = test_client.post(f"/api/v1/extractions/{document_id}/process")
    assert response.status_code == 400
    assert "object storage location" in response.json()["detail"]


def test_process_extraction_validates_document_access(test_client: TestClient):
    document_id = uuid4()
    _setup_process_doc_query(test_client, None)

    response = test_client.post(f"/api/v1/extractions/{document_id}/process")

    assert response.status_code == 404
    assert "Document not found" in response.json()["detail"]


def test_process_extraction_validates_document_status(test_client: TestClient):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()

    _setup_process_doc_query(
        test_client,
        _document_row(
            org_id=org_id,
            status=DocumentStatus.PROCESSING.value,
            with_storage=True,
        )
        | {"id": str(document_id)},
    )
    status_response = test_client.post(f"/api/v1/extractions/{document_id}/process")
    assert status_response.status_code == 400
    assert (
        "Document must be in PENDING or FAILED status"
        in status_response.json()["detail"]
    )


def test_process_extraction_rejects_non_lease_document_types(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()

    _setup_process_doc_query(
        test_client,
        _document_row(
            org_id=org_id,
            status=DocumentStatus.PENDING.value,
            with_storage=True,
            document_type=DocumentType.RENT_ROLL.value,
        )
        | {"id": str(document_id)},
    )

    response = test_client.post(f"/api/v1/extractions/{document_id}/process")

    assert response.status_code == 400
    assert "lease or amendment documents" in response.json()["detail"]


def test_process_extraction_rejects_non_lease_before_storage_validation(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()

    _setup_process_doc_query(
        test_client,
        _document_row(
            org_id=org_id,
            status=DocumentStatus.PENDING.value,
            with_storage=False,
            document_type=DocumentType.GL_EXPORT.value,
        )
        | {"id": str(document_id)},
    )

    response = test_client.post(f"/api/v1/extractions/{document_id}/process")

    assert response.status_code == 400
    assert "lease or amendment documents" in response.json()["detail"]


def test_get_extraction_detail_rejects_non_lease_document_types(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    query = MagicMock()
    (
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(
        data=_document_row(
            org_id=org_id,
            status=DocumentStatus.READY_FOR_REVIEW.value,
            document_type=DocumentType.RENT_ROLL.value,
        )
        | {"id": str(document_id)}
    )
    test_client.mock_supabase.table.return_value = query

    response = test_client.get(f"/api/v1/extractions/{document_id}")

    assert response.status_code == 400
    assert "lease or amendment documents" in response.json()["detail"]


def test_approve_extraction_rejects_non_lease_document_types(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    query = MagicMock()
    (
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(
        data=_document_row(
            org_id=org_id,
            status=DocumentStatus.READY_FOR_REVIEW.value,
            document_type=DocumentType.RENT_ROLL.value,
        )
        | {"id": str(document_id)}
    )
    test_client.mock_supabase.table.return_value = query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/approve",
        json={"profile": {"pro_rata_share": "0.12"}, "edit_history": []},
    )

    assert response.status_code == 400
    assert "lease or amendment documents" in response.json()["detail"]


def test_save_draft_rejects_non_lease_document_types(test_client: TestClient):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    query = MagicMock()
    (
        query.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value
    ) = MagicMock(
        data=_document_row(
            org_id=org_id,
            status=DocumentStatus.READY_FOR_REVIEW.value,
            document_type=DocumentType.GL_EXPORT.value,
        )
        | {"id": str(document_id)}
    )
    test_client.mock_supabase.table.return_value = query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/draft",
        json={"profile": {"pro_rata_share": "0.12"}},
    )

    assert response.status_code == 400
    assert "lease or amendment documents" in response.json()["detail"]


def test_reject_extraction_rejects_non_lease_document_types(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    query = MagicMock()
    (
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(
        data=_document_row(
            org_id=org_id,
            status=DocumentStatus.READY_FOR_REVIEW.value,
            document_type=DocumentType.RENT_ROLL.value,
        )
        | {"id": str(document_id)}
    )
    test_client.mock_supabase.table.return_value = query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/reject",
        json={"reason": "wrong_document_type", "notes": "rent roll", "requeue": False},
    )

    assert response.status_code == 400
    assert "lease or amendment documents" in response.json()["detail"]


def test_process_extraction_marks_document_failed_when_enqueue_fails(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()

    _setup_process_doc_query(
        test_client,
        _document_row(
            org_id=org_id,
            status=DocumentStatus.PENDING.value,
            with_storage=True,
        )
        | {"id": str(document_id)},
    )

    admin_query = MagicMock()
    admin_query.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(document_id)}]
    )
    test_client.mock_supabase_admin.table.return_value = admin_query

    with patch(
        "app.api.v1.extraction.create_extraction_job",
        AsyncMock(side_effect=RuntimeError("broker down")),
    ):
        response = test_client.post(f"/api/v1/extractions/{document_id}/process")

    assert response.status_code == 503
    assert response.json()["detail"] == "Failed to enqueue extraction job"
    update_calls = [call_args[0][0] for call_args in admin_query.update.call_args_list]
    assert update_calls[0]["status"] == DocumentStatus.PROCESSING.value
    assert update_calls[1]["status"] == DocumentStatus.FAILED.value


def test_process_extraction_returns_404_when_processing_update_fails(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()

    _setup_process_doc_query(
        test_client,
        _document_row(
            org_id=org_id,
            status=DocumentStatus.PENDING.value,
            with_storage=True,
        )
        | {"id": str(document_id)},
    )
    admin_query = MagicMock()
    admin_query.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    test_client.mock_supabase_admin.table.return_value = admin_query

    response = test_client.post(f"/api/v1/extractions/{document_id}/process")

    assert response.status_code == 404
    assert "Document not found" in response.json()["detail"]


def test_approve_extraction_rejects_already_verified_document(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    query = MagicMock()
    (
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(
        data=_document_row(
            org_id=org_id,
            status=DocumentStatus.VERIFIED.value,
        )
        | {"id": str(document_id)}
    )
    test_client.mock_supabase.table.return_value = query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/approve",
        json={"profile": {"pro_rata_share": "0.12"}, "edit_history": []},
    )

    assert response.status_code == 400
    assert "already been verified" in response.json()["detail"]


def test_approve_extraction_validates_lease_property_match(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    lease_id = uuid4()
    query = MagicMock()
    query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=_document_row(
            org_id=org_id,
            status=DocumentStatus.READY_FOR_REVIEW.value,
        )
        | {"id": str(document_id), "lease_id": str(lease_id)}
    )
    query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data=None
    )
    query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.side_effect = [
        MagicMock(
            data=_document_row(
                org_id=org_id,
                status=DocumentStatus.READY_FOR_REVIEW.value,
            )
            | {"id": str(document_id), "lease_id": str(lease_id)}
        ),
        MagicMock(data=None),
    ]
    test_client.mock_supabase.table.return_value = query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/approve",
        json={"profile": {"pro_rata_share": "0.12"}, "edit_history": []},
    )

    assert response.status_code == 400
    assert "Lease does not belong" in response.json()["detail"]


def test_approve_extraction_returns_404_when_lease_update_fails(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    lease_id = uuid4()
    document_data = _document_row(
        org_id=org_id,
        status=DocumentStatus.READY_FOR_REVIEW.value,
    ) | {"id": str(document_id), "lease_id": str(lease_id)}

    query = MagicMock()
    query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.side_effect = [
        MagicMock(data=document_data),
        MagicMock(data={"id": str(lease_id)}),
    ]
    test_client.mock_supabase.table.return_value = query
    admin_query = MagicMock()
    admin_query.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    test_client.mock_supabase_admin.table.return_value = admin_query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/approve",
        json={"profile": {"pro_rata_share": "0.12"}, "edit_history": []},
    )

    assert response.status_code == 404
    assert "Lease not found" in response.json()["detail"]


def test_approve_extraction_persists_request_lease_id_when_document_is_unlinked(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    lease_id = uuid4()
    document_data = _document_row(
        org_id=org_id,
        status=DocumentStatus.READY_FOR_REVIEW.value,
    ) | {"id": str(document_id), "lease_id": None}

    query = MagicMock()
    query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.side_effect = [
        MagicMock(data=document_data),
        MagicMock(data={"id": str(lease_id)}),
    ]
    query.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(document_id)}]
    )
    test_client.mock_supabase.table.return_value = query
    admin_query = MagicMock()
    admin_query.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(lease_id)}]
    )
    test_client.mock_supabase_admin.table.return_value = admin_query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/approve",
        json={
            "profile": {"pro_rata_share": "0.12"},
            "edit_history": [],
            "lease_id": str(lease_id),
        },
    )

    assert response.status_code == 200
    document_update = query.update.call_args[0][0]
    assert document_update["lease_id"] == str(lease_id)


def test_approve_extraction_returns_500_when_document_update_fails(
    test_client: TestClient,
):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    lease_id = uuid4()
    document_data = _document_row(
        org_id=org_id,
        status=DocumentStatus.READY_FOR_REVIEW.value,
    ) | {
        "id": str(document_id),
        "lease_id": str(lease_id),
    }

    supabase_query = MagicMock()
    (
        supabase_query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data=document_data)
    supabase_query.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    test_client.mock_supabase.table.return_value = supabase_query

    admin_query = MagicMock()
    admin_query.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(lease_id)}]
    )
    test_client.mock_supabase_admin.table.return_value = admin_query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/approve",
        json={
            "profile": {"pro_rata_share": "0.12"},
            "edit_history": [],
        },
    )

    assert response.status_code == 500
    assert "Failed to mark document as verified" in response.json()["detail"]


def test_save_draft_returns_404_when_document_missing(test_client: TestClient):
    document_id = uuid4()
    query = MagicMock()
    (
        query.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value
    ) = MagicMock(data=None)
    test_client.mock_supabase.table.return_value = query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/draft",
        json={"profile": {"pro_rata_share": "0.12"}},
    )

    assert response.status_code == 404


def test_save_draft_merges_existing_extraction_result(test_client: TestClient):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    document_data = _document_row(
        org_id=org_id,
        status=DocumentStatus.READY_FOR_REVIEW.value,
    ) | {"id": str(document_id)}
    query = MagicMock()
    query.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = [
        MagicMock(data=document_data),
        MagicMock(data={"extraction_result": {"profile": {"base_year": 2020}}}),
    ]
    query.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[{"id": str(document_id)}])
    )
    test_client.mock_supabase.table.return_value = query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/draft",
        json={"profile": {"pro_rata_share": "0.12"}},
    )

    assert response.status_code == 200
    draft_update = query.update.call_args[0][0]
    assert draft_update["extraction_result"]["profile"] == {"base_year": 2020}
    assert draft_update["extraction_result"]["draft_profile"] == {
        "pro_rata_share": "0.12"
    }


def test_save_draft_returns_500_when_update_fails(test_client: TestClient):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    document_data = _document_row(
        org_id=org_id,
        status=DocumentStatus.READY_FOR_REVIEW.value,
    ) | {"id": str(document_id)}
    query = MagicMock()
    query.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = [
        MagicMock(data=document_data),
        MagicMock(data={"extraction_result": {}}),
    ]
    query.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    test_client.mock_supabase.table.return_value = query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/draft",
        json={"profile": {"pro_rata_share": "0.12"}},
    )

    assert response.status_code == 500
    assert "Failed to save draft" in response.json()["detail"]


def test_reject_extraction_returns_404_when_document_missing(test_client: TestClient):
    document_id = uuid4()
    query = MagicMock()
    (
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data=None)
    test_client.mock_supabase.table.return_value = query

    response = test_client.put(
        f"/api/v1/extractions/{document_id}/reject",
        json={"reason": "low_confidence", "notes": "missing", "requeue": False},
    )

    assert response.status_code == 404


def test_reject_extraction_rejects_finalized_statuses(test_client: TestClient):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    query = MagicMock()
    execute = (
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute
    )
    test_client.mock_supabase.table.return_value = query

    execute.return_value = MagicMock(
        data=_document_row(
            org_id=org_id,
            status=DocumentStatus.VERIFIED.value,
        )
        | {"id": str(document_id)}
    )
    verified_response = test_client.put(
        f"/api/v1/extractions/{document_id}/reject",
        json={"reason": "low_confidence", "notes": "verified", "requeue": False},
    )
    assert verified_response.status_code == 400
    assert "Cannot reject a verified document" in verified_response.json()["detail"]

    execute.return_value = MagicMock(
        data=_document_row(
            org_id=org_id,
            status=DocumentStatus.REJECTED.value,
        )
        | {"id": str(document_id)}
    )
    rejected_response = test_client.put(
        f"/api/v1/extractions/{document_id}/reject",
        json={"reason": "low_confidence", "notes": "rejected", "requeue": False},
    )
    assert rejected_response.status_code == 400
    assert "already been rejected" in rejected_response.json()["detail"]


def test_reject_extraction_handles_requeue_and_update_failure(test_client: TestClient):
    org_id = str(test_client.test_user.organization_id)
    document_id = uuid4()
    document_data = _document_row(
        org_id=org_id,
        status=DocumentStatus.READY_FOR_REVIEW.value,
    ) | {"id": str(document_id)}

    supabase_query_fail = MagicMock()
    (
        supabase_query_fail.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data=document_data)
    supabase_query_fail.update.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    test_client.mock_supabase.table.return_value = supabase_query_fail

    fail_response = test_client.put(
        f"/api/v1/extractions/{document_id}/reject",
        json={"reason": "low_confidence", "notes": "bad data", "requeue": False},
    )
    assert fail_response.status_code == 500
    assert "Failed to mark document as rejected" in fail_response.json()["detail"]

    supabase_query_ok = MagicMock()
    (
        supabase_query_ok.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data=document_data)
    supabase_query_ok.update.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[{"id": str(document_id)}])
    )
    test_client.mock_supabase.table.return_value = supabase_query_ok

    job = SimpleNamespace(id=uuid4())
    with patch(
        "app.api.v1.extraction.create_extraction_job",
        AsyncMock(return_value=job),
    ):
        requeue_response = test_client.put(
            f"/api/v1/extractions/{document_id}/reject",
            json={"reason": "low_confidence", "notes": "retry", "requeue": True},
        )

    assert requeue_response.status_code == 200
    assert "queued for retry" in requeue_response.json()["message"]
    update_payload = supabase_query_ok.update.call_args.args[0]
    assert update_payload["status"] == DocumentStatus.PROCESSING.value
    assert update_payload["rejection_reason"] == "low_confidence"
    assert update_payload["rejection_notes"] == "retry"


def test_job_status_and_retry_error_paths(test_client: TestClient):
    job_id = uuid4()

    with patch(
        "app.api.v1.extraction.get_extraction_job",
        AsyncMock(return_value=None),
    ) as mock_get_job:
        missing_job = test_client.get(f"/api/v1/extractions/jobs/{job_id}")
    assert missing_job.status_code == 404
    mock_get_job.assert_awaited_once_with(
        job_id, organization_id=test_client.test_user.organization_id
    )

    own_job = ExtractionJob(
        id=job_id,
        document_id=uuid4(),
        organization_id=test_client.test_user.organization_id,
    )
    with patch(
        "app.api.v1.extraction.get_extraction_job",
        AsyncMock(return_value=own_job),
    ):
        own_response = test_client.get(f"/api/v1/extractions/jobs/{job_id}")
    assert own_response.status_code == 200

    with patch(
        "app.api.v1.extraction.get_extraction_job",
        AsyncMock(return_value=None),
    ) as mock_get_job:
        retry_missing_before_ownership_check = test_client.post(
            f"/api/v1/extractions/jobs/{job_id}/retry"
        )
    assert retry_missing_before_ownership_check.status_code == 404
    mock_get_job.assert_awaited_once_with(
        job_id, organization_id=test_client.test_user.organization_id
    )

    with (
        patch(
            "app.api.v1.extraction.get_extraction_job",
            AsyncMock(return_value=own_job),
        ),
        patch(
            "app.api.v1.extraction.retry_extraction_job",
            AsyncMock(return_value=None),
        ) as mock_retry,
    ):
        retry_missing = test_client.post(f"/api/v1/extractions/jobs/{job_id}/retry")
    assert retry_missing.status_code == 404
    mock_retry.assert_awaited_once_with(
        job_id, organization_id=test_client.test_user.organization_id
    )

    with (
        patch(
            "app.api.v1.extraction.get_extraction_job",
            AsyncMock(return_value=own_job),
        ),
        patch(
            "app.api.v1.extraction.retry_extraction_job",
            AsyncMock(side_effect=ValueError("cannot retry")),
        ),
    ):
        retry_bad = test_client.post(f"/api/v1/extractions/jobs/{job_id}/retry")
    assert retry_bad.status_code == 400
    assert "cannot retry" in retry_bad.json()["detail"]
