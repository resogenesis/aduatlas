-- =============================================================================
-- INVARIANT (decisions 2l and 2m, migration 0012): ADU Rules and Resources is a
-- NATIONWIDE regulatory database whose data is filled in progressively, and the
-- thing it must never do is manufacture a value to make coverage look complete.
--
-- What this suite defends, in the order the file asserts it:
--
--   1. ALL FIFTY STATES EXIST STRUCTURALLY. "Nationwide from day one" is an
--      architectural claim, not a data claim, and it is only true if a homeowner
--      in Vermont reaches a real jurisdiction record rather than a 404. It is also
--      only honest if a state row can exist with NOTHING researched.
--   2. A PROVISION IS AN INDIVIDUAL SOURCED RULE, never one blob per city. It
--      keeps its jurisdiction, its source, and FOUR DISTINCT DATES.
--   3. THE FOUR DATES CANNOT BE CONFLATED. "Verified January 2025" and
--      "effective January 2026" mean opposite things. A single "last verified"
--      column is the dangerous design 2m explicitly rules out, so the four are
--      asserted to be four different columns holding four different values, and
--      the legal date is asserted NOT to move when ADUAtlas merely looks at the
--      source again.
--   4. THE THREE FIELD STATES ARE DISTINGUISHABLE BY QUERY: verified from
--      source, source did not state, not yet researched. The point of asserting
--      it in the database is that THE UI MUST NOT BE THE ONLY THING THAT KNOWS.
--      A schema that stored only "null" could not tell a homeowner whether the
--      city is silent or whether nobody has looked yet, and those are different
--      sentences on the page.
--   5. UNKNOWN STAYS UNKNOWN (2b applied to regulation). No default, no value
--      without a source, and no capability filter that sweeps unknowns in.
--   6. A DRAFT AND A SUBMISSION NEVER LEAK to anonymous or to a homeowner,
--      paying or not. A paid plan is not a review seat.
--   7. PUBLISHED HISTORY IS IMMUTABLE and the previous version survives a
--      publish, because 2m keeps BOTH what a government submitted AND what
--      ADUAtlas publishes rather than silently deciding which row disappears.
--   8. PROVENANCE CANNOT BE SILENTLY LOST from a claim.
--   9. A JURISDICTION WITH NO RESEARCH PRESENTS NO FABRICATED REQUIREMENT, and
--      knowing where a city publishes its rules is not knowing what they say.
--
-- Every assertion probes for its object first, so this file reports SKIP rather
-- than a false pass where migration 0012 is not applied. A skip is not a pass and
-- the runner lists it separately.
--
-- The matrix that attacks the government participation layer is suite 190.
-- =============================================================================
select t.suite('180 regulatory rules and resources (2l, 2m)');
-- ── the local schema probes ────────────────────────────────────────────────
-- These resolve a CONCEPT to the column that carries it, so an invariant about
-- four distinct dates is asserted as an invariant about four dates rather than
-- about the spelling "effective_date". They are defined IDENTICALLY in
-- 180_regulatory.sql and 190_government_accounts.sql rather than in helpers/,
-- because every invariant file has to run standalone and in any order (see the
-- README's "Adding a test"); `create or replace` makes the second definition a
-- no-op.

-- The first column of p_table matching the first pattern that matches anything.
-- Patterns are tried in order, so a specific spelling wins over a generic one.
create or replace function t.reg_col(p_table text, p_patterns text[])
returns text
language plpgsql
stable
as $fn$
declare
  p text;
  v text;
begin
  foreach p in array p_patterns loop
    select a.attname::text into v
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname || '.' || c.relname = p_table
       and a.attnum > 0 and not a.attisdropped
       and a.attname ~ p
     order by a.attnum
     limit 1;
    if v is not null then return v; end if;
  end loop;
  return null;
end
$fn$;

create or replace function t.reg_type(p_table text, p_column text)
returns text
language sql
stable
as $fn$
  select format_type(a.atttypid, a.atttypmod)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname || '.' || c.relname = p_table
     and a.attname = p_column and a.attnum > 0 and not a.attisdropped;
$fn$;

-- The table a foreign key points at, so a fixture can hand a column the id it
-- actually wants. The government layer legitimately models a PERSON in more than
-- one place — the ADUAtlas account, and the government profile of that account —
-- and which of the two a join carries is the schema's business, not this file's.
create or replace function t.reg_fk_target(p_table text, p_column text)
returns text
language sql
stable
as $fn$
  select fn.nspname || '.' || fc.relname
    from pg_constraint kf
    join pg_class fc      on fc.oid = kf.confrelid
    join pg_namespace fn  on fn.oid = fc.relnamespace
    join pg_attribute a   on a.attrelid = kf.conrelid and a.attnum = kf.conkey[1]
   where kf.conrelid = p_table::regclass and kf.contype = 'f' and a.attname = p_column
   limit 1;
$fn$;

-- The closed vocabulary of a column: its enum labels, the quoted tokens in its
-- own CHECK constraint, or — and this is the case that matters for the three
-- field states — the tokens in the CHECK on the DOMAIN it is declared as. Null
-- where the column is not constrained at all, which is itself something several
-- assertions here care about.
create or replace function t.reg_tokens(p_table text, p_column text)
returns text[]
language plpgsql
stable
as $fn$
declare
  v_rel oid;
  v_att smallint;
  v_typ oid;
  v_def text;
  v_out text[];
begin
  select a.attrelid, a.attnum, a.atttypid into v_rel, v_att, v_typ
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname || '.' || c.relname = p_table
     and a.attname = p_column and a.attnum > 0 and not a.attisdropped;
  if v_rel is null then return null; end if;

  select array_agg(e.enumlabel::text order by e.enumsortorder) into v_out
    from pg_enum e where e.enumtypid = v_typ;
  if v_out is not null then return v_out; end if;

  -- The column's OWN vocabulary check first. A multi-column check that happens to
  -- mention this column is a different statement — "a published rule is sourced"
  -- names review_status and four other columns — and reading its literals as the
  -- vocabulary would return one token out of six and quietly narrow every
  -- assertion built on it.
  select pg_get_constraintdef(k.oid) into v_def
    from pg_constraint k
   where k.conrelid = v_rel and k.contype = 'c' and k.conkey = array[v_att]::smallint[]
   order by length(pg_get_constraintdef(k.oid)) desc
   limit 1;

  if v_def is null then
    select pg_get_constraintdef(k.oid) into v_def
      from pg_constraint k
     where k.conrelid = v_rel and k.contype = 'c' and v_att = any (k.conkey)
     order by length(pg_get_constraintdef(k.oid)) desc
     limit 1;
  end if;

  if v_def is null then
    select pg_get_constraintdef(k.oid) into v_def
      from pg_constraint k
     where k.contypid = v_typ and k.contype = 'c'
     order by length(pg_get_constraintdef(k.oid)) desc
     limit 1;
  end if;
  if v_def is null then return null; end if;

  select array_agg(distinct m[1]) into v_out
    from regexp_matches(v_def, '''([^'']+)''', 'g') as r(m);
  return v_out;
end
$fn$;

-- The read-side counterpart of t.assert_changes_nothing: the role must SEE
-- nothing, whether because it was refused or because a policy filtered every
-- row. Both are correct outcomes for "a draft never leaks"; a typo in the test's
-- own SQL is not, and is reported as a broken test rather than as a green one.
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

-- The statement must be REFUSED even when ADUAtlas itself runs it, on the owner
-- connection rather than as an API role. This is the honest assertion for a guard
-- trigger or a check constraint that protects history from the people who
-- maintain it — "a published provision moves only to superseded or retracted",
-- "a published record is never deleted" — because an API-role denial would prove
-- only that the API role holds no grant.
create or replace function t.reg_refused(
  p_name text, p_rule text, p_sql text, p_detail text default null
)
returns void
language plpgsql
as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if t.is_broken_test(sqlstate) then
      perform t.record(p_name, p_rule, 'fail',
        format('THE TEST IS BROKEN, not the product: the statement failed with %s (%s). Fix the test before trusting this assertion.',
               sqlstate, sqlerrm));
    else
      perform t.record(p_name, p_rule, 'pass', null);
    end if;
    return;
  end;
  perform t.record(p_name, p_rule, 'fail',
    coalesce(p_detail || ' — ', '') ||
    'the statement SUCCEEDED on the owner connection; a guard trigger or a constraint must refuse it whoever runs it');
end
$fn$;


-- =============================================================================
-- PART 1 — the gate, the nationwide structure, the four dates, the three field
-- states, and unknown staying unknown.
-- =============================================================================
do $$
declare
  v_jt   text;   -- the jurisdiction type column
  v_js   text;   -- the state code column
  v_jp   text;   -- the parent column
  v_pj   text;   -- provision -> jurisdiction
  v_eff  text; v_chk text; v_pubd text; v_sup text;   -- the four dates
  v_fs   text; v_fs_toks text[];
  v_fs_verified text; v_fs_silent text; v_fs_unres text;
  v_val  text;
  v_us uuid; v_az uuid; v_county uuid; v_city uuid;
  v_p_dates uuid; v_p_ver uuid; v_p_sil uuid; v_p_unr uuid;
  v_missing text[];
  v_n int;
  v_col text;
begin
  -- ── the gate ──────────────────────────────────────────────────────────────
  if not t.has_relation('public.jurisdictions')
     or not t.has_relation('public.regulatory_provisions') then
    perform t.skip('fifty-states-structural',
      '2l: all fifty states are structurally supported from day one',
      'public.jurisdictions or public.regulatory_provisions does not exist. Migration 0012 is not applied to this database, so ADU Rules and Resources — a feature ADUAtlas already sells in seven places — has no schema behind it.');
    perform t.skip('provision-keeps-jurisdiction-and-source',
      '2m: a regulatory provision is an individual sourced rule, never one blob per city',
      'migration 0012 is not applied; public.regulatory_provisions does not exist.');
    perform t.skip('four-distinct-dates',
      '2m: effective, source-checked, published-or-updated and superseded are four different dates',
      'migration 0012 is not applied; the four dates cannot be asserted.');
    perform t.skip('dates-cannot-be-conflated',
      '2m: "verified January 2025" and "effective January 2026" must never read alike',
      'migration 0012 is not applied.');
    perform t.skip('field-state-distinguishable-by-query',
      '2m: verified from source, source did not state and not yet researched are distinguishable by QUERY, so the UI is not the only thing that knows',
      'migration 0012 is not applied.');
    perform t.skip('unknown-stays-unknown',
      '2b applied to regulation: no value is ever manufactured to make coverage look complete',
      'migration 0012 is not applied.');
    perform t.skip('draft-does-not-leak',
      '2l: unpublished records do not leak',
      'migration 0012 is not applied.');
    perform t.skip('submission-does-not-leak',
      '2m: a government submission is what a government proposed, not what ADUAtlas publishes',
      'migration 0012 is not applied.');
    perform t.skip('version-history-immutable',
      '2m: previous versions are retained immutably',
      'migration 0012 is not applied; public.regulatory_versions does not exist.');
    perform t.skip('provenance-not-silently-lost',
      '2l: provenance is maintained so a claim cannot silently lose its source',
      'migration 0012 is not applied.');
    perform t.skip('unresearched-jurisdiction-presents-nothing',
      '2l: an unresearched jurisdiction says so plainly and never presents a fabricated requirement',
      'migration 0012 is not applied.');
    perform t.skip('government-resources-are-first-class',
      '2m: a government resource is first class alongside rules — this is why the feature is Rules AND Resources',
      'migration 0012 is not applied; public.government_resources does not exist.');
    return;
  end if;

  -- ── resolve the concepts this file asserts against ────────────────────────
  v_jt  := t.reg_col('public.jurisdictions',
             array['jurisdiction_type', 'juris.*level', '^level$', '^type$', '^kind$']);
  v_js  := t.reg_col('public.jurisdictions', array['state_code', '^state$', 'usps', 'state_abbr']);
  v_jp  := t.reg_col('public.jurisdictions', array['parent_jurisdiction_id', 'parent_id', '^parent$']);
  v_pj  := t.reg_col('public.regulatory_provisions', array['jurisdiction_id', '^jurisdiction$']);

  perform t.assert(
    'jurisdiction-is-a-hierarchy',
    '2m: the geography is Country, State, County, Municipality or other local authority, with a type and a parent',
    v_jt is not null and v_jp is not null,
    format('public.jurisdictions has no resolvable type column (looked for jurisdiction_type/level/type/kind, found %L) or no resolvable parent column (looked for parent_jurisdiction_id/parent_id/parent, found %L). Without both, ADU regulation cannot be represented as the multi-level thing it is: a homeowner in Phoenix must see Arizona, Maricopa County and Phoenix as three distinct sourced answers.',
           coalesce(v_jt, '<none>'), coalesce(v_jp, '<none>')));

  perform t.assert(
    'provision-keeps-jurisdiction-and-source',
    '2m: a regulatory provision is an individual sourced rule carrying its jurisdiction, its source URL, its source document title and its SOURCE TYPE',
    v_pj is not null
      and t.reg_col('public.regulatory_provisions', array['source_url', 'source.*url', '^url$']) is not null
      and t.reg_col('public.regulatory_provisions', array['source_type']) is not null
      and t.reg_col('public.regulatory_provisions',
            array['source_document', 'document_title', 'source_title']) is not null
      and t.reg_col('public.regulatory_provisions',
            array['supplied_by', 'provided_by', 'contributed_by']) is not null,
    'a provision is missing its jurisdiction, its source URL, its source type, its source document title or who supplied it. A requirement without provenance is exactly what 2l forbids: "A requirement is NEVER populated from a blog, a lead generation site, builder marketing, an AI generated summary or unsourced secondary material and then presented as a verified rule."');

  perform t.assert_scalar(
    'provision-cannot-float-free-of-a-jurisdiction',
    '2m: every provision belongs to a jurisdiction; rules are never one blob per city',
    'service_role', null,
    format($q$select attnotnull::text from pg_attribute a
               join pg_class c on c.oid = a.attrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'regulatory_provisions'
                and a.attname = %L$q$, coalesce(v_pj, 'jurisdiction_id')),
    'true',
    'the provision''s jurisdiction is nullable, so a rule can exist attached to no jurisdiction at all and there is no way to say which government publishes it');

  perform t.assert_denied(
    'provision-jurisdiction-must-exist',
    '2m: a provision names a real jurisdiction, never a dangling one',
    'service_role', null,
    $q$insert into public.regulatory_provisions (jurisdiction_id, topic_key)
       values ('00000000-0000-0000-0000-000000000000', 'max_size')$q$,
    'a provision was accepted against a jurisdiction id that does not exist, so a sourced rule can be orphaned from the government that publishes it');

  -- ── all fifty states exist structurally ──────────────────────────────────
  if v_jt is null or v_js is null then
    perform t.skip('fifty-states-structural',
      '2l: all fifty states are structurally supported from day one',
      format('could not resolve the jurisdiction type column (%L) or the state code column (%L) on public.jurisdictions, so "nationwide" cannot be counted.',
             coalesce(v_jt, '<none>'), coalesce(v_js, '<none>')));
  else
    execute format(
      $q$select coalesce(array_agg(s order by s), '{}') from unnest(array[
            'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
            'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
            'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
            'TX','UT','VT','VA','WA','WV','WI','WY']) s
          where not exists (
            select 1 from public.jurisdictions j
             where upper(j.%I::text) = s
               and lower(j.%I::text) in ('state', 'us_state'))$q$,
      v_js, v_jt)
      into v_missing;

    perform t.assert(
      'fifty-states-structural',
      '2l: all fifty states are structurally supported from day one. The data is filled in progressively; the architecture is not',
      v_missing = '{}',
      format('%s of the fifty states have no state-level jurisdiction row: %s. Nationwide from day one is an architectural promise, so a homeowner in any of those states reaches nothing at all rather than a jurisdiction page that honestly says ADUAtlas has not researched it yet.',
             coalesce(array_length(v_missing, 1), 0), v_missing::text));

    -- The structural half of "incomplete is allowed; fabrication is not": most of
    -- the fifty rows will legitimately carry no provisions for a long time.
    execute format(
      $q$select count(*) from public.jurisdictions j
          where lower(j.%I::text) in ('state', 'us_state')
            and not exists (select 1 from public.regulatory_provisions p where p.%I = j.id)$q$,
      v_jt, coalesce(v_pj, 'jurisdiction_id')) into v_n;
    perform t.assert(
      'a-state-needs-no-research-to-exist',
      '2l: incomplete is allowed; fabrication is not. Nationwide does not mean pretending every jurisdiction has been researched',
      v_n > 0,
      'every state-level jurisdiction already carries at least one provision on a fresh database. Either the fifty states are seeded with rules nobody sourced, which is the fabrication 2l forbids, or a state row cannot exist before it has been researched, which breaks nationwide structure.');

    perform t.assert_scalar(
      'state-parent-is-the-country-not-another-state',
      '2m: the hierarchy is Country, State, County, Municipality — legal geography, in that order',
      'service_role', null,
      format($q$select count(*)::text from public.jurisdictions j
                where lower(j.%I::text) in ('state', 'us_state')
                  and (j.%I is null
                       or (select lower(p.%I::text) from public.jurisdictions p where p.id = j.%I)
                          not in ('country', 'us', 'nation'))$q$,
             v_jt, v_jp, v_jt, v_jp),
      '0',
      'a state-level jurisdiction hangs off something that is not the country row, so the geographic hierarchy does not describe US geography and a breadcrumb that walks it will nest a state under the wrong thing');
  end if;

  -- ── a research subject: a county and a city under Arizona ────────────────
  select id into v_us from public.jurisdictions where jurisdiction_type = 'country' limit 1;
  select id into v_az from public.jurisdictions
   where state_code = 'AZ' and jurisdiction_type = 'state' limit 1;

  if v_az is null then
    insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug, state_code)
    values ('state', v_us, 'Arizona', 'State of Arizona', t.nextlabel('arizona'), 'AZ')
    returning id into v_az;
  end if;

  insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug, state_code, published_at)
  values ('county', v_az, 'Maricopa County', 'Maricopa County', t.nextlabel('maricopa'), 'AZ', now())
  returning id into v_county;

  insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug, published_at)
  values ('municipality', v_county, 'Phoenix', 'City of Phoenix', t.nextlabel('phoenix'), now())
  returning id into v_city;

  perform t.assert_scalar(
    'a-city-inherits-its-state-from-geography-only',
    '2m: that hierarchy is geography, NOT editing authority',
    'service_role', null,
    format('select %I::text from public.jurisdictions where id = %L', v_js, v_city),
    'AZ',
    'a municipality created under a Maricopa County row did not inherit Arizona, so the geographic tree is not consistent and a page cannot place a city in its state');

  -- ── the four dates ───────────────────────────────────────────────────────
  v_eff  := t.reg_col('public.regulatory_provisions', array['effective']);
  v_chk  := t.reg_col('public.regulatory_provisions',
              array['source_checked', 'checked', 'last_verified', 'verified_on']);
  v_pubd := t.reg_col('public.regulatory_provisions',
              array['record_published', 'published_or_updated', 'record_updated', 'published_at', 'updated_at']);
  v_sup  := t.reg_col('public.regulatory_provisions', array['superseded_or_repealed', 'superseded', 'repealed']);

  perform t.assert(
    'four-distinct-dates',
    '2m: "Last verified" alone is wrong and dangerous. Store the EFFECTIVE date, the SOURCE CHECKED date, the PUBLISHED OR UPDATED date, and a REPEALED OR SUPERSEDED date',
    v_eff is not null and v_chk is not null and v_pubd is not null and v_sup is not null
      and cardinality(array(select distinct x from unnest(array[v_eff, v_chk, v_pubd, v_sup]) x)) = 4,
    format('the four dates do not resolve to four different columns: effective=%L, source-checked=%L, published-or-updated=%L, superseded-or-repealed=%L. Collapsing any two of them is how a homeowner reads a rule ADUAtlas last checked in 2025 as a rule that took effect in 2025.',
           coalesce(v_eff, '<none>'), coalesce(v_chk, '<none>'),
           coalesce(v_pubd, '<none>'), coalesce(v_sup, '<none>')));

  if v_eff is null or v_chk is null or v_pubd is null or v_sup is null then
    perform t.skip('dates-cannot-be-conflated',
      '2m: "verified January 2025" and "effective January 2026" must never read alike',
      'the four dates did not resolve to four distinct columns, so there is nothing to keep apart.');
  else
    -- A rule that takes legal effect in 2099, read from its source in January 2025.
    -- Two dates two generations apart, deliberately, so a conflation cannot hide.
    insert into public.regulatory_provisions
      (jurisdiction_id, topic_key, field_state, value_text,
       source_url, source_type, source_document_title, source_checked_date, effective_date)
    values (v_city, 'max_size', 'verified_from_source', '1200 sq ft',
            'https://www.phoenix.gov/pdd/adu', 'city_code',
            'Phoenix Zoning Ordinance 608.E', '2025-01-15', '2099-01-01')
    returning id into v_p_dates;

    perform t.assert_scalar(
      'effective-date-is-stored-as-given',
      '2m: the effective date is when the rule LEGALLY took effect, per the government, and may be in the future',
      'service_role', null,
      format('select %I::date::text from public.regulatory_provisions where id = %L', v_eff, v_p_dates),
      '2099-01-01',
      'the effective date did not round-trip, so the date a rule legally takes effect is being derived from something else');

    perform t.assert_scalar(
      'source-checked-date-is-stored-as-given',
      '2m: the source checked date is when ADUAtlas last looked at the source, and says nothing about the law',
      'service_role', null,
      format('select %I::date::text from public.regulatory_provisions where id = %L', v_chk, v_p_dates),
      '2025-01-15',
      'the source checked date did not round-trip');

    perform t.assert_scalar(
      'dates-cannot-be-conflated',
      '2m: "verified January 2025" and "effective January 2026" mean completely different things and the product must never let one read as the other',
      'service_role', null,
      format('select (%I::date <> %I::date)::text from public.regulatory_provisions where id = %L',
             v_eff, v_chk, v_p_dates),
      'true',
      'the effective date and the source checked date came back equal after being written seventy-four years apart, which means one is derived from the other');

    perform t.assert_scalar(
      'our-record-date-is-not-the-legal-date',
      '2m: the published or updated date is when ADUAtlas last changed its OWN record. It moves for a corrected typo, which changes neither the law nor when we last read the source',
      'service_role', null,
      format('select (%I::date is distinct from %I::date)::text from public.regulatory_provisions where id = %L',
             v_pubd, v_eff, v_p_dates),
      'true',
      format('regulatory_provisions.%s took the value of the effective date, so ADUAtlas''s own bookkeeping date and the date the law takes effect are one field', v_pubd));

    -- Looking at the source again must not move the law.
    perform t.assert_ok(
      'rechecking-the-source-is-allowed',
      '2m: ADUAtlas re-checks a source without the rule having changed',
      'service_role', null,
      format('update public.regulatory_provisions set %I = ''2026-09-26'' where id = %L', v_chk, v_p_dates),
      'the source checked date cannot be moved, so ADUAtlas cannot record that it looked again');

    perform t.assert_scalar(
      'rechecking-does-not-move-the-effective-date',
      '2m: ADU law changes, so the date ADUAtlas last looked and the date the rule took effect move independently',
      'service_role', null,
      format('select %I::date::text from public.regulatory_provisions where id = %L', v_eff, v_p_dates),
      '2099-01-01',
      're-checking the source moved the effective date. A homeowner would read a rule as having taken legal effect on the day ADUAtlas happened to visit the city website');

    perform t.assert_scalar(
      'superseded-starts-empty',
      '2m: a repealed or superseded date applies only where it applies',
      'service_role', null,
      format('select (%I is null)::text from public.regulatory_provisions where id = %L', v_sup, v_p_dates),
      'true',
      'a live rule already carries a superseded date, so the column is filled by default rather than when a rule is actually repealed');

    perform t.assert_ok(
      'a-rule-can-be-marked-superseded',
      '2m: the row is KEPT and never deleted. A homeowner who acted under the old rule must still be able to see it',
      'service_role', null,
      format('update public.regulatory_provisions set %I = ''2027-06-30'' where id = %L', v_sup, v_p_dates),
      'a rule cannot be marked superseded, so ADUAtlas can only delete what stopped applying');

    perform t.assert_scalar(
      'superseding-does-not-overwrite-the-effective-date',
      '2m: history is never rewritten by a repeal',
      'service_role', null,
      format('select %I::date::text from public.regulatory_provisions where id = %L', v_eff, v_p_dates),
      '2099-01-01',
      'repealing a rule overwrote the date it took effect, so ADUAtlas can no longer say what the law was between those two dates');
  end if;

  -- ── the three field states, distinguishable BY QUERY ─────────────────────
  v_fs := t.reg_col('public.regulatory_provisions',
            array['field_state', 'value_state', 'field_status', 'data_state', 'knowledge_state']);
  if v_fs is null then
    -- A different spelling is still recognised: find the column whose own
    -- vocabulary contains the third state, so only an absent CONCEPT fails.
    for v_col in
      select a.attname::text from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'regulatory_provisions'
         and a.attnum > 0 and not a.attisdropped
       order by a.attnum
    loop
      if exists (select 1 from unnest(coalesce(t.reg_tokens('public.regulatory_provisions', v_col), '{}')) x
                  where x ~* 'research') then
        v_fs := v_col;
        exit;
      end if;
    end loop;
  end if;

  v_fs_toks := case when v_fs is null then null
                    else t.reg_tokens('public.regulatory_provisions', v_fs) end;
  v_fs_verified := (select x from unnest(coalesce(v_fs_toks, '{}')) x where x ~* 'verif' limit 1);
  v_fs_unres    := (select x from unnest(coalesce(v_fs_toks, '{}')) x where x ~* '(research|not_yet)' limit 1);
  v_fs_silent   := (select x from unnest(coalesce(v_fs_toks, '{}')) x
                     where x ~* '(not_stated|did_not_state|unstated|silent|no_statement|not_addressed)' limit 1);

  perform t.assert(
    'field-state-is-a-closed-set-of-three',
    '2m: each field is one of three things and never blurred — VERIFIED FROM SOURCE, SOURCE DID NOT STATE, or NOT YET RESEARCHED',
    v_fs is not null and v_fs_toks is not null and array_length(v_fs_toks, 1) = 3
      and v_fs_verified is not null and v_fs_silent is not null and v_fs_unres is not null,
    format('the three field states are not a closed vocabulary on public.regulatory_provisions: column=%L, tokens=%s. Without all three STORED, the database cannot tell a homeowner whether the city said nothing or whether nobody has looked yet, and those are different sentences.',
           coalesce(v_fs, '<none>'), coalesce(v_fs_toks::text, '<none>')));

  if v_fs is null or v_fs_verified is null or v_fs_silent is null or v_fs_unres is null then
    perform t.skip('field-state-distinguishable-by-query',
      '2m: the three field states are distinguishable BY QUERY, so the UI is not the only thing that knows',
      format('the three states did not resolve on public.regulatory_provisions (column %L, tokens %s).',
             coalesce(v_fs, '<none>'), coalesce(v_fs_toks::text, '<none>')));
    perform t.skip('unknown-stays-unknown',
      '2b applied to regulation: unknown means unknown and no value is ever manufactured',
      'the three field states did not resolve, so there is no stored notion of unknown to protect.');
  else
    v_val := t.reg_col('public.regulatory_provisions',
               array['^value_text$', 'rule_value', 'rule_text', '^value$', '^text$', 'provision_text', '^body$']);

    -- One provision per state, on three different topics, because a rule is one
    -- row per (jurisdiction, topic) and the three states are answers to three
    -- different questions about the same city.
    insert into public.regulatory_provisions (jurisdiction_id, topic_key, field_state)
    values (v_city, 'min_lot_size', v_fs_verified) returning id into v_p_ver;

    insert into public.regulatory_provisions
      (jurisdiction_id, topic_key, field_state, source_url, source_type, source_checked_date)
    values (v_city, 'height_limit', v_fs_silent,
            'https://www.phoenix.gov/pdd/adu', 'city_code', '2025-01-15')
    returning id into v_p_sil;

    insert into public.regulatory_provisions (jurisdiction_id, topic_key, field_state)
    values (v_city, 'setback_front', v_fs_unres) returning id into v_p_unr;

    perform t.assert_count(
      'field-state-distinguishable-by-query',
      '2m: the three field states are distinguishable BY QUERY, so the UI is not the only thing that knows which of the three a blank means',
      'service_role', null,
      format($q$select %I from public.regulatory_provisions
                where id in (%L, %L, %L) group by %I$q$,
             v_fs, v_p_ver, v_p_sil, v_p_unr, v_fs),
      3,
      'three provisions written in the three different field states do not come back as three different values, so a reader cannot separate "the source did not state it" from "nobody has researched it" without asking the interface');

    perform t.assert_count(
      'source-silent-is-not-not-yet-researched',
      '2m: the three states are never blurred',
      'service_role', null,
      format('select 1 from public.regulatory_provisions where id = %L and %I = %L',
             v_p_unr, v_fs, v_fs_silent),
      0,
      'a not-yet-researched provision also answers to the "source did not state" state. Those are opposite admissions: one says the city is silent, the other says ADUAtlas has not looked');

    perform t.assert_denied(
      'field-state-vocabulary-closed',
      '2m: each field is one of THREE things',
      'service_role', null,
      format('update public.regulatory_provisions set %I = ''probably_allowed'' where id = %L', v_fs, v_p_unr),
      'a fourth field state was accepted. Every state invented beyond the three is a new shade of certainty nobody defined, and the interface will render it as one of the three anyway');

    perform t.assert_denied(
      'silence-is-knowledge-and-needs-a-source',
      '2m: SOURCE DID NOT STATE is knowledge, not absence. It costs a researcher the same work as a value and it requires a source and a checked date',
      'service_role', null,
      format('insert into public.regulatory_provisions (jurisdiction_id, topic_key, field_state) values (%L, ''parking_required'', %L)',
             v_city, v_fs_silent),
      'ADUAtlas can record "the source did not state it" without naming the source it read or the date it read it, which makes an unsourced blank indistinguishable from a researched finding');

    perform t.assert_denied(
      'not-yet-researched-cannot-carry-a-checked-date',
      '2m: NOT YET RESEARCHED means ADUAtlas has not looked. A checked date would be a contradiction in terms',
      'service_role', null,
      format('insert into public.regulatory_provisions (jurisdiction_id, topic_key, field_state, source_checked_date) values (%L, ''parking_required'', %L, ''2025-01-15'')',
             v_city, v_fs_unres),
      'a not-yet-researched provision can carry a source checked date, so the staleness report and the coverage report disagree about whether anybody has looked');

    -- ── unknown stays unknown ──────────────────────────────────────────────
    if v_val is null then
      perform t.skip('unknown-stays-unknown',
        '2b applied to regulation: unknown means unknown',
        'could not resolve the column holding a provision''s rule value (looked for value_text/rule_value/rule_text/value/text), so there is no value to prove absent.');
    else
      perform t.assert_count(
        'unknown-has-no-column-default',
        '2b: ADUAtlas never prints a column default as a claim',
        'service_role', null,
        format($q$select 1 from pg_attrdef d
                   join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
                   join pg_class c on c.oid = a.attrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'regulatory_provisions'
                    and a.attname = %L$q$, v_val),
        0,
        format('public.regulatory_provisions.%s has a column default. A default on the value of a regulation is a requirement ADUAtlas asserts on behalf of a city that never stated it, which is the exact 0004/0006 mistake decision 2b exists to prevent', v_val));

      perform t.assert_scalar(
        'unknown-stays-unknown',
        '2l: an unresearched requirement says so plainly. No value is ever manufactured to make coverage look complete',
        'service_role', null,
        format('select (%I is null)::text from public.regulatory_provisions where id = %L', v_val, v_p_unr),
        'true',
        'a not-yet-researched provision already carries a rule value, so ADUAtlas is publishing a requirement nobody sourced');

      perform t.assert_scalar(
        'source-silence-is-not-a-value',
        '2m: SOURCE DID NOT STATE is an admission, not an answer',
        'service_role', null,
        format('select (%I is null)::text from public.regulatory_provisions where id = %L', v_val, v_p_sil),
        'true',
        'a provision whose source did not state the rule still carries a value, so the page prints a requirement the city never published');

      perform t.assert_denied(
        'a-value-cannot-exist-without-a-verified-state',
        '2b in a constraint: no column default and no half-filled draft becomes a claim about a government',
        'service_role', null,
        format('update public.regulatory_provisions set %I = ''1200 sq ft'' where id = %L', v_val, v_p_unr),
        'a value can be attached to a provision nobody has researched. That row is now a requirement ADUAtlas asserts about a city with no source and no date behind it');

      perform t.assert_ok(
        'a-verified-value-can-be-stored',
        '2m: VERIFIED FROM SOURCE is the only state that carries an answer',
        'service_role', null,
        format('update public.regulatory_provisions set %I = ''1200 sq ft'' where id = %L', v_val, v_p_ver),
        'a verified provision cannot hold the value it was verified from');

      perform t.assert_count(
        'unknown-is-not-a-match-for-a-value-filter',
        '2b: unknown is not a match',
        'service_role', null,
        format($q$select 1 from public.regulatory_provisions
                  where id in (%L, %L, %L) and %I is not null$q$,
               v_p_ver, v_p_sil, v_p_unr, v_val),
        1,
        'a filter over provisions that have a stated value matched more than the one provision that was verified from a source, so unknowns are being presented to a homeowner as requirements');
    end if;
  end if;
