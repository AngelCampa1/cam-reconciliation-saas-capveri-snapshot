import { describe, it, expect } from 'vitest'
import {
  BillingSubscriptionStatus,
  BillingSubscriptionStatusSchema,
  SubscriptionPlan,
  SubscriptionPlanSchema,
  SubscriptionPricingModel,
  SubscriptionPricingModelSchema,
  SubscriptionSchema,
  SubscriptionCreateSchema,
  SubscriptionUpdateSchema,
  SubscriptionSummarySchema,
  isValidBillingSubscriptionStatus,
  isValidSubscriptionPlan,
  getPlanDisplayName,
  getBillingStatusDisplayName,
  isSubscriptionActive,
  requiresPaymentAction,
  getPlanForUnitCount,
  BillingModel,
  BillingModelSchema,
  CreditBalanceSchema,
  CreditPackSchema,
} from '../subscription'

describe('subscription enums and schemas', () => {
  it('defines the supported subscription plans and pricing models', () => {
    expect(SubscriptionPlan).toMatchObject({
      ESSENTIALS: 'essentials',
      GROWTH: 'growth',
      GROWTH_V2: 'growth_v2',
      PORTFOLIO: 'portfolio',
      ENTERPRISE: 'enterprise',
    })
    expect(SubscriptionPricingModel).toMatchObject({
      PER_BUILDING: 'per_building',
      PER_UNIT: 'per_unit',
      CREDIT_PACK: 'credit_pack',
    })
    expect(SubscriptionPlanSchema.parse('growth_v2')).toBe('growth_v2')
    expect(SubscriptionPricingModelSchema.parse('per_unit')).toBe('per_unit')
  })

  it('validates a full per-unit subscription payload', () => {
    const subscription = SubscriptionSchema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      organization_id: '223e4567-e89b-12d3-a456-426614174001',
      stripe_subscription_id: 'sub_abc123',
      stripe_customer_id: 'cus_xyz789',
      plan: 'growth_v2',
      status: 'active',
      pricing_model: 'per_unit',
      building_count: 12,
      unit_count: 120,
      included_units: 50,
      unit_overage_count: 70,
      current_period_start: '2024-01-15T10:30:00.000Z',
      current_period_end: '2024-02-15T10:30:00.000Z',
      cancel_at_period_end: false,
      created_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-01-15T10:30:00.000Z',
    })

    expect(subscription.plan).toBe('growth_v2')
    expect(subscription.pricing_model).toBe('per_unit')
    expect(subscription.unit_count).toBe(120)
    expect(subscription.included_units).toBe(50)
    expect(subscription.unit_overage_count).toBe(70)
  })

  it('applies defaults for create and summary schemas', () => {
    const created = SubscriptionCreateSchema.parse({
      organization_id: '123e4567-e89b-12d3-a456-426614174000',
      plan: 'growth_v2',
    })
    const summary = SubscriptionSummarySchema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      organization_id: '223e4567-e89b-12d3-a456-426614174001',
      plan: 'portfolio',
      status: 'trialing',
      building_count: 5,
      unit_count: 75,
      current_period_end: '2024-02-15T10:30:00.000Z',
      cancel_at_period_end: false,
    })

    expect(created.status).toBe('trialing')
    expect(created.pricing_model).toBe('per_building')
    expect(created.building_count).toBe(1)
    expect(summary.pricing_model).toBe('per_building')
    expect(summary.unit_count).toBe(75)
  })

  it('accepts unit-related update fields', () => {
    const updated = SubscriptionUpdateSchema.parse({
      pricing_model: 'per_unit',
      unit_count: 90,
      included_units: 50,
      unit_overage_count: 40,
      cancel_at_period_end: true,
    })

    expect(updated.pricing_model).toBe('per_unit')
    expect(updated.unit_count).toBe(90)
    expect(updated.included_units).toBe(50)
    expect(updated.unit_overage_count).toBe(40)
    expect(updated.cancel_at_period_end).toBe(true)
  })
})

describe('subscription helpers', () => {
  it('validates statuses and plans', () => {
    expect(BillingSubscriptionStatus.TRIALING).toBe('trialing')
    expect(BillingSubscriptionStatusSchema.parse('active')).toBe('active')
    expect(isValidBillingSubscriptionStatus('paused')).toBe(true)
    expect(isValidBillingSubscriptionStatus('bad')).toBe(false)
    expect(isValidSubscriptionPlan('portfolio')).toBe(true)
    expect(isValidSubscriptionPlan('premium')).toBe(false)
  })

  it('returns display names and state helpers', () => {
    expect(getPlanDisplayName('growth_v2')).toBe('Growth')
    expect(getPlanDisplayName('portfolio')).toBe('Portfolio')
    expect(getBillingStatusDisplayName('past_due')).toBe('Past Due')
    expect(isSubscriptionActive('trialing')).toBe(true)
    expect(isSubscriptionActive('canceled')).toBe(false)
    expect(requiresPaymentAction('past_due')).toBe(true)
    expect(requiresPaymentAction('active')).toBe(false)
  })

  it('maps plan bands from unit counts', () => {
    expect(getPlanForUnitCount(1)).toBe(SubscriptionPlan.GROWTH_V2)
    expect(getPlanForUnitCount(50)).toBe(SubscriptionPlan.GROWTH_V2)
    expect(getPlanForUnitCount(51)).toBe(SubscriptionPlan.PORTFOLIO)
    expect(getPlanForUnitCount(500)).toBe(SubscriptionPlan.PORTFOLIO)
    expect(getPlanForUnitCount(501)).toBe(SubscriptionPlan.ENTERPRISE)
  })
})

describe('billing model and credit-pack schemas', () => {
  it('validates billing model values', () => {
    expect(BillingModel).toMatchObject({
      SUBSCRIPTION: 'subscription',
      CREDIT_PACK: 'credit_pack',
    })
    expect(BillingModelSchema.parse('subscription')).toBe('subscription')
    expect(BillingModelSchema.parse('credit_pack')).toBe('credit_pack')
  })

  it('validates credit balance and credit pack payloads', () => {
    expect(
      CreditBalanceSchema.parse({
        total_purchased: 10,
        total_used: 3,
        total_remaining: 7,
      })
    ).toEqual({
      total_purchased: 10,
      total_used: 3,
      total_remaining: 7,
    })

    expect(
      CreditPackSchema.parse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        credits_purchased: 5,
        credits_used: 2,
        credits_remaining: 3,
        unit_price_cents: 14900,
        stripe_payment_intent_id: 'pi_test',
        stripe_checkout_session_id: 'cs_test',
        purchased_at: '2024-01-15T10:30:00.000Z',
      }).credits_remaining
    ).toBe(3)
  })
})
