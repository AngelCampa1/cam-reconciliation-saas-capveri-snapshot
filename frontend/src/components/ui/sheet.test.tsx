/**
 * Tests for Sheet component.
 *
 * Validates sheet (drawer/sidebar) rendering and variants.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './sheet'

function renderAccessibleSheetContent(
  body: React.ReactNode,
  options?: { side?: 'top' | 'bottom' | 'left' | 'right' }
) {
  return (
    <SheetContent side={options?.side}>
      <SheetHeader>
        <SheetTitle>Sheet Title</SheetTitle>
        <SheetDescription>Sheet description</SheetDescription>
      </SheetHeader>
      {body}
    </SheetContent>
  )
}

describe('Sheet', () => {
  it('renders trigger button', () => {
    render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
        {renderAccessibleSheetContent('Content')}
      </Sheet>
    )

    expect(screen.getByText('Open Sheet')).toBeInTheDocument()
  })

  it('opens sheet when trigger is clicked', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
        <SheetContent>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>Sheet content here</SheetDescription>
        </SheetContent>
      </Sheet>
    )

    await user.click(screen.getByText('Open Sheet'))

    expect(await screen.findByText('Sheet Title')).toBeInTheDocument()
    expect(screen.getByText('Sheet content here')).toBeInTheDocument()
  })

  it('renders with right side by default', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        {renderAccessibleSheetContent('Content')}
      </Sheet>
    )

    await user.click(screen.getByText('Open'))

    await screen.findByText('Content')
    const content = container.querySelector('[data-state="open"]')
    expect(content).toBeInTheDocument()
  })

  it('renders with left side variant', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        {renderAccessibleSheetContent('Left side content', { side: 'left' })}
      </Sheet>
    )

    await user.click(screen.getByText('Open'))

    expect(await screen.findByText('Left side content')).toBeInTheDocument()
  })

  it('renders with top side variant', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        {renderAccessibleSheetContent('Top content', { side: 'top' })}
      </Sheet>
    )

    await user.click(screen.getByText('Open'))

    expect(await screen.findByText('Top content')).toBeInTheDocument()
  })

  it('renders with bottom side variant', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        {renderAccessibleSheetContent('Bottom content', { side: 'bottom' })}
      </Sheet>
    )

    await user.click(screen.getByText('Open'))

    expect(await screen.findByText('Bottom content')).toBeInTheDocument()
  })

  it('renders SheetHeader component', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Title in Header</SheetTitle>
            <SheetDescription>Sheet description</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )

    await user.click(screen.getByText('Open'))

    expect(await screen.findByText('Title in Header')).toBeInTheDocument()
  })

  it('renders SheetFooter component', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet description</SheetDescription>
          </SheetHeader>
          <SheetFooter>Footer content</SheetFooter>
        </SheetContent>
      </Sheet>
    )

    await user.click(screen.getByText('Open'))

    expect(await screen.findByText('Footer content')).toBeInTheDocument()
  })

  it('closes sheet when close button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Sheet content</SheetTitle>
          <SheetDescription>Sheet description</SheetDescription>
        </SheetContent>
      </Sheet>
    )

    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Sheet content')).toBeInTheDocument()

    const closeButton = screen.getByRole('button', { name: /close/i })
    await user.click(closeButton)

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.queryByText('Sheet content')).not.toBeInTheDocument()
  })

  it('accepts custom className on SheetContent', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent className="custom-sheet">
          <SheetTitle>Custom Content</SheetTitle>
          <SheetDescription>Sheet description</SheetDescription>
        </SheetContent>
      </Sheet>
    )

    await user.click(screen.getByText('Open'))

    expect(await screen.findByText('Custom Content')).toBeInTheDocument()
  })

  it('can be controlled programmatically', () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open={true} onOpenChange={onOpenChange}>
        <SheetTrigger>Trigger</SheetTrigger>
        {renderAccessibleSheetContent('Always open content')}
      </Sheet>
    )

    expect(screen.getByText('Always open content')).toBeInTheDocument()
  })
})
