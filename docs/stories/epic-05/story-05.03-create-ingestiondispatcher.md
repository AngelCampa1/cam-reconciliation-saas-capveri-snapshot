# Story 5.3: Create IngestionDispatcher

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Completed
**Estimated Time**: 2 hours

---

## User Story

**As an** API endpoint
**I want** a dispatcher that routes files to the correct parser
**So that** parsing is automatic without user intervention

---

## Acceptance Criteria

- [x] **AC1**: Dispatcher registers available parsers
- [x] **AC2**: Uses fingerprinting to select best parser
- [x] **AC3**: Returns appropriate parser instance
- [x] **AC4**: Logs confidence and selection
- [x] **AC5**: Can override detection with explicit source

---

## Technical Specifications

### Files to Create

```
backend/app/services/ingestion/
└── dispatcher.py
```

### Implementation Details

**dispatcher.py**:
```python
"""
Ingestion Dispatcher

Routes files to appropriate parsers based on fingerprinting.
"""
import logging
from typing import BinaryIO, Optional, Type

from app.services.ingestion.base import IngestionStrategy
from app.services.ingestion.fingerprint import fingerprint_file, FingerprintResult

logger = logging.getLogger(__name__)


class IngestionDispatcher:
    """
    Dispatcher for routing files to appropriate parsers.

    Uses the Strategy Pattern to select and execute parsers
    based on file fingerprinting.
    """

    def __init__(self):
        self._parsers: dict[str, Type[IngestionStrategy]] = {}

    def register(self, parser_class: Type[IngestionStrategy]) -> None:
        """
        Register a parser class.

        Args:
            parser_class: A subclass of IngestionStrategy
        """
        # Instantiate to get source_system name
        instance = parser_class()
        self._parsers[instance.source_system] = parser_class
        logger.info(f"Registered parser: {instance.source_system}")

    def get_parser(
        self,
        file: BinaryIO,
        file_name: str,
        source_override: Optional[str] = None,
    ) -> tuple[IngestionStrategy, FingerprintResult]:
        """
        Get the appropriate parser for a file.

        Args:
            file: File to parse
            file_name: Original filename
            source_override: Optional explicit source system

        Returns:
            (parser instance, fingerprint result)
        """
        if source_override and source_override in self._parsers:
            logger.info(f"Using override source: {source_override}")
            return (
                self._parsers[source_override](),
                FingerprintResult(source_override, 1.0, ['Manual override']),
            )

        # Auto-detect
        result = fingerprint_file(file, file_name)
        logger.info(
            f"Fingerprinted as {result.source_system} "
            f"(confidence: {result.confidence:.2f})"
        )

        if result.source_system in self._parsers:
            return self._parsers[result.source_system](), result

        # Use generic parser if available
        if 'generic' in self._parsers:
            logger.warning(
                f"No specific parser for {result.source_system}, using generic"
            )
            return self._parsers['generic'](), result

        raise ValueError(
            f"No parser available for source: {result.source_system}"
        )

    def list_parsers(self) -> list[str]:
        """Return list of registered parser source systems."""
        return list(self._parsers.keys())


# Global dispatcher instance
_dispatcher: Optional[IngestionDispatcher] = None


def get_dispatcher() -> IngestionDispatcher:
    """Get the global dispatcher, initializing if needed."""
    global _dispatcher
    if _dispatcher is None:
        _dispatcher = IngestionDispatcher()
        _register_default_parsers(_dispatcher)
    return _dispatcher


def _register_default_parsers(dispatcher: IngestionDispatcher) -> None:
    """Register all built-in parsers."""
    from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser
    from app.services.ingestion.parsers.mri import MRIRentRollParser
    from app.services.ingestion.parsers.generic import GenericMappingParser

    dispatcher.register(YardiVoyagerGLParser)
    dispatcher.register(MRIRentRollParser)
    dispatcher.register(GenericMappingParser)
```

---

## Definition of Done

- [x] Dispatcher routes correctly
- [x] Override works
- [x] Logs selection
- [x] Generic fallback works

---

## Notes

The dispatcher implements the Strategy Pattern's context class. It maintains a registry of available parsers and selects the appropriate one based on fingerprinting results. The global singleton pattern (`get_dispatcher()`) ensures consistent parser registration across the application.
