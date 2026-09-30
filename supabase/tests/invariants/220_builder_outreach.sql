-- =============================================================================
-- INVARIANT: ADUAtlas CAN REACH A BUILDER, AND REACHING ONE CHANGES NOTHING ELSE.
--
-- Section 5.2 makes an invitation a step in the funnel ("ADUAtlas creates the
-- basic listing, THE BUILDER RECEIVES AN INVITATION, the builder claims the
-- profile..."), and decision 8 makes the homeowner the one who starts every
-- conversation. 0016 adds the two timestamps that funnel needs and had never had:
--
--   builders.invited_at          when ADUAtlas asked this company to claim its
--                                listing
--   intro_requests.forwarded_at  when a homeowner's introduction actually reached
--                                the builder
--
-- Two columns, and four different ways they could be wrong. This file proves all
-- four, because the two gaps 0016 closes were both "the record exists and nothing
-- ever left the building", and the fix must not become "something leaves the
-- building that shouldn't".
--
--   A. Only the service role can stamp either one. A builder that could set its
--      own invited_at would forge a relationship ADUAtlas never started; a
--      homeowner or builder that could set forwarded_at would be able to claim an
--      introduction was delivered when nothing was sent.
--   B. Neither column reaches an anonymous surface, and an INVITATION IS NOT
--      PARTICIPATION (2a): "an unclaimed public profile must carry no implication
--      that the company has partnered with, endorsed or joined ADUAtlas". A
--      company that ignored an email is in exactly the state it was in before it.
--   C. Forwarding stamps once. Only a write that states forwarded_at records a
--      delivery (0024: a status change to 'sent' alone never does), a second
--      forward neither double-stamps nor loses the first date, and the date can
--      never be cleared.
--   D. The introduction still belongs to exactly ONE homeowner and ONE builder,
--      and forwarding moves neither of them.
--
-- ── WHY EVERY GROUP OPENS WITH A POSITIVE CONTROL ───────────────────────────
-- Every assertion in A, and most of B, is a REFUSAL, and a refusal is
-- indistinguishable from a crashed query, a dropped trigger, a missing column or a
-- feature nobody can use. Not adding the columns at all would make almost every
-- negative assertion in this file pass while ADUAtlas still had no way to invite a
-- builder or deliver an introduction — which is the exact defect 0016 exists to
-- close, reported as green. So each group first proves that the LEGITIMATE write
-- or read works, and where the control does not pass, the refusals it underwrites
-- are recorded as SKIPS carrying the database's own error, because a denial that
-- cannot be told apart from a dead feature is not evidence. This codebase has
-- already produced one RLS infinite-recursion bug (0012, PART 3) that made every
-- read of a table fail and that a negative test reported as green.
--
-- t.pub_profile_fn() below is defined IDENTICALLY in 210_anon_directory_boundary
-- .sql and is duplicated rather than put in helpers/ because every invariant file
-- has to run standalone and in any order; `create or replace` makes the second
-- definition a no-op. The reasoning is written out at the top of 180.
-- =============================================================================
select t.suite('220 builder outreach (5.2, 2a, decision 8)');

-- THE ONE ANONYMOUS WAY INTO A BUILDER PROFILE, resolved from the catalogue: a
-- function in schema public that anon may execute, takes a single text-shaped
-- argument (the slug) and is named for a builder profile. Asked rather than
-- assumed, so renaming the accessor is a rename and not a broken suite, and so
-- this file states the invariant — one slug in, one profile out — rather than a
-- spelling. Nothing here matches a zero-argument function, which is what a
-- set-returning list endpoint would be.
create or replace function t.pub_profile_fn()
returns text
language sql
stable
as $fn$
  select n.nspname || '.' || p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.pronargs = 1
     and p.proargtypes[0] in ('text'::regtype, 'citext'::regtype, 'varchar'::regtype)
     and p.proname ~* 'builder'
     and p.proname ~* '(profile|public|slug)'
     and has_function_privilege('anon', p.oid, 'execute')
   order by p.proname
   limit 1;
$fn$;

-- Every relation in schema public carrying a column of this name that the ANON
-- role may SELECT, table-level privilege or column-level. The honest way to assert
-- "and it appears on no anon-facing surface": it asks the catalogue which surfaces
-- exist rather than listing the ones somebody remembered.
create or replace function t.outreach_anon_relations_with(p_column text)
returns text[]
language sql
stable
as $fn$
  select coalesce(array_agg(distinct c.relname::text order by c.relname::text), '{}')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
   where n.nspname = 'public'
     and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and a.attname = p_column
     and a.attnum > 0
     and not a.attisdropped
     and has_column_privilege('anon', c.oid, a.attnum::smallint, 'select');
$fn$;

-- A set-returning function's OUT columns, by name: its RETURN SIGNATURE. A column
-- can be withheld by a view and then handed straight back by the function in front
-- of it, which is the shape 0015 put anon behind.
create or replace function t.outreach_fn_argnames(p_fn text)
returns text[]
language sql
stable
as $fn$
  select coalesce(p.proargnames, '{}')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname || '.' || p.proname = p_fn
   order by p.pronargs
   limit 1;
$fn$;


-- =============================================================================
-- GROUP A — the two columns exist, start null, and ONLY the service role may
-- stamp them. The admin API authenticates the caller as an admin and writes with
-- the service key; every client role is locked out by the grants that already
-- exist, which is what makes a column added to either table unreachable from a
-- browser the day it is created.
-- =============================================================================
do $$
declare
  v_b        uuid;
  v_other_b  uuid;
  v_pro_auth uuid;
  v_home     uuid;
  v_hauth    uuid;
  v_intro    uuid;
  v_ins      jsonb;
  v_ctl      jsonb;
  v_ctl_ok   boolean := false;
  v_ictl_ok  boolean := false;
  v_type     text;
  v_hasdef   boolean;
  v_first    text;
  v_second   text;
begin
  if not t.has_column('public.builders', 'invited_at')
     or not t.has_column('public.intro_requests', 'forwarded_at') then
    perform t.skip('control-service-role-records-an-invitation',
      '5.2: the builder receives an invitation',
      'builders.invited_at or intro_requests.forwarded_at does not exist; migration 0016 is not applied to this database. Until it is, ADUAtlas can seed a directory and has no way to tell any of the companies in it.');
    perform t.skip('control-service-role-forwards-an-introduction',
      'decision 8: the homeowner initiates every conversation, and ADUAtlas passes it on',
      'intro_requests.forwarded_at does not exist; migration 0016 is not applied to this database.');
    return;
  end if;

  -- A seeded Arizona listing, exactly as ADUAtlas creates one before any builder
  -- has heard of it: approved, active, unclaimed, unverified.
  v_b       := t.mk_builder('{"state": "AZ", "city": "Phoenix"}'::jsonb);
  v_other_b := t.mk_claimed_builder();
  v_pro_auth := t.owner_authid(v_other_b);
  v_home    := t.mk_paid_homeowner('report');
  v_hauth   := t.authid(v_home);

  -- ── the columns' own shape ────────────────────────────────────────────────
  select format_type(a.atttypid, a.atttypmod), a.atthasdef
    into v_type, v_hasdef
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'builders' and a.attname = 'invited_at';

  perform t.assert(
    'invited-at-is-a-nullable-timestamp-with-no-default',
    '5.2: an invitation is a DATE, because "did we already contact this company, and when" is the question an outreach list exists to answer',
    v_type = 'timestamp with time zone' and v_hasdef is not true,
    format('builders.invited_at is %s with default present = %s; it must be a nullable timestamptz with no default, so null means nobody has been contacted yet (2b)', v_type, v_hasdef));

  select format_type(a.atttypid, a.atttypmod), a.atthasdef
    into v_type, v_hasdef
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'intro_requests' and a.attname = 'forwarded_at';

  perform t.assert(
    'forwarded-at-is-a-nullable-timestamp-with-no-default',
    '2h: the ADUAtlas thread is the system of record and email only notifies, so the record has to be able to say WHEN it notified',
    v_type = 'timestamp with time zone' and v_hasdef is not true,
    format('intro_requests.forwarded_at is %s with default present = %s; it must be a nullable timestamptz with no default', v_type, v_hasdef));

  perform t.assert_scalar(
    'a-seeded-listing-starts-uninvited',
    '2b: unknown means unknown. A freshly seeded listing has not been contacted, and the record says so rather than defaulting to a date',
    'service_role', null,
    format('select (invited_at is null) as r from public.builders where id = %L', v_b),
    'true',
    'a newly created builder row already carries an invited_at, so ADUAtlas cannot tell a company it has contacted from one it has not');

  -- The introduction goes in the way production puts one in: the homeowner's own
  -- insert, through the column grant and the intro_requests_insert_own policy.
  v_ins := t.x('authenticated', v_hauth,
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, %L)',
           v_home, v_b, 'We are on a corner lot in Mesa and want a detached two bedroom.'));
  perform t.assert(
    'control-a-homeowner-can-still-request-an-introduction',
    'decision 8: the homeowner initiates every conversation. This is the control: the refusals below must be refusals of the WRITE, not of the whole feature',
    (v_ins->>'ok')::boolean,
    format('a paid homeowner could not create an introduction request (%s). Every assertion about forwarding one is vacuous until this passes', coalesce(v_ins->>'error', 'no error')));

  select id into v_intro from public.intro_requests where user_id = v_home and builder_id = v_b;

  perform t.assert_scalar(
    'a-new-introduction-starts-undelivered',
    '2h: "Introduction requested" and "introduction delivered" are different facts and the record must distinguish them',
    'service_role', null,
    format('select (forwarded_at is null and status = ''requested'') as r from public.intro_requests where id = %L', v_intro),
    'true',
    'a brand new introduction request is already marked forwarded, so the homeowner portal cannot tell a recorded introduction from a delivered one');

  -- ── THE POSITIVE CONTROL for invited_at ───────────────────────────────────
  v_ctl := t.x('service_role', null,
    format('update public.builders set invited_at = now() where id = %L', v_b));
  v_ctl_ok := (v_ctl->>'ok')::boolean and (v_ctl->>'rowcount')::bigint = 1;
  perform t.assert(
    'control-service-role-records-an-invitation',
    '5.2: ADUAtlas creates the basic listing and THE BUILDER RECEIVES AN INVITATION. The admin API authenticates an admin and writes with the service key',
    v_ctl_ok,
    format('the service role could not record an invitation against a seeded listing (%s, %s row(s)). Until this passes, every refusal below is indistinguishable from a column nobody can write, and ADUAtlas is back to seeding 86 Arizona companies with no way to tell any of them',
           coalesce(v_ctl->>'error', 'no error'), v_ctl->>'rowcount'));

  if v_ctl_ok then
    perform t.assert_scalar(
      'the-invitation-reads-back',
      '5.2: outreach is trackable, which means the date is stored and not just sent',
      'service_role', null,
      format('select (invited_at is not null) as r from public.builders where id = %L', v_b),
      'true',
      'the invitation write was accepted and stored nothing');

    -- Re-inviting is allowed: a bounce, a second address, a follow-up. What it
    -- must not do is move the date ADUAtlas first asked, because that is the only
    -- record of whether this company has already been contacted. The second write
    -- asks for a different date on purpose, so a passing assertion cannot be an
    -- accident of clock resolution or of now() being frozen in one transaction.
    select invited_at::text into v_first from public.builders where id = v_b;
    perform t.x('service_role', null,
      format('update public.builders set invited_at = now() + interval ''7 days'' where id = %L', v_b));
    select invited_at::text into v_second from public.builders where id = v_b;

    perform t.assert(
      'inviting-twice-keeps-the-first-invitation-date',
      '5.2: outreach is trackable, and "did we already contact this company, and when" is the question it answers. A first-contact date a later caller can overwrite is not a record',
      v_second = v_first,
      format('a second invitation moved invited_at from %L to %L, so nobody can tell whether this company was contacted today or in the first Arizona pass', v_first, v_second));
  else
    perform t.skip('the-invitation-reads-back',
      '5.2: outreach is trackable, which means the date is stored and not just sent',
      'the positive control did not pass; there is no recorded invitation to read back.');
    perform t.skip('inviting-twice-keeps-the-first-invitation-date',
      '5.2: outreach is trackable, and a first-contact date a later caller can overwrite is not a record',
      'the positive control did not pass; there is no recorded invitation to re-send.');
  end if;

  -- ── THE POSITIVE CONTROL for forwarded_at ─────────────────────────────────
  v_ctl := t.x('service_role', null,
    format('update public.intro_requests set status = ''sent'', forwarded_at = now() where id = %L', v_intro));
  v_ictl_ok := (v_ctl->>'ok')::boolean and (v_ctl->>'rowcount')::bigint = 1;
  perform t.assert(
    'control-service-role-forwards-an-introduction',
    'decision 8 and 2h: the homeowner starts the conversation and ADUAtlas relays it. A recorded introduction that reaches nobody is the defect 0016 closes',
    v_ictl_ok,
    format('the service role could not forward a homeowner introduction (%s, %s row(s)). Until this passes the homeowner sees "Introduction requested" for ever and the company never learns anybody asked',
           coalesce(v_ctl->>'error', 'no error'), v_ctl->>'rowcount'));

  -- ── the denials. A client role has no way in, by UPDATE or by INSERT ──────
  if v_ctl_ok or v_ictl_ok then
    perform t.assert_denied(
      'builder-account-cannot-record-its-own-invitation',
      '5.2 and 2a: an invitation is something ADUAtlas did. A builder that can stamp its own would forge a relationship ADUAtlas never started',
      'authenticated', v_pro_auth,
      format('update public.builders set invited_at = now() where id = %L', v_b),
      'a builder account can write builders.invited_at, so the outreach record can be manufactured from a browser');

    perform t.assert_denied(
      'builder-account-cannot-record-an-invitation-on-its-own-listing',
      '5.2 and 2a: the same, on the row the account owns. Owning a listing is not authority over ADUAtlas''s record of contacting it',
      'authenticated', v_pro_auth,
      format('update public.builders set invited_at = now() where id = %L', v_other_b),
      'the owner of a listing can stamp its own invited_at');

    perform t.assert_denied(
      'homeowner-cannot-record-an-invitation',
      '5.2: outreach is ADUAtlas''s own record',
      'authenticated', v_hauth,
      format('update public.builders set invited_at = now() where id = %L', v_b),
      'a paying homeowner can write builders.invited_at');

    perform t.assert_denied(
      'anon-cannot-record-an-invitation',
      '2k: the browser is never trusted to enforce permission, and the anon key ships in the frontend bundle',
      'anon', null,
      format('update public.builders set invited_at = now() where id = %L', v_b),
      'an anonymous caller can write builders.invited_at with the key that ships in the frontend bundle');

    perform t.assert_denied(
      'homeowner-cannot-mark-its-own-introduction-delivered',
      '2h: email only notifies and ADUAtlas is the one that relays. A homeowner marking their own introduction delivered would make the record a wish',
      'authenticated', v_hauth,
      format('update public.intro_requests set status = ''sent'', forwarded_at = now() where id = %L', v_intro),
      'the homeowner who requested an introduction can mark it forwarded, so the delivery record proves nothing');

    perform t.assert_denied(
      'homeowner-cannot-insert-a-forwarded-introduction',
      'decision 8: a homeowner creates the request; ADUAtlas records the delivery. The INSERT grant is a column list for exactly this reason',
      'authenticated', v_hauth,
      format('insert into public.intro_requests (user_id, builder_id, message, forwarded_at, status) values (%L, %L, ''pre-delivered'', now(), ''sent'')',
             v_home, v_other_b),
      'a homeowner can insert an introduction that is already marked delivered, which routes around the forward entirely');

    perform t.assert_denied(
      'builder-account-cannot-mark-an-introduction-delivered',
      '2h: builders can never open a conversation, and a builder writing the delivery record is a builder writing a homeowner''s row',
      'authenticated', v_pro_auth,
      format('update public.intro_requests set status = ''sent'', forwarded_at = now() where id = %L', v_intro),
      'a builder account can write intro_requests.forwarded_at');

    perform t.assert_denied(
      'anon-cannot-mark-an-introduction-delivered',
      '2k: the anon key ships in the frontend bundle and must reach nothing that matters',
      'anon', null,
      format('update public.intro_requests set forwarded_at = now() where id = %L', v_intro),
      'an anonymous caller can write intro_requests.forwarded_at');
  else
    perform t.skip('builder-account-cannot-record-its-own-invitation',
      '5.2 and 2a: an invitation is something ADUAtlas did, never something the company agreed to',
      'neither positive control passed; a denial here would not be evidence, because nobody can write either column.');
    perform t.skip('homeowner-cannot-mark-its-own-introduction-delivered',
      '2h: ADUAtlas relays and the record says when',
      'neither positive control passed; a denial here would not be evidence.');
  end if;

  -- ── a builder learns nothing about another listing's outreach ─────────────
  -- my_builder() returns the caller's OWN row, so the owner of a claimed listing
  -- sees its own invited_at (a fact it already has: it received the email). What
  -- it must never see is somebody else's. v_b was just invited and v_other_b
  -- never was, so a cross-read would show up here as a non-null date.
  perform t.assert_count(
    'a-builder-sees-no-other-listings-outreach',
    '5.6: the builder portal shows the builder''s own profile and nothing else',
    'authenticated', v_pro_auth,
    'select 1 from public.my_builder() where invited_at is not null',
    0,
    'a builder account can read the invitation date of a listing it does not own, which is ADUAtlas''s outreach list read by a competitor');
