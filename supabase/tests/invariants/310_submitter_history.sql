-- =============================================================================
-- INVARIANT: a government submitter keeps seeing what they sent after the
-- entity's identity verification is withdrawn, and only that (R3-23 part c,
-- decided for RC4a; migration 0026).
--
-- Before 0026 the only read path was "a verified member of a verified entity",
-- so a withdrawal hid a person's own submissions and ADUAtlas's answers from
-- them. After it: the submitter reads their own rows, a withdrawn one still
-- reads as withdrawn, and they read nothing of a colleague's, nothing is
-- readable to anyone else, and the read grants no action: they cannot withdraw
-- or submit while the verification is withdrawn.
--
-- Carries its own copy of the government fixtures (taken from 200), because a
-- target run executes each file on its own and rolls it back.
-- =============================================================================
select t.suite('310 submitter history after a withdrawal');

-- ── government fixtures (copied from 200_partnership_and_sponsorship.sql) ──
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


do $$
declare
  v_admin  uuid := t.mk_account('admin');
  v_state  uuid;
  v_j      uuid;
  v_e      uuid;
  v_u1     uuid := t.mk_account('homeowner');   -- the submitter
  v_u2     uuid := t.mk_account('homeowner');   -- a colleague at the same entity
  v_home   uuid := t.mk_account('homeowner');   -- nobody in government
  v_s_kept uuid;   -- u1's, still submitted at the withdrawal
  v_s_wd   uuid;   -- u1's, withdrawn by u1 before the withdrawal
  v_s_col  uuid;   -- the colleague's
  v_e2     uuid;   -- a second entity, which stays verified
  v_u3     uuid := t.mk_account('homeowner');   -- a member there who leaves
  v_m3     uuid;
  v_s_left uuid;
  v_col    text := t.gov_submitter_col();
  v_topics text[];
begin
  select array_agg(key order by sort_order, key) into v_topics from public.regulatory_topics;
  v_state := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_j     := t.gov_jur('municipality', v_state, 'Historyville');
  v_e     := t.gov_entity(v_j, 'city', 'Historyville Planning');
  perform t.gov_claim(v_e);
  perform t.gov_verify(v_e);
  perform t.gov_grant(v_e, v_j, true);
  perform t.gov_member(v_e, v_u1);
  perform t.gov_member(v_e, v_u2);

  -- Three submissions, sent the way a member's browser sends them.
  perform t.assert_ok('fixture-u1-submits-1', 'fixture', 'authenticated', t.authid(v_u1), t.gov_submit_sql(v_j, v_e, v_u1, v_topics[1]));
  perform t.assert_ok('fixture-u1-submits-2', 'fixture', 'authenticated', t.authid(v_u1), t.gov_submit_sql(v_j, v_e, v_u1, v_topics[2]));
  perform t.assert_ok('fixture-u2-submits', 'fixture', 'authenticated', t.authid(v_u2), t.gov_submit_sql(v_j, v_e, v_u2, v_topics[3]));
  execute format('select id from public.regulatory_submissions where entity_id = %L and topic_key = %L', v_e, v_topics[1]) into v_s_kept;
  execute format('select id from public.regulatory_submissions where entity_id = %L and topic_key = %L', v_e, v_topics[2]) into v_s_wd;
  execute format('select id from public.regulatory_submissions where entity_id = %L and topic_key = %L', v_e, v_topics[3]) into v_s_col;
  perform t.assert_ok('fixture-u1-withdraws-one', 'fixture', 'authenticated', t.authid(v_u1),
    format('update public.regulatory_submissions set withdrawn_at = now() where id = %L', v_s_wd));

  -- ── the entity's identity verification is withdrawn (0020) ────────────────
  perform public.admin_withdraw_government_verification(v_e, v_admin, 'test: authority to represent the city withdrawn');
  perform t.assert_scalar(
    'withdrawal-took-effect',
    'fixture: the entity really is withdrawn, or nothing below proves anything',
    'service_role', null,
    format('select verification_status from public.government_entities where id = %L', v_e),
    'suspended',
    'the entity is not suspended');

  -- ── the submitter's own history stays readable ───────────────────────────
  perform t.assert_count(
    'submitter-reads-own-after-withdrawal',
    'R3-23c: a withdrawal stops the future and keeps the submitter''s view of the past',
    'authenticated', t.authid(v_u1),
    format('select 1 from public.regulatory_submissions where entity_id = %L', v_e),
    2,
    'the submitter cannot see their own submissions after the withdrawal (or sees a colleague''s)');

  perform t.assert_scalar(
    'withdrawn-submission-reads-as-withdrawn',
    'R3-23c: a submission the member withdrew still reads as withdrawn',
    'authenticated', t.authid(v_u1),
    format('select (withdrawn_at is not null)::text from public.regulatory_submissions where id = %L', v_s_wd),
    'true',
    'the submitter cannot see their withdrawn submission as withdrawn');

  -- ── and nothing more ──────────────────────────────────────────────────────
  perform t.assert_count(
    'colleague-submission-not-readable',
    'R3-23c: only what this person submitted, never a colleague''s',
    'authenticated', t.authid(v_u1),
    format('select 1 from public.regulatory_submissions where id = %L', v_s_col),
    0,
    'a de-verified member can read a colleague''s submission');

  perform t.assert_count(
    'stranger-reads-nothing',
    'R3-23c: nobody else reads the submitter''s history',
    'authenticated', t.authid(v_home),
    format('select 1 from public.regulatory_submissions where entity_id = %L', v_e),
    0,
    'an account with no government role can read the entity''s submissions');

  -- ── a person who LEFT (membership revoked, entity still verified) ─────────
  v_e2 := t.gov_entity(v_j, 'city', 'Historyville Building');
  perform t.gov_claim(v_e2);
  perform t.gov_verify(v_e2);
  perform t.gov_grant(v_e2, v_j, true);
  v_m3 := t.gov_member(v_e2, v_u3);
  perform t.assert_ok('fixture-u3-submits', 'fixture', 'authenticated', t.authid(v_u3), t.gov_submit_sql(v_j, v_e2, v_u3, v_topics[5]));
  execute format('select id from public.regulatory_submissions where entity_id = %L and topic_key = %L', v_e2, v_topics[5]) into v_s_left;
  perform t.gov_revoke(v_m3);
  -- ADUAtlas answers the submission after the person has gone.
  update public.regulatory_submissions set review_note = 'regress: reviewed after the member left' where id = v_s_left;

  perform t.assert_count(
    'revoked-member-reads-nothing',
    'R3-23c, 0012: a revoked member is out on the next statement; the history read is for a live membership only',
    'authenticated', t.authid(v_u3),
    format('select 1 from public.regulatory_submissions where id = %L', v_s_left),
    0,
    'a person whose membership was revoked still reads their submission and the review written after they left');

  -- ── the read grants no action ─────────────────────────────────────────────
  perform t.assert_changes_nothing(
    'withdrawn-member-cannot-withdraw',
    'R3-23c: actions stay restricted while the verification is withdrawn',
    'authenticated', t.authid(v_u1),
    format('update public.regulatory_submissions set withdrawn_at = now() where id = %L', v_s_kept),
    'a de-verified member withdrew a submission through the new read path');

  perform t.assert_denied(
    'withdrawn-member-cannot-submit',
    'R3-23c: actions stay restricted while the verification is withdrawn',
    'authenticated', t.authid(v_u1),
    t.gov_submit_sql(v_j, v_e, v_u1, v_topics[4]),
    'a de-verified member filed a new submission');
end
$$;
