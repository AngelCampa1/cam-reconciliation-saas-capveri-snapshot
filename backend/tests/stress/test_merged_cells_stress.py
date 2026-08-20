"""Property-based invariants for merged-cell context propagation.

ERP exports often show a property/building name once at the top of a group and
leave the following rows blank, expecting the reader to carry it down. Two pure
helpers in ``cleaners.py`` reconstruct that context:

  * ``forward_fill_context`` — forward-fill named columns.
  * ``handle_merged_cells_pattern`` — forward-fill group columns (treating ``""``
    as missing), then drop non-data rows (blank indicator) and skip-pattern rows
    (Total/Subtotal/…), re-indexing the result.

A defect here misattributes a GL line to the wrong property or keeps a subtotal
row as if it were data, so both are pinned against independent oracles.

Invariants pinned here:

  * **Forward-fill** — each context column equals pandas ``ffill`` of the input;
    the source frame is not mutated; shape is preserved.
  * **Merged-cell handling** — group columns are forward-filled after ``""`` is
    treated as missing; a row survives iff its indicator is non-blank and matches
    no skip pattern (case-insensitive substring); the result index is a clean
    ``0..n-1`` range.

Run standalone:
    pytest tests/stress/test_merged_cells_stress.py -q
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.ingestion.cleaners import (
    forward_fill_context,
    handle_merged_cells_pattern,
)

STRESS = settings(max_examples=250, deadline=None)

_ctx_cell = st.one_of(st.none(), st.sampled_from(["PropA", "PropB"]))
_ind_cell = st.sampled_from(["6000", "", "Total", "Subtotal x", "vendor", None])


@STRESS
@given(
    values=st.lists(_ctx_cell, min_size=1, max_size=10),
    payload=st.lists(st.integers(0, 9), min_size=1, max_size=10),
)
def test_forward_fill_matches_pandas_and_no_mutation(values, payload):
    n = min(len(values), len(payload))
    values, payload = values[:n], payload[:n]
    df = pd.DataFrame({"property_name": values, "amount": payload})
    before = df.copy(deep=True)

    out = forward_fill_context(df, ["property_name"])

    # Matches pandas ffill exactly.
    expected = before["property_name"].ffill()
    assert out["property_name"].tolist() == expected.tolist()
    # Untouched column preserved; source frame not mutated.
    assert out["amount"].tolist() == before["amount"].tolist()
    pd.testing.assert_frame_equal(df, before)


@STRESS
@given(
    groups=st.lists(_ctx_cell, min_size=1, max_size=10),
    indicators=st.lists(_ind_cell, min_size=1, max_size=10),
)
def test_merged_cells_partition_and_reindex(groups, indicators):
    n = min(len(groups), len(indicators))
    groups, indicators = groups[:n], indicators[:n]
    df = pd.DataFrame({"property_name": groups, "account_code": indicators})

    config = {
        "group_columns": ["property_name"],
        "data_indicator": "account_code",
        "skip_patterns": ["Total", "Subtotal"],
    }
    out = handle_merged_cells_pattern(df, config)

    # Oracle: forward-fill groups after ""->NaN, then keep data rows.
    filled = pd.Series(groups, dtype=object).replace("", np.nan).ffill()
    kept = []
    for i, ind in enumerate(indicators):
        if ind is None or ind == "":
            continue
        s = str(ind).lower()
        if "total" in s or "subtotal" in s:
            continue
        kept.append((filled.iloc[i], ind))

    assert len(out) == len(kept)
    # Index is a clean 0..n-1 range after reset.
    assert list(out.index) == list(range(len(out)))
    if kept:
        assert out["account_code"].tolist() == [k[1] for k in kept]
        assert out["property_name"].tolist() == [k[0] for k in kept]


def test_merged_cells_empty_anchor():
    out = handle_merged_cells_pattern(
        pd.DataFrame({"account_code": ["", "Total", None]}),
        {"data_indicator": "account_code", "skip_patterns": ["Total"]},
    )
    assert out.empty
    assert list(out.index) == []


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
