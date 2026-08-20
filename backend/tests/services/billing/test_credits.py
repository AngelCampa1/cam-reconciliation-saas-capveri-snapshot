"""
Unit tests for the credit pack billing service.

TDD tests written before implementation.
Covers:
- get_credit_balance: aggregates credits across packs for an org
- has_ever_purchased: returns True if any credit pack exists
- add_credits: inserts a new credit pack row
- consume_credit: atomically decrements credits and logs consumption
"""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

# Exercises the real ``has_full_access`` credit-pack path, so opt out of the
# autouse full-access patch in conftest.
pytestmark = pytest.mark.real_entitlements


def _make_ctx(credit_rows: list[dict] | None = None) -> MagicMock:
    """Build a mock Supabase context returning given credit rows."""
    ctx = MagicMock()
    ctx.organization_id = uuid4()

    result = MagicMock()
    result.data = credit_rows or []
    (
        ctx.table.return_value.select.return_value.eq.return_value.execute.return_value
    ) = result
    (
        ctx.table.return_value.select.return_value.eq.return_value.range.return_value.execute.return_value
    ) = result
    return ctx


class TestGetCreditBalance:
    def test_no_credits_returns_zeros(self):
        from app.services.billing.credits import get_credit_balance

        ctx = _make_ctx(credit_rows=[])
        balance = get_credit_balance(ctx)
        assert balance["total_purchased"] == 0
        assert balance["total_used"] == 0
        assert balance["total_remaining"] == 0

    def test_single_pack_reflects_values(self):
        from app.services.billing.credits import get_credit_balance

        ctx = _make_ctx(
            credit_rows=[
                {"credits_purchased": 5, "credits_used": 2, "credits_remaining": 3}
            ]
        )
        balance = get_credit_balance(ctx)
        assert balance["total_purchased"] == 5
        assert balance["total_used"] == 2
        assert balance["total_remaining"] == 3

    def test_multiple_packs_sums_correctly(self):
        from app.services.billing.credits import get_credit_balance

        ctx = _make_ctx(
            credit_rows=[
                {"credits_purchased": 5, "credits_used": 3, "credits_remaining": 2},
                {"credits_purchased": 10, "credits_used": 0, "credits_remaining": 10},
            ]
        )
        balance = get_credit_balance(ctx)
        assert balance["total_purchased"] == 15
        assert balance["total_used"] == 3
        assert balance["total_remaining"] == 12


class TestHasEverPurchased:
    def test_returns_false_when_no_packs(self):
        from app.services.billing.credits import has_ever_purchased

        ctx = _make_ctx(credit_rows=[])
        assert has_ever_purchased(ctx) is False

    def test_returns_true_when_packs_exist(self):
        from app.services.billing.credits import has_ever_purchased

        ctx = _make_ctx(
            credit_rows=[
                {"credits_purchased": 5, "credits_used": 5, "credits_remaining": 0}
            ]
        )
        assert has_ever_purchased(ctx) is True


class TestAddCredits:
    def test_inserts_credit_pack_row(self):
        from app.services.billing.credits import add_credits

        org_id = uuid4()
        ctx = MagicMock()
        ctx.organization_id = org_id

        insert_result = MagicMock()
        insert_result.data = [{"id": str(uuid4())}]
        ctx.table.return_value.insert.return_value.execute.return_value = insert_result

        pack_id = add_credits(
            ctx,
            quantity=5,
            unit_price_cents=69900,
            stripe_checkout_session_id="cs_test_abc",
            stripe_payment_intent_id="pi_test_xyz",
        )

        # Verify insert was called with correct data
        insert_call_args = ctx.table.return_value.insert.call_args[0][0]
        assert insert_call_args["organization_id"] == str(org_id)
        assert insert_call_args["credits_purchased"] == 5
        assert insert_call_args["credits_used"] == 0
        assert insert_call_args["unit_price_cents"] == 69900
        assert insert_call_args["stripe_checkout_session_id"] == "cs_test_abc"
        assert insert_call_args["stripe_payment_intent_id"] == "pi_test_xyz"
        assert pack_id is not None

    def test_insert_without_stripe_ids(self):
        from app.services.billing.credits import add_credits

        ctx = MagicMock()
        ctx.organization_id = uuid4()

        insert_result = MagicMock()
        insert_result.data = [{"id": str(uuid4())}]
        ctx.table.return_value.insert.return_value.execute.return_value = insert_result

        pack_id = add_credits(ctx, quantity=1, unit_price_cents=69900)
        assert pack_id is not None


