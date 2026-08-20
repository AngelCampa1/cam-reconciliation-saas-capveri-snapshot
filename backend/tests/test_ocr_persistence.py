"""
Tests for OCR result persistence service.

Tests the functions for saving and retrieving OCR results.
"""

from datetime import datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models.ocr_result import OCRResult, OCRResultCreate
from app.services.extraction.persistence import (
    OCRResultRepository,
    create_document_summary,
    group_by_page,
    key_value_to_dict,
    prepare_ocr_results,
    table_to_dict,
    text_block_to_dict,
)
from app.services.extraction.result_parser import (
    BlockType,
    BoundingBox,
    KeyValuePair,
    PageInfo,
    ParsedDocument,
    TextBlock,
)
from app.services.extraction.table_handler import ExtractedTable


class TestTextBlockToDict:
    """Tests for text_block_to_dict function."""

    def test_converts_text_block(self):
        """Converts TextBlock to dictionary."""
        block = TextBlock(
            id="block-1",
            text="Sample text",
            page=1,
            confidence=Decimal("95.5"),
            block_type=BlockType.LINE,
            bounding_box=BoundingBox(
                left=Decimal("0.1"),
                top=Decimal("0.2"),
                width=Decimal("0.5"),
                height=Decimal("0.05"),
            ),
        )

        result = text_block_to_dict(block)

        assert result["text"] == "Sample text"
        assert result["block_type"] == "LINE"
        assert result["confidence"] == 95.5
        assert result["left"] == 0.1
        assert result["top"] == 0.2
        assert result["width"] == 0.5
        assert result["height"] == 0.05


class TestKeyValueToDict:
    """Tests for key_value_to_dict function."""

    def test_converts_key_value(self):
        """Converts KeyValuePair to dictionary."""
        kv = KeyValuePair(
            key="Name",
            value="John Doe",
            key_confidence=Decimal("98.0"),
            value_confidence=Decimal("95.0"),
            page=1,
            key_bounding_box=BoundingBox(
                left=Decimal("0.1"),
                top=Decimal("0.1"),
                width=Decimal("0.1"),
                height=Decimal("0.02"),
            ),
            value_bounding_box=BoundingBox(
                left=Decimal("0.3"),
                top=Decimal("0.1"),
                width=Decimal("0.2"),
                height=Decimal("0.02"),
            ),
        )

        result = key_value_to_dict(kv)

        assert result["key"] == "Name"
        assert result["value"] == "John Doe"
        assert result["confidence"] == 98.0


class TestTableToDict:
    """Tests for table_to_dict function."""

    def test_converts_table(self):
        """Converts ExtractedTable to dictionary."""
        table = ExtractedTable(
            page_number=1,
            headers=["Name", "Value"],
            rows=[["A", "1"], ["B", "2"]],
            data=[{"Name": "A", "Value": "1"}, {"Name": "B", "Value": "2"}],
            cell_details=[],
        )

        result = table_to_dict(table)

        assert result["headers"] == ["Name", "Value"]
        assert len(result["rows"]) == 2
        assert result["row_count"] == 2
        assert result["column_count"] == 2


class TestGroupByPage:
    """Tests for group_by_page function."""

    def test_groups_content_by_page(self):
        """Groups text blocks, key-values, and tables by page."""
        bbox = BoundingBox(
            left=Decimal("0"),
            top=Decimal("0"),
            width=Decimal("0.1"),
            height=Decimal("0.01"),
        )

        blocks = [
            TextBlock(
                id="b1",
                text="Page 1 text",
                page=1,
                confidence=Decimal("90"),
                block_type=BlockType.LINE,
                bounding_box=bbox,
            ),
            TextBlock(
                id="b2",
                text="Page 2 text",
                page=2,
                confidence=Decimal("90"),
                block_type=BlockType.LINE,
                bounding_box=bbox,
            ),
        ]

        kvs = [
            KeyValuePair(
                key="Key1",
                value="Val1",
                page=1,
                key_confidence=Decimal("90"),
                key_bounding_box=bbox,
                value_bounding_box=bbox,
            ),
        ]

        tables = [
            ExtractedTable(
                page_number=2, headers=["A"], rows=[[]], data=[], cell_details=[]
            ),
        ]

        result = group_by_page(blocks, kvs, tables)

        assert 1 in result
        assert 2 in result
        assert len(result[1]["text_blocks"]) == 1
        assert len(result[1]["key_values"]) == 1
        assert len(result[2]["tables"]) == 1
        assert "Page 1 text" in result[1]["full_text"]

    def test_empty_inputs(self):
        """Handles empty inputs."""
        result = group_by_page([], [], [])
        assert result == {}


