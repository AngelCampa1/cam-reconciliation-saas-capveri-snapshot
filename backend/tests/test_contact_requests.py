"""Tests for contact requests endpoint.

Tests cover:
- Public submission (no auth required)
- Admin notification email sent on success (correct kwargs including admin_email)
- Email failure is swallowed — endpoint still returns 201
- Per-email rate limiting (max 3 per 24h)
- Validation: required fields, field lengths
- HTML escaping in send_contact_notification (XSS prevention)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from tests.conftest import create_test_app


@pytest.fixture(autouse=True)
def clear_rate_limit():
    """Reset the in-memory rate limit dict before each test."""
    from app.api.v1 import contact_requests

    contact_requests._rate_limit.clear()
    yield
    contact_requests._rate_limit.clear()


@pytest.fixture(autouse=True)
def bypass_turnstile():
    """Bypass Turnstile verification by default so endpoint tests stay
    deterministic and never make a real network call (the local .env may set
    TURNSTILE_SECRET_KEY). Tests asserting the fail-closed path override this
    with their own patch."""
    with patch(
        "app.api.v1.contact_requests.verify_turnstile",
        new_callable=AsyncMock,
        return_value=True,
    ):
        yield


@pytest.fixture
def client_with_email():
    """Test client with a mocked email service."""
    from app.api.v1.contact_requests import get_email_service

    mock_email = MagicMock()
    mock_email.send_contact_notification = AsyncMock(
        return_value={"status": "sent", "id": "test-email-id"}
    )

    app = create_test_app()
    app.dependency_overrides[get_email_service] = lambda: mock_email

    with TestClient(app) as client:
        client.mock_email = mock_email
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
def client_email_fails():
    """Test client where the email service raises an exception."""
    from app.api.v1.contact_requests import get_email_service

    mock_email = MagicMock()
    mock_email.send_contact_notification = AsyncMock(
        side_effect=Exception("Resend API error")
    )

    app = create_test_app()
    app.dependency_overrides[get_email_service] = lambda: mock_email

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


class TestContactRequestCreation:
    """Tests for public contact request creation."""

    def test_submit_with_required_fields_only(self, client_with_email):
        """Minimal valid submission returns 201."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "Jane Smith",
                "email": "jane@example.com",
                "inquiry_type": "support",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["success"] is True
        assert "received" in data["message"].lower()

    def test_submit_with_all_optional_fields(self, client_with_email):
        """Full submission including optional fields returns 201."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "John Doe",
                "email": "john@company.com",
                "inquiry_type": "demo",
                "company": "Acme Properties",
                "phone": "+1 555-000-0001",
                "message": "Would love a live demo of the platform.",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["success"] is True

    def test_no_auth_required(self, client_with_email):
        """Endpoint is public — no auth header needed."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "Public User",
                "email": "public@example.com",
                "inquiry_type": "other",
            },
        )
        assert response.status_code != status.HTTP_401_UNAUTHORIZED
        assert response.status_code == status.HTTP_201_CREATED

    def test_admin_notification_email_sent(self, client_with_email):
        """Admin notification email is dispatched with correct kwargs."""
        client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "Test User",
                "email": "test@example.com",
                "inquiry_type": "pricing",
                "company": "Test Corp",
                "message": "Pricing question here.",
            },
        )

        client_with_email.mock_email.send_contact_notification.assert_awaited_once()
        call_kwargs = (
            client_with_email.mock_email.send_contact_notification.call_args.kwargs
        )
        assert call_kwargs["name"] == "Test User"
        assert call_kwargs["email"] == "test@example.com"
        assert call_kwargs["inquiry_type"] == "pricing"
        assert call_kwargs["company"] == "Test Corp"
        assert call_kwargs["message"] == "Pricing question here."
        # Verify email is routed to the admin address from settings
        from app.config import get_settings

        assert call_kwargs["admin_email"] == get_settings().admin_notification_email

    def test_email_failure_returns_201_anyway(self, client_email_fails):
        """Email send failure is swallowed — caller gets 201 so they don't retry."""
        response = client_email_fails.post(
            "/api/v1/contact-requests",
            json={
                "name": "Retry User",
                "email": "retry@example.com",
                "inquiry_type": "general",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["success"] is True


class TestContactRequestRateLimit:
    """Tests for per-email rate limiting."""

    def test_allows_up_to_limit(self, client_with_email):
        """Three submissions from the same email within 24h are accepted."""
        for _ in range(3):
            response = client_with_email.post(
                "/api/v1/contact-requests",
                json={
                    "name": "Rate Test",
                    "email": "ratelimit@example.com",
                    "inquiry_type": "support",
                },
            )
            assert response.status_code == status.HTTP_201_CREATED

    def test_rejects_over_limit(self, client_with_email):
        """Fourth submission from the same email within 24h is rejected."""
        for _ in range(3):
            client_with_email.post(
                "/api/v1/contact-requests",
                json={
                    "name": "Rate Test",
                    "email": "overlimit@example.com",
                    "inquiry_type": "support",
                },
            )

        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "Rate Test",
                "email": "overlimit@example.com",
                "inquiry_type": "support",
            },
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_different_emails_are_independent(self, client_with_email):
        """Rate limit is per-email; different emails don't share a bucket."""
        for _ in range(3):
            client_with_email.post(
                "/api/v1/contact-requests",
                json={
                    "name": "User A",
                    "email": "a@example.com",
                    "inquiry_type": "support",
                },
            )

        # Different email should still succeed
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "User B",
                "email": "b@example.com",
                "inquiry_type": "support",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED


class TestContactRequestValidation:
    """Tests for input validation."""

    def test_missing_name_returns_422(self, client_with_email):
        """Name is required."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={"email": "test@example.com", "inquiry_type": "support"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_missing_email_returns_422(self, client_with_email):
        """Email is required."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={"name": "Test", "inquiry_type": "support"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_invalid_email_returns_422(self, client_with_email):
        """Invalid email format is rejected."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "Test User",
                "email": "not-an-email",
                "inquiry_type": "support",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_missing_inquiry_type_returns_422(self, client_with_email):
        """Inquiry type is required."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={"name": "Test", "email": "test@example.com"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_empty_name_returns_422(self, client_with_email):
        """Empty name (min_length=1) is rejected."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={"name": "", "email": "test@example.com", "inquiry_type": "support"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_name_over_max_length_returns_422(self, client_with_email):
        """Name exceeding max_length=200 is rejected."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "A" * 201,
                "email": "test@example.com",
                "inquiry_type": "support",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_inquiry_type_over_max_length_returns_422(self, client_with_email):
        """Inquiry type exceeding max_length=50 is rejected."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "Test",
                "email": "test@example.com",
                "inquiry_type": "x" * 51,
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_message_over_max_length_returns_422(self, client_with_email):
        """Message exceeding max_length=5000 is rejected."""
        response = client_with_email.post(
            "/api/v1/contact-requests",
            json={
                "name": "Test",
                "email": "test@example.com",
                "inquiry_type": "support",
                "message": "x" * 5001,
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestContactNotificationHtmlEscaping:
    """Tests that user input is HTML-escaped in the admin notification email."""

    def test_xss_payload_is_escaped(self):
        """HTML special characters in user fields are escaped before email send."""
        from app.services.email.resend_service import EmailService

        service = EmailService(api_key="test", from_address="noreply@example.com")
        captured: dict = {}

        async def fake_send(params: dict) -> dict:  # type: ignore[type-arg]
            captured.update(params)
            return {"id": "test-id"}

        service._send_email = fake_send  # type: ignore[method-assign]

        import asyncio

        asyncio.run(
            service.send_contact_notification(
                admin_email="admin@example.com",
                name='<script>alert("xss")</script>',
                email="xss@example.com",
                inquiry_type="<b>bold</b>",
                company="<img src=x onerror=alert(1)>",
                message="<em>hi</em>",
            )
        )

        html_body = captured["html"]
        assert "<script>" not in html_body
        assert "&lt;script&gt;" in html_body
        assert "<b>bold</b>" not in html_body
        assert "&lt;b&gt;bold&lt;/b&gt;" in html_body
        assert "<img" not in html_body
        assert "<em>hi</em>" not in html_body
        assert "&lt;em&gt;hi&lt;/em&gt;" in html_body
        # Subject line should also be escaped
        assert "<script>" not in captured["subject"]

    def test_send_notification_email_failure_propagates(self):
        """An exception from _send_email propagates out of send_contact_notification."""
        from app.services.email.resend_service import EmailService

        service = EmailService(api_key="test", from_address="noreply@example.com")

        async def fail_send(params: dict) -> dict:  # type: ignore[type-arg]
            raise RuntimeError("SMTP unavailable")

        service._send_email = fail_send  # type: ignore[method-assign]

        import asyncio

        with pytest.raises(RuntimeError, match="SMTP unavailable"):
            asyncio.run(
                service.send_contact_notification(
                    admin_email="admin@example.com",
                    name="Test",
                    email="test@example.com",
                    inquiry_type="support",
                )
            )


class TestContactRequestDependencies:
    """Tests for the dependency functions themselves."""

    def test_get_email_service_returns_email_service_instance(self):
        """get_email_service constructs an EmailService from Settings."""
        from app.api.v1.contact_requests import get_email_service
        from app.config import get_settings
        from app.services.email.resend_service import EmailService

        service = get_email_service(get_settings())
        assert isinstance(service, EmailService)

    def test_get_email_service_normalizes_legacy_sender(self):
        """Legacy sender config is rewritten to the canonical CapVeri sender."""
        from types import SimpleNamespace

        from app.api.v1.contact_requests import get_email_service
        from app.services.email.factory import DEFAULT_FROM_ADDRESS

        settings = SimpleNamespace(
            resend_api_key="re_test_123",
            resend_from_address="CAMAudit <noreply@camaudit.io>",
            unsubscribe_hmac_secret="test-secret",
        )

        service = get_email_service(settings)

        assert service.from_address == DEFAULT_FROM_ADDRESS

    def test_http_exception_from_email_service_is_reraised(self):
        """HTTPException raised inside the endpoint propagates (not swallowed)."""
        from fastapi import HTTPException

        from app.api.v1.contact_requests import get_email_service

        mock_email = MagicMock()
        mock_email.send_contact_notification = AsyncMock(
            side_effect=HTTPException(status_code=503, detail="Service unavailable")
        )

        app = create_test_app()
        app.dependency_overrides[get_email_service] = lambda: mock_email

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/contact-requests",
                json={
                    "name": "Test",
                    "email": "test@example.com",
                    "inquiry_type": "support",
                },
            )

        app.dependency_overrides.clear()
        assert response.status_code == 503


class TestContactRequestHoneypotAndTurnstile:
    """Tests for bot-protection on the contact request endpoint."""

    def test_honeypot_returns_success_without_sending_email(self):
        """Honeypot filled returns success and does not call email service."""
        from app.api.v1.contact_requests import get_email_service

        mock_email = MagicMock()
        mock_email.send_contact_notification = AsyncMock(
            return_value={"status": "sent", "id": "test-id"}
        )

        app = create_test_app()
        app.dependency_overrides[get_email_service] = lambda: mock_email

        with TestClient(app) as client:
            response = client.post(
                "/api/v1/contact-requests",
                json={
                    "name": "Jane Smith",
                    "email": "jane@example.com",
                    "inquiry_type": "support",
                    "company_website": "http://spam.example",
                },
            )

        app.dependency_overrides.clear()

        assert response.status_code == 201
        assert response.json()["success"] is True
        mock_email.send_contact_notification.assert_not_awaited()

    def test_turnstile_failure_returns_403_no_email(self):
        """Turnstile failure returns 403 and does not call email service."""
        from app.api.v1.contact_requests import get_email_service

        mock_email = MagicMock()
        mock_email.send_contact_notification = AsyncMock(
            return_value={"status": "sent", "id": "test-id"}
        )

        app = create_test_app()
        app.dependency_overrides[get_email_service] = lambda: mock_email

        with patch(
            "app.api.v1.contact_requests.verify_turnstile",
            new=AsyncMock(return_value=False),
        ):
            with TestClient(app) as client:
                response = client.post(
                    "/api/v1/contact-requests",
                    json={
                        "name": "Jane Smith",
                        "email": "jane@example.com",
                        "inquiry_type": "support",
                    },
                )

        app.dependency_overrides.clear()

        assert response.status_code == 403
        mock_email.send_contact_notification.assert_not_awaited()
