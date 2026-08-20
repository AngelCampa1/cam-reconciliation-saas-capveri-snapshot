#!/usr/bin/env node
import { auditInternalLinks } from "./internal-link-registry.mjs";

const report = auditInternalLinks();
const SEP = "-".repeat(70);

console.log("");
console.log(SEP);
console.log("  CAPVERI.COM INTERNAL LINK AUDIT");
console.log(SEP);
console.log(`  Valid routes: ${report.validRoutes.size}`);
console.log(`  Indexable public routes: ${report.indexableRoutes.size}`);
console.log(`  Total unique internal hrefs found: ${report.linkSources.size}`);
console.log(SEP);

console.log(`\nBROKEN LINKS (${report.broken.length})`);
if (report.broken.length === 0) {
  console.log("  OK: No broken internal page links found");
} else {
  for (const { href, sources } of report.broken) {
    console.log(`\n  ${href}`);
    sources.forEach((source) => console.log(`    <- ${source}`));
  }
}

console.log(`\nORPHAN PAGES (${report.orphans.length})`);
console.log("  Scope: indexable public marketing pages; utility routes excluded");
if (report.orphans.length === 0) {
  console.log("  OK: No orphan indexable public pages");
} else {
  report.orphans.forEach((route) => console.log(`  ${route}`));
}

console.log(
  `\nMISSING RESOURCE FAMILIES (${report.missingResourceFamilies.length})`,
);
if (report.missingResourceFamilies.length === 0) {
  console.log("  OK: Every SEO resource family is exposed from Resources");
} else {
  report.missingResourceFamilies.forEach((route) => console.log(`  ${route}`));
}

console.log("\nLOW CONTEXTUAL INBOUND ROUTES");
const lowContextRoutes = [...report.contextualInboundCounts.entries()]
  .filter(([route, count]) => report.indexableRoutes.has(route) && count <= 1)
  .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
  .slice(0, 40);

for (const [route, count] of lowContextRoutes) {
  console.log(`  ${String(count).padStart(2)}  ${route}`);
}

console.log(`\n${SEP}\n`);

if (
  report.broken.length > 0 ||
  report.orphans.length > 0 ||
  report.missingResourceFamilies.length > 0
) {
  process.exitCode = 1;
}
