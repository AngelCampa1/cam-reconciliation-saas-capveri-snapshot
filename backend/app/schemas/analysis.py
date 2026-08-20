"""Pydantic schemas for historical analysis and anomaly detection."""

from decimal import Decimal

from pydantic import BaseModel, Field

from app.services.analysis.anomaly_detection import AnomalySeverity, AnomalyType


class DetectedAnomalySchema(BaseModel):
    """Schema for detected anomaly response."""

    pool_name: str = Field(..., description="Name of the expense pool")
    anomaly_type: AnomalyType = Field(..., description="Type of anomaly detected")
    severity: AnomalySeverity = Field(..., description="Severity level")
    current_value: Decimal = Field(..., description="Current year value")
    expected_value: Decimal = Field(..., description="Expected value based on history")
    variance_percent: Decimal = Field(..., description="Variance percentage")
    explanation: str = Field(..., description="Human-readable explanation")
    years_affected: list[int] = Field(..., description="Years affected by this anomaly")

    class Config:
        """Pydantic config."""

        from_attributes = True


class AnomalyDetectionRequest(BaseModel):
    """Request schema for anomaly detection."""

    property_id: str = Field(..., description="Property ID to analyze")
    target_year: int = Field(..., description="Year to analyze for anomalies")
    comparison_years: list[int] = Field(
        ..., description="Historical years to compare against", min_length=1
    )


class AnomalyDetectionResponse(BaseModel):
    """Response schema for anomaly detection."""

    property_id: str = Field(..., description="Property ID analyzed")
    target_year: int = Field(..., description="Year analyzed")
    anomalies: list[DetectedAnomalySchema] = Field(
        ..., description="List of detected anomalies"
    )
    total_anomalies: int = Field(..., description="Total number of anomalies detected")
    critical_count: int = Field(..., description="Number of critical anomalies")
    warning_count: int = Field(..., description="Number of warning anomalies")
    info_count: int = Field(..., description="Number of info anomalies")


class AnomalyConfigUpdate(BaseModel):
    """Schema for updating anomaly detection configuration."""

    warning_threshold: Decimal | None = Field(
        None, description="Warning threshold (e.g., 0.10 for 10%)", ge=0, le=1
    )
    critical_threshold: Decimal | None = Field(
        None, description="Critical threshold (e.g., 0.20 for 20%)", ge=0, le=1
    )
    enabled_detection_types: list[str] | None = Field(
        None, description="Enabled detection types"
    )
