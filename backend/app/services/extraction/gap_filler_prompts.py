"""Per-field prompt templates for the gap-filler pass.

Each template asks the model to extract one specific missing field
from the lease PDF and return minimal JSON.
"""

from __future__ import annotations

# Each prompt returns a JSON object with just the requested field.
# The model has already seen the full PDF (it's passed as the file input).

GAP_FILLER_PROMPTS: dict[str, str] = {
    "pro_rata_share": (
        "Extract the tenant's pro-rata share (proportionate share) from this commercial "
        "lease PDF. This is the fraction of the total building or project that the tenant "
        "occupies, used to calculate the tenant's share of Common Area Maintenance (CAM) "
        "expenses.\n\n"
        "Look for phrases such as:\n"
        "- 'tenant's proportionate share'\n"
        "- 'pro-rata share' or 'pro rata share'\n"
        "- 'tenant's percentage share'\n"
        "- 'rentable area of the premises' divided by 'rentable area of the building'\n"
        "- A percentage (e.g., '5.25%') or decimal (e.g., '0.0525') near these terms\n"
        "- Square footage ratios (tenant RSF / total building RSF)\n\n"
        "If the lease states a percentage (e.g., '5.25%'), convert it to a decimal "
        "string (e.g., '0.0525'). If the lease states a fraction via square footages, "
        "compute the decimal.\n\n"
        "Return JSON with exactly one key:\n"
        '{"pro_rata_share": "<decimal as string, e.g. \\"0.0525\\">"}\n'
        "or\n"
        '{"pro_rata_share": null}\n'
        "if no pro-rata share can be found. Do not return any other keys or commentary."
    ),
    "cap_type": (
        "Extract the type of CAM expense cap from this commercial lease PDF. The cap "
        "limits how much the tenant's CAM charges can increase from year to year.\n\n"
        "Look for phrases such as:\n"
        "- 'controllable expense cap' or 'cap on controllable expenses'\n"
        "- 'cumulative cap' — increases compound, so unused cap capacity carries forward\n"
        "- 'non-cumulative cap' — cap applies separately to each lease year with no "
        "carry-forward\n"
        "- 'lesser of CPI or X%' — cap equals the lesser of two measures\n"
        "- Simply 'expense stop' or 'base year stop' without a cap percentage often "
        "means NONE\n\n"
        "Valid values are exactly one of:\n"
        '- "NONE" — no cap applies (or only a base year / expense stop applies)\n'
        '- "CUMULATIVE" — cumulative cap with carry-forward\n'
        '- "NON_CUMULATIVE" — non-cumulative annual cap, no carry-forward\n'
        '- "LESSER_OF" — cap equals the lesser of two measures (e.g., lesser of CPI '
        "or a fixed percentage)\n\n"
        "Return only lowercase schema values: none, cumulative, non_cumulative, "
        "or cumulative_compounding. Never return uppercase enum names or LESSER_OF.\n\n"
        "Return JSON with exactly one key:\n"
        '{"cap_type": "non_cumulative"}\n'
        "Use null only if there is genuinely not enough information to determine whether "
        "a cap exists:\n"
        '{"cap_type": null}\n'
        "Do not return any other keys or commentary."
    ),
    "cap_rate": (
        "Extract the CAM expense cap rate from this commercial lease PDF. This is the "
        "maximum annual percentage increase allowed for the tenant's CAM charges (or "
        "controllable expenses).\n\n"
        "Look for phrases such as:\n"
        "- 'not to exceed X% per year' (e.g., '5% per year')\n"
        "- 'controllable expenses shall not increase by more than X%'\n"
        "- 'cumulative cap of X% per annum'\n"
        "- 'capped at X% annually'\n"
        "- A percentage near phrases like 'cap', 'not exceed', 'limited to'\n\n"
        "Express the cap rate as a decimal string. For example:\n"
        "- 5% per year → '0.05'\n"
        "- 3% per year → '0.03'\n"
        "- 8% per year → '0.08'\n\n"
        "Return JSON with exactly one key:\n"
        '{"cap_rate": "0.05"}\n'
        "or\n"
        '{"cap_rate": null}\n'
        "if no cap rate is stated. Do not return any other keys or commentary."
    ),
    "base_year": (
        "Extract the base year from this commercial lease PDF. In a base year lease "
        "(also called an expense stop lease), the tenant pays their pro-rata share of "
        "operating expenses that exceed the actual expenses incurred in the base year.\n\n"
        "Look for phrases such as:\n"
        "- 'base year' followed by a calendar year (e.g., 'base year of 2020' or "
        "'base year: 2019')\n"
        "- 'expense stop year'\n"
        "- 'base period'\n"
        "- The lease commencement year identified as the reference year for expense "
        "comparisons\n\n"
        "The value must be a four-digit calendar year integer between 1990 and 2100.\n\n"
        "Return JSON with exactly one key:\n"
        '{"base_year": 2020}\n'
        "or\n"
        '{"base_year": null}\n'
        "if no base year is stated. Do not return any other keys or commentary."
    ),
    "base_year_amount": (
        "Extract the base year expense amount from this commercial lease PDF. This is a "
        "pre-calculated dollar amount representing the tenant's share of operating "
        "expenses for the base year, sometimes called the 'expense stop amount' or "
        "'base rent stop'.\n\n"
        "Look for phrases such as:\n"
        "- 'expense stop of $X.XX per square foot'\n"
        "- 'base year expenses shall not exceed $X,XXX'\n"
        "- 'base year amount' followed by a dollar figure\n"
        "- 'operating expense stop' with a dollar amount\n"
        "- A fixed dollar amount per rentable square foot tied to the base year\n\n"
        "If the amount is expressed per square foot, return that per-square-foot amount "
        "as a decimal string (do not multiply by square footage). Express the value as "
        "a plain decimal string without currency symbols or commas.\n"
        "For example: '$12.50 per RSF' → '12.50', '$45,000' → '45000.00'\n\n"
        "Return JSON with exactly one key:\n"
        '{"base_year_amount": "12.50"}\n'
        "or\n"
        '{"base_year_amount": null}\n'
        "if no base year amount is stated. Do not return any other keys or commentary."
    ),
}
