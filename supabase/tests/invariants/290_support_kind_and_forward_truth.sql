-- =============================================================================
-- INVARIANT (migration 0024, RC3 staging rehearsal, R3-01 and R3-06):
--   C1  CONCIERGE WRITTEN SUPPORT IS A SERVER-SIDE ENTITLEMENT, AND A REFUND
--       REQUEST IS FOR MONEY THAT WAS PAID.
--   C2  forwarded_at MEANS ADUATLAS ACTUALLY FORWARDED THE INTRODUCTION.
--
-- THE DEFECTS THIS FILE EXISTS TO KEEP CLOSED, both live in RC3:
--   R3-01  0003's support_messages insert policy checked only "my own row,
--          written as the homeowner". A Golden account and an unpaid account,
--          with only the browser's tier copy forged, wrote into the $500
--          Concierge support queue (HTTP 201). Every other paid write refused.
--          Coupled: refund requests were filed into the same table by any payer,
--          so gating the table on Concierge alone would have broken them.
--   R3-06  0016's trigger stamped forwarded_at on ANY transition to 'sent'. A
--          manual "Introduction sent" in the console therefore recorded a
--          delivery that never happened, hid the Forward button and made the
--          real forward answer 409 "already forwarded".
--
-- WHAT IS PROVED, group by group.
--   0  the subject exists (a FAILURE when missing, not a skip)
--   A  the shape: kind is not null, defaults to 'support', holds two values;
--      the Concierge predicate is the same kind of object as 0013's and 0018's
--   B  the boundary is the database's: exactly ONE insert policy, the column
--      grants, no update or delete path for a client
--   C  THE MATRIX: every entitlement shape, both kinds, through the same
--      statement a browser sends. Each refusal must be the POLICY's refusal
--      (row-level security), never a missing grant or a broken test, and every
--      refusal is underwritten by an entitled shape succeeding with the same
--      statement
--   D  a writer that sends no kind is judged as 'support', the stricter rule
--   E  the homeowner reads their own messages of both kinds, including the
--      admin's replies, and nobody else's; the service role (the admin API)
--      can reply with either kind
--   F  a refund that lands ends the refund-request write and keeps the thread
--      readable
--   G  C2: a status change alone never records a delivery (a status-only move
--      into 'sent' is refused, so 'sent' and the date never disagree), never
--      blocks the real forward, and the real forward still stamps once and for
--      ever
--
-- THE EXPECTED MATRIX (support / refund_request):
--   unpaid                                   refused / refused
--   Golden, purchase recorded                refused / ALLOWED
--   Golden, purchase not recorded (rule 5)   refused / ALLOWED
--   Platinum, purchase                       refused / ALLOWED
--   Concierge, purchase                      ALLOWED / ALLOWED
--   Golden, sponsored (the real redeem path) refused / refused
--   Golden, sponsored, origin column cleared refused / refused   (the ledger)
--   Golden, admin comp                       refused / refused
--   Concierge, admin comp                    ALLOWED / refused   (level vs origin, 2r)
--   Concierge, refunded (webhook shape)      refused / refused
--   Concierge, refunded (both dates set)     refused / refused
--   admin account                            refused / refused
--   builder (pro) account                    refused / refused
--   sponsored Golden, then bought Platinum   refused / ALLOWED   (2r: not a flag)
--   comped Golden, then bought Concierge     ALLOWED / ALLOWED
--
-- The fixtures from t.gov_jur through t.credit_page_sql, and t.comp_grant, are
-- copied VERBATIM from 280_admin_comp_origin.sql (which copied them from 240,
-- 200 and 190), because every invariant file must run standalone and in any
-- order, including one at a time against a target. `create or replace` makes an
-- identical second definition a no-op when the whole suite runs in one database.
-- =============================================================================
select t.suite('290 support kind and forward truth (R3-01, R3-06)');


-- ── the fixtures copied from 240 ────────────────────────────────────────────
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
-- government's own public website.
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

create or replace function t.gov_claim(p_entity uuid)
returns void
language sql
as $fn$
  update public.government_entities set claimed_at = now(), claim_note = 'claimed through the form'
   where id = p_entity;
$fn$;

create or replace function t.gov_verify(p_entity uuid)
returns void
language sql
as $fn$
  update public.government_entities
     set verification_status = 'verified', verified_at = now()
   where id = p_entity;
$fn$;

-- A SPONSORED Golden, created THE WAY PRODUCTION CREATES ONE: a verified entity,
-- an ACTIVE Education Partnership, a live jurisdiction grant, a database-generated
-- resident access CODE, and then public.redeem_partner_access() itself. Nothing
-- here reaches around the grant path and writes paid_tier by hand, because the
-- whole point of the assertion is what that path leaves behind on the row.
--
-- Returns the redemption result so the group's positive control can assert that
-- the sponsorship actually happened before anything claims it earned no credit.
create or replace function t.credit_sponsor(p_user uuid)
returns jsonb
language plpgsql
as $fn$
declare
  v_az   uuid;
  v_city uuid;
  v_ent  uuid;
  v_part uuid;
  v_code text;
