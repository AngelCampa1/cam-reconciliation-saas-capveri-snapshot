import type { DocumentStorage } from "../storage/documents";
import type {
  AuditPipelineEventRepository,
  AuditPipelineOutcome,
  AuditPipelineStage,
} from "../db/audit-pipeline-events";
import type {
  ForensicJsonStore,
  ForensicStageName,
} from "../storage/forensic-store";
import {
  OpenRouterExtractionGapFiller,
  type GapFillResult,
  type GapFillerClient,
} from "./extraction-gap-filler";
import {
  OpenRouterValidationReprompter,
  type ValidationRepromptClient,
  type ValidationRepromptResult,
} from "./validation-reprompt";
import {
  OpenRouterExtractionJudge,
  type JudgeClient,
} from "./extraction-judge";
import {
  OpenRouterApiError,
  type OpenRouterClient,
  type OpenRouterPdfExtractionRequest,
} from "./openrouter";
import { extractJsonObjectText } from "./json-object-response";
import type {
  ExtractionModelConfig,
  ExtractionModelRoute,
} from "../../domain/extraction/model-config";
import {
  createEmptyJudgeResult,
  mergeExtractionStageResults,
  type JudgeResult,
  type ExtractionStageResult,
} from "../../domain/extraction/dual-extraction";
import {
  ExtractionTransientError,
  type ExtractionPipeline,
  type ExtractionPipelineInput,
  type ExtractionPipelineResult,
  type JsonObject,
  type JsonValue,
} from "../../domain/extraction/extraction-service";

export const NATIVE_PDF_EXTRACTION_PIPELINE_VERSION =
  "cloudflare-openrouter-dual-native-pdf-v1";

export const MAX_NATIVE_PDF_EXTRACTION_BYTES = 15 * 1024 * 1024;

