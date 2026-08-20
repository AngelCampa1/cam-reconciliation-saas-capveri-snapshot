"""
Denominator change audit trail models.

Models for detecting and documenting when the CAM reconciliation denominator
shifts between periods — RSF re-measurement, tenant roster changes,
self-maintenance conversions, BOMA standard changes, etc.
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class DenominatorChangeType(str, Enum):
    """Types of denominator changes that can occur between reconciliation periods."""

    RSF_REMEASUREMENT = "rsf_remeasurement"
    TENANT_ADDED = "tenant_added"
    TENANT_REMOVED = "tenant_removed"
    SELF_MAINTENANCE_START = "self_maintenance_start"
    SELF_MAINTENANCE_STOP = "self_maintenance_stop"
    EXCLUSION_CHANGE = "exclusion_change"
    BOMA_STANDARD_CHANGE = "boma_standard_change"
    SHARE_RECALCULATION = "share_recalculation"


class DenominatorChange(BaseModel):
    """A single detected change in the reconciliation denominator."""

    change_type: DenominatorChangeType = Field(
        description="Category of the denominator change"
    )
    description: str = Field(description="Human-readable description of the change")
    prior_value: str = Field(description="Value in the prior period")
    current_value: str = Field(description="Value in the current period")
    impact_description: str = Field(
        description="How this change affects tenant pro-rata shares"
    )


class TenantShareImpact(BaseModel):
    """Per-tenant impact of denominator changes on pro-rata share and recovery."""

    lease_id: UUID = Field(description="Lease affected by the change")
    tenant_name: str = Field(description="Tenant name for display")
    prior_pro_rata_share: Decimal = Field(
        description="Pro-rata share in prior period (0-1)"
    )
    current_pro_rata_share: Decimal = Field(
        description="Pro-rata share in current period (0-1)"
    )
    share_delta_pct_points: Decimal = Field(
        description="Change in share as percentage points"
    )
    prior_estimated_recovery: Decimal = Field(
        description="Estimated recovery amount in prior period"
    )
    current_estimated_recovery: Decimal = Field(
        description="Estimated recovery amount in current period"
    )
    recovery_delta: Decimal = Field(description="Dollar change in estimated recovery")
    contributing_changes: list[DenominatorChangeType] = Field(
        description="Which denominator changes contributed to this impact"
    )


class DenominatorChangeReport(BaseModel):
    """Complete report of denominator changes between two reconciliation periods."""

    property_id: UUID = Field(description="Property being analyzed")
    property_name: str = Field(description="Property name for display")
    prior_period: str = Field(
        description="Prior period range, e.g. '2023-01-01 to 2023-12-31'"
    )
    current_period: str = Field(description="Current period range")
    prior_total_rsf: Decimal = Field(description="Total rentable SF in prior period")
    current_total_rsf: Decimal = Field(
        description="Total rentable SF in current period"
    )
    rsf_delta: Decimal = Field(description="Change in total RSF")
    rsf_delta_percent: Decimal = Field(description="Percentage change in RSF")
    changes: list[DenominatorChange] = Field(
        description="All detected denominator changes"
    )
    tenant_impacts: list[TenantShareImpact] = Field(
        description="Per-tenant impact of the changes"
    )
    summary: str = Field(description="Executive summary of changes")
    generated_at: datetime = Field(description="When this report was generated")
    comparison_available: bool = Field(
        default=True,
        description=(
            "False when there is no finalized snapshot to compare against "
            "(a normal, expected state). The route returns HTTP 200 with an "
            "otherwise-empty report in that case."
        ),
    )
    missing_period: str | None = Field(
        default=None,
        description=(
            "Which period lacks a finalized snapshot when comparison_available "
            "is false: 'current' or 'prior'. None for a real comparison."
        ),
    )
