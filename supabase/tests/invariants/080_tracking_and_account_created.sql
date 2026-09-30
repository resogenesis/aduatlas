-- =============================================================================
-- INVARIANT: attribution may only ever point at a listing whose tracking is
-- active, and an account is counted once.
--
-- Spec: decisions 2c and 13. Tracking activates on claim and never runs for an
-- unclaimed listing. builder_tracking_active() is the single definition of the
-- rule, and every writer must go through it.
--
-- The awkward case 0008 closed is the one worth keeping a test on: a lead
-- captured WHILE a listing was claimed, whose account is created AFTER the
-- account was removed. The lead row still carries the attribution, so a trigger
-- that trusted the lead rather than re-asking the rule would credit an unclaimed
-- listing. Recording nothing is the right answer.
-- =============================================================================
select t.suite('080 tracking and account_created');

do $$
declare
  v_claimed uuid := t.mk_claimed_builder();
  v_code_c  text;
  v_auth    uuid;
  v_uid     uuid;
begin
  select referral_code into v_code_c from public.builders where id = v_claimed;

  -- ── the ordinary path: lead then account, tracking active throughout ──────
  perform public.capture_lead('inherit-ok@example.test'::citext, 'unlock', null, v_code_c);
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), 'inherit-ok@example.test', '{}'::jsonb) returning id into v_auth;
  select id into v_uid from public.users where auth_user_id = v_auth;

  perform t.assert_scalar(
    'account-inherits-attribution',
    'a new account inherits its lead''s referrer while that builder''s tracking is active',
    'service_role', null,
    format('select (referred_by_builder_id = %L) as r from public.users where id = %L', v_claimed, v_uid),
    'true',
    'an account created from an attributed lead did not inherit the attribution, so the builder who brought the customer in is not credited');

  perform t.assert_count(
    'account-created-logged-once',
    'a person is counted as an account once per builder',
    'service_role', null,
    format('select 1 from public.referral_events where builder_id = %L and kind = ''account_created'' and user_id = %L', v_claimed, v_uid),
    1,
    'the account_created event was not recorded exactly once; two triggers can reach for it and the unique index is what makes them idempotent together');

  -- ── the case 0008 closed: claim given up between lead and account ─────────
  declare
    v_lost  uuid := t.mk_claimed_builder();
    v_code_l text;
    v_auth2 uuid;
    v_uid2  uuid;
  begin
    select referral_code into v_code_l from public.builders where id = v_lost;
    perform public.capture_lead('inherit-lost@example.test'::citext, 'unlock', null, v_code_l);

    -- The lead is attributed at this point; confirm it before removing the owner,
    -- or the test would pass for the wrong reason.
    perform t.assert_scalar(
      'lead-was-attributed-first',
      'the 0008 case needs a lead that really was attributed before the claim was lost',
      'service_role', null,
      format('select (referred_by_builder_id = %L) as r from public.leads where email = ''inherit-lost@example.test''', v_lost),
      'true',
      'the fixture lead was never attributed, so the following assertion proves nothing');

    update public.builders set owner_user_id = null where id = v_lost;

    insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'inherit-lost@example.test', '{}'::jsonb) returning id into v_auth2;
    select id into v_uid2 from public.users where auth_user_id = v_auth2;

    perform t.assert_scalar(
      'lost-claim-no-inheritance',
      'an account never inherits an attribution to a listing that is no longer claimed',
      'service_role', null,
      format('select referred_by_builder_id is null as r from public.users where id = %L', v_uid2),
      'true',
      'an account was attributed to a listing that had lost its owner, so an unclaimed company accrues referral credit');

    perform t.assert_count(
      'lost-claim-no-event',
      'recording nothing is the right answer rather than recording it against nobody',
      'service_role', null,
      format('select 1 from public.referral_events where builder_id = %L and kind = ''account_created''', v_lost),
      0,
      'an account_created event landed on a listing whose tracking was not active');
  end;

  -- ── the webhook path: a direct stamp on users ─────────────────────────────
  -- api/stripe-webhook.js writes referred_by_builder_id with the service role.
  -- log_referral_account_created fires on that transition and must ask the rule.
  declare
    v_unclaimed uuid := t.mk_builder();
    v_h1 uuid := t.mk_account('homeowner');
    v_h2 uuid := t.mk_account('homeowner');
    v_claimed2 uuid := t.mk_claimed_builder();
  begin
    update public.users set referred_by_builder_id = v_unclaimed, referred_at = now() where id = v_h1;
    perform t.assert_count(
      'webhook-stamp-unclaimed-no-event',
      'tracking activates on claim: the webhook stamp records nothing against an unclaimed listing',
      'service_role', null,
      format('select 1 from public.referral_events where builder_id = %L and kind = ''account_created''', v_unclaimed),
      0,
      'a direct attribution stamp recorded account_created against an unclaimed listing');

    update public.users set referred_by_builder_id = v_claimed2, referred_at = now() where id = v_h2;
    perform t.assert_count(
      'webhook-stamp-claimed-event',
      'tracking activates on claim: the webhook stamp records account_created for a claimed listing',
      'service_role', null,
      format('select 1 from public.referral_events where builder_id = %L and kind = ''account_created'' and user_id = %L', v_claimed2, v_h2),
      1,
      'a direct attribution stamp on a claimed listing did not record account_created');

    -- First touch wins: a second stamp must not re-attribute or re-count.
    update public.users set referred_by_builder_id = v_unclaimed where id = v_h2;
    perform t.assert_count(
      'no-second-account-created',
      'a person is counted as an account once per builder',
      'service_role', null,
      format('select 1 from public.referral_events where kind = ''account_created'' and user_id = %L', v_h2),
      1,
      'moving an attribution created a second account_created event, double counting one customer');
  end;

  -- ── an inactive listing is not tracked even when claimed and approved ─────
  declare
    v_off uuid := t.mk_claimed_builder();
    v_code_o text;
  begin
    select referral_code into v_code_o from public.builders where id = v_off;
    update public.builders set active = false where id = v_off;

    perform t.assert_scalar(
      'inactive-not-tracked',
      'an approved listing an admin switched off is out of the directory and its link is paused',
      'service_role', null,
      format('select public.log_referral_visit(%L, %L) as r', v_code_o, 'sess-off-00001'),
      'false',
      'an inactive listing still resolves its referral link, so a paused listing keeps accruing events');

    perform public.capture_lead('inactive-lead@example.test'::citext, 'unlock', null, v_code_o);
    perform t.assert_scalar(
      'inactive-lead-unattributed',
      'an approved listing an admin switched off is out of the directory and its link is paused',
      'service_role', null,
      'select referred_by_builder_id is null as r from public.leads where email = ''inactive-lead@example.test''',
      'true',
      'a lead was attributed to an inactive listing');
  end;

  -- ── the tracking rule itself is not a question a client may ask ──────────
  declare
    v_pro uuid := t.mk_account('pro');
  begin
    perform t.assert_denied(
      'tracking-rule-private',
      'a homeowner or visitor has no business asking whether a listing is tracked',
      'authenticated', t.authid(v_pro),
      format('select public.builder_tracking_active(b) from public.builders b where b.id = %L', v_claimed),
      'builder_tracking_active is executable by a signed-in client, which turns the tracking state into a probe');

    perform t.assert_denied(
      'visit-logger-private',
      'log_referral_visit is service-role only: with a grant the anon key could test which codes exist',
      'anon', null,
      format('select public.log_referral_visit(%L, %L)', v_code_c, 'sess-probe-0001'),
      'the anonymous role can call log_referral_visit and read the boolean, enumerating valid referral codes');

    perform t.assert_denied(
      'visit-logger-private-authed',
      'log_referral_visit is service-role only',
      'authenticated', t.authid(v_pro),
      format('select public.log_referral_visit(%L, %L)', v_code_c, 'sess-probe-0002'),
      'a signed-in account can call log_referral_visit');
  end;
end
$$;
