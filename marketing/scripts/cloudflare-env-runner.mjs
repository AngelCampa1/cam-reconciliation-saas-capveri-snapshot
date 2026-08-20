import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
];

export const SECRET_ENV = [
  "AI_SDR_CONTEXT_SECRET",
  "AI_SDR_PRODUCT_CONTEXT_SECRET",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_DSN",
];

const DEPLOY_SAFE_URL_KEYS = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_POSTHOG_HOST",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETING_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MARKETING_DIR, "..");
const WRANGLER_PATH = path.join(MARKETING_DIR, "wrangler.jsonc");

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const first = trimmed.at(0);
  const last = trimmed.at(-1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseDotEnv(content) {
  const parsed = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.startsWith("export ")
      ? line.slice(7).trim()
      : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    parsed[key] = unquoteEnvValue(normalizedLine.slice(separatorIndex + 1));
  }

  return parsed;
}

export async function applyEnvFiles({ rootDir, marketingDir, env }) {
  const nextEnv = { ...env };
  const protectedKeys = new Set(
    Object.entries(env)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key]) => key),
  );
  const envFiles = [
    path.join(rootDir, ".env"),
    path.join(marketingDir, ".env"),
    path.join(rootDir, ".env.local"),
    path.join(marketingDir, ".env.local"),
  ];

  for (const filePath of envFiles) {
    if (!existsSync(filePath)) continue;

    const parsed = parseDotEnv(await readFile(filePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (protectedKeys.has(key)) continue;
      nextEnv[key] = value;
    }
  }

  return nextEnv;
}

function stripJsoncComments(content) {
  return content
    .split("\n")
    .map((line) => {
      let inString = false;
      let escaped = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (character === "\\" && inString) {
          escaped = true;
          continue;
        }
        if (character === '"') {
          inString = !inString;
          continue;
        }
        if (!inString && character === "/" && line[index + 1] === "/") {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
}

export async function getWranglerConfig(wranglerPath = WRANGLER_PATH) {
  if (!existsSync(wranglerPath)) return {};
  return JSON.parse(stripJsoncComments(await readFile(wranglerPath, "utf8")));
}

export async function applyWranglerVars({ wranglerPath = WRANGLER_PATH, env }) {
  const config = await getWranglerConfig(wranglerPath);
  const vars = config.vars ?? {};
  const nextEnv = { ...env };

  for (const secretName of SECRET_ENV) {
    if (typeof vars[secretName] === "string" && vars[secretName].trim()) {
      throw new Error(
        `${secretName} must not be stored in wrangler.jsonc vars.`,
      );
    }
  }

  for (const [key, value] of Object.entries(vars)) {
    if (nextEnv[key] !== undefined && nextEnv[key] !== "") continue;
    if (typeof value === "string") {
      nextEnv[key] = value;
    }
  }

  return nextEnv;
}

export function validateRequiredEnv(env) {
  const missing = REQUIRED_PUBLIC_ENV.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required Cloudflare marketing env variables: ${missing.join(", ")}`,
    );
  }

  for (const key of DEPLOY_SAFE_URL_KEYS) {
    validateDeploySafeUrl(key, env[key]);
  }
}

function validateDeploySafeUrl(key, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute https URL. Received: ${value}`);
  }

  if (url.protocol !== "https:") {
    throw new Error(
      `${key} must use https for Cloudflare production builds. Received: ${value}`,
    );
  }

  const hostname = url.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
  if (localHosts.has(hostname) || hostname.endsWith(".localhost")) {
    throw new Error(
      `${key} cannot point at a local address for Cloudflare production builds. Received: ${value}`,
    );
  }

  if (
    key === "NEXT_PUBLIC_API_URL" &&
    url.pathname !== "/" &&
    url.pathname !== ""
  ) {
    throw new Error(
      `${key} must be an API origin without a path, for example https://api.capveri.com. Received: ${value}`,
    );
  }
}

export function getCommandPlan(commandName) {
  if (commandName === "build") {
    return [
      ["node", ["scripts/validate-cloudflare-env.mjs"]],
      ["npx", ["next", "build", "--webpack"]],
      ["npx", ["opennextjs-cloudflare", "build", "--skipNextBuild"]],
    ];
  }

  if (commandName === "deploy") {
    return [
      ["node", ["scripts/validate-cloudflare-env.mjs"]],
      ["npx", ["next", "build", "--webpack"]],
      ["npx", ["opennextjs-cloudflare", "build", "--skipNextBuild"]],
      [
        "npx",
        [
          "wrangler",
          "d1",
          "migrations",
          "apply",
          "capveri-ai-sdr-nonces",
          "--remote",
        ],
      ],
      ["npx", ["opennextjs-cloudflare", "deploy"]],
    ];
  }

  throw new Error(`Unknown Cloudflare command: ${commandName}`);
}

export async function validateLocalNodeModules({
  marketingDir = MARKETING_DIR,
  platform = process.platform,
  lstat: statPath = lstat,
  existsPath = existsSync,
} = {}) {
  if (platform !== "win32") return;

  const nodeModulesPath = path.join(marketingDir, "node_modules");
  if (!existsPath(nodeModulesPath)) return;

  const stats = await statPath(nodeModulesPath);
  if (!stats.isSymbolicLink()) return;

  throw new Error(
    [
      "Cloudflare build/deploy cannot run from a Windows node_modules symlink or junction.",
      "Install dependencies directly in this worktree with npm ci before deploying.",
    ].join(" "),
  );
}

async function runCommand(command, args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: MARKETING_DIR,
      env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`${command} ${args.join(" ")} exited with code ${code}`),
      );
    });
  });
}

async function main() {
  const commandName = process.argv[2];
  const envWithWrangler = await applyWranglerVars({
    wranglerPath: WRANGLER_PATH,
    env: process.env,
  });
  const env = await applyEnvFiles({
    rootDir: REPO_ROOT,
    marketingDir: MARKETING_DIR,
    env: envWithWrangler,
  });
  const buildEnv = {
    ...env,
    NEXT_PRIVATE_STANDALONE: "true",
    NEXT_PRIVATE_OUTPUT_TRACE_ROOT: MARKETING_DIR,
  };

  validateRequiredEnv(buildEnv);
  await validateLocalNodeModules();
  console.log(
    `Cloudflare ${commandName}: required public env present (${REQUIRED_PUBLIC_ENV.join(", ")})`,
  );

  for (const [command, args] of getCommandPlan(commandName)) {
    await runCommand(command, args, buildEnv);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
