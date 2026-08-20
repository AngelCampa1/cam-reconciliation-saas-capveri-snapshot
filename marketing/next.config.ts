import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import fs from "fs";
import path from "path";
import {
  RETAINED_COMPARISON_SLUGS,
  RETAINED_GLOSSARY_TERM_SLUGS,
  RETAINED_SOFTWARE_GUIDE_SLUGS,
} from "./src/lib/seo/content-governance";

const BLOG_REDIRECTS = [
  "cam-reconciliation-errors",
  "cam-overbilling-liability",
  "cam-reconciliation-too-slow",
  "cam-numbers-not-matching-yardi",
  "cam-demand-letter",
  "boma-2024-changes",
  "cam-reconciliation-deadlines",
  "cam-reconciliation-audit-trail",
];

const CANONICAL_CONTENT_REDIRECTS = [
  {
    source: "/blog/what-is-cam-reconciliation",
    destination: "/resources/common-area-maintenance-reconciliation-explained",
  },
  {
    source: "/resources/what-is-cam-reconciliation",
    destination: "/resources/common-area-maintenance-reconciliation-explained",
  },
  {
    source: "/resources/cam-presend-checklist",
    destination: "/resources/cam-pre-send-packet-checklist",
  },
  {
    source: "/resources/state-by-state-cam-disclosure",
    destination: "/resources/commercial-tenant-cam-disclosure-by-state",
  },
  {
    source: "/resources/tenant-auditor-guide",
    destination: "/resources/tenant-cam-audit-landlord-side",
  },
  {
    source: "/tools/cam-leakage-estimator",
    destination: "/tools/cam-billing-error-estimator",
  },
];

function loadSlugs(fileName: string, key: string): string[] {
  const filePath = path.join(process.cwd(), "data", fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, { slug: string }[]>;
  return (parsed[key] ?? []).map((item) => item.slug);
}

function subtractRetainedSlugs(
  allSlugs: string[],
  retainedSlugs: readonly string[],
): string[] {
  const keep = new Set(retainedSlugs);
  return allSlugs.filter((slug) => !keep.has(slug));
}

const RETIRED_SOFTWARE_GUIDE_SLUGS = subtractRetainedSlugs(
  loadSlugs("software.json", "software"),
  RETAINED_SOFTWARE_GUIDE_SLUGS,
);

const RETIRED_COMPARISON_SLUGS = subtractRetainedSlugs(
  loadSlugs("comparisons.json", "comparisons"),
  RETAINED_COMPARISON_SLUGS,
);

const RETIRED_GLOSSARY_TERM_SLUGS = subtractRetainedSlugs(
  loadSlugs("glossary-terms.json", "terms"),
  RETAINED_GLOSSARY_TERM_SLUGS,
);

function getApiOrigin(): string {
  const configuredApiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "https://api.capveri.com";

  try {
    return new URL(configuredApiUrl).origin;
  } catch {
    return "https://api.capveri.com";
  }
}

const API_ORIGIN = getApiOrigin();

// Origin of the worker-hosted AI-SDR widget. The browser loads its client script
// (script-src) from here and the widget calls the worker's /v1 endpoints
// (connect-src), so both directives must allow this origin. Keep the default in
// lockstep with AiSdrSalesWidget.tsx DEFAULT_WORKER_URL.
function getAiSdrWorkerOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_AI_SDR_WORKER_URL ??
    "https://ventora-ai-sdr-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev";

  try {
    return new URL(configured).origin;
  } catch {
    return "https://ventora-ai-sdr-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev";
  }
}

const AI_SDR_WORKER_ORIGIN = getAiSdrWorkerOrigin();

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-eval' required in dev mode for webpack eval-source-map; stripped in production
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} ${AI_SDR_WORKER_ORIGIN} https://www.googletagmanager.com https://www.google-analytics.com https://us.i.posthog.com https://us-assets.i.posthog.com https://static.cloudflareinsights.com https://challenges.cloudflare.com`,
      `connect-src 'self' ${API_ORIGIN} ${AI_SDR_WORKER_ORIGIN} https://api.capveri.com https://www.google-analytics.com https://www.googletagmanager.com https://www.google.com https://us.i.posthog.com https://us-assets.i.posthog.com https://*.ingest.sentry.io https://challenges.cloudflare.com`,
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      // Cloudflare Turnstile renders its challenge inside an iframe; without an
      // explicit frame-src it falls back to default-src 'self' and is blocked.
      // Click-to-load video facade swaps in a youtube-nocookie.com iframe on play.
      "frame-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const MARKETING_CACHE_HEADERS = [
  {
    key: "Cache-Control",
    value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  },
];

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  images: {
    // YouTube video thumbnails for click-to-load video facades.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }],
  },
  async redirects() {
    return [
      ...CANONICAL_CONTENT_REDIRECTS.map((redirect) => ({
        ...redirect,
        permanent: true,
      })),
      ...BLOG_REDIRECTS.map((slug) => ({
        source: `/resources/${slug}`,
        destination: `/blog/${slug}`,
        permanent: true,
      })),
      ...RETIRED_SOFTWARE_GUIDE_SLUGS.map((slug) => ({
        source: `/resources/software/${slug}/cam-setup`,
        destination: "/resources/software",
        permanent: true,
      })),
      ...RETIRED_COMPARISON_SLUGS.map((slug) => ({
        source: `/vs/${slug}`,
        destination: "/vs",
        permanent: true,
      })),
      ...RETIRED_GLOSSARY_TERM_SLUGS.map((slug) => ({
        source: `/glossary/${slug}`,
        destination: "/glossary",
        permanent: true,
      })),
      // Security info lives in the docs page. Some links (incl. the in-product
      // AI helper) point at /security, so send them to that section instead of
      // 404ing. Temporary so a standalone /security page can be added later.
      {
        source: "/security",
        destination: "/docs#security",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path((?!api/|_next/).*)",
        headers: [...SECURITY_HEADERS, ...MARKETING_CACHE_HEADERS],
      },
      { source: "/(.*)", headers: SECURITY_HEADERS },
    ];
  },
};

const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();

export default sentryOrg && sentryProject && sentryAuthToken
  ? withSentryConfig(config, {
      org: sentryOrg,
      project: sentryProject,
      authToken: sentryAuthToken,
      silent: true,
      widenClientFileUpload: true,
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
      webpack: {
        treeshake: {
          removeDebugLogging: true,
        },
      },
    })
  : config;
