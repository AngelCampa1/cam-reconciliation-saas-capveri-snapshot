-- Add missing table grants for user-scoped backend endpoints.
-- RLS still enforces row-level access; these grants allow the policies to run.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pool_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculation_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sb1103_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_certificates TO authenticated;

GRANT SELECT, UPDATE ON public.tenant_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_email_preferences TO authenticated;

GRANT INSERT ON public.tenant_notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_email_preferences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_email_logs TO service_role;

DROP POLICY IF EXISTS "Service can insert notifications" ON public.tenant_notifications;
CREATE POLICY "Service can insert notifications"
    ON public.tenant_notifications
    FOR INSERT
    TO service_role
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service can manage preferences" ON public.tenant_email_preferences;
CREATE POLICY "Service can manage preferences"
    ON public.tenant_email_preferences
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service can manage email logs" ON public.tenant_email_logs;
CREATE POLICY "Service can manage email logs"
    ON public.tenant_email_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

ALTER TABLE public.pool_allocations
    DROP CONSTRAINT IF EXISTS check_percentage_allocation_value_max,
    ADD CONSTRAINT check_percentage_allocation_value_max
        CHECK (
            allocation_type != 'percentage'::public.allocation_type
            OR allocation_value <= 100
        );
