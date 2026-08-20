/**
 * Test Data Factories
 *
 * Exports factory functions for creating realistic test data
 * that matches the generated API types.
 */

// Property factories
export {
  createProperty,
  createPropertyList,
  createPropertyCreate,
  createTestProperty,
} from './property'

// Unit factories
export {
  createUnit,
  createUnitList,
  createUnitCreate,
  createTestUnit,
} from './unit'

// Lease factories
export {
  createLease,
  createLeaseList,
  createLeaseCreate,
  createTestLease,
  createRecoveryProfile,
  createRecoveryProfileInput,
} from './lease'
