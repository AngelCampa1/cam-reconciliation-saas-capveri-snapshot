"""Tests for anomaly detection service."""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.analysis.anomaly_detection import (
    AnomalyDetectionConfig,
    AnomalyDetectionService,
    AnomalySeverity,
    AnomalyType,
    DetectedAnomaly,
)


class PagedQuery:
    def __init__(self, rows):
        self.rows = rows
        self._start = None
        self._end = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
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


class TestAnomalyEnums:
    """Test anomaly enums and types."""

    def test_severity_enum_values(self):
        """Test severity enum has expected values."""
        assert AnomalySeverity.INFO == "info"
        assert AnomalySeverity.WARNING == "warning"
        assert AnomalySeverity.CRITICAL == "critical"
        assert len(list(AnomalySeverity)) == 3

    def test_anomaly_type_enum_values(self):
        """Test anomaly type enum has expected values."""
        assert AnomalyType.SPIKE == "spike"
        assert AnomalyType.DROP == "drop"
        assert AnomalyType.NEW_CATEGORY == "new_category"
        assert AnomalyType.MISSING_CATEGORY == "missing_category"
        assert AnomalyType.PATTERN_BREAK == "pattern_break"
        assert AnomalyType.OUTLIER == "outlier"
        assert AnomalyType.DENOMINATOR_SHIFT == "denominator_shift"
        assert len(list(AnomalyType)) == 7


class TestAnomalyDetectionConfig:
    """Test configuration dataclass."""

    def test_default_config(self):
        """Test default configuration enables all four detection types."""
        config = AnomalyDetectionConfig()
        assert config.warning_threshold == Decimal("0.10")
        assert config.critical_threshold == Decimal("0.20")
        assert config.std_dev_multiplier == 2.0
        # arima retired from default set for Cloudflare Worker parity (EP-17)
        assert config.enabled_detection_types == [
            "variance",
            "category",
            "isolation_forest",
        ]

    def test_custom_config(self):
        """Test custom configuration values."""
        config = AnomalyDetectionConfig(
            warning_threshold=Decimal("0.15"),
            critical_threshold=Decimal("0.25"),
            std_dev_multiplier=3.0,
            enabled_detection_types=["variance"],
        )
        assert config.warning_threshold == Decimal("0.15")
        assert config.critical_threshold == Decimal("0.25")
        assert config.std_dev_multiplier == 3.0
        assert config.enabled_detection_types == ["variance"]


class TestVarianceDetection:
    """Test variance-based anomaly detection."""

    def test_detect_critical_spike(self):
        """Test detection of critical spike (>20% increase)."""
        service = AnomalyDetectionService()
        data = {
            "Utilities": {
                2021: Decimal("1000.00"),
                2022: Decimal("1000.00"),
                2023: Decimal("1000.00"),
                2024: Decimal("1300.00"),  # 30% increase
            }
        }

        anomalies = service._detect_variance_anomalies(data, target_year=2024)

        assert len(anomalies) == 1
        anomaly = anomalies[0]
        assert anomaly.pool_name == "Utilities"
        assert anomaly.anomaly_type == AnomalyType.SPIKE
        assert anomaly.severity == AnomalySeverity.CRITICAL
        assert anomaly.current_value == Decimal("1300.00")
        assert anomaly.expected_value == Decimal("1000.00")
        assert anomaly.variance_percent == Decimal("30")

    def test_detect_warning_drop(self):
        """Test detection of warning drop (10-20% decrease)."""
        service = AnomalyDetectionService()
        data = {
            "Janitorial": {
                2021: Decimal("5000.00"),
                2022: Decimal("5000.00"),
                2023: Decimal("5000.00"),
                2024: Decimal("4250.00"),  # 15% decrease
            }
        }

        anomalies = service._detect_variance_anomalies(data, target_year=2024)

        assert len(anomalies) == 1
        anomaly = anomalies[0]
        assert anomaly.pool_name == "Janitorial"
        assert anomaly.anomaly_type == AnomalyType.DROP
        assert anomaly.severity == AnomalySeverity.WARNING
        assert anomaly.variance_percent == Decimal("-15")

    def test_no_anomaly_below_threshold(self):
        """Test no anomaly detected when variance is below threshold."""
        service = AnomalyDetectionService()
        data = {
            "Insurance": {
                2021: Decimal("2000.00"),
                2022: Decimal("2000.00"),
                2023: Decimal("2000.00"),
                2024: Decimal("2150.00"),  # 7.5% increase - below 10% threshold
            }
        }

        anomalies = service._detect_variance_anomalies(data, target_year=2024)

        assert len(anomalies) == 0

    def test_skip_pools_without_target_year(self):
        """Test skips pools that don't have data for target year."""
        service = AnomalyDetectionService()
        data = {
            "Taxes": {
                2021: Decimal("3000.00"),
                2022: Decimal("3000.00"),
                2023: Decimal("3000.00"),
                # No 2024 data
            }
        }

        anomalies = service._detect_variance_anomalies(data, target_year=2024)

        assert len(anomalies) == 0

    def test_skip_pools_without_prior_years(self):
        """Test skips pools with no prior year data."""
        service = AnomalyDetectionService()
        data = {
            "New Pool": {
                2024: Decimal("1000.00"),  # First year, no comparison
            }
        }

        anomalies = service._detect_variance_anomalies(data, target_year=2024)

        assert len(anomalies) == 0

    def test_skip_pools_with_zero_average(self):
        """Test skips pools where prior year average is zero."""
        service = AnomalyDetectionService()
        data = {
            "Empty Pool": {
                2021: Decimal("0.00"),
                2022: Decimal("0.00"),
                2023: Decimal("0.00"),
                2024: Decimal("1000.00"),
            }
        }

        anomalies = service._detect_variance_anomalies(data, target_year=2024)

        assert len(anomalies) == 0

    def test_custom_thresholds(self):
        """Test custom warning and critical thresholds."""
        config = AnomalyDetectionConfig(
            warning_threshold=Decimal("0.05"),  # 5%
            critical_threshold=Decimal("0.15"),  # 15%
        )
        service = AnomalyDetectionService(config)
        data = {
            "Pool A": {
                2023: Decimal("1000.00"),
                2024: Decimal("1070.00"),  # 7% increase
            }
        }

        anomalies = service._detect_variance_anomalies(data, target_year=2024)

        assert len(anomalies) == 1
        assert anomalies[0].severity == AnomalySeverity.WARNING

    def test_multiple_pools_detected(self):
        """Test multiple pools with anomalies are all detected."""
        service = AnomalyDetectionService()
        data = {
            "Pool 1": {
                2023: Decimal("1000.00"),
                2024: Decimal("1250.00"),  # 25% spike
            },
            "Pool 2": {
                2023: Decimal("2000.00"),
                2024: Decimal("1700.00"),  # 15% drop
            },
            "Pool 3": {
                2023: Decimal("3000.00"),
                2024: Decimal("3100.00"),  # 3.3% - no anomaly
            },
        }

        anomalies = service._detect_variance_anomalies(data, target_year=2024)

        assert len(anomalies) == 2
        pool_names = {a.pool_name for a in anomalies}
        assert pool_names == {"Pool 1", "Pool 2"}


