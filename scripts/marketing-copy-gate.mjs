#!/usr/bin/env node
// Marketing copy gate: blocks internal-only jargon from leaking into public-facing copy.
//
// Public-facing copy = text a visitor / user / recipient actually reads: blog & resource
// article bodies, LinkedIn post bodies, rendered marketing page/component strings, visible
// data-driven copy, lead-magnet titles/descriptions, transactional email bodies, and the
// user-facing onboarding / PLG flow.
//
// This gate intentionally does NOT scan: internal docs (docs/, .claude/, .agents/, .codex/,
// cowork-plugins/), build output, tests, internal SEO/link config that uses tofu/mofu/bofu as
// CODE IDENTIFIERS (clusters.ts, contextual-links.ts, indexed-page-governance, pseo, posthog),
// or content frontmatter taxonomy keys. Those are code/metadata, not marketing copy.
//
// Usage:
//   node scripts/marketing-copy-gate.mjs            # scan the default public surface
//   node scripts/marketing-copy-gate.mjs <path...>  # scan specific files/dirs
//
// Exits non-zero (and prints every violation) when banned internal jargon is found.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

// ---------------------------------------------------------------------------
// Banned lexicon
// ---------------------------------------------------------------------------
// STRICT terms: distinctive internal jargon that must never appear in ANY public
// copy. They are multi-word or hyphenated / proper-noun phrases, so they do not
// collide with ordinary code identifiers or legitimate domain language.
const STRICT_TERMS = [
  { label: "internal codename (Sovereign Wedge)", re: /\boperation\s+sovereign\s+wedge\b|\bsovereign\s+wedge\b/i },
  { label: 'internal codename ("Anti-Integration")', re: /\banti[-\s]?integration\b/i },
  { label: "marketing-ops term (lead magnet)", re: /\blead\s+magnets?\b/i },
  { label: "marketing-ops term (gated asset)", re: /\bgated\s+asset\b/i },
  { label: "marketing-ops term (buyer persona)", re: /\bbuyer\s+personas?\b/i },
  { label: "marketing-ops term (content pillar)", re: /\bcontent\s+pillars?\b/i },
  { label: "marketing-ops term (nurture sequence)", re: /\bnurture\s+(sequence|campaign|track|flow)\b/i },
  { label: "marketing-ops term (drip campaign)", re: /\bdrip\s+campaign\b/i },
  { label: "marketing-ops term (win-back)", re: /\bwin[-\s]?back\b/i },
  { label: "marketing-ops term (freemium gate)", re: /\bfreemium\s+gate\b/i },
  { label: "marketing-ops term (top/middle/bottom of funnel)", re: /\b(top|middle|bottom)\s+of[-\s]funnel\b/i },
  { label: "marketing-ops term (funnel stage)", re: /\bfunnel\s+stages?\b/i },
];

// FUNNEL acronyms: banned in prose content (article / post / email bodies) but NOT
// scanned in .ts/.tsx files, where tofu/mofu/bofu are legitimate internal code
// identifiers (SEO cluster types). Word-boundaried + case-insensitive so they catch
// "TOFU", "Tofu", "tofu/mofu/bofu" in sentences but not substrings.
const FUNNEL_ACRONYMS = {
  label: "internal funnel label (TOFU/MOFU/BOFU)",
  re: /\b(tofu|mofu|bofu)\b/i,
};

// ---------------------------------------------------------------------------
// Default public surface
// ---------------------------------------------------------------------------
const PROSE_TARGETS = [
  "marketing/content/blog",
  "marketing/content/resources",
  "backend/app/services/email",
];

// LinkedIn: only PUBLISHED post bodies are public copy. Internal tooling living in the
// same tree (strategy.md, README.md, example_posts.md, *.py generators, qa_report.json,
// review/batch JSON, generated postiz-import payloads) legitimately discusses internal
// architecture and is governed separately by scripts/linkedin-post-review-gate.mjs.
const LINKEDIN_ROOT = "marketing/content/linkedin";
const CODE_COPY_TARGETS = [
  "marketing/src/app",
  "marketing/src/components",
  "marketing/data",
  "marketing/src/lib/lead-magnets/registry.ts",
  "frontend/src/features/plg",
  "frontend/src/features/onboarding",
  "frontend/src/pages/onboard",
];

const SKIP_DIR = new Set([
  "node_modules", ".git", ".next", ".vercel", "dist", "coverage", "__pycache__",
]);

// Files that legitimately use tofu/mofu/bofu or "funnel" as code identifiers / internal
// SEO config — never scanned for the FUNNEL acronyms even under code-copy roots.
const FUNNEL_IDENTIFIER_FILES = [
  "marketing/src/lib/seo/clusters.ts",
  "marketing/src/lib/seo/contextual-links.ts",
  "marketing/src/lib/seo/indexed-page-governance.ts",
  "marketing/src/lib/posthog.ts",
];

