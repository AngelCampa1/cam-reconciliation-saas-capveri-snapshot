import type {
  OnboardInitResult,
  OnboardUpgradeResult,
  OnboardingRepository,
} from "../../domain/onboarding/repository";
import type { PostgresExecutor } from "./postgres";

type OnboardUserRow = {
  id: string;
  organizationId: string;
  email: string;
};
type OrgRow = { id: string };

export class PostgresOnboardingRepository implements OnboardingRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  initUser(input: { userId: string }): Promise<OnboardInitResult> {
    return this.executor.transaction(async (executor) => {
      const existing = await findUser(executor, input.userId);
      if (existing) {
        return {
          state: "already_exists",
          organizationId: existing.organizationId,
          userId: existing.id,
        };
      }

      const orgResult = await executor.query<OrgRow>(
        "insert into organizations (name) values ($1) returning id",
        ["Anonymous Org"],
      );
      const organizationId = orgResult.rows[0]?.id;
      if (!organizationId) {
        throw new Error("Organization insert did not return an id");
      }

      const placeholderEmail = `anon+${input.userId.slice(0, 8)}@placeholder.capveri.com`;
      const userResult = await executor.query<OnboardUserRow>(
        [
          "insert into users (id, organization_id, email, role)",
          "values ($1, $2, $3, 'owner')",
          "on conflict (id) do nothing",
          'returning id, organization_id as "organizationId", email',
        ].join(" "),
        [input.userId, organizationId, placeholderEmail],
      );

      if (userResult.rows[0]) {
        return {
          state: "created",
          organizationId,
          userId: input.userId,
        };
      }

      await executor.query("delete from organizations where id = $1", [
        organizationId,
      ]);
      const existingAfterRace = await findUser(executor, input.userId);
      if (existingAfterRace) {
        return {
          state: "already_exists",
          organizationId: existingAfterRace.organizationId,
          userId: existingAfterRace.id,
        };
      }

      throw new Error("Unable to create onboarding user record");
    });
  }

  upgradeUser(input: {
    userId: string;
    organizationId: string;
    email: string;
    organizationName: string;
  }): Promise<OnboardUpgradeResult> {
    // Wrap both updates in a single transaction so a failure after the user
    // email update cannot leave the user upgraded while the organization name
    // stays "Anonymous Org" (asymmetric, half-applied upgrade). Mirrors the
    // transactional initUser flow above.
    return this.executor.transaction(async (executor) => {
      const result = await executor.query<{ id: string }>(
        "update users set email = $2 where id = $1 returning id",
        [input.userId, input.email],
      );

      if (!result.rows[0]) {
        return { state: "user_not_found" };
      }

      await executor.query(
        "update organizations set name = $2 where id = $1",
        [input.organizationId, input.organizationName],
      );

      return { state: "updated" };
    });
  }
}

async function findUser(
  executor: PostgresExecutor,
  userId: string,
): Promise<OnboardUserRow | undefined> {
  const result = await executor.query<OnboardUserRow>(
    [
      'select id, organization_id as "organizationId", email',
      "from users",
      "where id = $1",
    ].join(" "),
    [userId],
  );

  return result.rows[0];
}
