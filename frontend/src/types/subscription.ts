/**
 * Subscription domain types for billing management.
 *
 * The product now supports hybrid per-unit recurring subscriptions while
 * preserving legacy per-building rows and credit-pack billing.
 */

import { z } from 'zod'

export const BillingSubscriptionStatus = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  PAUSED: 'paused',
} as const
export type BillingSubscriptionStatus =
  (typeof BillingSubscriptionStatus)[keyof typeof BillingSubscriptionStatus]

export const SubscriptionPlan = {
  ESSENTIALS: 'essentials',
  GROWTH: 'growth',
  GROWTH_V2: 'growth_v2',
  PORTFOLIO: 'portfolio',
  ENTERPRISE: 'enterprise',
} as const
export type SubscriptionPlan =
  (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan]

export const SubscriptionPricingModel = {
  PER_BUILDING: 'per_building',
  PER_UNIT: 'per_unit',
  CREDIT_PACK: 'credit_pack',
} as const
export type SubscriptionPricingModel =
  (typeof SubscriptionPricingModel)[keyof typeof SubscriptionPricingModel]

export const BillingSubscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'paused',
])

export const SubscriptionPlanSchema = z.enum([
  'essentials',
  'growth',
  'growth_v2',
  'portfolio',
  'enterprise',
])

export const SubscriptionPricingModelSchema = z.enum([
  'per_building',
  'per_unit',
  'credit_pack',
])

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  stripe_subscription_id: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  plan: SubscriptionPlanSchema,
  status: BillingSubscriptionStatusSchema,
  pricing_model: SubscriptionPricingModelSchema.default('per_building'),
  building_count: z.number().int().min(1),
  unit_count: z.number().int().min(0).nullable().optional(),
  included_units: z.number().int().min(0).nullable().optional(),
  unit_overage_count: z.number().int().min(0).nullable().optional(),
  current_period_start: z.string().datetime(),
  current_period_end: z.string().datetime(),
  cancel_at_period_end: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Subscription = z.infer<typeof SubscriptionSchema>

export const SubscriptionCreateSchema = z.object({
  organization_id: z.string().uuid(),
  plan: SubscriptionPlanSchema,
  status: BillingSubscriptionStatusSchema.optional().default('trialing'),
  pricing_model:
    SubscriptionPricingModelSchema.optional().default('per_building'),
  building_count: z.number().int().min(1).default(1),
  unit_count: z.number().int().min(0).nullable().optional(),
  included_units: z.number().int().min(0).nullable().optional(),
  unit_overage_count: z.number().int().min(0).nullable().optional(),
  stripe_subscription_id: z.string().nullable().optional(),
  stripe_customer_id: z.string().nullable().optional(),
})

export type SubscriptionCreate = z.infer<typeof SubscriptionCreateSchema>

export const SubscriptionUpdateSchema = z.object({
  plan: SubscriptionPlanSchema.optional(),
  status: BillingSubscriptionStatusSchema.optional(),
  pricing_model: SubscriptionPricingModelSchema.optional(),
  building_count: z.number().int().min(1).optional(),
  unit_count: z.number().int().min(0).nullable().optional(),
  included_units: z.number().int().min(0).nullable().optional(),
  unit_overage_count: z.number().int().min(0).nullable().optional(),
  stripe_subscription_id: z.string().nullable().optional(),
  cancel_at_period_end: z.boolean().optional(),
})

export type SubscriptionUpdate = z.infer<typeof SubscriptionUpdateSchema>

export const SubscriptionSummarySchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  plan: SubscriptionPlanSchema,
  status: BillingSubscriptionStatusSchema,
  pricing_model: SubscriptionPricingModelSchema.default('per_building'),
  building_count: z.number().int().min(1),
  unit_count: z.number().int().min(0).nullable().optional(),
  current_period_end: z.string().datetime(),
  cancel_at_period_end: z.boolean(),
})

export type SubscriptionSummary = z.infer<typeof SubscriptionSummarySchema>

export function isValidBillingSubscriptionStatus(
  value: unknown
): value is BillingSubscriptionStatus {
  return BillingSubscriptionStatusSchema.safeParse(value).success
}

export function isValidSubscriptionPlan(
  value: unknown
): value is SubscriptionPlan {
  return SubscriptionPlanSchema.safeParse(value).success
}

export function getPlanDisplayName(plan: SubscriptionPlan): string {
  const displayNames: Record<SubscriptionPlan, string> = {
    essentials: 'Essentials',
    growth: 'Growth',
    growth_v2: 'Growth',
    portfolio: 'Portfolio',
    enterprise: 'Enterprise',
  }
  return displayNames[plan]
}

export function getBillingStatusDisplayName(
  status: BillingSubscriptionStatus
): string {
  const displayNames: Record<BillingSubscriptionStatus, string> = {
    trialing: 'Trialing',
    active: 'Active',
    past_due: 'Past Due',
    canceled: 'Canceled',
    paused: 'Paused',
  }
  return displayNames[status]
}

export function isSubscriptionActive(
  status: BillingSubscriptionStatus
): boolean {
  return status === 'active' || status === 'trialing'
}

export function requiresPaymentAction(
  status: BillingSubscriptionStatus
): boolean {
  return status === 'past_due'
}

export function getPlanForUnitCount(unitCount: number): SubscriptionPlan {
  return unitCount <= 50
    ? SubscriptionPlan.GROWTH_V2
    : unitCount <= 500
      ? SubscriptionPlan.PORTFOLIO
      : SubscriptionPlan.ENTERPRISE
}

export const BillingModel = {
  SUBSCRIPTION: 'subscription',
  CREDIT_PACK: 'credit_pack',
} as const
export type BillingModel = (typeof BillingModel)[keyof typeof BillingModel]

export const BillingModelSchema = z.enum(['subscription', 'credit_pack'])

export const CreditBalanceSchema = z.object({
  total_purchased: z.number().int().min(0),
  total_used: z.number().int().min(0),
  total_remaining: z.number().int().min(0),
})

export type CreditBalance = z.infer<typeof CreditBalanceSchema>

export const CreditPackSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  credits_purchased: z.number().int().min(1),
  credits_used: z.number().int().min(0),
  credits_remaining: z.number().int().min(0),
  unit_price_cents: z.number().int().min(0),
  stripe_payment_intent_id: z.string().nullable(),
  stripe_checkout_session_id: z.string().nullable(),
  purchased_at: z.string().datetime(),
})

export type CreditPack = z.infer<typeof CreditPackSchema>
