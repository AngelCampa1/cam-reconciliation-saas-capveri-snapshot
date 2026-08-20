import type {
  AssignableTeamRole,
  CreateTeamInvitationInput,
  InvitedTeamUser,
  TeamInvitation,
  TeamInvitationValidation,
  TeamMember,
  TeamRepository,
} from "./repository";
import { TERMS_HASH, TERMS_VERSION } from "../legal/terms";
import type { SupabaseAdminAuthClient } from "../../adapters/auth/supabase-admin";

export class TeamInputError extends Error {}
export class TeamNotFoundError extends Error {}
export class TeamConflictError extends Error {}
export class TeamInvitationTokenError extends Error {
  constructor(
    public readonly reason: "expired" | "used" | "revoked" | "not_found",
  ) {
    super(reason);
  }
}
export class TeamInvitationAcceptError extends Error {
  constructor(
    public readonly reason:
      | "email_mismatch"
      | "user_not_found"
      | "wrong_org"
      | "role_update_failed"
      | "used",
  ) {
    super(reason);
  }
}

const invitationTtlMs = 7 * 24 * 60 * 60 * 1000;

export async function createTeamInvitationRecord(input: {
  repository: TeamRepository;
  email: string;
  role: AssignableTeamRole;
  invitedBy: string;
  organizationId: string;
  now: Date;
  randomBytes?: (length: number) => Uint8Array;
  randomUuid?: () => string;
}): Promise<TeamInvitation> {
  const email = normalizeEmail(input.email);
  const randomUuid = input.randomUuid ?? (() => crypto.randomUUID());
  const createInput: CreateTeamInvitationInput = {
    id: randomUuid(),
    email,
    role: input.role,
    token: tokenUrlSafe(input.randomBytes ?? defaultRandomBytes),
    invitedBy: input.invitedBy,
    organizationId: input.organizationId,
    expiresAt: new Date(input.now.getTime() + invitationTtlMs).toISOString(),
    createdAt: input.now.toISOString(),
  };

  return input.repository.createInvitation(createInput);
}

export function assertManageableMember(target: TeamMember | null): TeamMember {
  if (!target) {
    throw new TeamNotFoundError("Team member not found");
  }
  if (target.role === "owner") {
    throw new TeamInputError(
      "Organization owners cannot be managed from this page",
    );
  }
  return target;
}

export async function revokePendingInvitation(input: {
  repository: TeamRepository;
  invitationId: string;
  organizationId: string;
  revokedAt: string;
}): Promise<TeamInvitation> {
  const invitation = await input.repository.getInvitation(input);
  if (!invitation) {
    throw new TeamNotFoundError("Invitation not found");
  }
  if (invitation.used_at) {
    throw new TeamInputError("Invitation has already been used");
  }
  if (invitation.revoked_at) {
    throw new TeamInputError("Invitation has already been revoked");
  }
  const revoked = await input.repository.revokeInvitation(input);
  if (!revoked) {
    throw new TeamConflictError("Failed to revoke invitation");
  }
  return revoked;
}

export async function validateTeamInvitationToken(input: {
  repository: TeamRepository;
  token: string;
  now: Date;
}): Promise<TeamInvitationValidation> {
  const token = normalizeInvitationToken(input.token);
  const invitation = await input.repository.getInvitationByToken(token);
  if (!invitation) {
    throw new TeamInvitationTokenError("not_found");
  }
  if (invitation.revoked_at) {
    throw new TeamInvitationTokenError("revoked");
  }
  if (invitation.used_at) {
    throw new TeamInvitationTokenError("used");
  }
  if (Date.parse(invitation.expires_at) < input.now.getTime()) {
    throw new TeamInvitationTokenError("expired");
  }
  return invitation;
}

