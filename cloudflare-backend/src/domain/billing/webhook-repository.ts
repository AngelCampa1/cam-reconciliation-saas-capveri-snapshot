export type StripeEventClaim = {
  id: string;
};

export type SubscriptionSnapshot = {
  organizationId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  plan: string;
  tier: string;
  status: string;
  pricingModel: string;
  buildingCount: number;
  unitCount: number | null;
  includedUnits: number | null;
  unitOverageCount: number | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  // Stripe event.created (ISO 8601) of the event that produced this snapshot.
  // Null when the source event carried no usable timestamp. Used to ignore
  // out-of-order / redelivered stale webhook events.
  eventTs: string | null;
};

export type SubscriptionUpdateSnapshot = Omit<
  SubscriptionSnapshot,
  "organizationId" | "currentPeriodStart" | "currentPeriodEnd"
> & {
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
};

export type InvoiceSnapshot = {
  organizationId: string;
  subscriptionId: string | null;
  stripeInvoiceId: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  pdfUrl: string | null;
  hostedInvoiceUrl: string | null;
};

export type TrialEmailType =
  | "trial_started"
  | "trial_ending_soon"
  | "trial_paused";

export type TrialEmailClaim = {
  messageId: string;
  recipient: string;
  organizationName: string;
};

export type StripeWebhookRepository = {
  claimWebhookEvent(
    stripeEventId: string,
    eventType: string,
  ): Promise<StripeEventClaim | null>;
  completeWebhookEvent(stripeEventId: string): Promise<void>;
  releaseWebhookEvent(stripeEventId: string): Promise<void>;
  findOrganizationIdByStripeCustomer(
    stripeCustomerId: string,
  ): Promise<string | null>;
  findSubscriptionIdByStripeSubscription(
    stripeSubscriptionId: string,
  ): Promise<string | null>;
  upsertSubscription(snapshot: SubscriptionSnapshot): Promise<void>;
  updateSubscriptionByStripeId(
    stripeSubscriptionId: string,
    snapshot: SubscriptionUpdateSnapshot,
  ): Promise<void>;
  markSubscriptionCanceled(
    stripeSubscriptionId: string,
    eventTs: string | null,
  ): Promise<void>;
  markSubscriptionPastDue(
    stripeSubscriptionId: string,
    eventTs: string | null,
  ): Promise<void>;
  markCheckoutComplete(organizationId: string): Promise<void>;
  upsertInvoice(snapshot: InvoiceSnapshot): Promise<void>;
  invoiceExists(stripeInvoiceId: string): Promise<boolean>;
  markInvoicePaid(input: {
    stripeInvoiceId: string;
    amountPaid: number;
    pdfUrl: string | null;
    hostedInvoiceUrl: string | null;
  }): Promise<void>;
  markInvoiceOpen(stripeInvoiceId: string): Promise<void>;
  insertAuditCredits(input: {
    organizationId: string;
    creditsPurchased: number;
    unitPriceCents: number;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string | null;
  }): Promise<"inserted" | "duplicate">;
  redeemWinbackOffer(input: {
    organizationId: string;
    offerTier: string;
  }): Promise<void>;
  claimTrialEmail(input: {
    organizationId: string;
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
    stripeEventId: string | null;
  }): Promise<TrialEmailClaim | null>;
  completeTrialEmail(input: {
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
    providerMessageId: string;
  }): Promise<void>;
  releaseTrialEmail(input: {
    stripeSubscriptionId: string;
    emailType: TrialEmailType;
  }): Promise<void>;
};
