# Story 18.2: Create Trend Analysis Charts

## Story Info
- **Epic**: Historical Analysis
- **Estimated Hours**: 4
- **Dependencies**: Story 18.1
- **Status**: `pending`

## User Story
Create interactive charts showing expense trends over multiple years with anomaly highlighting.

## Acceptance Criteria
- [ ] Line charts for expense trends (minimum 5 years)
- [ ] Trend trendline/average line on chart
- [ ] Anomaly highlighting for unusual spikes/drops
- [ ] Category filtering
- [ ] Y-axis scaling options (absolute vs. percentage)
- [ ] Export chart as image
- [ ] Mobile-responsive chart sizing
- [ ] Hover tooltip with detailed data

## Technical Specifications

Trend analysis charts using Recharts with configurable thresholds and anomaly detection.

**Reference**: See `docs/architecture/anomaly-detection.md` for full chart patterns.

### Recharts Trend Chart Component

```typescript
// frontend/src/features/analysis/components/TrendChart.tsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
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
    const sumX = data.reduce((sum, _, i) => sum + i, 0);
    const sumY = data.reduce((sum, d) => sum + d.value, 0);
    const sumXY = data.reduce((sum, d, i) => sum + i * d.value, 0);
    const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return data.map((d, i) => ({ year: d.year, trend: intercept + slope * i }));
  }, [data, showTrendline]);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" />
        <YAxis
          tickFormatter={(value) =>
            yAxisMode === 'percentage' ? `${value}%` : `$${(value / 1000).toFixed(0)}k`
          }
        />
        <Tooltip />
        <Legend />

        {/* Main data line with anomaly highlighting */}
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2}
          dot={(props) => {
            const { cx, cy, payload } = props;
            const anomaly = anomalies.find(a => a.years_affected.includes(payload.year));
            if (anomaly) {
              const color = anomaly.severity === 'critical' ? '#dc2626' : '#f59e0b';
              return <circle cx={cx} cy={cy} r={8} fill={color} stroke="#fff" strokeWidth={2} />;
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

### Chart Export to Image

```typescript
// frontend/src/features/analysis/hooks/useChartExport.ts
import html2canvas from 'html2canvas';

export function useChartExport(chartRef: RefObject<HTMLDivElement>) {
  const exportAsImage = useCallback(async (filename: string) => {
    if (!chartRef.current) return;

    const canvas = await html2canvas(chartRef.current);
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }, [chartRef]);

  return { exportAsImage };
}
```

## Test Cases

Test trend chart functionality including:
- Line chart renders with 5+ years of data
- Trendline calculation accurate (linear regression)
- Anomaly points highlighted with correct colors
- Y-axis toggle between absolute and percentage
- Category filtering updates chart
- Export to PNG generates correct image
- Mobile-responsive sizing works

## Definition of Done
- [ ] Trend charts render correctly
- [ ] Minimum 5 years of data supported
- [ ] Trendline calculation accurate
- [ ] Anomaly highlighting configurable
- [ ] Chart filtering works
- [ ] Export to image works
- [ ] Unit tests passing with 95%+ coverage
