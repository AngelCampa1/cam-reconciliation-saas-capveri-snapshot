"""
Tests for the OCR result parser.

Tests the parsing of OCR response blocks into structured data.
"""

from decimal import Decimal

import pytest

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


class TestBoundingBox:
    """Tests for BoundingBox model."""

    def test_create_valid_bbox(self):
        """Create bounding box with valid coordinates."""
        bbox = BoundingBox(
            left=Decimal("0.1"),
            top=Decimal("0.2"),
            width=Decimal("0.3"),
            height=Decimal("0.4"),
        )

        assert bbox.left == Decimal("0.1")
        assert bbox.top == Decimal("0.2")
        assert bbox.width == Decimal("0.3")
        assert bbox.height == Decimal("0.4")

    def test_right_property(self):
        """Right edge calculated correctly."""
        bbox = BoundingBox(
            left=Decimal("0.5"),
            top=Decimal("0"),
            width=Decimal("0.3"),
            height=Decimal("0.1"),
        )

        assert bbox.right == Decimal("0.8")

    def test_right_clamped_to_one(self):
        """Right edge clamped to 1.0."""
        bbox = BoundingBox(
            left=Decimal("0.9"),
            top=Decimal("0"),
            width=Decimal("0.5"),
            height=Decimal("0.1"),
        )

        assert bbox.right == Decimal("1")

    def test_bottom_property(self):
        """Bottom edge calculated correctly."""
        bbox = BoundingBox(
            left=Decimal("0"),
            top=Decimal("0.6"),
            width=Decimal("0.1"),
            height=Decimal("0.2"),
        )

        assert bbox.bottom == Decimal("0.8")

    def test_center_properties(self):
        """Center coordinates calculated correctly."""
        bbox = BoundingBox(
            left=Decimal("0.2"),
            top=Decimal("0.4"),
            width=Decimal("0.4"),
            height=Decimal("0.2"),
        )

        assert bbox.center_x == Decimal("0.4")
        assert bbox.center_y == Decimal("0.5")

    def test_to_pixels(self):
        """Convert normalized to pixel coordinates."""
        bbox = BoundingBox(
            left=Decimal("0.1"),
            top=Decimal("0.2"),
            width=Decimal("0.5"),
            height=Decimal("0.3"),
        )

        pixels = bbox.to_pixels(1000, 800)

        assert pixels["left"] == 100
        assert pixels["top"] == 160
        assert pixels["width"] == 500
        assert pixels["height"] == 240

    def test_frozen_model(self):
        """BoundingBox is immutable."""
        bbox = BoundingBox(
            left=Decimal("0.1"),
            top=Decimal("0.2"),
            width=Decimal("0.3"),
            height=Decimal("0.4"),
        )

        with pytest.raises(Exception):  # ValidationError for frozen model
            bbox.left = Decimal("0.5")


class TestTextBlock:
    """Tests for TextBlock model."""

    def test_create_text_block(self):
        """Create text block with all fields."""
        bbox = BoundingBox(
            left=Decimal("0.1"),
            top=Decimal("0.2"),
            width=Decimal("0.8"),
            height=Decimal("0.05"),
        )
        block = TextBlock(
            id="block-123",
            text="Hello World",
            page=1,
            confidence=Decimal("99.5"),
            block_type=BlockType.LINE,
            bounding_box=bbox,
        )

        assert block.id == "block-123"
        assert block.text == "Hello World"
        assert block.page == 1
        assert block.confidence == Decimal("99.5")
        assert block.block_type == BlockType.LINE


