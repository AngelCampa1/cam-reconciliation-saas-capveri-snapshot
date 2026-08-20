import { applyEnvFiles, applyWranglerVars, validateRequiredEnv } from "./cloudflare-env-runner.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const marketingDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(marketingDir, "..");
const wranglerPath = path.join(marketingDir, "wrangler.jsonc");

const envWithWrangler = await applyWranglerVars({
  wranglerPath,
  env: process.env,
});
const env = await applyEnvFiles({
  rootDir,
  marketingDir,
  env: envWithWrangler,
});

validateRequiredEnv(env);
console.log("Cloudflare build env validation passed.");
