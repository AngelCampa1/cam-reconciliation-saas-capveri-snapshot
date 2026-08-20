import type { JsonObject, JsonValue } from "./extraction-service";

export const CRITICAL_EXTRACTION_FIELDS = [
  "pro_rata_share",
  "cap_type",
  "cap_rate",
  "base_year",
  "base_year_amount",
] as const;

export type CriticalExtractionField =
  (typeof CRITICAL_EXTRACTION_FIELDS)[number];

export type JudgeVerdict = "primary_wins" | "sibling_wins" | "trust_neither";

export type FieldVerdict = {
  field: string;
  verdict: JudgeVerdict;
  chosenValue?: JsonValue;
  rationale?: string;
};

export type JudgeResult = {
  verdicts: FieldVerdict[];
  fieldsJudged: number;
  modelUsed: string;
  tokensUsed: number;
  durationMs: number;
};

export type DiffEntry = {
  field: string;
  primaryValue: JsonValue | undefined;
  siblingValue: JsonValue | undefined;
};

export type ExtractionStageSuccess = {
  ok: true;
  json: JsonObject;
  model: string;
  tokensUsed: number;
  durationMs: number;
};

export type ExtractionStageFailure = {
  ok: false;
  error: Error;
  model: string;
  tokensUsed?: number;
  durationMs?: number;
};

export type ExtractionStageResult =
  | ExtractionStageSuccess
  | ExtractionStageFailure;

export type DualExtractionTelemetry = {
  primaryJson: JsonObject;
  siblingJson: JsonObject;
  primaryModel: string;
  siblingModel: string;
  primaryTokens: number;
  siblingTokens: number;
  primaryDurationMs: number;
  siblingDurationMs: number;
  primaryFailed: boolean;
  siblingFailed: boolean;
  judgeModel: string;
  judgeTokens: number;
  judgeDurationMs: number;
  fieldsJudged: number;
  judgeVerdicts: FieldVerdict[];
};

export function createEmptyJudgeResult(): JudgeResult {
  return {
    verdicts: [],
    fieldsJudged: 0,
    modelUsed: "",
    tokensUsed: 0,
    durationMs: 0,
  };
}

export function computeExtractionDiff(
  primary: JsonObject,
  sibling: JsonObject,
): DiffEntry[] {
  return computeNestedDiff(primary, sibling);
}

export function mergeDualExtractions(
  primary: JsonObject,
  sibling: JsonObject,
  judgeResult: JudgeResult = createEmptyJudgeResult(),
): JsonObject {
  const merged: JsonObject = {};
  const keys = new Set([...Object.keys(primary), ...Object.keys(sibling)]);

  for (const key of keys) {
    if (key === "extractions") {
      merged[key] = Object.hasOwn(primary, key)
        ? (primary[key] ?? null)
        : (sibling[key] ?? null);
      continue;
    }

    const primaryHasKey = Object.hasOwn(primary, key);
    const siblingHasKey = Object.hasOwn(sibling, key);
    const primaryValue = primary[key];
    const siblingValue = sibling[key];

    if (!primaryHasKey && siblingValue !== undefined) {
      merged[key] = siblingValue;
      continue;
    }

    if (!siblingHasKey && primaryValue !== undefined) {
      merged[key] = primaryValue;
      continue;
    }

    if (jsonValuesEqual(primaryValue, siblingValue)) {
      merged[key] = primaryValue ?? null;
      continue;
    }

    if (isJsonObject(primaryValue) && isJsonObject(siblingValue)) {
      merged[key] = mergeNestedObject(
        key,
        primaryValue,
        siblingValue,
        judgeResult,
      );
      continue;
    }

    merged[key] = resolveDisagreement(
      key,
      primaryValue,
      siblingValue,
      judgeResult,
    );
  }

  return merged;
}

export function mergeExtractionStageResults(
  primary: ExtractionStageResult,
  sibling: ExtractionStageResult,
  judgeResult: JudgeResult = createEmptyJudgeResult(),
): {
  telemetry: DualExtractionTelemetry;
  merged: JsonObject;
} {
  if (!primary.ok && !sibling.ok) {
    throw primary.error;
  }

  const primaryJson = primary.ok ? primary.json : {};
  const siblingJson = sibling.ok ? sibling.json : {};
  const telemetry: DualExtractionTelemetry = {
    primaryJson,
    siblingJson,
    primaryModel: primary.model,
    siblingModel: sibling.model,
    primaryTokens: primary.ok ? primary.tokensUsed : (primary.tokensUsed ?? 0),
    siblingTokens: sibling.ok ? sibling.tokensUsed : (sibling.tokensUsed ?? 0),
    primaryDurationMs: primary.ok
      ? primary.durationMs
      : (primary.durationMs ?? 0),
    siblingDurationMs: sibling.ok
      ? sibling.durationMs
      : (sibling.durationMs ?? 0),
    primaryFailed: !primary.ok,
    siblingFailed: !sibling.ok,
    judgeModel: judgeResult.modelUsed,
    judgeTokens: judgeResult.tokensUsed,
    judgeDurationMs: judgeResult.durationMs,
    fieldsJudged: judgeResult.fieldsJudged,
    judgeVerdicts: judgeResult.verdicts,
  };

  if (!primary.ok) {
    return { telemetry, merged: siblingJson };
  }

  if (!sibling.ok) {
    return { telemetry, merged: primaryJson };
  }

  return {
    telemetry,
    merged: mergeDualExtractions(primaryJson, siblingJson, judgeResult),
  };
}

