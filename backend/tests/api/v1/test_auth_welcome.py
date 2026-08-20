"""Tests for POST /api/v1/auth/welcome endpoint."""

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.legal_terms import TERMS_HASH, TERMS_VERSION
from app.main import app
from app.models.enums import UserRole
from app.models.user import User

TERMS_ACCEPTANCE = {
    "accepted_terms": True,
    "terms_version": TERMS_VERSION,
    "terms_hash": TERMS_HASH,
}


@pytest.fixture
def test_org_id():
    return uuid4()


@pytest.fixture
def test_user(test_org_id):
    return User(
        id=uuid4(),
        email="newuser@example.com",
        organization_id=test_org_id,
        role=UserRole.OWNER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def mock_admin_db():
    return MagicMock()


@pytest.fixture
def test_client(test_user, mock_db, mock_admin_db):
    from app.database.client import get_supabase, get_supabase_admin

    async def mock_get_user():
        return test_user

    def mock_get_db():
        return mock_db

    def mock_get_admin_db():
        return mock_admin_db

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_supabase] = mock_get_db
    app.dependency_overrides[get_supabase_admin] = mock_get_admin_db

    client = TestClient(app)
    setattr(client, "mock_db", mock_db)
    setattr(client, "mock_admin_db", mock_admin_db)
    yield client

    app.dependency_overrides.clear()


