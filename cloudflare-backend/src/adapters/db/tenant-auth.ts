import {
  TERMS_DOCUMENT_TYPE,
  TERMS_HASH,
  TERMS_VERSION,
} from "../../domain/legal/terms";
import type {
  CreateTenantInvitationInput,
  TenantAuthRepository,
  TenantInvitation,
  TenantUser,
} from "../../domain/tenant-auth/repository";
import type { PostgresExecutor } from "./postgres";

export class PostgresTenantAuthRepository implements TenantAuthRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async getInvitationByToken(token: string): Promise<TenantInvitation | null> {
    const result = await this.executor.query<TenantInvitation>(
      [
        `select ${invitationColumns()}`,
        "from tenant_invitations",
        "where token = $1",
        "limit 1",
      ].join(" "),
      [token],
    );
    return result.rows[0] ?? null;
  }

  async createInvitation(
    input: CreateTenantInvitationInput,
  ): Promise<TenantInvitation> {
    const result = await this.executor.query<TenantInvitation>(
      [
        "insert into tenant_invitations",
        "(id, email, lease_id, token, organization_id, invited_by, expires_at, created_at, used_at, is_revoked)",
        "values ($1, $2, $3, $4, $5, $6, $7, $8, null, false)",
        invitationReturning(),
      ].join(" "),
      [
        input.id,
        input.email,
        input.leaseId,
        input.token,
        input.organizationId,
        input.invitedBy,
        input.expiresAt,
        input.createdAt,
      ],
    );
    const invitation = result.rows[0];
    if (!invitation) {
      throw new Error("Failed to create tenant invitation");
    }
    return invitation;
  }

  async leaseBelongsToOrganization(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      [
        "select leases.id",
        "from leases",
        "join properties on properties.id = leases.property_id",
        "where leases.id = $1",
        "and properties.organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.leaseId, input.organizationId],
    );
    return result.rows.length > 0;
  }

  async upsertPortalUser(input: {
    userId: string;
    organizationId: string;
    email: string;
    contactName: string;
    timestamp: string;
  }): Promise<void> {
    await this.executor.query(
      [
        "insert into users",
        "(id, organization_id, email, full_name, role, created_at, updated_at)",
        "values ($1, $2, $3, $4, 'tenant', $5, $5)",
        "on conflict (id) do update set",
        "organization_id = excluded.organization_id,",
        "email = excluded.email,",
        "full_name = excluded.full_name,",
        "role = excluded.role,",
        "updated_at = excluded.updated_at",
      ].join(" "),
      [
        input.userId,
        input.organizationId,
        input.email,
        input.contactName,
        input.timestamp,
      ],
    );
  }

  async createTenantUser(input: {
    id: string;
    userId: string;
    organizationId: string;
    contactName: string;
    contactEmail: string;
    createdAt: string;
  }): Promise<TenantUser | null> {
    const result = await this.executor.query<TenantUser>(
      [
        "insert into tenant_users",
        "(id, user_id, organization_id, contact_name, contact_email, created_at)",
        "values ($1, $2, $3, $4, $5, $6)",
        tenantUserReturning(),
      ].join(" "),
      [
        input.id,
        input.userId,
        input.organizationId,
        input.contactName,
        input.contactEmail,
        input.createdAt,
      ],
    );
    return result.rows[0] ?? null;
  }

  async linkTenantToLease(input: {
    tenantUserId: string;
    leaseId: string;
    createdAt: string;
  }): Promise<void> {
    await this.executor.query(
      [
        "insert into tenant_lease_links",
        "(tenant_user_id, lease_id, created_at)",
        "values ($1, $2, $3)",
      ].join(" "),
      [input.tenantUserId, input.leaseId, input.createdAt],
    );
  }

  async recordLegalAcceptance(input: {
    userId: string;
    organizationId: string;
    acceptedAt: string;
    source: string;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await this.executor.query(
      [
        "insert into legal_acceptances",
        "(user_id, organization_id, document_type, document_version, document_hash,",
        "accepted_at, ip_address, user_agent, source, metadata)",
        "values ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9, '{}'::jsonb)",
      ].join(" "),
      [
        input.userId,
        input.organizationId,
        TERMS_DOCUMENT_TYPE,
        TERMS_VERSION,
        TERMS_HASH,
        input.acceptedAt,
        input.ipAddress,
        input.userAgent,
        input.source,
      ],
    );
  }

  async markInvitationUsed(input: {
    token: string;
    organizationId: string;
    usedAt: string;
  }): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      [
        "update tenant_invitations",
        "set used_at = $2",
        "where token = $1",
        "and organization_id = $3",
        "and used_at is null",
        "and is_revoked = false",
        "returning id",
      ].join(" "),
      [input.token, input.usedAt, input.organizationId],
    );
    return result.rows.length > 0;
  }
}

function invitationColumns(): string {
  return [
    "id, email, lease_id, token, organization_id, invited_by,",
    "expires_at::text as expires_at, used_at::text as used_at,",
    "is_revoked, created_at::text as created_at",
  ].join(" ");
}

function invitationReturning(): string {
  return `returning ${invitationColumns()}`;
}

function tenantUserReturning(): string {
  return [
    "returning id, user_id, organization_id, contact_name, contact_email,",
    "created_at::text as created_at",
  ].join(" ");
}
