"""OCR result parser for extracting structured data from OCR responses."""

import logging
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.services.extraction.table_handler import ExtractedTable, TableExtractor

logger = logging.getLogger(__name__)


class BlockType(str, Enum):
    """OCR block types."""

    PAGE = "PAGE"
    LINE = "LINE"
    WORD = "WORD"
    KEY_VALUE_SET = "KEY_VALUE_SET"
    TABLE = "TABLE"
    CELL = "CELL"
    SELECTION_ELEMENT = "SELECTION_ELEMENT"


class KeyValueType(str, Enum):
    """Type of KEY_VALUE_SET block."""

    KEY = "KEY"
    VALUE = "VALUE"


class BoundingBox(BaseModel):
    """Bounding box coordinates (normalized 0-1).

    All coordinates are normalized to the page dimensions where:
    - (0, 0) is the top-left corner
    - (1, 1) is the bottom-right corner

    Attributes:
        left: Left edge x-coordinate (0-1).
        top: Top edge y-coordinate (0-1).
        width: Width as fraction of page width (0-1).
        height: Height as fraction of page height (0-1).
    """

    model_config = ConfigDict(frozen=True)

    left: Decimal = Field(..., ge=0, le=1)
    top: Decimal = Field(..., ge=0, le=1)
    width: Decimal = Field(..., ge=0, le=1)
    height: Decimal = Field(..., ge=0, le=1)

    @property
    def right(self) -> Decimal:
        """Calculate right edge x-coordinate."""
        return min(self.left + self.width, Decimal("1"))

    @property
    def bottom(self) -> Decimal:
        """Calculate bottom edge y-coordinate."""
        return min(self.top + self.height, Decimal("1"))

    @property
    def center_x(self) -> Decimal:
        """Calculate center x-coordinate."""
        return self.left + self.width / 2

    @property
    def center_y(self) -> Decimal:
        """Calculate center y-coordinate."""
        return self.top + self.height / 2

    def to_pixels(self, page_width: int, page_height: int) -> dict[str, int]:
        """Convert normalized coordinates to pixel coordinates.

        Args:
            page_width: Page width in pixels.
            page_height: Page height in pixels.

        Returns:
            Dict with left, top, width, height in pixels.
        """
        return {
            "left": int(float(self.left) * page_width),
            "top": int(float(self.top) * page_height),
            "width": int(float(self.width) * page_width),
            "height": int(float(self.height) * page_height),
        }


