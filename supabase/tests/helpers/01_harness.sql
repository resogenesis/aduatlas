-- =============================================================================
-- 01_harness.sql — the assertion harness.
--
-- Deliberately dependency-free: no pgTAP, no extension a developer has to
-- install, nothing but plpgsql. The suite has to be runnable by whoever picks
-- this repository up next, on a stock Homebrew Postgres, or it will rot.
--
-- Everything lives in schema `t`, which the API roles are never granted, so the
-- harness cannot itself become a hole in the access model it is testing. In
-- particular `t` is NOT in schema public, where the shim's ALTER DEFAULT
-- PRIVILEGES would hand anon full access to the results table.
--
-- THE CENTRAL IDEA. A test never asserts against the schema as the superuser
-- who built it. It asks the database the same question PostgREST would ask, as
-- the same role, with the same JWT claim GUCs, and records what came back:
--
--     t.q('anon',          null,   'select contact_email from builders_public_profile')
--     t.q('authenticated', v_uid,  'select * from builders_public')
--     t.x('authenticated', v_uid,  'update users set paid_at = now()')
--
-- Each returns jsonb: {ok, rows|rowcount, error, sqlstate}. A permission denied
-- and an RLS filter look different on purpose — `ok:false` with a message is a
-- refused statement, `ok:true` with zero rows is a policy that filtered the
-- row — and the assertions below distinguish them, because the two failures
-- have different consequences for the product.
--
-- Every assertion carries the BUSINESS RULE it protects, not just a name, so a
-- failure reads as "which rule broke" and not "expected t, got f".
-- =============================================================================

drop schema if exists t cascade;
create schema t;

-- The API roles get no access to the harness at all.
revoke all on schema t from anon, authenticated, service_role;

-- ── the ledger ──────────────────────────────────────────────────────────────
create table t.results (
  seq       serial primary key,
  suite     text not null,
  name      text not null,
  rule      text not null,
  status    text not null check (status in ('pass', 'fail', 'skip')),
  detail    text,
  recorded_at timestamptz not null default clock_timestamp()
);

-- The file currently running. Set by each invariant file's first line so a
-- failure names its suite without every assertion repeating it.
create table t.current (suite text not null);
insert into t.current values ('(unset)');

create or replace function t.suite(p_suite text)
returns void
language sql
as $$
  update t.current set suite = p_suite;
$$;

-- ── facts the RUNNER measured, not the suite ────────────────────────────────
-- Some claims are true only at one instant. "The migrations seed no admin" is a
-- claim about the database at the moment the chain finishes applying to an
-- EMPTY database, before this harness or a single fixture exists. Counting it
-- later, from inside a suite, measures whatever else has written to the
-- database since, which on staging includes a legitimate admin.
--
-- So run.sh measures such facts at that instant and writes them here after the
-- harness loads, and a suite reads them with t.chain_fact(). A fact the runner
-- never wrote reads as NULL, and a suite must treat NULL as a FAILURE:
-- unmeasured is not proved. Never a pass, never a skip.
create table t.chain_facts (
  key   text primary key,
  value text not null
);

create or replace function t.chain_fact(p_key text)
returns text
language sql
stable
as $$
  select value from t.chain_facts where key = p_key;
$$;

create or replace function t.record(p_name text, p_rule text, p_status text, p_detail text)
returns void
language plpgsql
as $$
declare
  v_suite text;
begin
  select suite into v_suite from t.current;
  insert into t.results (suite, name, rule, status, detail)
  values (v_suite, p_name, p_rule, p_status, p_detail);
  -- Printed as the run goes so a crash mid-suite still shows how far it got.
  if p_status = 'fail' then
    raise warning 'FAIL  %  [%]  %', p_name, p_rule, coalesce(p_detail, '');
  elsif p_status = 'skip' then
    raise notice 'SKIP  %  [%]  %', p_name, p_rule, coalesce(p_detail, '');
  else
    raise notice 'ok    %  [%]', p_name, p_rule;
  end if;
end
$$;

