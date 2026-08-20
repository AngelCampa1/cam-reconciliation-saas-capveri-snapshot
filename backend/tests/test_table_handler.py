"""
Tests for table extraction handler.

Tests the extraction of structured table data from OCR TABLE blocks.
"""

from decimal import Decimal

import pytest

from app.services.extraction.table_handler import (
    ExtractedTable,
    TableCell,
    TableExtractor,
    create_table_extractor,
)


class TestTableCell:
    """Tests for TableCell model."""

    def test_default_values(self):
        """TableCell uses correct defaults."""
        cell = TableCell(row_index=0, column_index=0)

        assert cell.row_index == 0
        assert cell.column_index == 0
        assert cell.row_span == 1
        assert cell.column_span == 1
        assert cell.text == ""
        assert cell.confidence == Decimal("0")
        assert cell.page_number == 1

    def test_custom_values(self):
        """TableCell accepts custom values."""
        cell = TableCell(
            row_index=2,
            column_index=3,
            row_span=2,
            column_span=3,
            text="Test Value",
            confidence=Decimal("95.5"),
            page_number=2,
        )

        assert cell.row_index == 2
        assert cell.column_index == 3
        assert cell.row_span == 2
        assert cell.column_span == 3
        assert cell.text == "Test Value"
        assert cell.confidence == Decimal("95.5")
        assert cell.page_number == 2

    def test_frozen_model(self):
        """TableCell is immutable."""
        cell = TableCell(row_index=0, column_index=0)

        with pytest.raises(Exception):
            cell.text = "Modified"


class TestExtractedTable:
    """Tests for ExtractedTable model."""

    def test_default_values(self):
        """ExtractedTable uses correct defaults."""
        table = ExtractedTable()

        assert table.page_number == 1
        assert table.rows == []
        assert table.headers == []
        assert table.data == []
        assert table.cell_details == []

    def test_with_data(self):
        """ExtractedTable stores all fields correctly."""
        cell = TableCell(row_index=0, column_index=0, text="Header")
        table = ExtractedTable(
            page_number=2,
            rows=[["A", "B"], ["1", "2"]],
            headers=["A", "B"],
            data=[{"A": "1", "B": "2"}],
            cell_details=[cell],
        )

        assert table.page_number == 2
        assert len(table.rows) == 2
        assert table.headers == ["A", "B"]
        assert len(table.data) == 1
        assert table.data[0]["A"] == "1"
        assert len(table.cell_details) == 1


