"""Pytest configuration and shared fixtures.

This module contains fixtures used across multiple test files,
particularly for authentication and API testing.
"""

import os
from collections.abc import Generator
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, HTTPException, status
from fastapi.testclient import TestClient

from app.api.v1 import router as api_v1_router
from app.auth.dependencies import (
    OrganizationContext,
    get_current_admin_user,
    get_current_owner_user,
    get_current_tenant_user,
    get_current_user,
    get_org_scoped_context,
)
from app.database.client import get_supabase, get_supabase_admin
from app.exceptions import (
    register_custom_exception_handlers,
    register_exception_handlers,
)
from app.models.enums import UserRole
from app.models.tenant import TenantUser
from app.models.user import User

# ============================================================================
# Entitlement / paywall default
# ============================================================================

# Bound names through which ``has_full_access`` is reached at call time. The
# card-less-trial paywall gates nearly every mutating endpoint; tests that are
# not specifically about the paywall should not have to seed a subscription row.
_HAS_FULL_ACCESS_TARGETS = (
    "app.services.billing.entitlements.has_full_access",
    "app.api.v1.export.has_full_access",
    "app.api.v1.reconciliation.has_full_access",
)


@pytest.fixture(autouse=True)
def grant_full_access_by_default(request) -> Generator[None, None, None]:
    """Default every test to a full-access subscription.

    ``require_full_access`` (lazy-imports ``entitlements.has_full_access``) and
    the direct gates in export/reconciliation block mutating endpoints when the
    org lacks full access. Patching the three bound names to return ``True`` lets
    the thousands of endpoint tests run without seeding billing state.

    Opt out with ``@pytest.mark.real_entitlements`` (per-test or file-level
    ``pytestmark``) to exercise the real gate — used by the paywall, entitlement,
    and credit-pack suites.
    """
    if request.node.get_closest_marker("real_entitlements"):
        yield
        return
    patchers = [patch(target, lambda ctx: True) for target in _HAS_FULL_ACCESS_TARGETS]
    for patcher in patchers:
        patcher.start()
    try:
        yield
    finally:
        for patcher in patchers:
            patcher.stop()


# ============================================================================
# Test Environment Configuration
# ============================================================================


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment(monkeypatch_session):
    """Set up test environment variables for all tests."""
    import os

    # Set Stripe test credentials
    os.environ["STRIPE_SECRET_KEY"] = "sk_test_mock"
    os.environ["STRIPE_PUBLISHABLE_KEY"] = "pk_test_mock"
    os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_test_mock"
    os.environ["STRIPE_PRICE_ID_GROWTH_ANNUAL"] = "price_growth_annual_test"


@pytest.fixture(autouse=True)
def block_resend_api_calls(request, monkeypatch) -> Generator[None, None, None]:
    """Prevent automated tests from sending or cancelling real Resend emails."""
    if request.node.get_closest_marker("resend_live"):
        if os.getenv("RUN_RESEND_LIVE_TEST") != "1":
            pytest.skip("Set RUN_RESEND_LIVE_TEST=1 to run manual Resend smoke tests")
        yield
        return

    def blocked_resend_call(*_args, **_kwargs):
        raise AssertionError(
            "Automated tests must not call Resend directly. Mock "
            "resend.Emails.send/cancel, or mark a manual smoke test with "
            "@pytest.mark.resend_live and RUN_RESEND_LIVE_TEST=1."
        )

    monkeypatch.setattr("resend.Emails.send", blocked_resend_call)
    monkeypatch.setattr("resend.Emails.cancel", blocked_resend_call)
    yield


@pytest.fixture(autouse=True)
def reset_circuit_breakers() -> Generator[None, None, None]:
    """Reset all circuit breakers to closed state before each test.

    Circuit breakers are module-level singletons. Without this fixture, a test
    that forces a breaker open (e.g. by simulating fail_max errors) would leave
    it open for all subsequent tests in the session, causing spurious failures.
    """
    from app.core.circuit_breakers import (
        openrouter_breaker,
        resend_breaker,
        s3_breaker,
        stripe_breaker,
    )

    breakers = [
        stripe_breaker,
        openrouter_breaker,
        s3_breaker,
        resend_breaker,
    ]
    for breaker in breakers:
        breaker.close()
    yield
    for breaker in breakers:
        breaker.close()


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> Generator[None, None, None]:
    """Reset the rate limiter storage before each test.

    The MemoryStorage and MovingWindowRateLimiter are module-level singletons.
    Without this fixture, request counts accumulate across tests and tests that
    share the same key (e.g., ip:testclient) would hit the rate limit after
    just 20 requests, causing spurious 429 failures throughout the suite.
    """
    from limits.storage import MemoryStorage
    from limits.strategies import MovingWindowRateLimiter

    import app.middleware.rate_limit as rl_mw

    # Replace the module-level name the middleware uses so each test
    # starts with a fresh, empty moving window (no accumulated counts).
    rl_mw.moving_window = MovingWindowRateLimiter(MemoryStorage())
    yield
    rl_mw.moving_window = MovingWindowRateLimiter(MemoryStorage())


@pytest.fixture(scope="session")
def monkeypatch_session():
    """Session-scoped monkeypatch for setting environment variables."""
    from _pytest.monkeypatch import MonkeyPatch

    mpatch = MonkeyPatch()
    yield mpatch
    mpatch.undo()


# ============================================================================
# Constants for test data
# ============================================================================

