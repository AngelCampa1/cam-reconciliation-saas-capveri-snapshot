---
seo_title: "Harris County CAM Gross-Up Calculation"
meta_description: "Master the Harris County commercial lease gross up calculation. Fix HCAD retroactive adjustment errors and bifurcate fixed vs. variable expenses correctly."
primary_keyword: "Harris County commercial lease gross up calculation"
secondary_keywords:
  - "HCAD CAM reconciliation"
  - "Houston office gross up NNN lease"
canonical:"/resources/harris-county-gross-up"
cross_links:
  - /resources/what-is-cam-reconciliation
  - /tools/cam-gross-up-calculator
schema:
  - FAQPage
  - HowTo
---

# Harris County CAM Gross-Up: Why HCAD Adjustments Are Breaking Reconciliations (And How to Fix It)

**Updated:** February 2026 | **Audience:** Controllers and accounting managers at Houston-area commercial PMCs

---

**TL;DR:** Houston's 26.3% office vacancy rate means most Energy Corridor and Galleria leases trigger gross-up clausesâ€”but HCAD's retroactive assessment corrections and improper fixed/variable bifurcation are generating systematic overcharges. This guide walks through the math, the legal exposure, and the correct calculation sequence.

---

## 1. The Houston Gross-Up Problem in Plain Numbers

Take a 100,000-square-foot Class A building in the Energy Corridor. Current occupancy sits at 73%â€”not unusual given the submarket's 22.9% vacancy. The lease's gross-up clause kicks in at 95% occupancy.

Here's where most property managers get it wrong.

**The incorrect approach (what most systems do):**

```
Total variable operating expenses:    $850,000
Gross-up to 95%:                      $850,000 Ã— (95 Ã· 73) = $1,106,164
```

**The correct approach (proper bifurcation first):**

```
Step 1 â€” Separate expense categories:
  Truly variable (utilities, janitorial):  $620,000
  Step-function (management fees at 4%):   $125,000
  Fixed (taxes, insurance, security):      $105,000
                                      â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  Total:                                   $850,000

Step 2 â€” Gross-up only the variable portion:
  $620,000 Ã— (95 Ã· 73) =                  $806,849

Step 3 â€” Add step-function costs unchanged:
  $806,849 + $125,000 =                    $931,849

Step 4 â€” Fixed costs pass through at actual:
  Final grossed-up pool:                   $931,849
```

**The delta:** $1,106,164 âˆ’ $931,849 = **$174,315 tenant overcharge** on a single building in a single year. Multiply that across a 10-property portfolio and you have seven-figure exposure.

Houston's current market conditions make this calculation non-negotiable. With Greenspoint at 49.1% vacancy and FM 1960 at 37.8%, gross-up provisions are triggering on nearly every lease in the MSA. Controllers who haven't audited their gross-up methodology recently have almost certainly been calculating incorrectly.

---

## 2. How HCAD Retroactive Adjustments Break Standard Gross-Up Formulas

Harris County Appraisal District operates on a timeline that doesn't align with CAM reconciliation cycles. Here's the collision that breaks most accounting systems:

**Timeline example:**

- **March 2024:** You close the 2023 CAM reconciliation. Tenant's pro-rata share of property taxes: $125,000. Statement sent.
- **August 2024:** Landlord files a Section 25.25 protest on the 2023 assessed value.
- **November 2024:** HCAD reduces the 2023 assessed value by $2.1M. Tax refund to landlord: $47,200.

**The question your lease probably doesn't answer clearly:** Does that $47,200 refund reduce the tenant's 2023 CAM obligation?

Most standard NNN leases say expenses are calculated on an "incurred" basis. The tax was incurred in 2023 at $125,000. But the landlord received a refund in 2024. Courts in Harris County have increasingly held that landlords must credit retroactive refunds against tenant CAM obligationsâ€”but only if the lease defines "operating expenses" to include reconciliation adjustments.

