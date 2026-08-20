import type { PostgresExecutor } from "./postgres";
import type {
  CoreDataRepository,
  DeleteFinalizedEvidenceResult,
  DeleteLeaseTermVersionResult,
  JsonObject,
  LeaseRecord,
  LeaseTermVersionRecord,
  LeaseTermVersionSummaryRecord,
  PageResult,
  PropertyRecord,
  UnitRecord,
  UpdateLeaseRecoveryProfileResult,
} from "../../domain/core-data/repository";
import { lockPropertyFinancialEvidence } from "./financial-evidence-lock";

type CountRow = { total_count: string | number | bigint };
type IdRow = { id: string };
type LeaseScopeRow = { id: string; propertyId: string };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

const propertyFields = [
  "id",
  "organization_id",
  "name",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "postal_code",
  "total_rentable_sqft",
  "total_usable_sqft",
  "common_area_sqft",
  "target_occupancy",
  "boma_standard_version",
  "rsf_measurement_date",
  "fiscal_year_start_month",
  "tax_protest_county",
  "tax_protest_deadline_override",
  "created_at",
  "updated_at",
].join(", ");

const unitFields = [
  "id",
  "property_id",
  "unit_number",
  "rentable_sqft",
  "usable_sqft",
  "floor",
  "status",
  "space_type",
  "created_at",
  "updated_at",
].join(", ");

const leaseFields = [
  "id",
  "property_id",
  "unit_id",
  "tenant_name",
  "start_date",
  "end_date",
  "status",
  "recovery_profile",
  "document_url",
  "created_at",
  "updated_at",
].join(", ");

const leaseTermVersionFields = [
  "id",
  "lease_id",
  "version_number",
  "effective_date",
  "base_year",
  "base_year_amount",
  "gross_up_base_year",
  "pro_rata_share",
  "cap_type",
  "cap_rate",
  "admin_fee_percentage",
  "management_fee_percentage",
  "excluded_pools",
  "rsf_measurement_standard",
  "rsf_measurement_date",
  "amendment_reason",
  "amendment_document_url",
  "created_by",
  "created_at",
].join(", ");

const leaseTermVersionSelectFields = [
  "id",
  "lease_id",
  "version_number",
  "effective_date::text as effective_date",
  "base_year",
  "base_year_amount::text as base_year_amount",
  "gross_up_base_year",
  "pro_rata_share::text as pro_rata_share",
  "cap_type",
  "cap_rate::text as cap_rate",
  "admin_fee_percentage::text as admin_fee_percentage",
  "management_fee_percentage::text as management_fee_percentage",
  "excluded_pools",
  "rsf_measurement_standard",
  "rsf_measurement_date::text as rsf_measurement_date",
  "amendment_reason",
  "amendment_document_url",
  "created_by",
  "created_at",
].join(", ");

const leaseTermVersionSummarySelectFields = [
  "id",
  "version_number",
  "effective_date::text as effective_date",
  "pro_rata_share::text as pro_rata_share",
  "cap_type",
  "amendment_reason",
  "created_at",
].join(", ");

const propertyWritableFields = [
  "organization_id",
  "name",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "postal_code",
  "total_rentable_sqft",
  "total_usable_sqft",
  "common_area_sqft",
  "target_occupancy",
  "boma_standard_version",
  "rsf_measurement_date",
  "fiscal_year_start_month",
  "tax_protest_county",
  "tax_protest_deadline_override",
] as const;

const unitWritableFields = [
  "property_id",
  "unit_number",
  "rentable_sqft",
  "usable_sqft",
  "floor",
  "status",
  "space_type",
] as const;

const leaseWritableFields = [
  "property_id",
  "unit_id",
  "tenant_name",
  "start_date",
  "end_date",
  "status",
  "recovery_profile",
  "document_url",
] as const;

const leaseTermVersionWritableFields = [
  "lease_id",
  "version_number",
  "effective_date",
  "base_year",
  "base_year_amount",
  "gross_up_base_year",
  "pro_rata_share",
  "cap_type",
  "cap_rate",
  "admin_fee_percentage",
  "management_fee_percentage",
  "excluded_pools",
  "rsf_measurement_standard",
  "rsf_measurement_date",
  "amendment_reason",
  "amendment_document_url",
  "created_by",
] as const;

