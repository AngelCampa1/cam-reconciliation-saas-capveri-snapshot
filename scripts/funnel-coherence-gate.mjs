import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const scanRoots = [
  ".agents/product-marketing.md",
  ".agents/skills/business-advisor",
  ".agents/skills/capveri-business-context",
  ".agents/skills/gtm",
  "docs/configuration",
  "docs/content",
  "docs/business",
  "knowledge/source",
  "marketing/data",
  "marketing/src",
];

const extensions = new Set([".json", ".md", ".mdx", ".ts", ".tsx"]);
const skipPathParts = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "generated",
]);

const retiredPatterns = [
  {
    pattern: /\bStart Free Audit\b/i,
    reason: "Use Start Free Trial as the primary offer.",
  },
  {
    pattern: /\bfirst audit\b/i,
    reason: "First-audit language drifts from the 30-day trial offer.",
  },
  {
    pattern: /\bfree first[- ]building\b/i,
    reason: "Free first-building checks are retired.",
  },
  {
    pattern: /\brun a free baseline\b/i,
    reason: "Free baseline offers are retired.",
  },
  {
    pattern: /\bYour first run is free\b/i,
    reason: "Free-run framing drifts from the 30-day trial offer.",
  },
  {
    pattern: /\bfree portfolio check\b/i,
    reason: "Free portfolio checks are retired.",
  },
  {
    pattern: /\bfree audit on one\b/i,
    reason: "Free audit offers are retired.",
  },
  {
    pattern: /\bIf we find nothing\b/i,
    reason: "Outcome-based no-cost promises are not part of the trial offer.",
  },
  {
    pattern: /\byou pay nothing\b/i,
    reason: "Outcome-based no-cost promises are not part of the trial offer.",
  },
  {
    pattern: /\$250\/building|\$200\/building/i,
    reason: "Old per-building monthly pricing is retired.",
  },
  {
    pattern: /\bstarts at \$998\b/i,
    reason:
      "Do not hardcode discounted pricing; use plan-tiers generated pricing.",
  },
  {
    pattern: /\bRevenue Leakage Scan\b/i,
    reason: "The old service-led scan offer is retired.",
  },
  {
    pattern: /\bBounty Hunter\b/i,
    reason: "The old contingency/bounty model is retired.",
  },
  {
    pattern: /\b20% of any recovered\b/i,
    reason: "Contingency pricing is retired.",
  },
  {
    pattern: /\b(recently found|we recovered|we found|CapVeri found) \$\d/i,
    reason: "Exact-dollar proof needs a real source and approval.",
  },
  {
    pattern: /\bA Houston PMC\b.*\bfound \$\d/i,
    reason: "Fabricated customer-style proof is not allowed.",
  },
  {
    pattern: /\bdirect Yardi integration\b/i,
    reason: "CapVeri uses file exports, not Yardi API integrations.",
  },
  {
    pattern: /\bMRI-integrated\b/i,
    reason: "CapVeri uses file exports, not MRI API integrations.",
  },
  {
    pattern: /\b(?:BOMA 2024(?:-|\s+)(?:measurement\s+)?compliant|BOMA 2024 measurement compliance|SB 1103-compliant|compliant CAM statement)\b/i,
    reason: "Use BOMA 2024/SB 1103 aligned workflows/checks, not compliance claims.",
  },
  {
    pattern: /\bmathematically bulletproof\b/i,
    reason: "Avoid absolute guarantee language.",
  },
  {
    pattern: /\bguarantee absolute zero revenue leakage\b/i,
    reason: "Avoid absolute guarantee language.",
  },
  {
    pattern: /\bguarantees accurate CAM recovery\b/i,
    reason: "Avoid absolute guarantee language.",
  },
  {
    pattern: /\bGuarantee accurate CAM cost recovery\b/i,
    reason: "Avoid absolute guarantee language.",
  },
  {
    pattern: /\bGuarantee AMO audit readiness\b/i,
    reason: "Avoid absolute guarantee language.",
  },
];

function shouldSkipPath(filePath) {
  const parts = filePath.split(/[\\/]/);
  return parts.some((part) => skipPathParts.has(part));
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    if (extensions.has(path.extname(dir))) yield dir;
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (shouldSkipPath(absolutePath)) continue;
    if (entry.isDirectory()) {
      yield* walk(absolutePath);
      continue;
    }
    if (extensions.has(path.extname(entry.name))) yield absolutePath;
  }
}

function isHistoricalArtifact(content) {
  return content.trimStart().startsWith("> Historical");
}

function isCanonicalGuardrailFile(filePath) {
  return filePath.endsWith(
    path.join("docs", "business", "canonical-gtm-source-of-truth.md"),
  );
}

function isIntentionalGuardrailLine(line) {
  return /do not use|don't use|words to avoid|avoid|forbidden|retired|prohibited|instead of|not use|why not|mean vs\.|rather than|without formal certification|implies a formal|implies formal|implies full certification/i.test(
    line,
  );
}

const findings = [];

for (const root of scanRoots) {
  for (const filePath of walk(path.join(repoRoot, root))) {
    const content = fs.readFileSync(filePath, "utf8");
    if (isCanonicalGuardrailFile(filePath)) continue;
    if (isHistoricalArtifact(content)) continue;
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isIntentionalGuardrailLine(line)) return;
      for (const { pattern, reason } of retiredPatterns) {
        if (pattern.test(line)) {
          findings.push({
            filePath: path.relative(repoRoot, filePath),
            line: index + 1,
            reason,
            text: line.trim(),
          });
        }
      }
    });
  }
}

if (findings.length > 0) {
  console.error("Funnel coherence gate failed:");
  for (const finding of findings) {
    console.error(
      `- ${finding.filePath}:${finding.line} ${finding.reason}\n  ${finding.text}`,
    );
  }
  process.exit(1);
}

console.log("Funnel coherence gate passed.");
