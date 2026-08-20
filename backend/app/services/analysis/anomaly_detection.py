"""Anomaly detection service for historical expense analysis.

Detects unusual expense patterns using multiple algorithms:
- Variance-based detection (simple threshold)
- Statistical outliers (Isolation Forest)
- Trend anomalies (ARIMA)
- Category changes (new/missing pools)
"""

import fnmatch
import logging
import warnings
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from uuid import UUID

import numpy as np
from statsmodels.tsa.arima.model import ARIMA

from app.database.client import SupabaseDB
from app.database.pagination import fetch_all_pages

logger = logging.getLogger(__name__)


class AnomalySeverity(str, Enum):
    """Severity levels for detected anomalies."""

    INFO = "info"  # Notable but not concerning
    WARNING = "warning"  # 10-20% variance
    CRITICAL = "critical"  # >20% variance


class AnomalyType(str, Enum):
    """Types of anomalies that can be detected."""

    SPIKE = "spike"  # Sudden increase
    DROP = "drop"  # Sudden decrease
    NEW_CATEGORY = "new_category"  # Category not in prior years
    MISSING_CATEGORY = "missing_category"  # Category disappeared
    PATTERN_BREAK = "pattern_break"  # Unusual pattern (e.g., skip years)
    OUTLIER = "outlier"  # Statistical outlier across categories
    DENOMINATOR_SHIFT = "denominator_shift"  # RSF or lease roster changed


@dataclass
class DetectedAnomaly:
    """Represents a detected anomaly in expense data."""

    pool_name: str
    anomaly_type: AnomalyType
    severity: AnomalySeverity
    current_value: Decimal
    expected_value: Decimal
    variance_percent: Decimal
    explanation: str
    years_affected: list[int]


@dataclass
class AnomalyDetectionConfig:
    """Configuration for anomaly detection thresholds."""

    warning_threshold: Decimal = Decimal("0.10")  # 10%
    critical_threshold: Decimal = Decimal("0.20")  # 20%
    std_dev_multiplier: float = 2.0
    enabled_detection_types: list[str] | None = None

    def __post_init__(self) -> None:
        """Set default enabled detection types if not provided."""
        if self.enabled_detection_types is None:
            self.enabled_detection_types = [
                "variance",
                "category",
                "isolation_forest",
            ]


