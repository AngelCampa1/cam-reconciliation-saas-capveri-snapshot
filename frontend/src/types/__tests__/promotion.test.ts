/**
 * Tests for Promotion domain types.
 *
 * Tests cover DiscountType, PromotionStatus, Zod schemas, and helper functions
 * for promotional codes and coupon redemptions.
 */

import { describe, it, expect } from 'vitest'
import {
  DiscountType,
  DiscountTypeSchema,
  PromotionStatus,
  PromotionStatusSchema,
  EligibilityRulesSchema,
  PromotionSchema,
  PromotionCreateSchema,
  PromotionUpdateSchema,
  PromotionRedemptionSchema,
  PromotionSummarySchema,
  isValidDiscountType,
  isValidPromotionStatus,
  getDiscountTypeDisplayName,
  getPromotionStatusDisplayName,
  isPromotionActive,
  hasRemainingRedemptions,
  getRemainingRedemptions,
  formatDiscountValue,
  isPromotionInDateRange,
} from '../promotion'

describe('DiscountType', () => {
  it('should have correct enum values', () => {
    expect(DiscountType.PERCENTAGE).toBe('percentage')
    expect(DiscountType.FIXED_AMOUNT).toBe('fixed_amount')
    expect(DiscountType.FREE_TRIAL_EXTENSION).toBe('free_trial_extension')
  })

  it('should have exactly 3 members', () => {
    expect(Object.keys(DiscountType)).toHaveLength(3)
  })
})

describe('DiscountTypeSchema', () => {
  it('should accept valid discount types', () => {
    expect(DiscountTypeSchema.parse('percentage')).toBe('percentage')
    expect(DiscountTypeSchema.parse('fixed_amount')).toBe('fixed_amount')
    expect(DiscountTypeSchema.parse('free_trial_extension')).toBe(
      'free_trial_extension'
    )
  })

  it('should reject invalid discount types', () => {
    expect(() => DiscountTypeSchema.parse('invalid')).toThrow()
    expect(() => DiscountTypeSchema.parse('PERCENTAGE')).toThrow()
    expect(() => DiscountTypeSchema.parse('')).toThrow()
  })
})

describe('PromotionStatus', () => {
  it('should have correct enum values', () => {
    expect(PromotionStatus.ACTIVE).toBe('active')
    expect(PromotionStatus.EXPIRED).toBe('expired')
    expect(PromotionStatus.EXHAUSTED).toBe('exhausted')
    expect(PromotionStatus.DISABLED).toBe('disabled')
  })

  it('should have exactly 4 members', () => {
    expect(Object.keys(PromotionStatus)).toHaveLength(4)
  })
})

describe('PromotionStatusSchema', () => {
  it('should accept valid promotion statuses', () => {
    expect(PromotionStatusSchema.parse('active')).toBe('active')
    expect(PromotionStatusSchema.parse('expired')).toBe('expired')
    expect(PromotionStatusSchema.parse('exhausted')).toBe('exhausted')
    expect(PromotionStatusSchema.parse('disabled')).toBe('disabled')
  })

  it('should reject invalid promotion statuses', () => {
    expect(() => PromotionStatusSchema.parse('invalid')).toThrow()
    expect(() => PromotionStatusSchema.parse('ACTIVE')).toThrow()
    expect(() => PromotionStatusSchema.parse('')).toThrow()
  })
})

