-- =============================================================================
-- INVARIANT: three packages, kept separate, and entitlement that a client cannot
-- award itself.
--
-- Spec: decision 2 (Golden $79, Platinum $279 featured, Concierge $500;
-- worksheets and the Ready Score are Platinum and Concierge only) and decision
-- 2n (that separation needs a real authorization boundary, not application
-- code). The schema ids are historical — 'roadmap' is Golden, 'report' is
-- Platinum — and are NOT renamed, because the Stripe price environment
-- variables and the frontend plan table both key off them; the mapping is
-- asserted here so the separation is at least written down in the tests.
--
-- THIS FILE USED TO CARRY A SKIP. Worksheet and Ready Score tier separation
-- lived only in PaidGate and the browser: 0001 granted
-- "update (completed_chapters, builder_packet, knowledge_result) on
-- public.users to authenticated" with no tier condition, and the worksheets,
-- the Ready Score and the lot geometry all sat inside users.builder_packet, so
-- any signed-in account could read and write the whole Platinum set through the
-- API. Migration 0013 moved that data into public.homeowner_worksheets behind
-- RLS gated on the tier in trusted server state, and the second block below
-- attacks it as anonymous, free, Golden, refunded, downgraded, a second
-- Platinum homeowner and a forged request. The skip is gone because the missing
-- property was built, not because the assertion was deleted.
--
-- WHAT IS DELIBERATELY NOT ASSERTED HERE. Which SENTENCES each package
-- advertises is copy, not schema. The database decides three things and this
-- file holds it to them: which package was bought, whether the entitlement is
-- live, and who may reach the data that only two of the packages include.
-- =============================================================================
select t.suite('055 packages and entitlement');

do $$
declare
  v_paid uuid := t.mk_paid_homeowner('roadmap');
  v_auth uuid;
begin
  v_auth := t.authid(v_paid);

  -- ── the three packages, and only the three ────────────────────────────────
  perform t.assert_ok(
    'tier-golden',
    '2: Golden, Platinum and Concierge are the three packages',
    'service_role', null,
    format('update public.users set paid_tier = ''roadmap'' where id = %L', v_paid),
    'the Golden tier id is not accepted');

  perform t.assert_ok(
    'tier-platinum',
    '2: Golden, Platinum and Concierge are the three packages',
    'service_role', null,
    format('update public.users set paid_tier = ''report'' where id = %L', v_paid),
    'the Platinum tier id is not accepted');

  perform t.assert_ok(
    'tier-concierge',
    '2: Golden, Platinum and Concierge are the three packages',
    'service_role', null,
    format('update public.users set paid_tier = ''concierge'' where id = %L', v_paid),
    'the Concierge tier id is not accepted');

  perform t.assert_denied(
    'no-fourth-tier',
    '2: there is no fourth package and no "property review" line',
    'service_role', null,
    format('update public.users set paid_tier = ''property_review'' where id = %L', v_paid),
    'an unrecognised package id was accepted, so a retired or invented tier can enter the data');

  -- ── entitlement is derived, never asserted by the client ──────────────────
  perform t.assert_denied(
    'no-self-grant-paid-at',
    'billing columns are service-role write only: a client cannot self-grant paid access',
    'authenticated', v_auth,
    'update public.users set paid_at = now() where auth_user_id = auth.uid()',
    'a signed-in account can stamp its own paid_at with the anon key and unlock the paid product for free');

  perform t.assert_denied(
    'no-self-grant-tier',
    'billing columns are service-role write only',
    'authenticated', v_auth,
    'update public.users set paid_tier = ''concierge'' where auth_user_id = auth.uid()',
    'a Golden customer can upgrade themselves to Concierge by writing their own tier');

  perform t.assert_denied(
    'no-self-clear-refund',
    'billing columns are service-role write only',
    'authenticated', v_auth,
    'update public.users set refunded_at = null where auth_user_id = auth.uid()',
    'a refunded account can clear its own refund and restore entitlement');

  perform t.assert_denied(
    'no-self-promote-admin',
    'role is service-role write only: a client cannot become an admin',
    'authenticated', v_auth,
    'update public.users set role = ''admin'' where auth_user_id = auth.uid()',
    'a signed-in account can promote itself to admin, which would hand it Amy''s console');

  perform t.assert_denied(
    'no-self-attribute-referral',
    'referral attribution is service-role write only',
    'authenticated', v_auth,
    'update public.users set referred_by_builder_id = null where auth_user_id = auth.uid()',
    'a homeowner can rewrite their own referral attribution, which decides who is owed the success fee');

  -- ── the app-data columns the homeowner DOES own ───────────────────────────
  perform t.assert_ok(
    'owns-course-progress',
    'a homeowner owns their own course progress and packet',
    'authenticated', v_auth,
    'update public.users set completed_chapters = ''["c1"]''::jsonb where auth_user_id = auth.uid()',
    'a homeowner cannot record their own course progress, so persisted progress cannot work');

  perform t.assert_ok(
    'owns-knowledge-result',
    'a homeowner owns their own quiz result',
    'authenticated', v_auth,
    'update public.users set knowledge_result = ''{"score": 8}''::jsonb where auth_user_id = auth.uid()',
    'a homeowner cannot record their own quiz result, so persisted quiz results cannot work');

  perform t.assert_scalar(
    'progress-persisted',
    'course progress and quiz results persist server side',
    'authenticated', v_auth,
    'select completed_chapters::text from public.users where auth_user_id = auth.uid()',
    '["c1"]',
    'the write was accepted but the value did not persist');

  -- ── nobody writes another person's row ───────────────────────────────────
  declare
    v_other uuid := t.mk_paid_homeowner();
  begin
    perform t.assert_count(
      'no-cross-account-write',
      'a signed-in person writes only their own row',
      'authenticated', v_auth,
      format('select 1 from public.users where id = %L', v_other),
      0,
      'a homeowner can see another account''s row, so a cross-account write is reachable');
  end;

  -- ── signup metadata cannot mint an admin ─────────────────────────────────
  declare
    v_a uuid;
    v_r text;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'self-admin@example.test', '{"role": "admin"}'::jsonb)
    returning id into v_a;
    select role into v_r from public.users where auth_user_id = v_a;
    perform t.assert(
      'signup-role-clamped',
      'the signup role is clamped server side to homeowner or pro',
      v_r = 'homeowner',
      format('a signup that asked for role "admin" produced role %L; the clamp in handle_new_auth_user is the only thing standing between a public signup form and the admin console', v_r));

    insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'self-pro@example.test', '{"role": "pro"}'::jsonb)
    returning id into v_a;
    select role into v_r from public.users where auth_user_id = v_a;
    perform t.assert(
      'signup-pro-allowed',
      'the signup role is clamped server side to homeowner or pro',
      v_r = 'pro',
      format('a builder signup produced role %L instead of pro', v_r));
  end;
