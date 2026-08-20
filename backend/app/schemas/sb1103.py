"""SB 1103 Compliance request/response schemas for API endpoints.

These schemas define the API contract for SB 1103 compliance operations.
They build on the domain models but add API-specific concerns.
"""

# Re-export domain models for API use
from app.models.sb1103 import (
    SB1103DeadlineAlert,
    SB1103ExportData,
    SB1103GLEntry,
    SB1103ListResponse,
    SB1103Request,
    SB1103RequestCreate,
    SB1103RequestUpdate,
)

# Convenience alias
SB1103Response = SB1103Request

__all__ = [
    "SB1103Request",
    "SB1103RequestCreate",
    "SB1103RequestUpdate",
    "SB1103GLEntry",
    "SB1103ExportData",
    "SB1103ListResponse",
    "SB1103DeadlineAlert",
    "SB1103Response",
]
