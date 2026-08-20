# Admin Fee Calculator

**File:** `admin-fee-calculator.xlsx`
**Tool URL:** https://www.capveri.com/tools/admin-fee-calculator
**Generator:** `backend/scripts/lead_magnets/generate_admin_fee_calculator.py`

## Purpose

Calculates the allowable admin fee on a CAM pool given the lease's excluded categories, fee percentage, and any dollar or percentage cap. Benchmarks the result against the 5–15% commercial market range and compares to the prior year.

## Sheets

| Sheet | Contents |
|-------|----------|
| Inputs | Gross CAM pool, 6 excluded-category rows, lease admin fee %, cap toggle, dollar cap, % cap, prior year data |
| Calculations | Admin fee base, calculated fee, effective cap, allowable fee, benchmark range, YoY comparison |
| Instructions | What admin fee is, lease cap/exclusion structures, common disputes, how to use |

## Key Formulas

- Admin Fee Base = Gross CAM Pool - Sum of Excluded Categories
- Calculated Fee = Base × Lease %
- Effective Cap = MIN(dollar cap, pool × % cap) — whichever is provided
- Allowable Fee = MIN(Calculated Fee, Effective Cap) if capped; else Calculated Fee
- Benchmark check: 5% lower bound, 15% upper bound of Gross CAM Pool
