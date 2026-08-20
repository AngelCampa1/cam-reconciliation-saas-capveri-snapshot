const ACRONYMS = new Set([
  "cam",
  "erp",
  "boma",
  "sb",
  "gl",
  "noi",
  "hcad",
  "nnn",
  "cpa",
  "rsf",
  "irem",
  "asc",
]);

// Short joining words that stay lowercase in title case, unless they lead the title.
const LOWERCASE_WORDS = new Set([
  "vs",
  "by",
  "for",
  "in",
  "of",
  "and",
  "or",
  "the",
  "a",
  "an",
  "to",
  "at",
  "per",
  "with",
]);

/**
 * Convert a URL slug or path into a display-friendly title.
 * Uses the final path segment, turns hyphens into spaces, title-cases each
 * word, and upper-cases known acronyms (CAM, BOMA, NNN, ...).
 *
 * Examples:
 *   "/cam-reconciliation-guide"                       -> "CAM Reconciliation Guide"
 *   "/resources/boma/boma-2024-adoption-roadmap"      -> "BOMA 2024 Adoption Roadmap"
 *   "/tools/cam-gross-up-calculator"                  -> "CAM Gross Up Calculator"
 */
export function slugToTitle(href: string): string {
  const segment = href.split("/").filter(Boolean).pop() ?? "";
  return segment
    .split("-")
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return word.toUpperCase();
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}
