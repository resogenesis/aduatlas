-- =============================================================================
-- 0007 — Claims, the Verified badge, relationship types, tracking on claim,
--        and the signed-project contract (Phase 1 third pass, locked
--        2026-09-25; PHASE_1.md sections 5.1, 5.2, 5.3 and 5.5)
--
-- What this adds on top of 0006:
--
--   builders.*             claim_code (the one-time code from the invitation),
--                          claimed_at, verified_at / verified_by (the admin
--                          check), relationship_type (marketplace, affiliate,
--                          partner) and external_tracking_url (an affiliate's
--                          own link)
--   builder_tracking_active(b)
--                          the one rule every referral lookup now shares:
--                          owner_user_id is not null and profile_status is
--                          'approved'
--   builders_public        the homeowner view, recreated with one more
--                          column: verified. Nothing about the claim code, the
--                          claim date, who verified, an affiliate's link or the
--                          commercial relationship is in it
--   builders_public_profile
--                          the anon-safe view behind the PUBLIC builder profile
--                          page: who the company is, where it works, what it
--                          builds where the company stated it, and imagery only
--                          for a listing the company has claimed
--   get_featured_builders  the 0006 public teaser, brought under the same
--                          imagery rule: a logo only for a claimed listing
--   claim_my_builder       a builder account (role 'pro') enters the code
--                          from the invitation and takes over the listing, and
--                          the Verified badge is cleared so it never transfers
--   log_referral_visit, capture_lead, inherit_referral_from_lead
--                          replaced so a code resolves ONLY to a builder whose
--                          tracking is active; log_builder_event is unchanged
--   referral_events.*      confirmed_by, signed_on, origin_builder_id and
--                          fee_applies for project_signed; one event per
--                          homeowner and builder
--   admin_mark_project_signed
--                          rewritten with the evidence the 5.3 contract
--                          requires, returning jsonb so the console can tell a
--                          fresh record from a repeat; the 0006 three-argument
--                          form is dropped
--   my_builder             blanks claim_code on the way out
--   my_referral_stats, referral_stats
--                          same shapes plus a "conversations" placeholder
--                          (messaging is the next pass)
--
-- ONE PUBLIC SURFACE, ONE PAID SURFACE. An individual builder profile page is
-- public and indexable, and builders_public_profile is everything it may show:
-- company name, where the company works, what it builds where the company's own
-- material stated it, and a link to the company. Contact email and phone are
-- not public, and neither is anything internal (claim codes, referral or
-- tracking data, verification detail, analytics, homeowner information or the
-- commercial relationship). Imagery appears only for a claimed listing, because
-- a company that has not claimed its listing has given no permission to publish
-- its pictures. Searching and filtering the directory, saved builders, richer
-- company information, recommendations and the introduction workflow all stay
-- behind the paid account in builders_public.
--
-- UNKNOWN MEANS UNKNOWN. Where the company never stated something, the column is
-- null and the interface omits the attribute rather than printing a default as a
-- claim. 0008 widens turnkey and build_approach so null can be stored.
--
-- TWO KINDS OF LISTING. ADUAtlas seeds the directory itself: those rows are
-- UNCLAIMED, approved, with no owner_user_id. They are useful to homeowners
-- from day one and carry no referral link, no analytics and no badge. A
-- listing becomes CLAIMED when a builder account takes it over, either by
-- entering the claim code from the invitation (claim_my_builder below) or
-- when an admin links an existing account to it (/api/admin/builders/link-
-- owner, 0006). A self-serve profile created from the builder portal is
-- owned by its author from the first save and counts as claimed.
--
-- TRACKING ACTIVATES ON CLAIM, never for an unclaimed listing. Referral link
-- resolution (log_referral_visit), attribution at email capture
-- (capture_lead) and attribution at purchase (api/stripe-webhook.js, plus the
-- lead inheritance trigger on users) all require
-- builder_tracking_active(b): owner_user_id is not null and profile_status =
-- 'approved'. An unclaimed builder's code is a dead link everywhere, never an
-- error. Profile views and homeowner inquiries (log_builder_event) are still
-- recorded for any approved listing, claimed or not: they are useful outreach
-- data and no link is involved.
--
-- VERIFIED IS A NARROW BADGE. It is a separate admin step after the claim and
-- means only "profile claimed and business information verified by
-- ADUAtlas". It never means "Certified": ADUAtlas has not judged the quality
-- of anyone's work. The view computes it from verified_at together with a
-- present owner, so a listing whose account is gone loses the badge with the
-- claim.
--
-- AFFILIATES KEEP THEIR OWN TERMS AND LINKS. relationship_type is marketplace,
-- affiliate or partner. An affiliate may carry its own external_tracking_url
-- and follows its own agreed terms; the standard $500 fee does not apply to
-- it (fee_applies below is false for an affiliate's signed project, and the
-- event is still recorded so the numbers stay complete). Nobody is forced
-- into one model. Both the relationship and the external link are for the
-- builder and the admin; neither appears on a homeowner or a public surface.
--
-- STILL NO BILLING. Nothing here charges a card, computes a balance or moves
-- money. fee_applies records whether the standard fee WOULD attach to a signed
-- project under the relationship in force when it was recorded; collecting it
-- remains a manual step. Membership billing is its own later piece of work.
--
-- Deploy order: 0006 then 0007. The frontend degrades when this file has not
-- been applied yet (src/lib/builders.js retries the homeowner view without
-- the new columns, and the claim panel reports "not-available").
--
-- Security model mirrors 0001/0004/0005/0006: lock down by default, grant back
-- precisely, service role for admin writes, security-definer RPCs for the
-- narrow things a signed-in user may do.
-- =============================================================================

