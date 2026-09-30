-- =============================================================================
-- 0019 — Entitlement ORIGIN, held separately from entitlement LEVEL.
--        Locked decision 2r (D2, 2026-09-26). Applied after 0018.
--
-- THE DEFECT THIS FILE CLOSES, confirmed live before it was written.
--   0014's redeem_partner_access() grants a sponsored Golden with
--       update public.users set paid_tier = c_plan, paid_at = now()
--   which is byte for byte what api/stripe-webhook.js writes when somebody pays
--   $79. api/create-checkout.js then read exactly paid_tier, paid_at and
--   refunded_at (ownedPlanFor), handed the tier to upgradeCreditCents() and
--   minted a REAL Stripe coupon for $79 — money the homeowner never paid,
--   discounting a $279 Platinum to $200 because a city sponsored their
--   education. 0014's own closing note recorded this as undecided; 2r decides it.
--
-- THE CONTRACT (2r, quoted where it is load-bearing).
--   "Upgrade credit is computed from QUALIFYING MONEY THE HOMEOWNER ACTUALLY
--   PAID." And, explicitly: "This is not a permanent 'sponsored user gets no
--   credit' flag, and implementing it as one would be wrong: a sponsored
--   homeowner may later make a qualifying purchase and must receive credit for
--   that money. The product records what a homeowner PAID separately from what
--   tier they HOLD, and the credit reads the former."
--
--   So sponsorship is NOT a mark on a person. It is a fact about ONE
--   entitlement. The same account, still carrying its sponsorship in
--   public.partner_redemptions for ever, earns a credit the moment money is
--   recorded against it.
--
-- WHY AN ORIGIN AND NOT AN AMOUNT — the representation choice, written down
-- because more than one design is reasonable here.
--   An amount column (paid_amount_cents) is the more literal reading of "money
--   actually paid", and it was rejected for two reasons.
--     1. NOTHING WOULD WRITE IT. api/stripe-webhook.js writes paid_at, paid_tier
--        and refunded_at and no amount at all, so an amount column would be null
--        for every purchase made after this migration until that file changes.
--        A credit computed from a null amount is no credit, which would break
--        every legitimate upgrade on the day this shipped.
--     2. THE LADDER IS ALREADY PLAN-SHAPED AND PAY-THE-DIFFERENCE.
--        upgradeCreditCents() in src/lib/plans.js credits
--        min(owned.priceCents, target.priceCents), so Golden -> Platinum pays
--        $200 and Platinum -> Concierge pays $221. Cumulative money paid
--        therefore already EQUALS the list price of the tier held, whenever that
--        tier was bought: $79 + $200 = $279 = Platinum. The plan id is a
--        faithful summary of the money for this ladder, and plans.js stays the
--        one place a price is written.
--   What this file records is therefore the ORIGIN of the entitlement that
--   paid_at and paid_tier describe: purchase, sponsorship, or not known.
--
-- WHAT "NOT KNOWN" MEANS, AND WHY THE COLUMN HAS NO DEFAULT (2b).
--   There is no default and no not-null. A default would make every row written
--   by code that predates this migration CLAIM something nobody recorded. Null
--   means the origin was not stated, and a null is resolved from EVIDENCE rather
--   than from an assumption wherever evidence exists.
--
-- THE EVIDENCE. public.partner_redemptions (0014) is append only for every role
--   including service_role, has no revoked_at and no delete path, and its
--   entitlement_plan_id is pinned to 'roadmap' by CHECK. A granted sponsorship
--   is therefore a hard, permanent, tamper-resistant fact. "This account holds
--   paid_at, is not refunded, and has no granted sponsorship for the tier it
--   holds" is exactly the rule 2r's own backfill sentence states, and it is
--   sound while redeem_partner_access() is the only non-purchase way to acquire
--   paid_at. THAT ASSUMPTION IS WRITTEN HERE ON PURPOSE so that the day a
--   second non-purchase grant path appears, the reader knows which line to come
--   back to: PART 2, rule 5.
--
-- CORRECT WHETHER OR NOT 0014 CHANGES. 0014 is not this file's to edit. Today it
--   records a sponsorship as a payment; PART 4 stamps the origin from the ledger
--   in the same transaction, so a sponsored row says 'sponsorship' without 0014
--   changing one character. When 0014 is updated to record the origin itself,
--   PART 4 becomes a no-op (it only ever fills a null) and nothing here needs
--   revisiting. What 0014 must NOT do is stop writing paid_at: a sponsorship
--   legitimately grants the Golden LEVEL, and paid_at is what carries it
--   (public.paid_entitlement, public.has_worksheet_entitlement). Level stays;
--   only the origin was missing.
--
-- WHAT THIS FILE IS NOT. It does not change what any tier is sold for, does not
--   rename a plan id, adds no plan, adds no product scope, and takes nothing
--   away from a sponsored homeowner: they keep Golden, the course, the resources
--   and the builder directory, and they keep the normal paid upgrade path (2p
--   definition of done, item 17). The only thing that changes is whether Stripe
--   is told to discount money that was never received.
--
-- NO SECOND PRICE LIST. Nothing in this file knows what a plan costs, and that
--   is deliberate: src/lib/plans.js is the single source of truth for the
--   pricing ladder (its own header says so) and a copy of $79 in SQL would be a
--   second thing to keep in step. This file answers "which plan did this
--   homeowner's money buy", and the ladder turns that into cents in one place.
-- =============================================================================


