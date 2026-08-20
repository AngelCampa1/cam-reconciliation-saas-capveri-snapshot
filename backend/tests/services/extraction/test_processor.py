"""Tests for the document-reader extraction processor."""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.services.extraction.dual.dual_models import DualExtractionResult
from app.services.extraction.processor import (
    ExtractionProcessorError,
    _persist_reader_artifacts,
    run_document_extraction,
)


def _document_row(document_id: str, org_id: str, *, with_storage: bool = True) -> dict:
    return {
        "id": document_id,
        "organization_id": org_id,
        "property_id": str(uuid4()),
        "filename": "lease.pdf",
        "storage_key": "docs/lease.pdf" if with_storage else "",
        "storage_bucket": "tenant-docs" if with_storage else "",
        "content_type": "application/pdf",
        "file_size_bytes": 1024,
        "document_type": "lease",
        "status": "pending",
        "reader_job_id": None,
        "extraction_result": None,
        "error_message": None,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
        "processed_at": None,
        "verified_by": None,
        "verified_at": None,
        "edit_history": [],
        "lease_id": str(uuid4()),
    }


def _mock_supabase(document_row: dict) -> MagicMock:
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
        document_row
    )
    client.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"id": document_row["id"]}
    ]
    client.table.return_value.insert.return_value.execute.return_value.data = [
        {"id": str(uuid4())}
    ]
    return client


def test_run_document_extraction_success() -> None:
    """Processor persists OCR artifacts and a review payload via dual-extract pipeline."""
    document_id = uuid4()
    org_id = uuid4()
    db = _mock_supabase(_document_row(str(document_id), str(org_id)))

    storage_client = MagicMock()
    storage_client.get_document_bytes.return_value = b"%PDF-1.4 test"

    dual_result = DualExtractionResult(
        primary_model="google/gemini-3.1-flash-lite",
        sibling_model="google/gemini-3.1-flash-lite",
        primary_tokens=100,
        sibling_tokens=80,
    )
    merged_json = {
        "base_year": 2023,
        "pro_rata_share": "0.1",
        "cap_type": "none",
        "cap_rate": "0.05",
        "base_year_amount": "12.50",
        "admin_fee_percentage": "0",
        "extractions": [
            {
                "field": "pro_rata_share",
                "value": "10%",
                "confidence": 90,
                "source_text": "Tenant pays 10% of operating expenses.",
                "page": 1,
                "bounding_box": None,
            }
        ],
    }

    with patch("app.services.extraction.processor.DualExtractOrchestrator") as MockOrch:

        async def _fake_extract(pdf_bytes: bytes, filename: str) -> tuple:
            return dual_result, merged_json

        MockOrch.return_value.extract_lease.side_effect = _fake_extract
        data, tokens = run_document_extraction(
            document_id,
            db,
            storage_client=storage_client,
            document_reader_client=MagicMock(),
        )

    assert tokens == 180  # primary_tokens + sibling_tokens
    assert data["profile"]["pro_rata_share"] == "0.1"
    assert data["confidence_scores"]["pro_rata_share"] == pytest.approx(0.9)
    assert data["source_references"][0]["page"] == 1
    assert data["source_references"][0]["boundingBox"] is None
    assert data["_meta"]["provider"] == "openrouter"
    assert data["_meta"]["primary_model"] == "google/gemini-3.1-flash-lite"
    assert db.table.return_value.insert.called
    assert db.table.return_value.update.call_count >= 2


def test_run_document_extraction_missing_document() -> None:
    """Processor raises when document lookup returns nothing."""
    document_id = uuid4()
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
        None
    )

    with pytest.raises(ExtractionProcessorError, match="Document not found"):
        run_document_extraction(
            document_id,
            db,
            storage_client=MagicMock(),
            document_reader_client=MagicMock(),
        )


def test_run_document_extraction_missing_storage_info() -> None:
    """Processor rejects documents without object storage fields."""
    document_id = uuid4()
    org_id = uuid4()
    db = _mock_supabase(
        _document_row(str(document_id), str(org_id), with_storage=False)
    )

    with pytest.raises(
        ExtractionProcessorError,
        match="missing object storage location information",
    ):
        run_document_extraction(
            document_id,
            db,
            storage_client=MagicMock(),
            document_reader_client=MagicMock(),
        )


