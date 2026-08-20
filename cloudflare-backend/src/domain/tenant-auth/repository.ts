export type TenantInvitation = {
  id: string;
  email: string;
  lease_id: string;
  token: string;
  organization_id: string;
  invited_by: string;
  expires_at: string;
  used_at: string | null;
  is_revoked: boolean;
  created_at: string;
};

export type TenantUser = {
  id: string;
  user_id: string;
  organization_id: string;
  contact_name: string;
  contact_email: string;
  created_at: string;
};

export type CreateTenantInvitationInput = {
  id: string;
  email: string;
  leaseId: string;
  token: string;
  invitedBy: string;
  organizationId: string;
  expiresAt: string;
  createdAt: string;
};

export type TenantAuthRepository = {
  getInvitationByToken(token: string): Promise<TenantInvitation | null>;
  createInvitation(
    input: CreateTenantInvitationInput,
  ): Promise<TenantInvitation>;
  leaseBelongsToOrganization(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<boolean>;
  upsertPortalUser(input: {
    userId: string;
    organizationId: string;
    email: string;
    contactName: string;
    timestamp: string;
  }): Promise<void>;
  createTenantUser(input: {
    id: string;
    userId: string;
    organizationId: string;
    contactName: string;
    contactEmail: string;
    createdAt: string;
  }): Promise<TenantUser | null>;
  linkTenantToLease(input: {
    tenantUserId: string;
    leaseId: string;
    createdAt: string;
  }): Promise<void>;
  recordLegalAcceptance(input: {
    userId: string;
    organizationId: string;
    acceptedAt: string;
    source: string;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void>;
  markInvitationUsed(input: {
    token: string;
    organizationId: string;
    usedAt: string;
  }): Promise<boolean>;
};
