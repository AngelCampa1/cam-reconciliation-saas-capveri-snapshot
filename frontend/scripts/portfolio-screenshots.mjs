/**
 * Capture portfolio screenshots from the local stack.
 *
 * Requires the full local stack to be running:
 *   supabase start                                     (54321 / 54322)
 *   cd cloudflare-backend && npx wrangler dev --port 8001
 *   cd frontend && npm run dev -- --port 5174
 *
 * Usage: node scripts/portfolio-screenshots.mjs
 * Writes PNGs to portfolio/screenshots/.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../portfolio/screenshots");
const BASE = process.env.PORTFOLIO_BASE_URL ?? "http://localhost:5174";
const EMAIL = process.env.PORTFOLIO_EMAIL ?? "owner@acme.example.com";
const PASSWORD = process.env.PORTFOLIO_PASSWORD ?? "TestPass123!";

/** Routes to capture: [filename, path, optional prep function] */
const ROUTES = [
  ["dashboard", "/dashboard"],
  ["portfolio", "/portfolio"],
  ["portfolio-pipeline", "/portfolio/pipeline"],
  ["reconciliations", "/reconciliations"],
  ["reconciliation-history", "/reconciliation/history"],
  ["documents", "/documents"],
  ["extractions", "/extractions"],
  ["analysis", "/analysis"],
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const failures = [];

async function settle(ms = 1200) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false });
  console.log(`  captured ${name}.png`);
}

// --- log in -----------------------------------------------------------------
console.log("logging in as", EMAIL);
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await settle(800);
await shot("00-login");

await page.getByRole("textbox", { name: /email/i }).fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.getByRole("button", { name: /^sign in$/i }).click();

await page
  .waitForURL((u) => !/\/(login|auth\/login)$/.test(u.pathname), { timeout: 30_000 })
  .catch(() => {});
await settle(2000);

if (/\/(login|auth\/login)$/.test(new URL(page.url()).pathname)) {
  console.error("LOGIN FAILED — still on", page.url());
  await shot("00-login-failed");
  await browser.close();
  process.exit(1);
}
console.log("logged in, landed on", page.url());

// --- capture routes ---------------------------------------------------------
for (const [name, path] of ROUTES) {
  try {
    console.log(`visiting ${path}`);
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle();
    const landed = new URL(page.url()).pathname;
    if (/\/(403|login)$/.test(landed)) {
      failures.push(`${path} -> redirected to ${landed}`);
      continue;
    }
    await shot(`${ROUTES.indexOf(ROUTES.find((r) => r[0] === name)) + 1}`.padStart(2, "0") + `-${name}`);
  } catch (error) {
    failures.push(`${path} -> ${error.message.split("\n")[0]}`);
  }
}

// --- drill into a reconciliation, then open the calculation trace -------------
try {
  console.log("opening a reconciliation");
  await page.goto(`${BASE}/reconciliations`, { waitUntil: "domcontentloaded" });
  await settle();

  // The row action is labelled "Review <property> reconciliation" via aria-label,
  // which is what carries the accessible name — the visible text is just "Review".
  const review = page.getByRole("button", { name: /^review .+ reconciliation$/i }).first();
  if (!(await review.count())) {
    failures.push("no Review action on the reconciliations list");
  } else {
    await review.click();
    await page.waitForURL(/\/properties\/[^/]+\/reconciliations/, { timeout: 20_000 }).catch(() => {});
    await settle(3000);
    await shot("20-reconciliation-detail");

    // The hero shot: every figure expands to the inputs that produced it.
    const trace = page.locator('[data-testid="trace-button"]').first();
    if (await trace.count()) {
      await trace.scrollIntoViewIfNeeded();
      await trace.click();
      await settle(2000);
      await shot("21-calculation-trace");
    } else {
      failures.push("no trace-button on the reconciliation detail grid");
    }
  }
} catch (error) {
  failures.push(`reconciliation drill-down -> ${error.message.split("\n")[0]}`);
}

// --- the human-review step an AI extraction cannot skip ----------------------
try {
  console.log("opening an extraction for review");
  await page.goto(`${BASE}/extractions`, { waitUntil: "domcontentloaded" });
  await settle();
  const reviewExtraction = page.getByRole("button", { name: /review/i }).first();
  if (await reviewExtraction.count()) {
    await reviewExtraction.click();
    await settle(2500);
    await shot("10-extraction-review");
  } else {
    failures.push("no Review action on the extractions list");
  }
} catch (error) {
  failures.push(`extraction review -> ${error.message.split("\n")[0]}`);
}

// --- mobile ------------------------------------------------------------------
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle();
  await shot("30-dashboard-mobile");
} catch (error) {
  failures.push(`mobile dashboard -> ${error.message.split("\n")[0]}`);
}

await browser.close();

if (failures.length) {
  console.log("\nNOT captured:");
  for (const f of failures) console.log("  -", f);
}
console.log(`\ndone — PNGs in ${OUT}`);