begin
  v_az   := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_city := t.gov_jur('municipality', v_az, 'Creditville');
  v_ent  := t.gov_entity(v_city, 'city', 'City of Creditville');
  perform t.gov_claim(v_ent);
  perform t.gov_verify(v_ent);

  insert into public.government_jurisdiction_grants (entity_id, jurisdiction_id, grant_basis)
  values (v_ent, v_city,
          'the regression suite granted this scope so a sponsored entitlement is created the way production creates one');

  insert into public.government_partnerships (entity_id, status, activated_at)
  values (v_ent, 'active', now())
  returning id into v_part;

  -- The code is the database's to generate; whatever is supplied is discarded, so
  -- the stored value is read back rather than assumed.
  insert into public.partner_access_codes (partnership_id, entity_id, jurisdiction_id, label)
  values (v_part, v_ent, v_city, 'regression suite')
  returning code into v_code;

  return public.redeem_partner_access('code', v_code, p_user);
end
$fn$;

-- A purchase, stamped the way api/stripe-webhook.js stamps one: paid_at, the
-- tier, and refunded_at cleared. It records no origin, because that file records
-- none — which is exactly the state 0019 has to be correct in.
-- A purchase, stamped exactly as api/stripe-webhook.js stamps a COLLECTED payment
-- since the RC1 launch gate (DEF-20): the upsert records paid_origin 'purchase',
-- then a restatement fills it back in where 0019's trigger cleared it because the
-- tier moved while the origin value stayed the same (an upgrade of a purchase).
create or replace function t.credit_purchase(p_user uuid, p_tier text)
returns void
language sql
as $fn$
  update public.users
     set paid_at = now(), paid_tier = p_tier, refunded_at = null, paid_origin = 'purchase'
   where id = p_user;
  update public.users set paid_origin = 'purchase'
   where id = p_user and paid_tier = p_tier and paid_at is not null and refunded_at is null and paid_origin is null;
$fn$;

-- A purchase in the shape every row written BEFORE the fix has: tier and date,
-- no origin. Rule 5 of qualifying_paid_plan() must keep crediting these.
create or replace function t.credit_purchase_legacy(p_user uuid, p_tier text)
returns void
language sql
as $fn$
  update public.users
     set paid_at = now(), paid_tier = p_tier, refunded_at = null
   where id = p_user;
$fn$;

-- A refund, both shapes. api/stripe-webhook.js nulls paid_at AND stamps
-- refunded_at; t.mk_refunded_homeowner leaves paid_at in place. Either half alone
-- must deny the credit, so both are exercised.
create or replace function t.credit_refund(p_user uuid, p_clear_paid_at boolean)
returns void
language plpgsql
as $fn$
begin
  if p_clear_paid_at then
    update public.users set paid_at = null, refunded_at = now() where id = p_user;
  else
    update public.users set refunded_at = now() where id = p_user;
  end if;
end
$fn$;

create or replace function t.credit_email(p_user uuid)
returns text
language sql
stable
as $fn$
  select email::text from public.users where id = p_user;
$fn$;

-- What api/create-checkout.js reads, spelled the way it reads it: the view, as
-- the service role, keyed on the address the caller proved with their token.
create or replace function t.credit_server_sql(p_user uuid)
returns text
language sql
stable
as $fn$
  select format(
    'select coalesce(qualifying_paid_plan, ''NO-CREDIT'') from public.homeowner_upgrade_basis where email = %L',
    t.credit_email(p_user));
$fn$;

-- What the pricing pages read: no arguments, the caller's own row.
create or replace function t.credit_page_sql()
returns text
language sql
immutable
as $fn$
  select 'select coalesce(public.my_qualifying_paid_plan(), ''NO-CREDIT'')'::text;
$fn$;


-- THE WRITER, called the way api/admin/_update_user.js calls it: an RPC as the
-- service role. Returns its jsonb answer, or {result: 'ERROR', ...} when the
-- statement was refused, so an assertion can say what went wrong.
create or replace function t.comp_grant(p_user uuid, p_tier text)
returns jsonb
language plpgsql
as $fn$
declare
  v jsonb;
begin
  v := t.q('service_role', null,
           format('select public.admin_comp_entitlement(%L::uuid, %L) as r', p_user, p_tier));
  if not (v->>'ok')::boolean then
    return jsonb_build_object('result', 'ERROR', 'error', v->>'error', 'sqlstate', v->>'sqlstate');
  end if;
  return v->'rows'->0->'r';
end
$fn$;


-- ── the fixtures of this file ───────────────────────────────────────────────
create or replace function t.sk_ready()
returns boolean
language sql
stable
as $fn$
  select t.has_column('public.support_messages', 'kind')
     and t.has_function('public.has_concierge_entitlement')
     and t.has_function('public.my_qualifying_paid_plan')
     and exists (select 1 from pg_constraint c
                  where c.conname = 'support_messages_kind_known'
                    and c.conrelid = 'public.support_messages'::regclass);
$fn$;

create or replace function t.sk_skip(p_group text)
returns void
language plpgsql
as $fn$
begin
  perform t.skip(p_group,
    'R3-01: Concierge written support and refund requests are gated in the database',
    'migration 0024 (support_messages.kind, public.has_concierge_entitlement) is not applied. Recorded as a SKIP and not a pass: without 0024 any signed-in account writes into the Concierge support queue.');
end
$fn$;

