-- Fix tenant_email_preferences RLS ownership checks.
--
-- 20240101000060 combined tenant-owned and service-role policies with
-- `OR true`, and 20260301000002 scoped those policies to authenticated users.
-- That made the tenant ownership predicate ineffective for authenticated users.
-- The service role already bypasses RLS in Supabase, so tenant-facing policies
-- must contain only tenant ownership checks.

drop policy if exists "Users can view email preferences" on public.tenant_email_preferences;
drop policy if exists "Users can update email preferences" on public.tenant_email_preferences;
drop policy if exists "Tenants can insert own preferences" on public.tenant_email_preferences;

create policy "Users can view email preferences"
    on public.tenant_email_preferences
    for select
    to authenticated
    using (
        tenant_user_id in (
            select id
            from public.tenant_users
            where user_id = (select auth.uid())
        )
    );

create policy "Tenants can insert own preferences"
    on public.tenant_email_preferences
    for insert
    to authenticated
    with check (
        tenant_user_id in (
            select id
            from public.tenant_users
            where user_id = (select auth.uid())
        )
    );

create policy "Users can update email preferences"
    on public.tenant_email_preferences
    for update
    to authenticated
    using (
        tenant_user_id in (
            select id
            from public.tenant_users
            where user_id = (select auth.uid())
        )
    )
    with check (
        tenant_user_id in (
            select id
            from public.tenant_users
            where user_id = (select auth.uid())
        )
    );