-- =============================================================================
-- Running a statement as an API role.
--
-- set_config on the two GUCs PostgREST populates, then SET LOCAL ROLE, then the
-- statement. SET LOCAL is scoped to the enclosing transaction; in autocommit
-- that is this statement alone, so no test can leak a role into the next one.
-- The exception handler's subtransaction also rolls back anything a refused
-- statement half-wrote, which is what makes the "should be denied" tests safe
-- to run against shared fixtures.
-- =============================================================================
create or replace function t.q(p_role text, p_uid uuid, p_sql text)
returns jsonb
language plpgsql
as $$
declare
  v_rows jsonb;
begin
  begin
    perform set_config('request.jwt.claim.sub',  coalesce(p_uid::text, ''), true);
    perform set_config('request.jwt.claim.role', p_role, true);
    execute format('set local role %I', p_role);
    execute 'select coalesce(jsonb_agg(_x), ''[]''::jsonb) from (' || p_sql || ') _x'
      into v_rows;
    reset role;
    return jsonb_build_object('ok', true, 'rows', v_rows, 'count', jsonb_array_length(v_rows));
  exception when others then
    return jsonb_build_object(
      'ok', false, 'rows', '[]'::jsonb, 'count', 0,
      'error', sqlerrm, 'sqlstate', sqlstate
    );
  end;
end
$$;

-- Same, for a statement that is not a SELECT (insert/update/delete/call).
create or replace function t.x(p_role text, p_uid uuid, p_sql text)
returns jsonb
language plpgsql
as $$
declare
  v_count bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub',  coalesce(p_uid::text, ''), true);
    perform set_config('request.jwt.claim.role', p_role, true);
    execute format('set local role %I', p_role);
    execute p_sql;
    get diagnostics v_count = row_count;
    reset role;
    return jsonb_build_object('ok', true, 'rowcount', v_count);
  exception when others then
    return jsonb_build_object(
      'ok', false, 'rowcount', 0,
      'error', sqlerrm, 'sqlstate', sqlstate
    );
  end;
end
$$;

-- First column of the first row, as text. Null when there were no rows.
create or replace function t.scalar(p_role text, p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v jsonb := t.q(p_role, p_uid, p_sql);
begin
  if not (v->>'ok')::boolean then
    return null;
  end if;
  if (v->>'count')::int = 0 then
    return null;
  end if;
  return (select value #>> '{}' from jsonb_each(v->'rows'->0) limit 1);
end
$$;

-- =============================================================================
-- Assertions. Each one names the business rule it protects.
-- =============================================================================
create or replace function t.assert(p_name text, p_rule text, p_cond boolean, p_detail text default null)
returns void
language plpgsql
as $$
begin
  if p_cond is true then
    perform t.record(p_name, p_rule, 'pass', null);
  else
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail, 'condition was ' || coalesce(p_cond::text, 'null')));
  end if;
end
$$;

create or replace function t.skip(p_name text, p_rule text, p_reason text)
returns void
language plpgsql
as $$
begin
  perform t.record(p_name, p_rule, 'skip', p_reason);
end
$$;

-- The statement must be REFUSED outright, and the message must contain
-- p_expect. Used where the product promises a specific sentence (a claim code
-- error, a refused project_signed) and where a different refusal would be a
-- different bug.
create or replace function t.assert_error(
  p_name text, p_rule text, p_role text, p_uid uuid, p_sql text,
  p_expect text, p_detail text default null
)
returns void
language plpgsql
as $$
declare
  v jsonb := t.x(p_role, p_uid, p_sql);
begin
  if (v->>'ok')::boolean then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') || 'the statement SUCCEEDED; it must be refused');
  elsif position(lower(p_expect) in lower(coalesce(v->>'error', ''))) = 0 then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      format('refused with %L, expected a message containing %L', v->>'error', p_expect));
  else
    perform t.record(p_name, p_rule, 'pass', null);
  end if;
end
$$;

