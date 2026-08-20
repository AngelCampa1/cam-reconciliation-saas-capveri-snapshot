# Anomaly Detection and Historical Analysis Architecture

## Overview

This document defines the architecture for historical expense analysis, including year-over-year comparisons, trend analysis charts, anomaly detection, and comprehensive reporting.

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Variance-based detection | ✅ **IMPLEMENTED** | 10%/20% thresholds working |
| Category change detection | ✅ **IMPLEMENTED** | NEW/MISSING pool detection |
| Fuzzy pool matching | ✅ **IMPLEMENTED** | Using 80% Levenshtein threshold |
| YoY comparison UI | ✅ **IMPLEMENTED** | 5%/15% color thresholds |
| Cross-pool outlier detection | ✅ **IMPLEMENTED** | MAD-based modified Z-score (robust for small samples) |
| ARIMA trend analysis | ✅ **IMPLEMENTED** | AR(1) per pool, 95% CI, requires ≥3 data points |
| Historical data loading | ✅ **IMPLEMENTED** | Queries GL entries via pool_mappings patterns |

## Technology Stack

- **Charts**: Recharts (React-native, TypeScript support)
- **ML/Statistics**: numpy, statsmodels (Python)
- **Fuzzy Matching**: Levenshtein distance (python-Levenshtein)
- **Export**: openpyxl (Excel), react-pdf (PDF reports)

## Anomaly Detection Algorithm

### Detection Method: Hybrid Approach

We use a combination of statistical methods for different anomaly types:

1. **AR(1) via ARIMA** - Per-pool trend break detection using 95% confidence interval (≥3 historical points required) - **✅ IMPLEMENTED**
2. **Modified Z-score (MAD-based)** - Cross-pool outlier detection using Median Absolute Deviation (robust for 3–9 sample sizes; replaces Isolation Forest which is unreliable at small N) - **✅ IMPLEMENTED**
3. **Standard Deviation** - Simple threshold-based variance detection (10%/20% thresholds) - **✅ IMPLEMENTED**

### Configuration

```python
# backend/app/core/config.py
class AnomalyDetectionConfig(BaseSettings):
    # Variance thresholds
    WARNING_THRESHOLD: Decimal = Decimal("0.10")  # 10% variance = amber
    CRITICAL_THRESHOLD: Decimal = Decimal("0.20")  # 20% variance = red

    # Statistical thresholds
    STD_DEV_MULTIPLIER: float = 2.0  # >2 std dev from 3-year mean = anomaly

    # ML model parameters
    MODIFIED_ZSCORE_THRESHOLD: float = 3.5  # MAD-based outlier threshold
    ARIMA_ORDER: tuple = (1, 0, 0)  # AR(1): autoregressive, no differencing, no MA

    # Fuzzy matching for pool name comparison
    FUZZY_MATCH_THRESHOLD: int = 80  # Levenshtein similarity percentage
```

### Core Detection Service