-- =============================================================================
-- PART 1 — the column. Nullable, no default, three states.
-- =============================================================================
alter table public.users
  add column paid_origin text;

alter table public.users
  add constraint users_paid_origin_known
  check (paid_origin is null or paid_origin in ('purchase', 'sponsorship'));

comment on column public.users.paid_origin is
  'Decision 2r: the ORIGIN of the entitlement that paid_at and paid_tier describe. ''purchase'' = qualifying money was paid by this homeowner. ''sponsorship'' = a government Education Partner granted it under 2p and no money was paid. NULL = not recorded, which is resolved from public.partner_redemptions rather than assumed (2b). Never a mark on the person: it describes ONE entitlement, and a sponsored homeowner who later pays gets the credit for that money. Not in the authenticated column UPDATE grant, so the browser can read its own row and can never write this.';

-- The column describes the entitlement recorded in (paid_at, paid_tier). A
-- statement that MOVES that entitlement without restating the origin leaves
-- behind an origin describing something that is no longer there, so the fact
-- becomes UNKNOWN again rather than carrying over. This is the invariant that
-- makes 2r's "not a permanent flag" true in the schema and not only in the
-- credit function: a sponsored Golden who buys Platinum has their stale
-- 'sponsorship' cleared by the very statement that records the purchase, and
-- the purchase then qualifies.
--
-- A writer that sets paid_origin in the same statement keeps what it set, so
-- this never fights a caller that knows the answer.
create or replace function public.users_paid_origin_follows_tier()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.paid_origin is not distinct from old.paid_origin
     and (new.paid_tier is distinct from old.paid_tier
          or (old.paid_at is null and new.paid_at is not null)) then
    new.paid_origin := null;
  end if;
  return new;
end
$$;

grant execute on function public.users_paid_origin_follows_tier() to anon, authenticated, service_role;

create trigger users_paid_origin_follows_tier
  before update on public.users
  for each row execute function public.users_paid_origin_follows_tier();

comment on function public.users_paid_origin_follows_tier() is
  'Decision 2r and 2b: paid_origin describes the entitlement in (paid_at, paid_tier). An update that moves that entitlement without restating the origin makes the origin unknown again, so a stale ''sponsorship'' can never deny credit for a later purchase and a stale ''purchase'' can never grant credit for a later sponsorship.';


