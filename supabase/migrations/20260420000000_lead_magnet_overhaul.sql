-- Lead magnet overhaul: add enrollment tracking, email suppressions, and
-- consent/unsubscribe columns. Replaces Apollo nurture with Resend scheduledAt.

-- Lead sequence enrollments: track Resend scheduled email IDs per lead
CREATE TABLE IF NOT EXISTS public.lead_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_lead_id UUID REFERENCES public.content_leads(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  sequence_id TEXT NOT NULL,
  asset_slug TEXT NOT NULL,
  resend_email_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_enrollments_email
  ON public.lead_sequence_enrollments(lower(email));

CREATE INDEX IF NOT EXISTS idx_enrollments_cancelled
  ON public.lead_sequence_enrollments(cancelled_at)
  WHERE cancelled_at IS NULL;

ALTER TABLE public.lead_sequence_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_enrollments"
  ON public.lead_sequence_enrollments;

CREATE POLICY "service_role_all_enrollments"
  ON public.lead_sequence_enrollments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Email suppressions: unsubscribe/bounce/complaint list
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('user_unsubscribe', 'bounce', 'complaint', 'manual')),
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_suppressions"
  ON public.email_suppressions;

CREATE POLICY "service_role_all_suppressions"
  ON public.email_suppressions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add consent and unsubscribe tracking to content_leads
ALTER TABLE public.content_leads
  ADD COLUMN IF NOT EXISTS consent_marketing BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
