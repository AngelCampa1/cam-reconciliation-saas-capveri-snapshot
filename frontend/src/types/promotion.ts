/**
 * Promotion domain types for discounts and coupons.
 *
 * This module defines the Promotion entity for managing promotional codes,
 * discounts, and coupon redemptions. Supports percentage discounts, fixed
 * amounts, and trial extensions with flexible eligibility rules.
 */

import { z } from 'zod'
import { formatMoney } from '@/lib/money'

/**
 * Type of discount applied.
 *
 * Defines how the discount_value should be interpreted.
 */
export const DiscountType = {
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
  FREE_TRIAL_EXTENSION: 'free_trial_extension',
} as const
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType]

/**
 * Current status of a promotion.
 *
 * Tracks the lifecycle state of a promotional code.
 */
export const PromotionStatus = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  EXHAUSTED: 'exhausted',
  DISABLED: 'disabled',
} as const
export type PromotionStatus =
  (typeof PromotionStatus)[keyof typeof PromotionStatus]

/**
 * Zod schema for discount type validation.
 */
export const DiscountTypeSchema = z.enum([
  'percentage',
  'fixed_amount',
  'free_trial_extension',
])

/**
 * Zod schema for promotion status validation.
 */
export const PromotionStatusSchema = z.enum([
  'active',
  'expired',
  'exhausted',
  'disabled',
])

/**
 * Zod schema for eligibility rules.
 *
 * Flexible schema that allows additional properties for future rule types.
 */
export const EligibilityRulesSchema = z
  .object({
    first_n_users: z.number().optional(),
    plan_restriction: z.array(z.string()).optional(),
    new_customers_only: z.boolean().optional(),
    one_per_organization: z.boolean().optional(),
  })
  .passthrough()

export type EligibilityRules = z.infer<typeof EligibilityRulesSchema>

/**
 * Full promotion schema with all fields.
 */
export const PromotionSchema = z.object({
  id: z.string().uuid(),
  code: z
    .string()
    .min(3)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  discount_type: DiscountTypeSchema,
  discount_value: z
    .string()
    .or(z.number())
    .transform((v) => String(v)),
  duration_months: z.number().min(1).max(36).nullable(),
  max_redemptions: z.number().min(1).nullable(),
  current_redemptions: z.number().default(0),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime().nullable(),
  eligibility_rules: EligibilityRulesSchema.default({}),
  stripe_coupon_id: z.string().nullable(),
  status: PromotionStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Promotion = z.infer<typeof PromotionSchema>

/**
 * Schema for creating a new promotion.
 */
export const PromotionCreateSchema = z.object({
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  discount_type: DiscountTypeSchema,
  discount_value: z.string().or(z.number()),
  duration_months: z.number().min(1).max(36).nullable().optional(),
  max_redemptions: z.number().min(1).nullable().optional(),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime().nullable().optional(),
  eligibility_rules: EligibilityRulesSchema.optional(),
  stripe_coupon_id: z.string().nullable().optional(),
})

export type PromotionCreate = z.infer<typeof PromotionCreateSchema>

/**
 * Schema for updating an existing promotion.
 */
export const PromotionUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  max_redemptions: z.number().min(1).nullable().optional(),
  valid_until: z.string().datetime().nullable().optional(),
  status: PromotionStatusSchema.optional(),
  eligibility_rules: EligibilityRulesSchema.optional(),
})

export type PromotionUpdate = z.infer<typeof PromotionUpdateSchema>

/**
 * Schema for promotion redemption records.
 */
export const PromotionRedemptionSchema = z.object({
  id: z.string().uuid(),
  promotion_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  redeemed_at: z.string().datetime(),
  stripe_discount_id: z.string().nullable(),
})

export type PromotionRedemption = z.infer<typeof PromotionRedemptionSchema>

/**
 * Lightweight promotion view for listings.
 */
export const PromotionSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  discount_type: DiscountTypeSchema,
  discount_value: z
    .string()
    .or(z.number())
    .transform((v) => String(v)),
  status: PromotionStatusSchema,
  current_redemptions: z.number(),
  max_redemptions: z.number().nullable(),
  valid_until: z.string().datetime().nullable(),
})

export type PromotionSummary = z.infer<typeof PromotionSummarySchema>

/**
 * Type guard for valid discount type.
 */
export function isValidDiscountType(value: unknown): value is DiscountType {
  return DiscountTypeSchema.safeParse(value).success
}

/**
 * Type guard for valid promotion status.
 */
export function isValidPromotionStatus(
  value: unknown
): value is PromotionStatus {
  return PromotionStatusSchema.safeParse(value).success
}

/**
 * Get display name for discount type.
 */
export function getDiscountTypeDisplayName(type: DiscountType): string {
  const displayNames: Record<DiscountType, string> = {
    percentage: 'Percentage',
    fixed_amount: 'Fixed Amount',
    free_trial_extension: 'Free Trial Extension',
  }
  return displayNames[type]
}

/**
 * Get display name for promotion status.
 */
export function getPromotionStatusDisplayName(status: PromotionStatus): string {
  const displayNames: Record<PromotionStatus, string> = {
    active: 'Active',
    expired: 'Expired',
    exhausted: 'Exhausted',
    disabled: 'Disabled',
  }
  return displayNames[status]
}

/**
 * Check if promotion is currently usable.
 */
export function isPromotionActive(status: PromotionStatus): boolean {
  return status === 'active'
}

/**
 * Check if promotion has remaining redemptions.
 */
export function hasRemainingRedemptions(
  currentRedemptions: number,
  maxRedemptions: number | null
): boolean {
  if (maxRedemptions === null) {
    return true // Unlimited
  }
  return currentRedemptions < maxRedemptions
}

/**
 * Calculate remaining redemptions.
 */
export function getRemainingRedemptions(
  currentRedemptions: number,
  maxRedemptions: number | null
): number | null {
  if (maxRedemptions === null) {
    return null // Unlimited
  }
  return Math.max(0, maxRedemptions - currentRedemptions)
}

/**
 * Format discount value for display.
 */
export function formatDiscountValue(
  value: string | number,
  type: DiscountType,
  currency: string = 'usd'
): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value

  switch (type) {
    case 'percentage':
      return `${numValue}%`
    case 'fixed_amount':
      return formatMoney(numValue, currency)
    case 'free_trial_extension':
      return `${numValue} days free`
    default:
      return String(numValue)
  }
}

/**
 * Check if promotion is within valid date range.
 */
export function isPromotionInDateRange(
  validFrom: string,
  validUntil: string | null,
  checkDate: Date = new Date()
): boolean {
  const from = new Date(validFrom)
  if (checkDate < from) {
    return false
  }
  if (validUntil !== null) {
    const until = new Date(validUntil)
    if (checkDate > until) {
      return false
    }
  }
  return true
}