-- ── builders: claim, verification and relationship (5.1) ────────────────────
alter table public.builders
  -- The one-time code printed in the invitation. Same alphabet as the
  -- referral code (no 0/O/1/I). Generated by /api/admin/builders/issue-claim-
  -- code, consumed once by claim_my_builder, then null.
  add column claim_code            text unique
        check (claim_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  add column claimed_at            timestamptz,
  -- The admin check. verified_at set means the badge shows (while the row
  -- still has an owner); verified_by is the admin who checked.
  add column verified_at           timestamptz,
  add column verified_by           uuid references public.users (id) on delete set null,
  add column relationship_type     text not null default 'marketplace'
        check (relationship_type in ('marketplace', 'affiliate', 'partner')),
  -- An affiliate's own tracking link. Rendered as an href in the portal and
  -- the admin console, so it must be an absolute http(s) URL.
  add column external_tracking_url text
        check (external_tracking_url is null or external_tracking_url ~* '^https?://');

comment on column public.builders.claim_code            is 'One-time claim code from the invitation; null once claimed. Never exposed to homeowners or to the builder.';
comment on column public.builders.claimed_at            is 'When a builder account took over this listing (claim code, admin link or self-serve creation).';
comment on column public.builders.verified_at           is 'Verified badge: profile claimed and business information verified by ADUAtlas. Not "Certified".';
comment on column public.builders.relationship_type     is 'marketplace (standard terms), affiliate (own terms and link) or partner. Nobody is forced into one model.';
comment on column public.builders.external_tracking_url is 'An affiliate''s own tracking link. For the builder and the admin only; never in builders_public.';

-- Rows that already had an owner when this ran (a self-serve draft or an
-- admin link from 0006) are claimed listings. The exact moment was not
-- recorded before this column existed, so they are stamped now rather than
-- with a reconstructed earlier time: that errs in the builder's favour for
-- anything later counted from the claim.
update public.builders set claimed_at = now() where owner_user_id is not null and claimed_at is null;

-- ── the tracking rule ───────────────────────────────────────────────────────
-- True when a referral link, visit logging and attribution may point at this
-- builder. Deliberately the only place the rule is written down; every lookup
-- below calls it. `active` is checked alongside where a lookup already did in
-- 0006 (an approved row an admin switched off is out of the directory and its
-- link is paused, as the builder dashboard says).
create or replace function public.builder_tracking_active(b public.builders)
returns boolean
language sql
immutable
as $$
  select b.owner_user_id is not null and b.profile_status = 'approved';
$$;

comment on function public.builder_tracking_active(public.builders) is 'Tracking activates on claim: owner_user_id is not null and profile_status = approved.';

-- Nobody calls this from the outside. The lookups that use it are all security
-- definer, so they run it as the owner; a homeowner or an anonymous visitor has
-- no business asking the database whether a listing is tracked.
revoke execute on function public.builder_tracking_active(public.builders) from public, anon, authenticated;

-- ── a claimed row never carries a claim code ────────────────────────────────
-- Whatever path sets owner_user_id (claim_my_builder, the admin link-owner
-- route, a self-serve insert), a pending code is retired and the claim is
-- stamped once. Issuing a NEW code for a row that already has an owner is
-- refused outright, so an admin can never hand out a code that would not
-- work. This keeps claim_code out of every RPC that returns the owner's own
-- row (save_my_builder and submit_my_builder return public.builders unchanged
-- from 0006) and gives every claim path a claimed_at.
create or replace function public.builders_on_claim()
returns trigger
language plpgsql
as $$
begin
  if new.owner_user_id is not null then
    if new.claim_code is not null
       and (tg_op = 'INSERT' or new.claim_code is distinct from old.claim_code) then
      raise exception 'this listing is already claimed';
    end if;
    new.claim_code := null;
    if new.claimed_at is null then
      new.claimed_at := now();
    end if;
  end if;
  -- A verification belongs to the owner who earned it and never travels. Whoever
  -- changes ownership (claim_my_builder, the admin link-owner route, an admin
  -- removing an account), the badge is dropped here, at the one choke point every
  -- owner_user_id write passes through, so a future caller cannot forget to do it.
  if tg_op = 'UPDATE' and new.owner_user_id is distinct from old.owner_user_id then
    new.verified_at := null;
    new.verified_by := null;
    -- claimed_at is the start of the 90 day free period, so it belongs to the
    -- owner who claimed and cannot be inherited. A listing that loses its owner
    -- is unclaimed again and carries no claim date; a new owner starts a new
    -- clock today rather than inheriting the previous owner's date, which would
    -- hand them a shortened or already expired trial.
    new.claimed_at := case when new.owner_user_id is null then null else now() end;
  end if;
  return new;
end;
$$;

-- A trigger function is invoked by the trigger, never called directly, so no
-- client role needs EXECUTE on it.
revoke execute on function public.builders_on_claim() from public, anon, authenticated;

create trigger builders_on_claim
  before insert or update of owner_user_id, claim_code on public.builders
  for each row execute function public.builders_on_claim();

-- =============================================================================
-- builders_public: the homeowner view, with verified.
--
-- Same rows and the same directory columns as 0006, then one more at the end
-- (CREATE OR REPLACE VIEW keeps existing grants when a column is appended).
-- Still absent, and now also: claim_code, claimed_at, verified_by and
-- external_tracking_url. verified requires a present owner as well as
-- verified_at: the badge is defined as "claimed and checked", so a listing
-- whose account was removed is not shown as Verified.
--
-- relationship_type is deliberately NOT here. It is the commercial arrangement
-- between ADUAtlas and the company, no homeowner surface reads it, and a
-- homeowner choosing a builder has no use for it.
-- =============================================================================
create or replace view public.builders_public as
  select
    b.id, b.slug, b.name, b.description, b.logo_path, b.website, b.external_link,
    b.contact_email, b.contact_phone, b.state, b.city, b.cities, b.service_zips,
    b.service_states, b.specialties, b.service_types, b.build_approach,
    b.build_methods, b.turnkey, b.licensed_states, b.photos, b.videos,
    b.featured, b.created_at,
    (b.verified_at is not null and b.owner_user_id is not null) as verified
  from public.builders b
  where b.profile_status = 'approved'
    and b.active
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid() and public.users_is_paid(u)
    );

