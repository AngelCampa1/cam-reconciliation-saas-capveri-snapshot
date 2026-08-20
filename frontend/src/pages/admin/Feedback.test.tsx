import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { onlineManager } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FeedbackPage } from './Feedback'

// Mock viewport — defaults to desktop; flip mockIsMobile for mobile tests.
let mockIsMobile = false
vi.mock('@/hooks/useViewport', () => ({
  useViewport: () => ({
    width: mockIsMobile ? 375 : 1280,
    height: 800,
    isMobile: mockIsMobile,
    isTablet: false,
    isLaptop: false,
    isDesktop: !mockIsMobile,
    size: mockIsMobile ? 'mobile' : 'desktop',
    isTouch: mockIsMobile,
  }),
}))

const mockFeedback = [
  {
    id: '1',
    user_id: 'user-1',
    organization_id: 'org-1',
    type: 'bug',
    status: 'new',
    message: 'The button does not work when clicked',
    page_url: '/dashboard',
    screenshot_url: null,
    metadata: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    user_id: 'user-2',
    organization_id: 'org-1',
    type: 'feature_request',
    status: 'reviewed',
    message: 'Add Light-Only Mode support',
    page_url: '/settings',
    screenshot_url: 'https://example.com/screenshot.jpg',
    metadata: { viewport: '1920x1080' },
    created_at: '2024-01-14T15:30:00Z',
    updated_at: '2024-01-14T15:30:00Z',
  },
]

const mockStats = {
  total: 5,
  by_type: { bug: 2, feature_request: 2, general: 1 },
  by_status: { new: 3, reviewed: 1, resolved: 1, dismissed: 0 },
}

