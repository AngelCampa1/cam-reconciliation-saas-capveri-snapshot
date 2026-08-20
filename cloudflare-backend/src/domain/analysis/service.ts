import Decimal from "decimal.js";
import type {
  AnalysisRepository,
  AnomalyDetectionRequest,
  AnomalyDetectionResponse,
  AnomalySeverity,
  DetectedAnomaly,
  PoolComparison,
  PoolMapping,
  VarianceLevel,
  YearOverYearComparison,
  YearOverYearRequest,
} from "./repository";

/**
 * Module-local Decimal context mirroring Python's decimal default:
 * 28 significant digits, ROUND_HALF_EVEN (banker's rounding).
 * Used for all money + variance-% math to avoid drift vs the FastAPI source.
 * Do NOT mutate the global Decimal state (Workers best practice).
 */
const PyDecimal = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export class AnalysisInputError extends Error {}

export class AnalysisNotFoundError extends Error {}

type PoolDataByYear = Map<number, Map<string, Decimal>>;

export async function buildYearOverYearComparison(
  repository: AnalysisRepository,
  input: YearOverYearRequest & { organizationId: string },
): Promise<YearOverYearComparison> {
  validateComparisonYears(input.years);

  const years = [...input.years].sort((left, right) => left - right);
  const baseYear = years[0];
  const latestYear = years[years.length - 1];
  if (baseYear === undefined || latestYear === undefined) {
    throw new AnalysisInputError("At least 2 years required for comparison");
  }
  const propertyName = await repository.getPropertyName({
    propertyId: input.property_id,
    organizationId: input.organizationId,
  });
  if (!propertyName) {
    throw new AnalysisNotFoundError(`Property not found: ${input.property_id}`);
  }

  const finalizedYears = await repository.listFinalizedSnapshotYears({
    propertyId: input.property_id,
    years,
    organizationId: input.organizationId,
  });
  const finalizedYearSet = new Set(finalizedYears);
  const missingYears = years.filter((year) => !finalizedYearSet.has(year));
  if (missingYears.length > 0) {
    throw new AnalysisInputError(
      `No finalized snapshots found for years: ${missingYears.join(", ")}`,
    );
  }

  const poolDataByYear = await loadPoolDataByYear(repository, {
    propertyId: input.property_id,
    years,
    organizationId: input.organizationId,
  });
  const allPoolNames = new Set<string>();
  for (const yearPools of poolDataByYear.values()) {
    for (const poolName of yearPools.keys()) {
      allPoolNames.add(poolName);
    }
  }

  const poolMappings =
    input.use_fuzzy_matching && years.length > 1
      ? buildPoolMappings(poolDataByYear, years)
      : new Map<number, Map<string, string>>();

  // FIX 3: ordinal code-point order to match Python's sorted() — uppercase before lowercase
  const poolComparisons: PoolComparison[] = [...allPoolNames]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((poolName) =>
      buildPoolComparison({
        poolName,
        years,
        baseYear,
        poolDataByYear,
        poolMappings,
      }),
    );

  const totalAmounts: Record<string, string> = {};
  for (const year of years) {
    let total = new PyDecimal(0);
    for (const amount of poolDataByYear.get(year)?.values() ?? []) {
      total = total.plus(amount);
    }
    totalAmounts[String(year)] = total.toFixed();
  }

  const baseTotal = new PyDecimal(totalAmounts[String(baseYear)] ?? "0");
  const latestTotal = new PyDecimal(totalAmounts[String(latestYear)] ?? "0");
  const totalVarianceAmount = latestTotal.minus(baseTotal);
  const totalVariancePercent = baseTotal.isZero()
    ? null
    : totalVarianceAmount.div(baseTotal).mul(100);

  return {
    property_id: input.property_id,
    property_name: propertyName,
    years,
    base_year: baseYear,
    pool_comparisons: poolComparisons,
    total_amounts: totalAmounts,
    total_variance_amount: totalVarianceAmount.toFixed(),
    total_variance_percent: totalVariancePercent?.toFixed() ?? null,
  };
}

