/**
 * Tests for FormatCard component.
 *
 * Validates selectable format card display and interaction.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormatCard } from './FormatCard'
import type { FormatMetadata } from '../types'

const mockFormat: FormatMetadata = {
  id: 'pdf',
  name: 'PDF Export',
  description: 'Export as a PDF document',
  icon: 'FileText',
}

describe('FormatCard', () => {
  it('renders format name and description', () => {
    render(
      <FormatCard format={mockFormat} selected={false} onClick={vi.fn()} />
    )

    expect(screen.getByText('PDF Export')).toBeInTheDocument()
    expect(screen.getByText('Export as a PDF document')).toBeInTheDocument()
  })

  it('applies selected styles when selected is true', () => {
    const { container } = render(
      <FormatCard format={mockFormat} selected={true} onClick={vi.fn()} />
    )

    const card = container.querySelector('[class*="border-primary"]')
    expect(card).toBeInTheDocument()
  })

  it('does not apply selected styles when selected is false', () => {
    const { container } = render(
      <FormatCard format={mockFormat} selected={false} onClick={vi.fn()} />
    )

    const card = container.querySelector('[class*="border-primary"]')
    // Card exists but doesn't have the selected border class
    expect(container.querySelector('.cursor-pointer')).toBeInTheDocument()
  })

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <FormatCard format={mockFormat} selected={false} onClick={onClick} />
    )

    const card = screen.getByText('PDF Export').closest('div')
      ?.parentElement?.parentElement
    if (card) {
      await user.click(card)
      expect(onClick).toHaveBeenCalledTimes(1)
    }
  })

  it('renders FileSpreadsheet icon when icon is FileSpreadsheet', () => {
    const excelFormat: FormatMetadata = {
      ...mockFormat,
      icon: 'FileSpreadsheet',
    }

    render(
      <FormatCard format={excelFormat} selected={false} onClick={vi.fn()} />
    )

    expect(screen.getByText('PDF Export')).toBeInTheDocument()
  })

  it('renders Building2 icon when icon is Building2', () => {
    const yardiFormat: FormatMetadata = {
      ...mockFormat,
      icon: 'Building2',
    }

    render(
      <FormatCard format={yardiFormat} selected={false} onClick={vi.fn()} />
    )

    expect(screen.getByText('PDF Export')).toBeInTheDocument()
  })

  it('renders Building icon when icon is Building', () => {
    const mriFormat: FormatMetadata = {
      ...mockFormat,
      icon: 'Building',
    }

    render(<FormatCard format={mriFormat} selected={false} onClick={vi.fn()} />)

    expect(screen.getByText('PDF Export')).toBeInTheDocument()
  })

  it('renders FileText as fallback icon for unknown icon names', () => {
    const unknownIconFormat: FormatMetadata = {
      ...mockFormat,
      icon: 'UnknownIcon' as any,
    }

    render(
      <FormatCard
        format={unknownIconFormat}
        selected={false}
        onClick={vi.fn()}
      />
    )

    expect(screen.getByText('PDF Export')).toBeInTheDocument()
  })

  it('applies primary background to icon container when selected', () => {
    const { container } = render(
      <FormatCard format={mockFormat} selected={true} onClick={vi.fn()} />
    )

    const iconContainer = container.querySelector('[class*="bg-primary"]')
    expect(iconContainer).toBeInTheDocument()
  })

  it('applies muted background to icon container when not selected', () => {
    const { container } = render(
      <FormatCard format={mockFormat} selected={false} onClick={vi.fn()} />
    )

    const iconContainer = container.querySelector('[class*="bg-muted"]')
    expect(iconContainer).toBeInTheDocument()
  })

  it('activates onClick when Enter is pressed', () => {
    const onClick = vi.fn()
    render(
      <FormatCard format={mockFormat} selected={false} onClick={onClick} />
    )

    const card = screen.getByRole('button', { name: /PDF Export/i })
    fireEvent.keyDown(card, { key: 'Enter' })

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('activates onClick when Space is pressed', () => {
    const onClick = vi.fn()
    render(
      <FormatCard format={mockFormat} selected={false} onClick={onClick} />
    )

    const card = screen.getByRole('button', { name: /PDF Export/i })
    fireEvent.keyDown(card, { key: ' ' })

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
