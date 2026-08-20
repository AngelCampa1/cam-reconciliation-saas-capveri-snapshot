import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import alternativesData from "../../data/alternatives.json";
import comparisonsData from "../../data/comparisons.json";
import contentGovernance from "../../data/seo/content-governance.json";
import governance from "../../data/seo/indexed-page-governance.json";
import llmsSections from "../../data/seo/llms-sections.json";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(PROJECT_ROOT, "..");
const BLOG_DIR = path.join(PROJECT_ROOT, "content", "blog");
const RESOURCES_DIR = path.join(PROJECT_ROOT, "content", "resources");
const PUBLIC_TEXT_DIRS = [
  "content/blog",
  "content/linkedin",
  "content/resources",
  "data",
  "public",
  "src/app",
] as const;
const PUBLIC_PAGE_TEXT_DIRS = [
  "content/blog",
  "content/resources",
  "data",
  "public",
  "src/app",
] as const;
const MARKETING_TEXT_ROOTS = [
  "content",
  "data",
  "docs",
  "e2e",
  "public",
  "scripts",
  "src",
] as const;
const REPO_TEXT_FILES = [
  "plan-tiers.json",
  "docs/feature-inventory/product-marketing-context.md",
] as const;
const SKIPPED_TEXT_DIRS = new Set([
  ".next",
  ".vercel",
  "coverage",
  "dist",
  "node_modules",
]);
const TEXT_FILE_EXTENSION_PATTERN =
  /\.(?:csv|html|json|md|mdx|mjs|py|ts|tsx|txt)$/i;

const VALID_FUNNEL_STAGES = new Set(["tofu", "mofu", "bofu"]);
const VALID_BLOG_CATEGORIES = new Set([
  "cam-errors",
  "compliance",
  "cre-finops",
  "how-to",
  "operations",
  "market-trends",
  "technology",
]);

const PRIORITY_MDX_PAGES = [
  ...llmsSections.blogPosts.map((entry) => `content${entry.path}.mdx`),
  ...llmsSections.keyResources.map((entry) => `content${entry.path}.mdx`),
].filter((filePath) => fs.existsSync(path.join(PROJECT_ROOT, filePath)));

const GSC_PRIORITY_MDX_PAGES = [
  "content/blog/absolute-nnn-lease-explained.mdx",
  "content/blog/best-cam-software-2026.mdx",
  "content/blog/boma-2024-changes.mdx",
  "content/blog/gross-up-clause-lease-explained.mdx",
  "content/blog/triple-net-lease-explained.mdx",
  "content/blog/yardi-cam-recovery-pool-setup.mdx",
  "content/blog/yardi-charge-code-vs-recovery-code.mdx",
  "content/resources/cam-cap-types.mdx",
  "content/resources/cam-gross-up-calculation-guide.mdx",
  "content/resources/double-net-lease-explained.mdx",
  "content/resources/single-net-lease-explained.mdx",
] as const;

const GSC_PRIORITY_ALTERNATIVE_SLUGS = ["appfolio", "outsourced-cam"] as const;

function readMdxFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => path.join(dir, file));
}

function collectPublicTextFiles(relativeDir: string): string[] {
  const dir = path.join(PROJECT_ROOT, relativeDir);
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        return [];
      }
      return collectPublicTextFiles(relativePath);
    }

    if (/\.(?:md|mdx|json|txt|tsx?|html)$/i.test(entry.name)) {
      return [relativePath];
    }

    return [];
  });
}

function collectMarketingTextFiles(relativeDir: string): string[] {
  const dir = path.join(PROJECT_ROOT, relativeDir);
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIPPED_TEXT_DIRS.has(entry.name)) {
        return [];
      }
      return collectMarketingTextFiles(relativePath);
    }

    if (TEXT_FILE_EXTENSION_PATTERN.test(entry.name)) {
      return [relativePath];
    }

    return [];
  });
}

