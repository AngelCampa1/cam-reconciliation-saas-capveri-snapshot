import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Enumerate all MDX resource files dynamically so coverage grows automatically with new content.
const RESOURCES_DIR = path.join(PROJECT_ROOT, "content/resources");
const BLOG_DIR = path.join(PROJECT_ROOT, "content/blog");
const TARGET_FILES = fs
  .readdirSync(RESOURCES_DIR)
  .filter((f) => f.endsWith(".mdx"))
  .map((f) => `content/resources/${f}`);
const CONTENT_FILES = [
  ...TARGET_FILES,
  ...fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => `content/blog/${f}`),
];

const LEGACY_INTERNAL_SOURCE_IDS = [
  "boma-impact-research",
  "tenant-auditor-research",
  "gl-coding-research",
  "harris-gross-up-research",
];

const RETIRED_EXTERNAL_SOURCE_URLS = [
  "https://floridarevenue.com/property/Pages/default.aspx",
  "https://www.boma.org/BOMA/Research-Resources/BOMA-EER.aspx",
  "https://www.boma.org/BOMA/Research-Resources/Standards/Standards.aspx",
  "https://www.boma.org/BOMA/Standards/Standards_Main.aspx",
  "https://www.fasb.org/page/PageContent?pageId=/standards/702-asc842.html",
  "https://www.fasb.org/page/PageContent?pageId=/standards/conceptual-framework.html",
  "https://www.floir.com/sections/pandc/propertyinsurance",
  "https://www.hcad.org/appeal-your-value/protest-procedures/",
  "https://www.loopnet.com/cre-explained/investing/cam-charges/",
  "https://www.pwc.com/us/en/services/consulting/deals/accounting-advisory/asc-842-lease-accounting.html",
  "https://www.yardi.fr/services/interfaces/become-interface-partner/",
] as const;

describe("resource citation integrity", () => {
  it("does not use legacy internal research source IDs", () => {
    const violations: string[] = [];

    for (const file of CONTENT_FILES) {
      const fullPath = path.join(PROJECT_ROOT, file);
      const source = fs.readFileSync(fullPath, "utf8");

      for (const legacyId of LEGACY_INTERNAL_SOURCE_IDS) {
        const legacyPattern = new RegExp(`\\b${legacyId}\\b`);
        if (legacyPattern.test(source)) {
          violations.push(`${file}: ${legacyId}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not use retired external source URLs that failed live verification", () => {
    const violations: string[] = [];

    for (const file of CONTENT_FILES) {
      const fullPath = path.join(PROJECT_ROOT, file);
      const source = fs.readFileSync(fullPath, "utf8");

      for (const retiredUrl of RETIRED_EXTERNAL_SOURCE_URLS) {
        if (source.includes(retiredUrl)) {
          violations.push(`${file}: ${retiredUrl}`);
        }
      }
    }

    const sourcePage = "src/app/sources/page.tsx";
    const sourcePageContent = fs.readFileSync(
      path.join(PROJECT_ROOT, sourcePage),
      "utf8",
    );
    for (const retiredUrl of RETIRED_EXTERNAL_SOURCE_URLS) {
      if (sourcePageContent.includes(retiredUrl)) {
        violations.push(`${sourcePage}: ${retiredUrl}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("contains required frontmatter fields", () => {
    const REQUIRED_FIELDS = [
      "title:",
      "description:",
      "datePublished:",
      "dateModified:",
      "author:",
      "buttonText:",
      "order:",
    ];
    const violations: string[] = [];

    for (const file of TARGET_FILES) {
      const fullPath = path.join(PROJECT_ROOT, file);
      const source = fs.readFileSync(fullPath, "utf8");

      for (const field of REQUIRED_FIELDS) {
        if (!source.includes(field)) {
          violations.push(`${file}: missing frontmatter field "${field}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps MDX frontmatter FAQ data visible on rendered article pages", () => {
    const pageFiles = [
      "src/app/blog/[slug]/page.tsx",
      "src/app/resources/[slug]/page.tsx",
    ];
    const violations: string[] = [];

    for (const file of pageFiles) {
      const source = fs.readFileSync(path.join(PROJECT_ROOT, file), "utf8");
      if (!source.includes("FrontmatterFAQ") || !source.includes(".faq")) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });
});