-- The statement the browser sends (src/lib/studies.js sendMessage), as the
-- signed-in homeowner. p_kind null leaves the column out, which is what every
-- client written before 0024 does. p_author defaults to 'homeowner', the only
-- author a browser may claim.
create or replace function t.sk_insert_sql(p_user uuid, p_kind text, p_body text, p_author text default 'homeowner')
returns text
language sql
stable
as $fn$
  select case
           when p_kind is null then
             format('insert into public.support_messages (user_id, author, body) values (%L, %L, %L)',
                    p_user, p_author, p_body)
           else
             format('insert into public.support_messages (user_id, author, body, kind) values (%L, %L, %L, %L)',
                    p_user, p_author, p_body, p_kind)
         end;
$fn$;

-- ALLOWED: the homeowner's own statement succeeds, writes one row, and the
-- homeowner reads it back with the kind that was asked for (the default
-- 'support' when no kind was sent).
create or replace function t.sk_expect_allowed(p_name text, p_rule text, p_user uuid, p_kind text, p_detail text)
returns void
language plpgsql
as $fn$
declare
  v_body text := 'sk ' || p_name || ' ' || t.nextlabel('msg');
  v      jsonb;
  v_back text;
begin
  v := t.x('authenticated', t.authid(p_user), t.sk_insert_sql(p_user, p_kind, v_body));
  if not (v->>'ok')::boolean or (v->>'rowcount')::bigint <> 1 then
    perform t.record(p_name, p_rule, 'fail',
      p_detail || format(' (refused with %s: %s)', coalesce(v->>'sqlstate', '-'), coalesce(v->>'error', 'wrote ' || coalesce(v->>'rowcount', '?') || ' rows')));
    return;
  end if;
  v_back := t.scalar('authenticated', t.authid(p_user),
    format('select kind from public.support_messages where body = %L', v_body));
  if v_back is distinct from coalesce(p_kind, 'support') then
    perform t.record(p_name, p_rule, 'fail',
      format('the write succeeded but the homeowner reads it back as kind %L, expected %L', coalesce(v_back, '<not readable>'), coalesce(p_kind, 'support')));
    return;
  end if;
  perform t.record(p_name, p_rule, 'pass', null);
end
$fn$;

-- REFUSED BY THE POLICY: the same statement, refused with the row-level
-- security message. A missing column grant ("permission denied") or a broken
-- statement is a different defect and fails this assertion, so a refusal here
-- always means the entitlement rule decided it.
create or replace function t.sk_expect_refused(p_name text, p_rule text, p_user uuid, p_kind text, p_detail text)
returns void
language plpgsql
as $fn$
begin
  perform t.assert_error(p_name, p_rule, 'authenticated', t.authid(p_user),
    t.sk_insert_sql(p_user, p_kind, 'sk ' || p_name || ' ' || t.nextlabel('msg')),
    'row-level security', p_detail);
end
$fn$;

-- The level and origin actually held, read as the service role, so a group can
-- prove its fixture is the shape it claims before judging the policy.
create or replace function t.sk_shape_sql(p_user uuid)
returns text
language sql
stable
as $fn$
  select format(
    'select coalesce(paid_tier, ''NO-TIER'') || case when paid_at is not null and refunded_at is null then '' live '' else '' dead '' end || coalesce(paid_origin, ''NOT-RECORDED'') || '' / '' || coalesce(public.qualifying_paid_plan(id), ''NO-MONEY'') from public.users where id = %L',
    p_user);
$fn$;

-- One row of the matrix: the fixture's shape is asserted first (a control),
-- then both kinds are judged. A fixture that is not the shape it claims makes
-- the two verdicts meaningless, so they are recorded as SKIPS in that case.
create or replace function t.sk_row(p_label text, p_user uuid, p_expect_shape text, p_support boolean, p_refund boolean, p_why text)
returns void
language plpgsql
as $fn$
declare
  v_shape text := t.scalar('service_role', null, t.sk_shape_sql(p_user));
  v_rule_s text := 'R3-01: a homeowner writes Concierge support (kind support) only while holding a live Concierge entitlement';
  v_rule_r text := 'R3-01 and 2r: a homeowner files a refund request (kind refund_request) only for a live entitlement that money bought';
begin
  perform t.assert(
    'shape-' || p_label,
    'the fixture is the entitlement shape the matrix row claims',
    v_shape is not distinct from p_expect_shape,
    format('the %s fixture reads %L, expected %L, so its row of the matrix proves nothing', p_label, coalesce(v_shape, '<no row>'), p_expect_shape));
  if v_shape is distinct from p_expect_shape then
    perform t.skip(p_label || '-support', v_rule_s, 'the fixture is not the shape this row is about');
    perform t.skip(p_label || '-refund-request', v_rule_r, 'the fixture is not the shape this row is about');
    return;
  end if;

  if p_support then
    perform t.sk_expect_allowed(p_label || '-support', v_rule_s, p_user, 'support',
      format('%s must be able to write Concierge support (%s)', p_label, p_why));
  else
    perform t.sk_expect_refused(p_label || '-support', v_rule_s, p_user, 'support',
      format('%s wrote into the Concierge support queue (%s)', p_label, p_why));
  end if;

  if p_refund then
    perform t.sk_expect_allowed(p_label || '-refund-request', v_rule_r, p_user, 'refund_request',
      format('%s must be able to ask for their money back (%s)', p_label, p_why));
  else
    perform t.sk_expect_refused(p_label || '-refund-request', v_rule_r, p_user, 'refund_request',
      format('%s filed a refund request for money nobody paid (%s)', p_label, p_why));
  end if;
end
$fn$;


