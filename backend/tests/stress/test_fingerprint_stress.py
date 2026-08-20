"""Property-based invariants for ingestion source-system fingerprinting.

``ingestion/fingerprint.py`` auto-routes an uploaded export to the right parser by
reading the first 4KB and scoring it against weighted Yardi/MRI pattern tables, with
a filename-hint bonus and a generic fallback. Misrouting a file (or crashing on
adversarial bytes) breaks ingestion silently, so the detector must be robust and
deterministic on ANY input.

Invariants pinned here:

  * **Total & deterministic** — never raises on arbitrary bytes/filenames, and the
    same input always yields the same result (no hidden state, byte-stable).
  * **Well-formed output** — source_system is always one of {yardi, mri, generic},
    confidence is always in [0.0, 1.0] (the weight sum is capped), indicators is a
    list.
  * **Stream is rewound** — the file is seeked back to position 0 so the downstream
    parser reads from the start.
  * **Definitive vendor token wins** — a header carrying a 0.9 vendor trademark
    ("Yardi Voyager" / "MRI Software") clears the 0.5 threshold and selects that
    system.
  * **Filename hint surfaces a weak match** — a pattern-free file whose name contains
    the vendor still routes to that ERP (below-threshold), not to generic.
  * **No-signal -> generic** — a pattern-free header with a neutral name falls back to
    generic.

Also covers ``detect_delimiter``: the chosen delimiter maximizes its occurrence count
among the four candidates and is always one of them.

Run standalone:
    pytest tests/stress/test_fingerprint_stress.py -q
"""

from __future__ import annotations

from io import BytesIO

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.ingestion.fingerprint import (
    CONFIDENCE_THRESHOLD,
    detect_delimiter,
    fingerprint_file,
)

STRESS = settings(max_examples=300, deadline=None)

_VALID_SYSTEMS = {"yardi", "mri", "generic"}
_DELIMS = [",", "\t", ";", "|"]

# Neutral filenames carry no vendor substring, so only content drives detection.
_neutral_names = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789_-.", min_size=1, max_size=20
).filter(lambda s: "yardi" not in s.lower() and "mri" not in s.lower())


@STRESS
@given(content=st.binary(min_size=0, max_size=6000), name=st.text(max_size=40))
def test_fingerprint_total_deterministic_and_wellformed(content, name):
    """Never raises, output is well-formed, the stream is rewound, and a re-run on
    the same input is byte-identical."""
    f = BytesIO(content)
    r1 = fingerprint_file(f, name)
    # Stream rewound for the downstream parser.
    assert f.tell() == 0

    assert r1.source_system in _VALID_SYSTEMS
    assert 0.0 <= r1.confidence <= 1.0
    assert isinstance(r1.indicators, list)

    # Deterministic: identical input -> identical result.
    r2 = fingerprint_file(BytesIO(content), name)
    assert r2 == r1


@STRESS
@given(
    prefix=st.binary(min_size=0, max_size=200),
    suffix=st.binary(min_size=0, max_size=200),
    name=_neutral_names,
    vendor=st.sampled_from([(b"Yardi Voyager", "yardi"), (b"MRI Software", "mri")]),
)
def test_definitive_vendor_token_selects_system(prefix, suffix, name, vendor):
    """A 0.9 vendor trademark anywhere in the first 4KB clears the threshold and
    selects that system, regardless of surrounding bytes or a neutral filename."""
    token, expected = vendor
    content = prefix + b"\n" + token + b"\n" + suffix
    r = fingerprint_file(BytesIO(content), name + ".csv")
    assert r.source_system == expected
    assert r.confidence >= CONFIDENCE_THRESHOLD


@given(name=_neutral_names)
@settings(max_examples=50, deadline=None)
def test_no_signal_falls_back_to_generic(name):
    """A header with no ERP pattern and a neutral filename falls back to generic at
    full confidence (1.0 - 0 best match)."""
    r = fingerprint_file(BytesIO(b"col_a,col_b,col_c\n1,2,3\n"), name + ".csv")
    assert r.source_system == "generic"
    assert r.confidence == pytest.approx(1.0)


def test_filename_hint_routes_pattern_free_file_anchor():
    """A pattern-free file whose NAME carries the vendor still routes to that ERP
    (below threshold), never to generic — the filename bonus surfaces a weak match."""
    plain = b"a,b,c\n1,2,3\n"
    yard = fingerprint_file(BytesIO(plain), "export_YARDI_2024.csv")
    assert yard.source_system == "yardi"
    assert "filename:yardi" in yard.indicators
    assert yard.confidence < CONFIDENCE_THRESHOLD  # hint alone (0.3) is below 0.5

    mri = fingerprint_file(BytesIO(plain), "MRI_dump.csv")
    assert mri.source_system == "mri"
    assert "filename:mri" in mri.indicators


@STRESS
@given(
    rows=st.lists(
        st.lists(st.sampled_from(_DELIMS + ["x", "y"]), min_size=0, max_size=20),
        min_size=0,
        max_size=6,
    )
)
def test_detect_delimiter_picks_the_most_frequent(rows):
    """The detected delimiter is one of the four candidates and has an occurrence
    count (over the first 5 lines) >= every other candidate's."""
    text = "\n".join("".join(r) for r in rows)
    f = BytesIO(text.encode("utf-8"))
    chosen = detect_delimiter(f)
    assert f.tell() == 0
    assert chosen in _DELIMS

    sampled = text.split("\n")[:5]
    counts = {d: sum(line.count(d) for line in sampled) for d in _DELIMS}
    assert counts[chosen] == max(counts.values())


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
