"""Tests for the statement detail level advisor service."""

from decimal import Decimal

from app.services.analysis.statement_detail_advisor import (
    DetailAdvisorConfig,
    DetailLevelAdvisory,
    DetailSeverity,
    LineItemEntry,
    PoolLineItemDetail,
    StatementDetailAdvisor,
)


def _entry(code: str, desc: str, amount: str) -> LineItemEntry:
    return LineItemEntry(
        account_code=code, account_description=desc, amount=Decimal(amount)
    )


def _pool(
    name: str, items: list[LineItemEntry], pool_type: str = "operating"
) -> PoolLineItemDetail:
    total = sum(i.amount for i in items)
    return PoolLineItemDetail(
        pool_name=name, pool_type=pool_type, items=items, pool_total=total
    )


class TestDetailAdvisorConfig:
    def test_default_config(self) -> None:
        config = DetailAdvisorConfig()
        assert config.max_lines_per_category == 5
        assert config.immaterial_threshold_pct == Decimal("0.5")
        assert config.ideal_line_range == (15, 25)

    def test_custom_thresholds(self) -> None:
        config = DetailAdvisorConfig(
            max_lines_per_category=10,
            immaterial_threshold_pct=Decimal("1.0"),
            ideal_line_range=(20, 40),
        )
        assert config.max_lines_per_category == 10
        assert config.immaterial_threshold_pct == Decimal("1.0")
        assert config.ideal_line_range == (20, 40)


