#!/usr/bin/env node
/**
 * Compares the Product Decisions activation funnel in PostHog with the
 * database records that should have emitted each backend-owned lifecycle event.
 *
 * Usage:
 *   DATABASE_URL=postgres://... POSTHOG_PERSONAL_API_KEY=phx_... \
 *     node scripts/verify-activation-funnel-ground-truth.mjs
 *
 * Useful flags:
 *   --dry-run          Print the database and HogQL queries without calling services.
 *   --days=90         Lookback window, in days. Default: 90.
 *   --host=...        PostHog API host. Default: https://us.posthog.com.
 *   --project=...     PostHog project id. Default: REDACTED_PH_PROJECT.
 *   --tolerance=0     Allowed per-step count delta before failing. Default: 0.
 */

import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = "https://us.posthog.com";
const DEFAULT_PROJECT_ID = "REDACTED_PH_PROJECT";
const DEFAULT_INSIGHT_ID = "REDACTED_PH_INSIGHT";
const DEFAULT_DAYS = 90;
const DEFAULT_TOLERANCE = 0;

loadLocalEnv();

const DRY_RUN = process.argv.includes("--dry-run");
const DAYS = parsePositiveInteger(argFlag("days"), DEFAULT_DAYS, "days");
const TOLERANCE = parseNonNegativeInteger(
  argFlag("tolerance"),
  DEFAULT_TOLERANCE,
  "tolerance",
);
const HOST = resolvePostHogApiHost(argFlag("host"), process.env);
const PROJECT_ID =
  argFlag("project") || process.env.POSTHOG_PROJECT_ID || DEFAULT_PROJECT_ID;
const INSIGHT_ID =
  argFlag("insight") || process.env.POSTHOG_INSIGHT_ID || DEFAULT_INSIGHT_ID;
const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

const STEPS = [
  {
    event: "signup_completed",
    label: "Signup",
    dbSource: "owner_signup legal_acceptances.accepted_at",
  },
  {
    event: "gl_import_completed",
    label: "GL import",
    dbSource: "import_batches.status = completed with rows",
  },
  {
    event: "reconciliation_calculation_completed",
    label: "First result",
    dbSource: "reconciliation_snapshots.created_at",
  },
  {
    event: "reconciliation_finalized",
    label: "Finalized",
    dbSource: "finalized reconciliation_snapshots",
  },
  {
    event: "trial_started",
    label: "Trial started",
    dbSource: "sent trial_started subscription_email_events",
  },
  {
    event: "invoice_paid",
    label: "Paid",
    dbSource: "paid invoices with amount_paid > 0",
  },
];

const EVENT_LIST = STEPS.map((step) => `'${step.event}'`).join(", ");

const DATABASE_SQL = `
with bounds as (
  select now() - ($1::int * interval '1 day') as since
),
step_orgs as (
  select 'signup_completed' as event, organization_id::text
  from legal_acceptances, bounds
  where source = 'owner_signup'
    and accepted_at >= bounds.since

  union all
  select 'gl_import_completed' as event, organization_id::text
  from import_batches, bounds
  where status = 'completed'
    and row_count > 0
    and created_at >= bounds.since

  union all
  select 'reconciliation_calculation_completed' as event, properties.organization_id::text
  from reconciliation_snapshots
  join properties on properties.id = reconciliation_snapshots.property_id
  cross join bounds
  where reconciliation_snapshots.created_at >= bounds.since

  union all
  select 'reconciliation_finalized' as event, properties.organization_id::text
  from reconciliation_snapshots
  join properties on properties.id = reconciliation_snapshots.property_id
  cross join bounds
  where reconciliation_snapshots.status = 'finalized'
    and reconciliation_snapshots.finalized_at is not null
    and reconciliation_snapshots.finalized_at >= bounds.since

  union all
  select 'trial_started' as event, organization_id::text
  from subscription_email_events, bounds
  where email_type = 'trial_started'
    and status = 'sent'
    and sent_at is not null
    and sent_at >= bounds.since

  union all
  select 'invoice_paid' as event, organization_id::text
  from invoices, bounds
  where status = 'paid'
    and amount_paid > 0
    and paid_at is not null
    and paid_at >= bounds.since
)
select event, array_agg(distinct organization_id order by organization_id) as organization_ids
from step_orgs
group by event
order by event;
`.trim();

