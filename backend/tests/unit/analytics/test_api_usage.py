"""Tests for backend API usage telemetry."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from starlette.requests import Request

from app.services.analytics.api_usage import (
    API_REQUEST_EVENT,
    capture_api_request_event,
    get_api_route_telemetry,
    get_latency_bucket,
    get_route_template,
    get_status_bucket,
    should_track_api_request,
)


def make_request(
    path: str,
    *,
    method: str = "GET",
    route_path: str | None = None,
) -> Request:
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [],
        "query_string": b"",
        "server": ("testserver", 80),
        "scheme": "http",
        "client": ("127.0.0.1", 1234),
    }
    if route_path is not None:
        scope["route"] = SimpleNamespace(path=route_path)
    return Request(scope)


def test_should_track_api_request_skips_health_and_docs_noise() -> None:
    assert should_track_api_request("/api/v1/properties")
    assert should_track_api_request("/webhooks/stripe")
    assert not should_track_api_request("/health")
    assert not should_track_api_request("/openapi.json")
    assert not should_track_api_request("/docs")


def test_status_and_latency_buckets_are_low_cardinality() -> None:
    assert get_status_bucket(200) == "2xx"
    assert get_status_bucket(401) == "auth"
    assert get_status_bucket(422) == "validation"
    assert get_status_bucket(429) == "rate_limit"
    assert get_status_bucket(503) == "5xx"

    assert get_latency_bucket(42) == "0-100ms"
    assert get_latency_bucket(250) == "100-300ms"
    assert get_latency_bucket(900) == "300ms-1s"
    assert get_latency_bucket(2_500) == "1-3s"
    assert get_latency_bucket(12_000) == "10s+"


def test_api_route_telemetry_classifies_routes() -> None:
    route = get_api_route_telemetry("/api/v1/properties/:property_id/leases")
    assert route.route_template == "/api/v1/properties/:property_id/leases"
    assert route.api_surface == "backend_api"
    assert route.api_area == "properties"
    assert route.endpoint_name == "properties_property_id_leases"

    webhook = get_api_route_telemetry("/webhooks/stripe")
    assert webhook.api_surface == "webhook"
    assert webhook.api_area == "stripe"
    assert webhook.endpoint_name == "webhook_stripe"


def test_route_template_normalizes_unmatched_identifier_segments() -> None:
    request = make_request(
        "/api/v1/properties/550e8400-e29b-41d4-a716-446655440000/imports/123"
    )

    assert get_route_template(request) == "/api/v1/properties/:id/imports/:id"


@pytest.mark.asyncio
async def test_capture_api_request_event_sends_safe_route_payload() -> None:
    request = make_request(
        "/api/v1/properties/prop-123/leases",
        method="POST",
        route_path="/api/v1/properties/{property_id}/leases",
    )
    request.state.analytics_user_id = "user-123"
    request.state.analytics_organization_id = "org-123"
    request.state.analytics_user_role = "admin"

    with patch(
        "app.services.analytics.api_usage.capture_backend_event",
        new_callable=AsyncMock,
    ) as capture:
        await capture_api_request_event(
            request,
            status_code=201,
            duration_ms=425,
        )

    capture.assert_awaited_once()
    assert capture.await_args.args == (API_REQUEST_EVENT,)
    assert capture.await_args.kwargs["user_id"] == "user-123"
    assert capture.await_args.kwargs["organization_id"] == "org-123"
    properties = capture.await_args.kwargs["properties"]
    assert properties == {
        "http_method": "POST",
        "status_code": 201,
        "status_bucket": "2xx",
        "latency_bucket": "300ms-1s",
        "is_error": False,
        "route_template": "/api/v1/properties/:property_id/leases",
        "api_surface": "backend_api",
        "api_area": "properties",
        "endpoint_name": "properties_property_id_leases",
        "user_role": "admin",
    }


@pytest.mark.asyncio
async def test_capture_api_request_event_handles_anonymous_errors() -> None:
    request = make_request(
        "/api/v1/leads/content-download",
        method="POST",
        route_path="/api/v1/leads/content-download",
    )

    with patch(
        "app.services.analytics.api_usage.capture_backend_event",
        new_callable=AsyncMock,
    ) as capture:
        await capture_api_request_event(
            request,
            status_code=429,
            duration_ms=45,
        )

    assert capture.await_args.kwargs["user_id"] is None
    assert capture.await_args.kwargs["organization_id"] is None
    properties = capture.await_args.kwargs["properties"]
    assert properties["status_bucket"] == "rate_limit"
    assert properties["latency_bucket"] == "0-100ms"
    assert properties["is_error"] is True
    assert properties["route_template"] == "/api/v1/leads/content-download"
