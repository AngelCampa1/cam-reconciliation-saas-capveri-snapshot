"""Property-based stress test for the comparison engine (Module B) — the pure,
dependency-free math that produces the audit dispute surface.

``build_comparison_result`` pairs CapVeri-correct amounts against actually-billed
amounts per lease, classifies each deviation as OVERCHARGE / UNDERCHARGE / MATCH
against an inclusive tolerance, and aggregates the signed totals and counts that
land in the reconciliation letter. A wrong sign, a misfiled bucket, or a dropped
amount is a direct financial misstatement, so the invariants here are exact.

``_rekey_charged_to_leases`` is the subtle companion: it folds name-addressed
charges onto lease keys, and its duplicate-name "combine" branch must never drop
or double-count a CapVeri-correct amount. We assert money conservation across
that re-key end to end.

Both functions are pure (no DB, no async, no I/O) so no patching is needed. The
signed convention under test (see models.py):

    variance = actual_charged - capveri_correct
    abs(variance) <= tolerance        -> MATCH
    variance >  tolerance (signed >0) -> OVERCHARGE
    variance < -tolerance             -> UNDERCHARGE

Run standalone:
    pytest tests/stress/test_comparison_engine_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from uuid import uuid4

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.comparison.engine import (
    _rekey_charged_to_leases,
    _signed_variance_pct,
    build_comparison_result,
)
from app.services.comparison.models import VarianceDirection, classify_variance

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_LEASES = ["L1", "L2", "L3", "L4", "L5"]
_POOLS = ["P1", "P2", "P3"]
_NAMES = ["Acme", "Globex", "Initech", "Umbrella"]
_PERIOD_START = date(2024, 1, 1)
_PERIOD_END = date(2024, 12, 31)


def money() -> st.SearchStrategy[Decimal]:
    # Credits/reversals are legitimate, so the domain spans negatives too.
    return st.decimals(
        min_value=Decimal("-1000000"),
        max_value=Decimal("5000000"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


def _amount_map(keys: list[str]) -> st.SearchStrategy[dict[str, Decimal]]:
    return st.dictionaries(st.sampled_from(keys), money(), max_size=len(keys))


def _pool_map(keys: list[str]) -> st.SearchStrategy[dict[str, dict[str, Decimal]]]:
    """lease_id -> {pool_id -> amount}, sparse on both dimensions."""
    return st.dictionaries(
        st.sampled_from(keys),
        st.dictionaries(st.sampled_from(_POOLS), money(), max_size=len(_POOLS)),
        max_size=len(keys),
    )


tolerance_st = st.decimals(
    min_value=Decimal("0"),
    max_value=Decimal("1000"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


def _expected_pct(variance: Decimal, correct: Decimal) -> Decimal | None:
    if correct == 0:
        return None
    return (variance / abs(correct) * Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def precise_money() -> st.SearchStrategy[Decimal]:
    # Exercise precision beyond cents so pct rounding is not only tested at
    # already-quantized money boundaries.
    return st.decimals(
        min_value=Decimal("-1000000"),
        max_value=Decimal("5000000"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    )


def nonzero_precise_money() -> st.SearchStrategy[Decimal]:
    return precise_money().filter(lambda value: value != 0)


def _fraction_from_decimal(value: Decimal) -> Fraction:
    sign, digits, exponent = value.as_tuple()
    coefficient = 0
    for digit in digits:
        coefficient = coefficient * 10 + digit
    if sign:
        coefficient = -coefficient
    if exponent >= 0:
        return Fraction(coefficient * (10**exponent), 1)
    return Fraction(coefficient, 10 ** abs(exponent))


def _round_fraction_half_up(value: Fraction, places: int) -> Decimal:
    scale = 10**places
    scaled = abs(value) * scale
    whole = scaled.numerator // scaled.denominator
    remainder = scaled.numerator % scaled.denominator
    if remainder * 2 >= scaled.denominator:
        whole += 1
    if value < 0:
        whole = -whole
    return Decimal(whole).scaleb(-places)


def _independent_pct_oracle(variance: Decimal, correct: Decimal) -> Decimal | None:
    if correct == 0:
        return None
    ratio = _fraction_from_decimal(variance) / abs(_fraction_from_decimal(correct))
    return _round_fraction_half_up(ratio * 100, 2)


@STRESS
@given(
    correct=_amount_map(_LEASES),
    charged=_amount_map(_LEASES),
    tolerance=tolerance_st,
)
def test_build_comparison_result_invariants(correct, charged, tolerance):
    result = build_comparison_result(
        correct_by_lease=correct,
        charged_by_lease=charged,
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        tolerance=tolerance,
    )

    union = set(correct) | set(charged)
    # Every lease on either side is represented exactly once.
    assert {t.lease_id for t in result.tenants} == union
    assert len(result.tenants) == len(union)

    # Sorted by descending absolute variance.
    abs_vars = [t.abs_variance for t in result.tenants]
    assert abs_vars == sorted(abs_vars, reverse=True)

    recomputed_over = Decimal("0")
    recomputed_under = Decimal("0")
    over_n = under_n = match_n = 0
    for t in result.tenants:
        c = correct.get(t.lease_id, Decimal("0"))
        b = charged.get(t.lease_id, Decimal("0"))
        # Missing side is treated as zero — a full over/undercharge finding.
        assert t.capveri_correct == c
        assert t.actual_charged == b
        assert t.variance == b - c
        assert t.abs_variance == abs(b - c)
        assert t.direction == classify_variance(b - c, tolerance)
        assert t.variance_pct == _expected_pct(b - c, c)
        assert t.pool_breakdowns is None  # pool mode off

        if t.direction is VarianceDirection.OVERCHARGE:
            recomputed_over += t.variance
            over_n += 1
        elif t.direction is VarianceDirection.UNDERCHARGE:
            recomputed_under += t.abs_variance
            under_n += 1
        else:
            match_n += 1

    # Totals reconcile exactly (Decimal, no rounding).
    assert result.total_capveri_correct == sum(
        (t.capveri_correct for t in result.tenants), Decimal("0")
    )
    assert result.total_actual_charged == sum(
        (t.actual_charged for t in result.tenants), Decimal("0")
    )
    assert (
        result.total_net_variance
        == result.total_actual_charged - result.total_capveri_correct
    )
    # Net variance is the signed sum of every per-tenant variance.
    assert result.total_net_variance == sum(
        (t.variance for t in result.tenants), Decimal("0")
    )

    # Buckets: overcharge holds positive variances, undercharge holds magnitudes.
    assert result.total_overcharge == recomputed_over
    assert result.total_undercharge == recomputed_under
    assert result.total_overcharge >= 0
    assert result.total_undercharge >= 0
    # Buckets exclude MATCH tenants, so the signed bucket difference equals the
    # net variance contributed by non-MATCH tenants only.
    non_match_net = sum(
        (
            t.variance
            for t in result.tenants
            if t.direction is not VarianceDirection.MATCH
        ),
        Decimal("0"),
    )
    assert result.total_overcharge - result.total_undercharge == non_match_net

    # Counts partition the tenant set exhaustively.
    assert result.overcharge_count == over_n
    assert result.undercharge_count == under_n
    assert result.match_count == match_n
    assert over_n + under_n + match_n == len(result.tenants)


@STRESS
@given(
    correct=_amount_map(_LEASES),
    charged=_amount_map(_LEASES),
    correct_pools=_pool_map(_LEASES),
    charged_pools=_pool_map(_LEASES),
    tolerance=tolerance_st,
)
def test_pool_mode_breakdown_invariants(
    correct, charged, correct_pools, charged_pools, tolerance
):
    result = build_comparison_result(
        correct_by_lease=correct,
        charged_by_lease=charged,
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        tolerance=tolerance,
        correct_by_lease_and_pool=correct_pools,
        charged_by_lease_and_pool=charged_pools,
    )

    for t in result.tenants:
        # Pool mode on: every tenant carries a (possibly empty) list, never None.
        assert t.pool_breakdowns is not None
        cp = correct_pools.get(t.lease_id, {})
        bp = charged_pools.get(t.lease_id, {})
        pool_union = set(cp) | set(bp)
        assert {p.pool_id for p in t.pool_breakdowns} == pool_union

        # Per-pool rows obey the same signed convention as the tenant level.
        pb_abs = [p.abs_variance for p in t.pool_breakdowns]
        assert pb_abs == sorted(pb_abs, reverse=True)
        for p in t.pool_breakdowns:
            pc = cp.get(p.pool_id, Decimal("0"))
            pb = bp.get(p.pool_id, Decimal("0"))
            assert p.capveri_correct == pc
            assert p.actual_charged == pb
            assert p.variance == pb - pc
            assert p.abs_variance == abs(pb - pc)
            assert p.direction == classify_variance(pb - pc, tolerance)
            assert p.variance_pct == _expected_pct(pb - pc, pc)


@STRESS
@given(
    correct=_amount_map(_LEASES),
    charged=_amount_map(_LEASES),
)
def test_zero_tolerance_only_exact_matches(correct, charged):
    """With tolerance 0, MATCH iff the variance is exactly zero."""
    result = build_comparison_result(
        correct_by_lease=correct,
        charged_by_lease=charged,
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        tolerance=Decimal("0"),
    )
    for t in result.tenants:
        if t.variance == 0:
            assert t.direction is VarianceDirection.MATCH
        else:
            assert t.direction is not VarianceDirection.MATCH


@given(tolerance=st.decimals(max_value=Decimal("-0.01"), allow_nan=False, places=2))
@settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)
def test_negative_tolerance_rejected(tolerance):
    with pytest.raises(ValueError):
        build_comparison_result(
            correct_by_lease={},
            charged_by_lease={},
            property_id=uuid4(),
            period_start=_PERIOD_START,
            period_end=_PERIOD_END,
            tolerance=tolerance,
        )


@st.composite
def _rekey_payload(draw):
    """A (correct_by_lease, tenant_names, charged_by_name, unidentified) tuple.

    Names are drawn from a small pool so duplicate-name leases (the ambiguous
    combine branch) occur frequently, and names overlap with the charged side.
    """
    leases = draw(
        st.lists(st.sampled_from(_LEASES), min_size=0, max_size=5, unique=True)
    )
    correct_by_lease = {lid: draw(money()) for lid in leases}
    tenant_names = {lid: draw(st.sampled_from(_NAMES)) for lid in leases}
    charged_by_name = draw(
        st.dictionaries(st.sampled_from(_NAMES), money(), max_size=len(_NAMES))
    )
    unidentified = draw(
        st.lists(
            st.tuples(st.uuids().map(str), money()),
            max_size=4,
        )
    )
    return correct_by_lease, tenant_names, charged_by_name, unidentified


@STRESS
@given(payload=_rekey_payload())
def test_rekey_conserves_money(payload):
    correct_by_lease, tenant_names, charged_by_name, unidentified = payload
    correct_for_compare, charged_by_lease, names = _rekey_charged_to_leases(
        correct_by_lease, tenant_names, charged_by_name, unidentified
    )

    # No CapVeri-correct dollar is dropped or double-counted across the re-key:
    # combined duplicate-name buckets re-sum their siblings exactly.
    assert sum(correct_for_compare.values(), Decimal("0")) == sum(
        correct_by_lease.values(), Decimal("0")
    )

    # No charged dollar is dropped or invented: every named charge plus every
    # unidentified row lands somewhere in the output exactly once.
    expected_charged = sum(charged_by_name.values(), Decimal("0")) + sum(
        (amt for _, amt in unidentified), Decimal("0")
    )
    assert sum(charged_by_lease.values(), Decimal("0")) == expected_charged

    # Every emitted key feeds straight into build_comparison_result, so feeding
    # the re-keyed maps through must not raise and must conserve the same totals.
    result = build_comparison_result(
        correct_by_lease=correct_for_compare,
        charged_by_lease=charged_by_lease,
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        tenant_names=names,
    )
    assert result.total_capveri_correct == sum(correct_by_lease.values(), Decimal("0"))
    assert result.total_actual_charged == expected_charged

    # Re-key is deterministic.
    again = _rekey_charged_to_leases(
        correct_by_lease, tenant_names, charged_by_name, unidentified
    )
    assert again == (correct_for_compare, charged_by_lease, names)


@STRESS
@given(
    variance=money(),
    correct=money(),
)
def test_signed_variance_pct_contract(variance, correct):
    pct = _signed_variance_pct(variance, correct)
    if correct == 0:
        assert pct is None
    else:
        assert pct == (variance / abs(correct) * Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        # Sign of the percentage tracks the signed variance direction even when
        # the correct-side baseline is a net credit (unless a tiny ratio rounds
        # down to exactly 0.00).
        if pct != 0:
            assert (pct > 0) == (variance > 0)


@STRESS
@given(
    variance=precise_money(),
    correct=nonzero_precise_money(),
)
def test_signed_variance_pct_matches_independent_fraction_oracle(variance, correct):
    """Pin pct math against a rational oracle, not a copy of the Decimal formula."""
    pct = _signed_variance_pct(variance, correct)
    assert pct == _independent_pct_oracle(variance, correct)
    assert pct is not None
    assert pct.as_tuple().exponent == -2


@pytest.mark.parametrize(
    ("variance", "correct", "expected"),
    [
        (Decimal("1"), Decimal("6"), Decimal("16.67")),
        (Decimal("-1"), Decimal("6"), Decimal("-16.67")),
        (Decimal("1"), Decimal("-6"), Decimal("16.67")),
        (Decimal("0.000005"), Decimal("1"), Decimal("0.00")),
        (Decimal("0.00005"), Decimal("1"), Decimal("0.01")),
        (Decimal("-0.00005"), Decimal("1"), Decimal("-0.01")),
        (Decimal("5"), Decimal("800"), Decimal("0.63")),
    ],
)
def test_signed_variance_pct_fraction_oracle_anchors(variance, correct, expected):
    assert _independent_pct_oracle(variance, correct) == expected
    assert _signed_variance_pct(variance, correct) == expected


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
