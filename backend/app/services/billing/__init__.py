"""
Billing and subscription services.
"""

from .config import StripeSettings, get_stripe_settings
from .credits import (
    InsufficientCreditsError,
    add_credits,
    consume_credit,
    get_credit_balance,
    has_ever_purchased,
)
from .customers import CustomerService
from .entitlements import (
    get_current_tier,
    has_feature_access,
    has_full_access,
    has_noi_board_access,
    has_tax_protest_access,
)
from .generated_plan_tiers import (
    LAUNCH_OFFER,
    TIERS,
    TRIAL_DAYS,
    get_launch_offer_annual_cents,
    has_feature,
)
from .payment_methods import PaymentMethodService
from .plans import (
    get_features_for_plan,
    get_stripe_price_id_for_tier,
    get_tier_details,
)
from .quota_enforcement import QuotaEnforcementService
from .save_offers import SaveOfferService
from .stripe_client import StripeService, get_stripe_client
from .subscriptions import SubscriptionService

__all__ = [
    "StripeSettings",
    "get_stripe_settings",
    "StripeService",
    "get_stripe_client",
    "CustomerService",
    "PaymentMethodService",
    "SaveOfferService",
    "SubscriptionService",
    # Subscription tier model
    "TIERS",
    "TRIAL_DAYS",
    "LAUNCH_OFFER",
    "get_tier_details",
    "get_features_for_plan",
    "get_stripe_price_id_for_tier",
    "has_feature",
    "get_launch_offer_annual_cents",
    # Entitlements
    "has_full_access",
    "get_current_tier",
    "has_feature_access",
    "QuotaEnforcementService",
    "has_noi_board_access",
    "has_tax_protest_access",
    # Credit pack model (deprecated, retained for existing balances)
    "InsufficientCreditsError",
    "get_credit_balance",
    "has_ever_purchased",
    "add_credits",
    "consume_credit",
]
