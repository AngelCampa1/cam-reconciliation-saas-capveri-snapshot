"""Tests for forensic store module."""

import json
from unittest.mock import MagicMock
from uuid import uuid4

from app.services.extraction.forensic_store import write_forensic_json


class TestWriteForensicJson:
    def test_writes_correct_key_pattern_to_r2(self) -> None:
        storage = MagicMock()
        doc_id = uuid4()

        write_forensic_json(storage, doc_id, "extract_primary", {"cap_rate": "0.05"})

        expected_key = f"extractions/raw/{doc_id}/extract_primary.json"
        storage.upload_document.assert_called_once_with(
            key=expected_key,
            content=json.dumps({"cap_rate": "0.05"}, default=str).encode("utf-8"),
            content_type="application/json",
        )

    def test_serializes_data_as_json_bytes(self) -> None:
        storage = MagicMock()
        doc_id = uuid4()
        data = {"stage": "merged", "fields": 12}

        write_forensic_json(storage, doc_id, "merged", data)

        call_args = storage.upload_document.call_args
        content = call_args.kwargs["content"]
        assert isinstance(content, bytes)
        assert json.loads(content) == data

    def test_uses_application_json_content_type(self) -> None:
        storage = MagicMock()
        write_forensic_json(storage, uuid4(), "judge_output", {})
        call_args = storage.upload_document.call_args
        assert call_args.kwargs["content_type"] == "application/json"

    def test_fails_silently_on_storage_error(self) -> None:
        storage = MagicMock()
        storage.upload_document.side_effect = RuntimeError("R2 down")
        # Must not raise
        write_forensic_json(storage, uuid4(), "extract_primary", {"key": "val"})

    def test_each_stage_writes_separate_key(self) -> None:
        storage = MagicMock()
        doc_id = uuid4()

        write_forensic_json(storage, doc_id, "extract_primary", {})
        write_forensic_json(storage, doc_id, "extract_sibling", {})
        write_forensic_json(storage, doc_id, "merged", {})

        calls = storage.upload_document.call_args_list
        keys = [c.kwargs["key"] for c in calls]
        assert len(set(keys)) == 3
        assert all(str(doc_id) in k for k in keys)
