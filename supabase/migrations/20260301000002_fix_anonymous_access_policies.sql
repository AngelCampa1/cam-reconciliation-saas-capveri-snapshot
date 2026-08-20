-- Migration: Scope RLS policies to exclude anonymous users
-- Addresses: auth_allow_anonymous_sign_ins (Supabase Security Advisor)
-- Ref: https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0013_rls_policy_not_using_role
--
-- All user-facing RLS policies that lacked an explicit TO clause were
-- evaluated by the anon role. While auth.uid() checks prevent data leakage,
-- the linter correctly flags these as security risks. This migration adds
-- explicit TO authenticated (or TO service_role for service-only policies)
-- to every affected policy so the anon role never evaluates them.

-- ------------------------------------------------------------
-- actual_billed_amounts
-- ------------------------------------------------------------
ALTER POLICY "Users can view their organization's actual billed amounts"
    ON public.actual_billed_amounts TO authenticated;
ALTER POLICY "Users can create actual billed amounts for their organization"
    ON public.actual_billed_amounts TO authenticated;
ALTER POLICY "Users can update their organization's actual billed amounts"
    ON public.actual_billed_amounts TO authenticated;
ALTER POLICY "Users can delete their organization's actual billed amounts"
    ON public.actual_billed_amounts TO authenticated;

-- ------------------------------------------------------------
-- audit_log
-- ------------------------------------------------------------
ALTER POLICY "Audit log viewable by admins"
    ON public.audit_log TO authenticated;

-- ------------------------------------------------------------
-- audit_requests
-- ------------------------------------------------------------
ALTER POLICY "Anyone can create audit requests"
    ON public.audit_requests TO authenticated;
ALTER POLICY "Users can view audit requests"
    ON public.audit_requests TO authenticated;
ALTER POLICY "Users can update audit requests"
    ON public.audit_requests TO authenticated;

-- ------------------------------------------------------------
-- auth_events
-- ------------------------------------------------------------
ALTER POLICY "Service role and admins can access auth events"
    ON public.auth_events TO authenticated;

-- ------------------------------------------------------------
-- calculation_jobs
-- ------------------------------------------------------------
ALTER POLICY "calculation_jobs_select_policy"
    ON public.calculation_jobs TO authenticated;
ALTER POLICY "calculation_jobs_insert_policy"
    ON public.calculation_jobs TO authenticated;
ALTER POLICY "calculation_jobs_update_policy"
    ON public.calculation_jobs TO authenticated;
ALTER POLICY "calculation_jobs_delete_policy"
    ON public.calculation_jobs TO authenticated;

-- ------------------------------------------------------------
-- column_mappings
-- ------------------------------------------------------------
ALTER POLICY "Users can view org mappings"
    ON public.column_mappings TO authenticated;
ALTER POLICY "Users can create mappings"
    ON public.column_mappings TO authenticated;
ALTER POLICY "Users can update mappings"
    ON public.column_mappings TO authenticated;
ALTER POLICY "Admins can delete mappings"
    ON public.column_mappings TO authenticated;

-- ------------------------------------------------------------
-- data_retention_policies
-- ------------------------------------------------------------
ALTER POLICY "Platform admins can view retention policies"
    ON public.data_retention_policies TO authenticated;

-- ------------------------------------------------------------
-- dispute_attachments
-- ------------------------------------------------------------
ALTER POLICY "Users can view dispute attachments"
    ON public.dispute_attachments TO authenticated;
ALTER POLICY "Users can upload dispute attachments"
    ON public.dispute_attachments TO authenticated;

-- ------------------------------------------------------------
-- dispute_comments
-- ------------------------------------------------------------
ALTER POLICY "Users can view dispute comments"
    ON public.dispute_comments TO authenticated;
ALTER POLICY "Users can add dispute comments"
    ON public.dispute_comments TO authenticated;

-- ------------------------------------------------------------
-- disputes
-- ------------------------------------------------------------
ALTER POLICY "Users can view disputes"
    ON public.disputes TO authenticated;
ALTER POLICY "Tenants can create disputes"
    ON public.disputes TO authenticated;
ALTER POLICY "Landlords can update organization disputes"
    ON public.disputes TO authenticated;

-- ------------------------------------------------------------
-- documents
-- ------------------------------------------------------------
ALTER POLICY "Documents are viewable by organization members"
    ON public.documents TO authenticated;
