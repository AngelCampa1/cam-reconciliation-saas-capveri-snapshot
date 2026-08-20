"""
API Router Module.

This module exports the main API router that includes all versioned API routes.
The router is mounted at /api/v1 in the main application.
"""

from fastapi import APIRouter

from app.api.v1 import router as v1_router

# Main API router - includes all versioned routes
router = APIRouter()

# Include version 1 routes
# Note: The /api/v1 prefix is added in main.py when mounting this router
router.include_router(v1_router)

__all__ = ["router"]
