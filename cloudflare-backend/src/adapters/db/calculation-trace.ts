/**
 * Shared normalizer for the `calculation_trace` JSONB column when it is read
 * back for PDF rendering. Dependency-free leaf module (no adapter imports) so
 * both the reconciliation snapshot export (`exports.ts`) and the tax-protest
 * expense-summary export (`tax-protest.ts`) can share it without an import
 * cycle.
 */

/**
 * Presentation shape consumed by the reconciliation snapshot PDF
 * (`domain/exports/property-pdf.ts`) and the tax-protest expense-summary PDF
 * (`domain/tax-protest/expense-summary-pdf.ts`). Both templates read
 * `step_name` / `operation` / `output_value` / `output_unit` / `note`.
 */
export type PdfCalculationTraceStep = {
  step_name: string;
  operation: string | null;
  output_value: unknown;
  output_unit: string | null;
  note: string | null;
};

/**
 * Convert a stored `calculation_trace` value into the PDF presentation shape.
 *
 * Guards against two hazards that were live defects — both silently blanked
 * the "Calculation Summary" section of exported PDFs:
 *
 *   1. Driver decode path. porsager/postgres may hand a JSONB array back as a
 *      real JS array OR as an undecoded JSON string, depending on the query
 *      path. A bare `Array.isArray(raw)` check treats the string form as empty
 *      and the PDF falls back to "No detailed calculation trace available"
 *      even when the trace is non-empty. `reconciliation.ts` guards its
 *      snapshot GET with the same normalize (`normalizeJsonArray`); the export
 *      and tax-protest paths did not, so their PDFs lost the trace.
 *
 *   2. Key mismatch. The reconciliation engine writes each step as
 *      `{ name, operation, output }` (see `calculator.ts`), but the PDF
 *      templates read `{ step_name, operation, output_value, output_unit,
 *      note }`. Reading `step.step_name` / `step.output_value` off the stored
 *      shape yielded "" / null for every step, degrading real traces to
 *      blanks. We map `name -> step_name` and `output -> output_value`, and
 *      keep a fallback to the presentation keys for forward-compatibility.
 *      `output_unit` / `note` have no source in the engine output and stay
 *      null (the template defaults the unit to "currency").
 */
export function normalizeCalculationTrace(
  raw: unknown,
): PdfCalculationTraceStep[] {
  const parsed = typeof raw === "string" ? safeParseJson(raw) : raw;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((entry) => {
    const step =
      typeof entry === "object" && entry !== null
        ? (entry as Record<string, unknown>)
        : {};
    return {
      step_name: String(step["name"] ?? step["step_name"] ?? ""),
      operation: step["operation"] != null ? String(step["operation"]) : null,
      output_value: step["output"] ?? step["output_value"] ?? null,
      output_unit:
        step["output_unit"] != null ? String(step["output_unit"]) : null,
      note: step["note"] != null ? String(step["note"]) : null,
    };
  });
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
