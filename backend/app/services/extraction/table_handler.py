"""
Table extraction handler for OCR TABLE blocks.

Extracts structured table data from OCR responses,
reconstructing rows and columns from CELL blocks and
handling merged cells that span multiple positions.
"""

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)


def _safe_page(raw: Any) -> int:
    """Coerce an untrusted OCR ``Page`` value into a valid page number.

    OCR output is untrusted: a missing, zero, negative, or non-integer Page
    would crash the ``page_number >= 1`` models. Fall back to page 1 rather
    than aborting the whole table extraction.
    """
    return raw if isinstance(raw, int) and not isinstance(raw, bool) and raw >= 1 else 1


def _safe_confidence(raw: Any) -> Decimal:
    """Coerce an untrusted OCR ``Confidence`` value into a finite Decimal.

    A non-numeric, NaN, or infinite confidence would crash on
    ``Decimal(str(...))`` math or fail downstream comparisons; clamp anything
    unparseable to 0 so a single bad cell cannot abort the table.
    """
    try:
        confidence = Decimal(str(raw))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")
    if not confidence.is_finite():
        return Decimal("0")
    return confidence


class TableCell(BaseModel):
    """Represents a cell in an extracted table.

    Attributes:
        row_index: Zero-based row position.
        column_index: Zero-based column position.
        row_span: Number of rows this cell spans.
        column_span: Number of columns this cell spans.
        text: Text content of the cell.
        confidence: Extraction confidence score (0-100).
        page_number: Page where the cell appears.
    """

    model_config = {"frozen": True}

    row_index: int = Field(ge=0)
    column_index: int = Field(ge=0)
    row_span: int = Field(default=1, ge=1)
    column_span: int = Field(default=1, ge=1)
    text: str = ""
    confidence: Decimal = Field(default=Decimal("0"))
    page_number: int = Field(default=1, ge=1)


class ExtractedTable(BaseModel):
    """Complete extracted table with metadata.

    Attributes:
        page_number: Page where the table starts.
        rows: 2D grid of cell values as strings.
        headers: First row values used as column headers.
        data: Data rows as list of dictionaries with header keys.
        cell_details: Original TableCell objects for detailed access.
    """

    model_config = {"frozen": True}

    page_number: int = Field(default=1, ge=1)
    rows: list[list[str]] = Field(default_factory=list)
    headers: list[str] = Field(default_factory=list)
    data: list[dict[str, str]] = Field(default_factory=list)
    cell_details: list[TableCell] = Field(default_factory=list)


