"""Tests for JSON utilities (extract_json, coerce_llm_output, truncate_document)."""

import pytest

from app.services.extraction.json_utils import (
    coerce_llm_output,
    extract_json,
    prioritize_lease_excerpts,
    strip_thinking_tags,
    truncate_document,
)


class TestStripThinkingTags:
    def test_strips_leading_think_block(self) -> None:
        text = "<think>internal reasoning</think>actual content"
        assert strip_thinking_tags(text) == "actual content"

    def test_no_think_block_unchanged(self) -> None:
        assert strip_thinking_tags("plain text") == "plain text"

    def test_only_strips_leading_block(self) -> None:
        text = "<think>first</think>content<think>later</think>"
        result = strip_thinking_tags(text)
        assert result.startswith("content")
        assert "<think>later</think>" in result


class TestExtractJson:
    def test_empty_text_raises(self) -> None:
        with pytest.raises(ValueError, match="Empty response text"):
            extract_json("")

    def test_whitespace_only_raises(self) -> None:
        with pytest.raises(ValueError):
            extract_json("   ")

    def test_valid_json_object_direct(self) -> None:
        result = extract_json('{"cap_rate": "0.05"}')
        assert result == {"cap_rate": "0.05"}

    def test_code_fence_json_extracted(self) -> None:
        text = '```json\n{"base_year": 2020}\n```'
        result = extract_json(text)
        assert result == {"base_year": 2020}

    def test_plain_code_fence_extracted(self) -> None:
        text = '```\n{"pro_rata_share": "0.1"}\n```'
        result = extract_json(text)
        assert result == {"pro_rata_share": "0.1"}

    def test_brute_force_extraction_from_prose(self) -> None:
        text = 'The answer is: {"cap_rate": "0.03"} as stated in the lease.'
        result = extract_json(text)
        assert result == {"cap_rate": "0.03"}

    def test_raises_when_no_json(self) -> None:
        with pytest.raises(ValueError, match="Could not extract JSON"):
            extract_json("No JSON here at all")

    def test_non_dict_json_falls_through_to_next_strategy(self) -> None:
        """Direct parse returns a list → falls through to brute-force search."""
        text = '[1, 2, 3] {"cap_rate": "0.05"}'
        result = extract_json(text)
        # Brute force finds the dict portion
        assert result == {"cap_rate": "0.05"}

    def test_think_tags_stripped_before_parse(self) -> None:
        text = '<think>skip me</think>  {"base_year": 2021}'
        result = extract_json(text)
        assert result == {"base_year": 2021}

    def test_code_fence_with_invalid_json_falls_through(self) -> None:
        """Code fence has bad JSON but brute-force finds a valid object later."""
        text = '```json\nnot valid\n``` {"cap_rate": "0.05"}'
        result = extract_json(text)
        assert result == {"cap_rate": "0.05"}


class TestCoerceLlmOutput:
    def test_sets_admin_fee_when_none(self) -> None:
        raw: dict = {"admin_fee_percentage": None}
        coerce_llm_output(raw)
        assert raw["admin_fee_percentage"] == "0"

    def test_leaves_admin_fee_when_set(self) -> None:
        raw: dict = {"admin_fee_percentage": "0.15"}
        coerce_llm_output(raw)
        assert raw["admin_fee_percentage"] == "0.15"

    def test_sets_pro_rata_share_when_none(self) -> None:
        raw: dict = {"pro_rata_share": None}
        coerce_llm_output(raw)
        assert raw["pro_rata_share"] == "0"

    def test_coerces_null_extraction_value(self) -> None:
        raw: dict = {"extractions": [{"value": None, "source_text": "text"}]}
        coerce_llm_output(raw)
        assert raw["extractions"][0]["value"] == "null"

    def test_coerces_non_string_extraction_value(self) -> None:
        raw: dict = {"extractions": [{"value": 2020, "source_text": "text"}]}
        coerce_llm_output(raw)
        assert raw["extractions"][0]["value"] == "2020"

    def test_fills_empty_source_text(self) -> None:
        raw: dict = {"extractions": [{"value": "0.05", "source_text": ""}]}
        coerce_llm_output(raw)
        assert (
            raw["extractions"][0]["source_text"] == "Not explicitly stated in document."
        )

    def test_fills_missing_source_text(self) -> None:
        raw: dict = {"extractions": [{"value": "0.05"}]}
        coerce_llm_output(raw)
        assert (
            raw["extractions"][0]["source_text"] == "Not explicitly stated in document."
        )

    def test_no_extractions_key_is_noop(self) -> None:
        raw: dict = {"cap_rate": "0.05"}
        coerce_llm_output(raw)  # should not raise
        assert raw["cap_rate"] == "0.05"

    def test_management_fee_null_is_not_coerced_to_zero(self) -> None:
        """NULL management_fee means 'no cap found' — must NOT become "0"."""
        raw: dict = {"management_fee_percentage": None}
        coerce_llm_output(raw)
        # Unlike admin_fee, a null management fee stays null (semantically distinct).
        assert raw["management_fee_percentage"] is None

    def test_management_fee_value_preserved(self) -> None:
        """A present management_fee value is left untouched."""
        raw: dict = {"management_fee_percentage": "0.04"}
        coerce_llm_output(raw)
        assert raw["management_fee_percentage"] == "0.04"


class TestTruncateDocument:
    def test_short_text_unchanged(self) -> None:
        text = "short text"
        assert truncate_document(text, max_chars=100) == text

    def test_long_text_truncated(self) -> None:
        text = "x" * 200
        result = truncate_document(text, max_chars=100)
        assert len(result) < 200
        assert "truncated" in result.lower()

    def test_truncates_at_page_boundary_when_possible(self) -> None:
        # Build a text where a page marker falls in the last 20% of max_chars
        page_marker = "--- PAGE 2 ---\n"
        pre = "a" * 85  # 85 chars, marker starts at 85
        rest = "b" * 50  # Total > 100
        text = pre + page_marker + rest
        result = truncate_document(text, max_chars=100)
        # Should cut at the page marker boundary
        assert "--- PAGE 2" not in result
        assert "truncated" in result.lower()


class TestPrioritizeLeaseExcerpts:
    def test_prepends_late_admin_fee_excerpt_before_truncation(self) -> None:
        text = (
            "Opening lease text. "
            + "x" * 1_000
            + "The Common Area Maintenance billed may include an "
            "administrative fee equal to ten percent of Common Area costs."
        )

        result = prioritize_lease_excerpts(text, max_chars=500)

        assert result.startswith("[High-signal lease recovery excerpts")
        assert "administrative fee equal to ten percent" in result
        assert "Opening lease text" in result
        assert "truncated" in result.lower()

    def test_uses_normal_truncation_without_matching_lease_terms(self) -> None:
        text = "x" * 1_000

        result = prioritize_lease_excerpts(text, max_chars=500)

        assert result == truncate_document(text, max_chars=500)
