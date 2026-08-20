"""Property-based stress for the OCR result parser.

``OCRResultParser.parse`` turns raw OCR/model block dicts into a structured
``ParsedDocument``. The block payloads are untrusted (a flaky OCR engine or a
model can emit a non-numeric, NaN, or out-of-range Confidence, or a bad Page),
and a single malformed block must not abort the whole document — the parser's
design already guards two code paths, and this harness proves the rest hold too
(regression guard for FINDING-S21).

Invariants:
  * **never crashes**: parsing any list of arbitrary-shaped block dicts returns a
    ParsedDocument and never raises (the document import depends on this);
  * **kept blocks are valid**: every retained LINE/WORD has a finite confidence
    in [min_confidence, 100] and a page ≥ 1;
  * **block accounting**: total_blocks always equals the number of input blocks;
  * **valid high-confidence lines survive**: a well-formed LINE above threshold
    is parsed and its text preserved (the parser doesn't over-filter).

Run standalone:
    pytest tests/stress/test_ocr_result_parser_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.extraction.result_parser import OCRResultParser

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Adversarial scalar values for Confidence / Page fields.
weird_numbers = st.one_of(
    st.floats(allow_nan=False, allow_infinity=False, min_value=-50, max_value=200),
    st.integers(min_value=-10, max_value=200),
    st.sampled_from(["NaN", "Infinity", "-Infinity", "abc", "", "80.5"]),
    st.none(),
)
weird_pages = st.one_of(
    st.integers(min_value=-5, max_value=5),
    st.sampled_from(["x", "1", None, 1.5]),
)
coords = st.one_of(
    st.floats(allow_nan=False, allow_infinity=False, min_value=-1, max_value=2),
    st.sampled_from(["NaN", "abc", 0.5]),
)


@st.composite
def geometry(draw: st.DrawFn):
    if draw(st.booleans()):
        return {}  # missing geometry → bbox None path
    return {
        "BoundingBox": {
            "Left": draw(coords),
            "Top": draw(coords),
            "Width": draw(coords),
            "Height": draw(coords),
        }
    }


@st.composite
def block(draw: st.DrawFn):
    bt = draw(
        st.sampled_from(
            ["PAGE", "LINE", "WORD", "KEY_VALUE_SET", "CELL", "TABLE", "JUNK", ""]
        )
    )
    b = {
        "BlockType": bt,
        "Id": draw(st.text(max_size=6)),
        "Confidence": draw(weird_numbers),
        "Text": draw(st.text(max_size=10)),
        "Page": draw(weird_pages),
        "Geometry": draw(geometry()),
    }
    if bt == "KEY_VALUE_SET":
        b["EntityTypes"] = draw(st.lists(st.sampled_from(["KEY", "VALUE"]), max_size=2))
        b["Relationships"] = []
    return b


@STRESS
@given(blocks=st.lists(block(), max_size=12), min_conf=st.integers(0, 100))
def test_parse_never_crashes_and_accounts_all_blocks(blocks, min_conf):
    parser = OCRResultParser(min_confidence=Decimal(min_conf))
    doc = parser.parse(blocks)  # must not raise

    assert doc.total_blocks == len(blocks)
    for tb in [*doc.lines, *doc.words]:
        assert Decimal(0) <= tb.confidence <= Decimal(100)
        assert tb.confidence >= parser.min_confidence
        assert tb.page >= 1


@STRESS
@given(text=st.text(max_size=20), conf=st.integers(80, 100))
def test_valid_high_confidence_line_survives(text, conf):
    parser = OCRResultParser(min_confidence=Decimal("80"))
    blocks = [
        {
            "BlockType": "LINE",
            "Id": "abc",
            "Confidence": conf,
            "Text": text,
            "Page": 1,
            "Geometry": {
                "BoundingBox": {"Left": 0, "Top": 0, "Width": 0.5, "Height": 0.1}
            },
        }
    ]
    doc = parser.parse(blocks)
    assert len(doc.lines) == 1
    assert doc.lines[0].text == text


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
