# Oaks Retail - Shopping Center NNN Lease

## Source
- **Filing**: Third Coast Bancshares S-1, filed 2021-10-15 (Exhibit 10.8)
- **CIK**: 0001781730
- **URL**: https://www.sec.gov/Archives/edgar/data/1781730/000119312521300134/d214992dex108.htm

## Property
- Oaks Shopping Center, 229 Dowlen Road, Beaumont, TX
- ~42,000 sqft shopping center
- Multi-tenant retail

## Lease Type
Triple-net (NNN) - tenant pays proportionate share of all CAM, taxes, and insurance with no base year floor.

## Key Extraction Features
- **No base year**: Pure NNN pass-through from day one
- **Formula-based pro rata share**: Tenant sqft / total leasable sqft (Art. 5.01.D)
- **15% admin fee**: Applied to all three expense pools (Art. 5.01 A/B/C)
- **No cap**: Unlimited expense pass-through
- **Capital reserves included**: Annual reserve charges for future replacements (Art. 5.01.A)
- **Accounting basis**: "Paid or incurred" language suggests accrual

## Canonical Truth (Verified Against Lease Text)

| Field | Value | Source |
|-------|-------|--------|
| `base_year` | `null` | No base year — true NNN with actual cost passthrough |
| `base_year_amount` | `null` | No expense stop |
| `gross_up_base_year` | `false` | No gross-up provision in lease |
| `pro_rata_share` | `0.0762` | Formula: tenant sqft / total leasable sqft (§5.01.D). Assumed 3,200/42,000 |
| `cap_type` | `none` | No cap language anywhere |
| `cap_rate` | `null` | No cap |
| `admin_fee_percentage` | `0.15` | 15% stated 3× in §5.01 A/B/C |
| `excluded_pools` | `[]` | No exclusions — broad inclusion of all expenses including reserves |
| `accounting_basis` | `accrual` | Inferred from "paid or incurred" language (§5.01.A) |

## What This Tests
- NNN lease extraction (no base year, no cap)
- Admin fee detection across multiple pools
- Formula-based pro rata share (not a fixed percentage)
- Expense pool identification (all pools included)
