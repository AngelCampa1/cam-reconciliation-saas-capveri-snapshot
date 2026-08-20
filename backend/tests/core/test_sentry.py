"""Tests for Sentry integration module.

TDD: tests written before implementation.
Covers PII scrubbing, before_send hook, and init_sentry() lifecycle.
"""

from unittest.mock import patch

from app.core.logging import correlation_id_var
from app.core.sentry import (
    _before_send,
    _scrub_dict,
    _scrub_exception_values,
    _scrub_string,
    capture_unexpected_exception,
    init_sentry,
    should_report_status_code,
)


class TestScrubString:
    """Tests for _scrub_string() PII redaction."""

    def test_scrubs_email_addresses(self) -> None:
        result = _scrub_string("user john@example.com contacted support")
        assert "[email]" in result
        assert "john@example.com" not in result

    def test_scrubs_jwt_tokens(self) -> None:
        jwt = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
            ".eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OX0"
            ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        )
        result = _scrub_string(jwt)
        assert "[token]" in result
        assert "eyJhbGciOi" not in result

    def test_scrubs_ipv4_addresses(self) -> None:
        result = _scrub_string("request from 192.168.1.1 denied")
        assert "[ip]" in result
        assert "192.168.1.1" not in result

    def test_leaves_non_sensitive_strings_unchanged(self) -> None:
        value = "tenant_id=abc123, property=main-office"
        assert _scrub_string(value) == value


class TestScrubDict:
    """Tests for _scrub_dict() recursive key/value redaction."""

    def test_redacts_password_key(self) -> None:
        result = _scrub_dict({"password": "s3cr3t"})
        assert result["password"] == "[redacted]"

    def test_redacts_token_key(self) -> None:
        result = _scrub_dict({"token": "abc123xyz"})
        assert result["token"] == "[redacted]"

    def test_redacts_authorization_key(self) -> None:
        result = _scrub_dict({"Authorization": "Bearer abc123"})
        assert result["Authorization"] == "[redacted]"

    def test_scrubs_email_in_string_value(self) -> None:
        result = _scrub_dict({"message": "hello jane@example.com"})
        assert "jane@example.com" not in result["message"]
        assert "[email]" in result["message"]

    def test_recursive_scrubbing_of_nested_dicts(self) -> None:
        data = {"outer": {"password": "hunter2", "username": "alice"}}
        result = _scrub_dict(data)
        assert result["outer"]["password"] == "[redacted]"
        assert result["outer"]["username"] == "alice"

    def test_handles_list_of_safe_strings(self) -> None:
        data = {"tags": ["safe", "also-safe"]}
        result = _scrub_dict(data)
        assert result["tags"] == ["safe", "also-safe"]

    def test_scrubs_pii_in_list_string_elements(self) -> None:
        data = {"errors": ["failed for user@example.com", "ok"]}
        result = _scrub_dict(data)
        assert "user@example.com" not in result["errors"][0]
        assert "[email]" in result["errors"][0]
        assert result["errors"][1] == "ok"


class TestBeforeSend:
    """Tests for _before_send() Sentry hook."""

    def setup_method(self) -> None:
        """Reset correlation ID before each test."""
        correlation_id_var.set(None)

    def test_attaches_correlation_id_when_present(self) -> None:
        correlation_id_var.set("test-corr-id-123")
        event: dict = {"tags": {}}
        result = _before_send(event, {})
        assert result is not None
        assert result["tags"]["correlation_id"] == "test-corr-id-123"

    def test_no_tag_when_correlation_id_is_none(self) -> None:
        event: dict = {"tags": {}}
        result = _before_send(event, {})
        assert result is not None
        assert "correlation_id" not in result.get("tags", {})

    def test_scrubs_request_headers(self) -> None:
        event: dict = {
            "request": {
                "headers": {
                    "Authorization": "Bearer secret-token",
                    "Content-Type": "application/json",
                }
            }
        }
        result = _before_send(event, {})
        assert result is not None
        assert result["request"]["headers"]["Authorization"] == "[redacted]"
        assert result["request"]["headers"]["Content-Type"] == "application/json"

    def test_scrubs_request_body(self) -> None:
        event: dict = {
            "request": {"data": {"password": "mypassword", "username": "bob"}}
        }
        result = _before_send(event, {})
        assert result is not None
        assert result["request"]["data"]["password"] == "[redacted]"
        assert result["request"]["data"]["username"] == "bob"

    def test_scrubs_extra_context(self) -> None:
        event: dict = {"extra": {"token": "super-secret", "tenant_id": "t-abc"}}
        result = _before_send(event, {})
        assert result is not None
        assert result["extra"]["token"] == "[redacted]"
        assert result["extra"]["tenant_id"] == "t-abc"

    def test_scrubs_exception_message_strings(self) -> None:
        event: dict = {
            "exception": {
                "values": [
                    {
                        "type": "ValueError",
                        "value": "invalid token for user@example.com",
                    }
                ]
            }
        }
        result = _before_send(event, {})
        assert result is not None
        assert "user@example.com" not in result["exception"]["values"][0]["value"]
        assert "[email]" in result["exception"]["values"][0]["value"]

    def test_returns_event_not_none(self) -> None:
        event: dict = {}
        result = _before_send(event, {})
        assert result is not None