export const LEASE_NATIVE_PDF_EXTRACTION_PROMPT = `You are an expert commercial real estate analyst extracting CAM (Common Area Maintenance) reconciliation terms from lease documents.

Your task is to extract the following fields from the lease text and return them as valid JSON matching the exact schema below.

**JSON Schema:**

\`\`\`json
{
  "base_year": <integer (1990-2100) or null>,
  "base_year_amount": <decimal or null>,
  "gross_up_base_year": <boolean, default false>,
  "pro_rata_share": <decimal 0-1, REQUIRED>,
  "cap_type": <"none" | "non_cumulative" | "cumulative" | "cumulative_compounding">,
  "cap_rate": <decimal 0-1 or null>,
  "admin_fee_percentage": <decimal 0-0.20 or null>,
  "management_fee_percentage": <decimal 0-0.20 or null>,
  "excluded_pools": <array of pool types: "operating" | "tax" | "insurance" | "capital" | "other">,
  "accounting_basis": <"cash" | "accrual" | null>,
  "extractions": [
    {
      "field": "<field_name>",
      "value": "<extracted_value>",
      "confidence": <integer 0-100>,
      "source_text": "<exact quote from document>",
      "page": <integer page number or null>,
      "bounding_box": <{"left": 0-1, "top": 0-1, "width": 0-1, "height": 0-1} or null>
    }
  ]
}
\`\`\`

**Field Definitions:**

1. **base_year**: The calendar year used as the baseline for expense stop calculations (e.g., 2020). Set to null if not found.

2. **base_year_amount**: A pre-calculated dollar amount frozen as the base year expense (e.g., 50000.00). Set to null if not found.

3. **gross_up_base_year**: Boolean indicating whether to gross-up the base year expenses if occupancy was below 95%. Use false only when the lease says no gross-up applies or does not mention gross-up.

4. **pro_rata_share**: The tenant's proportionate share of expenses as a decimal (REQUIRED field). Examples:
   - "5.25%" → 0.0525
   - "Ten percent" → 0.10
   - "1/20 share" → 0.05

5. **cap_type**: The type of cap applied to annual expense increases. Options:
   - "none": No cap, but only when the lease explicitly says there is no cap, no annual limit, or no ceiling
   - "non_cumulative": Annual cap resets each year (unused capacity lost)
   - "cumulative": Unused capacity carries forward linearly
   - "cumulative_compounding": Exponential growth with banking

6. **cap_rate**: The annual cap rate as a decimal (e.g., "5% annual cap" → 0.05). Required if cap_type is not "none", otherwise null.

7. **admin_fee_percentage**: Administrative fee as a decimal (0-0.20, i.e., 0%-20%). Set to 0 only when the lease explicitly says there is no administrative fee. Set to null when not found.

8. **management_fee_percentage**: The property manager's fee cap expressed as a
   percentage of operating expenses, as a decimal (0-0.20). Set to null if not found.

   **CRITICAL — Management Fee vs Admin Fee** (very common extraction error):
   - \`management_fee_percentage\` = a fee capped as a percentage of operating
     expenses. Use for ANY of: "management fee", "property management fee",
     "management/overhead", "management overhead", "overhead cap", "PM fee",
     "administrative and overhead charge", "admin and overhead charge", or ANY
     phrase that caps a fee as a percentage of operating expenses.
   - \`admin_fee_percentage\` = a flat surcharge added ON TOP of total CAM charges
     (e.g., "15% administrative fee charged on top of all CAM expenses"). This is
     a billing markup, NOT a component of operating expenses.
   - **Example A**: "An administrative and overhead charge equal to 4% of
     operating expenses" → \`management_fee_percentage = 0.04\`,
     \`admin_fee_percentage = 0\`. (A management fee phrased as "administrative and
     overhead" — it is a percentage of operating expenses.)
   - **Example B**: "management/overhead fee not to exceed 4% of operating
     expenses" → \`management_fee_percentage = 0.04\`, \`admin_fee_percentage = 0\`.
   - **Example C**: "Plus Admin Fee 15.00%" or "Administrative Fee 15% of CAM
     total" → \`admin_fee_percentage = 0.15\`, \`management_fee_percentage = null\`.
     (A billing markup added after the CAM subtotal.)
   - **Key distinction**: fee calculated as X% of operating expenses and included
     IN the CAM pool → \`management_fee_percentage\`; surcharge added ON TOP of the
     CAM total (appearing after a subtotal line) → \`admin_fee_percentage\`.
   - **EXCEPTION**: If the text EXPLICITLY labels the charge "Admin Fee",
     "Administrative Fee", or "Administration Fee" AND it appears as an add-on
     line after a CAM subtotal (e.g., "Plus Admin Fee 15%"), always use
     \`admin_fee_percentage\`. Do NOT move an explicit "Admin Fee" into
     \`management_fee_percentage\`.

9. **excluded_pools**: Array of expense pool types excluded from this tenant's recovery. Options: ["operating", "tax", "insurance", "capital", "other"]. Use an empty array only when the lease explicitly says there are no excluded pools or that all listed pools are recoverable.
   - Treat CAM, common area maintenance, utilities, ordinary repairs, ordinary maintenance, management fees, overhead, janitorial, security, snow removal, landscaping, and similar controllable/common-area charges as part of the "operating" pool. If a clause excludes "operating expenses" or "CAM" and then lists those examples, return ["operating"] only; do not add "other" for examples that are merely subcategories of operating expenses.
   - Use "capital" only when the lease explicitly excludes capital expenses, capital expenditures, capital improvements, capital repairs, replacements, improvements, structural work, or similar capitalized costs. Do not classify ordinary repairs or ordinary maintenance as "capital".
   - Use "other" only for excluded categories that are not operating, tax, insurance, or capital (for example marketing fund charges, association dues, or promotional fund assessments).

10. **accounting_basis**: The accounting method for expense recovery. Options:
   - "cash": Expenses recognized when paid (filter by payment date)
   - "accrual": Expenses recognized when incurred (filter by invoice/service date)
   - null: Not specified in the lease (default)
   Look for phrasings like "cash basis", "accrual basis", "cash method", "accrual method", "as incurred", "when paid".

11. **extractions**: Array of extraction details for audit trail. Each extraction must include:
   - field: Name of the field extracted
   - value: The extracted value before normalization
   - confidence: Confidence score 0-100 (see guidelines below)
   - source_text: Exact quote from the lease document
   - page: Page number where the source appears when available
   - bounding_box: Bounding box coordinates when available; otherwise null

**Extraction Guidelines:**

1. **Percentage Conversion**: Always convert percentages to decimals:
   - "5.25%" → 0.0525
   - "Ten percent" → 0.10
   - "Twelve and one-half percent" → 0.125

2. **Fraction Conversion**: Convert fractions to decimals:
   - "1/20" → 0.05
   - "3/4" → 0.75

3. **Cap Type Identification**: Look for these phrasings:
   - "annual limit", "cap", "ceiling" → non_cumulative (unless otherwise specified)
   - "cumulative cap", "banked capacity" → cumulative
   - "compounding cap", "cumulative compounding" → cumulative_compounding

4. **Missing Fields and Explicit Defaults**: If a nullable field is not found or cannot be confidently determined, set it to null. Do not turn unknown financial terms into 0, "none", or [] unless the document explicitly supports that value. If the document explicitly supports a default value, include an \`extractions[]\` entry for that default. Examples:
   - "No cap", "no annual limit", or "no ceiling" → \`cap_type = "none"\`, \`cap_rate = null\`, with a source entry for \`cap_type\`.
   - "No administrative fee" → \`admin_fee_percentage = 0\`, with a source entry for \`admin_fee_percentage\`.
   - "No excluded pools" or "all operating, tax, and insurance expenses are recoverable" → \`excluded_pools = []\`, with a source entry for \`excluded_pools\`.

5. **Source Text**: Include the exact phrase or sentence from the lease that supports each extraction. This is critical for human verification.

6. **Confidence Scoring**:
   - **90-100**: Field is explicitly stated with clear language (e.g., "Pro-rata share: 5.25%")
   - **70-89**: Field can be inferred from context or calculations (e.g., "Tenant's 1,500 SF of 30,000 SF building" → 0.05)
   - **50-69**: Field is ambiguous or requires assumptions
   - **0-49**: Very uncertain, multiple interpretations possible

7. **Required vs Optional**:
   - \`pro_rata_share\` is REQUIRED - you must extract this or return confidence < 50
   - All other fields are optional

**Output Format:**

Return ONLY valid JSON matching the schema above. Do not include markdown code blocks, explanations, or any text outside the JSON structure.`;

