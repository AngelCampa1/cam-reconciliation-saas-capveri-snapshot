# CAM Gross-Up Calculator - Formula Reference

> **File**: `docs/assets/cam-gross-up-calculator.xlsx`
> **Generator**: `tools/build-assets/build_cam_calculator.py`
> **Compatible with**: Excel 2016+, Google Sheets, LibreOffice Calc

---

## Overview

This workbook models CAM (Common Area Maintenance) gross-up calculations for commercial leases. It uses native spreadsheet formulas — no VBA, no macros — to produce a fully dynamic, scenario-capable model.

---

## Workbook Structure

| Tab | Purpose |
|-----|---------|
| **Instructions** | How to use, field definitions, formula explanations |
| **Calculator** | Main input + calculation engine |
| **Tenant Allocation** | Up to 10 tenants with pro-rata CAM obligations |
| **Scenario Comparison** | Side-by-side at 85% / 90% / 95% / 100% thresholds |
| **Sample Data** | Pre-populated worked example (read-only) |

---

## Key Cell Map — Calculator Tab

| Cell | Description | Type |
|------|-------------|------|
| `B4` | Building Name | Input (unlocked) |
| `B5` | Total GLA (SF) | Input (unlocked) |
| `B6` | Current Occupied SF | Input (unlocked) |
| `D6` | Occupancy Rate % | Formula (locked) |
| `E6` | Gross-Up Threshold % | Input (unlocked, default 95%) |
| `F6` | Gross-Up Multiplier | Formula (locked) |
| `D15:D24` | Fixed Amount per expense | Formula (locked) |
| `E15:E24` | Variable Amount per expense | Formula (locked) |
| `F15:F24` | Grossed-Up Amount per expense | Formula (locked) |
| `B27` | Total Fixed Expenses | Formula (locked) |
| `B28` | Total Variable Expenses (Actual) | Formula (locked) |
| `B29` | Total Grossed-Up Variable Expenses | Formula (locked) |
| **`B30`** | **Total Grossed-Up CAM Pool** | **Formula — referenced by other tabs** |
| `B31` | Actual CAM Pool (Before Gross-Up) | Formula (locked) |
| `B32` | Gross-Up Impact ($) | Formula (locked) |

---

## Formula Specifications

### 1. Gross-Up Multiplier (F6)

```
=IF(B5=0,"N/A",MIN(E6/(B6/B5),1))
```

**Logic**:
- Zero-guard: If Total GLA (`B5`) = 0, display "N/A" to prevent `#DIV/0!`
- `B6/B5` = Actual Occupancy % (Current Occupied SF ÷ Total GLA)
- `E6/(B6/B5)` = Threshold % ÷ Actual Occupancy %
- `MIN(..., 1)` caps at 1.0 — multiplier never decreases expenses below actual

**Example**: 68,000 occupied ÷ 85,000 GLA = 80% actual occupancy, 95% threshold
→ Multiplier = MIN(95% ÷ 80%, 1.0) = MIN(1.1875, 1.0) = **1.1875**

---

### 2. Occupancy Rate (D6)

```
=IF(B5=0,"N/A",B6/B5)
```

Division-by-zero guard. Displays "N/A" if no GLA entered.

---

### 3. Fixed/Variable Bifurcation (Expense Table, rows 15–24)

**Fixed Amount (col D)**:
```
=IF(ISBLANK(A15),0,IF(B15="Fixed",C15,0))
```

**Variable Amount (col E)**:
```
=IF(ISBLANK(A15),0,IF(B15="Variable",C15,0))
```

Empty rows produce `0` to prevent dirty sums. Column B uses data validation (dropdown: Fixed / Variable).

---

### 4. Grossed-Up Amount Per Expense (col F)

```
=IF(ISBLANK(A15),0,D15+IF($F$6="N/A",E15,E15*$F$6))
```

- Fixed portion is never grossed up (passes through as-is)
- Variable portion is multiplied by the Gross-Up Multiplier (`$F$6`)
- N/A guard: if no building data entered, variable amount used as-is

---

### 5. Total Grossed-Up Variable Expenses (B29)

```
=IF($F$6="N/A",B28,B28*$F$6)
```

Applies the multiplier to the full variable pool. N/A guard prevents errors.

---

### 6. Total Grossed-Up CAM Pool (B30) — the key output

```
=B27+B29
```

Fixed Total + Grossed-Up Variable Total.

---

### 7. Actual CAM Pool (B31)

```
=B27+B28
```

