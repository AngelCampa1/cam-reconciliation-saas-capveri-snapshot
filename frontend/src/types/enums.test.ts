/**
 * Tests for core enumeration types.
 * Values must match backend/app/models/enums.py exactly.
 */

import { describe, it, expect } from 'vitest'
import {
  CapType,
  PoolType,
  LeaseStatus,
  ImportStatus,
  UserRole,
  ReconciliationStatus,
  UnitStatus,
  DocumentStatus,
  StatementStatus,
  DocumentType,
  ExtractionJobStatus,
  ExtractionJobPriority,
  NotificationType,
  DisputeStatus,
  DisputeCategory,
  CalculationJobStatus,
  InvoiceStatus,
  FeedbackType,
  FeedbackStatus,
  SubscriptionStatus,
  BillingSubscriptionStatus,
  DiscountType,
  PromotionStatus,
} from './enums'

describe('Enums match backend values', () => {
  it('CapType', () => {
    expect(Object.values(CapType)).toEqual([
      'none',
      'non_cumulative',
      'cumulative',
      'cumulative_compounding',
    ])
  })

  it('PoolType', () => {
    expect(Object.values(PoolType)).toEqual([
      'operating',
      'tax',
      'insurance',
      'capital',
      'other',
    ])
  })

  it('LeaseStatus', () => {
    expect(Object.values(LeaseStatus)).toEqual([
      'draft',
      'active',
      'expired',
      'terminated',
    ])
  })

  it('ImportStatus', () => {
    expect(Object.values(ImportStatus)).toEqual([
      'pending',
      'processing',
      'completed',
      'failed',
    ])
  })

  it('UserRole', () => {
    expect(Object.values(UserRole)).toEqual([
      'owner',
      'admin',
      'member',
      'viewer',
      'tenant',
    ])
  })

  it('ReconciliationStatus', () => {
    expect(Object.values(ReconciliationStatus)).toEqual(['draft', 'finalized'])
  })

  it('UnitStatus', () => {
    expect(Object.values(UnitStatus)).toEqual([
      'vacant',
      'occupied',
      'under_renovation',
    ])
  })

  it('DocumentStatus', () => {
    expect(Object.values(DocumentStatus)).toEqual([
      'pending',
      'processing',
      'completed',
      'failed',
      'ready_for_review',
      'verified',
      'rejected',
    ])
  })

  it('StatementStatus', () => {
    expect(Object.values(StatementStatus)).toEqual([
      'pending',
      'paid',
      'disputed',
      'overdue',
    ])
  })

  it('DocumentType', () => {
    expect(Object.values(DocumentType)).toEqual([
      'lease',
      'amendment',
      'rent_roll',
      'gl_export',
      'other',
    ])
  })

  it('ExtractionJobStatus', () => {
    expect(Object.values(ExtractionJobStatus)).toEqual([
      'pending',
      'processing',
      'completed',
      'failed',
      'retrying',
    ])
  })

  it('ExtractionJobPriority', () => {
    expect(Object.values(ExtractionJobPriority)).toEqual([0, 5, 10, 15])
  })

  it('NotificationType', () => {
    expect(Object.values(NotificationType)).toEqual([
      'new_statement',
      'dispute_update',
      'statement_reminder',
      'system',
    ])
  })

  it('DisputeStatus', () => {
    expect(Object.values(DisputeStatus)).toEqual([
      'open',
      'under_review',
      'resolved',
      'rejected',
      'closed',
    ])
  })

  it('DisputeCategory', () => {
    expect(Object.values(DisputeCategory)).toEqual([
      'calculation_error',
      'missing_credit',
      'incorrect_area',
      'base_year_issue',
      'billing_question',
      'other',
    ])
  })

  it('CalculationJobStatus', () => {
    expect(Object.values(CalculationJobStatus)).toEqual([
      'pending',
      'running',
      'completed',
      'failed',
    ])
  })

  it('InvoiceStatus', () => {
    expect(Object.values(InvoiceStatus)).toEqual([
      'draft',
      'open',
      'paid',
      'void',
      'uncollectible',
    ])
  })

  it('FeedbackType', () => {
    expect(Object.values(FeedbackType)).toEqual([
      'bug',
      'feature_request',
      'general',
    ])
  })

  it('FeedbackStatus', () => {
    expect(Object.values(FeedbackStatus)).toEqual([
      'new',
      'reviewed',
      'resolved',
      'dismissed',
    ])
  })

  it('SubscriptionStatus', () => {
    expect(Object.values(SubscriptionStatus)).toEqual([
      'active',
      'trial',
      'suspended',
      'cancelled',
    ])
  })

  it('BillingSubscriptionStatus', () => {
    expect(Object.values(BillingSubscriptionStatus)).toEqual([
      'trialing',
      'active',
      'past_due',
      'canceled',
      'paused',
    ])
  })

  it('DiscountType', () => {
    expect(Object.values(DiscountType)).toEqual([
      'percentage',
      'fixed_amount',
      'free_trial_extension',
    ])
  })

  it('PromotionStatus', () => {
    expect(Object.values(PromotionStatus)).toEqual([
      'active',
      'expired',
      'exhausted',
      'disabled',
    ])
  })
})
