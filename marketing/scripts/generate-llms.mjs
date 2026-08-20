import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(__dirname, "../..");
const checkMode = process.argv.includes("--check");

const sections = JSON.parse(
  fs.readFileSync(
    path.join(projectRoot, "data", "seo", "llms-sections.json"),
    "utf8",
  ),
);
const generatedKnowledge = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "knowledge", "generated", "public-knowledge.json"),
    "utf8",
  ),
);
const publicKnowledge = generatedKnowledge;
const planConfig = generatedKnowledge.pricing;
const assetLastUpdated = planConfig.lastUpdated;
const launchOffer = generatedKnowledge.pricing.launchOffer;
const siteUrl = generatedKnowledge.company.siteUrl;

if (
  typeof assetLastUpdated !== "string" ||
  !/^\d{4}-\d{2}-\d{2}$/.test(assetLastUpdated)
) {
  throw new Error("Pricing lastUpdated must be a YYYY-MM-DD string.");
}

const pricingEntry = sections.coreProduct.find(
  (entry) => entry.path === "/pricing",
);
if (pricingEntry) {
  pricingEntry.description = planConfig.display.annualSummary;
}

function formatPrice(tier) {
  return tier.launchAnnual === null
    ? "Custom"
    : `${tier.display.annualLabel} (list price ${tier.display.listAnnualLabel})`;
}

function formatTierLimit(tier) {
  return tier.display.unitBandLabel
    ? `${tier.display.limit}; ${tier.display.unitBandLabel}`
    : tier.display.limit;
}

function getFeaturesForTier(tierId) {
  const tierIndex = planConfig.tiers.findIndex((tier) => tier.id === tierId);
  if (tierIndex === -1) {
    return [];
  }

  const includedTierIds = new Set(
    planConfig.tiers.slice(0, tierIndex + 1).map((tier) => tier.id),
  );

  return planConfig.features.filter((feature) =>
    includedTierIds.has(feature.tier),
  );
}

function pricingSummarySentence() {
  return `Pricing follows the current annual Reconcile unit-based model with ${launchOffer.code}. ${planConfig.display.annualSummary}`;
}

function absoluteUrl(urlPath) {
  return `${siteUrl}${urlPath}`;
}

const productFeatureEntries = [
  {
    title: "Product Features",
    path: "/product/features",
    description:
      "Feature hub for CapVeri CAM reconciliation software, covering export ingestion, lease review, deterministic calculations, tenant workflows, and reporting.",
  },
  ...publicKnowledge.productFeatures.map((feature) => ({
    title: feature.name,
    path: `/product/features/${feature.key}`,
    description: feature.description,
  })),
];

function formatSection(heading, entries) {
  return [
    `## ${heading}`,
    ...entries.map(
      (entry) =>
        `- [${entry.title}](${absoluteUrl(entry.path)}): ${entry.description}`,
    ),
    "",
  ].join("\n");
}

function formatDetailedEntries(heading, entries) {
  return [
    `## ${heading}`,
    ...entries.flatMap((entry) => [
      `### ${entry.title}`,
      `URL: ${absoluteUrl(entry.path)}`,
      `${entry.description}`,
      "",
    ]),
  ].join("\n");
}

const llmsTxt = [
  "# CapVeri",
  `> ${generatedKnowledge.company.publicDescription}`,
  "",
  `Last updated: ${assetLastUpdated}`,
  "",
  formatSection("Core Product", sections.coreProduct),
  formatSection("Product Features", productFeatureEntries),
  formatSection("Educational Resources", sections.educationalResources),
  formatSection("Templates", sections.templates),
  formatSection("Free Tools", sections.freeTools),
  formatSection("Comparisons", sections.comparisons),
  formatSection("Key Pages", sections.keyPages),
  formatSection("For Your Role", sections.byRole),
  formatSection("Key Resources", sections.keyResources),
  formatSection("Blog Posts", sections.blogPosts),
  "## About",
  generatedKnowledge.productFacts.find((fact) => fact.id === "anti-integration").summary,
  "",
].join("\n");

