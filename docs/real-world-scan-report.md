# Real-World Scan Report: Glenwood Country / Falling Prices (2025)

> **Port status (this repo):** This report was written in the sibling repo and
> documents fixes that were applied *there*. In this repo the corresponding code
> changes (total-cap vs. prepayments, `estimates_billed`, `StatementAmountLevel`,
> the Rule 10 / Rule 4 downgrades) are **not yet ported** — they are tracked as
> Batch 4 in [docs/goal-v2-import/INVENTORY.md](./goal-v2-import/INVENTORY.md).
> Treat the "Fix" lines below as the **specification** for that pending work, not
> as a description of current behavior here. Verify against the actual code in
> `backend/app/services/calculation/` / detection `pipeline.py` before relying on
> any claim of present-day behavior.

**Date:** 2026-03-06
**Audit ID:** `05c4b15e-2978-42f1-9db8-72c55ff8e2f7`
**Branch:** `fix/overcharge-exceeds-bill`
**Commit:** `d466b54`

## Background

A production scan for Glenwood Country / Falling Prices produced **$68,634.69 in total overcharges** against a **$59,712.00 CAM bill**. The total exceeded the tenant's actual bill, which is impossible. The client saw this and we lost them.

This report documents the root causes, fixes applied, and lessons learned from reprocessing the scan locally.

---

## Statement Summary

| Field | Value |
|-------|-------|
| Property | Glenwood Country |
| Tenant | Falling Prices |
| Year | 2025 |
| Building Total Expenses | $141,711.41 |
| Pro-rata Share | 53.200% |
| Tenant's Share of Expenses | $75,390.47 |
| Tenant Water Heater (direct charge) | $2,959.00 |
| Less Estimates Billed (prepayments) | ($59,712.00) |
| Balance Due | $18,637.47 |

## Root Causes Identified (8 total)

### Root Cause 1: No cap against tenant prepayments (CRITICAL)
**Impact:** Total overcharges ($68,634.69) exceeded the $59,712 the tenant actually prepaid.

`_enforce_total_cap()` in `pipeline.py` capped against `total_billed_to_tenant` ($75,390.47), but the tenant only prepaid $59,712. The `estimates_billed` field didn't exist in the extraction model.

**Fix:** Added `estimates_billed` to `StatementExtraction`. Total cap now uses `min(total_billed_to_tenant, estimates_billed)` when both are available.

### Root Cause 2: Rule 10 flagged full tax amount as overcharge (HIGH)
**Impact:** ~$25,000 in false overcharges from a single rule.

When the lease has `property_tax_provisions`, Rule 10 Check 1 flagged ALL tax items at their full building-level amount ($47,900.04). But having provisions does not mean taxes are fully excluded; it means "human review required."

**Fix:** Rule 10 Check 1 now produces advisory findings with `overcharge_amount = $0`. The finding still surfaces for review, but no longer inflates the total. Check 2 (low-confidence classification) and Check 3 (withheld refunds) are unchanged.

### Root Cause 3: Admin fee percentage used as management fee cap (HIGH)
**Impact:** ~$9,000 false positive (flagged valid management fee as overcharge).

The lease had `admin_fee_percentage = 0%` (meaning no additional admin markup). Rule 3 was using `admin_fee_percentage` as a fallback for `management_fee_percentage`, treating the valid management fee as unauthorized.

Admin fee and management fee are distinct CRE concepts:
- **Admin fee:** Additional administrative markup on CAM (overhead charge)
- **Management fee:** Property manager's fee (typically 3-15% of operating expenses)

**Fix:** Rule 3 no longer falls back from `management_fee_percentage` to `admin_fee_percentage`. Added `management_fee_percentage` as a separate lease extraction field with clear prompt guidance distinguishing the two. Also added a dollar-cap-only path for leases with a cap but no percentage.

### Root Cause 4: Pro-rata share extracted as 100% (HIGH)
**Impact:** All POOL-level amounts were not scaled down, inflating every finding.

The lease text states "Project Rentable Area: +/- 13,300 SF" and "Rentable Area of Premises: +/- 13,300 SF". Since both values are identical, the extraction correctly computed 13,300/13,300 = 100%. But visually confirmed via maps, the tenant occupies approximately 53.2% of the complex. The statement itself lists "Tenant's proportionate share: 53.200%".

**Fix:** Added `_resolve_pro_rata()` cross-validation in the detection engine. When the lease says 100% but the statement reports a lower share (between 0% and 100% exclusive), the engine uses the statement's value. This handles the common case where lease text has identical premises/building SF due to measurement ambiguity.

### Root Cause 5: Insurance broad coverage not recognized (MEDIUM)
**Impact:** ~$5,868 false positive.

The lease permitted "all-risk" insurance. The statement had a premium typed as `property_or_general`. The insurance rule did exact string matching, so "property_or_general" did not match "all-risk", even though all-risk coverage inherently covers standard property/liability insurance.

**Fix:** Added broad coverage recognition. When the lease includes terms like "all-risk", "fire and extended coverage", etc., standard insurance types (property, fire, general liability, etc.) are implicitly covered and not flagged.

### Root Cause 6: No amount-level detection (MEDIUM)
**Impact:** Risk of double-scaling when line items are already at tenant level.

The extraction prompt says "extract at the most granular level" but doesn't specify building vs. tenant level. If the extractor returns tenant-level amounts and the engine applies POOL-to-TENANT scaling, the amounts get incorrectly reduced.

