"""Tests for reconciliation campaign endpoints and models."""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models.enums import CampaignStatus
from app.models.reconciliation_campaign import (
    ReconciliationCampaign,
    ReconciliationCampaignSummary,
)
from app.services.campaigns.transition import (
    VALID_TRANSITIONS,
    CampaignTransitionError,
    validate_transition,
)

# ---------------------------------------------------------------------------
# Unit tests for enums, models, and transition logic (from Tasks 1-3)
# ---------------------------------------------------------------------------


class TestCampaignStatusEnum:
    def test_all_values_present(self):
        values = {s.value for s in CampaignStatus}
        assert values == {"draft", "finalized", "in_review", "approved", "sent"}

    def test_is_str_enum(self):
        assert CampaignStatus.IN_REVIEW == "in_review"
        assert CampaignStatus.APPROVED == "approved"
        assert CampaignStatus.SENT == "sent"


class TestReconciliationCampaignModel:
    def test_defaults_to_draft(self):
        now = datetime.now(UTC)
        campaign = ReconciliationCampaign(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_year=2024,
            status=CampaignStatus.DRAFT,
            created_at=now,
            updated_at=now,
        )
        assert campaign.status == CampaignStatus.DRAFT
        assert campaign.finalized_at is None
        assert campaign.approved_at is None

    def test_accepts_all_statuses(self):
        now = datetime.now(UTC)
        for status in CampaignStatus:
            campaign = ReconciliationCampaign(
                id=uuid4(),
                organization_id=uuid4(),
                property_id=uuid4(),
                period_year=2024,
                status=status,
                created_at=now,
                updated_at=now,
            )
            assert campaign.status == status


class TestReconciliationCampaignSummary:
    def test_summary_fields(self):
        now = datetime.now(UTC)
        summary = ReconciliationCampaignSummary(
            id=uuid4(),
            property_id=uuid4(),
            property_name="Marina Plaza",
            period_year=2024,
            status=CampaignStatus.IN_REVIEW,
            tenant_count=10,
            finalized_tenant_count=10,
            total_recovery=Decimal("42000.00"),
            updated_at=now,
        )
        assert summary.tenant_count == 10
        assert summary.total_recovery == Decimal("42000.00")
        assert summary.status == CampaignStatus.IN_REVIEW


class TestCampaignTransitions:
    def test_valid_transitions_map(self):
        assert CampaignStatus.FINALIZED in VALID_TRANSITIONS[CampaignStatus.DRAFT]
        assert CampaignStatus.IN_REVIEW in VALID_TRANSITIONS[CampaignStatus.FINALIZED]
        assert CampaignStatus.APPROVED in VALID_TRANSITIONS[CampaignStatus.IN_REVIEW]
        assert (
            CampaignStatus.FINALIZED in VALID_TRANSITIONS[CampaignStatus.IN_REVIEW]
        )  # reject
        assert CampaignStatus.SENT in VALID_TRANSITIONS[CampaignStatus.APPROVED]
        assert VALID_TRANSITIONS[CampaignStatus.SENT] == set()

    def test_validate_transition_raises_on_invalid(self):
        with pytest.raises(CampaignTransitionError):
            validate_transition(CampaignStatus.DRAFT, CampaignStatus.SENT)

    def test_validate_transition_raises_on_backward(self):
        with pytest.raises(CampaignTransitionError):
            validate_transition(CampaignStatus.APPROVED, CampaignStatus.DRAFT)

    def test_validate_transition_passes_on_valid(self):
        validate_transition(CampaignStatus.DRAFT, CampaignStatus.FINALIZED)
        validate_transition(CampaignStatus.FINALIZED, CampaignStatus.IN_REVIEW)
        validate_transition(CampaignStatus.IN_REVIEW, CampaignStatus.APPROVED)
        validate_transition(CampaignStatus.IN_REVIEW, CampaignStatus.FINALIZED)
        validate_transition(CampaignStatus.APPROVED, CampaignStatus.SENT)


