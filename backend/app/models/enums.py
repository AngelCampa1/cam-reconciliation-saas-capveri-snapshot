"""Core enumeration types for CapVeri domain models.

These enums use the str mixin to ensure JSON serialization works correctly.
Values must match exactly with frontend/src/types/enums.ts.
"""

from enum import Enum


class AccountingBasis(str, Enum):
    """Accounting basis for GL entry date filtering.

    Cash: only expenses physically paid during the period are recoverable.
    Accrual: expenses incurred during the period count regardless of payment date.
    """

    CASH = "cash"
    ACCRUAL = "accrual"


class CapType(str, Enum):
    """Type of expense cap applied to tenant recoveries."""

    NONE = "none"
    NON_CUMULATIVE = "non_cumulative"
    CUMULATIVE = "cumulative"
    CUMULATIVE_COMPOUNDING = "cumulative_compounding"


class PoolType(str, Enum):
    """Category of expense pool for allocation."""

    OPERATING = "operating"
    TAX = "tax"
    INSURANCE = "insurance"
    CAPITAL = "capital"
    OTHER = "other"


class AllocationType(str, Enum):
    """Type of allocation for splitting expense pools."""

    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"


class LeaseStatus(str, Enum):
    """Current status of a lease."""

    DRAFT = "draft"
    ACTIVE = "active"
    EXPIRED = "expired"
    TERMINATED = "terminated"


class ImportStatus(str, Enum):
    """Status of a data import batch."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class UserRole(str, Enum):
    """Role of a user within an organization."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"
    TENANT = "tenant"


class ReconciliationStatus(str, Enum):
    """Status of a reconciliation snapshot."""

    DRAFT = "draft"
    FINALIZED = "finalized"


class CampaignStatus(str, Enum):
    """Workflow status of a reconciliation campaign (property-year lifecycle)."""

    DRAFT = "draft"
    FINALIZED = "finalized"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    SENT = "sent"


class UnitStatus(str, Enum):
    """Status of a unit within a property."""

    VACANT = "vacant"
    OCCUPIED = "occupied"
    UNDER_RENOVATION = "under_renovation"


class DocumentStatus(str, Enum):
    """Status of a document in the OCR pipeline."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    READY_FOR_REVIEW = "ready_for_review"
    VERIFIED = "verified"
    REJECTED = "rejected"


class DocumentType(str, Enum):
    """Type of document for OCR processing."""

    LEASE = "lease"
    AMENDMENT = "amendment"
    RENT_ROLL = "rent_roll"
    GL_EXPORT = "gl_export"
    OTHER = "other"


class ExtractionJobStatus(str, Enum):
    """Status of an extraction job in the async queue."""

    PENDING = "pending"  # Job queued, not yet started
    PROCESSING = "processing"  # Job currently being processed
    COMPLETED = "completed"  # Job completed successfully
    FAILED = "failed"  # Job failed after retries
    RETRYING = "retrying"  # Job failed, will retry


class ExtractionJobPriority(int, Enum):
    """Priority level for extraction jobs (higher = more urgent)."""

    LOW = 0
    NORMAL = 5
    HIGH = 10
    URGENT = 15


class StatementStatus(str, Enum):
    """Status of a tenant reconciliation statement."""

    PENDING = "pending"
    PAID = "paid"
    DISPUTED = "disputed"
    OVERDUE = "overdue"


class NotificationType(str, Enum):
    """Type of tenant notification."""

    NEW_STATEMENT = "new_statement"
    DISPUTE_UPDATE = "dispute_update"
    STATEMENT_REMINDER = "statement_reminder"
    SYSTEM = "system"


class DisputeStatus(str, Enum):
    """Status of a dispute in the workflow."""

    OPEN = "open"
    UNDER_REVIEW = "under_review"
    RESOLVED = "resolved"
    REJECTED = "rejected"
    CLOSED = "closed"


class DisputeCategory(str, Enum):
    """Category of dispute issue."""

    CALCULATION_ERROR = "calculation_error"
    MISSING_CREDIT = "missing_credit"
    INCORRECT_AREA = "incorrect_area"
    BASE_YEAR_ISSUE = "base_year_issue"
    BILLING_QUESTION = "billing_question"
    OTHER = "other"


class CalculationJobStatus(str, Enum):
    """Status of a calculation job."""

    PENDING = "pending"  # Job created, waiting to start
    RUNNING = "running"  # Job currently executing
    COMPLETED = "completed"  # Job finished successfully
    FAILED = "failed"  # Job failed with error


class ERPFormat(str, Enum):
    """Format for ERP write-back export."""

    YARDI = "yardi"  # Yardi Voyager format
    MRI = "mri"  # MRI Commercial format
    CSV = "csv"  # Generic CSV format


class BomaStandardVersion(str, Enum):
    """BOMA Office Standard version used for area measurements."""

    V2010 = "2010"
    V2017 = "2017"
    V2024 = "2024"
    CUSTOM = "custom"


class SpaceType(str, Enum):
    """BOMA 2024 space classification for units.

    NATA (Non-Allocated Tenant Areas) types — storage, outdoor_amenity,
    equipment_shaft — must have zero load factor in pro-rata calculations
    per BOMA 2024 Office Standard.
    """

    OFFICE = "office"
    RETAIL = "retail"
    LABORATORY = "laboratory"
    STORAGE = "storage"  # NATA — zero load factor
    OUTDOOR_AMENITY = "outdoor_amenity"  # NATA — zero load factor
    EQUIPMENT_SHAFT = "equipment_shaft"  # NATA — zero load factor
    OTHER = "other"


# NATA space types require zero load factor in pro-rata calculations (BOMA 2024)
NATA_SPACE_TYPES: frozenset[SpaceType] = frozenset(
    {
        SpaceType.STORAGE,
        SpaceType.OUTDOOR_AMENITY,
        SpaceType.EQUIPMENT_SHAFT,
    }
)