export function getMissingCriticalFields(
  merged: JsonObject,
): CriticalExtractionField[] {
  return CRITICAL_EXTRACTION_FIELDS.filter((field) => merged[field] == null);
}

export function applyGapFillResult(
  merged: JsonObject,
  field: CriticalExtractionField,
  extracted: JsonObject,
): JsonObject {
  const next = { ...merged };
  const currentValue = next[field];
  const extractedValue = extracted[field];

  if (currentValue == null && extractedValue != null) {
    next[field] = extractedValue;
  }

  return next;
}

function computeNestedDiff(
  primary: JsonObject,
  sibling: JsonObject,
  prefix = "",
): DiffEntry[] {
  const diff: DiffEntry[] = [];
  const keys = new Set([...Object.keys(primary), ...Object.keys(sibling)]);

  for (const key of keys) {
    if (key === "extractions") {
      continue;
    }

    const field = prefix ? `${prefix}.${key}` : key;
    const primaryValue = primary[key];
    const siblingValue = sibling[key];

    if (isJsonObject(primaryValue) && isJsonObject(siblingValue)) {
      diff.push(...computeNestedDiff(primaryValue, siblingValue, field));
      continue;
    }

    if (
      !jsonValuesEqual(
        normalizeComparableValue(primaryValue),
        normalizeComparableValue(siblingValue),
      )
    ) {
      diff.push({
        field,
        primaryValue,
        siblingValue,
      });
    }
  }

  return diff;
}

function mergeNestedObject(
  parentKey: string,
  primary: JsonObject,
  sibling: JsonObject,
  judgeResult: JudgeResult,
): JsonObject {
  const merged: JsonObject = {};
  const keys = new Set([...Object.keys(primary), ...Object.keys(sibling)]);

  for (const key of keys) {
    const dottedKey = `${parentKey}.${key}`;
    const primaryHasKey = Object.hasOwn(primary, key);
    const siblingHasKey = Object.hasOwn(sibling, key);
    const primaryValue = primary[key];
    const siblingValue = sibling[key];

    if (!primaryHasKey && siblingValue !== undefined) {
      merged[key] = siblingValue;
    } else if (!siblingHasKey && primaryValue !== undefined) {
      merged[key] = primaryValue;
    } else if (jsonValuesEqual(primaryValue, siblingValue)) {
      merged[key] = primaryValue ?? null;
    } else if (isJsonObject(primaryValue) && isJsonObject(siblingValue)) {
      merged[key] = mergeNestedObject(
        dottedKey,
        primaryValue,
        siblingValue,
        judgeResult,
      );
    } else {
      merged[key] = resolveDisagreement(
        dottedKey,
        primaryValue,
        siblingValue,
        judgeResult,
        key,
      );
    }
  }

  return merged;
}

function resolveDisagreement(
  field: string,
  primaryValue: JsonValue | undefined,
  siblingValue: JsonValue | undefined,
  judgeResult: JudgeResult,
  fallbackField?: string,
): JsonValue {
  const verdict =
    getVerdict(judgeResult, field) ??
    (fallbackField ? getVerdict(judgeResult, fallbackField) : undefined);

  if (verdict?.verdict === "sibling_wins") {
    return chooseVerdictValue(verdict, siblingValue);
  }

  if (verdict?.verdict === "primary_wins") {
    return chooseVerdictValue(verdict, primaryValue);
  }

  if (verdict?.verdict === "trust_neither") {
    return null;
  }

  return primaryValue ?? null;
}

function chooseVerdictValue(
  verdict: FieldVerdict,
  extractorValue: JsonValue | undefined,
): JsonValue {
  return verdict.chosenValue != null
    ? verdict.chosenValue
    : (extractorValue ?? null);
}

function getVerdict(
  judgeResult: JudgeResult,
  field: string,
): FieldVerdict | undefined {
  return judgeResult.verdicts.find((verdict) => verdict.field === field);
}

function normalizeComparableValue(value: JsonValue | undefined): JsonValue {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(numeric)) {
    return Number(numeric.toFixed(10));
  }

  return trimmed;
}

function jsonValuesEqual(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
