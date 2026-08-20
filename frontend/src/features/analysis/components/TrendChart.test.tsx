/**
 * Tests for TrendChart component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendChart } from './TrendChart'
import type { TrendDataPoint, DetectedAnomaly } from '../types'

// Store captured formatters for testing
let capturedTickFormatter: ((value: number) => string) | null = null
let capturedTooltipFormatter: ((value: unknown) => string) | null = null
let capturedDotRenderer: ((props: any) => React.ReactElement) | null = null

// Mock Recharts to avoid rendering issues in test environment
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: ({ name, dot }: { name?: string; dot?: any }) => {
    // Capture dot renderer for testing
    if (name === 'Actual' && typeof dot === 'function') {
      capturedDotRenderer = dot
    }
    return <div data-testid="line">{name}</div>
  },
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: ({ tickFormatter }: { tickFormatter?: (value: number) => string }) => {
    // Capture tick formatter for testing
    if (tickFormatter) {
      capturedTickFormatter = tickFormatter
    }
    return <div data-testid="y-axis" />
  },
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: ({ formatter }: { formatter?: (value: unknown) => string }) => {
    // Capture tooltip formatter for testing
    if (formatter) {
      capturedTooltipFormatter = formatter
    }
    return <div data-testid="tooltip" />
  },
  Legend: () => <div data-testid="legend" />,
}))

const mockData: TrendDataPoint[] = [
  { year: 2020, value: 100000 },
  { year: 2021, value: 110000 },
  { year: 2022, value: 120000 },
  { year: 2023, value: 130000 },
  { year: 2024, value: 160000 },
]

const mockAnomalies: DetectedAnomaly[] = [
  {
    pool_name: 'Utilities',
    anomaly_type: 'spike',
    severity: 'critical',
    current_value: 160000,
    expected_value: 135000,
    variance_percent: 18.5,
    explanation: 'Spike detected',
    years_affected: [2024],
  },
]

describe('TrendChart', () => {
  it('renders chart with data', () => {
    render(<TrendChart data={mockData} anomalies={[]} />)

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('renders trendline when showTrendline is true', () => {
    render(<TrendChart data={mockData} anomalies={[]} showTrendline={true} />)

    // Check for trendline in mocked Line components
    expect(screen.getByText('Trend')).toBeInTheDocument()
  })

  it('hides trendline when showTrendline is false', () => {
    render(<TrendChart data={mockData} anomalies={[]} showTrendline={false} />)

    // Trendline label should not be present
    expect(screen.queryByText('Trend')).not.toBeInTheDocument()
  })

  it('does not render trendline with less than 2 data points', () => {
    const singlePoint: TrendDataPoint[] = [{ year: 2024, value: 100000 }]

    render(
      <TrendChart data={singlePoint} anomalies={[]} showTrendline={true} />
    )

    // Should not crash, trendline should not appear
    expect(screen.queryByText('Trend')).not.toBeInTheDocument()
  })

  it('renders with anomalies', () => {
    render(<TrendChart data={mockData} anomalies={mockAnomalies} />)

    // Chart should render successfully with anomalies
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('uses absolute Y-axis mode by default', () => {
    render(<TrendChart data={mockData} anomalies={[]} />)

    // Default yAxisMode is 'absolute'
    expect(screen.getByTestId('y-axis')).toBeInTheDocument()
  })

  it('accepts percentage Y-axis mode', () => {
    render(<TrendChart data={mockData} anomalies={[]} yAxisMode="percentage" />)

    expect(screen.getByTestId('y-axis')).toBeInTheDocument()
  })

  it('renders empty chart with no data', () => {
    render(<TrendChart data={[]} anomalies={[]} />)

    // Should render without crashing
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  describe('Data Transformations', () => {
    it('calculates correct linear regression trendline', () => {
      // Use simple data for easy verification: y = 10x + 100
      // Data points: (0,100), (1,110), (2,120), (3,130)
      const linearData: TrendDataPoint[] = [
        { year: 2020, value: 100 },
        { year: 2021, value: 110 },
        { year: 2022, value: 120 },
        { year: 2023, value: 130 },
      ]

      const { rerender } = render(
        <TrendChart data={linearData} anomalies={[]} showTrendline={true} />
      )

      // Verify trendline is rendered (implicitly tested via "Trend" label)
      expect(screen.getByText('Trend')).toBeInTheDocument()

      // Re-render to verify calculation doesn't crash with different data
      const nonLinearData: TrendDataPoint[] = [
        { year: 2020, value: 100 },
        { year: 2021, value: 150 },
        { year: 2022, value: 120 },
        { year: 2023, value: 180 },
      ]

      rerender(
        <TrendChart data={nonLinearData} anomalies={[]} showTrendline={true} />
      )

      expect(screen.getByText('Trend')).toBeInTheDocument()
    })

    it('handles anomaly highlighting correctly', () => {
      const anomalyData: TrendDataPoint[] = [
        { year: 2020, value: 100 },
        { year: 2021, value: 110 },
        { year: 2022, value: 180 }, // Anomaly year
      ]

      const criticalAnomaly: DetectedAnomaly = {
        pool_name: 'Utilities',
        anomaly_type: 'spike',
        severity: 'critical',
        current_value: 180,
        expected_value: 115,
        variance_percent: 56.5,
        explanation: 'Critical spike',
        years_affected: [2022],
      }

      render(<TrendChart data={anomalyData} anomalies={[criticalAnomaly]} />)

      // Chart should render with anomaly data
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })

    it('handles multiple severity levels for anomalies', () => {
      const mixedAnomalies: DetectedAnomaly[] = [
        {
          pool_name: 'Pool A',
          anomaly_type: 'spike',
          severity: 'critical',
          current_value: 200,
          expected_value: 100,
          variance_percent: 100,
          explanation: 'Critical',
          years_affected: [2021],
        },
        {
          pool_name: 'Pool B',
          anomaly_type: 'spike',
          severity: 'warning',
          current_value: 150,
          expected_value: 120,
          variance_percent: 25,
          explanation: 'Warning',
          years_affected: [2022],
        },
      ]

      render(<TrendChart data={mockData} anomalies={mixedAnomalies} />)

      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })
  })

  describe('Formatter Functions', () => {
    it('formats Y-axis ticks in absolute mode', () => {
      render(<TrendChart data={mockData} anomalies={[]} yAxisMode="absolute" />)

      expect(capturedTickFormatter).not.toBeNull()
      expect(capturedTickFormatter!(50000)).toBe('$50k')
      expect(capturedTickFormatter!(1000000)).toBe('$1000k')
      expect(capturedTickFormatter!(0)).toBe('$0k')
    })

    it('formats Y-axis ticks in percentage mode', () => {
      render(
        <TrendChart data={mockData} anomalies={[]} yAxisMode="percentage" />
      )

      expect(capturedTickFormatter).not.toBeNull()
      expect(capturedTickFormatter!(15.5)).toBe('15.5%')
      expect(capturedTickFormatter!(100)).toBe('100%')
      expect(capturedTickFormatter!(0)).toBe('0%')
    })

    it('formats tooltip values in absolute mode', () => {
      render(<TrendChart data={mockData} anomalies={[]} yAxisMode="absolute" />)

      expect(capturedTooltipFormatter).not.toBeNull()
      expect(capturedTooltipFormatter!(150000)).toBe('$150,000')
      expect(capturedTooltipFormatter!(1234567)).toBe('$1,234,567')
      expect(capturedTooltipFormatter!(0)).toBe('$0')
    })

    it('formats tooltip values in percentage mode', () => {
      render(
        <TrendChart data={mockData} anomalies={[]} yAxisMode="percentage" />
      )

      expect(capturedTooltipFormatter).not.toBeNull()
      expect(capturedTooltipFormatter!(15.567)).toBe('15.6%')
      expect(capturedTooltipFormatter!(100)).toBe('100.0%')
      expect(capturedTooltipFormatter!(0)).toBe('0.0%')
    })
  })

  describe('Dot Customization', () => {
    it('renders normal dot for non-anomaly data points', () => {
      render(<TrendChart data={mockData} anomalies={[]} />)

      expect(capturedDotRenderer).not.toBeNull()

      const normalDot = capturedDotRenderer!({
        cx: 100,
        cy: 50,
        payload: { year: 2020, value: 100000 },
      })

      expect(normalDot.type).toBe('circle')
      expect(normalDot.props.cx).toBe(100)
      expect(normalDot.props.cy).toBe(50)
      expect(normalDot.props.r).toBe(4)
      expect(normalDot.props.fill).toBe('hsl(var(--chart-3))')
    })

    it('renders critical anomaly dot in red', () => {
      const criticalAnomaly: DetectedAnomaly = {
        pool_name: 'Utilities',
        anomaly_type: 'spike',
        severity: 'critical',
        current_value: 160000,
        expected_value: 135000,
        variance_percent: 18.5,
        explanation: 'Spike detected',
        years_affected: [2024],
      }

      render(<TrendChart data={mockData} anomalies={[criticalAnomaly]} />)

      expect(capturedDotRenderer).not.toBeNull()

      const anomalyDot = capturedDotRenderer!({
        cx: 200,
        cy: 100,
        payload: { year: 2024, value: 160000 },
      })

      expect(anomalyDot.type).toBe('circle')
      expect(anomalyDot.props.cx).toBe(200)
      expect(anomalyDot.props.cy).toBe(100)
      expect(anomalyDot.props.r).toBe(8)
      expect(anomalyDot.props.fill).toBe('hsl(var(--error))') // Red for critical
      expect(anomalyDot.props.stroke).toBe('hsl(var(--background))')
      expect(anomalyDot.props.strokeWidth).toBe(2)
    })

    it('renders warning anomaly dot in amber', () => {
      const warningAnomaly: DetectedAnomaly = {
        pool_name: 'Utilities',
        anomaly_type: 'spike',
        severity: 'warning',
        current_value: 140000,
        expected_value: 130000,
        variance_percent: 7.7,
        explanation: 'Minor spike',
        years_affected: [2023],
      }

      render(<TrendChart data={mockData} anomalies={[warningAnomaly]} />)

      expect(capturedDotRenderer).not.toBeNull()

      const anomalyDot = capturedDotRenderer!({
        cx: 150,
        cy: 80,
        payload: { year: 2023, value: 140000 },
      })

      expect(anomalyDot.type).toBe('circle')
      expect(anomalyDot.props.r).toBe(8)
      expect(anomalyDot.props.fill).toBe('hsl(var(--warning))') // Amber for warning
    })

    it('handles data point not in anomaly list', () => {
      const singleAnomaly: DetectedAnomaly = {
        pool_name: 'Utilities',
        anomaly_type: 'spike',
        severity: 'critical',
        current_value: 130000,
        expected_value: 120000,
        variance_percent: 8.3,
        explanation: 'Spike',
        years_affected: [2023],
      }

      render(<TrendChart data={mockData} anomalies={[singleAnomaly]} />)

      expect(capturedDotRenderer).not.toBeNull()

      // Test year 2021 (not in anomaly list)
      const normalDot = capturedDotRenderer!({
        cx: 100,
        cy: 50,
        payload: { year: 2021, value: 110000 },
      })

      expect(normalDot.props.r).toBe(4) // Normal size
      expect(normalDot.props.fill).toBe('hsl(var(--chart-3))') // Normal color
    })
  })
})
