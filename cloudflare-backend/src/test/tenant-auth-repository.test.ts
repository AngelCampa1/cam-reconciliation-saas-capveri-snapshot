import { describe, expect, it } from "vitest";
import { PostgresTenantAuthRepository } from "../adapters/db/tenant-auth";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LEASE_ID = "33333333-3333-4333-8333-333333333333";
const INVITATION_ID = "44444444-4444-4444-8444-444444444444";
const TENANT_USER_ID = "55555555-5555-4555-8555-555555555555";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

class QueueExecutor implements PostgresExecutor {
  readonly statements: RecordedStatement[] = [];

  constructor(private readonly responses: unknown[][]) {}

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push({ sql, params });
    const rows = this.responses.shift() ?? [];
    return { rows: rows as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
}

describe("PostgresTenantAuthRepository", () => {
  it("creates and validates tenant invitations by token", async () => {
    const row = {
      id: INVITATION_ID,
      email: "tenant@example.com",
      lease_id: LEASE_ID,
      token: "tenant-token-tenant-token-tenant-token",
      organization_id: ORG_ID,
      invited_by: USER_ID,
      expires_at: "2026-06-20T00:00:00Z",
      used_at: null,
      is_revoked: false,
      created_at: "2026-06-13T00:00:00Z",
    };
    const executor = new QueueExecutor([[row], [row]]);
    const repository = new PostgresTenantAuthRepository(executor);

    await repository.createInvitation({
      id: INVITATION_ID,
      email: "tenant@example.com",
      leaseId: LEASE_ID,
      token: "tenant-token-tenant-token-tenant-token",
      invitedBy: USER_ID,
      organizationId: ORG_ID,
      expiresAt: "2026-06-20T00:00:00Z",
      createdAt: "2026-06-13T00:00:00Z",
    });
    await repository.getInvitationByToken(
      "tenant-token-tenant-token-tenant-token",
    );

    expect(executor.statements[0]?.sql).toContain(
      "insert into tenant_invitations",
    );
    expect(executor.statements[1]?.sql).toContain("where token = $1");
  });

  it("verifies leases through their organization-scoped property", async () => {
    const executor = new QueueExecutor([[{ id: LEASE_ID }]]);
    const repository = new PostgresTenantAuthRepository(executor);

    await expect(
      repository.leaseBelongsToOrganization({
        leaseId: LEASE_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toBe(true);
    expect(executor.statements[0]?.sql).toContain(
      "join properties on properties.id = leases.property_id",
    );
    expect(executor.statements[0]?.sql).toContain(
      "and properties.organization_id = $2",
    );
  });

  it("creates tenant records and marks invitations used conditionally", async () => {
    const executor = new QueueExecutor([
      [],
      [
        {
          id: TENANT_USER_ID,
          user_id: USER_ID,
          organization_id: ORG_ID,
          contact_name: "Tenant User",
          contact_email: "tenant@example.com",
          created_at: "2026-06-13T00:00:00Z",
        },
      ],
      [],
      [],
      [{ id: INVITATION_ID }],
    ]);
    const repository = new PostgresTenantAuthRepository(executor);

    await repository.upsertPortalUser({
      userId: USER_ID,
      organizationId: ORG_ID,
      email: "tenant@example.com",
      contactName: "Tenant User",
      timestamp: "2026-06-13T00:00:00Z",
    });
    await repository.createTenantUser({
      id: TENANT_USER_ID,
      userId: USER_ID,
      organizationId: ORG_ID,
      contactName: "Tenant User",
      contactEmail: "tenant@example.com",
      createdAt: "2026-06-13T00:00:00Z",
    });
    await repository.linkTenantToLease({
      tenantUserId: TENANT_USER_ID,
      leaseId: LEASE_ID,
      createdAt: "2026-06-13T00:00:00Z",
    });
    await repository.recordLegalAcceptance({
      userId: USER_ID,
      organizationId: ORG_ID,
      acceptedAt: "2026-06-13T00:00:00Z",
      source: "tenant_invitation_signup",
      ipAddress: null,
      userAgent: "vitest",
    });
    await expect(
      repository.markInvitationUsed({
        token: "tenant-token-tenant-token-tenant-token",
        organizationId: ORG_ID,
        usedAt: "2026-06-13T00:00:00Z",
      }),
    ).resolves.toBe(true);

    expect(executor.statements[0]?.sql).toContain("on conflict (id) do update");
    expect(executor.statements[1]?.sql).toContain("insert into tenant_users");
    expect(executor.statements[2]?.sql).toContain(
      "insert into tenant_lease_links",
    );
    expect(executor.statements[3]?.sql).toContain(
      "insert into legal_acceptances",
    );
    expect(executor.statements[4]?.sql).toContain("and used_at is null");
    expect(executor.statements[4]?.sql).toContain("and is_revoked = false");
  });
});
