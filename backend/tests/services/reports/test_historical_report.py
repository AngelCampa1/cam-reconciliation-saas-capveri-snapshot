"""Tests for historical analysis PDF report generator."""

from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from reportlab.platypus import Table

from app.models.historical_analysis import PoolComparison, YearOverYearComparison
from app.services.analysis.anomaly_detection import (
    AnomalySeverity,
    AnomalyType,
    DetectedAnomaly,
)
from app.services.reports.historical_report import HistoricalReportGenerator


@pytest.fixture
def property_id():
    """Test property ID."""
    return uuid4()


@pytest.fixture
def organization_id():
    """Test organization ID."""
    return uuid4()


@pytest.fixture
def sample_yoy_response():
    """Sample year-over-year comparison response."""
    return YearOverYearComparison(
        property_id=uuid4(),
        property_name="Test Property",
        years=[2023, 2024],
        base_year=2023,
        pool_comparisons=[
            PoolComparison(
                pool_name="Utilities",
                amounts={2023: Decimal("10000"), 2024: Decimal("11000")},
                variance_percent=Decimal("10.0"),
            ),
            PoolComparison(
                pool_name="Janitorial",
                amounts={2023: Decimal("5000"), 2024: Decimal("4500")},
                variance_percent=Decimal("-10.0"),
            ),
        ],
        total_amounts={2023: Decimal("15000"), 2024: Decimal("15500")},
        total_variance_percent=Decimal("3.33"),
    )


@pytest.fixture
def sample_anomalies():
    """Sample anomalies response."""
    return [
        DetectedAnomaly(
            pool_name="Security",
            anomaly_type=AnomalyType.SPIKE,
            severity=AnomalySeverity.CRITICAL,
            current_value=Decimal("25000"),
            expected_value=Decimal("20000"),
            variance_percent=Decimal("25.0"),
            explanation="Significant spike detected",
            years_affected=[2024],
        ),
        DetectedAnomaly(
            pool_name="Utilities",
            anomaly_type=AnomalyType.DROP,
            severity=AnomalySeverity.WARNING,
            current_value=Decimal("8500"),
            expected_value=Decimal("10000"),
            variance_percent=Decimal("-15.0"),
            explanation="Drop detected",
            years_affected=[2024],
        ),
    ]


