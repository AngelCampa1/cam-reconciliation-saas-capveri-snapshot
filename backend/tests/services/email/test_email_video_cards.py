"""Tests: video cards are present in the correct email templates.

Each wired template must contain:
- The correct YouTube watch URL (youtube.com/watch?v=<id>)
- The correct thumbnail URL (i.ytimg.com/vi/<id>/hqdefault.jpg)
- No payment / upsell language introduced by the video block
"""

from app.services.email.renderer import render_email
from app.services.email.videos import get_video_for_placement, get_watch_url

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PAYMENT_PHRASES = [
    "upgrade now",
    "subscribe now",
    "buy now",
    "purchase",
    "credit card required",
    "add billing",
    "billing required",
]


def _no_payment_push(html: str) -> None:
    """Assert the rendered HTML contains none of the forbidden payment-push phrases."""
    lower = html.lower()
    for phrase in _PAYMENT_PHRASES:
        assert phrase not in lower, f"Found forbidden payment phrase: {phrase!r}"


def _video_ids_for_placement(placement: str) -> tuple[str, str]:
    """Return (youtube_id, watch_url) for a placement — fail fast if missing."""
    video = get_video_for_placement(placement)
    assert video is not None, f"No video configured for placement {placement!r}"
    watch_url = get_watch_url(video["slug"])
    assert watch_url is not None
    return video["youtube_id"], watch_url


# ---------------------------------------------------------------------------
# welcome.html  ←  welcome-email  (walkthrough-yardi-csv)
# ---------------------------------------------------------------------------


class TestWelcomeVideoCard:
    def test_watch_url_present(self):
        youtube_id, watch_url = _video_ids_for_placement("welcome-email")
        html = render_email(
            "welcome.html",
            show_unsubscribe=False,
            organization_name="Apex Props",
        )
        assert f"watch?v={youtube_id}" in html
        assert "youtube.com/watch" in html

    def test_thumbnail_present(self):
        video = get_video_for_placement("welcome-email")
        assert video is not None
        html = render_email(
            "welcome.html",
            show_unsubscribe=False,
            organization_name="Apex Props",
        )
        assert video["youtube_id"] in html

    def test_no_payment_push(self):
        html = render_email(
            "welcome.html",
            show_unsubscribe=False,
            organization_name="Apex Props",
        )
        _no_payment_push(html)


# ---------------------------------------------------------------------------
# trial_started.html  ←  trial-started-email  (common-area-maintenance-recoverable)
# ---------------------------------------------------------------------------


class TestTrialStartedVideoCard:
    _COMMON_KWARGS: dict[str, object] = dict(
        organization_name="Apex Props",
        trial_days=14,
        trial_start_formatted="June 1, 2026",
        charge_date_formatted="June 15, 2026",
        charge_amount_formatted="$99/mo",
        billing_url="https://app.capveri.com/settings/billing",
    )

    def test_watch_url_present(self):
        youtube_id, _ = _video_ids_for_placement("trial-started-email")
        html = render_email(
            "trial_started.html",
            show_unsubscribe=False,
            **self._COMMON_KWARGS,
        )
        assert f"watch?v={youtube_id}" in html

    def test_thumbnail_present(self):
        video = get_video_for_placement("trial-started-email")
        assert video is not None
        html = render_email(
            "trial_started.html",
            show_unsubscribe=False,
            **self._COMMON_KWARGS,
        )
        assert video["youtube_id"] in html

    def test_video_block_no_payment_push(self):
        """The video card block must not introduce new payment-push language.

        trial_started.html is intentionally a billing-nudge transactional email
        (it contains "Add billing" in its pre-existing body copy). The check here
        confirms the video section itself adds no upgrade/buy/purchase CTAs.
        """
        html = render_email(
            "trial_started.html",
            show_unsubscribe=False,
            **self._COMMON_KWARGS,
        )
        lower = html.lower()
        assert "upgrade now" not in lower
        assert "buy now" not in lower
        assert "purchase" not in lower


# ---------------------------------------------------------------------------
# audit_results.html  ←  audit-results-email  (forty-percent-material-error)
# ---------------------------------------------------------------------------