end
$$;

-- =============================================================================
-- PART 2 — publication: what leaks, what is immutable, and what keeps its source.
-- =============================================================================
do $$
declare
  v_pub text; v_pub_toks text[]; v_pub_yes text; v_pub_no text;
  v_src text;
  v_us uuid; v_az uuid; v_county uuid; v_city uuid; v_hidden uuid;
  v_draft uuid; v_live uuid; v_hidden_prov uuid;
  v_paid uuid; v_free uuid; v_pa uuid; v_fa uuid;
  v_ent uuid; v_govuser uuid; v_person uuid; v_sub uuid; v_submitter text;
  v_versions text;
begin
  if not t.has_relation('public.regulatory_provisions') then return; end if;

  v_pub := t.reg_col('public.regulatory_provisions',
             array['publication_status', 'review_status', 'is_published', '^published$', '^publish', '^status$']);
  v_src := t.reg_col('public.regulatory_provisions', array['source_url', 'source.*url']);
  if v_pub is not null then
    if t.reg_type('public.regulatory_provisions', v_pub) ~ 'bool' then
      v_pub_yes := 'true'; v_pub_no := 'false';
    else
      v_pub_toks := t.reg_tokens('public.regulatory_provisions', v_pub);
      v_pub_yes := (select x from unnest(coalesce(v_pub_toks, '{}')) x where x ~* '^publish' limit 1);
      v_pub_no  := (select x from unnest(coalesce(v_pub_toks, '{}')) x where x ~* '^draft' limit 1);
    end if;
  end if;

  perform t.assert(
    'provision-has-a-publication-state',
    '2m: a government member SUBMITS, Amy reviews, ADUAtlas PUBLISHES. Verification is not a publishing right',
    v_pub is not null and v_pub_yes is not null and v_pub_no is not null,
    format('public.regulatory_provisions has no resolvable publication state (column=%L, published token=%L, unpublished token=%L). Without one, everything Amy is part-way through researching is live the moment she saves it, and the review step in 2m does not exist in the database.',
           coalesce(v_pub, '<none>'), coalesce(v_pub_yes, '<none>'), coalesce(v_pub_no, '<none>')));

  -- ── the people ───────────────────────────────────────────────────────────
  v_paid := t.mk_paid_homeowner('concierge');
  v_free := t.mk_account('homeowner');
  v_pa := t.authid(v_paid);
  v_fa := t.authid(v_free);

  -- ── a published city, and one ADUAtlas has NOT published ─────────────────
  select id into v_us from public.jurisdictions where jurisdiction_type = 'country' limit 1;
  select id into v_az from public.jurisdictions
   where state_code = 'AZ' and jurisdiction_type = 'state' limit 1;

  insert into public.jurisdictions (jurisdiction_type, parent_id, name, slug, state_code, published_at)
  values ('county', v_az, 'Pima County', t.nextlabel('pima'), 'AZ', now())
  returning id into v_county;

  insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug, published_at)
  values ('municipality', v_county, 'Tucson', 'City of Tucson', t.nextlabel('tucson'), now())
  returning id into v_city;

  insert into public.jurisdictions (jurisdiction_type, parent_id, name, slug)
  values ('municipality', v_county, 'Oro Valley', t.nextlabel('oro-valley'))
  returning id into v_hidden;

  -- A draft: real research, part way through, and not published.
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_type,
     source_document_title, source_checked_date)
  values (v_city, 'permit_type', 'verified_from_source', 'Administrative review, by right',
          'https://www.tucsonaz.gov/pdsd/adu', 'city_code', 'Tucson UDC 4.9.13', '2025-06-01')
  returning id into v_draft;

  -- A published rule, with everything a published rule must carry.
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, value_numeric, value_unit,
     source_url, source_document_title, source_type, source_checked_date, effective_date,
     review_status, verification_status)
  values (v_city, 'max_size', 'verified_from_source', '1000 sq ft', 1000, 'sq ft',
          'https://www.tucsonaz.gov/pdsd/adu', 'Tucson UDC 4.9.13', 'city_code',
          '2025-06-01', '2024-01-01', 'published', 'source_checked')
  returning id into v_live;

  -- A published rule hanging off a jurisdiction ADUAtlas has NOT published.
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, value_numeric, value_unit,
     source_url, source_document_title, source_type, source_checked_date,
     review_status, verification_status)
  values (v_hidden, 'max_size', 'verified_from_source', '900 sq ft', 900, 'sq ft',
          'https://www.orovalleyaz.gov/adu', 'Oro Valley Zoning Code', 'city_code',
          '2025-06-01', 'published', 'source_checked')
  returning id into v_hidden_prov;

  -- ── THE POSITIVE CONTROL for every "does not leak" assertion below ───────
  -- A suite of negative read assertions passes perfectly against a feature no
  -- homeowner can read at all, so the readable case is proved first.
  perform t.assert_count(
    'published-rule-is-readable',
    '2l: a homeowner can choose or search their state and jurisdiction and see what ADUAtlas has',
    'anon', null,
    format('select 1 from public.regulatory_provisions_public where id = %L', v_live),
    1,
    'a PUBLISHED provision is not readable by an anonymous visitor through public.regulatory_provisions_public, so the leak assertions below prove nothing and nobody can read the state and city resources ADUAtlas sells in seven places');

  perform t.assert_count(
    'published-rule-links-back-to-its-source',
    '2l: it links back to the authoritative government source so a homeowner can check for themselves',
    'anon', null,
    format('select 1 from public.regulatory_provisions_public where id = %L and source_url is not null and source_document_title is not null',
           v_live),
    1,
    'a published rule reaches a homeowner without the source URL and document title it was read from, so the one thing that lets a homeowner verify ADUAtlas is missing from the page');

  perform t.assert_count(
    'two-attributions-are-never-one-column',
    '2m: "Source: Official government website" and "Provided by verified government account" are distinct statements and must never be collapsed into one',
    'anon', null,
    format($q$select 1 from public.regulatory_provisions_public
              where id = %L and source_is_official_government and provided_by_entity_name is null$q$, v_live),
    1,
    'a rule ADUAtlas read off a city website either loses the fact that its source was official, or reads as having been PROVIDED BY that city. Using a government''s public website as a source does not mean that government participates in ADUAtlas');

  -- ── what must not leak ───────────────────────────────────────────────────
  perform t.reg_unseen(
    'draft-does-not-leak',
    '2l: unpublished records do not leak',
    'anon', null,
    format('select 1 from public.regulatory_provisions where id = %L', v_draft),
    'an anonymous visitor can read the base provisions table. Half-finished regulatory research reads exactly like a verified rule');

  perform t.reg_unseen(
    'draft-does-not-leak-through-the-public-view',
    '2l: unpublished records do not leak',
    'anon', null,
    format('select 1 from public.regulatory_provisions_public where id = %L', v_draft),
    'a draft appears in the public view, so research Amy has not reviewed is on a jurisdiction page as though ADUAtlas stood behind it');

  perform t.reg_unseen(
    'draft-does-not-leak-to-a-homeowner',
    '2l: unpublished records do not leak',
    'authenticated', v_fa,
    format('select 1 from public.regulatory_provisions where id = %L', v_draft),
    'a signed-in homeowner can read an unpublished provision');

  perform t.reg_unseen(
    'a-paid-plan-is-not-a-review-seat',
    '2l: publication and editing require server-side admin authorization',
    'authenticated', v_pa,
    format('select 1 from public.regulatory_provisions where id = %L', v_draft),
    'a Concierge homeowner can read unpublished regulatory research. Paying for a feasibility study does not make somebody a reviewer');

  perform t.reg_unseen(
    'an-unpublished-jurisdiction-leaks-nothing-hanging-off-it',
    '2l: coverage is transparent in the product; a jurisdiction ADUAtlas has not published is not half-published through its rules',
    'anon', null,
    format('select 1 from public.regulatory_provisions_public where id = %L', v_hidden_prov),
    'a published provision belonging to an UNPUBLISHED jurisdiction reaches an anonymous visitor, so a page nobody decided to publish exists in fragments');

  perform t.assert_changes_nothing(
    'homeowner-cannot-publish',
    '2l: an anonymous or homeowner user can never modify a regulatory record',
    'authenticated', v_pa,
    format('update public.regulatory_provisions set %I = %L where id = %L',
           coalesce(v_pub, 'review_status'), coalesce(v_pub_yes, 'published'), v_draft),
    'a paying homeowner can publish a draft regulation');

  perform t.assert_changes_nothing(
    'anon-cannot-rewrite-a-source',
    '2l: an anonymous or homeowner user can never modify a regulatory record; enforced in the database, not the browser',
    'anon', null,
    format('update public.regulatory_provisions set %I = ''https://evil.test'' where id = %L',
           coalesce(v_src, 'source_url'), v_live),
    'the anonymous role can rewrite the source of a published regulation, which means anybody can make ADUAtlas cite whatever they like as a city ordinance');

  perform t.assert_changes_nothing(
    'homeowner-cannot-insert-a-regulation',
    '2l: publication and editing require server-side admin authorization',
    'authenticated', v_fa,
    format('insert into public.regulatory_provisions (jurisdiction_id, topic_key) values (%L, ''impact_fees'')', v_city),
    'a signed-in homeowner can create a regulatory provision');

  -- ── a submission is what a government PROPOSED, not what we publish ─────
  v_submitter := t.reg_col('public.regulatory_submissions',
                   array['submitted_by_government_user_id', 'submitted_by_user_id', 'submitted_by',
                         'government_user_id', '^user_id$']);
  if not t.has_relation('public.regulatory_submissions')
     or not t.has_relation('public.government_entities')
     or v_submitter is null then
    perform t.skip('submission-does-not-leak',
      '2m: a government member SUBMITS; ADUAtlas publishes. A submission is not published content',
      'public.regulatory_submissions or public.government_entities does not exist, or the submitter column could not be resolved; migration 0012 is not applied, so the submit/review/publish workflow has no schema behind it.');
  else
    insert into public.government_entities (name, entity_type, jurisdiction_id, official_website_url)
    values ('City of Tucson PDSD ' || t.nextlabel('ent'), 'city', v_city, 'https://www.tucsonaz.gov/pdsd')
    returning id into v_ent;

    v_person := t.mk_account('homeowner');
    if t.reg_fk_target('public.regulatory_submissions', v_submitter) = 'public.government_users' then
      insert into public.government_users (user_id, full_name, job_title)
      values (v_person, 'A Planner', 'ADU coordinator')
      returning id into v_govuser;
    else
      v_govuser := v_person;
    end if;

    -- The submitter column is resolved rather than spelled, because the government
    -- layer legitimately models a person in two places (the ADUAtlas account and
    -- the government profile of it) and which one a submission carries is the
    -- schema's decision, not this assertion's subject.
    execute format(
      $s$insert into public.regulatory_submissions
           (kind, jurisdiction_id, entity_id, %I, topic_key, payload)
         values ('provision', %L, %L, %L, 'height_limit',
                 '{"field_state": "verified_from_source", "value_text": "16 ft",
                   "source_url": "https://www.tucsonaz.gov/pdsd/adu"}'::jsonb)
         returning id$s$,
      v_submitter, v_city, v_ent, v_govuser)
    into v_sub;

    perform t.reg_unseen(
      'submission-does-not-leak',
      '2m: a submission is what a government proposed, not what ADUAtlas publishes',
      'anon', null,
      'select 1 from public.regulatory_submissions',
      'an anonymous visitor can read government submissions. A city''s proposed correction would read as a published ADUAtlas rule before Amy has looked at it');

    perform t.reg_unseen(
      'submission-does-not-leak-to-a-homeowner',
      '2m: a submission is what a government proposed, not what ADUAtlas publishes',
      'authenticated', v_pa,
      'select 1 from public.regulatory_submissions',
      'a paying homeowner can read government submissions before review');

    perform t.reg_refused(
      'a-submission-is-immutable',
      '2m: the database retains BOTH what the government submitted AND what ADUAtlas currently publishes',
      format('update public.regulatory_submissions set payload = ''{"value_text": "40 ft"}''::jsonb where id = %L', v_sub),
      'exactly what a government submitted can be edited afterwards, so ADUAtlas cannot show what the city actually said and a disagreement can be rewritten into agreement');

    perform t.reg_refused(
      'a-submission-is-never-deleted',
      '2m: previous versions are retained immutably, and so is what was sent to us',
      format('delete from public.regulatory_submissions where id = %L', v_sub),
      'a government submission can be deleted, so the record of what a city asked ADUAtlas to publish can be made to disappear');
  end if;

  -- ── history that is never overwritten ────────────────────────────────────
  v_versions := case
                  when t.has_relation('public.regulatory_record_versions') then 'public.regulatory_record_versions'
                  when t.has_relation('public.regulatory_versions')        then 'public.regulatory_versions'
                end;

  if v_versions is null then
    perform t.skip('version-history-immutable',
      '2m: previous versions are retained immutably',
      'neither public.regulatory_record_versions nor public.regulatory_versions exists; migration 0012 is not applied, so a publish can overwrite what ADUAtlas said before with no record.');
  else
    perform t.assert(
      'publish-writes-a-version',
      '2m: previous versions are retained immutably — which is only true if a version is written without anybody remembering to write it',
      (select count(*) from public.regulatory_record_versions
        where record_id = v_live) > 0,
      'publishing a provision recorded no version. History written by whichever code path remembered to write it is not history, and 2m''s "previous versions are retained" would rest on an application convention rather than on the database');

    -- Correct the published rule. The previous version must survive unchanged.
    update public.regulatory_provisions
       set value_text = '1100 sq ft', value_numeric = 1100, source_checked_date = '2026-09-26'
     where id = v_live;

    perform t.assert(
      'previous-version-survives-a-publish',
      '2m: the database retains BOTH what the government submitted AND what ADUAtlas currently publishes, because the two can legitimately differ',
      (select count(*) from public.regulatory_record_versions
        where record_id = v_live and value_summary like '%1000%') = 1,
      'correcting a published rule destroyed what ADUAtlas published before it. A homeowner who acted under the earlier number can no longer be shown what it said, and a state and a city disagreeing has nowhere to live');

    perform t.assert(
      'version-history-keeps-both-versions',
      '2m: previous versions are retained',
      (select count(*) from public.regulatory_record_versions where record_id = v_live) >= 2,
      'a corrected provision has fewer than two versions recorded, so the history is being overwritten in place rather than appended to');

    perform t.assert_denied(
      'version-history-immutable',
      '2m: previous versions are retained IMMUTABLY. A compromised service key can change what is published next; it must not be able to erase what was published before',
      'service_role', null,
      format('update %s set value_summary = ''rewritten'' where record_id = %L', v_versions, v_live),
      'the service role can edit a recorded version. History that can be rewritten is not history, and the disagreement 2m exists to represent can be made to disappear by whatever holds the service key');

    perform t.assert_denied(
      'version-history-not-deletable',
      '2m: previous versions are retained immutably',
      'service_role', null,
      format('delete from %s where record_id = %L', v_versions, v_live),
      'the service role can delete a recorded version, so a publish can silently decide which record disappears');

    perform t.assert_denied(
      'version-history-cannot-be-forged',
      '2m: history is written by the database, not by a caller',
      'service_role', null,
      format($q$insert into %s (record_type, record_id, version_no, change_kind, snapshot, actor_api_role)
                values ('provision', %L, 999, 'update', '{}'::jsonb, 'service_role')$q$, v_versions, v_live),
      'a caller can write its own version rows, so the history can be made to say something that never happened');

    perform t.reg_unseen(
      'version-history-is-not-open-to-a-homeowner',
      '2l: internal regulatory records do not leak',
      'authenticated', v_fa,
      format('select 1 from %s where record_id = %L', v_versions, v_live),
      'a signed-in homeowner can read the raw version history, including the snapshots of drafts that were never published');

    perform t.reg_refused(
      'a-published-rule-is-never-deleted',
      '2m: the row is KEPT and never deleted. A homeowner who acted under the old rule must still be able to see it',
      format('delete from public.regulatory_provisions where id = %L', v_live),
      'a published provision can be deleted outright, which removes both the rule and the reason a homeowner believed it');

    perform t.reg_refused(
      'a-published-rule-cannot-return-to-draft',
      '2m: history is never overwritten. A published provision moves only to superseded or retracted',
      format('update public.regulatory_provisions set %I = %L where id = %L',
             coalesce(v_pub, 'review_status'), coalesce(v_pub_no, 'draft'), v_live),
      'a published rule can be quietly moved back to draft, which un-publishes it with no superseding record and no retraction reason');
  end if;

  -- ── provenance cannot be silently lost ──────────────────────────────────
  perform t.reg_refused(
    'provenance-not-silently-lost',
    '2l: provenance is maintained so a claim cannot silently lose its source',
    format('update public.regulatory_provisions set %I = null where id = %L',
           coalesce(v_src, 'source_url'), v_live),
    'the source URL can be cleared from a PUBLISHED provision. A requirement that says verified with no source behind it is indistinguishable from one ADUAtlas invented, and 2l forbids exactly that');

  perform t.reg_refused(
    'a-published-rule-cannot-lose-its-source-type',
    '2l: a regulatory claim is backed by an authoritative source, and which kind of source it was is part of the claim',
    format('update public.regulatory_provisions set source_type = null where id = %L', v_live),
    'the source type can be cleared from a published provision, so ADUAtlas can no longer say whether a rule came from a state statute, a city code or a planning department');

  perform t.assert_scalar(
    'source-survives-publication',
    '2l: sources and verification dates survive publication',
    'service_role', null,
    format('select %I from public.regulatory_provisions where id = %L', coalesce(v_src, 'source_url'), v_live),
    'https://www.tucsonaz.gov/pdsd/adu',
    'publishing and then correcting a provision changed or dropped its source URL, so the page can no longer link a homeowner back to the authoritative government source');

  perform t.reg_refused(
    'a-rule-cannot-claim-an-unverified-government-supplied-it',
    '2m: "Provided by verified government account" must be true when it is said',
    format('update public.regulatory_provisions set supplied_by = ''government_account'' where id = %L', v_live),
    'a provision can be attributed to a government account with no verified entity named. The one sentence that tells a homeowner a city stood behind a rule would be assertable about any row');