-- A failure that means THE TEST is broken rather than that access was denied.
-- Without this, assert_denied would turn a typo in a test's own SQL into a green
-- security assertion, which is the most dangerous kind of false pass a suite like
-- this can have.
--
--   42501 insufficient_privilege   a real denial (no grant)
--   42703 undefined_column         a real denial for a view that withholds the
--                                  column: "does not exist" IS the guarantee
--   42P01 undefined_table          the relation is missing -> broken test
--   42883 undefined_function       the function is missing or misspelled
--   42601 syntax_error             a typo in the test
--   42804/42846 type mismatches    a typo in the test
create or replace function t.is_broken_test(p_sqlstate text)
returns boolean
language sql
immutable
as $$
  select p_sqlstate in ('42P01', '42883', '42601', '42804', '42846', '42P02', '42702');
$$;

-- Refused, for any reason that is genuinely a refusal. Used where the point is
-- that the role has no way in at all (no grant, no policy, no such column), and
-- the exact wording is the platform's business rather than ours.
create or replace function t.assert_denied(
  p_name text, p_rule text, p_role text, p_uid uuid, p_sql text, p_detail text default null
)
returns void
language plpgsql
as $$
declare
  v jsonb := t.x(p_role, p_uid, p_sql);
begin
  if (v->>'ok')::boolean then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') || 'the statement SUCCEEDED; the role must have no access');
  elsif t.is_broken_test(v->>'sqlstate') then
    perform t.record(p_name, p_rule, 'fail',
      format('THE TEST IS BROKEN, not the product: the statement failed with %s (%s), which is a defect in the test SQL rather than a denial. Fix the test before trusting this assertion.',
             v->>'sqlstate', v->>'error'));
  else
    perform t.record(p_name, p_rule, 'pass', null);
  end if;
end
$$;

create or replace function t.assert_ok(
  p_name text, p_rule text, p_role text, p_uid uuid, p_sql text, p_detail text default null
)
returns void
language plpgsql
as $$
declare
  v jsonb := t.x(p_role, p_uid, p_sql);
begin
  if (v->>'ok')::boolean then
    perform t.record(p_name, p_rule, 'pass', null);
  else
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') || format('refused with %L', v->>'error'));
  end if;
end
$$;

-- The statement must CHANGE NOTHING: either refused, or accepted and matching
-- zero rows. This is the honest assertion for a write that RLS filters rather
-- than rejects — an UPDATE or DELETE whose USING clause excludes every row
-- succeeds with rowcount 0 and is not an error. Asserting "denied" there would
-- fail against a correctly locked-down table, and asserting "ok" would pass
-- against a wide-open one.
create or replace function t.assert_changes_nothing(
  p_name text, p_rule text, p_role text, p_uid uuid, p_sql text, p_detail text default null
)
returns void
language plpgsql
as $$
declare
  v jsonb := t.x(p_role, p_uid, p_sql);
begin
  if not (v->>'ok')::boolean and t.is_broken_test(v->>'sqlstate') then
    perform t.record(p_name, p_rule, 'fail',
      format('THE TEST IS BROKEN, not the product: the statement failed with %s (%s). Fix the test before trusting this assertion.',
             v->>'sqlstate', v->>'error'));
  elsif not (v->>'ok')::boolean then
    -- Refused outright: stronger than filtered, and still correct.
    perform t.record(p_name, p_rule, 'pass', null);
  elsif (v->>'rowcount')::bigint <> 0 then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      format('the statement changed %s row(s); it must match none', v->>'rowcount'));
  else
    perform t.record(p_name, p_rule, 'pass', null);
  end if;
end
$$;

-- The query must SUCCEED and return exactly p_count rows. This is the
-- assertion for an RLS filter: the role is allowed to ask, and the policy
-- decides what it sees.
create or replace function t.assert_count(
  p_name text, p_rule text, p_role text, p_uid uuid, p_sql text,
  p_count int, p_detail text default null
)
returns void
language plpgsql
as $$
declare
  v jsonb := t.q(p_role, p_uid, p_sql);
