-- =============================================================================
-- INVARIANT (decision 2m, migration 0012): a GOVERNMENT PARTICIPATION LAYER, not
-- city accounts. This file is the attack matrix 2m names, one named assertion per
-- attack, plus the properties the design is most likely to lose.
--
-- THE PROPERTY THIS FILE EXISTS FOR:
--
--   AUTHORITY IS EXPLICIT, NEVER GEOGRAPHIC.
--
--   A verified state account gains nothing over a city's record. A verified city
--   account gains nothing over state rules or another city. A county gains
--   nothing over its cities. Permission is a stored grant against specific
--   jurisdiction records, and it is NEVER inferred from containment.
--
--   This is the single property most likely to be got wrong, because containment
--   is one join away in the schema: jurisdictions.parent_id is sitting right
--   there, government_entities.jurisdiction_id is sitting right next to it, and
--   "the state contains the city, so the state may edit the city" is one
--   plausible-looking policy expression. Records may DISPLAY together so a
--   homeowner understands what applies. That is presentation, not permission.
--
--   So the matrix is attacked twice over. Behaviourally, a verified state member
--   is pointed at a city record and must get nowhere. Structurally, the policies
--   and the permission-shaped functions are read out of the catalogue and must
--   not mention the parent column at all, because a containment walk that is
--   currently harmless is a containment walk somebody will later rely on.
--
-- THE OTHER TWO:
--
--   A LOGIN IS NEVER SYNONYMOUS WITH A GOVERNMENT. Three things are modelled
--   separately — the ENTITY (the institution), the USER (an ordinary
--   authenticated person) and the MEMBERSHIP (the join carrying role, status and
--   the verified and revoked dates). Several people represent one entity;
--   employees leave. REVOCATION IS TESTED EXPLICITLY, because a permission that
--   survives the authority behind it is the failure mode that matters, and
--   membership is what makes revocation a real event rather than a deleted login.
--
--   CLAIMING NEVER PRODUCES VERIFICATION, and VERIFICATION MEANS IDENTITY, NOT
--   LEGAL CORRECTNESS. It is also not a publishing right: a verified member
--   SUBMITS, Amy reviews, ADUAtlas publishes.
--
-- ── WHY THERE IS A POSITIVE CONTROL ──────────────────────────────────────────
-- Every assertion in the matrix is negative: the role must NOT get through. A
-- suite of negative assertions passes perfectly against a feature that does not
-- work at all, and would have reported the government layer as secure on a
-- database where no government member can do anything. So the file first proves
-- that a VERIFIED MEMBER OF A VERIFIED ENTITY HOLDING A LIVE GRANT CAN SUBMIT FOR
-- THAT JURISDICTION. Where that control does not pass, the attacks it underwrites
-- are recorded as SKIPS carrying the database's own error, because a denial that
-- cannot be told apart from a dead feature is not evidence.
--
-- Every assertion probes for its object first, so this file reports SKIP rather
-- than a false pass where migration 0012 is not applied. A skip is not a pass.
--
-- The `t.reg_*` probes below are defined IDENTICALLY in 180_regulatory.sql and
-- are duplicated rather than put in helpers/ because every invariant file has to
-- run standalone and in any order; `create or replace` makes the second
-- definition a no-op. The reasoning is written out at the top of 180.
-- =============================================================================
select t.suite('190 government accounts (2m)');
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
-- THE MATRIX
-- =============================================================================
do $$
declare
  v_jp text;            -- the containment column, resolved so the scan names it
  v_n int;
  -- geography
  v_az uuid; v_ca uuid; v_county uuid; v_phx uuid; v_tuc uuid; v_gil uuid; v_flag uuid;
  -- entities
  v_e_az uuid; v_e_ca uuid; v_e_county uuid; v_e_phx uuid; v_e_tuc uuid;
  v_e_gil uuid; v_e_flag uuid;
  -- people
  v_u_az uuid; v_u_ca uuid; v_u_county uuid; v_u_phx uuid; v_u_phx2 uuid;
  v_u_tuc uuid; v_u_gil uuid; v_u_rev uuid; v_u_pend uuid; v_u_view uuid;
  a_az uuid; a_ca uuid; a_county uuid; a_phx uuid; a_phx2 uuid; a_tuc uuid;
  a_gil uuid; a_rev uuid; a_pend uuid; a_view uuid;
  -- memberships
  v_m_phx uuid; v_m_phx2 uuid; v_m_rev uuid; v_m_gil uuid; v_m_pend uuid; v_m_view uuid;
  -- provisions
  v_p_phx uuid; v_p_tuc uuid; v_p_az uuid; v_p_ca uuid;
  -- other people
  v_home uuid; v_builder uuid; v_admin uuid;
  -- the positive control
  v_pc jsonb; v_pc_ok boolean := false;
