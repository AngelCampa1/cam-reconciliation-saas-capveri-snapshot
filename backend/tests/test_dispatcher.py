"""Tests for the IngestionDispatcher.

Tests verify:
- AC1: Dispatcher registers available parsers
- AC2: Uses fingerprinting to select best parser
- AC3: Returns appropriate parser instance
- AC4: Logs confidence and selection
- AC5: Can override detection with explicit source
"""

import logging
from io import BytesIO
from typing import BinaryIO

import pandas as pd
import pytest

from app.services.ingestion import (
    IngestionDispatcher,
    IngestionStrategy,
    ParseResult,
    get_dispatcher,
    reset_dispatcher,
)


# Test parser implementations
class MockYardiParser(IngestionStrategy):
    """Mock Yardi parser for testing."""

    @property
    def source_system(self) -> str:
        return "yardi"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        if b"Yardi" in file_header:
            return 1.0
        return 0.0

    def parse(self, file: BinaryIO, file_name: str, property_id: str) -> ParseResult:
        return ParseResult(
            success=True,
            source_system="yardi",
            data=pd.DataFrame({"source": ["yardi"]}),
            row_count=1,
        )


class MockMRIParser(IngestionStrategy):
    """Mock MRI parser for testing."""

    @property
    def source_system(self) -> str:
        return "mri"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        if b"MRI" in file_header:
            return 1.0
        return 0.0

    def parse(self, file: BinaryIO, file_name: str, property_id: str) -> ParseResult:
        return ParseResult(
            success=True,
            source_system="mri",
            data=pd.DataFrame({"source": ["mri"]}),
            row_count=1,
        )


class MockGenericParser(IngestionStrategy):
    """Mock generic parser for testing."""

    @property
    def source_system(self) -> str:
        return "generic"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        return 0.1  # Low confidence, fallback

    def parse(self, file: BinaryIO, file_name: str, property_id: str) -> ParseResult:
        return ParseResult(
            success=True,
            source_system="generic",
            data=pd.DataFrame({"source": ["generic"]}),
            row_count=1,
        )


@pytest.fixture
def dispatcher() -> IngestionDispatcher:
    """Create a fresh dispatcher for each test."""
    return IngestionDispatcher()


@pytest.fixture
def dispatcher_with_parsers() -> IngestionDispatcher:
    """Create a dispatcher with mock parsers registered."""
    d = IngestionDispatcher()
    d.register(MockYardiParser)
    d.register(MockMRIParser)
    d.register(MockGenericParser)
    return d


class TestDispatcherRegistration:
    """Test parser registration functionality."""

    def test_register_parser(self, dispatcher: IngestionDispatcher):
        """AC1: Dispatcher registers available parsers."""
        dispatcher.register(MockYardiParser)

        assert "yardi" in dispatcher.list_parsers()
        assert dispatcher.has_parser("yardi")

    def test_register_multiple_parsers(self, dispatcher: IngestionDispatcher):
        """AC1: Can register multiple parsers."""
        dispatcher.register(MockYardiParser)
        dispatcher.register(MockMRIParser)
        dispatcher.register(MockGenericParser)

        assert len(dispatcher.list_parsers()) == 3
        assert "yardi" in dispatcher.list_parsers()
        assert "mri" in dispatcher.list_parsers()
        assert "generic" in dispatcher.list_parsers()

    def test_register_rejects_non_strategy(self, dispatcher: IngestionDispatcher):
        """Register rejects classes that aren't IngestionStrategy subclasses."""

        class NotAParser:
            pass

        with pytest.raises(TypeError) as exc_info:
            dispatcher.register(NotAParser)

        assert "subclass of IngestionStrategy" in str(exc_info.value)

    def test_unregister_parser(self, dispatcher_with_parsers: IngestionDispatcher):
        """Can unregister a parser."""
        assert dispatcher_with_parsers.has_parser("yardi")

        result = dispatcher_with_parsers.unregister("yardi")

        assert result is True
        assert not dispatcher_with_parsers.has_parser("yardi")

    def test_unregister_nonexistent_returns_false(
        self, dispatcher: IngestionDispatcher
    ):
        """Unregister returns False for unknown parser."""
        result = dispatcher.unregister("nonexistent")

        assert result is False

    def test_clear_removes_all(self, dispatcher_with_parsers: IngestionDispatcher):
        """Clear removes all registered parsers."""
        assert len(dispatcher_with_parsers.list_parsers()) == 3

        dispatcher_with_parsers.clear()

        assert len(dispatcher_with_parsers.list_parsers()) == 0


