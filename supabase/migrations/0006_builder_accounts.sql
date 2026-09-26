-- =============================================================================
-- 0006 — Builder accounts, restricted directory view, referral events
--        (Phase 1 decisions from the Richard/Amy call of 2026-09-24, section 5
--        of PHASE_1.md)
--
-- What this adds on top of 0004/0005:
--
--   builders.*             the full builder record: contact name, business
--                          address, city, ZIP, service_states, build_methods,
--                          turnkey, licensed_states (kept separate from service
--                          area), owner_user_id (the builder's login),
--                          profile_status (draft, pending, approved, inactive),
--                          approval audit, admin notes, commercial terms and
--                          the recorded pricing terms below
--   builders_public        the ONLY thing a homeowner reads about builders: a
--                          view over approved, active rows exposing directory
--                          columns and nothing from the contact-name, account,
--                          referral, tracking, commercial or admin categories
--   referral_events        RAW EVENTS against a builder (link_visited,
--                          email_captured, account_created, package_purchased,
--                          package_refunded, builder_profile_viewed,
--                          builder_contacted, project_signed). Stages are
--                          derived in reporting.
--   RPCs                   log_builder_event, my_builder, save_my_builder,
--                          submit_my_builder, my_referral_stats (builder
--                          portal, authenticated); log_referral_visit,
--                          referral_stats (rewritten) and
--                          admin_mark_project_signed (service role only)
--   users triggers         a new users row with no referrer inherits the
--                          attribution of its lead row (first touch) and
--                          records account_created; referred_by_builder_id
--                          going from null to a value on update records the
--                          same event once (unique index)
--   handle_new_auth_user   the 0001 auth trigger, replaced so a builder who
--                          signs up on an email the Stripe webhook already
--                          created becomes 'pro' instead of staying 'homeowner'
--   capture_lead           now also records email_captured
--
-- THE PRINCIPLE (5.6): ADUAtlas helps the homeowner find the right builder; it
-- does not sell open access to the homeowner. A builder never browses
-- homeowner leads and never sees a homeowner's name, email, phone, address or
-- project. The builder-facing RPCs here return the builder's OWN row and
-- AGGREGATE counts, and nothing else. Contact runs one way: the homeowner
-- picks a builder and requests an introduction (0004 intro_requests), and
-- ADUAtlas passes it on.
--
-- PRICING COLUMNS ARE RECORDED TERMS ONLY. NO BILLING EXISTS.
--   membership_price_cents  4900   ($49 a month after the introductory period)
--   success_fee_cents       50000  ($500 when a referral becomes a signed project)
--   intro_days              90     (days at $0 after approval)
--   A homeowner lead, however qualified, costs the builder $0.
-- These were settled on the call (5.5) and are stored on the builder record so
-- the terms travel with the profile. Nothing in this schema or in the code
-- charges a card: there is no Stripe subscription, no invoice, no dunning, no
-- ledger, no balance and no payout. Membership is handled by hand for the
-- first builders. A commission of roughly 5% of project value was discussed on
-- the call and NOT adopted; percentages of project value and raising the
-- success fee later were likewise discussed and not adopted. commercial_terms
-- is free text for an admin to record whatever arrangement exists.
--
-- "QUALIFIED LEAD" IS INTENTIONALLY NOT A SCHEMA CONCEPT. A homeowner who buys
-- the $79 course is not necessarily a qualified construction lead for a
-- builder, and locking a definition into the schema now is how a business
-- discovers in three months that the definition was wrong. referral_events
-- stores what happened; what counts as qualified is defined later, in
-- reporting, against real traffic, and can change freely. The one event an
-- admin records by hand is project_signed, because ADUAtlas cannot detect it
-- and the $500 fee attaches to it; recording it is not collecting it.
--
-- Deploy order: 0005 then 0006. The frontend degrades gracefully when this
-- file has not been applied yet (src/lib/builders.js falls back to the 0005
-- table read when builders_public is missing).
--
-- Security model mirrors 0001/0004/0005: lock down by default, grant back
-- precisely, service role for admin writes, security-definer RPCs for the
-- narrow things a signed-in user may do.
-- =============================================================================

-- ── small pure helpers used by checks and RPCs ──────────────────────────────

-- True when every element is a two-letter uppercase state code (null / empty
-- arrays pass). Used by the licensed_states check and by save_my_builder.
create or replace function public.is_state_code_array(p text[])
returns boolean
language sql
immutable
as $$
  select p is null
      or coalesce((select bool_and(s ~ '^[A-Z]{2}$') from unnest(p) s), true);
$$;

-- jsonb array (or a comma-separated string) -> trimmed, non-empty text[].
create or replace function public.jsonb_text_array(j jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(
    case
      when j is null or jsonb_typeof(j) = 'null' then '{}'::text[]
      when jsonb_typeof(j) = 'array' then
        array(select trim(x) from jsonb_array_elements_text(j) x where trim(x) <> '')
      when jsonb_typeof(j) = 'string' then
        array(select trim(x) from unnest(string_to_array(j #>> '{}', ',')) x where trim(x) <> '')
      else '{}'::text[]
    end,
    '{}'::text[]
  );
$$;

-- Keep only the elements that appear in the allow list, in input order.
create or replace function public.text_array_keep(arr text[], allowed text[])
returns text[]
language sql
immutable
as $$
  select coalesce(
    array(select t.x from unnest(arr) with ordinality as t(x, i) where t.x = any (allowed) order by t.i),
    '{}'::text[]
  );
$$;

-- Uppercase, de-duplicate and keep only two-letter state codes.
create or replace function public.text_array_state_codes(arr text[])
returns text[]
language sql
immutable
as $$
  select coalesce(
    array(select distinct upper(trim(x)) from unnest(arr) x where upper(trim(x)) ~ '^[A-Z]{2}$' order by 1),
    '{}'::text[]
  );
$$;

-- ── builders: the full record (5.1) ─────────────────────────────────────────
alter table public.builders
  add column contact_name           text,
  add column address_line           text,
  add column city                   text,
  add column zip                    text,
  add column service_states         text[] not null default '{}',   -- states marketed to and served
  add column build_methods          text[] not null default '{}'
        check (build_methods <@ array['site_built', 'modular', 'manufactured', 'panelized', 'kit']::text[]),
  add column turnkey                boolean not null default false,  -- end to end, from selection to build
  add column licensed_states        text[] not null default '{}'     -- licensed or approved to do the work
        check (public.is_state_code_array(licensed_states)),
  add column owner_user_id          uuid unique references public.users (id) on delete set null,
  -- Default 'approved' so every row created by an admin before this migration
  -- stays live. Self-serve rows are inserted as 'draft' by save_my_builder().
  add column profile_status         text not null default 'approved'
        check (profile_status in ('draft', 'pending', 'approved', 'inactive')),
  add column approved_at            timestamptz,
  add column approved_by            uuid references public.users (id) on delete set null,
  add column admin_notes            text,
  add column commercial_terms       text,
  -- Recorded terms. See the header: nothing bills these.
  add column membership_price_cents integer not null default 4900,
  add column success_fee_cents      integer not null default 50000,
  add column intro_days             integer not null default 90,
  add column joined_at              timestamptz not null default now();

comment on column public.builders.membership_price_cents is 'Recorded term only ($49 a month after intro_days). Nothing bills this.';
comment on column public.builders.success_fee_cents      is 'Recorded term only ($500 per project_signed event). Nothing bills this.';
comment on column public.builders.intro_days             is 'Recorded term only (days at $0 after approval). Nothing bills this.';
comment on column public.builders.commercial_terms       is 'Free text for the arrangement once agreed. No logic reads it.';

-- Backfill: rows that exist today were created by an admin and are live;
-- they keep profile_status 'approved' (the default) and joined when created.
update public.builders set joined_at = created_at;

create index builders_profile_status_idx  on public.builders (profile_status, active);
create index builders_licensed_states_idx on public.builders using gin (licensed_states);
create index builders_service_states_idx  on public.builders using gin (service_states);

-- 0004's row policy limited paid homeowners to active rows. Only approved
-- rows are visible now. This policy is moot once the table grant below is
-- revoked (homeowners read the view), and is kept correct for defense in
-- depth should the grant ever come back.
drop policy if exists builders_select_paid on public.builders;
create policy builders_select_paid on public.builders
  for select to authenticated
  using (
    active
    and profile_status = 'approved'
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid() and public.users_is_paid(u)
    )
  );

-- =============================================================================
-- builders_public: what a homeowner reads.
--
-- Directory columns only. Deliberately absent: contact_name, address_line,
-- owner_user_id, profile_status, approval audit, admin_notes,
-- commercial_terms, the pricing terms, referral_code and updated_at.
--
-- The view is owned by the migration role, so it reads public.builders with
-- the owner's privileges (a "security definer" view; Supabase's linter flags
-- these, and that is exactly what is wanted here: the homeowner has NO grant
-- on the table). Because the owner bypasses RLS, the access rule 0004 put in
-- builders_select_paid is restated inside the view: approved, active, and the
-- caller is a paid homeowner (Golden and up). Anonymous visitors keep the
-- featured teaser through get_featured_builders().
-- =============================================================================
create or replace view public.builders_public as
  select
    b.id, b.slug, b.name, b.description, b.logo_path, b.website, b.external_link,
    b.contact_email, b.contact_phone, b.state, b.city, b.cities, b.service_zips,
    b.service_states, b.specialties, b.service_types, b.build_approach,
    b.build_methods, b.turnkey, b.licensed_states, b.photos, b.videos,
    b.featured, b.created_at
  from public.builders b
  where b.profile_status = 'approved'
    and b.active
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid() and public.users_is_paid(u)
    );

revoke all on public.builders_public from anon, authenticated;
grant select on public.builders_public to authenticated;

-- Homeowners read only the view from here on. A table-level REVOKE also
-- removes the column-level SELECT list 0005 granted (Postgres REVOKE: "the
-- corresponding column privileges are automatically revoked on each column").
revoke select on public.builders from authenticated;

-- Public teaser: approved rows only.
create or replace function public.get_featured_builders()
returns table (slug text, name text, state text, cities text[], specialties text[], logo_path text)
language sql
security definer
set search_path = public
stable
as $$
  select slug, name, state, cities, specialties, logo_path
  from public.builders
  where active and featured and profile_status = 'approved'
  order by name
  limit 6;
$$;
grant execute on function public.get_featured_builders() to anon, authenticated;

-- =============================================================================
-- referral_events: raw events, one row each (5.3).
--
-- No stage, no score, no "qualified" flag. user_id and lead_id are nullable
-- references so a deleted person leaves the count behind. session_id is the
-- browser's random id for anonymous link visits (localStorage "aduatlas.sid").
-- tier and amount_cents are filled only for package_purchased (what Stripe
-- charged) and package_refunded (what Stripe returned, as a positive number);
-- note only for project_signed. occurred_on lets the unique indexes
-- de-duplicate per day.
--
-- Nobody reads or writes this table directly from the client. Writes arrive
-- through the RPCs and triggers below and through the service role
-- (api/stripe-webhook.js, api/referral-click.js, /api/admin/builders/*).
-- =============================================================================
create table public.referral_events (
  id          uuid primary key default gen_random_uuid(),
  builder_id  uuid not null references public.builders (id) on delete cascade,
  kind        text not null check (kind in (
                'link_visited', 'email_captured', 'account_created', 'package_purchased',
                'package_refunded', 'builder_profile_viewed', 'builder_contacted',
                'project_signed')),
  user_id     uuid references public.users (id) on delete set null,
  lead_id     uuid references public.leads (id) on delete set null,
  session_id  text,
  tier        text,
  amount_cents integer,
  note        text,
  occurred_at timestamptz not null default now(),
  occurred_on date generated always as ((occurred_at at time zone 'utc')::date) stored
);

create index referral_events_builder_kind_idx     on public.referral_events (builder_id, kind);
create index referral_events_builder_occurred_idx on public.referral_events (builder_id, occurred_at);

-- A signed-in homeowner counts once a day per builder for views and contacts.
create unique index referral_events_homeowner_daily_uidx
  on public.referral_events (builder_id, user_id, kind, occurred_on)
  where kind in ('builder_profile_viewed', 'builder_contacted');

-- A browser counts one visit a day per builder.
create unique index referral_events_visit_daily_uidx
  on public.referral_events (builder_id, session_id, occurred_on)
  where kind = 'link_visited';

-- A lead's email is captured once per builder, however many times the email
-- gate is resubmitted (additive to the contract; keeps the count honest).
create unique index referral_events_email_captured_uidx
  on public.referral_events (builder_id, lead_id)
  where kind = 'email_captured';

-- A person is counted as an account once per builder. Two triggers below can
-- both reach for this event (insert-time lead inheritance and the update-time
-- stamp); this index is what makes them idempotent together.
create unique index referral_events_account_created_uidx
  on public.referral_events (builder_id, user_id)
  where kind = 'account_created';

alter table public.referral_events enable row level security;
revoke all on public.referral_events from anon, authenticated;
-- No policies and no grants: service role only, plus the RPCs below.

-- ── account_created: users.referred_by_builder_id null -> value ─────────────
-- The Stripe webhook stamps referred_by_builder_id once (0005). Recording the
-- event from a trigger keeps the auth trigger in 0001 untouched. The insert
-- is `on conflict do nothing` against referral_events_account_created_uidx so
-- the insert-time trigger below and this one never record the event twice.
create or replace function public.log_referral_account_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.referred_by_builder_id is null and new.referred_by_builder_id is not null then
    insert into public.referral_events (builder_id, kind, user_id)
    values (new.referred_by_builder_id, 'account_created', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger users_referral_attributed
  after update of referred_by_builder_id on public.users
  for each row execute function public.log_referral_account_created();

-- ── first touch on insert: a new users row inherits its lead's referrer ─────
-- Until now account_created fired only when the webhook stamped the referrer
-- at purchase, so a referred visitor who signed up and never bought was not
-- counted. Every users row is created by insert (the 0001 auth trigger on
-- signup, or the webhook upsert on a purchase before signup), so an AFTER
-- INSERT trigger catches both. When the new row carries no referrer, the
-- lead row for the same email (leads.email is unique, so "most recent" is
-- that one row) supplies it: referred_by_builder_id, the code as it arrived
-- and referred_at, then one account_created event.
--
-- Why this beats the webhook on a purchase-before-signup: the lead is the
-- EARLIER touch, so first touch is honoured; the webhook then finds the
-- referrer already set and leaves it (its update is guarded by "is null").
-- The update below fires users_referral_attributed, whose insert and this
-- one collapse into a single event through the unique index. Kept separate
-- from the 0001 auth trigger, which stays about auth linkage only.
create or replace function public.inherit_referral_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  if new.referred_by_builder_id is not null then
    return new;
  end if;

  select l.* into v_lead
    from public.leads l
   where l.email = new.email
     and l.referred_by_builder_id is not null
   order by l.created_at desc
   limit 1;
  if v_lead.id is null then
    return new;
  end if;

  update public.users u
     set referred_by_builder_id = v_lead.referred_by_builder_id,
         referral_code          = v_lead.referral_code,
         referred_at            = now()
   where u.id = new.id
     and u.referred_by_builder_id is null;

  insert into public.referral_events (builder_id, kind, user_id, lead_id)
  values (v_lead.referred_by_builder_id, 'account_created', new.id, v_lead.id)
  on conflict do nothing;

  return new;
end;
$$;

create trigger users_referral_from_lead
  after insert on public.users
  for each row execute function public.inherit_referral_from_lead();

-- =============================================================================
-- handle_new_auth_user(): the 0001 auth trigger, replaced in place (the
-- trigger on auth.users keeps pointing at this name). One change: a builder
-- who signs up as 'pro' on an email that already has a users row becomes
-- 'pro'. Before, the on-conflict branch kept the prior role unconditionally,
-- which was right for a pre-existing ACCOUNT (a homeowner cannot turn
-- themselves into a builder by signing up again) but wrong for a row the
-- Stripe webhook created from a payment alone: that row has no auth_user_id,
-- defaulted to 'homeowner', and nobody ever chose that role. So the role is
-- upgraded to 'pro' only when the row is not yet linked to any auth user
-- (auth_user_id is null) and the signup asked for 'pro'. 'admin' is still
-- unreachable from a signup: the clamp to homeowner|pro is unchanged and the
-- conflict branch can only ever write 'pro' or the existing role.
-- =============================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Role comes from signup metadata but is CLAMPED here (server-side) to
  -- homeowner|pro so a client can never self-assign 'admin'.
  insert into public.users (auth_user_id, email, role)
  values (
    new.id,
    new.email,
    case when new.raw_user_meta_data->>'role' = 'pro' then 'pro' else 'homeowner' end
  )
  on conflict (email)
    do update set auth_user_id = excluded.auth_user_id,
                  -- see the block comment above: an unclaimed webhook row may
                  -- take 'pro'; a row that already had an account keeps its role
                  role         = case
                                   when public.users.auth_user_id is null and excluded.role = 'pro' then 'pro'
                                   else public.users.role
                                 end,
                  updated_at   = now();
  return new;
end;
$$;

-- =============================================================================
-- capture_lead(): same signature as 0005; resolves codes to APPROVED, active
-- builders and records email_captured against the builder the lead is
-- attributed to (first touch, as before).
-- =============================================================================
create or replace function public.capture_lead(
  p_email         citext,
  p_source        text default 'unlock',
  p_quiz_answers  jsonb default null,
  p_referral_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         uuid;
  v_code       text;
  v_builder    uuid;
  v_attributed uuid;
begin
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'invalid email';
  end if;

  -- Normalise and resolve the code (case-insensitive) to an APPROVED, active
  -- builder. A malformed, unknown or unapproved code is ignored, never an
  -- error: the lead still lands. The normalised code is kept even when it does
  -- not resolve so an admin can see what arrived.
  v_code := upper(nullif(trim(p_referral_code), ''));
  if v_code is not null and v_code ~ '^[A-HJ-NP-Z2-9]{8}$' then
    select b.id into v_builder
      from public.builders b
     where b.referral_code = v_code and b.active and b.profile_status = 'approved'
     limit 1;
  else
    v_code := null;
  end if;

  insert into public.leads (email, source, quiz_answers, referral_code, referred_by_builder_id)
  values (lower(p_email), coalesce(p_source, 'unlock'), p_quiz_answers, v_code, v_builder)
  on conflict (email) do update
    set quiz_answers           = coalesce(excluded.quiz_answers, public.leads.quiz_answers),
        source                 = coalesce(excluded.source, public.leads.source),
        -- first touch wins: an existing attribution is never replaced
        referral_code          = coalesce(public.leads.referral_code, excluded.referral_code),
        referred_by_builder_id = coalesce(public.leads.referred_by_builder_id, excluded.referred_by_builder_id)
  returning id, referred_by_builder_id into v_id, v_attributed;

  -- One email_captured per (builder, lead); the unique index absorbs repeats.
  if v_attributed is not null then
    insert into public.referral_events (builder_id, kind, lead_id)
    values (v_attributed, 'email_captured', v_id)
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;

grant execute on function public.capture_lead(citext, text, jsonb, text)
  to anon, authenticated;

-- =============================================================================
-- log_builder_event(): a signed-in homeowner viewed or contacted a builder.
-- Only those two kinds; everything else is recorded server-side. Builder
-- accounts (role 'pro') are excluded so a builder looking at profiles never
-- counts as homeowner interest. Unapproved builders are ignored quietly.
-- =============================================================================
create or replace function public.log_builder_event(p_builder_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  if p_kind not in ('builder_profile_viewed', 'builder_contacted') then
    raise exception 'event kind not allowed';
  end if;

  select * into v_user from public.users where auth_user_id = auth.uid();
  if v_user.id is null then
    raise exception 'not signed in';
  end if;
  if v_user.role = 'pro' then
    return;
  end if;

  if not exists (
    select 1 from public.builders b
    where b.id = p_builder_id and b.active and b.profile_status = 'approved'
  ) then
    return;
  end if;

  insert into public.referral_events (builder_id, kind, user_id)
  values (p_builder_id, p_kind, v_user.id)
  on conflict do nothing;
end;
$$;

revoke execute on function public.log_builder_event(uuid, text) from public, anon;
grant  execute on function public.log_builder_event(uuid, text) to authenticated, service_role;

-- =============================================================================
-- log_referral_visit(): someone opened https://aduatlas.com/?ref=<code>.
-- Called ONLY by api/referral-click.js with the service client. One visit a
-- day per (builder, browser). Returns whether a builder matched; the endpoint
-- ignores that and answers 204 to every POST. The function is not executable
-- by anon or authenticated: with a grant, the anon key could call it through
-- PostgREST and read the boolean to test which codes exist.
-- =============================================================================
create or replace function public.log_referral_visit(p_code text, p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code    text;
  v_builder uuid;
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{8,64}$' then
    return false;
  end if;

  v_code := upper(nullif(trim(p_code), ''));
  if v_code is null or v_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
    return false;
  end if;

  select b.id into v_builder
    from public.builders b
   where b.referral_code = v_code and b.active and b.profile_status = 'approved'
   limit 1;
  if v_builder is null then
    return false;
  end if;

  insert into public.referral_events (builder_id, kind, session_id)
  values (v_builder, 'link_visited', p_session_id)
  on conflict do nothing;

  return true;
end;
$$;

revoke execute on function public.log_referral_visit(text, text) from public, anon, authenticated;
grant  execute on function public.log_referral_visit(text, text) to service_role;

-- =============================================================================
-- Builder portal RPCs. Each one finds the caller's OWN builder row through
-- owner_user_id and never touches anyone else's. commercial_terms and
-- admin_notes are blanked on the way out: the builder sees the profile it
-- can edit, not the admin's side of the record.
-- =============================================================================

-- The caller's owned row, or no rows.
create or replace function public.my_builder()
returns setof public.builders
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.builders%rowtype;
begin
  select b.* into v_row
    from public.builders b
   where b.owner_user_id = public.current_app_user_id();
  if v_row.id is null then
    return;
  end if;
  v_row.commercial_terms := null;
  v_row.admin_notes      := null;
  return next v_row;
end;
$$;

revoke execute on function public.my_builder() from public, anon;
grant  execute on function public.my_builder() to authenticated;

-- Create (as draft) or update the caller's profile from a jsonb patch. Only
-- the whitelisted keys are read; a key that is absent leaves the column
-- alone. Never touches status, referral_code, active, featured, photos,
-- pricing, terms, owner or audit. Editing an approved row does not change its
-- status; the admin sees updated_at move.
--
-- Links: the homeowner profile page renders website and external_link as
-- hrefs, so each is accepted only when it starts with http:// or https://
-- (case-insensitive); anything else (javascript:, data:, a bare domain) is
-- rejected with 'links must start with http:// or https://'. An empty value
-- still clears the column. videos holds YouTube/Vimeo URLs and gets the same
-- rule. logo_path is a storage path written by the admin API, not a URL, and
-- is not editable here.
create or replace function public.save_my_builder(p jsonb)
returns public.builders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        public.users%rowtype;
  v_row         public.builders%rowtype;
  v_name        text;
  v_state       text;
  v_base        text;
  v_slug        text;
  v_n           integer := 0;
  v_website     text;
  v_external    text;
  v_videos      text[];
  c_specialties constant text[] := array['detached', 'attached', 'garage_conversion', 'jadu', 'prefab', 'two_story'];
  c_services    constant text[] := array['design_build', 'general_contractor', 'prefab_manufacturer', 'architect', 'permit_expediter'];
  c_methods     constant text[] := array['site_built', 'modular', 'manufactured', 'panelized', 'kit'];
  c_http        constant text   := '^https?://';
begin
  select * into v_user from public.users where auth_user_id = auth.uid();
  if v_user.id is null then
    raise exception 'not signed in';
  end if;
  if v_user.role <> 'pro' then
    raise exception 'only builder accounts can edit a builder profile';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'profile must be an object';
  end if;

  -- Validate links before any row is created or touched.
  if p ? 'website' then
    v_website := left(nullif(trim(p->>'website'), ''), 300);
    if v_website is not null and v_website !~* c_http then
      raise exception 'links must start with http:// or https://';
    end if;
  end if;
  if p ? 'external_link' then
    v_external := left(nullif(trim(p->>'external_link'), ''), 300);
    if v_external is not null and v_external !~* c_http then
      raise exception 'links must start with http:// or https://';
    end if;
  end if;
  if p ? 'videos' then
    v_videos := (public.jsonb_text_array(p->'videos'))[1:2];
    if exists (select 1 from unnest(v_videos) v where v !~* c_http) then
      raise exception 'links must start with http:// or https://';
    end if;
  end if;

  select b.* into v_row from public.builders b where b.owner_user_id = v_user.id for update;

  if v_row.id is null then
    v_name  := left(trim(coalesce(p->>'name', '')), 120);
    v_state := upper(trim(coalesce(p->>'state', '')));
    if v_name = '' then
      raise exception 'company name is required';
    end if;
    if v_state !~ '^[A-Z]{2}$' then
      raise exception 'a two-letter state is required';
    end if;

    -- Slug from the name; a numeric suffix on collision. Fixed after creation
    -- so a profile link keeps working when the company is renamed.
    v_base := trim(both '-' from left(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), 60));
    if v_base = '' then
      v_base := 'builder';
    end if;
    v_slug := v_base;
    while exists (select 1 from public.builders where slug = v_slug) loop
      v_n    := v_n + 1;
      v_slug := left(v_base, 52) || '-' || v_n;
    end loop;

    -- Draft, and inactive until an admin approves: every 0005-era check that
    -- looks at `active` alone also excludes an unapproved self-serve row.
    insert into public.builders
      (slug, name, state, contact_email, owner_user_id, profile_status, active, featured, joined_at)
    values
      (v_slug, v_name, v_state, v_user.email::text, v_user.id, 'draft', false, false, now())
    returning * into v_row;
  end if;

  update public.builders b set
    name            = case when p ? 'name' and nullif(trim(p->>'name'), '') is not null
                           then left(trim(p->>'name'), 120) else b.name end,
    description     = case when p ? 'description'     then left(nullif(trim(p->>'description'), ''), 4000)   else b.description end,
    address_line    = case when p ? 'address_line'    then left(nullif(trim(p->>'address_line'), ''), 200)   else b.address_line end,
    city            = case when p ? 'city'            then left(nullif(trim(p->>'city'), ''), 80)            else b.city end,
    state           = case when p ? 'state' and upper(trim(p->>'state')) ~ '^[A-Z]{2}$'
                           then upper(trim(p->>'state')) else b.state end,
    zip             = case when p ? 'zip'             then left(nullif(trim(p->>'zip'), ''), 10)             else b.zip end,
    contact_name    = case when p ? 'contact_name'    then left(nullif(trim(p->>'contact_name'), ''), 120)   else b.contact_name end,
    contact_email   = case when p ? 'contact_email'   then left(nullif(trim(p->>'contact_email'), ''), 200)  else b.contact_email end,
    contact_phone   = case when p ? 'contact_phone'   then left(nullif(trim(p->>'contact_phone'), ''), 40)   else b.contact_phone end,
    website         = case when p ? 'website'         then v_website                                        else b.website end,
    external_link   = case when p ? 'external_link'   then v_external                                       else b.external_link end,
    cities          = case when p ? 'cities'          then public.jsonb_text_array(p->'cities')              else b.cities end,
    service_zips    = case when p ? 'service_zips'    then public.jsonb_text_array(p->'service_zips')        else b.service_zips end,
    service_states  = case when p ? 'service_states'  then public.text_array_state_codes(public.jsonb_text_array(p->'service_states'))  else b.service_states end,
    specialties     = case when p ? 'specialties'     then public.text_array_keep(public.jsonb_text_array(p->'specialties'), c_specialties) else b.specialties end,
    service_types   = case when p ? 'service_types'   then public.text_array_keep(public.jsonb_text_array(p->'service_types'), c_services)  else b.service_types end,
    build_approach  = case when p ? 'build_approach' and p->>'build_approach' in ('custom', 'prefab', 'both')
                           then p->>'build_approach' else b.build_approach end,
    build_methods   = case when p ? 'build_methods'   then public.text_array_keep(public.jsonb_text_array(p->'build_methods'), c_methods)   else b.build_methods end,
    turnkey         = case when p ? 'turnkey'         then coalesce((p->>'turnkey')::boolean, false)         else b.turnkey end,
    licensed_states = case when p ? 'licensed_states' then public.text_array_state_codes(public.jsonb_text_array(p->'licensed_states')) else b.licensed_states end,
    videos          = case when p ? 'videos'          then v_videos                                         else b.videos end
  where b.id = v_row.id
  returning * into v_row;

  v_row.commercial_terms := null;
  v_row.admin_notes      := null;
  return v_row;
end;
$$;

revoke execute on function public.save_my_builder(jsonb) from public, anon;
grant  execute on function public.save_my_builder(jsonb) to authenticated;

-- draft -> pending, and nothing else. Approval is an admin action
-- (/api/admin/builders/approve with the service role).
create or replace function public.submit_my_builder()
returns public.builders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_row  public.builders%rowtype;
begin
  select * into v_user from public.users where auth_user_id = auth.uid();
  if v_user.id is null then
    raise exception 'not signed in';
  end if;
  if v_user.role <> 'pro' then
    raise exception 'only builder accounts can submit a builder profile';
  end if;

  select b.* into v_row from public.builders b where b.owner_user_id = v_user.id for update;
  if v_row.id is null then
    raise exception 'save your profile before submitting it';
  end if;
  if v_row.profile_status <> 'draft' then
    raise exception 'only a draft profile can be submitted';
  end if;

  update public.builders set profile_status = 'pending' where id = v_row.id
  returning * into v_row;

  v_row.commercial_terms := null;
  v_row.admin_notes      := null;
  return v_row;
end;
$$;

revoke execute on function public.submit_my_builder() from public, anon;
grant  execute on function public.submit_my_builder() to authenticated;

-- Aggregate counts for the caller's builder and nothing identifying:
--   { "counts": { "<kind>": n, ... all eight kinds, zero-filled },
--     "referred_users_count": n,       -- users.referred_by_builder_id = me
--     "purchased_amount_cents": n,     -- sum of package_purchased.amount_cents (gross)
--     "refunded_amount_cents": n,      -- sum of package_refunded.amount_cents
--     "net_amount_cents": n }          -- purchased minus refunded
-- purchased_amount_cents stays gross so it keeps matching the purchases
-- count; refunds are exposed alongside and netted in net_amount_cents.
-- Null when the caller owns no builder row.
create or replace function public.my_referral_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_builder   uuid;
  v_counts    jsonb;
  v_purchased bigint;
  v_refunded  bigint;
begin
  select b.id into v_builder
    from public.builders b
   where b.owner_user_id = public.current_app_user_id();
  if v_builder is null then
    return null;
  end if;

  select jsonb_build_object(
           'link_visited',           count(*) filter (where e.kind = 'link_visited'),
           'email_captured',         count(*) filter (where e.kind = 'email_captured'),
           'account_created',        count(*) filter (where e.kind = 'account_created'),
           'package_purchased',      count(*) filter (where e.kind = 'package_purchased'),
           'package_refunded',       count(*) filter (where e.kind = 'package_refunded'),
           'builder_profile_viewed', count(*) filter (where e.kind = 'builder_profile_viewed'),
           'builder_contacted',      count(*) filter (where e.kind = 'builder_contacted'),
           'project_signed',         count(*) filter (where e.kind = 'project_signed')),
         coalesce(sum(e.amount_cents) filter (where e.kind = 'package_purchased'), 0),
         coalesce(sum(e.amount_cents) filter (where e.kind = 'package_refunded'), 0)
    into v_counts, v_purchased, v_refunded
    from public.referral_events e
   where e.builder_id = v_builder;

  return jsonb_build_object(
    'counts', v_counts,
    'referred_users_count',
      (select count(*) from public.users u where u.referred_by_builder_id = v_builder),
    'purchased_amount_cents', v_purchased,
    'refunded_amount_cents',  v_refunded,
    'net_amount_cents',       v_purchased - v_refunded
  );
end;
$$;

revoke execute on function public.my_referral_stats() from public, anon;
grant  execute on function public.my_referral_stats() to authenticated;

-- =============================================================================
-- referral_stats(): what the admin sees per builder. The 0005 users/leads
-- counts plus one column per event kind. Counts and summed order values; no
-- fee, no commission, no balance. purchase_amount_cents is gross (it matches
-- the purchases count); refunds and refunded_amount_cents sit alongside and
-- net_amount_cents is the difference. The return type changes, so the 0005
-- function is dropped first and its service-role-only grants restated.
-- =============================================================================
drop function if exists public.referral_stats();

create function public.referral_stats()
returns table (
  builder_id            uuid,
  name                  text,
  referral_code         text,
  profile_status        text,
  active                boolean,
  leads_count           integer,
  paid_count            integer,
  paid_by_tier          jsonb,
  visits                integer,
  emails                integer,
  accounts              integer,
  purchases             integer,
  purchase_amount_cents bigint,
  refunds               integer,
  refunded_amount_cents bigint,
  net_amount_cents      bigint,
  profile_views         integer,
  contacts              integer,
  projects_signed       integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    b.id                                                         as builder_id,
    b.name,
    b.referral_code,
    b.profile_status,
    b.active,
    (select count(*)::int
       from public.leads l
      where l.referred_by_builder_id = b.id)                     as leads_count,
    (select count(*)::int
       from public.users u
      where u.referred_by_builder_id = b.id
        and public.users_is_paid(u))                             as paid_count,
    coalesce((
      select jsonb_object_agg(t.paid_tier, t.n)
        from (
          select u.paid_tier, count(*)::int as n
            from public.users u
           where u.referred_by_builder_id = b.id
             and public.users_is_paid(u)
             and u.paid_tier is not null
           group by u.paid_tier
        ) t
    ), '{}'::jsonb)                                              as paid_by_tier,
    coalesce(e.visits, 0)                                        as visits,
    coalesce(e.emails, 0)                                        as emails,
    coalesce(e.accounts, 0)                                      as accounts,
    coalesce(e.purchases, 0)                                     as purchases,
    coalesce(e.purchase_amount_cents, 0)                         as purchase_amount_cents,
    coalesce(e.refunds, 0)                                       as refunds,
    coalesce(e.refunded_amount_cents, 0)                         as refunded_amount_cents,
    coalesce(e.purchase_amount_cents, 0)
      - coalesce(e.refunded_amount_cents, 0)                     as net_amount_cents,
    coalesce(e.profile_views, 0)                                 as profile_views,
    coalesce(e.contacts, 0)                                      as contacts,
    coalesce(e.projects_signed, 0)                               as projects_signed
  from public.builders b
  left join (
    select
      r.builder_id,
      count(*) filter (where r.kind = 'link_visited')::int                       as visits,
      count(*) filter (where r.kind = 'email_captured')::int                     as emails,
      count(*) filter (where r.kind = 'account_created')::int                    as accounts,
      count(*) filter (where r.kind = 'package_purchased')::int                  as purchases,
      coalesce(sum(r.amount_cents) filter (where r.kind = 'package_purchased'), 0)::bigint as purchase_amount_cents,
      count(*) filter (where r.kind = 'package_refunded')::int                   as refunds,
      coalesce(sum(r.amount_cents) filter (where r.kind = 'package_refunded'), 0)::bigint  as refunded_amount_cents,
      count(*) filter (where r.kind = 'builder_profile_viewed')::int             as profile_views,
      count(*) filter (where r.kind = 'builder_contacted')::int                  as contacts,
      count(*) filter (where r.kind = 'project_signed')::int                     as projects_signed
    from public.referral_events r
    group by r.builder_id
  ) e on e.builder_id = b.id
  order by b.name;
$$;

revoke execute on function public.referral_stats() from public, anon, authenticated;
grant  execute on function public.referral_stats() to service_role;

-- =============================================================================
-- admin_mark_project_signed(): the one event ADUAtlas cannot detect. Called
-- from /api/admin/builders/mark-project-signed with the service client after
-- the admin API resolves the homeowner's email to users.id. Records the
-- event; collecting the $500 is a manual step until someone decides otherwise.
-- =============================================================================
create or replace function public.admin_mark_project_signed(p_builder_id uuid, p_user_id uuid, p_note text)
returns public.referral_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.referral_events%rowtype;
begin
  if not exists (select 1 from public.builders b where b.id = p_builder_id) then
    raise exception 'builder not found';
  end if;
  if p_user_id is not null and not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'homeowner not found';
  end if;

  insert into public.referral_events (builder_id, kind, user_id, note)
  values (p_builder_id, 'project_signed', p_user_id, left(nullif(trim(p_note), ''), 2000))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.admin_mark_project_signed(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.admin_mark_project_signed(uuid, uuid, text) to service_role;

-- =============================================================================
-- Notes
--   • Homeowners never had, and still do not have, a grant on referral_events,
--     leads or the admin side of builders. Their whole view of a builder is
--     builders_public plus the two events log_builder_event lets them record
--     about themselves.
--   • A builder's whole view of homeowners is my_referral_stats(): counts.
--   • Approval (draft/pending -> approved, active true, approved_at/by,
--     referral_code generated if missing) and set-status live in
--     /api/admin/builders/* with the service role, as every admin write does.
--   • Only approved, active builders resolve from a referral code, in
--     capture_lead, log_referral_visit and the Stripe webhook alike. A code on
--     a draft or inactive profile is a dead link, never an error.
--   • package_refunded is written by api/stripe-webhook.js (charge.refunded)
--     with the service role, against the buyer's referred_by_builder_id. It
--     is a record of what Stripe returned, netted in the stats functions, and
--     nothing more: no fee, commission or clawback follows from it.
--   • No money moves anywhere in this file. See the header.
-- =============================================================================
