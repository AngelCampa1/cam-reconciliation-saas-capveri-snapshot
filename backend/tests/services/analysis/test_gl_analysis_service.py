"""Tests for GLAnalysisService.

Tests mock both Anthropic (external LLM) and Supabase (external DB).
Business logic (prompt building, aggregation, persistence mapping) is tested directly.
"""

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.analysis.gl_analysis_service import GLAnalysisService
from app.services.extraction.gl_analysis_prompt import GL_ANALYSIS_SYSTEM_PROMPT


class PagedQuery:
    def __init__(self, rows):
        self.rows = rows
        self._start = None
        self._end = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def range(self, start, end):
        self._start = start
        self._end = end
        return self

    def execute(self):
        response = MagicMock()
        if self._start is None or self._end is None:
            response.data = self.rows
        else:
            response.data = self.rows[self._start : self._end + 1]
        return response


def _gl_entry_rows(property_id: str, period_year: int, count: int = 3) -> list[dict]:
    """Build mock GL entry rows as returned by Supabase."""
    return [
        {
            "account_code": "5415" if i % 2 == 0 else "5300",
            "account_description": (
                "HVAC Replacement" if i % 2 == 0 else "Janitorial Services"
            ),
            "vendor_name": "Carrier HVAC" if i % 2 == 0 else "Clean Co",
            "description": f"Entry {i}",
            "amount": str(50000 * (i + 1)),
            "transaction_date": f"{period_year}-0{(i % 9) + 1}-15",
        }
        for i in range(count)
    ]


def _pool_rows() -> list[dict]:
    """Build mock expense pool rows."""
    return [
        {"id": str(uuid4()), "name": "Operating", "pool_type": "operating"},
        {"id": str(uuid4()), "name": "Admin", "pool_type": "admin"},
    ]


def _mock_supabase_for_run(
    property_id: str, period_year: int, gl_rows: list[dict] | None = None
) -> MagicMock:
    """Create a Supabase mock pre-configured for run_analysis."""
    db = MagicMock()

    # Property fetch
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "id": property_id,
        "name": "123 Main St",
        "organization_id": str(uuid4()),
    }

    gl_mock = MagicMock()
    gl_mock.execute.return_value.data = gl_rows or _gl_entry_rows(
        property_id, period_year
    )

    pool_mock = MagicMock()
    pool_mock.execute.return_value.data = _pool_rows()

    insert_mock = MagicMock()
    insert_result_id = str(uuid4())
    insert_mock.execute.return_value.data = [
        {
            "id": insert_result_id,
            "organization_id": str(uuid4()),
            "property_id": property_id,
            "period_year": period_year,
            "analysis_markdown": "## CAM GL Analysis",
            "token_input": 800,
            "token_output": 300,
            "ran_at": datetime.now(UTC).isoformat(),
            "ran_by_user_id": str(uuid4()),
            "dismissed_at": None,
            "dismissed_by_user_id": None,
            "created_at": datetime.now(UTC).isoformat(),
        }
    ]

    # Wire up chainable mocks
    def table_side_effect(table_name: str) -> MagicMock:
        t = MagicMock()
        if table_name == "properties":
            # Two .eq() calls: .eq("id", ...).eq("organization_id", ...)
            t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                "id": property_id,
                "name": "123 Main St",
                "organization_id": str(uuid4()),
            }
        elif table_name == "gl_entries":
            return PagedQuery(gl_mock.execute.return_value.data)
        elif table_name == "expense_pools":
            return PagedQuery(pool_mock.execute.return_value.data)
        elif table_name == "gl_analysis_results":
            t.insert.return_value.execute = insert_mock.execute
        return t

    db.table.side_effect = table_side_effect
    return db


