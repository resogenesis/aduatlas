-- =============================================================================
-- TWO INVARIANTS, both about the one property order a homeowner can hold.
--
-- 1. DECISION 2q, MIGRATION 0018 — feasibility intake is FREE TO SAVE as a
--    draft, and only a live Platinum or Concierge entitlement may transition it
--    to SUBMITTED. Before 0018 there was no tier condition on public.studies
--    anywhere: studies_insert_own asked for the caller's own user_id and
--    status = 'submitted', so a free signup or a Golden buyer could submit
--    property intake and appear in the fulfilment queue as an order for a $279
--    deliverable they had not bought. The gate is on the TRANSITION and never on
--    the insert, because 2q explicitly permits a half-filled intake as the
--    on-ramp to an upgrade.
--
--    THE ONE-STUDY MODEL IS THE TRAP, and it is walked here as a named test
--    rather than assumed. studies.user_id is UNIQUE, so a Golden homeowner who
--    saves a draft already occupies their only row; the upgrade must TRANSITION
--    that row, and anything that tries to insert a second study dies on the
--    unique violation.
--
-- 2. DECISION 2i, MIGRATION 0011 — Work Started is a REAL persisted event with a
--    timestamp, because the refund copy already promises the customer that
--    ADUAtlas will tell them when substantive work begins. "Legal copy must
--    never depend on an event the product cannot prove." A status label the
--    operator can set and unset is not a provable event; a stamped, immutable
--    timestamp is.
--
--    The lifecycle is Paid, Intake Complete, Ready for Review, Work Started,
--    Deliverables Ready, Delivered. Paid is derived from users and is never
--    stored on the order; the other five are statuses. Three of the tokens are
--    REUSED from 0003 rather than renamed, because two frontend pages read them
--    directly.
--
-- HOW THE FIXTURES GO IN, and why that changed with 0018. Every study below is
-- created the way PRODUCTION creates one: the signed-in homeowner inserts a
-- DRAFT through the real INSERT policy and the real column grants, and then the
-- entitled homeowner transitions it with the same statement src/lib/studies.js
-- sends. This file used to insert status = 'submitted' directly from inside the
-- DO block, which runs as the superuser and therefore never touched RLS at all —
-- so those fixtures kept passing after 0018 while reaching around the very
-- boundary 2q adds. That is an obsolete expectation replaced, not a weakened
-- test: the assertions are stronger now because the row arrives through the
-- customer's door.
--
-- Each phase of the lifecycle still gets its OWN order, because studies.user_id
-- is unique (one property order per account, which is what keeps this a
-- lifecycle and not project management software). An assertion about a
-- not-yet-started order cannot share a row with one that has already been moved
-- through every state.
--
-- Every group probes for its object first, so this file reports SKIP rather than
-- a false pass when a migration is not applied, and every group opens with a
-- POSITIVE CONTROL: a refusal and a crashed query look identical, so a file full
-- of "denied" assertions proves nothing until something is shown to work.
-- =============================================================================
select t.suite('150 fulfilment lifecycle (2i, 2q)');


-- =============================================================================
-- Local fixtures. Both of these exist so that no assertion in this file invents
-- a route into public.studies that the product does not have.
-- =============================================================================

