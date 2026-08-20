CREATE TABLE public.warranty_certificates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_id             UUID NOT NULL REFERENCES public.reconciliation_snapshots(id) ON DELETE RESTRICT,
  status                  VARCHAR(30) NOT NULL DEFAULT 'pending_attestation'
                            CHECK (status IN ('pending_attestation','eligible','issued','voided')),
  ingestion_batch_ids     UUID[] NOT NULL DEFAULT '{}',
  data_attested_at        TIMESTAMPTZ,
  data_attested_by        UUID REFERENCES auth.users(id),
  certificate_number      VARCHAR(20) UNIQUE,
  issued_at               TIMESTAMPTZ,
  issued_by               UUID REFERENCES auth.users(id),
  voided_at               TIMESTAMPTZ,
  void_reason             TEXT,
  certificate_pdf_checksum VARCHAR(64),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_certificate_per_snapshot UNIQUE (snapshot_id)
);

-- Indexes
CREATE INDEX idx_warranty_certificates_org ON public.warranty_certificates(organization_id);
CREATE INDEX idx_warranty_certificates_status ON public.warranty_certificates(organization_id, status);

-- RLS
ALTER TABLE public.warranty_certificates ENABLE ROW LEVEL SECURITY;

-- Members can read their org's certificates
CREATE POLICY "warranty_read_org_member" ON public.warranty_certificates
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
  );

-- Owners/admins can insert/update/delete
CREATE POLICY "warranty_write_org_admin" ON public.warranty_certificates
  FOR ALL USING (
    organization_id = public.get_user_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Auto-update updated_at
CREATE TRIGGER update_warranty_certificates_updated_at
  BEFORE UPDATE ON public.warranty_certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.warranty_certificates IS
  'E&O warranty certificates issued against finalized reconciliation snapshots.';
