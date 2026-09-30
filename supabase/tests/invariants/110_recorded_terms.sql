-- =============================================================================
-- INVARIANT: the standard marketplace terms, as the database represents them.
--
-- Spec: decisions 12 and 14. 90 days free from claim, then $49 a month; $0 for
-- clicks, inquiries and qualified leads; $500 when an ADUAtlas referral signs a
-- project. "Nothing bills a builder for 90 days after they claim" — and in
-- Phase 1, nothing bills a builder at all: builder membership billing is a
-- separate domain that follows.
--
-- So there are two distinct claims to protect, and they pull in opposite
-- directions:
--
--   RECORDED   the three numbers are stored, with the right values, so the
--              portal and the console can state the terms accurately.
--   NOT BILLED  no billing machinery exists. A test suite that only checked the
--              numbers would pass on the day someone added a charge table, which
--              is exactly the day decision 14 gets broken.
-- =============================================================================
select t.suite('110 recorded terms');

do $$
declare
  v_b     uuid := t.mk_builder();
  v_pro   uuid := t.mk_account('pro');
  v_code  text := t.issue_claim_code(v_b);
  v_paid  uuid := t.mk_paid_homeowner();
begin
  -- ── the three numbers ─────────────────────────────────────────────────────
  perform t.assert_scalar(
    'intro-days-90',
    '12: 90 days free membership from claim',
    'service_role', null,
    format('select intro_days::text from public.builders where id = %L', v_b),
    '90',
    'the recorded free period is not 90 days, so the portal and the invitation would state terms the company did not agree to');

  perform t.assert_scalar(
    'membership-49',
    '12: then $49 a month',
    'service_role', null,
    format('select membership_price_cents::text from public.builders where id = %L', v_b),
    '4900',
    'the recorded membership price is not $49 a month');

  perform t.assert_scalar(
    'success-fee-500',
    '12: $500 when an ADUAtlas referral signs a project',
    'service_role', null,
    format('select success_fee_cents::text from public.builders where id = %L', v_b),
    '50000',
    'the recorded success fee is not $500');

  -- ── the 90 days run from the CLAIM, so the claim date must exist ──────────
  perform t.assert_scalar(
    'unclaimed-has-no-clock',
    '12: the free period runs from the claim, so an unclaimed listing has no clock',
    'service_role', null,
    format('select claimed_at is null as r from public.builders where id = %L', v_b),
    'true',
    'an unclaimed listing already carries a claim date, so its 90 day free period is running down before anybody at the company has agreed to anything');

  perform t.assert_ok(
    'claim-starts-clock',
    '12: 90 days free membership FROM CLAIM',
    'authenticated', t.authid(v_pro),
    format('select public.claim_my_builder(%L)', v_code),
    'the claim failed, so the clock test cannot run');

  perform t.assert_scalar(
    'clock-starts-on-claim',
    '12: 90 days free membership FROM CLAIM',
    'service_role', null,
    format('select claimed_at is not null as r from public.builders where id = %L', v_b),
    'true',
    'the claim did not record a date, so there is nothing to count 90 days from and the trial has no defined end');

  -- ── negotiated terms are per builder, not global ─────────────────────────
  -- Decision 11: nobody is forced into one model, so the numbers have to be
  -- settable per company rather than hard-coded.
  declare
    v_neg uuid := t.mk_claimed_builder('{"relationship_type": "affiliate"}'::jsonb);
  begin
    perform t.assert_ok(
      'terms-negotiable',
      '11: existing affiliates keep their negotiated terms; nobody is forced into one model',
      'service_role', null,
      format('update public.builders set membership_price_cents = 0, success_fee_cents = 0, intro_days = 365, commercial_terms = ''Pre-existing affiliate agreement, revenue share'' where id = %L', v_neg),
      'the recorded terms cannot be varied per company, so an existing affiliate would be forced onto the standard marketplace terms');

    perform t.assert_scalar(
      'negotiated-terms-stored',
      '11: existing affiliates keep their negotiated terms',
      'service_role', null,
      format('select commercial_terms from public.builders where id = %L', v_neg),
      'Pre-existing affiliate agreement, revenue share',
      'the free-text arrangement was not stored');
  end;

  -- ── NOTHING BILLS (decision 14) ──────────────────────────────────────────
  -- Builder membership billing is a separate domain that follows Phase 1. The
  -- assertion is deliberately structural: no table in this schema exists to
  -- charge a builder. If one appears, this test fails and somebody has to decide
  -- whether decision 14 has moved.
  perform t.assert_count(
    'no-builder-billing-tables',
    '14: builder membership billing is a separate domain; nothing bills a builder in Phase 1',
    'service_role', null,
    $q$select table_name from information_schema.tables
        where table_schema = 'public'
          and (table_name ilike '%invoice%' or table_name ilike '%charge%'
               or table_name ilike '%subscription%' or table_name ilike '%payout%'
               or table_name ilike '%commission%' or table_name ilike '%billing%')$q$,
    0,
    'a billing, invoice, charge, subscription, payout or commission table appeared in the schema. Decision 14 says builder membership billing follows Phase 1 and nothing bills a builder for 90 days after they claim; if that has changed, it is a decision to raise, not a migration to slip in');

  -- The recorded terms carry no state that could drive a charge: no next-bill
  -- date, no balance, no amount-due column on builders.
  perform t.assert_count(
    'no-builder-balance-columns',
    '14: the terms are recorded, never charged',
    'service_role', null,
    $q$select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'builders'
          and (column_name ilike '%balance%' or column_name ilike '%amount_due%'
               or column_name ilike '%next_bill%' or column_name ilike '%billed%'
               or column_name ilike '%invoice%' or column_name ilike '%payout%')$q$,
    0,
    'builders grew a balance, amount due, next-bill or invoice column, which is billing state rather than a recorded term');

  -- No Stripe linkage on the builder side. The homeowner side has
  -- stripe_customer_id on users; the builder side must have nothing.
  perform t.assert_count(
    'no-builder-stripe-linkage',
    '14: nothing bills a builder in Phase 1',
    'service_role', null,
    $q$select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'builders'
          and column_name ilike '%stripe%'$q$,
    0,
    'builders grew a Stripe column, which is the first half of charging a builder');

  -- ── the recorded terms are never a homeowner-facing signal ───────────────
  perform t.assert_denied(
    'terms-not-in-directory',
    'the commercial terms are between ADUAtlas and the company',
    'authenticated', t.authid(v_paid),
    'select membership_price_cents from public.builders_public',
    'the recorded membership price is exposed to homeowners in the paid directory');

  perform t.assert_denied(
    'fee-not-in-public-profile',
    'the commercial terms are between ADUAtlas and the company',
    'anon', null,
    'select success_fee_cents from public.builders_public_profile',
    'the recorded success fee is exposed on the public profile');

  -- ── the event ledger records amounts but charges nothing ─────────────────
  -- package_purchased and package_refunded carry what Stripe charged and
  -- returned. Those are homeowner payments already made, not builder charges.
  perform t.assert_count(
    'amounts-only-on-package-events',
    '12: $0 for clicks, inquiries and qualified leads',
    'service_role', null,
    $q$select 1 from public.referral_events
        where amount_cents is not null
          and kind not in ('package_purchased', 'package_refunded')$q$,
    0,
    'an amount was recorded against an event other than a package purchase or refund, so a click or an inquiry is carrying money');
end
$$;
