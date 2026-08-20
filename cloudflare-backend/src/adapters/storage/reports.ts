/**
 * R2 storage adapter for persisted export reports (C1 sub-slice).
 *
 * Storage-provider convention
 * ───────────────────────────
 * export_history.storage_path stores a scheme-prefixed key so that the
 * re-download endpoint can tell where the object lives without a DB migration:
 *
 *   "r2:<key>"        — object is in REPORTS_BUCKET (this adapter)
 *   "<path>"          — no prefix → legacy Supabase Storage "reports" bucket
 *
 * The helpers parseStoragePath / encodeR2StoragePath implement this convention.
 * Any new export written by the Worker MUST use encodeR2StoragePath().
 * Any row written before this migration (no "r2:" prefix) MUST be served via
 * the Supabase signed-URL fallback in EP-11.
 */

import { ConfigError } from "../../platform/cloudflare";

// ── Provider discriminator ───────────────────────────────────────────────────

export type StorageProvider = "r2" | "supabase";

export type ParsedStoragePath =
  | { provider: "r2"; key: string }
  | { provider: "supabase"; key: string };

/**
 * Encode an R2 object key into the storage_path value stored in export_history.
 * Format: "r2:{key}"
 */
export function encodeR2StoragePath(key: string): string {
  return `r2:${key}`;
}

/**
 * Parse a storage_path from export_history into its provider + key.
 * "r2:..." → { provider: 'r2', key: '...' }
 * anything else → { provider: 'supabase', key: <original value> }
 */
export function parseStoragePath(storagePath: string): ParsedStoragePath {
  if (storagePath.startsWith("r2:")) {
    return { provider: "r2", key: storagePath.slice(3) };
  }
  return { provider: "supabase", key: storagePath };
}

// ── Reports storage adapter ──────────────────────────────────────────────────

export type ReportsStorageEnv = {
  REPORTS_BUCKET?: R2Bucket;
};

export type ReportsStorage = {
  /**
   * Generate a canonical R2 key for a new report.
   * Format: reports/{organizationId}/{propertyId}/{uuid}-{safeFileName}
   */
  generateKey(input: {
    organizationId: string;
    propertyId: string;
    fileName: string;
  }): string;

  putReport(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getReportBytes(key: string): Promise<Uint8Array | undefined>;
  deleteReport(key: string): Promise<void>;
};

export function createReportsStorage(env: ReportsStorageEnv): ReportsStorage {
  if (!env.REPORTS_BUCKET) {
    throw new ConfigError("REPORTS_BUCKET binding is required");
  }
  return new R2ReportsStorage(env.REPORTS_BUCKET);
}

class R2ReportsStorage implements ReportsStorage {
  constructor(private readonly bucket: R2Bucket) {}

  generateKey(input: {
    organizationId: string;
    propertyId: string;
    fileName: string;
  }): string {
    const uuid = crypto.randomUUID();
    const safeFileName = sanitizeFilename(input.fileName);
    return [
      "reports",
      assertPathSegment(input.organizationId, "organizationId"),
      assertPathSegment(input.propertyId, "propertyId"),
      `${uuid}-${safeFileName}`,
    ].join("/");
  }

  async putReport(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    await this.bucket.put(assertObjectKey(key), bytes, {
      httpMetadata: { contentType },
    });
  }

  async getReportBytes(key: string): Promise<Uint8Array | undefined> {
    const object = await this.bucket.get(assertObjectKey(key));
    if (!object) {
      return undefined;
    }
    return new Uint8Array(await object.arrayBuffer());
  }

  async deleteReport(key: string): Promise<void> {
    await this.bucket.delete(assertObjectKey(key));
  }
}

// ── path helpers (mirrors dispute-attachments.ts) ────────────────────────────

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  const safe = trimmed.replace(/[/\\]/gu, "_").replace(/\0/gu, "_");
  if (!safe || safe === "." || safe === "..") {
    return "report.pdf";
  }
  return safe;
}

function assertPathSegment(value: string, name: string): string {
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new TypeError(`${name} must be a single non-empty path segment`);
  }
  return trimmed;
}

function assertObjectKey(key: string): string {
  const trimmed = key.trim();
  const segments = trimmed.split("/");
  if (
    trimmed === "" ||
    trimmed.startsWith("/") ||
    trimmed.endsWith("/") ||
    trimmed.includes("\\") ||
    segments.some((seg) => seg === "" || seg === "." || seg === "..")
  ) {
    throw new TypeError("Report key must be a relative object path");
  }
  return trimmed;
}
