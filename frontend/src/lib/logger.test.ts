import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from './logger'
import { setCorrelationId, clearCorrelationId } from './correlationId'

describe('Logger', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Log level filtering', () => {
    it('logs debug messages when level is debug', () => {
      logger.setLevel('debug')
      logger.debug('Test debug message')
      expect(consoleDebugSpy).toHaveBeenCalled()
    })

    it('logs info messages when level is debug', () => {
      logger.setLevel('debug')
      logger.info('Test info message')
      expect(consoleInfoSpy).toHaveBeenCalled()
    })

    it('does not log debug messages when level is info', () => {
      logger.setLevel('info')
      logger.debug('Test debug message')
      expect(consoleDebugSpy).not.toHaveBeenCalled()
    })

    it('logs info messages when level is info', () => {
      logger.setLevel('info')
      logger.info('Test info message')
      expect(consoleInfoSpy).toHaveBeenCalled()
    })

    it('does not log debug or info when level is warn', () => {
      logger.setLevel('warn')
      logger.debug('Test debug')
      logger.info('Test info')
      expect(consoleDebugSpy).not.toHaveBeenCalled()
      expect(consoleInfoSpy).not.toHaveBeenCalled()
    })

    it('logs warn messages when level is warn', () => {
      logger.setLevel('warn')
      logger.warn('Test warning')
      expect(consoleWarnSpy).toHaveBeenCalled()
    })

    it('logs error messages at any level', () => {
      logger.setLevel('error')
      logger.error('Test error')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('Message formatting', () => {
    it('includes timestamp in log output', () => {
      logger.setLevel('debug')
      logger.info('Test message')

      const call = consoleInfoSpy.mock.calls[0][0] as string
      expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
    })

    it('includes log level in output', () => {
      logger.setLevel('debug')
      logger.info('Test message')

      const call = consoleInfoSpy.mock.calls[0][0] as string
      expect(call).toContain('INFO:')
    })

    it('includes the message in output', () => {
      logger.setLevel('debug')
      logger.info('Test message')

      const call = consoleInfoSpy.mock.calls[0][0] as string
      expect(call).toContain('Test message')
    })
  })

  describe('Context logging', () => {
    it('logs context object when provided', () => {
      logger.setLevel('debug')
      logger.info('Test message', { userId: '123', action: 'login' })

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO:'),
        { userId: '123', action: 'login' }
      )
    })

    it('works without context object', () => {
      logger.setLevel('debug')
      logger.info('Test message')

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO:'),
        undefined
      )
    })
  })

  describe('Sensitive data sanitization', () => {
    it('redacts password fields', () => {
      logger.setLevel('debug')
      logger.info('User data', { username: 'john', password: 'secret123' })

      const contextArg = consoleInfoSpy.mock.calls[0][1] as Record<
        string,
        unknown
      >
      expect(contextArg.password).toBe('[REDACTED]')
      expect(contextArg.username).toBe('john')
    })

    it('redacts token fields', () => {
      logger.setLevel('debug')
      logger.info('Auth data', { userId: '123', authToken: 'abc123' })

      const contextArg = consoleInfoSpy.mock.calls[0][1] as Record<
        string,
        unknown
      >
      expect(contextArg.authToken).toBe('[REDACTED]')
      expect(contextArg.userId).toBe('123')
    })

    it('redacts api_key fields', () => {
      logger.setLevel('debug')
      logger.info('Config', { api_key: 'secret', endpoint: '/api/v1' })

      const contextArg = consoleInfoSpy.mock.calls[0][1] as Record<
        string,
        unknown
      >
      expect(contextArg.api_key).toBe('[REDACTED]')
      expect(contextArg.endpoint).toBe('/api/v1')
    })

    it('redacts nested sensitive fields', () => {
      logger.setLevel('debug')
      logger.info('User login', {
        user: {
          id: '123',
          credentials: {
            password: 'secret',
            username: 'john',
          },
        },
      })

      const contextArg = consoleInfoSpy.mock.calls[0][1] as Record<
        string,
        unknown
      >
      const user = contextArg.user as Record<string, unknown>
      const credentials = user.credentials as Record<string, unknown>
      expect(credentials.password).toBe('[REDACTED]')
      expect(credentials.username).toBe('john')
    })

    it('handles case-insensitive sensitive patterns', () => {
      logger.setLevel('debug')
      logger.info('Data', {
        PASSWORD: 'secret1',
        Token: 'secret2',
        API_KEY: 'secret3',
      })

      const contextArg = consoleInfoSpy.mock.calls[0][1] as Record<
        string,
        unknown
      >
      expect(contextArg.PASSWORD).toBe('[REDACTED]')
      expect(contextArg.Token).toBe('[REDACTED]')
      expect(contextArg.API_KEY).toBe('[REDACTED]')
    })
  })

  describe('All log level methods', () => {
    it('debug method formats and logs correctly', () => {
      logger.setLevel('debug')
      logger.debug('Debug message', { count: 5 })

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG:'),
        { count: 5 }
      )
    })

    it('info method formats and logs correctly', () => {
      logger.setLevel('debug')
      logger.info('Info message', { status: 'ok' })

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO:'),
        { status: 'ok' }
      )
    })

    it('warn method formats and logs correctly', () => {
      logger.setLevel('debug')
      logger.warn('Warning message', { attempts: 3 })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARN:'),
        { attempts: 3 }
      )
    })

    it('error method formats and logs correctly', () => {
      logger.setLevel('debug')
      logger.error('Error message', { code: 500 })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        { code: 500 }
      )
    })
  })

  describe('Correlation ID injection', () => {
    beforeEach(() => {
      clearCorrelationId()
    })

    afterEach(() => {
      clearCorrelationId()
    })

    it('includes correlation ID in context when set', () => {
      logger.setLevel('debug')
      setCorrelationId('test-correlation-123')

      logger.info('Test message', { foo: 'bar' })

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO:'),
        expect.objectContaining({
          correlationId: 'test-correlation-123',
          foo: 'bar',
        })
      )
    })

    it('includes correlation ID even without other context', () => {
      logger.setLevel('debug')
      setCorrelationId('solo-correlation-456')

      logger.info('Test message')

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO:'),
        expect.objectContaining({
          correlationId: 'solo-correlation-456',
        })
      )
    })

    it('does not include correlation ID when not set', () => {
      logger.setLevel('debug')
      clearCorrelationId()

      logger.info('Test message', { foo: 'bar' })

      const contextArg = consoleInfoSpy.mock.calls[0][1] as Record<
        string,
        unknown
      >
      expect(contextArg).toEqual({ foo: 'bar' })
      expect(contextArg).not.toHaveProperty('correlationId')
    })

    it('works with all log levels', () => {
      logger.setLevel('debug')
      setCorrelationId('multi-level-id')

      logger.debug('Debug')
      logger.info('Info')
      logger.warn('Warn')
      logger.error('Error')

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ correlationId: 'multi-level-id' })
      )
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ correlationId: 'multi-level-id' })
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ correlationId: 'multi-level-id' })
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ correlationId: 'multi-level-id' })
      )
    })
  })
})
