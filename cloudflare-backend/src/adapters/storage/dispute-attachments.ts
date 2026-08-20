import { ConfigError } from "../../platform/cloudflare";

export type DisputeAttachmentEnv = {
  DOCUMENTS_BUCKET?: R2Bucket;
};

export const MAX_DISPUTE_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_DISPUTE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export type DisputeAttachmentStorage = {
  generateKey(input: {
    organizationId: string;
    disputeId: string;
    filename: string;
  }): string;
  validateContentType(contentType: string): boolean;
  validateFileSize(size: number): boolean;
  putAttachment(
    key: string,
    content: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<void>;
  getAttachmentBytes(key: string): Promise<Uint8Array | undefined>;
  deleteAttachment(key: string): Promise<void>;
};

export function createDisputeAttachmentStorage(
  env: DisputeAttachmentEnv,
): DisputeAttachmentStorage {
  if (!env.DOCUMENTS_BUCKET) {
    throw new ConfigError("DOCUMENTS_BUCKET binding is required");
  }
  return new R2DisputeAttachmentStorage(env.DOCUMENTS_BUCKET);
}

class R2DisputeAttachmentStorage implements DisputeAttachmentStorage {
  constructor(private readonly bucket: R2Bucket) {}

  generateKey(input: {
    organizationId: string;
    disputeId: string;
    filename: string;
  }): string {
    const uniqueId = crypto.randomUUID();
    const safeFilename = sanitizeFilename(input.filename);
    // Key order mirrors FastAPI: {organizationId}/disputes/{disputeId}/{uuid}/{filename}
    return [
      assertPathSegment(input.organizationId, "organizationId"),
      "disputes",
      assertPathSegment(input.disputeId, "disputeId"),
      assertPathSegment(uniqueId, "uniqueId"),
      safeFilename,
    ].join("/");
  }

  validateContentType(contentType: string): boolean {
    return ALLOWED_DISPUTE_MIME_TYPES.has(contentType.toLowerCase());
  }

  validateFileSize(size: number): boolean {
    return size <= MAX_DISPUTE_ATTACHMENT_BYTES;
  }

  async putAttachment(
    key: string,
    content: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    const bytes =
      content instanceof Uint8Array ? content : new Uint8Array(content);
    await this.bucket.put(assertObjectKey(key), bytes, {
      httpMetadata: { contentType },
    });
  }

  async getAttachmentBytes(key: string): Promise<Uint8Array | undefined> {
    const object = await this.bucket.get(assertObjectKey(key));
    if (!object) {
      return undefined;
    }
    return new Uint8Array(await object.arrayBuffer());
  }

  async deleteAttachment(key: string): Promise<void> {
    await this.bucket.delete(assertObjectKey(key));
  }
}

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  // Replace slashes, backslashes, and null bytes with underscores
  const safe = trimmed.replace(/[/\\]/gu, "_").replace(/\0/gu, "_");
  // Enforce non-empty
  if (!safe || safe === "." || safe === "..") {
    return "attachment";
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
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new TypeError("Attachment key must be a relative object path");
  }
  return trimmed;
}
