/**
 * Structured logger for CapVeri frontend
 *
 * Features:
 * - Different log levels (debug, info, warn, error)
 * - Timestamp formatting
 * - Environment-based log level filtering (dev: all, prod: warn+error only)
 * - Sensitive data detection and redaction
 * - Automatic correlation ID injection for request tracing
 */

import { getCorrelationId } from './correlationId'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// Patterns that indicate sensitive data
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /secret/i,
  /credit[_-]?card/i,
  /cvv/i,
  /ssn/i,
  /stripe[_-]?key/i,
]

class Logger {
  private level: LogLevel

  constructor() {
    // In production, only show warnings and errors
    // In development, show all logs
    this.level = import.meta.env.PROD ? 'warn' : 'debug'
  }

  /**
   * Log debug information (development only)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      const enrichedContext = this.injectCorrelationId(context)
      const sanitizedContext = this.sanitize(enrichedContext)
      console.debug(this.format('DEBUG', message), sanitizedContext)
    }
  }

  /**
   * Log informational messages
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      const enrichedContext = this.injectCorrelationId(context)
      const sanitizedContext = this.sanitize(enrichedContext)
      console.info(this.format('INFO', message), sanitizedContext)
    }
  }

  /**
   * Log warning messages
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      const enrichedContext = this.injectCorrelationId(context)
      const sanitizedContext = this.sanitize(enrichedContext)
      console.warn(this.format('WARN', message), sanitizedContext)
    }
  }

  /**
   * Log error messages
   */
  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const enrichedContext = this.injectCorrelationId(context)
      const sanitizedContext = this.sanitize(enrichedContext)
      console.error(this.format('ERROR', message), sanitizedContext)
    }
  }

  /**
   * Inject correlation ID into context for request tracing
   */
  private injectCorrelationId(
    context?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const correlationId = getCorrelationId()
    if (!correlationId && !context) {
      return undefined
    }
    return {
      ...(correlationId && { correlationId }),
      ...context,
    }
  }

  /**
   * Format log message with timestamp and level
   */
  private format(level: string, message: string): string {
    const timestamp = new Date().toISOString()
    return `[${timestamp}] ${level}: ${message}`
  }

  /**
   * Check if a log level should be output based on current log level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.level)
  }

  /**
   * Sanitize context object to remove sensitive data
   * Returns undefined if no context provided
   */
  private sanitize(
    context?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!context) return undefined

    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(context)) {
      // Check if key contains sensitive pattern
      if (this.isSensitive(key)) {
        sanitized[key] = '[REDACTED]'
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        // Recursively sanitize nested objects
        const nestedSanitized = this.sanitize(value as Record<string, unknown>)
        sanitized[key] = nestedSanitized
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Check if a key name indicates sensitive data
   */
  private isSensitive(key: string): boolean {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key))
  }

  /**
   * Set log level programmatically (useful for testing)
   */
  setLevel(level: LogLevel): void {
    this.level = level
  }
}

// Export singleton instance
export const logger = new Logger()

// Export type for external use
export type { LogLevel }