describe('FeedbackPage', () => {
  let queryClient: QueryClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    mockIsMobile = false
    fetchMock = vi.fn((url: string) => {
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockStats,
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockFeedback,
      })
    })
    global.fetch = fetchMock
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('renders feedback list', async () => {
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(
        screen.getByText('The button does not work when clicked')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Add Light-Only Mode support')
      ).toBeInTheDocument()
    })
  })

  it('shows summary stats', async () => {
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument() // Total
      expect(screen.getByText('3')).toBeInTheDocument() // New
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(2) // Bugs and Features
    })
  })

  // F-380 a11y: the page H1 is "Feedback"; the four summary stat cards must be
  // H2 (not the shadcn default H3) so the heading ladder has no H1->H3 skip.
  it('summary stat cards are H2 with no skipped heading level', async () => {
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Feedback')

    const h2s = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(h2s).toEqual(['Total', 'New', 'Bugs', 'Features'])

    // No H3 anywhere -> no H1->H3 skip.
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    render(<FeedbackPage />, { wrapper })

    expect(screen.getByText(/loading feedback/i)).toBeInTheDocument()
  })

  it('shows empty state when no feedback', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ total: 0, by_type: {}, by_status: {} }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      })
    })

    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('No feedback yet')).toBeInTheDocument()
    })
  })

  // F-071 regression guard: a non-2xx feedback list response must NOT be
  // rendered as table rows. Before the fix, the error body (e.g. { detail })
  // was passed straight to feedback.map / typeIcons[item.type] and crashed.
  it('shows an error state with a working retry when the feedback list request fails', async () => {
    const user = userEvent.setup()
    let failList = true
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockStats,
        })
      }
      if (failList) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({ detail: 'Forbidden' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockFeedback,
      })
    })

    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText("Couldn't load feedback")).toBeInTheDocument()
    })

    // The error body must never be rendered as a feedback row.
    expect(screen.queryByText('Forbidden')).not.toBeInTheDocument()

    // Retry button refetches and recovers the list instead of dead-ending.
    failList = false
    await user.click(screen.getAllByRole('button', { name: 'Try again' })[0])

    await waitFor(() => {
      expect(
        screen.queryByText("Couldn't load feedback")
      ).not.toBeInTheDocument()
    })
  })

  it('opens detail dialog when clicking view', async () => {
    const user = userEvent.setup()
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getAllByText('View')[0]).toBeInTheDocument()
    })

    await user.click(screen.getAllByText('View')[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Verify dialog content by checking for the status select in the dialog
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
  })

  it('closes detail dialog', async () => {
    const user = userEvent.setup()
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getAllByText('View')[0]).toBeInTheDocument()
    })

    await user.click(screen.getAllByText('View')[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Close dialog by clicking outside or via X button
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
  })

  it('displays screenshot indicator for feedback with screenshots', async () => {
    render(<FeedbackPage />, { wrapper })

    // Wait for feedback data to load
    await waitFor(() => {
      expect(screen.getByText(/Add Light-Only Mode/)).toBeInTheDocument()
    })

    // Verify both feedback items are in the table (at least 2 rows: header + data)
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)
  })

  it('filters by type', async () => {
    const user = userEvent.setup()

    // Set up mock to track calls
    let filterCallMade = false
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/feedback?') && url.includes('type=bug')) {
        filterCallMade = true
      }
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockStats,
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockFeedback,
      })
    })

    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('All types')).toBeInTheDocument()
    })

    const typeSelect = screen.getAllByRole('combobox')[0]
    await user.click(typeSelect)

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Bug' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: 'Bug' }))

    // Wait for the filter to be applied
    await waitFor(
      () => {
        expect(filterCallMade).toBe(true)
      },
      { timeout: 3000 }
    )
  })

  it('filters by status', async () => {
    const user = userEvent.setup()

    // Set up mock to track calls
    let filterCallMade = false
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/feedback?') && url.includes('status=new')) {
        filterCallMade = true
      }
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockStats,
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockFeedback,
      })
    })

    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('All statuses')).toBeInTheDocument()
    })

    const statusSelect = screen.getAllByRole('combobox')[1]
    await user.click(statusSelect)

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'New' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: 'New' }))

    // Wait for the filter to be applied
    await waitFor(
      () => {
        expect(filterCallMade).toBe(true)
      },
      { timeout: 3000 }
    )
  })

  it('handles pagination', async () => {
    const user = userEvent.setup()

    // Set up mock to track calls
    let paginationCallMade = false
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/feedback?') && url.includes('page=2')) {
        paginationCallMade = true
      }
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockStats,
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockFeedback,
      })
    })

    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeDisabled()
    })

    await user.click(screen.getByText('Next'))

    // Wait for the pagination to be applied
    await waitFor(
      () => {
        expect(paginationCallMade).toBe(true)
      },
      { timeout: 3000 }
    )
  })

  it('updates status from detail dialog', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockStats,
        })
      }
      if (options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockFeedback[0], status: 'reviewed' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockFeedback,
      })
    })

    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getAllByText('View')[0]).toBeInTheDocument()
    })

    await user.click(screen.getAllByText('View')[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Find and click the status select within the dialog
    const comboboxes = screen.getAllByRole('combobox')
    // The dialog status select should be one of the last comboboxes
    const dialogStatusSelect = comboboxes[comboboxes.length - 1]

    await user.click(dialogStatusSelect)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Reviewed' })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: 'Reviewed' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/feedback/1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'reviewed' }),
        })
      )
    })
  })

  it('displays screenshot in detail dialog', async () => {
    const user = userEvent.setup()
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getAllByText('View')[1]).toBeInTheDocument()
    })

    // Click view on second item which has screenshot
    await user.click(screen.getAllByText('View')[1])

    await waitFor(() => {
      const img = screen.getByAltText('Feedback screenshot')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', 'https://example.com/screenshot.jpg')
    })
  })

  it('displays metadata in detail dialog', async () => {
    const user = userEvent.setup()
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getAllByText('View')[1]).toBeInTheDocument()
    })

    // Click view on second item which has metadata
    await user.click(screen.getAllByText('View')[1])

    await waitFor(() => {
      expect(screen.getByText('Context')).toBeInTheDocument()
      expect(screen.getByText(/"viewport"/)).toBeInTheDocument()
    })
  })

  describe('Offline / Paused state', () => {
    // The shared wrapper's QueryClient uses the default 'online' networkMode,
    // so flagging onlineManager offline pauses the list query (isPaused, not
    // isError). The list fetch hangs forever to hold that paused state.
    const goOfflineWithHangingList = () => {
      global.fetch = vi.fn((url: string) =>
        (url as string).includes('/stats')
          ? Promise.resolve({
              ok: true,
              json: async () => ({ total: 0, by_type: {}, by_status: {} }),
            })
          : new Promise(() => {})
      ) as typeof fetch
      onlineManager.setOnline(false)
    }

    const expectOfflineNotInEmptyState = async () => {
      await waitFor(() => {
        expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
      })
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(screen.queryByText(/no feedback yet/i)).not.toBeInTheDocument()
    }

    afterEach(() => {
      onlineManager.setOnline(true)
    })

    it('shows an offline notice instead of the empty state (desktop)', async () => {
      goOfflineWithHangingList()
      render(<FeedbackPage />, { wrapper })
      await expectOfflineNotInEmptyState()
    })

    it('shows an offline notice instead of the empty state (mobile)', async () => {
      mockIsMobile = true
      goOfflineWithHangingList()
      render(<FeedbackPage />, { wrapper })
      await expectOfflineNotInEmptyState()
    })
  })

  describe('mobile layout', () => {
    beforeEach(() => {
      mockIsMobile = true
    })

    it('renders mobile-cards-view with feedback type and message', async () => {
      render(<FeedbackPage />, { wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('mobile-cards-view')).toBeInTheDocument()
        expect(
          screen.getByText('The button does not work when clicked')
        ).toBeInTheDocument()
      })
    })

    it('renders View button full-width on mobile', async () => {
      render(<FeedbackPage />, { wrapper })

      await waitFor(() => {
        const viewBtns = screen.getAllByRole('button', { name: /^view$/i })
        expect(viewBtns.length).toBeGreaterThan(0)
        expect(viewBtns[0].className).toMatch(/w-full/)
        expect(viewBtns[0].className).toMatch(/min-h-\[44px\]/)
      })
    })

    it('shows page URL and date labels in mobile cards', async () => {
      render(<FeedbackPage />, { wrapper })

      await waitFor(() => {
        expect(screen.getAllByText(/Page:/i).length).toBeGreaterThan(0)
        expect(screen.getAllByText(/Date:/i).length).toBeGreaterThan(0)
      })
    })
  })
})
