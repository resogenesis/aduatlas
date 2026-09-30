-- =============================================================================
-- INVARIANT (decision 2p): GOVERNMENT PARTNERSHIPS and SPONSORED RESIDENT
-- EDUCATION. This file is the durable-test list 2p names, one named assertion per
-- rule, plus the sponsorship rules from 2p's definition of done.
--
-- THE PROPERTY THIS FILE EXISTS FOR:
--
--   THREE SEPARATE CONCEPTS, NEVER ONE STATE AND NEVER ONE BADGE.
--
--   (i)   GOVERNMENT IDENTITY VERIFICATION — has ADUAtlas verified that this
--         account is actually controlled by the stated city, county, state or
--         agency? Unclaimed, claim pending, identity verified, verification
--         rejected, suspended. The badge is "Verified Government Account" and it
--         means ONLY that ADUAtlas verified identity and control.
--   (ii)  ADUAtlas EDUCATION PARTNERSHIP — has this verified entity activated an
--         ADUAtlas partnership? No partnership, pending, active, inactive or
--         suspended. The label is "ADUAtlas Education Partner". It is NEVER
--         called verified, because verification already means something else.
--   (iii) REGULATORY SOURCE VERIFICATION — held per record and per field.
--         ADUAtlas may hold authoritative sourced regulations for a city whose
--         government has never created an account, and a city having a verified
--         account does NOT make any of its regulatory content verified.
--
--   Identity verification NEVER activates a partnership. A partnership NEVER
--   activates without verified identity, and 2p says that is a DATABASE
--   constraint rather than a UI rule, so it is asserted here on the OWNER
--   connection (t.reg_refused) and not only as an API-role denial.
--
--   The four legitimate combinations the database, RLS, the portals, analytics and
--   the interface must all keep distinct are asserted one at a time: unclaimed and
--   unverified; claimed with verification pending; Verified Government Account but
--   NOT an Education Partner; and Verified Government Account AND Education
--   Partner.
--
-- THE SPONSORSHIP RULE MOST LIKELY TO BE BUILT BACKWARDS:
--
--   DISABLING A PARTNERSHIP STOPS NEW ACTIVATIONS WITHOUT STRIPPING ACCESS
--   ALREADY GRANTED. The two halves are separate named assertions from one
--   scenario, because the plausible-looking implementation — "a sponsored
--   entitlement is live while its partnership is active" as a join or a view —
--   satisfies the first half and fails the second, and it fails it by taking a
--   homeowner's education away for something their city did. 2p: disabling
--   prevents NEW sponsored activations WITHOUT CORRUPTING EXISTING HOMEOWNER
--   ACCOUNTS.
--
-- ── WHY THERE IS A POSITIVE CONTROL IN EVERY GROUP ──────────────────────────
-- Almost every assertion below is negative: the role must NOT get through, the
-- token must grant NOTHING. A file full of negative assertions passes perfectly
-- against a feature that does not work at all, and the 0012 author found an RLS
-- infinite-recursion bug precisely because "this role must see nothing" and "this
-- query crashed" look identical from the outside. So each group proves the ALLOWED
-- path first:
--
--   A  a verified member of a verified entity holding a live grant can submit
--   B  a verified entity can be made an ACTIVE partner
--   C  an active partner's LINK, and its CODE, each grant the Golden entitlement
--
-- Where a control does not pass, the assertions it underwrites are recorded as
-- SKIPS carrying the database's own error, because a denial that cannot be told
-- apart from a dead feature is not evidence. A skip is not a pass.
--
-- ── WHAT THIS FILE PROBES FOR, AND WHY IT SKIPS RATHER THAN FAILS ───────────
-- The partnership schema is migration 0014 and the entitlement boundary is 0013.
-- Group A needs only 0012 and runs today. Groups B, C and D probe for
-- public.government_partnerships, public.partner_access_links,
-- public.partner_access_codes, public.partner_redemptions and
-- public.redeem_partner_access(text, text, uuid) BY NAME and skip themselves with
-- that reason when the migration is not applied, rather than passing vacuously on
-- an empty schema.
--
-- Column SPELLINGS inside those tables are resolved from the catalogue through the
-- t.part_* probes, so a rename is a rename and not a broken suite. Where a
-- required column cannot be resolved at all, the group's positive control fails
-- loudly with the database's own error and names the column, which is the honest
-- outcome: this file cannot invent the schema it is testing.
--
-- The t.reg_* probes and the t.gov_* fixtures below are copied VERBATIM from
-- 190_government_accounts.sql (which copied the t.reg_* half from 180) rather than
-- moved into helpers/, because every invariant file has to run standalone and in
-- any order; `create or replace` makes the second definition a no-op. The reason
-- is written out at the top of 180 and in the README's "Adding a test".
-- =============================================================================
select t.suite('200 partnership and sponsorship (2p)');
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
-- Fixtures that belong to THIS file. They mirror 02_fixtures.sql's builder
-- fixtures deliberately: an entity goes in the way ADUAtlas creates one from
-- public sources (UNCLAIMED and UNVERIFIED); claiming and verifying are two
-- SEPARATE steps because claiming never produces verification; the jurisdiction
-- grant is a THIRD step, because an entity does not reach even its own seat
-- without one; and revocation is its own step, because a revoked membership is a
-- recorded event and not a deleted login.
-- =============================================================================

-- A jurisdiction, reusing the fifty-state seed where it already exists.
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

-- An entity as ADUAtlas seeds one: UNCLAIMED, UNVERIFIED, compiled from the
-- government's own public website, with nothing implying the government takes part.
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

-- A representative claims the entity. This is ALL claiming does.
create or replace function t.gov_claim(p_entity uuid)
returns void
language sql
as $fn$
  update public.government_entities set claimed_at = now(), claim_note = 'claimed through the form'
   where id = p_entity;
$fn$;

-- ADUAtlas confirms a member is authorised to represent the entity. Separate from
-- claiming on purpose: this is the only thing that may set verification.
create or replace function t.gov_verify(p_entity uuid)
returns void
language sql
as $fn$
  update public.government_entities
     set verification_status = 'verified', verified_at = now()
   where id = p_entity;
$fn$;

-- A person. An ORDINARY authenticated user who has said they act in a government
-- capacity. This row grants nothing at all.
create or replace function t.gov_person(p_user uuid)
returns uuid
language plpgsql
as $fn$
declare v_id uuid;
begin
  if not t.has_relation('public.government_users') then return p_user; end if;
  select id into v_id from public.government_users where user_id = p_user;
  if v_id is not null then return v_id; end if;
  insert into public.government_users (user_id, full_name, job_title, work_email)
  values (p_user, 'Test Official', 'ADU coordinator', t.nextlabel('official') || '@example.gov')
  returning id into v_id;
  return v_id;
end
$fn$;

-- The id a person-shaped column actually wants: the ADUAtlas account, the
-- government profile of that account, or the auth subject. Asked of the catalogue
-- rather than assumed, because which of the three a join carries is the schema's
-- decision and this file's assertions are not about that decision.
create or replace function t.gov_user_ref(p_table text, p_column text, p_user uuid)
returns uuid
language plpgsql
as $fn$
declare v_target text := t.reg_fk_target(p_table, p_column);
begin
  if v_target = 'auth.users' then return t.authid(p_user); end if;
  if v_target = 'public.government_users' then return t.gov_person(p_user); end if;
  return p_user;
end
$fn$;

-- The membership's person column and the submission's submitter column, resolved
-- once each so a rename of either is a rename and not a broken suite.
create or replace function t.gov_member_user_col()
returns text
language sql
stable
as $fn$
  select t.reg_col('public.government_memberships',
           array['government_user_id', '^user_id$', 'member_user_id', '^user$']);
$fn$;

create or replace function t.gov_submitter_col()
returns text
language sql
stable
as $fn$
  select t.reg_col('public.regulatory_submissions',
           array['submitted_by_government_user_id', 'submitted_by_user_id', 'submitted_by',
                 'government_user_id', '^user_id$']);
$fn$;

-- The join. p_verified decides whether THIS PERSON's authority has been confirmed;
-- the entity's own state is a separate question and so is the jurisdiction grant.
create or replace function t.gov_member(p_entity uuid, p_user uuid,
                                        p_verified boolean default true,
                                        p_role text default 'contributor')
returns uuid
language plpgsql
as $fn$
declare
  v_col text := t.gov_member_user_col();
  v_id  uuid;
begin
  execute format(
    $s$insert into public.government_memberships
         (entity_id, %I, membership_role, status, verified_at)
       values (%L, %L, %L, %L, %s) returning id$s$,
    v_col, p_entity, t.gov_user_ref('public.government_memberships', v_col, p_user), p_role,
    case when p_verified then 'verified' else 'pending' end,
    case when p_verified then 'now()' else 'null' end)
  into v_id;
  return v_id;
end
$fn$;

-- THE ONLY SOURCE OF AUTHORITY: one entity may work on one jurisdiction record.
create or replace function t.gov_grant(p_entity uuid, p_jurisdiction uuid, p_may_submit boolean default true)
returns uuid
language plpgsql
as $fn$
declare v_id uuid;
begin
  insert into public.government_jurisdiction_grants
    (entity_id, jurisdiction_id, may_submit, grant_basis)
  values (p_entity, p_jurisdiction, p_may_submit,
          'the regression suite granted this scope explicitly, which is the only way scope is ever granted')
  returning id into v_id;
  return v_id;
end
$fn$;

-- The employee leaves. The entity is untouched and the person is not deleted.
create or replace function t.gov_revoke(p_membership uuid)
returns void
language sql
as $fn$
  update public.government_memberships
     set status = 'revoked', revoked_at = now(), revoked_reason = 'left the planning department'
   where id = p_membership;
$fn$;

-- A submission, as the statement a government member's browser would send.
-- Returned as SQL rather than executed so it can be run AS THE MEMBER through
-- t.x(), which is the only way the authority model is tested from the outside.
create or replace function t.gov_submit_sql(p_jurisdiction uuid, p_entity uuid, p_person uuid,
                                            p_topic text default 'max_size')
returns text
language plpgsql
as $fn$
declare v_col text := t.gov_submitter_col();
begin
  return format(
    $s$insert into public.regulatory_submissions
         (kind, jurisdiction_id, entity_id, %I, topic_key, payload)
       values ('provision', %L, %L, %L, %L,
               '{"field_state": "verified_from_source", "value_text": "1000 sq ft",
                 "source_url": "https://www.example.gov/ordinance"}'::jsonb)$s$,
    v_col, p_jurisdiction, p_entity,
    t.gov_user_ref('public.regulatory_submissions', v_col, p_person), p_topic);
end
$fn$;


-- =============================================================================
-- THE PARTNERSHIP AND SPONSORSHIP PROBES AND FIXTURES
--
-- Everything here resolves a CONCEPT to the column or token that carries it, for
-- the same reason 180 and 190 do it: an invariant about "a partnership cannot
-- activate without verified identity" is an invariant about activation, not about
-- the spelling `activated_at`, and a suite that hard-coded the spelling would go
-- red on a rename while a genuine hole slipped past.
--
-- They also make this file honest about what it does NOT know. The shared contract
-- names four tables, one RPC and the columns entity_id, status, activated_at and
-- suspended_at. It does not name the token column on a link, the expiry column, or
-- the column that disables one, so those are resolved from the catalogue and the
-- group reports a loud positive-control failure naming the column when they cannot
-- be found. This file never invents the schema it is testing.
-- =============================================================================

-- The Golden package id AS STORED. The schema ids are historical (roadmap =
-- Golden $79, report = Platinum, concierge = Concierge) and are not renamed,
-- because the Stripe price environment variables and the frontend plan table both
-- key off them; see 055_packages_and_entitlement.sql. The assertion
-- `golden-is-a-real-stored-package` below fails loudly if this stops being true,
-- so a rename is caught here rather than silently turning every sponsorship
-- assertion into a comparison between two wrong strings.
create or replace function t.part_golden()
returns text
language sql
immutable
as $fn$ select 'roadmap'::text $fn$;

create or replace function t.part_status_col()
returns text
language sql
stable
as $fn$
  select t.reg_col('public.government_partnerships',
           array['^status$', 'partnership_status', '^state$']);
$fn$;

create or replace function t.part_entity_col(p_table text)
returns text
language sql
stable
as $fn$
  select t.reg_col(p_table, array['^entity_id$', 'government_entity_id', '^entity$']);
$fn$;

-- The vocabulary token for a partnership state, read out of the column's own enum
-- or CHECK. '^active' rather than 'active' on purpose: `inactive` contains the
-- word and is a DIFFERENT state 2p names separately.
create or replace function t.part_status_token(p_kind text)
returns text
language plpgsql
stable
as $fn$
declare
  v_col    text := t.part_status_col();
  v_tokens text[];
  v_pat    text;
begin
  if v_col is null then return null; end if;
  v_tokens := t.reg_tokens('public.government_partnerships', v_col);
  if v_tokens is null then return null; end if;
  v_pat := case p_kind
             when 'active'    then '^active'
             when 'pending'   then 'pending'
             when 'suspended' then 'suspend'
             when 'inactive'  then '^(inactive|disabled|ended|expired|lapsed)'
             when 'none'      then '(no_partnership|^none$|^no$)'
           end;
  return (select x from unnest(v_tokens) x where x ~ v_pat order by length(x) limit 1);
end
$fn$;

-- Insert a row into a table whose full column list this file does not own.
-- p_values maps a column name to a SQL EXPRESSION (already quoted by the caller);
-- every OTHER not-null column without a default is filled with a type-appropriate
-- placeholder, resolving a foreign key to the fixture row it points at. A column
-- that cannot be filled raises, so the group's positive control fails with the
-- column's name in the message instead of this file guessing at a business value.
create or replace function t.part_insert(p_table text, p_values jsonb, p_actor uuid,
                                        p_entity uuid default null,
                                        p_partnership uuid default null,
                                        p_jurisdiction uuid default null)
returns uuid
language plpgsql
as $fn$
declare
  v_names text[] := '{}';
  v_cols  text[] := '{}';
  v_vals  text[] := '{}';
  k text; v text;
  r record;
  v_fk text;
  v_expr text;
  v_id uuid;
