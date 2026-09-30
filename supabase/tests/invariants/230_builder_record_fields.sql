-- =============================================================================
-- INVARIANT: THE THREE BUILDER ATTRIBUTES 2f NAMES ARE RECORDABLE, AND AN
-- UNKNOWN ONE STAYS UNKNOWN.
--
-- Decision 2f lists what Amy maintains on a builder record, and three of those
-- attributes had no column at all until 0017: FACTUAL PROVENANCE, PRICING, and
-- RESIDENTIAL OR COMMERCIAL capability. 0017 adds six columns for them:
--
--   builders.source_urls         text[] not null default '{}'  the pages of the
--                                company's own site a fact came from
--   builders.sources_checked_on  date    when ADUAtlas last looked at them
--   builders.pricing_note        text    what the company itself publishes about
--                                what it charges a HOMEOWNER
--   builders.pricing_source_url  text    where that pricing claim came from
--   builders.serves_residential  boolean TRI-STATE: true / false / null
--   builders.serves_commercial   boolean TRI-STATE: true / false / null
--
-- FIVE WAYS THIS GOES WRONG, and this file proves all five.
--
--   A. THE COLUMNS EXIST IN THE SHAPE 2b REQUIRES. Six columns, and the two
--      tri-states nullable with NO DEFAULT. A `not null default false` on either
--      one would record "this company does not serve residential" against every
--      company in the directory — a claim nobody made — which is precisely the
--      defect 0008 had to undo across the whole table for turnkey (`default
--      false`) and build_approach (`default 'both'`). The shape is asserted from
--      the catalogue, not from a row, because a row can look right while the
--      column cannot hold the third state at all.
--   B. THE THIRD STATE IS REAL AND DISTINGUISHABLE. true, false AND null all
--      store, and null is not false BY QUERY: "we do not know" and "they told us
--      no" are different facts, and an interface that cannot tell them apart will
--      print one as the other.
--   C. PRICING IS RECORDED ONLY WHERE THE COMPANY ESTABLISHED IT. Never derived,
--      never estimated. If nothing is known the attribute is ABSENT — not 0, not
--      an empty string, not "contact for pricing" — and provenance is a link
--      somebody can check rather than free text.
--   D. NO CLIENT ROLE WRITES ANY OF THE SIX. 2f puts these three attributes in
--      Amy's hands, and her console writes with the service role after
--      api/_admin.js has authenticated her. A builder account that could write its
--      own pricing_note or serves_residential would be editing ADUAtlas's record
--      about itself through a surface 2f never gave it, and save_my_builder must
--      not become the side door.
--   E. THE CLIENT-SURFACE RULE, ASSERTED BOTH WAYS. 0017 decided that NONE of the
--      six reaches a browser in this pass — not an anonymous visitor, not a
--      signed-in free account, not a paying homeowner: 2a's list of what a public
--      profile may show is closed and names none of them while reserving "richer
--      builder information" for the paid account; 2d's sentence about pricing and
--      residential or commercial is about which LISTINGS may carry a fact, not
--      which AUDIENCE sees it; source_urls and sources_checked_on are ADUAtlas's
--      own research trail, the builder-side analogue of the
--      government_entities.source_url that 0015 keeps out of the public entity
--      view; and 130_view_column_boundary.sql is where adding a column to a public
--      view is supposed to be decided. So this file asserts the rule in BOTH
--      DIRECTIONS — the values are on the record and readable by the service role
--      Amy's console uses, AND they are on no relation either client role can
--      read, in no public accessor's signature, in no anonymous payload and in no
--      column the paid directory or the profile view hands a signed-in account. A
--      one-directional version of this test would pass just as happily against six
--      columns nobody can write, and an anon-only version passes against a leak
--      into builders_public_profile, which is how the mutation test found that the
--      first draft of this group was too narrow.
--
-- ── WHY EVERY GROUP OPENS WITH A POSITIVE CONTROL ───────────────────────────
-- Most of what this file asserts is a REFUSAL or an ABSENCE, and both are
-- indistinguishable from a column that does not exist, a query that crashed, or a
-- feature nobody can use. Not adding the columns at all would make nearly every
-- negative assertion here pass while Amy still had nowhere to put a price — the
-- exact gap 0017 exists to close, reported as green. So each group first proves
-- that the LEGITIMATE write or read works, and where the control does not pass,
-- the assertions it underwrites are recorded as SKIPS carrying the database's own
-- error, because a denial that cannot be told apart from a dead feature is not
-- evidence. The reasoning is written out at the top of 220.
--
-- t.pub_profile_fn() below is defined IDENTICALLY in 210_anon_directory_boundary
-- .sql and 220_builder_outreach.sql, and duplicated rather than moved into
-- helpers/ because every invariant file has to run standalone and in any order;
-- `create or replace` makes the later definition a no-op.
-- =============================================================================
select t.suite('230 builder record fields (2f, 2b, 2a)');

-- THE ONE ANONYMOUS WAY INTO A BUILDER PROFILE, resolved from the catalogue: a
-- function in schema public that anon may execute, takes a single text-shaped
-- argument (the slug) and is named for a builder profile. Asked rather than
-- assumed, so renaming the accessor is a rename and not a broken suite.
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

-- Every relation in schema public carrying a column of this name that a CLIENT
-- ROLE may SELECT, table-level privilege or column-level, tagged with the role.
-- The honest way to assert "and it appears on no client surface": it asks the
-- catalogue which surfaces exist rather than listing the ones somebody
-- remembered, so a future view that selects b.* is caught the day it is created.
--
-- BOTH CLIENT ROLES, not just anon, and finding that out is what a mutation test
-- is for. Adding four of these columns to builders_public_profile and rerunning
-- this file produced no failure at all while 130 caught it, because 0015 revoked
-- anon's grant on that view and deliberately LEFT the `authenticated` one ("a
-- signed-in free account can still read the view as a set... widening the fix
-- would be a product decision this file is not entitled to make"). So the surface
-- these columns must stay off is not "anonymous", it is "anything a browser
-- holds a key for": anon, a signed-in free account, and a paying homeowner.
--
-- None of the six names appears anywhere else in the schema (checked across every
-- migration before 0017), so a match here is always a builders-derived surface and
-- never a coincidence of naming.
create or replace function t.record_client_relations_with(p_column text)
returns text[]
language sql
stable
as $fn$
  select coalesce(array_agg(distinct c.relname::text || '[' || r || ']' order by c.relname::text || '[' || r || ']'), '{}')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    cross join unnest(array['anon', 'authenticated']) as r
   where n.nspname = 'public'
     and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and a.attname = p_column
     and a.attnum > 0
     and not a.attisdropped
     and has_column_privilege(r, c.oid, a.attnum::smallint, 'select');
$fn$;