ALTER POLICY "Documents are insertable by organization members"
    ON public.documents TO authenticated;
ALTER POLICY "Documents are updatable by organization members"
    ON public.documents TO authenticated;
ALTER POLICY "Documents are deletable by admins"
    ON public.documents TO authenticated;

-- ------------------------------------------------------------
-- expense_pools
-- ------------------------------------------------------------
ALTER POLICY "Expense pools viewable by organization members and linked tenants"
    ON public.expense_pools TO authenticated;
ALTER POLICY "Expense pools are insertable via property access"
    ON public.expense_pools TO authenticated;
ALTER POLICY "Expense pools are updatable via property access"
    ON public.expense_pools TO authenticated;
ALTER POLICY "Expense pools are deletable via property access"
    ON public.expense_pools TO authenticated;

-- ------------------------------------------------------------
-- extraction_jobs
-- ------------------------------------------------------------
ALTER POLICY "Users view org jobs"
    ON public.extraction_jobs TO authenticated;
ALTER POLICY "Users create org jobs"
    ON public.extraction_jobs TO authenticated;
ALTER POLICY "Users update org jobs"
    ON public.extraction_jobs TO authenticated;

-- ------------------------------------------------------------
-- feedback
-- ------------------------------------------------------------
ALTER POLICY "Users and admins can view feedback"
    ON public.feedback TO authenticated;
ALTER POLICY "Users can create feedback"
    ON public.feedback TO authenticated;
ALTER POLICY "Admins can update feedback status"
    ON public.feedback TO authenticated;

-- ------------------------------------------------------------
-- gl_entries
-- ------------------------------------------------------------
ALTER POLICY "GL entries viewable by organization members and linked tenants"
    ON public.gl_entries TO authenticated;
ALTER POLICY "GL entries are insertable via property access"
    ON public.gl_entries TO authenticated;

-- ------------------------------------------------------------
-- import_batches
-- ------------------------------------------------------------
ALTER POLICY "Import batches are viewable by organization members"
    ON public.import_batches TO authenticated;
ALTER POLICY "Import batches are insertable by organization members"
    ON public.import_batches TO authenticated;
ALTER POLICY "Import batches are updatable by organization members"
    ON public.import_batches TO authenticated;
ALTER POLICY "Import batches are deletable by admins"
    ON public.import_batches TO authenticated;

-- ------------------------------------------------------------
-- invoices (user-facing SELECT; INSERT/UPDATE are service-role-only)
-- ------------------------------------------------------------
ALTER POLICY "Invoices are viewable by organization members"
    ON public.invoices TO authenticated;
ALTER POLICY "Invoices are insertable by service role"
    ON public.invoices TO service_role;
ALTER POLICY "Invoices are updatable by service role"
    ON public.invoices TO service_role;

-- ------------------------------------------------------------
-- lease_term_versions
-- ------------------------------------------------------------
ALTER POLICY "Lease term versions are viewable via lease access"
    ON public.lease_term_versions TO authenticated;
ALTER POLICY "Lease term versions are insertable via lease access"
    ON public.lease_term_versions TO authenticated;
ALTER POLICY "Lease term versions are deletable by admins"
    ON public.lease_term_versions TO authenticated;

-- ------------------------------------------------------------
-- leases
-- ------------------------------------------------------------
ALTER POLICY "Leases viewable by org"
    ON public.leases TO authenticated;
ALTER POLICY "Leases insertable by org"
    ON public.leases TO authenticated;
ALTER POLICY "Leases updatable by org"
    ON public.leases TO authenticated;
ALTER POLICY "Leases deletable by org admins"
    ON public.leases TO authenticated;

-- ------------------------------------------------------------
-- ocr_results
-- ------------------------------------------------------------
ALTER POLICY "OCR results are viewable by organization members"
    ON public.ocr_results TO authenticated;
ALTER POLICY "OCR results are insertable by organization members"
    ON public.ocr_results TO authenticated;
ALTER POLICY "OCR results are updatable by organization members"
    ON public.ocr_results TO authenticated;

-- ------------------------------------------------------------
-- organizations
-- ------------------------------------------------------------
ALTER POLICY "Organizations are viewable by members"
    ON public.organizations TO authenticated;
