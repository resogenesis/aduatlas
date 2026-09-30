-- =============================================================================
-- INVARIANT (Richard's decision of 2026-09-27, migration 0023): ADMIN-COMPED
-- ACCESS IS ITS OWN ORIGIN. It may grant the intended LEVEL, it represents $0 of
-- customer payment, it is never revenue, it never earns purchase-based upgrade
-- credit, and level and origin are never conflated. This is decision 2r applied
-- to the second non-purchase path to paid_at.
--
-- THE DEFECT THIS FILE EXISTS TO KEEP CLOSED, live in RC2a:
--   the admin "grant a paid tier" control wrote paid_tier and paid_at and no
--   origin, so 0019's qualifying_paid_plan() rule 5 inferred a PURCHASE. A
--   comped Golden earned a real $79 Stripe coupon toward Platinum and was $79 of
--   Amy's revenue. 0019's header had said this would happen the day a second
--   non-purchase grant path appeared; the admin control was that path.
--
-- WHAT IS PROVED, group by group. Every negative group carries its own positive
-- control, for the reason 240's header gives: a file of NO-CREDIT assertions
-- passes perfectly against a function that answers null for everybody.
--   0  the subject exists (a FAILURE when missing, not a skip)
--   A  controls: a purchase still earns its credit and still records 'purchase',
--      and the comp writer really runs as the service role
--   B  a comp GRANTS THE LEVEL (the level predicates see Platinum)
--   C  a comp earns NO credit, at the server and on the page, and is not
--      revenue-eligible (the admin revenue figure sums qualifying_paid_plan)
--   D  a comp over a comp on a NEW tier stays a comp: the restatement past
--      0019's trigger, which clears a same-value origin when the tier moves
--   E  NOT A PERMANENT FLAG: a real purchase later on the same account earns
--      its own credit and is recorded as 'purchase'
--   F  a comp never paints over money: refused over a recorded or an inferred
--      purchase, nothing written; a refunded account can be comped
--   G  a comp over a sponsorship: allowed, the ledger survives, no credit
--   H  an admin revoke leaves the fact honest, and the stale comp never
--      survives into a later purchase or sponsorship
--   I  only the server can comp: no browser path, no unknown origin values
--   J  0019's backfill never overwrites a comp
--
-- HOW "NOTHING" IS WRITTEN: select coalesce(<basis>, 'NO-CREDIT'), exactly as
-- 240 does, so a missing row fails as '<null>' instead of passing.
--
-- NO DOLLAR FIGURE, for 240's reason: src/lib/plans.js is the one price list.
-- basis NO-CREDIT means the ladder receives no owned plan, so Stripe charges
-- full price and the admin revenue figure adds $0.
--
-- The fixtures from t.gov_jur through t.credit_page_sql are copied VERBATIM from
-- 240_upgrade_credit.sql (which copied them from 200 and 190), because every
-- invariant file must run standalone and in any order, including one at a time
-- against a target. `create or replace` makes an identical second definition a
-- no-op when the whole suite runs in one database.
-- =============================================================================
select t.suite('280 admin comp origin (2026-09-27)');


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

-- ── the fixtures of this file ───────────────────────────────────────────────
create or replace function t.comp_ready()
returns boolean
language sql
stable
as $fn$
  select t.has_column('public.users', 'paid_origin')
     and t.has_function('public.qualifying_paid_plan')
     and t.has_function('public.my_qualifying_paid_plan')
     and t.has_relation('public.homeowner_upgrade_basis')
     and t.has_function('public.admin_comp_entitlement')
     and coalesce((select pg_get_constraintdef(c.oid) like '%admin_comp%'
                     from pg_constraint c
                    where c.conname = 'users_paid_origin_known'
                      and c.conrelid = 'public.users'::regclass), false);
$fn$;

create or replace function t.comp_skip(p_group text)
returns void
language plpgsql
as $fn$
begin
  perform t.skip(p_group,
    'Richard 2026-09-27: admin-comped access is its own origin and is never money',
    'migration 0023 (users_paid_origin_known allowing admin_comp, public.admin_comp_entitlement) is not applied, so a comp cannot be recorded. Recorded as a SKIP and not a pass: without 0023 an admin grant is inferred as a purchase, earns upgrade credit and counts as revenue.');
end
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

-- THE REVOKE, the exact statement api/admin/_update_user.js sends for
-- { paid: false }: PATCH users?id=eq.<id> {paid_at: null}, as the service role.
create or replace function t.comp_revoke(p_user uuid)
returns jsonb
language sql
as $fn$
  select t.x('service_role', null, format('update public.users set paid_at = null where id = %L', p_user));
$fn$;

create or replace function t.comp_level_sql(p_user uuid)
returns text
language sql
stable
as $fn$
  select format(
    'select coalesce(paid_tier, ''NO-TIER'') || case when paid_at is not null and refunded_at is null then '' live'' else '' dead'' end from public.users where id = %L',
    p_user);
$fn$;

create or replace function t.comp_origin_sql(p_user uuid)
returns text
language sql
stable
as $fn$
  select format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', p_user);
$fn$;

-- What the admin revenue figure reads (api/admin/_overview.js through
-- accessOf()): the view row for this account, as the service role.
create or replace function t.comp_view_sql(p_user uuid)
returns text
language sql
stable
as $fn$
  select format(
    'select coalesce(paid_origin, ''NOT-RECORDED'') || '' / '' || coalesce(qualifying_paid_plan, ''NO-CREDIT'') from public.homeowner_upgrade_basis where user_id = %L',
    p_user);
$fn$;


-- ═══ 0. THE SUBJECT EXISTS ══════════════════════════════════════════════════
do $$
begin
  perform t.assert(
    'admin-comp-is-its-own-origin',
    'Richard 2026-09-27: admin-comped access has its own origin, admin_comp, and one server-side writer',
    t.comp_ready(),
    'migration 0023 is missing a piece. Expected users_paid_origin_known to allow admin_comp and public.admin_comp_entitlement(uuid, text) to exist, on top of 0019. Without them an admin grant records no origin and 0019 rule 5 counts it as money');
end
$$;


-- ═══ A. CONTROLS: MONEY STILL EARNS, THE WRITER REALLY RUNS ═════════════════
do $$
declare
  v_buyer uuid;
  v_fresh uuid;
  v_res   jsonb;
begin
  if not t.comp_ready() then
    perform t.comp_skip('a-controls');
    return;
  end if;

  -- A webhook-style purchase, stamped exactly as api/stripe-webhook.js stamps a
  -- collected payment (the upsert plus the restatement).
  v_buyer := t.mk_account('homeowner');
  perform t.credit_purchase(v_buyer, 'roadmap');

  perform t.assert_scalar(
    'webhook-purchase-still-records-purchase',
    '2r: a collected payment is recorded as a purchase at the source, unchanged by 0023',
    'service_role', null, t.comp_origin_sql(v_buyer),
    'purchase',
    'the webhook-shaped purchase no longer records purchase, so every NO-CREDIT below might be a broken basis rather than a comp');

  perform t.assert_scalar(
    'webhook-purchase-still-earns-its-credit',
    '2r: a homeowner who paid $79 for Golden still carries $79 toward Platinum after 0023',
    'service_role', null, t.credit_server_sql(v_buyer),
    'roadmap',
    'a real purchase lost its credit. 0023 rule 3b must deny the credit to comps only; a basis that denies everybody would make every NO-CREDIT in this file meaningless');

  -- The writer runs as the service role and grants something at all.
  v_fresh := t.mk_account('homeowner');
  v_res   := t.comp_grant(v_fresh, 'roadmap');
  perform t.assert(
    'service-role-can-comp',
    'Richard 2026-09-27: an admin (through the server, as the service role) may grant a comp',
    v_res->>'result' = 'comped',
    format('admin_comp_entitlement() did not comp a fresh account: %s. Every comp assertion below needs a comp to exist', v_res::text));
end
$$;


-- ═══ B. A COMP GRANTS THE LEVEL ═════════════════════════════════════════════
do $$
declare
  v_user uuid;
  v_res  jsonb;
begin
  if not t.comp_ready() then
    perform t.comp_skip('b-a-comp-grants-the-level');
    return;
  end if;

  v_user := t.mk_account('homeowner');

  -- Control: before the comp the account holds nothing, so "holds Platinum"
  -- after it is the comp's doing.
  perform t.assert_scalar(
    'comp-level-control-nothing-before',
    'the account starts with no entitlement',
    'authenticated', t.authid(v_user), 'select public.has_worksheet_entitlement()::text',
    'false',
    'the fresh account already held Platinum-level access, so the assertions below prove nothing');

  v_res := t.comp_grant(v_user, 'report');
  perform t.assert(
    'comp-reports-comped',
    'the writer says what it did',
    v_res->>'result' = 'comped' and v_res->>'paid_origin' = 'admin_comp' and v_res->>'paid_tier' = 'report',
    format('admin_comp_entitlement() answered %s', v_res::text));

  perform t.assert_scalar(
    'comp-grants-the-level',
    'Richard 2026-09-27: a comp MAY grant the intended entitlement level; a comped Platinum holds Platinum',
    'service_role', null, t.comp_level_sql(v_user),
    'report live',
    'the comp did not leave a live Platinum on the level columns. The level half of the comp is missing, so the homeowner was given nothing');

  perform t.assert_scalar(
    'comped-platinum-passes-the-level-predicate',
    '2r: level and origin are different facts; the level predicates read the level and are not changed by the origin',
    'authenticated', t.authid(v_user), 'select public.has_worksheet_entitlement()::text',
    'true',
    'a comped Platinum was refused the Platinum worksheets. Wiring the origin into an access predicate takes away what the admin granted, which conflates level and origin in the other direction');

  perform t.assert_scalar(
    'comp-records-admin-comp',
    'Richard 2026-09-27: the product records that an admin granted this, not that money bought it',
    'service_role', null, t.comp_origin_sql(v_user),
    'admin_comp',
    'the comp did not record its own origin. With NULL here 0019 rule 5 infers a purchase; with purchase here it is a recorded lie');
end
$$;


-- ═══ C. A COMP EARNS NO CREDIT AND IS NOT REVENUE ═══════════════════════════
do $$
declare
  v_gold uuid;
  v_plat uuid;
begin
  if not t.comp_ready() then
    perform t.comp_skip('c-a-comp-is-not-money');
    return;
  end if;

  v_gold := t.mk_account('homeowner');
  v_plat := t.mk_account('homeowner');
  perform t.comp_grant(v_gold, 'roadmap');
  perform t.comp_grant(v_plat, 'report');

  -- Control: both accounts really HOLD the comped level. Without this, an
  -- account the writer failed to comp holds nothing and reads NO-CREDIT for the
  -- wrong reason (found by mutation testing: with rule 3b removed the writer
  -- aborts, and these assertions passed on empty accounts).
  perform t.assert_scalar(
    'no-credit-control-comps-are-held',
    'Richard 2026-09-27: the accounts judged below hold a live comp, so NO-CREDIT is about the comp and not about an empty account',
    'service_role', null,
    format('select string_agg(coalesce(paid_tier, ''NO-TIER'') || ''/'' || coalesce(paid_origin, ''NOT-RECORDED'') || case when paid_at is not null and refunded_at is null then ''/live'' else ''/dead'' end, '' '' order by paid_tier) from public.users where id in (%L, %L)', v_gold, v_plat),
    'report/admin_comp/live roadmap/admin_comp/live',
    'one of the comps did not happen or did not record itself, so every NO-CREDIT below would be vacuous');

  perform t.assert_scalar(
    'comped-golden-earns-no-credit-at-checkout',
    'Richard 2026-09-27: a comp represents $0 of customer payment; a comped Golden pays the full $279 for Platinum',
    'service_role', null, t.credit_server_sql(v_gold),
    'NO-CREDIT',
    'THIS IS THE DEFECT. A basis of roadmap here means api/create-checkout.js mints a real $79 Stripe coupon for a plan an admin gave away');

  perform t.assert_scalar(
    'comped-platinum-earns-no-credit-at-checkout',
    'Richard 2026-09-27: a comped Platinum pays the full $500 for Concierge',
    'service_role', null, t.credit_server_sql(v_plat),
    'NO-CREDIT',
    'a comped Platinum carries a $279 credit toward Concierge that nobody paid');

  perform t.assert_scalar(
    'comped-golden-is-quoted-the-full-price',
    '2r: the pricing pages quote what checkout will charge; a comped homeowner is never shown a credit',
    'authenticated', t.authid(v_gold), t.credit_page_sql(),
    'NO-CREDIT',
    'my_qualifying_paid_plan() told the browser this comped account carries a credit, so Unlock.jsx and Dashboard.jsx would quote $200 and Stripe would charge $279 (or, with the defect, discount it)');

  perform t.assert_scalar(
    'comp-is-not-revenue-eligible',
    'Richard 2026-09-27: a comp is never revenue; the admin revenue figure sums qualifying_paid_plan from homeowner_upgrade_basis',
    'service_role', null, t.comp_view_sql(v_plat),
    'admin_comp / NO-CREDIT',
    'the view the admin overview reads shows this comp as money. api/admin/_overview.js adds the list price of qualifying_paid_plan, so a non-null basis here is $279 of revenue nobody paid');
end
$$;


-- ═══ D. A COMP OVER A COMP ON A NEW TIER STAYS A COMP ═══════════════════════
-- 0019's trigger clears paid_origin when the tier moves and the origin value is
-- unchanged. Postgres cannot tell a restated 'admin_comp' from an omitted one,
-- so the writer restates it in a second statement. Without that statement this
-- group reads NOT-RECORDED and the upgraded comp is an inferred $279 purchase.
do $$
declare
  v_user uuid;
  v_ctrl uuid;
  v_res  jsonb;
begin
  if not t.comp_ready() then
    perform t.comp_skip('d-comp-over-comp');
    return;
  end if;

  v_user := t.mk_account('homeowner');
  perform t.comp_grant(v_user, 'roadmap');
  v_res := t.comp_grant(v_user, 'report');

  perform t.assert(
    'comp-to-a-new-tier-is-applied',
    'an admin may move a comped account to another plan',
    v_res->>'result' = 'comped',
    format('admin_comp_entitlement() answered %s', v_res::text));

  perform t.assert_scalar(
    'comp-over-comp-keeps-admin-comp',
    'Richard 2026-09-27 and 0019: a comp moved to a new tier is still recorded as a comp',
    'service_role', null, t.comp_origin_sql(v_user),
    'admin_comp',
    'the second comp left the origin unrecorded: 0019''s trigger cleared the same-value restatement and nothing restated it');

  perform t.assert_scalar(
    'comp-over-comp-earns-no-credit',
    'Richard 2026-09-27: moving a comp up a tier never turns it into money',
    'service_role', null, t.credit_server_sql(v_user),
    'NO-CREDIT',
    'a comp moved from Golden to Platinum now carries a $279 credit toward Concierge. This is rule 5 inferring a purchase from the cleared origin');

  perform t.assert_scalar(
    'comp-over-comp-holds-the-new-level',
    'the level moved to what the admin chose',
    'service_role', null, t.comp_level_sql(v_user),
    'report live',
    'the second comp did not move the level');

  -- WHY the restatement exists, and proof that 0019's semantics are unchanged:
  -- a one-statement move that restates the same origin is still cleared.
  v_ctrl := t.mk_account('homeowner');
  perform t.comp_grant(v_ctrl, 'roadmap');
  update public.users set paid_tier = 'concierge', paid_origin = 'admin_comp' where id = v_ctrl;
  perform t.assert_scalar(
    'trigger-still-clears-an-unrestated-move',
    '0019 (kept by 0023): an update that moves the entitlement without changing the origin makes it unknown again',
    'service_role', null, t.comp_origin_sql(v_ctrl),
    'NOT-RECORDED',
    'a one-statement tier move kept its old origin. Either 0019''s origin-follows-tier trigger was changed or dropped, and with it the guarantee that a stale origin never describes a new entitlement');
end
$$;


-- ═══ E. NOT A PERMANENT FLAG: LATER MONEY EARNS ITS CREDIT ══════════════════
do $$
declare
  v_user uuid;
  v_top  uuid;
begin
  if not t.comp_ready() then
    perform t.comp_skip('e-later-money-earns-its-credit');
    return;
  end if;

  v_user := t.mk_account('homeowner');
  perform t.comp_grant(v_user, 'roadmap');

  perform t.assert_scalar(
    'later-purchase-control-comp-is-held',
    'Richard 2026-09-27: the account starts as a live comped Golden',
    'service_role', null,
    format('select coalesce(paid_tier, ''NO-TIER'') || '' / '' || coalesce(paid_origin, ''NOT-RECORDED'') || case when paid_at is not null and refunded_at is null then '' / live'' else '' / dead'' end from public.users where id = %L', v_user),
    'roadmap / admin_comp / live',
    'the comp did not happen, so the before and after states below prove nothing about a comp');

  perform t.assert_scalar(
    'later-purchase-control-no-credit-before-paying',
    'Richard 2026-09-27: before any money, the comped account carries nothing',
    'service_role', null, t.credit_server_sql(v_user),
    'NO-CREDIT',
    'the before state is wrong, so an after state that shows a credit would prove nothing about the purchase');

  -- The homeowner pays $279 for Platinum, stamped as the webhook stamps it.
  perform t.credit_purchase(v_user, 'report');

  perform t.assert_scalar(
    'comped-homeowner-earns-credit-for-later-money',
    '2r: not a permanent flag; the $279 this homeowner actually paid carries $279 toward Concierge',
    'service_role', null, t.credit_server_sql(v_user),
    'report',
    'THE NOT-A-PERMANENT-FLAG ASSERTION. NO-CREDIT here means the comp was implemented as a mark on the person, and a homeowner who paid $279 of their own money is denied the credit for it');

  perform t.assert_scalar(
    'later-purchase-is-recorded-as-a-purchase',
    '2r: the product records what the homeowner PAID; the comp does not survive into an entitlement money bought',
    'service_role', null, t.comp_origin_sql(v_user),
    'purchase',
    'the row still says admin_comp after a real purchase moved the tier. A stale origin is how a permanent flag gets in through the back door');

  -- The top rung reads the money too.
  v_top := t.mk_account('homeowner');
  perform t.comp_grant(v_top, 'report');
  perform t.credit_purchase(v_top, 'concierge');
  perform t.assert_scalar(
    'comped-platinum-then-bought-concierge-reads-the-money',
    '2r: a comped Platinum who pays for Concierge holds a bought Concierge',
    'service_role', null, t.comp_view_sql(v_top),
    'purchase / concierge',
    'the Concierge purchase after a comp is not recorded as money, so Amy''s revenue misses a real $500 sale');
end
$$;


-- ═══ F. A COMP NEVER PAINTS OVER MONEY ══════════════════════════════════════
do $$
declare
  v_bought uuid;
  v_legacy uuid;
  v_same   uuid;
  v_refund uuid;
  v_res    jsonb;
begin
  if not t.comp_ready() then
    perform t.comp_skip('f-a-comp-never-paints-over-money');
    return;
  end if;

  -- A recorded purchase.
  v_bought := t.mk_account('homeowner');
  perform t.credit_purchase(v_bought, 'roadmap');
  v_res := t.comp_grant(v_bought, 'report');
  perform t.assert(
    'comp-over-a-recorded-purchase-is-refused',
    '2r: a comp must not erase the record of money the homeowner paid, or their credit and Amy''s revenue lose it',
    v_res->>'result' = 'refused_bought' and v_res->>'qualifying_paid_plan' = 'roadmap',
    format('admin_comp_entitlement() over a bought Golden answered %s', v_res::text));
  perform t.assert_scalar(
    'refused-comp-writes-nothing',
    '2r: a refused comp leaves the purchase exactly as it was',
    'service_role', null,
    format('select paid_tier || '' / '' || coalesce(paid_origin, ''NOT-RECORDED'') || '' / '' || coalesce(public.qualifying_paid_plan(id), ''NO-CREDIT'') from public.users where id = %L', v_bought),
    'roadmap / purchase / roadmap',
    'the refused comp changed the bought Golden anyway');

  -- An inferred purchase (0019 rule 5: no origin recorded, no sponsorship).
  v_legacy := t.mk_account('homeowner');
  perform t.credit_purchase_legacy(v_legacy, 'roadmap');
  v_res := t.comp_grant(v_legacy, 'concierge');
  perform t.assert(
    'comp-over-an-inferred-purchase-is-refused',
    '2r and 2b: an entitlement that counts as money is not overwritten by a hand grant; the admin must take it away first, deliberately',
    v_res->>'result' = 'refused_bought',
    format('admin_comp_entitlement() over an origin-less Golden answered %s', v_res::text));
  perform t.assert_scalar(
    'refused-comp-over-inferred-writes-nothing',
    '2b: the refusal records nothing, not even a guess',
    'service_role', null,
    format('select paid_tier || '' / '' || coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_legacy),
    'roadmap / NOT-RECORDED',
    'the refused comp wrote to the inferred purchase');

  -- The same plan the account already holds: nothing to grant.
  v_same := t.mk_account('homeowner');
  perform t.credit_purchase(v_same, 'report');
  v_res := t.comp_grant(v_same, 'report');
  perform t.assert(
    'comp-of-the-plan-already-held-changes-nothing',
    '2r: a comp that adds nothing does not rewrite the origin of what is held',
    v_res->>'result' = 'unchanged'
      and t.scalar('service_role', null, t.comp_origin_sql(v_same)) = 'purchase',
    format('answered %s; origin now %s', v_res::text, coalesce(t.scalar('service_role', null, t.comp_origin_sql(v_same)), '<null>')));

  -- A refunded account holds nothing, so it may be comped.
  v_refund := t.mk_refunded_homeowner('report');
  v_res := t.comp_grant(v_refund, 'report');
  perform t.assert_scalar(
    'refunded-account-can-be-comped-and-earns-nothing',
    'Richard 2026-09-27: a comp may grant a level to an account whose money went back, and it is still not money',
    'service_role', null, t.comp_view_sql(v_refund),
    'admin_comp / NO-CREDIT',
    format('comping a refunded account answered %s', v_res::text));
end
$$;


-- ═══ G. A COMP OVER A SPONSORSHIP ═══════════════════════════════════════════
do $$
declare
  v_user uuid;
  v_same uuid;
  v_res  jsonb;
  v_sp   jsonb;
begin
  if not t.comp_ready() then
    perform t.comp_skip('g-comp-over-sponsorship');
    return;
  end if;

  v_user := t.mk_account('homeowner');
  v_sp   := t.credit_sponsor(v_user);
  perform t.assert(
    'comp-over-sponsorship-control-sponsored',
    '2p: the account starts as a genuinely sponsored Golden',
    coalesce((v_sp->>'granted')::boolean, false),
    format('redeem_partner_access() did not grant: %s', v_sp::text));

  v_res := t.comp_grant(v_user, 'report');
  perform t.assert_scalar(
    'comp-over-sponsorship-is-a-comp-and-earns-nothing',
    'Richard 2026-09-27 and 2r: a sponsored resident comped up to Platinum holds a comp, and neither half is money',
    'service_role', null, t.comp_view_sql(v_user),
    'admin_comp / NO-CREDIT',
    format('comping a sponsored Golden to Platinum answered %s', v_res::text));

  perform t.assert_count(
    'comp-over-sponsorship-keeps-the-attribution',
    '2p: partner_redemptions is append only; a comp never erases what a partnership earned',
    'service_role', null,
    format('select 1 from public.partner_redemptions where app_user_id = %L and entitlement_granted', v_user),
    1,
    'the granted sponsorship row is gone or duplicated after the comp');

  -- The sponsored plan itself: nothing to add, and the sponsorship stays recorded.
  v_same := t.mk_account('homeowner');
  perform t.credit_sponsor(v_same);
  v_res := t.comp_grant(v_same, 'roadmap');
  perform t.assert(
    'comp-of-the-sponsored-plan-changes-nothing',
    '2r: a comp that adds nothing does not rewrite a sponsorship into a comp',
    v_res->>'result' = 'unchanged'
      and t.scalar('service_role', null, t.comp_origin_sql(v_same)) = 'sponsorship',
    format('answered %s; origin now %s', v_res::text, coalesce(t.scalar('service_role', null, t.comp_origin_sql(v_same)), '<null>')));
end
$$;


-- ═══ H. AN ADMIN REVOKE LEAVES THE FACT HONEST ══════════════════════════════
do $$
declare
  v_user   uuid;
  v_again  uuid;
  v_bought uuid;
  v_sp     uuid;
  v_x      jsonb;
  v_res    jsonb;
  v_red    jsonb;
begin
  if not t.comp_ready() then
    perform t.comp_skip('h-revoke-is-honest');
    return;
  end if;

  v_user := t.mk_account('homeowner');
  perform t.comp_grant(v_user, 'report');
  v_x := t.comp_revoke(v_user);
  perform t.assert(
    'revoke-control-statement-ran',
    'the revoke the admin API sends is accepted for the service role',
    (v_x->>'ok')::boolean and (v_x->>'rowcount')::int = 1,
    format('the revoke statement answered %s', v_x::text));

  perform t.assert_scalar(
    'revoked-comp-holds-nothing',
    'an admin revoke takes the level away',
    'authenticated', t.authid(v_user), 'select public.has_worksheet_entitlement()::text',
    'false',
    'a revoked comp still passes the Platinum level predicate');

  perform t.assert_scalar(
    'revoked-comp-is-recorded-as-an-ended-comp',
    '2b and 2r: the record says what ended (a comp) and claims neither a purchase nor a refund',
    'service_role', null,
    format('select coalesce(paid_tier, ''NO-TIER'') || '' / '' || coalesce(paid_origin, ''NOT-RECORDED'') || '' / '' || case when paid_at is null then ''ended'' else ''live'' end || '' / '' || case when refunded_at is null then ''no refund'' else ''REFUND CLAIMED'' end from public.users where id = %L', v_user),
    'report / admin_comp / ended / no refund',
    'the revoke rewrote the record: it claimed a purchase, claimed a refund that never happened, or left the access live');

  perform t.assert_scalar(
    'revoked-comp-earns-nothing',
    '2r: nothing held, nothing credited',
    'service_role', null, t.credit_server_sql(v_user),
    'NO-CREDIT',
    'a revoked comp carries a credit');

  -- A real purchase of the SAME plan after the revoke: the stale 'admin_comp'
  -- must not deny credit for money.
  perform t.credit_purchase(v_user, 'report');
  perform t.assert_scalar(
    'purchase-after-a-revoked-comp-earns-its-credit',
    '2r: not a permanent flag; money paid after a revoked comp is money paid',
    'service_role', null, t.comp_view_sql(v_user),
    'purchase / report',
    'a homeowner who paid for Platinum after their comp was taken away is denied the credit, or the payment is not recorded');

  -- Re-comp after a revoke: 0019's trigger clears the kept 'admin_comp' when
  -- paid_at comes back, and the writer restates it.
  v_again := t.mk_account('homeowner');
  perform t.comp_grant(v_again, 'roadmap');
  perform t.comp_revoke(v_again);
  v_res := t.comp_grant(v_again, 'roadmap');
  perform t.assert_scalar(
    'recomp-after-revoke-is-a-comp',
    'Richard 2026-09-27: a comp given again is recorded as a comp again, never as an inferred purchase',
    'service_role', null, t.comp_view_sql(v_again),
    'admin_comp / NO-CREDIT',
    format('comping again after a revoke answered %s', v_res::text));

  -- A revoke of a bought plan keeps the purchase on record and claims no refund.
  v_bought := t.mk_paid_homeowner('roadmap');
  perform t.comp_revoke(v_bought);
  perform t.assert_scalar(
    'revoked-purchase-stays-a-purchase-on-record',
    '2r: taking access away does not rewrite what the homeowner paid, and does not claim money went back',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') || '' / '' || case when paid_at is null then ''ended'' else ''live'' end || '' / '' || case when refunded_at is null then ''no refund'' else ''REFUND CLAIMED'' end from public.users where id = %L', v_bought),
    'purchase / ended / no refund',
    'the revoke of a bought plan erased the purchase, stamped a comp, or claimed a refund');

  -- A sponsorship after a revoked comp: the stale comp does not survive into an
  -- entitlement it did not grant.
  v_sp := t.mk_account('homeowner');
  perform t.comp_grant(v_sp, 'roadmap');
  perform t.comp_revoke(v_sp);
  v_red := t.credit_sponsor(v_sp);
  perform t.assert(
    'sponsorship-after-revoked-comp-control-granted',
    '2p: a resident whose comp was taken away can redeem sponsored access',
    coalesce((v_red->>'granted')::boolean, false),
    format('redeem_partner_access() did not grant: %s', v_red::text));
  perform t.assert_scalar(
    'sponsorship-after-revoked-comp-is-a-sponsorship',
    '0019 and 2r: an origin describes the entitlement held now; the old comp is not carried into the sponsorship',
    'service_role', null, t.comp_view_sql(v_sp),
    'sponsorship / NO-CREDIT',
    'the sponsored Golden still reads as the comp that ended before it');
end
$$;


-- ═══ I. ONLY THE SERVER CAN COMP ════════════════════════════════════════════
do $$
declare
  v_me   uuid;
  v_auth uuid;
  v_res  jsonb;
begin
  if not t.comp_ready() then
    perform t.comp_skip('i-only-the-server-comps');
    return;
  end if;

  v_me   := t.mk_account('homeowner');
  v_auth := t.authid(v_me);

  -- Control: the service role can (group A proved it on another account; this
  -- proves it on THIS one, so the denials below are denials).
  v_res := t.comp_grant(v_me, 'roadmap');
  perform t.assert(
    'server-comp-control',
    'the service role reaches the writer',
    v_res->>'result' = 'comped',
    format('answered %s', v_res::text));

  -- The grant itself, not only its consequence. The writer runs with the
  -- caller's rights, so today a browser that reached it would still be stopped
  -- by the column grants on public.users. That is a second wall, not the first:
  -- found by mutation testing, granting EXECUTE to anon and authenticated
  -- passed every other assertion here.
  perform t.assert(
    'comp-writer-is-service-role-only',
    'authorization lives on the server: EXECUTE on the comp writer belongs to the service role alone',
    has_function_privilege('service_role', 'public.admin_comp_entitlement(uuid, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.admin_comp_entitlement(uuid, text)', 'execute')
      and not has_function_privilege('anon', 'public.admin_comp_entitlement(uuid, text)', 'execute'),
    format('EXECUTE on admin_comp_entitlement: service_role=%s authenticated=%s anon=%s',
           has_function_privilege('service_role', 'public.admin_comp_entitlement(uuid, text)', 'execute'),
           has_function_privilege('authenticated', 'public.admin_comp_entitlement(uuid, text)', 'execute'),
           has_function_privilege('anon', 'public.admin_comp_entitlement(uuid, text)', 'execute')));

  perform t.assert_denied(
    'homeowner-cannot-comp-themselves',
    'authorization lives on the server: no browser can grant itself a plan through the comp writer',
    'authenticated', v_auth,
    format('select public.admin_comp_entitlement(%L::uuid, ''concierge'')', v_me),
    'a signed-in homeowner executed admin_comp_entitlement()');

  perform t.assert_denied(
    'anon-cannot-comp',
    'authorization lives on the server: an anonymous caller has no route to a comp',
    'anon', null,
    format('select public.admin_comp_entitlement(%L::uuid, ''concierge'')', v_me),
    'anon executed admin_comp_entitlement()');

  perform t.assert_denied(
    'homeowner-cannot-write-admin-comp',
    '2r: the origin is written by the server, never by the browser, in either direction',
    'authenticated', v_auth,
    format('update public.users set paid_origin = ''admin_comp'' where auth_user_id = %L', v_auth),
    'a homeowner wrote users.paid_origin on their own row');

  perform t.assert_error(
    'origin-stays-a-closed-list',
    '2b: an origin is one of the recorded kinds or unknown; nothing else can be written',
    'service_role', null,
    format('update public.users set paid_origin = ''gift'' where id = %L', v_me),
    'users_paid_origin_known',
    'an origin outside purchase, sponsorship and admin_comp was accepted');

  perform t.assert_error(
    'comp-refuses-a-plan-that-does-not-exist',
    'a comp grants one of the three plans and nothing else',
    'service_role', null,
    format('select public.admin_comp_entitlement(%L::uuid, ''platinum_plus'')', v_me),
    'a comp grants one of the plans',
    'admin_comp_entitlement() accepted a tier that is not a plan');

  perform t.assert_error(
    'comp-refuses-an-unknown-account',
    'a comp is for an account that exists',
    'service_role', null,
    format('select public.admin_comp_entitlement(%L::uuid, ''roadmap'')', gen_random_uuid()),
    'no account with id',
    'admin_comp_entitlement() accepted an account id that does not exist');
end
$$;


-- ═══ J. 0019'S BACKFILL NEVER OVERWRITES A COMP ═════════════════════════════
do $$
declare
  v_user uuid;
begin
  if not t.comp_ready() then
    perform t.comp_skip('j-backfill-leaves-comps-alone');
    return;
  end if;

  v_user := t.mk_account('homeowner');
  perform t.comp_grant(v_user, 'concierge');
  perform public.backfill_paid_origin();

  perform t.assert_scalar(
    'backfill-leaves-a-comp-a-comp',
    '2r: the backfill fills what nobody stated and never turns a comp into a purchase',
    'service_role', null, t.comp_view_sql(v_user),
    'admin_comp / NO-CREDIT',
    'backfill_paid_origin() overwrote a recorded comp, so re-running it would hand every comped account a credit and count it as revenue');
end
$$;