export class PostgresCoreDataRepository implements CoreDataRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async hasFullAccess(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<SubscriptionEntitlementRow>(
      [
        'select status, billing_model as "billingModel",',
        'stripe_subscription_id as "stripeSubscriptionId",',
        'current_period_end as "currentPeriodEnd"',
        "from subscriptions",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    if (!row) {
      return this.hasPurchasedCredits(organizationId);
    }

    if (row.billingModel === "credit_pack") {
      return this.hasPurchasedCredits(organizationId);
    }

    return (
      effectiveSubscriptionStatus(row) === "active" ||
      effectiveSubscriptionStatus(row) === "trialing"
    );
  }

  async listProperties(input: {
    organizationId: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<PropertyRecord>> {
    const count = await countRows(
      this.executor,
      "properties",
      ["organization_id = $1"],
      [input.organizationId],
    );
    const result = await this.executor.query<PropertyRecord>(
      [
        `select ${propertyFields}`,
        "from properties",
        "where organization_id = $1",
        "order by created_at desc",
        "offset $2 limit $3",
      ].join(" "),
      [input.organizationId, input.skip, input.limit],
    );

    return { data: result.rows, count };
  }

  async getProperty(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<PropertyRecord | null> {
    return (
      (
        await this.executor.query<PropertyRecord>(
          [
            `select ${propertyFields}`,
            "from properties",
            "where id = $1",
            "and organization_id = $2",
          ].join(" "),
          [input.propertyId, input.organizationId],
        )
      ).rows[0] ?? null
    );
  }

  async createProperty(input: {
    organizationId: string;
    data: JsonObject;
  }): Promise<PropertyRecord> {
    const values = { ...input.data, organization_id: input.organizationId };

    return insertReturning<PropertyRecord>(
      this.executor,
      "properties",
      propertyWritableFields,
      values,
      propertyFields,
    );
  }

  async updateProperty(input: {
    propertyId: string;
    organizationId: string;
    patch: JsonObject;
  }): Promise<PropertyRecord | null> {
    return updateReturning<PropertyRecord>({
      executor: this.executor,
      table: "properties",
      writableFields: propertyWritableFields,
      patch: input.patch,
      whereSql: "id = $1 and organization_id = $2",
      whereParams: [input.propertyId, input.organizationId],
      returningFields: propertyFields,
    });
  }

  async deleteProperty(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<DeleteFinalizedEvidenceResult> {
    return this.executor.transaction(async (executor) => {
      if (!(await this.propertyExistsWithExecutor(executor, input))) {
        return { state: "not_found" };
      }

      await lockPropertyFinancialEvidence(executor, input);

      const finalizedSnapshotCount = await countFinalizedPropertySnapshots(
        executor,
        input,
      );
      if (finalizedSnapshotCount > 0) {
        return { state: "finalized_reference", finalizedSnapshotCount };
      }

      const result = await executor.query<IdRow>(
        [
          "delete from properties",
          "where id = $1 and organization_id = $2",
          "returning id",
        ].join(" "),
        [input.propertyId, input.organizationId],
      );

      return result.rows.length > 0
        ? { state: "deleted" }
        : { state: "not_found" };
    });
  }

  async listUnits(input: {
    propertyId: string;
    organizationId: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<UnitRecord> | null> {
    if (!(await this.propertyExists(input))) {
      return null;
    }

    const count = await countRows(
      this.executor,
      "units",
      ["property_id = $1"],
      [input.propertyId],
    );
    const result = await this.executor.query<UnitRecord>(
      [
        `select ${unitFields}`,
        "from units",
        "where property_id = $1",
        "order by unit_number asc",
        "offset $2 limit $3",
      ].join(" "),
      [input.propertyId, input.skip, input.limit],
    );

    return { data: result.rows, count };
  }

  async getUnit(input: {
    propertyId: string;
    unitId: string;
    organizationId: string;
  }): Promise<UnitRecord | null> {
    if (!(await this.propertyExists(input))) {
      return null;
    }

    return (
      (
        await this.executor.query<UnitRecord>(
          [
            `select ${unitFields}`,
            "from units",
            "where id = $1 and property_id = $2",
          ].join(" "),
          [input.unitId, input.propertyId],
        )
      ).rows[0] ?? null
    );
  }

  async createUnit(input: {
    propertyId: string;
    data: JsonObject;
  }): Promise<UnitRecord> {
    const values = { ...input.data, property_id: input.propertyId };

    return insertReturning<UnitRecord>(
      this.executor,
      "units",
      unitWritableFields,
      values,
      unitFields,
    );
  }

  async updateUnit(input: {
    propertyId: string;
    unitId: string;
    patch: JsonObject;
  }): Promise<UnitRecord | null> {
    return updateReturning<UnitRecord>({
      executor: this.executor,
      table: "units",
      writableFields: unitWritableFields,
      patch: input.patch,
      whereSql: "id = $1 and property_id = $2",
      whereParams: [input.unitId, input.propertyId],
      returningFields: unitFields,
    });
  }

  async deleteUnit(input: {
    propertyId: string;
    unitId: string;
    organizationId: string;
  }): Promise<boolean> {
    if (!(await this.propertyExists(input))) {
      return false;
    }

    const result = await this.executor.query<IdRow>(
      "delete from units where id = $1 and property_id = $2 returning id",
      [input.unitId, input.propertyId],
    );

    return result.rows.length > 0;
  }

  async listLeases(input: {
    organizationId: string;
    propertyId?: string;
    status?: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<LeaseRecord>> {
    const filters = ["properties.organization_id = $1"];
    const params: unknown[] = [input.organizationId];

    if (input.propertyId) {
      params.push(input.propertyId);
      filters.push(`leases.property_id = $${params.length}`);
    }

    if (input.status) {
      params.push(input.status);
      filters.push(`leases.status = $${params.length}`);
    }

    const count = await countRows(
      this.executor,
      "leases join properties on properties.id = leases.property_id",
      filters,
      params,
    );

    params.push(input.skip, input.limit);
    const result = await this.executor.query<LeaseRecord>(
      [
        `select ${leaseFields
          .split(", ")
          .map((field) => `leases.${field}`)
          .join(", ")}`,
        "from leases",
        "join properties on properties.id = leases.property_id",
        `where ${filters.join(" and ")}`,
        "order by leases.created_at desc",
        `offset $${params.length - 1} limit $${params.length}`,
      ].join(" "),
      params,
    );

    return { data: result.rows, count };
  }

  async getLease(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<LeaseRecord | null> {
    return (
      (
        await this.executor.query<LeaseRecord>(
          [
            `select ${leaseFields
              .split(", ")
              .map((field) => `leases.${field}`)
              .join(", ")}`,
            "from leases",
            "join properties on properties.id = leases.property_id",
            "where leases.id = $1 and properties.organization_id = $2",
          ].join(" "),
          [input.leaseId, input.organizationId],
        )
      ).rows[0] ?? null
    );
  }

  async createLease(input: { data: JsonObject }): Promise<LeaseRecord> {
    return insertReturning<LeaseRecord>(
      this.executor,
      "leases",
      leaseWritableFields,
      input.data,
      leaseFields,
    );
  }

  async updateLease(input: {
    leaseId: string;
    organizationId: string;
    patch: JsonObject;
  }): Promise<LeaseRecord | null> {
    const names = leaseWritableFields.filter((field) =>
      Object.hasOwn(input.patch, field),
    );
    const assignments = names
      .map((field, index) => `${field} = $${index + 3}`)
      .join(", ");
    const params = [
      input.leaseId,
      input.organizationId,
      ...names.map((field) => input.patch[field]),
    ];
    const result = await this.executor.query<LeaseRecord>(
      [
        "update leases",
        `set ${assignments}`,
        "from properties",
        "where leases.property_id = properties.id",
        "and leases.id = $1",
        "and properties.organization_id = $2",
        `returning ${leaseFields
          .split(", ")
          .map((field) => `leases.${field}`)
          .join(", ")}`,
      ].join(" "),
      params,
    );

    return result.rows[0] ?? null;
  }

  async updateLeaseRecoveryProfile(input: {
    leaseId: string;
    organizationId: string;
    recoveryProfile: JsonObject;
  }): Promise<UpdateLeaseRecoveryProfileResult> {
    return this.executor.transaction(async (executor) => {
      const leaseScope = await executor.query<LeaseScopeRow>(
        [
          'select leases.id, leases.property_id as "propertyId"',
          "from leases",
          "join properties on properties.id = leases.property_id",
          "where leases.id = $1",
          "and properties.organization_id = $2",
        ].join(" "),
        [input.leaseId, input.organizationId],
      );
      const leaseScopeRow = leaseScope.rows[0];
      if (!leaseScopeRow) {
        return { state: "not_found" };
      }

      await lockPropertyFinancialEvidence(executor, {
        organizationId: input.organizationId,
        propertyId: leaseScopeRow.propertyId,
      });

      const finalizedResult = await executor.query<CountRow>(
        [
          "select count(*) as total_count",
          "from reconciliation_snapshots",
          "where lease_id = $1",
          "and organization_id = $2",
          "and status = 'finalized'",
        ].join(" "),
        [input.leaseId, input.organizationId],
      );
      const finalizedSnapshotCount = toCount(
        finalizedResult.rows[0]?.total_count ?? 0,
      );
      if (finalizedSnapshotCount > 0) {
        return { state: "finalized_reference", finalizedSnapshotCount };
      }

      const result = await executor.query<LeaseRecord>(
        [
          "update leases",
          "set recovery_profile = $3, updated_at = now()",
          "from properties",
          "where leases.property_id = properties.id",
          "and leases.id = $1",
          "and properties.organization_id = $2",
          `returning ${leaseFields
            .split(", ")
            .map((field) => `leases.${field}`)
            .join(", ")}`,
        ].join(" "),
        [input.leaseId, input.organizationId, input.recoveryProfile],
      );
      const lease = result.rows[0];
      if (!lease) {
        return { state: "not_found" };
      }

      return { state: "updated", lease };
    });
  }

  async deleteLease(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<DeleteFinalizedEvidenceResult> {
    return this.executor.transaction(async (executor) => {
      const leaseScope = await executor.query<LeaseScopeRow>(
        [
          'select leases.id, leases.property_id as "propertyId"',
          "from leases",
          "join properties on properties.id = leases.property_id",
          "where leases.id = $1",
          "and properties.organization_id = $2",
        ].join(" "),
        [input.leaseId, input.organizationId],
      );
      const lease = leaseScope.rows[0];
      if (!lease) {
        return { state: "not_found" };
      }

      await lockPropertyFinancialEvidence(executor, {
        organizationId: input.organizationId,
        propertyId: lease.propertyId,
      });

      const finalizedSnapshotCount = await countFinalizedLeaseSnapshots(
        executor,
        input,
      );
      if (finalizedSnapshotCount > 0) {
        return { state: "finalized_reference", finalizedSnapshotCount };
      }

      const result = await executor.query<IdRow>(
        [
          "delete from leases",
          "using properties",
          "where leases.property_id = properties.id",
          "and leases.id = $1",
          "and properties.organization_id = $2",
          "returning leases.id",
        ].join(" "),
        [input.leaseId, input.organizationId],
      );

      return result.rows.length > 0
        ? { state: "deleted" }
        : { state: "not_found" };
    });
  }

  async listLeaseTermVersions(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<LeaseTermVersionSummaryRecord[] | null> {
    if (!(await this.leaseExists(input))) {
      return null;
    }

    const result = await this.executor.query<LeaseTermVersionSummaryRecord>(
      [
        `select ${leaseTermVersionSummarySelectFields}`,
        "from lease_term_versions",
        "where lease_id = $1",
        "order by effective_date desc",
      ].join(" "),
      [input.leaseId],
    );

    return result.rows;
  }

  async getEffectiveLeaseTermVersion(input: {
    leaseId: string;
    organizationId: string;
    asOf: string;
  }): Promise<LeaseTermVersionRecord | null> {
    if (!(await this.leaseExists(input))) {
      return null;
    }

    const result = await this.executor.query<LeaseTermVersionRecord>(
      [
        `select ${leaseTermVersionSelectFields}`,
        "from lease_term_versions",
        "where lease_id = $1",
        "and effective_date <= $2::date",
        "order by effective_date desc",
        "limit 1",
      ].join(" "),
      [input.leaseId, input.asOf],
    );

    return normalizeLeaseTermVersion(result.rows[0] ?? null);
  }

  async getLeaseTermVersion(input: {
    leaseId: string;
    versionId: string;
    organizationId: string;
  }): Promise<LeaseTermVersionRecord | null> {
    if (!(await this.leaseExists(input))) {
      return null;
    }

    const result = await this.executor.query<LeaseTermVersionRecord>(
      [
        `select ${leaseTermVersionSelectFields}`,
        "from lease_term_versions",
        "where id = $1",
        "and lease_id = $2",
      ].join(" "),
      [input.versionId, input.leaseId],
    );

    return normalizeLeaseTermVersion(result.rows[0] ?? null);
  }

  async createLeaseTermVersion(input: {
    leaseId: string;
    organizationId: string;
    userId: string;
    data: JsonObject;
  }): Promise<LeaseTermVersionRecord | null> {
    return this.executor.transaction(async (executor) => {
      if (!(await this.leaseExistsWithExecutor(executor, input))) {
        return null;
      }

      const maxResult = await executor.query<{ version_number: number | null }>(
        [
          "select version_number",
          "from lease_term_versions",
          "where lease_id = $1",
          "order by version_number desc",
          "limit 1",
        ].join(" "),
        [input.leaseId],
      );
      const nextVersion = Number(maxResult.rows[0]?.version_number ?? 0) + 1;
      const values = {
        ...input.data,
        lease_id: input.leaseId,
        version_number: nextVersion,
        created_by: input.userId,
      };

      return insertReturning<LeaseTermVersionRecord>(
        executor,
        "lease_term_versions",
        leaseTermVersionWritableFields,
        values,
        leaseTermVersionFields,
      ).then(normalizeLeaseTermVersionRequired);
    });
  }

  async deleteLeaseTermVersion(input: {
    leaseId: string;
    versionId: string;
    organizationId: string;
  }): Promise<DeleteLeaseTermVersionResult> {
    return this.executor.transaction(async (executor) => {
      if (!(await this.leaseExistsWithExecutor(executor, input))) {
        return { state: "not_found" };
      }

      const versionResult = await executor.query<IdRow>(
        [
          "select id from lease_term_versions",
          "where id = $1",
          "and lease_id = $2",
        ].join(" "),
        [input.versionId, input.leaseId],
      );
      if (!versionResult.rows[0]) {
        return { state: "not_found" };
      }

      const finalizedResult = await executor.query<CountRow>(
        [
          "select count(*) as total_count",
          "from reconciliation_snapshots",
          "where term_version_id = $1",
          "and status = 'finalized'",
        ].join(" "),
        [input.versionId],
      );
      const finalizedSnapshotCount = toCount(
        finalizedResult.rows[0]?.total_count ?? 0,
      );
      if (finalizedSnapshotCount > 0) {
        return { state: "finalized_reference", finalizedSnapshotCount };
      }

      await executor.query("delete from lease_term_versions where id = $1", [
        input.versionId,
      ]);

      return { state: "deleted" };
    });
  }

  async propertyExists(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean> {
    return this.propertyExistsWithExecutor(this.executor, input);
  }

  async unitBelongsToProperty(input: {
    propertyId: string;
    unitId: string;
    organizationId: string;
  }): Promise<boolean> {
    if (!(await this.propertyExists(input))) {
      return false;
    }

    const result = await this.executor.query<IdRow>(
      "select id from units where id = $1 and property_id = $2",
      [input.unitId, input.propertyId],
    );

    return result.rows.length > 0;
  }

  private async leaseExists(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<boolean> {
    return this.leaseExistsWithExecutor(this.executor, input);
  }

  private async leaseExistsWithExecutor(
    executor: PostgresExecutor,
    input: { leaseId: string; organizationId: string },
  ): Promise<boolean> {
    const result = await executor.query<IdRow>(
      [
        "select leases.id",
        "from leases",
        "join properties on properties.id = leases.property_id",
        "where leases.id = $1",
        "and properties.organization_id = $2",
      ].join(" "),
      [input.leaseId, input.organizationId],
    );

    return result.rows.length > 0;
  }

  private async propertyExistsWithExecutor(
    executor: PostgresExecutor,
    input: { propertyId: string; organizationId: string },
  ): Promise<boolean> {
    const result = await executor.query<IdRow>(
      "select id from properties where id = $1 and organization_id = $2",
      [input.propertyId, input.organizationId],
    );

    return result.rows.length > 0;
  }

  private async hasPurchasedCredits(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<{ exists: boolean }>(
      [
        "select exists (",
        "select 1 from audit_credits",
        "where organization_id = $1",
        "and credits_purchased > 0",
        ")",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0]?.exists === true;
  }
}

function toCount(value: string | number | bigint): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  return Number.parseInt(value, 10);
}

async function countRows(
  executor: PostgresExecutor,
  fromSql: string,
  filters: readonly string[],
  params: readonly unknown[],
): Promise<number> {
  const result = await executor.query<CountRow>(
    [
      "select count(*) as total_count",
      `from ${fromSql}`,
      filters.length > 0 ? `where ${filters.join(" and ")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    params,
  );

  return toCount(result.rows[0]?.total_count ?? 0);
}

function effectiveSubscriptionStatus(row: SubscriptionEntitlementRow): string {
  if (
    row.status !== "trialing" ||
    row.stripeSubscriptionId ||
    !row.currentPeriodEnd
  ) {
    return row.status;
  }

  const periodEnd =
    row.currentPeriodEnd instanceof Date
      ? row.currentPeriodEnd
      : new Date(row.currentPeriodEnd);

  if (Number.isNaN(periodEnd.getTime())) {
    return row.status;
  }

  return periodEnd.getTime() < Date.now() ? "paused" : row.status;
}

function normalizeLeaseTermVersion(
  row: LeaseTermVersionRecord | null,
): LeaseTermVersionRecord | null {
  return row ? normalizeLeaseTermVersionRequired(row) : null;
}

function normalizeLeaseTermVersionRequired(
  row: LeaseTermVersionRecord,
): LeaseTermVersionRecord {
  return {
    ...row,
    effective_date: serializeOptionalDate(row.effective_date) ?? "",
    base_year_amount: serializeOptionalMoney(row.base_year_amount),
    pro_rata_share: serializeMoney(row.pro_rata_share),
    cap_rate: serializeOptionalMoney(row.cap_rate),
    admin_fee_percentage: serializeMoney(row.admin_fee_percentage),
    management_fee_percentage: serializeOptionalMoney(
      row.management_fee_percentage,
    ),
    excluded_pools: Array.isArray(row.excluded_pools) ? row.excluded_pools : [],
    rsf_measurement_date: serializeOptionalDate(row.rsf_measurement_date),
    created_at: serializeDateTime(row.created_at),
  };
}

function serializeMoney(value: unknown): string {
  return value === null || value === undefined ? "0" : String(value);
}

function serializeOptionalMoney(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function serializeOptionalDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value);
}

function serializeDateTime(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

async function countFinalizedPropertySnapshots(
  executor: PostgresExecutor,
  input: { propertyId: string; organizationId: string },
): Promise<number> {
  const result = await executor.query<CountRow>(
    [
      "select count(*) as total_count",
      "from reconciliation_snapshots",
      "where property_id = $1",
      "and organization_id = $2",
      "and status = 'finalized'",
    ].join(" "),
    [input.propertyId, input.organizationId],
  );

  return toCount(result.rows[0]?.total_count ?? 0);
}

async function countFinalizedLeaseSnapshots(
  executor: PostgresExecutor,
  input: { leaseId: string; organizationId: string },
): Promise<number> {
  const result = await executor.query<CountRow>(
    [
      "select count(*) as total_count",
      "from reconciliation_snapshots",
      "where lease_id = $1",
      "and organization_id = $2",
      "and status = 'finalized'",
    ].join(" "),
    [input.leaseId, input.organizationId],
  );

  return toCount(result.rows[0]?.total_count ?? 0);
}

async function insertReturning<Row>(
  executor: PostgresExecutor,
  table: string,
  fields: readonly string[],
  data: JsonObject,
  returningFields: string,
): Promise<Row> {
  const names = fields.filter((field) => Object.hasOwn(data, field));
  const values = names.map((field) => data[field]);
  const placeholders = names.map((_, index) => `$${index + 1}`).join(", ");
  const result = await executor.query<Row>(
    [
      `insert into ${table} (${names.join(", ")})`,
      `values (${placeholders})`,
      `returning ${returningFields}`,
    ].join(" "),
    values,
  );
  const row = result.rows[0];

  if (!row) {
    throw new Error(`Failed to insert ${table} row`);
  }

  return row;
}

async function updateReturning<Row>(input: {
  executor: PostgresExecutor;
  table: string;
  writableFields: readonly string[];
  patch: JsonObject;
  whereSql: string;
  whereParams: readonly unknown[];
  returningFields: string;
}): Promise<Row | null> {
  const names = input.writableFields.filter((field) =>
    Object.hasOwn(input.patch, field),
  );
  const assignments = names
    .map(
      (field, index) => `${field} = $${index + input.whereParams.length + 1}`,
    )
    .join(", ");
  const params = [
    ...input.whereParams,
    ...names.map((field) => input.patch[field]),
  ];
  const result = await input.executor.query<Row>(
    [
      `update ${input.table}`,
      `set ${assignments}`,
      `where ${input.whereSql}`,
      `returning ${input.returningFields}`,
    ].join(" "),
    params,
  );

  return result.rows[0] ?? null;
}
