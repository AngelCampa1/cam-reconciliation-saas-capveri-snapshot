-- Fix RLS performance warnings flagged by Supabase database linter:
--   1. auth_rls_initplan: auth.uid() called inline (re-evaluated per row)
--   2. multiple_permissive_policies: multiple FOR SELECT policies on same table

-- ============================================================
-- warranty_certificates
-- Fixes: auth_rls_initplan + multiple_permissive_policies
-- Replace FOR ALL policy with 3 operation-specific policies using
-- (SELECT auth.uid()) to prevent per-row re-evaluation.
-- ============================================================
DROP POLICY IF EXISTS "warranty_write_org_admin" ON public.warranty_certificates;

CREATE POLICY "warranty_insert_org_admin" ON public.warranty_certificates
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "warranty_update_org_admin" ON public.warranty_certificates
  FOR UPDATE USING (
    organization_id = public.get_user_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "warranty_delete_org_admin" ON public.warranty_certificates
  FOR DELETE USING (
    organization_id = public.get_user_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- lease_term_versions
-- Fixes: auth_rls_initplan
-- Wrap auth.uid() in a subselect so it evaluates once per query.
-- ============================================================
DROP POLICY IF EXISTS "Lease term versions are deletable by admins" ON public.lease_term_versions;

CREATE POLICY "Lease term versions are deletable by admins"
    ON public.lease_term_versions
    FOR DELETE
    USING (
        public.user_can_access_lease_term_version(lease_id)
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (SELECT auth.uid())
              AND role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- promotions
-- Fixes: multiple_permissive_policies
-- The FOR ALL policy with USING(FALSE) was creating a redundant
-- permissive SELECT policy (OR'd with the real one). Replace with
-- 3 explicit DML-only policies so no SELECT policy is added.
-- ============================================================
DROP POLICY IF EXISTS "Promotions are manageable by service role" ON public.promotions;

CREATE POLICY "Promotions are insertable by service role"
    ON public.promotions
    FOR INSERT
    WITH CHECK (FALSE);

CREATE POLICY "Promotions are updatable by service role"
    ON public.promotions
    FOR UPDATE
    USING (FALSE)
    WITH CHECK (FALSE);

CREATE POLICY "Promotions are deletable by service role"
    ON public.promotions
    FOR DELETE
    USING (FALSE);
