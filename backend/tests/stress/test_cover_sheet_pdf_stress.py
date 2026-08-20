"""Property-based stress for the tax-protest cover-sheet PDF generator.

BUG CLASS (FINDING-S15, twin of FINDING-S09)
--------------------------------------------
``TaxProtestCoverSheetGenerator`` (``app/services/tax_protest/
cover_sheet_generator.py``) interpolates user-derived strings into ReportLab
``Paragraph`` markup. ReportLab's paraparser CRASHES with ``ValueError`` on
unbalanced ``<``/``>`` markup, so a county name like ``Tra<vis`` or a free-text
note like ``See <b>bold`` (entered by the user / imported from a CSV) crashed
the whole cover-sheet export. The Paragraph-bound fields are the header subtitle
(``county``, ``state``) and the optional ``Note:`` line (``notes``). The fix
escapes those values with ``xml.sax.saxutils.escape``.

The Table cells (``property_name``, ``property_address``) are NOT affected —
ReportLab does not XML-parse table-cell strings — so they are deliberately not
escaped and not asserted here.

Invariant: for ANY county / state / notes text, ``generate()`` never raises and
always returns a real PDF (``%PDF`` magic bytes).

Run standalone:
    pytest tests/stress/test_cover_sheet_pdf_stress.py -q
"""

from __future__ import annotations

from datetime import date

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.tax_protest.cover_sheet_generator import (
    CoverSheetData,
    TaxProtestCoverSheetGenerator,
)

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Text rich in the markup characters that crash ReportLab's paraparser, plus
# benign and multibyte content.
_FRAGMENTS = list("abc 012<>&/") + [
    "<b>",
    "</b>",
    "<unclosed",
    "Tom <Jerry",
    "AT&T",
    ">stray",
    "<<>>",
    "Café",
    "大厦",
    "",
]
adversarial_text = st.lists(st.sampled_from(_FRAGMENTS), min_size=0, max_size=8).map(
    "".join
)


@STRESS
@given(
    county=adversarial_text,
    state=adversarial_text,
    notes=adversarial_text,
)
def test_cover_sheet_survives_adversarial_text(county, state, notes):
    data = CoverSheetData(
        property_name="Tower",
        property_address="1 Main St",
        county=county,
        state=state,
        effective_deadline=date(2024, 5, 15),
        days_remaining=10,
        notes=notes,
        tax_year=2024,
    )
    buf = TaxProtestCoverSheetGenerator(data).generate()
    assert buf.getvalue().startswith(b"%PDF"), "expected a real PDF"


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
