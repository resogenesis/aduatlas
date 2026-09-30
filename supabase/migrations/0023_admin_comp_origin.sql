-- =============================================================================
-- 0023 — Admin-comped access gets its OWN origin: 'admin_comp'.
--        Implements Richard's decision of 2026-09-27. Applied after 0022.
--
-- THE DECISION, as it was given.
--   Access an ADUAtlas admin grants by hand (a "comp") is its own origin,
--   'admin_comp'. It MAY grant the intended entitlement LEVEL. It represents $0
--   of customer payment. It must NOT count as revenue. It must NOT earn
--   purchase-based upgrade credit. Level and origin are never conflated. This is
--   decision 2r (entitlement LEVEL and ORIGIN are different facts; upgrade credit
--   comes only from money the homeowner actually paid) applied to the second
--   non-purchase path to paid_at.
--
-- THE DEFECT THIS FILE CLOSES, present in RC2a.
--   The admin "grant a paid tier" control (src/pages/admin/AdminUsers.jsx to
--   api/admin/_update_user.js) wrote paid_tier and paid_at, cleared refunded_at
--   and recorded NO origin. 0019's own header names this exact situation:
--   qualifying_paid_plan() rule 5 treats "origin not recorded and no sponsorship
--   on record" as a purchase, "sound while redeem_partner_access() is the only
--   non-purchase way to acquire paid_at", and says a second such path "would
--   have to disqualify itself the way 0014's does, through the ledger or
--   through the column". The admin grant was that second path and did neither.
--   So a comped Golden read as a bought Golden: it earned a real $79 Stripe
--   coupon toward Platinum (api/create-checkout.js reads qualifying_paid_plan)
--   and it was $79 of Amy's revenue (api/admin/_overview.js sums the same
--   authority). This file makes the admin path disqualify itself THROUGH THE
--   COLUMN, and gives it a writer that cannot forget to.
--
-- BASED ON THE CURRENT DEFINITIONS. Every object this file replaces or
--   re-describes was last defined by 0019_entitlement_origin.sql: the constraint
--   users_paid_origin_known, public.qualifying_paid_plan(uuid),
--   public.my_qualifying_paid_plan(), public.homeowner_upgrade_basis,
--   public.users_paid_origin_follows_tier() and public.backfill_paid_origin().
--   0020, 0021 and 0022 do not mention any of them (checked by grep over the
--   chain when this was written). Each CREATE OR REPLACE below is 0019's body
--   with the change marked, not a rewrite from memory.
--
-- WHAT CHANGES, in one list.
--   PART 1  users.paid_origin may hold 'admin_comp'.
--   PART 2  qualifying_paid_plan(): a recorded admin comp is NOT money (new rule
--           3b). my_qualifying_paid_plan() and homeowner_upgrade_basis read
--           that function and so inherit the rule without being redefined.
--   PART 3  The origin-follows-tier trigger is kept exactly as 0019 wrote it;
--           this part records why it is already coherent with a fourth value.
--   PART 4  public.admin_comp_entitlement(): the ONE writer of a comp. Atomic,
--           records its own origin, restates it past 0019's trigger, and
--           refuses to paint a comp over an entitlement money bought.
--
-- WHAT DOES NOT CHANGE.
--   The LEVEL a comp grants is the ordinary level: paid_at and paid_tier, read by
--   has_worksheet_entitlement(), the study-submission gate, api/course.js and
--   everything else that asks "what does this account hold". A comped Platinum
--   holds Platinum. Only the origin differs, and only the credit and the revenue
--   figure read the origin. No plan, price or product scope changes, and
--   src/lib/plans.js stays the only price list.
--
-- NOT A PERMANENT FLAG (2r). 'admin_comp' describes ONE entitlement, exactly as
--   'sponsorship' does. A comped homeowner who later really pays is recorded as
--   'purchase' by api/stripe-webhook.js, and the credit follows that money.
--   supabase/tests/invariants/280_admin_comp_origin.sql proves it.
-- =============================================================================


-- =============================================================================
-- PART 1 — the fourth value.
--
-- Dropped and re-added rather than altered, because Postgres cannot alter a
-- CHECK in place. Re-adding validates every existing row, and every value 0019
-- allowed is still allowed, so no row can fail it.
-- =============================================================================
alter table public.users
  drop constraint users_paid_origin_known;

alter table public.users
  add constraint users_paid_origin_known
  check (paid_origin is null or paid_origin in ('purchase', 'sponsorship', 'admin_comp'));

