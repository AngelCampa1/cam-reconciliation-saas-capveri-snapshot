"""Stripe billing configuration."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.services.billing.generated_plan_tiers import LAUNCH_OFFER

# Identifies this app in shared Stripe webhook events.
# Each app in the Ventora Labs Stripe account uses a unique identifier
# so webhook handlers can ignore events from other apps.
APP_IDENTIFIER = "capveri"


class StripeSettings(BaseSettings):
    """Stripe configuration from environment."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    stripe_secret_key: str
    stripe_publishable_key: str
    stripe_webhook_secret: str

    # Workflow-maturity self-serve pricing. Annual IDs are the only active model.
    stripe_price_id_reconcile_annual: str = "price_reconcile_annual"
    stripe_product_id_reconcile: str = ""
    stripe_price_id_control_annual: str = "price_control_annual"
    stripe_price_id_defend_annual: str = "price_defend_annual"

    # Deprecated hybrid per-unit self-serve pricing. Annual legacy IDs remain
    # for existing Stripe subscriptions that still emit webhook events.
    stripe_price_id_growth_base_annual: str = "price_growth_base_annual"
    stripe_price_id_unit_overage_annual: str = "price_unit_overage_annual"

    # Growth pricing (legacy current model before per-unit switch)
    stripe_price_id_growth_v2_annual: str = "price_growth_v2_annual"
    # Retained to avoid env-var validation errors on running instances that
    # still have these vars set. No longer consumed by _map_price_to_plan —
    # portfolio Stripe events fall through to the growth_v2 default.
    stripe_price_id_portfolio_annual: str = "price_portfolio_annual"

    # Deprecated legacy growth alias — kept for webhook backward compat
    stripe_price_id_growth_annual: str = "price_growth_annual"

    stripe_save_offer_coupon_id_annual: str = "SAVE20_1INV_ANNUAL"
    stripe_free_audit_coupon_offer_50: str = "FREEAUDIT50_ANNUAL"
    stripe_free_audit_coupon_offer_free: str = "FREEAUDIT100_ANNUAL"
    stripe_80off_coupon_id: str = LAUNCH_OFFER["code"]
    # Deprecated launch coupon env names remain accepted during rollout but
    # resolve to the active limited offer.
    stripe_launch50_coupon_id: str = LAUNCH_OFFER["code"]
    stripe_launch30_coupon_id: str = LAUNCH_OFFER["code"]
    stripe_launch15_coupon_id: str = LAUNCH_OFFER["code"]

    @property
    def is_test_mode(self) -> bool:
        """Check if using Stripe test mode."""
        return self.stripe_secret_key.startswith("sk_test_")


@lru_cache
def get_stripe_settings() -> StripeSettings:
    """Get Stripe settings from environment."""
    return StripeSettings()
