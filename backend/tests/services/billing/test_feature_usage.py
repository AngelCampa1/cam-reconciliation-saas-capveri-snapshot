"""Tests for the feature_usage billing service."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.billing.feature_usage import list_used_features, record_feature_use


def _make_db_for_record():
    """Build a minimal mock of the supabase admin client for RPC calls."""
    db = MagicMock()
    rpc_chain = MagicMock()
    db.rpc.return_value = rpc_chain
    rpc_chain.execute.return_value = SimpleNamespace(data=None)
    return db


def _make_db_for_list(existing_rows=None):
    """Build a minimal mock of the supabase admin client for table select calls."""
    db = MagicMock()
    table_mock = MagicMock()
    db.table.return_value = table_mock

    select_chain = MagicMock()
    table_mock.select.return_value = select_chain
    select_chain.eq.return_value = select_chain
    select_chain.execute.return_value = SimpleNamespace(data=existing_rows or [])

    return db


class TestRecordFeatureUse:
    def test_calls_upsert_rpc(self):
        db = _make_db_for_record()
        record_feature_use(db, "org-1", "tenant_portal")
        db.rpc.assert_called_once_with(
            "upsert_feature_use",
            {"p_organization_id": "org-1", "p_feature_key": "tenant_portal"},
        )
        db.rpc().execute.assert_called_once()

    def test_swallows_errors_silently(self):
        db = MagicMock()
        db.rpc.side_effect = RuntimeError("DB is down")
        record_feature_use(db, "org-1", "tenant_portal")

    def test_records_different_feature_keys(self):
        db = _make_db_for_record()
        record_feature_use(db, "org-2", "dispute_system")
        db.rpc.assert_called_once_with(
            "upsert_feature_use",
            {"p_organization_id": "org-2", "p_feature_key": "dispute_system"},
        )


class TestListUsedFeatures:
    def test_returns_enriched_rows(self):
        rows = [
            {
                "feature_key": "tenant_portal",
                "first_used_at": "2026-01-01T00:00:00+00:00",
                "last_used_at": "2026-02-01T00:00:00+00:00",
            },
            {
                "feature_key": "dispute_system",
                "first_used_at": "2026-01-15T00:00:00+00:00",
                "last_used_at": "2026-01-15T00:00:00+00:00",
            },
        ]
        db = _make_db_for_list(existing_rows=rows)
        result = list_used_features(db, "org-1")
        keys = {r["key"] for r in result}
        assert "tenant_portal" in keys
        assert "dispute_system" in keys
        for r in result:
            assert "required_tier" in r
            assert "label" in r

    def test_skips_unknown_feature_keys(self):
        rows = [
            {
                "feature_key": "unknown_future_feature",
                "first_used_at": None,
                "last_used_at": None,
            }
        ]
        db = _make_db_for_list(existing_rows=rows)
        result = list_used_features(db, "org-1")
        assert result == []

    def test_returns_empty_for_no_usage(self):
        db = _make_db_for_list(existing_rows=[])
        result = list_used_features(db, "org-1")
        assert result == []

    def test_tenant_portal_feature_has_reconcile_tier(self):
        rows = [
            {
                "feature_key": "tenant_portal",
                "first_used_at": None,
                "last_used_at": None,
            }
        ]
        db = _make_db_for_list(existing_rows=rows)
        result = list_used_features(db, "org-1")
        assert result[0]["required_tier"] == "reconcile"

    def test_pdf_exports_feature_has_reconcile_tier(self):
        rows = [
            {"feature_key": "pdf_exports", "first_used_at": None, "last_used_at": None}
        ]
        db = _make_db_for_list(existing_rows=rows)
        result = list_used_features(db, "org-1")
        assert result[0]["required_tier"] == "reconcile"

    def test_swallows_db_errors_returning_empty(self):
        db = MagicMock()
        db.table.side_effect = RuntimeError("DB down")
        result = list_used_features(db, "org-1")
        assert result == []
