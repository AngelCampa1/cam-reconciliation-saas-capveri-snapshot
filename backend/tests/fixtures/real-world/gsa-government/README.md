# GSA Government - Federal Building Lease

## Source
- **Document**: GSA Form 3517B - General Clauses (Acquisition of Leasehold Interests in Real Property)
- **Publisher**: U.S. General Services Administration
- **URL**: https://www.gsa.gov/system/files/2025-09/GSA3517B-16a.pdf

## Property
- Federal Center Building A (fictional property based on GSA standard terms)
- 28,000 RSF / 24,500 USF government office building
- Single-tenant (full-building GSA lease)

## Lease Type
GSA standard lease - government is sole tenant. Operating costs built into shell rent with CPI-based annual escalation on the operating cost component. Capital improvements handled separately via TI allowance.

## Key Extraction Features
- **CPI-based escalation**: Not a traditional cap - uses CPI index for annual operating cost adjustment
- **No admin/management fee**: GSA standard forms do not include management fees as separate pass-through
- **Capital exclusion**: Capital improvements and alterations excluded from operating costs
- **Federal accounting standards**: Accrual basis per OMB Circular A-136
- **100% pro rata**: Full-building single-tenant lease
- **Long term**: 15-year firm term typical of GSA leases

## Canonical Truth Table

| Field | Value | Confidence | Notes |
|-------|-------|-----------|-------|
| base_year | null | high | No base year |
| gross_up_base_year | false | high | Single tenant, moot |
| pro_rata_share | 1.0 | high | Full-building lease |
| cap_type | NONE | medium | CPI escalation, not a traditional cap |
| cap_rate | null | high | N/A |
| admin_fee_percentage | 0.00 | high | GSA standard — no admin fee |
| excluded_pools | [capital] | high | Capital excluded per GSA 3517B |
| accounting_basis | accrual | medium | Inferred from OMB A-136 |

## GL Summary (Yardi format)
- **File**: `gl/gsa-gl-yardi-2024.csv`
- **Rows**: 84
- **Account codes**: 5110, 5200, 5300, 5310, 5320, 5410, 5420, 5430, 5500, 5510, 5550, 5600
- **Total amount**: ~$763,070

## Rent Roll Summary (MRI format)
- **File**: `rent-roll/gsa-rent-roll-mri-2024.csv`
- **Units**: 1
- **Tenant**: U.S. General Services Administration
- **Vacant**: 0

## What This Tests
- Government lease structure (non-standard CAM framework)
- CPI escalation vs traditional cap interpretation
- Single-tenant full-building extraction
- Capital exclusion in government context
- GSA-specific lease clause language
- **Note**: PDF lease requires the legacy document reader path — LLM extraction test skipped