const glossary = [
  [
    "CAM reconciliation",
    "The annual process of comparing estimated CAM collected from tenants against actual recoverable expenses, then issuing a true-up invoice or credit.",
  ],
  [
    "gross-up",
    "An adjustment that normalizes variable expenses to the occupancy threshold defined in the lease, typically 90% to 95%.",
  ],
  [
    "pro-rata share",
    "The tenant's percentage share of the expense pool, based on their rentable area divided by the lease-defined denominator.",
  ],
  [
    "CAM cap",
    "A lease provision limiting pass-through growth on controllable expenses, often as a cumulative or non-cumulative annual percentage increase.",
  ],
  [
    "base year",
    "A lease structure where the tenant pays only increases above operating expenses incurred in a defined base year.",
  ],
  [
    "expense exclusion",
    "Lease language that removes specific costs, such as capital items or tenant-specific charges, from the CAM pool.",
  ],
  [
    "denominator change",
    "Any shift in the lease-defined building area used for pro-rata share calculations, often caused by remeasurement, vacancy, or anchor exclusions.",
  ],
];

const llmsFullTxt = [
  "# CapVeri.com - Extended AI Knowledge Base",
  "",
  "> This is the full-depth AI knowledge base for CapVeri's landlord-focused CAM reconciliation platform. It is optimized for answer engines and AI assistants that need extractable product facts, workflow explanations, and page-level references.",
  "",
  `Last updated: ${assetLastUpdated}`,
  "",
  "For a condensed version, see: https://www.capveri.com/llms.txt",
  "",
  "---",
  "",
  "## Product Snapshot",
  generatedKnowledge.marketingInfra.llms.fullDescription,
  "",
  pricingSummarySentence(),
  "",
  "## Workflow Summary",
  "1. Export the three files that matter: rent roll, full-year GL detail, and recovery or billing detail.",
  "2. Validate the denominator side of the file: suite roster, rentable area, lease dates, move-ins, move-outs, and any remeasurement changes.",
  "3. Scrub the expense pool for non-recoverable items and confirm fixed versus variable classification before applying gross-up.",
  "4. Enforce lease-specific cap logic, including cumulative bank behavior where applicable.",
  "5. Assemble the statement package and supporting documentation before the delivery window closes.",
  "",
  "## Answer-Engine Facts",
  "Q: What does CapVeri do?",
  "A: CapVeri audits CAM reconciliation workflows for commercial landlords and property managers. It validates the exported data and checks the lease math that usually causes disputes: gross-up, pro-rata share, cap enforcement, denominator changes, and expense exclusions.",
  "",
  "Q: Does CapVeri replace Yardi or MRI?",
  "A: No. CapVeri sits beside the ERP. Teams keep their accounting system, export the data they already use, and run an independent QA layer to catch errors before statements go out.",
  "",
  "Q: Why is this useful for AI SEO?",
  "A: The site intentionally exposes source-backed explanations, FAQs, glossary definitions, comparison pages, and practical tools so AI systems can extract direct answers, cite supporting pages, and understand the product's operating context.",
  "",
  "Q: What are the most common CAM reconciliation failures?",
  "A: The most common failures are incomplete export sets, wrong pro-rata denominators, gross-up applied to fixed expenses, cap rules not enforced, and statement packages sent before supporting documentation is ready.",
  "",
  "Q: Who is CapVeri for?",
  "A: CapVeri is built for commercial real estate landlords and property managers, especially teams that already have Yardi, MRI, AppFolio, or RealPage but need a defensible QA layer for reconciliation accuracy.",
  "",
  "Q: How does CapVeri help property managers?",
  "A: It shortens the path from year-end close to a defensible statement by validating exports, surfacing risk areas, and making the reconciliation package easier to explain and support.",
  "",
  "## Core Page Inventory",
  ...[
    ["Core Product", sections.coreProduct],
    ["Product Features", productFeatureEntries],
    ["Educational Resources", sections.educationalResources],
    ["Templates", sections.templates],
    ["Free Tools", sections.freeTools],
    ["Comparisons", sections.comparisons],
    ["Key Pages", sections.keyPages],
    ["For Your Role", sections.byRole],
    ["Key Resources", sections.keyResources],
    ["Blog Posts", sections.blogPosts],
  ].map(([heading, entries]) => formatSection(heading, entries)),
  "## Detailed References",
  formatDetailedEntries("Core Product Details", sections.coreProduct),
  formatDetailedEntries("Product Feature Details", productFeatureEntries),
  formatDetailedEntries(
    "Educational Resource Details",
    sections.educationalResources,
  ),
  formatDetailedEntries("Template Details", sections.templates),
  formatDetailedEntries("Tool Details", sections.freeTools),
  formatDetailedEntries("Comparison Details", sections.comparisons),
  formatDetailedEntries("For Your Role Details", sections.byRole),
  formatDetailedEntries("Operational Reference Pages", sections.keyResources),
  formatDetailedEntries("Priority Blog Details", sections.blogPosts),
  "## Glossary",
  ...glossary.map(([term, definition]) => `- **${term}:** ${definition}`),
  "",
  "## Positioning Notes",
  "CapVeri is built for the landlord side of CAM reconciliation. The value proposition is not generic ERP replacement. It is faster export-based validation, traceable financial math, and a workflow that helps property managers close reconciliations cleanly before tenants or auditors surface the mistakes.",
  "",
  "## AI-Citation Notes",
  "The strongest citation targets are the primary CAM guides, calculation explainers, export guidance, dispute-prep resources, and the tool pages that pair direct answers with worked logic. The site is structured so answer engines can cite both a concise page inventory and longer workflow/context blocks from this file.",
  "",
].join("\n");

