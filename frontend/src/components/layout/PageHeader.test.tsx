import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { PageHeader, type BreadcrumbItem } from './PageHeader'
import { Button } from '@/components/ui/button'
import { Plus, Download } from 'lucide-react'

// Helper to render with Router context (required for BackButton)
function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe('PageHeader', () => {
  const defaultBreadcrumbs: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/' },
    { label: 'Properties' },
  ]

  describe('Title Rendering', () => {
    it('should render title as h1', () => {
      render(<PageHeader title="Properties" />)

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toHaveTextContent('Properties')
    })

    it('should render title with correct test id', () => {
      render(<PageHeader title="Properties" />)

      expect(screen.getByTestId('page-header-title')).toBeInTheDocument()
    })

    it('should apply proper typography classes to title', () => {
      render(<PageHeader title="Properties" />)

      const title = screen.getByTestId('page-header-title')
      // Check for core typography classes (fluid font sizes use clamp() and may not show as classes)
      expect(title.className).toContain('font-semibold')
      expect(title.className).toContain('tracking-tight')
      expect(title.className).toContain('break-words')
      // Hyphenate long single words on a hard squeeze instead of an abrupt
      // mid-word cut (F-220).
      expect(title.className).toContain('hyphens-auto')
    })
  })

  describe('Description Rendering', () => {
    it('should render description when provided', () => {
      render(
        <PageHeader
          title="Properties"
          description="Manage your commercial properties"
        />
      )

      expect(
        screen.getByText('Manage your commercial properties')
      ).toBeInTheDocument()
    })

    it('should render description with correct test id', () => {
      render(
        <PageHeader
          title="Properties"
          description="Manage your commercial properties"
        />
      )

      expect(screen.getByTestId('page-header-description')).toBeInTheDocument()
    })

    it('should not render description element when not provided', () => {
      render(<PageHeader title="Properties" />)

      expect(
        screen.queryByTestId('page-header-description')
      ).not.toBeInTheDocument()
    })

    it('should apply muted foreground color to description', () => {
      render(
        <PageHeader title="Properties" description="Manage your properties" />
      )

      const description = screen.getByTestId('page-header-description')
      expect(description).toHaveClass('text-muted-foreground')
    })
  })

  describe('Breadcrumbs Rendering', () => {
    it('should render breadcrumbs when provided', () => {
      render(<PageHeader title="Properties" breadcrumbs={defaultBreadcrumbs} />)

      expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument()
    })

    it('should not render breadcrumbs when not provided', () => {
      render(<PageHeader title="Properties" />)

      expect(screen.queryByTestId('breadcrumbs')).not.toBeInTheDocument()
    })

    it('should not render breadcrumbs when array is empty', () => {
      render(<PageHeader title="Properties" breadcrumbs={[]} />)

      expect(screen.queryByTestId('breadcrumbs')).not.toBeInTheDocument()
    })

    it('should call onBreadcrumbNavigate when breadcrumb is clicked', async () => {
      const user = userEvent.setup()
      const onNavigate = vi.fn()

      render(
        <PageHeader
          title="Properties"
          breadcrumbs={defaultBreadcrumbs}
          onBreadcrumbNavigate={onNavigate}
        />
      )

      const dashboardLink = screen.getByTestId('breadcrumb-link-dashboard')
      await user.click(dashboardLink)

      expect(onNavigate).toHaveBeenCalledWith('/')
    })
  })

  describe('Actions Rendering', () => {
    it('should render single action button', () => {
      render(
        <PageHeader
          title="Properties"
          actions={<Button>Add Property</Button>}
        />
      )

      expect(
        screen.getByRole('button', { name: 'Add Property' })
      ).toBeInTheDocument()
    })

    it('should render multiple action buttons', () => {
      render(
        <PageHeader
          title="Properties"
          actions={
            <>
              <Button variant="outline">Export</Button>
              <Button>Add Property</Button>
            </>
          }
        />
      )

      expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add Property' })
      ).toBeInTheDocument()
    })

    it('should render actions with correct test id', () => {
      render(
        <PageHeader
          title="Properties"
          actions={<Button>Add Property</Button>}
        />
      )

      expect(screen.getByTestId('page-header-actions')).toBeInTheDocument()
    })

    it('should not render actions container when no actions provided', () => {
      render(<PageHeader title="Properties" />)

      expect(
        screen.queryByTestId('page-header-actions')
      ).not.toBeInTheDocument()
    })

    it('should render action buttons with icons', () => {
      render(
        <PageHeader
          title="Properties"
          actions={
            <Button>
              <Plus className="mr-2 h-4 w-4" data-testid="plus-icon" />
              Add Property
            </Button>
          }
        />
      )

      expect(screen.getByTestId('plus-icon')).toBeInTheDocument()
    })
  })

  describe('Responsive Layout', () => {
    it('should have flex column layout by default (mobile)', () => {
      render(<PageHeader title="Properties" actions={<Button>Add</Button>} />)

      const container = screen.getByTestId('page-header')
      const flexContainer = container.querySelector('.flex.flex-col')
      expect(flexContainer).toBeInTheDocument()
    })

    it('should have sm:flex-row class for desktop layout', () => {
      render(<PageHeader title="Properties" actions={<Button>Add</Button>} />)

      const container = screen.getByTestId('page-header')
      const flexContainer = container.querySelector('.sm\\:flex-row')
      expect(flexContainer).toBeInTheDocument()
    })

    it('should have sm:items-start class for vertical alignment', () => {
      render(<PageHeader title="Properties" actions={<Button>Add</Button>} />)

      const container = screen.getByTestId('page-header')
      const flexContainer = container.querySelector('.sm\\:items-start')
      expect(flexContainer).toBeInTheDocument()
    })

    it('should have sm:justify-between class for spacing', () => {
      render(<PageHeader title="Properties" actions={<Button>Add</Button>} />)

      const container = screen.getByTestId('page-header')
      const flexContainer = container.querySelector('.sm\\:justify-between')
      expect(flexContainer).toBeInTheDocument()
    })
  })

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      render(<PageHeader title="Properties" className="custom-class" />)

      const header = screen.getByTestId('page-header')
      expect(header).toHaveClass('custom-class')
    })

    it('should maintain default margin bottom', () => {
      render(<PageHeader title="Properties" />)

      const header = screen.getByTestId('page-header')
      expect(header).toHaveClass('mb-8')
    })
  })

  describe('Full Integration', () => {
    it('should render complete page header with all props', () => {
      render(
        <PageHeader
          title="Properties"
          description="Manage your commercial properties and track their performance."
          breadcrumbs={[
            { label: 'Dashboard', href: '/' },
            { label: 'Properties' },
          ]}
          actions={
            <>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Property
              </Button>
            </>
          }
        />
      )

      // Breadcrumbs
      expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument()

      // Title
      expect(
        screen.getByRole('heading', { name: 'Properties' })
      ).toBeInTheDocument()

      // Description
      expect(
        screen.getByText(/Manage your commercial properties/)
      ).toBeInTheDocument()

      // Actions
      expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Add Property/ })
      ).toBeInTheDocument()
    })
  })

  describe('Semantic HTML', () => {
    it('should use h1 for title (semantic hierarchy)', () => {
      render(<PageHeader title="Properties" />)

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toBeInTheDocument()
    })

    it('should use p for description', () => {
      render(<PageHeader title="Properties" description="Description text" />)

      const description = screen.getByTestId('page-header-description')
      expect(description.tagName).toBe('P')
    })

    it('should contain navigation for breadcrumbs', () => {
      render(<PageHeader title="Properties" breadcrumbs={defaultBreadcrumbs} />)

      expect(
        screen.getByRole('navigation', { name: 'Breadcrumb' })
      ).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long title', () => {
      const longTitle =
        'This is a very long page title that might wrap on smaller screens'

      render(<PageHeader title={longTitle} />)

      expect(screen.getByText(longTitle)).toBeInTheDocument()
    })

    it('should handle very long description', () => {
      const longDescription =
        'This is a very long description that provides detailed information about this page and its purpose. It might span multiple lines on smaller devices.'

      render(<PageHeader title="Properties" description={longDescription} />)

      expect(screen.getByText(longDescription)).toBeInTheDocument()
    })

    it('should handle special characters in title', () => {
      render(<PageHeader title="Properties & Leases" />)

      expect(screen.getByText('Properties & Leases')).toBeInTheDocument()
    })

    it('should handle HTML entities in description', () => {
      render(
        <PageHeader
          title="Properties"
          description="Compare 2023 vs 2024 data"
        />
      )

      expect(screen.getByText('Compare 2023 vs 2024 data')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should be keyboard navigable to actions', async () => {
      const user = userEvent.setup()

      render(
        <PageHeader
          title="Properties"
          actions={<Button>Add Property</Button>}
        />
      )

      const button = screen.getByRole('button')

      await user.tab()
      expect(button).toHaveFocus()
    })

    it('should allow tabbing through breadcrumbs then to actions', async () => {
      const user = userEvent.setup()

      render(
        <PageHeader
          title="Properties"
          breadcrumbs={[
            { label: 'Dashboard', href: '/' },
            { label: 'Properties' },
          ]}
          actions={<Button>Add</Button>}
        />
      )

      const dashboardLink = screen.getByTestId('breadcrumb-link-dashboard')
      const addButton = screen.getByRole('button', { name: 'Add' })

      await user.tab()
      expect(dashboardLink).toHaveFocus()

      await user.tab()
      expect(addButton).toHaveFocus()
    })
  })

  describe('Back Button Support', () => {
    it('should not show back button by default', () => {
      render(<PageHeader title="Test Page" />)
      expect(
        screen.queryByRole('button', { name: /navigate back/i })
      ).not.toBeInTheDocument()
    })

    it('should show back button when showBackButton is true', () => {
      renderWithRouter(<PageHeader title="Test Page" showBackButton={true} />)
      expect(
        screen.getByRole('button', { name: /navigate back/i })
      ).toBeInTheDocument()
    })

    it('should render back button with default label', () => {
      renderWithRouter(<PageHeader title="Test Page" showBackButton={true} />)
      expect(screen.getByText('Back')).toBeInTheDocument()
    })

    it('should render back button with custom label', () => {
      renderWithRouter(
        <PageHeader
          title="Test Page"
          showBackButton={true}
          backButtonLabel="Back to Properties"
        />
      )
      expect(screen.getByText('Back to Properties')).toBeInTheDocument()
    })

    it('should render breadcrumbs and back button together', () => {
      renderWithRouter(
        <PageHeader
          title="Test Page"
          showBackButton={true}
          breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Test' }]}
        />
      )

      expect(
        screen.getByRole('button', { name: /navigate back/i })
      ).toBeInTheDocument()
      expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument()
    })

    it('should apply mobile-hidden class to breadcrumbs when back button shown', () => {
      renderWithRouter(
        <PageHeader
          title="Test Page"
          showBackButton={true}
          breadcrumbs={[{ label: 'Home', href: '/' }]}
        />
      )

      const breadcrumbs = screen.getByTestId('breadcrumbs')
      const breadcrumbsWrapper = breadcrumbs.parentElement
      expect(breadcrumbsWrapper).toHaveClass('hidden')
      expect(breadcrumbsWrapper).toHaveClass('md:block')
    })

    it('hides the back button on desktop only when breadcrumbs replace it', () => {
      renderWithRouter(
        <PageHeader
          title="Test Page"
          showBackButton={true}
          breadcrumbs={[{ label: 'Home', href: '/' }]}
        />
      )

      const backButton = screen.getByRole('button', { name: /navigate back/i })
      const wrapper = backButton.parentElement
      expect(wrapper).toHaveClass('md:hidden')
    })

    it('keeps the back button visible on desktop when no breadcrumbs are provided', () => {
      // Without breadcrumbs there is nothing to replace the back button on
      // desktop, so it must stay visible at every width — otherwise the page
      // has no in-header back navigation (regression: dispute + tenant pages).
      renderWithRouter(<PageHeader title="Test Page" showBackButton={true} />)

      const backButton = screen.getByRole('button', { name: /navigate back/i })
      const wrapper = backButton.parentElement
      expect(wrapper).not.toHaveClass('md:hidden')
    })

    it('should render back button before breadcrumbs in DOM order', () => {
      const { container } = renderWithRouter(
        <PageHeader
          title="Test Page"
          showBackButton={true}
          breadcrumbs={[{ label: 'Home', href: '/' }]}
        />
      )

      const backButton = screen.getByRole('button', { name: /navigate back/i })
      const breadcrumbs = screen.getByTestId('breadcrumbs')

      // Back button should come before breadcrumbs in DOM
      const parentElement = container.querySelector(
        '[data-testid="page-header"]'
      )
      const children = Array.from(parentElement?.children || [])
      const backButtonIndex = children.findIndex((el) =>
        el.contains(backButton)
      )
      const breadcrumbsIndex = children.findIndex((el) =>
        el.contains(breadcrumbs)
      )

      expect(backButtonIndex).toBeLessThan(breadcrumbsIndex)
    })
  })

  describe('F-260: title column must not be crushed by wide toolbars', () => {
    it('title column carries sm:min-w-[16rem] to prevent crushing', () => {
      render(<PageHeader title="Properties" actions={<Button>Add</Button>} />)

      const titleCol = screen.getByTestId('page-header-title').parentElement
      expect(titleCol).not.toBeNull()
      // The class must be present on the title wrapper div
      expect(titleCol!.className).toContain('sm:min-w-[16rem]')
    })

    it('title-actions row carries sm:flex-wrap so wide toolbars wrap instead of crushing the title', () => {
      render(<PageHeader title="Properties" actions={<Button>Add</Button>} />)

      const container = screen.getByTestId('page-header')
      const row = container.querySelector('.sm\\:flex-wrap')
      expect(row).not.toBeNull()
    })
  })
})
