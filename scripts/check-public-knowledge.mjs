import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

execFileSync(
  process.execPath,
  [path.join(__dirname, "generate-public-knowledge.mjs"), "--check"],
  { stdio: "inherit" },
);

const jsonPath = path.join(repoRoot, "knowledge", "generated", "public-knowledge.json");
const tsPaths = [
  path.join(repoRoot, "knowledge", "generated", "public-knowledge.ts"),
  path.join(repoRoot, "frontend", "src", "generated", "public-knowledge.ts"),
  path.join(repoRoot, "marketing", "src", "generated", "public-knowledge.ts"),
];
const backendJsonPath = path.join(
  repoRoot,
  "backend",
  "app",
  "generated",
  "public-knowledge.json",
);
// Served to AI-CS as the signed app-context; must stay byte-identical to canonical.
const cloudflareBackendJsonPath = path.join(
  repoRoot,
  "cloudflare-backend",
  "src",
  "generated",
  "public-knowledge.json",
);

const jsonText = fs.readFileSync(jsonPath, "utf8");
const jsonData = JSON.parse(jsonText);
const backendJsonData = JSON.parse(fs.readFileSync(backendJsonPath, "utf8"));
const cloudflareBackendJsonData = JSON.parse(
  fs.readFileSync(cloudflareBackendJsonPath, "utf8"),
);
const canonicalTs = fs.readFileSync(tsPaths[0], "utf8");

if (JSON.stringify(backendJsonData) !== JSON.stringify(jsonData)) {
  throw new Error("Backend public knowledge JSON differs from canonical JSON.");
}

if (JSON.stringify(cloudflareBackendJsonData) !== JSON.stringify(jsonData)) {
  throw new Error(
    "Cloudflare backend public knowledge JSON (AI-CS app-context) differs from canonical JSON.",
  );
}

const embeddedJsonMatch = canonicalTs.match(
  /export const PUBLIC_KNOWLEDGE_JSON\s*=\s*([\s\S]*?);\r?\n/,
);
if (!embeddedJsonMatch) {
  throw new Error("Generated TS is missing PUBLIC_KNOWLEDGE_JSON parity payload.");
}

const embeddedJson = Function(`"use strict"; return (${embeddedJsonMatch[1]});`)();
if (JSON.stringify(JSON.parse(embeddedJson)) !== JSON.stringify(jsonData)) {
  throw new Error("Generated TS and JSON public knowledge payloads differ.");
}

const forbiddenClaimPatterns = [
  /Start Free Audit/i,
  /Free Revenue Audit/i,
  /Free CAM Audit(?! Defense Packet Builder)/i,
  /BOMA certified/i,
  /fully BOMA 2024 compliant/i,
  /BOMA[- ](?:2024 )?compliant/i,
  /Claude AI/i,
  /AI GL analysis/i,
  /AI-powered/i,
  /zero-data-retention agreement/i,
  /zero-data-retention/i,
  /\bZDR\b/i,
  /customer data is not used to train models/i,
  /not used to train models/i,
  /model-training opt-out/i,
  /environment variable names/i,
  /production (test accounts|E2E)/i,
  /prospect lists/i,
  /GTM plans/i,
  /internal QA reports/i,
  /secret-management/i,
  /can never see another tenant/i,
  /even through a software bug/i,
  /TLS 1\.3/i,
  /AES-256/i,
  /Custom SLA/i,
  /near-zero error rate/i,
  /no minimum commitment/i,
  /no long-term contract/i,
  /guaranteed .*compliance/i,
  /full BOMA 2024 aligned/i,
  /BOMA 2024 compliance/i,
  /\bimmutable\b/i,
  /\bnear[- ]zero\b/i,
  /same accuracy/i,
  /under 30 minutes/i,
  /Growth subscription pricing/i,
  /Growth, Portfolio, and Enterprise/i,
  /CapVeri Growth plan/i,
  /audit-credit package/i,
];

const publicArtifactFiles = [
  "knowledge/generated/public-knowledge.json",
  "knowledge/generated/public-knowledge.ts",
  "backend/app/generated/public-knowledge.json",
  "cloudflare-backend/src/generated/public-knowledge.json",
  "frontend/src/generated/public-knowledge.ts",
  "marketing/src/generated/public-knowledge.ts",
  "marketing/public/llms.txt",
  "marketing/public/llms-full.txt",
  "marketing/public/pricing.md",
  "marketing/public/pricing.txt",
];

