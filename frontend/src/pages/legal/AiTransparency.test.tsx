/**
 * Tests for AiTransparencyPage component.
 *
 * Focus: the Questions contact line collapses to a single mention when the
 * security and support addresses are the same, and shows both when they differ.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

// Mutable contact fixtures the mocked knowledge reads via getters, so each
// test can drive the same/different-address branches before importing the page.
const contacts = {
  security: {
    email: 'security@capveri.test',
    mailto: 'mailto:security@capveri.test',
  },
  support: {
    email: 'support@capveri.test',
    mailto: 'mailto:support@capveri.test',
  },
}

vi.mock('@/generated/public-knowledge', () => ({
  publicKnowledge: {
    claims: {
      byId: {
        'ai-human-reviewed': { wording: 'AI helps extract lease terms.' },
        'deterministic-financial-math': {
          wording: 'Financial math is deterministic.',
        },
      },
    },
    contacts: {
      byId: {
        get security() {
          return contacts.security
        },
        get support() {
          return contacts.support
        },
      },
    },
  },
}))

vi.mock('@/components/SEO', () => ({ SEO: () => null }))

// The page resolves the two contacts at module scope, so a fresh import is
// required for each test to pick up the fixtures set in the test body. The
// per-test reset lives in beforeEach so every renderPage() starts clean.
async function renderPage() {
  const { AiTransparencyPage } = await import('./AiTransparency')
  return render(<AiTransparencyPage />, { wrapper: BrowserRouter })
}

describe('AiTransparencyPage', () => {
  beforeEach(() => {
    vi.resetModules()
    contacts.security = {
      email: 'security@capveri.test',
      mailto: 'mailto:security@capveri.test',
    }
    contacts.support = {
      email: 'support@capveri.test',
      mailto: 'mailto:support@capveri.test',
    }
  })

  it('renders the statement heading', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', {
        name: /ai transparency statement/i,
        level: 1,
      })
    ).toBeInTheDocument()
  })

  it('shows both addresses when security and support differ', async () => {
    await renderPage()

    expect(
      screen.getByRole('link', { name: 'security@capveri.test' })
    ).toHaveAttribute('href', 'mailto:security@capveri.test')
    expect(
      screen.getByRole('link', { name: 'support@capveri.test' })
    ).toHaveAttribute('href', 'mailto:support@capveri.test')
    expect(screen.getByText(/for security questions or/i)).toBeInTheDocument()
    expect(screen.getByText(/for product support/i)).toBeInTheDocument()
  })

  it('collapses to one address when security and support match', async () => {
    const shared = {
      email: 'hello@capveri.test',
      mailto: 'mailto:hello@capveri.test',
    }
    contacts.security = shared
    contacts.support = shared

    await renderPage()

    // Exactly one contact link, no duplicated "email or email" sentence.
    const links = screen.getAllByRole('link', { name: 'hello@capveri.test' })
    expect(links).toHaveLength(1)
    expect(
      screen.getByText(/with security or product questions/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/for security questions/i)
    ).not.toBeInTheDocument()
  })
})