describe('EligibilityRulesSchema', () => {
  it('should accept empty object', () => {
    const result = EligibilityRulesSchema.parse({})
    expect(result).toEqual({})
  })

  it('should accept first_n_users rule', () => {
    const result = EligibilityRulesSchema.parse({ first_n_users: 100 })
    expect(result.first_n_users).toBe(100)
  })

  it('should accept plan_restriction rule', () => {
    const result = EligibilityRulesSchema.parse({
      plan_restriction: ['essentials', 'professional'],
    })
    expect(result.plan_restriction).toEqual(['essentials', 'professional'])
  })

  it('should accept new_customers_only rule', () => {
    const result = EligibilityRulesSchema.parse({ new_customers_only: true })
    expect(result.new_customers_only).toBe(true)
  })

  it('should accept one_per_organization rule', () => {
    const result = EligibilityRulesSchema.parse({ one_per_organization: true })
    expect(result.one_per_organization).toBe(true)
  })

  it('should accept multiple rules', () => {
    const result = EligibilityRulesSchema.parse({
      first_n_users: 50,
      new_customers_only: true,
      plan_restriction: ['starter'],
    })
    expect(result.first_n_users).toBe(50)
    expect(result.new_customers_only).toBe(true)
    expect(result.plan_restriction).toEqual(['starter'])
  })

  it('should allow additional properties via passthrough', () => {
    const result = EligibilityRulesSchema.parse({
      custom_rule: 'custom_value',
    })
    expect((result as Record<string, unknown>).custom_rule).toBe('custom_value')
  })
})

describe('PromotionSchema', () => {
  const validPromotion = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    code: 'SAVE20',
    name: 'Save 20%',
    description: 'Limited time offer',
    discount_type: 'percentage',
    discount_value: '20',
    duration_months: 3,
    max_redemptions: 300,
    current_redemptions: 25,
    valid_from: '2024-01-01T00:00:00Z',
    valid_until: '2024-12-31T23:59:59Z',
    eligibility_rules: { new_customers_only: true },
    stripe_coupon_id: 'coup_abc123',
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T12:00:00Z',
  }

  it('should parse valid promotion', () => {
    const result = PromotionSchema.parse(validPromotion)
    expect(result.id).toBe(validPromotion.id)
    expect(result.code).toBe('SAVE20')
    expect(result.name).toBe('Save 20%')
    expect(result.discount_type).toBe('percentage')
    expect(result.discount_value).toBe('20')
  })

  it('should transform code to uppercase', () => {
    const result = PromotionSchema.parse({ ...validPromotion, code: 'save20' })
    expect(result.code).toBe('SAVE20')
  })

  it('should transform discount_value to string', () => {
    const result = PromotionSchema.parse({
      ...validPromotion,
      discount_value: 20,
    })
    expect(result.discount_value).toBe('20')
  })

  it('should accept null description', () => {
    const result = PromotionSchema.parse({
      ...validPromotion,
      description: null,
    })
    expect(result.description).toBeNull()
  })

  it('should accept null duration_months', () => {
    const result = PromotionSchema.parse({
      ...validPromotion,
      duration_months: null,
    })
    expect(result.duration_months).toBeNull()
  })

  it('should accept null max_redemptions', () => {
    const result = PromotionSchema.parse({
      ...validPromotion,
      max_redemptions: null,
    })
    expect(result.max_redemptions).toBeNull()
  })

  it('should accept null valid_until', () => {
    const result = PromotionSchema.parse({
      ...validPromotion,
      valid_until: null,
    })
    expect(result.valid_until).toBeNull()
  })

  it('should accept null stripe_coupon_id', () => {
    const result = PromotionSchema.parse({
      ...validPromotion,
      stripe_coupon_id: null,
    })
    expect(result.stripe_coupon_id).toBeNull()
  })

  it('should default eligibility_rules to empty object', () => {
    const { eligibility_rules, ...rest } = validPromotion
    void eligibility_rules // Unused, intentionally excluded from test
    const result = PromotionSchema.parse(rest)
    expect(result.eligibility_rules).toEqual({})
  })

  it('should default current_redemptions to 0', () => {
    const { current_redemptions, ...rest } = validPromotion
    void current_redemptions // Unused, intentionally excluded from test
    const result = PromotionSchema.parse(rest)
    expect(result.current_redemptions).toBe(0)
  })

  it('should reject invalid UUID', () => {
    expect(() =>
      PromotionSchema.parse({ ...validPromotion, id: 'invalid' })
    ).toThrow()
  })

  it('should reject code shorter than 3 characters', () => {
    expect(() =>
      PromotionSchema.parse({ ...validPromotion, code: 'AB' })
    ).toThrow()
  })

  it('should reject code longer than 50 characters', () => {
    expect(() =>
      PromotionSchema.parse({ ...validPromotion, code: 'A'.repeat(51) })
    ).toThrow()
  })

  it('should reject empty name', () => {
    expect(() =>
      PromotionSchema.parse({ ...validPromotion, name: '' })
    ).toThrow()
  })

  it('should reject name longer than 100 characters', () => {
    expect(() =>
      PromotionSchema.parse({ ...validPromotion, name: 'A'.repeat(101) })
    ).toThrow()
  })

  it('should reject description longer than 500 characters', () => {
    expect(() =>
      PromotionSchema.parse({
        ...validPromotion,
        description: 'A'.repeat(501),
      })
    ).toThrow()
  })

  it('should reject duration_months less than 1', () => {
    expect(() =>
      PromotionSchema.parse({ ...validPromotion, duration_months: 0 })
    ).toThrow()
  })

  it('should reject duration_months greater than 36', () => {
    expect(() =>
      PromotionSchema.parse({ ...validPromotion, duration_months: 37 })
    ).toThrow()
  })

  it('should reject max_redemptions less than 1', () => {
    expect(() =>
      PromotionSchema.parse({ ...validPromotion, max_redemptions: 0 })
    ).toThrow()
  })
})

