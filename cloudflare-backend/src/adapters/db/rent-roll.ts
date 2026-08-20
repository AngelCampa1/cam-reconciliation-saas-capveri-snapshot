import Decimal from "decimal.js";
import type { PostgresExecutor } from "./postgres";
import type {
  RentRollImportInput,
  RentRollImportResult,
  RentRollRepository,
} from "../../domain/rent-roll/repository";

type IdRow = { id: string };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

const propertyFields = "id, name";
const unitFields = "id";
const leaseFields = "id";

export class PostgresRentRollRepository implements RentRollRepository {
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

  async importRentRoll(
    input: RentRollImportInput,
  ): Promise<RentRollImportResult> {
    try {
      return await this.executor.transaction(async (executor) => {
        const totalRentableSqft = input.units.reduce(
          (sum, unit) => sum.plus(unit.rentable_sqft),
          new Decimal(0),
        );
        let totalUsableSqft = input.units.reduce(
          (sum, unit) =>
            sum.plus(
              unit.usable_sqft ?? new Decimal(unit.rentable_sqft).mul(0.9),
            ),
          new Decimal(0),
        );
        if (totalUsableSqft.gt(totalRentableSqft)) {
          totalUsableSqft = totalRentableSqft.mul(0.9);
        }
        const commonAreaSqft = totalRentableSqft.minus(totalUsableSqft);
        const property = await insertReturning<{ id: string; name: string }>(
          executor,
          "properties",
          [
            "organization_id",
            "name",
            "address_line1",
            "city",
            "state",
            "postal_code",
            "total_rentable_sqft",
            "total_usable_sqft",
            "common_area_sqft",
            "target_occupancy",
          ],
          {
            organization_id: input.organizationId,
            name: input.propertyName,
            address_line1: input.addressLine1,
            city: input.city,
            state: input.state,
            postal_code: input.postalCode,
            total_rentable_sqft: totalRentableSqft.toFixed(2),
            total_usable_sqft: totalUsableSqft.toFixed(2),
            common_area_sqft: commonAreaSqft.toFixed(2),
            target_occupancy: "0.95",
          },
          propertyFields,
        );

        let unitsCreated = 0;
        let leasesCreated = 0;
        for (const unit of input.units) {
          const usableSqft =
            unit.usable_sqft ??
            new Decimal(unit.rentable_sqft).mul(0.9).toFixed(2);
          const createdUnit = await insertReturning<IdRow>(
            executor,
            "units",
            [
              "property_id",
              "unit_number",
              "rentable_sqft",
              "usable_sqft",
              "floor",
              "status",
            ],
            {
              property_id: property.id,
              unit_number: unit.unit_number,
              rentable_sqft: unit.rentable_sqft,
              usable_sqft: usableSqft,
              floor: unit.floor,
              status: unit.tenant_name ? "occupied" : "vacant",
            },
            unitFields,
          );
          unitsCreated += 1;

          if (unit.tenant_name && unit.lease_start && unit.lease_end) {
            await insertReturning<IdRow>(
              executor,
              "leases",
              [
                "property_id",
                "unit_id",
                "tenant_name",
                "start_date",
                "end_date",
                "status",
                "recovery_profile",
              ],
              {
                property_id: property.id,
                unit_id: createdUnit.id,
                tenant_name: unit.tenant_name,
                start_date: unit.lease_start,
                end_date: unit.lease_end,
                status: "active",
                recovery_profile: {
                  base_year: null,
                  base_year_amount: null,
                  gross_up_base_year: false,
                  pro_rata_share: unit.cam_share ?? "0",
                  cap_type: "none",
                  cap_rate: null,
                  admin_fee_percentage: "0",
                  management_fee_percentage: null,
                  excluded_pools: [],
                },
              },
              leaseFields,
            );
            leasesCreated += 1;
          }
        }

        return {
          state: "created",
          propertyId: property.id,
          propertyName: property.name,
          unitsCreated,
          leasesCreated,
        };
      });
    } catch (error) {
      return {
        state: "failed",
        message: translateDbError(error),
      };
    }
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

async function insertReturning<Row>(
  executor: PostgresExecutor,
  table: string,
  fields: readonly string[],
  values: Record<string, unknown>,
  returningFields: string,
): Promise<Row> {
  const names = fields.filter((field) => Object.hasOwn(values, field));
  const params = names.map((field) => values[field]);
  const result = await executor.query<Row>(
    [
      `insert into ${table} (${names.join(", ")})`,
      `values (${names.map((_, index) => `$${index + 1}`).join(", ")})`,
      `returning ${returningFields}`,
    ].join(" "),
    params,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Failed to insert ${table}`);
  }

  return row;
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

function translateDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("unique_unit_per_property")) {
    return "Duplicate unit number found. Each unit must have a unique number.";
  }
  if (message.includes("properties_common_area_sqft_check")) {
    return "Common area square footage must be a positive number.";
  }
  if (message.includes("properties_total_rentable_sqft_check")) {
    return "Total rentable square footage must be a positive number.";
  }
  if (message.includes("properties_total_usable_sqft_check")) {
    return "Total usable square footage must be a positive number.";
  }
  if (message.includes("units_rentable_sqft_check")) {
    return "Unit rentable square footage must be a positive number.";
  }
  if (message.includes("leases_base_rent_check")) {
    return "Base rent must be a positive number.";
  }

  return `Import failed: ${message}`;
}