class TableExtractor:
    """Extract structured table data from OCR TABLE blocks.

    This class processes OCR response blocks to identify TABLE
    blocks and their CELL children, reconstructing the original
    table structure including merged cells.
    """

    def extract_tables(self, blocks: list[dict[str, Any]]) -> list[ExtractedTable]:
        """Extract all tables from OCR blocks.

        Args:
            blocks: List of OCR block dictionaries.

        Returns:
            List of ExtractedTable objects, one per TABLE block.
        """
        if not blocks:
            return []

        # Build block lookup for efficient relationship resolution
        block_map = {b["Id"]: b for b in blocks if "Id" in b}

        tables = []
        table_blocks = [b for b in blocks if b.get("BlockType") == "TABLE"]

        logger.debug("Found %d TABLE blocks to process", len(table_blocks))

        for table_block in table_blocks:
            page_num = _safe_page(table_block.get("Page", 1))
            cells = self._get_cells(table_block, block_map)
            grid = self._build_grid(cells)
            headers = grid[0] if grid else []
            data = self._grid_to_dicts(grid)

            table = ExtractedTable(
                page_number=page_num,
                rows=grid,
                headers=headers,
                data=data,
                cell_details=cells,
            )
            tables.append(table)

            logger.debug(
                "Extracted table on page %d: %d rows x %d cols",
                page_num,
                len(grid),
                len(headers),
            )

        return tables

    def _get_cells(
        self,
        table_block: dict[str, Any],
        block_map: dict[str, dict[str, Any]],
    ) -> list[TableCell]:
        """Extract TableCell objects from a TABLE block's children.

        Args:
            table_block: The TABLE block dictionary.
            block_map: Lookup dictionary of all blocks by ID.

        Returns:
            List of TableCell objects found in the table.
        """
        cells = []

        # Get child relationships (CELL blocks)
        for relationship in table_block.get("Relationships", []):
            if relationship.get("Type") == "CHILD":
                for cell_id in relationship.get("Ids", []):
                    cell_block = block_map.get(cell_id)
                    if cell_block and cell_block.get("BlockType") == "CELL":
                        # Extract cell text from WORD children
                        text = self._get_cell_text(cell_block, block_map)

                        # OCR cell metadata is untrusted: out-of-range indices,
                        # spans, or a bad Page/Confidence would crash the cell
                        # model. Sanitize the scalars and skip the cell rather
                        # than aborting the whole table.
                        try:
                            cell = TableCell(
                                row_index=max(cell_block.get("RowIndex", 1) - 1, 0),
                                column_index=max(
                                    cell_block.get("ColumnIndex", 1) - 1, 0
                                ),
                                row_span=max(cell_block.get("RowSpan", 1), 1),
                                column_span=max(cell_block.get("ColumnSpan", 1), 1),
                                text=text.strip(),
                                confidence=_safe_confidence(
                                    cell_block.get("Confidence", 0)
                                ),
                                page_number=_safe_page(cell_block.get("Page", 1)),
                            )
                        except (ValidationError, TypeError):
                            continue
                        cells.append(cell)

        return cells

    def _get_cell_text(
        self,
        cell_block: dict[str, Any],
        block_map: dict[str, dict[str, Any]],
    ) -> str:
        """Extract text content from a CELL block by following WORD relationships.

        Args:
            cell_block: The CELL block dictionary.
            block_map: Lookup dictionary of all blocks by ID.

        Returns:
            Concatenated text from all WORD children.
        """
        words = []
        for relationship in cell_block.get("Relationships", []):
            if relationship.get("Type") == "CHILD":
                for word_id in relationship.get("Ids", []):
                    word_block = block_map.get(word_id)
                    if word_block and word_block.get("BlockType") == "WORD":
                        words.append(word_block.get("Text", ""))
        return " ".join(words)

    def _build_grid(self, cells: list[TableCell]) -> list[list[str]]:
        """Build 2D grid from cells, handling merged cells.

        Merged cells are expanded to fill their entire span area
        with the same text value.

        Args:
            cells: List of TableCell objects.

        Returns:
            2D list of strings representing the table grid.
        """
        if not cells:
            return []

        # Determine grid dimensions
        max_row = max(c.row_index + c.row_span for c in cells)
        max_col = max(c.column_index + c.column_span for c in cells)

        # Initialize empty grid
        grid: list[list[str]] = [["" for _ in range(max_col)] for _ in range(max_row)]

        # Fill grid with cell values (merged cells fill multiple positions)
        for cell in cells:
            for r in range(cell.row_index, cell.row_index + cell.row_span):
                for c in range(cell.column_index, cell.column_index + cell.column_span):
                    if r < max_row and c < max_col:
                        grid[r][c] = cell.text

        return grid

    def _grid_to_dicts(self, grid: list[list[str]]) -> list[dict[str, str]]:
        """Convert 2D grid to list of dicts using first row as headers.

        Args:
            grid: 2D list of strings representing the table.

        Returns:
            List of dictionaries, one per data row, with header keys.
        """
        if len(grid) < 2:
            return []

        headers = grid[0]
        data_rows = grid[1:]

        result = []
        for row in data_rows:
            row_dict: dict[str, str] = {}
            for i, header in enumerate(headers):
                # Handle case where row has fewer columns than headers
                value = row[i] if i < len(row) else ""
                # Use column index as fallback header if header is empty
                key = header if header else f"column_{i}"
                row_dict[key] = value
            result.append(row_dict)

        return result


def create_table_extractor() -> TableExtractor:
    """Create a TableExtractor instance.

    Factory function for creating table extractors.

    Returns:
        Configured TableExtractor instance.
    """
    return TableExtractor()
