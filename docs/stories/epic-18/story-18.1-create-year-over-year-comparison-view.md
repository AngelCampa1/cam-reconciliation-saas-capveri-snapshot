# Story 18.1: Create Year-over-Year Comparison View

## Story Info
- **Epic**: Historical Analysis
- **Estimated Hours**: 4
- **Dependencies**: None
- **Status**: `pending`

## User Story
Build side-by-side comparison view showing current year vs. prior year(s) with variance calculations.

## Acceptance Criteria
- [ ] Select base year and comparison year(s) - up to 3 years
- [ ] Display expense categories with amounts for each year
- [ ] Calculate variance ($ and %) between years
- [ ] Color-code significant variances (green for decrease, red for increase)
- [ ] Handle missing data gracefully (N/A for new categories)
- [ ] Pool name matching handles renamed pools (fuzzy match option)
- [ ] Export comparison to Excel
- [ ] Print-friendly layout

## Technical Specifications

Year-over-year comparison with variance calculations, color-coding, and export capabilities.

**Reference**: See `docs/architecture/anomaly-detection.md` for full analysis patterns.

### Fuzzy Pool Matching

For handling renamed pools across years:
```python
# backend/app/services/analysis/pool_matching.py
from Levenshtein import ratio as levenshtein_ratio

FUZZY_MATCH_THRESHOLD = 0.80  # 80% similarity required

def find_pool_matches(source_pools: List[str], target_pools: List[str]) -> Dict[str, str]:
    """Match pool names using Levenshtein distance."""
    matches = {}
    for source in source_pools:
        best_match = None
        best_score = 0
        for target in target_pools:
            score = levenshtein_ratio(source.lower(), target.lower())
            if score > best_score and score >= FUZZY_MATCH_THRESHOLD:
                best_score = score
                best_match = target
        if best_match:
            matches[source] = best_match
    return matches
```

### Variance Color Thresholds

```typescript
// frontend/src/features/analysis/utils/variance.ts
export function getVarianceLevel(variancePercent: number): 'normal' | 'warning' | 'critical' {
  const abs = Math.abs(variancePercent);
  if (abs < 5) return 'normal';      // <5% = green
  if (abs < 15) return 'warning';    // 5-15% = amber
  return 'critical';                  // >15% = red
}
```

```python
class HistoricalAnalysisService:
    async def get_year_over_year(
        self,
        property_id: UUID,
        years: List[int],
        organization_id: UUID,
    ) -> List[YearOverYearComparison]:
        """Get expense comparison across multiple years."""
        if len(years) < 2:
            raise ValueError("At least 2 years required for comparison")

        years = sorted(years)

        # Get finalized snapshots for each year
        snapshots = await self._get_snapshots_by_years(property_id, years)

        # Build category -> year -> amount mapping
        category_data: Dict[str, Dict[int, Decimal]] = {}

        # ... processing logic
```

## Test Cases

Test year-over-year comparison functionality including:
- Multi-year variance calculations
- Color-coding based on variance thresholds
- Missing data handling
- Pool name matching
- Export to Excel
- Print layout

## Definition of Done
- [ ] YoY comparison calculates correctly
- [ ] Variance color-coding works
- [ ] Missing data handled gracefully
- [ ] Pool matching handles renames
- [ ] Export to Excel works
- [ ] Unit tests passing with 95%+ coverage