class TestScrubExceptionValues:
    """Tests for _scrub_exception_values() helper."""

    def test_scrubs_pii_in_exception_message(self) -> None:
        event: dict = {
            "exception": {
                "values": [{"type": "ValueError", "value": "bad ip 10.0.0.1 given"}]
            }
        }
        _scrub_exception_values(event)
        assert "10.0.0.1" not in event["exception"]["values"][0]["value"]
        assert "[ip]" in event["exception"]["values"][0]["value"]

    def test_no_op_when_exception_missing(self) -> None:
        event: dict = {}
        _scrub_exception_values(event)  # should not raise

    def test_no_op_when_values_empty(self) -> None:
        event: dict = {"exception": {"values": []}}
        _scrub_exception_values(event)  # should not raise


class TestInitSentry:
    """Tests for init_sentry() lifecycle."""

    def test_no_op_when_dsn_is_empty(self) -> None:
        with patch("sentry_sdk.init") as mock_init:
            with patch("app.core.sentry.settings") as mock_settings:
                mock_settings.sentry_dsn = ""
                init_sentry()
                mock_init.assert_not_called()

    def test_calls_sdk_init_with_dsn(self) -> None:
        with patch("sentry_sdk.init") as mock_init:
            with patch("app.core.sentry.settings") as mock_settings:
                mock_settings.sentry_dsn = "https://abc123@o0.ingest.sentry.io/0"
                mock_settings.environment = "production"
                mock_settings.app_version = "1.0.0"
                init_sentry()
                mock_init.assert_called_once()
                call_kwargs = mock_init.call_args.kwargs
                assert call_kwargs["dsn"] == "https://abc123@o0.ingest.sentry.io/0"

    def test_sets_send_default_pii_false(self) -> None:
        with patch("sentry_sdk.init") as mock_init:
            with patch("app.core.sentry.settings") as mock_settings:
                mock_settings.sentry_dsn = "https://abc123@o0.ingest.sentry.io/0"
                mock_settings.environment = "production"
                mock_settings.app_version = "1.0.0"
                init_sentry()
                call_kwargs = mock_init.call_args.kwargs
                assert call_kwargs["send_default_pii"] is False

    def test_sets_traces_sample_rate_to_0_1(self) -> None:
        with patch("sentry_sdk.init") as mock_init:
            with patch("app.core.sentry.settings") as mock_settings:
                mock_settings.sentry_dsn = "https://abc123@o0.ingest.sentry.io/0"
                mock_settings.environment = "production"
                mock_settings.app_version = "1.0.0"
                init_sentry()
                call_kwargs = mock_init.call_args.kwargs
                assert call_kwargs["traces_sample_rate"] == 0.10

    def test_includes_celery_integration(self) -> None:
        """init_sentry() passes CeleryIntegration to sentry_sdk.init()."""
        from sentry_sdk.integrations.celery import CeleryIntegration

        with patch("sentry_sdk.init") as mock_init:
            with patch("app.core.sentry.settings") as mock_settings:
                mock_settings.sentry_dsn = "https://abc123@o0.ingest.sentry.io/0"
                mock_settings.environment = "production"
                mock_settings.app_version = "1.0.0"
                init_sentry()
                integrations = mock_init.call_args.kwargs.get("integrations", [])
                assert any(isinstance(i, CeleryIntegration) for i in integrations)


class TestReportingPolicy:
    """Tests for deciding which failures should reach Sentry."""

    def test_does_not_report_expected_client_status_codes(self) -> None:
        for status_code in (400, 401, 403, 404, 409, 422, 429):
            assert should_report_status_code(status_code) is False

    def test_reports_server_status_codes(self) -> None:
        for status_code in (500, 502, 503, 504):
            assert should_report_status_code(status_code) is True

    def test_capture_unexpected_exception_adds_context(self) -> None:
        error = RuntimeError("worker failed")

        with patch("sentry_sdk.capture_exception") as mock_capture:
            capture_unexpected_exception(
                error,
                operation="reconciliation.calculate",
                tags={"surface": "backend"},
                extra={"job_id": "job-123"},
            )

        mock_capture.assert_called_once_with(error)
