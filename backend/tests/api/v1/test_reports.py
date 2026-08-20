"""Tests for historical report generation API endpoints."""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    OrganizationContext,
    get_current_user,
    get_org_scoped_context,
)
from app.main import app
from app.models.enums import UserRole
from app.models.historical_analysis import (
    PoolComparison,
    VarianceLevel,
    YearOverYearComparison,
)
from app.models.user import User
from app.services.analysis.anomaly_detection import (
    AnomalySeverity,
    AnomalyType,
    DetectedAnomaly,
)


def make_yoy_comparison(property_id):
    """Create representative year-over-year report data."""
    return YearOverYearComparison(
        property_id=property_id,
        property_name="Downtown Tower",
        years=[2023, 2024],
        base_year=2023,
        pool_comparisons=[
            PoolComparison(
                pool_name="Utilities",
                amounts={2023: Decimal("10000.00"), 2024: Decimal("12500.00")},
                base_year_amount=Decimal("10000.00"),
                variance_amount=Decimal("2500.00"),
                variance_percent=Decimal("25.0"),
                variance_level=VarianceLevel.CRITICAL,
            )
        ],
        total_amounts={2023: Decimal("10000.00"), 2024: Decimal("12500.00")},
        total_variance_amount=Decimal("2500.00"),
        total_variance_percent=Decimal("25.0"),
    )


def make_anomaly():
    """Create representative anomaly data for Excel export."""
    return DetectedAnomaly(
        pool_name="Utilities",
        anomaly_type=AnomalyType.SPIKE,
        severity=AnomalySeverity.CRITICAL,
        current_value=Decimal("12500.00"),
        expected_value=Decimal("10000.00"),
        variance_percent=Decimal("25.0"),
        explanation="Utilities increased materially",
        years_affected=[2024],
    )


@pytest.fixture
def test_org_id():
    """Test organization ID."""
    return uuid4()


@pytest.fixture
def test_user(test_org_id):
    """Test user."""
    return User(
        id=uuid4(),
        email="test@example.com",
        organization_id=test_org_id,
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def test_client(test_user, test_org_id, mock_supabase):
    """Create test client with dependency overrides."""

    async def mock_get_user():
        return test_user

    async def mock_get_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=test_org_id,
            user=test_user,
        )

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_org_scoped_context] = mock_get_org_context

    client = TestClient(app)
    client.mock_supabase = mock_supabase

    yield client

    # Clean up overrides
    app.dependency_overrides.clear()


