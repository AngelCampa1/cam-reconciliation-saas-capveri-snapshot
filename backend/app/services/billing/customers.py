"""
Stripe customer management service.
"""

from typing import Any, cast
from uuid import UUID

import stripe

from app.database.client import SupabaseDB
from app.services.billing.stripe_client import StripeService


class CustomerService:
    """Manages Stripe customers linked to organizations."""

    def __init__(self, stripe_service: StripeService, db: SupabaseDB):
        self.stripe = stripe_service
        self.db = db

    async def get_or_create_customer(
        self,
        organization_id: UUID,
        email: str,
        name: str,
    ) -> stripe.Customer:
        """
        Get existing Stripe customer or create new one.

        Links customer to organization via metadata.

        Args:
            organization_id: Organization UUID
            email: Customer email address
            name: Customer name (organization name)

        Returns:
            Stripe Customer object
        """
        # Check if organization already has a Stripe customer
        result = (
            self.db.table("subscriptions")
            .select("stripe_customer_id")
            .eq("organization_id", str(organization_id))
            .maybe_single()
            .execute()
        )

        if result and result.data:
            data = cast(dict[str, Any], result.data)
            customer_id = data.get("stripe_customer_id")
            if customer_id:
                # Return existing customer
                return await self.stripe.get_customer(str(customer_id))

        # Create new customer
        customer = await self.stripe.create_customer(
            email=email,
            name=name,
            metadata={
                "organization_id": str(organization_id),
                "source": "capveri",
            },
        )

        # Update subscription record with customer ID
        self.db.table("subscriptions").update({"stripe_customer_id": customer.id}).eq(
            "organization_id", str(organization_id)
        ).execute()

        return customer

    async def update_customer(
        self,
        customer_id: str,
        email: str | None = None,
        name: str | None = None,
    ) -> stripe.Customer:
        """
        Update Stripe customer details.

        Args:
            customer_id: Stripe customer ID
            email: New email address (optional)
            name: New name (optional)

        Returns:
            Updated Stripe Customer object
        """
        update_params: dict[str, Any] = {}
        if email is not None:
            update_params["email"] = email
        if name is not None:
            update_params["name"] = name

        result: Any = stripe.Customer.modify(customer_id, **update_params)
        return result  # type: ignore[no-any-return]

    async def get_customer_by_organization(
        self,
        organization_id: UUID,
    ) -> stripe.Customer | None:
        """
        Get Stripe customer for an organization.

        Args:
            organization_id: Organization UUID

        Returns:
            Stripe Customer object or None if not found
        """
        result = (
            self.db.table("subscriptions")
            .select("stripe_customer_id")
            .eq("organization_id", str(organization_id))
            .maybe_single()
            .execute()
        )

        if not result or not result.data:
            return None

        data = cast(dict[str, Any], result.data)
        customer_id = data.get("stripe_customer_id")
        if not customer_id:
            return None

        return await self.stripe.get_customer(str(customer_id))

    async def sync_customer_email(
        self,
        organization_id: UUID,
        new_email: str,
    ) -> None:
        """
        Sync organization email change to Stripe customer.

        Args:
            organization_id: Organization UUID
            new_email: New email address to sync

        Returns:
            None
        """
        customer = await self.get_customer_by_organization(organization_id)
        if customer:
            await self.update_customer(customer.id, email=new_email)
