/**
 * Factory functions for creating test unit data
 *
 * Uses faker for realistic data generation while ensuring
 * type safety with generated API types.
 */
import { faker } from '@faker-js/faker'
import type {
  Unit,
  UnitCreateRequest,
  UnitStatus,
} from '@/api/generated/types.gen'

const UNIT_STATUSES: UnitStatus[] = ['vacant', 'occupied', 'under_renovation']

/**
 * Create a single unit with optional overrides
 */
export function createUnit(overrides: Partial<Unit> = {}): Unit {
  const rentableSqft = faker.number.int({ min: 1000, max: 50000 })
  const usableSqft = Math.floor(rentableSqft * 0.92)

  return {
    id: overrides.id ?? faker.string.uuid(),
    property_id: overrides.property_id ?? faker.string.uuid(),
    unit_number:
      overrides.unit_number ??
      `${faker.number.int({ min: 100, max: 999 })}${faker.helpers.arrayElement(['A', 'B', 'C', ''])}`,
    rentable_sqft: overrides.rentable_sqft ?? rentableSqft.toString(),
    usable_sqft: overrides.usable_sqft ?? usableSqft.toString(),
    floor:
      overrides.floor !== undefined
        ? overrides.floor
        : faker.number.int({ min: 1, max: 50 }),
    status: overrides.status ?? faker.helpers.arrayElement(UNIT_STATUSES),
    created_at: overrides.created_at ?? faker.date.past().toISOString(),
    updated_at: overrides.updated_at ?? faker.date.recent().toISOString(),
  }
}

/**
 * Create a list of units for a property
 */
export function createUnitList(
  count: number = 10,
  propertyId?: string
): Unit[] {
  return Array.from({ length: count }, () =>
    createUnit(propertyId ? { property_id: propertyId } : {})
  )
}

/**
 * Create a unit create DTO
 */
export function createUnitCreate(
  overrides: Partial<UnitCreateRequest> = {}
): UnitCreateRequest {
  const rentableSqft = faker.number.int({ min: 1000, max: 50000 })
  const usableSqft = Math.floor(rentableSqft * 0.92)

  return {
    unit_number:
      overrides.unit_number ??
      `${faker.number.int({ min: 100, max: 999 })}${faker.helpers.arrayElement(['A', 'B', 'C', ''])}`,
    rentable_sqft: overrides.rentable_sqft ?? rentableSqft.toString(),
    usable_sqft: overrides.usable_sqft ?? usableSqft.toString(),
    floor:
      overrides.floor !== undefined
        ? overrides.floor
        : faker.number.int({ min: 1, max: 50 }),
    status: overrides.status ?? faker.helpers.arrayElement(UNIT_STATUSES),
  }
}

/**
 * Create a specific test unit for consistent testing
 */
export function createTestUnit(propertyId: string = 'test-property-123'): Unit {
  return createUnit({
    id: 'test-unit-789',
    property_id: propertyId,
    unit_number: '101A',
    rentable_sqft: '2500',
    usable_sqft: '2300',
    floor: 1,
    status: 'occupied',
  })
}
