import { ConfigError } from "../../platform/cloudflare";

export type FeedbackScreenshotEnv = {
  DOCUMENTS_BUCKET?: R2Bucket;
};

export type StoredFeedbackScreenshot = {
  key: string;
  contentType: string;
  size: number;
};

export type FeedbackScreenshotStorage = {
  generateKey(input: {
    organizationId: string;
    contentType: string;
    uniqueId?: string;
  }): string;
  validateContentType(contentType: string): boolean;
  validateFileSize(content: { readonly byteLength: number }): boolean;
  putScreenshot(
    key: string,
    content: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<StoredFeedbackScreenshot>;
  getScreenshotBytes(key: string): Promise<Uint8Array | undefined>;
  headScreenshot(key: string): Promise<StoredFeedbackScreenshot | undefined>;
  deleteScreenshot(key: string): Promise<void>;
};

export const MAX_FEEDBACK_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_SCREENSHOT_PREFIX = "feedback/";
const ALLOWED_SCREENSHOT_CONTENT_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function createFeedbackScreenshotStorage(
  env: FeedbackScreenshotEnv,
): FeedbackScreenshotStorage {
  if (!env.DOCUMENTS_BUCKET) {
    throw new ConfigError("DOCUMENTS_BUCKET binding is required");
  }

  return new R2FeedbackScreenshotStorage(env.DOCUMENTS_BUCKET);
}

class R2FeedbackScreenshotStorage implements FeedbackScreenshotStorage {
  constructor(private readonly bucket: R2Bucket) {}

  generateKey(input: {
    organizationId: string;
    contentType: string;
    uniqueId?: string;
  }): string {
    const extension = extensionForContentType(input.contentType);
    const uniqueId = input.uniqueId ?? crypto.randomUUID();

    return [
      FEEDBACK_SCREENSHOT_PREFIX.replace(/\/$/u, ""),
      assertPathSegment(input.organizationId, "organizationId"),
      `${assertPathSegment(uniqueId, "uniqueId")}.${extension}`,
    ].join("/");
  }

  validateContentType(contentType: string): boolean {
    return ALLOWED_SCREENSHOT_CONTENT_TYPES.has(contentType.toLowerCase());
  }

  validateFileSize(content: { readonly byteLength: number }): boolean {
    return content.byteLength <= MAX_FEEDBACK_SCREENSHOT_BYTES;
  }

  async putScreenshot(
    key: string,
    content: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<StoredFeedbackScreenshot> {
    const checkedKey = assertObjectKey(key);
    const bytes =
      content instanceof Uint8Array ? content : new Uint8Array(content);

    if (!this.validateContentType(contentType)) {
      throw new TypeError("Feedback screenshot must be an image");
    }

    if (!this.validateFileSize(bytes)) {
      throw new TypeError("Feedback screenshot exceeds the 5 MB size limit");
    }

    const object = await this.bucket.put(checkedKey, bytes, {
      httpMetadata: { contentType },
    });

    return {
      key: checkedKey,
      contentType,
      size: object.size,
    };
  }

  async getScreenshotBytes(key: string): Promise<Uint8Array | undefined> {
    const object = await this.bucket.get(assertObjectKey(key));

    if (!object) {
      return undefined;
    }

    return new Uint8Array(await object.arrayBuffer());
  }

  async headScreenshot(
    key: string,
  ): Promise<StoredFeedbackScreenshot | undefined> {
    const checkedKey = assertObjectKey(key);
    const object = await this.bucket.head(checkedKey);

    if (!object) {
      return undefined;
    }

    return {
      key: checkedKey,
      contentType:
        object.httpMetadata?.contentType ?? "application/octet-stream",
      size: object.size,
    };
  }

  async deleteScreenshot(key: string): Promise<void> {
    await this.bucket.delete(assertObjectKey(key));
  }
}

function extensionForContentType(contentType: string): string {
  const subtype = contentType.toLowerCase().split("/", 2)[1] ?? "jpeg";

  return assertPathSegment(subtype.replace(/^x-/u, ""), "contentType");
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
    throw new TypeError(
      "Feedback screenshot key must be a relative object path",
    );
  }

  return trimmed;
}