class TestPostAuthWelcome:
    def test_returns_ok_when_email_succeeds(self, test_client):
        mock_org_result = MagicMock(data={"name": "Acme Properties LLC"})
        test_client.mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_org_result
        )

        with (
            patch(
                "app.api.v1.auth.EmailService.send_signup_confirmation_email",
                new_callable=AsyncMock,
                return_value={"status": "sent", "id": "email_123"},
            ),
            patch(
                "app.api.v1.auth.enroll_sequencer_sequence",
                new_callable=AsyncMock,
            ) as mock_enroll,
        ):
            response = test_client.post("/api/v1/auth/welcome", json=TERMS_ACCEPTANCE)

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        assert mock_enroll.await_count == 2

    def test_returns_ok_even_if_email_fails(self, test_client):
        mock_org_result = MagicMock(data={"name": "Test Org"})
        test_client.mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_org_result
        )

        with (
            patch(
                "app.api.v1.auth.EmailService.send_signup_confirmation_email",
                new_callable=AsyncMock,
                side_effect=Exception("Resend is down"),
            ),
            patch(
                "app.api.v1.auth.enroll_sequencer_sequence",
                new_callable=AsyncMock,
            ),
        ):
            response = test_client.post("/api/v1/auth/welcome", json=TERMS_ACCEPTANCE)

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_returns_ok_even_if_sequencer_enroll_fails(self, test_client):
        mock_org_result = MagicMock(data={"name": "Test Org"})
        test_client.mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_org_result
        )

        with (
            patch(
                "app.api.v1.auth.EmailService.send_signup_confirmation_email",
                new_callable=AsyncMock,
                return_value={"status": "sent", "id": "email_123"},
            ),
            patch(
                "app.api.v1.auth.enroll_sequencer_sequence",
                new_callable=AsyncMock,
                side_effect=Exception("sequencer unavailable"),
            ),
        ):
            response = test_client.post("/api/v1/auth/welcome", json=TERMS_ACCEPTANCE)

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_creates_pending_signup_nurture_events(self, test_client, test_user):
        mock_org_result = MagicMock(data={"name": "Summit Real Estate"})
        test_client.mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_org_result
        )

        with (
            patch(
                "app.api.v1.auth.EmailService.send_signup_confirmation_email",
                new_callable=AsyncMock,
                return_value={"status": "sent", "id": "email_123"},
            ),
            patch(
                "app.api.v1.auth.enroll_sequencer_sequence",
                new_callable=AsyncMock,
            ),
        ):
            response = test_client.post("/api/v1/auth/welcome", json=TERMS_ACCEPTANCE)

        assert response.status_code == 200
        test_client.mock_admin_db.table.assert_any_call("legal_acceptances")
        test_client.mock_admin_db.table.assert_any_call("signup_email_events")
        upsert_call = test_client.mock_admin_db.table.return_value.upsert.call_args
        rows = upsert_call.args[0]
        assert upsert_call.kwargs == {
            "on_conflict": "user_id,email_type",
            "ignore_duplicates": True,
        }
        assert [row["email_type"] for row in rows] == [
            "day_1_add_property",
            "day_3_upload_gl",
            "day_7_run_reconciliation",
        ]
        assert len(rows) == 3
        for row in rows:
            assert row["organization_id"] == str(test_user.organization_id)
            assert row["user_id"] == str(test_user.id)
            assert row["email"] == test_user.email
            assert row["organization_name"] == "Summit Real Estate"
            assert row["status"] == "pending"
            assert datetime.fromisoformat(row["scheduled_at"]) > datetime.now(UTC)

    def test_returns_ok_even_if_signup_nurture_schedule_fails(self, test_client):
        mock_org_result = MagicMock(data={"name": "Test Org"})
        test_client.mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_org_result
        )
        test_client.mock_admin_db.table.return_value.upsert.return_value.execute.side_effect = Exception(
            "signup schedule unavailable"
        )

        with (
            patch(
                "app.api.v1.auth.EmailService.send_signup_confirmation_email",
                new_callable=AsyncMock,
                return_value={"status": "sent", "id": "email_123"},
            ) as mock_send,
            patch(
                "app.api.v1.auth.enroll_sequencer_sequence",
                new_callable=AsyncMock,
            ) as mock_enroll,
        ):
            response = test_client.post("/api/v1/auth/welcome", json=TERMS_ACCEPTANCE)

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        mock_send.assert_awaited_once()
        assert mock_enroll.await_count == 2

    def test_requires_authentication(self):
        client = TestClient(app)
        response = client.post("/api/v1/auth/welcome")
        assert response.status_code == 401

    def test_rejects_stale_terms_acceptance(self, test_client):
        response = test_client.post(
            "/api/v1/auth/welcome",
            json={
                **TERMS_ACCEPTANCE,
                "terms_version": "2026-01-01",
            },
        )

        assert response.status_code == 422
        test_client.mock_admin_db.table.assert_not_called()

    def test_existing_welcome_method_is_not_used(self, test_client):
        mock_org_result = MagicMock(data={"name": "Test Org"})
        test_client.mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_org_result
        )

        with (
            patch(
                "app.api.v1.auth.EmailService.send_signup_confirmation_email",
                new_callable=AsyncMock,
                return_value={"status": "sent", "id": "email_123"},
            ),
            patch(
                "app.api.v1.auth.EmailService.send_welcome_email",
                new_callable=AsyncMock,
            ) as mock_old_welcome,
            patch(
                "app.api.v1.auth.enroll_sequencer_sequence",
                new_callable=AsyncMock,
            ),
        ):
            response = test_client.post("/api/v1/auth/welcome", json=TERMS_ACCEPTANCE)

        assert response.status_code == 200
        mock_old_welcome.assert_not_called()

    def test_signup_confirmation_and_sequences_use_user_context(
        self, test_client, test_user
    ):
        mock_org_result = MagicMock(data={"name": "Summit Real Estate"})
        test_client.mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_org_result
        )

        with (
            patch(
                "app.api.v1.auth.EmailService.send_signup_confirmation_email",
                new_callable=AsyncMock,
                return_value={"status": "sent", "id": "email_abc"},
            ) as mock_send,
            patch(
                "app.api.v1.auth.enroll_sequencer_sequence",
                new_callable=AsyncMock,
            ) as mock_enroll,
        ):
            test_client.post("/api/v1/auth/welcome", json=TERMS_ACCEPTANCE)

        mock_send.assert_called_once_with(
            to_email=test_user.email,
            organization_name="Summit Real Estate",
            checkout_url="https://app.capveri.com/settings/billing?intent=select-plan&source=signup",
        )
        assert [
            call.kwargs["sequence_slug"] for call in mock_enroll.await_args_list
        ] == [
            "capveri-fulfillment-intro",
            "capveri-nurture-value-1",
        ]
        assert mock_enroll.await_args_list[0].kwargs["metadata"] == {
            "userId": str(test_user.id),
            "organizationId": str(test_user.organization_id),
            "organizationName": "Summit Real Estate",
            "source": "capveri-signup",
        }

    def test_uses_default_org_name_when_lookup_fails(self, test_client, test_user):
        test_client.mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.side_effect = Exception(
            "db unavailable"
        )

        with (
            patch(
                "app.api.v1.auth.EmailService.send_signup_confirmation_email",
                new_callable=AsyncMock,
                return_value={"status": "sent", "id": "email_fallback"},
            ) as mock_send,
            patch(
                "app.api.v1.auth.enroll_sequencer_sequence",
                new_callable=AsyncMock,
            ),
        ):
            response = test_client.post("/api/v1/auth/welcome", json=TERMS_ACCEPTANCE)

        assert response.status_code == 200
        mock_send.assert_called_once_with(
            to_email=test_user.email,
            organization_name="your organization",
            checkout_url="https://app.capveri.com/settings/billing?intent=select-plan&source=signup",
        )

    def test_admin_notified_when_real_user_onboards(self, test_client):
        mock_org_result = MagicMock(data={"name": "Acme Properties LLC"})
        test_client.mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_org_result
        )

        with (
            patch(
                "app.api.v1.auth.EmailService.send_signup_confirmation_email",
                new_callable=AsyncMock,
                return_value={"status": "sent", "id": "e1"},
            ),
            patch(
                "app.api.v1.auth.enroll_sequencer_sequence",
                new_callable=AsyncMock,
            ),
            patch(
                "app.api.v1.auth.AdminNotificationService.notify_onboarding_complete",
                new_callable=AsyncMock,
            ) as mock_notify,
        ):
            response = test_client.post("/api/v1/auth/welcome", json=TERMS_ACCEPTANCE)

        assert response.status_code == 200
        mock_notify.assert_awaited_once()


