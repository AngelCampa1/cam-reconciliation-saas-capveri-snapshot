/**
 * Unit tests for EP-15 detail-level advisor domain logic.
 *
 * Covers:
 *   - fnmatchGlob: % → * translation, exact match, prefix, suffix, no-match
 *   - analyzeDetailLevel: threshold severity boundaries (5/10/15→severity)
 *   - immateriality: 0.5% cutoff, pool_total==0 skip, amount<=0 skip
 *   - overall-severity branches: 0 items, 0–25 OK, 26–50 SUGGESTION, >50 WARNING
 *   - suggested_total_lines: grouped pools count as 1
 *   - summary wording for each severity variant
 *   - buildPoolDetails: GL→pool matching, allocation, grand_total, first-match-wins
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  fnmatchGlob,
  buildPoolDetails,
  analyzeDetailLevel,
  type PoolLineItemDetail,
  type DetailAdvisorConfig,
} from "../domain/exports/detail-advisor";
import type {
  GlEntry,
  ExpensePool,
  PoolMapping,
} from "../domain/analysis/repository";

// ── fnmatchGlob ───────────────────────────────────────────────────────────────

describe("fnmatchGlob", () => {
  it("matches an exact code with no wildcard", () => {
    expect(fnmatchGlob("6000", "6000")).toBe(true);
  });

  it("does not match a different code", () => {
    expect(fnmatchGlob("6001", "6000")).toBe(false);
  });

  it("matches prefix pattern with * (from glob *)", () => {
    expect(fnmatchGlob("6001", "6*")).toBe(true);
    expect(fnmatchGlob("7000", "6*")).toBe(false);
  });

  it("translates SQL % to glob * and matches", () => {
    // gl_account_pattern uses %, buildPoolDetails replaces % with *
    // fnmatchGlob receives the raw pattern with %, does the replacement internally
    expect(fnmatchGlob("6001", "6%")).toBe(true);
    expect(fnmatchGlob("7000", "6%")).toBe(false);
  });

  it("matches suffix pattern", () => {
    expect(fnmatchGlob("ABC6000", "*6000")).toBe(true);
    expect(fnmatchGlob("ABC6001", "*6000")).toBe(false);
  });

  it("matches middle wildcard", () => {
    expect(fnmatchGlob("6-MAINT-00", "6*00")).toBe(true);
    expect(fnmatchGlob("6-MAINT-01", "6*00")).toBe(false);
  });

  it("matches any string with bare *", () => {
    expect(fnmatchGlob("anything", "*")).toBe(true);
    expect(fnmatchGlob("", "*")).toBe(true);
  });

  it("replaces ALL % (Python str.replace), not just the first", () => {
    // Python: "6%0%".replace("%","*") -> "6*0*" matches "6000".
    // A naive JS .replace("%","*") would yield "6*0%" and fail to match.
    expect(fnmatchGlob("6000", "6%0%")).toBe(true);
    expect(fnmatchGlob("6X0Y", "6%0%")).toBe(true);
  });

  it("honors fnmatch ? as single-char wildcard (survives %→* step)", () => {
    expect(fnmatchGlob("6a0b", "6?0?")).toBe(true);
    expect(fnmatchGlob("600", "6?0?")).toBe(false);
  });

  it("honors fnmatch [seq] character classes", () => {
    expect(fnmatchGlob("6000", "6[0-9]00")).toBe(true);
    expect(fnmatchGlob("6A00", "6[0-9]00")).toBe(false);
    // negated class
    expect(fnmatchGlob("6A00", "6[!0-9]00")).toBe(true);
  });

  it("treats _ as a literal (SQL LIKE _ is NOT translated by Python)", () => {
    // Python does not translate SQL "_"; fnmatch sees "_" as a literal char.
    expect(fnmatchGlob("6000", "6_0_")).toBe(false);
    expect(fnmatchGlob("6_0_", "6_0_")).toBe(true);
  });
});

// ── buildPoolDetails ──────────────────────────────────────────────────────────

describe("buildPoolDetails", () => {
  const POOL_A: ExpensePool & { pool_type?: string } = {
    id: "pool-a",
    name: "Cleaning",
    pool_type: "operating",
  };
  const POOL_B: ExpensePool & { pool_type?: string } = {
    id: "pool-b",
    name: "Security",
    pool_type: "operating",
  };

  it("assigns GL entry to the first matching pool (first-match-wins)", () => {
    const mA: PoolMapping = {
      expense_pool_id: "pool-a",
      gl_account_pattern: "6000",
      allocation_percentage: "1",
    };
    const mB: PoolMapping = {
      expense_pool_id: "pool-b",
      gl_account_pattern: "6*",
      allocation_percentage: "1",
    };
    const mappingsByPool = new Map<string, PoolMapping[]>([
      ["pool-a", [mA]],
      ["pool-b", [mB]],
    ]);
    const gl: GlEntry[] = [
      {
        account_code: "6000",
        account_description: "Cleaning Labor",
        amount: "1000.00",
        vendor_name: null,
        description: null,
        transaction_date: null,
      },
    ];

    const [details, grandTotal] = buildPoolDetails(
      [POOL_A, POOL_B],
      mappingsByPool,
      gl,
    );

    // 6000 matches pool-a exactly (first pool in iteration order) before pool-b's 6*
    expect(details).toHaveLength(1);
    expect(details[0]!.pool_name).toBe("Cleaning");
    expect(details[0]!.items[0]!.amount.toString()).toBe("1000");
    expect(grandTotal.toString()).toBe("1000");
  });

  it("applies allocation_percentage to matched amount", () => {
    const mappingsByPool = new Map<string, PoolMapping[]>([
      [
        "pool-a",
        [
          {
            expense_pool_id: "pool-a",
            gl_account_pattern: "6*",
            allocation_percentage: "0.5",
          },
        ],
      ],
      ["pool-b", []],
    ]);
    const gl: GlEntry[] = [
      {
        account_code: "6001",
        account_description: "Misc",
        amount: "2000.00",
        vendor_name: null,
        description: null,
        transaction_date: null,
      },
    ];

    const [details, grandTotal] = buildPoolDetails(
      [POOL_A, POOL_B],
      mappingsByPool,
      gl,
    );

    expect(details[0]!.items[0]!.amount.toString()).toBe("1000");
    // grand_total is the raw GL amount, not the allocated amount
    expect(grandTotal.toString()).toBe("2000");
  });

  it("accumulates grand_total from ALL GL entries regardless of matching", () => {
    const mappingsByPool = new Map<string, PoolMapping[]>([
      ["pool-a", []],
      ["pool-b", []],
    ]);
    const gl: GlEntry[] = [
      {
        account_code: "9999",
        account_description: null,
        amount: "500.00",
        vendor_name: null,
        description: null,
        transaction_date: null,
      },
      {
        account_code: "8888",
        account_description: "Other",
        amount: "250.00",
        vendor_name: null,
        description: null,
        transaction_date: null,
      },
    ];

    const [details, grandTotal] = buildPoolDetails(
      [POOL_A, POOL_B],
      mappingsByPool,
      gl,
    );

    expect(details).toHaveLength(0);
    expect(grandTotal.toString()).toBe("750");
  });

  it("falls back to account_code as description when account_description is null", () => {
    const mappingsByPool = new Map<string, PoolMapping[]>([
      [
        "pool-a",
        [
          {
            expense_pool_id: "pool-a",
            gl_account_pattern: "6*",
            allocation_percentage: "1",
          },
        ],
      ],
    ]);
    const gl: GlEntry[] = [
      {
        account_code: "6100",
        account_description: null,
        amount: "100.00",
        vendor_name: null,
        description: null,
        transaction_date: null,
      },
    ];

    const [details] = buildPoolDetails([POOL_A], mappingsByPool, gl);

    expect(details[0]!.items[0]!.account_description).toBe("6100");
  });

  it("skips pools with no matched items", () => {
    const mappingsByPool = new Map<string, PoolMapping[]>([
      ["pool-a", []],
      [
        "pool-b",
        [
          {
            expense_pool_id: "pool-b",
            gl_account_pattern: "7*",
            allocation_percentage: "1",
          },
        ],
      ],
    ]);
    const gl: GlEntry[] = [
      {
        account_code: "7000",
        account_description: "Guard Service",
        amount: "300.00",
        vendor_name: null,
        description: null,
        transaction_date: null,
      },
    ];

    const [details] = buildPoolDetails([POOL_A, POOL_B], mappingsByPool, gl);

    expect(details).toHaveLength(1);
    expect(details[0]!.pool_name).toBe("Security");
  });
});

// ── analyzeDetailLevel ────────────────────────────────────────────────────────

function makePool(
  name: string,
  itemCount: number,
  totalAmount = "1000",
): PoolLineItemDetail {
  const perItem = new Decimal(totalAmount).div(itemCount > 0 ? itemCount : 1);
  const items = Array.from({ length: itemCount }, (_, i) => ({
    account_code: `${6000 + i}`,
    account_description: `Item ${i}`,
    amount: perItem,
  }));
  return {
    pool_name: name,
    pool_type: "operating",
    items,
    pool_total: items.reduce(
      (acc, item) => acc.add(item.amount),
      new Decimal(0),
    ),
  };
}

describe("analyzeDetailLevel — grouping severity thresholds", () => {
  const config: DetailAdvisorConfig = {
    max_lines_per_category: 5,
    immaterial_threshold_pct: new Decimal("0.5"),
    ideal_line_range: [15, 25],
  };

  it("returns no suggestion when count == threshold (5 items)", () => {
    const pools = [makePool("Cleaning", 5)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.grouping_suggestions).toHaveLength(0);
  });

  it("returns SUGGESTION when 5 < count <= 10 (ratio 1–2)", () => {
    const pools = [makePool("Cleaning", 6)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.grouping_suggestions).toHaveLength(1);
    expect(result.grouping_suggestions[0]!.severity).toBe("suggestion");
  });

  it("returns SUGGESTION at exactly count=10 (ratio=2, not >2)", () => {
    const pools = [makePool("Cleaning", 10)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.grouping_suggestions[0]!.severity).toBe("suggestion");
  });

  it("returns WARNING when count=11 (ratio>2, <=3)", () => {
    const pools = [makePool("Cleaning", 11)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.grouping_suggestions[0]!.severity).toBe("warning");
  });

  it("returns WARNING at count=15 (ratio=3, not >3)", () => {
    const pools = [makePool("Cleaning", 15)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.grouping_suggestions[0]!.severity).toBe("warning");
  });

  it("returns CRITICAL when count=16 (ratio>3)", () => {
    const pools = [makePool("Cleaning", 16)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.grouping_suggestions[0]!.severity).toBe("critical");
  });

  it("explanation contains pool name and count", () => {
    const pools = [makePool("Utilities", 8)];
    const result = analyzeDetailLevel(pools, config);
    const s = result.grouping_suggestions[0]!;
    expect(s.explanation).toBe(
      "You have 8 individual line items in Utilities. " +
        "Consider presenting them as a single 'Utilities' line.",
    );
    expect(s.category_name).toBe("Utilities");
    expect(s.suggested_label).toBe("Utilities");
    expect(s.current_line_count).toBe(8);
  });
});

describe("analyzeDetailLevel — immateriality", () => {
  const config: DetailAdvisorConfig = {
    max_lines_per_category: 5,
    immaterial_threshold_pct: new Decimal("0.5"),
    ideal_line_range: [15, 25],
  };

  it("flags items below 0.5% of pool total", () => {
    // pool total = 10000; item at 49 = 0.49% → immaterial
    const pool: PoolLineItemDetail = {
      pool_name: "Insurance",
      pool_type: "operating",
      items: [
        {
          account_code: "8001",
          account_description: "Policy A",
          amount: new Decimal("9951"),
        },
        {
          account_code: "8002",
          account_description: "Policy B",
          amount: new Decimal("49"),
        },
      ],
      pool_total: new Decimal("10000"),
    };

    const result = analyzeDetailLevel([pool], config);
    expect(result.immaterial_items).toHaveLength(1);
    expect(result.immaterial_items[0]!.account_code).toBe("8002");
    // 49/10000 * 100 = 0.49
    expect(result.immaterial_items[0]!.percent_of_total.lt("0.5")).toBe(true);
  });

  it("matches Python's 28-digit context for non-terminating percent_of_total", () => {
    // 1 / 300 * 100 = 0.3333... Python decimal (28 sig figs, HALF_EVEN) gives
    // "0.3333333333333333333333333333". decimal.js default (20 sig figs) would
    // truncate to 20 digits and diverge from FastAPI's serialized string.
    const pool: PoolLineItemDetail = {
      pool_name: "P",
      pool_type: "operating",
      items: [
        {
          account_code: "a",
          account_description: "big",
          amount: new Decimal("299"),
        },
        {
          account_code: "b",
          account_description: "tiny",
          amount: new Decimal("1"),
        },
      ],
      pool_total: new Decimal("300"),
    };
    const result = analyzeDetailLevel([pool], config);
    expect(result.immaterial_items).toHaveLength(1);
    expect(result.immaterial_items[0]!.percent_of_total.toString()).toBe(
      "0.3333333333333333333333333333",
    );
  });

  it("does NOT flag items at exactly 0.5% (< not <=)", () => {
    // pool total = 10000; item at 50 = exactly 0.5% → NOT flagged
    const pool: PoolLineItemDetail = {
      pool_name: "Insurance",
      pool_type: "operating",
      items: [
        {
          account_code: "8001",
          account_description: "Policy A",
          amount: new Decimal("9950"),
        },
        {
          account_code: "8002",
          account_description: "Policy B",
          amount: new Decimal("50"),
        },
      ],
      pool_total: new Decimal("10000"),
    };

    const result = analyzeDetailLevel([pool], config);
    expect(result.immaterial_items).toHaveLength(0);
  });

  it("skips immateriality check when pool_total == 0", () => {
    const pool: PoolLineItemDetail = {
      pool_name: "Empty Pool",
      pool_type: "operating",
      items: [
        {
          account_code: "9001",
          account_description: "Nothing",
          amount: new Decimal("0"),
        },
      ],
      pool_total: new Decimal("0"),
    };

    const result = analyzeDetailLevel([pool], config);
    expect(result.immaterial_items).toHaveLength(0);
  });

  it("skips items with amount <= 0", () => {
    const pool: PoolLineItemDetail = {
      pool_name: "Mixed",
      pool_type: "operating",
      items: [
        {
          account_code: "8001",
          account_description: "Positive",
          amount: new Decimal("1000"),
        },
        {
          account_code: "8002",
          account_description: "Zero",
          amount: new Decimal("0"),
        },
        {
          account_code: "8003",
          account_description: "Negative",
          amount: new Decimal("-100"),
        },
      ],
      pool_total: new Decimal("900"),
    };

    const result = analyzeDetailLevel([pool], config);
    // Only the positive item could be flagged; 1000/900*100 ≈ 111% → not immaterial
    expect(result.immaterial_items).toHaveLength(0);
  });
});

describe("analyzeDetailLevel — overall severity", () => {
  const config: DetailAdvisorConfig = {
    max_lines_per_category: 5,
    immaterial_threshold_pct: new Decimal("0.5"),
    ideal_line_range: [15, 25],
  };

  it("returns SUGGESTION when total_line_items == 0", () => {
    const result = analyzeDetailLevel([], config);
    expect(result.overall_severity).toBe("suggestion");
    expect(result.total_line_items).toBe(0);
    expect(result.total_categories).toBe(0);
  });

  it("returns OK when total is within ideal range (15–25) and no suggestions", () => {
    // 3 pools × 5 items = 15 total, no pool exceeds threshold
    const pools = [makePool("A", 5), makePool("B", 5), makePool("C", 5)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.overall_severity).toBe("ok");
  });

  it("returns SUGGESTION when total > high (25) but <= high*2 (50)", () => {
    // 3 pools × 9 = 27 total (but 9 > 5 so each triggers grouping suggestions at SUGGESTION)
    // isolate just the line-count branch: many small pools each at threshold
    const pools = Array.from({ length: 27 }, (_, i) => makePool(`Pool${i}`, 1));
    const result = analyzeDetailLevel(pools, config);
    // 27 > 25 → SUGGESTION from line count; no per-pool suggestions (each has 1 item ≤ 5)
    expect(result.overall_severity).toBe("suggestion");
  });

  it("returns WARNING when total > high*2 (50)", () => {
    const pools = Array.from({ length: 51 }, (_, i) => makePool(`Pool${i}`, 1));
    const result = analyzeDetailLevel(pools, config);
    expect(result.overall_severity).toBe("warning");
  });

  it("propagates CRITICAL from a single pool suggestion", () => {
    // 1 pool with 16 items → CRITICAL suggestion; total=16 which is in suggestion range
    const pools = [makePool("Cleaning", 16)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.overall_severity).toBe("critical");
  });

  it("takes max severity across all pools", () => {
    // warning pool + suggestion from line count → WARNING wins
    const pools = [
      makePool("A", 11), // ratio=11/5=2.2 → WARNING
      makePool("B", 1),
    ];
    const result = analyzeDetailLevel(pools, config);
    expect(result.grouping_suggestions[0]!.severity).toBe("warning");
    expect(result.overall_severity).toBe("warning");
  });
});

describe("analyzeDetailLevel — suggested_total_lines", () => {
  const config: DetailAdvisorConfig = {
    max_lines_per_category: 5,
    immaterial_threshold_pct: new Decimal("0.5"),
    ideal_line_range: [15, 25],
  };

  it("counts grouped pools as 1 line each", () => {
    // Pool A: 8 items → suggestion → counts as 1
    // Pool B: 3 items → no suggestion → counts as 3
    const pools = [makePool("A", 8), makePool("B", 3)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.suggested_total_lines).toBe(1 + 3);
  });

  it("counts all items for non-grouped pools", () => {
    const pools = [makePool("A", 4), makePool("B", 5)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.grouping_suggestions).toHaveLength(0);
    expect(result.suggested_total_lines).toBe(4 + 5);
  });

  it("returns 0 when no pools", () => {
    const result = analyzeDetailLevel([], config);
    expect(result.suggested_total_lines).toBe(0);
  });
});

describe("analyzeDetailLevel — summary text", () => {
  const config: DetailAdvisorConfig = {
    max_lines_per_category: 5,
    immaterial_threshold_pct: new Decimal("0.5"),
    ideal_line_range: [15, 25],
  };

  it("produces empty-state summary when no items", () => {
    const result = analyzeDetailLevel([], config);
    expect(result.summary).toBe(
      "No detail line items found for this statement. " +
        "Check that GL entries are mapped to expense pools " +
        "before exporting.",
    );
  });

  it("produces OK summary when within ideal range", () => {
    const pools = [makePool("A", 5), makePool("B", 5), makePool("C", 5)];
    const result = analyzeDetailLevel(pools, config);
    expect(result.overall_severity).toBe("ok");
    expect(result.summary).toBe(
      "Statement has 15 line items across 3 categories. " +
        "This is within the ideal range of 15–25 lines.",
    );
  });

  it("produces non-OK summary when severity is elevated", () => {
    const pools = Array.from({ length: 26 }, (_, i) => makePool(`P${i}`, 1));
    const result = analyzeDetailLevel(pools, config);
    expect(result.overall_severity).toBe("suggestion");
    expect(result.summary).toBe(
      "Statement has 26 line items across 26 categories. " +
        "The ideal range is 15–25 lines. " +
        "Consider grouping to reduce dispute risk.",
    );
  });
});
