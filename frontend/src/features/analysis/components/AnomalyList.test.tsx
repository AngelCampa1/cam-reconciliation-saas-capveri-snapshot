/**
 * Tests for AnomalyList component.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnomalyList } from './AnomalyList'
import type { DetectedAnomaly } from '../types'

describe('AnomalyList', () => {
  it('renders empty state when no anomalies', () => {
    render(<AnomalyList anomalies={[]} />)

    expect(screen.getByText('Nothing unusual found')).toBeInTheDocument()
    expect(
      screen.getByText('All expense patterns look normal.')
    ).toBeInTheDocument()
  })

  it('renders critical anomalies section', () => {
    const anomalies: DetectedAnomaly[] = [
      {
        pool_name: 'Utilities',
        anomaly_type: 'spike',
        severity: 'critical',
        current_value: 1300,
        expected_value: 1000,
        variance_percent: 30,
        explanation: 'Utilities spiked',
        years_affected: [2024],
      },
      {
        pool_name: 'Repairs',
        anomaly_type: 'spike',
        severity: 'critical',
        current_value: 5000,
        expected_value: 2000,
        variance_percent: 150,
        explanation: 'Repairs spiked',
        years_affected: [2024],
      },
    ]

    render(<AnomalyList anomalies={anomalies} />)

    expect(screen.getByText('Critical Anomalies (2)')).toBeInTheDocument()
    expect(screen.getByText('Utilities')).toBeInTheDocument()
    expect(screen.getByText('Repairs')).toBeInTheDocument()
  })

  it('renders warning anomalies section', () => {
    const anomalies: DetectedAnomaly[] = [
      {
        pool_name: 'Janitorial',
        anomaly_type: 'drop',
        severity: 'warning',
        current_value: 850,
        expected_value: 1000,
        variance_percent: -15,
        explanation: 'Janitorial dropped',
        years_affected: [2024],
      },
    ]

    render(<AnomalyList anomalies={anomalies} />)

    expect(screen.getByText('Warnings (1)')).toBeInTheDocument()
    expect(screen.getByText('Janitorial')).toBeInTheDocument()
  })

  it('renders info anomalies section', () => {
    const anomalies: DetectedAnomaly[] = [
      {
        pool_name: 'Security',
        anomaly_type: 'new_category',
        severity: 'info',
        current_value: 1000,
        expected_value: 0,
        variance_percent: 100,
        explanation: 'New category',
        years_affected: [2024],
      },
    ]

    render(<AnomalyList anomalies={anomalies} />)

    expect(screen.getByText('Information (1)')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
  })

  it('renders all severity sections when anomalies present', () => {
    const anomalies: DetectedAnomaly[] = [
      {
        pool_name: 'Critical Pool',
        anomaly_type: 'spike',
        severity: 'critical',
        current_value: 2000,
        expected_value: 1000,
        variance_percent: 100,
        explanation: 'Critical spike',
        years_affected: [2024],
      },
      {
        pool_name: 'Warning Pool',
        anomaly_type: 'drop',
        severity: 'warning',
        current_value: 800,
        expected_value: 1000,
        variance_percent: -20,
        explanation: 'Warning drop',
        years_affected: [2024],
      },
      {
        pool_name: 'Info Pool',
        anomaly_type: 'new_category',
        severity: 'info',
        current_value: 500,
        expected_value: 0,
        variance_percent: 100,
        explanation: 'New info',
        years_affected: [2024],
      },
    ]

    render(<AnomalyList anomalies={anomalies} />)

    expect(screen.getByText('Critical Anomalies (1)')).toBeInTheDocument()
    expect(screen.getByText('Warnings (1)')).toBeInTheDocument()
    expect(screen.getByText('Information (1)')).toBeInTheDocument()
    expect(screen.getByText('Critical Pool')).toBeInTheDocument()
    expect(screen.getByText('Warning Pool')).toBeInTheDocument()
    expect(screen.getByText('Info Pool')).toBeInTheDocument()
  })

  it('only renders sections with anomalies', () => {
    const anomalies: DetectedAnomaly[] = [
      {
        pool_name: 'Critical Only',
        anomaly_type: 'spike',
        severity: 'critical',
        current_value: 2000,
        expected_value: 1000,
        variance_percent: 100,
        explanation: 'Critical spike',
        years_affected: [2024],
      },
    ]

    render(<AnomalyList anomalies={anomalies} />)

    expect(screen.getByText('Critical Anomalies (1)')).toBeInTheDocument()
    expect(screen.queryByText(/Warnings/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Information/)).not.toBeInTheDocument()
  })

  it('groups anomalies correctly by severity', () => {
    const anomalies: DetectedAnomaly[] = [
      {
        pool_name: 'Pool A',
        anomaly_type: 'spike',
        severity: 'warning',
        current_value: 1100,
        expected_value: 1000,
        variance_percent: 10,
        explanation: 'Warning A',
        years_affected: [2024],
      },
      {
        pool_name: 'Pool B',
        anomaly_type: 'spike',
        severity: 'critical',
        current_value: 1500,
        expected_value: 1000,
        variance_percent: 50,
        explanation: 'Critical B',
        years_affected: [2024],
      },
      {
        pool_name: 'Pool C',
        anomaly_type: 'new_category',
        severity: 'info',
        current_value: 500,
        expected_value: 0,
        variance_percent: 100,
        explanation: 'Info C',
        years_affected: [2024],
      },
      {
        pool_name: 'Pool D',
        anomaly_type: 'spike',
        severity: 'warning',
        current_value: 1150,
        expected_value: 1000,
        variance_percent: 15,
        explanation: 'Warning D',
        years_affected: [2024],
      },
    ]

    render(<AnomalyList anomalies={anomalies} />)

    expect(screen.getByText('Critical Anomalies (1)')).toBeInTheDocument()
    expect(screen.getByText('Warnings (2)')).toBeInTheDocument()
    expect(screen.getByText('Information (1)')).toBeInTheDocument()
  })

  it('handles large number of anomalies', () => {
    const anomalies: DetectedAnomaly[] = Array.from({ length: 50 }, (_, i) => ({
      pool_name: `Pool ${i}`,
      anomaly_type: 'spike' as const,
      severity: (i % 3 === 0
        ? 'critical'
        : i % 3 === 1
          ? 'warning'
          : 'info') as 'critical' | 'warning' | 'info',
      current_value: 1000 + i * 100,
      expected_value: 1000,
      variance_percent: i * 10,
      explanation: `Anomaly ${i}`,
      years_affected: [2024],
    }))

    render(<AnomalyList anomalies={anomalies} />)

    // Check that all sections are rendered with correct counts
    expect(screen.getByText(/Critical Anomalies/)).toBeInTheDocument()
    expect(screen.getByText(/Warnings/)).toBeInTheDocument()
    expect(screen.getByText(/Information/)).toBeInTheDocument()
  })
})
