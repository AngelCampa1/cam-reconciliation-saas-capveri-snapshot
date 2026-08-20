"""Tests for SensitiveDataFilter — verifies PII/financial data is scrubbed."""

import logging
import sys

from app.core.log_scrubber import SensitiveDataFilter, scrub

# ---------------------------------------------------------------------------
# Unit tests for the scrub() helper
# ---------------------------------------------------------------------------


class TestScrubHelper:
    def test_scrubs_email(self):
        assert scrub("user alice@tenant.com logged in") == "user [email] logged in"

    def test_scrubs_subdomain_email(self):
        assert (
            scrub("Welcome email queued for bob+tag@mail.example.co.uk")
            == "Welcome email queued for [email]"
        )

    def test_scrubs_jwt_token(self):
        jwt = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
            ".eyJzdWIiOiJ1c2VyLTEyMyJ9"
            ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        )
        result = scrub(f"Validating token: {jwt}")
        assert "[token]" in result
        assert "eyJ" not in result

    def test_scrubs_stripe_customer_id(self):
        assert (
            scrub("Customer cus_1A2B3C4D5E6F7G8H created")
            == "Customer [stripe_id] created"
        )

    def test_scrubs_stripe_subscription_id(self):
        assert (
            scrub("Subscription sub_AbCdEfGhIjKlMnOp activated")
            == "Subscription [stripe_id] activated"
        )

    def test_scrubs_dollar_amount(self):
        assert scrub("Pool total: $12,345.67") == "Pool total: [amount]"

    def test_scrubs_dollar_amount_no_cents(self):
        assert scrub("Estimated recovery $99000") == "Estimated recovery [amount]"

    def test_scrubs_decimal_repr(self):
        assert (
            scrub("base_year_amount=Decimal('45000.00')") == "base_year_amount=[amount]"
        )

    def test_scrubs_negative_decimal_repr(self):
        assert scrub("adjustment=Decimal('-45000.00')") == "adjustment=[amount]"

    def test_scrubs_scientific_notation_decimal_repr(self):
        assert scrub("large_amount=Decimal('1E+7')") == "large_amount=[amount]"

    def test_multiple_patterns_in_one_message(self):
        msg = "User alice@co.com billed $500.00 via cus_xXxXxXxXxXxXxXxX"
        result = scrub(msg)
        assert "[email]" in result
        assert "[amount]" in result
        assert "[stripe_id]" in result
        assert "alice@co.com" not in result
        assert "$500" not in result

    def test_preserves_non_sensitive_data(self):
        msg = "Batch 3a4b5c processed 42 rows in property prop-001"
        assert scrub(msg) == msg

    def test_preserves_uuids(self):
        msg = "org_id=00000000-0000-0000-0000-000000000001 processed"
        assert scrub(msg) == msg


# ---------------------------------------------------------------------------
# Integration tests for SensitiveDataFilter on a LogRecord
# ---------------------------------------------------------------------------


def _make_record(msg: str, *args, **extra) -> logging.LogRecord:
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg=msg,
        args=args,
        exc_info=None,
    )
    for k, v in extra.items():
        setattr(record, k, v)
    return record


class TestSensitiveDataFilter:
    def setup_method(self):
        self.f = SensitiveDataFilter()

    def test_returns_true(self):
        record = _make_record("hello world")
        assert self.f.filter(record) is True

    def test_scrubs_email_in_message(self):
        record = _make_record("Authenticated user: %s", "alice@tenant.com")
        self.f.filter(record)
        assert record.getMessage() == "Authenticated user: [email]"
        assert record.args is None

    def test_scrubs_dollar_amount_in_message(self):
        record = _make_record("Pool total $1,234.56 for year 2023")
        self.f.filter(record)
        assert "[amount]" in record.getMessage()
        assert "$1,234.56" not in record.getMessage()

    def test_redacts_email_extra_field(self):
        record = _make_record("login event", email="bob@landlord.com")
        self.f.filter(record)
        assert record.email == "[redacted]"

    def test_redacts_full_name_extra_field(self):
        record = _make_record("user created", full_name="Bob Smith")
        self.f.filter(record)
        assert record.full_name == "[redacted]"

    def test_redacts_token_extra_field(self):
        record = _make_record("auth", token="secret-token-value")
        self.f.filter(record)
        assert record.token == "[redacted]"

    def test_preserves_non_sensitive_extra_fields(self):
        record = _make_record("batch done", batch_id="abc-123", row_count=42)
        self.f.filter(record)
        assert record.batch_id == "abc-123"
        assert record.row_count == 42

    def test_clears_args_after_interpolation(self):
        record = _make_record("user %s logged in", "alice@co.com")
        self.f.filter(record)
        assert record.args is None

    def test_handles_no_args(self):
        record = _make_record("simple message")
        self.f.filter(record)
        assert record.getMessage() == "simple message"

    def test_scrubs_pii_in_exception_text(self):
        try:
            raise ValueError("Tenant dave@acme.com owes $9,999.00")
        except ValueError:
            import sys

            exc_info = sys.exc_info()

        record = _make_record("error occurred")
        record.exc_info = exc_info
        self.f.filter(record)

        assert record.exc_info is None
        assert record.exc_text is not None
        assert "[email]" in record.exc_text
        assert "[amount]" in record.exc_text
        assert "dave@acme.com" not in record.exc_text
        assert "$9,999.00" not in record.exc_text

    def test_no_exc_info_unchanged(self):
        record = _make_record("no exception here")
        assert record.exc_info is None
        self.f.filter(record)
        assert record.exc_info is None
        assert record.exc_text is None


# ---------------------------------------------------------------------------
# Pipeline integration — filter registered on a real handler
# ---------------------------------------------------------------------------


class TestFilterIntegrationWithHandlers:
    """Verifies scrubbing works end-to-end with actual logging infrastructure."""

    def test_email_scrubbed_in_json_output(self, capsys):
        from app.core.logging import JSONFormatter

        handler = logging.StreamHandler(sys.stdout)
        handler.addFilter(SensitiveDataFilter())
        handler.setFormatter(JSONFormatter())

        logger = logging.getLogger("test.integration")
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        logger.propagate = False

        logger.info("Authenticated user: %s", "carol@propco.com")
        logger.removeHandler(handler)

        captured = capsys.readouterr()
        assert "[email]" in captured.out
        assert "carol@propco.com" not in captured.out

    def test_dollar_amount_scrubbed_in_json_output(self, capsys):
        from app.core.logging import JSONFormatter

        handler = logging.StreamHandler(sys.stdout)
        handler.addFilter(SensitiveDataFilter())
        handler.setFormatter(JSONFormatter())

        logger = logging.getLogger("test.integration.financial")
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        logger.propagate = False

        logger.info("Pool total: $78,900.00 for year 2023")
        logger.removeHandler(handler)

        captured = capsys.readouterr()
        assert "[amount]" in captured.out
        assert "$78,900.00" not in captured.out

    def test_non_sensitive_data_preserved_in_output(self, capsys):
        from app.core.logging import JSONFormatter

        handler = logging.StreamHandler(sys.stdout)
        handler.addFilter(SensitiveDataFilter())
        handler.setFormatter(JSONFormatter())

        logger = logging.getLogger("test.integration.safe")
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        logger.propagate = False

        logger.info("Batch batch-abc-123 processed 57 rows successfully")
        logger.removeHandler(handler)

        captured = capsys.readouterr()
        assert "batch-abc-123" in captured.out
        assert "57" in captured.out
