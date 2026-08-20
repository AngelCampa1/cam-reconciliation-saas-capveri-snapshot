/**
 * Correlation ID manager for request tracing
 *
 * Provides a session-scoped correlation ID that is:
 * - Generated once on app start
 * - Sent with all API requests via X-Correlation-ID header
 * - Injected into all log messages
 * - Used to trace frontend actions to backend logs
 */

let currentCorrelationId: string | null = null

/**
 * Create a new correlation ID (UUID v4).
 * Typically called once on app initialization.
 * @returns The generated correlation ID
 */
export function createCorrelationId(): string {
  currentCorrelationId = crypto.randomUUID()
  return currentCorrelationId
}

/**
 * Get the current correlation ID.
 * @returns The current correlation ID, or null if not set
 */
export function getCorrelationId(): string | null {
  return currentCorrelationId
}

/**
 * Set a custom correlation ID.
 * Useful when receiving a correlation ID from the backend.
 * @param id - The correlation ID to set
 */
export function setCorrelationId(id: string): void {
  currentCorrelationId = id
}

/**
 * Clear the current correlation ID.
 * Useful for testing or session cleanup.
 */
export function clearCorrelationId(): void {
  currentCorrelationId = null
}
