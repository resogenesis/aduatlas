-- =============================================================================
-- 0003 — Feasibility studies (Phase 1 manual workflow) + concierge messages
--
-- A Platinum/Concierge homeowner submits property intake from the portal; an
-- admin reviews it, uploads the finished report and site plan, and marks the
-- study ready. The homeowner reads deliverables back through signed URLs.
--
--   studies           one row per homeowner (user_id unique)
--   support_messages  concierge portal messages (homeowner <-> admin)
--   storage bucket    'studies' (private): <users.id>/intake/*  homeowner uploads
--                                          <users.id>/deliverables/*  admin uploads
--
-- Security model mirrors 0001/0002: the signed-in homeowner may read their own
-- rows and write ONLY the intake side (column grants + check constraints);
-- status transitions past 'submitted', deliverable paths, notes to the
-- homeowner and consultation minutes are written only by the service role
-- via /api/admin/studies/*.
-- =============================================================================

-- The signed-in caller's public.users id (users.id, not auth.uid()).
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where auth_user_id = auth.uid();
$$;
grant execute on function public.current_app_user_id() to authenticated;

-- ── studies ─────────────────────────────────────────────────────────────────
create table public.studies (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references public.users (id) on delete cascade,
  status               text not null default 'submitted'
                         check (status in ('submitted', 'in_review', 'needs_info', 'ready')),
  intake               jsonb not null default '{}'::jsonb,   -- src/pages/app/Study.jsx INTAKE_FIELDS shape + files[]
  homeowner_note       text,
  admin_note           text,                                 -- shown to the homeowner
  report_path          text,                                 -- storage path in bucket 'studies'
  site_plan_path       text,
  consult_minutes_used integer not null default 0 check (consult_minutes_used between 0 and 60),
  consult_link         text,                                 -- scheduling link for Concierge
  submitted_at         timestamptz not null default now(),
  ready_at             timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index studies_status_idx on public.studies (status, submitted_at);

create trigger studies_set_updated_at
  before update on public.studies
  for each row execute function public.set_updated_at();

alter table public.studies enable row level security;

-- Homeowner: read own row.
create policy studies_select_own on public.studies
  for select to authenticated
  using (user_id = public.current_app_user_id());

-- Homeowner: create own row (defaults fill everything else).
create policy studies_insert_own on public.studies
  for insert to authenticated
  with check (user_id = public.current_app_user_id() and status = 'submitted');

-- Homeowner: edit intake while the study is not yet in review or ready;
-- resubmitting after needs_info sets status back to 'submitted'.
create policy studies_update_own on public.studies
  for update to authenticated
  using (user_id = public.current_app_user_id() and status in ('submitted', 'needs_info'))
  with check (user_id = public.current_app_user_id() and status = 'submitted');

-- Column-level grants: the client can only touch the intake side.
revoke all on public.studies from anon, authenticated;
grant select on public.studies to authenticated;
grant insert (user_id, intake, homeowner_note) on public.studies to authenticated;
grant update (intake, homeowner_note, status, submitted_at) on public.studies to authenticated;

-- ── support_messages (Concierge portal support) ─────────────────────────────
create table public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  author     text not null check (author in ('homeowner', 'admin')),
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index support_messages_user_idx on public.support_messages (user_id, created_at);

alter table public.support_messages enable row level security;

create policy support_messages_select_own on public.support_messages
  for select to authenticated
  using (user_id = public.current_app_user_id());

create policy support_messages_insert_own on public.support_messages
  for insert to authenticated
  with check (user_id = public.current_app_user_id() and author = 'homeowner');

revoke all on public.support_messages from anon, authenticated;
grant select on public.support_messages to authenticated;
grant insert (user_id, author, body) on public.support_messages to authenticated;

-- ── storage: private bucket for intake uploads and deliverables ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studies', 'studies', false, 8388608,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Homeowner reads anything under their own folder (intake + deliverables).
create policy studies_bucket_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'studies'
    and (storage.foldername(name))[1] = public.current_app_user_id()::text
  );

-- Homeowner writes only under <own id>/intake/.
create policy studies_bucket_upload_intake on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studies'
    and (storage.foldername(name))[1] = public.current_app_user_id()::text
    and (storage.foldername(name))[2] = 'intake'
  );

-- Deliverables are written by the service role only (no policy needed).
