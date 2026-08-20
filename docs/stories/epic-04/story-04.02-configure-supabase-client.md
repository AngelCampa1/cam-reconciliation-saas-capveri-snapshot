# Story 4.2: Configure Supabase Client

### User Story
**As a** developer
**I want** a properly configured Supabase client
**So that** I can interact with the database and auth system

### Acceptance Criteria

- [x] **AC1**: Async Supabase client configured with connection pooling
- [x] **AC2**: Client reads credentials from environment variables
- [x] **AC3**: Service role client available for admin operations
- [x] **AC4**: Client can successfully connect and query
- [x] **AC5**: Connection errors handled gracefully

### Technical Specifications

**Files to Create**:
```
backend/app/
└── database/
    ├── __init__.py
    └── client.py
```

**client.py**:
```python
"""
Supabase client configuration.

Provides both authenticated user client and service role client.
"""
from functools import lru_cache
from typing import Optional

from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions

from app.config import settings


class SupabaseClientManager:
    """Manages Supabase client instances."""

    _anon_client: Optional[Client] = None
    _service_client: Optional[Client] = None

    @classmethod
    def get_anon_client(cls) -> Client:
        """Get the anonymous/public Supabase client.

        This client respects RLS policies and is used for
        user-authenticated requests.
        """
        if cls._anon_client is None:
            cls._anon_client = create_client(
                settings.supabase_url,
                settings.supabase_anon_key,
                options=ClientOptions(
                    auto_refresh_token=True,
                    persist_session=False,
                ),
            )
        return cls._anon_client

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
    async def verify_connection(cls) -> bool:
        """Verify that the Supabase connection is working."""
        try:
            client = cls.get_service_client()
            # Simple query to verify connection
            result = client.table("organizations").select("id").limit(1).execute()
            return True
        except Exception as e:
            return False


def get_supabase() -> Client:
    """Dependency injection for Supabase client."""
    return SupabaseClientManager.get_anon_client()


def get_supabase_admin() -> Client:
    """Dependency injection for admin Supabase client."""
    return SupabaseClientManager.get_service_client()
```

**Test file** (`backend/tests/test_database_client.py`):
```python
"""Tests for Supabase client configuration."""
import pytest
from app.database.client import SupabaseClientManager


class TestSupabaseClient:
    """Test Supabase client initialization and connection."""

    def test_anon_client_initialized(self):
        """Anon client should be created successfully."""
        client = SupabaseClientManager.get_anon_client()
        assert client is not None

    def test_service_client_initialized(self):
        """Service client should be created successfully."""
        client = SupabaseClientManager.get_service_client()
        assert client is not None

    def test_clients_are_singletons(self):
        """Clients should be reused (singleton pattern)."""
        client1 = SupabaseClientManager.get_anon_client()
        client2 = SupabaseClientManager.get_anon_client()
        assert client1 is client2

    @pytest.mark.asyncio
    async def test_connection_verification(self):
        """Connection verification should succeed with valid credentials."""
        result = await SupabaseClientManager.verify_connection()
        assert result is True
```

### Definition of Done
- [x] Client connects to Supabase
- [x] Both anon and service clients work
- [x] Connection test passes
- [x] Credentials loaded from env

### Estimated Time: 2 hours

### Completion Notes

**Completed**: 2025-12-28

**Implementation**:
- Created `backend/app/database/__init__.py` with module exports
- Created `backend/app/database/client.py` with SupabaseClientManager
- Anon client for user-authenticated requests (respects RLS)
- Service client for admin operations (bypasses RLS)
- Singleton pattern for client caching
- `reset_clients()` method for testing
- `verify_connection()` async method for health checks
- Dependency injection functions: `get_supabase()` and `get_supabase_admin()`

**Files Created/Modified**:
- `backend/app/database/__init__.py` (new)
- `backend/app/database/client.py` (new)
- `backend/tests/test_database_client.py` (new, 21 tests)

**Test Results**: 21 new tests, 716 total backend tests passing, 99.72% coverage

---