begin
  for k, v in select key, value #>> '{}' from jsonb_each(p_values) loop
    if k is null or v is null then continue; end if;
    -- A column the shared contract names but this schema does not have is skipped
    -- rather than invented: the assertion that needed it fails on its own terms.
    if t.reg_col(p_table, array['^' || k || '$']) is null then continue; end if;
    v_names := v_names || k;
    v_cols  := v_cols  || quote_ident(k);
    v_vals  := v_vals  || v;
  end loop;

  for r in
    select a.attname::text as nm, format_type(a.atttypid, a.atttypmod) as typ
      from pg_attribute a
      join pg_class c     on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname || '.' || c.relname = p_table
       and a.attnum > 0 and not a.attisdropped and a.attnotnull
       and not exists (select 1 from pg_attrdef d
                        where d.adrelid = a.attrelid and d.adnum = a.attnum)
     order by a.attnum
  loop
    if r.nm = any (v_names) then continue; end if;
    v_fk := t.reg_fk_target(p_table, r.nm);
    v_expr := case
      when v_fk = 'public.users'                  then format('%L::uuid', p_actor)
      when v_fk = 'public.government_users'       then format('%L::uuid', t.gov_person(p_actor))
      when v_fk = 'auth.users'                    then format('%L::uuid', t.authid(p_actor))
      when v_fk = 'public.government_entities'    then format('%L::uuid', p_entity)
      when v_fk = 'public.government_partnerships' then format('%L::uuid', p_partnership)
      when v_fk = 'public.jurisdictions'          then format('%L::uuid', p_jurisdiction)
      when r.typ in ('text', 'citext') or r.typ like 'character varying%'
                                                  then quote_literal('recorded by the regression suite')
      when r.typ like 'timestamp%'                then 'now()'
      when r.typ = 'date'                         then 'current_date'
      when r.typ = 'boolean'                      then 'true'
      when r.typ in ('integer', 'bigint', 'smallint', 'numeric',
                     'double precision', 'real')  then '1'
      when r.typ in ('jsonb', 'json')             then quote_literal('{}') || '::' || r.typ
      when r.typ = 'uuid'                         then 'gen_random_uuid()'
      else null
    end;
    if v_expr is null then
      raise exception 'the regression suite cannot fill %.% (type %, foreign key %): it is required, the shared contract does not name it, and inventing a value for it would be inventing a business rule',
        p_table, r.nm, r.typ, coalesce(v_fk, 'none');
    end if;
    v_names := v_names || r.nm;
    v_cols  := v_cols  || quote_ident(r.nm);
    v_vals  := v_vals  || v_expr;
  end loop;

  execute format('insert into %s (%s) values (%s) returning id',
                 p_table, array_to_string(v_cols, ', '), array_to_string(v_vals, ', '))
    into v_id;
  return v_id;
end
$fn$;

-- A partnership in a named state. activated_at is stamped for every state that has
-- BEEN active, including suspended and inactive, because a partnership that was
-- switched off still happened: that history is exactly what the "does not strip
-- access already granted" assertion is about.
create or replace function t.part_partnership(p_entity uuid, p_status text, p_actor uuid)
returns uuid
language plpgsql
as $fn$
declare
  v_status text := t.part_status_col();
  v_ent    text := t.part_entity_col('public.government_partnerships');
  v_act    text := t.reg_col('public.government_partnerships', array['activated_at', 'activated_on']);
  v_susp   text := t.reg_col('public.government_partnerships', array['suspended_at', 'suspended_on']);
  v_vals   jsonb := '{}'::jsonb;
begin
  if v_status is null or v_ent is null then
    raise exception 'public.government_partnerships has no resolvable status or entity column, so a partnership cannot be created by this suite';
  end if;
  v_vals := jsonb_build_object(v_ent, format('%L::uuid', p_entity),
                               v_status, quote_literal(p_status));
  if v_act is not null then
    v_vals := v_vals || jsonb_build_object(v_act,
      case when p_status ~ 'pending' then 'null' else 'now()' end);
  end if;
  if v_susp is not null then
    v_vals := v_vals || jsonb_build_object(v_susp,
      case when p_status ~ 'suspend' then 'now()' else 'null' end);
  end if;
  return t.part_insert('public.government_partnerships', v_vals, p_actor, p_entity, null);
end
$fn$;

-- Amy switches a partnership off. Deliberately NOT a delete: 2p's rule is that
-- disabling stops new activations without corrupting existing homeowner accounts,
-- and a deleted row would make that question unanswerable.
create or replace function t.part_set_status(p_partnership uuid, p_status text)
returns void
language plpgsql
as $fn$
declare
  v_status text := t.part_status_col();
  v_susp   text := t.reg_col('public.government_partnerships', array['suspended_at', 'suspended_on']);
begin
  execute format('update public.government_partnerships set %I = %L%s where id = %L',
    v_status, p_status,
    case when v_susp is null then ''
         else format(', %I = %s', v_susp,
                case when p_status ~ 'suspend' then 'now()' else 'null' end) end,
    p_partnership);
end
$fn$;

create or replace function t.part_token_col()
returns text
language sql
stable
as $fn$
  select t.reg_col('public.partner_access_links',
           array['^token$', 'link_token', 'access_token', 'public_token', '^slug$', '^code$']);
$fn$;

create or replace function t.part_code_col()
returns text
language sql
stable
as $fn$
  select t.reg_col('public.partner_access_codes',
           array['^code$', 'access_code', 'redemption_code', '^token$']);
$fn$;

-- A resident access link or code, created THE WAY THE PRODUCT CREATES ONE and then
-- aged or switched off by a second statement, because that is the only order the
-- lifecycle allows: a link or code can be minted only while the partnership is
-- ACTIVE and the entity holds a live grant on the jurisdiction, and the token is
-- the database's to generate, so whatever a caller supplies may be discarded. The
-- stored value is READ BACK rather than assumed, and an expiry or a deactivation is
-- applied afterwards, which is also how a partner actually retires one.
create or replace function t.part_access(p_table text, p_partnership uuid, p_entity uuid,
                                         p_actor uuid, p_jurisdiction uuid,
                                         p_expires text default null,
                                         p_disabled boolean default false)
returns text
language plpgsql
as $fn$
declare
  v_val_col  text := case when p_table = 'public.partner_access_codes'
                          then t.part_code_col() else t.part_token_col() end;
  v_part_col text := t.reg_col(p_table, array['partnership_id', '^partnership$']);
  v_ent_col  text := t.part_entity_col(p_table);
  v_jur_col  text := t.reg_col(p_table, array['jurisdiction_id', '^jurisdiction$']);
  v_exp_col  text := t.reg_col(p_table, array['expires_at', 'expires_on', 'expiry_at', 'valid_until']);
  v_off_col  text := t.reg_col(p_table, array['deactivated_at', 'disabled_at', 'revoked_at']);
  v_flag_col text := t.reg_col(p_table, array['^is_active$', '^active$', '^enabled$', '^is_enabled$']);
  v_vals     jsonb := '{}'::jsonb;
  v_sets     text[] := '{}';
  v_id  uuid;
  v_val text;
begin
  if v_val_col is null then
    raise exception '% has no resolvable token or code column, so a resident access link or code cannot be created by this suite',
      p_table;
  end if;
  -- A placeholder that satisfies a token format check where one exists. The guard
  -- is expected to replace it; the value is read back either way.
  v_vals := jsonb_build_object(v_val_col,
    quote_literal(case when p_table = 'public.partner_access_codes'
                       then t.code() else 'suite-issued-' || nextval('t.fixture_seq')::text end));
  if v_part_col is not null then
    v_vals := v_vals || jsonb_build_object(v_part_col, format('%L::uuid', p_partnership));
  end if;
  if v_ent_col is not null then
    v_vals := v_vals || jsonb_build_object(v_ent_col, format('%L::uuid', p_entity));
  end if;
  if v_jur_col is not null then
    v_vals := v_vals || jsonb_build_object(v_jur_col, format('%L::uuid', p_jurisdiction));
  end if;

  v_id := t.part_insert(p_table, v_vals, p_actor, p_entity, p_partnership, p_jurisdiction);
  execute format('select %I::text from %s where id = %L', v_val_col, p_table, v_id) into v_val;

  if p_expires is not null then
    if v_exp_col is null then
      raise exception '% has no expiry column, so "an expired link grants nothing" cannot be set up', p_table;
    end if;
    execute format('update %s set %I = %s where id = %L', p_table, v_exp_col, p_expires, v_id);
  end if;

  if p_disabled then
    -- Both halves where both exist: an active flag and a deactivation date are
    -- usually ONE fact held twice, and writing half of it is a constraint violation
    -- rather than a disabled link.
    if v_flag_col is not null then
      v_sets := v_sets || format('%I = false', v_flag_col);
    end if;
    if v_off_col is not null then
      v_sets := v_sets || format('%I = now()', v_off_col);
    end if;
    if v_sets = '{}' then
      raise exception '% has no column that disables a link or code (no deactivated_at, disabled_at, revoked_at or active flag), so "a disabled link grants nothing" cannot be set up', p_table;
    end if;
    execute format('update %s set %s where id = %L', p_table, array_to_string(v_sets, ', '), v_id);
  end if;

  return v_val;
end
$fn$;

-- The resident entry point, called the way api/partner-redeem.js calls it: the
-- SERVICE ROLE, three positional arguments, a jsonb result. Returned as the
-- harness envelope so a refusal and a not-ok result are both readable.
create or replace function t.part_redeem(p_kind text, p_token text, p_user uuid,
                                         p_role text default 'service_role',
                                         p_uid uuid default null)
returns jsonb
language sql
as $fn$
  select t.q(p_role, p_uid,
    format('select public.redeem_partner_access(%L, %L, %L::uuid) as result',
           p_kind, p_token, p_user));
$fn$;

-- What the account actually holds, as the database represents entitlement today:
-- the tier, or '<none>' when no entitlement is live at all. Read with the service
-- role so the answer is the truth and not what a policy lets somebody see.
create or replace function t.part_grant_of(p_user uuid)
returns text
language sql
stable
as $fn$
  select case
           when u.paid_at is null or u.refunded_at is not null then '<none>'
           else coalesce(u.paid_tier, '<no tier>')
         end
    from public.users u where u.id = p_user;
$fn$;

-- Attribution: how many redemptions are recorded against this person. -1 means the
-- column could not be resolved, which is a different answer from zero and is
-- reported as such.
create or replace function t.part_redemptions_for(p_user uuid)
returns int
language plpgsql
stable
as $fn$
declare
  v_col text := t.reg_col('public.partner_redemptions',
                  array['app_user_id', '^user_id$', 'homeowner_user_id',
                        'redeemed_by_app_user_id', 'redeemed_by', 'sponsored_user_id']);
  v_n int;
begin
  if not t.has_relation('public.partner_redemptions') or v_col is null then return -1; end if;
  execute format('select count(*)::int from public.partner_redemptions where %I = %L',
                 v_col, t.gov_user_ref('public.partner_redemptions', v_col, p_user))
    into v_n;
  return v_n;
end
$fn$;

-- The aggregate analytics surface, if one exists under any of the names the
-- contract's fetchPartnerAnalytics() might read.
create or replace function t.part_analytics_rel()
returns text
language sql
stable
as $fn$
  select n.nspname || '.' || c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'v', 'm')
     and c.relname ~ '(partner|partnership).*(analytic|stat|summary|usage|metric|count)'
   order by c.relname
   limit 1;
$fn$;

-- The anon-facing relation and column that would carry the "ADUAtlas Education
-- Partner" badge. 2p says the label is shown publicly, so if nothing here is
-- readable by anon the badge has no server-side source and the assertion says so
-- rather than passing.
create or replace function t.part_badge_rel()
returns text
language sql
stable
as $fn$
  select r from (
    select 'public.government_entities_public'::text as r, 1 as pref
     where t.reg_col('public.government_entities_public',
             array['partner', 'partnership']) is not null
    union all
    select n.nspname || '.' || c.relname, 2
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
       and c.relname ~ 'partner' and c.relname ~ '_public'
  ) x order by pref limit 1;
$fn$;

create or replace function t.part_badge_col(p_rel text)
returns text
language sql
stable
as $fn$
  select t.reg_col(p_rel, array['partnership_status', 'partner_status', 'is_education_partner',
                                'is_partner', 'partner', 'partnership']);
$fn$;

-- =============================================================================
-- GROUP A — GOVERNMENT IDENTITY VERIFICATION, THE FIRST OF THE THREE CONCEPTS
--
-- This group needs only migration 0012 and runs today. It proves the identity half
-- of 2p: that verification is ADUAtlas's act and nobody can perform it on
-- themselves, that claiming produces neither status, that the identity badge on the
-- public surface says exactly what is true, and that a VERIFIED identity buys no
-- authority anywhere except the jurisdiction ADUAtlas explicitly granted.
--
-- The last three are 2p's "government verification grants no regulatory-admin
-- privilege beyond the explicitly granted jurisdiction", "one city cannot edit
-- another city's information" and "a state account does not automatically edit
-- every municipality". They are attacked here again, rather than left to 190,
-- because 2p adds a partnership to the picture and the question this file has to
-- answer is whether the SAME boundary holds for an entity that is verified,
-- partnered, and sponsoring residents. Group B repeats them with the partnership
-- switched on.
-- =============================================================================
do $$
declare
  v_az uuid; v_phx uuid; v_tuc uuid;
  v_e_phx uuid; v_e_tuc uuid; v_e_az uuid; v_e_seed uuid; v_e_claim uuid;
  v_u_phx uuid; v_u_az uuid; v_u_claim uuid;
  a_phx uuid; a_az uuid; a_claim uuid;
  v_p_phx uuid; v_p_tuc uuid;
  v_claim jsonb;
  v_pc jsonb; v_pc_ok boolean := false;