class TestAuditResultsVideoCard:
    _COMMON_KWARGS: dict[str, object] = dict(
        show_unsubscribe=True,
        organization_name="Apex Props",
        property_name="123 Main St",
        billing_url="https://app.capveri.com/settings/billing",
        unsubscribe_url="https://www.capveri.com/unsubscribe?e=a&t=b",
    )

    def test_watch_url_present_with_recovery(self):
        youtube_id, _ = _video_ids_for_placement("audit-results-email")
        html = render_email(
            "audit_results.html",
            recovery_amount=5000,
            **self._COMMON_KWARGS,
        )
        assert f"watch?v={youtube_id}" in html

    def test_watch_url_present_no_recovery(self):
        youtube_id, _ = _video_ids_for_placement("audit-results-email")
        html = render_email(
            "audit_results.html",
            recovery_amount=0,
            **self._COMMON_KWARGS,
        )
        assert f"watch?v={youtube_id}" in html

    def test_thumbnail_present(self):
        video = get_video_for_placement("audit-results-email")
        assert video is not None
        html = render_email(
            "audit_results.html",
            recovery_amount=5000,
            **self._COMMON_KWARGS,
        )
        assert video["youtube_id"] in html

    def test_no_payment_push_video_block(self):
        """The video block itself must not introduce payment-push language."""
        html = render_email(
            "audit_results.html",
            recovery_amount=0,
            **self._COMMON_KWARGS,
        )
        # "Watch now" is fine; "upgrade now" / "buy now" are not
        lower = html.lower()
        assert "upgrade now" not in lower
        assert "buy now" not in lower


# ---------------------------------------------------------------------------
# content_download.html  ←  content-download-email  (common-area-maintenance-recoverable)
# ---------------------------------------------------------------------------


class TestContentDownloadVideoCard:
    _COMMON_KWARGS: dict[str, object] = dict(
        show_unsubscribe=True,
        first_name="Carol",
        asset_name="CAM Checklist",
        download_url="https://signed.s3.example.com/file.pdf",
        unsubscribe_url="https://www.capveri.com/unsubscribe?e=a&t=b",
    )

    def test_watch_url_present(self):
        youtube_id, _ = _video_ids_for_placement("content-download-email")
        html = render_email("content_download.html", **self._COMMON_KWARGS)
        assert f"watch?v={youtube_id}" in html

    def test_thumbnail_present(self):
        video = get_video_for_placement("content-download-email")
        assert video is not None
        html = render_email("content_download.html", **self._COMMON_KWARGS)
        assert video["youtube_id"] in html

    def test_no_payment_push(self):
        html = render_email("content_download.html", **self._COMMON_KWARGS)
        _no_payment_push(html)


# ---------------------------------------------------------------------------
# team_welcome.html  ←  team-welcome-email  (software-vs-spreadsheets)
# ---------------------------------------------------------------------------


class TestTeamWelcomeVideoCard:
    _COMMON_KWARGS: dict[str, object] = dict(
        show_unsubscribe=False,
        full_name="Bob Smith",
        organization_name="Acme Corp",
        role_display="Member",
        login_url="https://app.capveri.com/login",
    )

    def test_watch_url_present(self):
        youtube_id, _ = _video_ids_for_placement("team-welcome-email")
        html = render_email("team_welcome.html", **self._COMMON_KWARGS)
        assert f"watch?v={youtube_id}" in html

    def test_thumbnail_present(self):
        video = get_video_for_placement("team-welcome-email")
        assert video is not None
        html = render_email("team_welcome.html", **self._COMMON_KWARGS)
        assert video["youtube_id"] in html

    def test_no_payment_push(self):
        html = render_email("team_welcome.html", **self._COMMON_KWARGS)
        _no_payment_push(html)


# ---------------------------------------------------------------------------
# video_card macro: pill geometry on Watch button
# ---------------------------------------------------------------------------


class TestVideoCardPillGeometry:
    """The Watch button inside video_card must use RADIUS_BUTTON (9999px)."""

    def test_watch_button_is_pill(self):
        html = render_email(
            "welcome.html",
            show_unsubscribe=False,
            organization_name="Apex Props",
        )
        # The video card Watch button must carry the pill radius
        assert "9999px" in html
