export type SeoFunnelStage = "tofu" | "mofu" | "bofu";

export interface SeoClusterLink {
  href: string;
  label: string;
}

export interface SeoCluster {
  id: string;
  label: string;
  hub: SeoClusterLink;
  product: SeoClusterLink;
  funnelStage: SeoFunnelStage;
  audience: "landlord" | "tenant" | "mixed";
  description: string;
  priorityRoutes: SeoClusterLink[];
  routePrefixes?: string[];
  slugIncludes: string[];
}

function link(href: string, label: string): SeoClusterLink {
  return { href, label };
}

export const SEO_CLUSTERS: SeoCluster[] = [
  {
    id: "cam-reconciliation",
    label: "CAM Reconciliation",
    hub: link("/cam-reconciliation-guide", "CAM Reconciliation Guide"),
    product: link(
      "/cam-reconciliation-software",
      "CAM Reconciliation Software",
    ),
    funnelStage: "mofu",
    audience: "landlord",
    description:
      "Annual reconciliation workflows, statements, timelines, true-ups, and close process guidance.",
    priorityRoutes: [
      link(
        "/resources/cam-reconciliation-process",
        "CAM Reconciliation Process",
      ),
      link(
        "/resources/cam-reconciliation-checklist",
        "CAM Reconciliation Checklist",
      ),
      link(
        "/resources/cam-reconciliation-example",
        "CAM Reconciliation Example",
      ),
      link("/tools/cam-reconciliation-template", "CAM Reconciliation Template"),
      link(
        "/tools/reconciliation-statement-generator",
        "Reconciliation Statement Generator",
      ),
    ],
    slugIncludes: [
      "cam-reconciliation",
      "reconciliation",
      "true-up",
      "year-end",
      "close",
      "statement",
      "pre-send",
      "presend",
      "estimate",
    ],
  },
  {
    id: "cam-charges-expenses",
    label: "CAM Charges and Expenses",
    hub: link("/cam-charges", "CAM Charges Guide"),
    product: link("/tools/cam-gross-up-calculator", "CAM Gross-Up Calculator"),
    funnelStage: "tofu",
    audience: "mixed",
    description:
      "CAM definitions, recoverable expenses, gross-up, pro-rata share, caps, admin fees, and expense classification.",
    priorityRoutes: [
      link("/resources/expenses", "Recoverable Expense Guides"),
      link(
        "/resources/recoverable-vs-nonrecoverable-cam",
        "Recoverable vs Non-Recoverable CAM",
      ),
      link(
        "/resources/cam-gross-up-calculation-guide",
        "CAM Gross-Up Calculation Guide",
      ),
      link(
        "/resources/pro-rata-share-calculation",
        "Pro-Rata Share Calculation",
      ),
      link("/tools/admin-fee-calculator", "Admin Fee Calculator"),
    ],
    routePrefixes: ["/resources/expenses/"],
    slugIncludes: [
      "cam-charge",
      "cam-fee",
      "expense",
      "recoverable",
      "nonrecoverable",
      "gross-up",
      "pro-rata",
      "admin-fee",
      "management-fee",
      "capex",
      "opex",
      "tax",
      "insurance",
      "recovery-ratio",
      "vacancy",
      "occupancy",
      "denominator",
      "cap-",
      "cam-cap",
      "cumulative-cap",
    ],
  },
  {
    id: "lease-clauses-structures",
    label: "Lease Clauses and Lease Structures",
    hub: link("/resources/lease-clauses", "Lease Clause Playbooks"),
    product: link("/lease-abstraction", "Lease Abstraction Workflow"),
    funnelStage: "mofu",
    audience: "mixed",
    description:
      "Lease language, NNN and gross lease structures, base years, exclusions, renewals, estoppels, and abstraction.",
    priorityRoutes: [
      link("/resources/lease-types", "Commercial Lease Types"),
      link(
        "/resources/lease-clauses-that-change-cam-outcomes",
        "Lease Clauses That Change CAM Outcomes",
      ),
      link("/resources/base-year-expense-stop", "Base Year Expense Stop"),
      link("/resources/lease-abstraction-guide", "Lease Abstraction Guide"),
      link(
        "/tools/lease-clause-extraction-matrix",
        "Lease Clause Extraction Matrix",
      ),
    ],
    routePrefixes: ["/resources/lease-clauses/", "/resources/lease-types/"],
    slugIncludes: [
      "lease",
      "nnn",
      "triple-net",
      "gross-lease",
      "modified-gross",
      "single-net",
      "double-net",
      "base-year",
      "expense-stop",
      "clause",
      "estoppel",
      "rent-structure",
      "percentage-rent",
      "abstraction",
      "abstract",
      "renewal",
    ],
  },
  {
    id: "audit-dispute-defense",
    label: "CAM Audit and Dispute Defense",
    hub: link("/cam-audit", "CAM Audit Guide"),
    product: link("/cam-audit-software", "CAM Audit Software"),
    funnelStage: "mofu",
    audience: "mixed",
    description:
      "Tenant audit requests, dispute response, audit defense packets, documentation demands, and overbilling liability.",
    priorityRoutes: [
      link("/resources/cam-dispute", "CAM Dispute Guides"),
      link("/resources/audit-defense-packet", "Audit Defense Packet"),
      link(
        "/resources/tenant-cam-audit-landlord-side",
        "Tenant CAM Audit Guide",
      ),
      link(
        "/resources/cam-overbilling-landlord-liability",
        "CAM Overbilling Liability",
      ),
      link(
        "/tools/audit-defense-packet-builder",
        "Audit Defense Packet Builder",
      ),
    ],
    routePrefixes: ["/resources/cam-dispute/"],
    slugIncludes: [
      "audit",
      "dispute",
      "overbilling",
      "demand-letter",
      "documentation-demand",
      "liability",
      "tenant-auditor",
      "tenant-cam",
      "risk-scorecard",
      "risk-quiz",
    ],
  },
  {
    id: "compliance-boma-state",
    label: "Compliance, BOMA, and State Rules",
    hub: link("/resources/states", "CAM Compliance by State"),
    product: link("/tools/sb-1103-checker", "SB 1103 Checker"),
    funnelStage: "mofu",
    audience: "landlord",
    description:
      "State disclosure rules, SB 1103, BOMA measurement standards, market-specific requirements, and compliance calendars.",
    priorityRoutes: [
      link("/resources/boma", "BOMA Standards"),
      link(
        "/resources/commercial-tenant-cam-disclosure-by-state",
        "CAM Disclosure by State",
      ),
      link(
        "/resources/california-sb-1103-cam-guide",
        "California SB 1103 CAM Guide",
      ),
      link("/resources/calendar", "CAM Calendar"),
      link("/tools/boma-2024-calculator", "BOMA 2024 Calculator"),
    ],
    routePrefixes: [
      "/resources/boma/",
      "/resources/states/",
      "/resources/markets/",
      "/resources/calendar/",
    ],
    slugIncludes: [
      "boma",
      "sb-1103",
      "california",
      "texas",
      "florida",
      "state",
      "compliance",
      "disclosure",
      "calendar",
      "deadline",
      "hcad",
      "houston",
      "dfw",
      "market",
      "remeasurement",
    ],
  },
  {
    id: "operations-workflows",
    label: "Property Operations and Close Workflow",
    hub: link("/resources/workflows", "CAM Workflows"),
    product: link("/product-tour", "Product Tour"),
    funnelStage: "mofu",
    audience: "landlord",
    description:
      "Property accountant workflows, portfolio QA, staffing, month-end controls, templates, and repeatable operating procedures.",
    priorityRoutes: [
      link("/resources/templates", "CAM Templates"),
      link("/resources/month-end-cam-controls", "Month-End CAM Controls"),
      link("/resources/cam-close-checklist", "CAM Close Checklist"),
      link("/resources/roles", "CAM Guides by Role"),
      link(
        "/tools/cam-pre-send-packet-checklist-download",
        "Pre-Send Packet Checklist",
      ),
    ],
    routePrefixes: [
      "/resources/workflows/",
      "/resources/roles/",
      "/resources/templates/",
    ],
    slugIncludes: [
      "workflow",
      "checklist",
      "template",
      "staffing",
      "accountant",
      "controller",
      "quality-program",
      "batch",
      "multi-property",
      "month-end",
      "training",
      "delegation",
      "cover-letter",
    ],
  },
  {
    id: "software-erp-tools",
    label: "Software, ERP Exports, and Tools",
    hub: link("/resources/software", "Software Setup Guides"),
    product: link("/tools", "CAM Tools"),
    funnelStage: "bofu",
    audience: "landlord",
    description:
      "Yardi, MRI, RealPage, AppFolio, exports, GL QA, comparisons, alternatives, and calculator-led conversion paths.",
    priorityRoutes: [
      link("/yardi-cam-reconciliation", "Yardi CAM Reconciliation"),
      link("/mri-cam-reconciliation", "MRI CAM Reconciliation"),
      link("/vs", "CapVeri Comparisons"),
      link("/alternatives", "Alternatives"),
      link("/resources/gl-export-qa-cam", "GL Export QA"),
    ],
    routePrefixes: [
      "/resources/software/",
      "/tools/",
      "/vs/",
      "/alternatives/",
      "/integrations/",
      "/switch/",
    ],
    slugIncludes: [
      "software",
      "yardi",
      "mri",
      "realpage",
      "appfolio",
      "entrata",
      "sage",
      "buildium",
      "excel",
      "calculator",
      "tool",
      "gl-export",
      "export",
      "recovery-code",
      "charge-code",
      "erp",
      "automation",
      "automate",
      "compare",
      "alternative",
      "vs-",
    ],
  },
  {
    id: "cre-finops-value",
    label: "CRE FinOps, NOI, and Portfolio Value",
    hub: link("/resources/cam-glossary-cre-finops", "CRE FinOps Glossary"),
    product: link("/roi", "CAM Recovery ROI"),
    funnelStage: "tofu",
    audience: "landlord",
    description:
      "NOI impact, operating expense benchmarks, property-type guidance, valuation, portfolio strategy, and CRE FinOps education.",
    priorityRoutes: [
      link("/resources/property-types", "CAM by Property Type"),
      link(
        "/resources/cam-benchmarks-by-property-type",
        "CAM Benchmarks by Property Type",
      ),
      link("/resources/noi-formula-calculation-guide", "NOI Formula Guide"),
      link("/tools/noi-impact-calculator", "NOI Impact Calculator"),
      link("/tools/cam-billing-error-estimator", "CAM Billing Error Estimator"),
    ],
    routePrefixes: ["/resources/property-types/", "/glossary/", "/solutions/"],
    slugIncludes: [
      "cre-finops",
      "noi",
      "portfolio",
      "property-type",
      "office",
      "retail",
      "industrial",
      "mixed-use",
      "benchmark",
      "leakage",
      "value",
      "cap-rate",
      "investment",
      "investor",
      "operating-expense",
      "commercial-real-estate",
      "sale-leaseback",
      "glossary",
    ],
  },
];

