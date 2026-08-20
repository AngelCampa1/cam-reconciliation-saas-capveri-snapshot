/**
 * County deadline table and pure deadline computation functions.
 *
 * Mirrors backend/app/services/tax_protest/deadline_service.py:
 *   - COUNTY_DEADLINES: verbatim copy of tax_protest_deadlines.json
 *   - getDeadlineForCounty: case-insensitive state+county lookup
 *   - computeEffectiveDeadline: priority — override_date > county deadline > null
 *   - computeDaysRemaining: UTC date-only diff, integer days, negative = overdue
 */

import type { CountyDeadlineEntry } from "./repository";

// ── County deadline table (verbatim from backend/app/data/tax_protest_deadlines.json) ──

export const COUNTY_DEADLINES: CountyDeadlineEntry[] = [
  {
    state: "TX",
    county: "Harris",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Dallas",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Tarrant",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Bexar",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Travis",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Collin",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Denton",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Fort Bend",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Montgomery",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Williamson",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "El Paso",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "TX",
    county: "Nueces",
    deadline_month: 5,
    deadline_day: 15,
    notes:
      "Texas Property Tax Code §41.44. May 15 or 30 days after notice, whichever is later.",
  },
  {
    state: "CA",
    county: "Los Angeles",
    deadline_month: 11,
    deadline_day: 30,
    notes:
      "Assessment Appeals Board deadline. Typically Sept 15 – Nov 30 filing window.",
  },
  {
    state: "CA",
    county: "San Francisco",
    deadline_month: 9,
    deadline_day: 15,
    notes: "Assessment Appeals Board. Sept 15 deadline for annual roll.",
  },
  {
    state: "CA",
    county: "San Diego",
    deadline_month: 11,
    deadline_day: 30,
    notes:
      "Assessment Appeals Board deadline. Typically Sept 15 – Nov 30 filing window.",
  },
  {
    state: "CA",
    county: "Orange",
    deadline_month: 11,
    deadline_day: 30,
    notes:
      "Assessment Appeals Board deadline. Typically Sept 15 – Nov 30 filing window.",
  },
  {
    state: "CA",
    county: "Santa Clara",
    deadline_month: 9,
    deadline_day: 15,
    notes: "Assessment Appeals Board. Sept 15 deadline for annual roll.",
  },
  {
    state: "CA",
    county: "Alameda",
    deadline_month: 9,
    deadline_day: 15,
    notes: "Assessment Appeals Board. Sept 15 deadline for annual roll.",
  },
  {
    state: "CA",
    county: "Riverside",
    deadline_month: 11,
    deadline_day: 30,
    notes: "Assessment Appeals Board deadline.",
  },
  {
    state: "CA",
    county: "Sacramento",
    deadline_month: 11,
    deadline_day: 30,
    notes: "Assessment Appeals Board deadline.",
  },
  {
    state: "IL",
    county: "Cook",
    deadline_month: 12,
    deadline_day: 31,
    notes:
      "Illinois Property Tax Appeal Board. Various township hearing dates; Cook County Board of Review.",
  },
  {
    state: "IL",
    county: "DuPage",
    deadline_month: 9,
    deadline_day: 1,
    notes: "Board of Review deadline varies by township; confirm annually.",
  },
  {
    state: "IL",
    county: "Lake",
    deadline_month: 9,
    deadline_day: 1,
    notes: "Board of Review deadline varies by township; confirm annually.",
  },
  {
    state: "FL",
    county: "Miami-Dade",
    deadline_month: 9,
    deadline_day: 15,
    notes:
      "Value Adjustment Board petition must be filed by Sept 15 under FL Stat §194.011.",
  },
  {
    state: "FL",
    county: "Broward",
    deadline_month: 9,
    deadline_day: 15,
    notes: "Value Adjustment Board petition by Sept 15 under FL Stat §194.011.",
  },
  {
    state: "FL",
    county: "Palm Beach",
    deadline_month: 9,
    deadline_day: 15,
    notes: "Value Adjustment Board petition by Sept 15 under FL Stat §194.011.",
  },
  {
    state: "FL",
    county: "Hillsborough",
    deadline_month: 9,
    deadline_day: 15,
    notes: "Value Adjustment Board petition by Sept 15 under FL Stat §194.011.",
  },
  {
    state: "FL",
    county: "Orange",
    deadline_month: 9,
    deadline_day: 15,
    notes: "Value Adjustment Board petition by Sept 15 under FL Stat §194.011.",
  },
  {
    state: "NY",
    county: "New York",
    deadline_month: 3,
    deadline_day: 1,
    notes:
      "NYC Tax Commission application deadline March 1. Small Income filing March 15.",
  },
  {
    state: "NY",
    county: "Kings",
    deadline_month: 3,
    deadline_day: 1,
    notes: "NYC Tax Commission application deadline March 1.",
  },
  {
    state: "NY",
    county: "Queens",
    deadline_month: 3,
    deadline_day: 1,
    notes: "NYC Tax Commission application deadline March 1.",
  },
  {
    state: "NY",
    county: "Nassau",
    deadline_month: 4,
    deadline_day: 1,
    notes: "Nassau County Board of Assessment Review deadline April 1.",
  },
  {
    state: "NY",
    county: "Westchester",
    deadline_month: 4,
    deadline_day: 25,
    notes:
      "Board of Assessment Review deadline. Grievance Day fourth Tuesday in April.",
  },
  {
    state: "GA",
    county: "Fulton",
    deadline_month: 5,
    deadline_day: 1,
    notes:
      "Georgia property tax appeal must be filed within 45 days of notice. Fulton County Board of Equalization.",
  },
  {
    state: "GA",
    county: "DeKalb",
    deadline_month: 5,
    deadline_day: 1,
    notes: "Board of Equalization. 45 days from notice date.",
  },
  {
    state: "GA",
    county: "Cobb",
    deadline_month: 5,
    deadline_day: 1,
    notes: "Board of Equalization. 45 days from notice date.",
  },
  {
    state: "WA",
    county: "King",
    deadline_month: 7,
    deadline_day: 1,
    notes: "King County Board of Equalization petition deadline July 1.",
  },
  {
    state: "WA",
    county: "Pierce",
    deadline_month: 7,
    deadline_day: 1,
    notes: "Board of Equalization petition deadline July 1.",
  },
  {
    state: "WA",
    county: "Snohomish",
    deadline_month: 7,
    deadline_day: 1,
    notes: "Board of Equalization petition deadline July 1.",
  },
  {
    state: "CO",
    county: "Denver",
    deadline_month: 6,
    deadline_day: 8,
    notes:
      "Colorado protest deadline June 8 or 30 days from notice. Odd years only for real property.",
  },
  {
    state: "CO",
    county: "Arapahoe",
    deadline_month: 6,
    deadline_day: 8,
    notes: "Colorado protest deadline June 8 or 30 days from notice.",
  },
  {
    state: "CO",
    county: "Jefferson",
    deadline_month: 6,
    deadline_day: 8,
    notes: "Colorado protest deadline June 8 or 30 days from notice.",
  },
  {
    state: "AZ",
    county: "Maricopa",
    deadline_month: 4,
    deadline_day: 1,
    notes: "Arizona State Board of Equalization petition deadline April 1.",
  },
  {
    state: "AZ",
    county: "Pima",
    deadline_month: 4,
    deadline_day: 1,
    notes: "Arizona State Board of Equalization petition deadline April 1.",
  },
  {
    state: "NV",
    county: "Clark",
    deadline_month: 1,
    deadline_day: 15,
    notes:
      "Clark County Assessment Appeals Board deadline. Jan 15 or 30 days from notice.",
  },
  {
    state: "NV",
    county: "Washoe",
    deadline_month: 1,
    deadline_day: 15,
    notes: "Assessment Appeals Board deadline Jan 15.",
  },
  {
    state: "OH",
    county: "Cuyahoga",
    deadline_month: 3,
    deadline_day: 31,
    notes:
      "Ohio BOR complaint deadline March 31. Annual filing window Jan 1 – March 31.",
  },
  {
    state: "OH",
    county: "Franklin",
    deadline_month: 3,
    deadline_day: 31,
    notes: "Board of Revision complaint deadline March 31.",
  },
  {
    state: "TN",
    county: "Davidson",
    deadline_month: 6,
    deadline_day: 1,
    notes:
      "Tennessee appeal deadline within 45 days of assessment notice. Metro Nashville.",
  },
  {
    state: "TN",
    county: "Shelby",
    deadline_month: 6,
    deadline_day: 1,
    notes: "Tennessee appeal deadline within 45 days of assessment notice.",
  },
  {
    state: "NC",
    county: "Mecklenburg",
    deadline_month: 4,
    deadline_day: 30,
    notes: "North Carolina Board of Equalization and Review deadline April 30.",
  },
  {
    state: "NC",
    county: "Wake",
    deadline_month: 4,
    deadline_day: 30,
    notes: "Board of Equalization and Review deadline April 30.",
  },
  {
    state: "PA",
    county: "Philadelphia",
    deadline_month: 10,
    deadline_day: 1,
    notes: "Philadelphia Board of Revision of Taxes deadline Oct 1.",
  },
  {
    state: "PA",
    county: "Allegheny",
    deadline_month: 3,
    deadline_day: 31,
    notes: "Board of Property Assessment deadline March 31.",
  },
  {
    state: "MN",
    county: "Hennepin",
    deadline_month: 4,
    deadline_day: 30,
    notes: "Minnesota Tax Court petition deadline April 30.",
  },
  {
    state: "MN",
    county: "Ramsey",
    deadline_month: 4,
    deadline_day: 30,
    notes: "Minnesota Tax Court petition deadline April 30.",
  },
  {
    state: "MO",
    county: "St. Louis City",
    deadline_month: 7,
    deadline_day: 15,
    notes:
      "Missouri State Tax Commission appeal deadline July 15 or 60 days from notice.",
  },
  {
    state: "MO",
    county: "St. Louis",
    deadline_month: 7,
    deadline_day: 15,
    notes:
      "Missouri State Tax Commission appeal deadline July 15 or 60 days from notice.",
  },
  {
    state: "MD",
    county: "Montgomery",
    deadline_month: 4,
    deadline_day: 1,
    notes: "Maryland Property Tax Assessment Appeal Board deadline April 1.",
  },
  {
    state: "MD",
    county: "Prince George's",
    deadline_month: 4,
    deadline_day: 1,
    notes: "PTAAB deadline April 1.",
  },
  {
    state: "VA",
    county: "Fairfax",
    deadline_month: 4,
    deadline_day: 1,
    notes: "Virginia Board of Equalization appeal deadline April 1.",
  },
  {
    state: "VA",
    county: "Arlington",
    deadline_month: 4,
    deadline_day: 1,
    notes: "Board of Equalization appeal deadline April 1.",
  },
  {
    state: "WI",
    county: "Milwaukee",
    deadline_month: 5,
    deadline_day: 1,
    notes: "Wisconsin Board of Review deadline first Monday in May.",
  },
  {
    state: "WI",
    county: "Dane",
    deadline_month: 5,
    deadline_day: 1,
    notes: "Board of Review deadline first Monday in May.",
  },
];

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Return the county deadline entry for the given state and county, or null.
 * Case-insensitive: state compared uppercase, county compared trimmed lowercase.
 * Mirrors Python get_deadline_for_county().
 */
