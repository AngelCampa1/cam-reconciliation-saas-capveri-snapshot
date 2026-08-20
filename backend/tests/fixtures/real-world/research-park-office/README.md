# Research Park Office - Single-Tenant Net Lease

## Source
- **Filing**: Exact Sciences Corp 10-K (FY2018), filed 2019-02-21 (Exhibit 10.1)
- **CIK**: 0001124140
- **URL**: https://www.sec.gov/Archives/edgar/data/1124140/000155837019000854/exas-20181231ex101affcb9.htm

## Property
- University Research Park, Building 4, Madison, WI
- 35,000 RSF single-tenant office/R&D building

## Lease Type
Net lease - single tenant pays 100% of all building-level operating costs, taxes, and insurance directly.

## Key Extraction Features
- **100% pro rata share**: Single-tenant building (Section 2.2 explicit)
- **Capital exclusion with exceptions**: Capital items excluded from CAM but qualifying items amortized per GAAP (Section 5.5)
- **Unspecified admin fee**: "Reasonable allowance for overhead" with no fixed percentage
- **Structural exclusions**: Landlord bears foundation, exterior wall, roof, structural costs at sole expense (Section 3.2)
- **GAAP amortization**: Capital items use GAAP useful life schedules

## Canonical Truth (Verified Against Lease Text)

| Field | Value | Source |
|-------|-------|--------|
| `base_year` | `null` | No base year — tenant pays actual costs from commencement |
| `base_year_amount` | `null` | No expense stop |
| `gross_up_base_year` | `false` | Single-tenant building, gross-up moot |
| `pro_rata_share` | `1.0` | 100% — single-tenant building (§2.2 explicit) |
| `cap_type` | `none` | No cap language |
| `cap_rate` | `null` | No cap |
| `admin_fee_percentage` | `null` | "Reasonable allowance for overhead" — no % stated (§5.5) |
| `excluded_pools` | `["capital"]` | Capital excluded except amortized items per GAAP (§5.5) |
| `accounting_basis` | `accrual` | Inferred from GAAP amortization reference (§5.5) |

## What This Tests
- Single-tenant 100% pro rata extraction
- Capital pool exclusion with GAAP amortization exception
- Ambiguous admin fee (no fixed percentage)
- Structural cost exclusion detection
