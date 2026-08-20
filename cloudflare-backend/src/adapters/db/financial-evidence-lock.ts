import type { PostgresExecutor } from "./postgres";

export async function lockPropertyFinancialEvidence(
  executor: PostgresExecutor,
  input: { organizationId: string; propertyId: string },
): Promise<void> {
  await executor.query(
    "select pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    [
      "capveri:financial-evidence",
      `${input.organizationId}:${input.propertyId}`,
    ],
  );
}
