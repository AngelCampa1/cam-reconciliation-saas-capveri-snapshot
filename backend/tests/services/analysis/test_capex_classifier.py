"""Tests for CapExClassifierService.

Rule evaluation tests use real business logic (no mocks).
Service persistence tests mock Supabase (external DB).
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.services.analysis.capex_classifier import (
    AccountCodePrefixRule,
    AccountKeywordRule,
    AmountKeywordComboRule,
    AmountThresholdRule,
    CapExClassifierService,
    VendorPatternRule,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _gl_entry(
    *,
    amount: str = "5000.00",
    account_code: str = "5300",
    account_description: str = "Janitorial Services",
    vendor_name: str = "Clean Co",
    description: str = "Monthly cleaning",
    entry_id: str | None = None,
) -> dict[str, Any]:
    """Build a mock GL entry dict as returned by Supabase."""
    return {
        "id": entry_id or str(uuid4()),
        "account_code": account_code,
        "account_description": account_description,
        "vendor_name": vendor_name,
        "description": description,
        "amount": amount,
        "transaction_date": "2024-06-15",
    }


class PagedQuery:
    def __init__(self, rows):
        self.rows = rows
        self._start = None
        self._end = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, start, end):
        self._start = start
        self._end = end
        return self

    def execute(self):
        response = MagicMock()
        if self._start is None or self._end is None:
            response.data = self.rows
        else:
            response.data = self.rows[self._start : self._end + 1]
        return response


class SchemaGuardPagedQuery(PagedQuery):
    def __init__(self, rows, valid_columns: set[str]):
        super().__init__(rows)
        self.valid_columns = valid_columns

    def eq(self, column, _value):
        if column not in self.valid_columns:
            raise AssertionError(f"invalid filter column: {column}")
        return self


# ---------------------------------------------------------------------------
# AmountThresholdRule
# ---------------------------------------------------------------------------


class TestAmountThresholdRule:
    """Tests for the amount_threshold rule."""

    def test_below_threshold_no_match(self) -> None:
        """Amounts below $25K should not trigger the rule."""
        rule = AmountThresholdRule()
        entry = _gl_entry(amount="24999.99")
        assert rule.evaluate(entry) is None

    def test_at_25k_threshold(self) -> None:
        """Amount at exactly $25K should trigger with 0.60 confidence."""
        rule = AmountThresholdRule()
        entry = _gl_entry(amount="25000.00")
        match = rule.evaluate(entry)
        assert match is not None
        assert match.confidence == Decimal("0.60")
        assert match.rule_name == "amount_threshold"

    def test_above_100k_high_confidence(self) -> None:
        """Amounts >= $100K should trigger with 0.85 confidence."""
        rule = AmountThresholdRule()
        entry = _gl_entry(amount="100000.00")
        match = rule.evaluate(entry)
        assert match is not None
        assert match.confidence == Decimal("0.85")

    def test_negative_amount_uses_absolute_value(self) -> None:
        """Negative amounts (credits/reversals) should be evaluated by absolute value."""
        rule = AmountThresholdRule()
        entry = _gl_entry(amount="-50000.00")
        match = rule.evaluate(entry)
        assert match is not None
        assert match.confidence == Decimal("0.60")


# ---------------------------------------------------------------------------
# AccountKeywordRule
# ---------------------------------------------------------------------------


class TestAccountKeywordRule:
    """Tests for the account_keyword rule."""

    def test_high_confidence_keyword(self) -> None:
        """Keywords like 'capital improvement' should match at 0.90."""
        rule = AccountKeywordRule()
        entry = _gl_entry(account_description="Capital Improvement — Lobby")
        match = rule.evaluate(entry)
        assert match is not None
        assert match.confidence == Decimal("0.90")
        assert "capital improvement" in match.matched_pattern.lower()

    def test_medium_confidence_keyword(self) -> None:
        """Keywords like 'replacement' should match at 0.65."""
        rule = AccountKeywordRule()
        entry = _gl_entry(account_description="HVAC Replacement")
        match = rule.evaluate(entry)
        assert match is not None
        assert match.confidence == Decimal("0.65")

    def test_no_match(self) -> None:
        """Normal OpEx descriptions should not trigger."""
        rule = AccountKeywordRule()
        entry = _gl_entry(account_description="Janitorial Services")
        assert rule.evaluate(entry) is None

    def test_keyword_in_description_field(self) -> None:
        """Should also check the GL entry description field, not just account_description."""
        rule = AccountKeywordRule()
        entry = _gl_entry(
            account_description="Maintenance",
            description="Tenant improvement allowance — Suite 200",
        )
        match = rule.evaluate(entry)
        assert match is not None
        assert match.confidence == Decimal("0.90")

    def test_case_insensitive(self) -> None:
        """Keyword matching should be case-insensitive."""
        rule = AccountKeywordRule()
        entry = _gl_entry(account_description="CAPITAL IMPROVEMENT PROJECT")
        match = rule.evaluate(entry)
        assert match is not None


# ---------------------------------------------------------------------------
# AccountCodePrefixRule
# ---------------------------------------------------------------------------


class TestAccountCodePrefixRule:
    """Tests for the account_code_prefix rule."""

    def test_matching_prefix_15(self) -> None:
        """Account codes starting with 15* should match (standard CapEx)."""
        rule = AccountCodePrefixRule()
        entry = _gl_entry(account_code="1500")
        match = rule.evaluate(entry)
        assert match is not None
        assert match.confidence == Decimal("0.75")
        assert match.rule_name == "account_code_prefix"

    def test_matching_prefix_17(self) -> None:
        """Account codes starting with 17* should match."""
        rule = AccountCodePrefixRule()
        entry = _gl_entry(account_code="1720.00")
        match = rule.evaluate(entry)
        assert match is not None

    def test_matching_prefix_18(self) -> None:
        """Account codes starting with 18* should match."""
        rule = AccountCodePrefixRule()
        entry = _gl_entry(account_code="1850")
        match = rule.evaluate(entry)
        assert match is not None

    def test_non_matching_code(self) -> None:
        """OpEx account codes (5xxx, 6xxx) should not trigger."""
        rule = AccountCodePrefixRule()
        entry = _gl_entry(account_code="5300")
        assert rule.evaluate(entry) is None


# ---------------------------------------------------------------------------
# VendorPatternRule
# ---------------------------------------------------------------------------


class TestVendorPatternRule:
    """Tests for the vendor_pattern rule."""

    def test_matching_vendor(self) -> None:
        """Vendors containing 'construction', 'roofing', etc. should match."""
        rule = VendorPatternRule()
        entry = _gl_entry(vendor_name="ABC Construction LLC")
        match = rule.evaluate(entry)
        assert match is not None
        assert match.confidence == Decimal("0.55")
        assert match.rule_name == "vendor_pattern"

    def test_roofing_vendor(self) -> None:
        """Roofing vendors should match."""
        rule = VendorPatternRule()
        entry = _gl_entry(vendor_name="Best Roofing & Waterproofing")
        match = rule.evaluate(entry)
        assert match is not None

    def test_paving_vendor(self) -> None:
        """Paving vendors should match."""
        rule = VendorPatternRule()
        entry = _gl_entry(vendor_name="National Paving Inc")
        match = rule.evaluate(entry)
        assert match is not None

    def test_no_vendor(self) -> None:
        """Entries without a vendor should not trigger."""
        rule = VendorPatternRule()
        entry = _gl_entry(vendor_name="")
        assert rule.evaluate(entry) is None

    def test_non_matching_vendor(self) -> None:
        """Normal maintenance vendors should not trigger."""
        rule = VendorPatternRule()
        entry = _gl_entry(vendor_name="ABM Industries")
        assert rule.evaluate(entry) is None


# ---------------------------------------------------------------------------
# AmountKeywordComboRule
# ---------------------------------------------------------------------------


class TestAmountKeywordComboRule:
    """Tests for the amount_keyword_combo rule."""

    def test_amount_plus_keyword(self) -> None:
        """Amount > $10K AND CapEx keyword should trigger at 0.80."""
        rule = AmountKeywordComboRule()
        entry = _gl_entry(amount="15000.00", account_description="HVAC Replacement")
        match = rule.evaluate(entry)
        assert match is not None
        assert match.confidence == Decimal("0.80")
        assert match.rule_name == "amount_keyword_combo"

    def test_amount_only_no_keyword(self) -> None:
        """Amount > $10K without keyword should not trigger combo rule."""
        rule = AmountKeywordComboRule()
        entry = _gl_entry(amount="15000.00", account_description="Janitorial")
        assert rule.evaluate(entry) is None

    def test_keyword_only_below_threshold(self) -> None:
        """CapEx keyword with amount <= $10K should not trigger combo rule."""
        rule = AmountKeywordComboRule()
        entry = _gl_entry(amount="5000.00", account_description="Roof Replacement")
        assert rule.evaluate(entry) is None


# ---------------------------------------------------------------------------
# CapExClassifierService.classify_entries (pure function)
# ---------------------------------------------------------------------------


class TestClassifyEntries:
    """Tests for the classify_entries pure function."""

    def test_multiple_entries_mixed_results(self) -> None:
        """Should return matches only for entries that trigger rules."""
        service = CapExClassifierService()
        entries = [
            _gl_entry(
                amount="150000.00",
                account_description="Roof Replacement",
                vendor_name="ABC Roofing",
                account_code="1500",
            ),
            _gl_entry(
                amount="2500.00",
                account_description="Janitorial Services",
                vendor_name="Clean Co",
                account_code="5300",
            ),
        ]

        results = service.classify_entries(entries)

        # First entry should have multiple matches; second entry none
        flagged_ids = {r.gl_entry_id for r in results}
        assert entries[0]["id"] in flagged_ids
        assert entries[1]["id"] not in flagged_ids

    def test_dedup_by_rule_name(self) -> None:
        """Each (entry, rule_name) pair should appear at most once."""
        service = CapExClassifierService()
        entries = [
            _gl_entry(amount="50000.00", account_description="Capital Improvement"),
        ]
        results = service.classify_entries(entries)
        rule_names = [r.rule_name for r in results]
        # No duplicate rule names for the same entry
        assert len(rule_names) == len(set(rule_names))

    def test_empty_entries(self) -> None:
        """Should return empty list for no entries."""
        service = CapExClassifierService()
        assert service.classify_entries([]) == []

    def test_no_matches_for_clean_entries(self) -> None:
        """Clean OpEx entries should produce no matches."""
        service = CapExClassifierService()
        entries = [
            _gl_entry(
                amount="8500.00",
                account_description="Janitorial",
                vendor_name="ABM Industries",
                account_code="5100",
            ),
            _gl_entry(
                amount="12000.00",
                account_description="Utilities — Electric",
                vendor_name="Reliant Energy",
                account_code="5200",
            ),
        ]
        assert service.classify_entries(entries) == []


# ---------------------------------------------------------------------------
# Service persistence methods (mock Supabase)
# ---------------------------------------------------------------------------


def _mock_supabase_for_classify(
    property_id: str,
    org_id: str,
    gl_entries: list[dict],
) -> MagicMock:
    """Create a Supabase mock pre-configured for run_classification.

    The mock chains match the server-side date-filtered query:
    .select("*").eq(...).gte(...).lte(...).execute()
    """
    db = MagicMock()
    upserted: list[dict] = []

    def table_side_effect(table_name: str) -> MagicMock:
        t = MagicMock()
        if table_name == "gl_entries":
            # Chain: select -> eq -> gte -> lte -> execute
            chain = t.select.return_value.eq.return_value
            chain.gte.return_value.lte.return_value.execute.return_value.data = (
                gl_entries
            )
            # Also support in_ chain for get_summary: select -> in_ -> execute
            t.select.return_value.in_.return_value.execute.return_value.data = (
                gl_entries
            )
        elif table_name == "capex_flags":

            def capture_upsert(data: list[dict], **kwargs: Any) -> MagicMock:
                upserted.extend(data)
                result_mock = MagicMock()
                result_mock.execute.return_value.data = data
                return result_mock

            t.upsert.side_effect = capture_upsert

            # For get_flags
            t.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value.data = (
                []
            )
            # For get_unreviewed_count
            t.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
                []
            )
        return t

    db.table.side_effect = table_side_effect
    db._upserted = upserted
    return db


class TestRunClassification:
    """Tests for run_classification (fetches entries, runs rules, upserts flags)."""

    @pytest.mark.asyncio
    async def test_run_creates_flags_for_capex_entries(self) -> None:
        """Should upsert CapEx flags for entries that trigger rules."""
        property_id = str(uuid4())
        org_id = str(uuid4())
        entries = [
            _gl_entry(
                amount="150000.00",
                account_description="Roof Replacement",
                account_code="1500",
                vendor_name="ABC Roofing",
            ),
            _gl_entry(
                amount="2500.00",
                account_description="Janitorial",
                account_code="5300",
            ),
        ]
        db = _mock_supabase_for_classify(property_id, org_id, entries)

        service = CapExClassifierService()
        result = await service.run_classification(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert result.gl_entries_scanned == 2
        assert result.flags_created > 0

    @pytest.mark.asyncio
    async def test_run_classification_includes_second_page_gl_entries(self) -> None:
        """Classification scans GL entries beyond the first Supabase page."""
        property_id = str(uuid4())
        org_id = str(uuid4())
        entries = [_gl_entry(amount="100.00") for _ in range(1000)]
        entries.append(
            _gl_entry(
                amount="150000.00",
                account_description="Roof Replacement",
                account_code="1500",
                vendor_name="ABC Roofing",
            )
        )
        upserted: list[dict[str, Any]] = []

        db = MagicMock()

        def table_side_effect(table_name: str):
            if table_name == "gl_entries":
                return PagedQuery(entries)
            if table_name == "capex_flags":
                table = MagicMock()

                def capture_upsert(data: list[dict], **_kwargs: Any) -> MagicMock:
                    upserted.extend(data)
                    result_mock = MagicMock()
                    result_mock.execute.return_value.data = data
                    return result_mock

                table.upsert.side_effect = capture_upsert
                return table
            return MagicMock()

        db.table.side_effect = table_side_effect

        service = CapExClassifierService()
        result = await service.run_classification(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert result.gl_entries_scanned == 1001
        assert result.flags_created > 0
        assert upserted

    @pytest.mark.asyncio
    async def test_run_classification_does_not_filter_gl_entries_by_org_column(
        self,
    ) -> None:
        """GL entries have no organization_id column; property scope plus RLS is used."""
        property_id = str(uuid4())
        org_id = str(uuid4())
        entries = [
            _gl_entry(
                amount="150000.00",
                account_description="Roof Replacement",
                account_code="1500",
            )
        ]
        upserted: list[dict[str, Any]] = []
        db = MagicMock()

        def table_side_effect(table_name: str):
            if table_name == "gl_entries":
                return SchemaGuardPagedQuery(
                    entries,
                    {"property_id", "transaction_date"},
                )
            if table_name == "capex_flags":
                table = MagicMock()

                def capture_upsert(data: list[dict], **_kwargs: Any) -> MagicMock:
                    upserted.extend(data)
                    result_mock = MagicMock()
                    result_mock.execute.return_value.data = data
                    return result_mock

                table.upsert.side_effect = capture_upsert
                return table
            return MagicMock()

        db.table.side_effect = table_side_effect

        service = CapExClassifierService()
        result = await service.run_classification(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert result.gl_entries_scanned == 1
        assert result.flags_created > 0
        assert upserted

    @pytest.mark.asyncio
    async def test_run_no_entries(self) -> None:
        """Should return zero counts when no GL entries exist."""
        property_id = str(uuid4())
        org_id = str(uuid4())
        db = _mock_supabase_for_classify(property_id, org_id, [])

        service = CapExClassifierService()
        result = await service.run_classification(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert result.gl_entries_scanned == 0
        assert result.flags_created == 0


class TestGetFlags:
    """Tests for get_flags (retrieves flags with optional disposition filter)."""

    @pytest.mark.asyncio
    async def test_returns_flags(self) -> None:
        """Should return flags for property/year."""
        property_id = str(uuid4())
        org_id = str(uuid4())
        now = datetime.now(UTC)

        db = MagicMock()
        flag_data = {
            "id": str(uuid4()),
            "organization_id": org_id,
            "gl_entry_id": str(uuid4()),
            "property_id": property_id,
            "period_year": 2024,
            "flag_reason": "Amount exceeds $100K",
            "rule_name": "amount_threshold",
            "confidence_score": "0.85",
            "matched_pattern": None,
            "disposition": "pending",
            "reviewed_at": None,
            "reviewed_by_user_id": None,
            "review_note": None,
            "classifier_version": "1.0",
            "created_at": now.isoformat(),
        }

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "capex_flags":
                t.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value.data = [
                    flag_data
                ]
            return t

        db.table.side_effect = table_side_effect

        service = CapExClassifierService()
        flags = await service.get_flags(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert len(flags) == 1
        assert flags[0].rule_name == "amount_threshold"

    @pytest.mark.asyncio
    async def test_returns_flags_from_second_page(self) -> None:
        """Flag retrieval includes rows beyond the first Supabase page."""
        property_id = str(uuid4())
        org_id = str(uuid4())
        now = datetime.now(UTC)
        flag_rows = [
            {
                "id": str(uuid4()),
                "organization_id": org_id,
                "gl_entry_id": str(uuid4()),
                "property_id": property_id,
                "period_year": 2024,
                "flag_reason": "Amount exceeds threshold",
                "rule_name": "amount_threshold",
                "confidence_score": "0.85",
                "matched_pattern": None,
                "disposition": "pending",
                "reviewed_at": None,
                "reviewed_by_user_id": None,
                "review_note": None,
                "classifier_version": "1.0",
                "created_at": now.isoformat(),
            }
            for _ in range(1001)
        ]

        db = MagicMock()
        db.table.side_effect = lambda table_name: (
            PagedQuery(flag_rows) if table_name == "capex_flags" else MagicMock()
        )

        service = CapExClassifierService()
        flags = await service.get_flags(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert len(flags) == 1001


class TestReviewFlag:
    """Tests for review_flag (set disposition with audit trail)."""

    @pytest.mark.asyncio
    async def test_confirm_flag(self) -> None:
        """Should set disposition to confirmed_capex with review fields."""
        flag_id = uuid4()
        user_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "capex_flags":
                t.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                    {
                        "id": str(flag_id),
                        "organization_id": str(org_id),
                        "gl_entry_id": str(uuid4()),
                        "property_id": str(uuid4()),
                        "period_year": 2024,
                        "flag_reason": "Amount exceeds $100K",
                        "rule_name": "amount_threshold",
                        "confidence_score": "0.85",
                        "matched_pattern": None,
                        "disposition": "confirmed_capex",
                        "reviewed_at": now.isoformat(),
                        "reviewed_by_user_id": str(user_id),
                        "review_note": "Confirmed roof project",
                        "classifier_version": "1.0",
                        "created_at": now.isoformat(),
                    }
                ]
            return t

        db.table.side_effect = table_side_effect

        service = CapExClassifierService()
        result = await service.review_flag(
            flag_id=flag_id,
            disposition="confirmed_capex",
            user_id=user_id,
            org_id=org_id,
            review_note="Confirmed roof project",
            supabase=db,
        )

        assert result.disposition == "confirmed_capex"
        assert result.reviewed_by_user_id == user_id

    @pytest.mark.asyncio
    async def test_review_not_found(self) -> None:
        """Should raise ValueError when flag not found."""
        flag_id = uuid4()
        user_id = uuid4()
        org_id = uuid4()

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "capex_flags":
                t.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
                    []
                )
            return t

        db.table.side_effect = table_side_effect

        service = CapExClassifierService()
        with pytest.raises(ValueError, match=str(flag_id)):
            await service.review_flag(
                flag_id=flag_id,
                disposition="dismissed",
                user_id=user_id,
                org_id=org_id,
                supabase=db,
            )


class TestGetUnreviewedCount:
    """Tests for get_unreviewed_count."""

    @pytest.mark.asyncio
    async def test_returns_count(self) -> None:
        """Should return count of pending flags."""
        property_id = str(uuid4())
        org_id = str(uuid4())

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "capex_flags":
                t.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                    {"id": str(uuid4())},
                    {"id": str(uuid4())},
                    {"id": str(uuid4())},
                ]
            return t

        db.table.side_effect = table_side_effect

        service = CapExClassifierService()
        count = await service.get_unreviewed_count(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert count == 3

    @pytest.mark.asyncio
    async def test_count_includes_second_page_flags(self) -> None:
        """Pending count includes flags beyond the first Supabase page."""
        property_id = str(uuid4())
        org_id = str(uuid4())
        rows = [{"id": str(uuid4())} for _ in range(1001)]

        db = MagicMock()
        db.table.side_effect = lambda table_name: (
            PagedQuery(rows) if table_name == "capex_flags" else MagicMock()
        )

        service = CapExClassifierService()
        count = await service.get_unreviewed_count(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert count == 1001

    @pytest.mark.asyncio
    async def test_returns_zero_when_none_pending(self) -> None:
        """Should return 0 when no pending flags."""
        property_id = str(uuid4())
        org_id = str(uuid4())

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "capex_flags":
                t.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
                    []
                )
            return t

        db.table.side_effect = table_side_effect

        service = CapExClassifierService()
        count = await service.get_unreviewed_count(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert count == 0


# ---------------------------------------------------------------------------
# get_summary
# ---------------------------------------------------------------------------


class TestGetSummary:
    """Tests for get_summary (joins to gl_entries for amounts)."""

    @pytest.mark.asyncio
    async def test_sums_gl_entry_amounts_not_confidence(self) -> None:
        """total_flagged_amount should be the sum of GL entry amounts, not confidence scores."""
        property_id = str(uuid4())
        org_id = str(uuid4())
        entry_id_1 = str(uuid4())
        entry_id_2 = str(uuid4())
        now = datetime.now(UTC)

        flag_data = [
            {
                "id": str(uuid4()),
                "organization_id": org_id,
                "gl_entry_id": entry_id_1,
                "property_id": property_id,
                "period_year": 2024,
                "flag_reason": "Amount exceeds $100K",
                "rule_name": "amount_threshold",
                "confidence_score": "0.85",
                "matched_pattern": None,
                "disposition": "pending",
                "reviewed_at": None,
                "reviewed_by_user_id": None,
                "review_note": None,
                "classifier_version": "1.0",
                "created_at": now.isoformat(),
            },
            {
                "id": str(uuid4()),
                "organization_id": org_id,
                "gl_entry_id": entry_id_2,
                "property_id": property_id,
                "period_year": 2024,
                "flag_reason": "CapEx keyword: capital improvement",
                "rule_name": "account_keyword",
                "confidence_score": "0.90",
                "matched_pattern": "capital improvement",
                "disposition": "confirmed_capex",
                "reviewed_at": now.isoformat(),
                "reviewed_by_user_id": str(uuid4()),
                "review_note": None,
                "classifier_version": "1.0",
                "created_at": now.isoformat(),
            },
        ]

        gl_entry_data = [
            {"id": entry_id_1, "amount": "150000.00"},
            {"id": entry_id_2, "amount": "45000.00"},
        ]

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "capex_flags":
                t.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value.data = (
                    flag_data
                )
            elif table_name == "gl_entries":
                t.select.return_value.in_.return_value.execute.return_value.data = (
                    gl_entry_data
                )
            return t

        db.table.side_effect = table_side_effect

        service = CapExClassifierService()
        summary = await service.get_summary(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert summary["total"] == 2
        assert summary["pending"] == 1
        assert summary["confirmed_capex"] == 1
        assert summary["dismissed"] == 0
        # Must be dollar amounts, not confidence scores
        assert summary["total_flagged_amount"] == Decimal("195000.00")

    @pytest.mark.asyncio
    async def test_summary_sums_chunked_second_page_gl_amounts(self) -> None:
        """Summary includes many flags and chunked GL amount lookups."""
        property_id = str(uuid4())
        org_id = str(uuid4())
        now = datetime.now(UTC)
        entry_ids = [str(uuid4()) for _ in range(501)]
        flag_rows = [
            {
                "id": str(uuid4()),
                "organization_id": org_id,
                "gl_entry_id": entry_id,
                "property_id": property_id,
                "period_year": 2024,
                "flag_reason": "Amount exceeds threshold",
                "rule_name": "amount_threshold",
                "confidence_score": "0.85",
                "matched_pattern": None,
                "disposition": "pending",
                "reviewed_at": None,
                "reviewed_by_user_id": None,
                "review_note": None,
                "classifier_version": "1.0",
                "created_at": now.isoformat(),
            }
            for entry_id in entry_ids
        ]
        gl_rows_by_id = {
            entry_id: {"id": entry_id, "amount": "1.00"} for entry_id in entry_ids
        }

        class FilteringPagedQuery(PagedQuery):
            def __init__(self, rows):
                super().__init__(rows)
                self.ids = None

            def in_(self, field, values):
                if field == "id":
                    self.ids = set(values)
                return self

            def execute(self):
                if self.ids is not None:
                    self.rows = [gl_rows_by_id[entry_id] for entry_id in self.ids]
                return super().execute()

        db = MagicMock()
        db.table.side_effect = lambda table_name: (
            PagedQuery(flag_rows)
            if table_name == "capex_flags"
            else FilteringPagedQuery([])
        )

        service = CapExClassifierService()
        summary = await service.get_summary(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert summary["total"] == 501
        assert summary["pending"] == 501
        assert summary["total_flagged_amount"] == Decimal("501.00")

    @pytest.mark.asyncio
    async def test_get_summary_chunks_gl_entries_in_filter_for_large_flag_sets(
        self,
    ) -> None:
        """BUG-10 regression: get_summary with >100 flagged entries must issue
        multiple .in_("id", ...) calls each <=100 ids, and sum all amounts.
        """
        property_id = str(uuid4())
        org_id = str(uuid4())
        now = datetime.now(UTC)

        # 150 distinct GL entries — more than the 100-id chunk limit.
        n = 150
        entry_ids = [str(uuid4()) for _ in range(n)]
        flag_rows = [
            {
                "id": str(uuid4()),
                "organization_id": org_id,
                "gl_entry_id": entry_id,
                "property_id": property_id,
                "period_year": 2024,
                "flag_reason": "Amount exceeds threshold",
                "rule_name": "amount_threshold",
                "confidence_score": "0.85",
                "matched_pattern": None,
                "disposition": "pending",
                "reviewed_at": None,
                "reviewed_by_user_id": None,
                "review_note": None,
                "classifier_version": "1.0",
                "created_at": now.isoformat(),
            }
            for entry_id in entry_ids
        ]
        gl_rows_by_id = {
            entry_id: {"id": entry_id, "amount": "1.00"} for entry_id in entry_ids
        }

        # Record each chunk passed to .in_("id", ...)
        recorded_chunks: list[list[str]] = []

        class RecordingPagedQuery(PagedQuery):
            def __init__(self, rows):
                super().__init__(rows)
                self._ids: list[str] | None = None

            def in_(self, field, values):
                if field == "id":
                    chunk = list(values)
                    recorded_chunks.append(chunk)
                    self._ids = chunk
                return self

            def execute(self):
                if self._ids is not None:
                    self.rows = [
                        gl_rows_by_id[eid] for eid in self._ids if eid in gl_rows_by_id
                    ]
                return super().execute()

        db = MagicMock()
        db.table.side_effect = lambda table_name: (
            PagedQuery(flag_rows)
            if table_name == "capex_flags"
            else RecordingPagedQuery([])
        )

        service = CapExClassifierService()
        summary = await service.get_summary(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        # Must have issued more than one .in_() call.
        assert (
            len(recorded_chunks) > 1
        ), f"Expected multiple chunked .in_() calls; got {len(recorded_chunks)}"
        # No chunk must exceed 100 ids.
        assert all(
            len(c) <= 100 for c in recorded_chunks
        ), f"A chunk exceeded 100 ids: {[len(c) for c in recorded_chunks]}"
        # All entry_ids queried (sum == n).
        assert sum(len(c) for c in recorded_chunks) == n
        # Correct total amount: 150 entries × $1.00 each.
        assert summary["total_flagged_amount"] == Decimal(str(n))

    @pytest.mark.asyncio
    async def test_empty_flags_returns_zero_amount(self) -> None:
        """Should return zero total_flagged_amount when no flags exist."""
        property_id = str(uuid4())
        org_id = str(uuid4())

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "capex_flags":
                t.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value.data = (
                    []
                )
            return t

        db.table.side_effect = table_side_effect

        service = CapExClassifierService()
        summary = await service.get_summary(
            property_id=property_id,
            period_year=2024,
            org_id=org_id,
            supabase=db,
        )

        assert summary["total"] == 0
        assert summary["total_flagged_amount"] == Decimal("0")
