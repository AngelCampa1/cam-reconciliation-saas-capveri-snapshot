"""Property-based stress for the dual-extract merge logic.

``merge_dual_extractions`` (dual/dual_merger.py) reconciles two independent model
extractions (primary + sibling) into the single merged dict that gap-fill and the
validation reflexion loop then operate on. It is pure and deterministic, driven by
the judge's per-field verdicts. Its merge rules (docstring priority order) are
load-bearing for extraction correctness:

  1. fields where primary and sibling agree → that value;
  2. disagreement + PRIMARY_WINS → primary (or judge's chosen_value if non-None);
  3. disagreement + SIBLING_WINS → sibling (or judge's chosen_value if non-None);
  4. disagreement + TRUST_NEITHER → primary (safe fallback);
  5. disagreement + no verdict → primary (safe fallback);
  6. key only in sibling → sibling value; key only in primary → primary value;
  7. the ``extractions`` audit-metadata key → always primary's copy.

A regression here would silently pick the wrong side of a disagreement (e.g. bill
tenants on a hallucinated cap_rate) or mutate the caller's input. This harness
fuzzes arbitrary primary/sibling dicts and judge verdicts to prove the function is
total, deterministic, non-mutating, key-complete, and honours every merge rule.

Invariants:
  * **total + deterministic**: never raises; identical inputs → identical output;
  * **non-mutating**: primary and sibling dicts are unchanged after the merge;
  * **key-complete**: merged keys == union(primary, sibling) keys;
  * **agreement wins**: equal values on both sides survive verbatim;
  * **one-sided keys**: a key present on only one side takes that side's value;
  * **verdict resolution**: each disagreeing scalar field resolves per its verdict
    (chosen_value when provided, else the winning side's raw value; primary on
    TRUST_NEITHER / missing verdict);
  * **extractions is always primary's**: the audit-metadata key never takes sibling.

Run standalone:
    pytest tests/stress/test_dual_merger_stress.py -q
"""

from __future__ import annotations

import copy

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.extraction.dual.dual_merger import merge_dual_extractions
from app.services.extraction.dual.dual_models import (
    FieldVerdict,
    JudgeResult,
    JudgeVerdict,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Scalar leaf values the extraction JSON realistically carries.
scalars = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(-1000, 1000),
    st.text(max_size=8),
)

# Field names overlap heavily so primary/sibling frequently share keys (the
# interesting disagreement path), while still allowing one-sided keys.
keys = st.sampled_from(["cap_type", "cap_rate", "base_year", "pro_rata_share", "x"])

flat_dicts = st.dictionaries(keys, scalars, max_size=5)


@st.composite
def scenario(draw):
    """A (primary, sibling, judge_result) triple over a shared key universe."""
    primary = draw(flat_dicts)
    sibling = draw(flat_dicts)
    # Build verdicts for a subset of the shared keys.
    shared = sorted(set(primary) & set(sibling))
    verdicts = []
    for k in shared:
        if draw(st.booleans()):
            continue  # some shared keys get no verdict (fallback path)
        verdict = draw(st.sampled_from(list(JudgeVerdict)))
        # chosen_value sometimes provided (a normalised form), sometimes None.
        chosen = draw(st.one_of(st.none(), scalars))
        if verdict == JudgeVerdict.TRUST_NEITHER:
            chosen = None  # by contract
        verdicts.append(FieldVerdict(field=k, verdict=verdict, chosen_value=chosen))
    return primary, sibling, JudgeResult(verdicts=verdicts)


@STRESS
@given(scenario())
def test_total_deterministic_nonmutating_and_key_complete(data):
    primary, sibling, judge = data
    p_snapshot = copy.deepcopy(primary)
    s_snapshot = copy.deepcopy(sibling)

    merged = merge_dual_extractions(primary, sibling, judge)

    # Total + deterministic.
    assert merge_dual_extractions(primary, sibling, judge) == merged

    # Non-mutating: inputs untouched.
    assert primary == p_snapshot
    assert sibling == s_snapshot

    # Key-complete: exactly the union of both sides.
    assert set(merged) == set(primary) | set(sibling)


@STRESS
@given(scenario())
def test_merge_rules_per_field(data):
    primary, sibling, judge = data
    merged = merge_dual_extractions(primary, sibling, judge)

    for key in merged:
        if key == "extractions":
            continue  # covered by its own test
        in_p = key in primary
        in_s = key in sibling
        p_val = primary.get(key)
        s_val = sibling.get(key)

        if in_p and not in_s:
            assert merged[key] == p_val
        elif in_s and not in_p:
            assert merged[key] == s_val
        elif p_val == s_val:
            assert merged[key] == p_val
        else:
            # Disagreement on a scalar — resolve per verdict.
            verdict = judge.get_verdict(key)
            if verdict is None:
                assert merged[key] == p_val  # fallback to primary
            elif verdict.verdict == JudgeVerdict.SIBLING_WINS:
                expected = (
                    verdict.chosen_value if verdict.chosen_value is not None else s_val
                )
                assert merged[key] == expected
            elif verdict.verdict == JudgeVerdict.PRIMARY_WINS:
                expected = (
                    verdict.chosen_value if verdict.chosen_value is not None else p_val
                )
                assert merged[key] == expected
            else:  # TRUST_NEITHER → primary
                assert merged[key] == p_val


@STRESS
@given(
    p_extr=st.one_of(st.none(), st.lists(st.text(max_size=4), max_size=3)),
    s_extr=st.lists(st.text(max_size=4), max_size=3),
    include_primary=st.booleans(),
)
def test_extractions_always_takes_primary(p_extr, s_extr, include_primary):
    """The audit-metadata ``extractions`` key always resolves to primary's copy
    (or sibling's only when primary lacks the key entirely)."""
    primary = {"cap_type": "none"}
    sibling = {"cap_type": "none", "extractions": s_extr}
    if include_primary:
        primary["extractions"] = p_extr

    merged = merge_dual_extractions(primary, sibling, JudgeResult())

    if include_primary:
        assert merged["extractions"] == p_extr  # primary wins, even if None
    else:
        assert merged["extractions"] == s_extr  # only-in-sibling falls through


def test_nested_dict_recurses_and_consults_dotted_verdict():
    """A nested-dict disagreement resolves leaf-by-leaf via the dotted key path."""
    primary = {"caps": {"cap_rate": "0.05", "kind": "year_over_year"}}
    sibling = {"caps": {"cap_rate": "0.07", "kind": "year_over_year"}}
    judge = JudgeResult(
        verdicts=[
            FieldVerdict(
                field="caps.cap_rate",
                verdict=JudgeVerdict.SIBLING_WINS,
                chosen_value="0.07",
            )
        ]
    )
    merged = merge_dual_extractions(primary, sibling, judge)
    # Disagreeing leaf took sibling per the dotted verdict; agreeing leaf survived.
    assert merged["caps"] == {"cap_rate": "0.07", "kind": "year_over_year"}
    # Inputs untouched.
    assert primary["caps"]["cap_rate"] == "0.05"


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
