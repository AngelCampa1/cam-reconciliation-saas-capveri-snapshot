#!/usr/bin/env bash
# Called by pre-commit framework when feature-level files are staged.
# Only warns about marketing context drift for feature-level changes.
# Skips the check for bug fixes, refactors, and other maintenance commits.

# If any feature-inventory doc is already staged, always pass
INVENTORY_UPDATED=$(git diff --cached --name-only | grep -E '^docs/feature-inventory/' || true)
if [ -n "$INVENTORY_UPDATED" ]; then
  exit 0
fi

# Check if any NEW files are being added in feature directories (strong signal of new feature)
NEW_FEATURE_FILES=$(git diff --cached --diff-filter=A --name-only | grep -E '^(frontend/src/pages/|frontend/src/features/|backend/app/api/v1/)' || true)

# Check if any existing files have significant additions (>50 net new lines across all staged feature files)
NET_ADDITIONS=$(git diff --cached --numstat -- 'frontend/src/pages/' 'frontend/src/features/' 'backend/app/api/v1/' 2>/dev/null \
  | awk '{ added += $1; deleted += $2 } END { print (added - deleted) + 0 }')

# Only trigger for new feature files OR large net additions (likely a new feature, not a bug fix)
if [ -z "$NEW_FEATURE_FILES" ] && [ "${NET_ADDITIONS:-0}" -lt 50 ]; then
  exit 0
fi

echo ""
echo "========================================"
echo "  FEATURE INVENTORY DRIFT DETECTED"
echo "========================================"
echo ""
echo "You're staging feature-level changes but haven't updated"
echo "docs/feature-inventory/ (see INDEX.md for which doc to update)"
echo ""
if [ -n "$NEW_FEATURE_FILES" ]; then
  echo "  New feature files detected:"
  echo "$NEW_FEATURE_FILES" | sed 's/^/    /'
  echo ""
fi
if [ "${NET_ADDITIONS:-0}" -ge 50 ]; then
  echo "  Net additions: +${NET_ADDITIONS} lines in feature directories"
  echo ""
fi
echo "  Update the relevant doc in docs/feature-inventory/ and"
echo "  bump the date in INDEX.md, then stage and commit."
echo ""
echo "  If the change affects messaging, also update"
echo "  docs/feature-inventory/product-marketing-context.md"
echo ""
echo "  This check auto-skips for small changes (bug fixes, refactors)."
echo ""
exit 1
