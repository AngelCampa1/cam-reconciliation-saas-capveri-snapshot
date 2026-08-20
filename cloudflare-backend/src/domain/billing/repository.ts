export type ActiveLaunchPhase = {
  code: string | null;
  label: string | null;
  discount_percent: number | null;
  times_redeemed: number;
  max_redemptions: number;
  phase_index: number;
  all_exhausted: boolean;
  ends_at: string | null;
  ends_at_display: string | null;
};

export type CreditBalance = {
  total_purchased: number;
  total_used: number;
  total_remaining: number;
};

export type CreditPack = {
  id: string;
  organization_id: string;
  credits_purchased: number;
  credits_used: number;
  credits_remaining: number;
  unit_price_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  purchased_at: string;
};

export type FreeAuditStatusResponse = {
  has_subscription: boolean;
  has_paused_subscription: boolean;
  has_ever_purchased: boolean;
  credit_balance: CreditBalance;
  free_audit_consumed: boolean;
  can_add_property: boolean;
  can_run_reconciliation: boolean;
  can_view_draft_report: boolean;
  can_download_reports: boolean;
};

export type PlanSelectionInput = {
  plan_id: string;
  billing_period: "annual";
  unit_count: number;
  building_count: number;
};

export type PlanSelectionResponse = {
  plan_id: string | null;
  billing_period: "annual" | null;
  unit_count: number | null;
  building_count: number | null;
  selected_at: string | null;
  checkout_required: boolean;
  has_active_access: boolean;
  has_paused_subscription: boolean;
  subscription_status: string | null;
  trial_days_remaining: number | null;
};

export type UsedFeature = {
  key: string;
  label: string;
  required_tier: string;
  first_used_at: string | null;
  last_used_at: string | null;
};

export type FeatureUsageResponse = {
  used_features: UsedFeature[];
  current_tier: string | null;
};

export type BillingCustomer = {
  stripe_customer_id: string | null;
};

export type OrganizationBillingProfile = {
  name: string;
  billing_email: string | null;
};

export type CheckoutBillingState = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | null;
};

export type Subscription = {
  id: string;
  organization_id: string;
  plan: string;
  status: string;
  pricing_model: string;
  building_count: number;
  unit_count: number | null;
  included_units: number | null;
  unit_overage_count: number | null;
  tier: string | null;
  billing_interval: "monthly" | "annual" | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
  money_back_claimed_at: string | null;
  money_back_refund_id: string | null;
};

export type StripeResumeSubscriptionInput = {
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  updated_at: string;
};

export type CancelReason =
  | "too_expensive"
  | "not_using_enough"
  | "missing_feature"
  | "switching_competitor"
  | "business_closed"
  | "other";

export type SaveOfferType = "discount_20pct_1inv" | "feature_roadmap" | "none";

export type SaveOfferAttempt = {
  id: string;
  organization_id: string;
  cancel_reason: CancelReason;
  other_text: string | null;
  offer_shown: SaveOfferType;
  offer_accepted: boolean | null;
  stripe_coupon_id: string | null;
  created_at: string;
};

export type SaveOfferResponse = {
  attempt_id: string;
  offer_type: SaveOfferType;
  discount_percent: number | null;
};

export type BillingActivationState = {
  plan_id: string | null;
  billing_period: "annual" | null;
  unit_count: number | null;
  building_count: number | null;
  checkout_required: boolean;
};

export type TrialStartInput = PlanSelectionInput & {
  startedAt: string;
  periodEnd: string;
  includedUnits: number;
};

export type Invoice = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  stripe_invoice_id: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  period_start: string;
  period_end: string;
  due_date: string | null;
  paid_at: string | null;
  pdf_url: string | null;
  created_at: string;
};