class TestDispatcherSelection:
    """Test parser selection via fingerprinting."""

    def test_selects_yardi_parser(self, dispatcher_with_parsers: IngestionDispatcher):
        """AC2, AC3: Uses fingerprinting to select Yardi parser."""
        yardi_content = b"Yardi Voyager GL Detail Report"
        file = BytesIO(yardi_content)

        parser, result = dispatcher_with_parsers.get_parser(file, "export.csv")

        assert isinstance(parser, MockYardiParser)
        assert result.source_system == "yardi"

    def test_selects_mri_parser(self, dispatcher_with_parsers: IngestionDispatcher):
        """AC2, AC3: Uses fingerprinting to select MRI parser."""
        mri_content = b"MRI Software PERIOD REF NUM"
        file = BytesIO(mri_content)

        parser, result = dispatcher_with_parsers.get_parser(file, "export.csv")

        assert isinstance(parser, MockMRIParser)
        assert result.source_system == "mri"

    def test_falls_back_to_generic(self, dispatcher_with_parsers: IngestionDispatcher):
        """AC2: Falls back to generic parser for unknown content."""
        unknown_content = b"Random spreadsheet data with no patterns"
        file = BytesIO(unknown_content)

        parser, result = dispatcher_with_parsers.get_parser(file, "data.csv")

        assert isinstance(parser, MockGenericParser)
        assert result.source_system == "generic"

    def test_raises_when_no_parser_available(self, dispatcher: IngestionDispatcher):
        """Raises ValueError when no parser is available."""
        file = BytesIO(b"some content")

        with pytest.raises(ValueError) as exc_info:
            dispatcher.get_parser(file, "test.csv")

        assert "No parser available" in str(exc_info.value)


class TestDispatcherOverride:
    """Test explicit source override functionality."""

    def test_override_selects_specified_parser(
        self, dispatcher_with_parsers: IngestionDispatcher
    ):
        """AC5: Can override detection with explicit source."""
        # Content looks like MRI but we override to Yardi
        mri_content = b"MRI Software data"
        file = BytesIO(mri_content)

        parser, result = dispatcher_with_parsers.get_parser(
            file, "export.csv", source_override="yardi"
        )

        assert isinstance(parser, MockYardiParser)
        assert result.source_system == "yardi"
        assert result.confidence == 1.0
        assert "Manual override" in result.indicators

    def test_override_with_unknown_source_raises(
        self, dispatcher_with_parsers: IngestionDispatcher
    ):
        """Override with unregistered source raises ValueError."""
        file = BytesIO(b"content")

        with pytest.raises(ValueError) as exc_info:
            dispatcher_with_parsers.get_parser(
                file, "test.csv", source_override="unknown"
            )

        assert "not registered" in str(exc_info.value)


class TestDispatcherLogging:
    """Test logging functionality."""

    def test_logs_parser_registration(
        self, dispatcher: IngestionDispatcher, caplog: pytest.LogCaptureFixture
    ):
        """AC4: Logs parser registration."""
        with caplog.at_level(logging.INFO):
            dispatcher.register(MockYardiParser)

        assert "Registered parser: yardi" in caplog.text

    def test_logs_fingerprint_selection(
        self,
        dispatcher_with_parsers: IngestionDispatcher,
        caplog: pytest.LogCaptureFixture,
    ):
        """AC4: Logs confidence and selection."""
        file = BytesIO(b"Yardi Voyager content")

        with caplog.at_level(logging.INFO):
            dispatcher_with_parsers.get_parser(file, "test.csv")

        assert "Fingerprinted as" in caplog.text
        assert "confidence:" in caplog.text

    def test_logs_override_selection(
        self,
        dispatcher_with_parsers: IngestionDispatcher,
        caplog: pytest.LogCaptureFixture,
    ):
        """AC4: Logs when override is used."""
        file = BytesIO(b"content")

        with caplog.at_level(logging.INFO):
            dispatcher_with_parsers.get_parser(
                file, "test.csv", source_override="yardi"
            )

        assert "Using override source: yardi" in caplog.text


class TestGlobalDispatcher:
    """Test global dispatcher singleton."""

    def test_get_dispatcher_returns_instance(self):
        """get_dispatcher returns an IngestionDispatcher."""
        reset_dispatcher()  # Ensure fresh state

        dispatcher = get_dispatcher()

        assert isinstance(dispatcher, IngestionDispatcher)

    def test_get_dispatcher_returns_same_instance(self):
        """get_dispatcher returns singleton."""
        reset_dispatcher()

        d1 = get_dispatcher()
        d2 = get_dispatcher()

        assert d1 is d2

    def test_reset_dispatcher_clears_singleton(self):
        """reset_dispatcher allows fresh instance."""
        d1 = get_dispatcher()
        reset_dispatcher()
        d2 = get_dispatcher()

        assert d1 is not d2


class TestParserExecution:
    """Test that selected parsers can actually parse."""

    def test_selected_parser_can_parse(
        self, dispatcher_with_parsers: IngestionDispatcher
    ):
        """Selected parser can execute parse method."""
        file = BytesIO(b"Yardi Voyager content")

        parser, _ = dispatcher_with_parsers.get_parser(file, "test.csv")
        file.seek(0)  # Reset for parsing
        result = parser.parse(file, "test.csv", "property-123")

        assert result.success is True
        assert result.source_system == "yardi"
        assert result.row_count == 1
