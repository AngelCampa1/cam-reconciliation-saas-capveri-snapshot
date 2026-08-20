-- Migration: Fix RLS Performance Issues
-- Description: Wrap auth.uid() in subqueries and combine multiple permissive policies
-- Issue: Supabase linter warnings for auth_rls_initplan and multiple_permissive_policies
--
-- Performance Impact:
-- - auth.uid() called directly is re-evaluated for each row
-- - (select auth.uid()) is evaluated once per query and cached
-- - Multiple permissive policies require evaluating ALL policies for EVERY row
-- - Single combined policy with OR is more efficient
--
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ============================================================================
-- USERS TABLE
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view users in their organization" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can insert users" ON public.users;
DROP POLICY IF EXISTS "Service role can insert users for signup" ON public.users;
DROP POLICY IF EXISTS "Owners can delete users" ON public.users;

-- Combined SELECT policy (was 2 separate policies)
CREATE POLICY "Users can view profiles"
    ON public.users
    FOR SELECT
    USING (
        id = (select auth.uid())
        OR organization_id = public.get_user_organization_id()
    );

-- UPDATE policy with wrapped auth.uid()
CREATE POLICY "Users can update their own profile"
    ON public.users
    FOR UPDATE
    USING (id = (select auth.uid()))
    WITH CHECK (
        id = (select auth.uid())
        AND organization_id = public.get_user_organization_id()
    );

-- Combined INSERT policy (was 2 separate policies)
CREATE POLICY "Users insertable by admins or service"
    ON public.users
    FOR INSERT
    WITH CHECK (
        -- Service role / trigger context (no auth)
        (select auth.uid()) IS NULL
        -- User creating own record
        OR id = (select auth.uid())
        -- Admins creating users in their org
        OR (
            organization_id = public.get_user_organization_id()
            AND EXISTS (
                SELECT 1 FROM public.users
                WHERE id = (select auth.uid())
                AND role IN ('owner', 'admin')
            )
        )
    );

-- DELETE policy with wrapped auth.uid()
CREATE POLICY "Owners can delete users"
    ON public.users
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND id != (select auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role = 'owner'
        )
    );

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Owners can update organizations" ON public.organizations;

CREATE POLICY "Owners can update organizations"
    ON public.organizations
    FOR UPDATE
    USING (id = public.get_user_organization_id())
    WITH CHECK (
        id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role = 'owner'
        )
    );

-- ============================================================================
-- PROPERTIES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Properties are deletable by organization admins" ON public.properties;

CREATE POLICY "Properties are deletable by organization admins"
    ON public.properties
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- FEEDBACK TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Admins can view all organization feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can create feedback" ON public.feedback;
DROP POLICY IF EXISTS "Admins can update feedback status" ON public.feedback;

-- Combined SELECT policy (was 2 separate policies)
CREATE POLICY "Users and admins can view feedback"
    ON public.feedback
    FOR SELECT
    USING (
        user_id = (select auth.uid())
        OR (
            organization_id = public.get_user_organization_id()
            AND EXISTS (
                SELECT 1 FROM public.users
                WHERE id = (select auth.uid())
                AND role IN ('owner', 'admin')
            )
        )
    );

CREATE POLICY "Users can create feedback"
    ON public.feedback
    FOR INSERT
    WITH CHECK (
        user_id = (select auth.uid())
        AND organization_id = public.get_user_organization_id()
    );

CREATE POLICY "Admins can update feedback status"
    ON public.feedback
    FOR UPDATE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        organization_id = public.get_user_organization_id()
    );

-- ============================================================================
-- UNITS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Units are deletable via property access" ON public.units;

CREATE POLICY "Units are deletable via property access"
    ON public.units
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- IMPORT_BATCHES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Import batches are deletable by admins" ON public.import_batches;

CREATE POLICY "Import batches are deletable by admins"
    ON public.import_batches
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- DISPUTES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Tenants can view own disputes" ON public.disputes;
DROP POLICY IF EXISTS "Landlords can view organization disputes" ON public.disputes;
DROP POLICY IF EXISTS "Tenants can create disputes" ON public.disputes;
DROP POLICY IF EXISTS "Landlords can update organization disputes" ON public.disputes;

-- Combined SELECT policy (was 2 separate policies)
CREATE POLICY "Users can view disputes"
    ON public.disputes
    FOR SELECT
    USING (
        -- Tenants can see their own disputes
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
        )
        OR
        -- Landlords can see organization disputes
        organization_id IN (
            SELECT organization_id FROM users WHERE id = (select auth.uid())
        )
    );

