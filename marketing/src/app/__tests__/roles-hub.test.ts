import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

interface RoleEntry {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  painPoints: string[];
  typicalWorkflow: string;
  timeOnCam: string;
  commonErrors: string[];
  capveriValue: string;
  timeSavings: string;
  relatedTools: string[];
  relatedResources: string[];
}

interface RolesFile {
  lastUpdated: string;
  roles: RoleEntry[];
}

function loadRolesData(): RolesFile {
  const filePath = join(process.cwd(), "data", "roles.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as RolesFile;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EXPECTED_SLUGS = [
  "property-controller",
  "cfo-financial-controller",
  "lease-administrator",
  "property-accountant",
  "asset-manager",
  "director-property-management",
];

describe("roles.json data validation", () => {
  it("loads and parses correctly", () => {
    expect(() => loadRolesData()).not.toThrow();
  });

  it("has lastUpdated field", () => {
    const data = loadRolesData();
    expect(data.lastUpdated).toBeTruthy();
    expect(new Date(data.lastUpdated).toString()).not.toBe("Invalid Date");
  });

  it("contains all 6 expected role slugs", () => {
    const data = loadRolesData();
    const slugs = data.roles.map((r) => r.slug);
    for (const expected of EXPECTED_SLUGS) {
      expect(slugs, `Missing expected slug: ${expected}`).toContain(expected);
    }
  });

  it("has no duplicate slugs", () => {
    const data = loadRolesData();
    const slugs = data.roles.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("all slugs are URL-safe (lowercase, hyphens only)", () => {
    const data = loadRolesData();
    for (const role of data.roles) {
      expect(
        SLUG_PATTERN.test(role.slug),
        `Slug "${role.slug}" contains invalid characters`,
      ).toBe(true);
    }
  });

  it("all metaTitles are under 80 chars", () => {
    const data = loadRolesData();
    for (const role of data.roles) {
      expect(
        role.metaTitle.length,
        `metaTitle too long for slug "${role.slug}": ${role.metaTitle.length} chars`,
      ).toBeLessThanOrEqual(80);
    }
  });

  it("all metaDescriptions are under 165 chars", () => {
    const data = loadRolesData();
    for (const role of data.roles) {
      expect(
        role.metaDescription.length,
        `metaDescription too long for slug "${role.slug}": ${role.metaDescription.length} chars`,
      ).toBeLessThanOrEqual(165);
    }
  });

  it("all required fields are non-empty strings", () => {
    const data = loadRolesData();
    const requiredStringFields: (keyof RoleEntry)[] = [
      "slug",
      "name",
      "metaTitle",
      "metaDescription",
      "headline",
      "subheadline",
      "typicalWorkflow",
      "timeOnCam",
      "capveriValue",
      "timeSavings",
    ];
    for (const role of data.roles) {
      for (const field of requiredStringFields) {
        expect(
          typeof role[field] === "string" && (role[field] as string).length > 0,
          `Field "${field}" is empty or missing for slug "${role.slug}"`,
        ).toBe(true);
      }
    }
  });

  it("all array fields are non-empty arrays", () => {
    const data = loadRolesData();
    const requiredArrayFields: (keyof RoleEntry)[] = [
      "painPoints",
      "commonErrors",
      "relatedTools",
      "relatedResources",
    ];
    for (const role of data.roles) {
      for (const field of requiredArrayFields) {
        const arr = role[field] as string[];
        expect(
          Array.isArray(arr) && arr.length > 0,
          `Field "${field}" is empty or not an array for slug "${role.slug}"`,
        ).toBe(true);
      }
    }
  });

  it("relatedTools are valid /tools/ paths", () => {
    const data = loadRolesData();
    for (const role of data.roles) {
      for (const tool of role.relatedTools) {
        expect(
          tool.startsWith("/tools/"),
          `Invalid tool path "${tool}" for slug "${role.slug}"`,
        ).toBe(true);
      }
    }
  });

  it("relatedResources are valid internal paths", () => {
    const data = loadRolesData();
    for (const role of data.roles) {
      for (const resource of role.relatedResources) {
        expect(
          resource.startsWith("/"),
          `Invalid resource path "${resource}" for slug "${role.slug}"`,
        ).toBe(true);
      }
    }
  });
});
