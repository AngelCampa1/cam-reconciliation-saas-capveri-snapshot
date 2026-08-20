import { describe, expect, it } from "vitest";
import {
  applyGapFillResult,
  computeExtractionDiff,
  createEmptyJudgeResult,
  getMissingCriticalFields,
  mergeDualExtractions,
  mergeExtractionStageResults,
  type ExtractionStageResult,
  type JudgeResult,
} from "../domain/extraction/dual-extraction";
import type { JsonObject } from "../domain/extraction/extraction-service";

const primaryModel = "google/gemini-3.1-flash-lite";
const siblingModel = "google/gemini-3.1-flash-lite";

function success(
  json: JsonObject,
  model = primaryModel,
): ExtractionStageResult {
  return {
    ok: true,
    json,
    model,
    tokensUsed: 100,
    durationMs: 250,
  };
}

function failure(message: string, model = primaryModel): ExtractionStageResult {
  return {
    ok: false,
    error: new Error(message),
    model,
  };
}

describe("computeExtractionDiff", () => {
  it("normalizes numeric strings and ignores extraction audit metadata", () => {
    expect(
      computeExtractionDiff(
        {
          pro_rata_share: "12.50000000001",
          cap_type: " cumulative ",
          missing_from_sibling: null,
          extractions: [{ field: "ignored" }],
        },
        {
          pro_rata_share: 12.5,
          cap_type: "cumulative",
          extractions: [{ field: "different but ignored" }],
        },
      ),
    ).toEqual([]);
  });

  it("returns dotted paths for nested disagreements", () => {
    expect(
      computeExtractionDiff(
        { billing: { base_year: 2023, cap_rate: 5 } },
        { billing: { base_year: 2024, cap_rate: 5 } },
      ),
    ).toEqual([
      {
        field: "billing.base_year",
        primaryValue: 2023,
        siblingValue: 2024,
      },
    ]);
  });

  it("does not diff equal list values by reference identity", () => {
    expect(
      computeExtractionDiff(
        { source_references: ["page 1", "page 2"] },
        { source_references: ["page 1", "page 2"] },
      ),
    ).toEqual([]);
  });
});

describe("mergeDualExtractions", () => {
  it("applies judge verdicts and falls open to primary when verdicts are absent", () => {
    const judge: JudgeResult = {
      verdicts: [
        {
          field: "cap_type",
          verdict: "sibling_wins",
          chosenValue: "cumulative",
        },
        {
          field: "cap_rate",
          verdict: "trust_neither",
        },
      ],
      fieldsJudged: 3,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 17,
      durationMs: 42,
    };

    expect(
      mergeDualExtractions(
        {
          tenant_name: "Acme",
          cap_type: "none",
          cap_rate: 5,
          base_year: 2023,
          extractions: [{ field: "primary-audit" }],
        },
        {
          tenant_name: "Acme",
          cap_type: "cumulative",
          cap_rate: 7,
          base_year: 2024,
          sibling_only: "kept",
          extractions: [{ field: "sibling-audit" }],
        },
        judge,
      ),
    ).toEqual({
      tenant_name: "Acme",
      cap_type: "cumulative",
      cap_rate: null,
      base_year: 2023,
      sibling_only: "kept",
      extractions: [{ field: "primary-audit" }],
    });
  });

  it("uses dotted nested verdicts before plain field verdicts", () => {
    const judge: JudgeResult = {
      verdicts: [
        {
          field: "base_year",
          verdict: "primary_wins",
        },
        {
          field: "billing.base_year",
          verdict: "sibling_wins",
          chosenValue: 2024,
        },
      ],
      fieldsJudged: 1,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 8,
      durationMs: 42,
    };

    expect(
      mergeDualExtractions(
        { billing: { base_year: 2023, cap_rate: 5 } },
        { billing: { base_year: 2025, cap_rate: 5 } },
        judge,
      ),
    ).toEqual({ billing: { base_year: 2024, cap_rate: 5 } });
  });

  it("preserves primary extraction audit metadata even when it is null", () => {
    expect(
      mergeDualExtractions(
        { tenant_name: "Acme", extractions: null },
        {
          tenant_name: "Acme",
          extractions: [{ field: "sibling-audit" }],
        },
      ),
    ).toEqual({
      tenant_name: "Acme",
      extractions: null,
    });
  });

  it("uses extractor values when judge chosenValue is null", () => {
    const judge: JudgeResult = {
      verdicts: [
        {
          field: "cap_type",
          verdict: "sibling_wins",
          chosenValue: null,
        },
        {
          field: "cap_rate",
          verdict: "primary_wins",
          chosenValue: null,
        },
      ],
      fieldsJudged: 2,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 10,
      durationMs: 42,
    };

    expect(
      mergeDualExtractions(
        { cap_type: "none", cap_rate: 5 },
        { cap_type: "cumulative", cap_rate: 7 },
        judge,
      ),
    ).toEqual({ cap_type: "cumulative", cap_rate: 5 });
  });
});

describe("mergeExtractionStageResults", () => {
  it("uses the surviving extractor without judging when one side fails", () => {
    const siblingJson = { tenant_name: "Acme", cap_type: "none" };

    expect(
      mergeExtractionStageResults(
        failure("primary unavailable"),
        success(siblingJson, siblingModel),
      ),
    ).toEqual({
      telemetry: {
        primaryJson: {},
        siblingJson,
        primaryModel,
        siblingModel,
        primaryTokens: 0,
        siblingTokens: 100,
        primaryDurationMs: 0,
        siblingDurationMs: 250,
        primaryFailed: true,
        siblingFailed: false,
        judgeModel: "",
        judgeTokens: 0,
        judgeDurationMs: 0,
        fieldsJudged: 0,
        judgeVerdicts: [],
      },
      merged: siblingJson,
    });
  });

  it("raises the primary extractor failure when both extractors fail", () => {
    expect(() =>
      mergeExtractionStageResults(
        failure("primary failed"),
        failure("sibling failed", siblingModel),
      ),
    ).toThrow("primary failed");
  });

  it("treats an empty judge result as fail-open primary fallback", () => {
    expect(
      mergeExtractionStageResults(
        success({ cap_rate: 5 }),
        success({ cap_rate: 7 }, siblingModel),
        createEmptyJudgeResult(),
      ).merged,
    ).toEqual({ cap_rate: 5 });
  });
});

describe("gap filler helpers", () => {
  it("detects missing critical fields when absent or null", () => {
    expect(
      getMissingCriticalFields({
        pro_rata_share: null,
        cap_type: "cumulative",
        cap_rate: 5,
        base_year_amount: 1000,
      }),
    ).toEqual(["pro_rata_share", "base_year"]);
  });

  it("only fills null critical fields and never overwrites present values", () => {
    const firstPass = applyGapFillResult(
      {
        cap_rate: 5,
        base_year: null,
      },
      "base_year",
      {
        base_year: 2024,
      },
    );

    expect(firstPass).toEqual({ cap_rate: 5, base_year: 2024 });
    expect(applyGapFillResult(firstPass, "cap_rate", { cap_rate: 7 })).toEqual({
      cap_rate: 5,
      base_year: 2024,
    });
  });
});
