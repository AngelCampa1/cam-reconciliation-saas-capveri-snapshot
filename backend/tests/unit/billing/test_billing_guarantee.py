"""
Tests for the 30-day money-back guarantee service and billing endpoints.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import stripe
from fastapi import HTTPException

from app.api.v1.billing import (
    claim_money_back_guarantee,
    get_guarantee_eligibility,
)
from app.auth.dependencies import OrganizationContext
from app.models.user import User
from app.services.billing.guarantee import GuaranteeEligibility, GuaranteeService

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def org_id():
    return uuid4()


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def mock_stripe_service():
    return MagicMock()


@pytest.fixture
def service(mock_stripe_service, mock_db):
    return GuaranteeService(stripe_service=mock_stripe_service, db=mock_db)


@pytest.fixture
def mock_org_context(org_id):
    user = User(
        id=uuid4(),
        email="user@example.com",
        organization_id=org_id,
        role="admin",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    ctx = MagicMock(spec=OrganizationContext)
    ctx.organization_id = org_id
    ctx.user = user
    ctx.client = MagicMock()
    ctx.table = MagicMock(return_value=ctx.client.table.return_value)
    return ctx


def _invoice_row(
    org_id,
    paid_at: datetime,
    amount: float = 100.0,
    currency: str = "usd",
    stripe_id: str = "in_test",
) -> dict:
    return {
        "id": str(uuid4()),
        "organization_id": str(org_id),
        "stripe_invoice_id": stripe_id,
        "amount_paid": amount,
        "currency": currency,
        "paid_at": paid_at.isoformat(),
        "status": "paid",
    }


def _build_query_chain(data, count=None):
    """Build a fluent Supabase query mock that returns the given data."""
    result = MagicMock()
    result.data = data
    result.count = count

    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.maybe_single.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = result
    return chain


# ---------------------------------------------------------------------------
# GuaranteeService.check_eligibility
# ---------------------------------------------------------------------------


class TestCheckEligibility:
    @pytest.mark.asyncio
    async def test_no_paid_invoice_returns_ineligible(self, service, mock_db, org_id):
        mock_db.table.return_value = _build_query_chain(data=[])

        result = await service.check_eligibility(org_id)

        assert not result.eligible
        assert result.days_remaining == 0
        assert result.first_invoice_amount is None

    @pytest.mark.asyncio
    async def test_invoice_within_window_and_not_claimed_returns_eligible(
        self, service, mock_db, org_id
    ):
        paid_at = datetime.now(UTC) - timedelta(days=5)
        invoice = _invoice_row(org_id, paid_at, amount=200.0)

        invoice_chain = _build_query_chain(data=[invoice])
        sub_chain = _build_query_chain(data={"money_back_claimed_at": None})

        mock_db.table.side_effect = [invoice_chain, sub_chain]

        result = await service.check_eligibility(org_id)

        assert result.eligible
        assert result.days_remaining == 25
        assert result.first_invoice_amount == Decimal("200.0")
        assert result.first_invoice_currency == "usd"

    @pytest.mark.asyncio
    async def test_invoice_older_than_30_days_returns_ineligible(
        self, service, mock_db, org_id
    ):
        paid_at = datetime.now(UTC) - timedelta(days=31)
        invoice = _invoice_row(org_id, paid_at)

        mock_db.table.return_value = _build_query_chain(data=[invoice])

        result = await service.check_eligibility(org_id)

        assert not result.eligible
        assert result.days_remaining == 0

    @pytest.mark.asyncio
    async def test_already_claimed_returns_ineligible(self, service, mock_db, org_id):
        paid_at = datetime.now(UTC) - timedelta(days=3)
        invoice = _invoice_row(org_id, paid_at)

        invoice_chain = _build_query_chain(data=[invoice])
        sub_chain = _build_query_chain(
            data={"money_back_claimed_at": datetime.now(UTC).isoformat()}
        )

        mock_db.table.side_effect = [invoice_chain, sub_chain]

        result = await service.check_eligibility(org_id)

        assert not result.eligible
        assert result.days_remaining == 0

    @pytest.mark.asyncio
    async def test_invoice_with_missing_paid_at_returns_ineligible(
        self, service, mock_db, org_id
    ):
        invoice = {
            "id": str(uuid4()),
            "stripe_invoice_id": "in_test",
            "amount_paid": 100.0,
            "currency": "usd",
            "paid_at": None,
        }
        mock_db.table.return_value = _build_query_chain(data=[invoice])

        result = await service.check_eligibility(org_id)

        assert not result.eligible


# ---------------------------------------------------------------------------
# GuaranteeService.claim_refund
# ---------------------------------------------------------------------------


class TestClaimRefund:
    @pytest.mark.asyncio
    async def test_claim_raises_409_when_not_eligible(self, service, mock_db, org_id):
        mock_db.table.return_value = _build_query_chain(data=[])

        with pytest.raises(HTTPException) as exc_info:
            await service.claim_refund(org_id)

        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_claim_raises_422_when_no_stripe_invoice_id(
        self, service, mock_db, org_id
    ):
        paid_at = datetime.now(UTC) - timedelta(days=2)
        invoice = _invoice_row(org_id, paid_at, stripe_id=None)
        invoice["stripe_invoice_id"] = None

        invoice_chain_1 = _build_query_chain(data=[invoice])
        sub_chain_1 = _build_query_chain(data={"money_back_claimed_at": None})
        invoice_chain_2 = _build_query_chain(data=[invoice])

        mock_db.table.side_effect = [
            invoice_chain_1,
            sub_chain_1,
            invoice_chain_2,
        ]

        with pytest.raises(HTTPException) as exc_info:
            await service.claim_refund(org_id)

        assert exc_info.value.status_code == 422

    @pytest.mark.asyncio
    async def test_claim_issues_refund_and_cancels_subscription(self, service, org_id):
        """claim_refund calls Stripe refund and cancels sub with prorate=False."""
        paid_at = datetime.now(UTC) - timedelta(days=2)
        invoice = _invoice_row(org_id, paid_at, amount=99.0)

        mock_stripe_invoice = MagicMock()
        mock_stripe_invoice.get.return_value = "pi_test123"

        mock_refund = MagicMock(spec=stripe.Refund)
        mock_refund.id = "rf_test123"
        mock_refund.amount = 9900
        mock_refund.currency = "usd"

        # Patch check_eligibility to return eligible, and mock DB for the
        # two invoice queries + two subscription updates that follow
        eligible = GuaranteeEligibility(
            eligible=True,
            days_remaining=28,
            first_invoice_amount=Decimal("99.0"),
            first_invoice_currency="usd",
        )

        update_chain = MagicMock()
        update_chain.eq.return_value.execute.return_value = MagicMock()

        sub_select_chain = _build_query_chain(
            data={"stripe_subscription_id": "sub_test123"}
        )

        invoice_chain = _build_query_chain(data=[invoice])

        table_calls: list[str] = []

        def table_side_effect(name: str):
            table_calls.append(name)
            if name == "invoices":
                return invoice_chain
            chain = MagicMock()
            chain.select.return_value = sub_select_chain
            chain.update.return_value = update_chain
            return chain

        service.db.table.side_effect = table_side_effect

        service.stripe.retrieve_invoice = AsyncMock(return_value=mock_stripe_invoice)
        service.stripe.create_refund = AsyncMock(return_value=mock_refund)
        service.stripe.cancel_subscription_now = AsyncMock()

        with patch.object(
            service, "check_eligibility", AsyncMock(return_value=eligible)
        ):
            refund = await service.claim_refund(org_id)

        assert refund.id == "rf_test123"
        service.stripe.create_refund.assert_called_once_with("pi_test123")
        service.stripe.cancel_subscription_now.assert_called_once_with(
            "sub_test123",
            prorate=False,
            invoice_now=False,
        )

    @pytest.mark.asyncio
    async def test_claim_records_refund_id_in_db(self, service, org_id):
        """DB update must record money_back_refund_id before cancellation."""
        paid_at = datetime.now(UTC) - timedelta(days=1)
        invoice = _invoice_row(org_id, paid_at, amount=49.0)

        mock_stripe_invoice = MagicMock()
        mock_stripe_invoice.get.return_value = "pi_abc"

        mock_refund = MagicMock(spec=stripe.Refund)
        mock_refund.id = "rf_abc"
        mock_refund.amount = 4900
        mock_refund.currency = "usd"

        eligible = GuaranteeEligibility(
            eligible=True,
            days_remaining=29,
            first_invoice_amount=Decimal("49.0"),
            first_invoice_currency="usd",
        )

        update_data_calls: list[dict] = []

        def capture_update(data: dict):
            update_data_calls.append(data)
            chain = MagicMock()
            chain.eq.return_value.execute.return_value = MagicMock()
            return chain

        invoice_chain = _build_query_chain(data=[invoice])
        sub_select_chain = _build_query_chain(
            data={"stripe_subscription_id": "sub_xyz"}
        )

        def table_side_effect(name: str):
            if name == "invoices":
                return invoice_chain
            chain = MagicMock()
            chain.select.return_value = sub_select_chain
            chain.update.side_effect = capture_update
            return chain

        service.db.table.side_effect = table_side_effect

        call_order: list[str] = []

        async def mock_cancel(*args, **kwargs):
            call_order.append("cancel")

        def capture_update_ordered(data: dict):
            call_order.append("db_update")
            return capture_update(data)

        # Re-patch table to capture ordering
        def table_side_effect_ordered(name: str):
            if name == "invoices":
                return invoice_chain
            chain = MagicMock()
            chain.select.return_value = sub_select_chain
            chain.update.side_effect = capture_update_ordered
            return chain

        service.db.table.side_effect = table_side_effect_ordered
        service.stripe.retrieve_invoice = AsyncMock(return_value=mock_stripe_invoice)
        service.stripe.create_refund = AsyncMock(return_value=mock_refund)
        service.stripe.cancel_subscription_now = AsyncMock(side_effect=mock_cancel)

        with patch.object(
            service, "check_eligibility", AsyncMock(return_value=eligible)
        ):
            await service.claim_refund(org_id)

        assert any(
            d.get("money_back_refund_id") == "rf_abc" for d in update_data_calls
        ), "Expected money_back_refund_id to be recorded in DB"

        db_idx = call_order.index("db_update")
        cancel_idx = call_order.index("cancel")
        assert (
            db_idx < cancel_idx
        ), "DB must record claim before Stripe cancel to prevent double-refund"


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


class TestGetGuaranteeEligibilityEndpoint:
    @pytest.mark.asyncio
    async def test_returns_eligible_true_when_service_says_eligible(
        self, mock_org_context
    ):
        mock_service = MagicMock()
        mock_service.check_eligibility = AsyncMock(
            return_value=GuaranteeEligibility(
                eligible=True,
                days_remaining=20,
                first_invoice_amount=Decimal("99.00"),
                first_invoice_currency="usd",
            )
        )

        result = await get_guarantee_eligibility(
            ctx=mock_org_context,
            guarantee_service=mock_service,
        )

        assert result.eligible
        assert result.days_remaining == 20
        assert result.first_invoice_amount == 99.0
        assert result.first_invoice_currency == "usd"

    @pytest.mark.asyncio
    async def test_returns_eligible_false_when_service_says_ineligible(
        self, mock_org_context
    ):
        mock_service = MagicMock()
        mock_service.check_eligibility = AsyncMock(
            return_value=GuaranteeEligibility(
                eligible=False,
                days_remaining=0,
                first_invoice_amount=None,
                first_invoice_currency="usd",
            )
        )

        result = await get_guarantee_eligibility(
            ctx=mock_org_context,
            guarantee_service=mock_service,
        )

        assert not result.eligible
        assert result.first_invoice_amount is None


class TestClaimMoneyBackGuaranteeEndpoint:
    @pytest.mark.asyncio
    async def test_returns_refund_details_on_success(self, mock_org_context):
        mock_refund = MagicMock()
        mock_refund.id = "rf_test"
        mock_refund.amount = 9900
        mock_refund.currency = "usd"

        mock_service = MagicMock()
        mock_service.claim_refund = AsyncMock(return_value=mock_refund)

        result = await claim_money_back_guarantee(
            ctx=mock_org_context,
            guarantee_service=mock_service,
        )

        assert result.refund_id == "rf_test"
        assert result.amount_refunded == 99.0
        assert result.currency == "usd"

    @pytest.mark.asyncio
    async def test_propagates_409_from_service(self, mock_org_context):
        mock_service = MagicMock()
        mock_service.claim_refund = AsyncMock(
            side_effect=HTTPException(
                status_code=409, detail="Not eligible for money-back guarantee"
            )
        )

        with pytest.raises(HTTPException) as exc_info:
            await claim_money_back_guarantee(
                ctx=mock_org_context,
                guarantee_service=mock_service,
            )

        assert exc_info.value.status_code == 409
