import { publicKnowledge } from "@/generated/public-knowledge";

export type ProductFeature = (typeof publicKnowledge.productFeatures)[number];
export type ProductFeatureDomain =
  (typeof publicKnowledge.featureDomains)[number];

export const FEATURE_SITE_URL = publicKnowledge.company.siteUrl;
export const FEATURE_LAST_MODIFIED = "2026-05-31T00:00:00.000Z";

export const productFeatures = publicKnowledge.productFeatures;
export const productFeatureDomains = publicKnowledge.featureDomains;

export function featurePath(feature: ProductFeature): string {
  return `/product/features/${feature.key}`;
}

export function getFeatureByKey(key: string): ProductFeature | undefined {
  return productFeatures.find((feature) => feature.key === key);
}

export function getFeatureDomain(
  domainId: ProductFeature["domain"],
): ProductFeatureDomain {
  return (
    productFeatureDomains.find((domain) => domain.id === domainId) ??
    productFeatureDomains[0]
  );
}

export function getRelatedFeatures(feature: ProductFeature): ProductFeature[] {
  const sameDomain = productFeatures.filter(
    (candidate) =>
      candidate.domain === feature.domain && candidate.key !== feature.key,
  );
  const sameTier = productFeatures.filter(
    (candidate) =>
      candidate.tier === feature.tier &&
      candidate.domain !== feature.domain &&
      candidate.key !== feature.key,
  );

  return [...sameDomain, ...sameTier].slice(0, 5);
}

export function featureProblem(feature: ProductFeature): string {
  const specificRiskByFeature: Record<ProductFeature["key"], string> = {
    "ingestion-csv-excel":
      "The specific risk is that spreadsheet cleanup becomes the reconciliation process, with hidden column mapping errors buried before review begins.",
    "deterministic-calc-engine":
      "The specific risk is that one spreadsheet formula can change tenant charges without leaving a clear trail.",
    "leakage-detection":
      "The specific risk is that a reconciliation goes out with charges that are too low or too high, and the gap only surfaces once the window closes or a tenant disputes.",
    "ai-gl-analysis":
      "The specific risk is that GL descriptions hide CapEx, non-recoverable costs, or unusual charges that a standard account-code review misses.",
    "historical-analysis":
      "The specific risk is that year-over-year anomalies look normal when each reconciliation is reviewed in isolation.",
    "lease-ai-with-review":
      "The specific risk is that extracted lease terms become calculation inputs before a human confirms the cap, exclusion, gross-up, or denominator rule.",
    "snapshot-and-campaign":
      "The specific risk is that teams cannot tell which draft, approval state, or tenant delivery version is the source of record.",
    "tenant-portal":
      "The specific risk is that tenants receive statements without the secure backup and status visibility needed to answer follow-up questions.",
    "dispute-management":
      "The specific risk is that dispute evidence, comments, files, and resolution notes scatter across email threads.",
    "tenant-communications":
      "The specific risk is that statement delivery and dispute updates are sent without a clean record of what each tenant received.",
    "sb1103-and-demand-letters":
      "The specific risk is that California disclosure support and demand-letter context are assembled manually under deadline pressure.",
    "append-only-audit-trail":
      "The specific risk is that finalized reconciliation changes cannot be reconstructed when a tenant auditor asks what changed and why.",
    "audit-defense-package":
      "The specific risk is that audit support takes days to assemble because the statement, trace, GL export, and documents live in separate places.",
    "multi-format-exports":
      "The specific risk is that teams rebuild the same support packet in different formats for tenants, auditors, asset managers, and archives.",
    "statement-detail-advisor":
      "The specific risk is that overly granular statement detail invites disputes that could have been prevented with clearer grouping.",
    "pricing-and-checkout":
      "The specific risk is that a team cannot test the workflow quickly because procurement arrives before proof.",
    "denominator-audit-trail":
      "The specific risk is that RSF, anchor exclusions, or remeasurement changes shift pro-rata shares without a clear explanation.",
    "cap-bank-tracking":
      "The specific risk is that multi-year cap carryovers are lost between reconciliations, which changes recoverable expense timing.",
    "importable-adjustment-exports":
      "The specific risk is that approved adjustments are copied into import files by hand and pick up new errors after review.",
    "anomaly-alerts":
      "The specific risk is that outlier GL lines or unusual variances stay buried inside large export files.",
    "noi-impact-calculator":
      "The specific risk is that teams approve adjustments without seeing the property-level NOI effect.",
    "portfolio-board-reports":
      "The specific risk is that executives get summaries without the backup needed to trust portfolio-wide CAM results.",
    "tax-protest-package":
      "The specific risk is that tax protest support has to be rebuilt from CAM data after the close is already complete.",
    "rbac-and-rls":
      "The specific risk is that users see property, organization, or tenant data outside their role.",
  };
  const problemByDomain: Record<ProductFeature["domain"], string> = {
    "data-ingestion":
      "CAM reconciliation often starts with exports that were built for accounting, not tenant billing review. Teams lose time cleaning files before they can test recoverability.",
    "calculation-engine":
      "Small calculation gaps can move real money. Gross-up, caps, pro-rata shares, and variance checks break down when the spreadsheet logic is hard to trace.",
    "lease-management":
      "Lease terms usually sit in PDFs, abstracts, and email threads. If a cap, exclusion, or denominator value is copied wrong, every downstream calculation inherits the error.",
    "reconciliation-workflow":
      "A reconciliation can pass through drafts, review queues, approvals, and tenant delivery. Without one system of record, teams lose context between versions.",
    "tenant-portal":
      "Tenant questions become harder to answer when statements, backup, comments, and attachments live in separate inboxes.",
    "compliance-legal":
      "When a tenant challenges a reconciliation, the hard part is proving the path from lease clause to GL line to final charge.",
    "exports-reporting":
      "Support packets often take longer than the calculation itself because teams have to rebuild schedules in PDF, Excel, and email attachments.",
    "billing-subscriptions":
      "CAM software buying can get stuck behind long procurement cycles even when a property team only needs to test one close process.",
    "platform-infrastructure":
      "Portfolio teams need access controls that match property roles, organization boundaries, and tenant data separation.",
  };

  return `${problemByDomain[feature.domain]} ${
    specificRiskByFeature[feature.key]
  }`;
}

