import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Building2, Search, RefreshCw } from 'lucide-react'
import {
  EmptyState,
  EmptyStateNoProperties,
  EmptyStateNoLeases,
  EmptyStateNoImports,
  EmptyStateNoSearchResults,
  EmptyStateNoTenants,
  EmptyStateNoReconciliations,
  EmptyStateNoData,
  EmptyStateDashboard,
} from './EmptyState'

describe('EmptyState', () => {
  describe('Rendering', () => {
    it('should render with required props', () => {
      render(
        <EmptyState
          title="No items"
          description="There are no items to show."
        />
      )

      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      expect(screen.getByText('No items')).toBeInTheDocument()
      expect(
        screen.getByText('There are no items to show.')
      ).toBeInTheDocument()
    })

    it('should have role="status" for accessibility', () => {
      render(
        <EmptyState
          title="No items"
          description="There are no items to show."
        />
      )

      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('should have aria-label matching title', () => {
      render(<EmptyState title="No properties" description="Add a property." />)

      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'No properties'
      )
    })

    it('should render default icon (FolderOpen)', () => {
      render(<EmptyState title="No items" description="Description." />)

      const emptyState = screen.getByTestId('empty-state')
      const iconContainer = emptyState.querySelector('div > div')
      expect(iconContainer).toBeInTheDocument()
      expect(iconContainer?.querySelector('svg')).toBeInTheDocument()
    })

    it('should render custom icon', () => {
      render(
        <EmptyState
          icon={Building2}
          title="No properties"
          description="Add properties."
        />
      )

      // Icon should be present and hidden from accessibility tree
      const svg = screen.getByTestId('empty-state').querySelector('svg')
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('Sizes', () => {
    it('should render small size', () => {
      render(
        <EmptyState title="No items" description="Description" size="sm" />
      )

      const emptyState = screen.getByTestId('empty-state')
      expect(emptyState).toHaveClass('py-6')
      expect(emptyState).toHaveClass('px-4')
    })

    it('should render medium size (default)', () => {
      render(<EmptyState title="No items" description="Description" />)

      const emptyState = screen.getByTestId('empty-state')
      expect(emptyState).toHaveClass('py-12')
      expect(emptyState).toHaveClass('px-6')
    })

    it('should render large size', () => {
      render(
        <EmptyState title="No items" description="Description" size="lg" />
      )

      const emptyState = screen.getByTestId('empty-state')
      expect(emptyState).toHaveClass('py-16')
      expect(emptyState).toHaveClass('px-8')
    })

    it('should apply size to title', () => {
      const { rerender } = render(
        <EmptyState title="Title" description="Desc" size="sm" />
      )
      expect(screen.getByText('Title')).toHaveClass('text-base')

      rerender(<EmptyState title="Title" description="Desc" size="md" />)
      expect(screen.getByText('Title')).toHaveClass('text-lg')

      rerender(<EmptyState title="Title" description="Desc" size="lg" />)
      expect(screen.getByText('Title')).toHaveClass('text-xl')
    })
  })

  describe('Actions', () => {
    it('should not render action button when no action provided', () => {
      render(<EmptyState title="No items" description="Description" />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('should render primary action button', () => {
      const onClick = vi.fn()
      render(
        <EmptyState
          title="No items"
          description="Description"
          action={{
            label: 'Add Item',
            onClick,
          }}
        />
      )

      const button = screen.getByRole('button', { name: /add item/i })
      expect(button).toBeInTheDocument()
    })

    it('should call onClick when action button clicked', async () => {
      const user = userEvent.setup()
      const onClick = vi.fn()

      render(
        <EmptyState
          title="No items"
          description="Description"
          action={{
            label: 'Add Item',
            onClick,
          }}
        />
      )

      await user.click(screen.getByRole('button', { name: /add item/i }))
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('should render action with default Plus icon', () => {
      render(
        <EmptyState
          title="No items"
          description="Description"
          action={{
            label: 'Add Item',
            onClick: vi.fn(),
          }}
        />
      )

      const button = screen.getByRole('button', { name: /add item/i })
      expect(button.querySelector('svg')).toBeInTheDocument()
    })

    it('should render action with custom icon', () => {
      render(
        <EmptyState
          title="No items"
          description="Description"
          action={{
            label: 'Refresh',
            onClick: vi.fn(),
            icon: RefreshCw,
          }}
        />
      )

      const button = screen.getByRole('button', { name: /refresh/i })
      expect(button.querySelector('svg')).toBeInTheDocument()
    })

    it('should render action with specified variant', () => {
      render(
        <EmptyState
          title="No items"
          description="Description"
          action={{
            label: 'Action',
            onClick: vi.fn(),
            variant: 'outline',
          }}
        />
      )

      const button = screen.getByRole('button', { name: /action/i })
      expect(button).toHaveClass('border')
    })

    it('should render secondary action button', () => {
      render(
        <EmptyState
          title="No items"
          description="Description"
          action={{
            label: 'Primary',
            onClick: vi.fn(),
          }}
          secondaryAction={{
            label: 'Secondary',
            onClick: vi.fn(),
          }}
        />
      )

      expect(
        screen.getByRole('button', { name: /primary/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /secondary/i })
      ).toBeInTheDocument()
    })

    it('should call secondary action onClick', async () => {
      const user = userEvent.setup()
      const secondaryOnClick = vi.fn()

      render(
        <EmptyState
          title="No items"
          description="Description"
          secondaryAction={{
            label: 'Secondary',
            onClick: secondaryOnClick,
          }}
        />
      )

      await user.click(screen.getByRole('button', { name: /secondary/i }))
      expect(secondaryOnClick).toHaveBeenCalledTimes(1)
    })

    it('should use smaller button size for sm variant', () => {
      render(
        <EmptyState
          title="No items"
          description="Description"
          size="sm"
          action={{
            label: 'Add',
            onClick: vi.fn(),
          }}
        />
      )

      const button = screen.getByRole('button', { name: /add/i })
      expect(button).toHaveClass('h-10')
    })
  })

  describe('Custom Props', () => {
    it('should accept custom className', () => {
      render(
        <EmptyState
          title="No items"
          description="Description"
          className="my-custom-class"
        />
      )

      expect(screen.getByTestId('empty-state')).toHaveClass('my-custom-class')
    })

    it('should accept custom data-testid', () => {
      render(
        <EmptyState
          title="No items"
          description="Description"
          data-testid="custom-empty"
        />
      )

      expect(screen.getByTestId('custom-empty')).toBeInTheDocument()
    })
  })
})

describe('EmptyStateNoProperties', () => {
  it('should render with correct content', () => {
    render(<EmptyStateNoProperties />)

    expect(screen.getByTestId('empty-state-no-properties')).toBeInTheDocument()
    expect(screen.getByText('No buildings yet')).toBeInTheDocument()
    expect(
      screen.getByText(/We check the statement before you send it/i)
    ).toBeInTheDocument()
  })

  it('should render action button when onAction provided', () => {
    const onAction = vi.fn()
    render(<EmptyStateNoProperties onAction={onAction} />)

    expect(
      screen.getByRole('button', { name: /add your first building/i })
    ).toBeInTheDocument()
  })

  it('should not render action button when no onAction', () => {
    render(<EmptyStateNoProperties />)

    expect(
      screen.queryByRole('button', { name: /add your first building/i })
    ).not.toBeInTheDocument()
  })

  it('should call onAction when clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<EmptyStateNoProperties onAction={onAction} />)

    await user.click(
      screen.getByRole('button', { name: /add your first building/i })
    )
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('should accept size prop', () => {
    render(<EmptyStateNoProperties size="lg" />)

    expect(screen.getByTestId('empty-state-no-properties')).toHaveClass('py-16')
  })

  it('should accept className prop', () => {
    render(<EmptyStateNoProperties className="custom-class" />)

    expect(screen.getByTestId('empty-state-no-properties')).toHaveClass(
      'custom-class'
    )
  })
})

describe('EmptyStateNoLeases', () => {
  it('should render with correct content', () => {
    render(<EmptyStateNoLeases />)

    expect(screen.getByTestId('empty-state-no-leases')).toBeInTheDocument()
    expect(screen.getByText('No leases yet')).toBeInTheDocument()
    expect(screen.getByText(/Add a lease for each tenant/i)).toBeInTheDocument()
  })

  it('should render action button when onAction provided', () => {
    const onAction = vi.fn()
    render(<EmptyStateNoLeases onAction={onAction} />)

    expect(
      screen.getByRole('button', { name: /add a lease/i })
    ).toBeInTheDocument()
  })

  it('should call onAction when clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<EmptyStateNoLeases onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: /add a lease/i }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('should render the sample button only when onSeeSample provided', () => {
    const { rerender } = render(<EmptyStateNoLeases />)
    expect(
      screen.queryByRole('button', { name: /see a sample first/i })
    ).not.toBeInTheDocument()

    rerender(<EmptyStateNoLeases onSeeSample={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: /see a sample first/i })
    ).toBeInTheDocument()
  })

  it('should call onSeeSample when the sample button is clicked', async () => {
    const user = userEvent.setup()
    const onSeeSample = vi.fn()
    render(<EmptyStateNoLeases onSeeSample={onSeeSample} />)

    await user.click(
      screen.getByRole('button', { name: /see a sample first/i })
    )
    expect(onSeeSample).toHaveBeenCalledTimes(1)
  })
})

describe('EmptyStateNoImports', () => {
  it('should render with correct content', () => {
    render(<EmptyStateNoImports />)

    expect(screen.getByTestId('empty-state-no-imports')).toBeInTheDocument()
    expect(screen.getByText('No files yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Start with your building cost file/i)
    ).toBeInTheDocument()
  })

  it('should render action button when onAction provided', () => {
    const onAction = vi.fn()
    render(<EmptyStateNoImports onAction={onAction} />)

    expect(
      screen.getByRole('button', { name: /upload a file/i })
    ).toBeInTheDocument()
  })

  it('should call onAction when clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<EmptyStateNoImports onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: /upload a file/i }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('EmptyStateNoSearchResults', () => {
  it('should render with default content', () => {
    render(<EmptyStateNoSearchResults />)

    expect(
      screen.getByTestId('empty-state-no-search-results')
    ).toBeInTheDocument()
    expect(screen.getByText('No results found')).toBeInTheDocument()
    expect(
      screen.getByText(/No results found\. Try adjusting/i)
    ).toBeInTheDocument()
  })

  it('should include query in description when provided', () => {
    render(<EmptyStateNoSearchResults query="test search" />)

    expect(
      screen.getByText(/No results found for "test search"/i)
    ).toBeInTheDocument()
  })

  it('should render clear button when onClear provided', () => {
    const onClear = vi.fn()
    render(<EmptyStateNoSearchResults onClear={onClear} />)

    expect(
      screen.getByRole('button', { name: /clear search/i })
    ).toBeInTheDocument()
  })

  it('should call onClear when clicked', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<EmptyStateNoSearchResults onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: /clear search/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('should not render clear button when no onClear', () => {
    render(<EmptyStateNoSearchResults />)

    expect(
      screen.queryByRole('button', { name: /clear search/i })
    ).not.toBeInTheDocument()
  })
})

describe('EmptyStateNoTenants', () => {
  it('should render with correct content', () => {
    render(<EmptyStateNoTenants />)

    expect(screen.getByTestId('empty-state-no-tenants')).toBeInTheDocument()
    expect(screen.getByText('No tenants yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Add a tenant to track their lease/i)
    ).toBeInTheDocument()
  })

  it('should render action button when onAction provided', () => {
    const onAction = vi.fn()
    render(<EmptyStateNoTenants onAction={onAction} />)

    expect(
      screen.getByRole('button', { name: /add a tenant/i })
    ).toBeInTheDocument()
  })

  it('should call onAction when clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<EmptyStateNoTenants onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: /add a tenant/i }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('EmptyStateNoReconciliations', () => {
  it('should render with correct content', () => {
    render(<EmptyStateNoReconciliations />)

    expect(
      screen.getByTestId('empty-state-no-reconciliations')
    ).toBeInTheDocument()
    expect(screen.getByText('No checks yet')).toBeInTheDocument()
    expect(screen.getByText(/Run your first check/i)).toBeInTheDocument()
  })

  it('should render action button when onAction provided', () => {
    const onAction = vi.fn()
    render(<EmptyStateNoReconciliations onAction={onAction} />)

    expect(
      screen.getByRole('button', { name: /run your first check/i })
    ).toBeInTheDocument()
  })

  it('should call onAction when clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<EmptyStateNoReconciliations onAction={onAction} />)

    await user.click(
      screen.getByRole('button', { name: /run your first check/i })
    )
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('EmptyStateNoData', () => {
  it('should render with correct content', () => {
    render(<EmptyStateNoData />)

    expect(screen.getByTestId('empty-state-no-data')).toBeInTheDocument()
    expect(screen.getByText('No data available')).toBeInTheDocument()
    expect(screen.getByText(/No data to show/i)).toBeInTheDocument()
  })

  it('should render refresh button when onAction provided', () => {
    const onAction = vi.fn()
    render(<EmptyStateNoData onAction={onAction} />)

    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
  })

  it('should use outline variant for refresh button', () => {
    render(<EmptyStateNoData onAction={vi.fn()} />)

    const button = screen.getByRole('button', { name: /refresh/i })
    expect(button).toHaveClass('border')
  })

  it('should call onAction when clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<EmptyStateNoData onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: /refresh/i }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('EmptyStateDashboard', () => {
  it('uses assurance copy instead of found-money copy', () => {
    render(<EmptyStateDashboard />)

    expect(screen.getByTestId('empty-state-dashboard')).toBeInTheDocument()
    expect(
      screen.getByText(/We check the statement before you send it/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/catches over-bills and under-bills/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/finds money your tenants/i)
    ).not.toBeInTheDocument()
  })
})

describe('Accessibility', () => {
  it('should have proper ARIA attributes', () => {
    render(<EmptyState title="No items" description="There are no items." />)

    const emptyState = screen.getByRole('status')
    expect(emptyState).toHaveAttribute('aria-label', 'No items')
  })

  it('should hide icons from screen readers', () => {
    render(
      <EmptyState icon={Search} title="No results" description="Try again." />
    )

    const svg = screen.getByTestId('empty-state').querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('should be keyboard navigable with action', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <EmptyState
        title="No items"
        description="Description"
        action={{
          label: 'Add Item',
          onClick,
        }}
      />
    )

    const button = screen.getByRole('button', { name: /add item/i })
    await user.tab()
    expect(button).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalled()
  })

  it('should allow keyboard navigation between actions', async () => {
    const user = userEvent.setup()
    const primaryOnClick = vi.fn()
    const secondaryOnClick = vi.fn()

    render(
      <EmptyState
        title="No items"
        description="Description"
        action={{
          label: 'Primary',
          onClick: primaryOnClick,
        }}
        secondaryAction={{
          label: 'Secondary',
          onClick: secondaryOnClick,
        }}
      />
    )

    await user.tab()
    expect(screen.getByRole('button', { name: /primary/i })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: /secondary/i })).toHaveFocus()
  })
})

describe('Visual Consistency', () => {
  it('should center content', () => {
    render(<EmptyState title="No items" description="Description" />)

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveClass('items-center')
    expect(emptyState).toHaveClass('justify-center')
    expect(emptyState).toHaveClass('text-center')
  })

  it('should have gradient background for icon container', () => {
    render(<EmptyState title="No items" description="Description" />)

    const iconContainer = screen
      .getByTestId('empty-state')
      .querySelector('div > div')
    // Enhanced with gradient background for premium feel
    expect(iconContainer).toHaveClass('bg-gradient-to-br')
    expect(iconContainer).toHaveClass('rounded-full')
  })

  it('should have muted foreground for description', () => {
    render(<EmptyState title="No items" description="Description text" />)

    const description = screen.getByText('Description text')
    expect(description).toHaveClass('text-muted-foreground')
  })

  it('should constrain description width', () => {
    render(<EmptyState title="No items" description="Description" />)

    const description = screen.getByText('Description')
    expect(description).toHaveClass('max-w-sm')
  })
})
