"""
Tests for Stripe customer management service.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import stripe

from app.services.billing.customers import CustomerService
from app.services.billing.stripe_client import StripeService


@pytest.fixture
def mock_db():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def mock_stripe():
    """Mock StripeService."""
    return MagicMock(spec=StripeService)


@pytest.fixture
def customer_service(mock_stripe, mock_db):
    """CustomerService instance with mocked dependencies."""
    return CustomerService(stripe_service=mock_stripe, db=mock_db)


class TestGetOrCreateCustomer:
    """Test get_or_create_customer method."""

    @pytest.mark.asyncio
    async def test_create_customer_stores_id(
        self, customer_service, mock_stripe, mock_db
    ):
        """Verify customer ID is stored in subscriptions table."""
        org_id = uuid4()
        email = "test@example.com"
        name = "Test Organization"

        # Mock: No existing customer
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            None
        )

        # Mock: Stripe customer creation
        mock_customer = MagicMock(spec=stripe.Customer)
        mock_customer.id = "cus_test123"
        mock_customer.email = email
        mock_customer.name = name
        mock_customer.metadata = {"organization_id": str(org_id), "source": "capveri"}
        mock_stripe.create_customer = AsyncMock(return_value=mock_customer)

        # Mock: DB update
        mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
            MagicMock()
        )

        # Execute
        result = await customer_service.get_or_create_customer(org_id, email, name)

        # Verify customer created with correct params
        mock_stripe.create_customer.assert_called_once_with(
            email=email,
            name=name,
            metadata={"organization_id": str(org_id), "source": "capveri"},
        )

        # Verify customer ID stored in database
        mock_db.table.assert_called_with("subscriptions")
        mock_db.table.return_value.update.assert_called_once_with(
            {"stripe_customer_id": "cus_test123"}
        )
        mock_db.table.return_value.update.return_value.eq.assert_called_once_with(
            "organization_id", str(org_id)
        )

        assert result.id == "cus_test123"

    @pytest.mark.asyncio
    async def test_get_existing_customer(self, customer_service, mock_stripe, mock_db):
        """Verify existing customer is returned, not duplicated."""
        org_id = uuid4()
        email = "test@example.com"
        name = "Test Organization"

        # Mock: Existing customer ID in database
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "stripe_customer_id": "cus_existing123"
        }

        # Mock: Stripe get_customer
        mock_customer = MagicMock(spec=stripe.Customer)
        mock_customer.id = "cus_existing123"
        mock_customer.email = email
        mock_stripe.get_customer = AsyncMock(return_value=mock_customer)

        # Execute
        result = await customer_service.get_or_create_customer(org_id, email, name)

        # Verify existing customer retrieved
        mock_stripe.get_customer.assert_called_once_with("cus_existing123")

        # Verify create_customer NOT called
        assert not mock_stripe.create_customer.called

        # Verify database NOT updated
        assert not mock_db.table.return_value.update.called

        assert result.id == "cus_existing123"

    @pytest.mark.asyncio
    async def test_customer_metadata_includes_org(
        self, customer_service, mock_stripe, mock_db
    ):
        """Verify customer metadata includes organization ID."""
        org_id = uuid4()
        email = "metadata@example.com"
        name = "Metadata Org"

        # Mock: No existing customer
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            None
        )

        # Mock: Stripe customer creation
        mock_customer = MagicMock(spec=stripe.Customer)
        mock_customer.id = "cus_meta123"
        mock_customer.metadata = {"organization_id": str(org_id), "source": "capveri"}
        mock_stripe.create_customer = AsyncMock(return_value=mock_customer)

        # Mock: DB update
        mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
            MagicMock()
        )

        # Execute
        await customer_service.get_or_create_customer(org_id, email, name)

        # Verify metadata passed correctly
        call_kwargs = mock_stripe.create_customer.call_args.kwargs
        assert "metadata" in call_kwargs
        assert call_kwargs["metadata"]["organization_id"] == str(org_id)
        assert call_kwargs["metadata"]["source"] == "capveri"


class TestUpdateCustomer:
    """Test update_customer method."""

    @pytest.mark.asyncio
    async def test_update_customer_email(self, customer_service):
        """Verify customer email is updated."""
        customer_id = "cus_update123"
        new_email = "newemail@example.com"

        # Mock Stripe Customer.modify
        with patch.object(stripe.Customer, "modify") as mock_modify:
            mock_modified = MagicMock(spec=stripe.Customer)
            mock_modified.id = customer_id
            mock_modified.email = new_email
            mock_modify.return_value = mock_modified

            result = await customer_service.update_customer(
                customer_id, email=new_email
            )

            mock_modify.assert_called_once_with(customer_id, email=new_email)
            assert result.email == new_email

    @pytest.mark.asyncio
    async def test_update_customer_name(self, customer_service):
        """Verify customer name is updated."""
        customer_id = "cus_update456"
        new_name = "Updated Org Name"

        with patch.object(stripe.Customer, "modify") as mock_modify:
            mock_modified = MagicMock(spec=stripe.Customer)
            mock_modified.id = customer_id
            mock_modified.name = new_name
            mock_modify.return_value = mock_modified

            result = await customer_service.update_customer(customer_id, name=new_name)

            mock_modify.assert_called_once_with(customer_id, name=new_name)
            assert result.name == new_name

    @pytest.mark.asyncio
    async def test_update_customer_email_and_name(self, customer_service):
        """Verify both email and name are updated."""
        customer_id = "cus_update789"
        new_email = "both@example.com"
        new_name = "Both Updated"

        with patch.object(stripe.Customer, "modify") as mock_modify:
            mock_modified = MagicMock(spec=stripe.Customer)
            mock_modified.id = customer_id
            mock_modified.email = new_email
            mock_modified.name = new_name
            mock_modify.return_value = mock_modified

            result = await customer_service.update_customer(
                customer_id, email=new_email, name=new_name
            )

            mock_modify.assert_called_once_with(
                customer_id, email=new_email, name=new_name
            )
            assert result.email == new_email
            assert result.name == new_name


class TestGetCustomerByOrganization:
    """Test get_customer_by_organization method."""

    @pytest.mark.asyncio
    async def test_get_customer_by_organization_exists(
        self, customer_service, mock_stripe, mock_db
    ):
        """Verify customer is retrieved for organization."""
        org_id = uuid4()

        # Mock: Customer ID exists in database
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "stripe_customer_id": "cus_org123"
        }

        # Mock: Stripe customer retrieval
        mock_customer = MagicMock(spec=stripe.Customer)
        mock_customer.id = "cus_org123"
        mock_stripe.get_customer = AsyncMock(return_value=mock_customer)

        # Execute
        result = await customer_service.get_customer_by_organization(org_id)

        # Verify database queried
        mock_db.table.assert_called_with("subscriptions")
        mock_db.table.return_value.select.assert_called_once_with("stripe_customer_id")
        mock_db.table.return_value.select.return_value.eq.assert_called_once_with(
            "organization_id", str(org_id)
        )

        # Verify Stripe API called
        mock_stripe.get_customer.assert_called_once_with("cus_org123")

        assert result.id == "cus_org123"

    @pytest.mark.asyncio
    async def test_get_customer_by_organization_not_found(
        self, customer_service, mock_stripe, mock_db
    ):
        """Verify None returned when no customer exists."""
        org_id = uuid4()

        # Mock: No customer in database
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            None
        )

        # Execute
        result = await customer_service.get_customer_by_organization(org_id)

        # Verify None returned
        assert result is None

        # Verify Stripe API NOT called
        assert not mock_stripe.get_customer.called

    @pytest.mark.asyncio
    async def test_get_customer_by_organization_no_customer_id(
        self, customer_service, mock_stripe, mock_db
    ):
        """Verify None returned when customer_id is null."""
        org_id = uuid4()

        # Mock: Subscription exists but no customer_id
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "stripe_customer_id": None
        }

        # Execute
        result = await customer_service.get_customer_by_organization(org_id)

        # Verify None returned
        assert result is None

        # Verify Stripe API NOT called
        assert not mock_stripe.get_customer.called


class TestSyncCustomerEmail:
    """Test sync_customer_email method."""

    @pytest.mark.asyncio
    async def test_sync_customer_email(self, customer_service, mock_stripe, mock_db):
        """Verify email is synced to Stripe customer."""
        org_id = uuid4()
        new_email = "synced@example.com"

        # Mock: Customer exists in database
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "stripe_customer_id": "cus_sync123"
        }

        # Mock: Stripe customer retrieval without spec to avoid falsy evaluation
        mock_customer = MagicMock()
        mock_customer.id = "cus_sync123"
        mock_stripe.get_customer = AsyncMock(return_value=mock_customer)

        # Mock: Stripe modify
        mock_modified = MagicMock()
        mock_modified.id = "cus_sync123"
        mock_modified.email = new_email

        with patch.object(
            stripe.Customer, "modify", return_value=mock_modified
        ) as mock_modify:
            # Execute
            await customer_service.sync_customer_email(org_id, new_email)

            # Verify Stripe API called
            mock_stripe.get_customer.assert_called_once_with("cus_sync123")
            mock_modify.assert_called_once_with("cus_sync123", email=new_email)

    @pytest.mark.asyncio
    async def test_sync_customer_email_no_customer(self, mock_stripe, mock_db):
        """Verify no error when customer doesn't exist."""
        org_id = uuid4()
        new_email = "noop@example.com"

        # Mock: No customer in database
        mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            None
        )

        # Create service and execute - should not raise
        customer_service = CustomerService(stripe_service=mock_stripe, db=mock_db)
        await customer_service.sync_customer_email(org_id, new_email)

        # Verify get_customer NOT called
        assert not mock_stripe.get_customer.called
