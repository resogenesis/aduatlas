-- =============================================================================
-- INVARIANT (decision 2a): AN INDIVIDUAL BUILDER PROFILE IS PUBLIC. THE
-- DIRECTORY AS A WHOLE IS NEVER PUBLICLY BROWSABLE.
--
-- Two sentences from one decision, and the product needs BOTH of them to be true
-- at the database, because the browser is never trusted to enforce permission
-- (2k). A grant that hands anon the profile view as a SET satisfies the first
-- sentence and breaks the second: one request with no filter returns every
-- company ADUAtlas has compiled, and `select count(*)`, `where state = 'AZ'` and
-- `where slug like 'a%'` turn it into a searchable roster. That is the paid
-- product, read with the key that ships in the frontend bundle.
--
-- WHY THIS FILE EXISTS RATHER THAN A LINE IN 130. 130 pins the COLUMNS the public
-- profile view may expose, and it passed throughout: no column ever leaked. The
-- hole was never a column, it was the SHAPE OF THE READ, and no assertion
-- anywhere asked how many rows an anonymous caller could obtain at once. A suite
-- can be exactly right about what a row contains and never notice that anybody
-- can have all of them. src/pages/FindBuilder.jsx had already removed the roster
-- from the interface for this exact reason; the grant behind it stayed.
--
-- WHAT REPLACED IT. The row source is no longer anonymously readable, and one
-- profile comes back through a SECURITY DEFINER function that takes a slug and
-- returns at most one row. This file resolves that function out of the catalogue
-- rather than hard-coding its name, the way the other suites resolve a concept to
-- the column that carries it: the invariant is "anon has exactly one way in and
-- it returns one profile", not the spelling `get_public_builder`.
--
-- ── WHY THE POSITIVE CONTROL COMES FIRST ────────────────────────────────────
-- Every assertion about the set is a refusal, and a refusal is indistinguishable
-- from a crashed query, a dropped view or a feature nobody can use. Revoking
-- anon's access to the profile view and stopping there would make every negative
-- assertion in this file pass while every builder profile page on the internet
-- returned nothing, which is 2a's FIRST sentence broken to satisfy its second.
-- So each group proves the legitimate read works before it proves the illegitimate
-- one does not: anon reads one profile by slug; a paid homeowner reads the
-- directory; anon reads the published regulatory surface. Where a control does not
-- pass, the refusals it underwrites are recorded as SKIPS carrying the database's
-- own error, because a denial that cannot be told apart from a dead feature is not
-- evidence. This codebase has already produced one RLS infinite-recursion bug
-- (0012, PART 3) that made every read of a table fail and that a negative test
-- would have reported as green.
--
-- The `t.reg_unseen` probe below is defined IDENTICALLY in 180_regulatory.sql and
-- 190_government_accounts.sql and is duplicated rather than put in helpers/
-- because every invariant file has to run standalone and in any order;
-- `create or replace` makes the second definition a no-op. The reasoning is
-- written out at the top of 180.
-- =============================================================================
select t.suite('210 anon directory boundary (2a)');

-- The read-side counterpart of t.assert_changes_nothing: the role must SEE
-- nothing, whether because it was refused or because a view or policy filtered
-- every row. Both are correct outcomes; a typo in the test's own SQL is not, and
-- is reported as a broken test rather than as a green one.
create or replace function t.reg_unseen(
  p_name text, p_rule text, p_role text, p_uid uuid, p_sql text, p_detail text default null
)
returns void
language plpgsql
as $fn$
declare
  v jsonb := t.q(p_role, p_uid, p_sql);
begin
  if not (v->>'ok')::boolean and t.is_broken_test(v->>'sqlstate') then
    perform t.record(p_name, p_rule, 'fail',
      format('THE TEST IS BROKEN, not the product: the query failed with %s (%s). Fix the test before trusting this assertion.',
             v->>'sqlstate', v->>'error'));
  elsif not (v->>'ok')::boolean then
    perform t.record(p_name, p_rule, 'pass', null);
  elsif (v->>'count')::int <> 0 then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      format('the role saw %s row(s); it must see none', v->>'count'));
  else
    perform t.record(p_name, p_rule, 'pass', null);
  end if;
