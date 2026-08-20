/**
 * Tests for Feedback domain types.
 *
 * Tests cover FeedbackType, FeedbackStatus, Zod schemas, and helper functions
 * for user feedback, bug reports, and feature requests.
 */

import { describe, it, expect } from 'vitest'
import {
  FeedbackType,
  FeedbackTypeSchema,
  FeedbackStatus,
  FeedbackStatusSchema,
  FeedbackMetadataSchema,
  FeedbackSchema,
  FeedbackCreateSchema,
  FeedbackUpdateSchema,
  FeedbackSummarySchema,
  isValidFeedbackType,
  isValidFeedbackStatus,
  getFeedbackTypeDisplayName,
  getFeedbackStatusDisplayName,
  isFeedbackOpen,
  isFeedbackClosed,
  getFeedbackStatusColor,
  getFeedbackTypeColor,
  truncateFeedbackMessage,
} from '../feedback'

describe('FeedbackType', () => {
  it('should have correct enum values', () => {
    expect(FeedbackType.BUG).toBe('bug')
    expect(FeedbackType.FEATURE_REQUEST).toBe('feature_request')
    expect(FeedbackType.GENERAL).toBe('general')
  })

  it('should have exactly 3 members', () => {
    expect(Object.keys(FeedbackType)).toHaveLength(3)
  })
})

describe('FeedbackTypeSchema', () => {
  it('should accept valid feedback types', () => {
    expect(FeedbackTypeSchema.parse('bug')).toBe('bug')
    expect(FeedbackTypeSchema.parse('feature_request')).toBe('feature_request')
    expect(FeedbackTypeSchema.parse('general')).toBe('general')
  })

  it('should reject invalid feedback types', () => {
    expect(() => FeedbackTypeSchema.parse('invalid')).toThrow()
    expect(() => FeedbackTypeSchema.parse('BUG')).toThrow()
    expect(() => FeedbackTypeSchema.parse('')).toThrow()
  })
})

describe('FeedbackStatus', () => {
  it('should have correct enum values', () => {
    expect(FeedbackStatus.NEW).toBe('new')
    expect(FeedbackStatus.REVIEWED).toBe('reviewed')
    expect(FeedbackStatus.RESOLVED).toBe('resolved')
    expect(FeedbackStatus.DISMISSED).toBe('dismissed')
  })

  it('should have exactly 4 members', () => {
    expect(Object.keys(FeedbackStatus)).toHaveLength(4)
  })
})

describe('FeedbackStatusSchema', () => {
  it('should accept valid feedback statuses', () => {
    expect(FeedbackStatusSchema.parse('new')).toBe('new')
    expect(FeedbackStatusSchema.parse('reviewed')).toBe('reviewed')
    expect(FeedbackStatusSchema.parse('resolved')).toBe('resolved')
    expect(FeedbackStatusSchema.parse('dismissed')).toBe('dismissed')
  })

  it('should reject invalid feedback statuses', () => {
    expect(() => FeedbackStatusSchema.parse('invalid')).toThrow()
    expect(() => FeedbackStatusSchema.parse('NEW')).toThrow()
    expect(() => FeedbackStatusSchema.parse('')).toThrow()
  })
})

describe('FeedbackMetadataSchema', () => {
  it('should accept empty object', () => {
    const result = FeedbackMetadataSchema.parse({})
    expect(result).toEqual({})
  })

  it('should accept browser info', () => {
    const result = FeedbackMetadataSchema.parse({ browser: 'Chrome 120.0.0' })
    expect(result.browser).toBe('Chrome 120.0.0')
  })

  it('should accept os info', () => {
    const result = FeedbackMetadataSchema.parse({ os: 'Windows 11' })
    expect(result.os).toBe('Windows 11')
  })

  it('should accept viewport info', () => {
    const result = FeedbackMetadataSchema.parse({
      viewport: { width: 1920, height: 1080 },
    })
    expect(result.viewport?.width).toBe(1920)
    expect(result.viewport?.height).toBe(1080)
  })

  it('should accept console_errors array', () => {
    const result = FeedbackMetadataSchema.parse({
      console_errors: ['Error 1', 'Error 2'],
    })
    expect(result.console_errors).toEqual(['Error 1', 'Error 2'])
  })

  it('should accept component_stack', () => {
    const result = FeedbackMetadataSchema.parse({
      component_stack: 'at Component > at App',
    })
    expect(result.component_stack).toBe('at Component > at App')
  })

  it('should allow additional properties via passthrough', () => {
    const result = FeedbackMetadataSchema.parse({
      custom_field: 'custom_value',
    })
    expect((result as Record<string, unknown>).custom_field).toBe(
      'custom_value'
    )
  })
})

