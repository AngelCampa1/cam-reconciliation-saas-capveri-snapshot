# Story T3.5: Email Delivery

## Story Info
- **Epic**: T3 — Audit Pipeline & Report
- **Estimated Hours**: 6
- **Dependencies**: T3.1 (orchestrator calls email service at lifecycle events)
- **Status**: `pending`

## User Story
As a commercial tenant who submitted a CAM audit, I want to receive email notifications when my audit starts processing, completes with a report link, or fails with a refund confirmation so that I stay informed throughout the audit lifecycle.

## Acceptance Criteria
- Three email templates implemented: `audit_started`, `audit_complete`, `audit_failed`
- Emails sent via the existing Resend-based `EmailService` with circuit breaker protection
- `audit_started` email confirms payment received, sets expectations for processing time (5-15 minutes), and includes a status page link
- `audit_complete` email includes a link to view/download the PDF report, a summary of findings (discrepancy count, total overcharge), and a CTA to view the full report
- `audit_failed` email explains that processing failed, confirms automatic refund has been initiated, includes expected refund timeline (5-10 business days), and provides support contact
- All emails use the existing Jinja2 template renderer with brand design tokens
- Email send failures are logged but do not crash the orchestrator (best-effort delivery)
- Resend API calls retry up to 3 times with exponential backoff for transient failures
- All emails include the `access_token` in status/report links, not the internal `audit_id`
- From address: `angel.campa@capveri.com`
- Reply-to address: `angel.campa@capveri.com`

## Technical Specifications

### Email Service

```python
# backend/app/services/tenant_audit/email.py
import logging
import os
from decimal import Decimal
from typing import Any

from app.services.email.renderer import render_email
from app.services.email.resend_service import EmailService

logger = logging.getLogger(__name__)

# Base URL for tenant audit status/report pages
TENANT_AUDIT_BASE_URL = os.environ.get(
    "TENANT_AUDIT_BASE_URL", "https://capveri.com/audit"
)

FROM_ADDRESS = os.environ.get(
    "TENANT_AUDIT_FROM_ADDRESS", "angel.campa@capveri.com"
)

REPLY_TO = os.environ.get(
    "TENANT_AUDIT_REPLY_TO", "angel.campa@capveri.com"
)


class TenantAuditEmailService:
    """Email notifications for tenant audit lifecycle events.

    Uses the existing Resend-based EmailService and Jinja2 template
    renderer. All templates extend the shared base layout with brand
    design tokens.
    """

    def __init__(self) -> None:
        api_key = os.environ.get("RESEND_API_KEY", "")
        self._email_service = EmailService(
            api_key=api_key,
            from_address=FROM_ADDRESS,
        )

    async def send_audit_started(
        self,
        to_email: str,
        access_token: str,
        property_name: str | None = None,
    ) -> dict[str, Any]:
        """Send confirmation that audit processing has begun.

        Args:
            to_email: Tenant's email address.
            access_token: UUID access token for status page link.
            property_name: Optional property name for personalization.

        Returns:
            Resend API response dict.
        """
        status_url = f"{TENANT_AUDIT_BASE_URL}/{access_token}"
        subject = "Your CAM Audit Is Being Processed"
        if property_name:
            subject = f"Your CAM Audit for {property_name} Is Being Processed"

        html = render_email(
            "tenant_audit_started.html",
            property_name=property_name or "your property",
            status_url=status_url,
            estimated_time="5-15 minutes",
        )

        return self._email_service._send_email({
            "from": FROM_ADDRESS,
            "to": [to_email],
            "reply_to": REPLY_TO,
            "subject": subject,
            "html": html,
        })

    async def send_audit_complete(
        self,
        to_email: str,
        access_token: str,
        property_name: str | None = None,
        discrepancy_count: int = 0,
        total_overcharge: Decimal = Decimal("0"),
    ) -> dict[str, Any]:
        """Send notification that audit is complete with report link.

        Args:
            to_email: Tenant's email address.
            access_token: UUID access token for report link.
            property_name: Optional property name for personalization.
            discrepancy_count: Number of discrepancies found.
            total_overcharge: Total overcharge amount in dollars.

        Returns:
            Resend API response dict.
        """
        report_url = f"{TENANT_AUDIT_BASE_URL}/{access_token}/report"
        status_url = f"{TENANT_AUDIT_BASE_URL}/{access_token}"

        if total_overcharge > Decimal("0"):
            subject = f"CAM Audit Complete: ${total_overcharge:,.2f} in Potential Overcharges Found"
        else:
            subject = "CAM Audit Complete: No Material Discrepancies Found"

        if property_name:
            subject = f"{property_name} - {subject}"

        # Determine assessment for email body
        if discrepancy_count == 0:
            assessment = "Clean"
            assessment_detail = (
                "Our independent analysis found no material discrepancies in "
                "your CAM reconciliation statement. Your landlord's calculations "
                "appear to be accurate."
            )
        else:
            assessment = "Discrepancies Found"
            assessment_detail = (
                f"Our independent analysis found {discrepancy_count} "
                f"discrepancy(ies) totaling ${total_overcharge:,.2f} in "
                f"potential overcharges. Review the full report for details."
            )

        html = render_email(
            "tenant_audit_complete.html",
            property_name=property_name or "your property",
            report_url=report_url,
            status_url=status_url,
            assessment=assessment,
            assessment_detail=assessment_detail,
            discrepancy_count=discrepancy_count,
            total_overcharge=f"${total_overcharge:,.2f}",
        )

        return self._email_service._send_email({
            "from": FROM_ADDRESS,
            "to": [to_email],
            "reply_to": REPLY_TO,
            "subject": subject,
            "html": html,
        })

    async def send_audit_failed(
        self,
        to_email: str,
        access_token: str,
        property_name: str | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        """Send notification that audit failed with refund confirmation.

        Args:
            to_email: Tenant's email address.
            access_token: UUID access token for status page link.
            property_name: Optional property name for personalization.
            error_message: Optional user-safe error description.

        Returns:
            Resend API response dict.
        """
        status_url = f"{TENANT_AUDIT_BASE_URL}/{access_token}"
        subject = "CAM Audit Processing Issue - Full Refund Initiated"
        if property_name:
            subject = f"{property_name} - {subject}"

        # Sanitize error message for user display
        safe_error = (
            "We encountered a technical issue while processing your documents."
            if not error_message
            else error_message[:200]
        )

        html = render_email(
            "tenant_audit_failed.html",
            property_name=property_name or "your property",
            status_url=status_url,
            error_message=safe_error,
            refund_timeline="5-10 business days",
            support_email=REPLY_TO,
        )

        return self._email_service._send_email({
            "from": FROM_ADDRESS,
            "to": [to_email],
            "reply_to": REPLY_TO,
            "subject": subject,
            "html": html,
        })
```