class TestBuildExecutiveSummary:
    """Tests for _build_executive_summary method."""

    @pytest.mark.asyncio
    async def test_build_executive_summary_with_increase_and_critical_anomalies(
        self, property_id, organization_id, sample_yoy_response, sample_anomalies
    ):
        """Executive summary with variance increase and critical anomalies."""
        db = object()
        generator = HistoricalReportGenerator()
        generator.analysis_service.get_year_over_year = AsyncMock(
            return_value=sample_yoy_response
        )
        generator.anomaly_service.detect_anomalies = AsyncMock(
            return_value=sample_anomalies
        )

        result = await generator._build_executive_summary(
            property_id, [2023, 2024], organization_id, db=db
        )

        assert result["total_variance"] == Decimal("3.33")
        assert result["anomaly_count"] == 2
        assert len(result["key_findings"]) == 2
        assert "increased by 3.3%" in result["key_findings"][0]
        assert "2023 to 2024" in result["key_findings"][0]
        assert "1 critical anomalies" in result["key_findings"][1]
        generator.anomaly_service.detect_anomalies.assert_awaited_once()
        assert generator.anomaly_service.detect_anomalies.call_args.kwargs["db"] is db

    @pytest.mark.asyncio
    async def test_build_executive_summary_with_decrease_and_warnings(
        self, property_id, organization_id
    ):
        """Executive summary with variance decrease and warning anomalies."""
        yoy_response = YearOverYearComparison(
            property_id=property_id,
            property_name="Test Property",
            years=[2023, 2024],
            base_year=2023,
            pool_comparisons=[],
            total_amounts={2023: Decimal("10000"), 2024: Decimal("9000")},
            total_variance_percent=Decimal("-10.0"),
        )

        warning_anomalies = [
            DetectedAnomaly(
                pool_name="Security",
                anomaly_type=AnomalyType.SPIKE,
                severity=AnomalySeverity.WARNING,
                current_value=Decimal("11200"),
                expected_value=Decimal("10000"),
                variance_percent=Decimal("12.0"),
                explanation="Warning level spike",
                years_affected=[2024],
            ),
        ]

        generator = HistoricalReportGenerator()
        generator.analysis_service.get_year_over_year = AsyncMock(
            return_value=yoy_response
        )
        generator.anomaly_service.detect_anomalies = AsyncMock(
            return_value=warning_anomalies
        )

        result = await generator._build_executive_summary(
            property_id, [2023, 2024], organization_id
        )

        assert result["total_variance"] == Decimal("-10.0")
        assert result["anomaly_count"] == 1
        assert "decreased by 10.0%" in result["key_findings"][0]
        assert "1 minor expense anomalies" in result["key_findings"][1]

    @pytest.mark.asyncio
    async def test_build_executive_summary_no_anomalies(
        self, property_id, organization_id, sample_yoy_response
    ):
        """Executive summary with no anomalies detected."""
        generator = HistoricalReportGenerator()
        generator.analysis_service.get_year_over_year = AsyncMock(
            return_value=sample_yoy_response
        )
        generator.anomaly_service.detect_anomalies = AsyncMock(return_value=[])

        result = await generator._build_executive_summary(
            property_id, [2023, 2024], organization_id
        )

        assert result["anomaly_count"] == 0
        assert "consistent with historical trends" in result["key_findings"][1]

    @pytest.mark.asyncio
    async def test_build_executive_summary_null_variance(
        self, property_id, organization_id
    ):
        """Executive summary when variance is None."""
        yoy_response = YearOverYearComparison(
            property_id=property_id,
            property_name="Test Property",
            years=[2023, 2024],
            base_year=2023,
            pool_comparisons=[],
            total_amounts={2023: Decimal("10000"), 2024: Decimal("10000")},
            total_variance_percent=None,
        )

        generator = HistoricalReportGenerator()
        generator.analysis_service.get_year_over_year = AsyncMock(
            return_value=yoy_response
        )
        generator.anomaly_service.detect_anomalies = AsyncMock(return_value=[])

        result = await generator._build_executive_summary(
            property_id, [2023, 2024], organization_id
        )

        assert result["total_variance"] == Decimal("0")
        # When variance is None, no variance finding is added
        assert len(result["key_findings"]) == 1


