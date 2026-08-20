# CAM Reconciliation Excel Template

**File:** `cam-reconciliation-excel.xlsx`
**Tool URL:** https://www.capveri.com/tools/cam-reconciliation-excel
**Generator:** `backend/scripts/lead_magnets/generate_cam_reconciliation_excel.py`

## Purpose

Full working CAM reconciliation workbook for a single tenant. Covers the complete reconciliation workflow: expense pool entry through gross-up, cap calculation, pro-rata allocation, and true-up. Includes a print-ready statement sheet.

## Sheets

| Sheet | Contents |
|-------|----------|
| Inputs | Property/tenant info, 11-category expense table (Budget/Actual/Variance), gross-up settings, cap settings |
| Calculations | 5-step calculation: pool → exclusions → gross-up → cap → pro-rata → true-up |
| Statement | Print-ready formatted statement pulling from Calculations |
| Instructions | How to fill inputs, when gross-up applies, how caps work, pre-send checklist |

## Calculation Steps

1. CAM Pool = sum of actuals + exclusion adjustment
2. Gross-Up = if occupancy < threshold: Pool / Actual Occ% × Target Occ%
3. Cap = MIN(Grossed-Up Pool, Prior Ceiling × (1 + Cap%)) — or full pool if no cap
4. Pro-Rata = Tenant GLA / Total Project GLA
5. True-Up = Annual Share - (Monthly Estimate × 12)
