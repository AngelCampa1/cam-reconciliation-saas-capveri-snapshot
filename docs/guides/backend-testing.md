# Testing Guide

This document describes how to run tests for the CapVeri backend.

## Quick Start

```bash
# Run all tests (unit + integration, skips performance tests)
pytest

# Run with coverage report
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_calculation.py

# Run specific test function
pytest tests/test_calculation.py::test_gross_up_basic

# Run tests matching a pattern
pytest -k "gross_up"
```

## Test Categories

The backend uses pytest markers to categorize tests:

### Integration Tests
Integration tests use mocked database connections and run quickly. They are safe to run in CI/CD.

```bash
# Run only integration tests
pytest -m integration

# Skip integration tests
pytest -m "not integration"
```

### E2E Tests
End-to-end tests require a local Supabase instance. These are slow and should only be run locally.

```bash
# Run only E2E tests (requires local Supabase)
pytest -m e2e

# Skip E2E tests (default in CI)
pytest -m "not e2e"
```

### Performance Tests
Performance tests benchmark database operations and calculation engine speed. They require a live database connection and are intentionally skipped by default.

**Requirements:**
- Local PostgreSQL or Supabase instance running
- Test database configured with sufficient data
- Recommended: Run on a dedicated test machine (performance tests can be CPU/IO intensive)

**Running performance tests:**

```bash
# Run all performance tests
pytest --run-db-tests tests/test_db_performance.py

# Run specific performance benchmark
pytest --run-db-tests tests/benchmarks/test_ingestion_performance.py

# Run with verbose output to see timing details
pytest --run-db-tests -v tests/test_db_performance.py
```

**What performance tests measure:**
- `test_db_performance.py`: Database query performance, connection pooling, transaction overhead
- `tests/benchmarks/test_ingestion_performance.py`: CSV parsing speed, data transformation, bulk insert performance
- `tests/verification/test_calculation_performance.py`: Calculation engine throughput, gross-up speed, cap calculation efficiency

**Performance test output:**
```
test_db_performance.py::test_bulk_insert_speed PASSED                   [100%]
  Duration: 2.34s (1000 records/sec)

test_db_performance.py::test_complex_query_speed PASSED                 [100%]
  Duration: 0.15s (avg query time: 15ms)
```

**Note:** Performance tests are not run in CI/CD pipelines to avoid false failures due to variable CI runner performance. Run locally before optimizing database queries or calculation logic.

### Benchmark Tests
Similar to performance tests but focused on algorithmic efficiency rather than database operations.

```bash
# Run all benchmark tests
pytest -m benchmark

# Skip benchmark tests
pytest -m "not benchmark"
```

## Coverage Requirements

The project enforces **95% minimum test coverage**. CI/CD will fail if coverage drops below this threshold.

```bash
# Generate coverage report
pytest --cov=app --cov-report=term-missing --cov-report=html

# View detailed HTML coverage report
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
start htmlcov/index.html  # Windows
```

Coverage is measured using **branch coverage**, meaning both true and false branches of conditionals must be tested.

## Test File Organization

```
tests/
├── api/                     # API endpoint tests (FastAPI routes)
│   └── v1/                  # API v1 tests
├── benchmarks/              # Performance benchmark tests
├── integration/             # Integration tests with mocked DB
├── unit/                    # Unit tests for individual functions
├── verification/            # Calculation accuracy verification tests
├── fixtures/                # Test data files (CSV, PDF, JSON)
│   └── generators/          # Scripts to regenerate fixtures
├── conftest.py              # Pytest configuration and fixtures
└── test_*.py                # Test modules
```

## Common Test Patterns

### Testing API Endpoints

```python
def test_create_property(client, admin_token):
    """Test property creation endpoint."""
    response = client.post(
        "/api/v1/properties",
        json={"name": "Test Property", "address": "123 Main St"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Test Property"
```

### Testing Calculations

```python
def test_gross_up_calculation():
    """Test gross-up factor calculation."""
    result = calculate_gross_up(
        variable_expenses=Decimal("10000.00"),
        actual_occupancy=Decimal("0.90"),
        target_occupancy=Decimal("0.95")
    )

    expected = Decimal("10555.56")  # 10000 * (0.95 / 0.90)
    assert result == expected
```