end
$fn$;

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

-- Every relation in schema public that the ANON role can read, insert, update or
-- delete through any privilege, table-level or column-level. The whole anonymous
-- attack surface of the database in one array, which is the only honest way to
-- assert "and nothing more".
create or replace function t.anon_relations()
returns text[]
language sql
stable
as $fn$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and (has_any_column_privilege('anon', c.oid, 'select')
          or has_table_privilege('anon', c.oid, 'insert')
          or has_table_privilege('anon', c.oid, 'update')
          or has_table_privilege('anon', c.oid, 'delete'));
$fn$;


-- =============================================================================
-- GROUPS A AND B — the builder profile: one is public, the set is not (A), and
-- the paid directory is still the paid directory (B). One block, because B's
-- assertions read the same listing A's do and the two boundaries are the two
-- halves of the same sentence in 2a.
-- =============================================================================
do $$
declare
  v_fn      text := t.pub_profile_fn();
  v_b       uuid;
  v_slug    text;
  v_code    text;
  v_ref     text;
  v_email   text;
  v_phone   text;
  v_paid    uuid;
  v_free    uuid;
  v_payload text;
  v_pc      jsonb;
  v_pc_ok   boolean := false;
  v_probe   text;
begin
  if not t.has_relation('public.builders_public_profile') then
    perform t.skip('control-anon-reads-one-builder-profile-by-slug',
      '2a: an individual builder profile page is public and indexable',
      'public.builders_public_profile does not exist; migration 0007 is not applied to this database.');
    perform t.skip('anon-cannot-select-the-profile-view-as-a-set',
      '2a: the directory as a whole is never publicly browsable',
      'public.builders_public_profile does not exist.');
    return;
  end if;

  -- A listing with every private value this test needs to look for, put in the
  -- way production puts one in: seeded, approved, active, and with a claim code
  -- issued the way the admin route issues one.
  v_b    := t.mk_builder('{"state": "AZ", "city": "Phoenix"}'::jsonb);
  v_code := t.issue_claim_code(v_b);
  select slug, referral_code, contact_email::text, contact_phone
    into v_slug, v_ref, v_email, v_phone
    from public.builders where id = v_b;

  -- ── THE POSITIVE CONTROL ─────────────────────────────────────────────────
  if v_fn is null then
    perform t.assert(
      'control-anon-reads-one-builder-profile-by-slug',
      '2a: an individual builder profile page IS public and indexable. A visitor who has not paid, and a crawler, may read one company''s profile',
      false,
      'no anon-executable function in schema public takes a single text argument and is named for a builder profile, so an anonymous visitor has no way to read one profile. 2a has two halves and this is the first one: the profile page is public and indexable. The set must not be readable, and a single profile must be. Either the accessor is missing, or it is named in a way this probe cannot recognise — it looks for a function whose name contains "builder" and one of "profile", "public" or "slug".');
  else
    v_pc := t.q('anon', null, format('select * from %s(%L)', v_fn, v_slug));
    v_pc_ok := (v_pc->>'ok')::boolean and (v_pc->>'count')::int = 1;
    perform t.assert(
      'control-anon-reads-one-builder-profile-by-slug',
      '2a: an individual builder profile page IS public and indexable, so an anonymous visitor reads exactly one company''s profile through the intended function',
      v_pc_ok,
      format('%s(%L) returned %s row(s) for an approved, active listing as anon (%s); it must return exactly one. Until this passes, every refusal below is indistinguishable from an anonymous visitor being locked out of the public profile page altogether, which is the half of 2a that makes builder profiles indexable.',
             v_fn, v_slug, v_pc->>'count', coalesce(v_pc->>'error', 'no error')));

    -- The accessor is the anon-safe view's own row, so it may carry no private
    -- value. Asserted on the VALUES rather than the column names: a function is
    -- free to change shape, and what must never come back is the claim code that
    -- hands over a listing, the referral code, or the contact details 2d gates.
    if v_pc_ok then
      v_payload := (v_pc->'rows')::text;
      perform t.assert(
        'the-single-profile-accessor-leaks-no-private-value',
        '2a: a public profile may never show claim codes, referral or tracking information, internal verification data, analytics, homeowner information, or private contact and conversation details. 2d: an anonymous visitor never gains contact details, whether or not the listing is claimed',
        position(v_code  in v_payload) = 0
          and position(v_ref   in v_payload) = 0
          and position(v_email in v_payload) = 0
          and position(v_phone in v_payload) = 0,
        format('the anonymous single-profile read returned a private value. claim code present: %s, referral code present: %s, contact email present: %s, contact phone present: %s. The accessor exists so anon can read ONE row of the anon-safe view; selecting from the table instead would hand a crawler the credential that claims the listing.',
               position(v_code in v_payload) > 0, position(v_ref in v_payload) > 0,
               position(v_email in v_payload) > 0, position(v_phone in v_payload) > 0));
    else
      perform t.skip('the-single-profile-accessor-leaks-no-private-value',
        '2a: a public profile may never show claim codes, referral or tracking information or private contact details',
        'the positive control did not pass, so there is no anonymous profile payload to inspect.');
    end if;
  end if;

  -- ── the set, four ways ───────────────────────────────────────────────────
  -- These run whether or not the control passed. A refusal here cannot be a false
  -- pass in the dangerous direction — if anon is locked out of everything, the
  -- control above says so in the same run — and the set read is the finding this
  -- file was written for, so it is never reported as a skip.
  perform t.assert_denied(
    'anon-cannot-select-the-profile-view-as-a-set',
    '2a: the directory as a whole is never publicly browsable. A public profile is one page; the roster is the paid product',
    'anon', null,
    'select id, slug, name from public.builders_public_profile',
    'an anonymous caller reads the whole builder profile view in one request. Every company ADUAtlas has compiled, in one response, with the key that ships in the frontend bundle. The interface having no roster page is not a boundary: PostgREST answers this query without one');

  perform t.assert_denied(
    'anon-cannot-count-the-profile-view',
    '2a: the directory as a whole is never publicly browsable, and its SIZE is part of the directory',
    'anon', null,
    'select count(*) as n from public.builders_public_profile',
    'an anonymous caller can count the builder directory. How many companies ADUAtlas has in a market is commercial information about the marketplace, and a count is also the cheapest way to confirm a full extraction succeeded');

  perform t.assert_denied(
    'anon-cannot-filter-the-profile-view-by-state',
    '2a: searching and filtering the directory by state and service area is part of a plan',
    'anon', null,
    'select slug from public.builders_public_profile where state = ''AZ''',
    'an anonymous caller can filter the directory by state, which is the paid search feature answered for free. "Organized by area" is what the paid directory sells');

  perform t.assert_denied(
    'anon-cannot-enumerate-the-profile-view-by-slug-prefix',
    '2a: reading ONE profile by slug is not the same as searching slugs. An accessor that takes a slug must not be reachable as a pattern',
    'anon', null,
    'select slug from public.builders_public_profile where slug like ''a%''',
    'an anonymous caller can walk the directory a prefix at a time. A boundary that stops `select *` and allows `like` has not stopped anything: twenty-six requests reconstruct the roster');

  perform t.assert_denied(
    'anon-still-cannot-read-the-builders-table',
    '2a and 2d: the anon-safe view is the only anonymous route, and the table behind it holds the claim codes',
    'anon', null,
    'select id from public.builders',
    'the anon role has a select grant on public.builders, which bypasses every column decision made in the public views');

  -- ── GROUP B: the paid directory is still the paid directory ──────────────
  v_paid := t.mk_paid_homeowner('report');
  v_free := t.mk_account('homeowner');

  perform t.assert_count(
    'control-a-paid-homeowner-reads-the-directory',
    '2a: the paid account keeps search, filters, saving, richer builder information, recommendations, messaging and introductions. This is the control: the refusals below must be refusals of the UNENTITLED, not of everybody',
    'authenticated', t.authid(v_paid),
    format('select id from public.builders_public where slug = %L', v_slug),
    1,
    'a live paying homeowner cannot read an approved, active listing in the paid directory, so the two refusals below prove only that the directory is broken for everyone');

  perform t.assert_denied(
    'anon-cannot-read-the-paid-directory',
    '2a: the directory as a whole is never publicly browsable',
    'anon', null,
    'select id, name from public.builders_public',
    'an anonymous caller reads the paid homeowner directory, which carries the contact details 2d gates on the claim as well as every directory column');

  perform t.reg_unseen(
    'a-signed-in-free-account-sees-nothing-in-the-paid-directory',
    '2a: the paid account keeps the directory. Creating a free account is not a purchase, and signup is self-service',
    'authenticated', t.authid(v_free),
    format('select id from public.builders_public where slug = %L', v_slug),
    'a signed-in account with no live payment reads the paid directory. Anyone can create one in a minute, so a boundary that only stops anon stops nobody');

  perform t.assert_scalar(
    'a-signed-in-free-account-counts-nothing-in-the-paid-directory',
    '2a: the directory is not browsable by an unentitled account, and its size is part of the directory',
    'authenticated', t.authid(v_free),
    'select count(*)::text from public.builders_public',
    '0',
    'an unpaid signed-in account can count the paid directory. The view filters rows rather than refusing the statement, so the count is the assertion that the filter is total');

  -- ── the anonymous surface of the whole schema, pinned ────────────────────
  -- Written as a whole-list assertion for the reason 130 gives about the public
  -- view's columns: a list of absences passes when a relation nobody thought of is
  -- granted, and a pinned list fails on any addition and forces a human to decide
  -- whether it belongs on the public internet. Adding a relation anon can read is
  -- a decision, and this is the place it gets made.
  declare
    v_actual   text[] := t.anon_relations();
    v_expected text[] := array[
      -- 2l and 2m: the published regulatory surface. All of it is meant to be
      -- public, because the regulatory database stands on its own and is useful
      -- with no government account attached, which is the point.
      'jurisdictions_public',
      'jurisdiction_topic_coverage',
      'jurisdiction_coverage_public',
      'regulatory_provisions_public',
      'regulatory_provision_history_public',
      'government_resources_public',
      'regulatory_topics',
      'government_entities_public',
      -- 2p: the second axis, publicly. "ADUAtlas Education Partner", never
      -- "verified", one row per entity.
      'government_partnerships_public'
      -- builders_public_profile is deliberately ABSENT. The profile view is the
      -- right row for an anonymous visitor and the wrong SHAPE of read: anon
      -- reaches one profile through the by-slug function, and no anonymous read
      -- of the marketplace returns a set (2a).
    ];
    v_extra   text[];
    v_missing text[];
  begin
    select coalesce(array_agg(x order by x), '{}') into v_extra
      from unnest(v_actual) x where x <> all (v_expected);
    select coalesce(array_agg(x order by x), '{}') into v_missing
      from unnest(v_expected) x where x <> all (v_actual);

    perform t.assert(
      'the-anonymous-relation-list-is-the-published-surface-and-nothing-more',
      '2a and 2l: what is meant to be public is public, and nothing else in the schema is readable without an account',
      v_extra = '{}' and v_missing = '{}',
      format('the set of relations the anon role can reach changed. Unexpected: %s. Expected but unreachable: %s. An unexpected relation is published to the whole internet and to every crawler with the key in the frontend bundle, so it is a decision and not a refactor: either it belongs on a public page and this list should be updated with the reason, or it is a leak. A missing one means something 2l intends to be public is no longer readable.',
             v_extra::text, v_missing::text));
  end;

  -- ── the anon role holds no write anywhere ───────────────────────────────
  declare
    v_writes text[];
  begin
    select coalesce(array_agg(c.relname::text order by c.relname), '{}') into v_writes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'v', 'm', 'p', 'f')
       and (has_table_privilege('anon', c.oid, 'insert')
            or has_table_privilege('anon', c.oid, 'update')
            or has_table_privilege('anon', c.oid, 'delete')
            or has_any_column_privilege('anon', c.oid, 'insert')
            or has_any_column_privilege('anon', c.oid, 'update'));
    perform t.assert(
      'the-anon-role-can-write-nothing-at-all',
      '2k: the browser is never trusted to enforce permission. An anonymous visitor reads published pages and writes through the two RPCs that record a lead and a referral visit, never through a table grant',
      v_writes = '{}',
      format('the anon role holds an insert, update or delete privilege on %s. Every anonymous write in this product goes through a SECURITY DEFINER function that decides what may be written; a table grant decides nothing',
             v_writes::text));
  end;

  -- ── the featured strip is a teaser, not the roster ───────────────────────
  -- get_featured_builders() is the one anonymous read that legitimately returns
  -- several rows. It is a handful an admin chose, and it is capped in SQL.
  if t.has_function('public.get_featured_builders') then
    select substring(p.prosrc from 'limit\s+([0-9]+)') into v_probe
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_featured_builders';
    perform t.assert(
      'the-anonymous-featured-strip-stays-capped',
      '2a: the featured strip is a handful of profiles an admin chose, not the directory. A cap in SQL is the only thing that keeps it one',
      v_probe is not null and v_probe::int <= 12,
      format('public.get_featured_builders() has no LIMIT in its body (found %L). It is the only anonymous read that returns a set, so an uncapped one is the browsable directory arriving through the front door that was left open on purpose',
             coalesce(v_probe, '<none>')));
  else
    perform t.skip('the-anonymous-featured-strip-stays-capped',
      '2a: the featured strip is a teaser, not the directory',
      'public.get_featured_builders does not exist; migration 0004 is not applied to this database.');
  end if;
