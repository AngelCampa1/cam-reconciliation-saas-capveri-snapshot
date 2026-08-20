# Story 23.1: Create Feedback Endpoints

## Story Info
- **Epic**: User Feedback
- **Estimated Hours**: 2
- **Dependencies**: Epic 4 (Backend Auth), Story 3.18 (Feedback Table)
- **Status**: `pending`

## User Story
**As a** user
**I want** to submit feedback through the API
**So that** my bug reports and feature requests are recorded

## Acceptance Criteria
- [ ] **AC1**: POST /feedback creates feedback entry
- [ ] **AC2**: Supports bug, feature_request, and general types
- [ ] **AC3**: Rate limiting: max 3 per hour per user
- [ ] **AC4**: Optional screenshot_url field
- [ ] **AC5**: Automatic capture of page_url and metadata
- [ ] **AC6**: GET /feedback (admin) lists all feedback

## Technical Specifications

**Backend - Feedback Models**:

```python
# backend/app/models/feedback.py
"""Feedback models."""
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class FeedbackType(str, Enum):
    """Type of feedback."""
    BUG = "bug"
    FEATURE_REQUEST = "feature_request"
    GENERAL = "general"


class FeedbackStatus(str, Enum):
    """Feedback review status."""
    NEW = "new"
    REVIEWED = "reviewed"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class FeedbackCreate(BaseModel):
    """Create feedback request."""
    type: FeedbackType
    message: str = Field(..., min_length=10, max_length=2000)
    page_url: Optional[str] = None
    screenshot_url: Optional[str] = None
    metadata: Optional[dict] = None


class FeedbackResponse(BaseModel):
    """Feedback response."""
    id: UUID
    user_id: UUID
    organization_id: UUID
    type: FeedbackType
    status: FeedbackStatus
    message: str
    page_url: Optional[str]
    screenshot_url: Optional[str]
    metadata: Optional[dict]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FeedbackUpdate(BaseModel):
    """Update feedback (admin)."""
    status: Optional[FeedbackStatus] = None
    admin_notes: Optional[str] = None
```

**Backend - Feedback Endpoints**:

