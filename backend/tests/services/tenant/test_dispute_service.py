"""Tests for DisputeService with comprehensive coverage."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models.dispute import DisputeCategory, DisputeStatus, RateLimitError
from app.services.tenant.dispute_service import DisputeService


class TestCreateDispute:
    """Tests for dispute creation."""

    @pytest.mark.asyncio
    async def test_create_dispute_success(
        self, sample_dispute_data, sample_tenant_user_data
    ):
        """Successfully creates a dispute with valid data."""
        # Setup mocks
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        # Mock tenant lookup - return tenant data
        mock_tenant_response = MagicMock()
        tenant_data = {
            **sample_tenant_user_data,
            "organization_id": sample_dispute_data["organization_id"],
        }
        mock_tenant_response.data = [tenant_data]

        # Mock statement lookup - return organization_id
        mock_statement_response = MagicMock()
        mock_statement_response.data = [
            {"organization_id": tenant_data["organization_id"], "status": "finalized"}
        ]

        # Mock rate limit check - return count of 0
        mock_rate_limit_response = MagicMock()
        mock_rate_limit_response.count = 0

        # Mock dispute creation
        dispute_data = {"id": str(uuid4()), **sample_dispute_data, "status": "open"}
        mock_dispute_response = MagicMock()
        mock_dispute_response.data = [dispute_data]

        # Mock comment creation
        mock_comment_response = MagicMock()
        mock_comment_response.data = [{"id": str(uuid4())}]

        # Setup table mock to handle different table calls
        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_response
                )
            elif table_name == "reconciliation_snapshots":
                mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    mock_statement_response
                )
            elif table_name == "disputes":
                # Rate limit check uses different chain
                mock_chain = MagicMock()
                mock_chain.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    mock_rate_limit_response
                )
                mock_chain.insert.return_value.execute.return_value = (
                    mock_dispute_response
                )
                return mock_chain
            elif table_name == "dispute_comments":
                mock_table.insert.return_value.execute.return_value = (
                    mock_comment_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(mock_notification)

        # Create dispute
        result = await service.create_dispute(
            tenant_user_id=uuid4(),
            statement_id=uuid4(),
            category=DisputeCategory.CALCULATION_ERROR,
            description="Test dispute description",
            db=mock_db,
        )

        assert result is not None
        assert result["status"] == "open"

    @pytest.mark.asyncio
    async def test_create_dispute_validates_description_length_empty(self):
        """Rejects empty description."""
        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="1-5000 characters"):
            await service.create_dispute(
                tenant_user_id=uuid4(),
                statement_id=uuid4(),
                category=DisputeCategory.CALCULATION_ERROR,
                description="",
                db=MagicMock(),
            )

    @pytest.mark.asyncio
    async def test_create_dispute_validates_description_length_too_long(self):
        """Rejects description over 5000 characters."""
        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="1-5000 characters"):
            await service.create_dispute(
                tenant_user_id=uuid4(),
                statement_id=uuid4(),
                category=DisputeCategory.CALCULATION_ERROR,
                description="x" * 5001,
                db=MagicMock(),
            )

    @pytest.mark.asyncio
    async def test_create_dispute_tenant_not_found(self):
        """Raises PermissionError when tenant doesn't exist."""
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = (
            []
        )

        service = DisputeService(AsyncMock())

        with pytest.raises(PermissionError, match="Tenant not found"):
            await service.create_dispute(
                tenant_user_id=uuid4(),
                statement_id=uuid4(),
                category=DisputeCategory.CALCULATION_ERROR,
                description="Valid description",
                db=mock_db,
            )

    @pytest.mark.asyncio
    async def test_create_dispute_rate_limited_after_3_disputes(
        self, sample_tenant_user_data
    ):
        """Blocks creation when tenant has 3 disputes in last 24 hours."""
        mock_db = MagicMock()

        # Mock tenant lookup
        mock_tenant_response = MagicMock()
        tenant_data = {**sample_tenant_user_data, "organization_id": str(uuid4())}
        mock_tenant_response.data = [tenant_data]

        # Mock rate limit check - at limit
        mock_rate_limit_response = MagicMock()
        mock_rate_limit_response.count = 3

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_response
                )
            elif table_name == "disputes":
                mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    mock_rate_limit_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(AsyncMock())

        with pytest.raises(RateLimitError, match="Maximum 3 disputes per day exceeded"):
            await service.create_dispute(
                tenant_user_id=uuid4(),
                statement_id=uuid4(),
                category=DisputeCategory.CALCULATION_ERROR,
                description="Valid description",
                db=mock_db,
            )

    @pytest.mark.asyncio
    async def test_create_dispute_statement_not_found(self, sample_tenant_user_data):
        """Raises ValueError when statement doesn't exist."""
        mock_db = MagicMock()

        # Mock tenant exists
        mock_tenant_response = MagicMock()
        tenant_data = {**sample_tenant_user_data, "organization_id": str(uuid4())}
        mock_tenant_response.data = [tenant_data]

        # Mock rate limit check - not at limit
        mock_rate_limit_response = MagicMock()
        mock_rate_limit_response.count = 0

        # Mock statement not found
        mock_statement_response = MagicMock()
        mock_statement_response.data = []

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_response
                )
            elif table_name == "disputes":
                mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    mock_rate_limit_response
                )
            elif table_name == "reconciliation_snapshots":
                mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    mock_statement_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="Statement not found"):
            await service.create_dispute(
                tenant_user_id=uuid4(),
                statement_id=uuid4(),
                category=DisputeCategory.CALCULATION_ERROR,
                description="Valid description",
                db=mock_db,
            )

    @pytest.mark.asyncio
    async def test_create_dispute_rejects_non_finalized_statement(
        self, sample_tenant_user_data
    ):
        """Tenants can only dispute finalized reconciliation statements."""
        mock_db = MagicMock()

        mock_tenant_response = MagicMock()
        tenant_data = {**sample_tenant_user_data, "organization_id": str(uuid4())}
        mock_tenant_response.data = [tenant_data]

        mock_rate_limit_response = MagicMock()
        mock_rate_limit_response.count = 0

        mock_statement_response = MagicMock()
        mock_statement_response.data = [
            {
                "organization_id": tenant_data["organization_id"],
                "status": "draft",
            }
        ]

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_response
                )
            elif table_name == "disputes":
                mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    mock_rate_limit_response
                )
            elif table_name == "reconciliation_snapshots":
                mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    mock_statement_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="must be finalized"):
            await service.create_dispute(
                tenant_user_id=uuid4(),
                statement_id=uuid4(),
                category=DisputeCategory.CALCULATION_ERROR,
                description="Valid description",
                db=mock_db,
            )

    @pytest.mark.asyncio
    async def test_create_dispute_notification_failure_does_not_block(
        self, sample_dispute_data, sample_tenant_user_data, caplog
    ):
        """Notification failure is logged but doesn't block dispute creation."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()
        mock_notification.notify_new_dispute.side_effect = Exception("SMTP timeout")

        # Mock tenant lookup
        mock_tenant_response = MagicMock()
        tenant_data = {
            **sample_tenant_user_data,
            "organization_id": sample_dispute_data["organization_id"],
        }
        mock_tenant_response.data = [tenant_data]

        # Mock statement lookup
        mock_statement_response = MagicMock()
        mock_statement_response.data = [
            {"organization_id": tenant_data["organization_id"], "status": "finalized"}
        ]

        # Mock rate limit check
        mock_rate_limit_response = MagicMock()
        mock_rate_limit_response.count = 0

        # Mock dispute creation
        dispute_data = {"id": str(uuid4()), **sample_dispute_data}
        mock_dispute_response = MagicMock()
        mock_dispute_response.data = [dispute_data]

        # Mock comment creation
        mock_comment_response = MagicMock()
        mock_comment_response.data = [{"id": str(uuid4())}]

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_response
                )
            elif table_name == "reconciliation_snapshots":
                mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    mock_statement_response
                )
            elif table_name == "disputes":
                mock_chain = MagicMock()
                mock_chain.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    mock_rate_limit_response
                )
                mock_chain.insert.return_value.execute.return_value = (
                    mock_dispute_response
                )
                return mock_chain
            elif table_name == "dispute_comments":
                mock_table.insert.return_value.execute.return_value = (
                    mock_comment_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(mock_notification)

        # Should succeed despite notification failure
        result = await service.create_dispute(
            tenant_user_id=uuid4(),
            statement_id=uuid4(),
            category=DisputeCategory.CALCULATION_ERROR,
            description="Valid description",
            db=mock_db,
        )

        assert result is not None
        # Check error was logged
        assert "Failed to send notification" in caplog.text


class TestRateLimiting:
    """Tests for rate limiting logic."""

    @pytest.mark.asyncio
    async def test_rate_limit_check_under_limit(self):
        """Not rate limited when under 3 disputes."""
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value.count = (
            2
        )

        service = DisputeService(AsyncMock())
        is_limited = await service._is_rate_limited(uuid4(), mock_db)

        assert is_limited is False

    @pytest.mark.asyncio
    async def test_rate_limit_check_at_limit(self):
        """Rate limited when exactly at 3 disputes."""
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value.count = (
            3
        )

        service = DisputeService(AsyncMock())
        is_limited = await service._is_rate_limited(uuid4(), mock_db)

        assert is_limited is True


class TestAddComment:
    """Tests for adding comments to disputes."""

    @pytest.mark.asyncio
    async def test_add_comment_success(self):
        """Successfully adds a comment."""
        mock_db = MagicMock()

        # Mock dispute exists
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": str(uuid4()), "tenant_user_id": str(uuid4())}
        ]

        # Mock comment creation
        comment_data = {
            "id": str(uuid4()),
            "content": "Test comment",
            "is_internal": False,
        }
        mock_db.table.return_value.insert.return_value.execute.return_value.data = [
            comment_data
        ]

        service = DisputeService(AsyncMock())

        result = await service.add_comment(
            dispute_id=uuid4(),
            author_id=uuid4(),
            content="Test comment",
            is_internal=False,
            db=mock_db,
        )

        assert result["content"] == "Test comment"

    @pytest.mark.asyncio
    async def test_add_comment_validates_content_empty(self):
        """Rejects empty comment content."""
        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="1-50000 characters"):
            await service.add_comment(
                dispute_id=uuid4(),
                author_id=uuid4(),
                content="",
                is_internal=False,
                db=MagicMock(),
            )

    @pytest.mark.asyncio
    async def test_add_comment_validates_content_too_long(self):
        """Rejects comment content over 50000 characters."""
        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="1-50000 characters"):
            await service.add_comment(
                dispute_id=uuid4(),
                author_id=uuid4(),
                content="x" * 50001,
                is_internal=False,
                db=MagicMock(),
            )

    @pytest.mark.asyncio
    async def test_add_comment_dispute_not_found(self):
        """Raises ValueError when dispute doesn't exist."""
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = (
            []
        )

        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="Dispute not found"):
            await service.add_comment(
                dispute_id=uuid4(),
                author_id=uuid4(),
                content="Valid comment",
                is_internal=False,
                db=mock_db,
            )