class TestGLAnalysisServiceRunAnalysis:
    """Tests for the run_analysis method."""

    @pytest.mark.asyncio
    async def test_run_analysis_calls_anthropic_with_gl_data(self) -> None:
        """Should build prompt containing property name and account data."""
        property_id = str(uuid4())
        user_id = uuid4()
        org_id = uuid4()
        period_year = 2024

        db = _mock_supabase_for_run(property_id, period_year)

        with patch(
            "app.services.analysis.gl_analysis_service.OpenRouterClient"
        ) as MockClient:
            mock_client = MagicMock()
            mock_client.extract = AsyncMock(
                return_value=("## CAM GL Analysis\n\n### Summary\nNo issues.", 1100)
            )
            MockClient.return_value = mock_client

            service = GLAnalysisService()
            await service.run_analysis(
                property_id=property_id,
                period_year=period_year,
                user_id=user_id,
                org_id=org_id,
                supabase=db,
            )

        # Verify Anthropic was called with correct arguments
        assert mock_client.extract.called
        call_args = mock_client.extract.call_args
        # The user message (document_text) should contain account data
        user_message = call_args.kwargs.get("document_text") or call_args.args[1]
        assert "5415" in user_message or "HVAC" in user_message
        # The GL analysis system prompt must be passed as system_prompt=,
        # not embedded in user-role content (regression guard for this fix)
        assert call_args.kwargs.get("system_prompt") == GL_ANALYSIS_SYSTEM_PROMPT

    @pytest.mark.asyncio
    async def test_run_analysis_includes_second_page_gl_rows(self) -> None:
        """Prompt and returned count include GL rows beyond the first page."""
        property_id = str(uuid4())
        user_id = uuid4()
        org_id = uuid4()
        period_year = 2024
        gl_rows = _gl_entry_rows(property_id, period_year, count=1000)
        gl_rows.append(
            {
                "account_code": "9999",
                "account_description": "Page Two Account",
                "vendor_name": "Second Page Vendor",
                "description": "HOU-02 wrong property charge",
                "amount": "123.45",
                "transaction_date": "2024-12-31",
            }
        )

        db = _mock_supabase_for_run(property_id, period_year, gl_rows=gl_rows)

        with patch(
            "app.services.analysis.gl_analysis_service.OpenRouterClient"
        ) as MockClient:
            mock_client = MagicMock()
            mock_client.extract = AsyncMock(return_value=("## Analysis", 100))
            MockClient.return_value = mock_client

            service = GLAnalysisService()
            _, entry_count = await service.run_analysis(
                property_id=property_id,
                period_year=period_year,
                user_id=user_id,
                org_id=org_id,
                supabase=db,
            )

        prompt_payload = mock_client.extract.call_args.kwargs["document_text"]
        assert entry_count == 1001
        assert '"total_gl_entries": 1001' in prompt_payload
        assert "HOU-02 wrong property charge" in prompt_payload

    @pytest.mark.asyncio
    async def test_run_analysis_persists_result(self) -> None:
        """Should persist the analysis result to gl_analysis_results table."""
        property_id = str(uuid4())
        user_id = uuid4()
        org_id = uuid4()
        period_year = 2024

        db = _mock_supabase_for_run(property_id, period_year)

        with patch(
            "app.services.analysis.gl_analysis_service.OpenRouterClient"
        ) as MockClient:
            mock_client = MagicMock()
            mock_client.extract = AsyncMock(
                return_value=("## CAM GL Analysis\n\n### Summary\nNo issues.", 1100)
            )
            MockClient.return_value = mock_client

            service = GLAnalysisService()
            result, _ = await service.run_analysis(
                property_id=property_id,
                period_year=period_year,
                user_id=user_id,
                org_id=org_id,
                supabase=db,
            )

        # Verify the result has correct fields
        assert result.period_year == period_year
        assert result.analysis_markdown is not None
        assert len(result.analysis_markdown) > 0

    @pytest.mark.asyncio
    async def test_run_analysis_tracks_token_usage(self) -> None:
        """Should store token counts returned by AnthropicClient in the insert payload."""
        property_id = str(uuid4())
        user_id = uuid4()
        org_id = uuid4()
        period_year = 2024

        total_tokens = 1300  # 950 input + 350 output as returned by Anthropic

        # Use a list to capture the inserted data
        captured_insert: list[dict] = []

        db = MagicMock()
        now = datetime.now(UTC)

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "properties":
                t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                    "id": property_id,
                    "name": "Test Property",
                    "organization_id": str(org_id),
                }
            elif table_name == "gl_entries":
                t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
                    []
                )
            elif table_name == "expense_pools":
                t.select.return_value.eq.return_value.execute.return_value.data = []
            elif table_name == "gl_analysis_results":

                def capture_insert(data: dict) -> MagicMock:
                    captured_insert.append(data)
                    result_mock = MagicMock()
                    result_mock.execute.return_value.data = [
                        {
                            "id": str(uuid4()),
                            "organization_id": str(org_id),
                            "property_id": property_id,
                            "period_year": period_year,
                            "analysis_markdown": "## CAM GL Analysis",
                            "token_input": data.get("token_input", 0),
                            "token_output": data.get("token_output", 0),
                            "ran_at": now.isoformat(),
                            "ran_by_user_id": str(user_id),
                            "dismissed_at": None,
                            "dismissed_by_user_id": None,
                            "created_at": now.isoformat(),
                        }
                    ]
                    return result_mock

                t.insert.side_effect = capture_insert
            return t

        db.table.side_effect = table_side_effect

        with patch(
            "app.services.analysis.gl_analysis_service.OpenRouterClient"
        ) as MockClient:
            mock_client = MagicMock()
            mock_client.extract = AsyncMock(
                return_value=("## CAM GL Analysis", total_tokens)
            )
            MockClient.return_value = mock_client

            service = GLAnalysisService()
            await service.run_analysis(
                property_id=property_id,
                period_year=period_year,
                user_id=user_id,
                org_id=org_id,
                supabase=db,
            )

        # Verify token total was stored (split may vary but must sum to total)
        assert len(captured_insert) == 1
        stored = captured_insert[0]
        assert stored["token_input"] + stored["token_output"] == total_tokens

    @pytest.mark.asyncio
    async def test_run_analysis_raises_value_error_when_property_not_found(
        self,
    ) -> None:
        """Should raise ValueError when property doesn't exist or belongs to another org."""
        property_id = str(uuid4())
        user_id = uuid4()
        org_id = uuid4()
        period_year = 2024

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "properties":
                t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
                    None  # property not found / wrong org
                )
            return t

        db.table.side_effect = table_side_effect

        service = GLAnalysisService()
        with pytest.raises(ValueError, match=str(property_id)):
            await service.run_analysis(
                property_id=property_id,
                period_year=period_year,
                user_id=user_id,
                org_id=org_id,
                supabase=db,
            )

    @pytest.mark.asyncio
    async def test_run_analysis_raises_runtime_error_when_insert_fails(
        self,
    ) -> None:
        """Should raise RuntimeError when the DB insert returns no rows (e.g. RLS block)."""
        property_id = str(uuid4())
        user_id = uuid4()
        org_id = uuid4()
        period_year = 2024

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "properties":
                t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                    "id": property_id,
                    "name": "Test Property",
                    "organization_id": str(org_id),
                }
            elif table_name == "gl_entries":
                t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
                    []
                )
            elif table_name == "expense_pools":
                t.select.return_value.eq.return_value.execute.return_value.data = []
            elif table_name == "gl_analysis_results":
                t.insert.return_value.execute.return_value.data = []  # insert blocked
            return t

        db.table.side_effect = table_side_effect

        with patch(
            "app.services.analysis.gl_analysis_service.OpenRouterClient"
        ) as MockClient:
            mock_client = MagicMock()
            mock_client.extract = AsyncMock(return_value=("## Analysis", 500))
            MockClient.return_value = mock_client

            service = GLAnalysisService()
            with pytest.raises(RuntimeError, match="RLS"):
                await service.run_analysis(
                    property_id=property_id,
                    period_year=period_year,
                    user_id=user_id,
                    org_id=org_id,
                    supabase=db,
                )


