import type { JsonObject, JsonValue } from "./extraction-service";

export const CAP_TYPE_NONE = "none";
export const CAP_RECONCILIATION_FIELDS = ["cap_type", "cap_rate"] as const;

export type ValidationIssue = {
  field: string;
  message: string;
  value?: JsonValue;
};

export type ValidationResult = {
  isValid: boolean;
  errors: ValidationIssue[];
};

export function validateExtractionForReprompt(
  extraction: JsonObject,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const capType = normalizeCapType(extraction.cap_type);
  const capRate = extraction.cap_rate;

  if (capType !== CAP_TYPE_NONE && capRate == null) {
    errors.push({
      field: "cap_rate",
      message: `Cap rate is required when cap type is '${capType}'`,
      value: null,
    });
  }

  if (capRate != null && capType === CAP_TYPE_NONE) {
    errors.push({
      field: "cap_type",
      message: `Cap type is required when cap rate is specified (${formatCapRateForMessage(
        capRate,
      )}). Choose cumulative, non_cumulative, or cumulative_compounding.`,
      value: capType,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function fieldsToReconcile(invalidFields: string[]): Set<string> {
  const fields = new Set<string>();
  for (const field of invalidFields) {
    if (field === "cap_type" || field === "cap_rate") {
      for (const capField of CAP_RECONCILIATION_FIELDS) {
        fields.add(capField);
      }
    } else {
      fields.add(field);
    }
  }

  return fields;
}

export function applyValidationRepromptResult(
  merged: JsonObject,
  parsed: JsonObject,
  reconcileFields: Set<string>,
): {
  extraction: JsonObject;
  patchedFields: string[];
} {
  const extraction = { ...merged };
  const patchedFields: string[] = [];

  for (const field of reconcileFields) {
    if (Object.hasOwn(parsed, field)) {
      const value = parsed[field];
      extraction[field] = value === undefined ? null : value;
      patchedFields.push(field);
    }
  }

  return { extraction, patchedFields };
}

function normalizeCapType(value: JsonValue | undefined): string {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().toLowerCase()
    : CAP_TYPE_NONE;
}

function formatCapRateForMessage(value: JsonValue): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    return `${(numeric * 100).toFixed(1)}%`;
  }

  return String(value);
}
