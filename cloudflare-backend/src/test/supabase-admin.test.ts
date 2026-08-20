import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpSupabaseAdminAuthClient } from "../adapters/auth/supabase-admin";
import type { AppEnv } from "../env";

describe("HttpSupabaseAdminAuthClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves Supabase delete user error detail", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { message: "update or delete on table auth.users violates FK" },
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new HttpSupabaseAdminAuthClient(testEnv());

    await expect(client.deleteUser("user-123")).rejects.toThrow(
      "update or delete on table auth.users violates FK",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/admin/users/user-123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("deletes Supabase auth users with the service role key", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new HttpSupabaseAdminAuthClient(testEnv());

    await expect(client.deleteUser("user-123")).resolves.toBeUndefined();
    const calls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    expect(calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        apikey: "service-role",
        authorization: "Bearer service-role",
      }),
    });
  });
});

function testEnv(): AppEnv {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  } as unknown as AppEnv;
}
