# Story 24.5: Verify Reconciliation API (Epic 7)

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 4 hours
**Status**: `pending`
**Dependencies**: Epic 7

---

## User Story

As a **frontend developer**,
I want to **verify that all reconciliation API endpoints work correctly and return expected data**,
So that **the UI can reliably display calculation results and snapshots**.

---

## Acceptance Criteria

### API Endpoints
- [ ] POST `/reconciliation/calculate` triggers calculation and returns snapshot ID
- [ ] GET `/reconciliation/snapshots/{id}` returns snapshot with all data
- [ ] GET `/reconciliation/snapshots` lists all snapshots for property
- [ ] POST `/reconciliation/snapshots/{id}/finalize` marks snapshot as immutable
- [ ] GET `/reconciliation/variance` returns year-over-year variance data
- [ ] POST `/reconciliation/export/pdf` generates tenant packet PDF
- [ ] POST `/reconciliation/export/erp` generates ERP write-back file

### Data Integrity
- [ ] Calculation results are saved to reconciliation_snapshots table
- [ ] Finalized snapshots cannot be modified
- [ ] Snapshots include calculation trace
- [ ] Snapshots include tenant shares
- [ ] Snapshots include expense pool aggregations

### Error Handling
- [ ] 404 when snapshot not found
- [ ] 403 when accessing snapshot from different organization
- [ ] 400 when missing required parameters
- [ ] 422 when validation fails
- [ ] 409 when trying to finalize already-finalized snapshot

### Authorization
- [ ] RLS prevents cross-tenant snapshot access
- [ ] Only authenticated users can calculate reconciliation
- [ ] Only users in same organization can view snapshots

---

## Technical Specifications

### E2E API Test

```python
# backend/tests/integration/test_reconciliation_api_e2e.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.integration
async def test_reconciliation_api_e2e(db_session, auth_headers):
    """Test complete reconciliation API workflow."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # 1. Calculate reconciliation
        response = await client.post(
            "/api/v1/reconciliation/calculate",
            headers=auth_headers,
            json={
                "property_id": "test_property",
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
            }
        )
        assert response.status_code == 200
        snapshot_id = response.json()["data"]["snapshot_id"]

        # 2. Get snapshot
        response = await client.get(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        snapshot = response.json()["data"]
        assert snapshot["id"] == snapshot_id
        assert "total_recoverable" in snapshot
        assert "tenant_shares" in snapshot
        assert "calculation_trace" in snapshot
        assert snapshot["is_finalized"] is False

        # 3. List snapshots
        response = await client.get(
            "/api/v1/reconciliation/snapshots",
            headers=auth_headers,
            params={"property_id": "test_property"}
        )
        assert response.status_code == 200
        snapshots = response.json()["data"]["items"]
        assert len(snapshots) > 0
        assert any(s["id"] == snapshot_id for s in snapshots)

        # 4. Finalize snapshot
        response = await client.post(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}/finalize",
            headers=auth_headers
        )
        assert response.status_code == 200

        # 5. Verify finalized snapshot is immutable
        response = await client.get(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}",
            headers=auth_headers
        )
        assert response.json()["data"]["is_finalized"] is True

        # 6. Try to finalize again (should fail)
        response = await client.post(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}/finalize",
            headers=auth_headers
        )
        assert response.status_code == 409  # Already finalized
```

### Authorization Test

```python
# backend/tests/test_reconciliation_api_auth.py
import pytest
from httpx import AsyncClient

async def test_cross_tenant_snapshot_access_denied(db_session):
    """Verify RLS prevents cross-tenant snapshot access."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Org A creates snapshot
        org_a_headers = {"Authorization": f"Bearer {org_a_token}"}
        response = await client.post(
            "/api/v1/reconciliation/calculate",
            headers=org_a_headers,
            json={"property_id": "org_a_property", "period_start": "2024-01-01", "period_end": "2024-12-31"}
        )
        snapshot_id = response.json()["data"]["snapshot_id"]

        # Org B tries to access Org A's snapshot
        org_b_headers = {"Authorization": f"Bearer {org_b_token}"}
        response = await client.get(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}",
            headers=org_b_headers
        )
        assert response.status_code == 404  # RLS hides it (returns 404, not 403)
```

### Validation Test

```python
# backend/tests/test_reconciliation_api_validation.py
import pytest
from httpx import AsyncClient

@pytest.mark.parametrize("invalid_input,expected_error", [
    ({"property_id": ""}, "property_id is required"),
    ({"property_id": "test", "period_start": "invalid-date"}, "invalid date format"),
    ({"property_id": "test", "period_start": "2024-12-31", "period_end": "2024-01-01"}, "period_end must be after period_start"),
])
async def test_calculate_endpoint_validation(invalid_input, expected_error):
    """Verify validation errors are returned with clear messages."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/reconciliation/calculate",
            headers=auth_headers,
            json=invalid_input
        )
        assert response.status_code == 422
        assert expected_error.lower() in response.json()["detail"].lower()
```

### Variance Endpoint Test

```python
# backend/tests/test_variance_endpoint.py
import pytest
from httpx import AsyncClient

async def test_variance_detection_endpoint(db_session, auth_headers):
    """Verify variance endpoint returns year-over-year comparison."""
    # Create snapshots for Year 1 and Year 2
    # ... setup code ...

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/reconciliation/variance",
            headers=auth_headers,
            params={
                "property_id": "test_property",
                "base_year": 2023,
                "comparison_year": 2024
            }
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert "expense_pool_variances" in data
        assert "total_variance_percent" in data
        assert "anomalies_detected" in data
```

### PDF Export Test

```python
# backend/tests/test_pdf_export.py
import pytest
from httpx import AsyncClient

async def test_tenant_packet_pdf_export(db_session, auth_headers):
    """Verify PDF export generates valid PDF file."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/reconciliation/export/pdf",
            headers=auth_headers,
            json={
                "snapshot_id": "test_snapshot",
                "tenant_id": "test_tenant"
            }
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert len(response.content) > 0
        # Verify PDF is valid (first 4 bytes should be "%PDF")
        assert response.content[:4] == b"%PDF"
```

---

## Files to Audit

### API Endpoints
- `backend/app/api/v1/reconciliation.py`

### Services
- `backend/app/services/reconciliation/snapshot_service.py`
- `backend/app/services/reconciliation/variance_service.py`
- `backend/app/services/reconciliation/export_service.py`

### Tests
- `backend/tests/integration/test_reconciliation_api_e2e.py`
- `backend/tests/test_reconciliation_api_*.py`

---

## Definition of Done

- [ ] All API endpoints return correct status codes
- [ ] All API endpoints return data in correct format
- [ ] E2E API workflow test passes (calculate → get → list → finalize)
- [ ] Cross-tenant access is blocked by RLS
- [ ] Validation errors return 422 with clear messages
- [ ] Finalized snapshots are immutable
- [ ] PDF export generates valid PDF files
- [ ] Variance endpoint returns correct year-over-year data
- [ ] All error cases are tested
- [ ] Any bugs found are fixed before marking complete

---

## Notes

- This story focuses on **API contract**, not calculation logic
- Test with **real database** (not mocks) to verify RLS
- Verify **OpenAPI schema** is up-to-date
- Test **pagination** for list endpoints
- Document any API changes needed

---

*Created: 2025-12-30*
*Status: pending*
