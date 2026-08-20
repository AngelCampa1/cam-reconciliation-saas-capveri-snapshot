/**
 * API Client Configuration
 *
 * Wraps the generated client with authentication and error handling.
 * Provides a configured client instance for use throughout the application.
 */
import { createClient, createConfig, type Client } from '@hey-api/client-fetch'
import { ApiError, isErrorEnvelope } from './errors'
import { getCorrelationId, setCorrelationId } from '../lib/correlationId'
import { getApiBaseUrl } from './url'

/**
 * Auth session interface.
 * This matches the Supabase session structure.
 */
export interface AuthSession {
  access_token: string
  refresh_token?: string
  expires_at?: number
  user?: {
    id: string
    email?: string
  }
}

/**
 * Auth provider interface for getting/clearing sessions.
 * Implemented by the auth module when available.
 */
export interface AuthProvider {
  getSession: () => Promise<AuthSession | null>
  signOut: () => Promise<void>
}

// Default auth provider (no-op until auth is configured)
let authProvider: AuthProvider = {
  getSession: async () => null,
  signOut: async () => {},
}

/**
 * Configure the auth provider for the API client.
 * Call this once during app initialization with your auth implementation.
 *
 * @param provider - Auth provider with getSession and signOut methods
 */
export function configureAuth(provider: AuthProvider): void {
  authProvider = provider
}

/**
 * Get the current auth session.
 * Used internally by the client to get the access token.
 */
export async function getSession(): Promise<AuthSession | null> {
  return authProvider.getSession()
}

/**
 * Sign out the current user.
 * Used internally when receiving 401 responses.
 */
export async function signOut(): Promise<void> {
  return authProvider.signOut()
}

/**
 * Create a configured API client instance.
 *
 * Features:
 * - Automatic auth token injection
 * - Base URL configuration
 * - Error response transformation
 * - 401 handling with redirect to login
 */
/**
 * Custom fetch wrapper that adds a 30s timeout and maps TimeoutError to ApiError.
 */
async function fetchWithTimeout(request: Request): Promise<Response> {
  let timeoutRequest = request
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    timeoutRequest = new Request(request, {
      signal: AbortSignal.timeout(30_000),
    })
  }
  try {
    return await fetch(timeoutRequest)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('Request timed out. Please try again.', 408)
    }
    throw error
  }
}

export function createApiClient(): Client {
  const client = createClient(
    createConfig({
      baseUrl: getApiBaseUrl(),
      fetch: fetchWithTimeout,
    })
  )

  // Request interceptor: add auth token and correlation ID
  client.interceptors.request.use(async (request) => {
    const session = await getSession()

    if (session?.access_token) {
      request.headers.set('Authorization', `Bearer ${session.access_token}`)
    }

    // Add correlation ID for request tracing
    const correlationId = getCorrelationId()
    if (correlationId) {
      request.headers.set('X-Correlation-ID', correlationId)
    }

    return request
  })

  // Response interceptor: handle errors and capture correlation ID
  client.interceptors.response.use(async (response) => {
    // Capture correlation ID from backend response for tracing
    const responseCorrelationId = response.headers.get('X-Correlation-ID')
    if (responseCorrelationId) {
      setCorrelationId(responseCorrelationId)
    }

    // Handle 401 - session expired
    if (response.status === 401) {
      // Let Supabase own its persisted session. Manually deleting the
      // `sb-*-auth-token` key here used to race Supabase's own storage writes:
      // when several requests hit a 401 at once (or one fires moments before a
      // background token refresh lands), wiping the key out from under Supabase
      // could destroy a still-valid refresh token and force a spurious logout.
      // signOut() (supabase.auth.signOut) clears its own storage atomically.
      await signOut()
      // Redirect to login with expired flag
      if (typeof window !== 'undefined') {
        const destination =
          window.location.pathname +
          window.location.search +
          window.location.hash
        window.location.href = `/auth/login?expired=true&returnUrl=${encodeURIComponent(destination)}`
      }
      throw new ApiError('Session expired', 401)
    }

    // Handle 402 - trial ended / subscription required
    // The backend detail starts with "subscription_required:" for these errors.
    // We redirect mutating actions to plan selection rather than surfacing a
    // raw error toast. GET requests (data reads) still render normally, only
    // the response interceptor redirect applies to the thrown ApiError path.
    if (response.status === 402) {
      if (typeof window !== 'undefined') {
        window.location.href = '/settings/billing?intent=select-plan'
      }
      throw new ApiError(
        'Your trial has ended. Pick a plan to keep going.',
        402
      )
    }

    // Note: @hey-api/client-fetch handles other HTTP error status codes (404, 422, 500, etc.)
    // internally and doesn't call the error interceptor for them. They are returned in result.error.
    // For custom error handling of these status codes, check result.error at the call site.

    return response
  })

  // Error interceptor: transform errors to ApiError
  client.interceptors.error.use(async (error, response) => {
    // If already an ApiError, return it
    if (error instanceof ApiError) {
      return error
    }

    // For non-2xx responses, @hey-api/client-fetch already parsed and consumed
    // the response body, handing it to us here as `error` (the backend JSON
    // envelope: { status_code, message?, detail? }). We must read it from
    // `error` (re-reading `response` would fail because the body stream is
    // already consumed, dropping the detail and leaving a generic message.
    if (isErrorEnvelope(error)) {
      return ApiError.fromUnknown(error)
    }

    // If we have a response parameter, create ApiError from it
    if (response) {
      return await ApiError.fromResponse(response)
    }

    // Check if error object has a response property (some libraries do this)
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response instanceof Response
    ) {
      return await ApiError.fromResponse(error.response)
    }

    // Network or other error
    return ApiError.fromUnknown(error)
  })

  return client
}

