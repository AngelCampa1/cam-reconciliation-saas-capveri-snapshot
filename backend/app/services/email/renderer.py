"""Jinja2 email renderer backed by design token constants."""

import os
from datetime import UTC, datetime

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import get_settings
from app.services.billing.generated_plan_tiers import (
    TIERS,
    TRIAL_DAYS,
    TRIAL_REMINDER_DAYS,
    get_launch_offer_annual_cents,
)
from app.services.email import tokens as t
from app.services.email.videos import get_video_for_placement, get_watch_url

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")

_env = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=select_autoescape(["html"]),
)


def _video_context_for_placement(placement: str) -> dict[str, str] | None:
    """Return a flat dict of video fields for a placement, ready for templates."""
    video = get_video_for_placement(placement)
    if video is None:
        return None
    watch_url = get_watch_url(video["slug"])
    if watch_url is None:
        return None
    return {
        "thumbnail_url": video["thumbnail_url"],
        "watch_url": watch_url,
        "title": video["title"],
        "short_label": video["short_label"],
        "description": video["description"],
    }


def _popular_launch_offer_annual_dollars() -> int:
    billable_tiers = [tier for tier in TIERS if tier["base_annual"] is not None]
    tier_id = next(
        (tier["id"] for tier in billable_tiers if tier["popular"]),
        billable_tiers[0]["id"],
    )
    cents = get_launch_offer_annual_cents(tier_id)
    if cents is None:
        raise ValueError(f"Missing launch offer pricing for tier {tier_id}")
    return cents // 100


def render_email(
    template_name: str, show_unsubscribe: bool = False, **kwargs: object
) -> str:
    """Render a named email template with brand tokens injected.

    Args:
        template_name: Filename inside templates/ directory (e.g. 'welcome.html').
        show_unsubscribe: When True, marketing footer with unsubscribe link is shown.
        **kwargs: Template-specific variables forwarded to the Jinja2 context.

    Returns:
        Rendered HTML string ready to send via Resend.
    """
    if show_unsubscribe and not kwargs.get("unsubscribe_url"):
        raise ValueError(
            f"render_email({template_name!r}, show_unsubscribe=True) requires "
            "an 'unsubscribe_url' kwarg with a tokenized URL."
        )

    template = _env.get_template(template_name)
    settings = get_settings()
    app_base_url = settings.app_base_url.rstrip("/")
    marketing_base_url = settings.marketing_base_url.rstrip("/")
    context = {
        "t": t,
        "logo_url": os.environ.get("EMAIL_LOGO_URL", settings.email_logo_url),
        "app_base_url": app_base_url,
        "marketing_base_url": marketing_base_url,
        "admin_email": settings.admin_notification_email,
        "show_unsubscribe": show_unsubscribe,
        "current_year": datetime.now(UTC).year,
        "findings_url": f"{app_base_url}/dashboard",
        "reconciliations_url": f"{app_base_url}/reconciliations",
        "register_url": f"{app_base_url}/auth/register",
        "roi_divisor": _popular_launch_offer_annual_dollars(),
        "trial_days": TRIAL_DAYS,
        "trial_reminder_days": TRIAL_REMINDER_DAYS,
        # Video cards: pre-fetched by placement so templates need no imports.
        # Each value is None when the placement has no video configured.
        "video_welcome": _video_context_for_placement("welcome-email"),
        "video_trial_started": _video_context_for_placement("trial-started-email"),
        "video_audit_results": _video_context_for_placement("audit-results-email"),
        "video_content_download": _video_context_for_placement(
            "content-download-email"
        ),
        "video_team_welcome": _video_context_for_placement("team-welcome-email"),
    }
    context.update(kwargs)
    return template.render(**context)
