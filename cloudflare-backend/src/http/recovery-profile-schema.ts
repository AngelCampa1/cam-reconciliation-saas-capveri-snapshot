import { z } from "zod";

const decimalInputSchema = z.union([z.number(), z.string()]);

const boundedDecimalSchema = (minimum: number, maximum: number) =>
  decimalInputSchema.refine(
    (value) => {
      if (!isPlainDecimal(value)) {
        return false;
      }
      const numeric = Number(value);

      return (
        Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum
      );
    },
    { message: `Expected decimal between ${minimum} and ${maximum}` },
  );

const nonNegativeDecimalSchema = decimalInputSchema.refine(
  (value) => {
    if (!isPlainDecimal(value)) {
      return false;
    }
    const numeric = Number(value);

    return Number.isFinite(numeric) && numeric >= 0;
  },
  { message: "Expected non-negative decimal" },
);

const capTypeSchema = z
  .enum(["none", "non_cumulative", "cumulative", "cumulative_compounding"])
  .default("none");

const baseYearAdjustmentSchema = z.object({
  service_name: z.string().trim().min(1),
  imputed_amount: nonNegativeDecimalSchema,
  justification: z.string(),
});

export const leaseRecoveryProfileSchema = z
  .object({
    base_year: z.number().int().min(1990).max(2100).nullable().optional(),
    base_year_amount: nonNegativeDecimalSchema.nullable().optional(),
    gross_up_base_year: z.boolean().default(false),
    pro_rata_share: boundedDecimalSchema(0, 1),
    cap_type: capTypeSchema,
    cap_rate: boundedDecimalSchema(0, 1).nullable().optional(),
    admin_fee_percentage: boundedDecimalSchema(0, 0.2).default("0"),
    management_fee_percentage: boundedDecimalSchema(0, 0.2)
      .nullable()
      .optional(),
    excluded_pools: z
      .array(z.enum(["operating", "tax", "insurance", "capital", "other"]))
      .default([]),
    rsf_measurement_standard: z
      .enum(["2010", "2017", "2024", "custom"])
      .nullable()
      .optional(),
    rsf_measurement_date: z.string().date().nullable().optional(),
    accounting_basis: z.enum(["cash", "accrual"]).nullable().optional(),
    base_year_adjustments: z.array(baseYearAdjustmentSchema).default([]),
  })
  .refine(
    (profile) =>
      profile.cap_type === "none" ||
      (profile.cap_rate !== undefined && profile.cap_rate !== null),
    {
      path: ["cap_rate"],
      message: "cap_rate is required when cap_type is not none",
    },
  );

export const leaseRecoveryProfilePatchSchema = z
  .object({
    base_year: z.number().int().min(1990).max(2100).nullable().optional(),
    base_year_amount: nonNegativeDecimalSchema.nullable().optional(),
    gross_up_base_year: z.boolean().optional(),
    pro_rata_share: boundedDecimalSchema(0, 1).optional(),
    cap_type: z
      .enum(["none", "non_cumulative", "cumulative", "cumulative_compounding"])
      .optional(),
    cap_rate: boundedDecimalSchema(0, 1).nullable().optional(),
    admin_fee_percentage: boundedDecimalSchema(0, 0.2).optional(),
    management_fee_percentage: boundedDecimalSchema(0, 0.2)
      .nullable()
      .optional(),
    excluded_pools: z
      .array(z.enum(["operating", "tax", "insurance", "capital", "other"]))
      .optional(),
    rsf_measurement_standard: z
      .enum(["2010", "2017", "2024", "custom"])
      .nullable()
      .optional(),
    rsf_measurement_date: z.string().date().nullable().optional(),
    accounting_basis: z.enum(["cash", "accrual"]).nullable().optional(),
    base_year_adjustments: z.array(baseYearAdjustmentSchema).optional(),
  })
  .strict();

export type LeaseRecoveryProfile = z.infer<typeof leaseRecoveryProfileSchema>;

export function normalizeLeaseRecoveryProfile(
  profile: unknown,
): LeaseRecoveryProfile {
  const parsed = leaseRecoveryProfileSchema.parse(profile);

  return {
    ...parsed,
    base_year_amount: decimalToStringOrNull(parsed.base_year_amount),
    pro_rata_share: decimalToString(parsed.pro_rata_share),
    cap_rate: decimalToStringOrNull(parsed.cap_rate),
    admin_fee_percentage: decimalToString(parsed.admin_fee_percentage),
    management_fee_percentage: decimalToStringOrNull(
      parsed.management_fee_percentage,
    ),
    base_year_adjustments: parsed.base_year_adjustments.map((adjustment) => ({
      ...adjustment,
      imputed_amount: decimalToString(adjustment.imputed_amount),
    })),
  };
}

function decimalToString(value: string | number): string {
  return String(value);
}

function decimalToStringOrNull(
  value: string | number | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  return decimalToString(value);
}

function isPlainDecimal(value: string | number): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return /^-?(?:\d+|\d+\.\d+|\.\d+)$/.test(value.trim());
}
