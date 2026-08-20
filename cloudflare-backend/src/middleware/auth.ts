import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import type {
  AuthenticatedUserContext,
  DbAdapter,
} from "../adapters/db/client";
import {
  JwtVerificationError,
  type JwtVerifier,
} from "../adapters/auth/verifier";
import { cachedSupabaseJwtVerifier } from "../adapters/auth/supabase-jwt";
import { createDbAdapter } from "../adapters/db/client";
import type { ActorParty } from "../adapters/db/transaction";

export type AuthVariables = {
  auth: AuthenticatedUserContext;
};

export type AuthMiddlewareOptions = {
  db?: DbAdapter;
  verifier?: JwtVerifier;
  /**
   * Actor parties allowed to access the guarded routes. Defaults to
   * landlord-only (fail-safe deny): a route must explicitly opt in to tenant
   * access. This stops a tenant-role JWT — whose `actor.organizationId` is the
   * landlord's org — from reading landlord data through landlord routes that
   * only scope by organization.
   */
  parties?: readonly ActorParty[];
};

const DEFAULT_ALLOWED_PARTIES: readonly ActorParty[] = ["landlord"];

type AuthErrorCode =
  | "authorization_required"
  | "invalid_authorization"
  | "invalid_token"
  | "user_not_found"
  | "user_inactive"
  | "tenant_profile_not_found"
  | "forbidden";

function authError(
  code: AuthErrorCode,
  message: string,
  status: 401 | 403,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

function bearerTokenFromHeader(header: string | undefined): string | Response {
  if (!header) {
    return authError(
      "authorization_required",
      "Authorization header required",
      401,
    );
  }

  const [scheme, token, extra] = header.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || extra) {
    return authError(
      "invalid_authorization",
      "Authorization header must use Bearer token",
      401,
    );
  }

  return token;
}

export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  return createMiddleware<{ Bindings: AppEnv; Variables: AuthVariables }>(
    async (c, next) => {
      const token = bearerTokenFromHeader(c.req.header("authorization"));

      if (token instanceof Response) {
        return token;
      }

      const verifier = options.verifier ?? cachedSupabaseJwtVerifier(c.env);
      const db = options.db ?? createDbAdapter(c.env);

      try {
        const verified = await verifier.verify(token);
        const authContext = await db.auth.resolveUserContext(
          verified.subject,
          token,
        );

        if (!authContext) {
          return authError("user_not_found", "User profile not found", 401);
        }

        if (!verified.isActive) {
          return authError("user_inactive", "User account is inactive", 403);
        }

        if (authContext.actor.party === "tenant" && !authContext.tenantUser) {
          return authError(
            "tenant_profile_not_found",
            "Tenant user profile not found",
            403,
          );
        }

        const allowedParties = options.parties ?? DEFAULT_ALLOWED_PARTIES;
        if (!allowedParties.includes(authContext.actor.party)) {
          return authError("forbidden", "Access denied", 403);
        }

        c.set("auth", authContext);
        await next();
      } catch (error) {
        if (error instanceof JwtVerificationError) {
          return authError("invalid_token", error.message, 401);
        }

        throw error;
      }
    },
  );
}
