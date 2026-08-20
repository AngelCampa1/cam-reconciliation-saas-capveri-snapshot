#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/**
 * posthog-build-dashboards.mjs
 *
 * Idempotently builds CapVeri's two decision dashboards (Marketing + Product)
 * plus the key user-journey insights in PostHog, using the PostHog public API.
 *
 * This is the executable form of Track 2 of the "deepen PostHog" goal. Every
 * event / property name below was verified against the live code taxonomy
 * (frontend/src/lib/analytics.ts, marketing/src/lib/posthog.ts,
 * backend/app/services/analytics/posthog.py) — see docs/goal-posthog-deepening/.
 *
 * Why a personal API key (not the phc_ ingest key): the phc_ project key is
 * write-only (event capture). Creating/reading dashboards + insights requires a
 * Personal API Key scoped to insight:write, dashboard:write, query:read.
 * Create one at https://us.posthog.com/settings/user-api-keys (scope to the one
 * CapVeri project, id REDACTED_PH_PROJECT) and run:
 *
 *   POSTHOG_PERSONAL_API_KEY=phx_... node scripts/posthog-build-dashboards.mjs
 *
 * Flags:
 *   --dry-run   Print what would be created; make no write calls.
 *   --host=...  Override API host (default https://us.posthog.com).
 *   --project=  Override project id (default REDACTED_PH_PROJECT).
 *
 * Idempotency: dashboards and insights are keyed by a stable `tags` marker plus
 * name. A second run updates the existing insight's query in place instead of
 * creating duplicates. Safe to re-run after editing a query here.
 */

export function resolvePostHogApiHost(argHost, env = process.env) {
  return (
    argHost ||
    env.POSTHOG_API_HOST ||
    env.POSTHOG_APP_HOST ||
    "https://us.posthog.com"
  ).replace(/\/+$/u, "");
}

const HOST = resolvePostHogApiHost(argFlag("host"), process.env);
const PROJECT_ID =
  argFlag("project") || process.env.POSTHOG_PROJECT_ID || "REDACTED_PH_PROJECT";
const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY || "";
const DRY_RUN = process.argv.includes("--dry-run");
const TAG = "goal-posthog-deepening"; // marker used to find/own everything this script manages

const LOOKBACK = "-90d";

function argFlag(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

// ---------------------------------------------------------------------------
// Query-node builders (PostHog InsightVizNode / HogQL query schema)
// ---------------------------------------------------------------------------

const eventsNode = (event, extra = {}) => ({
  kind: "EventsNode",
  event,
  ...extra,
});

const eventPropertyEquals = (key, value) => ({
  key,
  value,
  operator: "exact",
  type: "event",
});

const onboardingStepTransitionNode = (step, label) =>
  eventsNode("onboard_step_transitioned", {
    custom_name: `${step}. ${label}`,
    properties: [
      eventPropertyEquals("flow_id", "plg_onboarding"),
      eventPropertyEquals("flow_mode", "plg"),
      eventPropertyEquals("step", step),
    ],
  });

const personBreakdown = (property) => ({
  breakdown: property,
  breakdown_type: "person",
});

function trends({
  series,
  breakdown,
  interval = "week",
  display = "ActionsLineGraph",
}) {
  const source = {
    kind: "TrendsQuery",
    series,
    interval,
    dateRange: { date_from: LOOKBACK },
    trendsFilter: { display },
  };
  if (breakdown) source.breakdownFilter = personBreakdown(breakdown);
  return { kind: "InsightVizNode", source };
}

function funnel({
  series,
  breakdown,
  windowDays = 14,
  vizType = "steps",
  aggregationGroupTypeIndex = null,
}) {
  const source = {
    kind: "FunnelsQuery",
    series,
    dateRange: { date_from: LOOKBACK },
    funnelsFilter: {
      funnelVizType: vizType,
      funnelWindowInterval: windowDays,
      funnelWindowIntervalUnit: "day",
    },
  };
  if (aggregationGroupTypeIndex !== null)
    source.aggregation_group_type_index = aggregationGroupTypeIndex;
  if (breakdown) source.breakdownFilter = personBreakdown(breakdown);
  return { kind: "InsightVizNode", source };
}

function retention({
  targetEvent,
  returningEvent = targetEvent,
  period = "Week",
}) {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "RetentionQuery",
      retentionFilter: {
        targetEntity: { id: targetEvent, name: targetEvent, type: "events" },
        returningEntity: {
          id: returningEvent,
          name: returningEvent,
          type: "events",
        },
        period,
        retentionType: "retention_first_time",
        totalIntervals: 11,
      },
    },
  };
}

