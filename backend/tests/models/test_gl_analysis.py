"""Tests for GLAnalysisResult models."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.gl_analysis import (
    GLAnalysisResult,
    GLAnalysisResultCreate,
    GLAnalysisRunResponse,
)


class TestGLAnalysisResult:
    """Tests for the full GLAnalysisResult model."""

    def test_valid_model(self) -> None:
        """Should create a valid GLAnalysisResult with all required fields."""
        now = datetime.now(UTC)
        user_id = uuid4()
        result = GLAnalysisResult(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_year=2024,
            analysis_markdown="## CAM GL Analysis\n\n### Summary\nNo issues found.",
            token_input=1200,
            token_output=450,
            ran_at=now,
            ran_by_user_id=user_id,
            dismissed_at=None,
            dismissed_by_user_id=None,
            created_at=now,
        )
        assert result.period_year == 2024
        assert result.token_input == 1200
        assert result.token_output == 450
        assert result.dismissed_at is None

    def test_dismissed_fields(self) -> None:
        """Should accept dismissed_at and dismissed_by_user_id when set."""
        now = datetime.now(UTC)
        user_id = uuid4()
        result = GLAnalysisResult(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_year=2023,
            analysis_markdown="## Analysis",
            token_input=500,
            token_output=200,
            ran_at=now,
            ran_by_user_id=user_id,
            dismissed_at=now,
            dismissed_by_user_id=user_id,
            created_at=now,
        )
        assert result.dismissed_at == now
        assert result.dismissed_by_user_id == user_id

    def test_period_year_lower_bound(self) -> None:
        """Should reject period_year below 1990."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError):
            GLAnalysisResult(
                id=uuid4(),
                organization_id=uuid4(),
                property_id=uuid4(),
                period_year=1989,
                analysis_markdown="## Analysis",
                token_input=0,
                token_output=0,
                ran_at=now,
                ran_by_user_id=uuid4(),
                created_at=now,
            )

    def test_period_year_upper_bound(self) -> None:
        """Should reject period_year above 2100."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError):
            GLAnalysisResult(
                id=uuid4(),
                organization_id=uuid4(),
                property_id=uuid4(),
                period_year=2101,
                analysis_markdown="## Analysis",
                token_input=0,
                token_output=0,
                ran_at=now,
                ran_by_user_id=uuid4(),
                created_at=now,
            )

    def test_from_attributes_config(self) -> None:
        """Should be constructible from ORM-like attributes."""
        assert GLAnalysisResult.model_config.get("from_attributes") is True


class TestGLAnalysisResultCreate:
    """Tests for the GLAnalysisResultCreate DTO."""

    def test_valid_create(self) -> None:
        """Should create a valid DTO for persistence."""
        dto = GLAnalysisResultCreate(
            organization_id=uuid4(),
            property_id=uuid4(),
            period_year=2024,
            analysis_markdown="## Analysis\n\nContent here.",
            token_input=800,
            token_output=300,
            ran_by_user_id=uuid4(),
        )
        assert dto.period_year == 2024
        assert dto.token_input == 800

    def test_token_counts_default_to_zero(self) -> None:
        """Token counts should default to 0 if not provided."""
        dto = GLAnalysisResultCreate(
            organization_id=uuid4(),
            property_id=uuid4(),
            period_year=2024,
            analysis_markdown="## Analysis",
            ran_by_user_id=uuid4(),
        )
        assert dto.token_input == 0
        assert dto.token_output == 0


class TestGLAnalysisRunResponse:
    """Tests for the API response model."""

    def test_includes_result_and_gl_entry_count(self) -> None:
        """Response should wrap the result with metadata."""
        now = datetime.now(UTC)
        result = GLAnalysisResult(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_year=2024,
            analysis_markdown="## Analysis",
            token_input=900,
            token_output=400,
            ran_at=now,
            ran_by_user_id=uuid4(),
            dismissed_at=None,
            dismissed_by_user_id=None,
            created_at=now,
        )
        response = GLAnalysisRunResponse(
            result=result,
            gl_entry_count=847,
        )
        assert response.gl_entry_count == 847
        assert response.result.period_year == 2024
