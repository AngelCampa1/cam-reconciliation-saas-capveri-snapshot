import { PDFDocument, StandardFonts } from "pdf-lib";
import { env as workerEnv } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { OpenRouterExtractionGapFiller } from "../adapters/ai/extraction-gap-filler";
import { createOpenRouterClient } from "../adapters/ai/openrouter";
import type { JsonValue } from "../domain/extraction/extraction-service";
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

const expected = {
  pro_rata_share: "0.0425",
  cap_type: "non_cumulative",
  cap_rate: "0.05",
  base_year: 2024,
  base_year_amount: "12.75",
};

describe.skipIf(!runRealOpenRouter)("real OpenRouter gap-filler E2E", () => {
  it("fills all missing critical fields from a generated lease PDF", async () => {
    const gapFiller = new OpenRouterExtractionGapFiller(
      createOpenRouterClient(runtimeEnv),
      createExtractionModelConfig(runtimeEnv),
    );

    const result = await gapFiller.fillMissingFields(
      {
        pro_rata_share: null,
        cap_type: null,
        cap_rate: null,
        base_year: null,
        base_year_amount: null,
      },
      await createLeasePdf(),
      "gap-filler-critical-fields.pdf",
    );

    expect(result.missingFields).toEqual([
      "pro_rata_share",
      "cap_type",
      "cap_rate",
      "base_year",
      "base_year_amount",
    ]);
    expect(result.filledFields).toEqual(result.missingFields);
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.attempts).toHaveLength(5);
    expect(result.attempts.every((attempt) => attempt.ok)).toBe(true);
    expect(result.extraction.cap_type).toBe(expected.cap_type);
    expect(result.extraction.base_year).toBe(expected.base_year);
    expectDecimal(result.extraction.pro_rata_share, expected.pro_rata_share);
    expectDecimal(result.extraction.cap_rate, expected.cap_rate);
    expectDecimal(
      result.extraction.base_year_amount,
      expected.base_year_amount,
    );
  }, 420_000);
});

describe("real OpenRouter gap-filler E2E harness", () => {
  it("keeps the live fixture pinned to five critical missing fields", () => {
    expect(Object.keys(expected)).toEqual([
      "pro_rata_share",
      "cap_type",
      "cap_rate",
      "base_year",
      "base_year_amount",
    ]);
    expect(expected.cap_type).toBe("non_cumulative");
  });
});

async function createLeasePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("Commercial Lease - Operating Expense Recovery Addendum", {
    x: 48,
    y: 744,
    size: 11,
    font,
  });
  page.drawText(
    [
      "Tenant's proportionate share of operating expenses is 4.25 percent.",
      "The tenant leases 17,000 rentable square feet in the project.",
      "Controllable operating expenses shall be subject to a non-cumulative expense cap.",
      "The cap shall not increase by more than five percent per calendar year.",
      "The 2024 calendar year is the base year for this lease.",
      "The operating expense stop amount for the base year is $12.75 per RSF.",
    ].join("\n"),
    {
      x: 48,
      y: 704,
      size: 10,
      font,
      maxWidth: 500,
      lineHeight: 14,
    },
  );
  return doc.save();
}

function expectDecimal(value: JsonValue | undefined, expectedValue: string) {
  expect(value).not.toBeNull();
  expect(Number(value)).toBeCloseTo(Number(expectedValue), 8);
}
