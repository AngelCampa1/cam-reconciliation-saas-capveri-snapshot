import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs'
import { Building2 } from 'lucide-react'

describe('Breadcrumbs', () => {
  const defaultItems: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/' },
    { label: 'Properties', href: '/properties' },
    { label: 'Building A' },
  ]

  describe('Rendering', () => {
    it('should render breadcrumb items', () => {
      render(<Breadcrumbs items={defaultItems} />)

      expect(screen.getByText('Properties')).toBeInTheDocument()
      expect(screen.getByText('Building A')).toBeInTheDocument()
    })

    it('should return null when items array is empty', () => {
      const { container } = render(<Breadcrumbs items={[]} />)
      expect(container.firstChild).toBeNull()
    })

    it('should render navigation element with aria-label', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
      expect(nav).toBeInTheDocument()
    })

    it('should render list with correct role', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const list = screen.getByRole('list')
      expect(list).toBeInTheDocument()
    })

    it('should render home icon for first item by default', () => {
      render(<Breadcrumbs items={defaultItems} />)

      // The home icon should be present
      const nav = screen.getByTestId('breadcrumbs')
      expect(nav.querySelector('svg')).toBeInTheDocument()
    })

    it('should not render home icon when showHomeIcon is false', () => {
      render(<Breadcrumbs items={defaultItems} showHomeIcon={false} />)

      const link = screen.getByTestId('breadcrumb-link-dashboard')
      expect(link).toHaveTextContent('Dashboard')
      // No home icon class should be present
      expect(link.querySelector('.h-4.w-4')).toBeNull()
    })

    it('should apply custom className', () => {
      render(<Breadcrumbs items={defaultItems} className="custom-class" />)

      const nav = screen.getByTestId('breadcrumbs')
      expect(nav).toHaveClass('custom-class')
    })
  })

  describe('Links and Current Page', () => {
    it('should render links for items with href', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const dashboardLink = screen.getByTestId('breadcrumb-link-dashboard')
      expect(dashboardLink.tagName).toBe('A')
      expect(dashboardLink).toHaveAttribute('href', '/')

      const propertiesLink = screen.getByTestId('breadcrumb-link-properties')
      expect(propertiesLink.tagName).toBe('A')
      expect(propertiesLink).toHaveAttribute('href', '/properties')
    })

    it('should render current page (no href) as span without link', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const currentPage = screen.getByTestId('breadcrumb-current-building-a')
      expect(currentPage.tagName).toBe('SPAN')
      expect(currentPage).not.toHaveAttribute('href')
    })

    it('should mark current page with aria-current', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const currentPage = screen.getByTestId('breadcrumb-current-building-a')
      expect(currentPage).toHaveAttribute('aria-current', 'page')
    })

    it('should not have aria-current on link items', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const link = screen.getByTestId('breadcrumb-link-properties')
      expect(link).not.toHaveAttribute('aria-current')
    })
  })

  describe('Separators', () => {
    it('should render chevron separators between items', () => {
      render(<Breadcrumbs items={defaultItems} />)

      // 3 items = 2 separators
      const nav = screen.getByTestId('breadcrumbs')
      const separators = nav.querySelectorAll('[aria-hidden="true"]')
      // 2 chevrons + icons (home icons have aria-hidden too)
      expect(separators.length).toBeGreaterThanOrEqual(2)
    })

    it('should not render separator before first item', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const list = screen.getByRole('list')
      const firstItem = list.firstElementChild
      // First child of first li should NOT be a chevron
      expect(firstItem?.querySelector('svg.shrink-0')).toBeNull()
    })
  })

  describe('Icons', () => {
    it('should render custom icon when provided', () => {
      const itemsWithIcon: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/' },
        {
          label: 'Properties',
          href: '/properties',
          icon: <Building2 data-testid="custom-icon" />,
        },
        { label: 'Building A' },
      ]

      render(<Breadcrumbs items={itemsWithIcon} />)

      expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
    })

    it('should show custom icon on current page item', () => {
      const itemsWithIcon: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/' },
        { label: 'Building A', icon: <Building2 data-testid="current-icon" /> },
      ]

      render(<Breadcrumbs items={itemsWithIcon} />)

      expect(screen.getByTestId('current-icon')).toBeInTheDocument()
    })
  })

  describe('Navigation Callback', () => {
    it('should call onNavigate when link is clicked', async () => {
      const user = userEvent.setup()
      const onNavigate = vi.fn()

      render(<Breadcrumbs items={defaultItems} onNavigate={onNavigate} />)

      const propertiesLink = screen.getByTestId('breadcrumb-link-properties')
      await user.click(propertiesLink)

      expect(onNavigate).toHaveBeenCalledWith('/properties')
    })

    it('should prevent default navigation when onNavigate is provided', async () => {
      const user = userEvent.setup()
      const onNavigate = vi.fn()

      render(<Breadcrumbs items={defaultItems} onNavigate={onNavigate} />)

      const link = screen.getByTestId('breadcrumb-link-dashboard')
      await user.click(link)

      expect(onNavigate).toHaveBeenCalledWith('/')
    })

    it('should not call onNavigate when clicking current page', async () => {
      const user = userEvent.setup()
      const onNavigate = vi.fn()

      render(<Breadcrumbs items={defaultItems} onNavigate={onNavigate} />)

      // Current page is a span, not clickable as a link
      const currentPage = screen.getByTestId('breadcrumb-current-building-a')
      await user.click(currentPage)

      expect(onNavigate).not.toHaveBeenCalled()
    })
  })

  describe('Single Item', () => {
    it('should render single item as current page', () => {
      const singleItem: BreadcrumbItem[] = [{ label: 'Dashboard' }]

      render(<Breadcrumbs items={singleItem} />)

      const current = screen.getByTestId('breadcrumb-current-dashboard')
      expect(current).toBeInTheDocument()
      expect(current).toHaveAttribute('aria-current', 'page')
    })

    it('should not render any separators for single item', () => {
      const singleItem: BreadcrumbItem[] = [{ label: 'Dashboard' }]

      render(<Breadcrumbs items={singleItem} />)

      const nav = screen.getByTestId('breadcrumbs')
      // Only the home icon should have aria-hidden, no chevrons
      const chevrons = nav.querySelectorAll('svg.shrink-0')
      expect(chevrons.length).toBe(0)
    })
  })

  describe('Accessibility', () => {
    it('should be navigable with keyboard', async () => {
      const user = userEvent.setup()

      render(<Breadcrumbs items={defaultItems} />)

      const dashboardLink = screen.getByTestId('breadcrumb-link-dashboard')
      const propertiesLink = screen.getByTestId('breadcrumb-link-properties')

      await user.tab()
      expect(dashboardLink).toHaveFocus()

      await user.tab()
      expect(propertiesLink).toHaveFocus()
    })

    it('should have visible focus ring on links', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const link = screen.getByTestId('breadcrumb-link-dashboard')
      expect(link).toHaveClass('focus-visible:ring-2')
    })
  })

  describe('Long Labels', () => {
    it('should truncate long labels on current page', () => {
      const longItems: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/' },
        { label: 'This is a very long property name that should be truncated' },
      ]

      render(<Breadcrumbs items={longItems} />)

      const current = screen.getByTestId(
        'breadcrumb-current-this-is-a-very-long-property-name-that-should-be-truncated'
      )
      expect(current).toHaveClass('truncate')
    })
  })

  describe('Edge Cases', () => {
    it('should handle items with special characters in label', () => {
      const specialItems: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/' },
        { label: 'Building A & B' },
      ]

      render(<Breadcrumbs items={specialItems} />)

      expect(screen.getByText('Building A & B')).toBeInTheDocument()
    })

    it('should handle deeply nested paths', () => {
      const deepItems: BreadcrumbItem[] = [
        { label: 'Home', href: '/' },
        { label: 'Properties', href: '/properties' },
        { label: 'Building A', href: '/properties/1' },
        { label: 'Floor 3', href: '/properties/1/floors/3' },
        { label: 'Unit 301' },
      ]

      render(<Breadcrumbs items={deepItems} />)

      expect(screen.getByText('Floor 3')).toBeInTheDocument()
      expect(screen.getByText('Unit 301')).toBeInTheDocument()
    })
  })

  describe('Visual Enhancements', () => {
    it('applies enhanced gap spacing between items', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const list = screen.getByRole('list')
      expect(list).toHaveClass('gap-2')
    })

    it('applies thicker stroke to separator chevrons', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const nav = screen.getByTestId('breadcrumbs')
      const chevrons = nav.querySelectorAll('svg[stroke-width="2.5"]')
      // Should have separators between items (n-1 separators for n items)
      expect(chevrons.length).toBeGreaterThan(0)
    })

    it('applies enhanced hover state to breadcrumb links', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const link = screen.getByTestId('breadcrumb-link-properties')
      expect(link).toHaveClass('hover:decoration-primary/50')
      expect(link).toHaveClass('underline')
      expect(link).toHaveClass('decoration-transparent')
    })

    it('uses smooth transitions on breadcrumb links', () => {
      render(<Breadcrumbs items={defaultItems} />)

      const link = screen.getByTestId('breadcrumb-link-dashboard')
      expect(link).toHaveClass('transition-all', 'duration-fast')
    })

    it('F-292: non-first breadcrumb links have title attribute equal to their label for truncation tooltip', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Properties', href: '/properties' },
        {
          label: 'A Very Long Property Name That May Get Truncated By CSS',
          href: '/properties/123',
        },
        { label: 'Reconciliation' },
      ]
      render(<Breadcrumbs items={items} showHomeIcon={false} />)

      // The non-first link (property name) must have title for hover reveal
      const propertyLink = screen.getByTestId(
        'breadcrumb-link-a-very-long-property-name-that-may-get-truncated-by-css'
      )
      expect(propertyLink).toHaveAttribute(
        'title',
        'A Very Long Property Name That May Get Truncated By CSS'
      )
    })

    it('F-292: first breadcrumb link (home) does not get a title attribute', () => {
      render(<Breadcrumbs items={defaultItems} />)

      // The first item (Dashboard/home) is the nav root — no title needed there
      const homeLink = screen.getByTestId('breadcrumb-link-dashboard')
      expect(homeLink).not.toHaveAttribute('title')
    })
  })
})