class TestGLAnalysisServiceGetLatest:
    """Tests for the get_latest_analysis method."""

    @pytest.mark.asyncio
    async def test_get_latest_analysis_returns_most_recent(self) -> None:
        """Should return the most recent analysis result for property/year."""
        property_id = str(uuid4())
        org_id = uuid4()
        period_year = 2024
        result_id = uuid4()
        now = datetime.now(UTC)

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "gl_analysis_results":
                # Three .eq() calls: org_id, property_id, period_year
                t.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.order.return_value.limit.return_value.execute.return_value.data = [
                    {
                        "id": str(result_id),
                        "organization_id": str(org_id),
                        "property_id": property_id,
                        "period_year": period_year,
                        "analysis_markdown": "## CAM GL Analysis",
                        "token_input": 800,
                        "token_output": 300,
                        "ran_at": now.isoformat(),
                        "ran_by_user_id": str(uuid4()),
                        "dismissed_at": None,
                        "dismissed_by_user_id": None,
                        "created_at": now.isoformat(),
                    }
                ]
            return t

        db.table.side_effect = table_side_effect

        service = GLAnalysisService()
        result = await service.get_latest_analysis(
            property_id=property_id,
            period_year=period_year,
            org_id=org_id,
            supabase=db,
        )

        assert result is not None
        assert result.id == result_id
        assert result.period_year == period_year

    @pytest.mark.asyncio
    async def test_get_latest_analysis_returns_none_when_no_results(self) -> None:
        """Should return None when no analysis exists for property/year."""
        property_id = str(uuid4())
        org_id = uuid4()
        period_year = 2024

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "gl_analysis_results":
                t.select.return_value.eq.return_value.eq.return_value.eq.return_value.is_.return_value.order.return_value.limit.return_value.execute.return_value.data = (
                    []
                )
            return t

        db.table.side_effect = table_side_effect

        service = GLAnalysisService()
        result = await service.get_latest_analysis(
            property_id=property_id,
            period_year=period_year,
            org_id=org_id,
            supabase=db,
        )

        assert result is None