-- A set-returning function's OUT columns, by name: its RETURN SIGNATURE. A column
-- can be withheld by a view and then handed straight back by the function in front
-- of it, which is the shape 0015 put anon behind.
create or replace function t.record_fn_argnames(p_fn text)
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

-- Does a client role hold ANY select privilege on this column of public.builders,
-- table-level or column-level? Homeowners and builders read the views; the table
-- grant has been revoked since 0006, and that revocation is what makes a column
-- added to this table unreachable from a browser the day it is created.
create or replace function t.record_client_can_read(p_column text)
returns boolean
language sql
stable
as $fn$
  select bool_or(has_column_privilege(r, c.oid, a.attnum::smallint, 'select'))
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    cross join unnest(array['anon', 'authenticated']) as r
   where n.nspname = 'public'
     and c.relname = 'builders'
     and a.attname = p_column
     and a.attnum > 0
     and not a.attisdropped;
$fn$;

-- Does a client role hold a WRITE privilege reaching this column of public.builders
-- — INSERT or UPDATE, table-level or column-level?
--
-- THIS ASSERTION EXISTS BECAUSE A MUTATION TEST EMBARRASSED THE ONE BELOW IT.
-- Granting `update on public.builders to authenticated, anon` produced ZERO
-- failures in this file: every `update ... where id = ...` denial still passed,
-- because naming `id` in a WHERE clause needs SELECT on `id`, which no client role
-- has had since 0006. So those denials were proving "no read", and the "no write"
-- half of the claim was resting on them. 210 caught the anon side of that mutation
-- and nothing caught the authenticated side. The catalogue is asked directly here,
-- so the claim this file makes about writes is a claim about the schema.
create or replace function t.record_client_can_write(p_column text)
returns text[]
language sql
stable
as $fn$
  select coalesce(array_agg(distinct priv || '[' || r || ']' order by priv || '[' || r || ']'), '{}')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    cross join unnest(array['anon', 'authenticated']) as r
    cross join unnest(array['insert', 'update']) as priv
   where n.nspname = 'public'
     and c.relname = 'builders'
     and a.attname = p_column
     and a.attnum > 0
     and not a.attisdropped
     and has_column_privilege(r, c.oid, a.attnum::smallint, priv);
$fn$;

-- The other half of a write path: a row policy a client role could ride. A grant
-- with no policy writes nothing on an RLS table and a policy with no grant is
-- unreachable, so the honest assertion is that NEITHER exists. A policy addressed
-- to the service role is not here to find: service_role bypasses RLS, which is why
-- Amy's console works without one.
create or replace function t.record_client_write_policies()
returns text[]
language sql
stable
as $fn$
  select coalesce(array_agg(distinct p.policyname::text || ' (' || p.cmd || ' to ' || array_to_string(p.roles, ',') || ')'
                            order by p.policyname::text || ' (' || p.cmd || ' to ' || array_to_string(p.roles, ',') || ')'), '{}')
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename = 'builders'
     and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and p.roles::text[] && array['anon', 'authenticated', 'public'];
$fn$;

-- The six columns, and the shape each one must have. One list, read by group A
-- and reused by group D's denial matrix and group E's surface probes, so there is
-- one place that says which columns this file is about.
create or replace function t.record_fields()
returns table (col text, typ text, is_notnull boolean, has_default boolean, writeval text, unknownsql text)
language sql
immutable
as $fn$
  select * from (values
    -- column,              type,      is_notnull, has_default, a value a forger would write,         "is unknown" predicate
    ('source_urls',        'text[]',   true,  true,  $w$array['https://forged.test/']$w$, $u$source_urls = '{}'::text[]$u$),
    ('sources_checked_on', 'date',     false, false, $w$'2026-01-01'::date$w$,             $u$sources_checked_on is null$u$),
    ('pricing_note',       'text',     false, false, $w$'forged: from $99,000'$w$,         $u$pricing_note is null$u$),
    ('pricing_source_url', 'text',     false, false, $w$'https://forged.test/pricing'$w$,  $u$pricing_source_url is null$u$),
    ('serves_residential', 'boolean',  false, false, $w$true$w$,                           $u$serves_residential is null$u$),
    ('serves_commercial',  'boolean',  false, false, $w$false$w$,                          $u$serves_commercial is null$u$)
  ) as v(col, typ, is_notnull, has_default, writeval, unknownsql);
$fn$;

-- All six present, or the migration is not applied and this file skips loudly.
create or replace function t.record_fields_present()
returns boolean
language sql
stable
as $fn$
  select bool_and(t.has_column('public.builders', col)) from t.record_fields();
$fn$;


-- =============================================================================
-- GROUP A — the six columns exist in the shape 2b requires, the service role can
-- write every one of them, and A NEW BUILDER STARTS UNKNOWN ON ALL THREE
-- ATTRIBUTES.
--
-- The shape assertions come from the catalogue rather than from a row: a
-- `not null default false` tri-state would still read `false` off a fresh row and
-- look fine, while being unable to hold "the company never stated it" at all.
-- That is the whole defect, so it is asserted as the column's own definition.
-- =============================================================================
do $$
declare
  r        record;
  v_b      uuid;
  v_fresh  uuid;
  v_ctl    jsonb;
  v_ctl_ok boolean := false;
  v_type   text;
  v_nn     boolean;
  v_def    boolean;
