"""
Unit tests for tenant-name resolution in ERP write-back exports.

ERP write-back files (Yardi CSV, MRI fixed-width, generic CSV) are re-imported
into the landlord's accounting system and read by a human, so the Tenant column
must carry the lease's human-readable ``tenant_name`` rather than a fragment of
CapVeri's internal lease UUID. These tests pin that contract and the defensive
fallbacks in ``_snapshot_tenant_name``.
"""

from __future__ import annotations

import csv
from datetime import date
from decimal import Decimal
from io import StringIO

from app.api.v1.exports import (
    GenericCSVFormatter,
    MRIFormatter,
    YardiFormatter,
    _period_label,
    _snapshot_tenant_name,
    _snapshot_token,
)

LEASE_ID = "11111111-2222-3333-4444-555555555555"
SNAPSHOT_ID = "99999999-8888-7777-6666-555555555555"


def _snapshot(lease_embed: object) -> dict:
    snap: dict = {
        "id": SNAPSHOT_ID,
        "properties": {"name": "Acme Plaza"},
        "lease_id": LEASE_ID,
        "period_start_date": date(2024, 1, 1),
        "period_end_date": date(2024, 12, 31),
        "total_recovery": Decimal("1234.56"),
        "total_operating_expenses": Decimal("1000.00"),
        "grossed_up_expenses": Decimal("1100.00"),
        "base_year_amount": Decimal("0.00"),
        "tenant_share_before_cap": Decimal("500.00"),
        "tenant_share_after_cap": Decimal("450.00"),
        "admin_fee": Decimal("50.00"),
    }
    if lease_embed is not None:
        snap["leases"] = lease_embed
    return snap


def test_resolve_from_object_embed() -> None:
    """PostgREST many-to-one embed: a single lease object."""
    assert (
        _snapshot_tenant_name(_snapshot({"tenant_name": "  Globex Corp  "}))
        == "Globex Corp"
    )


def test_resolve_from_list_embed() -> None:
    """Defensive: tolerate a list-shaped embed without blanking the name."""
    assert _snapshot_tenant_name(_snapshot([{"tenant_name": "Initech"}])) == "Initech"


def test_resolve_falls_back_to_empty_when_missing() -> None:
    """No lease embed and no top-level name → empty string (caller substitutes)."""
    assert _snapshot_tenant_name(_snapshot(None)) == ""
    assert _snapshot_tenant_name(_snapshot([])) == ""
    assert _snapshot_tenant_name(_snapshot("not-a-dict")) == ""
    assert _snapshot_tenant_name(_snapshot({"tenant_name": None})) == ""


def test_yardi_uses_tenant_name_and_traceable_reference() -> None:
    buf = YardiFormatter([_snapshot({"tenant_name": "Globex Corp"})]).generate()
    rows = list(csv.DictReader(StringIO(buf.getvalue())))
    assert rows
    for row in rows:
        assert row["Tenant"] == "Globex Corp"
        # Reference ties the journal entry back to the exact snapshot.
        assert SNAPSHOT_ID in row["Reference"]


def test_yardi_falls_back_to_lease_fragment_without_lease() -> None:
    buf = YardiFormatter([_snapshot(None)]).generate()
    rows = list(csv.DictReader(StringIO(buf.getvalue())))
    assert rows
    for row in rows:
        assert row["Tenant"] == LEASE_ID[:8]


def test_generic_csv_uses_tenant_name() -> None:
    buf = GenericCSVFormatter([_snapshot({"tenant_name": "Initech"})]).generate()
    rows = list(csv.DictReader(StringIO(buf.getvalue())))
    assert rows
    assert all(row["Tenant"] == "Initech" for row in rows)


def test_mri_fixed_width_uses_tenant_name_in_entity_field() -> None:
    buf = MRIFormatter([_snapshot({"tenant_name": "Initech"})]).generate()
    records = [ln for ln in buf.getvalue().split("\n") if ln]
    assert records
    # Entity field is chars 10..20 (Property is 0..10).
    for line in records:
        assert line[10:20].strip() == "Initech"


def test_period_label_single_year_is_the_year() -> None:
    """A full-year reconciliation reads as the year, not the start month."""
    assert _period_label(date(2024, 1, 1), date(2024, 12, 31)) == "2024"


def test_period_label_single_month_keeps_month() -> None:
    assert _period_label(date(2024, 3, 1), date(2024, 3, 31)) == "Mar 2024"


