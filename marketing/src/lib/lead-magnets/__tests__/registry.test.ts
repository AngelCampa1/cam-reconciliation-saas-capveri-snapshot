import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { LEAD_MAGNETS, LEAD_MAGNET_SLUGS } from "@/lib/lead-magnets/registry";

const ROOT = process.cwd();

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function findToolClientFiles(relativeDir = "src/app/tools"): string[] {
  const absoluteDir = join(ROOT, relativeDir);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = join(absoluteDir, entry);
    const relativePath = `${relativeDir}/${entry}`;

    if (statSync(absolutePath).isDirectory()) {
      files.push(...findToolClientFiles(relativePath));
    } else if (entry.endsWith("Client.tsx")) {
      files.push(relativePath);
    }
  }

  return files;
}

describe("lead magnet registry", () => {
  it("contains every backend lead magnet slug", () => {
    const backend = readSource(
      "../backend/app/services/leads/asset_registry.py",
    );
    const backendSlugs = new Set(
      Array.from(backend.matchAll(/"([a-z0-9-]+)": LeadMagnetAsset/g)).map(
        (match) => match[1],
      ),
    );

    expect(LEAD_MAGNET_SLUGS).toEqual(backendSlugs);
    expect(LEAD_MAGNETS).toHaveLength(39);
  });

  it("has a downloadable storage path for every slug", () => {
    for (const asset of LEAD_MAGNETS) {
      expect(asset.storagePath).toMatch(/\.(pdf|xlsx)$/);
    }
  });

  it("keeps every promoted lead capture slug registered", () => {
    const files = [
      "src/components/lead-capture/LeadMagnetExitIntentPopup.tsx",
      ...findToolClientFiles(),
    ];

    const promotedSlugs = new Set<string>();
    for (const file of files) {
      const source = readSource(file);
      for (const match of source.matchAll(/(?:assetSlug|slug)="([^"]+)"/g)) {
        promotedSlugs.add(match[1]);
      }
    }

    for (const slug of promotedSlugs) {
      expect(LEAD_MAGNET_SLUGS.has(slug)).toBe(true);
    }
  });
});