end
$$;


-- =============================================================================
-- GROUP B — neither column reaches an anonymous surface, and AN INVITATION IS
-- NOT PARTICIPATION.
--
-- 2a: "An unclaimed public profile must carry no implication that the company has
-- partnered with, endorsed or joined ADUAtlas. It is a listing ADUAtlas compiled
-- from public information, and it must read that way." An invitation is ADUAtlas
-- sending an email. A company that never answered it has agreed to nothing, so the
-- public page after the invitation must be the public page before it.
-- =============================================================================
do $$
declare
  v_fn      text := t.pub_profile_fn();
  v_b       uuid;
  v_slug    text;
  v_stamp   text;
  v_pc      jsonb;
  v_pc_ok   boolean := false;
  v_payload text;
  v_rels    text[];
  v_names   text[];
begin
  if not t.has_column('public.builders', 'invited_at') then
    perform t.skip('control-anon-reads-the-invited-listings-public-profile',
      '2a: an individual builder profile page is public and indexable',
      'builders.invited_at does not exist; migration 0016 is not applied to this database.');
    return;
  end if;

  v_b := t.mk_builder('{"state": "AZ", "city": "Tucson"}'::jsonb);
  select slug into v_slug from public.builders where id = v_b;
  perform t.x('service_role', null,
    format('update public.builders set invited_at = now() where id = %L', v_b));
  select invited_at::text into v_stamp from public.builders where id = v_b;

  -- ── THE POSITIVE CONTROL ─────────────────────────────────────────────────
  if v_fn is null then
    perform t.assert(
      'control-anon-reads-the-invited-listings-public-profile',
      '2a: an individual builder profile page IS public and indexable, so there is a public surface for an invitation to leak onto',
      false,
      'no anon-executable function in schema public takes a single text argument and is named for a builder profile, so there is no anonymous profile read to inspect. Every "the invitation does not show" assertion below would be vacuous.');
  else
    v_pc := t.q('anon', null, format('select * from %s(%L)', v_fn, v_slug));
    v_pc_ok := (v_pc->>'ok')::boolean and (v_pc->>'count')::int = 1;
    perform t.assert(
      'control-anon-reads-the-invited-listings-public-profile',
      '2a: an individual builder profile page IS public and indexable. Inviting a company does not take its page down, and it does not put anything new on it',
      v_pc_ok,
      format('%s(%L) returned %s row(s) for an invited, approved, active listing as anon (%s); it must return exactly one. Until this passes, every assertion below passes for the wrong reason: nothing can leak from a page nobody can read',
             v_fn, v_slug, v_pc->>'count', coalesce(v_pc->>'error', 'no error')));
  end if;

  if v_pc_ok then
    v_payload := (v_pc->'rows')::text;

    perform t.assert(
      'the-public-profile-carries-no-invitation',
      '2a: an unclaimed public profile must carry no implication that the company has partnered with, endorsed or joined ADUAtlas',
      position(v_stamp in v_payload) = 0,
      format('the anonymous profile payload contains the invitation timestamp %L. Being invited is something ADUAtlas did; publishing it on the company''s own page implies a relationship the company never entered', v_stamp));

    perform t.assert(
      'an-invited-listing-is-still-unclaimed-and-unverified-in-public',
      '2a, 2c and 2e: the four listing states stay distinct. An invitation is not a claim, and a claim is not a verification',
      v_payload like '%"claimed": false%' and v_payload like '%"verified": false%',
      format('an invited but unclaimed listing does not read as unclaimed and unverified to an anonymous visitor. Payload: %s', left(v_payload, 400)));
  else
    perform t.skip('the-public-profile-carries-no-invitation',
      '2a: an unclaimed public profile must carry no implication that the company has joined ADUAtlas',
      'the positive control did not pass, so there is no anonymous profile payload to inspect.');
    perform t.skip('an-invited-listing-is-still-unclaimed-and-unverified-in-public',
      '2a, 2c and 2e: the four listing states stay distinct',
      'the positive control did not pass, so there is no anonymous profile payload to inspect.');
  end if;

  -- ── the accessor's RETURN SIGNATURE, not just the view behind it ──────────
  if v_fn is not null then
    v_names := t.outreach_fn_argnames(v_fn);
    perform t.assert(
      'the-single-profile-accessors-signature-has-no-outreach-column',
      '2a: a column withheld by the view and handed back by the function in front of it is not withheld',
      'invited_at' <> all (v_names) and 'forwarded_at' <> all (v_names),
      format('%s returns an invited_at or forwarded_at column: %s. 0015 put the anonymous read behind this function, so its signature is the public surface', v_fn, v_names::text));
  else
    perform t.skip('the-single-profile-accessors-signature-has-no-outreach-column',
      '2a: the anonymous accessor''s return signature is a public surface',
      'no anon-executable single-profile function was found to inspect.');
  end if;

  v_names := t.outreach_fn_argnames('public.get_featured_builders');
  perform t.assert(
    'the-featured-teasers-signature-has-no-outreach-column',
    '2a: the anonymous featured strip is a public surface like any other',
    'invited_at' <> all (v_names) and 'forwarded_at' <> all (v_names),
    format('get_featured_builders returns an outreach column: %s', v_names::text));

  -- ── and no anon-readable relation carries either column ───────────────────
  -- Asked of the catalogue rather than of a remembered list of views, so a future
  -- view that selects b.* is caught the day it is created.
  v_rels := t.outreach_anon_relations_with('invited_at');
  perform t.assert(
    'no-anon-readable-relation-carries-invited-at',
    '2a: invited_at is ADUAtlas''s own outreach record and never appears on a public surface',
    v_rels = '{}',
    format('the anon role can select an invited_at column from: %s. An invitation published on a public page implies participation the company never agreed to', v_rels::text));

  v_rels := t.outreach_anon_relations_with('forwarded_at');
  perform t.assert(
    'no-anon-readable-relation-carries-forwarded-at',
    '2a and 2h: a homeowner''s introduction is private correspondence, and when it was delivered is part of it',
    v_rels = '{}',
    format('the anon role can select a forwarded_at column from: %s', v_rels::text));

  perform t.assert(
    'the-paid-directory-carries-no-invitation',
    '2a: the paid directory sells search, filters and richer builder information, not ADUAtlas''s outreach list',
    not t.has_column('public.builders_public', 'invited_at'),
    'builders_public exposes invited_at, so a $79 purchase reads which companies ADUAtlas has contacted and when');

  perform t.assert(
    'the-public-profile-view-carries-no-invitation',
    '2a: the public profile view is the whole of what a public page may show',
    not t.has_column('public.builders_public_profile', 'invited_at'),
    'builders_public_profile exposes invited_at, which publishes ADUAtlas''s outreach on the company''s own public page');

  -- ── an invitation activates nothing ──────────────────────────────────────
  perform t.assert_scalar(
    'an-invitation-does-not-claim-the-listing',
    '2c: an unclaimed listing has no referral or tracking link, no dashboard, no analytics, no badge and no ability to start a conversation. An invitation changes none of that',
    'service_role', null,
    format('select (owner_user_id is null and claimed_at is null and verified_at is null and claim_code is null) as r from public.builders where id = %L', v_b),
    'true',
    'recording an invitation altered the claim or verification state of the listing. Sending an email is not a company agreeing to anything');

  perform t.assert_scalar(
    'an-invitation-does-not-switch-tracking-on',
    '2c and decision 13: tracking activates on claim, never for an unclaimed listing',
    'service_role', null,
    format('select public.builder_tracking_active(b) as r from public.builders b where b.id = %L', v_b),
    'false',
    'an invited listing has tracking active, so ADUAtlas created a tracking relationship with a company that has not agreed to one');
