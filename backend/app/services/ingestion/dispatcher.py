"""Ingestion Dispatcher.

Routes files to appropriate parsers based on fingerprinting.
Implements the Strategy Pattern's context class for parser selection.
"""

import logging
from typing import BinaryIO

from app.services.ingestion.base import IngestionStrategy
from app.services.ingestion.fingerprint import FingerprintResult, fingerprint_file

logger = logging.getLogger(__name__)


class IngestionDispatcher:
    """Dispatcher for routing files to appropriate parsers.

    Uses the Strategy Pattern to select and execute parsers
    based on file fingerprinting. Maintains a registry of available
    parser classes keyed by source system name.

    Example:
        >>> dispatcher = IngestionDispatcher()
        >>> dispatcher.register(YardiVoyagerGLParser)
        >>> parser, result = dispatcher.get_parser(file, "export.csv")
        >>> parse_result = parser.parse(file, "export.csv", property_id)
    """

    def __init__(self) -> None:
        """Initialize an empty dispatcher."""
        self._parsers: dict[str, type[IngestionStrategy]] = {}

    def register(self, parser_class: type[IngestionStrategy]) -> None:
        """Register a parser class.

        The parser class is instantiated once to retrieve its source_system
        name, then stored for later instantiation when needed.

        Args:
            parser_class: A subclass of IngestionStrategy

        Raises:
            TypeError: If parser_class is not a subclass of IngestionStrategy
        """
        if not isinstance(parser_class, type) or not issubclass(
            parser_class, IngestionStrategy
        ):
            raise TypeError(
                f"Parser must be a subclass of IngestionStrategy, "
                f"got {type(parser_class)}"
            )

        # Instantiate to get source_system name
        instance = parser_class()
        source_system = instance.source_system
        self._parsers[source_system] = parser_class
        logger.info("Registered parser: %s", source_system)

    def unregister(self, source_system: str) -> bool:
        """Unregister a parser by source system name.

        Args:
            source_system: The source system identifier to remove

        Returns:
            True if parser was removed, False if not found
        """
        if source_system in self._parsers:
            del self._parsers[source_system]
            logger.info("Unregistered parser: %s", source_system)
            return True
        return False

    def get_parser(
        self,
        file: BinaryIO,
        file_name: str,
        source_override: str | None = None,
    ) -> tuple[IngestionStrategy, FingerprintResult]:
        """Get the appropriate parser for a file.

        Uses fingerprinting to auto-detect the source system, or accepts
        an explicit override. Falls back to generic parser if available.

        Args:
            file: File to parse (seekable, will be reset after fingerprinting)
            file_name: Original filename for fingerprinting hints
            source_override: Optional explicit source system to use

        Returns:
            Tuple of (parser instance, fingerprint result)

        Raises:
            ValueError: If no suitable parser is available
        """
        # Handle explicit override
        if source_override:
            if source_override in self._parsers:
                logger.info("Using override source: %s", source_override)
                return (
                    self._parsers[source_override](),
                    FingerprintResult(source_override, 1.0, ["Manual override"]),
                )
            raise ValueError(f"Override source '{source_override}' not registered")

        # Auto-detect via fingerprinting
        result = fingerprint_file(file, file_name)
        logger.info(
            "Fingerprinted as %s (confidence: %.2f, indicators: %s)",
            result.source_system,
            result.confidence,
            result.indicators,
        )

        # Try to get matching parser
        if result.source_system in self._parsers:
            return self._parsers[result.source_system](), result

        # Fall back to generic parser if available
        if "generic" in self._parsers:
            logger.warning(
                "No specific parser for %s, using generic", result.source_system
            )
            return self._parsers["generic"](), result

        # No suitable parser found
        raise ValueError(
            f"No parser available for source: {result.source_system}. "
            f"Registered parsers: {list(self._parsers.keys())}"
        )

    def list_parsers(self) -> list[str]:
        """Return list of registered parser source systems.

        Returns:
            List of source system identifiers
        """
        return list(self._parsers.keys())

    def has_parser(self, source_system: str) -> bool:
        """Check if a parser is registered for a source system.

        Args:
            source_system: The source system identifier to check

        Returns:
            True if parser is registered, False otherwise
        """
        return source_system in self._parsers

    def clear(self) -> None:
        """Remove all registered parsers."""
        self._parsers.clear()
        logger.info("Cleared all registered parsers")


# Global dispatcher instance (lazy initialization)
_dispatcher: IngestionDispatcher | None = None


def get_dispatcher() -> IngestionDispatcher:
    """Get the global dispatcher, initializing if needed.

    Creates a singleton dispatcher instance and registers all
    available built-in parsers.

    Returns:
        The global IngestionDispatcher instance
    """
    global _dispatcher
    if _dispatcher is None:
        _dispatcher = IngestionDispatcher()
        _register_default_parsers(_dispatcher)
    return _dispatcher


def reset_dispatcher() -> None:
    """Reset the global dispatcher (primarily for testing).

    This clears the singleton so get_dispatcher() will create a fresh instance.
    """
    global _dispatcher
    _dispatcher = None


def _register_default_parsers(dispatcher: IngestionDispatcher) -> None:
    """Register all built-in parsers that are available.

    Gracefully handles missing parser modules (they may not be implemented yet).

    Args:
        dispatcher: The dispatcher to register parsers with
    """
    # Try to register each parser, but don't fail if not available
    parsers_to_register = [
        ("app.services.ingestion.parsers.yardi", "YardiVoyagerGLParser"),
        ("app.services.ingestion.parsers.mri", "MRIRentRollParser"),
        ("app.services.ingestion.parsers.generic", "GenericMappingParser"),
    ]

    for module_path, class_name in parsers_to_register:
        try:
            import importlib

            module = importlib.import_module(module_path)
            parser_class = getattr(module, class_name)
            dispatcher.register(parser_class)
        except (ImportError, AttributeError) as e:
            logger.debug("Parser %s not available: %s", class_name, e)
