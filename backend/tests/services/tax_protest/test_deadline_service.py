"""
Unit tests for the tax protest deadline service.

Tests cover:
- Override takes precedence over county JSON
- Falls back to county JSON when no override
- Returns None when county unconfigured
- Days remaining positive and negative
- Unknown county returns None
- compute_effective_deadline with reference year
"""

from datetime import date
from unittest.mock import MagicMock

from app.services.tax_protest.deadline_service import (
    CountyDeadline,
    compute_days_remaining,
    compute_effective_deadline,
    get_deadline_for_county,
    get_property_tax_protest_config,
    load_county_deadlines,
)

# ---------------------------------------------------------------------------
# load_county_deadlines
# ---------------------------------------------------------------------------


class TestLoadCountyDeadlines:
    def test_returns_list_of_county_deadline_objects(self):
        deadlines = load_county_deadlines()
        assert isinstance(deadlines, list)
        assert len(deadlines) >= 10

    def test_each_entry_has_required_fields(self):
        deadlines = load_county_deadlines()
        for d in deadlines:
            assert isinstance(d, CountyDeadline)
            assert d.state and len(d.state) == 2
            assert d.county
            assert 1 <= d.deadline_month <= 12
            assert 1 <= d.deadline_day <= 31

    def test_harris_county_tx_present(self):
        deadlines = load_county_deadlines()
        harris = [d for d in deadlines if d.state == "TX" and d.county == "Harris"]
        assert len(harris) == 1
        assert harris[0].deadline_month == 5
        assert harris[0].deadline_day == 15


# ---------------------------------------------------------------------------
# get_deadline_for_county
# ---------------------------------------------------------------------------


class TestGetDeadlineForCounty:
    def test_found_by_state_and_county(self):
        result = get_deadline_for_county("TX", "Harris")
        assert result is not None
        assert result.state == "TX"
        assert result.county == "Harris"

    def test_case_insensitive_lookup(self):
        result = get_deadline_for_county("tx", "harris")
        assert result is not None

    def test_unknown_county_returns_none(self):
        result = get_deadline_for_county("TX", "NonexistentCounty")
        assert result is None

    def test_unknown_state_returns_none(self):
        result = get_deadline_for_county("ZZ", "Harris")
        assert result is None


# ---------------------------------------------------------------------------
# compute_effective_deadline
# ---------------------------------------------------------------------------


class TestComputeEffectiveDeadline:
    def test_override_takes_precedence_over_county(self):
        county = CountyDeadline(
            state="TX", county="Harris", deadline_month=5, deadline_day=15, notes=""
        )
        override = date(2025, 4, 1)
        result = compute_effective_deadline(county, override, 2025)
        assert result == override

    def test_falls_back_to_county_json(self):
        county = CountyDeadline(
            state="TX", county="Harris", deadline_month=5, deadline_day=15, notes=""
        )
        result = compute_effective_deadline(county, None, 2025)
        assert result == date(2025, 5, 15)

    def test_returns_none_when_unconfigured(self):
        result = compute_effective_deadline(None, None, 2025)
        assert result is None

    def test_uses_reference_year_for_county_date(self):
        county = CountyDeadline(
            state="CA",
            county="Los Angeles",
            deadline_month=12,
            deadline_day=1,
            notes="",
        )
        result = compute_effective_deadline(county, None, 2026)
        assert result == date(2026, 12, 1)


# ---------------------------------------------------------------------------
# compute_days_remaining
# ---------------------------------------------------------------------------


class TestComputeDaysRemaining:
    def test_positive_when_deadline_in_future(self):
        future_date = date(2099, 12, 31)
        assert compute_days_remaining(future_date) > 0

    def test_negative_when_deadline_passed(self):
        past_date = date(2000, 1, 1)
        assert compute_days_remaining(past_date) < 0

    def test_zero_on_deadline_day(self, monkeypatch):
        target = date(2025, 5, 15)
        import app.services.tax_protest.deadline_service as svc

        monkeypatch.setattr(svc, "_today", lambda: target)
        assert compute_days_remaining(target) == 0

    def test_exact_count(self, monkeypatch):
        import app.services.tax_protest.deadline_service as svc

        monkeypatch.setattr(svc, "_today", lambda: date(2025, 5, 1))
        assert compute_days_remaining(date(2025, 5, 15)) == 14


# ---------------------------------------------------------------------------
# get_property_tax_protest_config
# ---------------------------------------------------------------------------


class TestGetPropertyTaxProtestConfig:
    def _make_ctx(self, row: dict) -> MagicMock:
        ctx = MagicMock()
        ctx.org_id = "org-1"
        result = MagicMock()
        result.data = [row]
        ctx.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            result
        )
        return ctx

    def test_returns_config_dict(self):
        ctx = self._make_ctx(
            {
                "state": "TX",
                "tax_protest_county": "Harris",
                "tax_protest_deadline_override": None,
            }
        )
        from uuid import uuid4

        result = get_property_tax_protest_config(ctx, uuid4())
        assert result["state"] == "TX"
        assert result["tax_protest_county"] == "Harris"
        assert result["tax_protest_deadline_override"] is None

    def test_returns_empty_strings_when_not_set(self):
        ctx = self._make_ctx(
            {
                "state": "CA",
                "tax_protest_county": None,
                "tax_protest_deadline_override": None,
            }
        )
        from uuid import uuid4

        result = get_property_tax_protest_config(ctx, uuid4())
        assert result["state"] == "CA"
        assert result["tax_protest_county"] is None