class TestCategoryChangeDetection:
    """Test category change detection."""

    def test_detect_new_category(self):
        """Test detection of new expense category."""
        service = AnomalyDetectionService()
        data = {
            "New Pool": {
                2024: Decimal("1000.00"),  # First appearance
            }
        }

        anomalies = service._detect_category_changes(data, target_year=2024)

        assert len(anomalies) == 1
        anomaly = anomalies[0]
        assert anomaly.pool_name == "New Pool"
        assert anomaly.anomaly_type == AnomalyType.NEW_CATEGORY
        assert anomaly.severity == AnomalySeverity.INFO
        assert anomaly.current_value == Decimal("1000.00")
        assert anomaly.expected_value == Decimal("0")
        assert anomaly.variance_percent == Decimal("100")

    def test_detect_missing_category(self):
        """Test detection of missing expense category."""
        service = AnomalyDetectionService()
        data = {
            "Disappeared Pool": {
                2021: Decimal("500.00"),
                2022: Decimal("500.00"),
                2023: Decimal("500.00"),
                # Missing in 2024
            }
        }

        anomalies = service._detect_category_changes(data, target_year=2024)

        assert len(anomalies) == 1
        anomaly = anomalies[0]
        assert anomaly.pool_name == "Disappeared Pool"
        assert anomaly.anomaly_type == AnomalyType.MISSING_CATEGORY
        assert anomaly.severity == AnomalySeverity.WARNING
        assert anomaly.current_value == Decimal("0")
        assert anomaly.expected_value == Decimal("500.00")
        assert anomaly.variance_percent == Decimal("-100")

    def test_ignore_stable_categories(self):
        """Test stable categories are not flagged."""
        service = AnomalyDetectionService()
        data = {
            "Stable Pool": {
                2021: Decimal("1000.00"),
                2022: Decimal("1000.00"),
                2023: Decimal("1000.00"),
                2024: Decimal("1000.00"),
            }
        }

        anomalies = service._detect_category_changes(data, target_year=2024)

        assert len(anomalies) == 0

    def test_ignore_zero_amounts(self):
        """Test pools with zero amounts are treated as missing."""
        service = AnomalyDetectionService()
        data = {
            "Zero Pool": {
                2021: Decimal("0.00"),
                2022: Decimal("0.00"),
                2023: Decimal("0.00"),
                2024: Decimal("0.00"),
            }
        }

        anomalies = service._detect_category_changes(data, target_year=2024)

        assert len(anomalies) == 0


class TestDeduplicationAndRanking:
    """Test anomaly deduplication and ranking."""

    def test_deduplicate_by_pool_and_type(self):
        """Test removes duplicate anomalies with same pool and type."""
        service = AnomalyDetectionService()
        anomalies = [
            DetectedAnomaly(
                pool_name="Pool A",
                anomaly_type=AnomalyType.SPIKE,
                severity=AnomalySeverity.CRITICAL,
                current_value=Decimal("1000"),
                expected_value=Decimal("800"),
                variance_percent=Decimal("25"),
                explanation="Test",
                years_affected=[2024],
            ),
            DetectedAnomaly(
                pool_name="Pool A",
                anomaly_type=AnomalyType.SPIKE,  # Duplicate
                severity=AnomalySeverity.WARNING,
                current_value=Decimal("900"),
                expected_value=Decimal("800"),
                variance_percent=Decimal("12.5"),
                explanation="Test",
                years_affected=[2024],
            ),
        ]

        result = service._deduplicate_and_rank(anomalies)

        assert len(result) == 1
        assert result[0].pool_name == "Pool A"

    def test_rank_by_severity(self):
        """Test anomalies are sorted by severity (critical first)."""
        service = AnomalyDetectionService()
        anomalies = [
            DetectedAnomaly(
                pool_name="Pool A",
                anomaly_type=AnomalyType.SPIKE,
                severity=AnomalySeverity.INFO,
                current_value=Decimal("1000"),
                expected_value=Decimal("900"),
                variance_percent=Decimal("11"),
                explanation="Test",
                years_affected=[2024],
            ),
            DetectedAnomaly(
                pool_name="Pool B",
                anomaly_type=AnomalyType.DROP,
                severity=AnomalySeverity.CRITICAL,
                current_value=Decimal("700"),
                expected_value=Decimal("1000"),
                variance_percent=Decimal("-30"),
                explanation="Test",
                years_affected=[2024],
            ),
            DetectedAnomaly(
                pool_name="Pool C",
                anomaly_type=AnomalyType.SPIKE,
                severity=AnomalySeverity.WARNING,
                current_value=Decimal("1150"),
                expected_value=Decimal("1000"),
                variance_percent=Decimal("15"),
                explanation="Test",
                years_affected=[2024],
            ),
        ]

        result = service._deduplicate_and_rank(anomalies)

        assert len(result) == 3
        assert result[0].severity == AnomalySeverity.CRITICAL
        assert result[1].severity == AnomalySeverity.WARNING
        assert result[2].severity == AnomalySeverity.INFO


