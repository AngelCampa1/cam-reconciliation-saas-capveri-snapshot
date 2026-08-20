from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as api_v1_router
from app.api.v1.ai_sdr import (
    build_public_pricing_plans,
    clear_ai_sdr_nonce_cache,
    consume_nonce,
)
from app.config import get_public_knowledge, settings

SECRET = "test-ai-sdr-context-secret"


@pytest.fixture(autouse=True)
def ai_sdr_secret(monkeypatch):
    monkeypatch.setattr(settings, "ai_sdr_product_context_secret", SECRET)
    clear_ai_sdr_nonce_cache()
    yield
    clear_ai_sdr_nonce_cache()


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(api_v1_router, prefix="/api/v1")
    return TestClient(app)


def test_signed_product_context_returns_capveri_context(client: TestClient):
    path = "/api/v1/ai-sdr/product-context?productId=capveri"

    response = client.get(path, headers=signed_headers(path))

    assert response.status_code == 200
    body = response.json()
    public_knowledge = get_public_knowledge()
    assert body["productId"] == "capveri"
    assert body["name"] == "CapVeri"
    assert body["description"] == public_knowledge["company"]["publicDescription"]
    assert body["sources"][0]["id"] == "pricing"
    assert (
        body["sources"][0]["excerpt"]
        == public_knowledge["pricing"]["display"]["selfServeSummary"]
    )
    assert any(source["id"] == "compliance-claims" for source in body["sources"])
    assert set(body["sources"][0]) == {"id", "title", "url", "excerpt"}
    assert "Financial calculations are deterministic" in next(
        source["excerpt"]
        for source in body["sources"]
        if source["id"] == "compliance-claims"
    )
    assert body["plans"] == build_public_pricing_plans(public_knowledge)
    assert body["plans"][0].keys() >= {
        "id",
        "name",
        "price",
        "annualPrice",
        "discount",
        "defaultCadence",
        "trialDays",
        "ctaUrl",
        "features",
    }
    assert body["plans"][0]["annualPrice"] == body["plans"][0]["price"]
    assert body["plans"][0]["defaultCadence"] == "year"
    assert body["plans"][0]["trialDays"] == public_knowledge["pricing"]["trialDays"]
    assert "offer=80OFF" in body["plans"][0]["ctaUrl"]
    assert "plan=reconcile" in body["plans"][0]["ctaUrl"]
    assert response.headers["Cache-Control"] == "private, max-age=300"
    assert_response_signature(response, path)


def test_product_id_alias_is_supported(client: TestClient):
    path = "/api/v1/ai-sdr/product-context?product_id=capveri"

    response = client.get(path, headers=signed_headers(path))

    assert response.status_code == 200
    assert response.json()["productId"] == "capveri"


def test_unknown_product_returns_404(client: TestClient):
    path = "/api/v1/ai-sdr/product-context?productId=other"

    response = client.get(path, headers=signed_headers(path, product_id="other"))

    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown product"


def test_missing_signature_returns_401(client: TestClient):
    response = client.get("/api/v1/ai-sdr/product-context?productId=capveri")

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing signature"


def test_invalid_signature_returns_401(client: TestClient):
    path = "/api/v1/ai-sdr/product-context?productId=capveri"
    headers = signed_headers(path)
    headers["X-Ventora-Signature"] = "0" * 64

    response = client.get(path, headers=headers)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_returns_401(client: TestClient):
    path = "/api/v1/ai-sdr/product-context?productId=capveri"
    headers = signed_headers(path)
    headers["X-Ventora-Signature"] = "not-hex"

    response = client.get(path, headers=headers)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid signature"


def test_stale_signature_returns_401(client: TestClient):
    path = "/api/v1/ai-sdr/product-context?productId=capveri"
    stale_timestamp = (
        (datetime.now(UTC) - timedelta(minutes=10))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )

    response = client.get(path, headers=signed_headers(path, timestamp=stale_timestamp))

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid signature"


def test_invalid_timestamp_returns_401(client: TestClient):
    path = "/api/v1/ai-sdr/product-context?productId=capveri"

    response = client.get(path, headers=signed_headers(path, timestamp="not-a-date"))

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid signature"


def test_nonce_replay_returns_401(client: TestClient):
    path = "/api/v1/ai-sdr/product-context?productId=capveri"
    headers = signed_headers(path)

    first_response = client.get(path, headers=headers)
    replay_response = client.get(path, headers=headers)

    assert first_response.status_code == 200
    assert replay_response.status_code == 401
    assert replay_response.json()["detail"] == "Invalid signature"


def test_missing_secret_returns_503(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "ai_sdr_product_context_secret", "")
    monkeypatch.setattr(settings, "ai_sdr_context_secret", "")
    path = "/api/v1/ai-sdr/product-context?productId=capveri"

    response = client.get(path, headers=signed_headers(path))

    assert response.status_code == 503
    assert response.json()["detail"] == "Product context unavailable"


def test_context_secret_alias_is_supported(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "ai_sdr_product_context_secret", "")
    monkeypatch.setattr(settings, "ai_sdr_context_secret", SECRET)
    path = "/api/v1/ai-sdr/product-context?productId=capveri"

    response = client.get(path, headers=signed_headers(path))

    assert response.status_code == 200
    assert response.json()["productId"] == "capveri"


def test_nonce_cache_rejects_invalid_timestamp_and_prunes_expired_nonce():
    expired_timestamp = (
        (datetime.now(UTC) - timedelta(minutes=10))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )

    assert consume_nonce("bad-timestamp", "not-a-date") is False
    assert consume_nonce("expired", expired_timestamp) is True
    assert (
        consume_nonce("fresh", datetime.now(UTC).isoformat(timespec="milliseconds"))
        is True
    )


def signed_headers(
    path: str,
    *,
    product_id: str = "capveri",
    timestamp: str | None = None,
) -> dict[str, str]:
    request_timestamp = timestamp or datetime.now(UTC).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")
    nonce = uuid4().hex
    body_hash = hashlib.sha256(
        stable_json({"productId": product_id}).encode("utf-8")
    ).hexdigest()
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
