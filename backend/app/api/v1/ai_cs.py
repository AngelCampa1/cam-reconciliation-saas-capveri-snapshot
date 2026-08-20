"""Signed authenticated app context endpoint for the Ventora AI CS worker."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Request, Response, status

from app.api.v1.ai_sdr import (
    PRODUCT_ID,
    build_hmac_payload,
    build_public_context_sources,
    consume_nonce,
    sign_hmac_payload,
    verify_hmac_signature,
)
from app.auth.dependencies import OrgContext
from app.config import get_public_knowledge, settings

ASSISTANT_ID = "ai-cs"
_consumed_nonces: dict[str, float] = {}

router = APIRouter(prefix="/ai-cs", tags=["AI CS"])


@router.get("/app-context")
def app_context(
    request: Request,
    response: Response,
    ctx: OrgContext,
    appId: str,  # noqa: N803 - external query contract
    userId: str,  # noqa: N803 - external query contract
    currentPath: str | None = None,  # noqa: N803 - external query contract
    x_ventora_timestamp: str | None = Header(default=None),
    x_ventora_nonce: str | None = Header(default=None),
    x_ventora_signature: str | None = Header(default=None),
) -> dict[str, Any]:
    """Return authenticated CapVeri app context after HMAC verification."""
    if appId != PRODUCT_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown app")
    if userId != str(ctx.user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User context mismatch"
        )

    secret = get_context_secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="App context unavailable",
        )

    if not x_ventora_timestamp or not x_ventora_nonce or not x_ventora_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing signature"
        )

    sanitized_path = sanitize_current_path(currentPath)
    request_path = (
        f"{request.url.path}?{request.url.query}"
        if request.url.query
        else request.url.path
    )
    request_body = {"appId": appId, "userId": userId}
    if currentPath is not None:
        request_body["currentPath"] = currentPath
    request_payload = build_hmac_payload(
        timestamp=x_ventora_timestamp,
        nonce=x_ventora_nonce,
        method="GET",
        path=request_path,
        body=request_body,
    )
    if not verify_hmac_signature(
        payload=request_payload,
        signature=x_ventora_signature,
        secret=secret,
        timestamp=x_ventora_timestamp,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature"
        )

    if not consume_ai_cs_nonce(x_ventora_nonce, x_ventora_timestamp):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature"
        )

    body = build_capveri_app_context(current_path=sanitized_path)
    response_timestamp = (
        datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    )
    response_nonce = uuid4().hex
    response_payload = build_hmac_payload(
        timestamp=response_timestamp,
        nonce=response_nonce,
        method="GET",
        path=request_path,
        body=body,
    )
    response.headers["Cache-Control"] = "private, max-age=300"
    response.headers["X-Ventora-Timestamp"] = response_timestamp
    response.headers["X-Ventora-Nonce"] = response_nonce
    response.headers["X-Ventora-Signature"] = sign_hmac_payload(
        response_payload, secret
    )
    return body


def build_capveri_app_context(*, current_path: str) -> dict[str, Any]:
    public_knowledge = get_public_knowledge()
    company = public_knowledge["company"]
    app_help = public_knowledge["appHelp"]
    topic_by_id = {topic["id"]: topic for topic in app_help["topics"]}
    topic_ids = topic_ids_for_path(app_help, current_path)
    workflow_topics = [
        format_workflow_topic(topic_by_id[topic_id], index)
        for index, topic_id in enumerate(topic_ids)
        if topic_id in topic_by_id
    ]
    return {
        "assistantId": ASSISTANT_ID,
        "appId": PRODUCT_ID,
        "appName": public_knowledge["productName"],
        "authenticatedOnly": True,
        "description": company["publicDescription"],
        "currentPath": current_path,
        "sources": build_public_context_sources(public_knowledge),
        "navigation": build_navigation(app_help),
        "workflow": workflow_topics,
    }


def build_navigation(app_help: dict[str, Any]) -> list[dict[str, Any]]:
    navigation: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    for topic in app_help["topics"]:
        path = topic.get("href")
        if not isinstance(path, str) or not path.startswith("/") or path in seen_paths:
            continue
        seen_paths.add(path)
        navigation.append(
            {
                "label": topic["title"],
                "path": path,
                "description": topic["summary"],
            }
        )
    return navigation


def topic_ids_for_path(app_help: dict[str, Any], current_path: str) -> list[str]:
    canonical_path = canonical_help_path(current_path)
    matching_routes = [
        route
        for route in app_help["routeHelp"]
        if canonical_path == route["routePattern"]
        or canonical_path.startswith(f"{route['routePattern'].rstrip('/')}/")
    ]
    if matching_routes:
        return matching_routes[0]["topicIds"]
    return app_help["defaultRouteTopicIds"]


def canonical_help_path(current_path: str) -> str:
    if current_path.startswith("/properties/") and "/reconciliations" in current_path:
        return "/reconciliation"
    return current_path


def format_workflow_topic(topic: dict[str, Any], index: int) -> dict[str, Any]:
    workflow_topic = {
        "id": topic["id"],
        "label": topic.get("primaryAction") or topic["title"],
        "status": "current" if index == 0 else "next",
    }
    href = topic.get("href")
    if isinstance(href, str) and href.startswith("/"):
        workflow_topic["path"] = href
    return workflow_topic


def sanitize_current_path(current_path: str | None) -> str:
    if not current_path:
        return "/"
    parsed = urlsplit(current_path.strip())
    path = parsed.path or "/"
    if not path.startswith("/"):
        path = f"/{path}"
    sanitized = "".join(char for char in path if char.isprintable())
    return sanitized[:256] or "/"


def get_context_secret() -> str:
    return settings.ai_cs_context_secret.strip()


def consume_ai_cs_nonce(nonce: str, timestamp: str) -> bool:
    return consume_nonce(nonce, timestamp, _consumed_nonces)


def clear_ai_cs_nonce_cache() -> None:
    _consumed_nonces.clear()