const FALLBACK_CLUSTER = SEO_CLUSTERS.find(
  (cluster) => cluster.id === "cre-finops-value",
)!;

function normalizePath(path: string): string {
  const [withoutQuery] = path.split(/[?#]/);
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function routeSlug(path: string): string {
  return normalizePath(path).split("/").filter(Boolean).join("-");
}

export function getSeoClusterForPath(path: string): SeoCluster {
  const normalized = normalizePath(path);
  const slug = routeSlug(normalized);

  const prefixMatch = SEO_CLUSTERS.find((cluster) =>
    cluster.routePrefixes?.some((prefix) => normalized.startsWith(prefix)),
  );
  if (prefixMatch) return prefixMatch;

  const directHubMatch = SEO_CLUSTERS.find(
    (cluster) =>
      cluster.hub.href === normalized || cluster.product.href === normalized,
  );
  if (directHubMatch) return directHubMatch;

  return (
    SEO_CLUSTERS.find((cluster) =>
      cluster.slugIncludes.some((needle) => slug.includes(needle)),
    ) ?? FALLBACK_CLUSTER
  );
}

export function getClusterRelatedLinks(
  currentPath: string,
  limit = 6,
): SeoClusterLink[] {
  const cluster = getSeoClusterForPath(currentPath);
  const seen = new Set([normalizePath(currentPath)]);
  const links: SeoClusterLink[] = [];

  for (const candidate of [
    cluster.hub,
    cluster.product,
    ...cluster.priorityRoutes,
  ]) {
    const href = normalizePath(candidate.href);
    if (seen.has(href)) continue;
    seen.add(href);
    links.push(candidate);
    if (links.length >= limit) break;
  }

  return links;
}
