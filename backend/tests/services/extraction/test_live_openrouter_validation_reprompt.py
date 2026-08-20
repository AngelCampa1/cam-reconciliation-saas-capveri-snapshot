"""Live OpenRouter check for validation re-prompt repair.

The unit tests cover validation re-prompt control flow with a mocked reader.
This test pins the real native-PDF provider behavior for a business-rule
inconsistency after merge/gap-fill. It is skipped unless explicitly enabled
because it spends a real OpenRouter call.

Run standalone:
    RUN_OPENROUTER_LIVE_TEST=1 pytest \
        tests/services/extraction/test_live_openrouter_validation_reprompt.py -q -s
"""

from __future__ import annotations

import os
from decimal import Decimal
from io import BytesIO

import pytest
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.config import settings
from app.services.extraction.openrouter_client import OpenRouterClient
from app.services.extraction.validation_reprompt import reprompt_invalid_fields

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


def _make_non_cumulative_reprompt_pdf() -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    text = pdf.beginText(72, 720)
    text.textLine("Commercial Lease - Expense Cap Exhibit")
    text.textLine("")
    text.textLine("Tenant's proportionate share is 4.25 percent.")
    text.textLine("For each calendar year after the 2024 base year, controllable")
    text.textLine("operating expenses shall be subject to a non-cumulative cap.")
    text.textLine("The annual increase shall not exceed five percent.")
    text.textLine("This exhibit does not create a cumulative cap bank.")
    pdf.drawText(text)
    pdf.save()
    return buffer.getvalue()


def _make_cumulative_reprompt_pdf() -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    text = pdf.beginText(72, 720)
    text.textLine("Commercial Lease - Cumulative Cap Exhibit")
    text.textLine("")
    text.textLine("Tenant's proportionate share is 4.25 percent.")
    text.textLine("For each lease year after the 2024 base year, controllable")
    text.textLine("operating expenses shall be subject to a cumulative cap.")
    text.textLine("Unused cap capacity carries forward to later lease years.")
    text.textLine("The cumulative cap shall be six percent per year.")
    pdf.drawText(text)
    pdf.save()
    return buffer.getvalue()


def _as_decimal(value: object) -> Decimal:
    return Decimal(str(value))


@pytest.mark.asyncio
async def test_live_openrouter_validation_reprompt_reconciles_cap_pair() -> None:
    merged: dict[str, object] = {
        "pro_rata_share": "0.0425",
        "cap_type": "none",
        "cap_rate": "0.05",
        "base_year": 2024,
        "extractions": [
            {
                "field": "pro_rata_share",
                "value": "0.0425",
                "confidence": 95,
                "source_text": "Tenant's proportionate share is 4.25 percent.",
            },
            {
                "field": "cap_rate",
                "value": "0.05",
                "confidence": 88,
                "source_text": "The annual increase shall not exceed five percent.",
            },
        ],
    }

    result, tokens = await reprompt_invalid_fields(
        OpenRouterClient(),
        _make_non_cumulative_reprompt_pdf(),
        "validation-reprompt-cap-pair.pdf",
        merged,
        max_attempts=2,
    )

    assert tokens > 0
    assert result["pro_rata_share"] == "0.0425"
    assert result["base_year"] == 2024
    assert result["cap_type"] == "non_cumulative"
    assert _as_decimal(result["cap_rate"]) == Decimal("0.05")
    assert result["extractions"] == merged["extractions"]


@pytest.mark.asyncio
async def test_live_openrouter_validation_reprompt_fills_missing_cap_rate() -> None:
    merged: dict[str, object] = {
        "pro_rata_share": "0.0425",
        "cap_type": "cumulative",
        "cap_rate": None,
        "base_year": 2024,
        "extractions": [
            {
                "field": "pro_rata_share",
                "value": "0.0425",
                "confidence": 95,
                "source_text": "Tenant's proportionate share is 4.25 percent.",
            },
            {
                "field": "cap_type",
                "value": "cumulative",
                "confidence": 88,
                "source_text": "operating expenses shall be subject to a cumulative cap.",
            },
        ],
    }

    result, tokens = await reprompt_invalid_fields(
        OpenRouterClient(),
        _make_cumulative_reprompt_pdf(),
        "validation-reprompt-missing-cap-rate.pdf",
        merged,
        max_attempts=2,
    )

    assert tokens > 0
    assert result["pro_rata_share"] == "0.0425"
    assert result["base_year"] == 2024
    assert result["cap_type"] == "cumulative"
    assert _as_decimal(result["cap_rate"]) == Decimal("0.06")
    assert result["extractions"] == merged["extractions"]