class TestGLAnalysisServiceDismiss:
    """Tests for the dismiss_analysis method."""

    @pytest.mark.asyncio
    async def test_dismiss_analysis_sets_dismissed_fields(self) -> None:
        """Should set dismissed_at and dismissed_by_user_id on the record."""
        analysis_id = uuid4()
        user_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "gl_analysis_results":
                # Two .eq() calls: .eq("id", ...).eq("organization_id", ...)
                t.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                    {
                        "id": str(analysis_id),
                        "organization_id": str(org_id),
                        "property_id": str(uuid4()),
                        "period_year": 2024,
                        "analysis_markdown": "## Analysis",
                        "token_input": 500,
                        "token_output": 200,
                        "ran_at": now.isoformat(),
                        "ran_by_user_id": str(uuid4()),
                        "dismissed_at": now.isoformat(),
                        "dismissed_by_user_id": str(user_id),
                        "created_at": now.isoformat(),
                    }
                ]
            return t

        db.table.side_effect = table_side_effect

        service = GLAnalysisService()
        result = await service.dismiss_analysis(
            analysis_id=analysis_id,
            user_id=user_id,
            org_id=org_id,
            supabase=db,
        )

        assert result.dismissed_at is not None
        assert result.dismissed_by_user_id == user_id

    @pytest.mark.asyncio
    async def test_dismiss_analysis_raises_value_error_when_not_found(self) -> None:
        """Should raise ValueError when no rows are returned (wrong org or missing ID)."""
        analysis_id = uuid4()
        user_id = uuid4()
        org_id = uuid4()

        db = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "gl_analysis_results":
                t.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
                    []
                )
            return t

        db.table.side_effect = table_side_effect

        service = GLAnalysisService()
        with pytest.raises(ValueError, match=str(analysis_id)):
            await service.dismiss_analysis(
                analysis_id=analysis_id,
                user_id=user_id,
                org_id=org_id,
                supabase=db,
            )


