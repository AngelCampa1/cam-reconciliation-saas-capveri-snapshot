# E2E Testing with Real Supabase

This directory contains **true end-to-end tests** that use a real local Supabase instance, real JWT authentication, and real database operations.

## Quick Start

```bash
# 1. Start local Supabase (from project root)
cd <repo-root>
supabase start

# 2. Run e2e tests (from backend directory)
cd backend
pytest -m e2e -v

# 3. Stop Supabase when done
cd ..
supabase stop
```

## Prerequisites

### 1. Install Supabase CLI

**Windows (via Scoop)**:
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Windows (via npm)**:
```bash
npm install -g supabase
```

**Verify installation**:
```bash
supabase --version
```

### 2. Start Local Supabase

From project root:
```bash
supabase start
```

**Expected output**:
```
Started supabase local development setup.

         API URL: http://localhost:54321
     GraphQL URL: http://localhost:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323
    Inbucket URL: http://localhost:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbG...
service_role key: eyJhbG...
```

### 3. Verify Connection

Test that backend can connect:
```bash
cd backend
python -c "from app.database.client import SupabaseClientManager; print(SupabaseClientManager.get_service_client().table('organizations').select('id').limit(1).execute())"
```

If this fails, check:
- Supabase is running (`supabase status`)
- Environment variables are set correctly
- Port 54321 is not blocked by firewall

## Test Structure

### Test Organization

E2E tests are organized by feature:

```
backend/tests/
├── conftest_e2e.py              # E2E fixtures (real DB, real auth)
├── integration/
│   ├── test_ingestion_e2e.py          # Mocked integration tests (fast)
│   ├── test_ingestion_e2e_real.py     # Real e2e tests (slow)
│   ├── test_reconciliation_api_e2e.py # Mocked integration tests
│   └── test_reconciliation_api_e2e_real.py  # Real e2e tests
└── test_multi_property_e2e_real.py    # Real multi-property e2e tests
```

### Test Types

We maintain **two types** of tests:

1. **Integration Tests** (`@pytest.mark.integration`)
   - Use MockQueryBuilder and MockSupabaseResponse
   - Fast (milliseconds)
   - Run in CI/CD
   - Don't require Supabase

2. **E2E Tests** (`@pytest.mark.e2e`)
   - Use real local Supabase database
   - Real JWT authentication
   - Real RLS policies enforced
   - Slower (seconds)
   - Run locally only

## Running Tests

### Run ALL e2e tests
```bash
cd backend
pytest -m e2e -v
```

### Run specific e2e test file
```bash
pytest -m e2e tests/integration/test_ingestion_e2e_real.py -v
```

### Run single e2e test
```bash
pytest -m e2e tests/integration/test_ingestion_e2e_real.py::TestYardiGLIngestionRealE2E::test_yardi_gl_complete_workflow -v
```

### Run ONLY integration tests (mocked)
```bash
pytest -m integration -v
```

### Run all tests (integration + e2e)
```bash
pytest tests/integration -v
```

## How E2E Tests Work

### 1. Real Database Connection

E2E tests connect to your local Supabase instance:

```python
@pytest.fixture
def real_supabase_client():
    """Service role client (bypasses RLS for seeding)."""
    return SupabaseClientManager.get_service_client()
```

### 2. Real JWT Authentication

E2E tests use real JWT tokens from Supabase Auth:

```python
@pytest.fixture
def e2e_auth_token_org_a(e2e_user_org_a: dict):
    """Generate real JWT via sign-in."""
    client = SupabaseClientManager.get_anon_client()

    auth_response = client.auth.sign_in_with_password({
        "email": e2e_user_org_a["email"],
        "password": e2e_user_org_a["password"],
    })

    return auth_response.session.access_token
```

### 3. Real RLS Policies

Unlike mocked tests, e2e tests enforce Row-Level Security:

```python
@pytest.mark.e2e
def test_cross_tenant_access_denied(e2e_client_org_a, seed_data_org_b):
    """Org A cannot access Org B data (RLS blocks it)."""
    response = e2e_client_org_a.get(f"/api/v1/data/{seed_data_org_b['id']}")

    # RLS makes it invisible → 404 (not 403)
    assert response.status_code == 404
```

### 4. Automatic Cleanup

After each test, cleanup fixture removes test data:

```python
@pytest.fixture(autouse=True)
def cleanup_e2e_data(real_supabase_client, request):
    """Auto-cleanup after each e2e test."""
    yield  # Run test

    # Delete test data (cascades via foreign keys)
    real_supabase_client.table("properties").delete().eq("organization_id", ORG_A_ID).execute()
```

## Database Studio

Supabase Studio provides a GUI for inspecting the database:

**URL**: http://localhost:54323

Use this to:
- Inspect test data created during tests
- Verify cleanup worked correctly
- Debug RLS policies
- View table schemas

## Troubleshooting

### Error: "Cannot connect to local Supabase instance"

**Cause**: Supabase is not running or wrong port

**Fix**:
```bash
# Check Supabase status
supabase status

# If not running, start it
supabase start

# Verify it's running on port 54321
curl http://localhost:54321/rest/v1/
```