export async function detectAnalysisAnomalies(
  repository: AnalysisRepository,
  input: AnomalyDetectionRequest & { organizationId: string },
): Promise<AnomalyDetectionResponse> {
  validateYear(input.target_year);
  if (input.comparison_years.length < 1) {
    throw new AnalysisInputError("At least 1 comparison year is required");
  }
  for (const year of input.comparison_years) {
    validateYear(year);
  }

  const propertyName = await repository.getPropertyName({
    propertyId: input.property_id,
    organizationId: input.organizationId,
  });
  if (!propertyName) {
    throw new AnalysisNotFoundError(`Property not found: ${input.property_id}`);
  }

  const years = [
    ...new Set([input.target_year, ...input.comparison_years]),
  ].sort((left, right) => left - right);
  const poolDataByYear = await loadPoolDataByYear(repository, {
    propertyId: input.property_id,
    years,
    organizationId: input.organizationId,
  });
  const poolData = transposePoolData(poolDataByYear);
  const anomalies = deduplicateAndRank([
    ...detectVarianceAnomalies(poolData, input.target_year),
    ...detectCategoryChanges(poolData, input.target_year),
    ...detectIsolationForest(poolData, input.target_year),
  ]);

  await repository.recordFeatureUse({
    organizationId: input.organizationId,
    featureKey: "anomaly_alerts",
  });

  return {
    property_id: input.property_id,
    target_year: input.target_year,
    anomalies,
    total_anomalies: anomalies.length,
    critical_count: anomalies.filter((a) => a.severity === "critical").length,
    warning_count: anomalies.filter((a) => a.severity === "warning").length,
    info_count: anomalies.filter((a) => a.severity === "info").length,
  };
}

export function varianceLevel(variancePercent: Decimal | null): VarianceLevel {
  if (!variancePercent) {
    return "normal";
  }

  const absolute = variancePercent.abs();
  if (absolute.lt(5)) {
    return "normal";
  }
  if (absolute.lt(15)) {
    return "warning";
  }
  return "critical";
}

async function loadPoolDataByYear(
  repository: AnalysisRepository,
  input: { propertyId: string; years: number[]; organizationId: string },
): Promise<PoolDataByYear> {
  const pools = await repository.listExpensePools(input);
  const mappings =
    pools.length === 0
      ? []
      : await repository.listPoolMappings({
          poolIds: pools.map((pool) => pool.id),
          organizationId: input.organizationId,
        });
  const poolNameById = new Map(pools.map((pool) => [pool.id, pool.name]));
  const dataByYear: PoolDataByYear = new Map();

  for (const year of input.years) {
    const totals = new Map<string, Decimal>();
    const entries = await repository.listGlEntries({
      propertyId: input.propertyId,
      year,
      organizationId: input.organizationId,
    });

    for (const entry of entries) {
      const matched = findFirstMatchingMapping(entry.account_code, mappings);
      if (!matched) {
        continue;
      }
      const poolName = poolNameById.get(matched.expense_pool_id);
      if (!poolName) {
        continue;
      }
      const allocated = new PyDecimal(entry.amount).mul(
        new PyDecimal(matched.allocation_percentage),
      );
      totals.set(
        poolName,
        (totals.get(poolName) ?? new PyDecimal(0)).plus(allocated),
      );
    }

    dataByYear.set(year, totals);
  }

  return dataByYear;
}

function buildPoolComparison(input: {
  poolName: string;
  years: number[];
  baseYear: number;
  poolDataByYear: PoolDataByYear;
  poolMappings: Map<number, Map<string, string>>;
}): PoolComparison {
  const amounts: Record<string, string | null> = {};
  for (const year of input.years) {
    const yearPools =
      input.poolDataByYear.get(year) ?? new Map<string, Decimal>();
    const fuzzyMatch = input.poolMappings.get(year)?.get(input.poolName);
    const amount =
      yearPools.get(input.poolName) ??
      (fuzzyMatch ? yearPools.get(fuzzyMatch) : undefined);
    amounts[String(year)] = amount?.toFixed() ?? null;
  }

  const baseAmountValue = amounts[String(input.baseYear)];
  const latestYear = input.years[input.years.length - 1];
  if (latestYear === undefined) {
    throw new AnalysisInputError("At least 1 year is required");
  }
  const latestAmountValue = amounts[String(latestYear)];
  const baseAmount =
    baseAmountValue === null || baseAmountValue === undefined
      ? null
      : new PyDecimal(baseAmountValue);
  const latestAmount =
    latestAmountValue === null || latestAmountValue === undefined
      ? null
      : new PyDecimal(latestAmountValue);
  let varianceAmount: Decimal | null = null;
  let variancePercent: Decimal | null = null;

  if (baseAmount && latestAmount && !baseAmount.isZero()) {
    varianceAmount = latestAmount.minus(baseAmount);
    variancePercent = varianceAmount.div(baseAmount).mul(100);
  } else if (baseAmount?.isZero() && latestAmount && !latestAmount.isZero()) {
    varianceAmount = latestAmount;
    variancePercent = new PyDecimal(100);
  }

  return {
    pool_name: input.poolName,
    amounts,
    base_year_amount: baseAmount?.toFixed() ?? null,
    variance_amount: varianceAmount?.toFixed() ?? null,
    variance_percent: variancePercent?.toFixed() ?? null,
    variance_level: varianceLevel(variancePercent),
    matched_from:
      input.poolMappings.get(input.baseYear)?.get(input.poolName) ?? null,
  };
}

