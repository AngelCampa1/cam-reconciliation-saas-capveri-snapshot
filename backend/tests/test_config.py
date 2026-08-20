"""Tests for application configuration."""

import os
from pathlib import Path
from unittest.mock import patch

from app.config import Settings, _resolve_public_knowledge_path


class TestSettings:
    """Test suite for Settings class."""

    def test_public_knowledge_path_prefers_repo_root(self, tmp_path: Path) -> None:
        """Repo checkouts should use the canonical root generated artifact."""
        app_dir = tmp_path / "backend" / "app"
        root_knowledge = tmp_path / "knowledge" / "generated" / "public-knowledge.json"
        backend_knowledge = app_dir / "generated" / "public-knowledge.json"
        root_knowledge.parent.mkdir(parents=True)
        backend_knowledge.parent.mkdir(parents=True)
        root_knowledge.write_text("{}", encoding="utf-8")
        backend_knowledge.write_text("{}", encoding="utf-8")

        assert _resolve_public_knowledge_path(app_dir) == root_knowledge

    def test_public_knowledge_path_falls_back_to_backend_generated(
        self, tmp_path: Path
    ) -> None:
        """Backend-only deploy images should use the packaged backend artifact."""
        app_dir = tmp_path / "backend" / "app"
        backend_knowledge = app_dir / "generated" / "public-knowledge.json"
        backend_knowledge.parent.mkdir(parents=True)
        backend_knowledge.write_text("{}", encoding="utf-8")

        assert _resolve_public_knowledge_path(app_dir) == backend_knowledge

    def test_default_values(self) -> None:
        """Test that settings have correct default values."""
        # Create settings with defaults (no env vars)
        settings = Settings()

        assert settings.app_version == "0.1.0"
        assert settings.environment == "development"
        assert settings.debug is True

    def test_default_cors_origins(self) -> None:
        """Test that default CORS origins include localhost."""
        settings = Settings()

        assert "http://localhost:5173" in settings.cors_origins
        assert "http://localhost:3000" in settings.cors_origins

    def test_default_supabase_settings(self) -> None:
        """Test that Supabase settings have test defaults or .env values."""
        settings = Settings()

        # Accept both localhost and 127.0.0.1 (equivalent) and .env values
        assert settings.supabase_url.startswith(
            "http://localhost"
        ) or settings.supabase_url.startswith("http://127.0.0.1")
        # Keys should be set (either defaults or from .env)
        assert settings.supabase_anon_key
        assert settings.supabase_service_role_key

    def test_default_database_url(self) -> None:
        """Test that database URL has test default or .env value."""
        settings = Settings()

        assert "postgresql://" in settings.database_url
        # Accept both localhost and 127.0.0.1 (equivalent)
        assert (
            "localhost" in settings.database_url or "127.0.0.1" in settings.database_url
        )

    def test_environment_override(self) -> None:
        """Test that environment variables override defaults."""
        with patch.dict(
            os.environ,
            {
                "APP_VERSION": "1.0.0",
                "ENVIRONMENT": "production",
                "DEBUG": "false",
            },
        ):
            settings = Settings()

            assert settings.app_version == "1.0.0"
            assert settings.environment == "production"
            assert settings.debug is False

    def test_cors_origins_override(self) -> None:
        """Test that CORS origins can be overridden via environment."""
        with patch.dict(
            os.environ,
            {"CORS_ORIGINS": '["https://app.capveri.com"]'},
        ):
            settings = Settings()

            assert "https://app.capveri.com" in settings.cors_origins

    def test_supabase_settings_override(self) -> None:
        """Test that Supabase settings can be overridden."""
        with patch.dict(
            os.environ,
            {
                "SUPABASE_URL": "https://abc123.supabase.co",
                "SUPABASE_ANON_KEY": "real-anon-key",
                "SUPABASE_SERVICE_ROLE_KEY": "real-service-key",
            },
        ):
            settings = Settings()

            assert settings.supabase_url == "https://abc123.supabase.co"
            assert settings.supabase_anon_key == "real-anon-key"
            assert settings.supabase_service_role_key == "real-service-key"

    def test_database_url_override(self) -> None:
        """Test that database URL can be overridden."""
        with patch.dict(
            os.environ,
            {"DATABASE_URL": "postgresql://user:pass@prod-db:5432/capveri"},
        ):
            settings = Settings()

            assert (
                settings.database_url == "postgresql://user:pass@prod-db:5432/capveri"
            )

    def test_legacy_aws_document_credentials_are_ignored(self) -> None:
        """Legacy AWS env vars should not backfill document R2 credentials."""
        with patch.dict(
            os.environ,
            {
                "AWS_ACCESS_KEY_ID": "legacy-access-key",
                "AWS_SECRET_ACCESS_KEY": "legacy-secret-key",
                "DOCUMENTS_R2_ACCESS_KEY_ID": "",
                "DOCUMENTS_R2_SECRET_ACCESS_KEY": "",
            },
            clear=False,
        ):
            settings = Settings()

            assert settings.documents_r2_access_key_id == ""
            assert settings.documents_r2_secret_access_key == ""

    def test_case_insensitive_env_vars(self) -> None:
        """Test that environment variable names are case-insensitive."""
        with patch.dict(os.environ, {"environment": "staging"}):
            settings = Settings()
            assert settings.environment == "staging"

    def test_extra_env_vars_ignored(self) -> None:
        """Test that extra/unknown environment variables are ignored."""
        with patch.dict(os.environ, {"UNKNOWN_SETTING": "value"}):
            # Should not raise an error
            settings = Settings()
            assert settings is not None


