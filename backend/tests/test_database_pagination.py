"""Tests for Supabase pagination helpers."""

import pytest

from app.database.pagination import (
    DEFAULT_IN_CHUNK_SIZE,
    chunked,
    fetch_all_pages,
    fetch_all_pages_chunked_in,
)


class _Response:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows, ranges):
        self._rows = rows
        self._ranges = ranges
        self._start = 0
        self._end = 0

    def range(self, start, end):
        self._ranges.append((start, end))
        self._start = start
        self._end = end
        return self

    def execute(self):
        return _Response(self._rows[self._start : self._end + 1])


def test_fetch_all_pages_returns_all_rows_and_tracks_windows():
    rows = [{"id": i} for i in range(2001)]
    ranges = []

    result = fetch_all_pages(lambda: _Query(rows, ranges), page_size=1000)

    assert result == rows
    assert ranges == [(0, 999), (1000, 1999), (2000, 2999)]


def test_fetch_all_pages_rejects_invalid_page_size():
    with pytest.raises(ValueError, match="page_size"):
        fetch_all_pages(lambda: _Query([], []), page_size=0)


def test_fetch_all_pages_supports_unpaged_query_doubles():
    class _UnpagedQuery:
        def execute(self):
            return _Response([{"id": "legacy-test-double"}])

    result = fetch_all_pages(lambda: _UnpagedQuery())

    assert result == [{"id": "legacy-test-double"}]


def test_chunked_in_splits_large_value_lists_and_concatenates():
    # Regression for BUG-09: a single huge in.(...) filter overflows the URL and
    # the proxy returns HTTP 414. The helper must split the values into chunks,
    # query each, and concatenate — never building one oversized filter.
    rows_by_value = {f"v{i}": [{"value": f"v{i}", "n": i}] for i in range(250)}
    seen_chunks: list[list[str]] = []

    def factory(chunk):
        seen_chunks.append(chunk)
        matched = [r for v in chunk for r in rows_by_value.get(v, [])]
        return _Query(matched, [])

    values = [f"v{i}" for i in range(250)]
    result = fetch_all_pages_chunked_in(factory, values, chunk_size=100)

    # 250 values / 100 per chunk -> 3 chunks of sizes 100, 100, 50
    assert [len(c) for c in seen_chunks] == [100, 100, 50]
    # No chunk ever exceeds the requested chunk size
    assert all(len(c) <= 100 for c in seen_chunks)
    # Every row is returned exactly once, order preserved
    assert result == [{"value": f"v{i}", "n": i} for i in range(250)]


def test_chunked_in_uses_safe_default_chunk_size_for_uuid_filters():
    # The default chunk size must stay small enough that a chunk of UUIDs fits
    # comfortably under the proxy URL limit.
    assert DEFAULT_IN_CHUNK_SIZE <= 100

    captured: list[int] = []

    def factory(chunk):
        captured.append(len(chunk))
        return _Query([], [])

    fetch_all_pages_chunked_in(factory, [f"id-{i}" for i in range(305)])

    assert captured == [100, 100, 100, 5]


def test_chunked_in_empty_values_makes_no_query():
    calls: list[list[str]] = []

    def factory(chunk):
        calls.append(chunk)
        return _Query([], [])

    assert fetch_all_pages_chunked_in(factory, []) == []
    assert calls == []


def test_chunked_in_rejects_invalid_chunk_size():
    with pytest.raises(ValueError, match="chunk_size"):
        fetch_all_pages_chunked_in(lambda chunk: _Query([], []), ["a"], chunk_size=0)


# ---------------------------------------------------------------------------
# chunked() — BUG-10 regression tests
# ---------------------------------------------------------------------------


def test_chunked_splits_into_correct_sizes():
    """250 values at chunk_size=100 must yield [100, 100, 50] preserving order."""
    values = list(range(250))
    chunks = list(chunked(values, chunk_size=100))
    assert [len(c) for c in chunks] == [100, 100, 50]
    # Order preserved — flatten and compare
    assert [v for c in chunks for v in c] == values


def test_chunked_empty_input_yields_nothing():
    """Empty input must yield no chunks."""
    assert list(chunked([])) == []


def test_chunked_zero_chunk_size_raises_value_error():
    """chunk_size=0 must raise ValueError."""
    with pytest.raises(ValueError):
        list(chunked(["a"], 0))


def test_chunked_default_size_is_at_most_100():
    """Default chunk size must stay within the safe URL-size budget."""
    assert DEFAULT_IN_CHUNK_SIZE <= 100
    # Verify the default is applied when chunk_size is omitted
    values = list(range(305))
    chunk_sizes = [len(c) for c in chunked(values)]
    assert all(s <= 100 for s in chunk_sizes)
    assert sum(chunk_sizes) == 305
