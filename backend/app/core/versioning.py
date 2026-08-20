"""Calculation engine version tracking for reconciliation provenance."""

import logging
import subprocess

logger = logging.getLogger(__name__)

# Module-level cache — populated once on first call
_ENGINE_VERSION_CACHE: dict[str, str | None] = {"version": None}


def get_engine_version() -> str:
    """Return the git SHA of the current calculation engine code.

    Returns the 40-character commit hash if available, or "unknown" if
    the git command fails (e.g., in Docker containers without git history).
    The result is cached for the lifetime of the process.
    """
    if _ENGINE_VERSION_CACHE["version"] is not None:
        return _ENGINE_VERSION_CACHE["version"]

    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        version = sha if len(sha) == 40 else "unknown"
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        logger.warning("Could not determine engine version via git; using 'unknown'")
        version = "unknown"

    _ENGINE_VERSION_CACHE["version"] = version
    return version
