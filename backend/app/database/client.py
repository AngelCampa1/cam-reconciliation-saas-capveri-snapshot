"""
Supabase client configuration.

Provides both authenticated user client and service role client.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from supabase import Client, ClientOptions, create_client

from app.config import settings

logger = logging.getLogger(__name__)

# Type alias for Supabase client operations.
# supabase-py exposes very broad JSON unions for query results, which makes
# strict mypy treat ordinary row access as unsafe throughout the app. Keep that
# uncertainty at the database boundary and cast rows at call sites that need it.
SupabaseDB = Any


class SupabaseClientManager:
    """Manages Supabase client instances."""

    _anon_client: Client | None = None
    _service_client: Client | None = None

    @classmethod
    def create_anon_client(cls) -> Client:
        """Create an anonymous/public Supabase client for one request.

        This client respects RLS policies and is used for
        user-authenticated requests.
        """
        return create_client(
            settings.supabase_url,
            settings.supabase_anon_key,
            options=ClientOptions(
                auto_refresh_token=False,
                persist_session=False,
            ),
        )

    @classmethod
    def get_anon_client(cls) -> Client:
        """Get an anonymous/public Supabase client.

        User-authenticated clients must not be shared because
        postgrest.auth(token) mutates client state. Return a fresh client
        so concurrent requests cannot leak JWT context across users.
        """
        return cls.create_anon_client()

    @classmethod
    def get_service_client(cls) -> Client:
        """Get the service role Supabase client.

        WARNING: This client bypasses RLS. Only use for admin
        operations that require cross-tenant access.
        """
        if cls._service_client is None:
            cls._service_client = create_client(
                settings.supabase_url,
                settings.supabase_service_role_key,
                options=ClientOptions(
                    auto_refresh_token=False,
                    persist_session=False,
                ),
            )
        return cls._service_client

    @classmethod
    def reset_clients(cls) -> None:
        """Reset client instances. Used for testing."""
        cls._anon_client = None
        cls._service_client = None

    @classmethod
    async def verify_connection(cls) -> bool:
        """Verify that the Supabase connection is working."""
        try:
            client = cls.get_service_client()
            # Simple query to verify connection
            # Note: This will fail if no 'organizations' table exists
            # In test environment, we just verify the client was created
            client.table("organizations").select("id").limit(1).execute()
            return True
        except Exception:
            return False


def get_supabase() -> SupabaseDB:
    """Dependency injection for Supabase client."""
    return SupabaseClientManager.create_anon_client()


def get_supabase_admin() -> SupabaseDB:
    """Dependency injection for admin Supabase client."""
    return SupabaseClientManager.get_service_client()


def set_organization_context(client: Client, organization_id: str) -> None:
    """
    Set organization context for service role operations.

    This allows RLS policies that depend on organization_id to work
    correctly even when using the service role client. The organization
    context is stored in a PostgreSQL session variable that RLS policies
    can read.

    Args:
        client: Supabase service role client
        organization_id: Organization UUID string to set as context

    Example:
        ```python
        client = get_supabase_admin()
        set_organization_context(client, str(org_id))
        # Now RLS policies can validate against this organization
        client.table("gl_entries").insert(data).execute()
        ```

    Note:
        The session variable is transaction-scoped (is_local=True),
        so it only affects the current database session.
    """
    try:
        client.rpc(
            "set_organization_context",
            {"org_id": str(organization_id)},
        ).execute()
        logger.debug(f"Set organization context: {organization_id}")
    except Exception as e:
        logger.error(f"Failed to set organization context: {e}")
        raise


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[Client, None]:
    """Async context manager for database session.

    Returns the admin Supabase client for use in async endpoints.
    Note: Supabase client itself is synchronous, but this wrapper
    provides async context manager interface for consistency.

    Usage:
        async with get_async_session() as db:
            result = db.table("organizations").select("*").execute()
    """
    client = SupabaseClientManager.get_service_client()
    try:
        yield client
    finally:
        # Supabase clients don't need explicit cleanup
        pass
