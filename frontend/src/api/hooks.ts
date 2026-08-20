/**
 * React Query Hooks for API Operations
 *
 * Provides typed hooks for CRUD operations on API resources.
 * Uses React Query for caching, automatic refetching, and optimistic updates.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { logger } from '@/lib/logger'

import type {
  LeaseTermVersion,
  LeaseTermVersionCreate,
  LeaseTermVersionSummary,
} from '@/types/lease-term-version'
import type {
  PoolAllocation,
  PoolAllocationCreate,
  PoolAllocationListResponse,
} from '@/types/pool-allocation'
import {
  apiClient,
  ApiError,
  getSession,
  // Types
  type Property,
  type PropertyCreate,
  type PropertyUpdate,
  type PropertyListResponse,
  type Unit,
  type UnitCreateRequest,
  type UnitUpdate,
  type UnitListResponse,
  type Lease,
  type LeaseCreate,
  type LeaseUpdate,
  type LeaseListResponse,
  type LeaseRecoveryProfile_Output,
  type LeaseRecoveryProfile_Input,
  type ReconciliationSnapshot,
  type PaginatedResponse_ReconciliationSnapshotSummary_,
  type CalculationJobCreate,
  type CalculationJobResponse,
  type CalculationJobStatusResponse,
  type BatchFinalizeRequest,
  type BatchFinalizeResponse,
  type FinalizeSnapshotResponse,
  type ReconciliationCell,
  type ReconciliationCellUpdate,
  type InvitationValidationResponse,
  type TenantSignupRequest,
  type TenantSignupResponse,
  type BatchListResponse,
  type ImportBatchSummary,
  type ImportListResponse,
  type DisputeSummaryDTO,
  type DisputeDetailDTO,
  type DisputeStatus,
  type UpdateStatusRequest,
  type AddCommentRequest,
  type DisputeCommentDTO,
  type ExpensePool,
  type ExpensePoolCreateRequest,
  type ExpensePoolUpdate,
  type ExpensePoolListResponse,
  type PoolMapping,
  type PoolMappingCreateRequest,
  type PoolMappingUpdate,
  type PoolMappingListResponse,
  type ApplyTemplateRequest,
  type PoolCopyRequest,
  type PoolCopyResult,
  type PoolTemplate,
  type PoolTemplateCreate,
  type PoolTemplateList,
  type PoolTemplateUpdate,
  // SDK functions
  listPropertiesApiV1PropertiesGet,
  createPropertyApiV1PropertiesPost,
  getPropertyApiV1PropertiesPropertyIdGet,
  updatePropertyApiV1PropertiesPropertyIdPut,
  deletePropertyApiV1PropertiesPropertyIdDelete,
  listPropertyImportsApiV1PropertiesPropertyIdImportsGet,
  listImportBatchesApiV1IngestionBatchesGet,
  listUnitsApiV1PropertiesPropertyIdUnitsGet,
  createUnitApiV1PropertiesPropertyIdUnitsPost,
  getUnitApiV1PropertiesPropertyIdUnitsUnitIdGet,
  updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut,
  deleteUnitApiV1PropertiesPropertyIdUnitsUnitIdDelete,
  listLeasesApiV1LeasesGet,
  createLeaseApiV1LeasesPost,
  getLeaseApiV1LeasesLeaseIdGet,
  updateLeaseApiV1LeasesLeaseIdPut,
  deleteLeaseApiV1LeasesLeaseIdDelete,
  getRecoveryProfileApiV1LeasesLeaseIdRecoveryProfileGet,
  updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut,
  calculateReconciliationApiV1ReconciliationCalculatePost,
  getJobStatusApiV1ReconciliationJobsJobIdGet,
  getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet,
  listSnapshotsApiV1ReconciliationSnapshotsGet,
  finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost,
  finalizeSnapshotsBatchApiV1ReconciliationSnapshotsFinalizeBatchPost,
  updateReconciliationCellApiV1ReconciliationCellsCellIdPatch,
  validateInvitationTokenApiV1TenantInvitationsTokenValidateGet,
  tenantSignupApiV1TenantSignupPost,
  listOrganizationDisputesApiV1DisputesGet,
  getDisputeApiV1DisputesDisputeIdGet,
  updateDisputeStatusApiV1DisputesDisputeIdStatusPut,
  addAdminCommentApiV1DisputesDisputeIdCommentsPost,
  listExpensePoolsApiV1PropertiesPropertyIdExpensePoolsGet,
  createExpensePoolApiV1PropertiesPropertyIdExpensePoolsPost,
  getExpensePoolApiV1PropertiesPropertyIdExpensePoolsPoolIdGet,
  updateExpensePoolApiV1PropertiesPropertyIdExpensePoolsPoolIdPut,
  deleteExpensePoolApiV1PropertiesPropertyIdExpensePoolsPoolIdDelete,
  listPoolMappingsApiV1PropertiesPropertyIdPoolMappingsGet,
  createPoolMappingApiV1PropertiesPropertyIdPoolMappingsPost,
  updatePoolMappingApiV1PropertiesPropertyIdPoolMappingsMappingIdPut,
  deletePoolMappingApiV1PropertiesPropertyIdPoolMappingsMappingIdDelete,
  listTemplatesApiV1PoolTemplatesGet,
  createTemplateApiV1PoolTemplatesPost,
  getTemplateApiV1PoolTemplatesTemplateIdGet,
  updateTemplateApiV1PoolTemplatesTemplateIdPut,
  deleteTemplateApiV1PoolTemplatesTemplateIdDelete,
  applyTemplateApiV1PoolTemplatesApplyPost,
  copyPoolsApiV1PoolTemplatesCopyPost,
  listCampaignsApiV1CampaignsGet,
  submitForReviewApiV1CampaignsCampaignIdSubmitForReviewPost,
  approveCampaignApiV1CampaignsCampaignIdApprovePost,
  rejectCampaignApiV1CampaignsCampaignIdRejectPost,
  markSentApiV1CampaignsCampaignIdMarkSentPost,
} from './client'
import { resolveApiUrl } from './url'
import type { ValidationErrorDetail } from './errors'

// ============================================================
// Query Key Factory
// ============================================================
// Provides consistent cache keys for React Query.
// Uses a hierarchical structure for efficient cache invalidation.

export const queryKeys = {
  properties: {
    all: ['properties'] as const,
    lists: () => [...queryKeys.properties.all, 'list'] as const,
    list: (filters: { skip?: number; limit?: number }) =>
      [...queryKeys.properties.lists(), filters] as const,
    details: () => [...queryKeys.properties.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.properties.details(), id] as const,
  },
  units: {
    all: ['units'] as const,
    byProperty: (propertyId: string) =>
      [...queryKeys.units.all, 'byProperty', propertyId] as const,
    list: (propertyId: string, filters: { skip?: number; limit?: number }) =>
      [...queryKeys.units.byProperty(propertyId), 'list', filters] as const,
    details: () => [...queryKeys.units.all, 'detail'] as const,
    detail: (propertyId: string, unitId: string) =>
      [...queryKeys.units.details(), propertyId, unitId] as const,
  },
  leases: {
    all: ['leases'] as const,
    lists: () => [...queryKeys.leases.all, 'list'] as const,
    list: (filters: { skip?: number; limit?: number; property_id?: string }) =>
      [...queryKeys.leases.lists(), filters] as const,
    details: () => [...queryKeys.leases.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.leases.details(), id] as const,
    recoveryProfile: (leaseId: string) =>
      [...queryKeys.leases.detail(leaseId), 'recoveryProfile'] as const,
    termVersions: (leaseId: string) =>
      [...queryKeys.leases.detail(leaseId), 'termVersions'] as const,
    termVersion: (leaseId: string, versionId: string) =>
      [...queryKeys.leases.termVersions(leaseId), versionId] as const,
  },
  reconciliation: {
    all: ['reconciliation'] as const,
    snapshots: () => [...queryKeys.reconciliation.all, 'snapshots'] as const,
    snapshotsList: (filters: {
      property_id?: string
      lease_id?: string
      period_start?: string
      period_end?: string
      is_finalized?: boolean
      page?: number
      size?: number
    }) => [...queryKeys.reconciliation.snapshots(), 'list', filters] as const,
    snapshotDetail: (snapshotId: string, includeTrace?: boolean) =>
      [
        ...queryKeys.reconciliation.snapshots(),
        'detail',
        snapshotId,
        includeTrace,
      ] as const,
    jobs: () => [...queryKeys.reconciliation.all, 'jobs'] as const,
    job: (jobId: string) =>
      [...queryKeys.reconciliation.jobs(), jobId] as const,
    cells: () => [...queryKeys.reconciliation.all, 'cells'] as const,
    cell: (cellId: string) =>
      [...queryKeys.reconciliation.cells(), cellId] as const,
    capBankLedger: (leaseId: string) =>
      [...queryKeys.reconciliation.all, 'capBankLedger', leaseId] as const,
  },
  tenant: {
    all: ['tenant'] as const,
    invitations: () => [...queryKeys.tenant.all, 'invitations'] as const,
    invitation: (token: string) =>
      [...queryKeys.tenant.invitations(), token] as const,
  },
  ingestion: {
    all: ['ingestion'] as const,
    batches: () => [...queryKeys.ingestion.all, 'batches'] as const,
    batchesList: () => [...queryKeys.ingestion.batches(), 'list'] as const,
    propertyImports: (propertyId: string, page: number, size: number) =>
      [
        ...queryKeys.ingestion.all,
        'property-imports',
        propertyId,
        page,
        size,
      ] as const,
  },
  disputes: {
    all: ['disputes'] as const,
    lists: () => [...queryKeys.disputes.all, 'list'] as const,
    list: (filters: {
      status?: DisputeStatus
      skip?: number
      limit?: number
    }) => [...queryKeys.disputes.lists(), filters] as const,
    details: () => [...queryKeys.disputes.all, 'detail'] as const,
    detail: (disputeId: string) =>
      [...queryKeys.disputes.details(), disputeId] as const,
  },
  expensePools: {
    all: ['expense-pools'] as const,
    byProperty: (propertyId: string) =>
      [...queryKeys.expensePools.all, 'byProperty', propertyId] as const,
    list: (
      propertyId: string,
      filters: { includeChildren?: boolean; skip?: number; limit?: number }
    ) =>
      [
        ...queryKeys.expensePools.byProperty(propertyId),
        'list',
        filters,
      ] as const,
    details: () => [...queryKeys.expensePools.all, 'detail'] as const,
    detail: (propertyId: string, poolId: string) =>
      [...queryKeys.expensePools.details(), propertyId, poolId] as const,
  },
  poolMappings: {
    all: ['pool-mappings'] as const,
    byProperty: (propertyId: string) =>
      [...queryKeys.poolMappings.all, 'byProperty', propertyId] as const,
    list: (
      propertyId: string,
      filters: { poolId?: string; skip?: number; limit?: number }
    ) =>
      [
        ...queryKeys.poolMappings.byProperty(propertyId),
        'list',
        filters,
      ] as const,
  },
  poolAllocations: {
    all: ['pool-allocations'] as const,
    byProperty: (propertyId: string) =>
      [...queryKeys.poolAllocations.all, 'byProperty', propertyId] as const,
    list: (
      propertyId: string,
      filters: { sourcePoolId?: string; skip?: number; limit?: number }
    ) =>
      [
        ...queryKeys.poolAllocations.byProperty(propertyId),
        'list',
        filters,
      ] as const,
  },
  poolTemplates: {
    all: ['pool-templates'] as const,
    lists: () => [...queryKeys.poolTemplates.all, 'list'] as const,
    list: (filters: { propertyType?: string } = {}) =>
      [...queryKeys.poolTemplates.lists(), filters] as const,
    details: () => [...queryKeys.poolTemplates.all, 'detail'] as const,
    detail: (templateId: string) =>
      [...queryKeys.poolTemplates.details(), templateId] as const,
  },
  campaigns: {
    all: ['campaigns'] as const,
    lists: () => [...queryKeys.campaigns.all, 'list'] as const,
    list: (filters: { year?: number }) =>
      [...queryKeys.campaigns.lists(), filters] as const,
  },
}

// ============================================================
// Property Hooks
// ============================================================

/**
 * Fetch paginated list of properties
 */
