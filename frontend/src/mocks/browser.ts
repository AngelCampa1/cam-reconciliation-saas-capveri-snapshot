/**
 * MSW Browser Configuration for Development
 *
 * This allows mocking API requests in the browser during development.
 * Enable by setting VITE_ENABLE_MOCKS=true in your .env file.
 *
 * Usage in main.tsx:
 * ```typescript
 * if (import.meta.env.VITE_ENABLE_MOCKS === 'true') {
 *   const { worker } = await import('./mocks/browser');
 *   await worker.start();
 * }
 * ```
 */
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/**
 * MSW worker instance for browser environment (development)
 */
export const worker = setupWorker(...handlers)

/**
 * Start the worker with development-friendly options
 */
export async function startWorker(): Promise<void> {
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: false,
  })
}