export type NativePdfExtractionClient = Pick<OpenRouterClient, "extractPdf">;
export type NativePdfExtractionAiClient = NativePdfExtractionClient &
  JudgeClient &
  GapFillerClient &
  ValidationRepromptClient;

export type ExtractionPipelinePersistence = {
  forensicStore?: ForensicJsonStore;
  auditEvents?: AuditPipelineEventRepository;
};

export type NativePdfExtractionPipelineOptions = {
  route?: ExtractionModelRoute;
  judge?: OpenRouterExtractionJudge;
  gapFiller?: OpenRouterExtractionGapFiller;
  validationReprompter?: OpenRouterValidationReprompter;
  persistence?: ExtractionPipelinePersistence;
};

export class OpenRouterNativePdfExtractionPipeline implements ExtractionPipeline {
  private readonly route: ExtractionModelRoute;
  private readonly judge: OpenRouterExtractionJudge;
  private readonly gapFiller: OpenRouterExtractionGapFiller;
  private readonly validationReprompter: OpenRouterValidationReprompter;
  private readonly persistence: ExtractionPipelinePersistence;

  constructor(
    private readonly storage: DocumentStorage,
    private readonly client: NativePdfExtractionAiClient,
    private readonly config: ExtractionModelConfig,
    options: NativePdfExtractionPipelineOptions = {},
  ) {
    this.route = options.route ?? config.primary;
    this.judge = options.judge ?? new OpenRouterExtractionJudge(client, config);
    this.gapFiller =
      options.gapFiller ?? new OpenRouterExtractionGapFiller(client, config);
    this.validationReprompter =
      options.validationReprompter ??
      new OpenRouterValidationReprompter(client, config);
    this.persistence = options.persistence ?? {};
  }

