"""
Tests for Supabase configuration files.

Ensures the Supabase project is properly configured for local development.
"""

import tomllib
from pathlib import Path
from typing import Any

import pytest

# Path to project root (two levels up from tests directory)
PROJECT_ROOT = Path(__file__).parent.parent.parent
SUPABASE_DIR = PROJECT_ROOT / "supabase"


class TestSupabaseConfigToml:
    """Tests for supabase/config.toml."""

    @pytest.fixture
    def config(self) -> dict[str, Any]:
        """Load and parse config.toml."""
        config_path = SUPABASE_DIR / "config.toml"
        assert config_path.exists(), f"config.toml not found at {config_path}"
        with open(config_path, "rb") as f:
            return tomllib.load(f)

    def test_config_toml_exists(self) -> None:
        """config.toml file exists in supabase directory."""
        config_path = SUPABASE_DIR / "config.toml"
        assert config_path.exists(), "supabase/config.toml must exist"

    def test_config_is_valid_toml(self, config: dict[str, Any]) -> None:
        """config.toml is valid TOML that can be parsed."""
        assert isinstance(config, dict)
        assert len(config) > 0, "config.toml should not be empty"

    def test_api_section_exists(self, config: dict[str, Any]) -> None:
        """API section is properly configured."""
        assert "api" in config, "config.toml must have [api] section"
        api = config["api"]
        assert api.get("enabled") is True, "API must be enabled"
        assert api.get("port") == 54321, "API port should be 54321"
        assert "public" in api.get("schemas", []), "public schema must be in schemas"

    def test_db_section_exists(self, config: dict[str, Any]) -> None:
        """Database section is properly configured."""
        assert "db" in config, "config.toml must have [db] section"
        db = config["db"]
        assert db.get("port") == 54322, "DB port should be 54322"
        assert db.get("major_version") == 15, "DB major version should be 15"

    def test_studio_section_exists(self, config: dict[str, Any]) -> None:
        """Studio section is properly configured."""
        assert "studio" in config, "config.toml must have [studio] section"
        studio = config["studio"]
        assert studio.get("enabled") is True, "Studio must be enabled"
        assert studio.get("port") == 54323, "Studio port should be 54323"

    def test_auth_section_exists(self, config: dict[str, Any]) -> None:
        """Auth section is properly configured."""
        assert "auth" in config, "config.toml must have [auth] section"
        auth = config["auth"]
        assert auth.get("enabled") is True, "Auth must be enabled"
        assert "localhost:5173" in auth.get(
            "site_url", ""
        ), "site_url should point to frontend"
        assert auth.get("enable_signup") is True, "Signup should be enabled for dev"

    def test_storage_section_exists(self, config: dict[str, Any]) -> None:
        """Storage section is properly configured."""
        assert "storage" in config, "config.toml must have [storage] section"
        storage = config["storage"]
        assert storage.get("enabled") is True, "Storage must be enabled"


class TestEnvExample:
    """Tests for .env.example file."""

    @pytest.fixture
    def env_content(self) -> str:
        """Load .env.example content."""
        env_path = PROJECT_ROOT / ".env.example"
        assert env_path.exists(), f".env.example not found at {env_path}"
        return env_path.read_text()

    def test_env_example_exists(self) -> None:
        """.env.example file exists at project root."""
        env_path = PROJECT_ROOT / ".env.example"
        assert env_path.exists(), ".env.example must exist at project root"

    def test_supabase_url_documented(self, env_content: str) -> None:
        """SUPABASE_URL is documented in .env.example."""
        assert "SUPABASE_URL" in env_content
        assert "localhost:54321" in env_content, "Should include local dev URL"

    def test_supabase_anon_key_documented(self, env_content: str) -> None:
        """SUPABASE_ANON_KEY is documented in .env.example."""
        assert "SUPABASE_ANON_KEY" in env_content

    def test_supabase_service_role_key_documented(self, env_content: str) -> None:
        """SUPABASE_SERVICE_ROLE_KEY is documented in .env.example."""
        assert "SUPABASE_SERVICE_ROLE_KEY" in env_content

    def test_database_url_documented(self, env_content: str) -> None:
        """DATABASE_URL is documented in .env.example."""
        assert "DATABASE_URL" in env_content
        assert (
            "postgresql://" in env_content
        ), "Should include PostgreSQL connection string"
        assert "localhost:54322" in env_content, "Should include local DB port"

    def test_jwt_secret_documented(self, env_content: str) -> None:
        """JWT_SECRET is documented in .env.example."""
        assert "JWT_SECRET" in env_content

    def test_required_env_vars_present(self, env_content: str) -> None:
        """All required environment variables are documented."""
        required_vars = [
            "SUPABASE_URL",
            "SUPABASE_ANON_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "DATABASE_URL",
            "JWT_SECRET",
            "ENVIRONMENT",
            "FRONTEND_URL",
        ]
        for var in required_vars:
            assert var in env_content, f"{var} must be documented in .env.example"