-- =============================================================================
-- PART 2 — the authority. ONE function answers "which plan did this homeowner's
--          money buy", and every surface reads it.
--
-- The rules, in order, and each one is asserted separately in
-- supabase/tests/invariants/240_upgrade_credit.sql:
--
--   1. No live paid entitlement (no paid_at, or refunded) -> NOTHING.
--      Both refund shapes are covered: api/stripe-webhook.js nulls paid_at AND
--      stamps refunded_at, and either half alone is enough to disqualify.
--   2. The ledger, tier scoped: a granted sponsorship whose plan IS the tier now
--      held -> NOTHING. This is the evidence rule, and it holds even if the
--      column is wrong, missing or cleared. Tier scoped on purpose: once the
--      homeowner moves to a tier the sponsorship did not grant, the sponsorship
--      no longer describes what they hold.
--   3. An explicitly recorded sponsorship -> NOTHING.
--   4. An explicitly recorded purchase -> that tier.
--   5. Origin not recorded and no sponsorship evidence -> that tier. This is
--      2r's own backfill sentence applied continuously, and it is what keeps
--      every existing and future ordinary buyer whole while api/stripe-webhook.js
--      still writes no origin. IT IS AN INFERENCE, and the one line in this file
--      that would need revisiting if a second non-purchase path to paid_at were
--      ever added: it would have to disqualify itself the way 0014's does,
--      through the ledger or through the column.
--
-- Rules 4 and 5 give the same answer today. They are written as separate arms
-- because they are different claims — one is recorded, one is inferred — and
-- because tightening rule 5 to NULL is the whole forward migration once the
-- webhook records an origin at the source.
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
           when u.paid_origin = 'purchase'    then u.paid_tier                   -- 4
           else u.paid_tier                                                      -- 5
         end
    from public.users u
   where u.id = p_user_id;
$$;

revoke all on function public.qualifying_paid_plan(uuid) from public, anon, authenticated;
grant execute on function public.qualifying_paid_plan(uuid) to service_role;

comment on function public.qualifying_paid_plan(uuid) is
  'Decision 2r: the plan QUALIFYING MONEY bought for this homeowner, or null when no money did. The input to the upgrade credit; the price ladder itself stays in src/lib/plans.js. Takes a user id and is service_role only — a browser reads its own answer through my_qualifying_paid_plan(), which takes no arguments at all.';


-- =============================================================================
-- PART 3 — the browser's own answer. NO ARGUMENTS, deliberately, exactly as
--          0013's has_worksheet_entitlement() takes none: there is no parameter
--          for a client to substitute, no header, no payload and no local value
--          that can change what comes back. A signed-in homeowner gets their own
--          credit basis and there is no shape of request that asks for anybody
--          else's.
--
-- WHY THE BROWSER NEEDS THIS AT ALL. src/pages/Unlock.jsx and
-- src/pages/app/Dashboard.jsx quote the upgrade price, and they used to quote it
-- from the localStorage tier mirror (src/stores/paymentStore.js), which records
-- the tier HELD. A sponsored Golden holds Golden, so both pages promised "$200"
-- and checkout charged $279. Quoting a price the server will not honour is the
-- visible half of this defect, so the pages now read the same fact the server
-- reads. The mirror stays exactly what its own header says it is: a UX hint.
-- =============================================================================
create or replace function public.my_qualifying_paid_plan()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.qualifying_paid_plan(public.current_app_user_id());
$$;

revoke all on function public.my_qualifying_paid_plan() from public, anon;
grant execute on function public.my_qualifying_paid_plan() to authenticated, service_role;

comment on function public.my_qualifying_paid_plan() is
  'Decision 2r: the requesting homeowner''s own credit basis, so the pricing pages quote what checkout will charge. Takes NO arguments, so nothing the browser holds can influence the answer, and reaches only the caller''s own row through current_app_user_id().';


