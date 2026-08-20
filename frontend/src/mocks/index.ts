/**
 * MSW Mocking Module
 *
 * Exports all MSW configuration for tests and development.
 */

// Server for Node.js (Vitest)
export { server, startServer, resetServer, stopServer } from './server'

// Handlers
export {
  handlers,
  resetAllStores,
  propertyHandlers,
  unitHandlers,
  leaseHandlers,
  resetPropertiesStore,
  resetUnitsStore,
  resetLeasesStore,
  seedUnitsForProperty,
  seedLeasesForProperty,
} from './handlers'

// Factories
export {
  createProperty,
  createPropertyList,
  createPropertyCreate,
  createTestProperty,
  createUnit,
  createUnitList,
  createUnitCreate,
  createTestUnit,
  createLease,
  createLeaseList,
  createLeaseCreate,
  createTestLease,
  createRecoveryProfile,
  createRecoveryProfileInput,
} from './factories'
