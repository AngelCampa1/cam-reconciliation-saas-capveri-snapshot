/**
 * Tests for useReconciliationValidation hook.
 *
 * Validates pre-flight check logic for reconciliation calculations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useReconciliationValidation } from './useReconciliationValidation'

// Mock API hooks
const mockUseExpensePools = vi.fn()
const mockUsePoolMappings = vi.fn()

vi.mock('@/api/hooks', () => ({
  useExpensePools: (propertyId: string) => mockUseExpensePools(propertyId),
  usePoolMappings: (propertyId: string) => mockUsePoolMappings(propertyId),
}))

// Test wrapper with QueryClientProvider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// Mock expense pool data
const mockPools = [
  { id: 'pool-1', name: 'CAM', property_id: 'prop-1' },
  { id: 'pool-2', name: 'Insurance', property_id: 'prop-1' },
  { id: 'pool-3', name: 'Taxes', property_id: 'prop-1' },
]

describe('useReconciliationValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns canCalculate: true when all pools have mappings', async () => {
    mockUseExpensePools.mockReturnValue({
      data: { data: mockPools },
      isLoading: false,
    })
    mockUsePoolMappings.mockReturnValue({
      data: {
        data: [
          { id: 'm1', expense_pool_id: 'pool-1', gl_pattern: '5100' },
          { id: 'm2', expense_pool_id: 'pool-2', gl_pattern: '5200' },
          { id: 'm3', expense_pool_id: 'pool-3', gl_pattern: '5300' },
        ],
      },
      isLoading: false,
    })

    const { result } = renderHook(() => useReconciliationValidation('prop-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canCalculate).toBe(true)
    expect(result.current.unmappedPools).toHaveLength(0)
    expect(result.current.warnings).toHaveLength(0)
  })

  it('returns canCalculate: false when any pool has 0 mappings', async () => {
    mockUseExpensePools.mockReturnValue({
      data: { data: mockPools },
      isLoading: false,
    })
    mockUsePoolMappings.mockReturnValue({
      data: {
        data: [
          { id: 'm1', expense_pool_id: 'pool-1', gl_pattern: '5100' },
          // pool-2 and pool-3 have no mappings
        ],
      },
      isLoading: false,
    })

    const { result } = renderHook(() => useReconciliationValidation('prop-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canCalculate).toBe(false)
    expect(result.current.unmappedPools).toHaveLength(2)
  })

  it('returns list of unmapped pool names', async () => {
    mockUseExpensePools.mockReturnValue({
      data: { data: mockPools },
      isLoading: false,
    })
    mockUsePoolMappings.mockReturnValue({
      data: {
        data: [{ id: 'm1', expense_pool_id: 'pool-1', gl_pattern: '5100' }],
      },
      isLoading: false,
    })

    const { result } = renderHook(() => useReconciliationValidation('prop-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.unmappedPools).toEqual([
      { id: 'pool-2', name: 'Insurance' },
      { id: 'pool-3', name: 'Taxes' },
    ])
  })

  it('returns empty warnings when no pools exist', async () => {
    mockUseExpensePools.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    })
    mockUsePoolMappings.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    })

    const { result } = renderHook(() => useReconciliationValidation('prop-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canCalculate).toBe(true)
    expect(result.current.unmappedPools).toHaveLength(0)
    expect(result.current.warnings).toHaveLength(0)
  })

  it('returns loading state while data is being fetched', () => {
    mockUseExpensePools.mockReturnValue({
      data: undefined,
      isLoading: true,
    })
    mockUsePoolMappings.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    const { result } = renderHook(() => useReconciliationValidation('prop-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.canCalculate).toBe(true) // Default to true while loading
  })

  it('includes warning message with pool count', async () => {
    mockUseExpensePools.mockReturnValue({
      data: { data: mockPools },
      isLoading: false,
    })
    mockUsePoolMappings.mockReturnValue({
      data: { data: [] }, // No mappings at all
      isLoading: false,
    })

    const { result } = renderHook(() => useReconciliationValidation('prop-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.warnings).toContain(
      '3 expense pools have no GL account mappings'
    )
  })
})
