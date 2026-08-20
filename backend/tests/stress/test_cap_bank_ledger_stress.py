"""Property-based stress for the cap-bank ledger simulation.

``simulate_cap_bank`` is a pure year-by-year state machine: it threads a banked
cap-capacity balance across years, applies either a linear (cumulative) or a
compounding cap threshold, and records what the tenant was billed vs. what the
landlord absorbed. The example-based suite in ``tests/test_cap_bank_ledger.py``
covers named scenarios; this harness fuzzes arbitrary multi-year actual-expense
sequences under both cap modes and rate/fixed configurations, asserting the
structural invariants that must hold for every ledger so a future refactor of
the bank-threading or quantization cannot silently corrupt a tenant's cap math.

Per-year invariants (every entry):
  * conservation: ``amount_applied + excess_absorbed == actual_expense`` exactly;
  * ``amount_applied`` never exceeds the effective max (``cap_threshold + bank``);
  * excess and bank balances are non-negative cent-quantized money;
  * a year cannot BOTH absorb excess AND carry forward banked capacity
    (excess > 0 ⟺ bank_closing == 0 once the cap binds);
  * ``bank_change == bank_closing - bank_opening``.

Cross-year invariants:
  * exactly one entry per supplied actual amount;
  * year 0 opens with a zero bank; every later year opens at the prior year's
    closing balance (the running-bank thread is unbroken);
  * total landlord-absorbed excess is the non-negative sum of per-year excess.

Run standalone:
    pytest tests/stress/test_cap_bank_ledger_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

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

CENT = Decimal("0.01")


def _money(min_value="0", max_value="10000000"):
    return st.decimals(
        min_value=Decimal(min_value),
        max_value=Decimal(max_value),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


actuals = st.lists(_money(), min_size=1, max_size=8)

cap_type_strat = st.sampled_from([CapType.CUMULATIVE, CapType.CUMULATIVE_COMPOUNDING])


@st.composite
def cap_config(draw):
    """A valid cap config: a rate OR a fixed amount (at least one is required)."""
    use_rate = draw(st.booleans())
    if use_rate:
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
    fixed = draw(_money(min_value="0", max_value="1000000"))
    return None, fixed


@STRESS
@given(
    base=_money(),
    cfg=cap_config(),
    acts=actuals,
    cap_type=cap_type_strat,
)
def test_cap_bank_ledger_invariants(base, cfg, acts, cap_type):
    cap_rate, cap_fixed = cfg
    entries = simulate_cap_bank(
        base_amount=base,
        cap_rate=cap_rate,
        cap_fixed_amount=cap_fixed,
        actual_amounts=acts,
        cap_type=cap_type,
    )

    # Exactly one entry per supplied actual.
    assert len(entries) == len(acts)

    prev_closing = Decimal("0")
    for year_idx, (entry, actual) in enumerate(zip(entries, acts)):
        # The actual is echoed back unchanged.
        assert entry.actual_expense == actual

        # Non-negativity of money fields.
        assert entry.amount_applied >= 0
        assert entry.excess_absorbed_by_landlord >= 0
        assert entry.bank_opening >= 0
        assert entry.bank_closing >= 0

        # Cent-quantization of the derived money fields.
        for field in (
            entry.amount_applied,
            entry.excess_absorbed_by_landlord,
            entry.bank_opening,
            entry.bank_closing,
            entry.bank_change,
            entry.cap_threshold,
        ):
            assert field % CENT == 0

        # Conservation: nothing is created or lost — the tenant's actual splits
        # exactly into what was billed and what the landlord absorbed.
        assert entry.amount_applied + entry.excess_absorbed_by_landlord == actual

        # The bill never exceeds the effective ceiling (threshold + banked room).
        effective_max = entry.cap_threshold + entry.bank_opening
        assert entry.amount_applied <= effective_max

        # A year either banks unused room OR absorbs excess, never both.
        if entry.excess_absorbed_by_landlord > 0:
            assert entry.bank_closing == 0
        if entry.bank_closing > 0:
            assert entry.excess_absorbed_by_landlord == 0

        # bank_change ties the opening and closing balances together.
        assert entry.bank_change == entry.bank_closing - entry.bank_opening

        # State-threading: year 0 opens flat; later years inherit prior closing.
        assert entry.bank_opening == prev_closing
        prev_closing = entry.bank_closing

    # Landlord absorption is the non-negative sum of per-year excess.
    total_absorbed = sum((e.excess_absorbed_by_landlord for e in entries), Decimal("0"))
    assert total_absorbed >= 0


@STRESS
@given(base=_money(), acts=actuals)
def test_empty_or_unconfigured_returns_no_entries(base, acts):
    """No cap configuration, empty actuals, or an unknown cap type → no ledger."""
    # No rate and no fixed amount → nothing to simulate.
    assert (
        simulate_cap_bank(
            base_amount=base,
            cap_rate=None,
            cap_fixed_amount=None,
            actual_amounts=acts,
            cap_type=CapType.CUMULATIVE,
        )
        == []
    )
    # Empty actuals → no entries even with a valid cap.
    assert (
        simulate_cap_bank(
            base_amount=base,
            cap_rate=Decimal("0.05"),
            actual_amounts=[],
            cap_type=CapType.CUMULATIVE,
        )
        == []
    )
    # Non-cumulative (or any unsupported) cap type → no ledger.
    assert (
        simulate_cap_bank(
            base_amount=base,
            cap_rate=Decimal("0.05"),
            actual_amounts=acts,
            cap_type=CapType.NON_CUMULATIVE,
        )
        == []
    )


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
