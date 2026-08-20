/**
 * ReconciliationWorkflowStepper Component Tests
 *
 * Tests for the workflow progress stepper showing reconciliation steps.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import {
  ReconciliationWorkflowStepper,
  type WorkflowStep,
} from './ReconciliationWorkflowStepper'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('ReconciliationWorkflowStepper', () => {
  const propertyId = 'prop-123'

  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders all 4 workflow steps', () => {
    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="upload"
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Upload GL')).toBeInTheDocument()
    expect(screen.getByText('Reconcile')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Finalize')).toBeInTheDocument()
  })

  it('highlights current step', () => {
    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="calculate"
        />
      </MemoryRouter>
    )

    const calculateStep = screen.getByTestId('step-calculate')
    expect(calculateStep).toHaveAttribute('aria-current', 'step')
  })

  it('marks completed steps with checkmark', () => {
    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="review"
          completedSteps={['upload', 'calculate']}
        />
      </MemoryRouter>
    )

    // Upload and Calculate should be completed
    const uploadStep = screen.getByTestId('step-upload')
    const calculateStep = screen.getByTestId('step-calculate')

    expect(uploadStep).toHaveAttribute('data-completed', 'true')
    expect(calculateStep).toHaveAttribute('data-completed', 'true')

    // F-287: completed (non-current) step labels use the dark on-light
    // --success-strong shade so the 12px text clears WCAG AA on white;
    // the bright text-success (~3.33:1) failed.
    expect(within(uploadStep).getByText('Upload GL')).toHaveClass(
      'text-success-strong'
    )
  })

  it('navigates to correct page on step click', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="review"
          completedSteps={['upload', 'calculate']}
        />
      </MemoryRouter>
    )

    const uploadStep = screen.getByTestId('step-upload')
    await user.click(uploadStep)

    expect(mockNavigate).toHaveBeenCalledWith('/ingestion')
  })

  it('navigates to reconciliation page on Calculate click', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="upload"
          completedSteps={['upload']}
        />
      </MemoryRouter>
    )

    const calculateStep = screen.getByTestId('step-calculate')
    await user.click(calculateStep)

    expect(mockNavigate).toHaveBeenCalledWith(
      `/properties/${propertyId}/reconciliations`
    )
  })

  it('disables future steps that are not yet accessible', () => {
    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="upload"
          completedSteps={[]}
        />
      </MemoryRouter>
    )

    const calculateStep = screen.getByTestId('step-calculate')
    const reviewStep = screen.getByTestId('step-review')
    const finalizeStep = screen.getByTestId('step-finalize')

    expect(calculateStep).toHaveAttribute('aria-disabled', 'true')
    expect(reviewStep).toHaveAttribute('aria-disabled', 'true')
    expect(finalizeStep).toHaveAttribute('aria-disabled', 'true')
  })

  it('has accessible labels for each step', () => {
    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="calculate"
        />
      </MemoryRouter>
    )

    const stepper = screen.getByRole('navigation', { name: /workflow/i })
    expect(stepper).toBeInTheDocument()
  })

  it('shows step numbers', () => {
    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="upload"
        />
      </MemoryRouter>
    )

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('has minimum 44px touch targets', () => {
    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="upload"
        />
      </MemoryRouter>
    )

    const steps = [
      screen.getByTestId('step-upload'),
      screen.getByTestId('step-calculate'),
      screen.getByTestId('step-review'),
      screen.getByTestId('step-finalize'),
    ]

    steps.forEach((step) => {
      expect(step).toHaveClass('min-h-[44px]')
    })
  })

  it('applies custom className', () => {
    render(
      <MemoryRouter>
        <ReconciliationWorkflowStepper
          propertyId={propertyId}
          currentStep="upload"
          className="custom-class"
        />
      </MemoryRouter>
    )

    const stepper = screen.getByTestId('workflow-stepper')
    expect(stepper).toHaveClass('custom-class')
  })
})
