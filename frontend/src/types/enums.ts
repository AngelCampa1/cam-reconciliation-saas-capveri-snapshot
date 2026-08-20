/**
 * Core enumeration types for CapVeri domain models.
 *
 * These const objects use the "as const" pattern for type-safe enums.
 * Values must match exactly with backend/app/models/enums.py.
 */

/**
 * Type of expense cap applied to tenant recoveries.
 */
export const CapType = {
  NONE: 'none',
  NON_CUMULATIVE: 'non_cumulative',
  CUMULATIVE: 'cumulative',
  CUMULATIVE_COMPOUNDING: 'cumulative_compounding',
} as const
export type CapType = (typeof CapType)[keyof typeof CapType]

/**
 * Category of expense pool for allocation.
 */
export const PoolType = {
  OPERATING: 'operating',
  TAX: 'tax',
  INSURANCE: 'insurance',
  CAPITAL: 'capital',
  OTHER: 'other',
} as const
export type PoolType = (typeof PoolType)[keyof typeof PoolType]

/**
 * Type of allocation for splitting expense pools.
 */
export const AllocationType = {
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
} as const
export type AllocationType =
  (typeof AllocationType)[keyof typeof AllocationType]

/**
 * Accounting basis for GL entry date filtering per lease.
 */
export const AccountingBasis = {
  CASH: 'cash',
  ACCRUAL: 'accrual',
} as const
export type AccountingBasis =
  (typeof AccountingBasis)[keyof typeof AccountingBasis]

/**
 * Current status of a lease.
 */
export const LeaseStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  TERMINATED: 'terminated',
} as const
export type LeaseStatus = (typeof LeaseStatus)[keyof typeof LeaseStatus]

/**
 * Status of a data import batch.
 */
export const ImportStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus]

/**
 * Role of a user within an organization.
 */
export const UserRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
  TENANT: 'tenant',
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

/**
 * Status of a reconciliation snapshot.
 */
export const ReconciliationStatus = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
} as const
export type ReconciliationStatus =
  (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus]

/**
 * Workflow status of a reconciliation campaign (property-year lifecycle).
 */
export const CampaignStatus = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  SENT: 'sent',
} as const
export type CampaignStatus =
  (typeof CampaignStatus)[keyof typeof CampaignStatus]

/**
 * Status of a unit within a property.
 */
export const UnitStatus = {
  VACANT: 'vacant',
  OCCUPIED: 'occupied',
  UNDER_RENOVATION: 'under_renovation',
} as const
export type UnitStatus = (typeof UnitStatus)[keyof typeof UnitStatus]

/**
 * Status of a document in the OCR pipeline.
 */
export const DocumentStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  READY_FOR_REVIEW: 'ready_for_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const
export type DocumentStatus =
  (typeof DocumentStatus)[keyof typeof DocumentStatus]

/**
 * Status of a tenant reconciliation statement.
 */
export const StatementStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  DISPUTED: 'disputed',
  OVERDUE: 'overdue',
} as const
export type StatementStatus =
  (typeof StatementStatus)[keyof typeof StatementStatus]

/**
 * Type of document for OCR processing.
 */
export const DocumentType = {
  LEASE: 'lease',
  AMENDMENT: 'amendment',
  RENT_ROLL: 'rent_roll',
  GL_EXPORT: 'gl_export',
  OTHER: 'other',
} as const
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType]

/**
 * Status of an extraction job in the async queue.
 */
export const ExtractionJobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying',
} as const
export type ExtractionJobStatus =
  (typeof ExtractionJobStatus)[keyof typeof ExtractionJobStatus]

/**
 * Priority level for extraction jobs (higher = more urgent).
 */
export const ExtractionJobPriority = {
  LOW: 0,
  NORMAL: 5,
  HIGH: 10,
  URGENT: 15,
} as const
export type ExtractionJobPriority =
  (typeof ExtractionJobPriority)[keyof typeof ExtractionJobPriority]

/**
 * Type of tenant notification.
 */
export const NotificationType = {
  NEW_STATEMENT: 'new_statement',
  DISPUTE_UPDATE: 'dispute_update',
  STATEMENT_REMINDER: 'statement_reminder',
  SYSTEM: 'system',
} as const
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType]

/**
 * Status of a dispute in the workflow.
 */
export const DisputeStatus = {
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
  CLOSED: 'closed',
} as const
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus]

/**
 * Category of dispute issue.
 */
export const DisputeCategory = {
  CALCULATION_ERROR: 'calculation_error',
  MISSING_CREDIT: 'missing_credit',
  INCORRECT_AREA: 'incorrect_area',
  BASE_YEAR_ISSUE: 'base_year_issue',
  BILLING_QUESTION: 'billing_question',
  OTHER: 'other',
} as const
export type DisputeCategory =
  (typeof DisputeCategory)[keyof typeof DisputeCategory]

/**
 * Status of a calculation job.
 */
export const CalculationJobStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const
export type CalculationJobStatus =
  (typeof CalculationJobStatus)[keyof typeof CalculationJobStatus]

/**
 * Status of an invoice in the billing system.
 */
export const InvoiceStatus = {
  DRAFT: 'draft',
  OPEN: 'open',
  PAID: 'paid',
  VOID: 'void',
  UNCOLLECTIBLE: 'uncollectible',
} as const
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus]

/**
 * Type of user feedback.
 */
export const FeedbackType = {
  BUG: 'bug',
  FEATURE_REQUEST: 'feature_request',
  GENERAL: 'general',
} as const
export type FeedbackType = (typeof FeedbackType)[keyof typeof FeedbackType]

/**
 * Status of user feedback.
 */
export const FeedbackStatus = {
  NEW: 'new',
  REVIEWED: 'reviewed',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const
export type FeedbackStatus =
  (typeof FeedbackStatus)[keyof typeof FeedbackStatus]

/**
 * Organization subscription status.
 */
export const SubscriptionStatus = {
  ACTIVE: 'active',
  TRIAL: 'trial',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
} as const
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus]

/**
 * Stripe billing subscription status.
 */
export const BillingSubscriptionStatus = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  PAUSED: 'paused',
} as const
export type BillingSubscriptionStatus =
  (typeof BillingSubscriptionStatus)[keyof typeof BillingSubscriptionStatus]

/**
 * Type of promotional discount.
 */
export const DiscountType = {
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
  FREE_TRIAL_EXTENSION: 'free_trial_extension',
} as const
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType]

/**
 * Status of a promotional offer.
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
 * Format for ERP export files.
 */
export const ERPFormat = {
  YARDI: 'yardi',
  MRI: 'mri',
  CSV: 'csv',
} as const
export type ERPFormat = (typeof ERPFormat)[keyof typeof ERPFormat]
