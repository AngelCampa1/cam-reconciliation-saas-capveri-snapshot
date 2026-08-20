"""Tests for LeaseTermService."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models.lease_term_version import (
    LeaseTermVersionCreate,
)
from app.services.lease_terms import LeaseTermService


@pytest.fixture
def mock_client():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def org_id():
    return uuid4()


@pytest.fixture
def service(mock_client, org_id):
    return LeaseTermService(mock_client, org_id)


@pytest.fixture
def lease_id():
    return uuid4()


@pytest.fixture
def sample_version_row(lease_id):
    """A raw DB row as Supabase would return."""
    return {
        "id": str(uuid4()),
        "lease_id": str(lease_id),
        "version_number": 1,
        "effective_date": "2025-01-01",
        "base_year": 2024,
        "base_year_amount": "50000.00",
        "gross_up_base_year": False,
        "pro_rata_share": "0.05000000",
        "cap_type": "non_cumulative",
        "cap_rate": "0.05000000",
        "admin_fee_percentage": "0.15000000",
        "excluded_pools": [],
        "rsf_measurement_standard": None,
        "rsf_measurement_date": None,
        "amendment_reason": "Initial terms",
        "amendment_document_url": None,
        "created_by": None,
        "created_at": "2025-01-01T00:00:00+00:00",
    }


class TestListVersions:
    """Tests for list_versions."""

    def test_returns_summaries_ordered_by_effective_date(
        self, service, mock_client, lease_id, sample_version_row
    ):
        """Lists all versions for a lease."""
        mock_result = MagicMock()
        mock_result.data = [sample_version_row]
        (
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value
        ) = mock_result

        versions = service.list_versions(lease_id)

        assert len(versions) == 1
        assert versions[0].version_number == 1
        mock_client.table.assert_called_with("lease_term_versions")

    def test_empty_list(self, service, mock_client, lease_id):
        """No versions → empty list."""
        mock_result = MagicMock()
        mock_result.data = []
        (
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value
        ) = mock_result

        versions = service.list_versions(lease_id)
        assert versions == []


class TestGetEffectiveTerms:
    """Tests for get_effective_terms."""

    def test_returns_version_effective_on_date(
        self, service, mock_client, lease_id, sample_version_row
    ):
        """Finds the latest version with effective_date <= as_of_date."""
        mock_result = MagicMock()
        mock_result.data = [sample_version_row]
        (
            mock_client.table.return_value.select.return_value.eq.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value
        ) = mock_result

        version = service.get_effective_terms(lease_id, date(2025, 6, 15))

        assert version is not None
        assert version.pro_rata_share == Decimal("0.05000000")

    def test_returns_none_when_no_version_effective(
        self, service, mock_client, lease_id
    ):
        """No version effective before the date → None."""
        mock_result = MagicMock()
        mock_result.data = []
        (
            mock_client.table.return_value.select.return_value.eq.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value
        ) = mock_result

        version = service.get_effective_terms(lease_id, date(2020, 1, 1))
        assert version is None


class TestGetVersion:
    """Tests for get_version."""

    def test_returns_specific_version(
        self, service, mock_client, sample_version_row
    ) -> None:
        """Should deserialize a stored lease term version row."""
        version_id = uuid4()
        mock_result = MagicMock()
        mock_result.data = [{**sample_version_row, "id": str(version_id)}]
        (
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value
        ) = mock_result

        version = service.get_version(version_id)

        assert version is not None
        assert version.id == version_id
        assert version.version_number == sample_version_row["version_number"]

    def test_returns_none_for_unknown_version(self, service, mock_client) -> None:
        """Unknown version IDs should return None."""
        version_id = uuid4()
        mock_result = MagicMock()
        mock_result.data = []
        (
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value
        ) = mock_result

        assert service.get_version(version_id) is None

    def test_returns_none_when_version_belongs_to_other_lease(
        self, service, mock_client, sample_version_row
    ) -> None:
        """Nested route lookups must scope version IDs to the path lease."""
        version_id = uuid4()
        path_lease_id = uuid4()
        other_lease_id = uuid4()
        row = {
            **sample_version_row,
            "id": str(version_id),
            "lease_id": str(other_lease_id),
        }
        query_rows = [row]

        class FilteringQuery:
            def select(self, *_args):
                return self

            def eq(self, field, value):
                nonlocal query_rows
                query_rows = [item for item in query_rows if item.get(field) == value]
                return self

            def execute(self):
                result = MagicMock()
                result.data = query_rows
                return result

        mock_client.table.return_value = FilteringQuery()

        assert service.get_version(version_id, lease_id=path_lease_id) is None


class TestCreateVersion:
    """Tests for create_version."""

    def test_auto_increments_version_number(
        self, service, mock_client, lease_id, sample_version_row
    ):
        """version_number is max(existing) + 1."""
        # Mock: existing max version is 2
        max_result = MagicMock()
        max_result.data = [{"version_number": 2}]
        (
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value
        ) = max_result

        # Mock: insert returns the new row
        new_row = {**sample_version_row, "version_number": 3}
        insert_result = MagicMock()
        insert_result.data = [new_row]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            insert_result
        )

        data = LeaseTermVersionCreate(
            effective_date=date(2025, 7, 1),
            pro_rata_share=Decimal("0.08"),
            amendment_reason="Expansion",
        )

        version = service.create_version(lease_id, data, user_id=uuid4())
        assert version is not None

    def test_first_version_gets_number_1(
        self, service, mock_client, lease_id, sample_version_row
    ):
        """First version for a lease gets version_number=1."""
        max_result = MagicMock()
        max_result.data = []
        (
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value
        ) = max_result

        new_row = {**sample_version_row, "version_number": 1}
        insert_result = MagicMock()
        insert_result.data = [new_row]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            insert_result
        )

        data = LeaseTermVersionCreate(
            effective_date=date(2025, 1, 1),
            pro_rata_share=Decimal("0.05"),
        )

        version = service.create_version(lease_id, data, user_id=uuid4())
        assert version is not None


class TestCreateVersionManagementFee:
    """management_fee_percentage is persisted distinctly from admin_fee."""

    def _setup_insert(self, mock_client, sample_version_row):
        max_result = MagicMock()
        max_result.data = []
        (
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value
        ) = max_result
        insert_result = MagicMock()
        insert_result.data = [sample_version_row]
        mock_client.table.return_value.insert.return_value.execute.return_value = (
            insert_result
        )

    def test_management_fee_serialized_when_present(
        self, service, mock_client, lease_id, sample_version_row
    ):
        """A non-null management_fee_percentage is written as a string."""
        self._setup_insert(mock_client, sample_version_row)

        data = LeaseTermVersionCreate(
            effective_date=date(2025, 1, 1),
            pro_rata_share=Decimal("0.05"),
            management_fee_percentage=Decimal("0.04"),
        )
        service.create_version(lease_id, data, user_id=uuid4())

        inserted_row = mock_client.table.return_value.insert.call_args[0][0]
        assert inserted_row["management_fee_percentage"] == "0.04"

    def test_management_fee_serialized_as_null_when_absent(
        self, service, mock_client, lease_id, sample_version_row
    ):
        """A null management_fee_percentage is written as None (never coerced to 0)."""
        self._setup_insert(mock_client, sample_version_row)

        data = LeaseTermVersionCreate(
            effective_date=date(2025, 1, 1),
            pro_rata_share=Decimal("0.05"),
        )
        service.create_version(lease_id, data, user_id=uuid4())

        inserted_row = mock_client.table.return_value.insert.call_args[0][0]
        assert inserted_row["management_fee_percentage"] is None


class TestDeleteVersion:
    """Tests for delete_version."""

    def test_delete_raises_when_version_not_found(self, service, mock_client):
        """Deleting a missing version should raise a clear error."""
        version_id = uuid4()
        version_result = MagicMock()
        version_result.data = []
        (
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value
        ) = version_result

        with pytest.raises(ValueError, match="not found"):
            service.delete_version(version_id)

    def test_delete_blocked_by_finalized_snapshot(self, service, mock_client, lease_id):
        """Cannot delete a version referenced by finalized snapshots."""
        version_id = uuid4()

        # Mock: version exists
        version_result = MagicMock()
        version_result.data = [{"id": str(version_id), "lease_id": str(lease_id)}]
        # Mock: finalized snapshots reference this version
        snap_result = MagicMock()
        snap_result.data = [{"id": str(uuid4())}]

        # First call: get version, second call: check snapshots
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            version_result
        )
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            snap_result
        )

        with pytest.raises(ValueError, match="finalized"):
            service.delete_version(version_id)

    def test_delete_succeeds_when_not_referenced(self, service, mock_client, lease_id):
        """Delete succeeds when no finalized snapshots reference the version."""
        version_id = uuid4()

        version_result = MagicMock()
        version_result.data = [{"id": str(version_id), "lease_id": str(lease_id)}]

        snap_result = MagicMock()
        snap_result.data = []

        delete_result = MagicMock()
        delete_result.data = [{"id": str(version_id)}]

        # We need more specific mock chains here
        table_mock = MagicMock()
        mock_client.table.return_value = table_mock

        # get_version: select → eq(id) → execute
        select_chain = MagicMock()
        table_mock.select.return_value = select_chain
        eq_chain = MagicMock()
        select_chain.eq.return_value = eq_chain
        eq_chain.execute.return_value = version_result
        # check snapshots: eq(term_version_id) → eq(status) → execute
        eq_chain2 = MagicMock()
        eq_chain.eq.return_value = eq_chain2
        eq_chain2.execute.return_value = snap_result
        # delete: eq(id) → execute
        delete_chain = MagicMock()
        table_mock.delete.return_value = delete_chain
        delete_eq = MagicMock()
        delete_chain.eq.return_value = delete_eq
        delete_eq.execute.return_value = delete_result

        service.delete_version(version_id)

    def test_delete_raises_when_version_belongs_to_other_lease(
        self, service, mock_client, sample_version_row
    ):
        """Nested route deletes must not delete another lease's version."""
        version_id = uuid4()
        path_lease_id = uuid4()
        other_lease_id = uuid4()
        row = {
            **sample_version_row,
            "id": str(version_id),
            "lease_id": str(other_lease_id),
        }
        query_rows = [row]

        class FilteringQuery:
            def select(self, *_args):
                return self

            def eq(self, field, value):
                nonlocal query_rows
                query_rows = [item for item in query_rows if item.get(field) == value]
                return self

            def execute(self):
                result = MagicMock()
                result.data = query_rows
                return result

        table = MagicMock()
        table.select.return_value = FilteringQuery()
        mock_client.table.return_value = table

        with pytest.raises(ValueError, match="not found"):
            service.delete_version(version_id, lease_id=path_lease_id)

        table.delete.assert_not_called()