function findFirstMatchingMapping(
  accountCode: string,
  mappings: PoolMapping[],
): PoolMapping | null {
  for (const mapping of mappings) {
    if (matchesSqlLikePattern(accountCode, mapping.gl_account_pattern)) {
      return mapping;
    }
  }
  return null;
}

function matchesSqlLikePattern(value: string, pattern: string): boolean {
  let source = "";
  for (const char of pattern) {
    if (char === "%" || char === "*") {
      source += ".*";
    } else if (char === "_" || char === "?") {
      source += ".";
    } else {
      source += escapeRegexChar(char);
    }
  }
  return new RegExp(`^${source}$`).test(value);
}

function escapeRegexChar(char: string): string {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

/**
 * FIX 4: Build pool name mappings across years using the same greedy
 * best-first algorithm as Python's `find_pool_matches` (pool_matching.py).
 *
 * Scores all (source, target) pairs, sorts descending by score, then assigns
 * greedily — a target pool can only be matched to one source pool, preventing
 * duplicate amounts in reconciliation (FIX AS-10 in Python).
 */
function buildPoolMappings(
  poolDataByYear: PoolDataByYear,
  years: number[],
): Map<number, Map<string, string>> {
  const baseYear = years[0];
  if (baseYear === undefined) {
    return new Map();
  }
  const basePools = [...(poolDataByYear.get(baseYear)?.keys() ?? [])];
  const result = new Map<number, Map<string, string>>();

  for (const year of years.slice(1)) {
    const yearPools = [...(poolDataByYear.get(year)?.keys() ?? [])];

    // Compute all (source, target, score) triples
    const allMatches: Array<{ source: string; target: string; score: number }> =
      [];
    for (const source of basePools) {
      for (const target of yearPools) {
        const score = pythonLevenshteinRatio(
          source.toLowerCase(),
          target.toLowerCase(),
        );
        if (score >= 0.8) {
          allMatches.push({ source, target, score });
        }
      }
    }

    // Sort descending by score (highest confidence first)
    allMatches.sort((a, b) => b.score - a.score);

    // Greedy assignment: each source and each target is used at most once
    const yearMappings = new Map<string, string>();
    const usedTargets = new Set<string>();
    for (const { source, target } of allMatches) {
      if (yearMappings.has(source) || usedTargets.has(target)) continue;
      if (source !== target) {
        // Only record fuzzy matches (exact matches don't need remapping)
        yearMappings.set(source, target);
      }
      usedTargets.add(target);
    }

    result.set(year, yearMappings);
  }

  return result;
}

/**
 * Compute python-Levenshtein `ratio(a, b)`:
 *   dist = Levenshtein edit distance with substitution cost 2
 *   ratio = (lenA + lenB - dist) / (lenA + lenB)
 *
 * With substitution cost 2, the distance between "abc" and "axc" is 2 (one sub).
 * This is different from the standard 1-cost substitution commonly used in JS.
 */
function pythonLevenshteinRatio(left: string, right: string): number {
  if (left === right) return 1;
  const lenA = left.length;
  const lenB = right.length;
  const lenSum = lenA + lenB;
  if (lenSum === 0) return 1;
  const dist = levenshteinCost2(left, right);
  return (lenSum - dist) / lenSum;
}

/**
 * Levenshtein distance with substitution cost 2 (matching python-Levenshtein).
 * Insertions and deletions still cost 1.
 */
function levenshteinCost2(left: string, right: string): number {
  const lenA = left.length;
  const lenB = right.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const previous: number[] = Array.from({ length: lenB + 1 }, (_, i) => i);
  for (let i = 1; i <= lenA; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= lenB; j += 1) {
      const above = previous[j] ?? 0;
      const leftChar = left[i - 1] ?? "";
      const rightChar = right[j - 1] ?? "";
      // substitution cost 2, insertion/deletion cost 1
      const cost = leftChar === rightChar ? 0 : 2;
      previous[j] = Math.min(
        (previous[j] ?? 0) + 1, // deletion
        (previous[j - 1] ?? 0) + 1, // insertion
        diagonal + cost, // substitution
      );
      diagonal = above;
    }
  }
  return previous[lenB] ?? 0;
}

