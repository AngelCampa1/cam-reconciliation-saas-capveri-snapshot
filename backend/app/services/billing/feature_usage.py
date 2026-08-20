"""Feature usage tracking service.

Records when an organization uses a gate-able feature so the billing page can
warn before a downgrade would lock features they have already relied on.

Writes go through the admin (service-role) client so they bypass RLS.
The atomic upsert is handled by the `upsert_feature_use` Postgres function to
avoid a non-atomic SELECT+INSERT/UPDATE race condition.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.billing.generated_plan_tiers import FEATURE_LABELS, FEATURE_TIERS

logger = logging.getLogger(__name__)

_TABLE = "feature_usage_events"


def record_feature_use(db_admin: Any, organization_id: str, feature_key: str) -> None:
    """Record a feature use event for the given org.

    Atomically inserts a new row on first use or increments usage_count on
    subsequent uses via a Postgres stored function.  Silently swallows errors
    so the caller is never blocked.
    """
    try:
        db_admin.rpc(
            "upsert_feature_use",
            {
                "p_organization_id": organization_id,
                "p_feature_key": feature_key,
            },
        ).execute()
    except Exception:  # noqa: BLE001
        logger.warning(
            "feature_usage: failed to record %s for org %s",
            feature_key,
            organization_id,
            exc_info=True,
        )


def list_used_features(db_admin: Any, organization_id: str) -> list[dict[str, Any]]:
    """Return feature usage rows for the org, enriched with tier and label.

    Each dict has keys: key, label, required_tier, first_used_at, last_used_at.
    Rows for unknown feature_key values (not in FEATURE_TIERS) are skipped.
    """
    try:
        result = (
            db_admin.table(_TABLE)
            .select("feature_key, first_used_at, last_used_at")
            .eq("organization_id", organization_id)
            .execute()
        )
        rows = result.data if result and isinstance(result.data, list) else []
    except Exception:  # noqa: BLE001
        logger.warning(
            "feature_usage: failed to list features for org %s",
            organization_id,
            exc_info=True,
        )
        return []
    enriched: list[dict[str, Any]] = []
    for row in rows:
        key = row.get("feature_key", "")
        tier = FEATURE_TIERS.get(key)
        if tier is None:
            continue
        enriched.append(
            {
                "key": key,
                "label": FEATURE_LABELS.get(key, key),
                "required_tier": tier,
                "first_used_at": row.get("first_used_at"),
                "last_used_at": row.get("last_used_at"),
            }
        )
    return enriched