-- Save a draft the way the portal does: as the signed-in homeowner, through
-- studies_insert_own and the (user_id, intake, homeowner_note) insert grant,
-- with no status named — so the row takes whatever status the table defaults to,
-- which is itself part of what is under test. The positive control is RECORDED
-- here rather than assumed, and the id is read back afterwards because a
-- data-modifying statement cannot be wrapped in the harness's SELECT.
--
-- Returns null when the insert was refused, and the caller stops: a suite that
-- carried on with a null study id would report a pile of confusing failures
-- instead of the one that matters.
create or replace function t.study_draft(p_name text, p_user uuid, p_intake jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform t.assert_ok(
    p_name,
    '2q: a homeowner at ANY tier, including free and Golden, may begin and SAVE feasibility intake as a draft',
    'authenticated', t.authid(p_user),
    format('insert into public.studies (user_id, intake) values (%L, %L::jsonb)', p_user, p_intake),
    'a homeowner could not save feasibility intake as a draft, so the free on-ramp 2q describes does not exist and an upgrade has nothing to transition');
  select id into v_id from public.studies where user_id = p_user;
  return v_id;
end
$$;

-- The exact write src/lib/studies.js sends when a customer presses submit: the
-- intake, the note, the status and the submission time, in one PostgREST-shaped
-- UPDATE keyed by id. Defined once so the refused cases attack the real
-- statement rather than a hand-simplified version of it.
create or replace function t.study_submit_sql(p_study uuid, p_intake jsonb default '{}'::jsonb)
returns text
language sql
immutable
as $$
  select format(
    'update public.studies set intake = %L::jsonb, homeowner_note = %L, status = ''submitted'', submitted_at = now() where id = %L',
    p_intake, 'ready when you are', p_study);
$$;


-- =============================================================================
-- 2q — DRAFT VERSUS SUBMITTED
-- =============================================================================
do $$
declare
  v_free     uuid;
  v_golden   uuid;
  v_plat     uuid;
  v_conc     uuid;
  v_refunded uuid;
  v_noroom   uuid;
  v_up       uuid;
  v_down     uuid;
  v_refpost  uuid;
  s_free     uuid;
  s_golden   uuid;
  s_plat     uuid;
  s_conc     uuid;
  s_refunded uuid;
  s_up       uuid;
  s_down     uuid;
  s_refpost  uuid;
begin
  if not t.has_function('public.has_study_entitlement') then
    perform t.skip('draft-on-ramp',
      '2q: a homeowner at any tier may save feasibility intake as a draft',
      'public.has_study_entitlement() does not exist. Migration 0018 is not applied to this database, so there is no tier condition on public.studies and a free or Golden account can still submit intake for a Platinum deliverable.');
    perform t.skip('submit-gate',
      '2q: only Platinum or Concierge may transition a study from draft to submitted',
      'migration 0018 is not applied; the transition gate cannot be asserted.');
    perform t.skip('upgrade-transition',
      '2q: an upgrade TRANSITIONS the existing draft and never creates a second study',
      'migration 0018 is not applied.');
    perform t.skip('draft-invisible-to-the-queue',
      '2q: a draft is not an order and never reaches the fulfilment queue',
      'migration 0018 is not applied.');
    return;
  end if;

  v_free     := t.mk_account('homeowner');
  v_golden   := t.mk_paid_homeowner('roadmap');
  v_plat     := t.mk_paid_homeowner('report');
  v_conc     := t.mk_paid_homeowner('concierge');
  v_refunded := t.mk_refunded_homeowner('report');
  v_noroom   := t.mk_paid_homeowner('report');
  v_up       := t.mk_paid_homeowner('roadmap');
  v_down     := t.mk_paid_homeowner('report');
  v_refpost  := t.mk_paid_homeowner('report');

  -- ── the authority, before anything that depends on it ────────────────────
  -- POSITIVE CONTROL FIRST: the predicate has to say yes to somebody, or every
  -- "denied" assertion below would pass against a function that is simply
  -- broken.
  perform t.assert_scalar(
    'entitlement-platinum',
    '2q: the entitlement is read from trusted server state — Platinum holds it',
    'authenticated', t.authid(v_plat),
    'select public.has_study_entitlement() as r',
    'true',
    'a live Platinum account does not hold the study entitlement, so the gate refuses the customers who bought the deliverable');

  perform t.assert_scalar(
    'entitlement-concierge',
    '2q: the entitlement is read from trusted server state — Concierge holds it',
    'authenticated', t.authid(v_conc),
    'select public.has_study_entitlement() as r',
    'true',
    'a live Concierge account does not hold the study entitlement');

  perform t.assert_scalar(
    'entitlement-golden',
    '2q: Golden does not buy the feasibility study',
    'authenticated', t.authid(v_golden),
    'select public.has_study_entitlement() as r',
    'false',
    'a Golden account holds the study entitlement, so the $79 package reaches the $279 deliverable');

  perform t.assert_scalar(
    'entitlement-free',
    '2q: an unpaid account does not hold the study entitlement',
    'authenticated', t.authid(v_free),
    'select public.has_study_entitlement() as r',
    'false',
    'a free signup holds the study entitlement');

  perform t.assert_scalar(
    'entitlement-refunded',
    '2q: the entitlement must be LIVE — a refunded Platinum does not hold it',
    'authenticated', t.authid(v_refunded),
    'select public.has_study_entitlement() as r',
    'false',
    'a refunded Platinum still holds the study entitlement, so a refund does not end access to the paid workflow');

  perform t.assert_denied(
    'entitlement-not-executable-by-anon',
    '2q: the entitlement predicate is not reachable without a signed-in identity',
    'anon', null,
    'select public.has_study_entitlement()',
    'the anonymous role can execute the entitlement predicate');

  -- No parameter means no value a caller can substitute. This is the same
  -- deliberate shape as has_worksheet_entitlement() in 0013, and the assertion
  -- fails on an ADDED overload, which is how a tier argument would arrive.
  perform t.assert_scalar(
    'entitlement-takes-no-arguments',
    '2q: the entitlement takes NO arguments, so no caller can inject a tier',
    'service_role', null,
    'select (count(*) = 1 and bool_and(p.pronargs = 0)) as r
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = ''public'' and p.proname = ''has_study_entitlement''',
    'true',
    'has_study_entitlement() is overloaded or takes an argument, so a caller can pass in the tier the answer is computed from');

  -- ── drafting is free at every tier ───────────────────────────────────────
  s_free   := t.study_draft('free-saves-draft',      v_free,   '{"address": "1 Free Draft Way"}'::jsonb);
  s_golden := t.study_draft('golden-saves-draft',    v_golden, '{"address": "2 Golden Draft Way"}'::jsonb);
  s_plat   := t.study_draft('platinum-saves-draft',  v_plat,   '{"address": "3 Platinum Draft Way"}'::jsonb);
  s_conc   := t.study_draft('concierge-saves-draft', v_conc,   '{"address": "4 Concierge Draft Way"}'::jsonb);

  if s_free is null or s_golden is null or s_plat is null or s_conc is null then
    perform t.record('draft-on-ramp',
      '2q: a homeowner at any tier may save feasibility intake as a draft',
      'fail',
      'a draft could not be saved at one or more tiers, so the rest of the 2q assertions are NOT reported rather than reported against a study that does not exist');
    return;
  end if;

  perform t.assert_scalar(
    'new-study-is-a-draft',
    '2q: a saved intake starts as a DRAFT and is not an order',
    'service_role', null,
    format('select status from public.studies where id = %L', s_golden),
    'draft',
    'a study created through the customer''s own insert did not start as a draft, so saving intake still creates an order');

  -- 2b: a column default must never stand in as a claim that an event happened.
  perform t.assert_scalar(
    'draft-has-no-submission-time',
    '2q and 2b: a draft was never submitted, so it carries no submission time',
    'service_role', null,
    format('select (submitted_at is null) as r from public.studies where id = %L', s_golden),
    'true',
    'a draft carries a submitted_at, so the column the fulfilment queue orders by records a submission that never happened');

  perform t.assert_ok(
    'golden-edits-own-draft',
    '2q: nothing about DRAFTING is gated — a Golden homeowner can keep working on their intake',
    'authenticated', t.authid(v_golden),
    format($q$update public.studies set intake = '{"address": "2 Golden Draft Way", "beds": 3}'::jsonb where id = %L$q$, s_golden),
    'a Golden homeowner cannot edit their own draft, so the half-filled intake 2q calls the on-ramp to an upgrade cannot be filled in');

  perform t.assert_scalar(
    'golden-draft-edit-persisted',
    '2q: a draft edit actually lands, it is not merely accepted',
    'service_role', null,
    format($q$select (intake->>'beds') from public.studies where id = %L$q$, s_golden),
    '3',
    'the update was accepted but changed nothing, so drafting silently does not save');

  perform t.assert_ok(
    'free-edits-own-draft',
    '2q: an unpaid homeowner may save and keep editing intake',
    'authenticated', t.authid(v_free),
    format($q$update public.studies set homeowner_note = 'still gathering photos' where id = %L$q$, s_free),
    'a free account cannot edit its own draft');

  perform t.assert_count(
    'draft-visible-to-its-owner',
    'a homeowner reads their own property work, draft included',
    'authenticated', t.authid(v_golden),
    format('select 1 from public.studies where id = %L', s_golden),
    1,
    'a homeowner cannot see their own draft, so the portal cannot show them what they saved');

  perform t.assert_count(
    'draft-private-to-its-owner',
    'a draft is private to its customer',
    'authenticated', t.authid(v_free),
    format('select 1 from public.studies where id = %L', s_golden),
    0,
    'one homeowner can read another homeowner''s draft intake, which carries their address');

  -- The insert has no status column in its grant, so 'submitted' is not
  -- reachable on the way in for ANY tier. The only door is the transition.
  perform t.assert_denied(
    'no-submitted-on-insert',
    '2q: the gate is on the TRANSITION, so the insert cannot name a status at all',
    'authenticated', t.authid(v_noroom),
    format('insert into public.studies (user_id, intake, status) values (%L, ''{}''::jsonb, ''submitted'')', v_noroom),
    'a client can name the status on insert, so an entitled account skips the transition and an unentitled one has a second door to try');

  -- ── the gate on the transition ───────────────────────────────────────────
  -- POSITIVE CONTROL FIRST, with the exact statement the browser sends.
  perform t.assert_ok(
    'platinum-submits',
    '2q: only a Platinum or Concierge entitlement may transition a study from draft to submitted',
    'authenticated', t.authid(v_plat),
    t.study_submit_sql(s_plat, '{"address": "3 Platinum Draft Way"}'::jsonb),
    'a Platinum homeowner cannot submit their own intake, so nobody can buy the deliverable');

  perform t.assert_scalar(
    'platinum-submission-recorded',
    '2q: the transition actually lands',
    'service_role', null,
    format('select status from public.studies where id = %L', s_plat),
    'submitted',
    'the submit statement was accepted but the study is not submitted, so the order never reaches the fulfilment queue');

  perform t.assert_scalar(
    'platinum-submission-stamped',
    '2q and 2b: an order that is no longer a draft carries a real submission time',
    'service_role', null,
    format('select (submitted_at is not null) as r from public.studies where id = %L', s_plat),
    'true',
    'a submitted order has no submitted_at, so the queue cannot order the work and the customer cannot be told when their intake arrived');

  perform t.assert_ok(
    'concierge-submits',
    '2q: Concierge may transition a study from draft to submitted',
    'authenticated', t.authid(v_conc),
    t.study_submit_sql(s_conc, '{"address": "4 Concierge Draft Way"}'::jsonb),
    'a Concierge homeowner cannot submit their own intake');

  -- Golden, by the real browser statement and then by two narrower shapes,
  -- because a gate that only stops one statement shape is not a gate.
  perform t.assert_denied(
    'golden-cannot-submit',
    '2q: only Platinum or Concierge may transition a study from draft to submitted',
    'authenticated', t.authid(v_golden),
    t.study_submit_sql(s_golden, '{"address": "2 Golden Draft Way"}'::jsonb),
    'a Golden homeowner can submit feasibility intake, so the $79 package enters the fulfilment queue as an order for the $279 deliverable');

  perform t.assert_denied(
    'golden-cannot-submit-status-only',
    '2q: the gate is on the resulting status, not on one statement shape',
    'authenticated', t.authid(v_golden),
    format('update public.studies set status = ''submitted'' where id = %L', s_golden),
    'a Golden homeowner reaches submitted with a bare status write');

  perform t.assert_denied(
    'golden-cannot-submit-by-user-id',
    '2q: the gate is on the resulting status, not on how the row is addressed',
    'authenticated', t.authid(v_golden),
    format('update public.studies set status = ''submitted'', submitted_at = now() where user_id = %L', v_golden),
    'a Golden homeowner reaches submitted by addressing the row through user_id instead of id');

  -- A refusal and a crash look the same from outside, so the STATE is checked
  -- too: the draft must still be a draft.
  perform t.assert_scalar(
    'golden-draft-still-a-draft',
    '2q: a refused transition leaves the draft alone',
    'service_role', null,
    format('select status from public.studies where id = %L', s_golden),
    'draft',
    'the Golden transition was reported as refused but the row moved anyway');

  perform t.assert_denied(
    'free-cannot-submit',
    '2q: an unpaid account may draft and may not submit',
    'authenticated', t.authid(v_free),
    t.study_submit_sql(s_free, '{"address": "1 Free Draft Way"}'::jsonb),
    'a free signup can submit feasibility intake and become an order in the fulfilment queue');

  perform t.assert_scalar(
    'free-draft-still-a-draft',
    '2q: a refused transition leaves the draft alone',
    'service_role', null,
    format('select status from public.studies where id = %L', s_free),
    'draft',
    'the free transition was reported as refused but the row moved anyway');

  -- A refunded Platinum drafts (any tier may) and cannot submit: the
  -- entitlement has to be LIVE, not merely once bought.
  s_refunded := t.study_draft('refunded-saves-draft', v_refunded, '{"address": "5 Refunded Way"}'::jsonb);
  if s_refunded is not null then
    perform t.assert_denied(
      'refunded-cannot-submit',
      '2q: the entitlement must be live — a refunded Platinum cannot submit',
      'authenticated', t.authid(v_refunded),
      t.study_submit_sql(s_refunded, '{"address": "5 Refunded Way"}'::jsonb),
      'a refunded account can submit intake and put work into the queue for money that has been given back');

    perform t.assert_scalar(
      'refunded-draft-still-a-draft',
      '2q: a refused transition leaves the draft alone',
      'service_role', null,
      format('select status from public.studies where id = %L', s_refunded),
      'draft',
      'the refunded transition was reported as refused but the row moved anyway');
  end if;

  -- The customer's write may leave the row in exactly two states, draft or
  -- submitted. The operator states are not theirs at any tier.
  perform t.assert_denied(
    'golden-cannot-write-operator-state',
    '2i and 2q: the operator states are not the customer''s to write',
    'authenticated', t.authid(v_golden),
    format('update public.studies set status = ''in_review'' where id = %L', s_golden),
    'a Golden homeowner can write an operator state, which puts an unpaid draft into the middle of the fulfilment workflow');

  perform t.assert_denied(
    'platinum-cannot-write-operator-state',
    '2i and 2q: the operator states are not the customer''s to write, entitlement or not',
    'authenticated', t.authid(v_plat),
    format('update public.studies set status = ''work_started'' where id = %L', s_plat),
    'a paying customer can declare that work has started, which is the event the refund boundary depends on');

  -- An order never becomes a draft again. Without this a customer could
  -- withdraw a bought order from the queue with one status write, and RLS
  -- cannot express it because WITH CHECK never sees the previous status.
  perform t.assert_denied(
    'submitted-cannot-return-to-draft',
    '2q: a draft becomes an order; an order never goes back to being a draft',
    'authenticated', t.authid(v_plat),
    format('update public.studies set status = ''draft'' where id = %L', s_plat),
    'a customer can set their submitted order back to draft, which silently removes bought work from the fulfilment queue');

  perform t.assert_scalar(
    'submitted-order-stayed-an-order',
    '2q: a draft becomes an order; an order never goes back to being a draft',
    'service_role', null,
    format('select status from public.studies where id = %L', s_plat),
    'submitted',
    'the un-submit was reported as refused but the order became a draft anyway');

  -- ── the upgrade transition: the whole path, because the unique index on
  --    studies.user_id means a second study is not an option ───────────────
  s_up := t.study_draft('upgrade-golden-drafts', v_up, '{"address": "7 Upgrade Way"}'::jsonb);
  if s_up is not null then
    perform t.assert_ok(
      'upgrade-golden-saves-and-edits',
      '2q: a Golden homeowner fills in their intake before they upgrade',
      'authenticated', t.authid(v_up),
      format($q$update public.studies set intake = '{"address": "7 Upgrade Way", "beds": 4}'::jsonb, homeowner_note = 'thinking about Platinum' where id = %L$q$, s_up),
      'a Golden homeowner cannot fill in the draft they are meant to upgrade');

    perform t.assert_denied(
      'upgrade-golden-cannot-submit-yet',
      '2q: before the upgrade, the draft cannot be submitted',
      'authenticated', t.authid(v_up),
      t.study_submit_sql(s_up, '{"address": "7 Upgrade Way", "beds": 4}'::jsonb),
      'the Golden homeowner could submit before upgrading, so there was nothing for the upgrade to unlock');

    -- The upgrade itself, stamped the way api/stripe-webhook.js stamps it.
    perform t.assert_ok(
      'upgrade-webhook-records-platinum',
      '2q: the entitlement is read from trusted server state that only the webhook writes',
      'service_role', null,
      format('update public.users set paid_tier = ''report'', paid_at = now() where id = %L', v_up),
      'the webhook path cannot record the upgraded tier');

    perform t.assert_ok(
      'upgrade-transitions-the-same-row',
      '2q: an upgrade TRANSITIONS the existing draft',
      'authenticated', t.authid(v_up),
      t.study_submit_sql(s_up, '{"address": "7 Upgrade Way", "beds": 4}'::jsonb),
      'the upgraded homeowner cannot submit the draft they already saved, so the upgrade path is broken for exactly the customer it was built for');

    perform t.assert_scalar(
      'upgrade-same-study-id',
      '2q: the upgrade transitions the EXISTING draft and never creates a second study',
      'service_role', null,
      format('select id::text from public.studies where user_id = %L', v_up),
      s_up::text,
      'the submitted order is a different row from the draft, so the draft was abandoned and the intake the customer filled in before upgrading was lost');

    perform t.assert_count(
      'upgrade-one-study-only',
      '2q: one study per homeowner survives the upgrade',
      'service_role', null,
      format('select 1 from public.studies where user_id = %L', v_up),
      1,
      'the upgraded homeowner holds more than one study row');

    perform t.assert_scalar(
      'upgrade-intake-survived',
      '2q: the draft the customer filled in becomes the order',
      'service_role', null,
      format($q$select (intake->>'beds') from public.studies where user_id = %L$q$, v_up),
      '4',
      'the intake saved before the upgrade is not on the submitted order, so the customer has to type it again');

    perform t.assert_scalar(
      'upgrade-order-is-submitted',
      '2q: after the upgrade the study is an order',
      'service_role', null,
      format('select status from public.studies where id = %L', s_up),
      'submitted',
      'the upgraded homeowner''s study is not submitted');

    perform t.assert_denied(
      'upgrade-no-second-study',
      '2q: anything that tries to INSERT a second study fails on the unique violation',
      'authenticated', t.authid(v_up),
      format('insert into public.studies (user_id, intake) values (%L, ''{"address": "7 Upgrade Way"}''::jsonb)', v_up),
      'a homeowner can hold two studies, so an upgrade implemented as a fresh insert would appear to work and the one-study model is gone');
  end if;

  -- ── the fulfilment queue never sees a draft ──────────────────────────────
  -- api/admin/_studies.js excludes 'draft' from BOTH of its reads: the studies
  -- query that builds the queue, and the awaiting-intake query that synthesises
  -- the derived "Paid" rows. The JS itself is lane A of decision 2j and cannot
  -- be proved from SQL; what IS proved here are the two database facts those
  -- filters stand on — a draft is identifiable by its status, and no unentitled
  -- account can ever appear in the awaiting-intake set whatever it has drafted.
  perform t.assert_count(
    'queue-includes-a-submitted-order',
    '2i: the fulfilment queue shows the orders',
    'service_role', null,
    format('select 1 from public.studies where status <> ''draft'' and user_id = %L', v_plat),
    1,
    'a submitted order is missing from the queue shape, so the assertion below would pass against a queue that shows nothing at all');

  perform t.assert_count(
    'queue-omits-a-draft',
    '2q: a draft is not an order and never reaches Amy''s fulfilment queue',
    'service_role', null,
    format('select 1 from public.studies where status <> ''draft'' and user_id = %L', v_golden),
    0,
    'a Golden homeowner''s draft appears in the fulfilment queue as an order');

  perform t.assert_count(
    'awaiting-intake-includes-a-paid-buyer',
    '2i: a paid buyer with no submitted intake is shown as Paid',
    'service_role', null,
    format('select 1 from public.homeowner_packet_full where user_id = %L and paid_tier in (''report'', ''concierge'') and paid_at is not null and refunded_at is null', v_noroom),
    1,
    'the awaiting-intake shape returns nothing for a live Platinum buyer, so the assertion below would pass against a query that finds nobody');

  perform t.assert_count(
    'awaiting-intake-omits-a-golden-drafter',
    '2q: the second query is not a way back into the queue for an unentitled draft',
    'service_role', null,
    format('select 1 from public.homeowner_packet_full where user_id = %L and paid_tier in (''report'', ''concierge'') and paid_at is not null and refunded_at is null', v_golden),
    0,
    'a Golden homeowner with a draft appears in the awaiting-intake set, so the leak returns through the second query');

  -- One whole-table invariant rather than a per-row check: the trigger in 0018
  -- owns submitted_at for every writer, the service role included, so "this row
  -- is a draft" and "this row has no submission time" must be the same fact for
  -- every row this suite has created.
  perform t.assert_scalar(
    'draft-and-submission-time-agree',
    '2q and 2b: submitted_at is null for exactly as long as the row is a draft',
    'service_role', null,
    'select (count(*) = 0) as r from public.studies where (status = ''draft'') <> (submitted_at is null)',
    'true',
    'some row is a draft with a submission time or an order without one, so the queue''s ordering key and the row''s status disagree');

  -- ── a downgrade AFTER submission does not delete or hide the order ───────
  -- The work was already bought. 2p definition-of-done item 23 is the same
  -- principle on the partnership axis: stop the future, preserve the past.
  s_down := t.study_draft('downgrade-drafts', v_down, '{"address": "8 Downgrade Way"}'::jsonb);
  if s_down is not null then
    perform t.assert_ok(
      'downgrade-submits-while-entitled',
      '2q: a Platinum homeowner submits their intake',
      'authenticated', t.authid(v_down),
      t.study_submit_sql(s_down, '{"address": "8 Downgrade Way"}'::jsonb),
      'the Platinum homeowner could not submit, so the downgrade assertions below would be about a draft rather than an order');

    perform t.assert_ok(
      'downgrade-happens',
      '2q: entitlement level is trusted server state and can change',
      'service_role', null,
      format('update public.users set paid_tier = ''roadmap'' where id = %L', v_down),
      'the tier cannot be moved back down, so the rest of this group is untestable');

    perform t.assert_count(
      'downgrade-order-survives',
      '2q: a downgrade after submission does not delete the order — the work was already bought',
      'service_role', null,
      format('select 1 from public.studies where id = %L and status = ''submitted''', s_down),
      1,
      'the order disappeared when the customer''s tier went down, so bought work is lost');

    perform t.assert_count(
      'downgrade-customer-still-sees-order',
      '2q: a downgrade after submission does not hide the order from its customer',
      'authenticated', t.authid(v_down),
      format('select 1 from public.studies where id = %L', s_down),
      1,
      'the customer can no longer see the order they bought');

    -- The consequence of putting the condition on the RESULTING status, pinned
    -- so a later change to it has to be deliberate: writing 'submitted' again
    -- asks for an entitlement the account no longer holds. The ORDER is intact;
    -- what has gone is the right to write to it.
    --
    -- This attempt has to happen while the order is still 'submitted'. Once the
    -- operator moves it to 'in_review' the USING clause excludes the row and the
    -- same statement is FILTERED rather than refused — it succeeds and changes
    -- nothing, which is a different fact and would prove nothing about the
    -- entitlement. The first version of this assertion ran in the wrong order
    -- and the suite caught it.
    perform t.assert_denied(
      'downgraded-customer-cannot-resubmit',
      '2q: the transition into submitted needs a LIVE entitlement every time it is written',
      'authenticated', t.authid(v_down),
      format('update public.studies set status = ''submitted'', submitted_at = now() where id = %L', s_down),
      'an account whose entitlement has lapsed can write a fresh submission');

    perform t.assert_ok(
      'downgrade-operator-can-still-work',
      '2q: a downgrade after submission does not stop the work already bought',
      'service_role', null,
      format('update public.studies set status = ''in_review'' where id = %L', s_down),
      'the order cannot be moved forward after the customer''s tier changed, so bought work is stranded');
  end if;

  s_refpost := t.study_draft('refund-after-submission-drafts', v_refpost, '{"address": "9 Refund Way"}'::jsonb);
  if s_refpost is not null then
    perform t.assert_ok(
      'refund-after-submission-submits',
      '2q: a Platinum homeowner submits their intake',
      'authenticated', t.authid(v_refpost),
      t.study_submit_sql(s_refpost, '{"address": "9 Refund Way"}'::jsonb),
      'the Platinum homeowner could not submit');

    perform t.assert_ok(
      'refund-after-submission-refunds',
      'the refund is recorded the way the Stripe webhook records it',
      'service_role', null,
      format('update public.users set refunded_at = now() where id = %L', v_refpost),
      'the refund cannot be recorded, so the rest of this group is untestable');

    perform t.assert_count(
      'refund-order-survives',
      '2q: a refund after submission does not delete the order record',
      'service_role', null,
      format('select 1 from public.studies where id = %L and status = ''submitted''', s_refpost),
      1,
      'the order vanished when the refund was recorded, so there is no record of what was ordered or when');

    perform t.assert_count(
      'refund-customer-still-sees-order',
      '2q: a refund after submission does not hide the order from its customer',
      'authenticated', t.authid(v_refpost),
      format('select 1 from public.studies where id = %L', s_refpost),
      1,
      'the customer can no longer see the order that was refunded');
  end if;
