/**
 * Guard: no MDX images with empty alt text.
 * Prevents `![]()` (markdown image with no alt) from being merged.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function getAllMdxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...getAllMdxFiles(full));
    } else if (full.endsWith(".mdx")) {
      files.push(full);
    }
  }
  return files;
}

const CONTENT_DIR = join(process.cwd(), "content");

describe("MDX image alt text audit", () => {
  it("no MDX images have empty alt text (![](...))", () => {
    const mdxFiles = getAllMdxFiles(CONTENT_DIR);
    const violations: string[] = [];

    for (const file of mdxFiles) {
      const content = readFileSync(file, "utf-8");
      if (/!\[\]\(/.test(content)) {
        violations.push(file.replace(CONTENT_DIR, "content"));
      }
    }

    expect(
      violations,
      `MDX files with empty alt text:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });

  it("no MDX <img> tags are missing an alt attribute", () => {
    const mdxFiles = getAllMdxFiles(CONTENT_DIR);
    const violations: string[] = [];

    for (const file of mdxFiles) {
      const content = readFileSync(file, "utf-8");
      // Matches <img without alt= anywhere before the closing >
      if (/<img(?![^>]*\balt=)[^>]*>/i.test(content)) {
        violations.push(file.replace(CONTENT_DIR, "content"));
      }
    }

    expect(
      violations,
      `MDX files with <img> missing alt:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});