def test_period_label_spanning_years_shows_ascii_range() -> None:
    label = _period_label(date(2024, 7, 1), date(2025, 6, 30))
    assert label == "07/2024-06/2025"
    # ASCII hyphen only -- a legacy ERP import must not see an en-dash.
    assert "–" not in label


def test_yardi_description_uses_full_year_not_start_month() -> None:
    """Regression: annual reconciliations must not post as 'Jan 2024'."""
    buf = YardiFormatter([_snapshot({"tenant_name": "Globex Corp"})]).generate()
    rows = list(csv.DictReader(StringIO(buf.getvalue())))
    assert rows
    for row in rows:
        assert row["Description"] == "CAM Reconciliation 2024"


def test_snapshot_token_is_short_and_traceable() -> None:
    """8-char token fits a narrow reference field and ties back to the snapshot."""
    token = _snapshot_token(_snapshot({"tenant_name": "Initech"}))
    assert token == SNAPSHOT_ID.replace("-", "")[:8]
    assert len(token) == 8


def test_snapshot_token_falls_back_to_lease_id() -> None:
    snap = _snapshot({"tenant_name": "Initech"})
    del snap["id"]
    assert _snapshot_token(snap) == LEASE_ID.replace("-", "")[:8]


def test_mri_reference_is_traceable_and_fits_field() -> None:
    """MRI Reference carries a snapshot token (parity with Yardi) within 15 chars."""
    buf = MRIFormatter([_snapshot({"tenant_name": "Initech"})]).generate()
    records = [ln for ln in buf.getvalue().split("\n") if ln]
    assert records
    token = SNAPSHOT_ID.replace("-", "")[:8]
    for line in records:
        # Fields: Property(10) Entity(10) Account(10) Amount(15) Desc(30) Ref(15).
        reference = line[75:90].strip()  # Ref field is chars 75..90.
        assert reference == f"CAM24-{token}"
        assert len(reference) <= 15
        assert token in reference


def _yardi_amounts(total_recovery: Decimal) -> tuple[Decimal, Decimal]:
    """Return (AR debit, CAM credit) amounts parsed from the Yardi CSV."""
    snap = _snapshot({"tenant_name": "Globex Corp"})
    snap["total_recovery"] = total_recovery
    rows = list(csv.DictReader(StringIO(YardiFormatter([snap]).generate().getvalue())))
    ar = next(r for r in rows if r["Account"] == YardiFormatter.AR_ACCOUNT)
    cam = next(r for r in rows if r["Account"] == YardiFormatter.CAM_RECOVERY_ACCOUNT)
    return Decimal(ar["Amount"]), Decimal(cam["Amount"])


# A Yardi journal that does not net to zero is rejected on import. The AR debit
# and CAM credit are formatted independently (value and its negation), so the
# invariant to protect is that they still sum to exactly zero after rounding --
# including sub-cent inputs, where independent rounding of x and -x could drift.
def test_yardi_journal_balances_to_the_cent() -> None:
    debit, credit = _yardi_amounts(Decimal("1234.56"))
    assert debit + credit == Decimal("0.00")


def test_yardi_journal_balances_for_credit_reconciliation() -> None:
    # Tenant overpaid estimates -> total_recovery negative; legs must still net 0.
    debit, credit = _yardi_amounts(Decimal("-5000.00"))
    assert debit + credit == Decimal("0.00")
    assert debit == Decimal("-5000.00")


def test_yardi_journal_balances_with_sub_cent_input() -> None:
    # Half-cent inputs round to 2dp; x and -x must round symmetrically so the
    # journal still nets exactly zero (no stray ±0.01).
    for raw in ("5000.005", "2500.125", "1234.565", "-2500.125"):
        debit, credit = _yardi_amounts(Decimal(raw))
        assert debit + credit == Decimal("0.00"), f"unbalanced for {raw}"


def test_yardi_amounts_have_no_thousands_separator() -> None:
    # The Amount column is re-imported as a number; a thousands comma would
    # CSV-quote the cell and break numeric import (see GL-CSV cycle).
    snap = _snapshot({"tenant_name": "Globex Corp"})
    snap["total_recovery"] = Decimal("1234567.89")
    content = YardiFormatter([snap]).generate().getvalue()
    assert "1,234,567.89" not in content
    assert "1234567.89" in content
