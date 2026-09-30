-- =============================================================================
-- INVARIANT (decision 2d, migration 0010): builder contact details are gated on
-- the CLAIM, not on the plan.
--
-- An unclaimed listing's direct email and phone are hidden from EVERYONE,
-- including a paying homeowner. A claimed listing may show them to a paying
-- homeowner. An anonymous visitor never gains contact details, claimed or not.
--
-- This was defect B14: builders_public selected contact_email and contact_phone
-- with no condition on ownership, so a $79 purchase handed out the scraped inbox
-- and phone line of a company that had never heard of ADUAtlas. All 86 Arizona
-- seed records were unclaimed and every one carried real contact details.
--
-- The withheld-not-deleted distinction is asserted explicitly. The record keeps
-- the data (Amy has to be able to maintain it, decision 2f, and ADUAtlas passes
-- messages on by hand through intro_requests); the VIEW is what withholds it.
-- =============================================================================
select t.suite('070 contact gating (2d)');

do $$
declare
  v_unclaimed uuid := t.mk_builder('{"contact_email": "hidden@company.test", "contact_phone": "+1-602-555-0111"}'::jsonb);
  v_claimed   uuid := t.mk_claimed_builder('{"contact_email": "shown@company.test", "contact_phone": "+1-602-555-0222"}'::jsonb);
  v_paid      uuid := t.mk_paid_homeowner();
  v_free      uuid := t.mk_account('homeowner');
  v_pa        uuid;
