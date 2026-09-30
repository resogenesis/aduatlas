-- =============================================================================
-- 0008 — Unknown means unknown
--
-- ADUAtlas seeds builder listings from a company's own public material. Where
-- that material did not say something, ADUAtlas does not know it, and the
-- interface must omit the attribute rather than print a default as if the
-- company had claimed it. Two columns arrived with a default that reads as an
-- answer:
--
--   builders.turnkey          boolean not null default false  (0006)
--                             Every seeded listing therefore says "does not
--                             take the project end to end", which is a claim
--                             about the company that nobody made.
--   builders.build_approach   text not null default 'both'    (0004)
--                             And every seeded listing says "custom and
--                             prefab", the broadest capability of the three.
--
-- Both become nullable with no default. Null means one thing only: the company
-- never stated it. False still means the company stated No.
--
-- WIDENING THE COLUMNS IS NOT ENOUGH, so this file also nulls the values that
-- can only have come from the old defaults. Before this migration both columns
-- were NOT NULL with a default, so every row in the table holds a value and
-- there is no third state to hold the truth: the defaults were never
-- distinguishable from a real answer. Leaving them would mean that on the day
-- the interface learned to omit an unknown attribute, existing listings would
-- go on printing "No. Ask this builder about the scope they take on" and
-- "Custom and prefab" as claims about companies that never made them. That is
-- exactly what decision 2b forbids, on the 84 of 96 Arizona listings that never
-- addressed scope and the 35 that never stated a build method.
--
--   turnkey = false          nulled. False could only arrive from the 0006
--                            default or from a pre-0008 write that flattened a
--                            json null to false; no surface in the product
--                            could record a deliberate No distinguishably.
--   build_approach = 'both'  nulled. Same reasoning, and 'both' is the broadest
--                            of the three, so keeping it is the widest possible
--                            overstatement.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH.
--   • turnkey = true, and build_approach 'custom' or 'prefab'. No default could
--     produce those, so each one is somebody's real answer and it stays.
--   • Anything written AFTER this migration. From here the three states are
--     storable and distinguishable, so a false or a 'both' that a builder or an
--     admin chooses from now on IS a real answer, and nothing may null it. The
--     two statements below are the one-time correction that belongs to this
--     file; they must never be copied into a later migration or into a job.
--   • Every other column, including the ones a claimed builder owns.
--
-- Why this is safe: 0008 has never been applied anywhere, so no deliberate null
-- and no post-0008 answer exists yet to destroy. The loss is bounded and
-- asymmetric. At worst a company that genuinely said "No" or "custom and
-- prefab" before today has one attribute omitted until an admin restates it, or
-- until a claimed builder restates it in the portal, which the replaced
-- save_my_builder() below finally makes possible. The alternative is publishing
-- a capability claim on behalf of a company that never made it. An omission is
-- recoverable in one edit; a misrepresentation on a public profile is not.
--
-- save_my_builder() is replaced so the builder portal can actually store the
-- third state. In 0006 a json null for turnkey was coalesced to false and a
-- json null for build_approach fell through to the stored value, so a
-- "Not stated" control would have been a no-op and the widened columns would
-- never receive a null from the one surface a builder writes through.
--
-- Nothing else changes: no new table, no new grant, no money.
-- =============================================================================

-- ── turnkey: null means the company never stated it ─────────────────────────
alter table public.builders
  alter column turnkey drop not null,
  alter column turnkey drop default;

comment on column public.builders.turnkey is 'True when the company takes the project end to end. False when it stated it does not. Null means the company never stated it: omit the attribute, never print a default.';

-- Every false in the table at this moment came from the 0006 default, or from a
-- pre-0008 write that could not tell a No from a nothing. One time only, here:
-- see WIDENING THE COLUMNS IS NOT ENOUGH above. true is untouched.
update public.builders
   set turnkey = null
 where turnkey is false;

-- ── build_approach: same three states ───────────────────────────────────────
-- The inline check from 0004 already passed a null (a null IN list is null, and
-- a null check constraint passes), but it read as though the column always held
-- one of the three. Restated so the allowed values include null on their face.
alter table public.builders
  alter column build_approach drop not null,
  alter column build_approach drop default;