begin
  if not t.record_fields_present() then
    perform t.skip('control-service-role-records-the-three-attributes',
      '2f: builder management covers pricing, residential or commercial, and factual provenance',
      'the 0017 columns do not exist; migration 0017 is not applied to this database. Until it is, Amy has nowhere to record a price, a residential or commercial answer or a single source URL, and the 179 pages of company websites the Arizona research already read are discarded at import.');
    perform t.skip('a-new-builder-starts-unknown-on-all-three-attributes',
      '2b: unknown means unknown, and a new builder must default to unknown on all three',
      'the 0017 columns do not exist; migration 0017 is not applied to this database.');
    return;
  end if;

  v_b     := t.mk_builder('{"state": "AZ", "city": "Phoenix"}'::jsonb);
  v_fresh := t.mk_builder('{"state": "AZ", "city": "Mesa"}'::jsonb);

  -- ── each column's own definition ─────────────────────────────────────────
  for r in select * from t.record_fields() loop
    select format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasdef
      into v_type, v_nn, v_def
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'builders' and a.attname = r.col;

    perform t.assert(
      'column-shape-' || r.col,
      case when r.col like 'serves_%'
           then '2b: a capability is a TRI-STATE. Nullable with no default, because null must mean "the company never stated it" and false must mean "the company said No"'
           else '2f and 2b: the attribute has a column, and an unrecorded one holds nothing rather than a manufactured value'
      end,
      v_type = r.typ and v_nn = r.is_notnull and v_def = r.has_default,
      format('builders.%s is %s (not null = %s, default present = %s); it must be %s (not null = %s, default present = %s). %s',
             r.col, coalesce(v_type, 'MISSING'), v_nn, v_def, r.typ, r.is_notnull, r.has_default,
             case when r.col like 'serves_%'
                  then 'A NOT NULL boolean defaulting to false records "this company does not serve this market" against every company ADUAtlas seeds — a claim nobody made, and the exact defect 0008 had to undo across the whole table for turnkey and build_approach'
                  else 'A default on this column would be printed as a fact somebody established'
             end));
  end loop;

  -- ── a brand new builder is unknown on all three attributes ───────────────
  for r in select * from t.record_fields() loop
    perform t.assert_scalar(
      'new-builder-unknown-' || r.col,
      '2b: where the company''s own material did not state something, ADUAtlas does not know it, and a new builder defaults to unknown on all three attributes',
      'service_role', null,
      format('select (%s) as r from public.builders where id = %L', r.unknownsql, v_fresh),
      'true',
      format('a newly created builder already carries a value in %s that nobody established. Amy is never forced to fill a field because it exists (2f), so a field she has not filled must read as unknown', r.col));
  end loop;

  -- ── THE POSITIVE CONTROL: the service role records all six at once ───────
  -- One write, because that is how Amy's console saves a record, and because six
  -- columns that can only be written one at a time would still be a broken editor.
  v_ctl := t.x('service_role', null, format(
    $q$update public.builders set
         source_urls        = array['https://sources230.example.test/about', 'https://sources230.example.test/adu-pricing'],
         sources_checked_on = '2026-09-25'::date,
         pricing_note       = 'Casita plan sets from $4,800, as the company states on its own pricing page.',
         pricing_source_url = 'https://sources230.example.test/adu-pricing',
         serves_residential = true,
         serves_commercial  = false
       where id = %L$q$, v_b));
  v_ctl_ok := (v_ctl->>'ok')::boolean and (v_ctl->>'rowcount')::bigint = 1;

  perform t.assert(
    'control-service-role-records-the-three-attributes',
    '2f: can Amy safely maintain the builder records without a developer and without touching the database? Her console writes with the service role',
    v_ctl_ok,
    format('the service role could not record provenance, pricing and residential or commercial capability in one write (%s, %s row(s)). Until this passes, every refusal and every absence below is indistinguishable from six columns nobody can write, and 2f''s builder editor cannot exist',
           coalesce(v_ctl->>'error', 'no error'), v_ctl->>'rowcount'));

  if v_ctl_ok then
    perform t.assert_scalar(
      'provenance-reads-back',
      '2f: factual provenance. The evidence is stored, in order, and somebody can check it',
      'service_role', null,
      format($q$select (source_urls = array['https://sources230.example.test/about', 'https://sources230.example.test/adu-pricing']
                        and sources_checked_on = '2026-09-25'::date) as r
                 from public.builders where id = %L$q$, v_b),
      'true',
      'the provenance write was accepted and stored something else, so a recorded source cannot be trusted to be the source that was read');

    perform t.assert_scalar(
      'pricing-reads-back-with-its-source',
      '2f and 2l''s source standard applied to a builder fact: a recorded price keeps the page it came from',
      'service_role', null,
      format($q$select (pricing_note like 'Casita plan sets from $4,800%%'
                        and pricing_source_url = 'https://sources230.example.test/adu-pricing') as r
                 from public.builders where id = %L$q$, v_b),
      'true',
      'the pricing write was accepted and stored something else, or lost its source URL, which is how a price on a page stops being checkable');

    perform t.assert_scalar(
      'capability-reads-back-as-stated',
      '2b: true means the company said yes and false means the company said No. Both are answers and both must survive the round trip',
      'service_role', null,
      format('select (serves_residential is true and serves_commercial is false) as r from public.builders where id = %L', v_b),
      'true',
      'a stated Yes and a stated No did not both survive the write, so the record cannot represent what a company actually told us');
  else
    perform t.skip('provenance-reads-back',
      '2f: factual provenance is stored and checkable',
      'the positive control did not pass; there is nothing recorded to read back.');
    perform t.skip('pricing-reads-back-with-its-source',
      '2f: a recorded price keeps the page it came from',
      'the positive control did not pass; there is nothing recorded to read back.');
    perform t.skip('capability-reads-back-as-stated',
      '2b: a stated Yes and a stated No both survive the round trip',
      'the positive control did not pass; there is nothing recorded to read back.');
  end if;
end
$$;


-- =============================================================================
-- GROUP B — THE TRI-STATES HOLD THREE ANSWERS, AND NULL IS NOT FALSE.
--
-- 2b, in its own words: "ADUAtlas never infers a builder capability from a missing
-- field and never prints a column default as a claim. Where the company's own
-- material did not state something, the interface omits the attribute." The
-- database half of that is a column that can hold all three states and a query
-- that can still tell the last two apart afterwards. 84 of 96 Arizona companies
-- never addressed the scope they take on and NOT ONE OF THEM SAID NO; if unknown
-- and No are the same value, that sentence cannot be stored.
-- =============================================================================
do $$
declare
  c        text;
  v_b      uuid;
  v_yes    uuid;
  v_no     uuid;
  v_unk    uuid;
  v_ctl    jsonb;
  v_ctl_ok boolean;
