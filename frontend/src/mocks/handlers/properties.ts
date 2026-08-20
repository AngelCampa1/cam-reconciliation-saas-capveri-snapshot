/**
 * MSW handlers for property endpoints
 *
 * Uses generated types to ensure mock responses match API contract.
 */
import { http, HttpResponse } from 'msw'
import type {
  Property,
  PropertyListResponse,
  PropertyCreate,
  PropertyUpdate,
} from '@/api/generated/types.gen'
import { createProperty, createPropertyList } from '../factories/property'

// In-memory store for properties during tests
let propertiesStore: Property[] = []

/**
 * Reset the properties store - call between tests
 */
export function resetPropertiesStore(): void {
  propertiesStore = createPropertyList(5)
}

// Initialize with some properties
resetPropertiesStore()

export const propertyHandlers = [
  // GET /api/v1/properties - List properties
  http.get('*/api/v1/properties', ({ request }) => {
    const url = new URL(request.url)
    const skip = parseInt(url.searchParams.get('skip') || '0')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    const paginatedData = propertiesStore.slice(skip, skip + limit)

    const response: PropertyListResponse = {
      data: paginatedData,
      count: propertiesStore.length,
      has_more: propertiesStore.length > skip + limit,
    }

    return HttpResponse.json(response)
  }),

  // GET /api/v1/properties/:propertyId - Get single property
  http.get('*/api/v1/properties/:propertyId', ({ params }) => {
    const propertyId = params.propertyId as string
    const property = propertiesStore.find((p) => p.id === propertyId)

    if (!property) {
      return HttpResponse.json(
        { detail: 'Property not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json(property)
  }),

  // POST /api/v1/properties - Create property
  http.post('*/api/v1/properties', async ({ request }) => {
    const body = (await request.json()) as PropertyCreate

    const property = createProperty({
      id: crypto.randomUUID(),
      name: body.name,
      address_line1: body.address_line1,
      address_line2: body.address_line2 ?? null,
      city: body.city,
      state: body.state,
      postal_code: body.postal_code,
      total_rentable_sqft: String(body.total_rentable_sqft),
      total_usable_sqft: String(body.total_usable_sqft),
      common_area_sqft: String(body.common_area_sqft),
      target_occupancy: body.target_occupancy
        ? String(body.target_occupancy)
        : '0.95',
    })

    propertiesStore.push(property)

    return HttpResponse.json(property, { status: 201 })
  }),

  // PUT /api/v1/properties/:propertyId - Update property
  http.put('*/api/v1/properties/:propertyId', async ({ params, request }) => {
    const propertyId = params.propertyId as string
    const body = (await request.json()) as PropertyUpdate

    const index = propertiesStore.findIndex((p) => p.id === propertyId)

    if (index === -1) {
      return HttpResponse.json(
        { detail: 'Property not found' },
        { status: 404 }
      )
    }

    // Non-null assertion is safe here since we've checked index !== -1
    const current = propertiesStore[index]!
    const updatedProperty: Property = {
      id: current.id,
      organization_id: current.organization_id,
      name: body.name ?? current.name,
      address_line1: body.address_line1 ?? current.address_line1,
      address_line2:
        body.address_line2 !== undefined
          ? body.address_line2
          : (current.address_line2 ?? null),
      city: body.city ?? current.city,
      state: body.state ?? current.state,
      postal_code: body.postal_code ?? current.postal_code,
      total_rentable_sqft: body.total_rentable_sqft
        ? String(body.total_rentable_sqft)
        : current.total_rentable_sqft,
      total_usable_sqft: body.total_usable_sqft
        ? String(body.total_usable_sqft)
        : current.total_usable_sqft,
      common_area_sqft: body.common_area_sqft
        ? String(body.common_area_sqft)
        : current.common_area_sqft,
      target_occupancy:
        body.target_occupancy !== undefined && body.target_occupancy !== null
          ? String(body.target_occupancy)
          : (current.target_occupancy ?? '0.95'),
      created_at: current.created_at,
      updated_at: new Date().toISOString(),
    }

    propertiesStore[index] = updatedProperty

    return HttpResponse.json(updatedProperty)
  }),

  // DELETE /api/v1/properties/:propertyId - Delete property
  http.delete('*/api/v1/properties/:propertyId', ({ params }) => {
    const propertyId = params.propertyId as string
    const index = propertiesStore.findIndex((p) => p.id === propertyId)

    if (index === -1) {
      return HttpResponse.json(
        { detail: 'Property not found' },
        { status: 404 }
      )
    }

    propertiesStore.splice(index, 1)

    return new HttpResponse(null, { status: 204 })
  }),
]
