-- =============================================================================
-- 0014 — Government partnerships: sponsored resident education (decision 2p).
--        Applied after 0013.
--
-- 0012 built government IDENTITY. This file builds the ADUAtlas EDUCATION
-- PARTNERSHIP, and it builds it as a SEPARATE AXIS, because collapsing the two
-- is the single mistake 2p exists to prevent.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- RULE 1. THREE CONCEPTS, AND THEY NEVER MERGE.
--
--   (i)   GOVERNMENT IDENTITY VERIFICATION lives on public.government_entities
--         (0012). It answers "has ADUAtlas verified this account is actually
--         controlled by the stated city, county, state or agency?" Its badge is
--         "Verified Government Account" and it means ONLY that. It is not this
--         file's to write and this file never writes it.
--
--   (ii)  ADUAtlas EDUCATION PARTNERSHIP lives on public.government_partnerships,
--         added here. It answers a DIFFERENT question: "has this verified entity
--         activated an ADUAtlas partnership?" Its label is "ADUAtlas Education
--         Partner" and it is NEVER called verified, because verification already
--         means something else.
--
--   (iii) REGULATORY SOURCE VERIFICATION is held per record and per field on
--         public.regulatory_provisions and public.government_resources (0012).
--         Nothing in this file touches it. A city with an active partnership has
--         not thereby verified one single regulation, and ADUAtlas holds sourced
--         regulations for thousands of jurisdictions that will never have an
--         account.
--
--   Two tables, two vocabularies, no shared column. The FOUR LEGITIMATE
--   COMBINATIONS are therefore all representable, and all four are reachable in
--   the database:
--
--     unclaimed and unverified            no partnership row, entity unverified
--     claimed, verification pending       no partnership row (or a pending one)
--     Verified Government Account,        entity verified, NO partnership row
--       NOT an Education Partner            or one that is pending/inactive
--     Verified AND Education Partner      entity verified, partnership active
--
-- RULE 2. A PARTNERSHIP CANNOT BE ACTIVE WITHOUT VERIFIED IDENTITY, AND THAT IS
--   A CONSTRAINT RATHER THAN A CONVENTION.
--
--   2p says this is "a DATABASE constraint, not a UI rule", so it is held three
--   ways and the weakest of the three is still not a UI rule:
--
--     a. government_partnerships mirrors the entity's verification_status in its
--        own column, under a COMPOSITE FOREIGN KEY to (id, verification_status)
--        on government_entities with ON UPDATE CASCADE. The mirror therefore
--        cannot be wrong: a value that does not match the entity's real status
--        has no row to reference.
--     b. a CHECK constraint on that mirrored column refuses status = 'active'
--        unless it reads 'verified'. A CHECK cannot be talked round by a
--        SECURITY DEFINER body, a stolen service key or an admin mistake, which
--        is the threat 2p names.
--     c. a trigger on government_entities SUSPENDS an active partnership when
--        identity verification leaves 'verified', so withdrawing verification
--        produces the intended access change rather than a constraint violation.
--
--   Identity verification NEVER activates a partnership. There is no trigger
--   here that reads "verified" and writes "active"; activation is a separate,
--   recorded, service-role act. That asymmetry is the whole point of 2p.
--
-- RULE 3. SPONSORSHIP GRANTS GOLDEN, ONCE, AND NOTHING ELSE EVER.
--
--   public.redeem_partner_access() is the only writer of a sponsored
--   entitlement. The tier it writes is a CONSTANT IN THE FUNCTION BODY. No
--   parameter, no column, no link, no code and no payload reaches it. On top of
--   that:
--     • partner_redemptions.entitlement_plan_id carries a CHECK pinning it to
--       the Golden plan id, so even a direct insert with a stolen service key
--       cannot RECORD a Platinum sponsorship, let alone grant one;
--     • the function re-reads the account after the write and ABORTS unless
--       exactly the tier moved: role, refund state and Stripe customer are
--       compared before and after;
--     • Platinum, Concierge and feasibility are never mentioned in this file
--       except to say they stay paid, and builder commercial terms are not
--       touched by one line of it.
--
--   ONCE. A partial unique index allows one granted redemption per person for
--   as long as the database exists. A second attempt is answered, not granted.
--
-- RULE 4. ENDING A PARTNERSHIP STOPS NEW ACTIVATIONS AND STRIPS NOTHING.
--
--   Suspension and deactivation are checked at REDEMPTION TIME, so they stop the
--   next resident. They cannot reach the last one: partner_redemptions has no
--   revoked_at, no delete path and no update path, for any role including
--   service_role, and nothing in this file ever writes users.paid_at back to
--   null or users.refunded_at to a value. A resident who did nothing wrong keeps
--   what they were given.
--
-- RULE 5. ANALYTICS ARE AGGREGATE, AND THE BOUNDARY IS A GRANT RATHER THAN A
--   QUERY HABIT. A partner holds NO grant on partner_redemptions,
--   partner_link_visits, partner_redemption_attempts or partner_resident_activity.
--   Not one column. Everything a partner sees comes through public.partner_analytics,
--   which is counts and nothing else: no user id, no email, no name, no date of
--   an individual's activity. A partner cannot reach a homeowner's private
--   information merely because it sponsored that homeowner, because there is
--   nothing for it to select.
--
-- RULE 6. ANON GAINS NOTHING BUT A BADGE. 0012 left anon with zero table grants
--   beyond SELECT on regulatory_topics. This file adds zero table grants to anon
--   and exactly one view: public.government_partnerships_public, which carries
--   the public "ADUAtlas Education Partner" fact and nothing more. In particular
--   a partner CODE is never resolvable by anon or authenticated, in any surface,
--   because a code is a secret that has to resist guessing.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--   • No government billing. Government accounts are free (2m) and there is not
--     one price, amount, invoice or subscription column in it.
--   • No new users.role value, no new paid_tier value, no new plan. Sponsorship
--     grants the EXISTING Golden entitlement; it does not invent a fourth tier.
--   • No authority derived from geography. Every authority read in this file is
--     an equality match against public.government_jurisdiction_grants, exactly
--     as in 0012. Nothing here reads jurisdictions.parent_id.
--   • No publishing right. A partnership is not a submission right and not a
--     publication right; the review flow in 0012 is untouched.
--   • No seeded partnership. Not one. A seeded partnership would be ADUAtlas
--     claiming a relationship no government agreed to, which is the builder
--     mistake 2a and 2c already forbid, one layer up.
-- =============================================================================


-- =============================================================================
-- PART 0 — the one constant the whole file leans on
-- =============================================================================

-- The sponsored entitlement, named once. 'roadmap' is the Golden plan id in
-- src/lib/plans.js: the ids predate the plan names and renaming them is a data
-- migration, so the id is what the database stores.
--
-- IMMUTABLE and with no arguments, so it can be used in a CHECK constraint
-- through inlining is NOT relied on: the CHECKs below spell the literal out.
-- This function exists so every FUNCTION body reads the same value, and so
-- "which tier is sponsored" is answerable by grepping one definition.
create or replace function public.sponsored_entitlement_plan_id()
returns text
language sql
immutable
as $$
  select 'roadmap'::text;
$$;

comment on function public.sponsored_entitlement_plan_id() is
  'The ONLY entitlement a government partnership may sponsor: the Golden plan id (2p). Platinum, Concierge and feasibility never become free, and there is no parameter anywhere in this file that can change what this returns.';

revoke execute on function public.sponsored_entitlement_plan_id() from public;
grant  execute on function public.sponsored_entitlement_plan_id() to anon, authenticated, service_role;


-- =============================================================================
-- PART 1 — government_partnerships: the second axis
--
-- One row per entity, at most. The ABSENCE of a row is "NO PARTNERSHIP", which
-- is the same idiom 0012 uses for not_yet_researched: the third state is the
-- absence of a published row, so nothing has to be seeded to mean "nothing".
--
-- 2p's four internal states map onto the status column plus that absence:
--
--   NO PARTNERSHIP                 no row, or a row that never left 'pending'
--   PARTNERSHIP PENDING            status = 'pending'
--   ACTIVE PARTNER                 status = 'active'
--   INACTIVE OR SUSPENDED PARTNER  status = 'inactive' or 'suspended'
--
-- 'inactive' and 'suspended' are kept apart because they are different facts: a
-- partnership that ran its course and one ADUAtlas stopped are not the same
-- sentence to a city, and only one of them has a reason attached.
-- =============================================================================

-- ── the fifth identity state, which 2p names and 0012 did not have ──────────
--
-- 2p (i) lists the internal IDENTITY states as UNCLAIMED, CLAIM PENDING, IDENTITY
-- VERIFIED, VERIFICATION REJECTED and SUSPENDED. 0012 shipped four of the five.
-- The missing one is not a synonym for the others: a verification ADUAtlas TAKES
-- BACK from an entity it once confirmed is a different sentence from one it
-- REJECTED at the claim, and a product that cannot tell them apart cannot tell a
-- homeowner which happened.
--
-- It belongs here rather than in 0012 because this file is the first thing that
-- needs it: withdrawing a verification from an ACTIVE Education Partner is one of
-- the two access changes 2p asks for, and "rejected" would have been the wrong
-- word for it. This is the ONE change 0014 makes to an identity column, it adds a
-- state rather than changing the meaning of an existing one, and it touches no
-- row: every seeded entity stays 'unverified'.
alter table public.government_entities
  drop constraint government_entities_verification_status_check;
alter table public.government_entities
  add constraint government_entities_verification_status_check
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected', 'suspended'));

comment on constraint government_entities_verification_status_check on public.government_entities is
  'The five internal identity states of 2p (i). suspended is a verification ADUAtlas withdrew from an entity it had confirmed; rejected is a claim it refused. They are different facts and the product must be able to say which one happened.';

-- The referenced key the composite foreign key below needs. (id) is already the
-- primary key, so this constraint adds no restriction whatsoever on
-- government_entities; it exists so (entity_id, entity_identity_state) has
-- something to point at, which is what makes "active implies verified" a
-- declarative fact rather than a trigger's good intentions.
alter table public.government_entities
  add constraint government_entities_id_identity_uk unique (id, verification_status);

comment on constraint government_entities_id_identity_uk on public.government_entities is
  'Adds no restriction (id is already unique). It is the referenced key for government_partnerships'' composite foreign key, which is how "a partnership cannot be active unless identity is verified" becomes unbypassable rather than merely enforced.';

