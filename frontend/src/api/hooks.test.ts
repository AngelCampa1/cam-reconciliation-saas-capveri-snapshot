/**
 * Tests for React Query Hooks
 *
 * Tests query key factory and hook structure.
 * Actual API calls are mocked via the SDK functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import {
  queryKeys,
  useProperties,
  useProperty,
  useCreateProperty,
  useUpdateProperty,
  useDeleteProperty,
  useUnits,
  useUnit,
  useCreateUnit,
  useUpdateUnit,
  useDeleteUnit,
  useLeases,
  useLease,
  useCreateLease,
  useUpdateLease,
  useDeleteLease,
  useRecoveryProfile,
  useUpdateRecoveryProfile,
  useImportBatches,
  usePropertyImports,
  useReconciliationSnapshots,
  useAllReconciliationSnapshots,
  useReconciliationSnapshot,
  useCalculateReconciliation,
  useCalculationJobStatus,
  useFinalizeSnapshots,
  useFinalizeSnapshot,
  useUpdateReconciliationCell,
  useValidateInvitation,
  useTenantSignup,
  useApplyPoolTemplate,
  useCopyExpensePools,
  useCampaigns,
  useSubmitForReview,
  normalizeDenominatorChangeReport,
} from './hooks'
import type { DenominatorChangeReport } from '@/features/reconciliation/types/denominator-change'

// Mock the SDK functions
vi.mock('./client', async () => {
  const actual = await vi.importActual('./client')
  return {
    ...actual,
    apiClient: {},
    listPropertiesApiV1PropertiesGet: vi.fn(),
    getPropertyApiV1PropertiesPropertyIdGet: vi.fn(),
    createPropertyApiV1PropertiesPost: vi.fn(),
    updatePropertyApiV1PropertiesPropertyIdPut: vi.fn(),
    deletePropertyApiV1PropertiesPropertyIdDelete: vi.fn(),
    listUnitsApiV1PropertiesPropertyIdUnitsGet: vi.fn(),
    getUnitApiV1PropertiesPropertyIdUnitsUnitIdGet: vi.fn(),
    createUnitApiV1PropertiesPropertyIdUnitsPost: vi.fn(),
    updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut: vi.fn(),
    deleteUnitApiV1PropertiesPropertyIdUnitsUnitIdDelete: vi.fn(),
    listLeasesApiV1LeasesGet: vi.fn(),
    getLeaseApiV1LeasesLeaseIdGet: vi.fn(),
    createLeaseApiV1LeasesPost: vi.fn(),
    updateLeaseApiV1LeasesLeaseIdPut: vi.fn(),
    deleteLeaseApiV1LeasesLeaseIdDelete: vi.fn(),
    getRecoveryProfileApiV1LeasesLeaseIdRecoveryProfileGet: vi.fn(),
    updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut: vi.fn(),
    listImportBatchesApiV1IngestionBatchesGet: vi.fn(),
    listPropertyImportsApiV1PropertiesPropertyIdImportsGet: vi.fn(),
    listSnapshotsApiV1ReconciliationSnapshotsGet: vi.fn(),
    getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet: vi.fn(),
    calculateReconciliationApiV1ReconciliationCalculatePost: vi.fn(),
    getJobStatusApiV1ReconciliationJobsJobIdGet: vi.fn(),
    finalizeSnapshotsBatchApiV1ReconciliationSnapshotsFinalizeBatchPost:
      vi.fn(),
    finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost: vi.fn(),
    updateReconciliationCellApiV1ReconciliationCellsCellIdPatch: vi.fn(),
    validateInvitationTokenApiV1TenantInvitationsTokenValidateGet: vi.fn(),
    tenantSignupApiV1TenantSignupPost: vi.fn(),
    listTemplatesApiV1PoolTemplatesGet: vi.fn(),
    createTemplateApiV1PoolTemplatesPost: vi.fn(),
    getTemplateApiV1PoolTemplatesTemplateIdGet: vi.fn(),
    updateTemplateApiV1PoolTemplatesTemplateIdPut: vi.fn(),
    deleteTemplateApiV1PoolTemplatesTemplateIdDelete: vi.fn(),
    applyTemplateApiV1PoolTemplatesApplyPost: vi.fn(),
    copyPoolsApiV1PoolTemplatesCopyPost: vi.fn(),
    listCampaignsApiV1CampaignsGet: vi.fn(),
    submitForReviewApiV1CampaignsCampaignIdSubmitForReviewPost: vi.fn(),
    approveCampaignApiV1CampaignsCampaignIdApprovePost: vi.fn(),
    rejectCampaignApiV1CampaignsCampaignIdRejectPost: vi.fn(),
    markSentApiV1CampaignsCampaignIdMarkSentPost: vi.fn(),
  }
})

// Create wrapper with fresh QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

describe('queryKeys', () => {
  describe('properties', () => {
    it('generates hierarchical keys', () => {
      expect(queryKeys.properties.all).toEqual(['properties'])
      expect(queryKeys.properties.lists()).toEqual(['properties', 'list'])
      expect(queryKeys.properties.list({ skip: 0, limit: 10 })).toEqual([
        'properties',
        'list',
        { skip: 0, limit: 10 },
      ])
      expect(queryKeys.properties.details()).toEqual(['properties', 'detail'])
      expect(queryKeys.properties.detail('prop-1')).toEqual([
        'properties',
        'detail',
        'prop-1',
      ])
    })
  })

  describe('units', () => {
    it('generates property-scoped keys', () => {
      expect(queryKeys.units.all).toEqual(['units'])
      expect(queryKeys.units.byProperty('prop-1')).toEqual([
        'units',
        'byProperty',
        'prop-1',
      ])
      expect(queryKeys.units.list('prop-1', { skip: 0, limit: 20 })).toEqual([
        'units',
        'byProperty',
        'prop-1',
        'list',
        { skip: 0, limit: 20 },
      ])
      expect(queryKeys.units.detail('prop-1', 'unit-1')).toEqual([
        'units',
        'detail',
        'prop-1',
        'unit-1',
      ])
    })
  })

  describe('leases', () => {
    it('generates hierarchical keys with recovery profile', () => {
      expect(queryKeys.leases.all).toEqual(['leases'])
      expect(queryKeys.leases.lists()).toEqual(['leases', 'list'])
      expect(queryKeys.leases.list({ property_id: 'prop-1', skip: 0 })).toEqual(
        ['leases', 'list', { property_id: 'prop-1', skip: 0 }]
      )
      expect(queryKeys.leases.detail('lease-1')).toEqual([
        'leases',
        'detail',
        'lease-1',
      ])
      expect(queryKeys.leases.recoveryProfile('lease-1')).toEqual([
        'leases',
        'detail',
        'lease-1',
        'recoveryProfile',
      ])
    })
  })

  describe('reconciliation', () => {
    it('generates hierarchical keys with cells', () => {
      expect(queryKeys.reconciliation.all).toEqual(['reconciliation'])
      expect(queryKeys.reconciliation.cells()).toEqual([
        'reconciliation',
        'cells',
      ])
      expect(queryKeys.reconciliation.cell('cell-123')).toEqual([
        'reconciliation',
        'cells',
        'cell-123',
      ])
    })
  })

  describe('tenant', () => {
    it('generates hierarchical keys for invitations', () => {
      expect(queryKeys.tenant.all).toEqual(['tenant'])
      expect(queryKeys.tenant.invitations()).toEqual(['tenant', 'invitations'])
      expect(queryKeys.tenant.invitation('token-123')).toEqual([
        'tenant',
        'invitations',
        'token-123',
      ])
    })
  })

  describe('ingestion', () => {
    it('generates hierarchical keys for import batches', () => {
      expect(queryKeys.ingestion.all).toEqual(['ingestion'])
      expect(queryKeys.ingestion.batches()).toEqual(['ingestion', 'batches'])
      expect(queryKeys.ingestion.batchesList()).toEqual([
        'ingestion',
        'batches',
        'list',
      ])
    })
  })
})

describe('Property Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useProperties', () => {
    it('fetches properties list', async () => {
      const mockData = { items: [], total: 0, skip: 0, limit: 50 }
      const { listPropertiesApiV1PropertiesGet } = await import('./client')
      vi.mocked(listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: mockData,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useProperties(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockData)
    })

    it('handles API errors', async () => {
      const { listPropertiesApiV1PropertiesGet } = await import('./client')
      vi.mocked(listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: undefined,
        error: { message: 'Failed' },
        response: {} as Response,
      })

      const { result } = renderHook(() => useProperties(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
    })
  })

  describe('useProperty', () => {
    it('fetches single property when ID provided', async () => {
      const mockProperty = { id: 'prop-1', name: 'Test Property' }
      const { getPropertyApiV1PropertiesPropertyIdGet } =
        await import('./client')
      vi.mocked(getPropertyApiV1PropertiesPropertyIdGet).mockResolvedValue({
        data: mockProperty,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useProperty('prop-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockProperty)
    })

    it('does not fetch when ID is empty', async () => {
      const { getPropertyApiV1PropertiesPropertyIdGet } =
        await import('./client')

      const { result } = renderHook(() => useProperty(''), {
        wrapper: createWrapper(),
      })

      expect(result.current.fetchStatus).toBe('idle')
      expect(getPropertyApiV1PropertiesPropertyIdGet).not.toHaveBeenCalled()
    })
  })

  describe('useCreateProperty', () => {
    it('provides mutation function', () => {
      const { result } = renderHook(() => useCreateProperty(), {
        wrapper: createWrapper(),
      })

      expect(result.current.mutate).toBeDefined()
      expect(result.current.mutateAsync).toBeDefined()
    })
  })
})

describe('Unit Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useUnits', () => {
    it('fetches units for a property', async () => {
      const mockData = { items: [], total: 0, skip: 0, limit: 50 }
      const { listUnitsApiV1PropertiesPropertyIdUnitsGet } =
        await import('./client')
      vi.mocked(listUnitsApiV1PropertiesPropertyIdUnitsGet).mockResolvedValue({
        data: mockData,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useUnits('prop-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockData)
    })

    it('does not fetch when propertyId is empty', async () => {
      const { listUnitsApiV1PropertiesPropertyIdUnitsGet } =
        await import('./client')

      const { result } = renderHook(() => useUnits(''), {
        wrapper: createWrapper(),
      })

      expect(result.current.fetchStatus).toBe('idle')
      expect(listUnitsApiV1PropertiesPropertyIdUnitsGet).not.toHaveBeenCalled()
    })
  })

  describe('useUnit', () => {
    it('does not fetch when either ID is empty', async () => {
      const { getUnitApiV1PropertiesPropertyIdUnitsUnitIdGet } =
        await import('./client')

      const { result: result1 } = renderHook(() => useUnit('prop-1', ''), {
        wrapper: createWrapper(),
      })
      expect(result1.current.fetchStatus).toBe('idle')

      const { result: result2 } = renderHook(() => useUnit('', 'unit-1'), {
        wrapper: createWrapper(),
      })
      expect(result2.current.fetchStatus).toBe('idle')

      expect(
        getUnitApiV1PropertiesPropertyIdUnitsUnitIdGet
      ).not.toHaveBeenCalled()
    })
  })
})

describe('Lease Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useLeases', () => {
    it('fetches leases list', async () => {
      const mockData = { items: [], total: 0, skip: 0, limit: 50 }
      const { listLeasesApiV1LeasesGet } = await import('./client')
      vi.mocked(listLeasesApiV1LeasesGet).mockResolvedValue({
        data: mockData,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useLeases(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockData)
    })

    it('supports property_id filter', async () => {
      const { listLeasesApiV1LeasesGet } = await import('./client')
      vi.mocked(listLeasesApiV1LeasesGet).mockResolvedValue({
        data: { items: [], total: 0, skip: 0, limit: 50 },
        error: undefined,
        response: {} as Response,
      })

      renderHook(() => useLeases({ property_id: 'prop-1' }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(listLeasesApiV1LeasesGet).toHaveBeenCalledWith(
          expect.objectContaining({
            query: { property_id: 'prop-1' },
          })
        )
      })
    })
  })

  describe('useLease', () => {
    it('fetches single lease', async () => {
      const mockLease = { id: 'lease-1', tenant_name: 'Tenant A' }
      const { getLeaseApiV1LeasesLeaseIdGet } = await import('./client')
      vi.mocked(getLeaseApiV1LeasesLeaseIdGet).mockResolvedValue({
        data: mockLease,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useLease('lease-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockLease)
    })
  })

  describe('useRecoveryProfile', () => {
    it('fetches recovery profile for lease', async () => {
      const mockProfile = { base_year: 2024, cap_type: 'none' }
      const { getRecoveryProfileApiV1LeasesLeaseIdRecoveryProfileGet } =
        await import('./client')
      vi.mocked(
        getRecoveryProfileApiV1LeasesLeaseIdRecoveryProfileGet
      ).mockResolvedValue({
        data: mockProfile,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useRecoveryProfile('lease-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockProfile)
    })

    it('does not fetch when leaseId is empty', async () => {
      const { getRecoveryProfileApiV1LeasesLeaseIdRecoveryProfileGet } =
        await import('./client')

      const { result } = renderHook(() => useRecoveryProfile(''), {
        wrapper: createWrapper(),
      })

      expect(result.current.fetchStatus).toBe('idle')
      expect(
        getRecoveryProfileApiV1LeasesLeaseIdRecoveryProfileGet
      ).not.toHaveBeenCalled()
    })
  })
})

describe('Property Mutation Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useUpdateProperty', () => {
    it('updates property and refreshes cache', async () => {
      const mockProperty = { id: 'prop-1', name: 'Updated Property' }
      const { updatePropertyApiV1PropertiesPropertyIdPut } =
        await import('./client')
      vi.mocked(updatePropertyApiV1PropertiesPropertyIdPut).mockResolvedValue({
        data: mockProperty,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useUpdateProperty('prop-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ name: 'Updated Property' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockProperty)
    })

    it('handles API errors', async () => {
      const { updatePropertyApiV1PropertiesPropertyIdPut } =
        await import('./client')
      vi.mocked(updatePropertyApiV1PropertiesPropertyIdPut).mockResolvedValue({
        data: undefined,
        error: { message: 'Update failed' },
        response: {} as Response,
      })

      const { result } = renderHook(() => useUpdateProperty('prop-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ name: 'Updated Property' })

      await waitFor(() => expect(result.current.isError).toBe(true))
    })

    it('uses optimistic update with setQueryData', async () => {
      const mockProperty = { id: 'prop-1', name: 'Updated Property' }
      const { updatePropertyApiV1PropertiesPropertyIdPut } =
        await import('./client')
      vi.mocked(updatePropertyApiV1PropertiesPropertyIdPut).mockResolvedValue({
        data: mockProperty,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useUpdateProperty('prop-1'), {
        wrapper,
      })

      result.current.mutate({ name: 'Updated Property' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        queryKeys.properties.detail('prop-1'),
        mockProperty
      )
    })

    it('invalidates property lists cache on success', async () => {
      const mockProperty = { id: 'prop-1', name: 'Updated Property' }
      const { updatePropertyApiV1PropertiesPropertyIdPut } =
        await import('./client')
      vi.mocked(updatePropertyApiV1PropertiesPropertyIdPut).mockResolvedValue({
        data: mockProperty,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useUpdateProperty('prop-1'), {
        wrapper,
      })

      result.current.mutate({ name: 'Updated Property' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.properties.lists(),
      })
    })
  })

  describe('useDeleteProperty', () => {
    it('deletes property and removes from cache', async () => {
      const { deletePropertyApiV1PropertiesPropertyIdDelete } =
        await import('./client')
      vi.mocked(
        deletePropertyApiV1PropertiesPropertyIdDelete
      ).mockResolvedValue({
        data: undefined,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useDeleteProperty(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('prop-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('removes property detail from cache using removeQueries', async () => {
      const { deletePropertyApiV1PropertiesPropertyIdDelete } =
        await import('./client')
      vi.mocked(
        deletePropertyApiV1PropertiesPropertyIdDelete
      ).mockResolvedValue({
        data: undefined,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const removeQueriesSpy = vi.spyOn(queryClient, 'removeQueries')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useDeleteProperty(), { wrapper })

      result.current.mutate('prop-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(removeQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.properties.detail('prop-1'),
      })
    })

    it('invalidates property lists cache on success', async () => {
      const { deletePropertyApiV1PropertiesPropertyIdDelete } =
        await import('./client')
      vi.mocked(
        deletePropertyApiV1PropertiesPropertyIdDelete
      ).mockResolvedValue({
        data: undefined,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useDeleteProperty(), { wrapper })

      result.current.mutate('prop-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.properties.lists(),
      })
    })
  })
})

describe('Query Loading States', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('useProperties starts in loading state', async () => {
    const { listPropertiesApiV1PropertiesGet } = await import('./client')
    vi.mocked(listPropertiesApiV1PropertiesGet).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: { items: [], total: 0, skip: 0, limit: 50 },
                error: undefined,
                response: {} as Response,
              }),
            100
          )
        })
    )

    const { result } = renderHook(() => useProperties(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isFetching).toBe(true)
    expect(result.current.data).toBeUndefined()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useProperty starts in loading state when enabled', async () => {
    const { getPropertyApiV1PropertiesPropertyIdGet } = await import('./client')
    vi.mocked(getPropertyApiV1PropertiesPropertyIdGet).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: { id: 'prop-1', name: 'Test' },
                error: undefined,
                response: {} as Response,
              }),
            100
          )
        })
    )

    const { result } = renderHook(() => useProperty('prop-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useLease starts in loading state when enabled', async () => {
    const { getLeaseApiV1LeasesLeaseIdGet } = await import('./client')
    vi.mocked(getLeaseApiV1LeasesLeaseIdGet).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: { id: 'lease-1', tenant_name: 'Test' },
                error: undefined,
                response: {} as Response,
              }),
            100
          )
        })
    )

    const { result } = renderHook(() => useLease('lease-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('Reconciliation Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useReconciliationSnapshots', () => {
    beforeEach(async () => {
      const mod = await import('./client')
      vi.mocked(mod.listSnapshotsApiV1ReconciliationSnapshotsGet)
    })

    it('fetches snapshots list with filters', async () => {
      const mockData = {
        items: [],
        total: 0,
        page: 1,
        size: 50,
      }
      const { listSnapshotsApiV1ReconciliationSnapshotsGet } =
        await import('./client')
      vi.mocked(listSnapshotsApiV1ReconciliationSnapshotsGet).mockResolvedValue(
        {
          data: mockData,
          error: undefined,
          response: {} as Response,
        }
      )

      const { result } = renderHook(
        () =>
          useReconciliationSnapshots({
            property_id: 'prop-1',
            is_finalized: false,
          }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockData)
      expect(listSnapshotsApiV1ReconciliationSnapshotsGet).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { property_id: 'prop-1', is_finalized: false },
        })
      )
    })
  })

  describe('useAllReconciliationSnapshots', () => {
    it('returns a single page unchanged when has_next is false', async () => {
      const { listSnapshotsApiV1ReconciliationSnapshotsGet } =
        await import('./client')
      vi.mocked(listSnapshotsApiV1ReconciliationSnapshotsGet).mockResolvedValue(
        {
          data: {
            items: [{ id: 'a' }, { id: 'b' }],
            total: 2,
            page: 1,
            page_size: 100,
            total_pages: 1,
            has_next: false,
          },
          error: undefined,
          response: {} as Response,
        }
      )

      const { result } = renderHook(
        () => useAllReconciliationSnapshots({ property_id: 'prop-1' }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.items).toHaveLength(2)
      expect(result.current.data?.total).toBe(2)
      expect(
        listSnapshotsApiV1ReconciliationSnapshotsGet
      ).toHaveBeenCalledTimes(1)
      expect(listSnapshotsApiV1ReconciliationSnapshotsGet).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { property_id: 'prop-1', page: 1, size: 100 },
        })
      )
    })

    it('walks every page and concatenates all items (>100 leases)', async () => {
      const { listSnapshotsApiV1ReconciliationSnapshotsGet } =
        await import('./client')
      const mock = vi.mocked(listSnapshotsApiV1ReconciliationSnapshotsGet)
      // Page 1: 100 items + has_next; page 2: 50 items, no next.
      const page1Items = Array.from({ length: 100 }, (_, i) => ({
        id: `p1-${i}`,
      }))
      const page2Items = Array.from({ length: 50 }, (_, i) => ({
        id: `p2-${i}`,
      }))
      mock.mockResolvedValueOnce({
        data: {
          items: page1Items,
          total: 150,
          page: 1,
          page_size: 100,
          total_pages: 2,
          has_next: true,
        },
        error: undefined,
        response: {} as Response,
      })
      mock.mockResolvedValueOnce({
        data: {
          items: page2Items,
          total: 150,
          page: 2,
          page_size: 100,
          total_pages: 2,
          has_next: false,
        },
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(
        () => useAllReconciliationSnapshots({ property_id: 'prop-big' }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.items).toHaveLength(150)
      expect(result.current.data?.total).toBe(150)
      expect(result.current.data?.has_next).toBe(false)
      expect(mock).toHaveBeenCalledTimes(2)
      expect(mock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          query: { property_id: 'prop-big', page: 2, size: 100 },
        })
      )
    })

    it('throws an ApiError when a page request errors', async () => {
      const { listSnapshotsApiV1ReconciliationSnapshotsGet } =
        await import('./client')
      vi.mocked(listSnapshotsApiV1ReconciliationSnapshotsGet).mockResolvedValue(
        {
          data: undefined,
          error: { detail: 'boom' },
          response: {} as Response,
        }
      )

      const { result } = renderHook(
        () => useAllReconciliationSnapshots({ property_id: 'prop-err' }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isError).toBe(true))
    })
  })

  describe('useReconciliationSnapshot', () => {
    beforeEach(async () => {
      const mod = await import('./client')
      vi.mocked(mod.getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet)
    })

    it('fetches single snapshot with trace', async () => {
      const mockSnapshot = {
        id: 'snap-1',
        property_id: 'prop-1',
        is_finalized: false,
      }
      const { getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet } =
        await import('./client')
      vi.mocked(
        getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet
      ).mockResolvedValue({
        data: mockSnapshot,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(
        () => useReconciliationSnapshot('snap-1', true),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockSnapshot)
      expect(
        getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { snapshot_id: 'snap-1' },
          query: { include_trace: true },
        })
      )
    })

    it('does not fetch when snapshotId is empty', async () => {
      const { getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet } =
        await import('./client')

      const { result } = renderHook(() => useReconciliationSnapshot(''), {
        wrapper: createWrapper(),
      })

      expect(result.current.fetchStatus).toBe('idle')
      expect(
        getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet
      ).not.toHaveBeenCalled()
    })
  })

  describe('useCalculateReconciliation', () => {
    beforeEach(async () => {
      const mod = await import('./client')
      vi.mocked(mod.calculateReconciliationApiV1ReconciliationCalculatePost)
    })

    it('triggers calculation and invalidates snapshots cache', async () => {
      const mockResponse = { job_id: 'job-123', status: 'pending' }
      const { calculateReconciliationApiV1ReconciliationCalculatePost } =
        await import('./client')
      vi.mocked(
        calculateReconciliationApiV1ReconciliationCalculatePost
      ).mockResolvedValue({
        data: mockResponse,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useCalculateReconciliation(), {
        wrapper,
      })

      result.current.mutate({
        property_id: 'prop-1',
        period_start: '2024-01-01',
        period_end: '2024-12-31',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockResponse)
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.reconciliation.snapshots(),
      })
    })
  })

  describe('useCalculationJobStatus', () => {
    beforeEach(async () => {
      const mod = await import('./client')
      vi.mocked(mod.getJobStatusApiV1ReconciliationJobsJobIdGet)
    })

    it('does not fetch when jobId is null', async () => {
      const { getJobStatusApiV1ReconciliationJobsJobIdGet } =
        await import('./client')

      const { result } = renderHook(() => useCalculationJobStatus(null), {
        wrapper: createWrapper(),
      })

      expect(result.current.fetchStatus).toBe('idle')
      expect(getJobStatusApiV1ReconciliationJobsJobIdGet).not.toHaveBeenCalled()
    })

    it('fetches job status when jobId provided', async () => {
      const mockStatus = {
        job_id: 'job-123',
        status: 'completed',
        result: { snapshot_id: 'snap-1' },
      }
      const { getJobStatusApiV1ReconciliationJobsJobIdGet } =
        await import('./client')
      vi.mocked(getJobStatusApiV1ReconciliationJobsJobIdGet).mockResolvedValue({
        data: mockStatus,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useCalculationJobStatus('job-123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockStatus)
    })

    it('polls when status is pending or running', async () => {
      let callCount = 0
      const { getJobStatusApiV1ReconciliationJobsJobIdGet } =
        await import('./client')

      vi.mocked(getJobStatusApiV1ReconciliationJobsJobIdGet).mockImplementation(
        async () => {
          callCount++
          // First two calls return 'running', third returns 'completed'
          const status =
            callCount <= 2
              ? 'running'
              : ('completed' as 'pending' | 'running' | 'completed' | 'failed')

          return {
            data: {
              job_id: 'job-123',
              status,
              result: status === 'completed' ? { snapshot_id: 'snap-1' } : null,
            },
            error: undefined,
            response: {} as Response,
          }
        }
      )

      const { result } = renderHook(() => useCalculationJobStatus('job-123'), {
        wrapper: createWrapper(),
      })

      // Should keep polling until completed
      await waitFor(
        () => {
          expect(result.current.data?.status).toBe('completed')
        },
        { timeout: 5000 }
      )

      // Should have been called multiple times (polling)
      expect(callCount).toBeGreaterThan(2)
    })

    it('stops polling when status is completed', async () => {
      const mockStatus = {
        job_id: 'job-123',
        status: 'completed' as const,
        result: { snapshot_id: 'snap-1' },
      }
      const { getJobStatusApiV1ReconciliationJobsJobIdGet } =
        await import('./client')
      vi.mocked(getJobStatusApiV1ReconciliationJobsJobIdGet).mockResolvedValue({
        data: mockStatus,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useCalculationJobStatus('job-123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      const initialCallCount = vi.mocked(
        getJobStatusApiV1ReconciliationJobsJobIdGet
      ).mock.calls.length

      // Wait a bit and verify no additional calls (polling stopped)
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const finalCallCount = vi.mocked(
        getJobStatusApiV1ReconciliationJobsJobIdGet
      ).mock.calls.length

      expect(finalCallCount).toBe(initialCallCount)
    })
  })

  describe('useFinalizeSnapshots', () => {
    beforeEach(async () => {
      const mod = await import('./client')
      vi.mocked(
        mod.finalizeSnapshotsBatchApiV1ReconciliationSnapshotsFinalizeBatchPost
      )
    })

    it('finalizes batch and invalidates snapshots cache', async () => {
      const mockResponse = {
        total_attempted: 5,
        total_succeeded: 5,
        total_failed: 0,
        message: 'All 5 snapshots finalized successfully',
        results: [
          { snapshot_id: 'snap-1', success: true, error_message: null },
          { snapshot_id: 'snap-2', success: true, error_message: null },
          { snapshot_id: 'snap-3', success: true, error_message: null },
          { snapshot_id: 'snap-4', success: true, error_message: null },
          { snapshot_id: 'snap-5', success: true, error_message: null },
        ],
      }
      const {
        finalizeSnapshotsBatchApiV1ReconciliationSnapshotsFinalizeBatchPost,
      } = await import('./client')
      vi.mocked(
        finalizeSnapshotsBatchApiV1ReconciliationSnapshotsFinalizeBatchPost
      ).mockResolvedValue({
        data: mockResponse,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useFinalizeSnapshots(), { wrapper })

      result.current.mutate({
        property_id: 'prop-1',
        period_start: '2024-01-01',
        period_end: '2024-12-31',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockResponse)
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.reconciliation.snapshots(),
      })
    })
  })
})

describe('Unit Mutation Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useCreateUnit', () => {
    it('creates unit and invalidates cache', async () => {
      const mockUnit = { id: 'unit-1', unit_number: '101' }
      const { createUnitApiV1PropertiesPropertyIdUnitsPost } =
        await import('./client')
      vi.mocked(createUnitApiV1PropertiesPropertyIdUnitsPost).mockResolvedValue(
        {
          data: mockUnit,
          error: undefined,
          response: {} as Response,
        }
      )

      const { result } = renderHook(() => useCreateUnit('prop-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ unit_number: '101' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockUnit)
    })
  })

  describe('useUpdateUnit', () => {
    it('updates unit and refreshes cache', async () => {
      const mockUnit = { id: 'unit-1', unit_number: '101A' }
      const { updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut } =
        await import('./client')
      vi.mocked(
        updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut
      ).mockResolvedValue({
        data: mockUnit,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useUpdateUnit('prop-1', 'unit-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ unit_number: '101A' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockUnit)
    })
  })

  describe('useDeleteUnit', () => {
    it('deletes unit and removes from cache', async () => {
      const { deleteUnitApiV1PropertiesPropertyIdUnitsUnitIdDelete } =
        await import('./client')
      vi.mocked(
        deleteUnitApiV1PropertiesPropertyIdUnitsUnitIdDelete
      ).mockResolvedValue({
        data: undefined,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useDeleteUnit('prop-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate('unit-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })
  })
})

describe('Lease Mutation Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useCreateLease', () => {
    it('creates lease and invalidates cache', async () => {
      const mockLease = { id: 'lease-1', tenant_name: 'Tenant A' }
      const { createLeaseApiV1LeasesPost } = await import('./client')
      vi.mocked(createLeaseApiV1LeasesPost).mockResolvedValue({
        data: mockLease,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useCreateLease(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ tenant_name: 'Tenant A', unit_id: 'unit-1' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockLease)
    })

    it('invalidates lease lists cache on success', async () => {
      const mockLease = { id: 'lease-1', tenant_name: 'Tenant A' }
      const { createLeaseApiV1LeasesPost } = await import('./client')
      vi.mocked(createLeaseApiV1LeasesPost).mockResolvedValue({
        data: mockLease,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useCreateLease(), { wrapper })

      result.current.mutate({ tenant_name: 'Tenant A', unit_id: 'unit-1' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.leases.lists(),
      })
    })
  })

  describe('useUpdateLease', () => {
    it('updates lease and refreshes cache', async () => {
      const mockLease = { id: 'lease-1', tenant_name: 'Tenant B' }
      const { updateLeaseApiV1LeasesLeaseIdPut } = await import('./client')
      vi.mocked(updateLeaseApiV1LeasesLeaseIdPut).mockResolvedValue({
        data: mockLease,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useUpdateLease('lease-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ tenant_name: 'Tenant B' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockLease)
    })

    it('uses optimistic update with setQueryData', async () => {
      const mockLease = { id: 'lease-1', tenant_name: 'Tenant B' }
      const { updateLeaseApiV1LeasesLeaseIdPut } = await import('./client')
      vi.mocked(updateLeaseApiV1LeasesLeaseIdPut).mockResolvedValue({
        data: mockLease,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useUpdateLease('lease-1'), {
        wrapper,
      })

      result.current.mutate({ tenant_name: 'Tenant B' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        queryKeys.leases.detail('lease-1'),
        mockLease
      )
    })

    it('invalidates lease lists cache on success', async () => {
      const mockLease = { id: 'lease-1', tenant_name: 'Tenant B' }
      const { updateLeaseApiV1LeasesLeaseIdPut } = await import('./client')
      vi.mocked(updateLeaseApiV1LeasesLeaseIdPut).mockResolvedValue({
        data: mockLease,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useUpdateLease('lease-1'), {
        wrapper,
      })

      result.current.mutate({ tenant_name: 'Tenant B' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.leases.lists(),
      })
    })
  })

  describe('useDeleteLease', () => {
    it('deletes lease and removes from cache', async () => {
      const { deleteLeaseApiV1LeasesLeaseIdDelete } = await import('./client')
      vi.mocked(deleteLeaseApiV1LeasesLeaseIdDelete).mockResolvedValue({
        data: undefined,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useDeleteLease(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('lease-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })
  })

  describe('useUpdateRecoveryProfile', () => {
    it('updates recovery profile and refreshes caches', async () => {
      const mockLease = {
        id: 'lease-1',
        tenant_name: 'Tenant A',
        recovery_profile: { base_year: 2025 },
      }
      const { updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut } =
        await import('./client')
      vi.mocked(
        updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut
      ).mockResolvedValue({
        data: mockLease,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useUpdateRecoveryProfile('lease-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ base_year: 2025 })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockLease)
    })

    it('updates lease detail cache with setQueryData', async () => {
      const mockLease = {
        id: 'lease-1',
        tenant_name: 'Tenant A',
        recovery_profile: { base_year: 2025 },
      }
      const { updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut } =
        await import('./client')
      vi.mocked(
        updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut
      ).mockResolvedValue({
        data: mockLease,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useUpdateRecoveryProfile('lease-1'), {
        wrapper,
      })

      result.current.mutate({ base_year: 2025 })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        queryKeys.leases.detail('lease-1'),
        mockLease
      )
    })

    it('invalidates recovery profile and lease lists caches', async () => {
      const mockLease = {
        id: 'lease-1',
        tenant_name: 'Tenant A',
        recovery_profile: { base_year: 2025 },
      }
      const { updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut } =
        await import('./client')
      vi.mocked(
        updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut
      ).mockResolvedValue({
        data: mockLease,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useUpdateRecoveryProfile('lease-1'), {
        wrapper,
      })

      result.current.mutate({ base_year: 2025 })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      // Should invalidate recovery profile cache
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.leases.recoveryProfile('lease-1'),
      })
      // Should invalidate lease lists cache
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.leases.lists(),
      })
    })
  })

  describe('useFinalizeSnapshot', () => {
    it('finalizes snapshot with correct snapshot_id', async () => {
      const mockResponse = {
        message: 'Snapshot finalized successfully',
        snapshot_id: 'snap-1',
        status: 'finalized',
      }
      const {
        finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost,
      } = await import('./client')
      vi.mocked(
        finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost
      ).mockResolvedValue({
        data: mockResponse,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useFinalizeSnapshot(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('snap-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockResponse)
    })

    it('invalidates snapshot queries on success', async () => {
      const mockResponse = {
        message: 'Snapshot finalized successfully',
        snapshot_id: 'snap-1',
        status: 'finalized',
      }
      const {
        finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost,
      } = await import('./client')
      vi.mocked(
        finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost
      ).mockResolvedValue({
        data: mockResponse,
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useFinalizeSnapshot(), { wrapper })

      result.current.mutate('snap-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.reconciliation.snapshots(),
      })
    })

    it('throws ApiError on failure', async () => {
      const mockError = new Error('Finalization failed')
      const {
        finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost,
      } = await import('./client')
      vi.mocked(
        finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost
      ).mockResolvedValue({
        data: undefined,
        error: mockError,
        response: {} as Response,
      })

      const { result } = renderHook(() => useFinalizeSnapshot(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('snap-1')

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })

    it('returns FinalizeSnapshotResponse type', async () => {
      const mockResponse = {
        message: 'Snapshot finalized successfully',
        snapshot_id: 'snap-1',
        status: 'finalized',
      }
      const {
        finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost,
      } = await import('./client')
      vi.mocked(
        finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost
      ).mockResolvedValue({
        data: mockResponse,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useFinalizeSnapshot(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('snap-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toHaveProperty('message')
      expect(result.current.data).toHaveProperty('snapshot_id')
      expect(result.current.data).toHaveProperty('status')
    })
  })
})

describe('Cell Update Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useUpdateReconciliationCell', () => {
    it('updates a cell and returns ReconciliationCell', async () => {
      const mockResponse = {
        id: 'cell-123',
        snapshot_id: 'snap-456',
        field_name: 'total_recovery',
        value: '1234.56',
        is_manual_override: true,
        updated_at: '2024-01-05T12:00:00Z',
        updated_by: 'user-789',
      }
      const { updateReconciliationCellApiV1ReconciliationCellsCellIdPatch } =
        await import('./client')
      vi.mocked(
        updateReconciliationCellApiV1ReconciliationCellsCellIdPatch
      ).mockResolvedValue({
        data: mockResponse,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useUpdateReconciliationCell(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        cellId: 'cell-123',
        value: { value: '1234.56' },
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockResponse)
    })

    it('handles API errors', async () => {
      const { updateReconciliationCellApiV1ReconciliationCellsCellIdPatch } =
        await import('./client')
      vi.mocked(
        updateReconciliationCellApiV1ReconciliationCellsCellIdPatch
      ).mockResolvedValue({
        data: undefined,
        error: { message: 'Cell update failed' },
        response: {} as Response,
      })

      const { result } = renderHook(() => useUpdateReconciliationCell(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        cellId: 'cell-123',
        value: { value: '1234.56' },
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })
})

describe('Tenant Invitation Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useValidateInvitation', () => {
    it('validates a token and returns InvitationValidationResponse', async () => {
      const mockResponse = {
        valid: true,
        email: 'tenant@example.com',
        lease_id: 'lease-123',
        organization_id: 'org-456',
        expires_at: '2024-01-12T12:00:00Z',
        error_reason: null,
      }
      const { validateInvitationTokenApiV1TenantInvitationsTokenValidateGet } =
        await import('./client')
      vi.mocked(
        validateInvitationTokenApiV1TenantInvitationsTokenValidateGet
      ).mockResolvedValue({
        data: mockResponse,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(
        () => useValidateInvitation('token-abc123'),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockResponse)
    })

    it('handles invalid tokens', async () => {
      const mockResponse = {
        valid: false,
        email: null,
        lease_id: null,
        organization_id: null,
        expires_at: null,
        error_reason: 'expired',
      }
      const { validateInvitationTokenApiV1TenantInvitationsTokenValidateGet } =
        await import('./client')
      vi.mocked(
        validateInvitationTokenApiV1TenantInvitationsTokenValidateGet
      ).mockResolvedValue({
        data: mockResponse,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(
        () => useValidateInvitation('token-expired'),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.valid).toBe(false)
      expect(result.current.data?.error_reason).toBe('expired')
    })

    it('is disabled when token is null', () => {
      const { result } = renderHook(() => useValidateInvitation(null), {
        wrapper: createWrapper(),
      })

      expect(result.current.fetchStatus).toBe('idle')
    })
  })

  describe('useTenantSignup', () => {
    it('completes signup and returns TenantSignupResponse', async () => {
      const mockResponse = {
        success: true,
        user_id: 'user-789',
        access_token: 'access-token-xyz',
        refresh_token: 'refresh-token-xyz',
        tenant_user: {
          id: 'tenant-123',
          user_id: 'user-789',
          organization_id: 'org-456',
          contact_name: 'John Doe',
          contact_email: 'john@example.com',
          created_at: '2024-01-05T12:00:00Z',
        },
      }
      const { tenantSignupApiV1TenantSignupPost } = await import('./client')
      vi.mocked(tenantSignupApiV1TenantSignupPost).mockResolvedValue({
        data: mockResponse,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useTenantSignup(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        token: 'token-abc123',
        password: 'SecurePassword123',
        contact_name: 'John Doe',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockResponse)
      expect(result.current.data?.success).toBe(true)
    })

    it('handles signup errors', async () => {
      const { tenantSignupApiV1TenantSignupPost } = await import('./client')
      vi.mocked(tenantSignupApiV1TenantSignupPost).mockResolvedValue({
        data: undefined,
        error: { message: 'Token expired' },
        response: {} as Response,
      })

      const { result } = renderHook(() => useTenantSignup(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        token: 'token-expired',
        password: 'SecurePassword123',
        contact_name: 'John Doe',
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })
})

describe('Ingestion Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useImportBatches', () => {
    it('fetches import batches successfully without filter', async () => {
      const mockData = {
        batches: [
          {
            id: 'batch-1',
            file_name: 'yardi_gl.csv',
            source_system: 'yardi',
            status: 'completed',
            row_count: 1000,
            error_count: 0,
            created_at: '2024-01-01T00:00:00Z',
            property_id: 'prop-1',
          },
          {
            id: 'batch-2',
            file_name: 'mri_gl.csv',
            source_system: 'mri',
            status: 'completed',
            row_count: 500,
            error_count: 0,
            created_at: '2024-01-02T00:00:00Z',
            property_id: 'prop-2',
          },
        ],
      }
      const { listImportBatchesApiV1IngestionBatchesGet } =
        await import('./client')
      vi.mocked(listImportBatchesApiV1IngestionBatchesGet).mockResolvedValue({
        data: mockData,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useImportBatches(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockData)
      expect(result.current.data?.batches).toHaveLength(2)
    })

    it('returns empty array when API returns no batches', async () => {
      const { listImportBatchesApiV1IngestionBatchesGet } =
        await import('./client')
      vi.mocked(listImportBatchesApiV1IngestionBatchesGet).mockResolvedValue({
        data: { batches: [] },
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useImportBatches(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.batches).toEqual([])
    })

    it('reads only the batches key and ignores a stray imports key', async () => {
      // The real backend (list_import_batches) always returns
      // BatchListResponse = { batches }. The hook must read `batches`
      // directly and must not conflate it with the unrelated
      // ImportListResponse `imports` shape, even if both appear.
      const { listImportBatchesApiV1IngestionBatchesGet } =
        await import('./client')
      vi.mocked(listImportBatchesApiV1IngestionBatchesGet).mockResolvedValue({
        data: {
          imports: [{ id: 'import-current', filename: 'current.csv' }],
          batches: [{ id: 'batch-legacy', file_name: 'legacy.csv' }],
        } as any,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useImportBatches(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.batches).toEqual([
        { id: 'batch-legacy', file_name: 'legacy.csv' },
      ])
    })

    it('returns loading state initially', async () => {
      const { listImportBatchesApiV1IngestionBatchesGet } =
        await import('./client')
      vi.mocked(listImportBatchesApiV1IngestionBatchesGet).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: { batches: [] },
                  error: undefined,
                  response: {} as Response,
                }),
              100
            )
          )
      )

      const { result } = renderHook(() => useImportBatches(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toBeUndefined()
    })

    it('returns success state with data', async () => {
      const mockData = { batches: [{ id: 'batch-1', file_name: 'test.csv' }] }
      const { listImportBatchesApiV1IngestionBatchesGet } =
        await import('./client')
      vi.mocked(listImportBatchesApiV1IngestionBatchesGet).mockResolvedValue({
        data: mockData,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useImportBatches(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(false)
      expect(result.current.data).toEqual(mockData)
    })

    it('caches results for 5 minutes (staleTime)', async () => {
      const mockData = { batches: [] }
      const { listImportBatchesApiV1IngestionBatchesGet } =
        await import('./client')
      const mockFn = vi
        .mocked(listImportBatchesApiV1IngestionBatchesGet)
        .mockResolvedValue({
          data: mockData,
          error: undefined,
          response: {} as Response,
        })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result, rerender } = renderHook(() => useImportBatches(), {
        wrapper,
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockFn).toHaveBeenCalledTimes(1)

      // Rerender should not refetch due to staleTime
      rerender()
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('returns error state when API throws error', async () => {
      const { listImportBatchesApiV1IngestionBatchesGet } =
        await import('./client')
      vi.mocked(listImportBatchesApiV1IngestionBatchesGet).mockResolvedValue({
        data: undefined,
        error: { message: 'Failed to fetch batches' },
        response: {} as Response,
      })

      const { result } = renderHook(() => useImportBatches(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
      expect(result.current.data).toBeUndefined()
    })

    it('handles null/undefined data from API', async () => {
      const { listImportBatchesApiV1IngestionBatchesGet } =
        await import('./client')
      vi.mocked(listImportBatchesApiV1IngestionBatchesGet).mockResolvedValue({
        data: null as any,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useImportBatches(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.batches).toEqual([])
    })

    // Note: property_id filtering tests removed
    // Backend does not yet support filtering by property_id
  })

  describe('usePropertyImports', () => {
    it('fetches property imports successfully', async () => {
      const mockData = {
        imports: [
          {
            id: 'batch-1',
            filename: 'yardi_gl.csv',
            parser_type: 'yardi',
            status: 'completed',
            rows_processed: 1000,
            rows_imported: 1000,
            rows_failed: 0,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      }
      const { listPropertyImportsApiV1PropertiesPropertyIdImportsGet } =
        await import('./client')
      vi.mocked(
        listPropertyImportsApiV1PropertiesPropertyIdImportsGet
      ).mockResolvedValue({
        data: mockData,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(
        () => usePropertyImports('prop-1', { page: 1, size: 10 }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockData)
    })

    it('supports legacy batches fallback for property imports', async () => {
      const { listPropertyImportsApiV1PropertiesPropertyIdImportsGet } =
        await import('./client')
      vi.mocked(
        listPropertyImportsApiV1PropertiesPropertyIdImportsGet
      ).mockResolvedValue({
        data: {
          batches: [
            {
              id: 'legacy-batch',
              filename: 'legacy.csv',
              parser_type: 'yardi',
              status: 'completed',
              rows_processed: 25,
              rows_imported: 25,
              rows_failed: 0,
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
        } as any,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => usePropertyImports('prop-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual({
        imports: [
          {
            id: 'legacy-batch',
            filename: 'legacy.csv',
            parser_type: 'yardi',
            status: 'completed',
            rows_processed: 25,
            rows_imported: 25,
            rows_failed: 0,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      })
    })

    it('returns empty default response when API returns no data', async () => {
      const { listPropertyImportsApiV1PropertiesPropertyIdImportsGet } =
        await import('./client')
      vi.mocked(
        listPropertyImportsApiV1PropertiesPropertyIdImportsGet
      ).mockResolvedValue({
        data: undefined,
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => usePropertyImports('prop-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual({ imports: [], total: 0 })
    })
  })

  describe('pool template mutations', () => {
    it('passes apiClient and invalidates canonical expense pools key when applying template', async () => {
      const { applyTemplateApiV1PoolTemplatesApplyPost, apiClient } =
        await import('./client')
      vi.mocked(applyTemplateApiV1PoolTemplatesApplyPost).mockResolvedValue({
        data: { pools_created: 2 },
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useApplyPoolTemplate(), { wrapper })

      result.current.mutate({
        template_id: 'template-1',
        property_id: 'prop-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(applyTemplateApiV1PoolTemplatesApplyPost).toHaveBeenCalledWith({
        client: apiClient,
        body: { template_id: 'template-1', property_id: 'prop-1' },
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.expensePools.byProperty('prop-1'),
      })
    })

    it('passes apiClient and invalidates target property pools when copying pools', async () => {
      const { copyPoolsApiV1PoolTemplatesCopyPost, apiClient } =
        await import('./client')
      vi.mocked(copyPoolsApiV1PoolTemplatesCopyPost).mockResolvedValue({
        data: {
          pools_copied: 1,
          parent_pools_copied: 1,
          child_pools_copied: 0,
        },
        error: undefined,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        )

      const { result } = renderHook(() => useCopyExpensePools(), { wrapper })

      result.current.mutate({
        source_property_id: 'source-prop',
        target_property_id: 'target-prop',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(copyPoolsApiV1PoolTemplatesCopyPost).toHaveBeenCalledWith({
        client: apiClient,
        body: {
          source_property_id: 'source-prop',
          target_property_id: 'target-prop',
        },
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.expensePools.byProperty('target-prop'),
      })
    })
  })

  describe('campaign hooks', () => {
    it('passes apiClient when listing campaigns', async () => {
      const { listCampaignsApiV1CampaignsGet, apiClient } =
        await import('./client')
      vi.mocked(listCampaignsApiV1CampaignsGet).mockResolvedValue({
        data: [],
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useCampaigns({ year: 2026 }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(listCampaignsApiV1CampaignsGet).toHaveBeenCalledWith({
        client: apiClient,
        query: { year: 2026 },
      })
    })

    it('passes apiClient when transitioning campaigns', async () => {
      const {
        submitForReviewApiV1CampaignsCampaignIdSubmitForReviewPost,
        apiClient,
      } = await import('./client')
      vi.mocked(
        submitForReviewApiV1CampaignsCampaignIdSubmitForReviewPost
      ).mockResolvedValue({
        data: { id: 'campaign-1', status: 'in_review' },
        error: undefined,
        response: {} as Response,
      })

      const { result } = renderHook(() => useSubmitForReview(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('campaign-1')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(
        submitForReviewApiV1CampaignsCampaignIdSubmitForReviewPost
      ).toHaveBeenCalledWith({
        client: apiClient,
        path: { campaign_id: 'campaign-1' },
      })
    })
  })

  describe('normalizeDenominatorChangeReport', () => {
    // The backend models these fields as Decimal; Pydantic v2 serializes
    // Decimal to JSON *strings*. The panel calls .toFixed()/arithmetic on
    // them, so leaving them as strings throws "toFixed is not a function" and
    // drops the whole reconciliation screen into the error boundary. The hook
    // coerces them back to numbers before the component sees them.
    const rawReport = {
      property_id: 'prop-1',
      property_name: 'Downtown Tower',
      prior_period: '2023',
      current_period: '2024',
      prior_total_rsf: '150000.00',
      current_total_rsf: '161290.32',
      rsf_delta: '11290.32',
      rsf_delta_percent: '7.53',
      changes: [],
      tenant_impacts: [
        {
          lease_id: 'lease-1',
          tenant_name: 'Acme Co',
          prior_pro_rata_share: '0.0600014',
          current_pro_rata_share: '0.0558000',
          share_delta_pct_points: '-0.42',
          prior_estimated_recovery: '7613.08',
          current_estimated_recovery: '9000.00',
          recovery_delta: '1386.92',
          contributing_changes: ['rsf_remeasurement'],
        },
      ],
      summary: '3 denominator changes detected.',
      generated_at: '2026-06-11T00:00:00Z',
      comparison_available: true,
    } as unknown as DenominatorChangeReport

    it('coerces string-serialized Decimal fields into real numbers', () => {
      const report = normalizeDenominatorChangeReport(rawReport)

      expect(report.rsf_delta).toBe(11290.32)
      expect(report.rsf_delta_percent).toBe(7.53)
      expect(report.prior_total_rsf).toBe(150000)
      expect(report.current_total_rsf).toBe(161290.32)
      // The values the panel actually formats must survive .toFixed().
      expect(report.rsf_delta_percent.toFixed(2)).toBe('7.53')

      const impact = report.tenant_impacts[0]
      expect(impact.prior_pro_rata_share).toBeCloseTo(0.0600014)
      expect(impact.current_estimated_recovery).toBe(9000)
      expect(impact.recovery_delta).toBe(1386.92)
      expect(impact.current_pro_rata_share.toFixed(4)).toBe('0.0558')
    })

    it('falls back to 0 for missing or non-numeric values', () => {
      const report = normalizeDenominatorChangeReport({
        ...rawReport,
        rsf_delta: undefined,
        rsf_delta_percent: 'not-a-number',
        tenant_impacts: [],
      } as unknown as DenominatorChangeReport)

      expect(report.rsf_delta).toBe(0)
      expect(report.rsf_delta_percent).toBe(0)
      expect(report.tenant_impacts).toEqual([])
    })

    it('tolerates an absent tenant_impacts array', () => {
      const report = normalizeDenominatorChangeReport({
        ...rawReport,
        tenant_impacts: undefined,
      } as unknown as DenominatorChangeReport)

      expect(report.tenant_impacts).toEqual([])
    })
  })
})
