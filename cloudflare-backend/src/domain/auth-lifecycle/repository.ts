export type SignupNurtureEmailType =
  | "day_1_confirm_plan"
  | "day_2_add_property"
  | "day_3_upload_gl"
  | "day_4_check_sample_report"
  | "day_5_run_reconciliation"
  | "day_6_add_billing"
  | "day_7_get_help";

export type SignupNurtureEvent = {
  organizationId: string;
  userId: string;
  email: string;
  organizationName: string;
  emailType: SignupNurtureEmailType;
  status: "pending";
  scheduledAt: string;
};

export type AccountDeletionBlocker = {
  tableName: string;
  columnName: string;
  label: string;
};

export type AuthLifecycleRepository = {
  getOrganizationName(organizationId: string): Promise<string | null>;
  recordLegalAcceptance(input: {
    userId: string;
    organizationId: string;
    acceptedAt: string;
    source: "owner_signup" | "authenticated_legal_gate";
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void>;
  upsertSignupNurtureEvents(events: SignupNurtureEvent[]): Promise<void>;
  countOrganizationUsers(organizationId: string): Promise<number>;
  countOtherOrganizationAdmins(input: {
    organizationId: string;
    userId: string;
  }): Promise<number>;
  countRows(input: {
    tableName: string;
    columnName: string;
    value: string;
  }): Promise<number>;
};
