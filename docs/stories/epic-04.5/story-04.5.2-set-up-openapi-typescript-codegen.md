# Story 4.5.2: Set Up openapi-typescript-codegen

### User Story
**As a** frontend developer
**I want** TypeScript types auto-generated from the API spec
**So that** my IDE provides autocomplete and type checking for API calls

### Acceptance Criteria

- [x] **AC1**: `openapi-typescript-codegen` installed as dev dependency
- [x] **AC2**: Generator configured in `package.json` scripts
- [x] **AC3**: Generated types include all request/response models
- [x] **AC4**: Generated client includes all endpoints
- [x] **AC5**: Types exported from `frontend/src/api/`

### Technical Specifications

**Files to Create/Modify**:
```
frontend/
├── package.json (add dependencies and scripts)
├── openapi-codegen.config.ts
└── src/api/
    └── .gitkeep
```

**package.json additions**:
```json
{
  "devDependencies": {
    "@hey-api/openapi-ts": "^0.45.0"
  },
  "scripts": {
    "generate-api-client": "openapi-ts --config openapi-codegen.config.ts",
    "generate-api-client:watch": "npm run generate-api-client -- --watch"
  }
}
```

**openapi-codegen.config.ts**:
```typescript
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: "http://localhost:8000/openapi.json",
  output: {
    path: "src/api/generated",
    format: "prettier",
    lint: "eslint",
  },
  plugins: [
    "@hey-api/typescript",
    "@hey-api/sdk",
    {
      name: "@hey-api/schemas",
      type: "zod",
    },
  ],
  services: {
    asClass: true,
    methodNameBuilder: (operation) => {
      // Generate clean method names
      // GET /api/v1/properties -> getProperties
      // POST /api/v1/properties -> createProperty
      const path = operation.path.replace("/api/v1/", "");
      const method = operation.method.toLowerCase();

      const parts = path.split("/").filter(Boolean);
      const resource = parts[0];

      switch (method) {
        case "get":
          return path.includes("{") ? `get${capitalize(singular(resource))}` : `get${capitalize(resource)}`;
        case "post":
          return `create${capitalize(singular(resource))}`;
        case "put":
          return `update${capitalize(singular(resource))}`;
        case "delete":
          return `delete${capitalize(singular(resource))}`;
        default:
          return operation.name;
      }
    },
  },
});

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function singular(str: string): string {
  // Simple singularization
  if (str.endsWith("ies")) return str.slice(0, -3) + "y";
  if (str.endsWith("s")) return str.slice(0, -1);
  return str;
}
```

**Expected Generated Output Structure**:
```
frontend/src/api/generated/
├── index.ts           # Re-exports everything
├── types.gen.ts       # All TypeScript types
├── schemas.gen.ts     # Zod schemas
├── sdk.gen.ts         # API client methods
└── client.gen.ts      # HTTP client config
```

### Definition of Done
- [x] Generator installed
- [x] Config file created
- [x] `npm run generate-api-client` works
- [x] Types generated correctly

### Estimated Time: 2 hours

---