### Testing Database Operations

```python
@pytest.mark.integration
async def test_create_lease(db_session, test_property):
    """Test lease creation in database."""
    lease = Lease(
        property_id=test_property.id,
        unit_id=test_unit.id,
        tenant_name="Test Tenant",
        # ... other fields
    )
    db_session.add(lease)
    await db_session.commit()

    # Verify persistence
    retrieved = await db_session.get(Lease, lease.id)
    assert retrieved.tenant_name == "Test Tenant"
```

## Debugging Failed Tests

### View full error output

```bash
# Show full traceback
pytest --tb=long

# Show local variables in traceback
pytest --tb=long --showlocals

# Drop into debugger on failure
pytest --pdb
```

### Run tests with logging

```bash
# Show all log output
pytest --log-cli-level=DEBUG

# Show only warnings and errors
pytest --log-cli-level=WARNING
```

### Run a single test in isolation

```bash
# Run one test function
pytest tests/test_calculation.py::TestGrossUp::test_basic_gross_up -v

# Run with captured output shown
pytest tests/test_calculation.py::test_example -s
```

## Continuous Integration

The CI pipeline runs the following test suites:

1. **Linting**: `ruff check app/ tests/`
2. **Type checking**: `mypy app/`
3. **Unit tests**: `pytest -m "not e2e and not benchmark"`
4. **Coverage check**: `pytest --cov=app --cov-fail-under=95`

**Note:** Performance tests and E2E tests are NOT run in CI to ensure fast, reliable builds.

## Test Data and Fixtures

Test fixtures are located in `tests/fixtures/`. See [tests/fixtures/README.md](../../backend/tests/fixtures/README.md) for detailed documentation on:

- Yardi GL export fixtures
- MRI rent roll fixtures
- Commercial lease PDF fixtures
- Expected calculation outputs
- Multi-property fixture sets

To regenerate test fixtures:

```bash
# Regenerate all fixtures
python tests/fixtures/generators/yardi_generator.py
python tests/fixtures/generators/mri_generator.py
python tests/fixtures/generators/lease_pdf_generator.py
python tests/fixtures/generators/multi_property_generator.py

# Regenerate expected calculation values
python tests/fixtures/generators/calculation_expected_generator.py
```

## Best Practices

1. **Test minimalism**: Write the minimum number of tests for 100% coverage. Avoid over-testing.
2. **Real data**: Use realistic test data from `fixtures/` directory, not hardcoded values.
3. **No mocking the SUT**: Never mock the System Under Test (the function/class you're testing).
4. **Mock boundaries**: Only mock external APIs, database connections, and file I/O.
5. **Descriptive names**: Test names should describe the scenario: `test_gross_up_at_low_occupancy`
6. **One assertion focus**: Each test should verify one primary behavior.
7. **Arrange-Act-Assert**: Follow AAA pattern for clarity.

## Troubleshooting

### Tests pass locally but fail in CI

**Likely causes:**
- Different Python version (CI uses 3.11)
- Missing environment variables
- Timezone differences (CI uses UTC)
- Race conditions in async tests

**Solution:** Run tests in a clean environment matching CI:
```bash
# Create clean virtual environment
python3.11 -m venv .venv-ci
source .venv-ci/bin/activate
pip install -r requirements.txt
pytest
```

### Supabase connection errors

If you see `postgrest.exceptions.APIError`:

1. Check that Supabase local instance is running: `supabase status`
2. Verify connection strings in `.env.test`
3. Ensure test database migrations are applied: `supabase db reset --local`

### Slow test execution

If tests take longer than expected:

1. Check if E2E tests are running: `pytest -m "not e2e"`
2. Disable coverage for faster runs: `pytest` (without --cov)
3. Run tests in parallel: `pytest -n auto` (requires pytest-xdist)

## Further Reading

- [pytest documentation](https://docs.pytest.org/)
- [Coverage.py documentation](https://coverage.readthedocs.io/)
- [Testing Best Practices (CLAUDE.md)](../../CLAUDE.md#critical-rules)
