import subprocess
from unittest.mock import patch

from app.core.versioning import get_engine_version


def test_get_engine_version_returns_40_char_hex_or_unknown():
    version = get_engine_version()
    assert version == "unknown" or (
        len(version) == 40 and all(c in "0123456789abcdef" for c in version)
    )


def test_get_engine_version_caches_result():
    v1 = get_engine_version()
    v2 = get_engine_version()
    assert v1 == v2


def test_get_engine_version_fallback_when_git_unavailable():
    with patch(
        "subprocess.check_output", side_effect=subprocess.CalledProcessError(1, "git")
    ):
        import app.core.versioning as v_module

        v_module._ENGINE_VERSION_CACHE["version"] = None
        version = v_module.get_engine_version()
    assert version == "unknown"
    # Restore cache
    v_module._ENGINE_VERSION_CACHE["version"] = None
