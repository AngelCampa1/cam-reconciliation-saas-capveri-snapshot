"""
OCR result persistence service.

Provides functions for saving parsed OCR results to the database,
organizing content by page for efficient retrieval and full-text search.
"""

import logging
from datetime import datetime
from itertools import groupby
from typing import Any
from uuid import UUID

from app.models.ocr_result import (
    DocumentOCRSummary,
    OCRResult,
    OCRResultCreate,
    OCRResultSummary,
)
from app.services.extraction.result_parser import (
    KeyValuePair,
    ParsedDocument,
    TextBlock,
)
from app.services.extraction.table_handler import ExtractedTable

logger = logging.getLogger(__name__)


def text_block_to_dict(block: TextBlock) -> dict[str, Any]:
    """Convert a TextBlock to a serializable dictionary.

    Args:
        block: The TextBlock to convert.

    Returns:
        Dictionary suitable for JSONB storage.
    """
    return {
        "text": block.text,
        "block_type": block.block_type.value,
        "confidence": float(block.confidence),
        "left": float(block.bounding_box.left),
        "top": float(block.bounding_box.top),
        "width": float(block.bounding_box.width),
        "height": float(block.bounding_box.height),
    }


def key_value_to_dict(kv: KeyValuePair) -> dict[str, Any]:
    """Convert a KeyValuePair to a serializable dictionary.

    Args:
        kv: The KeyValuePair to convert.

    Returns:
        Dictionary suitable for JSONB storage.
    """
    return {
        "key": kv.key,
        "value": kv.value or "",
        "confidence": float(kv.key_confidence),
    }


def table_to_dict(table: ExtractedTable) -> dict[str, Any]:
    """Convert an ExtractedTable to a serializable dictionary.

    Args:
        table: The ExtractedTable to convert.

    Returns:
        Dictionary suitable for JSONB storage.
    """
    return {
        "headers": table.headers,
        "rows": table.data,
        "row_count": len(table.data),
        "column_count": len(table.headers),
    }


def group_by_page(
    text_blocks: list[TextBlock],
    key_values: list[KeyValuePair],
    tables: list[ExtractedTable],
) -> dict[int, dict[str, Any]]:
    """Group extraction results by page number.

    Args:
        text_blocks: List of text blocks from all pages.
        key_values: List of key-value pairs from all pages.
        tables: List of tables from all pages.

    Returns:
        Dictionary mapping page numbers to page content.
    """
    pages: dict[int, dict[str, Any]] = {}

    # Group text blocks by page
    sorted_blocks = sorted(text_blocks, key=lambda b: b.page)
    for page_num, blocks in groupby(sorted_blocks, key=lambda b: b.page):
        if page_num not in pages:
            pages[page_num] = {
                "text_blocks": [],
                "key_values": [],
                "tables": [],
                "full_text": "",
            }
        block_list = list(blocks)
        pages[page_num]["text_blocks"] = [text_block_to_dict(b) for b in block_list]
        pages[page_num]["full_text"] = " ".join(b.text for b in block_list)

    # Group key-values by page
    sorted_kvs = sorted(key_values, key=lambda kv: kv.page)
    for page_num, kvs in groupby(sorted_kvs, key=lambda kv: kv.page):
        if page_num not in pages:
            pages[page_num] = {
                "text_blocks": [],
                "key_values": [],
                "tables": [],
                "full_text": "",
            }
        pages[page_num]["key_values"] = [key_value_to_dict(kv) for kv in kvs]

    # Group tables by page
    for table in tables:
        page_num = table.page_number
        if page_num not in pages:
            pages[page_num] = {
                "text_blocks": [],
                "key_values": [],
                "tables": [],
                "full_text": "",
            }
        pages[page_num]["tables"].append(table_to_dict(table))

    return pages


def prepare_ocr_results(
    document_id: UUID,
    organization_id: UUID,
    parsed_doc: ParsedDocument,
    job_id: str,
    tables: list[ExtractedTable] | None = None,
    extracted_at: datetime | None = None,
) -> list[OCRResultCreate]:
    """Prepare OCR results for database insertion.

    Creates OCRResultCreate objects for each page, grouping
    all content by page number.

    Args:
        document_id: ID of the source document.
        organization_id: ID of the owning organization.
        parsed_doc: Parsed document with lines and key-values.
        job_id: Document reader job identifier.
        tables: Extracted tables from the document. Defaults to parsed_doc.tables.
        extracted_at: When extraction was performed (defaults to now).

    Returns:
        List of OCRResultCreate objects ready for insertion.
    """
    if extracted_at is None:
        extracted_at = datetime.utcnow()

    # Group all content by page - use lines from parsed_doc
    pages = group_by_page(
        text_blocks=parsed_doc.lines,
        key_values=parsed_doc.key_value_pairs,
        tables=parsed_doc.tables if tables is None else tables,
    )

    # Create result objects for each page
    results: list[OCRResultCreate] = []
    for page_num in sorted(pages.keys()):
        page_content = pages[page_num]
        result = OCRResultCreate(
            document_id=document_id,
            organization_id=organization_id,
            page_number=page_num,
            text_blocks=page_content["text_blocks"],
            tables=page_content["tables"],
            key_value_pairs=page_content["key_values"],
            full_text=page_content["full_text"],
            reader_job_id=job_id,
            extracted_at=extracted_at,
        )
        results.append(result)

    logger.info(
        "Prepared %d page results for document %s",
        len(results),
        document_id,
    )
    return results


