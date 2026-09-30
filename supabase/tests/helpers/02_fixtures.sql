-- =============================================================================
-- 02_fixtures.sql — the people and listings the invariant suites act on.
--
-- Rules these fixtures follow, so that suites stay independent of each other
-- and of the order they run in:
--
--   • Every fixture is UNIQUE per call. Slugs and emails carry a counter, so two
--     suites can both ask for "an unclaimed Arizona builder" without colliding
--     and without one suite's mutation changing another's expected row.
--   • A fixture goes in the way PRODUCTION would put it in. An account is
--     created by inserting into auth.users, which fires the real
--     handle_new_auth_user trigger; a payment is stamped the way the Stripe
--     webhook stamps it (service role, the billing columns); a claim goes
--     through the real claim path or through the owner_user_id write that the
--     admin route uses, both of which pass the builders_on_claim trigger.
--     A fixture that reached around a trigger would quietly disable the very
--     thing under test.
--   • Nothing here asserts. Fixtures build state; the invariant files judge it.
-- =============================================================================

create sequence t.fixture_seq;

create or replace function t.nextlabel(p_prefix text)
returns text
language sql
as $$
  select p_prefix || '-' || nextval('t.fixture_seq')::text;
$$;

-- The claim/referral alphabet from 0005 and 0007: no 0, O, 1 or I.
create or replace function t.code()
returns text
language plpgsql
as $$
declare
  v text;
begin
  loop
    select string_agg(
             substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      into v
      from generate_series(1, 8);
    exit when not exists (
      select 1 from public.builders where referral_code = v or claim_code = v
    );
  end loop;
  return v;
end
$$;

-- ── accounts ────────────────────────────────────────────────────────────────
-- Returns public.users.id. auth_user_id is derivable from it and every suite
-- that needs the JWT subject reads it back with t.authid().
create or replace function t.mk_account(p_role text default 'homeowner')
returns uuid
language plpgsql
as $$
declare
  v_label text := t.nextlabel(p_role);
  v_auth  uuid;
  v_user  uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), v_label || '@example.test', jsonb_build_object('role', p_role))
  returning id into v_auth;

  -- 0001's on_auth_user_created trigger created the public.users row and
  -- CLAMPED the role to homeowner|pro. 'admin' is deliberately not assignable
  -- from signup metadata, so an admin fixture is promoted here the way a
  -- service-role bootstrap would have to.
  select id into v_user from public.users where auth_user_id = v_auth;
  if p_role = 'admin' then
    update public.users set role = 'admin' where id = v_user;
  end if;
  return v_user;
end
$$;

create or replace function t.authid(p_user uuid)
returns uuid
language sql
stable
as $$
  select auth_user_id from public.users where id = p_user;
$$;

-- A paid homeowner, stamped the way api/stripe-webhook.js stamps one: since the
-- RC1 launch gate (DEF-20) a collected payment records paid_origin = 'purchase'
-- in the upsert, and a follow-up restatement fills it back in if 0019's trigger
-- cleared it on a tier move. Both statements are mirrored here.
create or replace function t.mk_paid_homeowner(p_tier text default 'report')
returns uuid
language plpgsql
as $$
declare
  v uuid := t.mk_account('homeowner');
begin
  update public.users
     set paid_at = now(), paid_tier = p_tier, stripe_customer_id = 'cus_' || v::text,
         refunded_at = null, paid_origin = 'purchase'
   where id = v;
  update public.users set paid_origin = 'purchase'
   where id = v and paid_tier = p_tier and paid_at is not null and refunded_at is null and paid_origin is null;
  return v;
end
$$;

create or replace function t.mk_refunded_homeowner(p_tier text default 'report')
returns uuid
language plpgsql
as $$
declare
  v uuid := t.mk_paid_homeowner(p_tier);
begin
  update public.users set refunded_at = now() where id = v;
  return v;
end
$$;