# Organization A test data
ORG_A_ID = UUID("11111111-1111-1111-1111-111111111111")
ORG_A_USER_ID = UUID("aaaa1111-1111-1111-1111-111111111111")
ORG_A_PROPERTY_ID = UUID("aaaa2222-2222-2222-2222-222222222222")

# Organization B test data
ORG_B_ID = UUID("22222222-2222-2222-2222-222222222222")
ORG_B_USER_ID = UUID("bbbb1111-1111-1111-1111-111111111111")
ORG_B_PROPERTY_ID = UUID("bbbb2222-2222-2222-2222-222222222222")

# Tenant user test data
TENANT_USER_ID = UUID("eeee1111-1111-1111-1111-111111111111")
TENANT_PROFILE_ID = UUID("eeee2222-2222-2222-2222-222222222222")


# ============================================================================
# User factory functions
# ============================================================================


def create_test_user(
    user_id: UUID | None = None,
    org_id: UUID | None = None,
    email: str = "test@example.com",
    full_name: str = "Test User",
    role: str | UserRole = UserRole.MEMBER,
    is_platform_admin: bool = False,
) -> User:
    """Create a test user with specified parameters.

    Args:
        user_id: User UUID (defaults to random)
        org_id: Organization UUID (defaults to random)
        email: User email
        full_name: User full name
        role: User role (member, admin, owner, viewer)
        is_platform_admin: Platform-level admin flag (defaults to False)

    Returns:
        User model instance
    """
    return User(
        id=user_id or uuid4(),
        organization_id=org_id or uuid4(),
        email=email,
        full_name=full_name,
        role=role if isinstance(role, UserRole) else UserRole(role),
        is_platform_admin=is_platform_admin,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def create_org_a_user(role: str | UserRole = UserRole.MEMBER) -> User:
    """Create a user for Organization A."""
    return create_test_user(
        user_id=ORG_A_USER_ID,
        org_id=ORG_A_ID,
        email="user@org-a.com",
        full_name="Org A User",
        role=role,
    )


def create_org_b_user(role: str | UserRole = UserRole.MEMBER) -> User:
    """Create a user for Organization B."""
    return create_test_user(
        user_id=ORG_B_USER_ID,
        org_id=ORG_B_ID,
        email="user@org-b.com",
        full_name="Org B User",
        role=role,
    )


# ============================================================================
# Mock Supabase Response Classes
# ============================================================================


class MockSupabaseResponse:
    """Mock Supabase response object.

    Supports both sync and async usage:
    - Sync: result = query.execute(); data = result.data
    - Async: result = await query.execute(); data = result.data
    """

    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count

    def __await__(self):
        """Make this response awaitable for async contexts."""

        async def _awaitable():
            return self

        return _awaitable().__await__()


class MockQueryBuilder:
    """Mock Supabase query builder for chaining with filtering support."""

    def __init__(self, data=None, count=None):
        self._original_data = data
        self._data = data if data is not None else []
        self._count = count
        self._is_single = False
        self._filters = []  # Store filter conditions
        self._range_start = None
        self._range_end = None
        self._count_enabled = False
        self._update_data = None  # Track update data for stateful updates
        self._insert_data = None  # Track insert data

    def select(self, *args, **kwargs):
        if "count" in kwargs:
            self._count_enabled = True
        return self

    def insert(self, data):
        """Store data to be inserted."""
        self._insert_data = data
        return self

    def update(self, data):
        self._update_data = data
        return self

    def delete(self):
        return self

    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def neq(self, column, value):
        self._filters.append(("neq", column, value))
        return self

    def is_(self, column, value):
        """Filter for NULL/NOT NULL values (e.g., is_("used_at", "null"))."""
        self._filters.append(("is", column, value))
        return self

    def gt(self, column, value):
        self._filters.append(("gt", column, value))
        return self

    def gte(self, column, value):
        self._filters.append(("gte", column, value))
        return self

    def lt(self, column, value):
        self._filters.append(("lt", column, value))
        return self

    def lte(self, column, value):
        self._filters.append(("lte", column, value))
        return self

    def in_(self, column, values):
        self._filters.append(("in", column, values))
        return self

    def range(self, start, end):
        self._range_start = start
        self._range_end = end
        return self

    def order(self, column, **kwargs):
        return self

    def single(self):
        self._is_single = True
        return self

    def maybe_single(self):
        self._is_single = True
        return self

    def limit(self, count):
        """Limit number of results returned."""
        self._limit = count
        return self

    def _apply_filters(self, data):
        """Apply filter conditions to data."""
        if not isinstance(data, list):
            return data

        filtered = data
        for op, column, value in self._filters:
            if op == "eq":
                filtered = [row for row in filtered if row.get(column) == value]
            elif op == "neq":
                filtered = [row for row in filtered if row.get(column) != value]
            elif op == "gt":
                filtered = [row for row in filtered if row.get(column, 0) > value]
            elif op == "gte":
                filtered = [row for row in filtered if row.get(column, 0) >= value]
            elif op == "lt":
                filtered = [row for row in filtered if row.get(column, 0) < value]
            elif op == "lte":
                filtered = [row for row in filtered if row.get(column, 0) <= value]
            elif op == "in":
                filtered = [row for row in filtered if row.get(column) in value]

        return filtered

    def execute(
        self,
    ):  # Must be sync to work with both sync tests and async service code
        # Handle insert operations
        if self._insert_data is not None:
            from datetime import UTC, datetime
            from uuid import uuid4

            # Ensure original_data is a list
            if self._original_data is None:
                self._original_data = []
            elif not isinstance(self._original_data, list):
                self._original_data = [self._original_data]

            # Helper function to add auto-generated fields
            def add_auto_fields(data_dict):
                """Add database auto-generated fields if missing."""
                if "id" not in data_dict:
                    data_dict["id"] = str(uuid4())
                if "created_at" not in data_dict:
                    data_dict["created_at"] = datetime.now(UTC).isoformat()
                if "updated_at" not in data_dict:
                    data_dict["updated_at"] = datetime.now(UTC).isoformat()
                return data_dict

            # Append insert data to shared list reference
            if isinstance(self._insert_data, list):
                # Add auto-generated fields to each item
                processed_data = [
                    add_auto_fields(dict(item)) for item in self._insert_data
                ]
                self._original_data.extend(processed_data)
                return MockSupabaseResponse(processed_data, None)
            else:
                # Add auto-generated fields to single item
                processed_data = add_auto_fields(dict(self._insert_data))
                self._original_data.append(processed_data)
                return MockSupabaseResponse([processed_data], None)

        # Start with original data
        data = self._original_data if self._original_data is not None else []

        # Apply filters
        if isinstance(data, list):
            data = self._apply_filters(data)

        # Apply updates if this is an update operation
        if self._update_data is not None and isinstance(self._original_data, list):
            # Collect rows that match filters and update them
            updated_rows = []
            for row in self._original_data:
                # Check if this row matches the filters
                matches = True
                for op, column, value in self._filters:
                    if op == "eq" and row.get(column) != value:
                        matches = False
                        break
                    elif op == "in" and row.get(column) not in value:
                        matches = False
                        break
                if matches:
                    # Apply the update
                    row.update(self._update_data)
                    # Track updated rows (BEFORE filters change due to update)
                    updated_rows.append(row)
            # Return updated rows, not re-filtered data
            # (filters may no longer match after update, e.g., status changed)
            data = updated_rows

        # Calculate count before pagination
        if self._count_enabled and self._count is None:
            self._count = len(data) if isinstance(data, list) else (1 if data else 0)

        # Apply pagination
        if self._range_start is not None and isinstance(data, list):
            end = self._range_end + 1 if self._range_end is not None else len(data)
            data = data[self._range_start : end]

        # Apply limit
        if (
            hasattr(self, "_limit")
            and self._limit is not None
            and isinstance(data, list)
        ):
            data = data[: self._limit]

        # Handle single mode
        if self._is_single:
            if data is None:
                return MockSupabaseResponse(None, self._count)
            if isinstance(data, list):
                if len(data) > 0:
                    return MockSupabaseResponse(data[0], self._count)
                return MockSupabaseResponse(None, self._count)
            return MockSupabaseResponse(data, self._count)

        return MockSupabaseResponse(data, self._count)


def create_multi_table_mock(table_data_map: dict):
    """Create a mock table function that returns different data per table.

    Args:
        table_data_map: {"table_name": [data_rows]}

    Returns:
        Function that returns MockQueryBuilder with appropriate data

    Example:
        mock.table.side_effect = create_multi_table_mock({
            "properties": [{"id": "prop-1"}],
            "calculation_jobs": [{"id": "job-1", "status": "pending"}]
        })
    """

    def mock_table(table_name):
        data = table_data_map.get(table_name, [])
        return MockQueryBuilder(data=data)

    return mock_table


# ============================================================================
# App Factory
# ============================================================================


def create_test_app() -> FastAPI:
    """Create a FastAPI test application with all routers and handlers.

    Returns:
        Configured FastAPI application for testing
    """
    from app.api.routes import webhooks_router

    app = FastAPI()
    app.include_router(api_v1_router, prefix="/api/v1")
    app.include_router(webhooks_router)  # Root level, no prefix
    register_custom_exception_handlers(app)
    register_exception_handlers(app)
    return app


# ============================================================================
# Fixtures - Basic Client
# ============================================================================


@pytest.fixture
def base_client() -> Generator[TestClient, None, None]:
    """Create a test client without any auth overrides.

    Use this for testing unauthenticated requests.
    """
    app = create_test_app()
    with TestClient(app) as client:
        yield client


# ============================================================================
# Fixtures - Authenticated Clients
# ============================================================================


@pytest.fixture
def mock_supabase_client():
    """Create a mock Supabase client for testing."""
    mock = MagicMock()
    # Attach _test_data as a REAL dict, not a MagicMock
    # This is critical for the shared list references to work
    object.__setattr__(mock, "_test_data", {})

    # Configure table() to return MockQueryBuilder with empty data by default
    # This prevents MagicMock comparison errors in tests
    def mock_table(table_name: str):
        # Return empty MockQueryBuilder for any table
        # Tests can override this by adding data to _test_data
        if hasattr(mock, "_test_data") and table_name in mock._test_data:
            return MockQueryBuilder(data=mock._test_data[table_name])
        return MockQueryBuilder(data=[])

    mock.table.side_effect = mock_table

    return mock


@pytest.fixture
def override_get_supabase_admin(mock_supabase_client):
    """Override get_supabase_admin to return mock client with table() configured."""

    def configure_mock_table_responses(table_name):
        """Return MockQueryBuilder with shared reference to test data."""
        # Initialize _test_data if not present
        if not hasattr(mock_supabase_client, "_test_data"):
            mock_supabase_client._test_data = {}

        # Initialize table data if not present (IMPORTANT: use same list reference)
        if table_name not in mock_supabase_client._test_data:
            mock_supabase_client._test_data[table_name] = []

        # Return MockQueryBuilder with SHARED REFERENCE to the list
        # This ensures inserts persist across table() calls
        return MockQueryBuilder(data=mock_supabase_client._test_data[table_name])

    # Configure the mock to return MockQueryBuilder for any table() call
    mock_supabase_client.table.side_effect = configure_mock_table_responses

    def mock_get_admin():
        return mock_supabase_client

    return mock_get_admin


@pytest.fixture
def seed_organization(mock_supabase_client):
    """Seed the test organization in the mock database."""
    org_data = {
        "id": str(ORG_A_ID),
        "name": "Test Organization A",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    # Store organization data for later access
    if not hasattr(mock_supabase_client, "_test_data"):
        mock_supabase_client._test_data = {}
    mock_supabase_client._test_data["organizations"] = [org_data]

    return org_data


@pytest.fixture
def seed_properties(mock_supabase_client, seed_organization):
    """Seed test properties for ingestion tests."""
    properties = [
        {
            "id": str(ORG_A_PROPERTY_ID),
            "organization_id": str(ORG_A_ID),
            "name": "Test Property 1",
            "address": "123 Main St",
            "city": "San Francisco",
            "state": "CA",
            "zip_code": "94105",
            "rentable_area": 100000.0,
            "usable_area": 85000.0,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
    ]

    # Store properties for later access
    if not hasattr(mock_supabase_client, "_test_data"):
        mock_supabase_client._test_data = {}
    mock_supabase_client._test_data["properties"] = properties
    mock_supabase_client._test_data["import_batches"] = []
    mock_supabase_client._test_data["gl_entries"] = []

    return properties


@pytest.fixture
def org_a_member_client(
    mock_supabase_client,
) -> Generator[TestClient, None, None]:
    """Create a test client authenticated as Org A member.

    Returns a client that:
    - Is authenticated as a member of Organization A
    - Has access to Org A resources only
    - Uses standard mock Supabase client (table.return_value works)
    """

    app = create_test_app()
    user = create_org_a_user(role=UserRole.MEMBER)
    mock_supabase = mock_supabase_client

    # Create separate mock admin client for storage operations
    mock_supabase_admin = MagicMock()
    object.__setattr__(mock_supabase_admin, "_test_data", {})

    async def mock_get_user():
        return user

    async def mock_get_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=user.organization_id,
            user=user,
        )

    def mock_get_admin_not_allowed():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    # Override dependencies
    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_org_scoped_context] = mock_get_org_context
    app.dependency_overrides[get_current_admin_user] = mock_get_admin_not_allowed
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase_admin

    with TestClient(app) as client:
        client.mock_supabase = mock_supabase
        client.mock_supabase_admin = mock_supabase_admin
        client.user = user
        yield client

    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture
def org_a_admin_client(
    mock_supabase_client,
) -> Generator[TestClient, None, None]:
    """Create a test client authenticated as Org A admin.

    Returns a client that:
    - Is authenticated as an admin of Organization A
    - Has access to Org A resources and admin endpoints
    - Uses standard mock Supabase client (table.return_value works)
    """

    app = create_test_app()
    user = create_org_a_user(role=UserRole.ADMIN)
    mock_supabase = mock_supabase_client

    async def mock_get_user():
        return user

    async def mock_get_admin_user():
        return user

    async def mock_get_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=user.organization_id,
            user=user,
        )

    # Override dependencies
    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_org_scoped_context] = mock_get_org_context
    app.dependency_overrides[get_current_admin_user] = mock_get_admin_user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase

    with TestClient(app) as client:
        client.mock_supabase = mock_supabase
        client.user = user
        yield client

    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture
