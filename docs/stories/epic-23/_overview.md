# Epic 23: User Feedback

## Epic Overview
**Goal**: Implement an in-app feedback widget for bug reports, feature requests, and general feedback with optional screenshot capture.

**Business Value**: Gather actionable user feedback directly within the application to improve product quality and user satisfaction.

## Stories

| ID | Story | Hours | Dependencies |
|----|-------|-------|--------------|
| 23.1 | Create Feedback Endpoints | 2 | Epic 4 (Backend Auth) |
| 23.2 | Create Feedback Widget Component | 3 | Epic 1 (UI Components) |
| 23.3 | Create Screenshot Capture | 2 | 23.2 |
| 23.4 | Create Feedback Admin Dashboard | 3 | 23.1 |

**Total Estimated Hours**: 10

## Feedback Types

1. **Bug Report** - Something isn't working correctly
2. **Feature Request** - Suggestion for new functionality
3. **General** - General feedback or questions

## Widget Features

### User-Facing
- Floating button (configurable position)
- Type selector (Bug / Feature / General)
- Text input with character limit
- Optional screenshot capture
- Automatic context capture (page URL, user info)

### Automatic Context
- Current page URL
- User ID and organization
- Browser/device info
- Timestamp

## Technical Architecture

### Database
Uses local `feedback` table (Story 3.18) with:
- `id`, `user_id`, `organization_id`
- `type` (bug/feature/general)
- `status` (new/reviewed/resolved/dismissed)
- `message` text
- `screenshot_url` (optional, stored in Supabase Storage)
- `page_url`, `metadata` JSONB

### Screenshot Capture
- Uses `html2canvas` library for client-side capture
- Uploads to Supabase Storage
- Returns public URL for admin viewing

### Rate Limiting
- Maximum 3 feedback submissions per hour per user
- Prevents spam while allowing legitimate feedback

## Dependencies

### Required Before Starting
- Epic 4 (Backend Auth) - User authentication
- Epic 1 (UI Components) - Button, Dialog, Form components
- Story 3.18 (Feedback Table) - Database schema

### Not Required
- ~~Story 2.18 (Feedback Model)~~ - Simple enough to inline

## Key Files

### Backend
```
backend/app/
├── api/routes/
│   └── feedback.py         # CRUD endpoints
└── services/
    └── feedback.py         # Business logic
```

### Frontend
```
frontend/src/
├── components/
│   └── FeedbackWidget/
│       ├── FeedbackWidget.tsx
│       ├── FeedbackForm.tsx
│       └── ScreenshotCapture.tsx
└── pages/admin/
    └── Feedback.tsx        # Admin dashboard
```

## User Flow

1. User clicks floating feedback button
2. Modal opens with type selection
3. User writes message
4. (Optional) User clicks "Attach Screenshot"
5. Screenshot captured and previewed
6. User submits feedback
7. Thank you message shown
8. Admin notified (optional)

## Admin Flow

1. Admin views feedback dashboard
2. Filters by type/status
3. Reviews individual feedback
4. Views screenshot if attached
5. Updates status (reviewed/resolved/dismissed)
6. Optionally responds (future enhancement)

## Out of Scope

- Email notifications to admins (future)
- Direct response to users (future)
- Public feedback board (future)
- Voting/prioritization system (future)
- Integration with external tools (Jira, Linear, etc.)
