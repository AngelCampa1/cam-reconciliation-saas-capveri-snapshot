"""
API Schema definitions.

This module contains Pydantic schemas for API request/response validation.
These schemas are separate from domain models in app/models/ and are
specifically designed for API contract definitions.
"""

from app.schemas.analysis import (
    AnomalyConfigUpdate,
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
    DetectedAnomalySchema,
)
from app.schemas.errors import (  # HTTP response definitions for OpenAPI docs
    HTTP_400_RESPONSE,
    HTTP_401_RESPONSE,
    HTTP_403_RESPONSE,
    HTTP_404_RESPONSE,
    HTTP_409_RESPONSE,
    HTTP_422_RESPONSE,
    HTTP_500_RESPONSE,
    ErrorDetail,
    ErrorResponse,
    NotFoundErrorResponse,
    ValidationErrorResponse,
)
from app.schemas.lease import (
    LeaseCreate,
    LeaseListResponse,
    LeaseRecoveryProfile,
    LeaseRecoveryProfileUpdate,
    LeaseResponse,
    LeaseUpdate,
)
from app.schemas.property import (
    PropertyCreate,
    PropertyListResponse,
    PropertyResponse,
    PropertyUpdate,
)
from app.schemas.tenant import (
    LeaseDetailDTO,
    PropertySummaryDTO,
    StatementSummaryDTO,
    TenantDashboardResponse,
    UnitSummaryDTO,
)
from app.schemas.unit import (
    UnitCreate,
    UnitListResponse,
    UnitResponse,
    UnitUpdate,
)

__all__ = [
    # Error schemas
    "ErrorDetail",
    "ErrorResponse",
    "NotFoundErrorResponse",
    "ValidationErrorResponse",
    # HTTP response definitions
    "HTTP_400_RESPONSE",
    "HTTP_401_RESPONSE",
    "HTTP_403_RESPONSE",
    "HTTP_404_RESPONSE",
    "HTTP_409_RESPONSE",
    "HTTP_422_RESPONSE",
    "HTTP_500_RESPONSE",
    # Property schemas
    "PropertyCreate",
    "PropertyUpdate",
    "PropertyResponse",
    "PropertyListResponse",
    # Unit schemas
    "UnitCreate",
    "UnitUpdate",
    "UnitResponse",
    "UnitListResponse",
    # Lease schemas
    "LeaseCreate",
    "LeaseUpdate",
    "LeaseResponse",
    "LeaseListResponse",
    "LeaseRecoveryProfile",
    "LeaseRecoveryProfileUpdate",
    # Tenant portal schemas
    "PropertySummaryDTO",
    "UnitSummaryDTO",
    "LeaseDetailDTO",
    "StatementSummaryDTO",
    "TenantDashboardResponse",
    # Analysis schemas
    "DetectedAnomalySchema",
    "AnomalyDetectionRequest",
    "AnomalyDetectionResponse",
    "AnomalyConfigUpdate",
]
