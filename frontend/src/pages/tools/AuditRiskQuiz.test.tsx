import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuditRiskQuizPage } from './AuditRiskQuiz'

vi.mock('@/components/content/ToolPageLayout', () => ({
  ToolPageLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tool-layout">{children}</div>
  ),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const mockTrackEvent = vi.mocked((await import('@/lib/analytics')).trackEvent)

const renderQuiz = () =>
  render(
    <MemoryRouter>
      <AuditRiskQuizPage />
    </MemoryRouter>
  )

describe('AuditRiskQuizPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the first question on mount', () => {
    renderQuiz()
    expect(screen.getByText(/question 1 of 10/i)).toBeInTheDocument()
    expect(screen.getByText(/expense classification/i)).toBeInTheDocument()
  })

  it('Next button is disabled until an answer is selected', () => {
    renderQuiz()
    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeDisabled()
  })

  it('Next button becomes enabled after selecting an answer', async () => {
    const user = userEvent.setup()
    renderQuiz()

    const firstAnswer = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('Written policy'))
    await user.click(firstAnswer!)

    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled()
  })

  it('Back button is not visible on question 1', () => {
    renderQuiz()
    expect(
      screen.queryByRole('button', { name: /back/i })
    ).not.toBeInTheDocument()
  })

  it('Back button appears on question 2', async () => {
    const user = userEvent.setup()
    renderQuiz()

    const firstAnswer = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('Written policy'))
    await user.click(firstAnswer!)
    await user.click(screen.getByRole('button', { name: /next/i }))

    expect(screen.getByText(/question 2 of 10/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
  })

  it('does NOT show results card before question 10 is answered', async () => {
    const user = userEvent.setup()
    renderQuiz()

    for (let i = 0; i < 9; i++) {
      const answers = screen
        .getAllByRole('button')
        .filter((b) => !['Next', 'Back'].includes(b.textContent?.trim() ?? ''))
      await user.click(answers[0])
      await user.click(screen.getByRole('button', { name: /next/i }))
    }

    expect(screen.getByText(/question 10 of 10/i)).toBeInTheDocument()
    expect(screen.queryByText(/your audit risk score/i)).not.toBeInTheDocument()
  })

  it('shows results card after answering all 10 questions', async () => {
    const user = userEvent.setup()
    renderQuiz()

    for (let i = 0; i < 10; i++) {
      const answers = screen
        .getAllByRole('button')
        .filter((b) => !['Next', 'Back'].includes(b.textContent?.trim() ?? ''))
      await user.click(answers[0])
      await user.click(
        screen.getByRole('button', { name: /next|see my results/i })
      )
    }

    expect(screen.getByText(/your audit risk score/i)).toBeInTheDocument()
  })

  it('fires tool_interaction analytics event on quiz completion', async () => {
    const user = userEvent.setup()
    renderQuiz()

    for (let i = 0; i < 10; i++) {
      const answers = screen
        .getAllByRole('button')
        .filter((b) => !['Next', 'Back'].includes(b.textContent?.trim() ?? ''))
      await user.click(answers[0])
      await user.click(
        screen.getByRole('button', { name: /next|see my results/i })
      )
    }

    expect(mockTrackEvent).toHaveBeenCalledWith('tool_interaction', {
      slug: 'audit-risk-quiz',
      result_summary: expect.stringMatching(/Low Risk|Moderate Risk|High Risk/),
    })
  })

  it('results card includes a CTA link to /auth/register', async () => {
    const user = userEvent.setup()
    renderQuiz()

    for (let i = 0; i < 10; i++) {
      const answers = screen
        .getAllByRole('button')
        .filter((b) => !['Next', 'Back'].includes(b.textContent?.trim() ?? ''))
      await user.click(answers[0])
      await user.click(
        screen.getByRole('button', { name: /next|see my results/i })
      )
    }

    const cta = screen.getByRole('link', {
      name: /start a free reconciliation setup/i,
    })
    expect(cta).toHaveAttribute('href', '/auth/register')
  })

  it('shows cross-links to tenant-auditor-guide and cam-presend-checklist', async () => {
    const user = userEvent.setup()
    renderQuiz()

    for (let i = 0; i < 10; i++) {
      const answers = screen
        .getAllByRole('button')
        .filter((b) => !['Next', 'Back'].includes(b.textContent?.trim() ?? ''))
      await user.click(answers[0])
      await user.click(
        screen.getByRole('button', { name: /next|see my results/i })
      )
    }

    expect(
      screen.getByRole('link', { name: /what tenant auditors look for/i })
    ).toHaveAttribute('href', '/resources/tenant-auditor-guide')
    expect(
      screen.getByRole('link', { name: /cam pre-send checklist/i })
    ).toHaveAttribute('href', '/resources/cam-presend-checklist')
  })
})
