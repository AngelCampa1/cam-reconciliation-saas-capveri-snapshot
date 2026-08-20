/**
 * Tests for DropdownMenu component.
 *
 * Validates dropdown menu rendering, items, and interactions.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuRadioGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from './dropdown-menu'

describe('DropdownMenu', () => {
  it('renders trigger button', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    expect(screen.getByText('Open Menu')).toBeInTheDocument()
  })

  it('opens menu when trigger is clicked', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Action 1</DropdownMenuItem>
          <DropdownMenuItem>Action 2</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open Menu'))

    expect(await screen.findByText('Action 1')).toBeInTheDocument()
    expect(screen.getByText('Action 2')).toBeInTheDocument()
  })

  it('calls onSelect when menu item is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Click me</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open Menu'))
    const menuItem = await screen.findByText('Click me')
    await user.click(menuItem)

    expect(onSelect).toHaveBeenCalled()
  })

  it('renders menu item with inset prop', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem inset>Inset Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Inset Item')).toBeInTheDocument()
  })

  it('renders checkbox items with checked state', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked={true}>
            Checked Item
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false}>
            Unchecked Item
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))

    expect(await screen.findByText('Checked Item')).toBeInTheDocument()
    expect(screen.getByText('Unchecked Item')).toBeInTheDocument()
  })

  it('handles checkbox item undefined checked state', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem>No checked prop</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('No checked prop')).toBeInTheDocument()
  })

  it('renders radio group with radio items', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="option1">
            <DropdownMenuRadioItem value="option1">
              Option 1
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="option2">
              Option 2
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))

    expect(await screen.findByText('Option 1')).toBeInTheDocument()
    expect(screen.getByText('Option 2')).toBeInTheDocument()
  })

  it('renders menu label', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Section Label</DropdownMenuLabel>
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Section Label')).toBeInTheDocument()
  })

  it('renders menu label with inset', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel inset>Inset Label</DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Inset Label')).toBeInTheDocument()
  })

  it('renders menu separator', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Item 2</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
  })

  it('renders menu shortcut', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>
            Save
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('⌘S')).toBeInTheDocument()
  })

  it('accepts custom className on DropdownMenuContent', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent className="custom-menu">
          <DropdownMenuItem>Custom Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Custom Item')).toBeInTheDocument()
  })

  it('respects disabled state on menu item', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled onSelect={onSelect}>
            Disabled Item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByText('Open'))
    const item = await screen.findByText('Disabled Item')

    await user.click(item)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('can be controlled programmatically', () => {
    render(
      <DropdownMenu open={true}>
        <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Always visible</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    expect(screen.getByText('Always visible')).toBeInTheDocument()
  })
})