class TestVarianceExplanation:
    """Test variance explanation generation."""

    def test_spike_explanation(self):
        """Test explanation for spike anomaly."""
        service = AnomalyDetectionService()
        explanation = service._generate_variance_explanation(
            pool_name="Utilities",
            variance=Decimal("0.30"),
            current=Decimal("1300.00"),
            expected=Decimal("1000.00"),
        )

        assert "Utilities" in explanation
        assert "increased" in explanation
        assert "30.0%" in explanation
        assert "$1,300.00" in explanation
        assert "$1,000.00" in explanation

    def test_drop_explanation(self):
        """Test explanation for drop anomaly."""
        service = AnomalyDetectionService()
        explanation = service._generate_variance_explanation(
            pool_name="Janitorial",
            variance=Decimal("-0.15"),
            current=Decimal("850.00"),
            expected=Decimal("1000.00"),
        )

        assert "Janitorial" in explanation
        assert "decreased" in explanation
        assert "15.0%" in explanation
        assert "$850.00" in explanation
        assert "$1,000.00" in explanation


class TestLoadHistoricalData:
    """Test _load_historical_data queries real Supabase data."""

    def _make_supabase_mock(
        self,
        pools_data=None,
        mappings_data=None,
        gl_data=None,
    ):
        """Build a mock Supabase admin client for testing."""
        mock_client = MagicMock()

        def table_side_effect(table_name):
            tbl = MagicMock()

            if table_name == "expense_pools":
                resp = MagicMock()
                resp.data = pools_data if pools_data is not None else []
                tbl.select.return_value.eq.return_value.execute.return_value = resp
            elif table_name == "pool_mappings":
                resp = MagicMock()
                resp.data = mappings_data if mappings_data is not None else []
                tbl.select.return_value.in_.return_value.execute.return_value = resp
            elif table_name == "gl_entries":
                resp = MagicMock()
                resp.data = gl_data if gl_data is not None else []
                tbl.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    resp
                )

            return tbl

        mock_client.table.side_effect = table_side_effect
        return mock_client

    @pytest.mark.asyncio
    async def test_returns_correct_structure(self):
        """Returns {pool_name: {year: Decimal}} structure."""
        from uuid import uuid4

        property_id = uuid4()
        pool_id = str(uuid4())

        mock_client = self._make_supabase_mock(
            pools_data=[{"id": pool_id, "name": "Utilities"}],
            mappings_data=[
                {
                    "expense_pool_id": pool_id,
                    "gl_account_pattern": "5100%",
                    "allocation_percentage": Decimal("1.0"),
                }
            ],
            gl_data=[{"account_code": "5100-001", "amount": "10000.00"}],
        )

        service = AnomalyDetectionService()
        result = await service._load_historical_data(
            property_id=property_id,
            years=[2023],
            db=mock_client,
        )

        assert "Utilities" in result
        assert 2023 in result["Utilities"]
        assert result["Utilities"][2023] == Decimal("10000.00")

    @pytest.mark.asyncio
    async def test_aggregates_gl_entries_by_pool_via_mappings(self):
        """GL entries are matched to pools via account_code patterns."""
        from uuid import uuid4

        property_id = uuid4()
        pool_id = str(uuid4())

        mock_client = self._make_supabase_mock(
            pools_data=[{"id": pool_id, "name": "Janitorial"}],
            mappings_data=[
                {
                    "expense_pool_id": pool_id,
                    "gl_account_pattern": "5200%",
                    "allocation_percentage": Decimal("1.0"),
                }
            ],
            gl_data=[
                {"account_code": "5200-001", "amount": "3000.00"},
                {"account_code": "5200-002", "amount": "2000.00"},
                {"account_code": "5100-001", "amount": "9999.00"},  # No match
            ],
        )

        service = AnomalyDetectionService()
        result = await service._load_historical_data(
            property_id=property_id,
            years=[2023],
            db=mock_client,
        )

        assert result["Janitorial"][2023] == Decimal("5000.00")

    @pytest.mark.asyncio
    async def test_handles_wildcard_patterns(self):
        """SQL % wildcards are converted to fnmatch * patterns."""
        from uuid import uuid4

        property_id = uuid4()
        pool_id = str(uuid4())

        mock_client = self._make_supabase_mock(
            pools_data=[{"id": pool_id, "name": "Insurance"}],
            mappings_data=[
                {
                    "expense_pool_id": pool_id,
                    "gl_account_pattern": "%INS%",
                    "allocation_percentage": Decimal("1.0"),
                }
            ],
            gl_data=[
                {"account_code": "7000-INS-01", "amount": "5000.00"},
                {"account_code": "7000-INS-02", "amount": "3000.00"},
            ],
        )

        service = AnomalyDetectionService()
        result = await service._load_historical_data(
            property_id=property_id,
            years=[2023],
            db=mock_client,
        )

        assert result["Insurance"][2023] == Decimal("8000.00")

    @pytest.mark.asyncio
    async def test_skips_zero_total_pools(self):
        """Pools with zero total for a year are excluded from year dict."""
        from uuid import uuid4

        property_id = uuid4()
        pool_id = str(uuid4())

        mock_client = self._make_supabase_mock(
            pools_data=[{"id": pool_id, "name": "Reserves"}],
            mappings_data=[
                {
                    "expense_pool_id": pool_id,
                    "gl_account_pattern": "9000%",
                    "allocation_percentage": Decimal("1.0"),
                }
            ],
            gl_data=[
                {"account_code": "5100-001", "amount": "1000.00"},  # No match
            ],
        )

        service = AnomalyDetectionService()
        result = await service._load_historical_data(
            property_id=property_id,
            years=[2023],
            db=mock_client,
        )

        assert "Reserves" in result
        assert 2023 not in result["Reserves"]

    @pytest.mark.asyncio
    async def test_handles_no_mappings_for_pools(self):
        """Returns empty dict when pools exist but have no GL account mappings."""
        from uuid import uuid4

        property_id = uuid4()
        pool_id = str(uuid4())

        mock_client = self._make_supabase_mock(
            pools_data=[{"id": pool_id, "name": "Utilities"}],
            mappings_data=[],  # No mappings configured
        )

        service = AnomalyDetectionService()
        result = await service._load_historical_data(
            property_id=property_id,
            years=[2023],
            db=mock_client,
        )

        assert result == {}

    @pytest.mark.asyncio
    async def test_handles_no_pools_for_property(self):
        """Returns empty dict when property has no expense pools."""
        from uuid import uuid4

        mock_client = self._make_supabase_mock(pools_data=[])

        service = AnomalyDetectionService()
        result = await service._load_historical_data(
            property_id=uuid4(),
            years=[2023],
            db=mock_client,
        )

        assert result == {}

    @pytest.mark.asyncio
    async def test_handles_no_gl_entries_for_year(self):
        """Returns empty year entry for years with no GL data."""
        from uuid import uuid4

        property_id = uuid4()
        pool_id = str(uuid4())

        mock_client = self._make_supabase_mock(
            pools_data=[{"id": pool_id, "name": "Utilities"}],
            mappings_data=[
                {
                    "expense_pool_id": pool_id,
                    "gl_account_pattern": "5100%",
                    "allocation_percentage": Decimal("1.0"),
                }
            ],
            gl_data=[],  # No GL entries
        )

        service = AnomalyDetectionService()
        result = await service._load_historical_data(
            property_id=property_id,
            years=[2023],
            db=mock_client,
        )

        assert "Utilities" in result
        assert 2023 not in result["Utilities"]

    @pytest.mark.asyncio
    async def test_allocation_percentage_applied(self):
        """Partial allocations are applied correctly."""
        from uuid import uuid4

        property_id = uuid4()
        pool_id = str(uuid4())

        mock_client = self._make_supabase_mock(
            pools_data=[{"id": pool_id, "name": "Shared Services"}],
            mappings_data=[
                {
                    "expense_pool_id": pool_id,
                    "gl_account_pattern": "6000%",
                    "allocation_percentage": Decimal("0.5"),  # 50%
                }
            ],
            gl_data=[{"account_code": "6000-001", "amount": "10000.00"}],
        )

        service = AnomalyDetectionService()
        result = await service._load_historical_data(
            property_id=property_id,
            years=[2023],
            db=mock_client,
        )

        assert result["Shared Services"][2023] == Decimal("5000.00")

    @pytest.mark.asyncio
    async def test_load_historical_data_includes_second_page_gl_entries(self):
        """GL aggregation includes rows beyond the first Supabase page."""
        property_id = uuid4()
        pool_id = str(uuid4())
        gl_rows = [{"account_code": "5100-001", "amount": "1.00"} for _ in range(1001)]

        rows_by_table = {
            "expense_pools": [{"id": pool_id, "name": "Utilities"}],
            "pool_mappings": [
                {
                    "expense_pool_id": pool_id,
                    "gl_account_pattern": "5100%",
                    "allocation_percentage": Decimal("1.0"),
                }
            ],
            "gl_entries": gl_rows,
        }
        mock_client = MagicMock()
        mock_client.table.side_effect = lambda table_name: PagedQuery(
            rows_by_table.get(table_name, [])
        )

        service = AnomalyDetectionService()
        result = await service._load_historical_data(
            property_id=property_id,
            years=[2024],
            db=mock_client,
        )

        assert result["Utilities"][2024] == Decimal("1001.000")


