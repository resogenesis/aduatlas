-- =============================================================================
-- INVARIANT: "Verified on ADUAtlas" has exactly one meaning, and four listing
-- states stay distinct.
--
-- Spec: decision 2e. unclaimed shows no badge; claimed-but-not-verified shows no
-- badge; verified shows the badge; and a relationship_type of affiliate or
-- partner does NOT by itself make a company verified. Claiming does not verify.
--
-- The last of those four is the one most likely to rot, because affiliate and
-- partner are commercial states that read like endorsements. The database
-- protection is twofold: `verified` ignores relationship_type entirely, and
-- relationship_type is not exposed to any homeowner surface at all, so no
-- frontend can accidentally render it as a badge.
--
-- The badge state must also read THE SAME wherever a builder appears. That is
-- asserted directly: the paid directory row and the public profile row for one
-- listing must agree, in every state.
-- =============================================================================
select t.suite('040 verified badge');

do $$
declare
  v_paid  uuid := t.mk_paid_homeowner();
  v_pa    uuid;
  v_admin uuid := t.mk_account('admin');

  -- the four states
  v_unclaimed uuid := t.mk_builder();
  v_claimed   uuid := t.mk_claimed_builder();
  v_verified  uuid := t.mk_verified_builder();
  v_affiliate uuid := t.mk_claimed_builder('{"relationship_type": "affiliate"}'::jsonb);
  v_partner   uuid := t.mk_claimed_builder('{"relationship_type": "partner"}'::jsonb);
