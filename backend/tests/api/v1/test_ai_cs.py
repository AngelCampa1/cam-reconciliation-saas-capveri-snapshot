from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock
from urllib.parse import quote
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as api_v1_router
from app.api.v1.ai_cs import clear_ai_cs_nonce_cache
from app.auth.dependencies import OrganizationContext, get_org_scoped_context
from app.config import get_public_knowledge, settings
from app.models.enums import UserRole
from app.models.user import User

SECRET = "test-ai-cs-context-secret"
USER_ID = "11111111-1111-1111-1111-111111111111"
ORG_ID = "22222222-2222-2222-2222-222222222222"


@pytest.fixture(autouse=True)
def ai_cs_secret(monkeypatch):
    monkeypatch.setattr(settings, "ai_cs_context_secret", SECRET)
    clear_ai_cs_nonce_cache()
    yield
    clear_ai_cs_nonce_cache()


@pytest.fixture
def authenticated_client() -> TestClient:
    app = FastAPI()
    app.include_router(api_v1_router, prefix="/api/v1")
    app.dependency_overrides[get_org_scoped_context] = lambda: OrganizationContext(
        client=MagicMock(),
        organization_id=UUID(ORG_ID),
        user=User(
            id=UUID(USER_ID),
            organization_id=UUID(ORG_ID),
            email="owner@example.com",
            full_name="Owner",
            role=UserRole.OWNER,
            is_platform_admin=False,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    )
    return TestClient(app)


@pytest.fixture
def unauthenticated_client() -> TestClient:
    app = FastAPI()
    app.include_router(api_v1_router, prefix="/api/v1")
    return TestClient(app)


def test_app_context_requires_authentication(unauthenticated_client: TestClient):
    path = f"/api/v1/ai-cs/app-context?appId=capveri&userId={USER_ID}"

    response = unauthenticated_client.get(path, headers=signed_headers(path))

    assert response.status_code == 401


def test_valid_signed_request_returns_signed_app_context(
    authenticated_client: TestClient,
):
    path = f"/api/v1/ai-cs/app-context?appId=capveri&userId={USER_ID}"

    response = authenticated_client.get(path, headers=signed_headers(path))

    assert response.status_code == 200
    body = response.json()
    public_knowledge = get_public_knowledge()
    assert body["assistantId"] == "ai-cs"
    assert body["appId"] == "capveri"
    assert body["appName"] == "CapVeri"
    assert body["authenticatedOnly"] is True
    assert body["description"] == public_knowledge["company"]["publicDescription"]
    assert body["sources"][0]["id"] == "pricing"
    assert set(body["navigation"][0]) == {"label", "path", "description"}
    assert body["navigation"][0]["path"].startswith("/")
    assert set(body["workflow"][0]) >= {"id", "label", "status"}
    assert body["workflow"][0]["status"] == "current"
    assert response.headers["Cache-Control"] == "private, max-age=300"
    assert response.headers["X-Ventora-Timestamp"]
    assert response.headers["X-Ventora-Nonce"]
    assert_response_signature(response, path)


def test_invalid_app_id_returns_404(authenticated_client: TestClient):
    path = f"/api/v1/ai-cs/app-context?appId=other&userId={USER_ID}"

    response = authenticated_client.get(
        path, headers=signed_headers(path, app_id="other")
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown app"


def test_missing_signature_returns_401(authenticated_client: TestClient):
    response = authenticated_client.get(
        f"/api/v1/ai-cs/app-context?appId=capveri&userId={USER_ID}"
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing signature"


def test_invalid_signature_returns_401(authenticated_client: TestClient):
    path = f"/api/v1/ai-cs/app-context?appId=capveri&userId={USER_ID}"
    headers = signed_headers(path)
    headers["X-Ventora-Signature"] = "0" * 64

    response = authenticated_client.get(path, headers=headers)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid signature"


def test_stale_timestamp_returns_401(authenticated_client: TestClient):
    path = f"/api/v1/ai-cs/app-context?appId=capveri&userId={USER_ID}"
    stale_timestamp = (
        (datetime.now(UTC) - timedelta(minutes=10))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )

    response = authenticated_client.get(
        path, headers=signed_headers(path, timestamp=stale_timestamp)
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid signature"


def test_nonce_replay_returns_401(authenticated_client: TestClient):
    path = f"/api/v1/ai-cs/app-context?appId=capveri&userId={USER_ID}"
    headers = signed_headers(path)

    first_response = authenticated_client.get(path, headers=headers)
    replay_response = authenticated_client.get(path, headers=headers)

    assert first_response.status_code == 200
    assert replay_response.status_code == 401
    assert replay_response.json()["detail"] == "Invalid signature"


def test_missing_secret_returns_503(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "ai_cs_context_secret", "")
    path = f"/api/v1/ai-cs/app-context?appId=capveri&userId={USER_ID}"

    response = authenticated_client.get(path, headers=signed_headers(path))

    assert response.status_code == 503
    assert response.json()["detail"] == "App context unavailable"


def test_current_path_is_sanitized_and_selects_route_workflow(
    authenticated_client: TestClient,
):
    raw_current_path = "https://app.capveri.com/reconciliation?token=secret"
    path = (
        f"/api/v1/ai-cs/app-context?appId=capveri&userId={USER_ID}"
        f"&currentPath={quote(raw_current_path, safe='')}"
    )

    response = authenticated_client.get(
        path, headers=signed_headers(path, current_path=raw_current_path)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["currentPath"] == "/reconciliation"
    assert [step["id"] for step in body["workflow"]][:2] == [
        "run-reconciliation",
        "map-expense-pools",
    ]
    assert body["workflow"][0]["label"] == "Review and calculate CAM billing"
    assert body["workflow"][0]["path"] == "/reconciliations"


def test_property_reconciliations_path_selects_reconciliation_workflow(
    authenticated_client: TestClient,
):
    raw_current_path = (
        "https://app.capveri.com/properties/33333333-3333-3333-3333-333333333333/"
        "reconciliations?period=2024"
    )
    path = (
        f"/api/v1/ai-cs/app-context?appId=capveri&userId={USER_ID}"
        f"&currentPath={quote(raw_current_path, safe='')}"
    )

    response = authenticated_client.get(
        path, headers=signed_headers(path, current_path=raw_current_path)
    )

    assert response.status_code == 200
    body = response.json()
    assert (
        body["currentPath"]
        == "/properties/33333333-3333-3333-3333-333333333333/reconciliations"
    )
    assert body["workflow"][0]["id"] == "run-reconciliation"


def signed_headers(
    path: str,
    *,
    app_id: str = "capveri",
    user_id: str = USER_ID,
    current_path: str | None = None,
    timestamp: str | None = None,
) -> dict[str, str]:
    request_timestamp = timestamp or datetime.now(UTC).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")
    nonce = uuid4().hex
    body: dict[str, str] = {"appId": app_id, "userId": user_id}
    if current_path is not None:
        body["currentPath"] = current_path
    body_hash = hashlib.sha256(stable_json(body).encode("utf-8")).hexdigest()
    payload = f"{request_timestamp}.{nonce}.GET.{path}.{body_hash}"
    signature = hmac.new(
        SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    )
    return {
        "X-Ventora-Timestamp": request_timestamp,
        "X-Ventora-Nonce": nonce,
        "X-Ventora-Signature": signature.hexdigest(),
    }


def assert_response_signature(response, path: str) -> None:
    timestamp = response.headers["X-Ventora-Timestamp"]
    nonce = response.headers["X-Ventora-Nonce"]
    body_hash = hashlib.sha256(stable_json(response.json()).encode("utf-8")).hexdigest()
    payload = f"{timestamp}.{nonce}.GET.{path}.{body_hash}"
    expected_signature = hmac.new(
        SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    assert response.headers["X-Ventora-Signature"] == expected_signature


def stable_json(value: dict) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