class TestGeneratePDFReport:
    """Tests for POST /api/v1/reports/historical/pdf endpoint."""

    @patch("app.api.v1.reports.HistoricalReportGenerator")
    def test_generate_pdf_success(self, mock_generator_class, test_client, test_org_id):
        """Should generate PDF report and return signed URL."""
        property_id = uuid4()

        # Mock generator
        mock_generator = MagicMock()
        mock_generator_class.return_value = mock_generator
        mock_generator.generate = AsyncMock(return_value=b"fake-pdf-bytes")

        mock_storage_bucket = MagicMock()
        test_client.mock_supabase.storage.from_.return_value = mock_storage_bucket

        # Mock upload
        mock_storage_bucket.upload.return_value = {"path": "reports/test/file.pdf"}

        # Mock signed URL creation
        mock_storage_bucket.create_signed_url.return_value = {
            "signedURL": "https://storage.example.com/signed-url"
        }

        response = test_client.post(
            "/api/v1/reports/historical/pdf",
            json={
                "property_id": str(property_id),
                "years": [2023, 2024],
                "include_charts": True,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["report_url"] == "https://storage.example.com/signed-url"
        assert data["format"] == "pdf"
        assert "expires_at" in data

        # Verify generator was called correctly
        mock_generator.generate.assert_called_once()
        call_kwargs = mock_generator.generate.call_args.kwargs
        assert call_kwargs["property_id"] == property_id
        assert call_kwargs["years"] == [2023, 2024]
        assert call_kwargs["organization_id"] == test_org_id
        assert call_kwargs["include_charts"] is True
        assert call_kwargs["db"] is test_client.mock_supabase

        # Verify storage operations
        mock_storage_bucket.upload.assert_called_once()
        mock_storage_bucket.create_signed_url.assert_called_once()
        # Signed URL should expire in 7 days (604800 seconds)
        assert mock_storage_bucket.create_signed_url.call_args[0][1] == 604800

    @patch("app.api.v1.reports.HistoricalReportGenerator")
    def test_generate_pdf_invalid_years_count(self, mock_generator_class, test_client):
        """Should return 400 when less than 2 years provided."""
        property_id = uuid4()

        response = test_client.post(
            "/api/v1/reports/historical/pdf",
            json={
                "property_id": str(property_id),
                "years": [2024],  # Only 1 year
                "include_charts": False,
            },
        )

        assert response.status_code == 400
        assert "At least 2 years required" in response.json()["detail"]

        # Generator should not be called
        mock_generator_class.assert_not_called()

    @patch("app.api.v1.reports.HistoricalReportGenerator")
    def test_generate_pdf_empty_years(self, mock_generator_class, test_client):
        """Should return 400 when no years provided."""
        property_id = uuid4()

        response = test_client.post(
            "/api/v1/reports/historical/pdf",
            json={
                "property_id": str(property_id),
                "years": [],
                "include_charts": False,
            },
        )

        assert response.status_code == 400
        assert "At least 2 years required" in response.json()["detail"]

        # Generator should not be called
        mock_generator_class.assert_not_called()

    @patch("app.api.v1.reports.HistoricalReportGenerator")
    def test_generate_pdf_generation_error(self, mock_generator_class, test_client):
        """Should return 500 when PDF generation fails."""
        property_id = uuid4()

        # Mock generator to raise exception
        mock_generator = MagicMock()
        mock_generator_class.return_value = mock_generator
        mock_generator.generate = AsyncMock(
            side_effect=Exception("PDF generation failed")
        )

        response = test_client.post(
            "/api/v1/reports/historical/pdf",
            json={
                "property_id": str(property_id),
                "years": [2023, 2024],
                "include_charts": False,
            },
        )

        assert response.status_code == 500
        assert "Failed to generate PDF report" in response.json()["detail"]

    @patch("app.api.v1.reports.HistoricalReportGenerator")
    def test_generate_pdf_storage_upload_error(self, mock_generator_class, test_client):
        """Should return 500 when storage upload fails."""
        property_id = uuid4()

        # Mock generator success
        mock_generator = MagicMock()
        mock_generator_class.return_value = mock_generator
        mock_generator.generate = AsyncMock(return_value=b"fake-pdf-bytes")

        mock_storage_bucket = MagicMock()
        test_client.mock_supabase.storage.from_.return_value = mock_storage_bucket
        mock_storage_bucket.upload.side_effect = Exception("Storage upload failed")

        response = test_client.post(
            "/api/v1/reports/historical/pdf",
            json={
                "property_id": str(property_id),
                "years": [2023, 2024],
                "include_charts": False,
            },
        )

        assert response.status_code == 500
        assert "Failed to generate PDF report" in response.json()["detail"]

    @patch("app.api.v1.reports.HistoricalReportGenerator")
    def test_generate_pdf_value_error(self, mock_generator_class, test_client):
        """Should return 400 when generator raises ValueError."""
        property_id = uuid4()

        # Mock generator to raise ValueError
        mock_generator = MagicMock()
        mock_generator_class.return_value = mock_generator
        mock_generator.generate = AsyncMock(
            side_effect=ValueError("Invalid property ID")
        )

        response = test_client.post(
            "/api/v1/reports/historical/pdf",
            json={
                "property_id": str(property_id),
                "years": [2023, 2024],
                "include_charts": False,
            },
        )

        assert response.status_code == 400
        assert "Invalid property ID" in response.json()["detail"]

    @patch("app.api.v1.reports.HistoricalReportGenerator")
    def test_generate_pdf_invalid_property_id_format(
        self, mock_generator_class, test_client
    ):
        """Should return 400 for invalid property ID format (ValueError caught)."""
        response = test_client.post(
            "/api/v1/reports/historical/pdf",
            json={
                "property_id": "invalid-uuid",
                "years": [2023, 2024],
                "include_charts": False,
            },
        )

        # UUID() raises ValueError which is caught and returns 400
        assert response.status_code == 400
        assert "badly formed hexadecimal UUID string" in response.json()["detail"]

    @patch("app.api.v1.reports.HistoricalReportGenerator")
    def test_generate_pdf_years_sorted(self, mock_generator_class, test_client):
        """Should sort years before passing to generator."""
        property_id = uuid4()

        # Mock generator
        mock_generator = MagicMock()
        mock_generator_class.return_value = mock_generator
        mock_generator.generate = AsyncMock(return_value=b"fake-pdf-bytes")

        mock_storage_bucket = MagicMock()
        test_client.mock_supabase.storage.from_.return_value = mock_storage_bucket
        mock_storage_bucket.upload.return_value = {"path": "test.pdf"}
        mock_storage_bucket.create_signed_url.return_value = {
            "signedURL": "https://example.com/url"
        }

        # Send unsorted years
        response = test_client.post(
            "/api/v1/reports/historical/pdf",
            json={
                "property_id": str(property_id),
                "years": [2024, 2022, 2023],  # Unsorted
                "include_charts": False,
            },
        )

        assert response.status_code == 200

        # Verify years were sorted before passing to generator
        call_kwargs = mock_generator.generate.call_args.kwargs
        assert call_kwargs["years"] == [2022, 2023, 2024]  # Sorted


class TestGenerateExcelReport:
    """Tests for POST /api/v1/reports/historical/excel endpoint."""

    @patch("app.api.v1.reports.export_to_excel")
    @patch("app.api.v1.reports.AnomalyDetectionService")
    @patch("app.api.v1.reports.HistoricalAnalysisService")
    def test_generate_excel_success(
        self,
        mock_analysis_class,
        mock_anomaly_class,
        mock_export_to_excel,
        test_client,
        test_org_id,
    ):
        """Should generate Excel report and return it as a download."""
        property_id = uuid4()
        yoy = make_yoy_comparison(property_id)
        anomaly = make_anomaly()

        mock_analysis = MagicMock()
        mock_analysis.get_year_over_year = AsyncMock(return_value=yoy)
        mock_analysis_class.return_value = mock_analysis

        mock_anomaly_service = MagicMock()
        mock_anomaly_service.detect_anomalies = AsyncMock(return_value=[anomaly])
        mock_anomaly_class.return_value = mock_anomaly_service

        mock_export_to_excel.return_value = b"fake-xlsx-bytes"

        response = test_client.post(
            "/api/v1/reports/historical/excel",
            json={
                "property_id": str(property_id),
                "years": [2024, 2023],
                "include_charts": False,
            },
        )

        assert response.status_code == 200
        assert response.content == b"fake-xlsx-bytes"
        assert (
            response.headers["content-type"]
            == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        assert (
            response.headers["content-disposition"]
            == f'attachment; filename="historical_analysis_{property_id}_2023-2024.xlsx"'
        )

        mock_analysis.get_year_over_year.assert_awaited_once()
        analysis_kwargs = mock_analysis.get_year_over_year.await_args.kwargs
        assert analysis_kwargs["property_id"] == property_id
        assert analysis_kwargs["years"] == [2023, 2024]
        assert analysis_kwargs["organization_id"] == test_org_id
        assert analysis_kwargs["use_fuzzy_matching"] is True

        mock_anomaly_service.detect_anomalies.assert_awaited_once()
        anomaly_kwargs = mock_anomaly_service.detect_anomalies.await_args.kwargs
        assert anomaly_kwargs["property_id"] == property_id
        assert anomaly_kwargs["target_year"] == 2024
        assert anomaly_kwargs["comparison_years"] == [2023]
        assert anomaly_kwargs["db"] is test_client.mock_supabase

        mock_export_to_excel.assert_called_once()
        report_data = mock_export_to_excel.call_args.args[0]
        assert report_data["property"] == {
            "id": str(property_id),
            "name": "Downtown Tower",
        }
        assert report_data["years_compared"] == [2023, 2024]
        assert report_data["year_over_year_comparison"]["categories"] == [
            {
                "name": "Utilities",
                "years": [2023, 2024],
                "amounts": [Decimal("10000.00"), Decimal("12500.00")],
                "variance_percent": Decimal("25.0"),
            }
        ]
        assert report_data["year_over_year_comparison"]["totals"] == [
            {"year": 2023, "total": Decimal("10000.00")},
            {"year": 2024, "total": Decimal("12500.00")},
        ]
        assert report_data["anomalies"] == [
            {
                "severity": "critical",
                "pool_name": "Utilities",
                "anomaly_type": "spike",
                "current_value": 12500.0,
                "expected_value": 10000.0,
                "variance_percent": 25.0,
                "explanation": "Utilities increased materially",
            }
        ]

    @patch("app.api.v1.reports.HistoricalAnalysisService")
    def test_generate_excel_invalid_years_count(self, mock_analysis_class, test_client):
        """Should return 400 when less than 2 years provided."""
        response = test_client.post(
            "/api/v1/reports/historical/excel",
            json={
                "property_id": str(uuid4()),
                "years": [2024],
                "include_charts": False,
            },
        )

        assert response.status_code == 400
        assert "At least 2 years required" in response.json()["detail"]
        mock_analysis_class.assert_not_called()

    @patch("app.api.v1.reports.HistoricalAnalysisService")
    def test_generate_excel_invalid_property_id_format(
        self, mock_analysis_class, test_client
    ):
        """Should return 400 for invalid property ID format."""
        mock_analysis = MagicMock()
        mock_analysis.get_year_over_year = AsyncMock()
        mock_analysis_class.return_value = mock_analysis

        response = test_client.post(
            "/api/v1/reports/historical/excel",
            json={
                "property_id": "not-a-uuid",
                "years": [2023, 2024],
                "include_charts": False,
            },
        )

        assert response.status_code == 400
        assert "badly formed hexadecimal UUID string" in response.json()["detail"]
        mock_analysis.get_year_over_year.assert_not_called()

    @patch("app.api.v1.reports.AnomalyDetectionService")
    @patch("app.api.v1.reports.HistoricalAnalysisService")
    def test_generate_excel_analysis_error(
        self, mock_analysis_class, mock_anomaly_class, test_client
    ):
        """Should return 500 when analysis lookup fails unexpectedly."""
        mock_analysis = MagicMock()
        mock_analysis.get_year_over_year = AsyncMock(
            side_effect=Exception("analysis unavailable")
        )
        mock_analysis_class.return_value = mock_analysis
        mock_anomaly_service = MagicMock()
        mock_anomaly_service.detect_anomalies = AsyncMock()
        mock_anomaly_class.return_value = mock_anomaly_service

        response = test_client.post(
            "/api/v1/reports/historical/excel",
            json={
                "property_id": str(uuid4()),
                "years": [2023, 2024],
                "include_charts": False,
            },
        )

        assert response.status_code == 500
        assert "Failed to generate Excel report" in response.json()["detail"]
        mock_anomaly_service.detect_anomalies.assert_not_called()

    @patch("app.api.v1.reports.AnomalyDetectionService")
    @patch("app.api.v1.reports.HistoricalAnalysisService")
    def test_generate_excel_value_error(
        self, mock_analysis_class, mock_anomaly_class, test_client
    ):
        """Should return 400 when report inputs are rejected by analysis."""
        mock_analysis = MagicMock()
        mock_analysis.get_year_over_year = AsyncMock(
            side_effect=ValueError("Invalid property ID")
        )
        mock_analysis_class.return_value = mock_analysis
        mock_anomaly_service = MagicMock()
        mock_anomaly_service.detect_anomalies = AsyncMock()
        mock_anomaly_class.return_value = mock_anomaly_service

        response = test_client.post(
            "/api/v1/reports/historical/excel",
            json={
                "property_id": str(uuid4()),
                "years": [2023, 2024],
                "include_charts": False,
            },
        )

        assert response.status_code == 400
        assert "Invalid property ID" in response.json()["detail"]
        mock_anomaly_service.detect_anomalies.assert_not_called()
