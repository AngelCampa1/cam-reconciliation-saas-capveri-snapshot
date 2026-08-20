/**
 * MSW handlers for lease endpoints
 *
 * Uses generated types to ensure mock responses match API contract.
 */
import { http, HttpResponse } from 'msw'
import type {
  Lease,
  LeaseListResponse,
  LeaseCreate,
  LeaseUpdate,
  LeaseRecoveryProfile_Input,
} from '@/api/generated/types.gen'
import {
  createLease,
  createLeaseList,
  createRecoveryProfile,
} from '../factories/lease'

// In-memory store for leases during tests
let leasesStore: Lease[] = []

/**
 * Reset the leases store - call between tests
 */
export function resetLeasesStore(): void {
  leasesStore = createLeaseList(8)
}

/**
 * Add leases for a specific property
 */
export function seedLeasesForProperty(propertyId: string, count: number): void {
  const newLeases = createLeaseList(count, propertyId)
  leasesStore.push(...newLeases)
}

// Initialize with some leases
resetLeasesStore()

export const leaseHandlers = [
  // GET /api/v1/leases - List leases
  http.get('*/api/v1/leases', ({ request }) => {
    const url = new URL(request.url)
    const skip = parseInt(url.searchParams.get('skip') || '0')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const propertyId = url.searchParams.get('property_id')

    let filteredLeases = leasesStore
    if (propertyId) {
      filteredLeases = leasesStore.filter((l) => l.property_id === propertyId)
    }

    const paginatedData = filteredLeases.slice(skip, skip + limit)

    const response: LeaseListResponse = {
      data: paginatedData,
      count: filteredLeases.length,
      has_more: filteredLeases.length > skip + limit,
    }

    return HttpResponse.json(response)
  }),

  // GET /api/v1/leases/:leaseId - Get single lease
  http.get('*/api/v1/leases/:leaseId', ({ params }) => {
    const leaseId = params.leaseId as string
    const lease = leasesStore.find((l) => l.id === leaseId)

    if (!lease) {
      return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 })
    }

    return HttpResponse.json(lease)
  }),

  // POST /api/v1/leases - Create lease
  http.post('*/api/v1/leases', async ({ request }) => {
    const body = (await request.json()) as LeaseCreate

    // Convert Input profile to Output profile format
    const recoveryProfile = createRecoveryProfile({
      base_year: body.recovery_profile.base_year ?? null,
      base_year_amount: body.recovery_profile.base_year_amount
        ? String(body.recovery_profile.base_year_amount)
        : null,
      gross_up_base_year: body.recovery_profile.gross_up_base_year ?? false,
      pro_rata_share: String(body.recovery_profile.pro_rata_share),
      cap_type: body.recovery_profile.cap_type ?? 'none',
      cap_rate: body.recovery_profile.cap_rate
        ? String(body.recovery_profile.cap_rate)
        : null,
      admin_fee_percentage: body.recovery_profile.admin_fee_percentage
        ? String(body.recovery_profile.admin_fee_percentage)
        : '0.15',
      excluded_pools: body.recovery_profile.excluded_pools ?? [],
    })

    const lease = createLease({
      id: crypto.randomUUID(),
      property_id: body.property_id,
      unit_id: body.unit_id ?? null,
      tenant_name: body.tenant_name,
      start_date: body.start_date,
      end_date: body.end_date,
      status: body.status ?? 'draft',
      recovery_profile: recoveryProfile,
      document_url: body.document_url ?? null,
    })

    leasesStore.push(lease)

    return HttpResponse.json(lease, { status: 201 })
  }),

  // PUT /api/v1/leases/:leaseId - Update lease
  http.put('*/api/v1/leases/:leaseId', async ({ params, request }) => {
    const leaseId = params.leaseId as string
    const body = (await request.json()) as LeaseUpdate

    const index = leasesStore.findIndex((l) => l.id === leaseId)

    if (index === -1) {
      return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 })
    }

    // Non-null assertion is safe since we've checked index !== -1
    const current = leasesStore[index]!
    const updatedLease: Lease = {
      id: current.id,
      property_id: current.property_id,
      unit_id:
        body.unit_id !== undefined ? body.unit_id : (current.unit_id ?? null),
      tenant_name: body.tenant_name ?? current.tenant_name,
      start_date: body.start_date ?? current.start_date,
      end_date: body.end_date ?? current.end_date,
      status: body.status ?? current.status ?? 'draft',
      recovery_profile: body.recovery_profile
        ? {
            base_year:
              body.recovery_profile.base_year !== undefined
                ? body.recovery_profile.base_year
                : (current.recovery_profile.base_year ?? null),
            base_year_amount: body.recovery_profile.base_year_amount
              ? String(body.recovery_profile.base_year_amount)
              : (current.recovery_profile.base_year_amount ?? null),
            gross_up_base_year:
              body.recovery_profile.gross_up_base_year ??
              current.recovery_profile.gross_up_base_year ??
              false,
            pro_rata_share: body.recovery_profile.pro_rata_share
              ? String(body.recovery_profile.pro_rata_share)
              : current.recovery_profile.pro_rata_share,
            cap_type:
              body.recovery_profile.cap_type ??
              current.recovery_profile.cap_type ??
              'none',
            cap_rate: body.recovery_profile.cap_rate
              ? String(body.recovery_profile.cap_rate)
              : (current.recovery_profile.cap_rate ?? null),
            admin_fee_percentage: body.recovery_profile.admin_fee_percentage
              ? String(body.recovery_profile.admin_fee_percentage)
              : (current.recovery_profile.admin_fee_percentage ?? '0.15'),
            excluded_pools:
              body.recovery_profile.excluded_pools ??
              current.recovery_profile.excluded_pools ??
              [],
          }
        : current.recovery_profile,
      document_url:
        body.document_url !== undefined
          ? body.document_url
          : (current.document_url ?? null),
      created_at: current.created_at,
      updated_at: new Date().toISOString(),
    }

    leasesStore[index] = updatedLease

    return HttpResponse.json(updatedLease)
  }),

  // DELETE /api/v1/leases/:leaseId - Delete lease
  http.delete('*/api/v1/leases/:leaseId', ({ params }) => {
    const leaseId = params.leaseId as string
    const index = leasesStore.findIndex((l) => l.id === leaseId)

    if (index === -1) {
      return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 })
    }

    leasesStore.splice(index, 1)

    return new HttpResponse(null, { status: 204 })
  }),

  // GET /api/v1/leases/:leaseId/recovery-profile - Get recovery profile
  http.get('*/api/v1/leases/:leaseId/recovery-profile', ({ params }) => {
    const leaseId = params.leaseId as string
    const lease = leasesStore.find((l) => l.id === leaseId)

    if (!lease) {
      return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 })
    }

    return HttpResponse.json(lease.recovery_profile)
  }),

  // PUT /api/v1/leases/:leaseId/recovery-profile - Update recovery profile
  http.put(
    '*/api/v1/leases/:leaseId/recovery-profile',
    async ({ params, request }) => {
      const leaseId = params.leaseId as string
      const body = (await request.json()) as LeaseRecoveryProfile_Input

      const index = leasesStore.findIndex((l) => l.id === leaseId)

      if (index === -1) {
        return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 })
      }

      // Non-null assertion is safe since we've checked index !== -1
      const current = leasesStore[index]!
      const updatedProfile = createRecoveryProfile({
        base_year:
          body.base_year !== undefined
            ? body.base_year
            : (current.recovery_profile.base_year ?? null),
        base_year_amount: body.base_year_amount
          ? String(body.base_year_amount)
          : (current.recovery_profile.base_year_amount ?? null),
        gross_up_base_year:
          body.gross_up_base_year ??
          current.recovery_profile.gross_up_base_year ??
          false,
        pro_rata_share: body.pro_rata_share
          ? String(body.pro_rata_share)
          : current.recovery_profile.pro_rata_share,
        cap_type: body.cap_type ?? current.recovery_profile.cap_type ?? 'none',
        cap_rate: body.cap_rate
          ? String(body.cap_rate)
          : (current.recovery_profile.cap_rate ?? null),
        admin_fee_percentage: body.admin_fee_percentage
          ? String(body.admin_fee_percentage)
          : (current.recovery_profile.admin_fee_percentage ?? '0.15'),
        excluded_pools:
          body.excluded_pools ?? current.recovery_profile.excluded_pools ?? [],
      })

      const updatedLease: Lease = {
        id: current.id,
        property_id: current.property_id,
        unit_id: current.unit_id ?? null,
        tenant_name: current.tenant_name,
        start_date: current.start_date,
        end_date: current.end_date,
        status: current.status ?? 'draft',
        recovery_profile: updatedProfile,
        document_url: current.document_url ?? null,
        created_at: current.created_at,
        updated_at: new Date().toISOString(),
      }

      leasesStore[index] = updatedLease

      // The API returns the full Lease, not just the profile
      return HttpResponse.json(updatedLease)
    }
  ),
]
