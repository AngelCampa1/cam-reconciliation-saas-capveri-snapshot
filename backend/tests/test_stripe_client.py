"""
Tests for Stripe client configuration and service wrapper.
"""

from unittest.mock import MagicMock, patch

import pytest
import stripe

from app.services.billing.config import StripeSettings
from app.services.billing.stripe_client import StripeService, get_stripe_client


class TestStripeSettings:
    """Test Stripe configuration settings."""

    def test_is_test_mode_with_test_key(self) -> None:
        """Verify test mode detection with test API key."""
        settings = StripeSettings(
            stripe_secret_key="sk_test_123456789",
            stripe_publishable_key="pk_test_123456789",
            stripe_webhook_secret="whsec_test_123",
        )
        assert settings.is_test_mode is True

    def test_is_test_mode_with_live_key(self) -> None:
        """Verify test mode detection with live API key."""
        settings = StripeSettings(
            stripe_secret_key="sk_live_123456789",
            stripe_publishable_key="pk_live_123456789",
            stripe_webhook_secret="whsec_live_123",
        )
        assert settings.is_test_mode is False

    def test_default_price_ids_are_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Verify price IDs have default values."""
        monkeypatch.delenv("STRIPE_PRICE_ID_GROWTH_ANNUAL", raising=False)
        monkeypatch.setenv("PYDANTIC_SETTINGS_DOTENV_FILE", "")

        settings = StripeSettings(
            stripe_secret_key="sk_test_123",
            stripe_publishable_key="pk_test_123",
            stripe_webhook_secret="whsec_123",
            stripe_price_id_growth_annual="price_growth_annual",
        )
        assert settings.stripe_price_id_growth_annual == "price_growth_annual"

    def test_price_ids_can_be_set(self) -> None:
        """Verify price IDs can be configured."""
        settings = StripeSettings(
            stripe_secret_key="sk_test_123",
            stripe_publishable_key="pk_test_123",
            stripe_webhook_secret="whsec_123",
            stripe_price_id_growth_annual="price_growth_annual_test",
        )
        assert settings.stripe_price_id_growth_annual == "price_growth_annual_test"


class TestGetStripeClient:
    """Test Stripe client initialization."""

    @patch("app.services.billing.stripe_client.get_stripe_settings")
    def test_configures_api_key(self, mock_get_settings: MagicMock) -> None:
        """Verify Stripe API key is configured from settings."""
        mock_settings = MagicMock()
        mock_settings.stripe_secret_key = "sk_test_example_key"
        mock_get_settings.return_value = mock_settings

        get_stripe_client.cache_clear()

        client = get_stripe_client()

        assert client.api_key == "sk_test_example_key"
        assert client == stripe

    @patch("app.services.billing.stripe_client.get_stripe_settings")
    def test_configures_api_version(self, mock_get_settings: MagicMock) -> None:
        """Verify Stripe API version is pinned."""
        mock_settings = MagicMock()
        mock_settings.stripe_secret_key = "sk_test_example"
        mock_get_settings.return_value = mock_settings

        get_stripe_client.cache_clear()

        client = get_stripe_client()

        assert client.api_version == "2023-10-16"

    @patch("app.services.billing.stripe_client.get_stripe_settings")
    def test_caches_client_instance(self, mock_get_settings: MagicMock) -> None:
        """Verify client is cached using lru_cache."""
        mock_settings = MagicMock()
        mock_settings.stripe_secret_key = "sk_test_cached"
        mock_get_settings.return_value = mock_settings

        get_stripe_client.cache_clear()

        client1 = get_stripe_client()
        client2 = get_stripe_client()

        assert client1 is client2


class TestStripeService:
    """Test StripeService wrapper methods."""

    @pytest.fixture
    def service(self) -> StripeService:
        """Create StripeService with mocked get_stripe_client."""
        with patch("app.services.billing.stripe_client.get_stripe_client"):
            return StripeService()

    @pytest.mark.asyncio
    async def test_create_customer_basic(self, service: StripeService) -> None:
        """Test creating customer with minimal params."""
        with patch("stripe.Customer.create") as mock_create:
            mock_customer = MagicMock(id="cus_test123", email="test@example.com")
            mock_create.return_value = mock_customer

            result = await service.create_customer(email="test@example.com")

            mock_create.assert_called_once_with(
                email="test@example.com", name="", metadata={}
            )
            assert result.id == "cus_test123"

    @pytest.mark.asyncio
    async def test_create_customer_with_metadata(self, service: StripeService) -> None:
        """Test creating customer with name and metadata."""
        with patch("stripe.Customer.create") as mock_create:
            mock_customer = MagicMock(id="cus_test456")
            mock_create.return_value = mock_customer

            result = await service.create_customer(
                email="user@test.com",
                name="Test User",
                metadata={"org_id": "123", "plan": "starter"},
            )

            mock_create.assert_called_once_with(
                email="user@test.com",
                name="Test User",
                metadata={"org_id": "123", "plan": "starter"},
            )
            assert result.id == "cus_test456"

    @pytest.mark.asyncio
    async def test_get_customer(self, service: StripeService) -> None:
        """Test retrieving customer by ID."""
        with patch("stripe.Customer.retrieve") as mock_retrieve:
            mock_customer = MagicMock(id="cus_retrieve123")
            mock_retrieve.return_value = mock_customer

            result = await service.get_customer("cus_retrieve123")

            mock_retrieve.assert_called_once_with("cus_retrieve123")
            assert result.id == "cus_retrieve123"

    @pytest.mark.asyncio
    async def test_create_checkout_session_with_trial(
        self, service: StripeService
    ) -> None:
        """Test creating checkout session with trial period and explicit line items."""
        with patch("stripe.checkout.Session.create") as mock_create:
            mock_session = MagicMock(id="cs_test123", url="https://checkout.stripe.com")
            mock_create.return_value = mock_session

            result = await service.create_checkout_session(
                customer_id="cus_123",
                line_items=[
                    {"price": "price_base_annual"},
                    {"price": "price_unit_overage_annual", "quantity": 20},
                ],
                success_url="https://app.com/success",
                cancel_url="https://app.com/cancel",
                metadata={"pricing_model": "per_unit", "unit_count": "70"},
                trial_days=30,
            )

            mock_create.assert_called_once()
            call_kwargs = mock_create.call_args[1]

            assert call_kwargs["customer"] == "cus_123"
            assert call_kwargs["payment_method_collection"] == "if_required"
            assert call_kwargs["line_items"] == [
                {"price": "price_base_annual"},
                {"price": "price_unit_overage_annual", "quantity": 20},
            ]
            assert call_kwargs["mode"] == "subscription"
            assert (
                call_kwargs["success_url"]
                == "https://app.com/success?session_id={CHECKOUT_SESSION_ID}"
            )
            assert call_kwargs["cancel_url"] == "https://app.com/cancel"
            assert call_kwargs["metadata"] == {
                "pricing_model": "per_unit",
                "unit_count": "70",
                "app": "capveri",
            }
            assert call_kwargs["subscription_data"] == {
                "trial_period_days": 30,
                "trial_settings": {"end_behavior": {"missing_payment_method": "pause"}},
                "metadata": {
                    "pricing_model": "per_unit",
                    "unit_count": "70",
                    "app": "capveri",
                },
            }
            assert result.id == "cs_test123"

    @pytest.mark.asyncio
    async def test_create_checkout_session_without_trial(
        self, service: StripeService
    ) -> None:
        """Test creating checkout session with single-price fallback."""
        with patch("stripe.checkout.Session.create") as mock_create:
            mock_session = MagicMock(id="cs_no_trial")
            mock_create.return_value = mock_session

            result = await service.create_checkout_session(
                customer_id="cus_123",
                price_id="price_456",
                success_url="https://app.com/success",
                cancel_url="https://app.com/cancel",
                trial_days=0,
            )

            call_kwargs = mock_create.call_args[1]
            assert "subscription_data" in call_kwargs
            assert "trial_period_days" not in call_kwargs.get("subscription_data", {})
            assert result.id == "cs_no_trial"

    @pytest.mark.asyncio
    async def test_create_checkout_session_allows_manual_promotion_codes_without_coupon(
        self, service: StripeService
    ) -> None:
        """Checkout allows manual promo codes when no automatic coupon is applied."""
        with patch("stripe.checkout.Session.create") as mock_create:
            mock_create.return_value = MagicMock(id="cs_manual_promo")

            await service.create_checkout_session(
                customer_id="cus_123",
                price_id="price_456",
                success_url="https://app.com/success",
                cancel_url="https://app.com/cancel",
            )

            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["allow_promotion_codes"] is True
            assert "discounts" not in call_kwargs

    @pytest.mark.asyncio
    async def test_create_checkout_session_uses_coupon_without_manual_promotion_codes(
        self, service: StripeService
    ) -> None:
        """Stripe Checkout cannot combine automatic discounts and manual promo entry."""
        with patch("stripe.checkout.Session.create") as mock_create:
            mock_create.return_value = MagicMock(id="cs_coupon")

            await service.create_checkout_session(
                customer_id="cus_123",
                price_id="price_456",
                success_url="https://app.com/success",
                cancel_url="https://app.com/cancel",
                coupon_id="80OFF",
            )

            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["discounts"] == [{"coupon": "80OFF"}]
            assert "allow_promotion_codes" not in call_kwargs

    @pytest.mark.asyncio
    async def test_create_billing_portal_session(self, service: StripeService) -> None:
        """Test creating billing portal session."""
        with patch("stripe.billing_portal.Session.create") as mock_create:
            mock_portal = MagicMock(id="bps_123", url="https://billing.stripe.com")
            mock_create.return_value = mock_portal

            result = await service.create_billing_portal_session(
                customer_id="cus_123", return_url="https://app.com/account"
            )

            mock_create.assert_called_once_with(
                customer="cus_123", return_url="https://app.com/account"
            )
            assert result.id == "bps_123"

    def test_verify_webhook_signature_valid(self, service: StripeService) -> None:
        """Test webhook signature verification with valid signature."""
        with patch("stripe.Webhook.construct_event") as mock_construct:
            mock_event = MagicMock(id="evt_123", type="customer.created")
            mock_construct.return_value = mock_event

            with patch(
                "app.services.billing.stripe_client.get_stripe_settings"
            ) as mock_get_settings:
                mock_settings = MagicMock()
                mock_settings.stripe_webhook_secret = "whsec_test123"
                mock_get_settings.return_value = mock_settings

                result = service.verify_webhook_signature(
                    payload=b'{"id": "evt_123"}', sig_header="t=123,v1=sig"
                )

                mock_construct.assert_called_once_with(
                    b'{"id": "evt_123"}', "t=123,v1=sig", "whsec_test123"
                )
                assert result.id == "evt_123"

    def test_verify_webhook_signature_invalid(self, service: StripeService) -> None:
        """Test webhook signature verification with invalid signature."""
        with patch("stripe.Webhook.construct_event") as mock_construct:
            mock_construct.side_effect = stripe.error.SignatureVerificationError(
                "Invalid signature", "sig"
            )

            with patch(
                "app.services.billing.stripe_client.get_stripe_settings"
            ) as mock_get_settings:
                mock_settings = MagicMock()
                mock_settings.stripe_webhook_secret = "whsec_test123"
                mock_get_settings.return_value = mock_settings

                with pytest.raises(stripe.error.SignatureVerificationError):
                    service.verify_webhook_signature(
                        payload=b'{"malicious": "data"}', sig_header="t=999,v1=bad"
                    )


class TestAppMetadataInjection:
    """All Stripe objects must include app identifier in metadata."""

    @pytest.fixture
    def service(self) -> StripeService:
        """Create StripeService with mocked get_stripe_client."""
        with patch("app.services.billing.stripe_client.get_stripe_client"):
            return StripeService()

    @pytest.mark.asyncio
    async def test_checkout_session_includes_app_metadata(
        self, service: StripeService
    ) -> None:
        """create_checkout_session injects app='capveri' into metadata."""
        with patch("stripe.checkout.Session.create") as mock_create:
            mock_create.return_value = MagicMock(id="cs_test")
            await service.create_checkout_session(
                customer_id="cus_test",
                line_items=[{"price": "price_base_test"}],
                success_url="https://example.com/success",
                cancel_url="https://example.com/cancel",
                metadata={"pricing_model": "per_unit"},
            )
            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["metadata"]["app"] == "capveri"
            assert call_kwargs["metadata"]["pricing_model"] == "per_unit"
            assert call_kwargs["subscription_data"]["metadata"]["app"] == "capveri"

    @pytest.mark.asyncio
    async def test_credit_pack_checkout_includes_app_metadata(
        self, service: StripeService
    ) -> None:
        """create_credit_pack_checkout_session injects app='capveri'."""
        with patch("stripe.checkout.Session.create") as mock_create:
            mock_create.return_value = MagicMock(id="cs_test")
            await service.create_credit_pack_checkout_session(
                customer_id="cus_test",
                quantity=5,
                unit_price_cents=9900,
                success_url="https://example.com/success",
                cancel_url="https://example.com/cancel",
                organization_id="org-123",
            )
            call_kwargs = mock_create.call_args[1]
            assert call_kwargs["metadata"]["app"] == "capveri"
            assert call_kwargs["payment_intent_data"]["metadata"]["app"] == "capveri"