Fixed Total + Actual Variable Total (no gross-up applied). Used to compute the delta.

---

### 8. Gross-Up Impact (B32)

```
=B30-B31
```

Dollar impact of the gross-up provision. This is the amount added to the CAM pool above actual expenses.

---

## Tenant Allocation Tab Formulas

### Pro-Rata Share % (col C)

```
=IF(ISBLANK(A10),0,IF(Calculator!$B$5=0,0,B10/Calculator!$B$5))
```

Tenant Leased SF ÷ Total Building GLA. Returns 0 if tenant row is empty.

### CAM Obligation (col D)

```
=IF(ISBLANK(A10),0,C10*Calculator!$B$30)
```

Pro-Rata Share % × Total Grossed-Up CAM Pool.

### Monthly Estimate (col E)

```
=IF(D10=0,0,D10/12)
```

Annual CAM obligation ÷ 12.

---

## Scenario Comparison Tab Formulas

Each threshold column (B=85%, C=90%, D=95%, E=100%) recalculates independently, pulling live occupancy data from the Calculator tab.

### Per-Column Multiplier (row 12)

```
=IF(Calculator!$B$5=0,"N/A",MIN(B11/(Calculator!$B$6/Calculator!$B$5),1))
```

Where `B11` = the column's threshold value (hardcoded 85/90/95/100%).

### Per-Column Grossed-Up Variable (row 15)

```
=IF(B12="N/A",Calculator!$B$28,Calculator!$B$28*B12)
```

### Per-Column Grossed-Up Pool (row 16)

```
=B13+B15
```

### Per-Column Delta vs. Actual (row 18)

```
=B16-B17
```

Where row 17 = Actual CAM Pool = `Calculator!$B$27+Calculator!$B$28`.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Occupied SF = 0 | Occupancy Rate shows "N/A"; Multiplier shows "N/A"; all calculated cells handle gracefully |
| Occupied SF = Total GLA (100% occupancy) | Multiplier = 1.0 exactly — no gross-up applied |
| Occupancy ≥ Threshold | `MIN(..., 1)` caps multiplier at 1.0 — no expense inflation |
| Empty expense rows | `ISBLANK(A{row})` guards return 0 for all amounts |
| Single tenant | Pro-rata share = 100%; CAM obligation = full pool |

---

## Sample Data Verification

**Meridian Office Center** — 85,000 SF GLA, 68,000 SF occupied (80% actual occupancy)

| Item | Value |
|------|-------|
| Occupancy Rate | 80.0% |
| Gross-Up Threshold | 95.0% |
| Gross-Up Multiplier | 1.1875 |
| Property Tax (Fixed) | $180,000 |
| Insurance (Fixed) | $45,000 |
| Janitorial (Variable) | $62,000 |
| Utilities (Variable) | $88,000 |
| Management Fee (Variable) | $38,000 |
| **Total Fixed** | **$225,000** |
| **Total Variable (Actual)** | **$188,000** |
| **Total Grossed-Up Variable** | **$223,250** (= $188,000 × 1.1875) |
| **Total Grossed-Up CAM Pool** | **$448,250** (= $225,000 + $223,250) |
| Actual CAM Pool | $413,000 |
| **Gross-Up Impact** | **$35,250** |

**Tenant obligations at 95% threshold:**

| Tenant | Leased SF | Pro-Rata | CAM Obligation | Monthly |
|--------|-----------|----------|----------------|---------|
| Tech Corp | 15,000 SF | 17.65% | $79,132.35 | $6,594.36 |
| Law Group | 8,500 SF | 10.00% | $44,825.00 | $3,735.42 |
| Retail Co | 6,200 SF | 7.29% | $32,688.24 | $2,724.02 |

---

## QA Checklist

- [ ] Open in Excel — confirm 5 tabs load
- [ ] Change Occupied SF on Calculator — Occupancy Rate and Multiplier update automatically
- [ ] Change Gross-Up Threshold — Multiplier recalculates
- [ ] Change expense amounts — Summary totals update
- [ ] Add a tenant on Tenant Allocation — CAM Obligation calculates
- [ ] Scenario Comparison reflects Calculator changes live
- [ ] Set Occupied SF = 0 — no `#DIV/0!` errors visible
- [ ] Set Occupied SF = Total GLA — Multiplier = 1.0 (no gross-up)
- [ ] Print preview: landscape orientation, fits on page width
- [ ] Open in Google Sheets — all formulas recalculate correctly

---

*Generated by `tools/build-assets/build_cam_calculator.py` — CapVeri*