const guardedPublicFactRoots = [
  "marketing/scripts/generate-llms.mjs",
  "marketing/data",
  "marketing/src/app",
  "marketing/src/components",
  "marketing/src/config",
  "marketing/src/data",
  "marketing/src/lib/structured-data.ts",
  "frontend/src/components/SEO.tsx",
  "frontend/src/components/auth",
  "frontend/src/components/landing",
  "frontend/src/config",
  "frontend/src/features/onboarding",
  "frontend/src/pages",
];

const forbiddenGuardedPatterns = [
  {
    label: "hardcoded public CapVeri email",
    pattern: /[A-Za-z0-9._%+-]+@capveri\.com/i,
  },
  {
    label: "duplicated limited offer price literal",
    pattern: /\$(99\.50|249\.50|499\.50)\b|\b(99\.50|249\.50|499\.50)\b/,
  },
  {
    label: "hardcoded limited offer code",
    pattern: /LAUNCH(50|30|15)/,
  },
  {
    label: "duplicated retired custom threshold",
    pattern: /50\+ buildings|above 500 rentable units|more than 500 rentable units/i,
  },
  {
    label: "direct plan tier file read",
    pattern: /plan-tiers\.json/,
  },
  {
    label: "retired audit-credit or free-audit primary language",
    pattern: /Start Free Audit|Free Revenue Audit|Free CAM Audit(?! Defense Packet Builder)|audit-credit package/i,
  },
  {
    label: "standalone risky AI claim",
    pattern: /Claude AI|AI-powered|model-training opt-out|not used to train models|zero-data-retention|\bZDR\b/i,
  },
  {
    label: "BOMA certification language",
    pattern:
      /BOMA certified|BOMA certification|fully BOMA 2024 compliant|BOMA[- ](?:2024 )?compliant|compliant results/i,
  },
  {
    label: "ZDR guarantee language",
    pattern: /zero-data-retention|ZDR/i,
  },
  {
    label: "absolute security or contract commitment",
    pattern:
      /TLS 1\.3|AES-256|can never|even through a software bug|Custom SLA|money-back guarantee|near[- ]zero|no minimum commitment|no long-term contract|guaranteed .*compliance|full BOMA 2024 aligned|BOMA 2024 compliance|\bimmutable\b|same accuracy|under 30 minutes/i,
  },
  {
    label: "retired tier name language",
    pattern: /Growth subscription pricing|Growth, Portfolio, and Enterprise|CapVeri Growth plan/i,
  },
];

for (const pattern of forbiddenClaimPatterns) {
  if (pattern.test(jsonText)) {
    throw new Error(`Forbidden public knowledge claim matched ${pattern}`);
  }
}

for (const relativePath of publicArtifactFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  for (const pattern of forbiddenClaimPatterns) {
    if (pattern.test(text)) {
      throw new Error(`${relativePath} contains forbidden public artifact claim ${pattern}`);
    }
  }
}

function collectFiles(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [relativePath];

  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = path.posix.join(relativePath, entry.name);
    if (entry.isDirectory()) return collectFiles(child);
    return [child];
  });
}

const guardedPublicFactFiles = guardedPublicFactRoots
  .flatMap(collectFiles)
  .filter((relativePath) => /\.(tsx?|jsx?|mjs|json)$/.test(relativePath))
  .filter((relativePath) => !/(__tests__|\.test\.|\.spec\.|generated\/)/.test(relativePath));

for (const relativePath of guardedPublicFactFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);

  for (const { label, pattern } of forbiddenGuardedPatterns) {
    const matchIndex = lines.findIndex(
      (line) =>
        pattern.test(line) &&
        !/certification note|does not certify|does not claim|claiming|misrepresenting|not a software|avoid|why not|rather than|implies (a )?formal|implies.*certification|without formal|\bvs\.?\b/i.test(
          line,
        ) &&
        !/publicKnowledge[.[]/.test(line) &&
        !/import[^;]*public-knowledge|require[^;]*public-knowledge/.test(line) &&
        !/AI-powered surveillance/i.test(line) &&
        !line.includes("generated/public-knowledge") &&
        !line.includes("generated\\public-knowledge"),
    );
    if (matchIndex !== -1) {
      throw new Error(
        `${relativePath}:${matchIndex + 1} contains ${label}; use publicKnowledge.`,
      );
    }
  }
}

console.log("Public knowledge TS/JSON parity and safety checks passed.");
