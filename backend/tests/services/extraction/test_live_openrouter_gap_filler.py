"""Live OpenRouter check for the extraction gap-filler.

The unit tests cover gap-filler control flow with a mocked reader. This test
pins the real native-PDF provider behavior for missing critical fields. It
is skipped unless explicitly enabled because it spends a real OpenRouter call.

Run standalone:
    RUN_OPENROUTER_LIVE_TEST=1 pytest \
        tests/services/extraction/test_live_openrouter_gap_filler.py -q -s
"""

from __future__ import annotations

import os
from decimal import Decimal
from io import BytesIO

import pytest
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.config import settings
from app.services.extraction.gap_filler import fill_fields
from app.services.extraction.openrouter_client import OpenRouterClient

pytestmark = [
    pytest.mark.skipif(
        os.getenv("RUN_OPENROUTER_LIVE_TEST") != "1",
        reason="set RUN_OPENROUTER_LIVE_TEST=1 to spend real OpenRouter calls",
    ),
    pytest.mark.skipif(
        not settings.openrouter_api_key,
        reason="OPENROUTER_API_KEY is not configured",
    ),
]


def _make_gap_filler_pdf() -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    text = pdf.beginText(72, 720)
    text.textLine("Commercial Lease - Operating Expense Recovery Addendum")
    text.textLine("")
    text.textLine("Tenant's proportionate share of operating expenses is 4.25 percent.")
    text.textLine("The tenant leases 17,000 rentable square feet in the project.")
    text.textLine(
        "Controllable operating expenses shall be subject to a non-cumulative"
    )
    text.textLine(
        "expense cap and shall not increase by more than five percent per year."
    )
    text.textLine("The 2024 calendar year is the base year for this lease.")
    text.textLine(
        "The operating expense stop amount for the base year is $12.75 per RSF."
    )
    pdf.drawText(text)
    pdf.save()
    return buffer.getvalue()


def _as_decimal(value: object) -> Decimal:
    return Decimal(str(value))


@pytest.mark.asyncio
async def test_live_openrouter_gap_filler_extracts_missing_critical_fields() -> None:
    merged: dict[str, object] = {
        "pro_rata_share": None,
        "cap_type": None,
        "cap_rate": None,
        "base_year": None,
        "base_year_amount": None,
    }

    result, tokens = await fill_fields(
        OpenRouterClient(),
        _make_gap_filler_pdf(),
        "gap-filler-critical-fields.pdf",
        [
            "pro_rata_share",
            "cap_type",
            "cap_rate",
            "base_year",
            "base_year_amount",
        ],
        merged,
    )

    assert tokens > 0
    assert _as_decimal(result["pro_rata_share"]) == Decimal("0.0425")
    assert result["cap_type"] == "non_cumulative"
    assert _as_decimal(result["cap_rate"]) == Decimal("0.05")
    assert result["base_year"] == 2024
    assert _as_decimal(result["base_year_amount"]) == Decimal("12.75")
