---
name: cam-expert-auditor
description: Use when answering technical CAM reconciliation questions, validating reconciliation math against lease terms, explaining detection rule logic, computing error amounts, reviewing landlord reconciliation statements for accuracy, advising on lease clause interpretation, or debugging gross-up, cap, pro-rata, or base year calculations. Covers all 12 validation rules with formulas, case law, dollar impact benchmarks, gross-up mechanics, cap structures, pro-rata denominator analysis, base year error compounding, and management fee circularity.
---

# CAM Expert Auditor

Deep technical reference for CAM (Common Area Maintenance) reconciliation validation. Covers all 12 detection rules, calculation formulas, case law, and error benchmarks. Used by landlords and property managers to verify their reconciliations are mathematically correct before sending to tenants — and to understand what tenant auditors will look for.

## Copy Rules (Mandatory)

- **Run the humanizer skill on all user-facing output.** Any findings, dispute content, or copy must pass through the `humanizer` skill before delivery.
- **Em dashes are strictly prohibited.** Use commas, colons, parentheses, or restructure the sentence instead.

---

## Critical Thinking Mandate

**Think independently. Be contrarian when the evidence demands it. Zero deference to authority.**

This is a forensic audit context. The landlord's reconciliation statement is an adversarial document. Treat it as such.

**Required posture:**
- Start from the math. "Looks reasonable" is not analysis.
- If a calculation doesn't match the lease terms, say so explicitly — even if the ERP output looks clean.
- ERP outputs that don't match lease math are wrong. Call it out. Yardi and MRI process AP invoices; they don't validate lease clause compliance.
- If the user's interpretation of a formula or clause conflicts with yours, push back with specific reasoning. Don't fold to social pressure.
- If a finding is genuinely ambiguous, say that too. Overstating errors destroys credibility.

**Red flags for passive analysis:**
- Accepting ERP output as correct without verifying against lease formulas
- Hedging every finding with "might be" or "could potentially" when the math is clear
- Agreeing with a user's conclusion that contradicts the lease text
- Softening findings because the error seems small

**The reconciliation validator's job is to find what was calculated versus what the lease requires.** Any gap is an error. Name it, quantify it, and state it plainly. If you disagree with the user's read of a clause or the math, say so directly. Accurate reconciliations protect landlords from tenant disputes. Being precise when you're right is part of the work.

---

## The Iron Rule: Claude Classifies, Python Calculates

Claude extracts lease parameters and classifies line items. All financial math is deterministic Python. Claude NEVER calculates dollar amounts. Financial figures from Claude are strings; Python parses them to `Decimal` and does all arithmetic. Violations produce hallucinated figures that destroy audit credibility.

---

## Quick Reference: All 12 Rules

Rule IDs skip 7 to 9 (no Rule 8).

| # | Rule | Type | Frequency | Annual Impact (7,500 SF) |
|---|------|------|-----------|--------------------------|
| 1 | Gross Lease Charges | Classification | 5-8% of portfolios | $40K-$105K (highest per-occurrence) |
| 2 | Excluded Service Charges | Classification | 25-35% of audits | $9K-$37.5K |
| 3 | Management Fee Overcharge | Math | 15-25% of leases | $600-$3,600/yr |
| 4 | Pro-Rata Share Error | Math | 40% of reconciliations (Tango 2023) | $5K-$35K |
| 5 | Gross-Up Violation | Classification | 25-35% of audits | Advisory only ($0 billed) |
| 6 | CAM Cap Violation | Math | 15-25% of capped leases | $1.5K-$4K/yr |
| 7 | Base Year Error | Math | 15-25% of gross/modified leases | $2.5K-$20K/yr; $25K-$200K over 10 yrs |
| 9 | Insurance Overcharge | Classification | 20-30% of portfolios | $1.25K-$7.5K |
| 10 | Tax Overallocation | Classification | 20-35% of portfolios | $1.25K-$15K |
| 11 | Utility Overcharge | Classification | 15-25% of leases | $5K-$12K (sub-metering gap) |
| 12 | Common Area Misclassification | Classification | Common alongside Rules 2 & 3 | Varies by tenant-specific item |
| 13 | Controllable Expense Cap | Classification | 15-25% of capped leases | $1.5K-$5K |

