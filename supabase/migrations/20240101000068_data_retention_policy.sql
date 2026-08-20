-- Migration 068: Data Retention Policy
--
-- Creates the policy manifest table, seeds all 37 tables across
-- three retention tiers, and installs the run_retention_purge()
-- function that is scheduled weekly by migration 069.

CREATE TABLE public.data_retention_policies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name          TEXT NOT NULL UNIQUE,
    retention_category  TEXT NOT NULL
        CHECK (retention_category IN ('financial_permanent', 'operational', 'transient')),
    retention_years     INTEGER,
    purge_after_days    INTEGER,
    purge_condition     TEXT,
    legal_basis         TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view retention policies"
    ON public.data_retention_policies FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (SELECT auth.uid()) AND is_platform_admin = TRUE
        )
    );

INSERT INTO public.data_retention_policies
    (table_name, retention_category, retention_years, purge_after_days, purge_condition, legal_basis, notes)
VALUES
('organizations','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('users','financial_permanent',10,NULL,'Personal data anonymized within 30 days of account deletion; record retained','IRS SS 6001, GDPR Art. 17',NULL),
('properties','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('units','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('leases','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, state tenancy law',NULL),
('import_batches','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, Rev. Proc. 98-25',NULL),
('gl_entries','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP','Core financial ledger -- must never be purged'),
('reconciliation_snapshots','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('actual_billed_amounts','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('expense_pools','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('pool_mappings','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('pool_allocations','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('pool_templates','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('subscriptions','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('invoices','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('audit_log','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, SOC 2',NULL),
('disputes','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, state tenancy law',NULL),
('dispute_comments','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, state tenancy law',NULL),
('dispute_attachments','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, state tenancy law',NULL),
('audit_requests','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, GAAP',NULL),
('column_mappings','financial_permanent',10,NULL,'Never purged automatically; retained for full 10-year period','IRS SS 6001, Rev. Proc. 98-25',NULL),
('tenant_users','operational',3,NULL,'Removed on tenant offboarding after 3-year retention period','Business necessity, state tenancy law',NULL),
('tenant_lease_links','operational',3,NULL,'Removed on tenant offboarding after 3-year retention period','State tenancy law',NULL),
('tenant_invitations','operational',3,NULL,'Removed on tenant offboarding after 3-year retention period','Business necessity',NULL),
('team_member_invitations','operational',3,NULL,'Removed on account offboarding after 3-year retention period','Business necessity',NULL),
('tenant_email_preferences','operational',3,NULL,'Removed on tenant offboarding after 3-year retention period','CAN-SPAM, business necessity',NULL),
('promotions','operational',3,NULL,'Retained for 3 years for marketing analysis','Business necessity',NULL),
('promotion_redemptions','operational',3,NULL,'Retained for 3 years for billing audit trail','Business necessity, IRS SS 6001',NULL),
('feedback','operational',3,NULL,'Retained for 3 years for product analysis','Business necessity',NULL),
('ocr_results','operational',2,NULL,'Retained for 2 years; source documents retained separately per IRS rules','Business necessity','Raw OCR output only; underlying financial data lives in gl_entries'),
('content_leads','operational',3,NULL,'Retained for 3 years for marketing analysis','Business necessity, CAN-SPAM',NULL),
('tenant_email_logs','transient',NULL,2,'DELETE WHERE sent_at < NOW() - INTERVAL ''48 hours''','Operational necessity; email rate-limit dedup only','Uses sent_at column (not created_at)'),
('extraction_jobs','transient',NULL,90,'DELETE WHERE status IN (''completed'', ''failed'') AND completed_at < NOW() - INTERVAL ''90 days''','Operational necessity; job metadata only','In-progress and pending rows are never purged'),
('calculation_jobs','transient',NULL,90,'DELETE WHERE status IN (''completed'', ''failed'') AND completed_at < NOW() - INTERVAL ''90 days''','Operational necessity; job metadata only','In-progress and pending rows are never purged'),
('tenant_notifications','transient',NULL,90,'DELETE WHERE read_at IS NOT NULL AND created_at < NOW() - INTERVAL ''90 days''','Operational necessity; UI notifications only','Unread notifications (read_at IS NULL) are NEVER purged'),
('stripe_webhook_events','transient',NULL,90,'DELETE WHERE created_at < NOW() - INTERVAL ''90 days''','Operational necessity; idempotency dedup only','Billing outcomes are mirrored to invoices/subscriptions tables'),
('auth_events','transient',NULL,365,'DELETE WHERE timestamp < NOW() - INTERVAL ''365 days''','SOC 2 / incident-response lookback','Uses timestamp column (not created_at)');

CREATE OR REPLACE FUNCTION public.run_retention_purge()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result    JSONB := '{}'::JSONB;
    v_deleted   INTEGER;
    v_90d       TIMESTAMPTZ := NOW() - INTERVAL '90 days';
    v_48h       TIMESTAMPTZ := NOW() - INTERVAL '48 hours';
    v_365d      TIMESTAMPTZ := NOW() - INTERVAL '365 days';
BEGIN
    DELETE FROM public.extraction_jobs
    WHERE status IN ('completed', 'failed') AND completed_at < v_90d;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_result := v_result || jsonb_build_object('extraction_jobs', v_deleted);

    DELETE FROM public.calculation_jobs
    WHERE status IN ('completed', 'failed') AND completed_at < v_90d;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_result := v_result || jsonb_build_object('calculation_jobs', v_deleted);

    DELETE FROM public.tenant_notifications
    WHERE read_at IS NOT NULL AND created_at < v_90d;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_result := v_result || jsonb_build_object('tenant_notifications', v_deleted);

    DELETE FROM public.tenant_email_logs WHERE sent_at < v_48h;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_result := v_result || jsonb_build_object('tenant_email_logs', v_deleted);

    DELETE FROM public.auth_events WHERE timestamp < v_365d;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_result := v_result || jsonb_build_object('auth_events', v_deleted);

    DELETE FROM public.stripe_webhook_events WHERE created_at < v_90d;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_result := v_result || jsonb_build_object('stripe_webhook_events', v_deleted);

    RETURN jsonb_build_object('purge_timestamp', NOW(), 'rows_deleted', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.run_retention_purge() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_retention_purge() FROM authenticated;
