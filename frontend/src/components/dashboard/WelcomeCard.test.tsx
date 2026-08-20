/**
 * Tests for tier-aware WelcomeCard component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { WelcomeCard } from './WelcomeCard'

// Wrap component with router for Link components
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe('WelcomeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Set a fixed date for consistent year display
    vi.setSystemTime(new Date('2024-06-15 10:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Tier Hero Content', () => {
    it('renders free tier hero content', () => {
      renderWithRouter(
        <WelcomeCard
          tier="free"
          heroTitle="Welcome to CapVeri"
          heroSubtitle="Try it free for 30 days. Run your first reconciliation today."
          heroCtaLabel="Start free trial"
          heroCtaHref="/pricing"
        />
      )

      expect(screen.getByText('Welcome to CapVeri')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Try it free for 30 days. Run your first reconciliation today.'
        )
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /start free trial/i })
      ).toHaveAttribute('href', '/pricing')
    })

    it('renders paid tier hero content', () => {
      renderWithRouter(
        <WelcomeCard
          tier="paid"
          heroTitle="Your reconciliation workflow"
          heroSubtitle="Upload GL data, run reconciliations, and export tenant statements."
          heroCtaLabel="Run reconciliation"
          heroCtaHref="/reconciliations"
        />
      )

      expect(
        screen.getByText('Your reconciliation workflow')
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          'Upload GL data, run reconciliations, and export tenant statements.'
        )
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /run reconciliation/i })
      ).toHaveAttribute('href', '/reconciliations')
    })

    it('displays metric number formatted as currency', async () => {
      renderWithRouter(
        <WelcomeCard
          tier="paid"
          heroTitle="Professional Portfolio FinOps"
          heroSubtitle="Track portfolio operations and performance"
          heroCtaLabel="Open Portfolio Pipeline"
          heroCtaHref="/portfolio"
          statementExposure={26500}
        />
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })

      expect(screen.getByText(/\$26,500/)).toBeInTheDocument()
    })

    it('shows the full value immediately when reduced motion is preferred', () => {
      const original = window.matchMedia
      window.matchMedia = ((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia

      try {
        renderWithRouter(
          <WelcomeCard
            tier="paid"
            heroTitle="Professional Portfolio FinOps"
            heroSubtitle="Track portfolio operations and performance"
            heroCtaLabel="Open Portfolio Pipeline"
            heroCtaHref="/portfolio"
            statementExposure={8950}
          />
        )

        // No timers advanced: with reduced motion the count-up is skipped and
        // the final figure is rendered right away (no misleading partials).
        expect(screen.getByText(/\$8,950/)).toBeInTheDocument()
      } finally {
        window.matchMedia = original
      }
    })

    it('shows over-bill and under-bill split when statement exposure exists', async () => {
      renderWithRouter(
        <WelcomeCard
          tier="paid"
          heroTitle="Bill amount to check"
          heroSubtitle="Check over-bills and under-bills before you send."
          heroCtaLabel="Review drafts"
          heroCtaHref="/portfolio/pipeline"
          statementExposure={8000}
          overbillExposure={3000}
          underbillExposure={5000}
        />
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })

      expect(screen.getByText('Over-bill total')).toBeInTheDocument()
      expect(screen.getByText('Under-bill total')).toBeInTheDocument()
      expect(screen.getByText('$3,000')).toBeInTheDocument()
      expect(screen.getByText('$5,000')).toBeInTheDocument()
    })
  })

  describe('Metric Cards', () => {
    it('displays property count', () => {
      renderWithRouter(
        <WelcomeCard
          tier="paid"
          heroTitle="Essentials FinOps Workflow"
          heroSubtitle="Import, reconcile, and export with confidence"
          heroCtaLabel="Run Reconciliation"
          heroCtaHref="/reconciliations"
          propertyCount={12}
        />
      )

      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('Properties')).toBeInTheDocument()
    })

    it('displays finalized billing exposure card with formatted currency', () => {
      renderWithRouter(
        <WelcomeCard
          tier="professional"
          heroTitle="Professional Portfolio FinOps"
          heroSubtitle="Track portfolio operations and performance"
          heroCtaLabel="Open Portfolio Pipeline"
          heroCtaHref="/portfolio"
          totalRecoveryFinalized={125000}
        />
      )

      expect(screen.getByText('Finalized billing exposure')).toBeInTheDocument()
      expect(screen.getByText('$125,000')).toBeInTheDocument()
    })

    it('displays pending count with Need Attention label', () => {
      renderWithRouter(
        <WelcomeCard
          tier="paid"
          heroTitle="Essentials FinOps Workflow"
          heroSubtitle="Import, reconcile, and export with confidence"
          heroCtaLabel="Run Reconciliation"
          heroCtaHref="/reconciliations"
          pendingReconciliations={3}
        />
      )

      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('Need Attention')).toBeInTheDocument()
    })
  })

  describe('Default Values', () => {
    it('displays zero counts by default', () => {
      renderWithRouter(
        <WelcomeCard
          tier="free"
          heroTitle="Reconcile Trial Starter"
          heroSubtitle="Upload and test one workflow"
          heroCtaLabel="Start Free Trial"
          heroCtaHref="/ingestion"
        />
      )

      // Properties: 0, Need Attention: 0
      const zeros = screen.getAllByText('0')
      expect(zeros.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Styling', () => {
    it('applies custom className when provided', () => {
      const { container } = renderWithRouter(
        <WelcomeCard
          tier="free"
          heroTitle="Reconcile Trial Starter"
          heroSubtitle="Upload and test one workflow"
          heroCtaLabel="Start Free Trial"
          heroCtaHref="/ingestion"
          className="custom-class"
        />
      )

      const wrapper = container.querySelector('.custom-class')
      expect(wrapper).toBeInTheDocument()
    })
  })
})
