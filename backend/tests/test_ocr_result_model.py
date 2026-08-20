"""
Tests for OCR Result domain models.

Tests the Pydantic models for OCR result persistence.
"""

from datetime import datetime
from uuid import uuid4

import pytest

from app.models.ocr_result import (
    DocumentOCRSummary,
    KeyValueData,
    OCRResult,
    OCRResultCreate,
    OCRResultResponse,
    OCRResultSummary,
    TableData,
    TextBlockData,
)


class TestTextBlockData:
    """Tests for TextBlockData model."""

    def test_valid_text_block(self):
        """TextBlockData accepts valid values."""
        block = TextBlockData(
            text="Sample text",
            block_type="LINE",
            confidence=95.5,
            left=0.1,
            top=0.2,
            width=0.5,
            height=0.05,
        )

        assert block.text == "Sample text"
        assert block.block_type == "LINE"
        assert block.confidence == 95.5
        assert block.left == 0.1

    def test_frozen_model(self):
        """TextBlockData is immutable."""
        block = TextBlockData(
            text="Test",
            block_type="WORD",
            confidence=90.0,
            left=0.0,
            top=0.0,
            width=0.1,
            height=0.01,
        )

        with pytest.raises(Exception):
            block.text = "Modified"

    def test_validation_bounds(self):
        """TextBlockData validates coordinate bounds."""
        with pytest.raises(ValueError):
            TextBlockData(
                text="Test",
                block_type="LINE",
                confidence=150.0,  # Over 100
                left=0.0,
                top=0.0,
                width=0.1,
                height=0.01,
            )


class TestKeyValueData:
    """Tests for KeyValueData model."""

    def test_valid_key_value(self):
        """KeyValueData accepts valid values."""
        kv = KeyValueData(
            key="Name",
            value="John Doe",
            confidence=98.0,
        )

        assert kv.key == "Name"
        assert kv.value == "John Doe"
        assert kv.confidence == 98.0

    def test_frozen_model(self):
        """KeyValueData is immutable."""
        kv = KeyValueData(key="Test", value="Value", confidence=90.0)

        with pytest.raises(Exception):
            kv.key = "Modified"


class TestTableData:
    """Tests for TableData model."""

    def test_valid_table(self):
        """TableData accepts valid values."""
        table = TableData(
            headers=["Name", "Value"],
            rows=[{"Name": "A", "Value": "1"}, {"Name": "B", "Value": "2"}],
            row_count=2,
            column_count=2,
        )

        assert table.headers == ["Name", "Value"]
        assert len(table.rows) == 2
        assert table.row_count == 2
        assert table.column_count == 2

    def test_default_values(self):
        """TableData uses correct defaults."""
        table = TableData(row_count=0, column_count=0)

        assert table.headers == []
        assert table.rows == []


class TestOCRResult:
    """Tests for OCRResult model."""

    def test_valid_ocr_result(self):
        """OCRResult accepts valid values."""
        now = datetime.utcnow()
        result = OCRResult(
            id=uuid4(),
            document_id=uuid4(),
            organization_id=uuid4(),
            page_number=1,
            text_blocks=[{"text": "Sample"}],
            tables=[{"headers": ["A"]}],
            key_value_pairs=[{"key": "Name", "value": "Test"}],
            full_text="Sample text",
            reader_job_id="job-123",
            extracted_at=now,
            created_at=now,
            updated_at=now,
        )

        assert result.page_number == 1
        assert len(result.text_blocks) == 1
        assert result.reader_job_id == "job-123"

    def test_default_values(self):
        """OCRResult uses correct defaults for optional fields."""
        now = datetime.utcnow()
        result = OCRResult(
            id=uuid4(),
            document_id=uuid4(),
            organization_id=uuid4(),
            page_number=1,
            reader_job_id="job-456",
            extracted_at=now,
            created_at=now,
            updated_at=now,
        )

        assert result.text_blocks == []
        assert result.tables == []
        assert result.key_value_pairs == []
        assert result.full_text == ""


class TestOCRResultCreate:
    """Tests for OCRResultCreate model."""

    def test_valid_create(self):
        """OCRResultCreate accepts valid values."""
        create = OCRResultCreate(
            document_id=uuid4(),
            organization_id=uuid4(),
            page_number=2,
            text_blocks=[{"text": "Test"}],
            reader_job_id="job-789",
        )

        assert create.page_number == 2
        assert create.reader_job_id == "job-789"

    def test_page_number_validation(self):
        """OCRResultCreate validates page_number >= 1."""
        with pytest.raises(ValueError):
            OCRResultCreate(
                document_id=uuid4(),
                organization_id=uuid4(),
                page_number=0,  # Invalid
                reader_job_id="job-000",
            )


class TestOCRResultSummary:
    """Tests for OCRResultSummary model."""

    def test_valid_summary(self):
        """OCRResultSummary accepts valid values."""
        summary = OCRResultSummary(
            id=uuid4(),
            document_id=uuid4(),
            page_number=1,
            text_block_count=10,
            table_count=2,
            key_value_count=5,
            extracted_at=datetime.utcnow(),
        )

        assert summary.text_block_count == 10
        assert summary.table_count == 2


class TestDocumentOCRSummary:
    """Tests for DocumentOCRSummary model."""

    def test_valid_document_summary(self):
        """DocumentOCRSummary aggregates page results."""
        page1 = OCRResultSummary(
            id=uuid4(),
            document_id=uuid4(),
            page_number=1,
            text_block_count=10,
            table_count=1,
            key_value_count=3,
            extracted_at=datetime.utcnow(),
        )

        summary = DocumentOCRSummary(
            document_id=uuid4(),
            total_pages=1,
            total_text_blocks=10,
            total_tables=1,
            total_key_values=3,
            pages=[page1],
        )

        assert summary.total_pages == 1
        assert len(summary.pages) == 1

    def test_default_values(self):
        """DocumentOCRSummary uses correct defaults."""
        summary = DocumentOCRSummary(document_id=uuid4())

        assert summary.total_pages == 0
        assert summary.total_text_blocks == 0
        assert summary.pages == []


class TestOCRResultResponse:
    """Tests for OCRResultResponse model."""

    def test_valid_response(self):
        """OCRResultResponse accepts valid values."""
        now = datetime.utcnow()
        response = OCRResultResponse(
            id=uuid4(),
            document_id=uuid4(),
            page_number=1,
            text_blocks=[],
            tables=[],
            key_value_pairs=[],
            full_text="Test content",
            extracted_at=now,
            created_at=now,
        )

        assert response.full_text == "Test content"
        assert response.page_number == 1
