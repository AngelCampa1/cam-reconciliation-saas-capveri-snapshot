"""Campaign status transition validation."""

from app.models.enums import CampaignStatus


class CampaignTransitionError(ValueError):
    """Raised when a requested status transition is not permitted."""


VALID_TRANSITIONS: dict[CampaignStatus, set[CampaignStatus]] = {
    CampaignStatus.DRAFT: {CampaignStatus.FINALIZED},
    CampaignStatus.FINALIZED: {CampaignStatus.IN_REVIEW},
    CampaignStatus.IN_REVIEW: {CampaignStatus.APPROVED, CampaignStatus.FINALIZED},
    CampaignStatus.APPROVED: {CampaignStatus.SENT},
    CampaignStatus.SENT: set(),
}


def validate_transition(current: CampaignStatus, target: CampaignStatus) -> None:
    """Raise CampaignTransitionError if current → target is not a valid transition."""
    allowed = VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise CampaignTransitionError(
            f"Cannot transition campaign from '{current}' to '{target}'. "
            f"Allowed transitions from '{current}': "
            f"{[s.value for s in allowed] or 'none'}."
        )