end
$$;


-- ── the government fixtures GROUP C needs ────────────────────────────────────
-- An exact copy of the helpers 190, 200 and 240 each define (byte-identical in
-- all three). This file used to call them WITHOUT defining them, so it only
-- worked because 190 and 200 happen to run first and leave them behind in the
-- same database. That broke the suite's own rule that files are independent of
-- each other and of their order, and it broke outright under run.sh --target,
-- where every file runs alone in its own rolled-back transaction.
create or replace function t.gov_jur(p_type text, p_parent uuid, p_name text, p_state text default null)
returns uuid
language plpgsql
as $fn$
declare
  v_id uuid;
begin
  if p_parent is null then
    select id into v_id from public.jurisdictions
     where state_code = p_state and jurisdiction_type = p_type limit 1;
    if v_id is not null then return v_id; end if;
    select id into p_parent from public.jurisdictions where jurisdiction_type = 'country' limit 1;
  end if;
  insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug, state_code, published_at)
  values (p_type, p_parent, p_name, p_name, t.nextlabel('gov-jur'), p_state, now())
  returning id into v_id;
  return v_id;
end
$fn$;

create or replace function t.gov_entity(p_jurisdiction uuid, p_type text, p_name text)
returns uuid
language plpgsql
as $fn$
declare v_id uuid;
begin
  insert into public.government_entities
    (name, entity_type, jurisdiction_id, official_website_url, official_domains, source_url)
  values (p_name || ' ' || t.nextlabel('ent'), p_type, p_jurisdiction,
          'https://www.example.gov/planning', array['example.gov'],
          'https://www.example.gov/planning')
  returning id into v_id;
  return v_id;
