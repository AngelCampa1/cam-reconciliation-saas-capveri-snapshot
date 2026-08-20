/**
 * Component Integration Test Template
 *
 * Copy this file when creating tests for new components that call APIs.
 *
 * This template demonstrates:
 * - MSW handler setup
 * - Loading state testing
 * - Success state testing
 * - Error state testing
 * - User interaction testing
 * - Contract validation
 *
 * Usage:
 * 1. Copy this file to your component's test directory
 * 2. Rename from _template.test.tsx to YourComponent.test.tsx
 * 3. Replace YourComponent with your actual component
 * 4. Update API endpoints and test data
 * 5. Customize tests for your component's specific behavior
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { validators } from '@/test/contract'

// Import component to test
// import { YourComponent } from '../YourComponent'

// Test wrapper with providers
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('YourComponent', () => {
  // Reset handlers after each test to prevent test pollution
  afterEach(() => {
    server.resetHandlers()
  })

  describe('Loading State', () => {
    it('shows loading indicator while fetching data', async () => {
      // Delay API response to test loading state
      server.use(
        http.get('/api/v1/resource', async () => {
          await new Promise((r) => setTimeout(r, 100))
          return HttpResponse.json({ data: [] })
        })
      )

      // renderWithProviders(<YourComponent />)

      // Check for loading indicator
      // expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()

      // Wait for loading to complete
      // await waitFor(() => {
      //   expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument()
      // })
    })
  })

  describe('Success State', () => {
    it('renders data when API returns successfully', async () => {
      // renderWithProviders(<YourComponent />)
      // Wait for data to load
      // await waitFor(() => {
      //   expect(screen.getByTestId('data-container')).toBeInTheDocument()
      // })
      // Verify expected content
      // expect(screen.getByText('Expected Text')).toBeInTheDocument()
    })

    it('validates response matches contract', async () => {
      const capturedData: unknown[] = []

      server.use(
        http.get('/api/v1/resource', () => {
          const data = { id: '123', name: 'Test' }
          capturedData.push(data)
          return HttpResponse.json(data)
        })
      )

      // renderWithProviders(<YourComponent />)

      // await waitFor(() => {
      //   expect(capturedData.length).toBeGreaterThan(0)
      // })

      // Validate captured response matches schema
      // expect(() => validators.yourSchema.validate(capturedData[0])).not.toThrow()
    })
  })

  describe('Error State', () => {
    it('shows error message when API fails', async () => {
      server.use(
        http.get('/api/v1/resource', () => {
          return HttpResponse.json({ message: 'Server error' }, { status: 500 })
        })
      )

      // renderWithProviders(<YourComponent />)

      // await waitFor(() => {
      //   expect(screen.getByRole('alert')).toBeInTheDocument()
      // })

      // expect(screen.getByText(/error/i)).toBeInTheDocument()
    })

    it('allows retry after error', async () => {
      let callCount = 0

      server.use(
        http.get('/api/v1/resource', () => {
          callCount++
          if (callCount === 1) {
            return HttpResponse.json({ message: 'Error' }, { status: 500 })
          }
          return HttpResponse.json({ data: [] })
        })
      )

      // renderWithProviders(<YourComponent />)

      // Wait for error
      // await waitFor(() => {
      //   expect(screen.getByRole('alert')).toBeInTheDocument()
      // })

      // Click retry
      // await userEvent.click(screen.getByText('Retry'))

      // Should succeed on retry
      // await waitFor(() => {
      //   expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      // })
    })
  })

  describe('User Interactions', () => {
    it('creates new item when form submitted', async () => {
      const user = userEvent.setup()
      let createdData: unknown = null

      server.use(
        http.post('/api/v1/resource', async ({ request }) => {
          createdData = await request.json()
          return HttpResponse.json(
            { id: 'new-123', ...createdData },
            { status: 201 }
          )
        })
      )

      // renderWithProviders(<YourComponent />)

      // Fill form
      // await user.type(screen.getByLabelText('Name'), 'Test Name')
      // await user.click(screen.getByText('Submit'))

      // Verify API was called with correct data
      // await waitFor(() => {
      //   expect(createdData).toEqual({ name: 'Test Name' })
      // })

      // Verify success feedback
      // expect(screen.getByText('Created successfully')).toBeInTheDocument()
    })

    it('shows validation errors for invalid input', async () => {
      const user = userEvent.setup()

      // renderWithProviders(<YourComponent />)

      // Submit empty form
      // await user.click(screen.getByText('Submit'))

      // Should show validation error
      // expect(screen.getByText('Name is required')).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('shows empty state when no data', async () => {
      server.use(
        http.get('/api/v1/resource', () => {
          return HttpResponse.json({ data: [], count: 0 })
        })
      )

      // renderWithProviders(<YourComponent />)

      // await waitFor(() => {
      //   expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      // })

      // expect(screen.getByText('No items yet')).toBeInTheDocument()
      // expect(screen.getByText('Add your first item')).toBeInTheDocument()
    })
  })
})
