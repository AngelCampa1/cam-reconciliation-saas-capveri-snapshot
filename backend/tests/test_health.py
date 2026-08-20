"""Tests for the shared health check service."""

from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest

from app.services.health import HealthStatus, _is_placeholder, run_health_checks


class TestIsPlaceholder:
    def test_none_is_placeholder(self) -> None:
        assert _is_placeholder(None) is True

    def test_empty_string_is_placeholder(self) -> None:
        assert _is_placeholder("") is True

    def test_test_prefix_is_placeholder(self) -> None:
        assert _is_placeholder("test-openrouter-key") is True

    def test_your_substring_is_placeholder(self) -> None:
        assert _is_placeholder("your_api_key_here") is True

    def test_ellipsis_suffix_is_placeholder(self) -> None:
        assert _is_placeholder("sk_test_...") is True

    def test_real_key_is_not_placeholder(self) -> None:
        assert _is_placeholder("sk-or-v1-realkey") is False


class TestRunHealthChecks:
    @pytest.mark.asyncio
    async def test_health_check_all_healthy(self) -> None:
        with (
            patch(
                "app.database.client.SupabaseClientManager.verify_connection",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch("app.services.health.get_storage_client") as mock_get_storage_client,
            patch("app.services.health.settings") as mock_settings,
        ):
            storage_client = MagicMock()
            storage_client.check_health.return_value = {"healthy": True}
            mock_get_storage_client.return_value = storage_client
            mock_settings.app_version = "0.1.0"
            mock_settings.environment = "staging"
            mock_settings.openrouter_api_key = "sk-or-v1-realkey"
            mock_settings.resend_api_key = "re_realkey"
            mock_settings.stripe_secret_key = "sk_test_realkey"
            mock_settings.documents_r2_access_key_id = "r2-access-key"

            body, status_code = await run_health_checks()

        assert status_code == 200
        assert body["status"] == HealthStatus.HEALTHY
        assert body["checks"]["database"]["status"] == HealthStatus.HEALTHY
        assert body["checks"]["storage"]["status"] == HealthStatus.HEALTHY
        assert body["checks"]["document_reader"]["status"] == HealthStatus.HEALTHY
        assert body["checks"]["payments"]["status"] == HealthStatus.HEALTHY
        assert body["checks"]["email"]["status"] == HealthStatus.HEALTHY
        assert body["version"] == "0.1.0"
        assert body["environment"] == "staging"
        assert "timestamp" in body

    @pytest.mark.asyncio
    async def test_health_check_db_down(self) -> None:
        with (
            patch(
                "app.database.client.SupabaseClientManager.verify_connection",
                new_callable=AsyncMock,
                return_value=False,
            ),
            patch("app.services.health.get_storage_client") as mock_get_storage_client,
            patch("app.services.health.settings") as mock_settings,
        ):
            storage_client = MagicMock()
            storage_client.check_health.return_value = {"healthy": True}
            mock_get_storage_client.return_value = storage_client
            mock_settings.app_version = "0.1.0"
            mock_settings.environment = "production"
            mock_settings.openrouter_api_key = "sk-or-v1-realkey"
            mock_settings.resend_api_key = "re_realkey"
            mock_settings.stripe_secret_key = "sk_test_realkey"
            mock_settings.documents_r2_access_key_id = "r2-access-key"

            body, status_code = await run_health_checks()

        assert status_code == 503
        assert body["status"] == HealthStatus.UNHEALTHY
        assert body["checks"]["database"]["status"] == HealthStatus.UNHEALTHY

    @pytest.mark.asyncio
    async def test_health_check_external_degraded(self) -> None:
        with (
            patch(
                "app.database.client.SupabaseClientManager.verify_connection",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch("app.services.health.get_storage_client"),
            patch("app.services.health.settings") as mock_settings,
        ):
            mock_settings.app_version = "0.1.0"
            mock_settings.environment = "development"
            mock_settings.openrouter_api_key = "test-openrouter-key"
            mock_settings.resend_api_key = "test-resend-key"
            mock_settings.stripe_secret_key = "sk_test_..."
            mock_settings.documents_r2_access_key_id = None

            body, status_code = await run_health_checks()

        assert status_code == 200
        assert body["status"] == HealthStatus.DEGRADED
        assert body["checks"]["database"]["status"] == HealthStatus.HEALTHY
        assert body["checks"]["storage"]["status"] == HealthStatus.DEGRADED
        assert body["checks"]["document_reader"]["status"] == HealthStatus.DEGRADED
        assert body["checks"]["payments"]["status"] == HealthStatus.DEGRADED
        assert body["checks"]["email"]["status"] == HealthStatus.DEGRADED

    @pytest.mark.asyncio
    async def test_health_check_non_db_exception_treated_as_degraded(self) -> None:
        with (
            patch(
                "app.database.client.SupabaseClientManager.verify_connection",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch("app.services.health.get_storage_client") as mock_get_storage_client,
            patch("app.services.health.settings") as mock_settings,
        ):
            storage_client = MagicMock()
            storage_client.check_health.side_effect = RuntimeError("probe failure")
            mock_get_storage_client.return_value = storage_client
            mock_settings.app_version = "0.1.0"
            mock_settings.environment = "production"
            mock_settings.documents_r2_access_key_id = "r2-access-key"
            _boom: PropertyMock = PropertyMock(
                side_effect=RuntimeError("simulated config error")
            )
            type(mock_settings).openrouter_api_key = _boom
            type(mock_settings).stripe_secret_key = _boom
            type(mock_settings).resend_api_key = _boom

            body, status_code = await run_health_checks()

        assert status_code == 200
        assert body["status"] == HealthStatus.DEGRADED
        assert body["checks"]["database"]["status"] == HealthStatus.HEALTHY
        assert body["checks"]["storage"]["status"] == HealthStatus.UNHEALTHY
        assert body["checks"]["storage"]["message"] == "storage probe error"
        for service in ("document_reader", "payments", "email"):
            assert body["checks"][service]["status"] == HealthStatus.UNHEALTHY
            assert body["checks"][service]["message"] == "configuration error"

    @pytest.mark.asyncio
    async def test_storage_probe_failure_is_unhealthy(self) -> None:
        with (
            patch(
                "app.database.client.SupabaseClientManager.verify_connection",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch("app.services.health.get_storage_client") as mock_get_storage_client,
            patch("app.services.health.settings") as mock_settings,
        ):
            storage_client = MagicMock()
            storage_client.check_health.return_value = {
                "healthy": False,
                "message": "Access denied to object storage bucket",
            }
            mock_get_storage_client.return_value = storage_client
            mock_settings.app_version = "0.1.0"
            mock_settings.environment = "production"
            mock_settings.openrouter_api_key = "sk-or-v1-realkey"
            mock_settings.resend_api_key = "re_realkey"
            mock_settings.stripe_secret_key = "sk_live_realkey"
            mock_settings.documents_r2_access_key_id = "r2-access-key"

            body, status_code = await run_health_checks()

        assert status_code == 200
        assert body["status"] == HealthStatus.DEGRADED
        assert body["checks"]["storage"]["status"] == HealthStatus.UNHEALTHY
        assert (
            body["checks"]["storage"]["message"]
            == "Access denied to object storage bucket"
        )

    @pytest.mark.asyncio
    async def test_placeholder_storage_creds_unhealthy_in_production(self) -> None:
        """Regression: placeholder R2 creds in production must be UNHEALTHY,
        not DEGRADED. A production deploy with no real storage credentials is
        genuinely broken and must not look like a healthy system."""
        with (
            patch(
                "app.database.client.SupabaseClientManager.verify_connection",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch("app.services.health.get_storage_client") as mock_get_storage_client,
            patch("app.services.health.settings") as mock_settings,
        ):
            mock_settings.app_version = "0.1.0"
            mock_settings.environment = "production"
            mock_settings.openrouter_api_key = "sk-or-v1-realkey"
            mock_settings.resend_api_key = "re_realkey"
            mock_settings.stripe_secret_key = "sk_live_realkey"
            mock_settings.documents_r2_access_key_id = None

            body, status_code = await run_health_checks()

        # check_health must never run when credentials are placeholders.
        mock_get_storage_client.assert_not_called()
        assert status_code == 200
        assert body["status"] == HealthStatus.DEGRADED
        assert body["checks"]["storage"]["status"] == HealthStatus.UNHEALTHY
        assert (
            body["checks"]["storage"]["message"] == "storage credentials not configured"
        )

    @pytest.mark.asyncio
    async def test_placeholder_storage_creds_degraded_outside_production(self) -> None:
        """Placeholder R2 creds in staging stay DEGRADED (non-production)."""
        with (
            patch(
                "app.database.client.SupabaseClientManager.verify_connection",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch("app.services.health.get_storage_client") as mock_get_storage_client,
            patch("app.services.health.settings") as mock_settings,
        ):
            mock_settings.app_version = "0.1.0"
            mock_settings.environment = "staging"
            mock_settings.openrouter_api_key = "sk-or-v1-realkey"
            mock_settings.resend_api_key = "re_realkey"
            mock_settings.stripe_secret_key = "sk_live_realkey"
            mock_settings.documents_r2_access_key_id = None

            body, status_code = await run_health_checks()

        mock_get_storage_client.assert_not_called()
        assert status_code == 200
        assert body["checks"]["storage"]["status"] == HealthStatus.DEGRADED
        assert body["checks"]["storage"]["message"] == "using test credentials"
