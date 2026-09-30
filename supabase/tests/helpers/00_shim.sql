-- =============================================================================
-- 00_shim.sql — the Supabase platform pieces the migrations assume exist.
--
-- Supabase gives every project an `auth` schema, a `storage` schema, the three
-- API roles (anon, authenticated, service_role) and a set of ALTER DEFAULT
-- PRIVILEGES on schema public. None of that is in our migrations, because none
-- of it is ours. A plain Postgres cluster has none of it, so the migration
-- chain cannot run and RLS cannot be exercised without this file.
--
-- Two things matter about how it is written:
--
--   1. ROLES ARE CLUSTER-WIDE, not per-database. A developer who runs the suite
--      twice against the same cluster (or who already has a Supabase-shaped
--      cluster) must not see "role already exists" abort the run. Every role
--      and every grant here is idempotent.
--
--   2. THE DEFAULT PRIVILEGES ARE LOAD-BEARING, NOT DECORATION. Supabase grants
--      anon/authenticated ALL on every new table in schema public, and our
--      migrations then `revoke all ... from anon, authenticated` and grant back
--      precisely. Without the default privileges those revokes are no-ops
--      against a permission that was never there, the migrations look identical,
--      and every access test passes for the wrong reason. This file must run
--      BEFORE 0001 so the tables are created under the same privilege regime
--      production uses.
--
-- This file is a test fixture. It is NOT a migration and must never be applied
-- to a Supabase project, which already has all of it.
-- =============================================================================

-- ── extensions the migrations use ───────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ── the three API roles ─────────────────────────────────────────────────────
-- service_role carries BYPASSRLS, which is how the Stripe webhook and the admin
-- API get past every policy in the chain. Tests that prove "service role only"
-- depend on that being true here.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- An existing cluster may have the role without the attribute.
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls) then
    execute 'alter role service_role bypassrls';
  end if;
  -- Supabase's authenticator equivalent: the session user may assume the API
  -- roles. current_user here is whoever runs the suite.
  execute format('grant anon, authenticated, service_role to %I', current_user);
end
$$;

-- ── schema usage ────────────────────────────────────────────────────────────
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

grant usage on schema public     to anon, authenticated, service_role;
grant usage on schema auth       to anon, authenticated, service_role;
grant usage on schema storage    to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- ── auth.users ──────────────────────────────────────────────────────────────
-- Only the columns our migrations read: id, email and raw_user_meta_data (the
-- 0001/0006 handle_new_auth_user trigger reads the role out of the metadata).
--
-- id has NO DEFAULT, deliberately, because the real one has none: Supabase Auth
-- generates the id itself and passes it in. This shim used to default it, so
-- every fixture that inserted an account without an id passed here and would
-- have failed on the first real Supabase project (found 2026-09-26 against
-- staging, where auth.users.id is NOT NULL with no default). A fixture must
-- supply id = gen_random_uuid(), exactly as Supabase Auth would.
create table if not exists auth.users (
  id                 uuid primary key,
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- ── auth.uid() / auth.role() ────────────────────────────────────────────────
-- Supabase derives these from the request JWT. A test sets the same GUCs
-- PostgREST sets, so the policies under test are the production policies
-- reading a production-shaped claim, not a test-only substitute.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
           coalesce(
             current_setting('request.jwt.claim.sub', true),
             (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
           ),
           ''
         )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           'anon'
         );
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.email', true), '');
$$;

grant execute on function auth.uid()   to anon, authenticated, service_role;
grant execute on function auth.role()  to anon, authenticated, service_role;
grant execute on function auth.email() to anon, authenticated, service_role;

-- ── storage ─────────────────────────────────────────────────────────────────
-- 0002/0003/0004 insert buckets and create policies on storage.objects.
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  metadata         jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

-- Supabase's own helper: 'user-id/intake/file.pdf' -> {user-id, intake}.
-- 0003's bucket policies index into it.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text)
returns text
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant execute on function storage.filename(text)   to anon, authenticated, service_role;

grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;

-- ── the default privileges (see the header: load-bearing) ───────────────────
-- Supabase sets these for the migration/owner role so that anything created in
-- schema public is reachable by the API roles unless a migration locks it down.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- Existing objects too, for a cluster where public already has something in it.
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