class AnomalyDetectionService:
    """Service for detecting anomalies in historical expense data."""

    def __init__(self, config: AnomalyDetectionConfig | None = None):
        """Initialize the anomaly detection service.

        Args:
            config: Configuration for detection thresholds
        """
        self.config = config or AnomalyDetectionConfig()

    async def detect_anomalies(
        self,
        property_id: UUID,
        target_year: int,
        comparison_years: list[int],
        db: SupabaseDB,
    ) -> list[DetectedAnomaly]:
        """Detect all anomalies for a property's expense data.

        Args:
            property_id: Property to analyze
            target_year: Year being analyzed
            comparison_years: Historical years to compare against (3+ recommended)
            db: Database session

        Returns:
            List of detected anomalies, sorted by severity
        """
        anomalies: list[DetectedAnomaly] = []

        # Load historical data
        historical_data = await self._load_historical_data(
            property_id, [target_year] + comparison_years, db
        )

        # 1. Variance-based detection
        if "variance" in (self.config.enabled_detection_types or []):
            anomalies.extend(
                self._detect_variance_anomalies(historical_data, target_year)
            )

        # 2. New/missing category detection
        if "category" in (self.config.enabled_detection_types or []):
            anomalies.extend(
                self._detect_category_changes(historical_data, target_year)
            )

        # 3. Isolation Forest cross-pool outlier detection
        if "isolation_forest" in (self.config.enabled_detection_types or []):
            anomalies.extend(
                self._detect_isolation_forest(historical_data, target_year)
            )

        # 4. ARIMA per-pool trend break detection
        if "arima" in (self.config.enabled_detection_types or []):
            anomalies.extend(self._detect_arima(historical_data, target_year))

        # 5. Denominator shift detection (RSF / lease roster changes)
        if "denominator_change" in (self.config.enabled_detection_types or []):
            anomalies.extend(
                await self._detect_denominator_shift_from_snapshots(
                    property_id, target_year, comparison_years, db
                )
            )

        # Deduplicate and sort by severity
        return self._deduplicate_and_rank(anomalies)

    async def _load_historical_data(
        self,
        property_id: UUID,
        years: list[int],
        db: SupabaseDB,
    ) -> dict[str, dict[int, Decimal]]:
        """Load historical expense data from Supabase for analysis.

        Queries expense_pools, pool_mappings, and gl_entries to build
        a {pool_name: {year: total_amount}} structure for anomaly detection.

        Args:
            property_id: Property to load data for
            years: Years to include
            db: Database session scoped to the requesting organization

        Returns:
            Dictionary mapping pool names to year->amount dictionaries
        """
        # 1. Get expense pools for the property
        pools = fetch_all_pages(
            lambda: db.table("expense_pools")
            .select("id, name")
            .eq("property_id", str(property_id))
        )
        if not pools:
            return {}

        pool_id_to_name: dict[str, str] = {p["id"]: p["name"] for p in pools}
        pool_ids = list(pool_id_to_name.keys())

        # 2. Get pool mappings (GL account patterns + allocation %)
        mappings = fetch_all_pages(
            lambda: db.table("pool_mappings")
            .select("expense_pool_id, gl_account_pattern, allocation_percentage")
            .in_("expense_pool_id", pool_ids)
        )
        if not mappings:
            return {}

        pool_mappings: dict[str, list[dict]] = {pid: [] for pid in pool_ids}
        for m in mappings:
            pool_mappings[m["expense_pool_id"]].append(m)

        # 3. Initialize result structure for all pools
        result: dict[str, dict[int, Decimal]] = {
            name: {} for name in pool_id_to_name.values()
        }

        # 4. For each year, aggregate GL entries into pools
        for year in years:
            gl_entries = fetch_all_pages(
                lambda: db.table("gl_entries")
                .select("account_code, amount")
                .eq("property_id", str(property_id))
                .eq("period_year", year)
            )

            pool_totals: dict[str, Decimal] = {pid: Decimal("0") for pid in pool_ids}

            for entry in gl_entries:
                code = entry["account_code"]
                amount = Decimal(str(entry.get("amount", 0)))

                for pool_id, mapping_list in pool_mappings.items():
                    for mapping in mapping_list:
                        pattern = mapping["gl_account_pattern"].replace("%", "*")
                        if fnmatch.fnmatch(code, pattern):
                            allocation = Decimal(
                                str(mapping.get("allocation_percentage", 1))
                            )
                            pool_totals[pool_id] += amount * allocation
                            break  # First match wins

            for pool_id, total in pool_totals.items():
                if total != Decimal("0"):
                    result[pool_id_to_name[pool_id]][year] = total

        return result

    def _detect_variance_anomalies(
        self,
        data: dict[str, dict[int, Decimal]],
        target_year: int,
    ) -> list[DetectedAnomaly]:
        """Detect simple percentage variance anomalies.

        Args:
            data: Historical data by pool and year
            target_year: Year to analyze

        Returns:
            List of variance-based anomalies
        """
        anomalies: list[DetectedAnomaly] = []

        for pool_name, year_data in data.items():
            if target_year not in year_data:
                continue

            current = year_data[target_year]
            prior_years = [v for y, v in year_data.items() if y < target_year]

            if not prior_years:
                continue

            # Calculate 3-year average (or available years)
            avg: Decimal = sum(prior_years) / Decimal(len(prior_years))

            if avg == 0:
                continue

            variance: Decimal = (current - avg) / avg

            # Determine severity
            if abs(variance) >= self.config.critical_threshold:
                severity = AnomalySeverity.CRITICAL
            elif abs(variance) >= self.config.warning_threshold:
                severity = AnomalySeverity.WARNING
            else:
                continue  # No anomaly

            anomaly_type = AnomalyType.SPIKE if variance > 0 else AnomalyType.DROP

            anomalies.append(
                DetectedAnomaly(
                    pool_name=pool_name,
                    anomaly_type=anomaly_type,
                    severity=severity,
                    current_value=current,
                    expected_value=avg,
                    variance_percent=variance * 100,
                    explanation=self._generate_variance_explanation(
                        pool_name, variance, current, avg
                    ),
                    years_affected=[target_year],
                )
            )

        return anomalies

    def _detect_category_changes(
        self,
        data: dict[str, dict[int, Decimal]],
        target_year: int,
    ) -> list[DetectedAnomaly]:
        """Detect new or missing expense categories.

        Args:
            data: Historical data by pool and year
            target_year: Year to analyze

        Returns:
            List of category change anomalies
        """
        anomalies: list[DetectedAnomaly] = []

        for pool_name, year_data in data.items():
            years = sorted(year_data.keys())
            has_target = target_year in year_data and year_data[target_year] > 0
            prior_years = [y for y in years if y < target_year]
            has_prior = any(year_data.get(y, Decimal("0")) > 0 for y in prior_years)

            if has_target and not has_prior:
                # New category
                anomalies.append(
                    DetectedAnomaly(
                        pool_name=pool_name,
                        anomaly_type=AnomalyType.NEW_CATEGORY,
                        severity=AnomalySeverity.INFO,
                        current_value=year_data[target_year],
                        expected_value=Decimal("0"),
                        variance_percent=Decimal("100"),
                        explanation=(
                            f"{pool_name} is a new expense category "
                            "not present in prior years"
                        ),
                        years_affected=[target_year],
                    )
                )

            elif has_prior and not has_target:
                # Missing category
                prior_avg: Decimal = sum(
                    year_data.get(y, Decimal("0")) for y in prior_years
                ) / Decimal(len(prior_years))
                anomalies.append(
                    DetectedAnomaly(
                        pool_name=pool_name,
                        anomaly_type=AnomalyType.MISSING_CATEGORY,
                        severity=AnomalySeverity.WARNING,
                        current_value=Decimal("0"),
                        expected_value=prior_avg,
                        variance_percent=Decimal("-100"),
                        explanation=(
                            f"{pool_name} was present in prior years "
                            f"but missing in {target_year}"
                        ),
                        years_affected=[target_year],
                    )
                )

        return anomalies

    def _detect_isolation_forest(
        self,
        data: dict[str, dict[int, Decimal]],
        target_year: int,
    ) -> list[DetectedAnomaly]:
        """Detect cross-pool outliers using robust modified Z-score.

        Computes the ratio of each pool's target-year value to its historical
        average, then applies a modified Z-score (MAD-based) to identify pools
        that deviate significantly from the cross-pool distribution.

        Requires >=2 comparison years.

        Args:
            data: Historical data by pool and year
            target_year: Year to analyze

        Returns:
            List of outlier anomalies
        """
        all_years = sorted({y for yd in data.values() for y in yd.keys()})
        comparison_years = [y for y in all_years if y < target_year]
        if len(comparison_years) < 2:
            return []

        pool_names = [p for p in data if target_year in data[p]]
        if not pool_names:
            return []

        # Compute ratio of target-year value to historical average for each pool
        target_ratios: dict[str, float] = {}
        historical_avgs: dict[str, Decimal] = {}
        for pool in pool_names:
            year_data = data[pool]
            hist_avg = sum(
                year_data.get(y, Decimal("0")) for y in comparison_years
            ) / Decimal(len(comparison_years))
            current = year_data.get(target_year, Decimal("0"))
            target_ratios[pool] = (
                float(current / hist_avg) if hist_avg != 0 else float(current)
            )
            historical_avgs[pool] = hist_avg

        # Modified Z-score using Median Absolute Deviation (robust for small samples)
        ratios_arr = np.array(list(target_ratios.values()), dtype=float)
        median = float(np.median(ratios_arr))
        abs_deviations = np.abs(ratios_arr - median)
        mad = float(np.median(abs_deviations))

        anomalies = []
        for pool, ratio in target_ratios.items():
            if mad == 0:
                # All pools have same ratio — flag only extreme multiples of median
                is_outlier = median > 0 and (ratio > median * 3 or ratio < median / 3)
            else:
                modified_zscore = abs(ratio - median) / (1.4826 * mad)
                is_outlier = modified_zscore > 3.5

            if is_outlier:
                current = data[pool].get(target_year, Decimal("0"))
                expected = historical_avgs[pool]
                variance = (current - expected) / expected if expected else Decimal("0")
                anomalies.append(
                    DetectedAnomaly(
                        pool_name=pool,
                        anomaly_type=AnomalyType.OUTLIER,
                        severity=AnomalySeverity.WARNING,
                        current_value=current,
                        expected_value=expected,
                        variance_percent=(variance * 100).quantize(Decimal("0.1")),
                        explanation=(
                            f"Statistical analysis flagged {pool} as a cross-pool "
                            f"outlier in {target_year} (modified Z-score > 3.5)."
                        ),
                        years_affected=[target_year],
                    )
                )

        return anomalies

    def _detect_arima(
        self,
        data: dict[str, dict[int, Decimal]],
        target_year: int,
    ) -> list[DetectedAnomaly]:
        """Detect per-pool trend breaks using AR(1).

        Requires >=3 data points per pool. Uses 95% confidence interval.

        Args:
            data: Historical data by pool and year
            target_year: Year to analyze

        Returns:
            List of pattern break anomalies
        """
        anomalies: list[DetectedAnomaly] = []
        all_years = sorted({y for yd in data.values() for y in yd.keys()})
        comparison_years = sorted(y for y in all_years if y < target_year)

        for pool_name, year_data in data.items():
            if target_year not in year_data:
                continue

            # Only include years where this pool has actual data
            hist_vals = [
                float(year_data[y]) for y in comparison_years if y in year_data
            ]
            if len(hist_vals) < 3:
                continue

            target_val = float(year_data[target_year])

            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    model = ARIMA(hist_vals, order=(1, 0, 0))
                    fit = model.fit()
                    forecast = fit.get_forecast(steps=1)
                    summary = forecast.summary_frame(alpha=0.05)
                    lower = float(summary["mean_ci_lower"].iloc[0])
                    upper = float(summary["mean_ci_upper"].iloc[0])

                if target_val < lower or target_val > upper:
                    expected = Decimal(str(summary["mean"].iloc[0]))
                    current = year_data[target_year]
                    variance = (
                        (current - expected) / expected if expected else Decimal("0")
                    )
                    direction = "above" if target_val > upper else "below"
                    anomalies.append(
                        DetectedAnomaly(
                            pool_name=pool_name,
                            anomaly_type=AnomalyType.PATTERN_BREAK,
                            severity=AnomalySeverity.WARNING,
                            current_value=current,
                            expected_value=expected,
                            variance_percent=(variance * 100).quantize(Decimal("0.1")),
                            explanation=(
                                f"{pool_name} in {target_year} is {direction} the 95% "
                                f"AR(1) forecast confidence interval based on "
                                f"{len(hist_vals)}-year trend."
                            ),
                            years_affected=[target_year],
                        )
                    )
            except (ValueError, np.linalg.LinAlgError, RuntimeError):
                logger.warning(
                    f"ARIMA failed for pool {pool_name}, skipping", exc_info=True
                )
                continue

        return anomalies

    async def _detect_denominator_shift_from_snapshots(
        self,
        property_id: UUID,
        target_year: int,
        comparison_years: list[int],
        db: SupabaseDB,
    ) -> list[DetectedAnomaly]:
        """Load snapshot data and detect denominator shifts.

        Queries finalized reconciliation snapshots for the target year and the
        most recent comparison year, then delegates to _detect_denominator_shift.
        """
        prior_year = max(comparison_years) if comparison_years else target_year - 1

        # Load target year snapshots
        target_snapshots = fetch_all_pages(
            lambda: db.table("reconciliation_snapshots")
            .select("id, property_id, lease_terms_snapshot")
            .eq("property_id", str(property_id))
            .eq("status", "finalized")
            .gte("period_start_date", f"{target_year}-01-01")
            .lte("period_end_date", f"{target_year}-12-31")
        )

        # Load prior year snapshots
        prior_snapshots = fetch_all_pages(
            lambda: db.table("reconciliation_snapshots")
            .select("id, property_id, lease_terms_snapshot")
            .eq("property_id", str(property_id))
            .eq("status", "finalized")
            .gte("period_start_date", f"{prior_year}-01-01")
            .lte("period_end_date", f"{prior_year}-12-31")
        )

        if not target_snapshots or not prior_snapshots:
            return []

        prior_rsf = self._sum_snapshot_rsf(prior_snapshots)
        current_rsf = self._sum_snapshot_rsf(target_snapshots)

        return self._detect_denominator_shift(
            property_id=property_id,
            target_year=target_year,
            comparison_years=comparison_years,
            prior_rsf=prior_rsf,
            current_rsf=current_rsf,
            prior_lease_count=len(prior_snapshots),
            current_lease_count=len(target_snapshots),
        )

    @staticmethod
    def _sum_snapshot_rsf(snapshots: list[dict]) -> Decimal:
        """Sum tenant rentable square feet from frozen lease-term snapshots."""
        total = Decimal("0")
        for snapshot in snapshots:
            terms = snapshot.get("lease_terms_snapshot") or {}
            total += Decimal(str(terms.get("rentable_square_feet", "0") or "0"))
        return total

    def _detect_denominator_shift(
        self,
        property_id: UUID,
        target_year: int,
        comparison_years: list[int],
        prior_rsf: Decimal,
        current_rsf: Decimal,
        prior_lease_count: int,
        current_lease_count: int,
    ) -> list[DetectedAnomaly]:
        """Detect denominator shifts between periods.

        Lightweight check: did total RSF or lease count change between
        target year and prior? Returns anomalies flagging the shift.

        Args:
            property_id: Property being analyzed
            target_year: Current year
            comparison_years: Prior years for comparison
            prior_rsf: Prior period total rentable square footage
            current_rsf: Current period total rentable square footage
            prior_lease_count: Number of leases in prior period
            current_lease_count: Number of leases in current period

        Returns:
            List of DENOMINATOR_SHIFT anomalies (0, 1, or 2)
        """
        anomalies: list[DetectedAnomaly] = []

        # Check RSF change
        if prior_rsf != current_rsf and prior_rsf > 0:
            variance = (current_rsf - prior_rsf) / prior_rsf
            abs_variance = abs(variance)

            if abs_variance >= self.config.critical_threshold:
                severity = AnomalySeverity.CRITICAL
            elif abs_variance >= self.config.warning_threshold:
                severity = AnomalySeverity.WARNING
            else:
                severity = AnomalySeverity.INFO

            direction = "increased" if variance > 0 else "decreased"
            anomalies.append(
                DetectedAnomaly(
                    pool_name="Total Rentable SF",
                    anomaly_type=AnomalyType.DENOMINATOR_SHIFT,
                    severity=severity,
                    current_value=current_rsf,
                    expected_value=prior_rsf,
                    variance_percent=(variance * 100).quantize(Decimal("0.1")),
                    explanation=(
                        f"Total rentable SF {direction} from "
                        f"{prior_rsf:,.0f} to {current_rsf:,.0f} "
                        f"({variance * 100:+.1f}%). "
                        f"This affects all tenant pro-rata share calculations."
                    ),
                    years_affected=[target_year],
                )
            )

        # Check lease count change
        if prior_lease_count != current_lease_count:
            delta = current_lease_count - prior_lease_count
            direction = "increased" if delta > 0 else "decreased"
            severity = (
                AnomalySeverity.WARNING if abs(delta) >= 2 else AnomalySeverity.INFO
            )

            anomalies.append(
                DetectedAnomaly(
                    pool_name="Lease Roster",
                    anomaly_type=AnomalyType.DENOMINATOR_SHIFT,
                    severity=severity,
                    current_value=Decimal(str(current_lease_count)),
                    expected_value=Decimal(str(prior_lease_count)),
                    variance_percent=Decimal("0"),
                    explanation=(
                        f"Lease count {direction} from {prior_lease_count} "
                        f"to {current_lease_count} ({delta:+d} leases). "
                        f"Tenant roster changes affect pro-rata share distribution."
                    ),
                    years_affected=[target_year],
                )
            )

        return anomalies

    def _generate_variance_explanation(
        self,
        pool_name: str,
        variance: Decimal,
        current: Decimal,
        expected: Decimal,
    ) -> str:
        """Generate human-readable explanation for variance.

        Args:
            pool_name: Name of the expense pool
            variance: Variance as decimal (e.g., 0.15 for 15%)
            current: Current year value
            expected: Expected value (average)

        Returns:
            Explanation string
        """
        direction = "increased" if variance > 0 else "decreased"
        pct = abs(variance * 100)
        return (
            f"{pool_name} {direction} by {pct:.1f}% compared to the 3-year average. "
            f"Current: ${current:,.2f}, Expected: ${expected:,.2f}"
        )

    def _deduplicate_and_rank(
        self, anomalies: list[DetectedAnomaly]
    ) -> list[DetectedAnomaly]:
        """Remove duplicates and sort by severity.

        Args:
            anomalies: List of detected anomalies

        Returns:
            Deduplicated and sorted list
        """
        # Remove exact duplicates based on pool_name and type
        seen = set()
        unique_anomalies = []

        for anomaly in anomalies:
            key = (anomaly.pool_name, anomaly.anomaly_type)
            if key not in seen:
                seen.add(key)
                unique_anomalies.append(anomaly)

        # Sort by severity (critical first, then warning, then info)
        severity_order = {
            AnomalySeverity.CRITICAL: 0,
            AnomalySeverity.WARNING: 1,
            AnomalySeverity.INFO: 2,
        }

        return sorted(unique_anomalies, key=lambda a: severity_order[a.severity])