class TestConsumeCredit:
    def test_raises_when_no_credits_available(self):
        from app.services.billing.credits import (
            InsufficientCreditsError,
            consume_credit,
        )

        ctx = MagicMock()
        ctx.organization_id = uuid4()

        # No packs with remaining credits
        pack_result = MagicMock()
        pack_result.data = []
        (
            ctx.table.return_value.select.return_value.eq.return_value.gt.return_value.order.return_value.limit.return_value.execute.return_value
        ) = pack_result

        import pytest

        with pytest.raises(InsufficientCreditsError):
            consume_credit(ctx, reconciliation_snapshot_id=None)

    def test_decrements_oldest_pack_with_credits(self):
        from app.services.billing.credits import consume_credit

        org_id = uuid4()
        pack_id = uuid4()
        ctx = MagicMock()
        ctx.organization_id = org_id

        # Pack with remaining credits
        pack_result = MagicMock()
        pack_result.data = [
            {
                "id": str(pack_id),
                "credits_purchased": 5,
                "credits_used": 2,
                "credits_remaining": 3,
            }
        ]
        (
            ctx.table.return_value.select.return_value.eq.return_value.gt.return_value.order.return_value.limit.return_value.execute.return_value
        ) = pack_result

        # UPDATE ... .eq("id", ...).eq("credits_used", ...).execute() — two .eq() calls
        update_result = MagicMock()
        update_result.data = [{"credits_used": 3}]
        ctx.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            update_result
        )

        log_result = MagicMock()
        log_result.data = [{"id": str(uuid4())}]
        ctx.table.return_value.insert.return_value.execute.return_value = log_result

        consume_credit(ctx, reconciliation_snapshot_id=uuid4())

        # Verify update was called to increment credits_used
        ctx.table.return_value.update.assert_called_once()
        update_data = ctx.table.return_value.update.call_args[0][0]
        assert "credits_used" in update_data or "sql" in str(update_data).lower()

    def test_raises_after_max_retries_on_concurrent_modification(self):
        """CreditConsumedConcurrentlyError raised after max_retries empty updates."""
        import pytest

        from app.services.billing.credits import (
            CreditConsumedConcurrentlyError,
            consume_credit,
        )

        pack_id = uuid4()
        ctx = MagicMock()
        ctx.organization_id = uuid4()

        # Pack always has credits
        pack_result = MagicMock()
        pack_result.data = [
            {
                "id": str(pack_id),
                "credits_purchased": 5,
                "credits_used": 2,
                "credits_remaining": 3,
            }
        ]
        ctx.table.return_value.select.return_value.eq.return_value.gt.return_value.order.return_value.limit.return_value.execute.return_value = (
            pack_result
        )

        # Update always returns empty (concurrent modification wins every time)
        # Two .eq() calls: .eq("id", ...).eq("credits_used", ...).execute()
        empty_update = MagicMock()
        empty_update.data = []
        ctx.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            empty_update
        )

        with pytest.raises(CreditConsumedConcurrentlyError):
            consume_credit(ctx, max_retries=3)

    def test_retries_on_concurrent_then_succeeds(self):
        """Retries after one concurrent modification, then succeeds on second attempt."""
        from app.services.billing.credits import consume_credit

        pack_id = uuid4()
        ctx = MagicMock()
        ctx.organization_id = uuid4()

        pack_result = MagicMock()
        pack_result.data = [
            {
                "id": str(pack_id),
                "credits_purchased": 5,
                "credits_used": 2,
                "credits_remaining": 3,
            }
        ]
        ctx.table.return_value.select.return_value.eq.return_value.gt.return_value.order.return_value.limit.return_value.execute.return_value = (
            pack_result
        )

        # Two .eq() calls in the update chain
        empty_result = MagicMock()
        empty_result.data = []
        success_result = MagicMock()
        success_result.data = [{"credits_used": 3}]
        ctx.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.side_effect = [
            empty_result,
            success_result,
        ]

        log_result = MagicMock()
        log_result.data = [{"id": str(uuid4())}]
        ctx.table.return_value.insert.return_value.execute.return_value = log_result

        result = consume_credit(ctx)
        assert result == str(pack_id)


