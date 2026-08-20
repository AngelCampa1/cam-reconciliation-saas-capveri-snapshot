/**
 * CapEx Classifier — rules-based capital expenditure detection.
 *
 * Screens individual GL entries for potential capital expenditures.
 * No ML, no LLM — deterministic rules only.
 * Pure functions; no DB access; all money via Decimal.
 */
import Decimal from "decimal.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type Disposition = "pending" | "confirmed_capex" | "dismissed";

/** Minimal GL entry shape needed by the classifier. */
export type GlEntryInput = {
  id: string;
  amount: string; // numeric string
  account_code?: string | null;
  account_description?: string | null;
  vendor_name?: string | null;
  description?: string | null;
};

/** Single rule match result. */
export type CapExMatch = {
  gl_entry_id: string;
  rule_name: string;
  confidence: string; // decimal string, e.g. "0.85"
  reason: string;
  matched_pattern: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Rules
// ────────────────────────────────────────────────────────────────────────────

const HIGH_CONFIDENCE_KEYWORDS = [
  "capital improvement",
  "capex",
  "tenant improvement",
  "leasehold improvement",
];
const MEDIUM_CONFIDENCE_KEYWORDS = [
  "replacement",
  "installation",
  "renovation",
  "construction",
  "remodel",
  "upgrade",
];
const ALL_KEYWORDS = [
  ...HIGH_CONFIDENCE_KEYWORDS,
  ...MEDIUM_CONFIDENCE_KEYWORDS,
];

const CAPEX_CODE_PREFIXES = new Set(["15", "17", "18"]);

const VENDOR_PATTERN =
  /\b(construction|roofing|paving|demolition|excavat|waterproofing|general\s+contractor|electrical\s+contractor|plumbing\s+contractor)\b/iu;

function descText(entry: GlEntryInput): string {
  return [entry.account_description ?? "", entry.description ?? ""]
    .join(" ")
    .toLowerCase();
}

function amountThresholdRule(entry: GlEntryInput): CapExMatch | null {
  const amount = new Decimal(entry.amount).abs();
  if (amount.gte(100_000)) {
    return {
      gl_entry_id: entry.id,
      rule_name: "amount_threshold",
      confidence: "0.85",
      reason: `Amount $${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/u, ",")} exceeds $100,000 threshold`,
      matched_pattern: null,
    };
  }
  if (amount.gte(25_000)) {
    return {
      gl_entry_id: entry.id,
      rule_name: "amount_threshold",
      confidence: "0.60",
      reason: `Amount $${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/u, ",")} exceeds $25,000 threshold`,
      matched_pattern: null,
    };
  }
  return null;
}

function accountKeywordRule(entry: GlEntryInput): CapExMatch | null {
  const text = descText(entry);
  for (const kw of HIGH_CONFIDENCE_KEYWORDS) {
    if (text.includes(kw)) {
      return {
        gl_entry_id: entry.id,
        rule_name: "account_keyword",
        confidence: "0.90",
        reason: `High-confidence CapEx keyword: '${kw}'`,
        matched_pattern: kw,
      };
    }
  }
  for (const kw of MEDIUM_CONFIDENCE_KEYWORDS) {
    if (text.includes(kw)) {
      return {
        gl_entry_id: entry.id,
        rule_name: "account_keyword",
        confidence: "0.65",
        reason: `Medium-confidence CapEx keyword: '${kw}'`,
        matched_pattern: kw,
      };
    }
  }
  return null;
}

function accountCodePrefixRule(entry: GlEntryInput): CapExMatch | null {
  const code = (entry.account_code ?? "").trim();
  const prefix = code.slice(0, 2);
  if (code && CAPEX_CODE_PREFIXES.has(prefix)) {
    return {
      gl_entry_id: entry.id,
      rule_name: "account_code_prefix",
      confidence: "0.75",
      reason: `Account code ${code} in standard CapEx range (${prefix}xx)`,
      matched_pattern: `${prefix}*`,
    };
  }
  return null;
}

function vendorPatternRule(entry: GlEntryInput): CapExMatch | null {
  const vendor = (entry.vendor_name ?? "").trim();
  if (!vendor) return null;
  const m = VENDOR_PATTERN.exec(vendor);
  if (m) {
    return {
      gl_entry_id: entry.id,
      rule_name: "vendor_pattern",
      confidence: "0.55",
      reason: `Vendor '${vendor}' matches CapEx vendor pattern`,
      matched_pattern: m[0].toLowerCase(),
    };
  }
  return null;
}

function amountKeywordComboRule(entry: GlEntryInput): CapExMatch | null {
  const amount = new Decimal(entry.amount).abs();
  if (amount.lte(10_000)) return null;
  const text = descText(entry);
  for (const kw of ALL_KEYWORDS) {
    if (text.includes(kw)) {
      return {
        gl_entry_id: entry.id,
        rule_name: "amount_keyword_combo",
        confidence: "0.80",
        reason: `Amount $${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/u, ",")} > $10K with CapEx keyword '${kw}'`,
        matched_pattern: kw,
      };
    }
  }
  return null;
}

type Rule = (entry: GlEntryInput) => CapExMatch | null;

const ALL_RULES: Rule[] = [
  amountThresholdRule,
  accountKeywordRule,
  accountCodePrefixRule,
  vendorPatternRule,
  amountKeywordComboRule,
];

// ────────────────────────────────────────────────────────────────────────────
// Public classifier
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run all rules against entries. Returns deduplicated matches.
 * Pure function — no DB, no network.
 */
export function classifyEntries(entries: GlEntryInput[]): CapExMatch[] {
  const matches: CapExMatch[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    for (const rule of ALL_RULES) {
      const result = rule(entry);
      if (result !== null) {
        const key = `${result.gl_entry_id}::${result.rule_name}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(result);
        }
      }
    }
  }

  return matches;
}
