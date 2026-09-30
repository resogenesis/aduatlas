-- =============================================================================
-- INVARIANT: a verification belongs to the company that was checked, not to the
-- row. It never travels with the listing, and it never outlives the claim.
--
-- Spec: decisions 2e and 10, enforced at the builders_on_claim choke point in
-- 0007. Three separate things are asserted, because in the product they can fail
-- separately:
--   1. the trigger clears verified_at on any ownership change;
--   2. the two views derive `verified` from verified_at AND a present owner, so
--      even a hand-written verified_at on an unclaimed row does not show a badge;
--   3. claimed_at is the start of the 90 day free period and is never inherited.
-- =============================================================================
select t.suite('030 ownership and badge');

do $$
declare
  v_b     uuid := t.mk_builder();
  v_pro1  uuid := t.mk_account('pro');
  v_pro2  uuid := t.mk_account('pro');
  v_admin uuid := t.mk_account('admin');
  v_paid  uuid := t.mk_paid_homeowner();
  v_pa    uuid;
  v_claim1 timestamptz;
begin
  v_pa := t.authid(v_paid);

  perform t.link_owner(v_b, v_pro1);
  perform t.verify(v_b, v_admin);

  -- Age the first owner's claim deliberately. Everything in this DO block shares
  -- one transaction timestamp, so a freshly stamped claimed_at and a re-stamped
  -- one are equal to the microsecond and the inheritance test would prove
  -- nothing. Backdating it also makes the test the real case: an owner 200 days
  -- into a 90 day trial must not hand the next owner an already expired clock.
  -- claimed_at is written directly here, which does not touch owner_user_id or
  -- claim_code and so does not fire builders_on_claim.
  update public.builders set claimed_at = now() - interval '200 days' where id = v_b;
  select claimed_at into v_claim1 from public.builders where id = v_b;

  perform t.assert_scalar(
    'verified-shows',
    'a claimed and checked listing shows the Verified on ADUAtlas badge',
    'authenticated', v_pa,
    format('select verified from public.builders_public where id = %L', v_b),
    'true',
    'a claimed, verified listing does not read as verified in the paid directory');

  -- ── ownership TRANSFER ────────────────────────────────────────────────────
  perform t.assert_ok(
    'transfer-owner',
    'a verification never travels to a new owner',
    'service_role', null,
    format('update public.builders set owner_user_id = %L where id = %L', v_pro2, v_b),
    'the service role could not transfer ownership');

  perform t.assert_scalar(
    'transfer-clears-verified-at',
    'a verification never travels to a new owner',
    'service_role', null,
    format('select verified_at is null as r from public.builders where id = %L', v_b),
    'true',
    'verified_at survived an ownership change, so a badge earned by one company now vouches for another');

  perform t.assert_scalar(
    'transfer-clears-verified-by',
    'a verification never travels to a new owner',
    'service_role', null,
    format('select verified_by is null as r from public.builders where id = %L', v_b),
    'true',
    'verified_by survived an ownership change');

  perform t.assert_scalar(
    'transfer-badge-gone-in-view',
    'a verification never travels to a new owner',
    'authenticated', v_pa,
    format('select verified from public.builders_public where id = %L', v_b),
    'false',
    'the paid directory still shows the badge after the listing changed hands');

  perform t.assert_scalar(
    'transfer-resets-claim-clock',
    'claimed_at is the start of the 90 day free period and is never inherited',
    'service_role', null,
    format('select (claimed_at > %L) as r from public.builders where id = %L', v_claim1, v_b),
    'true',
    'the new owner inherited the previous owner''s claim date, which hands them a shortened or already expired trial');

  -- ── ownership REMOVED ─────────────────────────────────────────────────────
  perform t.verify(v_b, v_admin);
  perform t.assert_ok(
    'remove-owner',
    'a listing that loses its owner is unclaimed again',
    'service_role', null,
    format('update public.builders set owner_user_id = null where id = %L', v_b),
    'the service role could not remove the owner');

  perform t.assert_scalar(
    'remove-clears-verified',
    'the badge requires a claimed owner and never survives losing one',
    'service_role', null,
    format('select verified_at is null as r from public.builders where id = %L', v_b),
    'true',
    'verified_at survived the removal of the owning account');

  perform t.assert_scalar(
    'remove-clears-claimed-at',
    'a listing that loses its owner carries no claim date',
    'service_role', null,
    format('select claimed_at is null as r from public.builders where id = %L', v_b),
    'true',
    'an unclaimed listing still carries a claim date, so the 90 day clock runs on a row nobody owns');

  -- ── defense in depth: the VIEW does not trust verified_at alone ───────────
  -- The trigger fires on owner_user_id and claim_code writes. A verified_at
  -- written directly onto an unclaimed row never passes it, which is exactly the
  -- case the view's AND clause exists to cover.
  declare
    v_orphan uuid := t.mk_builder();
  begin
    perform t.assert_ok(
      'orphan-verified-at',
      'the badge is defined as claimed AND checked, in the view as well as the trigger',
      'service_role', null,
      format('update public.builders set verified_at = now(), verified_by = %L where id = %L', v_admin, v_orphan),
      'could not set up the unclaimed-but-stamped case');

    perform t.assert_scalar(
      'orphan-no-badge-paid',
      'the badge is defined as claimed AND checked, in the view as well as the trigger',
      'authenticated', v_pa,
      format('select verified from public.builders_public where id = %L', v_orphan),
      'false',
      'the paid directory shows a badge on an UNCLAIMED listing; verified must require a present owner as well as verified_at');

    perform t.assert_scalar(
      'orphan-no-badge-public',
      'the badge is defined as claimed AND checked, in the view as well as the trigger',
      'anon', null,
      format('select verified from public.get_public_builder(%L)', (select slug from public.builders where id = v_orphan)),
      'false',
      'the public profile shows a badge on an UNCLAIMED listing');

    perform t.assert_scalar(
      'orphan-not-claimed-flag',
      'claimed is true exactly when somebody owns the listing',
      'anon', null,
      format('select claimed from public.get_public_builder(%L)', (select slug from public.builders where id = v_orphan)),
      'false',
      'an unclaimed listing reports claimed = true, so the page cannot say where the record came from');
  end;

  -- ── imagery follows the claim, and comes back when ownership is given up ──
  -- ADUAtlas seeding a listing from a company's own material is grounds to
  -- describe the company, not permission to republish its pictures.
  declare
    v_img uuid := t.mk_builder('{"featured": true}'::jsonb);
    v_img_pro uuid := t.mk_account('pro');
    v_img_slug text;
  begin
    -- Resolved here rather than inside the anon query: anon has no grant on
    -- public.builders, which is the point of the surrounding suite.
    select slug into v_img_slug from public.builders where id = v_img;
    perform t.assert_scalar(
      'unclaimed-logo-withheld',
      'imagery is published only for a claimed listing',
      'anon', null,
      format('select logo_path is null as r from public.get_public_builder(%L)', (select slug from public.builders where id = v_img)),
      'true',
      'the public profile publishes the logo of an unclaimed listing, republishing a company''s pictures without permission');

    perform t.assert_scalar(
      'unclaimed-photos-empty',
      'imagery is published only for a claimed listing',
      'anon', null,
      format('select (photos = ''{}''::text[]) as r from public.get_public_builder(%L)', (select slug from public.builders where id = v_img)),
      'true',
      'the public profile publishes the project photos of an unclaimed listing');

    -- get_featured_builders() orders by name and returns at most 6 rows, so this
    -- probe is only meaningful if the fixture is certain to be inside that window.
    -- Making it the only featured row removes a dependence on how many featured
    -- listings other suites happened to create and on collation order.
    update public.builders set featured = false where id <> v_img;

    perform t.assert_count(
      'featured-probe-present',
      'the featured-strip assertion needs its fixture to be inside the teaser limit',
      'anon', null,
      format('select 1 from public.get_featured_builders() where slug = %L', v_img_slug),
      1,
      'the fixture is not in the anonymous featured teaser, so the imagery assertion below would be comparing against no row at all');

    perform t.assert_scalar(
      'unclaimed-featured-logo-withheld',
      'imagery is published only for a claimed listing, on every public surface',
      'anon', null,
      format('select logo_path is null as r from public.get_featured_builders() where slug = %L', v_img_slug),
      'true',
      'the anonymous featured strip hands out the logo of an unclaimed listing while the profile view beside it withholds exactly that column');

    perform t.link_owner(v_img, v_img_pro);

    perform t.assert_scalar(
      'claimed-logo-published',
      'imagery is published only for a claimed listing',
      'anon', null,
      format('select logo_path is not null as r from public.get_public_builder(%L)', (select slug from public.builders where id = v_img)),
      'true',
      'a claimed listing''s own logo is withheld, so a company that claimed its listing cannot show its brand');

    perform t.assert_ok(
      'unclaim-image-owner',
      'imagery is withheld again once a listing loses its owner',
      'service_role', null,
      format('update public.builders set owner_user_id = null where id = %L', v_img),
      'could not remove the owner');

    perform t.assert_scalar(
      'unclaimed-again-logo-withheld',
      'imagery is withheld again once a listing loses its owner',
      'anon', null,
      format('select logo_path is null as r from public.get_public_builder(%L)', (select slug from public.builders where id = v_img)),
      'true',
      'a listing that lost its owner keeps publishing its imagery');
  end;
end
$$;
