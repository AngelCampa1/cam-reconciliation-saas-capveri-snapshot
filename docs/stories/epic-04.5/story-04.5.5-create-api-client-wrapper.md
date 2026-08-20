# Story 4.5.5: Create API Client Wrapper

### User Story
**As a** frontend developer
**I want** an API client wrapper that handles auth and errors
**So that** I don't have to manually add tokens to every request

### Acceptance Criteria

- [ ] **AC1**: Wrapper automatically injects auth token from session
- [ ] **AC2**: Wrapper handles 401 by redirecting to login
- [ ] **AC3**: Wrapper transforms errors to user-friendly format
- [ ] **AC4**: Wrapper provides loading state helpers
- [ ] **AC5**: Wrapper works with React Query

### Technical Specifications

**Files to Create**:
```
frontend/src/api/
├── client.ts
├── hooks.ts
└── errors.ts
```

**client.ts**:
```typescript
/**
 * API Client Configuration
 *
 * Wraps the generated client with auth and error handling.
 */
import { createClient } from "./generated/client.gen";
import { getSession, signOut } from "@/lib/auth";

// Base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Create configured API client instance
 */
export const apiClient = createClient({
  baseUrl: `${API_BASE_URL}/api/v1`,

  // Request interceptor: add auth token
  async fetch(request) {
    const session = await getSession();

    if (session?.access_token) {
      request.headers.set("Authorization", `Bearer ${session.access_token}`);
    }

    return fetch(request);
  },
});

/**
 * Response interceptor for handling common errors
 */
apiClient.interceptors.response.use(async (response) => {
  // Handle 401 - redirect to login
  if (response.status === 401) {
    await signOut();
    window.location.href = "/login?expired=true";
    throw new ApiError("Session expired", 401);
  }

  // Handle other errors
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.message || `Request failed: ${response.status}`,
      response.status,
      body.errors
    );
  }

  return response;
});

/**
 * Custom API error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors?: Array<{ loc: string[]; msg: string; type: string }>
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * Check if this is a validation error
   */
  get isValidationError(): boolean {
    return this.statusCode === 422;
  }

  /**
   * Get field-level errors for form handling
   */
  getFieldErrors(): Record<string, string> {
    if (!this.errors) return {};

    return this.errors.reduce(
      (acc, error) => {
        const field = error.loc[error.loc.length - 1];
        acc[field] = error.msg;
        return acc;
      },
      {} as Record<string, string>
    );
  }
}

// Re-export generated services for convenience
export * from "./generated/sdk.gen";
export * from "./generated/types.gen";
```

**hooks.ts**:
```typescript
/**
 * React Query hooks for API operations
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  apiClient,
  ApiError,
  type PropertyResponse,
  type PropertyCreate,
  type PropertyUpdate,
  type PropertyListResponse,
} from "./client";

// Query key factory for consistent cache keys
export const queryKeys = {
  properties: {
    all: ["properties"] as const,
    lists: () => [...queryKeys.properties.all, "list"] as const,
    list: (filters: { skip?: number; limit?: number }) =>
      [...queryKeys.properties.lists(), filters] as const,
    details: () => [...queryKeys.properties.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.properties.details(), id] as const,
  },
  leases: {
    all: ["leases"] as const,
    // ... similar structure
  },
  units: {
    all: ["units"] as const,
    byProperty: (propertyId: string) =>
      [...queryKeys.units.all, "byProperty", propertyId] as const,
  },
};

/**
 * Hook for fetching properties list
 */
export function useProperties(
  options: { skip?: number; limit?: number } = {},
  queryOptions?: Omit<
    UseQueryOptions<PropertyListResponse, ApiError>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: queryKeys.properties.list(options),
    queryFn: () => apiClient.properties.getProperties(options),
    ...queryOptions,
  });
}

/**
 * Hook for fetching a single property
 */
export function useProperty(
  propertyId: string,
  queryOptions?: Omit<
    UseQueryOptions<PropertyResponse, ApiError>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: queryKeys.properties.detail(propertyId),
    queryFn: () => apiClient.properties.getProperty({ propertyId }),
    enabled: !!propertyId,
    ...queryOptions,
  });
}

/**
 * Hook for creating a property
 */
export function useCreateProperty(
  mutationOptions?: Omit<
    UseMutationOptions<PropertyResponse, ApiError, PropertyCreate>,
    "mutationFn"
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PropertyCreate) =>
      apiClient.properties.createProperty({ requestBody: data }),
    onSuccess: () => {
      // Invalidate properties list to refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.properties.lists(),
      });
    },
    ...mutationOptions,
  });
}

/**
 * Hook for updating a property
 */
export function useUpdateProperty(
  propertyId: string,
  mutationOptions?: Omit<
    UseMutationOptions<PropertyResponse, ApiError, PropertyUpdate>,
    "mutationFn"
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PropertyUpdate) =>
      apiClient.properties.updateProperty({ propertyId, requestBody: data }),
    onSuccess: (updatedProperty) => {
      // Update cache with new data
      queryClient.setQueryData(
        queryKeys.properties.detail(propertyId),
        updatedProperty
      );
      // Invalidate list to refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.properties.lists(),
      });
    },
    ...mutationOptions,
  });
}

/**
 * Hook for deleting a property
 */
export function useDeleteProperty(
  mutationOptions?: Omit<
    UseMutationOptions<void, ApiError, string>,
    "mutationFn"
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (propertyId: string) =>
      apiClient.properties.deleteProperty({ propertyId }),
    onSuccess: (_, propertyId) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: queryKeys.properties.detail(propertyId),
      });
      // Invalidate list
      queryClient.invalidateQueries({
        queryKey: queryKeys.properties.lists(),
      });
    },
    ...mutationOptions,
  });
}
```

### Definition of Done
- [ ] Auth token injected automatically
- [ ] 401 redirects to login
- [ ] Errors transformed properly
- [ ] React Query hooks work

### Estimated Time: 3 hours

---
