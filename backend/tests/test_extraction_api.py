"""Focused tests for extraction router behavior."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.extraction import router
from app.auth.dependencies import get_current_user
from app.database.client import get_supabase, get_supabase_admin
from app.models.user import User
from app.services.extraction.openrouter_client import get_openrouter_client
from app.services.extraction.s3_client import get_storage_client


def _document(
    *,
    organization_id: str,
    status: str = "ready_for_review",
    lease_id: str | None = None,
) -> dict:
    return {
        "id": str(uuid4()),
        "organization_id": organization_id,
        "property_id": str(uuid4()),
        "filename": "lease.pdf",
        "storage_key": "uploads/lease.pdf",
        "storage_bucket": "capveri-docs",
        "content_type": "application/pdf",
        "file_size_bytes": 100000,
        "document_type": "lease",
        "status": status,
        "reader_job_id": None,
        "extraction_result": {
            "profile": {"base_year": 2020, "pro_rata_share": 0.15},
            "confidence_scores": {"base_year": 0.95, "pro_rata_share": 0.92},
        },
        "error_message": None,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
        "processed_at": datetime.now(UTC).isoformat(),
        "verified_by": None,
        "verified_at": None,
        "edit_history": [],
        "lease_id": lease_id,
    }


class _BaseExtractionApiTest:
    def setup_method(self) -> None:
        self.app = FastAPI()
        self.app.include_router(router, prefix="/extraction")

        self.mock_user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            full_name="Test User",
            role="admin",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self.mock_supabase = MagicMock()
        self.mock_supabase_admin = MagicMock()

        self.app.dependency_overrides[get_current_user] = lambda: self.mock_user
        self.app.dependency_overrides[get_supabase] = lambda: self.mock_supabase
        self.app.dependency_overrides[get_supabase_admin] = (
            lambda: self.mock_supabase_admin
        )


class TestExtractionHealthEndpoint(_BaseExtractionApiTest):
    def test_health_endpoint_returns_stack_status(self):
        storage_client = MagicMock()
        storage_client.check_health.return_value = {
            "healthy": True,
            "provider": "cloudflare_r2",
            "bucket": "tenant-docs",
        }
        self.app.dependency_overrides[get_storage_client] = lambda: storage_client
        self.app.dependency_overrides[get_openrouter_client] = lambda: MagicMock()

        with TestClient(self.app) as client:
            response = client.get("/extraction/health")

        assert response.status_code == 200
        data = response.json()
        assert data["healthy"] is True
        assert data["storage"]["provider"] == "cloudflare_r2"
        assert "document_reader" in data


class TestApproveExtractionEndpoint(_BaseExtractionApiTest):
    def test_approve_extraction_success(self):
        document_id = uuid4()
        lease_id = uuid4()
        mock_document = _document(
            organization_id=str(self.mock_user.organization_id),
            status="ready_for_review",
            lease_id=str(lease_id),
        ) | {"id": str(document_id)}

        query = self.mock_supabase.table.return_value
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            mock_document
        )
        self.mock_supabase_admin.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {"id": str(lease_id)}
        ]
        query.update.return_value.eq.return_value.execute.return_value.data = [
            mock_document
        ]

        request_data = {
            "profile": {
                "base_year": 2020,
                "base_year_amount": "50000",
                "gross_up_base_year": False,
                "pro_rata_share": "0.15",
                "cap_type": "cumulative",
                "cap_rate": "0.03",
                "admin_fee_percentage": "0.15",
                "excluded_pools": [],
            },
            "edit_history": [],
        }

        with TestClient(self.app) as client:
            response = client.put(
                f"/extraction/{document_id}/approve", json=request_data
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["lease_id"] == str(lease_id)

    def test_approve_extraction_document_not_found(self):
        document_id = uuid4()
        query = self.mock_supabase.table.return_value
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            None
        )

        with TestClient(self.app) as client:
            response = client.put(
                f"/extraction/{document_id}/approve",
                json={
                    "profile": {
                        "base_year": 2020,
                        "base_year_amount": "50000",
                        "gross_up_base_year": False,
                        "pro_rata_share": "0.15",
                        "cap_type": "none",
                        "cap_rate": None,
                        "admin_fee_percentage": "0.15",
                        "excluded_pools": [],
                    },
                    "edit_history": [],
                },
            )

        assert response.status_code == 404
        assert "Document not found" in response.json()["detail"]

    def test_approve_extraction_requires_lease_link(self):
        document_id = uuid4()
        mock_document = _document(
            organization_id=str(self.mock_user.organization_id),
            status="ready_for_review",
            lease_id=None,
        ) | {"id": str(document_id)}
        query = self.mock_supabase.table.return_value
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            mock_document
        )

        with TestClient(self.app) as client:
            response = client.put(
                f"/extraction/{document_id}/approve",
                json={
                    "profile": {
                        "base_year": 2020,
                        "base_year_amount": "50000",
                        "gross_up_base_year": False,
                        "pro_rata_share": "0.15",
                        "cap_type": "none",
                        "cap_rate": None,
                        "admin_fee_percentage": "0.15",
                        "excluded_pools": [],
                    },
                    "edit_history": [],
                },
            )

        assert response.status_code == 400
        assert "linked to a lease" in response.json()["detail"]


class TestGetExtractionDetailEndpoint(_BaseExtractionApiTest):
    def test_get_extraction_detail_success(self):
        document_id = uuid4()
        mock_document = _document(
            organization_id=str(self.mock_user.organization_id),
            status="ready_for_review",
        ) | {"id": str(document_id), "reader_job_id": "openrouter:test"}

        query = self.mock_supabase.table.return_value
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            mock_document
        )

        storage_client = MagicMock()
        storage_client.get_document_url.return_value = (
            "https://presigned.example.com/uploads/lease.pdf"
        )
        self.app.dependency_overrides[get_storage_client] = lambda: storage_client

        with TestClient(self.app) as client:
            response = client.get(f"/extraction/{document_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(document_id)
        assert data["storage_bucket"] == "capveri-docs"
        assert data["storage_key"] == "uploads/lease.pdf"
        assert data["document_url"].startswith("https://presigned.example.com/")

    def test_get_extraction_detail_not_found(self):
        document_id = uuid4()
        query = self.mock_supabase.table.return_value
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            None
        )

        with TestClient(self.app) as client:
            response = client.get(f"/extraction/{document_id}")

        assert response.status_code == 404
        assert "not found or you don't have access" in response.json()["detail"]


class TestRejectExtractionEndpoint(_BaseExtractionApiTest):
    def test_reject_extraction_success(self):
        document_id = uuid4()
        mock_document = _document(
            organization_id=str(self.mock_user.organization_id),
            status="ready_for_review",
        ) | {"id": str(document_id)}

        query = self.mock_supabase.table.return_value
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            mock_document
        )
        query.update.return_value.eq.return_value.execute.return_value.data = [
            {"id": str(document_id)}
        ]

        with TestClient(self.app) as client:
            response = client.put(
                f"/extraction/{document_id}/reject",
                json={
                    "reason": "poor_ocr_quality",
                    "notes": "Pages were blurry",
                    "requeue": False,
                },
            )

        assert response.status_code == 200
        assert "rejected successfully" in response.json()["message"]

    def test_reject_extraction_requeues(self):
        document_id = uuid4()
        mock_document = _document(
            organization_id=str(self.mock_user.organization_id),
            status="ready_for_review",
        ) | {"id": str(document_id)}

        query = self.mock_supabase.table.return_value
        query.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            mock_document
        )
        query.update.return_value.eq.return_value.execute.return_value.data = [
            {"id": str(document_id)}
        ]

        with (
            patch(
                "app.api.v1.extraction.create_extraction_job",
                AsyncMock(return_value=MagicMock(id=uuid4())),
            ),
            TestClient(self.app) as client,
        ):
            response = client.put(
                f"/extraction/{document_id}/reject",
                json={
                    "reason": "poor_ocr_quality",
                    "notes": "retry please",
                    "requeue": True,
                },
            )

        assert response.status_code == 200
        assert "queued for retry" in response.json()["message"]