*Medic Pharmacy, LLC v. AVK Properties, LLC* (Harris County District Court, 2022) established that landlords bear the burden of proving their expense ledgers are properly bifurcated and that tax protest costs (including attorney fees and appraisal consulting) cannot be folded into the CAM pool.

**The gross-up contamination problem:** When accounting systems receive the HCAD credit, they often apply it as a negative expense in the CAM poolâ€”*before* gross-up is applied. This understates the grossed-up pool in a way that may still overcharge tenants if the credit is applied to a combined fixed/variable bucket rather than only to the fixed (property tax) line item.

Correct treatment: property tax adjustmentsâ€”whether credits or supplemental assessmentsâ€”must be tracked separately, applied to the fixed expense bucket *after* gross-up calculation, and communicated to tenants with documentation showing the HCAD notice number and effective period.

---

## 3. Fixed vs. Variable Bifurcation: The Calculation Most Managers Get Wrong

Texas commercial lease law (and BOMA's *Escalation Handbook for Office Buildings*, 3rd ed.) draws a hard line between expense categories. Getting this wrong creates both financial and legal exposure.

### Fixed Expenses (excluded from gross-up)

These costs don't change with occupancy. Do not gross them up.

| Expense Category | Why It's Fixed | Common GL Codes |
|-----------------|----------------|-----------------|
| Ad valorem property taxes | Assessed on building value, not occupancy | 7100â€“7150 |
| Property and liability insurance | Premium set annually by risk profile | 6900â€“6950 |
| Landscaping and exterior maintenance | Contract-based, building-wide | 6400â€“6450 |
| Security services | Staffed at full-building level | 6500â€“6550 |
| Structural repairs | Capital/reserve; occupancy-independent | 8100â€“8200 |

### Variable Expenses (subject to gross-up)

These scale with occupied square footage. Gross them up to the lease threshold.

| Expense Category | Variability Driver | Typical Range |
|-----------------|-------------------|---------------|
| Utilities (electric, gas, water) | Direct function of occupancy | 60â€“80% variable |
| Janitorial services | Per-occupied-floor contracts | 90â€“100% variable |
| Trash removal | Volume-based | 80â€“90% variable |
| HVAC maintenance (occupied floors) | Usage-driven | 50â€“70% variable |

### Step-Function Expenses (gross up cautiously)

Management fees present the trickiest case. A typical 4% management fee on a building with $2M in gross revenues doesn't linearly scale with occupancyâ€”management overhead doesn't drop to 73% of full-occupancy cost just because the building is 73% leased. Courts have split on whether management fees are variable or fixed. Bill Brownfield's *Escalation Handbook* recommends treating them as "semi-variable" and applying occupancy adjustment only to the portion directly tied to tenant services.

**Safe harbor approach for management fees:** Apply gross-up only to the percentage of the management fee that can be documented as variable (typically 40â€“60%). The remainder passes through at actual cost.

---

## 4. Step-by-Step: Correct Gross-Up Calculation for a Partially Occupied Harris County Building

**Scenario:** 85,000 RSF Galleria-area office. Current occupancy: 68%. Lease gross-up threshold: 95%.

### Step 1 â€” Pull the full operating expense register

Get the complete CAM pool from your accounting system. Do not start calculating until you have every line item coded and categorized.

### Step 2 â€” Bifurcate the expense pool

Separate every line item into Fixed, Variable, or Semi-Variable using your GL coding guide. Do not estimateâ€”every dollar needs a category.

```
Fixed expenses total:        $412,000
Variable expenses total:     $538,000
Semi-variable (mgmt fees):    $84,000
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Total operating expenses:  $1,034,000
```

### Step 3 â€” Calculate the gross-up multiplier

```
Gross-up multiplier = Lease threshold Ã· Actual occupancy
                    = 95% Ã· 68%
                    = 1.3971
```

### Step 4 â€” Apply multiplier only to variable expenses

```
Grossed-up variable expenses = $538,000 Ã— 1.3971 = $751,640
```

### Step 5 â€” Apply partial multiplier to semi-variable

```
Management fee variable portion (50%): $42,000 Ã— 1.3971 = $58,678
Management fee fixed portion (50%):    $42,000 Ã— 1.0000 = $42,000
Semi-variable subtotal:                                  = $100,678
```

### Step 6 â€” Add fixed expenses at actual

```
Total grossed-up pool = $751,640 + $100,678 + $412,000 = $1,264,318
```

### Step 7 â€” Handle HCAD adjustments separately

If a property tax credit or supplemental assessment was received for the expense year, apply it only to the fixed expense bucket *after* gross-up:

```
HCAD retroactive credit (2023 tax year): ($31,400)
Adjusted fixed expenses: $412,000 âˆ’ $31,400 = $380,600
Final adjusted pool: $751,640 + $100,678 + $380,600 = $1,232,918
```

### Step 8 â€” Calculate tenant's pro-rata share

```
Tenant RSF: 12,500 SF
Building RSF: 85,000 SF
Pro-rata share: 12,500 Ã· 85,000 = 14.71%
Tenant's grossed-up CAM obligation: $1,232,918 Ã— 14.71% = $181,362
```

Document every step. *Medic Pharmacy* established that landlords who cannot show the bifurcation math lose disputes.

---

## 5. Frequently Asked Questions

### Does the gross-up clause apply to all Houston commercial leases?

No. Gross-up provisions must be explicitly written into the lease. Most Class A office leases in Houston executed after 2015 include them, but older leasesâ€”common in Greenspoint and the Northwest Freeway corridorâ€”often don't. If your lease doesn't include a gross-up provision, you cannot apply one unilaterally. Review the "Operating Expenses" and "Additional Rent" definitions in your lease before any calculation.

### Can landlords include HCAD tax protest attorney fees in the CAM pool?

Under *Medic Pharmacy* (2022), noâ€”unless the lease specifically permits recovery of tax protest costs. Standard leases allow property taxes to pass through, but legal and consulting fees to contest those taxes are generally considered landlord expenses. Check your lease's definition of "Operating Expenses" for language like "costs of contesting assessments" before including these.

### How do we handle a mid-year HCAD supplemental assessment?

If HCAD issues a supplemental tax bill mid-year (common when property ownership transfers or improvements are completed), add it to the fixed expense bucket in the period it's incurred. If the reconciliation has already been sent, issue an amended statement. Do not gross it upâ€”it's a fixed expense regardless of timing.

### What occupancy percentage should we use: leased or occupied?

Most Houston leases specify "leased and occupied" or just "leased." If your lease is silent, BOMA and Texas courts generally apply "leased" percentageâ€”meaning tenants who have signed leases but not yet taken occupancy count toward the occupancy figure. This distinction matters significantly during high-sublease periods like the current Energy Corridor market.

### We received an HCAD refund for a closed reconciliation year. Do we owe tenants money?

Almost certainly yes, if the lease defines operating expenses on an actual-cost basis and includes reconciliation provisions. Issue amended CAM statements for the affected year crediting the refund on a pro-rata basis. The refund applies only to the fixed expense (tax) line; do not adjust the grossed-up variable expense calculation for that year.

---

*Check your Harris County portfolio's gross-up calculations in minutes. [Start Free Trial](/auth/register)*

---

*Related: [What Is CAM Reconciliation?](/resources/what-is-cam-reconciliation) | [CAM Gross-Up Calculator](/tools/cam-gross-up-calculator)*


## Sources
- 1. Houston Office Q4 2025 Quarterly Market Report (Partners Real Estate). https://partnersrealestate.com/research/houston-office-q4-2025-quarterly-market-report/
- 2. HCAD reappraisal and value adjustment process. https://hcad.org/hcad-resources/reappraisal/
- 3. CapVeri research notes: Harris County CAM Gross-Up Crisis. https://github.com/capveri/capveri/blob/master/docs/01-FEB-GTM-Tasks/06%20seo%20content%20expansion/B%20-%20Harris%20County%20CAM%20Gross-Up%20Crisis.md