begin
  if not t.record_fields_present() then
    perform t.skip('control-a-tri-state-accepts-a-stated-yes',
      '2b: a capability is a tri-state',
      'the 0017 columns do not exist; migration 0017 is not applied to this database.');
    return;
  end if;

  foreach c in array array['serves_residential', 'serves_commercial'] loop
    v_b := t.mk_builder();

    -- ── THE POSITIVE CONTROL: a stated Yes stores ─────────────────────────
    v_ctl := t.x('service_role', null,
      format('update public.builders set %I = true where id = %L', c, v_b));
    v_ctl_ok := (v_ctl->>'ok')::boolean and (v_ctl->>'rowcount')::bigint = 1;
    perform t.assert(
      'control-a-tri-state-accepts-a-stated-yes-' || c,
      '2f and 2b: Amy must be able to record what a company actually stated. This is the control: the three-state assertions below mean nothing if the column takes no value at all',
      v_ctl_ok,
      format('the service role could not set %s to true (%s). Every assertion about the third state below would pass against a column nobody can write', c, coalesce(v_ctl->>'error', 'no error')));

    if not v_ctl_ok then
      perform t.skip('tri-state-stores-yes-' || c, '2b: true means the company said yes',
        'the positive control did not pass; the column takes no value.');
      perform t.skip('tri-state-stores-no-' || c, '2b: false means the company said No',
        'the positive control did not pass; the column takes no value.');
      perform t.skip('tri-state-stores-unknown-' || c, '2b: null means the company never stated it',
        'the positive control did not pass; the column takes no value.');
      continue;
    end if;

    perform t.assert_scalar(
      'tri-state-stores-yes-' || c,
      '2b: true means the company stated Yes',
      'service_role', null,
      format('select (%I is true) as r from public.builders where id = %L', c, v_b),
      'true',
      format('%s was set to true and did not read back as true', c));

    perform t.assert_ok(
      'tri-state-accepts-no-' || c,
      '2b: false still means the company stated No, and the record must be able to say it',
      'service_role', null,
      format('update public.builders set %I = false where id = %L', c, v_b),
      format('%s refused a deliberate No, so "they told us no" cannot be recorded', c));

    perform t.assert_scalar(
      'tri-state-stores-no-' || c,
      '2b: false still means the company stated No',
      'service_role', null,
      format('select (%I is false) as r from public.builders where id = %L', c, v_b),
      'true',
      format('a deliberate No on %s was not stored as false', c));

    perform t.assert_ok(
      'tri-state-accepts-unknown-' || c,
      '2b: null is a legal value, and it means the company never stated it',
      'service_role', null,
      format('update public.builders set %I = null where id = %L', c, v_b),
      format('%s refused null, so "the company never stated it" has nowhere to live and every listing must assert something', c));

    perform t.assert_scalar(
      'tri-state-stores-unknown-' || c,
      '2b: null means the company never stated it, and it must survive being written on purpose',
      'service_role', null,
      format('select (%I is null) as r from public.builders where id = %L', c, v_b),
      'true',
      format('a deliberate "not stated" on %s was coalesced to something else, which is the 0006 turnkey bug 0008 exists to fix, on a new column', c));
  end loop;

  -- ── null is DISTINGUISHABLE FROM false BY QUERY ──────────────────────────
  -- Three listings, three states, one column. Three-valued logic is what keeps
  -- them apart, and the point of asserting it is that a filter must never sweep
  -- unknowns in with the Noes or with the Yeses.
  v_yes := t.mk_builder();
  v_no  := t.mk_builder();
  v_unk := t.mk_builder();
  perform t.x('service_role', null, format('update public.builders set serves_residential = true  where id = %L', v_yes));
  perform t.x('service_role', null, format('update public.builders set serves_residential = false where id = %L', v_no));

  perform t.assert_count(
    'residential-filter-matches-yes-only',
    '2b: a capability filter matches the stated Yes and nothing else. Unknown is not a match, and neither is No',
    'service_role', null,
    format('select 1 from public.builders where serves_residential and id in (%L, %L, %L)', v_yes, v_no, v_unk),
    1,
    'a residential filter matched more than the one listing that stated Yes, so an unknown or a No is being presented as a capability');

  perform t.assert_count(
    'stated-no-is-not-unknown',
    '2b: "they told us no" and "we do not know" are different facts and a query must be able to ask for one without getting the other',
    'service_role', null,
    format('select 1 from public.builders where serves_residential = false and id in (%L, %L, %L)', v_yes, v_no, v_unk),
    1,
    'a query for the companies that said No also returned the ones that never addressed it, so the two facts are stored as one and the interface cannot tell them apart');

  perform t.assert_count(
    'unknown-is-not-a-stated-no',
    '2b: where the company''s own material did not state something, the interface omits the attribute — which needs a query that finds exactly those rows',
    'service_role', null,
    format('select 1 from public.builders where serves_residential is null and id in (%L, %L, %L)', v_yes, v_no, v_unk),
    1,
    'a query for the unknowns returned the wrong number of rows, so "omit the attribute" cannot be implemented from the data');

  perform t.assert_count(
    'unknown-and-no-are-both-not-yes',
    '2b: neither a No nor an unknown may ever be offered as a capability, and they are still two different answers',
    'service_role', null,
    format('select 1 from public.builders where serves_residential is not true and id in (%L, %L, %L)', v_yes, v_no, v_unk),
    2,
    'the set of listings that did not state Yes is the wrong size');

  -- ── the two columns are independent ──────────────────────────────────────
  perform t.assert_scalar(
    'residential-answer-implies-nothing-about-commercial',
    '2b: ADUAtlas never infers a builder capability from a missing field. A company that stated residential said NOTHING about commercial by doing so',
    'service_role', null,
    format('select (serves_commercial is null) as r from public.builders where id = %L', v_yes),
    'true',
    'recording a residential answer also set serves_commercial, so one stated capability is manufacturing the other — an inference, and exactly what 2b forbids');
end
$$;


-- =============================================================================
-- GROUP C — PRICING AND PROVENANCE RECORD ONLY WHAT SOMEBODY ESTABLISHED.
--
-- 2b for money and evidence. "If nothing is known, the attribute is absent, not
-- zero and not 'contact for pricing'." A non-null empty string is the subtlest
-- version of that mistake: it passes a `is not null` test, renders as a price, and
-- was established by nobody. Provenance has the mirror-image failure — a source
-- that is not a link is not evidence, and 2l's standard for a regulatory claim
-- ("provenance is maintained so a claim cannot silently lose its source") is the
-- same standard read one step weaker for a builder fact.
-- =============================================================================
do $$
declare
  v_b      uuid;
  v_ctl    jsonb;
  v_ctl_ok boolean := false;