export async function completeTeamSignup(input: {
  repository: TeamRepository;
  authClient: SupabaseAdminAuthClient;
  token: string;
  password: string;
  fullName: string;
  acceptedTerms: boolean;
  termsVersion: string;
  termsHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  now: Date;
}): Promise<{
  user: InvitedTeamUser;
  accessToken: string;
  refreshToken: string;
}> {
  assertCurrentTermsAcceptance(input);
  const invitation = await validateTeamInvitationToken({
    repository: input.repository,
    token: input.token,
    now: input.now,
  });
  const authUser = await input.authClient.createUser({
    email: invitation.email,
    password: input.password,
    metadata: {
      full_name: input.fullName,
      invited_by: "team_invitation",
      accepted_terms: true,
    },
  });
  const timestamp = input.now.toISOString();
  const user = await input.repository.upsertInvitedUser({
    id: authUser.id,
    organizationId: invitation.organization_id,
    email: invitation.email,
    fullName: input.fullName,
    role: invitation.role,
    timestamp,
  });
  if (!user) {
    throw new TeamConflictError("Failed to create user record");
  }
  await input.repository.recordLegalAcceptance({
    userId: authUser.id,
    organizationId: invitation.organization_id,
    acceptedAt: timestamp,
    source: "team_invitation_signup",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  const marked = await input.repository.markInvitationUsed({
    token: normalizeInvitationToken(input.token),
    organizationId: invitation.organization_id,
    usedByUserId: authUser.id,
    usedAt: timestamp,
  });
  if (!marked) {
    throw new TeamInvitationTokenError("used");
  }
  const session = await input.authClient.signInWithPassword({
    email: invitation.email,
    password: input.password,
  });
  return {
    user: { ...user, organization_name: invitation.organization_name },
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

export async function acceptTeamInvitationForExistingUser(input: {
  repository: TeamRepository;
  token: string;
  userId: string;
  userEmail: string | null;
  now: Date;
}): Promise<string> {
  const invitation = await validateTeamInvitationToken({
    repository: input.repository,
    token: input.token,
    now: input.now,
  });
  if (
    invitation.email.trim().toLowerCase() !==
    input.userEmail?.trim().toLowerCase()
  ) {
    throw new TeamInvitationAcceptError("email_mismatch");
  }
  const user = await input.repository.getUserForInvitationAccept(input.userId);
  if (!user) {
    throw new TeamInvitationAcceptError("user_not_found");
  }
  if (
    user.organization_id &&
    user.organization_id !== invitation.organization_id
  ) {
    throw new TeamInvitationAcceptError("wrong_org");
  }
  const roleUpdated = await input.repository.updateExistingUserInvitationRole({
    userId: input.userId,
    organizationId: invitation.organization_id,
    role: invitation.role,
    updatedAt: input.now.toISOString(),
  });
  // Fail closed: if the role write matched no row (e.g. the user was removed
  // from the org concurrently), do NOT consume the invitation — leave it
  // usable so a retry can apply the role. Mirrors the if(!marked) guard below.
  if (!roleUpdated) {
    throw new TeamInvitationAcceptError("role_update_failed");
  }
  const marked = await input.repository.markInvitationUsed({
    token: normalizeInvitationToken(input.token),
    organizationId: invitation.organization_id,
    usedByUserId: input.userId,
    usedAt: input.now.toISOString(),
  });
  if (!marked) {
    throw new TeamInvitationAcceptError("used");
  }
  return "Team invitation accepted successfully";
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TeamInputError("Invalid email address");
  }
  return email;
}

function normalizeInvitationToken(value: string): string {
  const token = value.trim();
  if (
    token.length < 32 ||
    token.length > 128 ||
    !/^[a-zA-Z0-9_-]+$/u.test(token)
  ) {
    throw new TeamInvitationTokenError("not_found");
  }
  return token;
}

function assertCurrentTermsAcceptance(input: {
  acceptedTerms: boolean;
  termsVersion: string;
  termsHash: string;
}): void {
  if (
    input.acceptedTerms !== true ||
    input.termsVersion !== TERMS_VERSION ||
    input.termsHash !== TERMS_HASH
  ) {
    throw new TeamInputError(
      "You must accept the current CapVeri Terms of Service.",
    );
  }
}

function tokenUrlSafe(randomBytes: (length: number) => Uint8Array): string {
  const bytes = randomBytes(32);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}
