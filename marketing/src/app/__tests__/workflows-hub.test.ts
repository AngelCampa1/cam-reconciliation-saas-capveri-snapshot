import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  timeframe: string;
  commonErrors: string[];
}

interface WorkflowEntry {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  overview: string;
  steps: WorkflowStep[];
  timeline: string;
  capveriRole: string;
  relatedResources: string[];
  relatedTools: string[];
}

interface WorkflowsFile {
  lastUpdated: string;
  workflows: WorkflowEntry[];
}

function loadWorkflowsData(): WorkflowsFile {
  const filePath = join(process.cwd(), "data", "workflows.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as WorkflowsFile;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EXPECTED_SLUGS = [
  "year-end-reconciliation",
  "mid-year-tenant-adjustment",
  "new-acquisition-cam-setup",
  "lease-renewal-cam-reset",
  "tenant-dispute-resolution",
  "portfolio-consolidation",
  "budget-to-actual-variance",
  "estimate-letter-generation",
];

describe("workflows.json data validation", () => {
  it("loads and parses correctly", () => {
    expect(() => loadWorkflowsData()).not.toThrow();
  });

  it("has lastUpdated field", () => {
    const data = loadWorkflowsData();
    expect(data.lastUpdated).toBeTruthy();
    expect(new Date(data.lastUpdated).toString()).not.toBe("Invalid Date");
  });

  it("contains all 8 expected workflow slugs", () => {
    const data = loadWorkflowsData();
    const slugs = data.workflows.map((w) => w.slug);
    for (const expected of EXPECTED_SLUGS) {
      expect(slugs, `Missing expected slug: ${expected}`).toContain(expected);
    }
  });

  it("has no duplicate slugs", () => {
    const data = loadWorkflowsData();
    const slugs = data.workflows.map((w) => w.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("all slugs are URL-safe (lowercase, hyphens only)", () => {
    const data = loadWorkflowsData();
    for (const workflow of data.workflows) {
      expect(
        SLUG_PATTERN.test(workflow.slug),
        `Slug "${workflow.slug}" contains invalid characters`,
      ).toBe(true);
    }
  });

  it("all metaTitles are under 80 chars", () => {
    const data = loadWorkflowsData();
    for (const workflow of data.workflows) {
      expect(
        workflow.metaTitle.length,
        `metaTitle too long for slug "${workflow.slug}": ${workflow.metaTitle.length} chars`,
      ).toBeLessThanOrEqual(80);
    }
  });

  it("all metaDescriptions are under 165 chars", () => {
    const data = loadWorkflowsData();
    for (const workflow of data.workflows) {
      expect(
        workflow.metaDescription.length,
        `metaDescription too long for slug "${workflow.slug}": ${workflow.metaDescription.length} chars`,
      ).toBeLessThanOrEqual(165);
    }
  });

  it("all required string fields are non-empty", () => {
    const data = loadWorkflowsData();
    const requiredFields: (keyof WorkflowEntry)[] = [
      "slug",
      "name",
      "metaTitle",
      "metaDescription",
      "headline",
      "subheadline",
      "overview",
      "timeline",
      "capveriRole",
    ];
    for (const workflow of data.workflows) {
      for (const field of requiredFields) {
        expect(
          typeof workflow[field] === "string" &&
            (workflow[field] as string).length > 0,
          `Field "${field}" is empty or missing for slug "${workflow.slug}"`,
        ).toBe(true);
      }
    }
  });

  it("all workflows have at least 3 steps", () => {
    const data = loadWorkflowsData();
    for (const workflow of data.workflows) {
      expect(
        workflow.steps.length,
        `Workflow "${workflow.slug}" has fewer than 3 steps`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("all steps have required fields", () => {
    const data = loadWorkflowsData();
    for (const workflow of data.workflows) {
      for (const step of workflow.steps) {
        expect(
          typeof step.step === "number",
          `Step in "${workflow.slug}" missing step number`,
        ).toBe(true);
        expect(
          step.title.length > 0,
          `Step ${step.step} in "${workflow.slug}" missing title`,
        ).toBe(true);
        expect(
          step.description.length > 0,
          `Step ${step.step} in "${workflow.slug}" missing description`,
        ).toBe(true);
        expect(
          step.timeframe.length > 0,
          `Step ${step.step} in "${workflow.slug}" missing timeframe`,
        ).toBe(true);
        expect(
          Array.isArray(step.commonErrors) && step.commonErrors.length > 0,
          `Step ${step.step} in "${workflow.slug}" missing commonErrors`,
        ).toBe(true);
      }
    }
  });

  it("step numbers are sequential starting at 1", () => {
    const data = loadWorkflowsData();
    for (const workflow of data.workflows) {
      const stepNumbers = workflow.steps.map((s) => s.step);
      stepNumbers.forEach((n, i) => {
        expect(
          n,
          `Step ${i + 1} in "${workflow.slug}" has wrong step number ${n}`,
        ).toBe(i + 1);
      });
    }
  });

  it("relatedTools are valid /tools/ paths", () => {
    const data = loadWorkflowsData();
    for (const workflow of data.workflows) {
      for (const tool of workflow.relatedTools) {
        expect(
          tool.startsWith("/tools/"),
          `Invalid tool path "${tool}" for slug "${workflow.slug}"`,
        ).toBe(true);
      }
    }
  });

  it("relatedResources are valid internal paths", () => {
    const data = loadWorkflowsData();
    for (const workflow of data.workflows) {
      for (const resource of workflow.relatedResources) {
        expect(
          resource.startsWith("/"),
          `Invalid resource path "${resource}" for slug "${workflow.slug}"`,
        ).toBe(true);
      }
    }
  });
});