export type InvoiceListResponse = {
  invoices: Invoice[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
};

export type InvoiceSummaryResponse = {
  total_invoices: number;
  paid_invoices: number;
  open_invoices: number;
  total_paid: number;
  currency: string;
};

export type GuaranteeInvoice = {
  id: string;
  stripe_invoice_id: string | null;
  amount_paid: number;
  currency: string;
  paid_at: string | null;
};

export type GuaranteeEligibilityResponse = {
  eligible: boolean;
  days_remaining: number;
  first_invoice_amount: number | null;
  first_invoice_currency: string;
};

export type GuaranteeClaimResponse = {
  refund_id: string;
  amount_refunded: number;
  currency: string;
};

export class BillingTrialPausedError extends Error {}

export type BillingRepository = {
  getPlanSelection(organizationId: string): Promise<PlanSelectionResponse>;
  savePlanSelection(
    organizationId: string,
    input: PlanSelectionInput,
  ): Promise<PlanSelectionResponse>;
  startTrial(
    organizationId: string,
    input: TrialStartInput,
  ): Promise<PlanSelectionResponse>;
  getFreeAuditStatus(organizationId: string): Promise<FreeAuditStatusResponse>;
  getCredits(organizationId: string): Promise<CreditBalance>;
  getCreditHistory(organizationId: string): Promise<CreditPack[]>;
  getFeatureUsage(organizationId: string): Promise<FeatureUsageResponse>;
  getBillingCustomer(organizationId: string): Promise<BillingCustomer | null>;
  getOrganizationBillingProfile(
    organizationId: string,
  ): Promise<OrganizationBillingProfile | null>;
  getCheckoutBillingState(
    organizationId: string,
  ): Promise<CheckoutBillingState | null>;
  getSubscription(organizationId: string): Promise<Subscription | null>;
  scheduleSubscriptionCancel(
    organizationId: string,
    updatedAt: string,
  ): Promise<Subscription | null>;
  cancelSubscriptionImmediately(
    organizationId: string,
    updatedAt: string,
  ): Promise<Subscription | null>;
  resumeScheduledSubscription(
    organizationId: string,
    updatedAt: string,
  ): Promise<Subscription | null>;
  resumePausedSubscription(
    organizationId: string,
    input: StripeResumeSubscriptionInput,
  ): Promise<Subscription | null>;
  createSaveOfferAttempt(input: {
    organizationId: string;
    reason: CancelReason;
    otherText: string | null;
    offerType: SaveOfferType;
  }): Promise<SaveOfferAttempt>;
  getSaveOfferAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SaveOfferAttempt | null>;
  markSaveOfferAccepted(input: {
    organizationId: string;
    attemptId: string;
    couponId: string;
  }): Promise<void>;
  markCancelAttemptDeclined(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<void>;
  hasLocalSubscription(organizationId: string): Promise<boolean>;
  saveStripeCustomerId(
    organizationId: string,
    customerId: string,
  ): Promise<boolean>;
  getBillingActivation(
    organizationId: string,
  ): Promise<BillingActivationState | null>;
  saveCheckoutActivation(
    organizationId: string,
    input: PlanSelectionInput,
  ): Promise<void>;
  hasRedeemedWinbackOffer(organizationId: string): Promise<boolean>;
  listInvoices(input: {
    organizationId: string;
    status: string | null;
    page: number;
    perPage: number;
  }): Promise<InvoiceListResponse>;
  getInvoice(input: {
    organizationId: string;
    invoiceId: string;
  }): Promise<Invoice | null>;
  getInvoiceSummary(organizationId: string): Promise<InvoiceSummaryResponse>;
  getInvoicePdfUrl(input: {
    organizationId: string;
    invoiceId: string;
  }): Promise<string | null | undefined>;
  getFirstPaidInvoiceForGuarantee(
    organizationId: string,
  ): Promise<GuaranteeInvoice | null>;
  recordGuaranteeClaim(input: {
    organizationId: string;
    refundId: string;
    claimedAt: string;
  }): Promise<boolean>;
  markSubscriptionCanceledForGuarantee(input: {
    organizationId: string;
    updatedAt: string;
  }): Promise<void>;
};
