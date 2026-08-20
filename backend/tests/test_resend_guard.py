"""Regression tests for the automated Resend safety guard."""

from unittest.mock import patch

import pytest
import resend


def test_unmocked_resend_send_is_blocked_in_automated_tests():
    """Automated tests fail fast if they try to send real Resend email."""
    with pytest.raises(AssertionError, match="Automated tests must not call Resend"):
        resend.Emails.send({"to": "test@example.com"})


def test_unmocked_resend_cancel_is_blocked_in_automated_tests():
    """Automated tests fail fast if they try to cancel real Resend email."""
    with pytest.raises(AssertionError, match="Automated tests must not call Resend"):
        resend.Emails.cancel("email-id")


def test_resend_send_can_still_be_mocked_in_automated_tests():
    """Normal unit tests can override the guard with a local mock."""
    with patch("resend.Emails.send", return_value={"id": "mocked-email-id"}):
        assert resend.Emails.send({"to": "test@example.com"}) == {
            "id": "mocked-email-id"
        }