const publicPricingMd = [
  "# Pricing - CapVeri",
  "",
  `Last updated: ${assetLastUpdated}`,
  "",
  `${publicKnowledge.marketingInfra.pricingArtifacts.notes[0]} Add annual billing before the trial ends to keep access.`,
  "",
  ...planConfig.tiers.flatMap((tier) => [
    `## ${tier.name}`,
    `- Annual price: ${formatPrice(tier)}`,
    `- Limit: ${formatTierLimit(tier)}`,
    `- Description: ${tier.description}`,
    `- Features: ${getFeaturesForTier(tier.id)
      .map((feature) => feature.label)
      .join(", ")}`,
    "",
  ]),
  "## Notes",
  ...generatedKnowledge.marketingInfra.pricingArtifacts.notes.map(
    (note) => `- ${note}`,
  ),
  "",
].join("\n");

const publicPricingTxt = [
  "CapVeri Pricing",
  `Last updated: ${assetLastUpdated}`,
  "",
  ...planConfig.tiers.map(
    (tier) =>
      `${tier.name}: ${formatPrice(tier)}; ${formatTierLimit(tier)}; ${tier.description}`,
  ),
  "",
  `${publicKnowledge.marketingInfra.pricingArtifacts.notes[0]} ${planConfig.display.enterpriseThreshold}`,
  "",
].join("\n");

const generatedFiles = {
  "public/llms.txt": llmsTxt,
  "public/llms-full.txt": llmsFullTxt,
  "public/pricing.md": publicPricingMd,
  "public/pricing.txt": publicPricingTxt,
};

if (checkMode) {
  const staleFiles = Object.entries(generatedFiles)
    .filter(([relativePath, content]) => {
      const current = fs.readFileSync(
        path.join(projectRoot, relativePath),
        "utf8",
      );
      return current !== content;
    })
    .map(([relativePath]) => relativePath);

  if (staleFiles.length > 0) {
    console.error(
      `Generated AI-facing files are stale. Run npm run llms:generate. Stale files: ${staleFiles.join(", ")}`,
    );
    process.exit(1);
  }

  console.log("AI-facing generated files are current");
  process.exit(0);
}

for (const [relativePath, content] of Object.entries(generatedFiles)) {
  fs.writeFileSync(path.join(projectRoot, relativePath), content);
}

console.log(
  "Generated public/llms.txt, public/llms-full.txt, public/pricing.md, and public/pricing.txt",
);