class TestPrepareOCRResults:
    """Tests for prepare_ocr_results function."""

    def test_prepares_multi_page_results(self):
        """Prepares OCRResultCreate for multiple pages."""
        doc_id = uuid4()
        org_id = uuid4()
        bbox = BoundingBox(
            left=Decimal("0"),
            top=Decimal("0"),
            width=Decimal("0.1"),
            height=Decimal("0.01"),
        )

        parsed_doc = ParsedDocument(
            lines=[
                TextBlock(
                    id="l1",
                    text="Page 1",
                    page=1,
                    confidence=Decimal("90"),
                    block_type=BlockType.LINE,
                    bounding_box=bbox,
                ),
                TextBlock(
                    id="l2",
                    text="Page 2",
                    page=2,
                    confidence=Decimal("90"),
                    block_type=BlockType.LINE,
                    bounding_box=bbox,
                ),
            ],
            words=[],
            key_value_pairs=[],
            pages=[
                PageInfo(page_number=1),
                PageInfo(page_number=2),
            ],
        )

        tables = [
            ExtractedTable(
                page_number=1,
                headers=["H"],
                rows=[["1"]],
                data=[{"H": "1"}],
                cell_details=[],
            ),
        ]

        results = prepare_ocr_results(
            document_id=doc_id,
            organization_id=org_id,
            parsed_doc=parsed_doc,
            tables=tables,
            job_id="job-123",
        )

        assert len(results) == 2
        assert results[0].page_number == 1
        assert results[1].page_number == 2
        assert results[0].document_id == doc_id
        assert results[0].reader_job_id == "job-123"
        assert len(results[0].tables) == 1

    def test_empty_document(self):
        """Handles empty parsed document."""
        parsed_doc = ParsedDocument(lines=[], words=[], key_value_pairs=[], pages=[])

        results = prepare_ocr_results(
            document_id=uuid4(),
            organization_id=uuid4(),
            parsed_doc=parsed_doc,
            tables=[],
            job_id="job-empty",
        )

        assert results == []

    def test_defaults_to_parsed_document_tables(self):
        """Prepared OCR results persist tables attached to the parsed document."""
        doc_id = uuid4()
        org_id = uuid4()
        parsed_doc = ParsedDocument(
            tables=[
                ExtractedTable(
                    page_number=1,
                    headers=["Expense", "Amount"],
                    rows=[["Expense", "Amount"], ["Repairs", "$1,200"]],
                    data=[{"Expense": "Repairs", "Amount": "$1,200"}],
                    cell_details=[],
                )
            ]
        )

        results = prepare_ocr_results(
            document_id=doc_id,
            organization_id=org_id,
            parsed_doc=parsed_doc,
            job_id="job-with-tables",
        )

        assert len(results) == 1
        assert results[0].page_number == 1
        assert results[0].tables == [
            {
                "headers": ["Expense", "Amount"],
                "rows": [{"Expense": "Repairs", "Amount": "$1,200"}],
                "row_count": 1,
                "column_count": 2,
            }
        ]

    def test_explicit_tables_override_parsed_document_tables(self):
        """Explicit table arguments preserve compatibility with older callers."""
        parsed_doc = ParsedDocument(
            tables=[
                ExtractedTable(
                    page_number=1,
                    headers=["Ignored"],
                    rows=[["Ignored"], ["A"]],
                    data=[{"Ignored": "A"}],
                    cell_details=[],
                )
            ]
        )
        explicit_tables = [
            ExtractedTable(
                page_number=2,
                headers=["Used"],
                rows=[["Used"], ["B"]],
                data=[{"Used": "B"}],
                cell_details=[],
            )
        ]

        results = prepare_ocr_results(
            document_id=uuid4(),
            organization_id=uuid4(),
            parsed_doc=parsed_doc,
            job_id="job-explicit-tables",
            tables=explicit_tables,
        )

        assert len(results) == 1
        assert results[0].page_number == 2
        assert results[0].tables[0]["headers"] == ["Used"]

    def test_explicit_empty_tables_override_parsed_document_tables(self):
        """Explicit empty table lists suppress parser-attached tables."""
        parsed_doc = ParsedDocument(
            tables=[
                ExtractedTable(
                    page_number=1,
                    headers=["Suppressed"],
                    rows=[["Suppressed"], ["A"]],
                    data=[{"Suppressed": "A"}],
                    cell_details=[],
                )
            ]
        )

        results = prepare_ocr_results(
            document_id=uuid4(),
            organization_id=uuid4(),
            parsed_doc=parsed_doc,
            job_id="job-no-tables",
            tables=[],
        )

        assert results == []


class TestCreateDocumentSummary:
    """Tests for create_document_summary function."""

    def test_creates_summary(self):
        """Creates summary from OCR results."""
        doc_id = uuid4()
        now = datetime.utcnow()

        results = [
            OCRResult(
                id=uuid4(),
                document_id=doc_id,
                organization_id=uuid4(),
                page_number=1,
                text_blocks=[{}, {}, {}],
                tables=[{}],
                key_value_pairs=[{}, {}],
                full_text="test",
                reader_job_id="job-1",
                extracted_at=now,
                created_at=now,
                updated_at=now,
            ),
            OCRResult(
                id=uuid4(),
                document_id=doc_id,
                organization_id=uuid4(),
                page_number=2,
                text_blocks=[{}],
                tables=[],
                key_value_pairs=[],
                full_text="test2",
                reader_job_id="job-1",
                extracted_at=now,
                created_at=now,
                updated_at=now,
            ),
        ]

        summary = create_document_summary(doc_id, results)

        assert summary.document_id == doc_id
        assert summary.total_pages == 2
        assert summary.total_text_blocks == 4
        assert summary.total_tables == 1
        assert summary.total_key_values == 2
        assert len(summary.pages) == 2


