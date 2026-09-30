-- =============================================================================
-- INVARIANT: the approved 0008 backfill did exactly what it was approved to do.
--
-- THIS SUITE IS A RESTATEMENT. The intermediate scratch proof's test 36 carried
-- an "existing values kept" clause written before the 0008 backfill was approved.
-- Under that clause a stored `turnkey = false` had to survive, which is the
-- opposite of what 0008 deliberately does. The clause was obsolete, not the test.
--
-- The security and truthfulness intent is preserved in full and split into the
-- three claims that 0008 actually makes:
--
--   CLEARED   values that could only have come from the old column defaults are
--             nulled, because before 0008 there was no third state and a stored
--             false was indistinguishable from a company that never spoke.
--   SURVIVED  values no default could have produced are somebody's real answer
--             and are untouched: turnkey = true, build_approach 'custom' or
--             'prefab'.
--   NOT TOUCHED AFTERWARDS  anything written after 0008 is a real answer, because
--             from 0008 on the three states are distinguishable. A `false` or a
--             `'both'` chosen from now on must persist. The one-time correction
--             must never have become a recurring job or a trigger.
--
-- The rows under test are REAL pre-0008 rows: helpers/pre_0008_seed.sql inserts
-- them into public.builders between migration 0007 and migration 0008, so the
-- actual migration performs the actual correction on them. Nothing here replays
-- or re-implements the backfill statements.
-- =============================================================================
select t.suite('140 the 0008 backfill');

do $$
declare
  v_id uuid;