create table public.government_partnerships (
  id                  uuid primary key default gen_random_uuid(),

  -- One partnership per institution. The partnership belongs to the ENTITY, not
  -- to the person who arranged it, for the same reason 0012 models the entity
  -- separately from the membership: employees leave and the institution does not.
  entity_id           uuid not null unique,

  -- The entity's IDENTITY state, MIRRORED. Never written by hand: filled from the
  -- entity on insert and kept in step by ON UPDATE CASCADE. A wrong value cannot
  -- be stored, because a (entity_id, state) pair that is not the entity's real one
  -- references nothing.
  --
  -- NAMED WITHOUT THE WORD "VERIFIED", ON PURPOSE. 2p (ii) says a partnership is
  -- never called verified, and a column called entity_verification_status sitting
  -- on the partnership table is exactly how the two vocabularies start to borrow
  -- each other's words. This column is a foreign key to the identity axis, not a
  -- second copy of the badge, and its name says so.
  entity_identity_state text not null,

  -- pending  = ADUAtlas and the entity are arranging a partnership. Unlocks NOTHING.
  -- active   = an ADUAtlas Education Partner. The ONLY state that unlocks the
  --            partnership tools: resident links, resident codes, the sponsored
  --            Golden entitlement and partnership analytics.
  -- inactive = the partnership ended. New activations stop; nothing granted is taken.
  -- suspended= ADUAtlas stopped it, with a reason. Same access change as inactive.
  status              text not null default 'pending'
                        check (status in ('pending', 'active', 'inactive', 'suspended')),

  requested_at        timestamptz not null default now(),
  requested_by_app_user_id uuid references public.users (id) on delete set null,

  -- FIRST activation, and it is never cleared. A partnership that ended still
  -- happened, and "partner since" is a public fact on the entity's page.
  activated_at        timestamptz,
  activated_by_app_user_id uuid references public.users (id) on delete set null,

  -- Set while the partnership is suspended and cleared when it is not, so a
  -- suspension always carries a date. 'inactive' deliberately has no date column
  -- of its own: a partnership that simply ended is a status change, and WHEN it
  -- changed is already recorded twice, by updated_at and by the audit row the
  -- government_audit() trigger writes. A third date to keep in step would be a
  -- third date to get wrong.
  suspended_at        timestamptz,
  suspended_by_app_user_id uuid references public.users (id) on delete set null,
  suspended_reason    text,

  ended_by_app_user_id uuid references public.users (id) on delete set null,
  ended_reason        text,

  -- Internal. Never in a _public view, exactly like government_entities.claim_note.
  admin_note          text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- ── THE CONSTRAINT 2p ASKS FOR, IN TWO HALVES ──────────────────────────────
  -- Half one: the mirror is real.
  constraint government_partnerships_entity_identity_fk
    foreign key (entity_id, entity_identity_state)
    references public.government_entities (id, verification_status)
    on update cascade on delete cascade,
  -- Half two: active requires the identity axis to read 'verified'. An admin
  -- mistake and a stolen session are refused by the same line, because neither of
  -- them can make a CHECK pass.
  constraint government_partnerships_active_requires_verified_identity
    check (status <> 'active' or entity_identity_state = 'verified'),

  -- ── the dates and the status never disagree ────────────────────────────────
  constraint government_partnerships_active_dates
    check (status <> 'active' or (activated_at is not null and suspended_at is null)),
  constraint government_partnerships_suspended_has_a_date
    check (status <> 'suspended' or suspended_at is not null),
  constraint government_partnerships_pending_is_clean
    check (status <> 'pending' or suspended_at is null)
);

-- The referenced key for links, codes and redemptions, so their denormalised
-- entity_id cannot drift from the partnership they hang off.
alter table public.government_partnerships
  add constraint government_partnerships_id_entity_uk unique (id, entity_id);

create index government_partnerships_status_idx on public.government_partnerships (status);
create index government_partnerships_active_idx on public.government_partnerships (entity_id) where status = 'active';

comment on table public.government_partnerships is
  'The ADUAtlas EDUCATION PARTNERSHIP of 2p, and a SEPARATE AXIS from the identity verification on government_entities. Its public label is "ADUAtlas Education Partner" and it is never called verified. An entity NEVER becomes a partner because its identity was verified, and a partnership NEVER activates without verified identity: the second half is the composite foreign key plus the active_requires_verified_identity check, not a rule the interface remembers.';
comment on column public.government_partnerships.status is
  'pending = arranging, unlocks NOTHING. active = an ADUAtlas Education Partner, the ONLY state that unlocks resident links, resident codes, the sponsored Golden entitlement and partnership analytics. inactive / suspended = new activations stop and nothing already granted is taken away.';
comment on column public.government_partnerships.entity_identity_state is
  'The entity''s IDENTITY state, mirrored under a composite foreign key with ON UPDATE CASCADE so it cannot be wrong. It is read by one CHECK constraint and by nothing else. It is deliberately not named after verification: 2p (ii) says a partnership is never called verified, and this column is a foreign key to the other axis rather than a second copy of the badge.';
comment on column public.government_partnerships.activated_at is
  'When the partnership FIRST became active. Never cleared, because a partnership that ended still happened and "partner since" is a public fact.';
comment on column public.government_partnerships.admin_note is
  'Internal. Never in a _public view and never granted to a government account, exactly like government_entities.claim_note.';

-- The status of a partnership in ONE place, returning 'none' for the absent row,
-- so no server-side surface invents a fifth state and "pending" never reads as
-- "active".
--
-- SERVICE ROLE ONLY, and that is a deliberate difference from 0012's
-- government_entity_state(), which anon may call. A partnership's PENDING state is
-- a negotiation between ADUAtlas and a government: entity ids are on the public
-- surface, so a function open to anon would let anybody walk the list of cities and
-- read which ones are in talks. The public surface therefore answers one narrower
-- question — is this entity an Education Partner, yes or no — and
-- government_partnerships_public expresses that as a join rather than by calling
-- this. The two say the same thing about 'active'; only this one can say 'pending'.
create or replace function public.government_partnership_status(p_entity_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           (select p.status from public.government_partnerships p where p.entity_id = p_entity_id),
           'none');
$$;

comment on function public.government_partnership_status(uuid) is
  'The partnership state of 2p in one place: none, pending, active, inactive, suspended. Independent of government_entity_state(): a verified entity is very often "none", and that is one of the four legitimate combinations rather than an incomplete record. service_role only, because PENDING is a negotiation and entity ids are public.';

revoke execute on function public.government_partnership_status(uuid) from public, anon, authenticated;
grant  execute on function public.government_partnership_status(uuid) to service_role;


-- =============================================================================
-- PART 2 — who may manage resident access
--
-- Read this next to public.government_may_submit_as() in 0012. It is the same
-- shape, with the same six conditions, and none of them is geographic:
--
--   1. the caller holds a membership of this entity, VERIFIED and not revoked
--   2. the membership role is contributor or administrator
--   3. the entity's IDENTITY is verified
--   4. the entity has an ACTIVE partnership
--   5. a LIVE GRANT exists for (entity, jurisdiction), matched by EQUALITY
--   6. and therefore: a state account reaches a city's links only if ADUAtlas
--      explicitly granted it that city's record, one row at a time
--
-- Condition 5 is why a partner cannot mint a link labelled for a jurisdiction it
-- does not speak for. Without it, a verified Phoenix account could hand out a
-- "City of Tucson" sponsorship link, which is the misrepresentation 2m spends
-- its whole authority model preventing one level up.
--
-- There is no recursive CTE here and there must never be one. There is no read
-- of jurisdictions.parent_id and no read of government_entities.jurisdiction_id.
-- =============================================================================
create or replace function public.partner_may_manage_access(p_entity_id uuid, p_jurisdiction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.government_memberships m
      join public.government_users gu on gu.id = m.government_user_id
      join public.users u             on u.id = gu.user_id
      join public.government_entities e on e.id = m.entity_id
      join public.government_partnerships p on p.entity_id = m.entity_id
      join public.government_jurisdiction_grants g on g.entity_id = m.entity_id
     where u.auth_user_id = auth.uid()
       and m.entity_id = p_entity_id
       and m.status = 'verified'
       and m.revoked_at is null
       and m.membership_role in ('contributor', 'administrator')
       and e.verification_status = 'verified'
       and p.status = 'active'
       and g.jurisdiction_id = p_jurisdiction_id     -- EQUALITY. never a parent walk
       and g.revoked_at is null
  );
$$;

comment on function public.partner_may_manage_access(uuid, uuid) is
  'True only when the caller holds a VERIFIED, unrevoked, submitting membership of a VERIFIED entity with an ACTIVE partnership, which holds a LIVE grant on THIS jurisdiction record, matched by equality. Five separate facts and no containment: a partnership does not widen scope, and a claimed-but-unverified or pending-partner member is refused.';

revoke execute on function public.partner_may_manage_access(uuid, uuid) from public, anon;
grant  execute on function public.partner_may_manage_access(uuid, uuid) to authenticated, service_role;


-- =============================================================================
-- PART 3 — two distribution methods, ONE underlying system
--
-- 2p: "A partner link (a clean per-jurisdiction URL) and a partner code entered
-- at signup must resolve to the SAME sponsored entitlement and the SAME
-- attribution, never two unrelated implementations."
--
-- So there are two token tables and exactly ONE redemption path. Both tables
-- are read by public.redeem_partner_access(), both write into
-- public.partner_redemptions, and there is no second function anywhere in this
-- file that can grant an entitlement. If a future change needs to alter what a
-- code grants, there is one body to change and the tests point at it.
--
-- TOKENS ARE GENERATED BY THE DATABASE, ALWAYS. Neither a partner nor Amy nor a
-- payload may choose one. That removes a class of abuse outright: a token cannot
-- be chosen to imitate another jurisdiction, to collide with a retired one, or
-- to be guessable because somebody picked PHOENIX1.
-- =============================================================================

-- The 32 symbols a person can read off a flyer and type back without a support
-- call: no 0/O, no 1/I. EXACTLY 32, which is what makes the draw below unbiased.
create or replace function public.partner_code_alphabet()
returns text
language sql
immutable
as $$
  select 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'::text;
$$;

revoke execute on function public.partner_code_alphabet() from public, anon, authenticated;

-- Strong random symbols, with NO EXTENSION DEPENDENCY.
--
-- gen_random_uuid() is Postgres core from 13 and draws on the platform's strong
-- random source; decode(), get_byte() and substr() are core too. pgcrypto's
-- gen_random_bytes() would be the obvious call, but on Supabase pgcrypto lives in
-- the `extensions` schema and every function in this file pins
-- `set search_path = public` for safety, so a pgcrypto call would resolve on a
-- test cluster and fail in production. That is the kind of difference decision 2j
-- exists to stop, so it is avoided rather than worked around.
--
-- 32 is a power of two, so `% 32` consumes exactly the low five bits of a byte.
-- A version 4 UUID fixes four bits in byte 6 and two in byte 8, and both sit in
-- the HIGH nibble, so the low five bits of every one of the sixteen bytes are
-- random and the draw loses nothing.
create or replace function public.partner_random_symbols(p_alphabet text, p_len integer)
returns text
language plpgsql
volatile
as $$
declare
  v_size int := length(p_alphabet);
  v_bytes bytea;
  v_out text := '';
  i int;
begin
  if v_size <> 32 then
    raise exception 'partner_random_symbols expects a 32 symbol alphabet so the draw is unbiased; got %', v_size;
  end if;
  if p_len < 1 or p_len > 16 then
    raise exception 'partner_random_symbols draws 1 to 16 symbols from one UUID; asked for %', p_len;
  end if;
  v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  for i in 0..(p_len - 1) loop
    v_out := v_out || substr(p_alphabet, 1 + (get_byte(v_bytes, i) % v_size), 1);
  end loop;
  return v_out;
end;
$$;

revoke execute on function public.partner_random_symbols(text, integer) from public, anon, authenticated;

-- An 8 character code out of that alphabet is one of 32^8, a little over 1.1e12.
-- That number is the FIRST brute force control and the cheapest one: it is why
-- the rate limiting in PART 7 has an easy job rather than an impossible one.
create or replace function public.partner_code_new()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet text := public.partner_code_alphabet();
  v_code text;