begin
  if not t.has_relation('public.government_entities')
     or not t.has_relation('public.government_memberships')
     or not t.has_relation('public.regulatory_submissions') then
    perform t.skip('golden-is-a-real-stored-package',
      '2p: the sponsored benefit is the $79 Golden educational entitlement and NOTHING else',
      'migration 0012 is not applied, so there is no government layer to sponsor from.');
    perform t.skip('identity-verification-cannot-be-self-granted',
      '2p (i): a government user cannot self-verify',
      'migration 0012 is not applied.');
    perform t.skip('membership-verification-cannot-be-self-granted',
      '2p (i): identity verification is a deliberate ADUAtlas act',
      'migration 0012 is not applied.');
    perform t.skip('claiming-produces-neither-status',
      '2p: an entity CLAIMS its jurisdiction; claiming produces neither verification nor a partnership',
      'migration 0012 is not applied.');
    perform t.skip('identity-badge-reads-unclaimed-when-unclaimed',
      '2p: every public badge accurately represents the underlying state',
      'migration 0012 is not applied.');
    perform t.skip('identity-badge-never-reads-verified-when-only-claimed',
      '2p: every public badge accurately represents the underlying state',
      'migration 0012 is not applied.');
    perform t.skip('identity-badge-reads-verified-when-verified',
      '2p: every public badge accurately represents the underlying state',
      'migration 0012 is not applied.');
    perform t.skip('anon-reaches-the-identity-table-through-nothing-but-the-view',
      '2p: no client-side state can create either status',
      'migration 0012 is not applied.');
    perform t.skip('control-verified-member-can-submit-for-its-granted-jurisdiction',
      '2p: the positive control for the whole identity group',
      'migration 0012 is not applied.');
    perform t.skip('verification-grants-nothing-outside-the-granted-jurisdiction',
      '2p: government verification grants no regulatory-admin privilege beyond the explicitly granted jurisdiction',
      'migration 0012 is not applied.');
    perform t.skip('one-city-cannot-edit-another-citys-information',
      '2p: one city cannot edit another city''s information',
      'migration 0012 is not applied.');
    perform t.skip('a-state-account-does-not-automatically-edit-every-municipality',
      '2p: a state account does not automatically edit every municipality',
      'migration 0012 is not applied.');
    perform t.skip('a-verified-account-does-not-verify-its-citys-rules',
      '2p (iii): regulatory-source verification stays independent of account status',
      'migration 0012 is not applied.');
    perform t.skip('a-verified-account-is-not-credited-with-rules-it-did-not-supply',
      '2p (iii): "Source: official government website" and "Provided by verified government account" are two facts',
      'migration 0012 is not applied.');
    return;
  end if;

  -- ── the Golden package, named once ────────────────────────────────────────
  perform t.assert(
    'golden-is-a-real-stored-package',
    '2p: the sponsored benefit is the $79 Golden educational entitlement and NOTHING else. Platinum does not become free and Concierge does not become free',
    t.part_golden() = any (coalesce(t.reg_tokens('public.users', 'paid_tier'), '{}')),
    format('%L is not one of the package ids public.users.paid_tier accepts (%s). Every sponsorship assertion in this file compares the tier a redemption granted against this value, so if the id was renamed those assertions would be comparing two strings that are both wrong and would pass while the sponsored grant handed out the wrong package',
           t.part_golden(),
           coalesce(array_to_string(t.reg_tokens('public.users', 'paid_tier'), ', '), 'none')));

  -- ── geography and entities ────────────────────────────────────────────────
  -- Cities of this file's own, never the shared seed rows, so nothing here can
  -- collide with 180's or 190's published provisions.
  v_az  := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_phx := t.gov_jur('municipality', v_az, 'Sponsorville');
  v_tuc := t.gov_jur('municipality', v_az, 'Neighbourton');

  v_e_phx   := t.gov_entity(v_phx, 'city',  'City of Sponsorville');
  v_e_tuc   := t.gov_entity(v_tuc, 'city',  'City of Neighbourton');
  v_e_az    := t.gov_entity(v_az,  'state', 'State of Arizona');
  v_e_seed  := t.gov_entity(v_tuc, 'city',  'Town ADUAtlas compiled');
  v_e_claim := t.gov_entity(v_phx, 'city',  'City that only claimed');

  v_u_phx   := t.mk_account('homeowner'); a_phx   := t.authid(v_u_phx);
  v_u_az    := t.mk_account('homeowner'); a_az    := t.authid(v_u_az);
  v_u_claim := t.mk_account('homeowner'); a_claim := t.authid(v_u_claim);

  -- Claim, verify, grant: three separate steps, in that order, because each one is
  -- a different fact and 2p forbids any of them implying another.
  perform t.gov_claim(v_e_phx); perform t.gov_verify(v_e_phx);
  perform t.gov_claim(v_e_az);  perform t.gov_verify(v_e_az);
  perform t.gov_claim(v_e_tuc); perform t.gov_verify(v_e_tuc);
  perform t.gov_member(v_e_phx, v_u_phx, true, 'administrator');
  perform t.gov_member(v_e_az,  v_u_az,  true, 'administrator');
  perform t.gov_grant(v_e_phx, v_phx);
  perform t.gov_grant(v_e_az,  v_az);
  perform t.gov_grant(v_e_tuc, v_tuc);

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_phx, 'max_size', 'verified_from_source', '1000 sq ft',
          'https://www.example.gov/sponsorville/adu', 'Sponsorville Zoning Code', 'city_code',
          '2026-09-01', 'published', 'source_checked')
  returning id into v_p_phx;

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_tuc, 'max_size', 'verified_from_source', '800 sq ft',
          'https://www.example.gov/neighbourton/adu', 'Neighbourton Zoning Code', 'city_code',
          '2026-09-01', 'published', 'source_checked')
  returning id into v_p_tuc;

  -- A rule ADUAtlas published for the VERIFIED city and has NOT source-checked. The
  -- point of the row is the gap between the two verifications: the account is
  -- verified, this record is not, and no surface may borrow one for the other.
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_phx, 'parking_required', 'verified_from_source', 'one space per unit',
          'https://www.example.gov/sponsorville/parking', 'Sponsorville Zoning Code', 'city_code',
          '2026-09-01', 'published', 'unverified');

  -- ── identity verification is ADUAtlas's act, and only ADUAtlas's ──────────
  perform t.assert_changes_nothing(
    'identity-verification-cannot-be-self-granted',
    '2p (i): a government user cannot self-verify. The badge means ONLY that ADUAtlas verified identity and control',
    'authenticated', a_phx,
    format('update public.government_entities set verification_status = ''verified'', verified_at = now() where id = %L', v_e_claim),
    'a signed-in government user can write their own entity''s verification state, so "Verified Government Account" would appear beside a city name on the word of whoever filled in the claim form. That badge is the one thing in the government layer that must never be self-asserted');

  perform t.assert_changes_nothing(
    'membership-verification-cannot-be-self-granted',
    '2p (i): identity verification is a deliberate ADUAtlas act that claiming never produces',
    'authenticated', a_claim,
    format('update public.government_memberships set status = ''verified'', verified_at = now() where entity_id = %L', v_e_claim),
    'a person can verify their OWN membership, which is self-verification one table across: the entity stays unverified while the login that represents it becomes verified');

  -- ── claiming produces neither status ─────────────────────────────────────
  v_claim := t.q('authenticated', a_claim,
    format('select public.claim_government_entity(%L::uuid, ''A Claimant'', ''ADU coordinator'', ''claimant@example.gov''::citext, null, ''claimed through the form'') as result', v_e_claim));

  perform t.assert(
    'claiming-produces-neither-status',
    '2p: an entity CLAIMS its existing jurisdiction. Claiming never produces identity verification, and identity verification is what a partnership needs',
    (v_claim->>'ok')::boolean
      and ((v_claim->'rows'->0->'result'->>'verified')::boolean is false)
      and (v_claim->'rows'->0->'result'->>'entity_state') = 'claimed'
      and (select verification_status from public.government_entities where id = v_e_claim) = 'unverified',
    format('claiming a government entity did not leave it in the claimed-and-unverified state: %s. That middle state is where every real claim sits while Amy reviews it, and collapsing it means the claim form is the verification',
           coalesce((v_claim->'rows'->0->'result')::text, v_claim->>'error', '<nothing>')));

  -- ── the identity badge says exactly what is true ──────────────────────────
  perform t.assert_scalar(
    'identity-badge-reads-unclaimed-when-unclaimed',
    '2p: every public badge accurately represents the underlying state. UNCLAIMED means ADUAtlas compiled the record from public sources and NOTHING implies the government takes part',
    'anon', null,
    format('select entity_state from public.government_entities_public where id = %L', v_e_seed),
    'unclaimed',
    'an entity ADUAtlas compiled from a town''s own public website does not read as unclaimed on the public surface, so the product implies a government participates in ADUAtlas when it has never heard of it');

  perform t.assert_scalar(
    'identity-badge-never-reads-verified-when-only-claimed',
    '2p: every public badge accurately represents the underlying state. CLAIM PENDING is its own state and never reads as verified',
    'anon', null,
    format('select entity_state from public.government_entities_public where id = %L', v_e_claim),
    'claimed',
    'a claimed but unverified entity reads as something other than claimed, so the public badge is ahead of the fact it is supposed to represent');

  perform t.assert_scalar(
    'identity-badge-reads-verified-when-verified',
    '2p: every public badge accurately represents the underlying state. This is the positive control for the badge assertions: they must be able to say yes',
    'anon', null,
    format('select entity_state from public.government_entities_public where id = %L', v_e_phx),
    'verified',
    'an entity ADUAtlas HAS verified does not read as verified, so the three badge assertions above pass only because nothing ever reads as anything');

  perform t.reg_unseen(
    'anon-reaches-the-identity-table-through-nothing-but-the-view',
    '2p: no client-side state can create either status, and the anonymous surface is the published view only',
    'anon', null,
    'select verification_status from public.government_entities limit 1',
    'anon holds a grant on the government identity table itself. The claim notes and verification notes live there, and a table anon can read is a table a client can learn the shape of');

  -- ── THE POSITIVE CONTROL FOR GROUP A ─────────────────────────────────────
  v_pc := t.x('authenticated', a_phx, t.gov_submit_sql(v_phx, v_e_phx, v_u_phx, 'height_limit'));
  v_pc_ok := (v_pc->>'ok')::boolean;
  perform t.assert(
    'control-verified-member-can-submit-for-its-granted-jurisdiction',
    '2p: a verified member of a verified entity holding an explicit grant CAN submit for that jurisdiction. Everything below asserts that somebody cannot, and a suite of refusals passes perfectly against a feature that works for nobody',
    v_pc_ok,
    format('the allowed path does not work: a verified administrator of a verified city entity holding a live submit grant on that city cannot record a submission (%s). Until this passes, every refusal in this group is indistinguishable from a dead feature, so the assertions it underwrites are reported as skips rather than as green security',
           coalesce(v_pc->>'error', '<no error>')));

  -- ── verification buys nothing outside the explicit grant ──────────────────
  if not v_pc_ok then
    perform t.skip('verification-grants-nothing-outside-the-granted-jurisdiction',
      '2p: government verification grants no regulatory-admin privilege beyond the explicitly granted jurisdiction',
      'the positive control did not pass; a denial here would not be evidence. See control-verified-member-can-submit-for-its-granted-jurisdiction.');
    perform t.skip('one-city-cannot-edit-another-citys-information',
      '2p: one city cannot edit another city''s information',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('a-state-account-does-not-automatically-edit-every-municipality',
      '2p: a state account does not automatically edit every municipality',
      'the positive control did not pass; a denial here would not be evidence.');
  else
    perform t.assert_changes_nothing(
      'verification-grants-nothing-outside-the-granted-jurisdiction',
      '2p: government verification grants NO regulatory-admin privilege beyond the explicitly granted jurisdiction',
      'authenticated', a_phx,
      t.gov_submit_sql(v_tuc, v_e_phx, v_u_phx, 'max_size'),
      'a verified city entity can submit against a jurisdiction it holds no grant on. Verification answers "is this really the city", and it is being read as "and therefore it may edit things"');

    perform t.assert_changes_nothing(
      'one-city-cannot-edit-another-citys-information',
      '2p: one city cannot edit another city''s information',
      'authenticated', a_phx,
      format('update public.regulatory_provisions set value_text = ''rewritten by the neighbouring city'' where id = %L', v_p_tuc),
      'a verified city account can rewrite a neighbouring city''s published rule. A homeowner reading Neighbourton would be reading what Sponsorville typed');

    perform t.assert_changes_nothing(
      'a-state-account-does-not-automatically-edit-every-municipality',
      '2p: a state account does not automatically edit every municipality unless that permission is explicitly designed and granted',
      'authenticated', a_az,
      t.gov_submit_sql(v_phx, v_e_az, v_u_az, 'max_size'),
      'the verified STATE entity can submit for a city because the city sits under the state in the geography. 2m settles this: the hierarchy is geography and display, never permission, and permission is a stored grant against specific jurisdiction records');
  end if;

  -- ── the third concept: regulatory source verification is not account state ─
  perform t.assert_scalar(
    'a-verified-account-does-not-verify-its-citys-rules',
    '2p (iii): REGULATORY SOURCE VERIFICATION is a third fact entirely, held per record and per field. A city having a verified account does NOT make any of its regulatory content verified',
    'anon', null,
    format($q$select verification_status from public.regulatory_provisions_public
             where jurisdiction_id = %L and topic_key = 'parking_required'$q$, v_phx),
    'unverified',
    'a rule ADUAtlas has NOT source-checked reads as verified on the public surface because the city holding the jurisdiction has a verified ADUAtlas account. Those are two different sentences: one says a person was confirmed to represent a city, the other says somebody read the ordinance');

  perform t.assert_count(
    'a-verified-account-is-not-credited-with-rules-it-did-not-supply',
    '2p (iii): provenance stays at the record and field level. Using a government''s public website as a source does NOT mean that government participates, and a verified account is not the author of everything in its jurisdiction',
    'anon', null,
    format($q$select 1 from public.regulatory_provisions_public
             where id = %L and provided_by_entity_name is null and source_is_official_government$q$, v_p_phx),
    1,
    'a rule ADUAtlas researched itself is attributed to the verified city account, or loses the fact that its source was official. "Provided by City of Sponsorville" would be printed under a rule that city has never seen');
end
$$;

-- Record a SKIP for an assertion that has not already been judged in this suite.
-- The group skip lists below are emitted from more than one place — the migration
-- is missing, a fixture could not be built, a vocabulary token could not be
-- resolved — and an assertion that already ran live must not be given a second,
-- contradictory result. Nothing is ever quietly dropped: every name in the list
-- ends up in the ledger exactly once, as a pass, a fail or a skip with its reason.
create or replace function t.part_skip(p_name text, p_rule text, p_reason text)
returns void
language plpgsql
as $fn$
begin
  if exists (select 1 from t.results r, t.current c
              where r.suite = c.suite and r.name = p_name) then
    return;
  end if;
  perform t.record(p_name, p_rule, 'skip', p_reason);
end
$fn$;

-- The database-constraint form of "a partnership NEVER activates without verified
-- identity". 2p calls that a DATABASE constraint and not a UI rule, so the row is
-- attempted on the OWNER connection, where an API-role denial would prove only that
-- the API role holds no grant. A failure to BUILD the row is reported as a broken
-- test rather than as a constraint doing its job.
create or replace function t.part_refused_partnership(
  p_name text, p_rule text, p_entity uuid, p_status text, p_actor uuid, p_detail text)
returns void
language plpgsql
as $fn$
declare v_id uuid;
begin
  begin
    v_id := t.part_partnership(p_entity, p_status, p_actor);
  exception when others then
    if t.is_broken_test(sqlstate)
       or sqlerrm like '%regression suite cannot fill%'
       or sqlerrm like '%no resolvable%' then
      perform t.record(p_name, p_rule, 'fail',
        format('THE TEST IS BROKEN, not the product: %s (%s). The suite could not build the row it meant to attack with, so this is a defect in the test rather than a database constraint refusing anything.',
               sqlerrm, sqlstate));
    else
      perform t.record(p_name, p_rule, 'pass', null);
    end if;
    return;
  end;
  perform t.record(p_name, p_rule, 'fail',
    coalesce(p_detail || ' — ', '') ||
    'the row was ACCEPTED on the owner connection. 2p says this is a database constraint and not a UI rule, so it must be refused whoever runs it');
end
$fn$;

create or replace function t.part_skip_group_b(p_reason text)
returns void
language plpgsql
as $fn$
begin
  perform t.part_skip('control-a-verified-entity-can-become-an-active-partner',
    '2p (ii): ONLY an active partnership unlocks the partnership tools',
    p_reason);
  perform t.part_skip('partnership-status-is-not-the-identity-status',
    '2p: THREE SEPARATE CONCEPTS, never one state and never one badge',
    p_reason);
  perform t.part_skip('a-partnership-is-never-called-verified',
    '2p (ii): shown publicly it reads "ADUAtlas Education Partner". It is NEVER called verified, because verification already means something else',
    p_reason);
  perform t.part_skip('identity-verification-does-not-activate-a-partnership',
    '2p: an entity NEVER becomes an Education Partner because its identity was verified',
    p_reason);
  perform t.part_skip('partnership-cannot-activate-without-verified-identity',
    '2p: a partnership NEVER activates without the required verified identity, and that is a DATABASE constraint',
    p_reason);
  perform t.part_skip('partnership-cannot-activate-for-an-unclaimed-entity',
    '2p: a partnership NEVER activates without the required verified identity',
    p_reason);
  perform t.part_skip('no-client-side-write-grant-on-the-partnership-table',
    '2p: no client-side state can create either status',
    p_reason);
  perform t.part_skip('authenticated-cannot-insert-a-partnership',
    '2p: no client-side state can create either status',
    p_reason);
  perform t.part_skip('a-government-administrator-cannot-self-activate-a-partnership',
    '2p: a government user cannot self-activate a partnership',
    p_reason);
  perform t.part_skip('a-government-administrator-cannot-reactivate-a-suspended-partnership',
    '2p: suspending a partnership produces the intended access change',
    p_reason);
  perform t.part_skip('anon-cannot-read-the-partnership-table',
    '2p: abuse controls are server side; this is not a client-side promo code',
    p_reason);
  perform t.part_skip('control-a-member-can-read-its-own-partnership',
    '2p: the partner portal shows the partnership to the entity it belongs to',
    p_reason);
  perform t.part_skip('a-suspended-partnership-does-not-read-as-active-to-its-own-member',
    '2p: suspending a partnership produces the intended access change',
    p_reason);
  perform t.part_skip('a-member-cannot-read-another-entitys-partnership',
    '2p: a government user never reaches another government''s management area',
    p_reason);
  perform t.part_skip('an-active-partner-still-cannot-submit-outside-its-grant',
    '2p: government verification grants no regulatory-admin privilege beyond the explicitly granted jurisdiction, and a partnership grants none either',
    p_reason);
  perform t.part_skip('an-active-partner-still-cannot-edit-another-citys-record',
    '2p: one city cannot edit another city''s information',
    p_reason);
  perform t.part_skip('an-active-partner-still-cannot-publish-without-review',
    '2p, 2m: a member SUBMITS, Amy reviews, ADUAtlas publishes',
    p_reason);
  perform t.part_skip('the-partner-admin-functions-are-service-role-only',
    '2p: abuse controls are server side, and the partner-administration surface is never reachable from a browser',
    p_reason);
  perform t.part_skip('authenticated-cannot-call-the-partnership-admin-function',
    '2p: a government user cannot self-activate a partnership',
    p_reason);
  perform t.part_skip('sponsorship-introduces-no-government-billing',
    '2m, 2p: government accounts cost nothing and the sponsored benefit is free to the resident',
    p_reason);
  perform t.part_skip('badge-pending-partnership-is-not-an-education-partner',
    '2p (ii): PARTNERSHIP PENDING is its own state and unlocks nothing',
    p_reason);
  perform t.part_skip('badge-suspended-partnership-is-not-an-education-partner',
    '2p (ii): INACTIVE OR SUSPENDED PARTNER is its own state',
    p_reason);
  perform t.part_skip('badge-combination-verified-but-not-a-partner',
    '2p: four legitimate combinations the database, RLS, the portals, analytics and the interface must all keep distinct',
    p_reason);
  perform t.part_skip('badge-combination-verified-and-education-partner',
    '2p: four legitimate combinations, and every public badge accurately represents the underlying state',
    p_reason);
end
$fn$;

-- =============================================================================
-- GROUP B — THE ADUAtlas EDUCATION PARTNERSHIP, THE SECOND CONCEPT
--
-- Gated on migration 0014 by name. Where it is not applied every assertion here is
-- a SKIP carrying that reason, because a partnership table that does not exist
-- cannot be attacked and a green run against no schema would be the worst possible
-- outcome for this decision.
-- =============================================================================
do $$
declare
  v_active    text;
  v_pending   text;
  v_suspended text;
  v_status    text;
  v_ent_col   text;
  v_j uuid; v_j2 uuid; v_az uuid;
  v_e_ok uuid; v_e_unver uuid; v_e_vernopart uuid; v_e_other uuid; v_e_seed uuid;
  v_e_pendpart uuid; v_e_susppart uuid;
  v_u_ok uuid; a_ok uuid; v_u_other uuid; a_other uuid; v_amy uuid;
  v_p_other uuid;
  v_part uuid; v_read jsonb;
  v_n int;
  v_pc_ok boolean := false;
  v_badge_rel text; v_badge_col text; v_badge_key text;
begin
  if not t.has_relation('public.government_partnerships') then
    perform t.part_skip_group_b(
      'public.government_partnerships does not exist. Migration 0014 (the partnership schema) is not applied to this database, so the ADUAtlas Education Partnership has no schema behind it and nothing here can be attacked. A skip is not a pass.');
    return;
  end if;

  v_status  := t.part_status_col();
  v_ent_col := t.part_entity_col('public.government_partnerships');
  v_active    := t.part_status_token('active');
  v_pending   := t.part_status_token('pending');
  v_suspended := t.part_status_token('suspended');

  perform t.assert(
    'partnership-status-is-not-the-identity-status',
    '2p: THREE SEPARATE CONCEPTS, never one state and never one badge. The partnership state is its own column on its own table, and the identity vocabulary knows nothing about partnerships',
    v_status is not null
      and v_ent_col is not null
      and v_active is not null
      and not exists (
        select 1 from unnest(coalesce(t.reg_tokens('public.government_entities', 'verification_status'), '{}')) x
         where x ~* 'partner')
      and t.reg_col('public.government_entities', array['partnership']) is null,
    format('the partnership state is not a separate, resolvable state of its own: status column %L, entity column %L, active token %L, and the identity vocabulary is %s. If the partnership lives inside the identity status, verifying an entity and partnering with it become one transition and 2p''s central distinction is gone',
           coalesce(v_status, '<none>'), coalesce(v_ent_col, '<none>'), coalesce(v_active, '<none>'),
           coalesce(array_to_string(t.reg_tokens('public.government_entities', 'verification_status'), ', '), 'none')));

  -- A column that names the ENTITY's verification, such as a mirrored
  -- entity_verification_status the activation constraint reads, is the separation
  -- being KEPT and is deliberately not matched here. What must not exist is a
  -- column or a token saying THE PARTNERSHIP is verified.
  perform t.assert(
    'a-partnership-is-never-called-verified',
    '2p (ii): shown publicly a partnership reads "ADUAtlas Education Partner". It is NEVER called verified, because verification already means something else',
    not exists (
      select 1 from unnest(coalesce(t.reg_tokens('public.government_partnerships', v_status), '{}')) x
       where x ~* 'verif')
    and t.reg_col('public.government_partnerships',
          array['^verif', '^is_verified', '^verified', 'partner_verif', 'partnership_verif']) is null,
    format('the PARTNERSHIP itself carries the word verified — status vocabulary %s, column %L. The two concepts then share a word, and "ADUAtlas Education Partner" and "Verified Government Account" become renderable from each other, which is the conflation 2p exists to prevent',
           coalesce(array_to_string(t.reg_tokens('public.government_partnerships', v_status), ', '), 'none'),
           coalesce(t.reg_col('public.government_partnerships',
             array['^verif', '^is_verified', '^verified', 'partner_verif', 'partnership_verif']), '<none>')));

  if v_active is null or v_status is null or v_ent_col is null then
    perform t.part_skip_group_b(format(
      'the partnership status column (%s), its entity column (%s) or its ACTIVE token (%s) could not be resolved from the catalogue, so this suite cannot create the state it would test. It resolves a concept to the column carrying it rather than hard-coding a spelling, and where that fails it says so instead of asserting against a column it guessed at.',
      coalesce(v_status, '<none>'), coalesce(v_ent_col, '<none>'), coalesce(v_active, '<none>')));
    return;
  end if;

  -- ── the cast ──────────────────────────────────────────────────────────────
  v_az  := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_j   := t.gov_jur('municipality', v_az, 'Partnerville');
  v_j2  := t.gov_jur('municipality', v_az, 'Othertown');

  v_e_ok        := t.gov_entity(v_j,  'city', 'City of Partnerville');
  v_e_unver     := t.gov_entity(v_j,  'city', 'City that only claimed');
  v_e_vernopart := t.gov_entity(v_j2, 'city', 'City verified but not partnered');
  v_e_other     := t.gov_entity(v_j2, 'city', 'City of Othertown');
  v_e_seed      := t.gov_entity(v_j2, 'city', 'Town ADUAtlas compiled');
  v_e_pendpart  := t.gov_entity(v_j2, 'city', 'City arranging a partnership');
  v_e_susppart  := t.gov_entity(v_j2, 'city', 'City whose partnership was suspended');

  v_u_ok    := t.mk_account('homeowner'); a_ok    := t.authid(v_u_ok);
  v_u_other := t.mk_account('homeowner'); a_other := t.authid(v_u_other);
  v_amy     := t.mk_account('admin');

  perform t.gov_claim(v_e_unver);

  perform t.gov_claim(v_e_ok);        perform t.gov_verify(v_e_ok);
  perform t.gov_claim(v_e_vernopart); perform t.gov_verify(v_e_vernopart);
  perform t.gov_claim(v_e_other);     perform t.gov_verify(v_e_other);
  perform t.gov_claim(v_e_pendpart);  perform t.gov_verify(v_e_pendpart);
  perform t.gov_claim(v_e_susppart);  perform t.gov_verify(v_e_susppart);
  perform t.gov_member(v_e_ok,    v_u_ok,    true, 'administrator');
  perform t.gov_member(v_e_other, v_u_other, true, 'administrator');
  perform t.gov_grant(v_e_ok,    v_j);
  perform t.gov_grant(v_e_other, v_j2);

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_j2, 'max_size', 'verified_from_source', '750 sq ft',
          'https://www.example.gov/othertown/adu', 'Othertown Zoning Code', 'city_code',
          '2026-09-01', 'published', 'source_checked')
  returning id into v_p_other;

  -- ── identity verification did NOT activate anything ───────────────────────
  execute format('select count(*)::int from public.government_partnerships where %I = %L',
                 v_ent_col, v_e_vernopart) into v_n;
  perform t.assert(
    'identity-verification-does-not-activate-a-partnership',
    '2p: an entity NEVER becomes an Education Partner because its identity was verified. Verifying identity and activating a partnership are two decisions ADUAtlas makes separately',
    v_n = 0,
    format('verifying a government entity''s IDENTITY produced %s partnership row(s) for it. Identity verification answers "is this really the city"; a partnership is a commercial and educational relationship ADUAtlas chooses to enter. One producing the other means every verified city silently gains resident sponsorship links it never asked for', v_n));

  -- ── THE POSITIVE CONTROL FOR GROUP B ─────────────────────────────────────
  begin
    v_part := t.part_partnership(v_e_ok, v_active, v_amy);
    v_pc_ok := v_part is not null;
    perform t.assert(
      'control-a-verified-entity-can-become-an-active-partner',
      '2p (ii): a VERIFIED entity can activate an ADUAtlas Education Partnership, and only an active partnership unlocks the partnership tools. This is the allowed path every refusal below is measured against',
      v_pc_ok,
      'the allowed path does not work: an active partnership could not be recorded for a verified entity at all.');
  exception when others then
    -- The row the whole group attacks with could not be built. Everything still
    -- unjudged is skipped WITH THE DATABASE'S OWN ERROR rather than left out.
    perform t.part_skip_group_b(format(
      'the group B positive control could not even be set up: an active partnership for a VERIFIED entity was refused with %s (%s). Until that works, every refusal in this group is indistinguishable from a partnership feature that works for nobody.',
      sqlerrm, sqlstate));
    return;
  end;

  -- The two middle partnership states the public badge must not print.
  if v_pc_ok then
    begin
      perform t.part_partnership(v_e_pendpart, coalesce(v_pending, 'pending'), v_amy);
      perform t.part_set_status(t.part_partnership(v_e_susppart, v_active, v_amy),
                                coalesce(v_suspended, 'suspended'));
    exception when others then
      perform t.part_skip('badge-pending-partnership-is-not-an-education-partner',
        '2p (ii): PARTNERSHIP PENDING is its own state',
        format('a pending or suspended partnership could not be created: %s (%s).', sqlerrm, sqlstate));
      perform t.part_skip('badge-suspended-partnership-is-not-an-education-partner',
        '2p (ii): INACTIVE OR SUSPENDED PARTNER is its own state',
        format('a pending or suspended partnership could not be created: %s (%s).', sqlerrm, sqlstate));
    end;
  end if;

  -- ── a partnership cannot activate without verified identity ───────────────
  perform t.part_refused_partnership(
    'partnership-cannot-activate-without-verified-identity',
    '2p: a partnership NEVER activates without the required verified identity, and 2p says that is a DATABASE constraint, not a UI rule',
    v_e_unver, v_active, v_amy,
    'an entity that has only CLAIMED — nobody has confirmed the person submitting the form represents the city — was made an active ADUAtlas Education Partner. Every sponsored resident link then hangs off an identity nobody checked');

  perform t.part_refused_partnership(
    'partnership-cannot-activate-for-an-unclaimed-entity',
    '2p: a partnership NEVER activates without the required verified identity',
    v_e_seed, v_active, v_amy,
    'a partnership was activated for an entity ADUAtlas compiled from a town''s public website, which nobody has claimed and nobody has verified. The town would be shown as an ADUAtlas Education Partner without ever having heard of ADUAtlas');

  -- ── no client-side state creates either status ────────────────────────────
  select count(*)::int into v_n
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'government_partnerships'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  select v_n + count(*)::int into v_n
    from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'government_partnerships'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  perform t.assert(
    'no-client-side-write-grant-on-the-partnership-table',
    '2p: no client-side state can create either status. Abuse controls are server side; this is not a client-side promo code',
    v_n = 0,
    format('%s write grant(s) on public.government_partnerships are held by anon or authenticated. A partnership is worth $79 per resident and is activated by ADUAtlas, so a browser-reachable write is the whole abuse surface in one grant', v_n));

  perform t.assert_changes_nothing(
    'authenticated-cannot-insert-a-partnership',
    '2p: no client-side state can create either status',
    'authenticated', a_ok,
    format('insert into public.government_partnerships (%I, %I) values (%L, %L)',
           v_ent_col, v_status, v_e_vernopart, v_active),
    'a signed-in government user can write a partnership row for their own entity, which is the $79 Golden sponsorship activating itself from a browser');

  perform t.assert_changes_nothing(
    'a-government-administrator-cannot-self-activate-a-partnership',
    '2p: a government user cannot self-activate a partnership unless Phase 1 explicitly builds an authorised workflow for it, and Phase 1 does not',
    'authenticated', a_ok,
    format('update public.government_partnerships set %I = %L where %I = %L',
           v_status, v_active, v_ent_col, v_e_ok),
    'the verified ADMINISTRATOR of a verified entity — the most privileged government role there is — can set their own partnership to active. Administrator is a role inside one institution and never an ADUAtlas approval');

  perform t.reg_unseen(
    'anon-cannot-read-the-partnership-table',
    '2p: abuse controls are server side. anon holds no table grants in this schema except SELECT on regulatory_topics',
    'anon', null,
    'select 1 from public.government_partnerships limit 1',
    'anon holds a grant on the partnership table. Whoever can read it can enumerate which governments are partners and which are pending, and a pending row is a negotiation');

  -- ── the member's own read, and the suspension that must be visible ────────
  v_read := t.q('authenticated', a_ok,
    format('select %I::text as status from public.government_partnerships where %I = %L',
           v_status, v_ent_col, v_e_ok));
  perform t.assert(
    'control-a-member-can-read-its-own-partnership',
    '2p: the partner portal shows the entity its own partnership. fetchMyPartnership() is the read behind it, and a suspension nobody can see is a suspension nobody can act on',
    (v_read->>'ok')::boolean and (v_read->>'count')::int = 1
      and (v_read->'rows'->0->>'status') = v_active,
    format('a verified administrator cannot read their own entity''s active partnership: %s. The two suspension assertions below are then unreadable rather than proved',
           coalesce(v_read->>'error', v_read->>'count')));

  if not ((v_read->>'ok')::boolean and (v_read->>'count')::int = 1) then
    perform t.skip('a-suspended-partnership-does-not-read-as-active-to-its-own-member',
      '2p: suspending a partnership produces the intended access change',
      'the positive control did not pass: the member cannot read their own partnership at all, so a suspended row reading as suspended cannot be told from a row nobody can see. See control-a-member-can-read-its-own-partnership.');
  else
   begin
    perform t.part_set_status(v_part, coalesce(v_suspended, 'suspended'));
    v_read := t.q('authenticated', a_ok,
      format('select %I::text as status from public.government_partnerships where %I = %L',
             v_status, v_ent_col, v_e_ok));
    perform t.assert(
      'a-suspended-partnership-does-not-read-as-active-to-its-own-member',
      '2p: suspending a partnership produces the intended access change, and every badge accurately represents the underlying state',
      (v_read->>'ok')::boolean
        and (v_read->'rows'->0->>'status') is distinct from v_active,
      format('a suspended partnership still reads as %L to its own portal. The portal decides whether to offer link and code generation from this value, so a stale read is the difference between a suspended partner and a partner still handing out $79 entitlements',
             coalesce(v_read->'rows'->0->>'status', '<nothing>')));

    perform t.assert_changes_nothing(
      'a-government-administrator-cannot-reactivate-a-suspended-partnership',
      '2p: Amy controls whether sponsored resident access is active. Suspension is ADUAtlas''s decision and a government cannot undo it',
      'authenticated', a_ok,
      format('update public.government_partnerships set %I = %L where id = %L',
             v_status, v_active, v_part),
      'the government administrator can switch their own suspended partnership back on, which makes suspension advisory');

    perform t.part_set_status(v_part, v_active);
   exception when others then
    -- Suspending or restoring a partnership raised. That is a product fact worth
    -- seeing, but it must not take the other fifty assertions in this file down
    -- with it, so the two it underwrites are skipped with the error.
    perform t.part_skip('a-suspended-partnership-does-not-read-as-active-to-its-own-member',
      '2p: suspending a partnership produces the intended access change',
      format('suspending the partnership raised: %s (%s).', sqlerrm, sqlstate));
    perform t.part_skip('a-government-administrator-cannot-reactivate-a-suspended-partnership',
      '2p: Amy controls whether sponsored resident access is active',
      format('suspending the partnership raised: %s (%s).', sqlerrm, sqlstate));
   end;
  end if;

  perform t.reg_unseen(
    'a-member-cannot-read-another-entitys-partnership',
    '2p: a government user never reaches another government''s management area',
    'authenticated', a_other,
    format('select 1 from public.government_partnerships where %I = %L', v_ent_col, v_e_ok),
    'a verified member of one city can read another city''s partnership record, including whether it is pending. Roles stay separate and one government''s management area is not another''s');

  -- ── a partnership widens no authority at all ──────────────────────────────
  if not v_pc_ok then
    perform t.skip('an-active-partner-still-cannot-submit-outside-its-grant',
      '2p: a partnership grants no regulatory-admin privilege',
      'the group B positive control did not pass, so there is no active partnership to attack with.');
  else
    perform t.assert_changes_nothing(
      'an-active-partner-still-cannot-submit-outside-its-grant',
      '2p: government verification grants no regulatory-admin privilege beyond the explicitly granted jurisdiction, and an ADUAtlas Education Partnership grants none either. The partnership is about resident education, not authority',
      'authenticated', a_ok,
      t.gov_submit_sql(v_j2, v_e_ok, v_u_ok, 'max_size'),
      'an ACTIVE Education Partner can submit for a jurisdiction it holds no grant on. The partnership is a commercial relationship about sponsoring residents; reading it as editorial authority means paying ADUAtlas widens what a city may write');
  end if;

  perform t.assert_changes_nothing(
    'an-active-partner-still-cannot-edit-another-citys-record',
    '2p: one city cannot edit another city''s information',
    'authenticated', a_ok,
    format('update public.regulatory_provisions set value_text = ''rewritten by a partner city'' where id = %L', v_p_other),
    'an active Education Partner can rewrite a neighbouring city''s published rule');

  perform t.assert_changes_nothing(
    'an-active-partner-still-cannot-publish-without-review',
    '2m, 2p: a member SUBMITS, Amy reviews, ADUAtlas publishes. Verification is not a publishing right and neither is a partnership',
    'authenticated', a_ok,
    format('insert into public.regulatory_provisions (jurisdiction_id, topic_key, review_status) values (%L, ''impact_fees'', ''published'')', v_j),
    'an active Education Partner can publish straight into the ADUAtlas regulatory database with no review, so the partnership bought a publishing right');

  -- ── the partner-administration surface is Amy's, through the server only ──
  -- 2p: "Amy can perform only the government-administration functions explicitly
  -- assigned to her", and #28: ignore the React interface and attack the API and
  -- database directly. These functions are SECURITY DEFINER, so the EXECUTE
  -- privilege is the entire boundary: one stray grant and activating a partnership
  -- or minting a resident link becomes an anon-key call.
  select count(*)::int into v_n
    from pg_proc pr
    join pg_namespace ns on ns.oid = pr.pronamespace
   where ns.nspname = 'public'
     and pr.proname ~ '^admin_.*(partner|partnership)'
     and (has_function_privilege('anon', pr.oid, 'EXECUTE')
       or has_function_privilege('authenticated', pr.oid, 'EXECUTE'));
  perform t.assert(
    'the-partner-admin-functions-are-service-role-only',
    '2p: abuse controls are server side, and Amy''s partner administration — activate, suspend, issue a link, issue a code, switch one off — is never reachable from a browser',
    v_n = 0,
    format('%s partner-administration function(s) are executable by anon or authenticated. Each of them is SECURITY DEFINER, so the EXECUTE grant is the whole authorization boundary: with one, a signed-in account activates partnerships and mints $79 resident links with the public key', v_n));

  if t.has_function('public.admin_set_partnership_status') then
    perform t.assert_denied(
      'authenticated-cannot-call-the-partnership-admin-function',
      '2p: a government user cannot self-activate a partnership. The admin path is ADUAtlas''s, whoever finds the function name',
      'authenticated', a_ok,
      format('select public.admin_set_partnership_status(%L::uuid, ''active'', %L::uuid, ''activated from a browser'')',
             v_e_vernopart, v_u_ok),
      'a signed-in government user can call the partnership administration function directly and activate their own partnership, which is the whole decision in one PostgREST call');
  else
    perform t.skip('authenticated-cannot-call-the-partnership-admin-function',
      '2p: a government user cannot self-activate a partnership',
      'public.admin_set_partnership_status does not exist under that name, so there is no partnership administration function to attack by name. The privilege scan above still covers every function matching admin_*partner*.');
  end if;

  -- ── free stays free ──────────────────────────────────────────────────────
  select count(*)::int into v_n
    from information_schema.columns
   where table_schema = 'public'
     and (table_name like 'partner%' or table_name = 'government_partnerships')
     and column_name ~* '(stripe|price|amount|invoice|billed|billing|subscription|charge|_fee)';
  perform t.assert(
    'sponsorship-introduces-no-government-billing',
    '2m: government accounts cost nothing in Phase 1 and there is NO government billing. 2p: the partner gives its residents the $79 educational access for $0',
    v_n = 0,
    format('%s billing-shaped column(s) exist on the partnership and sponsorship tables. A billing column is a billing plan: it gets filled in, and the free partnership ADUAtlas uses to approach a city stops being free', v_n));

  -- ── the four legitimate combinations, on the public surface ──────────────
  v_badge_rel := t.part_badge_rel();
  v_badge_col := case when v_badge_rel is null then null else t.part_badge_col(v_badge_rel) end;
  v_badge_key := case when v_badge_rel is null then null
                      else t.reg_col(v_badge_rel, array['^entity_id$', '^id$']) end;

  if v_badge_rel is null or v_badge_col is null or v_badge_key is null then
    perform t.skip('badge-combination-verified-but-not-a-partner',
      '2p: four legitimate combinations, and every public badge accurately represents the underlying state',
      'no anonymous-facing relation exposes partnership status: t.part_badge_rel() found nothing carrying a partnership column. 2p says the label "ADUAtlas Education Partner" is shown publicly, so either the badge has no server-side source and is being derived in the client — which 2p forbids — or the public surface for it is named something this probe does not recognise. Not proved either way.');
    perform t.skip('badge-combination-verified-and-education-partner',
      '2p: four legitimate combinations, and every public badge accurately represents the underlying state',
      'no anonymous-facing relation exposes partnership status; see badge-combination-verified-but-not-a-partner.');
  else
    -- Counted rather than read, because "not a partner" is legitimately expressed
    -- either as a row saying so or as the absence of a row, and both are correct.
    perform t.assert_count(
      'badge-combination-verified-but-not-a-partner',
      '2p: Verified Government Account but NOT an Education Partner is one of the four legitimate combinations, and the public surface must say exactly that',
      'anon', null,
      format('select 1 from %s where %I = %L and %I::text in (%L, ''true'')',
             v_badge_rel, v_badge_key, v_e_vernopart, v_badge_col, v_active),
      0,
      format('a VERIFIED entity with no partnership at all reads as an Education Partner on %s. That sentence tells a homeowner their city sponsors ADUAtlas education when it does not, and it is the exact conflation 2p exists to prevent', v_badge_rel));

    -- The two middle states, which is where a badge actually goes wrong. Nobody
    -- renders "partner" off an entity with no partnership row; the mistake is a
    -- public surface that lists the partnership table without filtering on ACTIVE,
    -- and then a city ARRANGING a partnership, or one ADUAtlas suspended, reads
    -- exactly like one paying for its residents' education.
    perform t.assert_count(
      'badge-pending-partnership-is-not-an-education-partner',
      '2p (ii): PARTNERSHIP PENDING is its own state and ONLY an active partnership unlocks anything. Claimed with verification pending, and verified while a partnership is pending, are both legitimate combinations that must not read as partnership',
      'anon', null,
      format('select 1 from %s where %I = %L and %I::text in (%L, ''true'')',
             v_badge_rel, v_badge_key, v_e_pendpart, v_badge_col, v_active),
      0,
      format('an entity whose partnership is still PENDING reads as an ADUAtlas Education Partner on %s. Pending means ADUAtlas and the city are still arranging it, and publishing it as a partnership announces a relationship that does not exist yet', v_badge_rel));

    perform t.assert_count(
      'badge-suspended-partnership-is-not-an-education-partner',
      '2p (ii): INACTIVE OR SUSPENDED PARTNER is its own state, and suspending a partnership produces the intended access change on the public surface too',
      'anon', null,
      format('select 1 from %s where %I = %L and %I::text in (%L, ''true'')',
             v_badge_rel, v_badge_key, v_e_susppart, v_badge_col, v_active),
      0,
      format('an entity whose partnership ADUAtlas SUSPENDED still reads as an ADUAtlas Education Partner on %s. The badge outlives the relationship it describes, and residents keep being told their city sponsors access it no longer sponsors', v_badge_rel));

    perform t.assert_count(
      'badge-combination-verified-and-education-partner',
      '2p: Verified Government Account AND Education Partner is the fourth combination. This is the positive control for the badge: it must be able to say yes',
      'anon', null,
      format('select 1 from %s where %I = %L and %I::text in (%L, ''true'')',
             v_badge_rel, v_badge_key, v_e_ok, v_badge_col, v_active),
      1,
      format('an entity that IS verified and IS an active Education Partner does not read as one on %s, so the assertion above passes only because nothing on that surface ever reads as a partner', v_badge_rel));
  end if;

