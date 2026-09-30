-- =============================================================================
-- THE POSITIVE CONTROL. Run first, so nothing after it is trusted on faith.
--
-- Every other file in this directory asserts that the product behaves. This one
-- asserts that THE HARNESS CAN TELL. A suite that cannot fail is not evidence,
-- and there are three specific ways this harness could be green for the wrong
-- reason:
--
--   1. ROLE SWITCHING SILENTLY NOT HAPPENING. If `set local role` did nothing,
--      every query would run as the superuser who built the schema. That failure
--      mode is fail-SAFE for the deny tests (they would go red, because the
--      statement would succeed) but it would make the "a paid homeowner can read
--      the directory" tests meaningless. Asserted directly: current_user and
--      auth.uid() must be what was asked for.
--
--   2. THE SUPABASE DEFAULT PRIVILEGES NOT IN FORCE. Supabase grants anon and
--      authenticated ALL on every new table in schema public, and our migrations
--      revoke that and grant back precisely. Without the default privileges the
--      revokes are no-ops against a privilege that was never there — the
--      migrations read identically and EVERY access test passes for the wrong
--      reason. Asserted by creating a table the way a migration would and
--      checking that anon can reach it before anything locks it down.
--
--   3. THE ASSERTIONS NOT ACTUALLY FAILING. Asserted by making a false claim on
--      purpose and confirming a 'fail' row lands, then removing that row so it
--      does not pollute the run's own result. This is the only place in the suite
--      that deletes from the ledger, and it deletes exactly the row it created.
-- =============================================================================
select t.suite('000 harness self-test');

do $$
declare
  v_home uuid := t.mk_paid_homeowner();
  v_auth uuid;
  v_before bigint;
  v_after  bigint;
