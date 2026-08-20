import { PDFDocument, StandardFonts } from "pdf-lib";
import { env as workerEnv } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { OpenRouterValidationReprompter } from "../adapters/ai/validation-reprompt";
import { createOpenRouterClient } from "../adapters/ai/openrouter";
import type {
  JsonObject,
  JsonValue,
} from "../domain/extraction/extraction-service";
import { createExtractionModelConfig } from "../domain/extraction/model-config";
import type { AppEnv } from "../env";

type OpenRouterE2EEnv = Partial<AppEnv> & {
  RUN_OPENROUTER_E2E?: string;
  CI?: string;
};

type Scenario = {
  id: string;
  leaseText: string;
  startingExtraction: JsonObject;
  expectedCapType: string;
  expectedCapRate: string | null;
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

const scenarios: Scenario[] = [
  {
    id: "orphan-cap-rate",
    leaseText: [
      "VALIDATION REPROMPT LEASE - ORPHAN RATE",
      "Tenant's Pro Rata Share is 6.250%.",
      "The Base Year for Operating Expenses is calendar year 2024.",
      "Controllable Operating Expenses are subject to a cumulative cap of six percent (6%) per calendar year.",
      "Unused cap capacity carries forward to later years.",
    ].join("\n"),
    startingExtraction: {
      pro_rata_share: "0.0625",
      base_year: 2024,
      cap_type: "none",
      cap_rate: "0.06",
    },
    expectedCapType: "cumulative",
    expectedCapRate: "0.06",
  },
  {
    id: "missing-cap-rate",
    leaseText: [
      "VALIDATION REPROMPT LEASE - MISSING RATE",
      "Tenant's Pro Rata Share is 4.250%.",
      "The Base Year for Operating Expenses is calendar year 2025.",
      "Controllable Operating Expenses shall not increase by more than five percent (5%) per calendar year.",
      "This cap is non-cumulative; unused amounts do not carry forward.",
    ].join("\n"),
    startingExtraction: {
      pro_rata_share: "0.0425",
      base_year: 2025,
      cap_type: "non_cumulative",
      cap_rate: null,
    },
    expectedCapType: "non_cumulative",
    expectedCapRate: "0.05",
  },
];

describe.skipIf(!runRealOpenRouter)(
  "real OpenRouter validation re-prompt E2E",
  () => {
    it.each(scenarios)(
      "$id repairs cap_type/cap_rate consistency from the PDF",
      async (scenario) => {
        const reprompter = new OpenRouterValidationReprompter(
          createOpenRouterClient(runtimeEnv),
          createExtractionModelConfig(runtimeEnv),
        );

        const pdfBytes = await createLeasePdf(scenario);
        const result = await reprompter.repromptInvalidFields(
          scenario.startingExtraction,
          pdfBytes,
          `${scenario.id}.pdf`,
        );

        expect(result.attempted).toBe(true);
        expect(result.tokensUsed).toBeGreaterThan(0);
        expect(result.attempts.length).toBeGreaterThanOrEqual(1);
        expect(result.attempts.at(-1)?.ok).toBe(true);
        expect(result.extraction.cap_type).toBe(scenario.expectedCapType);
        expectNullableDecimal(
          result.extraction.cap_rate,
          scenario.expectedCapRate,
        );
      },
      240_000,
    );
  },
);

describe("real OpenRouter validation re-prompt E2E harness", () => {
  it("keeps live scenarios focused on both cap-pair repair directions", () => {
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "orphan-cap-rate",
      "missing-cap-rate",
    ]);
    expect(scenarios[0]?.startingExtraction).toMatchObject({
      cap_type: "none",
      cap_rate: "0.06",
    });
    expect(scenarios[1]?.startingExtraction).toMatchObject({
      cap_type: "non_cumulative",
      cap_rate: null,
    });
  });
});

async function createLeasePdf(scenario: Scenario): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText(`CapVeri Validation Fixture: ${scenario.id}`, {
    x: 48,
    y: 744,
    size: 11,
    font,
  });
  page.drawText(scenario.leaseText, {
    x: 48,
    y: 704,
    size: 10,
    font,
    maxWidth: 500,
    lineHeight: 14,
  });
  return doc.save();
}

function expectNullableDecimal(
  value: JsonValue | undefined,
  expected: string | null,
) {
  if (expected === null) {
    expect(value ?? null).toBeNull();
    return;
  }
  expect(value).not.toBeNull();
  expect(Number(value)).toBeCloseTo(Number(expected), 8);
}
