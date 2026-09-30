-- =============================================================================
-- 0015 — Claim authority (2o), and the anonymous directory read (2a)
--
-- Two findings from the decision 2k security gate. Both are a decision that was
-- already locked and that the database did not enforce, so nothing in this file
-- is a product choice: 2o and 2a decided both, and this closes the distance
-- between the words and the schema.
--
-- Both were reproduced on a fresh database built from 0001 through 0014, as the
-- API roles, through the same statements PostgREST would issue.
--
-- -----------------------------------------------------------------------------
-- PART 1 — DECISION 2o. claim_government_entity() (0012, PART 11) validated
-- three things: that the caller was signed in, that full_name was non-empty, and
-- that the work email contained an "@". official_domains was recorded on the
-- entity by ADUAtlas and NEVER COMPARED TO ANYTHING.
--
-- What that allowed, reproduced: a free homeowner, a Golden homeowner, a
-- Platinum homeowner and a builder account each claimed a government entity with
-- attacker@gmail.com; one ordinary account claimed every remaining unclaimed
-- entity in a loop; anon then read entity_state = 'claimed' off
-- government_entities_public, so the public surface reported a claim that no
-- government had made.
--
-- 2o: "A person must NOT be able to self-register and claim a city, county,
-- state, planning department, building department or any other government
-- identity merely by holding an email address or knowing the jurisdiction's
-- name. [...] The official government domains recorded on the entity in 2m exist
-- partly to support this." 2p's definition of done, item 5: it must be PROVED
-- that a homeowner, builder or unrelated user cannot claim a government entity.
--
-- So the function now requires the work email's domain to be one of the entity's
-- own official_domains, and REFUSES OUTRIGHT when official_domains is empty. An
-- entity nobody can prove authority over is not claimable by self-service: Amy
-- records the official domains through the admin console (api/admin/_regulatory.js
-- already normalises and stores them, and already computes the same match as
-- evidence when she reviews a claim), or she links the representative herself
-- through the admin path. Both remain open; only the self-service escalation is
-- shut.
--
-- WHAT A MATCHING DOMAIN STILL IS NOT. Evidence. It is the bar 2o asks for on the
-- way IN; it verifies nobody, it grants authority over no jurisdiction record,
-- and it produces no partnership. Claiming never produces verification (2m), and
-- this file does not touch verification_status, the grants table or the
-- partnership tables.
--
-- ONE REFUSAL, FOR EVERY FAILURE. A claim that is refused for any reason gets the
-- same sentence and the same SQLSTATE, so the function cannot be used as an
-- oracle: "which domains does this entity accept" is not answerable by trying.
-- That deliberately folds in the cases 0012 reported separately, including "that
-- government entity does not exist" — which leaks nothing anyway, since
-- government_entities_public publishes every entity's existence on purpose, and
-- which could not have been raised as written: errcode 'no_dat' is neither a
-- SQLSTATE nor a condition name, so that branch would have failed on the RAISE.
--
-- The entity's NAME, its state, and the claimant's own membership continue to
-- reach a pending claimant through my_government_context(), which is SECURITY
-- DEFINER and is untouched here, so the government portal is unaffected.
--
-- -----------------------------------------------------------------------------
-- PART 2 — THE SAME FINDING, ONE TABLE ACROSS. is_government_member_of()
-- accepted status in ('pending', 'verified'), and it is the whole predicate of
-- the government_entities_select_member policy. A claim therefore handed the
-- claimer SELECT on the entity's private row on the spot — including
-- official_domains and source_url, the two columns that are the evidence Amy
-- judges the claim with.
--
-- PENDING MEANS UNPROVEN. 2m: "CLAIMED, where a representative has claimed the
-- entity but their authority is not yet verified." A state that exists precisely
-- to mean "not yet established" must not carry a read that assumes it was. The
-- predicate now requires a live VERIFIED membership.
--
-- -----------------------------------------------------------------------------
-- PART 3 — DECISION 2a. anon held SELECT on builders_public_profile with no row
-- restriction, so "select count(*) from builders_public_profile" as anon returned
-- every live listing (59 in the regression fixture set, 63 in the Arizona seed)
-- and every PostgREST filter, order and range worked on it.
--
-- 2a says an individual builder profile page is public and indexable, and in the
-- same breath that "the directory as a whole is never publicly browsable". A view
-- that hands an anonymous caller all of the rows, filterable, IS the browsable
-- directory, whatever the React app chooses to render.
--
-- The public page is kept exactly as public as 2a wants it and no more: anon
-- reads ONE profile, BY SLUG, through get_public_builder(), mirroring how
-- get_featured_builders() has served the anonymous featured strip since 0007.
-- Same columns, same rows, same imagery rule, one at a time.
--
-- The PAID directory is untouched: builders_public still carries SELECT for
-- authenticated only and is still RLS-scoped to a paid homeowner (0006, 0010).
-- The `authenticated` grant on builders_public_profile is also untouched, because
-- the finding and 2a's words are about the ANONYMOUS surface; see the note at the
-- end of this file.
-- =============================================================================


