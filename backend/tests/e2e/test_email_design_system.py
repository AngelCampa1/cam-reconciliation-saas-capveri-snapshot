"""E2E tests for the email design system pipeline.

Renders all transactional templates end-to-end (no mocks on renderer) and asserts:
- Brand tokens appear in output
- No legacy hardcoded values remain
- All required variables are passed without UndefinedError
"""

import pytest

from app.services.email.renderer import render_email


@pytest.fixture(scope="module")
def all_rendered_emails() -> list[str]:
    """Render all transactional email templates with representative context data.

    Centralising renders here avoids duplicating the argument lists across
    test methods.  A single call per template; tests share the results.
    """
    return [
        render_email(
            "welcome.html",
            show_unsubscribe=False,
            organization_name="Acme",
        ),
        render_email(
            "team_invitation.html",
            show_unsubscribe=False,
            signup_url="https://capveri.com/team/signup?token=t",
            inviter_text="Alice",
            organization_name="Acme",
            role_display="Admin",
            expires_at_formatted="January 1, 2025",
        ),
        render_email(
            "team_welcome.html",
            show_unsubscribe=False,
            full_name="Bob",
            organization_name="Acme",
            role_display="Member",
            login_url="https://capveri.com/login",
        ),
        render_email(
            "tenant_invitation.html",
            show_unsubscribe=False,
            signup_url="https://app.capveri.com/tenant/signup?token=t",
            expires_at_formatted="June 1, 2025",
        ),
        render_email(
            "statement_notification.html",
            show_unsubscribe=False,
            tenant_name="Carol",
            property_name="Main St",
            period="2024",
            amount="$5,000",
            portal_url="https://portal.capveri.com/s/1",
        ),
        render_email(
            "dispute_update.html",
            show_unsubscribe=False,
            tenant_name="Dan",
            property_name="Oak Ave",
            dispute_status="Resolved",
            portal_url="https://portal.capveri.com/d/1",
        ),
        render_email(
            "dispute_notification.html",
            show_unsubscribe=False,
            admin_name="Eve Admin",
            tenant_name="Frank Corp",
            category="Math Error",
            portal_url="https://portal.capveri.com/admin/d/1",
        ),
        render_email(
            "content_download.html",
            show_unsubscribe=True,
            first_name="Grace",
            asset_name="CAM Checklist",
            download_url="https://example.com/file.pdf",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=YWJj&t=def123",
        ),
        render_email(
            "audit_results.html",
            show_unsubscribe=True,
            organization_name="Apex",
            recovery_amount=20000,
            property_name="Elm Blvd",
            billing_url="https://app.capveri.com/settings/billing",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=YWJj&t=def123",
        ),
        render_email(
            "forward_email.html",
            show_unsubscribe=False,
            original_from="sender@example.com",
            original_to="angel.campa@capveri.com",
            subject="Help needed",
            original_html="<p>Hello</p>",
        ),
        render_email(
            "trial_paused.html",
            show_unsubscribe=False,
            organization_name="Acme",
            charge_date_formatted="May 20, 2026",
            charge_amount_formatted="$998/year",
            billing_url="https://app.capveri.com/settings/billing",
        ),
    ]


