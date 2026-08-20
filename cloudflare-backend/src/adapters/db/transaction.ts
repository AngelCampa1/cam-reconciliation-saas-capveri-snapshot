export type DbAccessMode = "direct-postgres" | "postgrest-compat";

export type ActorRole = "owner" | "admin" | "member" | "viewer" | "tenant";

export type ActorParty = "tenant" | "landlord";

export type ActorContext = {
  userId: string;
  organizationId: string;
  role: ActorRole;
  isServiceAdmin: boolean;
  party: ActorParty;
  bearerToken?: string;
};

export type UserProfile = {
  id: string;
  organizationId: string;
  email: string;
  fullName: string | null;
  role: ActorRole;
  isPlatformAdmin: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TenantUserProfile = {
  id: string;
  userId: string;
  organizationId: string;
  contactName: string;
  contactEmail: string;
  createdAt: string;
};

export type AuthenticatedUserContext = {
  actor: ActorContext;
  user: UserProfile;
  tenantUser?: TenantUserProfile;
};

export type AuthRepository = {
  resolveUserContext(
    authUserId: string,
    bearerToken: string,
  ): Promise<AuthenticatedUserContext | undefined>;
};

export type QueryResult<Row> = {
  rows: Row[];
};

export type ProtectedRecord = {
  id: string;
  organizationId: string;
  landlordOnly: boolean;
  value: string;
};

export type UpdateProtectedRecord = {
  value: string;
};

export type ProtectedRecordRepository = {
  list(actor: ActorContext): Promise<ProtectedRecord[]>;
  update(
    actor: ActorContext,
    id: string,
    patch: UpdateProtectedRecord,
  ): Promise<ProtectedRecord | undefined>;
};

export type DbAdapter = {
  mode: DbAccessMode;
  auth: AuthRepository;
  protectedRecords: ProtectedRecordRepository;
};

export function assertActorContext(
  actor: ActorContext | undefined,
): ActorContext {
  if (!actor) {
    throw new TypeError("ActorContext is required for database access");
  }

  const requiredFields = ["userId", "organizationId", "role", "party"] as const;

  for (const field of requiredFields) {
    if (actor[field].trim() === "") {
      throw new TypeError(`ActorContext.${field} is required`);
    }
  }

  if (typeof actor.isServiceAdmin !== "boolean") {
    throw new TypeError("ActorContext.isServiceAdmin is required");
  }

  if (!["owner", "admin", "member", "viewer", "tenant"].includes(actor.role)) {
    throw new TypeError("ActorContext.role is invalid");
  }

  if (!["tenant", "landlord"].includes(actor.party)) {
    throw new TypeError("ActorContext.party is invalid");
  }

  return actor;
}

export function canBypassOrganization(actor: ActorContext): boolean {
  return actor.isServiceAdmin && actor.role === "admin";
}