begin
  for attempt in 1..50 loop
    v_code := public.partner_random_symbols(v_alphabet, 8);
    if not exists (select 1 from public.partner_access_codes where code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'could not generate an unused partner access code';
end;
$$;

revoke execute on function public.partner_code_new() from public, anon, authenticated;

-- A clean per-jurisdiction URL token: the jurisdiction's own slug, its state
-- code, and six random symbols. Clean enough to print on a city web page
-- ("phoenix-az-4m2k7q") and still unguessable, which matters because a link is
-- public by design and a retired one must not be re-derivable.
--
-- It reads jurisdictions.slug and jurisdictions.state_code. It does NOT read
-- jurisdictions.parent_id, and it is not an authority function: the caller's
-- authority was already decided by partner_may_manage_access().
create or replace function public.partner_link_token_new(p_jurisdiction_id uuid)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet text := lower(public.partner_code_alphabet());
  v_slug text;
  v_state text;
  v_stem text;
  v_token text;
begin
  select j.slug, lower(coalesce(j.state_code, '')) into v_slug, v_state
    from public.jurisdictions j where j.id = p_jurisdiction_id;
  if v_slug is null then
    raise exception 'no such jurisdiction' using errcode = '23503';
  end if;
  v_stem := v_slug || case when v_state = '' then '' else '-' || v_state end;

  for attempt in 1..50 loop
    v_token := v_stem || '-' || public.partner_random_symbols(v_alphabet, 6);
    if not exists (select 1 from public.partner_access_links where token = v_token) then
      return v_token;
    end if;
  end loop;
  raise exception 'could not generate an unused partner access link token';
end;
$$;

revoke execute on function public.partner_link_token_new(uuid) from public, anon, authenticated;

-- ── partner_access_links ────────────────────────────────────────────────────
create table public.partner_access_links (
  id                  uuid primary key default gen_random_uuid(),
  partnership_id      uuid not null,
  -- Denormalised so a policy can read it without joining, and pinned to the
  -- partnership by the composite foreign key below so it cannot drift.
  entity_id           uuid not null,
  -- The jurisdiction this link is FOR. The partner must hold a live grant on it
  -- (partner_may_manage_access), so a link can never be labelled for a
  -- jurisdiction the entity does not speak for.
  jurisdiction_id     uuid not null references public.jurisdictions (id) on delete restrict,

  -- Generated by the database, never supplied. Lowercase, hyphenated, clean.
  token               text not null unique
                        check (token ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(token) between 8 and 100),

  -- The partner's own name for it ("2026 mailer", "planning counter handout").
  label               text,

  is_active           boolean not null default true,
  -- Null = no expiry. An expired link grants NOTHING, and it is not the same
  -- fact as a deactivated one, so both are stored.
  expires_at          timestamptz,
  -- Null = uncapped. A cap is counted against sponsored activations, which is
  -- what a partner is actually rationing.
  max_redemptions     integer check (max_redemptions is null or max_redemptions > 0),

  created_at          timestamptz not null default now(),
  created_by_app_user_id uuid references public.users (id) on delete set null,
  deactivated_at      timestamptz,
  deactivated_by_app_user_id uuid references public.users (id) on delete set null,
  updated_at          timestamptz not null default now(),

  constraint partner_access_links_partnership_fk
    foreign key (partnership_id, entity_id)
    references public.government_partnerships (id, entity_id) on delete cascade,
  constraint partner_access_links_active_dates
    check ((deactivated_at is null) = is_active)
);

create index partner_access_links_partnership_idx on public.partner_access_links (partnership_id);
create index partner_access_links_entity_idx on public.partner_access_links (entity_id);
create index partner_access_links_active_idx on public.partner_access_links (partnership_id) where is_active;

comment on table public.partner_access_links is
  'Resident access LINKS (2p): a clean per-jurisdiction URL that resolves to the SAME sponsored entitlement and the SAME attribution as a code. The token is generated by the database and can never be chosen, so it cannot imitate another jurisdiction or be picked guessable. A link is deactivated, never deleted, because a deleted link would orphan the attribution it earned.';
comment on column public.partner_access_links.token is
  'Generated by partner_link_token_new(). Public by design: it is printed on a government web page. Unguessable anyway, so a retired link cannot be re-derived from the jurisdiction name.';
comment on column public.partner_access_links.jurisdiction_id is
  'The jurisdiction the link is for. The entity must hold a LIVE GRANT on this exact record (partner_may_manage_access), matched by equality, so sponsorship cannot claim a jurisdiction the entity does not speak for.';

-- ── partner_access_codes ────────────────────────────────────────────────────
create table public.partner_access_codes (
  id                  uuid primary key default gen_random_uuid(),
  partnership_id      uuid not null,
  entity_id           uuid not null,
  jurisdiction_id     uuid not null references public.jurisdictions (id) on delete restrict,

  -- Generated by the database. 8 symbols of a 32 symbol alphabet.
  --
  -- STORED IN THE CLEAR, DELIBERATELY, and the reason is written down here so
  -- nobody "fixes" it later: the partner has to be able to READ the code back
  -- to print it, exactly as builders.claim_code is readable to the person who
  -- issues an invitation. A hash would make the portal unable to show a city its
  -- own code. The secrecy budget is therefore spent on entropy (1.1e12),
  -- on it never being readable by anon or by another entity, and on the rate
  -- limiting in PART 6 rather than on a digest.
  code                text not null unique
                        check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),

  label               text,
  is_active           boolean not null default true,
  expires_at          timestamptz,
  max_redemptions     integer check (max_redemptions is null or max_redemptions > 0),

  created_at          timestamptz not null default now(),
  created_by_app_user_id uuid references public.users (id) on delete set null,
  deactivated_at      timestamptz,
  deactivated_by_app_user_id uuid references public.users (id) on delete set null,
  updated_at          timestamptz not null default now(),

  constraint partner_access_codes_partnership_fk
    foreign key (partnership_id, entity_id)
    references public.government_partnerships (id, entity_id) on delete cascade,
  constraint partner_access_codes_active_dates
    check ((deactivated_at is null) = is_active)
);

create index partner_access_codes_partnership_idx on public.partner_access_codes (partnership_id);
create index partner_access_codes_entity_idx on public.partner_access_codes (entity_id);
create index partner_access_codes_active_idx on public.partner_access_codes (partnership_id) where is_active;

comment on table public.partner_access_codes is
  'Resident access CODES (2p), the second distribution method for the SAME entitlement and the SAME attribution as a link. Never resolvable by anon or authenticated in any surface: a code is a secret, and public.redeem_partner_access() is service_role only so a code cannot be tested through PostgREST.';
comment on column public.partner_access_codes.code is
  'Plaintext on purpose: the partner must be able to print it. The protections are entropy (32^8), the grant boundary (only this entity''s verified members and ADUAtlas can read it), and the per-account rate limiting in redeem_partner_access(). Never logged: partner_redemption_attempts stores a digest of what was presented, never the value.';


-- =============================================================================
-- PART 4 — the ledgers: attribution, visits, attempts, course activity
--
-- All four are APPEND ONLY for every role including service_role, enforced by a
-- trigger rather than by a grant, for the reason 0012 gives about
-- regulatory_audit_log: a stolen service key can change what happens next, and
-- it must not be able to make what already happened disappear.
--
-- partner_redemptions is where "granted ONCE" and "never stripped" both live, so
-- it is the one that matters most. It has no revoked_at. That absence is the
-- design: there is no column to write, so there is no code path to audit.
-- =============================================================================

create table public.partner_redemptions (
  id                  uuid primary key default gen_random_uuid(),
  partnership_id      uuid not null,
  entity_id           uuid not null,
  -- Denormalised at attribution time. Analytics are per partnership and per
  -- jurisdiction, and the jurisdiction a resident entered through is a fact
  -- about that entry rather than about the link's later configuration.
  jurisdiction_id     uuid not null references public.jurisdictions (id) on delete restrict,

  kind                text not null check (kind in ('link', 'code')),
  -- Restrict, not set null: a link or code that earned an attribution cannot be
  -- deleted out from under it. Deactivation is the operation; deletion is not.
  link_id             uuid references public.partner_access_links (id) on delete restrict,
  code_id             uuid references public.partner_access_codes (id) on delete restrict,

  app_user_id         uuid not null references public.users (id) on delete restrict,

  -- Did this entry actually grant the sponsored entitlement? A resident who
  -- already holds a paid plan is recorded as a REDEMPTION and not as an
  -- ACTIVATION, which is exactly why 2p lists "code redemptions" and "sponsored
  -- activations" as two separate numbers.
  entitlement_granted boolean not null,
  -- Pinned to Golden by CHECK. A stolen service key cannot even RECORD a
  -- Platinum sponsorship here, let alone grant one.
  entitlement_plan_id text
                        check (entitlement_plan_id is null or entitlement_plan_id = 'roadmap'),

  outcome             text not null check (outcome in
                        ('granted',            -- the sponsored Golden entitlement was granted
                         'already_sponsored',  -- this person already holds a sponsored grant; granted ONCE
                         'already_entitled',   -- this person already holds a live paid plan; nothing touched
                         'needs_review')),     -- a refunded account: ADUAtlas decides, nothing is overwritten

  granted_at          timestamptz not null default now(),

  constraint partner_redemptions_partnership_fk
    foreign key (partnership_id, entity_id)
    references public.government_partnerships (id, entity_id) on delete restrict,
  constraint partner_redemptions_kind_matches_token
    check ((kind = 'link') = (link_id is not null)
       and (kind = 'code') = (code_id is not null)),
  constraint partner_redemptions_plan_matches_grant
    check (entitlement_granted = (entitlement_plan_id is not null)),
  constraint partner_redemptions_outcome_matches_grant
    check (entitlement_granted = (outcome = 'granted'))
);

-- GRANTED ONCE, for as long as the database exists. Not once per partnership,
-- not once per link: once per person. A second entry is answered rather than
-- granted, and a second partnership cannot re-grant what the first one gave.
create unique index partner_redemptions_one_grant_per_person_uidx
  on public.partner_redemptions (app_user_id)
  where entitlement_granted;

create index partner_redemptions_partnership_idx on public.partner_redemptions (partnership_id, granted_at desc);
create index partner_redemptions_user_idx on public.partner_redemptions (app_user_id);
create index partner_redemptions_link_idx on public.partner_redemptions (link_id) where link_id is not null;
create index partner_redemptions_code_idx on public.partner_redemptions (code_id) where code_id is not null;

comment on table public.partner_redemptions is
  'The ONE attribution record, written by the ONE redemption path, for both links and codes (2p). Append only, with NO revoked_at and no delete path for any role: suspending or ending a partnership stops the NEXT resident and cannot reach the last one. entitlement_plan_id is pinned to the Golden plan id by CHECK, so Platinum, Concierge and feasibility cannot be recorded here even by a stolen service key.';
comment on column public.partner_redemptions.entitlement_granted is
  'True only where the sponsored Golden entitlement was actually granted. A resident who already holds a live paid plan is a redemption and NOT an activation, because a sponsorship must never reduce what somebody paid for.';

-- ── link visits: the first number in 2p's analytics list ────────────────────
create table public.partner_link_visits (
  id                  bigint generated always as identity primary key,
  link_id             uuid not null references public.partner_access_links (id) on delete restrict,
  -- The same opaque browser id src/lib/referral.js already generates. Never a
  -- user id: a visit is counted before anybody signs in, and a partner sees the
  -- COUNT and never the visitor.
  session_id          text not null,
  occurred_at         timestamptz not null default now(),
  occurred_on         date generated always as ((occurred_at at time zone 'utc')::date) stored
);

-- One visit a day per (link, browser), exactly as 0006 counts a builder's link.
create unique index partner_link_visits_daily_uidx
  on public.partner_link_visits (link_id, session_id, occurred_on);
