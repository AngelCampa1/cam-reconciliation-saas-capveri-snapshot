import type { AppEnv } from "../../env";

export const DEFAULT_EXTRACTION_MAX_DOCUMENT_CHARS = 100_000;

export type ExtractionModelRoute = {
  model: string;
  fallbackModels: string[];
};

export type ExtractionModelConfig = {
  primary: ExtractionModelRoute;
  sibling: ExtractionModelRoute;
  judge: ExtractionModelRoute;
  gapFiller: ExtractionModelRoute;
  validationReprompt: ExtractionModelRoute;
  crossDoc: ExtractionModelRoute;
  glAnalysis: ExtractionModelRoute;
  poolMatching: ExtractionModelRoute;
  maxDocumentChars: number;
};

export const DEFAULT_EXTRACTION_MODEL_CONFIG: ExtractionModelConfig = {
  primary: {
    model: "google/gemini-3.1-flash-lite",
    fallbackModels: ["google/gemini-3-flash-preview", "moonshotai/kimi-k2.6"],
  },
  sibling: {
    model: "google/gemini-3.1-flash-lite",
    fallbackModels: ["google/gemini-3-flash-preview", "openai/gpt-5.4-mini"],
  },
  judge: {
    model: "z-ai/glm-5.1",
    fallbackModels: ["openai/gpt-5.4-mini", "moonshotai/kimi-k2.6"],
  },
  gapFiller: {
    model: "google/gemini-3.1-flash-lite",
    fallbackModels: ["google/gemini-3-flash-preview", "moonshotai/kimi-k2.6"],
  },
  validationReprompt: {
    model: "google/gemini-3.1-flash-lite",
    fallbackModels: ["google/gemini-3-flash-preview", "moonshotai/kimi-k2.6"],
  },
  crossDoc: {
    model: "z-ai/glm-5.1",
    fallbackModels: ["openai/gpt-5.4-mini", "moonshotai/kimi-k2.6"],
  },
  glAnalysis: {
    model: "z-ai/glm-5.1",
    fallbackModels: ["openai/gpt-5.4-mini", "moonshotai/kimi-k2.6"],
  },
  poolMatching: {
    model: "moonshotai/kimi-k2.6",
    fallbackModels: ["openai/gpt-5.4-mini", "google/gemini-3-flash-preview"],
  },
  maxDocumentChars: DEFAULT_EXTRACTION_MAX_DOCUMENT_CHARS,
};

export function createExtractionModelConfig(
  env: Partial<AppEnv>,
): ExtractionModelConfig {
  return {
    primary: createRoute(
      env.EXTRACTION_PRIMARY_MODEL,
      [env.EXTRACTION_PRIMARY_FALLBACK, env.EXTRACTION_PRIMARY_FALLBACK_2],
      DEFAULT_EXTRACTION_MODEL_CONFIG.primary,
    ),
    sibling: createRoute(
      env.EXTRACTION_SIBLING_MODEL,
      [env.EXTRACTION_SIBLING_FALLBACK, env.EXTRACTION_SIBLING_FALLBACK_2],
      DEFAULT_EXTRACTION_MODEL_CONFIG.sibling,
    ),
    judge: createRoute(
      env.EXTRACTION_JUDGE_MODEL,
      [env.EXTRACTION_JUDGE_FALLBACK, env.EXTRACTION_JUDGE_FALLBACK_2],
      DEFAULT_EXTRACTION_MODEL_CONFIG.judge,
    ),
    gapFiller: createRoute(
      env.GAP_FILLER_MODEL,
      [env.GAP_FILLER_FALLBACK, env.GAP_FILLER_FALLBACK_2],
      DEFAULT_EXTRACTION_MODEL_CONFIG.gapFiller,
    ),
    validationReprompt: createRoute(
      env.VALIDATION_REPROMPT_MODEL,
      [env.VALIDATION_REPROMPT_FALLBACK, env.VALIDATION_REPROMPT_FALLBACK_2],
      DEFAULT_EXTRACTION_MODEL_CONFIG.validationReprompt,
    ),
    crossDoc: createRoute(
      env.CROSS_DOC_MODEL,
      [env.CROSS_DOC_FALLBACK, env.CROSS_DOC_FALLBACK_2],
      DEFAULT_EXTRACTION_MODEL_CONFIG.crossDoc,
    ),
    glAnalysis: createRoute(
      env.GL_ANALYSIS_MODEL,
      [env.GL_ANALYSIS_FALLBACK, env.GL_ANALYSIS_FALLBACK_2],
      DEFAULT_EXTRACTION_MODEL_CONFIG.glAnalysis,
    ),
    poolMatching: createRoute(
      env.POOL_MATCHING_MODEL,
      [env.POOL_MATCHING_FALLBACK, env.POOL_MATCHING_FALLBACK_2],
      DEFAULT_EXTRACTION_MODEL_CONFIG.poolMatching,
    ),
    maxDocumentChars: parsePositiveInteger(
      env.EXTRACTION_MAX_DOCUMENT_CHARS,
      DEFAULT_EXTRACTION_MODEL_CONFIG.maxDocumentChars,
    ),
  };
}

function createRoute(
  modelOverride: string | undefined,
  fallbackOverrides: Array<string | undefined>,
  defaults: ExtractionModelRoute,
): ExtractionModelRoute {
  return {
    model: normalizeConfigValue(modelOverride) ?? defaults.model,
    fallbackModels: fallbackOverrides
      .map(
        (value, index) =>
          normalizeConfigValue(value) ?? defaults.fallbackModels[index],
      )
      .filter((value): value is string => value !== undefined),
  };
}

function normalizeConfigValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const normalized = normalizeConfigValue(value);
  if (normalized === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
