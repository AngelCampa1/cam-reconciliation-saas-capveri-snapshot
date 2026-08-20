import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, dirname, extname, join, relative, sep } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const CONTENT_DIR = join(ROOT, "content");
const SRC_DIR = join(ROOT, "src");
const APP_DIR = join(SRC_DIR, "app");

const RESOURCE_FAMILY_PATTERNS = {
  "states.json": {
    collectionKey: "states",
    hub: "/resources/states",
    route: (slug) => `/resources/states/${slug}/cam-compliance`,
  },
  "metros.json": {
    collectionKey: "metros",
    hub: "/resources/markets",
    route: (slug) => `/resources/markets/${slug}/cam-guide`,
  },
  "property-types.json": {
    collectionKey: "propertyTypes",
    hub: "/resources/property-types",
    route: (slug) => `/resources/property-types/${slug}/cam-guide`,
  },
  "software.json": {
    collectionKey: "software",
    hub: "/resources/software",
    route: (slug) => `/resources/software/${slug}/cam-setup`,
  },
  "boma-topics.json": {
    collectionKey: "topics",
    hub: "/resources/boma",
    route: (slug) => `/resources/boma/${slug}`,
  },
  "lease-clauses.json": {
    collectionKey: "clauses",
    hub: "/resources/lease-clauses",
    route: (slug) => `/resources/lease-clauses/${slug}`,
  },
  "expenses.json": {
    collectionKey: "categories",
    hub: "/resources/expenses",
    route: (slug) => `/resources/expenses/${slug}`,
  },
  "roles.json": {
    collectionKey: "roles",
    hub: "/resources/roles",
    route: (slug) => `/resources/roles/${slug}/cam-guide`,
  },
  "workflows.json": {
    collectionKey: "workflows",
    hub: "/resources/workflows",
    route: (slug) => `/resources/workflows/${slug}`,
  },
  "calendar.json": {
    collectionKey: "entries",
    hub: "/resources/calendar",
    route: (slug) => `/resources/calendar/${slug}`,
  },
  "cam-calculations.json": {
    collectionKey: "calculations",
    hub: "/resources/calculations",
    route: (slug) => `/resources/calculations/${slug}`,
  },
  "cam-dispute.json": {
    collectionKey: "disputeContent",
    hub: "/resources/cam-dispute",
    route: (slug) => `/resources/cam-dispute/${slug}`,
  },
  "lease-types.json": {
    collectionKey: "leaseTypes",
    hub: "/resources/lease-types",
    route: (slug) => `/resources/lease-types/${slug}/cam-guide`,
  },
  "templates.json": {
    collectionKey: "templates",
    hub: "/resources/templates",
    route: (slug) => `/resources/templates/${slug}`,
  },
};

const OTHER_JSON_PATTERNS = {
  "alternatives.json": {
    collectionKey: "alternatives",
    hub: "/alternatives",
    route: (slug) => `/alternatives/${slug}`,
  },
  "comparisons.json": {
    collectionKey: "comparisons",
    hub: "/vs",
    route: (slug) => `/vs/${slug}`,
  },
  "integrations.json": {
    collectionKey: "integrations",
    hub: "/integrations",
    route: (slug) => `/integrations/${slug}`,
  },
  "solutions.json": {
    collectionKey: "solutions",
    hub: "/solutions",
    route: (slug) => `/solutions/${slug}`,
  },
  "switch.json": {
    collectionKey: "guides",
    hub: "/switch",
    route: (slug) => `/switch/${slug}`,
  },
  "glossary-terms.json": {
    collectionKey: "terms",
    hub: "/glossary",
    route: (slug) => `/glossary/${slug}`,
  },
  "personas.json": {
    collectionKey: "personas",
    hub: "/for",
    route: (slug) => `/for/${slug}`,
  },
};

const BLOG_CATEGORIES = [
  "cam-errors",
  "compliance",
  "cre-finops",
  "how-to",
  "operations",
  "market-trends",
  "technology",
];

