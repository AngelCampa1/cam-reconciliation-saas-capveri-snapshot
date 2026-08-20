-- Migration: create audit_pipeline_events table
-- Records one row per pipeline stage per document extraction run.
-- Used for forensic replay, cost attribution, and performance monitoring.

create table if not exists audit_pipeline_events (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references documents(id) on delete cascade,
    organization_id uuid not null,
    stage text not null,
    model text not null default '',
    tokens_used integer not null default 0,
    duration_ms integer not null default 0,
    outcome text not null default 'success',
    attempt_number integer not null default 1,
    error text null,
    created_at timestamptz not null default now()
);

-- Index for per-document lookups (most common query pattern)
create index if not exists idx_audit_pipeline_events_document_id
    on audit_pipeline_events(document_id);

-- Index for per-org queries (used in analytics dashboards)
create index if not exists idx_audit_pipeline_events_org_created
    on audit_pipeline_events(organization_id, created_at desc);

-- RLS: tenants can only read their own org's events; service role bypasses
alter table audit_pipeline_events enable row level security;

create policy "org members can read their pipeline events"
    on audit_pipeline_events
    for select
    using (
        organization_id in (
            select organization_id from users where id = auth.uid()
        )
    );

-- Service role writes pipeline events (worker context, not user context)
create policy "service role can insert pipeline events"
    on audit_pipeline_events
    for insert
    with check (true);

comment on table audit_pipeline_events is
    'One row per extraction pipeline stage. Stages: extract_primary, extract_sibling, judge, merge, gap_filler.';
comment on column audit_pipeline_events.stage is
    'Pipeline stage name: extract_primary | extract_sibling | judge | merge | gap_filler';
comment on column audit_pipeline_events.outcome is
    'Result of the stage: success | failed | fallback';
comment on column audit_pipeline_events.attempt_number is
    'Which model in the fallback chain was used (1=primary, 2=first fallback, 3=second fallback)';
