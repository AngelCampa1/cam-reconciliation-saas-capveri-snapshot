"""Property-based stress for LeaseExtractionResult's pure accessor methods.

After the LLM extracts a lease's recovery profile, the human-in-the-loop UI and
the persistence layer lean on three pure methods of ``LeaseExtractionResult``:

  * ``get_extraction(field)`` — fetch the audit-trail metadata for one field;
  * ``get_low_confidence_fields(threshold)`` — the review queue: every field the
    reviewer must double-check (strictly ``confidence < threshold``);
  * ``to_recovery_profile_dict()`` — the exact hand-off to the calculation
    profile, dropping only the extraction metadata.

A boundary slip (``<=`` vs ``<``) silently hides or floods the review queue, and a
dropped/renamed key in the profile dict silently changes downstream billing
inputs. These methods have no dedicated harness. This one re-derives each result
from scratch over random extraction sets and pins the key set / values exactly.

Run standalone:
    pytest tests/stress/test_extraction_result_methods_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models.enums import AccountingBasis, CapType, PoolType
from app.services.extraction.extraction_models import (
    FieldExtraction,
    LeaseExtractionResult,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Small field-name alphabet so duplicate field names occur and first-match /
# subsequence behaviour is actually exercised.
field_name = st.sampled_from(["pro_rata_share", "base_year", "cap_rate", "ghost"])

extraction_strategy = st.builds(
    FieldExtraction,
    field=field_name,
    value=st.text(max_size=5),
    confidence=st.integers(min_value=0, max_value=100),
    source_text=st.text(min_size=1, max_size=5),
)

_PROFILE_KEYS = {
    "base_year",
    "base_year_amount",
    "gross_up_base_year",
    "pro_rata_share",
    "cap_type",
    "cap_rate",
    "admin_fee_percentage",
    "management_fee_percentage",
    "excluded_pools",
    "accounting_basis",
}


def _result(
    extractions: list[FieldExtraction],
    *,
    cap_type: CapType = CapType.NONE,
    cap_rate: Decimal | None = None,
    base_year: int | None = None,
    base_year_amount: Decimal | None = None,
    admin_fee: Decimal = Decimal("0"),
    mgmt_fee: Decimal | None = None,
    excluded: list[PoolType] | None = None,
    basis: AccountingBasis | None = None,
) -> LeaseExtractionResult:
    return LeaseExtractionResult(
        pro_rata_share=Decimal("0.10"),
        cap_type=cap_type,
        cap_rate=cap_rate,
        base_year=base_year,
        base_year_amount=base_year_amount,
        admin_fee_percentage=admin_fee,
        management_fee_percentage=mgmt_fee,
        excluded_pools=excluded or [],
        accounting_basis=basis,
        extractions=extractions
        or [
            FieldExtraction(
                field="pro_rata_share", value="0.10", confidence=99, source_text="x"
            )
        ],
    )


@STRESS
@given(
    extractions=st.lists(extraction_strategy, min_size=1, max_size=10),
    query=field_name,
)
def test_get_extraction_returns_first_match(extractions, query):
    result = _result(extractions)
    got = result.get_extraction(query)

    expected = next((e for e in extractions if e.field == query), None)
    # Identity, not just equality: it must be the actual first matching object.
    assert got is expected
    if got is not None:
        assert got.field == query


@STRESS
@given(
    extractions=st.lists(extraction_strategy, min_size=1, max_size=12),
    threshold=st.integers(min_value=0, max_value=101),
)
def test_low_confidence_is_strict_subsequence(extractions, threshold):
    result = _result(extractions)
    low = result.get_low_confidence_fields(threshold)

    # Strict `<` boundary, order-preserving subsequence, partition is exhaustive.
    assert low == [e for e in extractions if e.confidence < threshold]
    assert all(e.confidence < threshold for e in low)
    kept_ids = {id(e) for e in low}
    for e in extractions:
        if id(e) not in kept_ids:
            assert e.confidence >= threshold


def test_low_confidence_boundary_is_exclusive():
    exts = [
        FieldExtraction(field="a", value="1", confidence=69, source_text="s"),
        FieldExtraction(field="b", value="1", confidence=70, source_text="s"),
        FieldExtraction(field="c", value="1", confidence=71, source_text="s"),
    ]
    result = _result(exts)
    low = result.get_low_confidence_fields(70)
    # 70 is NOT low (strict <); only 69 qualifies.
    assert [e.field for e in low] == ["a"]
    # Default threshold is also 70.
    assert result.get_low_confidence_fields() == low


@STRESS
@given(
    cap=st.sampled_from(
        [
            (CapType.NONE, None),
            (CapType.NON_CUMULATIVE, Decimal("0.05")),
            (CapType.CUMULATIVE, Decimal("0.03")),
        ]
    ),
    base_year=st.one_of(st.none(), st.integers(min_value=1990, max_value=2100)),
    base_amount=st.one_of(st.none(), st.just(Decimal("12345.67"))),
    admin=st.decimals(min_value=Decimal("0"), max_value=Decimal("0.20"), places=4),
    mgmt=st.one_of(
        st.none(),
        st.decimals(min_value=Decimal("0"), max_value=Decimal("0.20"), places=4),
    ),
    excluded=st.lists(st.sampled_from(list(PoolType)), max_size=3, unique=True),
    basis=st.one_of(st.none(), st.sampled_from(list(AccountingBasis))),
)
def test_to_recovery_profile_dict_exact_projection(
    cap, base_year, base_amount, admin, mgmt, excluded, basis
):
    cap_type, cap_rate = cap
    result = _result(
        [
            FieldExtraction(
                field="pro_rata_share", value="0.1", confidence=80, source_text="s"
            )
        ],
        cap_type=cap_type,
        cap_rate=cap_rate,
        base_year=base_year,
        base_year_amount=base_amount,
        admin_fee=admin,
        mgmt_fee=mgmt,
        excluded=excluded,
        basis=basis,
    )
    profile = result.to_recovery_profile_dict()

    # Exact key set — never leaks the audit metadata, never drops a billing input.
    assert set(profile) == _PROFILE_KEYS
    assert "extractions" not in profile
    # Every value mirrors the live attribute.
    for key in _PROFILE_KEYS:
        assert profile[key] == getattr(result, key)
    # Pure: building the dict does not mutate the model's extraction list.
    assert len(result.extractions) == 1


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-q"])
