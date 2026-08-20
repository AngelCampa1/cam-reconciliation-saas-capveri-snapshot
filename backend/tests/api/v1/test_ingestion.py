"""Tests for ingestion API endpoints."""

from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.services.ingestion.validation import GLValidationError, GLValidationResult
from tests.conftest import (
    ORG_A_ID,
    ORG_A_PROPERTY_ID,
    ORG_A_USER_ID,
    ORG_B_PROPERTY_ID,
    MockQueryBuilder,
)


def seed_org_a_property(client):
    """Seed the mocked property lookup used by the upload ownership guard."""
    client.mock_supabase.table.side_effect = lambda table_name: (
        MockQueryBuilder(
            data=[
                {
                    "id": str(ORG_A_PROPERTY_ID),
                    "organization_id": str(ORG_A_ID),
                }
            ]
        )
        if table_name == "properties"
        else MockQueryBuilder(data=[])
    )


class TestUploadFile:
    """Tests for POST /ingestion/upload endpoint."""

    @patch("app.api.v1.ingestion.persist_gl_entries")
    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.create_batch")
    @patch("app.api.v1.ingestion.check_duplicate")
    @patch("app.api.v1.ingestion.get_dispatcher")
    def test_upload_rejects_property_outside_org_before_persistence(
        self,
        mock_dispatcher,
        mock_check_dup,
        mock_create_batch,
        mock_update_status,
        mock_persist,
        org_a_admin_client,
    ):
        """Foreign properties must be rejected before service-role writes."""
        from io import BytesIO

        org_a_admin_client.mock_supabase.table.return_value = MockQueryBuilder(data=[])
        mock_check_dup.return_value = None

        response = org_a_admin_client.post(
            "/api/v1/ingestion/upload",
            files={
                "file": (
                    "foreign-property.csv",
                    BytesIO(b"Account,Amount,Date\n6000,100,2024-01-15\n"),
                    "text/csv",
                )
            },
            data={"property_id": str(ORG_B_PROPERTY_ID)},
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Property not found"
        mock_check_dup.assert_not_called()
        mock_dispatcher.assert_not_called()
        mock_create_batch.assert_not_called()
        mock_update_status.assert_not_called()
        mock_persist.assert_not_called()

    def test_upload_rejects_empty_file(self, org_a_admin_client):
        """Should return 400 for empty files (0 bytes)."""
        from io import BytesIO

        # Create empty file
        empty_file = ("empty.csv", BytesIO(b""), "text/csv")

        response = org_a_admin_client.post(
            "/api/v1/ingestion/upload",
            files={"file": empty_file},
            data={"property_id": str(ORG_A_PROPERTY_ID)},
        )

        assert response.status_code == 400
        detail = response.json()["detail"]
        # detail could be a dict or string
        if isinstance(detail, dict):
            assert "empty" in detail.get("message", "").lower()
        else:
            assert "empty" in str(detail).lower()

    def test_upload_rejects_oversized_file(self, org_a_admin_client):
        """Should return 413 for files exceeding 50MB limit."""
        from io import BytesIO

        # Create file just over 50MB (50 * 1024 * 1024 + 1 bytes)
        # Use a sparse approach to avoid memory issues
        large_content = b"A" * (50 * 1024 * 1024 + 1)
        large_file = ("large.csv", BytesIO(large_content), "text/csv")

        response = org_a_admin_client.post(
            "/api/v1/ingestion/upload",
            files={"file": large_file},
            data={"property_id": str(ORG_A_PROPERTY_ID)},
        )

        assert response.status_code == 413
        detail = response.json()["detail"]
        # detail could be a dict or string
        if isinstance(detail, dict):
            assert (
                "exceeds" in detail.get("message", "").lower()
                or "maximum" in detail.get("message", "").lower()
            )
            assert detail.get("max_size_mb") == 50
        else:
            assert (
                "exceeds" in str(detail).lower()
                or "maximum" in str(detail).lower()
                or "size" in str(detail).lower()
            )

    @patch("app.api.v1.ingestion.persist_gl_entries")
    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.create_batch")
    @patch("app.api.v1.ingestion.check_duplicate")
    @patch("app.api.v1.ingestion.get_dispatcher")
    def test_upload_raises_500_on_unexpected_exception(
        self,
        mock_dispatcher,
        mock_check_dup,
        mock_create_batch,
        mock_update_status,
        mock_persist,
        org_a_admin_client,
    ):
        """Exception during processing should return 500 (line 168)."""
        seed_org_a_property(org_a_admin_client)

        # Setup mocks
        mock_check_dup.return_value = None  # No duplicate

        # Mock dispatcher to return parser
        mock_parser = MagicMock()
        mock_fingerprint = MagicMock()
        mock_fingerprint.source_system = "yardi"
        mock_fingerprint.confidence = 0.95
        mock_dispatcher.return_value.get_parser.return_value = (
            mock_parser,
            mock_fingerprint,
        )

        # Mock batch creation
        batch_id = uuid4()
        mock_batch = MagicMock()
        mock_batch.id = batch_id
        mock_create_batch.return_value = mock_batch

        # Parser raises unexpected exception
        mock_parser.parse.side_effect = RuntimeError("Database connection lost")

        # Create CSV file
        from io import BytesIO

        csv_content = b"Account,Amount,Date\n6000,100,2024-01-15"
        file = ("test.csv", BytesIO(csv_content), "text/csv")

        # Make request
        response = org_a_admin_client.post(
            "/api/v1/ingestion/upload",
            files={"file": file},
            data={"property_id": str(ORG_A_PROPERTY_ID)},
        )

        # Should return 500
        assert response.status_code == 500
        assert "Database connection lost" in response.json()["detail"]

        # Should update batch status to failed
        mock_update_status.assert_called_with(
            batch_id,
            ORG_A_ID,
            "failed",
            error_log=[{"message": "Database connection lost"}],
        )

    @patch("app.api.v1.ingestion.persist_gl_entries")
    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.create_batch")
    @patch("app.api.v1.ingestion.check_duplicate")
    @patch("app.api.v1.ingestion.get_dispatcher")
    def test_upload_response_includes_detected_columns(
        self,
        mock_dispatcher,
        mock_check_dup,
        mock_create_batch,
        mock_update_status,
        mock_persist,
        org_a_admin_client,
    ):
        """UploadResponse must include detected_columns for the frontend mapping UI."""
        from io import BytesIO

        import pandas as pd

        seed_org_a_property(org_a_admin_client)
        mock_check_dup.return_value = None

        mock_parser = MagicMock()
        mock_fingerprint = MagicMock()
        mock_fingerprint.source_system = "yardi"
        mock_fingerprint.confidence = 0.97
        mock_dispatcher.return_value.get_parser.return_value = (
            mock_parser,
            mock_fingerprint,
        )

        batch_id = uuid4()
        mock_batch = MagicMock()
        mock_batch.id = batch_id
        mock_create_batch.return_value = mock_batch

        # DataFrame with named columns simulating parsed Yardi file
        df = pd.DataFrame(
            columns=[
                "Property",
                "Account Code",
                "Account Description",
                "Date",
                "Debit",
                "Credit",
            ]
        )
        mock_parse_result = MagicMock()
        mock_parse_result.success = True
        mock_parse_result.data = df
        mock_parse_result.row_count = 30
        mock_parse_result.error_count = 0
        mock_parse_result.warnings = []
        mock_parser.parse.return_value = mock_parse_result

        csv_content = b"Property,Account Code,Account Description,Date,Debit,Credit\nHOU-01,5100.10,Janitorial,01/15/2024,18500.00,\n"

        response = org_a_admin_client.post(
            "/api/v1/ingestion/upload",
            files={"file": ("test.csv", BytesIO(csv_content), "text/csv")},
            data={"property_id": str(ORG_A_PROPERTY_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert "detected_columns" in data
        assert isinstance(data["detected_columns"], list)
        expected_columns = [
            "Property",
            "Account Code",
            "Account Description",
            "Date",
            "Debit",
            "Credit",
        ]
        assert data["detected_columns"] == expected_columns

    @patch("app.api.v1.ingestion.persist_gl_entries")
    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.create_batch")
    @patch("app.api.v1.ingestion.check_duplicate")
    @patch("app.api.v1.ingestion.get_dispatcher")
    def test_upload_rejects_file_when_no_valid_gl_rows_persist(
        self,
        mock_dispatcher,
        mock_check_dup,
        mock_create_batch,
        mock_update_status,
        mock_persist,
        org_a_admin_client,
    ):
        """Upload should fail when validation filters out every parsed row."""
        from io import BytesIO

        import pandas as pd

        seed_org_a_property(org_a_admin_client)
        mock_check_dup.return_value = None

        mock_parser = MagicMock()
        mock_fingerprint = MagicMock()
        mock_fingerprint.source_system = "generic"
        mock_fingerprint.confidence = 1.0
        mock_dispatcher.return_value.get_parser.return_value = (
            mock_parser,
            mock_fingerprint,
        )

        batch_id = uuid4()
        mock_batch = MagicMock()
        mock_batch.id = batch_id
        mock_create_batch.return_value = mock_batch

        mock_parse_result = MagicMock()
        mock_parse_result.success = True
        mock_parse_result.data = pd.DataFrame(
            [{"not": "x", "a": "y", "valid": "z", "gl": "q", "file": "r"}]
        )
        mock_parse_result.row_count = 1
        mock_parse_result.error_count = 0
        mock_parse_result.warnings = ["No column mapping provided - raw data returned"]
        mock_parser.parse.return_value = mock_parse_result

        validation = GLValidationResult(
            errors=[
                GLValidationError(
                    field="row",
                    message="account_code is missing or null",
                    row_index=0,
                ),
                GLValidationError(
                    field="row",
                    message="amount is missing or null",
                    row_index=0,
                ),
                GLValidationError(
                    field="row",
                    message="transaction_date is missing or null",
                    row_index=0,
                ),
            ],
            valid_count=0,
            invalid_count=1,
        )
        mock_persist.return_value = (0, validation)

        response = org_a_admin_client.post(
            "/api/v1/ingestion/upload",
            files={
                "file": (
                    "invalid.csv",
                    BytesIO(b"not,a,valid,gl,file\nx,y,z,q,r\n"),
                    "text/csv",
                )
            },
            data={"property_id": str(ORG_A_PROPERTY_ID)},
        )

        assert response.status_code == 422
        error_response = response.json()
        assert error_response["message"] == "Validation failed"
        assert "No valid GL entries found" in error_response["detail"]
        assert "'rows_processed': 1" in error_response["detail"]
        assert "'rows_imported': 0" in error_response["detail"]
        assert "'rows_failed': 1" in error_response["detail"]
        assert "account_code is missing or null" in error_response["detail"]
        mock_update_status.assert_any_call(
            batch_id,
            ORG_A_ID,
            "failed",
            error_count=1,
            error_log=[
                {"message": "account_code is missing or null", "row_index": 0},
                {"message": "amount is missing or null", "row_index": 0},
                {"message": "transaction_date is missing or null", "row_index": 0},
            ],
        )

    @patch("app.api.v1.ingestion.persist_gl_entries")
    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.create_batch")
    @patch("app.api.v1.ingestion.check_duplicate")
    @patch("app.api.v1.ingestion.get_dispatcher")
    def test_upload_completed_batch_row_count_matches_rows_imported(
        self,
        mock_dispatcher,
        mock_check_dup,
        mock_create_batch,
        mock_update_status,
        mock_persist,
        org_a_admin_client,
    ):
        """Completed batches should store inserted rows, not raw parsed rows."""
        from io import BytesIO

        import pandas as pd

        seed_org_a_property(org_a_admin_client)
        mock_check_dup.return_value = None

        mock_parser = MagicMock()
        mock_fingerprint = MagicMock()
        mock_fingerprint.source_system = "yardi"
        mock_fingerprint.confidence = 0.95
        mock_dispatcher.return_value.get_parser.return_value = (
            mock_parser,
            mock_fingerprint,
        )

        batch_id = uuid4()
        mock_batch = MagicMock()
        mock_batch.id = batch_id
        mock_create_batch.return_value = mock_batch

        mock_parse_result = MagicMock()
        mock_parse_result.success = True
        mock_parse_result.data = pd.DataFrame(
            [
                {
                    "account_code": "6000",
                    "account_description": "Utilities",
                    "amount": "100.00",
                    "transaction_date": "2024-01-15",
                },
                {
                    "account_code": "6100",
                    "account_description": "Janitorial",
                    "amount": "200.00",
                    "transaction_date": "2024-01-16",
                },
                {
                    "account_code": None,
                    "account_description": "Invalid",
                    "amount": "300.00",
                    "transaction_date": "2024-01-17",
                },
            ]
        )
        mock_parse_result.row_count = 3
        mock_parse_result.error_count = 0
        mock_parse_result.warnings = []
        mock_parser.parse.return_value = mock_parse_result

        validation = GLValidationResult(
            errors=[
                GLValidationError(
                    field="row",
                    message="account_code is missing or null",
                    row_index=2,
                )
            ],
            valid_count=2,
            invalid_count=1,
        )
        mock_persist.return_value = (2, validation)

        response = org_a_admin_client.post(
            "/api/v1/ingestion/upload",
            files={
                "file": (
                    "partial.csv",
                    BytesIO(
                        b"Account,Description,Amount,Date\n"
                        b"6000,Utilities,100.00,2024-01-15\n"
                        b"6100,Janitorial,200.00,2024-01-16\n"
                        b",Invalid,300.00,2024-01-17\n"
                    ),
                    "text/csv",
                )
            },
            data={"property_id": str(ORG_A_PROPERTY_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["row_count"] == 2
        assert data["error_count"] == 1
        assert "Row 2: account_code is missing or null" in data["warnings"]
        mock_update_status.assert_any_call(
            batch_id,
            ORG_A_ID,
            "completed",
            row_count=2,
            error_count=1,
        )


class TestGenericUploadDefersMapping:
    """FIX F-040: generic uploads stay 'pending' and persist nothing."""

    @patch("app.api.v1.ingestion.persist_gl_entries")
    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.create_batch")
    @patch("app.api.v1.ingestion.check_duplicate")
    @patch("app.api.v1.ingestion.get_dispatcher")
    def test_generic_upload_leaves_batch_pending_and_persists_nothing(
        self,
        mock_dispatcher,
        mock_check_dup,
        mock_create_batch,
        mock_update_status,
        mock_persist,
        org_a_admin_client,
    ):
        """A generic file returns detected_columns, persists nothing, stays pending."""
        from io import BytesIO

        import pandas as pd

        seed_org_a_property(org_a_admin_client)
        mock_check_dup.return_value = None

        mock_parser = MagicMock()
        # Resolved parser is the generic parser → needs_mapping branch
        mock_parser.source_system = "generic"
        mock_fingerprint = MagicMock()
        mock_fingerprint.source_system = "generic"
        mock_fingerprint.confidence = 0.42
        mock_dispatcher.return_value.get_parser.return_value = (
            mock_parser,
            mock_fingerprint,
        )

        batch_id = uuid4()
        mock_batch = MagicMock()
        mock_batch.id = batch_id
        mock_create_batch.return_value = mock_batch

        # Phase-1 parse: raw columns surfaced for the mapping wizard
        df = pd.DataFrame(columns=["GL Acct", "Memo", "Posted", "Debit", "Credit"])
        mock_parse_result = MagicMock()
        mock_parse_result.success = True
        mock_parse_result.data = df
        mock_parse_result.row_count = 12
        mock_parse_result.error_count = 0
        mock_parse_result.warnings = ["No column mapping provided - raw data returned"]
        mock_parser.parse.return_value = mock_parse_result

        response = org_a_admin_client.post(
            "/api/v1/ingestion/upload",
            files={
                "file": (
                    "generic.csv",
                    BytesIO(
                        b"GL Acct,Memo,Posted,Debit,Credit\n6000,x,2024-01-01,10,\n"
                    ),
                    "text/csv",
                )
            },
            data={"property_id": str(ORG_A_PROPERTY_ID)},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["source_system"] == "generic"
        assert data["row_count"] == 12
        assert data["error_count"] == 0
        assert data["detected_columns"] == [
            "GL Acct",
            "Memo",
            "Posted",
            "Debit",
            "Credit",
        ]
        # The Phase-1 parse must NOT persist anything...
        mock_persist.assert_not_called()
        # ...and the batch must be left 'pending' (no processing/completed update)
        mock_update_status.assert_not_called()
        # Batch created with generic source system
        assert mock_create_batch.call_args.kwargs["source_system"] == "generic"


class TestApplyBatchMapping:
    """Tests for POST /ingestion/batches/{batch_id}/apply-mapping endpoint."""

    @staticmethod
    def _mapping(**overrides):
        base = {"account_code": "GL Acct", "amount": "Debit"}
        base.update(overrides)
        return base

    def test_apply_mapping_rejects_invalid_json(self, org_a_admin_client):
        """Malformed mapping_config JSON returns 422."""
        from io import BytesIO

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{uuid4()}/apply-mapping",
            files={"file": ("g.csv", BytesIO(b"a,b\n1,2\n"), "text/csv")},
            data={"mapping_config": "{not valid json"},
        )

        assert response.status_code == 422
        body = response.json()
        assert body["message"] == "Validation failed"
        assert "valid JSON" in body["detail"]

    def test_apply_mapping_requires_account_code_and_amount(self, org_a_admin_client):
        """Mapping missing required targets returns 422 listing the missing keys."""
        import json as _json
        from io import BytesIO

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{uuid4()}/apply-mapping",
            files={"file": ("g.csv", BytesIO(b"a,b\n1,2\n"), "text/csv")},
            data={"mapping_config": _json.dumps({"account_code": "GL Acct"})},
        )

        assert response.status_code == 422
        body = response.json()
        assert body["message"] == "Validation failed"
        assert "account_code" in body["detail"] and "amount" in body["detail"]

    @patch("app.api.v1.ingestion.compute_file_hash")
    def test_apply_mapping_batch_not_found(self, mock_hash, org_a_admin_client):
        """Unknown batch id returns 404."""
        import json as _json
        from io import BytesIO

        mock_hash.return_value = "somehash"
        # Default table side_effect returns empty → maybe_single yields None
        org_a_admin_client.mock_supabase.table.return_value = MockQueryBuilder(data=[])

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{uuid4()}/apply-mapping",
            files={"file": ("g.csv", BytesIO(b"a,b\n1,2\n"), "text/csv")},
            data={"mapping_config": _json.dumps(self._mapping())},
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Batch not found"

    @patch("app.api.v1.ingestion.compute_file_hash")
    def test_apply_mapping_rejects_non_generic_batch(
        self, mock_hash, org_a_admin_client
    ):
        """Mapping can only be applied to generic batches."""
        import json as _json
        from io import BytesIO

        mock_hash.return_value = "h"
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "property_id": str(ORG_A_PROPERTY_ID),
                            "source_system": "yardi",
                            "status": "pending",
                            "file_hash": "h",
                            "file_name": "g.csv",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/apply-mapping",
            files={"file": ("g.csv", BytesIO(b"a,b\n1,2\n"), "text/csv")},
            data={"mapping_config": _json.dumps(self._mapping())},
        )

        assert response.status_code == 400
        assert "generic" in response.json()["detail"]

    @patch("app.api.v1.ingestion.compute_file_hash")
    def test_apply_mapping_rejects_non_pending_batch(
        self, mock_hash, org_a_admin_client
    ):
        """Mapping can only be applied to pending batches."""
        import json as _json
        from io import BytesIO

        mock_hash.return_value = "h"
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "property_id": str(ORG_A_PROPERTY_ID),
                            "source_system": "generic",
                            "status": "completed",
                            "file_hash": "h",
                            "file_name": "g.csv",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/apply-mapping",
            files={"file": ("g.csv", BytesIO(b"a,b\n1,2\n"), "text/csv")},
            data={"mapping_config": _json.dumps(self._mapping())},
        )

        assert response.status_code == 400
        assert "pending" in response.json()["detail"]
        assert "completed" in response.json()["detail"]

    @patch("app.api.v1.ingestion.compute_file_hash")
    def test_apply_mapping_rejects_file_hash_mismatch(
        self, mock_hash, org_a_admin_client
    ):
        """A re-sent file that differs from the original upload is rejected."""
        import json as _json
        from io import BytesIO

        mock_hash.return_value = "uploaded-now"
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "property_id": str(ORG_A_PROPERTY_ID),
                            "source_system": "generic",
                            "status": "pending",
                            "file_hash": "original-hash",
                            "file_name": "g.csv",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/apply-mapping",
            files={"file": ("g.csv", BytesIO(b"a,b\n1,2\n"), "text/csv")},
            data={"mapping_config": _json.dumps(self._mapping())},
        )

        assert response.status_code == 400
        assert "does not match" in response.json()["detail"]

    @patch("app.api.v1.ingestion.auto_setup_pools_from_gl")
    @patch("app.api.v1.ingestion.persist_gl_entries")
    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.get_dispatcher")
    @patch("app.api.v1.ingestion.compute_file_hash")
    def test_apply_mapping_success_persists_and_completes(
        self,
        mock_hash,
        mock_dispatcher,
        mock_update_status,
        mock_persist,
        mock_pools,
        org_a_admin_client,
    ):
        """Happy path: mapping applied, GL entries persisted, batch completed."""
        import json as _json
        from io import BytesIO

        import pandas as pd

        mock_hash.return_value = "matching-hash"
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "property_id": str(ORG_A_PROPERTY_ID),
                            "source_system": "generic",
                            "status": "pending",
                            "file_hash": "matching-hash",
                            "file_name": "g.csv",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        mock_parser = MagicMock()
        mock_parser.source_system = "generic"
        mock_dispatcher.return_value.get_parser.return_value = (
            mock_parser,
            MagicMock(),
        )

        mapped_df = pd.DataFrame(
            [
                {
                    "account_code": "6000",
                    "account_description": "Utilities",
                    "amount": "100.00",
                    "transaction_date": "2024-01-15",
                }
            ]
        )
        mock_parse_result = MagicMock()
        mock_parse_result.success = True
        mock_parse_result.data = mapped_df
        mock_parse_result.row_count = 1
        mock_parse_result.error_count = 0
        mock_parse_result.warnings = []
        mock_parser.parse.return_value = mock_parse_result

        # persist returns plain int (no validation result)
        mock_persist.return_value = 1

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/apply-mapping",
            files={
                "file": ("g.csv", BytesIO(b"GL Acct,Debit\n6000,100.00\n"), "text/csv")
            },
            data={
                "mapping_config": _json.dumps(
                    {"account_code": "GL Acct", "amount": "Debit"}
                )
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["source_system"] == "generic"
        assert data["row_count"] == 1
        # Parser must have been called with the column mapping (Phase 2)
        assert mock_parser.parse.call_args.kwargs["column_mapping"] == {
            "account_code": "GL Acct",
            "amount": "Debit",
        }
        mock_persist.assert_called_once()
        mock_update_status.assert_any_call(batch_id, ORG_A_ID, "processing")
        mock_update_status.assert_any_call(
            batch_id, ORG_A_ID, "completed", row_count=1, error_count=0
        )

    @patch("app.api.v1.ingestion.persist_gl_entries")
    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.get_dispatcher")
    @patch("app.api.v1.ingestion.compute_file_hash")
    def test_apply_mapping_parse_failure_marks_failed_and_returns_422(
        self,
        mock_hash,
        mock_dispatcher,
        mock_update_status,
        mock_persist,
        org_a_admin_client,
    ):
        """A Phase-2 parse error fails the batch, returns 422, persists nothing."""
        import json as _json
        from io import BytesIO

        mock_hash.return_value = "matching-hash"
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "property_id": str(ORG_A_PROPERTY_ID),
                            "source_system": "generic",
                            "status": "pending",
                            "file_hash": "matching-hash",
                            "file_name": "g.csv",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        mock_parser = MagicMock()
        mock_parser.source_system = "generic"
        mock_dispatcher.return_value.get_parser.return_value = (
            mock_parser,
            MagicMock(),
        )
        # Mapping references a column that isn't in the file → parser raises ValueError
        mock_parser.parse.side_effect = ValueError(
            "Mapped column 'GL Acct' not found in file"
        )

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/apply-mapping",
            files={"file": ("g.csv", BytesIO(b"X,Y\n1,2\n"), "text/csv")},
            data={
                "mapping_config": _json.dumps(
                    {"account_code": "GL Acct", "amount": "Debit"}
                )
            },
        )

        assert response.status_code == 422
        body = response.json()
        assert body["message"] == "Validation failed"
        assert "GL Acct" in body["detail"]
        # Nothing persisted; batch marked failed
        mock_persist.assert_not_called()
        mock_update_status.assert_any_call(
            batch_id,
            ORG_A_ID,
            "failed",
            error_count=1,
            error_log=[{"message": "Mapped column 'GL Acct' not found in file"}],
        )

    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.get_dispatcher")
    @patch("app.api.v1.ingestion.compute_file_hash")
    def test_apply_mapping_unsuccessful_result_marks_failed_and_returns_422(
        self,
        mock_hash,
        mock_dispatcher,
        mock_update_status,
        org_a_admin_client,
    ):
        """A ParseResult with success=False fails the batch and returns 422."""
        import json as _json
        from io import BytesIO

        mock_hash.return_value = "matching-hash"
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "property_id": str(ORG_A_PROPERTY_ID),
                            "source_system": "generic",
                            "status": "pending",
                            "file_hash": "matching-hash",
                            "file_name": "g.csv",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        mock_parser = MagicMock()
        mock_parser.source_system = "generic"
        mock_dispatcher.return_value.get_parser.return_value = (
            mock_parser,
            MagicMock(),
        )

        unsuccessful = MagicMock()
        unsuccessful.success = False
        unsuccessful.error_count = 2
        unsuccessful.errors = ["Missing account_code values", "Missing amount values"]
        mock_parser.parse.return_value = unsuccessful

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/apply-mapping",
            files={"file": ("g.csv", BytesIO(b"GL Acct,Debit\n,\n"), "text/csv")},
            data={
                "mapping_config": _json.dumps(
                    {"account_code": "GL Acct", "amount": "Debit"}
                )
            },
        )

        assert response.status_code == 422
        body = response.json()
        assert body["message"] == "Validation failed"
        assert "Missing account_code values" in body["detail"]
        mock_update_status.assert_any_call(
            batch_id,
            ORG_A_ID,
            "failed",
            error_count=2,
            error_log=[
                {"message": "Missing account_code values"},
                {"message": "Missing amount values"},
            ],
        )

    @patch("app.api.v1.ingestion.persist_gl_entries")
    @patch("app.api.v1.ingestion.update_batch_status")
    @patch("app.api.v1.ingestion.get_dispatcher")
    @patch("app.api.v1.ingestion.compute_file_hash")
    def test_apply_mapping_unexpected_error_returns_500(
        self,
        mock_hash,
        mock_dispatcher,
        mock_update_status,
        mock_persist,
        org_a_admin_client,
    ):
        """An unexpected (non-HTTP) error during persist returns 500 and fails the batch."""
        import json as _json
        from io import BytesIO

        import pandas as pd

        mock_hash.return_value = "matching-hash"
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "property_id": str(ORG_A_PROPERTY_ID),
                            "source_system": "generic",
                            "status": "pending",
                            "file_hash": "matching-hash",
                            "file_name": "g.csv",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        mock_parser = MagicMock()
        mock_parser.source_system = "generic"
        mock_dispatcher.return_value.get_parser.return_value = (
            mock_parser,
            MagicMock(),
        )

        mock_parse_result = MagicMock()
        mock_parse_result.success = True
        mock_parse_result.data = pd.DataFrame(
            [{"account_code": "6000", "amount": "100.00"}]
        )
        mock_parse_result.row_count = 1
        mock_parse_result.error_count = 0
        mock_parse_result.warnings = []
        mock_parser.parse.return_value = mock_parse_result

        # Persistence blows up with an unexpected error (not HTTPException)
        mock_persist.side_effect = RuntimeError("database connection lost")

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/apply-mapping",
            files={
                "file": ("g.csv", BytesIO(b"GL Acct,Debit\n6000,100.00\n"), "text/csv")
            },
            data={
                "mapping_config": _json.dumps(
                    {"account_code": "GL Acct", "amount": "Debit"}
                )
            },
        )

        assert response.status_code == 500
        assert "Mapping failed" in response.json()["detail"]
        mock_update_status.assert_any_call(
            batch_id,
            ORG_A_ID,
            "failed",
            error_log=[{"message": "database connection lost"}],
        )


class TestRetryImportBatch:
    """Tests for POST /ingestion/batches/{batch_id}/retry endpoint."""

    def test_retry_requires_admin_privileges(self, org_a_member_client):
        """Non-admin users should get 403 — check uses ctx.user.is_admin, no DB query."""
        batch_id = uuid4()

        response = org_a_member_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/retry"
        )

        assert response.status_code == 403
        assert response.json()["detail"] == "Admin privileges required"

    def test_retry_with_admin_role(self, org_a_admin_client):
        """Admin users can retry failed batches (lines 248-299)."""
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "status": "failed",
                            "file_name": "test.csv",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        with patch("app.api.v1.ingestion.delete_batch_entries") as mock_delete:
            mock_delete.return_value = 150

            response = org_a_admin_client.post(
                f"/api/v1/ingestion/batches/{batch_id}/retry"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "pending"
        assert "150" in data["message"]

    def test_retry_with_owner_role(self, org_a_admin_client):
        """Owner users can retry failed batches (lines 248-299)."""
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "status": "failed",
                            "file_name": "test.csv",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        with patch("app.api.v1.ingestion.delete_batch_entries") as mock_delete:
            mock_delete.return_value = 75

            response = org_a_admin_client.post(
                f"/api/v1/ingestion/batches/{batch_id}/retry"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

    def test_retry_batch_not_found(self, org_a_admin_client):
        """Should return 404 if batch doesn't exist (line 268)."""
        batch_id = uuid4()

        # Default side_effect already returns empty MockQueryBuilder for all tables

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/retry"
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Batch not found"

    def test_retry_non_failed_batch(self, org_a_admin_client):
        """Cannot retry batches that aren't failed (lines 273-280)."""
        batch_id = uuid4()

        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "status": "completed",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.post(
            f"/api/v1/ingestion/batches/{batch_id}/retry"
        )

        assert response.status_code == 400
        assert "Only failed batches can be retried" in response.json()["detail"]
        assert "completed" in response.json()["detail"]


class TestDeleteImportBatch:
    """Tests for DELETE /ingestion/batches/{batch_id} endpoint."""

    def test_delete_requires_admin_privileges(self, org_a_member_client):
        """Non-admin users should get 403 — check uses ctx.user.is_admin, no DB query."""
        batch_id = uuid4()

        response = org_a_member_client.delete(f"/api/v1/ingestion/batches/{batch_id}")

        assert response.status_code == 403
        assert response.json()["detail"] == "Admin privileges required"

    def test_delete_batch_not_found(self, org_a_admin_client):
        """Should return 404 if batch doesn't exist (line 335)."""
        batch_id = uuid4()

        # Default side_effect already returns empty MockQueryBuilder for all tables

        response = org_a_admin_client.delete(f"/api/v1/ingestion/batches/{batch_id}")

        assert response.status_code == 404
        assert response.json()["detail"] == "Batch not found"

    def test_delete_with_finalized_reconciliation(self, org_a_admin_client):
        """Cannot delete if GL entries used in finalized reconciliations (lines 359-367)."""
        batch_id = uuid4()

        # Mock batch exists (with org + property), GL entries exist, finalized snapshot exists
        def mock_table(table_name):
            if table_name == "import_batches":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "property_id": str(ORG_A_PROPERTY_ID),
                        }
                    ]
                )
            elif table_name == "gl_entries":
                return MockQueryBuilder(
                    data=[{"id": str(uuid4()), "import_batch_id": str(batch_id)}]
                )
            elif table_name == "reconciliation_snapshots":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(uuid4()),
                            "organization_id": str(ORG_A_ID),
                            "status": "finalized",
                            "property_id": str(ORG_A_PROPERTY_ID),
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.delete(f"/api/v1/ingestion/batches/{batch_id}")

        assert response.status_code == 409
        assert "Cannot delete" in response.json()["detail"]
        assert "finalized reconciliations" in response.json()["detail"]

    def test_delete_successful(self, org_a_admin_client):
        """Successfully delete batch without finalized reconciliations (lines 316-373)."""
        batch_id = uuid4()

        # Batch exists with no GL entries — deletion proceeds
        def mock_table(table_name):
            if table_name == "import_batches":
                mock = MockQueryBuilder(
                    data=[
                        {
                            "id": str(batch_id),
                            "organization_id": str(ORG_A_ID),
                            "property_id": str(ORG_A_PROPERTY_ID),
                        }
                    ]
                )
                mock.delete = MagicMock(return_value=mock)
                mock.eq = MagicMock(return_value=mock)
                mock.execute = MagicMock(return_value=MagicMock())
                return mock
            elif table_name == "gl_entries":
                return MockQueryBuilder(data=[])  # No GL entries
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        with patch("app.api.v1.ingestion.delete_batch_entries"):
            response = org_a_admin_client.delete(
                f"/api/v1/ingestion/batches/{batch_id}"
            )

        assert response.status_code == 204