ALTER POLICY "Owners can update organizations"
    ON public.organizations TO authenticated;

-- ------------------------------------------------------------
-- pool_allocations
-- ------------------------------------------------------------
ALTER POLICY "tenant_isolation_pool_allocations"
    ON public.pool_allocations TO authenticated;

-- ------------------------------------------------------------
-- pool_mappings
-- ------------------------------------------------------------
ALTER POLICY "Pool mappings viewable by organization members and linked tenants"
    ON public.pool_mappings TO authenticated;
ALTER POLICY "Pool mappings are insertable via pool access"
    ON public.pool_mappings TO authenticated;
ALTER POLICY "Pool mappings are updatable via pool access"
    ON public.pool_mappings TO authenticated;
ALTER POLICY "Pool mappings are deletable via pool access"
    ON public.pool_mappings TO authenticated;

-- ------------------------------------------------------------
-- pool_templates
-- ------------------------------------------------------------
ALTER POLICY "Users can view templates"
    ON public.pool_templates TO authenticated;
ALTER POLICY "Users can create org templates"
    ON public.pool_templates TO authenticated;
ALTER POLICY "Users can update org templates"
    ON public.pool_templates TO authenticated;
ALTER POLICY "Users can delete org templates"
    ON public.pool_templates TO authenticated;

-- ------------------------------------------------------------
-- promotion_redemptions
-- ------------------------------------------------------------
ALTER POLICY "Redemptions are viewable by organization members"
    ON public.promotion_redemptions TO authenticated;
ALTER POLICY "Redemptions are insertable by service role"
    ON public.promotion_redemptions TO service_role;

-- ------------------------------------------------------------
-- promotions
-- ------------------------------------------------------------
ALTER POLICY "Users can view promotions"
    ON public.promotions TO authenticated;
ALTER POLICY "Service role can manage promotions"
    ON public.promotions TO service_role;

-- ------------------------------------------------------------
-- properties
-- ------------------------------------------------------------
ALTER POLICY "Properties are viewable by organization members"
    ON public.properties TO authenticated;
ALTER POLICY "Properties are insertable by organization members"
    ON public.properties TO authenticated;
ALTER POLICY "Properties are updatable by organization members"
    ON public.properties TO authenticated;
ALTER POLICY "Properties are deletable by organization admins"
    ON public.properties TO authenticated;

-- ------------------------------------------------------------
-- reconciliation_campaigns
-- ------------------------------------------------------------
ALTER POLICY "Org members can view their campaigns"
    ON public.reconciliation_campaigns TO authenticated;
ALTER POLICY "Org members can create campaigns"
    ON public.reconciliation_campaigns TO authenticated;
ALTER POLICY "Org members can update their campaigns"
    ON public.reconciliation_campaigns TO authenticated;

-- ------------------------------------------------------------
-- reconciliation_snapshots
-- ------------------------------------------------------------
ALTER POLICY "Snapshots viewable by organization members and linked tenants"
    ON public.reconciliation_snapshots TO authenticated;
ALTER POLICY "Snapshots insertable by org members"
    ON public.reconciliation_snapshots TO authenticated;
ALTER POLICY "Draft snapshots updatable by org members"
    ON public.reconciliation_snapshots TO authenticated;
ALTER POLICY "Draft snapshots deletable by org admins"
    ON public.reconciliation_snapshots TO authenticated;

-- ------------------------------------------------------------
-- sb1103_requests
-- ------------------------------------------------------------
ALTER POLICY "sb1103_requests_select"
    ON public.sb1103_requests TO authenticated;
ALTER POLICY "sb1103_requests_insert"
    ON public.sb1103_requests TO authenticated;
ALTER POLICY "sb1103_requests_update"
    ON public.sb1103_requests TO authenticated;
ALTER POLICY "sb1103_requests_delete"
    ON public.sb1103_requests TO authenticated;

-- ------------------------------------------------------------
-- stripe_webhook_events (service role only — no user access)
-- ------------------------------------------------------------
ALTER POLICY "Service role only"
    ON public.stripe_webhook_events TO service_role;

-- ------------------------------------------------------------
-- subscriptions
-- ------------------------------------------------------------
ALTER POLICY "Subscriptions are viewable by organization members"
    ON public.subscriptions TO authenticated;