begin
  if not t.record_fields_present() then
    perform t.skip('control-service-role-records-an-established-price',
      '2f: pricing is part of what Amy maintains',
      'the 0017 columns do not exist; migration 0017 is not applied to this database.');
    return;
  end if;

  v_b := t.mk_builder();

  -- ── THE POSITIVE CONTROL ─────────────────────────────────────────────────
  v_ctl := t.x('service_role', null, format(
    $q$update public.builders
          set pricing_note       = 'Detached casitas from $180 per square foot, as published on the company''''s own pricing page.',
              pricing_source_url = 'https://pricing230.example.test/pricing'
        where id = %L$q$, v_b));
  v_ctl_ok := (v_ctl->>'ok')::boolean and (v_ctl->>'rowcount')::bigint = 1;
  perform t.assert(
    'control-service-role-records-an-established-price',
    '2f: pricing is one of the builder attributes Amy maintains, and a price a company published is a fact ADUAtlas may record',
    v_ctl_ok,
    format('the service role could not record an established price with its source (%s). Every refusal below would then be a refusal of the whole feature rather than of a manufactured value', coalesce(v_ctl->>'error', 'no error')));

  -- ── a blank is not an establishment ──────────────────────────────────────
  perform t.assert_denied(
    'blank-pricing-note-refused',
    '2b: if nothing is known the attribute is ABSENT, not an empty value that renders as a price nobody quoted',
    'service_role', null,
    format('update public.builders set pricing_note = '''' where id = %L', v_b),
    'an empty string was accepted into pricing_note. A form that posts a blank field would then create a non-null pricing attribute, and the interface would print an established price for a company that never stated one');

  perform t.assert_denied(
    'whitespace-pricing-note-refused',
    '2b: absent means absent. Whitespace is the same manufactured answer with the evidence trimmed off',
    'service_role', null,
    format('update public.builders set pricing_note = ''   '' where id = %L', v_b),
    'a whitespace-only pricing_note was accepted');

  perform t.assert_ok(
    'pricing-can-be-withdrawn-to-unknown',
    '2b and 2f: Amy is never forced to keep a value. A price that turns out not to be established goes back to unknown, not to zero',
    'service_role', null,
    format('update public.builders set pricing_note = null, pricing_source_url = null where id = %L', v_b),
    'a recorded price could not be cleared back to null, so a mistaken or withdrawn price can only be replaced by another claim');

  perform t.assert_scalar(
    'a-new-listing-has-no-price-at-all',
    '2b: no value is ever manufactured to make a record look complete. Absent is not 0 and not "contact for pricing"',
    'service_role', null,
    format('select (pricing_note is null and pricing_source_url is null) as r from public.builders where id = %L', t.mk_builder()),
    'true',
    'a newly created listing already carries a price or a pricing source, which is a claim about what a company charges that nobody made');

  -- ── a source is a link somebody can check ────────────────────────────────
  perform t.assert_denied(
    'pricing-source-must-be-a-link',
    '2f''s factual provenance and 2l''s source standard: a source is something a reader can open, not free text',
    'service_role', null,
    format('update public.builders set pricing_source_url = ''the company told us on the phone'' where id = %L', v_b),
    'pricing_source_url accepted a value that is not an absolute http(s) URL, so a recorded price can carry a "source" nobody can check');

  perform t.assert_ok(
    'source-urls-accepts-the-pages-that-were-read',
    '2f: factual provenance. The 179 pages the Arizona research already read have somewhere to live',
    'service_role', null,
    format($q$update public.builders set source_urls = array['https://sources230.example.test/', 'https://sources230.example.test/adu'] where id = %L$q$, v_b),
    'source_urls refused a list of pages from a company''s own site, which is the evidence the seed file has been discarding at import');

  perform t.assert_ok(
    'source-urls-accepts-empty-for-no-recorded-source',
    '2b: no source recorded is a legitimate state, and it is not a claim that none exists',
    'service_role', null,
    format('update public.builders set source_urls = ''{}''::text[] where id = %L', v_b),
    'source_urls refused the empty array, so a record with no researched source cannot exist and somebody will invent one');

  perform t.assert_denied(
    'source-urls-refuses-a-null-entry',
    '2f: every entry is evidence. A null inside the list is a source that is not there',
    'service_role', null,
    format($q$update public.builders set source_urls = array['https://sources230.example.test/', null] where id = %L$q$, v_b),
    'source_urls accepted a null entry');

  perform t.assert_denied(
    'source-urls-refuses-a-blank-entry',
    '2f: every entry is evidence. A blank string counts as a source while being none',
    'service_role', null,
    format($q$update public.builders set source_urls = array['https://sources230.example.test/', ''] where id = %L$q$, v_b),
    'source_urls accepted a blank entry, so a record can appear to have two sources and have one');

  perform t.assert_denied(
    'source-urls-refuses-something-that-is-not-a-link',
    '2f''s factual provenance: provenance that cannot be opened is a note, not a source',
    'service_role', null,
    format($q$update public.builders set source_urls = array['company website'] where id = %L$q$, v_b),
    'source_urls accepted a value that is not an absolute http(s) URL');

  -- ── the checked date is a date, and it may move forward ──────────────────
  perform t.assert_ok(
    'sources-checked-on-accepts-a-date',
    '2f: factual provenance includes WHEN ADUAtlas last looked at the sources',
    'service_role', null,
    format('update public.builders set sources_checked_on = ''2026-09-25''::date where id = %L', v_b),
    'sources_checked_on refused a date');

  perform t.assert_ok(
    'sources-checked-on-moves-forward-on-a-fresh-look',
    '2f and 2m''s date discipline: this is a LATEST-observation date, deliberately unlike builders.invited_at, which is a first-contact fact and cannot be moved',
    'service_role', null,
    format('update public.builders set sources_checked_on = ''2026-10-01''::date where id = %L', v_b),
    'sources_checked_on could not be updated, so ADUAtlas cannot record that it looked at a company''s site again');

  perform t.assert_scalar(
    'the-fresh-look-is-what-is-stored',
    '2f: "when did we last look" is the question this column answers, so the latest look is the answer',
    'service_role', null,
    format('select (sources_checked_on = ''2026-10-01''::date) as r from public.builders where id = %L', v_b),
    'true',
    'the later checked date was not stored');

  if not v_ctl_ok then
    perform t.record('pricing-group-control-note',
      '2f: pricing is part of what Amy maintains',
      'skip',
      'the positive control for recording a price did not pass, so the refusals in this group may be refusing the feature rather than the manufactured value.');
  end if;
end
$$;


-- =============================================================================
-- GROUP D — ONLY THE SERVICE ROLE WRITES ANY OF THE SIX.
--
-- 2f puts these three attributes in Amy's hands: "Builder management covers ...
-- turnkey, pricing, residential or commercial, description, media ... and factual
-- provenance." Her console authenticates her as an admin the way api/_admin.js
-- already does and then writes with the service key. Every client role is locked
-- out by the grants that already exist rather than by new policy — public.builders
-- has held no insert or update grant for anon or authenticated since 0006 — which
-- is what makes a column added to this table unreachable from a browser the day it
-- is created. That is a claim, so it is tested rather than assumed, including for
-- THE BUILDER ACCOUNT THAT OWNS THE ROW: owning a listing is not authority over
-- ADUAtlas's record of what the company established.
-- =============================================================================
do $$
declare
  r          record;
  v_b        uuid;
  v_own      uuid;
  v_pro_auth uuid;
  v_home     uuid;
  v_hauth    uuid;
  v_ctl      jsonb;
  v_ctl_ok   boolean := false;
  v_patch    jsonb;