comment on column public.users.paid_origin is
  'Decision 2r, extended by Richard''s decision of 2026-09-27 (0023): the ORIGIN of the entitlement that paid_at and paid_tier describe. ''purchase'' = qualifying money was paid by this homeowner. ''sponsorship'' = a government Education Partner granted it under 2p and no money was paid. ''admin_comp'' = an ADUAtlas admin granted it by hand at no charge; it is never revenue and never upgrade credit. NULL = not recorded, which is resolved from public.partner_redemptions rather than assumed (2b). Never a mark on the person: it describes ONE entitlement, and a homeowner who later pays gets the credit for that money. Not in the authenticated column UPDATE grant, so the browser can read its own row and can never write this. The product writes a comp only through public.admin_comp_entitlement().';


-- =============================================================================
-- PART 2 — the authority. 0019's function with ONE new arm, 3b.
--
-- The rules, in order (0019's numbering kept so its tests and comments still
-- point at the right line):
--   1.  No live paid entitlement (no paid_at, or refunded) -> NOTHING.
--   2.  A granted sponsorship for the tier now held (the ledger) -> NOTHING.
--   3.  A recorded sponsorship -> NOTHING.
--   3b. A recorded admin comp -> NOTHING.                       NEW IN 0023
--   4.  A recorded purchase -> that tier.
--   5.  Origin not recorded, no sponsorship evidence -> that tier (inference).
--
-- WHY THE COLUMN IS ENOUGH HERE, when sponsorship also needed a ledger. 0019
-- added rule 2 because 0014's grant did not record its own origin, so the
-- column could be empty for a genuine sponsorship. A comp is different: after
-- this file its only writer is admin_comp_entitlement() (PART 4), which records
-- 'admin_comp' in the same transaction as the level and aborts if it could not.
-- The column is service-role only (not in the authenticated UPDATE grant), and
-- 0019's trigger clears it the moment the entitlement it describes moves, so a
-- stale 'admin_comp' can never deny credit for a later purchase.
--
-- RULE 5, REVISITED AS 0019 ASKED. 0019 wrote that rule 5 must be revisited
-- when a second non-purchase path to paid_at appears. The admin grant now
-- disqualifies itself through the column, so rule 5 stays sound for every grant
-- made after this migration. ONE RESIDUE IS RECORDED, NOT GUESSED AT (2b): an
-- admin grant made BEFORE this migration carries either NULL (made after 0019)
-- or 'purchase' (made before 0019 and stamped by its backfill). Neither can be
-- told from a real purchase on the row alone, so this file does not rewrite
-- them. They read as "not recorded" or "bought" until an admin revokes and
-- re-comps them through the new writer, which records them correctly.
-- =============================================================================
create or replace function public.qualifying_paid_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when u.paid_at is null or u.refunded_at is not null then null          -- 1
           when exists (
             select 1
               from public.partner_redemptions r
              where r.app_user_id = u.id
                and r.entitlement_granted
                and r.entitlement_plan_id = u.paid_tier
           ) then null                                                           -- 2
           when u.paid_origin = 'sponsorship' then null                          -- 3
           when u.paid_origin = 'admin_comp'  then null                          -- 3b (0023)
           when u.paid_origin = 'purchase'    then u.paid_tier                   -- 4
           else u.paid_tier                                                      -- 5
         end
    from public.users u
   where u.id = p_user_id;
$$;

-- Unchanged from 0019, restated because CREATE OR REPLACE keeps existing grants
-- but a reader should not have to go and check.
revoke all on function public.qualifying_paid_plan(uuid) from public, anon, authenticated;
grant execute on function public.qualifying_paid_plan(uuid) to service_role;

comment on function public.qualifying_paid_plan(uuid) is
  'Decision 2r (0019) and Richard''s 2026-09-27 decision (0023): the plan QUALIFYING MONEY bought for this homeowner, or null when no money did. A sponsorship and an admin comp both grant a level and both answer null here. The input to the upgrade credit and to the admin revenue figure; the price ladder itself stays in src/lib/plans.js. Takes a user id and is service_role only; a browser reads its own answer through my_qualifying_paid_plan(), which takes no arguments at all.';

-- my_qualifying_paid_plan() and homeowner_upgrade_basis are NOT redefined: both
-- call qualifying_paid_plan(), so rule 3b reaches the pricing pages and
-- api/create-checkout.js through the one function. Redefining them would only
-- create a second place to drift. Their descriptions are brought up to date.
comment on function public.my_qualifying_paid_plan() is
  'Decision 2r: the requesting homeowner''s own credit basis, so the pricing pages quote what checkout will charge. Null for sponsored and for admin-comped access (0023). Takes NO arguments, so nothing the browser holds can influence the answer, and reaches only the caller''s own row through current_app_user_id().';

comment on view public.homeowner_upgrade_basis is
  'Decision 2r: the upgrade-credit basis for api/create-checkout.js and the admin revenue figures, with the facts it was derived from beside it. qualifying_paid_plan is null for sponsored and admin-comped access (0023); paid_origin says which. service_role only; it joins billing state to a homeowner email. A browser uses my_qualifying_paid_plan() instead.';


