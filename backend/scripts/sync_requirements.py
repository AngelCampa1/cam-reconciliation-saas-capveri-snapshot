"""Synchronize backend requirements.txt from pyproject.toml dependencies."""

from __future__ import annotations

import argparse
import difflib
import sys
import tomllib
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PYPROJECT_PATH = REPO_ROOT / "backend" / "pyproject.toml"
DEFAULT_REQUIREMENTS_PATH = REPO_ROOT / "backend" / "requirements.txt"


def load_project_dependencies(pyproject_path: Path) -> list[str]:
    """Load `[project].dependencies` from a pyproject.toml file."""
    with pyproject_path.open("rb") as pyproject_file:
        data: dict[str, Any] = tomllib.load(pyproject_file)

    project = data.get("project")
    if not isinstance(project, dict):
        raise ValueError("Missing [project] section in pyproject.toml")

    dependencies = project.get("dependencies")
    if not isinstance(dependencies, list):
        raise ValueError("Missing or invalid [project].dependencies list")

    normalized: list[str] = []
    for item in dependencies:
        if not isinstance(item, str):
            raise ValueError("All dependencies must be strings")
        dependency = item.strip()
        if dependency:
            normalized.append(dependency)
    return normalized


def render_requirements_content(dependencies: list[str]) -> str:
    """Render requirements.txt content from dependency strings."""
    return "\n".join(dependencies) + "\n"


def build_diff(expected: str, actual: str, requirements_path: Path) -> str:
    """Build a unified diff for requirements drift output."""
    return "".join(
        difflib.unified_diff(
            actual.splitlines(keepends=True),
            expected.splitlines(keepends=True),
            fromfile=f"{requirements_path} (current)",
            tofile=f"{requirements_path} (expected)",
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Sync backend/requirements.txt with [project].dependencies "
            "from backend/pyproject.toml"
        )
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero if requirements.txt is out of sync.",
    )
    parser.add_argument(
        "--pyproject-path",
        type=Path,
        default=DEFAULT_PYPROJECT_PATH,
        help="Path to pyproject.toml",
    )
    parser.add_argument(
        "--requirements-path",
        type=Path,
        default=DEFAULT_REQUIREMENTS_PATH,
        help="Path to requirements.txt",
    )
    args = parser.parse_args()

    dependencies = load_project_dependencies(args.pyproject_path)
    expected = render_requirements_content(dependencies)
    current = (
        args.requirements_path.read_text(encoding="utf-8")
        if args.requirements_path.exists()
        else ""
    )

    if args.check:
        if current == expected:
            print("requirements.txt is in sync with pyproject.toml.")
            return 0
        print("requirements.txt is out of sync with pyproject.toml.", file=sys.stderr)
        print("", file=sys.stderr)
        print(build_diff(expected, current, args.requirements_path), file=sys.stderr)
        print(
            "Run `python backend/scripts/sync_requirements.py` to fix.",
            file=sys.stderr,
        )
        return 1

    args.requirements_path.write_text(expected, encoding="utf-8")
    print(f"Wrote {args.requirements_path} from {args.pyproject_path}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