def org_a_owner_client(
    mock_supabase_client,
) -> Generator[TestClient, None, None]:
    """Create a test client authenticated as Org A owner."""

    app = create_test_app()
    user = create_org_a_user(role=UserRole.OWNER)
    mock_supabase = mock_supabase_client

    async def mock_get_user():
        return user

    async def mock_get_admin_user():
        return user

    async def mock_get_owner_user():
        return user

    async def mock_get_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=user.organization_id,
            user=user,
        )

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_org_scoped_context] = mock_get_org_context
    app.dependency_overrides[get_current_admin_user] = mock_get_admin_user
    app.dependency_overrides[get_current_owner_user] = mock_get_owner_user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase

    with TestClient(app) as client:
        client.mock_supabase = mock_supabase
        client.user = user
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
def ingestion_client(
    mock_supabase_client,
    override_get_supabase_admin,
    seed_organization,
    seed_properties,
) -> Generator[TestClient, None, None]:
    """Create a test client for ingestion tests with full database mocking.

    Returns a client that:
    - Is authenticated as a member of Organization A
    - Has mocked admin database access for ingestion operations
    - Has seeded organization and property data
    - Uses side_effect for table routing (NOT compatible with return_value)
    """
    from unittest.mock import patch

    from app.database.client import get_supabase_admin

    app = create_test_app()
    user = create_org_a_user(role=UserRole.MEMBER)
    mock_supabase = mock_supabase_client

    async def mock_get_user():
        return user

    async def mock_get_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=user.organization_id,
            user=user,
        )

    def mock_get_admin_not_allowed():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    # Override dependencies
    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_org_scoped_context] = mock_get_org_context
    app.dependency_overrides[get_current_admin_user] = mock_get_admin_not_allowed
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_supabase_admin] = override_get_supabase_admin

    # Create a replacement function for get_supabase_admin
    def mock_admin():
        return mock_supabase

    # Patch all direct imports of get_supabase_admin in ingestion modules
    # This is necessary because these modules call get_supabase_admin() directly
    # instead of using dependency injection
    # Use 'new' to replace the function entirely
    with (
        patch("app.services.ingestion.batch.get_supabase_admin", new=mock_admin),
        patch("app.services.ingestion.persistence.get_supabase_admin", new=mock_admin),
    ):

        with TestClient(app) as client:
            client.mock_supabase = mock_supabase
            client.user = user
            yield client

    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture
