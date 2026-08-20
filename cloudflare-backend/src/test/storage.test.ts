import { describe, expect, it } from "vitest";
import {
  createDocumentStorage,
  MAX_DOCUMENT_BYTES,
  R2DocumentStorage,
} from "../adapters/storage/documents";
import { ConfigError } from "../platform/cloudflare";

type StoredFakeObject = {
  body: Uint8Array;
  etag: string;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
};

class FakeR2Bucket {
  readonly objects = new Map<string, StoredFakeObject>();
  readonly deletedKeys: string[] = [];

  async put(
    key: string,
    value: Uint8Array | ArrayBuffer | ReadableStream,
    options: R2PutOptions = {},
  ): Promise<R2Object> {
    const body = await bodyToBytes(value);
    const etag = `etag-${this.objects.size + 1}`;
    const httpMetadata = normalizeHttpMetadata(options.httpMetadata);
    this.objects.set(key, {
      body,
      etag,
      ...(httpMetadata ? { httpMetadata } : {}),
      ...(options.customMetadata
        ? { customMetadata: options.customMetadata }
        : {}),
    });

    return fakeObject(key, etag, body.byteLength, httpMetadata);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const object = this.objects.get(key);

    if (!object) {
      return null;
    }

    return {
      ...fakeObject(
        key,
        object.etag,
        object.body.byteLength,
        object.httpMetadata,
      ),
      async arrayBuffer() {
        return object.body.buffer.slice(
          object.body.byteOffset,
          object.body.byteOffset + object.body.byteLength,
        );
      },
    } as unknown as R2ObjectBody;
  }

  async head(key: string): Promise<R2Object | null> {
    const object = this.objects.get(key);

    if (!object) {
      return null;
    }

    return fakeObject(
      key,
      object.etag,
      object.body.byteLength,
      object.httpMetadata,
    );
  }

