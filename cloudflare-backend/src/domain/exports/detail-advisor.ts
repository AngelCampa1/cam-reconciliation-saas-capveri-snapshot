/**
 * Statement detail level advisor — pure-compute port of
 * backend/app/services/analysis/statement_detail_advisor.py.
 *
 * No I/O. All money uses decimal.js. Summary/explanation strings are
 * verbatim copies of the Python wording so JSON output is identical.
 */

import Decimal from "decimal.js";
import type { GlEntry, ExpensePool, PoolMapping } from "../analysis/repository";

/**
 * Decimal constructor configured to mirror Python's `decimal` module default
 * context: 28 significant digits, ROUND_HALF_EVEN (banker's rounding).
 *
 * The FastAPI source computes `percent_of_total = (amount / pool_total) * 100`
 * and `allocated = amount * allocation_percentage` with Python `Decimal`
 * arithmetic, which rounds every operation to 28 significant figures using
 * ROUND_HALF_EVEN. decimal.js defaults to 20 sig-figs / ROUND_HALF_UP, so a
 * non-terminating division (e.g. 1/3*100) would serialize to a *different*
 * string than FastAPI. Using a module-local clone keeps the match exact
 * without mutating decimal.js global state (Workers best practice: no shared
 * mutable globals across requests).
 */
const PyDecimal = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type DetailSeverity = "ok" | "suggestion" | "warning" | "critical";

const SEVERITY_ORDER: Record<DetailSeverity, number> = {
  ok: 0,
  suggestion: 1,
  warning: 2,
  critical: 3,
};

export type LineItemEntry = {
  account_code: string;
  account_description: string;
  amount: Decimal;
};

export type PoolLineItemDetail = {
  pool_name: string;
  pool_type: string;
  items: LineItemEntry[];
  pool_total: Decimal;
};

export type GroupingSuggestion = {
  category_name: string;
  current_line_count: number;
  suggested_label: string;
  severity: DetailSeverity;
  explanation: string;
};

export type ImmaterialItem = {
  account_code: string;
  account_description: string;
  /** Decimal stored as string — serialized with .toString() at boundary */
  amount: Decimal;
  percent_of_total: Decimal;
  pool_name: string;
};

export type DetailLevelAdvisory = {
  total_line_items: number;
  total_categories: number;
  overall_severity: DetailSeverity;
  summary: string;
  grouping_suggestions: GroupingSuggestion[];
  immaterial_items: ImmaterialItem[];
  suggested_total_lines: number;
};

export type DetailAdvisorConfig = {
  max_lines_per_category: number;
  immaterial_threshold_pct: Decimal;
  ideal_line_range: [number, number];
};

const DEFAULT_CONFIG: DetailAdvisorConfig = {
  max_lines_per_category: 5,
  immaterial_threshold_pct: new Decimal("0.5"),
  ideal_line_range: [15, 25],
};

// ── fnmatch helper ─────────────────────────────────────────────────────────────

/**
 * Test whether `str` matches a SQL LIKE-style pattern, reproducing the
 * FastAPI behaviour: `pattern.replace("%", "*")` then
 * `fnmatch.fnmatch(code, pattern)`.
 *
 * Faithful port details (bugs included):
 *   - Python `str.replace("%", "*")` replaces ALL `%`, not just the first.
 *   - After substitution the string is handled by `fnmatch`, which treats
 *     `*` (any run), `?` (single char) and `[seq]` / `[!seq]` (char class)
 *     as wildcards; every other char (including `_`) is a literal.
 *   - Production runtime is Linux, where `fnmatch.fnmatch` is case-sensitive
 *     (os.path.normcase is identity), so we match case-sensitively.
 *
 * This mirrors CPython's `fnmatch.translate` closely enough for the SQL-LIKE
 * patterns stored in `pool_mappings.gl_account_pattern`.
 */
export function fnmatchGlob(str: string, pattern: string): boolean {
  // Python replaces every "%" with "*".
  const glob = pattern.split("%").join("*");
  return new RegExp(fnmatchToRegex(glob)).test(str);
}

/**
 * Translate an fnmatch glob into an anchored regex source string, mirroring
 * CPython `fnmatch.translate`'s handling of `*`, `?`, and `[...]`.
 */
