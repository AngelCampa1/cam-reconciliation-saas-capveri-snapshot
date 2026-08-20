-- Migration: Create Legal Acceptances Table
-- Description: Records user assent to legal documents (e.g. terms of service)
--              with document version/hash, capture context (IP, user agent,
--              source), and an append-only guard preventing updates/deletes.

create table if not exists public.legal_acceptances (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete restrict,
    organization_id uuid not null references public.organizations(id) on delete restrict,
    document_type text not null,
    document_version text not null,
    document_hash text not null,
    accepted_at timestamptz not null default now(),
    ip_address inet,
    user_agent text,
    source text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint legal_acceptances_document_type_check
        check (document_type in ('terms_of_service'))
);

create index if not exists idx_legal_acceptances_user_document_version
    on public.legal_acceptances (user_id, document_type, document_version);

create index if not exists idx_legal_acceptances_org_document_version
    on public.legal_acceptances (organization_id, document_type, document_version);

alter table public.legal_acceptances enable row level security;

create policy "Users can read their own legal acceptances"
    on public.legal_acceptances
    for select
    using (auth.uid() = user_id);

create policy "Organization admins can read org legal acceptances"
    on public.legal_acceptances
    for select
    using (
        exists (
            select 1
            from public.users u
            where u.id = auth.uid()
              and u.organization_id = legal_acceptances.organization_id
              and u.role in ('owner', 'admin')
        )
    );

create policy "Service role can insert legal acceptances"
    on public.legal_acceptances
    for insert
    with check (auth.role() = 'service_role');

create or replace function public.prevent_legal_acceptance_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    raise exception 'legal_acceptances is append-only';
end;
$$;

drop trigger if exists legal_acceptances_append_only on public.legal_acceptances;
create trigger legal_acceptances_append_only
    before update or delete on public.legal_acceptances
    for each row
    execute function public.prevent_legal_acceptance_mutation();
