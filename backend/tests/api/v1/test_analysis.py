"""Tests for historical analysis API endpoints."""

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
from tests.conftest import MockQueryBuilder


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


class TestYearOverYearEndpoint:
    """Tests for POST /api/v1/analysis/year-over-year endpoint."""

    @patch("app.api.v1.analysis.HistoricalAnalysisService")
    def test_year_over_year_success(self, mock_service_class, test_client, test_org_id):
        """Should return year-over-year comparison successfully."""
        property_id = uuid4()
        years = [2023, 2024]

        mock_service = MagicMock()
        mock_service_class.return_value = mock_service
        mock_service.get_year_over_year = AsyncMock(
            return_value=YearOverYearComparison(
                property_id=property_id,
                property_name="Test Property",
                years=years,
                base_year=2023,
                pool_comparisons=[
                    PoolComparison(
                        pool_name="Utilities",
                        amounts={2023: Decimal("1000.00"), 2024: Decimal("1200.00")},
                        base_year_amount=Decimal("1000.00"),
                        variance_amount=Decimal("200.00"),
                        variance_percent=Decimal("20.00"),
                        variance_level=VarianceLevel.CRITICAL,
                    )
                ],
                total_amounts={2023: Decimal("1000.00"), 2024: Decimal("1200.00")},
                total_variance_amount=Decimal("200.00"),
                total_variance_percent=Decimal("20.00"),
            )
        )

        response = test_client.post(
            "/api/v1/analysis/year-over-year",
            json={
                "property_id": str(property_id),
                "years": years,
                "use_fuzzy_matching": True,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["property_id"] == str(property_id)
        assert data["property_name"] == "Test Property"
        assert data["years"] == years
        assert data["base_year"] == 2023
        assert data["total_amounts"] == {"2023": "1000.00", "2024": "1200.00"}
        assert data["total_variance_amount"] == "200.00"
        assert data["total_variance_percent"] == "20.00"
        assert len(data["pool_comparisons"]) == 1
        pool = data["pool_comparisons"][0]
        assert pool["pool_name"] == "Utilities"
        assert pool["amounts"] == {"2023": "1000.00", "2024": "1200.00"}
        assert pool["variance_amount"] == "200.00"
        assert pool["variance_percent"] == "20.00"
        assert pool["variance_level"] == "critical"
        mock_service_class.assert_called_once_with()
        mock_service.get_year_over_year.assert_awaited_once_with(
            property_id=property_id,
            years=years,
            organization_id=test_org_id,
            use_fuzzy_matching=True,
        )

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    def test_year_over_year_invalid_years(
        self, mock_get_supabase, test_client, test_org_id
    ):
        """Should return 422 for invalid year count (Pydantic validation)."""
        property_id = uuid4()

        response = test_client.post(
            "/api/v1/analysis/year-over-year",
            json={
                "property_id": str(property_id),
                "years": [2024],  # Only 1 year
                "use_fuzzy_matching": True,
            },
        )

        # Pydantic validation returns 422, not 400
        assert response.status_code == 422
        # Check that validation error mentions years field
        assert "years" in str(response.json()).lower()

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    def test_year_over_year_property_not_found(
        self, mock_get_supabase, test_client, test_org_id
    ):
        """Should return 400 for non-existent property."""
        property_id = uuid4()

        # Mock Supabase to raise error for missing property
        mock_supabase = MagicMock()
        mock_get_supabase.return_value = mock_supabase

        mock_property_response = MagicMock()
        mock_property_response.data = None  # Property not found

        mock_chain = MagicMock()
        mock_chain.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_property_response
        )
        mock_supabase.table.return_value = mock_chain

        response = test_client.post(
            "/api/v1/analysis/year-over-year",
            json={
                "property_id": str(property_id),
                "years": [2023, 2024],
                "use_fuzzy_matching": True,
            },
        )

        assert response.status_code == 400
        assert "No finalized snapshots found for years" in response.json()["detail"]

    @patch("app.api.v1.analysis.capture_unexpected_exception")
    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    def test_year_over_year_generic_exception(
        self, mock_get_supabase, mock_capture_exception, test_client, test_org_id
    ):
        """Should return 500 for unexpected exception (not ValueError) - covers lines 56-59."""
        property_id = uuid4()

        # Mock Supabase to raise a generic exception (not ValueError)
        mock_supabase = MagicMock()
        mock_get_supabase.return_value = mock_supabase

        # Raise RuntimeError (any exception other than ValueError)
        mock_supabase.table.side_effect = RuntimeError("Database connection failed")

        response = test_client.post(
            "/api/v1/analysis/year-over-year",
            json={
                "property_id": str(property_id),
                "years": [2023, 2024],
                "use_fuzzy_matching": True,
            },
        )

        assert response.status_code == 500
        assert response.json()["detail"] == "Failed to generate comparison"
        assert "Database connection failed" not in response.json()["detail"]
        mock_capture_exception.assert_called_once()
        assert mock_capture_exception.call_args.kwargs["operation"] == (
            "analysis.year_over_year"
        )

    def test_year_over_year_invalid_request_body(self, test_client):
        """Should return 422 for invalid request body."""
        response = test_client.post(
            "/api/v1/analysis/year-over-year",
            json={
                "property_id": "invalid-uuid",
                "years": [2024],
                "use_fuzzy_matching": True,
            },
        )

        assert response.status_code == 422


class TestAvailableYearsEndpoint:
    """Tests for GET /api/v1/analysis/properties/{property_id}/available-years endpoint."""

    def test_available_years_success(self, test_client):
        """Should return available years successfully."""
        property_id = uuid4()

        mock_response = MagicMock()
        mock_response.data = [
            {"period_start_date": "2022-01-01"},
            {"period_start_date": "2023-01-01"},
            {"period_start_date": "2023-06-01"},  # Same year, should dedupe
            {"period_start_date": "2024-01-01"},
        ]

        # Query: .select().eq(property_id).eq(status).execute()
        mock_chain = MagicMock()
        mock_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_response
        )
        test_client.mock_supabase.table.return_value = mock_chain

        response = test_client.get(
            f"/api/v1/analysis/properties/{property_id}/available-years"
        )

        assert response.status_code == 200
        data = response.json()
        assert data == [2022, 2023, 2024]  # Sorted and deduped

    def test_available_years_no_snapshots(self, test_client):
        """Should return empty list when no snapshots."""
        property_id = uuid4()

        mock_response = MagicMock()
        mock_response.data = []

        # Query: .select().eq(property_id).eq(status).execute()
        mock_chain = MagicMock()
        mock_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_response
        )
        test_client.mock_supabase.table.return_value = mock_chain

        response = test_client.get(
            f"/api/v1/analysis/properties/{property_id}/available-years"
        )

        assert response.status_code == 200
        assert response.json() == []

    def test_available_years_filters_none_period_start(self, test_client):
        """Should skip snapshots with None period_start_date."""
        property_id = uuid4()

        mock_response = MagicMock()
        mock_response.data = [
            {"period_start_date": "2023-01-01"},
            {"period_start_date": None},  # Should be skipped
            {"period_start_date": "2024-01-01"},
            {"period_start_date": None},  # Should be skipped
        ]

        # Query: .select().eq(property_id).eq(status).execute()
        mock_chain = MagicMock()
        mock_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_response
        )
        test_client.mock_supabase.table.return_value = mock_chain

        response = test_client.get(
            f"/api/v1/analysis/properties/{property_id}/available-years"
        )

        assert response.status_code == 200
        data = response.json()
        assert data == [2023, 2024]  # None values filtered out

    def test_available_years_invalid_property_id(self, test_client):
        """Should return 422 for invalid property ID."""
        response = test_client.get(
            "/api/v1/analysis/properties/invalid-uuid/available-years"
        )

        assert response.status_code == 422


