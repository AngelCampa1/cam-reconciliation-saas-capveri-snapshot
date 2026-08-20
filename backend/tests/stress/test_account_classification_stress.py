"""Property-based stress for GL account → expense-pool classification.

``classify_account`` (pools/auto_setup.py) deterministically maps a GL account
description to an ``(pool_name, pool_type)`` pair by first-match keyword search,
falling back to ``("Other Operating", "operating")``. It feeds pool creation and
the recoverable/gross-up decision (``RECOVERABLE_TYPES``), so a misclassification
that crossed a *type* boundary would change what tenants are billed. This harness
fuzzes arbitrary descriptions (including unicode/control/empty) to prove the
function is total, deterministic, and stays within its declared output domain.

Invariants:
  * total — never raises on any string; always returns two non-empty strings;
  * deterministic and case-insensitive (it lowercases internally);
  * ``pool_type`` is always one of the four declared types;
  * ``pool_name`` is always a declared pool name or the default;
  * the default pair is returned IFF no declared keyword occurs in the text;
  * a curated set of non-colliding keywords each map to their own category
    (priority/first-match wins for clean keywords).

OBS-S17 (NOT a bug — cosmetic, type-preserving)
-----------------------------------------------
Keyword search is substring-based and ordered, so a later keyword that contains
an earlier one collides: e.g. ``"electrical"`` (R&M) contains ``"electric"``
(Utilities, listed earlier), so "Electrical Repairs" classifies as **Utilities**
rather than Repairs & Maintenance. Both are ``operating`` (recoverable, same
gross-up treatment), so the recovery math is unaffected — only the pool *label*
differs. Pinned below so the behavior is visible and cannot drift into a
type-crossing collision unnoticed.

Run standalone:
    pytest tests/stress/test_account_classification_stress.py -q
"""

from __future__ import annotations

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.pools.auto_setup import (
    DESCRIPTION_KEYWORDS,
    classify_account,
)

STRESS = settings(
    max_examples=500,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

VALID_TYPES = {"tax", "insurance", "operating", "other"}
VALID_NAMES = {name for _, name, _ in DESCRIPTION_KEYWORDS} | {"Other Operating"}
DEFAULT = ("Other Operating", "operating")
ALL_KEYWORDS = [kw for kws, _, _ in DESCRIPTION_KEYWORDS for kw in kws]


@STRESS
@given(desc=st.text(max_size=200))
def test_classification_is_total_and_in_domain(desc):
    name, ptype = classify_account(desc)

    # Total: two non-empty strings, no exception.
    assert isinstance(name, str) and name
    assert isinstance(ptype, str) and ptype

    # Output stays within the declared domain.
    assert ptype in VALID_TYPES
    assert name in VALID_NAMES

    # Deterministic + case-insensitive (lowercased internally).
    assert classify_account(desc) == (name, ptype)
    assert classify_account(desc.lower()) == (name, ptype)

    # The default pair is returned exactly when no declared keyword is present.
    has_keyword = any(kw in desc.lower() for kw in ALL_KEYWORDS)
    if not has_keyword:
        assert (name, ptype) == DEFAULT
    else:
        assert name != "Other Operating"


@STRESS
@given(
    prefix=st.text(max_size=30),
    suffix=st.text(max_size=30),
)
def test_clean_keywords_map_to_their_category(prefix, suffix):
    """Keywords that are not substrings of any earlier keyword always win their
    own category, regardless of surrounding text — as long as the surrounding
    text introduces no earlier keyword."""
    # Each keyword here is verified to NOT contain, and NOT be contained by, an
    # earlier-listed keyword, so first-match resolves to its own category.
    clean = {
        "assessment": ("Real Estate Taxes", "tax"),
        "insurance": ("Insurance", "insurance"),
        "water": ("Utilities", "operating"),
        "elevator": ("Repairs & Maintenance", "operating"),
        "janitor": ("Janitorial", "operating"),
        "landscap": ("Grounds & Parking", "operating"),
        "security": ("Security", "operating"),
        "sprinkler": ("Fire & Life Safety", "operating"),
        "payroll": ("Building Payroll", "operating"),
        "commission": ("Non-Recoverable", "other"),
    }
    # Only assert when the assembled description contains no competing keyword
    # besides the target. The check must run on the FULL desc, not the padding
    # alone: a boundary between the padding and the keyword can form a new
    # keyword (e.g. prefix 'ga' + 'security' = 'gasecurity', which contains the
    # earlier 'gas' → Utilities legitimately wins). Checking only `prefix+suffix`
    # missed those boundary-formed keywords and made the test flaky.
    for keyword, expected in clean.items():
        desc = f"{prefix}{keyword}{suffix}"
        lowered = desc.lower()
        if any(kw in lowered for kw in ALL_KEYWORDS if kw != keyword):
            continue
        assert classify_account(desc) == expected


def test_obs_s17_electrical_collides_into_utilities():
    """Pinned: 'electrical' contains the earlier 'electric' (Utilities). The
    collision is type-preserving (both 'operating'), so recovery is unaffected."""
    name, ptype = classify_account("Electrical Repairs")
    assert (name, ptype) == ("Utilities", "operating")
    # Critically, the type stays 'operating' (recoverable) either way, so the
    # recoverable/gross-up decision is identical to R&M.
    rm_name, rm_type = classify_account("HVAC Maintenance")
    assert rm_type == ptype == "operating"


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