begin
  if not t.record_fields_present() then
    perform t.skip('control-only-the-service-role-writes-the-record-fields',
      '2f: Amy maintains the builder record; her console writes with the service role',
      'the 0017 columns do not exist; migration 0017 is not applied to this database.');
    return;
  end if;

  v_b        := t.mk_builder();
  v_own      := t.mk_claimed_builder();
  v_pro_auth := t.owner_authid(v_own);
  v_home     := t.mk_paid_homeowner('report');
  v_hauth    := t.authid(v_home);

  -- ── THE POSITIVE CONTROL ─────────────────────────────────────────────────
  v_ctl := t.x('service_role', null,
    format('update public.builders set serves_residential = true, pricing_note = ''a recorded price'' where id = %L', v_b));
  v_ctl_ok := (v_ctl->>'ok')::boolean and (v_ctl->>'rowcount')::bigint = 1;
  perform t.assert(
    'control-only-the-service-role-writes-the-record-fields',
    '2f: the admin console is the one surface that maintains these attributes, and it must actually be able to',
    v_ctl_ok,
    format('the service role could not write the record fields (%s, %s row(s)). Every denial below is then indistinguishable from a column nobody can write at all',
           coalesce(v_ctl->>'error', 'no error'), v_ctl->>'rowcount'));

  if not v_ctl_ok then
    perform t.skip('client-roles-cannot-write-the-record-fields',
      '2k: the browser is never trusted to enforce permission',
      'the positive control did not pass, so a refusal proves nothing about the boundary.');
    return;
  end if;

  -- ── the denial matrix: six columns, four ways in ─────────────────────────
  for r in select * from t.record_fields() loop
    perform t.assert_denied(
      'builder-account-cannot-write-' || r.col,
      '2f: these attributes are ADUAtlas''s record of what a company established, maintained by the admin console. A builder writing them from a browser is a company editing ADUAtlas''s record of itself',
      'authenticated', v_pro_auth,
      format('update public.builders set %I = %s where id = %L', r.col, r.writeval, v_b),
      format('a builder account can write builders.%s on another company''s listing', r.col));

    perform t.assert_denied(
      'builder-account-cannot-write-on-its-own-listing-' || r.col,
      '2f and 2b: owning a listing is not authority over ADUAtlas''s record of what the company stated, or over the evidence behind it',
      'authenticated', v_pro_auth,
      format('update public.builders set %I = %s where id = %L', r.col, r.writeval, v_own),
      format('the owner of a listing can write builders.%s on its own row, so a company can publish a price or a capability ADUAtlas never established and a source URL nobody read', r.col));

    perform t.assert_denied(
      'homeowner-cannot-write-' || r.col,
      '2f: a homeowner reads the directory and maintains nothing in it',
      'authenticated', v_hauth,
      format('update public.builders set %I = %s where id = %L', r.col, r.writeval, v_b),
      format('a paying homeowner can write builders.%s', r.col));

    perform t.assert_denied(
      'anon-cannot-write-' || r.col,
      '2k: the browser is never trusted to enforce permission, and the anon key ships in the frontend bundle',
      'anon', null,
      format('update public.builders set %I = %s where id = %L', r.col, r.writeval, v_b),
      format('an anonymous caller can write builders.%s with the key that ships in the frontend bundle', r.col));

    -- THE PRIVILEGE ITSELF, asked of the catalogue. The four denials above each
    -- name `id` in a WHERE clause, so each one is also satisfied by the missing
    -- SELECT grant — proved by mutation: granting UPDATE on this table to both
    -- client roles left all four green. This is the assertion that fails for that.
    perform t.assert(
      'no-client-role-holds-a-write-privilege-on-' || r.col,
      '2f and 2k: these attributes are maintained by the admin console with the service role. A client role holding INSERT or UPDATE on the column is a write path whether or not a policy lets it through today',
      t.record_client_can_write(r.col) = '{}',
      format('a client role holds a write privilege on builders.%s: %s. public.builders has granted no insert or update to anon or authenticated since 0006, and that revocation is the whole reason a column added to this table is unreachable from a browser the day it is created', r.col, t.record_client_can_write(r.col)::text));
  end loop;

  -- And the other half of a write path, once for the table: no row policy a client
  -- role could ride if a grant ever reappeared.
  perform t.assert(
    'no-client-write-policy-on-the-builders-table',
    '2f and 2k: writes to a builder record happen through the admin API with the service role, which bypasses RLS. A client-facing write policy on this table would be a second way in',
    t.record_client_write_policies() = '{}',
    format('public.builders carries a write policy addressed to a client role: %s. The only policy this table has ever needed is the paid SELECT one from 0004 and 0006', t.record_client_write_policies()::text));

  -- ── save_my_builder is not a side door ───────────────────────────────────
  -- The builder portal writes through one function with a CLOSED column list, and
  -- 060 already proves an unrecognised key is ignored rather than fatal. So a
  -- patch naming all six must SUCCEED (the control: the portal still works and the
  -- test is not passing on a rejected call) and change none of them.
  v_patch := jsonb_build_object(
    'description',        'patched by the builder portal',
    'source_urls',        jsonb_build_array('https://forged230.example.test/'),
    'sources_checked_on', '2026-01-01',
    'pricing_note',       'forged: from $99,000',
    'pricing_source_url', 'https://forged230.example.test/pricing',
    'serves_residential', true,
    'serves_commercial',  true);

  perform t.assert_ok(
    'control-save-my-builder-still-accepts-a-patch',
    '2f: the builder portal keeps working. Without this, the six assertions below pass because the whole call was refused',
    'authenticated', v_pro_auth,
    format('select public.save_my_builder(%L::jsonb)', v_patch::text),
    'save_my_builder refused a patch containing the 0017 keys, so one stray key breaks the builder portal instead of being ignored');

  perform t.assert_scalar(
    'save-my-builder-did-write-what-the-builder-owns',
    '2f: the control, completed. The patch was processed, so the six unchanged columns below are a whitelist working rather than a call that never ran',
    'service_role', null,
    format('select (description = ''patched by the builder portal'') as r from public.builders where id = %L', v_own),
    'true',
    'the patch did not write the description either, so the call was accepted and did nothing and the six assertions below prove nothing');

  for r in select * from t.record_fields() loop
    perform t.assert_scalar(
      'save-my-builder-ignores-' || r.col,
      '2f: these three attributes are Amy''s, and save_my_builder writes a closed column list. A builder''s own answer arrives by asking her, not by patching',
      'service_role', null,
      format('select (%s) as r from public.builders where id = %L', r.unknownsql, v_own),
      'true',
      format('save_my_builder wrote builders.%s, so the builder portal is a side door into ADUAtlas''s own record of what a company established', r.col));
  end loop;
end
$$;