function fnmatchToRegex(pat: string): string {
  let i = 0;
  const n = pat.length;
  let res = "";
  while (i < n) {
    const c = pat[i]!;
    i += 1;
    if (c === "*") {
      res += ".*";
    } else if (c === "?") {
      res += ".";
    } else if (c === "[") {
      let j = i;
      if (j < n && pat[j] === "!") j += 1;
      if (j < n && pat[j] === "]") j += 1;
      while (j < n && pat[j] !== "]") j += 1;
      if (j >= n) {
        // No closing ]: treat "[" as a literal (matches CPython).
        res += "\\[";
      } else {
        let stuff = pat.slice(i, j);
        // Escape backslashes inside the class so they stay literal.
        stuff = stuff.replace(/\\/g, "\\\\");
        i = j + 1;
        if (stuff.startsWith("!")) {
          stuff = "^" + stuff.slice(1);
        } else if (stuff.startsWith("^")) {
          stuff = "\\" + stuff;
        }
        res += "[" + stuff + "]";
      }
    } else {
      res += escapeRegexLiteral(c);
    }
  }
  return "^(?:" + res + ")$";
}

function escapeRegexLiteral(c: string): string {
  return /[.+^${}()|[\]\\?*]/.test(c) ? "\\" + c : c;
}

// ── Pool building ─────────────────────────────────────────────────────────────

/**
 * Build PoolLineItemDetail list from expense pools, mappings, and GL entries.
 * Returns [details, grandTotal].
 *
 * Mirrors _build_pool_details in backend/app/api/v1/export.py.
 * GL→pool match: first-match-wins per GL entry across all pools/mappings.
 * allocated amount = gl_amount * allocation_percentage.
 * grand_total = sum of ALL gl entry amounts (regardless of matching).
 */
export function buildPoolDetails(
  pools: Array<ExpensePool & { pool_type?: string }>,
  mappingsByPool: Map<string, PoolMapping[]>,
  glEntries: GlEntry[],
): [PoolLineItemDetail[], Decimal] {
  const poolItems = new Map<string, LineItemEntry[]>();
  for (const pool of pools) {
    poolItems.set(pool.id, []);
  }

  let grandTotal = new PyDecimal(0);

  for (const entry of glEntries) {
    const code = entry.account_code;
    const amount = new PyDecimal(entry.amount);
    const desc = entry.account_description ?? code;
    grandTotal = grandTotal.add(amount);

    outer: for (const pool of pools) {
      const mappings = mappingsByPool.get(pool.id) ?? [];
      for (const mapping of mappings) {
        if (fnmatchGlob(code, mapping.gl_account_pattern)) {
          const alloc = new PyDecimal(mapping.allocation_percentage);
          poolItems.get(pool.id)!.push({
            account_code: code,
            account_description: desc,
            amount: amount.mul(alloc),
          });
          break outer;
        }
      }
    }
  }

  const result: PoolLineItemDetail[] = [];
  for (const pool of pools) {
    const items = poolItems.get(pool.id) ?? [];
    if (items.length === 0) continue;
    const poolTotal = items.reduce(
      (acc, i) => acc.add(i.amount),
      new PyDecimal(0),
    );
    result.push({
      pool_name: pool.name,
      pool_type: pool.pool_type ?? "operating",
      items,
      pool_total: poolTotal,
    });
  }

  return [result, grandTotal];
}

// ── Advisor ────────────────────────────────────────────────────────────────────

function checkCategoryGranularity(
  pool: PoolLineItemDetail,
  config: DetailAdvisorConfig,
): GroupingSuggestion | null {
  const threshold = config.max_lines_per_category;
  const count = pool.items.length;
  if (count <= threshold) return null;

  const ratio = count / threshold;
  let severity: DetailSeverity;
  if (ratio > 3) {
    severity = "critical";
  } else if (ratio > 2) {
    severity = "warning";
  } else {
    severity = "suggestion";
  }

  return {
    category_name: pool.pool_name,
    current_line_count: count,
    suggested_label: pool.pool_name,
    severity,
    explanation:
      `You have ${count} individual line items in ${pool.pool_name}. ` +
      `Consider presenting them as a single '${pool.pool_name}' line.`,
  };
}