-- ═══ 0. THE SUBJECT EXISTS ══════════════════════════════════════════════════
do $$
begin
  perform t.assert(
    'support-kind-exists',
    'R3-01: support_messages says which conversation a row belongs to, and Concierge has its own predicate',
    t.sk_ready(),
    'migration 0024 is missing a piece. Expected support_messages.kind with the support_messages_kind_known check, public.has_concierge_entitlement() and 0019''s public.my_qualifying_paid_plan(). Without them the support queue has no server-side gate');
end
$$;


-- ═══ A. THE SHAPE ═══════════════════════════════════════════════════════════
do $$
declare
  v_type    text;
  v_notnull boolean;
  v_default text;
  v_user    uuid;
  v_plat    uuid;
  v_fn      record;
begin
  if not t.sk_ready() then
    perform t.sk_skip('a-the-shape');
    return;
  end if;

  select format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
    into v_type, v_notnull, v_default
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.support_messages'::regclass and a.attname = 'kind' and not a.attisdropped;

  -- NOT NULL with a constant default is what makes every row that existed
  -- before 0024 read 'support': Postgres fills the default into existing rows in
  -- the same ALTER. So this catalog fact IS the backfill guarantee.
  perform t.assert(
    'kind-is-not-null-and-defaults-to-support',
    'R3-01: every row says which conversation it is; rows from before 0024, and writers that send no kind, are support',
    v_type = 'text' and v_notnull and v_default = '''support''::text',
    format('support_messages.kind is %s, not null = %s, default = %s; expected text, not null, default ''support''', v_type, v_notnull, coalesce(v_default, '<none>')));

  perform t.assert(
    'no-row-without-a-known-kind',
    'R3-01: every stored row belongs to one of the two conversations',
    not exists (select 1 from public.support_messages where kind is null or kind not in ('support', 'refund_request')),
    'a support_messages row carries a kind outside (support, refund_request)');

  -- The vocabulary is closed even for the service role: a third spelling would
  -- split a thread across two words and every reader would miss half of it.
  v_user := t.mk_paid_homeowner('concierge');
  perform t.assert_error(
    'kind-vocabulary-is-closed',
    'R3-01: kind is support or refund_request, nothing else, whoever writes it',
    'service_role', null,
    format('insert into public.support_messages (user_id, author, body, kind) values (%L, ''admin'', ''third kind'', ''chat'')', v_user),
    'support_messages_kind_known',
    'the table accepted a kind outside (support, refund_request)');

  perform t.assert_error(
    'kind-cannot-be-null',
    'R3-01: every row says which conversation it is',
    'service_role', null,
    format('insert into public.support_messages (user_id, author, body, kind) values (%L, ''admin'', ''no kind'', null)', v_user),
    'null value',
    'the table accepted a row with no kind');

  -- The Concierge predicate is built like 0013's and 0018's: no arguments, so no
  -- client value can steer it; SECURITY DEFINER with a fixed search_path, so the
  -- policy can call it and nobody can shadow public.users; not anonymous surface.
  select p.pronargs, p.prosecdef, p.provolatile::text as vol,
         coalesce(array_to_string(p.proconfig, ','), '') as cfg
    into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'has_concierge_entitlement';

  perform t.assert(
    'concierge-predicate-takes-no-arguments-and-is-pinned',
    'R3-01: the entitlement is read from trusted server state only, as 0013 and 0018 read theirs',
    v_fn.pronargs = 0 and v_fn.prosecdef and v_fn.vol = 's' and v_fn.cfg like '%search_path=public%',
    format('has_concierge_entitlement(): %s argument(s), security definer = %s, volatility = %s, config = %L. It must take none, be SECURITY DEFINER and STABLE, and pin search_path', v_fn.pronargs, v_fn.prosecdef, v_fn.vol, v_fn.cfg));

  perform t.assert_denied(
    'anon-cannot-ask-the-concierge-question',
    'R3-01: the entitlement predicate is not anonymous surface',
    'anon', null,
    'select public.has_concierge_entitlement()',
    'the anonymous role can execute has_concierge_entitlement()');

  perform t.assert_scalar(
    'concierge-predicate-answers-for-the-caller',
    'R3-01: a live Concierge buyer holds the Concierge entitlement',
    'authenticated', t.authid(v_user),
    'select public.has_concierge_entitlement()::text',
    'true',
    'a live Concierge purchase does not pass has_concierge_entitlement(), so every refusal below might be a predicate that refuses everybody');

  -- The fixture is made in its OWN statement: t.authid() is STABLE, so reading
  -- it in the statement that creates the account would see no row and ask the
  -- question as nobody, which passes for the wrong reason.
  v_plat := t.mk_paid_homeowner('report');
  perform t.assert_scalar(
    'concierge-predicate-is-not-platinum',
    'decision 2: Platinum ($279) does not include Concierge written support ($500)',
    'authenticated', t.authid(v_plat),
    'select public.has_concierge_entitlement()::text',
    'false',
    'a live Platinum purchase passes has_concierge_entitlement(); the predicate is the Platinum-or-Concierge one from 0013 or 0018');
end
$$;


-- ═══ B. THE BOUNDARY IS THE DATABASE'S ══════════════════════════════════════
do $$
declare
  v_pols text[];
  v_cols text[];
  v_user uuid;
  v_mid  uuid;
