# Story 21.3: Create Customer Management

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 3
- **Dependencies**: Story 21.1 (Stripe Client), Story 3.15 (Subscriptions Table)
- **Status**: `pending`

## User Story
**As a** billing system
**I want** Stripe customers linked to organizations
**So that** I can process payments and manage subscriptions

## Acceptance Criteria
- [ ] **AC1**: Stripe customer created when organization signs up
- [ ] **AC2**: Customer ID stored in subscriptions table
- [ ] **AC3**: Customer email and name synced from organization
- [ ] **AC4**: Existing customers retrieved by organization ID
- [ ] **AC5**: Customer metadata includes organization context

## Technical Specifications

**File to Create**: `backend/app/services/billing/customers.py`

```python
"""
Stripe customer management service.
"""
from typing import Optional
from uuid import UUID

import stripe
from supabase import Client

from app.services.billing.stripe_client import StripeService


class CustomerService:
    """Manages Stripe customers linked to organizations."""

    def __init__(self, stripe: StripeService, db: Client):
        self.stripe = stripe
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
        """
        # Check if organization already has a Stripe customer
        result = await self.db.table('subscriptions') \
            .select('stripe_customer_id') \
            .eq('organization_id', str(organization_id)) \
            .single() \
            .execute()

        if result.data and result.data.get('stripe_customer_id'):
            # Return existing customer
            return await self.stripe.get_customer(
                result.data['stripe_customer_id']
            )

        # Create new customer
        customer = await self.stripe.create_customer(
            email=email,
            name=name,
            metadata={
                'organization_id': str(organization_id),
                'source': 'capveri',
            },
        )

        # Update subscription record with customer ID
        await self.db.table('subscriptions') \
            .update({'stripe_customer_id': customer.id}) \
            .eq('organization_id', str(organization_id)) \
            .execute()

        return customer

    async def update_customer(
        self,
        customer_id: str,
        email: Optional[str] = None,
        name: Optional[str] = None,
    ) -> stripe.Customer:
        """Update Stripe customer details."""
        update_params = {}
        if email:
            update_params['email'] = email
        if name:
            update_params['name'] = name

        return stripe.Customer.modify(customer_id, **update_params)

    async def get_customer_by_organization(
        self,
        organization_id: UUID,
    ) -> Optional[stripe.Customer]:
        """Get Stripe customer for an organization."""
        result = await self.db.table('subscriptions') \
            .select('stripe_customer_id') \
            .eq('organization_id', str(organization_id)) \
            .single() \
            .execute()

        if not result.data or not result.data.get('stripe_customer_id'):
            return None

        return await self.stripe.get_customer(
            result.data['stripe_customer_id']
        )

    async def sync_customer_email(
        self,
        organization_id: UUID,
        new_email: str,
    ) -> None:
        """Sync organization email change to Stripe customer."""
        customer = await self.get_customer_by_organization(organization_id)
        if customer:
            await self.update_customer(customer.id, email=new_email)
```

**API Endpoint**:

```python
# backend/app/api/routes/billing.py
from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID

from app.api.deps import get_current_user, get_db, get_stripe_service
from app.services.billing.customers import CustomerService

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/customer")
async def get_customer(
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Get Stripe customer for current organization."""
    service = CustomerService(stripe, db)
    customer = await service.get_customer_by_organization(
        current_user.organization_id
    )

    if not customer:
        raise HTTPException(404, "No billing customer found")

    return {
        "id": customer.id,
        "email": customer.email,
        "name": customer.name,
        "created": customer.created,
    }


@router.post("/customer")
async def create_customer(
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Create or get Stripe customer for current organization."""
    # Get organization details
    org = await db.table('organizations') \
        .select('*') \
        .eq('id', str(current_user.organization_id)) \
        .single() \
        .execute()

    service = CustomerService(stripe, db)
    customer = await service.get_or_create_customer(
        organization_id=current_user.organization_id,
        email=org.data['billing_email'] or current_user.email,
        name=org.data['name'],
    )

    return {
        "id": customer.id,
        "email": customer.email,
        "created": customer.created,
    }
```

**Automatic Customer Creation on Signup**:

```python
# In organization creation flow
async def create_organization_with_billing(
    name: str,
    owner_email: str,
    owner_name: str,
    db: Client,
    stripe: StripeService,
):
    """Create organization with billing customer and free subscription."""
    # Create organization
    org = await db.table('organizations') \
        .insert({'name': name, 'billing_email': owner_email}) \
        .execute()

    org_id = org.data[0]['id']

    # Create subscription record (starts as free)
    await db.table('subscriptions') \
        .insert({
            'organization_id': org_id,
            'plan': 'free',
            'status': 'active',
        }) \
        .execute()

    # Create Stripe customer
    customer_service = CustomerService(stripe, db)
    await customer_service.get_or_create_customer(
        organization_id=UUID(org_id),
        email=owner_email,
        name=name,
    )

    return org.data[0]
```

## Test Cases

```python
def test_create_customer_stores_id():
    """Verify customer ID is stored in subscriptions table."""
    # Create org with subscription
    # Call get_or_create_customer
    # Verify stripe_customer_id is set

def test_get_existing_customer():
    """Verify existing customer is returned, not duplicated."""
    # Create customer
    # Call get_or_create_customer again
    # Verify same customer returned

def test_customer_metadata_includes_org():
    """Verify customer metadata includes organization ID."""
    # Create customer
    # Verify metadata['organization_id'] is set
```

## Definition of Done
- [ ] Customers created on organization signup
- [ ] Customer ID stored in database
- [ ] Existing customers retrieved correctly
- [ ] Customer email syncs with organization
- [ ] API endpoints work correctly
