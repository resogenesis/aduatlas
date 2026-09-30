-- =============================================================================
-- INVARIANT: the database half of the first-admin bootstrap.
--
-- This is the launch blocker the blind-spot audit found: until the bootstrap
-- existed, NOBODY could create the first admin. /api/admin/create-admin required
-- an existing admin, api/_admin.js returns null for every other caller, and the
-- 0001 signup trigger clamps every new account to homeowner or pro. The only
-- route in was hand editing production Postgres, so Amy could not have reached
-- the console on launch morning.
--
-- The endpoint's own logic is JavaScript and is not testable from here. What IS
-- testable, and what the endpoint's safety rests on, are four database facts:
--
--   1. A FRESH DATABASE HAS NO ADMIN. This is what makes the bootstrap necessary,
--      and its "zero admins" gate is only a real gate if zero is the starting
--      point rather than an accident of seeding. It is measured by the RUNNER
--      at the chain boundary, not counted here; see the note on fact 1 below.
--   2. 'admin' IS a storable role, so the bootstrap has something to promote to.
--   3. SIGNUP CANNOT MINT AN ADMIN. If it could, the bootstrap's gate would be
--      trivially bypassable by anyone with the public signup form.
--   4. A CLIENT CANNOT PROMOTE ITSELF OR ANYONE ELSE. Only the service role can,
--      which is the credential the endpoint holds.
--
-- Fact 3 and fact 4 are the two halves of "the bootstrap closes the door behind
-- itself": once one admin exists, the endpoint refuses, and there is no other way
-- for a second one to appear except through an existing admin.
-- =============================================================================
select t.suite('170 admin bootstrap');

do $$
declare
  v_admins   int;
  v_accounts int;
  v_home     uuid;
  v_auth   uuid;
