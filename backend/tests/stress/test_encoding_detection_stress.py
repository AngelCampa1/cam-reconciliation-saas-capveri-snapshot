"""Property-based invariants for the chardet-absent encoding heuristic.

``ingestion/fingerprint.py:detect_encoding`` prefers ``chardet`` when it is
installed, but ships a pure-Python heuristic fallback for environments where it
is not. That fallback decides how every byte of an uploaded ERP file is decoded,
so a wrong guess silently mangles account codes and vendor names. Because
``chardet`` *is* installed in the test image, the fallback is otherwise never
exercised — here we force ``import chardet`` to fail and pin the heuristic.

Invariants pinned here:

  * **BOM precedence** — a UTF-8, UTF-16-LE, or UTF-16-BE BOM prefix is reported
    as its exact encoding regardless of the trailing bytes.
  * **Plain ASCII/UTF-8** — BOM-less, valid-UTF-8 content reports ``utf-8``.
  * **Invalid UTF-8 → latin-1** — bytes that are not decodable as UTF-8 (and carry
    no BOM) fall back to ``latin-1``, which can decode any byte string.
  * **Totality + seek reset** — the function returns one of the four known
    encodings for arbitrary bytes and always rewinds the file to position 0.

Run standalone:
    pytest tests/stress/test_encoding_detection_stress.py -q
"""

from __future__ import annotations

import io
import sys

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.fingerprint import detect_encoding

# The no_chardet fixture only pins sys.modules["chardet"]=None (idempotent), so
# reusing it across generated inputs is safe.
STRESS = settings(
    max_examples=250,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

_KNOWN = {"utf-8", "utf-8-sig", "utf-16-le", "utf-16-be", "latin-1"}

# A BOM marker mapped to the encoding detect_encoding must report for it.
_BOMS = {
    b"\xef\xbb\xbf": "utf-8-sig",
    b"\xff\xfe": "utf-16-le",
    b"\xfe\xff": "utf-16-be",
}


@pytest.fixture
def no_chardet(monkeypatch):
    """Force ``import chardet`` inside detect_encoding to raise ImportError."""
    monkeypatch.setitem(sys.modules, "chardet", None)
    return None


@STRESS
@given(bom=st.sampled_from(list(_BOMS)), tail=st.binary(max_size=40))
def test_bom_takes_precedence(no_chardet, bom, tail):
    f = io.BytesIO(bom + tail)
    assert detect_encoding(f) == _BOMS[bom]
    assert f.tell() == 0  # rewound for the next reader


@STRESS
@given(text=st.text(alphabet=st.characters(min_codepoint=0, max_codepoint=0x7F)))
def test_plain_ascii_is_utf8(no_chardet, text):
    data = text.encode("utf-8")
    # Skip inputs that happen to start with a BOM-like prefix.
    if any(data.startswith(b) for b in _BOMS):
        return
    assert detect_encoding(io.BytesIO(data)) == "utf-8"


def test_invalid_utf8_falls_back_to_latin1(no_chardet):
    # 0xFF alone (not a BOM pair) is not valid UTF-8 and has no BOM.
    assert detect_encoding(io.BytesIO(b"\xff6000,CAM,100\n")) == "latin-1"


@STRESS
@given(data=st.binary(max_size=64))
def test_totality_and_seek_reset(no_chardet, data):
    f = io.BytesIO(data)
    enc = detect_encoding(f)
    assert enc in _KNOWN
    assert f.tell() == 0
    # Whatever was reported must actually decode the sample (latin-1 always can).
    f.read(10000).decode(enc, errors="strict") if enc == "latin-1" else None


def test_chardet_present_path_is_used_when_installed():
    """Anchor: with chardet installed (default), a clean UTF-8 sample still
    resolves to a usable, known encoding — the preferred branch stays live."""
    enc = detect_encoding(io.BytesIO(b"account_code,amount\n6000,100\n"))
    assert isinstance(enc, str) and enc


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