end
$$;

-- Redeem a token that must grant NOTHING, and say so in the two ways it can fail:
-- an entitlement that moved, or an attribution recorded for a sponsorship that never
-- happened. Gated on the group's positive control, because "granted nothing" and
-- "grants nobody anything" are the same observation from the outside.
create or replace function t.part_grants_nothing(
  p_name text, p_rule text, p_kind text, p_token text, p_user uuid,
  p_detail text, p_control_ok boolean)
returns void
language plpgsql
as $fn$
declare
  v_env jsonb;
  v_before text;
  v_after  text;
begin
  if not p_control_ok then
    perform t.record(p_name, p_rule, 'skip',
      'the group C positive control did not pass, so "this token granted nothing" cannot be told apart from a redemption path that grants nothing to anybody. See control-an-active-partner-link-grants-golden.');
    return;
  end if;
  v_before := t.part_grant_of(p_user);
  v_env    := t.part_redeem(p_kind, p_token, p_user);
  v_after  := t.part_grant_of(p_user);
  if v_after is distinct from v_before then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      format('the account went from %L to %L, so the token granted an entitlement', v_before, v_after));
  elsif t.part_redemptions_for(p_user) > 0 then
    perform t.record(p_name, p_rule, 'fail',
      coalesce(p_detail || ' — ', '') ||
      'no entitlement changed but a redemption WAS recorded, so partner analytics count a sponsored activation that never happened');
  else
    perform t.record(p_name, p_rule, 'pass', null);
  end if;
