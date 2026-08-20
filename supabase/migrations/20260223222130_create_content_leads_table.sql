-- Creates content_leads table for gated content lead capture (idempotent)
CREATE TABLE IF NOT EXISTS content_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    TEXT NOT NULL,
  email         TEXT NOT NULL,
  company       TEXT,
  asset_slug    TEXT NOT NULL,
  source        TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE content_leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'content_leads' AND policyname = 'anon_insert'
  ) THEN
    CREATE POLICY "anon_insert" ON content_leads FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'content_leads' AND policyname = 'service_read'
  ) THEN
    CREATE POLICY "service_read" ON content_leads FOR ALL TO service_role USING (true);
  END IF;
END $$;

GRANT INSERT ON public.content_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_leads TO service_role;

CREATE INDEX IF NOT EXISTS idx_content_leads_email ON content_leads(email);
CREATE INDEX IF NOT EXISTS idx_content_leads_asset ON content_leads(asset_slug);
