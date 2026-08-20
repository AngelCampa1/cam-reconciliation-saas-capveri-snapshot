import { env as workerEnv } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { OpenRouterExtractionJudge } from "../adapters/ai/extraction-judge";
import { createOpenRouterClient } from "../adapters/ai/openrouter";
import type { JsonObject } from "../domain/extraction/extraction-service";
import { createExtractionModelConfig } from "../domain/extraction/model-config";
import type { AppEnv } from "../env";

type OpenRouterE2EEnv = Partial<AppEnv> & {
  RUN_OPENROUTER_E2E?: string;
  CI?: string;
};

const runtimeEnv = workerEnv as OpenRouterE2EEnv;
const realOpenRouterRequested =
  runtimeEnv.RUN_OPENROUTER_E2E === "1" ||
  process.env.RUN_OPENROUTER_E2E === "1";
const isCi =
  runtimeEnv.CI === "1" ||
  runtimeEnv.CI === "true" ||
  process.env.CI === "1" ||
  process.env.CI === "true";
if (realOpenRouterRequested && isCi) {
  throw new Error("RUN_OPENROUTER_E2E is local-only and must not run in CI.");
}
const runRealOpenRouter = realOpenRouterRequested && !isCi;

const primaryExtraction: JsonObject = {
  pro_rata_share: "0.0625",
  base_year: 2024,
  cap_type: "LESSER_OF",
  cap_rate: "0.07",
  admin_fee_percentage: "0.15",
};

const siblingExtraction: JsonObject = {
  pro_rata_share: "0.0625",
  base_year: 2024,
  cap_type: "non_cumulative",
  cap_rate: "0.05",
  admin_fee_percentage: "0.15",
};

const siblingSupportedProRataPrimary: JsonObject = {
  tenant_name: "Source Backed Share Tenant",
  pro_rata_share: "0.083333",
  base_year: 2024,
  cap_type: "none",
  cap_rate: null,
  admin_fee_percentage: "0.10",
  field_sources: {
    pro_rata_share: {
      source_text:
        "Tenant occupies 10,000 rentable square feet in a 120,000 rentable square foot center.",
      note: "Extractor A inferred 8.3333% from an area clause instead of the explicit share clause.",
    },
  },
};

const siblingSupportedProRataSibling: JsonObject = {
  tenant_name: "Source Backed Share Tenant",
  pro_rata_share: "0.0625",
  base_year: 2024,
  cap_type: "none",
  cap_rate: null,
  admin_fee_percentage: "0.10",
  field_sources: {
    pro_rata_share: {
      source_text:
        "For CAM, taxes, and insurance, Tenant's Proportionate Share is exactly 6.25%.",
      note: "Extractor B used the explicit pro-rata share clause.",
    },
  },
};

const primarySupportedAdminFeePrimary: JsonObject = {
  tenant_name: "Admin Fee Arbitration Tenant",
  pro_rata_share: "0.05",
  base_year: null,
  base_year_amount: "125000.00",
  cap_type: "none",
  cap_rate: null,
  admin_fee_percentage: "0.12",
  field_sources: {
    admin_fee_percentage: {
      source_text:
        "Landlord may add an administrative fee equal to twelve percent (12%) of recoverable operating expenses.",
      note: "Extractor A used the percentage stated in words and numerals.",
    },
  },
};

const primarySupportedAdminFeeSibling: JsonObject = {
  tenant_name: "Admin Fee Arbitration Tenant",
  pro_rata_share: "0.05",
  base_year: null,
  base_year_amount: "125000.00",
  cap_type: "none",
  cap_rate: null,
  admin_fee_percentage: "0.10",
  field_sources: {
    admin_fee_percentage: {
      source_text:
        "Landlord may add an administrative fee equal to twelve percent (12%) of recoverable operating expenses.",
      note: "Extractor B returned a nearby but unsupported 10%.",
    },
  },
};

const unsupportedFinancialPrimary: JsonObject = {
  tenant_name: "Unsupported Base Year Tenant",
  pro_rata_share: "0.05",
  base_year: null,
  base_year_amount: "90000.00",
  cap_type: "none",
  cap_rate: null,
  admin_fee_percentage: "0",
  field_sources: {
    base_year_amount: {
      source_text:
        "Lease says operating expenses are reconciled annually, but no base-year dollar amount is stated.",
      note: "Extractor A guessed a base year amount without source support.",
    },
  },
};

const unsupportedFinancialSibling: JsonObject = {
  tenant_name: "Unsupported Base Year Tenant",
  pro_rata_share: "0.05",
  base_year: null,
  base_year_amount: "100000.00",
  cap_type: "none",
  cap_rate: null,
  admin_fee_percentage: "0",
  field_sources: {
    base_year_amount: {
      source_text:
        "Lease says operating expenses are reconciled annually, but no base-year dollar amount is stated.",
      note: "Extractor B guessed a different base year amount without source support.",
    },
  },
};

