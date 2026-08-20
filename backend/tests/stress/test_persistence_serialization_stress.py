"""Property-based invariants for the GL-entry serialization contract.

``ingestion/persistence.py:persist_gl_entries`` converts a normalized pandas
DataFrame into JSON-safe records before chunk-inserting them. PostgREST/Postgres
reject several pandas-native sentinels (``NaT`` strings, float ``NaN`` where an int
is expected, ``None`` JSONB), so the record loop has to neutralize every one. This
test drives arbitrary DataFrames through the real function (only the Supabase client
and org-context call are mocked) and asserts every emitted record honors the
serialization contract — plus the chunking arithmetic.

Regression: BUG #20 — a row with a valid ``transaction_date`` but a missing
``period_year``/``period_month`` leaves a float ``NaN`` in an otherwise-int column;
``int(NaN)`` raised and killed the whole batch insert. The period fields now carry
the same NaN guard the date fields always had.

Invariants pinned here:

  * **No NaN/NaT leaks** — every serialized ``period_year``/``period_month`` is an
    ``int`` or ``None`` (never a float NaN); ``transaction_date``/``accrual_date`` is
    an ISO string or ``None`` (never the string "NaT").
  * **Decimal precision** — ``amount`` is emitted as ``str`` (or ``None``).
  * **JSONB safety** — ``raw_row_data`` is always a ``dict`` (never ``None``).
  * **Schema completeness** — every required column plus ``import_batch_id`` /
    ``property_id`` is present on each record.
  * **Chunking** — ``insert`` is called ``ceil(n / chunk_size)`` times and the
    returned insert count equals the number of rows persisted.

Run standalone:
    pytest tests/stress/test_persistence_serialization_stress.py -q
"""

from __future__ import annotations

import math
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion import persistence as persistence_mod
from app.services.ingestion.persistence import persist_gl_entries

STRESS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_REQUIRED = [
    "account_code",
    "account_description",
    "amount",
    "transaction_date",
    "accrual_date",
    "period_year",
    "period_month",
    "vendor_name",
    "description",
    "raw_row_data",
]


class _Chain:
    """Records every gl_entries insert chunk; returns a matching-length data payload
    so the count check passes. The import_batches lookup returns a present row."""

    def __init__(self, name: str, store: dict):
        self.name = name
        self.store = store
        self.op: str | None = None
        self.chunk: list | None = None

    def select(self, *_a, **_k) -> _Chain:
        return self

    def eq(self, *_a, **_k) -> _Chain:
        return self

    def limit(self, *_a, **_k) -> _Chain:
        return self

    def insert(self, chunk: list) -> _Chain:
        self.op = "insert"
        self.chunk = chunk
        self.store["inserts"].append(chunk)
        return self

    def delete(self) -> _Chain:
        self.op = "delete"
        return self

    def execute(self) -> SimpleNamespace:
        if self.name == "import_batches":
            return SimpleNamespace(data=[{"id": "batch"}])
        if self.op == "insert" and self.chunk is not None:
            return SimpleNamespace(data=[{"id": k} for k in range(len(self.chunk))])
        return SimpleNamespace(data=[])


class _Client:
    def __init__(self, store: dict):
        self.store = store

    def table(self, name: str) -> _Chain:
        return _Chain(name, self.store)


# A valid date keeps the row past validation; period fields are independently
# present/absent so the float-NaN column (BUG #20) is exercised.
_row = st.fixed_dictionaries(
    {
        "account_code": st.sampled_from(["6000", "6010", "7200"]),
        "account_description": st.sampled_from(["CAM", "Utilities", "Repairs"]),
        "amount": st.decimals(
            min_value=Decimal("0.01"),
            max_value=Decimal("99999.99"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        "transaction_date": st.dates(
            min_value=date(2020, 1, 1), max_value=date(2025, 12, 31)
        ),
        "period_year": st.sampled_from([2020, 2021, 2024, None]),
        "period_month": st.sampled_from([1, 6, 12, None]),
        "vendor_name": st.sampled_from(["Acme", "Bravo", None]),
        "description": st.sampled_from(["line", "charge", None]),
        "raw_row_data": st.sampled_from([{"a": 1}, {}, None]),
    }
)


def _persist(df: pd.DataFrame, chunk_size: int = 500):
    store: dict = {"inserts": []}
    with (
        patch.object(
            persistence_mod, "get_supabase_admin", return_value=_Client(store)
        ),
        patch("app.database.client.set_organization_context", lambda *a, **k: None),
    ):
        inserted = persist_gl_entries(
            df,
            uuid4(),
            uuid4(),
            uuid4(),
            chunk_size=chunk_size,
            validate=False,
        )
    return inserted, store["inserts"]


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=8), chunk_size=st.integers(1, 4))
def test_serialized_records_are_json_safe(rows, chunk_size):
    df = pd.DataFrame(rows)
    inserted, chunks = _persist(df, chunk_size=chunk_size)

    flat = [rec for chunk in chunks for rec in chunk]
    assert len(flat) == len(rows)
    assert inserted == len(rows)

    # Chunking arithmetic: ceil(n / chunk_size) insert calls.
    assert len(chunks) == math.ceil(len(rows) / chunk_size)

    for rec in flat:
        # Schema completeness.
        for col in _REQUIRED + ["import_batch_id", "property_id"]:
            assert col in rec

        # No NaN leaks in the int period fields.
        for field in ("period_year", "period_month"):
            val = rec[field]
            assert val is None or isinstance(val, int)
            if isinstance(val, float):  # defensive — float NaN must never appear
                raise AssertionError(f"{field} leaked a float: {val!r}")

        # Dates are ISO strings or None, never the "NaT" sentinel.
        for field in ("transaction_date", "accrual_date"):
            val = rec[field]
            assert val is None or isinstance(val, str)
            assert val != "NaT"

        # Decimal precision preserved as string.
        assert rec["amount"] is None or isinstance(rec["amount"], str)

        # JSONB raw payload is always a dict.
        assert isinstance(rec["raw_row_data"], dict)


def test_missing_period_with_valid_date_regression():
    """BUG #20 anchor: a dated row with no period must serialize period as None, not
    crash on int(NaN)."""
    df = pd.DataFrame(
        [
            {
                "account_code": "6000",
                "amount": Decimal("100.00"),
                "transaction_date": pd.Timestamp("2024-03-15"),
                "period_year": 2024,
                "period_month": 3,
            },
            {
                "account_code": "6001",
                "amount": Decimal("200.00"),
                "transaction_date": pd.Timestamp("2024-04-15"),
                "period_year": None,  # -> float NaN column alongside the int above
                "period_month": None,
            },
        ]
    )
    # period_year is float64 with a NaN before the fix.
    assert df["period_year"].dtype == "float64"

    inserted, chunks = _persist(df)
    assert inserted == 2
    recs = [rec for chunk in chunks for rec in chunk]
    dated = next(r for r in recs if r["account_code"] == "6000")
    dateless = next(r for r in recs if r["account_code"] == "6001")
    assert dated["period_year"] == 2024 and dated["period_month"] == 3
    assert dateless["period_year"] is None and dateless["period_month"] is None


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