```python
# backend/app/services/analysis/anomaly_detection.py
from decimal import Decimal
from typing import List, Dict, Optional
from dataclasses import dataclass
from enum import Enum
import numpy as np
from sklearn.ensemble import IsolationForest
from statsmodels.tsa.arima.model import ARIMA
from Levenshtein import ratio as levenshtein_ratio

class AnomalySeverity(str, Enum):
    INFO = "info"       # Notable but not concerning
    WARNING = "warning"  # 10-20% variance
    CRITICAL = "critical"  # >20% variance

class AnomalyType(str, Enum):
    SPIKE = "spike"              # Sudden increase
    DROP = "drop"                # Sudden decrease
    NEW_CATEGORY = "new_category"  # Category not in prior years
    MISSING_CATEGORY = "missing_category"  # Category disappeared
    PATTERN_BREAK = "pattern_break"  # Unusual pattern (e.g., skip years)
    OUTLIER = "outlier"          # Statistical outlier across categories

@dataclass
class DetectedAnomaly:
    pool_name: str
    anomaly_type: AnomalyType
    severity: AnomalySeverity
    current_value: Decimal
    expected_value: Decimal
    variance_percent: Decimal
    explanation: str
    years_affected: List[int]

class AnomalyDetectionService:
    """Detect anomalies in historical expense data."""

    def __init__(self, config: AnomalyDetectionConfig):
        self.config = config

    async def detect_anomalies(
        self,
        property_id: UUID,
        target_year: int,
        comparison_years: List[int],
        db: AsyncSession,
    ) -> List[DetectedAnomaly]:
        """
        Detect all anomalies for a property's expense data.

        Args:
            property_id: Property to analyze
            target_year: Year being analyzed
            comparison_years: Historical years to compare against (3+ recommended)
        """
        anomalies = []

        # Load historical data
        historical_data = await self._load_historical_data(
            property_id, [target_year] + comparison_years, db
        )

        # 1. Variance-based detection (simple threshold)
        anomalies.extend(self._detect_variance_anomalies(historical_data, target_year))

        # 2. Statistical outlier detection (Isolation Forest)
        anomalies.extend(self._detect_statistical_outliers(historical_data, target_year))

        # 3. Trend-based detection (ARIMA)
        anomalies.extend(self._detect_trend_anomalies(historical_data, target_year))

        # 4. New/missing category detection
        anomalies.extend(self._detect_category_changes(historical_data, target_year))

        # Deduplicate and sort by severity
        return self._deduplicate_and_rank(anomalies)

    def _detect_variance_anomalies(
        self,
        data: Dict[str, Dict[int, Decimal]],
        target_year: int,
    ) -> List[DetectedAnomaly]:
        """Detect simple percentage variance anomalies."""
        anomalies = []

        for pool_name, year_data in data.items():
            if target_year not in year_data:
                continue

            current = year_data[target_year]
            prior_years = [v for y, v in year_data.items() if y < target_year]

            if not prior_years:
                continue

            # Calculate 3-year average (or available years)
            avg = sum(prior_years) / len(prior_years)

            if avg == 0:
                continue

            variance = (current - avg) / avg

            if abs(variance) >= self.config.CRITICAL_THRESHOLD:
                severity = AnomalySeverity.CRITICAL
            elif abs(variance) >= self.config.WARNING_THRESHOLD:
                severity = AnomalySeverity.WARNING
            else:
                continue  # No anomaly

            anomaly_type = AnomalyType.SPIKE if variance > 0 else AnomalyType.DROP

            anomalies.append(DetectedAnomaly(
                pool_name=pool_name,
                anomaly_type=anomaly_type,
                severity=severity,
                current_value=current,
                expected_value=avg,
                variance_percent=variance * 100,
                explanation=self._generate_variance_explanation(
                    pool_name, variance, current, avg
                ),
                years_affected=[target_year],
            ))

        return anomalies

    def _detect_statistical_outliers(
        self,
        data: Dict[str, Dict[int, Decimal]],
        target_year: int,
    ) -> List[DetectedAnomaly]:
        """Use Isolation Forest to detect outliers across all categories."""
        anomalies = []

        # Build feature matrix: each row is a category, each column is a year
        years = sorted(set(y for yd in data.values() for y in yd.keys()))
        pool_names = list(data.keys())

        if len(years) < 3 or len(pool_names) < 3:
            return []  # Not enough data for ML

        # Create matrix
        matrix = np.zeros((len(pool_names), len(years)))
        for i, pool in enumerate(pool_names):
            for j, year in enumerate(years):
                matrix[i, j] = float(data[pool].get(year, 0))

        # Fit Isolation Forest
        clf = IsolationForest(
            contamination=self.config.ISOLATION_FOREST_CONTAMINATION,
            random_state=42,
        )
        predictions = clf.fit_predict(matrix)

        # Find outlier rows (categories)
        target_col = years.index(target_year) if target_year in years else -1
        for i, is_outlier in enumerate(predictions):
            if is_outlier == -1:  # Outlier
                pool_name = pool_names[i]
                current = Decimal(str(matrix[i, target_col])) if target_col >= 0 else Decimal("0")

                anomalies.append(DetectedAnomaly(
                    pool_name=pool_name,
                    anomaly_type=AnomalyType.OUTLIER,
                    severity=AnomalySeverity.WARNING,
                    current_value=current,
                    expected_value=Decimal("0"),  # N/A for outliers
                    variance_percent=Decimal("0"),
                    explanation=f"{pool_name} shows unusual patterns compared to other expense categories",
                    years_affected=years,
                ))

        return anomalies

    def _detect_trend_anomalies(
        self,
        data: Dict[str, Dict[int, Decimal]],
        target_year: int,
    ) -> List[DetectedAnomaly]:
        """Use ARIMA to detect deviations from expected trends."""
        anomalies = []

        for pool_name, year_data in data.items():
            years = sorted(year_data.keys())
            if len(years) < 4:  # Need enough history for ARIMA
                continue

            values = [float(year_data[y]) for y in years]

            try:
                # Fit ARIMA model on historical data (excluding target year)
                historical = values[:-1] if years[-1] == target_year else values
                model = ARIMA(historical, order=self.config.ARIMA_ORDER)
                fitted = model.fit()

                # Predict target year
                forecast = fitted.forecast(steps=1)[0]
                actual = float(year_data.get(target_year, 0))

                # Calculate prediction error
                if forecast > 0:
                    error_pct = abs(actual - forecast) / forecast

                    if error_pct > float(self.config.CRITICAL_THRESHOLD):
                        anomalies.append(DetectedAnomaly(
                            pool_name=pool_name,
                            anomaly_type=AnomalyType.PATTERN_BREAK,
                            severity=AnomalySeverity.WARNING,
                            current_value=Decimal(str(actual)),
                            expected_value=Decimal(str(forecast)),
                            variance_percent=Decimal(str(error_pct * 100)),
                            explanation=f"{pool_name} deviates significantly from historical trend",
                            years_affected=[target_year],
                        ))
            except Exception:
                # ARIMA can fail on certain data patterns - skip
                continue

        return anomalies

    def _detect_category_changes(
        self,
        data: Dict[str, Dict[int, Decimal]],
        target_year: int,
    ) -> List[DetectedAnomaly]:
        """Detect new or missing expense categories."""
        anomalies = []

        for pool_name, year_data in data.items():
            years = sorted(year_data.keys())
            has_target = target_year in year_data and year_data[target_year] > 0
            prior_years = [y for y in years if y < target_year]
            has_prior = any(year_data.get(y, 0) > 0 for y in prior_years)

            if has_target and not has_prior:
                # New category
                anomalies.append(DetectedAnomaly(
                    pool_name=pool_name,
                    anomaly_type=AnomalyType.NEW_CATEGORY,
                    severity=AnomalySeverity.INFO,
                    current_value=year_data[target_year],
                    expected_value=Decimal("0"),
                    variance_percent=Decimal("100"),
                    explanation=f"{pool_name} is a new expense category not present in prior years",
                    years_affected=[target_year],
                ))

            elif has_prior and not has_target:
                # Missing category
                prior_avg = sum(year_data.get(y, 0) for y in prior_years) / len(prior_years)
                anomalies.append(DetectedAnomaly(
                    pool_name=pool_name,
                    anomaly_type=AnomalyType.MISSING_CATEGORY,
                    severity=AnomalySeverity.WARNING,
                    current_value=Decimal("0"),
                    expected_value=prior_avg,
                    variance_percent=Decimal("-100"),
                    explanation=f"{pool_name} was present in prior years but missing in {target_year}",
                    years_affected=[target_year],
                ))

        return anomalies

    def _generate_variance_explanation(
        self,
        pool_name: str,
        variance: Decimal,
        current: Decimal,
        expected: Decimal,
    ) -> str:
        """Generate human-readable explanation for variance."""
        direction = "increased" if variance > 0 else "decreased"
        pct = abs(variance * 100)
        return (
            f"{pool_name} {direction} by {pct:.1f}% compared to the 3-year average."
            f"Current: ${current:,.2f}, Expected: ${expected:,.2f}"
        )
```