const RESOURCE_MEGAMENU_HUBS = {
  "cam-guides": "/resources/cam-guides",
  "tools-calculators": "/resources/tools-calculators",
  "compliance-leases": "/resources/compliance-leases",
  solutions: "/resources/solutions",
  "blog-research": "/resources/blog-research",
};

const UTILITY_OR_NON_INDEXABLE = new Set([
  "/checkout",
  "/checkout/success",
  "/docs",
  "/help",
  "/product",
  "/sources",
  "/unsubscribe",
]);

const LEGAL_OR_SUPPORT_ROUTES = new Set([
  "/about",
  "/about/angel-campa",
  "/contact",
  "/docs",
  "/help",
  "/sources",
]);

const SITEWIDE_FILES = new Set([
  "src/components/MarketingNav.tsx",
  "src/components/MarketingFooter.tsx",
]);

const RESOURCE_FAMILY_DIRECTORY_FILES = new Set([
  "src/app/resources/page.tsx",
  "src/lib/seo/resources-megamenu.ts",
]);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8"));
  } catch {
    return null;
  }
}

function readText(file) {
  return readFileSync(file, "utf8");
}

function routeFromAppPage(file) {
  const rel = relative(APP_DIR, file).replaceAll(sep, "/");
  if (!rel.endsWith("/page.tsx") && rel !== "page.tsx") return null;
  const route = rel.replace(/\/?page\.tsx$/, "");
  if (!route) return "/";
  if (
    route
      .split("/")
      .some((part) => part.startsWith("[") || part.startsWith("("))
  ) {
    return null;
  }
  return `/${route}`;
}

function walkDir(dir, callback, extensions) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "generated"].includes(entry)) {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkDir(full, callback, extensions);
      continue;
    }
    if (extensions.includes(extname(entry))) callback(full);
  }
}

function normalizeRoute(route) {
  if (route.length > 1 && route.endsWith("/")) return route.slice(0, -1);
  return route;
}

function stripAnchorAndQuery(href) {
  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const cutAt = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  return normalizeRoute(cutAt === undefined ? href : href.slice(0, cutAt));
}

function isInternalHref(href) {
  if (/\.(svg|png|jpg|jpeg|gif|webp|ico|txt|xml|pdf)$/i.test(href)) {
    return false;
  }
  return (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.startsWith("/api/") &&
    !href.includes("${")
  );
}

function normalizeSource(file) {
  return relative(ROOT, file).replaceAll(sep, "/");
}

function getMdxSlugs(collection) {
  const dir = join(CONTENT_DIR, collection);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => basename(file, ".mdx"));
}

function getStaticChildRoutes(parentRoute) {
  const parentDir = join(APP_DIR, ...parentRoute.split("/").filter(Boolean));
  if (!existsSync(parentDir)) return [];

  return readdirSync(parentDir)
    .filter((entry) => {
      if (
        entry.startsWith("[") ||
        entry.startsWith("(") ||
        entry.startsWith("__")
      ) {
        return false;
      }
      const full = join(parentDir, entry);
      return statSync(full).isDirectory() && existsSync(join(full, "page.tsx"));
    })
    .map((entry) => `${parentRoute}/${entry}`);
}