// Skip test files and obvious non-copy support files.
function isSkippedFile(rel) {
  if (/\.(test|spec)\.[tj]sx?$/.test(rel)) return true;
  if (/\.d\.ts$/.test(rel)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Visible-text extraction
// ---------------------------------------------------------------------------
function stripFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const m = normalized.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = m ? m[1] : normalized;
  // Strip HTML comments: internal review-trace / annotation notes that never render.
  return body.replace(/<!--[\s\S]*?-->/g, "");
}

// Pull human-facing string copy out of code so we don't flag identifiers. Returns the
// concatenation of: quoted string literals, JSX text nodes, and line comments.
function extractCodeCopy(text) {
  const parts = [];
  const stringLiteral = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = stringLiteral.exec(text))) parts.push(m[2]);
  // JSX text between > and < (best-effort; harmless extra text is fine)
  const jsxText = />([^<>{}]+)</g;
  while ((m = jsxText.exec(text))) parts.push(m[1]);
  // Line + block comments (jargon in a comment is still worth removing from copy files)
  const lineComment = /\/\/[^\n]*/g;
  while ((m = lineComment.exec(text))) parts.push(m[0]);
  const blockComment = /\/\*[\s\S]*?\*\//g;
  while ((m = blockComment.exec(text))) parts.push(m[0]);
  return parts.join("\n");
}

function jsonStringValues(text) {
  // Concatenate JSON string VALUES and array elements but NOT object keys. A key is the
  // only string immediately followed by a colon, so we skip those — that lets data files
  // keep internal identifier keys (e.g. "antiIntegration") while still catching jargon
  // that leaks into reader-facing values (labels, headings, FAQ answers, descriptions).
  const parts = [];
  const re = /"((?:\\.|[^"\\])*)"(\s*:)?/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[2]) continue; // followed by ":" -> object key -> skip
    parts.push(m[1]);
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------
function findTerms(text, { includeFunnelAcronyms }) {
  const hits = [];
  for (const term of STRICT_TERMS) {
    const m = term.re.exec(text);
    if (m) hits.push({ label: term.label, match: m[0] });
  }
  if (includeFunnelAcronyms) {
    const m = FUNNEL_ACRONYMS.re.exec(text);
    if (m) hits.push({ label: FUNNEL_ACRONYMS.label, match: m[0] });
  }
  return hits;
}

function scanFile(absPath) {
  const rel = relative(REPO_ROOT, absPath).replace(/\\/g, "/");
  if (isSkippedFile(rel)) return [];
  const ext = extname(absPath).toLowerCase();
  let text;
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    return [];
  }

  let scanText;
  let includeFunnelAcronyms;
  if (ext === ".mdx" || ext === ".md") {
    scanText = stripFrontmatter(text);
    includeFunnelAcronyms = true;
  } else if (ext === ".py" || ext === ".html" || ext === ".txt") {
    scanText = text;
    includeFunnelAcronyms = true;
  } else if (ext === ".tsx" || ext === ".ts" || ext === ".jsx" || ext === ".js") {
    scanText = extractCodeCopy(text);
    includeFunnelAcronyms = !FUNNEL_IDENTIFIER_FILES.includes(rel);
  } else if (ext === ".json") {
    scanText = jsonStringValues(text);
    includeFunnelAcronyms = false; // taxonomy keys live in JSON; only strict phrases matter
  } else {
    return [];
  }

  return findTerms(scanText, { includeFunnelAcronyms }).map((hit) => ({
    file: rel,
    ...hit,
  }));
}

function walk(absPath) {
  if (!existsSync(absPath)) return [];
  const stats = statSync(absPath);
  if (stats.isFile()) return [absPath];
  return readdirSync(absPath, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIR.has(entry.name)) return [];
    return walk(join(absPath, entry.name));
  });
}

const SCANNABLE_EXT = new Set([
  ".mdx", ".md", ".py", ".html", ".txt", ".tsx", ".ts", ".jsx", ".js", ".json",
]);

// Published LinkedIn post bodies only: markdown files that live under a `posts/`
// directory segment. Excludes strategy/README/generators/QA/batch/export artifacts.
function linkedinPublishedPosts() {
  return walk(resolve(REPO_ROOT, LINKEDIN_ROOT)).filter((f) => {
    const rel = relative(REPO_ROOT, f).replace(/\\/g, "/");
    return rel.endsWith(".md") && /\/posts\//.test(rel);
  });
}

export function scanMarketingCopy(targets) {
  let files;
  if (targets) {
    files = targets
      .flatMap((t) => walk(resolve(REPO_ROOT, t)))
      .filter((f) => SCANNABLE_EXT.has(extname(f).toLowerCase()));
  } else {
    files = [...PROSE_TARGETS, ...CODE_COPY_TARGETS]
      .flatMap((t) => walk(resolve(REPO_ROOT, t)))
      .filter((f) => SCANNABLE_EXT.has(extname(f).toLowerCase()))
      .concat(linkedinPublishedPosts());
  }
  const violations = [];
  for (const file of files) violations.push(...scanFile(file));
  return { fileCount: files.length, violations };
}

export function assertMarketingCopyClean(targets) {
  const { violations } = scanMarketingCopy(targets);
  if (violations.length > 0) {
    const lines = violations.map(
      (v) => `- ${v.file}: ${v.label} -> "${v.match}"`,
    );
    throw new Error(
      `Marketing copy gate failed: internal-only jargon found in public copy:\n${lines.join("\n")}`,
    );
  }
}

function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args : undefined;
  const { fileCount, violations } = scanMarketingCopy(targets);
  console.log(`Marketing copy gate scanned ${fileCount} files.`);
  if (violations.length > 0) {
    console.log(`\nFound ${violations.length} internal-jargon violation(s):`);
    for (const v of violations) console.log(`- ${v.file}: ${v.label} -> "${v.match}"`);
    process.exit(1);
  }
  console.log("No internal-only jargon found in public-facing copy. ✅");
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;
if (invokedDirectly) main();