export function featureSolution(feature: ProductFeature): string {
  return `CapVeri handles ${feature.name.toLowerCase()} inside the reconciliation workflow. ${feature.description}`;
}

export function featureQueries(feature: ProductFeature): string[] {
  return [
    `${feature.name} for CAM reconciliation`,
    `how ${feature.name.toLowerCase()} works in CAM software`,
    `${feature.name.toLowerCase()} for commercial landlords`,
  ];
}

export function featureReviewChecklist(feature: ProductFeature): string[] {
  const checklistByDomain: Record<ProductFeature["domain"], string[]> = {
    "data-ingestion": [
      "Checks source files before reconciliation work begins.",
      "Keeps ERP exports separate from financial calculation logic.",
      "Preserves the file trail for later review.",
    ],
    "calculation-engine": [
      "Shows the input values behind each calculation.",
      "Keeps CAM math deterministic and repeatable.",
      "Routes unusual results to review before tenant delivery.",
    ],
    "lease-management": [
      "Connects lease terms to the reconciliation rules they control.",
      "Requires human review before extracted lease values are used.",
      "Keeps changes visible when terms are updated.",
    ],
    "reconciliation-workflow": [
      "Keeps draft, review, and finalized states separate.",
      "Gives teams one place to see what changed.",
      "Keeps campaign status visible across properties.",
    ],
    "tenant-portal": [
      "Keeps tenant-facing files and questions in one record.",
      "Connects disputes to the statement being challenged.",
      "Gives teams a history of comments and attachments.",
    ],
    "compliance-legal": [
      "Connects supporting evidence to the final reconciliation output.",
      "Keeps finalized records stable for review.",
      "Packages context for counsel, asset managers, and tenant auditors.",
    ],
    "exports-reporting": [
      "Produces support in formats teams can send and archive.",
      "Keeps statement backup tied to source data.",
      "Reduces manual packet assembly before tenant delivery.",
    ],
    "billing-subscriptions": [
      "Lets teams start with a single-property workflow.",
      "Keeps plan limits clear before checkout.",
      "Supports self-serve upgrades as portfolio volume grows.",
    ],
    "platform-infrastructure": [
      "Separates organization data by role and tenant boundary.",
      "Keeps portfolio access aligned with user permissions.",
      "Supports secure workflows across property teams.",
    ],
  };

  return checklistByDomain[feature.domain];
}

export function featureCloseFit(feature: ProductFeature): string {
  return `${feature.name} fits into the CAM close when the team needs a defensible answer, not just a finished spreadsheet. The feature keeps the work tied to source files, lease rules, and review status so a property accountant can explain the result later.`;
}