end
$$;


-- =============================================================================
-- DECISION 2n — the worksheet and Ready Score authorization boundary.
--
-- Every assertion below goes through the same door PostgREST goes through: the
-- API role, the JWT claim GUCs, and nothing the schema owner can see that a
-- request cannot. The three things being protected, all of which were inside
-- users.builder_packet before 0013:
--
--   worksheets{}  the seven preparation worksheets AND the ADU Ready Score,
--                 which is the 'readyScore' KEY INSIDE that same map
--   lot           the lot geometry behind the buildable envelope and the
--                 Property Report — not a worksheet, not a brief field, and the
--                 part a careless split leaves behind
--
-- and the two things that must KEEP working for tiers that own them:
--
--   completed_chapters / knowledge_result   course progress and quiz results
--   builder_packet                          the twelve-question project brief
-- =============================================================================
do $$
declare
  v_free   uuid := t.mk_account('homeowner');           -- signed up, never paid
  v_gold   uuid := t.mk_paid_homeowner('roadmap');      -- Golden
  v_plat   uuid := t.mk_paid_homeowner('report');       -- Platinum
  v_plat2  uuid := t.mk_paid_homeowner('report');       -- a second Platinum homeowner
  v_conc   uuid := t.mk_paid_homeowner('concierge');    -- Concierge
  v_down   uuid := t.mk_paid_homeowner('report');       -- Platinum, later downgraded
  v_ref    uuid := t.mk_paid_homeowner('report');       -- Platinum, later refunded
  a_free   uuid; a_gold uuid; a_plat uuid; a_plat2 uuid; a_conc uuid; a_down uuid; a_ref uuid;
  v_sheets text := '{"readyScore": {"grade": "B", "points": 82, "answers": {"z-permitted": true}}, "preSite": {"values": {"water": "4000"}}}';
  v_lot    text := '{"address": "1 Test St", "input": {"width": "60", "depth": "120"}, "dimsEstimated": false}';