describe('FeedbackSchema', () => {
  const validFeedback = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    user_id: '660e8400-e29b-41d4-a716-446655440001',
    organization_id: '770e8400-e29b-41d4-a716-446655440002',
    type: 'bug',
    status: 'new',
    message: 'The export button is not working correctly.',
    screenshot_url: 'https://storage.example.com/screenshots/abc.png',
    page_url: '/properties/123/units',
    user_agent: 'Mozilla/5.0 Chrome/120.0.0',
    metadata: { browser: 'Chrome' },
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:30:00Z',
  }

  it('should parse valid feedback', () => {
    const result = FeedbackSchema.parse(validFeedback)
    expect(result.id).toBe(validFeedback.id)
    expect(result.type).toBe('bug')
    expect(result.status).toBe('new')
    expect(result.message).toBe(validFeedback.message)
  })

  it('should accept null screenshot_url', () => {
    const result = FeedbackSchema.parse({
      ...validFeedback,
      screenshot_url: null,
    })
    expect(result.screenshot_url).toBeNull()
  })

  it('should accept null user_agent', () => {
    const result = FeedbackSchema.parse({
      ...validFeedback,
      user_agent: null,
    })
    expect(result.user_agent).toBeNull()
  })

  it('should default metadata to empty object', () => {
    const { metadata: _metadata, ...rest } = validFeedback
    void _metadata // Intentionally unused - testing omission
    const result = FeedbackSchema.parse(rest)
    expect(result.metadata).toEqual({})
  })

  it('should reject invalid UUID for id', () => {
    expect(() =>
      FeedbackSchema.parse({ ...validFeedback, id: 'invalid' })
    ).toThrow()
  })

  it('should reject invalid UUID for user_id', () => {
    expect(() =>
      FeedbackSchema.parse({ ...validFeedback, user_id: 'invalid' })
    ).toThrow()
  })

  it('should reject invalid UUID for organization_id', () => {
    expect(() =>
      FeedbackSchema.parse({ ...validFeedback, organization_id: 'invalid' })
    ).toThrow()
  })

  it('should reject message shorter than 10 characters', () => {
    expect(() =>
      FeedbackSchema.parse({ ...validFeedback, message: 'Too short' })
    ).toThrow()
  })

  it('should accept message with exactly 10 characters', () => {
    const result = FeedbackSchema.parse({
      ...validFeedback,
      message: '1234567890',
    })
    expect(result.message).toBe('1234567890')
  })

  it('should reject message longer than 5000 characters', () => {
    expect(() =>
      FeedbackSchema.parse({ ...validFeedback, message: 'A'.repeat(5001) })
    ).toThrow()
  })

  it('should accept message with exactly 5000 characters', () => {
    const result = FeedbackSchema.parse({
      ...validFeedback,
      message: 'A'.repeat(5000),
    })
    expect(result.message.length).toBe(5000)
  })

  it('should reject page_url longer than 2000 characters', () => {
    expect(() =>
      FeedbackSchema.parse({
        ...validFeedback,
        page_url: '/' + 'a'.repeat(2000),
      })
    ).toThrow()
  })

  it('should reject user_agent longer than 500 characters', () => {
    expect(() =>
      FeedbackSchema.parse({ ...validFeedback, user_agent: 'A'.repeat(501) })
    ).toThrow()
  })
})

