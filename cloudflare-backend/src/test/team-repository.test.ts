import { describe, expect, it } from "vitest";
import { PostgresTeamRepository } from "../adapters/db/team";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const INVITATION_ID = "44444444-4444-4444-8444-444444444444";

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

describe("PostgresTeamRepository", () => {
  it("lists organization-scoped landlord team members", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: USER_ID,
          email: "admin@example.com",
          full_name: "Admin",
          role: "admin",
          created_at: "2026-06-13T00:00:00Z",
          updated_at: "2026-06-13T00:00:00Z",
          is_current_user: true,
        },
      ],
    ]);
    const repository = new PostgresTeamRepository(executor);

    await expect(
      repository.listMembers({
        organizationId: ORG_ID,
        currentUserId: USER_ID,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: USER_ID, is_current_user: true }),
    ]);
    expect(executor.statements[0]?.sql).toContain("where organization_id = $1");
    expect(executor.statements[0]?.sql).toContain("role = any($2::text[])");
    expect(executor.statements[0]?.params).toEqual([
      ORG_ID,
      ["owner", "admin", "member", "viewer"],
      USER_ID,
    ]);
  });

  it("updates only manageable roles inside the organization", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: MEMBER_ID,
          email: "member@example.com",
          full_name: null,
          role: "member",
          created_at: "2026-06-13T00:00:00Z",
          updated_at: "2026-06-13T01:00:00Z",
          is_current_user: false,
        },
      ],
    ]);
    const repository = new PostgresTeamRepository(executor);

    await expect(
      repository.updateMemberRole({
        memberId: MEMBER_ID,
        organizationId: ORG_ID,
        currentUserId: USER_ID,
        role: "member",
        updatedAt: "2026-06-13T01:00:00Z",
      }),
    ).resolves.toMatchObject({ id: MEMBER_ID, role: "member" });
    expect(executor.statements[0]?.sql).toContain("and role = any($5::text[])");
    expect(executor.statements[0]?.params).toEqual([
      MEMBER_ID,
      ORG_ID,
      "member",
      "2026-06-13T01:00:00Z",
      ["admin", "member", "viewer"],
      USER_ID,
    ]);
  });

  it("removes members after clearing invitation references", async () => {
    const executor = new QueueExecutor([[], [{ id: MEMBER_ID }]]);
    const repository = new PostgresTeamRepository(executor);

    await expect(
      repository.removeMember({
        memberId: MEMBER_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toBe(true);

    expect(executor.statements[0]?.sql).toContain(
      "update team_member_invitations",
    );
    expect(executor.statements[0]?.sql).toContain("set used_by_user_id = null");
    expect(executor.statements[0]?.params).toEqual([MEMBER_ID, ORG_ID]);
    expect(executor.statements[1]?.sql).toContain("delete from users");
    expect(executor.statements[1]?.params).toEqual([
      MEMBER_ID,
      ORG_ID,
      ["admin", "member", "viewer"],
    ]);
  });

  it("creates, lists, and revokes organization-scoped invitations", async () => {
    const row = {
      id: INVITATION_ID,
      email: "new@example.com",
      role: "viewer",
      token: "token",
      organization_id: ORG_ID,
      invited_by: USER_ID,
      expires_at: "2026-06-20T00:00:00Z",
      used_at: null,
      used_by_user_id: null,
      revoked_at: null,
      created_at: "2026-06-13T00:00:00Z",
    };
    const executor = new QueueExecutor([
      [row],
      [row],
      [{ ...row, revoked_at: "now" }],
    ]);
    const repository = new PostgresTeamRepository(executor);

    await repository.createInvitation({
      id: INVITATION_ID,
      email: "new@example.com",
      role: "viewer",
      token: "token",
      invitedBy: USER_ID,
      organizationId: ORG_ID,
      expiresAt: "2026-06-20T00:00:00Z",
      createdAt: "2026-06-13T00:00:00Z",
    });
    await repository.listInvitations({
      organizationId: ORG_ID,
      includeUsed: false,
    });
    await repository.revokeInvitation({
      invitationId: INVITATION_ID,
      organizationId: ORG_ID,
      revokedAt: "now",
    });

    expect(executor.statements[0]?.sql).toContain(
      "insert into team_member_invitations",
    );
    expect(executor.statements[1]?.sql).toContain("used_at is null");
    expect(executor.statements[1]?.sql).toContain("revoked_at is null");
    expect(executor.statements[2]?.sql).toContain("and organization_id = $2");
    expect(executor.statements[2]?.sql).toContain("and used_at is null");
    expect(executor.statements[2]?.sql).toContain("and revoked_at is null");
  });

  it("fetches public invitation validation details by token", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: INVITATION_ID,
          email: "new@example.com",
          role: "viewer",
          token: "token-token-token-token-token-token",
          organization_id: ORG_ID,
          invited_by: USER_ID,
          expires_at: "2026-06-20T00:00:00Z",
          used_at: null,
          used_by_user_id: null,
          revoked_at: null,
          created_at: "2026-06-13T00:00:00Z",
          organization_name: "Ventora Labs",
        },
      ],
    ]);
    const repository = new PostgresTeamRepository(executor);

    await expect(
      repository.getInvitationByToken("token-token-token-token-token-token"),
    ).resolves.toMatchObject({
      email: "new@example.com",
      organization_name: "Ventora Labs",
    });
    expect(executor.statements[0]?.sql).toContain(
      "left join organizations o on o.id = i.organization_id",
    );
    expect(executor.statements[0]?.sql).toContain("where i.token = $1");
  });

  it("upserts invited users and records legal acceptance", async () => {
    const executor = new QueueExecutor([
      [
        {
          id: USER_ID,
          organization_id: ORG_ID,
          email: "new@example.com",
          full_name: "New User",
          role: "member",
          created_at: "2026-06-13T00:00:00Z",
          updated_at: "2026-06-13T00:00:00Z",
        },
      ],
      [],
    ]);
    const repository = new PostgresTeamRepository(executor);

    await repository.upsertInvitedUser({
      id: USER_ID,
      organizationId: ORG_ID,
      email: "new@example.com",
      fullName: "New User",
      role: "member",
      timestamp: "2026-06-13T00:00:00Z",
    });
    await repository.recordLegalAcceptance({
      userId: USER_ID,
      organizationId: ORG_ID,
      acceptedAt: "2026-06-13T00:00:00Z",
      source: "team_invitation_signup",
      ipAddress: "203.0.113.10",
      userAgent: "vitest",
    });

    expect(executor.statements[0]?.sql).toContain("on conflict (id) do update");
    expect(executor.statements[1]?.sql).toContain(
      "insert into legal_acceptances",
    );
    expect(executor.statements[1]?.params).toEqual([
      USER_ID,
      ORG_ID,
      "terms_of_service",
      "2026-06-03",
      "sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a",
      "2026-06-13T00:00:00Z",
      "203.0.113.10",
      "vitest",
      "team_invitation_signup",
    ]);
  });

  it("marks invitations used with a race-safe conditional update", async () => {
    const executor = new QueueExecutor([[{ id: INVITATION_ID }]]);
    const repository = new PostgresTeamRepository(executor);

    await expect(
      repository.markInvitationUsed({
        token: "token-token-token-token-token-token",
        organizationId: ORG_ID,
        usedByUserId: USER_ID,
        usedAt: "2026-06-13T00:00:00Z",
      }),
    ).resolves.toBe(true);

    expect(executor.statements[0]?.sql).toContain("where token = $1");
    expect(executor.statements[0]?.sql).toContain("and organization_id = $4");
    expect(executor.statements[0]?.sql).toContain("and used_at is null");
    expect(executor.statements[0]?.sql).toContain("and revoked_at is null");
  });
});
