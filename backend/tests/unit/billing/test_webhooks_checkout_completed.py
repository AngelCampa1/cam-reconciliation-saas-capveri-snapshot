"""Tests for the checkout.session.completed webhook handler."""

from unittest.mock import MagicMock

import pytest

from app.api.routes.webhooks import handle_checkout_session_completed


def _make_db(winback_existing: bool = False) -> MagicMock:
    """Return a mock DB with a configured free_audit_winback_offers table."""
    db = MagicMock()
    existing_result = MagicMock(data=[{"id": "row-1"}] if winback_existing else [])
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        existing_result
    )
    return db


class TestHandleCheckoutSessionCompleted:
    @pytest.mark.asyncio
    async def test_updates_row_when_offer_tier_in_metadata(self):
        """Session metadata has offer_tier → redeemed_offer_tier + redeemed_at set."""
        db = _make_db()
        session = {
            "metadata": {
                "organization_id": "org-123",
                "offer_tier": "offer_50",
            }
        }

        await handle_checkout_session_completed(session, db)

        db.table.assert_called_with("free_audit_winback_offers")
        update_call = db.table.return_value.update.call_args
        assert update_call is not None
        updated_data = update_call[0][0]
        assert updated_data["redeemed_offer_tier"] == "offer_50"
        assert "redeemed_at" in updated_data

    @pytest.mark.asyncio
    async def test_does_not_touch_db_when_no_offer_tier(self):
        """Session metadata missing offer_tier → DB not updated."""
        db = _make_db()
        session = {
            "metadata": {
                "organization_id": "org-123",
            }
        }

        await handle_checkout_session_completed(session, db)

        db.table.return_value.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_does_not_touch_db_when_no_organization_id(self):
        """Session metadata missing organization_id → DB not touched."""
        db = _make_db()
        session = {
            "metadata": {
                "offer_tier": "offer_free",
            }
        }

        await handle_checkout_session_completed(session, db)

        db.table.return_value.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_does_not_touch_db_when_no_metadata(self):
        """Session with no metadata key → DB not touched."""
        db = _make_db()
        session: dict = {}

        await handle_checkout_session_completed(session, db)

        db.table.return_value.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_is_null_guard_present_in_update_chain(self):
        """Update uses IS NULL guard so a second webhook cannot overwrite first."""
        db = _make_db()
        session = {
            "metadata": {
                "organization_id": "org-123",
                "offer_tier": "offer_50",
            }
        }

        await handle_checkout_session_completed(session, db)

        # The .is_() call must be present in the chain before .execute()
        db.table.return_value.update.return_value.eq.return_value.is_.assert_called_once_with(
            "redeemed_offer_tier", "null"
        )

    @pytest.mark.asyncio
    async def test_second_call_writes_same_data_as_first(self):
        """Two calls with the same session write the same offer_tier both times."""
        db = _make_db()
        session = {
            "metadata": {
                "organization_id": "org-123",
                "offer_tier": "offer_free",
            }
        }

        await handle_checkout_session_completed(session, db)
        await handle_checkout_session_completed(session, db)

        all_calls = db.table.return_value.update.call_args_list
        assert len(all_calls) == 2
        for call in all_calls:
            written = call[0][0]
            assert written["redeemed_offer_tier"] == "offer_free"