begin
  if not t.sk_ready() then
    perform t.sk_skip('b-the-boundary');
    return;
  end if;

  -- Policies are permissive and OR-ed: a SECOND insert policy for authenticated
  -- (or for public) would reopen the hole whatever the first one says.
  select coalesce(array_agg(policyname::text order by policyname), '{}')
    into v_pols
    from pg_policies
   where schemaname = 'public' and tablename = 'support_messages'
     and cmd in ('INSERT', 'ALL')
     and (roles && array['authenticated', 'public', 'anon']::name[]);

  perform t.assert(
    'exactly-one-client-insert-policy',
    'R3-01: one insert rule decides who may write into support; a second permissive policy would be OR-ed with it',
    v_pols = array['support_messages_insert_own'],
    format('client-facing insert policies on support_messages: %s. Expected exactly support_messages_insert_own', v_pols::text));

  select coalesce(array_agg(column_name::text order by column_name), '{}')
    into v_cols
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'support_messages'
     and grantee = 'authenticated' and privilege_type = 'INSERT';

  perform t.assert(
    'client-insert-columns-are-exactly-the-four',
    'R3-01: a browser names its own id, the author, the body and the kind, and nothing it could use to forge a date, a read receipt or an id',
    v_cols = array['author', 'body', 'kind', 'user_id'],
    format('authenticated may insert columns %s; expected {author,body,kind,user_id}', v_cols::text));

  perform t.assert(
    'no-client-update-or-delete-on-support',
    'R3-01: a row cannot be moved from one kind to the other, or removed, after the policy judged it',
    not exists (
      select 1 from information_schema.table_privileges
       where table_schema = 'public' and table_name = 'support_messages'
         and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type in ('UPDATE', 'DELETE'))
    and not exists (
      select 1 from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'support_messages'
         and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type = 'UPDATE'),
    'anon or authenticated holds UPDATE or DELETE on support_messages');

  perform t.assert_denied(
    'anon-cannot-write-support',
    'R3-01: the anonymous role writes nothing into support',
    'anon', null,
    format('insert into public.support_messages (user_id, author, body, kind) values (%L, ''homeowner'', ''anon'', ''support'')', t.mk_account('homeowner')),
    'the anonymous role can insert into support_messages');

  -- An entitled homeowner still cannot pose as ADUAtlas, write into somebody
  -- else's thread, or re-file a support question as a refund after the fact.
  v_user := t.mk_paid_homeowner('concierge');
  v_mid  := null;
  perform t.assert_error(
    'homeowner-cannot-write-as-the-admin-support',
    'R3-01: only the service role (the admin API) writes the ADUAtlas side of a thread',
    'authenticated', t.authid(v_user), t.sk_insert_sql(v_user, 'support', 'forged admin reply', 'admin'),
    'row-level security',
    'an entitled homeowner wrote a support row authored as ADUAtlas');

  perform t.assert_error(
    'homeowner-cannot-write-as-the-admin-refund',
    'R3-01: only the service role (the admin API) writes the ADUAtlas side of a thread',
    'authenticated', t.authid(v_user), t.sk_insert_sql(v_user, 'refund_request', 'forged refund answer', 'admin'),
    'row-level security',
    'an entitled homeowner wrote a refund row authored as ADUAtlas');

  perform t.assert_error(
    'homeowner-cannot-write-into-another-thread',
    'R3-01: a homeowner writes only their own thread',
    'authenticated', t.authid(v_user), t.sk_insert_sql(t.mk_paid_homeowner('concierge'), 'support', 'into someone else'),
    'row-level security',
    'an entitled homeowner wrote into another homeowner''s support thread');

  insert into public.support_messages (user_id, author, body, kind)
  values (v_user, 'homeowner', 'a question', 'support')
  returning id into v_mid;
  perform t.assert_changes_nothing(
    'homeowner-cannot-move-a-row-between-kinds',
    'R3-01: the kind a row was judged under is the kind it keeps',
    'authenticated', t.authid(v_user),
    format('update public.support_messages set kind = ''refund_request'' where id = %L', v_mid),
    'a homeowner changed the kind of a stored support row');
end
$$;


-- ═══ C. THE MATRIX ══════════════════════════════════════════════════════════
do $$
declare
  v_u   uuid;
  v_sp  jsonb;
  v_res jsonb;
