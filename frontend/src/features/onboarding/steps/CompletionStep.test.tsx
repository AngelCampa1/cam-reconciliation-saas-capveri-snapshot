/**
 * Tests for CompletionStep component.
 *
 * Validates completion screen rendering and navigation.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompletionStep } from './CompletionStep'

// Mock hooks
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('../OnboardingContext', () => ({
  useOnboarding: vi.fn(),
}))
vi.mock('@/hooks/use-free-audit-status', () => ({
  useFreeAuditStatus: vi.fn(),
}))

const mockNavigate = vi.fn()
const mockCompleteOnboarding = vi.fn()
const mockUseNavigate = vi.mocked(await import('react-router-dom')).useNavigate
const mockUseOnboarding = vi.mocked(
  await import('../OnboardingContext')
).useOnboarding
const mockUseFreeAuditStatus = vi.mocked(
  await import('@/hooks/use-free-audit-status')
).useFreeAuditStatus

describe('CompletionStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseNavigate.mockReturnValue(mockNavigate)
    mockUseFreeAuditStatus.mockReturnValue({
      data: {
        has_subscription: false,
        free_audit_consumed: false,
        can_add_property: true,
        can_run_reconciliation: true,
      },
    } as any)
  })

  it('renders without summary when no data exists', () => {
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: { data: {} },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)

    render(<CompletionStep />)

    expect(screen.getByText(/you're all set!/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/what you've accomplished/i)
    ).not.toBeInTheDocument()
  })

  it('renders summary with property only', () => {
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: {
        data: {
          propertyId: 'prop-123',
          propertyName: 'Skyline Tower',
        },
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)

    render(<CompletionStep />)

    expect(screen.getByText(/what you've accomplished/i)).toBeInTheDocument()
    expect(
      screen.getByText(/created property: skyline tower/i)
    ).toBeInTheDocument()
  })

  it('renders summary with property and leases', () => {
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: {
        data: {
          propertyId: 'prop-123',
          propertyName: 'Office Plaza',
          hasLeases: true,
        },
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)

    render(<CompletionStep />)

    expect(
      screen.getByText(/created property: office plaza/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/added lease data/i)).toBeInTheDocument()
  })

  it('renders summary with all data types', () => {
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: {
        data: {
          propertyId: 'prop-123',
          propertyName: 'Retail Center',
          hasLeases: true,
          importBatchId: 'batch-789',
        },
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)

    render(<CompletionStep />)

    expect(
      screen.getByText(/created property: retail center/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/added lease data/i)).toBeInTheDocument()
    expect(screen.getByText(/uploaded gl data/i)).toBeInTheDocument()
  })

  it('renders all next step options', () => {
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: { data: {} },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)

    render(<CompletionStep />)

    expect(screen.getByText(/review your reconciliation/i)).toBeInTheDocument()
    expect(screen.getByText(/add more properties/i)).toBeInTheDocument()
    expect(screen.getByText(/upload lease documents/i)).toBeInTheDocument()
  })

  it('calls completeOnboarding and navigates to dashboard', async () => {
    const user = userEvent.setup()
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: { data: {} },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)

    render(<CompletionStep />)

    const dashboardButton = screen.getByRole('button', {
      name: /go to dashboard/i,
    })
    await user.click(dashboardButton)

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('calls completeOnboarding and navigates when next step is clicked', async () => {
    const user = userEvent.setup()
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: { data: {} },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)

    render(<CompletionStep />)

    const addPropertyButton = screen.getByRole('button', {
      name: /add more properties/i,
    })
    await user.click(addPropertyButton)

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/properties/new')
  })

  it('navigates to correct routes for each next step option', async () => {
    const user = userEvent.setup()
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: { data: {} },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)

    render(<CompletionStep />)

    // Test review reconciliation (navigates to dashboard when no propertyId)
    const reviewButton = screen.getByRole('button', {
      name: /review your reconciliation/i,
    })
    await user.click(reviewButton)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')

    mockNavigate.mockClear()
    mockCompleteOnboarding.mockClear()

    // Test upload lease documents
    const uploadButton = screen.getByRole('button', {
      name: /upload lease documents/i,
    })
    await user.click(uploadButton)
    expect(mockNavigate).toHaveBeenCalledWith('/ingestion')
  })

  it('shows upgrade modal instead of navigating when property add is gated', async () => {
    const user = userEvent.setup()
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: { data: {} },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)
    mockUseFreeAuditStatus.mockReturnValue({
      data: {
        has_subscription: false,
        free_audit_consumed: true,
        can_add_property: false,
        can_run_reconciliation: false,
      },
    } as any)

    render(<CompletionStep />)
    await user.click(
      screen.getByRole('button', { name: /add more properties/i })
    )

    expect(mockNavigate).not.toHaveBeenCalledWith('/properties/new')
    expect(
      screen.getByText(/your free reconciliation is ready/i)
    ).toBeInTheDocument()
  })

  it('allows navigation when free audit status is unavailable', async () => {
    const user = userEvent.setup()
    mockUseOnboarding.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
      state: { data: {} },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      currentStep: 7,
      totalSteps: 7,
      goToStep: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)
    mockUseFreeAuditStatus.mockReturnValue({
      data: undefined,
      error: new Error('Failed to load free audit status'),
    } as any)

    render(<CompletionStep />)
    await user.click(
      screen.getByRole('button', { name: /add more properties/i })
    )

    expect(mockNavigate).toHaveBeenCalledWith('/properties/new')
  })
})
