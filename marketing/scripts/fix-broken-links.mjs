#!/usr/bin/env node
/**
 * Fixes all 38 broken internal links found by the audit script.
 * Replaces each broken href with the correct existing route.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// Map of broken href → correct href
const FIXES = {
  // Glossary terms with wrong slugs
  "/glossary/audit-rights": "/resources/lease-clauses/audit-rights",
  "/glossary/controllable-expenses": "/glossary/controllable-vs-non-controllable-expenses",
  "/glossary/gross-up": "/glossary/gross-up-clause",
  "/glossary/rentable-square-footage": "/glossary/usable-vs-rentable-area",

  // BOMA topics with wrong slugs
  "/resources/boma/2024-office-standard": "/resources/boma/boma-2024-adoption-roadmap",
  "/resources/boma/gross-up": "/resources/lease-clauses/gross-up-clause",

  // Calculations with wrong slugs
  "/resources/calculations/gross-up-95-occupancy": "/resources/calculations/gross-up-adjustment",
  "/resources/calculations/pro-rata-share": "/resources/calculations/proration-by-sqft",

  // Non-existent resource pages → nearest real page
  "/resources/cam-reconciliation-audit-trail": "/blog/cam-reconciliation-audit-trail",
  "/resources/cam-reconciliation-errors": "/resources/top-15-cam-billing-errors",
  "/resources/cap-carry-forward-tracking": "/blog/cap-carry-forward-tracking",

  // Expense slugs with wrong names
  "/resources/expenses/administrative": "/resources/expenses/administrative-overhead",
  "/resources/expenses/insurance": "/resources/expenses/building-insurance",
  "/resources/expenses/repairs-and-maintenance": "/resources/expenses/hvac-maintenance",
  "/resources/expenses/utilities": "/resources/expenses/utilities-common-area",

  // Lease clause slugs with wrong names
  "/resources/lease-clauses/base-year-expense-stop": "/resources/lease-clauses/expense-stop",
  "/resources/lease-clauses/cam-cap": "/resources/lease-clauses/cumulative-cam-cap",
  "/resources/lease-clauses/cam-exclusions": "/resources/lease-clauses/opex-exclusions",
  "/resources/lease-clauses/cam-floor": "/resources/calculations/cam-cap-floor",
  "/resources/lease-clauses/gross-up": "/resources/lease-clauses/gross-up-clause",
  "/resources/lease-clauses/qualified-small-tenant": "/resources/sb-1103-compliance",

  // Lease types wrong slug
  "/resources/lease-types/nnn/cam-guide": "/resources/lease-types/nnn-lease/cam-guide",

  // Metro slugs with wrong names
  "/resources/markets/dallas/cam-guide": "/resources/markets/dallas-fort-worth-tx/cam-guide",
  "/resources/markets/houston/cam-guide": "/resources/markets/houston-tx/cam-guide",
  "/resources/markets/miami-fl/cam-guide": "/resources/markets/miami-fort-lauderdale-fl/cam-guide",

  // Property type slugs with wrong names
  "/resources/property-types/industrial/cam-guide": "/resources/property-types/flex-industrial/cam-guide",
  "/resources/property-types/office/cam-guide": "/resources/property-types/class-a-office/cam-guide",
  "/resources/property-types/retail/cam-guide": "/resources/property-types/neighborhood-retail/cam-guide",

  // Software slug wrong
  "/resources/software/yardi/cam-setup": "/resources/software/yardi-voyager/cam-setup",

  // Workflow slugs with wrong names
  "/resources/workflows/annual-cam-reconciliation": "/resources/workflows/year-end-reconciliation",
  "/resources/workflows/cam-estimate-preparation": "/resources/workflows/estimate-letter-generation",
  "/resources/workflows/cam-variance-investigation": "/resources/workflows/budget-to-actual-variance",
  "/resources/workflows/gl-export-reconciliation": "/resources/workflows/year-end-reconciliation",
  "/resources/workflows/new-tenant-onboarding": "/resources/workflows/new-acquisition-cam-setup",
  "/resources/workflows/portfolio-level-cam-operations": "/resources/workflows/portfolio-consolidation",
  "/resources/workflows/tenant-move-out-reconciliation": "/resources/workflows/mid-year-tenant-adjustment",
  "/resources/workflows/year-end-cam-reconciliation": "/resources/workflows/year-end-reconciliation",
};

// lifestyle-center needs /cam-guide appended - handled separately
const LIFESTYLE_BROKEN = "/resources/property-types/lifestyle-center\"";
const LIFESTYLE_FIXED = "/resources/property-types/lifestyle-center/cam-guide\"";

let totalFixes = 0;

function fixFile(filePath) {
  let content = readFileSync(filePath, "utf8");
  let changed = false;

  for (const [broken, fixed] of Object.entries(FIXES)) {
    if (content.includes(broken)) {
      const count = (content.match(new RegExp(broken.replace(/[/\-]/g, "\\$&"), "g")) || []).length;
      content = content.replaceAll(broken, fixed);
      console.log(`  [${count}×] ${broken} → ${fixed}`);
      totalFixes += count;
      changed = true;
    }
  }

  // Special case: lifestyle-center missing /cam-guide
  if (content.includes(LIFESTYLE_BROKEN)) {
    const count = (content.match(/\/resources\/property-types\/lifestyle-center"/g) || []).length;
    content = content.replaceAll(LIFESTYLE_BROKEN, LIFESTYLE_FIXED);
    console.log(`  [${count}×] /resources/property-types/lifestyle-center → /resources/property-types/lifestyle-center/cam-guide`);
    totalFixes += count;
    changed = true;
  }

  if (changed) {
    writeFileSync(filePath, content, "utf8");
    return true;
  }
  return false;
}

function walkDir(dir, callback, extensions) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (["node_modules", ".next", ".git", "scripts", "generated"].includes(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      walkDir(full, callback, extensions);
    } else if (extensions.includes(extname(entry))) {
      callback(full);
    }
  }
}

console.log("\nFixing broken links...\n");

let filesFixed = 0;

// Fix JSON data files
walkDir(join(ROOT, "data"), (file) => {
  console.log(`\n${file.replace(ROOT + "\\", "").replace(/\\/g, "/")}`);
  if (fixFile(file)) filesFixed++;
}, [".json"]);

// Fix MDX content files
walkDir(join(ROOT, "content"), (file) => {
  const rel = file.replace(ROOT + "\\", "").replace(/\\/g, "/");
  let content = readFileSync(file, "utf8");
  let changed = false;

  for (const [broken, fixed] of Object.entries(FIXES)) {
    if (content.includes(broken)) {
      const count = (content.match(new RegExp(broken.replace(/[/\-]/g, "\\$&"), "g")) || []).length;
      if (!changed) console.log(`\n${rel}`);
      content = content.replaceAll(broken, fixed);
      console.log(`  [${count}×] ${broken} → ${fixed}`);
      totalFixes += count;
      changed = true;
    }
  }

  // Special case for MDX: lifestyle-center in href attribute
  const lifestyleMdx = "/resources/property-types/lifestyle-center)";
  const lifestyleMdxFixed = "/resources/property-types/lifestyle-center/cam-guide)";
  if (content.includes(lifestyleMdx)) {
    if (!changed) console.log(`\n${rel}`);
    content = content.replaceAll(lifestyleMdx, lifestyleMdxFixed);
    console.log(`  [1×] ${lifestyleMdx} → ${lifestyleMdxFixed}`);
    totalFixes++;
    changed = true;
  }

  if (changed) {
    writeFileSync(file, content, "utf8");
    filesFixed++;
  }
}, [".mdx"]);

// Fix TSX/TS files (e.g. content-map.ts)
walkDir(join(ROOT, "src"), (file) => {
  const rel = file.replace(ROOT + "\\", "").replace(/\\/g, "/");
  let content = readFileSync(file, "utf8");
  let changed = false;

  for (const [broken, fixed] of Object.entries(FIXES)) {
    if (content.includes(broken)) {
      const count = (content.match(new RegExp(broken.replace(/[/\-]/g, "\\$&"), "g")) || []).length;
      if (!changed) console.log(`\n${rel}`);
      content = content.replaceAll(broken, fixed);
      console.log(`  [${count}×] ${broken} → ${fixed}`);
      totalFixes += count;
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(file, content, "utf8");
    filesFixed++;
  }
}, [".tsx", ".ts"]);

console.log(`\n✅ Fixed ${totalFixes} broken links across ${filesFixed} files.\n`);