### Error: "Failed to sign in as test-org-a@e2e.capveri.com"

**Cause**: Test user doesn't exist in Supabase Auth

**Fix**:
```bash
# Reset database to clean state
supabase db reset

# Restart e2e tests (they will recreate users)
pytest -m e2e
```

### Error: "FOREIGN KEY constraint failed"

**Cause**: Cleanup fixture not running or missing CASCADE

**Fix**:
```bash
# Reset database
supabase db reset

# Check migration files have ON DELETE CASCADE
cd supabase/migrations
grep -r "ON DELETE CASCADE" .
```

### Tests pass but data remains in database

**Cause**: Cleanup fixture not configured correctly

**Fix**:
- Ensure test is marked with `@pytest.mark.e2e`
- Check `cleanup_e2e_data` fixture in conftest_e2e.py
- Manually cleanup: `supabase db reset`

### Error: "RLS policy blocks read"

**Cause**: Using service role client instead of authenticated client

**Fix**:
Use `e2e_client_org_a` fixture (has real auth):
```python
# WRONG - Service role bypasses RLS
response = real_supabase_client.table("properties").select("*").execute()

# CORRECT - Uses real auth with RLS
response = e2e_client_org_a.get("/api/v1/properties")
```

### Tests are very slow

**Expected**: E2E tests are slower than unit tests

**Normal speeds**:
- Unit tests: <1 second each
- Integration tests (mocked): 1-5 seconds each
- E2E tests (real DB): 3-10 seconds each

**If slower than this**:
- Check disk I/O (Supabase writes to disk)
- Restart Supabase: `supabase stop && supabase start`
- Check no other processes using database

### Port conflicts (54321, 54322, 54323, etc.)

**Cause**: Another Supabase instance or app using same ports

**Fix**:
```bash
# Stop Supabase
supabase stop

# Check what's using the port
netstat -ano | findstr :54321

# Kill the process if needed
taskkill /PID <process_id> /F

# Restart Supabase
supabase start
```

## Best Practices

### 1. Use Appropriate Client

- **For seeding**: Use `real_supabase_client` (service role, bypasses RLS)
- **For testing endpoints**: Use `e2e_client_org_a` (real auth, enforces RLS)
- **For assertions**: Either, depending on what you're verifying

### 2. Handle Response Format Differences

Real Supabase returns lists, not dicts:

```python
# Mock returns dict
result = mock_client.table("batches").select("*").eq("id", batch_id).execute()
assert result.data["status"] == "completed"

# Real Supabase returns list
result = real_client.table("batches").select("*").eq("id", batch_id).execute()
assert result.data[0]["status"] == "completed"

# Exception: .single() returns dict
result = real_client.table("batches").select("*").eq("id", batch_id).single().execute()
assert result.data["status"] == "completed"
```

### 3. Handle Decimal Types

Real Supabase returns Decimals as strings:

```python
from decimal import Decimal

# Assertion needs string conversion or Decimal()
assert Decimal(result.data[0]["amount"]) == Decimal("1234.56")
# OR
assert result.data[0]["amount"] == "1234.56"
```

### 4. Clean Up Test Data

Trust the autouse fixture, but verify:

```python
@pytest.mark.e2e
def test_something(e2e_client_org_a, seed_e2e_properties):
    # Test code...
    pass

    # No manual cleanup needed - autouse fixture handles it
```

### 5. Test RLS Policies

Use Org B fixtures to verify isolation:

```python
@pytest.mark.e2e
def test_org_isolation(e2e_client_org_a, e2e_client_org_b, seed_e2e_properties):
    """Org A cannot see Org B data."""
    property_id = seed_e2e_properties["id"]  # Belongs to Org A

    # Org A can access
    response_a = e2e_client_org_a.get(f"/api/v1/properties/{property_id}")
    assert response_a.status_code == 200

    # Org B cannot access (RLS blocks)
    response_b = e2e_client_org_b.get(f"/api/v1/properties/{property_id}")
    assert response_b.status_code == 404
```

## Performance Tips

### 1. Use Session-Scoped Fixtures for Expensive Setup

Organizations and users are session-scoped (created once):

```python
@pytest.fixture(scope="session")
def e2e_org_a(real_supabase_client):
    # Created once per test run
    ...
```

### 2. Use Function-Scoped for Test Data

Properties and batches are function-scoped (created per test):

```python
@pytest.fixture(scope="function")
def seed_e2e_properties(real_supabase_client, e2e_org_a):
    # Fresh property for each test
    ...
```

### 3. Run Integration Tests in CI/CD

Only run e2e tests locally:

```bash
# CI/CD (fast)
pytest -m integration

# Local development (comprehensive)
pytest -m integration -m e2e
```

## Additional Resources

- **Supabase CLI Docs**: https://supabase.com/docs/guides/cli
- **Supabase Local Development**: https://supabase.com/docs/guides/cli/local-development
- **PostgreSQL RLS**: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- **FastAPI Testing**: https://fastapi.tiangolo.com/tutorial/testing/
