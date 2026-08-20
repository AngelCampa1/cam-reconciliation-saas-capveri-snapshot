/**
 * ExitIntentDialog Tests (TDD — written before implementation)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExitIntentDialog } from './ExitIntentDialog'

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { trackEvent } from '@/lib/analytics'

describe('ExitIntentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dialog when open={true}', () => {
    render(<ExitIntentDialog open onDismiss={() => {}} />)

    expect(screen.getByText(/see a sample result first/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /view sample result/i })
    ).toBeInTheDocument()
  })

  it('does not render content when open={false}', () => {
    render(<ExitIntentDialog open={false} onDismiss={() => {}} />)

    expect(
      screen.queryByText(/see a sample result first/i)
    ).not.toBeInTheDocument()
  })

  it('shows headline, subline, and sample CTA without an email form', () => {
    render(<ExitIntentDialog open onDismiss={() => {}} />)

    expect(screen.getByText(/see a sample result first/i)).toBeInTheDocument()
    expect(screen.getByText(/no email needed/i)).toBeInTheDocument()
    expect(screen.getByText(/over-bills and under-bills/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/work email/i)).not.toBeInTheDocument()
  })

  it('calls onDismiss when "No thanks" is clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(<ExitIntentDialog open onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: /no thanks/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('fires analytics event on open', () => {
    render(<ExitIntentDialog open onDismiss={() => {}} />)

    expect(trackEvent).toHaveBeenCalledWith('exit_intent_sample_offered', {
      source: 'signup',
    })
  })

  it('does not fire analytics when closed', () => {
    render(<ExitIntentDialog open={false} onDismiss={() => {}} />)

    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('navigates to the sample result when CTA is clicked', async () => {
    const user = userEvent.setup()

    render(<ExitIntentDialog open onDismiss={() => {}} />)

    await user.click(screen.getByText(/view sample result/i))
    expect(trackEvent).toHaveBeenCalledWith('exit_intent_sample_clicked', {
      source: 'signup',
    })
    expect(mockNavigate).toHaveBeenCalledWith(
      '/onboard?demo=1&source=exit-intent'
    )
  })
})
