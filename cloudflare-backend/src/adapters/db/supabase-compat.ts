import {
  assertActorContext,
  canBypassOrganization,
  type ActorContext,
  type AuthenticatedUserContext,
  type AuthRepository,
  type DbAdapter,
  type ProtectedRecord,
  type ProtectedRecordRepository,
  type UpdateProtectedRecord,
} from "./transaction";

export type PostgrestRequest = {
  url: string;
  init: RequestInit;
};

export type PostgrestFetcher = (request: PostgrestRequest) => Promise<Response>;

export function actorHeaders(
  actor: ActorContext,
  serviceRoleToken?: string,
): Headers {
  const checkedActor = assertActorContext(actor);
  const headers = new Headers();
  const usesServiceRole = canBypassOrganization(checkedActor);
  const token = usesServiceRole ? serviceRoleToken : checkedActor.bearerToken;

  if (!token) {
    throw new TypeError(
      usesServiceRole
        ? "PostGREST service-role token is required for service admin access"
        : "ActorContext.bearerToken is required for PostGREST access",
    );
  }

  headers.set("authorization", `Bearer ${token}`);
  headers.set("x-capveri-user-id", checkedActor.userId);
  headers.set("x-capveri-organization-id", checkedActor.organizationId);
  headers.set("x-capveri-role", checkedActor.role);
  headers.set(
    "x-capveri-is-service-admin",
    String(checkedActor.isServiceAdmin),
  );
  headers.set("x-capveri-party", checkedActor.party);

  return headers;
}

class PostgrestProtectedRecordRepository implements ProtectedRecordRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: PostgrestFetcher,
    private readonly serviceRoleToken?: string,
  ) {}

  async list(actor: ActorContext): Promise<ProtectedRecord[]> {
    const headers = actorHeaders(actor, this.serviceRoleToken);
    headers.set("accept", "application/json");

    const response = await this.fetcher({
      url: `${this.baseUrl}/protected_records?select=id,organizationId:organization_id,landlordOnly:landlord_only,value&order=id.asc`,
      init: {
        method: "GET",
        headers,
      },
    });

    if (!response.ok) {
      throw new Error(
        `PostgREST request failed with status ${response.status}`,
      );
    }

    return (await response.json()) as ProtectedRecord[];
  }

  async update(
    actor: ActorContext,
    id: string,
    patch: UpdateProtectedRecord,
  ): Promise<ProtectedRecord | undefined> {
    const headers = actorHeaders(actor, this.serviceRoleToken);
    headers.set("accept", "application/vnd.pgrst.object+json");
    headers.set("content-type", "application/json");
    headers.set("prefer", "return=representation");

    const response = await this.fetcher({
      url: `${this.baseUrl}/protected_records?id=eq.${encodeURIComponent(id)}&select=id,organizationId:organization_id,landlordOnly:landlord_only,value`,
      init: {
        method: "PATCH",
        headers,
        body: JSON.stringify(patch),
      },
    });

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      throw new Error(
        `PostgREST request failed with status ${response.status}`,
      );
    }

    return (await response.json()) as ProtectedRecord;
  }
}

class PostgrestAuthRepository implements AuthRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: PostgrestFetcher,
  ) {}

  async resolveUserContext(
    authUserId: string,
    bearerToken: string,
  ): Promise<AuthenticatedUserContext | undefined> {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${bearerToken}`);
    headers.set("accept", "application/vnd.pgrst.object+json");

    const userResponse = await this.fetcher({
      url: `${this.baseUrl}/users?id=eq.${encodeURIComponent(authUserId)}&select=id,organizationId:organization_id,email,fullName:full_name,role,isPlatformAdmin:is_platform_admin,createdAt:created_at,updatedAt:updated_at`,
      init: { method: "GET", headers },
    });

    if (userResponse.status === 404 || userResponse.status === 406) {
      return undefined;
    }

    if (!userResponse.ok) {
      throw new Error(
        `PostgREST request failed with status ${userResponse.status}`,
      );
    }

    const user =
      (await userResponse.json()) as AuthenticatedUserContext["user"];

    const tenantUser =
      user.role === "tenant"
        ? await this.fetchTenantUser(authUserId, bearerToken)
        : undefined;

    const actor = assertActorContext({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      isServiceAdmin: user.isPlatformAdmin,
      party: user.role === "tenant" ? "tenant" : "landlord",
      bearerToken,
    });

    return tenantUser ? { actor, user, tenantUser } : { actor, user };
  }

  private async fetchTenantUser(
    authUserId: string,
    bearerToken: string,
  ): Promise<AuthenticatedUserContext["tenantUser"] | undefined> {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${bearerToken}`);
    headers.set("accept", "application/vnd.pgrst.object+json");

    const response = await this.fetcher({
      url: `${this.baseUrl}/tenant_users?user_id=eq.${encodeURIComponent(authUserId)}&select=id,userId:user_id,organizationId:organization_id,contactName:contact_name,contactEmail:contact_email,createdAt:created_at`,
      init: { method: "GET", headers },
    });

    if (response.status === 404 || response.status === 406) {
      return undefined;
    }

    if (!response.ok) {
      throw new Error(
        `PostgREST request failed with status ${response.status}`,
      );
    }

    return (await response.json()) as AuthenticatedUserContext["tenantUser"];
  }
}

export class PostgrestCompatAdapter implements DbAdapter {
  readonly mode = "postgrest-compat" as const;
  readonly auth: AuthRepository;
  readonly protectedRecords: ProtectedRecordRepository;

  constructor(
    baseUrl: string,
    fetcher: PostgrestFetcher,
    serviceRoleToken?: string,
  ) {
    this.auth = new PostgrestAuthRepository(baseUrl, fetcher);
    this.protectedRecords = new PostgrestProtectedRecordRepository(
      baseUrl,
      fetcher,
      serviceRoleToken,
    );
  }
}
