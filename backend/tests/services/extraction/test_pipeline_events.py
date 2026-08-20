"""Tests for pipeline events emitter."""

from unittest.mock import MagicMock
from uuid import uuid4

from app.services.extraction.pipeline_events import emit_pipeline_event


class TestEmitPipelineEvent:
    def test_inserts_row_with_correct_shape(self) -> None:
        supabase = MagicMock()
        doc_id = uuid4()
        org_id = uuid4()

        emit_pipeline_event(
            supabase,
            doc_id,
            org_id,
            stage="extract_primary",
            model="google/gemini-3.1-flash-lite",
            tokens_used=500,
            duration_ms=1200,
            outcome="success",
        )

        supabase.table.assert_called_once_with("audit_pipeline_events")
        row = supabase.table.return_value.insert.call_args[0][0]
        assert row["document_id"] == str(doc_id)
        assert row["organization_id"] == str(org_id)
        assert row["stage"] == "extract_primary"
        assert row["model"] == "google/gemini-3.1-flash-lite"
        assert row["tokens_used"] == 500
        assert row["duration_ms"] == 1200
        assert row["outcome"] == "success"
        assert row["attempt_number"] == 1

    def test_omits_error_key_when_error_is_none(self) -> None:
        supabase = MagicMock()

        emit_pipeline_event(
            supabase,
            uuid4(),
            uuid4(),
            stage="judge",
            model="z-ai/glm-5.1",
            tokens_used=0,
            duration_ms=0,
            outcome="success",
            error=None,
        )

        row = supabase.table.return_value.insert.call_args[0][0]
        assert "error" not in row

    def test_includes_truncated_error_string(self) -> None:
        supabase = MagicMock()
        long_error = "x" * 5000

        emit_pipeline_event(
            supabase,
            uuid4(),
            uuid4(),
            stage="judge",
            model="z-ai/glm-5.1",
            tokens_used=0,
            duration_ms=0,
            outcome="failed",
            error=long_error,
        )

        row = supabase.table.return_value.insert.call_args[0][0]
        assert "error" in row
        assert len(row["error"]) == 2000

    def test_short_error_string_not_truncated(self) -> None:
        supabase = MagicMock()

        emit_pipeline_event(
            supabase,
            uuid4(),
            uuid4(),
            stage="judge",
            model="z-ai/glm-5.1",
            tokens_used=0,
            duration_ms=0,
            outcome="failed",
            error="something went wrong",
        )

        row = supabase.table.return_value.insert.call_args[0][0]
        assert row["error"] == "something went wrong"

    def test_fails_silently_on_supabase_error(self) -> None:
        supabase = MagicMock()
        supabase.table.side_effect = RuntimeError("DB down")
        # Must not raise
        emit_pipeline_event(
            supabase,
            uuid4(),
            uuid4(),
            stage="merge",
            model="n/a",
            tokens_used=0,
            duration_ms=0,
            outcome="success",
        )

    def test_attempt_number_passed_through(self) -> None:
        supabase = MagicMock()

        emit_pipeline_event(
            supabase,
            uuid4(),
            uuid4(),
            stage="extract_primary",
            model="model",
            tokens_used=0,
            duration_ms=0,
            outcome="fallback",
            attempt_number=2,
        )

        row = supabase.table.return_value.insert.call_args[0][0]
        assert row["attempt_number"] == 2