function paths({ startPoint, endPoint }) {
  const pathsFilter = { includeEventTypes: ["custom_event"], stepLimit: 6 };
  if (startPoint) pathsFilter.startPoint = startPoint;
  if (endPoint) pathsFilter.endPoint = endPoint;
  return {
    kind: "InsightVizNode",
    source: {
      kind: "PathsQuery",
      pathsFilter,
      dateRange: { date_from: LOOKBACK },
    },
  };
}

// ---------------------------------------------------------------------------
// Dashboard + insight definitions (grounded in verified event names)
// ---------------------------------------------------------------------------

/** @type {{name:string, description:string, insights:Array<{name:string,description:string,query:object}>}[]} */
export const DASHBOARDS = [
  {
    name: "CapVeri — Marketing Decisions",
    description:
      "Channel/UTM → lead → signup → paid, with first-touch revenue attribution. " +
      "Answers: which campaign/channel/tool produces paying customers. Built by " +
      "scripts/posthog-build-dashboards.mjs.",
    insights: [
      {
        name: "Acquisition funnel: lead → signup → trial → paid (by first-touch source)",
        description:
          "The core marketing funnel. Paid step uses invoice_paid (backend Stripe " +
          "webhook — the truest paid signal). Broken down by first-touch UTM source.",
        query: funnel({
          series: [
            eventsNode("generate_lead", { custom_name: "Lead" }),
            eventsNode("signup_completed", { custom_name: "Signup" }),
            eventsNode("trial_started", { custom_name: "Trial" }),
            eventsNode("invoice_paid", { custom_name: "Paid" }),
          ],
          breakdown: "first_touch_utm_source",
          windowDays: 30,
        }),
      },
      {
        name: "Paying customers by first-touch campaign",
        description:
          "First-touch revenue attribution: unique persons who hit invoice_paid, " +
          "grouped by the campaign that first acquired them. Possible because signup aliases " +
          "lead→user, so a paid user carries its pre-signup first_touch_* props.",
        query: trends({
          series: [eventsNode("invoice_paid", { math: "dau" })], // dau = unique persons
          breakdown: "first_touch_utm_campaign",
          display: "ActionsBarValue",
        }),
      },
      {
        name: "Tool result -> lead conversion (by tool)",
        description:
          "Which free tools produce leads after a visible result: tool_result_viewed -> " +
          "lead_form_view -> lead_form_submit, broken down by tool slug.",
        query: funnel({
          series: [
            eventsNode("tool_result_viewed", { custom_name: "Result viewed" }),
            eventsNode("lead_form_view", { custom_name: "Form viewed" }),
            eventsNode("lead_form_submit", { custom_name: "Lead submitted" }),
          ],
          breakdown: "slug",
          windowDays: 7,
        }),
      },
      {
        name: "Lead volume over time (by channel/medium)",
        description:
          "Weekly generate_lead counts split by first-touch UTM medium.",
        query: trends({
          series: [eventsNode("generate_lead", { math: "total" })],
          breakdown: "first_touch_utm_medium",
        }),
      },
      {
        name: "Landing page → lead rate (by first-touch landing page)",
        description:
          "Pageview → lead funnel, broken down by the landing page the person first arrived on. " +
          "Surfaces which entry pages convert to leads.",
        query: funnel({
          series: [
            eventsNode("$pageview", { custom_name: "Page view" }),
            eventsNode("generate_lead", { custom_name: "Lead" }),
          ],
          breakdown: "first_touch_landing_page",
          windowDays: 7,
        }),
      },
    ],
  },
  {
    name: "CapVeri — Product Decisions",
    description:
      "Activation, paywall conversion, expansion, feature health, and retention — the levers " +
      "for product decisions. Built by scripts/posthog-build-dashboards.mjs.",
    insights: [
      {
        name: "Activation funnel: signup → property → GL import → reconciliation → finalized → demand letter",
        description:
          "The full product activation path. Each step is a real fired event; the drop-off " +
          "between steps shows where new accounts stall.",
        query: funnel({
          series: [
            eventsNode("signup_completed", { custom_name: "Signup" }),
            eventsNode("property_created", { custom_name: "Property created" }),
            eventsNode("gl_import_completed", { custom_name: "GL imported" }),
            eventsNode("reconciliation_calculation_completed", {
              custom_name: "Reconciled",
            }),
            eventsNode("reconciliation_finalized", {
              custom_name: "Finalized",
            }),
            eventsNode("demand_letter_generated", {
              custom_name: "Demand letter",
            }),
          ],
          windowDays: 30,
        }),
      },
      {
        name: "Activation funnel: signup -> GL import -> first result -> finalized -> trial -> paid",
        description:
          "The product-plan activation funnel. GL import, first result, finalize, trial, " +
          "and paid use backend-owned lifecycle events where available, so drop-off can " +
          "be compared against database truth.",
        query: funnel({
          series: [
            eventsNode("signup_completed", { custom_name: "Signup" }),
            eventsNode("gl_import_completed", { custom_name: "GL imported" }),
            eventsNode("reconciliation_calculation_completed", {
              custom_name: "First result",
            }),
            eventsNode("reconciliation_finalized", {
              custom_name: "Finalized",
            }),
            eventsNode("trial_started", { custom_name: "Trial started" }),
            eventsNode("invoice_paid", { custom_name: "Paid" }),
          ],
          windowDays: 30,
          aggregationGroupTypeIndex: 0,
        }),
      },
      {
        name: "Onboarding step drop-off: PLG real-data flow",
        description:
          "Step-level drop-off inside the PLG numbered onboarding flow, using " +
          "onboard_step_transitioned with explicit step filters so the tile reflects the " +
          "current real-data journey rather than independent per-step view events.",
        query: funnel({
          series: [
            onboardingStepTransitionNode(1, "Building"),
            onboardingStepTransitionNode(2, "Tenants"),
            onboardingStepTransitionNode(3, "Costs"),
            onboardingStepTransitionNode(4, "Charges"),
            onboardingStepTransitionNode(5, "Results"),
            onboardingStepTransitionNode(6, "Email"),
            onboardingStepTransitionNode(7, "Password"),
          ],
          windowDays: 7,
        }),
      },
      {
        name: "Paywall conversion (by surface)",
        description:
          "upgrade_modal_shown → upgrade_modal_cta_clicked → checkout_completed, broken down by " +
          "the surface prop (free_audit_modal vs onboarding_results) wired in Track 1.",
        query: funnel({
          series: [
            eventsNode("upgrade_modal_shown", { custom_name: "Paywall shown" }),
            eventsNode("upgrade_modal_cta_clicked", {
              custom_name: "CTA clicked",
            }),
            eventsNode("checkout_completed", { custom_name: "Checkout" }),
          ],
          breakdown: "surface",
          windowDays: 7,
        }),
      },
      {
        name: "Team expansion over time",
        description:
          "Collaboration as an expansion/retention signal: team_invite_sent and " +
          "team_member_role_changed counts over time.",
        query: trends({
          series: [
            eventsNode("team_invite_sent", {
              math: "total",
              custom_name: "Invites sent",
            }),
            eventsNode("team_member_role_changed", {
              math: "total",
              custom_name: "Role changes",
            }),
          ],
        }),
      },
      {
        name: "Feature health: extraction & GL import success vs failure",
        description:
          "Adoption + reliability. Successes vs failures for the two heaviest pipelines, so a " +
          "spike in failures is visible against volume.",
        query: trends({
          series: [
            eventsNode("lease_extraction_process_completed", {
              math: "total",
              custom_name: "Extraction OK",
            }),
            eventsNode("lease_extraction_process_failed", {
              math: "total",
              custom_name: "Extraction failed",
            }),
            eventsNode("gl_import_completed", {
              math: "total",
              custom_name: "GL import OK",
            }),
            eventsNode("gl_import_failed", {
              math: "total",
              custom_name: "GL import failed",
            }),
          ],
        }),
      },
      {
        name: "App frustration signals",
        description:
          "Error-boundary and failed-mutation volume — a rising line here is a UX/health " +
          "regression to investigate.",
        query: trends({
          series: [
            eventsNode("app_error_boundary_shown", {
              math: "total",
              custom_name: "Error boundary",
            }),
            eventsNode("app_mutation_failed", {
              math: "total",
              custom_name: "Mutation failed",
            }),
          ],
        }),
      },
      {
        name: "Weekly stickiness / retention (dashboard_viewed)",
        description:
          "First-time retention keyed off dashboard_viewed: of users active in week 0, how many " +
          "return each subsequent week.",
        query: retention({ targetEvent: "dashboard_viewed" }),
      },
      {
        name: "Login method mix",
        description:
          "login_completed split by method (email vs google) — adoption of SSO.",
        query: trends({
          series: [eventsNode("login_completed", { math: "total" })],
          breakdown: "method",
          display: "ActionsPie",
        }),
      },
    ],
  },
  {
    name: "CapVeri — User Journeys",
    description:
      "Path and funnel views of the key flows: onboarding, auth recovery, and the full " +
      "lead→paid journey. Built by scripts/posthog-build-dashboards.mjs.",
    insights: [
      {
        name: "Onboarding path (from signup)",
        description:
          "Where users actually go after signup_completed — the real onboarding path tree.",
        query: paths({ startPoint: "signup_completed" }),
      },
      {
        name: "Password reset funnel",
        description:
          "password_reset_requested → password_reset_completed completion rate.",
        query: funnel({
          series: [
            eventsNode("password_reset_requested", {
              custom_name: "Requested",
            }),
            eventsNode("password_reset_completed", {
              custom_name: "Completed",
            }),
          ],
          windowDays: 1,
        }),
      },
      {
        name: "Lead → paid journey (paths into invoice_paid)",
        description:
          "The event paths that lead into a paid conversion — ending at invoice_paid.",
        query: paths({ endPoint: "invoice_paid" }),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// PostHog API client
// ---------------------------------------------------------------------------

async function api(path, { method = "GET", body } = {}) {
  const url = `${HOST}/api/projects/${PROJECT_ID}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`,
    );
  }
  return json;
}

async function findByName(resource, name) {
  // Offline dry-run (no key): can't look up; treat everything as not-yet-created.
  if (!API_KEY) return null;
  // PostHog supports ?search= on dashboards and insights; match exact name client-side.
  const data = await api(
    `/${resource}/?search=${encodeURIComponent(name)}&limit=100`,
  );
  const results = (data && data.results) || [];
  return results.find((r) => r.name === name) || null;
}

async function ensureDashboard(def) {
  const existing = await findByName("dashboards", def.name);
  if (existing) {
    console.log(`  dashboard exists: "${def.name}" (id ${existing.id})`);
    return existing;
  }
  if (DRY_RUN) {
    console.log(`  [dry-run] would CREATE dashboard: "${def.name}"`);
    return { id: `dry-${def.name}`, _dry: true };
  }
  const created = await api("/dashboards/", {
    method: "POST",
    body: { name: def.name, description: def.description, tags: [TAG] },
  });
  console.log(`  created dashboard: "${def.name}" (id ${created.id})`);
  return created;
}

async function ensureInsight(dashboardId, insight) {
  const existing = await findByName("insights", insight.name);
  const payload = {
    name: insight.name,
    description: insight.description,
    query: insight.query,
    tags: [TAG],
  };
  if (existing) {
    if (DRY_RUN) {
      console.log(`    [dry-run] would UPDATE insight: "${insight.name}"`);
      return existing;
    }
    // Patch the query/description in place; ensure it is on this dashboard.
    const dashboards = Array.from(
      new Set([...(existing.dashboards || []), dashboardId]),
    ).filter((d) => typeof d === "number");
    const updated = await api(`/insights/${existing.id}/`, {
      method: "PATCH",
      body: { ...payload, dashboards },
    });
    console.log(`    updated insight: "${insight.name}" (id ${updated.id})`);
    return updated;
  }
  if (DRY_RUN) {
    console.log(`    [dry-run] would CREATE insight: "${insight.name}"`);
    return { _dry: true };
  }
  const created = await api("/insights/", {
    method: "POST",
    body: {
      ...payload,
      dashboards: typeof dashboardId === "number" ? [dashboardId] : [],
    },
  });
  console.log(`    created insight: "${insight.name}" (id ${created.id})`);
  return created;
}

async function main() {
  if (!API_KEY && !DRY_RUN) {
    console.error(
      "ERROR: POSTHOG_PERSONAL_API_KEY is required (scope: insight:write, dashboard:write, query:read).\n" +
        "Create one at https://us.posthog.com/settings/user-api-keys then re-run:\n" +
        "  POSTHOG_PERSONAL_API_KEY=phx_... node scripts/posthog-build-dashboards.mjs\n" +
        "Or preview with: node scripts/posthog-build-dashboards.mjs --dry-run",
    );
    process.exit(1);
  }
  console.log(
    `${DRY_RUN ? "[DRY RUN] " : ""}Building CapVeri dashboards on ${HOST} project ${PROJECT_ID}\n`,
  );
  for (const def of DASHBOARDS) {
    console.log(`Dashboard: ${def.name}`);
    const dashboard = await ensureDashboard(def);
    for (const insight of def.insights) {
      await ensureInsight(dashboard.id, insight);
    }
    console.log("");
  }
  console.log(
    DRY_RUN
      ? "Dry run complete — no changes made."
      : "Done. Open https://us.posthog.com/dashboard to view the three dashboards.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error("\nFAILED:", err.message);
    process.exit(1);
  });
}
