/**
 * Tests for useCellMutation hook.
 *
 * Validates optimistic updates, rollback, error handling, and retry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import { queryKeys } from '@/api/hooks'
import type { PaginatedResponse_ReconciliationSnapshotSummary_ } from '@/api/generated/types.gen'
import { useCellMutation } from './useCellMutation'
import type { ReconciliationRow } from '../types/reconciliation-row'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

// Mock generated SDK
vi.mock('@/api/generated/sdk.gen', () => ({
  updateReconciliationCellApiV1ReconciliationCellsCellIdPatch: vi.fn(),
}))

// Get the mocked function
import { updateReconciliationCellApiV1ReconciliationCellsCellIdPatch } from '@/api/generated/sdk.gen'
const mockUpdateCell = vi.mocked(
  updateReconciliationCellApiV1ReconciliationCellsCellIdPatch
)

// Helper to create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useCellMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies optimistic update immediately', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    // Set initial data at correct cache key
    const testQueryKey = queryKeys.reconciliation.snapshotsList({
      property_id: 'test-property',
    })
    const initialData: ReconciliationRow[] = [
      {
        type: 'expense_pool',
        id: 'pool-1',
        pool_name: 'Utilities',
        total_expenses: '1000.00',
        recoverable_amount: '950.00',
        variance: '50.00',
      },
    ]
    queryClient.setQueryData(testQueryKey, initialData)

    mockUpdateCell.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useCellMutation(), { wrapper })

    // Mutate
    result.current.mutate({
      snapshotId: 'pool-1',
      field: 'total_expenses',
      value: '1200.00',
    })

    // Should update immediately (optimistic)
    await waitFor(() => {
      const data = queryClient.getQueryData<ReconciliationRow[]>(testQueryKey)
      expect(data?.[0]).toMatchObject({
        total_expenses: '1200.00',
      })
    })
  })

  it('updates production paginated snapshot cache before sending PATCH', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const testQueryKey = [
      ...queryKeys.reconciliation.snapshotsList({
        property_id: 'test-property',
      }),
      'all-pages',
    ] as const
    const initialData: PaginatedResponse_ReconciliationSnapshotSummary_ = {
      items: [
        {
          id: 'snapshot-1',
          property_id: 'property-1',
          lease_id: 'lease-1',
          period_start_date: '2026-01-01',
          period_end_date: '2026-12-31',
          status: 'draft',
          total_recovery: '100.00',
          tenant_share_after_cap: '90.00',
          admin_fee: '10.00',
          is_finalized: false,
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
      has_next: false,
      has_previous: false,
    }
    queryClient.setQueryData(testQueryKey, initialData)

    mockUpdateCell.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useCellMutation(), { wrapper })

    result.current.mutate({
      snapshotId: 'snapshot-1',
      field: 'admin_fee',
      value: '42.00',
    })

    await waitFor(() => {
      const data =
        queryClient.getQueryData<PaginatedResponse_ReconciliationSnapshotSummary_>(
          testQueryKey
        )
      expect(data?.items[0].admin_fee).toBe('42.00')
    })
    await waitFor(() => expect(mockUpdateCell).toHaveBeenCalledTimes(1))
  })

  it('sends cell updates through the configured API client with a URL-safe cell id', async () => {
    const wrapper = createWrapper()
    mockUpdateCell.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useCellMutation(), { wrapper })

    result.current.mutate({
      snapshotId: 'd676519b-2ffc-4b81-979a-cb2b04fdecb4',
      field: 'admin_fee',
      value: '456.78',
    })

    await waitFor(() => expect(mockUpdateCell).toHaveBeenCalledTimes(1))
    expect(mockUpdateCell).toHaveBeenCalledWith(
      expect.objectContaining({
        client: apiClient,
        path: {
          cell_id:
            'ZDY3NjUxOWItMmZmYy00YjgxLTk3OWEtY2IyYjA0ZmRlY2I0OmFkbWluX2ZlZQ',
        },
        body: { value: '456.78' },
      })
    )
  })

  it('leaves snapshot detail cache untouched while sending PATCH', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const listQueryKey = [
      ...queryKeys.reconciliation.snapshotsList({
        property_id: 'test-property',
      }),
      'all-pages',
    ] as const
    const detailQueryKey = queryKeys.reconciliation.snapshotDetail(
      'snapshot-1',
      false
    )
    const detailData = {
      id: 'snapshot-1',
      property_id: 'property-1',
      lease_id: 'lease-1',
      period_start_date: '2026-01-01',
      period_end_date: '2026-12-31',
      status: 'draft',
      total_recovery: '100.00',
    }
    queryClient.setQueryData(listQueryKey, {
      items: [
        {
          ...detailData,
          tenant_share_after_cap: '90.00',
          admin_fee: '10.00',
          is_finalized: false,
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
      has_next: false,
      has_previous: false,
    } satisfies PaginatedResponse_ReconciliationSnapshotSummary_)
    queryClient.setQueryData(detailQueryKey, detailData)

    mockUpdateCell.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useCellMutation(), { wrapper })

    result.current.mutate({
      snapshotId: 'snapshot-1',
      field: 'admin_fee',
      value: '42.00',
    })

    await waitFor(() => expect(mockUpdateCell).toHaveBeenCalledTimes(1))
    expect(queryClient.getQueryData(detailQueryKey)).toEqual(detailData)
  })

  it('rolls back to previous state on error', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const testQueryKey = queryKeys.reconciliation.snapshotsList({
      property_id: 'test-property',
    })
    const initialData: ReconciliationRow[] = [
      {
        type: 'expense_pool',
        id: 'pool-1',
        pool_name: 'Utilities',
        total_expenses: '1000.00',
        recoverable_amount: '950.00',
        variance: '50.00',
      },
    ]
    queryClient.setQueryData(testQueryKey, initialData)

    mockUpdateCell.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useCellMutation(), { wrapper })

    result.current.mutate({
      snapshotId: 'pool-1',
      field: 'total_expenses',
      value: '1200.00',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // Should rollback to original value
    const data = queryClient.getQueryData<ReconciliationRow[]>(testQueryKey)
    expect(data?.[0].total_expenses).toBe('1000.00')
  })

  it('shows error toast on failure', async () => {
    const wrapper = createWrapper()
    mockUpdateCell.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useCellMutation(), { wrapper })

    result.current.mutate({
      snapshotId: 'pool-1',
      field: 'total_expenses',
      value: '1200.00',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      expect.objectContaining({
        action: expect.any(Object),
      })
    )
  })

  it('supports retry on error', async () => {
    const wrapper = createWrapper()
    mockUpdateCell
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ success: true })

    const { result } = renderHook(() => useCellMutation(), { wrapper })

    result.current.mutate({
      snapshotId: 'pool-1',
      field: 'total_expenses',
      value: '1200.00',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // Retry
    result.current.mutate({
      snapshotId: 'pool-1',
      field: 'total_expenses',
      value: '1200.00',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('indicates pending state during mutation', async () => {
    const wrapper = createWrapper()
    mockUpdateCell.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    )

    const { result } = renderHook(() => useCellMutation(), { wrapper })

    result.current.mutate({
      snapshotId: 'pool-1',
      field: 'total_expenses',
      value: '1200.00',
    })

    // Wait for pending state to become true
    await waitFor(() => expect(result.current.isPending).toBe(true))

    // Then wait for it to complete
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('handles tenant summary row updates', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const testQueryKey = queryKeys.reconciliation.snapshotsList({
      property_id: 'test-property',
    })
    const initialData: ReconciliationRow[] = [
      {
        type: 'tenant_summary',
        id: 'tenant-1',
        tenant_name: 'Acme Corp',
        pro_rata_share: '25.00',
        total_charge: '5000.00',
        status: 'draft',
      },
    ]
    queryClient.setQueryData(testQueryKey, initialData)

    mockUpdateCell.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useCellMutation(), { wrapper })

    result.current.mutate({
      snapshotId: 'tenant-1',
      field: 'status',
      value: 'approved',
    })

    await waitFor(() => {
      const data = queryClient.getQueryData<ReconciliationRow[]>(testQueryKey)
      expect(data?.[0]).toMatchObject({
        status: 'approved',
      })
    })
  })
})
