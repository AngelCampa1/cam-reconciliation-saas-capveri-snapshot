# kissimmee-office

Small condo office lease, La Rosa Realty tenant, Kissimmee FL.

## Canonical Truth (Verified Against Lease Text)

| Field | Value | Source |
|-------|-------|--------|
| `base_year` | `null` | No base year — flat rate CAM with annual adjustments |
| `base_year_amount` | `null` | No expense stop |
| `gross_up_base_year` | `false` | No gross-up provision |
| `pro_rata_share` | `null` | Lease says "proportional share" but does not state a fixed % or total denominator |
| `cap_type` | `none` | No cap on CAM increases |
| `cap_rate` | `null` | No cap |
| `admin_fee_percentage` | `0.00` | Management fees explicitly excluded from CAM (§2.4(b)) |
| `excluded_pools` | `["capital", "other"]` | §2.4(b): depreciation, capital, moving, legal, remodeling, roof/structural, commissions, mgmt fees, exec salaries |
| `accounting_basis` | `cash` | Inferred from "actual costs" language and small condo context |

## What This Tests
- Flat CAM rate extraction ($7.350/sqft/yr)
- Explicit admin fee exclusion (0%)
- Extensive excluded pools list (capital, depreciation, management fees, exec salaries, remodeling, structural/roof, legal)
- Cash basis inference from "actual costs" language
- Condo association context with unit-based pro rata language but no source-backed percentage
- Small multi-tenant building with vacancy

## Lease Summary
- **Property**: Condo office unit, Kissimmee, FL
- **Tenant**: La Rosa Realty Kissimmee
- **Lease type**: Small office within condo association
- **Rentable sqft**: 2,450
- **Pro rata share**: Not explicitly stated; do not infer a fixed percentage from the CAM base rate
- **Cap**: None
- **Admin fee**: 0% (explicitly excluded per lease)
- **Excluded pools**: Capital, other (depreciation, capital expenses, management fees, exec salaries, remodeling, structural/roof, legal)
- **CAM rate**: $7.350/sqft/yr

## Source
- **Filing**: SEC EDGAR, La Rosa Holdings Corp 10-K (EX-10.128)
- **CIK**: 0001879403
- **Filed**: 2024-04-16
- **URL**: https://www.sec.gov/Archives/edgar/data/1879403/000121390024033444/ea020177001ex10-128_larosa.htm
