"""Backend API usage telemetry for PostHog."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from starlette.requests import Request

from app.services.analytics.posthog import capture_backend_event

API_REQUEST_EVENT = "backend_api_request_completed"

_EXCLUDED_PATHS = frozenset(
    {
        "/health",
        "/health.version",
        "/docs",
        "/redoc",
        "/openapi.json",
    }
)
_UUID_SEGMENT_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_LONG_ID_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,}$")


@dataclass(frozen=True)
class ApiRouteTelemetry:
    route_template: str
    api_surface: str
    api_area: str
    endpoint_name: str


def should_track_api_request(path: str) -> bool:
    """Return True when the request is useful product telemetry."""
    if path in _EXCLUDED_PATHS:
        return False
    return path.startswith("/api/") or path.startswith("/webhooks/")


def get_status_bucket(status_code: int) -> str:
    """Bucket status codes without storing raw error bodies."""
    if status_code < 200:
        return "informational"
    if status_code < 300:
        return "2xx"
    if status_code < 400:
        return "3xx"
    if status_code in {401, 403}:
        return "auth"
    if status_code == 404:
        return "not_found"
    if status_code == 408:
        return "timeout"
    if status_code == 409:
        return "conflict"
    if status_code == 413:
        return "too_large"
    if status_code == 422:
        return "validation"
    if status_code == 429:
        return "rate_limit"
    if status_code < 500:
        return "4xx"
    return "5xx"


def get_latency_bucket(duration_ms: float) -> str:
    """Bucket request duration for dashboarding without high-cardinality values."""
    if duration_ms < 100:
        return "0-100ms"
    if duration_ms < 300:
        return "100-300ms"
    if duration_ms < 1_000:
        return "300ms-1s"
    if duration_ms < 3_000:
        return "1-3s"
    if duration_ms < 10_000:
        return "3-10s"
    return "10s+"


def _normalize_route_template(path: str) -> str:
    route_parts = []
    for part in path.split("/"):
        if part.startswith("{") and part.endswith("}"):
            route_parts.append(f":{part[1:-1]}")
        else:
            route_parts.append(part)
    return "/".join(route_parts)


def _normalize_unmatched_path(path: str) -> str:
    route_parts = []
    for part in path.split("/"):
        if part.isdigit() or _UUID_SEGMENT_PATTERN.match(part):
            route_parts.append(":id")
        elif _LONG_ID_SEGMENT_PATTERN.match(part) and any(
            char.isdigit() for char in part
        ):
            route_parts.append(":id")
        else:
            route_parts.append(part)
    return "/".join(route_parts)


def get_route_template(request: Request) -> str:
    """Return the matched route template, falling back to a low-cardinality path."""
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if isinstance(route_path, str) and route_path:
        return _normalize_route_template(route_path)
    return _normalize_unmatched_path(request.url.path)


def get_api_route_telemetry(route_template: str) -> ApiRouteTelemetry:
    """Classify API routes into stable dashboard dimensions."""
    segments = route_template.split("/")
    parts = [segment for segment in segments if segment]

    if parts[:2] == ["api", "v1"]:
        area = parts[2] if len(parts) > 2 else "root"
        endpoint = "_".join(
            part.removeprefix(":").replace("-", "_") for part in parts[2:5]
        )
        return ApiRouteTelemetry(
            route_template=route_template,
            api_surface="backend_api",
            api_area=area,
            endpoint_name=endpoint or "api_root",
        )

    if parts[:1] == ["webhooks"]:
        area = parts[1] if len(parts) > 1 else "webhooks"
        return ApiRouteTelemetry(
            route_template=route_template,
            api_surface="webhook",
            api_area=area,
            endpoint_name=f"webhook_{area}",
        )

    return ApiRouteTelemetry(
        route_template=route_template,
        api_surface="system",
        api_area=parts[0] if parts else "root",
        endpoint_name=(parts[0] if parts else "root"),
    )


def get_request_identity(
    request: Request,
) -> tuple[str | None, str | None, str | None]:
    """Read safe identity values populated by auth dependencies."""
    user_id = getattr(request.state, "analytics_user_id", None)
    organization_id = getattr(request.state, "analytics_organization_id", None)
    user_role = getattr(request.state, "analytics_user_role", None)
    return (
        str(user_id) if user_id else None,
        str(organization_id) if organization_id else None,
        str(user_role) if user_role else None,
    )


async def capture_api_request_event(
    request: Request,
    *,
    status_code: int,
    duration_ms: float,
) -> None:
    """Capture a sanitized API request event for product analytics."""
    route_template = get_route_template(request)
    route = get_api_route_telemetry(route_template)
    user_id, organization_id, user_role = get_request_identity(request)

    properties: dict[str, Any] = {
        "http_method": request.method,
        "status_code": status_code,
        "status_bucket": get_status_bucket(status_code),
        "latency_bucket": get_latency_bucket(duration_ms),
        "is_error": status_code >= 400,
        "route_template": route.route_template,
        "api_surface": route.api_surface,
        "api_area": route.api_area,
        "endpoint_name": route.endpoint_name,
        **({"user_role": user_role} if user_role else {}),
    }

    await capture_backend_event(
        API_REQUEST_EVENT,
        organization_id=organization_id,
        user_id=user_id,
        properties=properties,
    )
