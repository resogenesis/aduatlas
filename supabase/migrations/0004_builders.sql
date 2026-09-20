-- =============================================================================
-- 0004 — Builder directory (Phase 1 scope §5)
--
--   builders         profiles managed by ADUAtlas admins (no builder self-service)
--   saved_builders   a homeowner's saved builders
--   intro_requests   "request contact / introduction" from a homeowner to a builder
--   storage bucket   'builders' (public read): logos and up to 3 project photos
--
-- Access: any PAID homeowner (Golden and up) can read active builders; writes
-- happen only through /api/admin/builders/* with the service role. Anonymous
-- visitors see a small featured sample through get_featured_builders() on the
-- public Find a Builder page.
-- =============================================================================

create table public.builders (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  description      text,
  logo_path        text,                         -- storage path in bucket 'builders'
  website          text,
  external_link    text,                         -- the one extra link (portfolio, reviews, ...)
  contact_email    text,
  contact_phone    text,
  state            text not null check (state ~ '^[A-Z]{2}$'),
  cities           text[] not null default '{}', -- cities / areas served
  service_zips     text[] not null default '{}', -- optional ZIP prefixes or ZIPs
  specialties      text[] not null default '{}', -- detached, attached, garage_conversion, jadu, prefab, two_story
  service_types    text[] not null default '{}', -- design_build, general_contractor, prefab_manufacturer, architect, permit_expediter
  build_approach   text not null default 'both' check (build_approach in ('custom', 'prefab', 'both')),
  photos           text[] not null default '{}' check (cardinality(photos) <= 3),
  videos           text[] not null default '{}' check (cardinality(videos) <= 2),   -- YouTube/Vimeo URLs
  active           boolean not null default true,
  featured         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index builders_state_idx on public.builders (state, active);
create index builders_cities_idx on public.builders using gin (cities);
create index builders_specialties_idx on public.builders using gin (specialties);

create trigger builders_set_updated_at
  before update on public.builders
  for each row execute function public.set_updated_at();

alter table public.builders enable row level security;

-- Paid homeowners read active profiles.
create policy builders_select_paid on public.builders
  for select to authenticated
  using (
    active
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid() and public.users_is_paid(u)
    )
  );

revoke all on public.builders from anon, authenticated;
grant select on public.builders to authenticated;

-- Public teaser: a few featured names for the Find a Builder page.
create or replace function public.get_featured_builders()
returns table (slug text, name text, state text, cities text[], specialties text[], logo_path text)
language sql
security definer
set search_path = public
stable
as $$
  select slug, name, state, cities, specialties, logo_path
  from public.builders
  where active and featured
  order by name
  limit 6;
$$;
grant execute on function public.get_featured_builders() to anon, authenticated;

-- ── saved_builders ──────────────────────────────────────────────────────────
create table public.saved_builders (
  user_id    uuid not null references public.users (id) on delete cascade,
  builder_id uuid not null references public.builders (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, builder_id)
);

alter table public.saved_builders enable row level security;
create policy saved_builders_own on public.saved_builders
  for all to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
revoke all on public.saved_builders from anon, authenticated;
grant select, insert, delete on public.saved_builders to authenticated;

-- ── intro_requests ──────────────────────────────────────────────────────────
create table public.intro_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  builder_id  uuid not null references public.builders (id) on delete cascade,
  message     text check (length(message) <= 2000),
  status      text not null default 'requested' check (status in ('requested', 'sent', 'declined')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, builder_id)
);

create index intro_requests_status_idx on public.intro_requests (status, created_at);

create trigger intro_requests_set_updated_at
  before update on public.intro_requests
  for each row execute function public.set_updated_at();

alter table public.intro_requests enable row level security;
create policy intro_requests_select_own on public.intro_requests
  for select to authenticated
  using (user_id = public.current_app_user_id());
create policy intro_requests_insert_own on public.intro_requests
  for insert to authenticated
  with check (user_id = public.current_app_user_id() and status = 'requested');
revoke all on public.intro_requests from anon, authenticated;
grant select on public.intro_requests to authenticated;
grant insert (user_id, builder_id, message) on public.intro_requests to authenticated;

-- ── storage: public bucket for logos and project photos ─────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('builders', 'builders', true, 6291456, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy builders_bucket_public_read on storage.objects
  for select to public
  using (bucket_id = 'builders');
-- Writes: service role only (no policy for anon/authenticated).
