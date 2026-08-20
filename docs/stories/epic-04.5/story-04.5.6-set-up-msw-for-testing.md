# Story 4.5.6: Set Up MSW for Testing

### User Story
**As a** frontend developer
**I want** Mock Service Worker configured for testing
**So that** I can test components without hitting the real API

### Acceptance Criteria

- [x] **AC1**: MSW installed and configured
- [x] **AC2**: Handlers use generated types (no response shape drift)
- [x] **AC3**: Mock data factory creates realistic test data
- [x] **AC4**: MSW integrates with Vitest
- [x] **AC5**: Can toggle between mock and real API in dev

### Technical Specifications

**Files to Create**:
```
frontend/src/
├── mocks/
│   ├── browser.ts
│   ├── server.ts
│   ├── handlers/
│   │   ├── index.ts
│   │   └── properties.ts
│   └── factories/
│       ├── index.ts
│       └── property.ts
└── test/
    └── setup.ts
```

**mocks/handlers/properties.ts**:
```typescript
/**
 * MSW handlers for property endpoints
 *
 * Uses generated types to ensure mock responses match API contract.
 */
import { http, HttpResponse } from "msw";

import type {
  PropertyResponse,
  PropertyListResponse,
  PropertyCreate,
} from "@/api/generated/types.gen";
import { createProperty, createPropertyList } from "../factories/property";

const API_BASE = "http://localhost:8000/api/v1";

export const propertyHandlers = [
  // GET /properties - List properties
  http.get(`${API_BASE}/properties`, ({ request }) => {
    const url = new URL(request.url);
    const skip = parseInt(url.searchParams.get("skip") || "0");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const properties = createPropertyList(limit);

    const response: PropertyListResponse = {
      data: properties.slice(skip, skip + limit),
      count: properties.length,
      has_more: properties.length > skip + limit,
    };

    return HttpResponse.json(response);
  }),

  // GET /properties/:id - Get single property
  http.get(`${API_BASE}/properties/:propertyId`, ({ params }) => {
    const property = createProperty({ id: params.propertyId as string });
    return HttpResponse.json(property);
  }),

  // POST /properties - Create property
  http.post(`${API_BASE}/properties`, async ({ request }) => {
    const body = (await request.json()) as PropertyCreate;

    const property = createProperty({
      ...body,
      id: crypto.randomUUID(),
    });

    return HttpResponse.json(property, { status: 201 });
  }),

  // PUT /properties/:id - Update property
  http.put(`${API_BASE}/properties/:propertyId`, async ({ params, request }) => {
    const body = await request.json();

    const property = createProperty({
      id: params.propertyId as string,
      ...body,
    });

    return HttpResponse.json(property);
  }),

  // DELETE /properties/:id - Delete property
  http.delete(`${API_BASE}/properties/:propertyId`, () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
```

**mocks/factories/property.ts**:
```typescript
/**
 * Factory functions for creating test property data
 *
 * Uses faker for realistic data generation.
 */
import { faker } from "@faker-js/faker";
import type { PropertyResponse } from "@/api/generated/types.gen";

/**
 * Create a single property with optional overrides
 */
export function createProperty(
  overrides: Partial<PropertyResponse> = {}
): PropertyResponse {
  const rentableSqft = faker.number.int({ min: 10000, max: 500000 });
  const usableSqft = Math.floor(rentableSqft * 0.9);
  const commonAreaSqft = rentableSqft - usableSqft;

  return {
    id: faker.string.uuid(),
    organization_id: faker.string.uuid(),
    name: faker.company.name() + " Tower",
    address_line1: faker.location.streetAddress(),
    address_line2: faker.helpers.maybe(() => `Suite ${faker.number.int(999)}`),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    postal_code: faker.location.zipCode(),
    total_rentable_sqft: rentableSqft.toString(),
    total_usable_sqft: usableSqft.toString(),
    common_area_sqft: commonAreaSqft.toString(),
    target_occupancy: "0.95",
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides,
  };
}

/**
 * Create a list of properties
 */
export function createPropertyList(count: number = 10): PropertyResponse[] {
  return Array.from({ length: count }, () => createProperty());
}

/**
 * Create a specific test property for consistent testing
 */
export function createTestProperty(): PropertyResponse {
  return createProperty({
    id: "test-property-123",
    name: "Test Property",
    address_line1: "123 Test Street",
    city: "Test City",
    state: "NY",
    postal_code: "10001",
    total_rentable_sqft: "50000",
    total_usable_sqft: "45000",
    common_area_sqft: "5000",
  });
}
```

**test/setup.ts**:
```typescript
/**
 * Test setup with MSW integration
 */
import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "@/mocks/handlers";

// Setup MSW server for tests
export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Definition of Done
- [x] MSW configured
- [x] Handlers use generated types
- [x] Factories create realistic data
- [x] Vitest integration works

### Estimated Time: 3 hours

---