-- =============================================================================
-- GROUP E — THE PUBLIC-SURFACE RULE, ASSERTED BOTH WAYS.
--
-- 0017's decision: none of the six reaches an anonymous visitor or a paying
-- homeowner in this pass. The record HOLDS them and the SURFACES WITHHOLD them,
-- which is the same shape 130 states for the private columns: "withheld by the
-- view, never deleted from the record". Both halves are asserted here, because
-- each one alone is satisfied by a bug — six columns nobody can write would pass
-- every absence test, and a view carrying them would pass every storage test.
--
-- If a later pass does publish serves_residential, serves_commercial or
-- pricing_note, this group is where the decision gets recorded, together with the
-- 130 column list, a renderer that omits a null, and the rule 0008 paid for: the
-- null case must pass through AS NULL so the page can omit the attribute.
-- =============================================================================
do $$
declare
  r         record;
  v_fn      text := t.pub_profile_fn();
  v_b       uuid;
  v_slug    text;
  v_pc      jsonb;
  v_pc_ok   boolean := false;
  v_dir     jsonb;
  v_dir_ok  boolean := false;
  v_payload text;
  v_home    uuid;
  v_hauth   uuid;
  v_free    uuid;
  v_fauth   uuid;
  v_prof    jsonb;
  v_prof_ok boolean := false;
  v_rels    text[];
  v_names   text[];
