import Decimal from "decimal.js";
import { z } from "zod";

const outOfRangeMessage =
  "One or more values are too large to compute. Enter realistic figures.";

/**
 * Module-local Decimal context for financial tool calculations.
 * Uses 40 sig-figs / ROUND_HALF_UP to match the original intent while
 * avoiding mutation of the global decimal.js isolate-wide state.
 */
const Calc = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export class ToolCalculationError extends Error {
  constructor(
    readonly status: 422,
    readonly detail: string,
  ) {
    super(detail);
  }
}

const decimalStringSchema = z
  .union([z.string(), z.number()])
  .transform((value) => decimalFromInput(value));

export const bomaCalculationSchema = z.object({
  usable_sf: decimalStringSchema.refine((value) => value.gt(0)),
  rentable_sf: decimalStringSchema.refine((value) => value.gt(0)),
  balcony_sf: decimalStringSchema.refine((value) => value.gte(0)).default("0"),
  terrace_sf: decimalStringSchema.refine((value) => value.gte(0)).default("0"),
  outdoor_amenity_sf: decimalStringSchema
    .refine((value) => value.gte(0))
    .default("0"),
  annual_rent_per_sf: decimalStringSchema
    .refine((value) => value.gt(0))
    .optional(),
  cap_rate: decimalStringSchema
    .refine((value) => value.gt(0) && value.lte(1))
    .default("0.065"),
});

export const hcadCalculationSchema = z
  .object({
    original_base_year_assessment: decimalStringSchema.refine((value) =>
      value.gte(0),
    ),
    retroactive_adjustment: decimalStringSchema.refine((value) => value.gte(0)),
    current_year_tax: decimalStringSchema.refine((value) => value.gt(0)),
    pro_rata_pct: decimalStringSchema.refine(
      (value) => value.gt(0) && value.lte(1),
    ),
    cap_rate: decimalStringSchema
      .refine((value) => value.gt(0) && value.lt(1))
      .optional(),
  })
  .refine(
    (value) =>
      value.retroactive_adjustment.lte(value.original_base_year_assessment),
    {
      message:
        "retroactive_adjustment cannot exceed original_base_year_assessment",
      path: ["retroactive_adjustment"],
    },
  );

export const fixedCamCalculationSchema = z.object({
  years: z
    .array(
      z.object({
        year: z.number().int(),
        total_operating_expenses: decimalStringSchema.refine((value) =>
          value.gte(0),
        ),
        rentable_sf: decimalStringSchema.refine((value) => value.gt(0)),
      }),
    )
    .min(3)
    .max(5),
  fixed_cam_rate_per_sf: decimalStringSchema.refine((value) => value.gt(0)),
  annual_escalation_pct: decimalStringSchema.refine(
    (value) => value.gte(0) && value.lte(15),
  ),
  tenant_sqft: decimalStringSchema.refine((value) => value.gt(0)),
  pro_rata_share: decimalStringSchema.refine(
    (value) => value.gte(0) && value.lte(100),
  ),
});

export function calculateBoma2024(
  input: z.infer<typeof bomaCalculationSchema>,
) {
  if (input.rentable_sf.lt(input.usable_sf)) {
    throw new ToolCalculationError(
      422,
      "rentable_sf must be >= usable_sf (load factor < 1 is invalid)",
    );
  }

  try {
    const loadFactor = input.rentable_sf
      .div(input.usable_sf)
      .toDecimalPlaces(4);
    const newUsableSf = input.usable_sf
      .plus(input.balcony_sf)
      .plus(input.terrace_sf)
      .plus(input.outdoor_amenity_sf)
      .toDecimalPlaces(2);
    const newRentableSf = newUsableSf.mul(loadFactor).toDecimalPlaces(2);
    const hiddenSf = Calc.max(
      0,
      newRentableSf.minus(input.rentable_sf),
    ).toDecimalPlaces(2);
    const pctIncrease = hiddenSf
      .div(input.rentable_sf)
      .mul(100)
      .toDecimalPlaces(4);

    // Financial projections require a rent figure. The SF geometry above is
    // always returned; revenue/asset lift are null until the caller supplies
    // annual_rent_per_sf.
    const annualRentPerSf = input.annual_rent_per_sf;
    const revenueLift = annualRentPerSf
      ? hiddenSf.mul(annualRentPerSf).toDecimalPlaces(2)
      : null;
    const assetValueLift = revenueLift
      ? revenueLift.div(input.cap_rate).toDecimalPlaces(0)
      : null;

    return {
      load_factor: decimalString(loadFactor, 4),
      new_usable_sf: decimalString(newUsableSf, 2),
      new_rentable_sf: decimalString(newRentableSf, 2),
      hidden_sf: decimalString(hiddenSf, 2),
      pct_increase: decimalString(pctIncrease, 4),
      revenue_lift: revenueLift ? decimalString(revenueLift, 2) : null,
      asset_value_lift: assetValueLift
        ? decimalString(assetValueLift, 0)
        : null,
    };
  } catch (error) {
    throw arithmeticError(error);
  }
}

