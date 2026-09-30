-- =============================================================================
-- INVARIANT (locked decision 2r, D2): THE UPGRADE CREDIT IS COMPUTED FROM
-- QUALIFYING MONEY THE HOMEOWNER ACTUALLY PAID.
--
-- THE DEFECT THIS FILE EXISTS TO KEEP CLOSED, which was live when it was written:
--   0014's redeem_partner_access() granted a sponsored Golden with
--       update public.users set paid_tier = 'roadmap', paid_at = now()
--   and api/create-checkout.js read exactly paid_tier, paid_at and refunded_at.
--   A SPONSORED Golden was therefore byte for byte a PURCHASED Golden, the
--   credit ladder in src/lib/plans.js returned $79, and Stripe minted a real
--   coupon against money the homeowner never paid. A city sponsoring a resident's
--   education was silently buying that resident $79 off a $279 Platinum.
--
-- WHAT 2r DECIDES, and the half that is easy to get wrong:
--   Sponsored access carries no monetary upgrade-credit value BY ITSELF. And,
--   explicitly: "This is not a permanent 'sponsored user gets no credit' flag,
--   and implementing it as one would be wrong: a sponsored homeowner may later
--   make a qualifying purchase and must receive credit for that money."
--   So GROUP C is not a nicety. A pass on GROUP B bought by marking the PERSON
--   is a fail of this decision, and GROUP C is the assertion that catches it.
--
-- ── WHY THERE IS A POSITIVE CONTROL IN EVERY GROUP ──────────────────────────
-- The headline assertions here are negative: the basis must be NOTHING, the role
-- must be refused. A file of negative assertions passes perfectly against a
-- feature that returns null for everybody, or against a function that does not
-- exist. This repository has already produced an RLS infinite-recursion bug that
-- a negative test reported as green, because "this role sees nothing" and "this
-- query crashed" look identical from outside. So every group proves the ALLOWED
-- path first:
--
--   A  a PURCHASED Golden HAS the credit basis, and a purchased Platinum has the
--      next rung, so a null in B is a decision and not a dead function
--   B  the sponsorship actually happened and actually granted the Golden LEVEL,
--      so "no credit" is not "no entitlement"
--   C  the same account's basis was null before the purchase and is the bought
--      tier after it
--   D  the account held the credit before the refund took it away
--   E  a homeowner CAN read their own basis, so a refusal below is a refusal
--   F  the backfill fills something at all before it is asked what it left alone
--
-- ── WHY THERE IS NO DOLLAR FIGURE IN THIS FILE ──────────────────────────────
-- Deliberate, and it is the design rather than a gap. src/lib/plans.js is the one
-- place a price is written (its own header says so) and upgradeCreditCents()
-- credits min(owned.priceCents, target.priceCents) — Golden's $7,900 toward
-- Platinum's $27,900. A copy of 7900 in SQL would be a second price list to keep
-- in step, which is exactly the class of drift this suite exists to prevent.
-- What the database owns is the INPUT that ladder receives: which plan qualifying
-- money bought, or nothing. So the mapping asserted below is:
--
--   basis 'roadmap'  -> upgradeCreditCents('roadmap','report')    = $79 credit, $200 due
--   basis 'report'   -> upgradeCreditCents('report','concierge')  = $279 credit, $221 due
--   basis NO-CREDIT  -> no owned plan is passed at all            = $0 credit, full price
--
-- and every assertion names the money consequence in its rule text so a failure
-- reads as "a sponsored homeowner is being charged $200 for a $279 plan" rather
-- than as "expected null, got roadmap".
--
-- ── HOW A "NOTHING" ASSERTION IS WRITTEN HERE ───────────────────────────────
-- Never as an expected SQL null. t.assert_scalar cannot tell "the query returned
-- one row holding null" from "the query returned no rows at all", and those are
-- different outcomes: the second one would mean the fixture never existed. Every
-- basis assertion therefore reads
--     select coalesce(<basis>, 'NO-CREDIT')
-- so a missing row fails with 'expected NO-CREDIT, got <null>' instead of passing
-- for the wrong reason.
--
-- ── WHAT IS PROBED AND WHY IT SKIPS ─────────────────────────────────────────
-- The subject is migration 0019, so its absence is a FAILURE (the first
-- assertion), not a skip. Having failed loudly once, the remaining groups skip
-- with that reason rather than erroring file-wide, because a crashed file proves
-- nothing about the groups that did not depend on it.
--
-- The t.gov_* fixtures below are copied from 200_partnership_and_sponsorship.sql
-- (which copied them from 190) rather than moved into helpers/, because every
-- invariant file has to run standalone and in any order; `create or replace`
-- makes the second, identical definition a no-op. The reason is written out at
-- the top of 180 and in the README's "Adding a test".
-- =============================================================================
select t.suite('240 upgrade credit (2r)');


