import type {
  AssignableTeamRole,
  InvitedTeamUser,
  TeamInvitation,
  TeamInvitationValidation,
  TeamMember,
  TeamRepository,
} from "../../domain/team/repository";
import {
  TERMS_DOCUMENT_TYPE,
  TERMS_HASH,
  TERMS_VERSION,
} from "../../domain/legal/terms";
import type { PostgresExecutor } from "./postgres";

const landlordRoles = ["owner", "admin", "member", "viewer"] as const;
const manageableRoles = ["admin", "member", "viewer"] as const;

export class PostgresTeamRepository implements TeamRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async getOrganizationName(organizationId: string): Promise<string | null> {
    const result = await this.executor.query<{ name: string }>(
      "select name from organizations where id = $1 limit 1",
      [organizationId],
    );
    return result.rows[0]?.name ?? null;
  }

  async listMembers(input: {
    organizationId: string;
    currentUserId: string;
  }): Promise<TeamMember[]> {
    const result = await this.executor.query<MemberRow>(
      [
        memberSelect("$3"),
        "from users",
        "where organization_id = $1",
        "and role = any($2::text[])",
        "order by created_at asc, id asc",
      ].join(" "),
      [input.organizationId, [...landlordRoles], input.currentUserId],
    );
    return result.rows.map(memberFromRow);
  }

  async getMember(input: {
    memberId: string;
    organizationId: string;
    currentUserId: string;
  }): Promise<TeamMember | null> {
    const result = await this.executor.query<MemberRow>(
      [
        memberSelect("$4"),
        "from users",
        "where id = $1",
        "and organization_id = $2",
        "and role = any($3::text[])",
        "limit 1",
      ].join(" "),
      [
        input.memberId,
        input.organizationId,
        [...landlordRoles],
        input.currentUserId,
      ],
    );
    return result.rows[0] ? memberFromRow(result.rows[0]) : null;
  }

  async updateMemberRole(input: {
    memberId: string;
    organizationId: string;
    currentUserId: string;
    role: AssignableTeamRole;
    updatedAt: string;
  }): Promise<TeamMember | null> {
    const result = await this.executor.query<MemberRow>(
      [
        "update users",
        "set role = $3, updated_at = $4",
        "where id = $1",
        "and organization_id = $2",
        "and role = any($5::text[])",
        memberReturning("$6"),
      ].join(" "),
      [
        input.memberId,
        input.organizationId,
        input.role,
        input.updatedAt,
        [...manageableRoles],
        input.currentUserId,
      ],
    );
    return result.rows[0] ? memberFromRow(result.rows[0]) : null;
  }

  async removeMember(input: {
    memberId: string;
    organizationId: string;
  }): Promise<boolean> {
    return this.executor.transaction(async (executor) => {
      await executor.query(
        [
          "update team_member_invitations",
          "set used_by_user_id = null",
          "where used_by_user_id = $1",
          "and organization_id = $2",
        ].join(" "),
        [input.memberId, input.organizationId],
      );
      const result = await executor.query<{ id: string }>(
        [
          "delete from users",
          "where id = $1",
          "and organization_id = $2",
          "and role = any($3::text[])",
          "returning id",
        ].join(" "),
        [input.memberId, input.organizationId, [...manageableRoles]],
      );
      return result.rows.length > 0;
    });
  }

  async createInvitation(input: {
    id: string;
    email: string;
    role: AssignableTeamRole;
    token: string;
    invitedBy: string;
    organizationId: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<TeamInvitation> {
    const result = await this.executor.query<TeamInvitation>(
      [
        "insert into team_member_invitations",
        "(id, email, role, token, invited_by, organization_id, expires_at, created_at)",
        "values ($1, $2, $3, $4, $5, $6, $7, $8)",
        invitationReturning(),
      ].join(" "),
      [
        input.id,
        input.email,
        input.role,
        input.token,
        input.invitedBy,
        input.organizationId,
        input.expiresAt,
        input.createdAt,
      ],
    );
    const invitation = result.rows[0];
    if (!invitation) {
      throw new Error("Failed to create invitation");
    }
    return invitation;
  }

  async listInvitations(input: {
    organizationId: string;
    includeUsed: boolean;
  }): Promise<TeamInvitation[]> {
    const clauses = ["organization_id = $1"];
    if (!input.includeUsed) {
      clauses.push("used_at is null", "revoked_at is null");
    }
    const result = await this.executor.query<TeamInvitation>(
      [
        `select ${invitationColumns()}`,
        "from team_member_invitations",
        `where ${clauses.join(" and ")}`,
        "order by created_at desc, id desc",
      ].join(" "),
      [input.organizationId],
    );
    return result.rows;
  }

  async getInvitation(input: {
    invitationId: string;
    organizationId: string;
  }): Promise<TeamInvitation | null> {
    const result = await this.executor.query<TeamInvitation>(
      [
        `select ${invitationColumns()}`,
        "from team_member_invitations",
        "where id = $1 and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.invitationId, input.organizationId],
    );
    return result.rows[0] ?? null;
  }

  async revokeInvitation(input: {
    invitationId: string;
    organizationId: string;
    revokedAt: string;
  }): Promise<TeamInvitation | null> {
    const result = await this.executor.query<TeamInvitation>(
      [
        "update team_member_invitations",
        "set revoked_at = $3",
        "where id = $1",
        "and organization_id = $2",
        "and used_at is null",
        "and revoked_at is null",
        invitationReturning(),
      ].join(" "),
      [input.invitationId, input.organizationId, input.revokedAt],
    );
    return result.rows[0] ?? null;
  }

  async getInvitationByToken(
    token: string,
  ): Promise<TeamInvitationValidation | null> {
    const result = await this.executor.query<TeamInvitationValidation>(
      [
        `select ${invitationColumns("i")}, o.name as organization_name`,
        "from team_member_invitations i",
        "left join organizations o on o.id = i.organization_id",
        "where i.token = $1",
        "limit 1",
      ].join(" "),
      [token],
    );
    return result.rows[0] ?? null;
  }

  async upsertInvitedUser(input: {
    id: string;
    organizationId: string;
    email: string;
    fullName: string;
    role: AssignableTeamRole;
    timestamp: string;
  }): Promise<InvitedTeamUser | null> {
    const result = await this.executor.query<InvitedUserRow>(
      [
        "insert into users",
        "(id, organization_id, email, full_name, role, created_at, updated_at)",
        "values ($1, $2, $3, $4, $5, $6, $6)",
        "on conflict (id) do update set",
        "organization_id = excluded.organization_id,",
        "email = excluded.email,",
        "full_name = excluded.full_name,",
        "role = excluded.role,",
        "updated_at = excluded.updated_at",
        userReturning(),
      ].join(" "),
      [
        input.id,
        input.organizationId,
        input.email,
        input.fullName,
        input.role,
        input.timestamp,
      ],
    );
    return result.rows[0] ? invitedUserFromRow(result.rows[0]) : null;
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

  async getUserForInvitationAccept(
    userId: string,
  ): Promise<InvitedTeamUser | null> {
    const result = await this.executor.query<InvitedUserRow>(
      [userSelect(), "from users", "where id = $1", "limit 1"].join(" "),
      [userId],
    );
    return result.rows[0] ? invitedUserFromRow(result.rows[0]) : null;
  }

  async updateExistingUserInvitationRole(input: {
    userId: string;
    organizationId: string;
    role: AssignableTeamRole;
    updatedAt: string;
  }): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      [
        "update users",
        "set role = $3, updated_at = $4",
        "where id = $1",
        "and organization_id = $2",
        "returning id",
      ].join(" "),
      [input.userId, input.organizationId, input.role, input.updatedAt],
    );
    return result.rows.length > 0;
  }

  async markInvitationUsed(input: {
    token: string;
    organizationId?: string;
    usedByUserId: string;
    usedAt: string;
  }): Promise<boolean> {
    const organizationClause = input.organizationId
      ? "and organization_id = $4"
      : "";
    const params = input.organizationId
      ? [input.token, input.usedAt, input.usedByUserId, input.organizationId]
      : [input.token, input.usedAt, input.usedByUserId];
    const result = await this.executor.query<{ id: string }>(
      [
        "update team_member_invitations",
        "set used_at = $2, used_by_user_id = $3",
        "where token = $1",
        organizationClause,
        "and used_at is null",
        "and revoked_at is null",
        "returning id",
      ].join(" "),
      params,
    );
    return result.rows.length > 0;
  }
}

type MemberRow = Omit<TeamMember, "role" | "is_current_user"> & {
  role: string;
  is_current_user: boolean;
};
type InvitedUserRow = Omit<InvitedTeamUser, "role"> & {
  role: string;
};

function memberSelect(currentUserPlaceholder: string): string {
  return [
    "select id, email, full_name, role,",
    "created_at::text as created_at, updated_at::text as updated_at,",
    `(id = ${currentUserPlaceholder}::uuid) as is_current_user`,
  ].join(" ");
}

function memberReturning(currentUserPlaceholder: string): string {
  return [
    "returning id, email, full_name, role,",
    "created_at::text as created_at, updated_at::text as updated_at,",
    `(id = ${currentUserPlaceholder}::uuid) as is_current_user`,
  ].join(" ");
}

function memberFromRow(row: MemberRow): TeamMember {
  return {
    ...row,
    role: teamRole(row.role),
    is_current_user: row.is_current_user,
  };
}

function teamRole(value: string): TeamMember["role"] {
  if (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  ) {
    return value;
  }
  throw new Error(`Unexpected team role: ${value}`);
}

function invitationColumns(alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  return [
    `${prefix}id, ${prefix}email, ${prefix}role, ${prefix}token, ${prefix}organization_id, ${prefix}invited_by,`,
    `${prefix}expires_at::text as expires_at, ${prefix}used_at::text as used_at,`,
    `${prefix}used_by_user_id, ${prefix}revoked_at::text as revoked_at, ${prefix}created_at::text as created_at`,
  ].join(" ");
}

function invitationReturning(): string {
  return `returning ${invitationColumns()}`;
}

function userSelect(): string {
  return [
    "select id, organization_id, email, full_name, role,",
    "created_at::text as created_at, updated_at::text as updated_at",
  ].join(" ");
}

function userReturning(): string {
  return [
    "returning id, organization_id, email, full_name, role,",
    "created_at::text as created_at, updated_at::text as updated_at",
  ].join(" ");
}

function invitedUserFromRow(row: InvitedUserRow): InvitedTeamUser {
  return {
    ...row,
    role: teamRole(row.role),
  };
}