  async run(input: ExtractionPipelineInput): Promise<ExtractionPipelineResult> {
    const documentHead = await this.storage.headDocument(
      input.documentStorageKey,
    );
    if (!documentHead) {
      throw new ExtractionTransientError(
        `Document metadata not found in R2: ${input.documentStorageKey}`,
      );
    }
    if (documentHead.size > MAX_NATIVE_PDF_EXTRACTION_BYTES) {
      throw new Error(
        `Document exceeds native PDF extraction size limit: ${documentHead.size} bytes`,
      );
    }

    const pdfBytes = await this.storage.getDocumentBytes(
      input.documentStorageKey,
    );

    if (!pdfBytes) {
      throw new ExtractionTransientError(
        `Document bytes not found in R2: ${input.documentStorageKey}`,
      );
    }

    if (!this.storage.validatePdf(pdfBytes)) {
      throw new Error("Document content must be a PDF");
    }

    const filename = filenameFromStorageKey(input.documentStorageKey);
    const dualStartedAt = Date.now();
    const [primary, sibling] = await Promise.all([
      this.runExtractor(this.route, pdfBytes, filename),
      this.runExtractor(this.config.sibling, pdfBytes, filename),
    ]);
    const judgeResult = await this.runJudge(primary, sibling);
    const { telemetry, merged } = mergeExtractionStageResults(
      primary,
      sibling,
      judgeResult,
    );
    const dualDurationMs = Date.now() - dualStartedAt;
    await this.persistDualStageArtifacts(
      input,
      telemetry,
      merged,
      dualDurationMs,
    );

    const gapFill = await this.gapFiller.fillMissingFields(
      merged,
      pdfBytes,
      filename,
    );
    await this.persistGapFillArtifacts(input, gapFill);

    const validationReprompt =
      await this.validationReprompter.repromptInvalidFields(
        gapFill.extraction,
        pdfBytes,
        filename,
      );
    await this.persistValidationRepromptArtifacts(input, validationReprompt);
    await this.writeForensicSnapshot(
      input.documentId,
      "merged",
      validationReprompt.extraction,
    );

    const tokensUsed =
      telemetry.primaryTokens +
      telemetry.siblingTokens +
      telemetry.judgeTokens +
      gapFill.tokensUsed +
      validationReprompt.tokensUsed;

    return {
      tokensUsed,
      extractedFieldNames: Object.keys(validationReprompt.extraction),
      resultData: buildPipelineResultData(
        validationReprompt.extraction,
        telemetry,
        gapFill,
        validationReprompt,
      ),
      documentExtractionResult: buildDocumentExtractionResult(
        validationReprompt.extraction,
        {
          tokensUsed,
          readerJobId: input.jobId,
          primaryModel: telemetry.primaryModel,
          siblingModel: telemetry.siblingModel,
        },
      ),
    };
  }