-- ── the fixtures ────────────────────────────────────────────────────────────
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

create or replace function t.credit_ready()
returns boolean
language sql
stable
as $fn$
  select t.has_column('public.users', 'paid_origin')
     and t.has_function('public.qualifying_paid_plan')
     and t.has_function('public.my_qualifying_paid_plan')
     and t.has_function('public.backfill_paid_origin')
     and t.has_relation('public.homeowner_upgrade_basis');
$fn$;

create or replace function t.credit_skip(p_group text)
returns void
language plpgsql
as $fn$
begin
  perform t.skip(p_group,
    '2r: the upgrade credit is computed from qualifying money the homeowner actually paid',
    'migration 0019 (users.paid_origin, qualifying_paid_plan, my_qualifying_paid_plan, backfill_paid_origin, homeowner_upgrade_basis) is not applied, so the credit basis cannot be asked for. Recorded as a SKIP and not a pass: without 0019 a sponsored Golden is byte-identical to a purchased one and Stripe is minting coupons for money nobody paid.');
end
$fn$;


-- ═══ 0. THE SUBJECT EXISTS ══════════════════════════════════════════════════
-- A failure, not a skip: 0019 is what this file is about.
do $$
begin
  perform t.assert(
    'origin-separated-from-level',
    '2r: entitlement LEVEL and entitlement ORIGIN are different facts and the schema holds both',
    t.credit_ready(),
    'migration 0019 is missing a piece. Expected users.paid_origin, public.qualifying_paid_plan(uuid), public.my_qualifying_paid_plan(), public.backfill_paid_origin() and the public.homeowner_upgrade_basis view. Without all five, api/create-checkout.js is back to reading paid_tier alone and a sponsored Golden buys a $79 discount nobody paid for');
end
$$;


-- ═══ A. POSITIVE CONTROL: PURCHASED MONEY EARNS THE CREDIT ═════════════════
-- FIRST, and first on purpose. Every "NO-CREDIT" assertion below is worthless
-- unless this passes: a basis function that returned null for everybody would
-- satisfy groups B, C and D and would quietly charge every legitimate upgrader
-- full price.
do $$
declare
  v_gold   uuid;
  v_plat   uuid;
  v_legacy uuid;
  v_upg    uuid;