-- ── builders ────────────────────────────────────────────────────────────────
-- p_opts is a patch over the defaults, so a suite states only what it cares
-- about:  t.mk_builder('{"relationship_type":"affiliate"}')
--
-- Defaults chosen to be the SEEDED shape: approved (an admin-created row is
-- live), active, unclaimed, unverified, marketplace, and — after 0008 — turnkey
-- and build_approach left null, because a seeded listing's source material said
-- nothing. A suite that wants a stated answer sets it explicitly.
create or replace function t.mk_builder(p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
as $$
declare
  v_label text := t.nextlabel('builder');
  v_id    uuid;
begin
  insert into public.builders (
    slug, name, state, city, cities, specialties, service_types, service_states,
    build_methods, licensed_states, description, website,
    contact_email, contact_phone,
    active, featured, profile_status, relationship_type,
    referral_code, claim_code,
    logo_path, photos
  ) values (
    coalesce(p_opts->>'slug', v_label),
    coalesce(p_opts->>'name', 'Test ' || v_label),
    coalesce(p_opts->>'state', 'AZ'),
    coalesce(p_opts->>'city', 'Phoenix'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_opts->'cities') x), array['Phoenix']),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_opts->'specialties') x), array['detached']),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_opts->'service_types') x), array['design_build']),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_opts->'service_states') x), array['AZ']),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_opts->'build_methods') x), array['site_built']),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_opts->'licensed_states') x), array['AZ']),
    coalesce(p_opts->>'description', 'A seeded listing for the regression suite.'),
    coalesce(p_opts->>'website', 'https://example.test/' || v_label),
    coalesce(p_opts->>'contact_email', v_label || '@builder.test'),
    coalesce(p_opts->>'contact_phone', '+1-602-555-0100'),
    coalesce((p_opts->>'active')::boolean, true),
    coalesce((p_opts->>'featured')::boolean, false),
    coalesce(p_opts->>'profile_status', 'approved'),
    coalesce(p_opts->>'relationship_type', 'marketplace'),
    coalesce(p_opts->>'referral_code', t.code()),
    case when p_opts ? 'claim_code' then nullif(p_opts->>'claim_code', '') else null end,
    coalesce(p_opts->>'logo_path', v_label || '/logo.png'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_opts->'photos') x),
             array[v_label || '/one.jpg'])
  )
  returning id into v_id;

  -- turnkey and build_approach are nullable with no default after 0008, so the
  -- insert above leaves them null (the seeded "never stated" state). Set only
  -- when the caller asked for a stated answer.
  if p_opts ? 'turnkey' then
    update public.builders set turnkey = (p_opts->>'turnkey')::boolean where id = v_id;
  end if;
  if p_opts ? 'build_approach' then
    update public.builders set build_approach = nullif(p_opts->>'build_approach', '') where id = v_id;
  end if;

  return v_id;
end
$$;

-- Issue a claim code the way /api/admin/builders/issue-claim-code does.
create or replace function t.issue_claim_code(p_builder uuid)
returns text
language plpgsql
as $$
declare
  v text := t.code();
begin
  update public.builders set claim_code = v where id = p_builder;
  return v;
end
$$;

-- Hand a listing to a pro account the way the admin link-owner route does: a
-- direct owner_user_id write with the service role, through the
-- builders_on_claim trigger.
create or replace function t.link_owner(p_builder uuid, p_pro uuid)
returns void
language sql
as $$
  update public.builders set owner_user_id = p_pro where id = p_builder;
$$;

-- The admin verification step. Separate from claiming on purpose (2e): this is
-- the only thing that may set verified_at.
create or replace function t.verify(p_builder uuid, p_admin uuid)
returns void
language sql
as $$
  update public.builders
     set verified_at = now(), verified_by = p_admin
   where id = p_builder;
$$;

-- A claimed, verified listing with its pro account. Returns the builder id;
-- the owner is read back with t.owner_of() where a suite needs it.
create or replace function t.mk_verified_builder(p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
as $$
declare
  v_b   uuid := t.mk_builder(p_opts);
  v_pro uuid := t.mk_account('pro');
  v_adm uuid := t.mk_account('admin');
begin
  perform t.link_owner(v_b, v_pro);
  perform t.verify(v_b, v_adm);
  return v_b;
end
$$;

create or replace function t.mk_claimed_builder(p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
as $$
declare
  v_b   uuid := t.mk_builder(p_opts);
  v_pro uuid := t.mk_account('pro');
begin
  perform t.link_owner(v_b, v_pro);
  return v_b;
end
$$;

create or replace function t.owner_of(p_builder uuid)
returns uuid
language sql
stable
as $$
  select owner_user_id from public.builders where id = p_builder;
$$;

create or replace function t.owner_authid(p_builder uuid)
returns uuid
language sql
stable
as $$
  select u.auth_user_id
    from public.builders b join public.users u on u.id = b.owner_user_id
   where b.id = p_builder;
$$;

-- ── a topic a suite may publish on a SHARED jurisdiction ────────────────────
-- The fifty states are seeded by 0012 and exist once, so suites that need a
-- state borrow the real row (t.gov_jur returns it). On a target such as staging
-- that row can already carry a real published rule, and 0012 allows at most ONE
-- current published rule per (jurisdiction, topic), so a suite that always
-- published on the same topic would crash the first time staging held a real
-- one. This returns p_preferred whenever that topic is free on the jurisdiction,
-- which is always true in an empty database, so the default run is unchanged;
-- otherwise the first free topic in catalogue order. With no free topic at all it
-- raises: a suite that cannot create its own precondition proves nothing.
create or replace function t.free_topic(p_jurisdiction uuid, p_preferred text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  if not exists (
    select 1 from public.regulatory_provisions
     where jurisdiction_id = p_jurisdiction and topic_key = p_preferred
       and review_status = 'published' and superseded_or_repealed_date is null) then
    return p_preferred;
  end if;
  select k.key into v
    from public.regulatory_topics k
   where not exists (
     select 1 from public.regulatory_provisions p
      where p.jurisdiction_id = p_jurisdiction and p.topic_key = k.key
        and p.review_status = 'published' and p.superseded_or_repealed_date is null)
   order by k.sort_order, k.key
   limit 1;
  if v is null then
    raise exception 'jurisdiction % already has a current published rule on every topic, so no suite can publish its own rule there', p_jurisdiction;
  end if;
  return v;
end
$$;