class TestNotifyComment:
    """Tests for comment notification logic."""

    @pytest.mark.asyncio
    async def test_add_comment_notifies_landlord_when_tenant_comments(self):
        """When tenant comments, landlord is notified."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        tenant_user_id = str(uuid4())
        author_id = tenant_user_id  # Tenant is commenting

        # Mock dispute exists
        dispute_id = uuid4()
        organization_id = uuid4()
        mock_dispute = {
            "id": str(dispute_id),
            "tenant_user_id": str(uuid4()),
            "statement_id": str(uuid4()),
            "organization_id": str(organization_id),
            "status": "open",
        }

        # Mock tenant user lookup
        mock_tenant_user_response = MagicMock()
        mock_tenant_user_response.data = [
            {"user_id": author_id, "contact_name": "Acme Tenant"}
        ]

        # Mock comment creation
        comment_data = {
            "id": str(uuid4()),
            "content": "Test comment from tenant",
            "is_internal": False,
            "author_id": author_id,
        }

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "disputes":
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    mock_dispute
                ]
            elif table_name == "dispute_comments":
                mock_table.insert.return_value.execute.return_value.data = [
                    comment_data
                ]
            elif table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_user_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(mock_notification)

        await service.add_comment(
            dispute_id=uuid4(),
            author_id=author_id,
            content="Test comment from tenant",
            is_internal=False,
            db=mock_db,
        )

        mock_notification.notify_dispute_comment_to_landlord.assert_awaited_once_with(
            organization_id=organization_id,
            dispute_id=dispute_id,
            tenant_name="Acme Tenant",
            db=mock_db,
        )

    @pytest.mark.asyncio
    async def test_add_comment_notifies_tenant_when_landlord_comments(self):
        """When landlord comments, tenant is notified."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        tenant_user_id = str(uuid4())
        author_id = str(uuid4())  # Different from tenant - landlord is commenting
        dispute_id = uuid4()

        # Mock dispute
        mock_dispute = {
            "id": str(dispute_id),
            "tenant_user_id": str(uuid4()),
            "statement_id": str(uuid4()),
            "status": "open",
        }

        # Mock tenant user lookup
        mock_tenant_user_response = MagicMock()
        mock_tenant_user_response.data = [{"user_id": tenant_user_id}]

        # Mock statement and property lookups
        mock_statement_response = MagicMock()
        mock_statement_response.data = [{"property_id": str(uuid4())}]

        mock_property_response = MagicMock()
        mock_property_response.data = [{"name": "Test Property"}]

        # Mock comment creation
        comment_data = {
            "id": str(uuid4()),
            "content": "Test comment from landlord",
            "is_internal": False,
            "author_id": author_id,
        }

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "disputes":
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    mock_dispute
                ]
            elif table_name == "dispute_comments":
                mock_table.insert.return_value.execute.return_value.data = [
                    comment_data
                ]
            elif table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_user_response
                )
            elif table_name == "reconciliation_snapshots":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_statement_response
                )
            elif table_name == "properties":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_property_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(mock_notification)

        await service.add_comment(
            dispute_id=dispute_id,
            author_id=author_id,
            content="Test comment from landlord",
            is_internal=False,
            db=mock_db,
        )

        # Tenant should be notified
        mock_notification.notify_dispute_update.assert_called_once()


