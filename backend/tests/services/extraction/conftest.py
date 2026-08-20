"""Shared fixtures and markers for real-world extraction e2e tests."""

from __future__ import annotations

import os
from html.parser import HTMLParser
from pathlib import Path

import pytest

REAL_WORLD_FIXTURES_DIR = (
    Path(__file__).parent.parent.parent / "fixtures" / "real-world"
)

_has_openrouter = bool(os.getenv("OPENROUTER_API_KEY"))

requires_llm_api = pytest.mark.skipif(
    not _has_openrouter,
    reason="OPENROUTER_API_KEY not set",
)


class HTMLTextExtractor(HTMLParser):
    """Strip HTML tags and return plain text."""

    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self._skip = False
        if tag in ("p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6"):
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self._parts.append(data)


def extract_text_from_html(path: Path) -> str:
    """Extract plain text from an HTML lease document."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    parser = HTMLTextExtractor()
    parser.feed(raw)
    text = "".join(parser._parts)
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def coerce_llm_output(raw: dict) -> None:
    """Coerce common LLM JSON quirks to match Pydantic schema."""
    if raw.get("admin_fee_percentage") is None:
        raw["admin_fee_percentage"] = "0"

    # pro_rata_share is a required Decimal — coerce null to "0" (sentinel for "not found")
    if raw.get("pro_rata_share") is None:
        raw["pro_rata_share"] = "0"

    for ext in raw.get("extractions", []):
        if ext.get("value") is None:
            ext["value"] = "null"
        elif not isinstance(ext["value"], str):
            ext["value"] = str(ext["value"])
        # source_text has min_length=1; replace empty strings with a placeholder
        if not ext.get("source_text"):
            ext["source_text"] = "Not explicitly stated in document."


def extract_text_from_pdf(path: Path) -> str:
    """Extract plain text from a PDF lease document using PyPDF2."""
    from PyPDF2 import PdfReader

    reader = PdfReader(str(path))
    pages = []
    for i, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        pages.append(f"--- PAGE {i} ---\n{text}")
    return "\n\n".join(pages)


async def call_llm(document_text: str, prompt: str) -> tuple[str, int]:
    """Call real LLM via OpenRouter."""
    from app.services.extraction.openrouter_client import OpenRouterClient

    client = OpenRouterClient()
    return await client.extract(
        prompt=prompt,
        document_text=document_text,
        model="google/gemini-3.1-flash-lite",
        temperature=0.0,
    )
