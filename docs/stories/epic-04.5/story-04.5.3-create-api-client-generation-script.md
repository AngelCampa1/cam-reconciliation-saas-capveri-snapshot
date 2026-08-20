# Story 4.5.3: Create API Client Generation Script

### User Story
**As a** developer
**I want** a reliable script to regenerate the API client
**So that** I can update the client whenever the API changes

### Acceptance Criteria

- [ ] **AC1**: `npm run generate-api-client` regenerates from live server
- [ ] **AC2**: Script can also generate from saved spec file
- [ ] **AC3**: Script validates spec before generating
- [ ] **AC4**: Script formats generated code with Prettier
- [ ] **AC5**: Script fails if generation produces errors

### Technical Specifications

**Files to Create**:
```
frontend/
├── scripts/
│   └── generate-api-client.ts
└── openapi.json (saved spec for offline generation)
```

**scripts/generate-api-client.ts**:
```typescript
#!/usr/bin/env ts-node
/**
 * API Client Generation Script
 *
 * Generates TypeScript API client from OpenAPI spec.
 *
 * Usage:
 *   npm run generate-api-client           # From live server
 *   npm run generate-api-client -- --file # From saved file
 *   npm run generate-api-client -- --save # Save spec then generate
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const SPEC_URL = process.env.API_URL || "http://localhost:8000";
const SPEC_FILE = path.join(__dirname, "..", "openapi.json");
const OUTPUT_DIR = path.join(__dirname, "..", "src", "api", "generated");

async function fetchSpec(): Promise<object> {
  console.log(`Fetching OpenAPI spec from ${SPEC_URL}/openapi.json...`);

  const response = await fetch(`${SPEC_URL}/openapi.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch spec: ${response.status}`);
  }

  return response.json();
}

function loadSpecFromFile(): object {
  console.log(`Loading OpenAPI spec from ${SPEC_FILE}...`);

  if (!fs.existsSync(SPEC_FILE)) {
    throw new Error(`Spec file not found: ${SPEC_FILE}`);
  }

  return JSON.parse(fs.readFileSync(SPEC_FILE, "utf-8"));
}

function saveSpec(spec: object): void {
  console.log(`Saving spec to ${SPEC_FILE}...`);
  fs.writeFileSync(SPEC_FILE, JSON.stringify(spec, null, 2));
}

function validateSpec(spec: object): void {
  console.log("Validating OpenAPI spec...");

  // Basic validation
  if (!spec["openapi"]) {
    throw new Error("Invalid spec: missing openapi version");
  }
  if (!spec["paths"]) {
    throw new Error("Invalid spec: missing paths");
  }

  const pathCount = Object.keys(spec["paths"]).length;
  console.log(`  Found ${pathCount} API paths`);
}

function generateClient(): void {
  console.log("Generating TypeScript client...");

  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Run generator
  execSync("npx openapi-ts", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });

  console.log("Client generated successfully!");
}

function formatCode(): void {
  console.log("Formatting generated code...");

  execSync(`npx prettier --write "${OUTPUT_DIR}/**/*.ts"`, {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useFile = args.includes("--file");
  const saveToFile = args.includes("--save");

  try {
    // Get spec
    let spec: object;
    if (useFile) {
      spec = loadSpecFromFile();
    } else {
      spec = await fetchSpec();
      if (saveToFile) {
        saveSpec(spec);
      }
    }

    // Validate
    validateSpec(spec);

    // Generate
    generateClient();

    // Format
    formatCode();

    console.log("\nAPI client generation complete!");
    console.log(`Output: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error("\nError:", error.message);
    process.exit(1);
  }
}

main();
```

**package.json script update**:
```json
{
  "scripts": {
    "generate-api-client": "ts-node scripts/generate-api-client.ts",
    "generate-api-client:file": "ts-node scripts/generate-api-client.ts --file",
    "generate-api-client:save": "ts-node scripts/generate-api-client.ts --save"
  }
}
```

### Definition of Done
- [ ] Script runs successfully
- [ ] Can use live server or file
- [ ] Validates before generating
- [ ] Formats output

### Estimated Time: 2 hours

---