-- =============================================================================
-- PART 1 — claiming a government entity requires provable authority (2o)
-- =============================================================================
create or replace function public.claim_government_entity(
  p_entity_id  uuid,
  p_full_name  text,
  p_job_title  text,
  p_work_email citext,
  p_phone      text default null,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ONE sentence for every refusal. It states the RULE, which the claim page
  -- already states, and never which domains this entity holds.
  c_refused constant text :=
    'this claim cannot be recorded. Claiming a government entity takes a work email address at one of the official government domains ADUAtlas has recorded for that entity, and ADUAtlas confirms authority separately. Nothing was changed.';

  v_app_user uuid := public.current_app_user_id();
  v_gov_user uuid;
  v_entity   record;
  v_membership uuid;
  v_existing text;
  v_email    text;
  v_local    text;
  v_domain   text;
  v_domains  text[];
begin
  if v_app_user is null then
    raise exception '%', c_refused using errcode = '42501';
  end if;

  select id, name, claimed_at, verification_status, official_domains into v_entity
    from public.government_entities where id = p_entity_id;
  if v_entity.id is null then
    raise exception '%', c_refused using errcode = '42501';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) = 0 then
    raise exception '%', c_refused using errcode = '42501';
  end if;

  -- ── the work email, as a bare domain ─────────────────────────────────────
  -- Exactly one "@", something either side of it, and a domain shaped the way
  -- api/admin/_regulatory.js requires when Amy types one in. That regex is
  -- borrowed rather than reinvented so the product holds ONE definition of what
  -- an official domain looks like.
  v_email := lower(btrim(coalesce(p_work_email::text, '')));
  if array_length(string_to_array(v_email, '@'), 1) <> 2 then
    raise exception '%', c_refused using errcode = '42501';
  end if;
  v_local  := split_part(v_email, '@', 1);
  v_domain := btrim(split_part(v_email, '@', 2), '.');
  if v_local = '' or v_domain = '' or v_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception '%', c_refused using errcode = '42501';
  end if;

  -- ── the entity's own domains, normalised the same way ────────────────────
  -- Tolerant of a row seeded before the admin console normalised the column: a
  -- scheme, a path, a stray "@" or surrounding whitespace are stripped, and a
  -- blank entry is not a domain.
  select array_agg(d) into v_domains
    from (
      select btrim(
               regexp_replace(
                 regexp_replace(lower(btrim(x)), '^[a-z]+://', ''),
                 '/.*$', ''),
               '.@') as d
        from unnest(coalesce(v_entity.official_domains, '{}'::text[])) as x
    ) s
   where s.d <> '';

  -- NO RECORDED DOMAINS IS A REFUSAL, NOT A SHORTCUT. There is nothing to prove
  -- authority against, and "we could not check" must never read as "the check
  -- passed". Amy records the domains, or links the representative herself.
  if v_domains is null or array_length(v_domains, 1) = 0 then
    raise exception '%', c_refused using errcode = '42501';
  end if;

  -- EQUALITY on the whole domain, which is exactly the match Amy's review already
  -- computes (api/admin/_regulatory.js: work_email ends with '@' || d). A
  -- subdomain is not accepted: an employee at planning.example.gov is claimed by
  -- recording planning.example.gov, which is a deliberate refusal rather than a
  -- rule about how much of a government's DNS a claim may assume.
  if not (v_domain = any (v_domains)) then
    raise exception '%', c_refused using errcode = '42501';
  end if;

  -- ── from here, exactly what 0012 did ────────────────────────────────────
  insert into public.government_users (user_id, full_name, job_title, work_email, phone)
  values (v_app_user, btrim(p_full_name), p_job_title, lower(p_work_email), p_phone)
  on conflict (user_id) do update
    set full_name  = coalesce(excluded.full_name, public.government_users.full_name),
        job_title  = coalesce(excluded.job_title, public.government_users.job_title),
        work_email = coalesce(excluded.work_email, public.government_users.work_email),
        phone      = coalesce(excluded.phone, public.government_users.phone),
        updated_at = now()
  returning id into v_gov_user;

  -- A live membership already exists: report its state rather than creating a
  -- second one. Re-claiming is not an escalation path.
  select id, status into v_membership, v_existing
    from public.government_memberships
   where entity_id = p_entity_id
     and government_user_id = v_gov_user
     and status in ('pending', 'verified');

  if v_membership is null then
    insert into public.government_memberships
      (entity_id, government_user_id, membership_role, status, request_note)
    values (p_entity_id, v_gov_user, 'contributor', 'pending', p_note)
    returning id, status into v_membership, v_existing;
  end if;

  -- The entity becomes CLAIMED. verification_status is deliberately untouched:
  -- claiming never produces verification, and the PART 8 guard would refuse it here
  -- anyway if this function tried.
  if v_entity.claimed_at is null then
    update public.government_entities
       set claimed_at = now(),
           claim_note = coalesce(p_note, claim_note)
     where id = p_entity_id;
  end if;

  perform public.regulatory_audit(
    'government_entity.claimed', 'government_entities', p_entity_id, null, p_entity_id,
    array['claimed_at'], null,
    jsonb_build_object('membership_id', v_membership, 'government_user_id', v_gov_user,
                       'work_email_domain', v_domain),
    p_note, v_app_user);

  return jsonb_build_object(
    'ok', true,
    'entity_id', p_entity_id,
    'entity_name', v_entity.name,
    'entity_state', public.government_entity_state(p_entity_id),
    'membership_id', v_membership,
    'membership_status', v_existing,
    -- Said plainly in the return value so no interface can imply otherwise.
    'verified', false,
    'next_step', 'ADUAtlas reviews the claim and confirms your authority to represent this entity. A claim is not a verification, and verification is not a publishing right.');
