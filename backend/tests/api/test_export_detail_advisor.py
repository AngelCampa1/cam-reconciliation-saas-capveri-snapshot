"""Tests for POST /api/v1/export/detail-advisor endpoint."""

from uuid import uuid4

from tests.conftest import ORG_A_ID, ORG_A_PROPERTY_ID


def _seed_subscription(
    client,
    *,
    plan: str = "professional",
    status: str = "active",
) -> None:
    client.mock_supabase._test_data["subscriptions"] = [
        {
            "id": str(uuid4()),
            "organization_id": str(ORG_A_ID),
            "plan": plan,
            "status": status,
            "stripe_subscription_id": "sub_test123",
        }
    ]


PROPERTY_ID = str(ORG_A_PROPERTY_ID)
YEAR = 2024


def _seed_gl_and_pools(client, *, pool_count: int = 2, items_per_pool: int = 3):
    """Seed expense pools, pool mappings, and GL entries for the advisor."""
    pools = []
    mappings = []
    gl_entries = []
    for p in range(pool_count):
        pool_id = str(uuid4())
        pool_name = f"Pool {chr(65 + p)}"
        pools.append(
            {
                "id": pool_id,
                "property_id": PROPERTY_ID,
                "name": pool_name,
                "pool_type": "operating",
                "organization_id": str(ORG_A_ID),
            }
        )
        mappings.append(
            {
                "id": str(uuid4()),
                "expense_pool_id": pool_id,
                "gl_account_pattern": f"{5 + p}%",
                "allocation_percentage": "1.0",
            }
        )
        for i in range(items_per_pool):
            gl_entries.append(
                {
                    "id": str(uuid4()),
                    "property_id": PROPERTY_ID,
                    "account_code": f"{5 + p}{i:02d}0",
                    "account_description": f"{pool_name} item {i}",
                    "amount": "1000.00",
                    "period_year": YEAR,
                    "organization_id": str(ORG_A_ID),
                }
            )

    client.mock_supabase._test_data["expense_pools"] = pools
    client.mock_supabase._test_data["pool_mappings"] = mappings
    client.mock_supabase._test_data["gl_entries"] = gl_entries
    return pools, mappings, gl_entries


class TestDetailAdvisorEndpoint:
    def test_returns_advisory_for_valid_property(self, org_a_member_client) -> None:
        _seed_subscription(org_a_member_client)
        _seed_gl_and_pools(org_a_member_client, pool_count=2, items_per_pool=3)
        resp = org_a_member_client.post(
            "/api/v1/export/detail-advisor",
            json={"property_id": PROPERTY_ID, "year": YEAR},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "overall_severity" in data
        assert "summary" in data
        assert "grouping_suggestions" in data
        assert "immaterial_items" in data
        assert "total_line_items" in data
        assert data["total_line_items"] == 6
        assert data["total_categories"] == 2

    def test_returns_guidance_for_missing_gl_data(self, org_a_member_client) -> None:
        _seed_subscription(org_a_member_client)
        client = org_a_member_client
        client.mock_supabase._test_data["expense_pools"] = []
        client.mock_supabase._test_data["pool_mappings"] = []
        client.mock_supabase._test_data["gl_entries"] = []
        resp = client.post(
            "/api/v1/export/detail-advisor",
            json={"property_id": PROPERTY_ID, "year": YEAR},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["overall_severity"] == "suggestion"
        assert data["total_line_items"] == 0
        assert "no detail line items" in data["summary"].lower()

    def test_requires_authentication(self, base_client) -> None:
        resp = base_client.post(
            "/api/v1/export/detail-advisor",
            json={"property_id": PROPERTY_ID, "year": YEAR},
        )
        assert resp.status_code == 401

    def test_response_schema_matches(self, org_a_member_client) -> None:
        _seed_subscription(org_a_member_client)
        _seed_gl_and_pools(org_a_member_client, pool_count=3, items_per_pool=7)
        resp = org_a_member_client.post(
            "/api/v1/export/detail-advisor",
            json={"property_id": PROPERTY_ID, "year": YEAR},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["total_line_items"], int)
        assert isinstance(data["total_categories"], int)
        assert data["overall_severity"] in ("ok", "suggestion", "warning", "critical")
        assert isinstance(data["summary"], str)
        assert isinstance(data["grouping_suggestions"], list)
        assert isinstance(data["immaterial_items"], list)
        assert isinstance(data["suggested_total_lines"], int)
        if data["grouping_suggestions"]:
            sg = data["grouping_suggestions"][0]
            assert "category_name" in sg
            assert "current_line_count" in sg
            assert "severity" in sg

    def test_includes_second_page_gl_entries(self, org_a_member_client) -> None:
        _seed_subscription(org_a_member_client)
        _seed_gl_and_pools(org_a_member_client, pool_count=1, items_per_pool=1001)

        resp = org_a_member_client.post(
            "/api/v1/export/detail-advisor",
            json={"property_id": PROPERTY_ID, "year": YEAR},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["total_line_items"] == 1001
        assert data["total_categories"] == 1

    def test_allows_essentials_plan(self, org_a_member_client) -> None:
        _seed_gl_and_pools(org_a_member_client)
        _seed_subscription(org_a_member_client, plan="essentials")
        resp = org_a_member_client.post(
            "/api/v1/export/detail-advisor",
            json={"property_id": PROPERTY_ID, "year": YEAR},
        )
        assert resp.status_code == 200
