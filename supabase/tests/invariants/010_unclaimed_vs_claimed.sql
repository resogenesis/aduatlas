-- =============================================================================
-- INVARIANT: an unclaimed listing is a record ADUAtlas compiled. A claimed one
-- is a company that took the listing over and accepted the terms.
--
-- Spec: decisions 2a, 2c, 10, 13. An unclaimed listing has no active referral or
-- tracking link, no dashboard, no access to collected analytics, no Verified
-- badge and no ability to start a conversation. ADUAtlas may still measure its
-- own marketplace against it (profile views, contact requests), which is why the
-- last test here asserts that those events DO land: builder-facing copy must not
-- claim ADUAtlas records nothing before a claim, and a test that forbade the
-- events would make the copy the lie instead.
-- =============================================================================
select t.suite('010 unclaimed vs claimed');

do $$
declare
  v_unclaimed uuid := t.mk_builder();
  v_claimed   uuid := t.mk_claimed_builder();
  v_code_u    text;
  v_code_c    text;
  v_paid      uuid := t.mk_paid_homeowner();
  v_paid_auth uuid;
begin
  v_paid_auth := t.authid(v_paid);
  select referral_code into v_code_u from public.builders where id = v_unclaimed;
  select referral_code into v_code_c from public.builders where id = v_claimed;

  -- ── the referral link ─────────────────────────────────────────────────────
  -- An unclaimed listing HAS a referral_code in the column (0005 backfills every
  -- row) but the code must not resolve. The link is dead until the claim.
  perform t.assert_scalar(
    'unclaimed-link-dead',
    'tracking activates on claim: an unclaimed listing resolves no referral',
    'service_role', null,
    format('select public.log_referral_visit(%L, %L) as r', v_code_u, 'sess-unclaimed-0001'),
    'false',
    'log_referral_visit resolved an unclaimed listing, so a seeded company would accrue referral events it never agreed to');

  perform t.assert_count(
    'unclaimed-link-no-event',
    'tracking activates on claim: an unclaimed listing resolves no referral',
    'service_role', null,
    format('select 1 from public.referral_events where builder_id = %L and kind = ''link_visited''', v_unclaimed),
    0,
    'a link_visited event was recorded against an unclaimed listing');

  perform t.assert_scalar(
    'claimed-link-live',
    'tracking activates on claim: a claimed, approved listing resolves its referral',
    'service_role', null,
    format('select public.log_referral_visit(%L, %L) as r', v_code_c, 'sess-claimed-0001'),
    'true',
    'a claimed, approved listing did not resolve its own referral code, so the builder dashboard would show nothing');

  perform t.assert_count(
    'claimed-link-event',
    'tracking activates on claim: a claimed, approved listing resolves its referral',
    'service_role', null,
    format('select 1 from public.referral_events where builder_id = %L and kind = ''link_visited''', v_claimed),
    1,
    'the claimed listing resolved the code but no link_visited event was stored');

  -- ── lead attribution ──────────────────────────────────────────────────────
  perform t.assert_scalar(
    'unclaimed-lead-unattributed',
    'tracking activates on claim: a lead carrying an unclaimed code is not attributed',
    'anon', null,
    format('select public.capture_lead(%L::citext, ''unlock'', null, %L) is not null as r',
           'lead-unclaimed@example.test', v_code_u),
    'true',
    'capture_lead refused the lead; an unresolvable code must be ignored, never an error, so the lead still lands');

  perform t.assert_scalar(
    'unclaimed-lead-no-builder',
    'tracking activates on claim: a lead carrying an unclaimed code is not attributed',
    'service_role', null,
    'select referred_by_builder_id is null as r from public.leads where email = ''lead-unclaimed@example.test''',
    'true',
    'a lead was attributed to an unclaimed listing');

  perform t.assert_scalar(
    'unclaimed-lead-code-kept',
    'an unresolved code is still recorded so an admin can see what arrived',
    'service_role', null,
    'select referral_code from public.leads where email = ''lead-unclaimed@example.test''',
    v_code_u,
    'the normalised code was discarded, so an admin cannot see which link a lead arrived on');

  perform t.assert_scalar(
    'claimed-lead-attributed',
    'tracking activates on claim: a lead carrying a claimed code IS attributed',
    'anon', null,
    format('select public.capture_lead(%L::citext, ''unlock'', null, %L) is not null as r',
           'lead-claimed@example.test', v_code_c),
    'true',
    'capture_lead refused a lead carrying a live code');

  perform t.assert_scalar(
    'claimed-lead-builder',
    'tracking activates on claim: a lead carrying a claimed code IS attributed',
    'service_role', null,
    format('select (referred_by_builder_id = %L) as r from public.leads where email = ''lead-claimed@example.test''', v_claimed),
    'true',
    'a lead carrying a live code was not attributed to the claimed listing');

  perform t.assert_count(
    'claimed-lead-email-captured',
    'an attributed lead records exactly one email_captured per builder',
    'service_role', null,
    format('select 1 from public.referral_events where builder_id = %L and kind = ''email_captured''', v_claimed),
    1,
    'an attributed lead did not produce exactly one email_captured event');

  -- Resubmitting the email gate must not inflate the count.
  perform t.assert_ok(
    'lead-resubmit',
    'an attributed lead records exactly one email_captured per builder',
    'anon', null,
    format('select public.capture_lead(%L::citext, ''unlock'', ''{"a":1}''::jsonb, %L)',
           'lead-claimed@example.test', v_code_c),
    'resubmitting the email gate was refused');

  perform t.assert_count(
    'lead-resubmit-no-duplicate',
    'an attributed lead records exactly one email_captured per builder',
    'service_role', null,
    format('select 1 from public.referral_events where builder_id = %L and kind = ''email_captured''', v_claimed),
    1,
    'resubmitting the email gate recorded a second email_captured, inflating the builder dashboard');

  -- ── the dashboard and the analytics ───────────────────────────────────────
  -- my_referral_stats returns null for an account owning nothing, and the
  -- unclaimed listing has no account at all to ask with. Prove the shape: a
  -- signed-in homeowner gets no dashboard, and referral_events is unreadable.
  perform t.assert_scalar(
    'no-dashboard-without-listing',
    'an unclaimed listing has no builder dashboard',
    'authenticated', v_paid_auth,
    'select public.my_referral_stats() is null as r',
    'true',
    'my_referral_stats returned a dashboard to an account that owns no listing');

  perform t.assert_denied(
    'analytics-private',
    'an unclaimed listing has no access to collected analytics',
    'authenticated', v_paid_auth,
    'select count(*) from public.referral_events',
    'referral_events is readable by a signed-in account; collected analytics must be service-role only');

  perform t.assert_denied(
    'analytics-private-anon',
    'an unclaimed listing has no access to collected analytics',
    'anon', null,
    'select count(*) from public.referral_events',
    'referral_events is readable anonymously');

  -- ── ADUAtlas measuring its own marketplace (2c) ───────────────────────────
  -- This is the test that keeps the builder-facing copy honest. Profile views
  -- and contact requests against an unclaimed listing ARE recorded, because 2c
  -- says so and the copy must say so too.
  perform t.assert_ok(
    'unclaimed-view-recorded',
    '2c: ADUAtlas records its own marketplace data against an unclaimed listing',
    'authenticated', v_paid_auth,
    format('select public.log_builder_event(%L, ''builder_profile_viewed'')', v_unclaimed),
    'log_builder_event refused a view of an unclaimed listing');

  perform t.assert_count(
    'unclaimed-view-stored',
    '2c: ADUAtlas records its own marketplace data against an unclaimed listing',
    'service_role', null,
    format('select 1 from public.referral_events where builder_id = %L and kind = ''builder_profile_viewed''', v_unclaimed),
    1,
    'a profile view of an unclaimed listing was NOT recorded; builder-facing copy claims ADUAtlas measures its own marketplace before a claim, and this is the event behind that sentence');

  -- Once per day per homeowner and builder, not once per page load.
  perform t.assert_ok(
    'view-daily-dedup-call',
    'a signed-in homeowner counts once a day per builder for views and contacts',
    'authenticated', v_paid_auth,
    format('select public.log_builder_event(%L, ''builder_profile_viewed'')', v_unclaimed),
    'a repeat view call was refused instead of absorbed');

  perform t.assert_count(
    'view-daily-dedup',
    'a signed-in homeowner counts once a day per builder for views and contacts',
    'service_role', null,
    format('select 1 from public.referral_events where builder_id = %L and kind = ''builder_profile_viewed''', v_unclaimed),
    1,
    'two views on the same day by the same homeowner were both counted');

  -- A pro account browsing is never marketplace data about a homeowner.
  declare
    v_pro uuid := t.mk_account('pro');
  begin
    perform t.assert_ok(
      'pro-view-not-recorded-call',
      'a builder account browsing does not generate homeowner marketplace events',
      'authenticated', t.authid(v_pro),
      format('select public.log_builder_event(%L, ''builder_profile_viewed'')', v_claimed),
      'log_builder_event raised for a pro account instead of returning quietly');

    perform t.assert_count(
      'pro-view-not-recorded',
      'a builder account browsing does not generate homeowner marketplace events',
      'service_role', null,
      format('select 1 from public.referral_events where builder_id = %L and kind = ''builder_profile_viewed''', v_claimed),
      0,
      'a pro account browsing recorded a builder_profile_viewed event');
  end;

  -- ── an inactive or unapproved listing is out of the marketplace ───────────
  declare
    v_inactive uuid := t.mk_claimed_builder('{"active": false}'::jsonb);
    v_draft    uuid := t.mk_claimed_builder('{"profile_status": "draft"}'::jsonb);
    v_code_i   text;
    v_code_d   text;
  begin
    select referral_code into v_code_i from public.builders where id = v_inactive;
    select referral_code into v_code_d from public.builders where id = v_draft;

    perform t.assert_scalar(
      'inactive-link-paused',
      'an approved listing an admin switched off is out of the directory and its link is paused',
      'service_role', null,
      format('select public.log_referral_visit(%L, %L) as r', v_code_i, 'sess-inactive-001'),
      'false',
      'an inactive listing still resolved its referral link');

    perform t.assert_scalar(
      'draft-link-dead',
      'tracking requires profile_status = approved',
      'service_role', null,
      format('select public.log_referral_visit(%L, %L) as r', v_code_d, 'sess-draft-0001'),
      'false',
      'a draft listing resolved its referral link');
  end;
end
$$;
