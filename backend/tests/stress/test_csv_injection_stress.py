"""Property-based stress for CSV formula-injection neutralization on
tenant-facing CSV exports.

BUG CLASS (CWE-1236)
--------------------
A spreadsheet treats a cell whose text starts with ``=``, ``+``, ``-``, ``@``,
TAB, or CR as a formula. A user-derived value — a property name or pool name
imported from a Yardi/MRI CSV, e.g. ``=cmd|' /C calc'!A1`` — written verbatim
into an exported CSV becomes executable when a landlord or tenant opens the
file. The fix (``app/services/export/csv_safety.neutralize_formula``) prefixes a
single quote so the cell is read as literal text, and is applied ONLY to
free-text fields so legitimate negative-currency cells (``-1234.56``) stay
numeric.

Invariants asserted for ANY generated input:
  * ``neutralize_formula`` output never *begins* a formula: it is unchanged for
    safe text, prefixed with ``'`` for dangerous text, and applying it a second
    time is a no-op (the leading ``'`` is itself safe);
  * end-to-end through ``GLCategoryCSVExporter`` and the Yardi / Generic ERP CSV
    formatters, every TEXT cell parsed back out of the CSV is non-dangerous,
    while the numeric currency columns are left untouched (and still parse as
    Decimals, including legitimate negatives).

Run standalone:
    pytest tests/stress/test_csv_injection_stress.py -q
"""

from __future__ import annotations

import csv
from datetime import date
from decimal import Decimal
from io import StringIO

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.api.v1.exports import GenericCSVFormatter, YardiFormatter
from app.services.export.csv_safety import _FORMULA_TRIGGERS, neutralize_formula
from app.services.export.gl_category_csv import GLCategoryCSVExporter

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# A text corpus that frequently *starts* with a formula trigger, plus benign text.
_LEADING = list(_FORMULA_TRIGGERS) + ["a", "1", "'", " ", ""]
adversarial_text = st.builds(
    lambda lead, rest: lead + rest,
    st.sampled_from(_LEADING),
    st.text(
        alphabet=st.sampled_from(list('abc 012=+-@\t\r|!,"')),
        min_size=0,
        max_size=20,
    ),
)


def _is_dangerous(cell: str) -> bool:
    return bool(cell) and cell[0] in _FORMULA_TRIGGERS


@STRESS
@given(text=adversarial_text)
def test_neutralize_formula_is_safe_and_stable(text):
    out = neutralize_formula(text)
    # Never begins a formula.
    assert not _is_dangerous(out)
    if _is_dangerous(text):
        assert out == "'" + text
    else:
        assert out == text
    # Idempotent: a neutralized value is already safe, so re-applying changes nothing.
    assert neutralize_formula(out) == out


@STRESS
@given(
    pool_name=adversarial_text,
    pool_type=adversarial_text,
    account_code=adversarial_text,
    account_description=adversarial_text,
    amount=st.decimals(
        min_value=Decimal("-9999.99"),
        max_value=Decimal("9999.99"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_gl_category_csv_neutralizes_text_not_numbers(
    pool_name, pool_type, account_code, account_description, amount
):
    pools = [
        {
            "pool_name": pool_name,
            "pool_type": pool_type,
            "pool_total": amount,
            "items": [
                {
                    "account_code": account_code,
                    "account_description": account_description,
                    "amount": amount,
                }
            ],
        }
    ]
    buf = GLCategoryCSVExporter(pools, tax_year=2024).generate()
    rows = list(csv.DictReader(StringIO(buf.getvalue())))
    assert rows, "expected at least one data row"
    for row in rows:
        for col in ("Pool Name", "Pool Type", "Account Code", "Account Description"):
            assert not _is_dangerous(row[col])
        # Numeric columns are untouched and still parse (negatives allowed).
        for col in ("Amount", "Pool Total"):
            Decimal(row[col].replace(",", ""))


def _snapshot(property_name: str) -> dict:
    return {
        "properties": {"name": property_name},
        "lease_id": "11111111-2222-3333-4444-555555555555",
        "period_start_date": date(2024, 1, 1),
        "period_end_date": date(2024, 12, 31),
        "total_recovery": Decimal("-1234.56"),  # legit negative, must stay numeric
        "total_operating_expenses": Decimal("1000.00"),
        "grossed_up_expenses": Decimal("1100.00"),
        "base_year_amount": Decimal("0.00"),
        "tenant_share_before_cap": Decimal("500.00"),
        "tenant_share_after_cap": Decimal("450.00"),
        "admin_fee": Decimal("50.00"),
    }


@STRESS
@given(property_name=adversarial_text)
def test_erp_csv_formatters_neutralize_property_name(property_name):
    for formatter_cls in (YardiFormatter, GenericCSVFormatter):
        buf = formatter_cls([_snapshot(property_name)]).generate()
        rows = list(csv.DictReader(StringIO(buf.getvalue())))
        assert rows
        for row in rows:
            assert not _is_dangerous(row["Property"])
            # The Amount/recovery columns carry a legitimate negative and must
            # NOT have been neutralized into text.
            amount_col = "Amount" if "Amount" in row else "Amount Due"
            Decimal(row[amount_col].replace(",", ""))


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
