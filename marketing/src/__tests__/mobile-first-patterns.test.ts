import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Regression guard for the marketing mobile-first rubric
 * (`marketing/docs/mobile-first-rubric.md`).
 *
 * Each rule scans `src/` for a pattern that should not appear, and accepts an
 * explicit allowlist of files that still need to be fixed. As each Wave of the
 * mobile-first overhaul ships, files come off the allowlist - they then have
 * permanent regression protection. New offenders fail CI.
 */

const SRC_ROOT = join(__dirname, "..");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === "__tests__" ||
        entry === "test" ||
        entry === "generated" ||
        entry.endsWith(".test.tsx") ||
        entry.endsWith(".test.ts")
      ) {
        continue;
      }
      walk(full, files);
    } else if (
      (entry.endsWith(".tsx") || entry.endsWith(".ts")) &&
      !entry.endsWith(".test.tsx") &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".d.ts")
    ) {
      files.push(full);
    }
  }
  return files;
}

const ALL_FILES = walk(SRC_ROOT).map((p) =>
  relative(SRC_ROOT, p).split(sep).join("/"),
);

function scan(pattern: RegExp): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const rel of ALL_FILES) {
    const abs = join(SRC_ROOT, rel);
    const text = readFileSync(abs, "utf8");
    const matches: string[] = [];
    for (const line of text.split("\n")) {
      if (pattern.test(line)) matches.push(line.trim().slice(0, 200));
    }
    if (matches.length > 0) hits.set(rel, matches);
  }
  return hits;
}

function offenders(
  hits: Map<string, string[]>,
  allowlist: ReadonlySet<string>,
): string[] {
  return [...hits.keys()].filter((f) => !allowlist.has(f));
}

describe("mobile-first patterns: ungated multi-column grids", () => {
  // Rule 5: grids start at 1 column. `grid-cols-3+` at the BASE breakpoint
  // (i.e. without a `sm:` / `md:` / `lg:` / `xl:` prefix on that token) is a
  // mobile bug - it forces 3+ columns on a 360 px screen.
  //
  // Pattern: a `grid-cols-N` (N >= 3) token NOT immediately preceded by a
  // breakpoint prefix.
  const PATTERN = /(^|[\s"'`])grid-cols-(3|4|5|6|7|8|9|1[0-2])\b/;

  // Files known to still violate this rule. Shrink this list as Waves 1-5
  // ship. New violators (files NOT in this set) fail the test.
  const ALLOWED: ReadonlySet<string> = new Set([
    "app/resources/calculations/page.tsx",
    "app/resources/calendar/page.tsx",
    "app/resources/cam-dispute/page.tsx",
    "app/resources/lease-clauses/page.tsx",
    "app/resources/lease-types/page.tsx",
    "app/resources/markets/[metro]/cam-guide/page.tsx",
    "app/resources/roles/page.tsx",
    "app/resources/states/page.tsx",
    "app/resources/templates/page.tsx",
    "app/resources/workflows/page.tsx",
    "app/sample-report/page.tsx",
  ]);

  it("only allowed legacy files contain ungated grid-cols-3+", () => {
    const hits = scan(PATTERN);
    const newOffenders = offenders(hits, ALLOWED);
    expect(
      newOffenders,
      `New mobile-first violations: ungated grid-cols-3+. See marketing/docs/mobile-first-rubric.md rule 5. Files: ${JSON.stringify(newOffenders)}`,
    ).toEqual([]);
  });
});

describe("mobile-first patterns: fixed pixel widths >= 300px", () => {
  // Rule 4: no fixed pixel widths >= 300 px on layout containers without a
  // `max-` / `sm:` / `md:` / `lg:` / `xl:` prefix.
  const PATTERN =
    /(^|[\s"'`])(?<!max-|sm:|md:|lg:|xl:)(?:min-)?w-\[\s*([3-9]\d{2}|\d{4,})px\s*\]/;

  const ALLOWED: ReadonlySet<string> = new Set([
    "app/sample-report/page.tsx",
    // Intentional: scrollable table inside an overflow-x-auto wrapper.
    "components/product-demo/ReconciliationDashboardMock.tsx",
    // Intentional: scrollable table inside an overflow-x-auto wrapper.
    "components/product-demo/LeaseRulesMock.tsx",
    // Intentional: scrollable table inside an overflow-x-auto wrapper.
    "components/product-demo/ExceptionQueueMock.tsx",
  ]);

  it("only allowed legacy files contain raw fixed pixel widths >= 300px", () => {
    const hits = scan(PATTERN);
    const newOffenders = offenders(hits, ALLOWED);
    expect(
      newOffenders,
      `New mobile-first violations: raw w-[Npx]/min-w-[Npx] >= 300 without max-/responsive prefix. See marketing/docs/mobile-first-rubric.md rule 4. Files: ${JSON.stringify(newOffenders)}`,
    ).toEqual([]);
  });
});

describe("mobile-first patterns: known route surface", () => {
  it("rubric document is committed", () => {
    const rubric = join(
      __dirname,
      "..",
      "..",
      "docs",
      "mobile-first-rubric.md",
    );
    const text = readFileSync(rubric, "utf8");
    expect(text).toMatch(/Tap targets/);
    expect(text).toMatch(/text-fluid-/);
  });
});
