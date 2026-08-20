// Guards against re-introducing hardcoded plan copy in marketing pages.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Paths are relative to src/ (what path.relative(srcDir, file) produces).
// Files that are explicitly allowed to contain plan-related content.
const ALLOWED_PATHS = new Set([
  // Generated - these are the source of truth output
  "generated/plan-tiers.ts",
  "generated/public-knowledge.ts",
  // Config that wraps canonical source
  "config/plans.ts",
  "config/launch-offer.ts",
  // Pricing UI components - import from canonical, render tier names as display
  "components/PricingContent.tsx",
  "components/landing/PricingTeaser.tsx",
  // Tests - may assert on rendered values
  "__tests__/pricing-consistency.test.ts",
  "__tests__/PricingContent.test.tsx",
  "__tests__/PricingTeaser.test.tsx",
  "__tests__/offering-consistency.test.ts", // this file
  "__tests__/competitor-gap-content.test.ts",
  "__tests__/structured-data.test.ts",
  "app/__tests__/llms-txt.test.ts",
  "app/pricing/__tests__/page.test.tsx",
]);

function getAllTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      files.push(...getAllTsxFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

const marketingRoot = path.resolve(__dirname, "../..");
const srcDir = path.join(marketingRoot, "src");

function getFilesToCheck() {
  const all = getAllTsxFiles(srcDir);
  return all.filter((f) => {
    const rel = path.relative(srcDir, f).replace(/\\/g, "/");
    return !ALLOWED_PATHS.has(rel);
  });
}

describe("offering-consistency", () => {
  // Raw subscription price strings that should not appear outside canonical files.
  // Covers list prices, rounded limited offer prices, and annual totals.
  // NOT: $5,900 recovery estimates, $0 free tool offers, $15K competitor prices.
  it("has no hardcoded subscription price strings outside canonical files", () => {
    const PRICE_PATTERN =
      /\$(350|699|875|1749|1750|3499|6990|17490|34990|3495|8745|17495)\s*\/(mo|month|yr|year)/gi;
    const violations: string[] = [];
    for (const file of getFilesToCheck()) {
      const content = fs.readFileSync(file, "utf8");
      if (PRICE_PATTERN.test(content)) {
        // Reset lastIndex (global regex)
        PRICE_PATTERN.lastIndex = 0;
        const rel = path.relative(srcDir, file).replace(/\\/g, "/");
        violations.push(rel);
      }
      PRICE_PATTERN.lastIndex = 0;
    }
    expect(violations).toEqual([]);
  });

  // Inline Offer schema arrays that duplicate canonical schemaOffers.
  // These should use publicKnowledge.pricing.schemaOffers or schemaOffersByTier instead.
  it("has no inline hardcoded schema.org Offer arrays with price fields outside canonical files", () => {
    // Detects literal "@type": "Offer" paired with a non-zero price field nearby.
    const OFFER_WITH_PRICE = /"@type":\s*"Offer"[\s\S]{0,200}price:\s*"\d/;
    const violations: string[] = [];
    for (const file of getFilesToCheck()) {
      const content = fs.readFileSync(file, "utf8");
      if (OFFER_WITH_PRICE.test(content)) {
        const rel = path.relative(srcDir, file).replace(/\\/g, "/");
        // Exempt tool pages that have price: "0" (free calculators) - those are fine
        if (
          !content.includes('price: "0"') ||
          content.match(/price:\s*"\d[1-9]/)
        ) {
          violations.push(rel);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