class TestBuildComparisonTable:
    """Tests for _build_comparison_table method."""

    @pytest.mark.asyncio
    async def test_build_comparison_table_structure(
        self, property_id, organization_id, sample_yoy_response
    ):
        """Comparison table has correct structure and formatting."""
        generator = HistoricalReportGenerator()
        generator.analysis_service.get_year_over_year = AsyncMock(
            return_value=sample_yoy_response
        )

        table = await generator._build_comparison_table(
            property_id, [2023, 2024], organization_id
        )

        # Should return ReportLab Table object
        assert isinstance(table, Table)

        # Extract table data
        table_data = table._cellvalues

        # Check header row
        assert table_data[0] == ["Expense Pool", "2023", "2024", "Variance %"]

        # Check first pool row
        assert table_data[1][0] == "Utilities"
        assert table_data[1][1] == "$10,000"
        assert table_data[1][2] == "$11,000"
        assert table_data[1][3] == "+10.0%"

        # Check second pool row
        assert table_data[2][0] == "Janitorial"
        assert table_data[2][1] == "$5,000"
        assert table_data[2][2] == "$4,500"
        assert table_data[2][3] == "-10.0%"

        # Check totals row
        assert table_data[3][0] == "Total"
        assert table_data[3][1] == "$15,000"
        assert table_data[3][2] == "$15,500"
        assert table_data[3][3] == "+3.3%"

    @pytest.mark.asyncio
    async def test_build_comparison_table_handles_none_amounts(
        self, property_id, organization_id
    ):
        """Table shows '—' for None amounts."""
        yoy_response = YearOverYearComparison(
            property_id=property_id,
            property_name="Test Property",
            years=[2023, 2024],
            base_year=2023,
            pool_comparisons=[
                PoolComparison(
                    pool_name="New Pool",
                    amounts={2024: Decimal("5000")},  # No 2023 amount
                    variance_percent=None,
                ),
            ],
            total_amounts={2023: Decimal("0"), 2024: Decimal("5000")},
            total_variance_percent=None,
        )

        generator = HistoricalReportGenerator()
        generator.analysis_service.get_year_over_year = AsyncMock(
            return_value=yoy_response
        )

        table = await generator._build_comparison_table(
            property_id, [2023, 2024], organization_id
        )

        table_data = table._cellvalues

        # Check that None amounts are shown as "—"
        assert table_data[1][1] == "—"  # 2023 amount
        assert table_data[1][2] == "$5,000"  # 2024 amount
        assert table_data[1][3] == "—"  # Variance

    @pytest.mark.asyncio
    async def test_build_comparison_table_limits_to_15_pools(
        self, property_id, organization_id
    ):
        """Table limits to top 15 pools."""
        # Create 20 pool comparisons
        pool_comparisons = [
            PoolComparison(
                pool_name=f"Pool {i}",
                amounts={2023: Decimal("1000"), 2024: Decimal("1100")},
                variance_percent=Decimal("10.0"),
            )
            for i in range(20)
        ]

        yoy_response = YearOverYearComparison(
            property_id=property_id,
            property_name="Test Property",
            years=[2023, 2024],
            base_year=2023,
            pool_comparisons=pool_comparisons,
            total_amounts={2023: Decimal("20000"), 2024: Decimal("22000")},
            total_variance_percent=Decimal("10.0"),
        )

        generator = HistoricalReportGenerator()
        generator.analysis_service.get_year_over_year = AsyncMock(
            return_value=yoy_response
        )

        table = await generator._build_comparison_table(
            property_id, [2023, 2024], organization_id
        )

        table_data = table._cellvalues

        # Header + 15 pools + totals = 17 rows
        assert len(table_data) == 17