describe('PromotionCreateSchema', () => {
  const validCreate = {
    code: 'NEWUSER',
    name: 'New User Discount',
    discount_type: 'percentage',
    discount_value: '15',
    valid_from: '2024-01-01T00:00:00Z',
  }

  it('should parse valid create data', () => {
    const result = PromotionCreateSchema.parse(validCreate)
    expect(result.code).toBe('NEWUSER')
    expect(result.name).toBe('New User Discount')
    expect(result.discount_type).toBe('percentage')
  })

  it('should accept optional description', () => {
    const result = PromotionCreateSchema.parse({
      ...validCreate,
      description: 'Welcome offer',
    })
    expect(result.description).toBe('Welcome offer')
  })

  it('should accept optional duration_months', () => {
    const result = PromotionCreateSchema.parse({
      ...validCreate,
      duration_months: 6,
    })
    expect(result.duration_months).toBe(6)
  })

  it('should accept optional max_redemptions', () => {
    const result = PromotionCreateSchema.parse({
      ...validCreate,
      max_redemptions: 500,
    })
    expect(result.max_redemptions).toBe(500)
  })

  it('should accept optional valid_until', () => {
    const result = PromotionCreateSchema.parse({
      ...validCreate,
      valid_until: '2024-06-30T23:59:59Z',
    })
    expect(result.valid_until).toBe('2024-06-30T23:59:59Z')
  })

  it('should accept optional eligibility_rules', () => {
    const result = PromotionCreateSchema.parse({
      ...validCreate,
      eligibility_rules: { new_customers_only: true },
    })
    expect(result.eligibility_rules?.new_customers_only).toBe(true)
  })

  it('should accept optional stripe_coupon_id', () => {
    const result = PromotionCreateSchema.parse({
      ...validCreate,
      stripe_coupon_id: 'coup_xyz',
    })
    expect(result.stripe_coupon_id).toBe('coup_xyz')
  })

  it('should accept numeric discount_value', () => {
    const result = PromotionCreateSchema.parse({
      ...validCreate,
      discount_value: 15,
    })
    expect(result.discount_value).toBe(15)
  })
})

