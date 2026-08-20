import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.CI) {
  console.error(
    "Production E2E checks are manual-only and must not run in CI.",
  );
  process.exit(1);
}

const repoRoot = resolve(import.meta.dirname, "../..");
const marketingRoot = resolve(import.meta.dirname, "..");
const frontendRoot = resolve(repoRoot, "frontend");
const primaryRepoRoot = resolvePrimaryRepoRoot(repoRoot);

for (const envPath of [
  resolve(repoRoot, ".env.local"),
  resolve(marketingRoot, ".env.local"),
  resolve(frontendRoot, ".env.production.local"),
  resolve(frontendRoot, ".env.local"),
  ...(primaryRepoRoot === repoRoot
    ? []
    : [
        resolve(primaryRepoRoot, ".env.local"),
        resolve(primaryRepoRoot, "marketing", ".env.local"),
        resolve(primaryRepoRoot, "frontend", ".env.production.local"),
        resolve(primaryRepoRoot, "frontend", ".env.local"),
      ]),
]) {
  loadEnvFile(envPath);
}

// Calendar exposure tests require live signed-context credentials:
// AI_SDR_CONTEXT_SECRET or AI_SDR_PRODUCT_CONTEXT_SECRET, and AI_CS_CONTEXT_SECRET.
// AI-CS auth is minted from E2E_PROD_EMAIL/PASSWORD when no token/user is supplied.
const result = spawnSync(
  "npx",
  [
    "playwright",
    "test",
    "e2e/redirects.spec.ts",
    "e2e/no-public-calendar.prod.spec.ts",
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      RUN_PRODUCTION_TESTS: "1",
    },
  },
);

process.exit(result.status ?? 1);

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(trimmed);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = unquoteEnvValue(match[2]);
  }
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function resolvePrimaryRepoRoot(currentRepoRoot) {
  const gitFilePath = resolve(currentRepoRoot, ".git");
  if (!existsSync(gitFilePath)) {
    return currentRepoRoot;
  }
  if (statSync(gitFilePath).isDirectory()) {
    return currentRepoRoot;
  }

  const gitFile = readFileSync(gitFilePath, "utf8").trim();
  const gitdirMatch = /^gitdir:\s*(.+)$/iu.exec(gitFile);
  if (!gitdirMatch) {
    return currentRepoRoot;
  }

  const gitdir = gitdirMatch[1].replace(/\\/gu, "/");
  const marker = "/.git/worktrees/";
  const markerIndex = gitdir.toLowerCase().indexOf(marker);
  if (markerIndex === -1) {
    return currentRepoRoot;
  }

  return gitdir.slice(0, markerIndex);
}