create index partner_link_visits_link_idx on public.partner_link_visits (link_id, occurred_at);

comment on table public.partner_link_visits is
  'Link visits for the aggregate partner analytics of 2p. One row per (link, browser, day), the same honesty rule 0006 applies to a builder referral link. No user id, ever: a visit happens before anybody signs in and a partner sees only the count.';

-- ── redemption attempts: the brute force control, and the evidence ──────────
create table public.partner_redemption_attempts (
  id                  bigint generated always as identity primary key,
  occurred_at         timestamptz not null default now(),
  kind                text,
  -- A DIGEST of what was presented, never the value, so the log is not a plain
  -- list of near-miss codes for whoever reads it next, and is still a stable key
  -- for spotting one token being hammered.
  --
  -- WHAT IT IS AND IS NOT, said plainly rather than implied by the word "hash":
  -- the code space is 32^8, so a digest is reversible by anybody willing to spend
  -- the compute. This column keeps secrets out of a log that gets read casually.
  -- It is NOT a defence against somebody holding the service key, who can read
  -- partner_access_codes.code directly and has no reason to bother with this.
  token_digest        text,
  app_user_id         uuid references public.users (id) on delete set null,
  -- An opaque per-client value the entry endpoint supplies (an address digest, a
  -- browser id). Null when the caller did not supply one, in which case the
  -- per-account limit is the whole control.
  client_fingerprint  text,
  partnership_id      uuid references public.government_partnerships (id) on delete set null,
  outcome             text not null check (outcome in
                        ('granted', 'already_sponsored', 'already_entitled', 'needs_review',
                         'unknown_token', 'inactive_token', 'expired_token', 'exhausted_token',
                         'partnership_inactive', 'identity_unverified', 'invalid_request',
                         'rate_limited'))
);

create index partner_redemption_attempts_user_idx on public.partner_redemption_attempts (app_user_id, occurred_at desc);
create index partner_redemption_attempts_client_idx on public.partner_redemption_attempts (client_fingerprint, occurred_at desc) where client_fingerprint is not null;
create index partner_redemption_attempts_digest_idx on public.partner_redemption_attempts (token_digest, occurred_at desc);
create index partner_redemption_attempts_time_idx on public.partner_redemption_attempts (occurred_at desc);

comment on table public.partner_redemption_attempts is
  'Every redemption attempt and its outcome, which is BOTH the rate limiting input and the evidence a security review needs. token_digest is a SHA-256 of what was presented and never the value, so the log is not a dictionary of near misses. A government partner holds no grant on it: this is ADUAtlas''s record, like regulatory_audit_log.';

-- ── course activity: the last two numbers in 2p's analytics list ────────────
--
-- 2p asks the partner portal to show course starts and course completions. The
-- course itself records progress in users.completed_chapters, and the chapter
-- list lives in the front end registry rather than in the database, so the
-- database CANNOT derive "completed the course" without inventing a definition
-- of done. Inventing one and printing it as a partner's number is exactly what
-- 2b forbids one layer up.
--
-- So the seam is here and the recording is explicit: whatever the course surface
-- decides counts as a start and a completion calls
-- public.record_sponsored_course_progress() once per resident per kind. Until it
-- does, partner_analytics.course_progress_instrumented reads false and the two
-- counts are honestly zero-because-unmeasured rather than zero-because-nobody.
create table public.partner_resident_activity (
  id                  bigint generated always as identity primary key,
  redemption_id       uuid not null references public.partner_redemptions (id) on delete restrict,
  kind                text not null check (kind in ('course_started', 'course_completed')),
  occurred_at         timestamptz not null default now()
);

create unique index partner_resident_activity_once_uidx
  on public.partner_resident_activity (redemption_id, kind);
create index partner_resident_activity_kind_idx on public.partner_resident_activity (kind);

comment on table public.partner_resident_activity is
  'Course starts and completions for a SPONSORED resident, counted for the aggregate analytics of 2p and reachable by a partner only as a count. Keyed on the redemption rather than the person, and no grant to any API role: a partner never learns which resident did what merely because it paid for the access.';


-- =============================================================================
-- PART 5 — the guards
-- =============================================================================

-- ── append only, for everybody ──────────────────────────────────────────────
create or replace function public.partner_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'public.% is append only: an attribution that was earned, an entitlement that was granted and an attempt that was made are never edited or deleted, by any role', tg_table_name
    using errcode = '42501';
end;
$$;

comment on function public.partner_ledger_append_only() is
  'Refuses UPDATE and DELETE on the four partner ledgers for every role including service_role and the table owner through the API. partner_redemptions in particular has no revoked_at and now no way to acquire one: "ending a partnership must not strip access already granted" is a property of the schema rather than a rule the code remembers.';

create trigger partner_redemptions_append_only
  before update or delete on public.partner_redemptions
  for each row execute function public.partner_ledger_append_only();
create trigger partner_link_visits_append_only
  before update or delete on public.partner_link_visits
  for each row execute function public.partner_ledger_append_only();
create trigger partner_redemption_attempts_append_only
  before update or delete on public.partner_redemption_attempts
  for each row execute function public.partner_ledger_append_only();
create trigger partner_resident_activity_append_only
  before update or delete on public.partner_resident_activity
  for each row execute function public.partner_ledger_append_only();

-- ── the partnership itself is ADUAtlas's to move ─────────────────────────────
create or replace function public.government_partnerships_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entity_state text;
begin
  -- The referential cascade from government_entities: the identity state moved, so
  -- the mirrored column moves with it. Allowed, and it cannot produce an active
  -- partnership on an unverified entity because the CHECK constraint refuses that
  -- in the same statement.
  if tg_op = 'UPDATE'
     and new.entity_identity_state is distinct from old.entity_identity_state
     and (to_jsonb(new) - 'entity_identity_state' - 'updated_at')
       = (to_jsonb(old) - 'entity_identity_state' - 'updated_at') then
    return new;
  end if;

  if not public.regulatory_writer_is_aduatlas() then
    raise exception 'an ADUAtlas Education Partnership is arranged and activated by ADUAtlas. A government account cannot create, activate or reactivate its own partnership (2p)'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- The mirror is filled from the entity, never from the payload. The composite
    -- foreign key then checks it, so the two cannot disagree.
    select e.verification_status into v_entity_state
      from public.government_entities e where e.id = new.entity_id;
    if v_entity_state is null then
      raise exception 'no such government entity' using errcode = '23503';
    end if;
    new.entity_identity_state := v_entity_state;
    return new;
  end if;

  -- The partnership never moves to a different institution. A partnership
  -- belongs to the entity that agreed to it.
  if new.entity_id <> old.entity_id then
    raise exception 'a partnership is not re-pointed at another government entity; end this one and arrange the new one explicitly'
      using errcode = '23514';
  end if;
  -- activated_at is history and history is not rewritten.
  if old.activated_at is not null and new.activated_at is distinct from old.activated_at then
    raise exception 'activated_at records when this partnership first became active and is never changed'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger government_partnerships_guard
  before insert or update on public.government_partnerships
  for each row execute function public.government_partnerships_guard();

create trigger government_partnerships_set_updated_at
  before update on public.government_partnerships
  for each row execute function public.set_updated_at();

create trigger government_partnerships_audit
  after insert or update or delete on public.government_partnerships
  for each row execute function public.government_audit();

-- ── withdrawing identity verification suspends the partnership ───────────────
--
-- This is the third of the three holds described in RULE 2, and it is the one
-- that makes the other two usable: without it, revoking a verification on an
-- active partner would fail on the CHECK constraint and Amy could not do her job.
-- With it, revoking verification produces the INTENDED ACCESS CHANGE. New
-- activations stop on the next statement. Nothing already granted is touched,
-- because nothing in this file can touch it.
--
-- Note the asymmetry, which is decision 2p in one trigger: verification LEAVING
-- 'verified' suspends a partnership, and verification ARRIVING at 'verified'
-- does nothing at all. Identity verification never activates a partnership.
create or replace function public.government_entities_partnership_cascade()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.verification_status = 'verified' or old.verification_status <> 'verified' then
    return new;
  end if;
  update public.government_partnerships
     set status = 'suspended',
         suspended_at = coalesce(suspended_at, now()),
         suspended_reason = coalesce(suspended_reason,
           'identity verification was withdrawn: an ADUAtlas Education Partnership cannot be active on an entity whose identity is not verified')
   where entity_id = new.id
     and status = 'active';
  return new;
end;
$$;

comment on function public.government_entities_partnership_cascade() is
  'When identity verification LEAVES verified, an active partnership is suspended, so new sponsored activations stop immediately and nothing already granted is stripped. Deliberately one-directional: verification ARRIVING never activates a partnership (2p).';

create trigger government_entities_partnership_cascade
  before update on public.government_entities
  for each row execute function public.government_entities_partnership_cascade();

-- ── links and codes: active partnership, explicit grant, generated token ─────
-- SECURITY DEFINER, for one reason and it is not convenience: this trigger fires
-- on an INSERT made by a government member through PostgREST, so its body runs as
-- `authenticated` unless it is a definer. As `authenticated` it could not read
-- government_jurisdiction_grants truthfully (RLS would filter it) and could not
-- call the token generators at all (they are revoked from the API roles). A guard
-- that sees a filtered version of the authority table is not a guard. As a definer
-- it reads the truth and generates the token, and it grants nothing back: every
-- decision below is a refusal or a server-side overwrite.
create or replace function public.partner_access_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partnership record;
begin
  select p.id, p.entity_id, p.status, e.verification_status
    into v_partnership
    from public.government_partnerships p
    join public.government_entities e on e.id = p.entity_id
   where p.id = new.partnership_id;
  if v_partnership.id is null then
    raise exception 'no such partnership' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    new.entity_id := v_partnership.entity_id;

    -- ONLY an active partnership unlocks the partnership tools (2p). A pending,
    -- inactive or suspended partner cannot mint resident access of either kind, and
    -- this holds for ADUAtlas too: the only way a non-active partnership comes to
    -- have a live token is that it was issued while the partnership was active and
    -- the partnership was stopped afterwards, which is also the real shape of the
    -- attack the redemption path has to refuse.
    if v_partnership.status <> 'active' then
      raise exception 'resident access is issued only by an ACTIVE ADUAtlas Education Partner; this partnership is %', v_partnership.status
        using errcode = '42501';
    end if;
    -- Stated separately from the partnership check even though the CHECK
    -- constraint already implies it, so the property is proved rather than
    -- inferred from another property.
    if v_partnership.verification_status <> 'verified' then
      raise exception 'resident access requires a Verified Government Account; the identity state is %', v_partnership.verification_status
        using errcode = '42501';
    end if;
    -- Authority, by EQUALITY, against the one source of it. A partner cannot
    -- issue access for a jurisdiction ADUAtlas did not explicitly grant it.
    if not exists (
      select 1 from public.government_jurisdiction_grants g
       where g.entity_id = v_partnership.entity_id
         and g.jurisdiction_id = new.jurisdiction_id
         and g.revoked_at is null) then
      raise exception 'this partner holds no live grant on that jurisdiction record; sponsorship is scoped to the jurisdictions ADUAtlas explicitly granted (2m)'
        using errcode = '42501';
    end if;

    -- The token is ALWAYS the database's. Whatever arrived is discarded, for every
    -- writer including ADUAtlas, so there is no path at all by which a token is
    -- chosen: not a partner picking a guessable one, not an admin console
    -- accidentally reusing a retired one, not a payload.
    if tg_table_name = 'partner_access_links' then
      new.token := public.partner_link_token_new(new.jurisdiction_id);
    else
      new.code := public.partner_code_new();
    end if;
    -- is_active and deactivated_at are ONE fact. The date is the source of truth
    -- on insert, so a row created with a deactivation date is created disabled
    -- rather than failing a constraint.
    new.is_active := (new.deactivated_at is null);
    return new;
  end if;

  -- UPDATE. Nothing structural moves, and the token is immutable: a token that
  -- was handed out cannot be re-pointed at another jurisdiction or partner.
  if new.partnership_id <> old.partnership_id
     or new.entity_id <> old.entity_id
     or new.jurisdiction_id <> old.jurisdiction_id then
    raise exception 'a resident access link or code is not re-pointed; deactivate it and issue a new one'
      using errcode = '23514';
  end if;
  if tg_table_name = 'partner_access_links' then
    if new.token <> old.token then
      raise exception 'a resident access token is immutable once issued' using errcode = '23514';
    end if;
  elsif new.code <> old.code then
    raise exception 'a resident access code is immutable once issued' using errcode = '23514';
  end if;

  -- is_active and deactivated_at are ONE fact, however it was written. Whichever
  -- half the caller moved, the other follows, so a half-written deactivation is a
  -- disabled link rather than a constraint violation.
  if new.is_active is distinct from old.is_active then
    new.deactivated_at := case when new.is_active then null
                               else coalesce(new.deactivated_at, now()) end;
  elsif new.deactivated_at is distinct from old.deactivated_at then
    new.is_active := (new.deactivated_at is null);
  end if;
  return new;
