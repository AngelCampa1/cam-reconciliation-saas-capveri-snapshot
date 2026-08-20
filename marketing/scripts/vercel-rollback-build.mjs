import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const marketingRoot = path.resolve(__dirname, "..");
const outputDir = path.join(marketingRoot, ".vercel-rollback");

await rm(outputDir, { recursive: true, force: true });
await mkdir(path.join(outputDir, ".well-known"), { recursive: true });

const securityTxt = await readFile(
  path.join(marketingRoot, "public", ".well-known", "security.txt"),
  "utf8",
);

await writeFile(
  path.join(outputDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex">
    <title>CapVeri</title>
  </head>
  <body>
    <main>
      <h1>CapVeri</h1>
      <p>Cloudflare Workers serve the production marketing site.</p>
    </main>
  </body>
</html>
`,
);

await writeFile(
  path.join(outputDir, ".well-known", "security.txt"),
  securityTxt,
);