  async delete(key: string): Promise<void> {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}

function normalizeHttpMetadata(
  httpMetadata: Headers | R2HTTPMetadata | undefined,
): R2HTTPMetadata | undefined {
  if (!httpMetadata) {
    return undefined;
  }

  if (httpMetadata instanceof Headers) {
    const contentType = httpMetadata.get("content-type");

    return contentType ? { contentType } : undefined;
  }

  return httpMetadata;
}

function fakeObject(
  key: string,
  etag: string,
  size: number,
  httpMetadata?: R2HTTPMetadata,
): R2Object {
  return {
    key,
    etag,
    size,
    version: "fake-version",
    uploaded: new Date("2026-06-12T00:00:00Z"),
    httpEtag: `"${etag}"`,
    httpMetadata,
    customMetadata: {},
    range: undefined,
    checksums: {},
    writeHttpMetadata(headers: Headers) {
      if (httpMetadata?.contentType) {
        headers.set("content-type", httpMetadata.contentType);
      }
    },
  } as unknown as R2Object;
}

async function bodyToBytes(
  value: Uint8Array | ArrayBuffer | ReadableStream,
): Promise<Uint8Array> {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  const response = new Response(value);
  return new Uint8Array(await response.arrayBuffer());
}

function createStorageFixture() {
  const bucket = new FakeR2Bucket();
  const storage = new R2DocumentStorage(bucket as unknown as R2Bucket);

  return { bucket, storage };
}

describe("R2 document storage", () => {
  it("requires the DOCUMENTS_BUCKET binding", () => {
    expect(() => createDocumentStorage({})).toThrow(ConfigError);
  });

  it("generates org/property scoped object keys with normalized extensions", () => {
    const { storage } = createStorageFixture();

    expect(
      storage.generateStorageKey({
        organizationId: "org-a",
        propertyId: "property-a",
        filename: "Lease.PDF",
        uniqueId: "document-a",
      }),
    ).toBe("org-a/property-a/document-a.pdf");
    expect(
      storage.generateStorageKey({
        organizationId: "org-a",
        propertyId: "property-a",
        filename: "lease",
        uniqueId: "document-b",
      }),
    ).toBe("org-a/property-a/document-b.pdf");
  });

  it("rejects unsafe key segments and object keys", async () => {
    const { storage } = createStorageFixture();
    const pdf = new TextEncoder().encode("%PDF-1.4");

    expect(() =>
      storage.generateStorageKey({
        organizationId: "../org",
        propertyId: "property-a",
        filename: "lease.pdf",
        uniqueId: "document-a",
      }),
    ).toThrow(TypeError);
    await expect(
      storage.putDocument("/org/property/document.pdf", pdf),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.getDocumentBytes("org/../document.pdf"),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.putDocument("org\\..\\document.pdf", pdf),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.getDocumentBytes("org\\property\\document.pdf"),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.headDocument("org\\property\\document.pdf"),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.deleteDocument("org\\property\\document.pdf"),
    ).rejects.toThrow(TypeError);
  });

  it("validates PDF magic bytes and the 50 MB file-size ceiling", () => {
    const { storage } = createStorageFixture();

    expect(storage.validatePdf(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(
      true,
    );
    expect(storage.validatePdf(new Uint8Array([0x25, 0x50, 0x44]))).toBe(false);
    expect(storage.validateFileSize({ byteLength: MAX_DOCUMENT_BYTES })).toBe(
      true,
    );
    expect(
      storage.validateFileSize({ byteLength: MAX_DOCUMENT_BYTES + 1 }),
    ).toBe(false);
  });

  it("writes documents to R2 with content type and custom metadata", async () => {
    const { bucket, storage } = createStorageFixture();

    const result = await storage.putDocument(
      "org-a/property-a/document-a.pdf",
      new TextEncoder().encode("%PDF-1.4 content"),
      {
        contentType: "application/pdf",
        customMetadata: { original_filename: "lease.pdf" },
      },
    );

    expect(result).toEqual({
      bucket: "DOCUMENTS_BUCKET",
      key: "org-a/property-a/document-a.pdf",
      etag: "etag-1",
      size: 16,
      contentType: "application/pdf",
    });
    expect(
      bucket.objects.get("org-a/property-a/document-a.pdf")?.customMetadata,
    ).toEqual({ original_filename: "lease.pdf" });
  });

  it("rejects non-PDF and oversized document uploads", async () => {
    const { bucket, storage } = createStorageFixture();
    const oversizedPdf = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    oversizedPdf.set([0x25, 0x50, 0x44, 0x46]);

    await expect(
      storage.putDocument(
        "org-a/property-a/document-a.pdf",
        new TextEncoder().encode("not a pdf"),
      ),
    ).rejects.toThrow("Document content must be a PDF");
    await expect(
      storage.putDocument("org-a/property-a/document-b.pdf", oversizedPdf),
    ).rejects.toThrow("Document content exceeds the 50 MB size limit");

    expect(bucket.objects.size).toBe(0);
  });

  it("reads, heads, and deletes documents through the R2 binding", async () => {
    const { bucket, storage } = createStorageFixture();
    await storage.putDocument(
      "org-a/property-a/document-a.pdf",
      new TextEncoder().encode("%PDF-1.4 content"),
    );

    await expect(
      storage.getDocumentBytes("org-a/property-a/document-a.pdf"),
    ).resolves.toEqual(new TextEncoder().encode("%PDF-1.4 content"));
    await expect(
      storage.headDocument(" org-a/property-a/document-a.pdf "),
    ).resolves.toMatchObject({
      key: "org-a/property-a/document-a.pdf",
      etag: "etag-1",
      size: 16,
      contentType: "application/pdf",
    });

    await storage.deleteDocument("org-a/property-a/document-a.pdf");

    expect(bucket.deletedKeys).toEqual(["org-a/property-a/document-a.pdf"]);
    await expect(
      storage.getDocumentBytes("org-a/property-a/document-a.pdf"),
    ).resolves.toBeUndefined();
    await expect(
      storage.headDocument("org-a/property-a/document-a.pdf"),
    ).resolves.toBeUndefined();
  });
});
