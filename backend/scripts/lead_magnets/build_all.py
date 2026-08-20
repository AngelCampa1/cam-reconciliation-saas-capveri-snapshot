"""Compatibility wrapper for the canonical lead-magnet builder.

Run from the repository root:

    python backend/scripts/lead_magnets/build_all.py

The old per-asset generators in this directory are kept for historical
reference. New builds must go through ``scripts/build_lead_magnets.py`` so
generated assets, docs assets, the manifest, and R2 verification stay aligned.
"""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[3]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    from scripts import build_lead_magnets

    build_lead_magnets.build_all()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