begin
  if not t.sk_ready() then
    perform t.sk_skip('c-the-matrix');
    return;
  end if;

  -- unpaid
  v_u := t.mk_account('homeowner');
  perform t.sk_row('unpaid', v_u, 'NO-TIER dead NOT-RECORDED / NO-MONEY', false, false,
    'an account that bought nothing');

  -- Golden bought, the webhook shape since DEF-20 (origin recorded)
  v_u := t.mk_account('homeowner');
  perform t.credit_purchase(v_u, 'roadmap');
  perform t.sk_row('golden-purchase', v_u, 'roadmap live purchase / roadmap', false, true,
    'a $79 Golden buyer: no Concierge support, and a refund of the $79 they paid');

  -- Golden bought before the webhook recorded an origin (0019 rule 5)
  v_u := t.mk_account('homeowner');
  perform t.credit_purchase_legacy(v_u, 'roadmap');
  perform t.sk_row('golden-purchase-origin-not-recorded', v_u, 'roadmap live NOT-RECORDED / roadmap', false, true,
    'an ordinary buyer whose row predates the recorded origin still paid');

  -- Platinum bought
  v_u := t.mk_account('homeowner');
  perform t.credit_purchase(v_u, 'report');
  perform t.sk_row('platinum-purchase', v_u, 'report live purchase / report', false, true,
    'Platinum does not include Concierge written support');

  -- Concierge bought
  v_u := t.mk_account('homeowner');
  perform t.credit_purchase(v_u, 'concierge');
  perform t.sk_row('concierge-purchase', v_u, 'concierge live purchase / concierge', true, true,
    'the plan that sells written support, bought with money');

  -- Golden sponsored, created the way production creates it
  v_u  := t.mk_account('homeowner');
  v_sp := t.credit_sponsor(v_u);
  perform t.assert('sponsored-control-granted', '2p: the fixture is a genuinely sponsored Golden',
    coalesce((v_sp->>'granted')::boolean, false), format('redeem_partner_access() did not grant: %s', v_sp::text));
  perform t.sk_row('golden-sponsored', v_u, 'roadmap live sponsorship / NO-MONEY', false, false,
    'a city paid for the education; the resident paid nothing to refund');

  -- Golden sponsored, the origin column cleared: only the ledger says so (0019 rule 2)
  v_u  := t.mk_account('homeowner');
  v_sp := t.credit_sponsor(v_u);
  update public.users set paid_origin = null where id = v_u;
  perform t.sk_row('golden-sponsored-ledger-only', v_u, 'roadmap live NOT-RECORDED / NO-MONEY', false, false,
    'the partner_redemptions ledger is evidence enough that no money was paid');

  -- Golden comped by an admin (0023)
  v_u   := t.mk_account('homeowner');
  v_res := t.comp_grant(v_u, 'roadmap');
  perform t.sk_row('golden-comp', v_u, 'roadmap live admin_comp / NO-MONEY', false, false,
    'an admin comp is $0 of customer payment');

  -- Concierge comped by an admin: the LEVEL is Concierge, the ORIGIN is not money
  v_u   := t.mk_account('homeowner');
  v_res := t.comp_grant(v_u, 'concierge');
  perform t.sk_row('concierge-comp', v_u, 'concierge live admin_comp / NO-MONEY', true, false,
    '2r: level and origin are different facts. A comped Concierge holds Concierge, so gets the support an admin granted, and paid nothing, so has nothing to refund');

  -- Concierge refunded, the shape api/stripe-webhook.js writes (paid_at null)
  v_u := t.mk_account('homeowner');
  perform t.credit_purchase(v_u, 'concierge');
  perform t.credit_refund(v_u, true);
  perform t.sk_row('concierge-refunded-webhook-shape', v_u, 'concierge dead purchase / NO-MONEY', false, false,
    'a refunded purchase is no longer a live entitlement');

  -- Concierge refunded with both dates set
  v_u := t.mk_account('homeowner');
  perform t.credit_purchase(v_u, 'concierge');
  perform t.credit_refund(v_u, false);
  perform t.sk_row('concierge-refunded-both-dates', v_u, 'concierge dead purchase / NO-MONEY', false, false,
    'refunded_at alone is enough to end the entitlement');

  -- an admin account holding no plan of its own
  v_u := t.mk_account('admin');
  perform t.sk_row('admin-account', v_u, 'NO-TIER dead NOT-RECORDED / NO-MONEY', false, false,
    'the admin role is not a Concierge entitlement; ADUAtlas answers through the service role, not by writing as a homeowner');

  -- a builder account
  v_u := t.mk_account('pro');
  perform t.sk_row('builder-account', v_u, 'NO-TIER dead NOT-RECORDED / NO-MONEY', false, false,
    'a builder has no homeowner plan');

  -- sponsored Golden who later BOUGHT Platinum (2r: not a permanent flag)
  v_u  := t.mk_account('homeowner');
  v_sp := t.credit_sponsor(v_u);
  perform t.credit_purchase(v_u, 'report');
  perform t.sk_row('sponsored-then-bought-platinum', v_u, 'report live purchase / report', false, true,
    '2r: sponsorship describes one entitlement; the Platinum this resident bought is money they can ask back');

  -- comped Golden who later BOUGHT Concierge
  v_u   := t.mk_account('homeowner');
  v_res := t.comp_grant(v_u, 'roadmap');
  perform t.credit_purchase(v_u, 'concierge');
  perform t.sk_row('comped-then-bought-concierge', v_u, 'concierge live purchase / concierge', true, true,
    '0023: a comp is not a permanent flag; the Concierge bought afterwards is a purchase');
end
$$;


-- ═══ D. A WRITER THAT SENDS NO KIND ═════════════════════════════════════════
-- Every client written before 0024 (src/lib/studies.js sendMessage) sends no
-- kind. It must be judged by the STRICTER rule, so the default can never turn
-- into a way round the Concierge gate, and the Concierge customer it was written
-- for keeps working unchanged.
do $$
declare
  v_conc   uuid;
  v_golden uuid;
begin
  if not t.sk_ready() then
    perform t.sk_skip('d-no-kind-sent');
    return;
  end if;

  v_conc := t.mk_account('homeowner');
  perform t.credit_purchase(v_conc, 'concierge');
  perform t.sk_expect_allowed(
    'no-kind-from-concierge-is-support',
    'R3-01: the existing /support client keeps working for the customer it was built for',
    v_conc, null,
    'a Concierge customer''s message with no kind was refused or not stored as support');

  v_golden := t.mk_account('homeowner');
  perform t.credit_purchase(v_golden, 'roadmap');
  perform t.sk_expect_refused(
    'no-kind-from-golden-is-refused-as-support',
    'R3-01: leaving the kind out is judged as Concierge support, the stricter rule, never the refund rule',
    v_golden, null,
    'a Golden buyer wrote into the Concierge support queue by leaving the kind out (the RC3 defect, reached through the default)');

  perform t.sk_expect_refused(
    'no-kind-from-unpaid-is-refused',
    'R3-01: an account that bought nothing writes nothing into support',
    t.mk_account('homeowner'), null,
    'an unpaid account wrote into the Concierge support queue (the RC3 defect exactly as journey j7 reproduced it)');
