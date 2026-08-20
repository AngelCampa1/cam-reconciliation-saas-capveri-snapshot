# Property Tax Appeal Recovery Calculator

**File:** `property-tax-appeal-recovery-calculator.xlsx`
**Tool URL:** https://www.capveri.com/tools/property-tax-appeal-recovery-calculator
**Generator:** `backend/scripts/lead_magnets/generate_property_tax_appeal_recovery_calculator.py`

## Purpose

Calculates how much of a successful property tax appeal's savings must be passed through to tenants. Allocates savings pro-rata across up to 5 tenants and shows per-tenant credit amounts, net of appeal costs when the lease permits cost recovery.

## Sheets

| Sheet | Contents |
|-------|----------|
| Inputs | Property, tax year, assessed values, tax rate, appeal costs, cost-recovery provision, tenant roster (5 rows) |
| Calculations | Total savings, net savings after appeal costs, per-tenant allocation table, credit treatment |
| Instructions | How appeals affect CAM, lease provisions, how to communicate adjustments |

## Key Formulas

- Total Tax Savings = Original Bill - Reduced Bill
- Recoverable Appeal Costs = costs × (1 if Yes, 0.5 if Partial, 0 if No)
- Net Savings = MAX(0, Total Savings - Recoverable Costs)
- Per-Tenant Credit = Net Savings × (Tenant GLA / Total Tenant GLA)