def create_document_summary(
    document_id: UUID,
    results: list[OCRResult],
) -> DocumentOCRSummary:
    """Create a summary of all OCR results for a document.

    Args:
        document_id: ID of the document.
        results: List of OCR results for the document.

    Returns:
        DocumentOCRSummary with aggregated statistics.
    """
    page_summaries: list[OCRResultSummary] = []
    total_text_blocks = 0
    total_tables = 0
    total_key_values = 0

    for result in results:
        text_count = len(result.text_blocks)
        table_count = len(result.tables)
        kv_count = len(result.key_value_pairs)

        total_text_blocks += text_count
        total_tables += table_count
        total_key_values += kv_count

        page_summaries.append(
            OCRResultSummary(
                id=result.id,
                document_id=result.document_id,
                page_number=result.page_number,
                text_block_count=text_count,
                table_count=table_count,
                key_value_count=kv_count,
                extracted_at=result.extracted_at,
            )
        )

    return DocumentOCRSummary(
        document_id=document_id,
        total_pages=len(results),
        total_text_blocks=total_text_blocks,
        total_tables=total_tables,
        total_key_values=total_key_values,
        pages=page_summaries,
    )


class OCRResultRepository:
    """Repository for OCR result database operations.

    Provides methods for saving and retrieving OCR results
    using the Supabase client.
    """

    def __init__(self, client: Any):
        """Initialize with Supabase client.

        Args:
            client: Supabase client instance.
        """
        self._client = client
        self._table = "ocr_results"

    async def save_results(
        self,
        results: list[OCRResultCreate],
    ) -> list[OCRResult]:
        """Save OCR results to the database.

        Inserts multiple page results in a single batch operation.

        Args:
            results: List of OCRResultCreate objects to insert.

        Returns:
            List of created OCRResult objects with IDs.

        Raises:
            Exception: If database operation fails.
        """
        if not results:
            return []

        # Convert to dicts for insertion
        data = []
        for result in results:
            row = {
                "document_id": str(result.document_id),
                "organization_id": str(result.organization_id),
                "page_number": result.page_number,
                "text_blocks": result.text_blocks,
                "tables": result.tables,
                "key_value_pairs": result.key_value_pairs,
                "full_text": result.full_text,
                "reader_job_id": result.reader_job_id,
                "extracted_at": (
                    result.extracted_at.isoformat()
                    if result.extracted_at
                    else datetime.utcnow().isoformat()
                ),
            }
            data.append(row)

        # Insert batch
        response = self._client.table(self._table).insert(data).execute()

        logger.info(
            "Saved %d OCR results for document %s",
            len(response.data),
            results[0].document_id if results else "unknown",
        )

        # Convert response to OCRResult models
        return [self._to_model(row) for row in response.data]

    async def get_by_document(
        self,
        document_id: UUID,
    ) -> list[OCRResult]:
        """Get all OCR results for a document.

        Args:
            document_id: ID of the document.

        Returns:
            List of OCRResult objects ordered by page number.
        """
        response = (
            self._client.table(self._table)
            .select("*")
            .eq("document_id", str(document_id))
            .order("page_number")
            .execute()
        )

        return [self._to_model(row) for row in response.data]

    async def get_by_page(
        self,
        document_id: UUID,
        page_number: int,
    ) -> OCRResult | None:
        """Get OCR result for a specific page.

        Args:
            document_id: ID of the document.
            page_number: Page number to retrieve.

        Returns:
            OCRResult if found, None otherwise.
        """
        response = (
            self._client.table(self._table)
            .select("*")
            .eq("document_id", str(document_id))
            .eq("page_number", page_number)
            .limit(1)
            .execute()
        )

        if response.data:
            return self._to_model(response.data[0])
        return None

    async def search_full_text(
        self,
        organization_id: UUID,
        query: str,
        limit: int = 20,
    ) -> list[OCRResult]:
        """Search OCR results by full text.

        Uses PostgreSQL full-text search on the full_text column.

        Args:
            organization_id: ID of the organization to search within.
            query: Search query string.
            limit: Maximum results to return.

        Returns:
            List of matching OCRResult objects.
        """
        # Use textSearch for full-text search
        response = (
            self._client.table(self._table)
            .select("*")
            .eq("organization_id", str(organization_id))
            .text_search("full_text", query)
            .limit(limit)
            .execute()
        )

        return [self._to_model(row) for row in response.data]

    async def delete_by_document(
        self,
        document_id: UUID,
    ) -> int:
        """Delete all OCR results for a document.

        Args:
            document_id: ID of the document.

        Returns:
            Number of records deleted.
        """
        response = (
            self._client.table(self._table)
            .delete()
            .eq("document_id", str(document_id))
            .execute()
        )

        count = len(response.data) if response.data else 0
        logger.info("Deleted %d OCR results for document %s", count, document_id)
        return count

    def _to_model(self, row: dict[str, Any]) -> OCRResult:
        """Convert database row to OCRResult model.

        Args:
            row: Database row dictionary.

        Returns:
            OCRResult model instance.
        """
        return OCRResult(
            id=UUID(row["id"]),
            document_id=UUID(row["document_id"]),
            organization_id=UUID(row["organization_id"]),
            page_number=row["page_number"],
            text_blocks=row.get("text_blocks", []),
            tables=row.get("tables", []),
            key_value_pairs=row.get("key_value_pairs", []),
            full_text=row.get("full_text", ""),
            reader_job_id=row["reader_job_id"],
            extracted_at=datetime.fromisoformat(
                row["extracted_at"].replace("Z", "+00:00")
            ),
            created_at=datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00")),
        )