class TestSettingsValidation:
    """Test suite for Settings validation."""

    def test_debug_boolean_conversion(self) -> None:
        """Test that debug setting properly converts string to boolean."""
        with patch.dict(os.environ, {"DEBUG": "true"}):
            settings = Settings()
            assert settings.debug is True

        with patch.dict(os.environ, {"DEBUG": "false"}):
            settings = Settings()
            assert settings.debug is False

        with patch.dict(os.environ, {"DEBUG": "1"}):
            settings = Settings()
            assert settings.debug is True

        with patch.dict(os.environ, {"DEBUG": "0"}):
            settings = Settings()
            assert settings.debug is False

    def test_cors_origins_list_parsing(self) -> None:
        """Test that CORS origins JSON list is properly parsed."""
        with patch.dict(
            os.environ,
            {
                "CORS_ORIGINS": '["http://example.com", "http://test.com"]',
                "ENVIRONMENT": "production",  # Prevent localhost origins from being added
            },
        ):
            settings = Settings()

            # Custom origins are preserved
            assert "http://example.com" in settings.cors_origins
            assert "http://test.com" in settings.cors_origins
            # Canonical production origins are always merged in
            assert "https://www.capveri.com" in settings.cors_origins
            assert "https://app.capveri.com" in settings.cors_origins
            assert "https://capveri.com" in settings.cors_origins

    def test_production_cors_does_not_duplicate_required_origins(self) -> None:
        """Canonical production origins should not be duplicated when already set."""
        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "production",
                "CORS_ORIGINS": (
                    '["https://capveri.com",'
                    ' "https://www.capveri.com",'
                    ' "https://app.capveri.com"]'
                ),
            },
        ):
            settings = Settings()

            assert settings.cors_origins.count("https://capveri.com") == 1
            assert settings.cors_origins.count("https://www.capveri.com") == 1
            assert settings.cors_origins.count("https://app.capveri.com") == 1


class TestGlobalSettingsInstance:
    """Test the global settings instance."""

    def test_global_settings_exists(self) -> None:
        """Test that global settings instance is available."""
        from app.config import settings

        assert settings is not None
        assert isinstance(settings, Settings)

    def test_global_settings_has_defaults(self) -> None:
        """Test that global settings has expected default values."""
        from app.config import settings

        assert settings.app_version is not None
        assert settings.environment is not None
        assert settings.debug is not None