-- =============================================================================
-- PART 3 — the origin-follows-tier trigger, deliberately UNCHANGED.
--
-- 0019's rule: an update that moves the entitlement (the tier changes, or
-- paid_at goes from null to set) WITHOUT changing paid_origin makes the origin
-- unknown again. Walked through for the fourth value:
--
--   comp over nothing            null -> 'admin_comp' is a change: kept.
--   comp over a sponsorship      'sponsorship' -> 'admin_comp': kept.
--   comp over a comp, new tier   'admin_comp' -> 'admin_comp' is NOT a change,
--                                so the trigger clears it. Postgres cannot tell a
--                                restated value from an omitted one. PART 4
--                                therefore restates it in a second statement,
--                                inside the same transaction, exactly as
--                                api/stripe-webhook.js restates 'purchase' on an
--                                upgrade. Atomic, so there is no instant at which
--                                the comp reads as an inferred purchase.
--   re-comp after a revoke       paid_at null -> set with 'admin_comp' kept the
--                                same: cleared, then restated by PART 4.
--   a real purchase after a comp 'admin_comp' -> 'purchase' is a change: kept.
--                                The credit follows the money (2r).
--   an uncollected checkout      the webhook writes no origin; on a new tier the
--   after a comp                 trigger makes the origin unknown, as it does for
--                                a sponsorship. Unchanged 0019 behaviour.
--   a sponsorship after a        redeem_partner_access() needs paid_at null; it
--   revoked comp                 sets paid_at without an origin, the trigger
--                                clears the stale 'admin_comp', and 0019 PART 4
--                                stamps 'sponsorship'. The comp does not survive
--                                into an entitlement it did not grant.
--   an admin revoke              paid_at goes to null and nothing else moves, so
--                                'admin_comp' stays as the record of what ended,
--                                the way a refund leaves 'purchase'. Rule 1 means
--                                it grants and credits nothing.
--
-- Changing the trigger to special-case 'admin_comp' would make the one invariant
-- that keeps every origin honest depend on which origin it is. It is left alone.
-- =============================================================================


-- =============================================================================
-- PART 4 — the ONE writer of a comp.
--
-- WHY A FUNCTION AND NOT TWO REST CALLS FROM api/admin/_update_user.js. The
-- restatement in PART 3 needs two statements. From the API they would be two
-- HTTP requests, and if the second one failed the account would be left holding
-- a comped level with a NULL origin: rule 5 would read that as a purchase, which
-- is the defect this file exists to close, re-opened by a network blip. Inside
-- one function both statements commit together or not at all.
--
-- THE RULES, in order:
--   1. The tier must be one of the three plans. Anything else is refused.
--   2. The account must exist. Otherwise refused.
--   3. Already holding a live entitlement at this tier -> 'unchanged'. Nothing
--      is written: the level is already held, and rewriting the origin of an
--      entitlement that did not change would erase a true fact (a purchase or a
--      sponsorship) for nothing.
--   4. The entitlement held is currently one that MONEY BOUGHT (qualifying_paid_plan
--      is not null, recorded or inferred) -> 'refused_bought'. Nothing is
--      written. A comp would replace paid_tier and paid_origin, and with them
--      the only record that this homeowner paid: their revenue would vanish from
--      Amy's figure and their credit toward the next plan would be lost, which
--      2r forbids ("must receive credit for that money"). Representing
--      "bought Golden, then comped up to Platinum" honestly needs the product to
--      remember the plan money bought beneath the comp. That is a separate
--      decision for Richard and is recorded, not improvised, here. An admin who
--      knows a "not recorded" account was really a hand grant can revoke it and
--      comp it, which records it correctly.
--   5. Otherwise: THE GRANT. The level, paid_at, refunded_at cleared (the same
--      "live" shape a purchase and a sponsorship write) and paid_origin
--      'admin_comp'; then the restatement; then a check of the result that
--      aborts the whole transaction if the comp did not record itself, the
--      check 0019 asked 0014's grant to make.
--
-- Returns jsonb {result: 'comped' | 'unchanged' | 'refused_bought', ...}. A
-- refusal is a RESULT, not an exception, because nothing was written and the
-- caller needs to say why in plain words.
--
-- service_role ONLY. api/admin/_update_user.js calls it after requireAdmin()
-- has proved the caller is an admin. There is no grant to anon or authenticated,
-- so no browser can comp itself, and the column grant already stops a browser
-- writing paid_origin directly.
-- =============================================================================
create or replace function public.admin_comp_entitlement(p_user_id uuid, p_tier text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_before public.users%rowtype;
  v_after  public.users%rowtype;
  v_live   boolean;
  v_bought text;
begin
  -- 1.
  if p_tier is null or p_tier not in ('roadmap', 'report', 'concierge') then
    raise exception 'a comp grants one of the plans roadmap, report or concierge, not %', coalesce(p_tier, 'null')
      using errcode = '22023';
  end if;

  -- 2. Locked, so a Stripe webhook landing at the same moment waits for this
  --    transaction instead of interleaving with it.
  select * into v_before from public.users where id = p_user_id for update;
  if not found then
    raise exception 'no account with id %', p_user_id using errcode = 'P0002';
  end if;

  v_live := v_before.paid_at is not null and v_before.refunded_at is null;

  -- 3.
  if v_live and v_before.paid_tier = p_tier then
    return jsonb_build_object(
      'result', 'unchanged',
      'paid_tier', v_before.paid_tier,
      'paid_origin', v_before.paid_origin);
  end if;

  -- 4.
  v_bought := public.qualifying_paid_plan(p_user_id);
  if v_bought is not null then
    return jsonb_build_object(
      'result', 'refused_bought',
      'paid_tier', v_before.paid_tier,
      'paid_origin', v_before.paid_origin,
      'qualifying_paid_plan', v_bought);
  end if;

  -- 5. The grant, then the restatement (PART 3).
  update public.users
     set paid_tier   = p_tier,
         paid_at     = now(),
         refunded_at = null,
         paid_origin = 'admin_comp'
   where id = p_user_id;

  update public.users
     set paid_origin = 'admin_comp'
   where id = p_user_id
     and paid_origin is null;

  -- Exactly the level and the origin moved, and nothing else. Anything else
  -- aborts the grant, the restatement and all.
  select * into v_after from public.users where id = p_user_id;
  if v_after.paid_tier is distinct from p_tier
     or v_after.paid_at is null
     or v_after.refunded_at is not null
     or v_after.paid_origin is distinct from 'admin_comp'
     or v_after.role is distinct from v_before.role
     or v_after.email is distinct from v_before.email
     or v_after.stripe_customer_id is distinct from v_before.stripe_customer_id then
    raise exception 'an admin comp records the level and the origin ''admin_comp'' and nothing else: refusing a grant that left tier %, origin %, refund state or billing identity wrong',
      v_after.paid_tier, coalesce(v_after.paid_origin, 'null') using errcode = '42501';
  end if;
  if public.qualifying_paid_plan(p_user_id) is not null then
    raise exception 'an admin comp must never qualify for purchase credit; refusing'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'result', 'comped',
    'paid_tier', v_after.paid_tier,
    'paid_origin', v_after.paid_origin,
    'previous', jsonb_build_object(
      'paid_tier', v_before.paid_tier,
      'live', v_live,
      'paid_origin', v_before.paid_origin));