  private async runExtractor(
    route: ExtractionModelRoute,
    pdfBytes: Uint8Array,
    filename: string,
  ): Promise<ExtractionStageResult> {
    const startedAt = Date.now();
    const models = [route.model, ...route.fallbackModels];
    let tokensUsed = 0;
    let lastError: Error | undefined;
    let lastModel = route.model;

    for (let index = 0; index < models.length; index++) {
      const model = models[index] ?? route.model;
      lastModel = model;
      const request: OpenRouterPdfExtractionRequest = {
        prompt: LEASE_NATIVE_PDF_EXTRACTION_PROMPT,
        pdfBytes,
        filename,
        model,
      };
      const fallbackModels = models.slice(index + 1);
      if (fallbackModels.length > 0) {
        request.fallbackModels = fallbackModels;
      }

      try {
        const response = await this.client.extractPdf(request);
        tokensUsed += response.tokensUsed;
        const resolvedModel = response.model ?? model;
        return {
          ok: true,
          json: parseExtractionJson(response.content),
          model: resolvedModel,
          tokensUsed,
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        const normalizedError = normalizeExtractionError(error);
        if (isExtractionJsonParseError(normalizedError)) {
          lastError = normalizedError;
          continue;
        }

        return {
          ok: false,
          error: normalizedError,
          model,
          tokensUsed,
          durationMs: Date.now() - startedAt,
        };
      }
    }

    return {
      ok: false,
      error: lastError ?? new Error("Extraction failed"),
      model: lastModel,
      tokensUsed,
      durationMs: Date.now() - startedAt,
    };
  }

  private async runJudge(
    primary: ExtractionStageResult,
    sibling: ExtractionStageResult,
  ): Promise<JudgeResult> {
    if (!primary.ok || !sibling.ok) {
      return createEmptyJudgeResult();
    }

    return this.judge.judge(primary.json, sibling.json);
  }

  private async persistDualStageArtifacts(
    input: ExtractionPipelineInput,
    telemetry: JsonObject,
    merged: JsonObject,
    dualDurationMs: number,
  ): Promise<void> {
    await this.writeForensicSnapshot(
      input.documentId,
      "extract_primary",
      telemetry.primaryJson ?? {},
    );
    await this.writeForensicSnapshot(
      input.documentId,
      "extract_sibling",
      telemetry.siblingJson ?? {},
    );
    await this.writeForensicSnapshot(input.documentId, "judge_input", {
      primary_json: omitExtractionAuditMetadata(
        (telemetry.primaryJson ?? {}) as JsonObject,
      ),
      sibling_json: omitExtractionAuditMetadata(
        (telemetry.siblingJson ?? {}) as JsonObject,
      ),
    });
    await this.writeForensicSnapshot(input.documentId, "judge_output", merged);

    await this.emitAuditEvent(input, {
      stage: "extract_primary",
      model: stringValue(telemetry.primaryModel),
      tokensUsed: numberValue(telemetry.primaryTokens),
      durationMs: numberValue(telemetry.primaryDurationMs),
      outcome: telemetry.primaryFailed === true ? "failed" : "success",
    });
    await this.emitAuditEvent(input, {
      stage: "extract_sibling",
      model: stringValue(telemetry.siblingModel),
      tokensUsed: numberValue(telemetry.siblingTokens),
      durationMs: numberValue(telemetry.siblingDurationMs),
      outcome: telemetry.siblingFailed === true ? "failed" : "success",
    });
    await this.emitAuditEvent(input, {
      stage: "judge",
      model: stringValue(telemetry.judgeModel),
      tokensUsed: numberValue(telemetry.judgeTokens),
      durationMs: numberValue(telemetry.judgeDurationMs),
      outcome: "success",
    });
    await this.emitAuditEvent(input, {
      stage: "merge",
      model: "",
      tokensUsed: 0,
      durationMs: dualDurationMs,
      outcome: "success",
    });
  }

  private async persistGapFillArtifacts(
    input: ExtractionPipelineInput,
    gapFill: GapFillResult,
  ): Promise<void> {
    if (gapFill.missingFields.length === 0) {
      return;
    }

    await this.writeForensicSnapshot(
      input.documentId,
      "gap_filler",
      gapFill.extraction,
    );
    await this.emitAuditEvent(input, {
      stage: "gap_filler",
      model: `gap-fill:${gapFill.missingFields.join(",")}`,
      tokensUsed: gapFill.tokensUsed,
      durationMs: gapFill.durationMs,
      outcome: "success",
    });
  }

  private async persistValidationRepromptArtifacts(
    input: ExtractionPipelineInput,
    validationReprompt: ValidationRepromptResult,
  ): Promise<void> {
    if (validationReprompt.tokensUsed <= 0) {
      return;
    }

    await this.writeForensicSnapshot(
      input.documentId,
      "validation_reprompt",
      validationReprompt.extraction,
    );
    await this.emitAuditEvent(input, {
      stage: "validation_reprompt",
      model: validationReprompt.modelUsed,
      tokensUsed: validationReprompt.tokensUsed,
      durationMs: validationReprompt.durationMs,
      outcome: "success",
    });
  }

  private async writeForensicSnapshot(
    documentId: string,
    stage: ForensicStageName,
    data: JsonValue,
  ): Promise<void> {
    try {
      await this.persistence.forensicStore?.writeJson(documentId, stage, data);
    } catch (error) {
      void error;
    }
  }

  private async emitAuditEvent(
    input: ExtractionPipelineInput,
    event: {
      stage: AuditPipelineStage;
      model: string;
      tokensUsed: number;
      durationMs: number;
      outcome: AuditPipelineOutcome;
    },
  ): Promise<void> {
    try {
      await this.persistence.auditEvents?.emit({
        documentId: input.documentId,
        organizationId: input.organizationId,
        ...event,
      });
    } catch (error) {
      void error;
    }
  }
}

export function buildPipelineResultData(
  extraction: JsonObject,
  telemetry: JsonObject,
  gapFill?: GapFillResult,
  validationReprompt?: ValidationRepromptResult,
): JsonObject {
  const result: JsonObject = {
    pipeline: NATIVE_PDF_EXTRACTION_PIPELINE_VERSION,
    extraction,
    dual_extraction: telemetry,
  };
  if (gapFill !== undefined) {
    result.gap_filler = buildGapFillTelemetry(gapFill);
  }
  if (validationReprompt !== undefined) {
    result.validation_reprompt =
      buildValidationRepromptTelemetry(validationReprompt);
  }

  return result;
}

export type DocumentExtractionMeta = {
  tokensUsed: number;
  readerJobId: string;
  primaryModel: string;
  siblingModel: string;
};

/**
 * Build the frontend-facing extraction payload written to
 * `documents.extraction_result`. Faithful port of the FastAPI backend's
 * `_build_extraction_payload` (backend/app/services/extraction/processor.py):
 *   - `profile` is the merged extraction with the `extractions` audit array removed
 *   - `confidence_scores[field]` is the audit confidence scaled to 0-1 (÷ 100)
 *   - `source_references[]` mirrors each audit entry with `confidence` scaled to
 *     0-1 and the raw snake_case `bounding_box` exposed as camelCase `boundingBox`
 *   - `_meta` records the dual-extract provenance
 */
export function buildDocumentExtractionResult(
  extraction: JsonObject,
  meta: DocumentExtractionMeta,
): JsonObject {
  const profile: JsonObject = {};
  for (const [key, value] of Object.entries(extraction)) {
    if (key !== "extractions") {
      profile[key] = value;
    }
  }

  const auditEntries = readExtractionAuditEntries(extraction.extractions);
  const confidenceScores: JsonObject = {};
  const sourceReferences: JsonObject[] = [];
  for (const entry of auditEntries) {
    const field = stringValue(entry.field);
    const confidence = numberValue(entry.confidence) / 100;
    confidenceScores[field] = confidence;
    sourceReferences.push({
      field,
      value: entry.value ?? null,
      text: entry.source_text ?? null,
      source_text: entry.source_text ?? null,
      confidence,
      page: entry.page ?? null,
      boundingBox: entry.bounding_box ?? null,
    });
  }

  return {
    profile,
    confidence_scores: confidenceScores,
    source_references: sourceReferences,
    _meta: {
      pipeline: "dual-extract",
      provider: "openrouter",
      primary_model: meta.primaryModel,
      sibling_model: meta.siblingModel,
      reader_job_id: meta.readerJobId,
      tokens_used: meta.tokensUsed,
    },
  };
}

function readExtractionAuditEntries(
  value: JsonValue | undefined,
): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: JsonObject[] = [];
  for (const item of value) {
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      entries.push(item);
    }
  }

  return entries;
}