begin
  -- ── the gate ──────────────────────────────────────────────────────────────
  if not t.has_relation('public.government_entities')
     or not t.has_relation('public.government_memberships')
     or not t.has_relation('public.government_users')
     or not t.has_relation('public.regulatory_provisions') then
    perform t.skip('three-things-modelled-separately',
      '2m: GOVERNMENT ENTITY, GOVERNMENT USER and GOVERNMENT MEMBERSHIP are three things, because a login must never be synonymous with a city government',
      'public.government_entities, public.government_users or public.government_memberships does not exist. Migration 0012 is not applied to this database, so the government participation layer has no schema behind it.');
    perform t.skip('state-cannot-edit-another-state',
      '2m: authority is explicit, never geographic',
      'migration 0012 is not applied; the government matrix cannot be attacked.');
    perform t.skip('state-cannot-edit-a-city',
      '2m: a verified state account gains nothing over a city''s record',
      'migration 0012 is not applied.');
    perform t.skip('city-cannot-edit-the-state',
      '2m: a verified city account gains nothing over state rules',
      'migration 0012 is not applied.');
    perform t.skip('city-cannot-edit-another-city',
      '2m: a verified city account gains nothing over another city',
      'migration 0012 is not applied.');
    perform t.skip('county-cannot-edit-its-city',
      '2m: a county gains nothing over its cities',
      'migration 0012 is not applied.');
    perform t.skip('authority-is-not-derived-from-the-parent-chain',
      '2m: permission is a stored grant against specific jurisdiction records, never inferred from containment',
      'migration 0012 is not applied.');
    perform t.skip('government-cannot-read-homeowner-private-data',
      '2m: a government user never reaches homeowner-private data',
      'migration 0012 is not applied.');
    perform t.skip('government-cannot-read-builder-private-data',
      '2m: a government user never reaches builder-private data',
      'migration 0012 is not applied.');
    perform t.skip('government-cannot-reach-admin',
      '2m: a government user never reaches course administration or general ADUAtlas administration',
      'migration 0012 is not applied.');
    perform t.skip('claimed-but-unverified-cannot-submit',
      '2m: claiming never produces verification, and an unverified member reaches no verified-only capability',
      'migration 0012 is not applied.');
    perform t.skip('revoked-member-cannot-reach-a-former-entity',
      '2m: a permission that survives the authority behind it is the failure mode that matters',
      'migration 0012 is not applied.');
    perform t.skip('member-cannot-change-their-own-role',
      '2m: the membership carries role and status, and the member is not the one who sets them',
      'migration 0012 is not applied.');
    perform t.skip('verified-member-cannot-publish-directly',
      '2m: a member SUBMITS, Amy reviews, ADUAtlas publishes. Verification is not a publishing right',
      'migration 0012 is not applied.');
    perform t.skip('claiming-never-produces-verification',
      '2m: CLAIMED and VERIFIED are two states and claiming never produces the second',
      'migration 0012 is not applied.');
    perform t.skip('government-account-is-never-billed',
      '2m: government accounts cost nothing and there is no government billing',
      'migration 0012 is not applied.');
    return;
  end if;

  -- ── the six things 2m models separately ──────────────────────────────────
  perform t.assert(
    'three-things-modelled-separately',
    '2m: a GOVERNMENT ENTITY is the institution, a GOVERNMENT USER is an ordinary person, and a GOVERNMENT MEMBERSHIP is the join carrying role, status and the verified and revoked dates',
    t.gov_member_user_col() is not null
      and t.reg_col('public.government_memberships', array['entity_id', '^entity$']) is not null
      and t.reg_col('public.government_memberships', array['membership_role', '^role$']) is not null
      and t.reg_col('public.government_memberships', array['membership_status', '^status$']) is not null
      and t.reg_col('public.government_memberships', array['verified_at', 'verified_on']) is not null
      and t.reg_col('public.government_memberships', array['revoked_at', 'revoked_on']) is not null,
    'public.government_memberships is not the join 2m describes. Any missing piece collapses a person into an institution: several people cannot represent one entity, an employee cannot leave, and there is no read-only role next to a submitting one.');

  perform t.assert(
    'entity-carries-its-own-identity',
    '2m: GOVERNMENT ENTITY holds name, type, jurisdiction, official website, OFFICIAL GOVERNMENT DOMAINS, verification status and claimed status',
    t.reg_col('public.government_entities', array['jurisdiction_id']) is not null
      and t.reg_col('public.government_entities', array['official_website', '^website$']) is not null
      and t.reg_col('public.government_entities', array['official_domains', 'government_domains']) is not null
      and t.reg_col('public.government_entities', array['verification_status', '^verification$']) is not null
      and t.reg_col('public.government_entities', array['claimed_at', 'claimed_status', '^claimed$']) is not null,
    'public.government_entities is missing its jurisdiction, official website, official government domains, verification status or claimed state. The domains are how a claim is checked against the institution rather than against whoever filled in the form');

  perform t.assert(
    'claimed-and-verified-are-two-columns',
    '2m: UNCLAIMED, CLAIMED and VERIFIED are three states, and claiming never produces verification',
    t.reg_col('public.government_entities', array['claimed_at', 'claimed_status', '^claimed$'])
      is distinct from t.reg_col('public.government_entities', array['verification_status', '^verification$']),
    'the claimed state and the verification state resolve to the same column. One column cannot hold both, so claiming an entity would necessarily verify it, and 2m''s middle state — a representative has claimed the entity but their authority is NOT yet confirmed — cannot exist');

  -- ── authority is never derived from containment: the structural half ─────
  v_jp := t.reg_col('public.jurisdictions', array['parent_jurisdiction_id', 'parent_id', '^parent$']);
  if v_jp is null then
    perform t.skip('no-policy-walks-the-parent-chain',
      '2m: permission is never inferred from containment',
      'no parent column resolved on public.jurisdictions, so the containment chain could not be located to check the policies against it.');
  else
    select count(*) into v_n
      from pg_policies
     where schemaname = 'public'
       and tablename ~ '^(government_|regulatory_)'
       and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ v_jp;
    perform t.assert(
      'no-policy-walks-the-parent-chain',
      '2m: permission is a stored grant against specific jurisdiction records. Delegated authority, if ever wanted, is an explicit relationship, NEVER inferred from containment',
      v_n = 0,
      format('%s row level security policy expression(s) on the government and regulatory tables reference jurisdictions.%s. Containment is one join away in this schema and a policy that walks it hands every city''s record to its county and its state. Records may DISPLAY together; that is presentation, not permission.',
             v_n, v_jp));

    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname ~ '(^can_|^may_|^is_|^has_|_may_|_can_|authori|permit_|_grant)'
       and p.prosrc ~ ('\m' || v_jp || '\M');
    perform t.assert(
      'no-authority-helper-walks-the-parent-chain',
      '2m: delegated authority is an explicit relationship, never inferred from containment',
      v_n = 0,
      format('%s permission-shaped function(s) in schema public read jurisdictions.%s. Moving the containment walk out of the policy and into a helper the policy calls is the same bug one level down.',
             v_n, v_jp));
  end if;

  perform t.assert(
    'authority-is-its-own-record',
    '2m: permission is a STORED GRANT against specific jurisdiction records',
    t.has_relation('public.government_jurisdiction_grants'),
    'there is no table holding a grant of a government entity against a jurisdiction record. Without one, authority has to be computed from something, and the only things available to compute it from are the containment chain and the entity''s own seat — which is precisely what 2m forbids');

  -- ── the geography, the entities, the people and the grants ──────────────
  v_az     := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_ca     := t.gov_jur('state', null, 'California', 'CA');
  v_county := t.gov_jur('county', v_az, 'Yavapai County', 'AZ');
  v_phx    := t.gov_jur('municipality', v_county, 'Prescott');
  v_tuc    := t.gov_jur('municipality', v_county, 'Sedona');
  v_gil    := t.gov_jur('municipality', v_county, 'Chino Valley');
  v_flag   := t.gov_jur('municipality', v_county, 'Clarkdale');

  v_e_az     := t.gov_entity(v_az,     'state',  'Arizona Department of Housing');
  v_e_ca     := t.gov_entity(v_ca,     'state',  'California HCD');
  v_e_county := t.gov_entity(v_county, 'county', 'Yavapai County Development Services');
  v_e_phx    := t.gov_entity(v_phx,    'city',   'Prescott Community Development');
  v_e_tuc    := t.gov_entity(v_tuc,    'city',   'Sedona Community Development');
  v_e_gil    := t.gov_entity(v_gil,    'city',   'Chino Valley Planning');
  v_e_flag   := t.gov_entity(v_flag,   'city',   'Clarkdale Planning');

  v_u_az := t.mk_account('homeowner');     v_u_ca := t.mk_account('homeowner');
  v_u_county := t.mk_account('homeowner'); v_u_phx := t.mk_account('homeowner');
  v_u_phx2 := t.mk_account('homeowner');   v_u_tuc := t.mk_account('homeowner');
  v_u_gil := t.mk_account('homeowner');    v_u_rev := t.mk_account('homeowner');
  v_u_pend := t.mk_account('homeowner');   v_u_view := t.mk_account('homeowner');
  a_az := t.authid(v_u_az);         a_ca := t.authid(v_u_ca);
  a_county := t.authid(v_u_county); a_phx := t.authid(v_u_phx);
  a_phx2 := t.authid(v_u_phx2);     a_tuc := t.authid(v_u_tuc);
  a_gil := t.authid(v_u_gil);       a_rev := t.authid(v_u_rev);
  a_pend := t.authid(v_u_pend);     a_view := t.authid(v_u_view);

  -- CLAIMED, then VERIFIED, then GRANTED: three separate acts, in that order.
  perform t.gov_claim(v_e_az);     perform t.gov_verify(v_e_az);
  perform t.gov_claim(v_e_ca);     perform t.gov_verify(v_e_ca);
  perform t.gov_claim(v_e_county); perform t.gov_verify(v_e_county);
  perform t.gov_claim(v_e_phx);    perform t.gov_verify(v_e_phx);
  perform t.gov_claim(v_e_tuc);    perform t.gov_verify(v_e_tuc);
  perform t.gov_claim(v_e_gil);    -- CLAIMED ONLY: authority never confirmed
  --                                  v_e_flag stays UNCLAIMED

  -- Each verified entity is granted ITS OWN SEAT and nothing else. No entity is
  -- ever granted a jurisdiction above or below it: that is the whole point.
  perform t.gov_grant(v_e_az,     v_az);
  perform t.gov_grant(v_e_ca,     v_ca);
  perform t.gov_grant(v_e_county, v_county);
  perform t.gov_grant(v_e_phx,    v_phx);
  perform t.gov_grant(v_e_tuc,    v_tuc);

  perform t.gov_member(v_e_az, v_u_az);
  perform t.gov_member(v_e_ca, v_u_ca);
  perform t.gov_member(v_e_county, v_u_county);
  v_m_phx  := t.gov_member(v_e_phx, v_u_phx);
  v_m_phx2 := t.gov_member(v_e_phx, v_u_phx2);
  v_m_rev  := t.gov_member(v_e_phx, v_u_rev);
  v_m_pend := t.gov_member(v_e_phx, v_u_pend, false);          -- claimed, NOT verified
  v_m_view := t.gov_member(v_e_phx, v_u_view, true, 'viewer'); -- read-only by role
  perform t.gov_member(v_e_tuc, v_u_tuc);
  v_m_gil  := t.gov_member(v_e_gil, v_u_gil);                  -- verified person, UNVERIFIED entity
  perform t.gov_revoke(v_m_rev);

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_phx, 'max_size', 'verified_from_source', '1000 sq ft',
          'https://www.example.gov/ordinance', 'City ADU Ordinance', 'city_code',
          '2026-09-01', 'published', 'source_checked')
  returning id into v_p_phx;

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_tuc, 'max_size', 'verified_from_source', '1200 sq ft',
          'https://www.example.gov/ordinance', 'City ADU Ordinance', 'city_code',
          '2026-09-01', 'published', 'source_checked')
  returning id into v_p_tuc;

  -- v_az and v_ca are the REAL seeded state rows (t.gov_jur reuses them), which
  -- on staging may already carry a real published max_size rule. These two rules
  -- exist only as targets that other governments must fail to rewrite (below),
  -- so their topic is incidental: t.free_topic keeps max_size whenever it is
  -- free, which it always is in the default run.
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_az, t.free_topic(v_az, 'max_size'), 'verified_from_source', '1000 sq ft statewide floor',
          'https://www.azleg.gov/ars', 'Arizona Revised Statutes 9-461.18', 'state_statute',
          '2026-09-01', 'published', 'source_checked')
  returning id into v_p_az;

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_ca, t.free_topic(v_ca, 'max_size'), 'verified_from_source', '850 sq ft statewide floor',
          'https://leginfo.legislature.ca.gov', 'California Government Code 66323', 'state_statute',
          '2026-09-01', 'published', 'source_checked')
  returning id into v_p_ca;

  -- ── claiming never produces verification ────────────────────────────────
  perform t.assert_scalar(
    'claiming-never-produces-verification',
    '2m: CLAIMED means a representative has claimed the entity but their authority is NOT yet verified. Claiming never produces verification',
    'service_role', null,
    format('select verification_status from public.government_entities where id = %L', v_e_gil),
    'unverified',
    'claiming an entity also verified it. ADUAtlas would show "Verified Government Account" beside a city name on the word of whoever happened to submit the claim form, which is the one thing that badge must never mean');

  perform t.assert_scalar(
    'an-unclaimed-entity-implies-no-participation',
    '2m: UNCLAIMED means ADUAtlas created the record from authoritative public sources and NOTHING implies the government takes part',
    'anon', null,
    format('select entity_state from public.government_entities_public where id = %L', v_e_flag),
    'unclaimed',
    'a seeded entity ADUAtlas compiled from a city''s own public website does not read as unclaimed, so the product implies a city takes part in ADUAtlas when it has never heard of it');

  perform t.assert_scalar(
    'a-claimed-entity-does-not-read-as-verified',
    '2m: the three states are never blurred and no surface invents a fourth',
    'anon', null,
    format('select entity_state from public.government_entities_public where id = %L', v_e_gil),
    'claimed',
    'a claimed but unverified entity reads as something other than claimed on the public surface');

  perform t.assert_count(
    'an-unclaimed-entity-has-no-members',
    '2m: neither the invitation nor the page implies partnership before the entity has claimed AND been verified',
    'service_role', null,
    format('select 1 from public.government_memberships where entity_id = %L', v_e_flag),
    0,
    'an entity nobody has claimed already has members');

  perform t.assert_changes_nothing(
    'member-cannot-verify-its-own-entity',
    '2m: VERIFIED is where ADUAtlas has confirmed the account is authorised to represent that entity',
    'authenticated', a_gil,
    format('update public.government_entities set verification_status = ''verified'', verified_at = now() where id = %L', v_e_gil),
    'a claimed member can mark their own entity verified, so verification means nothing beyond "somebody asserted it about themselves"');

  perform t.reg_refused(
    'authority-cannot-be-granted-to-an-unverified-entity',
    '2m: claiming never produces verification, so a claimed-but-unverified entity can hold no authority',
    format($q$insert into public.government_jurisdiction_grants (entity_id, jurisdiction_id, grant_basis)
              values (%L, %L, 'because they claimed it')$q$, v_e_gil, v_gil),
    'a jurisdiction grant can be attached to an entity that has never been verified, which makes claiming equal verification by the back door');

  -- ── THE POSITIVE CONTROL ────────────────────────────────────────────────
  if not t.has_relation('public.regulatory_submissions') then
    perform t.skip('verified-member-can-submit-for-its-own-jurisdiction',
      '2m: a verified government member SUBMITS; Amy reviews; ADUAtlas publishes',
      'public.regulatory_submissions does not exist; migration 0012 is not applied, so there is no submission path to control against.');
  else
    v_pc := t.x('authenticated', a_phx, t.gov_submit_sql(v_phx, v_e_phx, v_u_phx, 'height_limit'));
    v_pc_ok := (v_pc->>'ok')::boolean;
    perform t.assert(
      'verified-member-can-submit-for-its-own-jurisdiction',
      '2m: a verified member of a verified entity holding a live grant SUBMITS for that jurisdiction. This is the whole point of the participation layer',
      v_pc_ok,
      format('a verified member of a verified city entity that holds a live grant on that city cannot record a submission: %s. Until this passes, every "cannot" below is indistinguishable from a feature that does not work, so those assertions are reported as skips rather than as green security.',
             coalesce(v_pc->>'error', '<no error>')));
  end if;

  -- ── THE MATRIX, provision side: authority is explicit, never geographic ──
  -- A government account never writes a published provision at all: it submits.
  -- These five are the five pairs 2m names, attacked directly at the record.
  perform t.assert_changes_nothing(
    'state-cannot-edit-another-state',
    '2m: authority is explicit, never geographic',
    'authenticated', a_az,
    format('update public.regulatory_provisions set value_text = ''rewritten by Arizona'' where id = %L', v_p_ca),
    'a verified Arizona state account can rewrite California''s statewide rule');

  perform t.assert_changes_nothing(
    'state-cannot-edit-a-city',
    '2m: a verified state account gains nothing over a city''s record',
    'authenticated', a_az,
    format('update public.regulatory_provisions set value_text = ''rewritten by the state'' where id = %L', v_p_phx),
    'a verified state account can rewrite a city''s record. States set requirements and local jurisdictions adopt their own compliant ordinances; a state disagreeing with a city is represented as two records, never by the state overwriting one');

  perform t.assert_changes_nothing(
    'city-cannot-edit-the-state',
    '2m: a verified city account gains nothing over state rules',
    'authenticated', a_phx,
    format('update public.regulatory_provisions set value_text = ''rewritten by the city'' where id = %L', v_p_az),
    'a verified city account can rewrite the state statute it is supposed to comply with');

  perform t.assert_changes_nothing(
    'city-cannot-edit-another-city',
    '2m: a verified city account gains nothing over another city',
    'authenticated', a_phx,
    format('update public.regulatory_provisions set value_text = ''rewritten by a neighbour'' where id = %L', v_p_tuc),
    'a verified city account can rewrite a neighbouring city''s record');

  perform t.assert_changes_nothing(
    'county-cannot-edit-its-city',
    '2m: a county gains nothing over its cities',
    'authenticated', a_county,
    format('update public.regulatory_provisions set value_text = ''rewritten by the county'' where id = %L', v_p_phx),
    'a verified county account can rewrite the record of a city inside it. This is containment being read as permission, which is the single most likely design error in this feature');

  perform t.assert_changes_nothing(
    'a-member-cannot-edit-its-own-published-record',
    '2m: verification is not a publishing right. A member SUBMITS; Amy reviews; ADUAtlas publishes',
    'authenticated', a_phx,
    format('update public.regulatory_provisions set value_text = ''edited in place'' where id = %L', v_p_phx),
    'a verified member can edit the published record for its own jurisdiction directly, which skips review entirely and leaves no submission for Amy to look at');

  perform t.assert_changes_nothing(
    'verified-member-cannot-publish-directly',
    '2m: verification is not a publishing right',
    'authenticated', a_phx,
    format('insert into public.regulatory_provisions (jurisdiction_id, topic_key, review_status) values (%L, ''impact_fees'', ''published'')', v_phx),
    'a verified government member can publish straight into the ADUAtlas regulatory database with no review. ADUAtlas would be restating a government''s claim as its own published rule without ever having looked at it');

  perform t.assert_changes_nothing(
    'verified-member-cannot-retract-what-aduatlas-published',
    '2m: ADUAtlas publishes, and what ADUAtlas publishes is ADUAtlas''s to withdraw',
    'authenticated', a_phx,
    format('update public.regulatory_provisions set review_status = ''retracted'', retracted_at = now() where id = %L', v_p_phx),
    'a government member can retract an ADUAtlas published rule about their own city, which is a way of deleting a rule they dislike without submitting a correction anybody reviews');

  perform t.assert_changes_nothing(
    'verified-member-cannot-write-a-resource',
    '2m: a government resource is first class alongside rules, and it is published the same way',
    'authenticated', a_phx,
    format('insert into public.government_resources (jurisdiction_id, resource_type) values (%L, ''adu_handbook'')', v_phx),
    'a verified government member can write an official resource link straight onto a published page with no review');

  -- ── THE MATRIX, submission side ─────────────────────────────────────────
  if not v_pc_ok then
    perform t.skip('authority-is-not-derived-from-the-parent-chain',
      '2m: permission is a stored grant against specific jurisdiction records, never inferred from containment',
      'the positive control did not pass, so a refused submission cannot be told apart from a submission path that works for nobody. See verified-member-can-submit-for-its-own-jurisdiction.');
    perform t.skip('city-cannot-submit-for-another-city',
      '2m: a verified city account gains nothing over another city',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('county-cannot-submit-for-its-city',
      '2m: a county gains nothing over its cities',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('claimed-but-unverified-cannot-submit',
      '2m: a claimed but unverified member reaches no verified-only capability',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('revoked-member-cannot-reach-a-former-entity',
      '2m: a permission that survives the authority behind it is the failure mode that matters',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('several-people-may-represent-one-entity',
      '2m: one entity may have several people',
      'the positive control did not pass; the second member''s success cannot be separated from the first member''s failure.');
  else
    perform t.assert_changes_nothing(
      'authority-is-not-derived-from-the-parent-chain',
      '2m: a verified STATE account gains nothing over a CITY inside it. Permission is a stored grant against specific jurisdiction records, never inferred from containment',
      'authenticated', a_az,
      t.gov_submit_sql(v_phx, v_e_az, v_u_az),
      'the verified state entity can submit against a city jurisdiction because the city sits under the state in the geography. The hierarchy is geography and display, NEVER permission, and this is the assertion that says so');

    perform t.assert_changes_nothing(
      'county-cannot-submit-for-its-city',
      '2m: a county gains nothing over its cities',
      'authenticated', a_county,
      t.gov_submit_sql(v_phx, v_e_county, v_u_county),
      'the verified county entity can submit against a city inside it');

    perform t.assert_changes_nothing(
      'city-cannot-submit-for-another-city',
      '2m: a verified city account gains nothing over another city',
      'authenticated', a_phx,
      t.gov_submit_sql(v_tuc, v_e_phx, v_u_phx),
      'a verified city member can submit against a neighbouring city''s jurisdiction');

    perform t.assert_changes_nothing(
      'city-cannot-submit-for-the-state',
      '2m: a verified city account gains nothing over state rules',
      'authenticated', a_phx,
      t.gov_submit_sql(v_az, v_e_phx, v_u_phx),
      'a verified city member can submit against the state''s own jurisdiction record');

    perform t.assert_changes_nothing(
      'a-member-cannot-borrow-another-entitys-grant',
      '2m: the authority check is against THIS entity and THIS jurisdiction, so a person who represents two entities cannot borrow one entity''s grant to submit as the other',
      'authenticated', a_phx,
      t.gov_submit_sql(v_phx, v_e_az, v_u_phx),
      'a verified Prescott member can file a submission in the state agency''s name. The entity a submission is made on behalf of would be a free-text choice');

    perform t.assert_changes_nothing(
      'claimed-but-unverified-cannot-submit',
      '2m: CLAIMED is not VERIFIED, and a claimed but unverified member reaches no verified-only capability',
      'authenticated', a_pend,
      t.gov_submit_sql(v_phx, v_e_phx, v_u_pend),
      'a member whose authority to represent the entity has NOT been confirmed can submit regulatory content in that government''s name, from an entity that IS verified and DOES hold a grant. Claiming is a form submission; verification is the step where ADUAtlas checks it');

    perform t.assert_changes_nothing(
      'an-unverified-entity-holds-no-authority',
      '2m: the entity itself must be verified; claiming never produces verification',
      'authenticated', a_gil,
      t.gov_submit_sql(v_gil, v_e_gil, v_u_gil),
      'a verified MEMBER of an UNVERIFIED entity can submit. Both halves have to hold: ADUAtlas must have confirmed the institution and the person');

    perform t.assert_changes_nothing(
      'a-read-only-member-cannot-submit',
      '2m: one person may need read-only access while another submits',
      'authenticated', a_view,
      t.gov_submit_sql(v_phx, v_e_phx, v_u_view, 'setback_rear'),
      'a viewer-role member of a verified, granted entity can submit. The read-only role would be decoration');

    perform t.assert_changes_nothing(
      'revoked-member-cannot-reach-a-former-entity',
      '2m: revocation is tested explicitly, because a permission that survives the authority behind it is the failure mode that matters',
      'authenticated', a_rev,
      t.gov_submit_sql(v_phx, v_e_phx, v_u_rev, 'parking_required'),
      'a REVOKED member can still submit for the entity they used to represent. The employee has left the planning department and is still speaking for the city');

    perform t.assert(
      'several-people-may-represent-one-entity',
      '2m: one entity may have several people; a login is never synonymous with a government',
      (t.x('authenticated', a_phx2, t.gov_submit_sql(v_phx, v_e_phx, v_u_phx2, 'min_lot_size'))->>'ok')::boolean,
      'a second verified member of the same entity cannot submit. Employees leave and departments change, so one entity must support several people rather than one shared login');

    perform t.assert_changes_nothing(
      'government-cannot-review-its-own-submission',
      '2f: reviewing and publishing government submissions is Amy''s. 2m: ADUAtlas publishes',
      'authenticated', a_phx,
      'update public.regulatory_submissions set status = ''accepted'', reviewed_at = now()',
      'a government member can accept their own submission, which removes the review step 2m puts between a government''s claim and an ADUAtlas published rule');

    perform t.reg_unseen(
      'a-government-sees-only-its-own-entitys-submissions',
      '2m: a government user never reaches another government''s management area',
      'authenticated', a_tuc,
      format('select 1 from public.regulatory_submissions where entity_id = %L', v_e_phx),
      'a verified member of one city can read another city''s submissions to ADUAtlas, including what that city asked to have corrected');
  end if;

  -- ── revocation damages neither the entity nor the other members ─────────
  perform t.assert_count(
    'the-entity-survives-a-revocation',
    '2m: employees leave and departments change; membership makes revocation a real event rather than a deleted login',
    'service_role', null,
    format('select 1 from public.government_entities where id = %L and verification_status = ''verified''', v_e_phx),
    1,
    'revoking a member removed the entity or un-verified it. The institution outlives the people who represent it');

  perform t.assert_count(
    'a-revoked-membership-is-retained-not-deleted',
    '2m: the membership carries verified AND revoked dates, so the history of who represented an entity survives',
    'service_role', null,
    format('select 1 from public.government_memberships where id = %L and revoked_at is not null and verified_at is not null', v_m_rev),
    1,
    'a revoked membership was deleted rather than marked revoked, so there is no record that this person ever spoke for the city or when that ended');

  perform t.assert_count(
    'revoking-one-member-does-not-revoke-another',
    '2m: several people may represent one entity',
    'service_role', null,
    format('select 1 from public.government_memberships where id = %L and revoked_at is null and status = ''verified''', v_m_phx),
    1,
    'revoking one member revoked another member of the same entity');

  -- ── membership and role changes are not self-serve ──────────────────────
  perform t.assert_changes_nothing(
    'member-cannot-change-their-own-role',
    '2m: the membership carries the role — one person may need read-only access while another submits — and the member is not the one who decides which',
    'authenticated', a_view,
    format('update public.government_memberships set membership_role = ''administrator'' where id = %L', v_m_view),
    'a read-only government member can promote themselves to administrator inside their own entity, so the role is a suggestion');

  perform t.assert_changes_nothing(
    'member-cannot-self-verify',
    '2m: VERIFIED means ADUAtlas confirmed the account is authorised to represent that entity',
    'authenticated', a_pend,
    format('update public.government_memberships set status = ''verified'', verified_at = now() where id = %L', v_m_pend),
    'a pending member can stamp their own membership verified, which makes the claim form the verification step');

  perform t.assert_changes_nothing(
    'member-cannot-join-another-entity',
    '2m: a government user never reaches another government''s management area',
    'authenticated', a_phx,
    format($q$insert into public.government_memberships (entity_id, %I, status, verified_at)
              values (%L, %L, 'verified', now())$q$,
           t.gov_member_user_col(), v_e_tuc,
           t.gov_user_ref('public.government_memberships', t.gov_member_user_col(), v_u_phx)),
    'a verified member of one city can add themselves to another city''s entity as a verified member, which makes the whole matrix decorative: any member can simply join whatever government they want to speak for');

  perform t.assert_changes_nothing(
    'member-cannot-revoke-another-member',
    '2m: a government user never reaches another government''s management area',
    'authenticated', a_tuc,
    format('update public.government_memberships set status = ''revoked'', revoked_at = now() where id = %L', v_m_phx),
    'a member of one entity can revoke a member of another');

  perform t.assert_changes_nothing(
    'member-cannot-widen-its-own-authority',
    '2m: permission is a stored grant against specific jurisdiction records. A government account can never widen its own scope',
    'authenticated', a_phx,
    format($q$insert into public.government_jurisdiction_grants (entity_id, jurisdiction_id, grant_basis)
              values (%L, %L, 'we would also like the county')$q$, v_e_phx, v_county),
    'a verified government member can grant their own entity authority over another jurisdiction record, which turns the explicit-grant model into a self-service one');

  perform t.reg_unseen(
    'a-government-cannot-read-another-governments-grants',
    '2m: a government user never reaches another government''s management area',
    'authenticated', a_tuc,
    format('select 1 from public.government_jurisdiction_grants where entity_id = %L', v_e_phx),
    'a member of one entity can read which jurisdictions another entity has been granted');

  -- ── government to homeowner-private data ────────────────────────────────
  v_home := t.mk_paid_homeowner('concierge');
  insert into public.studies (user_id, intake, status)
  values (v_home, '{"address": "1 Government Probe Way"}'::jsonb, 'submitted');

  perform t.reg_unseen(
    'government-cannot-read-homeowner-private-data',
    '2m: a government user never reaches homeowner-private data',
    'authenticated', a_phx,
    format('select email from public.users where id = %L', v_home),
    'a government account can read another account''s email address. A city planning department could enumerate ADUAtlas customers in its own city');

  perform t.reg_unseen(
    'government-cannot-read-a-property-order',
    '2m: a government user never reaches homeowner-private data',
    'authenticated', a_phx,
    format('select 1 from public.studies where user_id = %L', v_home),
    'a government account can read a homeowner''s property order and intake, which carries their address');

  perform t.reg_unseen(
    'government-cannot-read-leads',
    '2m: a government user never reaches homeowner-private data',
    'authenticated', a_phx,
    'select 1 from public.leads',
    'a government account can read top-of-funnel lead PII');

  if t.has_relation('public.builder_conversations') then
    perform t.reg_unseen(
      'government-cannot-read-conversations',
      '2h, 2m: a conversation is two named people''s private correspondence',
      'authenticated', a_phx,
      'select 1 from public.builder_conversations',
      'a government account can read homeowner-to-builder conversations');
  end if;

  -- ── government to builder-private data ─────────────────────────────────
  v_builder := t.mk_claimed_builder();

  perform t.reg_unseen(
    'government-cannot-read-builder-private-data',
    '2m: a government user never reaches builder-private data',
    'authenticated', a_phx,
    'select claim_code from public.builders limit 1',
    'a government account can read builder claim codes, which are the credential that hands over a listing');

  perform t.reg_unseen(
    'government-cannot-read-builder-analytics',
    '2m: a government user never reaches builder-private data',
    'authenticated', a_phx,
    'select 1 from public.referral_events',
    'a government account can read a company''s referral events, which is ADUAtlas''s own marketplace performance data about a private business');

  perform t.assert_changes_nothing(
    'government-cannot-edit-a-builder-record',
    '2f: builder information is Amy''s, not a government''s',
    'authenticated', a_phx,
    format('update public.builders set name = ''Renamed by a city'' where id = %L', v_builder),
    'a government account can edit builder records');

  -- ── government to admin ────────────────────────────────────────────────
  perform t.assert_changes_nothing(
    'government-cannot-reach-admin',
    '2f, 2m: a government user never reaches course administration or general ADUAtlas administration',
    'authenticated', a_phx,
    'update public.site_content set draft = ''{"tampered": true}''::jsonb',
    'a government account can edit ADUAtlas site and course content');

  perform t.assert_changes_nothing(
    'government-cannot-promote-itself-to-admin',
    '2f: Amy''s admin scope is five things and a government member is not in any of them',
    'authenticated', a_phx,
    'update public.users set role = ''admin'' where auth_user_id = auth.uid()',
    'a government account can promote itself to ADUAtlas admin');

  if t.has_relation('public.regulatory_audit_log') then
    perform t.reg_unseen(
      'government-cannot-read-the-audit-log',
      '2m: who changed what is ADUAtlas''s record, not a participant''s',
      'authenticated', a_phx,
      'select 1 from public.regulatory_audit_log',
      'a government account can read the regulatory audit log, including every other government''s activity');
  end if;

  -- ── government accounts are free ───────────────────────────────────────
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public'
     and table_name like 'government%'
     and column_name ~* '(stripe|price|amount|invoice|billed|billing|subscription|charge|trial|_fee)';
  perform t.assert(
    'government-account-is-never-billed',
    '2m: government accounts cost nothing in Phase 1 and there is NO government billing',
    v_n = 0,
    format('%s billing-shaped column(s) exist on the government tables. A billing column is a billing plan: it gets filled in, and the free government profile ADUAtlas uses to approach a city stops being free', v_n));

  perform t.assert_scalar(
    'a-government-member-holds-no-paid-entitlement',
    '2m: government accounts are free, and a membership is not a purchase',
    'service_role', null,
    format('select (paid_at is null and paid_tier is null and stripe_customer_id is null)::text from public.users where id = %L', v_u_phx),
    'true',
    'creating a government membership stamped billing or entitlement columns on the person''s own account');

  perform t.assert_scalar(
    'a-government-member-is-an-ordinary-account',
    '2m: a GOVERNMENT USER is an ordinary authenticated user. A person, not an institution, and no users.role value is added',
    'service_role', null,
    format('select role from public.users where id = %L', v_u_phx),
    'homeowner',
    'representing a government changed the person''s ADUAtlas account role. A login must never be synonymous with a government: every capability comes from a verified membership plus an explicit grant, and nothing from the account itself');

  -- ── the government badge is not the builder badge ──────────────────────
  perform t.assert_count(
    'government-verification-is-not-the-builder-badge',
    '2e, 2m: "Verified Government Account" is shown with the entity name beneath it and is NEVER the builder badge "Verified on ADUAtlas"',
    'service_role', null,
    $q$select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'builders'
          and column_name ~* 'government'$q$,
    0,
    'public.builders carries a government column, so the two verifications share a record and one badge can be rendered for the other. They mean different things: one says a company completed the ADUAtlas verification step, the other says a person is authorised to represent a city');

  perform t.assert_scalar(
    'verifying-a-government-does-not-verify-a-builder',
    '2e: claiming a listing does not make it verified, and neither does anything happening in the government layer',
    'service_role', null,
    format('select (verified_at is null)::text from public.builders where id = %L', v_builder),
    'true',
    'verifying government entities also set a builder''s Verified on ADUAtlas state');

  -- ── an official source is not participation ────────────────────────────
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_flag, 'max_size', 'verified_from_source', '800 sq ft',
          'https://www.example.gov/clarkdale/adu', 'Clarkdale Zoning Code', 'city_code',
          '2026-09-01', 'published', 'source_checked');

  perform t.assert_count(
    'official-website-source-is-not-participation',
    '2m: using a government''s public website as a source does NOT mean that government participates in ADUAtlas. "Source: Official government website" and "Provided by verified government account" are distinct statements and must never be collapsed into one',
    'anon', null,
    format($q$select 1 from public.regulatory_provisions_public
              where jurisdiction_id = %L
                and source_is_official_government
                and provided_by_entity_name is null$q$, v_flag),
    1,
    'a rule ADUAtlas read off an unclaimed city''s own website either loses the fact that its source was official, or reads as PROVIDED BY that city. The regulatory database stands on its own and is useful with no government account attached, which is the point; implying participation before a claim and a verification misrepresents the city');

  perform t.reg_refused(
    'an-unverified-entity-cannot-be-named-as-the-supplier',
    '2m: "Provided by City of Phoenix" must be true when it is said',
    format($q$insert into public.regulatory_provisions
              (jurisdiction_id, topic_key, supplied_by, supplied_by_entity_id)
              values (%L, 'impact_fees', 'government_account', %L)$q$, v_gil, v_e_gil),
    'a provision can be attributed to a government account whose entity has never been verified, so the sentence that tells a homeowner a city stood behind a rule can be written about a city that has never taken part');
end
$$;


-- =============================================================================
-- WHO MAY CLAIM A GOVERNMENT ENTITY (decision 2o, and 2p's definition of done
-- item 5: "a homeowner, builder or unrelated user cannot claim a government
-- entity")
--
-- THE GAP THIS SECTION CLOSES. Everything above tests what a claim PRODUCES —
-- a pending membership, the claimed state, and never a verification. Until this
-- section existed, nothing in the repository tested WHO IS ALLOWED TO CALL
-- claim_government_entity AT ALL: grep for the function name across
-- supabase/tests/ returned one hit, 200's `claiming-produces-neither-status`,
-- and that test's caller is simply a signed-in account. The whole suite was
-- green while any signed-in homeowner could claim the City of Phoenix by typing
-- a name and an email address into a form, which is the precise thing 2o
-- forbids: a person must NOT be able to self-register and claim a city, county,
-- state, planning department, building department or any other government
-- identity merely by holding an email address or knowing the jurisdiction's
-- name. A suite that watched what a claim produced and never asked who made it
-- was measuring the wrong half of the sentence.
--
-- WHAT 2o DETERMINES, AND WHAT IT LEAVES OPEN. It determines the outcomes: an
-- ordinary signup does not reach a government claim, knowing the jurisdiction's
-- name is not sufficient, holding an email address is not sufficient, and the
-- official government domains recorded on the entity (2m) are the evidence that
-- supports the check. It does NOT say whether the domain is matched against the
-- authenticated account's own email or against the work email typed into the
-- claim form, and this file deliberately does not decide that: every fixture
-- below is built so BOTH readings agree. The claimant who must succeed holds an
-- account AT the entity's official domain and submits that same address; every
-- claimant who must be refused holds an account at a domain the entity never
-- recorded and submits that same address. A test that passed under one reading
-- and failed under the other would be this file inventing a product decision.
--
-- A matching domain still produces CLAIMED and never VERIFIED. That is 2m and it
-- is asserted above; the positive control here re-asserts it on the successful
-- path, because the path that is allowed to work is the one where a verification
-- could accidentally ride along.
-- =============================================================================

-- A person whose ADUAtlas account email sits at a NAMED domain. t.mk_account
-- always lands on example.test, which is deliberately not any entity's official
-- domain; this variant is the only way to hold the domain fixed and vary nothing
-- else. The account is an ordinary one in every other respect: signup metadata,
-- the real handle_new_auth_user trigger, no role and no entitlement.
create or replace function t.gov_account_at(p_domain text, p_role text default 'homeowner')
returns uuid
language plpgsql
as $fn$
declare
  v_label text := t.nextlabel('gov-claimant');
  v_auth  uuid;
  v_user  uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), v_label || '@' || p_domain, jsonb_build_object('role', p_role))
  returning id into v_auth;
  select id into v_user from public.users where auth_user_id = v_auth;
  return v_user;
end
$fn$;

-- The claim, as the form would send it, run AS THE CALLER through t.x(). The work
-- email is the caller's OWN account email, so the statement says the same thing
-- whether the product checks the account or the form field.
create or replace function t.gov_claim_sql(p_entity uuid, p_user uuid)
returns text
language sql
stable
as $fn$
  select format(
    'select public.claim_government_entity(%L::uuid, %L, %L, %L::citext, null, %L)',
    p_entity, 'A Claimant', 'ADU coordinator',
    (select u.email::text from public.users u where u.id = p_user),
    'claimed through the form');
$fn$;

do $$
declare
  v_state uuid; v_city uuid;
  v_e_match uuid; v_e_free uuid; v_e_golden uuid; v_e_platinum uuid;
  v_e_pro uuid; v_e_nodomain uuid; v_e_priv uuid;
  v_u_match uuid; v_u_free uuid; v_u_golden uuid; v_u_platinum uuid;
  v_u_pro uuid; v_u_nodomain uuid; v_u_vmem uuid; v_u_pmem uuid;
  v_b uuid;
  v_pc jsonb; v_pc_ok boolean := false;
  v_read jsonb; v_read_ok boolean := false;
begin
  -- ── the gate ──────────────────────────────────────────────────────────────
  if not t.has_function('public.claim_government_entity')
     or not t.has_relation('public.government_entities')
     or not t.has_relation('public.government_memberships') then
    perform t.skip('control-a-work-email-on-an-official-domain-can-claim',
      '2o: claiming a government entity is a higher bar than creating an account',
      'public.claim_government_entity or the government tables do not exist; migration 0012 is not applied to this database, so there is no claim path to attack.');
    perform t.skip('a-free-homeowner-cannot-claim-a-government-entity',
      '2o and 2p item 5: a homeowner, builder or unrelated user cannot claim a government entity',
      'migration 0012 is not applied.');
    perform t.skip('a-golden-homeowner-cannot-claim-a-government-entity',
      '2o: paying ADUAtlas is not authority to represent a government',
      'migration 0012 is not applied.');
    perform t.skip('a-platinum-homeowner-cannot-claim-a-government-entity',
      '2o: paying ADUAtlas more is not authority to represent a government',
      'migration 0012 is not applied.');
    perform t.skip('a-builder-pro-cannot-claim-a-government-entity',
      '2o and 2p: roles stay separate, and a builder account is not a government one',
      'migration 0012 is not applied.');
    perform t.skip('an-entity-with-no-official-domains-is-not-self-service-claimable',
      '2o: the official government domains are what a self-service claim is checked against',
      'migration 0012 is not applied.');
    perform t.skip('control-a-verified-member-reads-its-own-entitys-private-row',
      '2m: a member sees their own institution',
      'migration 0012 is not applied.');
    perform t.skip('a-pending-member-cannot-read-the-entitys-private-row',
      '2o: the official domains are the evidence a claim is judged against, so a claim must not hand them out',
      'migration 0012 is not applied.');
    return;
  end if;

  -- ── the geography and the entities ────────────────────────────────────────
  -- One entity per attacker, so "it is STILL unclaimed" is a statement about
  -- that attacker's attempt and not about whichever attempt happened to run
  -- first. Every entity is seeded the way ADUAtlas seeds one: UNCLAIMED,
  -- UNVERIFIED, compiled from the government's own public website, with
  -- example.gov as the recorded official domain.
  v_state := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_city  := t.gov_jur('municipality', v_state, 'Claimtown');

  v_e_match    := t.gov_entity(v_city, 'city', 'Claimtown Community Development');
  v_e_free     := t.gov_entity(v_city, 'city', 'Claimtown Planning');
  v_e_golden   := t.gov_entity(v_city, 'city', 'Claimtown Building Safety');
  v_e_platinum := t.gov_entity(v_city, 'city', 'Claimtown Zoning');
  v_e_pro      := t.gov_entity(v_city, 'city', 'Claimtown Permits');
  v_e_priv     := t.gov_entity(v_city, 'city', 'Claimtown Development Services');

  -- An entity ADUAtlas seeded from a source that never gave a government domain.
  -- There is nothing to check a claim against, so there is no self-service claim
  -- to make: Amy associates the account by hand or the domains get recorded
  -- first. Anything else means an entity is claimable BECAUSE ADUAtlas's own
  -- record is incomplete, which is 2b's failure mode pointed at authority.
  insert into public.government_entities
    (name, entity_type, jurisdiction_id, official_website_url, official_domains, source_url)
  values ('Claimtown Historic Preservation ' || t.nextlabel('ent'), 'city', v_city,
          'https://www.example.gov/historic', '{}', 'https://www.example.gov/historic')
  returning id into v_e_nodomain;

  -- ── the people ───────────────────────────────────────────────────────────
  v_u_match    := t.gov_account_at('example.gov');   -- account AT the official domain
  v_u_nodomain := t.gov_account_at('example.gov');   -- same shape, aimed at the entity with no domains
  v_u_free     := t.mk_account('homeowner');         -- @example.test, no plan
  v_u_golden   := t.mk_paid_homeowner('roadmap');    -- 'roadmap' is Golden $79 (src/lib/plans.js)
  v_u_platinum := t.mk_paid_homeowner('report');     -- 'report' is Platinum $279
  v_u_pro      := t.mk_account('pro');
  v_b          := t.mk_builder();
  perform t.link_owner(v_b, v_u_pro);                -- a real builder account, owning a real listing

  -- ── THE POSITIVE CONTROL ─────────────────────────────────────────────────
  -- Written first on purpose. Every assertion in this section says somebody
  -- CANNOT claim, and a wall of refusals passes perfectly against a claim path
  -- that is refused for everybody — including the city employee it exists for.
  -- 2o raises the bar on claiming; it does not remove claiming.
  v_pc := t.x('authenticated', t.authid(v_u_match), t.gov_claim_sql(v_e_match, v_u_match));
  v_pc_ok := (v_pc->>'ok')::boolean;
  perform t.assert(
    'control-a-work-email-on-an-official-domain-can-claim',
    '2o: claiming a government entity is a higher bar than creating an account, and the official government domains recorded on the entity are what supports it. A claimant whose email is AT the entity''s own official domain may still claim',
    v_pc_ok,
    format('a signed-in person whose account email is at the entity''s recorded official domain cannot claim that entity: %s. Until this passes, every refusal below is indistinguishable from a claim path that works for nobody, so those assertions are reported as skips rather than as green security.',
           coalesce(v_pc->>'error', '<no error>')));

  if v_pc_ok then
    perform t.assert_scalar(
      'a-successful-claim-leaves-the-entity-claimed',
      '2m: CLAIMED is a real state. A claim ADUAtlas accepted is visible as claimed and nothing more',
      'anon', null,
      format('select entity_state from public.government_entities_public where id = %L', v_e_match),
      'claimed',
      'an accepted claim did not move the entity into the claimed state, so the control above proves the function returned rather than that it did anything');

    perform t.assert_scalar(
      'a-successful-claim-still-produces-no-verification',
      '2o: verification remains a deliberate ADUAtlas act that claiming never produces. 2m: claiming never produces verification',
      'service_role', null,
      format('select verification_status from public.government_entities where id = %L', v_e_match),
      'unverified',
      'the claim that IS allowed to succeed also verified the entity. The allowed path is exactly where a verification is most likely to ride along, because it is the only path that is not refused');

    -- ── the four accounts 2p item 5 names, each against its own entity ─────
    perform t.assert_denied(
      'a-free-homeowner-cannot-claim-a-government-entity',
      '2o: an ordinary signup must not reach a government claim, and possession of an email address must not be sufficient. 2p item 5: a homeowner, builder or unrelated user cannot claim a government entity',
      'authenticated', t.authid(v_u_free),
      t.gov_claim_sql(v_e_free, v_u_free),
      'a free homeowner account can claim a city, county, state or planning department. Signing up for ADUAtlas with any email address would be the whole of the bar, and the claim form would be the moment a stranger starts speaking for a government');

    perform t.assert_denied(
      'a-golden-homeowner-cannot-claim-a-government-entity',
      '2o: claiming a government identity is a higher bar than creating an account, and paying for a homeowner plan is not that bar',
      'authenticated', t.authid(v_u_golden),
      t.gov_claim_sql(v_e_golden, v_u_golden),
      'a paying Golden homeowner can claim a government entity. A purchase is a commercial relationship with ADUAtlas and says nothing about authority to represent a jurisdiction');

    perform t.assert_denied(
      'a-platinum-homeowner-cannot-claim-a-government-entity',
      '2o: paying more does not raise a homeowner towards government authority',
      'authenticated', t.authid(v_u_platinum),
      t.gov_claim_sql(v_e_platinum, v_u_platinum),
      'a paying Platinum homeowner can claim a government entity, so the tier ladder quietly ends in a municipal identity');

    perform t.assert_denied(
      'a-builder-pro-cannot-claim-a-government-entity',
      '2o and 2p: roles stay separate — homeowner, builder, affiliate or partner builder, municipality, state agency and ADUAtlas admin. A builder account is the nearest thing in the product to a government one and is still not one',
      'authenticated', t.authid(v_u_pro),
      t.gov_claim_sql(v_e_pro, v_u_pro),
      'a builder account that owns a marketplace listing can claim a government entity. A company that sells ADUs would be able to hold the identity of the jurisdiction that regulates them, which is the single worst version of this defect');

    -- ── and the entity is untouched by every refused attempt ──────────────
    -- A refusal that still stamped claimed_at would leave the public page
    -- reading "claimed" for a city that has never heard of ADUAtlas, which is
    -- exactly what 2m's unclaimed state exists to prevent.
    perform t.assert_scalar(
      'the-entity-stays-unclaimed-after-a-free-homeowner-attempt',
      '2m: UNCLAIMED means ADUAtlas created the record from authoritative public sources and NOTHING implies the government takes part',
      'anon', null,
      format('select entity_state from public.government_entities_public where id = %L', v_e_free),
      'unclaimed',
      'a refused claim still moved the entity out of unclaimed, so a stranger can make a city''s public page say it has been claimed without ever being allowed to claim it');

    perform t.assert_scalar(
      'the-entity-stays-unclaimed-after-a-golden-homeowner-attempt',
      '2m: a refused claim changes nothing about the entity',
      'anon', null,
      format('select entity_state from public.government_entities_public where id = %L', v_e_golden),
      'unclaimed',
      'a refused claim still moved the entity out of unclaimed');

    perform t.assert_scalar(
      'the-entity-stays-unclaimed-after-a-platinum-homeowner-attempt',
      '2m: a refused claim changes nothing about the entity',
      'anon', null,
      format('select entity_state from public.government_entities_public where id = %L', v_e_platinum),
      'unclaimed',
      'a refused claim still moved the entity out of unclaimed');

    perform t.assert_scalar(
      'the-entity-stays-unclaimed-after-a-builder-pro-attempt',
      '2m: a refused claim changes nothing about the entity',
      'anon', null,
      format('select entity_state from public.government_entities_public where id = %L', v_e_pro),
      'unclaimed',
      'a refused claim still moved the entity out of unclaimed');

    perform t.assert_count(
      'a-refused-claim-leaves-no-membership-behind',
      '2m: a login is never synonymous with a government, and a membership is the join that carries authority',
      'service_role', null,
      format('select 1 from public.government_memberships where entity_id in (%L, %L, %L, %L)',
             v_e_free, v_e_golden, v_e_platinum, v_e_pro),
      0,
      'a refused claim still created a membership row. A pending membership is what a later verification is granted against, so a refused claim that leaves one behind has only postponed the escalation');

    -- ── an entity with no recorded domains is not self-service claimable ───
    -- The claimant here is built EXACTLY like the one in the positive control:
    -- an account at example.gov submitting its own address. The only difference
    -- is that this entity's official_domains is empty, so the only thing that
    -- can decide the outcome is the absence of recorded domains.
    perform t.assert_denied(
      'an-entity-with-no-official-domains-is-not-self-service-claimable',
      '2o: the official government domains recorded on the entity in 2m exist partly to support this. Where ADUAtlas has recorded none, there is nothing for a self-service claim to be checked against',
      'authenticated', t.authid(v_u_nodomain),
      t.gov_claim_sql(v_e_nodomain, v_u_nodomain),
      'an entity whose official_domains is empty can be claimed by anybody who reaches it. An incomplete ADUAtlas record would make a government MORE claimable rather than less, so every entity Amy has not finished researching is the soft target');

    perform t.assert_scalar(
      'the-entity-with-no-official-domains-stays-unclaimed',
      '2m: UNCLAIMED means nothing implies the government takes part',
      'anon', null,
      format('select entity_state from public.government_entities_public where id = %L', v_e_nodomain),
      'unclaimed',
      'the entity with no recorded official domains was moved out of unclaimed by a claim that must not have been accepted');
  else
    perform t.skip('a-successful-claim-leaves-the-entity-claimed',
      '2m: CLAIMED is a real state',
      'the positive control did not pass; see control-a-work-email-on-an-official-domain-can-claim.');
    perform t.skip('a-successful-claim-still-produces-no-verification',
      '2o: verification remains a deliberate ADUAtlas act',
      'the positive control did not pass.');
    perform t.skip('a-free-homeowner-cannot-claim-a-government-entity',
      '2o and 2p item 5: a homeowner, builder or unrelated user cannot claim a government entity',
      'the positive control did not pass, so a refused claim cannot be told apart from a claim path that works for nobody. A refusal here would not be evidence.');
    perform t.skip('a-golden-homeowner-cannot-claim-a-government-entity',
      '2o: paying for a homeowner plan is not authority to represent a government',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('a-platinum-homeowner-cannot-claim-a-government-entity',
      '2o: paying more does not raise a homeowner towards government authority',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('a-builder-pro-cannot-claim-a-government-entity',
      '2o and 2p: roles stay separate',
      'the positive control did not pass; a denial here would not be evidence.');
    perform t.skip('the-entity-stays-unclaimed-after-a-free-homeowner-attempt',
      '2m: a refused claim changes nothing about the entity',
      'the positive control did not pass; every entity trivially stays unclaimed when no claim can succeed.');
    perform t.skip('the-entity-stays-unclaimed-after-a-golden-homeowner-attempt',
      '2m: a refused claim changes nothing about the entity',
      'the positive control did not pass.');
    perform t.skip('the-entity-stays-unclaimed-after-a-platinum-homeowner-attempt',
      '2m: a refused claim changes nothing about the entity',
      'the positive control did not pass.');
    perform t.skip('the-entity-stays-unclaimed-after-a-builder-pro-attempt',
      '2m: a refused claim changes nothing about the entity',
      'the positive control did not pass.');
    perform t.skip('a-refused-claim-leaves-no-membership-behind',
      '2m: a membership is the join that carries authority',
      'the positive control did not pass.');
    perform t.skip('an-entity-with-no-official-domains-is-not-self-service-claimable',
      '2o: the official government domains are what a self-service claim is checked against',
      'the positive control did not pass; with no claim succeeding anywhere, an empty domain list cannot be shown to be the reason for this refusal.');
    perform t.skip('the-entity-with-no-official-domains-stays-unclaimed',
      '2m: UNCLAIMED means nothing implies the government takes part',
      'the positive control did not pass.');
  end if;

  -- =========================================================================
  -- A PENDING MEMBER IS NOT A MEMBER YET (2o, with 2m)
  --
  -- A claim is self-service and produces a PENDING membership. The official
  -- domains and the source URL on the entity are the EVIDENCE Amy judges that
  -- claim against. If a pending membership is enough to read them, then the act
  -- of claiming hands the claimant the material the check is made from, and
  -- anybody who can reach the claim form can read which domains would satisfy
  -- it — for every entity they care to claim. 2o's whole point is that the
  -- domains support the check; a check whose inputs are readable by the person
  -- being checked is not a check.
  -- =========================================================================
  perform t.gov_claim(v_e_priv);
  perform t.gov_verify(v_e_priv);
  v_u_vmem := t.mk_account('homeowner');
  v_u_pmem := t.mk_account('homeowner');
  perform t.gov_member(v_e_priv, v_u_vmem, true);    -- ADUAtlas confirmed this person
  perform t.gov_member(v_e_priv, v_u_pmem, false);   -- claimed, authority NOT confirmed

  -- ── THE POSITIVE CONTROL for this group ─────────────────────────────────
  v_read := t.q('authenticated', t.authid(v_u_vmem),
    format('select official_domains, source_url from public.government_entities where id = %L', v_e_priv));
  v_read_ok := (v_read->>'ok')::boolean and (v_read->>'count')::int = 1;
  perform t.assert(
    'control-a-verified-member-reads-its-own-entitys-private-row',
    '2m: a member sees their own institution. A verified member of a verified entity reads the entity row, including the official domains and the source ADUAtlas compiled the record from',
    v_read_ok,
    format('a VERIFIED member of a verified entity cannot read that entity''s own row: %s (%s row(s)). The refusal asserted next would then mean only that nobody can read it, which is a broken feature wearing a security result.',
           coalesce(v_read->>'error', '<no error>'), v_read->>'count'));

  if v_read_ok then
    perform t.reg_unseen(
      'a-pending-member-cannot-read-the-entitys-private-row',
      '2o: the official government domains exist to SUPPORT the claim check, so a pending claimant must not be able to read them. 2m: a claim is not a verification, and it is not access',
      'authenticated', t.authid(v_u_pmem),
      format('select official_domains, source_url from public.government_entities where id = %L', v_e_priv),
      'a merely PENDING member reads the entity''s private row, which is the official_domains list the claim is judged against and the source_url ADUAtlas compiled the record from. Claiming is self-service, so this makes the evidence behind the check readable by anybody prepared to submit a claim form, one entity at a time');

    perform t.reg_unseen(
      'a-pending-member-cannot-read-the-official-domains-of-another-entity',
      '2m: a government user never reaches another government''s management area',
      'authenticated', t.authid(v_u_pmem),
      format('select official_domains from public.government_entities where id = %L', v_e_match),
      'a pending claimant on one entity can read the official domains of a different entity, so one claim form submission opens the evidence for every government in the database');
  else
    perform t.skip('a-pending-member-cannot-read-the-entitys-private-row',
      '2o: the official government domains exist to support the claim check',
      'the positive control did not pass; a verified member cannot read the row either, so a pending member seeing nothing is not evidence of a boundary.');
    perform t.skip('a-pending-member-cannot-read-the-official-domains-of-another-entity',
      '2m: a government user never reaches another government''s management area',
      'the positive control did not pass; a denial here would not be evidence.');
  end if;
end
$$;


-- =============================================================================
-- THE GOVERNMENT IDENTITY AXIS, COMPLETED: SUSPENSION, WITHDRAWAL, AND WHAT
-- SURVIVES IT (decision 2s — D3, D4, D5; migration 0020)
--
-- THE THREE CONTRACTS, AND WHICH ONE GETS BUILT BACKWARDS.
--
--   D3  SUSPENDED is a REAL identity state and it is REACHABLE. 2p (i) names
--       five internal identity states; 0012 shipped four and had no path out of
--       'verified' at all, so suspension was being modelled as a REVOKED
--       MEMBERSHIP. That is a different fact: a person leaving the planning
--       department is not the institution being suspended, and a product that
--       cannot tell them apart cannot tell a homeowner which happened. Identity
--       state stays SEPARATE from partnership state at every layer.
--
--   D4  An identity verification is WITHDRAWABLE by an authorised admin, and the
--       action records WHO, WHEN and WHY. The historical verification record is
--       NEVER DESTROYED. This one has a trap in it: 0012's verification guard
--       nulls verified_at the moment the status leaves 'verified' — correctly,
--       because a date that outlives the verification behind it is a lie with a
--       timestamp on it — so unless the withdrawal WRITES THE VERIFICATION DOWN
--       first, taking it back erases the fact that it ever happened.
--
--   D5  Withdrawal STOPS THE FUTURE and PRESERVES THE PAST. This is the one most
--       likely to be implemented backwards, because "the city's verification was
--       withdrawn, so revoke what the city gave" is the intuitive reading and it
--       is the wrong one. No new links, no new codes, no new sponsored
--       activation. Entitlements ALREADY GRANTED TO RESIDENTS REMAIN INTACT. A
--       resident is never stripped of course access because the government
--       relationship changed: they did nothing wrong and the sponsorship was
--       granted once.
--
-- ── WHY THERE ARE POSITIVE CONTROLS, AND WHAT EACH ONE UNDERWRITES ───────────
--
-- Almost every assertion below is a refusal or a "nothing changed", and a suite
-- of those passes perfectly against a feature that does not work at all. A
-- database where no partner can EVER mint a link would report "a suspended
-- entity cannot issue a new link" as green. A database where no resident can EVER
-- be sponsored would report "the resident still holds Golden" as green while
-- holding nothing. So each group proves the working path first:
--
--   D3/D4  a verified entity CAN be withdrawn through the product's own RPC, and
--          an ordinary verification IS recorded in the history.
--   D4     the service role CAN read the identity history, before any assertion
--          that a government member cannot.
--   D5     an ACTIVE partner CAN mint a link and a code, and a resident CAN
--          redeem one and end up holding Golden — all BEFORE the withdrawal.
--
-- Where a control does not pass, the assertions it underwrites are recorded as
-- SKIPS carrying the database's own error. A skip is not a pass.
--
-- ── WHAT THIS SECTION DOES NOT ASSERT ────────────────────────────────────────
--
-- It does not assert that withdrawal is spelled with a sixth identity state.
-- 2p (i) names five, and 0014's own comment defines 'suspended' as "a
-- verification ADUAtlas withdrew from an entity it had confirmed" while
-- 'rejected' is "a claim it refused". Withdrawing and suspending are the same act
-- on the same axis, so both land on 'suspended', and the two words are asserted
-- to be DISTINCT STORED VALUES rather than one being renamed into the other.
-- =============================================================================

-- ── the partnership and sponsorship fixtures ─────────────────────────────────
-- COPIED VERBATIM from 200_partnership_and_sponsorship.sql, which is where they
-- are documented, for the reason stated at the top of this file and at the top of
-- 180: every invariant file has to run standalone and in any order, and 190 runs
-- BEFORE 200. `create or replace` with an identical body makes whichever copy runs
-- second a no-op. They are needed here because D5 is a statement about what
-- happens to a LIVE SPONSORSHIP when the identity behind it is withdrawn, and
-- there is no way to say that without minting a real link, a real code and a real
-- resident entitlement first.
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

-- =============================================================================
-- D3 and D4 — the identity axis on its own: reachable, attributed, and a history
-- that outlives the fact it records.
--
-- No partnership anywhere in this block. That is deliberate: D3 says identity
-- state stays SEPARATE from partnership state, and a block that could only
-- demonstrate withdrawal by way of a partnership would be evidence against the
-- separation rather than for it.
-- =============================================================================
do $$
declare
  v_state uuid; v_city uuid;
  v_e     uuid;              -- verified, then withdrawn, then re-verified
  v_e_rev uuid;              -- verified, then its only representative is REVOKED
  v_amy   uuid;              -- the acting admin
  v_off   uuid; v_off_rev uuid;
  v_m     uuid; v_m_rev uuid;
  v_tokens text[];
  v_missing text[] := '{}';
  s       text;
  v_verified_at   timestamptz;
  v_checked       constant text := 'the official domain, the published staff directory and a call to the planning counter';
  v_reason        constant text := 'the ADU coordinator left and the city confirmed in writing that nobody there is authorised to represent it on ADUAtlas';
  v_v     jsonb;
  v_w     jsonb; v_w_ok boolean := false;
  v_svc   jsonb;
  v_ev    record;
  v_public_before text; v_public_after text;
  v_events_before int; v_events_after int;
  v_n     int;
begin
  -- ── the gate ──────────────────────────────────────────────────────────────
  if not t.has_function('public.admin_withdraw_government_verification')
     or not t.has_relation('public.government_identity_events')
     or not t.has_relation('public.government_entities')
     or not t.has_function('public.admin_verify_government_membership') then
    perform t.skip('control-the-five-identity-states-are-all-storable',
      '2s D3: SUSPENDED is a real identity state with a column that can hold it',
      'public.admin_withdraw_government_verification or public.government_identity_events does not exist; migration 0020 is not applied to this database, so there is no withdrawal path to test.');
    perform t.skip('suspended-and-rejected-are-two-distinct-identity-states',
      '2s D3: a verification ADUAtlas took back is not a claim ADUAtlas refused',
      'migration 0020 is not applied.');
    perform t.skip('control-an-ordinary-verification-is-recorded-in-the-identity-history',
      '2s D4: the identity history records every transition, so a withdrawal row is legible beside the verification it ended',
      'migration 0020 is not applied.');
    perform t.skip('control-anon-reads-verified-on-the-public-surface-before-the-withdrawal',
      '2m: the public badge accurately represents the underlying state',
      'migration 0020 is not applied.');
    perform t.skip('a-withdrawal-with-no-reason-is-refused',
      '2s D4: the action records WHY',
      'migration 0020 is not applied.');
    perform t.skip('a-withdrawal-with-no-acting-admin-is-refused',
      '2s D4: the action records WHO performed it',
      'migration 0020 is not applied.');
    perform t.skip('a-refused-withdrawal-leaves-the-verification-standing',
      '2s D4: a refused action changes nothing',
      'migration 0020 is not applied.');
    perform t.skip('the-withdrawal-rpc-is-not-executable-by-a-signed-in-account',
      '2p: no client-side state can create or remove either status; government authorization is never client-side',
      'migration 0020 is not applied.');
    perform t.skip('the-withdrawal-rpc-is-not-executable-by-anon',
      '2p: the admin surface is service_role only',
      'migration 0020 is not applied.');
    perform t.skip('control-an-authorised-admin-can-withdraw-a-verification',
      '2s D4: an identity verification is withdrawable by an authorised admin',
      'migration 0020 is not applied.');
    perform t.skip('suspension-is-reachable-and-is-stored-as-suspended',
      '2s D3: SUSPENDED is a real identity state and the product can reach it',
      'migration 0020 is not applied.');
    perform t.skip('a-withdrawal-records-the-acting-admin',
      '2s D4: the action records WHO performed it',
      'migration 0020 is not applied.');
    perform t.skip('a-withdrawal-records-when-it-happened',
      '2s D4: the action records WHEN it happened',
      'migration 0020 is not applied.');
    perform t.skip('a-withdrawal-records-why',
      '2s D4: the action records WHY',
      'migration 0020 is not applied.');
    perform t.skip('the-verification-the-withdrawal-ended-survives-in-the-history',
      '2s D4: the historical verification record is NEVER destroyed',
      'migration 0020 is not applied.');
    perform t.skip('what-was-checked-at-verification-survives-the-withdrawal',
      '2s D4: withdrawal is an event appended to the history, not an erasure of it',
      'migration 0020 is not applied.');
    perform t.skip('the-withdrawal-does-not-overwrite-the-note-saying-what-was-checked',
      '2s D4: the historical verification record is NEVER destroyed, and that includes the entity row',
      'migration 0020 is not applied.');
    perform t.skip('the-identity-history-is-append-only-for-every-role',
      '2s D4: the historical verification record is NEVER destroyed, by anybody',
      'migration 0020 is not applied.');
    perform t.skip('the-identity-history-is-never-deleted-by-any-role',
      '2s D4: the historical verification record is NEVER destroyed, by anybody',
      'migration 0020 is not applied.');
    perform t.skip('a-suspended-identity-no-longer-reads-as-verified-on-the-public-surface',
      '2p: every public badge accurately represents the underlying state',
      'migration 0020 is not applied.');
    perform t.skip('withdrawing-a-verification-does-not-revoke-the-membership',
      '2s D3: identity state and membership are different facts',
      'migration 0020 is not applied.');
    perform t.skip('a-second-withdrawal-of-an-already-suspended-identity-is-refused',
      '2s D4: only a verification that exists is withdrawn',
      'migration 0020 is not applied.');
    perform t.skip('control-the-service-role-reads-the-identity-history',
      '2f: Amy reviews government claims, so the console can read what happened',
      'migration 0020 is not applied.');
    perform t.skip('a-signed-in-government-member-cannot-read-the-identity-history',
      '2m: ADUAtlas''s internal review notes are not a government account''s to read',
      'migration 0020 is not applied.');
    perform t.skip('revoking-the-only-verified-membership-leaves-the-entity-verified',
      '2s D3: suspension is NOT a revoked membership; a person leaving is not an institution being suspended',
      'migration 0020 is not applied.');
    perform t.skip('revoking-a-membership-appends-no-identity-event',
      '2s D3: the membership axis and the identity axis are separate at every layer',
      'migration 0020 is not applied.');
    perform t.skip('re-verifying-after-a-withdrawal-restores-the-identity',
      '2s D4: withdrawal is a state, not a destroyed record; the entity can be verified again',
      'migration 0020 is not applied.');
    perform t.skip('the-withdrawal-stays-in-the-history-after-re-verification',
      '2s D4: the history is appended to, never rewritten',
      'migration 0020 is not applied.');
    return;
  end if;

  -- ── D3: the vocabulary. Five states, and two of them are not synonyms. ────
  v_tokens := t.reg_tokens('public.government_entities', 'verification_status');
  foreach s in array array['unverified', 'pending', 'verified', 'rejected', 'suspended'] loop
    if v_tokens is null or not (s = any (v_tokens)) then v_missing := v_missing || s; end if;
  end loop;
  perform t.assert(
    'control-the-five-identity-states-are-all-storable',
    '2s D3 and 2p (i): government_entities.verification_status must be able to hold all five internal identity states. Until it could, SUSPENDED had to be faked as a revoked membership, which is a different fact',
    v_missing = '{}',
    format('verification_status cannot hold %s. Its vocabulary is %s. Every refusal below would then be a refusal to store a value rather than a boundary.',
           array_to_string(v_missing, ', '), coalesce(v_tokens::text, '<no constrained vocabulary at all>')));

  perform t.assert(
    'suspended-and-rejected-are-two-distinct-identity-states',
    '2s D3: a verification ADUAtlas WITHDREW from an entity it had confirmed is not a claim ADUAtlas REFUSED at the door. The product must be able to say which one happened',
    v_tokens is not null and 'suspended' = any (v_tokens) and 'rejected' = any (v_tokens),
    format('the vocabulary is %s: one of the two words is missing, so the two events collapse into one and a homeowner cannot be told which happened',
           coalesce(v_tokens::text, '<none>')));

  -- ── the fixture, built the way the product builds it ─────────────────────
  v_state := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_city  := t.gov_jur('municipality', v_state, 'Withdrawalton');

  v_amy := t.mk_account('admin');
  v_off := t.mk_account('homeowner');       -- an ORDINARY account, as 2m requires
  v_e   := t.gov_entity(v_city, 'city', 'Withdrawalton Planning');
  perform t.gov_claim(v_e);                 -- claimed: says nothing about authority
  v_m := t.gov_member(v_e, v_off, false);   -- the claim, PENDING

  -- Verified through the REAL RPC rather than by fixture UPDATE, because D4 is
  -- about what the verification record contains and only the RPC fills it in:
  -- verified_by_app_user_id and the note saying what was checked.
  v_v := t.q('service_role', null, format(
    'select public.admin_verify_government_membership(%L::uuid, %L::uuid, %L) as result',
    v_m, v_amy, v_checked));

  select e.verified_at into v_verified_at from public.government_entities e where e.id = v_e;

  select count(*)::int into v_events_before
    from public.government_identity_events where entity_id = v_e;

  perform t.assert(
    'control-an-ordinary-verification-is-recorded-in-the-identity-history',
    '2s D4: the identity history records EVERY transition of verification_status, not only withdrawals, so the row that says a verification was taken back sits beside the row that says it was granted',
    (v_v->>'ok')::boolean
      and (select e.verification_status from public.government_entities e where e.id = v_e) = 'verified'
      and v_verified_at is not null
      and v_events_before = 1
      and exists (select 1 from public.government_identity_events
                   where entity_id = v_e and from_status = 'unverified' and to_status = 'verified'
                     and actor_app_user_id = v_amy),
    format('verifying a representative through admin_verify_government_membership did not produce one verified identity event attributed to the acting admin: rpc %s, entity state %L, verified_at %L, %s event row(s) %s. Every assertion below is about what the history contains, so none of them is evidence until this passes.',
           coalesce(v_v->>'error', 'ok'),
           (select e.verification_status from public.government_entities e where e.id = v_e),
           v_verified_at, v_events_before,
           coalesce((select jsonb_agg(jsonb_build_object('from', from_status, 'to', to_status, 'actor', actor_app_user_id))
                       from public.government_identity_events where entity_id = v_e)::text, '[]')));

  v_public_before := t.scalar('anon', null,
    format('select entity_state from public.government_entities_public where id = %L', v_e));
  perform t.assert(
    'control-anon-reads-verified-on-the-public-surface-before-the-withdrawal',
    '2m and 2p: the public badge accurately represents the underlying state. A verified entity reads verified, so the same read going quiet afterwards is a state change and not a broken view',
    v_public_before = 'verified',
    format('government_entities_public reports %L for an entity whose identity is verified. The post-withdrawal assertion would then pass against a view that never said verified in the first place.',
           coalesce(v_public_before, '<null>')));

  -- ── D4: WHO and WHY are not optional, and a refusal changes nothing ───────
  perform t.assert_error(
    'a-withdrawal-with-no-reason-is-refused',
    '2s D4: the action records WHO performed it, WHEN and WHY. A withdrawal nobody can explain is a withdrawal nobody can audit',
    'service_role', null,
    format('select public.admin_withdraw_government_verification(%L::uuid, %L::uuid, %L)', v_e, v_amy, '    '),
    'WHY',
    'a government identity verification can be withdrawn with a blank reason, so the history records that it happened and not why');

  perform t.assert_error(
    'a-withdrawal-with-no-acting-admin-is-refused',
    '2s D4: the action records WHO. Every admin_* RPC takes the acting person''s users.id because "the service key did it" is not an answer to who did it',
    'service_role', null,
    format('select public.admin_withdraw_government_verification(%L::uuid, null, %L)', v_e, v_reason),
    'WHO',
    'a withdrawal can be performed with no acting admin recorded, so the audit answers what happened and never who did it');

  perform t.assert_scalar(
    'a-refused-withdrawal-leaves-the-verification-standing',
    '2s D4: a refused action changes nothing. A half-applied withdrawal would suspend an entity while recording no reason for it',
    'service_role', null,
    format('select verification_status from public.government_entities where id = %L', v_e),
    'verified',
    'the two refused withdrawals above moved the identity state anyway');

  perform t.assert_denied(
    'the-withdrawal-rpc-is-not-executable-by-a-signed-in-account',
    '2p: government authorization is never client-side, and identity verification is never something an account can move. A verified member of this very entity is still not ADUAtlas',
    'authenticated', t.authid(v_off),
    format('select public.admin_withdraw_government_verification(%L::uuid, %L::uuid, %L)', v_e, v_off, 'I would like this withdrawn'),
    'a signed-in account can withdraw a government identity verification through PostgREST');

  perform t.assert_denied(
    'the-withdrawal-rpc-is-not-executable-by-anon',
    '2p: the government administration surface is service_role only',
    'anon', null,
    format('select public.admin_withdraw_government_verification(%L::uuid, %L::uuid, %L)', v_e, v_amy, 'anonymous withdrawal'),
    'an anonymous request can withdraw a government identity verification');

  -- ── THE POSITIVE CONTROL: the working path ────────────────────────────────
  v_w := t.q('service_role', null, format(
    'select public.admin_withdraw_government_verification(%L::uuid, %L::uuid, %L) as result',
    v_e, v_amy, v_reason));
  v_w_ok := (v_w->>'ok')::boolean and (v_w->'rows'->0->'result'->>'ok') = 'true';

  perform t.assert(
    'control-an-authorised-admin-can-withdraw-a-verification',
    '2s D4: an identity verification is WITHDRAWABLE by an authorised admin. Every assertion below describes what a withdrawal leaves behind, so none of them means anything until one can be performed',
    v_w_ok,
    format('admin_withdraw_government_verification refused the legitimate path: %s. A state that cannot be reached is a column value, not a state, and the refusals above would be proving only that nothing works.',
           coalesce(v_w->>'error', (v_w->'rows'->0->'result')::text, '<no result>')));

  if not v_w_ok then
    perform t.skip('suspension-is-reachable-and-is-stored-as-suspended',
      '2s D3: SUSPENDED is a real identity state and the product can reach it',
      'the positive control did not pass; the withdrawal RPC refused the legitimate path.');
    perform t.skip('a-withdrawal-records-the-acting-admin',
      '2s D4: the action records WHO performed it',
      'the positive control did not pass; there is no withdrawal to inspect.');
    perform t.skip('a-withdrawal-records-when-it-happened',
      '2s D4: the action records WHEN it happened',
      'the positive control did not pass; there is no withdrawal to inspect.');
    perform t.skip('a-withdrawal-records-why',
      '2s D4: the action records WHY',
      'the positive control did not pass; there is no withdrawal to inspect.');
    perform t.skip('the-verification-the-withdrawal-ended-survives-in-the-history',
      '2s D4: the historical verification record is NEVER destroyed',
      'the positive control did not pass; nothing was withdrawn, so "the record survived" would be true of a database in which nothing happened.');
    perform t.skip('what-was-checked-at-verification-survives-the-withdrawal',
      '2s D4: withdrawal is an event appended to the history, not an erasure of it',
      'the positive control did not pass.');
    perform t.skip('the-withdrawal-does-not-overwrite-the-note-saying-what-was-checked',
      '2s D4: the historical verification record is NEVER destroyed, and that includes the entity row',
      'the positive control did not pass.');
    perform t.skip('the-identity-history-is-append-only-for-every-role',
      '2s D4: the historical verification record is NEVER destroyed, by anybody',
      'the positive control did not pass; there is no withdrawal row to attack.');
    perform t.skip('the-identity-history-is-never-deleted-by-any-role',
      '2s D4: the historical verification record is NEVER destroyed, by anybody',
      'the positive control did not pass.');
    perform t.skip('a-suspended-identity-no-longer-reads-as-verified-on-the-public-surface',
      '2p: every public badge accurately represents the underlying state',
      'the positive control did not pass; the entity is still verified, so the public surface is right to say so.');
    perform t.skip('withdrawing-a-verification-does-not-revoke-the-membership',
      '2s D3: identity state and membership are different facts',
      'the positive control did not pass.');
    perform t.skip('a-second-withdrawal-of-an-already-suspended-identity-is-refused',
      '2s D4: only a verification that exists is withdrawn',
      'the positive control did not pass; the first withdrawal did not happen.');
    perform t.skip('control-the-service-role-reads-the-identity-history',
      '2f: Amy reviews government claims, so the console can read what happened',
      'the positive control did not pass.');
    perform t.skip('a-signed-in-government-member-cannot-read-the-identity-history',
      '2m: ADUAtlas''s internal review notes are not a government account''s to read',
      'the positive control did not pass; with no withdrawal row written, seeing nothing is not evidence of a boundary.');
    perform t.skip('re-verifying-after-a-withdrawal-restores-the-identity',
      '2s D4: withdrawal is a state, not a destroyed record',
      'the positive control did not pass.');
    perform t.skip('the-withdrawal-stays-in-the-history-after-re-verification',
      '2s D4: the history is appended to, never rewritten',
      'the positive control did not pass.');
  else
    -- ── D3: the state is reachable, and it is the right one ─────────────────
    perform t.assert_scalar(
      'suspension-is-reachable-and-is-stored-as-suspended',
      '2s D3: SUSPENDED is a REAL identity state. 0012 had no path out of verified at all, so suspension was being modelled as a revoked membership. It is now a stored identity state that the product itself can reach',
      'service_role', null,
      format('select verification_status from public.government_entities where id = %L', v_e),
      'suspended',
      'the withdrawal reported success but the entity''s identity state is not suspended, so either the state is unreachable or the RPC moved something else');

    select * into v_ev from public.government_identity_events
     where entity_id = v_e and to_status = 'suspended' order by id desc limit 1;

    -- ── D4: WHO, WHEN, WHY ─────────────────────────────────────────────────
    perform t.assert(
      'a-withdrawal-records-the-acting-admin',
      '2s D4: the action records WHO performed it. The service key is not a person and "the service key did it" is not an answer',
      v_ev.id is not null and v_ev.actor_app_user_id = v_amy,
      format('the withdrawal event records actor_app_user_id %L, expected the acting admin %L',
             coalesce(v_ev.actor_app_user_id::text, '<null>'), v_amy));

    perform t.assert(
      'a-withdrawal-records-when-it-happened',
      '2s D4: the action records WHEN. The timestamp is the database''s, so it cannot be back-dated by whoever called the endpoint',
      v_ev.id is not null
        and v_ev.occurred_at is not null
        and v_ev.occurred_at <= clock_timestamp()
        and v_ev.occurred_at > clock_timestamp() - interval '5 minutes',
      format('the withdrawal event records occurred_at %L, which is not a moment inside this test run',
             coalesce(v_ev.occurred_at::text, '<null>')));

    perform t.assert(
      'a-withdrawal-records-why',
      '2s D4: the action records WHY, in the words the admin wrote. A reason the product paraphrased is not the reason it was given',
      v_ev.id is not null and v_ev.reason = v_reason,
      format('the withdrawal event records reason %L, expected %L',
             coalesce(v_ev.reason, '<null>'), v_reason));

    -- ── D4: the history survives the transition ────────────────────────────
    perform t.assert(
      'the-verification-the-withdrawal-ended-survives-in-the-history',
      '2s D4: the historical verification record is NEVER DESTROYED. 0012''s guard nulls government_entities.verified_at the moment the status leaves verified — correctly — so unless the withdrawal writes the verification down, taking it back erases the fact that it ever happened',
      v_ev.id is not null
        and v_ev.from_status = 'verified'
        and v_ev.prior_verified_at is not null
        and v_ev.prior_verified_at = v_verified_at
        and (select e.verified_at from public.government_entities e where e.id = v_e) is null,
      format('the entity row now says verified_at %L (correctly null), and the history says it was verified at %L moving from %L. The verification was recorded at %L, so the fact it happened is not preserved anywhere.',
             coalesce((select e.verified_at::text from public.government_entities e where e.id = v_e), '<null>'),
             coalesce(v_ev.prior_verified_at::text, '<null>'), coalesce(v_ev.from_status, '<null>'), v_verified_at));

    perform t.assert(
      'what-was-checked-at-verification-survives-the-withdrawal',
      '2s D4: withdrawal is an event APPENDED to the history, not an erasure of it, for the same reason 0014 keeps a submission beside the published value. What ADUAtlas checked before verifying is part of the verification record',
      v_ev.id is not null and v_ev.prior_verification_note = v_checked,
      format('the history records what was checked as %L, expected %L. A withdrawal that overwrites the verification note destroys the evidence the verification was based on.',
             coalesce(v_ev.prior_verification_note, '<null>'), v_checked));

    -- Asserted on the ENTITY ROW as well as in the history, because a mutation
    -- found that the history assertion above cannot tell the two apart on its
    -- own: the trigger reads OLD.verification_note, so it preserves the checked
    -- note whether or not the withdrawal overwrote it. The non-destruction has to
    -- be asserted where the destruction would happen.
    perform t.assert(
      'the-withdrawal-does-not-overwrite-the-note-saying-what-was-checked',
      '2s D4: the historical verification record is NEVER destroyed, and that includes the entity row. "Why the verification was WITHDRAWN" and "what was CHECKED before it was granted" are two different sentences, and writing the first over the second destroys the evidence the verification rested on',
      (select e.verification_note from public.government_entities e where e.id = v_e) = v_checked,
      format('the entity''s verification_note now reads %L, expected the note recorded when identity was verified, %L. The withdrawal reason belongs in the identity history, not on top of the verification record.',
             coalesce((select e.verification_note from public.government_entities e where e.id = v_e), '<null>'), v_checked));

    perform t.reg_refused(
      'the-identity-history-is-append-only-for-every-role',
      '2s D4: the historical verification record is NEVER destroyed, and that includes by ADUAtlas. A stolen service key can append a lie; it must not be able to edit the truth',
      format('update public.government_identity_events set reason = %L where id = %L',
             'it was withdrawn for an entirely different reason', v_ev.id),
      'a withdrawal reason can be rewritten after the fact on the owner connection, so the history records whatever was most recently convenient');

    perform t.reg_refused(
      'the-identity-history-is-never-deleted-by-any-role',
      '2s D4: the historical verification record is NEVER destroyed. A deletable history is a memory, not a guarantee',
      format('delete from public.government_identity_events where id = %L', v_ev.id),
      'a withdrawal event can be deleted on the owner connection, so a withdrawal can be made never to have happened');

    -- ── the public surface tells the truth about the new state ──────────────
    v_public_after := t.scalar('anon', null,
      format('select entity_state from public.government_entities_public where id = %L', v_e));
    perform t.assert(
      'a-suspended-identity-no-longer-reads-as-verified-on-the-public-surface',
      '2p: every public badge accurately represents the underlying state. "Verified Government Account" must disappear the moment the verification does, because the badge is a claim ADUAtlas makes on the government''s behalf',
      v_public_after is distinct from 'verified',
      format('government_entities_public still reports %L for an entity whose verification has been withdrawn, so the public page keeps showing Verified Government Account',
             coalesce(v_public_after, '<null>')));

    -- ── D3: identity is not membership ─────────────────────────────────────
    perform t.assert_scalar(
      'withdrawing-a-verification-does-not-revoke-the-membership',
      '2s D3: identity state stays SEPARATE from membership at every layer. Suspending an institution is not the same event as a person leaving it, and doing one must not silently do the other',
      'service_role', null,
      format('select status from public.government_memberships where id = %L', v_m),
      'verified',
      'withdrawing the entity''s identity verification also revoked the representative''s membership, which collapses the two facts 2s D3 exists to keep apart');

    perform t.assert_error(
      'a-second-withdrawal-of-an-already-suspended-identity-is-refused',
      '2s D4: only a verification that EXISTS is withdrawn. A second withdrawal would append a withdrawal of nothing and overwrite the date and reason of the real one',
      'service_role', null,
      format('select public.admin_withdraw_government_verification(%L::uuid, %L::uuid, %L)', v_e, v_amy, 'withdrawing it again'),
      'VERIFIED',
      'an already-suspended identity can be withdrawn a second time');

    -- ── who may read the history ────────────────────────────────────────────
    v_svc := t.q('service_role', null,
      format('select id from public.government_identity_events where entity_id = %L', v_e));
    perform t.assert(
      'control-the-service-role-reads-the-identity-history',
      '2f: Amy''s scope includes reviewing government claims, so the admin console must be able to read what was verified, when, by whom and why it was taken back',
      (v_svc->>'ok')::boolean and (v_svc->>'count')::int >= 2,
      format('the service role reads %s row(s) of the identity history (%s). The boundary asserted next would then mean only that nobody can read it.',
             v_svc->>'count', coalesce(v_svc->>'error', 'no error')));

    if (v_svc->>'ok')::boolean and (v_svc->>'count')::int >= 2 then
      perform t.reg_unseen(
        'a-signed-in-government-member-cannot-read-the-identity-history',
        '2m: ADUAtlas''s internal review sentences about an institution''s claim are not a government account''s to read, exactly as verification_note and claim_note are not. A verified member of this very entity reaches none of it',
        'authenticated', t.authid(v_off),
        format('select id, reason, prior_verification_note from public.government_identity_events where entity_id = %L', v_e),
        'a signed-in government member reads ADUAtlas''s identity review history, including the reason a verification was withdrawn and the note saying what was checked');
    else
      perform t.skip('a-signed-in-government-member-cannot-read-the-identity-history',
        '2m: ADUAtlas''s internal review notes are not a government account''s to read',
        'the positive control did not pass; the service role cannot read the history either, so a member seeing nothing is not evidence of a boundary.');
    end if;

    -- ── re-verification: a state, not a destroyed record ───────────────────
    perform t.x('service_role', null, format(
      'select public.admin_verify_government_membership(%L::uuid, %L::uuid, %L)',
      v_m, v_amy, 'the city appointed a new coordinator and confirmed her authority in writing'));

    perform t.assert_scalar(
      're-verifying-after-a-withdrawal-restores-the-identity',
      '2s D4: withdrawal is a STATE, not a destroyed record. An entity ADUAtlas suspended can be verified again when the institution puts an authorised representative back in place',
      'service_role', null,
      format('select verification_status from public.government_entities where id = %L', v_e),
      'verified',
      'a suspended entity cannot be verified again, which makes a withdrawal permanent and turns an operational act into a one-way door');

    select count(*)::int into v_events_after
      from public.government_identity_events where entity_id = v_e and to_status = 'suspended';
    perform t.assert(
      'the-withdrawal-stays-in-the-history-after-re-verification',
      '2s D4: the history is APPENDED to and never rewritten. Verifying an entity again does not unsay the withdrawal, any more than publishing a new rule unsays the old one (2m)',
      v_events_after = 1
        and exists (select 1 from public.government_identity_events
                     where entity_id = v_e and from_status = 'suspended' and to_status = 'verified'),
      format('after re-verification the history holds %s withdrawal row(s) and the full transition list is %s. A history that loses the withdrawal when the entity is verified again cannot answer "was this ever taken back".',
             v_events_after,
             coalesce((select jsonb_agg(jsonb_build_object('from', from_status, 'to', to_status) order by id)
                         from public.government_identity_events where entity_id = v_e)::text, '[]')));
  end if;

  -- ── D3, the contrast that gives the state its meaning ────────────────────
  -- A REVOKED MEMBERSHIP IS NOT A SUSPENDED INSTITUTION. This is the fact 0012
  -- could not express and the reason 2s (D3) exists: with no suspended identity
  -- state, the only way to represent "this government is no longer verified" was
  -- to revoke its people, which says something different and leaves the entity
  -- reading as a Verified Government Account.
  v_off_rev := t.mk_account('homeowner');
  v_e_rev   := t.gov_entity(v_city, 'city', 'Withdrawalton Building Safety');
  perform t.gov_claim(v_e_rev);
  v_m_rev := t.gov_member(v_e_rev, v_off_rev, false);
  perform t.x('service_role', null, format(
    'select public.admin_verify_government_membership(%L::uuid, %L::uuid, %L)',
    v_m_rev, v_amy, 'the official domain and the staff directory'));

  select count(*)::int into v_n
    from public.government_identity_events where entity_id = v_e_rev;

  perform t.x('service_role', null, format(
    'select public.admin_revoke_government_membership(%L::uuid, %L::uuid, %L)',
    v_m_rev, v_amy, 'she left the building safety department'));

  perform t.assert_scalar(
    'revoking-the-only-verified-membership-leaves-the-entity-verified',
    '2s D3: suspension is NOT a revoked membership. Revoking the last representative is a fact about a PERSON: the institution''s identity state is untouched, and if ADUAtlas wants to stop treating the institution as verified it must withdraw the verification, deliberately and with a reason',
    'service_role', null,
    format('select verification_status from public.government_entities where id = %L', v_e_rev),
    'verified',
    'revoking a membership changed the entity''s identity state, so the two facts are the same fact again and 0020 has re-created the confusion 2s D3 was written to end');

  perform t.assert(
    'revoking-a-membership-appends-no-identity-event',
    '2s D3: the membership axis and the identity axis are separate at every layer, including the history. A membership revocation belongs in the membership record and the audit log, not in the identity history',
    (select count(*)::int from public.government_identity_events where entity_id = v_e_rev) = v_n,
    format('the identity history for this entity went from %s row(s) to %s when a MEMBERSHIP was revoked, so reading the identity history now tells you about people rather than about the institution',
           v_n, (select count(*)::int from public.government_identity_events where entity_id = v_e_rev)));
end
$$;

-- =============================================================================
-- D5 — withdrawal STOPS THE FUTURE and PRESERVES THE PAST.
--
-- THE ASSERTION THIS BLOCK EXISTS FOR IS
-- `a-resident-sponsored-before-the-withdrawal-still-holds-golden`.
--
-- Everything else here is scaffolding for it. The intuitive implementation of
-- "the city's verification was withdrawn" is "so take back what the city gave",
-- and that is the wrong way round: the resident did nothing wrong, the
-- sponsorship was granted once, and 2s says plainly that a resident is never
-- stripped of course access because the government relationship later changed.
-- 2p's definition-of-done item 23 says the same thing about the partnership axis;
-- this is that rule applied to the identity axis.
--
-- HOW THE WITHDRAWAL IS SUPPOSED TO REACH THE PARTNERSHIP. Not by a second
-- statement in the withdrawal RPC. 0014 already ships
-- government_entities_partnership_cascade, which suspends an ACTIVE partnership
-- whenever verification LEAVES verified, and the withdrawal DRIVES it: one update
-- on one column. So the assertion below is not merely "the partnership ended up
-- suspended" — it is that the identity move alone was enough, which is what keeps
-- the two axes from growing a second, divergent implementation.
-- =============================================================================
do $$
declare
  v_state uuid; v_city uuid;
  v_amy uuid; v_off uuid; v_off2 uuid;
  v_e uuid; v_e_none uuid;
  v_m uuid; v_m_none uuid;
  v_part uuid;
  v_active text;
  v_token text; v_code text;
  v_res_before uuid;         -- sponsored BEFORE the withdrawal
  v_res_link uuid;           -- tries the link AFTER the withdrawal
  v_res_code uuid;           -- tries the code AFTER the withdrawal
  v_res_after uuid;          -- tries again after identity is re-verified
  v_r jsonb;
  v_ctl_link boolean := false; v_ctl_code boolean := false; v_ctl_grant boolean := false;
  v_ctl_active boolean := false;
  v_controls boolean := false;
  v_w jsonb; v_w_ok boolean := false;
  v_grant_before text;
  v_attr_before int;
  v_err text;
  v_part_row record;
begin
  -- ── the gate ──────────────────────────────────────────────────────────────
  if not t.has_function('public.admin_withdraw_government_verification')
     or not t.has_relation('public.government_partnerships')
     or not t.has_relation('public.partner_access_links')
     or not t.has_relation('public.partner_access_codes')
     or not t.has_relation('public.partner_redemptions')
     or not t.has_function('public.redeem_partner_access')
     or not t.has_function('public.government_partnership_status')
     or t.part_status_token('active') is null then
    perform t.skip('control-an-active-partner-can-issue-a-resident-link',
      '2p: only an ACTIVE partnership unlocks resident sponsored access',
      'migration 0014 or 0020 is not applied to this database (or the partnership status vocabulary could not be resolved), so there is no live sponsorship for a withdrawal to act on.');
    perform t.skip('control-an-active-partner-can-issue-a-resident-code',
      '2p: two distribution methods, one underlying system',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('control-a-resident-redeems-the-link-and-holds-golden',
      '2p: a valid active-partner link grants exactly the sponsored $79 Golden entitlement',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('control-the-partnership-is-active-before-the-withdrawal',
      '2p: the partnership axis has its own state',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('withdrawing-identity-suspends-the-partnership-through-the-0014-cascade',
      '2s D5: the moment a verification is withdrawn, no new sponsored activation can occur through that entity',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('the-partnership-suspension-carries-a-date-and-a-reason',
      '2p: a suspension always carries a date, and only a suspension has a reason',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('a-suspended-entity-cannot-issue-a-new-resident-link',
      '2s D5: a withdrawn entity can issue NO new sponsored links',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('a-suspended-entity-cannot-issue-a-new-resident-code',
      '2s D5: a withdrawn entity can issue NO new sponsored codes',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('a-suspended-entity-produces-no-new-activation-through-a-link-it-issued-while-active',
      '2s D5: no new sponsored activation can occur through a withdrawn entity',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('a-suspended-entity-produces-no-new-activation-through-a-code-it-issued-while-active',
      '2s D5: no new sponsored activation can occur through a withdrawn entity',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('a-resident-refused-after-the-withdrawal-holds-nothing',
      '2s D5: stopping the future means the entitlement is not granted, not that it is granted and then removed',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('a-resident-sponsored-before-the-withdrawal-still-holds-golden',
      '2s D5: entitlements ALREADY GRANTED to residents REMAIN INTACT. A resident is never stripped of course access because the government relationship later changed',
      'migration 0014 or 0020 is not applied, so no resident could be sponsored in the first place and this cannot be proved either way.');
    perform t.skip('the-sponsored-residents-attribution-survives-the-withdrawal',
      '2p: partner_redemptions is the append-only record of an entitlement that was granted',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('identity-state-and-partnership-state-are-two-separate-stored-facts',
      '2s D3 and 2p (ii): identity state stays separate from partnership state at every layer',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('a-verified-identity-with-no-partnership-is-an-ordinary-combination',
      '2p: four legitimate combinations, and verified-but-not-a-partner is one of them',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('control-a-verification-can-be-withdrawn-from-a-live-active-partner',
      '2s D4 and D5: the withdrawal has to work on the case that matters, an entity with an active partnership',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('re-verifying-identity-does-not-bring-the-partnership-back',
      '2p: identity verification NEVER activates a partnership',
      'migration 0014 or 0020 is not applied.');
    perform t.skip('re-verified-identity-still-grants-no-activation-while-the-partnership-is-suspended',
      '2p: only an ACTIVE partnership unlocks sponsored access',
      'migration 0014 or 0020 is not applied.');
    return;
  end if;

  v_active := t.part_status_token('active');
  v_state  := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_city   := t.gov_jur('municipality', v_state, 'Sponsorville');

  v_amy  := t.mk_account('admin');
  v_off  := t.mk_account('homeowner');
  v_off2 := t.mk_account('homeowner');

  -- The partner, built the whole way: claimed, verified through the real RPC,
  -- granted authority over ONE jurisdiction record by equality, and given an
  -- ACTIVE partnership. Every step is separate because every step is a separate
  -- decision in 2m and 2p.
  v_e := t.gov_entity(v_city, 'city', 'Sponsorville Planning');
  perform t.gov_claim(v_e);
  v_m := t.gov_member(v_e, v_off, false);
  perform t.x('service_role', null, format(
    'select public.admin_verify_government_membership(%L::uuid, %L::uuid, %L)',
    v_m, v_amy, 'the official domain and a call to the planning counter'));
  perform t.gov_grant(v_e, v_city, true);
  v_part := t.part_partnership(v_e, v_active, v_amy);

  -- A second entity that is VERIFIED and has NO partnership at all, which is one
  -- of 2p's four legitimate combinations and the cheapest proof that the two axes
  -- are genuinely independent rather than one being computed from the other.
  v_e_none := t.gov_entity(v_city, 'city', 'Sponsorville Building Safety');
  perform t.gov_claim(v_e_none);
  v_m_none := t.gov_member(v_e_none, v_off2, false);
  perform t.x('service_role', null, format(
    'select public.admin_verify_government_membership(%L::uuid, %L::uuid, %L)',
    v_m_none, v_amy, 'the official domain and the staff directory'));

  -- ── THE POSITIVE CONTROLS: the sponsorship has to work before its removal
  --    can mean anything ────────────────────────────────────────────────────
  begin
    v_token := t.part_access('public.partner_access_links', v_part, v_e, v_amy, v_city);
    v_err := null;
  exception when others then
    v_token := null; v_err := sqlerrm;
  end;
  v_ctl_link := v_token is not null;
  perform t.assert(
    'control-an-active-partner-can-issue-a-resident-link',
    '2p: only an ACTIVE partnership unlocks resident sponsored access, and an active one does. Without this, "a suspended entity cannot issue a link" would pass against a database where nobody can issue one',
    v_ctl_link,
    format('an active, verified partner holding a live grant on the jurisdiction could not mint a resident access link: %s', coalesce(v_err, 'no token returned')));

  begin
    v_code := t.part_access('public.partner_access_codes', v_part, v_e, v_amy, v_city);
    v_err := null;
  exception when others then
    v_code := null; v_err := sqlerrm;
  end;
  v_ctl_code := v_code is not null;
  perform t.assert(
    'control-an-active-partner-can-issue-a-resident-code',
    '2p: two distribution methods, ONE underlying system. A code must work while the partnership is active, or the code half of D5 proves nothing',
    v_ctl_code,
    format('an active, verified partner could not mint a resident access code: %s', coalesce(v_err, 'no code returned')));

  v_res_before := t.mk_account('homeowner');
  if v_ctl_link then
    v_r := t.part_redeem('link', v_token, v_res_before);
    v_ctl_grant := (v_r->>'ok')::boolean
                   and (v_r->'rows'->0->'result'->>'granted') = 'true'
                   and t.part_grant_of(v_res_before) = t.part_golden();
  end if;
  perform t.assert(
    'control-a-resident-redeems-the-link-and-holds-golden',
    '2p item 13: a valid active-partner LINK grants exactly the sponsored $79 Golden entitlement. This is the entitlement D5 says must survive, so it has to exist before anything can be said about its survival',
    v_ctl_grant,
    format('a resident entering through an active partner''s link does not end up holding Golden: redemption %s, the account now holds %L, expected %L. The assertion this whole block exists for would otherwise pass against a resident who was never sponsored.',
           coalesce(v_r->>'error', (v_r->'rows'->0->'result')::text, '<not attempted>'),
           coalesce(t.part_grant_of(v_res_before), '<null>'), t.part_golden()));

  v_ctl_active := (public.government_partnership_status(v_e) = 'active');
  perform t.assert(
    'control-the-partnership-is-active-before-the-withdrawal',
    '2p (ii): the partnership axis has its own state, and it reads ACTIVE while the sponsorship is live',
    v_ctl_active,
    format('government_partnership_status reports %L before any withdrawal, so a suspended reading afterwards would say nothing about the withdrawal',
           coalesce(public.government_partnership_status(v_e), '<null>')));

  v_controls := v_ctl_link and v_ctl_code and v_ctl_grant and v_ctl_active;

  -- Captured BEFORE the withdrawal, so "unchanged" is a comparison and not a
  -- guess about what the number ought to be.
  v_grant_before := t.part_grant_of(v_res_before);
  v_attr_before  := t.part_redemptions_for(v_res_before);

  -- ── THE WITHDRAWAL. One RPC, one column, and nothing else. ────────────────
  v_w := t.q('service_role', null, format(
    'select public.admin_withdraw_government_verification(%L::uuid, %L::uuid, %L) as result',
    v_e, v_amy, 'the city ended the programme and asked ADUAtlas to stop treating it as a verified account'));
  v_w_ok := (v_w->>'ok')::boolean and (v_w->'rows'->0->'result'->>'ok') = 'true';

  -- A SEPARATE CONTROL FROM THE ONE IN THE BLOCK ABOVE, and it exists because a
  -- mutation found the hole: withdrawing from an entity with a LIVE ACTIVE
  -- PARTNERSHIP is the case that can fail on its own. 2p's composite foreign key
  -- refuses an active partnership on an unverified entity, so without 0014's
  -- government_entities_partnership_cascade the identity update is rejected
  -- outright. Reported as a FAILURE rather than folded into the skips below,
  -- because "Amy cannot switch off a partner that is actually running" is a
  -- broken product and not an assertion that could not be made.
  perform t.assert(
    'control-a-verification-can-be-withdrawn-from-a-live-active-partner',
    '2s D4 and D5: the withdrawal has to work on the case that matters — an entity with an ACTIVE Education Partnership and residents already sponsored through it. 2p''s active_requires_verified_identity check refuses an active partnership on an unverified entity, so this path only works because 0014''s cascade suspends the partnership in the same statement',
    v_w_ok,
    format('admin_withdraw_government_verification refused to withdraw from an entity with an active partnership: %s. Every D5 assertion below would then be a skip, and a suite of skips is how a feature that cannot be operated at all reports as green.',
           coalesce(v_w->>'error', (v_w->'rows'->0->'result')::text, '<no result>')));

  -- ── the two axes: one of the four legitimate combinations, and it needs no
  --    withdrawal at all, so it is asserted outside the branch below ─────────
  perform t.assert(
    'a-verified-identity-with-no-partnership-is-an-ordinary-combination',
    '2p: four legitimate combinations, and "Verified Government Account but NOT an Education Partner" is one of them. An entity NEVER becomes a partner because its identity was verified',
    (select e.verification_status from public.government_entities e where e.id = v_e_none) = 'verified'
      and public.government_partnership_status(v_e_none) = 'none',
    format('a freshly verified entity with no partnership reads identity %L and partnership %L; verifying identity must create nothing on the partnership axis',
           (select e.verification_status from public.government_entities e where e.id = v_e_none),
           coalesce(public.government_partnership_status(v_e_none), '<null>')));

  if not v_controls or not v_w_ok then
    perform t.skip('withdrawing-identity-suspends-the-partnership-through-the-0014-cascade',
      '2s D5: the moment a verification is withdrawn, no new sponsored activation can occur through that entity',
      format('a positive control did not pass (link %s, code %s, resident grant %s, partnership active %s) or the withdrawal itself was refused (%s); nothing below would be evidence.',
             v_ctl_link, v_ctl_code, v_ctl_grant, v_ctl_active,
             coalesce(v_w->>'error', (v_w->'rows'->0->'result')::text, 'no result')));
    perform t.skip('the-partnership-suspension-carries-a-date-and-a-reason',
      '2p: a suspension always carries a date', 'a positive control did not pass, or the withdrawal was refused.');
    perform t.skip('a-suspended-entity-cannot-issue-a-new-resident-link',
      '2s D5: a withdrawn entity can issue NO new sponsored links',
      'the control proving an ACTIVE partner CAN issue one did not pass, so a refusal here would not be a boundary.');
    perform t.skip('a-suspended-entity-cannot-issue-a-new-resident-code',
      '2s D5: a withdrawn entity can issue NO new sponsored codes',
      'the control proving an ACTIVE partner CAN issue one did not pass.');
    perform t.skip('a-suspended-entity-produces-no-new-activation-through-a-link-it-issued-while-active',
      '2s D5: no new sponsored activation can occur through a withdrawn entity',
      'the control proving a resident CAN be sponsored did not pass, so a refusal here would not be a boundary.');
    perform t.skip('a-suspended-entity-produces-no-new-activation-through-a-code-it-issued-while-active',
      '2s D5: no new sponsored activation can occur through a withdrawn entity',
      'the control proving a resident CAN be sponsored did not pass.');
    perform t.skip('a-resident-refused-after-the-withdrawal-holds-nothing',
      '2s D5: stopping the future means not granting, rather than granting and removing',
      'a positive control did not pass.');
    perform t.skip('a-resident-sponsored-before-the-withdrawal-still-holds-golden',
      '2s D5: entitlements ALREADY GRANTED to residents REMAIN INTACT',
      format('a positive control did not pass: the resident held %L rather than %L before the withdrawal, so "they still hold it" cannot be asserted about an entitlement that was never granted.',
             coalesce(v_grant_before, '<null>'), t.part_golden()));
    perform t.skip('the-sponsored-residents-attribution-survives-the-withdrawal',
      '2p: partner_redemptions is the append-only record of an entitlement that was granted',
      'a positive control did not pass.');
    perform t.skip('identity-state-and-partnership-state-are-two-separate-stored-facts',
      '2s D3 and 2p (ii): identity state stays separate from partnership state at every layer',
      'the withdrawal did not happen, so the two states have not been made to disagree.');
    perform t.skip('re-verifying-identity-does-not-bring-the-partnership-back',
      '2p: identity verification NEVER activates a partnership',
      'the withdrawal did not happen, so there is no suspension to come back from.');
    perform t.skip('re-verified-identity-still-grants-no-activation-while-the-partnership-is-suspended',
      '2p: only an ACTIVE partnership unlocks sponsored access',
      'the withdrawal did not happen.');
  else
    select * into v_part_row from public.government_partnerships where id = v_part;

    perform t.assert(
      'withdrawing-identity-suspends-the-partnership-through-the-0014-cascade',
      '2s D5: the moment a verification is withdrawn, that entity can issue no new sponsored access and no new sponsored activation can occur through it. The withdrawal RPC performs ONE update on ONE identity column: 0014''s government_entities_partnership_cascade is what carries it to the partnership axis, so the two axes cannot grow two divergent implementations of the same rule',
      public.government_partnership_status(v_e) = 'suspended'
        and (select e.verification_status from public.government_entities e where e.id = v_e) = 'suspended',
      format('after the withdrawal the identity state is %L and the partnership state is %L. An identity move that does not reach the partnership leaves an ACTIVE partner hanging off an unverified institution, which is exactly what 2p''s composite foreign key and 0014''s cascade exist to prevent.',
             (select e.verification_status from public.government_entities e where e.id = v_e),
             coalesce(public.government_partnership_status(v_e), '<null>')));

    perform t.assert(
      'the-partnership-suspension-carries-a-date-and-a-reason',
      '2p: a suspension always carries a date, and unlike simply ending it carries a reason. A suspension nobody can explain is one nobody can lift',
      v_part_row.suspended_at is not null and nullif(btrim(coalesce(v_part_row.suspended_reason, '')), '') is not null,
      format('the suspended partnership records suspended_at %L and suspended_reason %L',
             coalesce(v_part_row.suspended_at::text, '<null>'), coalesce(v_part_row.suspended_reason, '<null>')));

    -- ── D5, THE FUTURE: nothing new can be minted or activated ─────────────
    begin
      perform t.part_access('public.partner_access_links', v_part, v_e, v_amy, v_city);
      v_err := null;
    exception when others then
      v_err := sqlerrm;
    end;
    perform t.assert(
      'a-suspended-entity-cannot-issue-a-new-resident-link',
      '2s D5: the moment a verification is withdrawn or suspended, that entity can issue NO new sponsored links. Stated separately from the code below because 2p promises two distribution methods and a boundary that holds on one of them is half a boundary',
      v_err is not null and v_err ~* '(active|verified)',
      coalesce(
        case when v_err is null then 'a new resident access LINK was minted for an entity whose identity verification has been withdrawn, so the withdrawal stops nothing and the partner can keep handing out sponsored access' end,
        format('the insert was refused, but with %L rather than a refusal naming the partnership state or the identity state. A refusal for an unrelated reason is not this boundary.', v_err)));

    begin
      perform t.part_access('public.partner_access_codes', v_part, v_e, v_amy, v_city);
      v_err := null;
    exception when others then
      v_err := sqlerrm;
    end;
    perform t.assert(
      'a-suspended-entity-cannot-issue-a-new-resident-code',
      '2s D5: the moment a verification is withdrawn or suspended, that entity can issue NO new sponsored codes',
      v_err is not null and v_err ~* '(active|verified)',
      coalesce(
        case when v_err is null then 'a new resident access CODE was minted for an entity whose identity verification has been withdrawn' end,
        format('the insert was refused with %L, which does not name the partnership or identity state', v_err)));

    v_res_link := t.mk_account('homeowner');
    v_r := t.part_redeem('link', v_token, v_res_link);
    perform t.assert(
      'a-suspended-entity-produces-no-new-activation-through-a-link-it-issued-while-active',
      '2s D5: NO new sponsored activation can occur through the entity. The link was minted legitimately while the partnership was active and was already in a resident''s hands, which is the real shape of this attack: the token is valid and the authority behind it is gone',
      (v_r->>'ok')::boolean and (v_r->'rows'->0->'result'->>'granted') = 'false',
      format('redeeming a still-live link from a withdrawn partner returned %s. A link minted before the withdrawal must stop working the moment the identity does.',
             coalesce((v_r->'rows'->0->'result')::text, v_r->>'error', '<no result>')));

    v_res_code := t.mk_account('homeowner');
    v_r := t.part_redeem('code', v_code, v_res_code);
    perform t.assert(
      'a-suspended-entity-produces-no-new-activation-through-a-code-it-issued-while-active',
      '2s D5 with 2p: two distribution methods, ONE underlying system, so the withdrawal has to close both. A code printed on a leaflet outlives the partnership that printed it',
      (v_r->>'ok')::boolean and (v_r->'rows'->0->'result'->>'granted') = 'false',
      format('redeeming a still-live code from a withdrawn partner returned %s',
             coalesce((v_r->'rows'->0->'result')::text, v_r->>'error', '<no result>')));

    perform t.assert(
      'a-resident-refused-after-the-withdrawal-holds-nothing',
      '2s D5: stopping the future means the entitlement is never granted, not that it is granted and then taken away. A refused redemption must leave the account exactly as it was',
      t.part_grant_of(v_res_link) = '<none>' and t.part_grant_of(v_res_code) = '<none>',
      format('after a refused redemption the two accounts hold %L and %L',
             coalesce(t.part_grant_of(v_res_link), '<null>'), coalesce(t.part_grant_of(v_res_code), '<null>')));

    -- =====================================================================
    -- THE ASSERTION THIS BLOCK EXISTS FOR.
    --
    -- D5 preserves the past. The resident entered through a link that was
    -- legitimate at the time, ADUAtlas granted the sponsored Golden entitlement
    -- once, and then the government relationship changed. None of that is the
    -- resident's doing and none of it may cost them their course access.
    -- =====================================================================
    perform t.assert(
      'a-resident-sponsored-before-the-withdrawal-still-holds-golden',
      '2s D5: entitlements ALREADY GRANTED to residents REMAIN INTACT. A resident is NEVER stripped of course access because the government relationship later changed: they did nothing wrong and the sponsorship was granted once. This is 2p''s definition-of-done item 23 applied to the identity axis',
      t.part_grant_of(v_res_before) = t.part_golden()
        and v_grant_before = t.part_golden(),
      format('a resident who held %L before the withdrawal now holds %L. Withdrawing a government identity verification has taken paid-for-by-somebody-else course access away from a homeowner who did nothing, which is the single way this feature can hurt a real person.',
             coalesce(v_grant_before, '<null>'), coalesce(t.part_grant_of(v_res_before), '<null>')));

    perform t.assert(
      'the-sponsored-residents-attribution-survives-the-withdrawal',
      '2p: partner_redemptions is the append-only record of an entitlement that WAS granted, with no revoked_at and no way to acquire one. The attribution is how ADUAtlas can still answer "where did this account''s Golden come from" after the partnership is gone, which decision 2r needs as well',
      t.part_redemptions_for(v_res_before) = v_attr_before
        and (select count(*)::int from public.partner_redemptions
              where app_user_id = v_res_before and entitlement_granted) = 1,
      format('the resident''s attribution count went from %s to %s, and %s granted row(s) remain',
             v_attr_before, t.part_redemptions_for(v_res_before),
             (select count(*)::int from public.partner_redemptions
               where app_user_id = v_res_before and entitlement_granted)));

    -- ── the two axes, side by side, disagreeing legitimately ───────────────
    perform t.assert(
      'identity-state-and-partnership-state-are-two-separate-stored-facts',
      '2s D3 and 2p (ii): identity state stays SEPARATE from partnership state at every layer. They are two columns on two tables with two vocabularies, and no surface may collapse them into one status',
      (select e.verification_status from public.government_entities e where e.id = v_e) = 'suspended'
        and public.government_partnership_status(v_e) = 'suspended'
        and t.reg_tokens('public.government_entities', 'verification_status')
            is distinct from t.reg_tokens('public.government_partnerships', t.part_status_col()),
      format('identity reads %L from government_entities and the partnership reads %L from government_partnerships, with vocabularies %s and %s. Two facts that happen to share a word are still two facts, and one pill cannot say both.',
             (select e.verification_status from public.government_entities e where e.id = v_e),
             coalesce(public.government_partnership_status(v_e), '<null>'),
             coalesce(t.reg_tokens('public.government_entities', 'verification_status')::text, '<none>'),
             coalesce(t.reg_tokens('public.government_partnerships', t.part_status_col())::text, '<none>')));

    -- ── and the asymmetry, on the way back ─────────────────────────────────
    perform t.x('service_role', null, format(
      'select public.admin_verify_government_membership(%L::uuid, %L::uuid, %L)',
      v_m, v_amy, 'the city reinstated the programme and confirmed the coordinator again'));

    perform t.assert(
      're-verifying-identity-does-not-bring-the-partnership-back',
      '2p: identity verification NEVER activates a partnership, and that holds on the way back as much as the first time. 0014''s cascade is deliberately one-directional: verification LEAVING verified suspends a partnership, verification ARRIVING does nothing. Reactivating is a separate, deliberate act with its own record',
      (select e.verification_status from public.government_entities e where e.id = v_e) = 'verified'
        and public.government_partnership_status(v_e) = 'suspended',
      format('after re-verification the identity reads %L and the partnership reads %L. A partnership that reactivates itself when identity comes back is a sponsorship ADUAtlas never agreed to switch on again.',
             (select e.verification_status from public.government_entities e where e.id = v_e),
             coalesce(public.government_partnership_status(v_e), '<null>')));

    v_res_after := t.mk_account('homeowner');
    v_r := t.part_redeem('link', v_token, v_res_after);
    perform t.assert(
      're-verified-identity-still-grants-no-activation-while-the-partnership-is-suspended',
      '2p: ONLY an active partnership unlocks resident sponsored access. Verified identity is a necessary condition and never a sufficient one, so the door stays shut until the partnership itself is reactivated',
      (v_r->>'ok')::boolean
        and (v_r->'rows'->0->'result'->>'granted') = 'false'
        and t.part_grant_of(v_res_after) = '<none>',
      format('with identity re-verified and the partnership still suspended, a redemption returned %s and the account holds %L',
             coalesce((v_r->'rows'->0->'result')::text, v_r->>'error', '<no result>'),
             coalesce(t.part_grant_of(v_res_after), '<null>')));
  end if;
end
$$;