class TestEntitlementsWithCreditPack:
    """Tests for updated entitlements supporting credit_pack billing model."""

    def _make_ctx_credit_pack(self, has_credits: bool) -> MagicMock:
        ctx = MagicMock()
        ctx.organization_id = uuid4()

        # Subscription row with billing_model = credit_pack
        # (_get_subscription_row uses .eq().maybe_single(), no .in_() filter)
        sub_result = MagicMock()
        sub_result.data = {
            "billing_model": "credit_pack",
            "plan": "",
            "status": "",
            "tier": None,
        }
        ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            sub_result
        )

        # Credit balance
        credit_rows = (
            [{"credits_purchased": 5, "credits_used": 2, "credits_remaining": 3}]
            if has_credits
            else []
        )
        credit_result = MagicMock()
        credit_result.data = credit_rows
        # has_ever_purchased uses .select.eq.execute chain
        ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            credit_result
        )

        return ctx

    def test_credit_pack_org_has_full_access_with_credits(self):
        from app.services.billing.entitlements import has_full_access

        ctx = self._make_ctx_credit_pack(has_credits=True)
        assert has_full_access(ctx) is True

    def test_credit_pack_org_has_full_access_if_ever_purchased(self):
        """Orgs that bought credits but used them all still have full access (credits never expire)."""
        from app.services.billing.entitlements import has_full_access

        ctx = MagicMock()
        ctx.organization_id = uuid4()

        # Subscription with credit_pack billing
        sub_result = MagicMock()
        sub_result.data = {
            "billing_model": "credit_pack",
            "plan": "",
            "status": "",
            "tier": None,
        }
        ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            sub_result
        )

        # Has purchased (even if all used)
        credit_result = MagicMock()
        credit_result.data = [
            {"credits_purchased": 5, "credits_used": 5, "credits_remaining": 0}
        ]
        ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            credit_result
        )

        assert has_full_access(ctx) is True

    def test_lapsed_legacy_sub_returns_false(self):
        """Canceled/past_due legacy subscription does NOT grant full access."""
        from app.services.billing.entitlements import has_full_access

        ctx = MagicMock()
        ctx.organization_id = uuid4()

        # Canceled legacy subscription
        sub_result = MagicMock()
        sub_result.data = {
            "billing_model": "subscription",
            "status": "canceled",
            "plan": "professional",
            "tier": None,
        }
        ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            sub_result
        )

        # No credits ever purchased
        credit_result = MagicMock()
        credit_result.data = []
        ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            credit_result
        )

        assert has_full_access(ctx) is False


class TestHasNOIBoardAccess:
    """Tests for has_noi_board_access with credit_pack support."""

    def _make_ctx(
        self, plan: str, billing_model: str = "subscription", status: str = "active"
    ) -> MagicMock:
        ctx = MagicMock()
        ctx.organization_id = uuid4()
        result = MagicMock()
        result.data = {
            "plan": plan,
            "status": status,
            "billing_model": billing_model,
            "tier": None,
        }
        # _get_subscription_row uses .eq().maybe_single() — no .in_() filter
        ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            result
        )
        # Credit check for has_ever_purchased
        credit_result = MagicMock()
        credit_result.data = []
        ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            credit_result
        )
        return ctx

    def _make_no_sub_ctx(self, has_credits: bool = False) -> MagicMock:
        ctx = MagicMock()
        ctx.organization_id = uuid4()
        # No subscription row
        sub_result = MagicMock()
        sub_result.data = None
        ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            sub_result
        )
        # Credits
        credit_result = MagicMock()
        credit_result.data = [{"id": "pack-1"}] if has_credits else []
        ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            credit_result
        )
        return ctx

    def test_professional_subscription_grants_noi_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(self._make_ctx("professional")) is True

    def test_essentials_subscription_grants_noi_access(self):
        # In the per-building model, essentials maps to growth which has all features
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(self._make_ctx("essentials")) is True

    def test_credit_pack_org_with_credits_grants_noi_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        ctx = MagicMock()
        ctx.organization_id = uuid4()
        sub_result = MagicMock()
        sub_result.data = {
            "plan": "credit_pack",
            "status": "active",
            "billing_model": "credit_pack",
            "tier": None,
        }
        ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            sub_result
        )
        credit_result = MagicMock()
        credit_result.data = [{"id": "pack-1"}]
        ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            credit_result
        )

        assert has_noi_board_access(ctx) is True

    def test_lapsed_professional_sub_denies_noi_access(self):
        """Canceled professional subscription loses NOI access."""
        from app.services.billing.entitlements import has_noi_board_access

        assert (
            has_noi_board_access(self._make_ctx("professional", status="canceled"))
            is False
        )

    def test_no_subscription_no_credits_denies_noi_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(self._make_no_sub_ctx(has_credits=False)) is False

    def test_no_subscription_with_credits_grants_noi_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(self._make_no_sub_ctx(has_credits=True)) is True

    def test_no_subscription_no_credits_denies_tax_protest_access(self):
        from app.services.billing.entitlements import has_tax_protest_access

        assert has_tax_protest_access(self._make_no_sub_ctx(has_credits=False)) is False

    def test_no_subscription_with_credits_grants_tax_protest_access(self):
        from app.services.billing.entitlements import has_tax_protest_access

        assert has_tax_protest_access(self._make_no_sub_ctx(has_credits=True)) is True

    def test_has_full_access_no_sub_no_credits_returns_false(self):
        from app.services.billing.entitlements import has_full_access

        assert has_full_access(self._make_no_sub_ctx(has_credits=False)) is False

    def test_has_full_access_no_sub_with_credits_returns_true(self):
        from app.services.billing.entitlements import has_full_access

        assert has_full_access(self._make_no_sub_ctx(has_credits=True)) is True