begin
  v_pa := t.authid(v_paid);

  -- ── 1. an unclaimed listing hides contact details from a PAYING homeowner ─
  perform t.assert_scalar(
    'unclaimed-email-hidden-from-paid',
    '2d: an unclaimed listing''s direct email is hidden from everyone, including a paying homeowner',
    'authenticated', v_pa,
    format('select contact_email is null as r from public.builders_public where id = %L', v_unclaimed),
    'true',
    'a paying homeowner is handed the direct email address of a company that never claimed its listing (defect B14)');

  perform t.assert_scalar(
    'unclaimed-phone-hidden-from-paid',
    '2d: an unclaimed listing''s direct phone is hidden from everyone, including a paying homeowner',
    'authenticated', v_pa,
    format('select contact_phone is null as r from public.builders_public where id = %L', v_unclaimed),
    'true',
    'a paying homeowner is handed the direct phone number of a company that never claimed its listing (defect B14)');

  -- Withheld, not deleted. The row still has the data for the admin console.
  perform t.assert_scalar(
    'unclaimed-email-still-on-record',
    '2d: the view withholds contact details; the record keeps them for the admin console',
    'service_role', null,
    format('select contact_email from public.builders where id = %L', v_unclaimed),
    'hidden@company.test',
    'the contact email was removed from the record rather than withheld by the view, so Amy can no longer maintain builder information (decision 2f) and ADUAtlas cannot pass a homeowner''s message on by hand');

  perform t.assert_scalar(
    'unclaimed-phone-still-on-record',
    '2d: the view withholds contact details; the record keeps them for the admin console',
    'service_role', null,
    format('select contact_phone from public.builders where id = %L', v_unclaimed),
    '+1-602-555-0111',
    'the contact phone was removed from the record rather than withheld by the view');

  -- ── 2. a claimed listing shows them to a paying homeowner ────────────────
  perform t.assert_scalar(
    'claimed-email-shown-to-paid',
    '2d: a claimed listing may show contact details to a paying homeowner',
    'authenticated', v_pa,
    format('select contact_email from public.builders_public where id = %L', v_claimed),
    'shown@company.test',
    'a claimed listing withholds its contact email from a paying homeowner, so the thing the account pays for does not work');

  perform t.assert_scalar(
    'claimed-phone-shown-to-paid',
    '2d: a claimed listing may show contact details to a paying homeowner',
    'authenticated', v_pa,
    format('select contact_phone from public.builders_public where id = %L', v_claimed),
    '+1-602-555-0222',
    'a claimed listing withholds its contact phone from a paying homeowner');

  -- ── 3. an anonymous visitor never gains contact details ──────────────────
  -- Not "null for anon" but "no such column": the public profile view has never
  -- carried contact fields and must not start.
  perform t.assert_denied(
    'anon-no-contact-email-column',
    '2d: an anonymous visitor never gains contact details, claimed or not',
    'anon', null,
    'select contact_email from public.builders_public_profile',
    'the public profile view exposes a contact_email column; a public page is not a contact list');

  perform t.assert_denied(
    'anon-no-contact-phone-column',
    '2d: an anonymous visitor never gains contact details, claimed or not',
    'anon', null,
    'select contact_phone from public.builders_public_profile',
    'the public profile view exposes a contact_phone column');

  perform t.assert_denied(
    'signed-in-profile-no-contact-column',
    '2d: an anonymous visitor never gains contact details, claimed or not',
    'authenticated', v_pa,
    'select contact_email from public.builders_public_profile',
    'the public profile view exposes contact_email to a signed-in reader, which is the same column an anonymous reader would get');

  perform t.assert_denied(
    'anon-no-paid-directory',
    '2d: an anonymous visitor never gains contact details, claimed or not',
    'anon', null,
    'select contact_email from public.builders_public',
    'the anonymous role can read the paid directory view, which carries contact details for claimed listings');

  -- ── 4. an unpaid signed-in account gains nothing ─────────────────────────
  perform t.assert_count(
    'free-account-no-contact',
    '2d: contact details belong to the paid directory flow, for claimed listings only',
    'authenticated', t.authid(v_free),
    format('select 1 from public.builders_public where id = %L', v_claimed),
    0,
    'a signed-in account that never paid can reach a claimed listing''s contact details');

  -- ── 5. claimed flips with ownership, in both views ───────────────────────
  perform t.assert_scalar(
    'claimed-flag-true',
    '0010: claimed is true exactly when owner_user_id is not null',
    'authenticated', v_pa,
    format('select claimed from public.builders_public where id = %L', v_claimed),
    'true',
    'a claimed listing reports claimed = false in the paid directory, so a card cannot fail closed');

  perform t.assert_scalar(
    'unclaimed-flag-false',
    '0010: claimed is true exactly when owner_user_id is not null',
    'authenticated', v_pa,
    format('select claimed from public.builders_public where id = %L', v_unclaimed),
    'false',
    'an unclaimed listing reports claimed = true in the paid directory');

  -- Give the claim up: the contact details must go back behind the gate.
  perform t.assert_ok(
    'unclaim-the-listing',
    '2d: contact details are gated on the claim, so giving up the claim takes them back',
    'service_role', null,
    format('update public.builders set owner_user_id = null where id = %L', v_claimed),
    'could not release the claim');

  perform t.assert_scalar(
    'unclaimed-again-email-hidden',
    '2d: contact details are gated on the claim, so giving up the claim takes them back',
    'authenticated', v_pa,
    format('select contact_email is null as r from public.builders_public where id = %L', v_claimed),
    'true',
    'a listing whose account was removed keeps publishing its contact email inside the paid product');

  perform t.assert_scalar(
    'unclaimed-again-flag-false',
    '0010: claimed is true exactly when owner_user_id is not null',
    'authenticated', v_pa,
    format('select claimed from public.builders_public where id = %L', v_claimed),
    'false',
    'a listing that lost its owner still reports claimed = true');

  -- ── 6. nothing else leaked in while the view was being rewritten ─────────
  -- 0010 recreated builders_public. The full column list is pinned in suite 130;
  -- the named private fields are asserted here so this file stands alone.
  declare
    c text;
  begin
    foreach c in array array['claim_code', 'claimed_at', 'verified_by',
                             'external_tracking_url', 'relationship_type',
                             'owner_user_id', 'profile_status', 'admin_notes',
                             'commercial_terms', 'referral_code',
                             'membership_price_cents', 'success_fee_cents']
    loop
      perform t.assert_denied(
        'paid-view-hides-' || c,
        '0010 rewrote builders_public and must not have widened it',
        'authenticated', v_pa,
        format('select %I from public.builders_public', c),
        format('builders_public now exposes %s to a paying homeowner', c));
    end loop;
  end;
end
$$;
