/**
 * Regression: the PDF export adapters must render a stored calculation trace,
 * not silently blank it.
 *
 * Two live defects motivated `normalizeCalculationTrace`:
 *   1. The reconciliation engine writes steps as `{ name, operation, output }`
 *      but the PDF template reads `{ step_name, output_value }`. The old inline
 *      mappers read the wrong keys, so every real step degraded to "" / null.
 *   2. porsager/postgres can decode the JSONB column as a JSON *string*; the
 *      old `Array.isArray(raw)` check treated that as empty, so the PDF fell
 *      back to "No detailed calculation trace available" on a non-empty trace.
 *
 * The prior tests only ever fixtured `calculation_trace: []`, so neither branch
 * was exercised.
 */

import { describe, expect, it } from "vitest";

import { normalizeCalculationTrace } from "../adapters/db/calculation-trace";

// The exact shape the reconciliation engine persists (see calculator.ts).
const ENGINE_TRACE = [
  {
    name: "Cloudflare reconciliation",
    operation:
      "aggregate GL pools, apply occupancy gross-up, lease terms, caps, and admin fee",
    output: "9576000.00",
  },
];

describe("normalizeCalculationTrace", () => {
  it("maps the engine's {name, operation, output} keys onto the PDF shape", () => {
    const trace = normalizeCalculationTrace(ENGINE_TRACE);

    expect(trace).toHaveLength(1);
    expect(trace[0]).toEqual({
      step_name: "Cloudflare reconciliation",
      operation:
        "aggregate GL pools, apply occupancy gross-up, lease terms, caps, and admin fee",
      output_value: "9576000.00",
      output_unit: null,
      note: null,
    });
  });

  it("parses a JSON-string-decoded array (driver decode path) instead of blanking it", () => {
    const trace = normalizeCalculationTrace(JSON.stringify(ENGINE_TRACE));

    expect(trace).toHaveLength(1);
    expect(trace[0]?.step_name).toBe("Cloudflare reconciliation");
    expect(trace[0]?.output_value).toBe("9576000.00");
  });

  it("still accepts the presentation-shape keys for forward-compatibility", () => {
    const trace = normalizeCalculationTrace([
      {
        step_name: "Legacy step",
        operation: null,
        output_value: "100.00",
        output_unit: "currency",
        note: "n/a",
      },
    ]);

    expect(trace[0]).toEqual({
      step_name: "Legacy step",
      operation: null,
      output_value: "100.00",
      output_unit: "currency",
      note: "n/a",
    });
  });

  it("returns an empty array for null, non-array, and unparseable input", () => {
    expect(normalizeCalculationTrace(null)).toEqual([]);
    expect(normalizeCalculationTrace(undefined)).toEqual([]);
    expect(normalizeCalculationTrace("not json")).toEqual([]);
    expect(normalizeCalculationTrace('{"not":"an array"}')).toEqual([]);
    expect(normalizeCalculationTrace(42)).toEqual([]);
  });

  it("preserves a numeric zero output without nullish fallback", () => {
    const trace = normalizeCalculationTrace([
      { name: "Zero step", operation: null, output: 0 },
    ]);

    expect(trace[0]?.output_value).toBe(0);
  });

  // The reconciliation snapshot PDF (property-pdf.ts), tax-protest expense
  // summary (expense-summary-pdf.ts), and tenant statement (statement-pdf.ts)
  // all render a step only when `step_name` is a non-empty string AND
  // `output_value` is non-null. A normalized engine step must satisfy that
  // gate, or the PDF prints "No detailed calculation trace available" on a
  // real trace — the exact defect that hit all three export paths.
  it("produces steps that satisfy the PDF render gate (step_name && output_value)", () => {
    const [step] = normalizeCalculationTrace(ENGINE_TRACE);

    const rendersInPdf =
      typeof step?.step_name === "string" &&
      step.step_name.trim().length > 0 &&
      step.output_value !== null &&
      step.output_value !== undefined;

    expect(rendersInPdf).toBe(true);
  });
});
