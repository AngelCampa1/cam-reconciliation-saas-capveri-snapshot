"""Property-based invariants for the ingestion parser dispatcher.

``ingestion/dispatcher.py:IngestionDispatcher`` decides which ERP parser handles
an uploaded file. A wrong decision routes a whole file through the wrong parser
(garbage data) or rejects a valid file, so the registry bookkeeping and the
four routing branches — explicit override, auto-detect hit, generic fallback,
and no-parser — must be exact.

This drives a fresh dispatcher (never the global singleton) with dynamically
built fake parser classes. The fingerprint engine is patched to return a chosen
``FingerprintResult`` so each routing branch is exercised deterministically;
fingerprint correctness itself is pinned separately (test_fingerprint_stress).

Invariants pinned here:

  * **Registry round-trip** — after ``register`` the source is present in
    ``has_parser`` and ``list_parsers``; ``unregister`` removes it and reports
    True once then False; ``clear`` empties the registry.
  * **Type guard** — registering a non-``IngestionStrategy`` raises ``TypeError``
    and leaves the registry untouched.
  * **Override routing** — a registered override returns that parser with a
    confidence-1.0 "Manual override" result; an unregistered override raises
    ``ValueError``.
  * **Auto-detect** — when the fingerprinted source is registered, that parser is
    returned with the detection result intact.
  * **Generic fallback** — when the fingerprinted source is absent but a generic
    parser is registered, the generic parser is returned and the detection
    result is unchanged.
  * **Fails closed** — no matching parser and no generic registered raises
    ``ValueError``.

Run standalone:
    pytest tests/stress/test_dispatcher_routing_stress.py -q
"""

from __future__ import annotations

import io
from typing import BinaryIO
from unittest.mock import patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.ingestion import dispatcher as dispatcher_mod
from app.services.ingestion.base import IngestionStrategy
from app.services.ingestion.dispatcher import IngestionDispatcher
from app.services.ingestion.fingerprint import FingerprintResult
from app.services.ingestion.schemas import ParseResult

STRESS = settings(max_examples=300, deadline=None)

_SOURCES = ["yardi", "mri", "generic", "realpage", "mystery"]


def _make_parser(source: str) -> type[IngestionStrategy]:
    """Build a concrete IngestionStrategy whose source_system is `source`."""

    class _P(IngestionStrategy):
        @property
        def source_system(self) -> str:
            return source

        def can_handle(self, file_header: bytes, file_name: str) -> float:
            return 0.0

        def parse(
            self, file: BinaryIO, file_name: str, property_id: str
        ) -> ParseResult:  # pragma: no cover - never invoked by routing tests
            raise NotImplementedError

    _P.__name__ = f"Parser_{source}"
    return _P


@STRESS
@given(sources=st.lists(st.sampled_from(_SOURCES), min_size=1, max_size=5, unique=True))
def test_registry_round_trip(sources):
    d = IngestionDispatcher()
    for s in sources:
        d.register(_make_parser(s))

    # Every registered source is reported present exactly once.
    assert set(d.list_parsers()) == set(sources)
    for s in sources:
        assert d.has_parser(s)

    # Unregister reports True the first time, False the second.
    target = sources[0]
    assert d.unregister(target) is True
    assert d.unregister(target) is False
    assert not d.has_parser(target)

    d.clear()
    assert d.list_parsers() == []


def test_register_type_guard():
    d = IngestionDispatcher()
    with pytest.raises(TypeError):
        d.register(str)  # type: ignore[arg-type]
    assert d.list_parsers() == []


@STRESS
@given(
    registered=st.lists(st.sampled_from(_SOURCES), min_size=1, max_size=5, unique=True),
    override=st.sampled_from(_SOURCES),
)
def test_override_routing(registered, override):
    d = IngestionDispatcher()
    for s in registered:
        d.register(_make_parser(s))

    file = io.BytesIO(b"irrelevant")
    if override in registered:
        parser, result = d.get_parser(file, "f.csv", source_override=override)
        assert parser.source_system == override
        assert result.source_system == override
        assert result.confidence == 1.0
        assert result.indicators == ["Manual override"]
    else:
        with pytest.raises(ValueError):
            d.get_parser(file, "f.csv", source_override=override)


@STRESS
@given(
    detected=st.sampled_from(_SOURCES),
    registered=st.lists(st.sampled_from(_SOURCES), min_size=0, max_size=5, unique=True),
)
def test_autodetect_fallback_and_failclosed(detected, registered):
    d = IngestionDispatcher()
    for s in registered:
        d.register(_make_parser(s))

    fp = FingerprintResult(detected, 0.85, ["token"])
    file = io.BytesIO(b"some,csv,bytes\n1,2,3\n")

    with patch.object(dispatcher_mod, "fingerprint_file", return_value=fp):
        if detected in registered:
            parser, result = d.get_parser(file, "f.csv")
            assert parser.source_system == detected
            assert result is fp
        elif "generic" in registered:
            parser, result = d.get_parser(file, "f.csv")
            assert parser.source_system == "generic"
            # Detection result is passed through unchanged on fallback.
            assert result is fp
        else:
            with pytest.raises(ValueError):
                d.get_parser(file, "f.csv")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
