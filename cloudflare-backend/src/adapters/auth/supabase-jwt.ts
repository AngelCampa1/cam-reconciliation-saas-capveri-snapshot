import {
  createRemoteJWKSet,
  jwtVerify,
  type CryptoKey,
  type JWK,
  type JWTPayload,
  type JWTVerifyResult,
  type JWTVerifyGetKey,
  type JWTVerifyOptions,
  type KeyObject,
} from "jose";
import { ConfigError } from "../../platform/cloudflare";
import {
  JwtVerificationError,
  subjectFromPayload,
  type JwtVerifier,
  type VerifiedJwt,
} from "./verifier";

export type SupabaseJwtVerifierEnv = {
  ENVIRONMENT?: string;
  AUTH_JWKS_URL?: string;
  AUTH_JWT_AUDIENCE?: string;
  AUTH_JWT_ISSUER?: string;
};

/**
 * Algorithms accepted when verifying Supabase access tokens. Supabase signs
 * with asymmetric keys exposed via JWKS — ES256 today (see the live
 * .well-known/jwks.json), RS256 on projects/rotations that use RSA keys.
 * Pinning this set defends against algorithm-confusion attacks (a forged
 * `alg: none` or an HS256 token signed with the public key) — without it,
 * jose would accept any algorithm the presented key could satisfy.
 */
const ACCEPTED_JWT_ALGORITHMS = ["ES256", "RS256"] as const;

type JwtVerifyKey = CryptoKey | KeyObject | JWK | Uint8Array | JWTVerifyGetKey;
type VerifyToken = (
  token: string,
  options: JWTVerifyOptions,
) => Promise<JWTVerifyResult<JWTPayload>>;

export class SupabaseJwtVerifier implements JwtVerifier {
  private readonly verifyToken: VerifyToken;

  constructor(
    private readonly env: SupabaseJwtVerifierEnv,
    key?: JwtVerifyKey,
  ) {
    validateSupabaseJwtVerifierEnv(env);
    if (key) {
      this.verifyToken = (token, options) => verifyWithKey(token, key, options);
    } else {
      const remoteKey = createRemoteJWKSet(new URL(env.AUTH_JWKS_URL ?? ""));
      this.verifyToken = (token, options) =>
        jwtVerify(token, remoteKey, options);
    }
  }

  async verify(token: string): Promise<VerifiedJwt> {
    try {
      const options: JWTVerifyOptions = {
        algorithms: [...ACCEPTED_JWT_ALGORITHMS],
      };

      if (this.env.AUTH_JWT_AUDIENCE) {
        options.audience = this.env.AUTH_JWT_AUDIENCE;
      }

      if (this.env.AUTH_JWT_ISSUER) {
        options.issuer = this.env.AUTH_JWT_ISSUER;
      }

      const { payload } = await this.verifyToken(token, options);
      const plainPayload = { ...payload } as Record<string, unknown>;

      return {
        subject: subjectFromPayload(plainPayload),
        payload: plainPayload,
        isActive: tokenIsActive(plainPayload),
      };
    } catch (error) {
      if (error instanceof JwtVerificationError) {
        throw error;
      }

      throw new JwtVerificationError();
    }
  }
}

function isGetKey(key: JwtVerifyKey): key is JWTVerifyGetKey {
  return typeof key === "function";
}

function verifyWithKey(
  token: string,
  key: JwtVerifyKey,
  options: JWTVerifyOptions,
): Promise<JWTVerifyResult<JWTPayload>> {
  if (isGetKey(key)) {
    return jwtVerify(token, key, options);
  }

  return jwtVerify(token, key, options);
}

const verifierCache = new Map<string, SupabaseJwtVerifier>();

export function validateSupabaseJwtVerifierEnv(
  env: SupabaseJwtVerifierEnv,
): void {
  if (!env.AUTH_JWKS_URL) {
    throw new ConfigError("AUTH_JWKS_URL is required for JWT verification");
  }

  if (env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test") {
    return;
  }

  if (!env.AUTH_JWT_AUDIENCE) {
    throw new ConfigError(
      "AUTH_JWT_AUDIENCE is required for production JWT verification",
    );
  }

  if (!env.AUTH_JWT_ISSUER) {
    throw new ConfigError(
      "AUTH_JWT_ISSUER is required for production JWT verification",
    );
  }
}

export function cachedSupabaseJwtVerifier(
  env: SupabaseJwtVerifierEnv,
): SupabaseJwtVerifier {
  const cacheKey = [
    env.ENVIRONMENT ?? "",
    env.AUTH_JWKS_URL ?? "",
    env.AUTH_JWT_AUDIENCE ?? "",
    env.AUTH_JWT_ISSUER ?? "",
  ].join("\n");
  const cached = verifierCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const verifier = new SupabaseJwtVerifier(env);
  verifierCache.set(cacheKey, verifier);

  return verifier;
}

export function tokenIsActive(payload: Record<string, unknown>): boolean {
  if (payload.disabled === true || payload.is_active === false) {
    return false;
  }

  const bannedUntil = payload.banned_until;
  if (typeof bannedUntil !== "string" || bannedUntil.trim() === "") {
    return true;
  }

  const bannedUntilTime = Date.parse(bannedUntil);

  return Number.isNaN(bannedUntilTime) || bannedUntilTime <= Date.now();
}
