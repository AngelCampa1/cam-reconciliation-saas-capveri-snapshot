"""Tests for centralized logging configuration."""

import json
import logging

from app.core.logging import (
    CorrelationIdFilter,
    JSONFormatter,
    TextFormatter,
    configure_logging,
    correlation_id_var,
    get_correlation_id,
    get_uvicorn_log_config,
    set_correlation_id,
)


class TestCorrelationId:
    """Tests for correlation ID context management."""

    def setup_method(self) -> None:
        """Reset correlation ID before each test."""
        correlation_id_var.set(None)

    def test_get_correlation_id_default_is_none(self) -> None:
        """Correlation ID should be None by default."""
        assert get_correlation_id() is None

    def test_set_and_get_correlation_id(self) -> None:
        """Should be able to set and retrieve correlation ID."""
        set_correlation_id("test-123")
        assert get_correlation_id() == "test-123"


class TestCorrelationIdFilter:
    """Tests for the correlation ID logging filter."""

    def setup_method(self) -> None:
        """Reset correlation ID before each test."""
        correlation_id_var.set(None)

    def test_adds_correlation_id_to_record(self) -> None:
        """Filter should add correlation_id attribute to log record."""
        set_correlation_id("filter-test-id")
        filter_instance = CorrelationIdFilter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="test",
            args=(),
            exc_info=None,
        )

        result = filter_instance.filter(record)

        assert result is True
        assert record.correlation_id == "filter-test-id"

    def test_uses_dash_when_no_correlation_id(self) -> None:
        """Filter should use '-' when no correlation ID is set."""
        filter_instance = CorrelationIdFilter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="test",
            args=(),
            exc_info=None,
        )

        filter_instance.filter(record)

        assert record.correlation_id == "-"


class TestJSONFormatter:
    """Tests for JSON log formatter."""

    def test_format_basic_message(self) -> None:
        """Should format a basic log message as JSON."""
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=10,
            msg="Test message",
            args=(),
            exc_info=None,
        )
        record.correlation_id = "abc-123"

        output = formatter.format(record)
        data = json.loads(output)

        assert data["level"] == "INFO"
        assert data["logger"] == "test.logger"
        assert data["message"] == "Test message"
        assert data["correlation_id"] == "abc-123"
        assert "timestamp" in data

    def test_format_error_includes_location(self) -> None:
        """ERROR level should include file location."""
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test.logger",
            level=logging.ERROR,
            pathname="/app/test.py",
            lineno=42,
            msg="Error occurred",
            args=(),
            exc_info=None,
            func="test_function",
        )
        record.correlation_id = "-"

        output = formatter.format(record)
        data = json.loads(output)

        assert "location" in data
        assert data["location"]["line"] == 42
        assert data["location"]["function"] == "test_function"

    def test_format_includes_extra_fields(self) -> None:
        """Should include extra fields passed to logger."""
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=10,
            msg="Test message",
            args=(),
            exc_info=None,
        )
        record.correlation_id = "-"
        record.user_id = "usr_123"
        record.action = "login"

        output = formatter.format(record)
        data = json.loads(output)

        assert "extra" in data
        assert data["extra"]["user_id"] == "usr_123"
        assert data["extra"]["action"] == "login"


class TestTextFormatter:
    """Tests for human-readable text formatter."""

    def test_format_basic_message(self) -> None:
        """Should format message in human-readable format."""
        formatter = TextFormatter(use_colors=False)
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=10,
            msg="Test message",
            args=(),
            exc_info=None,
        )
        record.correlation_id = "abc-12345-def"

        output = formatter.format(record)

        assert "INFO" in output
        assert "[abc-1234" in output  # First 8 chars of correlation ID
        assert "test.logger" in output
        assert "Test message" in output

    def test_format_with_dash_correlation_id(self) -> None:
        """Should handle dash correlation ID correctly."""
        formatter = TextFormatter(use_colors=False)
        record = logging.LogRecord(
            name="test",
            level=logging.WARNING,
            pathname="test.py",
            lineno=1,
            msg="Warning",
            args=(),
            exc_info=None,
        )
        record.correlation_id = "-"

        output = formatter.format(record)

        assert "[-]" in output
        assert "WARNING" in output


class TestConfigureLogging:
    """Tests for logging configuration."""

    def teardown_method(self) -> None:
        """Clean up logging configuration after each test."""
        root = logging.getLogger()
        root.handlers.clear()
        root.setLevel(logging.WARNING)

    def test_configure_json_format(self) -> None:
        """Should configure JSON formatting."""
        configure_logging(log_level="DEBUG", log_format="json")

        root = logging.getLogger()
        assert root.level == logging.DEBUG
        assert len(root.handlers) == 1
        assert isinstance(root.handlers[0].formatter, JSONFormatter)

    def test_configure_text_format(self) -> None:
        """Should configure text formatting."""
        configure_logging(log_level="INFO", log_format="text")

        root = logging.getLogger()
        assert root.level == logging.INFO
        assert isinstance(root.handlers[0].formatter, TextFormatter)

    def test_configure_sets_third_party_levels(self) -> None:
        """Should set appropriate levels for third-party loggers."""
        configure_logging(log_level="DEBUG", log_format="json")

        assert logging.getLogger("botocore").level == logging.WARNING
        assert logging.getLogger("httpx").level == logging.WARNING


class TestUvicornConfig:
    """Tests for uvicorn log configuration."""

    def test_get_uvicorn_log_config_json(self) -> None:
        """Should return valid uvicorn config for JSON."""
        config = get_uvicorn_log_config("INFO", "json")

        assert config["version"] == 1
        assert "uvicorn" in config["loggers"]
        assert "default" in config["formatters"]
        assert "JSONFormatter" in config["formatters"]["default"]["()"]

    def test_get_uvicorn_log_config_text(self) -> None:
        """Should return valid uvicorn config for text."""
        config = get_uvicorn_log_config("DEBUG", "text")

        assert config["loggers"]["uvicorn"]["level"] == "DEBUG"
        assert "TextFormatter" in config["formatters"]["default"]["()"]
