"""Models for GL narrative analysis results.

The GLAnalysisResult stores the AI-generated advisory analysis of GL data
produced by Claude. Analysis is advisory only — it never modifies calculations.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GLAnalysisResult(BaseModel):
    """Full GL analysis result from database.

    Stores Claude's narrative analysis of GL data for a property/year,
    with token usage tracking and dismissal audit trail.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    property_id: UUID
    period_year: int = Field(..., ge=1990, le=2100)
    analysis_markdown: str
    token_input: int = Field(..., ge=0)
    token_output: int = Field(..., ge=0)
    ran_at: datetime
    ran_by_user_id: UUID
    dismissed_at: datetime | None = None
    dismissed_by_user_id: UUID | None = None
    created_at: datetime


class GLAnalysisResultCreate(BaseModel):
    """DTO for persisting a new GL analysis result."""

    organization_id: UUID
    property_id: UUID
    period_year: int = Field(..., ge=1990, le=2100)
    analysis_markdown: str
    token_input: int = Field(default=0, ge=0)
    token_output: int = Field(default=0, ge=0)
    ran_by_user_id: UUID


class GLAnalysisRunResponse(BaseModel):
    """API response returned after running GL analysis."""

    result: GLAnalysisResult
    gl_entry_count: int = Field(..., ge=0, description="Number of GL entries analyzed")