begin
  v_auth := t.authid(v_home);

  -- ── control 1: role switching is real ────────────────────────────────────
  perform t.assert_scalar(
    'role-switch-anon',
    'the harness runs statements as the role it names',
    'anon', null,
    'select current_user::text',
    'anon',
    'a statement the harness said it was running as anon actually ran as somebody else, so every access assertion in this suite is meaningless');

  perform t.assert_scalar(
    'role-switch-authenticated',
    'the harness runs statements as the role it names',
    'authenticated', v_auth,
    'select current_user::text',
    'authenticated',
    'a statement the harness said it was running as authenticated ran as somebody else');

  perform t.assert_scalar(
    'role-switch-service',
    'the harness runs statements as the role it names',
    'service_role', null,
    'select current_user::text',
    'service_role',
    'a statement the harness said it was running as the service role ran as somebody else');

  perform t.assert_scalar(
    'jwt-claim-wired',
    'the harness supplies the same JWT claim PostgREST supplies, so policies read a production-shaped identity',
    'authenticated', v_auth,
    format('select (auth.uid() = %L) as r', v_auth),
    'true',
    'auth.uid() does not return the identity the harness passed in, so every policy that keys off auth.uid() is being evaluated against the wrong person');

  perform t.assert_scalar(
    'anon-has-no-uid',
    'an anonymous caller has no identity',
    'anon', null,
    'select auth.uid() is null as r',
    'true',
    'auth.uid() returns an identity for an anonymous caller, which would make every "anon sees nothing" test pass or fail for the wrong reason');

  perform t.assert_scalar(
    'role-does-not-leak',
    'SET LOCAL ROLE is scoped to one statement and cannot leak into the next test',
    'service_role', null,
    'select current_user::text',
    'service_role',
    'the role from a previous statement leaked into this one');

  -- ── control 1b: the service role really does bypass RLS ──────────────────
  perform t.assert(
    'service-role-bypasses-rls',
    'the service role bypasses RLS, as it does on Supabase',
    (select rolbypassrls from pg_roles where rolname = 'service_role'),
    'service_role does not carry BYPASSRLS, so every test that uses it to inspect the real table state is being filtered by policy and may be reading a partial truth');

  -- Two accounts exist by construction, so this control does not depend on what
  -- any other suite happened to create or on the order files run in. The service
  -- role must see both; the signed-in role must see exactly its own.
  declare
    v_second  uuid := t.mk_paid_homeowner();
    v_as_svc  int;
    v_as_user int;
  begin
    v_as_svc  := (t.q('service_role',  null,   'select 1 from public.users')->>'count')::int;
    v_as_user := (t.q('authenticated', v_auth, 'select 1 from public.users')->>'count')::int;

    perform t.assert(
      'service-role-sees-all-users',
      'the service role bypasses RLS, as it does on Supabase',
      v_as_svc >= 2,
      format('two accounts exist but the service role sees %s users row(s), so it is being filtered by RLS and the suite''s idea of "what is really stored" is wrong', v_as_svc));

    perform t.assert(
      'rls-actually-filters',
      'RLS is doing the filtering the suite attributes to it',
      v_as_user = 1 and v_as_svc > v_as_user,
      format('the service role sees %s users row(s) and the signed-in role sees %s. These must differ, or RLS is not filtering and every "sees only their own row" assertion in this suite is passing for another reason', v_as_svc, v_as_user));
  end;

  -- ── control 2: the default privileges are in force ───────────────────────
  -- A table created the way a migration creates one must be reachable by anon
  -- BEFORE anything revokes. If this fails, every `revoke all ... from anon`
  -- in the migration chain is a no-op and the whole suite is vacuous.
  create table public.__harness_privilege_probe (id int);
  insert into public.__harness_privilege_probe values (1);

  perform t.assert(
    'default-privileges-in-force',
    'the Supabase ALTER DEFAULT PRIVILEGES regime is in force, so the migrations'' revokes are meaningful',
    (t.q('anon', null, 'select 1 from public.__harness_privilege_probe')->>'ok')::boolean,
    'a freshly created table in schema public is NOT reachable by anon, which means the shim''s ALTER DEFAULT PRIVILEGES did not apply. Every "anon is denied" assertion in this suite would then pass because the grant never existed, not because a migration removed it. The suite proves nothing until this is fixed.');

  -- And that revoking it does what the migrations assume.
  revoke all on public.__harness_privilege_probe from anon, authenticated;
  perform t.assert(
    'revoke-actually-revokes',
    'a revoke in a migration actually removes access',
    not (t.q('anon', null, 'select 1 from public.__harness_privilege_probe')->>'ok')::boolean,
    'revoking anon''s access to a table did not stop anon reading it');

  drop table public.__harness_privilege_probe;

  -- ── control 3: a false assertion really fails ────────────────────────────
  select count(*) into v_before from t.results where status = 'fail';
  perform t.assert(
    '__deliberate_failure_probe',
    'the harness records a failure when an assertion is false',
    false,
    'this row is created on purpose by the self-test and removed immediately below');
  select count(*) into v_after from t.results where status = 'fail';

  -- Remove the deliberate failure, by name, so it cannot be mistaken for a real
  -- one and cannot fail the run.
  delete from t.results where name = '__deliberate_failure_probe';

  perform t.assert(
    'failures-are-detected',
    'the harness records a failure when an assertion is false',
    v_after = v_before + 1,
    'a deliberately false assertion did NOT produce a failure row. The harness cannot report a broken business rule, so every green result in this run is worthless.');

  -- And that a broken test is not mistaken for a denial.
  perform t.assert(
    'broken-test-not-a-pass',
    'a defect in a test''s own SQL is reported as a broken test, never as a denial',
    t.is_broken_test('42601') and t.is_broken_test('42P01') and not t.is_broken_test('42501'),
    'the harness classifies a syntax error or a missing relation as a successful denial, which would turn a typo in a security test into a green result');

  -- ── the ledger itself is not reachable by an API role ────────────────────
  perform t.assert_denied(
    'ledger-private',
    'the harness cannot become a hole in the access model it is testing',
    'anon', null,
    'select count(*) from t.results',
    'the anonymous role can read the test ledger, which means schema t is exposed in a database where this suite ran');

  perform t.assert_denied(
    'fixtures-private',
    'the harness cannot become a hole in the access model it is testing',
    'authenticated', v_auth,
    'select t.mk_builder()',
    'a signed-in role can call the fixture builders, which would let it create builder listings');
end
$$;