revoke all on public.builders_public from anon, authenticated;
grant select on public.builders_public to authenticated;

-- =============================================================================
-- builders_public_profile: the PUBLIC individual builder profile page.
--
-- Readable by anyone, signed in or not, and by a crawler. Same rows as the
-- homeowner directory (active and approved) and a deliberately short column
-- list: who the company is, where it works, what it builds, its own website,
-- and the Verified badge. Everything a homeowner pays for stays in
-- builders_public.
--
-- Absent on purpose: contact_email and contact_phone (a public page is not a
-- contact list), external_link, featured, relationship_type, referral_code,
-- claim_code, claimed_at, verified_by, external_tracking_url, owner_user_id,
-- profile_status, admin_notes and commercial_terms.
--
-- logo_path and photos are exposed only for a CLAIMED listing. ADUAtlas seeds
-- unclaimed listings from a company's own public material; that is grounds to
-- describe the company, not permission to republish its pictures. Once the
-- company claims the listing it controls the imagery and it may be shown.
--
-- turnkey and build_approach may be null (0008): the company never stated it.
-- The page omits the row rather than printing a default.
-- =============================================================================
create view public.builders_public_profile as
  select
    b.id, b.slug, b.name, b.description,
    b.state, b.city, b.cities, b.service_states,
    b.specialties, b.service_types, b.build_methods, b.build_approach,
    b.turnkey, b.licensed_states, b.website,
    (b.verified_at is not null and b.owner_user_id is not null) as verified,
    case when b.owner_user_id is not null then b.logo_path end             as logo_path,
    case when b.owner_user_id is not null then b.photos else '{}'::text[] end as photos
  from public.builders b
  where b.active
    and b.profile_status = 'approved';

