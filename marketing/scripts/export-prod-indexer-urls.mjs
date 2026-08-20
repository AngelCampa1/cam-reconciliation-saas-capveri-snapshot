import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SITEMAP_URL = "https://www.capveri.com/sitemap.xml";
const REQUEST_TIMEOUT_MS = 30_000;
const BLOCKED_INDEXER_PATHS = new Set(["/product/features/erp-write-back"]);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const DEFAULT_OUTPUT = path.resolve(
  repoRoot,
  "docs",
  "seo",
  "prod-indexer-urls.txt",
);
const DEFAULT_NET_NEW_SOURCE = path.resolve(
  repoRoot,
  "pseo-pages-for-indexing.txt",
);
const DEFAULT_NET_NEW_OUTPUT = path.resolve(
  repoRoot,
  "docs",
  "seo",
  "prod-indexer-net-new-urls.txt",
);
const MIN_NET_NEW_URLS = 200;

function extractUrls(xml) {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter((url) => url.startsWith("https://www.capveri.com/"));

  const blockedUrls = urls.filter((url) =>
    BLOCKED_INDEXER_PATHS.has(new URL(url).pathname),
  );
  if (blockedUrls.length > 0) {
    console.warn(
      `Skipped ${blockedUrls.length} blocked production URL(s): ${blockedUrls.join(", ")}`,
    );
  }

  return urls.filter(
    (url) => !BLOCKED_INDEXER_PATHS.has(new URL(url).pathname),
  );
}

async function readManifestUrls(manifestPath) {
  const raw = await fs.readFile(manifestPath, "utf8");
  return [
    ...new Set(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("https://www.capveri.com/"))
        .filter(
          (url) => !BLOCKED_INDEXER_PATHS.has(new URL(url).pathname),
        ),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

async function main() {
  const checkMode = process.argv.includes("--check");
  const netNewMode = process.argv.includes("--net-new");
  const outputIndex = process.argv.indexOf("--output");
  const outputPath =
    outputIndex >= 0 && process.argv[outputIndex + 1]
      ? path.resolve(process.argv[outputIndex + 1])
      : netNewMode
        ? DEFAULT_NET_NEW_OUTPUT
        : DEFAULT_OUTPUT;
  const sourceIndex = process.argv.indexOf("--source");
  const netNewSourcePath =
    sourceIndex >= 0 && process.argv[sourceIndex + 1]
      ? path.resolve(process.argv[sourceIndex + 1])
      : DEFAULT_NET_NEW_SOURCE;

  const response = await fetch(SITEMAP_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${SITEMAP_URL}: ${response.status} ${response.statusText}`,
    );
  }

  const urls = extractUrls(await response.text());
  if (urls.length === 0) {
    throw new Error(`No URLs found in ${SITEMAP_URL}`);
  }

  const uniqueSortedUrls = [...new Set(urls)].sort((a, b) =>
    a.localeCompare(b),
  );
  const outputUrls = netNewMode
    ? (await readManifestUrls(netNewSourcePath)).filter((url) =>
        uniqueSortedUrls.includes(url),
      )
    : uniqueSortedUrls;

  if (netNewMode && outputUrls.length < MIN_NET_NEW_URLS) {
    throw new Error(
      `Only ${outputUrls.length} net-new manifest URLs are live in production sitemap; expected at least ${MIN_NET_NEW_URLS}.`,
    );
  }

  const output = `${outputUrls.join("\n")}\n`;

  if (checkMode) {
    const current = await fs.readFile(outputPath, "utf8");
    if (current !== output) {
      const refreshCommand = netNewMode
        ? "npm run indexer:urls:net-new"
        : "npm run indexer:urls";
      throw new Error(
        `${outputPath} is stale. Run ${refreshCommand} to refresh it from production.`,
      );
    }
    console.log(
      `Production URL artifact is current with ${outputUrls.length} URLs`,
    );
    return;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output);
  console.log(
    `Wrote ${outputUrls.length} production URLs to ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