end;
$$;

comment on function public.partner_access_guard() is
  'The single guard both distribution methods pass through (2p: two methods, ONE system). On insert: the partnership must be ACTIVE, the identity VERIFIED, and the entity must hold a LIVE GRANT on the named jurisdiction by equality; the token is then generated by the database and whatever the caller supplied is discarded. On update: nothing structural moves and the token is immutable.';

create trigger partner_access_links_guard
  before insert or update on public.partner_access_links
  for each row execute function public.partner_access_guard();
create trigger partner_access_codes_guard
  before insert or update on public.partner_access_codes
  for each row execute function public.partner_access_guard();

create trigger partner_access_links_set_updated_at
  before update on public.partner_access_links
  for each row execute function public.set_updated_at();
create trigger partner_access_codes_set_updated_at
  before update on public.partner_access_codes
  for each row execute function public.set_updated_at();


-- =============================================================================
-- PART 6 — Row-Level Security
--
-- Supabase's ALTER DEFAULT PRIVILEGES hands anon and authenticated ALL on every
-- new table in schema public, so every table above is wide open until the
-- revokes below run. Each one is revoked first and granted back by name.
--
-- The shape:
--   anon           nothing. Not one table grant, not one view except the public
--                  Education Partner badge in PART 8.
--   authenticated  the partnership row, and the links and codes, for an entity
--                  they hold a VERIFIED membership of. The four ledgers: nothing.
--   service_role   everything except rewriting a ledger.
-- =============================================================================
alter table public.government_partnerships       enable row level security;
alter table public.partner_access_links          enable row level security;
alter table public.partner_access_codes          enable row level security;
alter table public.partner_redemptions           enable row level security;
alter table public.partner_link_visits           enable row level security;
alter table public.partner_redemption_attempts   enable row level security;
alter table public.partner_resident_activity     enable row level security;

revoke all on public.government_partnerships     from anon, authenticated;
revoke all on public.partner_access_links        from anon, authenticated;
revoke all on public.partner_access_codes        from anon, authenticated;

-- The four ledgers take nothing from anybody but the service role, and the
-- append-only triggers mean even the service role cannot rewrite them.
revoke all on public.partner_redemptions         from anon, authenticated;
revoke all on public.partner_link_visits         from anon, authenticated;
revoke all on public.partner_redemption_attempts from anon, authenticated;
revoke all on public.partner_resident_activity   from anon, authenticated;

-- ── government_partnerships: read only, and only your own institution ───────
-- Named columns: the internal admin note and the reasons ADUAtlas recorded are
-- not in the grant, for the same reason government_entities.verification_note is
-- not in 0012's.
grant select (id, entity_id, status, requested_at, activated_at,
              suspended_at, created_at, updated_at)
  on public.government_partnerships to authenticated;

-- A VERIFIED membership, not merely a claim. A pending member reaches nothing
-- but their own claim, exactly as in 0012.
create policy government_partnerships_select_member on public.government_partnerships
  for select to authenticated
  using (public.is_verified_government_member_of(entity_id));

-- ── links and codes ─────────────────────────────────────────────────────────
-- The partner reads its own tokens (it has to print them), inserts new ones
-- while the partnership is active, and may turn one off. It may not delete one,
-- because a deleted link orphans the attribution it earned.
grant select (id, partnership_id, entity_id, jurisdiction_id, token, label,
              is_active, expires_at, max_redemptions, created_at, deactivated_at, updated_at)
  on public.partner_access_links to authenticated;
grant insert (partnership_id, jurisdiction_id, label, expires_at, max_redemptions)
  on public.partner_access_links to authenticated;
grant update (label, is_active) on public.partner_access_links to authenticated;

grant select (id, partnership_id, entity_id, jurisdiction_id, code, label,
              is_active, expires_at, max_redemptions, created_at, deactivated_at, updated_at)
  on public.partner_access_codes to authenticated;
grant insert (partnership_id, jurisdiction_id, label, expires_at, max_redemptions)
  on public.partner_access_codes to authenticated;
grant update (label, is_active) on public.partner_access_codes to authenticated;

create policy partner_access_links_select_member on public.partner_access_links
  for select to authenticated
  using (public.is_verified_government_member_of(entity_id));
create policy partner_access_links_insert_partner on public.partner_access_links
  for insert to authenticated
  with check (public.partner_may_manage_access(entity_id, jurisdiction_id));
create policy partner_access_links_update_partner on public.partner_access_links
  for update to authenticated
  using (public.partner_may_manage_access(entity_id, jurisdiction_id))
  with check (public.partner_may_manage_access(entity_id, jurisdiction_id));

create policy partner_access_codes_select_member on public.partner_access_codes
  for select to authenticated
  using (public.is_verified_government_member_of(entity_id));
create policy partner_access_codes_insert_partner on public.partner_access_codes
  for insert to authenticated
  with check (public.partner_may_manage_access(entity_id, jurisdiction_id));
create policy partner_access_codes_update_partner on public.partner_access_codes
  for update to authenticated
  using (public.partner_may_manage_access(entity_id, jurisdiction_id))
  with check (public.partner_may_manage_access(entity_id, jurisdiction_id));


-- =============================================================================
-- PART 7 — the redemption path: one function, both methods
--
-- THE DELIBERATE ABUSE CONTROLS, each one named so a review can check it rather
-- than take it on trust:
--
--  1. CODE GUESSING. 8 symbols of a 32 symbol alphabet is 1.1e12 codes, and the
--     alphabet excludes 0/O/1/I so a code is typable without being short.
--     Nothing anywhere resolves a code except this function.
--  2. ORACLES. Every refusal returns the SAME shape and the SAME sentence.
--     Unknown, malformed, deactivated, expired, exhausted, suspended partner and
--     unverified identity are indistinguishable from outside, so the endpoint
--     cannot be used to discover which codes exist or what state a partner is in.
--     Only the rate-limit refusal is flagged, with a boolean that says nothing
--     about the token.
--  3. BRUTE FORCE. Failed attempts are counted per ACCOUNT and per client
--     fingerprint over a rolling 15 minute and 24 hour window. Redemption
--     requires an ADUAtlas account, so an attacker needs an account per bucket
--     rather than a loop. Rate-limited attempts are recorded but are NOT counted
--     as failures, so the lockout expires instead of extending itself forever.
--  4. DUPLICATE REDEMPTION. A partial unique index allows one granted redemption
--     per person for the life of the database. The second attempt is ANSWERED
--     ("you already have this") and is not an error the resident has to solve.
--  5. DISABLED PARTNERSHIPS. Partnership status and identity verification are
--     both re-checked at redemption time, so suspension stops the next resident
--     on the next statement without touching the last one.
--  6. EXHAUSTION. max_redemptions is counted under a row lock on the link or
--     code, so two simultaneous redemptions of the last slot cannot both win.
--  7. TIER TAMPERING. The tier is a constant in this body. After the write the
--     account is re-read and the transaction ABORTS unless exactly the tier
--     moved.
--  8. THE SURFACE. This function is service_role only. The anon and
--     authenticated keys cannot call it through PostgREST at all, so the entry
--     endpoint is the single door and it is the endpoint's job to establish who
--     the caller is.
-- =============================================================================

