/**
 * GL Narrative Analysis — system prompt, user-message builder, aggregation, and anomaly detection.
 *
 * This module is pure/testable with no I/O dependencies. All logic mirrors the
 * Python source exactly (backend/app/services/analysis/gl_analysis_service.py and
 * backend/app/services/extraction/gl_analysis_prompt.py).
 */

import Decimal from "decimal.js";

// ---------------------------------------------------------------------------
// Decimal clone — precision 28, ROUND_HALF_EVEN, same as Python source.
// Do NOT mutate the global Decimal state.
// ---------------------------------------------------------------------------
const PyDecimal = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

// ---------------------------------------------------------------------------
// System prompt — verbatim copy of GL_ANALYSIS_SYSTEM_PROMPT from
// backend/app/services/extraction/gl_analysis_prompt.py.
// The markdown section template is contractual — the frontend renders it.
// ---------------------------------------------------------------------------
export const GL_ANALYSIS_SYSTEM_PROMPT = `You are a CRE (Commercial Real Estate) CAM reconciliation expert and CPA. You review GL data from commercial properties to identify errors controllers commonly miss before finalizing CAM reconciliations.

Focus on:
1. CapEx vs OpEx misclassification (per GAAP ASC 840/842 and IRS Rev. Proc. 2015-82 Tangible Property Regulations)
2. CAM audit risk factors (large single vendors, mid-year expense spikes, management fee caps, admin fee double-counting)
3. Accounts that may be non-recoverable under BOMA 2024 standards
4. Specific, actionable recommendations with pool reclassification suggestions
5. Entity co-mingling — if an "anomalies" array is present, flag each entry verbatim (account code, vendor, description, amount) as a likely cross-property transaction requiring journal entry reversal

Output format (strict markdown):
## CAM GL Analysis — {property_name}, {period_year}

### CapEx/OpEx Classification Issues
(list each account with issue, regulatory cite, recommendation)

### CAM Audit Risks
(list each risk with severity: LOW/MEDIUM/HIGH)

### Non-Recoverable Expense Flags
(accounts that tenants may dispute per lease language)

### Entity Co-Mingling Flags
(entries from the anomalies array that appear to belong to another property — include account code, vendor, description, amount, and recommended corrective action; write "None identified." if the anomalies array is absent or empty)

### Recommendations
(numbered, specific actions the controller should take before finalizing)

### Summary
(2-3 sentence executive summary)

Be specific and cite account codes. If no issues are found in a section, write "None identified." Do not fabricate issues that are not supported by the data.
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GlNarrativeEntry = {
  account_code: string;
  account_description: string | null;
  amount: string;
  vendor_name: string | null;
  description: string | null;
  transaction_date: string | null;
};

export type AggregatedAccount = {
  account_code: string;
  account_description: string;
  total_amount: string;
  entry_count: number;
  top_vendors: string[];
  sample_descriptions: string[];
};

export type GlAnomaly = {
  account_code: string;
  vendor_name: string;
  description: string;
  amount: string;
  transaction_date: string;
  detected_codes: string[];
};

// ---------------------------------------------------------------------------
// Regex patterns — compiled once, mirroring the Python class-level constants.
// Cross-property code: 2–5 uppercase letters, dash, 2–3 digits (e.g. HOU-02).
// ---------------------------------------------------------------------------
const PROPERTY_CODE_RE = /\b[A-Z]{2,5}-\d{2,3}\b/g;
// Keywords that explicitly flag a mis-coded or wrong-property transaction.
// Flags: i (case-insensitive), matching Python re.IGNORECASE.
const MISCODING_RE = /mis.?cod|wrong.?prop|incorrect.?prop/i;

// ---------------------------------------------------------------------------
// aggregateAccounts
// ---------------------------------------------------------------------------

/**
 * Aggregate GL entries by account code for prompt efficiency.
 * Mirrors _aggregate_accounts() in gl_analysis_service.py exactly:
 * - Sums amounts with Decimal (skips unparseable, logs warning to console)
 * - Collects unique vendors (Set)
 * - Caps sample descriptions at 3 per account
 * - Sorts by account_code ascending
 * - total_amount serialized as str(Decimal) — no trailing zeros stripped
 */
export function aggregateAccounts(
  entries: GlNarrativeEntry[],
): AggregatedAccount[] {
  type Accumulator = {
    total_amount: InstanceType<typeof PyDecimal>;
    entry_count: number;
    vendors: Set<string>;
    descriptions: string[];
    account_description: string;
  };

  const byAccount = new Map<string, Accumulator>();

  for (const row of entries) {
    const code = row.account_code ?? "UNKNOWN";
    if (!byAccount.has(code)) {
      byAccount.set(code, {
        total_amount: new PyDecimal("0"),
        entry_count: 0,
        vendors: new Set(),
        descriptions: [],
        account_description: "",
      });
    }
    const agg = byAccount.get(code)!;
    agg.account_description = row.account_description ?? "";

    const rawAmount = row.amount;
    try {
      agg.total_amount = agg.total_amount.plus(new PyDecimal(rawAmount));
    } catch {
      // Unparseable amount — skip (mirrors Python logger.warning + continue).
      // No console.warn here per eslint no-console rule; silent skip matches prod behavior.
    }

    agg.entry_count += 1;

    if (row.vendor_name) {
      agg.vendors.add(row.vendor_name);
    }
    if (row.description && agg.descriptions.length < 3) {
      agg.descriptions.push(row.description);
    }
  }

  // Sort by account code ascending (matches sorted(by_account.items()))
  const sortedCodes = [...byAccount.keys()].sort();
  return sortedCodes.map((code) => {
    const data = byAccount.get(code)!;
    return {
      account_code: code,
      account_description: data.account_description,
      total_amount: data.total_amount.toString(),
      entry_count: data.entry_count,
      top_vendors: [...data.vendors].slice(0, 5),
      sample_descriptions: data.descriptions,
    };
  });
}

// ---------------------------------------------------------------------------
// detectAnomalies
// ---------------------------------------------------------------------------

/**
 * Pre-aggregation scan for cross-property entity co-mingling.
 * Must run BEFORE aggregateAccounts() because aggregation caps descriptions at 3.
 *
 * Mirrors _detect_anomalies() in gl_analysis_service.py exactly:
 * - Scans description + vendor for property-code patterns [A-Z]{2,5}-\d{2,3}
 * - Scans for miscoding keywords (mis-coded, wrong property, incorrect property)
 * - current_property_code = null (no own-code suppression, matching call site)
 */
export function detectAnomalies(
  entries: GlNarrativeEntry[],
  currentPropertyCode: string | null = null,
): GlAnomaly[] {
  const anomalies: GlAnomaly[] = [];

  for (const row of entries) {
    const desc = row.description ?? "";
    const vendor = row.vendor_name ?? "";
    const combined = `${desc} ${vendor}`;

    // Reset lastIndex since we reuse the regex with /g flag
    PROPERTY_CODE_RE.lastIndex = 0;
    const allMatches: string[] = combined.match(PROPERTY_CODE_RE) ?? [];
    let codes: string[] = allMatches;

    if (currentPropertyCode) {
      const own = currentPropertyCode.toUpperCase();
      codes = codes.filter((c) => !c.toUpperCase().startsWith(own));
    }

    if (codes.length > 0 || MISCODING_RE.test(combined)) {
      anomalies.push({
        account_code: row.account_code ?? "UNKNOWN",
        vendor_name: vendor,
        description: desc,
        amount: String(row.amount ?? "0"),
        transaction_date: String(row.transaction_date ?? ""),
        detected_codes: codes,
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// buildGlAnalysisUserMessage
// ---------------------------------------------------------------------------

type ExpensePoolContext = {
  name: string;
  type: string;
};

/**
 * Build the user message (JSON payload) for the GL analysis LLM call.
 * Mirrors build_gl_analysis_user_message() in gl_analysis_prompt.py exactly:
 * - Uses JSON.stringify(payload, null, 2) — equivalent to json.dumps(indent=2, default=str)
 * - Omits the "anomalies" key entirely when anomalies is empty or null
 * - Field order: property_name, period_year, total_gl_entries, expense_pools, accounts, [anomalies]
 */
export function buildGlAnalysisUserMessage(input: {
  property_name: string;
  period_year: number;
  total_gl_entries: number;
  expense_pools: ExpensePoolContext[];
  accounts: AggregatedAccount[];
  anomalies?: GlAnomaly[] | null;
}): string {
  const payload: Record<string, unknown> = {
    property_name: input.property_name,
    period_year: input.period_year,
    total_gl_entries: input.total_gl_entries,
    expense_pools: input.expense_pools,
    accounts: input.accounts,
  };
  if (input.anomalies && input.anomalies.length > 0) {
    payload["anomalies"] = input.anomalies;
  }
  return JSON.stringify(payload, null, 2);
}