class TestIsolationForestDetection:
    """Test Isolation Forest cross-pool outlier detection."""

    def test_detects_outlier_pool_in_target_year(self):
        """Pool that deviates abnormally across all pools is flagged."""
        service = AnomalyDetectionService()
        data = {
            "Utilities": {
                2021: Decimal("1000"),
                2022: Decimal("1100"),
                2023: Decimal("1050"),
                2024: Decimal("50000"),  # Extreme outlier
            },
            "Janitorial": {
                2021: Decimal("2000"),
                2022: Decimal("2100"),
                2023: Decimal("2050"),
                2024: Decimal("2100"),
            },
            "Insurance": {
                2021: Decimal("3000"),
                2022: Decimal("3100"),
                2023: Decimal("3050"),
                2024: Decimal("3100"),
            },
        }

        anomalies = service._detect_isolation_forest(data, target_year=2024)

        assert len(anomalies) == 1
        assert anomalies[0].pool_name == "Utilities"
        assert anomalies[0].anomaly_type == AnomalyType.OUTLIER
        assert anomalies[0].severity == AnomalySeverity.WARNING

    def test_skips_when_fewer_than_two_comparison_years(self):
        """Returns empty list when only 1 comparison year available."""
        service = AnomalyDetectionService()
        data = {
            "Pool A": {2023: Decimal("1000"), 2024: Decimal("2000")},
        }

        anomalies = service._detect_isolation_forest(data, target_year=2024)

        assert anomalies == []

    def test_no_anomaly_when_all_pools_consistent(self):
        """Normal consistent data produces no Isolation Forest anomalies."""
        service = AnomalyDetectionService()
        data = {
            "Pool A": {
                2021: Decimal("1000"),
                2022: Decimal("1050"),
                2023: Decimal("1030"),
                2024: Decimal("1060"),
            },
            "Pool B": {
                2021: Decimal("2000"),
                2022: Decimal("2050"),
                2023: Decimal("2030"),
                2024: Decimal("2060"),
            },
            "Pool C": {
                2021: Decimal("3000"),
                2022: Decimal("3050"),
                2023: Decimal("3030"),
                2024: Decimal("3060"),
            },
        }

        anomalies = service._detect_isolation_forest(data, target_year=2024)

        assert anomalies == []

    def test_outlier_anomaly_uses_correct_type_and_severity(self):
        """Detected anomalies have OUTLIER type and WARNING severity."""
        service = AnomalyDetectionService()
        data = {
            "Extreme": {
                2021: Decimal("100"),
                2022: Decimal("100"),
                2023: Decimal("100"),
                2024: Decimal("100000"),
            },
            "Normal1": {
                2021: Decimal("1000"),
                2022: Decimal("1010"),
                2023: Decimal("1005"),
                2024: Decimal("1010"),
            },
            "Normal2": {
                2021: Decimal("2000"),
                2022: Decimal("2010"),
                2023: Decimal("2005"),
                2024: Decimal("2010"),
            },
        }

        anomalies = service._detect_isolation_forest(data, target_year=2024)

        assert len(anomalies) == 1
        assert anomalies[0].anomaly_type == AnomalyType.OUTLIER
        assert anomalies[0].severity == AnomalySeverity.WARNING

    def test_handles_single_pool(self):
        """Single pool case doesn't crash (n_features=1 edge case)."""
        service = AnomalyDetectionService()
        data = {
            "Only Pool": {
                2021: Decimal("1000"),
                2022: Decimal("1000"),
                2023: Decimal("1000"),
                2024: Decimal("1000"),
            },
        }

        anomalies = service._detect_isolation_forest(data, target_year=2024)
        assert anomalies == []

    def test_handles_all_zero_values(self):
        """All-zero pool data is handled without division by zero."""
        service = AnomalyDetectionService()
        data = {
            "Zero Pool": {
                2021: Decimal("0"),
                2022: Decimal("0"),
                2023: Decimal("0"),
                2024: Decimal("0"),
            },
            "Normal": {
                2021: Decimal("1000"),
                2022: Decimal("1000"),
                2023: Decimal("1000"),
                2024: Decimal("1000"),
            },
        }

        anomalies = service._detect_isolation_forest(data, target_year=2024)
        assert anomalies == []

    def test_no_pools_have_target_year_data(self):
        """Returns empty list when no pools have data for target year."""
        service = AnomalyDetectionService()
        data = {
            "Pool A": {
                2021: Decimal("1000"),
                2022: Decimal("1050"),
                2023: Decimal("1030"),
            },
            "Pool B": {
                2021: Decimal("2000"),
                2022: Decimal("2050"),
                2023: Decimal("2030"),
            },
        }

        anomalies = service._detect_isolation_forest(data, target_year=2024)

        assert anomalies == []