/**
 * Default API client instance.
 * Pre-configured with auth and error handling.
 */
export const apiClient = createApiClient()

// Re-export types and SDK functions for convenience
export * from './generated/types.gen'
export {
  // Properties
  listPropertiesApiV1PropertiesGet,
  createPropertyApiV1PropertiesPost,
  getPropertyApiV1PropertiesPropertyIdGet,
  updatePropertyApiV1PropertiesPropertyIdPut,
  deletePropertyApiV1PropertiesPropertyIdDelete,
  listPropertyImportsApiV1PropertiesPropertyIdImportsGet,
  // Units
  listUnitsApiV1PropertiesPropertyIdUnitsGet,
  createUnitApiV1PropertiesPropertyIdUnitsPost,
  getUnitApiV1PropertiesPropertyIdUnitsUnitIdGet,
  updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut,
  deleteUnitApiV1PropertiesPropertyIdUnitsUnitIdDelete,
  // Leases
  listLeasesApiV1LeasesGet,
  createLeaseApiV1LeasesPost,
  getLeaseApiV1LeasesLeaseIdGet,
  updateLeaseApiV1LeasesLeaseIdPut,
  deleteLeaseApiV1LeasesLeaseIdDelete,
  getRecoveryProfileApiV1LeasesLeaseIdRecoveryProfileGet,
  updateRecoveryProfileApiV1LeasesLeaseIdRecoveryProfilePut,
  // Extractions
  listExtractionsApiV1ExtractionsGet,
  getExtractionDetailApiV1ExtractionsDocumentIdGet,
  processExtractionApiV1ExtractionsDocumentIdProcessPost,
  approveExtractionApiV1ExtractionsDocumentIdApprovePut,
  rejectExtractionApiV1ExtractionsDocumentIdRejectPut,
  saveDraftApiV1ExtractionsDocumentIdDraftPut,
  getJobStatusApiV1ExtractionsJobsJobIdGet,
  retryJobApiV1ExtractionsJobsJobIdRetryPost,
  // Reconciliation
  calculateReconciliationApiV1ReconciliationCalculatePost,
  getJobStatusApiV1ReconciliationJobsJobIdGet,
  getSnapshotApiV1ReconciliationSnapshotsSnapshotIdGet,
  listSnapshotsApiV1ReconciliationSnapshotsGet,
  finalizeSnapshotApiV1ReconciliationSnapshotsSnapshotIdFinalizePost,
  finalizeSnapshotsBatchApiV1ReconciliationSnapshotsFinalizeBatchPost,
  updateReconciliationCellApiV1ReconciliationCellsCellIdPatch,
  // Ingestion
  uploadFileApiV1IngestionUploadPost,
  listImportBatchesApiV1IngestionBatchesGet,
  getImportBatchApiV1IngestionBatchesBatchIdGet,
  deleteImportBatchApiV1IngestionBatchesBatchIdDelete,
  retryImportBatchApiV1IngestionBatchesBatchIdRetryPost,
  listColumnMappingsApiV1IngestionMappingsGet,
  createColumnMappingApiV1IngestionMappingsPost,
  // Tenant
  validateInvitationTokenApiV1TenantInvitationsTokenValidateGet,
  tenantSignupApiV1TenantSignupPost,
  // Disputes (Admin/Landlord)
  listOrganizationDisputesApiV1DisputesGet,
  getDisputeApiV1DisputesDisputeIdGet,
  updateDisputeStatusApiV1DisputesDisputeIdStatusPut,
  addAdminCommentApiV1DisputesDisputeIdCommentsPost,
  // Expense Pools
  listExpensePoolsApiV1PropertiesPropertyIdExpensePoolsGet,
  createExpensePoolApiV1PropertiesPropertyIdExpensePoolsPost,
  getExpensePoolApiV1PropertiesPropertyIdExpensePoolsPoolIdGet,
  updateExpensePoolApiV1PropertiesPropertyIdExpensePoolsPoolIdPut,
  deleteExpensePoolApiV1PropertiesPropertyIdExpensePoolsPoolIdDelete,
  // Pool Mappings
  listPoolMappingsApiV1PropertiesPropertyIdPoolMappingsGet,
  createPoolMappingApiV1PropertiesPropertyIdPoolMappingsPost,
  updatePoolMappingApiV1PropertiesPropertyIdPoolMappingsMappingIdPut,
  deletePoolMappingApiV1PropertiesPropertyIdPoolMappingsMappingIdDelete,
  // Pool Templates
  listTemplatesApiV1PoolTemplatesGet,
  createTemplateApiV1PoolTemplatesPost,
  getTemplateApiV1PoolTemplatesTemplateIdGet,
  updateTemplateApiV1PoolTemplatesTemplateIdPut,
  deleteTemplateApiV1PoolTemplatesTemplateIdDelete,
  applyTemplateApiV1PoolTemplatesApplyPost,
  copyPoolsApiV1PoolTemplatesCopyPost,
  // Health
  healthCheckHealthGet,
  // Billing
  createPortalSessionApiV1BillingPortalPost,
  cancelSubscriptionApiV1BillingSubscriptionCancelPost,
  resumeSubscriptionApiV1BillingSubscriptionResumePost,
  listPaymentMethodsApiV1BillingPaymentMethodsGet,
  // Campaigns
  listCampaignsApiV1CampaignsGet,
  submitForReviewApiV1CampaignsCampaignIdSubmitForReviewPost,
  approveCampaignApiV1CampaignsCampaignIdApprovePost,
  rejectCampaignApiV1CampaignsCampaignIdRejectPost,
  markSentApiV1CampaignsCampaignIdMarkSentPost,
} from './generated/sdk.gen'

// Re-export error utilities
export { ApiError, isApiError, getErrorMessage } from './errors'