class TestCategoryGranularity:
    def test_pool_under_threshold_no_suggestion(self) -> None:
        items = [_entry(f"5{i}00", f"Item {i}", "1000") for i in range(3)]
        pool = _pool("Utilities", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert len(result.grouping_suggestions) == 0

    def test_pool_over_threshold_suggestion(self) -> None:
        items = [_entry(f"5{i:02d}0", f"Landscaping item {i}", "500") for i in range(7)]
        pool = _pool("Landscaping", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert len(result.grouping_suggestions) == 1
        assert result.grouping_suggestions[0].severity == DetailSeverity.SUGGESTION

    def test_pool_exactly_2x_threshold_stays_suggestion(self) -> None:
        items = [_entry(f"5{i:02d}0", f"Item {i}", "500") for i in range(10)]
        pool = _pool("Exact 2x", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert len(result.grouping_suggestions) == 1
        assert result.grouping_suggestions[0].severity == DetailSeverity.SUGGESTION

    def test_pool_exactly_3x_threshold_stays_warning(self) -> None:
        items = [_entry(f"5{i:02d}0", f"Item {i}", "500") for i in range(15)]
        pool = _pool("Exact 3x", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert len(result.grouping_suggestions) == 1
        assert result.grouping_suggestions[0].severity == DetailSeverity.WARNING

    def test_pool_2x_threshold_warning(self) -> None:
        items = [_entry(f"5{i:02d}0", f"Maint item {i}", "200") for i in range(12)]
        pool = _pool("Maintenance", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert len(result.grouping_suggestions) == 1
        assert result.grouping_suggestions[0].severity == DetailSeverity.WARNING

    def test_pool_3x_threshold_critical(self) -> None:
        items = [_entry(f"5{i:02d}0", f"Repair item {i}", "100") for i in range(16)]
        pool = _pool("Repairs", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert len(result.grouping_suggestions) == 1
        assert result.grouping_suggestions[0].severity == DetailSeverity.CRITICAL

    def test_suggested_label_uses_pool_name(self) -> None:
        items = [_entry(f"5{i:02d}0", f"Grounds item {i}", "300") for i in range(7)]
        pool = _pool("Landscaping & Grounds", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert result.grouping_suggestions[0].suggested_label == "Landscaping & Grounds"


class TestImmaterialItems:
    def test_item_above_immaterial_threshold_not_flagged(self) -> None:
        items = [_entry("5100", "Big expense", "1000")]
        pool = _pool("Utilities", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert len(result.immaterial_items) == 0

    def test_item_below_immaterial_threshold_flagged(self) -> None:
        items = [
            _entry("5100", "Big expense", "10000"),
            _entry("5200", "Tiny expense", "15"),
        ]
        pool = _pool("Utilities", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert len(result.immaterial_items) == 1
        assert result.immaterial_items[0].account_code == "5200"
        assert result.immaterial_items[0].percent_of_total < Decimal("0.5")

    def test_zero_total_no_division_error(self) -> None:
        items = [_entry("5100", "Zero item", "0")]
        pool = _pool("Empty", items)
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([pool])
        assert result.overall_severity == DetailSeverity.OK
        assert len(result.immaterial_items) == 0


class TestOverallSeverity:
    def test_under_ideal_range_ok(self) -> None:
        items = [_entry(f"5{i:02d}0", f"Item {i}", "1000") for i in range(4)]
        pools = [_pool("Pool A", items[:2]), _pool("Pool B", items[2:])]
        advisor = StatementDetailAdvisor()
        result = advisor.analyze(pools)
        assert result.overall_severity == DetailSeverity.OK

    def test_over_ideal_range_suggestion(self) -> None:
        items = [_entry(f"5{i:03d}", f"Item {i}", "500") for i in range(30)]
        pools = [_pool("Big Pool", items)]
        advisor = StatementDetailAdvisor(DetailAdvisorConfig(max_lines_per_category=50))
        result = advisor.analyze(pools)
        assert result.overall_severity in (
            DetailSeverity.SUGGESTION,
            DetailSeverity.WARNING,
        )

    def test_no_line_items_returns_suggestion(self) -> None:
        advisor = StatementDetailAdvisor()
        result = advisor.analyze([])
        assert result.total_line_items == 0
        assert result.overall_severity == DetailSeverity.SUGGESTION
        assert "no detail line items" in result.summary.lower()

    def test_empty_pools_returns_suggestion(self) -> None:
        pools = [_pool("Empty Pool", [])]
        advisor = StatementDetailAdvisor()
        result = advisor.analyze(pools)
        assert result.total_line_items == 0
        assert result.overall_severity == DetailSeverity.SUGGESTION

    def test_worst_severity_propagates(self) -> None:
        small_items = [_entry(f"5{i:02d}0", f"Small {i}", "500") for i in range(3)]
        big_items = [_entry(f"6{i:02d}0", f"Big {i}", "100") for i in range(16)]
        pools = [_pool("Small Pool", small_items), _pool("Big Pool", big_items)]
        advisor = StatementDetailAdvisor()
        result = advisor.analyze(pools)
        assert result.overall_severity == DetailSeverity.CRITICAL


class TestSummary:
    def test_summary_includes_counts_and_range(self) -> None:
        items = [_entry(f"5{i:02d}0", f"Item {i}", "500") for i in range(4)]
        pools = [_pool("Pool A", items[:2]), _pool("Pool B", items[2:])]
        advisor = StatementDetailAdvisor()
        result = advisor.analyze(pools)
        assert "4" in result.summary  # total lines
        assert "2" in result.summary  # categories
        assert "15" in result.summary or "25" in result.summary  # ideal range mention


class TestEndToEnd:
    def test_clean_statement_returns_ok(self) -> None:
        pools = [
            _pool(
                "Utilities",
                [_entry("5100", "Electric", "5000"), _entry("5200", "Water", "3000")],
            ),
            _pool("Insurance", [_entry("6100", "Property insurance", "8000")]),
        ]
        advisor = StatementDetailAdvisor()
        result = advisor.analyze(pools)
        assert isinstance(result, DetailLevelAdvisory)
        assert result.overall_severity == DetailSeverity.OK
        assert result.total_line_items == 3
        assert result.total_categories == 2
        assert len(result.grouping_suggestions) == 0

    def test_granular_statement_returns_suggestions(self) -> None:
        landscaping = [
            _entry(f"51{i:02d}", f"Landscaping {i}", "200") for i in range(8)
        ]
        repairs = [_entry(f"52{i:02d}", f"Repair {i}", "150") for i in range(7)]
        pools = [_pool("Landscaping", landscaping), _pool("Repairs", repairs)]
        advisor = StatementDetailAdvisor()
        result = advisor.analyze(pools)
        assert len(result.grouping_suggestions) == 2
        assert result.overall_severity != DetailSeverity.OK

    def test_suggested_total_lines_calculated(self) -> None:
        landscaping = [
            _entry(f"51{i:02d}", f"Landscaping {i}", "200") for i in range(8)
        ]
        insurance = [_entry("6100", "Property insurance", "8000")]
        pools = [_pool("Landscaping", landscaping), _pool("Insurance", insurance)]
        advisor = StatementDetailAdvisor()
        result = advisor.analyze(pools)
        # 8 landscaping items grouped to 1 + 1 insurance = 2
        assert result.suggested_total_lines == 2