describe('PromotionUpdateSchema', () => {
  it('should accept empty update', () => {
    const result = PromotionUpdateSchema.parse({})
    expect(result).toEqual({})
  })

  it('should accept name update', () => {
    const result = PromotionUpdateSchema.parse({ name: 'Updated Name' })
    expect(result.name).toBe('Updated Name')
  })

  it('should accept description update', () => {
    const result = PromotionUpdateSchema.parse({
      description: 'Updated description',
    })
    expect(result.description).toBe('Updated description')
  })

  it('should accept null description', () => {
    const result = PromotionUpdateSchema.parse({ description: null })
    expect(result.description).toBeNull()
  })

  it('should accept max_redemptions update', () => {
    const result = PromotionUpdateSchema.parse({ max_redemptions: 200 })
    expect(result.max_redemptions).toBe(200)
  })

  it('should accept null max_redemptions', () => {
    const result = PromotionUpdateSchema.parse({ max_redemptions: null })
    expect(result.max_redemptions).toBeNull()
  })

  it('should accept valid_until update', () => {
    const result = PromotionUpdateSchema.parse({
      valid_until: '2025-01-01T00:00:00Z',
    })
    expect(result.valid_until).toBe('2025-01-01T00:00:00Z')
  })

  it('should accept null valid_until', () => {
    const result = PromotionUpdateSchema.parse({ valid_until: null })
    expect(result.valid_until).toBeNull()
  })

  it('should accept status update', () => {
    const result = PromotionUpdateSchema.parse({ status: 'disabled' })
    expect(result.status).toBe('disabled')
  })

  it('should accept eligibility_rules update', () => {
    const result = PromotionUpdateSchema.parse({
      eligibility_rules: { first_n_users: 50 },
    })
    expect(result.eligibility_rules?.first_n_users).toBe(50)
  })

  it('should reject invalid status', () => {
    expect(() => PromotionUpdateSchema.parse({ status: 'invalid' })).toThrow()
  })
})

describe('PromotionRedemptionSchema', () => {
  const validRedemption = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    promotion_id: '660e8400-e29b-41d4-a716-446655440001',
    organization_id: '770e8400-e29b-41d4-a716-446655440002',
    redeemed_at: '2024-03-15T10:30:00Z',
    stripe_discount_id: null,
  }

  it('should parse valid redemption', () => {
    const result = PromotionRedemptionSchema.parse(validRedemption)
    expect(result.id).toBe(validRedemption.id)
    expect(result.promotion_id).toBe(validRedemption.promotion_id)
    expect(result.organization_id).toBe(validRedemption.organization_id)
    expect(result.redeemed_at).toBe(validRedemption.redeemed_at)
  })

  it('should accept stripe_discount_id', () => {
    const result = PromotionRedemptionSchema.parse({
      ...validRedemption,
      stripe_discount_id: 'di_abc123',
    })
    expect(result.stripe_discount_id).toBe('di_abc123')
  })

  it('should reject invalid promotion_id', () => {
    expect(() =>
      PromotionRedemptionSchema.parse({
        ...validRedemption,
        promotion_id: 'invalid',
      })
    ).toThrow()
  })

  it('should reject invalid organization_id', () => {
    expect(() =>
      PromotionRedemptionSchema.parse({
        ...validRedemption,
        organization_id: 'invalid',
      })
    ).toThrow()
  })
})

describe('PromotionSummarySchema', () => {
  const validSummary = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    code: 'FLASH25',
    name: 'Flash Sale',
    discount_type: 'percentage',
    discount_value: '25',
    status: 'active',
    current_redemptions: 50,
    max_redemptions: 300,
    valid_until: '2024-12-31T23:59:59Z',
  }

  it('should parse valid summary', () => {
    const result = PromotionSummarySchema.parse(validSummary)
    expect(result.id).toBe(validSummary.id)
    expect(result.code).toBe('FLASH25')
    expect(result.name).toBe('Flash Sale')
    expect(result.discount_type).toBe('percentage')
    expect(result.discount_value).toBe('25')
  })

  it('should transform discount_value to string', () => {
    const result = PromotionSummarySchema.parse({
      ...validSummary,
      discount_value: 25,
    })
    expect(result.discount_value).toBe('25')
  })

  it('should accept null max_redemptions', () => {
    const result = PromotionSummarySchema.parse({
      ...validSummary,
      max_redemptions: null,
    })
    expect(result.max_redemptions).toBeNull()
  })

  it('should accept null valid_until', () => {
    const result = PromotionSummarySchema.parse({
      ...validSummary,
      valid_until: null,
    })
    expect(result.valid_until).toBeNull()
  })
})

