import type { ExtractionModelConfig } from "../../domain/extraction/model-config";
import {
  computeExtractionDiff,
  createEmptyJudgeResult,
  type DiffEntry,
  type FieldVerdict,
  type JudgeResult,
  type JudgeVerdict,
} from "../../domain/extraction/dual-extraction";
import type {
  JsonObject,
  JsonValue,
} from "../../domain/extraction/extraction-service";
import {
  OpenRouterApiError,
  type OpenRouterClient,
  type OpenRouterJsonRequest,
} from "./openrouter";
import { extractJsonObjectText as extractJsonObjectResponseText } from "./json-object-response";

export const JUDGE_SYSTEM_PROMPT =
  "You are an expert commercial real estate lease analyst acting as an arbitration judge. " +
  "You will receive two independent extractions of the same lease document. " +
  "For each field where they disagree, decide which value is correct or whether neither can be trusted.\n\n" +
  "Return ONLY a JSON object with this exact schema:\n" +
  '{"verdicts": [{"field": "<field_name>", "verdict": "primary_wins|sibling_wins|trust_neither", ' +
  '"chosen_value": <value or null>, "rationale": "<one sentence>"}]}\n\n' +
  "Rules:\n" +
  "- Only include fields that appear in the disagreements list\n" +
  "- primary_wins: extraction A's value is correct\n" +
  "- sibling_wins: extraction B's value is correct\n" +
  "- trust_neither: both values are suspect; caller will use a safe default\n" +
  "- Be conservative: prefer trust_neither for financial fields (pro_rata_share, cap_rate, base_year_amount) when uncertain\n" +
  "- For enum fields (cap_type), the only valid values are none, non_cumulative, cumulative, and cumulative_compounding. " +
  "Never choose legacy labels such as LESSER_OF; prefer whichever value matches the valid enum list if the other does not";

export type JudgeClient = Pick<OpenRouterClient, "requestJson">;
export const MAX_JUDGE_EXTRACTION_JSON_CHARS = 20_000;
export const MAX_JUDGE_USER_MESSAGE_CHARS = 60_000;

export class OpenRouterExtractionJudge {
  constructor(
    private readonly client: JudgeClient,
    private readonly config: ExtractionModelConfig,
  ) {}

  async judge(primary: JsonObject, sibling: JsonObject): Promise<JudgeResult> {
    const diff = computeExtractionDiff(primary, sibling);
    if (diff.length === 0) {
      return createEmptyJudgeResult();
    }

    const request: OpenRouterJsonRequest = {
      content: buildJudgeUserMessage(diff, primary, sibling),
      model: this.config.judge.model,
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      temperature: 0,
    };
    if (this.config.judge.fallbackModels.length > 0) {
      request.fallbackModels = this.config.judge.fallbackModels;
    }

    const startedAt = Date.now();
    let response: Awaited<ReturnType<JudgeClient["requestJson"]>>;
    try {
      response = await this.client.requestJson(request);
    } catch (error) {
      return createFailedJudgeTelemetry(
        error,
        diff.length,
        this.config.judge.model,
        Date.now() - startedAt,
      );
    }

    const result = parseJudgeResponse(
      response.content,
      diff.length,
      response.model ?? this.config.judge.model,
      response.tokensUsed,
    );
    result.durationMs = Date.now() - startedAt;
    return result;
  }
}

export function buildJudgeUserMessage(
  diff: DiffEntry[],
  primary: JsonObject,
  sibling: JsonObject,
): string {
  const payload: JsonObject = {
    disagreements: [],
    primary_extraction: compactJudgeExtraction(primary),
    sibling_extraction: compactJudgeExtraction(sibling),
  };
  const disagreements: JsonValue[] = [];
  for (const entry of diff) {
    disagreements.push({
      field: entry.field,
      primary_value: compactJudgeValue(entry.primaryValue ?? null),
      sibling_value: compactJudgeValue(entry.siblingValue ?? null),
    });
    payload.disagreements = disagreements;
    if (JSON.stringify(payload).length > MAX_JUDGE_USER_MESSAGE_CHARS) {
      disagreements.pop();
      const truncatedMarker: JsonObject = {
        field: "_truncated",
        primary_value: null,
        sibling_value: `${diff.length - disagreements.length} disagreements omitted due to judge payload limit`,
      };
      disagreements.push(truncatedMarker);
      if (JSON.stringify(payload).length > MAX_JUDGE_USER_MESSAGE_CHARS) {
        disagreements.pop();
      }
      break;
    }
  }

  return JSON.stringify(payload);
}