class TestARIMADetection:
    """Test ARIMA per-pool trend break detection."""

    def test_detects_trend_break_in_target_year(self):
        """Pool that breaks trend (sudden spike outside CI) is flagged."""
        service = AnomalyDetectionService()
        data = {
            "Utilities": {
                2019: Decimal("1000"),
                2020: Decimal("1010"),
                2021: Decimal("1020"),
                2022: Decimal("1030"),
                2023: Decimal("1040"),
                2024: Decimal("9999"),  # Massive deviation from AR trend
            }
        }

        anomalies = service._detect_arima(data, target_year=2024)

        assert len(anomalies) == 1
        assert anomalies[0].pool_name == "Utilities"
        assert anomalies[0].anomaly_type == AnomalyType.PATTERN_BREAK

    def test_skips_when_fewer_than_three_data_points(self):
        """Returns empty list when < 3 comparison years of data available."""
        service = AnomalyDetectionService()
        data = {
            "Pool A": {
                2022: Decimal("1000"),
                2023: Decimal("1100"),
                2024: Decimal("9999"),
            }
        }

        anomalies = service._detect_arima(data, target_year=2024)

        assert anomalies == []

    def test_no_anomaly_when_value_within_confidence_interval(self):
        """In-trend value produces no ARIMA anomaly."""
        service = AnomalyDetectionService()
        data = {
            "Pool A": {
                2019: Decimal("1000"),
                2020: Decimal("1100"),
                2021: Decimal("1200"),
                2022: Decimal("1300"),
                2023: Decimal("1400"),
                2024: Decimal("1500"),  # Perfectly on trend
            }
        }

        anomalies = service._detect_arima(data, target_year=2024)

        assert anomalies == []

    def test_arima_anomaly_uses_pattern_break_type(self):
        """Detected anomalies have PATTERN_BREAK type."""
        service = AnomalyDetectionService()
        data = {
            "Trending Pool": {
                2019: Decimal("1000"),
                2020: Decimal("1010"),
                2021: Decimal("1020"),
                2022: Decimal("1030"),
                2023: Decimal("1040"),
                2024: Decimal("50000"),
            }
        }

        anomalies = service._detect_arima(data, target_year=2024)

        assert len(anomalies) >= 1
        assert anomalies[0].anomaly_type == AnomalyType.PATTERN_BREAK

    def test_skips_pool_with_insufficient_data(self):
        """Pool with < 3 comparison years is skipped; others still run."""
        service = AnomalyDetectionService()
        data = {
            "Insufficient": {
                2022: Decimal("1000"),
                2023: Decimal("1100"),
                2024: Decimal("99999"),
            },
            "Sufficient": {
                2019: Decimal("1000"),
                2020: Decimal("1010"),
                2021: Decimal("1020"),
                2022: Decimal("1030"),
                2023: Decimal("1040"),
                2024: Decimal("99999"),
            },
        }

        anomalies = service._detect_arima(data, target_year=2024)

        pool_names = {a.pool_name for a in anomalies}
        assert "Insufficient" not in pool_names

    def test_handles_constant_series(self):
        """Constant historical values (zero variance) handled gracefully."""
        service = AnomalyDetectionService()
        data = {
            "Constant Pool": {
                2019: Decimal("1000"),
                2020: Decimal("1000"),
                2021: Decimal("1000"),
                2022: Decimal("1000"),
                2023: Decimal("1000"),
                2024: Decimal("1000"),
            }
        }

        anomalies = service._detect_arima(data, target_year=2024)
        assert isinstance(anomalies, list)

    def test_skips_pool_without_target_year(self):
        """Pool that has no target year data is skipped without error."""
        service = AnomalyDetectionService()
        data = {
            "No Target": {
                2019: Decimal("1000"),
                2020: Decimal("1010"),
                2021: Decimal("1020"),
                2022: Decimal("1030"),
                2023: Decimal("1040"),
                # No 2024 data
            },
            "Has Target": {
                2019: Decimal("2000"),
                2020: Decimal("2010"),
                2021: Decimal("2020"),
                2022: Decimal("2030"),
                2023: Decimal("2040"),
                2024: Decimal("9999"),  # Trend break
            },
        }

        anomalies = service._detect_arima(data, target_year=2024)

        pool_names = {a.pool_name for a in anomalies}
        assert "No Target" not in pool_names

    def test_handles_arima_exception_gracefully(self):
        """ARIMA failure for a single pool is caught and logged without crashing."""
        from unittest.mock import patch

        service = AnomalyDetectionService()
        data = {
            "Failing Pool": {
                2019: Decimal("1000"),
                2020: Decimal("1010"),
                2021: Decimal("1020"),
                2022: Decimal("1030"),
                2023: Decimal("1040"),
                2024: Decimal("1050"),
            }
        }

        with patch(
            "app.services.analysis.anomaly_detection.ARIMA",
            side_effect=ValueError("ARIMA convergence failure"),
        ):
            anomalies = service._detect_arima(data, target_year=2024)

        assert anomalies == []