function buildGapFillTelemetry(gapFill: GapFillResult): JsonObject {
  return {
    missingFields: gapFill.missingFields,
    filledFields: gapFill.filledFields,
    model: gapFill.modelUsed,
    tokensUsed: gapFill.tokensUsed,
    durationMs: gapFill.durationMs,
    attempts: gapFill.attempts.map((attempt) => {
      const entry: JsonObject = {
        field: attempt.field,
        ok: attempt.ok,
        filled: attempt.filled,
        model: attempt.model,
        tokensUsed: attempt.tokensUsed,
        durationMs: attempt.durationMs,
      };
      if (attempt.error !== undefined) {
        entry.error = attempt.error;
      }

      return entry;
    }),
  };
}

function buildValidationRepromptTelemetry(
  validationReprompt: ValidationRepromptResult,
): JsonObject {
  return {
    attempted: validationReprompt.attempted,
    initialErrors: validationReprompt.initialErrors,
    model: validationReprompt.modelUsed,
    tokensUsed: validationReprompt.tokensUsed,
    durationMs: validationReprompt.durationMs,
    attempts: validationReprompt.attempts,
  };
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

function stringValue(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: JsonValue | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  // Weaker fallback models sometimes emit numeric fields (e.g. confidence) as
  // strings. The Python pipeline parses these through Pydantic int/float
  // fields, which coerce numeric strings; mirror that here so a stringified
  // "95" does not silently collapse to 0.
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function parseExtractionJson(content: string): JsonObject {
  const parsed = JSON.parse(
    extractJsonObjectText(content, "OpenRouter extraction response"),
  ) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error("OpenRouter extraction response must be a JSON object");
  }

  return parsed;
}

export function filenameFromStorageKey(storageKey: string): string {
  const filename = storageKey.split("/").filter(Boolean).at(-1);
  return filename ?? "lease.pdf";
}

function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}

function normalizeExtractionError(error: unknown): Error {
  if (isTransientOpenRouterError(error)) {
    return new ExtractionTransientError(
      error instanceof Error ? error.message : "OpenRouter request failed",
      error,
    );
  }

  return error instanceof Error ? error : new Error("Extraction failed");
}

function isExtractionJsonParseError(error: Error): boolean {
  return (
    error.message.startsWith(
      "OpenRouter extraction response did not contain a JSON object",
    ) ||
    error.message.startsWith(
      "OpenRouter extraction response must be a JSON object",
    )
  );
}

function isTransientOpenRouterError(error: unknown): boolean {
  if (error instanceof OpenRouterApiError) {
    return (
      error.status === 408 ||
      error.status === 429 ||
      error.status === undefined ||
      error.status >= 500
    );
  }

  return error instanceof TypeError;
}