end
$$;


-- ═══ E. READS: BOTH KINDS, OWN ROWS ONLY; THE ADMIN CAN ANSWER EITHER ═══════
do $$
declare
  v_home  uuid;
  v_other uuid;
  v_ctl   jsonb;
begin
  if not t.sk_ready() then
    perform t.sk_skip('e-reads-and-replies');
    return;
  end if;

  v_home := t.mk_account('homeowner');
  perform t.credit_purchase(v_home, 'concierge');

  -- The homeowner writes one of each kind, through the policy.
  perform t.x('authenticated', t.authid(v_home), t.sk_insert_sql(v_home, 'support', 'e: a support question'));
  perform t.x('authenticated', t.authid(v_home), t.sk_insert_sql(v_home, 'refund_request', 'e: a refund request'));

  -- The admin API answers each thread with its own kind, as the service role.
  v_ctl := t.x('service_role', null,
    format('insert into public.support_messages (user_id, author, body, kind) values (%L, ''admin'', ''e: support answer'', ''support''), (%L, ''admin'', ''e: refund answer'', ''refund_request'')', v_home, v_home));
  perform t.assert(
    'admin-api-can-answer-either-kind',
    'C1: an admin reply is written with the kind of the thread it answers',
    (v_ctl->>'ok')::boolean and (v_ctl->>'rowcount')::bigint = 2,
    format('the service role could not write an admin reply of each kind: %s', v_ctl::text));

  perform t.assert_scalar(
    'homeowner-reads-both-kinds-and-both-replies',
    'C1: the homeowner reads their own messages of both kinds, including what ADUAtlas wrote back',
    'authenticated', t.authid(v_home),
    'select string_agg(kind || '':'' || author, '','' order by kind, author) from public.support_messages',
    'refund_request:admin,refund_request:homeowner,support:admin,support:homeowner',
    'the homeowner does not see exactly their four rows, both kinds, both authors. A reply the customer cannot read never reached them (journey j5)');

  v_other := t.mk_account('homeowner');
  perform t.credit_purchase(v_other, 'concierge');
  perform t.assert_count(
    'another-homeowner-reads-none-of-it',
    'Concierge written support and refund requests are private to the customer',
    'authenticated', t.authid(v_other),
    format('select 1 from public.support_messages where user_id = %L', v_home),
    0,
    'a homeowner can read another homeowner''s support or refund thread');
end
$$;


-- ═══ F. A REFUND THAT LANDS ═════════════════════════════════════════════════
do $$
declare
  v_home uuid;
begin
  if not t.sk_ready() then
    perform t.sk_skip('f-refund-lands');
    return;
  end if;

  v_home := t.mk_account('homeowner');
  perform t.credit_purchase(v_home, 'roadmap');
  perform t.sk_expect_allowed(
    'refund-lands-control-request-filed',
    'R3-01: a Golden buyer files a refund request',
    v_home, 'refund_request',
    'the refund request could not be filed, so nothing below is about a real thread');
  insert into public.support_messages (user_id, author, body, kind)
  values (v_home, 'admin', 'f: your refund is on its way', 'refund_request');

  -- api/stripe-webhook.js charge.refunded
  perform t.credit_refund(v_home, true);

  perform t.assert_count(
    'refunded-customer-still-reads-the-refund-thread',
    'C1: the homeowner reads their own messages of both kinds, including after the refund',
    'authenticated', t.authid(v_home),
    'select 1 from public.support_messages where kind = ''refund_request''',
    2,
    'after the refund the customer can no longer read the answer to their refund request');

  perform t.sk_expect_refused(
    'refunded-customer-files-no-second-refund-request',
    'R3-01 and 2r: once the money has gone back there is no live paid entitlement to refund',
    v_home, 'refund_request',
    'a refunded customer filed another refund request');
end
$$;


-- ═══ G. C2: forwarded_at IS WHAT ADUATLAS DID, NOT WHAT A STATUS SAYS ══════
-- The two writes below are spelled the way the admin API sends them:
--   intro-update  (manual status):  update({ status })            .eq(id)
--   intro-forward (the real one):   update({ status: 'sent', forwarded_at })
--                                   .eq(id).is('forwarded_at', null)
do $$
declare
  v_b      uuid;
  v_home   uuid;
  v_intro  uuid;
  v_fwd    jsonb;
  v_first  text;
  v_again  text;
  v_status text;