end
$fn$;

create or replace function t.part_skip_group_c(p_reason text)
returns void
language plpgsql
as $fn$
begin
  perform t.part_skip('control-an-active-partner-link-grants-golden',
    '2p: a valid active-partner LINK grants exactly the sponsored $79 Golden entitlement',
    p_reason);
  perform t.part_skip('control-an-active-partner-code-grants-golden',
    '2p: a valid active-partner CODE grants the same',
    p_reason);
  perform t.part_skip('link-and-code-grant-the-same-entitlement',
    '2p: two distribution methods, ONE underlying system. A link and a code resolve to the SAME sponsored entitlement and the SAME attribution',
    p_reason);
  perform t.part_skip('redemption-is-attributed-to-the-partnership',
    '2p: attribution is recorded server side',
    p_reason);
  perform t.part_skip('sponsored-access-is-exactly-golden',
    '2p: the sponsored benefit is the $79 Golden educational entitlement and NOTHING else',
    p_reason);
  perform t.part_skip('a-sponsored-user-gains-no-other-role',
    '2p: no manipulation may grant Platinum, Concierge, admin, builder, government or any other role or tier',
    p_reason);
  perform t.part_skip('an-unknown-token-grants-nothing',
    '2p: invalid, expired, disabled or manipulated links and codes grant NOTHING',
    p_reason);
  perform t.part_skip('an-expired-link-grants-nothing',
    '2p: invalid, expired, disabled or manipulated links and codes grant NOTHING',
    p_reason);
  perform t.part_skip('a-disabled-link-grants-nothing',
    '2p: invalid, expired, disabled or manipulated links and codes grant NOTHING',
    p_reason);
  perform t.part_skip('a-disabled-code-grants-nothing',
    '2p: invalid, expired, disabled or manipulated links and codes grant NOTHING',
    p_reason);
  perform t.part_skip('a-manipulated-token-grants-nothing',
    '2p: no manipulation of a URL, request, payload or stored value may grant anything',
    p_reason);
  perform t.part_skip('a-code-presented-as-a-link-grants-nothing',
    '2p: no manipulation of a URL, request, payload or stored value may grant anything',
    p_reason);
  perform t.part_skip('an-unrecognised-kind-grants-nothing',
    '2p: a sponsored user cannot manipulate the flow into Platinum, Concierge, builder, government or admin',
    p_reason);
  perform t.part_skip('a-pending-partnerships-link-grants-nothing',
    '2p: partnership links and codes work ONLY for an active partnership',
    p_reason);
  perform t.part_skip('redeem-is-not-callable-by-anon',
    '2p: abuse controls are server side. The sponsored grant is a service-role-only RPC',
    p_reason);
  perform t.part_skip('redeem-is-not-callable-by-a-signed-in-user',
    '2p: abuse controls are server side. The sponsored grant is a service-role-only RPC',
    p_reason);
  perform t.part_skip('a-token-cannot-be-redeemed-twice-by-the-same-person',
    '2p: duplicate redemption has deliberate controls',
    p_reason);
  perform t.part_skip('a-sponsored-user-cannot-self-upgrade-to-platinum',
    '2p: Platinum does not become free and Concierge does not become free',
    p_reason);
  perform t.part_skip('a-sponsored-user-cannot-become-a-builder-owner',
    '2p: roles stay separate',
    p_reason);
  perform t.part_skip('a-sponsored-user-cannot-become-a-government-member',
    '2p: roles stay separate',
    p_reason);
  perform t.part_skip('a-sponsored-user-cannot-become-an-admin',
    '2p: roles stay separate',
    p_reason);
  perform t.part_skip('a-sponsored-golden-user-keeps-the-paid-upgrade-path',
    '2p: a sponsored homeowner who later wants Platinum or Concierge has a clean upgrade path with explicit pricing',
    p_reason);
  perform t.part_skip('the-sponsoring-government-cannot-read-the-residents-account',
    '2p: a government partner NEVER sees an individual homeowner''s private information merely because it sponsored the access',
    p_reason);
  perform t.part_skip('the-sponsoring-government-cannot-read-the-residents-study',
    '2p: nor private homeowner information of any other kind',
    p_reason);
  perform t.part_skip('the-sponsoring-government-cannot-read-builder-private-data',
    '2p: nor builder-private information',
    p_reason);
  perform t.part_skip('the-sponsoring-government-cannot-reach-admin',
    '2p: nor ADUAtlas admin functionality',
    p_reason);
  perform t.part_skip('the-redemption-log-does-not-expose-the-resident-to-the-partner',
    '2p: analytics stay aggregate and expose no unnecessary homeowner personal information',
    p_reason);
  perform t.part_skip('partner-analytics-expose-no-homeowner-identity',
    '2p: partner analytics default to aggregate',
    p_reason);
  perform t.part_skip('a-suspended-partnership-grants-no-new-link-activations',
    '2p: disabling a partnership prevents NEW sponsored activations',
    p_reason);
  perform t.part_skip('a-suspended-partnership-grants-no-new-code-activations',
    '2p: disabling a partnership prevents NEW sponsored activations',
    p_reason);
  perform t.part_skip('disabling-a-partnership-does-not-strip-access-already-granted',
    '2p: disabling a partnership prevents NEW sponsored activations WITHOUT corrupting existing homeowner accounts. This is the rule most likely to be implemented backwards',
    p_reason);
  perform t.part_skip('disabling-a-partnership-does-not-erase-the-attribution',
    '2p: attribution is recorded server side, and a suspended partnership''s history is what the analytics are counted from',
    p_reason);
  perform t.part_skip('identity-verification-has-a-suspended-state',
    '2p (i): the internal identity states are UNCLAIMED, CLAIM PENDING, IDENTITY VERIFIED, VERIFICATION REJECTED and SUSPENDED',
    p_reason);
  perform t.part_skip('withdrawing-identity-verification-leaves-no-active-partnership',
    '2p: suspending VERIFICATION produces the intended access change',
    p_reason);
  perform t.part_skip('withdrawing-identity-verification-stops-new-sponsored-activations',
    '2p: suspending VERIFICATION produces the intended access change',
    p_reason);
  perform t.part_skip('withdrawing-identity-verification-does-not-strip-access-already-granted',
    '2p: disabling prevents NEW sponsored activations WITHOUT corrupting existing homeowner accounts',
    p_reason);
