"""
Tests for the BOMA 2024 Rentable Area Calculator API endpoint.

POST /api/v1/tools/boma-2024-calculator — public endpoint, no auth.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """Test client for the calculator endpoint (no dependency overrides needed)."""
    return TestClient(app)


VALID_PAYLOAD = {
    "usable_sf": "100000",
    "rentable_sf": "125000",
    "balcony_sf": "5000",
    "terrace_sf": "2000",
    "outdoor_amenity_sf": "1000",
    "annual_rent_per_sf": "30",
    "cap_rate": "0.065",
}


class TestBomaCalculatorSuccess:
    def test_valid_payload_returns_200(self, client):
        """Valid payload returns 200 OK."""
        response = client.post("/api/v1/tools/boma-2024-calculator", json=VALID_PAYLOAD)
        assert response.status_code == 200

    def test_response_contains_all_result_fields(self, client):
        """Response includes all expected fields."""
        response = client.post("/api/v1/tools/boma-2024-calculator", json=VALID_PAYLOAD)
        body = response.json()
        expected_fields = {
            "load_factor",
            "new_usable_sf",
            "new_rentable_sf",
            "hidden_sf",
            "pct_increase",
            "revenue_lift",
            "asset_value_lift",
        }
        assert expected_fields.issubset(body.keys())

    def test_load_factor_derived_correctly(self, client):
        """load_factor is derived from inputs, not user-provided."""
        # 125000 / 100000 = 1.2500
        response = client.post("/api/v1/tools/boma-2024-calculator", json=VALID_PAYLOAD)
        assert response.json()["load_factor"] == "1.2500"

    def test_hidden_sf_correct(self, client):
        """hidden_sf = new_rentable_sf - rentable_sf."""
        # new_usable=108000, new_rentable=135000, hidden=10000
        response = client.post("/api/v1/tools/boma-2024-calculator", json=VALID_PAYLOAD)
        assert response.json()["hidden_sf"] == "10000.00"

    def test_hidden_sf_zero_when_no_outdoor(self, client):
        """hidden_sf == 0 when all outdoor SF fields are omitted."""
        payload = {
            "usable_sf": "100000",
            "rentable_sf": "125000",
            "annual_rent_per_sf": "30",
        }
        response = client.post("/api/v1/tools/boma-2024-calculator", json=payload)
        assert response.status_code == 200
        assert response.json()["hidden_sf"] == "0.00"

    def test_response_values_are_decimal_strings(self, client):
        """Response serializes Decimal fields as strings (not floats)."""
        response = client.post("/api/v1/tools/boma-2024-calculator", json=VALID_PAYLOAD)
        body = response.json()
        # Decimal strings contain a dot and no scientific notation
        assert "." in body["load_factor"]
        assert "e" not in body["load_factor"].lower()
        assert "." in body["hidden_sf"]

    def test_default_cap_rate_applied(self, client):
        """Omitting cap_rate uses default of 0.065."""
        payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "cap_rate"}
        response = client.post("/api/v1/tools/boma-2024-calculator", json=payload)
        assert response.status_code == 200
        # revenue_lift=300000, asset_value_lift=300000/0.065=4615384.6...→4615385
        assert response.json()["asset_value_lift"] == "4615385"

    def test_large_sf_values_no_overflow(self, client):
        """Large SF values are handled without arithmetic overflow."""
        payload = {
            "usable_sf": "10000000",
            "rentable_sf": "12500000",
            "balcony_sf": "500000",
            "terrace_sf": "200000",
            "outdoor_amenity_sf": "100000",
            "annual_rent_per_sf": "50",
            "cap_rate": "0.065",
        }
        response = client.post("/api/v1/tools/boma-2024-calculator", json=payload)
        assert response.status_code == 200
        assert response.json()["hidden_sf"] == "1000000.00"


class TestBomaCalculatorValidation:
    def test_rentable_sf_less_than_usable_sf_returns_422(self, client):
        """rentable_sf < usable_sf returns 422 Unprocessable Entity."""
        payload = {**VALID_PAYLOAD, "usable_sf": "150000", "rentable_sf": "100000"}
        response = client.post("/api/v1/tools/boma-2024-calculator", json=payload)
        assert response.status_code == 422

    def test_missing_usable_sf_returns_422(self, client):
        """Missing required field usable_sf returns 422."""
        payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "usable_sf"}
        response = client.post("/api/v1/tools/boma-2024-calculator", json=payload)
        assert response.status_code == 422

    def test_missing_annual_rent_returns_422(self, client):
        """Missing required field annual_rent_per_sf returns 422."""
        payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "annual_rent_per_sf"}
        response = client.post("/api/v1/tools/boma-2024-calculator", json=payload)
        assert response.status_code == 422

    def test_cap_rate_above_one_returns_422(self, client):
        """cap_rate > 1 returns 422."""
        response = client.post(
            "/api/v1/tools/boma-2024-calculator",
            json={**VALID_PAYLOAD, "cap_rate": "1.5"},
        )
        assert response.status_code == 422

    def test_negative_usable_sf_returns_422(self, client):
        """usable_sf <= 0 returns 422."""
        response = client.post(
            "/api/v1/tools/boma-2024-calculator",
            json={**VALID_PAYLOAD, "usable_sf": "0"},
        )
        assert response.status_code == 422

    def test_negative_outdoor_sf_returns_422(self, client):
        """Negative outdoor SF returns 422."""
        response = client.post(
            "/api/v1/tools/boma-2024-calculator",
            json={**VALID_PAYLOAD, "balcony_sf": "-100"},
        )
        assert response.status_code == 422