end
$$;


-- =============================================================================
-- GROUP C — the forwarding lifecycle. Stamped once, never cleared, and only by
-- the write that actually forwarded it.
--
-- intro_requests.status has allowed 'sent' since 0004 and nothing ever set it.
-- Forwarding writes 'sent' and the date together. 0016 also stamped the date on
-- any status move to 'sent'; 0024 removed that arm (R3-06), because a manual
-- status change then claimed a delivery that never happened. The date is the
-- delivery fact and only the forward path writes it.
-- =============================================================================
do $$
declare
  v_b       uuid;
  v_home    uuid;
  v_hauth   uuid;
  v_intro   uuid;
  v_first   text;
  v_second  text;
  v_cleared text;
  v_msg     text := 'Corner lot in Gilbert, 1970s ranch, hoping for a 700 square foot detached unit.';
  v_ctl     jsonb;
  v_ctl_ok  boolean := false;
  v_intro2  uuid;
  v_cols    text[];
begin
  if not t.has_column('public.intro_requests', 'forwarded_at') then
    perform t.skip('control-forwarding-stamps-the-status-and-the-date',
      '2h: the record has to be able to say when it notified',
      'intro_requests.forwarded_at does not exist; migration 0016 is not applied to this database.');
    return;
  end if;

  v_b     := t.mk_builder();
  v_home  := t.mk_paid_homeowner('report');
  v_hauth := t.authid(v_home);
  perform t.x('authenticated', v_hauth,
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, %L)',
           v_home, v_b, v_msg));
  select id into v_intro from public.intro_requests where user_id = v_home and builder_id = v_b;

  -- ── THE POSITIVE CONTROL ─────────────────────────────────────────────────
  v_ctl := t.x('service_role', null,
    format('update public.intro_requests set status = ''sent'', forwarded_at = now() where id = %L', v_intro));
  v_ctl_ok := (v_ctl->>'ok')::boolean and (v_ctl->>'rowcount')::bigint = 1;
  select forwarded_at::text into v_first from public.intro_requests where id = v_intro;
  v_ctl_ok := v_ctl_ok and v_first is not null;

  perform t.assert(
    'control-forwarding-stamps-the-status-and-the-date',
    '2h: forwarding moves status to ''sent'' and stamps forwarded_at. One fact, recorded in both places it is read from',
    v_ctl_ok,
    format('forwarding an introduction as the service role left forwarded_at %L (%s). Every assertion below is about a stamp that was never made',
           coalesce(v_first, '<null>'), coalesce(v_ctl->>'error', 'no error')));

  if v_ctl_ok then
    perform t.assert_scalar(
      'a-forwarded-introduction-reads-sent',
      '0004''s status vocabulary already had ''sent''; forwarding is what it means',
      'service_role', null,
      format('select status from public.intro_requests where id = %L', v_intro),
      'sent',
      'a forwarded introduction does not read as sent, so the admin queue and the homeowner portal disagree about the same row');

    -- Forwarding twice. The second write asks for a DIFFERENT date on purpose, so
    -- a passing assertion cannot be an accident of clock resolution or of now()
    -- being frozen inside one transaction.
    perform t.x('service_role', null,
      format('update public.intro_requests set status = ''sent'', forwarded_at = now() + interval ''7 days'' where id = %L', v_intro));
    select forwarded_at::text into v_second from public.intro_requests where id = v_intro;

    perform t.assert(
      'forwarding-twice-keeps-the-first-timestamp',
      '2h: forwarded_at is when the introduction ACTUALLY reached the builder. A first-contact date a later caller can overwrite is not a record',
      v_second = v_first,
      format('a second forward moved forwarded_at from %L to %L. Re-sending a notification is allowed; losing the date the introduction was first delivered is not', v_first, v_second));

    perform t.assert_scalar(
      'forwarding-twice-does-not-double-stamp-the-row',
      '2h: one introduction, one delivery record. A second forward is a repeat notification, not a second introduction',
      'service_role', null,
      format('select count(*) from public.intro_requests where user_id = %L and builder_id = %L', v_home, v_b),
      '1',
      'forwarding twice produced more than one introduction row for the same homeowner and builder');

    -- Clearing it is not refused, it is IGNORED: the write is accepted and the
    -- date stands. A refusal would be equally correct and this assertion accepts
    -- either, because what must never happen is the row coming back null.
    perform t.x('service_role', null,
      format('update public.intro_requests set forwarded_at = null where id = %L', v_intro));
    select forwarded_at::text into v_cleared from public.intro_requests where id = v_intro;

    perform t.assert(
      'forwarded-at-cannot-be-cleared',
      '2h: a delivered introduction stays delivered. Clearing the date would let the record deny something that happened',
      v_cleared = v_first,
      format('forwarded_at went from %L to %L, so a delivered introduction can be made to look undelivered', v_first, coalesce(v_cleared, '<null>')));

    perform t.assert_scalar(
      'the-homeowners-message-survives-forwarding',
      'decision 8: what reaches the builder is the homeowner''s MESSAGE. It is the payload, so forwarding must not rewrite or drop it',
      'service_role', null,
      format('select message from public.intro_requests where id = %L', v_intro),
      v_msg,
      'forwarding changed the homeowner''s own words');

    perform t.assert_scalar(
      'the-homeowner-can-see-that-their-introduction-was-delivered',
      '2h: the ADUAtlas thread is the system of record. The homeowner must be able to stop reading "Introduction requested" for ever',
      'authenticated', v_hauth,
      format('select (forwarded_at is not null) as r from public.intro_requests where id = %L', v_intro),
      'true',
      'the homeowner cannot read the delivery date of their OWN introduction, so the portal has no way to tell them it was passed on');
  else
    perform t.skip('a-forwarded-introduction-reads-sent',
      '0004''s status vocabulary already had ''sent''; forwarding is what it means',
      'the positive control did not pass; there is no forwarded introduction to inspect.');
    perform t.skip('forwarding-twice-keeps-the-first-timestamp',
      '2h: forwarded_at is when the introduction actually reached the builder',
      'the positive control did not pass, so a stable timestamp cannot be told apart from a stamp that never happened.');
    perform t.skip('forwarding-twice-does-not-double-stamp-the-row',
      '2h: one introduction, one delivery record',
      'the positive control did not pass.');
    perform t.skip('forwarded-at-cannot-be-cleared',
      '2h: a delivered introduction stays delivered',
      'the positive control did not pass.');
    perform t.skip('the-homeowners-message-survives-forwarding',
      'decision 8: what reaches the builder is the homeowner''s message',
      'the positive control did not pass.');
    perform t.skip('the-homeowner-can-see-that-their-introduction-was-delivered',
      '2h: the ADUAtlas thread is the system of record',
      'the positive control did not pass.');
  end if;

  -- ── 'sent' and the date never disagree, and a status never makes a date ────
  -- 0016 closed "status sent with no date" by STAMPING a date on any move to
  -- 'sent'. That manufactured the very fact it meant to protect: at the RC3
  -- rehearsal (journeys j3 and j5) a manual "Introduction sent" in the console
  -- recorded a delivery nothing made, hid the Forward button and made the real
  -- forward answer 409 "already forwarded". Since 0024 only a write that STATES
  -- forwarded_at records one (the real forward path, after the mail left), and a
  -- status-only move into 'sent' is refused, so the two still never disagree and
  -- neither one is invented (2b, 2i: copy must never depend on an event the
  -- product cannot prove). 290 group G proves the rest of contract C2, including
  -- that the real forward still lands afterwards.
  v_home  := t.mk_paid_homeowner('report');
  v_hauth := t.authid(v_home);
  perform t.x('authenticated', v_hauth,
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, ''second homeowner, same builder'')',
           v_home, v_b));
  select id into v_intro2 from public.intro_requests where user_id = v_home and builder_id = v_b;

  perform t.x('service_role', null,
    format('update public.intro_requests set status = ''sent'' where id = %L', v_intro2));

  perform t.assert_scalar(
    'a-status-change-alone-records-no-delivery',
    'C2 (0024): forwarded_at means ADUAtlas actually forwarded the introduction, and status sent means the same. A manual status change is something an admin said, never proof the builder received it',
    'service_role', null,
    format('select (status <> ''sent'' and forwarded_at is null) as r from public.intro_requests where id = %L', v_intro2),
    'true',
    'after a status-only move to sent the row claims a delivery: either forwarded_at was stamped (R3-06: the record claims a delivery that never happened and the real forward is refused as already done) or the row reads sent with no delivery date behind it (2i)');

  -- ── no new status was invented for forwarding ────────────────────────────
  perform t.assert_denied(
    'forwarding-invents-no-new-status',
    '0004''s three statuses are the vocabulary. A fourth would split "delivered" across two spellings and break every reader',
    'service_role', null,
    format('update public.intro_requests set status = ''forwarded'' where id = %L', v_intro2),
    'intro_requests.status accepts a value outside (requested, sent, declined)');

  -- ── the forward carries a message, and the row has nothing else to leak ───
  -- Decision 8: contact details reach a builder only if the homeowner volunteers
  -- them, which means inside the message. If the row ever grew a homeowner email
  -- or name column, the forward would have something to leak whatever the email
  -- template says, so the schema is asserted and not just the template.
  select coalesce(array_agg(a.attname::text order by a.attname::text), '{}')
    into v_cols
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'intro_requests'
     and a.attnum > 0 and not a.attisdropped
     and (a.attname ~* 'email' or a.attname ~* 'phone'
          or a.attname ~* '(^|_)name$' or a.attname ~* 'contact');

  perform t.assert(
    'an-introduction-row-holds-no-homeowner-contact-detail',
    'decision 8: the homeowner''s contact details reach a builder ONLY if the homeowner volunteers them. The forwarded introduction carries their MESSAGE, never their email address or name',
    v_cols = '{}',
    format('intro_requests carries homeowner contact column(s) %s. The forward reads this row, so a column like that is a leak waiting for a template change, not a schema detail', v_cols::text));
