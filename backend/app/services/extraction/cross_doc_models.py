"""
Pydantic models for cross-document analysis stage.

This module defines the structured data types for the cross-document reasoning
engine, which analyses multiple property documents together to catch issues
that per-document extraction misses.
"""

from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class FindingSeverity(str, Enum):
    """Severity level for a cross-document finding."""

    info = "info"
    warning = "warning"
    critical = "critical"


class FindingCategory(str, Enum):
    """Category classifying the nature of a cross-document finding."""

    lease_nuance = "lease_nuance"
    cross_doc_mismatch = "cross_doc_mismatch"
    billing_anomaly = "billing_anomaly"
    term_override = "term_override"


class TermOverrideSuggestion(BaseModel):
    """Suggestion to correct a per-document extraction error via cross-doc reasoning."""

    field_name: str
    lease_id: str  # str for consistency with LeaseContext and direct JSON round-trip
    current_value: str
    suggested_value: str
    reasoning: str
    confidence: int = Field(..., ge=0, le=100)
    # Present on top-level lease_term_overrides; None on inline override_suggestion.
    # Preserved through Pydantic round-trip so persistence can look up decisions.
    finding_id: str | None = None


class CrossDocFinding(BaseModel):
    """A single finding from cross-document analysis."""

    id: UUID = Field(default_factory=uuid4)
    category: FindingCategory
    severity: FindingSeverity
    title: str
    detail: str
    affected_leases: list[str] = Field(default_factory=list)
    affected_pools: list[str] = Field(default_factory=list)
    financial_impact_estimate: Decimal | None = None  # negative = tenant was overbilled
    source_documents: list[str] = Field(default_factory=list)
    override_suggestion: TermOverrideSuggestion | None = None


class CrossDocAnalysisResult(BaseModel):
    """Structured output from a Claude cross-document analysis call."""

    property_id: UUID
    period_year: int = Field(..., ge=1900, le=2100)
    findings: list[CrossDocFinding] = Field(default_factory=list)
    lease_term_overrides: list[TermOverrideSuggestion] = Field(default_factory=list)
    overall_risk_score: int = Field(..., ge=0, le=100)
    analysis_summary: str
    documents_analyzed: dict[str, int] = Field(default_factory=dict)
    token_usage: int = Field(ge=0, default=0)


class DataAvailability(BaseModel):
    """Flags indicating which data types are present for cross-doc analysis."""

    has_verified_leases: bool = False
    has_gl_data: bool = False
    has_cam_statements: bool = False
    has_prior_year_data: bool = False
    lease_count: int = 0
    gl_account_count: int = 0


class AuditorContext(BaseModel):
    """Market and auditor context to guide Claude's analysis."""

    market: str | None = None
    typical_management_fee_pct: Decimal | None = None
    known_vendor_patterns: list[str] = Field(default_factory=list)
    custom_rules: list[str] = Field(default_factory=list)


class PropertyAuditorOverrides(BaseModel):
    """Property-level auditor overrides and suppressions."""

    known_exceptions: list[str] = Field(default_factory=list)
    special_instructions: list[str] = Field(default_factory=list)
    suppressed_finding_categories: list[FindingCategory] = Field(default_factory=list)


class LeaseContext(BaseModel):
    """Summarized lease context for cross-doc input."""

    lease_id: str  # str (not UUID) for direct JSON serialization compatibility
    tenant_name: str
    recovery_profile: dict[str, Any] = Field(default_factory=dict)
    pro_rata_share: Decimal | None = None
    base_year: int | None = None
    term_start: str | None = None
    term_end: str | None = None
    verified_at: str | None = None


class GLPoolContext(BaseModel):
    """Summarized GL pool context for cross-doc input."""

    pool_name: str
    pool_type: str
    total_amount: Decimal
    account_count: int
    top_vendors: list[str] = Field(default_factory=list)
    is_gross_up_applicable: bool = False


class CrossDocAnalysisInput(BaseModel):
    """All assembled data ready to send to Claude for cross-doc analysis."""

    property_id: UUID
    property_name: str
    period_year: int = Field(..., ge=1900, le=2100)
    lease_contexts: list[LeaseContext] = Field(default_factory=list)
    gl_pool_contexts: list[GLPoolContext] = Field(default_factory=list)
    auditor_context: AuditorContext = Field(default_factory=AuditorContext)
    property_overrides: PropertyAuditorOverrides = Field(
        default_factory=PropertyAuditorOverrides
    )
    prior_year_totals: dict[str, Decimal] = Field(default_factory=dict)
    data_availability: DataAvailability = Field(default_factory=DataAvailability)
    estimated_tokens: int = 0
