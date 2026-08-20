"""Tests for Supabase client configuration."""

from unittest.mock import MagicMock, patch

import pytest
from supabase import Client

from app.database.client import (
    SupabaseClientManager,
    get_supabase,
    get_supabase_admin,
)


class TestSupabaseClientManager:
    """Test suite for SupabaseClientManager class."""

    def setup_method(self) -> None:
        """Reset client instances before each test."""
        SupabaseClientManager.reset_clients()

    def teardown_method(self) -> None:
        """Reset client instances after each test."""
        SupabaseClientManager.reset_clients()

    def test_get_anon_client_returns_client(self) -> None:
        """Test that get_anon_client returns a Supabase client."""
        client = SupabaseClientManager.get_anon_client()

        assert client is not None
        assert isinstance(client, Client)

    def test_get_service_client_returns_client(self) -> None:
        """Test that get_service_client returns a Supabase client."""
        client = SupabaseClientManager.get_service_client()

        assert client is not None
        assert isinstance(client, Client)

    def test_anon_client_is_per_request(self) -> None:
        """Anon clients are not shared because auth mutates client state."""
        client1 = SupabaseClientManager.get_anon_client()
        client2 = SupabaseClientManager.get_anon_client()

        assert client1 is not client2

    def test_service_client_is_singleton(self) -> None:
        """Test that service client is cached and reused."""
        client1 = SupabaseClientManager.get_service_client()
        client2 = SupabaseClientManager.get_service_client()

        assert client1 is client2

    def test_anon_and_service_clients_are_different(self) -> None:
        """Test that anon and service clients are different instances."""
        anon = SupabaseClientManager.get_anon_client()
        service = SupabaseClientManager.get_service_client()

        assert anon is not service

    def test_reset_clients_clears_cache(self) -> None:
        """Test that reset_clients clears the client cache."""
        client1 = SupabaseClientManager.get_anon_client()
        SupabaseClientManager.reset_clients()
        client2 = SupabaseClientManager.get_anon_client()

        # After reset, should get a new client instance
        assert client1 is not client2

    def test_anon_client_uses_anon_key(self) -> None:
        """Test that anon client is created with anon key."""
        with patch("app.database.client.settings") as mock_settings:
            mock_settings.supabase_url = "http://localhost:54321"
            mock_settings.supabase_anon_key = "test-anon-key"

            with patch("app.database.client.create_client") as mock_create:
                mock_client = MagicMock(spec=Client)
                mock_create.return_value = mock_client

                SupabaseClientManager.reset_clients()
                SupabaseClientManager.get_anon_client()

                mock_create.assert_called_once()
                call_args = mock_create.call_args
                # Second positional arg should be the anon key
                assert "test-anon-key" in str(call_args)

    def test_service_client_uses_service_role_key(self) -> None:
        """Test that service client is created with service role key."""
        with patch("app.database.client.settings") as mock_settings:
            mock_settings.supabase_url = "http://localhost:54321"
            mock_settings.supabase_service_role_key = "test-service-role-key"

            with patch("app.database.client.create_client") as mock_create:
                mock_client = MagicMock(spec=Client)
                mock_create.return_value = mock_client

                SupabaseClientManager.reset_clients()
                SupabaseClientManager.get_service_client()

                mock_create.assert_called_once()
                call_args = mock_create.call_args
                # Second positional arg should be the service role key
                assert "test-service-role-key" in str(call_args)


