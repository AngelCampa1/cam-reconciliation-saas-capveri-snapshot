"""
Database module for Supabase client configuration.

This module provides Supabase client instances for database operations.
"""

from app.database.client import (
    SupabaseClientManager,
    get_supabase,
    get_supabase_admin,
)

__all__ = [
    "SupabaseClientManager",
    "get_supabase",
    "get_supabase_admin",
]
