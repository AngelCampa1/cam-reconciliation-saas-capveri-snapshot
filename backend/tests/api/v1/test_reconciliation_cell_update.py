"""
Tests for reconciliation cell update API endpoint.

Following TDD Red-Green-Refactor:
- These tests are written FIRST (Red phase)
- Implementation follows to make them pass (Green phase)
- Then refactor for quality

Story: Epic 12 (Stories 12.3, 12.4) - Grid editing functionality
"""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    OrganizationContext,
    get_current_user,
    get_org_scoped_context,
)
from app.main import app
from app.models.enums import ReconciliationStatus, UserRole
from app.models.reconciliation_snapshot import (
    decode_cell_id,
    encode_cell_id,
)
from app.models.user import User


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
        role=UserRole.ADMIN,
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


class TestCellIdEncoding:
    """Tests for cell ID encoding/decoding utilities."""

    def test_encode_decode_cell_id(self):
        """Should encode and decode cell IDs correctly."""
        snapshot_id = UUID("c588f740-1234-5678-90ab-cdef01234567")
        field_name = "total_recovery"

        # Encode
        cell_id = encode_cell_id(snapshot_id, field_name)
        assert isinstance(cell_id, str)
        assert len(cell_id) > 0

        # Decode
        decoded_snapshot_id, decoded_field_name = decode_cell_id(cell_id)
        assert decoded_snapshot_id == snapshot_id
        assert decoded_field_name == field_name

    def test_decode_cell_id_rejects_invalid_field(self):
        """Should reject non-editable fields."""
        snapshot_id = UUID("c588f740-1234-5678-90ab-cdef01234567")
        invalid_field = "created_at"  # Not in EDITABLE_FIELDS

        # Manually create invalid cell_id
        import base64

        composite = f"{snapshot_id}:{invalid_field}"
        invalid_cell_id = base64.urlsafe_b64encode(composite.encode()).decode()

        # Should raise ValueError
        with pytest.raises(ValueError, match="not editable"):
            decode_cell_id(invalid_cell_id)

    def test_decode_cell_id_rejects_malformed_input(self):
        """Should reject malformed cell IDs."""
        malformed_ids = [
            "not-base64-at-all",
            "YWJjZGVm",  # Valid base64 but missing colon
            "invalid===",  # Invalid base64
            "",  # Empty string
        ]

        for malformed_id in malformed_ids:
            with pytest.raises(ValueError):
                decode_cell_id(malformed_id)


