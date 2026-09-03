-- ADUAtlas — site content management (admin-editable text/images/course prose)
-- =============================================================================
-- Adds a draft → publish content layer so an admin can edit public-page copy,
-- swap single images, and edit course-chapter wording/photos without a code
-- deploy. Structure (which fields exist, their order, block shape) stays
-- code-owned — only the string/image leaves inside each field are editable.
--
-- Apply the same way as 0001_init.sql: `supabase db push`, or paste into
-- Supabase Studio → SQL editor → Run.
-- =============================================================================

-- ── site_content ─────────────────────────────────────────────────────────────
-- One row per editable field. `key` is a stable dotted id the app code assigns
-- (e.g. "home.quizhero.heading", "course.chapter.m1c1"). `draft_value` is what
-- the admin is editing; `published_value` is what the live site reads — null
-- until the first publish, at which point the site falls back to the current
-- hardcoded default already in the component (see src/lib/content.js), so
-- rollout is additive and never breaks a page that has no row yet.
-- page/label are a cache of the frontend content registry's metadata
-- (src/lib/contentRegistry/index.js is the source of truth for what's
-- editable and its display name/grouping) — kept here only so the raw table
-- is self-describing in Studio; the admin UI always renders from the registry.
create table public.site_content (
  key             text primary key,
  page            text,
  label           text,
  type            text not null check (type in ('text', 'image', 'blocks')),
  draft_value     jsonb,
  published_value jsonb,
  updated_at      timestamptz not null default now(),
  updated_by      text,                 -- admin email, best-effort audit trail
  published_at    timestamptz,
  published_by    text,
  created_at      timestamptz not null default now()
);

create index site_content_page_idx on public.site_content (page);

create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function public.set_updated_at();

-- ── site_content_versions ────────────────────────────────────────────────────
-- Append-only publish history. Every publish/rollback snapshots the value that
-- is about to be REPLACED (so rollback is always possible, and rollback itself
-- can be undone). Pruned to the 3 most recent rows per key by the trigger
-- below — "keep last 2-3 versions" is enforced in the database.
create table public.site_content_versions (
  id           uuid primary key default gen_random_uuid(),
  key          text not null references public.site_content (key) on delete cascade,
  value        jsonb,
  published_at timestamptz not null default now(),
  published_by text
);

create index site_content_versions_key_idx on public.site_content_versions (key, published_at desc);

create or replace function public.prune_content_versions()
returns trigger
language plpgsql
as $$
begin
  delete from public.site_content_versions
  where key = new.key
    and id not in (
      select id from public.site_content_versions
      where key = new.key
      order by published_at desc
      limit 3
    );
  return new;
end;
$$;

create trigger site_content_versions_prune
  after insert on public.site_content_versions
  for each row execute function public.prune_content_versions();

-- =============================================================================
-- Row-Level Security — locked down like `leads`/`stripe_events`. All admin
-- reads/writes go through /api/admin/content/* using the service role (which
-- bypasses RLS), matching every other admin endpoint in this codebase. Public
-- (anon) read access is exposed narrowly through the RPC below, never as
-- direct table access — so a logged-out visitor can never see an unpublished
-- draft.
-- =============================================================================
alter table public.site_content          enable row level security;
alter table public.site_content_versions enable row level security;

revoke all on public.site_content          from anon, authenticated;
revoke all on public.site_content_versions from anon, authenticated;

-- =============================================================================
-- Public read RPC — mirrors the capture_lead() pattern in 0001_init.sql: a
-- SECURITY DEFINER function is the only path anon/authenticated get into an
-- otherwise fully locked-down table, and it exposes only published_value.
-- =============================================================================
create or replace function public.get_site_content()
returns table (key text, type text, value jsonb)
language sql
security definer
set search_path = public
stable
as $$
  select key, type, published_value
  from public.site_content
  where published_value is not null;
$$;

grant execute on function public.get_site_content() to anon, authenticated;

-- =============================================================================
-- Storage — bucket for admin-uploaded images. Public read (the site renders
-- these images to anonymous visitors); writes happen only through
-- /api/admin/content/upload-image.js via the service role, so no
-- insert/update/delete policy is granted to anon/authenticated.
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('site-content', 'site-content', true)
on conflict (id) do nothing;

create policy site_content_bucket_public_read on storage.objects
  for select to public
  using (bucket_id = 'site-content');

-- =============================================================================
-- Notes
--   • Content STRUCTURE (which fields exist, block order/shape, page layout)
--     stays code-owned. Only draft_value/published_value leaves are editable —
--     see the "blocks" type note in src/lib/content.js.
--   • published_by/updated_by store the admin's email as plain text (best-
--     effort audit trail), not a foreign key — consistent with this table
--     having no direct RLS-gated relationship to `users`.
-- =============================================================================