**Aggregate recovery for a mid-size tenant (7,500 SF at $12/SF CAM):** $9,000-$45,000/year, representing 10-50% of billed charges. Rules 2 and 11 (CapEx/excluded charges) drive the largest dollar recoveries. Rules 4 and 7 (pro-rata and base year) create the most persistent compounding errors.

---

## Rule 1: Gross Lease Charges

**What it catches:** Line items classified as `non_common_area` OR `landlord_overhead` in a NNN/CAM reconciliation. Non-recoverable regardless of lease type. No lease cross-check needed.

- `non_common_area`: expenses benefiting only one tenant's private space
- `landlord_overhead`: corporate/entity-level costs (executive salaries, corporate legal, asset management fees)

**Detection logic:**
```
FOR each line_item IN cam_reconciliation:
  IF classification IN {non_common_area, landlord_overhead}:
    FLAG → entire amount is overcharge
```

**Most common after:** ownership changes, buildings with mixed lease types (some gross, some NNN).

**Key case:** *Dinnerware Plus Holdings v. Silverthorne Factory Stores* (Colo. App. 2004) — tenant not obligated to pay pass-through charges unless other tenants were similarly obligated. Courts uniformly apply *contra proferentem* (ambiguity construed against drafter/landlord).

---

## Rule 2: Excluded Service Charges

**What it catches:** Items in expense pools that the specific lease explicitly excludes via its `excluded_pools` field.

**Pool-to-classification mapping:**
- CAPITAL pool excluded → flags `capex` items
- INSURANCE pool excluded → flags `insurance` items
- TAX pool excluded → flags `tax` items
- OPERATING pool excluded → flags `opex` and `common_area` items

**Key distinction from Rule 1:** Rule 1 catches items non-recoverable by definition. Rule 2 catches items non-recoverable because this specific lease excludes that pool. The same CapEx item can trigger both.

**Top excluded charges (7.5% tenant share of building cost):**

| Excluded Item | Building Cost | Tenant 7.5% Share |
|---|---|---|
| Capital expenditures (roof, HVAC, structural) | $75K-$500K | $5.6K-$37.5K |
| Executive/corporate salaries | $50K-$200K | $3.75K-$15K |
| Legal fees (landlord litigation, evictions) | $25K-$150K | $1.9K-$11.25K |
| Depreciation/asset write-downs | $50K-$300K | $3.75K-$22.5K |
| Mortgage payments/debt service | $100K-$1M | $7.5K-$75K |
| Advertising/promotion/marketing | $15K-$75K | $1.1K-$5.6K |
| Tenant improvement costs | $30K-$250K | $2.25K-$18.75K |
| Leasing commissions | $20K-$100K | $1.5K-$7.5K |

**Key cases:** *Sheplers v. Kabuto* (D. Kan. 1999); *South Towne Centre v. Burlington Coat Factory* (Ohio App. 1995). See `references/case-law.md`.

---

## Rule 3: Management Fee Overcharge

**What it catches (four sub-cases):**
1. Fee exceeds lease-permitted percentage
2. Fee-on-fee: circular base (fee calculated on total including itself)
3. Fee exceeds a dollar cap in the lease
4. Any fee charged when lease permits 0%

**Math — rate exceeded:**
```
correct_base = total_cam_expenses - billed_management_fee
permitted_fee = correct_base × lease_rate
overcharge = billed_fee - permitted_fee
```

**Math — fee-on-fee (circular base):**
```
# Landlord incorrectly used total-inclusive-of-fee as base:
# fee = rate × (base + fee)  →  fee = (rate × base) / (1 - rate)
correct_fee = base_expenses × rate        # exclude fee from its own base
overcharge = billed_fee - correct_fee
```

**Circularity example:** Base OpEx = $1,000,000. Fee rate = 5%.
- Correct fee: $1,000,000 × 5% = $50,000
- Circular fee: ($1,000,000 × 0.05) / (1 - 0.05) = $52,631.58
- Overcharge: $2,631.58

Worse at 15%: a stated "15% management fee" on total-inclusive becomes 17.647% of the pre-fee pool.

