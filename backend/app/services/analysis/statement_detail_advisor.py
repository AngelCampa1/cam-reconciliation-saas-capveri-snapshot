"""Statement detail level advisor for pre-export analysis.

Analyzes statement granularity before PDF export and suggests grouping
strategies to reduce tenant dispute risk. Advisory only — does not
automatically change anything.

Heuristics:
1. Pool with > max_lines_per_category items → suggest grouping
   Severity: >1x=SUGGESTION, >2x=WARNING, >3x=CRITICAL
2. Line item amount < immaterial_threshold_pct% of pool total → flag immaterial
3. Total lines > ideal_range high → SUGGESTION; worst individual propagates
"""

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum


class DetailSeverity(str, Enum):
    """Severity levels for detail advisory findings."""

    OK = "ok"
    SUGGESTION = "suggestion"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class DetailAdvisorConfig:
    """Configuration for statement detail analysis thresholds."""

    max_lines_per_category: int = 5
    immaterial_threshold_pct: Decimal = Decimal("0.5")
    ideal_line_range: tuple[int, int] = (15, 25)


@dataclass
class LineItemEntry:
    """A single GL line item within a pool."""

    account_code: str
    account_description: str
    amount: Decimal


@dataclass
class PoolLineItemDetail:
    """Line-item detail for a single expense pool."""

    pool_name: str
    pool_type: str
    items: list[LineItemEntry]
    pool_total: Decimal


@dataclass
class GroupingSuggestion:
    """Suggestion to group overly granular line items."""

    category_name: str
    current_line_count: int
    suggested_label: str
    severity: DetailSeverity
    explanation: str


@dataclass
class ImmaterialItem:
    """A line item flagged as immaterial relative to the total."""

    account_code: str
    account_description: str
    amount: Decimal
    percent_of_total: Decimal
    pool_name: str


@dataclass
class DetailLevelAdvisory:
    """Complete advisory result from detail level analysis."""

    total_line_items: int
    total_categories: int
    overall_severity: DetailSeverity
    summary: str
    grouping_suggestions: list[GroupingSuggestion] = field(default_factory=list)
    immaterial_items: list[ImmaterialItem] = field(default_factory=list)
    suggested_total_lines: int = 0


_SEVERITY_ORDER = {
    DetailSeverity.OK: 0,
    DetailSeverity.SUGGESTION: 1,
    DetailSeverity.WARNING: 2,
    DetailSeverity.CRITICAL: 3,
}


class StatementDetailAdvisor:
    """Analyzes statement granularity and suggests grouping strategies."""

    def __init__(self, config: DetailAdvisorConfig | None = None) -> None:
        self.config = config or DetailAdvisorConfig()

    def analyze(
        self,
        pools: list[PoolLineItemDetail],
    ) -> DetailLevelAdvisory:
        """Analyze statement detail level and return advisory."""
        total_line_items = sum(len(p.items) for p in pools)
        total_categories = len(pools)

        grouping_suggestions: list[GroupingSuggestion] = []
        immaterial_items: list[ImmaterialItem] = []

        for pool in pools:
            suggestion = self._check_category_granularity(pool)
            if suggestion is not None:
                grouping_suggestions.append(suggestion)
            immaterial_items.extend(self._check_immaterial_items(pool))

        overall_severity = self._compute_overall_severity(
            total_line_items, grouping_suggestions
        )
        suggested_total_lines = self._compute_suggested_total_lines(
            pools, grouping_suggestions
        )
        summary = self._generate_summary(
            total_line_items, total_categories, overall_severity
        )

        return DetailLevelAdvisory(
            total_line_items=total_line_items,
            total_categories=total_categories,
            overall_severity=overall_severity,
            summary=summary,
            grouping_suggestions=grouping_suggestions,
            immaterial_items=immaterial_items,
            suggested_total_lines=suggested_total_lines,
        )

    def _check_category_granularity(
        self, pool: PoolLineItemDetail
    ) -> GroupingSuggestion | None:
        """Check if a pool has too many line items and suggest grouping."""
        threshold = self.config.max_lines_per_category
        count = len(pool.items)

        if count <= threshold:
            return None

        ratio = count / threshold
        if ratio > 3:
            severity = DetailSeverity.CRITICAL
        elif ratio > 2:
            severity = DetailSeverity.WARNING
        else:
            severity = DetailSeverity.SUGGESTION

        return GroupingSuggestion(
            category_name=pool.pool_name,
            current_line_count=count,
            suggested_label=pool.pool_name,
            severity=severity,
            explanation=(
                f"You have {count} individual line items in {pool.pool_name}. "
                f"Consider presenting them as a single '{pool.pool_name}' line."
            ),
        )

    def _check_immaterial_items(self, pool: PoolLineItemDetail) -> list[ImmaterialItem]:
        """Flag line items below the immaterial threshold relative to pool total."""
        if pool.pool_total <= Decimal("0"):
            return []

        threshold_pct = self.config.immaterial_threshold_pct
        flagged: list[ImmaterialItem] = []

        for item in pool.items:
            if item.amount <= Decimal("0"):
                continue
            pct = (item.amount / pool.pool_total) * Decimal("100")
            if pct < threshold_pct:
                flagged.append(
                    ImmaterialItem(
                        account_code=item.account_code,
                        account_description=item.account_description,
                        amount=item.amount,
                        percent_of_total=pct,
                        pool_name=pool.pool_name,
                    )
                )

        return flagged

    def _compute_overall_severity(
        self,
        total_line_items: int,
        suggestions: list[GroupingSuggestion],
    ) -> DetailSeverity:
        """Determine overall severity from line count and individual suggestions."""
        # No detail line items means there is nothing to review. This is an
        # incomplete-setup state (GL entries not mapped to pools), not a clean
        # statement, so surface it as guidance rather than "OK".
        if total_line_items == 0:
            return DetailSeverity.SUGGESTION

        severities: list[DetailSeverity] = []

        # Check total line count against ideal range
        _, high = self.config.ideal_line_range
        if total_line_items > high * 2:
            severities.append(DetailSeverity.WARNING)
        elif total_line_items > high:
            severities.append(DetailSeverity.SUGGESTION)

        # Include worst individual suggestion severity
        for s in suggestions:
            severities.append(s.severity)

        if not severities:
            return DetailSeverity.OK

        return max(severities, key=lambda s: _SEVERITY_ORDER[s])

    def _compute_suggested_total_lines(
        self,
        pools: list[PoolLineItemDetail],
        suggestions: list[GroupingSuggestion],
    ) -> int:
        """Calculate the post-grouping line count."""
        grouped_pools = {s.category_name for s in suggestions}
        total = 0
        for pool in pools:
            if pool.pool_name in grouped_pools:
                total += 1  # grouped into single line
            else:
                total += len(pool.items)
        return total

    def _generate_summary(
        self,
        total_line_items: int,
        total_categories: int,
        overall_severity: DetailSeverity,
    ) -> str:
        """Generate a human-readable summary string."""
        low, high = self.config.ideal_line_range
        if total_line_items == 0:
            return (
                "No detail line items found for this statement. "
                "Check that GL entries are mapped to expense pools "
                "before exporting."
            )
        if overall_severity == DetailSeverity.OK:
            return (
                f"Statement has {total_line_items} line items across "
                f"{total_categories} categories. "
                f"This is within the ideal range of {low}–{high} lines."
            )
        return (
            f"Statement has {total_line_items} line items across "
            f"{total_categories} categories. "
            f"The ideal range is {low}–{high} lines. "
            f"Consider grouping to reduce dispute risk."
        )
