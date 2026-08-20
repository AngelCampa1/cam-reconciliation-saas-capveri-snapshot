import { describe, it, expect, beforeEach } from 'vitest'
import {
  createCorrelationId,
  getCorrelationId,
  setCorrelationId,
  clearCorrelationId,
} from './correlationId'

describe('correlationId', () => {
  // Reset state before each test
  beforeEach(() => {
    clearCorrelationId()
  })

  describe('createCorrelationId', () => {
    it('generates a valid UUID v4', () => {
      const id = createCorrelationId()
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y is 8, 9, a, or b
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    })

    it('returns the generated ID', () => {
      const id = createCorrelationId()
      expect(getCorrelationId()).toBe(id)
    })

    it('overwrites previous ID when called again', () => {
      const firstId = createCorrelationId()
      const secondId = createCorrelationId()
      expect(firstId).not.toBe(secondId)
      expect(getCorrelationId()).toBe(secondId)
    })
  })

  describe('getCorrelationId', () => {
    it('returns null when no ID is set', () => {
      expect(getCorrelationId()).toBeNull()
    })

    it('returns the current correlation ID', () => {
      const id = createCorrelationId()
      expect(getCorrelationId()).toBe(id)
    })
  })

  describe('setCorrelationId', () => {
    it('sets a custom correlation ID', () => {
      setCorrelationId('custom-id-123')
      expect(getCorrelationId()).toBe('custom-id-123')
    })

    it('overwrites existing ID', () => {
      createCorrelationId()
      setCorrelationId('override-id')
      expect(getCorrelationId()).toBe('override-id')
    })
  })

  describe('clearCorrelationId', () => {
    it('clears the correlation ID', () => {
      createCorrelationId()
      expect(getCorrelationId()).not.toBeNull()
      clearCorrelationId()
      expect(getCorrelationId()).toBeNull()
    })

    it('is safe to call when no ID exists', () => {
      expect(() => clearCorrelationId()).not.toThrow()
      expect(getCorrelationId()).toBeNull()
    })
  })
})