-- =============================================================================
-- PART 4 — a sponsorship records itself as a sponsorship, today, without editing
--          0014.
--
-- 0014's redeem_partner_access() writes the users row (its step 9) and then
-- inserts the attribution row (its step 10 onwards) in ONE transaction, so by
-- the time this fires the grant has happened and the ledger says so. It only
-- ever fills a NULL, so it cannot overwrite a writer that knew better, and the
-- tier equality means it will not stamp 'sponsorship' onto a row that has
-- meanwhile come to hold something the sponsorship did not grant.
--
-- This is a stopgap and it is labelled as one. The right place for this fact is
-- the grant itself, in 0014, which is not this migration's file. Rule 2 in
-- PART 2 means the guarantee does not DEPEND on this trigger: if it never fired,
-- the ledger would still deny the credit. The trigger exists so the recorded
-- fact is true as well as the derived one.
-- =============================================================================
create or replace function public.partner_redemption_stamp_paid_origin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.entitlement_granted then
    update public.users
       set paid_origin = 'sponsorship'
     where id = new.app_user_id
       and paid_origin is null
       and paid_tier is not distinct from new.entitlement_plan_id;
  end if;
  return null;
end
$$;

grant execute on function public.partner_redemption_stamp_paid_origin() to anon, authenticated, service_role;

create trigger partner_redemptions_stamp_paid_origin
  after insert on public.partner_redemptions
  for each row execute function public.partner_redemption_stamp_paid_origin();

comment on function public.partner_redemption_stamp_paid_origin() is
  'Decision 2r: records users.paid_origin = ''sponsorship'' when a sponsored Golden is granted, in the same transaction as the attribution row, so the fact is stated and not only inferable. Fills a null only. Belongs in 0014''s grant; until it moves there this keeps the record true, and qualifying_paid_plan() rule 2 means the credit is denied even if this never ran.';


-- =============================================================================
-- PART 5 — the backfill, truthfully, for rows that already exist.
--
-- A CALLABLE FUNCTION rather than a one-shot DO block, for the reason 0013's
-- backfill_worksheet_packet() gives: the durable suite can then prove the rule
-- on real rows it created itself, instead of taking the migration's word for it.
-- Idempotent — it only fills a null — so running it twice changes nothing.
--
-- THE RULE, which is 2r's own sentence: a row holding a live paid entitlement
-- with no granted sponsorship for the tier it holds is a PURCHASE; one with a
-- granted sponsorship for that tier is a SPONSORSHIP.
--
-- WHAT IT DELIBERATELY LEAVES ALONE.
--   • A row with no paid_at at all. Nothing was granted, so there is no origin
--     to record and inventing one would be a default becoming a claim (2b).
--   • A REFUNDED row. A refund means a purchase happened, so 'purchase' would be
--     truthful history — and stamping it would be the wrong direction anyway:
--     paid_at is nulled on refund, and a row that was later re-entitled by hand
--     would arrive carrying a 'purchase' that describes money which went back to
--     the customer. Left null; rule 1 denies the credit while the refund stands,
--     and the trigger in PART 1 makes the origin unknown again if a fresh
--     purchase ever lands on that row.
-- =============================================================================
create or replace function public.backfill_paid_origin()
returns integer
language plpgsql
as $$
declare
  v_filled integer := 0;
begin
  with target as (
    select u.id,
           case
             when exists (
               select 1
                 from public.partner_redemptions r
                where r.app_user_id = u.id
                  and r.entitlement_granted
                  and r.entitlement_plan_id = u.paid_tier
             ) then 'sponsorship'
             else 'purchase'
           end as origin
      from public.users u
     where u.paid_origin is null
       and u.paid_at is not null
       and u.refunded_at is null
  ),
  filled as (
    update public.users u
       set paid_origin = tgt.origin
      from target tgt
     where u.id = tgt.id
    returning u.id
  )
  select count(*) into v_filled from filled;
  return v_filled;
end
$$;

revoke all on function public.backfill_paid_origin() from public, anon, authenticated;
grant execute on function public.backfill_paid_origin() to service_role;

comment on function public.backfill_paid_origin() is
  'Decision 2r: records the origin of every existing live paid entitlement — a granted sponsorship for the tier held is ''sponsorship'', anything else that holds paid_at is ''purchase''. Idempotent, fills nulls only, and leaves unpaid and refunded rows alone. A function rather than an inline block so the durable suite can prove the rule on real rows.';