describe("content quality governance", () => {
  // Walks the repository tree, so it runs well past vitest's 15s default
  // whenever the full suite saturates the machine. Given an explicit budget:
  // it passes in ~8s isolated and the work is genuinely filesystem-bound.
  it("does not publish em dashes or mojibake em dashes in marketing text", () => {
    const emDash = String.fromCharCode(0x2014);
    const mojibakeEmDash = String.fromCharCode(0x00e2, 0x20ac, 0x201d);
    const mojibakeEnDash = String.fromCharCode(0x00e2, 0x20ac, 0x201c);
    const escapedEmDash = `${String.raw`\u`}${"2014"}`;
    const escapedMojibakeEmDash = `${String.raw`\u`}${"00e2"}${String.raw`\u`}${"20ac"}${String.raw`\u`}${"201d"}`;
    const escapedMojibakeEnDash = `${String.raw`\u`}${"00e2"}${String.raw`\u`}${"20ac"}${String.raw`\u`}${"201c"}`;
    const violations = MARKETING_TEXT_ROOTS.flatMap(collectMarketingTextFiles)
      .map((relativePath) => ({
        fullPath: path.join(PROJECT_ROOT, relativePath),
        label: relativePath,
      }))
      .concat(
        REPO_TEXT_FILES.map((relativePath) => ({
          fullPath: path.join(REPO_ROOT, relativePath),
          label: relativePath,
        })),
      )
      .filter(({ fullPath, label }) => {
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Missing text governance file: ${label}`);
        }
        const source = fs.readFileSync(fullPath, { encoding: "utf8" });
        return (
          source.includes(emDash) ||
          source.includes(mojibakeEmDash) ||
          source.includes(mojibakeEnDash) ||
          source.includes(escapedEmDash) ||
          source.includes(escapedMojibakeEmDash) ||
          source.includes(escapedMojibakeEnDash)
        );
      })
      .map(({ label }) => label);

    expect(violations).toEqual([]);
  }, 60_000);

  it("does not publish unfinished placeholder markers", () => {
    const markerPattern = /\b(?:TODO|TBD|FIXME|lorem ipsum|coming soon)\b/i;
    const violations = PUBLIC_TEXT_DIRS.flatMap(collectPublicTextFiles).filter(
      (relativePath) => {
        const source = fs.readFileSync(path.join(PROJECT_ROOT, relativePath), {
          encoding: "utf8",
        });
        return markerPattern.test(source);
      },
    );

    expect(violations).toEqual([]);
  });

  it("keeps public page copy aligned to approved CTA and anti-slop terms", () => {
    const forbiddenPatterns = [
      /\bGet Started Free\b/i,
      /\bStart Free Audit\b/i,
      /\brobust\b/i,
      /\bIn today's\b/i,
      /\b60 seconds\b/i,
    ] as const;
    const violations: string[] = [];

    for (const relativePath of PUBLIC_PAGE_TEXT_DIRS.flatMap(
      collectPublicTextFiles,
    )) {
      const source = fs.readFileSync(path.join(PROJECT_ROOT, relativePath), {
        encoding: "utf8",
      });

      for (const pattern of forbiddenPatterns) {
        if (pattern.test(source)) {
          violations.push(`${relativePath}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("requires CapVeri verdict data on every comparison page", () => {
    const comparisonsBySlug = new Map(
      comparisonsData.comparisons.map((comparison) => [
        comparison.slug,
        comparison,
      ]),
    );
    const violations: string[] = [];

    for (const slug of contentGovernance.retainedComparisonSlugs) {
      const comparison = comparisonsBySlug.get(slug);
      if (!comparison) {
        violations.push(`${slug}: missing comparison data`);
      }
    }

    for (const comparison of comparisonsData.comparisons) {
      for (const field of [
        "winnerLabel",
        "winnerSummary",
        "bestForCapveri",
        "bestForCompetitor",
      ] as const) {
        const value = comparison[field];
        if (typeof value !== "string" || value.trim() === "") {
          violations.push(`${comparison.slug}: missing ${field}`);
        }
      }

      if (comparison.winnerLabel !== "CapVeri") {
        violations.push(`${comparison.slug}: winnerLabel must be CapVeri`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("uses only valid funnel stage values in blog and resource frontmatter", () => {
    const violations: string[] = [];

    for (const file of [
      ...readMdxFiles(BLOG_DIR),
      ...readMdxFiles(RESOURCES_DIR),
    ]) {
      const source = fs.readFileSync(file, "utf8");
      const { data } = matter(source);
      if (data.funnelStage && !VALID_FUNNEL_STAGES.has(data.funnelStage)) {
        violations.push(`${path.basename(file)}: ${String(data.funnelStage)}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("uses only known blog categories", () => {
    const violations: string[] = [];

    for (const file of readMdxFiles(BLOG_DIR)) {
      const source = fs.readFileSync(file, "utf8");
      const { data } = matter(source);
      if (!VALID_BLOG_CATEGORIES.has(String(data.category))) {
        violations.push(`${path.basename(file)}: ${String(data.category)}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("requires authorRole on every blog post", () => {
    const violations: string[] = [];

    for (const file of readMdxFiles(BLOG_DIR)) {
      const source = fs.readFileSync(file, "utf8");
      const { data } = matter(source);
      if (
        typeof data.authorRole !== "string" ||
        data.authorRole.trim() === ""
      ) {
        violations.push(`${path.basename(file)}: missing authorRole`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("attributes every blog and resource MDX page to Angel Campa", () => {
    const violations: string[] = [];

    for (const file of [
      ...readMdxFiles(BLOG_DIR),
      ...readMdxFiles(RESOURCES_DIR),
    ]) {
      const source = fs.readFileSync(file, "utf8");
      const { data } = matter(source);
      if (data.author !== "Angel Campa") {
        violations.push(`${path.basename(file)}: ${String(data.author)}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("requires FAQ and Sources coverage on the priority MDX pages", () => {
    const violations: string[] = [];

    for (const relativePath of PRIORITY_MDX_PAGES) {
      const fullPath = path.join(PROJECT_ROOT, relativePath);
      const source = fs.readFileSync(fullPath, "utf8");
      const { data, content } = matter(source);

      if (!Array.isArray(data.faq) || data.faq.length === 0) {
        violations.push(`${relativePath}: missing frontmatter faq`);
      }

      if (!/^## Sources$/m.test(content)) {
        violations.push(`${relativePath}: missing ## Sources section`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps GSC-priority MDX metadata concise and answer-ready", () => {
    const violations: string[] = [];

    for (const relativePath of GSC_PRIORITY_MDX_PAGES) {
      const source = fs.readFileSync(path.join(PROJECT_ROOT, relativePath), {
        encoding: "utf8",
      });
      const { data } = matter(source);

      if (typeof data.title !== "string" || data.title.length > 70) {
        violations.push(`${relativePath}: title must be 70 characters or less`);
      }

      if (
        typeof data.description !== "string" ||
        data.description.length < 120 ||
        data.description.length > 170
      ) {
        violations.push(
          `${relativePath}: description must be 120-170 characters`,
        );
      }

      if (!Array.isArray(data.faq) || data.faq.length < 3) {
        violations.push(`${relativePath}: missing at least 3 FAQ entries`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps GSC-priority alternative pages concise and answer-ready", () => {
    const alternativesBySlug = new Map(
      alternativesData.alternatives.map((alternative) => [
        alternative.slug,
        alternative,
      ]),
    );
    const violations: string[] = [];

    for (const slug of GSC_PRIORITY_ALTERNATIVE_SLUGS) {
      const alternative = alternativesBySlug.get(slug);
      if (!alternative) {
        violations.push(`${slug}: missing alternative page data`);
        continue;
      }

      if (
        typeof alternative.metaTitle !== "string" ||
        alternative.metaTitle.length > 70
      ) {
        violations.push(`${slug}: metaTitle must be 70 characters or less`);
      }

      if (
        typeof alternative.metaDescription !== "string" ||
        alternative.metaDescription.length < 120 ||
        alternative.metaDescription.length > 170
      ) {
        violations.push(`${slug}: metaDescription must be 120-170 characters`);
      }

      if (!Array.isArray(alternative.faqs) || alternative.faqs.length < 4) {
        violations.push(`${slug}: missing at least 4 FAQ entries`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("requires linked Sources sections on every blog and resource MDX page", () => {
    const violations: string[] = [];
    const sourceReferencePattern =
      /^(?:-|\d+\.)\s+.*\[[^\]]+\]\((?:https?:\/\/|\/sources#)[^)]+\)/gm;

    for (const file of [
      ...readMdxFiles(BLOG_DIR),
      ...readMdxFiles(RESOURCES_DIR),
    ]) {
      const source = fs.readFileSync(file, "utf8");
      const { content } = matter(source);
      const sourceSection = content.match(/^## Sources\s*$([\s\S]*)/m);

      if (!sourceSection?.[1]) {
        violations.push(`${path.basename(file)}: missing ## Sources section`);
        continue;
      }

      const references = [...sourceSection[1].matchAll(sourceReferencePattern)];
      if (references.length < 2) {
        violations.push(
          `${path.basename(file)}: needs at least 2 linked source references`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("requires funnel governance metadata on every indexed priority page", () => {
    const violations: string[] = [];

    for (const page of governance.priorityPages) {
      if (typeof page.path !== "string" || !page.path.startsWith("/")) {
        violations.push(`${String(page.path)}: invalid path`);
      }

      if (!VALID_FUNNEL_STAGES.has(page.funnelStage)) {
        violations.push(`${page.path}: invalid funnelStage`);
      }

      for (const field of [
        "primaryIntent",
        "canonicalTopic",
        "primaryCTA",
        "nextStepHref",
        "author",
        "reviewer",
        "updated",
        "sourcesSection",
      ] as const) {
        const value = page[field];
        if (typeof value !== "string" || value.trim() === "") {
          violations.push(`${page.path}: missing ${field}`);
        }
      }

      if (page.citationReady !== true) {
        violations.push(`${page.path}: citationReady must be true`);
      }

      if (
        !Array.isArray(page.parentInternalLinks) ||
        page.parentInternalLinks.length === 0
      ) {
        violations.push(`${page.path}: missing parentInternalLinks`);
      }

      if (
        !Array.isArray(page.childInternalLinks) ||
        page.childInternalLinks.length === 0
      ) {
        violations.push(`${page.path}: missing childInternalLinks`);
      }

      for (const href of [
        ...(page.parentInternalLinks ?? []),
        ...(page.childInternalLinks ?? []),
        page.nextStepHref,
      ]) {
        if (typeof href !== "string" || !href.startsWith("/")) {
          violations.push(
            `${page.path}: invalid internal href ${String(href)}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("assigns exactly one indexed owner to each canonical topic family", () => {
    const canonicalTopics = governance.priorityPages.map(
      (page) => page.canonicalTopic,
    );
    expect(new Set(canonicalTopics).size).toBe(canonicalTopics.length);
  });
});