class TestGLAnalysisServiceDetectAnomalies:
    """Tests for the _detect_anomalies pre-aggregation scan."""

    def test_detects_cross_property_code_in_description(self) -> None:
        """Should flag entries whose description contains a foreign property code."""
        service = GLAnalysisService()
        rows = [
            {
                "account_code": "5320.00",
                "vendor_name": "Roto-Rooter",
                "description": "HOU-02 Water Main Emergency Repair (mis-coded)",
                "amount": "4200.00",
                "transaction_date": "2024-07-15",
            }
        ]
        anomalies = service._detect_anomalies(rows)
        assert len(anomalies) == 1
        assert anomalies[0]["account_code"] == "5320.00"
        assert "HOU-02" in anomalies[0]["detected_codes"]

    def test_detects_miscoding_keyword_in_description(self) -> None:
        """Should flag entries with explicit mis-coding keywords even without property codes."""
        service = GLAnalysisService()
        rows = [
            {
                "account_code": "5400.00",
                "vendor_name": "ABC Plumbing",
                "description": "Repair at wrong property — reverse needed",
                "amount": "1500.00",
                "transaction_date": "2024-03-10",
            }
        ]
        anomalies = service._detect_anomalies(rows)
        assert len(anomalies) == 1
        assert anomalies[0]["description"] == rows[0]["description"]

    def test_excludes_current_property_code_from_matches(self) -> None:
        """Should not flag entries that only mention the current property's own code."""
        service = GLAnalysisService()
        rows = [
            {
                "account_code": "5300.00",
                "vendor_name": "TDI",
                "description": "ELD-01 HVAC preventive maintenance",
                "amount": "3000.00",
                "transaction_date": "2024-01-15",
            }
        ]
        # Passing "ELD" as the current property code — ELD-01 must be suppressed
        anomalies = service._detect_anomalies(rows, current_property_code="ELD")
        assert anomalies == []

    def test_returns_empty_when_no_anomalies(self) -> None:
        """Should return an empty list when GL rows are clean."""
        service = GLAnalysisService()
        rows = [
            {
                "account_code": "5100.00",
                "vendor_name": "ABM Industries",
                "description": "Monthly janitorial services",
                "amount": "8500.00",
                "transaction_date": "2024-01-31",
            },
            {
                "account_code": "5200.00",
                "vendor_name": "Reliant Energy",
                "description": "Electric utilities January",
                "amount": "12000.00",
                "transaction_date": "2024-01-31",
            },
        ]
        assert service._detect_anomalies(rows) == []

    def test_detects_cross_property_code_in_vendor_name(self) -> None:
        """Should flag entries whose vendor name contains a foreign property code."""
        service = GLAnalysisService()
        rows = [
            {
                "account_code": "5500.00",
                "vendor_name": "MRI-03 Vendor Reclass",
                "description": "Landscape maintenance",
                "amount": "2000.00",
                "transaction_date": "2024-04-30",
            }
        ]
        anomalies = service._detect_anomalies(rows)
        assert len(anomalies) == 1
        assert "MRI-03" in anomalies[0]["detected_codes"]

    @pytest.mark.asyncio
    async def test_run_analysis_includes_anomalies_in_prompt(self) -> None:
        """run_analysis should embed anomaly entries in the Claude user message."""
        property_id = str(uuid4())
        user_id = uuid4()
        org_id = uuid4()
        period_year = 2024

        # Build GL rows where one entry has a cross-property code
        gl_rows_with_anomaly = [
            {
                "account_code": "5320.00",
                "account_description": "Plumbing R&M",
                "vendor_name": "Roto-Rooter",
                "description": "HOU-02 Water Main Emergency Repair (mis-coded)",
                "amount": "4200.00",
                "transaction_date": "2024-07-15",
            },
            {
                "account_code": "5100.00",
                "account_description": "Janitorial",
                "vendor_name": "ABM Industries",
                "description": "Monthly cleaning July",
                "amount": "8500.00",
                "transaction_date": "2024-07-31",
            },
        ]

        db = MagicMock()
        now = datetime.now(UTC)

        def table_side_effect(table_name: str) -> MagicMock:
            t = MagicMock()
            if table_name == "properties":
                t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                    "id": property_id,
                    "name": "Eldridge Energy Center",
                    "organization_id": str(org_id),
                }
            elif table_name == "gl_entries":
                t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
                    gl_rows_with_anomaly
                )
            elif table_name == "expense_pools":
                t.select.return_value.eq.return_value.execute.return_value.data = []
            elif table_name == "gl_analysis_results":
                t.insert.return_value.execute.return_value.data = [
                    {
                        "id": str(uuid4()),
                        "organization_id": str(org_id),
                        "property_id": property_id,
                        "period_year": period_year,
                        "analysis_markdown": "## CAM GL Analysis",
                        "token_input": 500,
                        "token_output": 0,
                        "ran_at": now.isoformat(),
                        "ran_by_user_id": str(user_id),
                        "dismissed_at": None,
                        "dismissed_by_user_id": None,
                        "created_at": now.isoformat(),
                    }
                ]
            return t

        db.table.side_effect = table_side_effect

        captured_messages: list[str] = []

        with patch(
            "app.services.analysis.gl_analysis_service.OpenRouterClient"
        ) as MockClient:
            mock_client = MagicMock()

            async def capture_extract(**kwargs: Any) -> tuple[str, int]:
                captured_messages.append(kwargs.get("document_text", ""))
                return "## CAM GL Analysis", 500

            mock_client.extract = capture_extract
            MockClient.return_value = mock_client

            service = GLAnalysisService()
            await service.run_analysis(
                property_id=property_id,
                period_year=period_year,
                user_id=user_id,
                org_id=org_id,
                supabase=db,
            )

        assert len(captured_messages) == 1
        prompt_payload = captured_messages[0]
        # The anomaly with "HOU-02" must appear in the prompt JSON
        assert "HOU-02" in prompt_payload
        assert "anomalies" in prompt_payload