### Email Templates

```html
<!-- backend/app/services/email/templates/tenant_audit_started.html -->
{% extends "base.html" %}

{% block content %}
<h1 style="color: {{ t.PRIMARY_700 }}; font-family: {{ t.FONT_FAMILY }}; font-size: 24px; margin-bottom: 16px;">
    Your CAM Audit Is Being Processed
</h1>

<p style="font-family: {{ t.FONT_FAMILY }}; font-size: 16px; color: {{ t.NEUTRAL_700 }}; line-height: 1.6;">
    We've received your payment and started processing your CAM audit for
    <strong>{{ property_name }}</strong>.
</p>

<p style="font-family: {{ t.FONT_FAMILY }}; font-size: 16px; color: {{ t.NEUTRAL_700 }}; line-height: 1.6;">
    Our system is now:
</p>

<ul style="font-family: {{ t.FONT_FAMILY }}; font-size: 14px; color: {{ t.NEUTRAL_700 }}; line-height: 1.8;">
    <li>Extracting financial terms from your lease document</li>
    <li>Analyzing the CAM reconciliation statement</li>
    <li>Running independent calculations</li>
    <li>Comparing results to identify discrepancies</li>
</ul>

<p style="font-family: {{ t.FONT_FAMILY }}; font-size: 14px; color: {{ t.NEUTRAL_500 }};">
    Estimated processing time: <strong>{{ estimated_time }}</strong>
</p>

<div style="text-align: center; margin: 32px 0;">
    <a href="{{ status_url }}"
       style="background-color: {{ t.PRIMARY_600 }}; color: white; padding: 14px 32px;
              text-decoration: none; border-radius: 6px; font-family: {{ t.FONT_FAMILY }};
              font-size: 16px; font-weight: 600; display: inline-block;">
        Check Audit Status
    </a>
</div>

<p style="font-family: {{ t.FONT_FAMILY }}; font-size: 14px; color: {{ t.NEUTRAL_500 }};">
    We'll send you another email as soon as your report is ready.
</p>
{% endblock %}
```