export function useProperties(
  options: { skip?: number; limit?: number } = {},
  queryOptions?: Omit<
    UseQueryOptions<PropertyListResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.properties.list(options),
    queryFn: async () => {
      const response = await listPropertiesApiV1PropertiesGet({
        client: apiClient,
        query: options,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PropertyListResponse
    },
    ...queryOptions,
  })
}

/**
 * Fetch a single property by ID
 */
export function useProperty(
  propertyId: string,
  queryOptions?: Omit<
    UseQueryOptions<Property, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.properties.detail(propertyId),
    queryFn: async () => {
      const response = await getPropertyApiV1PropertiesPropertyIdGet({
        client: apiClient,
        path: { property_id: propertyId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Property
    },
    enabled: !!propertyId,
    ...queryOptions,
  })
}

/**
 * Create a new property
 */
export function useCreateProperty(
  mutationOptions?: Omit<
    UseMutationOptions<Property, ApiError, PropertyCreate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: PropertyCreate) => {
      const response = await createPropertyApiV1PropertiesPost({
        client: apiClient,
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Property
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.properties.lists(),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

/**
 * Update an existing property
 */
export function useUpdateProperty(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<Property, ApiError, PropertyUpdate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: PropertyUpdate) => {
      const response = await updatePropertyApiV1PropertiesPropertyIdPut({
        client: apiClient,
        path: { property_id: propertyId },
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Property
    },
    ...mutationOptions,
    onSuccess: (updatedProperty, variables, onMutateResult, context) => {
      queryClient.setQueryData(
        queryKeys.properties.detail(propertyId),
        updatedProperty
      )
      queryClient.invalidateQueries({
        queryKey: queryKeys.properties.lists(),
      })
      mutationOptions?.onSuccess?.(
        updatedProperty,
        variables,
        onMutateResult,
        context
      )
    },
  })
}

/**
 * Delete a property
 */
export function useDeleteProperty(
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (propertyId: string) => {
      const response = await deletePropertyApiV1PropertiesPropertyIdDelete({
        client: apiClient,
        path: { property_id: propertyId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
    },
    ...mutationOptions,
    onSuccess: (data, propertyId, onMutateResult, context) => {
      queryClient.removeQueries({
        queryKey: queryKeys.properties.detail(propertyId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.properties.lists(),
      })
      mutationOptions?.onSuccess?.(data, propertyId, onMutateResult, context)
    },
  })
}

// ============================================================
// Unit Hooks
// ============================================================

/**
 * Fetch units for a property
 */
export function useUnits(
  propertyId: string,
  options: { skip?: number; limit?: number } = {},
  queryOptions?: Omit<
    UseQueryOptions<UnitListResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.units.list(propertyId, options),
    queryFn: async () => {
      const response = await listUnitsApiV1PropertiesPropertyIdUnitsGet({
        client: apiClient,
        path: { property_id: propertyId },
        query: options,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as UnitListResponse
    },
    enabled: !!propertyId,
    ...queryOptions,
  })
}

/**
 * Fetch a single unit
 */
export function useUnit(
  propertyId: string,
  unitId: string,
  queryOptions?: Omit<UseQueryOptions<Unit, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.units.detail(propertyId, unitId),
    queryFn: async () => {
      const response = await getUnitApiV1PropertiesPropertyIdUnitsUnitIdGet({
        client: apiClient,
        path: { property_id: propertyId, unit_id: unitId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Unit
    },
    enabled: !!propertyId && !!unitId,
    ...queryOptions,
  })
}

/**
 * Create a new unit
 */
export function useCreateUnit(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<Unit, ApiError, UnitCreateRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UnitCreateRequest) => {
      const response = await createUnitApiV1PropertiesPropertyIdUnitsPost({
        client: apiClient,
        path: { property_id: propertyId },
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Unit
    },
    ...mutationOptions,
    onSuccess: (data, variables, context, mutation) => {
      // Always invalidate queries first (critical for table refresh)
      queryClient.invalidateQueries({
        queryKey: queryKeys.units.byProperty(propertyId),
      })
      // Then call component's onSuccess if provided
      mutationOptions?.onSuccess?.(data, variables, context, mutation)
    },
  })
}

/**
 * Update an existing unit
 */
export function useUpdateUnit(
  propertyId: string,
  unitId: string,
  mutationOptions?: Omit<
    UseMutationOptions<Unit, ApiError, UnitUpdate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UnitUpdate) => {
      const response = await updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut({
        client: apiClient,
        path: { property_id: propertyId, unit_id: unitId },
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Unit
    },
    ...mutationOptions,
    onSuccess: (updatedUnit, variables, onMutateResult, context) => {
      queryClient.setQueryData(
        queryKeys.units.detail(propertyId, unitId),
        updatedUnit
      )
      queryClient.invalidateQueries({
        queryKey: queryKeys.units.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(
        updatedUnit,
        variables,
        onMutateResult,
        context
      )
    },
  })
}

/**
 * Delete a unit
 */
export function useDeleteUnit(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (unitId: string) => {
      const response =
        await deleteUnitApiV1PropertiesPropertyIdUnitsUnitIdDelete({
          client: apiClient,
          path: { property_id: propertyId, unit_id: unitId },
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
    },
    ...mutationOptions,
    onSuccess: (data, unitId, onMutateResult, context) => {
      queryClient.removeQueries({
        queryKey: queryKeys.units.detail(propertyId, unitId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.units.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(data, unitId, onMutateResult, context)
    },
  })
}

// ============================================================
// Lease Hooks
// ============================================================

/**
 * Fetch paginated list of leases
 */
export function useLeases(
  options: {
    skip?: number
    limit?: number
    property_id?: string
    status?: string
  } = {},
  queryOptions?: Omit<
    UseQueryOptions<LeaseListResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.leases.list(options),
    queryFn: async () => {
      const response = await listLeasesApiV1LeasesGet({
        client: apiClient,
        query: options,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as LeaseListResponse
    },
    ...queryOptions,
  })
}

/**
 * Fetch a single lease by ID
 */
export function useLease(
  leaseId: string,
  queryOptions?: Omit<UseQueryOptions<Lease, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.leases.detail(leaseId),
    queryFn: async () => {
      const response = await getLeaseApiV1LeasesLeaseIdGet({
        client: apiClient,
        path: { lease_id: leaseId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Lease
    },
    enabled: !!leaseId,
    ...queryOptions,
  })
}

/**
 * Create a new lease
 */
export function useCreateLease(
  mutationOptions?: Omit<
    UseMutationOptions<Lease, ApiError, LeaseCreate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: LeaseCreate) => {
      const response = await createLeaseApiV1LeasesPost({
        client: apiClient,
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Lease
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.leases.lists(),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

/**
 * Update an existing lease
 */
export function useUpdateLease(
  leaseId: string,
  mutationOptions?: Omit<
    UseMutationOptions<Lease, ApiError, LeaseUpdate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: LeaseUpdate) => {
      const response = await updateLeaseApiV1LeasesLeaseIdPut({
        client: apiClient,
        path: { lease_id: leaseId },
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Lease
    },
    ...mutationOptions,
    onSuccess: (updatedLease, variables, onMutateResult, context) => {
      queryClient.setQueryData(queryKeys.leases.detail(leaseId), updatedLease)
      queryClient.invalidateQueries({
        queryKey: queryKeys.leases.lists(),
      })
      mutationOptions?.onSuccess?.(
        updatedLease,
        variables,
        onMutateResult,
        context
      )
    },
  })
}

/**
 * Delete a lease
 */
export function useDeleteLease(
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (leaseId: string) => {
      const response = await deleteLeaseApiV1LeasesLeaseIdDelete({
        client: apiClient,
        path: { lease_id: leaseId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
    },
    ...mutationOptions,
    onSuccess: (data, leaseId, onMutateResult, context) => {
      queryClient.removeQueries({
        queryKey: queryKeys.leases.detail(leaseId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.leases.lists(),
      })
      mutationOptions?.onSuccess?.(data, leaseId, onMutateResult, context)
    },
  })
}

/**
 * Fetch recovery profile for a lease
 */
export function useRecoveryProfile(
  leaseId: string,
  queryOptions?: Omit<
    UseQueryOptions<LeaseRecoveryProfile_Output, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.leases.recoveryProfile(leaseId),
    queryFn: async () => {
      const response =
        await getRecoveryProfileApiV1LeasesLeaseIdRecoveryProfileGet({
          client: apiClient,
          path: { lease_id: leaseId },
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as LeaseRecoveryProfile_Output
    },
    enabled: !!leaseId,
    ...queryOptions,
  })
}

/**
 * Update recovery profile for a lease.
 * Note: The API returns the full Lease object with the updated profile.
 */
export function useUpdateRecoveryProfile(
  leaseId: string,
  mutationOptions?: Omit<
    UseMutationOptions<Lease, ApiError, LeaseRecoveryProfile_Input>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: LeaseRecoveryProfile_Input) => {
      const response =
        await updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut({
          client: apiClient,
          path: { lease_id: leaseId },
          body: data,
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Lease
    },
    ...mutationOptions,
    onSuccess: (updatedLease, variables, onMutateResult, context) => {
      // Update the lease detail cache
      queryClient.setQueryData(queryKeys.leases.detail(leaseId), updatedLease)
      // Invalidate the recovery profile cache to refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.leases.recoveryProfile(leaseId),
      })
      // Invalidate lists in case recovery profile affects displayed data
      queryClient.invalidateQueries({
        queryKey: queryKeys.leases.lists(),
      })
      mutationOptions?.onSuccess?.(
        updatedLease,
        variables,
        onMutateResult,
        context
      )
    },
  })
}

// ============================================================
// Lease Term Version Hooks
// ============================================================

/**
 * Fetch all term versions for a lease (newest first)
 */
export function useLeaseTermVersions(
  leaseId: string,
  queryOptions?: Omit<
    UseQueryOptions<LeaseTermVersionSummary[], ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.leases.termVersions(leaseId),
    queryFn: async () => {
      const response = await apiClient.get<LeaseTermVersionSummary[]>({
        url: '/api/v1/leases/{lease_id}/term-versions',
        path: { lease_id: leaseId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as LeaseTermVersionSummary[]
    },
    enabled: !!leaseId,
    ...queryOptions,
  })
}

/**
 * Fetch a specific term version
 */
export function useLeaseTermVersion(
  leaseId: string,
  versionId: string,
  queryOptions?: Omit<
    UseQueryOptions<LeaseTermVersion, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.leases.termVersion(leaseId, versionId),
    queryFn: async () => {
      const response = await apiClient.get<LeaseTermVersion>({
        url: '/api/v1/leases/{lease_id}/term-versions/{version_id}',
        path: { lease_id: leaseId, version_id: versionId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as LeaseTermVersion
    },
    enabled: !!leaseId && !!versionId,
    ...queryOptions,
  })
}

/**
 * Create a new term version (amendment)
 */
export function useCreateTermVersion(
  leaseId: string,
  mutationOptions?: Omit<
    UseMutationOptions<LeaseTermVersion, ApiError, LeaseTermVersionCreate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: LeaseTermVersionCreate) => {
      const response = await apiClient.post<LeaseTermVersion>({
        url: '/api/v1/leases/{lease_id}/term-versions',
        path: { lease_id: leaseId },
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as LeaseTermVersion
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.leases.termVersions(leaseId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.leases.recoveryProfile(leaseId),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

/**
 * Delete a term version (admin only, blocked if finalized snapshots reference it)
 */
export function useDeleteTermVersion(
  leaseId: string,
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (versionId: string) => {
      const response = await apiClient.delete<void>({
        url: '/api/v1/leases/{lease_id}/term-versions/{version_id}',
        path: { lease_id: leaseId, version_id: versionId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.leases.termVersions(leaseId),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

// ============================================================
// Ingestion Hooks
// ============================================================

/**
 * Fetch list of import batches for the organization
 *
 * Note: Backend does not yet support filtering by property_id
 *
 * @param queryOptions - React Query options
 * @returns Query result with batches list
 */
export function useImportBatches(
  queryOptions?: Omit<
    UseQueryOptions<{ batches: ImportBatchSummary[] }, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.ingestion.batchesList(),
    queryFn: async () => {
      const { data, error } = await listImportBatchesApiV1IngestionBatchesGet({
        client: apiClient,
      })
      if (error) throw error

      const response = data as BatchListResponse | undefined
      return { batches: (response?.batches ?? []) as ImportBatchSummary[] }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    ...queryOptions,
  })
}

/**
 * Fetch list of import batches for a specific property.
 */
export function usePropertyImports(
  propertyId: string,
  params: { page?: number; size?: number } = {},
  queryOptions?: Omit<
    UseQueryOptions<ImportListResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  const page = params.page ?? 1
  const size = params.size ?? 20

  return useQuery({
    queryKey: queryKeys.ingestion.propertyImports(propertyId, page, size),
    queryFn: async () => {
      const { data, error } =
        await listPropertyImportsApiV1PropertiesPropertyIdImportsGet({
          client: apiClient,
          path: { property_id: propertyId },
          query: { page, size },
        })
      if (error) throw error
      const response = data as
        | (ImportListResponse & { batches?: ImportBatchSummary[] })
        | undefined
      const imports = response?.imports ?? response?.batches ?? []
      const total = response?.total ?? imports.length
      return { imports, total } as ImportListResponse
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
    ...queryOptions,
  })
}

// ============================================================
// Reconciliation Hooks
// ============================================================

/**
 * Fetch paginated list of reconciliation snapshots with filters
 */
export function useReconciliationSnapshots(
  filters: {
    property_id?: string
    lease_id?: string
    period_start?: string
    period_end?: string
    is_finalized?: boolean
    page?: number
    size?: number
  } = {},
  queryOptions?: Omit<
    UseQueryOptions<PaginatedResponse_ReconciliationSnapshotSummary_, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.reconciliation.snapshotsList(filters),
    queryFn: async () => {
      const response = await listSnapshotsApiV1ReconciliationSnapshotsGet({
        client: apiClient,
        query: filters,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PaginatedResponse_ReconciliationSnapshotSummary_
    },
    ...queryOptions,
  })
}

/**
 * Fetch ALL reconciliation snapshots matching the filters, across every page.
 *
 * The backend caps `size` at 100 (`le=100`), so a single request silently
 * truncates the result for properties with more than 100 leases, which would
 * corrupt the reconciliation grid, totals, finalized status, and exports. This
 * hook walks every page (page=1,2,… size=100) until `has_next` is false and
 * returns a single aggregate response containing the full item set, so callers
 * never have to paginate. A safety bound caps the walk at MAX_PAGES (10,000
 * snapshots) to guarantee termination if the backend ever misreports has_next.
 */
export function useAllReconciliationSnapshots(
  filters: {
    property_id?: string
    lease_id?: string
    period_start?: string
    period_end?: string
    is_finalized?: boolean
  } = {},
  queryOptions?: Omit<
    UseQueryOptions<PaginatedResponse_ReconciliationSnapshotSummary_, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: [
      ...queryKeys.reconciliation.snapshotsList(filters),
      'all-pages',
    ] as const,
    queryFn: async () => {
      const PAGE_SIZE = 100
      const MAX_PAGES = 100 // hard cap: 10,000 snapshots
      const items: PaginatedResponse_ReconciliationSnapshotSummary_['items'] =
        []
      let total = 0
      let page = 1

      while (page <= MAX_PAGES) {
        const response = await listSnapshotsApiV1ReconciliationSnapshotsGet({
          client: apiClient,
          query: { ...filters, page, size: PAGE_SIZE },
        })
        if (response.error) {
          throw ApiError.fromUnknown(response.error)
        }
        const data =
          response.data as PaginatedResponse_ReconciliationSnapshotSummary_
        items.push(...data.items)
        total = data.total
        if (!data.has_next || data.items.length === 0) {
          break
        }
        page += 1
      }

      return {
        items,
        total,
        page: 1,
        page_size: items.length,
        total_pages: 1,
        has_next: false,
      } as PaginatedResponse_ReconciliationSnapshotSummary_
    },
    ...queryOptions,
  })
}

/**
 * Fetch a single reconciliation snapshot by ID
 */
export function useReconciliationSnapshot(
  snapshotId: string,
  includeTrace: boolean = true,
  queryOptions?: Omit<
    UseQueryOptions<ReconciliationSnapshot, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.reconciliation.snapshotDetail(snapshotId, includeTrace),
    queryFn: async () => {
      const response =
        await getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet({
          client: apiClient,
          path: { snapshot_id: snapshotId },
          query: { include_trace: includeTrace },
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as ReconciliationSnapshot
    },
    enabled: !!snapshotId,
    ...queryOptions,
  })
}

/**
 * Trigger a reconciliation calculation for a property and period
 */
export function useCalculateReconciliation(
  mutationOptions?: Omit<
    UseMutationOptions<CalculationJobResponse, ApiError, CalculationJobCreate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CalculationJobCreate) => {
      const response =
        await calculateReconciliationApiV1ReconciliationCalculatePost({
          client: apiClient,
          body: data,
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as CalculationJobResponse
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      // Invalidate snapshots list after calculation starts
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.snapshots(),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

/**
 * Get calculation job status (for polling)
 */
export function useCalculationJobStatus(
  jobId: string | null,
  queryOptions?: Omit<
    UseQueryOptions<CalculationJobStatusResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.reconciliation.job(jobId || ''),
    queryFn: async () => {
      if (!jobId) throw new Error('Job ID is required')
      const response = await getJobStatusApiV1ReconciliationJobsJobIdGet({
        client: apiClient,
        path: { job_id: jobId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as CalculationJobStatusResponse
    },
    enabled: !!jobId,
    // Poll every 1000ms if job is pending or running
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const status = data.status
      return status === 'pending' || status === 'running' ? 1000 : false
    },
    ...queryOptions,
  })
}

/**
 * Finalize all snapshots for a property and period
 */
export function useFinalizeSnapshots(
  mutationOptions?: Omit<
    UseMutationOptions<BatchFinalizeResponse, ApiError, BatchFinalizeRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  // Extract the component's onSuccess callback before spreading options
  const componentOnSuccess = mutationOptions?.onSuccess

  return useMutation({
    mutationFn: async (data: BatchFinalizeRequest) => {
      const response =
        await finalizeSnapshotsBatchApiV1ReconciliationSnapshotsFinalizeBatchPost(
          {
            client: apiClient,
            body: data,
          }
        )
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as BatchFinalizeResponse
    },
    ...mutationOptions, // Spread first (so we can override onSuccess)
    onSuccess: (data, variables, onMutateResult, context) => {
      logger.debug('Finalization mutation onSuccess called', {
        responseData: data,
        variables,
      })

      // OPTIMISTIC UPDATE: Immediately update cache with finalized snapshots
      const snapshotIds = data.results
        ?.filter((r) => r.success)
        .map((r) => r.snapshot_id)

      logger.debug('Extracted snapshot IDs from finalization response', {
        snapshotIds,
        totalResults: data.results?.length,
        successCount: snapshotIds?.length,
      })

      if (snapshotIds && snapshotIds.length > 0) {
        const now = new Date().toISOString()

        // Update the specific snapshotsList query cache using the mutation variables
        const filters = {
          property_id: variables.property_id,
          period_start: variables.period_start,
          period_end: variables.period_end,
          page: 1,
          size: 100,
        }

        logger.debug('Updating specific snapshotsList query cache', {
          filters,
          queryKey: queryKeys.reconciliation.snapshotsList(filters),
        })

        queryClient.setQueryData(
          queryKeys.reconciliation.snapshotsList(filters),
          (old: unknown) => {
            logger.debug(
              'setQueryData updater function called (specific list)',
              {
                oldData: old,
                oldDataType: typeof old,
                hasItems: !!(old && typeof old === 'object' && 'items' in old),
              }
            )

            if (!old || typeof old !== 'object') {
              logger.warn('Old cache data is null or not an object', { old })
              return old
            }
            const oldData = old as {
              items?: Array<{ id: string; [key: string]: unknown }>
            }
            if (!oldData.items) {
              logger.warn('Old cache data has no items array', { oldData })
              return old
            }

            const updatedItems = oldData.items.map((snapshot) =>
              snapshotIds.includes(snapshot.id)
                ? {
                    ...snapshot,
                    status: 'finalized',
                    is_finalized: true,
                    finalized_at: now,
                  }
                : snapshot
            )

            logger.debug('Updated cache data', {
              originalItemCount: oldData.items.length,
              updatedItemCount: updatedItems.length,
              updatedSnapshotIds: snapshotIds,
            })

            return {
              ...oldData,
              items: updatedItems,
            }
          }
        )

        // Also update any other cached queries with different filters (e.g., without pagination)
        logger.debug(
          'Updating all cached snapshots queries with setQueriesData'
        )
        queryClient.setQueriesData(
          { queryKey: queryKeys.reconciliation.snapshots() },
          (old: unknown) => {
            logger.debug(
              'setQueriesData updater function called (all queries)',
              {
                oldData: old,
                oldDataType: typeof old,
              }
            )

            if (!old || typeof old !== 'object') return old
            const oldData = old as {
              items?: Array<{ id: string; [key: string]: unknown }>
            }
            if (!oldData.items) return old

            return {
              ...oldData,
              items: oldData.items.map((snapshot) =>
                snapshotIds.includes(snapshot.id)
                  ? {
                      ...snapshot,
                      status: 'finalized',
                      is_finalized: true,
                      finalized_at: now,
                    }
                  : snapshot
              ),
            }
          }
        )

        // Update each individual snapshot detail query
        logger.debug('Updating individual snapshot detail queries', {
          snapshotIds,
        })
        snapshotIds.forEach((snapshotId) => {
          // Update with includeTrace=true
          queryClient.setQueryData(
            queryKeys.reconciliation.snapshotDetail(snapshotId, true),
            (old: unknown) => {
              if (!old) return old
              return {
                ...(old as object),
                status: 'finalized',
                is_finalized: true,
                finalized_at: now,
              }
            }
          )
          // Update with includeTrace=false
          queryClient.setQueryData(
            queryKeys.reconciliation.snapshotDetail(snapshotId, false),
            (old: unknown) => {
              if (!old) return old
              return {
                ...(old as object),
                status: 'finalized',
                is_finalized: true,
                finalized_at: now,
              }
            }
          )
        })

        logger.debug('Optimistic cache updates completed')
      } else {
        logger.warn('No successful snapshots to update in cache', {
          totalResults: data.results?.length,
        })
      }

      // Still invalidate for background refetch (data consistency)
      logger.debug('Invalidating snapshots queries for background refetch')
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.snapshots(),
      })

      logger.debug(
        'Optimistic updates completed, calling component onSuccess callback'
      )

      // Call the component's onSuccess callback if it exists
      if (componentOnSuccess) {
        // Type assertion to handle TanStack Query version differences
        ;(
          componentOnSuccess as (
            d: typeof data,
            v: typeof variables,
            o: typeof onMutateResult,
            c: typeof context
          ) => void
        )(data, variables, onMutateResult, context)
      }

      logger.debug('Finalization mutation onSuccess completed')
    },
  })
}

/**
 * Finalize a single reconciliation snapshot by ID.
 * Marks the snapshot as immutable and locks calculations.
 *
 * @param mutationOptions - Optional mutation configuration
 * @returns Mutation hook for finalizing a snapshot
 */
export function useFinalizeSnapshot(
  mutationOptions?: Omit<
    UseMutationOptions<FinalizeSnapshotResponse, ApiError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const response =
        await finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost(
          {
            client: apiClient,
            path: { snapshot_id: snapshotId },
          }
        )
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as FinalizeSnapshotResponse
    },
    ...mutationOptions,
    onSuccess: (data, snapshotId, onMutateResult, context) => {
      // Invalidate snapshot queries after finalization
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.snapshots(),
      })
      mutationOptions?.onSuccess?.(data, snapshotId, onMutateResult, context)
    },
  })
}

// ============================================================
// Reconciliation Cell Update Hook
// ============================================================

/**
 * Update a single reconciliation cell value
 */
export function useUpdateReconciliationCell(
  mutationOptions?: Omit<
    UseMutationOptions<
      ReconciliationCell,
      ApiError,
      { cellId: string; value: ReconciliationCellUpdate }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      cellId,
      value,
    }: {
      cellId: string
      value: ReconciliationCellUpdate
    }) => {
      const response =
        await updateReconciliationCellApiV1ReconciliationCellsCellIdPatch({
          client: apiClient,
          path: { cell_id: cellId },
          body: value,
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as ReconciliationCell
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      // Invalidate the snapshot detail query for this cell's snapshot
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.snapshotDetail(
          data.snapshot_id,
          true
        ),
      })
      // Also invalidate snapshots list in case totals changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.snapshots(),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

// ============================================================
// Tenant Invitation & Signup Hooks
// ============================================================

/**
 * Validate a tenant invitation token
 */
export function useValidateInvitation(
  token: string | null,
  queryOptions?: Omit<
    UseQueryOptions<InvitationValidationResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.tenant.invitation(token || ''),
    queryFn: async () => {
      if (!token) throw new Error('Token is required')
      const response =
        await validateInvitationTokenApiV1TenantInvitationsTokenValidateGet({
          client: apiClient,
          path: { token },
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as InvitationValidationResponse
    },
    enabled: !!token,
    ...queryOptions,
  })
}

/**
 * Complete tenant signup with invitation token
 */
export function useTenantSignup(
  mutationOptions?: Omit<
    UseMutationOptions<TenantSignupResponse, ApiError, TenantSignupRequest>,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async (data: TenantSignupRequest) => {
      const response = await tenantSignupApiV1TenantSignupPost({
        client: apiClient,
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as TenantSignupResponse
    },
    ...mutationOptions,
  })
}

// ============================================================
// Dispute Hooks (Landlord/Admin)
// ============================================================

/**
 * Fetch paginated list of disputes for the organization
 */
export function useDisputes(
  filters: { status?: DisputeStatus; skip?: number; limit?: number } = {},
  queryOptions?: Omit<
    UseQueryOptions<DisputeSummaryDTO[], ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.disputes.list(filters),
    queryFn: async () => {
      const response = await listOrganizationDisputesApiV1DisputesGet({
        client: apiClient,
        query: filters,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as DisputeSummaryDTO[]
    },
    ...queryOptions,
  })
}

/**
 * Fetch a single dispute by ID (with full details including comments and attachments)
 */
export function useDispute(
  disputeId: string,
  queryOptions?: Omit<
    UseQueryOptions<DisputeDetailDTO, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.disputes.detail(disputeId),
    queryFn: async () => {
      const response = await getDisputeApiV1DisputesDisputeIdGet({
        client: apiClient,
        path: { dispute_id: disputeId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as DisputeDetailDTO
    },
    enabled: !!disputeId,
    ...queryOptions,
  })
}

/**
 * Update dispute status (admin only)
 * State machine: OPEN → UNDER_REVIEW → RESOLVED/REJECTED → CLOSED
 */
export function useUpdateDisputeStatus(
  disputeId: string,
  mutationOptions?: Omit<
    UseMutationOptions<DisputeSummaryDTO, ApiError, UpdateStatusRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UpdateStatusRequest) => {
      const response = await updateDisputeStatusApiV1DisputesDisputeIdStatusPut(
        {
          client: apiClient,
          path: { dispute_id: disputeId },
          body: data,
        }
      )
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as DisputeSummaryDTO
    },
    ...mutationOptions,
    onSuccess: (updatedDispute, variables, onMutateResult, context) => {
      // Invalidate the detail cache so it re-fetches the full DisputeDetailDTO
      queryClient.invalidateQueries({
        queryKey: queryKeys.disputes.detail(disputeId),
      })
      // Invalidate the lists to refresh status badges
      queryClient.invalidateQueries({
        queryKey: queryKeys.disputes.lists(),
      })
      mutationOptions?.onSuccess?.(
        updatedDispute,
        variables,
        onMutateResult,
        context
      )
    },
  })
}

/**
 * Add admin comment to a dispute
 */
export function useAddDisputeComment(
  disputeId: string,
  mutationOptions?: Omit<
    UseMutationOptions<DisputeCommentDTO, ApiError, AddCommentRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: AddCommentRequest) => {
      const response = await addAdminCommentApiV1DisputesDisputeIdCommentsPost({
        client: apiClient,
        path: { dispute_id: disputeId },
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as DisputeCommentDTO
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      // Invalidate the detail to refetch with new comment
      queryClient.invalidateQueries({
        queryKey: queryKeys.disputes.detail(disputeId),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

// ============================================================
// Expense Pool Hooks
// ============================================================

/**
 * Fetch expense pools for a property with optional hierarchy
 */
export function useExpensePools(
  propertyId: string,
  options: { includeChildren?: boolean; skip?: number; limit?: number } = {},
  queryOptions?: Omit<
    UseQueryOptions<ExpensePoolListResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.expensePools.list(propertyId, options),
    queryFn: async () => {
      const response =
        await listExpensePoolsApiV1PropertiesPropertyIdExpensePoolsGet({
          client: apiClient,
          path: { property_id: propertyId },
          query: {
            include_children: options.includeChildren ?? true,
            ...(options.skip !== undefined && { skip: options.skip }),
            ...(options.limit !== undefined && { limit: options.limit }),
          },
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as ExpensePoolListResponse
    },
    enabled: !!propertyId,
    ...queryOptions,
  })
}

/**
 * Fetch a single expense pool by ID
 */
export function useExpensePool(
  propertyId: string,
  poolId: string,
  queryOptions?: Omit<
    UseQueryOptions<ExpensePool, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.expensePools.detail(propertyId, poolId),
    queryFn: async () => {
      const response =
        await getExpensePoolApiV1PropertiesPropertyIdExpensePoolsPoolIdGet({
          client: apiClient,
          path: { property_id: propertyId, pool_id: poolId },
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as ExpensePool
    },
    enabled: !!propertyId && !!poolId,
    ...queryOptions,
  })
}

/**
 * Create a new expense pool
 */
export function useCreateExpensePool(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<ExpensePool, ApiError, ExpensePoolCreateRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ExpensePoolCreateRequest) => {
      const response =
        await createExpensePoolApiV1PropertiesPropertyIdExpensePoolsPost({
          client: apiClient,
          path: { property_id: propertyId },
          body: data,
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as ExpensePool
    },
    ...mutationOptions,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(data, variables, context, mutation)
    },
  })
}

/**
 * Update an existing expense pool
 */
export function useUpdateExpensePool(
  propertyId: string,
  poolId: string,
  mutationOptions?: Omit<
    UseMutationOptions<ExpensePool, ApiError, ExpensePoolUpdate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ExpensePoolUpdate) => {
      const response =
        await updateExpensePoolApiV1PropertiesPropertyIdExpensePoolsPoolIdPut({
          client: apiClient,
          path: { property_id: propertyId, pool_id: poolId },
          body: data,
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as ExpensePool
    },
    ...mutationOptions,
    onSuccess: (updatedPool, variables, onMutateResult, context) => {
      queryClient.setQueryData(
        queryKeys.expensePools.detail(propertyId, poolId),
        updatedPool
      )
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(
        updatedPool,
        variables,
        onMutateResult,
        context
      )
    },
  })
}

/**
 * Delete an expense pool
 */
export function useDeleteExpensePool(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (poolId: string) => {
      const response =
        await deleteExpensePoolApiV1PropertiesPropertyIdExpensePoolsPoolIdDelete(
          {
            client: apiClient,
            path: { property_id: propertyId, pool_id: poolId },
          }
        )
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
    },
    ...mutationOptions,
    onSuccess: (data, poolId, onMutateResult, context) => {
      queryClient.removeQueries({
        queryKey: queryKeys.expensePools.detail(propertyId, poolId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(data, poolId, onMutateResult, context)
    },
  })
}

// ============================================================
// Pool Mapping Hooks
// ============================================================

/**
 * Fetch pool mappings for a property
 */
export function usePoolMappings(
  propertyId: string,
  options: { poolId?: string; skip?: number; limit?: number } = {},
  queryOptions?: Omit<
    UseQueryOptions<PoolMappingListResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.poolMappings.list(propertyId, options),
    queryFn: async () => {
      const response =
        await listPoolMappingsApiV1PropertiesPropertyIdPoolMappingsGet({
          client: apiClient,
          path: { property_id: propertyId },
          query: {
            ...(options.poolId !== undefined && { pool_id: options.poolId }),
            ...(options.skip !== undefined && { skip: options.skip }),
            ...(options.limit !== undefined && { limit: options.limit }),
          },
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolMappingListResponse
    },
    enabled: !!propertyId,
    ...queryOptions,
  })
}

/**
 * Create a new pool mapping
 */
export function useCreatePoolMapping(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<PoolMapping, ApiError, PoolMappingCreateRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: PoolMappingCreateRequest) => {
      const response =
        await createPoolMappingApiV1PropertiesPropertyIdPoolMappingsPost({
          client: apiClient,
          path: { property_id: propertyId },
          body: data,
        })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolMapping
    },
    ...mutationOptions,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.poolMappings.byProperty(propertyId),
      })
      // Also invalidate expense pools since mapping counts may have changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(data, variables, context, mutation)
    },
  })
}

/**
 * Update an existing pool mapping
 */
export function useUpdatePoolMapping(
  propertyId: string,
  mappingId: string,
  mutationOptions?: Omit<
    UseMutationOptions<PoolMapping, ApiError, PoolMappingUpdate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: PoolMappingUpdate) => {
      const response =
        await updatePoolMappingApiV1PropertiesPropertyIdPoolMappingsMappingIdPut(
          {
            client: apiClient,
            path: { property_id: propertyId, mapping_id: mappingId },
            body: data,
          }
        )
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolMapping
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.poolMappings.byProperty(propertyId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

/**
 * Delete a pool mapping
 */
export function useDeletePoolMapping(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (mappingId: string) => {
      const response =
        await deletePoolMappingApiV1PropertiesPropertyIdPoolMappingsMappingIdDelete(
          {
            client: apiClient,
            path: { property_id: propertyId, mapping_id: mappingId },
          }
        )
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
    },
    ...mutationOptions,
    onSuccess: (data, mappingId, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.poolMappings.byProperty(propertyId),
      })
      // Also invalidate expense pools since mapping counts may have changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(data, mappingId, onMutateResult, context)
    },
  })
}

// ============================================================
// Pool Allocation Hooks
// ============================================================

/**
 * Fetch split allocations for a property or source pool.
 */
export function usePoolAllocations(
  propertyId: string,
  options: { sourcePoolId?: string; skip?: number; limit?: number } = {},
  queryOptions?: Omit<
    UseQueryOptions<PoolAllocationListResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.poolAllocations.list(propertyId, options),
    queryFn: async () => {
      const response = await apiClient.get<PoolAllocationListResponse>({
        url: '/api/v1/properties/{property_id}/pool-allocations',
        path: { property_id: propertyId },
        query: {
          ...(options.sourcePoolId !== undefined && {
            source_pool_id: options.sourcePoolId,
          }),
          ...(options.skip !== undefined && { skip: options.skip }),
          ...(options.limit !== undefined && { limit: options.limit }),
        },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolAllocationListResponse
    },
    enabled: !!propertyId,
    ...queryOptions,
  })
}

/**
 * Create a percentage split allocation between pools.
 */
export function useCreatePoolAllocation(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<PoolAllocation, ApiError, PoolAllocationCreate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: PoolAllocationCreate) => {
      const response = await apiClient.post<PoolAllocation>({
        url: '/api/v1/properties/{property_id}/pool-allocations',
        path: { property_id: propertyId },
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolAllocation
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.poolAllocations.byProperty(propertyId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

/**
 * Delete a split allocation.
 */
export function useDeletePoolAllocation(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (allocationId: string) => {
      const response = await apiClient.delete<void>({
        url: '/api/v1/properties/{property_id}/pool-allocations/{allocation_id}',
        path: { property_id: propertyId, allocation_id: allocationId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
    },
    ...mutationOptions,
    onSuccess: (data, allocationId, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.poolAllocations.byProperty(propertyId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(propertyId),
      })
      mutationOptions?.onSuccess?.(data, allocationId, onMutateResult, context)
    },
  })
}

// ============================================================
// Pool Template Hooks
// ============================================================

export function usePoolTemplates(
  options: { propertyType?: string } = {},
  queryOptions?: Omit<
    UseQueryOptions<PoolTemplateList[], ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.poolTemplates.list(options),
    queryFn: async () => {
      const response = await listTemplatesApiV1PoolTemplatesGet({
        client: apiClient,
        query: {
          ...(options.propertyType !== undefined && {
            property_type: options.propertyType,
          }),
        },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolTemplateList[]
    },
    ...queryOptions,
  })
}

export function usePoolTemplate(
  templateId: string,
  queryOptions?: Omit<
    UseQueryOptions<PoolTemplate, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.poolTemplates.detail(templateId),
    queryFn: async () => {
      const response = await getTemplateApiV1PoolTemplatesTemplateIdGet({
        client: apiClient,
        path: { template_id: templateId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolTemplate
    },
    enabled: !!templateId,
    ...queryOptions,
  })
}

export function useCreatePoolTemplate(
  mutationOptions?: Omit<
    UseMutationOptions<PoolTemplate, ApiError, PoolTemplateCreate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: PoolTemplateCreate) => {
      const response = await createTemplateApiV1PoolTemplatesPost({
        client: apiClient,
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolTemplate
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.poolTemplates.lists(),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

export function useUpdatePoolTemplate(
  templateId: string,
  mutationOptions?: Omit<
    UseMutationOptions<PoolTemplate, ApiError, PoolTemplateUpdate>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: PoolTemplateUpdate) => {
      const response = await updateTemplateApiV1PoolTemplatesTemplateIdPut({
        client: apiClient,
        path: { template_id: templateId },
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolTemplate
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.setQueryData(queryKeys.poolTemplates.detail(templateId), data)
      queryClient.invalidateQueries({
        queryKey: queryKeys.poolTemplates.lists(),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

export function useDeletePoolTemplate(
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (templateId: string) => {
      const response = await deleteTemplateApiV1PoolTemplatesTemplateIdDelete({
        client: apiClient,
        path: { template_id: templateId },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
    },
    ...mutationOptions,
    onSuccess: (data, templateId, onMutateResult, context) => {
      queryClient.removeQueries({
        queryKey: queryKeys.poolTemplates.detail(templateId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.poolTemplates.lists(),
      })
      mutationOptions?.onSuccess?.(data, templateId, onMutateResult, context)
    },
  })
}

export function useApplyPoolTemplate(
  mutationOptions?: Omit<
    UseMutationOptions<Record<string, unknown>, ApiError, ApplyTemplateRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ApplyTemplateRequest) => {
      const response = await applyTemplateApiV1PoolTemplatesApplyPost({
        client: apiClient,
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as Record<string, unknown>
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(variables.property_id),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

export function useCopyExpensePools(
  mutationOptions?: Omit<
    UseMutationOptions<PoolCopyResult, ApiError, PoolCopyRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: PoolCopyRequest) => {
      const response = await copyPoolsApiV1PoolTemplatesCopyPost({
        client: apiClient,
        body: data,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as PoolCopyResult
    },
    ...mutationOptions,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(
          variables.target_property_id
        ),
      })
      mutationOptions?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

// ============================================================
// Rent Roll Import Hooks
// ============================================================

/**
 * Property metadata extracted from rent roll file
 */
export interface RentRollPropertyMetadata {
  name: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
}

/**
 * Unit data extracted from rent roll file
 */
export interface RentRollUnit {
  unit_number: string
  rentable_sqft: string
  usable_sqft: string | null
  floor: number | null
  tenant_name: string | null
  lease_start: string | null
  lease_end: string | null
  base_rent: string | null
  cam_share: string | null
}

/**
 * Response from rent roll preview endpoint
 */
export interface RentRollPreviewResponse {
  success: boolean
  source_system: string
  property_metadata: RentRollPropertyMetadata
  units: RentRollUnit[]
  row_count: number
  error_count: number
  total_units: number
  occupied_units: number
  errors: string[]
  warnings: string[]
}

/**
 * Response from rent roll import endpoint
 */
export interface RentRollImportResponse {
  success: boolean
  property_id: string | null
  property_name: string | null
  units_created: number
  leases_created: number
  errors: string[]
  warnings: string[]
}

/**
 * Request data for rent roll import (form data with optional overrides)
 */
export interface RentRollImportRequest {
  file: File
  property_name?: string
  address?: string
  city?: string
  state?: string
  postal_code?: string
}

/**
 * Preview a rent roll file without importing
 */
export function useRentRollPreview(
  mutationOptions?: Omit<
    UseMutationOptions<RentRollPreviewResponse, ApiError, File>,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async (file: File) => {
      const session = await getSession()
      if (!session?.access_token) {
        throw new ApiError('You must be signed in to preview a rent roll', 401)
      }

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(resolveApiUrl('/api/v1/rent-roll/preview'), {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new ApiError(
          error.detail || 'Failed to preview rent roll',
          response.status
        )
      }

      return response.json() as Promise<RentRollPreviewResponse>
    },
    ...mutationOptions,
  })
}

/**
 * Import a rent roll file, creating Property + Units + Leases
 */
export function useRentRollImport(
  mutationOptions?: Omit<
    UseMutationOptions<RentRollImportResponse, ApiError, RentRollImportRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: RentRollImportRequest) => {
      const session = await getSession()
      if (!session?.access_token) {
        throw new ApiError('You must be signed in to import a rent roll', 401)
      }

      const formData = new FormData()
      formData.append('file', request.file)
      if (request.property_name)
        formData.append('property_name', request.property_name)
      if (request.address) formData.append('address', request.address)
      if (request.city) formData.append('city', request.city)
      if (request.state) formData.append('state', request.state)
      if (request.postal_code)
        formData.append('postal_code', request.postal_code)

      const response = await fetch(resolveApiUrl('/api/v1/rent-roll/import'), {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new ApiError(
          error.detail || 'Failed to import rent roll',
          response.status
        )
      }

      return response.json() as Promise<RentRollImportResponse>
    },
    ...mutationOptions,
    onSuccess: (data, variables, context, mutation) => {
      // Invalidate properties list after import
      queryClient.invalidateQueries({
        queryKey: queryKeys.properties.lists(),
      })
      mutationOptions?.onSuccess?.(data, variables, context, mutation)
    },
  })
}

// ============================================================
// Export v2 Hooks (/api/v1/export/*)
// ============================================================

export interface PDFExportRequest {
  property_id: string
  year: number
  include_charts?: boolean
  include_notes?: boolean
  tenant_ids?: string[]
}

export interface BatchPDFRequest {
  property_id: string
  year: number
  tenant_ids: string[]
  mode?: 'zip' | 'individual'
}

export interface ERPExportRequest {
  property_id: string
  year: number
  erp_system: 'yardi' | 'mri'
  field_mappings?: Record<string, string>
}

export interface VarianceReportRequest {
  property_id: string
  current_year: number
  prior_year: number
  threshold_percent?: number
}

export interface BoardExportRequest {
  property_id: string
  year: number
  cap_rate: number // e.g. 0.07 for 7%
}

export interface ExportHistoryItem {
  id: string
  property_id: string
  format: string
  file_name: string
  file_size: number
  status: string
  created_at: string
  created_by_name: string
}

export interface ExportHistoryResponse {
  items: ExportHistoryItem[]
  total: number
  page: number
  page_size: number
}

/** Trigger a file download from a blob URL */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * fetch wrapper that adds a 30s timeout and maps a TimeoutError to a
 * 408 ApiError, mirroring the generated apiClient's customFetch. Used by the
 * hand-written raw-fetch hooks below so they get the same hang protection as
 * SDK-routed calls (F-112).
 *
 * Note: when the timeout signal is applied it REPLACES any `init.signal` the
 * caller passed, matching the generated client. No current caller passes its
 * own signal; if one ever needs caller-driven cancellation, merge the two with
 * `AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])` instead.
 */
async function fetchWithApiTimeout(
  url: string,
  init?: RequestInit
): Promise<Response> {
  let requestInit = init
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    requestInit = { ...init, signal: AbortSignal.timeout(30_000) }
  }
  try {
    return await fetch(url, requestInit)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('Request timed out. Please try again.', 408)
    }
    throw error
  }
}

/**
 * Build an ApiError from a non-OK Response, surfacing FastAPI's `detail`
 * whether it's a string (HTTPException) or an array of validation errors (422,
 * e.g. a malformed UUID in tenant_ids). Without this, an array `detail` would
 * stringify to "[object Object]" in the error message (F-115).
 */
async function apiErrorFromResponse(
  response: Response,
  fallback: string
): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    detail?: unknown
  }
  const detail = body.detail
  if (typeof detail === 'string' && detail.length > 0) {
    return new ApiError(detail, response.status)
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const errors = detail as ValidationErrorDetail[]
    const message =
      errors
        .map((e) => e?.msg)
        .filter(Boolean)
        .join('; ') || fallback
    return new ApiError(message, response.status, errors)
  }
  return new ApiError(fallback, response.status)
}

async function fetchExportBlob(
  path: string,
  body: unknown
): Promise<{ blob: Blob; filename: string }> {
  const session = await getSession()
  const response = await fetchWithApiTimeout(resolveApiUrl(`/api/v1${path}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw await apiErrorFromResponse(response, 'Export failed')
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  const filename = match?.[1] ?? 'export'
  return { blob, filename }
}

/**
 * Generate a PDF preview blob for inline viewing.
 * Returns base64/blob URL for use in an iframe.
 */
export function useExportPdfPreview(
  mutationOptions?: UseMutationOptions<
    { blob: Blob; blobUrl: string },
    ApiError,
    PDFExportRequest
  >
) {
  return useMutation<
    { blob: Blob; blobUrl: string },
    ApiError,
    PDFExportRequest
  >({
    mutationFn: async (request) => {
      const { blob } = await fetchExportBlob('/export/pdf/preview', request)
      const blobUrl = URL.createObjectURL(blob)
      return { blob, blobUrl }
    },
    ...mutationOptions,
  })
}

/**
 * Download a PDF file (attachment) for a property/year.
 */
export function useExportPdfDownload(
  mutationOptions?: UseMutationOptions<void, ApiError, PDFExportRequest>
) {
  return useMutation<void, ApiError, PDFExportRequest>({
    mutationFn: async (request) => {
      const { blob, filename } = await fetchExportBlob(
        '/export/pdf/download',
        request
      )
      triggerDownload(blob, filename)
    },
    ...mutationOptions,
  })
}

/**
 * Download a batch ZIP of PDFs.
 */
export function useExportBatchPdf(
  mutationOptions?: UseMutationOptions<void, ApiError, BatchPDFRequest>
) {
  return useMutation<void, ApiError, BatchPDFRequest>({
    mutationFn: async (request) => {
      const { blob, filename } = await fetchExportBlob(
        '/export/pdf/batch',
        request
      )
      triggerDownload(blob, filename)
    },
    ...mutationOptions,
  })
}

/**
 * Download an ERP-format CSV/TXT file.
 */
export function useExportErp(
  mutationOptions?: UseMutationOptions<void, ApiError, ERPExportRequest>
) {
  return useMutation<void, ApiError, ERPExportRequest>({
    mutationFn: async (request) => {
      const { blob, filename } = await fetchExportBlob('/export/erp', request)
      triggerDownload(blob, filename)
    },
    ...mutationOptions,
  })
}

/**
 * Fetch export history for a property.
 */
export function useExportHistory(
  propertyId: string,
  format?: string,
  queryOptions?: Omit<
    UseQueryOptions<ExportHistoryResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<ExportHistoryResponse, ApiError>({
    queryKey: ['export-history', propertyId, format],
    queryFn: async () => {
      const session = await getSession()
      const params = new URLSearchParams({ property_id: propertyId })
      if (format) params.set('format', format)
      const response = await fetchWithApiTimeout(
        resolveApiUrl(`/api/v1/export/history?${params}`),
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        }
      )
      if (!response.ok) {
        throw await apiErrorFromResponse(
          response,
          'Failed to fetch export history'
        )
      }
      return response.json()
    },
    enabled: !!propertyId,
    ...queryOptions,
  })
}

interface ExportDownloadUrlResponse {
  download_url: string
  file_name: string
  expires_at: string
}

/**
 * Re-download a past export (F-024).
 *
 * The app uses Bearer-token auth, so we cannot simply point `window.open` at
 * the API route (the browser would not attach the Authorization header and the
 * request would 401). Instead we fetch a short-lived signed URL with the token
 * attached, then open that signed URL, which carries its own auth in the query
 * string, in a new tab.
 */
export function useExportRedownload(
  mutationOptions?: UseMutationOptions<void, ApiError, string>
) {
  return useMutation<void, ApiError, string>({
    mutationFn: async (exportId) => {
      const session = await getSession()
      const response = await fetch(
        resolveApiUrl(`/api/v1/export/download/${exportId}`),
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        }
      )
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new ApiError(
          error.detail || 'Failed to download export',
          response.status
        )
      }
      const data: ExportDownloadUrlResponse = await response.json()
      window.open(data.download_url, '_blank', 'noopener,noreferrer')
    },
    ...mutationOptions,
  })
}

/**
 * Download a variance report PDF.
 */
export function useExportVariancePdf(
  mutationOptions?: UseMutationOptions<void, ApiError, VarianceReportRequest>
) {
  return useMutation<void, ApiError, VarianceReportRequest>({
    mutationFn: async (request) => {
      const { blob, filename } = await fetchExportBlob(
        '/export/variance/pdf',
        request
      )
      triggerDownload(blob, filename)
    },
    ...mutationOptions,
  })
}

export function useExportVarianceExcel(
  mutationOptions?: UseMutationOptions<void, ApiError, VarianceReportRequest>
) {
  return useMutation<void, ApiError, VarianceReportRequest>({
    mutationFn: async (request) => {
      const { blob, filename } = await fetchExportBlob(
        '/export/variance/excel',
        request
      )
      triggerDownload(blob, filename)
    },
    ...mutationOptions,
  })
}

// Tenant billing document hook

export interface DemandLetterRequest {
  snapshot_id: string
  state: 'TX' | 'CA'
  landlord_name: string
  landlord_title: string
  landlord_company: string
  landlord_address: string
  landlord_phone: string
  landlord_email: string
  payment_deadline_days: number
  dispute_id?: string
  dispute_filed_date?: string
}

export function useGenerateDemandLetter(
  mutationOptions?: UseMutationOptions<void, ApiError, DemandLetterRequest>
) {
  return useMutation<void, ApiError, DemandLetterRequest>({
    mutationFn: async (request) => {
      const { blob, filename } = await fetchExportBlob(
        '/demand-letter/generate',
        request
      )
      triggerDownload(blob, filename)
    },
    ...mutationOptions,
  })
}

/**
 * Preview a board presentation PDF inline (returns blob URL).
 */
export function useExportBoardPreview(
  mutationOptions?: UseMutationOptions<
    { blob: Blob; blobUrl: string },
    ApiError,
    BoardExportRequest
  >
) {
  return useMutation<
    { blob: Blob; blobUrl: string },
    ApiError,
    BoardExportRequest
  >({
    mutationFn: async (request) => {
      const { blob } = await fetchExportBlob('/export/board/preview', request)
      const blobUrl = URL.createObjectURL(blob)
      return { blob, blobUrl }
    },
    ...mutationOptions,
  })
}

/**
 * Download a board presentation PDF as an attachment.
 */
export function useExportBoardDownload(
  mutationOptions?: UseMutationOptions<void, ApiError, BoardExportRequest>
) {
  return useMutation<void, ApiError, BoardExportRequest>({
    mutationFn: async (request) => {
      const { blob, filename } = await fetchExportBlob(
        '/export/board/download',
        request
      )
      triggerDownload(blob, filename)
    },
    ...mutationOptions,
  })
}

// ============================================================
// SB 1103 Compliance Hooks
// ============================================================
// California SB 1103 compliance request tracking and export.

export const sb1103QueryKeys = {
  all: ['sb1103'] as const,
  byProperty: (propertyId: string) =>
    [...sb1103QueryKeys.all, 'byProperty', propertyId] as const,
  list: (propertyId: string) =>
    [...sb1103QueryKeys.byProperty(propertyId), 'list'] as const,
  detail: (requestId: string) =>
    [...sb1103QueryKeys.all, 'detail', requestId] as const,
}

export interface SB1103RequestData {
  id: string
  organization_id: string
  property_id: string
  lease_id: string
  requested_by_name: string
  requested_by_email: string
  request_date: string
  response_deadline: string
  window_start_date: string
  window_end_date: string
  status: string
  export_format: string | null
  exported_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SB1103ListResponse {
  data: SB1103RequestData[]
  count: number
  has_more: boolean
}

export interface SB1103RequestCreateInput {
  property_id: string
  lease_id: string
  requested_by_name: string
  requested_by_email: string
  request_date: string
  notes?: string
}

export interface SB1103RequestUpdateInput {
  status?: string
  export_format?: string
  exported_at?: string
  notes?: string
}

async function sb1103AuthHeaders(
  contentType?: 'application/json'
): Promise<Record<string, string>> {
  const session = await getSession()
  return {
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
  }
}

/** Fetch all SB 1103 compliance requests for a property. */
export function useSB1103Requests(
  propertyId: string,
  queryOptions?: Omit<
    UseQueryOptions<SB1103ListResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<SB1103ListResponse, ApiError>({
    queryKey: sb1103QueryKeys.list(propertyId),
    queryFn: async () => {
      const response = await fetch(
        resolveApiUrl(`/api/v1/compliance/sb1103?property_id=${propertyId}`),
        {
          credentials: 'include',
          headers: await sb1103AuthHeaders(),
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new ApiError(
          err.detail ?? `HTTP ${response.status}`,
          response.status
        )
      }
      return response.json() as Promise<SB1103ListResponse>
    },
    enabled: !!propertyId,
    throwOnError: false,
    ...queryOptions,
  })
}

/** Create a new SB 1103 compliance request. Invalidates the list. */
export function useCreateSB1103Request(
  mutationOptions?: Omit<
    UseMutationOptions<SB1103RequestData, ApiError, SB1103RequestCreateInput>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation<SB1103RequestData, ApiError, SB1103RequestCreateInput>({
    mutationFn: async (data) => {
      const response = await fetch(resolveApiUrl('/api/v1/compliance/sb1103'), {
        method: 'POST',
        credentials: 'include',
        headers: await sb1103AuthHeaders('application/json'),
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new ApiError(
          err.detail ?? `HTTP ${response.status}`,
          response.status
        )
      }
      return response.json() as Promise<SB1103RequestData>
    },
    ...mutationOptions,
    onSuccess: (result, variables, _onMutateContext, context) => {
      queryClient.invalidateQueries({
        queryKey: sb1103QueryKeys.byProperty(variables.property_id),
      })
      mutationOptions?.onSuccess?.(result, variables, _onMutateContext, context)
    },
  })
}

interface SB1103UpdateVariables {
  requestId: string
  data: SB1103RequestUpdateInput
}

/** Partially update an SB 1103 compliance request. */
export function useUpdateSB1103Request(
  mutationOptions?: Omit<
    UseMutationOptions<SB1103RequestData, ApiError, SB1103UpdateVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation<SB1103RequestData, ApiError, SB1103UpdateVariables>({
    mutationFn: async ({ requestId, data }) => {
      const response = await fetch(
        resolveApiUrl(`/api/v1/compliance/sb1103/${requestId}`),
        {
          method: 'PATCH',
          credentials: 'include',
          headers: await sb1103AuthHeaders('application/json'),
          body: JSON.stringify(data),
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new ApiError(
          err.detail ?? `HTTP ${response.status}`,
          response.status
        )
      }
      return response.json() as Promise<SB1103RequestData>
    },
    ...mutationOptions,
    onSuccess: (result, variables, _onMutateContext, context) => {
      queryClient.invalidateQueries({
        queryKey: sb1103QueryKeys.all,
      })
      mutationOptions?.onSuccess?.(result, variables, _onMutateContext, context)
    },
  })
}

interface SB1103ExportVariables {
  requestId: string
  format: 'pdf' | 'excel' | 'both'
}

/** Generate and download a SB 1103 export (PDF, Excel, or ZIP). */
export function useExportSB1103Request(
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, SB1103ExportVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, SB1103ExportVariables>({
    mutationFn: async ({ requestId, format }) => {
      const response = await fetch(
        resolveApiUrl(
          `/api/v1/compliance/sb1103/${requestId}/export?format=${format}`
        ),
        {
          method: 'POST',
          credentials: 'include',
          headers: await sb1103AuthHeaders(),
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new ApiError(
          err.detail ?? `HTTP ${response.status}`,
          response.status
        )
      }
      const blob = await response.blob()
      const contentDisposition =
        response.headers.get('content-disposition') ?? ''
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)
      const filename =
        filenameMatch?.[1] ??
        `SB1103_export.${format === 'both' ? 'zip' : format === 'excel' ? 'xlsx' : 'pdf'}`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    },
    ...mutationOptions,
    onSuccess: (result, variables, _onMutateContext, context) => {
      queryClient.invalidateQueries({
        queryKey: sb1103QueryKeys.all,
      })
      mutationOptions?.onSuccess?.(result, variables, _onMutateContext, context)
    },
  })
}

// ============================================================================
// Campaign Hooks
// ============================================================================

/**
 * Re-export generated campaign types for convenience.
 */
export type { ReconciliationCampaignSummary as CampaignSummary } from './generated'
export type { CampaignTransitionResponse } from './generated'

/**
 * List reconciliation campaigns with optional year filter.
 */
export function useCampaigns(
  filters: { year?: number; throwOnError?: boolean } = {}
) {
  const { throwOnError = true, ...queryFilters } = filters
  return useQuery({
    queryKey: queryKeys.campaigns.list(queryFilters),
    queryFn: async () => {
      const response = await listCampaignsApiV1CampaignsGet({
        client: apiClient,
        query: { year: queryFilters.year ?? null },
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data!
    },
    throwOnError,
  })
}

/**
 * Shared transition mutation helper.
 */
function useCampaignTransition(
  mutationFn: (campaignId: string) => Promise<unknown>
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const response = (await mutationFn(campaignId)) as {
        error?: unknown
        data?: unknown
      }
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
    },
  })
}

export function useSubmitForReview() {
  return useCampaignTransition((id) =>
    submitForReviewApiV1CampaignsCampaignIdSubmitForReviewPost({
      client: apiClient,
      path: { campaign_id: id },
    })
  )
}

export function useApproveCampaign() {
  return useCampaignTransition((id) =>
    approveCampaignApiV1CampaignsCampaignIdApprovePost({
      client: apiClient,
      path: { campaign_id: id },
    })
  )
}

export function useRejectCampaign() {
  return useCampaignTransition((id) =>
    rejectCampaignApiV1CampaignsCampaignIdRejectPost({
      client: apiClient,
      path: { campaign_id: id },
    })
  )
}

export function useMarkSent() {
  return useCampaignTransition((id) =>
    markSentApiV1CampaignsCampaignIdMarkSentPost({
      client: apiClient,
      path: { campaign_id: id },
    })
  )
}

// ============================================================================
// Cap Bank Ledger
// ============================================================================

export interface CapBankLedgerEntry {
  period_start: string
  period_end: string
  snapshot_id: string | null
  cap_type: string
  cap_rate: string
  base_year_amount: string
  cap_threshold: string
  actual_expense: string
  amount_applied: string
  excess_absorbed_by_landlord: string
  bank_opening: string
  bank_change: string
  bank_closing: string
  finalized_at: string | null
}

export interface CapBankLedgerResponse {
  lease_id: string
  tenant_name: string
  pool_name: string | null
  cap_type: string
  cap_rate: string
  entries: CapBankLedgerEntry[]
  current_bank_balance: string
  total_landlord_absorbed: string
}

export function useCapBankLedger(
  leaseId: string,
  queryOptions?: Omit<
    UseQueryOptions<CapBankLedgerResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.reconciliation.capBankLedger(leaseId),
    queryFn: async () => {
      const response = await apiClient.get({
        url: `/api/v1/reconciliation/leases/${leaseId}/cap-bank-ledger`,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return response.data as CapBankLedgerResponse
    },
    enabled: !!leaseId,
    ...queryOptions,
  })
}

// ============================================================
// Denominator Change Hooks
// ============================================================

import type {
  DenominatorChangeRequest,
  DenominatorChangePdfRequest,
  DenominatorChangeReport,
} from '@/features/reconciliation/types/denominator-change'

export type {
  DenominatorChangeRequest,
  DenominatorChangePdfRequest,
  DenominatorChangeReport,
}

/**
 * Coerce a backend value to a finite number.
 *
 * The denominator-change report's numeric fields are `Decimal` on the backend,
 * which Pydantic v2 serializes to JSON *strings* (e.g. "1.50"). The component
 * formats them with `.toFixed()` / arithmetic, so they must be real numbers —
 * otherwise the panel throws `toFixed is not a function` and the whole
 * reconciliation screen falls through to the error boundary.
 */
function toFiniteNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Normalize the string-serialized Decimal fields of a denominator-change
 * report into the `number`s the type contract promises.
 */
export function normalizeDenominatorChangeReport(
  report: DenominatorChangeReport
): DenominatorChangeReport {
  return {
    ...report,
    prior_total_rsf: toFiniteNumber(report.prior_total_rsf),
    current_total_rsf: toFiniteNumber(report.current_total_rsf),
    rsf_delta: toFiniteNumber(report.rsf_delta),
    rsf_delta_percent: toFiniteNumber(report.rsf_delta_percent),
    tenant_impacts: (report.tenant_impacts ?? []).map((impact) => ({
      ...impact,
      prior_pro_rata_share: toFiniteNumber(impact.prior_pro_rata_share),
      current_pro_rata_share: toFiniteNumber(impact.current_pro_rata_share),
      share_delta_pct_points: toFiniteNumber(impact.share_delta_pct_points),
      prior_estimated_recovery: toFiniteNumber(impact.prior_estimated_recovery),
      current_estimated_recovery: toFiniteNumber(
        impact.current_estimated_recovery
      ),
      recovery_delta: toFiniteNumber(impact.recovery_delta),
    })),
  }
}

export function useDenominatorChangeReport(
  mutationOptions?: UseMutationOptions<
    DenominatorChangeReport,
    ApiError,
    DenominatorChangeRequest
  >
) {
  return useMutation<
    DenominatorChangeReport,
    ApiError,
    DenominatorChangeRequest
  >({
    mutationFn: async (request) => {
      const response = await apiClient.post<DenominatorChangeReport>({
        url: '/api/v1/analysis/denominator-change',
        body: request as unknown as Record<string, unknown>,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      return normalizeDenominatorChangeReport(
        response.data as DenominatorChangeReport
      )
    },
    ...mutationOptions,
  })
}

export function useExportDenominatorChangePdf(
  mutationOptions?: UseMutationOptions<void, ApiError, DenominatorChangeRequest>
) {
  return useMutation<void, ApiError, DenominatorChangeRequest>({
    mutationFn: async (request) => {
      const { blob, filename } = await fetchExportBlob(
        '/reports/denominator-change/pdf',
        request
      )
      triggerDownload(blob, filename)
    },
    ...mutationOptions,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tax Protest
// ─────────────────────────────────────────────────────────────────────────────

export interface PropertyDeadlineItem {
  property_id: string
  property_name: string
  county: string | null
  state: string | null
  effective_deadline: string | null
  days_remaining: number | null
  is_past: boolean
  is_configured: boolean
}

export interface TaxProtestDeadlinesResponse {
  items: PropertyDeadlineItem[]
  year: number
}

export interface TaxProtestExportRequest {
  snapshot_id: string
  tax_year: number
  county?: string
  state?: string
}

/**
 * Query tax protest deadlines for all org properties.
 */
export function useTaxProtestDeadlines(
  year?: number,
  queryOptions?: Omit<
    UseQueryOptions<TaxProtestDeadlinesResponse, ApiError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<TaxProtestDeadlinesResponse, ApiError>({
    queryKey: ['tax-protest-deadlines', year],
    queryFn: async () => {
      const session = await getSession()
      const params = new URLSearchParams()
      if (year) params.set('year', String(year))
      const response = await fetchWithApiTimeout(
        resolveApiUrl(`/api/v1/tax-protest/deadlines?${params}`),
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        }
      )
      if (!response.ok) {
        throw await apiErrorFromResponse(
          response,
          'Failed to fetch tax protest deadlines'
        )
      }
      return response.json()
    },
    ...queryOptions,
  })
}

/**
 * Generate and download the tax protest data package ZIP.
 */
export function useTaxProtestExport(
  mutationOptions?: UseMutationOptions<void, ApiError, TaxProtestExportRequest>
) {
  return useMutation<void, ApiError, TaxProtestExportRequest>({
    mutationFn: async (request) => {
      const { blob, filename } = await fetchExportBlob(
        '/tax-protest/generate',
        request
      )
      triggerDownload(blob, filename)
    },
    ...mutationOptions,
  })
}

// Re-export commonly used types for convenience
export type {
  ImportBatchSummary,
  DisputeSummaryDTO,
  DisputeDetailDTO,
  DisputeStatus,
  UpdateStatusRequest,
  AddCommentRequest,
  DisputeCommentDTO,
  ExpensePool,
  ExpensePoolCreateRequest,
  ExpensePoolUpdate,
  ExpensePoolListResponse,
  PoolMapping,
  PoolMappingCreateRequest,
  PoolMappingUpdate,
  PoolMappingListResponse,
}
