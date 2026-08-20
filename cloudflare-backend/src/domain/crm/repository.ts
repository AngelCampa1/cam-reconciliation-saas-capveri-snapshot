export type CrmLifecycleStage =
  | "lead"
  | "trial_signup"
  | "trial_active"
  | "trial_paused"
  | "customer";

export type CrmEmailSubscriptionStatus = "subscribed" | "unsubscribed";

export type CrmEventInput = {
  email: string;
  eventName: string;
  eventSource: string;
  lifecycleStage: CrmLifecycleStage;
  nextStep: string;
  occurredAt: string;
  userId?: string | null;
  organizationId?: string | null;
  contentLeadId?: string | null;
  emailSubscriptionStatus?: CrmEmailSubscriptionStatus;
  metadata: Record<string, unknown>;
};

export type CrmRepository = {
  recordEvent(input: CrmEventInput): Promise<void>;
};