begin
  a_free  := t.authid(v_free);
  a_gold  := t.authid(v_gold);
  a_plat  := t.authid(v_plat);
  a_plat2 := t.authid(v_plat2);
  a_conc  := t.authid(v_conc);
  a_down  := t.authid(v_down);
  a_ref   := t.authid(v_ref);

  -- ═══ 4. A PLATINUM HOMEOWNER REACHES THEIR OWN, through the real write path ═
  -- Written first, as the entitled customer, so every "cannot reach it" below is
  -- proved against data that genuinely exists rather than against an empty table.
  perform t.assert_ok(
    'platinum-writes-own-worksheets',
    '2, 2n: Platinum and Concierge can reach the worksheets and the Ready Score',
    'authenticated', a_plat,
    format('select public.save_homeowner_worksheets(%L::jsonb, %L::jsonb)', v_sheets, v_lot),
    'a Platinum customer cannot save the worksheets they paid for, so the boundary was built in the wrong place');

  perform t.assert_scalar(
    'platinum-ready-score-persisted',
    '2n: the Ready Score is a key inside the worksheets map and persists with it',
    'authenticated', a_plat,
    'select worksheets->''readyScore''->>''grade'' from public.homeowner_worksheets',
    'B',
    'the write was accepted but the Ready Score did not come back');

  perform t.assert_scalar(
    'platinum-lot-persisted',
    '2n: the lot geometry carries the same entitlement as the worksheets',
    'authenticated', a_plat,
    'select lot->>''address'' from public.homeowner_worksheets',
    '1 Test St',
    'the lot geometry did not persist, so the Property Report and the buildable envelope lose the geometry the customer tuned');

  -- Saving one worksheet must not drop the others: the map is merged per key.
  perform t.assert_ok(
    'platinum-second-write-merges',
    '2n: saving one worksheet never drops another (the Ready Score lives in the same map)',
    'authenticated', a_plat,
    'select public.save_homeowner_worksheets(''{"totalCost": {"values": {"final": "310000"}}}''::jsonb, null)',
    'the second worksheet write was refused');

  perform t.assert_scalar(
    'platinum-merge-kept-ready-score',
    '2n: saving one worksheet never drops another',
    'authenticated', a_plat,
    'select worksheets->''readyScore''->>''points'' from public.homeowner_worksheets',
    '82',
    'saving a second worksheet replaced the whole map and destroyed the Ready Score');

  perform t.assert_scalar(
    'platinum-merge-kept-lot',
    '2n: a null argument means "leave this alone", never "clear it"',
    'authenticated', a_plat,
    'select lot->>''address'' from public.homeowner_worksheets',
    '1 Test St',
    'a worksheet write with no lot argument wiped the lot geometry');

  perform t.assert_scalar(
    'platinum-entitlement-true',
    '2n: the entitlement predicate reads the live tier from trusted server state',
    'authenticated', a_plat,
    'select public.has_worksheet_entitlement()::text',
    'true',
    'a live Platinum account does not hold the worksheet entitlement');

  -- ═══ 5. A CONCIERGE HOMEOWNER REACHES THEIR OWN APPLICABLE DATA ════════════
  perform t.assert_ok(
    'concierge-writes-own-worksheets',
    '2: Concierge includes everything in Platinum',
    'authenticated', a_conc,
    format('select public.save_homeowner_worksheets(%L::jsonb, %L::jsonb)', v_sheets, v_lot),
    'a Concierge customer cannot save the worksheets Platinum includes');

  perform t.assert_count(
    'concierge-reads-own-only',
    '2n: a homeowner reaches their own row and no other',
    'authenticated', a_conc,
    'select 1 from public.homeowner_worksheets',
    1,
    'a Concierge customer sees a row count other than their own single row');

  -- Concierge-specific data is NOT in this structure, and this is the assertion
  -- that keeps it out. Concierge is 60 minutes of consultation plus written
  -- support (decision 4): both live on the studies table and in
  -- support_messages, each with its own boundary. If a later migration parks
  -- Concierge data in the worksheet table it would silently inherit the
  -- PLATINUM predicate, which is the wrong entitlement.
  perform t.assert_columns(
    'worksheet-table-holds-only-worksheet-data',
    '2n: the entitled table holds the worksheets and the lot, and nothing that belongs to another entitlement',
    'public.homeowner_worksheets',
    array['user_id', 'worksheets', 'lot', 'created_at', 'updated_at'],
    'a column appeared on public.homeowner_worksheets. Anything stored here inherits the Platinum-and-Concierge predicate, so data belonging to another entitlement (Concierge consultation, course progress, the project brief) must not live here');

  perform t.assert(
    'concierge-consultation-lives-elsewhere',
    '2n: no Concierge-specific data sits in the worksheet structure',
    t.has_column('public.studies', 'consult_minutes_used')
      and t.has_column('public.studies', 'consult_link')
      and t.has_relation('public.support_messages'),
    'the Concierge consultation minutes, the scheduling link or the written support thread is no longer where 0003 put it. If Concierge data has moved into the packet structure it needs its OWN entitlement, not the Platinum one');

  -- ═══ 1. ANONYMOUS REACHES NOTHING ══════════════════════════════════════════
  -- Refused outright, not filtered: anon holds no grant at all on this table.
  perform t.assert_denied(
    'anon-cannot-read-worksheets',
    '2n: anonymous cannot read the worksheets or the Ready Score',
    'anon', null,
    'select count(*) from public.homeowner_worksheets',
    'the anonymous role can read the Platinum worksheet table');

  perform t.assert_denied(
    'anon-cannot-write-worksheets',
    '2n: anonymous cannot write the worksheets or the Ready Score',
    'anon', null,
    format('insert into public.homeowner_worksheets (user_id, worksheets) values (%L, ''{"x": 1}''::jsonb)', v_plat),
    'the anonymous role can insert into the Platinum worksheet table');

  perform t.assert_denied(
    'anon-cannot-call-the-write-rpc',
    '2n: anonymous cannot reach the worksheet write path',
    'anon', null,
    'select public.save_homeowner_worksheets(''{"x": 1}''::jsonb, null)',
    'the anonymous role can call save_homeowner_worksheets');

  perform t.assert_denied(
    'anon-cannot-ask-the-entitlement-question',
    '2n: the entitlement predicate is not anonymous surface',
    'anon', null,
    'select public.has_worksheet_entitlement()',
    'the anonymous role can execute has_worksheet_entitlement');

  perform t.assert_denied(
    'anon-cannot-read-the-merged-view',
    '2n: the service-role study view is not public surface',
    'anon', null,
    'select count(*) from public.homeowner_packet_full',
    'the anonymous role can read the merged packet view, which joins a homeowner''s Platinum data to their email');

  perform t.assert_count(
    'anon-holds-no-grant-on-the-worksheet-table',
    '2n: anonymous cannot read or write the protected data, by grant and not by policy alone',
    'service_role', null,
    format($q$select privilege_type from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'homeowner_worksheets'
                and grantee = 'anon'$q$),
    0,
    'the anon role holds a table grant on public.homeowner_worksheets, so the only thing standing between an anonymous request and the Platinum data is a policy');

  -- ═══ 2. A FREE AUTHENTICATED ACCOUNT REACHES NOTHING ═══════════════════════
  -- Filtered, not refused: a signed-in account may ASK, and the policy answers
  -- with nothing. The difference from anon is deliberate and both are asserted.
  perform t.assert_count(
    'free-account-sees-no-worksheets',
    '2, 2n: worksheets and the Ready Score are Platinum and Concierge only',
    'authenticated', a_free,
    'select 1 from public.homeowner_worksheets',
    0,
    'a signed-in account that never paid can read Platinum worksheet rows');

  perform t.assert_scalar(
    'free-account-entitlement-false',
    '2n: the entitlement predicate fails closed for an unpaid account',
    'authenticated', a_free,
    'select public.has_worksheet_entitlement()::text',
    'false',
    'an account that never paid holds the worksheet entitlement');

  perform t.assert_denied(
    'free-account-cannot-write-worksheets',
    '2, 2n: worksheets and the Ready Score are Platinum and Concierge only',
    'authenticated', a_free,
    'select public.save_homeowner_worksheets(''{"readyScore": {"grade": "A"}}''::jsonb, null)',
    'a signed-in account that never paid can save a Ready Score through the write path');

  perform t.assert_denied(
    'free-account-cannot-insert-worksheets',
    '2, 2n: worksheets and the Ready Score are Platinum and Concierge only',
    'authenticated', a_free,
    format('insert into public.homeowner_worksheets (user_id, worksheets) values (%L, ''{"readyScore": {"grade": "A"}}''::jsonb)', v_free),
    'a free account can insert its own worksheet row directly through the table');

  -- ═══ 3. A GOLDEN BUYER REACHES NOTHING ═════════════════════════════════════
  perform t.assert_count(
    'golden-sees-no-worksheets',
    '2: worksheets and the Ready Score are Platinum and Concierge only, not Golden',
    'authenticated', a_gold,
    'select 1 from public.homeowner_worksheets',
    0,
    'a Golden buyer can read the Platinum worksheet table, which is the hole decision 2n exists to close');

  perform t.assert_scalar(
    'golden-entitlement-false',
    '2n: Golden does not hold the worksheet entitlement',
    'authenticated', a_gold,
    'select public.has_worksheet_entitlement()::text',
    'false',
    'the entitlement predicate says a Golden buyer may reach the worksheets');

  perform t.assert_denied(
    'golden-cannot-write-worksheets',
    '2: Golden does not include the worksheets or the Ready Score',
    'authenticated', a_gold,
    format('select public.save_homeowner_worksheets(%L::jsonb, %L::jsonb)', v_sheets, v_lot),
    'a Golden buyer can save the Platinum worksheet set through the write path');

  perform t.assert_denied(
    'golden-cannot-insert-worksheets',
    '2: Golden does not include the worksheets or the Ready Score',
    'authenticated', a_gold,
    format('insert into public.homeowner_worksheets (user_id, worksheets, lot) values (%L, %L::jsonb, %L::jsonb)', v_gold, v_sheets, v_lot),
    'a Golden buyer can insert a worksheet row directly through the table');

  -- The hole as it actually was: the worksheets lived in a jsonb column the
  -- signed-in user is granted UPDATE on. The keys are stripped on every write,
  -- so the attempt is accepted (the brief half of the same write must land) and
  -- changes nothing about the entitlement.
  perform t.assert_ok(
    'golden-brief-write-still-accepted',
    '2n: stripping the moved keys must not break the project brief write',
    'authenticated', a_gold,
    format('update public.users set builder_packet = ''{"zip": "85001", "turnkey": true, "worksheets": %s, "lot": %s}''::jsonb where auth_user_id = auth.uid()',
           v_sheets, v_lot),
    'the project brief write was refused, which would break /my-property for every tier');

  perform t.assert_scalar(
    'golden-cannot-stash-worksheets-in-builder-packet',
    '2n: users.builder_packet is the project brief; the worksheets key cannot come back',
    'authenticated', a_gold,
    'select (builder_packet ? ''worksheets'')::text from public.users where auth_user_id = auth.uid()',
    'false',
    'a Golden buyer can store the whole Platinum worksheet set, Ready Score included, in the jsonb column they are granted UPDATE on, and read it back on their own row');

  perform t.assert_scalar(
    'golden-cannot-stash-lot-in-builder-packet',
    '2n: users.builder_packet is the project brief; the lot key cannot come back',
    'authenticated', a_gold,
    'select (builder_packet ? ''lot'')::text from public.users where auth_user_id = auth.uid()',
    'false',
    'a Golden buyer can store the lot geometry in the jsonb column they are granted UPDATE on, which is the part a careless split leaves behind');

  perform t.assert_scalar(
    'golden-keeps-the-brief-from-that-write',
    '2n: exactly two keys are stripped, and the brief is untouched',
    'authenticated', a_gold,
    'select builder_packet->>''zip'' from public.users where auth_user_id = auth.uid()',
    '85001',
    'the strip took the brief with it, so the twelve questions no longer persist');

  perform t.assert_scalar(
    'golden-keeps-turnkey-from-that-write',
    '2n: exactly two keys are stripped; every other brief key survives',
    'authenticated', a_gold,
    'select builder_packet->>''turnkey'' from public.users where auth_user_id = auth.uid()',
    'true',
    'a brief key other than the two moved ones was stripped, so the strip is wider than the decision');

  -- ═══ 6. ONE PLATINUM HOMEOWNER CANNOT REACH ANOTHER'S ══════════════════════
  perform t.assert_ok(
    'second-platinum-writes-own',
    '2n: the second Platinum homeowner has their own row to be kept out of',
    'authenticated', a_plat2,
    'select public.save_homeowner_worksheets(''{"readyScore": {"grade": "A", "points": 95}}''::jsonb, ''{"address": "2 Other Ave"}''::jsonb)',
    'the second Platinum homeowner cannot save their own worksheets');

  perform t.assert_count(
    'platinum-cannot-read-another-homeowners-row',
    '2n: a Platinum homeowner reaches only their OWN worksheets',
    'authenticated', a_plat,
    format('select 1 from public.homeowner_worksheets where user_id = %L', v_plat2),
    0,
    'a Platinum homeowner reads another Platinum homeowner''s Ready Score and lot geometry by naming their id');

  perform t.assert_count(
    'platinum-sees-exactly-one-row',
    '2n: a Platinum homeowner reaches only their OWN worksheets',
    'authenticated', a_plat,
    'select 1 from public.homeowner_worksheets',
    1,
    'an unfiltered read returns more than the requester''s own row, so the whole Platinum customer base is readable');

  perform t.assert_changes_nothing(
    'platinum-cannot-write-another-homeowners-row',
    '2n: a Platinum homeowner writes only their OWN worksheets',
    'authenticated', a_plat,
    format('update public.homeowner_worksheets set worksheets = ''{"readyScore": {"grade": "F"}}''::jsonb where user_id = %L', v_plat2),
    'a Platinum homeowner can overwrite another homeowner''s Ready Score');

  -- Two directions, two mechanisms, and the difference is the point. Pulling
  -- ANOTHER row across is filtered: the USING clause never shows the row, so the
  -- statement is accepted and matches nothing. Pushing their OWN row into
  -- somebody else's slot is refused outright by the WITH CHECK clause.
  perform t.assert_changes_nothing(
    'platinum-cannot-claim-another-homeowners-row',
    '2n: changing an id must not move another homeowner''s data',
    'authenticated', a_plat,
    format('update public.homeowner_worksheets set user_id = %L where user_id = %L', v_plat, v_plat2),
    'a Platinum homeowner can take ownership of another homeowner''s worksheet row by rewriting the id');

  perform t.assert_denied(
    'platinum-cannot-hand-their-row-to-another-account',
    '2n: a homeowner writes only their own row, in either direction',
    'authenticated', a_plat,
    format('update public.homeowner_worksheets set user_id = %L where user_id = %L', v_plat2, v_plat),
    'a Platinum homeowner can re-point their own worksheet row at another account, which writes into somebody else''s slot');

  perform t.assert_denied(
    'platinum-cannot-insert-for-another-account',
    '2n: a homeowner acts only as themselves',
    'authenticated', a_plat,
    format('insert into public.homeowner_worksheets (user_id, worksheets) values (%L, ''{"x": 1}''::jsonb)', v_free),
    'a Platinum homeowner can create a worksheet row in another account''s name');

  perform t.assert_denied(
    'nobody-deletes-worksheet-history',
    '2n: an entitlement change must never destroy the customer''s work',
    'authenticated', a_plat,
    'delete from public.homeowner_worksheets',
    'the authenticated role holds DELETE on the worksheet table, so a lapsed or hostile client can destroy saved work');

  perform t.assert_scalar(
    'second-platinum-row-intact',
    '2n: a Platinum homeowner reaches only their OWN worksheets',
    'authenticated', a_plat2,
    'select worksheets->''readyScore''->>''grade'' from public.homeowner_worksheets',
    'A',
    'the second homeowner''s Ready Score changed, so one of the cross-account attempts above landed');

  -- ═══ 7. A USER CANNOT CHANGE THEIR OWN TIER AND GAIN ACCESS ════════════════
  perform t.assert_denied(
    'golden-cannot-self-upgrade-to-platinum',
    '2n: the authoritative tier comes from trusted server state, never the client',
    'authenticated', a_gold,
    'update public.users set paid_tier = ''report'' where auth_user_id = auth.uid()',
    'a Golden buyer can write their own tier and become Platinum for free');

  perform t.assert_denied(
    'golden-cannot-repoint-their-auth-user-id',
    '2n: a homeowner cannot re-point their account row at another identity',
    'authenticated', a_gold,
    format('update public.users set auth_user_id = %L where auth_user_id = auth.uid()', a_plat),
    'a signed-in account can rewrite auth_user_id, which would hand it another customer''s entitlement and data');

  perform t.assert_count(
    'golden-still-sees-no-worksheets-after-trying',
    '2n: no change to a request, a URL, local state, a tier value or a client payload grants access',
    'authenticated', a_gold,
    'select 1 from public.homeowner_worksheets',
    0,
    'a Golden buyer reached the worksheets after attempting to write their own tier');

  -- ═══ 8. A DIRECT, POSTGREST-SHAPED CALL CANNOT BYPASS IT ═══════════════════
  -- Every assertion in this file is already a direct call: the API role plus the
  -- JWT claim GUCs, with no application code in the path. These four attack the
  -- request itself and the shape of the code behind it.
  perform t.assert_scalar(
    'forged-role-claim-grants-nothing',
    '2n: the database role comes from the verified key, not from a claim a client can type',
    'authenticated', a_gold,
    'select count(*)::text from public.homeowner_worksheets
      where set_config(''request.jwt.claim.role'', ''service_role'', true) is not null',
    '0',
    'a request that claims the service role in its JWT payload reads the Platinum worksheet table');

  perform t.assert_scalar(
    'forged-role-claim-does-not-move-the-predicate',
    '2n: the entitlement predicate ignores anything the request can set',
    'authenticated', a_gold,
    'select public.has_worksheet_entitlement()::text
       from (select set_config(''request.jwt.claim.role'', ''service_role'', true)) _forged',
    'false',
    'forging the role claim changes the entitlement answer');

  -- The positive control for the two assertions above: without it, a forged claim
  -- that silently failed to land would make them pass while proving nothing.
  perform t.assert_scalar(
    'forged-role-claim-really-lands',
    '2n: the forged-claim assertions are attacking something real',
    'authenticated', a_gold,
    'select auth.role() from (select set_config(''request.jwt.claim.role'', ''service_role'', true)) _forged',
    'service_role',
    'the forged claim did not take effect, so the two assertions above prove nothing. Fix the control before trusting them');

  -- Anything SECURITY DEFINER that touches the worksheet table runs with the
  -- owner's rights and steps straight past the policies. Today nothing does, and
  -- this assertion is how the next migration finds out that it must not.
  perform t.assert_count(
    'no-definer-function-reaches-the-worksheet-table',
    '2n: no security-definer routine hands the worksheets out from behind the policies',
    'service_role', null,
    $q$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and pg_get_functiondef(p.oid) ilike '%homeowner_worksheets%'$q$,
    0,
    'a SECURITY DEFINER function in schema public reads or writes public.homeowner_worksheets. Such a function runs with the owner''s rights, so it bypasses the entitlement policies entirely and becomes the new hole. The write path is deliberately SECURITY INVOKER; anything that needs owner rights belongs to the service role instead');

  perform t.assert(
    'write-path-is-security-invoker',
    '2n: the write path must not be a way round the policies',
    not (select p.prosecdef
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'save_homeowner_worksheets'),
    'public.save_homeowner_worksheets is SECURITY DEFINER. That single word hands every signed-in account the Platinum worksheet set, because the function would then run with the owner''s rights instead of the caller''s policies');

  perform t.assert(
    'entitlement-predicate-takes-no-arguments',
    '2n: authoritative entitlement comes from server state, so there is no parameter to substitute',
    (select p.pronargs = 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'has_worksheet_entitlement'),
    'has_worksheet_entitlement takes an argument. An entitlement question with a parameter is an entitlement question a client can answer for itself');

  perform t.assert(
    'worksheet-table-has-rls-enabled',
    '2n: the grant is not the whole story; row level security decides which row',
    (select c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'homeowner_worksheets'),
    'row level security is NOT enabled on public.homeowner_worksheets, so every signed-in account with the table grant reads every homeowner''s worksheets');

  perform t.assert(
    'brief-only-trigger-is-enabled',
    '2n: users.builder_packet cannot start holding the moved keys again',
    (select tg.tgenabled = 'O'
       from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'users'
        and tg.tgname = 'users_builder_packet_brief_only'),
    'the trigger that keeps users.builder_packet to the project brief is missing or disabled, which re-opens the original hole: an ungated jsonb column that can hold the Platinum worksheet set');

  perform t.assert_denied(
    'signed-in-account-cannot-read-the-merged-view',
    '2n: the merged study view is service-role only for everybody',
    'authenticated', a_plat,
    'select count(*) from public.homeowner_packet_full',
    'a signed-in homeowner can read the merged packet view, which joins every homeowner''s Platinum data to their email');

  perform t.assert_count(
    'merged-view-carries-the-moved-keys-for-study-production',
    '2n: study production keeps the whole brief after the separation',
    'service_role', null,
    format($q$select 1 from public.homeowner_packet_full
              where user_id = %L
                and builder_packet -> 'worksheets' -> 'readyScore' ->> 'grade' = 'B'
                and builder_packet -> 'lot' ->> 'address' = '1 Test St'$q$, v_plat),
    1,
    'the service-role view no longer presents the worksheets and lot in the shape api/admin/_studies.js projectBrief() reads, so the Ready Score and lot dimensions stop reaching the person producing the feasibility study');

  -- ═══ 9. LOSING THE ENTITLEMENT REMOVES ACCESS, NOT HISTORY ═════════════════
  perform t.assert_ok(
    'downgraded-account-had-worksheets',
    '2n: the downgrade case is proved against data that exists',
    'authenticated', a_down,
    format('select public.save_homeowner_worksheets(%L::jsonb, %L::jsonb)', v_sheets, v_lot),
    'the soon-to-be-downgraded Platinum customer could not save their worksheets');

  perform t.assert_ok(
    'refunded-account-had-worksheets',
    '2n: the refund case is proved against data that exists',
    'authenticated', a_ref,
    format('select public.save_homeowner_worksheets(%L::jsonb, %L::jsonb)', v_sheets, v_lot),
    'the soon-to-be-refunded Platinum customer could not save their worksheets');

  -- The webhook's job, with the service role, exactly as production does it.
  update public.users set paid_tier = 'roadmap' where id = v_down;
  update public.users set refunded_at = now() where id = v_ref;

  perform t.assert_count(
    'downgraded-to-golden-loses-worksheet-access',
    '2n: removing or downgrading an entitlement removes protected access',
    'authenticated', a_down,
    'select 1 from public.homeowner_worksheets',
    0,
    'a customer downgraded to Golden keeps reading the Platinum worksheets and Ready Score');

  perform t.assert_denied(
    'downgraded-to-golden-cannot-write-worksheets',
    '2n: removing or downgrading an entitlement removes protected access',
    'authenticated', a_down,
    'select public.save_homeowner_worksheets(''{"readyScore": {"grade": "A"}}''::jsonb, null)',
    'a customer downgraded to Golden can still write their Ready Score');

  perform t.assert_count(
    'refunded-account-loses-worksheet-access',
    '2n: entitlement is paid_at is not null AND refunded_at is null',
    'authenticated', a_ref,
    'select 1 from public.homeowner_worksheets',
    0,
    'a refunded customer keeps Platinum worksheet access');

  perform t.assert_scalar(
    'downgraded-account-history-survives',
    '2n: access goes, the customer''s work stays',
    'service_role', null,
    format('select worksheets->''readyScore''->>''grade'' from public.homeowner_worksheets where user_id = %L', v_down),
    'B',
    'the downgrade destroyed the customer''s saved Ready Score. Access is a policy question; deleting their work is a different and worse answer');

  perform t.assert_scalar(
    'refunded-account-history-survives',
    '2n: access goes, the customer''s work stays',
    'service_role', null,
    format('select lot->>''address'' from public.homeowner_worksheets where user_id = %L', v_ref),
    '1 Test St',
    'the refund destroyed the customer''s saved lot geometry');

  -- Re-entitled by the webhook: the work is still there and comes back.
  update public.users set paid_tier = 'report' where id = v_down;

  perform t.assert_scalar(
    'restored-entitlement-reaches-the-preserved-work',
    '2n: an entitlement restored reaches the work that was preserved, not an empty row',
    'authenticated', a_down,
    'select worksheets->''readyScore''->>''points'' from public.homeowner_worksheets',
    '82',
    'a customer who upgraded back to Platinum cannot see the Ready Score they had already completed');

  -- ═══ 10. COURSE PROGRESS STILL WORKS, FOR THE TIERS THAT OWN IT ════════════
  -- The trap this design avoids: RLS is per-ROW, not per-column, so demanding
  -- Platinum on the users UPDATE policy would have taken a Golden learner's
  -- course progress away with it.
  perform t.assert_ok(
    'golden-still-records-course-progress',
    '2n: existing legitimate flows keep working — course progress is course entitlement',
    'authenticated', a_gold,
    'update public.users set completed_chapters = ''{"v": 1, "chapters": ["m1c1", "m1c2"], "quizzes": {}}''::jsonb where auth_user_id = auth.uid()',
    'a Golden buyer can no longer record course progress, so the separation took the course with it');

  perform t.assert_scalar(
    'golden-course-progress-persisted',
    '2n: existing legitimate flows keep working',
    'authenticated', a_gold,
    'select jsonb_array_length(completed_chapters->''chapters'')::text from public.users where auth_user_id = auth.uid()',
    '2',
    'the Golden buyer''s course progress write was accepted but did not persist');

  perform t.assert_ok(
    'golden-still-records-quiz-results',
    '2n: existing legitimate flows keep working — quiz results are course entitlement',
    'authenticated', a_gold,
    'update public.users set knowledge_result = ''{"score": 9, "total": 10}''::jsonb where auth_user_id = auth.uid()',
    'a Golden buyer can no longer record a quiz result');

  perform t.assert_ok(
    'free-account-still-records-course-progress',
    '2n: the separation changed nothing about who owns course progress',
    'authenticated', a_free,
    'update public.users set completed_chapters = ''{"v": 1, "chapters": ["m1c1"], "quizzes": {}}''::jsonb where auth_user_id = auth.uid()',
    'a signed-in account can no longer record progress it could record before 0013');

  -- ═══ 11. THE PROJECT BRIEF STILL WORKS FOR EVERY TIER THAT HAS IT ══════════
  declare
    v_brief text := '{"zip": "85281", "lotSize": "7200", "budget": "$250K", "purpose": "family", "timeline": "1 year", "address": "3 Brief Rd", "aduType": "detached", "desiredSqft": "800", "stories": "1", "siteAccess": "gate 9ft", "utilityNotes": "panel 200A", "hoaNotes": "none", "turnkey": true}';
    r record;
  begin
    for r in
      select 'golden' as label, a_gold as auth
      union all select 'platinum', a_plat
      union all select 'concierge', a_conc
    loop
      perform t.assert_ok(
        'brief-writable-' || r.label,
        '2n: the twelve-question project brief keeps working for every tier that has it',
        'authenticated', r.auth,
        format('update public.users set builder_packet = %L::jsonb where auth_user_id = auth.uid()', v_brief),
        format('a %s customer can no longer save the project brief', r.label));

      perform t.assert_scalar(
        'brief-persisted-' || r.label,
        '2n: the twelve-question project brief keeps working for every tier that has it',
        'authenticated', r.auth,
        'select builder_packet->>''address'' from public.users where auth_user_id = auth.uid()',
        '3 Brief Rd',
        format('the %s customer''s project brief did not persist', r.label));
    end loop;
  end;

  -- The brief write above carried no worksheets key, and the Platinum
  -- customer's worksheets must still be there: the two stores are independent.
  perform t.assert_scalar(
    'brief-write-does-not-touch-the-worksheets',
    '2n: the brief and the entitled data are separate stores, not one column',
    'authenticated', a_plat,
    'select worksheets->''readyScore''->>''grade'' from public.homeowner_worksheets',
    'B',
    'saving the project brief cleared the Platinum worksheets');