class TestAllDetectionMethodsIntegrated:
    """Integration tests for all four detection methods together."""

    @pytest.mark.asyncio
    async def test_detect_anomalies_calls_all_default_methods(self):
        """With default config, variance+category+isolation_forest are invoked.

        arima is retired from the default set for Cloudflare Worker parity (EP-17);
        it remains available via explicit AnomalyDetectionConfig(enabled_detection_types=[..., "arima"]).
        """
        from uuid import uuid4

        service = AnomalyDetectionService()
        mock_db = MagicMock()

        historical_data = {
            "Utilities": {
                2021: Decimal("1000"),
                2022: Decimal("1000"),
                2023: Decimal("1000"),
                2024: Decimal("1500"),
            }
        }
        service._load_historical_data = AsyncMock(return_value=historical_data)

        with (
            patch.object(
                service,
                "_detect_variance_anomalies",
                wraps=service._detect_variance_anomalies,
            ) as mock_variance,
            patch.object(
                service,
                "_detect_category_changes",
                wraps=service._detect_category_changes,
            ) as mock_category,
            patch.object(
                service,
                "_detect_isolation_forest",
                wraps=service._detect_isolation_forest,
            ) as mock_if,
            patch.object(
                service, "_detect_arima", wraps=service._detect_arima
            ) as mock_arima,
        ):
            await service.detect_anomalies(
                property_id=uuid4(),
                target_year=2024,
                comparison_years=[2021, 2022, 2023],
                db=mock_db,
            )

        mock_variance.assert_called_once()
        mock_category.assert_called_once()
        mock_if.assert_called_once()
        # arima not in default set; must NOT be called by default
        mock_arima.assert_not_called()

    @pytest.mark.asyncio
    async def test_default_config_enables_three_types(self):
        """Default AnomalyDetectionConfig runs variance+category+isolation_forest.

        arima is retired from the default set for Cloudflare Worker parity (EP-17);
        statsmodels MLE cannot be faithfully reproduced in a Cloudflare Worker.
        It remains callable via explicit enabled_detection_types=[..., "arima"].
        """
        config = AnomalyDetectionConfig()

        assert "variance" in config.enabled_detection_types
        assert "category" in config.enabled_detection_types
        assert "isolation_forest" in config.enabled_detection_types
        assert "arima" not in config.enabled_detection_types

    @pytest.mark.asyncio
    async def test_results_deduplicated_across_methods(self):
        """Same pool flagged by multiple methods appears once per type."""
        from uuid import uuid4

        service = AnomalyDetectionService()
        mock_db = MagicMock()

        historical_data = {
            "Utilities": {
                2021: Decimal("1000"),
                2022: Decimal("1000"),
                2023: Decimal("1000"),
                2024: Decimal("1300"),  # 30% spike
            }
        }
        service._load_historical_data = AsyncMock(return_value=historical_data)

        result = await service.detect_anomalies(
            property_id=uuid4(),
            target_year=2024,
            comparison_years=[2021, 2022, 2023],
            db=mock_db,
        )

        seen_keys = set()
        for anomaly in result:
            key = (anomaly.pool_name, anomaly.anomaly_type)
            assert key not in seen_keys, f"Duplicate anomaly: {key}"
            seen_keys.add(key)


