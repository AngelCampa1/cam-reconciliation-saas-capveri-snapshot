/**
 * MSW Server Configuration for Node.js (Vitest)
 *
 * This server is used during testing to intercept API requests.
 * Import this in your test setup file.
 */
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/**
 * MSW server instance for Node.js environment (tests)
 */
export const server = setupServer(...handlers)

/**
 * Start the server with default handlers
 * Call in beforeAll()
 */
export function startServer(): void {
  server.listen({
    onUnhandledRequest: 'warn',
  })
}

/**
 * Reset handlers to default state
 * Call in afterEach()
 */
export function resetServer(): void {
  server.resetHandlers()
}

/**
 * Stop the server
 * Call in afterAll()
 */
export function stopServer(): void {
  server.close()
}

// Re-export server utilities
export { server as mswServer }