do $$
declare
  v_filled integer;
begin
  v_filled := public.backfill_paid_origin();
  raise notice '0019: recorded the entitlement origin for % account(s)', v_filled;
end
$$;


-- =============================================================================
-- PART 6 — what api/create-checkout.js reads.
--
-- ownedPlanFor() used to select paid_tier, paid_at and refunded_at straight off
-- public.users and hand the tier to the price ladder. It now reads
-- qualifying_paid_plan from this view, keyed on the address the caller PROVED is
-- theirs with their Supabase access token (that part of the endpoint was already
-- right and is unchanged).
--
-- service_role ONLY, and the suite proves it, for the same reason 0013's
-- homeowner_packet_full is: it deliberately joins a homeowner's billing facts to
-- their email address. The browser never touches this view; it calls
-- my_qualifying_paid_plan(), which takes no arguments and reaches one row.
--
-- The inputs are exposed beside the answer on purpose. When somebody is looking
-- at a disputed invoice they need to see WHY the basis is what it is without
-- reconstructing the rule by hand.
--
-- If this view is missing — a deployed bundle running ahead of the migration,
-- lane C of decision 2j — ownedPlanFor() catches the error and returns null, so
-- the buyer pays full price. Dropping a credit is the safe direction and is the
-- direction that file already chose for an unverified caller.
-- =============================================================================
create or replace view public.homeowner_upgrade_basis as
select u.id                                as user_id,
       u.email,
       u.paid_tier,
       u.paid_at,
       u.refunded_at,
       u.paid_origin,
       public.qualifying_paid_plan(u.id)   as qualifying_paid_plan
  from public.users u;

revoke all on public.homeowner_upgrade_basis from anon, authenticated;
grant select on public.homeowner_upgrade_basis to service_role;

comment on view public.homeowner_upgrade_basis is
  'Decision 2r: the upgrade-credit basis for api/create-checkout.js, with the facts it was derived from beside it. service_role only — it joins billing state to a homeowner email. A browser uses my_qualifying_paid_plan() instead.';


-- =============================================================================
-- Notes for whoever is next.
--   • The credit is now TWO facts read in one place: the tier held
--     (users.paid_tier, unchanged) and whether money bought it
--     (qualifying_paid_plan). Anything new that needs "did this homeowner pay"
--     should read the function, not the columns, or the sponsored case will be
--     got wrong again in a third place.
--   • src/lib/plans.js stays pure and stays the only price list.
--     upgradeCreditCents() was not touched: it was never wrong, it was being
--     handed a tier that money had not bought.
--   • 0013's has_worksheet_entitlement() is deliberately NOT changed. It asks
--     about the LEVEL held — Platinum or Concierge — and a sponsored Golden
--     fails it already. Level and origin are different questions and 2r's whole
--     point is that they stay different; wiring origin into an access predicate
--     would start taking things away from sponsored residents, which 2p item 23
--     and 2s (D5) both forbid.
--
-- ONE THING THIS FILE CANNOT DO, recorded rather than worked around.
--   0014's redeem_partner_access() still writes paid_tier and paid_at exactly as
--   a purchase does and records no origin. That file is not this migration's to
--   edit. What it must change, in one statement:
--       update public.users
--          set paid_tier   = c_plan,
--              paid_at     = now(),
--              paid_origin = 'sponsorship'
--        where id = v_user.id and paid_at is null and refunded_at is null;
--   and its step-10 "exactly the Golden plan and nothing else" assertion should
--   add paid_origin = 'sponsorship' to what it checks, so a grant that failed to
--   record its own origin aborts instead of passing. paid_at must KEEP being
--   written: it carries the Golden level the sponsorship legitimately grants.
--   Until that lands, PART 4 records the fact and PART 2 rule 2 enforces it.
--   api/stripe-webhook.js should likewise write paid_origin = 'purchase' beside
--   paid_at and paid_tier; once it does, PART 2 rule 5 can be tightened from
--   "assume purchase" to "unknown, therefore no credit".
-- =============================================================================