class TestDeleteAuthAccount:
    @staticmethod
    def _count_query(count: int) -> MagicMock:
        query = MagicMock()
        query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            count=count
        )
        query.select.return_value.eq.return_value.in_.return_value.neq.return_value.limit.return_value.execute.return_value = MagicMock(
            count=count
        )
        return query

    def test_deletes_account_when_no_history_blocks_it(self, test_client, test_user):
        def table_side_effect(table_name: str) -> MagicMock:
            if table_name == "users":
                users_query = MagicMock()
                users_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    count=2
                )
                users_query.select.return_value.eq.return_value.in_.return_value.neq.return_value.limit.return_value.execute.return_value = MagicMock(
                    count=1
                )
                return users_query
            return self._count_query(0)

        test_client.mock_admin_db.table.side_effect = table_side_effect

        response = test_client.request(
            "DELETE",
            "/api/v1/auth/account",
            json={"confirmation": "DELETE"},
        )

        assert response.status_code == 200
        assert response.json() == {"status": "deleted"}
        test_client.mock_admin_db.auth.admin.delete_user.assert_called_once_with(
            str(test_user.id)
        )

    def test_blocks_deleting_last_organization_user(self, test_client):
        users_query = MagicMock()
        users_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            count=1
        )
        test_client.mock_admin_db.table.return_value = users_query

        response = test_client.request(
            "DELETE",
            "/api/v1/auth/account",
            json={"confirmation": "DELETE"},
        )

        assert response.status_code == 400
        assert "last account" in response.json()["detail"]
        test_client.mock_admin_db.auth.admin.delete_user.assert_not_called()

    def test_blocks_deleting_last_organization_admin(self, test_client):
        def table_side_effect(table_name: str) -> MagicMock:
            if table_name == "users":
                users_query = MagicMock()
                users_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    count=2
                )
                users_query.select.return_value.eq.return_value.in_.return_value.neq.return_value.limit.return_value.execute.return_value = MagicMock(
                    count=0
                )
                return users_query
            return self._count_query(0)

        test_client.mock_admin_db.table.side_effect = table_side_effect

        response = test_client.request(
            "DELETE",
            "/api/v1/auth/account",
            json={"confirmation": "DELETE"},
        )

        assert response.status_code == 400
        assert "administrator" in response.json()["detail"]
        test_client.mock_admin_db.auth.admin.delete_user.assert_not_called()

    def test_blocks_when_account_has_audit_history(self, test_client):
        def table_side_effect(table_name: str) -> MagicMock:
            if table_name == "users":
                users_query = MagicMock()
                users_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    count=2
                )
                users_query.select.return_value.eq.return_value.in_.return_value.neq.return_value.limit.return_value.execute.return_value = MagicMock(
                    count=1
                )
                return users_query
            count = 0
            if table_name == "audit_log":
                count = 1
            return self._count_query(count)

        test_client.mock_admin_db.table.side_effect = table_side_effect

        response = test_client.request(
            "DELETE",
            "/api/v1/auth/account",
            json={"confirmation": "DELETE"},
        )

        assert response.status_code == 400
        assert "audit log entries" in response.json()["detail"]
        test_client.mock_admin_db.auth.admin.delete_user.assert_not_called()

    @pytest.mark.parametrize(
        ("table_name", "expected_label"),
        [
            ("tenant_invitations", "tenant invitations"),
            ("team_member_invitations", "team invitations"),
            ("audit_requests", "assigned audit requests"),
            ("documents", "document verification history"),
            ("disputes", "assigned disputes"),
            ("gl_analysis_results", "GL analysis history"),
            ("capex_flags", "CapEx review history"),
        ],
    )
    def test_blocks_schema_user_reference_history(
        self, test_client: Any, table_name: str, expected_label: str
    ) -> None:
        def table_side_effect(requested_table_name: str) -> MagicMock:
            if requested_table_name == "users":
                users_query = MagicMock()
                users_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    count=2
                )
                users_query.select.return_value.eq.return_value.in_.return_value.neq.return_value.limit.return_value.execute.return_value = MagicMock(
                    count=1
                )
                return users_query
            return self._count_query(1 if requested_table_name == table_name else 0)

        test_client.mock_admin_db.table.side_effect = table_side_effect

        response = test_client.request(
            "DELETE",
            "/api/v1/auth/account",
            json={"confirmation": "DELETE"},
        )

        assert response.status_code == 400
        assert expected_label in response.json()["detail"]
        test_client.mock_admin_db.auth.admin.delete_user.assert_not_called()

    def test_requires_exact_delete_confirmation(self, test_client):
        response = test_client.request(
            "DELETE",
            "/api/v1/auth/account",
            json={"confirmation": "delete"},
        )

        assert response.status_code == 422
        test_client.mock_admin_db.auth.admin.delete_user.assert_not_called()