CREATE POLICY "Tenants can create disputes"
    ON public.disputes
    FOR INSERT
    WITH CHECK (
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
        )
    );

CREATE POLICY "Landlords can update organization disputes"
    ON public.disputes
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = (select auth.uid())
        )
    );

-- ============================================================================
-- DISPUTE_COMMENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Tenants can view own dispute comments" ON public.dispute_comments;
DROP POLICY IF EXISTS "Landlords can view organization dispute comments" ON public.dispute_comments;
DROP POLICY IF EXISTS "Tenants can add comments to own disputes" ON public.dispute_comments;
DROP POLICY IF EXISTS "Landlords can add comments to organization disputes" ON public.dispute_comments;

-- Combined SELECT policy (was 2 separate policies)
CREATE POLICY "Users can view dispute comments"
    ON public.dispute_comments
    FOR SELECT
    USING (
        -- Tenants can see non-internal comments on their disputes
        (
            dispute_id IN (
                SELECT id FROM disputes
                WHERE tenant_user_id IN (
                    SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
                )
            )
            AND is_internal = FALSE
        )
        OR
        -- Landlords can see all comments on organization disputes
        dispute_id IN (
            SELECT id FROM disputes
            WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = (select auth.uid())
            )
        )
    );

-- Combined INSERT policy (was 2 separate policies)
CREATE POLICY "Users can add dispute comments"
    ON public.dispute_comments
    FOR INSERT
    WITH CHECK (
        author_id = (select auth.uid())
        AND (
            -- Tenants can add non-internal comments to their disputes
            (
                dispute_id IN (
                    SELECT id FROM disputes
                    WHERE tenant_user_id IN (
                        SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
                    )
                )
                AND is_internal = FALSE
            )
            OR
            -- Landlords can add any comments to organization disputes
            dispute_id IN (
                SELECT id FROM disputes
                WHERE organization_id IN (
                    SELECT organization_id FROM users WHERE id = (select auth.uid())
                )
            )
        )
    );

-- ============================================================================
-- DISPUTE_ATTACHMENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Tenants can view own dispute attachments" ON public.dispute_attachments;
DROP POLICY IF EXISTS "Landlords can view organization dispute attachments" ON public.dispute_attachments;
DROP POLICY IF EXISTS "Tenants can upload to own disputes" ON public.dispute_attachments;
DROP POLICY IF EXISTS "Landlords can upload to organization disputes" ON public.dispute_attachments;

-- Combined SELECT policy (was 2 separate policies)
CREATE POLICY "Users can view dispute attachments"
    ON public.dispute_attachments
    FOR SELECT
    USING (
        -- Tenants can see attachments on their disputes
        dispute_id IN (
            SELECT id FROM disputes
            WHERE tenant_user_id IN (
                SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
            )
        )
        OR
        -- Landlords can see attachments on organization disputes
        dispute_id IN (
            SELECT id FROM disputes
            WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = (select auth.uid())
            )
        )
    );

-- Combined INSERT policy (was 2 separate policies)
CREATE POLICY "Users can upload dispute attachments"
    ON public.dispute_attachments
    FOR INSERT
    WITH CHECK (
        uploaded_by = (select auth.uid())
        AND (
            -- Tenants can upload to their disputes
            dispute_id IN (
                SELECT id FROM disputes
                WHERE tenant_user_id IN (
                    SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
                )
            )
            OR
            -- Landlords can upload to organization disputes
            dispute_id IN (
                SELECT id FROM disputes
                WHERE organization_id IN (
                    SELECT organization_id FROM users WHERE id = (select auth.uid())
                )
            )
        )
    );

-- ============================================================================
-- RECONCILIATION_SNAPSHOTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Snapshots viewable by organization members and linked tenants" ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Snapshots are insertable via property access" ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Snapshots insertable by org" ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Only draft snapshots can be updated" ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Snapshots updatable by org" ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Only draft snapshots can be deleted" ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Snapshots deletable by org admins" ON public.reconciliation_snapshots;