# ---------------------------------------------------------------------------
# API endpoint tests (Task 4)
# ---------------------------------------------------------------------------


def _mock_org_context(org_id=None, user_id=None):
    """Build a mock OrgContext for tests."""
    org_id = org_id or uuid4()
    user_id = user_id or uuid4()
    ctx = MagicMock()
    ctx.organization_id = org_id
    ctx.org_id = org_id
    ctx.user = MagicMock()
    ctx.user.id = user_id
    return ctx


def _make_campaign_row(
    campaign_id=None,
    property_id=None,
    org_id=None,
    status="finalized",
    period_year=2024,
):
    """Create a fake campaign row dict matching DB shape."""
    return {
        "id": str(campaign_id or uuid4()),
        "organization_id": str(org_id or uuid4()),
        "property_id": str(property_id or uuid4()),
        "period_year": period_year,
        "status": status,
        "finalized_at": datetime.now(UTC).isoformat(),
        "finalized_by_user_id": str(uuid4()),
        "submitted_for_review_at": None,
        "submitted_for_review_by_user_id": None,
        "approved_at": None,
        "approved_by_user_id": None,
        "sent_at": None,
        "sent_by_user_id": None,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
        "properties": {"name": "Test Property"},
    }


class TestListCampaigns:
    def test_list_campaigns_empty(self):
        from app.api.v1.campaigns import list_campaigns

        ctx = _mock_org_context()

        # Mock the campaigns query chain
        mock_result = MagicMock()
        mock_result.data = []
        ctx.table.return_value.select.return_value.order.return_value.execute.return_value = (
            mock_result
        )

        import asyncio

        result = asyncio.run(list_campaigns(ctx, year=2024))
        assert result == []

    def test_list_campaigns_with_year_filter(self):
        from app.api.v1.campaigns import list_campaigns

        ctx = _mock_org_context()
        campaign_row = _make_campaign_row(status="finalized")

        # Campaigns query chain with year filter
        mock_campaign_result = MagicMock()
        mock_campaign_result.data = [campaign_row]

        # Snapshot query chain (batch fetch via .in_())
        mock_snap_result = MagicMock()
        mock_snap_result.data = [
            {
                "id": str(uuid4()),
                "property_id": campaign_row["property_id"],
                "period_start_date": f'{campaign_row["period_year"]}-01-01',
                "status": "finalized",
                "total_recovery": "5000.00",
            },
        ]

        def table_side_effect(name):
            mock_table = MagicMock()
            if name == "reconciliation_campaigns":
                # .select().eq().order().execute()
                mock_table.select.return_value.eq.return_value.order.return_value.execute.return_value = (
                    mock_campaign_result
                )
                # Also handle .select().order().execute() (no year filter path)
                mock_table.select.return_value.order.return_value.execute.return_value = (
                    mock_campaign_result
                )
            elif name == "reconciliation_snapshots":
                # .select().in_().execute()
                mock_table.select.return_value.in_.return_value.execute.return_value = (
                    mock_snap_result
                )
            return mock_table

        ctx.table = MagicMock(side_effect=table_side_effect)

        import asyncio

        result = asyncio.run(list_campaigns(ctx, year=2024))
        assert len(result) == 1
        assert result[0].property_name == "Test Property"
        assert result[0].tenant_count == 1
        assert result[0].finalized_tenant_count == 1


