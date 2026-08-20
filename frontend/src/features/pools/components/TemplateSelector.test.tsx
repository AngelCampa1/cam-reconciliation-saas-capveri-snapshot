/**
 * Tests for TemplateSelector component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TemplateSelector } from './TemplateSelector'
import type { PoolTemplateList } from '@/types'

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

// Mock the generated API functions
vi.mock('@/api/generated', async () => {
  const actual = await vi.importActual('@/api/generated')
  return {
    ...actual,
    listTemplatesApiV1PoolTemplatesGet: vi.fn(),
  }
})

import { listTemplatesApiV1PoolTemplatesGet } from '@/api/generated'

describe('TemplateSelector', () => {
  it('displays system and custom templates', async () => {
    const mockTemplates: PoolTemplateList[] = [
      {
        id: '1',
        name: 'Retail Center',
        description: 'System template',
        property_type: 'retail',
        is_system: true,
        pool_count: 3,
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        name: 'My Template',
        description: 'Custom template',
        property_type: 'office',
        is_system: false,
        pool_count: 2,
        created_at: '2024-01-02T00:00:00Z',
      },
    ]

    // Configure mock before rendering
    const mockFn = vi.mocked(listTemplatesApiV1PoolTemplatesGet)
    mockFn.mockResolvedValue({
      data: mockTemplates,
      error: undefined,
      request: new Request('http://localhost/api/v1/pool-templates'),
      response: new Response(),
    })

    const onSelect = vi.fn()

    render(<TemplateSelector onSelect={onSelect} />, {
      wrapper: createWrapper(),
    })

    // Wait for templates to load
    await waitFor(
      () => {
        expect(screen.getByText('Retail Center')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(screen.getByText('My Template')).toBeInTheDocument()
    expect(screen.getByText('System Templates')).toBeInTheDocument()
    expect(screen.getByText('Custom Templates')).toBeInTheDocument()
  })

  it('calls onSelect when template is clicked', async () => {
    const mockTemplates: PoolTemplateList[] = [
      {
        id: '1',
        name: 'Test Template',
        description: null,
        property_type: null,
        is_system: true,
        pool_count: 1,
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    // Configure mock before rendering
    const mockFn = vi.mocked(listTemplatesApiV1PoolTemplatesGet)
    mockFn.mockResolvedValue({
      data: mockTemplates,
      error: undefined,
      request: new Request('http://localhost/api/v1/pool-templates'),
      response: new Response(),
    })

    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(<TemplateSelector onSelect={onSelect} />, {
      wrapper: createWrapper(),
    })

    await waitFor(
      () => {
        expect(screen.getByText('Test Template')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    await user.click(screen.getByText('Test Template'))

    expect(onSelect).toHaveBeenCalledWith(mockTemplates[0])
  })

  it('shows loading state', () => {
    vi.mocked(listTemplatesApiV1PoolTemplatesGet).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(<TemplateSelector onSelect={vi.fn()} />, {
      wrapper: createWrapper(),
    })

    // Should show skeleton loaders (check by testid)
    expect(screen.getAllByTestId('skeleton')).toHaveLength(3)
  })

  it('activates onSelect when Enter is pressed on a template card', async () => {
    const mockTemplates: PoolTemplateList[] = [
      {
        id: '1',
        name: 'Keyboard Template',
        description: null,
        property_type: null,
        is_system: true,
        pool_count: 1,
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    vi.mocked(listTemplatesApiV1PoolTemplatesGet).mockResolvedValue({
      data: mockTemplates,
      error: undefined,
      request: new Request('http://localhost/api/v1/pool-templates'),
      response: new Response(),
    })

    const onSelect = vi.fn()

    render(<TemplateSelector onSelect={onSelect} />, {
      wrapper: createWrapper(),
    })

    await waitFor(
      () => {
        expect(screen.getByText('Keyboard Template')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    const card = screen.getByRole('button', { name: /Keyboard Template/i })
    fireEvent.keyDown(card, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(mockTemplates[0])
  })

  it('shows error state', async () => {
    vi.mocked(listTemplatesApiV1PoolTemplatesGet).mockRejectedValue(
      new Error('Network error')
    )

    render(<TemplateSelector onSelect={vi.fn()} />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't load pool templates/)
      ).toBeInTheDocument()
    })
  })
})