end
$fn$;

-- =============================================================================
-- GROUP C — SPONSORED RESIDENT EDUCATION
--
-- Two distribution methods, ONE underlying system: a partner LINK and a partner
-- CODE must resolve to the SAME sponsored entitlement and the SAME attribution.
-- The entitlement is EXACTLY the $79 Golden educational access and nothing else.
--
-- Gated on migration 0014 and on public.redeem_partner_access by name.
-- =============================================================================
do $$
declare
  v_active text; v_pending text; v_suspended text;
  v_status text; v_ent_col text;
  v_az uuid; v_j uuid; v_j2 uuid;
  v_e uuid; v_e2 uuid; v_e_pend uuid;
  v_part uuid; v_part2 uuid; v_part_pend uuid;
  v_u_gov uuid; a_gov uuid; v_amy uuid;
  v_link text; v_code text; v_link2 text; v_code2 text; v_link_pend text;
  v_link_exp text; v_link_off text; v_code_off text;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r6 uuid; r7 uuid; r8 uuid;
  r9 uuid; r10 uuid; r11 uuid; r12 uuid; r13 uuid; r14 uuid; r15 uuid;
  v_env jsonb; v_ctl_ok boolean := false; v_ctl_code_ok boolean := false;
  v_builder uuid;
  v_an text; v_n int; v_cols text;
  v_before text;
  v_e3 uuid; v_part3 uuid; v_link3 text; r16 uuid; r17 uuid;
  v_susp_identity text; v_pstatus text; v_upd jsonb;
