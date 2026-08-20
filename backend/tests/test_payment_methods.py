"""
Tests for payment method management service.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import stripe

from app.services.billing.payment_methods import PaymentMethodService


@pytest.fixture
def mock_db():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def mock_stripe():
    """Mock StripeService."""
    return MagicMock()


@pytest.fixture
def payment_method_service(mock_stripe, mock_db):
    """PaymentMethodService instance with mocked dependencies."""
    return PaymentMethodService(stripe_service=mock_stripe, db=mock_db)


@pytest.fixture
def mock_payment_method():
    """Mock Stripe PaymentMethod."""
    pm = MagicMock()
    pm.id = "pm_test123"
    pm.card = MagicMock()
    pm.card.brand = "visa"
    pm.card.last4 = "4242"
    pm.card.exp_month = 12
    pm.card.exp_year = 2025
    pm.customer = "cus_test123"
    return pm


class TestListPaymentMethods:
    """Test list_payment_methods method."""

    @pytest.mark.asyncio
    async def test_list_payment_methods_success(
        self, payment_method_service, mock_payment_method
    ):
        """Verify payment methods are listed correctly."""
        customer_id = "cus_test123"

        # Mock Stripe list response
        mock_list = MagicMock()
        mock_list.data = [mock_payment_method]

        # Mock Stripe customer with default payment method
        mock_customer = MagicMock()
        mock_customer.invoice_settings = MagicMock()
        mock_customer.invoice_settings.default_payment_method = "pm_test123"

        with patch.object(stripe.PaymentMethod, "list", return_value=mock_list):
            with patch.object(stripe.Customer, "retrieve", return_value=mock_customer):
                # Execute
                result = await payment_method_service.list_payment_methods(customer_id)

                # Verify
                assert len(result) == 1
                assert result[0]["id"] == "pm_test123"
                assert result[0]["brand"] == "visa"
                assert result[0]["last4"] == "4242"
                assert result[0]["exp_month"] == 12
                assert result[0]["exp_year"] == 2025
                assert result[0]["is_default"] is True

    @pytest.mark.asyncio
    async def test_list_payment_methods_no_default(
        self, payment_method_service, mock_payment_method
    ):
        """Verify is_default is False when no default set."""
        customer_id = "cus_test123"

        # Mock Stripe list response
        mock_list = MagicMock()
        mock_list.data = [mock_payment_method]

        # Mock Stripe customer with no default payment method
        mock_customer = MagicMock()
        mock_customer.invoice_settings = MagicMock()
        mock_customer.invoice_settings.default_payment_method = None

        with patch.object(stripe.PaymentMethod, "list", return_value=mock_list):
            with patch.object(stripe.Customer, "retrieve", return_value=mock_customer):
                # Execute
                result = await payment_method_service.list_payment_methods(customer_id)

                # Verify
                assert result[0]["is_default"] is False

    @pytest.mark.asyncio
    async def test_list_payment_methods_skips_non_card_methods(
        self, payment_method_service
    ):
        """Verify payment methods without card field are skipped."""
        customer_id = "cus_test123"

        # Create a payment method without card (e.g., bank account)
        pm_no_card = MagicMock()
        pm_no_card.id = "pm_bank123"
        pm_no_card.card = None

        # Create a normal card payment method
        pm_with_card = MagicMock()
        pm_with_card.id = "pm_test123"
        pm_with_card.card = MagicMock()
        pm_with_card.card.brand = "visa"
        pm_with_card.card.last4 = "4242"
        pm_with_card.card.exp_month = 12
        pm_with_card.card.exp_year = 2025

        # Mock Stripe list response with both types
        mock_list = MagicMock()
        mock_list.data = [pm_no_card, pm_with_card]

        # Mock Stripe customer
        mock_customer = MagicMock()
        mock_customer.invoice_settings = MagicMock()
        mock_customer.invoice_settings.default_payment_method = "pm_test123"

        with patch.object(stripe.PaymentMethod, "list", return_value=mock_list):
            with patch.object(stripe.Customer, "retrieve", return_value=mock_customer):
                # Execute
                result = await payment_method_service.list_payment_methods(customer_id)

                # Verify only the card payment method is included
                assert len(result) == 1
                assert result[0]["id"] == "pm_test123"
                assert result[0]["brand"] == "visa"


class TestCreateSetupIntent:
    """Test create_setup_intent method."""

    @pytest.mark.asyncio
    async def test_create_setup_intent_success(self, payment_method_service):
        """Verify SetupIntent is created correctly."""
        customer_id = "cus_test123"

        # Mock Stripe SetupIntent
        mock_setup_intent = MagicMock()
        mock_setup_intent.client_secret = "seti_test_secret123"

        with patch.object(stripe.SetupIntent, "create", return_value=mock_setup_intent):
            # Execute
            result = await payment_method_service.create_setup_intent(customer_id)

            # Verify
            assert result == "seti_test_secret123"

            # Verify Stripe called correctly
            stripe.SetupIntent.create.assert_called_once_with(
                customer=customer_id,
                payment_method_types=["card"],
            )

    @pytest.mark.asyncio
    async def test_create_setup_intent_missing_client_secret(
        self, payment_method_service
    ):
        """Verify error when client_secret is missing."""
        customer_id = "cus_test123"

        # Mock Stripe SetupIntent with no client_secret
        mock_setup_intent = MagicMock()
        mock_setup_intent.client_secret = None

        with patch.object(stripe.SetupIntent, "create", return_value=mock_setup_intent):
            # Execute and verify exception
            with pytest.raises(ValueError, match="Failed to create setup intent"):
                await payment_method_service.create_setup_intent(customer_id)


class TestSetDefaultPaymentMethod:
    """Test set_default_payment_method method."""

    @pytest.mark.asyncio
    async def test_set_default_payment_method_success(self, payment_method_service):
        """Verify default payment method is set correctly."""
        customer_id = "cus_test123"
        payment_method_id = "pm_new123"

        mock_payment_method = MagicMock(customer=customer_id)

        with (
            patch.object(
                stripe.PaymentMethod, "retrieve", return_value=mock_payment_method
            ) as mock_retrieve,
            patch.object(stripe.Customer, "modify") as mock_modify,
        ):
            # Execute
            await payment_method_service.set_default_payment_method(
                customer_id, payment_method_id
            )

            # Verify
            mock_retrieve.assert_called_once_with(payment_method_id)
            mock_modify.assert_called_once_with(
                customer_id,
                invoice_settings={
                    "default_payment_method": payment_method_id,
                },
            )

    @pytest.mark.asyncio
    async def test_set_default_rejects_foreign_payment_method(
        self, payment_method_service
    ):
        """Default mutation must reject payment methods owned by another customer."""
        customer_id = "cus_test123"
        payment_method_id = "pm_foreign"
        mock_payment_method = MagicMock(customer="cus_other")

        with (
            patch.object(
                stripe.PaymentMethod, "retrieve", return_value=mock_payment_method
            ),
            patch.object(stripe.Customer, "modify") as mock_modify,
        ):
            with pytest.raises(ValueError, match="Payment method not found"):
                await payment_method_service.set_default_payment_method(
                    customer_id, payment_method_id
                )

        mock_modify.assert_not_called()


class TestRemovePaymentMethod:
    """Test remove_payment_method method."""

    @pytest.mark.asyncio
    async def test_remove_payment_method_success(
        self, payment_method_service, mock_payment_method
    ):
        """Verify payment method is removed when multiple exist."""
        customer_id = "cus_test123"
        payment_method_id = "pm_test123"

        # Mock two payment methods
        pm2 = MagicMock()
        pm2.id = "pm_test456"
        pm2.card = MagicMock()
        pm2.card.brand = "mastercard"
        pm2.card.last4 = "5555"
        pm2.card.exp_month = 6
        pm2.card.exp_year = 2026

        mock_list = MagicMock()
        mock_list.data = [mock_payment_method, pm2]

        mock_customer = MagicMock()
        mock_customer.invoice_settings = MagicMock()
        mock_customer.invoice_settings.default_payment_method = "pm_test123"

        with (
            patch.object(
                stripe.PaymentMethod, "retrieve", return_value=mock_payment_method
            ),
            patch.object(stripe.PaymentMethod, "list", return_value=mock_list),
            patch.object(stripe.Customer, "retrieve", return_value=mock_customer),
            patch.object(stripe.PaymentMethod, "detach") as mock_detach,
        ):
            # Execute
            await payment_method_service.remove_payment_method(
                customer_id, payment_method_id
            )

            # Verify
            mock_detach.assert_called_once_with(payment_method_id)

    @pytest.mark.asyncio
    async def test_remove_payment_method_only_one_raises_error(
        self, payment_method_service, mock_payment_method
    ):
        """Verify error when trying to remove the only payment method."""
        customer_id = "cus_test123"
        payment_method_id = "pm_test123"

        # Mock only one payment method
        mock_list = MagicMock()
        mock_list.data = [mock_payment_method]

        mock_customer = MagicMock()
        mock_customer.invoice_settings = MagicMock()
        mock_customer.invoice_settings.default_payment_method = "pm_test123"

        with (
            patch.object(
                stripe.PaymentMethod, "retrieve", return_value=mock_payment_method
            ),
            patch.object(stripe.PaymentMethod, "list", return_value=mock_list),
            patch.object(stripe.Customer, "retrieve", return_value=mock_customer),
        ):
            # Execute and verify exception
            with pytest.raises(
                ValueError, match="Cannot remove the only payment method"
            ):
                await payment_method_service.remove_payment_method(
                    customer_id, payment_method_id
                )

    @pytest.mark.asyncio
    async def test_remove_rejects_foreign_payment_method(self, payment_method_service):
        """Detach must reject payment methods owned by another customer."""
        customer_id = "cus_test123"
        payment_method_id = "pm_foreign"
        mock_payment_method = MagicMock(customer="cus_other")

        with (
            patch.object(
                stripe.PaymentMethod, "retrieve", return_value=mock_payment_method
            ),
            patch.object(stripe.PaymentMethod, "detach") as mock_detach,
        ):
            with pytest.raises(ValueError, match="Payment method not found"):
                await payment_method_service.remove_payment_method(
                    customer_id, payment_method_id
                )

        mock_detach.assert_not_called()


class TestCreatePortalSession:
    """Test create_portal_session method."""

    @pytest.mark.asyncio
    async def test_create_portal_session_success(self, payment_method_service):
        """Verify portal session is created correctly."""
        customer_id = "cus_test123"
        return_url = "https://example.com/billing"

        # Mock portal session
        mock_session = MagicMock()
        mock_session.url = "https://billing.stripe.com/session/xxx"

        payment_method_service.stripe.create_billing_portal_session = AsyncMock(
            return_value=mock_session
        )

        # Execute
        result = await payment_method_service.create_portal_session(
            customer_id, return_url
        )

        # Verify
        assert result == "https://billing.stripe.com/session/xxx"

        # Verify service called correctly
        payment_method_service.stripe.create_billing_portal_session.assert_awaited_once_with(
            customer_id=customer_id,
            return_url=return_url,
        )
