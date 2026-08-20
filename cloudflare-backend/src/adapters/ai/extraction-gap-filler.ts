import type {
  ExtractionModelConfig,
  ExtractionModelRoute,
} from "../../domain/extraction/model-config";
import {
  applyGapFillResult,
  getMissingCriticalFields,
  type CriticalExtractionField,
} from "../../domain/extraction/dual-extraction";
import type { JsonObject } from "../../domain/extraction/extraction-service";
import { extractJsonObjectText } from "./json-object-response";
import type {
  OpenRouterClient,
  OpenRouterPdfExtractionRequest,
} from "./openrouter";

export const GAP_FILLER_PROMPTS: Record<CriticalExtractionField, string> = {
  pro_rata_share: [
    "Extract the tenant's pro-rata share (proportionate share) from this commercial lease PDF.",
    "This is the fraction of the total building or project that the tenant occupies,",
    "used to calculate the tenant's share of Common Area Maintenance (CAM) expenses.",
    "Look for phrases such as tenant's proportionate share, pro-rata share,",
    "tenant's percentage share, rentable area ratios, or tenant RSF divided by building RSF.",
    "If the lease states a percentage, convert it to a decimal string.",
    'Return JSON with exactly one key: {"pro_rata_share": "<decimal as string>"}',
    'or {"pro_rata_share": null} if no pro-rata share can be found.',
    "Do not return any other keys or commentary.",
  ].join("\n"),
  cap_type: [
    "Extract the type of CAM expense cap from this commercial lease PDF.",
    "Return only one of these lowercase schema values:",
    '"none" for no cap or only a base year / expense stop,',
    '"cumulative" for a cumulative cap with carry-forward,',
    '"non_cumulative" for a non-cumulative annual cap,',
    '"cumulative_compounding" for a cumulative cap that compounds annually.',
    "Do not return uppercase enum names or unsupported legacy values such as LESSER_OF.",
    'Return JSON with exactly one key: {"cap_type": "non_cumulative"}',
    'or {"cap_type": null} if there is not enough information.',
    "Do not return any other keys or commentary.",
  ].join("\n"),
  cap_rate: [
    "Extract the CAM expense cap rate from this commercial lease PDF.",
    "This is the maximum annual percentage increase allowed for CAM charges or controllable expenses.",
    "Look for phrases such as not to exceed X% per year, controllable expenses shall not increase by more than X%,",
    "cumulative cap of X% per annum, or capped at X% annually.",
    "Express the cap rate as a decimal string, for example 5% per year becomes 0.05.",
    'Return JSON with exactly one key: {"cap_rate": "0.05"}',
    'or {"cap_rate": null} if no cap rate is stated.',
    "Do not return any other keys or commentary.",
  ].join("\n"),
  base_year: [
    "Extract the base year from this commercial lease PDF.",
    "In a base year lease, the tenant pays its pro-rata share of operating expenses above the base year.",
    "Look for base year, expense stop year, base period, or the lease commencement year used for comparisons.",
    "The value must be a four-digit calendar year integer between 1990 and 2100.",
    'Return JSON with exactly one key: {"base_year": 2020}',
    'or {"base_year": null} if no base year is stated.',
    "Do not return any other keys or commentary.",
  ].join("\n"),
  base_year_amount: [
    "Extract the base year expense amount from this commercial lease PDF.",
    "This may be called the expense stop amount, operating expense stop, base rent stop, or base year amount.",
    "If the amount is expressed per square foot, return that per-square-foot amount as a decimal string.",
    "Return a plain decimal string without currency symbols or commas.",
    'Return JSON with exactly one key: {"base_year_amount": "12.50"}',
    'or {"base_year_amount": null} if no base year amount is stated.',
    "Do not return any other keys or commentary.",
  ].join("\n"),
};

export type GapFillAttempt = {
  field: CriticalExtractionField;
  ok: boolean;
  filled: boolean;
  model: string;
  tokensUsed: number;
  durationMs: number;
  extracted?: JsonObject;
  error?: string;
};

export type GapFillResult = {
  extraction: JsonObject;
  missingFields: CriticalExtractionField[];
  filledFields: CriticalExtractionField[];
  attempts: GapFillAttempt[];
  modelUsed: string;
  tokensUsed: number;
  durationMs: number;
};

export type GapFillerClient = Pick<OpenRouterClient, "extractPdf">;

export class OpenRouterExtractionGapFiller {
  constructor(
    private readonly client: GapFillerClient,
    private readonly config: ExtractionModelConfig,
  ) {}

  async fillMissingFields(
    merged: JsonObject,
    pdfBytes: Uint8Array,
    filename: string,
  ): Promise<GapFillResult> {
    const missingFields = getMissingCriticalFields(merged);
    let extraction = { ...merged };
    const attempts: GapFillAttempt[] = [];
    const filledFields: CriticalExtractionField[] = [];
    const startedAt = Date.now();

    for (const field of missingFields) {
      const attempt = await this.fillField(
        field,
        extraction,
        pdfBytes,
        filename,
        this.config.gapFiller,
      );
      attempts.push(attempt);

      if (attempt.filled) {
        filledFields.push(field);
      }

      extraction =
        attempt.ok && attempt.extracted
          ? applyGapFillResult(extraction, field, attempt.extracted)
          : extraction;
    }

    return {
      extraction,
      missingFields,
      filledFields,
      attempts,
      modelUsed: this.config.gapFiller.model,
      tokensUsed: attempts.reduce(
        (sum, attempt) => sum + attempt.tokensUsed,
        0,
      ),
      durationMs: Date.now() - startedAt,
    };
  }

  private async fillField(
    field: CriticalExtractionField,
    merged: JsonObject,
    pdfBytes: Uint8Array,
    filename: string,
    route: ExtractionModelRoute,
  ): Promise<GapFillAttempt> {
    const startedAt = Date.now();
    let tokensUsed = 0;
    const request: OpenRouterPdfExtractionRequest = {
      prompt: GAP_FILLER_PROMPTS[field],
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
      const parsed = parseGapFillJson(response.content);
      const updated = applyGapFillResult(merged, field, parsed);
      return {
        field,
        ok: true,
        filled: updated[field] != null && merged[field] == null,
        model: response.model ?? route.model,
        tokensUsed,
        durationMs: Date.now() - startedAt,
        extracted: parsed,
      };
    } catch (error) {
      return {
        field,
        ok: false,
        filled: false,
        model: route.model,
        tokensUsed,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Gap-fill failed",
      };
    }
  }
}

export function parseGapFillJson(content: string): JsonObject {
  const parsed = JSON.parse(
    extractJsonObjectText(content, "Gap-fill response"),
  ) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error("OpenRouter gap-fill response must be a JSON object");
  }

  return parsed;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
