"""Tests for syncing requirements.txt from pyproject.toml dependencies."""

from pathlib import Path

import pytest

from scripts.sync_requirements import (
    build_diff,
    load_project_dependencies,
    render_requirements_content,
)


def test_load_project_dependencies_reads_project_list(tmp_path: Path) -> None:
    """Loads dependency strings from [project].dependencies."""
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(
        '[project]\nname = "demo"\ndependencies = ["fastapi>=0.1", "uvicorn>=0.2"]\n',
        encoding="utf-8",
    )

    dependencies = load_project_dependencies(pyproject)

    assert dependencies == ["fastapi>=0.1", "uvicorn>=0.2"]


def test_load_project_dependencies_raises_without_dependencies(tmp_path: Path) -> None:
    """Rejects invalid pyproject files missing dependencies list."""
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text('[project]\nname = "demo"\n', encoding="utf-8")

    with pytest.raises(ValueError, match="dependencies"):
        load_project_dependencies(pyproject)


def test_render_requirements_content_matches_expected_format() -> None:
    """Renders one dependency per line with trailing newline."""
    rendered = render_requirements_content(["a>=1.0.0", "b>=2.0.0"])

    assert rendered == "a>=1.0.0\nb>=2.0.0\n"


def test_build_diff_contains_file_markers(tmp_path: Path) -> None:
    """Includes path and changed lines in unified diff output."""
    requirements_path = tmp_path / "requirements.txt"
    diff = build_diff(
        expected="fastapi>=0.1\nuvicorn>=0.2\n",
        actual="fastapi>=0.1\n",
        requirements_path=requirements_path,
    )

    assert "requirements.txt (current)" in diff
    assert "requirements.txt (expected)" in diff
    assert "+uvicorn>=0.2" in diff