class TestOCRResultRepository:
    """Tests for OCRResultRepository class."""

    @pytest.fixture
    def mock_client(self):
        """Create mock Supabase client."""
        client = MagicMock()
        client.table = MagicMock(return_value=client)
        client.insert = MagicMock(return_value=client)
        client.select = MagicMock(return_value=client)
        client.eq = MagicMock(return_value=client)
        client.order = MagicMock(return_value=client)
        client.limit = MagicMock(return_value=client)
        client.delete = MagicMock(return_value=client)
        client.text_search = MagicMock(return_value=client)
        return client

    @pytest.fixture
    def repository(self, mock_client):
        """Create repository with mock client."""
        return OCRResultRepository(mock_client)

    @pytest.mark.asyncio
    async def test_save_results(self, repository, mock_client):
        """Saves OCR results to database."""
        doc_id = uuid4()
        org_id = uuid4()
        now = datetime.utcnow()

        results = [
            OCRResultCreate(
                document_id=doc_id,
                organization_id=org_id,
                page_number=1,
                text_blocks=[{"text": "Test"}],
                tables=[],
                key_value_pairs=[],
                full_text="Test",
                reader_job_id="job-123",
                extracted_at=now,
            ),
        ]

        # Mock response
        mock_client.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(uuid4()),
                    "document_id": str(doc_id),
                    "organization_id": str(org_id),
                    "page_number": 1,
                    "text_blocks": [{"text": "Test"}],
                    "tables": [],
                    "key_value_pairs": [],
                    "full_text": "Test",
                    "reader_job_id": "job-123",
                    "extracted_at": now.isoformat(),
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
            ]
        )

        saved = await repository.save_results(results)

        assert len(saved) == 1
        mock_client.table.assert_called_with("ocr_results")

    @pytest.mark.asyncio
    async def test_save_empty_results(self, repository):
        """Handles empty results list."""
        result = await repository.save_results([])
        assert result == []

    @pytest.mark.asyncio
    async def test_get_by_document(self, repository, mock_client):
        """Gets all results for a document."""
        doc_id = uuid4()
        now = datetime.utcnow()

        mock_client.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(uuid4()),
                    "document_id": str(doc_id),
                    "organization_id": str(uuid4()),
                    "page_number": 1,
                    "text_blocks": [],
                    "tables": [],
                    "key_value_pairs": [],
                    "full_text": "",
                    "reader_job_id": "job-456",
                    "extracted_at": now.isoformat(),
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
            ]
        )

        results = await repository.get_by_document(doc_id)

        assert len(results) == 1
        assert results[0].document_id == doc_id

    @pytest.mark.asyncio
    async def test_get_by_page(self, repository, mock_client):
        """Gets result for specific page."""
        doc_id = uuid4()
        now = datetime.utcnow()

        mock_client.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(uuid4()),
                    "document_id": str(doc_id),
                    "organization_id": str(uuid4()),
                    "page_number": 2,
                    "text_blocks": [],
                    "tables": [],
                    "key_value_pairs": [],
                    "full_text": "",
                    "reader_job_id": "job-789",
                    "extracted_at": now.isoformat(),
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
            ]
        )

        result = await repository.get_by_page(doc_id, 2)

        assert result is not None
        assert result.page_number == 2

    @pytest.mark.asyncio
    async def test_get_by_page_not_found(self, repository, mock_client):
        """Returns None when page not found."""
        mock_client.execute.return_value = MagicMock(data=[])

        result = await repository.get_by_page(uuid4(), 99)

        assert result is None

    @pytest.mark.asyncio
    async def test_delete_by_document(self, repository, mock_client):
        """Deletes results for a document."""
        doc_id = uuid4()
        mock_client.execute.return_value = MagicMock(data=[{}, {}])

        count = await repository.delete_by_document(doc_id)

        assert count == 2

    @pytest.mark.asyncio
    async def test_search_full_text(self, repository, mock_client):
        """Searches results by full text."""
        org_id = uuid4()
        now = datetime.utcnow()

        mock_client.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(uuid4()),
                    "document_id": str(uuid4()),
                    "organization_id": str(org_id),
                    "page_number": 1,
                    "text_blocks": [],
                    "tables": [],
                    "key_value_pairs": [],
                    "full_text": "lease agreement tenant",
                    "reader_job_id": "job-search",
                    "extracted_at": now.isoformat(),
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
            ]
        )

        results = await repository.search_full_text(org_id, "lease tenant")

        assert len(results) == 1
        mock_client.text_search.assert_called_with("full_text", "lease tenant")