def org_b_member_client() -> Generator[TestClient, None, None]:
    """Create a test client authenticated as Org B member.

    Returns a client that:
    - Is authenticated as a member of Organization B
    - Has access to Org B resources only
    - Cannot access admin-only endpoints
    """
    app = create_test_app()
    user = create_org_b_user(role=UserRole.MEMBER)
    mock_supabase = MagicMock()

    async def mock_get_user():
        return user

    async def mock_get_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=user.organization_id,
            user=user,
        )

    def mock_get_admin():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_org_scoped_context] = mock_get_org_context
    app.dependency_overrides[get_current_admin_user] = mock_get_admin
    app.dependency_overrides[get_supabase] = lambda: mock_supabase

    with TestClient(app) as client:
        client.mock_supabase = mock_supabase
        client.user = user
        yield client


@pytest.fixture
def tenant_client() -> Generator[TestClient, None, None]:
    """Create a test client authenticated as a tenant user.

    Returns a client that:
    - Is authenticated as a tenant user
    - Has access to tenant portal endpoints only
    - Cannot access landlord/admin endpoints
    """
    app = create_test_app()
    mock_supabase = MagicMock()

    # Create tenant user profile
    tenant_user = TenantUser(
        id=TENANT_PROFILE_ID,
        user_id=TENANT_USER_ID,
        organization_id=ORG_A_ID,
        contact_name="Test Tenant",
        contact_email="tenant@test.com",
        created_at=datetime.now(UTC),
    )

    async def mock_get_tenant_user():
        return tenant_user

    app.dependency_overrides[get_current_tenant_user] = mock_get_tenant_user
    app.dependency_overrides[get_supabase] = lambda: mock_supabase

    with TestClient(app) as client:
        client.mock_supabase = mock_supabase
        client.tenant_user = tenant_user
        yield client


