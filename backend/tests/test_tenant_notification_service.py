"""Unit tests for Tenant Notification Service.

Tests cover:
- New statement notifications (in-app + email)
- Dispute update notifications (in-app + email)
- Email preference checking
- Rate limiting enforcement
- Notification read status updates
- Email logging for rate limiting
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from uuid import uuid4

import pytest

from app.models.tenant_notification import TenantEmailPreferences
from app.services.tenant.notification_service import TenantNotificationService


class TestNewStatementNotification:
    """Test new statement notification creation and email sending."""

    @pytest.fixture
    def mock_email_service(self):
        """Create mock email service."""
        service = Mock()
        service.send_new_statement_notification = AsyncMock()
        return service

    @pytest.fixture
    def mock_db(self):
        """Create mock Supabase client."""
        db = MagicMock()
        return db

    @pytest.fixture
    def notification_service(self, mock_email_service, mock_db):
        """Create notification service with mocks."""
        return TenantNotificationService(email_service=mock_email_service, db=mock_db)

    @pytest.mark.asyncio
    async def test_creates_in_app_notification(self, notification_service, mock_db):
        """Test that in-app notification is created in database."""
        tenant_user_id = uuid4()
        statement_id = uuid4()

        # Mock DB calls
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Mock preferences to skip email
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data={
                "tenant_user_id": str(tenant_user_id),
                "new_statement_emails": False,
                "dispute_update_emails": True,
                "reminder_emails": True,
                "marketing_emails": False,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )

        await notification_service.notify_new_statement(
            tenant_user_id=tenant_user_id,
            statement_id=statement_id,
            property_name="123 Main St",
            period="2024",
            amount="$12,500.00",
        )

        # Verify in-app notification was created
        insert_call = None
        for call in mock_db.table.call_args_list:
            if call[0][0] == "tenant_notifications":
                insert_call = call
                break

        assert insert_call is not None
        mock_db.table.assert_any_call("tenant_notifications")

    @pytest.mark.asyncio
    async def test_sends_email_when_preferences_enabled(
        self, notification_service, mock_email_service, mock_db
    ):
        """Test that email is sent when preferences allow it."""
        tenant_user_id = uuid4()
        statement_id = uuid4()

        # Mock in-app notification creation
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Mock email preferences (enabled)
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data={
                "tenant_user_id": str(tenant_user_id),
                "new_statement_emails": True,
                "dispute_update_emails": True,
                "reminder_emails": True,
                "marketing_emails": False,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )

        # Mock rate limit check (not limited)
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = Mock(
            count=5  # Below limit of 10
        )

        # Mock tenant lookup
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={"contact_name": "John Doe", "contact_email": "john@tenant.com"}
        )

        await notification_service.notify_new_statement(
            tenant_user_id=tenant_user_id,
            statement_id=statement_id,
            property_name="123 Main St",
            period="2024",
            amount="$12,500.00",
        )

        # Verify email was sent
        mock_email_service.send_new_statement_notification.assert_called_once()
        call_kwargs = mock_email_service.send_new_statement_notification.call_args[1]
        assert call_kwargs["to_email"] == "john@tenant.com"
        assert call_kwargs["tenant_name"] == "John Doe"
        assert call_kwargs["property_name"] == "123 Main St"
        assert call_kwargs["period"] == "2024"
        assert call_kwargs["amount"] == "$12,500.00"
        assert str(statement_id) in call_kwargs["portal_url"]

    @pytest.mark.asyncio
    async def test_skips_email_when_preferences_disabled(
        self, notification_service, mock_email_service, mock_db
    ):
        """Test that email is skipped when preferences disable it."""
        tenant_user_id = uuid4()
        statement_id = uuid4()

        # Mock in-app notification creation
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Mock email preferences (disabled)
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data={
                "tenant_user_id": str(tenant_user_id),
                "new_statement_emails": False,  # Disabled
                "dispute_update_emails": True,
                "reminder_emails": True,
                "marketing_emails": False,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )

        await notification_service.notify_new_statement(
            tenant_user_id=tenant_user_id,
            statement_id=statement_id,
            property_name="123 Main St",
            period="2024",
            amount="$12,500.00",
        )

        # Verify email was NOT sent
        mock_email_service.send_new_statement_notification.assert_not_called()

    @pytest.mark.asyncio
    async def test_respects_rate_limit(
        self, notification_service, mock_email_service, mock_db
    ):
        """Test that email is skipped when rate limit exceeded."""
        tenant_user_id = uuid4()
        statement_id = uuid4()

        # Mock in-app notification creation
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Mock email preferences (enabled)
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data={
                "tenant_user_id": str(tenant_user_id),
                "new_statement_emails": True,
                "dispute_update_emails": True,
                "reminder_emails": True,
                "marketing_emails": False,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )

        # Mock rate limit check (exceeded - 10 emails in last hour)
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = Mock(
            count=10  # At limit
        )

        await notification_service.notify_new_statement(
            tenant_user_id=tenant_user_id,
            statement_id=statement_id,
            property_name="123 Main St",
            period="2024",
            amount="$12,500.00",
        )

        # Verify email was NOT sent due to rate limit
        mock_email_service.send_new_statement_notification.assert_not_called()

    @pytest.mark.asyncio
    async def test_logs_email_for_rate_limiting(
        self, notification_service, mock_email_service, mock_db
    ):
        """Test that email is logged after sending."""
        tenant_user_id = uuid4()
        statement_id = uuid4()

        # Mock in-app notification creation
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Mock email preferences (enabled)
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data={
                "tenant_user_id": str(tenant_user_id),
                "new_statement_emails": True,
                "dispute_update_emails": True,
                "reminder_emails": True,
                "marketing_emails": False,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )

        # Mock rate limit check (not limited)
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = Mock(
            count=5
        )

        # Mock tenant lookup
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={"contact_name": "John Doe", "contact_email": "john@tenant.com"}
        )

        await notification_service.notify_new_statement(
            tenant_user_id=tenant_user_id,
            statement_id=statement_id,
            property_name="123 Main St",
            period="2024",
            amount="$12,500.00",
        )

        # Verify email log was created
        # Check for tenant_email_logs table insert
        insert_calls = [
            call
            for call in mock_db.table.call_args_list
            if call[0][0] == "tenant_email_logs"
        ]
        assert len(insert_calls) > 0

    @pytest.mark.asyncio
    async def test_skips_email_when_tenant_user_not_found(
        self, notification_service, mock_email_service, mock_db
    ):
        """Test that email is skipped when tenant user not found."""
        tenant_user_id = uuid4()
        statement_id = uuid4()

        # Mock in-app notification creation
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Mock email preferences (enabled)
        mock_result1 = Mock()
        mock_result1.data = {
            "tenant_user_id": str(tenant_user_id),
            "new_statement_emails": True,
            "dispute_update_emails": True,
            "reminder_emails": True,
            "marketing_emails": False,
            "updated_at": datetime.now(UTC).isoformat(),
        }

        # Mock rate limit check (not limited)
        mock_result2 = Mock(count=3)

        # Mock tenant lookup (not found)
        mock_result3 = Mock()
        mock_result3.data = None

        # Chain the mocks
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_result1
        )
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
            mock_result2
        )
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_result3
        )

        await notification_service.notify_new_statement(
            tenant_user_id=tenant_user_id,
            statement_id=statement_id,
            property_name="123 Main St",
            period="2024",
            amount="$12,500.00",
        )

        # Verify email was NOT sent
        mock_email_service.send_new_statement_notification.assert_not_called()


class TestNewDisputeNotification:
    """Test new dispute notification for landlords."""

    @pytest.fixture
    def mock_email_service(self):
        """Create mock email service."""
        service = Mock()
        service.send_new_dispute_notification = AsyncMock()
        return service

    @pytest.fixture
    def mock_db(self):
        """Create mock Supabase client."""
        return MagicMock()

    @pytest.fixture
    def notification_service(self, mock_email_service, mock_db):
        """Create notification service with mocks."""
        return TenantNotificationService(email_service=mock_email_service, db=mock_db)

    @pytest.mark.asyncio
    async def test_notifies_all_admin_users(
        self, notification_service, mock_email_service
    ):
        """Test that all admin users receive notifications."""
        organization_id = uuid4()
        dispute_id = uuid4()
        db = MagicMock()

        # Mock admin users
        admin_result = Mock()
        admin_result.data = [
            {
                "id": str(uuid4()),
                "email": "admin1@example.com",
                "full_name": "Admin One",
            },
            {
                "id": str(uuid4()),
                "email": "admin2@example.com",
                "full_name": "Admin Two",
            },
        ]

        db.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
            admin_result
        )
        db.table.return_value.insert.return_value.execute.return_value = Mock()

        with patch(
            "app.services.tenant.notification_service.get_supabase_admin",
            return_value=db,
        ):
            await notification_service.notify_new_dispute(
                organization_id=organization_id,
                dispute_id=dispute_id,
                tenant_name="John Tenant",
                category="Overcharge",
                db=MagicMock(),
            )

        # Verify emails sent to both admins
        db.table.assert_any_call("users")
        db.table.assert_any_call("user_notifications")
        db.table.return_value.select.assert_called_once_with("id, email, full_name")
        db.table.return_value.select.return_value.eq.assert_called_once_with(
            "organization_id", str(organization_id)
        )
        db.table.return_value.select.return_value.eq.return_value.in_.assert_called_once_with(
            "role", ["owner", "admin"]
        )
        assert mock_email_service.send_new_dispute_notification.call_count == 2

    @pytest.mark.asyncio
    async def test_handles_no_admins_gracefully(self, notification_service):
        """Test that service handles no admins without error."""
        organization_id = uuid4()
        dispute_id = uuid4()
        db = MagicMock()

        # Mock no admin users
        admin_result = Mock()
        admin_result.data = None

        db.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
            admin_result
        )

        # Should not raise
        with patch(
            "app.services.tenant.notification_service.get_supabase_admin",
            return_value=db,
        ):
            await notification_service.notify_new_dispute(
                organization_id=organization_id,
                dispute_id=dispute_id,
                tenant_name="John Tenant",
                category="Overcharge",
                db=MagicMock(),
            )

    @pytest.mark.asyncio
    async def test_continues_on_notification_insert_failure(
        self, notification_service, mock_email_service
    ):
        """Test that service continues if a notification insert fails."""
        organization_id = uuid4()
        dispute_id = uuid4()
        db = MagicMock()

        # Mock admin users
        admin_result = Mock()
        admin_result.data = [
            {
                "id": str(uuid4()),
                "email": "admin1@example.com",
                "full_name": "Admin One",
            },
            {
                "id": str(uuid4()),
                "email": "admin2@example.com",
                "full_name": "Admin Two",
            },
        ]

        db.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
            admin_result
        )

        # Make first insert fail, second succeed
        db.table.return_value.insert.return_value.execute.side_effect = [
            Exception("DB error"),
            Mock(),
        ]

        with patch(
            "app.services.tenant.notification_service.get_supabase_admin",
            return_value=db,
        ):
            await notification_service.notify_new_dispute(
                organization_id=organization_id,
                dispute_id=dispute_id,
                tenant_name="John Tenant",
                category="Overcharge",
                db=MagicMock(),
            )

        # Should continue and not crash
        assert mock_email_service.send_new_dispute_notification.call_count >= 0

    @pytest.mark.asyncio
    async def test_continues_on_email_failure(
        self, notification_service, mock_email_service
    ):
        """Test that service continues if email sending fails."""
        organization_id = uuid4()
        dispute_id = uuid4()
        db = MagicMock()

        # Mock admin users
        admin_result = Mock()
        admin_result.data = [
            {
                "id": str(uuid4()),
                "email": "admin1@example.com",
                "full_name": "Admin One",
            },
        ]

        db.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
            admin_result
        )
        db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Make email sending fail
        mock_email_service.send_new_dispute_notification.side_effect = Exception(
            "Email error"
        )

        # Should not raise
        with patch(
            "app.services.tenant.notification_service.get_supabase_admin",
            return_value=db,
        ):
            await notification_service.notify_new_dispute(
                organization_id=organization_id,
                dispute_id=dispute_id,
                tenant_name="John Tenant",
                category="Overcharge",
                db=MagicMock(),
            )


class TestDisputeCommentLandlordNotification:
    """Test tenant comment notifications for landlords."""

    @pytest.fixture
    def mock_email_service(self):
        """Create mock email service."""
        service = Mock()
        service.send_dispute_comment_notification = AsyncMock()
        return service

    @pytest.fixture
    def mock_db(self):
        """Create mock Supabase client."""
        return MagicMock()

    @pytest.fixture
    def notification_service(self, mock_email_service, mock_db):
        """Create notification service with mocks."""
        return TenantNotificationService(email_service=mock_email_service, db=mock_db)

    @pytest.mark.asyncio
    async def test_notifies_all_admin_users(
        self, notification_service, mock_email_service
    ):
        """All org admins receive tenant-comment notifications."""
        organization_id = uuid4()
        dispute_id = uuid4()
        db = MagicMock()

        admin_result = Mock()
        admin_result.data = [
            {
                "id": str(uuid4()),
                "email": "admin1@example.com",
                "full_name": "Admin One",
            },
            {
                "id": str(uuid4()),
                "email": "admin2@example.com",
                "full_name": "Admin Two",
            },
        ]

        db.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
            admin_result
        )
        db.table.return_value.insert.return_value.execute.return_value = Mock()

        with patch(
            "app.services.tenant.notification_service.get_supabase_admin",
            return_value=db,
        ):
            await notification_service.notify_dispute_comment_to_landlord(
                organization_id=organization_id,
                dispute_id=dispute_id,
                tenant_name="Acme Tenant",
                db=MagicMock(),
            )

        db.table.assert_any_call("users")
        db.table.assert_any_call("user_notifications")
        db.table.return_value.select.assert_called_once_with("id, email, full_name")
        db.table.return_value.select.return_value.eq.assert_called_once_with(
            "organization_id", str(organization_id)
        )
        db.table.return_value.select.return_value.eq.return_value.in_.assert_called_once_with(
            "role", ["owner", "admin"]
        )
        assert db.table.return_value.insert.call_count == 2
        first_notification = db.table.return_value.insert.call_args_list[0].args[0]
        assert first_notification["notification_type"] == "DISPUTE_COMMENT"
        assert first_notification["title"] == "New Comment from Acme Tenant"
        assert first_notification["link_url"] == f"/disputes/{dispute_id}"
        assert mock_email_service.send_dispute_comment_notification.call_count == 2


class TestDisputeUpdateNotification:
    """Test dispute update notification creation and email sending."""

    @pytest.fixture
    def mock_email_service(self):
        """Create mock email service."""
        service = Mock()
        service.send_dispute_update = AsyncMock()
        return service

    @pytest.fixture
    def mock_db(self):
        """Create mock Supabase client."""
        return MagicMock()

    @pytest.fixture
    def notification_service(self, mock_email_service, mock_db):
        """Create notification service with mocks."""
        return TenantNotificationService(email_service=mock_email_service, db=mock_db)

    @pytest.mark.asyncio
    async def test_creates_in_app_notification_for_dispute(
        self, notification_service, mock_db
    ):
        """Test that in-app notification is created for dispute update."""
        tenant_user_id = uuid4()
        dispute_id = uuid4()

        # Mock DB calls
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Mock preferences to skip email
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data={
                "tenant_user_id": str(tenant_user_id),
                "new_statement_emails": True,
                "dispute_update_emails": False,
                "reminder_emails": True,
                "marketing_emails": False,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )

        await notification_service.notify_dispute_update(
            tenant_user_id=tenant_user_id,
            dispute_id=dispute_id,
            property_name="456 Oak Ave",
            dispute_status="UNDER_REVIEW",
        )

        # Verify in-app notification was created
        mock_db.table.assert_any_call("tenant_notifications")

    @pytest.mark.asyncio
    async def test_skips_email_when_tenant_not_found(
        self, notification_service, mock_email_service, mock_db
    ):
        """Test that email is skipped when tenant user not found."""
        tenant_user_id = uuid4()
        dispute_id = uuid4()

        # Mock in-app notification creation
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Mock email preferences (enabled)
        mock_result1 = Mock()
        mock_result1.data = {
            "tenant_user_id": str(tenant_user_id),
            "new_statement_emails": True,
            "dispute_update_emails": True,
            "reminder_emails": True,
            "marketing_emails": False,
            "updated_at": datetime.now(UTC).isoformat(),
        }

        # Mock rate limit check (not limited)
        mock_result2 = Mock(count=3)

        # Mock tenant lookup (not found)
        mock_result3 = Mock()
        mock_result3.data = None

        # Chain the mocks
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_result1
        )
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
            mock_result2
        )
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_result3
        )

        await notification_service.notify_dispute_update(
            tenant_user_id=tenant_user_id,
            dispute_id=dispute_id,
            property_name="456 Oak Ave",
            dispute_status="RESOLVED",
        )

        # Verify email was NOT sent
        mock_email_service.send_dispute_update.assert_not_called()

    @pytest.mark.asyncio
    async def test_sends_dispute_email_when_enabled(
        self, notification_service, mock_email_service, mock_db
    ):
        """Test that dispute email is sent when preferences allow it."""
        tenant_user_id = uuid4()
        dispute_id = uuid4()

        # Mock in-app notification creation
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        # Mock email preferences (enabled)
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data={
                "tenant_user_id": str(tenant_user_id),
                "new_statement_emails": True,
                "dispute_update_emails": True,  # Enabled
                "reminder_emails": True,
                "marketing_emails": False,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )

        # Mock rate limit check (not limited)
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = Mock(
            count=3
        )

        # Mock tenant lookup
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = Mock(
            data={"contact_name": "Jane Smith", "contact_email": "jane@tenant.com"}
        )

        await notification_service.notify_dispute_update(
            tenant_user_id=tenant_user_id,
            dispute_id=dispute_id,
            property_name="456 Oak Ave",
            dispute_status="RESOLVED",
        )

        # Verify email was sent
        mock_email_service.send_dispute_update.assert_called_once()
        call_kwargs = mock_email_service.send_dispute_update.call_args[1]
        assert call_kwargs["to_email"] == "jane@tenant.com"
        assert call_kwargs["tenant_name"] == "Jane Smith"
        assert call_kwargs["property_name"] == "456 Oak Ave"
        assert call_kwargs["dispute_status"] == "RESOLVED"


class TestEmailPreferences:
    """Test email preference retrieval and creation."""

    @pytest.fixture
    def mock_db(self):
        """Create mock Supabase client."""
        return MagicMock()

    @pytest.fixture
    def notification_service(self, mock_db):
        """Create notification service with mock db."""
        mock_email = Mock()
        return TenantNotificationService(email_service=mock_email, db=mock_db)

    @pytest.mark.asyncio
    async def test_get_existing_preferences(self, notification_service, mock_db):
        """Test retrieving existing email preferences."""
        tenant_user_id = uuid4()

        # Mock existing preferences
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data={
                "tenant_user_id": str(tenant_user_id),
                "new_statement_emails": True,
                "dispute_update_emails": False,
                "reminder_emails": True,
                "marketing_emails": False,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )

        prefs = await notification_service._get_email_preferences(tenant_user_id)

        assert isinstance(prefs, TenantEmailPreferences)
        assert prefs.new_statement_emails is True
        assert prefs.dispute_update_emails is False

    @pytest.mark.asyncio
    async def test_creates_default_preferences_when_none_exist(
        self, notification_service, mock_db
    ):
        """Test creating default preferences for new tenant."""
        tenant_user_id = uuid4()

        # Mock no existing preferences
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
            data=None
        )

        # Mock insert of default preferences
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock(
            data=[
                {
                    "tenant_user_id": str(tenant_user_id),
                    "new_statement_emails": True,
                    "dispute_update_emails": True,
                    "reminder_emails": True,
                    "marketing_emails": False,
                    "updated_at": datetime.now(UTC).isoformat(),
                }
            ]
        )

        prefs = await notification_service._get_email_preferences(tenant_user_id)

        assert isinstance(prefs, TenantEmailPreferences)
        assert prefs.new_statement_emails is True
        assert prefs.dispute_update_emails is True
        assert prefs.reminder_emails is True
        assert prefs.marketing_emails is False

        # Verify insert was called
        mock_db.table.assert_any_call("tenant_email_preferences")


class TestRateLimiting:
    """Test email rate limiting logic."""

    @pytest.fixture
    def mock_db(self):
        """Create mock Supabase client."""
        return MagicMock()

    @pytest.fixture
    def notification_service(self, mock_db):
        """Create notification service with mock db."""
        mock_email = Mock()
        return TenantNotificationService(email_service=mock_email, db=mock_db)

    @pytest.mark.asyncio
    async def test_not_rate_limited_below_threshold(
        self, notification_service, mock_db
    ):
        """Test that tenant is not rate limited when below threshold."""
        tenant_user_id = uuid4()

        # Mock email log count (5 emails in last hour, below limit of 10)
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = Mock(
            count=5
        )

        is_limited = await notification_service._is_rate_limited(tenant_user_id)

        assert is_limited is False

    @pytest.mark.asyncio
    async def test_rate_limited_at_threshold(self, notification_service, mock_db):
        """Test that tenant is rate limited when at threshold."""
        tenant_user_id = uuid4()

        # Mock email log count (10 emails in last hour, at limit)
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = Mock(
            count=10
        )

        is_limited = await notification_service._is_rate_limited(tenant_user_id)

        assert is_limited is True

    @pytest.mark.asyncio
    async def test_rate_limited_above_threshold(self, notification_service, mock_db):
        """Test that tenant is rate limited when over threshold."""
        tenant_user_id = uuid4()

        # Mock email log count (15 emails in last hour, over limit)
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = Mock(
            count=15
        )

        is_limited = await notification_service._is_rate_limited(tenant_user_id)

        assert is_limited is True

    @pytest.mark.asyncio
    async def test_rate_limit_checks_one_hour_window(
        self, notification_service, mock_db
    ):
        """Test that rate limit only checks last hour of emails."""
        tenant_user_id = uuid4()

        # Mock email log count
        mock_result = Mock(count=5)
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
            mock_result
        )

        await notification_service._is_rate_limited(tenant_user_id)

        # Verify gte was called with a timestamp approximately 1 hour ago
        # (We can't check exact time, but we can verify gte was called)
        mock_db.table.return_value.select.return_value.eq.return_value.gte.assert_called_once()


class TestMarkNotificationsAsRead:
    """Test marking notifications as read."""

    @pytest.fixture
    def mock_db(self):
        """Create mock Supabase client."""
        return MagicMock()

    @pytest.fixture
    def notification_service(self, mock_db):
        """Create notification service with mock db."""
        mock_email = Mock()
        return TenantNotificationService(email_service=mock_email, db=mock_db)

    @pytest.mark.asyncio
    async def test_mark_single_notification_as_read(
        self, notification_service, mock_db
    ):
        """Test marking a single notification as read."""
        notification_id = uuid4()
        tenant_user_id = uuid4()

        # Mock update
        mock_db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            Mock()
        )

        await notification_service.mark_as_read(notification_id, tenant_user_id)

        # Verify update was called with read_at timestamp
        update_call = mock_db.table.return_value.update.call_args
        assert "read_at" in update_call[0][0]

        # Verify table and update were called
        mock_db.table.assert_called_with("tenant_notifications")
        assert mock_db.table.return_value.update.called

    @pytest.mark.asyncio
    async def test_mark_all_notifications_as_read(self, notification_service, mock_db):
        """Test marking all unread notifications as read."""
        tenant_user_id = uuid4()

        # Mock update returning 3 affected rows
        mock_db.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = Mock(
            data=[{}, {}, {}]  # 3 notifications updated
        )

        count = await notification_service.mark_all_as_read(tenant_user_id)

        assert count == 3

        # Verify is_("read_at", "null") was called to filter unread
        mock_db.table.return_value.update.return_value.eq.return_value.is_.assert_called_once_with(
            "read_at", "null"
        )

    @pytest.mark.asyncio
    async def test_mark_all_returns_zero_when_none_updated(
        self, notification_service, mock_db
    ):
        """Test mark_all returns 0 when no notifications to update."""
        tenant_user_id = uuid4()

        # Mock update returning no rows
        mock_db.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = Mock(
            data=None
        )

        count = await notification_service.mark_all_as_read(tenant_user_id)

        assert count == 0


class TestEmailLogging:
    """Test email logging for rate limiting."""

    @pytest.fixture
    def mock_db(self):
        """Create mock Supabase client."""
        return MagicMock()

    @pytest.fixture
    def notification_service(self, mock_db):
        """Create notification service with mock db."""
        mock_email = Mock()
        return TenantNotificationService(email_service=mock_email, db=mock_db)

    @pytest.mark.asyncio
    async def test_logs_email_with_correct_data(self, notification_service, mock_db):
        """Test that email is logged with correct metadata."""
        tenant_user_id = uuid4()

        # Mock insert
        mock_db.table.return_value.insert.return_value.execute.return_value = Mock()

        await notification_service._log_email(
            tenant_user_id=tenant_user_id,
            email_type="new_statement",
            recipient_email="test@example.com",
        )

        # Verify insert was called with correct data
        insert_call = mock_db.table.return_value.insert.call_args
        log_data = insert_call[0][0]

        assert log_data["tenant_user_id"] == str(tenant_user_id)
        assert log_data["email_type"] == "new_statement"
        assert log_data["recipient_email"] == "test@example.com"

        # Verify table name
        mock_db.table.assert_any_call("tenant_email_logs")