class TestUpdateStatus:
    """Tests for dispute status updates."""

    @pytest.mark.asyncio
    async def test_update_status_open_to_under_review(self):
        """Valid transition from OPEN to UNDER_REVIEW."""
        mock_db = MagicMock()

        # Mock current dispute
        dispute_id = uuid4()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
            MagicMock(
                data=[
                    {
                        "id": str(dispute_id),
                        "status": "open",
                        "tenant_user_id": str(uuid4()),
                        "statement_id": str(uuid4()),
                    }
                ]
            ),
            MagicMock(data=[{"property_id": str(uuid4())}]),  # statement
            MagicMock(data=[{"name": "Test Property"}]),  # property
        ]

        # Mock update
        updated_dispute = {"id": str(dispute_id), "status": "under_review"}
        mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            updated_dispute
        ]

        service = DisputeService(AsyncMock())

        result = await service.update_status(
            dispute_id=dispute_id,
            new_status=DisputeStatus.UNDER_REVIEW,
            resolution_summary=None,
            resolved_by=None,
            db=mock_db,
        )

        assert result["status"] == "under_review"

    @pytest.mark.asyncio
    async def test_update_status_invalid_transition_resolved_to_open(self):
        """Invalid transition from RESOLVED to OPEN is blocked."""
        mock_db = MagicMock()

        # Mock dispute in RESOLVED state
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": str(uuid4()), "status": "resolved", "tenant_user_id": str(uuid4())}
        ]

        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="Cannot transition from resolved to open"):
            await service.update_status(
                dispute_id=uuid4(),
                new_status=DisputeStatus.OPEN,
                resolution_summary=None,
                resolved_by=None,
                db=mock_db,
            )

    @pytest.mark.asyncio
    async def test_update_status_sets_resolution_fields(self):
        """Sets resolution_summary and resolved_at for RESOLVED status."""
        mock_db = MagicMock()

        dispute_id = uuid4()
        resolved_by = uuid4()

        # Mock dispute in UNDER_REVIEW state
        mock_db.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
            MagicMock(
                data=[
                    {
                        "id": str(dispute_id),
                        "status": "under_review",
                        "tenant_user_id": str(uuid4()),
                        "statement_id": str(uuid4()),
                    }
                ]
            ),
            MagicMock(data=[{"property_id": str(uuid4())}]),
            MagicMock(data=[{"name": "Test Property"}]),
        ]

        # Capture update data
        update_call_args = None

        def capture_update(data):
            nonlocal update_call_args
            update_call_args = data
            mock_result = MagicMock()
            mock_result.data = [{**data, "id": str(dispute_id)}]
            return mock_result.eq.return_value.execute.return_value

        mock_db.table.return_value.update.side_effect = lambda data: type(
            "obj",
            (object,),
            {
                "eq": lambda self, *args: type(
                    "obj",
                    (object,),
                    {
                        "execute": lambda self: type(
                            "obj",
                            (object,),
                            {"data": [{**data, "id": str(dispute_id)}]},
                        )()
                    },
                )()
            },
        )()

        updated_dispute = {
            "id": str(dispute_id),
            "status": "resolved",
            "resolution_summary": "Resolved successfully",
            "resolved_at": datetime.now(UTC).isoformat(),
            "resolved_by": str(resolved_by),
        }
        mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            updated_dispute
        ]

        service = DisputeService(AsyncMock())

        result = await service.update_status(
            dispute_id=dispute_id,
            new_status=DisputeStatus.RESOLVED,
            resolution_summary="Resolved successfully",
            resolved_by=resolved_by,
            db=mock_db,
        )

        assert result["status"] == "resolved"
        assert result["resolution_summary"] == "Resolved successfully"
        assert result["resolved_by"] == str(resolved_by)

    @pytest.mark.asyncio
    async def test_update_status_requires_resolution_summary(self):
        """Resolved and rejected statuses require non-blank resolution text."""
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(uuid4()),
                    "status": "under_review",
                    "tenant_user_id": str(uuid4()),
                    "statement_id": str(uuid4()),
                }
            ]
        )

        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="Resolution summary is required"):
            await service.update_status(
                dispute_id=uuid4(),
                new_status=DisputeStatus.RESOLVED,
                resolution_summary="   ",
                resolved_by=uuid4(),
                db=mock_db,
            )

    @pytest.mark.asyncio
    async def test_update_status_dispute_not_found(self):
        """Raises ValueError when dispute doesn't exist."""
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = (
            []
        )

        service = DisputeService(AsyncMock())

        with pytest.raises(ValueError, match="Dispute not found"):
            await service.update_status(
                dispute_id=uuid4(),
                new_status=DisputeStatus.UNDER_REVIEW,
                resolution_summary=None,
                resolved_by=None,
                db=mock_db,
            )


