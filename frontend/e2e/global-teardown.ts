/**
 * E2E Global Teardown
 *
 * Runs after all tests complete. Playwright automatically stops any
 * webServer processes it started (backend/frontend), so no manual
 * cleanup is needed here.
 */
async function globalTeardown() {
  console.log('✅ E2E teardown complete (servers managed by Playwright webServer)')
}

export default globalTeardown