**Industry benchmarks:**
- Retail CAM: 5-15% of operating costs (15% considered "high")
- On-site management: 3-5% of operating expenses
- Hotel benchmark (HVS): 2-4% of gross revenue; 3% most common
- IREM Income/Expense IQ (2023): office $0.74/SF (3.62% of gross rents); industrial $0.32/SF (3.77%)

**Key cases:** *Clear Lake Ctr., L.P. v. Garden Ridge, L.P.*, 416 S.W.3d 527 (Tex. App. 2013) — documented fee-on-fee: 7.5% supervisory fee applied on top of separate management fees; *Johanneson's v. Kraus-Anderson* (Minn. App. 1999) — impermissible fee based on course of dealing. See `references/case-law.md`.

---

## Rule 4: Pro-Rata Share Error

**What it catches:**
1. Statement share % exceeds the lease-specified amount
2. Denominator mismatch (when area data available)

**Rounding tolerance:** Discrepancies under 0.1% are flagged at LOW confidence only — legitimate rounding differences exist.

**Standard formula:** `Pro Rata Share = Tenant SF / Total Building SF`

**GLA vs. GLOA distinction:**
- **GLA (Gross Leasable Area):** Total leasable area including vacant spaces. BOMA ANSI/BOMA Z65.5 standard for retail. Correct denominator for most leases.
- **GLOA (Gross Leased and Occupied Area):** Excludes vacant spaces. Increases each remaining tenant's share. NRTA explicitly warns against this.

**Four denominator manipulations (100,000 SF building, 7,500 SF tenant, $1M total CAM):**

| Manipulation | Correct Share | Manipulated Share | Annual Overcharge |
|---|---|---|---|
| Anchor exclusion (30K SF anchor removed) | 7.50% ($75K) | 10.71% ($107K) | $32,143 |
| GLOA instead of GLA (80% occupied) | 7.50% ($75K) | 9.375% ($93.75K) | $18,750 |
| SF measurement error (7,500 vs 7,000 actual) | 7.00% ($70K) | 7.50% ($75K) | $5,000 |
| Vacant space excluded (25% vacancy) | 7.50% ($75K) | 10.00% ($100K) | $25,000 |

**Key cases:** *Payless ShoeSource v. Dena Trust* (E.D. Cal. 2014) — denominator manipulation from 3.12% to 26.92%; *Accenture LLP v. CSDV-MN Ltd. Partnership* (N.D. Ill. 2007) — "rentable area" excluded parking garage. See `references/case-law.md`.

---

## Rule 5: Gross-Up Violation (Advisory — always $0 overcharge amount)

**What it catches:** Fixed-cost line items (`tax` or `insurance` classification) that appear to have been grossed up.

**CRITICAL:** Rule 5 ALWAYS produces `overcharge_amount = Decimal("0.00")`. Never include in total overcharge summaries. It is an advisory finding only.

**Why $0:** The exact dollar overcharge cannot be determined without the occupancy rate the landlord used. Single-audit mode has no prior-year data to infer the multiplier.

**The core rule — what can and cannot be grossed up:**

| Can Gross Up (Variable) | Cannot Gross Up (Fixed) | Gray Area |
|---|---|---|
| Janitorial / cleaning | Property taxes | Window washing |
| Utilities (building-level) | Building insurance | Building engineering staff |
| Trash removal | Debt service | Security (depends on model) |
| HVAC maintenance | Landscaping | Management fees (% of rent) |

**Standard gross-up formula:**
```
Grossed-Up Variable OpEx = Actual Variable OpEx × (Target Occupancy / Actual Occupancy)
Total Adjusted OpEx = Grossed-Up Variable OpEx + Actual Fixed OpEx (unchanged)
```

**Gross-up targets:** 95% is most common (Holland & Hart, ABA Real Property). Range: 90-100%. Below 60% occupancy, the linear relationship breaks down — flag for manual review.

**The base year trap:** Gross-up MUST apply to BOTH base year and comparison years. If only current year is grossed up but not the base year, tenants pay for occupancy increases rather than real inflation.

