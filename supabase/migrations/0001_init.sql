-- ADUAtlas — initial schema (foundation / data layer)
-- =============================================================================
-- Version-controls the tables the app + serverless functions already expect.
-- Grounded in the existing code (NOT invented):
--   • api/stripe-webhook.js    → users(email, stripe_customer_id, paid_at,
--                                paid_tier, refunded_at) + stripe_events(event_id…)
--   • api/create-checkout.js   → reads users(paid_tier, paid_at, refunded_at)
--   • src/lib/supabase.js       → leads(email, source, quiz_answers)
--   • src/stores/courseStore.js → "users.completed_chapters (jsonb)" +
--                                "users.builder_packet (jsonb)"
--   • src/stores/authStore.js   → users.role ('homeowner' | 'pro')
--   • src/stores/paymentStore.js→ entitlement = paid_at non-null AND not refunded
--
-- Apply:  supabase db push      (CLI, links migrations)
--    or:  paste into Supabase Studio → SQL editor and run once.
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;      -- case-insensitive email

-- ── updated_at helper ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── users ────────────────────────────────────────────────────────────────────
-- One row per buyer/account. Identity is EMAIL-first because Stripe payment can
-- happen before (or without) a Supabase Auth account. `auth_user_id` links the
-- row to Supabase Auth once the person creates an account.
--
-- Column ownership:
--   • Billing columns (paid_at, paid_tier, refunded_at, stripe_customer_id, role)
--     are written ONLY by the service role (Stripe webhook). RLS + column grants
--     below make them read-only to the signed-in user so a client CANNOT
--     self-grant paid access with the anon key.
--   • App-data columns (completed_chapters, builder_packet, knowledge_result)
--     are owned by the signed-in user.
create table public.users (
  id                 uuid primary key default gen_random_uuid(),
  auth_user_id       uuid unique references auth.users (id) on delete set null,
  email              citext unique not null,
  stripe_customer_id text,
  paid_at            timestamptz,
  paid_tier          text check (paid_tier in ('roadmap', 'report', 'concierge')),
  refunded_at        timestamptz,
  role               text not null default 'homeowner'
                       check (role in ('homeowner', 'pro', 'admin')),
  completed_chapters jsonb not null default '[]'::jsonb,   -- e.g. ["c1","c2"]
  builder_packet     jsonb not null default '{}'::jsonb,   -- PACKET_FIELDS shape
  knowledge_result   jsonb,                                -- aduatlas.knowledge.v1
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index users_stripe_customer_id_idx on public.users (stripe_customer_id);
create index users_auth_user_id_idx        on public.users (auth_user_id);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- True iff this row is a live, paid entitlement (mirrors paymentStore.isPaid).
create or replace function public.users_is_paid(u public.users)
returns boolean language sql immutable as $$
  select u.paid_at is not null and u.refunded_at is null;
$$;

-- ── leads ────────────────────────────────────────────────────────────────────
-- Top-of-funnel email capture from /unlock (anon, pre-account). PII — never
-- exposed to the anon/authenticated roles directly; written via the
-- capture_lead() RPC below and read only by the service role.
create table public.leads (
  id           uuid primary key default gen_random_uuid(),
  email        citext unique not null,
  source       text not null default 'unlock',
  quiz_answers jsonb,
  created_at   timestamptz not null default now()
);

-- ── stripe_events ────────────────────────────────────────────────────────────
-- Webhook idempotency ledger (api/stripe-webhook.js markEventProcessed).
-- Service-role only.
create table public.stripe_events (
  event_id    text primary key,
  type        text,
  received_at timestamptz not null default now()
);

-- =============================================================================
-- Auth linkage: when a Supabase Auth user is created, attach it to (or create)
-- the matching public.users row by email. Idempotent — a webhook may have
-- already created the email row from a payment that preceded signup.
-- =============================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Role comes from signup metadata but is CLAMPED here (server-side) to
  -- homeowner|pro so a client can never self-assign 'admin'. On a pre-existing
  -- email row (e.g. created by a payment before signup) we keep the prior role.
  insert into public.users (auth_user_id, email, role)
  values (
    new.id,
    new.email,
    case when new.raw_user_meta_data->>'role' = 'pro' then 'pro' else 'homeowner' end
  )
  on conflict (email)
    do update set auth_user_id = excluded.auth_user_id,
                  updated_at   = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =============================================================================
-- Lead capture RPC (security definer): lets the anon client record a lead and
-- merge quiz answers WITHOUT direct table access. Replaces the direct
-- supabase.from("leads").upsert(...) call in src/lib/supabase.js.
-- =============================================================================
create or replace function public.capture_lead(
  p_email        citext,
  p_source       text default 'unlock',
  p_quiz_answers jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'invalid email';
  end if;

  insert into public.leads (email, source, quiz_answers)
  values (lower(p_email), coalesce(p_source, 'unlock'), p_quiz_answers)
  on conflict (email) do update
    set quiz_answers = coalesce(excluded.quiz_answers, public.leads.quiz_answers),
        source       = coalesce(excluded.source, public.leads.source)
  returning id into v_id;

  return v_id;
end;
$$;

-- =============================================================================
-- Row-Level Security
-- =============================================================================
alter table public.users         enable row level security;
alter table public.leads         enable row level security;
alter table public.stripe_events enable row level security;

-- Lock everything down by default; grant back precisely below.
revoke all on public.users         from anon, authenticated;
revoke all on public.leads         from anon, authenticated;
revoke all on public.stripe_events from anon, authenticated;

-- users: a signed-in person can READ their own row …
grant select on public.users to authenticated;
create policy users_select_own on public.users
  for select to authenticated
  using (auth.uid() = auth_user_id);

-- … and UPDATE only their own APP-DATA columns (column grant + row policy).
-- Billing columns are intentionally omitted from the grant → read-only to users.
grant update (completed_chapters, builder_packet, knowledge_result)
  on public.users to authenticated;
create policy users_update_own on public.users
  for update to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- leads + stripe_events: no direct anon/authenticated access (service role only,
-- which bypasses RLS). Lead writes flow through capture_lead().
grant execute on function public.capture_lead(citext, text, jsonb)
  to anon, authenticated;

-- =============================================================================
-- Notes
--   • The Stripe webhook + create-checkout use SUPABASE_SERVICE_ROLE_KEY, which
--     bypasses RLS — no policies needed for them.
--   • Entitlement is ALWAYS derived from paid_at/refunded_at server-side; the
--     localStorage flag in paymentStore.js stays a UX hint only.
-- =============================================================================