class TestKeyValuePair:
    """Tests for KeyValuePair model."""

    def test_create_key_value_pair(self):
        """Create key-value pair with value."""
        key_bbox = BoundingBox(
            left=Decimal("0.1"),
            top=Decimal("0.3"),
            width=Decimal("0.2"),
            height=Decimal("0.05"),
        )
        value_bbox = BoundingBox(
            left=Decimal("0.35"),
            top=Decimal("0.3"),
            width=Decimal("0.3"),
            height=Decimal("0.05"),
        )

        kv = KeyValuePair(
            key="Name",
            value="John Doe",
            key_confidence=Decimal("95.0"),
            value_confidence=Decimal("92.0"),
            page=1,
            key_bounding_box=key_bbox,
            value_bounding_box=value_bbox,
        )

        assert kv.key == "Name"
        assert kv.value == "John Doe"
        assert kv.key_confidence == Decimal("95.0")
        assert kv.value_confidence == Decimal("92.0")

    def test_key_value_pair_without_value(self):
        """Create key-value pair without value."""
        key_bbox = BoundingBox(
            left=Decimal("0.1"),
            top=Decimal("0.3"),
            width=Decimal("0.2"),
            height=Decimal("0.05"),
        )

        kv = KeyValuePair(
            key="Empty Field",
            key_confidence=Decimal("90.0"),
            page=1,
            key_bounding_box=key_bbox,
        )

        assert kv.key == "Empty Field"
        assert kv.value is None
        assert kv.value_confidence is None
        assert kv.value_bounding_box is None


class TestParsedDocument:
    """Tests for ParsedDocument model."""

    def test_empty_document(self):
        """Empty document has correct defaults."""
        doc = ParsedDocument()

        assert doc.pages == []
        assert doc.lines == []
        assert doc.words == []
        assert doc.key_value_pairs == []
        assert doc.total_blocks == 0
        assert doc.filtered_count == 0
        assert doc.page_count == 0

    def test_page_count(self):
        """Page count reflects pages list."""
        doc = ParsedDocument(
            pages=[
                PageInfo(page_number=1, block_id="page-1"),
                PageInfo(page_number=2, block_id="page-2"),
            ]
        )

        assert doc.page_count == 2

    def test_get_text_by_page(self):
        """Get lines for specific page."""
        bbox = BoundingBox(
            left=Decimal("0.1"),
            top=Decimal("0.1"),
            width=Decimal("0.8"),
            height=Decimal("0.05"),
        )
        doc = ParsedDocument(
            lines=[
                TextBlock(
                    id="1",
                    text="Page 1 Line",
                    page=1,
                    confidence=Decimal("99"),
                    block_type=BlockType.LINE,
                    bounding_box=bbox,
                ),
                TextBlock(
                    id="2",
                    text="Page 2 Line",
                    page=2,
                    confidence=Decimal("99"),
                    block_type=BlockType.LINE,
                    bounding_box=bbox,
                ),
            ]
        )

        page_1_lines = doc.get_text_by_page(1)

        assert len(page_1_lines) == 1
        assert page_1_lines[0].text == "Page 1 Line"

    def test_get_full_text(self):
        """Get concatenated text from all lines."""
        bbox1 = BoundingBox(
            left=Decimal("0.1"),
            top=Decimal("0.1"),
            width=Decimal("0.8"),
            height=Decimal("0.05"),
        )
        bbox2 = BoundingBox(
            left=Decimal("0.1"),
            top=Decimal("0.2"),
            width=Decimal("0.8"),
            height=Decimal("0.05"),
        )
        doc = ParsedDocument(
            lines=[
                TextBlock(
                    id="2",
                    text="Second Line",
                    page=1,
                    confidence=Decimal("99"),
                    block_type=BlockType.LINE,
                    bounding_box=bbox2,
                ),
                TextBlock(
                    id="1",
                    text="First Line",
                    page=1,
                    confidence=Decimal("99"),
                    block_type=BlockType.LINE,
                    bounding_box=bbox1,
                ),
            ]
        )

        full_text = doc.get_full_text()

        # Sorted by top position
        assert full_text == "First Line\nSecond Line"


class TestBlockType:
    """Tests for BlockType enum."""

    def test_all_values_exist(self):
        """All expected block types exist."""
        assert BlockType.PAGE.value == "PAGE"
        assert BlockType.LINE.value == "LINE"
        assert BlockType.WORD.value == "WORD"
        assert BlockType.KEY_VALUE_SET.value == "KEY_VALUE_SET"
        assert BlockType.TABLE.value == "TABLE"
        assert BlockType.CELL.value == "CELL"


class TestKeyValueType:
    """Tests for KeyValueType enum."""

    def test_all_values_exist(self):
        """Key and Value types exist."""
        assert KeyValueType.KEY.value == "KEY"
        assert KeyValueType.VALUE.value == "VALUE"


