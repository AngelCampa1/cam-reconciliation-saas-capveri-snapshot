"""
System prompt and user message builder for cross-document analysis.

Claude reasons across all property documents together to catch issues
that per-document extraction misses.
"""

import json
from decimal import Decimal

from app.services.extraction.cross_doc_models import CrossDocAnalysisInput

# NOTE: Amendment history is not currently included in CrossDocAnalysisInput.
# Claude must infer amendment conflicts from the current recovery_profile only.
# If full amendment history becomes available, add it to CrossDocAnalysisInput
# and update the prompt below accordingly.
CROSS_DOC_ANALYSIS_PROMPT = """You are a CRE (Commercial Real Estate) CAM reconciliation auditor with 20+ years of experience reviewing lease portfolios and GL data for major institutional landlords.

Your task is to perform a CROSS-DOCUMENT analysis across all lease extractions and GL pool data for a property/period. You will identify issues that per-document extraction misses because it cannot correlate across documents.

Focus on:
1. LEASE NUANCES — Identify lease language that the structured extraction may have oversimplified:
   - Conditional clauses that activate only under specific circumstances
   - Amendment conflicts where newer amendments override prior terms
   - Unusual definitions of "Operating Expenses" that exclude standard recoveries
   - Gross lease or modified-gross provisions that limit recovery scope

2. CROSS-DOCUMENT MISMATCHES — Compare lease extraction values against GL pool breakdowns:
   - Does the pro-rata share on the lease match the GL allocation percentages?
   - Do base year amounts align with what was actually billed in that year?
   - Are there tenants with cap provisions whose extracted cap rates seem inconsistent with actual year-over-year GL growth?

3. BILLING ANOMALIES — Flag patterns an auditor would question:
   - Management fees > 5% of total operating expenses
   - Single vendor > 40% of any expense pool
   - Admin fee double-counting (fee charged on admin fee)
   - Allocation methods that appear inconsistent across tenants
   - Year-over-year expense increases > 15% without obvious cause

4. TERM OVERRIDES — When cross-document reasoning reveals a per-document extraction error, produce a TermOverrideSuggestion with the corrected value and your reasoning.

SEVERITY GUIDELINES:
- INFO: Observations worth noting; unlikely to cause billing errors
- WARNING: Likely issues that should be reviewed before finalizing
- CRITICAL: Definite errors or inconsistencies that will cause billing errors

OUTPUT REQUIREMENTS:
You MUST respond with a single valid JSON object matching this schema exactly. Do NOT wrap in markdown code blocks. Do NOT include explanatory text outside the JSON.

Schema:
{
  "property_id": "<uuid>",
  "period_year": <int>,
  "findings": [
    {
      "id": "<uuid>",
      "category": "lease_nuance|cross_doc_mismatch|billing_anomaly|term_override",
      "severity": "info|warning|critical",
      "title": "<short title>",
      "detail": "<detailed explanation>",
      "affected_leases": ["<lease_id>", ...],
      "affected_pools": ["<pool_name>", ...],
      "financial_impact_estimate": <number or null>,
      "source_documents": ["<doc description>", ...],
      "override_suggestion": null or {
        "field_name": "<field>",
        "lease_id": "<uuid>",
        "current_value": "<string>",
        "suggested_value": "<string>",
        "reasoning": "<explanation>",
        "confidence": <0-100>
      }
    }
  ],
  "lease_term_overrides": [
    {
      "finding_id": "<uuid of the related finding in the findings array>",
      "field_name": "<field>",
      "lease_id": "<uuid>",
      "current_value": "<string>",
      "suggested_value": "<string>",
      "reasoning": "<explanation>",
      "confidence": <0-100>
    }
  ],
  "overall_risk_score": <0-100>,
  "analysis_summary": "<2-3 sentence summary>",
  "documents_analyzed": {"leases": <int>, "gl_accounts": <int>},
  "token_usage": 0
}

Rules:
- overall_risk_score: 0 = no issues, 100 = critical issues requiring immediate action
- If no issues found, return empty findings array and risk score 0-10
- Do not fabricate findings not supported by the data
- Be specific: cite tenant names, lease IDs, pool names, account codes
- financial_impact_estimate: estimated dollar impact if issue is not addressed; use negative values when the tenant was overbilled (null if unknown)
- If a finding cites GL, pool, account, prior-year, or billed dollar amounts, financial_impact_estimate must be a numeric estimate rather than null.
"""


def _json_default(obj: object) -> object:
    """Serialize non-standard types for the Claude user message."""
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)


def build_cross_doc_user_message(input_data: CrossDocAnalysisInput) -> str:
    """Serialize CrossDocAnalysisInput as JSON for the Claude user message.

    User-controlled strings (tenant names, vendor names, custom_rules, etc.) are
    included in the payload. JSON serialization handles structural escaping, so
    there is no risk of breaking out of the JSON context. However, these strings
    do influence Claude's reasoning — treat them as untrusted input when evaluating
    Claude's output, and enforce schema validation (CrossDocAnalysisResult) on the
    response rather than trusting Claude's free-form interpretation.

    Retry / circuit-breaker logic lives in OpenRouterClient, not here.

    Args:
        input_data: The assembled cross-doc analysis input.

    Returns:
        JSON string ready to send as the user message to Claude.
    """
    payload = input_data.model_dump()
    return json.dumps(payload, indent=2, default=_json_default)
