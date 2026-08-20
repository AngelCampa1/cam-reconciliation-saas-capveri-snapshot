"""Penny-exact oracle for the cap-bank ledger simulation.

``simulate_cap_bank`` (cap_bank_ledger.py:24-134) threads a banked cap-capacity
balance across years and records, per year, the cap threshold, what the tenant
was billed, what the landlord absorbed, and the opening/closing bank. Its math is
a delicate sequence of per-step ``quantize(0.01, ROUND_HALF_UP)`` calls:

    q = Decimal("0.01")
    # cumulative-linear setup:
    annual_increase_limit = cap_fixed                       # RAW (no quantize)
                          | round(base * cap_rate, 2)        # rate path: quantized
    # per year i (actual = actuals[i]):
    bank_opening   = round(running_bank, 2)
    # cumulative-linear:
    cap_threshold  = round(running_reference + annual_increase_limit, 2)
    # cumulative-compounding (no running reference):
    cap_threshold  = round(base + cap_fixed * (i + 1), 2)            # fixed
                   | round(base * (1 + cap_rate) ** (i + 1), 2)      # rate
    effective_max  = round(cap_threshold + running_bank, 2)  # RAW running_bank
    if actual <= effective_max:
        amount_applied = actual; excess = 0
        new_bank       = round(effective_max - actual, 2)
    else:
        amount_applied = effective_max
        excess         = round(actual - effective_max, 2); new_bank = 0
    bank_change    = round(new_bank - bank_opening, 2)
    # advance: running_reference = actual (linear only); running_bank = new_bank

``test_cap_bank_ledger_stress.py`` pins only STRUCTURAL/conservation facts —
``amount_applied + excess == actual``, ``amount_applied <= threshold + bank``,
non-negativity, cent-divisibility, the ``bank_change == closing - opening``
identity, and the running-bank thread. **No test re-derives the ABSOLUTE value of
``cap_threshold`` / ``amount_applied`` / ``bank_closing`` / ``bank_change`` for any
year from the input formula with ``==``** — so the threshold arithmetic, the
compounding exponentiation, the rate-vs-fixed pre-quantize divergence, and the
bank carry-forward value are unpinned.

This drives the real ``simulate_cap_bank`` and re-derives every per-year money
field with ``==`` (no tolerance), for both cap modes and both rate/fixed configs.

Run standalone:
    pytest tests/stress/test_cap_bank_ledger_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.cap_bank_ledger import simulate_cap_bank
from app.services.calculation.caps import CapType

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_Q = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(_Q, rounding=ROUND_HALF_UP)


def _money(min_value: str = "0", max_value: str = "10000000"):
    return st.decimals(
        min_value=Decimal(min_value),
        max_value=Decimal(max_value),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


_actuals = st.lists(_money(), min_size=1, max_size=8)
_cap_type = st.sampled_from([CapType.CUMULATIVE, CapType.CUMULATIVE_COMPOUNDING])


@st.composite
def _cap_config(draw):
    """A valid cap config: a rate OR a fixed amount (at least one is required)."""
    if draw(st.booleans()):
        rate = draw(
            st.decimals(
                min_value=Decimal("0.0001"),
                max_value=Decimal("0.5"),
                places=4,
                allow_nan=False,
                allow_infinity=False,
            )
        )
        return rate, None
    return None, draw(_money(min_value="0", max_value="1000000"))


def _oracle(
    base: Decimal,
    cap_rate: Decimal | None,
    cap_fixed: Decimal | None,
    actuals: list[Decimal],
    cap_type: str,
) -> list[tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]]:
    """Independently re-derive (threshold, applied, excess, opening, change, closing)
    per year, replaying the exact per-step quantize order of the production code."""
    if cap_type == CapType.CUMULATIVE:
        if cap_fixed is not None:
            annual_increase_limit: Decimal | None = cap_fixed  # raw, not quantized
        else:
            assert cap_rate is not None
            annual_increase_limit = _q(base * cap_rate)
    else:
        annual_increase_limit = None

    out = []
    running_reference = base
    running_bank = Decimal("0")
    for i, actual in enumerate(actuals):
        bank_opening = _q(running_bank)
        if cap_type == CapType.CUMULATIVE_COMPOUNDING:
            years_since_base = i + 1
            if cap_fixed is not None:
                cap_threshold = _q(base + cap_fixed * years_since_base)
            else:
                assert cap_rate is not None
                cap_threshold = _q(
                    base * ((Decimal("1") + cap_rate) ** years_since_base)
                )
        else:
            assert annual_increase_limit is not None
            cap_threshold = _q(running_reference + annual_increase_limit)
        effective_max = _q(cap_threshold + running_bank)

        if actual <= effective_max:
            amount_applied = actual
            excess = Decimal("0")
            new_bank = _q(effective_max - actual)
        else:
            amount_applied = effective_max
            excess = _q(actual - effective_max)
            new_bank = Decimal("0")
        bank_change = _q(new_bank - bank_opening)

        out.append(
            (cap_threshold, amount_applied, excess, bank_opening, bank_change, new_bank)
        )

        if cap_type == CapType.CUMULATIVE:
            running_reference = actual
        running_bank = new_bank
    return out


@STRESS
@given(base=_money(), cfg=_cap_config(), acts=_actuals, cap_type=_cap_type)
def test_cap_bank_ledger_values_round_trip_exactly(base, cfg, acts, cap_type):
    cap_rate, cap_fixed = cfg
    entries = simulate_cap_bank(
        base_amount=base,
        cap_rate=cap_rate,
        cap_fixed_amount=cap_fixed,
        actual_amounts=acts,
        cap_type=cap_type,
    )
    oracle = _oracle(base, cap_rate, cap_fixed, acts, cap_type)
    assert len(entries) == len(oracle)

    for entry, (threshold, applied, excess, opening, change, closing) in zip(
        entries, oracle
    ):
        assert entry.cap_threshold == threshold
        assert entry.amount_applied == applied
        assert entry.excess_absorbed_by_landlord == excess
        assert entry.bank_opening == opening
        assert entry.bank_change == change
        assert entry.bank_closing == closing


def test_anchor_linear_banks_then_draws_down():
    """5% linear cap: an under-billed year banks room, a later spike draws it."""
    # base 100000, 5% -> annual increase 5000.
    # y0: threshold 100000+5000=105000; actual 102000 <= 105000 -> applied 102000,
    #     bank 3000.
    # y1: reference now 102000; threshold 107000; eff_max 107000+3000=110000;
    #     actual 111000 > 110000 -> applied 110000, excess 1000, bank 0.
    entries = simulate_cap_bank(
        base_amount=Decimal("100000.00"),
        cap_rate=Decimal("0.05"),
        actual_amounts=[Decimal("102000.00"), Decimal("111000.00")],
        cap_type=CapType.CUMULATIVE,
    )
    assert entries[0].cap_threshold == Decimal("105000.00")
    assert entries[0].amount_applied == Decimal("102000.00")
    assert entries[0].bank_closing == Decimal("3000.00")
    assert entries[1].cap_threshold == Decimal("107000.00")
    assert entries[1].amount_applied == Decimal("110000.00")
    assert entries[1].excess_absorbed_by_landlord == Decimal("1000.00")
    assert entries[1].bank_closing == Decimal("0.00")


def test_anchor_compounding_threshold_grows_geometrically():
    """10% compounding cap grows the threshold as base*(1.1)^year, year by year."""
    # base 100000, 10% compounding: y0 -> 110000, y1 -> 121000, y2 -> 133100.
    entries = simulate_cap_bank(
        base_amount=Decimal("100000.00"),
        cap_rate=Decimal("0.10"),
        actual_amounts=[Decimal("0.00"), Decimal("0.00"), Decimal("0.00")],
        cap_type=CapType.CUMULATIVE_COMPOUNDING,
    )
    assert entries[0].cap_threshold == Decimal("110000.00")
    assert entries[1].cap_threshold == Decimal("121000.00")
    assert entries[2].cap_threshold == Decimal("133100.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
