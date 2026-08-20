/**
 * IndexNow URL submission script.
 *
 * Fetches the live sitemap and batch-submits all URLs to IndexNow,
 * notifying Bing, Yandex, Naver, and Seznam of content changes.
 *
 * Usage:
 *   node scripts/indexnow-submit.mjs           # submit all URLs
 *   node scripts/indexnow-submit.mjs --dry-run # print URLs without submitting
 */

const KEY = "5ba430434328c93d0b625fd2684479d4";
const HOST = "www.capveri.com";
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const dryRun = process.argv.includes("--dry-run");

async function fetchSitemapUrls() {
  const res = await fetch(SITEMAP_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const urls = [];
  const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    // Only submit URLs belonging to this host - guards against domain migration artifacts
    if (url.startsWith(`https://${HOST}/`) || url.startsWith(`http://${HOST}/`)) {
      urls.push(url);
    }
  }
  return urls;
}

async function submitBatch(urls) {
  const body = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text().catch(() => "");
  return { status: res.status, body: text };
}

async function main() {
  console.log(`Fetching sitemap: ${SITEMAP_URL}`);
  const urls = await fetchSitemapUrls();

  // Note: sitemap is statically built at deploy time. If run immediately after
  // a fresh deploy, edge cache propagation may cause a brief window where this
  // returns 0 URLs. Re-running the script a few seconds later resolves it.
  if (urls.length === 0) {
    console.error("No URLs found in sitemap.");
    process.exit(1);
  }

  console.log(`Found ${urls.length} URLs`);

  if (dryRun) {
    console.log("\n[Dry run] URLs that would be submitted:");
    urls.forEach((u) => console.log(`  ${u}`));
    return;
  }

  // IndexNow allows up to 10,000 URLs per batch
  const BATCH_SIZE = 10_000;
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    console.log(`\nSubmitting batch of ${batch.length} URLs...`);
    const { status, body } = await submitBatch(batch);
    if (status === 200 || status === 202) {
      console.log(`Success (${status})`);
    } else {
      console.error(`Error (${status}): ${body}`);
      process.exit(1);
    }
  }

  console.log("\nIndexNow submission complete.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
