-- =============================================================================
-- pre_0008_seed.sql — rows that exist BEFORE migration 0008 runs.
--
-- The runner applies any helpers/pre_<NNNN>_seed.sql immediately before
-- migration NNNN. This file is the only one, and it exists for one reason: the
-- 0008 backfill is a ONE-TIME data correction, and the only honest way to prove
-- what it does is to have real rows in the table when it runs.
--
-- At this point in the chain (after 0007, before 0008) builders.turnkey is
-- `not null default false` and builders.build_approach is `not null default
-- 'both'`, so every row here necessarily holds a value in both columns. That is
-- precisely the problem 0008 addresses: before it, there was no third state, so a
-- stored `false` was indistinguishable from a company that never said anything.
--
-- Six rows, covering every case 0008 distinguishes:
--
--   default-turnkey     turnkey came from the 0006 default          -> must be NULLED
--   stated-turnkey      turnkey = true, which no default produces   -> must SURVIVE
--   default-approach    build_approach came from the 0004 default   -> must be NULLED
--   stated-custom       build_approach = 'custom'                   -> must SURVIVE
--   stated-prefab       build_approach = 'prefab'                   -> must SURVIVE
--   both-defaults       both columns left to their defaults         -> both NULLED
--
-- The ids are recorded in schema `tfix` so suite 140 can assert against exactly
-- these rows rather than guessing which rows are old.
--
-- referral_code is left null on purpose. It is nullable at this point in the
-- chain and 0008 does not touch it; giving these rows codes would only add
-- unique-constraint noise to a file about two other columns.
-- =============================================================================

create schema if not exists tfix;

create table tfix.pre0008 (
  label      text primary key,
  builder_id uuid not null,
  -- What the row held the instant before 0008 ran. Recorded here rather than
  -- re-derived later, so the assertions compare against observed state.
  turnkey_before        boolean,
  build_approach_before text
);

do $$
declare
  v_id uuid;
begin
  -- turnkey left to the 0006 default (false); build_approach stated.
  insert into public.builders (slug, name, state, city, turnkey, build_approach)
  values ('pre0008-default-turnkey', 'Pre-0008 Default Turnkey', 'AZ', 'Phoenix', false, 'custom')
  returning id into v_id;
  insert into tfix.pre0008 values ('default-turnkey', v_id, false, 'custom');

  -- turnkey stated true: no default could have produced this.
  insert into public.builders (slug, name, state, city, turnkey, build_approach)
  values ('pre0008-stated-turnkey', 'Pre-0008 Stated Turnkey', 'AZ', 'Tucson', true, 'prefab')
  returning id into v_id;
  insert into tfix.pre0008 values ('stated-turnkey', v_id, true, 'prefab');

  -- build_approach left to the 0004 default ('both'); turnkey stated true.
  insert into public.builders (slug, name, state, city, turnkey, build_approach)
  values ('pre0008-default-approach', 'Pre-0008 Default Approach', 'TX', 'Austin', true, 'both')
  returning id into v_id;
  insert into tfix.pre0008 values ('default-approach', v_id, true, 'both');

  insert into public.builders (slug, name, state, city, turnkey, build_approach)
  values ('pre0008-stated-custom', 'Pre-0008 Stated Custom', 'TX', 'Dallas', true, 'custom')
  returning id into v_id;
  insert into tfix.pre0008 values ('stated-custom', v_id, true, 'custom');

  insert into public.builders (slug, name, state, city, turnkey, build_approach)
  values ('pre0008-stated-prefab', 'Pre-0008 Stated Prefab', 'CA', 'Fresno', true, 'prefab')
  returning id into v_id;
  insert into tfix.pre0008 values ('stated-prefab', v_id, true, 'prefab');

  -- Both columns left entirely to their defaults: the shape of 84 of the 96
  -- Arizona seed records that never addressed scope, and the 35 that never
  -- stated a build method.
  insert into public.builders (slug, name, state, city)
  values ('pre0008-both-defaults', 'Pre-0008 Both Defaults', 'AZ', 'Mesa')
  returning id into v_id;
  insert into tfix.pre0008 values ('both-defaults', v_id, false, 'both');
end
$$;

-- Guard: if the pre-0008 column definitions are not what this file assumes, the
-- fixture is meaningless and the run must stop here rather than produce a green
-- backfill suite against the wrong starting state.
do $$
declare
  v_turnkey_notnull  boolean;
  v_approach_default text;
begin
  select a.attnotnull into v_turnkey_notnull
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'builders' and a.attname = 'turnkey';

  select pg_get_expr(d.adbin, d.adrelid) into v_approach_default
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'builders' and a.attname = 'build_approach';

  if v_turnkey_notnull is not true then
    raise exception 'pre-0008 fixture is stale: builders.turnkey is already nullable before 0008 ran';
  end if;
  if v_approach_default is null then
    raise exception 'pre-0008 fixture is stale: builders.build_approach has no default before 0008 ran';
  end if;
end
$$;