begin
  v_pa := t.authid(v_paid);

  -- ── state 1: unclaimed ────────────────────────────────────────────────────
  perform t.assert_scalar(
    'state-unclaimed-no-badge',
    '2e: an unclaimed listing shows no badge',
    'authenticated', v_pa,
    format('select verified from public.builders_public where id = %L', v_unclaimed),
    'false',
    'an unclaimed listing reads as verified');

  -- ── state 2: claimed but not verified ─────────────────────────────────────
  perform t.assert_scalar(
    'state-claimed-no-badge',
    '2e: claiming a listing does not make it verified',
    'authenticated', v_pa,
    format('select verified from public.builders_public where id = %L', v_claimed),
    'false',
    'claiming alone produced a Verified badge, which would let any company verify itself');

  perform t.assert_scalar(
    'state-claimed-is-claimed',
    '2e: claimed and verified are distinct states, never blurred',
    'authenticated', v_pa,
    format('select claimed from public.builders_public where id = %L', v_claimed),
    'true',
    'a claimed listing does not report claimed, so the directory cannot tell the four states apart');

  -- ── state 3: verified ─────────────────────────────────────────────────────
  perform t.assert_scalar(
    'state-verified-badge',
    '2e: a listing that completed the verification step shows the badge',
    'authenticated', v_pa,
    format('select verified from public.builders_public where id = %L', v_verified),
    'true',
    'a claimed and checked listing does not show the badge');

  -- ── state 4: affiliate and partner are NOT verified ───────────────────────
  perform t.assert_scalar(
    'state-affiliate-not-verified',
    '2e: a relationship type of affiliate does NOT by itself make a company verified',
    'authenticated', v_pa,
    format('select verified from public.builders_public where id = %L', v_affiliate),
    'false',
    'an affiliate reads as Verified on ADUAtlas without ever being checked, which is a claim ADUAtlas has not earned the right to make');

  perform t.assert_scalar(
    'state-partner-not-verified',
    '2e: a relationship type of partner does NOT by itself make a company verified',
    'authenticated', v_pa,
    format('select verified from public.builders_public where id = %L', v_partner),
    'false',
    'a partner reads as Verified on ADUAtlas without ever being checked');

  -- An affiliate that IS checked does get the badge: the point is that the
  -- commercial type is irrelevant, not that affiliates are excluded.
  perform t.verify(v_affiliate, v_admin);
  perform t.assert_scalar(
    'affiliate-verified-when-checked',
    '2e: verification is independent of the commercial relationship',
    'authenticated', v_pa,
    format('select verified from public.builders_public where id = %L', v_affiliate),
    'true',
    'a checked affiliate is denied the badge, so verification is being treated as a commercial tier');

  -- ── relationship_type never reaches a homeowner surface ───────────────────
  -- Nothing can render a commercial arrangement as a badge if nothing can read
  -- it. This is the structural half of the rule.
  perform t.assert_denied(
    'relationship-not-in-paid-view',
    'the commercial arrangement is never a homeowner-facing signal',
    'authenticated', v_pa,
    'select relationship_type from public.builders_public',
    'relationship_type is readable in the paid directory view, so a frontend can render affiliate or partner as though it were a verification');

  -- 0015 revoked anon's set-read on builders_public_profile (2a: the directory is
  -- never browsable), so asserting "anon cannot select relationship_type from the
  -- view" now passes for the WRONG reason: it would pass even if the column were
  -- exposed, because the whole view is refused. Assert the real property instead,
  -- against the function that IS anon's door: the public profile's return
  -- signature must not contain the commercial arrangement at all.
  perform t.assert_scalar(
    'relationship-not-in-public-profile',
    'the commercial arrangement is never a homeowner-facing signal',
    'anon', null,
    $q$select count(*)::text from information_schema.parameters
        where specific_schema = 'public'
          and specific_name like 'get_public_builder%'
          and parameter_name = 'relationship_type'$q$,
    '0',
    'get_public_builder returns relationship_type, so a frontend could render affiliate or partner as though it were a verification');

  -- ── the badge reads the same wherever the builder appears ─────────────────
  -- One listing, two surfaces, one answer. Asserted for all four states.
  declare
    r record;
    v_paid_val text;
    v_pub_val  text;
  begin
    for r in
      select * from (values
        (v_unclaimed, 'unclaimed'),
        (v_claimed,   'claimed-not-verified'),
        (v_verified,  'verified'),
        (v_partner,   'partner-not-verified')
      ) as x(id, label)
    loop
      v_paid_val := t.scalar('authenticated', v_pa,
        format('select verified from public.builders_public where id = %L', r.id));
      -- anon holds no grant on public.builders (2a: the directory is not browsable),
      -- so the slug is resolved HERE, in the test's own context, and passed to the
      -- one-row function that is anon's actual door to a public profile.
      v_pub_val := t.scalar('anon', null,
        format('select verified from public.get_public_builder(%L)',
               (select slug from public.builders where id = r.id)));
      perform t.assert(
        'badge-consistent-' || r.label,
        '2e: the badge state reads the same wherever a builder appears',
        v_paid_val is not distinct from v_pub_val,
        format('the paid directory says verified=%s and the public profile says verified=%s for the same %s listing',
               coalesce(v_paid_val, '<no row>'), coalesce(v_pub_val, '<no row>'), r.label));
    end loop;
  end;

  -- ── no second badge column was invented to decorate the distinction ───────
  -- 2e: "No additional badges are invented." A new boolean on either homeowner
  -- surface is how that decision gets undone, so the column lists are pinned in
  -- suite 130 and the specific shape is asserted here.
  perform t.assert_count(
    'no-extra-badge-columns',
    '2e: no additional badges are invented to decorate the distinction',
    'service_role', null,
    $q$select column_name from information_schema.columns
        where table_schema = 'public'
          and table_name in ('builders_public', 'builders_public_profile')
          and (column_name like '%certif%'
               or column_name like '%endors%'
               or column_name like '%approved_badge%'
               or column_name like '%trusted%'
               or column_name like '%premium%')$q$,
    0,
    'a new badge-like column appeared on a homeowner-facing view; 2e allows exactly one badge and forbids inventing others');

  -- ── the word is Verified, never Certified ─────────────────────────────────
  perform t.assert_count(
    'never-certified',
    'decision 10: the word is Verified, never Certified',
    'service_role', null,
    $q$select 1 from information_schema.columns
        where table_schema = 'public' and column_name ilike '%certified%'$q$,
    0,
    'a column named after certification exists; ADUAtlas verifies and never certifies');
end
$$;
