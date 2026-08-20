# Story 4.5.7: Create Contract Test Helpers

### User Story
**As a** developer
**I want** helper functions to validate API responses match schemas
**So that** I catch contract violations in tests

### Acceptance Criteria

- [x] **AC1**: Helper validates response matches Zod schema
- [x] **AC2**: Helper provides clear error messages on mismatch
- [x] **AC3**: Can validate individual fields or entire response
- [x] **AC4**: Works with both MSW mocks and real API
- [x] **AC5**: Integrates with test assertions

### Technical Specifications

**Files to Create**:
```
frontend/src/test/
├── contract.ts
└── contract.test.ts
```

**contract.ts**:
```typescript
/**
 * Contract testing utilities
 *
 * Validates that API responses match expected schemas.
 */
import { z, type ZodType, type ZodError } from "zod";

// Import generated Zod schemas
import * as schemas from "@/api/generated/schemas.gen";

/**
 * Validate data against a Zod schema
 */
export function validateSchema<T>(
  schema: ZodType<T>,
  data: unknown,
  context?: string
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = formatZodError(error, context);
      throw new ContractError(message, error);
    }
    throw error;
  }
}

/**
 * Format Zod errors for readable output
 */
function formatZodError(error: ZodError, context?: string): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return `  - ${path}: ${issue.message}`;
  });

  const prefix = context ? `Contract violation in ${context}:` : "Contract violation:";
  return `${prefix}\n${issues.join("\n")}`;
}

/**
 * Custom error for contract violations
 */
export class ContractError extends Error {
  constructor(
    message: string,
    public zodError: ZodError
  ) {
    super(message);
    this.name = "ContractError";
  }
}

/**
 * Create a contract validator for a specific schema
 */
export function createValidator<T>(schema: ZodType<T>, name: string) {
  return {
    validate: (data: unknown): T => validateSchema(schema, data, name),
    isValid: (data: unknown): data is T => schema.safeParse(data).success,
    getErrors: (data: unknown): string[] => {
      const result = schema.safeParse(data);
      if (result.success) return [];
      return result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      );
    },
  };
}

// Pre-built validators for common types
export const validators = {
  property: createValidator(schemas.PropertyResponse, "PropertyResponse"),
  propertyList: createValidator(
    schemas.PropertyListResponse,
    "PropertyListResponse"
  ),
  lease: createValidator(schemas.LeaseResponse, "LeaseResponse"),
  unit: createValidator(schemas.UnitResponse, "UnitResponse"),
  error: createValidator(schemas.ErrorResponse, "ErrorResponse"),
};

/**
 * Assert that an API response matches expected schema
 *
 * Usage in tests:
 *   const response = await api.getProperty("123");
 *   assertValidResponse(validators.property, response);
 */
export function assertValidResponse<T>(
  validator: ReturnType<typeof createValidator<T>>,
  data: unknown
): asserts data is T {
  validator.validate(data);
}
```

**contract.test.ts**:
```typescript
/**
 * Contract test examples
 */
import { describe, it, expect } from "vitest";
import { validators, validateSchema, ContractError } from "./contract";
import { PropertyResponse } from "@/api/generated/schemas.gen";
import { createProperty } from "@/mocks/factories/property";

describe("Contract Validation", () => {
  describe("PropertyResponse", () => {
    it("validates correct property data", () => {
      const property = createProperty();
      expect(() => validators.property.validate(property)).not.toThrow();
    });

    it("rejects property with missing required fields", () => {
      const invalid = { id: "123" }; // Missing all other fields
      expect(() => validators.property.validate(invalid)).toThrow(
        ContractError
      );
    });

    it("rejects property with wrong field types", () => {
      const property = createProperty();
      const invalid = { ...property, total_rentable_sqft: 50000 }; // Should be string

      expect(() => validators.property.validate(invalid)).toThrow(
        ContractError
      );
    });

    it("provides helpful error messages", () => {
      const invalid = { id: "123" };
      const errors = validators.property.getErrors(invalid);

      expect(errors).toContain(expect.stringContaining("organization_id"));
      expect(errors).toContain(expect.stringContaining("name"));
    });
  });

  describe("isValid helper", () => {
    it("returns true for valid data", () => {
      const property = createProperty();
      expect(validators.property.isValid(property)).toBe(true);
    });

    it("returns false for invalid data", () => {
      expect(validators.property.isValid({ id: "123" })).toBe(false);
    });
  });
});
```

### Definition of Done
- [x] Validation helpers created
- [x] Clear error messages
- [x] Works with Zod schemas
- [x] Test examples pass

### Estimated Time: 2 hours

---