comment on view public.builders_public_profile is 'The public builder profile page. Anon-safe: no contact details, no commercial or internal fields, and imagery only for a claimed listing.';

revoke all on public.builders_public_profile from anon, authenticated;
grant select on public.builders_public_profile to anon, authenticated;

-- =============================================================================
-- get_featured_builders(): the 0006 public teaser, brought under the same
-- imagery rule as builders_public_profile above.
--
-- This RPC is granted to anon and is the featured strip on the public Find a
-- Builder page, which reads builders_public_profile for everything else on the
-- same screen. As 0006 left it, it returned logo_path for every approved,
-- featured listing, claimed or not, while the view beside it withheld exactly
-- that column for an unclaimed one. The builders bucket is public (0004,
-- builders_bucket_public_read), so a path handed to a visitor is a published
-- picture: seeding a listing from a company's own material is grounds to
-- describe the company, not permission to republish its pictures, and an admin
-- can feature a seeded listing. One rule, both public surfaces.
--
-- Same column list, same order, same grant, so every caller is unaffected.
-- =============================================================================
create or replace function public.get_featured_builders()
returns table (slug text, name text, state text, cities text[], specialties text[], logo_path text)
language sql
security definer
set search_path = public
stable
as $$
  select b.slug, b.name, b.state, b.cities, b.specialties,
         case when b.owner_user_id is not null then b.logo_path end as logo_path
  from public.builders b
  where b.active and b.featured and b.profile_status = 'approved'
  order by b.name
  limit 6;
$$;
grant execute on function public.get_featured_builders() to anon, authenticated;

-- =============================================================================
-- claim_my_builder(): the builder half of claiming (5.2). The caller must be
-- a builder account that owns no listing yet; the code must belong to a
-- listing nobody owns. On success the listing is theirs, claimed_at is
-- stamped, the code is spent, and the row comes back the way my_builder()
-- returns it. profile_status is left alone (an approved seeded listing is
-- live and tracked the moment it is claimed) and the Verified badge is CLEARED:
-- verified_at and verified_by are set to null, so a badge earned by a previous
-- owner never rides along to whoever claims the listing next. Verifying is the
-- admin's step, after the claim.
--
-- A wrong code and a code that was already used get the same message, so
-- the RPC cannot be used to tell which codes exist.
-- =============================================================================
create or replace function public.claim_my_builder(p_code text)
returns public.builders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_code text;
  v_row  public.builders%rowtype;