begin
  if not t.credit_ready() then
    perform t.credit_skip('a-purchased-money-earns-the-credit');
    return;
  end if;

  v_gold := t.mk_paid_homeowner('roadmap');
  v_plat := t.mk_paid_homeowner('report');

  -- The assertion the whole file hangs off: what the server will read at checkout.
  perform t.assert_scalar(
    'purchased-golden-earns-the-golden-credit',
    '2r: a homeowner who PAID $79 for Golden carries $79 toward Platinum, so the upgrade costs $200',
    'service_role', null, t.credit_server_sql(v_gold),
    'roadmap',
    'api/create-checkout.js reads homeowner_upgrade_basis.qualifying_paid_plan and hands it to upgradeCreditCents(). A basis of NO-CREDIT here means every legitimate Golden buyer is being charged the full $279 for Platinum');

  perform t.assert_scalar(
    'purchased-platinum-earns-the-platinum-credit',
    '2r: a homeowner who PAID $279 for Platinum carries $279 toward Concierge, so the upgrade costs $221',
    'service_role', null, t.credit_server_sql(v_plat),
    'report',
    'the second rung of the ladder. Asserted separately from Golden so that a null in group B cannot be explained by a function that only ever answers for one tier');

  -- The page and the server must agree, because a page that quotes a price
  -- checkout will not honour is the visible half of this defect.
  perform t.assert_scalar(
    'page-and-server-agree-for-a-purchase',
    '2r: src/pages/Unlock.jsx and Dashboard.jsx quote the price the server will charge',
    'authenticated', t.authid(v_gold), t.credit_page_sql(),
    'roadmap',
    'my_qualifying_paid_plan() disagreed with homeowner_upgrade_basis for the same account. The two must read one rule or the quoted price and the charged price will drift again');

  -- EXPECTATION CORRECTED WHILE WRITING THIS FILE, and the correction is the
  -- interesting part, so it is written down rather than quietly adjusted.
  --
  -- This assertion first claimed that a fresh purchase RECORDS paid_origin =
  -- 'purchase'. It does not, and it must not. api/stripe-webhook.js writes
  -- paid_at, paid_tier and refunded_at and nothing else, and 0019 deliberately
  -- does NOT stamp 'purchase' from a trigger on that write: a trigger cannot
  -- tell a payment from any other way a row comes to hold paid_at, so stamping
  -- 'purchase' by default would fail OPEN — the next non-purchase grant path
  -- ever added would arrive pre-certified as money, which is precisely the
  -- defect 2r exists to close, rebuilt one layer down. Sponsorship is inferable
  -- from hard evidence (an append-only ledger row); a purchase is not.
  --
  -- So a purchase made today carries NO recorded origin, and the credit comes
  -- from rule 5 of qualifying_paid_plan(): a live paid entitlement with no
  -- sponsorship against it is money paid. Both halves of that are asserted.
  -- RESTATED at the RC1 launch gate (DEF-20). This assertion used to expect
  -- NOT-RECORDED, because api/stripe-webhook.js wrote no origin; its own failure
  -- text said to update it to 'purchase' once the webhook recorded the origin at
  -- the source, which it now does for a collected payment. What stays forbidden is
  -- a TRIGGER stamping 'purchase' by default: 'default-origin-is-not-a-purchase'
  -- below still proves an origin-less write stays NULL.
  perform t.assert_scalar(
    'a-fresh-purchase-records-purchase',
    '2r: api/stripe-webhook.js records that a collected payment is a purchase, at the source',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_gold),
    'purchase',
    'a purchase stamped the way the webhook now stamps a collected payment does not read purchase, so the upgrade credit and Amy''s revenue figure are back to inferring it');

  -- Rows written before the fix carry no origin. They must keep their credit.
  v_legacy := t.mk_account('homeowner');
  perform t.credit_purchase_legacy(v_legacy, 'roadmap');
  perform t.assert_scalar(
    'default-origin-is-not-a-purchase',
    '2b: nothing stamps an origin by default; a write that records none leaves it unknown',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_legacy),
    'NOT-RECORDED',
    'a write that recorded no origin now reads as a purchase. If a TRIGGER is stamping it, a default has become a claim: any future non-purchase grant would arrive certified as money');

  perform t.assert_scalar(
    'an-unrecorded-purchase-still-earns-its-credit',
    '2r: every buyer from before the webhook recorded origins keeps their credit',
    'service_role', null, t.credit_server_sql(v_legacy),
    'roadmap',
    'a legacy purchase, whose origin is NOT recorded, must still carry the $79. This is qualifying_paid_plan() rule 5: a live paid entitlement with no granted sponsorship against it is money paid. If this fails, every pre-fix buyer is charged full price to upgrade');

  -- An upgrade of a recorded purchase. 0019's trigger clears the origin when the
  -- tier moves and the origin value is restated unchanged; the webhook's second
  -- statement fills it back in. Without that statement this reads NOT-RECORDED.
  v_upg := t.mk_account('homeowner');
  perform t.credit_purchase(v_upg, 'roadmap');
  perform t.credit_purchase(v_upg, 'report');
  perform t.assert_scalar(
    'an-upgrade-of-a-recorded-purchase-stays-a-purchase',
    '2r: Golden bought, then Platinum bought, is still recorded as money paid',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_upg),
    'purchase',
    'the upgrade left the origin unrecorded: the trigger cleared it and nothing restated it, so a real upgrade leans on the inference');

  -- And the recorded form works, which is the path api/stripe-webhook.js should
  -- take: once it writes the origin at the source, rule 5 can be tightened to
  -- "unknown, therefore no credit" and this assertion is what keeps the credit.
  update public.users set paid_origin = 'purchase' where id = v_gold;
  perform t.assert_scalar(
    'a-recorded-purchase-earns-its-credit',
    '2r: a purchase recorded explicitly qualifies on the record rather than on the inference',
    'service_role', null, t.credit_server_sql(v_gold),
    'roadmap',
    'an explicitly recorded purchase lost its credit. Rule 4 of qualifying_paid_plan() is the forward path for api/stripe-webhook.js and it must already work before that file changes');
end
$$;


-- ═══ B. A SPONSORED GOLDEN EARNS NOTHING ═══════════════════════════════════
do $$
declare
  v_user uuid;
  v_res  jsonb;
