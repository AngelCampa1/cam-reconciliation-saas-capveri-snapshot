import type { SupabaseAdminAuthClient } from "../../adapters/auth/supabase-admin";
import { TERMS_HASH, TERMS_VERSION } from "../legal/terms";
import type {
  CreateTenantInvitationInput,
  TenantAuthRepository,
  TenantInvitation,
  TenantUser,
} from "./repository";

export class TenantAuthInputError extends Error {}
export class TenantAuthNotFoundError extends Error {}
export class TenantAuthConflictError extends Error {}
export class TenantInvitationTokenError extends Error {
  constructor(
    public readonly reason: "expired" | "used" | "revoked" | "not_found",
  ) {
    super(reason);
  }
}

const invitationTtlMs = 7 * 24 * 60 * 60 * 1000;

export async function createTenantInvitationRecord(input: {
  repository: TenantAuthRepository;
  email: string;
  leaseId: string;
  invitedBy: string;
  organizationId: string;
  now: Date;
  randomBytes?: (length: number) => Uint8Array;
  randomUuid?: () => string;
}): Promise<TenantInvitation> {
  const leaseExists = await input.repository.leaseBelongsToOrganization({
    leaseId: input.leaseId,
    organizationId: input.organizationId,
  });
  if (!leaseExists) {
    throw new TenantAuthNotFoundError("Lease not found");
  }
  const createInput: CreateTenantInvitationInput = {
    id: (input.randomUuid ?? defaultRandomUuid)(),
    email: normalizeEmail(input.email),
    leaseId: input.leaseId,
    token: tokenUrlSafe(input.randomBytes ?? defaultRandomBytes),
    invitedBy: input.invitedBy,
    organizationId: input.organizationId,
    expiresAt: new Date(input.now.getTime() + invitationTtlMs).toISOString(),
    createdAt: input.now.toISOString(),
  };
  return input.repository.createInvitation(createInput);
}

export async function validateTenantInvitationToken(input: {
  repository: TenantAuthRepository;
  token: string;
  now: Date;
}): Promise<TenantInvitation> {
  const token = normalizeInvitationToken(input.token);
  const invitation = await input.repository.getInvitationByToken(token);
  if (!invitation) {
    throw new TenantInvitationTokenError("not_found");
  }
  if (invitation.is_revoked) {
    throw new TenantInvitationTokenError("revoked");
  }
  if (invitation.used_at) {
    throw new TenantInvitationTokenError("used");
  }
  if (Date.parse(invitation.expires_at) < input.now.getTime()) {
    throw new TenantInvitationTokenError("expired");
  }
  return invitation;
}

export async function completeTenantSignup(input: {
  repository: TenantAuthRepository;
  authClient: SupabaseAdminAuthClient;
  token: string;
  password: string;
  contactName: string;
  acceptedTerms: boolean;
  termsVersion: string;
  termsHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  now: Date;
  randomUuid?: () => string;
}): Promise<{
  tenantUser: TenantUser;
  accessToken: string;
  refreshToken: string;
}> {
  assertCurrentTermsAcceptance(input);
  const invitation = await validateTenantInvitationToken({
    repository: input.repository,
    token: input.token,
    now: input.now,
  });
  const authUser = await input.authClient.createUser({
    email: invitation.email,
    password: input.password,
    metadata: {
      contact_name: input.contactName,
      invited_by: "tenant_portal",
      accepted_terms: true,
    },
  });
  const timestamp = input.now.toISOString();
  await input.repository.upsertPortalUser({
    userId: authUser.id,
    organizationId: invitation.organization_id,
    email: invitation.email,
    contactName: input.contactName,
    timestamp,
  });
  const tenantUser = await input.repository.createTenantUser({
    id: (input.randomUuid ?? defaultRandomUuid)(),
    userId: authUser.id,
    organizationId: invitation.organization_id,
    contactName: input.contactName,
    contactEmail: invitation.email,
    createdAt: timestamp,
  });
  if (!tenantUser) {
    throw new TenantAuthConflictError("Failed to create tenant user");
  }
  await input.repository.recordLegalAcceptance({
    userId: authUser.id,
    organizationId: invitation.organization_id,
    acceptedAt: timestamp,
    source: "tenant_invitation_signup",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  await input.repository.linkTenantToLease({
    tenantUserId: tenantUser.id,
    leaseId: invitation.lease_id,
    createdAt: timestamp,
  });
  const marked = await input.repository.markInvitationUsed({
    token: normalizeInvitationToken(input.token),
    organizationId: invitation.organization_id,
    usedAt: timestamp,
  });
  if (!marked) {
    throw new TenantInvitationTokenError("used");
  }
  const session = await input.authClient.signInWithPassword({
    email: invitation.email,
    password: input.password,
  });
  return {
    tenantUser,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TenantAuthInputError("Invalid email address");
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
    throw new TenantInvitationTokenError("not_found");
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
    throw new TenantAuthInputError(
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

function defaultRandomUuid(): string {
  return crypto.randomUUID();
}
