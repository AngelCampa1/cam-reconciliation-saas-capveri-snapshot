import type {
  ExtractionModelConfig,
  ExtractionModelRoute,
} from "../../domain/extraction/model-config";
import type { JsonObject } from "../../domain/extraction/extraction-service";
import {
  applyValidationRepromptResult,
  fieldsToReconcile,
  validateExtractionForReprompt,
  type ValidationIssue,
} from "../../domain/extraction/validation-reprompt";
import { extractJsonObjectText } from "./json-object-response";
import type {
  OpenRouterClient,
  OpenRouterPdfExtractionRequest,
} from "./openrouter";

export const DEFAULT_VALIDATION_REPROMPT_MAX_ATTEMPTS = 2;

const CAP_GROUP_GUIDANCE = [
  "These two fields describe the CAM expense cap and MUST agree:",
  '- cap_type: exactly one of "none", "non_cumulative", "cumulative", "cumulative_compounding".',
  '- cap_rate: the maximum annual increase as a decimal string, for example 5% becomes "0.05", or null.',
  "",
  "Rules:",
  '- If a cap percentage exists, cap_type must NOT be "none"; choose the matching cap_type and keep the cap_rate.',
  '- If there is genuinely no cap, set cap_type to "none" AND cap_rate to null.',
  '- Never return a cap_rate with cap_type "none", and never return a non-none cap_type without a cap_rate.',
].join("\n");

export type ValidationRepromptAttempt = {
  ok: boolean;
  invalidFields: string[];
  reconcileFields: string[];
  patchedFields: string[];
  model: string;
  tokensUsed: number;
  durationMs: number;
  error?: string;
};

export type ValidationRepromptResult = {
  extraction: JsonObject;
  attempted: boolean;
  attempts: ValidationRepromptAttempt[];
  initialErrors: ValidationIssue[];
  modelUsed: string;
  tokensUsed: number;
  durationMs: number;
};

export type ValidationRepromptClient = Pick<OpenRouterClient, "extractPdf">;

export class OpenRouterValidationReprompter {
  constructor(
    private readonly client: ValidationRepromptClient,
    private readonly config: ExtractionModelConfig,
    private readonly maxAttempts = DEFAULT_VALIDATION_REPROMPT_MAX_ATTEMPTS,
  ) {}

  async repromptInvalidFields(
    merged: JsonObject,
    pdfBytes: Uint8Array,
    filename: string,
  ): Promise<ValidationRepromptResult> {
    const startedAt = Date.now();
    let extraction = { ...merged };
    const attempts: ValidationRepromptAttempt[] = [];
    const initialValidation = validateExtractionForReprompt(extraction);

    for (
      let attemptIndex = 0;
      attemptIndex < this.maxAttempts;
      attemptIndex++
    ) {
      const validation = validateExtractionForReprompt(extraction);
      if (validation.isValid) {
        break;
      }

      const attempt = await this.repromptOnce(
        extraction,
        pdfBytes,
        filename,
        validation.errors,
        this.config.validationReprompt,
      );
      attempts.push(attempt);

      if (!attempt.ok || attempt.patchedFields.length === 0) {
        break;
      }

      extraction =
        attempt.extractionUpdate !== undefined
          ? attempt.extractionUpdate
          : extraction;
    }

    return {
      extraction,
      attempted: attempts.length > 0,
      attempts: attempts.map(stripAttemptUpdate),
      initialErrors: initialValidation.errors,
      modelUsed: this.config.validationReprompt.model,
      tokensUsed: attempts.reduce(
        (sum, attempt) => sum + attempt.tokensUsed,
        0,
      ),
      durationMs: Date.now() - startedAt,
    };
  }

  private async repromptOnce(
    merged: JsonObject,
    pdfBytes: Uint8Array,
    filename: string,
    errors: ValidationIssue[],
    route: ExtractionModelRoute,
  ): Promise<ValidationRepromptAttempt & { extractionUpdate?: JsonObject }> {
    const startedAt = Date.now();
    let tokensUsed = 0;
    const invalidFields = [
      ...new Set(errors.map((error) => error.field)),
    ].sort();
    const reconcileFields = fieldsToReconcile(invalidFields);
    const request: OpenRouterPdfExtractionRequest = {
      prompt: buildValidationReprompt(
        invalidFields,
        errors.map((e) => e.message),
      ),
      pdfBytes,
      filename,
      model: route.model,
      temperature: 0,
    };
    if (route.fallbackModels.length > 0) {
      request.fallbackModels = route.fallbackModels;
    }

    try {
      const response = await this.client.extractPdf(request);
      tokensUsed = response.tokensUsed;
      const parsed = parseValidationRepromptJson(response.content);
      const { extraction, patchedFields } = applyValidationRepromptResult(
        merged,
        parsed,
        reconcileFields,
      );

      return {
        ok: true,
        invalidFields,
        reconcileFields: [...reconcileFields].sort(),
        patchedFields,
        model: response.model ?? route.model,
        tokensUsed,
        durationMs: Date.now() - startedAt,
        extractionUpdate: extraction,
      };
    } catch (error) {
      return {
        ok: false,
        invalidFields,
        reconcileFields: [...reconcileFields].sort(),
        patchedFields: [],
        model: route.model,
        tokensUsed,
        durationMs: Date.now() - startedAt,
        error:
          error instanceof Error
            ? error.message
            : "Validation re-prompt failed",
      };
    }
  }
}

export function buildValidationReprompt(
  invalidFields: string[],
  guidance: string[],
): string {
  const fields = [...fieldsToReconcile(invalidFields)].sort();
  const guidanceBlock = guidance.map((message) => `- ${message}`).join("\n");
  const detail =
    fields.includes("cap_type") && fields.includes("cap_rate")
      ? `\n\n${CAP_GROUP_GUIDANCE}`
      : "";
  const keysJson = fields.map((name) => `"${name}": ...`).join(", ");

  return [
    "A previous extraction from this commercial lease PDF produced inconsistent values.",
    "Re-read the lease carefully and reconcile the following fields so they agree with each other and with the document.",
    "",
    "Issues found in the previous extraction:",
    guidanceBlock,
    detail,
    "",
    `Return JSON with exactly these keys: {${keysJson}}`,
    "Use null for a field only when the lease genuinely does not state it.",
    "Do not return any other keys or commentary.",
  ].join("\n");
}

export function parseValidationRepromptJson(content: string): JsonObject {
  const parsed = JSON.parse(
    extractJsonObjectText(content, "Validation re-prompt response"),
  ) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error(
      "OpenRouter validation re-prompt response must be a JSON object",
    );
  }

  return parsed;
}

function stripAttemptUpdate(
  attempt: ValidationRepromptAttempt & { extractionUpdate?: JsonObject },
): ValidationRepromptAttempt {
  const stripped: ValidationRepromptAttempt = {
    ok: attempt.ok,
    invalidFields: attempt.invalidFields,
    reconcileFields: attempt.reconcileFields,
    patchedFields: attempt.patchedFields,
    model: attempt.model,
    tokensUsed: attempt.tokensUsed,
    durationMs: attempt.durationMs,
  };
  if (attempt.error !== undefined) {
    stripped.error = attempt.error;
  }

  return stripped;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