begin
  if not t.has_relation('public.government_partnerships')
     or not t.has_relation('public.partner_access_links')
     or not t.has_relation('public.partner_access_codes')
     or not t.has_function('public.redeem_partner_access') then
    perform t.part_skip_group_c(
      'public.government_partnerships, public.partner_access_links, public.partner_access_codes or public.redeem_partner_access(text, text, uuid) is missing. Migration 0014 and the sponsored-grant RPC are not applied to this database, so no sponsorship rule can be attacked here and none is reported as proved. A skip is not a pass.');
    return;
  end if;

  v_status  := t.part_status_col();
  v_ent_col := t.part_entity_col('public.government_partnerships');
  v_active    := t.part_status_token('active');
  v_pending   := coalesce(t.part_status_token('pending'), 'pending');
  v_suspended := coalesce(t.part_status_token('suspended'), 'suspended');

  -- ── a verified, partnered city, and its two distribution methods ─────────
  v_az := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_j  := t.gov_jur('municipality', v_az, 'Sponsor City');
  v_j2 := t.gov_jur('municipality', v_az, 'Second Sponsor City');

  v_e      := t.gov_entity(v_j,  'city', 'City of Sponsor City');
  v_e2     := t.gov_entity(v_j2, 'city', 'City of Second Sponsor City');
  v_e_pend := t.gov_entity(v_j2, 'city', 'City awaiting partnership approval');

  v_u_gov := t.mk_account('homeowner'); a_gov := t.authid(v_u_gov);
  v_amy   := t.mk_account('admin');

  perform t.gov_claim(v_e);      perform t.gov_verify(v_e);
  perform t.gov_claim(v_e2);     perform t.gov_verify(v_e2);
  perform t.gov_claim(v_e_pend); perform t.gov_verify(v_e_pend);
  perform t.gov_member(v_e, v_u_gov, true, 'administrator');
  -- Every entity that will issue resident access holds an EXPLICIT grant on the
  -- jurisdiction the access is labelled for. That is the only source of authority
  -- (2m), and sponsorship is scoped to it like everything else.
  perform t.gov_grant(v_e,      v_j);
  perform t.gov_grant(v_e2,     v_j2);
  perform t.gov_grant(v_e_pend, v_j2);

  r1  := t.mk_account('homeowner'); r2  := t.mk_account('homeowner');
  r3  := t.mk_account('homeowner'); r4  := t.mk_account('homeowner');
  r5  := t.mk_account('homeowner'); r6  := t.mk_account('homeowner');
  r7  := t.mk_account('homeowner'); r8  := t.mk_account('homeowner');
  r9  := t.mk_account('homeowner'); r10 := t.mk_account('homeowner');
  r11 := t.mk_account('homeowner'); r12 := t.mk_account('homeowner');
  r13 := t.mk_account('homeowner'); r14 := t.mk_account('homeowner');
  r15 := t.mk_account('homeowner');
  v_builder := t.mk_builder();

  begin
    v_part      := t.part_partnership(v_e,      v_active, v_amy);
    v_part2     := t.part_partnership(v_e2,     v_active, v_amy);
    -- The pending partner's link is MINTED WHILE THE PARTNERSHIP IS ACTIVE and the
    -- partnership is then moved back to pending. Resident access can only be issued
    -- by an active partner, so that is the only way this state exists — and it is
    -- also the real shape of the attack: a link that was legitimately handed out and
    -- whose partnership is no longer approved.
    v_part_pend := t.part_partnership(v_e_pend, v_active, v_amy);

    v_link      := t.part_access('public.partner_access_links', v_part,  v_e,  v_amy, v_j);
    v_link_exp  := t.part_access('public.partner_access_links', v_part,  v_e,  v_amy, v_j,
                                 quote_literal('2020-01-01T00:00:00Z') || '::timestamptz');
    v_link_off  := t.part_access('public.partner_access_links', v_part,  v_e,  v_amy, v_j, null, true);
    v_link2     := t.part_access('public.partner_access_links', v_part2, v_e2, v_amy, v_j2);
    v_link_pend := t.part_access('public.partner_access_links', v_part_pend, v_e_pend, v_amy, v_j2);

    v_code      := t.part_access('public.partner_access_codes', v_part,  v_e,  v_amy, v_j);
    v_code_off  := t.part_access('public.partner_access_codes', v_part,  v_e,  v_amy, v_j, null, true);
    v_code2     := t.part_access('public.partner_access_codes', v_part2, v_e2, v_amy, v_j2);

    perform t.part_set_status(v_part_pend, v_pending);
  exception when others then
    -- The shared contract names four tables and one RPC but not every column inside
    -- them. Where a required column cannot be resolved the honest outcome is a skip
    -- carrying the database's own error, naming the column, rather than a suite that
    -- invents a business value for it or a run that quietly contains fewer tests.
    perform t.part_skip_group_c(format(
      'THE SPONSORSHIP FIXTURES COULD NOT BE BUILT, so nothing in this group was attacked: %s (%s). This suite resolves the partnership, link and code columns from the catalogue and reports the gap instead of inventing a value for one.',
      sqlerrm, sqlstate));
    return;
  end;

  -- ── THE TWO POSITIVE CONTROLS ───────────────────────────────────────────
  v_env := t.part_redeem('link', v_link, r1);
  v_ctl_ok := (v_env->>'ok')::boolean and t.part_grant_of(r1) = t.part_golden();
  perform t.assert(
    'control-an-active-partner-link-grants-golden',
    '2p: a valid active-partner LINK grants exactly the sponsored $79 Golden entitlement. This is the allowed path; every "grants nothing" assertion below is measured against it',
    v_ctl_ok,
    format('a resident arriving through an ACTIVE partner''s link did not receive the Golden entitlement: the account holds %L and the call said %s. Until this passes, every refusal below is indistinguishable from a redemption path that grants nobody anything, so those assertions are reported as skips rather than as green security',
           t.part_grant_of(r1),
           coalesce(v_env->>'error', (v_env->'rows'->0->'result')::text, '<nothing>')));

  v_env := t.part_redeem('code', v_code, r2);
  v_ctl_code_ok := (v_env->>'ok')::boolean and t.part_grant_of(r2) = t.part_golden();
  perform t.assert(
    'control-an-active-partner-code-grants-golden',
    '2p: a valid active-partner CODE grants the same. The portal offers both so a partner uses whichever is easier',
    v_ctl_code_ok,
    format('a resident who entered the partner''s CODE at signup did not receive the Golden entitlement: the account holds %L and the call said %s',
           t.part_grant_of(r2),
           coalesce(v_env->>'error', (v_env->'rows'->0->'result')::text, '<nothing>')));

  perform t.assert(
    'link-and-code-grant-the-same-entitlement',
    '2p: two distribution methods, ONE underlying system. A partner link and a partner code resolve to the SAME sponsored entitlement and the SAME attribution, never two unrelated implementations',
    v_ctl_ok and v_ctl_code_ok
      and t.part_grant_of(r1) = t.part_grant_of(r2)
      and t.part_redemptions_for(r1) = t.part_redemptions_for(r2),
    format('the link granted %L with %s recorded redemption(s) and the code granted %L with %s. Two implementations drift: one gets a fix the other does not, and the attribution a partner is shown stops matching what residents actually received',
           t.part_grant_of(r1), t.part_redemptions_for(r1),
           t.part_grant_of(r2), t.part_redemptions_for(r2)));

  perform t.assert(
    'redemption-is-attributed-to-the-partnership',
    '2p: attribution is recorded server side. A partner sees how many residents entered through the partnership, and that number comes from a recorded redemption rather than from a client',
    t.part_redemptions_for(r1) = 1,
    format('%s attribution row(s) exist for a resident who redeemed once. -1 means public.partner_redemptions has no column this suite could resolve to the person who redeemed, which is its own problem: the sponsorship happened and nothing records who it was for',
           t.part_redemptions_for(r1)));

  perform t.assert_scalar(
    'sponsored-access-is-exactly-golden',
    '2p: the sponsored benefit is the $79 Golden educational entitlement and NOTHING else. Platinum does not become free, Concierge does not become free, and feasibility studies do not become free',
    'service_role', null,
    format('select paid_tier from public.users where id = %L', r1),
    t.part_golden(),
    'the sponsored grant did not land on exactly the Golden package. The commercial rule that must not erode is that a government sponsors education and nothing else');

  perform t.assert(
    'a-sponsored-user-gains-no-other-role',
    '2p: no manipulation may grant Platinum, Concierge, admin, builder, government or any other role or tier. A sponsored resident is an ordinary homeowner who did not pay',
    (select role from public.users where id = r1) = 'homeowner'
      and not exists (select 1 from public.builders where owner_user_id = r1)
      and not exists (select 1 from public.government_users where user_id = r1),
    format('a sponsored resident holds role %L, %s builder listing(s) and %s government profile(s). Sponsorship is an entitlement to education; it is not a role and it is not a relationship with the city that paid for it',
           (select role from public.users where id = r1),
           (select count(*) from public.builders where owner_user_id = r1),
           (select count(*) from public.government_users where user_id = r1)));

  -- ── invalid, expired, disabled, manipulated ─────────────────────────────
  perform t.part_grants_nothing(
    'an-unknown-token-grants-nothing',
    '2p: invalid, expired, disabled or manipulated links and codes grant NOTHING. Code guessing and brute force have deliberate controls',
    'link', 'no-such-token-' || nextval('t.fixture_seq')::text, r3,
    'a token nobody issued granted an entitlement, which means the $79 Golden package is reachable by guessing a URL',
    v_ctl_ok);

  perform t.part_grants_nothing(
    'an-expired-link-grants-nothing',
    '2p: invalid, EXPIRED, disabled or manipulated links and codes grant NOTHING',
    'link', v_link_exp, r4,
    'a link whose expiry passed in 2020 still granted the sponsored entitlement, so an expiry date is decoration',
    v_ctl_ok);

  perform t.part_grants_nothing(
    'a-disabled-link-grants-nothing',
    '2p: invalid, expired, DISABLED or manipulated links and codes grant NOTHING. The portal manages links, and managing one means being able to stop it',
    'link', v_link_off, r5,
    'a link the partner disabled still granted the sponsored entitlement. A link that cannot be switched off cannot be given to a newspaper',
    v_ctl_ok);

  perform t.part_grants_nothing(
    'a-disabled-code-grants-nothing',
    '2p: invalid, expired, DISABLED or manipulated links and codes grant NOTHING',
    'code', v_code_off, r6,
    'a code the partner disabled still granted the sponsored entitlement',
    v_ctl_ok);

  perform t.part_grants_nothing(
    'a-manipulated-token-grants-nothing',
    '2p: NO manipulation of a URL, request, payload or stored value may grant Platinum, Concierge, admin, builder, government or any other role or tier',
    'link', v_link || 'x', r7,
    'a token with a character appended still resolved, so the lookup is a prefix, a LIKE or a trim rather than an identity',
    v_ctl_ok);

  perform t.part_grants_nothing(
    'a-code-presented-as-a-link-grants-nothing',
    '2p: a partner link and a partner code resolve to the same ENTITLEMENT through one system; they are not interchangeable credentials',
    'link', v_code, r8,
    'a resident access CODE redeemed as a LINK token. The two stores have different lifecycles — a code can be retired while a link stays live — and a lookup that accepts either makes both lifecycles meaningless',
    v_ctl_ok);

  perform t.part_grants_nothing(
    'an-unrecognised-kind-grants-nothing',
    '2p: a sponsored user cannot manipulate the flow into Platinum, Concierge, builder, government or admin. The entitlement granted is EXACTLY the allowed sponsored one',
    'platinum', v_link, r9,
    'passing a package name where the kind of credential belongs granted something. The kind argument selects which store to look in; if an unknown value falls through to a grant, the tier is being taken from the request',
    v_ctl_ok);

  perform t.part_grants_nothing(
    'a-pending-partnerships-link-grants-nothing',
    '2p: partnership links and codes work ONLY for an active partnership. ONLY an active partnership unlocks the resident sponsored access links, the resident access codes and the $79 Golden sponsorship',
    'link', v_link_pend, r14,
    'a link belonging to a partnership that is still PENDING granted the sponsored entitlement. Pending means ADUAtlas has not approved the relationship, so residents would be receiving $79 of education against a partnership nobody agreed to',
    v_ctl_ok);

  -- ── the RPC is service-role only ────────────────────────────────────────
  perform t.assert_denied(
    'redeem-is-not-callable-by-anon',
    '2p: abuse controls are server side. This is not a client-side promo code, and the sponsored grant is a SERVICE-ROLE-ONLY RPC',
    'anon', null,
    format('select public.redeem_partner_access(''link'', %L, %L::uuid)', v_link, r15),
    'anon can call the sponsored-grant RPC directly with the anon key, which is the abuse surface 2p puts server side');

  perform t.assert_denied(
    'redeem-is-not-callable-by-a-signed-in-user',
    '2p: abuse controls are server side, and the resident entry endpoint is api/partner-redeem.js, not a PostgREST call from the browser',
    'authenticated', t.authid(r15),
    format('select public.redeem_partner_access(''link'', %L, %L::uuid)', v_link, r15),
    'any signed-in account can call the sponsored-grant RPC and hand itself, or somebody else, the Golden entitlement');

  -- ── duplicate redemption ────────────────────────────────────────────────
  if not v_ctl_ok then
    perform t.skip('a-token-cannot-be-redeemed-twice-by-the-same-person',
      '2p: duplicate redemption has deliberate controls',
      'the group C positive control did not pass, so a second redemption changing nothing cannot be told apart from a first one that did nothing either.');
  else
    v_env := t.part_redeem('link', v_link, r1);
    perform t.assert(
      'a-token-cannot-be-redeemed-twice-by-the-same-person',
      '2p: duplicate redemption has deliberate controls. The same resident arriving twice is one sponsorship',
      t.part_grant_of(r1) = t.part_golden() and t.part_redemptions_for(r1) = 1,
      format('redeeming the same link twice left the account holding %L with %s recorded redemption(s). Counting the same resident twice overstates what the partnership delivered, and the number a city is shown is the whole point of the analytics',
             t.part_grant_of(r1), t.part_redemptions_for(r1)));
  end if;

  -- ── a sponsored resident cannot escalate, and can still buy ─────────────
  perform t.assert_denied(
    'a-sponsored-user-cannot-self-upgrade-to-platinum',
    '2p: Platinum does not become free and Concierge does not become free. The commercial rule must not erode',
    'authenticated', t.authid(r1),
    'update public.users set paid_tier = ''report'' where auth_user_id = auth.uid()',
    'a sponsored Golden resident can write their own tier and take Platinum for nothing, which turns a government''s education sponsorship into a free feasibility product');

  perform t.assert_denied(
    'a-sponsored-user-cannot-become-an-admin',
    '2p: roles stay separate — homeowner, builder, affiliate or partner builder, municipality government, state government or agency, and ADUAtlas admin',
    'authenticated', t.authid(r1),
    'update public.users set role = ''admin'' where auth_user_id = auth.uid()',
    'a sponsored resident can promote themselves to ADUAtlas admin');

  perform t.assert_changes_nothing(
    'a-sponsored-user-cannot-become-a-builder-owner',
    '2p: roles stay separate. A sponsored homeowner is not a builder',
    'authenticated', t.authid(r1),
    format('update public.builders set owner_user_id = %L where id = %L', r1, v_builder),
    'a sponsored resident can attach themselves to a builder listing, which is the marketplace side of the product handed over by redeeming an education link');

  perform t.assert_changes_nothing(
    'a-sponsored-user-cannot-become-a-government-member',
    '2p: roles stay separate, and a government membership is verified by ADUAtlas',
    'authenticated', t.authid(r1),
    format('insert into public.government_memberships (entity_id, government_user_id, membership_role, status) values (%L, %L, ''administrator'', ''verified'')',
           v_e, t.gov_person(r1)),
    'the resident a city sponsored can insert themselves as a verified administrator of that city');

  -- Sponsored first, then upgraded the way api/stripe-webhook.js upgrades anybody.
  -- The two statements run in order and the assertion reads the result afterwards,
  -- because the operands of an AND are not evaluated in any guaranteed order.
  v_env    := t.part_redeem('link', v_link, r10);
  v_before := t.part_grant_of(r10);
  v_env    := t.x('service_role', null,
    format('update public.users set paid_tier = ''report'', paid_at = now() where id = %L', r10));
  perform t.assert(
    'a-sponsored-golden-user-keeps-the-paid-upgrade-path',
    '2p: a sponsored homeowner who later wants Platinum or Concierge has a clean upgrade path with explicit pricing. A sponsored entitlement is not a ceiling',
    v_before = t.part_golden()
      and (v_env->>'ok')::boolean
      and (select paid_tier from public.users where id = r10) = 'report'
      and t.part_redemptions_for(r10) = 1,
    format('a sponsored Golden resident (%L before the upgrade) could not be moved onto a paid Platinum package by the normal server-side path, or the upgrade erased the sponsorship attribution: tier is now %L with %s redemption(s) recorded. Either way the resident is stuck on the free package they were given, or the partnership loses the record of having delivered it',
           v_before, (select paid_tier from public.users where id = r10),
           t.part_redemptions_for(r10)));

  -- ── the sponsor sees a count, never a resident ──────────────────────────
  perform t.reg_unseen(
    'the-sponsoring-government-cannot-read-the-residents-account',
    '2p: a government partner NEVER sees an individual homeowner''s private information merely because it sponsored the access',
    'authenticated', a_gov,
    format('select email from public.users where id = %L', r1),
    'the city that sponsored a resident can read that resident''s account row. Sponsoring somebody''s education is not a relationship with them, and a homeowner asking their city for a free course did not agree to be identified to it');

  if t.has_relation('public.studies') then
    perform t.reg_unseen(
      'the-sponsoring-government-cannot-read-the-residents-study',
      '2p: nor private homeowner information of any other kind',
      'authenticated', a_gov,
      'select 1 from public.studies',
      'the sponsoring city can read homeowner feasibility studies, which carry a property address and what the homeowner is planning to build');
  else
    perform t.skip('the-sponsoring-government-cannot-read-the-residents-study',
      '2p: nor private homeowner information of any other kind',
      'public.studies does not exist in this database, so there is no homeowner study to attack.');
  end if;

  perform t.reg_unseen(
    'the-sponsoring-government-cannot-read-builder-private-data',
    '2p: nor builder-private information. A government account NEVER gains builder permission',
    'authenticated', a_gov,
    'select claim_code from public.builders limit 1',
    'the sponsoring city can read builder claim codes, the credential that hands over a listing');

  perform t.assert_changes_nothing(
    'the-sponsoring-government-cannot-reach-admin',
    '2p: nor ADUAtlas admin functionality. Amy''s scope grows only enough to operate this and no further into general site administration',
    'authenticated', a_gov,
    'update public.site_content set draft = ''{"tampered": true}''::jsonb',
    'the sponsoring city can edit ADUAtlas course and site content, so buying resident education bought the console');

  perform t.reg_unseen(
    'the-redemption-log-does-not-expose-the-resident-to-the-partner',
    '2p: analytics stay aggregate: link visits, code redemptions, sponsored activations, course starts and completions. A partner never sees an individual homeowner',
    'authenticated', a_gov,
    format('select 1 from public.partner_redemptions where %I = %L',
           coalesce(t.reg_col('public.partner_redemptions',
             array['app_user_id', '^user_id$', 'homeowner_user_id',
                   'redeemed_by_app_user_id', 'redeemed_by', 'sponsored_user_id']), 'app_user_id'),
           t.gov_user_ref('public.partner_redemptions',
             coalesce(t.reg_col('public.partner_redemptions',
               array['app_user_id', '^user_id$', 'homeowner_user_id',
                     'redeemed_by_app_user_id', 'redeemed_by', 'sponsored_user_id']), 'app_user_id'), r1)),
    'the partner can read the redemption log row by row and pick out which residents redeemed. The count is the product; the list is not');

  v_an := t.part_analytics_rel();
  if v_an is null then
    perform t.skip('partner-analytics-expose-no-homeowner-identity',
      '2p: partner analytics default to aggregate and expose no unnecessary homeowner personal information',
      'no relation in public matches a partner analytics surface, so fetchPartnerAnalytics() is either computed in application code from the tables above or named something this probe does not recognise. The row-level leak assertion the-redemption-log-does-not-expose-the-resident-to-the-partner still applies; the aggregate SHAPE of the analytics is not proved here.');
  else
    select count(*)::int, coalesce(string_agg(column_name, ', '), '')
      into v_n, v_cols
      from information_schema.columns
     where table_schema || '.' || table_name = v_an
       and column_name ~* '(email|^user_id$|app_user_id|auth_user|first_name|last_name|full_name|phone|address|^name$)';
    perform t.assert(
      'partner-analytics-expose-no-homeowner-identity',
      '2p: analytics stay AGGREGATE. Link visits, code redemptions, sponsored activations, course starts and course completions, and never an individual homeowner''s private information',
      v_n = 0,
      format('%s identity-shaped column(s) on %s: %s. An aggregate surface that carries a person column is not aggregate, and the partner portal is the one place where "how many residents entered" must never become "which residents entered"',
             v_n, v_an, v_cols));
  end if;

  -- ── THE RULE MOST LIKELY TO BE IMPLEMENTED BACKWARDS ────────────────────
  -- A resident redeems while the partnership is ACTIVE. The partnership is then
  -- switched off. New activations must stop. The resident keeps what they were
  -- given, because 2p says disabling prevents NEW sponsored activations WITHOUT
  -- corrupting existing homeowner accounts — and the plausible implementation, an
  -- entitlement derived from the partnership's current status, satisfies the first
  -- half and takes a homeowner's course away for something their city did.
  if not v_ctl_ok then
    perform t.skip('a-suspended-partnership-grants-no-new-link-activations',
      '2p: disabling a partnership prevents NEW sponsored activations',
      'the group C positive control did not pass; a refusal here would not be evidence.');
    perform t.skip('a-suspended-partnership-grants-no-new-code-activations',
      '2p: disabling a partnership prevents NEW sponsored activations',
      'the group C positive control did not pass; a refusal here would not be evidence.');
    perform t.skip('disabling-a-partnership-does-not-strip-access-already-granted',
      '2p: disabling a partnership prevents NEW sponsored activations WITHOUT corrupting existing homeowner accounts',
      'the group C positive control did not pass, so no access was ever granted and "it was not stripped" would be vacuous.');
    perform t.skip('disabling-a-partnership-does-not-erase-the-attribution',
      '2p: attribution is recorded server side',
      'the group C positive control did not pass.');
  else
   begin
    v_env := t.part_redeem('link', v_link2, r11);
    v_before := t.part_grant_of(r11);

    perform t.part_set_status(v_part2, coalesce(v_suspended, 'suspended'));

    perform t.part_grants_nothing(
      'a-suspended-partnership-grants-no-new-link-activations',
      '2p: disabling a partnership prevents NEW sponsored activations. Partnership links work ONLY for an active partnership',
      'link', v_link2, r12,
      'a link belonging to a SUSPENDED partnership still granted the sponsored entitlement, so switching a partnership off does not stop the $79 grants it was issuing',
      v_ctl_ok);

    perform t.part_grants_nothing(
      'a-suspended-partnership-grants-no-new-code-activations',
      '2p: disabling a partnership prevents NEW sponsored activations. Partnership codes work ONLY for an active partnership',
      'code', v_code2, r13,
      'a code belonging to a SUSPENDED partnership still granted the sponsored entitlement',
      v_ctl_ok);

    perform t.assert(
      'disabling-a-partnership-does-not-strip-access-already-granted',
      '2p: disabling a partnership prevents NEW sponsored activations WITHOUT corrupting existing homeowner accounts. THIS IS THE RULE MOST LIKELY TO BE IMPLEMENTED BACKWARDS',
      v_before = t.part_golden() and t.part_grant_of(r11) = t.part_golden(),
      format('a resident who redeemed while the partnership was ACTIVE held %L before the partnership was suspended and holds %L after. The entitlement is being derived from the partnership''s CURRENT status rather than granted once and recorded, so a city ending its partnership takes the course away from every resident it ever sponsored. Those homeowners did nothing; 2p says disabling stops new activations and does not corrupt existing accounts',
             v_before, t.part_grant_of(r11)));

    perform t.assert(
      'disabling-a-partnership-does-not-erase-the-attribution',
      '2p: attribution is recorded server side, and a suspended partnership''s recorded history is what its analytics were counted from',
      t.part_redemptions_for(r11) = 1,
      format('%s attribution row(s) survive for a resident who redeemed while the partnership was active. Suspending a partnership rewrote or deleted the record of what it had already delivered, which is both a lost audit trail and a way for the analytics to disagree with the entitlements that exist',
             t.part_redemptions_for(r11)));
   exception when others then
    perform t.part_skip('a-suspended-partnership-grants-no-new-link-activations',
      '2p: disabling a partnership prevents NEW sponsored activations',
      format('the suspension scenario raised before it could be attacked: %s (%s).', sqlerrm, sqlstate));
    perform t.part_skip('a-suspended-partnership-grants-no-new-code-activations',
      '2p: disabling a partnership prevents NEW sponsored activations',
      format('the suspension scenario raised before it could be attacked: %s (%s).', sqlerrm, sqlstate));
    perform t.part_skip('disabling-a-partnership-does-not-strip-access-already-granted',
      '2p: disabling a partnership prevents NEW sponsored activations WITHOUT corrupting existing homeowner accounts',
      format('the suspension scenario raised before it could be attacked: %s (%s).', sqlerrm, sqlstate));
    perform t.part_skip('disabling-a-partnership-does-not-erase-the-attribution',
      '2p: attribution is recorded server side',
      format('the suspension scenario raised before it could be attacked: %s (%s).', sqlerrm, sqlstate));
   end;
  end if;

  -- ── THE OTHER AXIS OF THE SAME RULE ─────────────────────────────────────
  -- 2p's list of durable tests says "suspending verification OR partnership
  -- produces the intended access change". The partnership half is above. This is
  -- the IDENTITY half: ADUAtlas withdraws the verification behind an entity that
  -- is already an active partner.
  --
  -- 2p does not say which of two designs is right — the partnership is suspended
  -- with the verification, or withdrawing the verification is refused while a
  -- partnership is live — so the assertion accepts EITHER. What it does not accept
  -- is an active partnership still issuing $79 entitlements on an identity ADUAtlas
  -- has taken back.
  v_susp_identity := coalesce(
    (select x from unnest(coalesce(t.reg_tokens('public.government_entities', 'verification_status'), '{}')) x
      where x ~ 'suspend' limit 1),
    (select x from unnest(coalesce(t.reg_tokens('public.government_entities', 'verification_status'), '{}')) x
      where x ~ 'reject' limit 1),
    'unverified');

  if v_susp_identity ~ 'suspend' then
    perform t.assert(
      'identity-verification-has-a-suspended-state',
      '2p (i): the internal identity states are UNCLAIMED, CLAIM PENDING, IDENTITY VERIFIED, VERIFICATION REJECTED and SUSPENDED',
      true,
      null);
  else
    perform t.skip(
      'identity-verification-has-a-suspended-state',
      '2p (i): the internal identity states are UNCLAIMED, CLAIM PENDING, IDENTITY VERIFIED, VERIFICATION REJECTED and SUSPENDED',
      format('public.government_entities.verification_status accepts %s, which has no SUSPENDED token. 2p (i) names five internal states and suspension is the fifth: a verification ADUAtlas takes back from an entity it once confirmed is a different sentence from one it REJECTED at the claim, and the product cannot currently tell a homeowner which happened. The vocabulary belongs to migrations 0012 and 0014, not to this file, so it is reported rather than worked around. The access change itself IS proved below, using %L as the closest available withdrawal.',
             coalesce(array_to_string(t.reg_tokens('public.government_entities', 'verification_status'), ', '), 'nothing'),
             v_susp_identity));
  end if;

  if not v_ctl_ok then
    perform t.part_skip('withdrawing-identity-verification-leaves-no-active-partnership',
      '2p: suspending VERIFICATION produces the intended access change',
      'the group C positive control did not pass, so nothing was ever granted against a verified identity.');
    perform t.part_skip('withdrawing-identity-verification-stops-new-sponsored-activations',
      '2p: suspending VERIFICATION produces the intended access change',
      'the group C positive control did not pass.');
    perform t.part_skip('withdrawing-identity-verification-does-not-strip-access-already-granted',
      '2p: disabling prevents NEW sponsored activations WITHOUT corrupting existing homeowner accounts',
      'the group C positive control did not pass.');
  else
    begin
      r16 := t.mk_account('homeowner');
      r17 := t.mk_account('homeowner');
      v_e3 := t.gov_entity(v_j2, 'city', 'City of Third Sponsor City');
      perform t.gov_claim(v_e3); perform t.gov_verify(v_e3);
      perform t.gov_grant(v_e3, v_j2);
      v_part3 := t.part_partnership(v_e3, v_active, v_amy);
      v_link3 := t.part_access('public.partner_access_links', v_part3, v_e3, v_amy, v_j2);

      v_env    := t.part_redeem('link', v_link3, r16);
      v_before := t.part_grant_of(r16);

      v_upd := t.x('service_role', null,
        format('update public.government_entities set verification_status = %L where id = %L',
               v_susp_identity, v_e3));
      execute format('select %I::text from public.government_partnerships where %I = %L',
                     v_status, v_ent_col, v_e3) into v_pstatus;

      perform t.assert(
        'withdrawing-identity-verification-leaves-no-active-partnership',
        '2p: a partnership NEVER holds without the required verified identity, and suspending verification produces the intended access change',
        (not (v_upd->>'ok')::boolean) or v_pstatus is distinct from v_active,
        format('ADUAtlas withdrew the identity verification behind an ACTIVE Education Partner and the partnership is still %L. Either the withdrawal must be refused while a partnership is live, or the partnership must stop being active with it; leaving both standing means resident sponsorship continues on an identity ADUAtlas no longer stands behind',
               coalesce(v_pstatus, '<no partnership row>')));

      if (v_upd->>'ok')::boolean then
        perform t.part_grants_nothing(
          'withdrawing-identity-verification-stops-new-sponsored-activations',
          '2p: suspending verification produces the intended access change, and links and codes work ONLY for an active partnership',
          'link', v_link3, r17,
          'a link whose entity has had its identity verification withdrawn still granted the sponsored entitlement, so taking a verification back changes nothing about what the partnership keeps handing out',
          v_ctl_ok);

        perform t.assert(
          'withdrawing-identity-verification-does-not-strip-access-already-granted',
          '2p: stopping a partnership prevents NEW sponsored activations WITHOUT corrupting existing homeowner accounts. The same rule, on the identity axis',
          v_before = t.part_golden() and t.part_grant_of(r16) = t.part_golden(),
          format('a resident who redeemed while everything was in order held %L before ADUAtlas withdrew the CITY''S verification and holds %L after. The homeowner did nothing; their education was taken away by a change to their city''s account',
                 v_before, t.part_grant_of(r16)));
      else
        perform t.part_skip('withdrawing-identity-verification-stops-new-sponsored-activations',
          '2p: suspending verification produces the intended access change',
          format('this implementation REFUSES to withdraw verification while a partnership is live (%s), which is the other legitimate design and is asserted by withdrawing-identity-verification-leaves-no-active-partnership. There is therefore no withdrawn-but-partnered state to redeem against.',
                 coalesce(v_upd->>'error', '<no error>')));
        perform t.part_skip('withdrawing-identity-verification-does-not-strip-access-already-granted',
          '2p: disabling prevents NEW sponsored activations WITHOUT corrupting existing homeowner accounts',
          'the verification could not be withdrawn while the partnership was live, so no access could have been stripped by withdrawing it. The partnership half of this rule is proved by disabling-a-partnership-does-not-strip-access-already-granted.');
      end if;
    exception when others then
      perform t.part_skip('withdrawing-identity-verification-leaves-no-active-partnership',
        '2p: suspending VERIFICATION produces the intended access change',
        format('the fixtures for the identity-withdrawal scenario could not be built: %s (%s).', sqlerrm, sqlstate));
      perform t.part_skip('withdrawing-identity-verification-stops-new-sponsored-activations',
        '2p: suspending VERIFICATION produces the intended access change',
        format('the fixtures for the identity-withdrawal scenario could not be built: %s (%s).', sqlerrm, sqlstate));
      perform t.part_skip('withdrawing-identity-verification-does-not-strip-access-already-granted',
        '2p: disabling prevents NEW sponsored activations WITHOUT corrupting existing homeowner accounts',
        format('the fixtures for the identity-withdrawal scenario could not be built: %s (%s).', sqlerrm, sqlstate));
    end;
  end if;
end
$$;