begin
  select * into v_user from public.users where auth_user_id = auth.uid();
  if v_user.id is null then
    raise exception 'not signed in';
  end if;
  if v_user.role <> 'pro' then
    raise exception 'only builder accounts can claim a builder profile';
  end if;
  if exists (select 1 from public.builders b where b.owner_user_id = v_user.id) then
    raise exception 'this account already owns a builder profile';
  end if;

  v_code := upper(nullif(trim(p_code), ''));
  if v_code is null or v_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'invalid or already used claim code';
  end if;

  update public.builders b
     set owner_user_id = v_user.id,
         claimed_at    = now(),
         claim_code    = null,
         -- The badge belongs to the company that was checked, not to the row.
         verified_at   = null,
         verified_by   = null
   where b.claim_code = v_code
     and b.owner_user_id is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'invalid or already used claim code';
  end if;

  v_row.commercial_terms := null;
  v_row.admin_notes      := null;
  return v_row;
exception
  -- owner_user_id is unique: two claims racing from the same account collapse
  -- into the message the pre-check would have given.
  when unique_violation then
    raise exception 'this account already owns a builder profile';
end;
$$;

revoke execute on function public.claim_my_builder(text) from public, anon;
grant  execute on function public.claim_my_builder(text) to authenticated;

-- =============================================================================
-- log_referral_visit(): as 0006, resolving only a tracking-active builder.
-- Still service role only, still one visit a day per (builder, browser).
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

  -- Tracking activates on claim: an unclaimed listing's code is a dead link.
  select b.id into v_builder
    from public.builders b
   where b.referral_code = v_code
     and b.active
     and public.builder_tracking_active(b)
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
-- capture_lead(): same signature as 0005/0006. The code now resolves only to
-- a tracking-active builder. Everything else (first touch, the normalised
-- code kept for the admin, one email_captured per builder and lead) is as
-- 0006 left it.
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

  -- Normalise and resolve the code (case-insensitive) to a builder whose
  -- tracking is active. A malformed, unknown, unapproved or unclaimed code is
  -- ignored, never an error: the lead still lands. The normalised code is
  -- kept even when it does not resolve so an admin can see what arrived.
  v_code := upper(nullif(trim(p_referral_code), ''));
  if v_code is not null and v_code ~ '^[A-HJ-NP-Z2-9]{8}$' then
    select b.id into v_builder
      from public.builders b
     where b.referral_code = v_code
       and b.active
       and public.builder_tracking_active(b)
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
-- inherit_referral_from_lead(): the 0006 insert-time trigger on users,
-- replaced so a new account inherits its lead's referrer only while that
-- builder's tracking is active. Leads captured from here on are already
-- clean (capture_lead above), so this closes the one remaining path by which
-- a lead attributed before 0007, or to a builder that has since lost its
-- owner, could attribute an account to an unclaimed listing. The trigger
-- (users_referral_from_lead) keeps pointing at this name.
-- =============================================================================
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
    join public.builders b on b.id = l.referred_by_builder_id
   where l.email = new.email
     and b.active
     and public.builder_tracking_active(b)
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

-- =============================================================================
-- my_builder(): as 0006, and claim_code is blanked too. The trigger above
-- already guarantees an owned row has none; this states the intent where the
-- row leaves the database. The new columns (claimed_at, verified_at,
-- relationship_type, external_tracking_url) ride along in the row type: the
-- owner may see their own affiliate link.
-- =============================================================================
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
  v_row.claim_code       := null;
  return next v_row;
end;
$$;

revoke execute on function public.my_builder() from public, anon;
grant  execute on function public.my_builder() to authenticated;

-- =============================================================================
-- referral_events: the signed-project contract (5.3).
--
--   confirmed_by       who confirmed the signing: builder, homeowner or both.
--                      An admin cannot record the event without it.
--   signed_on          the date the contract was signed (occurred_at stays
--                      "when ADUAtlas recorded it").
--   origin_builder_id  the builder whose link first brought the homeowner to
--                      ADUAtlas, from users.referred_by_builder_id at the time
--                      of recording. Usually the signing builder; when it is
--                      not, both are visible and the fee follows the contract
--                      (builder_id), not the click.
--   fee_applies        whether the standard fee attaches under the signing
--                      builder's relationship: true for marketplace, false for
--                      affiliate and partner. A record, not a charge.
--
-- One project_signed per homeowner and builder pair; recording it twice does
-- nothing. Any duplicates that exist from 0006 are collapsed to the earliest
-- before the index is built.
-- =============================================================================
alter table public.referral_events
  add column confirmed_by      text check (confirmed_by in ('builder', 'homeowner', 'both')),
  add column signed_on         date,
  add column origin_builder_id uuid references public.builders (id) on delete set null,
  add column fee_applies       boolean;