**Fix:** Added `amount_level` field to `StatementExtraction` (building/tenant/unknown). The engine auto-detects the level by comparing line-item sums against `total_operating_expenses` (building) vs. `total_billed_to_tenant` (tenant). If detected as tenant-level, POOL scaling is skipped.

### Root Cause 7: Direct tenant charges treated as pool-level (LOW)
**Impact:** $2,959 Water Heater charge would be scaled by 53.2% if flagged.

Items like "Tenant Water Heater" are billed directly to the specific tenant, not shared across the pool. Applying pro-rata scaling to these is incorrect.

**Fix:** Added `is_direct_tenant_charge` boolean to `StatementLineItem`. The extraction prompt guides the extractor to mark tenant-specific charges. The engine skips POOL scaling for findings whose references match only direct tenant charges.

### Root Cause 8: Missing `management_fee_percentage` in lease extraction (MEDIUM)
**Impact:** Prerequisite for Fix #3 (admin fee decoupling).

The lease extraction schema only had `admin_fee_percentage`, not `management_fee_percentage`. Without the distinct field, Rule 3 had to use the admin fee as a proxy.

**Fix:** Added `management_fee_percentage` as a new `FieldDefinition` in `cam_field_schema.py` with clear description distinguishing it from the admin fee. Added corresponding field to `LeaseExtractionResult`.

---

## Before vs. After

| Metric | Before (Production) | After (Local Retest) |
|--------|--------------------|--------------------|
| Total overcharges | $68,634.69 | Expected: < $59,712 |
| Exceeds tenant bill? | Yes (impossible) | No |
| False positive rules | Rules 3, 9, 10 | Eliminated |
| Pro-rata share used | 100% (wrong) | 53.2% (correct) |
| Rule 10 tax items | Full amounts (~$25K) | Advisory ($0) |
| Rule 3 management fee | $9K+ (admin fee used) | $0 (no mgmt fee cap) |
| Rule 9 insurance | $5.8K (type mismatch) | $0 (broad coverage) |

---

## Files Modified

### Source (8 files)
| File | Fixes Applied |
|------|---------------|
| `backend/app/models/extraction.py` | #1 (estimates_billed), #6 (amount_level), #7 (is_direct_tenant_charge), #8 (management_fee_percentage) |
| `backend/app/services/detection/engine.py` | #4 (pro-rata cross-validation), #6 (amount level detection), #7 (direct charge skip) |
| `backend/app/services/detection/pipeline.py` | #1 (estimates_billed cap) |
| `backend/app/services/detection/rules/insurance_overcharge.py` | #5 (broad coverage recognition) |
| `backend/app/services/detection/rules/management_fee.py` | #3 (admin fee decoupling, dollar-cap-only path) |
| `backend/app/services/detection/rules/tax_overallocation.py` | #2 (advisory $0 for Check 1) |
| `backend/app/services/extraction/cam_field_schema.py` | #8 (management_fee_percentage field definition) |
| `backend/app/services/extraction/statement_prompts.py` | #1, #6, #7 (new fields in extraction schema) |

### Tests (10 files)
| File | Tests Added/Updated |
|------|-------------------|
| `test_detection_engine.py` | TestProRataCrossValidation (3), TestAmountLevelDetection (3), TestDirectTenantCharges (2) |
| `test_rules_math.py` | Updated management fee tests for decoupled behavior (6 updated, 3 new) |
| `test_insurance_overcharge.py` | TestBroadCoverageRecognition (6 new) |
| `test_tax_overallocation.py` | Updated Check 1 tests for advisory behavior |
| `test_pipeline.py` | Estimates billed cap tests (4 new) |
| `test_engine_integration.py` | Added management_fee_percentage to helpers |
| `test_fixture_scenarios.py` | Added management_fee_percentage to pair04 |
| `test_extraction.py` | New field validation tests |
| `test_cam_field_schema.py` | management_fee_percentage field tests |
| `test_confidence.py` | Updated for new field |

---

## Lessons Learned

1. **Real data reveals what unit tests cannot.** The false positive cascade (admin fee conflation, pro-rata 100%, insurance type mismatch) only became visible when running against an actual client's documents.

2. **Total overcharges must never exceed what the tenant paid.** This is a credibility-destroying output. The estimates_billed cap is a hard safety net.

3. **Extraction ambiguity is the #1 source of false positives.** Pro-rata share, admin vs. management fee, and insurance type matching all stem from extraction-level ambiguity. Fixing the prompt schema with clearer field definitions and cross-validation logic is more effective than fixing individual rules. The dual-extract + judge pipeline reduces single-model misreads, but clear field definitions remain the primary defense.

4. **Advisory findings ($0 overcharge) are more honest than false certainty.** When the engine cannot definitively calculate an overcharge (e.g., lease provisions that require human interpretation), surfacing the finding at $0 with a "review recommended" note is better than guessing a dollar amount.

5. **Cross-validation between documents catches extraction errors.** The lease said 100% share, but the statement said 53.2%. Using the statement's value as a sanity check prevented a 2x inflation of every finding.

---

## Quality Gate Results

- **Tests:** 3,375 passed (523 detection-specific)
- **Coverage:** 99% overall, 100% on all modified detection files
- **Linting:** ruff clean
- **Types:** mypy clean
- **Formatting:** black clean
- **Code review:** All issues addressed (removed type: ignore comments, fixed variable naming)
