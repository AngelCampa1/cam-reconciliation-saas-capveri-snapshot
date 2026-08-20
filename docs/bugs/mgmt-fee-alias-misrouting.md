# Bug: Management Fee Alias Misrouting (Glenwood Country)

> **Port status (this repo):** Fixed in the sibling repo; **not yet ported here.**
> As of this writing `backend/app/services/extraction/prompts.py` has no
> `management_fee_percentage` field and no "administrative and overhead" →
> management-fee disambiguation guidance, so this misrouting can still occur in
> this repo. Tracked as Batch 4.3 in
> [docs/goal-v2-import/INVENTORY.md](../goal-v2-import/INVENTORY.md). Treat the
> fix below as the **specification** for that pending work.

**Reported:** 2026-03-07
**Status:** Fixed in sibling repo — port pending in this repo (Batch 4.3)
**Branch (sibling):** `fix/mgmt-overhead-cap` (merged there), tests in `test/glenwood-mgmt-cap`
**Rule affected:** Rule 3 — Management Fee Overcharge

---

## Summary

CapVeri missed a $574.56 management fee overcharge on the Glenwood Country lease because the lease describes its management fee cap using the phrase "administrative and overhead charge" rather than "management fee." The extraction model routed this language to `admin_fee_percentage` instead of `management_fee_percentage`. Rule 3 only reads `management_fee_percentage`, so the overcharge was silently dropped — the tenant was never told.

---

## Lease Language

The Glenwood Country lease contains:

> "An administrative and overhead charge equal to four percent (4.0%) of the Project Operating Expenses (except for insurance premiums, taxes and assessments)"

This is a management fee cap expressed as a percentage of operating expenses — the canonical definition of `management_fee_percentage`. However, the word "administrative" in the phrase caused the extractor to route it to `admin_fee_percentage`, which is defined as a flat surcharge added on top of CAM charges (a completely different concept).

---

## The Overcharge

| Step | Value |
|------|-------|
| Total operating expenses | $116,000.00 |
| Management fee billed | $5,500.00 (4.74% of opex) |
| Contractual cap | 4.0% |
| Correct base (opex minus fee line item) | $110,500.00 |
| Fee at the 4% cap | $4,420.00 |
| Building-wide overcharge | $1,080.00 |
| Tenant pro-rata share | 53.2% |
| **Tenant overcharge** | **$574.56** |

---

## Root Cause

Two contributing factors:

**1. "overhead fee" alias on `admin_fee_percentage`**
The alias "overhead fee" was listed under `admin_fee_percentage` in `cam_field_schema.py`. This created ambiguity — any management fee phrased with the word "overhead" was at risk of misrouting.

**2. "administrative and overhead charge" not covered as a management fee alias**
The `management_fee_percentage` field had aliases for "management overhead" and "management/overhead" but not for the "administrative and overhead" phrasing. When the Glenwood lease explicitly used the word "administrative," the extractor defaulted to `admin_fee_percentage`.

**3. No extraction prompt guidance distinguishing the two fields**
The original prompt had no worked examples showing the model that "administrative and overhead" is a management fee in disguise. Without concrete examples, the extractor followed the surface-level word match.

---

## Fix

Three changes to `backend/app/services/extraction/`:

**`cam_field_schema.py`**
- Removed "overhead fee" from `admin_fee_percentage` aliases
- Added "administrative and overhead charge", "administrative and overhead", "admin and overhead" to `management_fee_percentage` aliases
- Strengthened `admin_fee_percentage` description to explicitly state it does NOT cover management/overhead language

**`lease_prompts.py`**
- Added extraction guideline #8: "CRITICAL — Management Fee vs Admin Fee"
- Includes the exact Glenwood phrasing as a worked example (Example A)
- States the key distinction: fee calculated as X% of operating expenses and included IN the CAM pool goes to `management_fee_percentage`; surcharge added ON TOP of CAM total goes to `admin_fee_percentage`

---

## Broader Impact

"Administrative and overhead" is a common landlord euphemism for the property management fee. Leases phrase it this way to obscure that a contractual cap applies. Any tenant with this phrasing in their lease was affected — CapVeri was silently missing their Rule 3 finding before this fix.

---

## Tests Added

- `backend/tests/services/detection/test_glenwood_mgmt_cap.py` — CI-safe regression with hardcoded Glenwood values; runs in every CI build
- `backend/tests/integration/test_glenwood_live.py` — live end-to-end test (OpenRouter dual-extract + judge + detection); marked `@pytest.mark.live`, skipped in CI unless an `OPENROUTER_API_KEY` is present
- `backend/tests/services/extraction/test_cam_field_schema.py` — alias routing assertions added to `TestAliasRouting` class

---

## Part 2: Base Exclusion Bug (Follow-up, 2026-03-07)

**Status:** Fixed
**Branch:** `fix/mgmt-fee-base-exclusions`
**Rule affected:** Rule 3 — Management Fee Overcharge

### Summary

The alias fix (Part 1) correctly routes "administrative and overhead charge" to
`management_fee_percentage`, so Rule 3 now fires. However, Rule 3's base calculation
did not account for the base exclusion language in the same clause:

> "(except for insurance premiums, taxes and assessments)"

This means the management fee base must exclude taxes and insurance before applying
the 4% rate. Rule 3 was using `correct_base = total_opex - billed_fee`, ignoring
the explicit lease carve-outs.

### James Copello's 2025 Verified Numbers

| Item | Amount |
|------|--------|
| Total opex | $141,711.41 |
| Less: Real Estate Tax | -$47,900.04 |
| Less: Insurance | -$5,868.27 |
| Less: Mgmt Fee (circularity removal) | -$16,899.84 |
| **Correct base** | **$71,043.26** |
| Permitted fee (4%) | $2,841.73 |
| Billed mgmt fee | $16,899.84 |
| **Building-wide overcharge** | **$14,058.11** |
| Tenant share (53.2%) | **$7,478.91** |

Before this fix, Rule 3 computed:
- `correct_base` = $124,811.57 (missing $53,768.31 of exclusions)
- `correct_fee` = $4,992.46
- `overcharge` = $11,907.38 — understated by **$2,150.73**

### Fix

Three changes:

**`backend/app/models/extraction.py`**
- Added `management_fee_base_exclusions: list[str]` field to `LeaseExtractionResult`

**`backend/app/services/extraction/cam_field_schema.py`**
- Added `FieldDefinition` for `management_fee_base_exclusions`
- Enum values: `"tax"`, `"insurance"`, `"assessment"`, `"capital"`
- Aliases: "except for", "excluding", "exclusive of", "other than"

**`backend/app/services/extraction/lease_prompts.py`**
- Added extraction guideline #9 explaining base exclusion patterns
- Includes worked example using Glenwood's exact phrasing

**`backend/app/services/detection/rules/management_fee.py`**
- After computing `correct_base = total_opex - billed_fee`, subtract excluded
  tax and insurance amounts if present in `management_fee_base_exclusions`
- `math_proof` now includes `excluded_tax` and `excluded_insurance` for auditability
- Graceful fallback: if exclusion is listed but statement has no amount, skipped

### Tests Added

- `TestGlenwood2025BaseExclusionRegression` in `test_glenwood_mgmt_cap.py` — 5 tests
  using James's exact numbers
- `TestRule3BaseExclusions` in `test_management_fee.py` — 8 unit tests covering:
  no exclusions, tax-only, insurance-only, both, missing amounts (fallback), cap + exclusions, math_proof
- `TestSchemaStructure` and `TestGetField` updated in `test_cam_field_schema.py`
