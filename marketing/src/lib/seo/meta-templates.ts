const CURRENT_YEAR = new Date().getFullYear();

/** Truncate string to maxLen, appending ellipsis if needed */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1).trimEnd() + "…";
}

/**
 * Blog post meta. Pattern: "[Pain Point]: [Fix] (YEAR)"
 * Falls back to title if it already fits.
 */
export function blogMeta(title: string, description: string) {
  const metaTitle = truncate(
    title.includes(`(${CURRENT_YEAR})`) ? title : `${title} (${CURRENT_YEAR})`,
    60,
  );
  const metaDescription = truncate(description, 155);
  return { title: metaTitle, description: metaDescription };
}

/**
 * Resource page meta. Pattern: "[Topic] Guide for [Role] | [Benefit]"
 */
export function resourceMeta(title: string, description: string) {
  const metaTitle = truncate(title, 60);
  const metaDescription = truncate(description, 155);
  return { title: metaTitle, description: metaDescription };
}

/**
 * Free tool meta. Pattern: "Free [Tool Name] - [What It Calculates]"
 */
export function toolMeta(toolName: string, shortDescription: string) {
  const metaTitle = truncate(`Free ${toolName} - ${shortDescription}`, 60);
  const metaDescription = truncate(
    `${shortDescription}. Free online calculator for commercial landlords and property managers.`,
    155,
  );
  return { title: metaTitle, description: metaDescription };
}

/**
 * Glossary term meta. Pattern: "[Term] in Commercial Leases - Definition & CAM Impact"
 */
export function glossaryMeta(term: string, shortDefinition: string) {
  const metaTitle = truncate(
    `${term} in Commercial Leases - Definition & CAM Impact`,
    60,
  );
  const metaDescription = truncate(shortDefinition, 155);
  return { title: metaTitle, description: metaDescription };
}

/**
 * Comparison page meta. Pattern: "CapVeri vs [Competitor]: CAM Reconciliation Compared (YEAR)"
 */
export function comparisonMeta(competitorName: string, description: string) {
  const metaTitle = truncate(
    `CapVeri vs ${competitorName}: CAM Reconciliation (${CURRENT_YEAR})`,
    60,
  );
  const metaDescription = truncate(description, 155);
  return { title: metaTitle, description: metaDescription };
}
