# Story 3.18: Create Feedback Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Story 3.3 (Users Table)
- **Status**: `completed`

## User Story
**As a** product team member
**I want** user feedback stored in the database
**So that** I can track and respond to bug reports and feature requests

## Acceptance Criteria
- [x] **AC1**: `feedback` table created with fields:
  - `id`, `user_id` (FK), `organization_id` (FK)
  - `type` (enum: bug, feature_request, general)
  - `status` (enum: new, reviewed, resolved, dismissed)
  - `message` (TEXT, min 10 chars)
  - `screenshot_url` (nullable)
  - `page_url`
  - `user_agent` (nullable)
  - `metadata` (JSONB)
  - Timestamps
- [x] **AC2**: RLS: users can view/create their own feedback
- [x] **AC3**: RLS: admins can view all feedback in organization
- [x] **AC4**: Index on organization_id, status, created_at
- [x] **AC5**: Rate limiting via database (max 10 per hour per user)

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000015_create_feedback.sql
```

**Migration SQL**:
```sql
-- Create feedback type enum
CREATE TYPE public.feedback_type AS ENUM (
    'bug',
    'feature_request',
    'general'
);

-- Create feedback status enum
CREATE TYPE public.feedback_status AS ENUM (
    'new',
    'reviewed',
    'resolved',
    'dismissed'
);

-- Create feedback table
CREATE TABLE public.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    type public.feedback_type NOT NULL DEFAULT 'general',
    status public.feedback_status NOT NULL DEFAULT 'new',
    message TEXT NOT NULL CHECK (LENGTH(message) >= 10 AND LENGTH(message) <= 5000),
    screenshot_url TEXT,
    page_url VARCHAR(2000) NOT NULL,
    user_agent VARCHAR(500),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feedback_organization_id ON public.feedback(organization_id);
CREATE INDEX idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX idx_feedback_status ON public.feedback(status);
CREATE INDEX idx_feedback_type ON public.feedback(type);
CREATE INDEX idx_feedback_created_at ON public.feedback(created_at DESC);

-- Composite index for rate limiting query
CREATE INDEX idx_feedback_user_hourly
    ON public.feedback(user_id, created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_feedback_updated_at
    BEFORE UPDATE ON public.feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Rate limiting function
CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
    recent_count INTEGER;
BEGIN
    -- Count feedback from this user in the last hour
    SELECT COUNT(*) INTO recent_count
    FROM public.feedback
    WHERE user_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '1 hour';

    IF recent_count >= 10 THEN
        RAISE EXCEPTION 'Rate limit exceeded: maximum 10 feedback submissions per hour';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_feedback_rate_limit
    BEFORE INSERT ON public.feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.check_feedback_rate_limit();

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own feedback
CREATE POLICY "Users can view their own feedback"
    ON public.feedback
    FOR SELECT
    USING (user_id = auth.uid());

-- Admins/owners can view all feedback in their organization
CREATE POLICY "Admins can view all organization feedback"
    ON public.feedback
    FOR SELECT
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Users can create feedback for themselves
CREATE POLICY "Users can create feedback"
    ON public.feedback
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND organization_id = public.get_user_organization_id()
    );

-- Only admins can update feedback status
CREATE POLICY "Admins can update feedback status"
    ON public.feedback
    FOR UPDATE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        organization_id = public.get_user_organization_id()
    );

-- No DELETE - feedback is retained for analysis

-- Grant permissions
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT UPDATE ON public.feedback TO authenticated;

COMMENT ON TABLE public.feedback IS 'User feedback, bug reports, and feature requests';
COMMENT ON COLUMN public.feedback.metadata IS 'JSONB: browser, os, viewport, console_errors';
COMMENT ON COLUMN public.feedback.screenshot_url IS 'URL to uploaded screenshot in Supabase Storage';
```

## Metadata Schema

```json
{
  "browser": "Chrome 120.0.0",
  "os": "Windows 11",
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "console_errors": [
    "TypeError: Cannot read property 'id' of undefined"
  ],
  "component_stack": "at ReconciliationGrid > at PropertyPage"
}
```

## Definition of Done
- [x] Feedback table created with all fields
- [x] Type and status enums created
- [x] Rate limiting trigger works (10/hour max)
- [x] RLS: users see own, admins see org
- [x] No delete policy (feedback retained)

## Implementation Notes
- Rate limiting enforced at database level via trigger
- Screenshot URL points to Supabase Storage bucket
- Metadata captures diagnostic context (browser, errors)
- Status updates restricted to admin/owner roles
- Message length validated (10-5000 chars)