class TestListColumnMappings:
    """Tests for GET /ingestion/mappings endpoint."""

    def test_list_with_source_filter(self, org_a_member_client):
        """List mappings filtered by source system (lines 397-415)."""
        # Mock mappings data
        mappings_data = [
            {
                "id": str(uuid4()),
                "organization_id": str(ORG_A_ID),
                "name": "Yardi Standard",
                "source_system": "yardi",
                "mapping_config": {
                    "account_code": "Account",
                    "amount": "Amount",
                    "transaction_date": "Date",
                },
                "created_at": "2024-01-15T10:00:00Z",
                "updated_at": "2024-01-15T10:00:00Z",
                "created_by": str(uuid4()),
            }
        ]

        # Use side_effect to create fresh MockQueryBuilder for each table() call
        org_a_member_client.mock_supabase.table.side_effect = (
            lambda table_name: MockQueryBuilder(data=mappings_data)
        )

        response = org_a_member_client.get(
            "/api/v1/ingestion/mappings?source_system=yardi&skip=0&limit=50"
        )

        assert response.status_code == 200
        data = response.json()
        assert "mappings" in data
        assert "total" in data
        assert data["total"] == 1
        assert data["mappings"][0]["source_system"] == "yardi"

    def test_list_without_filter(self, org_a_member_client):
        """List all mappings without filter (lines 397-415)."""
        # Mock empty result
        org_a_member_client.mock_supabase.table.return_value = MockQueryBuilder(data=[])

        response = org_a_member_client.get("/api/v1/ingestion/mappings")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["mappings"] == []