**Overcharge example if applied to fixed costs:** Building: 100,000 SF, 70% occupied, Tenant: 10,000 SF (10% share), Fixed insurance: $150,000. Incorrect gross-up: $150,000 / 0.70 = $214,286. Overcharge building-wide: $64,286 ($6,429 tenant share).

---

## Rule 6: CAM Cap Violation

**What it catches:** Charges exceeding the expense cap defined in the lease.

**Three cap types (critical — the industry uses terminology inconsistently):**

| Cap Type | Formula | Notes |
|---|---|---|
| NON_CUMULATIVE | `max = prior_year_actual × (1 + rate)` | Year-over-year compound. No banking. |
| CUMULATIVE (linear) | `max = base × (1 + rate × N) + bank` | Linear growth from base year. Unused headroom banks forward. |
| CUMULATIVE_COMPOUNDING | `max = base × (1 + rate)^N + bank` | Compound growth from base year with bank. |

**Compounded vs. cumulative over 10 years ($100K base, 5% cap, actual 7.5% growth):**

| Year | Actual | Compounded Cap | Linear Cap | Overcharge (vs Linear) |
|---|---|---|---|---|
| 5 | $133,547 | $121,551 | $125,000 | $8,547 |
| 10 | $175,127 | $155,133 | $150,000 | $25,127 |
| 10-yr total overcharge | | | | ~$32,789 |

**Banking trap:** If Year 2 costs rise only 2% against a 5% cap, the unused 3% banks forward. In Year 3, landlord can charge 8% (5% current + 3% carryover). Over volatile cost periods, cumulative caps permit $5K-$15K more than non-cumulative for a mid-size tenant.

**Parsing rule:** The engine must extract the actual mathematical formula from lease text, not rely on labels. "Cumulative" means banking/carry-forward in ICSC materials but means linear/arithmetic in other sources. Parse the formula.

**Controllable vs. uncontrollable (for cap scope):**
- Controllable (subject to cap): management fees, cleaning, landscaping, repairs, security, supplies, administrative
- Uncontrollable (typically uncapped): real estate taxes, insurance, utilities, snow removal, government-mandated costs, union labor

**Reclassification detection (cap evasion):**
```
IF expense classified controllable in Year N-1
  AND same expense classified uncontrollable in Year N:
    FLAG: add back to controllable pool and re-test cap
```

**Example reclassification overcharge:** Janitorial $120K (controllable) jumps to $145K and is reclassified as "uncontrollable" (citing union contract). Correct: keep as controllable, cap at $126K. Hidden overcharge: $19K building-level, $1,425 at 7.5% share.

---

## Rule 7: Base Year Error

**What it catches (three sub-cases):**
1. Billed amount exceeds correct base-year-stop calculation
2. Charges on under-base years (tenant should pay $0 when current < base)
3. Un-grossed base year when lease requires gross-up

**The compounding math:** A base year gross-up error creates a permanent offset baked into every subsequent year.

```
Let s = tenant's pro-rata share
Let V* = correct stabilized variable expense (at target occupancy)
Let V0 = un-grossed base year recorded expense (V0 < V* because low occupancy)
Annual overcharge = s × (V* - V0)       [repeats every year building is stabilized]
10-year cumulative overcharge = 10 × s × (V* - V0)
```

**Dollar impact of a $1.00/SF base year error on 7,500 SF:**
- Annual: $7,500/year, every year, permanently
- 10-year: $75,000 cumulative
- $2.00/SF error: $135,000 over 10 years

**Five most common base year errors:**
1. Partial occupancy year used as base with no gross-up applied
2. One-time expenses included (inflates base; rare benefit to tenant)
3. Recurring expenses excluded (management fees, insurance starting mid-year)
4. Variable expenses not grossed up to 95% occupancy
5. Inconsistent gross-up methodology: base year and comparison years use different targets

**Normalization target:** Code uses `_TARGET_OCCUPANCY = Decimal("0.95")`. Industry standard: 95% (most common), 90-100% range. Base year below 60% occupancy: gross-up relationship becomes speculative.

**Base year vs. expense stop distinction:**
- Base year: actual operating expenses for a specific calendar year (unknown until year closes)
- Expense stop: predetermined fixed dollar amount above which tenant pays (known at signing)
- "Base year stop" = these two made functionally identical

