/**
 * Tests for useReconciliationData Hook
 *
 * Tests calculation logic, data transformation, and aggregate calculations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useReconciliationData } from './useReconciliationData'
import * as apiHooks from '@/api/hooks'
import type {
  ReconciliationSnapshot,
  ReconciliationSnapshotSummary,
} from '@/api/generated/types.gen'

// Mock API hooks
vi.mock('@/api/hooks', () => ({
  useProperty: vi.fn(),
  useAllReconciliationSnapshots: vi.fn(),
}))

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    user: { id: 'test-user-id', email: 'test@example.com' },
    session: { access_token: 'test-token' },
    isAuthenticated: true,
  })),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useReconciliationData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading States', () => {
    it('shows loading when property is loading', () => {
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(true)
    })

    it('shows loading when snapshots are loading', () => {
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(true)
    })

    it('shows loading when both are loading', () => {
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(true)
    })
  })

  describe('Error States', () => {
    it('shows error when property fetch fails', () => {
      const error = new Error('Property not found')
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isError).toBe(true)
      expect(result.current.error).toBe(error)
    })

    it('shows error when snapshots fetch fails', () => {
      const error = new Error('Snapshots not found')
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isError).toBe(true)
      expect(result.current.error).toBe(error)
    })
  })

  describe('Empty Data', () => {
    it('handles empty snapshots array', () => {
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.rows).toEqual([])
      expect(result.current.totalRecovery).toBe(0)
      expect(result.current.tenantCount).toBe(0)
      // JavaScript .every() returns true for empty arrays (vacuous truth)
      expect(result.current.isFinalized).toBe(true)
    })

    it('handles undefined snapshots data', () => {
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.rows).toEqual([])
      expect(result.current.isFinalized).toBe(false)
    })
  })

  describe('Data Transformation', () => {
    it('transforms snapshot with calculation trace to pool rows', () => {
      const mockSnapshot: ReconciliationSnapshotSummary = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1500.00',
        status: 'draft',
        created_at: '2024-01-01',
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      // Should create tenant summary row
      expect(result.current.rows).toHaveLength(1)
      expect(result.current.rows[0]).toMatchObject({
        id: 'snap-1',
        type: 'tenant_summary',
        tenant_id: 'lease-1',
        tenant_name: 'Tenant A',
        // Exact backend Decimal string preserved verbatim (no float round-trip).
        total_recovery: '1500.00',
      })
    })

    it('maps the pre-fee tenant share from tenant_share_after_cap', () => {
      const mockSnapshot: ReconciliationSnapshotSummary = {
        id: 'snap-share',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1725.00',
        tenant_share_after_cap: '1500.00',
        admin_fee: '225.00',
        status: 'draft',
        created_at: '2024-01-01',
      } as ReconciliationSnapshotSummary

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.rows[0]).toMatchObject({
        type: 'tenant_summary',
        tenant_share: '1500.00',
        admin_fee: '225.00',
        // final_amount is the all-in total (= total_recovery)
        final_amount: '1725.00',
      })
    })

    it('calculates total recovery from multiple tenants', () => {
      const mockSnapshots: ReconciliationSnapshotSummary[] = [
        {
          id: 'snap-1',
          lease_id: 'lease-1',
          tenant_name: 'Tenant A',
          total_recovery: '1500.00',
          status: 'draft',
          created_at: '2024-01-01',
        },
        {
          id: 'snap-2',
          lease_id: 'lease-2',
          tenant_name: 'Tenant B',
          total_recovery: '2500.00',
          status: 'draft',
          created_at: '2024-01-01',
        },
      ]

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: mockSnapshots, total: 2 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.totalRecovery).toBe(4000) // 1500 + 2500
      expect(result.current.tenantCount).toBe(2)
    })

    it('sets isFinalized to true when all snapshots are finalized', () => {
      const mockSnapshots: ReconciliationSnapshotSummary[] = [
        {
          id: 'snap-1',
          lease_id: 'lease-1',
          tenant_name: 'Tenant A',
          total_recovery: '1500.00',
          status: 'finalized',
          created_at: '2024-01-01',
        },
        {
          id: 'snap-2',
          lease_id: 'lease-2',
          tenant_name: 'Tenant B',
          total_recovery: '2500.00',
          status: 'finalized',
          created_at: '2024-01-01',
        },
      ]

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: mockSnapshots, total: 2 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isFinalized).toBe(true)
      expect(result.current.status).toBe('finalized')
    })

    it('sets isFinalized to false when any snapshot is draft', () => {
      const mockSnapshots: ReconciliationSnapshotSummary[] = [
        {
          id: 'snap-1',
          lease_id: 'lease-1',
          tenant_name: 'Tenant A',
          total_recovery: '1500.00',
          status: 'finalized',
          created_at: '2024-01-01',
        },
        {
          id: 'snap-2',
          lease_id: 'lease-2',
          tenant_name: 'Tenant B',
          total_recovery: '2500.00',
          status: 'draft',
          created_at: '2024-01-01',
        },
      ]

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: mockSnapshots, total: 2 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isFinalized).toBe(false)
      expect(result.current.status).toBe('draft')
    })

    it('uses lease_id as fallback when tenant_name is missing', () => {
      const mockSnapshot: ReconciliationSnapshotSummary = {
        id: 'snap-1',
        lease_id: 'lease-123',
        tenant_name: undefined,
        total_recovery: '1500.00',
        status: 'draft',
        created_at: '2024-01-01',
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.rows[0].tenant_name).toBe('lease-123')
    })

    it('returns first snapshot ID', () => {
      const mockSnapshots: ReconciliationSnapshotSummary[] = [
        {
          id: 'snap-first',
          lease_id: 'lease-1',
          tenant_name: 'Tenant A',
          total_recovery: '1500.00',
          status: 'draft',
          created_at: '2024-01-01',
        },
        {
          id: 'snap-second',
          lease_id: 'lease-2',
          tenant_name: 'Tenant B',
          total_recovery: '2500.00',
          status: 'draft',
          created_at: '2024-01-01',
        },
      ]

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: mockSnapshots, total: 2 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.snapshotId).toBe('snap-first')
    })
  })

  describe('Edge Cases', () => {
    it('handles null property gracefully', () => {
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.property).toBe(null)
      expect(result.current.isLoading).toBe(false)
    })

    it('handles snapshots with null total_recovery', () => {
      const mockSnapshot: ReconciliationSnapshotSummary = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: null as any,
        status: 'draft',
        created_at: '2024-01-01',
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      // Should handle null as 0
      expect(result.current.totalRecovery).toBe(0)
      expect(result.current.rows[0].total_recovery).toBe('0')
    })
  })

  describe('Year Parameter', () => {
    it('constructs correct period_start and period_end from year', () => {
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2023',
          }),
        { wrapper: createWrapper() }
      )

      // The all-pages hook handles pagination internally, so the data hook no
      // longer passes page/size — it requests the full filtered set.
      expect(apiHooks.useAllReconciliationSnapshots).toHaveBeenCalledWith(
        {
          property_id: 'prop-1',
          period_start: '2023-01-01',
          period_end: '2023-12-31',
        },
        { enabled: true }
      )
    })
  })

  describe('Calculation Trace Parsing', () => {
    it('extracts pool data from calculation_trace with pool aggregation steps', () => {
      const mockSnapshot: ReconciliationSnapshot = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1500.00',
        status: 'draft',
        created_at: '2024-01-01',
        calculation_trace: [
          {
            step_order: 1,
            step_name: 'Aggregate Utilities Pool',
            input_values: {
              pool_id: 'pool-utilities',
              total_expenses: '5000.00',
              grossed_up_expenses: '5500.00',
            },
            operation: 'sum',
            output_value: '5500.00',
          },
        ] as any,
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      // Should create both pool row and tenant summary row
      expect(result.current.rows).toHaveLength(2)
      const poolRow = result.current.rows.find((r) => r.type === 'expense_pool')
      expect(poolRow).toMatchObject({
        type: 'expense_pool',
        pool_id: 'pool-utilities',
        pool_name: 'Utilities',
        total_expenses: '5000.00',
        grossed_up_expenses: '5500.00',
      })
    })

    it('extracts pool name from input_values.pool_name when regex does not match', () => {
      const mockSnapshot: ReconciliationSnapshot = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1000.00',
        status: 'draft',
        created_at: '2024-01-01',
        calculation_trace: [
          {
            step_order: 1,
            step_name: 'Custom Step Name',
            input_values: {
              pool_name: 'Janitorial',
              total_expenses: '3000.00',
            },
            operation: 'sum',
            output_value: '3000.00',
          },
        ] as any,
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      const poolRow = result.current.rows.find((r) => r.type === 'expense_pool')
      expect(poolRow).toMatchObject({
        pool_name: 'Janitorial',
      })
    })

    it('skips pool extraction when pool_name is undefined', () => {
      const mockSnapshot: ReconciliationSnapshot = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1000.00',
        status: 'draft',
        created_at: '2024-01-01',
        calculation_trace: [
          {
            step_order: 1,
            step_name: 'Invalid Step',
            input_values: {},
            operation: 'sum',
            output_value: '1000.00',
          },
        ] as any,
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      // Should only have tenant summary row, no pool rows
      expect(result.current.rows).toHaveLength(1)
      expect(result.current.rows[0].type).toBe('tenant_summary')
    })

    it('handles pool without grossed_up_expenses', () => {
      const mockSnapshot: ReconciliationSnapshot = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1000.00',
        status: 'draft',
        created_at: '2024-01-01',
        calculation_trace: [
          {
            step_order: 1,
            step_name: 'Aggregate Insurance Pool',
            input_values: {
              pool_id: 'pool-insurance',
              total_expenses: '2000.00',
            },
            operation: 'sum',
            output_value: '2000.00',
          },
        ] as any,
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      const poolRow = result.current.rows.find((r) => r.type === 'expense_pool')
      expect(poolRow).toMatchObject({
        pool_name: 'Insurance',
        total_expenses: '2000.00',
      })
      expect(poolRow?.grossed_up_expenses).toBeUndefined()
    })

    it('extracts tenant shares from calculation trace', () => {
      const mockSnapshot: ReconciliationSnapshot = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1500.00',
        status: 'draft',
        created_at: '2024-01-01',
        calculation_trace: [
          {
            step_order: 1,
            step_name: 'Aggregate Utilities Pool',
            input_values: {
              pool_id: 'pool-utilities',
              total_expenses: '5000.00',
            },
            operation: 'sum',
            output_value: '5000.00',
          },
          {
            step_order: 2,
            step_name: 'Calculate Tenant Share - Utilities',
            input_values: {
              pool_total: '5000.00',
              pro_rata_share: '0.30',
            },
            operation: 'multiply',
            output_value: '1500.00',
          },
        ] as any,
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      const poolRow = result.current.rows.find((r) => r.type === 'expense_pool')
      expect(poolRow?.tenant_shares).toEqual({
        'lease-1': '1500.00',
      })
    })

    it('handles snapshots without calculation_trace field', () => {
      const mockSnapshot: ReconciliationSnapshotSummary = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1000.00',
        status: 'draft',
        created_at: '2024-01-01',
        // No calculation_trace field (summary type)
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      // Should only create tenant summary, no pools
      expect(result.current.rows).toHaveLength(1)
      expect(result.current.rows[0].type).toBe('tenant_summary')
    })

    it('handles snapshot with empty calculation_trace array', () => {
      const mockSnapshot: ReconciliationSnapshot = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1000.00',
        status: 'draft',
        created_at: '2024-01-01',
        calculation_trace: [],
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      // Should only create tenant summary, no pools
      expect(result.current.rows).toHaveLength(1)
      expect(result.current.rows[0].type).toBe('tenant_summary')
    })

    it('merges pools from multiple snapshots', () => {
      const mockSnapshot1: ReconciliationSnapshot = {
        id: 'snap-1',
        lease_id: 'lease-1',
        tenant_name: 'Tenant A',
        total_recovery: '1500.00',
        status: 'draft',
        created_at: '2024-01-01',
        calculation_trace: [
          {
            step_order: 1,
            step_name: 'Aggregate Utilities Pool',
            input_values: {
              pool_id: 'pool-utilities',
              total_expenses: '5000.00',
            },
            operation: 'sum',
            output_value: '5000.00',
          },
          {
            step_order: 2,
            step_name: 'Calculate Tenant Share - Utilities',
            input_values: {},
            operation: 'multiply',
            output_value: '1500.00',
          },
        ] as any,
      }

      const mockSnapshot2: ReconciliationSnapshot = {
        id: 'snap-2',
        lease_id: 'lease-2',
        tenant_name: 'Tenant B',
        total_recovery: '2000.00',
        status: 'draft',
        created_at: '2024-01-01',
        calculation_trace: [
          {
            step_order: 1,
            step_name: 'Aggregate Utilities Pool',
            input_values: {
              pool_id: 'pool-utilities',
              total_expenses: '5000.00',
            },
            operation: 'sum',
            output_value: '5000.00',
          },
          {
            step_order: 2,
            step_name: 'Calculate Tenant Share - Utilities',
            input_values: {},
            operation: 'multiply',
            output_value: '2000.00',
          },
        ] as any,
      }

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: { id: 'prop-1', name: 'Property 1' },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [mockSnapshot1, mockSnapshot2], total: 2 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      // Should have 1 pool row + 2 tenant summary rows
      expect(result.current.rows).toHaveLength(3)
      const poolRow = result.current.rows.find((r) => r.type === 'expense_pool')
      expect(poolRow?.tenant_shares).toEqual({
        'lease-1': '1500.00',
        'lease-2': '2000.00',
      })
    })
  })

  describe('Error Handling', () => {
    it('shows both errors when property and snapshots both fail', () => {
      const propertyError = new Error('Property fetch failed')
      const snapshotsError = new Error('Snapshots fetch failed')

      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: propertyError,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: snapshotsError,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isError).toBe(true)
      // Property error takes precedence
      expect(result.current.error).toBe(propertyError)
    })

    it('returns property when data is undefined (not null)', () => {
      vi.mocked(apiHooks.useProperty).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      vi.mocked(apiHooks.useAllReconciliationSnapshots).mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        error: null,
      } as any)

      const { result } = renderHook(
        () =>
          useReconciliationData({
            propertyId: 'prop-1',
            year: '2024',
          }),
        { wrapper: createWrapper() }
      )

      expect(result.current.property).toBe(null)
    })
  })
})
