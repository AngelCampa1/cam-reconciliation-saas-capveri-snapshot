/**
 * Cross-document analysis orchestrator.
 *
 * Mirrors backend/app/services/extraction/cross_doc_orchestrator.py:
 *   1. Assemble property data
 *   2. Check DataAvailability — raise if no verified leases
 *   3. Send to OpenRouter via raw chat() (NOT requestJson — Python uses
 *      client.extract() which is NOT the json_object path; cross-doc prompt
 *      asks Claude to return plain JSON text with no markdown fences)
 *   4. Strip markdown fences (Claude sometimes wraps despite instructions)
 *   5. Parse + validate response
 *   6. Persist result
 *   7. Return CrossDocAnalysisResult
 */

import { DEFAULT_OPENROUTER_PROVIDER_CONFIG } from "../../adapters/ai/openrouter";
import type { OpenRouterClient } from "../../adapters/ai/openrouter";
import type { ExtractionModelRoute } from "../extraction/model-config";
import { buildCrossDocUserMessage, CROSS_DOC_ANALYSIS_PROMPT } from "./prompt";
import type { CrossDocAnalysisRepository } from "./repository";
import type { CrossDocAnalysisResult } from "./types";

export class CrossDocInsufficientDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossDocInsufficientDataError";
  }
}

export class CrossDocValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossDocValidationError";
  }
}

export class CrossDocAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossDocAnalysisError";
  }
}

export async function runCrossDocAnalysis(
  repository: CrossDocAnalysisRepository,
  openRouter: OpenRouterClient,
  modelRoute: ExtractionModelRoute,
  input: {
    propertyId: string;
    periodYear: number;
    organizationId: string;
  },
): Promise<CrossDocAnalysisResult> {
  // 1. Assemble
  const assembled = await repository.assembleCrossDocInput({
    propertyId: input.propertyId,
    periodYear: input.periodYear,
    organizationId: input.organizationId,
  });

  // 2. Check data availability
  if (!assembled.data_availability.has_verified_leases) {
    throw new CrossDocInsufficientDataError(
      `No verified leases for property ${input.propertyId} period ${input.periodYear}. ` +
        "Run lease extraction and HITL verification first.",
    );
  }

  const userMessage = buildCrossDocUserMessage(assembled);

  // 3. Call OpenRouter — raw chat() with NO responseFormat.
  //    Python uses client.extract() which sends a plain text request
  //    (not json_object), then manually parses the JSON response.
  //    We match that exactly by using chat() with no responseFormat.
  let chatResponse;
  try {
    chatResponse = await openRouter.chat({
      model: modelRoute.model,
      temperature: 0.1,
      fallbackModels: modelRoute.fallbackModels,
      // ZDR opt-out + non-China provider allowlist. Required on EVERY LLM call
      // (CLAUDE.md privacy non-negotiable); every other OpenRouter call site
      // sends this. Without it the outbound payload carries no provider block,
      // leaking verified lease data with no zero-data-retention guarantee.
      provider: DEFAULT_OPENROUTER_PROVIDER_CONFIG,
      messages: [
        { role: "system", content: CROSS_DOC_ANALYSIS_PROMPT },
        { role: "user", content: userMessage },
      ],
      // NO responseFormat — plain text JSON, not json_object mode
    });
  } catch (err) {
    throw new CrossDocAnalysisError(
      `OpenRouter API call failed for property ${input.propertyId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 4. Strip markdown code fences (matches Python orchestrator logic verbatim)
  let cleaned = chatResponse.content.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();
  }

  // 5. Parse + validate
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleaned) as Record<string, unknown>;
  } catch (err) {
    throw new CrossDocValidationError(
      `Claude returned invalid JSON: ${err instanceof Error ? err.message : String(err)}\nResponse: ${chatResponse.content.slice(0, 500)}`,
    );
  }

  // Inject token_usage from actual API response; always enforce property_id/period_year
  data["token_usage"] = chatResponse.tokensUsed;
  data["property_id"] = input.propertyId;
  data["period_year"] = input.periodYear;
  normalizeModelFindingIds(data);

  // Validate minimally (shape check)
  if (!isValidCrossDocResult(data)) {
    throw new CrossDocValidationError(
      "Claude response failed schema validation: missing required fields",
    );
  }

  const result: CrossDocAnalysisResult = {
    property_id: input.propertyId,
    period_year: input.periodYear,
    findings: Array.isArray(data["findings"])
      ? (data["findings"] as CrossDocAnalysisResult["findings"])
      : [],
    lease_term_overrides: Array.isArray(data["lease_term_overrides"])
      ? (data[
          "lease_term_overrides"
        ] as CrossDocAnalysisResult["lease_term_overrides"])
      : [],
    overall_risk_score:
      typeof data["overall_risk_score"] === "number"
        ? data["overall_risk_score"]
        : 0,
    analysis_summary:
      typeof data["analysis_summary"] === "string"
        ? data["analysis_summary"]
        : "",
    documents_analyzed:
      data["documents_analyzed"] !== null &&
      typeof data["documents_analyzed"] === "object" &&
      !Array.isArray(data["documents_analyzed"])
        ? (data["documents_analyzed"] as Record<string, number>)
        : {},
    token_usage: chatResponse.tokensUsed,
  };

  // 6. Persist
  await repository.insertAnalysis({
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    periodYear: input.periodYear,
    result: {
      findings: data,
      token_usage: chatResponse.tokensUsed,
    },
  });

  return result;
}

function isValidCrossDocResult(data: Record<string, unknown>): boolean {
  return (
    typeof data["overall_risk_score"] === "number" &&
    typeof data["analysis_summary"] === "string" &&
    Array.isArray(data["findings"])
  );
}

export function normalizeModelFindingIds(data: Record<string, unknown>): void {
  const findings = data["findings"];
  if (!Array.isArray(findings)) {
    return;
  }

  const replacements = new Map<string, string>();
  for (const finding of findings) {
    if (!isRecord(finding)) {
      continue;
    }
    const rawId = finding["id"];
    if (typeof rawId !== "string" || isUuid(rawId)) {
      continue;
    }
    const replacement = crypto.randomUUID();
    finding["id"] = replacement;
    replacements.set(rawId, replacement);
  }

  if (replacements.size === 0) {
    return;
  }

  const overrides = data["lease_term_overrides"];
  if (!Array.isArray(overrides)) {
    return;
  }

  for (const override of overrides) {
    if (!isRecord(override)) {
      continue;
    }
    const findingId = override["finding_id"];
    if (typeof findingId !== "string") {
      continue;
    }
    const replacement = replacements.get(findingId);
    if (replacement !== undefined) {
      override["finding_id"] = replacement;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
