"""Property-based stress for extraction confidence scoring.

``calculate_confidence`` turns per-field LLM confidence scores (0-100) into a
weighted overall score (0.0-1.0) and a human-review flag. It is the gate that
decides whether an extracted lease profile is auto-approved or queued for a
human, so its math and its scale handling (0-100 inputs vs 0-1 thresholds) must
be exact: a wrong threshold comparison would either auto-approve a bad
extraction or needlessly flag a good one. This harness pins those invariants as
a regression guard.

Invariants:
  * **bounded**: overall_score is always in [0, 1] and every field score is the
    raw confidence / 100 exactly;
  * **weighted-average correct**: overall_score equals an independently computed
    weighted average over exactly the FIELD_WEIGHTS fields that were extracted
    (last value wins on a duplicate field, matching the dict build);
  * **review flag is exact**: needs_review is True iff overall_score < threshold
    or any field score is below threshold, and low_confidence_fields is exactly
    the set of below-threshold fields;
  * **scale parity**: get_low_confidence_extractions selects exactly the
    extractions whose 0-100 confidence is below threshold*100 — a field at
    exactly the threshold is never flagged (strict <).

Run standalone:
    pytest tests/stress/test_confidence_scoring_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.extraction.confidence import (
    FIELD_WEIGHTS,
    calculate_confidence,
    get_low_confidence_extractions,
)
from app.services.extraction.extraction_models import (
    FieldExtraction,
    LeaseExtractionResult,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Field names: a mix of weighted fields and arbitrary unweighted ones.
FIELD_NAMES = sorted(FIELD_WEIGHTS) + ["tenant_name", "suite", "lease_term"]


@st.composite
def extractions(draw: st.DrawFn):
    """A non-empty list of FieldExtraction with bounded confidences."""
    specs = draw(
        st.lists(
            st.tuples(
                st.sampled_from(FIELD_NAMES),
                st.integers(min_value=0, max_value=100),
            ),
            min_size=1,
            max_size=10,
        )
    )
    return [
        FieldExtraction(
            field=name,
            value="v",
            confidence=conf,
            source_text="src",
        )
        for name, conf in specs
    ]


def _build(exts: list[FieldExtraction]) -> LeaseExtractionResult:
    return LeaseExtractionResult(pro_rata_share=Decimal("0.5"), extractions=exts)


@STRESS
@given(
    exts=extractions(),
    threshold=st.decimals(min_value=Decimal("0"), max_value=Decimal("1"), places=2),
)
def test_score_bounded_and_weighted_average_correct(exts, threshold):
    result = _build(exts)
    conf = calculate_confidence(result, threshold=threshold)

    # Bounded.
    assert Decimal("0") <= conf.overall_score <= Decimal("1")

    # Field scores are confidence/100 exactly (last value wins on duplicates).
    expected_scores = {
        e.field: Decimal(str(e.confidence)) / Decimal("100") for e in exts
    }
    assert conf.field_scores == expected_scores

    # Overall score == independent weighted average over weighted fields present.
    weighted_sum = Decimal("0")
    total_weight = Decimal("0")
    for field, weight in FIELD_WEIGHTS.items():
        if field in expected_scores:
            weighted_sum += expected_scores[field] * weight
            total_weight += weight
    expected_overall = (
        (weighted_sum / total_weight).quantize(Decimal("0.0001"))
        if total_weight > 0
        else Decimal("0")
    )
    assert conf.overall_score == expected_overall


@STRESS
@given(
    exts=extractions(),
    threshold=st.decimals(min_value=Decimal("0"), max_value=Decimal("1"), places=2),
)
def test_review_flag_and_low_fields_are_exact(exts, threshold):
    result = _build(exts)
    conf = calculate_confidence(result, threshold=threshold)

    expected_low = [
        field for field, score in conf.field_scores.items() if score < threshold
    ]
    assert conf.low_confidence_fields == expected_low

    expected_review = conf.overall_score < threshold or len(expected_low) > 0
    assert conf.needs_review == expected_review
    assert conf.threshold == threshold


@STRESS
@given(
    exts=extractions(),
    threshold=st.decimals(min_value=Decimal("0"), max_value=Decimal("1"), places=2),
)
def test_low_confidence_extractions_scale_parity(exts, threshold):
    result = _build(exts)
    threshold_percent = threshold * Decimal("100")

    low = get_low_confidence_extractions(result, threshold=threshold)
    # Exactly the extractions whose 0-100 confidence is strictly below
    # threshold*100 (a field at exactly the threshold is not flagged).
    expected = [e for e in exts if Decimal(str(e.confidence)) < threshold_percent]
    assert low == expected
    for e in low:
        assert Decimal(str(e.confidence)) < threshold_percent


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