---

## Rule 9: Insurance Overcharge

**What it catches:** Insurance premiums whose coverage type is NOT permitted by the lease.

**Claude extracts:** `insurance_permitted_types` — list of coverage types the lease allows.

**Standard vs. non-standard coverage:**

| Standard (universally recoverable) | Common but not universal | Non-standard (needs explicit lease authorization) |
|---|---|---|
| Commercial general liability (CGL) | Business interruption | Earthquake |
| All-risk property insurance | Commercial umbrella/excess | Flood |
| Workers' compensation | Rental loss | Terrorism (TRIA) |
| | | Environmental/pollution |
| | | D&O |

**Insurance premium market context (CIAB quarterly data):**
- 2023: avg +16.9% (peaked at +20.4% Q1)
- 2024: avg +8.2%
- 2025: avg +1.0% (Q3 first negative quarter at -0.2%)

If lease caps insurance increases and landlord passed 16.9% in 2023, the excess is a Rule 9 overcharge.

**Common sources of insurance overcharges:**
- Broker commission-sharing arrangements (landlord rebates 50-100% of premium to themselves)
- Umbrella/excess liability beyond standard limits
- Earthquake or flood in non-risk zones
- Deductible amounts passed as operating expenses
- Newly added coverage types not in the base year (e.g., earthquake added post-signing)

**Deductible pass-through:** Silence in lease = not recoverable. When the landlord controls the deductible, they should pay it unless casualty was caused by tenant negligence.

**Key cases:** *Tin Tin Corp. v. Pacific Rim Park* (Cal. Ct. App. 2009) — LLC taxes billed through CAM; *London Trocadero v. Picturehouse Cinemas* [2025] EWHC 1247 — insurance commissions not part of "premium payable," repayment ordered. See `references/case-law.md`.

---

## Rule 10: Tax Overallocation

**What it catches (two-pass detection):**

Pass 1: If lease has `property_tax_provisions` — flag all `tax`-classified items at reduced confidence (0.80 damper) because free-text provisions require human review.

Pass 2: Flag `tax` items with low item confidence (0.50-0.70) — may be misclassified expenses masquerading as taxes.

**Common overallocation patterns:**
- Incorrect pro-rata share calculation on taxes
- Applying gross-up to property taxes (fixed cost — never gross up)
- Passing through taxes on landlord-retained vacant space
- Including landlord-initiated special assessments
- California Prop 13 supplemental taxes triggered by landlord's own acquisition

**Prop 13 (California) mechanics:**
- Cal. Const. Art. XIII A: assessed value resets to market value on change of ownership
- Annual increase capped at 2% until next ownership change
- Sale-triggered reassessment = landlord's investment decision; should be excluded from tenant pass-through unless lease explicitly allows it

**Texas distinction:** Market value appraisal as of January 1; mandatory reappraisal at least every 3 years (Tex. Tax Code §25.18). Risk is year-to-year volatility, not one-time sale-triggered jump.

**Tax appeal refunds:** Landlord who wins a tax appeal must pass the refund through to tenants proportionally. Perverse incentive in single-tenant NNN: landlord has no incentive to appeal since 100% passes to tenant (MarksNelson). Assessment over-assessment rate: experts estimate 30-60% of taxable property is over-assessed; fewer than 5% of taxpayers challenge (NTUF).

**Tenant appeal standing:** Even without lease language, tenants paying significant taxes have statutory standing to file their own appeals in most states. Silence in the lease does not deprive the tenant of appeal rights (*Village Supermarkets v. West Orange*, N.J. 1987).

**Documented overcharge magnitude:** OAG case study (2013) — tax pro-rata share errors were the single largest component at $55,421 of $63,614 total overcharges (87%) over six years.

---

## Rule 11: Utility Overcharge

**What it catches:** Utility charges in CAM that may be double-billed to a tenant who already pays directly.

**Trigger:** Lease has `direct_pay_provisions` — tenant pays certain utilities directly to the provider.

**Double-billing scenario:** Tenant has direct electric meter + pays monthly utility bills. Landlord still includes "electricity — common areas" in CAM extending beyond actual common area usage.