alter table public.builders
  drop constraint if exists builders_build_approach_check;

alter table public.builders
  add constraint builders_build_approach_check
  check (build_approach is null or build_approach in ('custom', 'prefab', 'both'));

comment on column public.builders.build_approach is 'custom, prefab or both, as the company stated it. Null means the company never stated it: omit the attribute, never print a default.';

-- Same one-time correction, after the constraint allows a null. 'both' was the
-- 0004 default and the broadest of the three; 'custom' and 'prefab' could only
-- have been chosen, so they stay.
update public.builders
   set build_approach = null
 where build_approach = 'both';

-- =============================================================================
-- save_my_builder(): the 0006 function, with turnkey and build_approach able to
-- take a null. Everything else is unchanged from 0006, including the link
-- checks, the slug rules and the fields it refuses to write.
--
-- Three states from the portal:
--   "turnkey": true   / "build_approach": "custom"   the company's answer
--   "turnkey": false                                 the company stated No
--   "turnkey": null   / "build_approach": null       never stated
-- A key left out of the patch still leaves the stored value alone.
-- =============================================================================
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
    -- Same three states: a json null clears the column back to "never stated".
    -- An unrecognised value still leaves the stored answer alone.
    build_approach  = case when p ? 'build_approach' then
                             case when p->>'build_approach' is null then null
                                  when p->>'build_approach' in ('custom', 'prefab', 'both') then p->>'build_approach'
                                  else b.build_approach end
                           else b.build_approach end,
    build_methods   = case when p ? 'build_methods'   then public.text_array_keep(public.jsonb_text_array(p->'build_methods'), c_methods)   else b.build_methods end,
    -- Three states from 0008: true, false, or null for "never stated". A json
    -- null now stores null instead of being flattened to false, so a builder
    -- who leaves the question alone is not recorded as answering No.
    turnkey         = case when p ? 'turnkey'         then (p->>'turnkey')::boolean                            else b.turnkey end,
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

-- =============================================================================
-- Notes
--   • builders_public and builders_public_profile (0007) both carry turnkey and
--     build_approach straight through, so both now carry null as well. Every
--     reader has to treat null as "omit the row", which src/lib/builders.js
--     spells out as isTurnkeyKnown() and isApproachKnown().
--   • A turnkey-only filter matches turnkey = true and nothing else. Unknown is
--     not a match, and neither is No.
--   • The admin console writes builders directly with the service role, so it
--     can set either column to null with no further change here.
--   • No money moves anywhere in this file.
-- =============================================================================

-- =============================================================================
-- One attribution writer 0007 did not bring under the tracking rule.
--
-- log_referral_account_created (0006) records account_created the moment
-- users.referred_by_builder_id goes from null to a value. Every path that sets
-- that column today already resolves the builder through the tracking rule, so
-- in practice the event only ever landed on a claimed, approved listing. It was
-- still the one writer asking nobody. A lead captured while a listing was
-- claimed, whose account is created after the account was removed, would have
-- credited an unclaimed listing. 0006 is already committed, so the rule is
-- restated here instead of edited there.
--
-- Recording nothing is the right answer rather than recording it against
-- nobody: builder_tracking_active is the single definition of when attribution
-- may point at a builder, and this now calls it like every other lookup.
-- =============================================================================
create or replace function public.log_referral_account_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_builder public.builders;
begin
  if old.referred_by_builder_id is null and new.referred_by_builder_id is not null then
    select b.* into v_builder
      from public.builders b
     where b.id = new.referred_by_builder_id;

    -- builder_tracking_active is owner plus approved. Every sibling attribution
    -- writer also requires active, because an approved listing an admin switched
    -- off is out of the directory and its link is paused. Match them.
    if v_builder.id is not null and v_builder.active and public.builder_tracking_active(v_builder) then
      insert into public.referral_events (builder_id, kind, user_id)
      values (new.referred_by_builder_id, 'account_created', new.id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