ALTER POLICY "Subscriptions are insertable by service role or owner"
    ON public.subscriptions TO authenticated;
ALTER POLICY "Subscriptions are updatable by organization members"
    ON public.subscriptions TO authenticated;

-- ------------------------------------------------------------
-- team_member_invitations
-- ------------------------------------------------------------
ALTER POLICY "Admins can view team invitations"
    ON public.team_member_invitations TO authenticated;
ALTER POLICY "Admins can create team invitations"
    ON public.team_member_invitations TO authenticated;
ALTER POLICY "Admins can update team invitations"
    ON public.team_member_invitations TO authenticated;
ALTER POLICY "Admins can delete team invitations"
    ON public.team_member_invitations TO authenticated;

-- ------------------------------------------------------------
-- tenant_email_preferences
-- ------------------------------------------------------------
ALTER POLICY "Users can view email preferences"
    ON public.tenant_email_preferences TO authenticated;
ALTER POLICY "Users can update email preferences"
    ON public.tenant_email_preferences TO authenticated;

-- ------------------------------------------------------------
-- tenant_invitations
-- ------------------------------------------------------------
ALTER POLICY "Admins can view invitations"
    ON public.tenant_invitations TO authenticated;
ALTER POLICY "Admins can create invitations"
    ON public.tenant_invitations TO authenticated;
ALTER POLICY "Admins can update invitations"
    ON public.tenant_invitations TO authenticated;
ALTER POLICY "Admins can delete invitations"
    ON public.tenant_invitations TO authenticated;

-- ------------------------------------------------------------
-- tenant_lease_links
-- ------------------------------------------------------------
ALTER POLICY "Users can view relevant lease links"
    ON public.tenant_lease_links TO authenticated;
ALTER POLICY "Admins can create lease links"
    ON public.tenant_lease_links TO authenticated;
ALTER POLICY "Admins can delete lease links"
    ON public.tenant_lease_links TO authenticated;

-- ------------------------------------------------------------
-- tenant_notifications
-- ------------------------------------------------------------
ALTER POLICY "Tenants can view own notifications"
    ON public.tenant_notifications TO authenticated;
ALTER POLICY "Tenants can update own notification read status"
    ON public.tenant_notifications TO authenticated;

-- ------------------------------------------------------------
-- tenant_users
-- ------------------------------------------------------------
ALTER POLICY "Tenant users can view their own profile"
    ON public.tenant_users TO authenticated;
ALTER POLICY "Admins can create tenant users"
    ON public.tenant_users TO authenticated;
ALTER POLICY "Admins can update tenant users"
    ON public.tenant_users TO authenticated;
ALTER POLICY "Admins can delete tenant users"
    ON public.tenant_users TO authenticated;

-- ------------------------------------------------------------
-- units
-- ------------------------------------------------------------
ALTER POLICY "Units are viewable via property access"
    ON public.units TO authenticated;
ALTER POLICY "Units are insertable via property access"
    ON public.units TO authenticated;
ALTER POLICY "Units are updatable via property access"
    ON public.units TO authenticated;
ALTER POLICY "Units are deletable via property access"
    ON public.units TO authenticated;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
ALTER POLICY "Users can view profiles"
    ON public.users TO authenticated;
ALTER POLICY "Users can update their own profile"
    ON public.users TO authenticated;
ALTER POLICY "Users insertable by admins or service"
    ON public.users TO authenticated;
ALTER POLICY "Owners can delete users"
    ON public.users TO authenticated;

-- ------------------------------------------------------------
-- warranty_certificates
-- ------------------------------------------------------------
ALTER POLICY "warranty_read_org_member"
    ON public.warranty_certificates TO authenticated;
-- Note: warranty_write_org_admin was split into three policies by 20260227000002_fix_rls_performance
ALTER POLICY "warranty_insert_org_admin"
    ON public.warranty_certificates TO authenticated;
ALTER POLICY "warranty_update_org_admin"
    ON public.warranty_certificates TO authenticated;
ALTER POLICY "warranty_delete_org_admin"
    ON public.warranty_certificates TO authenticated;

-- ------------------------------------------------------------
-- storage.objects — feedback screenshot admin delete policy
-- ------------------------------------------------------------
ALTER POLICY "Admins can delete org feedback screenshots"
    ON storage.objects TO authenticated;