const HOGQL = `
select
  event,
  groupUniqArray(toString(properties['organization_id'])) as organization_ids
from events
where event in (${EVENT_LIST})
  and timestamp >= now() - interval ${DAYS} day
  and properties['source_app'] = 'backend'
  and notEmpty(toString(properties['organization_id']))
group by event
order by event
`.trim();

function argFlag(name) {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

function loadLocalEnv() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  for (const filePath of [
    resolve(scriptDir, "../.dev.vars"),
    resolve(scriptDir, "../.env"),
  ]) {
    if (!existsSync(filePath)) {
      continue;
    }
    const body = readFileSync(filePath, "utf8");
    for (const rawLine of body.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) {
        continue;
      }
      const [rawKey, ...rawValue] = line.split("=");
      const key = rawKey.trim();
      if (process.env[key] !== undefined) {
        continue;
      }
      process.env[key] = rawValue
        .join("=")
        .trim()
        .replace(/^["']|["']$/gu, "");
    }
  }
}

export function resolvePostHogApiHost(argHost, env = process.env) {
  return (
    argHost ||
    env.POSTHOG_API_HOST ||
    env.POSTHOG_APP_HOST ||
    DEFAULT_HOST
  ).replace(/\/+$/u, "");
}

function parsePositiveInteger(value, fallback, label) {
  if (value === null) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, fallback, label) {
  if (value === null) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${label} must be a non-negative integer`);
  }
  return parsed;
}

async function loadDatabaseCounts() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required unless --dry-run is set");
  }

  const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
  try {
    const rows = await sql.unsafe(DATABASE_SQL, [DAYS]);
    return normalizeRows(rows);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function loadPostHogCounts() {
  if (!POSTHOG_API_KEY) {
    throw new Error(
      "POSTHOG_PERSONAL_API_KEY is required unless --dry-run is set",
    );
  }

  const response = await fetch(`${HOST}/api/projects/${PROJECT_ID}/query/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${POSTHOG_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query: HOGQL,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PostHog query failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  return normalizePostHogResults(payload);
}

async function loadPostHogInsight() {
  if (!POSTHOG_API_KEY) {
    throw new Error(
      "POSTHOG_PERSONAL_API_KEY is required unless --dry-run is set",
    );
  }

  const response = await fetch(
    `${HOST}/api/projects/${PROJECT_ID}/insights/${INSIGHT_ID}/`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${POSTHOG_API_KEY}`,
        "content-type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `PostHog insight ${INSIGHT_ID} lookup failed (${response.status}): ${body}`,
    );
  }

  return response.json();
}

export function validateInsightDefinition(insight) {
  const source = insight?.query?.source;
  const series = Array.isArray(source?.series) ? source.series : [];
  const actualEvents = series.map((item) => item.event);
  const expectedEvents = STEPS.map((step) => step.event);
  const mismatches = [];

  if (source?.kind !== "FunnelsQuery") {
    mismatches.push(`expected FunnelsQuery, found ${String(source?.kind)}`);
  }
  if (source?.aggregation_group_type_index !== 0) {
    mismatches.push("expected organization aggregation_group_type_index 0");
  }
  if (JSON.stringify(actualEvents) !== JSON.stringify(expectedEvents)) {
    mismatches.push(
      `expected events ${expectedEvents.join(" -> ")}, found ${actualEvents.join(
        " -> ",
      )}`,
    );
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
    actualEvents,
  };
}

export function normalizePostHogResults(payload) {
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  const eventIndex = columns.indexOf("event");
  const organizationsIndex = columns.indexOf("organization_ids");

  if (eventIndex === -1 || organizationsIndex === -1) {
    throw new Error(
      `Unexpected PostHog response columns: ${JSON.stringify(columns)}`,
    );
  }

  const rows = Array.isArray(payload.results) ? payload.results : [];
  return normalizeRows(
    rows.map((row) => ({
      event: row[eventIndex],
      organization_ids: row[organizationsIndex],
    })),
  );
}

export function normalizeRows(rows) {
  const byEvent = new Map();
  for (const row of rows) {
    const event = String(row.event);
    const ids = Array.isArray(row.organization_ids) ? row.organization_ids : [];
    byEvent.set(
      event,
      new Set(ids.map((id) => String(id).trim()).filter(Boolean)),
    );
  }
  for (const step of STEPS) {
    if (!byEvent.has(step.event)) {
      byEvent.set(step.event, new Set());
    }
  }
  return byEvent;
}

export function compareCounts(databaseCounts, posthogCounts) {
  const comparisons = [];
  for (const step of STEPS) {
    const databaseIds = databaseCounts.get(step.event) ?? new Set();
    const posthogIds = posthogCounts.get(step.event) ?? new Set();
    const missingInPostHog = difference(databaseIds, posthogIds);
    const extraInPostHog = difference(posthogIds, databaseIds);
    const delta = posthogIds.size - databaseIds.size;

    comparisons.push({
      ...step,
      databaseCount: databaseIds.size,
      posthogCount: posthogIds.size,
      delta,
      missingInPostHog,
      extraInPostHog,
      passed:
        Math.abs(delta) <= TOLERANCE &&
        missingInPostHog.length <= TOLERANCE &&
        extraInPostHog.length <= TOLERANCE,
    });
  }
  return comparisons;
}

function difference(left, right) {
  return [...left].filter((id) => !right.has(id)).sort();
}

function printDryRun() {
  console.log(`Activation funnel ground-truth verification dry run`);
  console.log(`Lookback: ${DAYS} days`);
  console.log(`PostHog project: ${PROJECT_ID}`);
  console.log(`PostHog insight: ${INSIGHT_ID}`);
  console.log("\nDatabase SQL:");
  console.log(DATABASE_SQL);
  console.log("\nHogQL:");
  console.log(HOGQL);
}

function printReport(comparisons) {
  console.log(
    `Activation funnel ground-truth verification (${DAYS}d, tolerance ${TOLERANCE})`,
  );
  console.log("");
  console.log(
    "| Step | Event | DB orgs | PostHog orgs | Delta | Source | Status |",
  );
  console.log("| --- | --- | ---: | ---: | ---: | --- | --- |");
  for (const row of comparisons) {
    console.log(
      `| ${row.label} | ${row.event} | ${row.databaseCount} | ${row.posthogCount} | ${row.delta} | ${row.dbSource} | ${
        row.passed ? "pass" : "fail"
      } |`,
    );
  }

  const failures = comparisons.filter((row) => !row.passed);
  if (failures.length === 0) {
    console.log("\nAll activation funnel counts match database ground truth.");
    return;
  }

  console.log("\nMismatches:");
  for (const row of failures) {
    console.log(`- ${row.event}`);
    if (row.missingInPostHog.length > 0) {
      console.log(
        `  missing in PostHog: ${row.missingInPostHog.slice(0, 20).join(", ")}`,
      );
    }
    if (row.extraInPostHog.length > 0) {
      console.log(
        `  extra in PostHog: ${row.extraInPostHog.slice(0, 20).join(", ")}`,
      );
    }
  }
}

function printInsightReport(insightCheck) {
  console.log("");
  console.log(
    `PostHog insight ${INSIGHT_ID}: ${insightCheck.passed ? "pass" : "fail"}`,
  );
  if (!insightCheck.passed) {
    for (const mismatch of insightCheck.mismatches) {
      console.log(`- ${mismatch}`);
    }
  }
}

async function main() {
  if (DRY_RUN) {
    printDryRun();
    return;
  }

  const databaseCounts = await loadDatabaseCounts();
  const posthogCounts = await loadPostHogCounts();
  const insight = await loadPostHogInsight();
  const comparisons = compareCounts(databaseCounts, posthogCounts);
  const insightCheck = validateInsightDefinition(insight);
  printReport(comparisons);
  printInsightReport(insightCheck);

  if (comparisons.some((row) => !row.passed) || !insightCheck.passed) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`FAILED: ${error.message}`);
    process.exit(1);
  });
}