class TestDetectAnomalies:
    """Test the main detect_anomalies async method."""

    async def test_detect_anomalies_empty_data(self):
        """Test detect_anomalies with no historical data."""
        from uuid import uuid4

        service = AnomalyDetectionService()
        mock_db = MagicMock()

        service._load_historical_data = AsyncMock(return_value={})

        result = await service.detect_anomalies(
            property_id=uuid4(),
            target_year=2024,
            comparison_years=[2021, 2022, 2023],
            db=mock_db,
        )

        assert result == []
        assert service._load_historical_data.called

    async def test_detect_anomalies_with_variance_enabled(self):
        """Test detect_anomalies with variance detection enabled."""
        from uuid import uuid4

        config = AnomalyDetectionConfig(enabled_detection_types=["variance"])
        service = AnomalyDetectionService(config=config)
        mock_db = MagicMock()

        historical_data = {
            "Utilities": {
                2021: Decimal("1000"),
                2022: Decimal("1000"),
                2023: Decimal("1000"),
                2024: Decimal("1500"),  # 50% spike
            }
        }
        service._load_historical_data = AsyncMock(return_value=historical_data)

        result = await service.detect_anomalies(
            property_id=uuid4(),
            target_year=2024,
            comparison_years=[2021, 2022, 2023],
            db=mock_db,
        )

        assert len(result) == 1
        assert result[0].anomaly_type == AnomalyType.SPIKE
        assert result[0].severity == AnomalySeverity.CRITICAL

    async def test_detect_anomalies_with_category_enabled(self):
        """Test detect_anomalies with category detection enabled."""
        from uuid import uuid4

        config = AnomalyDetectionConfig(enabled_detection_types=["category"])
        service = AnomalyDetectionService(config=config)
        mock_db = MagicMock()

        historical_data = {
            "New Pool": {
                2024: Decimal("500"),  # Only in target year
            }
        }
        service._load_historical_data = AsyncMock(return_value=historical_data)

        result = await service.detect_anomalies(
            property_id=uuid4(),
            target_year=2024,
            comparison_years=[2021, 2022, 2023],
            db=mock_db,
        )

        assert len(result) == 1
        assert result[0].anomaly_type == AnomalyType.NEW_CATEGORY
        assert result[0].severity == AnomalySeverity.INFO