class TestFreeAuditStatusWithCredits:
    """Tests for free_audit.get_free_audit_status with credit fields."""

    def _make_credit_ctx(
        self,
        subscribed: bool = False,
        credit_rows: list[dict] | None = None,
        started: bool = False,
    ) -> MagicMock:
        ctx = MagicMock()
        ctx.organization_id = uuid4()

        # Subscription check (chain: .select.eq.in_.maybe_single.execute)
        sub_result = MagicMock()
        sub_result.data = {"status": "active"} if subscribed else None

        # Jobs count (chain: .select.eq.in_.execute)
        jobs_result = MagicMock()
        jobs_result.count = 1 if started else 0

        # Snapshots count
        snap_result = MagicMock()
        snap_result.count = 0

        # Credits
        cred_result = MagicMock()
        cred_result.data = credit_rows or []

        # Route table calls based on table name argument
        def table_side_effect(table_name):
            mock = MagicMock()
            if table_name == "subscriptions":
                mock.select.return_value.eq.return_value.in_.return_value.maybe_single.return_value.execute.return_value = (
                    sub_result
                )
            elif table_name == "calculation_jobs":
                mock.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
                    jobs_result
                )
            elif table_name == "reconciliation_snapshots":
                mock.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
                    snap_result
                )
            elif table_name == "audit_credits":
                mock.select.return_value.eq.return_value.execute.return_value = (
                    cred_result
                )
                mock.select.return_value.eq.return_value.range.return_value.execute.return_value = (
                    cred_result
                )
            return mock

        ctx.table.side_effect = table_side_effect
        return ctx

    def test_free_audit_status_includes_credit_balance(self):
        from app.services.billing.free_audit import get_free_audit_status

        ctx = self._make_credit_ctx(
            credit_rows=[
                {"credits_purchased": 5, "credits_used": 2, "credits_remaining": 3}
            ]
        )
        status = get_free_audit_status(ctx)
        assert "credit_balance" in status
        assert status["credit_balance"]["total_remaining"] == 3

    def test_free_audit_status_has_ever_purchased_true(self):
        from app.services.billing.free_audit import get_free_audit_status

        ctx = self._make_credit_ctx(
            credit_rows=[
                {"credits_purchased": 5, "credits_used": 5, "credits_remaining": 0}
            ]
        )
        status = get_free_audit_status(ctx)
        assert status["has_ever_purchased"] is True

    def test_free_audit_status_has_ever_purchased_false_when_no_packs(self):
        from app.services.billing.free_audit import get_free_audit_status

        ctx = self._make_credit_ctx(credit_rows=[])
        status = get_free_audit_status(ctx)
        assert status["has_ever_purchased"] is False

    def test_free_audit_status_exposes_paused_subscription(self):
        from app.services.billing.free_audit import get_free_audit_status

        ctx = self._make_credit_ctx(credit_rows=[])
        paused_result = MagicMock()
        paused_result.data = {"status": "paused"}

        subscriptions_table = MagicMock()
        subscriptions_table.select.return_value.eq.return_value.in_.return_value.maybe_single.return_value.execute.return_value = MagicMock(
            data=None
        )
        subscriptions_table.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            paused_result
        )

        original_side_effect = ctx.table.side_effect

        def table_side_effect(table_name):
            if table_name == "subscriptions":
                return subscriptions_table
            return original_side_effect(table_name)

        ctx.table.side_effect = table_side_effect

        status = get_free_audit_status(ctx)

        assert status["has_subscription"] is False
        assert status["has_paused_subscription"] is True

    def test_has_started_free_audit_include_snapshots_false(self):
        """When include_snapshots=False and no jobs, returns False without querying snapshots."""
        from app.services.billing.free_audit import has_started_free_audit

        ctx = self._make_credit_ctx()
        # No jobs started
        result = has_started_free_audit(ctx, include_snapshots=False)
        assert result is False

    def test_has_started_free_audit_with_jobs_returns_true(self):
        """Returns True when calculation jobs exist."""
        from app.services.billing.free_audit import has_started_free_audit

        ctx = MagicMock()
        ctx.organization_id = uuid4()

        jobs_result = MagicMock()
        jobs_result.count = 2

        def table_side_effect(table_name):
            mock = MagicMock()
            if table_name == "calculation_jobs":
                mock.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
                    jobs_result
                )
            return mock

        ctx.table.side_effect = table_side_effect
        assert has_started_free_audit(ctx) is True
