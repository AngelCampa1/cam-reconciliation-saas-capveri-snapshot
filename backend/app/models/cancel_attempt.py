"""
Cancel attempt tracking models for churn prevention.
"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class CancelReason(str, Enum):
    """Reason a user is considering cancellation."""

    TOO_EXPENSIVE = "too_expensive"
    NOT_USING_ENOUGH = "not_using_enough"
    MISSING_FEATURE = "missing_feature"
    SWITCHING_COMPETITOR = "switching_competitor"
    BUSINESS_CLOSED = "business_closed"
    OTHER = "other"


class SaveOfferType(str, Enum):
    """Type of save offer presented to the user."""

    DISCOUNT_20PCT_1INV = "discount_20pct_1inv"
    FEATURE_ROADMAP = "feature_roadmap"
    NONE = "none"


class CancelAttempt(BaseModel):
    """Record of a cancellation attempt and any offer presented."""

    id: UUID
    organization_id: UUID
    cancel_reason: CancelReason
    other_text: str | None
    offer_shown: SaveOfferType
    offer_accepted: bool | None
    stripe_coupon_id: str | None
    created_at: datetime
