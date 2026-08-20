export type TeamRole = "owner" | "admin" | "member" | "viewer";
export type AssignableTeamRole = Exclude<TeamRole, "owner">;

export type TeamMember = {
  id: string;
  email: string;
  full_name: string | null;
  role: TeamRole;
  created_at: string;
  updated_at: string;
  is_current_user: boolean;
};

export type TeamInvitation = {
  id: string;
  email: string;
  role: AssignableTeamRole;
  token: string;
  organization_id: string;
  invited_by: string;
  expires_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type TeamInvitationValidation = TeamInvitation & {
  organization_name: string | null;
};

export type InvitedTeamUser = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  role: TeamRole;
  created_at: string;
  updated_at: string;
  organization_name?: string | null;
};

export type CreateTeamInvitationInput = {
  id: string;
  email: string;
  role: AssignableTeamRole;
  token: string;
  invitedBy: string;
  organizationId: string;
  expiresAt: string;
  createdAt: string;
};

export type TeamRepository = {
  getOrganizationName(organizationId: string): Promise<string | null>;
  listMembers(input: {
    organizationId: string;
    currentUserId: string;
  }): Promise<TeamMember[]>;
  getMember(input: {
    memberId: string;
    organizationId: string;
    currentUserId: string;
  }): Promise<TeamMember | null>;
  updateMemberRole(input: {
    memberId: string;
    organizationId: string;
    currentUserId: string;
    role: AssignableTeamRole;
    updatedAt: string;
  }): Promise<TeamMember | null>;
  removeMember(input: {
    memberId: string;
    organizationId: string;
  }): Promise<boolean>;
  createInvitation(input: CreateTeamInvitationInput): Promise<TeamInvitation>;
  listInvitations(input: {
    organizationId: string;
    includeUsed: boolean;
  }): Promise<TeamInvitation[]>;
  getInvitation(input: {
    invitationId: string;
    organizationId: string;
  }): Promise<TeamInvitation | null>;
  revokeInvitation(input: {
    invitationId: string;
    organizationId: string;
    revokedAt: string;
  }): Promise<TeamInvitation | null>;
  getInvitationByToken(token: string): Promise<TeamInvitationValidation | null>;
  upsertInvitedUser(input: {
    id: string;
    organizationId: string;
    email: string;
    fullName: string;
    role: AssignableTeamRole;
    timestamp: string;
  }): Promise<InvitedTeamUser | null>;
  recordLegalAcceptance(input: {
    userId: string;
    organizationId: string;
    acceptedAt: string;
    source: string;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void>;
  getUserForInvitationAccept(userId: string): Promise<InvitedTeamUser | null>;
  updateExistingUserInvitationRole(input: {
    userId: string;
    organizationId: string;
    role: AssignableTeamRole;
    updatedAt: string;
  }): Promise<boolean>;
  markInvitationUsed(input: {
    token: string;
    organizationId?: string;
    usedByUserId: string;
    usedAt: string;
  }): Promise<boolean>;
};