function transposePoolData(
  poolDataByYear: PoolDataByYear,
): Map<string, Map<number, Decimal>> {
  const result = new Map<string, Map<number, Decimal>>();
  for (const [year, pools] of poolDataByYear) {
    for (const [poolName, amount] of pools) {
      const years = result.get(poolName) ?? new Map<number, Decimal>();
      years.set(year, amount);
      result.set(poolName, years);
    }
  }
  return result;
}

function detectVarianceAnomalies(
  data: Map<string, Map<number, Decimal>>,
  targetYear: number,
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  for (const [poolName, yearData] of data) {
    const current = yearData.get(targetYear);
    if (!current) {
      continue;
    }
    const priorValues = [...yearData.entries()]
      .filter(([year]) => year < targetYear)
      .map(([, amount]) => amount);
    if (priorValues.length === 0) {
      continue;
    }
    const expected = priorValues
      .reduce((sum, amount) => sum.plus(amount), new PyDecimal(0))
      .div(priorValues.length);
    if (expected.isZero()) {
      continue;
    }
    const variance = current.minus(expected).div(expected);
    const severity = anomalySeverity(variance.abs());
    if (!severity) {
      continue;
    }
    anomalies.push({
      pool_name: poolName,
      anomaly_type: variance.gt(0) ? "spike" : "drop",
      severity,
      current_value: current.toFixed(),
      expected_value: expected.toFixed(),
      variance_percent: variance.mul(100).toFixed(),
      explanation: varianceExplanation(poolName, variance, current, expected),
      years_affected: [targetYear],
    });
  }
  return anomalies;
}

function detectCategoryChanges(
  data: Map<string, Map<number, Decimal>>,
  targetYear: number,
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  for (const [poolName, yearData] of data) {
    const current = yearData.get(targetYear) ?? new PyDecimal(0);
    const priorYears = [...yearData.keys()].filter((year) => year < targetYear);
    const hasPrior = priorYears.some((year) =>
      (yearData.get(year) ?? new PyDecimal(0)).gt(0),
    );
    const hasTarget = current.gt(0);

    if (hasTarget && !hasPrior) {
      anomalies.push({
        pool_name: poolName,
        anomaly_type: "new_category",
        severity: "info",
        current_value: current.toFixed(),
        expected_value: "0",
        variance_percent: "100",
        explanation: `${poolName} is a new expense category not present in prior years`,
        years_affected: [targetYear],
      });
    } else if (hasPrior && !hasTarget) {
      const priorAverage = priorYears
        .reduce(
          (sum, year) => sum.plus(yearData.get(year) ?? new PyDecimal(0)),
          new PyDecimal(0),
        )
        .div(priorYears.length);
      anomalies.push({
        pool_name: poolName,
        anomaly_type: "missing_category",
        severity: "warning",
        current_value: "0",
        expected_value: priorAverage.toFixed(),
        variance_percent: "-100",
        explanation: `${poolName} was present in prior years but missing in ${targetYear}`,
        years_affected: [targetYear],
      });
    }
  }
  return anomalies;
}

/**
 * FIX 1: Port of Python `_detect_isolation_forest`.
 *
 * Computes a MAD-based modified Z-score across pools using the ratio of each
 * pool's target-year value to its historical average. Flags pools where
 * |modified Z-score| > 3.5 (or where MAD==0 and value is extreme multiple).
 *
 * Requires >=2 comparison years. Severity is always WARNING (matching Python).
 *
 * Explanation string is copied verbatim from Python source including
 * the period after the closing parenthesis.
 */
