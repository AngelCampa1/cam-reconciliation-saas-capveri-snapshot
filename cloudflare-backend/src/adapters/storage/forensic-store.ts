import type { JsonValue } from "../../domain/extraction/extraction-service";

export const FORENSIC_STAGE_NAMES = [
  "extract_primary",
  "extract_sibling",
  "judge_input",
  "judge_output",
  "gap_filler",
  "validation_reprompt",
  "merged",
] as const;

export type ForensicStageName = (typeof FORENSIC_STAGE_NAMES)[number];

export type ForensicWriteResult =
  | {
      ok: true;
      key: string;
    }
  | {
      ok: false;
      key: string;
      error: Error;
    };

export type ForensicJsonStore = {
  writeJson(
    documentId: string,
    stage: ForensicStageName,
    data: JsonValue,
  ): Promise<ForensicWriteResult>;
};

export class R2ForensicJsonStore implements ForensicJsonStore {
  constructor(private readonly bucket: R2Bucket) {}

  async writeJson(
    documentId: string,
    stage: ForensicStageName,
    data: JsonValue,
  ): Promise<ForensicWriteResult> {
    let key = "";

    try {
      key = forensicSnapshotKey(documentId, stage);
      await this.bucket.put(key, JSON.stringify(data), {
        httpMetadata: { contentType: "application/json" },
      });

      return { ok: true, key };
    } catch (error) {
      return {
        ok: false,
        key,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to write forensic JSON"),
      };
    }
  }
}

const uuidPathSegmentPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function forensicSnapshotKey(
  documentId: string,
  stage: ForensicStageName,
): string {
  return `extractions/raw/${assertUuidLikePathSegment(documentId)}/${stage}.json`;
}

function assertUuidLikePathSegment(value: string): string {
  const trimmed = value.trim();

  if (
    trimmed === "" ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    !uuidPathSegmentPattern.test(trimmed)
  ) {
    throw new TypeError("documentId must be a UUID path segment");
  }

  return trimmed;
}