end
$$;

revoke all on function public.admin_comp_entitlement(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_comp_entitlement(uuid, text) to service_role;

comment on function public.admin_comp_entitlement(uuid, text) is
  'Richard''s 2026-09-27 decision (0023): the one writer of admin-comped access. Grants the level (paid_tier, paid_at, refunded_at cleared) and records paid_origin = ''admin_comp'' in one transaction, restating it past 0019''s origin-follows-tier trigger. Returns {result: comped | unchanged | refused_bought}. Refuses to comp over an entitlement money bought, so a payment is never erased from the credit or the revenue figure. service_role only; api/admin/_update_user.js calls it after requireAdmin().';


-- =============================================================================
-- The backfill, re-described. 0019's backfill_paid_origin() fills NULL origins
-- only, so it never touches an 'admin_comp'. Its rule ("anything else live is a
-- purchase") is what it was in 0019 and is NOT re-run here: a NULL origin left
-- by an admin grant made between 0019 and this migration would be stamped
-- 'purchase' by it, which would turn an inference into a recorded claim.
-- =============================================================================
comment on function public.backfill_paid_origin() is
  'Decision 2r (0019): records the origin of every existing live paid entitlement whose origin is NULL; a granted sponsorship for the tier held is ''sponsorship'', anything else is ''purchase''. Idempotent, fills nulls only, never overwrites ''admin_comp'' (0023). Do NOT re-run it expecting it to find comps: an admin grant made before 0023 recorded no origin and this rule would stamp it ''purchase''. A function rather than an inline block so the durable suite can prove the rule on real rows.';


-- =============================================================================
-- Notes for whoever is next.
--   • Anything that needs "did this homeowner pay" still reads
--     qualifying_paid_plan(), never the columns. Anything that needs "why not"
--     reads paid_origin: 'sponsorship' or 'admin_comp' (and the ledger for a
--     sponsorship whose column was cleared).
--   • A goodwill upgrade for a homeowner who already BOUGHT a plan is refused by
--     admin_comp_entitlement() (rule 4). Supporting it needs a record of the
--     plan money bought beneath the comp, so the credit and the revenue keep
--     that money. That is a product decision, not an implementation detail.
-- =============================================================================
