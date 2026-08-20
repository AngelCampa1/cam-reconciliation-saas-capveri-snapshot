/**
 * CapVeri Domain Types
 *
 * Central export point for all TypeScript/Zod schemas.
 */

// Enums
export * from './enums'

// Organization
export {
  OrganizationSchema,
  OrganizationCreateSchema,
  OrganizationUpdateSchema,
  OrganizationSettingsSchema,
  SubscriptionStatus,
  SubscriptionStatusSchema,
  type Organization,
  type OrganizationCreate,
  type OrganizationUpdate,
  type OrganizationSettings,
} from './organization'

// User
export {
  UserSchema,
  UserCreateSchema,
  UserUpdateSchema,
  UserWithOrgSchema,
  UserRoleSchema,
  isValidUserRole,
  type User,
  type UserCreate,
  type UserUpdate,
  type UserWithOrg,
} from './user'

// Property
export {
  PropertySchema,
  PropertyCreateSchema,
  PropertyUpdateSchema,
  PropertySummarySchema,
  decimalString,
  toDecimalString,
  parseDecimal,
  calculateLoadFactor,
  type Property,
  type PropertyCreate,
  type PropertyUpdate,
  type PropertySummary,
} from './property'

// Unit
export {
  UnitSchema,
  UnitCreateSchema,
  UnitUpdateSchema,
  UnitSummarySchema,
  UnitStatusSchema,
  isValidUnitStatus,
  type Unit,
  type UnitCreate,
  type UnitUpdate,
  type UnitSummary,
} from './unit'

// LeaseRecoveryProfile
export {
  LeaseRecoveryProfileSchema,
  LeaseRecoveryProfileCreateSchema,
  LeaseRecoveryProfileUpdateSchema,
  CapTypeSchema,
  PoolTypeSchema,
  isValidCapType,
  isValidPoolType,
  type LeaseRecoveryProfile,
  type LeaseRecoveryProfileCreate,
  type LeaseRecoveryProfileUpdate,
} from './lease-recovery-profile'

// Lease
export {
  LeaseSchema,
  LeaseCreateSchema,
  LeaseUpdateSchema,
  LeaseSummarySchema,
  LeaseStatusSchema,
  isValidLeaseStatus,
  type Lease,
  type LeaseCreate,
  type LeaseUpdate,
  type LeaseSummary,
} from './lease'

// GLEntry
export {
  GLEntrySchema,
  GLEntryCreateSchema,
  GLEntryUpdateSchema,
  GLEntrySummarySchema,
  isDebit,
  isCredit,
  formatGLAmount,
  type GLEntry,
  type GLEntryCreate,
  type GLEntryUpdate,
  type GLEntrySummary,
} from './gl-entry'

// ExpensePool
export {
  ExpensePoolSchema,
  ExpensePoolCreateSchema,
  ExpensePoolUpdateSchema,
  ExpensePoolSummarySchema,
  getPoolTypeDisplayName,
  type ExpensePool,
  type ExpensePoolCreate,
  type ExpensePoolUpdate,
  type ExpensePoolSummary,
} from './expense-pool'

// PoolMapping
export {
  PoolMappingSchema,
  PoolMappingCreateSchema,
  PoolMappingUpdateSchema,
  PoolMappingSummarySchema,
  isValidGLPattern,
  patternToRegex,
  matchesGLPattern,
  formatAllocationPercentage,
  describeGLPattern,
  type PoolMapping,
  type PoolMappingCreate,
  type PoolMappingUpdate,
  type PoolMappingSummary,
} from './pool-mapping'

// PoolTemplate
export {
  PoolStructureNodeSchema,
  PoolTemplateStructureSchema,
  PoolTemplateSchema,
  PoolTemplateListSchema,
  PoolTemplateCreateSchema,
  PoolTemplateUpdateSchema,
  ApplyTemplateRequestSchema,
  ApplyTemplateResponseSchema,
  type PoolStructureNode,
  type PoolTemplateStructure,
  type PoolTemplate,
  type PoolTemplateList,
  type PoolTemplateCreate,
  type PoolTemplateUpdate,
  type ApplyTemplateRequest,
  type ApplyTemplateResponse,
} from './pool-template'

// PoolCopy
export {
  CopyModeSchema,
  PoolCopyRequestSchema,
  CopiedPoolInfoSchema,
  PoolCopyResultSchema,
  type CopyMode,
  type PoolCopyRequest,
  type CopiedPoolInfo,
  type PoolCopyResult,
} from './pool-copy'

// ReconciliationSnapshot
export {
  ReconciliationSnapshotSchema,
  ReconciliationSnapshotCreateSchema,
  ReconciliationSnapshotUpdateSchema,
  ReconciliationSnapshotFinalizeSchema,
  ReconciliationSnapshotSummarySchema,
  ReconciliationStatusSchema,
  CalculationTraceEntrySchema,
  isValidReconciliationStatus,
  canModifySnapshot,
  formatRecoveryAmount,
  getReconciliationStatusDisplayName,
  formatPeriodRange,
  type ReconciliationSnapshot,
  type ReconciliationSnapshotCreate,
  type ReconciliationSnapshotUpdate,
  type ReconciliationSnapshotFinalize,
  type ReconciliationSnapshotSummary,
} from './reconciliation-snapshot'

// CalculationStep
export {
  CalculationStepSchema,
  CalculationStepCreateSchema,
  InputValuesSchema,
  OutputValueSchema,
  createCalculationStep,
  formatStepSummary,
  validateStepSequence,
  getStepDescription,
  hasWarning,
  type CalculationStep,
  type CalculationStepCreate,
} from './calculation-step'

// API Response Wrappers
export {
  createPaginatedSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
  createDataResponseSchema,
  ErrorCodes,
  createErrorResponse,
  createSuccessResponse,
  isErrorResponse,
  getFieldErrors,
  formatErrorMessage,
  calculatePaginationInfo,
  createPaginatedResponse,
  type PaginatedResponse,
  type ErrorResponse,
  type SuccessResponse,
  type DataResponse,
  type ErrorCode,
} from './api-responses'

// Subscription
export {
  BillingSubscriptionStatus,
  BillingSubscriptionStatusSchema,
  SubscriptionPlan,
  SubscriptionPlanSchema,
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
  type Subscription,
  type SubscriptionCreate,
  type SubscriptionUpdate,
  type SubscriptionSummary,
} from './subscription'

// Invoice
export {
  InvoiceStatus,
  InvoiceStatusSchema,
  InvoiceSchema,
  InvoiceCreateSchema,
  InvoiceUpdateSchema,
  InvoiceSummarySchema,
  isValidInvoiceStatus,
  getInvoiceStatusDisplayName,
  isInvoiceFinalized,
  requiresPayment,
  calculateBalance,
  formatInvoiceAmount,
  type Invoice,
  type InvoiceCreate,
  type InvoiceUpdate,
  type InvoiceSummary,
} from './invoice'

// Promotion
export {
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
  type EligibilityRules,
  type Promotion,
  type PromotionCreate,
  type PromotionUpdate,
  type PromotionRedemption,
  type PromotionSummary,
} from './promotion'

// Feedback
export {
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
  type FeedbackMetadata,
  type Feedback,
  type FeedbackCreate,
  type FeedbackUpdate,
  type FeedbackSummary,
} from './feedback'