def test_run_document_extraction_invalid_reader_payload() -> None:
    """Processor raises if dual extraction returns invalid structured output."""
    document_id = uuid4()
    org_id = uuid4()
    db = _mock_supabase(_document_row(str(document_id), str(org_id)))

    storage_client = MagicMock()
    storage_client.get_document_bytes.return_value = b"%PDF-1.4 test"

    dual_result = DualExtractionResult(
        primary_model="google/gemini-3.1-flash-lite",
        sibling_model="google/gemini-3.1-flash-lite",
    )
    # All critical fields non-None (gap filler won't fire) but values invalid for schema
    merged_json = {
        "pro_rata_share": "INVALID",
        "cap_type": "UNKNOWN_TYPE",
        "cap_rate": "0.05",
        "base_year": 2020,
        "base_year_amount": "12.50",
    }

    with (
        patch("app.services.extraction.processor.DualExtractOrchestrator") as MockOrch,
        pytest.raises(
            ExtractionProcessorError,
            match="Dual extraction returned invalid payload",
        ),
    ):

        async def _fake_extract(pdf_bytes: bytes, filename: str) -> tuple:
            return dual_result, merged_json

        MockOrch.return_value.extract_lease.side_effect = _fake_extract
        run_document_extraction(
            document_id,
            db,
            storage_client=storage_client,
            document_reader_client=MagicMock(),
        )


def test_run_document_extraction_gap_filler_invoked_for_missing_critical_fields() -> (
    None
):
    """Gap-filler path is exercised when merged JSON has None critical fields."""
    document_id = uuid4()
    org_id = uuid4()
    db = _mock_supabase(_document_row(str(document_id), str(org_id)))

    storage_client = MagicMock()
    storage_client.get_document_bytes.return_value = b"%PDF-1.4 test"

    dual_result = DualExtractionResult(
        primary_model="google/gemini-3.1-flash-lite",
        sibling_model="google/gemini-3.1-flash-lite",
        primary_tokens=100,
        sibling_tokens=80,
    )
    _extraction_item = {
        "field": "pro_rata_share",
        "value": "10%",
        "confidence": 90,
        "source_text": "Tenant pays 10% of operating expenses.",
        "page": 1,
        "bounding_box": None,
    }
    # cap_rate is None, which triggers gap-filler.
    merged_json = {
        "base_year": 2023,
        "pro_rata_share": "0.1",
        "cap_type": "none",
        "cap_rate": None,  # Missing, so gap-filler should be called.
        "base_year_amount": "12.50",
        "admin_fee_percentage": "0",
        "extractions": [_extraction_item],
    }
    # After gap-filler, cap_rate is filled in
    gap_filled_json = dict(merged_json, cap_rate="0.05")

    with (
        patch("app.services.extraction.processor.DualExtractOrchestrator") as MockOrch,
        patch(
            "app.services.extraction.processor.fill_fields",
        ) as mock_fill,
    ):

        async def _fake_extract(pdf_bytes: bytes, filename: str) -> tuple:
            return dual_result, merged_json

        async def _fake_fill(reader, pdf_bytes, filename, missing, merged):  # type: ignore[no-untyped-def]
            return gap_filled_json, 25

        MockOrch.return_value.extract_lease.side_effect = _fake_extract
        mock_fill.side_effect = _fake_fill

        data, tokens = run_document_extraction(
            document_id,
            db,
            storage_client=storage_client,
            document_reader_client=MagicMock(),
        )

    # gap-fill tokens (25) added to dual tokens (180)
    assert tokens == 205
    mock_fill.assert_called_once()
    assert data["profile"]["cap_rate"] == "0.05"


