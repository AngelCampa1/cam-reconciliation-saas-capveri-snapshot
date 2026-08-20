"""TDD tests for email design improvements and bug fixes.

Written RED-first before implementation.
"""

from app.services.email.renderer import render_email


class TestBaseTemplateDesign:
    def test_gold_accent_stripe_present(self):
        """Gold stripe comes from the base template, not individual templates.

        Use a template with no callout box (team_invitation) to confirm the
        stripe originates from _base.html, not a template-specific element.
        """
        html = render_email(
            "team_invitation.html",
            show_unsubscribe=False,
            signup_url="https://capveri.com/team/signup?token=t",
            inviter_text="Alice",
            organization_name="Acme",
            role_display="Admin",
            expires_at_formatted="January 1, 2025",
        )
        assert "#F59E0B" in html

    def test_gold_accent_stripe_in_transactional_templates(self):
        """Transactional templates (no callout boxes) each get stripe from _base.html."""
        transactional_renders = [
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
                "dispute_update.html",
                show_unsubscribe=False,
                tenant_name="Acme Corp",
                property_name="Main St",
                dispute_status="Resolved",
                portal_url="https://portal.capveri.com/d/1",
            ),
        ]
        for html in transactional_renders:
            assert (
                "#F59E0B" in html
            ), f"Gold stripe #F59E0B missing from rendered HTML: {html[:200]}"


class TestAuditResultsDesign:
    def test_recovery_callout_uses_accent_color(self):
        """Positive recovery renders a gold callout box."""
        html = render_email(
            "audit_results.html",
            show_unsubscribe=True,
            organization_name="Apex",
            recovery_amount=12500,
            property_name="123 Main St",
            billing_url="https://app.capveri.com/billing",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=a&t=b",
        )
        assert "#F59E0B" in html

    def test_recovery_copy_uses_we_found_not_we_identified(self):
        """Positive recovery copy uses 'We found', not the old 'We identified'."""
        html = render_email(
            "audit_results.html",
            show_unsubscribe=True,
            organization_name="Apex",
            recovery_amount=12500,
            property_name="123 Main St",
            billing_url="https://app.capveri.com/billing",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=a&t=b",
        )
        assert "We found" in html
        assert "We identified" not in html

    def test_zero_recovery_uses_success_color(self):
        """Zero recovery renders a success green indicator."""
        html = render_email(
            "audit_results.html",
            show_unsubscribe=True,
            organization_name="Falcon",
            recovery_amount=0,
            property_name="Harbor View",
            billing_url="https://app.capveri.com/billing",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=a&t=b",
        )
        assert "#16a34a" in html


class TestStatementNotificationDesign:
    def test_data_rendered_as_card_not_bullet_list(self):
        """Statement details use a structured card, not a <ul> bullet list."""
        html = render_email(
            "statement_notification.html",
            show_unsubscribe=False,
            tenant_name="Widgets Inc",
            property_name="Commerce Dr",
            period="FY 2024",
            amount="$22,000.00",
            portal_url="https://portal.capveri.com/s/1",
        )
        assert "<ul" not in html
        assert "<li" not in html


class TestCopyAlignment:
    """AI-pattern copy is removed and replaced with brand-voice copy."""

    def test_welcome_removes_ai_transition_phrase(self):
        """'Here's what to do next' is generic AI filler — removed."""
        html = render_email(
            "welcome.html", show_unsubscribe=False, organization_name="Acme"
        )
        assert "Here's what to do next" not in html
        assert "&#39;s what to do next" not in html

    def test_team_welcome_removes_account_created_boilerplate(self):
        """'successfully created' is passive AI-speak — removed."""
        html = render_email(
            "team_welcome.html",
            show_unsubscribe=False,
            full_name="Bob",
            organization_name="Acme",
            role_display="Member",
            login_url="https://capveri.com/login",
        )
        assert "successfully created" not in html

    def test_team_welcome_removes_filler_bullet_list(self):
        """Generic 'Manage / View / Collaborate' list replaced with single sentence."""
        html = render_email(
            "team_welcome.html",
            show_unsubscribe=False,
            full_name="Bob",
            organization_name="Acme",
            role_display="Member",
            login_url="https://capveri.com/login",
        )
        assert "View financial reports" not in html
        assert "Collaborate with your team" not in html

    def test_tenant_invitation_explains_what_tenant_can_do(self):
        """Tenant invite copy tells them they can see charges and dispute."""
        html = render_email(
            "tenant_invitation.html",
            show_unsubscribe=False,
            signup_url="https://app.capveri.com/tenant/signup?token=xyz",
            expires_at_formatted="June 30, 2025",
        )
        assert "breakdown" in html.lower() or "dispute" in html.lower()

    def test_dispute_notification_removes_redundant_footer(self):
        """'Please review and respond' is redundant with the CTA — removed."""
        html = render_email(
            "dispute_notification.html",
            show_unsubscribe=False,
            admin_name="Admin",
            tenant_name="Acme Corp",
            category="Expense Error",
            portal_url="https://portal.capveri.com/admin/d/1",
        )
        assert "Please review and respond" not in html
