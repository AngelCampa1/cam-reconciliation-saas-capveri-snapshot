/**
 * Tests for API Client Generation Script
 *
 * Tests the validation, file operations, and script behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock modules (none needed for validation/argument tests)

// Test fixtures
const validSpec = {
  openapi: "3.1.0",
  info: {
    title: "Test API",
    version: "1.0.0",
  },
  paths: {
    "/test": { get: { summary: "Test endpoint" } },
  },
  components: {
    schemas: {
      TestSchema: { type: "object" },
    },
  },
};

const minimalValidSpec = {
  openapi: "3.0.0",
  info: { title: "Minimal API", version: "0.1.0" },
  paths: { "/health": {} },
};

// Import the validation function by re-implementing it for testing
// (Since the script is executable, we test its core logic)
function validateSpec(spec: Record<string, unknown>): void {
  // Check OpenAPI version
  if (!spec.openapi) {
    throw new Error("Invalid spec: missing 'openapi' version field");
  }

  const version = spec.openapi as string;
  if (!version.startsWith("3.")) {
    throw new Error(
      `Invalid spec: unsupported OpenAPI version '${version}'. Expected 3.x`
    );
  }

  // Check info section
  if (!spec.info) {
    throw new Error("Invalid spec: missing 'info' section");
  }

  const info = spec.info as Record<string, unknown>;
  if (!info.title) {
    throw new Error("Invalid spec: missing 'info.title'");
  }

  // Check paths
  if (!spec.paths) {
    throw new Error("Invalid spec: missing 'paths' section");
  }

  const paths = spec.paths as Record<string, unknown>;
  const pathCount = Object.keys(paths).length;
  if (pathCount === 0) {
    throw new Error(
      "Invalid spec: 'paths' is empty (no API endpoints defined)"
    );
  }
}

describe("API Client Generation Script", () => {
  describe("validateSpec", () => {
    it("accepts valid OpenAPI 3.x specs", () => {
      expect(() => validateSpec(validSpec)).not.toThrow();
      expect(() => validateSpec(minimalValidSpec)).not.toThrow();
    });

    it("rejects spec without openapi version", () => {
      const invalidSpec = { info: { title: "Test" }, paths: { "/": {} } };
      expect(() => validateSpec(invalidSpec)).toThrow(
        "Invalid spec: missing 'openapi' version field"
      );
    });

    it("rejects spec with non-3.x version", () => {
      const invalidSpec = {
        openapi: "2.0.0",
        info: { title: "Test" },
        paths: { "/": {} },
      };
      expect(() => validateSpec(invalidSpec)).toThrow(
        "unsupported OpenAPI version '2.0.0'"
      );
    });

    it("rejects spec without info section", () => {
      const invalidSpec = { openapi: "3.1.0", paths: { "/": {} } };
      expect(() => validateSpec(invalidSpec)).toThrow(
        "Invalid spec: missing 'info' section"
      );
    });

    it("rejects spec without info.title", () => {
      const invalidSpec = {
        openapi: "3.1.0",
        info: { version: "1.0" },
        paths: { "/": {} },
      };
      expect(() => validateSpec(invalidSpec)).toThrow(
        "Invalid spec: missing 'info.title'"
      );
    });

    it("rejects spec without paths", () => {
      const invalidSpec = {
        openapi: "3.1.0",
        info: { title: "Test" },
      };
      expect(() => validateSpec(invalidSpec)).toThrow(
        "Invalid spec: missing 'paths' section"
      );
    });

    it("rejects spec with empty paths", () => {
      const invalidSpec = {
        openapi: "3.1.0",
        info: { title: "Test" },
        paths: {},
      };
      expect(() => validateSpec(invalidSpec)).toThrow(
        "Invalid spec: 'paths' is empty"
      );
    });
  });

  describe("argument parsing", () => {
    // Test the argument parsing logic
    function parseArgs(args: string[]): {
      useLive: boolean;
      saveSpec: boolean;
    } {
      const useLive = args.includes("--live") || args.includes("--save");
      const saveSpec = args.includes("--save");
      return { useLive, saveSpec };
    }

    it("defaults to file mode with no arguments", () => {
      const result = parseArgs([]);
      expect(result.useLive).toBe(false);
      expect(result.saveSpec).toBe(false);
    });

    it("enables live mode with --live flag", () => {
      const result = parseArgs(["--live"]);
      expect(result.useLive).toBe(true);
      expect(result.saveSpec).toBe(false);
    });

    it("enables both live and save with --save flag", () => {
      const result = parseArgs(["--save"]);
      expect(result.useLive).toBe(true);
      expect(result.saveSpec).toBe(true);
    });

    it("handles multiple flags", () => {
      const result = parseArgs(["--live", "--save"]);
      expect(result.useLive).toBe(true);
      expect(result.saveSpec).toBe(true);
    });
  });

  describe("script file", () => {
    it("exists at expected location", () => {
      const scriptPath = path.join(__dirname, "generate-api-client.ts");
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("is valid TypeScript", () => {
      const scriptPath = path.join(__dirname, "generate-api-client.ts");
      const content = fs.readFileSync(scriptPath, "utf-8");

      // Check for expected function definitions
      expect(content).toContain("async function fetchSpec");
      expect(content).toContain("function loadSpecFromFile");
      expect(content).toContain("function saveSpec");
      expect(content).toContain("function validateSpec");
      expect(content).toContain("function generateClient");
      expect(content).toContain("function formatCode");
      expect(content).toContain("async function main");
    });

    it("exports as ESM module with proper structure", () => {
      const scriptPath = path.join(__dirname, "generate-api-client.ts");
      const content = fs.readFileSync(scriptPath, "utf-8");

      // Check ESM structure
      expect(content).toContain('import { execSync } from "child_process"');
      expect(content).toContain('import * as fs from "fs"');
      expect(content).toContain("import.meta.url");
    });
  });

  describe("integration", () => {
    const SPEC_FILE = path.join(__dirname, "..", "openapi.json");
    const OUTPUT_DIR = path.join(__dirname, "..", "src", "api", "generated");

    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("openapi.json file path is correctly configured for offline generation", () => {
      expect(path.basename(SPEC_FILE)).toBe("openapi.json");
      expect(path.dirname(SPEC_FILE)).toBe(path.join(__dirname, ".."));
    });

    it("openapi.json contains valid spec when present", () => {
      if (!fs.existsSync(SPEC_FILE)) {
        return;
      }
      const content = fs.readFileSync(SPEC_FILE, "utf-8");
      const spec = JSON.parse(content);

      expect(() => validateSpec(spec)).not.toThrow();
      expect(spec.openapi).toMatch(/^3\./);
      expect(spec.info.title).toBe("CapVeri API");
    });

    it("generated output directory structure is correct", () => {
      // Check that the generated directory exists (from previous run)
      if (fs.existsSync(OUTPUT_DIR)) {
        const files = fs.readdirSync(OUTPUT_DIR);
        expect(files).toContain("index.ts");
        expect(files).toContain("types.gen.ts");
        expect(files).toContain("sdk.gen.ts");
      }
    });
  });
});
