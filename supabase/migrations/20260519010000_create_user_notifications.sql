-- Create landlord-facing in-app notifications.
--
-- Tenant notifications already use public.tenant_notifications. Landlord
-- dispute notifications write to user_notifications, so this table gives that
-- existing service path durable storage with row-level isolation.

create table if not exists public.user_notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    notification_type text not null,
    title text not null check (char_length(title) <= 255),
    message text not null,
    link_url text,
    related_entity_id uuid,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user_id
    on public.user_notifications(user_id);

create index if not exists idx_user_notifications_unread
    on public.user_notifications(user_id)
    where read_at is null;

create index if not exists idx_user_notifications_created_at
    on public.user_notifications(created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "Users can view own notifications"
    on public.user_notifications;
drop policy if exists "Users can update own notifications"
    on public.user_notifications;

create policy "Users can view own notifications"
    on public.user_notifications
    for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Users can update own notifications"
    on public.user_notifications
    for update
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

grant select, update on public.user_notifications to authenticated;
grant all on public.user_notifications to service_role;

comment on table public.user_notifications is
    'In-app notifications for landlord and property manager users.';
comment on column public.user_notifications.related_entity_id is
    'Optional related entity ID, such as a dispute ID.';
