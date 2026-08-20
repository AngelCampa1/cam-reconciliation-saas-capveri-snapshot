"""Tests for the shared USD currency formatter.

The critical contract: a credit (negative amount) renders with the minus leading
the symbol (``-$X``), never floating between symbol and digits (``$-X``), on
every client-facing surface that routes through these helpers.
"""

from decimal import Decimal

from app.services.formatting import format_usd, format_usd_delta, format_usd_whole


class TestFormatUsd:
    def test_positive(self) -> None:
        assert format_usd(Decimal("1234.56")) == "$1,234.56"

    def test_negative_minus_leads_symbol(self) -> None:
        assert format_usd(Decimal("-1234.56")) == "-$1,234.56"

    def test_zero(self) -> None:
        assert format_usd(Decimal("0")) == "$0.00"

    def test_accepts_string(self) -> None:
        assert format_usd("-5000") == "-$5,000.00"


class TestFormatUsdDelta:
    def test_increase_shows_plus(self) -> None:
        assert format_usd_delta(Decimal("1234.56")) == "+$1,234.56"

    def test_decrease_minus_leads_symbol(self) -> None:
        assert format_usd_delta(Decimal("-1234.56")) == "-$1,234.56"

    def test_zero_shows_plus(self) -> None:
        assert format_usd_delta(Decimal("0")) == "+$0.00"


class TestFormatUsdWhole:
    def test_positive_rounds_to_whole_dollars(self) -> None:
        assert format_usd_whole(Decimal("1234.56")) == "$1,235"

    def test_negative_minus_leads_symbol(self) -> None:
        assert format_usd_whole(Decimal("-1234.56")) == "-$1,235"
