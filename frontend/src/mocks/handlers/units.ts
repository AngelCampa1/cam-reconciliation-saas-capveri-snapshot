/**
 * MSW handlers for unit endpoints
 *
 * Uses generated types to ensure mock responses match API contract.
 */
import { http, HttpResponse } from 'msw'
import type {
  Unit,
  UnitListResponse,
  UnitCreateRequest,
  UnitUpdate,
} from '@/api/generated/types.gen'
import { createUnit, createUnitList } from '../factories/unit'

// In-memory store for units during tests
let unitsStore: Unit[] = []

/**
 * Reset the units store - call between tests
 */
export function resetUnitsStore(): void {
  unitsStore = createUnitList(10)
}

/**
 * Add units for a specific property
 */
export function seedUnitsForProperty(propertyId: string, count: number): void {
  const newUnits = createUnitList(count, propertyId)
  unitsStore.push(...newUnits)
}

// Initialize with some units
resetUnitsStore()

export const unitHandlers = [
  // GET /api/v1/properties/:propertyId/units - List units for property
  http.get('*/api/v1/properties/:propertyId/units', ({ params, request }) => {
    const propertyId = params.propertyId as string
    const url = new URL(request.url)
    const skip = parseInt(url.searchParams.get('skip') || '0')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    const propertyUnits = unitsStore.filter((u) => u.property_id === propertyId)
    const paginatedData = propertyUnits.slice(skip, skip + limit)

    const response: UnitListResponse = {
      data: paginatedData,
      count: propertyUnits.length,
      has_more: propertyUnits.length > skip + limit,
    }

    return HttpResponse.json(response)
  }),

  // GET /api/v1/properties/:propertyId/units/:unitId - Get single unit
  http.get('*/api/v1/properties/:propertyId/units/:unitId', ({ params }) => {
    const propertyId = params.propertyId as string
    const unitId = params.unitId as string

    const unit = unitsStore.find(
      (u) => u.id === unitId && u.property_id === propertyId
    )

    if (!unit) {
      return HttpResponse.json({ detail: 'Unit not found' }, { status: 404 })
    }

    return HttpResponse.json(unit)
  }),

  // POST /api/v1/properties/:propertyId/units - Create unit
  http.post(
    '*/api/v1/properties/:propertyId/units',
    async ({ params, request }) => {
      const propertyId = params.propertyId as string
      const body = (await request.json()) as UnitCreateRequest

      const unit = createUnit({
        ...body,
        rentable_sqft: String(body.rentable_sqft),
        usable_sqft: String(body.usable_sqft),
        id: crypto.randomUUID(),
        property_id: propertyId,
      })

      unitsStore.push(unit)

      return HttpResponse.json(unit, { status: 201 })
    }
  ),

  // PUT /api/v1/properties/:propertyId/units/:unitId - Update unit
  http.put(
    '*/api/v1/properties/:propertyId/units/:unitId',
    async ({ params, request }) => {
      const propertyId = params.propertyId as string
      const unitId = params.unitId as string
      const body = (await request.json()) as UnitUpdate

      const index = unitsStore.findIndex(
        (u) => u.id === unitId && u.property_id === propertyId
      )

      if (index === -1) {
        return HttpResponse.json({ detail: 'Unit not found' }, { status: 404 })
      }

      // Non-null assertion is safe here since we've checked index !== -1
      const current = unitsStore[index]!
      const updatedUnit: Unit = {
        id: current.id,
        property_id: current.property_id,
        unit_number: body.unit_number ?? current.unit_number,
        rentable_sqft: body.rentable_sqft
          ? String(body.rentable_sqft)
          : current.rentable_sqft,
        usable_sqft: body.usable_sqft
          ? String(body.usable_sqft)
          : current.usable_sqft,
        floor: body.floor !== undefined ? body.floor : (current.floor ?? null),
        status: body.status ?? current.status ?? 'vacant',
        created_at: current.created_at,
        updated_at: new Date().toISOString(),
      }

      unitsStore[index] = updatedUnit

      return HttpResponse.json(updatedUnit)
    }
  ),

  // DELETE /api/v1/properties/:propertyId/units/:unitId - Delete unit
  http.delete('*/api/v1/properties/:propertyId/units/:unitId', ({ params }) => {
    const propertyId = params.propertyId as string
    const unitId = params.unitId as string

    const index = unitsStore.findIndex(
      (u) => u.id === unitId && u.property_id === propertyId
    )

    if (index === -1) {
      return HttpResponse.json({ detail: 'Unit not found' }, { status: 404 })
    }

    unitsStore.splice(index, 1)

    return new HttpResponse(null, { status: 204 })
  }),
]