begin
  if not t.credit_ready() then
    perform t.credit_skip('b-sponsored-access-earns-nothing');
    return;
  end if;

  v_user := t.mk_account('homeowner');
  v_res  := t.credit_sponsor(v_user);

  -- ── the positive control: the sponsorship HAPPENED ──────────────────────
  -- Without these two, "this account earns no credit" is satisfied by an account
  -- that was never sponsored, or by a redemption path that silently refused.
  perform t.assert(
    'sponsorship-actually-granted',
    '2p: an active Education Partner''s CODE grants exactly the sponsored Golden entitlement',
    coalesce((v_res->>'granted')::boolean, false),
    format('redeem_partner_access() did not grant: %s. Every assertion in this group is about an account that HOLDS sponsored Golden, so a refused redemption makes them all vacuous', v_res::text));

  perform t.assert_scalar(
    'sponsored-golden-holds-the-level',
    '2p item 17 and 2s (D5): a sponsored resident really does hold Golden; nothing here takes education away',
    'service_role', null,
    format('select paid_tier || case when paid_at is not null then '' live'' else '' dead'' end from public.users where id = %L', v_user),
    'roadmap live',
    'the sponsored LEVEL is missing, so this group would be proving "no credit" about an account with no entitlement at all — which is not the property 2r is about');

  -- ── the defect, closed ──────────────────────────────────────────────────
  perform t.assert_scalar(
    'sponsored-golden-earns-no-credit-at-checkout',
    '2r: sponsored access carries no monetary upgrade-credit value; the homeowner pays the full $279 for Platinum',
    'service_role', null, t.credit_server_sql(v_user),
    'NO-CREDIT',
    'THIS IS THE DEFECT. A basis of ''roadmap'' here means api/create-checkout.js mints a real $79 Stripe coupon for money the homeowner never paid, because a city sponsored their education');

  perform t.assert_scalar(
    'sponsored-golden-is-quoted-the-full-price',
    '2r: the pricing pages quote what checkout will charge; a sponsored homeowner is never shown $200',
    'authenticated', t.authid(v_user), t.credit_page_sql(),
    'NO-CREDIT',
    'the browser was told this account carries a credit. Unlock.jsx and Dashboard.jsx would print "$200 after your $79 credit" and Stripe would charge $279');

  perform t.assert_scalar(
    'sponsorship-is-recorded-as-a-sponsorship',
    '2r: the product records what a homeowner PAID separately from what tier they HOLD',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_user),
    'sponsorship',
    'the grant left no record of its own origin. 0019 PART 4 stamps it from the attribution row in the same transaction; if this fails the recorded fact has stopped being written and only the derived one remains');

  -- ── the guarantee does not depend on that record ─────────────────────────
  -- Clear the column and ask again. public.partner_redemptions is append only,
  -- has no revoked_at and no delete path for any role, so the sponsorship is
  -- permanent evidence. If the credit could be unlocked by clearing one nullable
  -- column, a wrong backfill or a careless admin update would hand out money.
  update public.users set paid_origin = null where id = v_user;
  perform t.assert_scalar(
    'sponsorship-denied-by-evidence-not-only-by-the-column',
    '2r: the credit is denied by the sponsorship LEDGER, so clearing a nullable column cannot buy a discount',
    'service_role', null, t.credit_server_sql(v_user),
    'NO-CREDIT',
    'with users.paid_origin cleared the account earned a credit again, so the whole guarantee rests on one writable column. It must also follow from public.partner_redemptions, which is append-only and cannot be erased');

  -- ── and the two entitlements are identical on the OLD columns ────────────
  -- The reason this migration had to exist, pinned so nobody "simplifies" the
  -- fix by making a sponsorship look different at the LEVEL axis — which would
  -- break 2p instead, by giving sponsored residents something other than Golden.
  -- ── and the partnership's LATER fate changes nothing here ────────────────
  -- 2s (D5) and 2p item 23: withdrawing a verification or suspending a
  -- partnership stops the FUTURE and preserves the PAST. A resident is never
  -- stripped of course access because their city's relationship with ADUAtlas
  -- ended, and — the half that is easy to miss — they do not acquire a CREDIT
  -- either. qualifying_paid_plan() deliberately reads partner_redemptions and
  -- never joins government_partnerships.status, so there is no state of the
  -- partnership that turns a sponsorship back into money. The plausible-looking
  -- implementation, "a sponsored entitlement counts while its partnership is
  -- active", would hand a $79 coupon to every resident of a suspended partner.
  update public.government_partnerships
     set status = 'suspended', suspended_at = now(),
         suspended_reason = 'the regression suite suspended this partnership to prove a resident is neither stripped nor credited'
   where id = (v_res->>'partnership_id')::uuid;

  perform t.assert_scalar(
    'a-suspended-partnership-still-earns-the-resident-nothing',
    '2s (D5): suspension stops new sponsored activations and never turns an old sponsorship into money',
    'service_role', null, t.credit_server_sql(v_user),
    'NO-CREDIT',
    'the resident acquired a credit when their city''s partnership was suspended. The credit basis must not read government_partnerships.status: no change to the government relationship can make a past sponsorship into money the homeowner paid');

  perform t.assert_scalar(
    'a-suspended-partnership-does-not-strip-the-resident',
    '2s (D5) and 2p item 23: entitlements already granted to residents remain intact',
    'service_role', null,
    format('select paid_tier || case when paid_at is not null then '' live'' else '' dead'' end from public.users where id = %L', v_user),
    'roadmap live',
    'the resident lost their Golden because their city''s partnership was suspended. They did nothing wrong and the sponsorship was granted once');

  perform t.assert_scalar(
    'level-is-identical-origin-is-not',
    '2r: LEVEL and ORIGIN are different facts — sponsorship grants the same Golden level and different origin',
    'service_role', null,
    format('select paid_tier || '' / '' || coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_user),
    'roadmap / NOT-RECORDED',
    'the sponsored row no longer reads as a live Golden on the level columns. A fix that changes what a sponsored resident HOLDS breaks 2p (exactly the Golden entitlement) while claiming to fix 2r');
end
$$;


-- ═══ C. NOT A PERMANENT FLAG: LATER MONEY EARNS ITS CREDIT ═════════════════
-- 2r in its own words: "a sponsored homeowner may later make a qualifying
-- purchase and must receive credit for that money". This group is what fails if
-- the fix is implemented as a mark on the PERSON — a sponsored_user boolean, a
-- permanent no_credit flag, an exclusion list — which is the obvious
-- implementation and the wrong one.
do $$
declare
  v_user uuid;
  v_res  jsonb;
begin
  if not t.credit_ready() then
    perform t.credit_skip('c-later-money-earns-its-credit');
    return;
  end if;

  v_user := t.mk_account('homeowner');
  v_res  := t.credit_sponsor(v_user);

  perform t.assert(
    'later-purchase-control-sponsorship-granted',
    '2p: the account starts as a genuinely sponsored Golden',
    coalesce((v_res->>'granted')::boolean, false),
    format('redeem_partner_access() did not grant: %s. This group is about a sponsored homeowner who LATER pays, so it needs the sponsorship first', v_res::text));

  perform t.assert_scalar(
    'later-purchase-control-no-credit-before-paying',
    '2r: before any money, the sponsored account carries nothing',
    'service_role', null, t.credit_server_sql(v_user),
    'NO-CREDIT',
    'the before state is wrong, so an after state that shows a credit would prove nothing about the purchase');

  -- The homeowner pays $279 for Platinum, stamped exactly as the Stripe webhook
  -- stamps a collected payment (DEF-20: it records the purchase).
  perform t.credit_purchase(v_user, 'report');

  perform t.assert_scalar(
    'sponsored-homeowner-earns-credit-for-later-money',
    '2r: the $279 this homeowner actually paid for Platinum carries $279 toward Concierge, so Concierge costs $221',
    'service_role', null, t.credit_server_sql(v_user),
    'report',
    'THE "NOT A PERMANENT FLAG" ASSERTION. NO-CREDIT here means sponsorship was implemented as a mark on the person, and a homeowner who paid $279 of their own money is being denied the credit for it. 2r forbids exactly this');

  perform t.assert_scalar(
    'stale-sponsorship-origin-does-not-survive-the-purchase',
    '2r and 2b: an origin that describes an entitlement the account no longer holds is not carried forward; the purchase is recorded instead',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_user),
    'purchase',
    'the row still says ''sponsorship'' after the tier moved to a plan the sponsorship never granted. A stale origin is how a permanent flag gets in through the back door');

  -- Nothing was deleted to make the credit appear. The sponsorship is still on
  -- the record, still attributed to the partnership, still counted.
  perform t.assert_count(
    'the-sponsorship-record-survives-the-purchase',
    '2p: partner_redemptions is append only — a later purchase never erases the attribution a partnership earned',
    'service_role', null,
    format('select 1 from public.partner_redemptions where app_user_id = %L and entitlement_granted', v_user),
    1,
    'the granted sponsorship row is gone or duplicated. If a credit can only be granted by destroying the attribution, the government partner''s analytics are being paid for with the fix');

  -- And the next rung still works from the money actually paid.
  perform t.credit_purchase(v_user, 'concierge');
  perform t.assert_scalar(
    'top-of-the-ladder-reads-the-money-too',
    '2r: at Concierge there is nothing above to credit, and the basis still reports the plan money bought',
    'service_role', null, t.credit_server_sql(v_user),
    'concierge',
    'upgradeCreditCents() returns 0 for a same-or-lower rank, so the basis is what matters here: it must report the paid plan rather than collapsing to nothing');
