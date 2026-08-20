"""Signed product context endpoint for the Ventora AI SDR worker."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Request, Response, status

from app.config import get_public_knowledge, settings

PRODUCT_ID = "capveri"
MAX_SKEW_SECONDS = 5 * 60
_SIGNATURE_PATTERN = re.compile(r"^[a-f0-9]{64}$")
_consumed_nonces: dict[str, float] = {}

router = APIRouter(prefix="/ai-sdr", tags=["AI SDR"])


@router.get("/product-context")
def product_context(
    request: Request,
    response: Response,
    product_id: str | None = None,
    productId: str | None = None,  # noqa: N803 - external query contract
    x_ventora_timestamp: str | None = Header(default=None),
    x_ventora_nonce: str | None = Header(default=None),
    x_ventora_signature: str | None = Header(default=None),
) -> dict[str, Any]:
    """Return CapVeri context to the AI SDR worker after HMAC verification."""
    requested_product_id = productId or product_id
    if requested_product_id != PRODUCT_ID:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown product"
        )

    secret = get_context_secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Product context unavailable",
        )

    if not x_ventora_timestamp or not x_ventora_nonce or not x_ventora_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing signature"
        )

    request_path = (
        f"{request.url.path}?{request.url.query}"
        if request.url.query
        else request.url.path
    )
    request_payload = build_hmac_payload(
        timestamp=x_ventora_timestamp,
        nonce=x_ventora_nonce,
        method="GET",
        path=request_path,
        body={"productId": requested_product_id},
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

    if not consume_nonce(x_ventora_nonce, x_ventora_timestamp):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature"
        )

    body = build_capveri_context()
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


def build_capveri_context() -> dict[str, Any]:
    """Build the public CapVeri context used by SDR conversations."""
    public_knowledge = get_public_knowledge()
    company = public_knowledge["company"]
    return {
        "productId": PRODUCT_ID,
        "name": public_knowledge["productName"],
        "description": company["publicDescription"],
        "sources": build_public_context_sources(public_knowledge),
        "plans": build_public_pricing_plans(public_knowledge),
    }


def build_public_pricing_plans(
    public_knowledge: dict[str, Any],
) -> list[dict[str, Any]]:
    pricing = public_knowledge["pricing"]
    features = pricing["features"]
    trial_days = pricing["trialDays"]
    launch_offer = pricing["launchOffer"]
    app_base_url = public_knowledge["company"]["appUrl"].rstrip("/")
    plans: list[dict[str, Any]] = []
    for tier in pricing["tiers"]:
        tier_id = tier["id"]
        cta_path = tier.get("primaryCta", {}).get("href", "/auth/register")
        cta_params = urlencode(
            {
                "utm_source": "ai_sdr",
                "utm_medium": "assistant",
                "utm_campaign": "free_trial",
                "utm_content": tier_id,
                "plan": tier_id,
                "offer": launch_offer["code"],
            }
        )
        plans.append(
            {
                "id": tier_id,
                "name": tier["name"],
                "price": tier["display"]["annualLabel"],
                "annualPrice": tier["display"]["annualLabel"],
                "discount": (
                    f"{launch_offer['code']}: "
                    f"{pricing['display']['launchOfferTerms']}"
                ),
                "defaultCadence": "year",
                "trialDays": trial_days if tier.get("includedInTrial") else 0,
                "ctaUrl": f"{app_base_url}{cta_path}?{cta_params}",
                "features": [
                    feature["label"]
                    for feature in features
                    if feature.get("tier") == tier_id
                ],
            }
        )
    return plans


def build_public_context_sources(
    public_knowledge: dict[str, Any],
) -> list[dict[str, str]]:
    company = public_knowledge["company"]
    site_url = company["siteUrl"].rstrip("/")
    pricing = public_knowledge["pricing"]
    sources_by_id = {
        source["id"]: source for source in public_knowledge.get("sources", [])
    }
    help_topics = public_knowledge["appHelp"]["topics"]
    claims = public_knowledge["claims"]["items"]
    source_defs = [
        (
            "pricing",
            "CapVeri pricing",
            f"{site_url}/pricing",
            pricing["display"]["selfServeSummary"],
            "plan-tiers",
        ),
        (
            "app-help",
            "CapVeri app help",
            f"{site_url}/resources/export-guide",
            " ".join(topic["summary"] for topic in help_topics[:3]),
            "app-help",
        ),
        (
            "compliance-claims",
            "CapVeri public compliance claims",
            f"{site_url}/security",
            " ".join(claim["wording"] for claim in claims[:5]),
            "public-compliance",
        ),
    ]
    return [
        {
            "id": source_id,
            "title": title,
            "url": url,
            "excerpt": excerpt,
        }
        for source_id, title, url, excerpt, canonical_source_id in source_defs
        if canonical_source_id in sources_by_id
    ]


def get_context_secret() -> str:
    return (
        settings.ai_sdr_product_context_secret.strip()
        or settings.ai_sdr_context_secret.strip()
    )


def build_hmac_payload(
    *, timestamp: str, nonce: str, method: str, path: str, body: dict[str, Any]
) -> str:
    body_hash = hashlib.sha256(stable_json(body).encode("utf-8")).hexdigest()
    return f"{timestamp}.{nonce}.{method.upper()}.{path}.{body_hash}"


def sign_hmac_payload(payload: str, secret: str) -> str:
    return hmac.new(
        secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def verify_hmac_signature(
    *, payload: str, signature: str, secret: str, timestamp: str
) -> bool:
    if not _SIGNATURE_PATTERN.fullmatch(signature):
        return False
    try:
        timestamp_seconds = datetime.fromisoformat(
            timestamp.replace("Z", "+00:00")
        ).timestamp()
    except ValueError:
        return False
    if abs(time.time() - timestamp_seconds) > MAX_SKEW_SECONDS:
        return False

    expected = sign_hmac_payload(payload, secret)
    return hmac.compare_digest(expected, signature)


def consume_nonce(
    nonce: str, timestamp: str, cache: dict[str, float] | None = None
) -> bool:
    try:
        expires_at = (
            datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp()
            + MAX_SKEW_SECONDS
        )
    except ValueError:
        return False

    nonce_cache = cache if cache is not None else _consumed_nonces
    now = time.time()
    for candidate, stored_expires_at in list(nonce_cache.items()):
        if stored_expires_at <= now:
            del nonce_cache[candidate]
    if nonce in nonce_cache:
        return False
    nonce_cache[nonce] = expires_at
    return True


def clear_ai_sdr_nonce_cache() -> None:
    _consumed_nonces.clear()


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