end;
$$;

comment on function public.claim_government_entity(uuid, text, text, citext, text, text) is
  'Claims a government entity, and only after the claimant''s work-email domain matches one of the entity''s recorded official_domains (2o). An entity with no recorded domains is NOT claimable by self-service: Amy records the domains or links the representative through the admin path. Every failure returns the same sentence and the same SQLSTATE, so the function is not an oracle for which domains an entity accepts. On success it creates the person record, a PENDING membership and the entity''s claimed_at; it cannot verify anybody and it cannot grant authority over any jurisdiction. Claiming never produces verification (2m).';

-- Unchanged, restated so this file stands alone: anon cannot call it at all.
revoke execute on function public.claim_government_entity(uuid, text, text, citext, text, text) from public, anon;
grant  execute on function public.claim_government_entity(uuid, text, text, citext, text, text) to authenticated;


-- =============================================================================
-- PART 2 — a PENDING membership reads nothing (2m, 2o)
--
-- The government_entities_select_member policy (0012, PART 9) is this predicate,
-- so tightening the function tightens the policy, and every future caller
-- inherits the fix rather than repeating the mistake.
--
-- What a pending claimant KEEPS: their own government_users row, their own
-- government_memberships row, and my_government_context(), which is SECURITY
-- DEFINER and returns the entity name and state with an empty jurisdiction list.
-- The claim screen and the portal are unaffected. What they lose is the entity's
-- private row: official_domains and source_url, the evidence their claim is about
-- to be judged against.
--
-- A VERIFIED member does not additionally need the entity to be verified here,
-- which is the distinction from is_verified_government_member_of(): reading the
-- record of the institution you have been confirmed to represent is narrower than
-- reading its submissions or its grants.
-- =============================================================================
create or replace function public.is_government_member_of(p_entity_id uuid)
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
     where u.auth_user_id = auth.uid()
       and m.entity_id = p_entity_id
       and m.status = 'verified'          -- PENDING IS NOT A MEMBERSHIP YET (2o)
       and m.revoked_at is null
  );
$$;

comment on function public.is_government_member_of(uuid) is
  'True only when the caller holds a LIVE, VERIFIED membership of this entity. A PENDING claim is deliberately false: pending means ADUAtlas has not established that this person represents the institution, and a state that exists to mean "not yet proved" must not carry a read that assumes it was (2o). Read by the government_entities SELECT policy, so a claimant gains no sight of official_domains or source_url by claiming.';

comment on policy government_entities_select_member on public.government_entities is
  'A confirmed representative sees their own institution''s row. The predicate requires a live VERIFIED membership, so claiming alone reveals nothing: a pending claimant learns the entity''s name and state through my_government_context() and through the public view, and nothing else.';


-- =============================================================================
-- PART 3 — the anonymous builder read is ONE profile, BY SLUG (2a)
-- =============================================================================

