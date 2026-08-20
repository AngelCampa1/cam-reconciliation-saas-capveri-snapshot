import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreateTenantInvitationInput,
  TenantAuthRepository,
  TenantInvitation,
  TenantUser,
} from "../domain/tenant-auth/repository";
import { createTenantInvitationRecord } from "../domain/tenant-auth/service";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LEASE_ID = "33333333-3333-4333-8333-333333333333";

class MemoryTenantAuthRepository implements TenantAuthRepository {
  createdInvitation: CreateTenantInvitationInput | null = null;

  async getInvitationByToken(): Promise<TenantInvitation | null> {
    return null;
  }

  async createInvitation(
    input: CreateTenantInvitationInput,
  ): Promise<TenantInvitation> {
    this.createdInvitation = input;
    return {
      id: input.id,
      email: input.email,
      lease_id: input.leaseId,
      token: input.token,
      organization_id: input.organizationId,
      invited_by: input.invitedBy,
      expires_at: input.expiresAt,
      used_at: null,
      is_revoked: false,
      created_at: input.createdAt,
    };
  }

  async leaseBelongsToOrganization(): Promise<boolean> {
    return true;
  }

  async upsertPortalUser(): Promise<void> {
    return undefined;
  }

  async createTenantUser(): Promise<TenantUser | null> {
    return null;
  }

  async linkTenantToLease(): Promise<void> {
    return undefined;
  }

  async recordLegalAcceptance(): Promise<void> {
    return undefined;
  }

  async markInvitationUsed(): Promise<boolean> {
    return false;
  }
}

describe("tenant auth service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the default UUID generator with the crypto receiver intact", async () => {
    const repository = new MemoryTenantAuthRepository();
    const workerLikeCrypto = {
      randomUUID() {
        if (this !== workerLikeCrypto) {
          throw new TypeError("Illegal invocation");
        }
        return "44444444-4444-4444-8444-444444444444";
      },
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(1);
        return bytes;
      },
    };
    vi.stubGlobal("crypto", workerLikeCrypto);

    const invitation = await createTenantInvitationRecord({
      repository,
      email: "Tenant@Example.com",
      leaseId: LEASE_ID,
      invitedBy: USER_ID,
      organizationId: ORG_ID,
      now: new Date("2026-06-13T00:00:00.000Z"),
    });

    expect(invitation.id).toBe("44444444-4444-4444-8444-444444444444");
    expect(invitation.email).toBe("tenant@example.com");
    expect(repository.createdInvitation?.token).toHaveLength(43);
  });
});
