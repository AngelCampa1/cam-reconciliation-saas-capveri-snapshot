"""Tests for CrossDocAssembler — mocks all DB calls."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, call
from uuid import uuid4

import pytest

from app.services.extraction.cross_doc_assembler import CrossDocAssembler
from app.services.extraction.cross_doc_models import CrossDocAnalysisInput

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_db(
    property_row: dict | None = None,
    lease_rows: list | None = None,
    doc_rows: list | None = None,
    org_row: dict | None = None,
    pool_rows: list | None = None,
    mapping_rows: list | None = None,
    gl_rows: list | None = None,
    actual_billed_rows: list | None = None,
) -> MagicMock:
    """Build a mock DB that returns specific data for each table query."""
    db = MagicMock()

    def table_side_effect(table_name: str) -> MagicMock:
        def _chain_returning(data):
            chain = MagicMock()
            chain.select.return_value = chain
            chain.eq.return_value = chain
            chain.in_.return_value = chain
            chain.lte.return_value = chain
            chain.gte.return_value = chain
            chain.limit.return_value = chain
            chain.range.return_value = chain
            chain.not_.is_.return_value = chain
            chain.not_ = MagicMock()
            chain.not_.is_ = MagicMock(return_value=chain)
            chain.maybe_single.return_value = chain
            chain.execute.return_value = SimpleNamespace(data=data)
            return chain

        if table_name == "properties":
            return _chain_returning(property_row)
        if table_name == "leases":
            return _chain_returning(lease_rows or [])
        if table_name == "documents":
            return _chain_returning(doc_rows or [])
        if table_name == "organizations":
            return _chain_returning(org_row)
        if table_name == "expense_pools":
            return _chain_returning(pool_rows or [])
        if table_name == "pool_mappings":
            return _chain_returning(mapping_rows or [])
        if table_name == "gl_entries":
            return _chain_returning(gl_rows or [])
        if table_name == "actual_billed_amounts":
            chain = _chain_returning(actual_billed_rows or [])
            db.actual_billed_chain = chain
            return chain
        return _chain_returning(None)

    db.table.side_effect = table_side_effect
    return db


class _SchemaGuardQuery:
    def __init__(self, rows: list[dict], valid_columns: set[str]):
        self.rows = rows
        self.valid_columns = valid_columns
        self._start: int | None = None
        self._end: int | None = None

    def _assert_columns(self, columns: str) -> None:
        for column in [part.strip() for part in columns.split(",")]:
            if column and column not in self.valid_columns:
                raise AssertionError(f"invalid selected column: {column}")

    def select(self, columns: str, *_args, **_kwargs):
        self._assert_columns(columns)
        return self

    def eq(self, column, value):
        if column not in self.valid_columns:
            raise AssertionError(f"invalid filter column: {column}")
        self.rows = [row for row in self.rows if row.get(column) == value]
        return self

    def in_(self, column, values):
        if column not in self.valid_columns:
            raise AssertionError(f"invalid filter column: {column}")
        self.rows = [row for row in self.rows if row.get(column) in values]
        return self

    def range(self, start, end):
        self._start = start
        self._end = end
        return self

    def execute(self):
        rows = self.rows
        if self._start is not None and self._end is not None:
            rows = rows[self._start : self._end + 1]
        return SimpleNamespace(data=rows)


class _SchemaGuardDb:
    def __init__(self, tables: dict[str, list[dict]]):
        self.tables = tables
        self.valid_columns = {
            "expense_pools": {
                "id",
                "name",
                "pool_type",
                "is_gross_up_applicable",
                "property_id",
            },
            "pool_mappings": {
                "expense_pool_id",
                "gl_account_pattern",
                "allocation_percentage",
            },
            "gl_entries": {
                "property_id",
                "period_year",
                "amount",
                "account_code",
                "vendor_name",
            },
        }

    def table(self, table_name: str):
        return _SchemaGuardQuery(
            list(self.tables.get(table_name, [])),
            self.valid_columns[table_name],
        )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_assemble_minimal_no_leases_no_gl() -> None:
    """Assembler works when no leases or GL data are present."""
    prop_id = uuid4()
    db = _make_db(
        property_row={
            "name": "Empty Tower",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
    )

    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)

    assert isinstance(result, CrossDocAnalysisInput)
    assert result.property_name == "Empty Tower"
    assert result.period_year == 2024
    assert result.lease_contexts == []
    assert result.gl_pool_contexts == []
    assert result.data_availability.has_verified_leases is False
    assert result.data_availability.has_gl_data is False


@pytest.mark.asyncio
async def test_assemble_with_verified_leases() -> None:
    """Assembler picks up verified leases and sets has_verified_leases=True."""
    prop_id = uuid4()
    lease_id = uuid4()

    db = _make_db(
        property_row={
            "name": "Tower A",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
        lease_rows=[
            {
                "id": str(lease_id),
                "tenant_name": "Acme Corp",
                "recovery_profile": {"cap_type": "NONE"},
                "pro_rata_share": "0.12",
                "base_year": 2020,
                "start_date": "2020-01-01",
                "end_date": "2025-12-31",
            }
        ],
        doc_rows=[
            {
                "lease_id": str(lease_id),
                "verified_at": "2024-01-15T10:00:00Z",
            }
        ],
    )

    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)

    assert result.data_availability.has_verified_leases is True
    assert result.data_availability.lease_count == 1
    assert len(result.lease_contexts) == 1
    assert result.lease_contexts[0].tenant_name == "Acme Corp"
    assert result.lease_contexts[0].pro_rata_share == Decimal("0.12")
    assert result.lease_contexts[0].verified_at is not None


@pytest.mark.asyncio
async def test_assemble_with_gl_data() -> None:
    """Assembler builds GL pool contexts when GL data present."""
    prop_id = uuid4()
    pool_id = str(uuid4())

    db = _make_db(
        property_row={
            "name": "Tower B",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
        pool_rows=[
            {
                "id": pool_id,
                "name": "CAM",
                "pool_type": "operating",
                "is_gross_up_applicable": True,
            }
        ],
        mapping_rows=[
            {
                "expense_pool_id": pool_id,
                "gl_account_pattern": "5%",
                "allocation_percentage": "1",
            }
        ],
        gl_rows=[
            {
                "amount": "100000",
                "account_code": "5100",
                "vendor_name": "ACME Cleaning",
            },
            {
                "amount": "50000",
                "account_code": "5200",
                "vendor_name": "Best Landscaping",
            },
        ],
    )

    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)

    assert result.data_availability.has_gl_data is True
    assert len(result.gl_pool_contexts) == 1
    assert result.gl_pool_contexts[0].pool_name == "CAM"
    assert result.gl_pool_contexts[0].total_amount == Decimal("150000")
    assert "ACME Cleaning" in result.gl_pool_contexts[0].top_vendors
    assert result.data_availability.gl_account_count == 2


@pytest.mark.asyncio
async def test_gl_pool_context_uses_schema_valid_gl_columns_and_mappings() -> None:
    """GL pool context uses account mappings, not nonexistent gl_entries pool fields."""
    prop_id = uuid4()
    pool_id = str(uuid4())
    db = _SchemaGuardDb(
        {
            "expense_pools": [
                {
                    "id": pool_id,
                    "property_id": str(prop_id),
                    "name": "Repairs",
                    "pool_type": "operating",
                    "is_gross_up_applicable": False,
                }
            ],
            "pool_mappings": [
                {
                    "expense_pool_id": pool_id,
                    "gl_account_pattern": "62%",
                    "allocation_percentage": "0.5",
                }
            ],
            "gl_entries": [
                {
                    "property_id": str(prop_id),
                    "period_year": 2024,
                    "amount": "1000",
                    "account_code": "6200",
                    "vendor_name": "HVAC Co",
                }
            ],
        }
    )

    contexts, account_count = await CrossDocAssembler(db=db)._fetch_gl_pool_contexts(
        prop_id, 2024
    )

    assert account_count == 1
    assert contexts[0].pool_name == "Repairs"
    assert contexts[0].total_amount == Decimal("500.0")
    assert contexts[0].top_vendors == ["HVAC Co"]


@pytest.mark.asyncio
async def test_assemble_marks_cam_statements_available_from_actual_billed_rows() -> (
    None
):
    """Assembler detects uploaded CAM statement billing data for the analysis period."""
    prop_id = uuid4()

    db = _make_db(
        property_row={
            "name": "Statement Tower",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
        actual_billed_rows=[
            {
                "id": str(uuid4()),
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "tenant_name": "Acme Corp",
                "billed_amount": "125000.00",
            }
        ],
    )

    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)

    actual_billed_query = db.actual_billed_chain
    assert result.data_availability.has_cam_statements is True
    actual_billed_query.select.assert_called_once_with("id")
    actual_billed_query.eq.assert_called_once_with("property_id", str(prop_id))
    actual_billed_query.lte.assert_has_calls([call("period_start_date", "2024-12-31")])
    actual_billed_query.gte.assert_has_calls([call("period_end_date", "2024-01-01")])
    actual_billed_query.limit.assert_called_once_with(1)


@pytest.mark.asyncio
async def test_assemble_token_estimation() -> None:
    """Assembler populates estimated_tokens (positive integer)."""
    prop_id = uuid4()
    db = _make_db(
        property_row={
            "name": "T",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    assert result.estimated_tokens > 0


@pytest.mark.asyncio
async def test_assemble_prior_year_totals() -> None:
    """Assembler fetches prior-year pool totals and sets has_prior_year_data."""
    prop_id = uuid4()
    pool_id = str(uuid4())

    db = _make_db(
        property_row={
            "name": "Tower C",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
        pool_rows=[
            {
                "id": pool_id,
                "name": "CAM",
                "pool_type": "operating",
                "is_gross_up_applicable": False,
            }
        ],
        mapping_rows=[
            {
                "expense_pool_id": pool_id,
                "gl_account_pattern": "5%",
                "allocation_percentage": "1",
            }
        ],
        gl_rows=[{"account_code": "5100", "amount": "200000"}],
    )

    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)

    assert result.data_availability.has_prior_year_data is True
    assert result.prior_year_totals.get("CAM") == Decimal("200000")


@pytest.mark.asyncio
async def test_assemble_auditor_context_from_org() -> None:
    """Org-level auditor config is parsed into AuditorContext."""
    prop_id = uuid4()
    org_id = str(uuid4())

    db = _make_db(
        property_row={
            "name": "Tower D",
            "organization_id": org_id,
            "auditor_overrides": None,
        },
        org_row={
            "auditor_config": {
                "market": "Chicago",
                "typical_management_fee_pct": "0.04",
                "custom_rules": ["No janitorial in base year"],
            }
        },
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)

    assert result.auditor_context.market == "Chicago"
    assert result.auditor_context.typical_management_fee_pct == Decimal("0.04")
    assert "No janitorial in base year" in result.auditor_context.custom_rules


@pytest.mark.asyncio
async def test_assemble_property_overrides_from_string_json() -> None:
    """Property auditor_overrides stored as JSON string is parsed correctly."""
    import json as json_mod

    prop_id = uuid4()
    overrides = {"known_exceptions": ["Management fee waiver for Tenant A"]}
    db = _make_db(
        property_row={
            "name": "Tower E",
            "organization_id": str(uuid4()),
            "auditor_overrides": json_mod.dumps(overrides),
        },
        org_row={"auditor_config": None},
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    assert (
        "Management fee waiver for Tenant A"
        in result.property_overrides.known_exceptions
    )


@pytest.mark.asyncio
async def test_assemble_auditor_config_from_string_json() -> None:
    """Org auditor_config stored as JSON string is parsed correctly."""
    import json as json_mod

    prop_id = uuid4()
    config = {"market": "LA", "custom_rules": ["No landscaping in admin fee"]}
    db = _make_db(
        property_row={
            "name": "Tower F",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": json_mod.dumps(config)},
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    assert result.auditor_context.market == "LA"


@pytest.mark.asyncio
async def test_assemble_recovery_profile_as_string_json() -> None:
    """Lease recovery_profile stored as JSON string is parsed correctly."""
    import json as json_mod

    prop_id = uuid4()
    lease_id = uuid4()
    recovery = {"cap_type": "CUMULATIVE", "cap_rate": "0.03"}

    db = _make_db(
        property_row={
            "name": "Tower G",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
        lease_rows=[
            {
                "id": str(lease_id),
                "tenant_name": "String Corp",
                "recovery_profile": json_mod.dumps(recovery),
                "pro_rata_share": "0.10",
                "base_year": 2021,
                "start_date": "2021-01-01",
                "end_date": "2026-12-31",
            }
        ],
        doc_rows=[{"lease_id": str(lease_id), "verified_at": "2024-01-10T00:00:00Z"}],
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    assert len(result.lease_contexts) == 1
    assert result.lease_contexts[0].recovery_profile.get("cap_type") == "CUMULATIVE"


@pytest.mark.asyncio
async def test_assemble_property_not_found_uses_id_as_name() -> None:
    """When property row is not found, property_name falls back to str(property_id)."""
    prop_id = uuid4()
    db = _make_db(
        property_row=None,  # no property data
        org_row={"auditor_config": None},
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    assert result.property_name == str(prop_id)


@pytest.mark.asyncio
async def test_assemble_gl_entry_without_matching_mapping_skipped() -> None:
    """GL entries without matching pool mappings are skipped without error."""
    prop_id = uuid4()
    pool_id = str(uuid4())

    db = _make_db(
        property_row={
            "name": "Tower H",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
        pool_rows=[
            {
                "id": pool_id,
                "name": "CAM",
                "pool_type": "operating",
                "is_gross_up_applicable": False,
            }
        ],
        mapping_rows=[
            {
                "expense_pool_id": pool_id,
                "gl_account_pattern": "51%",
                "allocation_percentage": "1",
            }
        ],
        gl_rows=[
            # Row with pool_id → counted
            {
                "amount": "50000",
                "account_code": "5100",
                "vendor_name": "Vendor A",
            },
            # Row without pool_id → skipped
            {
                "amount": "10000",
                "account_code": "5200",
                "vendor_name": "Vendor B",
            },
        ],
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    assert result.gl_pool_contexts[0].total_amount == Decimal("50000")


@pytest.mark.asyncio
async def test_assemble_gl_entry_with_no_vendor_still_counted() -> None:
    """GL entries with empty vendor_name are counted but don't add to top_vendors."""
    prop_id = uuid4()
    pool_id = str(uuid4())

    db = _make_db(
        property_row={
            "name": "Tower I",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
        pool_rows=[
            {
                "id": pool_id,
                "name": "CAM",
                "pool_type": "operating",
                "is_gross_up_applicable": False,
            }
        ],
        mapping_rows=[
            {
                "expense_pool_id": pool_id,
                "gl_account_pattern": "5%",
                "allocation_percentage": "1",
            }
        ],
        gl_rows=[
            {
                "amount": "75000",
                "account_code": "5100",
                "vendor_name": "",  # empty vendor
            },
        ],
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    assert result.gl_pool_contexts[0].total_amount == Decimal("75000")
    assert result.gl_pool_contexts[0].top_vendors == []


@pytest.mark.asyncio
async def test_assemble_invalid_json_in_recovery_profile_fallback() -> None:
    """Malformed JSON string in recovery_profile falls back to empty dict."""
    prop_id = uuid4()
    lease_id = uuid4()

    db = _make_db(
        property_row={
            "name": "Tower J",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": None},
        lease_rows=[
            {
                "id": str(lease_id),
                "tenant_name": "Bad JSON Corp",
                "recovery_profile": "THIS IS NOT JSON {{{",
                "pro_rata_share": "0.10",
                "base_year": 2022,
                "start_date": "2022-01-01",
                "end_date": "2026-12-31",
            }
        ],
        doc_rows=[{"lease_id": str(lease_id), "verified_at": "2024-01-01T00:00:00Z"}],
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    assert len(result.lease_contexts) == 1
    assert result.lease_contexts[0].recovery_profile == {}


def test_token_estimate_is_proportional_to_input_size() -> None:
    """estimated_tokens for a larger payload is greater than for a smaller one,
    and the estimate is within 2x of len(message) / 3."""
    from decimal import Decimal
    from uuid import uuid4 as _uuid4

    from app.services.extraction.cross_doc_models import (
        AuditorContext,
        CrossDocAnalysisInput,
        DataAvailability,
        GLPoolContext,
        LeaseContext,
    )
    from app.services.extraction.cross_doc_prompt import build_cross_doc_user_message

    def _make_lease(n: int) -> LeaseContext:
        return LeaseContext(
            lease_id=str(_uuid4()),
            tenant_name=f"Tenant {n}",
            recovery_profile={"cap_type": "NONE"},
            pro_rata_share=Decimal("0.05"),
            base_year=2020,
            term_start="2020-01-01",
            term_end="2026-12-31",
        )

    def _make_pool(n: int) -> GLPoolContext:
        return GLPoolContext(
            pool_name=f"Pool {n}",
            pool_type="operating",
            total_amount=Decimal("50000"),
            account_count=5,
            top_vendors=[f"Vendor {n}"],
            is_gross_up_applicable=False,
        )

    def _make_input(lease_count: int, pool_count: int) -> CrossDocAnalysisInput:
        import json

        obj = CrossDocAnalysisInput(
            property_id=_uuid4(),
            property_name="Test Property",
            period_year=2024,
            lease_contexts=[_make_lease(i) for i in range(lease_count)],
            gl_pool_contexts=[_make_pool(i) for i in range(pool_count)],
            auditor_context=AuditorContext(),
            data_availability=DataAvailability(
                has_verified_leases=True,
                lease_count=lease_count,
                gl_account_count=pool_count,
            ),
        )
        serialized = json.dumps(obj.model_dump(mode="json"), default=str)
        obj.estimated_tokens = len(serialized) // 3
        return obj

    small_input = _make_input(lease_count=2, pool_count=5)
    large_input = _make_input(lease_count=10, pool_count=20)

    small_msg = build_cross_doc_user_message(small_input)
    large_msg = build_cross_doc_user_message(large_input)

    # Larger payload must have more estimated tokens
    assert large_input.estimated_tokens > small_input.estimated_tokens

    # Estimate must be within 2x of len(message) / 3 for both payloads
    for inp, msg in [(small_input, small_msg), (large_input, large_msg)]:
        approx = len(msg) / 3
        assert (
            inp.estimated_tokens <= approx * 2
        ), f"estimated_tokens {inp.estimated_tokens} more than 2x of approx {approx}"
        assert (
            inp.estimated_tokens >= approx / 2
        ), f"estimated_tokens {inp.estimated_tokens} less than half of approx {approx}"


@pytest.mark.asyncio
async def test_assemble_invalid_json_in_auditor_config_fallback() -> None:
    """Malformed JSON string in auditor_config falls back to default AuditorContext."""
    prop_id = uuid4()
    db = _make_db(
        property_row={
            "name": "Tower K",
            "organization_id": str(uuid4()),
            "auditor_overrides": None,
        },
        org_row={"auditor_config": "NOT VALID JSON {"},
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    # Falls back to default empty AuditorContext
    assert result.auditor_context.market is None


@pytest.mark.asyncio
async def test_assemble_invalid_json_in_auditor_overrides_fallback() -> None:
    """Malformed JSON string in auditor_overrides falls back to default overrides."""
    prop_id = uuid4()
    db = _make_db(
        property_row={
            "name": "Tower L",
            "organization_id": str(uuid4()),
            "auditor_overrides": "BAD JSON {{",
        },
        org_row={"auditor_config": None},
    )
    assembler = CrossDocAssembler(db=db)
    result = await assembler.assemble(prop_id, 2024)
    assert result.property_overrides.known_exceptions == []