describe('FeedbackCreateSchema', () => {
  const validCreate = {
    type: 'bug',
    message: 'The reconciliation grid is not loading.',
    page_url: '/properties/123/reconciliation',
  }

  it('should parse valid create data', () => {
    const result = FeedbackCreateSchema.parse(validCreate)
    expect(result.type).toBe('bug')
    expect(result.message).toBe(validCreate.message)
    expect(result.page_url).toBe(validCreate.page_url)
  })

  it('should accept optional screenshot_url', () => {
    const result = FeedbackCreateSchema.parse({
      ...validCreate,
      screenshot_url: 'https://example.com/screenshot.png',
    })
    expect(result.screenshot_url).toBe('https://example.com/screenshot.png')
  })

  it('should accept null screenshot_url', () => {
    const result = FeedbackCreateSchema.parse({
      ...validCreate,
      screenshot_url: null,
    })
    expect(result.screenshot_url).toBeNull()
  })

  it('should accept optional user_agent', () => {
    const result = FeedbackCreateSchema.parse({
      ...validCreate,
      user_agent: 'Mozilla/5.0',
    })
    expect(result.user_agent).toBe('Mozilla/5.0')
  })

  it('should accept optional metadata', () => {
    const result = FeedbackCreateSchema.parse({
      ...validCreate,
      metadata: { browser: 'Chrome' },
    })
    expect(result.metadata?.browser).toBe('Chrome')
  })

  it('should reject message shorter than 10 characters', () => {
    expect(() =>
      FeedbackCreateSchema.parse({ ...validCreate, message: 'Too short' })
    ).toThrow()
  })
})

describe('FeedbackUpdateSchema', () => {
  it('should accept empty update', () => {
    const result = FeedbackUpdateSchema.parse({})
    expect(result).toEqual({})
  })

  it('should accept status update', () => {
    const result = FeedbackUpdateSchema.parse({ status: 'reviewed' })
    expect(result.status).toBe('reviewed')
  })

  it('should accept metadata update', () => {
    const result = FeedbackUpdateSchema.parse({
      metadata: { admin_notes: 'Investigating' },
    })
    expect(result.metadata?.admin_notes).toBe('Investigating')
  })

  it('should reject invalid status', () => {
    expect(() => FeedbackUpdateSchema.parse({ status: 'invalid' })).toThrow()
  })
})

describe('FeedbackSummarySchema', () => {
  const validSummary = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    type: 'feature_request',
    status: 'reviewed',
    message: 'Please add Light-Only Mode support.',
    page_url: '/settings',
    created_at: '2024-01-15T10:30:00Z',
  }

  it('should parse valid summary', () => {
    const result = FeedbackSummarySchema.parse(validSummary)
    expect(result.id).toBe(validSummary.id)
    expect(result.type).toBe('feature_request')
    expect(result.status).toBe('reviewed')
  })

  it('should reject invalid UUID', () => {
    expect(() =>
      FeedbackSummarySchema.parse({ ...validSummary, id: 'invalid' })
    ).toThrow()
  })
})

describe('isValidFeedbackType', () => {
  it('should return true for valid feedback types', () => {
    expect(isValidFeedbackType('bug')).toBe(true)
    expect(isValidFeedbackType('feature_request')).toBe(true)
    expect(isValidFeedbackType('general')).toBe(true)
  })

  it('should return false for invalid feedback types', () => {
    expect(isValidFeedbackType('invalid')).toBe(false)
    expect(isValidFeedbackType('BUG')).toBe(false)
    expect(isValidFeedbackType('')).toBe(false)
    expect(isValidFeedbackType(null)).toBe(false)
    expect(isValidFeedbackType(undefined)).toBe(false)
  })
})

describe('isValidFeedbackStatus', () => {
  it('should return true for valid feedback statuses', () => {
    expect(isValidFeedbackStatus('new')).toBe(true)
    expect(isValidFeedbackStatus('reviewed')).toBe(true)
    expect(isValidFeedbackStatus('resolved')).toBe(true)
    expect(isValidFeedbackStatus('dismissed')).toBe(true)
  })

  it('should return false for invalid feedback statuses', () => {
    expect(isValidFeedbackStatus('invalid')).toBe(false)
    expect(isValidFeedbackStatus('NEW')).toBe(false)
    expect(isValidFeedbackStatus('')).toBe(false)
    expect(isValidFeedbackStatus(null)).toBe(false)
    expect(isValidFeedbackStatus(undefined)).toBe(false)
  })
})

describe('getFeedbackTypeDisplayName', () => {
  it('should return correct display names', () => {
    expect(getFeedbackTypeDisplayName('bug')).toBe('Bug Report')
    expect(getFeedbackTypeDisplayName('feature_request')).toBe(
      'Feature Request'
    )
    expect(getFeedbackTypeDisplayName('general')).toBe('General Feedback')
  })
})

describe('getFeedbackStatusDisplayName', () => {
  it('should return correct display names', () => {
    expect(getFeedbackStatusDisplayName('new')).toBe('New')
    expect(getFeedbackStatusDisplayName('reviewed')).toBe('Reviewed')
    expect(getFeedbackStatusDisplayName('resolved')).toBe('Resolved')
    expect(getFeedbackStatusDisplayName('dismissed')).toBe('Dismissed')
  })
})

