/**
 * Playwright E2E Test Configuration
 *
 * Configures Playwright for end-to-end testing of CapVeri.
 * Supports headed and headless modes, multiple browsers,
 * and automatic dev server startup.
 *
 * Server auto-start behavior:
 * - If Cloudflare Worker backend (port 8797) is already running, it is reused.
 * - If frontend (port 5173) is already running, it is reused.
 * - Otherwise, both servers are started automatically.
 * - NOTE: Supabase must be running separately (npx supabase start).
 */
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env.test file for test environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.test') })

const e2eBaseUrl = process.env.E2E_BASE_URL || 'http://localhost:5173'
const e2eBaseHost = new URL(e2eBaseUrl).hostname
const allowedE2EHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

if (!allowedE2EHosts.has(e2eBaseHost)) {
  throw new Error(
    `Frontend E2E tests must run against a local server. Received E2E_BASE_URL=${e2eBaseUrl}`
  )
}

const frontendPort = new URL(e2eBaseUrl).port || '5173'
const apiBaseUrl = process.env.VITE_API_URL || 'http://127.0.0.1:8797'
const apiBaseHost = new URL(apiBaseUrl).hostname

if (!allowedE2EHosts.has(apiBaseHost)) {
  throw new Error(
    `Frontend E2E API tests must run against a local Worker. Received VITE_API_URL=${apiBaseUrl}`
  )
}

const apiPort = new URL(apiBaseUrl).port || '8797'
const workerDatabaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const workerSupabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const workerAuthJwksUrl =
  process.env.AUTH_JWKS_URL ||
  `${workerSupabaseUrl}/auth/v1/.well-known/jwks.json`
const workerOpenRouterApiKey =
  process.env.OPENROUTER_API_KEY || 'e2e-openrouter-disabled'

// Marketing site (Next.js) base URL. The public tool specs (e2e/tools/*) hit
// the marketing site, so Playwright must boot it too. Use a dedicated local
// port to avoid reusing an unrelated Next dev server from another checkout.
const marketingBaseUrl = process.env.MARKETING_BASE_URL || 'http://127.0.0.1:3007'
const marketingBaseHost = new URL(marketingBaseUrl).hostname

if (!allowedE2EHosts.has(marketingBaseHost)) {
  throw new Error(
    `Marketing E2E tests must run against a local server. Received MARKETING_BASE_URL=${marketingBaseUrl}`
  )
}

const marketingPort = new URL(marketingBaseUrl).port || '3007'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential to avoid DB conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for DB isolation
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: './e2e/setup.ts', // Setup test environment before tests

  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 }, // Standard desktop viewport
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],

  // Auto-start Worker API, frontend, and marketing when not already running.
  // reuseExistingServer: true  -> use running server; start one if absent.
  // reuseExistingServer: false -> always start a fresh server (used in CI).
  webServer: [
    {
      command: `cd ../cloudflare-backend && npx wrangler dev --port ${apiPort} --local --var DB_ACCESS_MODE:direct-postgres --var DATABASE_URL:${workerDatabaseUrl} --var SUPABASE_URL:${workerSupabaseUrl} --var AUTH_JWKS_URL:${workerAuthJwksUrl} --var OPENROUTER_API_KEY:${workerOpenRouterApiKey}`,
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        DATABASE_URL: workerDatabaseUrl,
        SUPABASE_URL: workerSupabaseUrl,
        AUTH_JWKS_URL: workerAuthJwksUrl,
      },
    },
    {
      command: `npm run dev -- --strictPort --port ${frontendPort}`,
      url: e2eBaseUrl,
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: apiBaseUrl,
      },
    },
    {
      // Marketing site (Next.js) for the public tool specs (e2e/tools/*).
      // Next dev cold-start is slower than Vite, so allow a longer timeout.
      command: `node -e "const net=require('node:net');const port=Number(process.argv[1]);const server=net.createServer();server.once('error',()=>process.exit(1));server.listen(port,'127.0.0.1',()=>server.close(()=>process.exit(0)))" ${marketingPort} && cd ../marketing && npm run dev -- --hostname 127.0.0.1 --port ${marketingPort}`,
      url: marketingBaseUrl,
      timeout: 120000,
      reuseExistingServer: false,
      // The tool pages POST to the CapVeri API; without this the marketing
      // client defaults to the PRODUCTION api host (https://api.capveri.com),
      // so a local E2E run would either leave localhost or CORS-fail and the
      // result assertions never resolve. Point the public API base at the
      // local Worker for a fully local E2E (F-127).
      env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || apiBaseUrl,
      },
    },
  ],

  // Cleanup after all tests
  globalTeardown: './e2e/global-teardown.ts',
})
