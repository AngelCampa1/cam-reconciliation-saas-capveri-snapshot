import { Hono } from "hono";
import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import type { ActorParty } from "../adapters/db/transaction";
import {
  JwtVerificationError,
  type JwtVerifier,
} from "../adapters/auth/verifier";
import {
  cachedSupabaseJwtVerifier,
  SupabaseJwtVerifier,
  type SupabaseJwtVerifierEnv,
  tokenIsActive,
} from "../adapters/auth/supabase-jwt";
import type {
  ActorContext,
  AuthenticatedUserContext,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { AppEnv } from "../env";
import { ConfigError } from "../platform/cloudflare";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

type AuthTestState = {
  context?: AuthenticatedUserContext;
  receivedToken?: string;
  verifierError?: Error;
  verifiedIsActive?: boolean;
};

function userContext(
  role: ActorContext["role"],
  overrides: Partial<AuthenticatedUserContext["user"]> = {},
): AuthenticatedUserContext {
  const user = {
    id: `${role}-user`,
    organizationId: "org-a",
    email: `${role}@example.test`,
    fullName: `${role} User`,
    role,
    isPlatformAdmin: false,
    createdAt: "2026-06-12T00:00:00Z",
    updatedAt: "2026-06-12T00:00:00Z",
    ...overrides,
  };
  const actor: ActorContext = {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    isServiceAdmin: user.isPlatformAdmin,
    party: user.role === "tenant" ? "tenant" : "landlord",
    bearerToken: "valid-token",
  };

  if (role !== "tenant") {
    return { actor, user };
  }

  return {
    actor,
    user,
    tenantUser: {
      id: "tenant-profile",
      userId: user.id,
      organizationId: user.organizationId,
      contactName: "Tenant Contact",
      contactEmail: "tenant@example.test",
      createdAt: "2026-06-12T00:00:00Z",
    },
  };
}

function createAuthTestApp(
  state: AuthTestState,
  parties?: readonly ActorParty[],
) {
  const verifier: JwtVerifier = {
    async verify(token) {
      if (state.verifierError) {
        throw state.verifierError;
      }

      if (token !== "valid-token") {
        throw new JwtVerificationError();
      }

      return {
        subject: "auth-user",
        payload: { sub: "auth-user" },
        isActive: state.verifiedIsActive ?? true,
      };
    },
  };
  const db: DbAdapter = {
    mode: "postgrest-compat",
    protectedRecords,
    auth: {
      async resolveUserContext(_authUserId, bearerToken) {
        state.receivedToken = bearerToken;
        return state.context;
      },
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  const options: AuthMiddlewareOptions = { db, verifier };
  if (parties) {
    options.parties = parties;
  }
  app.use("*", authMiddleware(options));
  app.get("/private", (c) => {
    const auth = c.get("auth");

    return c.json({
      userId: auth.actor.userId,
      organizationId: auth.actor.organizationId,
      role: auth.actor.role,
      party: auth.actor.party,
      tenantUserId: auth.tenantUser?.id,
    });
  });

  return app;
}

async function authRequest(
  state: AuthTestState,
  authorization?: string,
  parties?: readonly ActorParty[],
) {
  const app = createAuthTestApp(state, parties);
  const init = authorization ? { headers: { authorization } } : {};

  return app.request("/private", init, {} as AppEnv);
}

async function createSignedJwtVerifierFixture() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const issuer = "https://project.supabase.co/auth/v1";
  const audience = "authenticated";
  const verifier = new SupabaseJwtVerifier(
    {
      AUTH_JWKS_URL:
        "https://project.supabase.co/auth/v1/.well-known/jwks.json",
      AUTH_JWT_AUDIENCE: audience,
      AUTH_JWT_ISSUER: issuer,
    },
    publicKey,
  );

  async function sign(
    claims: Record<string, unknown> | undefined = { sub: "auth-user" },
    options: {
      expiresAt?: number | string;
      jwtIssuer?: string;
      jwtAudience?: string;
    } = {},
  ): Promise<string> {
    return new SignJWT(claims ?? { sub: "auth-user" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setExpirationTime(options.expiresAt ?? "2m")
      .setIssuer(options.jwtIssuer ?? issuer)
      .setAudience(options.jwtAudience ?? audience)
      .sign(privateKey);
  }

  return { sign, verifier };
}

describe("auth middleware", () => {
  it("derives inactive auth state from Supabase-compatible token claims", () => {
    expect(tokenIsActive({ sub: "user", disabled: true })).toBe(false);
    expect(tokenIsActive({ sub: "user", is_active: false })).toBe(false);
    expect(
      tokenIsActive({
        sub: "user",
        banned_until: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe(false);
    expect(
      tokenIsActive({
        sub: "user",
        banned_until: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(true);
  });

  it("returns 401 JSON when the bearer token is missing", async () => {
    const response = await authRequest({ context: userContext("owner") });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "authorization_required",
        message: "Authorization header required",
      },
    });
  });

  it("returns 401 JSON when the bearer token is malformed", async () => {
    const response = await authRequest(
      { context: userContext("owner") },
      "Bearer malformed",
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_token",
        message: "Invalid or expired token",
      },
    });
  });

  it("returns 401 JSON when a valid token has no user row", async () => {
    const state: AuthTestState = {};
    const response = await authRequest(state, "Bearer valid-token");

    expect(response.status).toBe(401);
    expect(state.receivedToken).toBe("valid-token");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "user_not_found",
        message: "User profile not found",
      },
    });
  });

  it("returns 403 JSON when the user row is inactive", async () => {
    const response = await authRequest(
      { context: userContext("member"), verifiedIsActive: false },
      "Bearer valid-token",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "user_inactive",
        message: "User account is inactive",
      },
    });
  });

  it.each(["owner", "admin", "member", "viewer"] as const)(
    "authenticates landlord %s users",
    async (role) => {
      const response = await authRequest(
        { context: userContext(role) },
        "Bearer valid-token",
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        userId: `${role}-user`,
        organizationId: "org-a",
        role,
        party: "landlord",
      });
    },
  );

  it("authenticates tenant users with a separate tenant profile", async () => {
    const response = await authRequest(
      { context: userContext("tenant") },
      "Bearer valid-token",
      ["tenant"],
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userId: "tenant-user",
      organizationId: "org-a",
      role: "tenant",
      party: "tenant",
      tenantUserId: "tenant-profile",
    });
  });

  it("returns 403 JSON when a tenant user has no tenant profile", async () => {
    const { actor, user } = userContext("tenant");
    const response = await authRequest(
      { context: { actor, user } },
      "Bearer valid-token",
      ["tenant"],
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "tenant_profile_not_found",
        message: "Tenant user profile not found",
      },
    });
  });

  it("denies tenants on default landlord-only routes (fail-safe deny)", async () => {
    // A tenant JWT carries actor.organizationId == the landlord's org. Without an
    // explicit tenant opt-in, landlord routes that only scope by organization
    // must reject the tenant to prevent cross-role data leakage.
    const response = await authRequest(
      { context: userContext("tenant") },
      "Bearer valid-token",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "forbidden", message: "Access denied" },
    });
  });

  it("denies landlords on tenant-only routes", async () => {
    const response = await authRequest(
      { context: userContext("owner") },
      "Bearer valid-token",
      ["tenant"],
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "forbidden", message: "Access denied" },
    });
  });

  it.each(["owner", "tenant"] as const)(
    "allows %s on routes that opt in to both parties",
    async (role) => {
      const response = await authRequest(
        { context: userContext(role) },
        "Bearer valid-token",
        ["landlord", "tenant"],
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        party: role === "tenant" ? "tenant" : "landlord",
      });
    },
  );
});