describe('isFeedbackOpen', () => {
  it('should return true for open statuses', () => {
    expect(isFeedbackOpen('new')).toBe(true)
    expect(isFeedbackOpen('reviewed')).toBe(true)
  })

  it('should return false for closed statuses', () => {
    expect(isFeedbackOpen('resolved')).toBe(false)
    expect(isFeedbackOpen('dismissed')).toBe(false)
  })
})

describe('isFeedbackClosed', () => {
  it('should return true for closed statuses', () => {
    expect(isFeedbackClosed('resolved')).toBe(true)
    expect(isFeedbackClosed('dismissed')).toBe(true)
  })

  it('should return false for open statuses', () => {
    expect(isFeedbackClosed('new')).toBe(false)
    expect(isFeedbackClosed('reviewed')).toBe(false)
  })
})

describe('getFeedbackStatusColor', () => {
  it('should return correct colors for each status', () => {
    expect(getFeedbackStatusColor('new')).toBe('default')
    expect(getFeedbackStatusColor('reviewed')).toBe('secondary')
    expect(getFeedbackStatusColor('resolved')).toBe('success')
    expect(getFeedbackStatusColor('dismissed')).toBe('destructive')
  })
})

describe('getFeedbackTypeColor', () => {
  it('should return correct colors for each type', () => {
    expect(getFeedbackTypeColor('bug')).toBe('destructive')
    expect(getFeedbackTypeColor('feature_request')).toBe('secondary')
    expect(getFeedbackTypeColor('general')).toBe('default')
  })
})

describe('truncateFeedbackMessage', () => {
  it('should return message unchanged if shorter than max length', () => {
    expect(truncateFeedbackMessage('Short message', 100)).toBe('Short message')
  })

  it('should truncate message if longer than max length', () => {
    const longMessage = 'This is a very long message that exceeds the limit'
    const result = truncateFeedbackMessage(longMessage, 20)
    expect(result).toBe('This is a very long...')
    expect(result.length).toBeLessThanOrEqual(23) // 20 + '...'
  })

  it('should use default max length of 100', () => {
    const message = 'A'.repeat(150)
    const result = truncateFeedbackMessage(message)
    expect(result.length).toBe(103) // 100 + '...'
  })

  it('should handle exact max length', () => {
    const message = '1234567890'
    expect(truncateFeedbackMessage(message, 10)).toBe('1234567890')
  })

  it('should trim whitespace before adding ellipsis', () => {
    const message = 'Hello world with trailing space'
    const result = truncateFeedbackMessage(message, 12)
    expect(result).toBe('Hello world...')
  })
})

describe('Edge Cases', () => {
  it('should handle complex metadata structures', () => {
    const metadata = {
      browser: 'Chrome 120.0.0',
      os: 'Windows 11',
      viewport: { width: 1920, height: 1080 },
      console_errors: ['Error 1', 'Error 2'],
      component_stack: 'at Component > at App',
      custom_nested: { deep: { value: 'test' } },
    }
    const result = FeedbackMetadataSchema.parse(metadata)
    expect(result.browser).toBe('Chrome 120.0.0')
    expect(result.viewport?.width).toBe(1920)
    expect((result as Record<string, unknown>).custom_nested).toEqual({
      deep: { value: 'test' },
    })
  })

  it('should handle various page_url formats', () => {
    const urls = [
      '/dashboard',
      '/properties/123',
      '/properties/123/units?filter=active',
      '/reconciliation#summary',
    ]
    for (const url of urls) {
      const result = FeedbackCreateSchema.parse({
        type: 'general',
        message: 'Testing URL format validation.',
        page_url: url,
      })
      expect(result.page_url).toBe(url)
    }
  })

  it('should handle message at boundary lengths', () => {
    // Exactly 10 characters
    const result10 = FeedbackCreateSchema.parse({
      type: 'general',
      message: '1234567890',
      page_url: '/test',
    })
    expect(result10.message.length).toBe(10)

    // Exactly 5000 characters
    const result5000 = FeedbackCreateSchema.parse({
      type: 'general',
      message: 'A'.repeat(5000),
      page_url: '/test',
    })
    expect(result5000.message.length).toBe(5000)
  })
})
