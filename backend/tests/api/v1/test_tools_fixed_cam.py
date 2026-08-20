"""
Tests for the Fixed CAM vs Traditional Reconciliation Modeler API endpoint.

POST /api/v1/tools/fixed-cam-modeler — public endpoint, no auth.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


VALID_PAYLOAD = {
    "years": [
        {
            "year": 2024,
            "total_operating_expenses": "1000000",
            "rentable_sf": "100000",
        },
        {
            "year": 2025,
            "total_operating_expenses": "1050000",
            "rentable_sf": "100000",
        },
        {
            "year": 2026,
            "total_operating_expenses": "1100000",
            "rentable_sf": "100000",
        },
    ],
    "fixed_cam_rate_per_sf": "8.50",
    "annual_escalation_pct": "3.0",
    "tenant_sqft": "5000",
    "pro_rata_share": "5.0",
}


class TestFixedCamModelerEndpoint:
    def test_valid_payload_returns_200(self, client):
        """Happy path returns 200 with expected structure."""
        response = client.post("/api/v1/tools/fixed-cam-modeler", json=VALID_PAYLOAD)
        assert response.status_code == 200
        body = response.json()
        assert "years" in body
        assert len(body["years"]) == 3
        assert "total_traditional_recovery" in body
        assert "total_fixed_cam_revenue" in body
        assert "total_delta" in body
        assert "avg_annual_delta" in body
        assert "expense_per_sf" in body["years"][0]

    def test_too_few_years_returns_422(self, client):
        """< 3 years returns 422."""
        payload = {
            **VALID_PAYLOAD,
            "years": VALID_PAYLOAD["years"][:2],
        }
        response = client.post("/api/v1/tools/fixed-cam-modeler", json=payload)
        assert response.status_code == 422

    def test_missing_fields_returns_422(self, client):
        """Missing required fields returns 422."""
        payload = {"years": VALID_PAYLOAD["years"]}
        response = client.post("/api/v1/tools/fixed-cam-modeler", json=payload)
        assert response.status_code == 422
