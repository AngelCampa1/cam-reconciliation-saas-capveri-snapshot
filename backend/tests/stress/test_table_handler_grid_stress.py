"""Property-based stress for the OCR table reconstruction grid logic.

``TableExtractor`` rebuilds a 2-D table from OCR CELL blocks, expanding merged
cells across their row/column span and mapping the result to header-keyed dicts.
It is pure (no I/O) but fed entirely **untrusted** OCR output, so two failure
classes matter:

  * **Scalar sanitisation** — ``_safe_page`` / ``_safe_confidence`` must coerce a
    missing/zero/negative/NaN/garbage value to a safe default instead of crashing
    the whole table on one bad cell.
  * **Grid integrity** — ``_build_grid`` must allocate exactly
    ``max(index+span)`` rows/cols, fill every position a (possibly merged) cell
    covers, and let later cells win overlaps; ``_grid_to_dicts`` must emit one
    dict per data row with the right header keys (empty header -> ``column_i``).

A span-math off-by-one silently drops or duplicates table cells, corrupting every
figure downstream. This harness independently re-derives the grid and the dict
projection for random cell sets.

Run standalone:
    pytest tests/stress/test_table_handler_grid_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.extraction.table_handler import (
    TableCell,
    TableExtractor,
    _safe_confidence,
    _safe_page,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


# ---------------------------------------------------------------------------
# _safe_page
# ---------------------------------------------------------------------------


@STRESS
@given(
    raw=st.one_of(
        st.integers(min_value=-50, max_value=50),
        st.booleans(),
        st.floats(allow_nan=True, allow_infinity=True),
        st.text(max_size=5),
        st.none(),
    )
)
def test_safe_page_only_passes_positive_ints(raw):
    result = _safe_page(raw)
    # A genuine positive int (not bool) survives; everything else -> 1.
    if isinstance(raw, int) and not isinstance(raw, bool) and raw >= 1:
        assert result == raw
    else:
        assert result == 1
    assert result >= 1


# ---------------------------------------------------------------------------
# _safe_confidence
# ---------------------------------------------------------------------------


@STRESS
@given(
    raw=st.one_of(
        st.integers(min_value=-100, max_value=100),
        st.floats(allow_nan=True, allow_infinity=True),
        st.decimals(allow_nan=True, allow_infinity=True),
        st.text(max_size=6),
        st.none(),
    )
)
def test_safe_confidence_is_always_finite_decimal(raw):
    result = _safe_confidence(raw)
    assert isinstance(result, Decimal)
    assert result.is_finite()
    # A finite numeric input round-trips through Decimal(str(...)).
    try:
        expected = Decimal(str(raw))
    except Exception:
        expected = Decimal("0")
    else:
        if not expected.is_finite():
            expected = Decimal("0")
    assert result == expected


def test_safe_confidence_known_cases():
    assert _safe_confidence("nan") == Decimal("0")
    assert _safe_confidence(float("inf")) == Decimal("0")
    assert _safe_confidence("not a number") == Decimal("0")
    assert _safe_confidence(99.5) == Decimal("99.5")
    assert _safe_confidence(0) == Decimal("0")


# ---------------------------------------------------------------------------
# _build_grid
# ---------------------------------------------------------------------------

cell_strategy = st.builds(
    TableCell,
    row_index=st.integers(min_value=0, max_value=6),
    column_index=st.integers(min_value=0, max_value=6),
    row_span=st.integers(min_value=1, max_value=3),
    column_span=st.integers(min_value=1, max_value=3),
    text=st.text(max_size=4),
)


@STRESS
@given(cells=st.lists(cell_strategy, min_size=0, max_size=12))
def test_build_grid_dimensions_and_fill(cells):
    extractor = TableExtractor()
    grid = extractor._build_grid(cells)

    if not cells:
        assert grid == []
        return

    max_row = max(c.row_index + c.row_span for c in cells)
    max_col = max(c.column_index + c.column_span for c in cells)

    # Exact rectangular dimensions; every position is a string.
    assert len(grid) == max_row
    assert all(len(row) == max_col for row in grid)
    assert all(isinstance(v, str) for row in grid for v in row)

    # Independent re-derivation: last cell in list order wins any overlap.
    expected = [["" for _ in range(max_col)] for _ in range(max_row)]
    for cell in cells:
        for r in range(cell.row_index, cell.row_index + cell.row_span):
            for c in range(cell.column_index, cell.column_index + cell.column_span):
                expected[r][c] = cell.text
    assert grid == expected


def test_build_grid_expands_merged_cell():
    extractor = TableExtractor()
    # A single 2x3 merged cell starting at (1,1) fills exactly 6 positions; the
    # grid spans rows 0..2 and cols 0..3 (zeros elsewhere).
    cells = [
        TableCell(row_index=1, column_index=1, row_span=2, column_span=3, text="X")
    ]
    grid = extractor._build_grid(cells)
    assert len(grid) == 3 and all(len(r) == 4 for r in grid)
    filled = [(r, c) for r in range(3) for c in range(4) if grid[r][c] == "X"]
    assert filled == [(1, 1), (1, 2), (1, 3), (2, 1), (2, 2), (2, 3)]


def test_build_grid_later_cell_wins_overlap():
    extractor = TableExtractor()
    cells = [
        TableCell(row_index=0, column_index=0, text="first"),
        TableCell(row_index=0, column_index=0, text="second"),
    ]
    assert extractor._build_grid(cells) == [["second"]]


# ---------------------------------------------------------------------------
# _grid_to_dicts
# ---------------------------------------------------------------------------


@STRESS
@given(
    grid=st.lists(
        st.lists(st.text(max_size=4), min_size=0, max_size=5),
        min_size=0,
        max_size=6,
    )
)
def test_grid_to_dicts_rederivation(grid):
    extractor = TableExtractor()
    result = extractor._grid_to_dicts(grid)

    if len(grid) < 2:
        assert result == []
        return

    headers = grid[0]
    assert len(result) == len(grid) - 1

    for row, row_dict in zip(grid[1:], result):
        expected: dict[str, str] = {}
        for i, header in enumerate(headers):
            key = header if header else f"column_{i}"
            expected[key] = row[i] if i < len(row) else ""
        assert row_dict == expected


def test_grid_to_dicts_empty_header_fallback_and_short_rows():
    extractor = TableExtractor()
    grid = [
        ["Account", "", "Amount"],
        ["Rent", "x", "100"],
        ["Tax"],  # short row -> missing cols default to ""
    ]
    result = extractor._grid_to_dicts(grid)
    assert result == [
        {"Account": "Rent", "column_1": "x", "Amount": "100"},
        {"Account": "Tax", "column_1": "", "Amount": ""},
    ]


def test_grid_to_dicts_requires_two_rows():
    extractor = TableExtractor()
    assert extractor._grid_to_dicts([]) == []
    assert extractor._grid_to_dicts([["only", "header"]]) == []


def test_extract_tables_end_to_end_anchor():
    # Minimal OCR block set: one TABLE with a 2x2 grid of CELLs, each holding one
    # WORD. Exercises _get_cells + _build_grid + _grid_to_dicts together.
    extractor = TableExtractor()

    def cell(cid, r, c, word_id):
        return {
            "Id": cid,
            "BlockType": "CELL",
            "RowIndex": r,
            "ColumnIndex": c,
            "Relationships": [{"Type": "CHILD", "Ids": [word_id]}],
        }

    def word(wid, text):
        return {"Id": wid, "BlockType": "WORD", "Text": text}

    blocks = [
        {
            "Id": "t1",
            "BlockType": "TABLE",
            "Page": 2,
            "Relationships": [{"Type": "CHILD", "Ids": ["c1", "c2", "c3", "c4"]}],
        },
        cell("c1", 1, 1, "w1"),
        cell("c2", 1, 2, "w2"),
        cell("c3", 2, 1, "w3"),
        cell("c4", 2, 2, "w4"),
        word("w1", "Account"),
        word("w2", "Amount"),
        word("w3", "Rent"),
        word("w4", "100"),
    ]
    tables = extractor.extract_tables(blocks)
    assert len(tables) == 1
    table = tables[0]
    assert table.page_number == 2
    assert table.headers == ["Account", "Amount"]
    assert table.data == [{"Account": "Rent", "Amount": "100"}]


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-q"])