begin
  if not t.has_column('public.intro_requests', 'forwarded_at') then
    perform t.assert('forward-truth-subject-exists',
      'C2: intro_requests.forwarded_at records a real forward', false,
      'intro_requests.forwarded_at does not exist; 0016 is not applied');
    return;
  end if;

  v_b    := t.mk_builder();
  v_home := t.mk_paid_homeowner('roadmap');
  perform t.x('authenticated', t.authid(v_home),
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, ''g: please introduce us'')', v_home, v_b));
  select id into v_intro from public.intro_requests where user_id = v_home and builder_id = v_b;

  perform t.assert('forward-truth-control-intro-exists',
    'C2: the fixture introduction exists and is waiting',
    v_intro is not null, 'the homeowner could not request an introduction, so nothing below is about a real row');
  if v_intro is null then return; end if;

  -- The manual "Introduction sent" (journeys j3 and j5): the exact write
  -- builders/intro-update sends, status only, as the service role. It must not
  -- record a delivery (RC3 stamped one), and it must not leave the row claiming
  -- 'sent' with no delivery behind it either (0016's rule, kept honestly): the
  -- database refuses it.
  perform t.assert_error(
    'manual-status-sent-is-refused',
    'C2 and 2i: status sent means ADUAtlas forwarded the introduction; a status change alone cannot say so',
    'service_role', null,
    format('update public.intro_requests set status = ''sent'' where id = %L', v_intro),
    'only when ADUAtlas forwarded it',
    'a status-only move into sent was accepted');
  perform t.assert_scalar(
    'manual-status-sent-records-no-delivery',
    'C2: forwarded_at means ADUAtlas actually forwarded the message. A manual status change is never a delivery',
    'service_role', null,
    format('select coalesce(status, ''<null>'') || '' / '' || coalesce(forwarded_at::text, ''NOT-FORWARDED'') from public.intro_requests where id = %L', v_intro),
    'requested / NOT-FORWARDED',
    'after a manual status change to sent the row claims a delivery: either forwarded_at was stamped (RC3: the console hides Forward and the homeowner is told the builder has it when nothing was sent) or the row reads sent with no delivery behind it');

  -- Moving the status around by hand never stamps either, and the other manual
  -- statuses still work (the refusal is about 'sent' only).
  perform t.assert_ok('manual-decline-still-works', 'C2: requested and declined remain an admin''s to choose',
    'service_role', null, format('update public.intro_requests set status = ''declined'' where id = %L', v_intro));
  perform t.assert_ok('manual-reopen-still-works', 'C2: requested and declined remain an admin''s to choose',
    'service_role', null, format('update public.intro_requests set status = ''requested'' where id = %L', v_intro));
  perform t.x('service_role', null, format('update public.intro_requests set status = ''sent'' where id = %L', v_intro));
  perform t.assert_scalar(
    'no-sequence-of-manual-statuses-records-a-delivery',
    'C2: only the forward path records a delivery',
    'service_role', null,
    format('select (forwarded_at is null and status <> ''sent'')::text from public.intro_requests where id = %L', v_intro),
    'true',
    'a sequence of manual status changes stamped forwarded_at or left the row reading sent');

  -- The real forward still lands after the manual status (it was refused 409 in RC3).
  v_fwd := t.x('service_role', null,
    format('update public.intro_requests set status = ''sent'', forwarded_at = now() where id = %L and forwarded_at is null', v_intro));
  perform t.assert(
    'real-forward-still-lands-after-a-manual-status',
    'C2: a manual status change never blocks the real forward',
    (v_fwd->>'ok')::boolean and (v_fwd->>'rowcount')::bigint = 1,
    format('the forward path''s own write (filtered on forwarded_at is null) matched %s row(s): %s. In RC3 the manual status had already stamped the row, so the real forward answered 409 already forwarded', coalesce(v_fwd->>'rowcount', '0'), coalesce(v_fwd->>'error', 'no error')));

  select forwarded_at::text, status into v_first, v_status from public.intro_requests where id = v_intro;
  perform t.assert(
    'real-forward-records-the-delivery',
    'C2: the forward path records the delivery, status and date together',
    v_first is not null and v_status = 'sent',
    format('after the forward the row reads status %L, forwarded_at %L', v_status, coalesce(v_first, '<null>')));

  -- First write wins and never cleared, exactly as 0016 wrote them.
  perform t.x('service_role', null,
    format('update public.intro_requests set status = ''sent'', forwarded_at = now() + interval ''3 days'' where id = %L', v_intro));
  perform t.x('service_role', null,
    format('update public.intro_requests set forwarded_at = null where id = %L', v_intro));
  perform t.x('service_role', null,
    format('update public.intro_requests set status = ''declined'' where id = %L', v_intro));
  select forwarded_at::text into v_again from public.intro_requests where id = v_intro;
  perform t.assert(
    'the-delivery-date-is-the-first-and-stays',
    '2h and C2: a delivery that happened stays recorded; a second forward, a clear or a later status change does not move it',
    v_again is not distinct from v_first,
    format('forwarded_at moved from %L to %L', v_first, coalesce(v_again, '<null>')));

  -- The homeowner reads their own delivery fact (the portal can tell them).
  perform t.assert_scalar(
    'the-homeowner-can-read-a-real-delivery',
    '2h: the homeowner can tell a forwarded introduction from a waiting one',
    'authenticated', t.authid(v_home),
    format('select (forwarded_at is not null)::text from public.intro_requests where id = %L', v_intro),
    'true',
    'the homeowner cannot read the delivery date of their own introduction');

  -- Standing guard: no client writes forwarded_at (220 proves the rest).
  perform t.assert_denied(
    'homeowner-cannot-record-a-delivery',
    'C2: only the forward path records a delivery',
    'authenticated', t.authid(v_home),
    format('update public.intro_requests set forwarded_at = now() where id = %L', v_intro),
    'a homeowner can write forwarded_at on their own introduction');
end
$$;