comment on column public.referral_events.fee_applies is 'project_signed only: whether the standard fee attaches under the signing builder''s relationship_type. Recorded, never billed here.';

delete from public.referral_events e
 using public.referral_events d
 where e.kind = 'project_signed'
   and d.kind = 'project_signed'
   and e.user_id is not null
   and d.user_id = e.user_id
   and d.builder_id = e.builder_id
   and (d.occurred_at, d.id) < (e.occurred_at, e.id);

create unique index referral_events_project_signed_uidx
  on public.referral_events (user_id, builder_id)
  where kind = 'project_signed';

-- Events recorded under 0006 predate the relationship type (every row was a
-- marketplace relationship by default) and carry no confirmation; they keep
-- confirmed_by and signed_on null and get the two derivable fields.
update public.referral_events e
   set origin_builder_id = (select u.referred_by_builder_id from public.users u where u.id = e.user_id),
       fee_applies       = (b.relationship_type = 'marketplace')
  from public.builders b
 where e.kind = 'project_signed'
   and b.id = e.builder_id
   and e.fee_applies is null;

-- =============================================================================
-- admin_mark_project_signed(): the one event ADUAtlas cannot detect, with the
-- evidence the contract requires. Called from /api/admin/builders/mark-
-- project-signed with the service client after the admin API resolves the
-- homeowner's email to users.id. The 0006 form is dropped so PostgREST has
-- one candidate.
--
-- A CLAIMED LISTING ONLY. The $500 fee attaches to a company that took over
-- its listing and accepted the terms. An unclaimed listing seeded by ADUAtlas
-- has agreed to nothing and has no account to bill, so the event is refused
-- outright rather than recorded against it.
--
-- A NOTE IS REQUIRED. This is the one event with no machine evidence behind it,
-- so the record has to say who said what. confirmed_by, signed_on and the note
-- are all mandatory.
--
-- Returns jsonb:
--   event               the referral_events row, whether it was just written or
--                       was already there
--   inserted            true only when this call wrote the row. A repeat for
--                       the same homeowner and builder changes nothing and
--                       comes back with inserted false, so the console can say
--                       "already recorded" without guessing from the row.
--   origin_builder_name the name of the builder whose link first brought the
--                       homeowner in, and ONLY when that is a different company
--                       from the one signing. Null otherwise, so a caller can
--                       treat "present" as "worth showing".
-- =============================================================================
drop function if exists public.admin_mark_project_signed(uuid, uuid, text);
drop function if exists public.admin_mark_project_signed(uuid, uuid, text, date, text);