class TestVerifyConnection:
    """Test suite for connection verification."""

    def setup_method(self) -> None:
        """Reset client instances before each test."""
        SupabaseClientManager.reset_clients()

    def teardown_method(self) -> None:
        """Reset client instances after each test."""
        SupabaseClientManager.reset_clients()

    @pytest.mark.asyncio
    async def test_verify_connection_returns_true_on_success(self) -> None:
        """Test that verify_connection returns True when query succeeds."""
        with patch.object(
            SupabaseClientManager, "get_service_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_limit = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.limit.return_value = mock_limit
            mock_limit.execute.return_value = MagicMock(data=[])

            mock_get_client.return_value = mock_client

            result = await SupabaseClientManager.verify_connection()

            assert result is True
            mock_client.table.assert_called_once_with("organizations")

    @pytest.mark.asyncio
    async def test_verify_connection_returns_false_on_exception(self) -> None:
        """Test that verify_connection returns False when query fails."""
        with patch.object(
            SupabaseClientManager, "get_service_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.table.side_effect = Exception("Connection failed")
            mock_get_client.return_value = mock_client

            result = await SupabaseClientManager.verify_connection()

            assert result is False

    @pytest.mark.asyncio
    async def test_verify_connection_handles_network_error(self) -> None:
        """Test that verify_connection handles network errors gracefully."""
        with patch.object(
            SupabaseClientManager, "get_service_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_limit = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.limit.return_value = mock_limit
            mock_limit.execute.side_effect = ConnectionError("Network unreachable")

            mock_get_client.return_value = mock_client

            result = await SupabaseClientManager.verify_connection()

            assert result is False


class TestDependencyInjection:
    """Test suite for dependency injection functions."""

    def setup_method(self) -> None:
        """Reset client instances before each test."""
        SupabaseClientManager.reset_clients()

    def teardown_method(self) -> None:
        """Reset client instances after each test."""
        SupabaseClientManager.reset_clients()

    def test_get_supabase_returns_anon_client(self) -> None:
        """Test that get_supabase returns a fresh anon client."""
        client = get_supabase()
        anon_client = SupabaseClientManager.get_anon_client()

        assert client is not anon_client

    def test_get_supabase_admin_returns_service_client(self) -> None:
        """Test that get_supabase_admin returns the service client."""
        client = get_supabase_admin()
        service_client = SupabaseClientManager.get_service_client()

        assert client is service_client

    def test_get_supabase_returns_client_instance(self) -> None:
        """Test that get_supabase returns a valid Client instance."""
        client = get_supabase()

        assert isinstance(client, Client)

    def test_get_supabase_admin_returns_client_instance(self) -> None:
        """Test that get_supabase_admin returns a valid Client instance."""
        client = get_supabase_admin()

        assert isinstance(client, Client)


class TestClientConfiguration:
    """Test suite for client configuration options."""

    def setup_method(self) -> None:
        """Reset client instances before each test."""
        SupabaseClientManager.reset_clients()

    def teardown_method(self) -> None:
        """Reset client instances after each test."""
        SupabaseClientManager.reset_clients()

    def test_clients_use_settings_url(self) -> None:
        """Test that clients use URL from settings."""
        with patch("app.database.client.settings") as mock_settings:
            mock_settings.supabase_url = "http://localhost:54321"
            mock_settings.supabase_anon_key = "test-anon-key"

            with patch("app.database.client.create_client") as mock_create:
                mock_client = MagicMock(spec=Client)
                mock_create.return_value = mock_client

                SupabaseClientManager.get_anon_client()

                call_args = mock_create.call_args
                # First positional arg should be the URL from settings
                assert call_args[0][0] == "http://localhost:54321"

    def test_anon_client_has_auto_refresh_disabled(self) -> None:
        """Request-scoped anon clients do not refresh or persist sessions."""
        with patch("app.database.client.create_client") as mock_create:
            mock_client = MagicMock(spec=Client)
            mock_create.return_value = mock_client

            SupabaseClientManager.get_anon_client()

            call_args = mock_create.call_args
            options = call_args.kwargs.get("options") or call_args[1].get("options")
            assert options.auto_refresh_token is False

    def test_service_client_has_auto_refresh_disabled(self) -> None:
        """Test that service client has auto_refresh_token disabled."""
        with patch("app.database.client.create_client") as mock_create:
            mock_client = MagicMock(spec=Client)
            mock_create.return_value = mock_client

            SupabaseClientManager.get_service_client()

            call_args = mock_create.call_args
            options = call_args.kwargs.get("options") or call_args[1].get("options")
            assert options.auto_refresh_token is False

    def test_both_clients_have_persist_session_disabled(self) -> None:
        """Test that both clients have persist_session disabled."""
        with patch("app.database.client.create_client") as mock_create:
            mock_client = MagicMock(spec=Client)
            mock_create.return_value = mock_client

            SupabaseClientManager.get_anon_client()
            anon_options = mock_create.call_args.kwargs.get(
                "options"
            ) or mock_create.call_args[1].get("options")
            assert anon_options.persist_session is False

            mock_create.reset_mock()
            SupabaseClientManager.reset_clients()

            SupabaseClientManager.get_service_client()
            service_options = mock_create.call_args.kwargs.get(
                "options"
            ) or mock_create.call_args[1].get("options")
            assert service_options.persist_session is False


class TestModuleImports:
    """Test suite for module imports and exports."""

    def test_can_import_from_database_module(self) -> None:
        """Test that all exports are importable from database module."""
        from app.database import (
            SupabaseClientManager,
            get_supabase,
            get_supabase_admin,
        )

        assert SupabaseClientManager is not None
        assert get_supabase is not None
        assert get_supabase_admin is not None

    def test_module_all_exports(self) -> None:
        """Test that __all__ contains expected exports."""
        from app import database

        expected_exports = [
            "SupabaseClientManager",
            "get_supabase",
            "get_supabase_admin",
        ]
        for export in expected_exports:
            assert export in database.__all__
