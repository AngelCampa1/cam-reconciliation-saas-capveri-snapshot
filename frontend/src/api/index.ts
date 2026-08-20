/**
 * API Client Module
 *
 * This module exports the API client, hooks, error handling, and types.
 * Auto-generated types come from the backend OpenAPI specification.
 *
 * Usage:
 *   import { apiClient, useProperties, ApiError } from '@/api';
 *
 * To regenerate types after backend changes:
 *   npm run generate-api-client
 */

// Client configuration
export {
  apiClient,
  createApiClient,
  configureAuth,
  getSession,
  signOut,
  type AuthSession,
  type AuthProvider,
} from './client'

// Error handling
export { ApiError, isApiError, getErrorMessage } from './errors'
export type { ValidationErrorDetail } from './errors'

// React Query hooks: re-export the full hooks module so every hook
// (useImportBatches, usePropertyImports, useDisputes, export/SB1103/tax-protest/
// demand-letter/cap-bank hooks, etc.) is reachable from the `@/api` barrel, not
// just the original Properties/Units/Leases/Reconciliation/Campaigns subset
// (F-113). queryKeys, CampaignSummary, and CampaignTransitionResponse are all
// re-exported by this star.
export * from './hooks'

// Re-export generated types and SDK.
export * from './generated'

// `hooks.ts` re-declares a handful of request/response type names that also
// exist in the generated SDK. Two `export *` sources sharing a name is
// ambiguous (TS2308), so re-export these explicitly from './generated' to keep
// the generated definition as the one `@/api` exposes, preserving the behavior
// from before the full-hooks star above (F-113).
export type {
  BatchPDFRequest,
  BoardExportRequest,
  CapBankLedgerEntry,
  DemandLetterRequest,
  DenominatorChangePdfRequest,
  DenominatorChangeReport,
  DenominatorChangeRequest,
  ERPExportRequest,
  PDFExportRequest,
  PropertyDeadlineItem,
  RentRollImportResponse,
  RentRollPreviewResponse,
  SB1103ListResponse,
  VarianceReportRequest,
} from './generated'
