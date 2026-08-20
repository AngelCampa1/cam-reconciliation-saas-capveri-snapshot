/**
 * Tests for AnomalyCard component.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnomalyCard } from './AnomalyCard'
import type { DetectedAnomaly } from '../types'

describe('AnomalyCard', () => {
  it('renders critical spike with correct styling', () => {
    const anomaly: DetectedAnomaly = {
      pool_name: 'Utilities',
      anomaly_type: 'spike',
      severity: 'critical',
      current_value: 1300,
      expected_value: 1000,
      variance_percent: 30,
      explanation: 'Utilities increased by 30%',
      years_affected: [2024],
    }

    render(<AnomalyCard anomaly={anomaly} />)

    expect(screen.getByText('Utilities')).toBeInTheDocument()
    expect(screen.getByText('Spike')).toBeInTheDocument()
    expect(screen.getByText('30.0%')).toBeInTheDocument()
    expect(screen.getByText('Utilities increased by 30%')).toBeInTheDocument()
    expect(screen.getByText('2024')).toBeInTheDocument()
  })

  it('renders warning drop with correct styling', () => {
    const anomaly: DetectedAnomaly = {
      pool_name: 'Janitorial',
      anomaly_type: 'drop',
      severity: 'warning',
      current_value: 850,
      expected_value: 1000,
      variance_percent: -15,
      explanation: 'Janitorial decreased by 15%',
      years_affected: [2024],
    }

    render(<AnomalyCard anomaly={anomaly} />)

    expect(screen.getByText('Janitorial')).toBeInTheDocument()
    expect(screen.getByText('Drop')).toBeInTheDocument()
    expect(screen.getByText('15.0%')).toBeInTheDocument()
    expect(screen.getByText('Janitorial decreased by 15%')).toBeInTheDocument()
  })

  it('renders info new category without variance percentage', () => {
    const anomaly: DetectedAnomaly = {
      pool_name: 'Security',
      anomaly_type: 'new_category',
      severity: 'info',
      current_value: 1000,
      expected_value: 0,
      variance_percent: 100,
      explanation: 'Security is a new expense category',
      years_affected: [2024],
    }

    render(<AnomalyCard anomaly={anomaly} />)

    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.getByText('New Category')).toBeInTheDocument()
    expect(
      screen.getByText('Security is a new expense category')
    ).toBeInTheDocument()
    // Variance percentage should not be shown for new_category
    expect(screen.queryByText('100.0%')).not.toBeInTheDocument()
  })

  it('renders missing category', () => {
    const anomaly: DetectedAnomaly = {
      pool_name: 'Landscaping',
      anomaly_type: 'missing_category',
      severity: 'warning',
      current_value: 0,
      expected_value: 500,
      variance_percent: -100,
      explanation: 'Landscaping was present in prior years but missing',
      years_affected: [2024],
    }

    render(<AnomalyCard anomaly={anomaly} />)

    expect(screen.getByText('Landscaping')).toBeInTheDocument()
    expect(screen.getByText('Missing Category')).toBeInTheDocument()
    expect(
      screen.getByText('Landscaping was present in prior years but missing')
    ).toBeInTheDocument()
  })

  it('renders pattern break anomaly', () => {
    const anomaly: DetectedAnomaly = {
      pool_name: 'Taxes',
      anomaly_type: 'pattern_break',
      severity: 'warning',
      current_value: 5000,
      expected_value: 4000,
      variance_percent: 25,
      explanation: 'Taxes show unusual pattern',
      years_affected: [2023, 2024],
    }

    render(<AnomalyCard anomaly={anomaly} />)

    expect(screen.getByText('Taxes')).toBeInTheDocument()
    expect(screen.getByText('Pattern Break')).toBeInTheDocument()
    expect(screen.getByText('Taxes show unusual pattern')).toBeInTheDocument()
  })

  it('renders outlier anomaly', () => {
    const anomaly: DetectedAnomaly = {
      pool_name: 'Repairs',
      anomaly_type: 'outlier',
      severity: 'critical',
      current_value: 10000,
      expected_value: 2000,
      variance_percent: 400,
      explanation: 'Repairs is a statistical outlier',
      years_affected: [2024],
    }

    render(<AnomalyCard anomaly={anomaly} />)

    expect(screen.getByText('Repairs')).toBeInTheDocument()
    expect(screen.getByText('Outlier')).toBeInTheDocument()
    expect(
      screen.getByText('Repairs is a statistical outlier')
    ).toBeInTheDocument()
  })

  it('renders multiple years affected', () => {
    const anomaly: DetectedAnomaly = {
      pool_name: 'Insurance',
      anomaly_type: 'spike',
      severity: 'critical',
      current_value: 3000,
      expected_value: 2000,
      variance_percent: 50,
      explanation: 'Insurance spiked across multiple years',
      years_affected: [2022, 2023, 2024],
    }

    render(<AnomalyCard anomaly={anomaly} />)

    expect(screen.getByText('Insurance')).toBeInTheDocument()
    expect(screen.getByText('2022, 2023, 2024')).toBeInTheDocument()
  })
})
