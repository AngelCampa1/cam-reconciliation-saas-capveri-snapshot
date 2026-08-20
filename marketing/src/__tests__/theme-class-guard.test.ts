import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Resource pages are now MDX files. Update paths accordingly.
const TARGET_FILES = [
  "src/components/content/ContentPageLayout.tsx",
  "src/components/content/ToolPageLayout.tsx",
  "content/resources/harris-county-gross-up.mdx",
  "content/resources/sb-1103-compliance.mdx",
];

const FORBIDDEN_PATTERNS = [
  /bg-white\b/,
  /text-gray-\d+\b/,
  /bg-gray-\d+\b/,
  /border-gray-\d+\b/,
  /text-blue-\d+\b/,
  /bg-blue-\d+\b/,
];

describe("theme class guard", () => {
  it("rejects hard-coded light palette classes on content surfaces", () => {
    const violations: string[] = [];

    for (const relativeFile of TARGET_FILES) {
      const fullPath = path.join(PROJECT_ROOT, relativeFile);
      const source = fs.readFileSync(fullPath, "utf8");

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${relativeFile}: ${String(pattern)}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