create function public.admin_mark_project_signed(
  p_builder_id   uuid,
  p_user_id      uuid,
  p_confirmed_by text,
  p_signed_on    date,
  p_note         text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_builder  public.builders%rowtype;
  v_user     public.users%rowtype;
  v_row      public.referral_events%rowtype;
  v_note     text;
  v_origin   text;
  v_inserted boolean := false;
begin
  select * into v_builder from public.builders b where b.id = p_builder_id;
  if v_builder.id is null then
    raise exception 'builder not found';
  end if;
  if v_builder.owner_user_id is null then
    raise exception 'a signed project can only be recorded for a claimed listing';
  end if;
  if p_user_id is null then
    raise exception 'homeowner is required';
  end if;
  select * into v_user from public.users u where u.id = p_user_id;
  if v_user.id is null then
    raise exception 'homeowner not found';
  end if;
  if p_confirmed_by is null or p_confirmed_by not in ('builder', 'homeowner', 'both') then
    raise exception 'confirmed_by must be builder, homeowner or both';
  end if;
  if p_signed_on is null then
    raise exception 'signed date is required';
  end if;
  v_note := left(nullif(trim(p_note), ''), 2000);
  if v_note is null then
    raise exception 'a note recording what was confirmed is required';
  end if;

  insert into public.referral_events
    (builder_id, kind, user_id, note, confirmed_by, signed_on, origin_builder_id, fee_applies)
  values
    (p_builder_id, 'project_signed', p_user_id, v_note,
     p_confirmed_by, p_signed_on, v_user.referred_by_builder_id,
     v_builder.relationship_type = 'marketplace')
  on conflict (user_id, builder_id) where kind = 'project_signed' do nothing
  returning * into v_row;

  if v_row.id is null then
    -- Already recorded. The first record stands; this call changed nothing.
    select e.* into v_row
      from public.referral_events e
     where e.kind = 'project_signed'
       and e.user_id = p_user_id
       and e.builder_id = p_builder_id;
  else
    v_inserted := true;
  end if;

  -- The click and the contract can name different companies. The fee follows
  -- the contract (builder_id); the origin is reported so an admin can see it.
  select b.name into v_origin
    from public.builders b
   where b.id = v_row.origin_builder_id
     and b.id is distinct from v_row.builder_id;

  return jsonb_build_object(
    'event',               to_jsonb(v_row),
    'inserted',            v_inserted,
    'origin_builder_name', v_origin
  );
end;
$$;

revoke execute on function public.admin_mark_project_signed(uuid, uuid, text, date, text) from public, anon, authenticated;
grant  execute on function public.admin_mark_project_signed(uuid, uuid, text, date, text) to service_role;

-- =============================================================================
-- my_referral_stats(): the 0006 shape plus "conversations": 0. Messaging is
-- the next pass; the dashboard renders the label now. Counts only.
-- =============================================================================
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
    'net_amount_cents',       v_purchased - v_refunded,
    -- Placeholder until homeowner-to-builder messaging ships.
    'conversations',          0
  );
end;
$$;

revoke execute on function public.my_referral_stats() from public, anon;
grant  execute on function public.my_referral_stats() to authenticated;

-- =============================================================================
-- referral_stats(): the 0006 columns plus conversations (0, the same
-- placeholder). The return type changes, so the function is dropped first and
-- its service-role-only grants restated.
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
  projects_signed       integer,
  conversations         integer
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
    coalesce(e.projects_signed, 0)                               as projects_signed,
    0                                                            as conversations
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
-- Notes
--   • Homeowners still have no grant on builders, referral_events or leads.
--     Their whole view of a builder is builders_public, now with verified, and
--     never the claim code, the claim date, who verified, an affiliate's link
--     or the commercial relationship.
--   • Anonymous visitors and crawlers get builders_public_profile and nothing
--     else: no contact details, no internal fields, and imagery only for a
--     claimed listing. Search, filters, saving and introductions stay paid.
--   • A claim clears verified_at and verified_by. The badge says ADUAtlas
--     checked THIS company's business information, so it cannot ride along to
--     the next company that claims the listing. It never means ADUAtlas judged
--     anyone's construction quality or guarantees the work.
--   • A signed project is refused for an unclaimed listing, and the note is
--     required. The RPC reports whether it inserted, so the console never has
--     to infer a repeat.
--   • Issuing a claim code, verifying and unverifying, setting the
--     relationship type and the affiliate link, and recording a signed
--     project all live in /api/admin/builders/* with the service role, as
--     every admin write does. Verify requires an owner: a listing is verified
--     only after it is claimed.
--   • A claim does not change profile_status. A seeded listing is approved
--     before anyone claims it, so claiming turns tracking on at once; the
--     dashboard reads "Claimed. Verification pending. Your referral link is
--     active." until the admin verifies.
--   • The referral_code column keeps existing on unclaimed rows (0005 gave
--     every builder one). It is never printed for them: the link comes with
--     the claim, and until then the code resolves nowhere.
--   • No money moves anywhere in this file. See the header.
-- =============================================================================