function detectIsolationForest(
  data: Map<string, Map<number, Decimal>>,
  targetYear: number,
): DetectedAnomaly[] {
  const allYears = [
    ...new Set([...data.values()].flatMap((yd) => [...yd.keys()])),
  ].sort((a, b) => a - b);
  const comparisonYears = allYears.filter((y) => y < targetYear);
  if (comparisonYears.length < 2) return [];

  const poolNames = [...data.keys()].filter((p) =>
    data.get(p)?.has(targetYear),
  );
  if (poolNames.length === 0) return [];

  // Compute ratio of target-year to historical average for each pool
  const targetRatios = new Map<string, number>();
  const historicalAvgs = new Map<string, Decimal>();

  for (const pool of poolNames) {
    const yearData = data.get(pool)!;
    let histSum = new PyDecimal(0);
    for (const cy of comparisonYears) {
      histSum = histSum.plus(yearData.get(cy) ?? new PyDecimal(0));
    }
    const histAvg = histSum.div(comparisonYears.length);
    const current = yearData.get(targetYear)!;
    const ratio = histAvg.isZero()
      ? current.toNumber()
      : current.div(histAvg).toNumber();
    targetRatios.set(pool, ratio);
    historicalAvgs.set(pool, histAvg);
  }

  // Compute median and MAD of the ratios array
  const ratiosArr = poolNames.map((p) => targetRatios.get(p)!);
  const median = computeMedian(ratiosArr);
  const absDeviations = ratiosArr.map((r) => Math.abs(r - median));
  const mad = computeMedian(absDeviations);

  const anomalies: DetectedAnomaly[] = [];
  for (const pool of poolNames) {
    const ratio = targetRatios.get(pool)!;
    let isOutlier: boolean;
    if (mad === 0) {
      // All pools same ratio — flag only extreme multiples of median
      isOutlier = median > 0 && (ratio > median * 3 || ratio < median / 3);
    } else {
      const modifiedZscore = Math.abs(ratio - median) / (1.4826 * mad);
      isOutlier = modifiedZscore > 3.5;
    }

    if (isOutlier) {
      const current = data.get(pool)!.get(targetYear)!;
      const expected = historicalAvgs.get(pool)!;
      const varianceRaw = expected.isZero()
        ? new PyDecimal(0)
        : current.minus(expected).div(expected);
      // Match Python: variance_percent = (variance * 100).quantize(Decimal("0.1"))
      const variancePct = varianceRaw.mul(100).toDecimalPlaces(1);
      anomalies.push({
        pool_name: pool,
        anomaly_type: "outlier",
        severity: "warning",
        current_value: current.toFixed(),
        expected_value: expected.toFixed(),
        variance_percent: variancePct.toFixed(),
        explanation:
          `Statistical analysis flagged ${pool} as a cross-pool ` +
          `outlier in ${targetYear} (modified Z-score > 3.5).`,
        years_affected: [targetYear],
      });
    }
  }

  return anomalies;
}

/**
 * Compute the median of a numeric array (matches numpy.median: average middle
 * two elements for even-length arrays).
 */
function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function anomalySeverity(absVariance: Decimal): AnomalySeverity | null {
  if (absVariance.gte("0.20")) {
    return "critical";
  }
  if (absVariance.gte("0.10")) {
    return "warning";
  }
  return null;
}

/**
 * Format a Decimal as Python `f"${value:,.2f}"`:
 *   - dollar-sign prefix
 *   - negative sign INSIDE the number (after the `$`), matching Python's `$` literal
 *     followed by `{value:,.2f}` where `{-1234.56:,.2f}` → `-1,234.56`
 *   - comma thousands separators on the integer part
 *   - always 2 decimal places (ROUND_HALF_EVEN via PyDecimal)
 *
 * Samples: 1234.56 → "$1,234.56", -1234.56 → "$-1,234.56", 0 → "$0.00"
 */
function fmtPythonMoney(value: Decimal): string {
  const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  const isNeg = rounded.isNegative() && !rounded.isZero();
  const abs = rounded.abs();
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withCommas = (intPart ?? "0").replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  return `$${isNeg ? "-" : ""}${withCommas}.${decPart ?? "00"}`;
}

function varianceExplanation(
  poolName: string,
  variance: Decimal,
  current: Decimal,
  expected: Decimal,
): string {
  const direction = variance.gt(0) ? "increased" : "decreased";
  return `${poolName} ${direction} by ${variance.abs().mul(100).toDecimalPlaces(1).toFixed()}% compared to the 3-year average. Current: ${fmtPythonMoney(current)}, Expected: ${fmtPythonMoney(expected)}`;
}

function deduplicateAndRank(anomalies: DetectedAnomaly[]): DetectedAnomaly[] {
  const seen = new Set<string>();
  const unique: DetectedAnomaly[] = [];
  for (const anomaly of anomalies) {
    const key = `${anomaly.pool_name}:${anomaly.anomaly_type}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(anomaly);
    }
  }
  const severityOrder: Record<AnomalySeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  return unique.sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity],
  );
}

function validateComparisonYears(years: number[]): void {
  if (years.length < 2) {
    throw new AnalysisInputError("At least 2 years required for comparison");
  }
  if (years.length > 4) {
    throw new AnalysisInputError("Maximum 4 years allowed for comparison");
  }
  for (const year of years) {
    validateYear(year);
  }
}

function validateYear(year: number): void {
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    throw new AnalysisInputError(
      "Year must be an integer between 1990 and 2100",
    );
  }
}
