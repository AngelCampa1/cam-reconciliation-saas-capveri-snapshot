-- Export history: tracks every file export (PDF, Excel, Yardi, MRI) per property
CREATE TABLE public.export_history (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id       UUID        NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    format            TEXT        NOT NULL,
    file_name         TEXT        NOT NULL,
    file_size         BIGINT,
    status            TEXT        NOT NULL DEFAULT 'completed',
    created_by_name   TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_export_history_org        ON public.export_history (organization_id);
CREATE INDEX idx_export_history_property   ON public.export_history (property_id);
CREATE INDEX idx_export_history_created_at ON public.export_history (created_at DESC);

ALTER TABLE public.export_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "export_history_org_select"
    ON public.export_history FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM public.users WHERE id = auth.uid()
    ));

CREATE POLICY "export_history_org_insert"
    ON public.export_history FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.users WHERE id = auth.uid()
    ));

CREATE POLICY "export_history_service_all"
    ON public.export_history
    USING (auth.role() = 'service_role');

COMMENT ON TABLE public.export_history IS 'Tracks every file export (PDF, Excel, Yardi, MRI) generated per property.';
