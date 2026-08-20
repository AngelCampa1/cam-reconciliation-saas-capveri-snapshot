#!/bin/bash
# Pre-commit formatting fix script
# Runs all formatters and linters to prepare code for committing

set -e  # Exit on error

echo "===================================="
echo "Pre-Commit Formatting Fix"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Backend formatting
echo -e "${YELLOW}Running backend formatters...${NC}"
cd backend

echo "  - Black (code formatting)..."
python -m black app tests

echo "  - isort (import sorting)..."
python -m isort app tests --profile black

echo "  - Ruff (linting with auto-fix)..."
python -m ruff check app tests --fix || echo "  (Some Ruff issues require manual fixing)"

echo -e "${GREEN}✓ Backend formatting complete${NC}"
echo ""

# Frontend formatting
echo -e "${YELLOW}Running frontend formatters...${NC}"
cd ../frontend

echo "  - Prettier (code formatting)..."
npm run format

echo "  - ESLint (linting with auto-fix)..."
npm run lint:fix || echo "  (Some ESLint warnings are expected)"

echo -e "${GREEN}✓ Frontend formatting complete${NC}"
echo ""

# Test pre-commit hooks
echo -e "${YELLOW}Testing pre-commit hooks...${NC}"
cd ..
pre-commit run --all-files || {
    echo ""
    echo -e "${YELLOW}Note: Some pre-commit hooks may have failed.${NC}"
    echo "Review the output above and fix any remaining issues manually."
    echo ""
    exit 1
}

echo ""
echo -e "${GREEN}===================================="
echo "✓ All formatting checks passed!"
echo "===================================="${NC}
echo ""
echo "You can now commit with: git add . && git commit"