describe("Supabase JWT verifier", () => {
  it("caches default remote JWKS verifiers by runtime auth config", () => {
    const env = {
      AUTH_JWKS_URL:
        "https://project.supabase.co/auth/v1/.well-known/jwks.json",
      AUTH_JWT_AUDIENCE: "authenticated",
      AUTH_JWT_ISSUER: "https://project.supabase.co/auth/v1",
    };

    expect(cachedSupabaseJwtVerifier(env)).toBe(cachedSupabaseJwtVerifier(env));
  });

  it.each([undefined, "staging", "production"] as const)(
    "requires issuer and audience unless %s is explicitly non-production",
    (environment) => {
      const envBase: SupabaseJwtVerifierEnv = environment
        ? { ENVIRONMENT: environment }
        : {};

      expect(
        () =>
          new SupabaseJwtVerifier({
            ...envBase,
            AUTH_JWKS_URL:
              "https://project.supabase.co/auth/v1/.well-known/jwks.json",
            AUTH_JWT_ISSUER: "https://project.supabase.co/auth/v1",
          }),
      ).toThrow(ConfigError);

      expect(
        () =>
          new SupabaseJwtVerifier({
            ...envBase,
            AUTH_JWKS_URL:
              "https://project.supabase.co/auth/v1/.well-known/jwks.json",
            AUTH_JWT_AUDIENCE: "authenticated",
          }),
      ).toThrow(ConfigError);
    },
  );

  it("allows local development JWT config before issuer and audience are wired", () => {
    expect(
      () =>
        new SupabaseJwtVerifier({
          ENVIRONMENT: "development",
          AUTH_JWKS_URL:
            "https://project.supabase.co/auth/v1/.well-known/jwks.json",
        }),
    ).not.toThrow();
  });

  it("verifies signed tokens with expected issuer and audience", async () => {
    const { sign, verifier } = await createSignedJwtVerifierFixture();

    await expect(verifier.verify(await sign())).resolves.toMatchObject({
      subject: "auth-user",
      isActive: true,
    });
  });

  it("rejects signed tokens with the wrong issuer or audience", async () => {
    const { sign, verifier } = await createSignedJwtVerifierFixture();

    await expect(
      verifier.verify(
        await sign(undefined, { jwtIssuer: "https://evil.test" }),
      ),
    ).rejects.toThrow(JwtVerificationError);
    await expect(
      verifier.verify(await sign(undefined, { jwtAudience: "other" })),
    ).rejects.toThrow(JwtVerificationError);
  });

  it("rejects HS256 tokens — algorithm pin blocks alg confusion", async () => {
    // A symmetric (HS256) token is otherwise structurally valid and signed
    // with the verifier's own key. Without the pinned asymmetric algorithm
    // set it would verify; the pin must reject it.
    const secret = new TextEncoder().encode("a".repeat(32));
    const verifier = new SupabaseJwtVerifier(
      {
        AUTH_JWKS_URL:
          "https://project.supabase.co/auth/v1/.well-known/jwks.json",
        AUTH_JWT_AUDIENCE: "authenticated",
        AUTH_JWT_ISSUER: "https://project.supabase.co/auth/v1",
      },
      secret,
    );
    const hsToken = await new SignJWT({ sub: "auth-user" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2m")
      .setIssuer("https://project.supabase.co/auth/v1")
      .setAudience("authenticated")
      .sign(secret);

    await expect(verifier.verify(hsToken)).rejects.toThrow(
      JwtVerificationError,
    );
  });

  it("rejects expired tokens and tokens without a subject", async () => {
    const { sign, verifier } = await createSignedJwtVerifierFixture();
    const expiredAt = Math.floor(Date.now() / 1000) - 60;

    await expect(
      verifier.verify(await sign(undefined, { expiresAt: expiredAt })),
    ).rejects.toThrow(JwtVerificationError);
    await expect(verifier.verify(await sign({}))).rejects.toThrow(
      JwtVerificationError,
    );
  });
});
