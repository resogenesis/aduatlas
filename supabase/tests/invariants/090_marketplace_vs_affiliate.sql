-- =============================================================================
-- INVARIANT: commercial relationships are typed, and nobody is forced into one
-- model.
--
-- Spec: decisions 11 and 12. marketplace, affiliate, partner. Existing affiliates
-- keep their own tracking links and negotiated terms. The type is a commercial
-- fact between ADUAtlas and the company: the builder and the admin may see it,
-- and no homeowner surface ever does (asserted in suite 40 as well, because
-- there it protects the badge and here it protects the arrangement).
-- =============================================================================
select t.suite('090 marketplace vs affiliate');

do $$
declare
  v_market uuid := t.mk_claimed_builder('{"relationship_type": "marketplace"}'::jsonb);
  v_aff    uuid := t.mk_claimed_builder('{"relationship_type": "affiliate"}'::jsonb);
  v_part   uuid := t.mk_claimed_builder('{"relationship_type": "partner"}'::jsonb);
  v_paid   uuid := t.mk_paid_homeowner();
  v_pa     uuid;
begin
  v_pa := t.authid(v_paid);

  -- ── the three types, and only the three ───────────────────────────────────
  perform t.assert_denied(
    'no-fourth-relationship',
    '11: commercial relationships are typed marketplace, affiliate or partner',
    'service_role', null,
    format('update public.builders set relationship_type = ''reseller'' where id = %L', v_market),
    'an unrecognised relationship type was accepted');

  perform t.assert_scalar(
    'default-is-marketplace',
    '11: the standard terms are the default; nobody is forced into another model',
    'service_role', null,
    format('select relationship_type from public.builders where id = %L', t.mk_builder()),
    'marketplace',
    'a new listing does not default to the standard marketplace relationship');

  -- ── an affiliate keeps its own tracking link ──────────────────────────────
  perform t.assert_ok(
    'affiliate-keeps-own-link',
    '11: existing affiliates keep their own tracking links',
    'service_role', null,
    format('update public.builders set external_tracking_url = ''https://affiliate.test/track?id=7'' where id = %L', v_aff),
    'an affiliate''s own tracking link could not be recorded');

  perform t.assert_denied(
    'tracking-link-must-be-absolute',
    'an affiliate link is rendered as an href, so it must be an absolute http(s) URL',
    'service_role', null,
    format('update public.builders set external_tracking_url = ''javascript:alert(1)'' where id = %L', v_aff),
    'a non-http(s) value was accepted into a column that is rendered as a link, which is a script-injection surface in the portal and the admin console');

  perform t.assert_denied(
    'tracking-link-not-relative',
    'an affiliate link is rendered as an href, so it must be an absolute http(s) URL',
    'service_role', null,
    format('update public.builders set external_tracking_url = ''/relative/path'' where id = %L', v_aff),
    'a relative path was accepted as an affiliate tracking link');

  -- The owner may see their own link; nobody else may.
  perform t.assert_scalar(
    'owner-sees-own-link',
    '11: an affiliate''s link is for the builder and the admin',
    'authenticated', t.owner_authid(v_aff),
    'select external_tracking_url from public.my_builder()',
    'https://affiliate.test/track?id=7',
    'an affiliate cannot see its own tracking link in its portal');

  perform t.assert_denied(
    'link-not-in-paid-view',
    '11: an affiliate''s link is never in a homeowner-facing view',
    'authenticated', v_pa,
    'select external_tracking_url from public.builders_public',
    'the affiliate tracking link is exposed in the paid directory view');

  perform t.assert_denied(
    'link-not-in-public-profile',
    '11: an affiliate''s link is never in a homeowner-facing view',
    'anon', null,
    'select external_tracking_url from public.builders_public_profile',
    'the affiliate tracking link is exposed on the public profile view');

  -- ── every type still gets the ADUAtlas referral machinery ────────────────
  -- "Nobody is forced into one model" cuts both ways: an affiliate keeps its own
  -- link AND keeps a working ADUAtlas code.
  declare
    v_code text;
  begin
    select referral_code into v_code from public.builders where id = v_aff;
    perform t.assert_scalar(
      'affiliate-code-still-works',
      '11: nobody is forced into one model; an affiliate keeps a working ADUAtlas link too',
      'service_role', null,
      format('select public.log_referral_visit(%L, %L) as r', v_code, 'sess-affiliate-01'),
      'true',
      'an affiliate''s ADUAtlas referral code does not resolve, so choosing the affiliate model silently removes the marketplace link');

    select referral_code into v_code from public.builders where id = v_part;
    perform t.assert_scalar(
      'partner-code-still-works',
      '11: nobody is forced into one model',
      'service_role', null,
      format('select public.log_referral_visit(%L, %L) as r', v_code, 'sess-partner-001'),
      'true',
      'a partner''s ADUAtlas referral code does not resolve');
  end;

  -- ── the commercial type is invisible to homeowners, in every shape ────────
  perform t.assert_denied(
    'terms-not-in-paid-view',
    'the negotiated terms are between ADUAtlas and the company',
    'authenticated', v_pa,
    'select commercial_terms from public.builders_public',
    'the free-text commercial terms are exposed in the paid directory view');

  -- ── the $500 fee follows the relationship type, recorded not charged ──────
  -- The fee rule itself is proved in suite 100; here the point is only that the
  -- type is what decides it.
  declare
    v_h1 uuid := t.mk_paid_homeowner();
    v_h2 uuid := t.mk_paid_homeowner();
    v_h3 uuid := t.mk_paid_homeowner();
  begin
    perform public.admin_mark_project_signed(v_market, v_h1, 'both', current_date, 'confirmed by both parties');
    perform public.admin_mark_project_signed(v_aff,    v_h2, 'both', current_date, 'confirmed by both parties');
    perform public.admin_mark_project_signed(v_part,   v_h3, 'both', current_date, 'confirmed by both parties');

    perform t.assert_scalar(
      'fee-applies-marketplace',
      '12: the $500 success fee applies to the standard marketplace relationship',
      'service_role', null,
      format('select fee_applies from public.referral_events where kind = ''project_signed'' and builder_id = %L', v_market),
      'true',
      'a signed project under the standard marketplace terms did not record that the fee applies');

    perform t.assert_scalar(
      'fee-not-affiliate',
      '12: the $500 success fee never applies to an affiliate, who has negotiated terms',
      'service_role', null,
      format('select fee_applies from public.referral_events where kind = ''project_signed'' and builder_id = %L', v_aff),
      'false',
      'an affiliate was recorded as owing the standard $500 fee despite having its own negotiated terms');

    perform t.assert_scalar(
      'fee-not-partner',
      '12: the $500 success fee never applies to a partner, who has negotiated terms',
      'service_role', null,
      format('select fee_applies from public.referral_events where kind = ''project_signed'' and builder_id = %L', v_part),
      'false',
      'a partner was recorded as owing the standard $500 fee');
  end;
end
$$;
