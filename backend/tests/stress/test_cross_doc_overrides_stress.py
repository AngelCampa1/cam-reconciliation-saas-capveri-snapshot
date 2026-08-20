"""Property-based stress for the cross-document override applier.

When a reviewer accepts a cross-document finding (e.g. "this lease's pro-rata
share is 0.085, not 0.10"), the orchestrator rewrites the affected ``LeaseTerms``
*before* any reconciliation math runs, via two pure helpers:

  * ``_parse_override_value`` — JSON-decode the suggested string, falling back to
    the raw string when it isn't valid JSON (so "2024-01-01" stays a string but
    "0.085" becomes a number);
  * ``_apply_cross_doc_overrides`` — apply every accepted override whose lease_id
    matches an active lease and whose field is in the supported allow-list, while
    silently skipping the rest.

A bug here corrupts the inputs to every downstream calculation: a dropped
override under-/over-bills a tenant, an applied-to-the-wrong-lease override
poisons a different tenant, and a reordered list desyncs leases from their
results. This harness pins the contract and independently re-derives the expected
lease list for random override batches.

Run standalone:
    pytest tests/stress/test_cross_doc_overrides_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.models import CalculationTrace
from app.services.calculation.orchestrator import (
    _APPLICABLE_OVERRIDE_FIELDS,
    _apply_cross_doc_overrides,
    _parse_override_value,
)
from app.services.calculation.tenant_share import LeaseTerms
from app.services.extraction.cross_doc_models import TermOverrideSuggestion

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


def _new_trace() -> CalculationTrace:
    from datetime import date

    return CalculationTrace(
        calculation_type="reconciliation",
        property_id=UUID(int=0),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
    )


def _lease(idx: int) -> LeaseTerms:
    return LeaseTerms(
        lease_id=UUID(int=idx + 1),
        tenant_name=f"Tenant {idx}",
        pro_rata_share=Decimal("0.10"),
        tenant_sqft=Decimal("1000"),
    )


# A small set of overridable fields with values that satisfy LeaseTerms bounds.
_FIELD_VALUES = {
    "pro_rata_share": "0.085",
    "tenant_sqft": "2500",
    "admin_fee_percentage": "0.15",
    "management_fee_percentage": "0.05",
    "base_year": "2021",
}
assert set(_FIELD_VALUES) <= _APPLICABLE_OVERRIDE_FIELDS


# ---------------------------------------------------------------------------
# _parse_override_value
# ---------------------------------------------------------------------------


@STRESS
@given(value=st.one_of(st.integers(), st.floats(allow_nan=False, allow_infinity=False)))
def test_parse_override_value_json_numbers_roundtrip(value):
    # A JSON-serialisable scalar, serialised then parsed, returns an equal value.
    import json

    serialised = json.dumps(value)
    assert _parse_override_value(serialised) == json.loads(serialised)


def test_parse_override_value_typed_examples():
    assert _parse_override_value("0.085") == 0.085
    assert _parse_override_value("2500") == 2500
    assert _parse_override_value("true") is True
    assert _parse_override_value("null") is None
    assert _parse_override_value("[1, 2]") == [1, 2]
    # Not valid JSON -> raw string fallback (dates, free text, bare identifiers).
    assert _parse_override_value("2024-01-01") == "2024-01-01"
    assert _parse_override_value("net") == "net"
    assert _parse_override_value("") == ""


# ---------------------------------------------------------------------------
# _apply_cross_doc_overrides
# ---------------------------------------------------------------------------


@STRESS
@given(
    n_leases=st.integers(min_value=1, max_value=6),
    specs=st.lists(
        st.fixed_dictionaries(
            {
                # target_idx may point past the end -> unknown lease_id.
                "target_idx": st.integers(min_value=0, max_value=9),
                "field": st.sampled_from(sorted(_FIELD_VALUES) + ["not_a_field"]),
                "use_random_uuid": st.booleans(),
            }
        ),
        min_size=0,
        max_size=8,
    ),
)
def test_apply_overrides_matches_independent_rederivation(n_leases, specs):
    leases = [_lease(i) for i in range(n_leases)]
    overrides: list[TermOverrideSuggestion] = []
    # Build the expected per-lease update map exactly as the SUT should.
    expected_updates: dict[str, dict[str, object]] = {}

    for spec in specs:
        idx = spec["target_idx"]
        field = spec["field"]
        if spec["use_random_uuid"]:
            lease_id = str(uuid4())  # never matches a real lease
        elif idx < n_leases:
            lease_id = str(leases[idx].lease_id)
        else:
            lease_id = str(UUID(int=idx + 1))  # valid-looking but no such lease

        suggested = _FIELD_VALUES.get(field, "0")
        overrides.append(
            TermOverrideSuggestion(
                field_name=field,
                lease_id=lease_id,
                current_value="0.10",
                suggested_value=suggested,
                reasoning="r",
                confidence=90,
            )
        )

        matches_lease = idx < n_leases and not spec["use_random_uuid"]
        supported = field in _APPLICABLE_OVERRIDE_FIELDS
        if matches_lease and supported:
            # Last-write-wins per (lease, field), matching dict assignment.
            expected_updates.setdefault(lease_id, {})[field] = _parse_override_value(
                suggested
            )

    result = _apply_cross_doc_overrides(leases, overrides, _new_trace())

    # Order and length are always preserved 1:1 with the input.
    assert len(result) == len(leases)
    assert [r.lease_id for r in result] == [le.lease_id for le in leases]

    for original, applied in zip(leases, result):
        updates = expected_updates.get(str(original.lease_id))
        if not updates:
            # Untouched lease is returned as the same object, unchanged.
            assert applied is original
            continue
        expected = LeaseTerms.model_validate(
            original.model_dump(mode="python") | updates
        )
        assert applied == expected
        # Only the overridden fields changed; everything else is identical.
        changed = {
            k
            for k in original.model_dump()
            if getattr(original, k) != getattr(applied, k)
        }
        assert changed == set(updates)


def test_apply_overrides_noop_paths():
    leases = [_lease(0), _lease(1)]
    trace = _new_trace()
    # None / empty overrides return the very same list object untouched.
    assert _apply_cross_doc_overrides(leases, None, trace) is leases
    assert _apply_cross_doc_overrides(leases, [], trace) is leases
    # An override that matches no lease and an unsupported field both skip,
    # leaving the original objects returned unchanged.
    overrides = [
        TermOverrideSuggestion(
            field_name="pro_rata_share",
            lease_id=str(uuid4()),
            current_value="0.10",
            suggested_value="0.20",
            reasoning="r",
            confidence=50,
        ),
        TermOverrideSuggestion(
            field_name="not_a_field",
            lease_id=str(leases[0].lease_id),
            current_value="x",
            suggested_value="y",
            reasoning="r",
            confidence=50,
        ),
    ]
    result = _apply_cross_doc_overrides(leases, overrides, trace)
    assert result is leases


def test_apply_overrides_known_single_field():
    leases = [_lease(0), _lease(1)]
    target = str(leases[1].lease_id)
    overrides = [
        TermOverrideSuggestion(
            field_name="pro_rata_share",
            lease_id=target,
            current_value="0.10",
            suggested_value="0.085",
            reasoning="cross-doc reconciliation",
            confidence=95,
        )
    ]
    result = _apply_cross_doc_overrides(leases, overrides, _new_trace())
    assert result[0] is leases[0]  # untouched lease unchanged
    assert result[1].pro_rata_share == Decimal("0.085")
    assert result[1].tenant_name == leases[1].tenant_name


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-q"])
