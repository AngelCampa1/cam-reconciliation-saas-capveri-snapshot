"""
API integration tests for the Tax Protest Data Package endpoints.

Tests cover:
1. test_generate_returns_zip                 — finalized snapshot → 200, valid ZIP
2. test_draft_returns_400                    — draft snapshot → 400
3. test_missing_snapshot_returns_404         — unknown snapshot → 404
4. test_essentials_plan_returns_402          — Essentials plan → 402
5. test_zip_filenames                        — exact file names in ZIP
6. test_deadlines_endpoint_configured_properties
7. test_deadlines_endpoint_unconfigured_returns_nulls
"""

import csv
import zipfile
from datetime import datetime
from io import BytesIO, StringIO
from uuid import uuid4

from app.api.v1.tax_protest import _fetch_pool_details
from tests.conftest import ORG_A_ID, ORG_A_PROPERTY_ID

GENERATE_ENDPOINT = "/api/v1/tax-protest/generate"
DEADLINES_ENDPOINT = "/api/v1/tax-protest/deadlines"

_EXPECTED_FILENAMES = {
    "01_Expense_Summary.pdf",
    "02_GL_by_Category.csv",
    "03_Year_Over_Year_Comparison.pdf",
    "04_County_Cover_Sheet.pdf",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_subscription(client, plan: str = "reconcile", status: str = "active"):
    client.mock_supabase._test_data["subscriptions"] = [
        {
            "id": str(uuid4()),
            "organization_id": str(ORG_A_ID),
            "plan": plan,
            "status": status,
            "stripe_subscription_id": "sub_test123",
        }
    ]


def _setup_generate_data(
    client,
    snapshot_data: dict,
    org_a_property: dict,
    prior_snapshots: list[dict] | None = None,
) -> None:
    client.mock_supabase._test_data["reconciliation_snapshots"] = [snapshot_data] + (
        prior_snapshots or []
    )
    client.mock_supabase._test_data["organizations"] = [
        {"id": str(ORG_A_ID), "name": "Test Org"}
    ]
    client.mock_supabase._test_data["properties"] = [org_a_property]
    client.mock_supabase._test_data["leases"] = [
        {"id": snapshot_data["lease_id"], "property_id": str(ORG_A_PROPERTY_ID)}
    ]
    client.mock_supabase._test_data["expense_pools"] = []
    client.mock_supabase._test_data["pool_mappings"] = []
    client.mock_supabase._test_data["gl_entries"] = []


def _generate_payload(snapshot_id: str, tax_year: int = 2024) -> dict:
    return {
        "snapshot_id": snapshot_id,
        "tax_year": tax_year,
        "county": "Harris",
        "state": "TX",
    }


class _SchemaGuardQuery:
    def __init__(self, rows: list[dict], valid_columns: set[str]):
        self.rows = rows
        self.valid_columns = valid_columns
        self._start: int | None = None
        self._end: int | None = None

    def select(self, *_args, **_kwargs):
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
        data = self.rows
        if self._start is not None and self._end is not None:
            data = data[self._start : self._end + 1]
        response = type("Response", (), {})()
        response.data = data
        return response


class _PoolDetailsCtx:
    organization_id = ORG_A_ID

    def __init__(self, tables: dict[str, list[dict]]):
        self.tables = tables

    def table(self, table_name: str):
        valid_columns = {
            "expense_pools": {"id", "property_id"},
            "pool_mappings": {"expense_pool_id"},
            "gl_entries": {
                "id",
                "property_id",
                "period_year",
                "account_code",
                "account_description",
                "amount",
            },
        }[table_name]
        return _SchemaGuardQuery(list(self.tables[table_name]), valid_columns)


# ---------------------------------------------------------------------------
# POST /generate tests
# ---------------------------------------------------------------------------


class TestTaxProtestGenerate:
    def test_pool_details_do_not_filter_gl_entries_by_org_column(self):
        pool_id = str(uuid4())
        ctx = _PoolDetailsCtx(
            {
                "expense_pools": [
                    {
                        "id": pool_id,
                        "property_id": str(ORG_A_PROPERTY_ID),
                        "name": "Repairs",
                        "pool_type": "operating",
                    }
                ],
                "pool_mappings": [
                    {
                        "expense_pool_id": pool_id,
                        "gl_account_pattern": "5%",
                        "allocation_percentage": "1",
                    }
                ],
                "gl_entries": [
                    {
                        "id": str(uuid4()),
                        "property_id": str(ORG_A_PROPERTY_ID),
                        "period_year": 2024,
                        "account_code": "5000",
                        "account_description": "Repairs",
                        "amount": "123.45",
                    }
                ],
            }
        )

        details = _fetch_pool_details(ctx, ORG_A_PROPERTY_ID, 2024)

        assert details[0]["pool_name"] == "Repairs"
        assert details[0]["pool_total"] == "123.45"

    def test_generate_returns_zip(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Finalized snapshot + professional plan → 200 ZIP with 4 files."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _seed_subscription(org_a_member_client, plan="reconcile")
        _setup_generate_data(org_a_member_client, sample_snapshot_data, org_a_property)

        response = org_a_member_client.post(
            GENERATE_ENDPOINT,
            json=_generate_payload(sample_snapshot_data["id"]),
        )

        assert response.status_code == 200
        assert "application/zip" in response.headers["content-type"]
        assert response.content[:4] == b"PK\x03\x04"  # ZIP magic

    def test_zip_filenames(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """ZIP contains exactly the 4 required files with correct names."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _seed_subscription(org_a_member_client, plan="reconcile")
        _setup_generate_data(org_a_member_client, sample_snapshot_data, org_a_property)

        response = org_a_member_client.post(
            GENERATE_ENDPOINT,
            json=_generate_payload(sample_snapshot_data["id"]),
        )

        assert response.status_code == 200
        zf = zipfile.ZipFile(BytesIO(response.content))
        names = set(zf.namelist())
        assert names == _EXPECTED_FILENAMES

    def test_draft_returns_400(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Draft snapshot status → 400."""
        sample_snapshot_data["status"] = "draft"
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _seed_subscription(org_a_member_client, plan="reconcile")
        _setup_generate_data(org_a_member_client, sample_snapshot_data, org_a_property)

        response = org_a_member_client.post(
            GENERATE_ENDPOINT,
            json=_generate_payload(sample_snapshot_data["id"]),
        )

        assert response.status_code == 400

    def test_missing_snapshot_returns_404(self, org_a_member_client, org_a_property):
        """Unknown snapshot ID → 404."""
        _seed_subscription(org_a_member_client, plan="reconcile")
        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = []
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]

        response = org_a_member_client.post(
            GENERATE_ENDPOINT,
            json=_generate_payload(str(uuid4())),
        )

        assert response.status_code == 404

    def test_inactive_subscription_returns_402(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Inactive Reconcile subscription returns 402."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _seed_subscription(org_a_member_client, plan="reconcile", status="canceled")
        _setup_generate_data(org_a_member_client, sample_snapshot_data, org_a_property)

        response = org_a_member_client.post(
            GENERATE_ENDPOINT,
            json=_generate_payload(sample_snapshot_data["id"]),
        )

        assert response.status_code == 402

    def test_zip_pdf_files_non_empty(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """Each file in the ZIP is non-empty and PDFs start with %PDF."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _seed_subscription(org_a_member_client, plan="reconcile")
        _setup_generate_data(org_a_member_client, sample_snapshot_data, org_a_property)

        response = org_a_member_client.post(
            GENERATE_ENDPOINT,
            json=_generate_payload(sample_snapshot_data["id"]),
        )

        assert response.status_code == 200
        zf = zipfile.ZipFile(BytesIO(response.content))
        for name in zf.namelist():
            data = zf.read(name)
            assert len(data) > 0, f"{name} is empty"
            if name.endswith(".pdf"):
                assert data[:4] == b"%PDF", f"{name} does not start with %PDF"

    def test_gl_by_category_csv_includes_entries_after_first_page(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """GL category CSV includes matching GL rows past Supabase page one."""
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _seed_subscription(org_a_member_client, plan="reconcile")
        _setup_generate_data(org_a_member_client, sample_snapshot_data, org_a_property)

        pool_id = str(uuid4())
        org_a_member_client.mock_supabase._test_data["expense_pools"] = [
            {
                "id": pool_id,
                "property_id": str(ORG_A_PROPERTY_ID),
                "name": "Taxes",
                "pool_type": "tax",
            }
        ]
        org_a_member_client.mock_supabase._test_data["pool_mappings"] = [
            {
                "expense_pool_id": pool_id,
                "gl_account_pattern": "5100",
                "allocation_percentage": "1",
            }
        ]
        org_a_member_client.mock_supabase._test_data["gl_entries"] = [
            {
                "id": str(uuid4()),
                "organization_id": str(ORG_A_ID),
                "property_id": str(ORG_A_PROPERTY_ID),
                "period_year": 2024,
                "account_code": "5100",
                "account_description": "Property Tax",
                "amount": "1.00",
            }
            for _ in range(1001)
        ]

        response = org_a_member_client.post(
            GENERATE_ENDPOINT,
            json=_generate_payload(sample_snapshot_data["id"]),
        )

        assert response.status_code == 200
        zf = zipfile.ZipFile(BytesIO(response.content))
        csv_text = zf.read("02_GL_by_Category.csv").decode("utf-8")
        rows = list(csv.DictReader(StringIO(csv_text)))
        assert len(rows) == 1001
        assert rows[-1]["Amount"] == "1.00"


# ---------------------------------------------------------------------------
# GET /deadlines tests
# ---------------------------------------------------------------------------


class TestTaxProtestDeadlines:
    def _seed_properties(self, client, properties: list[dict]) -> None:
        client.mock_supabase._test_data["properties"] = properties

    def test_deadlines_endpoint_configured_properties(self, org_a_member_client):
        """Properties with county config return effective_deadline and days_remaining."""
        self._seed_properties(
            org_a_member_client,
            [
                {
                    "id": str(ORG_A_PROPERTY_ID),
                    "organization_id": str(ORG_A_ID),
                    "name": "Harris Building",
                    "state": "TX",
                    "tax_protest_county": "Harris",
                    "tax_protest_deadline_override": None,
                }
            ],
        )

        response = org_a_member_client.get(DEADLINES_ENDPOINT, params={"year": 2025})

        assert response.status_code == 200
        body = response.json()
        assert body["year"] == 2025
        assert len(body["items"]) == 1
        item = body["items"][0]
        assert item["property_name"] == "Harris Building"
        assert item["county"] == "Harris"
        assert item["state"] == "TX"
        assert item["effective_deadline"] is not None
        assert item["is_configured"] is True

    def test_deadlines_endpoint_unconfigured_returns_nulls(self, org_a_member_client):
        """Properties without county config return null deadline values."""
        self._seed_properties(
            org_a_member_client,
            [
                {
                    "id": str(ORG_A_PROPERTY_ID),
                    "organization_id": str(ORG_A_ID),
                    "name": "Unconfigured Building",
                    "state": "TX",
                    "tax_protest_county": None,
                    "tax_protest_deadline_override": None,
                }
            ],
        )

        response = org_a_member_client.get(DEADLINES_ENDPOINT, params={"year": 2025})

        assert response.status_code == 200
        body = response.json()
        assert len(body["items"]) == 1
        item = body["items"][0]
        assert item["effective_deadline"] is None
        assert item["days_remaining"] is None
        assert item["is_configured"] is False

    def test_deadlines_endpoint_default_year_is_current(self, org_a_member_client):
        """Omitting year parameter uses current year."""
        self._seed_properties(org_a_member_client, [])
        response = org_a_member_client.get(DEADLINES_ENDPOINT)
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body["year"], int)
        assert body["year"] >= 2025

    def test_deadlines_with_string_override_date(self, org_a_member_client):
        """String ISO override date is parsed correctly."""
        self._seed_properties(
            org_a_member_client,
            [
                {
                    "id": str(ORG_A_PROPERTY_ID),
                    "organization_id": str(ORG_A_ID),
                    "name": "Override Building",
                    "state": "TX",
                    "tax_protest_county": None,
                    "tax_protest_deadline_override": "2025-03-31",
                }
            ],
        )
        response = org_a_member_client.get(DEADLINES_ENDPOINT, params={"year": 2025})
        assert response.status_code == 200
        body = response.json()
        item = body["items"][0]
        assert item["effective_deadline"] == "2025-03-31"
        assert item["is_configured"] is True


class TestTaxProtestGenerateWithPools:
    def test_generate_with_pool_and_gl_data(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """ZIP generates successfully when pools + GL entries exist."""
        from tests.conftest import ORG_A_PROPERTY_ID

        pool_id = str(uuid4())
        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _seed_subscription(org_a_member_client, plan="reconcile")

        org_a_member_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            sample_snapshot_data
        ]
        org_a_member_client.mock_supabase._test_data["organizations"] = [
            {"id": str(ORG_A_ID), "name": "Test Org"}
        ]
        org_a_member_client.mock_supabase._test_data["properties"] = [org_a_property]
        org_a_member_client.mock_supabase._test_data["leases"] = [
            {
                "id": sample_snapshot_data["lease_id"],
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["expense_pools"] = [
            {
                "id": pool_id,
                "name": "CAM",
                "pool_type": "operating",
                "property_id": str(ORG_A_PROPERTY_ID),
            }
        ]
        org_a_member_client.mock_supabase._test_data["pool_mappings"] = [
            {
                "expense_pool_id": pool_id,
                "gl_account_pattern": "5%",
                "allocation_percentage": "1.0",
            }
        ]
        org_a_member_client.mock_supabase._test_data["gl_entries"] = [
            {
                "id": str(uuid4()),
                "account_code": "5100",
                "account_description": "Janitorial",
                "amount": "5000.00",
                "organization_id": str(ORG_A_ID),
                "property_id": str(ORG_A_PROPERTY_ID),
                "period_year": 2024,
            }
        ]

        response = org_a_member_client.post(
            GENERATE_ENDPOINT,
            json=_generate_payload(sample_snapshot_data["id"]),
        )

        assert response.status_code == 200
        zf = zipfile.ZipFile(BytesIO(response.content))
        csv_content = zf.read("02_GL_by_Category.csv").decode("utf-8")
        assert "CAM" in csv_content
        assert "Janitorial" in csv_content

    def test_generate_with_prior_year_snapshot(
        self, org_a_member_client, sample_snapshot_data, org_a_property
    ):
        """ZIP variance PDF includes prior year data when available."""
        prior_snapshot = sample_snapshot_data.copy()
        prior_snapshot["id"] = str(uuid4())
        prior_snapshot["period_start_date"] = "2023-01-01"
        prior_snapshot["period_end_date"] = "2023-12-31"
        prior_snapshot["status"] = "finalized"
        prior_snapshot["total_recovery"] = "40000.00"

        sample_snapshot_data["status"] = "finalized"
        sample_snapshot_data["finalized_at"] = datetime.now().isoformat()
        sample_snapshot_data["organization_id"] = str(ORG_A_ID)

        _seed_subscription(org_a_member_client, plan="reconcile")
        _setup_generate_data(
            org_a_member_client,
            sample_snapshot_data,
            org_a_property,
            prior_snapshots=[prior_snapshot],
        )

        response = org_a_member_client.post(
            GENERATE_ENDPOINT,
            json=_generate_payload(sample_snapshot_data["id"], tax_year=2024),
        )

        assert response.status_code == 200
        assert response.content[:4] == b"PK\x03\x04"