describe('isValidDiscountType', () => {
  it('should return true for valid discount types', () => {
    expect(isValidDiscountType('percentage')).toBe(true)
    expect(isValidDiscountType('fixed_amount')).toBe(true)
    expect(isValidDiscountType('free_trial_extension')).toBe(true)
  })

  it('should return false for invalid discount types', () => {
    expect(isValidDiscountType('invalid')).toBe(false)
    expect(isValidDiscountType('PERCENTAGE')).toBe(false)
    expect(isValidDiscountType('')).toBe(false)
    expect(isValidDiscountType(null)).toBe(false)
    expect(isValidDiscountType(undefined)).toBe(false)
  })
})

describe('isValidPromotionStatus', () => {
  it('should return true for valid promotion statuses', () => {
    expect(isValidPromotionStatus('active')).toBe(true)
    expect(isValidPromotionStatus('expired')).toBe(true)
    expect(isValidPromotionStatus('exhausted')).toBe(true)
    expect(isValidPromotionStatus('disabled')).toBe(true)
  })

  it('should return false for invalid promotion statuses', () => {
    expect(isValidPromotionStatus('invalid')).toBe(false)
    expect(isValidPromotionStatus('ACTIVE')).toBe(false)
    expect(isValidPromotionStatus('')).toBe(false)
    expect(isValidPromotionStatus(null)).toBe(false)
    expect(isValidPromotionStatus(undefined)).toBe(false)
  })
})

describe('getDiscountTypeDisplayName', () => {
  it('should return correct display names', () => {
    expect(getDiscountTypeDisplayName('percentage')).toBe('Percentage')
    expect(getDiscountTypeDisplayName('fixed_amount')).toBe('Fixed Amount')
    expect(getDiscountTypeDisplayName('free_trial_extension')).toBe(
      'Free Trial Extension'
    )
  })
})

describe('getPromotionStatusDisplayName', () => {
  it('should return correct display names', () => {
    expect(getPromotionStatusDisplayName('active')).toBe('Active')
    expect(getPromotionStatusDisplayName('expired')).toBe('Expired')
    expect(getPromotionStatusDisplayName('exhausted')).toBe('Exhausted')
    expect(getPromotionStatusDisplayName('disabled')).toBe('Disabled')
  })
})

describe('isPromotionActive', () => {
  it('should return true for active status', () => {
    expect(isPromotionActive('active')).toBe(true)
  })

  it('should return false for non-active statuses', () => {
    expect(isPromotionActive('expired')).toBe(false)
    expect(isPromotionActive('exhausted')).toBe(false)
    expect(isPromotionActive('disabled')).toBe(false)
  })
})

describe('hasRemainingRedemptions', () => {
  it('should return true for unlimited redemptions (null)', () => {
    expect(hasRemainingRedemptions(0, null)).toBe(true)
    expect(hasRemainingRedemptions(1000, null)).toBe(true)
  })

  it('should return true when current < max', () => {
    expect(hasRemainingRedemptions(0, 100)).toBe(true)
    expect(hasRemainingRedemptions(50, 100)).toBe(true)
    expect(hasRemainingRedemptions(99, 100)).toBe(true)
  })

  it('should return false when current >= max', () => {
    expect(hasRemainingRedemptions(100, 100)).toBe(false)
    expect(hasRemainingRedemptions(150, 100)).toBe(false)
  })
})

describe('getRemainingRedemptions', () => {
  it('should return null for unlimited redemptions', () => {
    expect(getRemainingRedemptions(50, null)).toBeNull()
  })

  it('should return correct remaining count', () => {
    expect(getRemainingRedemptions(0, 100)).toBe(100)
    expect(getRemainingRedemptions(25, 100)).toBe(75)
    expect(getRemainingRedemptions(100, 100)).toBe(0)
  })

  it('should return 0 when over limit', () => {
    expect(getRemainingRedemptions(150, 100)).toBe(0)
  })
})

