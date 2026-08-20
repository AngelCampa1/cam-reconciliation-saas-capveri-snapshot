/**
 * MSW Request Handlers
 *
 * Aggregates all API endpoint handlers for use with MSW.
 * Import this in your test setup or browser mock configuration.
 */
import { propertyHandlers, resetPropertiesStore } from './properties'
import { unitHandlers, resetUnitsStore } from './units'
import { leaseHandlers, resetLeasesStore } from './leases'
import { dashboardHandlers, resetDashboardData } from './dashboard'
import { authHandlers, resetAuthState } from './auth'
import { analysisHandlers, resetAnalysisState } from './analysis'
import { glIngestionHandlers, resetGLIngestionStore } from './gl-ingestion'
import { portfolioHandlers, resetPortfolioData } from './portfolio'
import { auxiliaryHandlers, resetAuxiliaryData } from './auxiliary'

/**
 * All handlers for MSW
 */
export const handlers = [
  ...propertyHandlers,
  ...unitHandlers,
  ...leaseHandlers,
  ...dashboardHandlers,
  ...authHandlers,
  ...analysisHandlers,
  ...glIngestionHandlers,
  ...portfolioHandlers,
  ...auxiliaryHandlers,
]

/**
 * Reset all stores to their initial state
 * Call this in beforeEach or afterEach in tests
 */
export function resetAllStores(): void {
  resetPropertiesStore()
  resetUnitsStore()
  resetLeasesStore()
  resetDashboardData()
  resetAuthState()
  resetAnalysisState()
  resetGLIngestionStore()
  resetPortfolioData()
  resetAuxiliaryData()
}

// Re-export individual handlers and utilities
export { propertyHandlers, resetPropertiesStore } from './properties'
export { unitHandlers, resetUnitsStore, seedUnitsForProperty } from './units'
export {
  leaseHandlers,
  resetLeasesStore,
  seedLeasesForProperty,
} from './leases'
export {
  dashboardHandlers,
  resetDashboardData,
  setDashboardData,
  getDashboardErrorHandler,
} from './dashboard'
export { authHandlers, resetAuthState } from './auth'
export {
  analysisHandlers,
  resetAnalysisState,
  seedAvailableYears,
} from './analysis'
export {
  glIngestionHandlers,
  resetGLIngestionStore,
  seedGLPeriods,
  setUploadAuthFailure,
} from './gl-ingestion'
export {
  portfolioHandlers,
  resetPortfolioData,
  setPortfolioData,
  getPortfolioErrorHandler,
} from './portfolio'
export { auxiliaryHandlers, resetAuxiliaryData } from './auxiliary'