-- The directory is no longer anonymously browsable, because the row source is no
-- longer anonymously readable. Nothing about the VIEW changes: same columns, same
-- rows, same imagery rule, same absence of contact details and internal fields.
revoke select on public.builders_public_profile from anon;

-- One company's public page, for an anonymous visitor and for a crawler.
--
-- Column for column the view, in the view's own order, so the response shape a
-- caller already handles is unchanged. It cannot be turned into the directory:
-- it takes one slug, it returns at most one row, and it exposes no way to ask for
-- a set. There is no list endpoint for anon by design (2a: "the directory as a
-- whole is never publicly browsable"), and the anonymous featured strip stays
-- capped at six rows in get_featured_builders().
--
-- SECURITY DEFINER for the same reason get_featured_builders() is: the function
-- reads the anon-safe view on the caller's behalf without anon holding a grant on
-- it. STABLE, and it writes nothing: an anonymous page view is not an event this
-- function records.
create or replace function public.get_public_builder(p_slug text)
returns table (
  id              uuid,
  slug            text,
  name            text,
  description     text,
  state           text,
  city            text,
  cities          text[],
  service_states  text[],
  specialties     text[],
  service_types   text[],
  build_methods   text[],
  build_approach  text,
  turnkey         boolean,
  licensed_states text[],
  website         text,
  verified        boolean,
  logo_path       text,
  photos          text[],
  claimed         boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select b.id, b.slug, b.name, b.description,
         b.state, b.city, b.cities, b.service_states,
         b.specialties, b.service_types, b.build_methods, b.build_approach,
         b.turnkey, b.licensed_states, b.website,
         b.verified, b.logo_path, b.photos, b.claimed
    from public.builders_public_profile b
   where b.slug = btrim(coalesce(p_slug, ''))
   limit 1;
$$;

comment on function public.get_public_builder(text) is
  'One public builder profile, by slug, for an anonymous visitor or a crawler (2a). It returns the builders_public_profile row exactly as the view defines it and at most one of them: an individual profile page is public and indexable, and the directory as a whole is never publicly browsable, so there is no anonymous read that returns a set.';

revoke execute on function public.get_public_builder(text) from public;
grant  execute on function public.get_public_builder(text) to anon, authenticated, service_role;


-- =============================================================================
-- What 0015 deliberately does NOT do
--
--   • It does not touch verification, the jurisdiction grants, the partnership
--     tables or any entitlement. A claim that now has to prove a domain still
--     produces exactly what 0012 said it produces: a claim and a PENDING
--     membership, and never a verification (2m, 2p (i) and (ii)).
--
--   • It does not check the claimant's ACCOUNT ROLE. 2m is explicit that a
--     government user is "an ordinary authenticated user. A person, not an
--     institution", so the discriminator 2o names is the official domain, not the
--     role on the ADUAtlas account.
--
--   • It does not narrow the regulatory public views. Reviewed against 2l and 2m,
--     row by row: jurisdictions_public, regulatory_provisions_public,
--     government_resources_public, jurisdiction_topic_coverage,
--     jurisdiction_coverage_public and regulatory_provision_history_public all
--     publish exactly what 2l puts on a public jurisdiction page — published
--     rows, official sources, the three field states, the four dates and the
--     coverage gaps — and enumerating them is the point of "a homeowner can
--     choose or search their state and jurisdiction", "state pages organise the
--     jurisdictions beneath them" and "coverage is transparent in the product".
--     government_resources_public carries an official phone, email and contact
--     person; those are the government's own published contacts, which 2l lists
--     among a jurisdiction record's fields and 2m makes a first-class GOVERNMENT
--     RESOURCE. That is the opposite case from a builder's contact details under
--     2d, and the two must not be reasoned about together.
--     government_entities_public exposes entity_state for every entity, which 2p
--     requires ("every public badge accurately represents the underlying state")
--     and which is now truthful again because PART 1 makes 'claimed' mean a claim
--     somebody could prove. It carries no official_domains, no source_url, no
--     claim note and no verification note.
--
--   • It does not revoke the `authenticated` grant on builders_public_profile. A
--     signed-in free account can still read the view as a set. 2a's sentence is
--     about the PUBLIC surface and the finding was about anon, so widening the
--     fix would be a product decision this file is not entitled to make; it is
--     raised rather than taken.
--
--   • It records no audit row for a REFUSED claim. The refusal is an exception,
--     which rolls back its own transaction, so a refusal cannot write a log line
--     from inside this function. Recording attempts belongs to whatever calls it.
-- =============================================================================
