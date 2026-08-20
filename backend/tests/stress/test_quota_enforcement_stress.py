"""Property-based invariants for subscription quota enforcement.

``billing/quota_enforcement.py:QuotaEnforcementService`` is the server-side gate
that decides — with a customer-facing HTTP 402 — whether an organization may add
billable units or use a gated feature. An off-by-one in the
``current + additional > max_units`` boundary either wrongly blocks a paying
customer or silently lets usage run past the plan cap; a slip in the early-return
guards bypasses enforcement entirely. The unit cap is currently ``None`` in the
generated single-tier data (so the raise branch is data-dead in production), but
the arithmetic must stay correct for when finite caps return — this suite pins it
by driving the real service with a faithful fake context and a patched finite cap.

Only the Supabase context (unit counts / subscription row) and the
tier/feature lookups are faked; all branch logic and the boundary arithmetic are
the real service.

Invariants pinned here:

  * **Boundary exactness** — with a finite cap ``M`` and ``A > 0`` units to add,
    enforcement raises 402 iff ``current + A > M`` and stays silent otherwise.
  * **Early-return guards** — ``A <= 0``, no active tier, a legacy enterprise
    subscription, or a ``None`` cap each short-circuit with no raise.
  * **Set-count delegation** — ``assert_can_set_billable_unit_count(T)`` raises
    iff ``T > current`` and ``T > M`` (it routes through the add path with
    ``T - current``).
  * **Feature gate** — ``assert_feature_access`` passes when access is granted
    and otherwise raises 402 naming the feature and required tier.
  * **Legacy-enterprise predicate** — true exactly when the subscription status
    is active/trialing AND ``enterprise`` is the tier or plan value.

Run standalone:
    pytest tests/stress/test_quota_enforcement_stress.py -q
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, status
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.billing.generated_plan_tiers import FEATURE_TIERS
from app.services.billing.quota_enforcement import QuotaEnforcementService

STRESS = settings(max_examples=200, deadline=None)

_MODULE = "app.services.billing.quota_enforcement"


class _FakeQuery:
    def __init__(self, result: SimpleNamespace | None) -> None:
        self._result = result

    def select(self, *a: object, **k: object) -> _FakeQuery:
        return self

    def eq(self, *a: object, **k: object) -> _FakeQuery:
        return self

    def limit(self, *a: object, **k: object) -> _FakeQuery:
        return self

    def maybe_single(self) -> _FakeQuery:
        return self

    def execute(self) -> SimpleNamespace | None:
        return self._result


class _FakeCtx:
    """Faithful stand-in for the org-scoped Supabase context."""

    def __init__(
        self,
        units_count: int,
        sub_row: dict | None,
        *,
        subscription_result_is_none: bool = False,
    ) -> None:
        self.organization_id = uuid4()
        self._units_count = units_count
        self._sub_row = sub_row
        self._subscription_result_is_none = subscription_result_is_none

    def table(self, name: str) -> _FakeQuery:
        if name == "units":
            return _FakeQuery(SimpleNamespace(count=self._units_count, data=[]))
        if name == "subscriptions":
            if self._subscription_result_is_none:
                return _FakeQuery(None)
            return _FakeQuery(SimpleNamespace(data=self._sub_row))
        return _FakeQuery(SimpleNamespace(count=0, data=[]))


def _non_enterprise_row() -> dict:
    return {"status": "active", "tier": "reconcile", "plan": "reconcile"}


@STRESS
@given(
    current=st.integers(min_value=0, max_value=10_000),
    additional=st.integers(min_value=1, max_value=10_000),
    max_units=st.integers(min_value=1, max_value=10_000),
)
def test_add_units_boundary_is_exact(current, additional, max_units):
    ctx = _FakeCtx(units_count=current, sub_row=_non_enterprise_row())
    svc = QuotaEnforcementService(ctx)

    with (
        patch(f"{_MODULE}.get_current_tier", return_value="reconcile"),
        patch(f"{_MODULE}._tier_limit", return_value=max_units),
    ):
        if current + additional > max_units:
            with pytest.raises(HTTPException) as exc:
                svc.assert_can_add_billable_units(additional)
            assert exc.value.status_code == status.HTTP_402_PAYMENT_REQUIRED
        else:
            svc.assert_can_add_billable_units(additional)  # no raise


@STRESS
@given(additional=st.integers(min_value=-1000, max_value=0))
def test_non_positive_additions_are_noops(additional):
    ctx = _FakeCtx(units_count=10_000, sub_row=_non_enterprise_row())
    svc = QuotaEnforcementService(ctx)
    # No tier/limit patching needed: the <=0 guard returns before any lookup.
    svc.assert_can_add_billable_units(additional)


@STRESS
@given(additional=st.integers(min_value=1, max_value=10_000))
def test_no_tier_skips_enforcement(additional):
    ctx = _FakeCtx(units_count=10_000, sub_row=_non_enterprise_row())
    svc = QuotaEnforcementService(ctx)
    with patch(f"{_MODULE}.get_current_tier", return_value=None):
        svc.assert_can_add_billable_units(additional)  # no raise even over any cap


@STRESS
@given(
    current=st.integers(min_value=0, max_value=10_000),
    additional=st.integers(min_value=1, max_value=10_000),
)
def test_legacy_enterprise_bypasses_cap(current, additional):
    # Over any finite cap, a legacy enterprise subscription is never blocked.
    ctx = _FakeCtx(
        units_count=current, sub_row={"status": "active", "tier": "enterprise"}
    )
    svc = QuotaEnforcementService(ctx)
    with (
        patch(f"{_MODULE}.get_current_tier", return_value="reconcile"),
        patch(f"{_MODULE}._tier_limit", return_value=1),
    ):
        svc.assert_can_add_billable_units(additional)  # no raise


@STRESS
@given(additional=st.integers(min_value=1, max_value=10_000))
def test_none_cap_skips_enforcement(additional):
    ctx = _FakeCtx(units_count=10_000, sub_row=_non_enterprise_row())
    svc = QuotaEnforcementService(ctx)
    with (
        patch(f"{_MODULE}.get_current_tier", return_value="reconcile"),
        patch(f"{_MODULE}._tier_limit", return_value=None),
    ):
        svc.assert_can_add_billable_units(additional)  # no raise (unlimited)


@STRESS
@given(
    current=st.integers(min_value=0, max_value=10_000),
    target=st.integers(min_value=0, max_value=20_000),
    max_units=st.integers(min_value=1, max_value=10_000),
)
def test_set_count_delegates_through_add_path(current, target, max_units):
    ctx = _FakeCtx(units_count=current, sub_row=_non_enterprise_row())
    svc = QuotaEnforcementService(ctx)
    with (
        patch(f"{_MODULE}.get_current_tier", return_value="reconcile"),
        patch(f"{_MODULE}._tier_limit", return_value=max_units),
    ):
        # additional = target - current; raises iff additional > 0 AND target > M.
        should_raise = (target - current) > 0 and target > max_units
        if should_raise:
            with pytest.raises(HTTPException):
                svc.assert_can_set_billable_unit_count(target)
        else:
            svc.assert_can_set_billable_unit_count(target)


@STRESS
@given(
    feature=st.one_of(
        st.sampled_from(sorted(FEATURE_TIERS)) if FEATURE_TIERS else st.just("x"),
        st.text(min_size=1, max_size=12),
    ),
    granted=st.booleans(),
)
def test_feature_access_gate(feature, granted):
    ctx = _FakeCtx(units_count=0, sub_row=_non_enterprise_row())
    svc = QuotaEnforcementService(ctx)
    with patch(f"{_MODULE}.has_feature_access", return_value=granted):
        if granted:
            svc.assert_feature_access(feature)  # no raise
        else:
            with pytest.raises(HTTPException) as exc:
                svc.assert_feature_access(feature)
            assert exc.value.status_code == status.HTTP_402_PAYMENT_REQUIRED
            assert feature in exc.value.detail


@STRESS
@given(
    status_val=st.sampled_from(["active", "trialing", "canceled", "past_due", ""]),
    tier_val=st.sampled_from(["enterprise", "reconcile", ""]),
    plan_val=st.sampled_from(["enterprise", "reconcile", ""]),
)
def test_legacy_enterprise_predicate(status_val, tier_val, plan_val):
    ctx = _FakeCtx(
        units_count=0,
        sub_row={"status": status_val, "tier": tier_val, "plan": plan_val},
    )
    svc = QuotaEnforcementService(ctx)
    expected = status_val in {"active", "trialing"} and (
        "enterprise" in {tier_val.lower(), plan_val.lower()}
    )
    assert svc._has_legacy_enterprise_subscription() is expected


def test_missing_subscription_row_is_not_enterprise():
    """A Supabase maybe_single() None result must read as non-enterprise."""
    svc = QuotaEnforcementService(
        _FakeCtx(
            units_count=0,
            sub_row=None,
            subscription_result_is_none=True,
        )
    )
    assert svc._has_legacy_enterprise_subscription() is False


def test_null_subscription_data_is_not_enterprise():
    """A Supabase response with data=None must also read as non-enterprise."""
    svc = QuotaEnforcementService(
        _FakeCtx(
            units_count=0,
            sub_row=None,
        )
    )
    assert svc._has_legacy_enterprise_subscription() is False


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