export function calculateHcad(input: z.infer<typeof hcadCalculationSchema>) {
  try {
    const adjustedBaseYear = input.original_base_year_assessment.minus(
      input.retroactive_adjustment,
    );
    const originalPassthrough = baseYearPassthrough(
      input.current_year_tax,
      input.original_base_year_assessment,
      input.pro_rata_pct,
    );
    const correctedPassthrough = baseYearPassthrough(
      input.current_year_tax,
      adjustedBaseYear,
      input.pro_rata_pct,
    );
    const recoveryDelta = correctedPassthrough
      .minus(originalPassthrough)
      .toDecimalPlaces(2);

    if (!input.cap_rate) {
      return {
        adjusted_base_year: decimalString(adjustedBaseYear, 2),
        original_passthrough: decimalString(originalPassthrough, 2),
        corrected_passthrough: decimalString(correctedPassthrough, 2),
        recovery_delta: decimalString(recoveryDelta, 2),
        capped_corrected_passthrough: null,
        capped_recovery: null,
        cap_was_applied: null,
      };
    }

    const maxAllowed = originalPassthrough
      .mul(input.cap_rate.plus(1))
      .toDecimalPlaces(2);
    const cappedCorrected = Calc.min(
      correctedPassthrough,
      maxAllowed,
    ).toDecimalPlaces(2);
    const cappedRecovery = cappedCorrected
      .minus(originalPassthrough)
      .toDecimalPlaces(2);

    return {
      adjusted_base_year: decimalString(adjustedBaseYear, 2),
      original_passthrough: decimalString(originalPassthrough, 2),
      corrected_passthrough: decimalString(correctedPassthrough, 2),
      recovery_delta: decimalString(recoveryDelta, 2),
      capped_corrected_passthrough: decimalString(cappedCorrected, 2),
      capped_recovery: decimalString(cappedRecovery, 2),
      cap_was_applied: cappedCorrected.lt(correctedPassthrough),
    };
  } catch (error) {
    throw arithmeticError(error);
  }
}

export function calculateFixedCam(
  input: z.infer<typeof fixedCamCalculationSchema>,
) {
  try {
    const sortedYears = [...input.years].sort(
      (left, right) => left.year - right.year,
    );
    const escalationRate = input.annual_escalation_pct.div(100).plus(1);
    const proRataFactor = input.pro_rata_share.div(100);
    let cumulativeDelta = new Calc(0);
    let totalTraditional = new Calc(0);
    let totalFixed = new Calc(0);

    const years = sortedYears.map((year, index) => {
      const expensePerSf = year.total_operating_expenses
        .div(year.rentable_sf)
        .toDecimalPlaces(2);
      const traditionalRecovery = year.total_operating_expenses
        .mul(proRataFactor)
        .toDecimalPlaces(2);
      const escalatedRate = input.fixed_cam_rate_per_sf
        .mul(escalationRate.pow(index))
        .toDecimalPlaces(2);
      const fixedCamRevenue = input.fixed_cam_rate_per_sf
        .mul(escalationRate.pow(index))
        .mul(input.tenant_sqft)
        .toDecimalPlaces(2);
      const delta = traditionalRecovery
        .minus(fixedCamRevenue)
        .toDecimalPlaces(2);
      cumulativeDelta = cumulativeDelta.plus(delta).toDecimalPlaces(2);
      totalTraditional = totalTraditional.plus(traditionalRecovery);
      totalFixed = totalFixed.plus(fixedCamRevenue);

      return {
        year: year.year,
        total_operating_expenses: decimalString(
          year.total_operating_expenses,
          2,
        ),
        expense_per_sf: decimalString(expensePerSf, 2),
        traditional_recovery: decimalString(traditionalRecovery, 2),
        fixed_cam_revenue: decimalString(fixedCamRevenue, 2),
        delta: decimalString(delta, 2),
        cumulative_delta: decimalString(cumulativeDelta, 2),
        escalated_rate_per_sf: decimalString(escalatedRate, 2),
      };
    });
    const totalDelta = totalTraditional.minus(totalFixed).toDecimalPlaces(2);
    const avgAnnualDelta = totalDelta
      .div(sortedYears.length)
      .toDecimalPlaces(2);

    return {
      years,
      total_traditional_recovery: decimalString(totalTraditional, 2),
      total_fixed_cam_revenue: decimalString(totalFixed, 2),
      total_delta: decimalString(totalDelta, 2),
      avg_annual_delta: decimalString(avgAnnualDelta, 2),
    };
  } catch (error) {
    throw arithmeticError(error);
  }
}

function baseYearPassthrough(
  currentYearTax: Decimal,
  baseYearAmount: Decimal,
  proRata: Decimal,
): Decimal {
  return Calc.max(0, currentYearTax.minus(baseYearAmount))
    .mul(proRata)
    .toDecimalPlaces(2);
}

function decimalFromInput(value: string | number): Decimal {
  try {
    const decimal = new Calc(value);
    if (!decimal.isFinite()) {
      throw new Error("non-finite decimal");
    }
    return decimal;
  } catch {
    throw new ToolCalculationError(422, "Input must be a finite decimal value");
  }
}

function decimalString(value: Decimal, places: number): string {
  return value.toFixed(places);
}

function arithmeticError(error: unknown): ToolCalculationError {
  if (error instanceof ToolCalculationError) {
    return error;
  }

  return new ToolCalculationError(422, outOfRangeMessage);
}