end
$$;


-- =============================================================================
-- 2i — WORK STARTED IS A REAL PERSISTED EVENT
-- =============================================================================
do $$
declare
  v_vocab_home uuid := t.mk_paid_homeowner('concierge');
  v_stamp_home uuid := t.mk_paid_homeowner('concierge');
  v_edit_home  uuid := t.mk_paid_homeowner('report');
  v_vocab  uuid;
  v_study  uuid;
  v_first  timestamptz;
begin
  if not t.has_column('public.studies', 'work_started_at') then
    perform t.skip('work-started-event',
      '2i: Work Started is a real persisted event with a timestamp',
      'studies.work_started_at does not exist. Migration 0011 is not applied to this database, so the refund copy still promises the customer an event the product cannot prove.');
    perform t.skip('lifecycle-states',
      '2i: the six-state fulfilment lifecycle',
      'migration 0011 is not applied; the lifecycle states cannot be asserted.');
    perform t.skip('work-started-immutable',
      '2i: work_started_at is stamped once, never moved, never cleared',
      'migration 0011 is not applied.');
    return;
  end if;

  -- ── one order per account: the shape that keeps this a lifecycle ──────────
  -- The order arrives the way a customer's does: a draft, then the gated
  -- transition. Inserting 'submitted' straight into the table from here would
  -- run as the superuser and reach around both, which is how this fixture used
  -- to survive a change to the very policy the order depends on.
  v_vocab := t.study_draft('vocab-order-starts-as-a-draft', v_vocab_home, '{"address": "12 Lifecycle Way"}'::jsonb);
  if v_vocab is null then
    perform t.record('lifecycle-states',
      '2i: the six-state fulfilment lifecycle',
      'fail',
      'the lifecycle fixture could not save a draft, so the lifecycle is NOT reported rather than reported against a study that does not exist');
    return;
  end if;

  perform t.assert_ok(
    'vocab-order-submitted-by-its-customer',
    '2i and 2q: an order enters the lifecycle when its entitled customer submits the intake',
    'authenticated', t.authid(v_vocab_home),
    t.study_submit_sql(v_vocab, '{"address": "12 Lifecycle Way"}'::jsonb),
    'an entitled Concierge customer cannot submit their intake, so no order can enter the lifecycle at all');

  perform t.assert_denied(
    'one-order-per-account',
    '2i: one order moves through one lifecycle; nothing resembling project management software',
    'service_role', null,
    format('insert into public.studies (user_id, intake) values (%L, ''{}''::jsonb)', v_vocab_home),
    'an account can hold more than one property order, which turns the console into a job board and needs the project management software 2i rules out');

  -- ── the six states, and only the allowed vocabulary ──────────────────────
  declare
    s text;
  begin
    foreach s in array array['submitted', 'in_review', 'work_started',
                             'deliverables_ready', 'ready', 'needs_info']
    loop
      perform t.assert_ok(
        'status-allowed-' || s,
        '2i: the fulfilment lifecycle is Paid, Intake Complete, Ready for Review, Work Started, Deliverables Ready, Delivered, with needs_info as the off-ramp',
        'service_role', null,
        format('update public.studies set status = %L where id = %L', s, v_vocab),
        format('the lifecycle state %s cannot be stored, so an order cannot be moved through the workflow', s));
    end loop;
  end;

  perform t.assert_denied(
    'status-vocabulary-closed',
    '2i: one order moves through one lifecycle',
    'service_role', null,
    format('update public.studies set status = ''blocked_awaiting_survey'' where id = %L', v_vocab),
    'an arbitrary status was accepted, so the lifecycle is not a fixed set of states and the console can invent workflow stages');

  -- "Paid" is derived from users and is never stored on the order.
  perform t.assert_denied(
    'paid-not-a-status',
    '2i: Paid is derived from the account, never stored on the order',
    'service_role', null,
    format('update public.studies set status = ''paid'' where id = %L', v_vocab),
    'paid was accepted as an order status, which duplicates entitlement in a second place where it can disagree with users');

  -- ── work_started_at is stamped by reaching the state, and not before ──────
  -- A FRESH order: the vocabulary loop above has already passed through
  -- work_started, so asserting "not stamped yet" on that row would be false.
  v_study := t.study_draft('stamp-order-starts-as-a-draft', v_stamp_home, '{"address": "3 Stamp Street"}'::jsonb);
  if v_study is null then
    perform t.record('work-started-event',
      '2i: Work Started is a real persisted event with a timestamp',
      'fail',
      'the work-started fixture could not save a draft, so the stamp assertions are NOT reported rather than reported against a study that does not exist');
    return;
  end if;

  perform t.assert_scalar(
    'not-stamped-on-draft',
    '2i: Work Started is stamped when work actually begins, not when the customer starts a draft',
    'service_role', null,
    format('select work_started_at is null as r from public.studies where id = %L', v_study),
    'true',
    'work_started_at was stamped the moment the customer saved a draft, so the date ADUAtlas tells the customer is the date they started typing');

  perform t.assert_ok(
    'stamp-order-submitted-by-its-customer',
    '2i and 2q: an order enters the lifecycle when its entitled customer submits the intake',
    'authenticated', t.authid(v_stamp_home),
    t.study_submit_sql(v_study, '{"address": "3 Stamp Street"}'::jsonb),
    'an entitled Concierge customer cannot submit their intake');

  perform t.assert_scalar(
    'not-stamped-on-intake',
    '2i: Work Started is stamped when work actually begins, not at intake',
    'service_role', null,
    format('select work_started_at is null as r from public.studies where id = %L', v_study),
    'true',
    'work_started_at was stamped the moment the order was created, so the date ADUAtlas tells the customer is the order date and not the date work began');

  update public.studies set status = 'in_review' where id = v_study;
  perform t.assert_scalar(
    'not-stamped-at-review',
    '2i: Work Started is stamped when work actually begins, not at Ready for Review',
    'service_role', null,
    format('select work_started_at is null as r from public.studies where id = %L', v_study),
    'true',
    'work_started_at was stamped when the order reached Ready for Review, which is before substantive work begins');

  perform t.assert_ok(
    'enter-work-started',
    '2i: Work Started is a real persisted event with a timestamp',
    'service_role', null,
    format('update public.studies set status = ''work_started'' where id = %L', v_study),
    'the order could not be moved to Work Started');

  perform t.assert_scalar(
    'stamped-on-entry',
    '2i: Work Started is a real persisted event with a timestamp',
    'service_role', null,
    format('select work_started_at is not null as r from public.studies where id = %L', v_study),
    'true',
    'the order reached Work Started without a timestamp being persisted. The refund copy promises the customer we will tell them when substantive work begins; with no timestamp that promise rests on a label an operator can move');

  select work_started_at into v_first from public.studies where id = v_study;

  -- ── immutable: never moved, never cleared ────────────────────────────────
  -- Enforced in the database, so a bug in the console, a second writer or a
  -- hand-run statement cannot reopen a refund boundary the customer was told
  -- about. The trigger pins the value silently, so the WRITE succeeds and the
  -- VALUE does not move; both halves are asserted.
  perform t.assert_ok(
    'attempt-move-stamp',
    '2i: work_started_at is stamped once, never moved',
    'service_role', null,
    format('update public.studies set work_started_at = now() + interval ''10 days'' where id = %L', v_study),
    'the update statement errored; the trigger is supposed to pin the value silently, not refuse the write, or every ordinary update to the row would fail');

  perform t.assert_scalar(
    'stamp-did-not-move',
    '2i: work_started_at is stamped once, never moved',
    'service_role', null,
    format('select (work_started_at = %L) as r from public.studies where id = %L', v_first, v_study),
    'true',
    'work_started_at was moved. The refund rule is anchored to this date, so moving it silently changes what the customer is owed');

  perform t.assert_ok(
    'attempt-clear-stamp',
    '2i: work_started_at is never cleared',
    'service_role', null,
    format('update public.studies set work_started_at = null where id = %L', v_study),
    'the update statement errored instead of the trigger pinning the value');

  perform t.assert_scalar(
    'stamp-not-cleared',
    '2i: work_started_at is never cleared',
    'service_role', null,
    format('select (work_started_at = %L) as r from public.studies where id = %L', v_first, v_study),
    'true',
    'work_started_at was cleared, so a refund boundary the customer has already been told about can be reopened');

  -- Stepping back and forward again keeps the ORIGINAL date, because the original
  -- date is when work actually began.
  update public.studies set status = 'deliverables_ready' where id = v_study;
  update public.studies set status = 'work_started' where id = v_study;
  perform t.assert_scalar(
    'reentry-keeps-original',
    '2i: a re-entry into Work Started keeps the original date, because that is when work began',
    'service_role', null,
    format('select (work_started_at = %L) as r from public.studies where id = %L', v_first, v_study),
    'true',
    'stepping back from Deliverables Ready and forward again re-stamped the date, moving the refund boundary');

  -- Reaching Delivered must not disturb it either.
  update public.studies set status = 'ready' where id = v_study;
  perform t.assert_scalar(
    'delivered-keeps-stamp',
    '2i: work_started_at survives the rest of the lifecycle',
    'service_role', null,
    format('select (work_started_at = %L) as r from public.studies where id = %L', v_first, v_study),
    'true',
    'delivering the order changed or cleared the date work began');

  -- ── the customer can edit their intake before review, never after work ────
  declare
    v_s2 uuid;
    v_ea uuid := t.authid(v_edit_home);
  begin
    v_s2 := t.study_draft('edit-order-starts-as-a-draft', v_edit_home, '{"address": "1 Editable Rd"}'::jsonb);
    if v_s2 is null then
      perform t.record('customer-edits-before-review',
        '2i: a customer can edit their intake before review',
        'fail',
        'the intake-edit fixture could not save a draft, so the edit assertions are NOT reported rather than reported against a study that does not exist');
      return;
    end if;

    perform t.assert_ok(
      'edit-order-submitted-by-its-customer',
      '2i and 2q: an order enters the lifecycle when its entitled customer submits the intake',
      'authenticated', v_ea,
      t.study_submit_sql(v_s2, '{"address": "1 Editable Rd"}'::jsonb),
      'an entitled Platinum customer cannot submit their intake');

    perform t.assert_ok(
      'customer-edits-before-review',
      '2i: a customer can edit their intake before review',
      'authenticated', v_ea,
      format('update public.studies set intake = ''{"address": "1 Editable Rd", "beds": 2}''::jsonb where id = %L', v_s2),
      'a customer cannot edit their own intake before review');

    update public.studies set status = 'work_started' where id = v_s2;

    perform t.assert_count(
      'customer-still-sees-order',
      '2i: the customer keeps seeing their own order through the lifecycle',
      'authenticated', v_ea,
      format('select 1 from public.studies where id = %L and status = ''work_started''', v_s2),
      1,
      'the customer cannot see their own order once work started, which breaks the portal');

    perform t.assert_scalar(
      'edit-after-work-has-no-effect',
      '2i: a customer can never edit their intake after work has started',
      'service_role', null,
      format($q$select (intake->>'beds') from public.studies where id = %L$q$, v_s2),
      '2',
      'the intake changed after work had started, so the brief ADUAtlas is already being paid to work from can move under it');

    perform t.assert_scalar(
      'customer-cannot-set-operator-state',
      '2i: the three operator states are not the customer''s to write',
      'service_role', null,
      format('select status from public.studies where id = %L', v_s2),
      'work_started',
      'the status moved off work_started, so a customer can write an operator state');
  end;

  -- ── the stamp is ADUAtlas telling the customer, not the reverse ───────────
  perform t.assert_denied(
    'customer-cannot-stamp',
    '2i: Work Started is ADUAtlas telling the customer, not the customer telling ADUAtlas',
    'authenticated', t.authid(v_stamp_home),
    format('update public.studies set work_started_at = now() where id = %L', v_study),
    'a customer can write work_started_at, so the customer controls the event the refund rule depends on');

  -- A stranger's UPDATE is FILTERED, not refused: the row policy excludes the row,
  -- so the statement succeeds and matches nothing. Both facts are asserted.
  perform t.assert_changes_nothing(
    'stranger-cannot-move-order',
    '2i: an order is private to its customer',
    'authenticated', t.authid(v_edit_home),
    format('update public.studies set status = ''ready'' where id = %L', v_study),
    'one customer can move another customer''s order through the lifecycle');

  perform t.assert_count(
    'stranger-cannot-see-order',
    '2i: an order is private to its customer',
    'authenticated', t.authid(v_edit_home),
    format('select 1 from public.studies where id = %L', v_study),
    0,
    'one customer can read another customer''s order and intake');
end
$$;