## Fuzzy Pool Name Matching

For handling renamed pools across years:

```python
# backend/app/services/analysis/pool_matching.py
from Levenshtein import ratio as levenshtein_ratio

class PoolMatchingService:
    """Match pool names across years using fuzzy matching."""

    def __init__(self, threshold: int = 80):
        self.threshold = threshold / 100  # Convert to 0-1

    def find_matches(
        self,
        source_pools: List[str],
        target_pools: List[str],
    ) -> Dict[str, str]:
        """
        Find best matches between source and target pool names.

        Returns mapping of source_name -> target_name for matches above threshold.
        """
        matches = {}
        used_targets = set()

        for source in source_pools:
            best_match = None
            best_score = 0

            for target in target_pools:
                if target in used_targets:
                    continue

                score = levenshtein_ratio(source.lower(), target.lower())
                if score > best_score and score >= self.threshold:
                    best_score = score
                    best_match = target

            if best_match:
                matches[source] = best_match
                used_targets.add(best_match)

        return matches

    def suggest_renames(
        self,
        year1_pools: List[str],
        year2_pools: List[str],
    ) -> List[RenamesSuggestion]:
        """Suggest potential pool renames between years."""
        suggestions = []

        for pool1 in year1_pools:
            for pool2 in year2_pools:
                if pool1 == pool2:
                    continue

                score = levenshtein_ratio(pool1.lower(), pool2.lower())
                if score >= 0.6 and score < 1.0:  # Similar but not identical
                    suggestions.append(RenameSuggestion(
                        year1_name=pool1,
                        year2_name=pool2,
                        similarity=int(score * 100),
                    ))

        return sorted(suggestions, key=lambda s: s.similarity, reverse=True)
```