begin
  if not (v->>'ok')::boolean then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      format('the query was refused (%L); it should have run and returned %s row(s)',
             v->>'error', p_count));
  elsif (v->>'count')::int <> p_count then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      format('returned %s row(s), expected %s', v->>'count', p_count));
  else
    perform t.record(p_name, p_rule, 'pass', null);
  end if;
end
$$;

create or replace function t.assert_scalar(
  p_name text, p_rule text, p_role text, p_uid uuid, p_sql text,
  p_expect text, p_detail text default null
)
returns void
language plpgsql
as $$
declare
  v jsonb := t.q(p_role, p_uid, p_sql);
  v_got text;
begin
  if not (v->>'ok')::boolean then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') || format('the query was refused (%L)', v->>'error'));
    return;
  end if;
  if (v->>'count')::int = 0 then
    v_got := null;
  else
    v_got := (select value #>> '{}' from jsonb_each(v->'rows'->0) limit 1);
  end if;
  if v_got is not distinct from p_expect then
    perform t.record(p_name, p_rule, 'pass', null);
  else
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      format('got %L, expected %L', coalesce(v_got, '<null>'), coalesce(p_expect, '<null>')));
  end if;
end
$$;

-- Two statements, the same visible outcome. The point of the assertion is the
-- INDISTINGUISHABILITY, so it compares the refusal text rather than checking
-- each one separately: a claim-code probe must not be able to tell a wrong code
-- from a spent one.
create or replace function t.assert_same_error(
  p_name text, p_rule text, p_role text, p_uid uuid,
  p_sql_a text, p_sql_b text, p_detail text default null
)
returns void
language plpgsql
as $$
declare
  a jsonb := t.x(p_role, p_uid, p_sql_a);
  b jsonb := t.x(p_role, p_uid, p_sql_b);
begin
  if (a->>'ok')::boolean or (b->>'ok')::boolean then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') || 'one of the two statements succeeded; both must be refused');
  elsif (a->>'error') is distinct from (b->>'error') then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      format('the two refusals differ and leak which is which: %L vs %L', a->>'error', b->>'error'));
  else
    perform t.record(p_name, p_rule, 'pass', null);
  end if;
end
$$;

-- A relation must expose exactly p_expected columns — no more. The assertion
-- that matters for a view whose whole job is withholding columns: it fails on
-- an ADDED column, which is how an accidental `select b.*` gets caught.
create or replace function t.assert_columns(
  p_name text, p_rule text, p_relation text, p_expected text[], p_detail text default null
)
returns void
language plpgsql
as $$
declare
  v_actual  text[];
  v_extra   text[];
  v_missing text[];
begin
  select coalesce(array_agg(a.attname::text order by a.attname), '{}')
    into v_actual
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname || '.' || c.relname = p_relation
     and a.attnum > 0
     and not a.attisdropped;

  if v_actual = '{}' then
    perform t.record(p_name, p_rule, 'fail', format('%s does not exist', p_relation));
    return;
  end if;

  select coalesce(array_agg(x order by x), '{}') into v_extra
    from unnest(v_actual) x where x <> all (p_expected);
  select coalesce(array_agg(x order by x), '{}') into v_missing
    from unnest(p_expected) x where x <> all (v_actual);

  if v_extra = '{}' and v_missing = '{}' then
    perform t.record(p_name, p_rule, 'pass', null);
  else
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      format('%s exposes unexpected column(s) %s and is missing %s',
             p_relation, v_extra::text, v_missing::text));
  end if;
end
$$;

-- =============================================================================
-- Existence probes. Used by the 0010/0011 suites, which must fail loudly when
-- the migration is missing rather than silently pass.
-- =============================================================================
create or replace function t.has_column(p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from information_schema.columns
     where table_schema || '.' || table_name = p_table
       and column_name = p_column
  );
$$;

create or replace function t.has_relation(p_relation text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname || '.' || c.relname = p_relation
  );
$$;

create or replace function t.has_function(p_name text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname || '.' || p.proname = p_name
  );
$$;
