-- Harden tenant isolation and browser-client user privileges.
-- Tenant portal users must not inherit landlord-wide organization policies,
-- and authenticated browser clients must not be able to mutate privilege fields.

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    PERFORM set_config('row_security', 'off', true);
    SELECT organization_id INTO v_org_id
    FROM public.users
    WHERE id = (select auth.uid())
    AND role IN ('owner', 'admin', 'member', 'viewer');
    RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION public.get_user_organization_id()
IS 'Returns the current authenticated landlord organization id; tenant-role users return NULL and must use tenant-specific policies.';

REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (full_name) ON public.users TO authenticated;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
    ON public.users
    FOR UPDATE
    USING (
        id = (select auth.uid())
        AND role IN ('owner', 'admin', 'member', 'viewer')
    )
    WITH CHECK (
        id = (select auth.uid())
        AND organization_id = public.get_user_organization_id()
        AND role IN ('owner', 'admin', 'member', 'viewer')
        AND COALESCE(is_platform_admin, false) = COALESCE(
            (
                SELECT u.is_platform_admin
                FROM public.users u
                WHERE u.id = (select auth.uid())
            ),
            false
        )
    );

DROP POLICY IF EXISTS "Users can view disputes" ON public.disputes;
CREATE POLICY "Users can view disputes"
    ON public.disputes
    FOR SELECT
    USING (
        tenant_user_id IN (
            SELECT id FROM public.tenant_users WHERE user_id = (select auth.uid())
        )
        OR organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin', 'member', 'viewer')
        )
    );

DROP POLICY IF EXISTS "Landlords can update organization disputes" ON public.disputes;
CREATE POLICY "Landlords can update organization disputes"
    ON public.disputes
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin', 'member', 'viewer')
        )
    );

DROP POLICY IF EXISTS "Users can view dispute comments" ON public.dispute_comments;
CREATE POLICY "Users can view dispute comments"
    ON public.dispute_comments
    FOR SELECT
    USING (
        (
            dispute_id IN (
                SELECT id FROM public.disputes
                WHERE tenant_user_id IN (
                    SELECT id
                    FROM public.tenant_users
                    WHERE user_id = (select auth.uid())
                )
            )
            AND is_internal = FALSE
        )
        OR dispute_id IN (
            SELECT id FROM public.disputes
            WHERE organization_id IN (
                SELECT organization_id
                FROM public.users
                WHERE id = (select auth.uid())
                AND role IN ('owner', 'admin', 'member', 'viewer')
            )
        )
    );

DROP POLICY IF EXISTS "Users can add dispute comments" ON public.dispute_comments;
CREATE POLICY "Users can add dispute comments"
    ON public.dispute_comments
    FOR INSERT
    WITH CHECK (
        author_id = (select auth.uid())
        AND (
            (
                dispute_id IN (
                    SELECT id FROM public.disputes
                    WHERE tenant_user_id IN (
                        SELECT id
                        FROM public.tenant_users
                        WHERE user_id = (select auth.uid())
                    )
                )
                AND is_internal = FALSE
            )
            OR dispute_id IN (
                SELECT id FROM public.disputes
                WHERE organization_id IN (
                    SELECT organization_id
                    FROM public.users
                    WHERE id = (select auth.uid())
                    AND role IN ('owner', 'admin', 'member', 'viewer')
                )
            )
        )
    );

DROP POLICY IF EXISTS "Users can view dispute attachments" ON public.dispute_attachments;
CREATE POLICY "Users can view dispute attachments"
    ON public.dispute_attachments
    FOR SELECT
    USING (
        dispute_id IN (
            SELECT id FROM public.disputes
            WHERE tenant_user_id IN (
                SELECT id FROM public.tenant_users WHERE user_id = (select auth.uid())
            )
        )
        OR dispute_id IN (
            SELECT id FROM public.disputes
            WHERE organization_id IN (
                SELECT organization_id
                FROM public.users
                WHERE id = (select auth.uid())
                AND role IN ('owner', 'admin', 'member', 'viewer')
            )
        )
    );

DROP POLICY IF EXISTS "Users can add dispute attachments" ON public.dispute_attachments;
DROP POLICY IF EXISTS "Users can upload dispute attachments" ON public.dispute_attachments;
CREATE POLICY "Users can upload dispute attachments"
    ON public.dispute_attachments
    FOR INSERT
    WITH CHECK (
        uploaded_by = (select auth.uid())
        AND (
            dispute_id IN (
                SELECT id FROM public.disputes
                WHERE tenant_user_id IN (
                    SELECT id
                    FROM public.tenant_users
                    WHERE user_id = (select auth.uid())
                )
            )
            OR dispute_id IN (
                SELECT id FROM public.disputes
                WHERE organization_id IN (
                    SELECT organization_id
                    FROM public.users
                    WHERE id = (select auth.uid())
                    AND role IN ('owner', 'admin', 'member', 'viewer')
                )
            )
        )
    );

DROP POLICY IF EXISTS "Snapshots viewable by organization members and linked tenants"
ON public.reconciliation_snapshots;
CREATE POLICY "Snapshots viewable by organization members and linked tenants"
    ON public.reconciliation_snapshots
    FOR SELECT
    USING (
        organization_id = public.get_user_organization_id()
        OR lease_id IN (
            SELECT tll.lease_id
            FROM public.tenant_lease_links tll
            JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
            WHERE tu.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "GL entries viewable by organization members and linked tenants"
ON public.gl_entries;
CREATE POLICY "GL entries viewable by organization members"
    ON public.gl_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

DROP POLICY IF EXISTS "Expense pools viewable by organization members and linked tenants"
ON public.expense_pools;
CREATE POLICY "Expense pools viewable by organization members"
    ON public.expense_pools
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

DROP POLICY IF EXISTS "Pool mappings viewable by organization members and linked tenants"
ON public.pool_mappings;
CREATE POLICY "Pool mappings viewable by organization members"
    ON public.pool_mappings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_organization_id()
        )
    );