class TestAnomalyDetectionEndpoint:
    """Tests for POST /api/v1/analysis/anomaly-detection endpoint."""

    @patch("app.api.v1.analysis.AnomalyDetectionService")
    def test_anomaly_detection_rejects_property_outside_org(
        self, mock_service_class, test_client
    ):
        """Should reject foreign properties before service-role analysis runs."""
        property_id = uuid4()
        test_client.mock_supabase.table.return_value = MockQueryBuilder(data=[])

        mock_service = MagicMock()
        mock_service.detect_anomalies = AsyncMock(return_value=[])
        mock_service_class.return_value = mock_service

        response = test_client.post(
            "/api/v1/analysis/anomaly-detection",
            json={
                "property_id": str(property_id),
                "target_year": 2024,
                "comparison_years": [2022, 2023],
            },
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Property not found"
        mock_service.detect_anomalies.assert_not_called()

    @patch("app.api.v1.analysis.AnomalyDetectionService")
    def test_anomaly_detection_success(
        self, mock_service_class, test_client, test_org_id
    ):
        """Should detect anomalies successfully."""
        from app.services.analysis.anomaly_detection import (
            AnomalySeverity,
            DetectedAnomaly,
        )

        property_id = uuid4()

        # Mock service instance and its method
        mock_service = MagicMock()
        mock_service_class.return_value = mock_service

        # Mock service response
        mock_anomalies = [
            DetectedAnomaly(
                pool_name="Utilities",
                anomaly_type="spike",
                severity=AnomalySeverity.CRITICAL,
                current_value=15000.0,
                expected_value=10000.0,
                variance_percent=50.0,
                explanation="Utilities expense 50% higher than expected",
                years_affected=[2024],
            ),
            DetectedAnomaly(
                pool_name="Janitorial",
                anomaly_type="outlier",
                severity=AnomalySeverity.WARNING,
                current_value=8000.0,
                expected_value=7000.0,
                variance_percent=14.3,
                explanation="Janitorial expense 14.3% higher than expected",
                years_affected=[2024],
            ),
            DetectedAnomaly(
                pool_name="Insurance",
                anomaly_type="new_category",
                severity=AnomalySeverity.INFO,
                current_value=5000.0,
                expected_value=0.0,
                variance_percent=0.0,
                explanation="New expense category not present in comparison years",
                years_affected=[2024],
            ),
        ]

        # Use AsyncMock for async method
        mock_service.detect_anomalies = AsyncMock(return_value=mock_anomalies)

        response = test_client.post(
            "/api/v1/analysis/anomaly-detection",
            json={
                "property_id": str(property_id),
                "target_year": 2024,
                "comparison_years": [2022, 2023],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["property_id"] == str(property_id)
        assert data["target_year"] == 2024
        assert data["total_anomalies"] == 3
        assert data["critical_count"] == 1
        assert data["warning_count"] == 1
        assert data["info_count"] == 1
        assert len(data["anomalies"]) == 3

        # Verify anomaly details
        utilities_anomaly = next(
            a for a in data["anomalies"] if a["pool_name"] == "Utilities"
        )
        assert utilities_anomaly["severity"] == "critical"
        # variance_percent is serialized as string from Decimal
        assert float(utilities_anomaly["variance_percent"]) == 50.0

    @patch("app.api.v1.analysis.AnomalyDetectionService")
    def test_anomaly_detection_no_anomalies_found(
        self, mock_service_class, test_client, test_org_id
    ):
        """Should return empty list when no anomalies detected."""
        property_id = uuid4()

        # Mock service instance
        mock_service = MagicMock()
        mock_service_class.return_value = mock_service
        # Use AsyncMock for async method
        mock_service.detect_anomalies = AsyncMock(return_value=[])

        response = test_client.post(
            "/api/v1/analysis/anomaly-detection",
            json={
                "property_id": str(property_id),
                "target_year": 2024,
                "comparison_years": [2022, 2023],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_anomalies"] == 0
        assert data["critical_count"] == 0
        assert data["warning_count"] == 0
        assert data["info_count"] == 0
        assert data["anomalies"] == []

    @patch("app.api.v1.analysis.AnomalyDetectionService")
    def test_anomaly_detection_value_error(
        self, mock_service_class, test_client, test_org_id
    ):
        """Should return 400 for invalid parameters."""
        property_id = uuid4()

        # Mock service instance
        mock_service = MagicMock()
        mock_service_class.return_value = mock_service
        mock_service.detect_anomalies.side_effect = ValueError("Invalid year range")

        response = test_client.post(
            "/api/v1/analysis/anomaly-detection",
            json={
                "property_id": str(property_id),
                "target_year": 2020,  # Invalid
                "comparison_years": [2022, 2023],
            },
        )

        assert response.status_code == 400
        assert "Invalid year range" in response.json()["detail"]

    @patch("app.api.v1.analysis.capture_unexpected_exception")
    @patch("app.api.v1.analysis.AnomalyDetectionService")
    def test_anomaly_detection_internal_error(
        self, mock_service_class, mock_capture_exception, test_client, test_org_id
    ):
        """Should return 500 for internal errors."""
        property_id = uuid4()

        # Mock service instance
        mock_service = MagicMock()
        mock_service_class.return_value = mock_service
        mock_service.detect_anomalies.side_effect = Exception(
            "Database connection failed"
        )

        response = test_client.post(
            "/api/v1/analysis/anomaly-detection",
            json={
                "property_id": str(property_id),
                "target_year": 2024,
                "comparison_years": [2022, 2023],
            },
        )

        assert response.status_code == 500
        assert response.json()["detail"] == "Failed to detect anomalies"
        assert "Database connection failed" not in response.json()["detail"]
        mock_capture_exception.assert_called_once()
        assert mock_capture_exception.call_args.kwargs["operation"] == (
            "analysis.anomaly_detection"
        )

    def test_anomaly_detection_invalid_property_id(self, test_client):
        """Should return 400 for invalid property ID format (Pydantic validation error)."""
        response = test_client.post(
            "/api/v1/analysis/anomaly-detection",
            json={
                "property_id": "invalid-uuid",
                "target_year": 2024,
                "comparison_years": [2022, 2023],
            },
        )

        # Pydantic validation errors return 400 in our error handler
        assert response.status_code == 400