function checkImmaterialItems(
  pool: PoolLineItemDetail,
  config: DetailAdvisorConfig,
): ImmaterialItem[] {
  if (pool.pool_total.lte(0)) return [];

  const thresholdPct = config.immaterial_threshold_pct;
  const flagged: ImmaterialItem[] = [];

  for (const item of pool.items) {
    if (item.amount.lte(0)) continue;
    // Compute with Python's 28-digit / ROUND_HALF_EVEN context so the
    // serialized percent_of_total string matches FastAPI byte-for-byte for
    // non-terminating divisions (e.g. 1/3*100).
    const pct = new PyDecimal(item.amount).div(pool.pool_total).mul(100);
    if (pct.lt(thresholdPct)) {
      flagged.push({
        account_code: item.account_code,
        account_description: item.account_description,
        amount: item.amount,
        percent_of_total: pct,
        pool_name: pool.pool_name,
      });
    }
  }

  return flagged;
}

function computeOverallSeverity(
  totalLineItems: number,
  suggestions: GroupingSuggestion[],
  config: DetailAdvisorConfig,
): DetailSeverity {
  if (totalLineItems === 0) return "suggestion";

  const severities: DetailSeverity[] = [];
  const [, high] = config.ideal_line_range;

  if (totalLineItems > high * 2) {
    severities.push("warning");
  } else if (totalLineItems > high) {
    severities.push("suggestion");
  }

  for (const s of suggestions) {
    severities.push(s.severity);
  }

  if (severities.length === 0) return "ok";

  return severities.reduce((best, s) =>
    SEVERITY_ORDER[s] > SEVERITY_ORDER[best] ? s : best,
  );
}

function computeSuggestedTotalLines(
  pools: PoolLineItemDetail[],
  suggestions: GroupingSuggestion[],
): number {
  const groupedPools = new Set(suggestions.map((s) => s.category_name));
  let total = 0;
  for (const pool of pools) {
    if (groupedPools.has(pool.pool_name)) {
      total += 1;
    } else {
      total += pool.items.length;
    }
  }
  return total;
}

function generateSummary(
  totalLineItems: number,
  totalCategories: number,
  overallSeverity: DetailSeverity,
  config: DetailAdvisorConfig,
): string {
  const [low, high] = config.ideal_line_range;
  if (totalLineItems === 0) {
    return (
      "No detail line items found for this statement. " +
      "Check that GL entries are mapped to expense pools " +
      "before exporting."
    );
  }
  if (overallSeverity === "ok") {
    return (
      `Statement has ${totalLineItems} line items across ` +
      `${totalCategories} categories. ` +
      `This is within the ideal range of ${low}–${high} lines.`
    );
  }
  return (
    `Statement has ${totalLineItems} line items across ` +
    `${totalCategories} categories. ` +
    `The ideal range is ${low}–${high} lines. ` +
    `Consider grouping to reduce dispute risk.`
  );
}

/**
 * Run the statement detail advisor over a set of pool line-item details.
 * Mirrors StatementDetailAdvisor.analyze() exactly.
 */
export function analyzeDetailLevel(
  pools: PoolLineItemDetail[],
  config: DetailAdvisorConfig = DEFAULT_CONFIG,
): DetailLevelAdvisory {
  const totalLineItems = pools.reduce((acc, p) => acc + p.items.length, 0);
  const totalCategories = pools.length;

  const groupingSuggestions: GroupingSuggestion[] = [];
  const immaterialItems: ImmaterialItem[] = [];

  for (const pool of pools) {
    const suggestion = checkCategoryGranularity(pool, config);
    if (suggestion !== null) {
      groupingSuggestions.push(suggestion);
    }
    immaterialItems.push(...checkImmaterialItems(pool, config));
  }

  const overallSeverity = computeOverallSeverity(
    totalLineItems,
    groupingSuggestions,
    config,
  );
  const suggestedTotalLines = computeSuggestedTotalLines(
    pools,
    groupingSuggestions,
  );
  const summary = generateSummary(
    totalLineItems,
    totalCategories,
    overallSeverity,
    config,
  );

  return {
    total_line_items: totalLineItems,
    total_categories: totalCategories,
    overall_severity: overallSeverity,
    summary,
    grouping_suggestions: groupingSuggestions,
    immaterial_items: immaterialItems,
    suggested_total_lines: suggestedTotalLines,
  };
}
