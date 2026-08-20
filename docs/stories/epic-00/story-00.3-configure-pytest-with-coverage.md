# Story 0.3: Configure pytest with Coverage

## Story Info
- **Epic**: Developer Foundation & Tooling
- **Estimated Hours**: 2
- **Dependencies**: Story 0.2
- **Status**: `pending`

## User Story
**As a** developer
**I want** pytest configured with strict coverage requirements
**So that** untested code cannot be merged and we maintain high quality

## Acceptance Criteria
- [ ] **AC1**: `pytest.ini` or `pyproject.toml` pytest config exists
- [ ] **AC2**: Running `pytest` from `backend/` discovers and runs tests
- [ ] **AC3**: Coverage is collected automatically on test runs
- [ ] **AC4**: `pytest --cov-fail-under=95` fails if coverage drops below 95%
- [ ] **AC5**: Coverage report shows line-by-line coverage
- [ ] **AC6**: HTML coverage report generated in `backend/htmlcov/`
- [ ] **AC7**: A sample test exists and passes to verify setup

## Technical Specifications
**Files to Create/Modify**:
```
backend/
├── pyproject.toml  (add pytest config)
├── pytest.ini      (alternative standalone config)
└── tests/
    ├── __init__.py
    ├── conftest.py
    └── test_sample.py
```

**pytest Configuration** (in pyproject.toml):
```toml
[tool.pytest.ini_options]
minversion = "9.0"
testpaths = ["tests"]
python_files = ["test_*.py"]
python_functions = ["test_*"]
asyncio_mode = "auto"
addopts = [
    "--cov=app",
    "--cov-report=term-missing",
    "--cov-report=html",
    "--cov-fail-under=95",
    "-v"
]

[tool.coverage.run]
source = ["app"]
branch = true
omit = ["*/tests/*", "*/__init__.py"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "raise NotImplementedError"
]
```

**Sample Test** (`tests/test_sample.py`):
```python
"""Sample test to verify pytest configuration."""

def test_pytest_works():
    """Verify pytest is properly configured."""
    assert True

def test_imports_work():
    """Verify app package is importable."""
    from app import __version__
    assert __version__ == "0.1.0"
```

## Definition of Done
- [ ] `pytest` runs successfully
- [ ] Coverage report shows 100% for sample code
- [ ] `pytest --cov-fail-under=95` enforces threshold
- [ ] HTML report viewable in browser
