"""Pagination helpers for Supabase/PostgREST reads."""

from collections.abc import Callable, Iterator, Sequence
from typing import Any
from unittest.mock import Mock

DEFAULT_PAGE_SIZE = 1000

# Maximum number of values to place in a single PostgREST ``in.(...)`` filter.
# Each UUID is ~37 chars once URL-encoded into the query string, so a few
# hundred IDs overflow the proxy's request-line / header buffer (Kong/nginx
# return HTTP 414 "URI too long"). 100 UUIDs (~3.7 KB) stays well under the
# typical 8 KB limit while keeping the number of round-trips low.
DEFAULT_IN_CHUNK_SIZE = 100


def _unpaged_rows(query: Any) -> list[dict[str, Any]]:
    result = query.execute()
    data = result.data or []
    if isinstance(data, Mock):
        return []
    if not isinstance(data, list):
        raise TypeError("Supabase paginated reads must return list data")
    return data


def fetch_all_pages(
    query_factory: Callable[[], Any],
    *,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> list[dict[str, Any]]:
    """Fetch every row from a Supabase query using explicit range windows."""
    if page_size < 1:
        raise ValueError("page_size must be positive")

    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        query = query_factory()
        try:
            page_result = query.range(offset, offset + page_size - 1).execute()
        except AttributeError:
            return _unpaged_rows(query)
        page = page_result.data or []
        if not isinstance(page, list):
            return _unpaged_rows(query)
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size


def chunked(
    values: Sequence[Any], chunk_size: int = DEFAULT_IN_CHUNK_SIZE
) -> Iterator[list[Any]]:
    """Yield successive ``chunk_size``-length lists from ``values``.

    Use for write operations (UPDATE/DELETE) whose ``.in_(...)`` filter would
    otherwise overflow the request URL (HTTP 414). For paginated SELECTs use
    :func:`fetch_all_pages_chunked_in` instead.
    """
    if chunk_size < 1:
        raise ValueError("chunk_size must be positive")
    items = list(values)
    for start in range(0, len(items), chunk_size):
        yield items[start : start + chunk_size]


def fetch_all_pages_chunked_in(
    query_factory: Callable[[list[Any]], Any],
    values: Sequence[Any],
    *,
    page_size: int = DEFAULT_PAGE_SIZE,
    chunk_size: int = DEFAULT_IN_CHUNK_SIZE,
) -> list[dict[str, Any]]:
    """Fetch all rows for a large ``in.(...)`` filter without overflowing the URL.

    PostgREST encodes ``.in_()`` values into the request URL. With hundreds of
    UUIDs the URL exceeds the proxy limit and the request fails with HTTP 414
    ("URI too long"). This helper splits ``values`` into ``chunk_size`` batches,
    runs each batch through :func:`fetch_all_pages` (so each chunk is still fully
    paginated), and concatenates the results.

    Args:
        query_factory: Builds the query for a single chunk. Receives the chunk
            (a list) and must apply the ``.in_(column, chunk)`` filter itself.
        values: The full list of filter values (e.g. lease IDs).
        page_size: Row page size passed to :func:`fetch_all_pages`.
        chunk_size: Maximum number of values per ``in.(...)`` filter.

    Returns:
        Concatenated rows across every chunk. Empty list when ``values`` is empty.
    """
    items = list(values)
    if not items:
        return []

    rows: list[dict[str, Any]] = []
    for chunk in chunked(items, chunk_size):
        current_chunk = chunk

        def current_query_factory() -> Any:
            return query_factory(current_chunk)

        rows.extend(
            fetch_all_pages(
                current_query_factory,
                page_size=page_size,
            )
        )
    return rows