-- The attempt writer. SECURITY DEFINER so it can append to a table no API role
-- may write, and revoked from every API role so it cannot be called directly to
-- forge an outcome. Same pattern as public.regulatory_audit() in 0012.
create or replace function public.partner_attempt(
  p_kind text, p_token text, p_app_user_id uuid, p_client_fingerprint text,
  p_partnership_id uuid, p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.partner_redemption_attempts
    (kind, token_digest, app_user_id, client_fingerprint, partnership_id, outcome)
  values (
    nullif(p_kind, ''),
    -- md5() is Postgres core. pgcrypto's digest() is not, and on Supabase it
    -- lives in a schema this function deliberately does not put on its
    -- search_path. See partner_random_symbols() for the same reasoning.
    case when coalesce(p_token, '') = '' then null
         else md5(p_token) end,
    p_app_user_id, nullif(p_client_fingerprint, ''), p_partnership_id, p_outcome);
end;
$$;

revoke execute on function public.partner_attempt(text, text, uuid, text, uuid, text)
  from public, anon, authenticated, service_role;

-- ── the one entitlement grant ───────────────────────────────────────────────
create or replace function public.redeem_partner_access(
  p_kind text,
  p_token text,
  p_app_user_id uuid,
  p_client_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- THE ONLY ENTITLEMENT THIS FUNCTION MAY GRANT. A constant, in the body, that
  -- no parameter, column, link, code or payload can reach.
  c_plan            constant text := 'roadmap';
  c_fail_window     constant interval := interval '15 minutes';
  c_fail_max        constant integer  := 5;
  c_day_max         constant integer  := 20;
  -- Every refusal, whatever the reason. One shape, one sentence, no oracle.
  c_refused         constant jsonb := jsonb_build_object(
    'ok', false, 'granted', false, 'error', 'not-redeemable',
    'message', 'This access link or code is not available. Ask the city or agency that gave it to you for a current one.');

  v_kind   text := lower(btrim(coalesce(p_kind, '')));
  v_token  text := btrim(coalesce(p_token, ''));
  v_fp     text := nullif(btrim(coalesce(p_client_fingerprint, '')), '');
  v_user   public.users%rowtype;
  v_after  public.users%rowtype;
  v_link   public.partner_access_links%rowtype;
  v_code   public.partner_access_codes%rowtype;
  v_part   public.government_partnerships%rowtype;
  v_entity public.government_entities%rowtype;
  v_jur    public.jurisdictions%rowtype;
  v_link_id uuid;
  v_code_id uuid;
  v_jurisdiction_id uuid;
  v_expires timestamptz;
  v_active  boolean;
  v_max     integer;
  v_used    integer;
  v_fails   integer;
  v_existing public.partner_redemptions%rowtype;
  v_outcome text;
  v_redemption uuid;
  v_ok      jsonb;
begin
  -- 1. the request itself
  if v_kind not in ('link', 'code') or v_token = '' then
    perform public.partner_attempt(v_kind, v_token, p_app_user_id, v_fp, null, 'invalid_request');
    return c_refused;
  end if;
  select * into v_user from public.users where id = p_app_user_id;
  if v_user.id is null then
    perform public.partner_attempt(v_kind, v_token, null, v_fp, null, 'invalid_request');
    return c_refused;
  end if;

  -- 2. brute force. Counted per account, and per client where the endpoint
  --    supplied one. 'rate_limited' is deliberately NOT in the counted set, so a
  --    lockout expires with the window instead of renewing itself on every retry.
  select count(*) into v_fails
    from public.partner_redemption_attempts a
   where a.app_user_id = v_user.id
     and a.outcome in ('unknown_token', 'inactive_token', 'expired_token', 'exhausted_token',
                       'partnership_inactive', 'identity_unverified', 'invalid_request')
     and a.occurred_at > now() - c_fail_window;
  if v_fails >= c_fail_max then
    perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, null, 'rate_limited');
    return c_refused || jsonb_build_object('throttled', true);
  end if;
  select count(*) into v_fails
    from public.partner_redemption_attempts a
   where a.app_user_id = v_user.id
     and a.outcome in ('unknown_token', 'inactive_token', 'expired_token', 'exhausted_token',
                       'partnership_inactive', 'identity_unverified', 'invalid_request')
     and a.occurred_at > now() - interval '24 hours';
  if v_fails >= c_day_max then
    perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, null, 'rate_limited');
    return c_refused || jsonb_build_object('throttled', true);
  end if;
  if v_fp is not null then
    select count(*) into v_fails
      from public.partner_redemption_attempts a
     where a.client_fingerprint = v_fp
       and a.outcome in ('unknown_token', 'inactive_token', 'expired_token', 'exhausted_token',
                         'partnership_inactive', 'identity_unverified', 'invalid_request')
       and a.occurred_at > now() - c_fail_window;
    if v_fails >= c_fail_max then
      perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, null, 'rate_limited');
      return c_refused || jsonb_build_object('throttled', true);
    end if;
  end if;

  -- 3. resolve the token. A malformed token and an unknown one record the SAME
  --    outcome, so the log cannot be read as "these were nearly right either".
  if v_kind = 'link' then
    v_token := lower(v_token);
    if v_token !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_token) not between 8 and 100 then
      perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, null, 'unknown_token');
      return c_refused;
    end if;
    select * into v_link from public.partner_access_links
     where token = v_token for update;
    if v_link.id is null then
      perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, null, 'unknown_token');
      return c_refused;
    end if;
    v_link_id := v_link.id;
    v_jurisdiction_id := v_link.jurisdiction_id;
    v_expires := v_link.expires_at;
    v_active  := v_link.is_active;
    v_max     := v_link.max_redemptions;
    select * into v_part from public.government_partnerships where id = v_link.partnership_id;
  else
    v_token := upper(v_token);
    if v_token !~ '^[A-HJ-NP-Z2-9]{8}$' then
      perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, null, 'unknown_token');
      return c_refused;
    end if;
    select * into v_code from public.partner_access_codes
     where code = v_token for update;
    if v_code.id is null then
      perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, null, 'unknown_token');
      return c_refused;
    end if;
    v_code_id := v_code.id;
    v_jurisdiction_id := v_code.jurisdiction_id;
    v_expires := v_code.expires_at;
    v_active  := v_code.is_active;
    v_max     := v_code.max_redemptions;
    select * into v_part from public.government_partnerships where id = v_code.partnership_id;
  end if;

  -- 4. the token's own state
  if not v_active then
    perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, v_part.id, 'inactive_token');
    return c_refused;
  end if;
  if v_expires is not null and v_expires <= now() then
    perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, v_part.id, 'expired_token');
    return c_refused;
  end if;

  -- 5. the partnership, and the identity behind it. Checked as TWO separate
  --    facts even though the CHECK constraint makes the second implied by the
  --    first: the point of 2p is that they are separate, and a test can only
  --    prove that if the code asks both questions.
  if v_part.id is null or v_part.status <> 'active' then
    perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, v_part.id, 'partnership_inactive');
    return c_refused;
  end if;
  select * into v_entity from public.government_entities where id = v_part.entity_id;
  if v_entity.id is null or v_entity.verification_status <> 'verified' then
    perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, v_part.id, 'identity_unverified');
    return c_refused;
  end if;
  select * into v_jur from public.jurisdictions where id = v_jurisdiction_id;

  -- 6. exhaustion, counted under the row lock taken in step 3 so two
  --    simultaneous redemptions of the last slot cannot both win.
  if v_max is not null then
    select count(*) into v_used
      from public.partner_redemptions r
     where r.entitlement_granted
       and ((v_link_id is not null and r.link_id = v_link_id)
         or (v_code_id is not null and r.code_id = v_code_id));
    if v_used >= v_max then
      perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, v_part.id, 'exhausted_token');
      return c_refused;
    end if;
  end if;

  v_ok := jsonb_build_object(
    'ok', true,
    'plan', c_plan,
    'kind', v_kind,
    'partnership_id', v_part.id,
    'entity_id', v_entity.id,
    'entity_name', v_entity.name,
    'entity_type', v_entity.entity_type,
    'jurisdiction_id', v_jur.id,
    'jurisdiction_name', v_jur.name,
    'jurisdiction_slug', v_jur.slug,
    'state_code', v_jur.state_code);

  -- 7. GRANTED ONCE. A second entry is answered, never granted again, and never
  --    recorded as a second activation.
  select * into v_existing from public.partner_redemptions
   where app_user_id = v_user.id and entitlement_granted;
  if v_existing.id is not null then
    perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, v_part.id, 'already_sponsored');
    return v_ok || jsonb_build_object(
      'granted', false, 'already', true, 'outcome', 'already_sponsored',
      'message', 'You already have sponsored Golden access on this account. There is nothing more to redeem.');
  end if;

  -- 8. a resident who already paid. A sponsorship must never REDUCE what
  --    somebody bought, so the tier is not touched. The entry is still recorded,
  --    which is why 2p counts redemptions and activations separately.
  if v_user.paid_at is not null and v_user.refunded_at is null then
    v_outcome := 'already_entitled';
  elsif v_user.refunded_at is not null then
    -- A refunded account cannot be re-entitled without erasing the refund, and
    -- erasing a refund is not this function's decision to make. Recorded for
    -- ADUAtlas to look at; nothing is overwritten either way.
    v_outcome := 'needs_review';
  else
    v_outcome := 'granted';
  end if;

  if v_outcome <> 'granted' then
    insert into public.partner_redemptions
      (partnership_id, entity_id, jurisdiction_id, kind, link_id, code_id,
       app_user_id, entitlement_granted, entitlement_plan_id, outcome)
    values (v_part.id, v_part.entity_id, v_jurisdiction_id, v_kind, v_link_id, v_code_id,
            v_user.id, false, null, v_outcome);
    perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, v_part.id, v_outcome);
    return v_ok || jsonb_build_object(
      'granted', false, 'already', v_outcome = 'already_entitled', 'outcome', v_outcome,
      'message', case v_outcome
        when 'already_entitled' then 'This account already holds a paid ADUAtlas plan, so nothing was changed. Sponsored access would not add anything to what you already have.'
        else 'This account needs a look from ADUAtlas before sponsored access can be applied. Nothing on your account was changed.' end);
  end if;

  -- 9. THE GRANT. Exactly the Golden tier, from the constant above, and the
  --    WHERE clause re-asserts the precondition so a concurrent purchase cannot
  --    be overwritten by this statement.
  update public.users
     set paid_tier = c_plan,
         paid_at   = now()
   where id = v_user.id
     and paid_at is null
     and refunded_at is null;
  if not found then
    -- Somebody bought a plan between step 8 and here. Record the entry and
    -- leave the purchase alone.
    insert into public.partner_redemptions
      (partnership_id, entity_id, jurisdiction_id, kind, link_id, code_id,
       app_user_id, entitlement_granted, entitlement_plan_id, outcome)
    values (v_part.id, v_part.entity_id, v_jurisdiction_id, v_kind, v_link_id, v_code_id,
            v_user.id, false, null, 'already_entitled');
    perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, v_part.id, 'already_entitled');
    return v_ok || jsonb_build_object(
      'granted', false, 'already', true, 'outcome', 'already_entitled',
      'message', 'This account already holds a paid ADUAtlas plan, so nothing was changed.');
  end if;

  -- 10. EXACTLY the tier moved, and nothing else. Anything else aborts the whole
  --     transaction, including the attribution: a sponsorship that quietly
  --     widened somebody else's access is worse than a failed redemption.
  select * into v_after from public.users where id = v_user.id;
  if v_after.paid_tier <> c_plan
     or v_after.refunded_at is not null
     or v_after.role is distinct from v_user.role
     or v_after.stripe_customer_id is distinct from v_user.stripe_customer_id
     or v_after.email is distinct from v_user.email then
    raise exception 'a sponsored entitlement is exactly the Golden plan and nothing else: refusing a grant that changed tier %, role %, refund state or billing identity',
      v_after.paid_tier, v_after.role using errcode = '42501';
  end if;

  insert into public.partner_redemptions
    (partnership_id, entity_id, jurisdiction_id, kind, link_id, code_id,
     app_user_id, entitlement_granted, entitlement_plan_id, outcome)
  values (v_part.id, v_part.entity_id, v_jurisdiction_id, v_kind, v_link_id, v_code_id,
          v_user.id, true, c_plan, 'granted')
  returning id into v_redemption;

  perform public.partner_attempt(v_kind, v_token, v_user.id, v_fp, v_part.id, 'granted');

  return v_ok || jsonb_build_object(
    'granted', true, 'already', false, 'outcome', 'granted',
    'redemption_id', v_redemption,
    'message', 'Your sponsored ADUAtlas Golden access is active on this account.');
exception
  -- Two simultaneous first redemptions by the same person collapse into the
  -- answer the "granted once" check would have given.
  when unique_violation then
    perform public.partner_attempt(v_kind, v_token, p_app_user_id, v_fp, null, 'already_sponsored');
    return jsonb_build_object(
      'ok', true, 'granted', false, 'already', true, 'outcome', 'already_sponsored',
      'plan', c_plan,
      'message', 'You already have sponsored Golden access on this account.');
end;
$$;

comment on function public.redeem_partner_access(text, text, uuid, text) is
  'The ONE redemption path for BOTH distribution methods (2p): a link token and a code resolve to the same sponsored entitlement and the same attribution. The tier is a constant in the body, pinned again by a CHECK on partner_redemptions and verified again by re-reading the account afterwards, so no URL, request, payload or stored value can yield Platinum, Concierge, builder, government or admin. Granted ONCE per person. Every refusal returns one identical shape, so it is not an oracle. service_role only: the browser cannot call it.';

revoke execute on function public.redeem_partner_access(text, text, uuid, text) from public, anon, authenticated;
grant  execute on function public.redeem_partner_access(text, text, uuid, text) to service_role;