## Trend Analysis Charts

### Recharts Configuration

```typescript
// frontend/src/features/analysis/components/TrendChart.tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface TrendChartProps {
  data: TrendDataPoint[];
  anomalies: DetectedAnomaly[];
  showTrendline?: boolean;
  yAxisMode?: 'absolute' | 'percentage';
}

export function TrendChart({
  data,
  anomalies,
  showTrendline = true,
  yAxisMode = 'absolute',
}: TrendChartProps) {
  // Calculate trendline using linear regression
  const trendline = useMemo(() => {
    if (!showTrendline || data.length < 2) return null;

    const n = data.length;
    const sumX = data.reduce((sum, d, i) => sum + i, 0);
    const sumY = data.reduce((sum, d) => sum + d.value, 0);
    const sumXY = data.reduce((sum, d, i) => sum + i * d.value, 0);
    const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return data.map((d, i) => ({
      year: d.year,
      trend: intercept + slope * i,
    }));
  }, [data, showTrendline]);

  // Mark anomaly points
  const chartData = data.map((point) => {
    const anomaly = anomalies.find(
      (a) => a.years_affected.includes(point.year)
    );
    return {
      ...point,
      isAnomaly: !!anomaly,
      anomalySeverity: anomaly?.severity,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" />
        <YAxis
          tickFormatter={(value) =>
            yAxisMode === 'percentage'
              ? `${value}%`
              : `$${(value / 1000).toFixed(0)}k`
          }
        />
        <Tooltip
          formatter={(value: number) =>
            yAxisMode === 'percentage'
              ? `${value.toFixed(1)}%`
              : `$${value.toLocaleString()}`
          }
        />
        <Legend />

        {/* Main data line */}
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2}
          dot={(props) => {
            const { cx, cy, payload } = props;
            if (payload.isAnomaly) {
              const color = payload.anomalySeverity === 'critical' ? '#dc2626' : '#f59e0b';
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={8}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={2}
                />
              );
            }
            return <circle cx={cx} cy={cy} r={4} fill="#2563eb" />;
          }}
        />

        {/* Trendline */}
        {trendline && (
          <Line
            type="monotone"
            data={trendline}
            dataKey="trend"
            stroke="#9ca3af"
            strokeDasharray="5 5"
            dot={false}
            name="Trend"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

## Variance Color Thresholds

```typescript
// frontend/src/features/analysis/utils/variance.ts
export type VarianceLevel = 'normal' | 'warning' | 'critical';

export function getVarianceLevel(variancePercent: number): VarianceLevel {
  const absVariance = Math.abs(variancePercent);
  if (absVariance < 5) return 'normal';      // <5% = green
  if (absVariance < 15) return 'warning';    // 5-15% = amber
  return 'critical';                          // >15% = red
}