**Allocation vs. sub-metering math example:**
- Tenant actual usage: 50,000 kWh/yr at $0.12 = $6,000
- Allocated method: 2,000,000 kWh × 7.5% = 150,000 kWh × $0.12 = $18,000
- Overcharge: $12,000/yr (200% overpayment)

**Notable documented case:** International law firm, 220,000 SF in NYC. Landlord inflated overtime HVAC by ~400% while also double-billing the expense in operating expenses. Five-year total overcharge: $840,000 (CTS Audits).

**Benchmark reference:** EIA Commercial Buildings Energy Consumption Survey (CBECS) tracks electricity expenditure intensity by building type. If electricity is double-counted through direct billing and CAM allocation, the overcharge is material even before gas, water, and HVAC costs are considered.

---

## Rule 12: Common Area Misclassification

**What it catches:** `non_common_area` expenses improperly included in the shared CAM pool.

No lease cross-check needed. By definition, these serve only one tenant's space — pooling them is inherently wrong.

**Common examples:**
- Dedicated HVAC unit for a restaurant tenant's kitchen
- Grease trap cleaning and hood suppression maintenance
- Private entrance or loading dock repairs for one tenant
- Interior lighting in a single tenant's space
- Specialty plumbing for food service tenants

**Key case:** *Tin Tin Corp. v. Pacific Rim Park* (Cal. Ct. App. 2009); *McClain v. Octagon Plaza, LLC* (Cal. App. 2008) — tenants have implied right to review CAM records under covenant of good faith and fair dealing, even if lease is silent on audit rights.

---

## Rule 13: Controllable Expense Cap Violation

**What it catches:** `landlord_overhead` line items — corporate/entity-level costs — passed through as operating expenses.

**Examples of `landlord_overhead`:**
- Executive salaries and compensation
- Off-site accounting and bookkeeping
- Corporate insurance (D&O, E&O)
- Entity-level legal fees (not property-specific)
- Asset management fees (entity-level, not property management)
- Corporate overhead allocated to properties
- Risk management overhead from parent company

---

## Key Formulas Summary

### CAM Cap Structures
```
NON_CUMULATIVE:        cap_N = prior_year_actual × (1 + rate)
CUMULATIVE (linear):   cap_N = base × (1 + rate × N) + bank
CUMULATIVE_COMPOUND:   cap_N = base × (1 + rate)^N + bank
```

### Gross-Up
```
Grossed-Up Variable = Actual Variable / Actual Occupancy × Target Occupancy
Total Adjusted = Grossed-Up Variable + Actual Fixed (no change to fixed)
```

### Management Fee Circularity
```
Correct fee (simple):  fee = base_expenses × rate          (exclude fee from base)
Algebraic correction:  fee = (rate × base_opex) / (1 - rate)   (if lease intends inclusive)
```

### Base Year Compounding
```
Annual overcharge = tenant_share × (stabilized_variable - un_grossed_base_variable)
Cumulative N-year = N × annual_overcharge
```

### Pro-Rata Share
```
Correct share = tenant_SF / total_leasable_SF (GLA)
Overcharge = (billed_share - correct_share) × total_CAM
```

---

## Confidence Scoring

Every Finding carries: `(LLM item confidence) × (lease language weight) × (rule-specific factor)`

| Tier | Composite Score | Report Behavior | In Total Overcharge? |
|---|---|---|---|
| HIGH | >0.80 | Shown prominently | Yes |
| MEDIUM | 0.60-0.80 | "Review recommended" caveat | Yes, flagged |
| LOW | <0.60 | "Possible issue" | No |

**Lease language weight:**
- Provision confidence >= 90%: weight 1.0
- Provision confidence >= 70%: weight 0.85
- No provision found: weight 0.65

**False positive target:** <2%. LOW confidence findings are excluded from the headline overcharge total.

---

## References

For full case law citations, facts, and holdings by rule: `references/case-law.md`

For lease clause vulnerability patterns and protective language: `references/lease-language.md`

For industry data caveats and citation guidance: `capveri-business-context` skill, Industry Data Caveats section.