def test_run_document_extraction_validation_reprompt_invoked() -> None:
    """Reflexion loop reconciles inconsistent fields and its tokens are counted."""
    document_id = uuid4()
    org_id = uuid4()
    db = _mock_supabase(_document_row(str(document_id), str(org_id)))

    storage_client = MagicMock()
    storage_client.get_document_bytes.return_value = b"%PDF-1.4 test"

    dual_result = DualExtractionResult(
        primary_model="google/gemini-3.1-flash-lite",
        sibling_model="google/gemini-3.1-flash-lite",
        primary_tokens=100,
        sibling_tokens=80,
    )
    _extraction_item = {
        "field": "pro_rata_share",
        "value": "10%",
        "confidence": 90,
        "source_text": "Tenant pays 10% of operating expenses.",
        "page": 1,
        "bounding_box": None,
    }
    # All critical fields present (gap-filler skipped) but cap is inconsistent:
    # cap_type "none" with a non-null cap_rate -> the validator flags it.
    merged_json = {
        "base_year": 2023,
        "pro_rata_share": "0.1",
        "cap_type": "none",
        "cap_rate": "0.05",
        "base_year_amount": "12.50",
        "admin_fee_percentage": "0",
        "extractions": [_extraction_item],
    }
    reconciled_json = dict(merged_json, cap_type="non_cumulative")

    with (
        patch("app.services.extraction.processor.DualExtractOrchestrator") as MockOrch,
        patch(
            "app.services.extraction.processor.reprompt_invalid_fields",
        ) as mock_reprompt,
    ):

        async def _fake_extract(pdf_bytes: bytes, filename: str) -> tuple:
            return dual_result, merged_json

        async def _fake_reprompt(reader, pdf_bytes, filename, merged):  # type: ignore[no-untyped-def]
            return reconciled_json, 30

        MockOrch.return_value.extract_lease.side_effect = _fake_extract
        mock_reprompt.side_effect = _fake_reprompt

        data, tokens = run_document_extraction(
            document_id,
            db,
            storage_client=storage_client,
            document_reader_client=MagicMock(),
        )

    # reflexion tokens (30) added to dual tokens (180)
    assert tokens == 210
    mock_reprompt.assert_called_once()
    assert data["profile"]["cap_type"] == "non_cumulative"


def test_run_document_extraction_validation_reprompt_noop_is_silent() -> None:
    """A no-op reflexion loop (0 tokens) emits no validation_reprompt event."""
    document_id = uuid4()
    org_id = uuid4()
    db = _mock_supabase(_document_row(str(document_id), str(org_id)))

    storage_client = MagicMock()
    storage_client.get_document_bytes.return_value = b"%PDF-1.4 test"

    dual_result = DualExtractionResult(
        primary_model="google/gemini-3.1-flash-lite",
        sibling_model="google/gemini-3.1-flash-lite",
        primary_tokens=100,
        sibling_tokens=80,
    )
    merged_json = {
        "base_year": 2023,
        "pro_rata_share": "0.1",
        "cap_type": "none",
        "cap_rate": "0.05",
        "base_year_amount": "12.50",
        "admin_fee_percentage": "0",
        "extractions": [
            {
                "field": "pro_rata_share",
                "value": "10%",
                "confidence": 90,
                "source_text": "Tenant pays 10% of operating expenses.",
                "page": 1,
                "bounding_box": None,
            }
        ],
    }

    with (
        patch("app.services.extraction.processor.DualExtractOrchestrator") as MockOrch,
        patch(
            "app.services.extraction.processor.reprompt_invalid_fields",
        ) as mock_reprompt,
    ):

        async def _fake_extract(pdf_bytes: bytes, filename: str) -> tuple:
            return dual_result, merged_json

        async def _fake_reprompt(reader, pdf_bytes, filename, merged):  # type: ignore[no-untyped-def]  # test stub
            # No reconciliation needed -> unchanged dict, zero tokens.
            return merged, 0

        MockOrch.return_value.extract_lease.side_effect = _fake_extract
        mock_reprompt.side_effect = _fake_reprompt

        _data, tokens = run_document_extraction(
            document_id,
            db,
            storage_client=storage_client,
            document_reader_client=MagicMock(),
        )

    # No reflexion tokens added; loop ran but produced nothing.
    assert tokens == 180
    mock_reprompt.assert_called_once()
    # No pipeline event row was inserted for the validation_reprompt stage.
    inserted_stages = [
        call.args[0].get("stage")
        for call in db.table.return_value.insert.call_args_list
        if call.args and isinstance(call.args[0], dict)
    ]
    assert "validation_reprompt" not in inserted_stages


def test_persist_reader_artifacts_creates_default_page_when_no_extractions() -> None:
    """Processor should still persist a page shell when the reader returns no field hits."""
    document_id = uuid4()
    org_id = uuid4()
    document = MagicMock()
    document.organization_id = org_id
    supabase_admin = MagicMock()

    empty_result = MagicMock()
    empty_result.extractions = []

    _persist_reader_artifacts(
        document_id=document_id,
        document=document,
        result=empty_result,
        reader_job_id="openrouter:test",
        supabase_admin=supabase_admin,
    )

    insert_payload = supabase_admin.table.return_value.insert.call_args.args[0]
    assert insert_payload["page_number"] == 1
    assert insert_payload["full_text"] == ""
