-- =============================================================================
-- INVARIANT: saving a builder and requesting an introduction need a live paid
-- plan, in the database (T4-02, RC4 rehearsal; migration 0025).
--
-- Decision 2a: "The paid account keeps search, filters, saving, richer builder
-- information, recommendations, messaging and introductions." Through RC4 the
-- two insert policies (0004) asked only that the row be the caller's own, so a
-- free, refunded or builder account could save builders and file introduction
-- requests through the API and only the page said otherwise.
--
-- Attacked as: a free homeowner, a refunded one, a builder account, and a paid
-- homeowner writing a row for someone else. Allowed for: a paid Golden and a
-- paid Platinum homeowner. A refunded homeowner still reads and clears what
-- they saved before, because nothing already saved is taken away.
--
-- These statements do not name anything 0025 creates, so against a chain
-- without it they FAIL rather than error (proved on RC4 before the fix).
-- =============================================================================
select t.suite('300 paid directory actions');

do $$
declare
  v_builder  uuid := t.mk_builder();
  v_builder2 uuid := t.mk_builder();
  v_free     uuid := t.mk_account('homeowner');
  v_golden   uuid := t.mk_paid_homeowner('roadmap');
  v_plat     uuid := t.mk_paid_homeowner('report');
  v_refund   uuid := t.mk_refunded_homeowner('roadmap');
  v_pro      uuid := t.mk_account('pro');
  v_sponsor  uuid := t.mk_account('homeowner');   -- sponsored Golden (a city paid, not the resident)
  v_comp     uuid := t.mk_account('homeowner');   -- Golden granted by ADUAtlas
begin
  -- The builder account holds a live paid tier, so only the ROLE half of the
  -- predicate can refuse it: a predicate that dropped "role = homeowner" fails
  -- the two builder-account assertions below.
  update public.users set paid_at = now(), paid_tier = 'report', refunded_at = null where id = v_pro;
  -- Sponsored and comped access are paid plans too (2a covers "the paid
  -- account", whoever paid). A predicate narrowed to purchases fails these.
  update public.users set paid_at = now(), paid_tier = 'roadmap', refunded_at = null, paid_origin = 'sponsorship' where id = v_sponsor;
  update public.users set paid_origin = 'sponsorship' where id = v_sponsor and paid_origin is distinct from 'sponsorship';
  update public.users set paid_at = now(), paid_tier = 'roadmap', refunded_at = null, paid_origin = 'admin_comp' where id = v_comp;
  update public.users set paid_origin = 'admin_comp' where id = v_comp and paid_origin is distinct from 'admin_comp';

  -- ── saving a builder ──────────────────────────────────────────────────────
  perform t.assert_denied(
    'save-free-refused',
    '2a: saving a builder comes with a paid plan',
    'authenticated', t.authid(v_free),
    format('insert into public.saved_builders (user_id, builder_id) values (%L, %L)', v_free, v_builder),
    'a free homeowner saved a builder');

  perform t.assert_denied(
    'save-refunded-refused',
    '2a: saving a builder comes with a LIVE paid plan',
    'authenticated', t.authid(v_refund),
    format('insert into public.saved_builders (user_id, builder_id) values (%L, %L)', v_refund, v_builder),
    'a refunded homeowner saved a builder');

  perform t.assert_denied(
    'save-builder-account-refused',
    '2a: saving is a homeowner plan feature',
    'authenticated', t.authid(v_pro),
    format('insert into public.saved_builders (user_id, builder_id) values (%L, %L)', v_pro, v_builder),
    'a builder account saved a builder');

  perform t.assert_ok(
    'save-golden-allowed',
    '2a: every paid plan includes saving',
    'authenticated', t.authid(v_golden),
    format('insert into public.saved_builders (user_id, builder_id) values (%L, %L)', v_golden, v_builder),
    'a paid Golden homeowner could not save a builder');

  perform t.assert_ok(
    'save-platinum-allowed',
    '2a: every paid plan includes saving',
    'authenticated', t.authid(v_plat),
    format('insert into public.saved_builders (user_id, builder_id) values (%L, %L)', v_plat, v_builder),
    'a paid Platinum homeowner could not save a builder');

  perform t.assert_ok(
    'save-sponsored-allowed',
    '2a: a sponsored Golden resident holds the paid account and may save',
    'authenticated', t.authid(v_sponsor),
    format('insert into public.saved_builders (user_id, builder_id) values (%L, %L)', v_sponsor, v_builder),
    'a sponsored Golden resident could not save a builder');

  perform t.assert_ok(
    'save-comped-allowed',
    '2a: access ADUAtlas granted is a paid plan too',
    'authenticated', t.authid(v_comp),
    format('insert into public.saved_builders (user_id, builder_id) values (%L, %L)', v_comp, v_builder),
    'an admin-comped Golden homeowner could not save a builder');

  perform t.assert_denied(
    'save-for-someone-else-refused',
    'a row is only ever the caller''s own',
    'authenticated', t.authid(v_plat),
    format('insert into public.saved_builders (user_id, builder_id) values (%L, %L)', v_golden, v_builder2),
    'a paid homeowner saved a builder into another account');

  -- Saved while paid, then refunded: the row stays theirs to read and clear.
  insert into public.saved_builders (user_id, builder_id) values (v_refund, v_builder2);
  perform t.assert_count(
    'refunded-still-reads-saved',
    'nothing already saved is taken away',
    'authenticated', t.authid(v_refund),
    format('select 1 from public.saved_builders where user_id = %L', v_refund),
    1,
    'a refunded homeowner can no longer see what they saved');

  perform t.assert_ok(
    'refunded-still-clears-saved',
    'nothing already saved is taken away',
    'authenticated', t.authid(v_refund),
    format('delete from public.saved_builders where user_id = %L and builder_id = %L', v_refund, v_builder2),
    'a refunded homeowner can no longer remove what they saved');

  -- ── requesting an introduction ────────────────────────────────────────────
  perform t.assert_denied(
    'intro-free-refused',
    '2a: introductions come with a paid plan',
    'authenticated', t.authid(v_free),
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, %L)', v_free, v_builder, 'regress intro'),
    'a free homeowner filed an introduction request');

  perform t.assert_denied(
    'intro-refunded-refused',
    '2a: introductions come with a LIVE paid plan',
    'authenticated', t.authid(v_refund),
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, %L)', v_refund, v_builder, 'regress intro'),
    'a refunded homeowner filed an introduction request');

  perform t.assert_denied(
    'intro-builder-account-refused',
    '2a: introductions are a homeowner plan feature',
    'authenticated', t.authid(v_pro),
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, %L)', v_pro, v_builder, 'regress intro'),
    'a builder account filed an introduction request');

  perform t.assert_ok(
    'intro-golden-allowed',
    '2a: every paid plan includes introductions',
    'authenticated', t.authid(v_golden),
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, %L)', v_golden, v_builder, 'regress intro'),
    'a paid Golden homeowner could not request an introduction');

  perform t.assert_ok(
    'intro-sponsored-allowed',
    '2a: a sponsored Golden resident may request an introduction',
    'authenticated', t.authid(v_sponsor),
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, %L)', v_sponsor, v_builder, 'regress intro'),
    'a sponsored Golden resident could not request an introduction');

  perform t.assert_denied(
    'intro-for-someone-else-refused',
    'a row is only ever the caller''s own',
    'authenticated', t.authid(v_plat),
    format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, %L)', v_golden, v_builder2, 'regress intro'),
    'a paid homeowner filed an introduction request for another account');
end
$$;
