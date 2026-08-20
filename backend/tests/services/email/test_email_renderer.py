"""Tests for the Jinja2 email renderer."""

from app.services.email.renderer import render_email


class TestRendererBrandTokens:
    """Verify brand tokens appear in rendered output."""

    def test_render_injects_brand_color(self):
        """Rendered HTML contains the Sovereign Blue primary color."""
        html = render_email(
            "statement_notification.html",
            show_unsubscribe=False,
            tenant_name="Test Tenant",
            property_name="Test Property",
            period="2024",
            amount="$10,000",
            portal_url="https://portal.capveri.com/statement/1",
        )
        assert "#304476" in html

    def test_render_no_legacy_color(self):
        """Rendered HTML does NOT contain the old legacy blue color."""
        html = render_email(
            "statement_notification.html",
            show_unsubscribe=False,
            tenant_name="Test Tenant",
            property_name="Test Property",
            period="2024",
            amount="$10,000",
            portal_url="https://portal.capveri.com/statement/1",
        )
        assert "#2563eb" not in html

    def test_render_uses_system_font_stack(self):
        """Rendered HTML uses the system font stack, not just Arial."""
        html = render_email(
            "welcome.html",
            show_unsubscribe=False,
            organization_name="Test Org",
        )
        assert "-apple-system" in html


class TestRendererLayout:
    """Verify base template layout elements."""

    def test_render_logo_present(self):
        """Logo <img> tag with alt text fallback is in the output."""
        html = render_email(
            "welcome.html",
            show_unsubscribe=False,
            organization_name="Test Org",
        )
        assert "<img" in html
        assert "CapVeri" in html

    def test_render_transactional_no_unsubscribe(self):
        """show_unsubscribe=False means no Unsubscribe link in output."""
        html = render_email(
            "statement_notification.html",
            show_unsubscribe=False,
            tenant_name="Test Tenant",
            property_name="Test Property",
            period="2024",
            amount="$10,000",
            portal_url="https://portal.capveri.com/statement/1",
        )
        assert "Unsubscribe" not in html

    def test_render_marketing_has_unsubscribe(self):
        """show_unsubscribe=True adds an Unsubscribe link."""
        html = render_email(
            "content_download.html",
            show_unsubscribe=True,
            first_name="John",
            asset_name="CAM Checklist",
            download_url="https://example.com/download",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=abc&t=def",
        )
        assert "Unsubscribe" in html
        assert "https://www.capveri.com/unsubscribe?e=abc&amp;t=def" in html

    def test_render_marketing_without_unsubscribe_url_raises(self):
        """show_unsubscribe=True without an unsubscribe_url is a programmer error."""
        import pytest

        with pytest.raises(ValueError, match="unsubscribe_url"):
            render_email(
                "content_download.html",
                show_unsubscribe=True,
                first_name="John",
                asset_name="CAM Checklist",
                download_url="https://example.com/download",
            )

    def test_render_footer_help_link_always_present(self):
        """Footer Help link is always shown regardless of unsubscribe setting."""
        for show in (True, False):
            kwargs: dict[str, object] = dict(
                tenant_name="T",
                property_name="P",
                period="2024",
                amount="$1",
                portal_url="https://portal.capveri.com/s/1",
            )
            if show:
                kwargs["unsubscribe_url"] = (
                    "https://www.capveri.com/unsubscribe?e=a&t=b"
                )
            html = render_email(
                "statement_notification.html",
                show_unsubscribe=show,
                **kwargs,
            )
            assert "help" in html.lower() or "support" in html.lower()