-- SELECT policy with wrapped auth.uid()
CREATE POLICY "Snapshots viewable by organization members and linked tenants"
    ON public.reconciliation_snapshots
    FOR SELECT
    USING (
        -- Organization members (fast path using organization_id column)
        organization_id = public.get_user_organization_id()
        OR
        -- Tenant users with lease access
        property_id IN (
            SELECT l.property_id
            FROM public.leases l
            JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
            JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
            WHERE tu.user_id = (select auth.uid())
        )
    );

-- Combined INSERT policy (was 2 separate policies)
CREATE POLICY "Snapshots insertable by org members"
    ON public.reconciliation_snapshots
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_organization_id()
        OR EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- Combined UPDATE policy (was 2 separate policies)
CREATE POLICY "Draft snapshots updatable by org members"
    ON public.reconciliation_snapshots
    FOR UPDATE
    USING (
        status = 'draft'
        AND (
            organization_id = public.get_user_organization_id()
            OR EXISTS (
                SELECT 1 FROM public.properties
                WHERE id = property_id
                AND organization_id = public.get_user_organization_id()
            )
        )
    )
    WITH CHECK (
        organization_id = public.get_user_organization_id()
        OR EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- Combined DELETE policy (was 2 separate policies)
CREATE POLICY "Draft snapshots deletable by org admins"
    ON public.reconciliation_snapshots
    FOR DELETE
    USING (
        status = 'draft'
        AND (
            organization_id = public.get_user_organization_id()
            OR EXISTS (
                SELECT 1 FROM public.properties
                WHERE id = property_id
                AND organization_id = public.get_user_organization_id()
            )
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- AUDIT_LOG TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Audit log viewable by admins" ON public.audit_log;

CREATE POLICY "Audit log viewable by admins"
    ON public.audit_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Subscriptions are insertable by service role or owner" ON public.subscriptions;

CREATE POLICY "Subscriptions are insertable by service role or owner"
    ON public.subscriptions
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role = 'owner'
        )
    );

-- ============================================================================
-- CALCULATION_JOBS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "calculation_jobs_select_policy" ON public.calculation_jobs;
DROP POLICY IF EXISTS "calculation_jobs_insert_policy" ON public.calculation_jobs;
DROP POLICY IF EXISTS "calculation_jobs_update_policy" ON public.calculation_jobs;
DROP POLICY IF EXISTS "calculation_jobs_delete_policy" ON public.calculation_jobs;

CREATE POLICY "calculation_jobs_select_policy"
    ON public.calculation_jobs
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
        )
    );

CREATE POLICY "calculation_jobs_insert_policy"
    ON public.calculation_jobs
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
        )
    );

CREATE POLICY "calculation_jobs_update_policy"
    ON public.calculation_jobs
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
        )
    );

CREATE POLICY "calculation_jobs_delete_policy"
    ON public.calculation_jobs
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
        )
        AND status IN ('pending', 'failed')
    );

-- ============================================================================
-- DOCUMENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Documents are deletable by admins" ON public.documents;

CREATE POLICY "Documents are deletable by admins"
    ON public.documents
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- TENANT_USERS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Tenant users can view their own profile" ON public.tenant_users;
DROP POLICY IF EXISTS "Admins can create tenant users" ON public.tenant_users;
DROP POLICY IF EXISTS "Admins can update tenant users" ON public.tenant_users;
DROP POLICY IF EXISTS "Admins can delete tenant users" ON public.tenant_users;

CREATE POLICY "Tenant users can view their own profile"
    ON public.tenant_users
    FOR SELECT
    USING (
        user_id = (select auth.uid())
        OR organization_id = public.get_user_organization_id()
    );

CREATE POLICY "Admins can create tenant users"
    ON public.tenant_users
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can update tenant users"
    ON public.tenant_users
    FOR UPDATE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can delete tenant users"
    ON public.tenant_users
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- TENANT_LEASE_LINKS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view relevant lease links" ON public.tenant_lease_links;
DROP POLICY IF EXISTS "Admins can create lease links" ON public.tenant_lease_links;
DROP POLICY IF EXISTS "Admins can delete lease links" ON public.tenant_lease_links;