```python
# backend/app/api/routes/feedback.py
"""Feedback API endpoints."""
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth.dependencies import get_current_user, require_admin
from app.database import get_db
from app.models.feedback import (
    FeedbackCreate,
    FeedbackResponse,
    FeedbackStatus,
    FeedbackType,
    FeedbackUpdate,
)

router = APIRouter(prefix="/feedback", tags=["feedback"])

# Rate limit: 3 per hour
RATE_LIMIT_COUNT = 3
RATE_LIMIT_WINDOW = timedelta(hours=1)


@router.post("", response_model=FeedbackResponse)
async def create_feedback(
    data: FeedbackCreate,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
):
    """
    Submit user feedback.

    Rate limited to 3 submissions per hour.
    """
    user_id = str(current_user.id)
    org_id = str(current_user.organization_id)

    # Check rate limit
    cutoff = (datetime.utcnow() - RATE_LIMIT_WINDOW).isoformat()
    recent = await db.table('feedback') \
        .select('id', count='exact') \
        .eq('user_id', user_id) \
        .gte('created_at', cutoff) \
        .execute()

    if (recent.count or 0) >= RATE_LIMIT_COUNT:
        raise HTTPException(
            429,
            f"Rate limit exceeded. Maximum {RATE_LIMIT_COUNT} submissions per hour."
        )

    # Create feedback
    result = await db.table('feedback') \
        .insert({
            'user_id': user_id,
            'organization_id': org_id,
            'type': data.type.value,
            'status': FeedbackStatus.NEW.value,
            'message': data.message,
            'page_url': data.page_url,
            'screenshot_url': data.screenshot_url,
            'metadata': data.metadata or {},
        }) \
        .execute()

    return FeedbackResponse(**result.data[0])


@router.get("", response_model=list[FeedbackResponse])
async def list_feedback(
    type: Optional[FeedbackType] = None,
    status: Optional[FeedbackStatus] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    _: None = Depends(require_admin),
    db = Depends(get_db),
):
    """List all feedback (admin only)."""
    query = db.table('feedback') \
        .select('*') \
        .order('created_at', desc=True)

    if type:
        query = query.eq('type', type.value)
    if status:
        query = query.eq('status', status.value)

    start = (page - 1) * per_page
    query = query.range(start, start + per_page - 1)

    result = await query.execute()
    return [FeedbackResponse(**f) for f in result.data]


@router.get("/my", response_model=list[FeedbackResponse])
async def list_my_feedback(
    current_user = Depends(get_current_user),
    db = Depends(get_db),
):
    """List current user's feedback submissions."""
    result = await db.table('feedback') \
        .select('*') \
        .eq('user_id', str(current_user.id)) \
        .order('created_at', desc=True) \
        .limit(20) \
        .execute()

    return [FeedbackResponse(**f) for f in result.data]


@router.get("/{feedback_id}", response_model=FeedbackResponse)
async def get_feedback(
    feedback_id: UUID,
    _: None = Depends(require_admin),
    db = Depends(get_db),
):
    """Get specific feedback (admin only)."""
    result = await db.table('feedback') \
        .select('*') \
        .eq('id', str(feedback_id)) \
        .single() \
        .execute()

    if not result.data:
        raise HTTPException(404, "Feedback not found")

    return FeedbackResponse(**result.data)


@router.patch("/{feedback_id}", response_model=FeedbackResponse)
async def update_feedback(
    feedback_id: UUID,
    data: FeedbackUpdate,
    _: None = Depends(require_admin),
    db = Depends(get_db),
):
    """Update feedback status (admin only)."""
    updates = {}
    if data.status:
        updates['status'] = data.status.value
    if data.admin_notes is not None:
        updates['metadata'] = {'admin_notes': data.admin_notes}

    if not updates:
        raise HTTPException(400, "No updates provided")

    updates['updated_at'] = datetime.utcnow().isoformat()

    result = await db.table('feedback') \
        .update(updates) \
        .eq('id', str(feedback_id)) \
        .execute()

    if not result.data:
        raise HTTPException(404, "Feedback not found")

    return FeedbackResponse(**result.data[0])


@router.get("/stats/summary")
async def get_feedback_stats(
    _: None = Depends(require_admin),
    db = Depends(get_db),
):
    """Get feedback statistics (admin only)."""
    result = await db.table('feedback') \
        .select('type, status') \
        .execute()

    feedback_list = result.data or []

    by_type = {}
    by_status = {}
    for f in feedback_list:
        by_type[f['type']] = by_type.get(f['type'], 0) + 1
        by_status[f['status']] = by_status.get(f['status'], 0) + 1

    return {
        "total": len(feedback_list),
        "by_type": by_type,
        "by_status": by_status,
    }
```

**Frontend Types**:

```typescript
// frontend/src/types/feedback.ts
export type FeedbackType = 'bug' | 'feature_request' | 'general'
export type FeedbackStatus = 'new' | 'reviewed' | 'resolved' | 'dismissed'

export interface Feedback {
  id: string
  user_id: string
  organization_id: string
  type: FeedbackType
  status: FeedbackStatus
  message: string
  page_url: string | null
  screenshot_url: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface FeedbackCreate {
  type: FeedbackType
  message: string
  page_url?: string
  screenshot_url?: string
  metadata?: Record<string, unknown>
}
```

## Test Cases

```python
def test_create_feedback():
    """Verify feedback creation."""
    response = client.post("/api/feedback", json={
        "type": "bug",
        "message": "The save button doesn't work on the settings page.",
        "page_url": "/settings",
    })
    assert response.status_code == 200
    assert response.json()["status"] == "new"

def test_create_feedback_rate_limit():
    """Verify rate limiting works."""
    # Submit 3 feedback items
    for _ in range(3):
        client.post("/api/feedback", json={
            "type": "general",
            "message": "Test message that is long enough.",
        })

    # 4th should fail
    response = client.post("/api/feedback", json={
        "type": "general",
        "message": "This should be rate limited now.",
    })
    assert response.status_code == 429

def test_list_feedback_admin_only():
    """Verify list is admin-only."""
    response = client.get("/api/feedback", headers=non_admin_headers)
    assert response.status_code == 403

def test_update_feedback_status():
    """Verify status update works."""
    response = client.patch(f"/api/feedback/{feedback_id}", json={
        "status": "reviewed",
    })
    assert response.status_code == 200
    assert response.json()["status"] == "reviewed"
```

## Definition of Done
- [ ] POST /feedback creates entry
- [ ] Rate limiting enforced (3/hour)
- [ ] GET /feedback lists all (admin)
- [ ] GET /feedback/my lists user's own
- [ ] PATCH updates status (admin)
- [ ] Stats endpoint works