end
$$;


-- =============================================================================
-- GROUP D — the introduction still belongs to exactly ONE homeowner and ONE
-- builder, and forwarding moves neither of them.
--
-- The cheapest way to break decision 8 is not a policy hole; it is a row whose
-- homeowner or builder changed on the way through, so a message is relayed to the
-- wrong company or attributed to the wrong person.
-- =============================================================================
do $$
declare
  v_b        uuid;
  v_b2       uuid;
  v_home     uuid;
  v_hauth    uuid;
  v_other    uuid;
  v_oauth    uuid;
  v_pro_auth uuid;
  v_intro    uuid;
  v_u_before uuid;
  v_b_before uuid;
  v_pc       jsonb;
  v_pc_ok    boolean := false;
begin
  if not t.has_column('public.intro_requests', 'forwarded_at') then
    perform t.skip('control-the-owning-homeowner-reads-its-own-introduction',
      'decision 8: one homeowner, one builder, one conversation',
      'intro_requests.forwarded_at does not exist; migration 0016 is not applied to this database.');
    return;
  end if;

  v_b2       := t.mk_claimed_builder();
  v_pro_auth := t.owner_authid(v_b2);
  v_b        := t.mk_builder();
  v_home     := t.mk_paid_homeowner('report');
  v_hauth    := t.authid(v_home);
  v_other    := t.mk_paid_homeowner('report');
  v_oauth    := t.authid(v_other);

  perform t.x('authenticated', v_hauth,
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, ''one homeowner, one builder'')',
           v_home, v_b));
  select id, user_id, builder_id into v_intro, v_u_before, v_b_before
    from public.intro_requests where user_id = v_home and builder_id = v_b;

  -- ── THE POSITIVE CONTROL ─────────────────────────────────────────────────
  v_pc := t.q('authenticated', v_hauth,
    format('select id from public.intro_requests where id = %L', v_intro));
  v_pc_ok := (v_pc->>'ok')::boolean and (v_pc->>'count')::int = 1;
  perform t.assert(
    'control-the-owning-homeowner-reads-its-own-introduction',
    'decision 8: the homeowner who started the conversation can see it. This is the control: the refusals below must be refusals of everyone ELSE',
    v_pc_ok,
    format('the homeowner who created the introduction cannot read it back (%s row(s), %s). Until this passes, "nobody else can see it" is satisfied by nobody seeing it at all',
           v_pc->>'count', coalesce(v_pc->>'error', 'no error')));

  perform t.assert(
    'both-sides-of-an-introduction-are-required',
    'decision 8: an introduction with no homeowner or no builder is not an introduction',
    (select bool_and(a.attnotnull)
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'intro_requests'
        and a.attname in ('user_id', 'builder_id')),
    'intro_requests.user_id or builder_id is nullable, so a row can exist with one side missing and a forward would have nowhere to go or nobody to credit');

  perform t.assert(
    'both-sides-of-an-introduction-are-real-records',
    'decision 8: the row points at one real homeowner and one real company',
    (select count(*) = 2
       from pg_constraint
      where conrelid = 'public.intro_requests'::regclass
        and contype = 'f'
        and confrelid in ('public.users'::regclass, 'public.builders'::regclass)),
    'intro_requests has lost a foreign key to users or builders, so an introduction can outlive the homeowner or the listing it names');

  perform t.assert_denied(
    'one-introduction-per-homeowner-and-builder',
    'decision 8: one conversation. A second row for the same pair would be a second "first message" and a second forward',
    'authenticated', v_hauth,
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, ''again'')', v_home, v_b),
    'the same homeowner can create a second introduction request against the same builder');

  -- ── forwarding does not move the row ─────────────────────────────────────
  perform t.x('service_role', null,
    format('update public.intro_requests set status = ''sent'', forwarded_at = now() where id = %L', v_intro));

  perform t.assert_scalar(
    'forwarding-does-not-move-the-introduction',
    'decision 8: ADUAtlas relays the message the homeowner wrote to the company they chose',
    'service_role', null,
    format('select (user_id = %L and builder_id = %L) as r from public.intro_requests where id = %L',
           v_u_before, v_b_before, v_intro),
    'true',
    'forwarding changed which homeowner or which builder the introduction belongs to, so a message was relayed to the wrong company or credited to the wrong person');

  -- ── and nobody else is a party to it ─────────────────────────────────────
  if v_pc_ok then
    perform t.assert_count(
      'another-homeowner-is-not-a-party-to-the-introduction',
      '2h: a conversation is two parties'' private correspondence',
      'authenticated', v_oauth,
      format('select 1 from public.intro_requests where id = %L', v_intro),
      0,
      'another paying homeowner can read this introduction, including when it was delivered');

    perform t.assert_count(
      'a-builder-account-cannot-read-the-introduction-it-received',
      'decision 8 and 2h: builders never browse homeowners, and the ADUAtlas thread is the system of record. Email notifies; it does not open the database',
      'authenticated', v_pro_auth,
      format('select 1 from public.intro_requests where id = %L', v_intro),
      0,
      'a builder account can read intro_requests, which is the homeowner list ADUAtlas is supposed to be relaying by hand');

    -- assert_denied and not assert_count: anon holds no grant on the table at all,
    -- so the read is refused rather than filtered, and 42703 on a withheld column
    -- counts as a refusal too (see t.is_broken_test).
    perform t.assert_denied(
      'anon-is-not-a-party-to-the-introduction',
      '2k: the anon key ships in the frontend bundle',
      'anon', null,
      format('select forwarded_at from public.intro_requests where id = %L', v_intro),
      'an anonymous caller can read introduction requests and when they were delivered');
  else
    perform t.skip('another-homeowner-is-not-a-party-to-the-introduction',
      '2h: a conversation is two parties'' private correspondence',
      'the positive control did not pass; an empty result cannot be told apart from a table nobody can read.');
    perform t.skip('a-builder-account-cannot-read-the-introduction-it-received',
      'decision 8 and 2h: builders never browse homeowners',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('anon-is-not-a-party-to-the-introduction',
      '2k: the anon key ships in the frontend bundle',
      'the positive control did not pass; a denial here would not be evidence.');
  end if;
end
$$;