end
$$;


-- ═══ D. A REFUNDED PURCHASE EARNS NOTHING ══════════════════════════════════
-- Both refund shapes, because the product writes two. api/stripe-webhook.js
-- clears paid_at AND stamps refunded_at; a row that only carries refunded_at
-- (the shape t.mk_refunded_homeowner builds, and the shape a partial refund
-- leaves) must be denied by the same rule rather than by the first half of it.
do $$
declare
  v_a uuid;
  v_b uuid;
begin
  if not t.credit_ready() then
    perform t.credit_skip('d-refunded-money-earns-nothing');
    return;
  end if;

  v_a := t.mk_paid_homeowner('roadmap');
  v_b := t.mk_paid_homeowner('report');

  perform t.assert_scalar(
    'refund-control-credit-existed-first',
    '2r: the account held the credit before the refund, so its removal is the refund''s doing',
    'service_role', null, t.credit_server_sql(v_a),
    'roadmap',
    'without this the refund assertions would pass against an account that never had a credit to lose');

  perform t.credit_refund(v_a, true);
  perform t.assert_scalar(
    'refunded-webhook-shape-earns-nothing',
    '2r: money that went back to the customer is not money they paid — full price on the next plan',
    'service_role', null, t.credit_server_sql(v_a),
    'NO-CREDIT',
    'api/stripe-webhook.js nulls paid_at and stamps refunded_at on charge.refunded. A refunded buyer who still carries a credit is being paid twice');

  perform t.credit_refund(v_b, false);
  perform t.assert_scalar(
    'refunded-with-paid-at-still-set-earns-nothing',
    '2r: refunded_at alone denies the credit; the rule is not resting on paid_at being cleared',
    'service_role', null, t.credit_server_sql(v_b),
    'NO-CREDIT',
    'a row carrying both paid_at and refunded_at earned a credit. Either half of a refund must be enough, or a partial refund or a hand-written correction re-opens the discount');

  -- And a refund is not a permanent mark either, for the same reason a
  -- sponsorship is not: money paid AFTER a refund is money paid.
  perform t.credit_purchase(v_a, 'report');
  perform t.assert_scalar(
    'money-paid-after-a-refund-earns-its-credit',
    '2r: the credit follows the money, in both directions — a refunded customer who buys again has paid',
    'service_role', null, t.credit_server_sql(v_a),
    'report',
    'a refund was turned into a permanent exclusion. The homeowner has paid $279 for Platinum and is being denied the credit toward Concierge');