end
$$;


-- =============================================================================
-- 12. EXISTING LEGITIMATE DATA MIGRATES SAFELY.
--
-- Migration 0013 moved every legacy users.builder_packet worksheets/lot into
-- public.homeowner_worksheets and stripped the keys. Proving that needs a row in
-- the PRE-0013 shape, and after 0013 the trigger makes that shape unwritable —
-- which is the point of the trigger. So the only honest way to test the
-- migration is to recreate the legacy shape the way a replica stream would, with
-- triggers suppressed for exactly that one write, and then run the migration's
-- own backfill function against it. The setting is restored immediately, and the
-- last assertion in this file proves the boundary is closed again afterwards.
--
-- This is NOT a test-only reimplementation of the migration: it calls
-- public.backfill_worksheet_packet(), the same function 0013 itself calls.
-- =============================================================================
do $$
declare
  v_fresh  uuid := t.mk_paid_homeowner('report');   -- legacy packet, no new row yet
  v_merge  uuid := t.mk_paid_homeowner('report');   -- legacy packet AND a newer row
  v_brief  uuid := t.mk_paid_homeowner('report');   -- brief only, nothing to move
  a_fresh  uuid := t.authid(v_fresh);
  a_merge  uuid := t.authid(v_merge);
  v_moved  integer;
  v_legacy text := '{"zip": "85004", "address": "9 Legacy Ln", "worksheets": {"readyScore": {"grade": "C", "points": 71}, "preSite": {"values": {"sewer": "6000"}}}, "lot": {"address": "9 Legacy Ln", "input": {"width": "50"}}}';
