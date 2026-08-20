"""
API routes.

Root-level routes that don't require versioning (e.g., webhooks).
"""

from .webhooks import router as webhooks_router

__all__ = ["webhooks_router"]
