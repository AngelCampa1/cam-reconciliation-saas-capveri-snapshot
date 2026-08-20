# CAM Recovery Ratio Benchmark Worksheet

**File:** `cam-recovery-ratio-worksheet.xlsx`
**Tool URL:** https://www.capveri.com/tools/cam-recovery-ratio-worksheet
**Generator:** `backend/scripts/lead_magnets/generate_cam_recovery_ratio_worksheet.py`

## Purpose

Helps property managers calculate their CAM recovery ratio and benchmark it against industry norms for their property type. Quantifies dollar leakage (expenses not recovered vs. benchmark) and tracks year-over-year trend.

## Sheets

| Sheet | Contents |
|-------|----------|
| Inputs | Property info, occupancy, current-year CAM figures, 2 prior years, editable market benchmarks |
| Calculations | Recovery ratio, variance to benchmark, dollar leakage, YoY trend, rating |
| Instructions | What recovery ratio means, causes of low ratios, how to use |

## Benchmark Defaults

| Property Type | Default Benchmark |
|---------------|------------------|
| Office | 78% |
| Retail-Strip | 91% |
| Retail-Regional | 87% |
| Industrial | 83% |
| Mixed-Use | 82% |

## Key Formulas

- Recovery Ratio = CAM Recovered / CAM Expenses
- Dollar Leakage = MAX(0, (Benchmark - Actual Ratio) × Expenses)
- Rating = "Above benchmark" / "Within 5% of benchmark" / "Below benchmark — review recommended"