class TestEmailDesignSystemE2E:
    """End-to-end rendering tests for all email templates."""

    # ── Brand token assertions ──────────────────────────────────────────────

    def test_no_legacy_color_in_any_template(self, all_rendered_emails):
        """None of the transactional templates contain the legacy #2563eb blue."""
        for html in all_rendered_emails:
            assert (
                "#2563eb" not in html
            ), f"Legacy color #2563eb found in rendered HTML: {html[:200]}"

    def test_brand_color_in_all_templates(self, all_rendered_emails):
        """All transactional templates contain the Sovereign Blue brand color #304476."""
        for html in all_rendered_emails:
            assert (
                "#304476" in html
            ), f"Brand color #304476 missing from rendered HTML: {html[:200]}"

    # ── Individual template smoke tests ────────────────────────────────────

    def test_e2e_welcome_renders_reconciliation_cta(self):
        """Welcome email renders with review reconciliation CTA."""
        html = render_email(
            "welcome.html",
            show_unsubscribe=False,
            organization_name="Summit Real Estate",
        )
        assert "Review Draft Reconciliation" in html
        assert "/reconciliations" in html
        assert "Summit Real Estate" in html

    def test_e2e_team_invitation_renders_invite_link(self):
        """Team invitation renders with accept button and expiry."""
        html = render_email(
            "team_invitation.html",
            show_unsubscribe=False,
            signup_url="https://capveri.com/team/signup?token=abc123",
            inviter_text="Jane Manager",
            organization_name="Pinnacle Properties",
            role_display="Admin",
            expires_at_formatted="March 15, 2025",
        )
        assert "Pinnacle Properties" in html
        assert "abc123" in html
        assert "March 15, 2025" in html

    def test_e2e_tenant_invitation_renders_signup_link(self):
        """Tenant invitation renders with signup URL and expiry date."""
        html = render_email(
            "tenant_invitation.html",
            show_unsubscribe=False,
            signup_url="https://app.capveri.com/tenant/signup?token=xyz999",
            expires_at_formatted="April 30, 2025",
        )
        assert "xyz999" in html
        assert "April 30, 2025" in html
        assert "Create Your Account" in html

    def test_e2e_statement_notification_renders_details(self):
        """Statement notification renders all statement details."""
        html = render_email(
            "statement_notification.html",
            show_unsubscribe=False,
            tenant_name="Widgets Inc",
            property_name="100 Commerce Dr",
            period="FY 2024",
            amount="$22,000.00",
            portal_url="https://portal.capveri.com/statements/999",
        )
        assert "Widgets Inc" in html
        assert "100 Commerce Dr" in html
        assert "FY 2024" in html
        assert "$22,000.00" in html
        assert "View Statement" in html

    def test_e2e_dispute_update_renders_status(self):
        """Dispute update email renders status and property name."""
        html = render_email(
            "dispute_update.html",
            show_unsubscribe=False,
            tenant_name="Alpha LLC",
            property_name="500 Oak Avenue",
            dispute_status="Approved",
            portal_url="https://portal.capveri.com/disputes/42",
        )
        assert "Alpha LLC" in html
        assert "500 Oak Avenue" in html
        assert "Approved" in html

    def test_e2e_dispute_notification_renders_category(self):
        """Dispute notification renders tenant name and category."""
        html = render_email(
            "dispute_notification.html",
            show_unsubscribe=False,
            admin_name="Lisa Admin",
            tenant_name="Beta Corp",
            category="Incorrect Proration",
            portal_url="https://portal.capveri.com/admin/disputes/7",
        )
        assert "Lisa Admin" in html
        assert "Beta Corp" in html
        assert "Incorrect Proration" in html

    def test_e2e_content_download_with_url(self):
        """Content download email renders download button when URL provided."""
        html = render_email(
            "content_download.html",
            show_unsubscribe=True,
            first_name="Henry",
            asset_name="CAM Reconciliation Guide",
            download_url="https://signed.s3.amazonaws.com/guide.pdf?sig=abc",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=YWJj&t=def123",
        )
        assert "Henry" in html
        assert "CAM Reconciliation Guide" in html
        assert "signed.s3.amazonaws.com" in html
        assert "border-radius: 9999px" in html

    def test_e2e_content_download_without_url_shows_fallback(self):
        """Content download email renders fallback message when URL is empty."""
        html = render_email(
            "content_download.html",
            show_unsubscribe=True,
            first_name="Iris",
            asset_name="CAM Guide",
            download_url="",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=YWJj&t=def123",
        )
        assert "Iris" in html
        # Fallback message, no broken button
        assert (
            "support" in html.lower()
            or "contact" in html.lower()
            or "prepare" in html.lower()
        )
        assert "signed.s3" not in html

    def test_e2e_audit_results_with_positive_recovery(self):
        """Audit results email highlights recovery amount when positive."""
        html = render_email(
            "audit_results.html",
            show_unsubscribe=True,
            organization_name="Eagle Properties",
            recovery_amount=35000,
            property_name="Commerce Center",
            billing_url="https://app.capveri.com/settings/billing",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=YWJj&t=def123",
        )
        assert "35,000" in html
        assert "Commerce Center" in html
        assert "Reconcile first-year offer pricing" in html
        assert "35.1x" in html

    def test_e2e_audit_results_with_zero_recovery(self):
        """Audit results email shows clean result copy when recovery is 0."""
        html = render_email(
            "audit_results.html",
            show_unsubscribe=True,
            organization_name="Falcon REIT",
            recovery_amount=0,
            property_name="Harbor View",
            billing_url="https://app.capveri.com/settings/billing",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=YWJj&t=def123",
        )
        assert "Harbor View" in html
        assert "clean" in html.lower()

    def test_e2e_forward_email_renders_metadata(self):
        """Forwarded email includes sender/recipient/subject context header."""
        html = render_email(
            "forward_email.html",
            show_unsubscribe=False,
            original_from="customer@acme.com",
            original_to="angel.campa@capveri.com",
            subject="Billing question",
            original_html="<p>I have a question about my bill.</p>",
        )
        assert "customer@acme.com" in html
        assert "angel.campa@capveri.com" in html
        assert "Billing question" in html
        assert "I have a question about my bill." in html