```html
<!-- backend/app/services/email/templates/tenant_audit_complete.html -->
{% extends "base.html" %}

{% block content %}
<h1 style="color: {{ t.PRIMARY_700 }}; font-family: {{ t.FONT_FAMILY }}; font-size: 24px; margin-bottom: 16px;">
    Your CAM Audit Report Is Ready
</h1>

<p style="font-family: {{ t.FONT_FAMILY }}; font-size: 16px; color: {{ t.NEUTRAL_700 }}; line-height: 1.6;">
    The independent audit of your CAM reconciliation for
    <strong>{{ property_name }}</strong> is complete.
</p>

<!-- Assessment Card -->
<div style="background-color: {% if assessment == 'Clean' %}#E8F5E9{% else %}#FFF3E0{% endif %};
            border-left: 4px solid {% if assessment == 'Clean' %}#28A745{% else %}#FFC107{% endif %};
            padding: 16px 20px; margin: 24px 0; border-radius: 0 6px 6px 0;">
    <p style="font-family: {{ t.FONT_FAMILY }}; font-size: 18px; font-weight: 600;
              color: {% if assessment == 'Clean' %}#28A745{% else %}#E65100{% endif %}; margin: 0 0 8px 0;">
        {{ assessment }}
    </p>
    <p style="font-family: {{ t.FONT_FAMILY }}; font-size: 14px; color: {{ t.NEUTRAL_700 }}; margin: 0;">
        {{ assessment_detail }}
    </p>
</div>

{% if discrepancy_count > 0 %}
<div style="background-color: {{ t.NEUTRAL_50 }}; padding: 16px 20px; margin: 16px 0; border-radius: 6px;">
    <table style="width: 100%; font-family: {{ t.FONT_FAMILY }}; font-size: 14px;">
        <tr>
            <td style="padding: 4px 0; color: {{ t.NEUTRAL_500 }};">Discrepancies Found:</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">{{ discrepancy_count }}</td>
        </tr>
        <tr>
            <td style="padding: 4px 0; color: {{ t.NEUTRAL_500 }};">Potential Overcharge:</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #DC3545;">{{ total_overcharge }}</td>
        </tr>
    </table>
</div>
{% endif %}

<div style="text-align: center; margin: 32px 0;">
    <a href="{{ report_url }}"
       style="background-color: {{ t.PRIMARY_600 }}; color: white; padding: 14px 32px;
              text-decoration: none; border-radius: 6px; font-family: {{ t.FONT_FAMILY }};
              font-size: 16px; font-weight: 600; display: inline-block;">
        View Full Report
    </a>
</div>

<p style="font-family: {{ t.FONT_FAMILY }}; font-size: 14px; color: {{ t.NEUTRAL_500 }};">
    You can also download the PDF version from your
    <a href="{{ status_url }}" style="color: {{ t.PRIMARY_600 }};">audit status page</a>.
</p>
{% endblock %}
```