class TestBuildAnomaliesSection:
    """Tests for _build_anomalies_section method."""

    @pytest.mark.asyncio
    async def test_build_anomalies_section_with_anomalies(
        self, property_id, organization_id, sample_anomalies
    ):
        """Anomalies section has correct structure."""
        generator = HistoricalReportGenerator()
        generator.anomaly_service.detect_anomalies = AsyncMock(
            return_value=sample_anomalies
        )

        table = await generator._build_anomalies_section(
            property_id, [2023, 2024], organization_id
        )

        assert isinstance(table, Table)

        table_data = table._cellvalues

        # Check header row
        assert table_data[0] == ["Severity", "Expense Pool", "Type", "Details"]

        # Check first anomaly (critical)
        assert table_data[1][0] == "CRITICAL"
        assert table_data[1][1] == "Security"
        assert table_data[1][2] == "Spike"
        assert table_data[1][3] == "+25.0% variance"

        # Check second anomaly (warning)
        assert table_data[2][0] == "WARNING"
        assert table_data[2][1] == "Utilities"
        assert table_data[2][2] == "Drop"
        assert table_data[2][3] == "-15.0% variance"

    @pytest.mark.asyncio
    async def test_build_anomalies_section_no_anomalies(
        self, property_id, organization_id
    ):
        """Returns None when no anomalies detected."""
        generator = HistoricalReportGenerator()
        generator.anomaly_service.detect_anomalies = AsyncMock(return_value=[])

        result = await generator._build_anomalies_section(
            property_id, [2023, 2024], organization_id
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_build_anomalies_section_limits_to_10(
        self, property_id, organization_id
    ):
        """Anomalies section limits to top 10 anomalies."""
        # Create 15 anomalies
        anomalies = [
            DetectedAnomaly(
                pool_name=f"Pool {i}",
                anomaly_type=AnomalyType.SPIKE,
                severity=AnomalySeverity.WARNING,
                current_value=Decimal("11000"),
                expected_value=Decimal("10000"),
                variance_percent=Decimal("10.0"),
                explanation=f"Anomaly {i}",
                years_affected=[2024],
            )
            for i in range(15)
        ]

        generator = HistoricalReportGenerator()
        generator.anomaly_service.detect_anomalies = AsyncMock(return_value=anomalies)

        table = await generator._build_anomalies_section(
            property_id, [2023, 2024], organization_id
        )

        table_data = table._cellvalues

        # Header + 10 anomalies = 11 rows
        assert len(table_data) == 11

    @pytest.mark.asyncio
    async def test_build_anomalies_section_non_spike_drop_details(
        self, property_id, organization_id
    ):
        """Non-spike/drop anomalies show 'See explanation' details."""
        anomalies = [
            DetectedAnomaly(
                pool_name="Insurance",
                anomaly_type=AnomalyType.OUTLIER,
                severity=AnomalySeverity.WARNING,
                current_value=Decimal("10500"),
                expected_value=Decimal("10000"),
                variance_percent=Decimal("5.0"),
                explanation="Statistical outlier",
                years_affected=[2024],
            ),
        ]

        generator = HistoricalReportGenerator()
        generator.anomaly_service.detect_anomalies = AsyncMock(return_value=anomalies)

        table = await generator._build_anomalies_section(
            property_id, [2023, 2024], organization_id
        )

        table_data = table._cellvalues

        # Check that non-spike/drop shows "See explanation"
        assert table_data[1][2] == "Outlier"
        assert table_data[1][3] == "See explanation"


class TestGeneratePDF:
    """Integration tests for PDF generation."""

    @pytest.mark.asyncio
    async def test_generate_pdf_creates_valid_pdf(
        self, property_id, organization_id, sample_yoy_response, sample_anomalies
    ):
        """Generate method creates a valid PDF file."""
        generator = HistoricalReportGenerator()
        generator.analysis_service.get_year_over_year = AsyncMock(
            return_value=sample_yoy_response
        )
        generator.anomaly_service.detect_anomalies = AsyncMock(
            return_value=sample_anomalies
        )

        db = object()
        pdf_bytes = await generator.generate(
            property_id=property_id,
            years=[2023, 2024],
            organization_id=organization_id,
            include_charts=False,
            db=db,
        )

        # Should return bytes
        assert isinstance(pdf_bytes, bytes)

        # Should have PDF header
        assert pdf_bytes.startswith(b"%PDF")

        # Should be non-empty (at least 2KB)
        assert len(pdf_bytes) > 2000
        for call in generator.anomaly_service.detect_anomalies.await_args_list:
            assert call.kwargs["db"] is db

    @pytest.mark.asyncio
    async def test_generate_pdf_single_year_skips_anomalies(
        self, property_id, organization_id
    ):
        """PDF generation with single year skips anomalies section."""
        yoy_response = YearOverYearComparison(
            property_id=property_id,
            property_name="Test Property",
            years=[2024],
            base_year=2024,
            pool_comparisons=[],
            total_amounts={2024: Decimal("10000")},
            total_variance_percent=None,
        )

        generator = HistoricalReportGenerator()
        generator.analysis_service.get_year_over_year = AsyncMock(
            return_value=yoy_response
        )
        # Anomaly service should not be called for single year
        generator.anomaly_service.detect_anomalies = AsyncMock()

        pdf_bytes = await generator.generate(
            property_id=property_id,
            years=[2024],  # Single year
            organization_id=organization_id,
            include_charts=False,
        )

        # Should still generate valid PDF
        assert pdf_bytes.startswith(b"%PDF")
        assert len(pdf_bytes) > 1500

        # Anomaly detection should only be called once (in executive summary)
        assert generator.anomaly_service.detect_anomalies.call_count == 1
