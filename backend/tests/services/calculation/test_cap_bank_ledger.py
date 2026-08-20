"""
Tests for cap bank ledger service.

Tests the simulate_cap_bank helper function and the CapBankLedger model construction.
TDD: Written before implementation.
"""

from decimal import Decimal

from app.services.calculation.cap_bank_ledger import simulate_cap_bank
from app.services.calculation.caps import CapType


class TestSimulateCapBank:
    """Test the simulate_cap_bank helper that reconstructs year-by-year bank balances."""

    def test_cumulative_three_years_banking(self):
        """Classic 3-year scenario from caps.py docstring.

        5% cap, $100k base:
        Year 1: Max=$105k, Actual=$102k → Bank opening=0, change=+3k, closing=3k
        Year 2: Max=$110k (=102k+5k+3k), Actual=$108k → Bank opening=3k, change=-1k, closing=2k
        Year 3: Max=$115k (=108k+5k+2k), Actual=$117k → capped at $115k
        """
        entries = simulate_cap_bank(
            base_amount=Decimal("100000"),
            cap_rate=Decimal("0.05"),
            actual_amounts=[
                Decimal("102000"),
                Decimal("108000"),
                Decimal("117000"),
            ],
            cap_type=CapType.CUMULATIVE,
        )

        assert len(entries) == 3

        # Year 1: base=100k, max=105k, actual=102k, bank +3k
        e1 = entries[0]
        assert e1.base_year_amount == Decimal("100000")
        assert e1.cap_threshold == Decimal("105000.00")
        assert e1.actual_expense == Decimal("102000")
        assert e1.bank_opening == Decimal("0")
        assert e1.bank_change == Decimal("3000.00")
        assert e1.bank_closing == Decimal("3000.00")
        assert e1.amount_applied == Decimal("102000")
        assert e1.excess_absorbed_by_landlord == Decimal("0")

        # Year 2: reference=102k, cap_threshold=102k+5k=107k (before bank),
        # effective_max=107k+3k=110k, actual=108k, new_bank=110k-108k=2k
        e2 = entries[1]
        assert e2.cap_threshold == Decimal("107000.00")
        assert e2.actual_expense == Decimal("108000")
        assert e2.bank_opening == Decimal("3000.00")
        assert e2.bank_change == Decimal("-1000.00")
        assert e2.bank_closing == Decimal("2000.00")
        assert e2.amount_applied == Decimal("108000")
        assert e2.excess_absorbed_by_landlord == Decimal("0")

        # Year 3: reference=108k, cap_threshold=108k+5k=113k (before bank),
        # effective_max=113k+2k=115k, actual=117k → capped at 115k
        e3 = entries[2]
        assert e3.cap_threshold == Decimal("113000.00")
        assert e3.actual_expense == Decimal("117000")
        assert e3.bank_opening == Decimal("2000.00")
        assert e3.bank_change == Decimal("-2000.00")
        assert e3.bank_closing == Decimal("0")
        assert e3.amount_applied == Decimal("115000.00")
        assert e3.excess_absorbed_by_landlord == Decimal("2000.00")

    def test_single_year_no_bank(self):
        """First year has no bank history."""
        entries = simulate_cap_bank(
            base_amount=Decimal("100000"),
            cap_rate=Decimal("0.05"),
            actual_amounts=[Decimal("102000")],
            cap_type=CapType.CUMULATIVE,
        )

        assert len(entries) == 1
        e = entries[0]
        assert e.bank_opening == Decimal("0")
        assert e.bank_closing == Decimal("3000.00")
        assert e.amount_applied == Decimal("102000")

    def test_empty_amounts_returns_empty(self):
        """No amounts → no entries."""
        entries = simulate_cap_bank(
            base_amount=Decimal("100000"),
            cap_rate=Decimal("0.05"),
            actual_amounts=[],
            cap_type=CapType.CUMULATIVE,
        )
        assert entries == []

    def test_non_cumulative_cap_returns_empty(self):
        """Non-cumulative caps have no bank concept."""
        entries = simulate_cap_bank(
            base_amount=Decimal("100000"),
            cap_rate=Decimal("0.05"),
            actual_amounts=[Decimal("102000")],
            cap_type=CapType.NON_CUMULATIVE,
        )
        assert entries == []

    def test_no_cap_returns_empty(self):
        """No cap type → no bank."""
        entries = simulate_cap_bank(
            base_amount=Decimal("100000"),
            cap_rate=Decimal("0.05"),
            actual_amounts=[Decimal("102000")],
            cap_type=CapType.NONE,
        )
        assert entries == []

    def test_cumulative_compounding_cap(self):
        """Compounding cap: base grows exponentially.

        5% compounding, $100k base:
        Year 1: Max = 100k * 1.05 = 105k
        Year 2: Max = 100k * 1.05^2 = 110.25k
        """
        entries = simulate_cap_bank(
            base_amount=Decimal("100000"),
            cap_rate=Decimal("0.05"),
            actual_amounts=[
                Decimal("102000"),
                Decimal("108000"),
            ],
            cap_type=CapType.CUMULATIVE_COMPOUNDING,
        )

        assert len(entries) == 2

        # Year 1: max=105000, actual=102000
        e1 = entries[0]
        assert e1.cap_threshold == Decimal("105000.00")
        assert e1.bank_opening == Decimal("0")
        assert e1.bank_closing == Decimal("3000.00")

        # Year 2: compounded max=110250, bank=3000, effective_max=110250+3000=113250
        # actual=108000, new_bank=113250-108000=5250
        e2 = entries[1]
        assert e2.cap_threshold == Decimal("110250.00")
        assert e2.actual_expense == Decimal("108000")
        assert e2.bank_opening == Decimal("3000.00")
        assert e2.bank_closing == Decimal("5250.00")

    def test_bank_carries_forward_across_five_years(self):
        """Bank accumulates and is consumed correctly over 5 years."""
        entries = simulate_cap_bank(
            base_amount=Decimal("100000"),
            cap_rate=Decimal("0.05"),
            actual_amounts=[
                Decimal("100000"),  # Year 1: all banked (5k)
                Decimal("100000"),  # Year 2: all banked
                Decimal("100000"),  # Year 3: all banked
                Decimal("100000"),  # Year 4: all banked
                Decimal("130000"),  # Year 5: big spike, uses bank
            ],
            cap_type=CapType.CUMULATIVE,
        )

        assert len(entries) == 5

        # After year 4, the bank should have accumulated significantly
        # Year 1: ref=100k, max=100k+5k+0=105k, actual=100k, bank=5k
        assert entries[0].bank_closing == Decimal("5000.00")

        # Year 2: ref=100k, max=100k+5k+5k=110k, actual=100k, bank=10k
        assert entries[1].bank_closing == Decimal("10000.00")

        # Year 3: ref=100k, max=100k+5k+10k=115k, actual=100k, bank=15k
        assert entries[2].bank_closing == Decimal("15000.00")

        # Year 4: ref=100k, max=100k+5k+15k=120k, actual=100k, bank=20k
        assert entries[3].bank_closing == Decimal("20000.00")

        # Year 5: ref=100k, max=100k+5k+20k=125k, actual=130k → capped at 125k
        assert entries[4].bank_opening == Decimal("20000.00")
        assert entries[4].amount_applied == Decimal("125000.00")
        assert entries[4].excess_absorbed_by_landlord == Decimal("5000.00")
        assert entries[4].bank_closing == Decimal("0")

    def test_fixed_dollar_cap(self):
        """Fixed dollar cap instead of percentage cap."""
        entries = simulate_cap_bank(
            base_amount=Decimal("100000"),
            cap_rate=None,
            cap_fixed_amount=Decimal("5000"),
            actual_amounts=[Decimal("102000"), Decimal("108000")],
            cap_type=CapType.CUMULATIVE,
        )

        assert len(entries) == 2
        # Year 1: max=100k+5k=105k, actual=102k, bank=3k
        assert entries[0].cap_threshold == Decimal("105000.00")
        assert entries[0].bank_closing == Decimal("3000.00")

        # Year 2: ref=102k, cap_threshold=102k+5k=107k, effective_max=107k+3k=110k
        assert entries[1].cap_threshold == Decimal("107000.00")
        assert entries[1].bank_closing == Decimal("2000.00")
