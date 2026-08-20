import { TERMS_HASH, TERMS_VERSION } from "../legal/terms";
import type {
  AccountDeletionBlocker,
  AuthLifecycleRepository,
  SignupNurtureEvent,
} from "./repository";

export class LegalAcceptanceError extends Error {}
export class AccountDeletionBlockedError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export const SIGNUP_NURTURE_SCHEDULE = [
  ["day_1_confirm_plan", 1],
  ["day_2_add_property", 2],
  ["day_3_upload_gl", 3],
  ["day_4_check_sample_report", 4],
  ["day_5_run_reconciliation", 5],
  ["day_6_add_billing", 6],
  ["day_7_get_help", 7],
] as const;

const accountDeletionBlockerRows = [
  ["legal_acceptances", "user_id", "legal acceptance history"],
  ["tenant_users", "user_id", "tenant portal profile"],
  ["tenant_invitations", "invited_by", "tenant invitations"],
  ["team_member_invitations", "invited_by", "team invitations"],
  ["team_member_invitations", "used_by_user_id", "accepted team invitations"],
  ["audit_requests", "assigned_to", "assigned audit requests"],
  ["audit_log", "changed_by", "audit log entries"],
  ["documents", "verified_by", "document verification history"],
  ["documents", "rejected_by", "document rejection history"],
  ["reconciliation_snapshots", "finalized_by_user_id", "finalized snapshots"],
  ["column_mappings", "created_by", "column mappings"],
  ["lease_term_versions", "created_by", "lease term versions"],
  ["disputes", "assigned_to", "assigned disputes"],
  ["disputes", "resolved_by", "resolved disputes"],
  ["dispute_comments", "author_id", "dispute comments"],
  ["dispute_attachments", "uploaded_by", "dispute attachments"],
  ["gl_analysis_results", "ran_by_user_id", "GL analysis history"],
  [
    "gl_analysis_results",
    "dismissed_by_user_id",
    "dismissed GL analysis history",
  ],
  ["capex_flags", "reviewed_by_user_id", "CapEx review history"],
] as const;

export const ACCOUNT_DELETION_BLOCKERS: readonly AccountDeletionBlocker[] =
  accountDeletionBlockerRows.map(([tableName, columnName, label]) => ({
    tableName,
    columnName,
    label,
  }));

export function assertCurrentTermsAcceptance(input: {
  acceptedTerms: boolean;
  termsVersion: string;
  termsHash: string;
}): void {
  if (
    input.acceptedTerms !== true ||
    input.termsVersion !== TERMS_VERSION ||
    input.termsHash !== TERMS_HASH
  ) {
    throw new LegalAcceptanceError(
      "You must accept the current CapVeri Terms of Service.",
    );
  }
}

export async function recordCurrentTermsAcceptance(input: {
  repository: AuthLifecycleRepository;
  userId: string;
  organizationId: string;
  acceptedTerms: boolean;
  termsVersion: string;
  termsHash: string;
  source: "owner_signup" | "authenticated_legal_gate";
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  assertCurrentTermsAcceptance(input);
  await input.repository.recordLegalAcceptance({
    userId: input.userId,
    organizationId: input.organizationId,
    acceptedAt: input.acceptedAt,
    source: input.source,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

export function buildSignupNurtureEvents(input: {
  organizationId: string;
  userId: string;
  email: string;
  organizationName: string;
  now: Date;
}): SignupNurtureEvent[] {
  return SIGNUP_NURTURE_SCHEDULE.map(([emailType, days]) => ({
    organizationId: input.organizationId,
    userId: input.userId,
    email: input.email,
    organizationName: input.organizationName,
    emailType,
    status: "pending",
    scheduledAt: new Date(
      input.now.getTime() + days * 24 * 60 * 60 * 1000,
    ).toISOString(),
  }));
}

export async function assertAccountCanBeDeleted(input: {
  repository: AuthLifecycleRepository;
  userId: string;
  organizationId: string;
  role: string;
}): Promise<void> {
  const orgUserCount = await input.repository.countOrganizationUsers(
    input.organizationId,
  );
  if (orgUserCount <= 1) {
    throw new AccountDeletionBlockedError(
      "Add another organization user or contact support before deleting the last account in this organization.",
    );
  }

  if (input.role === "owner" || input.role === "admin") {
    const otherAdmins = await input.repository.countOtherOrganizationAdmins({
      organizationId: input.organizationId,
      userId: input.userId,
    });
    if (otherAdmins <= 0) {
      throw new AccountDeletionBlockedError(
        "Add another owner or admin before deleting this account so the organization keeps an administrator.",
      );
    }
  }

  for (const blocker of ACCOUNT_DELETION_BLOCKERS) {
    const rows = await input.repository.countRows({
      tableName: blocker.tableName,
      columnName: blocker.columnName,
      value: input.userId,
    });
    if (rows > 0) {
      throw new AccountDeletionBlockedError(
        `This account is linked to ${blocker.label}. Contact support so CapVeri can preserve audit history before deletion.`,
      );
    }
  }
}
