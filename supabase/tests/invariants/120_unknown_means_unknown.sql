-- =============================================================================
-- INVARIANT (decision 2b): unknown means unknown. ADUAtlas never infers a
-- builder capability from a missing field and never prints a column default as a
-- claim.
--
-- This is about two specific columns, because those are the two that arrived with
-- a default that reads as an answer:
--
--   turnkey         `not null default false` (0006) made every seeded listing say
--                   "does not take the project end to end" — a claim about the
--                   company that nobody made.
--   build_approach  `not null default 'both'` (0004) made every seeded listing
--                   say "custom and prefab", the broadest of the three.
--
-- What the database has to guarantee is that the THIRD STATE EXISTS and survives:
-- nullable, no default, and carried through to every reader as null rather than
-- silently coalesced somewhere on the way out. A reader that turned null back
-- into false or 'both' would reintroduce exactly the claim 2b forbids.
--
-- The one-time correction of pre-existing rows is a different claim and is proved
-- separately in suite 140.
-- =============================================================================
select t.suite('120 unknown means unknown');

do $$
declare
  v_seeded uuid := t.mk_builder();          -- nothing stated: the seeded shape
  v_paid   uuid := t.mk_paid_homeowner();
  v_pa     uuid;
begin
  v_pa := t.authid(v_paid);

  -- ── the columns can hold the third state ─────────────────────────────────
  perform t.assert_scalar(
    'turnkey-nullable',
    '2b: turnkey must be able to hold "the company never stated it"',
    'service_role', null,
    $q$select attnotnull::text from pg_attribute a
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'builders' and a.attname = 'turnkey'$q$,
    'false',
    'builders.turnkey is NOT NULL again, so there is no way to record that a company never addressed the scope it takes on and every listing must assert something');

  perform t.assert_count(
    'turnkey-no-default',
    '2b: ADUAtlas never prints a column default as a claim',
    'service_role', null,
    $q$select 1 from pg_attrdef d
        join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'builders' and a.attname = 'turnkey'$q$,
    0,
    'builders.turnkey has a default again; a default on this column is a capability claim made on behalf of every company ADUAtlas seeds');

  perform t.assert_scalar(
    'approach-nullable',
    '2b: build_approach must be able to hold "the company never stated it"',
    'service_role', null,
    $q$select attnotnull::text from pg_attribute a
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'builders' and a.attname = 'build_approach'$q$,
    'false',
    'builders.build_approach is NOT NULL again');

  perform t.assert_count(
    'approach-no-default',
    '2b: ADUAtlas never prints a column default as a claim',
    'service_role', null,
    $q$select 1 from pg_attrdef d
        join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'builders' and a.attname = 'build_approach'$q$,
    0,
    'builders.build_approach has a default again; ''both'' is the broadest of the three capabilities and the widest possible overstatement');

  -- ── a newly seeded listing states nothing ────────────────────────────────
  perform t.assert_scalar(
    'seeded-turnkey-unknown',
    '2b: where the company''s own material did not state something, ADUAtlas does not know it',
    'service_role', null,
    format('select turnkey is null as r from public.builders where id = %L', v_seeded),
    'true',
    'a newly seeded listing already carries a turnkey answer nobody gave it');

  perform t.assert_scalar(
    'seeded-approach-unknown',
    '2b: where the company''s own material did not state something, ADUAtlas does not know it',
    'service_role', null,
    format('select build_approach is null as r from public.builders where id = %L', v_seeded),
    'true',
    'a newly seeded listing already carries a build method nobody gave it');

  -- ── null survives the journey to every reader ────────────────────────────
  perform t.assert_scalar(
    'null-through-public-profile-turnkey',
    '2b: the interface omits the attribute, which means the view must hand it over as null',
    'anon', null,
    format('select turnkey is null as r from public.get_public_builder(%L)', (select slug from public.builders where id = v_seeded)),
    'true',
    'the public profile view turns an unknown turnkey into an answer, so the page prints "No. Ask this builder about the scope they take on" about a company that never said so');

  perform t.assert_scalar(
    'null-through-public-profile-approach',
    '2b: the interface omits the attribute, which means the view must hand it over as null',
    'anon', null,
    format('select build_approach is null as r from public.get_public_builder(%L)', (select slug from public.builders where id = v_seeded)),
    'true',
    'the public profile view turns an unknown build method into "Custom and prefab"');

  perform t.assert_scalar(
    'null-through-paid-directory-turnkey',
    '2b: the interface omits the attribute on every surface',
    'authenticated', v_pa,
    format('select turnkey is null as r from public.builders_public where id = %L', v_seeded),
    'true',
    'the paid directory view turns an unknown turnkey into an answer');

  perform t.assert_scalar(
    'null-through-paid-directory-approach',
    '2b: the interface omits the attribute on every surface',
    'authenticated', v_pa,
    format('select build_approach is null as r from public.builders_public where id = %L', v_seeded),
    'true',
    'the paid directory view turns an unknown build method into an answer');

  -- ── the builder portal can store all three states ────────────────────────
  -- Before 0008, save_my_builder coalesced a json null for turnkey to false and
  -- let a json null for build_approach fall through, so a "Not stated" control in
  -- the portal would have been a no-op and the widened columns would never have
  -- received a null from the one surface a builder writes through.
  declare
    v_b    uuid := t.mk_claimed_builder('{"turnkey": true, "build_approach": "custom"}'::jsonb);
    v_auth uuid;
  begin
    v_auth := t.owner_authid(v_b);

    perform t.assert_ok(
      'portal-writes-no',
      '2b: false still means the company stated No, and the portal must be able to say it',
      'authenticated', v_auth,
      'select public.save_my_builder(''{"turnkey": false, "build_approach": "prefab"}''::jsonb)',
      'the builder portal cannot record a deliberate No');

    perform t.assert_scalar(
      'portal-no-stored',
      '2b: false still means the company stated No',
      'service_role', null,
      format('select turnkey::text from public.builders where id = %L', v_b),
      'false',
      'a deliberate No from the builder portal was not stored');

    perform t.assert_ok(
      'portal-writes-unknown',
      '2b: a builder must be able to say "not stated" and have it stored as unknown',
      'authenticated', v_auth,
      'select public.save_my_builder(''{"turnkey": null, "build_approach": null}''::jsonb)',
      'the builder portal cannot record "not stated"');

    perform t.assert_scalar(
      'portal-unknown-stored-turnkey',
      '2b: a builder must be able to say "not stated" and have it stored as unknown',
      'service_role', null,
      format('select turnkey is null as r from public.builders where id = %L', v_b),
      'true',
      'a "not stated" turnkey from the portal was coalesced back to false, which is the 0006 bug 0008 exists to fix');

    perform t.assert_scalar(
      'portal-unknown-stored-approach',
      '2b: a builder must be able to say "not stated" and have it stored as unknown',
      'service_role', null,
      format('select build_approach is null as r from public.builders where id = %L', v_b),
      'true',
      'a "not stated" build method from the portal fell through to the stored value instead of clearing it');

    -- A key left OUT of the patch must leave the stored value alone. That is what
    -- lets the portal send a partial patch without erasing what it did not touch.
    perform t.assert_ok(
      'portal-partial-patch',
      '2b: a key left out of the patch leaves the stored value alone',
      'authenticated', v_auth,
      'select public.save_my_builder(''{"turnkey": true}''::jsonb)',
      'a partial patch was refused');

    perform t.assert_scalar(
      'portal-partial-kept-other',
      '2b: a key left out of the patch leaves the stored value alone',
      'service_role', null,
      format('select build_approach is null as r from public.builders where id = %L', v_b),
      'true',
      'patching turnkey alone also overwrote build_approach, so the portal cannot make one change at a time');

    perform t.assert_scalar(
      'portal-partial-set-named',
      '2b: a key left out of the patch leaves the stored value alone',
      'service_role', null,
      format('select turnkey::text from public.builders where id = %L', v_b),
      'true',
      'the named key in a partial patch was not written');
  end;

  -- ── an invalid build_approach is rejected, null is not ───────────────────
  perform t.assert_denied(
    'approach-constraint-still-there',
    '2b: the three stated values are still the only stated values',
    'service_role', null,
    format('update public.builders set build_approach = ''modular-ish'' where id = %L', v_seeded),
    'an unrecognised build_approach was accepted, so widening the column for null also removed the vocabulary check');

  perform t.assert_ok(
    'approach-null-allowed',
    '2b: null is a legal value for build_approach',
    'service_role', null,
    format('update public.builders set build_approach = null where id = %L', v_seeded),
    'null was rejected by the build_approach check constraint');

  -- ── unknown is not a match for a capability filter ───────────────────────
  -- "A turnkey-only filter matches turnkey = true and nothing else. Unknown is
  -- not a match, and neither is No." The database half of that is three-valued
  -- logic; asserted because the whole point is that a filter must not sweep
  -- unknowns in.
  declare
    v_yes uuid := t.mk_builder('{"turnkey": true}'::jsonb);
    v_no  uuid := t.mk_builder('{"turnkey": false}'::jsonb);
    v_unk uuid := t.mk_builder();
  begin
    perform t.assert_count(
      'turnkey-filter-matches-yes-only',
      '2b: a turnkey-only filter matches turnkey = true and nothing else',
      'authenticated', v_pa,
      format('select 1 from public.builders_public where turnkey and id in (%L, %L, %L)', v_yes, v_no, v_unk),
      1,
      'a turnkey-only filter matched more than the one listing that stated Yes, so unknown or No is being presented to a homeowner as a capability');
  end;
end
$$;
