/**
 * Tests for FAQSection Component
 * TDD: Write tests FIRST
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { FAQSection, LANDING_FAQS } from './FAQSection'

describe('FAQSection', () => {
  it('renders the section heading "Common Questions"', () => {
    render(<FAQSection />)
    expect(
      screen.getByRole('heading', { name: /common questions/i })
    ).toBeInTheDocument()
  })

  it('renders all 8 questions as visible buttons', () => {
    render(<FAQSection />)
    LANDING_FAQS.forEach(({ question }) => {
      expect(
        screen.getByRole('button', { name: new RegExp(question, 'i') })
      ).toBeInTheDocument()
    })
  })

  it('answers are hidden by default', () => {
    render(<FAQSection />)
    LANDING_FAQS.forEach(({ answer }) => {
      // First few words of each answer should not be visible
      const firstWords = answer.slice(0, 20)
      expect(
        screen.queryByText(new RegExp(firstWords, 'i'))
      ).not.toBeInTheDocument()
    })
  })

  it('expands an answer when the question is clicked', async () => {
    const user = userEvent.setup()
    render(<FAQSection />)

    const firstQuestion = screen.getByRole('button', {
      name: new RegExp(LANDING_FAQS[0].question, 'i'),
    })
    await user.click(firstQuestion)

    const firstWords = LANDING_FAQS[0].answer.slice(0, 20)
    expect(screen.getByText(new RegExp(firstWords, 'i'))).toBeInTheDocument()
  })

  it('collapses an expanded answer on second click', async () => {
    const user = userEvent.setup()
    render(<FAQSection />)

    const firstQuestion = screen.getByRole('button', {
      name: new RegExp(LANDING_FAQS[0].question, 'i'),
    })
    await user.click(firstQuestion)
    await user.click(firstQuestion)

    const firstWords = LANDING_FAQS[0].answer.slice(0, 20)
    expect(
      screen.queryByText(new RegExp(firstWords, 'i'))
    ).not.toBeInTheDocument()
  })

  it('has id="faq" on the section element', () => {
    const { container } = render(<FAQSection />)
    const section = container.querySelector('section')
    expect(section).toHaveAttribute('id', 'faq')
  })

  it('applies custom className prop to the section', () => {
    const { container } = render(<FAQSection className="my-custom-class" />)
    const section = container.querySelector('section')
    expect(section).toHaveClass('my-custom-class')
  })
})
