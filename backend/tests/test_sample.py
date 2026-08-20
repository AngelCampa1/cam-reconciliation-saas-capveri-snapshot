"""Smoke tests for baseline backend test configuration."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent


def test_pytest_works():
    """Verify pytest is running from a complete checkout."""
    assert (PROJECT_ROOT / "README.md").exists()
    assert (PROJECT_ROOT / "backend" / "pyproject.toml").exists()
    assert (PROJECT_ROOT / "backend" / "app").is_dir()


def test_imports_work():
    """Verify app package is importable."""
    from app import __version__

    assert __version__ == "0.1.0"