end
$$;


-- ═══ E. NO CLIENT-SUPPLIED VALUE CAN INFLUENCE THE CREDIT ══════════════════
do $$
declare
  v_me    uuid;
  v_other uuid;
  v_auth  uuid;
  v_nargs integer;
begin
  if not t.credit_ready() then
    perform t.credit_skip('e-no-client-value-influences-the-credit');
    return;
  end if;

  v_me    := t.mk_paid_homeowner('roadmap');
  v_other := t.mk_paid_homeowner('report');
  v_auth  := t.authid(v_me);

  -- The control: a signed-in homeowner CAN ask, so every refusal below is a
  -- refusal and not a function that is missing, unreachable or broken.
  perform t.assert_scalar(
    'own-basis-is-readable-control',
    '2r: a homeowner reads their own credit basis so the page can quote the right price',
    'authenticated', v_auth, t.credit_page_sql(),
    'roadmap',
    'if the homeowner cannot read their own basis then the denials below prove nothing, and the pricing pages have no honest number to print');

  -- NO ARGUMENTS, deliberately, the way 0013's has_worksheet_entitlement() takes
  -- none: there is no parameter for a client to substitute.
  select p.pronargs into v_nargs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'my_qualifying_paid_plan';
  perform t.assert(
    'browser-facing-basis-takes-no-arguments',
    '2r and 2p: no manipulation of a URL, request, payload or stored value may change the entitlement a caller is granted',
    v_nargs = 0,
    format('public.my_qualifying_paid_plan() declares %s argument(s). Any parameter here is a value the browser supplies, and the browser must not be able to ask about another account or another tier', coalesce(v_nargs::text, 'no such function')));

  -- The id-taking form is the server's, and only the server's.
  perform t.assert_denied(
    'homeowner-cannot-ask-about-another-account',
    '2r: the credit basis of another homeowner is not a fact this browser may request',
    'authenticated', v_auth,
    format('select public.qualifying_paid_plan(%L::uuid)', v_other),
    'a signed-in homeowner reached qualifying_paid_plan(uuid) with somebody else''s id');

  perform t.assert_denied(
    'anon-cannot-ask-for-a-credit-basis',
    '2r: an anonymous visitor has no entitlement to reason about and earns no credit',
    'anon', null, 'select public.my_qualifying_paid_plan()',
    'anon reached the basis function. api/create-checkout.js already refuses a credit to an unverified caller; the database must not offer a second opinion');

  -- The view joins billing state to an email address, exactly as 0013's
  -- homeowner_packet_full does, and is service_role only for the same reason.
  perform t.assert_denied(
    'homeowner-cannot-read-the-server-view',
    '2r: homeowner_upgrade_basis joins billing facts to an email address and is ADUAtlas''s alone',
    'authenticated', v_auth, 'select 1 from public.homeowner_upgrade_basis',
    'a signed-in account read the credit-basis view, which carries every homeowner''s email beside their billing state');

  perform t.assert_denied(
    'anon-cannot-read-the-server-view',
    '2r: the credit-basis view is never anon-readable',
    'anon', null, 'select 1 from public.homeowner_upgrade_basis',
    'anon read the credit-basis view');

  -- The recorded origin is a billing column. 0001 deliberately leaves the
  -- billing columns out of the authenticated column UPDATE grant; this one joins
  -- them, or a homeowner would simply write themselves a credit.
  perform t.assert_denied(
    'homeowner-cannot-write-their-own-origin',
    '2r: what a homeowner PAID is written by the payment and sponsorship paths, never by the browser',
    'authenticated', v_auth,
    format('update public.users set paid_origin = ''purchase'' where auth_user_id = %L', v_auth),
    'a homeowner wrote users.paid_origin on their own row. A sponsored account could then stamp itself a purchase and buy a $79 discount with one PATCH');

  perform t.assert_denied(
    'homeowner-cannot-write-another-accounts-origin',
    '2r: and not on anybody else''s row either',
    'authenticated', v_auth,
    format('update public.users set paid_origin = ''sponsorship'' where id = %L', v_other),
    'a homeowner wrote users.paid_origin on another account''s row');

  perform t.assert_denied(
    'homeowner-cannot-write-their-own-tier',
    '2r: the LEVEL half is not client-writable either, or the basis would read a tier the browser chose',
    'authenticated', v_auth,
    format('update public.users set paid_tier = ''concierge'' where auth_user_id = %L', v_auth),
    'a homeowner wrote users.paid_tier. The basis reports the tier money bought, so a writable tier is a writable credit');

  -- The view's shape is pinned. Nothing else gets parked beside a billing fact
  -- that is joined to an email address.
  perform t.assert_columns(
    'server-view-holds-only-the-basis-and-its-inputs',
    '2r: the credit basis is shown with the facts it was derived from, and nothing else',
    'public.homeowner_upgrade_basis',
    array['user_id', 'email', 'paid_tier', 'paid_at', 'refunded_at', 'paid_origin', 'qualifying_paid_plan'],
    'a column appeared on public.homeowner_upgrade_basis. This view exists so a disputed invoice can be explained; anything else stored here is a homeowner fact joined to an email address for no stated reason');