CREATE POLICY "Users can view relevant lease links"
    ON public.tenant_lease_links
    FOR SELECT
    USING (
        tenant_user_id IN (
            SELECT id FROM public.tenant_users WHERE user_id = (select auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.leases l
            JOIN public.properties p ON l.property_id = p.id
            WHERE l.id = tenant_lease_links.lease_id
            AND p.organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Admins can create lease links"
    ON public.tenant_lease_links
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.leases l
            JOIN public.properties p ON l.property_id = p.id
            WHERE l.id = lease_id
            AND p.organization_id = public.get_user_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can delete lease links"
    ON public.tenant_lease_links
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.leases l
            JOIN public.properties p ON l.property_id = p.id
            WHERE l.id = lease_id
            AND p.organization_id = public.get_user_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- TENANT_INVITATIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view invitations" ON public.tenant_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON public.tenant_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON public.tenant_invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON public.tenant_invitations;

CREATE POLICY "Admins can view invitations"
    ON public.tenant_invitations
    FOR SELECT
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can create invitations"
    ON public.tenant_invitations
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can update invitations"
    ON public.tenant_invitations
    FOR UPDATE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can delete invitations"
    ON public.tenant_invitations
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- GL_ENTRIES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "GL entries viewable by organization members and linked tenants" ON public.gl_entries;
DROP POLICY IF EXISTS "GL entries are insertable via property access" ON public.gl_entries;

CREATE POLICY "GL entries viewable by organization members and linked tenants"
    ON public.gl_entries
    FOR SELECT
    USING (
        -- Organization members via property lookup
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
        OR
        -- Tenant users with lease access
        property_id IN (
            SELECT l.property_id
            FROM public.leases l
            JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
            JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
            WHERE tu.user_id = (select auth.uid())
        )
    );

CREATE POLICY "GL entries are insertable via property access"
    ON public.gl_entries
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND (
                -- Normal authenticated user check
                organization_id = public.get_user_organization_id()
                OR
                -- Service role with organization context set via session variable
                organization_id::text = (select current_setting('request.jwt.claims.organization_id', true))
            )
        )
    );

-- ============================================================================
-- EXPENSE_POOLS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Expense pools viewable by organization members and linked tenants" ON public.expense_pools;

CREATE POLICY "Expense pools viewable by organization members and linked tenants"
    ON public.expense_pools
    FOR SELECT
    USING (
        -- Organization members via property lookup
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
        OR
        -- Tenant users with lease access
        property_id IN (
            SELECT l.property_id
            FROM public.leases l
            JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
            JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
            WHERE tu.user_id = (select auth.uid())
        )
    );

-- ============================================================================
-- POOL_MAPPINGS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Pool mappings viewable by organization members and linked tenan" ON public.pool_mappings;

CREATE POLICY "Pool mappings viewable by organization members and linked tenants"
    ON public.pool_mappings
    FOR SELECT
    USING (
        -- Organization members via expense_pool -> property chain
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_organization_id()
        )
        OR
        -- Tenant users with lease access
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.leases l ON l.property_id = ep.property_id
            JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
            JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
            WHERE ep.id = expense_pool_id
            AND tu.user_id = (select auth.uid())
        )
    );

-- ============================================================================
-- TENANT_NOTIFICATIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Tenants can view own notifications" ON public.tenant_notifications;
DROP POLICY IF EXISTS "Tenants can update own notification read status" ON public.tenant_notifications;

CREATE POLICY "Tenants can view own notifications"
    ON public.tenant_notifications
    FOR SELECT
    USING (
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
        )
    );

CREATE POLICY "Tenants can update own notification read status"
    ON public.tenant_notifications
    FOR UPDATE
    USING (
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
        )
    );

-- ============================================================================
-- TENANT_EMAIL_PREFERENCES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Tenants can view own preferences" ON public.tenant_email_preferences;
DROP POLICY IF EXISTS "Service can manage preferences" ON public.tenant_email_preferences;
DROP POLICY IF EXISTS "Tenants can update own preferences" ON public.tenant_email_preferences;

-- Combined SELECT policy (was 2 separate policies)
CREATE POLICY "Users can view email preferences"
    ON public.tenant_email_preferences
    FOR SELECT
    USING (
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
        )
        OR true  -- Service role bypass
    );

-- Combined UPDATE policy (was 2 separate policies)
CREATE POLICY "Users can update email preferences"
    ON public.tenant_email_preferences
    FOR UPDATE
    USING (
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = (select auth.uid())
        )
        OR true  -- Service role bypass
    );

-- ============================================================================
-- POOL_ALLOCATIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "tenant_isolation_pool_allocations" ON public.pool_allocations;