class TestUpdateReconciliationCell:
    """Tests for PATCH /api/v1/reconciliation/cells/{cell_id} endpoint."""

    def test_update_cell_success(self, test_client, test_user):
        """Should successfully update a draft snapshot cell."""
        snapshot_id = uuid4()
        field_name = "total_recovery"
        cell_id = encode_cell_id(snapshot_id, field_name)
        new_value = Decimal("1234.56")

        # Mock Supabase response for SELECT (fetch snapshot)
        mock_select_response = MagicMock()
        mock_select_response.data = {
            "id": str(snapshot_id),
            "status": ReconciliationStatus.DRAFT.value,
            "manual_overrides": {},
            "organization_id": str(uuid4()),
            field_name: "1000.00",
        }

        # Mock Supabase response for UPDATE
        mock_update_response = MagicMock()
        mock_update_response.data = [
            {
                "id": str(snapshot_id),
                field_name: str(new_value),
                "manual_overrides": {
                    field_name: {
                        "value": str(new_value),
                        "user_id": str(test_user.id),
                        "timestamp": datetime.now(UTC).isoformat(),
                    }
                },
            }
        ]

        # Setup mock chain
        mock_supabase = test_client.mock_supabase
        # FIX API-3: Mock chain now has 2 .eq() calls: id and organization_id
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_select_response
        )
        mock_supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_update_response
        )

        # Make request
        response = test_client.patch(
            f"/api/v1/reconciliation/cells/{cell_id}",
            json={"value": str(new_value)},
        )

        # Assert response
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == cell_id
        assert data["snapshot_id"] == str(snapshot_id)
        assert data["field_name"] == field_name
        assert Decimal(data["value"]) == new_value
        assert data["is_manual_override"] is True
        assert data["updated_by"] == str(test_user.id)

    def test_update_cell_rejects_finalized_snapshot(self, test_client):
        """Should return 403 for finalized snapshots."""
        snapshot_id = uuid4()
        field_name = "total_recovery"
        cell_id = encode_cell_id(snapshot_id, field_name)

        # Mock Supabase response - finalized snapshot
        mock_select_response = MagicMock()
        mock_select_response.data = {
            "id": str(snapshot_id),
            "status": ReconciliationStatus.FINALIZED.value,  # Finalized!
            "manual_overrides": {},
            "organization_id": str(uuid4()),
            field_name: "1000.00",
        }

        mock_supabase = test_client.mock_supabase
        # FIX API-3: Mock chain now has 2 .eq() calls: id and organization_id
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_select_response
        )

        # Make request
        response = test_client.patch(
            f"/api/v1/reconciliation/cells/{cell_id}",
            json={"value": "1234.56"},
        )

        # Assert 403 Forbidden
        assert response.status_code == 403
        assert "finalized" in response.json()["detail"].lower()
        assert "immutable" in response.json()["detail"].lower()

    def test_update_cell_rejects_nonexistent_snapshot(self, test_client):
        """Should return 404 for missing snapshot."""
        snapshot_id = uuid4()
        field_name = "total_recovery"
        cell_id = encode_cell_id(snapshot_id, field_name)

        # Mock Supabase response - snapshot not found
        mock_select_response = MagicMock()
        mock_select_response.data = None  # Not found

        mock_supabase = test_client.mock_supabase
        # FIX API-3: Mock chain now has 2 .eq() calls: id and organization_id
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_select_response
        )

        # Make request
        response = test_client.patch(
            f"/api/v1/reconciliation/cells/{cell_id}",
            json={"value": "1234.56"},
        )

        # Assert 404 Not Found
        assert response.status_code == 404
        assert str(snapshot_id) in response.json()["detail"]

    def test_update_cell_rejects_negative_value(self, test_client):
        """Should return 400/422 for negative values."""
        snapshot_id = uuid4()
        field_name = "total_recovery"
        cell_id = encode_cell_id(snapshot_id, field_name)

        # Make request with negative value
        response = test_client.patch(
            f"/api/v1/reconciliation/cells/{cell_id}",
            json={"value": "-100.00"},  # Negative!
        )

        # Assert 400 or 422 (both are valid for validation errors)
        assert response.status_code in [400, 422]

    def test_update_cell_tracks_override_metadata(self, test_client, test_user):
        """Should track manual override metadata in JSONB column."""
        snapshot_id = uuid4()
        field_name = "admin_fee"
        cell_id = encode_cell_id(snapshot_id, field_name)
        new_value = Decimal("500.00")

        # Mock Supabase response for SELECT
        mock_select_response = MagicMock()
        mock_select_response.data = {
            "id": str(snapshot_id),
            "status": ReconciliationStatus.DRAFT.value,
            "manual_overrides": {
                # Existing override for different field
                "total_recovery": {
                    "value": "1000.00",
                    "user_id": str(uuid4()),
                    "timestamp": "2024-01-01T00:00:00Z",
                }
            },
            "organization_id": str(uuid4()),
            field_name: "300.00",
        }

        # Capture the UPDATE call
        update_call_data = {}

        def capture_update(data):
            update_call_data.update(data)
            mock_response = MagicMock()
            mock_response.data = [data]
            return MagicMock(
                eq=lambda *args: MagicMock(
                    eq=lambda *args: MagicMock(execute=lambda: mock_response)
                )
            )

        mock_supabase = test_client.mock_supabase
        # FIX API-3: Mock chain now has 2 .eq() calls: id and organization_id
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_select_response
        )
        mock_supabase.table.return_value.update.side_effect = capture_update

        # Make request
        response = test_client.patch(
            f"/api/v1/reconciliation/cells/{cell_id}",
            json={"value": str(new_value)},
        )

        # Assert metadata tracked
        assert response.status_code == 200
        assert "manual_overrides" in update_call_data
        manual_overrides = update_call_data["manual_overrides"]

        # Should preserve existing override
        assert "total_recovery" in manual_overrides

        # Should add new override
        assert field_name in manual_overrides
        assert manual_overrides[field_name]["value"] == str(new_value)
        assert manual_overrides[field_name]["user_id"] == str(test_user.id)
        assert "timestamp" in manual_overrides[field_name]

    def test_update_cell_uses_optimistic_lock(self, test_client):
        """Should detect concurrent modifications."""
        snapshot_id = uuid4()
        field_name = "total_recovery"
        cell_id = encode_cell_id(snapshot_id, field_name)

        # Mock Supabase response for SELECT (snapshot is draft)
        mock_select_response = MagicMock()
        mock_select_response.data = {
            "id": str(snapshot_id),
            "status": ReconciliationStatus.DRAFT.value,
            "manual_overrides": {},
            field_name: "1000.00",
        }

        # Mock Supabase response for UPDATE (returns empty - concurrent modification)
        mock_update_response = MagicMock()
        mock_update_response.data = []  # Empty result = concurrent modification

        mock_supabase = test_client.mock_supabase
        mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_select_response
        )
        mock_supabase.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_update_response
        )

        # Make request
        response = test_client.patch(
            f"/api/v1/reconciliation/cells/{cell_id}",
            json={"value": "1234.56"},
        )

        # Assert 409 Conflict
        assert response.status_code == 409
        assert "concurrently modified" in response.json()["detail"].lower()

    def test_update_cell_enforces_rls(self, test_client, test_org_id):
        """Should enforce RLS - other orgs cannot access."""
        # This test verifies that RLS is enforced by Supabase
        # In practice, the Supabase client with OrgContext will filter results
        # Here we simulate what happens when RLS blocks access

        snapshot_id = uuid4()
        field_name = "total_recovery"
        cell_id = encode_cell_id(snapshot_id, field_name)

        # Mock Supabase response - RLS filtered out the snapshot (returns None)
        mock_select_response = MagicMock()
        mock_select_response.data = None  # RLS filtered it out

        mock_supabase = test_client.mock_supabase
        # FIX API-3: Mock chain now has 2 .eq() calls: id and organization_id
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_select_response
        )

        # Make request
        response = test_client.patch(
            f"/api/v1/reconciliation/cells/{cell_id}",
            json={"value": "1234.56"},
        )

        # Assert 404 Not Found (RLS makes it look like it doesn't exist)
        assert response.status_code == 404

    def test_update_cell_rejects_malformed_cell_id(self, test_client):
        """Should return 400 for malformed cell IDs."""
        malformed_cell_ids = [
            "not-base64",
            "YWJjZGVm",  # Valid base64 but missing colon
            # Note: Empty string "" would be a routing issue (404), not validation (400)
        ]

        for malformed_id in malformed_cell_ids:
            response = test_client.patch(
                f"/api/v1/reconciliation/cells/{malformed_id}",
                json={"value": "1234.56"},
            )

            # Assert 400 Bad Request
            assert response.status_code == 400
            assert "Invalid cell_id" in response.json()["detail"]