begin
  -- TARGET MODE (run.sh --target): the 0008 backfill is a ONE-TIME transformation
  -- of rows that existed before 0008 ran. A deployed database keeps no record of
  -- which rows those were, so nothing here can be proved against one, and
  -- tfix.pre0008 does not exist there. Say so as a SKIP rather than crash. In
  -- the default and --existing runs the fixture always exists, this branch never
  -- fires, and a missing fixture still fails loudly exactly as before. For
  -- staging, the backfill on real pre-0008-shaped data is proved by the upgrade
  -- rehearsal instead.
  if t.chain_fact('mode') = 'target' then
    perform t.skip(
      'pre-0008-fixture-present',
      'the backfill can only be proved against rows that existed before it ran',
      'TARGET MODE: a deployed database carries no record of which rows predate 0008, so the backfill is not provable here. Proved in lane B by the default run and, for staging, by the upgrade rehearsal.');
    return;
  end if;

  -- Guard: the fixture must have run, or every assertion below is vacuous.
  perform t.assert(
    'pre-0008-fixture-present',
    'the backfill can only be proved against rows that existed before it ran',
    (select count(*) from tfix.pre0008) = 6,
    format('expected 6 pre-0008 fixture rows, found %s; without them this suite proves nothing about the backfill',
           (select count(*) from tfix.pre0008)));

  -- ── CLEARED: values attributable to the old defaults ─────────────────────
  select builder_id into v_id from tfix.pre0008 where label = 'default-turnkey';
  perform t.assert_scalar(
    'cleared-default-turnkey',
    '0008: a turnkey value that could only have come from the 0006 default is cleared',
    'service_role', null,
    format('select turnkey is null as r from public.builders where id = %L', v_id),
    'true',
    'a pre-0008 turnkey = false survived the backfill, so this listing goes on printing "No. Ask this builder about the scope they take on" as a claim the company never made');

  select builder_id into v_id from tfix.pre0008 where label = 'default-approach';
  perform t.assert_scalar(
    'cleared-default-approach',
    '0008: a build_approach of ''both'' that could only have come from the 0004 default is cleared',
    'service_role', null,
    format('select build_approach is null as r from public.builders where id = %L', v_id),
    'true',
    'a pre-0008 build_approach = ''both'' survived the backfill, so this listing goes on printing "Custom and prefab" — the broadest of the three capabilities — on behalf of a company that never stated it');

  select builder_id into v_id from tfix.pre0008 where label = 'both-defaults';
  perform t.assert_scalar(
    'cleared-both-turnkey',
    '0008: the seeded shape, where neither attribute was ever stated, ends with both unknown',
    'service_role', null,
    format('select turnkey is null as r from public.builders where id = %L', v_id),
    'true',
    'a listing that never addressed scope still carries a turnkey answer');

  perform t.assert_scalar(
    'cleared-both-approach',
    '0008: the seeded shape, where neither attribute was ever stated, ends with both unknown',
    'service_role', null,
    format('select build_approach is null as r from public.builders where id = %L', v_id),
    'true',
    'a listing that never stated a build method still carries one');

  -- ── SURVIVED: values no default could have produced ──────────────────────
  select builder_id into v_id from tfix.pre0008 where label = 'stated-turnkey';
  perform t.assert_scalar(
    'survived-stated-turnkey',
    '0008: turnkey = true is somebody''s real answer and is untouched',
    'service_role', null,
    format('select turnkey::text from public.builders where id = %L', v_id),
    'true',
    'the backfill destroyed a genuine turnkey = true answer, which is data loss on a company that did state its scope');

  select builder_id into v_id from tfix.pre0008 where label = 'stated-custom';
  perform t.assert_scalar(
    'survived-stated-custom',
    '0008: build_approach ''custom'' could only have been chosen, so it stays',
    'service_role', null,
    format('select build_approach from public.builders where id = %L', v_id),
    'custom',
    'the backfill destroyed a genuine ''custom'' answer');

  select builder_id into v_id from tfix.pre0008 where label = 'stated-prefab';
  perform t.assert_scalar(
    'survived-stated-prefab',
    '0008: build_approach ''prefab'' could only have been chosen, so it stays',
    'service_role', null,
    format('select build_approach from public.builders where id = %L', v_id),
    'prefab',
    'the backfill destroyed a genuine ''prefab'' answer');

  -- The 'default-turnkey' row also carried a stated 'custom'. The backfill must
  -- have cleared one column and kept the other on the SAME row, which is what
  -- makes it a correction rather than a wipe.
  select builder_id into v_id from tfix.pre0008 where label = 'default-turnkey';
  perform t.assert_scalar(
    'survived-alongside-cleared',
    '0008 is a correction, not a wipe: one column clears while the other survives on the same row',
    'service_role', null,
    format('select build_approach from public.builders where id = %L', v_id),
    'custom',
    'clearing the defaulted turnkey on this row also destroyed its genuine build_approach answer');

  -- ── NOT TOUCHED AFTERWARDS: post-0008 writes are real answers ────────────
  -- From 0008 on the three states are storable and distinguishable, so a false
  -- or a 'both' chosen now IS an answer and nothing may null it.
  declare
    v_new uuid := t.mk_builder();
  begin
    perform t.assert_ok(
      'post-0008-false-write',
      '0008: anything written after the migration is a real answer',
      'service_role', null,
      format('update public.builders set turnkey = false, build_approach = ''both'' where id = %L', v_new),
      'a deliberate "No" and a deliberate "custom and prefab" could not be recorded after 0008');

    perform t.assert_scalar(
      'post-0008-false-persists',
      '0008: a false written after the migration is a company stating No, and must persist',
      'service_role', null,
      format('select turnkey::text from public.builders where id = %L', v_new),
      'false',
      'a turnkey = false written after 0008 did not persist; the one-time correction has become a recurring job or a trigger, and a company that answered No is being reported as silent');

    perform t.assert_scalar(
      'post-0008-both-persists',
      '0008: a ''both'' written after the migration is a real answer, and must persist',
      'service_role', null,
      format('select build_approach from public.builders where id = %L', v_new),
      'both',
      'a build_approach = ''both'' written after 0008 did not persist');

    -- A second write of the same values must also stick: proves there is no
    -- deferred or statement-level cleanup waiting to fire.
    perform t.assert_ok(
      'post-0008-rewrite',
      '0008: the correction was one time only and never became a job',
      'service_role', null,
      format('update public.builders set turnkey = false where id = %L', v_new),
      'rewriting a deliberate No was refused');

    perform t.assert_scalar(
      'post-0008-rewrite-persists',
      '0008: the correction was one time only and never became a job',
      'service_role', null,
      format('select turnkey::text from public.builders where id = %L', v_new),
      'false',
      'a rewritten deliberate No did not persist');
  end;

  -- ── the correction is not lurking as a trigger ───────────────────────────
  perform t.assert_count(
    'no-backfill-trigger',
    '0008: the one-time correction must never have been copied into a trigger or a job',
    'service_role', null,
    $q$select 1 from pg_trigger tg
        join pg_class c on c.oid = tg.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = tg.tgfoid
       where n.nspname = 'public' and c.relname = 'builders'
         and not tg.tgisinternal
         and pg_get_functiondef(p.oid) ilike '%turnkey%is%false%'$q$,
    0,
    'a trigger on builders contains the one-time turnkey correction, which would keep nulling deliberate answers forever');

  -- ── the three states are now representable, which is the point ───────────
  declare
    v_three uuid := t.mk_builder();
  begin
    perform t.assert_ok(
      'state-unknown-storable',
      '0008: null means the company never stated it, and is storable',
      'service_role', null,
      format('update public.builders set turnkey = null, build_approach = null where id = %L', v_three),
      'the unknown state cannot be stored, so 0008 widened the columns without making the third state reachable');

    perform t.assert_scalar(
      'state-unknown-stored',
      '0008: null means the company never stated it, and is storable',
      'service_role', null,
      format('select (turnkey is null and build_approach is null) as r from public.builders where id = %L', v_three),
      'true',
      'the unknown state did not persist');
  end;
end
$$;
