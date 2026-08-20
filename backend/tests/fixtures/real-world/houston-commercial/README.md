# houston-commercial

Multi-tenant shopping center with CAM cap, Houston TX (Stella Link area).

## Source
- **Filing**: SEC EDGAR, Neurogene 10-K (EX-10.35)
- **CIK**: 0001404644
- **Filed**: 2023-09-28
- **URL**: https://www.sec.gov/Archives/edgar/data/1404644/000119312523245680/d522068dex1035.htm

## Property
- **Property**: Stella Link Shopping Center, Houston, TX
- **Tenant**: Neurogene Inc (fka Neoleukin)
- **Lease type**: Multi-tenant shopping center NNN with CAM cap
- **Original premises**: 26,905 sqft leasable floor area (§1.1(g))
- **Post-expansion**: 42,342 sqft (all leasable space, First Amendment §1)

## Canonical Extraction Truth

Verified by manually reading the full SEC lease exhibit. All values are what
the extraction pipeline (`LeaseExtractionResult`) should produce.

| Field | Value | Lease Reference |
|-------|-------|-----------------|
| base_year | `null` | Not found in lease |
| base_year_amount | `null` | Not found |
| gross_up_base_year | `false` | No gross-up clause |
| pro_rata_share | `0.6354` or `1.0` | §1.1(l): "63.54%"; First Amendment §8: "100%" |
| cap_type | `non_cumulative` | §4.3 |
| cap_rate | `0.05` | §4.3: "five percent (5%)" |
| admin_fee_percentage | `0.00` | No add-on admin fee after CAM subtotal is stated |
| management_fee_percentage | `0.15` | §23.5: management fees "not to exceed fifteen percent (15%)" |
| excluded_pools | `[]` | Capital included via GAAP amortization (§23.5) |
| accounting_basis | `null` | Not explicitly stated |

### Key Lease Quotes

**Cap (§4.3)**: "Common Area Expenses (excluding non-controllable items such as
utilities & security) in any year shall not be increased by more than five percent
(5%) over the prior year's Common Area Expenses (excluding such non-controllable items)."

**Management fee cap (§23.5)**: "the management fees which Landlord pays for the management
of the Center in an amount not to exceed fifteen percent (15%) of the total of all
other Common Area Expenses." This is a management-fee cap inside Common Area
Expenses, not an add-on admin surcharge.

**Capital amortization (§23.5)**: "to the extent that any item comprising a portion
of Common Area Expenses is a capital expenditure, then such item shall be amortized
over its useful life in accordance with generally accepted accounting principles."

## What This Tests
- Non-cumulative cap extraction (5% year-over-year on controllable expenses)
- 15% management fee extraction
- Pro rata share with amendment (63.54% → 100%)
- Controllable vs non-controllable expense distinction
- Capital expenditure amortization per GAAP (included, not excluded)
- Multi-tenant rent roll with vacancy (synthetic CSVs for parser format testing)

## Note on GL/Rent Roll CSVs
The GL and rent roll CSVs are **synthetic** — hand-crafted for parser format testing.
They use fabricated property dimensions (13,400 sqft total) that do not match the
actual lease (26,905 sqft). This is intentional: the CSVs validate that Yardi/MRI
parsers handle the file format correctly, while the lease PDF validates extraction accuracy.
