#!/bin/bash
set -e

echo "🔍 Validating Frontend..."

echo "  ✓ Checking public knowledge drift..."
node scripts/check-public-knowledge.mjs

cd frontend

echo "  ✓ Linting (eslint)..."
npm run lint

echo "  ✓ Type checking (tsc)..."
npm run typecheck

echo "  ✓ Running tests with coverage..."
npm run test:coverage -- --run

echo "✅ Frontend validation passed!"