describe('formatDiscountValue', () => {
  it('should format percentage discount', () => {
    expect(formatDiscountValue('20', 'percentage')).toBe('20%')
    expect(formatDiscountValue(15, 'percentage')).toBe('15%')
    expect(formatDiscountValue('50.5', 'percentage')).toBe('50.5%')
  })

  it('should format fixed amount discount with currency', () => {
    expect(formatDiscountValue('100', 'fixed_amount')).toBe('$100.00')
    expect(formatDiscountValue(50.5, 'fixed_amount')).toBe('$50.50')
  })

  it('should format fixed amount with different currency', () => {
    const result = formatDiscountValue('100', 'fixed_amount', 'eur')
    expect(result).toContain('100')
  })

  it('should format free trial extension', () => {
    expect(formatDiscountValue('14', 'free_trial_extension')).toBe(
      '14 days free'
    )
    expect(formatDiscountValue(30, 'free_trial_extension')).toBe('30 days free')
  })
})

describe('isPromotionInDateRange', () => {
  it('should return true when check date is after valid_from', () => {
    const validFrom = '2024-01-01T00:00:00Z'
    const checkDate = new Date('2024-06-15T12:00:00Z')
    expect(isPromotionInDateRange(validFrom, null, checkDate)).toBe(true)
  })

  it('should return false when check date is before valid_from', () => {
    const validFrom = '2024-06-01T00:00:00Z'
    const checkDate = new Date('2024-01-15T12:00:00Z')
    expect(isPromotionInDateRange(validFrom, null, checkDate)).toBe(false)
  })

  it('should return true when check date is within range', () => {
    const validFrom = '2024-01-01T00:00:00Z'
    const validUntil = '2024-12-31T23:59:59Z'
    const checkDate = new Date('2024-06-15T12:00:00Z')
    expect(isPromotionInDateRange(validFrom, validUntil, checkDate)).toBe(true)
  })

  it('should return false when check date is after valid_until', () => {
    const validFrom = '2024-01-01T00:00:00Z'
    const validUntil = '2024-06-30T23:59:59Z'
    const checkDate = new Date('2024-12-15T12:00:00Z')
    expect(isPromotionInDateRange(validFrom, validUntil, checkDate)).toBe(false)
  })

  it('should use current date when checkDate not provided', () => {
    const pastFrom = '2020-01-01T00:00:00Z'
    expect(isPromotionInDateRange(pastFrom, null)).toBe(true)
  })
})

describe('Edge Cases', () => {
  it('should handle code at minimum length', () => {
    const result = PromotionSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      code: 'ABC',
      name: 'Test',
      description: null,
      discount_type: 'percentage',
      discount_value: '10',
      duration_months: null,
      max_redemptions: null,
      current_redemptions: 0,
      valid_from: '2024-01-01T00:00:00Z',
      valid_until: null,
      eligibility_rules: {},
      stripe_coupon_id: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('should handle code at maximum length', () => {
    const result = PromotionSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      code: 'A'.repeat(50),
      name: 'Test',
      description: null,
      discount_type: 'percentage',
      discount_value: '10',
      duration_months: null,
      max_redemptions: null,
      current_redemptions: 0,
      valid_from: '2024-01-01T00:00:00Z',
      valid_until: null,
      eligibility_rules: {},
      stripe_coupon_id: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('should handle duration_months at boundary values', () => {
    // Minimum
    const min = PromotionSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      code: 'MIN',
      name: 'Minimum Duration',
      description: null,
      discount_type: 'percentage',
      discount_value: '10',
      duration_months: 1,
      max_redemptions: null,
      current_redemptions: 0,
      valid_from: '2024-01-01T00:00:00Z',
      valid_until: null,
      eligibility_rules: {},
      stripe_coupon_id: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })
    expect(min.success).toBe(true)

    // Maximum
    const max = PromotionSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      code: 'MAX',
      name: 'Maximum Duration',
      description: null,
      discount_type: 'percentage',
      discount_value: '10',
      duration_months: 36,
      max_redemptions: null,
      current_redemptions: 0,
      valid_from: '2024-01-01T00:00:00Z',
      valid_until: null,
      eligibility_rules: {},
      stripe_coupon_id: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })
    expect(max.success).toBe(true)
  })

  it('should handle very small percentage', () => {
    expect(formatDiscountValue('0.01', 'percentage')).toBe('0.01%')
  })

  it('should handle large fixed amounts', () => {
    const result = formatDiscountValue('10000', 'fixed_amount')
    expect(result).toContain('10,000')
  })
})