class TestSeedSql:
    """Tests for supabase/seed.sql file."""

    def test_seed_sql_exists(self) -> None:
        """seed.sql file exists in supabase directory."""
        seed_path = SUPABASE_DIR / "seeds" / "seed.sql"
        assert seed_path.exists(), "supabase/seed.sql must exist"

    def test_seed_sql_is_valid(self) -> None:
        """seed.sql contains valid SQL (basic check)."""
        seed_path = SUPABASE_DIR / "seeds" / "seed.sql"
        content = seed_path.read_text()
        # Should contain at least a comment or SELECT statement
        assert len(content) > 0, "seed.sql should not be empty"
        # Basic SQL validation - should have semicolons or comments
        assert ";" in content or "--" in content, "seed.sql should contain SQL"


class TestSupabaseGitignore:
    """Tests for supabase/.gitignore file."""

    def test_gitignore_exists(self) -> None:
        """.gitignore exists in supabase directory."""
        gitignore_path = SUPABASE_DIR / ".gitignore"
        assert gitignore_path.exists(), "supabase/.gitignore must exist"

    def test_gitignore_excludes_temp_files(self) -> None:
        """.gitignore excludes temporary development files."""
        gitignore_path = SUPABASE_DIR / ".gitignore"
        content = gitignore_path.read_text()
        # Should exclude common temp patterns
        assert ".temp" in content or "*.temp" in content or ".temp/" in content


class TestMigrationsDirectory:
    """Tests for supabase/migrations directory structure."""

    def test_migrations_directory_exists(self) -> None:
        """migrations directory exists in supabase directory."""
        migrations_path = SUPABASE_DIR / "migrations"
        assert migrations_path.exists(), "supabase/migrations must exist"
        assert migrations_path.is_dir(), "migrations must be a directory"


class TestProjectStructure:
    """Tests for overall Supabase project structure."""

    def test_all_required_files_exist(self) -> None:
        """All required Supabase project files exist."""
        required_files = [
            SUPABASE_DIR / "config.toml",
            SUPABASE_DIR / "seeds" / "seed.sql",
            SUPABASE_DIR / ".gitignore",
            PROJECT_ROOT / ".env.example",
        ]
        for file_path in required_files:
            assert file_path.exists(), f"Required file missing: {file_path}"

    def test_config_ports_are_unique(self) -> None:
        """All configured ports are unique to prevent conflicts."""
        config_path = SUPABASE_DIR / "config.toml"
        with open(config_path, "rb") as f:
            config = tomllib.load(f)

        ports = []
        if "api" in config:
            ports.append(config["api"].get("port"))
        if "db" in config:
            ports.append(config["db"].get("port"))
            ports.append(config["db"].get("shadow_port"))
        if "studio" in config:
            ports.append(config["studio"].get("port"))
        if "inbucket" in config:
            ports.append(config["inbucket"].get("port"))
        if "storage" in config and isinstance(config["storage"], dict):
            ports.append(config["storage"].get("port"))

        # Filter out None values
        ports = [p for p in ports if p is not None]

        # Check uniqueness
        assert len(ports) == len(set(ports)), "All configured ports must be unique"