class TestTemplateRendering:
    """One render test per template — catches missing variable errors."""

    def test_render_welcome(self):
        """welcome.html renders without error."""
        html = render_email(
            "welcome.html",
            show_unsubscribe=False,
            organization_name="Acme Properties",
        )
        assert "Acme Properties" in html

    def test_render_team_invitation(self):
        """team_invitation.html renders with all required variables."""
        html = render_email(
            "team_invitation.html",
            show_unsubscribe=False,
            signup_url="https://capveri.com/team/signup?token=abc",
            inviter_text="Alice Admin",
            organization_name="Acme Corp",
            role_display="Admin",
            expires_at_formatted="January 15, 2025",
        )
        assert "Acme Corp" in html
        assert "Accept Invitation" in html or "abc" in html

    def test_render_team_welcome(self):
        """team_welcome.html renders with all required variables."""
        html = render_email(
            "team_welcome.html",
            show_unsubscribe=False,
            full_name="Bob Smith",
            organization_name="Acme Corp",
            role_display="Member",
            login_url="https://capveri.com/login",
        )
        assert "Bob Smith" in html
        assert "Acme Corp" in html

    def test_render_tenant_invitation(self):
        """tenant_invitation.html renders with all required variables."""
        html = render_email(
            "tenant_invitation.html",
            show_unsubscribe=False,
            signup_url="https://app.capveri.com/tenant/signup?token=xyz",
            expires_at_formatted="June 30, 2025",
        )
        assert "xyz" in html
        assert "June 30, 2025" in html

    def test_render_statement_notification(self):
        """statement_notification.html renders with all required variables."""
        html = render_email(
            "statement_notification.html",
            show_unsubscribe=False,
            tenant_name="Jane Smith",
            property_name="456 Oak Ave",
            period="Q4 2024",
            amount="$8,750.50",
            portal_url="https://portal.capveri.com/statement/456",
        )
        assert "Jane Smith" in html
        assert "456 Oak Ave" in html
        assert "Q4 2024" in html
        assert "$8,750.50" in html

    def test_render_dispute_update(self):
        """dispute_update.html renders with all required variables."""
        html = render_email(
            "dispute_update.html",
            show_unsubscribe=False,
            tenant_name="Alice",
            property_name="789 Pine St",
            dispute_status="Under Review",
            portal_url="https://portal.capveri.com/disputes/123",
        )
        assert "Alice" in html
        assert "Under Review" in html

    def test_render_dispute_notification(self):
        """dispute_notification.html renders with all required variables."""
        html = render_email(
            "dispute_notification.html",
            show_unsubscribe=False,
            admin_name="John Admin",
            tenant_name="Acme Corp",
            category="Expense Error",
            portal_url="https://portal.capveri.com/admin/disputes/789",
        )
        assert "John Admin" in html
        assert "Acme Corp" in html

    def test_render_content_download_with_url(self):
        """content_download.html renders download button when URL is present."""
        html = render_email(
            "content_download.html",
            show_unsubscribe=True,
            first_name="Carol",
            asset_name="CAM Audit Checklist",
            download_url="https://signed.s3.example.com/file.pdf",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=a&t=b",
        )
        assert "Carol" in html
        assert "CAM Audit Checklist" in html
        assert "signed.s3.example.com" in html

    def test_render_content_download_without_url(self):
        """content_download.html renders fallback message when URL is empty."""
        html = render_email(
            "content_download.html",
            show_unsubscribe=True,
            first_name="Carol",
            asset_name="CAM Checklist",
            download_url="",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=a&t=b",
        )
        assert "Carol" in html
        # Should show fallback message, not broken button
        assert (
            "support" in html.lower()
            or "contact" in html.lower()
            or "prepare" in html.lower()
        )

    def test_render_audit_results_with_recovery(self):
        """audit_results.html renders recovery-positive copy when recovery > 0."""
        html = render_email(
            "audit_results.html",
            show_unsubscribe=True,
            organization_name="Apex Properties",
            recovery_amount=12500,
            property_name="123 Main St",
            billing_url="https://app.capveri.com/settings/billing",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=a&t=b",
        )
        assert "12,500" in html or "12500" in html
        assert "123 Main St" in html

    def test_render_audit_results_no_recovery(self):
        """audit_results.html renders clean-audit copy when recovery is 0."""
        html = render_email(
            "audit_results.html",
            show_unsubscribe=True,
            organization_name="Apex Properties",
            recovery_amount=0,
            property_name="456 Oak Ave",
            billing_url="https://app.capveri.com/settings/billing",
            unsubscribe_url="https://www.capveri.com/unsubscribe?e=a&t=b",
        )
        assert "456 Oak Ave" in html
        assert (
            "clean" in html.lower()
            or "no" in html.lower()
            or "subscribe" in html.lower()
        )

    def test_render_forward_email_with_html(self):
        """forward_email.html renders with original html content."""
        html = render_email(
            "forward_email.html",
            show_unsubscribe=False,
            original_from="sender@example.com",
            original_to="angel.campa@capveri.com",
            subject="Help needed",
            original_html="<p>Hello support team</p>",
        )
        assert "sender@example.com" in html
        assert "angel.campa@capveri.com" in html
        assert "Help needed" in html

    def test_render_forward_email_without_html(self):
        """forward_email.html handles empty original_html gracefully."""
        html = render_email(
            "forward_email.html",
            show_unsubscribe=False,
            original_from="sender@example.com",
            original_to="angel.campa@capveri.com",
            subject="Plain text message",
            original_html="",
        )
        assert "sender@example.com" in html
        assert "Plain text message" in html

    def test_render_forward_email_metadata_xss_escaped(self):
        """Metadata fields (original_from, subject) are HTML-escaped by autoescape."""
        html = render_email(
            "forward_email.html",
            show_unsubscribe=False,
            original_from='<script>alert("xss")</script>@example.com',
            original_to="angel.campa@capveri.com",
            subject='<b onclick="evil()">Click me</b>',
            original_html="",
        )
        # Dangerous HTML tags must be escaped, never rendered verbatim
        assert "<script>" not in html
        assert 'onclick="evil()"' not in html
        # Escaped versions confirm the content is present but neutralised
        assert "&lt;script&gt;" in html
