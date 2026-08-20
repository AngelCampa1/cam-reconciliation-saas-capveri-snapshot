/**
 * Tests for HelpCenterPage component.
 *
 * Validates help center page rendering, search, and accordion interactions.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { HelpCenterPage } from './HelpCenter'

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
  }),
}))

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('HelpCenterPage', () => {
  // Page Rendering Tests
  it('renders page header and description', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /help center/i, level: 1 })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/find answers to common questions/i)
    ).toBeInTheDocument()
  })

  it('displays last updated date', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })
    expect(screen.getByText(/Updated April 22, 2026/i)).toBeInTheDocument()
  })

  it('renders navigation with logo linking to home', () => {
    const { container } = render(<HelpCenterPage />, { wrapper: RouterWrapper })

    // Logo in nav links to home
    const logoLink = container.querySelector('a[href="/"]')
    expect(logoLink).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    const searchInput = screen.getByPlaceholderText(/search for answers/i)
    expect(searchInput).toBeInTheDocument()
    expect(searchInput).toHaveAttribute('type', 'search')
  })

  it('search input has accessibility attributes', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    const searchInput = screen.getByRole('searchbox')
    expect(searchInput).toHaveAttribute('name', 'search')
    expect(searchInput).toHaveAttribute('autocomplete', 'off')
    expect(searchInput).toHaveAttribute('aria-label', 'Search help articles')
  })

  // FAQ Categories Tests
  it('renders all 4 category headings', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /getting started/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /pricing & billing/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /features & capabilities/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /security & privacy/i })
    ).toBeInTheDocument()
  })

  it('renders Getting Started category with 3 questions', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/what is capveri/i)).toBeInTheDocument()
    expect(
      screen.getByText(/how does the free trial work/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/what file formats do you accept/i)
    ).toBeInTheDocument()
  })

  it('explains CapVeri without recovery-opportunity language', async () => {
    const user = userEvent.setup()
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    await user.click(screen.getByText(/what is capveri/i))
    expect(screen.getByText(/spot billing gaps/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/recovery opportunities/i)
    ).not.toBeInTheDocument()
  })

  it('renders Pricing & Billing category with 3 questions', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/how much does capveri cost/i)).toBeInTheDocument()
    expect(screen.getByText(/is there a free trial/i)).toBeInTheDocument()
    expect(
      screen.getByText(/how should i think about value/i)
    ).toBeInTheDocument()
  })

  it('shows current no-card trial and pricing guidance in pricing FAQs', async () => {
    const user = userEvent.setup()
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    await user.click(screen.getByText(/how much does capveri cost/i))
    expect(
      screen.getByText(/Reconcile starts at \$998\/year/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/list price starts at \$4,990\/year/i)
    ).toBeInTheDocument()

    await user.click(screen.getByText(/is there a free trial/i))
    expect(
      screen.getByText(
        /30-day free trial with no credit card required to start/i
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(/access pauses until billing is added/i)
    ).toBeInTheDocument()

    await user.click(screen.getByText(/how should i think about value/i))
    expect(screen.getByText(/annual billing variance/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/annual recovery opportunity/i)
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/What ROI can I expect/i)).not.toBeInTheDocument()
  })

  it('renders Features & Capabilities with 3 questions', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByText(/does capveri integrate with my erp/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/what calculations does capveri support/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/can capveri extract lease terms from pdfs/i)
    ).toBeInTheDocument()
  })

  it('renders Security & Privacy with 2 questions', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/is my data secure/i)).toBeInTheDocument()
    expect(
      screen.getByText(/do you use my data to train ai/i)
    ).toBeInTheDocument()
  })

  // Search Functionality Tests
  it('filters questions by search query in question text', async () => {
    const user = userEvent.setup()
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    const searchInput = screen.getByPlaceholderText(/search for answers/i)
    await user.type(searchInput, 'cost')

    // Should show Pricing & Billing category
    expect(
      screen.getByRole('heading', { name: /pricing & billing/i })
    ).toBeInTheDocument()

    // Should NOT show other categories
    expect(
      screen.queryByRole('heading', { name: /getting started/i })
    ).not.toBeInTheDocument()
  })

  it('filters questions by search query in answer text', async () => {
    const user = userEvent.setup()
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    const searchInput = screen.getByPlaceholderText(/search for answers/i)
    await user.type(searchInput, 'BOMA')

    // Should show Features & Capabilities category (BOMA mentioned in answer)
    expect(
      screen.getByRole('heading', { name: /features & capabilities/i })
    ).toBeInTheDocument()

    // Should NOT show other categories
    expect(
      screen.queryByRole('heading', { name: /pricing & billing/i })
    ).not.toBeInTheDocument()
  })

  it('shows no results message when search has no matches', async () => {
    const user = userEvent.setup()
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    const searchInput = screen.getByPlaceholderText(/search for answers/i)
    await user.type(searchInput, 'xyznonexistent')

    expect(screen.getByText('No results found')).toBeInTheDocument()

    // No categories should be visible
    expect(
      screen.queryByRole('heading', { name: /getting started/i })
    ).not.toBeInTheDocument()
  })

  it('shows all FAQs when search is cleared', async () => {
    const user = userEvent.setup()
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    const searchInput = screen.getByPlaceholderText(/search for answers/i)
    await user.type(searchInput, 'cost')

    // Only Pricing & Billing category visible
    expect(
      screen.getByRole('heading', { name: /pricing & billing/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /getting started/i })
    ).not.toBeInTheDocument()

    // Clear search
    await user.clear(searchInput)

    // All 4 categories should be visible again
    expect(
      screen.getByRole('heading', { name: /getting started/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /pricing & billing/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /features & capabilities/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /security & privacy/i })
    ).toBeInTheDocument()
  })

  it('hides categories with no matching questions', async () => {
    const user = userEvent.setup()
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    const searchInput = screen.getByPlaceholderText(/search for answers/i)
    await user.type(searchInput, 'financial math')

    // Should only show Security & Privacy category
    expect(
      screen.getByRole('heading', { name: /security & privacy/i })
    ).toBeInTheDocument()

    // Other categories should be hidden
    expect(
      screen.queryByRole('heading', { name: /getting started/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /pricing & billing/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /features & capabilities/i })
    ).not.toBeInTheDocument()
  })

  // Accordion Interactions Tests
  it('FAQ items are collapsed by default', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    // Answers should not be visible initially
    expect(
      screen.queryByText(/capveri is a cre finops/i)
    ).not.toBeInTheDocument()
  })

  it('expands FAQ item when clicked', async () => {
    const user = userEvent.setup()
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    const questionButton = screen.getByText(/what is capveri/i)
    await user.click(questionButton)

    // Answer should now be visible
    expect(screen.getByText(/capveri is a cre finops/i)).toBeInTheDocument()
  })

  it('shows chevron rotation when expanded', async () => {
    const user = userEvent.setup()
    const { container } = render(<HelpCenterPage />, {
      wrapper: RouterWrapper,
    })

    const questionButton = screen.getByText(/what is capveri/i)
    const chevron = questionButton.parentElement?.querySelector('svg')

    // Chevron should not be rotated initially
    expect(chevron).toBeInTheDocument()
    expect(chevron).not.toHaveClass('rotate-180')

    await user.click(questionButton)

    // Chevron should be rotated after click
    expect(chevron).toHaveClass('rotate-180')
  })

  it('collapses FAQ item when clicked again', async () => {
    const user = userEvent.setup()
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    const questionButton = screen.getByText(/what is capveri/i)

    // Expand
    await user.click(questionButton)
    expect(screen.getByText(/capveri is a cre finops/i)).toBeInTheDocument()

    // Collapse
    await user.click(questionButton)
    expect(
      screen.queryByText(/capveri is a cre finops/i)
    ).not.toBeInTheDocument()
  })

  // Contact CTA Test
  it('renders contact support section with button link', () => {
    render(<HelpCenterPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /still have questions/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/can't find what you're looking for/i)
    ).toBeInTheDocument()

    const contactButton = screen.getByRole('link', { name: /contact support/i })
    expect(contactButton).toBeInTheDocument()
    expect(contactButton).toHaveAttribute('href', '/contact')
  })

  // Footer Test
  it('renders footer component', () => {
    const { container } = render(<HelpCenterPage />, {
      wrapper: RouterWrapper,
    })

    expect(container.querySelector('footer')).toBeInTheDocument()
  })
})