export function parseJudgeResponse(
  content: string,
  fieldsJudged: number,
  modelUsed: string,
  tokensUsed: number,
): JudgeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObjectText(content)) as unknown;
  } catch (error) {
    return createFailedJudgeTelemetry(
      new Error(
        `OpenRouter judge response could not be parsed: ${getErrorMessage(error)}`,
      ),
      fieldsJudged,
      modelUsed,
      0,
      tokensUsed,
    );
  }

  if (!isJsonObject(parsed)) {
    return createFailedJudgeTelemetry(
      new Error("OpenRouter judge response was not a JSON object"),
      fieldsJudged,
      modelUsed,
      0,
      tokensUsed,
    );
  }

  const rawVerdicts = parsed.verdicts;
  if (!Array.isArray(rawVerdicts)) {
    return createFailedJudgeTelemetry(
      new Error("OpenRouter judge response did not include verdicts"),
      fieldsJudged,
      modelUsed,
      0,
      tokensUsed,
    );
  }

  const verdicts = rawVerdicts.flatMap(parseFieldVerdict);
  if (fieldsJudged > 0 && verdicts.length === 0) {
    return createFailedJudgeTelemetry(
      new Error("OpenRouter judge response did not include valid verdicts"),
      fieldsJudged,
      modelUsed,
      0,
      tokensUsed,
    );
  }

  return {
    verdicts,
    fieldsJudged,
    modelUsed,
    tokensUsed,
    durationMs: 0,
  };
}

function parseFieldVerdict(value: unknown): FieldVerdict[] {
  if (!isJsonObject(value)) {
    return [];
  }

  const field = typeof value.field === "string" ? value.field.trim() : "";
  if (field === "") {
    return [];
  }

  const verdict = parseJudgeVerdict(value.verdict);
  const fieldVerdict: FieldVerdict = {
    field,
    verdict,
  };

  if (Object.hasOwn(value, "chosen_value")) {
    if (value.chosen_value !== undefined) {
      fieldVerdict.chosenValue = value.chosen_value;
    }
  } else if (Object.hasOwn(value, "chosenValue")) {
    if (value.chosenValue !== undefined) {
      fieldVerdict.chosenValue = value.chosenValue;
    }
  }

  if (typeof value.rationale === "string") {
    fieldVerdict.rationale = value.rationale;
  }

  return [fieldVerdict];
}

function parseJudgeVerdict(value: JsonValue | undefined): JudgeVerdict {
  return value === "primary_wins" || value === "sibling_wins"
    ? value
    : "trust_neither";
}

function omitExtractionAuditMetadata(value: JsonObject): JsonObject {
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key !== "extractions") {
      result[key] = entry;
    }
  }

  return result;
}

function compactJudgeExtraction(value: JsonObject): JsonObject {
  return truncateJsonObject(
    omitExtractionAuditMetadata(value),
    MAX_JUDGE_EXTRACTION_JSON_CHARS,
  );
}

function compactJudgeValue(value: JsonValue): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized.length <= MAX_JUDGE_EXTRACTION_JSON_CHARS) {
    return value;
  }

  return createBoundedPreview(serialized, MAX_JUDGE_EXTRACTION_JSON_CHARS);
}

function truncateJsonObject(value: JsonObject, maxChars: number): JsonObject {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxChars) {
    return value;
  }

  return createBoundedPreview(serialized, maxChars);
}

function createBoundedPreview(
  serialized: string,
  maxChars: number,
): JsonObject {
  let previewChars = Math.max(0, maxChars);
  let result: JsonObject = {
    _truncated: true,
    _original_chars: serialized.length,
    _preview: serialized.slice(0, previewChars),
  };

  while (JSON.stringify(result).length > maxChars && previewChars > 0) {
    const overage = JSON.stringify(result).length - maxChars;
    previewChars = Math.max(0, previewChars - overage);
    result = {
      _truncated: true,
      _original_chars: serialized.length,
      _preview: serialized.slice(0, previewChars),
    };
  }

  return result;
}

export function extractJsonObjectText(content: string): string {
  return extractJsonObjectResponseText(content, "Judge response");
}

function createFailedJudgeTelemetry(
  error: unknown,
  fieldsJudged: number,
  modelUsed: string,
  durationMs: number,
  tokensUsed = 0,
): JudgeResult {
  const result: JudgeResult = {
    verdicts: [
      {
        field: "_judge_error",
        verdict: "trust_neither",
        rationale: getJudgeFailureRationale(error),
      },
    ],
    fieldsJudged,
    modelUsed,
    tokensUsed,
    durationMs,
  };

  return result;
}

function getJudgeFailureRationale(error: unknown): string {
  if (error instanceof OpenRouterApiError && error.status !== undefined) {
    return `OpenRouter judge request failed with ${error.status}`;
  }

  if (error instanceof Error && error.message.trim() !== "") {
    if (error.message.startsWith("OpenRouter judge response")) {
      return error.message;
    }

    return `OpenRouter judge request failed: ${error.message}`;
  }

  return "OpenRouter judge request failed";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return "unknown response parse error";
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
