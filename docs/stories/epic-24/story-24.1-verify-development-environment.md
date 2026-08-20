# Story 24.1: Verify Development Environment & Tooling (Epic 0)

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 2 hours
**Status**: `pending`
**Dependencies**: Epic 0

---

## User Story

As a **developer**,
I want to **verify that all development tools and environment setup work correctly**,
So that **new developers can onboard quickly and the CI/CD pipeline runs reliably**.

---

## Acceptance Criteria

### Epic 0 Implementation Audit
- [ ] Verify monorepo structure matches specification (`/backend`, `/frontend`, `/supabase`, `/docs`)
- [ ] Verify Python environment has all required dependencies (`pyproject.toml`)
- [ ] Verify Node.js environment has all required dependencies (`package.json`)
- [ ] Verify pytest configuration includes coverage, HTML reports, and test discovery
- [ ] Verify Vitest configuration includes jsdom, coverage, and React Testing Library
- [ ] Verify pre-commit hooks are configured (black, isort, ruff, eslint, prettier)
- [ ] Verify test fixture directories exist with proper structure

### Tool Verification
- [ ] Run `pytest` in backend - all tests should pass
- [ ] Run `pytest --cov=app --cov-report=html` - coverage should be ≥95%
- [ ] Run `npm test` in frontend - all tests should pass
- [ ] Run `npm run test:coverage` - coverage should be ≥95%
- [ ] Run `npm run lint` - no errors
- [ ] Run `npm run typecheck` - no type errors
- [ ] Run pre-commit hooks on sample files - should auto-fix and pass

### CI/CD Verification
- [ ] Verify GitHub Actions workflows exist (if configured)
- [ ] Verify local validation scripts work (if configured)
- [ ] Verify coverage reports are generated correctly
- [ ] Verify test failure output is readable and helpful

### Documentation
- [ ] Verify setup instructions in README are accurate
- [ ] Verify CLAUDE.md development guidelines are up-to-date
- [ ] Verify all tool versions are documented

---

## Technical Specifications

### Test Commands to Execute
```bash
# Backend verification
cd backend
python --version  # Should be 3.11+
pip install -e .  # Should install without errors
pytest  # Should pass
pytest --cov=app --cov-report=html  # Should show ≥95% coverage
mypy app/  # Should have 0 errors (if configured)
black --check app/  # Should pass
isort --check app/  # Should pass
ruff check app/  # Should pass

# Frontend verification
cd ../frontend
node --version  # Should be 18+
npm --version  # Should be 9+
npm install  # Should install without errors
npm test  # Should pass
npm run test:coverage  # Should show ≥95% coverage
npm run lint  # Should have 0 errors
npm run typecheck  # Should have 0 type errors

# Pre-commit verification
cd ..
pre-commit run --all-files  # Should pass or auto-fix
```

### Files to Audit
- `backend/pyproject.toml`
- `backend/pytest.ini` or `pyproject.toml` [tool.pytest.ini_options]
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/vitest.config.ts`
- `.pre-commit-config.yaml`
- `backend/tests/fixtures/README.md`
- `frontend/tests/fixtures/README.md`

### Integration Tests to Create

#### Test: Fresh Environment Setup
```bash
# Simulate new developer setup
cd /tmp
git clone <repo>
cd capveri

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -e .
pytest

# Frontend setup
cd ../frontend
npm install
npm test

# Verify everything works
```

#### Test: Pre-commit Hooks
Create a test file with intentional violations:
```python
# backend/app/test_precommit.py
def foo(x,y):  # Missing spaces, will be fixed by black
    return x+y  # Missing spaces, will be fixed by black
```

Run pre-commit and verify it auto-fixes.

---

## Definition of Done

- [ ] All tool verification commands execute successfully
- [ ] Test coverage is ≥95% in both backend and frontend
- [ ] Pre-commit hooks auto-fix code style issues
- [ ] All linters and type checkers pass with 0 errors
- [ ] Fresh environment setup works (tested in clean directory)
- [ ] Documentation accurately reflects setup process
- [ ] Any issues found are documented in GitHub issues

---

## Notes

- This story focuses on **tooling**, not features
- If any tools are missing or misconfigured, they should be fixed before marking this story complete
- The goal is to ensure **developer productivity** and **CI/CD reliability**
- Document any version mismatches or dependency conflicts found

---

*Created: 2025-12-30*
*Status: pending*
