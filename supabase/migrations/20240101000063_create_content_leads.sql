-- Migration: Create Content Leads Table
-- Description: Stores leads captured from gated content (lead magnets, downloads)
-- Used by: LeadCaptureForm, content download flows

CREATE TABLE public.content_leads (
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

ALTER TABLE public.content_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert" ON public.content_leads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service_read" ON public.content_leads FOR ALL TO service_role USING (true);

CREATE INDEX IF NOT EXISTS idx_content_leads_email ON public.content_leads(email);
CREATE INDEX IF NOT EXISTS idx_content_leads_asset ON public.content_leads(asset_slug);