describe.skipIf(!runRealOpenRouter)(
  "real OpenRouter extraction judge E2E",
  () => {
    it("arbitrates a schema-invalid cap enum disagreement without choosing the invalid value", async () => {
      const judge = new OpenRouterExtractionJudge(
        createOpenRouterClient(runtimeEnv),
        createExtractionModelConfig(runtimeEnv),
      );

      const result = await judge.judge(primaryExtraction, siblingExtraction);

      expect(result.fieldsJudged).toBe(2);
      expect(result.tokensUsed).toBeGreaterThan(0);
      expect(result.modelUsed).not.toBe("");
      expect(result.verdicts).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "_judge_error" }),
        ]),
      );

      const capTypeVerdict = result.verdicts.find(
        (verdict) => verdict.field === "cap_type",
      );
      expect(capTypeVerdict).toBeDefined();
      expect(capTypeVerdict?.verdict).not.toBe("primary_wins");
      if (capTypeVerdict?.verdict === "sibling_wins") {
        expect(capTypeVerdict.chosenValue).toBe("non_cumulative");
      }
    }, 180_000);

    it("chooses a source-backed sibling pro-rata share over a plausible primary inference", async () => {
      const judge = createRealJudge();

      const result = await judge.judge(
        siblingSupportedProRataPrimary,
        siblingSupportedProRataSibling,
      );

      expectSuccessfulJudge(result);
      expect(result.fieldsJudged).toBeGreaterThanOrEqual(1);
      const verdict = expectVerdict(result, "pro_rata_share");
      expect(verdict.verdict).toBe("sibling_wins");
      expect(String(verdict.chosenValue)).toBe("0.0625");
    }, 180_000);

    it("chooses a source-backed primary admin fee over a nearby sibling value", async () => {
      const judge = createRealJudge();

      const result = await judge.judge(
        primarySupportedAdminFeePrimary,
        primarySupportedAdminFeeSibling,
      );

      expectSuccessfulJudge(result);
      expect(result.fieldsJudged).toBeGreaterThanOrEqual(1);
      const verdict = expectVerdict(result, "admin_fee_percentage");
      expect(verdict.verdict).toBe("primary_wins");
      expect(String(verdict.chosenValue)).toBe("0.12");
    }, 180_000);

    it("trusts neither unsupported conflicting base year amount", async () => {
      const judge = createRealJudge();

      const result = await judge.judge(
        unsupportedFinancialPrimary,
        unsupportedFinancialSibling,
      );

      expectSuccessfulJudge(result);
      expect(result.fieldsJudged).toBeGreaterThanOrEqual(1);
      const verdict = expectVerdict(result, "base_year_amount");
      expect(verdict.verdict).toBe("trust_neither");
    }, 180_000);
  },
);

describe("real OpenRouter extraction judge E2E harness", () => {
  it("keeps the live disagreement focused on invalid enum arbitration", () => {
    expect(primaryExtraction.cap_type).toBe("LESSER_OF");
    expect(siblingExtraction.cap_type).toBe("non_cumulative");
    expect(primaryExtraction.pro_rata_share).toBe(
      siblingExtraction.pro_rata_share,
    );
    expect(primaryExtraction.base_year).toBe(siblingExtraction.base_year);
  });

  it("covers money-bearing arbitration scenarios", () => {
    expect(siblingSupportedProRataPrimary.pro_rata_share).toBe("0.083333");
    expect(siblingSupportedProRataSibling.pro_rata_share).toBe("0.0625");
    expect(primarySupportedAdminFeePrimary.admin_fee_percentage).toBe("0.12");
    expect(primarySupportedAdminFeeSibling.admin_fee_percentage).toBe("0.10");
    expect(unsupportedFinancialPrimary.base_year_amount).toBe("90000.00");
    expect(unsupportedFinancialSibling.base_year_amount).toBe("100000.00");
  });
});

function createRealJudge(): OpenRouterExtractionJudge {
  return new OpenRouterExtractionJudge(
    createOpenRouterClient(runtimeEnv),
    createExtractionModelConfig(runtimeEnv),
  );
}

function expectSuccessfulJudge(
  result: Awaited<ReturnType<OpenRouterExtractionJudge["judge"]>>,
): void {
  expect(result.tokensUsed).toBeGreaterThan(0);
  expect(result.modelUsed).not.toBe("");
  expect(result.verdicts).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "_judge_error" }),
    ]),
  );
}

function expectVerdict(
  result: Awaited<ReturnType<OpenRouterExtractionJudge["judge"]>>,
  field: string,
) {
  const verdict = result.verdicts.find((entry) => entry.field === field);
  expect(verdict).toBeDefined();
  return verdict!;
}