end
$fn$;

-- =============================================================================
-- GROUP C — the regulatory anonymous surface (2l)
--
-- The opposite decision from the marketplace, and asserted in the same file so
-- the two cannot be confused by whoever edits one of them next. 2l means this
-- data to be public: a homeowner chooses a state and a jurisdiction and sees what
-- ADUAtlas has, with links back to the authoritative government source, before
-- paying anything. What is NOT public is the workspace behind it — drafts,
-- submissions, internal notes, the claim and verification notes on an entity, the
-- grants, the version history and the audit log.
-- =============================================================================
do $$
declare
  v_state uuid; v_j_pub uuid; v_j_draft uuid;
  v_e     uuid;
  v_p_pub uuid; v_p_draft uuid; v_p_hidden uuid;
  v_ok    boolean := false;
  v_a jsonb; v_b jsonb; v_c jsonb;
  tbl text;
begin
  if not t.has_relation('public.jurisdictions_public')
     or not t.has_relation('public.regulatory_provisions_public') then
    perform t.skip('control-anon-reads-the-published-regulatory-surface',
      '2l: a homeowner can choose or search their state and jurisdiction and see what ADUAtlas has',
      'the public regulatory views do not exist; migration 0012 is not applied to this database.');
    perform t.skip('anon-cannot-read-the-regulatory-workspace',
      '2l: an anonymous or homeowner user can never modify a regulatory record, and unpublished records do not leak',
      'migration 0012 is not applied.');
    return;
  end if;

  -- A published jurisdiction with a published rule and a published resource, and
  -- an UNPUBLISHED jurisdiction beside it. Both are ADUAtlas's own research: no
  -- government account exists for either, which is the normal case (2m).
  v_state := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_j_pub := t.gov_jur('municipality', v_state, 'Publictown');

  insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug)
  values ('municipality', v_state, 'Draftville', 'Draftville', t.nextlabel('gov-jur'))
  returning id into v_j_draft;

  v_e := t.gov_entity(v_j_pub, 'city', 'Publictown Community Development');

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_j_pub, 'max_size', 'verified_from_source', '1000 sq ft',
          'https://www.example.gov/publictown/ordinance', 'Publictown ADU Ordinance', 'city_code',
          '2026-09-01', 'published', 'source_checked')
  returning id into v_p_pub;

  -- A DRAFT: ADUAtlas is still working on it. Nobody outside ADUAtlas may see it.
  insert into public.regulatory_provisions (jurisdiction_id, topic_key, review_status)
  values (v_j_pub, 'height_limit', 'draft')
  returning id into v_p_draft;

  -- A PUBLISHED rule on an UNPUBLISHED jurisdiction. The record is finished and
  -- the page it belongs to is not, so it must not reach a visitor through the
  -- rule view either: 2l says a jurisdiction page is indexable only where there
  -- is enough verified content to justify one, and that decision is made on the
  -- jurisdiction, not one rule at a time.
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_j_draft, 'max_size', 'verified_from_source', '750 sq ft',
          'https://www.example.gov/draftville/ordinance', 'Draftville Zoning Code', 'city_code',
          '2026-09-01', 'published', 'source_checked')
  returning id into v_p_hidden;

  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, label, url,
     source_url, source_type, source_checked_date, record_published_at,
     review_status, verification_status)
  values (v_j_pub, 'official_adu_page', 'verified_from_source',
          'Publictown ADU information', 'https://www.example.gov/publictown/adu',
          'https://www.example.gov/publictown/adu', 'planning_department',
          '2026-09-01', now(), 'published', 'source_checked');

  -- ── THE POSITIVE CONTROL ─────────────────────────────────────────────────
  -- Public means public. Asserted before anything is asserted to be hidden,
  -- because a regulatory surface that refuses everybody would make every
  -- assertion below pass while the feature ADUAtlas sells in seven places
  -- returned nothing to a visitor.
  v_a := t.q('anon', null, format('select id from public.jurisdictions_public where id = %L', v_j_pub));
  v_b := t.q('anon', null, format('select id from public.regulatory_provisions_public where id = %L', v_p_pub));
  v_c := t.q('anon', null, format('select 1 from public.government_resources_public where jurisdiction_id = %L', v_j_pub));
  v_ok := (v_a->>'ok')::boolean and (v_a->>'count')::int = 1
      and (v_b->>'ok')::boolean and (v_b->>'count')::int = 1
      and (v_c->>'ok')::boolean and (v_c->>'count')::int = 1;
  perform t.assert(
    'control-anon-reads-the-published-regulatory-surface',
    '2l: ADU Rules and Resources is public. A homeowner can choose or search their state and jurisdiction, see the verified rules and the official resources, and link back to the authoritative government source without an account',
    v_ok,
    format('an anonymous visitor cannot read a published jurisdiction, its published rule and its published official resource: jurisdiction %s row(s) (%s), rule %s row(s) (%s), resource %s row(s) (%s). Until this passes, every "does not leak" assertion below is indistinguishable from a regulatory feature nobody can read.',
           v_a->>'count', coalesce(v_a->>'error', 'ok'),
           v_b->>'count', coalesce(v_b->>'error', 'ok'),
           v_c->>'count', coalesce(v_c->>'error', 'ok')));

  perform t.assert_scalar(
    'control-anon-reads-an-entity-state-through-the-public-view',
    '2m: the three states reach the public surface, and an UNCLAIMED record says so plainly',
    'anon', null,
    format('select entity_state from public.government_entities_public where id = %L', v_e),
    'unclaimed',
    'an anonymous visitor cannot read the entity state ADUAtlas compiled from a city''s own public website, so the public page cannot say where the record came from');

  -- ── what 2l intends to be public is READABLE, not merely granted ─────────
  -- A grant is not access. A view whose body calls a SECURITY INVOKER function
  -- that touches a base table is granted to anon and refused to anon, and the
  -- pinned list in group A cannot tell the difference: it reads privileges, not
  -- outcomes. So every relation on that list is also queried AS ANON here. The
  -- two assertions together are the whole of "public means public, and nothing
  -- more": group A says which relations anon may reach, and this says each one
  -- actually answers.
  foreach tbl in array array[
    'jurisdictions_public',
    'jurisdiction_topic_coverage',
    'jurisdiction_coverage_public',
    'regulatory_provisions_public',
    'regulatory_provision_history_public',
    'government_resources_public',
    'regulatory_topics',
    'government_entities_public',
    'government_partnerships_public'
  ]
  loop
    if t.has_relation('public.' || tbl) then
      perform t.assert_ok(
        'anon-can-read-' || tbl,
        '2l: ADU Rules and Resources is public and nationwide. Every relation ADUAtlas publishes to an anonymous visitor must answer an anonymous query, not merely carry a grant',
        'anon', null,
        format('select * from public.%I limit 1', tbl),
        format('public.%s is granted to anon and refused to anon. A view that reads a base table through a SECURITY INVOKER function fails exactly this way, and the privilege list cannot see it', tbl));
    else
      perform t.skip('anon-can-read-' || tbl,
        '2l: what ADUAtlas publishes is readable without an account',
        format('public.%s does not exist; migration 0012 or 0014 is not applied to this database.', tbl));
    end if;
  end loop;

  if v_ok then
    -- ── drafts and unpublished pages do not leak ─────────────────────────
    perform t.reg_unseen(
      'an-unpublished-jurisdiction-does-not-leak-to-anon',
      '2l: unpublished records do not leak, and ADUAtlas does not generate thousands of thin pages carrying essentially no verified information',
      'anon', null,
      format('select id from public.jurisdictions_public where id = %L', v_j_draft),
      'an unpublished jurisdiction is readable anonymously, so a page ADUAtlas has not decided to publish is live');

    perform t.reg_unseen(
      'a-draft-rule-does-not-leak-to-anon',
      '2l: the page distinguishes verified from a source, the source did not state, and not yet researched. A draft is none of the three and is not an answer yet',
      'anon', null,
      format('select id from public.regulatory_provisions_public where id = %L', v_p_draft),
      'a DRAFT regulatory record is readable anonymously. A half-finished rule read as a published one is exactly the fabrication 2l forbids, and it would carry ADUAtlas''s name');

    perform t.reg_unseen(
      'a-published-rule-on-an-unpublished-jurisdiction-does-not-leak',
      '2l: a jurisdiction page is indexable where there is enough verified content to justify one, and that decision is made per jurisdiction',
      'anon', null,
      format('select id from public.regulatory_provisions_public where id = %L', v_p_hidden),
      'a finished rule attached to an unpublished jurisdiction reaches a visitor through the rule view, so publication can be bypassed one record at a time');
  else
    perform t.skip('an-unpublished-jurisdiction-does-not-leak-to-anon',
      '2l: unpublished records do not leak',
      'the positive control did not pass; an empty result cannot be told apart from a surface that returns nothing to anybody.');
    perform t.skip('a-draft-rule-does-not-leak-to-anon',
      '2l: a draft is not an answer yet',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('a-published-rule-on-an-unpublished-jurisdiction-does-not-leak',
      '2l: publication is decided per jurisdiction',
      'the positive control did not pass; a denial here would not be evidence.');
  end if;

  -- ── the workspace behind the public surface ─────────────────────────────
  -- Named one table at a time as well as covered by the pinned list in group A,
  -- so a failure says which table opened rather than only that the list changed.
  foreach tbl in array array[
    'jurisdictions', 'regulatory_provisions', 'government_resources',
    'government_entities', 'government_users', 'government_memberships',
    'government_jurisdiction_grants', 'regulatory_submissions'
  ]
  loop
    if t.has_relation('public.' || tbl) then
      perform t.assert_denied(
        'anon-cannot-read-' || tbl,
        '2l and 2m: the published views are the anonymous surface. The tables behind them hold drafts, internal notes, claim and verification notes, and who represents which government',
        'anon', null,
        format('select 1 from public.%I limit 1', tbl),
        format('the anon role can read public.%s directly, which is the whole workspace rather than what ADUAtlas decided to publish', tbl));
    else
      perform t.skip('anon-cannot-read-' || tbl,
        '2l and 2m: the published views are the anonymous surface',
        format('public.%s does not exist; migration 0012 is not applied to this database.', tbl));
    end if;
  end loop;

  -- The two append-only tables are withheld from EVERY api role, service_role
  -- included for writes, so anon is the least of it. Named here because history
  -- and the audit log are what a regulatory claim's provenance rests on (2m).
  foreach tbl in array array['regulatory_record_versions', 'regulatory_audit_log']
  loop
    if t.has_relation('public.' || tbl) then
      perform t.assert_denied(
        'anon-cannot-read-' || tbl,
        '2m: history is never overwritten, and who changed what is ADUAtlas''s record rather than a participant''s',
        'anon', null,
        format('select 1 from public.%I limit 1', tbl),
        format('the anon role can read public.%s, which is every previous version of every rule and every attempt to change one', tbl));
    else
      perform t.skip('anon-cannot-read-' || tbl,
        '2m: history is never overwritten',
        format('public.%s does not exist; migration 0012 is not applied to this database.', tbl));
    end if;
  end loop;

  -- ── and anon writes nothing regulatory ──────────────────────────────────
  perform t.assert_changes_nothing(
    'anon-cannot-modify-a-published-rule',
    '2l security: an anonymous or homeowner user can never modify a regulatory record, and publication and editing require server-side admin authorization',
    'anon', null,
    format('update public.regulatory_provisions set value_text = ''rewritten anonymously'' where id = %L', v_p_pub),
    'an anonymous caller can rewrite a published regulatory rule. ADUAtlas would be publishing, under its own name and with a government source cited beneath it, whatever a stranger typed');

  perform t.assert_changes_nothing(
    'anon-cannot-create-a-jurisdiction',
    '2l security: publication and editing require server-side admin authorization',
    'anon', null,
    format('insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug, published_at) values (''municipality'', %L, ''Anontown'', ''Anontown'', ''anontown-anon'', now())', v_state),
    'an anonymous caller can create a published jurisdiction page');

  perform t.assert_changes_nothing(
    'anon-cannot-claim-a-government-entity',
    '2o: claiming a government entity is a higher bar than creating an account, and an anonymous caller has not even created one',
    'anon', null,
    format('update public.government_entities set claimed_at = now() where id = %L', v_e),
    'an anonymous caller can mark a government entity claimed, so a city''s public page can be made to imply it takes part in ADUAtlas by somebody with no account at all');
end
$$;