function getProductFeatureKeys() {
  const sourceFile = join(SRC_DIR, "generated", "public-knowledge.ts");
  if (!existsSync(sourceFile)) return [];

  const source = readText(sourceFile);
  const productFeaturesBlock = source.match(
    /productFeatures:\s*\[([\s\S]*?)\],\s*seoFeatureList:/,
  )?.[1];
  if (!productFeaturesBlock) return [];

  return [...productFeaturesBlock.matchAll(/key:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

function getJsonItems(file, collectionKey) {
  const data = readJson(file);
  const items = data?.[collectionKey];
  return Array.isArray(items) ? items : [];
}

function addJsonRoutes(routeSet, patterns) {
  for (const [file, pattern] of Object.entries(patterns)) {
    for (const item of getJsonItems(file, pattern.collectionKey)) {
      if (item?.slug) routeSet.add(pattern.route(item.slug));
    }
  }
}

export function buildValidRouteSet() {
  const validRoutes = new Set();

  walkDir(
    APP_DIR,
    (file) => {
      const route = routeFromAppPage(file);
      if (route) validRoutes.add(route);
    },
    [".tsx"],
  );

  getMdxSlugs("blog").forEach((slug) => validRoutes.add(`/blog/${slug}`));
  getMdxSlugs("resources").forEach((slug) =>
    validRoutes.add(`/resources/${slug}`),
  );
  BLOG_CATEGORIES.forEach((category) =>
    validRoutes.add(`/blog/category/${category}`),
  );

  addJsonRoutes(validRoutes, RESOURCE_FAMILY_PATTERNS);
  addJsonRoutes(validRoutes, OTHER_JSON_PATTERNS);
  getProductFeatureKeys().forEach((key) =>
    validRoutes.add(`/product/features/${key}`),
  );

  return validRoutes;
}

function recordLink(map, href, source, generated = false) {
  const normalized = stripAnchorAndQuery(href);
  if (!isInternalHref(normalized)) return;
  if (!map.has(normalized)) {
    map.set(normalized, { sources: new Set(), generatedSources: new Set() });
  }
  const entry = map.get(normalized);
  if (generated) entry.generatedSources.add(source);
  else entry.sources.add(source);
}

function extractLinksFromText(text, sourceFile, linkSources) {
  const patterns = [
    /href=["'](\/[^"'\s>]+)["']/g,
    /href=\{`(\/[^`${}]*)`\}/g,
    /href:\s*["'](\/[^"'\s>]+)["']/g,
    /url:\s*["'](\/[^"'\s>]+)["']/g,
    /\[[^\]]*]\((\/[^)#\s]*)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      recordLink(linkSources, match[1], sourceFile);
    }
  }
}

function extractLinksFromJsonValue(value, sourceFile, linkSources) {
  if (typeof value === "string") {
    recordLink(linkSources, value, sourceFile);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) =>
      extractLinksFromJsonValue(item, sourceFile, linkSources),
    );
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      extractLinksFromJsonValue(item, sourceFile, linkSources);
    }
  }
}

function collectDiscoveredLinks() {
  const linkSources = new Map();

  walkDir(
    SRC_DIR,
    (file) => {
      extractLinksFromText(readText(file), normalizeSource(file), linkSources);
    },
    [".ts", ".tsx"],
  );

  walkDir(
    CONTENT_DIR,
    (file) => {
      extractLinksFromText(readText(file), normalizeSource(file), linkSources);
    },
    [".mdx"],
  );

  for (const [file, pattern] of Object.entries(RESOURCE_FAMILY_PATTERNS)) {
    for (const item of getJsonItems(file, pattern.collectionKey)) {
      extractLinksFromJsonValue(item, `data/${file}`, linkSources);
    }
  }

  return linkSources;
}

function addGeneratedHubLinks(linkSources) {
  const demotedNoindexRoutes = getDemotedNoindexRoutes();

  getMdxSlugs("blog").forEach((slug) =>
    demotedNoindexRoutes.has(`/blog/${slug}`)
      ? undefined
      : recordLink(linkSources, `/blog/${slug}`, "generated:/blog", true),
  );
  getMdxSlugs("resources").forEach((slug) =>
    demotedNoindexRoutes.has(`/resources/${slug}`)
      ? undefined
      : recordLink(
          linkSources,
          `/resources/${slug}`,
          "generated:/resources",
          true,
        ),
  );

  for (const category of BLOG_CATEGORIES) {
    recordLink(
      linkSources,
      `/blog/category/${category}`,
      "generated:/blog",
      true,
    );
  }

  for (const [file, pattern] of Object.entries(RESOURCE_FAMILY_PATTERNS)) {
    recordLink(linkSources, pattern.hub, "generated:/resources", true);
    for (const item of getJsonItems(file, pattern.collectionKey)) {
      if (item?.slug)
        recordLink(
          linkSources,
          pattern.route(item.slug),
          `generated:${pattern.hub}`,
          true,
        );
    }
  }

  for (const [file, pattern] of Object.entries(OTHER_JSON_PATTERNS)) {
    recordLink(linkSources, pattern.hub, "generated:site-hub", true);
    for (const item of getJsonItems(file, pattern.collectionKey)) {
      if (item?.slug)
        recordLink(
          linkSources,
          pattern.route(item.slug),
          `generated:${pattern.hub}`,
          true,
        );
    }
  }

  getStaticChildRoutes("/tools").forEach((route) =>
    recordLink(linkSources, route, "generated:/tools", true),
  );
  getProductFeatureKeys().forEach((key) =>
    recordLink(
      linkSources,
      `/product/features/${key}`,
      "generated:/product/features",
      true,
    ),
  );
}

function resourceMegamenuHubForRoute(route) {
  if (Object.values(RESOURCE_MEGAMENU_HUBS).includes(route)) return null;
  if (LEGAL_OR_SUPPORT_ROUTES.has(route)) return null;
  if (route.startsWith("/blog") || route.startsWith("/glossary")) {
    return RESOURCE_MEGAMENU_HUBS["blog-research"];
  }
  if (route.startsWith("/tools")) {
    return RESOURCE_MEGAMENU_HUBS["tools-calculators"];
  }
  if (
    route.startsWith("/solutions") ||
    route.startsWith("/integrations") ||
    route.startsWith("/alternatives") ||
    route.startsWith("/switch") ||
    route.startsWith("/vs") ||
    route.startsWith("/resources/software") ||
    route.startsWith("/resources/roles") ||
    [
      "/product-tour",
      "/pricing",
      "/roi",
      "/case-studies",
      "/sample-report",
      "/best/cam-reconciliation-software",
      "/lease-abstraction",
      "/product/features",
      "/cam-reconciliation-software",
      "/cam-audit-software",
      "/commercial-lease-audit-software",
      "/yardi-cam-reconciliation",
      "/mri-cam-reconciliation",
    ].includes(route)
  ) {
    return RESOURCE_MEGAMENU_HUBS.solutions;
  }
  if (
    route.startsWith("/resources/states") ||
    route.startsWith("/resources/markets") ||
    route.startsWith("/resources/property-types") ||
    route.startsWith("/resources/boma") ||
    route.startsWith("/resources/lease-clauses") ||
    route.startsWith("/resources/lease-types") ||
    route.startsWith("/resources/expenses") ||
    route.startsWith("/resources/calendar") ||
    [
      "/resources/commercial-tenant-cam-disclosure-by-state",
      "/resources/california-sb-1103-cam-guide",
    ].includes(route)
  ) {
    return RESOURCE_MEGAMENU_HUBS["compliance-leases"];
  }
  if (route === "/" || route === "/resources") {
    return RESOURCE_MEGAMENU_HUBS["blog-research"];
  }
  return RESOURCE_MEGAMENU_HUBS["cam-guides"];
}

function addGeneratedMegamenuHubLinks(linkSources, indexableRoutes) {
  for (const hub of Object.values(RESOURCE_MEGAMENU_HUBS)) {
    recordLink(linkSources, hub, "generated:/resources", true);
  }

  for (const route of indexableRoutes) {
    const hub = resourceMegamenuHubForRoute(route);
    if (hub) recordLink(linkSources, route, `generated:${hub}`, true);
  }
}

function getDemotedNoindexRoutes() {
  const governance = readJson("seo/content-governance.json");
  const routes = new Set();

  for (const slug of governance?.demotedBlogSlugs ?? []) {
    routes.add(`/blog/${slug}`);
  }

  for (const slug of governance?.demotedResourceSlugs ?? []) {
    routes.add(`/resources/${slug}`);
  }

  return routes;
}

function getRetainedRouteAllowlist() {
  const governance = readJson("seo/content-governance.json");
  return {
    comparisons: new Set(governance?.retainedComparisonSlugs ?? []),
    glossaryTerms: new Set(governance?.retainedGlossaryTermSlugs ?? []),
    software: new Set(governance?.retainedSoftwareGuideSlugs ?? []),
  };
}

export function buildIndexableRouteSet(validRoutes) {
  const demotedNoindexRoutes = getDemotedNoindexRoutes();
  const retained = getRetainedRouteAllowlist();

  return new Set(
    [...validRoutes].filter((route) => {
      if (UTILITY_OR_NON_INDEXABLE.has(route)) return false;
      if (demotedNoindexRoutes.has(route)) return false;
      if (route.startsWith("/blog/category/")) return false;
      if (route.startsWith("/vs/")) {
        return retained.comparisons.has(route.replace("/vs/", ""));
      }
      if (route.startsWith("/glossary/")) {
        return retained.glossaryTerms.has(route.replace("/glossary/", ""));
      }
      if (
        route.startsWith("/resources/software/") &&
        route.endsWith("/cam-setup")
      ) {
        const slug = route
          .replace("/resources/software/", "")
          .replace("/cam-setup", "");
        return retained.software.has(slug);
      }
      if (route.startsWith("/tools/") && route.endsWith("/thank-you"))
        return false;
      return true;
    }),
  );
}

function isSitewideOnly(entry) {
  const concreteSources = [...entry.sources];
  return (
    concreteSources.length > 0 &&
    concreteSources.every((source) => SITEWIDE_FILES.has(source)) &&
    entry.generatedSources.size === 0
  );
}

export function auditInternalLinks() {
  const validRoutes = buildValidRouteSet();
  const indexableRoutes = buildIndexableRouteSet(validRoutes);
  const linkSources = collectDiscoveredLinks();
  addGeneratedHubLinks(linkSources);
  addGeneratedMegamenuHubLinks(linkSources, indexableRoutes);

  const broken = [];
  const orphans = [];
  const inboundCounts = new Map();
  const contextualInboundCounts = new Map();

  for (const route of validRoutes) {
    inboundCounts.set(route, 0);
    contextualInboundCounts.set(route, 0);
  }

  for (const [href, entry] of linkSources.entries()) {
    if (!validRoutes.has(href)) {
      broken.push({
        href,
        sources: [...entry.sources, ...entry.generatedSources].sort(),
      });
      continue;
    }

    const allSourceCount = entry.sources.size + entry.generatedSources.size;
    inboundCounts.set(href, (inboundCounts.get(href) ?? 0) + allSourceCount);
    if (!isSitewideOnly(entry)) {
      contextualInboundCounts.set(
        href,
        (contextualInboundCounts.get(href) ?? 0) + allSourceCount,
      );
    }
  }

  for (const route of indexableRoutes) {
    if ((inboundCounts.get(route) ?? 0) === 0) {
      orphans.push(route);
    }
  }

  const linkedResourceHubs = new Map();
  for (const [href, entry] of linkSources.entries()) {
    for (const pattern of Object.values(RESOURCE_FAMILY_PATTERNS)) {
      if (href !== pattern.hub) continue;

      const directorySources = [...entry.sources].filter((source) =>
        RESOURCE_FAMILY_DIRECTORY_FILES.has(source),
      );

      if (directorySources.length > 0) {
        linkedResourceHubs.set(pattern.hub, directorySources.sort());
      }
    }
  }

  const missingResourceFamilies = [
    ...new Set(
      Object.values(RESOURCE_FAMILY_PATTERNS).map((pattern) => pattern.hub),
    ),
  ].filter((hub) => !linkedResourceHubs.has(hub));

  return {
    validRoutes,
    indexableRoutes,
    linkSources,
    broken: broken.sort((a, b) => a.href.localeCompare(b.href)),
    orphans: orphans.sort(),
    inboundCounts,
    contextualInboundCounts,
    linkedResourceHubs,
    missingResourceFamilies: missingResourceFamilies.sort(),
    resourceMegamenuHubs: RESOURCE_MEGAMENU_HUBS,
    resourceMegamenuHubForRoute,
    legalOrSupportRoutes: LEGAL_OR_SUPPORT_ROUTES,
  };
}
