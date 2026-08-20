"""Property-based stress for the lease-extraction business-rule validator.

``LeaseExtractionValidator.validate`` is the soft-validation layer that runs
after Pydantic: it never raises, instead emitting warnings (out-of-range but
allowed values) and errors (consistency failures that block save). The
human-in-the-loop UI relies on two contracts: validate never raises on any
model-valid extraction, and ``is_valid`` is true exactly when there are no
errors. This harness pins those plus the specific rule firings as a regression
guard.

Invariants:
  * **never raises / is_valid parity**: validate returns a ValidationResult for
    any model-valid extraction and ``is_valid == (len(errors) == 0)``;
  * **cap consistency errors are exact**: an orphaned cap_rate (set while
    cap_type is NONE) produces exactly one cap_type error, and a consistent
    pairing produces none;
  * **pro-rata edge warnings**: a 0% pro-rata warns and a 100% pro-rata emits an
    info note, while interior values do not;
  * **cap-rate range warning**: a cap_rate above the 25% business maximum warns.

Run standalone:
    pytest tests/stress/test_lease_validation_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models.enums import CapType
from app.services.extraction.extraction_models import (
    FieldExtraction,
    LeaseExtractionResult,
)
from app.services.extraction.validation import (
    LeaseExtractionValidator,
    validate_extraction,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_EXTRACTION = [
    FieldExtraction(field="pro_rata_share", value="0.5", confidence=90, source_text="x")
]


def _build(
    *,
    pro_rata: Decimal,
    cap_type: CapType,
    cap_rate: Decimal | None,
    base_year: int | None,
    admin_fee: Decimal,
) -> LeaseExtractionResult:
    return LeaseExtractionResult(
        pro_rata_share=pro_rata,
        cap_type=cap_type,
        cap_rate=cap_rate,
        base_year=base_year,
        admin_fee_percentage=admin_fee,
        extractions=_EXTRACTION,
    )


# A cap_type/cap_rate pairing the Pydantic model will accept: either both
# present (cap_type set + a rate) or no cap at all. The orphaned-rate case
# (cap_type NONE + a rate) is also model-valid and is exercised separately.
@st.composite
def model_valid(draw: st.DrawFn):
    pro_rata = draw(
        st.decimals(min_value=Decimal("0"), max_value=Decimal("1"), places=4)
    )
    base_year = draw(st.one_of(st.none(), st.integers(min_value=1990, max_value=2100)))
    admin_fee = draw(
        st.decimals(min_value=Decimal("0"), max_value=Decimal("0.20"), places=4)
    )
    cap_choice = draw(st.sampled_from(["none", "capped", "orphan_rate"]))
    if cap_choice == "none":
        cap_type, cap_rate = CapType.NONE, None
    elif cap_choice == "capped":
        cap_type = draw(
            st.sampled_from(
                [
                    CapType.NON_CUMULATIVE,
                    CapType.CUMULATIVE,
                    CapType.CUMULATIVE_COMPOUNDING,
                ]
            )
        )
        cap_rate = draw(
            st.decimals(min_value=Decimal("0"), max_value=Decimal("1"), places=4)
        )
    else:  # orphan_rate: cap_rate present, cap_type NONE (model allows it)
        cap_type = CapType.NONE
        cap_rate = draw(
            st.decimals(min_value=Decimal("0"), max_value=Decimal("1"), places=4)
        )
    return _build(
        pro_rata=pro_rata,
        cap_type=cap_type,
        cap_rate=cap_rate,
        base_year=base_year,
        admin_fee=admin_fee,
    )


@STRESS
@given(extraction=model_valid())
def test_never_raises_and_is_valid_parity(extraction):
    result = validate_extraction(extraction)  # must not raise
    assert result.is_valid == (len(result.errors) == 0)

    # The only error this layer raises on model-valid input is the orphaned
    # cap_rate (cap_rate set while cap_type is NONE).
    orphan = extraction.cap_rate is not None and extraction.cap_type == CapType.NONE
    cap_type_errors = [e for e in result.errors if e.field == "cap_type"]
    assert (len(cap_type_errors) == 1) == orphan
    assert result.is_valid != orphan


@STRESS
@given(
    pro_rata=st.decimals(min_value=Decimal("0"), max_value=Decimal("1"), places=4),
)
def test_pro_rata_edge_warnings(pro_rata):
    extraction = _build(
        pro_rata=pro_rata,
        cap_type=CapType.NONE,
        cap_rate=None,
        base_year=None,
        admin_fee=Decimal("0"),
    )
    result = LeaseExtractionValidator().validate(extraction)
    pr_warnings = [w for w in result.warnings if w.field == "pro_rata_share"]
    if pro_rata == Decimal("0"):
        assert len(pr_warnings) == 1 and pr_warnings[0].severity == "warning"
    elif pro_rata == Decimal("1"):
        assert len(pr_warnings) == 1 and pr_warnings[0].severity == "info"
    else:
        assert pr_warnings == []


@STRESS
@given(
    cap_rate=st.decimals(min_value=Decimal("0"), max_value=Decimal("1"), places=4),
)
def test_cap_rate_range_warning(cap_rate):
    extraction = _build(
        pro_rata=Decimal("0.5"),
        cap_type=CapType.CUMULATIVE,
        cap_rate=cap_rate,
        base_year=None,
        admin_fee=Decimal("0"),
    )
    result = LeaseExtractionValidator().validate(extraction)
    cap_warnings = [w for w in result.warnings if w.field == "cap_rate"]
    # Above the 25% business maximum → exactly one warning; otherwise none.
    assert (len(cap_warnings) == 1) == (
        cap_rate > LeaseExtractionValidator.MAX_CAP_RATE
    )


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