export function getDeadlineForCounty(
  state: string,
  county: string,
): CountyDeadlineEntry | null {
  const stateUpper = state.toUpperCase();
  const countyLower = county.trim().toLowerCase();
  return (
    COUNTY_DEADLINES.find(
      (d) =>
        d.state.toUpperCase() === stateUpper &&
        d.county.toLowerCase() === countyLower,
    ) ?? null
  );
}

// ── Effective deadline ────────────────────────────────────────────────────────

/**
 * Compute the effective tax protest deadline.
 *
 * Priority (mirrors Python compute_effective_deadline):
 *   1. overrideDate if set — returned as-is (YYYY-MM-DD string)
 *   2. countyDeadline resolved to referenceYear — returned as YYYY-MM-DD string
 *   3. null when nothing is configured
 */
export function computeEffectiveDeadline(
  countyDeadline: CountyDeadlineEntry | null,
  overrideDate: string | null,
  referenceYear: number,
): string | null {
  if (overrideDate !== null) {
    return overrideDate;
  }
  if (countyDeadline !== null) {
    const m = String(countyDeadline.deadline_month).padStart(2, "0");
    const d = String(countyDeadline.deadline_day).padStart(2, "0");
    return `${referenceYear}-${m}-${d}`;
  }
  return null;
}

// ── Days remaining ────────────────────────────────────────────────────────────

/**
 * Compute whole days from today (UTC) to the deadline (YYYY-MM-DD).
 * Negative = overdue. Uses integer arithmetic only (no floats).
 * Mirrors Python compute_days_remaining() + sb1103-routes.ts diffDays() semantics.
 */
export function computeDaysRemaining(deadline: string, today: Date): number {
  const [dy, dm, dd] = deadline.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  const td = today.getUTCDate();

  const deadlineMs = Date.UTC(dy, dm - 1, dd);
  const todayMs = Date.UTC(ty, tm - 1, td);
  return Math.trunc((deadlineMs - todayMs) / 86_400_000);
}