class TestCreateColumnMapping:
    """Tests for POST /ingestion/mappings endpoint."""

    def test_create_requires_admin_privileges(self, org_a_member_client):
        """Non-admin users should get 403 (line 445)."""
        # Mock user role check
        org_a_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=[{"role": "member"}]
        )

        payload = {
            "name": "Test Mapping",
            "source_system": "generic",
            "mapping_config": {
                "account_code": "GL Account",
                "amount": "Debit",
                "transaction_date": "Date",
            },
        }

        response = org_a_member_client.post("/api/v1/ingestion/mappings", json=payload)

        assert response.status_code == 403
        assert response.json()["detail"] == "Admin privileges required"

    def test_create_missing_required_keys(self, org_a_admin_client):
        """Should return 422 if required mapping keys missing (lines 450-454)."""

        # Mock admin role check
        def mock_table(table_name):
            if table_name == "users":
                return MockQueryBuilder(
                    data=[{"id": str(ORG_A_USER_ID), "role": "admin"}]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        payload = {
            "name": "Incomplete Mapping",
            "source_system": "generic",
            "mapping_config": {
                "account_code": "GL Account",
                # Missing 'amount' and 'transaction_date'
            },
        }

        response = org_a_admin_client.post("/api/v1/ingestion/mappings", json=payload)

        assert response.status_code == 422
        assert "Missing required mapping keys" in response.json()["detail"]

    def test_create_duplicate_mapping(self, org_a_admin_client):
        """Should return 409 if mapping with same name+source exists (lines 465-472)."""

        # Mock admin role check and existing mapping
        def mock_table(table_name):
            if table_name == "users":
                return MockQueryBuilder(
                    data=[{"id": str(ORG_A_USER_ID), "role": "admin"}]
                )
            elif table_name == "column_mappings":
                # Return existing mapping with matching name and source_system
                return MockQueryBuilder(
                    data=[
                        {
                            "id": str(uuid4()),
                            "name": "Yardi Standard",
                            "source_system": "yardi",
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        payload = {
            "name": "Yardi Standard",
            "source_system": "yardi",
            "mapping_config": {
                "account_code": "Account",
                "amount": "Amount",
                "transaction_date": "Date",
            },
        }

        response = org_a_admin_client.post("/api/v1/ingestion/mappings", json=payload)

        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

    def test_create_successful(self, org_a_admin_client):
        """Successfully create new column mapping (lines 437-490)."""
        mapping_id = uuid4()
        created_mapping = {
            "id": str(mapping_id),
            "organization_id": str(ORG_A_ID),
            "name": "Custom Mapping",
            "description": "Test description",
            "source_system": "generic",
            "mapping_config": {
                "account_code": "GL_Account",
                "amount": "Debit_Amount",
                "transaction_date": "Trans_Date",
            },
            "created_by": str(uuid4()),
            "created_at": "2024-01-15T10:00:00Z",
        }

        # Mock admin role check, no existing mapping, successful insert
        call_count = [0]

        def mock_table(table_name):
            if table_name == "users":
                return MockQueryBuilder(
                    data=[{"id": str(ORG_A_USER_ID), "role": "admin"}]
                )
            elif table_name == "column_mappings":
                call_count[0] += 1
                if call_count[0] == 1:
                    # First call: check for existing (return empty)
                    return MockQueryBuilder(data=[])
                else:
                    # Second call: insert (MockQueryBuilder handles this)
                    return MockQueryBuilder(data=[created_mapping])
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        payload = {
            "name": "Custom Mapping",
            "description": "Test description",
            "source_system": "generic",
            "mapping_config": {
                "account_code": "GL_Account",
                "amount": "Debit_Amount",
                "transaction_date": "Trans_Date",
            },
        }

        response = org_a_admin_client.post("/api/v1/ingestion/mappings", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Custom Mapping"
        assert data["source_system"] == "generic"
        assert "GL_Account" in str(data["mapping_config"])


class TestGetGlDateRange:
    """Tests for GET /ingestion/gl-date-range/{property_id}."""

    def test_returns_date_range_from_gl_entries(self, org_a_member_client):
        """Should return min/max dates and year from GL entries."""
        pid = str(ORG_A_PROPERTY_ID)
        call_count = {"n": 0}

        def table_side_effect(table_name):
            if table_name == "gl_entries":
                call_count["n"] += 1
                if call_count["n"] == 1:
                    return MockQueryBuilder(
                        data=[{"transaction_date": "2024-01-15", "property_id": pid}]
                    )
                else:
                    return MockQueryBuilder(
                        data=[{"transaction_date": "2024-12-20", "property_id": pid}]
                    )
            return MockQueryBuilder(data=[])

        org_a_member_client.mock_supabase.table = MagicMock(
            side_effect=table_side_effect
        )

        response = org_a_member_client.get(
            f"/api/v1/ingestion/gl-date-range/{ORG_A_PROPERTY_ID}"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["min_date"] == "2024-01-15"
        assert data["max_date"] == "2024-12-20"
        assert data["year"] == 2024

    def test_returns_404_when_no_gl_entries(self, org_a_member_client):
        """Should return 404 if property has no GL entries."""
        org_a_member_client.mock_supabase.table = MagicMock(
            return_value=MockQueryBuilder(data=[])
        )

        response = org_a_member_client.get(
            f"/api/v1/ingestion/gl-date-range/{ORG_A_PROPERTY_ID}"
        )

        assert response.status_code == 404
        assert "No GL entries" in response.json()["detail"]