```html
<!-- backend/app/services/email/templates/tenant_audit_failed.html -->
{% extends "base.html" %}

{% block content %}
<h1 style="color: {{ t.PRIMARY_700 }}; font-family: {{ t.FONT_FAMILY }}; font-size: 24px; margin-bottom: 16px;">
    CAM Audit Processing Issue
</h1>

<p style="font-family: {{ t.FONT_FAMILY }}; font-size: 16px; color: {{ t.NEUTRAL_700 }}; line-height: 1.6;">
    We were unable to complete the CAM audit for
    <strong>{{ property_name }}</strong>.
</p>

<div style="background-color: #FFEBEE; border-left: 4px solid #DC3545;
            padding: 16px 20px; margin: 24px 0; border-radius: 0 6px 6px 0;">
    <p style="font-family: {{ t.FONT_FAMILY }}; font-size: 14px; color: #B71C1C; margin: 0;">
        {{ error_message }}
    </p>
</div>

<h2 style="color: {{ t.PRIMARY_700 }}; font-family: {{ t.FONT_FAMILY }}; font-size: 18px; margin-top: 24px;">
    Full Refund Initiated
</h2>

<p style="font-family: {{ t.FONT_FAMILY }}; font-size: 16px; color: {{ t.NEUTRAL_700 }}; line-height: 1.6;">
    A full refund has been automatically initiated. You should see the credit
    on your statement within <strong>{{ refund_timeline }}</strong>.
</p>

<h2 style="color: {{ t.PRIMARY_700 }}; font-family: {{ t.FONT_FAMILY }}; font-size: 18px; margin-top: 24px;">
    What You Can Do
</h2>

<ul style="font-family: {{ t.FONT_FAMILY }}; font-size: 14px; color: {{ t.NEUTRAL_700 }}; line-height: 1.8;">
    <li>Verify your uploaded documents are clear, legible PDFs</li>
    <li>Ensure the lease document includes CAM recovery terms</li>
    <li>Try submitting again with higher-quality document scans</li>
    <li>Contact us at <a href="mailto:{{ support_email }}" style="color: {{ t.PRIMARY_600 }};">{{ support_email }}</a> for help</li>
</ul>

<div style="text-align: center; margin: 32px 0;">
    <a href="{{ status_url }}"
       style="background-color: {{ t.PRIMARY_600 }}; color: white; padding: 14px 32px;
              text-decoration: none; border-radius: 6px; font-family: {{ t.FONT_FAMILY }};
              font-size: 16px; font-weight: 600; display: inline-block;">
        View Audit Status
    </a>
</div>

<p style="font-family: {{ t.FONT_FAMILY }}; font-size: 14px; color: {{ t.NEUTRAL_500 }};">
    If you have questions about your refund or would like assistance,
    please reply to this email or contact
    <a href="mailto:{{ support_email }}" style="color: {{ t.PRIMARY_600 }};">{{ support_email }}</a>.
</p>
{% endblock %}
```

## Test Cases
- Test `send_audit_started` sends email with correct subject line including property name
- Test `send_audit_started` sends email with generic subject when property name is `None`
- Test `send_audit_started` email body contains status URL with access_token
- Test `send_audit_started` email body contains estimated processing time
- Test `send_audit_complete` sends email with overcharge amount in subject when discrepancies found
- Test `send_audit_complete` sends email with "No Material Discrepancies" subject when clean
- Test `send_audit_complete` email body contains report URL with access_token
- Test `send_audit_complete` email body contains discrepancy count and total overcharge
- Test `send_audit_complete` email body shows "Clean" assessment card when no discrepancies
- Test `send_audit_failed` sends email confirming refund has been initiated
- Test `send_audit_failed` email body contains refund timeline (5-10 business days)
- Test `send_audit_failed` email body contains support email address
- Test `send_audit_failed` truncates error_message to 200 characters for user safety
- Test `send_audit_failed` uses generic error message when `error_message` is `None`
- Test all three templates render without Jinja2 errors when all variables are provided
- Test all three templates render without errors when optional variables are `None`
- Test email `from` address is `angel.campa@capveri.com`
- Test email `reply_to` is `angel.campa@capveri.com`
- Test `TenantAuditEmailService` initializes `EmailService` with environment variables
- Test email send failure (Resend API error) raises but is caught by orchestrator (T3.1)
- Test rendered HTML contains brand design tokens (colors, fonts from tokens module)

## Definition of Done
- [ ] `TenantAuditEmailService` class implemented in `backend/app/services/tenant_audit/email.py`
- [ ] Three async methods: `send_audit_started`, `send_audit_complete`, `send_audit_failed`
- [ ] Three Jinja2 templates extending `base.html` with brand tokens
- [ ] `audit_started` template: payment confirmed, processing steps, estimated time, status link
- [ ] `audit_complete` template: assessment card (clean/discrepancies), summary stats, report CTA
- [ ] `audit_failed` template: error message, refund confirmation, timeline, support contact, retry suggestions
- [ ] All links use `access_token`, not `audit_id`
- [ ] From address `angel.campa@capveri.com`, reply-to `angel.campa@capveri.com`
- [ ] Environment variable configuration for base URL, from address, reply-to
- [ ] Error message sanitization (truncate to 200 chars, fallback to generic)
- [ ] Templates created in `backend/app/services/email/templates/`
- [ ] All unit tests pass with `pytest --tb=short`
- [ ] Coverage maintained at >= 95%