class TestEdgeCases:
    """Tests for edge cases and error handling paths."""

    @pytest.mark.asyncio
    async def test_add_comment_internal_skips_notification(self):
        """Internal comments should not trigger notifications."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        # Mock dispute lookup
        dispute_id = uuid4()
        mock_dispute = {
            "id": str(dispute_id),
            "status": "open",
            "tenant_user_id": str(uuid4()),
        }

        # Mock comment creation
        comment_data = {
            "id": str(uuid4()),
            "content": "Internal note for landlord",
            "is_internal": True,
            "author_id": str(uuid4()),
        }

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "disputes":
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    mock_dispute
                ]
            elif table_name == "dispute_comments":
                mock_table.insert.return_value.execute.return_value.data = [
                    comment_data
                ]
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(mock_notification)

        await service.add_comment(
            dispute_id=dispute_id,
            author_id=uuid4(),
            content="Internal note for landlord",
            is_internal=True,
            db=mock_db,
        )

        # Notification should NOT be called for internal comments
        mock_notification.notify_dispute_update.assert_not_called()

    @pytest.mark.asyncio
    async def test_notify_comment_handles_missing_tenant(self):
        """_notify_comment handles missing tenant gracefully."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        # Mock dispute lookup
        dispute_id = uuid4()
        author_id = uuid4()
        mock_dispute = {
            "id": str(dispute_id),
            "status": "open",
            "tenant_user_id": str(uuid4()),
        }

        # Mock tenant lookup returns empty (tenant not found)
        mock_tenant_response = MagicMock()
        mock_tenant_response.data = []

        # Mock comment creation
        comment_data = {
            "id": str(uuid4()),
            "content": "Test comment",
            "is_internal": False,
            "author_id": str(author_id),
        }

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "disputes":
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    mock_dispute
                ]
            elif table_name == "dispute_comments":
                mock_table.insert.return_value.execute.return_value.data = [
                    comment_data
                ]
            elif table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(mock_notification)

        # Should not raise error, just skip notification
        await service.add_comment(
            dispute_id=dispute_id,
            author_id=author_id,
            content="Test comment",
            is_internal=False,
            db=mock_db,
        )

        # Notification should not be called when tenant lookup fails
        mock_notification.notify_dispute_update.assert_not_called()

    @pytest.mark.asyncio
    async def test_notify_comment_handles_missing_statement(self):
        """_notify_comment uses 'Unknown Property' when statement not found."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        # Mock dispute lookup
        dispute_id = uuid4()
        tenant_user_id = uuid4()
        author_id = uuid4()  # Different from tenant (landlord commenting)

        mock_dispute = {
            "id": str(dispute_id),
            "status": "open",
            "tenant_user_id": str(tenant_user_id),
            "statement_id": str(uuid4()),
        }

        # Mock tenant lookup succeeds
        mock_tenant_user_response = MagicMock()
        mock_tenant_user_response.data = [{"user_id": str(tenant_user_id)}]

        # Mock statement lookup returns empty
        mock_statement_response = MagicMock()
        mock_statement_response.data = []

        # Mock comment creation
        comment_data = {
            "id": str(uuid4()),
            "content": "Test comment from landlord",
            "is_internal": False,
            "author_id": str(author_id),
        }

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "disputes":
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    mock_dispute
                ]
            elif table_name == "dispute_comments":
                mock_table.insert.return_value.execute.return_value.data = [
                    comment_data
                ]
            elif table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_user_response
                )
            elif table_name == "reconciliation_snapshots":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_statement_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(mock_notification)

        await service.add_comment(
            dispute_id=dispute_id,
            author_id=author_id,
            content="Test comment from landlord",
            is_internal=False,
            db=mock_db,
        )

        # Should call notification with "Unknown Property"
        mock_notification.notify_dispute_update.assert_called_once()
        call_args = mock_notification.notify_dispute_update.call_args
        assert call_args.kwargs["property_name"] == "Unknown Property"

    @pytest.mark.asyncio
    async def test_update_status_handles_missing_statement(self):
        """update_status uses 'Unknown Property' when statement not found."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        dispute_id = uuid4()

        # Mock dispute lookup - returns statement_id
        mock_db.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
            MagicMock(
                data=[
                    {
                        "id": str(dispute_id),
                        "status": "open",
                        "tenant_user_id": str(uuid4()),
                        "statement_id": str(uuid4()),
                    }
                ]
            ),
            MagicMock(data=[]),  # Statement lookup returns empty
        ]

        # Mock update
        updated_dispute = {"id": str(dispute_id), "status": "under_review"}
        mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            updated_dispute
        ]

        service = DisputeService(mock_notification)

        await service.update_status(
            dispute_id=dispute_id,
            new_status=DisputeStatus.UNDER_REVIEW,
            resolution_summary=None,
            resolved_by=None,
            db=mock_db,
        )

        # Should call notification with "Unknown Property"
        mock_notification.notify_dispute_update.assert_called_once()
        call_args = mock_notification.notify_dispute_update.call_args
        assert call_args.kwargs["property_name"] == "Unknown Property"

    @pytest.mark.asyncio
    async def test_update_status_handles_notification_failure(self, caplog):
        """update_status completes even if notification fails."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        # Make notification fail
        mock_notification.notify_dispute_update.side_effect = Exception("SMTP timeout")

        dispute_id = uuid4()

        # Mock dispute lookup and statement lookup
        mock_db.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
            MagicMock(
                data=[
                    {
                        "id": str(dispute_id),
                        "status": "open",
                        "tenant_user_id": str(uuid4()),
                        "statement_id": str(uuid4()),
                    }
                ]
            ),
            MagicMock(data=[{"property_id": str(uuid4())}]),  # statement
            MagicMock(data=[{"name": "Test Property"}]),  # property
        ]

        # Mock update
        updated_dispute = {"id": str(dispute_id), "status": "under_review"}
        mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            updated_dispute
        ]

        service = DisputeService(mock_notification)

        # Should not raise error
        result = await service.update_status(
            dispute_id=dispute_id,
            new_status=DisputeStatus.UNDER_REVIEW,
            resolution_summary=None,
            resolved_by=None,
            db=mock_db,
        )

        # Update should succeed
        assert result["status"] == "under_review"

        # Error should be logged
        assert "Failed to send notification" in caplog.text


class TestTOCTOURollback:
    """Tests for TOCTOU race condition rollback in create_dispute."""

    @pytest.mark.asyncio
    async def test_toctou_rollback_deletes_dispute_and_raises(
        self, sample_tenant_user_data
    ):
        """When over limit after insert (concurrent request), dispute is rolled back."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        tenant_user_id = uuid4()
        statement_id = uuid4()
        dispute_id = str(uuid4())
        org_id = str(uuid4())

        # Mock tenant lookup
        mock_tenant_response = MagicMock()
        tenant_data = {**sample_tenant_user_data, "organization_id": org_id}
        mock_tenant_response.data = [tenant_data]

        # Mock statement lookup
        mock_statement_response = MagicMock()
        mock_statement_response.data = [
            {"organization_id": org_id, "status": "finalized"}
        ]

        # Mock dispute insert
        mock_dispute_response = MagicMock()
        mock_dispute_response.data = [{"id": dispute_id, "status": "open"}]

        # Mock rate limit pre-check (under limit before insert)
        mock_rate_pre = MagicMock()
        mock_rate_pre.count = 0

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "tenant_users":
                mock_table.select.return_value.eq.return_value.execute.return_value = (
                    mock_tenant_response
                )
            elif table_name == "reconciliation_snapshots":
                mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    mock_statement_response
                )
            elif table_name == "disputes":
                # Pre-check rate limit returns count=0 (under limit)
                mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    mock_rate_pre
                )
                mock_table.insert.return_value.execute.return_value = (
                    mock_dispute_response
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(mock_notification)

        # Patch _is_over_limit_after_insert to return True (simulates TOCTOU)
        with patch.object(service, "_is_over_limit_after_insert", return_value=True):
            with pytest.raises(RateLimitError, match="concurrent request"):
                await service.create_dispute(
                    tenant_user_id=tenant_user_id,
                    statement_id=statement_id,
                    category=DisputeCategory.CALCULATION_ERROR,
                    description="Test dispute",
                    db=mock_db,
                )


class TestPropertyNotFoundInNotifications:
    """Tests for property not found paths in notification methods."""

    @pytest.mark.asyncio
    async def test_add_comment_property_not_found_uses_unknown(self):
        """_notify_comment uses 'Unknown Property' when property query returns empty.

        Covers line 315: statement found, but property not found.
        """
        mock_db = MagicMock()
        mock_notification = AsyncMock()

        dispute_id = uuid4()
        statement_id = uuid4()
        tenant_user_id_str = str(uuid4())
        # Landlord's user_id (different from tenant)
        landlord_author_id = str(uuid4())
        tenant_user_id_user = str(uuid4())  # tenant_row["user_id"]
        property_id = str(uuid4())

        mock_dispute = {
            "id": str(dispute_id),
            "status": "open",
            "statement_id": str(statement_id),
            "tenant_user_id": tenant_user_id_str,
            "category": "calculation_error",
            "description": "Test",
        }
        comment_data = {
            "id": str(uuid4()),
            "dispute_id": str(dispute_id),
            "author_id": landlord_author_id,
        }

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "disputes":
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    mock_dispute
                ]
            elif table_name == "dispute_comments":
                mock_table.insert.return_value.execute.return_value.data = [
                    comment_data
                ]
            elif table_name == "tenant_users":
                # Return tenant with user_id (different from landlord's author_id)
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    {"user_id": tenant_user_id_user}
                ]
            elif table_name == "reconciliation_snapshots":
                # Statement found with property_id
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    {"property_id": property_id}
                ]
            elif table_name == "properties":
                # Property NOT found (empty result) → line 315
                mock_table.select.return_value.eq.return_value.execute.return_value.data = (
                    []
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect

        service = DisputeService(mock_notification)

        await service.add_comment(
            dispute_id=dispute_id,
            author_id=uuid4(),  # landlord - different from tenant_user_id_user
            content="Test comment from landlord",
            is_internal=False,
            db=mock_db,
        )

        mock_notification.notify_dispute_update.assert_called_once()
        call_args = mock_notification.notify_dispute_update.call_args
        assert call_args.kwargs["property_name"] == "Unknown Property"

    @pytest.mark.asyncio
    async def test_update_status_property_not_found_uses_unknown(self):
        """update_status uses 'Unknown Property' when property empty (line 417)."""
        mock_db = MagicMock()
        mock_notification = AsyncMock()
        dispute_id = uuid4()
        statement_id = uuid4()
        property_id_str = str(uuid4())
        mock_dispute = {
            "id": str(dispute_id),
            "status": "open",
            "statement_id": str(statement_id),
            "tenant_user_id": str(uuid4()),
            "category": "calculation_error",
            "description": "Test",
        }
        updated_dispute_data = {**mock_dispute, "status": "under_review"}

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "disputes":
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    mock_dispute
                ]
                mock_table.update.return_value.eq.return_value.execute.return_value.data = [
                    updated_dispute_data
                ]
            elif table_name == "reconciliation_snapshots":
                mock_table.select.return_value.eq.return_value.execute.return_value.data = [
                    {"property_id": property_id_str}
                ]
            elif table_name == "properties":
                mock_table.select.return_value.eq.return_value.execute.return_value.data = (
                    []
                )
            return mock_table

        mock_db.table.side_effect = table_side_effect
        service = DisputeService(mock_notification)

        result = await service.update_status(
            dispute_id=dispute_id,
            new_status=DisputeStatus.UNDER_REVIEW,
            resolution_summary=None,
            resolved_by=None,
            db=mock_db,
        )

        assert result["status"] == "under_review"
        mock_notification.notify_dispute_update.assert_called_once()
        call_args = mock_notification.notify_dispute_update.call_args
        assert call_args.kwargs["property_name"] == "Unknown Property"
