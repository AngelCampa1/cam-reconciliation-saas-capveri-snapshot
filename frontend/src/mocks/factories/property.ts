/**
 * Factory functions for creating test property data
 *
 * Uses faker for realistic data generation while ensuring
 * type safety with generated API types.
 */
import { faker } from '@faker-js/faker'
import type { Property, PropertyCreate } from '@/api/generated/types.gen'

/**
 * Create a single property with optional overrides
 */
export function createProperty(overrides: Partial<Property> = {}): Property {
  const rentableSqft = faker.number.int({ min: 10000, max: 500000 })
  const usableSqft = Math.floor(rentableSqft * 0.9)
  const commonAreaSqft = rentableSqft - usableSqft

  const maybeAddress2 = faker.helpers.maybe(
    () => `Suite ${faker.number.int(999)}`
  )

  return {
    id: overrides.id ?? faker.string.uuid(),
    organization_id: overrides.organization_id ?? faker.string.uuid(),
    name: overrides.name ?? faker.company.name() + ' Tower',
    address_line1: overrides.address_line1 ?? faker.location.streetAddress(),
    address_line2:
      overrides.address_line2 !== undefined
        ? overrides.address_line2
        : (maybeAddress2 ?? null),
    city: overrides.city ?? faker.location.city(),
    state: overrides.state ?? faker.location.state({ abbreviated: true }),
    postal_code: overrides.postal_code ?? faker.location.zipCode(),
    total_rentable_sqft:
      overrides.total_rentable_sqft ?? rentableSqft.toString(),
    total_usable_sqft: overrides.total_usable_sqft ?? usableSqft.toString(),
    common_area_sqft: overrides.common_area_sqft ?? commonAreaSqft.toString(),
    target_occupancy: overrides.target_occupancy ?? '0.95',
    created_at: overrides.created_at ?? faker.date.past().toISOString(),
    updated_at: overrides.updated_at ?? faker.date.recent().toISOString(),
  }
}

/**
 * Create a list of properties
 */
export function createPropertyList(count: number = 10): Property[] {
  return Array.from({ length: count }, () => createProperty())
}

/**
 * Create a property create DTO from a property
 */
export function createPropertyCreate(
  overrides: Partial<PropertyCreate> = {}
): PropertyCreate {
  const rentableSqft = faker.number.int({ min: 10000, max: 500000 })
  const usableSqft = Math.floor(rentableSqft * 0.9)
  const commonAreaSqft = rentableSqft - usableSqft
  const maybeAddress2 = faker.helpers.maybe(
    () => `Suite ${faker.number.int(999)}`
  )

  return {
    name: overrides.name ?? faker.company.name() + ' Tower',
    address_line1: overrides.address_line1 ?? faker.location.streetAddress(),
    address_line2:
      overrides.address_line2 !== undefined
        ? overrides.address_line2
        : (maybeAddress2 ?? null),
    city: overrides.city ?? faker.location.city(),
    state: overrides.state ?? faker.location.state({ abbreviated: true }),
    postal_code: overrides.postal_code ?? faker.location.zipCode(),
    total_rentable_sqft:
      overrides.total_rentable_sqft ?? rentableSqft.toString(),
    total_usable_sqft: overrides.total_usable_sqft ?? usableSqft.toString(),
    common_area_sqft: overrides.common_area_sqft ?? commonAreaSqft.toString(),
    target_occupancy: overrides.target_occupancy ?? '0.95',
  }
}

/**
 * Create a specific test property for consistent testing
 */
export function createTestProperty(): Property {
  return createProperty({
    id: 'test-property-123',
    organization_id: 'test-org-456',
    name: 'Test Property',
    address_line1: '123 Test Street',
    city: 'Test City',
    state: 'NY',
    postal_code: '10001',
    total_rentable_sqft: '50000',
    total_usable_sqft: '45000',
    common_area_sqft: '5000',
  })
}
