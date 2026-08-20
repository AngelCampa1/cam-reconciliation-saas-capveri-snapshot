"""
Extraction prompts for lease document processing.

This module contains structured prompts for extracting "Financial DNA"
(recovery terms) from commercial lease documents using the active document
reader.
"""

# Lease extraction prompt template
LEASE_EXTRACTION_PROMPT = """You are an expert commercial real estate analyst extracting CAM (Common Area Maintenance) reconciliation terms from lease documents.

Your task is to extract the following fields from the lease text and return them as valid JSON matching the exact schema below.

**JSON Schema:**

```json
{
  "base_year": <integer (1990-2100) or null>,
  "base_year_amount": <decimal or null>,
  "gross_up_base_year": <boolean, default false>,
  "pro_rata_share": <decimal 0-1, REQUIRED>,
  "cap_type": <"none" | "non_cumulative" | "cumulative" | "cumulative_compounding">,
  "cap_rate": <decimal 0-1 or null>,
  "admin_fee_percentage": <decimal 0-0.20 or null>,
  "management_fee_percentage": <decimal 0-0.20 or null>,
  "excluded_pools": <array of pool types: "operating" | "tax" | "insurance" | "capital" | "other">,
  "accounting_basis": <"cash" | "accrual" | null>,
  "extractions": [
    {
      "field": "<field_name>",
      "value": "<extracted_value>",
      "confidence": <integer 0-100>,
      "source_text": "<exact quote from document>",
      "page": <integer page number or null>,
      "bounding_box": <{"left": 0-1, "top": 0-1, "width": 0-1, "height": 0-1} or null>
    }
  ]
}
```

**Field Definitions:**

1. **base_year**: The calendar year used as the baseline for expense stop calculations (e.g., 2020). Set to null if not found.

2. **base_year_amount**: A pre-calculated dollar amount frozen as the base year expense (e.g., 50000.00). Set to null if not found.

3. **gross_up_base_year**: Boolean indicating whether to gross-up the base year expenses if occupancy was below 95%. Default is false.

4. **pro_rata_share**: The tenant's proportionate share of expenses as a decimal (REQUIRED field). Examples:
   - "5.25%" → 0.0525
   - "Ten percent" → 0.10
   - "1/20 share" → 0.05
   - "Tenant's proportional share ... base rate of $7.350/sqft" with 2,450 SF
     at $18.00/sqft gross CAM cost → 0.0525

   Do not default to 1.0 merely because a lease is net/NNN or says the tenant
   pays its own premises costs. Use 1.0 only when the lease clearly makes the
   tenant responsible for 100% of the relevant building or common-area expense
   pool. If a CAM rate, tenant square footage, and property/common-area total
   imply a proportionate share, calculate and return that share.

5. **cap_type**: The type of cap applied to annual expense increases. Options:
   - "none": No cap (default)
   - "non_cumulative": Annual cap resets each year (unused capacity lost)
   - "cumulative": Unused capacity carries forward linearly
   - "cumulative_compounding": Exponential growth with banking

6. **cap_rate**: The annual cap rate as a decimal (e.g., "5% annual cap" → 0.05). Required if cap_type is not "none", otherwise null.

7. **admin_fee_percentage**: Administrative fee as a decimal (0-0.20, i.e., 0%-20%). Default is 0 if not found.

8. **management_fee_percentage**: The property manager's fee cap expressed as a
   percentage of operating expenses, as a decimal (0-0.20). Set to null if not found.

   **CRITICAL — Management Fee vs Admin Fee** (very common extraction error):
   - `management_fee_percentage` = a fee capped as a percentage of operating
     expenses. Use for ANY of: "management fee", "property management fee",
     "management/overhead", "management overhead", "overhead cap", "PM fee",
     "administrative and overhead charge", "admin and overhead charge", or ANY
     phrase that caps a fee as a percentage of operating expenses.
   - `admin_fee_percentage` = a flat surcharge added ON TOP of total CAM charges
     (e.g., "15% administrative fee charged on top of all CAM expenses"). This is
     a billing markup, NOT a component of operating expenses.
   - **Example A**: "An administrative and overhead charge equal to 4% of
     operating expenses" → `management_fee_percentage = 0.04`,
     `admin_fee_percentage = 0`. (A management fee phrased as "administrative and
     overhead" — it is a percentage of operating expenses.)
   - **Example B**: "management/overhead fee not to exceed 4% of operating
     expenses" → `management_fee_percentage = 0.04`, `admin_fee_percentage = 0`.
   - **Example C**: "Plus Admin Fee 15.00%" or "Administrative Fee 15% of CAM
     total" → `admin_fee_percentage = 0.15`, `management_fee_percentage = null`.
     (A billing markup added after the CAM subtotal.)
   - **Key distinction**: fee calculated as X% of operating expenses and included
     IN the CAM pool → `management_fee_percentage`; surcharge added ON TOP of the
     CAM total (appearing after a subtotal line) → `admin_fee_percentage`.
   - **EXCEPTION**: If the text EXPLICITLY labels the charge "Admin Fee",
     "Administrative Fee", or "Administration Fee" AND it appears as an add-on
     line after a CAM subtotal (e.g., "Plus Admin Fee 15%"), always use
     `admin_fee_percentage`. Do NOT move an explicit "Admin Fee" into
     `management_fee_percentage`.
   - REA or common-area agreements may state an "administrative fee",
     "administration fee", or "supervision fee" applied to shared common-area
     costs even when the tenant pays building-level NNN costs directly. Extract
     that stated percentage as `admin_fee_percentage` unless the lease says it
     is a management fee included inside operating expenses.

9. **excluded_pools**: Array of expense pool types excluded from this tenant's recovery. Options: ["operating", "tax", "insurance", "capital", "other"]. Default is empty array.
   - If capital expenditures, capital improvements, replacements, structural
     repairs, depreciation, or amortization are excluded, include "capital".
   - If a capital exclusion has narrow carve-outs (for example capital items
     required by law or cost-saving items amortized over useful life), still
     include "capital" because the ordinary capital pool is excluded.
   - If the lease excludes collection costs, relocation costs, commissions,
     landlord overhead, executive salaries, or similar non-pool items, include
     "other" when the exclusion materially limits recovery.

10. **accounting_basis**: The accounting method for expense recovery. Options:
   - "cash": Expenses recognized when paid (filter by payment date)
   - "accrual": Expenses recognized when incurred (filter by invoice/service date)
   - null: Not specified in the lease (default)
   Look for phrasings like "cash basis", "accrual basis", "cash method", "accrual method", "as incurred", "when paid".
   - "paid" alone usually indicates cash basis only when recovery is expressly
     limited to amounts actually paid during the period.
   - "incurred", "paid or incurred", "costs incurred", invoice/service-date
     language, or GAAP amortization language indicates accrual basis.

11. **extractions**: Array of extraction details for audit trail. Each extraction must include:
   - field: Name of the field extracted
   - value: The extracted value before normalization
   - confidence: Confidence score 0-100 (see guidelines below)
   - source_text: Exact quote from the lease document
   - page: Page number where the source appears when available
   - bounding_box: Bounding box coordinates when available; otherwise null

**Extraction Guidelines:**

1. **Percentage Conversion**: Always convert percentages to decimals:
   - "5.25%" → 0.0525
   - "Ten percent" → 0.10
   - "Twelve and one-half percent" → 0.125

2. **Fraction Conversion**: Convert fractions to decimals:
   - "1/20" → 0.05
   - "3/4" → 0.75

3. **Cap Type Identification**: Look for these phrasings:
   - "annual limit", "cap", "ceiling" → non_cumulative (unless otherwise specified)
   - "cumulative cap", "banked capacity" → cumulative
   - "compounding cap", "cumulative compounding" → cumulative_compounding

4. **Missing Fields**: If a field is not found or cannot be confidently determined, set it to null (or default value for boolean/array fields).

5. **Source Text**: Include the exact phrase or sentence from the lease that supports each extraction. This is critical for human verification.

6. **Confidence Scoring**:
   - **90-100**: Field is explicitly stated with clear language (e.g., "Pro-rata share: 5.25%")
   - **70-89**: Field can be inferred from context or calculations (e.g., "Tenant's 1,500 SF of 30,000 SF building" → 0.05)
   - **50-69**: Field is ambiguous or requires assumptions
   - **0-49**: Very uncertain, multiple interpretations possible

7. **Required vs Optional**:
   - `pro_rata_share` is REQUIRED - you must extract this or return confidence < 50
   - All other fields are optional

**Output Format:**

Return ONLY valid JSON matching the schema above. Do not include markdown code blocks, explanations, or any text outside the JSON structure.

**Lease Document Text:**

"""


def build_extraction_prompt(document_text: str) -> str:
    """Build the full extraction prompt with document text appended.

    DEPRECATED: Use LEASE_EXTRACTION_PROMPT directly with OpenRouterClient.extract()
    which properly separates prompt (instructions) from document_text (content).

    Args:
        document_text: The full text of the lease document.

    Returns:
        Complete prompt ready to send to the LLM.

    Example (FIX EP-1 - correct usage):
        ```python
        from app.services.extraction.prompts import LEASE_EXTRACTION_PROMPT

        response, tokens = await openrouter_client.extract(
            prompt=LEASE_EXTRACTION_PROMPT,  # Instructions
            document_text=lease_text          # Raw document content
        )
        ```
    """
    return f"{LEASE_EXTRACTION_PROMPT}{document_text}"
