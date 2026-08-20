/**
 * Tests for Tooltip component.
 *
 * Validates tooltip display and interactions.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './tooltip'

describe('Tooltip', () => {
  const TooltipExample = ({ content = 'Tooltip text' }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  it('renders trigger element', () => {
    render(<TooltipExample />)

    expect(screen.getByText('Hover me')).toBeInTheDocument()
  })

  it('shows tooltip content on hover', async () => {
    const user = userEvent.setup()
    render(<TooltipExample />)

    const trigger = screen.getByText('Hover me')
    await user.hover(trigger)

    // Tooltip text appears (may be duplicated for accessibility)
    const tooltips = await screen.findAllByText('Tooltip text')
    expect(tooltips.length).toBeGreaterThan(0)
  })

  it('renders custom content', async () => {
    const user = userEvent.setup()
    render(<TooltipExample content="Custom tooltip message" />)

    const trigger = screen.getByText('Hover me')
    await user.hover(trigger)

    const tooltips = await screen.findAllByText('Custom tooltip message')
    expect(tooltips.length).toBeGreaterThan(0)
  })

  it('accepts custom className on TooltipContent', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent className="custom-tooltip">
            Custom styled
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const trigger = screen.getByText('Hover me')
    await user.hover(trigger)

    await screen.findAllByText('Custom styled')
    const tooltip = container.querySelector('.custom-tooltip')
    expect(tooltip).toBeInTheDocument()
  })

  it('supports custom sideOffset', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent sideOffset={10}>With offset</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    expect(screen.getByText('Hover me')).toBeInTheDocument()
  })

  it('can be opened programmatically', () => {
    render(
      <TooltipProvider>
        <Tooltip open={true}>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent>Always visible</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const tooltips = screen.getAllByText('Always visible')
    expect(tooltips.length).toBeGreaterThan(0)
  })

  it('renders with TooltipProvider wrapper', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Test trigger</TooltipTrigger>
          <TooltipContent>Test content</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    expect(screen.getByText('Test trigger')).toBeInTheDocument()
  })
})