class TestTableExtractor:
    """Tests for TableExtractor class."""

    @pytest.fixture
    def extractor(self):
        """Create a TableExtractor instance."""
        return TableExtractor()

    def test_extract_empty_blocks(self, extractor):
        """Empty blocks returns empty list."""
        result = extractor.extract_tables([])
        assert result == []

    def test_extract_no_tables(self, extractor):
        """Blocks without TABLE type returns empty list."""
        blocks = [
            {"Id": "1", "BlockType": "PAGE"},
            {"Id": "2", "BlockType": "LINE", "Text": "Some text"},
        ]
        result = extractor.extract_tables(blocks)
        assert result == []

    def test_extract_simple_table(self, extractor):
        """Simple 2x2 table extracted correctly."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 1,
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["cell1", "cell2", "cell3", "cell4"]}
                ],
            },
            {
                "Id": "cell1",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Confidence": 99.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word1"]}],
            },
            {
                "Id": "cell2",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 2,
                "Confidence": 98.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word2"]}],
            },
            {
                "Id": "cell3",
                "BlockType": "CELL",
                "RowIndex": 2,
                "ColumnIndex": 1,
                "Confidence": 97.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word3"]}],
            },
            {
                "Id": "cell4",
                "BlockType": "CELL",
                "RowIndex": 2,
                "ColumnIndex": 2,
                "Confidence": 96.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word4"]}],
            },
            {"Id": "word1", "BlockType": "WORD", "Text": "Name"},
            {"Id": "word2", "BlockType": "WORD", "Text": "Value"},
            {"Id": "word3", "BlockType": "WORD", "Text": "Item1"},
            {"Id": "word4", "BlockType": "WORD", "Text": "100"},
        ]

        result = extractor.extract_tables(blocks)

        assert len(result) == 1
        table = result[0]
        assert table.page_number == 1
        assert table.headers == ["Name", "Value"]
        assert table.rows == [["Name", "Value"], ["Item1", "100"]]
        assert len(table.data) == 1
        assert table.data[0] == {"Name": "Item1", "Value": "100"}
        assert len(table.cell_details) == 4

    def test_extract_merged_cells(self, extractor):
        """Merged cells spanning rows/columns handled correctly."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 1,
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["cell1", "cell2", "cell3"]}
                ],
            },
            {
                "Id": "cell1",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "ColumnSpan": 2,  # Merged header spanning 2 columns
                "Confidence": 99.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word1"]}],
            },
            {
                "Id": "cell2",
                "BlockType": "CELL",
                "RowIndex": 2,
                "ColumnIndex": 1,
                "Confidence": 98.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word2"]}],
            },
            {
                "Id": "cell3",
                "BlockType": "CELL",
                "RowIndex": 2,
                "ColumnIndex": 2,
                "Confidence": 97.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word3"]}],
            },
            {"Id": "word1", "BlockType": "WORD", "Text": "Merged Header"},
            {"Id": "word2", "BlockType": "WORD", "Text": "A"},
            {"Id": "word3", "BlockType": "WORD", "Text": "B"},
        ]

        result = extractor.extract_tables(blocks)

        assert len(result) == 1
        table = result[0]
        # Merged cell fills both positions
        assert table.rows[0] == ["Merged Header", "Merged Header"]
        assert table.rows[1] == ["A", "B"]

    def test_extract_row_span(self, extractor):
        """Cells spanning multiple rows handled correctly."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 1,
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["cell1", "cell2", "cell3"]}
                ],
            },
            {
                "Id": "cell1",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "RowSpan": 2,  # Spans 2 rows
                "Confidence": 99.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word1"]}],
            },
            {
                "Id": "cell2",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 2,
                "Confidence": 98.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word2"]}],
            },
            {
                "Id": "cell3",
                "BlockType": "CELL",
                "RowIndex": 2,
                "ColumnIndex": 2,
                "Confidence": 97.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word3"]}],
            },
            {"Id": "word1", "BlockType": "WORD", "Text": "Spanning"},
            {"Id": "word2", "BlockType": "WORD", "Text": "Row1"},
            {"Id": "word3", "BlockType": "WORD", "Text": "Row2"},
        ]

        result = extractor.extract_tables(blocks)

        table = result[0]
        # First cell spans both rows in column 1
        assert table.rows[0][0] == "Spanning"
        assert table.rows[1][0] == "Spanning"

    def test_extract_empty_cells(self, extractor):
        """Empty cells preserved as empty strings."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["cell1", "cell2"]}],
            },
            {
                "Id": "cell1",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Confidence": 99.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["word1"]}],
            },
            {
                "Id": "cell2",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 2,
                "Confidence": 98.0,
                # No relationships = no text
            },
            {"Id": "word1", "BlockType": "WORD", "Text": "Header"},
        ]

        result = extractor.extract_tables(blocks)

        table = result[0]
        assert table.rows[0][0] == "Header"
        assert table.rows[0][1] == ""

    def test_extract_multiword_cells(self, extractor):
        """Cell text from multiple WORDs joined correctly."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["cell1"]}],
            },
            {
                "Id": "cell1",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Confidence": 99.0,
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word1", "word2", "word3"]}
                ],
            },
            {"Id": "word1", "BlockType": "WORD", "Text": "Total"},
            {"Id": "word2", "BlockType": "WORD", "Text": "Amount"},
            {"Id": "word3", "BlockType": "WORD", "Text": "Due"},
        ]

        result = extractor.extract_tables(blocks)

        table = result[0]
        assert table.rows[0][0] == "Total Amount Due"

    def test_extract_multiple_tables(self, extractor):
        """Multiple tables in document extracted separately."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["cell1"]}],
            },
            {
                "Id": "table2",
                "BlockType": "TABLE",
                "Page": 2,
                "Relationships": [{"Type": "CHILD", "Ids": ["cell2"]}],
            },
            {
                "Id": "cell1",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word1"]}],
            },
            {
                "Id": "cell2",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word2"]}],
            },
            {"Id": "word1", "BlockType": "WORD", "Text": "Table1"},
            {"Id": "word2", "BlockType": "WORD", "Text": "Table2"},
        ]

        result = extractor.extract_tables(blocks)

        assert len(result) == 2
        assert result[0].page_number == 1
        assert result[0].rows[0][0] == "Table1"
        assert result[1].page_number == 2
        assert result[1].rows[0][0] == "Table2"

    def test_empty_header_fallback(self, extractor):
        """Empty headers use column_N as fallback key."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 1,
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["cell1", "cell2", "cell3", "cell4"]}
                ],
            },
            {
                "Id": "cell1",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word1"]}],
            },
            {
                "Id": "cell2",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 2,
                # Empty header
            },
            {
                "Id": "cell3",
                "BlockType": "CELL",
                "RowIndex": 2,
                "ColumnIndex": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word3"]}],
            },
            {
                "Id": "cell4",
                "BlockType": "CELL",
                "RowIndex": 2,
                "ColumnIndex": 2,
                "Relationships": [{"Type": "CHILD", "Ids": ["word4"]}],
            },
            {"Id": "word1", "BlockType": "WORD", "Text": "Name"},
            {"Id": "word3", "BlockType": "WORD", "Text": "Item"},
            {"Id": "word4", "BlockType": "WORD", "Text": "100"},
        ]

        result = extractor.extract_tables(blocks)

        table = result[0]
        # Second column uses fallback key
        assert "column_1" in table.data[0]
        assert table.data[0]["column_1"] == "100"

    def test_header_only_table(self, extractor):
        """Table with only header row returns empty data."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["cell1", "cell2"]}],
            },
            {
                "Id": "cell1",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word1"]}],
            },
            {
                "Id": "cell2",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 2,
                "Relationships": [{"Type": "CHILD", "Ids": ["word2"]}],
            },
            {"Id": "word1", "BlockType": "WORD", "Text": "Col1"},
            {"Id": "word2", "BlockType": "WORD", "Text": "Col2"},
        ]

        result = extractor.extract_tables(blocks)

        table = result[0]
        assert table.headers == ["Col1", "Col2"]
        assert table.data == []  # No data rows

    def test_table_without_relationships(self, extractor):
        """Table block without relationships returns empty table."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 1,
                # No Relationships
            }
        ]

        result = extractor.extract_tables(blocks)

        assert len(result) == 1
        assert result[0].rows == []
        assert result[0].data == []

    def test_cell_details_preserved(self, extractor):
        """Cell details include confidence and position."""
        blocks = [
            {
                "Id": "table1",
                "BlockType": "TABLE",
                "Page": 3,
                "Relationships": [{"Type": "CHILD", "Ids": ["cell1"]}],
            },
            {
                "Id": "cell1",
                "BlockType": "CELL",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "RowSpan": 2,
                "ColumnSpan": 3,
                "Confidence": 95.5,
                "Page": 3,
                "Relationships": [{"Type": "CHILD", "Ids": ["word1"]}],
            },
            {"Id": "word1", "BlockType": "WORD", "Text": "Test"},
        ]

        result = extractor.extract_tables(blocks)

        cell = result[0].cell_details[0]
        assert cell.row_index == 0  # 0-indexed
        assert cell.column_index == 0
        assert cell.row_span == 2
        assert cell.column_span == 3
        assert cell.confidence == Decimal("95.5")
        assert cell.page_number == 3
        assert cell.text == "Test"


class TestCreateTableExtractor:
    """Tests for factory function."""

    def test_creates_extractor(self):
        """Factory creates TableExtractor instance."""
        extractor = create_table_extractor()
        assert isinstance(extractor, TableExtractor)
