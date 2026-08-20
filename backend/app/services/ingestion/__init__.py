"""Data Ingestion Engine.

This module provides the Strategy Pattern implementation for parsing
ERP data exports from various systems (Yardi, MRI, etc.).

Main components:
- IngestionStrategy: Abstract base class for all parsers
- IngestionDispatcher: Routes files to appropriate parsers
- ParseResult: Result container with DataFrame and metadata
- GLEntryRow: Schema for individual GL entry rows
- IngestionMetadata: Metadata about parsed files
- fingerprint_file: Auto-detect source system from file content
- FingerprintResult: Result of file fingerprinting
- Cleaners: Vectorized data cleaning functions
"""

from app.services.ingestion.base import IngestionStrategy
from app.services.ingestion.cleaners import (
    clean_account_code,
    clean_currency_column,
    clean_date_column,
    detect_header_row,
    extract_period_from_date,
    filter_by_required_columns,
    filter_garbage_rows,
    forward_fill_context,
    handle_merged_cells_pattern,
    split_amount_columns,
)
from app.services.ingestion.dispatcher import (
    IngestionDispatcher,
    get_dispatcher,
    reset_dispatcher,
)
from app.services.ingestion.fingerprint import (
    FingerprintResult,
    detect_delimiter,
    detect_encoding,
    fingerprint_file,
)
from app.services.ingestion.schemas import GLEntryRow, IngestionMetadata, ParseResult

__all__ = [
    "IngestionStrategy",
    "IngestionDispatcher",
    "get_dispatcher",
    "reset_dispatcher",
    "ParseResult",
    "GLEntryRow",
    "IngestionMetadata",
    "FingerprintResult",
    "fingerprint_file",
    "detect_encoding",
    "detect_delimiter",
    # Cleaners
    "clean_currency_column",
    "clean_date_column",
    "extract_period_from_date",
    "clean_account_code",
    "forward_fill_context",
    "handle_merged_cells_pattern",
    "detect_header_row",
    "split_amount_columns",
    "filter_garbage_rows",
    "filter_by_required_columns",
]
