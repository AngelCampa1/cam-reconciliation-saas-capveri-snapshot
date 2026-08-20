# Story 0.6: Create Local Validation Scripts

## Story Info
- **Epic**: Developer Foundation & Tooling
- **Estimated Hours**: 2
- **Dependencies**: Story 0.2, Story 0.3, Story 0.4, Story 0.5
- **Status**: `pending`

## User Story
**As a** developer
**I want** local validation scripts that check code quality before commits
**So that** I can verify my code meets standards without relying on external CI/CD services

## Acceptance Criteria
- [ ] **AC1**: `scripts/validate-backend.sh` exists and is executable
- [ ] **AC2**: Backend validation script runs:
  - Linting (ruff, black --check, isort --check)
  - Type checking (mypy)
  - Tests with coverage (fails under 95%)
- [ ] **AC3**: `scripts/validate-frontend.sh` exists and is executable
- [ ] **AC4**: Frontend validation script runs:
  - Linting (eslint)
  - Type checking (tsc --noEmit)
  - Tests with coverage (fails under 95%)
- [ ] **AC5**: `scripts/validate-all.sh` exists and runs both validations in parallel
- [ ] **AC6**: Scripts exit with non-zero status on any failure
- [ ] **AC7**: Clear error messages show which check failed

## Technical Specifications
**Files to Create**:
```
scripts/
├── validate-backend.sh
├── validate-frontend.sh
└── validate-all.sh
```

**validate-backend.sh**:
```bash
#!/bin/bash
set -e

echo "🔍 Validating Backend..."
cd backend

# Backend validation (ruff 0.14+, mypy 1.19+, pytest 9.0+)
echo "  ✓ Running ruff..."
ruff check app tests

echo "  ✓ Checking formatting (black)..."
black --check app tests

echo "  ✓ Checking imports (isort)..."
isort --check-only app tests

echo "  ✓ Type checking (mypy)..."
mypy app

echo "  ✓ Running tests with coverage..."
pytest --cov=app --cov-fail-under=95 --tb=short

echo "✅ Backend validation passed!"
```

**validate-frontend.sh**:
```bash
#!/bin/bash
set -e

echo "🔍 Validating Frontend..."
cd frontend

# Frontend validation (TypeScript 5.7+, Vitest 4.0+)
echo "  ✓ Linting (eslint)..."
npm run lint

echo "  ✓ Type checking (tsc)..."
npm run typecheck

echo "  ✓ Running tests with coverage..."
npm run test:coverage -- --run

echo "✅ Frontend validation passed!"
```

**validate-all.sh**:
```bash
#!/bin/bash

# Run validations in parallel
./scripts/validate-backend.sh &
BACKEND_PID=$!

./scripts/validate-frontend.sh &
FRONTEND_PID=$!

# Wait for both and capture exit codes
wait $BACKEND_PID
BACKEND_EXIT=$?

wait $FRONTEND_PID
FRONTEND_EXIT=$?

# Exit with failure if either failed
if [ $BACKEND_EXIT -ne 0 ] || [ $FRONTEND_EXIT -ne 0 ]; then
  echo "❌ Validation failed!"
  exit 1
fi

echo "✅ All validations passed!"
```

**Make scripts executable**:
```bash
chmod +x scripts/validate-backend.sh
chmod +x scripts/validate-frontend.sh
chmod +x scripts/validate-all.sh
```

## Test Cases
```bash
# Test 1: Backend validation passes with clean code
cd backend
ruff check app tests  # No errors
black --check app tests  # Already formatted
isort --check-only app tests  # Imports sorted
mypy app  # No type errors
pytest --cov=app --cov-fail-under=95  # 95%+ coverage

# Test 2: Backend validation fails on linting errors
# Add intentional linting error to backend/app/main.py
./scripts/validate-backend.sh
# Expected: Script exits with non-zero status, shows ruff errors

# Test 3: Frontend validation passes with clean code
cd frontend
npm run lint  # No errors
npm run typecheck  # No type errors
npm run test:coverage  # 95%+ coverage

# Test 4: Frontend validation fails on type errors
# Add intentional type error to frontend/src/App.tsx
./scripts/validate-frontend.sh
# Expected: Script exits with non-zero status, shows tsc errors

# Test 5: Validate all runs both in parallel
time ./scripts/validate-all.sh
# Expected: Both validations run, total time < sum of individual times
```

## Definition of Done
- [ ] All three validation scripts exist and are executable
- [ ] Scripts run all checks in correct order
- [ ] Scripts exit with status 0 on success, non-zero on failure
- [ ] Clear console output shows progress and errors
- [ ] validate-all.sh runs both validations in parallel
- [ ] Can run `./scripts/validate-all.sh` from repo root and get full validation
- [ ] Scripts work on Linux/macOS (bash) and Windows (Git Bash/WSL)
