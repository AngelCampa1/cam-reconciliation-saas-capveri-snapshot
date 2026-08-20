import { execFileSync } from "child_process";
import path from "path";
import { describe, expect, it } from "vitest";

// Guards against internal-only jargon (internal codenames, marketing-ops funnel
// terms) leaking into public-facing marketing copy. The scanner itself lives at
// scripts/marketing-copy-gate.mjs (repo root) and is the single source of truth
// for what counts as "public copy" vs. internal code/metadata. Running it here
// makes the gate part of the marketing test suite, so a regression fails CI.
const REPO_ROOT = path.resolve(__dirname, "../../..");
const GATE_PATH = path.join(REPO_ROOT, "scripts", "marketing-copy-gate.mjs");

describe("internal-jargon gate", () => {
  it("public-facing marketing copy contains no internal-only jargon", () => {
    let output = "";
    let failed = false;
    try {
      output = execFileSync(process.execPath, [GATE_PATH], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      });
    } catch (err) {
      // Non-zero exit (violations found) lands here; surface the gate's report.
      failed = true;
      const e = err as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }

    // If this fails, `output` lists every leaking file and term.
    expect(output, output).toContain(
      "No internal-only jargon found in public-facing copy.",
    );
    expect(failed, output).toBe(false);
  });
});
