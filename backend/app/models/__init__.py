"""CapVeri Domain Models"""

from app.models.calculation_job import (
    CalculationJob,
    CalculationJobCreate,
    CalculationJobResponse,
    CalculationJobStatusResponse,
    CalculationJobSummary,
    is_terminal_status,
)
from app.models.calculation_step import (
    CalculationStep,
    CalculationStepCreate,
    create_calculation_step,
    format_step_summary,
    validate_step_sequence,
)
from app.models.denominator_change import (
    DenominatorChange,
    DenominatorChangeReport,
    DenominatorChangeType,
    TenantShareImpact,
)
from app.models.dispute import (
    AddCommentRequest,
    CreateDisputeRequest,
    Dispute,
    DisputeAttachment,
    DisputeAttachmentDTO,
    DisputeComment,
    DisputeCommentDTO,
    DisputeDetailDTO,
    DisputeSummaryDTO,
    RateLimitError,
    UpdateStatusRequest,
)
from app.models.document import (
    Document,
    DocumentCreate,
    DocumentResponse,
    DocumentUpdate,
    DocumentUploadResponse,
)
from app.models.enums import (
    NATA_SPACE_TYPES,
    AllocationType,
    BomaStandardVersion,
    CalculationJobStatus,
    CapType,
    DisputeCategory,
    DisputeStatus,
    DocumentStatus,
    DocumentType,
    ERPFormat,
    ExtractionJobPriority,
    ExtractionJobStatus,
    ImportStatus,
    LeaseStatus,
    NotificationType,
    PoolType,
    ReconciliationStatus,
    SpaceType,
    StatementStatus,
    UnitStatus,
    UserRole,
)
from app.models.expense_pool import (
    ExpensePool,
    ExpensePoolCreate,
    ExpensePoolSummary,
    ExpensePoolUpdate,
    ExpensePoolWithChildren,
)
from app.models.feedback import (
    Feedback,
    FeedbackCreate,
    FeedbackStatus,
    FeedbackSummary,
    FeedbackType,
    FeedbackUpdate,
)
from app.models.gl_entry import (
    GLEntry,
    GLEntryCreate,
    GLEntrySummary,
    GLEntryUpdate,
)
from app.models.invoice import (
    Invoice,
    InvoiceCreate,
    InvoiceStatus,
    InvoiceSummary,
    InvoiceUpdate,
)
from app.models.lease import (
    Lease,
    LeaseCreate,
    LeaseSummary,
    LeaseUpdate,
)
from app.models.lease_recovery_profile import (
    BaseYearAdjustmentItem,
    LeaseRecoveryProfile,
    LeaseRecoveryProfileCreate,
    LeaseRecoveryProfileUpdate,
)
from app.models.lease_term_version import (
    LeaseTermVersion,
    LeaseTermVersionCreate,
    LeaseTermVersionSummary,
)
from app.models.ocr_result import (
    DocumentOCRSummary,
    KeyValueData,
    OCRResult,
    OCRResultCreate,
    OCRResultResponse,
    OCRResultSummary,
    TableData,
    TextBlockData,
)
from app.models.organization import (
    Organization,
    OrganizationCreate,
    OrganizationSettings,
    OrganizationUpdate,
    SubscriptionStatus,
)
from app.models.pool_allocation import (
    PoolAllocation,
    PoolAllocationCreate,
    PoolAllocationUpdate,
    validate_allocations_sum_to_100,
)
from app.models.pool_mapping import (
    PoolMapping,
    PoolMappingCreate,
    PoolMappingSummary,
    PoolMappingUpdate,
    is_valid_gl_pattern,
    matches_gl_pattern,
    pattern_to_regex,
)
from app.models.promotion import (
    DiscountType,
    Promotion,
    PromotionCreate,
    PromotionRedemption,
    PromotionStatus,
    PromotionSummary,
    PromotionUpdate,
)
from app.models.property import (
    Property,
    PropertyCreate,
    PropertySummary,
    PropertyUpdate,
)
from app.models.reconciliation_snapshot import (
    BatchFinalizeRequest,
    BatchFinalizeResponse,
    BatchFinalizeResult,
    FinalizeSnapshotResponse,
    ReconciliationSnapshot,
    ReconciliationSnapshotCreate,
    ReconciliationSnapshotFinalize,
    ReconciliationSnapshotSummary,
    ReconciliationSnapshotUpdate,
    VarianceAnalysis,
    VarianceItem,
    can_modify_snapshot,
    format_recovery_amount,
)
from app.models.responses import (
    DataResponse,
    ErrorCodes,
    ErrorResponse,
    PaginatedResponse,
    SuccessResponse,
    create_error_response,
    create_paginated_response,
    create_success_response,
)
from app.models.subscription import (
    BillingSubscriptionStatus,
    Subscription,
    SubscriptionCreate,
    SubscriptionPlan,
    SubscriptionSummary,
    SubscriptionUpdate,
)
from app.models.tenant import (
    TenantInvitation,
    TenantInvitationCreate,
    TenantLeaseLink,
    TenantLeaseLinkCreate,
    TenantUser,
    TenantUserCreate,
)
from app.models.tenant_notification import (
    EmailLog,
    TenantEmailPreferences,
    TenantEmailPreferencesUpdate,
    TenantNotification,
)
from app.models.unit import (
    Unit,
    UnitCreate,
    UnitSummary,
    UnitUpdate,
)
from app.models.user import (
    User,
    UserCreate,
    UserUpdate,
    UserWithOrg,
)