class TextBlock(BaseModel):
    """Parsed text block from OCR output.

    Attributes:
        id: Unique block ID from the OCR response.
        text: Extracted text content.
        page: Page number (1-indexed).
        confidence: Confidence score (0-100).
        block_type: Type of block (LINE, WORD, etc).
        bounding_box: Normalized bounding box coordinates.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    text: str
    page: int = Field(..., ge=1)
    confidence: Decimal = Field(..., ge=0, le=100)
    block_type: BlockType
    bounding_box: BoundingBox


class KeyValuePair(BaseModel):
    """Extracted key-value pair from form fields.

    Attributes:
        key: The form field label/key.
        value: The form field value.
        key_confidence: Confidence score for the key (0-100).
        value_confidence: Confidence score for the value (0-100).
        page: Page number where the pair was found.
        key_bounding_box: Bounding box for the key.
        value_bounding_box: Bounding box for the value (if present).
    """

    model_config = ConfigDict(frozen=True)

    key: str
    value: str | None = None
    key_confidence: Decimal = Field(..., ge=0, le=100)
    value_confidence: Decimal | None = Field(None, ge=0, le=100)
    page: int = Field(..., ge=1)
    key_bounding_box: BoundingBox
    value_bounding_box: BoundingBox | None = None


class PageInfo(BaseModel):
    """Information about a document page.

    Attributes:
        page_number: Page number (1-indexed).
        width: Page width (normalized, always 1.0).
        height: Page height (normalized, always 1.0).
        block_id: OCR block ID for this page.
    """

    model_config = ConfigDict(frozen=True)

    page_number: int = Field(..., ge=1)
    width: Decimal = Decimal("1")
    height: Decimal = Decimal("1")
    block_id: str | None = None


class ParsedDocument(BaseModel):
    """Complete parsed document with all extracted data.

    Attributes:
        pages: List of page information.
        lines: Extracted LINE blocks.
        words: Extracted WORD blocks.
        key_value_pairs: Extracted form field key-value pairs.
        tables: Extracted table blocks.
        total_blocks: Total number of blocks processed.
        filtered_count: Number of blocks filtered due to low confidence.
    """

    pages: list[PageInfo] = Field(default_factory=list)
    lines: list[TextBlock] = Field(default_factory=list)
    words: list[TextBlock] = Field(default_factory=list)
    key_value_pairs: list[KeyValuePair] = Field(default_factory=list)
    tables: list[ExtractedTable] = Field(default_factory=list)
    total_blocks: int = 0
    filtered_count: int = 0

    @property
    def page_count(self) -> int:
        """Get the number of pages in the document."""
        return len(self.pages)

    def get_text_by_page(self, page: int) -> list[TextBlock]:
        """Get all LINE blocks for a specific page.

        Args:
            page: Page number (1-indexed).

        Returns:
            List of TextBlock objects for the specified page.
        """
        return [line for line in self.lines if line.page == page]

    def get_full_text(self, separator: str = "\n") -> str:
        """Get concatenated text from all LINE blocks.

        Args:
            separator: Separator between lines (default newline).

        Returns:
            Full document text as a single string.
        """
        # Sort by page, then by top position
        sorted_lines = sorted(
            self.lines,
            key=lambda b: (b.page, float(b.bounding_box.top)),
        )
        return separator.join(line.text for line in sorted_lines)


class OCRResultParser:
    """Parser for OCR document analysis results.

    Extracts structured data from OCR blocks including:
    - LINE blocks (text lines with geometry)
    - WORD blocks (individual words with confidence)
    - KEY_VALUE_SET blocks (form field key-value pairs)
    - TABLE blocks (structured rows and columns)

    Attributes:
        min_confidence: Minimum confidence threshold (0-100).
    """

    DEFAULT_MIN_CONFIDENCE = Decimal("80")

    def __init__(
        self,
        min_confidence: Decimal | None = None,
        table_extractor: TableExtractor | None = None,
    ):
        """Initialize the parser.

        Args:
            min_confidence: Minimum confidence threshold (0-100).
                           Blocks below this threshold are filtered.
                           Default is 80.
            table_extractor: Optional table extractor dependency.
        """
        self._min_confidence = min_confidence or self.DEFAULT_MIN_CONFIDENCE
        self._table_extractor = table_extractor or TableExtractor()

    @property
    def min_confidence(self) -> Decimal:
        """Get the minimum confidence threshold."""
        return self._min_confidence

    def parse(self, blocks: list[dict[str, Any]]) -> ParsedDocument:
        """Parse OCR blocks into structured document.

        Args:
            blocks: List of OCR block dictionaries.

        Returns:
            ParsedDocument with extracted text and metadata.
        """
        logger.info(
            "Parsing OCR blocks",
            extra={"block_count": len(blocks)},
        )
        result = ParsedDocument(total_blocks=len(blocks))
        table_blocks = self._filter_table_blocks_by_confidence(blocks)
        result.tables = [
            table
            for table in self._table_extractor.extract_tables(table_blocks)
            if table.cell_details
        ]

        # Build block ID to block mapping for relationship lookup
        block_map: dict[str, dict[str, Any]] = {
            str(block.get("Id")): block for block in blocks if block.get("Id")
        }

        for block in blocks:
            block_type = block.get("BlockType")

            if block_type == BlockType.PAGE.value:
                self._parse_page(block, result)
            elif block_type == BlockType.LINE.value:
                self._parse_line(block, result)
            elif block_type == BlockType.WORD.value:
                self._parse_word(block, result)
            elif block_type == BlockType.KEY_VALUE_SET.value:
                self._parse_key_value(block, block_map, result)

        logger.info(
            "OCR parsing complete",
            extra={
                "pages": len(result.pages),
                "lines": len(result.lines),
                "kvps": len(result.key_value_pairs),
                "tables": len(result.tables),
                "filtered_count": result.filtered_count,
            },
        )
        return result

    def _safe_confidence(self, block: dict[str, Any]) -> Decimal | None:
        """Parse a block's Confidence into a finite Decimal in [0, 100].

        OCR/model output is untrusted: a non-numeric, NaN/Infinity, or
        out-of-range Confidence would otherwise crash the whole document parse
        (InvalidOperation on the comparison, or a ValidationError when building
        the block). Returning None lets the caller drop just that block.
        """
        try:
            confidence = Decimal(str(block.get("Confidence", 0)))
        except (InvalidOperation, ValueError, TypeError):
            return None
        if not confidence.is_finite() or confidence < 0 or confidence > 100:
            return None
        return confidence

    def _filter_table_blocks_by_confidence(
        self,
        blocks: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Filter low-confidence table cell text before table reconstruction."""
        filtered_blocks = []
        for block in blocks:
            block_type = block.get("BlockType")
            if block_type not in {BlockType.CELL.value, BlockType.WORD.value}:
                filtered_blocks.append(block)
                continue

            # A NaN/infinite/non-numeric confidence is "no usable confidence":
            # drop the block rather than letting a NaN comparison raise
            # InvalidOperation (NaN >= x) and abort the whole parse.
            confidence = self._safe_confidence(block)
            if confidence is None:
                continue

            if confidence >= self._min_confidence:
                filtered_blocks.append(block)

        return filtered_blocks

    def _parse_page(
        self,
        block: dict[str, Any],
        result: ParsedDocument,
    ) -> None:
        """Parse a PAGE block.

        Args:
            block: PAGE block.
            result: ParsedDocument to append to.
        """
        # OCR output is untrusted: a missing or invalid Page (0, negative,
        # non-int) would crash PageInfo (page_number >= 1). Fall back to the
        # next sequential page number rather than aborting the whole parse.
        raw_page = block.get("Page")
        page_number = (
            raw_page
            if isinstance(raw_page, int) and raw_page >= 1
            else (len(result.pages) + 1)
        )
        page_info = PageInfo(
            page_number=page_number,
            block_id=block.get("Id"),
        )
        result.pages.append(page_info)

    def _parse_line(
        self,
        block: dict[str, Any],
        result: ParsedDocument,
    ) -> None:
        """Parse a LINE block.

        Args:
            block: LINE block.
            result: ParsedDocument to append to.
        """
        confidence = self._safe_confidence(block)

        if confidence is None or confidence < self._min_confidence:
            result.filtered_count += 1
            return

        bbox = self._parse_bounding_box(block.get("Geometry", {}))
        if bbox is None:
            return

        try:
            text_block = TextBlock(
                id=block.get("Id", ""),
                text=block.get("Text", ""),
                page=block.get("Page", 1),
                confidence=confidence,
                block_type=BlockType.LINE,
                bounding_box=bbox,
            )
        except ValidationError:
            # Malformed field (e.g. Page < 1) — drop this block, keep parsing.
            result.filtered_count += 1
            return
        result.lines.append(text_block)

    def _parse_word(
        self,
        block: dict[str, Any],
        result: ParsedDocument,
    ) -> None:
        """Parse a WORD block.

        Args:
            block: WORD block.
            result: ParsedDocument to append to.
        """
        confidence = self._safe_confidence(block)

        if confidence is None or confidence < self._min_confidence:
            result.filtered_count += 1
            return

        bbox = self._parse_bounding_box(block.get("Geometry", {}))
        if bbox is None:
            return

        try:
            text_block = TextBlock(
                id=block.get("Id", ""),
                text=block.get("Text", ""),
                page=block.get("Page", 1),
                confidence=confidence,
                block_type=BlockType.WORD,
                bounding_box=bbox,
            )
        except ValidationError:
            # Malformed field (e.g. Page < 1) — drop this block, keep parsing.
            result.filtered_count += 1
            return
        result.words.append(text_block)

    def _parse_key_value(
        self,
        block: dict[str, Any],
        block_map: dict[str, dict[str, Any]],
        result: ParsedDocument,
    ) -> None:
        """Parse a KEY_VALUE_SET block.

        Args:
            block: KEY_VALUE_SET block.
            block_map: Mapping of block IDs to blocks for relationship lookup.
            result: ParsedDocument to append to.
        """
        # Only process KEY blocks (VALUE blocks are referenced from KEY blocks)
        entity_types = block.get("EntityTypes", [])
        if KeyValueType.KEY.value not in entity_types:
            return

        confidence = self._safe_confidence(block)
        if confidence is None or confidence < self._min_confidence:
            result.filtered_count += 1
            return

        # Get key text from child WORD blocks
        key_text = self._get_text_from_relationships(block, block_map)
        key_bbox = self._parse_bounding_box(block.get("Geometry", {}))

        if not key_text or key_bbox is None:
            return

        # Find the associated VALUE block
        value_text = None
        value_confidence = None
        value_bbox = None

        for relationship in block.get("Relationships", []):
            if relationship.get("Type") == "VALUE":
                for value_id in relationship.get("Ids", []):
                    value_block = block_map.get(value_id)
                    if value_block:
                        value_text = self._get_text_from_relationships(
                            value_block, block_map
                        )
                        value_confidence = self._safe_confidence(value_block)
                        value_bbox = self._parse_bounding_box(
                            value_block.get("Geometry", {})
                        )
                        break

        try:
            key_value = KeyValuePair(
                key=key_text,
                value=value_text,
                key_confidence=confidence,
                value_confidence=value_confidence,
                page=block.get("Page", 1),
                key_bounding_box=key_bbox,
                value_bounding_box=value_bbox,
            )
        except ValidationError:
            # Malformed field (e.g. Page < 1) — drop this pair, keep parsing.
            result.filtered_count += 1
            return
        result.key_value_pairs.append(key_value)

    def _get_text_from_relationships(
        self,
        block: dict[str, Any],
        block_map: dict[str, dict[str, Any]],
    ) -> str:
        """Extract text from child blocks via relationships.

        Args:
            block: Parent block with relationships.
            block_map: Mapping of block IDs to blocks.

        Returns:
            Concatenated text from child WORD blocks.
        """
        text_parts = []

        for relationship in block.get("Relationships", []):
            if relationship.get("Type") == "CHILD":
                for child_id in relationship.get("Ids", []):
                    child_block = block_map.get(child_id)
                    if child_block and child_block.get("BlockType") == "WORD":
                        text_parts.append(child_block.get("Text", ""))

        return " ".join(text_parts)

    def _parse_bounding_box(
        self,
        geometry: dict[str, Any],
    ) -> BoundingBox | None:
        """Parse bounding box from geometry.

        Args:
            geometry: OCR geometry object.

        Returns:
            BoundingBox or None if geometry is invalid.
        """
        bbox_data = geometry.get("BoundingBox", {})

        if not bbox_data:
            return None

        try:
            return BoundingBox(
                left=Decimal(str(bbox_data.get("Left", 0))),
                top=Decimal(str(bbox_data.get("Top", 0))),
                width=Decimal(str(bbox_data.get("Width", 0))),
                height=Decimal(str(bbox_data.get("Height", 0))),
            )
        except (InvalidOperation, ValueError, TypeError):
            return None


def create_parser(min_confidence: float = 80.0) -> OCRResultParser:
    """Create an OCRResultParser with the specified confidence threshold.

    Args:
        min_confidence: Minimum confidence threshold (0-100).

    Returns:
        Configured OCRResultParser instance.
    """
    return OCRResultParser(min_confidence=Decimal(str(min_confidence)))