end
$$;

-- =============================================================================
-- PART 3 — a jurisdiction nobody has researched, and resources as first-class
-- records beside the rules.
-- =============================================================================
do $$
declare
  v_vt uuid; v_town uuid; v_res uuid; v_thick uuid;
  v_free uuid; v_fa uuid;
  v_n int;
  v_topic text;
  v_i int := 0;
begin
  if not t.has_relation('public.jurisdictions')
     or not t.has_relation('public.regulatory_provisions') then return; end if;

  v_free := t.mk_account('homeowner');
  v_fa := t.authid(v_free);

  select id into v_vt from public.jurisdictions
   where state_code = 'VT' and jurisdiction_type = 'state' limit 1;

  if v_vt is null then
    perform t.skip('unresearched-jurisdiction-presents-nothing',
      '2l: an unresearched jurisdiction never presents a fabricated requirement',
      'no Vermont state row exists to hang a town off; see the fifty-states assertion in part 1.');
  else
    insert into public.jurisdictions (jurisdiction_type, parent_id, name, slug, published_at)
    values ('municipality', v_vt, 'Nowhere Researched', t.nextlabel('unresearched'), now())
    returning id into v_town;

    perform t.assert_count(
      'unresearched-jurisdiction-presents-nothing',
      '2l: "We haven''t verified detailed ADU requirements for this jurisdiction yet." Unknown means unknown, and no value is ever manufactured to make coverage look complete',
      'service_role', null,
      format('select 1 from public.regulatory_provisions where jurisdiction_id = %L', v_town),
      0,
      'a jurisdiction created with no research already has provisions. Something is populating requirements on creation, which is the fabrication 2l forbids: a homeowner would read manufactured setbacks as their town''s ordinance');

    perform t.assert_count(
      'unresearched-jurisdiction-still-has-a-page',
      '2l: nationwide in architecture, progressive in data. Coverage is transparent in the product',
      'anon', null,
      format('select 1 from public.jurisdictions_public where id = %L', v_town),
      1,
      'a jurisdiction with no research is not reachable at all, so ADUAtlas has no way to tell a homeowner honestly that their town has not been researched yet. The honest sentence needs a page to sit on');

    -- The third state, BY NAME, from a query rather than from an inference. This
    -- is the assertion that says the interface is not the only thing that knows.
    if t.has_relation('public.jurisdiction_topic_coverage') then
      perform t.assert_count(
        'not-yet-researched-is-produced-by-query-not-by-inference',
        '2m: the three field states are distinguishable BY QUERY. An absence cannot carry a status column, so the absence itself must be named in SQL',
        'anon', null,
        format($q$select 1 from public.jurisdiction_topic_coverage
                  where jurisdiction_id = %L and field_state <> 'not_yet_researched'$q$, v_town),
        0,
        'a jurisdiction nobody has researched reports something other than not_yet_researched for at least one topic, so the third state is being inferred somewhere rather than produced');

      perform t.assert(
        'every-tracked-topic-reports-one-of-the-three-states',
        '2m: each field is one of three things and never blurred',
        (select count(*) from public.jurisdiction_topic_coverage where jurisdiction_id = v_town)
          = (select count(*) from public.regulatory_topics),
        'the coverage query does not report every tracked topic for an unresearched jurisdiction. A topic missing from the report is a gap the product cannot see, and a gap the product cannot see is a gap the page will not admit to');
    else
      perform t.skip('not-yet-researched-is-produced-by-query-not-by-inference',
        '2m: the three field states are distinguishable BY QUERY',
        'public.jurisdiction_topic_coverage does not exist, so the third state — the absence of a published rule — is not produced by a query anywhere and the interface is the only thing that knows.');
    end if;

    if t.has_relation('public.jurisdiction_coverage_public') then
      perform t.assert_count(
        'a-thin-page-is-not-offered-to-search-engines',
        '2l: ADUAtlas does not generate thousands of thin pages carrying essentially no verified information',
        'anon', null,
        format('select 1 from public.jurisdiction_coverage_public where jurisdiction_id = %L and is_indexable', v_town),
        0,
        'a jurisdiction with nothing verified is marked indexable, so ADUAtlas asks search engines to index a page that answers nothing');

      perform t.assert_count(
        'coverage-counts-the-gap-honestly',
        '2l: coverage is transparent in the product',
        'anon', null,
        format($q$select 1 from public.jurisdiction_coverage_public
                  where jurisdiction_id = %L and topics_verified = 0
                    and topics_not_researched = topics_tracked$q$, v_town),
        1,
        'an unresearched jurisdiction does not report its gap as the whole of what is tracked, so the page can imply more coverage than exists');
    end if;
  end if;

  -- ── resources are first class, and a link is not a rule ─────────────────
  if not t.has_relation('public.government_resources') then
    perform t.skip('government-resources-are-first-class',
      '2m: a government resource is an official link or contact, FIRST CLASS alongside rules. This is why the feature is Rules AND Resources',
      'public.government_resources does not exist; migration 0012 is not applied.');
  else
    perform t.assert(
      'government-resources-are-first-class',
      '2m: permit application, planning department, zoning map, ADU handbook, fee schedule, pre-approved plans, design standards, building department, ADU contact, ordinance, FAQ',
      (select count(*) from unnest(coalesce(t.reg_tokens('public.government_resources',
                 coalesce(t.reg_col('public.government_resources',
                   array['resource_type', '^kind$', '^type$', 'category']), 'resource_type')), '{}')) x
        where x ~* '(adu_page|permit|zoning_map|handbook|fee|preapproved|design_standards|planning_department|building_department|ordinance|faq|contact)') >= 8
        and t.reg_col('public.government_resources', array['jurisdiction_id']) is not null,
      'public.government_resources does not carry the kinds of resource 2m lists, or is not attached to a jurisdiction. A resource that cannot be told apart from a rule leaves the "Resources" half of the feature name unrepresented, and a homeowner who cannot find the permit application is stuck whether or not ADUAtlas knows the setback');

    if v_town is not null then
      insert into public.government_resources
        (jurisdiction_id, resource_type, field_state, label, url, source_url, source_type, source_checked_date)
      values (v_town, 'planning_zoning_page', 'verified_from_source',
              'Planning and zoning', 'https://www.example.gov/planning',
              'https://www.example.gov/planning', 'planning_department', '2026-09-26')
      returning id into v_res;

      perform t.assert_count(
        'a-known-link-is-not-a-known-rule',
        '2l: knowing where a city publishes its rules is not knowing what they say',
        'service_role', null,
        format('select 1 from public.regulatory_provisions where jurisdiction_id = %L', v_town),
        0,
        'recording an official resource link created a provision for the jurisdiction. A link to a planning department is not a researched requirement and must never become one');

      perform t.reg_unseen(
        'an-unpublished-resource-does-not-leak',
        '2l: unpublished records do not leak',
        'anon', null,
        format('select 1 from public.government_resources_public where id = %L', v_res),
        'a resource Amy has not published is already on the public page');

      perform t.assert_changes_nothing(
        'homeowner-cannot-rewrite-an-official-link',
        '2l: editable content and URLs are admin-only; enforced in the database, not the browser',
        'authenticated', v_fa,
        format('update public.government_resources set url = ''https://evil.test'' where id = %L', v_res),
        'a signed-in homeowner can rewrite an official government link. ADUAtlas would send homeowners to whatever URL an attacker chose, under a government''s name');

      perform t.reg_refused(
        'a-resource-that-claims-to-exist-must-lead-somewhere',
        '2m: a resource is an official link OR CONTACT; a resource ADUAtlas claims to have found must actually lead somewhere',
        format('update public.government_resources set url = null, phone = null, email = null, contact_name = null where id = %L', v_res),
        'a resource can be marked verified from source with no link, no phone, no email and no named contact, which is a row that says ADUAtlas found something and cannot say what');

      perform t.reg_refused(
        'a-resource-silence-carries-no-link',
        '2m: "this jurisdiction publishes none" is a finding, and a finding needs a source and a date and carries no link, because a link would contradict it',
        format('update public.government_resources set field_state = ''source_did_not_state'' where id = %L', v_res),
        'a resource can say the jurisdiction publishes no such thing while still carrying the link to it');
    end if;
  end if;

  -- ── the indexability threshold is a positive control, not a wall ─────────
  if v_vt is not null and t.has_relation('public.jurisdiction_coverage_public') then
    insert into public.jurisdictions (jurisdiction_type, parent_id, name, slug, published_at)
    values ('municipality', v_vt, 'Well Researched', t.nextlabel('researched'), now())
    returning id into v_thick;

    foreach v_topic in array array['adu_allowed', 'max_size', 'height_limit',
                                   'setback_rear', 'parking_required', 'min_lot_size']
    loop
      v_i := v_i + 1;
      insert into public.regulatory_provisions
        (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
         source_type, source_checked_date, review_status, verification_status)
      values (v_thick, v_topic, 'verified_from_source', 'stated value ' || v_i,
              'https://www.example.gov/ordinance', 'Town ADU Ordinance', 'municipal_ordinance',
              '2026-09-01', 'published', 'source_checked');
    end loop;

    perform t.assert_count(
      'a-researched-page-is-offered-to-search-engines',
      '2l: a jurisdiction page is indexable WHERE THERE IS ENOUGH VERIFIED CONTENT to justify one',
      'anon', null,
      format('select 1 from public.jurisdiction_coverage_public where jurisdiction_id = %L and is_indexable', v_thick),
      1,
      'a jurisdiction with six verified, sourced, published rules is still not considered indexable, so the threshold is a wall rather than a quality bar and no jurisdiction page would ever be offered to search engines');

    perform t.assert_count(
      'coverage-counts-what-is-verified',
      '2l: coverage is counted from the published rows, never stored',
      'anon', null,
      format($q$select 1 from public.jurisdiction_coverage_public
                where jurisdiction_id = %L and topics_verified = 6
                  and topics_not_researched = topics_tracked - 6$q$, v_thick),
      1,
      'coverage does not agree with the published rows that exist, so the number a homeowner reads about how much ADUAtlas knows is not derived from what ADUAtlas knows');
  end if;
end
$$;