__all__ = [
    # CalculationJob models
    "CalculationJob",
    "CalculationJobCreate",
    "CalculationJobResponse",
    "CalculationJobStatus",
    "CalculationJobStatusResponse",
    "CalculationJobSummary",
    "is_terminal_status",
    # CalculationStep models
    "CalculationStep",
    "CalculationStepCreate",
    "create_calculation_step",
    "format_step_summary",
    "validate_step_sequence",
    # DenominatorChange models
    "DenominatorChange",
    "DenominatorChangeReport",
    "DenominatorChangeType",
    "TenantShareImpact",
    # Dispute models
    "AddCommentRequest",
    "CreateDisputeRequest",
    "Dispute",
    "DisputeAttachment",
    "DisputeAttachmentDTO",
    "DisputeComment",
    "DisputeCommentDTO",
    "DisputeDetailDTO",
    "DisputeSummaryDTO",
    "RateLimitError",
    "UpdateStatusRequest",
    # Document models
    "Document",
    "DocumentCreate",
    "DocumentResponse",
    "DocumentUpdate",
    "DocumentUploadResponse",
    # Enums
    "AllocationType",
    "BomaStandardVersion",
    "CalculationJobStatus",
    "CapType",
    "DisputeCategory",
    "DisputeStatus",
    "DocumentStatus",
    "DocumentType",
    "ERPFormat",
    "ExtractionJobPriority",
    "ExtractionJobStatus",
    "ImportStatus",
    "LeaseStatus",
    "NATA_SPACE_TYPES",
    "NotificationType",
    "PoolType",
    "ReconciliationStatus",
    "SpaceType",
    "StatementStatus",
    "SubscriptionStatus",
    "UnitStatus",
    "UserRole",
    # Organization models
    "Organization",
    "OrganizationCreate",
    "OrganizationSettings",
    "OrganizationUpdate",
    # Property models
    "Property",
    "PropertyCreate",
    "PropertySummary",
    "PropertyUpdate",
    # Unit models
    "Unit",
    "UnitCreate",
    "UnitSummary",
    "UnitUpdate",
    # User models
    "User",
    "UserCreate",
    "UserUpdate",
    "UserWithOrg",
    # LeaseRecoveryProfile models
    "BaseYearAdjustmentItem",
    "LeaseRecoveryProfile",
    "LeaseRecoveryProfileCreate",
    "LeaseRecoveryProfileUpdate",
    # Lease models
    "Lease",
    "LeaseCreate",
    "LeaseSummary",
    "LeaseUpdate",
    # LeaseTermVersion models
    "LeaseTermVersion",
    "LeaseTermVersionCreate",
    "LeaseTermVersionSummary",
    # GLEntry models
    "GLEntry",
    "GLEntryCreate",
    "GLEntrySummary",
    "GLEntryUpdate",
    # ExpensePool models
    "ExpensePool",
    "ExpensePoolCreate",
    "ExpensePoolSummary",
    "ExpensePoolUpdate",
    "ExpensePoolWithChildren",
    # PoolAllocation models
    "PoolAllocation",
    "PoolAllocationCreate",
    "PoolAllocationUpdate",
    "validate_allocations_sum_to_100",
    # PoolMapping models
    "PoolMapping",
    "PoolMappingCreate",
    "PoolMappingSummary",
    "PoolMappingUpdate",
    "is_valid_gl_pattern",
    "matches_gl_pattern",
    "pattern_to_regex",
    # ReconciliationSnapshot models
    "BatchFinalizeRequest",
    "BatchFinalizeResponse",
    "BatchFinalizeResult",
    "FinalizeSnapshotResponse",
    "ReconciliationSnapshot",
    "ReconciliationSnapshotCreate",
    "ReconciliationSnapshotFinalize",
    "ReconciliationSnapshotSummary",
    "ReconciliationSnapshotUpdate",
    "VarianceAnalysis",
    "VarianceItem",
    "can_modify_snapshot",
    "format_recovery_amount",
    # API Response models
    "PaginatedResponse",
    "ErrorResponse",
    "SuccessResponse",
    "DataResponse",
    "ErrorCodes",
    "create_error_response",
    "create_success_response",
    "create_paginated_response",
    # Subscription models
    "BillingSubscriptionStatus",
    "Subscription",
    "SubscriptionCreate",
    "SubscriptionPlan",
    "SubscriptionSummary",
    "SubscriptionUpdate",
    # Tenant models
    "TenantInvitation",
    "TenantInvitationCreate",
    "TenantLeaseLink",
    "TenantLeaseLinkCreate",
    "TenantUser",
    "TenantUserCreate",
    # Tenant notification models
    "EmailLog",
    "TenantEmailPreferences",
    "TenantEmailPreferencesUpdate",
    "TenantNotification",
    # Invoice models
    "Invoice",
    "InvoiceCreate",
    "InvoiceStatus",
    "InvoiceSummary",
    "InvoiceUpdate",
    # Promotion models
    "DiscountType",
    "Promotion",
    "PromotionCreate",
    "PromotionRedemption",
    "PromotionStatus",
    "PromotionSummary",
    "PromotionUpdate",
    # Feedback models
    "Feedback",
    "FeedbackCreate",
    "FeedbackStatus",
    "FeedbackSummary",
    "FeedbackType",
    "FeedbackUpdate",
    # OCRResult models
    "DocumentOCRSummary",
    "KeyValueData",
    "OCRResult",
    "OCRResultCreate",
    "OCRResultResponse",
    "OCRResultSummary",
    "TableData",
    "TextBlockData",
]
