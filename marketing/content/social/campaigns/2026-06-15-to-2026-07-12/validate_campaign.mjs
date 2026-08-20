#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const campaignRoot = path.resolve(import.meta.dirname);
const repoRoot = path.resolve(campaignRoot, "../../../../..");
const manifestPath = path.join(campaignRoot, "postiz-import.schedule-ready.json");

const expected = {
  linkedin: {
    count: 84,
    maxLength: 3000,
    integrationId: "cmp1b2s2101fclj0yb8t0botq",
  },
  x: {
    count: 84,
    maxLength: 280,
    integrationId: "cmq5cu40400uxqp0y8ygzgjq4",
  },
};

const blocked = [
  new RegExp(`${String.fromCharCode(0x2014)}|${String.fromCharCode(0x2013)}`),
  /\bin today's\b/i,
  /\bseamless\b/i,
  /\brobust\b/i,
  /\bgame[- ]changing\b/i,
  /\bcutting[- ]edge\b/i,
  /\bleverage\b/i,
  /\bdelve\b/i,
  /\bTODO\b|\bFIXME\b|\bTBD\b/i,
  /\[(?:insert|add|source|stat|citation|link|url|image|visual|graphic|placeholder)[^\]]*\]/i,
  /\{\{[^}]+\}\}/,
];

function fail(message) {
  throw new Error(message);
}

function markdownFiles(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(dir, file));
}

function splitFrontmatter(file) {
  const raw = readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
  if (!match) fail(`${file}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split(/\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    try {
      meta[key] = JSON.parse(rawValue);
    } catch {
      meta[key] = rawValue;
    }
  }
  const body = match[2].replace(/<!--[\s\S]*?-->/g, "").trim();
  return { meta, body };
}

function textFromHtml(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function validatePostFile(file, platform, seen) {
  const { meta, body } = splitFrontmatter(file);
  const id = path.relative(campaignRoot, file);
  if (meta.platform !== platform) fail(`${id}: platform metadata mismatch`);
  if (meta.account !== "capveri") fail(`${id}: account must be capveri`);
  if (meta.review_status !== "reviewed_ready_to_schedule") fail(`${id}: review_status not ready`);
  for (const key of ["humanizer_status", "third_grade_status", "no_em_dash_status", "no_lies_status"]) {
    if (meta[key] !== "passed") fail(`${id}: ${key} must be passed`);
  }
  if (!meta.source_file || !existsSync(path.join(repoRoot, meta.source_file))) fail(`${id}: source_file missing`);
  if (!meta.source_url || !/^https:\/\/www\.capveri\.com\//.test(meta.source_url)) fail(`${id}: source_url missing or not CapVeri`);
  if (!body) fail(`${id}: empty body`);
  if (body.length > expected[platform].maxLength) fail(`${id}: body length ${body.length} exceeds ${expected[platform].maxLength}`);
  for (const pattern of blocked) {
    if (pattern.test(body)) fail(`${id}: blocked pattern ${pattern}`);
  }
  const duplicateKey = body.toLowerCase().replace(/\s+/g, " ").trim();
  if (seen.has(duplicateKey)) fail(`${id}: duplicate body`);
  seen.add(duplicateKey);
}

function validateManifest(filesByPlatform) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest)) fail("manifest must be an array");
  const counts = { linkedin: 0, x: 0 };
  const dateKeys = new Set();
  const start = Date.parse("2026-06-15T00:00:00.000Z");
  const end = Date.parse("2026-07-13T05:00:00.000Z");
  for (const row of manifest) {
    if (!["linkedin", "x"].includes(row.platform)) fail(`${row.id}: invalid platform`);
    counts[row.platform] += 1;
    if (row.integrationId !== expected[row.platform].integrationId) fail(`${row.id}: wrong integrationId`);
    const time = Date.parse(row.date);
    if (!Number.isFinite(time) || time < start || time >= end) fail(`${row.id}: date outside requested window`);
    if (!row.sourcePath || !filesByPlatform[row.platform].has(row.sourcePath)) fail(`${row.id}: sourcePath not found`);
    const text = row.platform === "linkedin" ? textFromHtml(row.content) : String(row.content || "");
    if (text.length > expected[row.platform].maxLength) fail(`${row.id}: manifest content too long`);
    for (const pattern of blocked) {
      if (pattern.test(text)) fail(`${row.id}: manifest blocked pattern ${pattern}`);
    }
    const key = `${row.integrationId}|${new Date(row.date).toISOString()}|${text.toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (dateKeys.has(key)) fail(`${row.id}: duplicate manifest key`);
    dateKeys.add(key);
  }
  for (const [platform, config] of Object.entries(expected)) {
    if (counts[platform] !== config.count) fail(`${platform}: expected ${config.count}, found ${counts[platform]}`);
  }
}

function main() {
  const filesByPlatform = {
    linkedin: new Set(),
    x: new Set(),
  };
  for (const platform of Object.keys(expected)) {
    const dir = path.join(campaignRoot, "posts", platform);
    const files = markdownFiles(dir);
    if (files.length !== expected[platform].count) fail(`${platform}: expected ${expected[platform].count} files, found ${files.length}`);
    const seen = new Set();
    for (const file of files) {
      filesByPlatform[platform].add(path.relative(campaignRoot, file));
      validatePostFile(file, platform, seen);
    }
  }
  validateManifest(filesByPlatform);
  console.log("Campaign validation passed: 84 LinkedIn posts and 84 X posts.");
}

main();