export const VARIANCE_COLORS: Record<VarianceLevel, string> = {
  normal: 'text-green-600 bg-green-50',
  warning: 'text-amber-600 bg-amber-50',
  critical: 'text-red-600 bg-red-50',
};

// Component usage
export function VarianceBadge({ variance }: { variance: number }) {
  const level = getVarianceLevel(variance);
  const sign = variance >= 0 ? '+' : '';

  return (
    <span className={cn('px-2 py-1 rounded text-sm font-medium', VARIANCE_COLORS[level])}>
      {sign}{variance.toFixed(1)}%
    </span>
  );
}
```

## Historical Analysis Report

### Report Template Structure

```typescript
// frontend/src/features/analysis/types/report.ts
interface HistoricalAnalysisReport {
  property: PropertySummary;
  analysisDate: string;
  yearsCompared: number[];

  executiveSummary: {
    totalExpenseChange: number;
    significantAnomalies: number;
    keyFindings: string[];
  };

  yearOverYearComparison: {
    categories: CategoryComparison[];
    totals: YearTotals[];
  };

  trendAnalysis: {
    chartImageUrl: string;
    trendDirection: 'increasing' | 'decreasing' | 'stable';
    avgAnnualChange: number;
  };

  anomalies: DetectedAnomaly[];

  recommendations: string[];
}
```

### PDF Generation

```python
# backend/app/services/reports/historical_report.py
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet

class HistoricalReportGenerator:
    """Generate PDF historical analysis reports."""

    async def generate(
        self,
        property_id: UUID,
        years: List[int],
        db: AsyncSession,
    ) -> bytes:
        """Generate PDF report and return bytes."""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        # Title
        story.append(Paragraph("Historical Expense Analysis Report", styles['Title']))
        story.append(Spacer(1, 12))

        # Executive Summary
        summary = await self._build_executive_summary(property_id, years, db)
        story.append(Paragraph("Executive Summary", styles['Heading2']))
        story.append(Paragraph(summary, styles['Normal']))
        story.append(Spacer(1, 12))

        # Year-over-Year Table
        yoy_data = await self._get_yoy_comparison(property_id, years, db)
        table = self._build_comparison_table(yoy_data)
        story.append(Paragraph("Year-over-Year Comparison", styles['Heading2']))
        story.append(table)
        story.append(Spacer(1, 12))

        # Anomalies Section
        anomalies = await self.anomaly_service.detect_anomalies(
            property_id, years[-1], years[:-1], db
        )
        story.append(Paragraph("Detected Anomalies", styles['Heading2']))
        for anomaly in anomalies:
            story.append(Paragraph(
                f"<b>{anomaly.pool_name}</b>: {anomaly.explanation}",
                styles['Normal']
            ))

        doc.build(story)
        return buffer.getvalue()
```

## Dependencies

### Currently Installed
Add to `backend/requirements.txt`:
```
python-Levenshtein>=0.21.0
openpyxl>=3.1.0
reportlab>=4.0.0
```

### Installed for Anomaly Detection
```
numpy>=1.24.0
statsmodels>=0.14.0
```

Add to `frontend/package.json`:
```json
{
  "dependencies": {
    "recharts": "^2.10.0",
    "html2canvas": "^1.4.0"
  }
}
```

## File Structure

```
backend/app/services/analysis/
├── __init__.py
├── anomaly_detection.py    # Core anomaly detection
├── pool_matching.py        # Fuzzy matching service
├── trend_analysis.py       # ARIMA trend analysis
├── yoy_comparison.py       # Year-over-year comparison
└── reports/
    └── historical_report.py  # PDF report generator

frontend/src/features/analysis/
├── components/
│   ├── TrendChart.tsx           # Recharts line chart
│   ├── YoYComparisonTable.tsx   # Comparison table
│   ├── AnomalyList.tsx          # Anomaly display
│   ├── VarianceBadge.tsx        # Color-coded variance
│   └── ReportDownloadButton.tsx # PDF/Excel export
├── hooks/
│   ├── useHistoricalData.ts
│   └── useAnomalyDetection.ts
├── utils/
│   └── variance.ts              # Variance calculations
└── types/
    └── index.ts
```
