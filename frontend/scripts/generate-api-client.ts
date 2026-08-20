#!/usr/bin/env npx tsx
/**
 * API Client Generation Script
 *
 * Generates TypeScript API client from OpenAPI spec.
 *
 * Usage:
 *   npm run generate-api-client           # From saved file (default)
 *   npm run generate-api-client:live      # From live server
 *   npm run generate-api-client:save      # Fetch from server and save, then generate
 *
 * Command line options:
 *   --live    Fetch spec from live server instead of file
 *   --save    Save fetched spec to file (only with --live)
 *   --file    Use saved spec file (default behavior)
 *
 * Environment variables:
 *   API_URL   Server URL (default: http://localhost:8000)
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM module path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DEFAULT_API_URL = "http://localhost:8000";
const SPEC_FILE = path.join(__dirname, "..", "openapi.json");
const OUTPUT_DIR = path.join(__dirname, "..", "src", "api", "generated");

// Define OpenAPI spec interface for type safety
interface OpenAPISpec {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, unknown>;
  components?: Record<string, unknown>;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { useLive: boolean; saveSpec: boolean } {
  const args = process.argv.slice(2);
  const useLive = args.includes("--live") || args.includes("--save");
  const saveSpec = args.includes("--save");

  return { useLive, saveSpec };
}

/**
 * Get the API URL from environment or default
 */
function getApiUrl(): string {
  return process.env.API_URL || DEFAULT_API_URL;
}

/**
 * Fetch OpenAPI spec from the live server
 */
async function fetchSpec(apiUrl: string): Promise<OpenAPISpec> {
  const specUrl = `${apiUrl}/openapi.json`;
  console.log(`Fetching OpenAPI spec from ${specUrl}...`);

  try {
    const response = await fetch(specUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const spec = (await response.json()) as OpenAPISpec;
    console.log("  Spec fetched successfully");
    return spec;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        `Cannot connect to server at ${apiUrl}. Is the backend running?`
      );
    }
    throw error;
  }
}

/**
 * Load OpenAPI spec from saved file
 */
function loadSpecFromFile(): OpenAPISpec {
  console.log(`Loading OpenAPI spec from ${SPEC_FILE}...`);

  if (!fs.existsSync(SPEC_FILE)) {
    throw new Error(
      `Spec file not found: ${SPEC_FILE}\n` +
        "Run with --live to fetch from server, or ensure openapi.json exists."
    );
  }

  try {
    const content = fs.readFileSync(SPEC_FILE, "utf-8");
    const spec = JSON.parse(content) as OpenAPISpec;
    console.log("  Spec loaded successfully");
    return spec;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in spec file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Save OpenAPI spec to file
 */
function saveSpec(spec: OpenAPISpec): void {
  console.log(`Saving spec to ${SPEC_FILE}...`);
  fs.writeFileSync(SPEC_FILE, JSON.stringify(spec, null, 2) + "\n");
  console.log("  Spec saved successfully");
}

/**
 * Validate that the OpenAPI spec has required fields
 */
function validateSpec(spec: OpenAPISpec): void {
  console.log("Validating OpenAPI spec...");

  // Check OpenAPI version
  if (!spec.openapi) {
    throw new Error("Invalid spec: missing 'openapi' version field");
  }

  const version = spec.openapi;
  if (!version.startsWith("3.")) {
    throw new Error(
      `Invalid spec: unsupported OpenAPI version '${version}'. Expected 3.x`
    );
  }

  // Check info section
  if (!spec.info) {
    throw new Error("Invalid spec: missing 'info' section");
  }

  if (!spec.info.title) {
    throw new Error("Invalid spec: missing 'info.title'");
  }

  // Check paths
  if (!spec.paths) {
    throw new Error("Invalid spec: missing 'paths' section");
  }

  const pathCount = Object.keys(spec.paths).length;
  if (pathCount === 0) {
    throw new Error("Invalid spec: 'paths' is empty (no API endpoints defined)");
  }

  // Check for components/schemas (optional but expected)
  const schemaCount = spec.components?.schemas
    ? Object.keys(spec.components.schemas as Record<string, unknown>).length
    : 0;

  console.log(`  OpenAPI version: ${version}`);
  console.log(`  API title: ${spec.info.title}`);
  console.log(`  Endpoints found: ${pathCount}`);
  console.log(`  Schemas found: ${schemaCount}`);
  console.log("  Validation passed");
}

/**
 * Run the OpenAPI TypeScript generator
 */
function generateClient(): void {
  console.log("Generating TypeScript client...");

  // Clean output directory to ensure fresh generation
  if (fs.existsSync(OUTPUT_DIR)) {
    console.log(`  Cleaning ${OUTPUT_DIR}...`);
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  try {
    // Run openapi-ts with the config file
    execSync("npx openapi-ts -f openapi-codegen.config.ts", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    console.log("  Client generated successfully");
  } catch {
    throw new Error(
      "Code generation failed. Check the output above for details."
    );
  }
}

/**
 * Format generated code with Prettier
 */
function formatCode(): void {
  console.log("Formatting generated code with Prettier...");

  try {
    execSync(`npx prettier --write "${OUTPUT_DIR}/**/*.ts"`, {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    console.log("  Code formatted successfully");
  } catch {
    // Prettier formatting failure is non-fatal but should be reported
    console.warn(
      "  Warning: Prettier formatting failed. Generated code may not be formatted."
    );
  }
}

/**
 * Verify the generated output exists and contains expected files
 */
function verifyOutput(): void {
  console.log("Verifying generated output...");

  const expectedFiles = ["index.ts", "types.gen.ts", "sdk.gen.ts"];
  const missingFiles: string[] = [];

  for (const file of expectedFiles) {
    const filePath = path.join(OUTPUT_DIR, file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `Generation incomplete: missing files: ${missingFiles.join(", ")}`
    );
  }

  // Check that files have content
  const indexPath = path.join(OUTPUT_DIR, "index.ts");
  const indexContent = fs.readFileSync(indexPath, "utf-8");
  if (indexContent.length < 100) {
    throw new Error("Generation incomplete: index.ts appears empty or minimal");
  }

  console.log("  All expected files generated");
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const startTime = Date.now();

  console.log("=".repeat(60));
  console.log("CapVeri API Client Generator");
  console.log("=".repeat(60));
  console.log();

  const { useLive, saveSpec: shouldSave } = parseArgs();

  try {
    // Step 1: Get the spec
    let spec: OpenAPISpec;

    if (useLive) {
      const apiUrl = getApiUrl();
      spec = await fetchSpec(apiUrl);

      if (shouldSave) {
        saveSpec(spec);
      }
    } else {
      spec = loadSpecFromFile();
    }

    console.log();

    // Step 2: Validate
    validateSpec(spec);
    console.log();

    // Step 3: Generate
    generateClient();
    console.log();

    // Step 4: Format
    formatCode();
    console.log();

    // Step 5: Verify
    verifyOutput();
    console.log();

    // Success summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("=".repeat(60));
    console.log("API client generation complete!");
    console.log(`Output directory: ${OUTPUT_DIR}`);
    console.log(`Duration: ${duration}s`);
    console.log("=".repeat(60));
  } catch (error) {
    console.error();
    console.error("=".repeat(60));
    console.error("ERROR: Generation failed");
    console.error("=".repeat(60));
    console.error();

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }

    process.exit(1);
  }
}

// Execute main function
main();
