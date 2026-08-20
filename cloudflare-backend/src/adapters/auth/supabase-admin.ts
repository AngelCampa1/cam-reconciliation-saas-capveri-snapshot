import type { AppEnv } from "../../env";
import { TERMS_HASH, TERMS_VERSION } from "../../domain/legal/terms";
import { ConfigError } from "../../platform/cloudflare";

export type SupabaseCreatedUser = {
  id: string;
  email: string;
};

export type SupabasePasswordSession = {
  accessToken: string;
  refreshToken: string;
};

export type SupabaseAdminAuthClient = {
  createUser(input: {
    email: string;
    password: string;
    metadata: Record<string, string | boolean>;
  }): Promise<SupabaseCreatedUser>;
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<SupabasePasswordSession>;
  deleteUser(userId: string): Promise<void>;
};

export class HttpSupabaseAdminAuthClient implements SupabaseAdminAuthClient {
  constructor(private readonly env: AppEnv) {}

  async createUser(input: {
    email: string;
    password: string;
    metadata: Record<string, string | boolean>;
  }): Promise<SupabaseCreatedUser> {
    const response = await fetch(
      `${supabaseBaseUrl(this.env)}/auth/v1/admin/users`,
      {
        method: "POST",
        headers: authHeaders(this.env),
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: {
            ...input.metadata,
            terms_version: TERMS_VERSION,
            terms_hash: TERMS_HASH,
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await responseDetail(response);
      throw new Error(
        detail
          ? `Supabase Auth user creation failed: ${detail}`
          : "Supabase Auth user creation failed",
      );
    }

    const body = createdUserBody.parse(await response.json());
    return { id: body.id, email: body.email };
  }

  async signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<SupabasePasswordSession> {
    const response = await fetch(
      `${supabaseBaseUrl(this.env)}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: authHeaders(this.env),
        body: JSON.stringify({
          email: input.email,
          password: input.password,
        }),
      },
    );

    if (!response.ok) {
      const detail = await responseDetail(response);
      throw new Error(
        detail
          ? `Supabase password sign-in failed: ${detail}`
          : "Supabase password sign-in failed",
      );
    }

    const body = passwordSessionBody.parse(await response.json());
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
    };
  }

  async deleteUser(userId: string): Promise<void> {
    const response = await fetch(
      `${supabaseBaseUrl(this.env)}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: authHeaders(this.env),
      },
    );

    if (!response.ok) {
      const detail = await responseDetail(response);
      throw new Error(
        detail
          ? `Supabase Auth user deletion failed: ${detail}`
          : "Supabase Auth user deletion failed",
      );
    }
  }
}

const createdUserBody = {
  parse(value: unknown): SupabaseCreatedUser {
    if (
      typeof value === "object" &&
      value !== null &&
      "id" in value &&
      "email" in value &&
      typeof value.id === "string" &&
      typeof value.email === "string"
    ) {
      return { id: value.id, email: value.email };
    }
    throw new Error("Unexpected Supabase create user response");
  },
};

const passwordSessionBody = {
  parse(value: unknown): { access_token: string; refresh_token: string } {
    if (
      typeof value === "object" &&
      value !== null &&
      "access_token" in value &&
      "refresh_token" in value &&
      typeof value.access_token === "string" &&
      typeof value.refresh_token === "string"
    ) {
      return {
        access_token: value.access_token,
        refresh_token: value.refresh_token,
      };
    }
    throw new Error("Unexpected Supabase password sign-in response");
  },
};

function authHeaders(env: AppEnv): HeadersInit {
  const serviceRoleKey = requireBinding(
    env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
}

function supabaseBaseUrl(env: AppEnv): string {
  if (typeof env.SUPABASE_URL === "string" && env.SUPABASE_URL.trim() !== "") {
    return env.SUPABASE_URL.replace(/\/+$/u, "");
  }
  if (
    typeof env.AUTH_JWT_ISSUER === "string" &&
    env.AUTH_JWT_ISSUER.endsWith("/auth/v1")
  ) {
    return env.AUTH_JWT_ISSUER.slice(0, -"/auth/v1".length);
  }
  throw new ConfigError(
    "Missing required runtime binding: SUPABASE_URL or AUTH_JWT_ISSUER",
  );
}

function requireBinding(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Missing required runtime binding: ${name}`);
  }
  return value;
}

async function responseDetail(response: Response): Promise<string | null> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    const body = JSON.parse(text) as unknown;
    if (typeof body === "object" && body !== null) {
      const record = body as Record<string, unknown>;
      for (const key of ["msg", "message", "error", "detail"] as const) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
          return value;
        }
      }
    }
  } catch {
    return text.trim();
  }
  return text.trim();
}
