"""
Extraction services for PDF processing and lease data extraction.

This module provides:
- DualExtractOrchestrator: Parallel dual-extract + judge pipeline
- OpenRouterClient: OpenRouter API client for native-PDF extraction
- StorageClient: Cloudflare R2-backed object storage wrapper
- OCRResultParser: Parser for OCR response blocks
- TableExtractor: Extractor for structured table data from OCR table blocks
- Extraction Models: Pydantic schemas for LLM extraction responses
- Confidence Scoring: Weighted confidence scoring for human review flagging
"""

from app.services.extraction.confidence import (
    DEFAULT_THRESHOLD,
    FIELD_WEIGHTS,
    ConfidenceResult,
    calculate_confidence,
    get_low_confidence_extractions,
)
from app.services.extraction.dual import DualExtractOrchestrator
from app.services.extraction.extraction_models import (
    FieldExtraction,
    LeaseExtractionResult,
)
from app.services.extraction.job_queue import (
    ExtractionJob,
    ExtractionJobCreate,
    ExtractionJobSummary,
    ExtractionJobUpdate,
    create_extraction_job,
    get_extraction_job,
    process_extraction_task,
    retry_extraction_job,
    update_extraction_job,
)
from app.services.extraction.openrouter_client import (
    OpenRouterClient,
    get_openrouter_client,
)
from app.services.extraction.persistence import (
    OCRResultRepository,
    create_document_summary,
    group_by_page,
    key_value_to_dict,
    prepare_ocr_results,
    table_to_dict,
    text_block_to_dict,
)
from app.services.extraction.processor import (
    ExtractionProcessorError,
    run_document_extraction,
)
from app.services.extraction.prompts import (
    LEASE_EXTRACTION_PROMPT,
    build_extraction_prompt,
)
from app.services.extraction.result_parser import (
    BlockType,
    BoundingBox,
    KeyValuePair,
    KeyValueType,
    OCRResultParser,
    PageInfo,
    ParsedDocument,
    TextBlock,
    create_parser,
)
from app.services.extraction.s3_client import (
    S3Client,
    S3Error,
    StorageClient,
    StorageError,
    get_s3_client,
    get_storage_client,
)
from app.services.extraction.table_handler import (
    ExtractedTable,
    TableCell,
    TableExtractor,
    create_table_extractor,
)
from app.services.extraction.validation import (
    LeaseExtractionValidator,
    ValidationError,
    ValidationResult,
    ValidationWarning,
    validate_extraction,
)

__all__ = [
    # Dual-extract pipeline
    "DualExtractOrchestrator",
    # OpenRouter Client
    "OpenRouterClient",
    "get_openrouter_client",
    # Confidence Scoring
    "ConfidenceResult",
    "DEFAULT_THRESHOLD",
    "FIELD_WEIGHTS",
    "calculate_confidence",
    "get_low_confidence_extractions",
    # Extraction Models
    "FieldExtraction",
    "LeaseExtractionResult",
    # Extraction Prompts
    "LEASE_EXTRACTION_PROMPT",
    "build_extraction_prompt",
    # Result Parser
    "BlockType",
    "BoundingBox",
    "KeyValuePair",
    "KeyValueType",
    "OCRResultParser",
    "PageInfo",
    "ParsedDocument",
    "TextBlock",
    "create_parser",
    # Storage Client
    "StorageClient",
    "StorageError",
    "get_storage_client",
    "S3Client",
    "S3Error",
    "get_s3_client",
    # Table Handler
    "ExtractedTable",
    "TableCell",
    "TableExtractor",
    "create_table_extractor",
    # Validation
    "LeaseExtractionValidator",
    "ValidationError",
    "ValidationResult",
    "ValidationWarning",
    "validate_extraction",
    # Persistence
    "OCRResultRepository",
    "create_document_summary",
    "group_by_page",
    "key_value_to_dict",
    "prepare_ocr_results",
    "table_to_dict",
    "text_block_to_dict",
    # Processor
    "ExtractionProcessorError",
    "run_document_extraction",
    # Job Queue
    "ExtractionJob",
    "ExtractionJobCreate",
    "ExtractionJobSummary",
    "ExtractionJobUpdate",
    "create_extraction_job",
    "get_extraction_job",
    "process_extraction_task",
    "retry_extraction_job",
    "update_extraction_job",
]
