/**
 * Capture marketing-site portfolio screenshots from the local Next.js dev server.
 *
 * Requires: cd marketing && npm run dev
 *
 * Port footgun: :3000 on this machine belongs to a different project, so the
 * script asserts the served <title> mentions CapVeri before capturing anything.
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
const BASE = process.env.PORTFOLIO_MARKETING_URL ?? "http://localhost:3001";

/** [filename, path] */
const ROUTES = [
  ["40-marketing-home", "/"],
  ["41-marketing-pricing", "/pricing"],
  ["42-marketing-product", "/cam-reconciliation-software"],
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const failures = [];

async function settle(ms = 1500) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60_000 });
await settle(2500);

const title = await page.title();
if (!/capveri/i.test(title)) {
  console.error(`WRONG SITE on ${BASE} — <title> is "${title}", expected CapVeri`);
  await browser.close();
  process.exit(1);
}
console.log(`confirmed CapVeri at ${BASE} — "${title}"`);

for (const [name, path] of ROUTES) {
  try {
    console.log(`visiting ${path}`);
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle();
    if (page.url().includes("/404") || (await page.title()).includes("404")) {
      failures.push(`${path} -> 404`);
      continue;
    }
    await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false });
    console.log(`  captured ${name}.png`);
  } catch (error) {
    failures.push(`${path} -> ${error.message.split("\n")[0]}`);
  }
}

await browser.close();

if (failures.length) {
  console.log("\nNOT captured:");
  for (const f of failures) console.log("  -", f);
}
console.log(`\ndone — PNGs in ${OUT}`);
