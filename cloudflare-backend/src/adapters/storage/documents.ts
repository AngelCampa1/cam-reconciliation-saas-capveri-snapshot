import { ConfigError } from "../../platform/cloudflare";

export type DocumentStorageEnv = {
  DOCUMENTS_BUCKET?: R2Bucket;
};

export type DocumentStorageKeyInput = {
  organizationId: string;
  propertyId: string;
  filename: string;
  uniqueId?: string;
};

export type StoredDocument = {
  bucket: "DOCUMENTS_BUCKET";
  key: string;
  etag: string;
  size: number;
  contentType: string;
};

export type DocumentObjectMetadata = {
  readonly contentType?: string;
  readonly customMetadata?: Record<string, string>;
};

export type DocumentStorage = {
  generateStorageKey(input: DocumentStorageKeyInput): string;
  validatePdf(content: Uint8Array): boolean;
  validateFileSize(content: { readonly byteLength: number }): boolean;
  putDocument(
    key: string,
    content: Uint8Array | ArrayBuffer,
    metadata?: DocumentObjectMetadata,
  ): Promise<StoredDocument>;
  getDocumentBytes(key: string): Promise<Uint8Array | undefined>;
  headDocument(key: string): Promise<StoredDocument | undefined>;
  deleteDocument(key: string): Promise<void>;
};

export const PDF_MAGIC_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export function createDocumentStorage(
  env: DocumentStorageEnv,
): DocumentStorage {
  if (!env.DOCUMENTS_BUCKET) {
    throw new ConfigError("DOCUMENTS_BUCKET binding is required");
  }

  return new R2DocumentStorage(env.DOCUMENTS_BUCKET);
}

export class R2DocumentStorage implements DocumentStorage {
  constructor(private readonly bucket: R2Bucket) {}

  generateStorageKey(input: DocumentStorageKeyInput): string {
    const extension = normalizedExtension(input.filename);
    const uniqueId = input.uniqueId ?? crypto.randomUUID();

    return [
      assertPathSegment(input.organizationId, "organizationId"),
      assertPathSegment(input.propertyId, "propertyId"),
      `${assertPathSegment(uniqueId, "uniqueId")}${extension}`,
    ].join("/");
  }

  validatePdf(content: Uint8Array): boolean {
    return PDF_MAGIC_BYTES.every((byte, index) => content[index] === byte);
  }

  validateFileSize(content: { readonly byteLength: number }): boolean {
    return content.byteLength <= MAX_DOCUMENT_BYTES;
  }

  async putDocument(
    key: string,
    content: Uint8Array | ArrayBuffer,
    metadata: DocumentObjectMetadata = {},
  ): Promise<StoredDocument> {
    const checkedKey = assertObjectKey(key);
    const bytes =
      content instanceof Uint8Array ? content : new Uint8Array(content);

    if (!this.validatePdf(bytes)) {
      throw new TypeError("Document content must be a PDF");
    }

    if (!this.validateFileSize(bytes)) {
      throw new TypeError("Document content exceeds the 50 MB size limit");
    }

    const contentType = metadata.contentType ?? "application/pdf";
    const putOptions: R2PutOptions = {
      httpMetadata: { contentType },
    };

    if (metadata.customMetadata) {
      putOptions.customMetadata = metadata.customMetadata;
    }

    const object = await this.bucket.put(checkedKey, bytes, putOptions);

    return {
      bucket: "DOCUMENTS_BUCKET",
      key: checkedKey,
      etag: object.etag,
      size: object.size,
      contentType,
    };
  }

  async getDocumentBytes(key: string): Promise<Uint8Array | undefined> {
    const object = await this.bucket.get(assertObjectKey(key));

    if (!object) {
      return undefined;
    }

    return new Uint8Array(await object.arrayBuffer());
  }

  async headDocument(key: string): Promise<StoredDocument | undefined> {
    const checkedKey = assertObjectKey(key);
    const object = await this.bucket.head(checkedKey);

    if (!object) {
      return undefined;
    }

    return objectSummary(checkedKey, object);
  }

  async deleteDocument(key: string): Promise<void> {
    await this.bucket.delete(assertObjectKey(key));
  }
}

function objectSummary(key: string, object: R2Object): StoredDocument {
  return {
    bucket: "DOCUMENTS_BUCKET",
    key,
    etag: object.etag,
    size: object.size,
    contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
  };
}

function normalizedExtension(filename: string): string {
  const trimmed = filename.trim();
  const lastSlash = Math.max(
    trimmed.lastIndexOf("/"),
    trimmed.lastIndexOf("\\"),
  );
  const basename = trimmed.slice(lastSlash + 1);
  const dotIndex = basename.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === basename.length - 1) {
    return ".pdf";
  }

  return `.${basename.slice(dotIndex + 1).toLowerCase()}`;
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
    throw new TypeError("Document storage key must be a relative object path");
  }

  return trimmed;
}
