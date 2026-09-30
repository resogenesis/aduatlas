-- =============================================================================
-- INVARIANT: the line between what an anonymous visitor may see and what a
-- paying homeowner bought.
--
-- Spec: decisions 2a and 2, section 5.6. An individual builder profile is public
-- and indexable; the DIRECTORY is never publicly browsable. Search, filters,
-- saving, richer builder information, recommendations and messaging are what the
-- account pays for.
--
-- Two different mechanisms are asserted, and the difference matters. Anonymous
-- access to the paid directory must be REFUSED (no grant at all), while an
-- unpaid or refunded signed-in account is FILTERED (it may ask, and sees
-- nothing). A refusal that became a filter, or a filter that became a refusal,
-- would each be a different bug in a different layer.
-- =============================================================================
select t.suite('050 homeowner data boundary');

do $$
declare
  v_b        uuid := t.mk_verified_builder();
  v_paid     uuid := t.mk_paid_homeowner();
  v_free     uuid := t.mk_account('homeowner');
  v_refunded uuid := t.mk_refunded_homeowner();
  v_slug     text;
begin
  select slug into v_slug from public.builders where id = v_b;

  -- ── the paid directory is not publicly browsable ──────────────────────────
  perform t.assert_denied(
    'directory-not-anon',
    '2a: the directory as a whole is never publicly browsable',
    'anon', null,
    'select count(*) from public.builders_public',
    'the anonymous role can read the paid directory view, so the whole marketplace is public');

  perform t.assert_denied(
    'builders-table-not-anon',
    '2a: the directory as a whole is never publicly browsable',
    'anon', null,
    'select count(*) from public.builders',
    'the anonymous role can read the builders table directly');

  perform t.assert_denied(
    'builders-table-not-signed-in',
    'homeowners read the view, never the table (the table carries private columns)',
    'authenticated', t.authid(v_paid),
    'select count(*) from public.builders',
    'a paid homeowner can read the builders table directly, which carries claim codes and internal fields');

  -- ── the searchable directory stays paid ───────────────────────────────────
  perform t.assert_count(
    'free-account-sees-no-directory',
    '2: the searchable builder directory is in all three paid packages and nowhere else',
    'authenticated', t.authid(v_free),
    'select 1 from public.builders_public',
    0,
    'a signed-in account that never paid can browse the builder directory');

  perform t.assert_count(
    'refunded-sees-no-directory',
    'entitlement is paid_at is not null AND refunded_at is null',
    'authenticated', t.authid(v_refunded),
    'select 1 from public.builders_public',
    0,
    'a refunded account keeps directory access');

  perform t.assert_count(
    'paid-sees-directory',
    '2: the searchable builder directory is in all three paid packages',
    'authenticated', t.authid(v_paid),
    format('select 1 from public.builders_public where id = %L', v_b),
    1,
    'a paid homeowner cannot see an approved, active listing in the directory');

  -- ── the individual public profile IS public and indexable ─────────────────
  perform t.assert_count(
    'profile-public-anon',
    '2a: an individual builder profile page is public and indexable',
    'anon', null,
    format('select 1 from public.get_public_builder(%L)', v_slug),
    1,
    'the public builder profile is not readable anonymously, so it cannot be indexed and the search-readiness decision is undone');

  perform t.assert_count(
    'profile-public-free-account',
    '2a: an individual builder profile page is public and indexable',
    'authenticated', t.authid(v_free),
    format('select 1 from public.get_public_builder(%L)', v_slug),
    1,
    'a signed-in unpaid visitor cannot read the public profile');

  -- ── the anonymous teaser is a teaser ──────────────────────────────────────
  declare
    v_i int;
    v_n int;
  begin
    for v_i in 1..8 loop
      perform t.mk_builder(format('{"featured": true, "name": "Featured %s"}', v_i)::jsonb);
    end loop;
    v_n := (t.q('anon', null, 'select 1 from public.get_featured_builders()')->>'count')::int;
    perform t.assert(
      'featured-teaser-capped',
      '2a: anonymous visitors keep a small featured sample, not the directory',
      v_n <= 6,
      format('the anonymous featured teaser returned %s rows; it must stay a small sample, never a browsable directory', v_n));
  end;

  -- ── homeowner PII is nobody's to read ─────────────────────────────────────
  perform t.assert_denied(
    'leads-not-readable-anon',
    'top-of-funnel lead PII is service-role only',
    'anon', null,
    'select count(*) from public.leads',
    'the leads table is readable anonymously');

  perform t.assert_denied(
    'leads-not-readable-signed-in',
    'top-of-funnel lead PII is service-role only',
    'authenticated', t.authid(v_paid),
    'select count(*) from public.leads',
    'the leads table is readable by any signed-in account');

  perform t.assert_denied(
    'stripe-events-private',
    'the Stripe idempotency ledger is service-role only',
    'authenticated', t.authid(v_paid),
    'select count(*) from public.stripe_events',
    'the Stripe event ledger is readable by a signed-in account');

  -- ── one account, one row ──────────────────────────────────────────────────
  perform t.assert_count(
    'users-own-row-only',
    'a signed-in person reads their own account row and no other',
    'authenticated', t.authid(v_paid),
    'select 1 from public.users',
    1,
    'a signed-in homeowner can read more than their own account row, which exposes the homeowner database');

  -- Anonymous access to the account table is REFUSED, not filtered: 0001 grants
  -- select on users to authenticated only. The stronger of the two mechanisms,
  -- and asserted as such.
  perform t.assert_denied(
    'users-not-readable-anon',
    'a signed-in person reads their own account row and no other',
    'anon', null,
    'select 1 from public.users',
    'the users table is readable anonymously');

  -- ── a homeowner's own workspace is their own ──────────────────────────────
  declare
    v_other uuid := t.mk_paid_homeowner();
    v_study uuid;
  begin
    insert into public.studies (user_id, intake, status)
    values (v_other, '{"address": "1 Test St"}'::jsonb, 'submitted')
    returning id into v_study;

    perform t.assert_count(
      'studies-own-only',
      'a homeowner reads only their own property work',
      'authenticated', t.authid(v_paid),
      'select 1 from public.studies',
      0,
      'a homeowner can read another homeowner''s feasibility study and intake address');

    perform t.assert_count(
      'studies-visible-to-owner',
      'a homeowner reads their own property work',
      'authenticated', t.authid(v_other),
      format('select 1 from public.studies where id = %L', v_study),
      1,
      'a homeowner cannot read their own study');

    insert into public.support_messages (user_id, author, body)
    values (v_other, 'homeowner', 'Concierge question');

    perform t.assert_count(
      'support-own-only',
      'Concierge written support is private to the customer',
      'authenticated', t.authid(v_paid),
      'select 1 from public.support_messages',
      0,
      'a homeowner can read another homeowner''s Concierge support thread');
  end;

  -- ── saved builders and introduction requests are private ──────────────────
  declare
    v_other2 uuid := t.mk_paid_homeowner();
  begin
    insert into public.saved_builders (user_id, builder_id) values (v_other2, v_b);
    insert into public.intro_requests (user_id, builder_id, message) values (v_other2, v_b, 'please introduce us');

    perform t.assert_count(
      'saved-own-only',
      'a homeowner''s saved builders are their own',
      'authenticated', t.authid(v_paid),
      'select 1 from public.saved_builders',
      0,
      'a homeowner can see which builders another homeowner saved');

    perform t.assert_count(
      'intro-own-only',
      'a homeowner''s introduction requests are their own',
      'authenticated', t.authid(v_paid),
      'select 1 from public.intro_requests',
      0,
      'a homeowner can read another homeowner''s introduction requests');

    -- A homeowner cannot forge a request in someone else's name.
    perform t.assert_denied(
      'intro-no-forging',
      'a homeowner can only act as themselves',
      'authenticated', t.authid(v_paid),
      format('insert into public.intro_requests (user_id, builder_id, message) values (%L, %L, ''forged'')', v_other2, v_b),
      'a homeowner can create an introduction request in another homeowner''s name');
  end;
end
$$;
