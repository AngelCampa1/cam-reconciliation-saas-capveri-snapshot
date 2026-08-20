/**
 * Factory functions for creating test lease data
 *
 * Uses faker for realistic data generation while ensuring
 * type safety with generated API types.
 */
import { faker } from '@faker-js/faker'
import type {
  Lease,
  LeaseCreate,
  LeaseStatus,
  LeaseRecoveryProfile_Output,
  LeaseRecoveryProfile_Input,
  CapType,
} from '@/api/generated/types.gen'

const LEASE_STATUSES: LeaseStatus[] = [
  'draft',
  'active',
  'expired',
  'terminated',
]
const CAP_TYPES: CapType[] = [
  'none',
  'non_cumulative',
  'cumulative',
  'cumulative_compounding',
]

/**
 * Create a recovery profile with optional overrides
 */
export function createRecoveryProfile(
  overrides: Partial<LeaseRecoveryProfile_Output> = {}
): LeaseRecoveryProfile_Output {
  const hasCapRate = faker.datatype.boolean()
  const capType = hasCapRate
    ? faker.helpers.arrayElement(CAP_TYPES.filter((t) => t !== 'none'))
    : 'none'

  const maybeBaseYear = faker.helpers.maybe(() =>
    faker.number.int({ min: 2018, max: 2024 })
  )
  const maybeBaseYearAmount = faker.helpers.maybe(() =>
    faker.number.int({ min: 10000, max: 100000 }).toString()
  )

  return {
    base_year: maybeBaseYear ?? null,
    base_year_amount: maybeBaseYearAmount ?? null,
    gross_up_base_year: faker.datatype.boolean(),
    pro_rata_share: faker.number.float({ min: 0.01, max: 0.25 }).toFixed(4),
    cap_type: capType,
    cap_rate: hasCapRate
      ? faker.number.float({ min: 0.03, max: 0.1 }).toFixed(4)
      : null,
    admin_fee_percentage: '0.15',
    excluded_pools: [],
    ...overrides,
  }
}

/**
 * Create a recovery profile input DTO
 */
export function createRecoveryProfileInput(
  overrides: Partial<LeaseRecoveryProfile_Input> = {}
): LeaseRecoveryProfile_Input {
  const maybeBaseYear = faker.helpers.maybe(() =>
    faker.number.int({ min: 2018, max: 2024 })
  )

  return {
    base_year:
      overrides.base_year !== undefined
        ? overrides.base_year
        : (maybeBaseYear ?? null),
    gross_up_base_year:
      overrides.gross_up_base_year ?? faker.datatype.boolean(),
    pro_rata_share:
      overrides.pro_rata_share ??
      faker.number.float({ min: 0.01, max: 0.25 }).toFixed(4),
    cap_type: overrides.cap_type ?? 'none',
    admin_fee_percentage: overrides.admin_fee_percentage ?? '0.15',
    excluded_pools: overrides.excluded_pools ?? [],
  }
}

/**
 * Create a single lease with optional overrides
 */
export function createLease(overrides: Partial<Lease> = {}): Lease {
  const startDate = faker.date.past({ years: 2 })
  const endDate = faker.date.future({ years: 5, refDate: startDate })
  const maybeUnitId = faker.helpers.maybe(() => faker.string.uuid())
  const maybeDocUrl = faker.helpers.maybe(
    () => `https://storage.example.com/leases/${faker.string.uuid()}.pdf`
  )

  return {
    id: overrides.id ?? faker.string.uuid(),
    property_id: overrides.property_id ?? faker.string.uuid(),
    unit_id:
      overrides.unit_id !== undefined
        ? overrides.unit_id
        : (maybeUnitId ?? null),
    tenant_name: overrides.tenant_name ?? faker.company.name(),
    start_date:
      overrides.start_date ?? startDate.toISOString().substring(0, 10),
    end_date: overrides.end_date ?? endDate.toISOString().substring(0, 10),
    status: overrides.status ?? faker.helpers.arrayElement(LEASE_STATUSES),
    recovery_profile: overrides.recovery_profile ?? createRecoveryProfile(),
    document_url:
      overrides.document_url !== undefined
        ? overrides.document_url
        : (maybeDocUrl ?? null),
    created_at: overrides.created_at ?? faker.date.past().toISOString(),
    updated_at: overrides.updated_at ?? faker.date.recent().toISOString(),
  }
}

/**
 * Create a list of leases
 */
export function createLeaseList(
  count: number = 10,
  propertyId?: string
): Lease[] {
  return Array.from({ length: count }, () =>
    createLease(propertyId ? { property_id: propertyId } : {})
  )
}

/**
 * Create a lease create DTO
 */
export function createLeaseCreate(
  overrides: Partial<LeaseCreate> = {}
): LeaseCreate {
  const startDate = faker.date.past({ years: 1 })
  const endDate = faker.date.future({ years: 5, refDate: startDate })
  const maybeUnitId = faker.helpers.maybe(() => faker.string.uuid())

  return {
    property_id: overrides.property_id ?? faker.string.uuid(),
    unit_id:
      overrides.unit_id !== undefined
        ? overrides.unit_id
        : (maybeUnitId ?? null),
    tenant_name: overrides.tenant_name ?? faker.company.name(),
    start_date:
      overrides.start_date ?? startDate.toISOString().substring(0, 10),
    end_date: overrides.end_date ?? endDate.toISOString().substring(0, 10),
    status: overrides.status ?? 'draft',
    recovery_profile:
      overrides.recovery_profile ?? createRecoveryProfileInput(),
    document_url:
      overrides.document_url !== undefined ? overrides.document_url : null,
  }
}

/**
 * Create a specific test lease for consistent testing
 */
export function createTestLease(
  propertyId: string = 'test-property-123'
): Lease {
  return createLease({
    id: 'test-lease-abc',
    property_id: propertyId,
    unit_id: 'test-unit-789',
    tenant_name: 'Test Tenant Inc.',
    start_date: '2024-01-01',
    end_date: '2028-12-31',
    status: 'active',
    recovery_profile: {
      base_year: 2024,
      base_year_amount: '50000',
      gross_up_base_year: true,
      pro_rata_share: '0.0500',
      cap_type: 'cumulative',
      cap_rate: '0.0500',
      admin_fee_percentage: '0.15',
      excluded_pools: [],
    },
  })
}
