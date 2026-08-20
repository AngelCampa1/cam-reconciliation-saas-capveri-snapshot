import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const APP_ROOT = path.join(PROJECT_ROOT, "src", "app");
const TARGET_DIRS = [
  path.join(APP_ROOT, "resources"),
  path.join(APP_ROOT, "tools"),
];

const FORBIDDEN_PATTERNS = [
  /CapVeri Research Notes/,
  /github\.com\/capveri\/capveri\/blob\/master\/docs/,
];

function getFilesRecursively(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
      continue;
    }

    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("citation self-reference guard", () => {
  it("rejects internal research sources on resource and tool pages", () => {
    const violations: string[] = [];

    for (const dir of TARGET_DIRS) {
      const files = getFilesRecursively(dir);
      for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(source)) {
            const relative = path.relative(PROJECT_ROOT, file);
            violations.push(`${relative}: ${String(pattern)}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
