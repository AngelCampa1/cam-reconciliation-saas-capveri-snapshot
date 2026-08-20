/**
 * OpenAPI TypeScript client generator configuration.
 *
 * This configuration generates TypeScript types, Zod schemas, and an API client
 * from the FastAPI backend's OpenAPI specification.
 *
 * Usage:
 *   npm run generate-api-client
 *
 * Prerequisites:
 *   - Backend server running at http://localhost:8000
 *   - Or use a saved openapi.json file
 */
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch",
  // Use local file for CI/offline generation, or server URL for live updates
  // To use live server: input: "http://localhost:8000/openapi.json",
  input: "./openapi.json",
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
});
