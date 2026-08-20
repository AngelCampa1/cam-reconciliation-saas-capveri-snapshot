"""
E2E test fixtures for real local Supabase database testing.

These fixtures provide real database connections, real JWT authentication,
and automatic cleanup for true end-to-end testing.

Usage:
    pytest -m e2e                    # Run all e2e tests
    pytest -m e2e tests/integration  # Run specific e2e file
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.database.client import SupabaseClientManager
from app.main import create_app

if TYPE_CHECKING:
    from supabase import Client

# Test organization IDs (deterministic UUIDs for cleanup)
ORG_A_ID = UUID("00000000-0000-0000-0000-000000000001")
ORG_B_ID = UUID("00000000-0000-0000-0000-000000000002")

# Test user credentials
TEST_USER_ORG_A_EMAIL = "test-org-a@e2e.capveri.com"
TEST_USER_ORG_B_EMAIL = "test-org-b@e2e.capveri.com"
TEST_PASSWORD = "TestPassword123!"


@pytest.fixture(scope="session")
def verify_supabase_connection():
    """Verify Supabase is running before any e2e tests.

    Skips tests if Supabase is not available instead of failing them.
    This allows E2E tests to be optional - they only run when Supabase is running locally.
    """
    try:
        client = SupabaseClientManager.get_service_client()
        # Simple connection check
        _ = client.table("organizations").select("id").limit(1).execute()
        # Connection successful (result.data may be empty, that's ok)
        return True
    except Exception as e:
        pytest.skip(
            f"Skipping E2E tests - Cannot connect to local Supabase instance.\n"
            f"Error: {e}\n\n"
            f"To run E2E tests, ensure Supabase is running:\n"
            f"  cd {os.getcwd()}\n"
            f"  supabase start\n\n"
            f"Expected connection:\n"
            f"  API URL: http://localhost:54321\n"
            f"  DB URL: postgresql://postgres:postgres@localhost:54322/postgres\n\n"
            f"Run E2E tests with: pytest -m e2e\n"
        )


@pytest.fixture(scope="session")
def real_supabase_client(verify_supabase_connection) -> Client:
    """
    Service role Supabase client (bypasses RLS).

    Use this ONLY for:
    - Seeding test data
    - Cleanup operations
    - Reading data to verify test results

    DO NOT use this for testing user-facing endpoints.
    Those should use e2e_client_* fixtures with real auth.
    """
    return SupabaseClientManager.get_service_client()


@pytest.fixture(scope="session")
def e2e_org_a(real_supabase_client: Client) -> dict:
    """
    Create or get test organization A.

    Uses UPSERT to be idempotent (safe to run multiple times).
    """
    org_data = {
        "id": str(ORG_A_ID),
        "name": "E2E Test Organization A",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    result = (
        real_supabase_client.table("organizations")
        .upsert(org_data, on_conflict="id")
        .execute()
    )

    return result.data[0]


@pytest.fixture(scope="session")
def e2e_org_b(real_supabase_client: Client) -> dict:
    """
    Create or get test organization B.

    Used for testing multi-tenant isolation (RLS policies).
    """
    org_data = {
        "id": str(ORG_B_ID),
        "name": "E2E Test Organization B",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    result = (
        real_supabase_client.table("organizations")
        .upsert(org_data, on_conflict="id")
        .execute()
    )

    return result.data[0]


@pytest.fixture(scope="session")
def e2e_user_org_a(real_supabase_client: Client, e2e_org_a: dict) -> dict:
    """
    Create test user in Supabase Auth for Organization A.

    Returns user dict with: {id, email, password, organization_id}

    This user will be used to generate real JWT tokens.
    """
    from supabase_auth.errors import AuthApiError

    user_id = None

    # Try to create user (will fail if already exists)
    try:
        auth_response = real_supabase_client.auth.admin.create_user(
            {
                "email": TEST_USER_ORG_A_EMAIL,
                "password": TEST_PASSWORD,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": "E2E Test User Org A",
                    "organization_id": str(e2e_org_a["id"]),
                },
            }
        )
        user_id = auth_response.user.id
    except AuthApiError as e:
        error_str = str(e).lower()
        # Skip tests if JWT validation fails (service role key mismatch)
        if "invalid jwt" in error_str or "signature" in error_str:
            pytest.skip(
                f"Skipping E2E tests - JWT validation failed.\n"
                f"Error: {e}\n\n"
                f"This usually means the SUPABASE_SERVICE_ROLE_KEY in .env "
                f"doesn't match the local Supabase instance.\n\n"
                f"To fix:\n"
                f"  1. Run 'supabase status' to get the current service_role key\n"
                f"  2. Update SUPABASE_SERVICE_ROLE_KEY in .env\n"
            )
        elif "already been registered" in error_str:
            # User already exists - get ID by signing in
            try:
                anon_client = SupabaseClientManager.get_anon_client()
                sign_in_response = anon_client.auth.sign_in_with_password(
                    {"email": TEST_USER_ORG_A_EMAIL, "password": TEST_PASSWORD}
                )
                user_id = sign_in_response.user.id
            except AuthApiError as sign_in_error:
                # If sign-in also fails, skip the tests
                pytest.skip(f"E2E user exists but sign-in failed: {sign_in_error}")
        else:
            raise

    # Ensure user profile exists in public.users table
    user_profile = {
        "id": str(user_id),
        "organization_id": str(e2e_org_a["id"]),
        "email": TEST_USER_ORG_A_EMAIL,
        "full_name": "E2E Test User Org A",
        "role": "member",
        "created_at": datetime.now(UTC).isoformat(),
    }

    real_supabase_client.table("users").upsert(user_profile, on_conflict="id").execute()

    return {
        "id": str(user_id),
        "email": TEST_USER_ORG_A_EMAIL,
        "password": TEST_PASSWORD,
        "organization_id": str(e2e_org_a["id"]),
    }


@pytest.fixture(scope="session")
def e2e_user_org_b(real_supabase_client: Client, e2e_org_b: dict) -> dict:
    """
    Create test user in Supabase Auth for Organization B.

    Used for testing multi-tenant isolation.
    """
    from supabase_auth.errors import AuthApiError

    user_id = None

    # Try to create user (will fail if already exists)
    try:
        auth_response = real_supabase_client.auth.admin.create_user(
            {
                "email": TEST_USER_ORG_B_EMAIL,
                "password": TEST_PASSWORD,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": "E2E Test User Org B",
                    "organization_id": str(e2e_org_b["id"]),
                },
            }
        )
        user_id = auth_response.user.id
    except AuthApiError as e:
        error_str = str(e).lower()
        # Skip tests if JWT validation fails (service role key mismatch)
        if "invalid jwt" in error_str or "signature" in error_str:
            pytest.skip(
                f"Skipping E2E tests - JWT validation failed.\n"
                f"Error: {e}\n\n"
                f"This usually means the SUPABASE_SERVICE_ROLE_KEY in .env "
                f"doesn't match the local Supabase instance.\n\n"
                f"To fix:\n"
                f"  1. Run 'supabase status' to get the current service_role key\n"
                f"  2. Update SUPABASE_SERVICE_ROLE_KEY in .env\n"
            )
        elif "already been registered" in error_str:
            # User already exists - get ID by signing in
            try:
                anon_client = SupabaseClientManager.get_anon_client()
                sign_in_response = anon_client.auth.sign_in_with_password(
                    {"email": TEST_USER_ORG_B_EMAIL, "password": TEST_PASSWORD}
                )
                user_id = sign_in_response.user.id
            except AuthApiError as sign_in_error:
                # If sign-in also fails, skip the tests
                pytest.skip(f"E2E user exists but sign-in failed: {sign_in_error}")
        else:
            raise

    # Ensure user profile exists
    user_profile = {
        "id": str(user_id),
        "organization_id": str(e2e_org_b["id"]),
        "email": TEST_USER_ORG_B_EMAIL,
        "full_name": "E2E Test User Org B",
        "role": "member",
        "created_at": datetime.now(UTC).isoformat(),
    }

    real_supabase_client.table("users").upsert(user_profile, on_conflict="id").execute()

    return {
        "id": str(user_id),
        "email": TEST_USER_ORG_B_EMAIL,
        "password": TEST_PASSWORD,
        "organization_id": str(e2e_org_b["id"]),
    }


@pytest.fixture(scope="function")
def e2e_auth_token_org_a(e2e_user_org_a: dict) -> str:
    """
    Generate real JWT token for Org A user via sign-in.

    This token will be used in Authorization headers for real auth testing.
    Function-scoped to get fresh tokens for each test.
    """
    # Use anonymous client (public role) for sign-in
    client = SupabaseClientManager.get_anon_client()

    auth_response = client.auth.sign_in_with_password(
        {
            "email": e2e_user_org_a["email"],
            "password": e2e_user_org_a["password"],
        }
    )

    if auth_response.session is None:
        raise RuntimeError(
            f"Failed to sign in as {e2e_user_org_a['email']}. "
            "Check that user exists in Supabase Auth."
        )

    return auth_response.session.access_token


@pytest.fixture(scope="function")
def e2e_auth_token_org_b(e2e_user_org_b: dict) -> str:
    """
    Generate real JWT token for Org B user via sign-in.

    Used for testing multi-tenant isolation.
    """
    client = SupabaseClientManager.get_anon_client()

    auth_response = client.auth.sign_in_with_password(
        {
            "email": e2e_user_org_b["email"],
            "password": e2e_user_org_b["password"],
        }
    )

    if auth_response.session is None:
        raise RuntimeError(
            f"Failed to sign in as {e2e_user_org_b['email']}. "
            "Check that user exists in Supabase Auth."
        )

    return auth_response.session.access_token


@pytest.fixture
def e2e_client_org_a(e2e_auth_token_org_a: str):
    """
    TestClient with REAL JWT authentication for Org A.

    CRITICAL: NO dependency overrides for auth!
    Uses real get_current_user() dependency that validates JWT.

    This client will:
    - Call real FastAPI endpoints (in-process but real routing)
    - Use real JWT validation
    - Enforce real RLS policies via supabase.postgrest.auth(token)
    """
    app = create_app()

    # NO app.dependency_overrides here!
    # We want real auth validation

    client = TestClient(app)
    client.headers = {"Authorization": f"Bearer {e2e_auth_token_org_a}"}

    # Attach supabase client for assertions (read-only usage)
    client.supabase = SupabaseClientManager.get_service_client()

    return client


@pytest.fixture
def e2e_client_org_b(e2e_auth_token_org_b: str):
    """
    TestClient with REAL JWT authentication for Org B.

    Used for testing multi-tenant isolation.
    """
    app = create_app()

    client = TestClient(app)
    client.headers = {"Authorization": f"Bearer {e2e_auth_token_org_b}"}

    # Attach supabase client for assertions
    client.supabase = SupabaseClientManager.get_service_client()

    return client


@pytest.fixture
def seed_e2e_properties(real_supabase_client: Client, e2e_org_a: dict) -> dict:
    """
    Create test property for Organization A.

    Returns property dict with id.
    """
    property_id = uuid4()

    property_data = {
        "id": str(property_id),
        "organization_id": str(e2e_org_a["id"]),
        "name": "E2E Test Property",
        "address_line1": "123 Test St",
        "address_line2": None,
        "city": "Test City",
        "state": "CA",
        "postal_code": "90210",
        "total_rentable_sqft": 100000.0,
        "total_usable_sqft": 85000.0,
        "common_area_sqft": 15000.0,
        "target_occupancy": 0.95,
        # Let database auto-generate timestamps
    }

    result = real_supabase_client.table("properties").insert(property_data).execute()

    if not result.data:
        raise RuntimeError(f"Failed to create test property. Response: {result}")

    created_property = result.data[0]
    print(f"\n[E2E] Created test property: {created_property['id']}")
    return created_property


@pytest.fixture(scope="function", autouse=True)
def cleanup_e2e_data(request):
    """
    Auto-cleanup after each e2e test.

    Only runs for tests marked with @pytest.mark.e2e.
    Deletes test organizations (cascades to all related tables).

    IMPORTANT: This relies on database having ON DELETE CASCADE
    on all foreign keys pointing to organizations table.
    """
    # Only run cleanup for e2e tests
    markers = [m.name for m in request.node.iter_markers()]
    if "e2e" not in markers:
        yield
        return

    # Lazy-load the client only for e2e tests (avoids triggering
    # verify_supabase_connection for non-e2e tests)
    real_supabase_client = request.getfixturevalue("real_supabase_client")

    yield  # Run the test

    # Cleanup: Delete all data EXCEPT organizations and users
    # (those are session-scoped and reused)
    # Delete in reverse dependency order to avoid FK violations

    # Properties cascade to units, leases, etc.
    real_supabase_client.table("properties").delete().eq(
        "organization_id", str(ORG_A_ID)
    ).execute()

    real_supabase_client.table("properties").delete().eq(
        "organization_id", str(ORG_B_ID)
    ).execute()

    # Import batches cascade to gl_entries
    real_supabase_client.table("import_batches").delete().eq(
        "organization_id", str(ORG_A_ID)
    ).execute()

    real_supabase_client.table("import_batches").delete().eq(
        "organization_id", str(ORG_B_ID)
    ).execute()

    # Reconciliation snapshots (may not have organization_id in all schemas)
    try:
        real_supabase_client.table("reconciliation_snapshots").delete().eq(
            "organization_id", str(ORG_A_ID)
        ).execute()

        real_supabase_client.table("reconciliation_snapshots").delete().eq(
            "organization_id", str(ORG_B_ID)
        ).execute()
    except Exception:
        # Schema might not have organization_id yet - skip cleanup
        pass