begin
  if not t.record_fields_present() then
    perform t.skip('control-anon-reads-the-listings-public-profile',
      '2a: an individual builder profile page is public and indexable',
      'the 0017 columns do not exist; migration 0017 is not applied to this database.');
    return;
  end if;

  v_b := t.mk_builder('{"state": "AZ", "city": "Tucson"}'::jsonb);
  select slug into v_slug from public.builders where id = v_b;
  v_home  := t.mk_paid_homeowner('report');
  v_hauth := t.authid(v_home);
  v_free  := t.mk_account('homeowner');
  v_fauth := t.authid(v_free);

  -- Everything recorded, so an absence below is a withheld fact and not an empty
  -- column. The values are distinctive on purpose: the payload assertions search
  -- for them as text.
  perform t.x('service_role', null, format(
    $q$update public.builders set
         source_urls        = array['https://evidence230.example.test/about'],
         sources_checked_on = '2026-09-25'::date,
         pricing_note       = 'ZZPRICE230 from $212,000 turnkey',
         pricing_source_url = 'https://evidence230.example.test/pricing',
         serves_residential = true,
         serves_commercial  = false
       where id = %L$q$, v_b));

  -- ── CONTROL 1: the anonymous profile read still works ───────────────────
  if v_fn is null then
    perform t.assert(
      'control-anon-reads-the-listings-public-profile',
      '2a: an individual builder profile page IS public and indexable, so there is a public surface for these columns to leak onto',
      false,
      'no anon-executable function in schema public takes a single text argument and is named for a builder profile, so there is no anonymous profile read to inspect. Every "it does not show" assertion below would be vacuous.');
  else
    v_pc := t.q('anon', null, format('select * from %s(%L)', v_fn, v_slug));
    v_pc_ok := (v_pc->>'ok')::boolean and (v_pc->>'count')::int = 1;
    perform t.assert(
      'control-anon-reads-the-listings-public-profile',
      '2a: an individual builder profile page IS public and indexable. Recording a price or a capability does not take the page down, and it must not put anything new on it',
      v_pc_ok,
      format('%s(%L) returned %s row(s) as anon for an approved, active listing (%s); it must return exactly one. Until this passes, nothing can leak from a page nobody can read',
             v_fn, v_slug, v_pc->>'count', coalesce(v_pc->>'error', 'no error')));
  end if;

  -- ── CONTROL 2: the paid directory read still works ──────────────────────
  v_dir := t.q('authenticated', v_hauth, format('select id from public.builders_public where id = %L', v_b));
  v_dir_ok := (v_dir->>'ok')::boolean and (v_dir->>'count')::int = 1;
  perform t.assert(
    'control-a-paid-homeowner-reads-the-listing-in-the-directory',
    '2a: the paid account keeps search, filters and richer builder information. The directory must work for the column assertions below to mean anything',
    v_dir_ok,
    format('a paid homeowner read %s row(s) for an approved, active listing through builders_public (%s); it must be exactly one. Every "the directory does not carry it" assertion below would otherwise pass against a directory nobody can read',
           v_dir->>'count', coalesce(v_dir->>'error', 'no error')));

  -- ── CONTROL 3: the SIGNED-IN FREE account's read of the profile view ────
  -- 0015 revoked anon's grant on builders_public_profile and deliberately kept
  -- the `authenticated` one, so this view is the surface a free signed-in account
  -- reads as a SET. It is the one that a column added to the view reaches first,
  -- and the mutation test proved that probing anon alone misses it entirely.
  v_prof := t.q('authenticated', v_fauth, format('select id from public.builders_public_profile where id = %L', v_b));
  v_prof_ok := (v_prof->>'ok')::boolean and (v_prof->>'count')::int = 1;
  perform t.assert(
    'control-a-signed-in-free-account-reads-the-profile-view',
    '2a: an individual builder profile is public; 0015 kept builders_public_profile readable by every signed-in account and said so explicitly',
    v_prof_ok,
    format('a signed-in free account read %s row(s) from builders_public_profile for an approved, active listing (%s); it must be exactly one. Every "the profile view does not carry it" assertion below would otherwise pass against a view nobody can read',
           v_prof->>'count', coalesce(v_prof->>'error', 'no error')));

  -- ── the absences, per column ─────────────────────────────────────────────
  for r in select * from t.record_fields() loop
    v_rels := t.record_client_relations_with(r.col);
    perform t.assert(
      'no-client-readable-relation-carries-' || r.col,
      '2a: a public profile may show the company name, city and state and service area, builder category and type, ADU types the company''s own material supports, a short description, permitted imagery, the website and a call to action — a closed list that names none of these, while "richer builder information" belongs to the paid account',
      v_rels = '{}',
      format('a client role can select %s from: %s. Both roles are checked, because 0015 revoked anon''s grant on builders_public_profile and deliberately kept the `authenticated` one, so a column added to that view reaches every signed-in free account even though no crawler sees it. Publishing a price, a capability or ADUAtlas''s research trail is a decision that belongs at 130''s pinned column list, not a side effect of adding a column', r.col, v_rels::text));

    if v_dir_ok then
      perform t.assert_denied(
        'paid-directory-does-not-carry-' || r.col,
        '2a and 2d: 2d''s sentence about pricing and residential or commercial says which LISTINGS may carry a fact, not which AUDIENCE sees it. Publishing one is a separate decision, made at 130''s pinned list',
        'authenticated', v_hauth,
        format('select %I from public.builders_public where id = %L', r.col, v_b),
        format('builders_public exposes %s to a paying homeowner. If that is deliberate it belongs in 130''s pinned column list with a renderer that omits a null — the 0008 lesson is that a surface which turns unknown into an answer is how "No. Ask this builder about the scope they take on" got printed about companies that never said so', r.col));
    else
      perform t.skip('paid-directory-does-not-carry-' || r.col,
        '2a: the paid directory carries directory columns only',
        'the paid directory control did not pass, so a refusal here is not evidence about the column.');
    end if;

    if v_prof_ok then
      perform t.assert_denied(
        'profile-view-does-not-carry-' || r.col,
        '2a: the profile view is the set every signed-in account can read, free or paid. A column added there is published to the whole logged-in side of the product, which is not the gap 2f asked to close',
        'authenticated', v_fauth,
        format('select %I from public.builders_public_profile where id = %L', r.col, v_b),
        format('builders_public_profile exposes %s to a signed-in free account. This is the surface a probe of anon alone misses, because 0015 revoked anon''s grant on this view and kept the authenticated one', r.col));
    else
      perform t.skip('profile-view-does-not-carry-' || r.col,
        '2a: the profile view carries 2a''s closed list and nothing else',
        'the signed-in free account control did not pass, so a refusal here is not evidence about the column.');
    end if;

    perform t.assert(
      'no-client-role-can-read-the-table-column-' || r.col,
      '2f and 2k: homeowners and builders read the views. The table grant on public.builders has been revoked since 0006, which is what makes a column added to it unreachable from a browser the day it is created',
      coalesce(t.record_client_can_read(r.col), false) = false,
      format('anon or authenticated holds a select privilege on builders.%s, so every column decision made in the two views is bypassable by reading the table directly', r.col));
  end loop;

  -- ── the accessors' RETURN SIGNATURES ────────────────────────────────────
  if v_fn is not null then
    v_names := t.record_fn_argnames(v_fn);
    perform t.assert(
      'the-single-profile-accessors-signature-carries-none-of-the-six',
      '2a: a column withheld by the view and handed back by the function in front of it is not withheld. 0015 put the anonymous read behind this function, so its signature IS the public surface',
      not exists (select 1 from t.record_fields() f where f.col = any (v_names)),
      format('%s returns one of the 0017 columns: %s', v_fn, v_names::text));
  else
    perform t.skip('the-single-profile-accessors-signature-carries-none-of-the-six',
      '2a: the anonymous accessor''s return signature is a public surface',
      'no anon-executable single-profile function was found to inspect.');
  end if;

  v_names := t.record_fn_argnames('public.get_featured_builders');
  perform t.assert(
    'the-featured-teasers-signature-carries-none-of-the-six',
    '2a: the anonymous featured strip is a public surface like any other',
    not exists (select 1 from t.record_fields() f where f.col = any (v_names)),
    format('get_featured_builders returns one of the 0017 columns: %s', v_names::text));

  -- ── the anonymous PAYLOAD, by value ─────────────────────────────────────
  -- Stronger than a column-name check: a renderer could hand the same fact over
  -- under a different name, and a value search catches that.
  if v_pc_ok then
    v_payload := (v_pc->'rows')::text;

    perform t.assert(
      'the-public-payload-carries-no-price',
      '2a: the public list does not include what a company charges, and "richer builder information" is what the paid account keeps',
      position('ZZPRICE230' in v_payload) = 0,
      format('the anonymous profile payload contains the recorded pricing note. Payload: %s', left(v_payload, 400)));

    perform t.assert(
      'the-public-payload-carries-no-research-trail',
      '2a: internal verification data never appears on a public profile. source_urls and sources_checked_on are ADUAtlas''s own research trail — the builder-side analogue of the government_entities.source_url 0015 keeps out of the public entity view',
      position('evidence230.example.test' in v_payload) = 0
        and position('2026-09-25' in v_payload) = 0,
      format('the anonymous profile payload contains a source URL or the date ADUAtlas last checked one. Payload: %s', left(v_payload, 400)));

    perform t.assert(
      'the-public-payload-carries-no-capability-answer',
      '2a: residential or commercial capability is not on the public list, and a tri-state on a page that cannot omit a null is the 0008 defect waiting to happen again',
      position('serves_residential' in v_payload) = 0
        and position('serves_commercial' in v_payload) = 0,
      format('the anonymous profile payload names a capability column. Payload: %s', left(v_payload, 400)));

    perform t.assert(
      'the-listing-still-reads-unclaimed-and-unverified-in-public',
      '2a, 2c and 2e: the listing states stay distinct. Recording what ADUAtlas researched about a company is not the company joining ADUAtlas',
      v_payload like '%"claimed": false%' and v_payload like '%"verified": false%',
      format('a researched but unclaimed listing no longer reads as unclaimed and unverified to an anonymous visitor. Payload: %s', left(v_payload, 400)));
  else
    perform t.skip('the-public-payload-carries-no-price',
      '2a: the public list does not include what a company charges',
      'the anonymous read control did not pass, so there is no payload to inspect.');
    perform t.skip('the-public-payload-carries-no-research-trail',
      '2a: internal verification data never appears on a public profile',
      'the anonymous read control did not pass, so there is no payload to inspect.');
    perform t.skip('the-public-payload-carries-no-capability-answer',
      '2a: residential or commercial capability is not on the public list',
      'the anonymous read control did not pass, so there is no payload to inspect.');
    perform t.skip('the-listing-still-reads-unclaimed-and-unverified-in-public',
      '2a, 2c and 2e: the listing states stay distinct',
      'the anonymous read control did not pass, so there is no payload to inspect.');
  end if;

  -- ── AND NOW THE OTHER DIRECTION ─────────────────────────────────────────
  -- Withheld from those surfaces, never missing from the record. This is the half
  -- that fails if somebody "fixes" a leak by dropping a column, and the half that
  -- proves Amy's console — which reads the row with the service role — can still
  -- see everything the absences above are about.
  perform t.assert_scalar(
    'the-record-still-holds-every-one-of-the-six',
    '2f: withheld by the surface, never deleted from the record. Amy maintains this data in the admin console, and a leak is fixed by narrowing a view, never by dropping the column',
    'service_role', null,
    format($q$select (source_urls = array['https://evidence230.example.test/about']
                      and sources_checked_on = '2026-09-25'::date
                      and pricing_note = 'ZZPRICE230 from $212,000 turnkey'
                      and pricing_source_url = 'https://evidence230.example.test/pricing'
                      and serves_residential is true
                      and serves_commercial is false) as r
               from public.builders where id = %L$q$, v_b),
    'true',
    'the record does not hold back what the public surfaces withhold, so every absence asserted above may simply be six columns nothing can write — which is the gap 0017 exists to close, reported as green');

  for r in select * from t.record_fields() loop
    perform t.assert(
      'the-column-still-exists-on-the-record-' || r.col,
      '2f: private columns are WITHHELD by the view, never deleted from the record',
      t.has_column('public.builders', r.col),
      format('builders.%s no longer exists. Amy maintains this data in the admin console (2f); an exposure is fixed by narrowing the surface, never by dropping the column', r.col));
  end loop;
end
$$;