begin
  -- ── 1. a fresh database has no admin ──────────────────────────────────────
  -- MEASURED BY THE RUNNER, NOT COUNTED HERE. run.sh counts admins, and accounts
  -- of any role, the instant the migration chain finishes applying to an EMPTY
  -- database: before the harness loads and before a single fixture exists. That
  -- is the only moment the count is about the migrations and nothing else. The
  -- numbers arrive in t.chain_facts.
  --
  -- This used to count admins here, at run time, excluding this suite's own
  -- 'admin-%@example.test' fixtures by email. That had two flaws:
  --   * against a database that already holds a LEGITIMATE admin (staging,
  --     seeded to production shape, which is where this suite must also run) it
  --     failed for a reason that had nothing to do with the migrations;
  --   * a migration that seeded an admin under a fixture-shaped address passed.
  -- Measuring at the chain boundary fixes both and loosens nothing: the number
  -- asserted is still "admins that exist because of the migrations", and it
  -- must still be zero.
  --
  -- In --target mode the database under test was not built by the runner. The
  -- runner builds the SAME chain from nothing in a throwaway cluster, measures
  -- there, and separately proves (target-chain-matches-repository) that the
  -- target's applied migrations are exactly the repository's, so the
  -- measurement describes the target's chain.
  --
  -- A missing measurement is a FAILURE, never a skip. An unmeasured claim is
  -- not a passed one.
  v_admins   := t.chain_fact('admins_after_chain')::int;
  v_accounts := t.chain_fact('accounts_after_chain')::int;

  perform t.assert(
    'fresh-database-has-no-admin',
    'the first-admin bootstrap exists because a fresh database has no admin, and its "zero admins" gate is only a gate if that is true',
    v_admins = 0,
    case
      when v_admins is null then
        'NOT MEASURED. The runner recorded no admin count at the moment the migration chain finished applying, so nothing proves the migrations seed no admin. Run the suite through supabase/tests/run.sh, which measures it before any fixture exists.'
      else format(
        'the migration chain, applied to an empty database, produced %s admin account(s) before a single fixture existed. A migration seeds an admin, so its credentials are in version control and the bootstrap gate can never close.',
        v_admins)
    end);

  perform t.assert(
    'fresh-database-has-no-accounts',
    'no migration seeds a login of any kind: a seeded account is a credential in version control, whatever role it holds today',
    v_accounts = 0,
    case
      when v_accounts is null then
        'NOT MEASURED. The runner recorded no account count at the moment the migration chain finished applying.'
      else format(
        'the migration chain, applied to an empty database, produced %s row(s) across auth.users and public.users before a single fixture existed. A seeded account can be promoted later, so it is an admin credential in waiting.',
        v_accounts)
    end);

  -- ── 2. 'admin' is a storable role ─────────────────────────────────────────
  v_home := t.mk_account('homeowner');
  v_auth := t.authid(v_home);

  perform t.assert_ok(
    'admin-role-storable',
    'the bootstrap has something to promote to',
    'service_role', null,
    format('update public.users set role = ''admin'' where id = %L', v_home),
    'the role column cannot hold ''admin'', so the first-admin bootstrap has nothing to write and Amy can never reach the console');

  perform t.assert_scalar(
    'admin-role-persisted',
    'the bootstrap has something to promote to',
    'service_role', null,
    format('select role from public.users where id = %L', v_home),
    'admin',
    'the promotion was accepted but did not persist');

  perform t.assert_denied(
    'role-vocabulary-closed',
    'the role column holds homeowner, pro or admin, and nothing else',
    'service_role', null,
    format('update public.users set role = ''superadmin'' where id = %L', v_home),
    'an invented role was accepted, so the console''s admin check can be bypassed by a role nobody wrote a policy for');

  -- ── 3. signup cannot mint an admin ────────────────────────────────────────
  -- The bootstrap's gate is "zero admins". If a public signup could create one,
  -- an attacker could create an admin and the gate would already be closed
  -- against Amy, or worse, they would be the admin.
  declare
    v_a uuid;
    v_r text;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'bootstrap-escalation@example.test',
            '{"role": "admin", "is_admin": true, "app_metadata": {"role": "admin"}}'::jsonb)
    returning id into v_a;
    select role into v_r from public.users where auth_user_id = v_a;

    perform t.assert(
      'signup-cannot-mint-admin',
      'the signup trigger clamps every new account to homeowner or pro',
      v_r = 'homeowner',
      format('a signup asking for admin in three different metadata shapes produced role %L. The clamp in handle_new_auth_user is the only thing between the public signup form and the admin console, and it is also what makes the bootstrap''s "zero admins" gate meaningful.', v_r));
  end;

  -- ── 4. a client cannot promote anyone ─────────────────────────────────────
  declare
    v_victim uuid := t.mk_account('homeowner');
    v_vauth  uuid;
  begin
    v_vauth := t.authid(v_victim);

    perform t.assert_denied(
      'client-cannot-self-promote',
      'only the service role creates an admin, which is the credential the bootstrap endpoint holds',
      'authenticated', v_vauth,
      'update public.users set role = ''admin'' where auth_user_id = auth.uid()',
      'a signed-in account can promote itself to admin with the anon key, so the bootstrap endpoint is not the only door into the console');

    perform t.assert_changes_nothing(
      'client-cannot-promote-other',
      'only the service role creates an admin',
      'authenticated', v_vauth,
      format('update public.users set role = ''admin'' where id = %L', v_home),
      'a signed-in account can promote another account to admin');

    perform t.assert_denied(
      'anon-cannot-promote',
      'only the service role creates an admin',
      'anon', null,
      format('update public.users set role = ''admin'' where id = %L', v_victim),
      'the anonymous role can promote an account to admin');

    perform t.assert_scalar(
      'victim-still-homeowner',
      'only the service role creates an admin',
      'service_role', null,
      format('select role from public.users where id = %L', v_victim),
      'homeowner',
      'one of the refused promotion attempts took effect anyway');
  end;

  -- ── the bootstrap secret is never a database value ───────────────────────
  -- ADMIN_BOOTSTRAP_SECRET is a deployment environment variable. If it ever
  -- became a row, it would be readable by whatever can read that table and it
  -- would survive in backups after the instruction to delete it.
  perform t.assert_count(
    'bootstrap-secret-not-in-database',
    'the bootstrap secret is a deployment environment variable, never a database row',
    'service_role', null,
    $q$select 1 from information_schema.columns
        where table_schema = 'public'
          and (column_name ilike '%bootstrap%' or column_name ilike '%admin_secret%')$q$,
    0,
    'a bootstrap-secret column exists in the schema. The secret must stay an environment variable so that deleting it after first use actually removes the path, and so it never lands in a database backup');
end
$$;