class TestDenominatorShiftDetection:
    """Test denominator shift detection within anomaly service."""

    class _SnapshotSchemaGuardQuery:
        valid_columns = {
            "id",
            "property_id",
            "status",
            "period_start_date",
            "period_end_date",
            "lease_terms_snapshot",
        }

        def __init__(self, rows):
            self.rows = rows
            self._start = None
            self._end = None

        def select(self, columns):
            for column in [part.strip() for part in columns.split(",")]:
                if column not in self.valid_columns:
                    raise AssertionError(f"invalid selected column: {column}")
            return self

        def eq(self, column, value):
            self.rows = [row for row in self.rows if row.get(column) == value]
            return self

        def gte(self, column, value):
            self.rows = [row for row in self.rows if row.get(column) >= value]
            return self

        def lte(self, column, value):
            self.rows = [row for row in self.rows if row.get(column) <= value]
            return self

        def range(self, start, end):
            self._start = start
            self._end = end
            return self

        def execute(self):
            rows = self.rows
            if self._start is not None and self._end is not None:
                rows = rows[self._start : self._end + 1]
            response = MagicMock()
            response.data = rows
            return response

    class _SnapshotSchemaGuardDb:
        def __init__(self, rows):
            self.rows = rows

        def table(self, table_name):
            assert table_name == "reconciliation_snapshots"
            return TestDenominatorShiftDetection._SnapshotSchemaGuardQuery(
                list(self.rows)
            )

    def _make_snapshot_mock(
        self,
        prior_lease_count: int = 3,
        current_lease_count: int = 3,
        prior_rsf: str = "100000",
        current_rsf: str = "100000",
    ):
        """Build a mock Supabase admin client returning snapshot data."""
        mock_client = MagicMock()

        # Build lease_terms_snapshot JSONB for prior and current
        prior_leases = [
            {"lease_id": f"lease-{i}", "tenant_name": f"Tenant {i}"}
            for i in range(prior_lease_count)
        ]
        current_leases = [
            {"lease_id": f"lease-{i}", "tenant_name": f"Tenant {i}"}
            for i in range(current_lease_count)
        ]

        prior_snapshot = {
            "id": "snap-prior",
            "property_id": "prop-1",
            "total_rentable_sqft": prior_rsf,
            "lease_terms_snapshot": prior_leases,
            "period_start_date": "2023-01-01",
            "period_end_date": "2023-12-31",
        }
        current_snapshot = {
            "id": "snap-current",
            "property_id": "prop-1",
            "total_rentable_sqft": current_rsf,
            "lease_terms_snapshot": current_leases,
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
        }

        def table_side_effect(table_name):
            tbl = MagicMock()
            if table_name == "reconciliation_snapshots":
                # Chain: select().eq().eq().gte().lte().order().limit().execute()
                chain = MagicMock()
                # We need two calls — one for prior year, one for target year
                # Use side_effect on execute to return different data per call
                call_count = {"n": 0}

                def execute_side_effect():
                    call_count["n"] += 1
                    resp = MagicMock()
                    if call_count["n"] == 1:
                        # Target year query
                        resp.data = [current_snapshot]
                    else:
                        # Prior year query
                        resp.data = [prior_snapshot]
                    return resp

                chain.execute = execute_side_effect
                # Build the chain so any method returns itself
                for method in [
                    "select",
                    "eq",
                    "gte",
                    "lte",
                    "order",
                    "limit",
                    "in_",
                ]:
                    setattr(chain, method, MagicMock(return_value=chain))
                tbl.select = MagicMock(return_value=chain)
            else:
                # For other tables (expense_pools, etc.), return empty
                resp = MagicMock()
                resp.data = []
                chain = MagicMock()
                chain.execute = MagicMock(return_value=resp)
                for method in [
                    "select",
                    "eq",
                    "gte",
                    "lte",
                    "order",
                    "limit",
                    "in_",
                ]:
                    setattr(chain, method, MagicMock(return_value=chain))
                tbl.select = MagicMock(return_value=chain)
            return tbl

        mock_client.table.side_effect = table_side_effect
        return mock_client

    def test_denominator_unchanged_no_anomaly(self):
        """When RSF and lease count are the same, no DENOMINATOR_SHIFT anomaly."""
        service = AnomalyDetectionService()
        anomalies = service._detect_denominator_shift(
            property_id=uuid4(),
            target_year=2024,
            comparison_years=[2023],
            prior_rsf=Decimal("100000"),
            current_rsf=Decimal("100000"),
            prior_lease_count=5,
            current_lease_count=5,
        )

        assert len(anomalies) == 0

    def test_rsf_changed_returns_denominator_shift(self):
        """When total RSF changes, returns a DENOMINATOR_SHIFT anomaly."""
        service = AnomalyDetectionService()
        anomalies = service._detect_denominator_shift(
            property_id=uuid4(),
            target_year=2024,
            comparison_years=[2023],
            prior_rsf=Decimal("100000"),
            current_rsf=Decimal("110000"),
            prior_lease_count=5,
            current_lease_count=5,
        )

        assert len(anomalies) == 1
        a = anomalies[0]
        assert a.anomaly_type == AnomalyType.DENOMINATOR_SHIFT
        assert a.pool_name == "Total Rentable SF"
        assert a.current_value == Decimal("110000")
        assert a.expected_value == Decimal("100000")

    @pytest.mark.asyncio
    async def test_denominator_shift_uses_schema_valid_snapshot_terms(self):
        """Snapshot RSF comes from lease_terms_snapshot, not nonexistent columns."""
        property_id = uuid4()
        rows = [
            {
                "id": str(uuid4()),
                "property_id": str(property_id),
                "status": "finalized",
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "lease_terms_snapshot": {"rentable_square_feet": "100000"},
            },
            {
                "id": str(uuid4()),
                "property_id": str(property_id),
                "status": "finalized",
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "lease_terms_snapshot": {"rentable_square_feet": "110000"},
            },
        ]

        anomalies = (
            await AnomalyDetectionService()._detect_denominator_shift_from_snapshots(
                property_id=property_id,
                target_year=2024,
                comparison_years=[2023],
                db=self._SnapshotSchemaGuardDb(rows),
            )
        )

        assert len(anomalies) == 1
        assert anomalies[0].anomaly_type == AnomalyType.DENOMINATOR_SHIFT
        assert anomalies[0].current_value == Decimal("110000")

    def test_rsf_large_change_critical_severity(self):
        """RSF change >20% is CRITICAL severity."""
        service = AnomalyDetectionService()
        anomalies = service._detect_denominator_shift(
            property_id=uuid4(),
            target_year=2024,
            comparison_years=[2023],
            prior_rsf=Decimal("100000"),
            current_rsf=Decimal("125000"),
            prior_lease_count=5,
            current_lease_count=5,
        )

        assert len(anomalies) == 1
        assert anomalies[0].severity == AnomalySeverity.CRITICAL

    def test_rsf_small_change_warning_severity(self):
        """RSF change between thresholds is WARNING severity."""
        config = AnomalyDetectionConfig(
            warning_threshold=Decimal("0.05"),
            critical_threshold=Decimal("0.20"),
        )
        service = AnomalyDetectionService(config=config)
        anomalies = service._detect_denominator_shift(
            property_id=uuid4(),
            target_year=2024,
            comparison_years=[2023],
            prior_rsf=Decimal("100000"),
            current_rsf=Decimal("110000"),  # 10% change
            prior_lease_count=5,
            current_lease_count=5,
        )

        assert len(anomalies) == 1
        assert anomalies[0].severity == AnomalySeverity.WARNING

    def test_lease_count_changed_returns_anomaly(self):
        """When lease count changes, returns a DENOMINATOR_SHIFT anomaly."""
        service = AnomalyDetectionService()
        anomalies = service._detect_denominator_shift(
            property_id=uuid4(),
            target_year=2024,
            comparison_years=[2023],
            prior_rsf=Decimal("100000"),
            current_rsf=Decimal("100000"),
            prior_lease_count=5,
            current_lease_count=3,
        )

        assert len(anomalies) == 1
        a = anomalies[0]
        assert a.anomaly_type == AnomalyType.DENOMINATOR_SHIFT
        assert a.pool_name == "Lease Roster"

    def test_detection_disabled_in_config(self):
        """When denominator_change not in enabled types, not run."""
        config = AnomalyDetectionConfig(
            enabled_detection_types=["variance", "category"]
        )

        assert "denominator_change" not in (config.enabled_detection_types or [])
