/**
 * Trend Analysis Chart Component
 *
 * Displays expense trends over multiple years with:
 * - Linear regression trendline
 * - Anomaly highlighting
 * - Configurable Y-axis scaling
 */

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TrendDataPoint, DetectedAnomaly } from '../types'
import { formatMoney } from '@/lib/money'

// Design token colors for Light-Only Mode compatibility
const CHART_COLORS = {
  line: 'hsl(var(--chart-3))',
  critical: 'hsl(var(--error))',
  warning: 'hsl(var(--warning))',
  dotStroke: 'hsl(var(--background))',
  trendline: 'hsl(var(--muted-foreground))',
} as const

export interface TrendChartProps {
  data: TrendDataPoint[]
  anomalies: DetectedAnomaly[]
  showTrendline?: boolean
  yAxisMode?: 'absolute' | 'percentage'
}

interface TrendlinePoint {
  year: number
  trend: number
}

export function TrendChart({
  data,
  anomalies,
  showTrendline = true,
  yAxisMode = 'absolute',
}: TrendChartProps) {
  // Convert data to percentages if needed (percentage change from first year)
  const chartData = useMemo(() => {
    if (yAxisMode === 'absolute' || data.length === 0) return data

    const baselineValue = data[0]?.value ?? 0
    if (baselineValue === 0) return data // Avoid division by zero

    return data.map((d) => ({
      ...d,
      value: ((d.value - baselineValue) / baselineValue) * 100,
    }))
  }, [data, yAxisMode])

  // Calculate trendline using linear regression
  const trendline = useMemo<TrendlinePoint[] | null>(() => {
    if (!showTrendline || chartData.length < 2) return null

    const n = chartData.length
    const sumX = chartData.reduce((sum, _, i) => sum + i, 0)
    const sumY = chartData.reduce((sum, d) => sum + d.value, 0)
    const sumXY = chartData.reduce((sum, d, i) => sum + i * d.value, 0)
    const sumX2 = chartData.reduce((sum, _, i) => sum + i * i, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    return chartData.map((d, i) => ({
      year: d.year,
      trend: intercept + slope * i,
    }))
  }, [chartData, showTrendline])

  const formatValue = (value: number) =>
    yAxisMode === 'percentage'
      ? `${value.toFixed(1)}%`
      : formatMoney(value, 'usd', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        {yAxisMode === 'percentage'
          ? 'Expense change from the first year, by year. The same numbers are in the table below.'
          : 'Total expense by year. The same numbers are in the table below.'}
      </figcaption>
      {/* The chart itself is decorative for assistive tech: Recharts renders an
          SVG with no usable data semantics. Hide it and expose the numbers
          through the visually-hidden table that follows. */}
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis
              tickFormatter={(value: number) =>
                yAxisMode === 'percentage'
                  ? `${value}%`
                  : `$${(value / 1000).toFixed(0)}k`
              }
            />
            <Tooltip
              formatter={(value) =>
                yAxisMode === 'percentage'
                  ? `${Number(value).toFixed(1)}%`
                  : formatMoney(Number(value), 'usd', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })
              }
            />
            <Legend />

            {/* Main data line with anomaly highlighting */}
            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS.line}
              strokeWidth={2}
              name="Actual"
              dot={(props) => {
                const { cx, cy, payload } = props
                const anomaly = anomalies.find((a) =>
                  a.years_affected.includes(payload.year as number)
                )
                if (anomaly) {
                  const color =
                    anomaly.severity === 'critical'
                      ? CHART_COLORS.critical
                      : CHART_COLORS.warning
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={8}
                      fill={color}
                      stroke={CHART_COLORS.dotStroke}
                      strokeWidth={2}
                    />
                  )
                }
                return <circle cx={cx} cy={cy} r={4} fill={CHART_COLORS.line} />
              }}
            />

            {/* Trendline */}
            {trendline && (
              <Line
                type="monotone"
                data={trendline}
                dataKey="trend"
                stroke={CHART_COLORS.trendline}
                strokeDasharray="5 5"
                dot={false}
                name="Trend"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>
          {yAxisMode === 'percentage'
            ? 'Expense change from the first year, by year'
            : 'Total expense by year'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">
              {yAxisMode === 'percentage' ? 'Change' : 'Expense'}
            </th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((d) => (
            <tr key={d.year}>
              <th scope="row">{d.year}</th>
              <td>{formatValue(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