-- ── the resident entry page's context, and the visit counter ────────────────
--
-- A LINK is public by design, so resolving one to "City of Phoenix, Phoenix,
-- Arizona" is not a leak. A CODE is a secret, so this function resolves LINKS
-- ONLY, by name as well as by behaviour. It is still service_role only, so the
-- resident entry endpoint is the single door and anon gains nothing.
create or replace function public.partner_access_link_context(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_row record;
begin
  if v_token !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return null;
  end if;
  select l.id, l.jurisdiction_id, l.expires_at, l.is_active,
         p.id as partnership_id, p.status as partnership_status,
         e.id as entity_id, e.name as entity_name, e.entity_type,
         e.verification_status, e.official_website_url,
         j.name as jurisdiction_name, j.slug as jurisdiction_slug,
         j.state_code, j.jurisdiction_type
    into v_row
    from public.partner_access_links l
    join public.government_partnerships p on p.id = l.partnership_id
    join public.government_entities e on e.id = p.entity_id
    join public.jurisdictions j on j.id = l.jurisdiction_id
   where l.token = v_token;
  if v_row.id is null then
    return null;
  end if;
  -- An inactive, expired, suspended or unverified combination returns the same
  -- null a wrong token returns. The entry page has nothing to contextualise and
  -- the caller learns nothing about why.
  if not v_row.is_active
     or (v_row.expires_at is not null and v_row.expires_at <= now())
     or v_row.partnership_status <> 'active'
     or v_row.verification_status <> 'verified' then
    return null;
  end if;
  return jsonb_build_object(
    'kind', 'link',
    'entity_id', v_row.entity_id,
    'entity_name', v_row.entity_name,
    'entity_type', v_row.entity_type,
    'entity_website_url', v_row.official_website_url,
    'jurisdiction_id', v_row.jurisdiction_id,
    'jurisdiction_name', v_row.jurisdiction_name,
    'jurisdiction_slug', v_row.jurisdiction_slug,
    'jurisdiction_type', v_row.jurisdiction_type,
    'state_code', v_row.state_code,
    'plan', public.sponsored_entitlement_plan_id());
end;
$$;

comment on function public.partner_access_link_context(text) is
  'What a resident entry page may show for a LINK: the partner, the jurisdiction and the sponsored plan id. Links only, never codes, because a code is a secret and this would be a test oracle for one. Returns null for anything not currently redeemable, so it says nothing about why. service_role only.';

revoke execute on function public.partner_access_link_context(text) from public, anon, authenticated;
grant  execute on function public.partner_access_link_context(text) to service_role;

create or replace function public.record_partner_link_visit(p_token text, p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_sid   text := btrim(coalesce(p_session_id, ''));
  v_link  uuid;
begin
  if v_token !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or v_sid !~ '^[A-Za-z0-9_-]{8,64}$' then
    return false;
  end if;
  -- Only a link on an ACTIVE partnership with a VERIFIED identity is counted, in
  -- the same spirit as 0006: a listing nobody has claimed has a code in the
  -- database and no link anywhere, and it must not accumulate analytics.
  select l.id into v_link
    from public.partner_access_links l
    join public.government_partnerships p on p.id = l.partnership_id
    join public.government_entities e on e.id = p.entity_id
   where l.token = v_token
     and l.is_active
     and (l.expires_at is null or l.expires_at > now())
     and p.status = 'active'
     and e.verification_status = 'verified';
  if v_link is null then
    return false;
  end if;
  insert into public.partner_link_visits (link_id, session_id)
  values (v_link, v_sid)
  on conflict do nothing;
  return true;
end;
$$;

comment on function public.record_partner_link_visit(text, text) is
  'One visit a day per (link, browser), for the aggregate analytics of 2p. No user id and no address is stored. Counted only for a live link on an active partnership, so a suspended partner stops accruing numbers as well as activations.';

revoke execute on function public.record_partner_link_visit(text, text) from public, anon, authenticated;
grant  execute on function public.record_partner_link_visit(text, text) to service_role;

-- ── course starts and completions, for a sponsored resident ─────────────────
create or replace function public.record_sponsored_course_progress(p_app_user_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_redemption uuid;
begin
  if v_kind not in ('course_started', 'course_completed') then
    return false;
  end if;
  select r.id into v_redemption
    from public.partner_redemptions r
   where r.app_user_id = p_app_user_id
     and r.entitlement_granted
   limit 1;
  if v_redemption is null then
    return false;   -- not a sponsored resident: nothing to attribute, nothing recorded
  end if;
  insert into public.partner_resident_activity (redemption_id, kind)
  values (v_redemption, v_kind)
  on conflict do nothing;
  return true;
end;
$$;

comment on function public.record_sponsored_course_progress(uuid, text) is
  'Records that a SPONSORED resident started or completed the course, once each, for the aggregate analytics of 2p. Idempotent. Records nothing for a resident who was not sponsored, so this cannot become a general course-tracking table by the back door. service_role only.';

revoke execute on function public.record_sponsored_course_progress(uuid, text) from public, anon, authenticated;
grant  execute on function public.record_sponsored_course_progress(uuid, text) to service_role;

-- ── what a resident may know about their own sponsorship ────────────────────
-- Their own attribution, and nothing about anybody else's. This is the resident
-- side of the entry flow ("your access was sponsored by the City of Phoenix"),
-- and it is the ONLY read of partner_redemptions granted to a signed-in person.
create or replace function public.my_sponsored_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'sponsored', true,
           'plan', r.entitlement_plan_id,
           'granted_at', r.granted_at,
           'entity_id', e.id,
           'entity_name', e.name,
           'entity_type', e.entity_type,
           'jurisdiction_name', j.name,
           'state_code', j.state_code,
           'partnership_status', p.status)
    from public.partner_redemptions r
    join public.users u on u.id = r.app_user_id
    join public.government_partnerships p on p.id = r.partnership_id
    join public.government_entities e on e.id = r.entity_id
    join public.jurisdictions j on j.id = r.jurisdiction_id
   where u.auth_user_id = auth.uid()
     and r.entitlement_granted
   limit 1;
$$;

comment on function public.my_sponsored_access() is
  'The caller''s OWN sponsorship: who sponsored it, when, and which plan. Null for everybody else, including a resident who paid. It deliberately returns the partnership''s CURRENT status too, so a portal can say a partnership has ended without implying the resident lost anything.';

revoke execute on function public.my_sponsored_access() from public, anon;
grant  execute on function public.my_sponsored_access() to authenticated, service_role;


-- =============================================================================
-- PART 8 — the two views
--
--   government_partnerships_public  the public "ADUAtlas Education Partner"
--                                   fact, and nothing else. anon may read it.
--   partner_analytics               counts, for the partner's own institution
--                                   and for ADUAtlas. No identities at all.
-- =============================================================================

-- ONE ROW PER ENTITY, keyed on the entity id so it lines up column for column
-- with government_entities_public, and carrying a BOOLEAN rather than a status.
--
-- The shape matters. An "active partnerships only" view would answer "is this city
-- an Education Partner?" with a missing row, and a missing row is not an answer: a
-- page cannot tell it apart from a city it failed to look up, and the safest
-- rendering of a failed lookup is not always the honest one. A row that says false
-- is the honest one, and it makes the third of 2p's four combinations — Verified
-- Government Account but NOT an Education Partner — something the public surface
-- states rather than something it omits.
--
-- is_education_partner is true for an ACTIVE partnership and false for every other
-- state, including pending, because a negotiation is not a partnership and a
-- suspended one is not either. partner_since is present only where the badge is.
create view public.government_partnerships_public as
  select e.id,                       -- the ENTITY id: the same key as government_entities_public
         e.id as entity_id,
         e.name as entity_name,
         e.entity_type,
         e.jurisdiction_id,
         j.path as jurisdiction_path,
         -- Named for what it is. There is no column here called "verified", and
         -- there never will be: verification is the other axis.
         --
         -- Expressed as the join rather than by calling
         -- government_partnership_status(), because that function can say 'pending'
         -- and a function anon may call is a function anon may call about every
         -- city. The join condition below IS that function's 'active' branch.
         (p.id is not null) as is_education_partner,
         p.activated_at as partner_since
    from public.government_entities e
    join public.jurisdictions j on j.id = e.jurisdiction_id
    left join public.government_partnerships p
           on p.entity_id = e.id and p.status = 'active';

comment on view public.government_partnerships_public is
  'The public half of 2p''s second axis, one row per entity: is_education_partner is true only for an ACTIVE partnership and false for every other state, so "Verified Government Account but NOT an Education Partner" is stated rather than omitted. It is never called verified, it never implies the government endorses ADUAtlas or any builder, and it says nothing about whether any regulation is verified. Identity comes from government_entities_public and the two are rendered as two separate facts.';

-- Aggregate, and only aggregate. Every column below is a count, a status or a
-- date about the PARTNERSHIP. There is no user id, no email, no name and no
-- individual timestamp, because 2p says a partner never sees an individual
-- homeowner's private information merely because it sponsored the access.
create view public.partner_analytics as
  select p.id  as partnership_id,
         p.entity_id,
         e.name as entity_name,
         e.entity_type,
         p.status as partnership_status,
         p.activated_at,
         (select count(*) from public.partner_access_links l
           where l.partnership_id = p.id and l.is_active)                  as active_links,
         (select count(*) from public.partner_access_codes c
           where c.partnership_id = p.id and c.is_active)                  as active_codes,
         (select count(*) from public.partner_link_visits v
            join public.partner_access_links l on l.id = v.link_id
           where l.partnership_id = p.id)                                 as link_visits,
         (select count(*) from public.partner_redemptions r
           where r.partnership_id = p.id and r.kind = 'code')              as code_redemptions,
         (select count(*) from public.partner_redemptions r
           where r.partnership_id = p.id and r.kind = 'link')              as link_redemptions,
         (select count(*) from public.partner_redemptions r
           where r.partnership_id = p.id and r.entitlement_granted)        as sponsored_activations,
         (select count(*) from public.partner_resident_activity a
            join public.partner_redemptions r on r.id = a.redemption_id
           where r.partnership_id = p.id and a.kind = 'course_started')    as course_starts,
         (select count(*) from public.partner_resident_activity a
            join public.partner_redemptions r on r.id = a.redemption_id
           where r.partnership_id = p.id and a.kind = 'course_completed')  as course_completions,
         -- Has ADUAtlas ever recorded a course event AT ALL? A zero next to
         -- false means "not measured yet"; a zero next to true means "no
         -- resident started". Printing the first as the second would be a
         -- fabricated number, which is 2b applied to a partner's dashboard.
         exists (select 1 from public.partner_resident_activity)           as course_progress_instrumented
    from public.government_partnerships p
    join public.government_entities e on e.id = p.entity_id
   where public.regulatory_writer_is_aduatlas()
      or public.is_verified_government_member_of(p.entity_id);

comment on view public.partner_analytics is
  'The partner portal''s analytics (2p), aggregate by construction: every column is a count or a status and there is no user id, email, name or individual timestamp anywhere in it. Scoped to the caller''s own institution through a VERIFIED membership, so one partner cannot read another''s numbers, and open to ADUAtlas through the service role. course_progress_instrumented exists so an unmeasured zero is never printed as "nobody started".';

revoke all on public.government_partnerships_public from anon, authenticated;
revoke all on public.partner_analytics              from anon, authenticated;

grant select on public.government_partnerships_public to anon, authenticated;
-- Not anon. An anonymous visitor sees the badge, never the numbers.
grant select on public.partner_analytics to authenticated;


-- =============================================================================
-- PART 9 — the admin surface: service_role only
--
-- Amy's scope grows only as far as 2p allows: review claims (0012), verify or
-- reject (0012), associate a jurisdiction (0012), SUSPEND AND REACTIVATE A
-- PARTNER, CONTROL WHETHER SPONSORED RESIDENT ACCESS IS ACTIVE, and SEE LINK AND
-- CODE STATUS. It does not grow one function further into general site
-- administration.
--
-- Every one of these takes p_actor_app_user_id, for the reason 0012 gives: "the
-- service key did it" is not an answer to who did it.
-- =============================================================================

create or replace function public.admin_set_partnership_status(
  p_entity_id uuid, p_status text, p_actor_app_user_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_before public.government_partnerships%rowtype;
  v_entity public.government_entities%rowtype;
  v_id uuid;
begin
  if v_status not in ('pending', 'active', 'inactive', 'suspended') then
    raise exception 'a partnership is pending, active, inactive or suspended (2p); % is not one of them', v_status
      using errcode = '22023';
  end if;
  select * into v_entity from public.government_entities where id = p_entity_id;
  if v_entity.id is null then raise exception 'no such government entity'; end if;

  select * into v_before from public.government_partnerships where entity_id = p_entity_id;

  -- The one sentence of 2p that must never erode, said here as well as in the
  -- CHECK constraint so the error a human sees explains itself.
  if v_status = 'active' and v_entity.verification_status <> 'verified' then
    raise exception 'an ADUAtlas Education Partnership cannot activate without a Verified Government Account. Verify the entity''s identity first; verification never activates a partnership by itself (2p)'
      using errcode = '23514';
  end if;

  if v_before.id is null then
    insert into public.government_partnerships
      (entity_id, status, requested_by_app_user_id, admin_note,
       activated_at, activated_by_app_user_id,
       suspended_at, suspended_by_app_user_id, suspended_reason,
       ended_by_app_user_id, ended_reason)
    values (p_entity_id, v_status, p_actor_app_user_id, p_note,
            case when v_status = 'active' then now() end,
            case when v_status = 'active' then p_actor_app_user_id end,
            case when v_status = 'suspended' then now() end,
            case when v_status = 'suspended' then p_actor_app_user_id end,
            case when v_status = 'suspended' then p_note end,
            case when v_status = 'inactive' then p_actor_app_user_id end,
            case when v_status = 'inactive' then p_note end)
    returning id into v_id;
  else
    if v_before.status = 'active' and v_status = 'pending' then
      raise exception 'an active partnership does not go back to pending; end it or suspend it'
        using errcode = '23514';
    end if;
    update public.government_partnerships
       set status = v_status,
           activated_at = case when v_status = 'active' then coalesce(activated_at, now()) else activated_at end,
           activated_by_app_user_id = case when v_status = 'active' and activated_at is null
                                           then p_actor_app_user_id else activated_by_app_user_id end,
           suspended_at = case when v_status = 'suspended' then coalesce(suspended_at, now()) end,
           suspended_by_app_user_id = case when v_status = 'suspended'
                                           then coalesce(suspended_by_app_user_id, p_actor_app_user_id) end,
           suspended_reason = case when v_status = 'suspended' then coalesce(p_note, suspended_reason) end,
           ended_by_app_user_id = case when v_status = 'inactive'
                                       then coalesce(p_actor_app_user_id, ended_by_app_user_id) end,
           ended_reason = case when v_status = 'inactive' then coalesce(p_note, ended_reason) end,
           admin_note = coalesce(p_note, admin_note)
     where id = v_before.id
    returning id into v_id;
  end if;

  perform public.regulatory_audit(
    'partnership.' || v_status, 'government_partnerships', v_id, null, p_entity_id,
    array['status'], to_jsonb(v_before), jsonb_build_object('status', v_status),
    p_note, p_actor_app_user_id);

  return jsonb_build_object(
    'ok', true,
    'partnership_id', v_id,
    'entity_id', p_entity_id,
    'partnership_status', v_status,
    -- Said plainly in the return value so no console can render one as the other.
    'identity_state', public.government_entity_state(p_entity_id),
    'note', 'Identity verification and the Education Partnership are separate facts. This call changed the partnership only.');
end;
$$;

comment on function public.admin_set_partnership_status(uuid, text, uuid, text) is
  'Amy''s partnership control (2p): arrange, activate, suspend, reactivate, end. It refuses to activate without a Verified Government Account and it never touches identity verification, because the two are separate axes. Ending or suspending stops NEW activations and strips nothing that was granted.';

create or replace function public.admin_issue_partner_link(
  p_entity_id uuid, p_jurisdiction_id uuid, p_actor_app_user_id uuid,
  p_label text default null, p_expires_at timestamptz default null,
  p_max_redemptions integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_p uuid; v_id uuid; v_token text;
begin
  select id into v_p from public.government_partnerships where entity_id = p_entity_id;
  if v_p is null then raise exception 'this entity has no ADUAtlas Education Partnership'; end if;
  insert into public.partner_access_links
    (partnership_id, entity_id, jurisdiction_id, token, label, expires_at,
     max_redemptions, created_by_app_user_id)
  values (v_p, p_entity_id, p_jurisdiction_id, 'placeholder', p_label, p_expires_at,
          p_max_redemptions, p_actor_app_user_id)
  returning id, token into v_id, v_token;
  perform public.regulatory_audit('partner_link.issued', 'partner_access_links', v_id,
    p_jurisdiction_id, p_entity_id, array['token'], null,
    jsonb_build_object('label', p_label), p_label, p_actor_app_user_id);
  return jsonb_build_object('ok', true, 'link_id', v_id, 'token', v_token);
end;
$$;

create or replace function public.admin_issue_partner_code(
  p_entity_id uuid, p_jurisdiction_id uuid, p_actor_app_user_id uuid,
  p_label text default null, p_expires_at timestamptz default null,
  p_max_redemptions integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_p uuid; v_id uuid; v_code text;
begin
  select id into v_p from public.government_partnerships where entity_id = p_entity_id;
  if v_p is null then raise exception 'this entity has no ADUAtlas Education Partnership'; end if;
  insert into public.partner_access_codes
    (partnership_id, entity_id, jurisdiction_id, code, label, expires_at,
     max_redemptions, created_by_app_user_id)
  values (v_p, p_entity_id, p_jurisdiction_id, 'AAAAAAAA', p_label, p_expires_at,
          p_max_redemptions, p_actor_app_user_id)
  returning id, code into v_id, v_code;
  perform public.regulatory_audit('partner_code.issued', 'partner_access_codes', v_id,
    p_jurisdiction_id, p_entity_id, array['code'], null,
    jsonb_build_object('label', p_label), p_label, p_actor_app_user_id);
  -- The code is returned to Amy because she has to hand it over. It is never
  -- written into the audit log, which is read far more widely than it is issued.
  return jsonb_build_object('ok', true, 'code_id', v_id, 'code', v_code);
end;
$$;

comment on function public.admin_issue_partner_link(uuid, uuid, uuid, text, timestamptz, integer) is
  'Issues a resident access LINK for an active partner and a jurisdiction it holds a live grant on. The token is generated by the database: the placeholder passed here is discarded by partner_access_guard(), so not even Amy can choose one.';
comment on function public.admin_issue_partner_code(uuid, uuid, uuid, text, timestamptz, integer) is
  'Issues a resident access CODE on the same terms as a link, into the same one entitlement and attribution system. The code is generated by the database and returned once to whoever issued it; it is never written into the audit log.';

create or replace function public.admin_set_partner_link_active(
  p_link_id uuid, p_active boolean, p_actor_app_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare l public.partner_access_links%rowtype;
begin
  select * into l from public.partner_access_links where id = p_link_id;
  if l.id is null then raise exception 'no such partner access link'; end if;
  update public.partner_access_links
     set is_active = p_active,
         deactivated_by_app_user_id = case when p_active then null else p_actor_app_user_id end
   where id = p_link_id;
  perform public.regulatory_audit(
    case when p_active then 'partner_link.reactivated' else 'partner_link.deactivated' end,
    'partner_access_links', p_link_id, l.jurisdiction_id, l.entity_id,
    array['is_active'], to_jsonb(l), jsonb_build_object('is_active', p_active),
    p_reason, p_actor_app_user_id);
  return jsonb_build_object('ok', true, 'link_id', p_link_id, 'is_active', p_active,
    'note', 'Deactivating stops NEW sponsored activations through this link. It does not affect any resident who already entered.');
end;
$$;

create or replace function public.admin_set_partner_code_active(
  p_code_id uuid, p_active boolean, p_actor_app_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare c public.partner_access_codes%rowtype;
begin
  select * into c from public.partner_access_codes where id = p_code_id;
  if c.id is null then raise exception 'no such partner access code'; end if;
  update public.partner_access_codes
     set is_active = p_active,
         deactivated_by_app_user_id = case when p_active then null else p_actor_app_user_id end
   where id = p_code_id;
  perform public.regulatory_audit(
    case when p_active then 'partner_code.reactivated' else 'partner_code.deactivated' end,
    'partner_access_codes', p_code_id, c.jurisdiction_id, c.entity_id,
    array['is_active'], to_jsonb(c), jsonb_build_object('is_active', p_active),
    p_reason, p_actor_app_user_id);
  return jsonb_build_object('ok', true, 'code_id', p_code_id, 'is_active', p_active,
    'note', 'Deactivating stops NEW sponsored activations through this code. It does not affect any resident who already entered.');
end;
$$;

revoke execute on function public.admin_set_partnership_status(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_issue_partner_link(uuid, uuid, uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.admin_issue_partner_code(uuid, uuid, uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.admin_set_partner_link_active(uuid, boolean, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_set_partner_code_active(uuid, boolean, uuid, text) from public, anon, authenticated;

grant execute on function public.admin_set_partnership_status(uuid, text, uuid, text) to service_role;
grant execute on function public.admin_issue_partner_link(uuid, uuid, uuid, text, timestamptz, integer) to service_role;
grant execute on function public.admin_issue_partner_code(uuid, uuid, uuid, text, timestamptz, integer) to service_role;
grant execute on function public.admin_set_partner_link_active(uuid, boolean, uuid, text) to service_role;
grant execute on function public.admin_set_partner_code_active(uuid, boolean, uuid, text) to service_role;


-- =============================================================================
-- PART 10 — the commercial rule, written into the schema's own comments so it
--           cannot quietly erode
--
-- The sponsored benefit is the Golden educational entitlement and NOTHING else:
--
--   • Platinum does not become free. Nothing in this file writes 'report'.
--   • Concierge does not become free. Nothing in this file writes 'concierge'.
--   • Feasibility studies and site plans do not become free. This file does not
--     touch public.studies, the 0011 fulfilment lifecycle, or any property work.
--   • Builder marketplace commercial terms are untouched. This file does not
--     reference public.builders, referral_events, or the $49 and $500 terms.
--   • A sponsored homeowner keeps the normal paid upgrade path. Their account
--     reads paid_tier = 'roadmap' through the same column a purchase writes, so
--     api/create-checkout.js offers Platinum and Concierge at the published
--     price with the ordinary upgrade credit, and nothing in this file special
--     cases them.
--
-- ONE THING THE SPECIFICATION DOES NOT DECIDE, recorded rather than invented:
-- whether the $79 upgrade CREDIT that create-checkout.js computes from paid_tier
-- should apply to a homeowner whose Golden access was sponsored rather than
-- bought. The schema keeps the fact available either way, because
-- partner_redemptions says exactly which accounts were sponsored and when. No
-- rule has been implemented in either direction.
-- =============================================================================