# ============================================================================
# Fixtures - Sample Data
# ============================================================================


@pytest.fixture
def org_a_property() -> dict:
    """Create sample property data for Organization A."""
    return {
        "id": str(ORG_A_PROPERTY_ID),
        "organization_id": str(ORG_A_ID),
        "name": "Org A Building",
        "address_line1": "100 Main St",
        "address_line2": None,
        "city": "San Francisco",
        "state": "CA",
        "postal_code": "94102",
        "total_rentable_sqft": "10000.00",
        "total_usable_sqft": "8500.00",
        "common_area_sqft": "1500.00",
        "target_occupancy": "0.95",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


@pytest.fixture
def org_b_property() -> dict:
    """Create sample property data for Organization B."""
    return {
        "id": str(ORG_B_PROPERTY_ID),
        "organization_id": str(ORG_B_ID),
        "name": "Org B Building",
        "address_line1": "200 Market St",
        "address_line2": None,
        "city": "Los Angeles",
        "state": "CA",
        "postal_code": "90001",
        "total_rentable_sqft": "15000.00",
        "total_usable_sqft": "12000.00",
        "common_area_sqft": "3000.00",
        "target_occupancy": "0.95",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


# ============================================================================
# Billing Test Fixtures
# ============================================================================


@pytest.fixture
def stripe_test_settings():
    """Stripe test mode configuration for billing tests."""
    from app.services.billing.config import StripeSettings

    return StripeSettings(
        stripe_secret_key="sk_test_mock",
        stripe_publishable_key="pk_test_mock",
        stripe_webhook_secret="whsec_test_mock",
        stripe_price_id_growth_annual="price_growth_annual_test",
    )


@pytest.fixture
def mock_stripe_service(stripe_test_settings):
    """Mock Stripe service for billing integration tests.

    Yields a StripeService instance with exposed Stripe SDK mocks.
    Tests can access the mocks via service.mock_customer, service.mock_subscription, etc.
    """
    from unittest.mock import patch

    import stripe as stripe_module

    from app.services.billing.stripe_client import StripeService

    # Configure stripe with test settings (mimic get_stripe_client behavior)
    stripe_module.api_key = stripe_test_settings.stripe_secret_key
    stripe_module.api_version = "2023-10-16"

    # Mock Stripe SDK calls
    with (
        patch("stripe.Customer") as mock_customer,
        patch("stripe.Subscription") as mock_sub,
        patch("stripe.checkout.Session") as mock_session,
        patch(
            "app.services.billing.stripe_client.get_stripe_client",
            return_value=stripe_module,
        ),
    ):
        service = StripeService()

        # Set up default mock returns
        mock_customer.create.return_value = MagicMock(id="cus_test123")
        mock_sub.create.return_value = MagicMock(
            id="sub_test123",
            status="active",
            current_period_start=1704067200,
            current_period_end=1706745600,
        )
        mock_session.create.return_value = MagicMock(
            id="cs_test123",
            url="https://checkout.stripe.com/test",
        )

        # Expose mocks on service for test access
        service.mock_customer = mock_customer
        service.mock_subscription = mock_sub
        service.mock_session = mock_session

        yield service


@pytest.fixture
def sample_webhook_payload():
    """Factory for creating Stripe webhook event payloads."""

    def _create(event_type: str, data: dict):
        return {
            "id": f"evt_test_{event_type.replace('.', '_')}",
            "type": event_type,
            "data": {"object": data},
        }

    return _create


@pytest.fixture
def seed_invoices(org_a_member_client):
    """Seed 3 test invoices (2 paid, 1 open) for Organization A."""
    from datetime import UTC, datetime
    from uuid import uuid4

    invoices = [
        {
            "id": str(uuid4()),
            "stripe_invoice_id": "in_test_paid_1",
            "organization_id": str(ORG_A_ID),
            "amount_due": 9900,
            "amount_paid": 9900,
            "currency": "usd",
            "status": "paid",
            "pdf_url": "https://stripe.com/invoices/paid_1.pdf",
            "created_at": datetime.now(UTC).isoformat(),
        },
        {
            "id": str(uuid4()),
            "stripe_invoice_id": "in_test_paid_2",
            "organization_id": str(ORG_A_ID),
            "amount_due": 19900,
            "amount_paid": 19900,
            "currency": "usd",
            "status": "paid",
            "pdf_url": "https://stripe.com/invoices/paid_2.pdf",
            "created_at": datetime.now(UTC).isoformat(),
        },
        {
            "id": str(uuid4()),
            "stripe_invoice_id": "in_test_open_1",
            "organization_id": str(ORG_A_ID),
            "amount_due": 9900,
            "amount_paid": 0,
            "currency": "usd",
            "status": "open",
            "pdf_url": None,
            "created_at": datetime.now(UTC).isoformat(),
        },
    ]

    # Initialize shared state
    if not hasattr(org_a_member_client.mock_supabase, "_test_data"):
        org_a_member_client.mock_supabase._test_data = {}

    org_a_member_client.mock_supabase._test_data["invoices"] = invoices

    # Mock Supabase table to return these invoices
    org_a_member_client.mock_supabase.table.return_value = MockQueryBuilder(
        data=invoices
    )

    return invoices


@pytest.fixture
def seed_many_invoices(org_a_member_client):
    """Seed 25 test invoices for pagination testing."""
    from datetime import UTC, datetime
    from uuid import uuid4

    invoices = []
    for i in range(25):
        invoices.append(
            {
                "id": str(uuid4()),
                "stripe_invoice_id": f"in_test_page_{i+1}",
                "organization_id": str(ORG_A_ID),
                "amount_due": 9900,
                "amount_paid": 9900 if i % 2 == 0 else 0,
                "currency": "usd",
                "status": "paid" if i % 2 == 0 else "open",
                "pdf_url": (
                    f"https://stripe.com/invoices/page_{i+1}.pdf"
                    if i % 2 == 0
                    else None
                ),
                "created_at": datetime.now(UTC).isoformat(),
            }
        )

    # Initialize shared state
    if not hasattr(org_a_member_client.mock_supabase, "_test_data"):
        org_a_member_client.mock_supabase._test_data = {}

    org_a_member_client.mock_supabase._test_data["invoices"] = invoices

    return invoices


@pytest.fixture
def seed_invoice_with_pdf(org_a_member_client):
    """Seed a single test invoice with PDF URL."""
    from datetime import UTC, datetime
    from uuid import uuid4

    invoice = {
        "id": str(uuid4()),
        "stripe_invoice_id": "in_test_with_pdf",
        "organization_id": str(ORG_A_ID),
        "amount_due": 9900,
        "amount_paid": 9900,
        "currency": "usd",
        "status": "paid",
        "pdf_url": "https://stripe.com/invoices/test_with_pdf.pdf",
        "created_at": datetime.now(UTC).isoformat(),
    }

    # Initialize shared state
    if not hasattr(org_a_member_client.mock_supabase, "_test_data"):
        org_a_member_client.mock_supabase._test_data = {}

    org_a_member_client.mock_supabase._test_data["invoices"] = [invoice]

    return invoice


@pytest.fixture
def seed_subscription(org_a_member_client):
    """Seed an active subscription for Organization A."""
    import time
    from datetime import UTC, datetime
    from uuid import uuid4

    subscription = {
        "id": str(uuid4()),
        "organization_id": str(ORG_A_ID),
        "stripe_subscription_id": "sub_test123",
        "stripe_customer_id": "cus_test123",
        "status": "active",
        "plan": "growth",
        "current_period_start": datetime.fromtimestamp(time.time(), UTC).isoformat(),
        "current_period_end": datetime.fromtimestamp(
            time.time() + 2592000, UTC
        ).isoformat(),
        "cancel_at_period_end": False,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    # Initialize shared state
    if not hasattr(org_a_member_client.mock_supabase, "_test_data"):
        org_a_member_client.mock_supabase._test_data = {}

    org_a_member_client.mock_supabase._test_data["subscriptions"] = [subscription]

    # Mock Supabase table to return this subscription
    org_a_member_client.mock_supabase.table.return_value = MockQueryBuilder(
        data=[subscription]
    )

    return subscription


@pytest.fixture
def seed_subscription_canceling(org_a_member_client):
    """Seed a subscription that is scheduled for cancellation."""
    import time
    from datetime import UTC, datetime
    from uuid import uuid4

    subscription = {
        "id": str(uuid4()),
        "organization_id": str(ORG_A_ID),
        "stripe_subscription_id": "sub_cancel123",
        "stripe_customer_id": "cus_test_123",
        "status": "active",
        "plan": "growth",
        "current_period_start": datetime.fromtimestamp(time.time(), UTC).isoformat(),
        "current_period_end": datetime.fromtimestamp(
            time.time() + 2592000, UTC
        ).isoformat(),
        "cancel_at_period_end": True,  # Scheduled for cancellation
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    # Mock Supabase table to return this subscription
    org_a_member_client.mock_supabase.table.return_value = MockQueryBuilder(
        data=[subscription]
    )

    return subscription


# ============================================================================
# Reconciliation Test Fixtures
# ============================================================================


@pytest.fixture
def sample_lease_data() -> dict:
    """Create sample lease data for reconciliation tests."""
    return {
        "id": str(uuid4()),
        "organization_id": str(ORG_A_ID),
        "property_id": str(ORG_A_PROPERTY_ID),
        "unit_id": str(uuid4()),
        "tenant_name": "Sample Tenant LLC",
        "start_date": "2024-01-01",
        "end_date": "2026-12-31",
        "status": "active",
        "rentable_sqft": "2500.00",
        "usable_sqft": "2250.00",
        "recovery_profile": {
            "base_year": 2023,
            "pro_rata_share": "0.25",
            "admin_fee_percent": "0.15",
            "gross_up_target": "0.95",
            "cap_type": "cumulative",
            "cap_rate": "0.03",
        },
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


@pytest.fixture
def sample_snapshot_data() -> dict:
    """Create sample reconciliation snapshot data for tests."""
    return {
        "id": str(uuid4()),
        "organization_id": str(ORG_A_ID),
        "property_id": str(ORG_A_PROPERTY_ID),
        "lease_id": str(uuid4()),
        "period_start_date": "2024-01-01",
        "period_end_date": "2024-12-31",
        "status": "draft",
        # Required calculated financial values
        "total_operating_expenses": "150000.00",
        "grossed_up_expenses": "157895.00",
        "base_year_amount": "140000.00",
        "tenant_share_before_cap": "39473.75",
        "tenant_share_after_cap": "38289.54",
        "admin_fee": "5743.43",
        "total_recovery": "44032.97",
        # Calculation trace as list of dicts
        "calculation_trace": [
            {
                "step_number": 1,
                "description": "Loaded operating expenses",
                "result": "150000.00",
            },
            {
                "step_number": 2,
                "description": "Applied gross-up factor",
                "result": "157895.00",
            },
            {
                "step_number": 3,
                "description": "Calculated tenant share",
                "result": "39473.75",
            },
            {
                "step_number": 4,
                "description": "Applied cumulative cap",
                "result": "38289.54",
            },
            {
                "step_number": 5,
                "description": "Added admin fee",
                "result": "44032.97",
            },
        ],
        # Finalization tracking
        "finalized_at": None,
        "finalized_by_user_id": None,
        # Timestamps
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


@pytest.fixture
def sample_calculation_job_data() -> dict:
    """Create sample calculation job data for tests."""
    return {
        "id": str(uuid4()),
        "organization_id": str(ORG_A_ID),
        "property_id": str(ORG_A_PROPERTY_ID),
        "period_start": "2024-01-01",
        "period_end": "2024-12-31",
        "status": "completed",
        "started_at": datetime.now(UTC).isoformat(),
        "completed_at": datetime.now(UTC).isoformat(),
        "error_message": None,
        "total_leases": 3,
        "processed_leases": 3,
        "snapshot_ids": [],
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


@pytest.fixture
def sample_prior_snapshot_data(sample_snapshot_data) -> dict:
    """Create sample prior year snapshot for variance testing."""
    prior_snapshot = sample_snapshot_data.copy()
    prior_snapshot["id"] = str(uuid4())
    prior_snapshot["period_start_date"] = "2023-01-01"
    prior_snapshot["period_end_date"] = "2023-12-31"
    prior_snapshot["total_operating_expenses"] = "140000.00"
    prior_snapshot["base_year_amount"] = "130000.00"
    prior_snapshot["grossed_up_expenses"] = "147368.00"
    prior_snapshot["tenant_share_before_cap"] = "36842.00"
    prior_snapshot["tenant_share_after_cap"] = "35789.00"
    prior_snapshot["admin_fee"] = "5368.35"
    prior_snapshot["total_recovery"] = "41157.35"
    prior_snapshot["status"] = "finalized"
    prior_snapshot["finalized_at"] = datetime.now(UTC).isoformat()
    prior_snapshot["finalized_by_user_id"] = str(ORG_A_USER_ID)
    return prior_snapshot


# ============================================================================
# Dispute Service Test Fixtures
# ============================================================================


@pytest.fixture
def sample_dispute_data() -> dict:
    """Create minimal valid dispute data for testing.

    Returns a dispute dict with required fields for creation tests.
    """
    return {
        "tenant_user_id": str(uuid4()),
        "statement_id": str(uuid4()),
        "category": "calculation_error",
        "description": "The total expenses don't match the GL entries",
        "organization_id": str(ORG_A_ID),
    }


@pytest.fixture
def sample_tenant_user_data() -> dict:
    """Create sample tenant user data for dispute tests."""
    return {
        "id": str(uuid4()),
        "user_id": str(uuid4()),
        "contact_name": "John Tenant",
        "contact_email": "john@tenant.com",
        "created_at": datetime.now(UTC).isoformat(),
    }


# ============================================================================
# Import Batch Test Fixtures
# ============================================================================


@pytest.fixture
def sample_import_batches() -> list[dict]:
    """Create sample import batches for property imports testing."""
    from datetime import timedelta

    now = datetime.now(UTC)

    return [
        {
            "id": str(uuid4()),
            "organization_id": str(ORG_A_ID),
            "property_id": str(ORG_A_PROPERTY_ID),
            "filename": "yardi_export_2024_q1.csv",
            "status": "completed",
            "parser_type": "yardi",
            "rows_processed": 1547,
            "rows_imported": 1547,
            "rows_failed": 0,
            "created_at": (now - timedelta(days=7)).isoformat(),
            "completed_at": (now - timedelta(days=7)).isoformat(),
            "error_message": None,
        },
        {
            "id": str(uuid4()),
            "organization_id": str(ORG_A_ID),
            "property_id": str(ORG_A_PROPERTY_ID),
            "filename": "mri_rent_roll_march.xlsx",
            "status": "completed",
            "parser_type": "mri",
            "rows_processed": 842,
            "rows_imported": 842,
            "rows_failed": 0,
            "created_at": (now - timedelta(days=14)).isoformat(),
            "completed_at": (now - timedelta(days=14)).isoformat(),
            "error_message": None,
        },
        {
            "id": str(uuid4()),
            "organization_id": str(ORG_A_ID),
            "property_id": str(ORG_A_PROPERTY_ID),
            "filename": "custom_gl_export.csv",
            "status": "failed",
            "parser_type": "generic",
            "rows_processed": 500,
            "rows_imported": 0,
            "rows_failed": 500,
            "created_at": (now - timedelta(days=21)).isoformat(),
            "completed_at": (now - timedelta(days=21)).isoformat(),
            "error_message": "Invalid column mapping: missing required field 'account_number'",
        },
    ]


@pytest.fixture
def many_import_batches() -> list[dict]:
    """Create 25 import batches for pagination testing."""
    from datetime import timedelta

    now = datetime.now(UTC)
    batches = []

    for i in range(25):
        batches.append(
            {
                "id": str(uuid4()),
                "organization_id": str(ORG_A_ID),
                "property_id": str(ORG_A_PROPERTY_ID),
                "filename": f"import_batch_{i+1}.csv",
                "status": "completed" if i % 3 != 0 else "failed",
                "parser_type": "yardi" if i % 2 == 0 else "mri",
                "rows_processed": 1000 + (i * 10),
                "rows_imported": 1000 + (i * 10) if i % 3 != 0 else 0,
                "rows_failed": 0 if i % 3 != 0 else 1000 + (i * 10),
                "created_at": (now - timedelta(days=i)).isoformat(),
                "completed_at": (now - timedelta(days=i)).isoformat(),
                "error_message": None if i % 3 != 0 else "Parser error",
            }
        )

    return batches


# ============================================================================
# Email Service Test Fixtures
# ============================================================================


@pytest.fixture
def mock_resend_service():
    """Mock Resend email service for unit tests.

    Returns a mock service with pre-configured success responses.
    Tests can override specific methods as needed.
    """
    from unittest.mock import AsyncMock

    service = AsyncMock()
    service.send_new_statement_notification.return_value = {
        "status": "sent",
        "id": "email-123",
    }
    service.send_tenant_invitation.return_value = {
        "status": "sent",
        "id": "email-456",
    }
    service.send_dispute_update.return_value = {
        "status": "sent",
        "id": "email-789",
    }
    return service


# ============================================================================
# Security Test Fixtures
# ============================================================================


@pytest.fixture
def auth_headers() -> dict:
    """Return authorization headers for authenticated requests.

    Provides a simple dict with Authorization header for tests
    that need authenticated requests.
    """
    return {
        "Authorization": "Bearer mock_token_12345",
        "Content-Type": "application/json",
    }


@pytest.fixture
def sample_property(org_a_property):
    """Alias for org_a_property fixture.

    Some tests expect 'sample_property' instead of 'org_a_property'.
    """
    return org_a_property


@pytest.fixture
def finalized_snapshot_id() -> str:
    """Return a UUID string for a finalized snapshot."""
    return "aaaaaaaa-1111-2222-3333-444444444444"


@pytest.fixture
def draft_snapshot_id() -> str:
    """Return a UUID string for a draft snapshot."""
    return "bbbbbbbb-1111-2222-3333-444444444444"


@pytest.fixture
def sample_prior_snapshot_data_for_cap() -> dict:
    """Create sample prior year snapshot data for cap testing."""
    return {
        "id": str(uuid4()),
        "property_id": str(ORG_A_PROPERTY_ID),
        "period_start_date": "2023-01-01",
        "period_end_date": "2023-12-31",
        "status": "finalized",
        "total_operating_expenses": "140000.00",
        "finalized_at": datetime.now(UTC).isoformat(),
        "created_at": datetime.now(UTC).isoformat(),
    }


# ============================================================================
# E2E Test Fixtures (Real Database)
# ============================================================================
# Import e2e fixtures for tests marked with @pytest.mark.e2e
# These fixtures use real Supabase database instead of mocks
pytest_plugins = ["tests.conftest_e2e"]