begin
  -- The newer row for the merge case, written the way the product writes it.
  perform t.x('authenticated', a_merge,
    'select public.save_homeowner_worksheets(''{"readyScore": {"grade": "A", "points": 96}}''::jsonb, ''{"address": "9 Newer Ln"}''::jsonb)');

  -- Recreate the pre-0013 shape. The user triggers on public.users are off for
  -- these three writes only.
  --
  -- This used session_replication_role = 'replica', which needs a SUPERUSER. On
  -- a real Supabase project postgres is not one, so under run.sh --target this
  -- whole section errored and its assertions never ran (found on staging,
  -- 2026-09-26). DISABLE TRIGGER USER needs only ownership of the table, which
  -- postgres holds for every table the migrations create; it suppresses the same
  -- triggers on this table for the same three writes; and it is TRANSACTIONAL:
  -- if anything here fails, the rollback re-enables them, where the old session
  -- setting could outlive a failure. It behaves identically in every mode. There
  -- are no deferrable constraints in the schema, so no pending trigger event can
  -- block the ALTER.
  execute 'alter table public.users disable trigger user';
  update public.users set builder_packet = v_legacy::jsonb where id in (v_fresh, v_merge);
  update public.users set builder_packet = '{"zip": "85007", "turnkey": true}'::jsonb where id = v_brief;
  execute 'alter table public.users enable trigger user';

  perform t.assert(
    'legacy-shape-recreated',
    '2n: the migration is proved against a row in the real pre-0013 shape',
    (select builder_packet ? 'worksheets' and builder_packet ? 'lot'
       from public.users where id = v_fresh),
    'the pre-0013 shape could not be recreated, so the migration assertions below would prove nothing');

  -- The migration's own routine, run again. It is idempotent by design.
  v_moved := public.backfill_worksheet_packet();

  perform t.assert(
    'backfill-reports-what-it-moved',
    '2n: existing legitimate data migrates safely',
    v_moved = 2,
    format('backfill_worksheet_packet() moved %s account(s); the two accounts holding a legacy worksheets/lot key were expected', v_moved));

  perform t.assert_scalar(
    'legacy-worksheets-arrived',
    '2n: existing legitimate data migrates safely',
    'authenticated', a_fresh,
    'select worksheets->''readyScore''->>''grade'' from public.homeowner_worksheets',
    'C',
    'a customer''s existing Ready Score did not survive the move out of users.builder_packet');

  perform t.assert_scalar(
    'legacy-other-worksheet-arrived',
    '2n: existing legitimate data migrates safely — all seven worksheets, not just the one noticed',
    'authenticated', a_fresh,
    'select worksheets->''preSite''->''values''->>''sewer'' from public.homeowner_worksheets',
    '6000',
    'only part of the legacy worksheets map was moved');

  perform t.assert_scalar(
    'legacy-lot-arrived',
    '2n: existing legitimate data migrates safely — including the lot geometry',
    'authenticated', a_fresh,
    'select lot->>''address'' from public.homeowner_worksheets',
    '9 Legacy Ln',
    'the legacy lot geometry was left behind in users.builder_packet or dropped');

  perform t.assert_scalar(
    'legacy-brief-survives-the-move',
    '2n: existing legitimate data migrates safely — the brief stays where it was',
    'authenticated', a_fresh,
    'select builder_packet->>''address'' from public.users where auth_user_id = auth.uid()',
    '9 Legacy Ln',
    'the migration took the project brief with the worksheets');

  perform t.assert_scalar(
    'legacy-keys-left-the-ungated-column',
    '2n: after the move, the ungated column holds the brief only',
    'authenticated', a_fresh,
    'select (builder_packet ?| array[''worksheets'', ''lot''])::text from public.users where auth_user_id = auth.uid()',
    'false',
    'the worksheets or lot key is still in users.builder_packet after the migration, so the data was copied rather than moved and the original hole is still open');

  -- The merge case: a newer row wins per key, and nothing is overwritten.
  perform t.assert_scalar(
    'newer-row-wins-over-the-legacy-copy',
    '2n: a migration must not overwrite work the customer did after it',
    'authenticated', a_merge,
    'select worksheets->''readyScore''->>''points'' from public.homeowner_worksheets',
    '96',
    'the legacy copy overwrote a newer Ready Score, so the migration destroyed the customer''s latest work');

  perform t.assert_scalar(
    'legacy-only-key-is-filled-in',
    '2n: a migration must not drop what only the legacy copy holds',
    'authenticated', a_merge,
    'select worksheets->''preSite''->''values''->>''sewer'' from public.homeowner_worksheets',
    '6000',
    'a worksheet that existed only in the legacy copy was dropped instead of filled in');

  perform t.assert_scalar(
    'newer-lot-wins-over-the-legacy-copy',
    '2n: a migration must not overwrite work the customer did after it',
    'authenticated', a_merge,
    'select lot->>''address'' from public.homeowner_worksheets',
    '9 Newer Ln',
    'the legacy lot geometry overwrote a newer one');

  -- An account with nothing to move gets no row invented for it.
  perform t.assert_count(
    'brief-only-account-gets-no-row',
    '2n: unknown means unknown — a migration invents nothing',
    'service_role', null,
    format('select 1 from public.homeowner_worksheets where user_id = %L', v_brief),
    0,
    'the backfill created an empty worksheet row for an account that never had worksheets');

  -- Idempotent: running it again moves nothing and changes nothing.
  v_moved := public.backfill_worksheet_packet();
  perform t.assert(
    'backfill-is-idempotent',
    '2n: the migration can be re-run without consequence',
    v_moved = 0,
    format('a second backfill_worksheet_packet() reported %s account(s) moved; after the first run there is nothing left in the legacy shape', v_moved));

  perform t.assert_scalar(
    'backfill-rerun-changed-nothing',
    '2n: the migration can be re-run without consequence',
    'authenticated', a_merge,
    'select worksheets->''readyScore''->>''points'' from public.homeowner_worksheets',
    '96',
    'a second backfill run changed a customer''s saved work');

  -- And the boundary is closed again: the suppressed-trigger writes above were a
  -- three-statement fixture, not a door left open.
  perform t.assert_ok(
    'brief-write-accepted-after-the-replay',
    '2n: the fixture restored normal behaviour',
    'authenticated', a_fresh,
    format('update public.users set builder_packet = %L::jsonb where auth_user_id = auth.uid()', v_legacy),
    'the project brief write is refused after the migration replay, so the fixture left the database in a different state');

  perform t.assert_scalar(
    'strip-trigger-live-again-after-the-replay',
    '2n: users.builder_packet holds the project brief, and the replay did not leave that unenforced',
    'authenticated', a_fresh,
    'select (builder_packet ?| array[''worksheets'', ''lot''])::text from public.users where auth_user_id = auth.uid()',
    'false',
    'the moved keys persisted in users.builder_packet after the migration replay: the user triggers were left disabled, or the trigger is gone, and the original hole is open again');
end
$$;
