-- =============================================================================
-- INVARIANT: the $500 success fee, and the one event ADUAtlas cannot detect.
--
-- Spec: decision 12. $500 when an ADUAtlas referral signs a project, at any time
-- including the trial. $0 for clicks, inquiries and qualified leads. Decision 13:
-- "qualified lead" is not a schema concept.
--
-- project_signed is the only event with no machine evidence behind it, so the
-- record has to say who said what: confirmed_by, signed_on and a note are all
-- mandatory. It can only be recorded against a CLAIMED listing, because a seeded
-- listing has agreed to nothing and has no account to bill. And it can only
-- happen once per homeowner and builder, because a duplicate is a double charge.
-- =============================================================================
select t.suite('100 success fee');

do $$
declare
  v_b        uuid := t.mk_claimed_builder();
  v_unclaimed uuid := t.mk_builder();
  v_home     uuid := t.mk_paid_homeowner();
  v_result   jsonb;
begin
  -- ── a claimed listing only ────────────────────────────────────────────────
  perform t.assert_error(
    'no-fee-for-unclaimed',
    '12: the $500 fee attaches to a company that took over its listing and accepted the terms',
    'service_role', null,
    format('select public.admin_mark_project_signed(%L, %L, ''both'', current_date, ''note'')', v_unclaimed, v_home),
    'claimed listing',
    'a signed project was recorded against an UNCLAIMED listing, billing a company that never agreed to anything and has no account');

  perform t.assert_count(
    'no-event-for-unclaimed',
    '12: the $500 fee attaches to a company that took over its listing and accepted the terms',
    'service_role', null,
    format('select 1 from public.referral_events where builder_id = %L and kind = ''project_signed''', v_unclaimed),
    0,
    'the refused call still wrote an event against the unclaimed listing');

  -- ── the evidence is mandatory ─────────────────────────────────────────────
  perform t.assert_error(
    'note-required',
    '12: the one event with no machine evidence must record who said what',
    'service_role', null,
    format('select public.admin_mark_project_signed(%L, %L, ''both'', current_date, null)', v_b, v_home),
    'note recording what was confirmed is required',
    'a signed project was recorded with no note, so the $500 charge rests on nothing written down');

  perform t.assert_error(
    'blank-note-rejected',
    '12: the one event with no machine evidence must record who said what',
    'service_role', null,
    format('select public.admin_mark_project_signed(%L, %L, ''both'', current_date, ''   '')', v_b, v_home),
    'note recording what was confirmed is required',
    'a whitespace-only note satisfied the evidence requirement');

  perform t.assert_error(
    'signed-date-required',
    '12: the one event with no machine evidence must record who said what',
    'service_role', null,
    format('select public.admin_mark_project_signed(%L, %L, ''both'', null, ''confirmed'')', v_b, v_home),
    'signed date is required',
    'a signed project was recorded with no signing date');

  perform t.assert_error(
    'confirmed-by-required',
    '12: the one event with no machine evidence must record who said what',
    'service_role', null,
    format('select public.admin_mark_project_signed(%L, %L, ''someone'', current_date, ''confirmed'')', v_b, v_home),
    'confirmed_by must be builder, homeowner or both',
    'an unrecognised confirmation source was accepted');

  perform t.assert_error(
    'homeowner-required',
    '12: the fee attaches to a referral, so the homeowner is required',
    'service_role', null,
    format('select public.admin_mark_project_signed(%L, null, ''both'', current_date, ''confirmed'')', v_b),
    'homeowner is required',
    'a signed project was recorded with no homeowner');

  perform t.assert_error(
    'unknown-builder-rejected',
    '12: the fee attaches to a real listing',
    'service_role', null,
    format('select public.admin_mark_project_signed(%L, %L, ''both'', current_date, ''confirmed'')', gen_random_uuid(), v_home),
    'builder not found',
    'a signed project was recorded against a builder id that does not exist');

  -- ── the happy path, and the recorded terms ───────────────────────────────
  v_result := public.admin_mark_project_signed(v_b, v_home, 'both', current_date, 'both parties confirmed by email');

  perform t.assert(
    'first-record-inserted',
    '12: $500 when an ADUAtlas referral signs a project',
    (v_result->>'inserted')::boolean is true,
    'the first recording of a signed project did not report inserted = true, so the console cannot tell a new record from a repeat');

  perform t.assert_scalar(
    'fee-recorded-not-charged',
    '12: the $500 fee is a recorded term; nothing bills it here',
    'service_role', null,
    format('select success_fee_cents from public.builders where id = %L', v_b),
    '50000',
    'the recorded success fee is not $500');

  perform t.assert_scalar(
    'fee-applies-recorded',
    '12: the fee applies under the standard marketplace relationship',
    'service_role', null,
    format('select fee_applies from public.referral_events where kind = ''project_signed'' and builder_id = %L and user_id = %L', v_b, v_home),
    'true',
    'the signed project did not record that the standard fee applies');

  -- ── duplicate protection ──────────────────────────────────────────────────
  v_result := public.admin_mark_project_signed(v_b, v_home, 'homeowner', current_date, 'a second, different account of the same deal');

  perform t.assert(
    'duplicate-reports-not-inserted',
    'duplicate signed projects cannot double count',
    (v_result->>'inserted')::boolean is false,
    'recording the same signed project twice reported inserted = true, so the console would tell an admin a second $500 event was created');

  perform t.assert_count(
    'duplicate-stores-one-row',
    'duplicate signed projects cannot double count',
    'service_role', null,
    format('select 1 from public.referral_events where kind = ''project_signed'' and builder_id = %L and user_id = %L', v_b, v_home),
    1,
    'the same homeowner and builder pair holds more than one project_signed event, which is a double charge');

  perform t.assert_scalar(
    'first-record-stands',
    'duplicate signed projects cannot double count: the first record stands',
    'service_role', null,
    format('select note from public.referral_events where kind = ''project_signed'' and builder_id = %L and user_id = %L', v_b, v_home),
    'both parties confirmed by email',
    'the repeat call overwrote the original evidence note');

  -- The unique index behind the rule, independent of the RPC.
  perform t.assert_denied(
    'duplicate-index-enforced',
    'duplicate signed projects cannot double count',
    'service_role', null,
    format('insert into public.referral_events (builder_id, kind, user_id, note, confirmed_by, signed_on, fee_applies) values (%L, ''project_signed'', %L, ''direct insert'', ''both'', current_date, true)', v_b, v_home),
    'a direct insert created a second project_signed for the same homeowner and builder, so the duplicate rule lives only in the RPC');

  -- ── the fee follows the contract; the origin is reported, not billed ──────
  declare
    v_origin uuid := t.mk_claimed_builder();
    v_signer uuid := t.mk_claimed_builder();
    v_h2     uuid := t.mk_paid_homeowner();
    v_name   text;
    v_res2   jsonb;
  begin
    select name into v_name from public.builders where id = v_origin;
    update public.users set referred_by_builder_id = v_origin, referred_at = now() where id = v_h2;

    v_res2 := public.admin_mark_project_signed(v_signer, v_h2, 'both', current_date, 'signed with a different company from the one that referred');

    perform t.assert(
      'origin-reported',
      '12: the click and the contract can name different companies; the origin is reported so an admin can see it',
      (v_res2->>'origin_builder_name') = v_name,
      format('the origin builder was not reported to the admin; got %L, expected %L', v_res2->>'origin_builder_name', v_name));

    perform t.assert_scalar(
      'fee-follows-contract',
      '12: the fee follows the contract, not the click',
      'service_role', null,
      format('select (builder_id = %L) as r from public.referral_events where kind = ''project_signed'' and user_id = %L', v_signer, v_h2),
      'true',
      'the $500 event was recorded against the referring company rather than the one that signed the contract');

    perform t.assert_scalar(
      'origin-stored',
      '12: the origin is recorded on the event as well as reported',
      'service_role', null,
      format('select (origin_builder_id = %L) as r from public.referral_events where kind = ''project_signed'' and user_id = %L', v_origin, v_h2),
      'true',
      'the event does not record which company''s link first brought the homeowner in');

    -- When the signer IS the origin, there is nothing to flag.
    declare
      v_h3   uuid := t.mk_paid_homeowner();
      v_res3 jsonb;
    begin
      update public.users set referred_by_builder_id = v_signer, referred_at = now() where id = v_h3;
      v_res3 := public.admin_mark_project_signed(v_signer, v_h3, 'both', current_date, 'same company referred and signed');
      perform t.assert(
        'origin-null-when-same',
        '12: origin is reported ONLY when it names a different company, so present means worth showing',
        (v_res3->>'origin_builder_name') is null,
        format('the origin was reported as %L when the signing company and the referring company are the same', v_res3->>'origin_builder_name'));
    end;
  end;

  -- ── clicks, inquiries and leads are $0 ───────────────────────────────────
  -- Decision 13: "qualified lead" is not a schema concept. The way that is kept
  -- true is that no event kind carries a stage or a score, and only
  -- project_signed carries a fee flag.
  perform t.assert_count(
    'no-qualified-lead-concept',
    '13: "qualified lead" is not a schema concept',
    'service_role', null,
    $q$select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'referral_events'
          and (column_name ilike '%qualified%' or column_name ilike '%stage%'
               or column_name ilike '%score%' or column_name ilike '%funnel%')$q$,
    0,
    'referral_events grew a funnel stage, score or qualified flag; the table stores raw events and nothing else');

  perform t.assert_count(
    'fee-flag-only-on-signed',
    '12: $0 for clicks, inquiries and qualified leads',
    'service_role', null,
    'select 1 from public.referral_events where kind <> ''project_signed'' and fee_applies is not null',
    0,
    'a fee flag was set on an event other than project_signed, so a click or an inquiry is being recorded as chargeable');
end
$$;
