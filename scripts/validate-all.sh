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
