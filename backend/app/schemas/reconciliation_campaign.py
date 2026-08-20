"""Request/response DTOs for reconciliation campaign endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import CampaignStatus


class CampaignTransitionResponse(BaseModel):
    """Returned from all campaign transition endpoints."""

    id: UUID
    status: CampaignStatus
    transitioned_at: datetime
    transitioned_by_user_id: UUID