class TestCampaignTransitionEndpoints:
    def test_submit_for_review_valid(self):
        from app.api.v1.campaigns import submit_for_review

        ctx = _mock_org_context()
        campaign_id = uuid4()
        campaign_row = _make_campaign_row(campaign_id=campaign_id, status="finalized")

        # Mock fetch
        mock_fetch_result = MagicMock()
        mock_fetch_result.data = campaign_row

        mock_update_result = MagicMock()
        mock_update_result.data = [campaign_row]

        table_mock = MagicMock()
        select_mock = MagicMock()
        select_mock.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_fetch_result
        )
        table_mock.select.return_value = select_mock
        table_mock.update.return_value.eq.return_value.execute.return_value = (
            mock_update_result
        )
        ctx.table.return_value = table_mock

        import asyncio

        result = asyncio.run(submit_for_review(campaign_id, ctx))
        assert result.status == CampaignStatus.IN_REVIEW
        assert result.id == campaign_id

    def test_approve_valid(self):
        from app.api.v1.campaigns import approve_campaign

        ctx = _mock_org_context()
        campaign_id = uuid4()
        campaign_row = _make_campaign_row(campaign_id=campaign_id, status="in_review")

        mock_fetch_result = MagicMock()
        mock_fetch_result.data = campaign_row
        mock_update_result = MagicMock()
        mock_update_result.data = [campaign_row]

        table_mock = MagicMock()
        table_mock.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_fetch_result
        )
        table_mock.update.return_value.eq.return_value.execute.return_value = (
            mock_update_result
        )
        ctx.table.return_value = table_mock

        import asyncio

        result = asyncio.run(approve_campaign(campaign_id, ctx))
        assert result.status == CampaignStatus.APPROVED

    def test_reject_valid(self):
        from app.api.v1.campaigns import reject_campaign

        ctx = _mock_org_context()
        campaign_id = uuid4()
        campaign_row = _make_campaign_row(campaign_id=campaign_id, status="in_review")

        mock_fetch_result = MagicMock()
        mock_fetch_result.data = campaign_row
        mock_update_result = MagicMock()
        mock_update_result.data = [campaign_row]

        table_mock = MagicMock()
        table_mock.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_fetch_result
        )
        table_mock.update.return_value.eq.return_value.execute.return_value = (
            mock_update_result
        )
        ctx.table.return_value = table_mock

        import asyncio

        result = asyncio.run(reject_campaign(campaign_id, ctx))
        assert result.status == CampaignStatus.FINALIZED

    def test_mark_sent_valid(self):
        from app.api.v1.campaigns import mark_sent

        ctx = _mock_org_context()
        campaign_id = uuid4()
        campaign_row = _make_campaign_row(campaign_id=campaign_id, status="approved")

        mock_fetch_result = MagicMock()
        mock_fetch_result.data = campaign_row
        mock_update_result = MagicMock()
        mock_update_result.data = [campaign_row]

        table_mock = MagicMock()
        table_mock.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_fetch_result
        )
        table_mock.update.return_value.eq.return_value.execute.return_value = (
            mock_update_result
        )
        ctx.table.return_value = table_mock

        import asyncio

        result = asyncio.run(mark_sent(campaign_id, ctx))
        assert result.status == CampaignStatus.SENT

    def test_invalid_transition_returns_conflict(self):
        from app.api.v1.campaigns import submit_for_review
        from app.exceptions import ConflictError

        ctx = _mock_org_context()
        campaign_id = uuid4()
        # Campaign is in DRAFT, cannot submit for review directly
        campaign_row = _make_campaign_row(campaign_id=campaign_id, status="draft")

        mock_fetch_result = MagicMock()
        mock_fetch_result.data = campaign_row

        table_mock = MagicMock()
        table_mock.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_fetch_result
        )
        ctx.table.return_value = table_mock

        import asyncio

        with pytest.raises(ConflictError):
            asyncio.run(submit_for_review(campaign_id, ctx))

    def test_not_found_returns_404(self):
        from app.api.v1.campaigns import submit_for_review
        from app.exceptions import NotFoundError

        ctx = _mock_org_context()
        campaign_id = uuid4()

        mock_fetch_result = MagicMock()
        mock_fetch_result.data = None

        table_mock = MagicMock()
        table_mock.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_fetch_result
        )
        ctx.table.return_value = table_mock

        import asyncio

        with pytest.raises(NotFoundError):
            asyncio.run(submit_for_review(campaign_id, ctx))
