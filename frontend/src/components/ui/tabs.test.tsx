/**
 * Tests for Tabs component.
 *
 * Validates tabs navigation and content switching.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import {
  Tabs,
  TabsList,
  ScrollableTabsList,
  TabsTrigger,
  TabsContent,
} from './tabs'

describe('Tabs', () => {
  const TabsExample = () => (
    <Tabs defaultValue="tab1">
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content 1</TabsContent>
      <TabsContent value="tab2">Content 2</TabsContent>
      <TabsContent value="tab3">Content 3</TabsContent>
    </Tabs>
  )

  it('renders all tab triggers', () => {
    render(<TabsExample />)

    expect(screen.getByText('Tab 1')).toBeInTheDocument()
    expect(screen.getByText('Tab 2')).toBeInTheDocument()
    expect(screen.getByText('Tab 3')).toBeInTheDocument()
  })

  it('shows default tab content', () => {
    render(<TabsExample />)

    expect(screen.getByText('Content 1')).toBeVisible()
  })

  it('switches content when tab is clicked', async () => {
    const user = userEvent.setup()
    render(<TabsExample />)

    await user.click(screen.getByText('Tab 2'))
    expect(screen.getByText('Content 2')).toBeVisible()

    await user.click(screen.getByText('Tab 3'))
    expect(screen.getByText('Content 3')).toBeVisible()

    // Switch back to Tab 1
    await user.click(screen.getByText('Tab 1'))
    expect(screen.getByText('Content 1')).toBeVisible()
  })

  it('applies active state to selected tab', async () => {
    const user = userEvent.setup()
    render(<TabsExample />)

    const tab1 = screen.getByText('Tab 1')
    const tab2 = screen.getByText('Tab 2')

    expect(tab1).toHaveAttribute('data-state', 'active')
    expect(tab2).toHaveAttribute('data-state', 'inactive')

    await user.click(tab2)
    expect(tab1).toHaveAttribute('data-state', 'inactive')
    expect(tab2).toHaveAttribute('data-state', 'active')
  })

  it('supports controlled state', () => {
    const { rerender } = render(
      <Tabs value="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('Content 1')).toBeVisible()

    rerender(
      <Tabs value="tab2">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('Content 2')).toBeVisible()
  })

  it('calls onValueChange when tab changes', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <Tabs defaultValue="tab1" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    )

    await user.click(screen.getByText('Tab 2'))
    expect(onValueChange).toHaveBeenCalledWith('tab2')
  })

  it('accepts custom className on TabsList', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList className="custom-list">
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content</TabsContent>
      </Tabs>
    )

    const list = screen.getByRole('tablist')
    expect(list).toHaveClass('custom-list')
  })

  it('accepts custom className on TabsTrigger', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1" className="custom-trigger">
            Tab 1
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content</TabsContent>
      </Tabs>
    )

    const trigger = screen.getByText('Tab 1')
    expect(trigger).toHaveClass('custom-trigger')
  })

  it('renders triggers with pill corners (pill canon)', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('Tab 1')).toHaveClass('rounded-button')
  })

  it('accepts custom className on TabsContent', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="custom-content">
          Content
        </TabsContent>
      </Tabs>
    )

    const content = screen.getByText('Content')
    expect(content).toHaveClass('custom-content')
  })

  it('supports disabled tabs', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <Tabs defaultValue="tab1" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2" disabled>
            Tab 2 (Disabled)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    )

    const disabledTab = screen.getByText('Tab 2 (Disabled)')
    expect(disabledTab).toBeDisabled()

    await user.click(disabledTab)
    expect(onValueChange).not.toHaveBeenCalled()
  })

  describe('Visual Enhancements', () => {
    it('applies enhanced surface styling to TabsList', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      )

      const list = screen.getByRole('tablist')
      expect(list).toHaveClass(
        'bg-surface-raised',
        'border',
        'border-border-subtle',
        'shadow-sm'
      )
    })

    it('applies smooth transitions to TabsList', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      )

      const list = screen.getByRole('tablist')
      expect(list).toHaveClass('transition-all', 'duration-fast')
    })

    it('applies elevation shadow to active tab trigger', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      )

      const activeTab = screen.getByText('Tab 1')
      expect(activeTab.className).toContain(
        'data-[state=active]:shadow-elevation-1'
      )
    })

    it('applies smooth transitions with expo easing to triggers', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      )

      const trigger = screen.getByText('Tab 1')
      expect(trigger).toHaveClass(
        'transition-all',
        'duration-fast',
        'ease-out-expo'
      )
    })
  })

  describe('ScrollableTabsList', () => {
    const ScrollableExample = () => (
      <Tabs defaultValue="tab1">
        <ScrollableTabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          <TabsTrigger value="tab3">Tab 3</TabsTrigger>
        </ScrollableTabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
      </Tabs>
    )

    it('renders all triggers inside a scrollable container', () => {
      render(<ScrollableExample />)

      expect(screen.getByText('Tab 1')).toBeInTheDocument()
      expect(screen.getByText('Tab 3')).toBeInTheDocument()
      expect(screen.getByTestId('scrollable-tabs-list')).toHaveClass(
        'overflow-x-auto'
      )
    })

    it('hides both edge fades when content is not overflowing', () => {
      render(<ScrollableExample />)

      // jsdom reports zero layout, so nothing overflows: both fades hidden.
      expect(screen.getByTestId('scrollable-tabs-fade-left')).toHaveClass(
        'opacity-0'
      )
      expect(screen.getByTestId('scrollable-tabs-fade-right')).toHaveClass(
        'opacity-0'
      )
    })

    it('shows the right fade when more tabs are scrollable to the right', () => {
      render(<ScrollableExample />)

      const scroller = screen.getByTestId('scrollable-tabs-list')
      Object.defineProperty(scroller, 'scrollWidth', {
        configurable: true,
        value: 600,
      })
      Object.defineProperty(scroller, 'clientWidth', {
        configurable: true,
        value: 300,
      })
      scroller.scrollLeft = 0
      fireEvent.scroll(scroller)

      expect(screen.getByTestId('scrollable-tabs-fade-right')).toHaveClass(
        'opacity-100'
      )
      expect(screen.getByTestId('scrollable-tabs-fade-left')).toHaveClass(
        'opacity-0'
      )
    })

    it('shows the left fade once scrolled away from the start', () => {
      render(<ScrollableExample />)

      const scroller = screen.getByTestId('scrollable-tabs-list')
      Object.defineProperty(scroller, 'scrollWidth', {
        configurable: true,
        value: 600,
      })
      Object.defineProperty(scroller, 'clientWidth', {
        configurable: true,
        value: 300,
      })
      scroller.scrollLeft = 300
      fireEvent.scroll(scroller)

      expect(screen.getByTestId('scrollable-tabs-fade-left')).toHaveClass(
        'opacity-100'
      )
      expect(screen.getByTestId('scrollable-tabs-fade-right')).toHaveClass(
        'opacity-0'
      )
    })
  })
})