end
$$;


-- ═══ F. THE BACKFILL, PROVED ON REAL ROWS ══════════════════════════════════
-- public.backfill_paid_origin() is a callable function rather than an inline
-- block in the migration for exactly this reason (the same reason 0013 gives for
-- backfill_worksheet_packet): the rule can be proved on rows this suite created,
-- instead of taking the migration's word for what it did to rows nobody can see.
do $$
declare
  v_bought uuid;
  v_spons  uuid;
  v_unpaid uuid;
  v_refund uuid;
  v_res    jsonb;
  v_filled integer;
begin
  if not t.credit_ready() then
    perform t.credit_skip('f-the-backfill-records-the-truth');
    return;
  end if;

  v_bought := t.mk_paid_homeowner('roadmap');
  v_unpaid := t.mk_account('homeowner');
  v_refund := t.mk_refunded_homeowner('report');
  v_spons  := t.mk_account('homeowner');
  v_res    := t.credit_sponsor(v_spons);

  perform t.assert(
    'backfill-control-sponsorship-granted',
    '2p: the sponsored fixture the backfill is judged on is genuinely sponsored',
    coalesce((v_res->>'granted')::boolean, false),
    format('redeem_partner_access() did not grant: %s', v_res::text));

  -- Put every row back to "origin not recorded" so the backfill has real work.
  update public.users set paid_origin = null
   where id in (v_bought, v_spons, v_unpaid, v_refund);

  v_filled := public.backfill_paid_origin();

  -- The control: it filled SOMETHING. A backfill that touched no row would
  -- satisfy "it left the unpaid row alone" perfectly.
  perform t.assert(
    'backfill-fills-something',
    '2r: the origin of every existing live paid entitlement is recorded',
    coalesce(v_filled, 0) >= 2,
    format('backfill_paid_origin() reported %s row(s) filled and at least the purchased and the sponsored fixture were waiting. A backfill that fills nothing makes every assertion below vacuous', coalesce(v_filled::text, 'null')));

  perform t.assert_scalar(
    'backfill-records-a-purchase-as-a-purchase',
    '2r: a live paid row with no granted sponsorship against it is money the homeowner paid',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_bought),
    'purchase',
    'an existing paying customer''s row does not record the purchase, so their legitimate upgrade credit depends entirely on the inference rule and would vanish the moment that rule is tightened');

  perform t.assert_scalar(
    'backfill-records-a-sponsorship-as-a-sponsorship',
    '2r: a row whose tier came from a granted sponsorship is not money the homeowner paid',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_spons),
    'sponsorship',
    'an existing sponsored resident''s row records the sponsorship as something else. This is the row the defect was minting coupons for');

  perform t.assert_scalar(
    'backfill-invents-no-origin-for-an-unpaid-account',
    '2b: unknown means unknown — nothing was granted, so there is no origin to record',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_unpaid),
    'NOT-RECORDED',
    'a free signup was stamped with an origin. A column default becoming a claim is exactly what 2b forbids, and ''purchase'' on an account that paid nothing is a credit waiting to be granted');

  perform t.assert_scalar(
    'backfill-invents-no-origin-for-a-refunded-account',
    '2b and 2r: a refunded row is left unrecorded rather than stamped with money that went back',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_refund),
    'NOT-RECORDED',
    'a refunded row was stamped ''purchase''. paid_at is cleared on refund, so a row later re-entitled by hand would arrive carrying an origin that describes money the customer already got back');

  perform t.assert_scalar(
    'refunded-account-still-earns-nothing-after-the-backfill',
    '2r: recording origins does not re-open a refunded customer''s credit',
    'service_role', null, t.credit_server_sql(v_refund),
    'NO-CREDIT',
    'the backfill handed a refunded account a credit');

  -- Idempotent, and it never overwrites a stated fact.
  update public.users set paid_origin = 'sponsorship' where id = v_bought;
  v_filled := public.backfill_paid_origin();
  perform t.assert_scalar(
    'backfill-never-overwrites-a-recorded-origin',
    '2r: the backfill fills what nobody stated and overrules nobody who did',
    'service_role', null,
    format('select coalesce(paid_origin, ''NOT-RECORDED'') from public.users where id = %L', v_bought),
    'sponsorship',
    'a second run rewrote an origin that was already recorded. A backfill that overwrites is a backfill that cannot be re-run safely, and it would undo whatever the payment and sponsorship paths record at the source');

  -- And it is ADUAtlas's, not a browser's.
  perform t.assert_denied(
    'homeowner-cannot-run-the-backfill',
    '2r: rewriting what everybody paid is a service-role operation',
    'authenticated', t.authid(v_unpaid), 'select public.backfill_paid_origin()',
    'a signed-in account executed backfill_paid_origin()');

  perform t.assert_denied(
    'anon-cannot-run-the-backfill',
    '2r: and anon reaches it even less',
    'anon', null, 'select public.backfill_paid_origin()',
    'anon executed backfill_paid_origin()');
end
$$;
