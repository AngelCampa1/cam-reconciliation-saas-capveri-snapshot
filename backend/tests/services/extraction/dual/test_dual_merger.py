"""Tests for dual-extract merger module."""

from app.services.extraction.dual.dual_merger import merge_dual_extractions
from app.services.extraction.dual.dual_models import (
    FieldVerdict,
    JudgeResult,
    JudgeVerdict,
)


def _make_judge(
    field: str, verdict: JudgeVerdict, chosen_value: object = None
) -> JudgeResult:
    return JudgeResult(
        verdicts=[
            FieldVerdict(
                field=field, verdict=verdict, chosen_value=chosen_value, rationale=""
            )
        ]
    )


class TestMergeDualExtractions:
    def test_agreement_uses_primary_value(self) -> None:
        primary = {"cap_rate": "0.05", "base_year": 2020}
        sibling = {"cap_rate": "0.05", "base_year": 2020}
        merged = merge_dual_extractions(primary, sibling, JudgeResult())
        assert merged["cap_rate"] == "0.05"
        assert merged["base_year"] == 2020

    def test_sibling_wins_applies_sibling_value(self) -> None:
        primary = {"cap_rate": "0.05"}
        sibling = {"cap_rate": "0.06"}
        judge = _make_judge("cap_rate", JudgeVerdict.SIBLING_WINS, "0.06")
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["cap_rate"] == "0.06"

    def test_primary_wins_applies_primary_value(self) -> None:
        primary = {"cap_rate": "0.05"}
        sibling = {"cap_rate": "0.06"}
        judge = _make_judge("cap_rate", JudgeVerdict.PRIMARY_WINS, "0.05")
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["cap_rate"] == "0.05"

    def test_trust_neither_falls_back_to_primary(self) -> None:
        primary = {"cap_rate": "0.05"}
        sibling = {"cap_rate": "0.06"}
        judge = _make_judge("cap_rate", JudgeVerdict.TRUST_NEITHER)
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["cap_rate"] == "0.05"

    def test_missing_verdict_falls_back_to_primary(self) -> None:
        primary = {"cap_rate": "0.05"}
        sibling = {"cap_rate": "0.06"}
        # JudgeResult with verdict for a different field
        judge = _make_judge("base_year", JudgeVerdict.SIBLING_WINS)
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["cap_rate"] == "0.05"

    def test_key_only_in_sibling_uses_sibling_value(self) -> None:
        primary = {"cap_rate": "0.05"}
        sibling = {"cap_rate": "0.05", "base_year": 2019}
        merged = merge_dual_extractions(primary, sibling, JudgeResult())
        assert merged["base_year"] == 2019

    def test_key_only_in_primary_uses_primary_value(self) -> None:
        primary = {"cap_rate": "0.05", "base_year": 2019}
        sibling = {"cap_rate": "0.05"}
        merged = merge_dual_extractions(primary, sibling, JudgeResult())
        assert merged["base_year"] == 2019

    def test_extractions_key_always_from_primary(self) -> None:
        primary = {"extractions": [{"field": "cap_rate", "value": "0.05"}]}
        sibling = {"extractions": [{"field": "cap_rate", "value": "0.06"}]}
        merged = merge_dual_extractions(primary, sibling, JudgeResult())
        assert merged["extractions"] == primary["extractions"]

    def test_extractions_key_from_primary_when_sibling_has_none(self) -> None:
        primary = {"extractions": [{"field": "cap_rate", "value": "0.05"}]}
        sibling = {}
        merged = merge_dual_extractions(primary, sibling, JudgeResult())
        assert merged["extractions"] == primary["extractions"]

    def test_nested_dict_sibling_wins_via_dotted_key(self) -> None:
        primary = {"meta": {"source": "a", "version": 1}}
        sibling = {"meta": {"source": "b", "version": 1}}
        judge = _make_judge("meta.source", JudgeVerdict.SIBLING_WINS)
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["meta"]["source"] == "b"
        assert merged["meta"]["version"] == 1

    def test_nested_dict_agreement_passes_through(self) -> None:
        primary = {"meta": {"source": "a", "version": 1}}
        sibling = {"meta": {"source": "a", "version": 1}}
        merged = merge_dual_extractions(primary, sibling, JudgeResult())
        assert merged["meta"] == {"source": "a", "version": 1}

    def test_does_not_mutate_inputs(self) -> None:
        primary = {"cap_rate": "0.05"}
        sibling = {"cap_rate": "0.06"}
        primary_copy = dict(primary)
        sibling_copy = dict(sibling)
        merge_dual_extractions(primary, sibling, JudgeResult())
        assert primary == primary_copy
        assert sibling == sibling_copy

    def test_nested_key_only_in_sibling_uses_sibling(self) -> None:
        primary = {"meta": {"source": "a"}}
        sibling = {"meta": {"source": "a", "extra": "x"}}
        merged = merge_dual_extractions(primary, sibling, JudgeResult())
        assert merged["meta"]["extra"] == "x"

    def test_nested_key_only_in_primary_uses_primary(self) -> None:
        primary = {"meta": {"source": "a", "extra": "x"}}
        sibling = {"meta": {"source": "a"}}
        merged = merge_dual_extractions(primary, sibling, JudgeResult())
        assert merged["meta"]["extra"] == "x"

    def test_nested_disagreement_with_no_sibling_wins_falls_back_to_primary(
        self,
    ) -> None:
        primary = {"meta": {"source": "a"}}
        sibling = {"meta": {"source": "b"}}
        # No judge verdict → falls back to primary
        merged = merge_dual_extractions(primary, sibling, JudgeResult())
        assert merged["meta"]["source"] == "a"

    def test_triple_nested_dict_sibling_wins(self) -> None:
        primary = {"outer": {"inner": {"deep": "x"}}}
        sibling = {"outer": {"inner": {"deep": "y"}}}
        judge = _make_judge("outer.inner.deep", JudgeVerdict.SIBLING_WINS)
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["outer"]["inner"]["deep"] == "y"

    def test_sibling_wins_uses_chosen_value_when_normalised(self) -> None:
        """chosen_value from judge overrides raw sibling_val when not None."""
        primary = {"cap_rate": "5%"}
        sibling = {"cap_rate": "0.05000"}
        # Judge normalises to the canonical form
        judge = _make_judge("cap_rate", JudgeVerdict.SIBLING_WINS, "0.05")
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["cap_rate"] == "0.05"  # judge's normalised form, not raw sibling

    def test_primary_wins_uses_chosen_value_when_normalised(self) -> None:
        """chosen_value from judge overrides raw primary_val when not None."""
        primary = {"base_year": "2020.0"}
        sibling = {"base_year": "2021"}
        judge = _make_judge("base_year", JudgeVerdict.PRIMARY_WINS, 2020)
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["base_year"] == 2020  # judge's normalised form, not raw primary

    def test_nested_primary_wins_uses_correct_value(self) -> None:
        """Nested PRIMARY_WINS verdict returns primary value (or chosen_value if set)."""
        primary = {"meta": {"source": "lease"}}
        sibling = {"meta": {"source": "amendment"}}
        judge = _make_judge("meta.source", JudgeVerdict.PRIMARY_WINS, "lease")
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["meta"]["source"] == "lease"

    def test_nested_trust_neither_falls_back_to_primary(self) -> None:
        """Nested TRUST_NEITHER verdict falls back to primary defensively."""
        primary = {"meta": {"source": "lease"}}
        sibling = {"meta": {"source": "amendment"}}
        judge = _make_judge("meta.source", JudgeVerdict.TRUST_NEITHER)
        merged = merge_dual_extractions(primary, sibling, judge)
        assert merged["meta"]["source"] == "lease"
