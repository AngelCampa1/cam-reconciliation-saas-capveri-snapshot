#!/bin/bash
set -e

echo "🔍 Validating Backend..."
cd backend
source .venv/Scripts/activate  # Windows Git Bash path

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
