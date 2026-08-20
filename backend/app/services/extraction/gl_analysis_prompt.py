"""System prompt and user message builder for GL narrative analysis.

The GL analysis prompt guides Claude to identify CAM audit risks, CapEx/OpEx
misclassification, and non-recoverable expenses in GL data before finalization.
"""

import json
from typing import Any

GL_ANALYSIS_SYSTEM_PROMPT = """You are a CRE (Commercial Real Estate) CAM reconciliation expert and CPA. You review GL data from commercial properties to identify errors controllers commonly miss before finalizing CAM reconciliations.

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
"""


def build_gl_analysis_user_message(
    property_name: str,
    period_year: int,
    total_gl_entries: int,
    expense_pools: list[dict[str, Any]],
    accounts: list[dict[str, Any]],
    anomalies: list[dict[str, Any]] | None = None,
) -> str:
    """Build the user message containing GL data for Claude to analyze.

    Accounts are aggregated by account code to reduce token usage and
    focus Claude on meaningful patterns rather than individual transactions.
    The optional anomalies list is a pre-aggregation pass that surfaces
    cross-property entity co-mingling before individual descriptions are
    truncated by the account-level aggregation cap.

    Args:
        property_name: Display name of the property.
        period_year: Fiscal year being analyzed.
        total_gl_entries: Total number of raw GL entries (for context).
        expense_pools: List of expense pool definitions with name and type.
        accounts: List of aggregated account summaries with totals and vendors.
        anomalies: Optional list of pre-aggregation anomaly entries (entity
            co-mingling suspects). Omitted from payload when empty or None
            to avoid sending an empty array that wastes tokens.

    Returns:
        Formatted JSON user message string for the Claude API call.
    """
    payload: dict[str, Any] = {
        "property_name": property_name,
        "period_year": period_year,
        "total_gl_entries": total_gl_entries,
        "expense_pools": expense_pools,
        "accounts": accounts,
    }
    if anomalies:
        payload["anomalies"] = anomalies
    return json.dumps(payload, indent=2, default=str)
