"""Invoice domain model for billing history.

This module defines the Invoice entity for tracking billing and payment history.
Invoices are linked to subscriptions and track amounts, payment status, and
billing periods. Stripe invoice IDs are stored for integration with Stripe's
billing system.
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class InvoiceStatus(str, Enum):
    """Current status of an invoice.

    These values align with Stripe's invoice status values.
    """

    DRAFT = "draft"
    OPEN = "open"
    PAID = "paid"
    VOID = "void"
    UNCOLLECTIBLE = "uncollectible"


class InvoiceBase(BaseModel):
    """Base invoice fields shared across DTOs.

    Contains the core financial fields for invoice operations.
    """

    amount_due: Decimal = Field(
        ...,
        ge=0,
        description="Total amount due on the invoice",
    )
    amount_paid: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        description="Amount already paid",
    )
    currency: str = Field(
        default="usd",
        max_length=3,
        description="Three-letter ISO currency code",
    )
    status: InvoiceStatus = Field(
        default=InvoiceStatus.DRAFT,
        description="Current invoice status",
    )


class InvoiceCreate(InvoiceBase):
    """DTO for creating a new invoice.

    Used when generating invoices for billing periods.
    Stripe IDs are optional as they may be set after Stripe webhook.
    """

    organization_id: UUID = Field(
        ...,
        description="Organization this invoice belongs to",
    )
    subscription_id: UUID | None = Field(
        None,
        description="Related subscription ID",
    )
    stripe_invoice_id: str | None = Field(
        None,
        description="Stripe invoice ID (in_xxx)",
    )
    period_start: datetime = Field(
        ...,
        description="Start of the billing period",
    )
    period_end: datetime = Field(
        ...,
        description="End of the billing period",
    )
    due_date: datetime | None = Field(
        None,
        description="When payment is due",
    )


class InvoiceUpdate(BaseModel):
    """DTO for updating an existing invoice.

    All fields are optional - only provided fields are updated.
    """

    amount_paid: Decimal | None = Field(
        None,
        ge=0,
        description="Updated amount paid",
    )
    status: InvoiceStatus | None = Field(
        None,
        description="Updated invoice status",
    )
    stripe_invoice_id: str | None = Field(
        None,
        description="Stripe invoice ID (in_xxx)",
    )
    paid_at: datetime | None = Field(
        None,
        description="When the invoice was paid",
    )
    pdf_url: str | None = Field(
        None,
        description="URL to the invoice PDF",
    )


class Invoice(InvoiceBase):
    """Full invoice model with all fields.

    Represents a complete invoice record as stored in the database.
    Includes all billing period information and payment tracking fields.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(
        ...,
        description="Unique invoice identifier",
    )
    organization_id: UUID = Field(
        ...,
        description="Organization this invoice belongs to",
    )
    subscription_id: UUID | None = Field(
        None,
        description="Related subscription ID",
    )
    stripe_invoice_id: str | None = Field(
        None,
        description="Stripe invoice ID (in_xxx)",
    )
    period_start: datetime = Field(
        ...,
        description="Start of the billing period",
    )
    period_end: datetime = Field(
        ...,
        description="End of the billing period",
    )
    due_date: datetime | None = Field(
        None,
        description="When payment is due",
    )
    paid_at: datetime | None = Field(
        None,
        description="When the invoice was paid",
    )
    pdf_url: str | None = Field(
        None,
        description="URL to the invoice PDF",
    )
    created_at: datetime = Field(
        ...,
        description="When the invoice was created",
    )
    updated_at: datetime = Field(
        ...,
        description="When the invoice was last updated",
    )


class InvoiceSummary(BaseModel):
    """Lightweight invoice view for listings.

    Contains essential invoice info without full details.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique invoice identifier")
    organization_id: UUID = Field(description="Organization ID")
    amount_due: Decimal = Field(description="Total amount due")
    amount_paid: Decimal = Field(description="Amount already paid")
    currency: str = Field(description="Currency code")
    status: InvoiceStatus = Field(description="Invoice status")
    period_end: datetime = Field(description="End of billing period")
    due_date: datetime | None = Field(description="When payment is due")