CREATE POLICY "tenant_isolation_pool_allocations"
    ON public.pool_allocations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.expense_pools
            INNER JOIN public.properties ON expense_pools.property_id = properties.id
            WHERE expense_pools.id = pool_allocations.source_pool_id
            AND properties.organization_id = (
                SELECT organization_id FROM public.users WHERE id = (select auth.uid())
            )
        )
    );

-- ============================================================================
-- POOL_TEMPLATES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "System templates visible to all" ON public.pool_templates;
DROP POLICY IF EXISTS "Users can view org templates" ON public.pool_templates;
DROP POLICY IF EXISTS "Users can create org templates" ON public.pool_templates;
DROP POLICY IF EXISTS "Users can update org templates" ON public.pool_templates;
DROP POLICY IF EXISTS "Users can delete org templates" ON public.pool_templates;

-- Combined SELECT policy (was 2 separate policies)
CREATE POLICY "Users can view templates"
    ON public.pool_templates
    FOR SELECT
    USING (
        is_system = true
        OR organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
        )
    );

CREATE POLICY "Users can create org templates"
    ON public.pool_templates
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
        )
        AND is_system = false
    );

CREATE POLICY "Users can update org templates"
    ON public.pool_templates
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
        )
        AND is_system = false
    );

CREATE POLICY "Users can delete org templates"
    ON public.pool_templates
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
        )
        AND is_system = false
    );

-- ============================================================================
-- LEASES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Leases deletable by org admins" ON public.leases;

CREATE POLICY "Leases deletable by org admins"
    ON public.leases
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- COLUMN_MAPPINGS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Admins can delete mappings" ON public.column_mappings;

CREATE POLICY "Admins can delete mappings"
    ON public.column_mappings
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- AUTH_EVENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Service role full access" ON public.auth_events;
DROP POLICY IF EXISTS "Admins can view auth events" ON public.auth_events;

-- Combined SELECT policy and service role access
CREATE POLICY "Service role and admins can access auth events"
    ON public.auth_events
    FOR ALL
    USING (
        (select auth.role()) = 'service_role'
        OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = (select auth.uid())
            AND users.role = 'admin'
        )
    );

-- ============================================================================
-- AUDIT_REQUESTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all audit requests" ON public.audit_requests;
DROP POLICY IF EXISTS "Assigned users can view their requests" ON public.audit_requests;
DROP POLICY IF EXISTS "Admins can update audit requests" ON public.audit_requests;
DROP POLICY IF EXISTS "Assigned users can update their requests" ON public.audit_requests;

-- Combined SELECT policy (was 2 separate policies)
CREATE POLICY "Users can view audit requests"
    ON public.audit_requests
    FOR SELECT
    USING (
        assigned_to = (select auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- Combined UPDATE policy (was 2 separate policies)
CREATE POLICY "Users can update audit requests"
    ON public.audit_requests
    FOR UPDATE
    USING (
        assigned_to = (select auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- TEAM_MEMBER_INVITATIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view team invitations" ON public.team_member_invitations;
DROP POLICY IF EXISTS "Admins can create team invitations" ON public.team_member_invitations;
DROP POLICY IF EXISTS "Admins can update team invitations" ON public.team_member_invitations;
DROP POLICY IF EXISTS "Admins can delete team invitations" ON public.team_member_invitations;

CREATE POLICY "Admins can view team invitations"
    ON public.team_member_invitations
    FOR SELECT
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can create team invitations"
    ON public.team_member_invitations
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can update team invitations"
    ON public.team_member_invitations
    FOR UPDATE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can delete team invitations"
    ON public.team_member_invitations
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- PROMOTIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Active promotions are viewable by all authenticated users" ON public.promotions;
DROP POLICY IF EXISTS "Promotions are manageable by service role" ON public.promotions;

-- Combined SELECT policy (was 2 separate policies)
-- Note: Service role SELECT uses FOR ALL policy which is combined
CREATE POLICY "Users can view promotions"
    ON public.promotions
    FOR SELECT
    USING (
        (status = 'active' AND (valid_until IS NULL OR valid_until > NOW()))
        OR (select auth.role()) = 'service_role'
    );

-- Service role management (FOR ALL except SELECT which is combined above)
CREATE POLICY "Service role can manage promotions"
    ON public.promotions
    FOR ALL
    USING ((select auth.role()) = 'service_role');

-- Add migration documentation
COMMENT ON SCHEMA public IS 'RLS Performance Optimization: All auth.uid() calls wrapped in (select ...) subqueries per Supabase best practices. Multiple permissive policies combined where applicable.';