class TestOCRResultParser:
    """Tests for OCRResultParser class."""

    @pytest.fixture
    def parser(self):
        """Create parser with default confidence."""
        return OCRResultParser()

    @pytest.fixture
    def low_confidence_parser(self):
        """Create parser with low confidence threshold."""
        return OCRResultParser(min_confidence=Decimal("50"))

    def test_default_min_confidence(self, parser):
        """Default confidence threshold is 80."""
        assert parser.min_confidence == Decimal("80")

    def test_custom_min_confidence(self, low_confidence_parser):
        """Custom confidence threshold is set."""
        assert low_confidence_parser.min_confidence == Decimal("50")

    def test_parse_empty_blocks(self, parser):
        """Parse empty block list."""
        result = parser.parse([])

        assert result.total_blocks == 0
        assert result.lines == []

    def test_parse_ignores_unknown_block_type(self, parser):
        """Unknown OCR block types are ignored without affecting parsed output."""
        result = parser.parse([{"BlockType": "SIGNATURE", "Id": "sig-1", "Page": 1}])

        assert result.total_blocks == 1
        assert result.page_count == 0
        assert result.lines == []
        assert result.words == []
        assert result.key_value_pairs == []
        assert result.tables == []

    def test_parse_table_blocks(self, parser):
        """TABLE blocks are reconstructed into structured table output."""
        blocks = [
            {
                "BlockType": "TABLE",
                "Id": "table-1",
                "Page": 1,
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["cell-1", "cell-2", "cell-3", "cell-4"]}
                ],
            },
            {
                "BlockType": "CELL",
                "Id": "cell-1",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Confidence": 99.0,
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word-1"]}],
            },
            {
                "BlockType": "CELL",
                "Id": "cell-2",
                "RowIndex": 1,
                "ColumnIndex": 2,
                "Confidence": 98.0,
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word-2"]}],
            },
            {
                "BlockType": "CELL",
                "Id": "cell-3",
                "RowIndex": 2,
                "ColumnIndex": 1,
                "Confidence": 97.0,
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word-3"]}],
            },
            {
                "BlockType": "CELL",
                "Id": "cell-4",
                "RowIndex": 2,
                "ColumnIndex": 2,
                "Confidence": 96.0,
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word-4"]}],
            },
            {
                "BlockType": "WORD",
                "Id": "word-1",
                "Text": "Expense",
                "Confidence": 99.0,
            },
            {"BlockType": "WORD", "Id": "word-2", "Text": "Amount", "Confidence": 98.0},
            {
                "BlockType": "WORD",
                "Id": "word-3",
                "Text": "Repairs",
                "Confidence": 97.0,
            },
            {"BlockType": "WORD", "Id": "word-4", "Text": "$1,200", "Confidence": 96.0},
        ]

        result = parser.parse(blocks)

        assert len(result.tables) == 1
        table = result.tables[0]
        assert table.page_number == 1
        assert table.headers == ["Expense", "Amount"]
        assert table.rows == [["Expense", "Amount"], ["Repairs", "$1,200"]]
        assert table.data == [{"Expense": "Repairs", "Amount": "$1,200"}]
        assert len(table.cell_details) == 4
        assert table.cell_details[0].confidence == Decimal("99.0")

    def test_parse_filters_low_confidence_table_blocks(self, parser):
        """Low-confidence CELL and WORD blocks are excluded from parsed tables."""
        blocks = [
            {
                "BlockType": "TABLE",
                "Id": "table-1",
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["cell-1", "cell-2"]}],
            },
            {
                "BlockType": "CELL",
                "Id": "cell-1",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Confidence": 95.0,
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word-1"]}],
            },
            {
                "BlockType": "CELL",
                "Id": "cell-2",
                "RowIndex": 1,
                "ColumnIndex": 2,
                "Confidence": 30.0,
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word-2"]}],
            },
            {"BlockType": "WORD", "Id": "word-1", "Text": "Kept", "Confidence": 95.0},
            {
                "BlockType": "WORD",
                "Id": "word-2",
                "Text": "Dropped",
                "Confidence": 30.0,
            },
        ]

        result = parser.parse(blocks)

        assert len(result.tables) == 1
        assert result.tables[0].rows == [["Kept"]]
        assert len(result.tables[0].cell_details) == 1

    def test_parse_drops_tables_with_only_low_confidence_cells(self, parser):
        """Tables with no cells surviving confidence filtering are omitted."""
        blocks = [
            {
                "BlockType": "TABLE",
                "Id": "table-1",
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["cell-1"]}],
            },
            {
                "BlockType": "CELL",
                "Id": "cell-1",
                "RowIndex": 1,
                "ColumnIndex": 1,
                "Confidence": 30.0,
                "Page": 1,
                "Relationships": [{"Type": "CHILD", "Ids": ["word-1"]}],
            },
            {
                "BlockType": "WORD",
                "Id": "word-1",
                "Text": "Dropped",
                "Confidence": 30.0,
            },
        ]

        result = parser.parse(blocks)

        assert result.tables == []

    def test_parse_line_block(self, parser):
        """Parse LINE block correctly."""
        blocks = [
            {
                "BlockType": "LINE",
                "Id": "line-1",
                "Text": "Hello World",
                "Page": 1,
                "Confidence": 95.5,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.2,
                        "Width": 0.3,
                        "Height": 0.05,
                    }
                },
            }
        ]

        result = parser.parse(blocks)

        assert len(result.lines) == 1
        assert result.lines[0].text == "Hello World"
        assert result.lines[0].page == 1
        assert result.lines[0].confidence == Decimal("95.5")
        assert result.lines[0].bounding_box.left == Decimal("0.1")

    def test_parse_word_block(self, parser):
        """Parse WORD block correctly."""
        blocks = [
            {
                "BlockType": "WORD",
                "Id": "word-1",
                "Text": "Hello",
                "Page": 1,
                "Confidence": 98.0,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.2,
                        "Width": 0.15,
                        "Height": 0.04,
                    }
                },
            }
        ]

        result = parser.parse(blocks)

        assert len(result.words) == 1
        assert result.words[0].text == "Hello"
        assert result.words[0].block_type == BlockType.WORD

    def test_parse_page_block(self, parser):
        """Parse PAGE block correctly."""
        blocks = [
            {
                "BlockType": "PAGE",
                "Id": "page-1",
                "Page": 1,
            }
        ]

        result = parser.parse(blocks)

        assert len(result.pages) == 1
        assert result.pages[0].page_number == 1
        assert result.pages[0].block_id == "page-1"

    def test_filter_low_confidence_lines(self, parser):
        """Lines below confidence threshold are filtered."""
        blocks = [
            {
                "BlockType": "LINE",
                "Id": "line-1",
                "Text": "High Confidence",
                "Page": 1,
                "Confidence": 95.0,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.1,
                        "Width": 0.3,
                        "Height": 0.05,
                    }
                },
            },
            {
                "BlockType": "LINE",
                "Id": "line-2",
                "Text": "Low Confidence",
                "Page": 1,
                "Confidence": 70.0,  # Below 80 threshold
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.2,
                        "Width": 0.3,
                        "Height": 0.05,
                    }
                },
            },
        ]

        result = parser.parse(blocks)

        assert len(result.lines) == 1
        assert result.lines[0].text == "High Confidence"
        assert result.filtered_count == 1

    def test_filter_low_confidence_words(self, parser):
        """Words below confidence threshold are filtered."""
        blocks = [
            {
                "BlockType": "WORD",
                "Id": "word-1",
                "Text": "Low",
                "Page": 1,
                "Confidence": 50.0,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.1,
                        "Width": 0.1,
                        "Height": 0.05,
                    }
                },
            },
        ]

        result = parser.parse(blocks)

        assert len(result.words) == 0
        assert result.filtered_count == 1

    def test_parse_key_value_set(self, parser):
        """Parse KEY_VALUE_SET blocks correctly."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "key-1",
                "EntityTypes": ["KEY"],
                "Confidence": 92.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-key"]},
                    {"Type": "VALUE", "Ids": ["value-1"]},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-key",
                "Text": "Name:",
                "Confidence": 95.0,
            },
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "value-1",
                "EntityTypes": ["VALUE"],
                "Confidence": 88.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.35,
                        "Top": 0.3,
                        "Width": 0.3,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-value"]},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-value",
                "Text": "John Doe",
                "Confidence": 90.0,
            },
        ]

        result = parser.parse(blocks)

        assert len(result.key_value_pairs) == 1
        kv = result.key_value_pairs[0]
        assert kv.key == "Name:"
        assert kv.value == "John Doe"
        assert kv.key_confidence == Decimal("92.0")
        assert kv.value_confidence == Decimal("88.0")

    def test_parse_key_without_value(self, parser):
        """Parse KEY_VALUE_SET with missing value."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "key-1",
                "EntityTypes": ["KEY"],
                "Confidence": 90.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-key"]},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-key",
                "Text": "Empty Field",
                "Confidence": 95.0,
            },
        ]

        result = parser.parse(blocks)

        assert len(result.key_value_pairs) == 1
        assert result.key_value_pairs[0].key == "Empty Field"
        assert result.key_value_pairs[0].value is None

    def test_multi_page_document(self, parser):
        """Parse multi-page document correctly."""
        blocks = [
            {"BlockType": "PAGE", "Id": "page-1", "Page": 1},
            {
                "BlockType": "LINE",
                "Id": "line-1",
                "Text": "Page 1 content",
                "Page": 1,
                "Confidence": 95.0,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.1,
                        "Width": 0.8,
                        "Height": 0.05,
                    }
                },
            },
            {"BlockType": "PAGE", "Id": "page-2", "Page": 2},
            {
                "BlockType": "LINE",
                "Id": "line-2",
                "Text": "Page 2 content",
                "Page": 2,
                "Confidence": 93.0,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.1,
                        "Width": 0.8,
                        "Height": 0.05,
                    }
                },
            },
        ]

        result = parser.parse(blocks)

        assert result.page_count == 2
        assert len(result.lines) == 2
        assert result.get_text_by_page(1)[0].text == "Page 1 content"
        assert result.get_text_by_page(2)[0].text == "Page 2 content"

    def test_skip_blocks_without_geometry(self, parser):
        """Blocks without valid geometry are skipped."""
        blocks = [
            {
                "BlockType": "LINE",
                "Id": "line-1",
                "Text": "No geometry",
                "Page": 1,
                "Confidence": 95.0,
                "Geometry": {},  # Empty geometry
            },
        ]

        result = parser.parse(blocks)

        assert len(result.lines) == 0

    def test_skip_value_only_key_value_set(self, parser):
        """VALUE-only KEY_VALUE_SET blocks are skipped."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "value-1",
                "EntityTypes": ["VALUE"],  # Only VALUE, no KEY
                "Confidence": 90.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.3,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
            },
        ]

        result = parser.parse(blocks)

        assert len(result.key_value_pairs) == 0

    def test_skip_key_value_without_child_text(self, parser):
        """KEY_VALUE_SET blocks without child WORD text are skipped."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "key-1",
                "EntityTypes": ["KEY"],
                "Confidence": 90.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
            }
        ]

        result = parser.parse(blocks)

        assert result.key_value_pairs == []

    def test_filter_low_confidence_key_value_set(self, parser):
        """Low-confidence KEY_VALUE_SET blocks are counted as filtered."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "key-1",
                "EntityTypes": ["KEY"],
                "Confidence": 10.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
            }
        ]

        result = parser.parse(blocks)

        assert result.key_value_pairs == []
        assert result.filtered_count == 1

    def test_skip_key_value_with_invalid_value_geometry(self, parser):
        """KEY_VALUE_SET keeps the pair even when the value geometry is invalid."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "key-1",
                "EntityTypes": ["KEY"],
                "Confidence": 92.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-key"]},
                    {"Type": "VALUE", "Ids": ["value-1"]},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-key",
                "Text": "Amount",
                "Confidence": 95.0,
            },
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "value-1",
                "EntityTypes": ["VALUE"],
                "Confidence": 88.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": "bad",
                        "Top": 0.3,
                        "Width": 0.3,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-value"]},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-value",
                "Text": "1200",
                "Confidence": 90.0,
            },
        ]

        result = parser.parse(blocks)

        assert len(result.key_value_pairs) == 1
        assert result.key_value_pairs[0].value == "1200"
        assert result.key_value_pairs[0].value_bounding_box is None

    def test_parse_key_value_with_missing_value_block(self, parser):
        """Missing VALUE block references still preserve the key extraction."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "key-1",
                "EntityTypes": ["KEY"],
                "Confidence": 92.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-key"]},
                    {"Type": "VALUE", "Ids": ["missing-value"]},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-key",
                "Text": "Base Year",
                "Confidence": 95.0,
            },
        ]

        result = parser.parse(blocks)

        assert len(result.key_value_pairs) == 1
        assert result.key_value_pairs[0].key == "Base Year"
        assert result.key_value_pairs[0].value is None

    def test_parse_key_value_with_empty_value_ids(self, parser):
        """Empty VALUE relationship IDs still preserve the extracted key."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "key-1",
                "EntityTypes": ["KEY"],
                "Confidence": 92.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-key"]},
                    {"Type": "VALUE", "Ids": []},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-key",
                "Text": "Operating Stop",
                "Confidence": 95.0,
            },
        ]

        result = parser.parse(blocks)

        assert len(result.key_value_pairs) == 1
        assert result.key_value_pairs[0].key == "Operating Stop"
        assert result.key_value_pairs[0].value is None

    def test_parse_key_value_with_only_missing_value_ids(self, parser):
        """VALUE relationships without resolvable blocks still preserve the key."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "key-1",
                "EntityTypes": ["KEY"],
                "Confidence": 92.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-key"]},
                    {"Type": "VALUE", "Ids": ["missing-1", "missing-2"]},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-key",
                "Text": "Expense Stop",
                "Confidence": 95.0,
            },
        ]

        result = parser.parse(blocks)

        assert len(result.key_value_pairs) == 1
        assert result.key_value_pairs[0].key == "Expense Stop"
        assert result.key_value_pairs[0].value is None

    def test_parse_key_value_with_multiple_value_ids_uses_first_found_block(
        self, parser
    ):
        """VALUE relationships scan IDs until a referenced block is found."""
        blocks = [
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "key-1",
                "EntityTypes": ["KEY"],
                "Confidence": 92.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1,
                        "Top": 0.3,
                        "Width": 0.2,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-key"]},
                    {"Type": "VALUE", "Ids": ["missing-value", "value-1"]},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-key",
                "Text": "Expense Cap",
                "Confidence": 95.0,
            },
            {
                "BlockType": "KEY_VALUE_SET",
                "Id": "value-1",
                "EntityTypes": ["VALUE"],
                "Confidence": 88.0,
                "Page": 1,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.35,
                        "Top": 0.3,
                        "Width": 0.3,
                        "Height": 0.05,
                    }
                },
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["word-value"]},
                ],
            },
            {
                "BlockType": "WORD",
                "Id": "word-value",
                "Text": "5%",
                "Confidence": 90.0,
            },
        ]

        result = parser.parse(blocks)

        assert len(result.key_value_pairs) == 1
        assert result.key_value_pairs[0].value == "5%"

    def test_parse_bounding_box_returns_none_for_invalid_decimal(self, parser):
        """Invalid numeric values in geometry return None."""
        assert (
            parser._parse_bounding_box(
                {
                    "BoundingBox": {
                        "Left": "not-a-number",
                        "Top": 0.1,
                        "Width": 0.2,
                        "Height": 0.3,
                    }
                }
            )
            is None
        )

    def test_get_text_from_relationships_returns_word_children_only(self, parser):
        """Relationship text extraction keeps only WORD blocks from CHILD links."""
        block = {
            "Relationships": [
                {"Type": "CHILD", "Ids": ["word-1", "line-1", "missing"]},
                {"Type": "VALUE", "Ids": ["ignored"]},
            ]
        }
        block_map = {
            "word-1": {"BlockType": "WORD", "Text": "Lease"},
            "line-1": {"BlockType": "LINE", "Text": "ignored"},
        }

        assert parser._get_text_from_relationships(block, block_map) == "Lease"


class TestCreateParser:
    """Tests for create_parser factory function."""

    def test_creates_with_default_confidence(self):
        """Factory creates parser with default confidence."""
        parser = create_parser()

        assert parser.min_confidence == Decimal("80")

    def test_creates_with_custom_confidence(self):
        """Factory creates parser with custom confidence."""
        parser = create_parser(min_confidence=60.0)

        assert parser.min_confidence == Decimal("60")
