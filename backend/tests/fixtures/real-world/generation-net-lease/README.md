# generation-net-lease

NNN standalone lease, Best Buy tenant, Generation Income Properties REIT.

## What This Tests
- NNN extraction (100% pro rata, no cap, no base year)
- REA-based common area sharing (30% of shared common area costs allocated to this parcel)
- 10% admin fee on REA common area costs only

## Lease Summary
- **Property**: Best Buy #812 standalone retail, Ames, Iowa
- **Tenant**: Best Buy (via Duff Daniels LLC)
- **Lease type**: Triple-net (NNN) standalone
- **Rentable sqft**: 45,000
- **Pro rata share**: 100% (building-level)
- **Cap**: None
- **Admin fee**: 10% (on REA common area costs)

## Canonical Truth Table

| Field | Value | Confidence | Notes |
|-------|-------|-----------|-------|
| base_year | null | high | NNN — no base year |
| gross_up_base_year | false | high | Single tenant, moot |
| pro_rata_share | 1.0 | high | Standalone building |
| cap_type | NONE | high | No cap on costs |
| cap_rate | null | high | N/A |
| admin_fee_percentage | 0.10 | high | 10% on REA costs only |
| excluded_pools | [] | high | No exclusions |
| accounting_basis | null | low | Not stated |

## GL Summary (Yardi format)
- **File**: `gl/generation-gl-yardi-2024.csv`
- **Rows**: 71
- **Account codes**: 5110, 5200, 5300, 5310, 5320, 5330, 5410, 5420, 5430, 5550
- **Total amount**: ~$290,600

## Rent Roll Summary (MRI format)
- **File**: `rent-roll/generation-rent-roll-mri-2024.csv`
- **Units**: 1
- **Tenant**: Duff Daniels LLC (Best Buy)
- **Vacant**: 0

## Source
- **Filing**: SEC EDGAR, Generation Income Properties 10-K (EX-10.1)
- **CIK**: 0001651721
- **Filed**: 2024-11-08
- **URL**: https://www.sec.gov/Archives/edgar/data/1651721/000095017024124245/gipr-ex10_1.htm
