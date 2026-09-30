-- =============================================================================
-- INVARIANT: the public view and private column boundary.
--
-- THIS SUITE CONTAINS A RESTATEMENT. The intermediate scratch proof's test 32
-- pinned the PRE-0009 column list of builders_public_profile, so the legitimate
-- addition of `claimed` — which 0009 added on purpose, so an unclaimed profile
-- page can say where the record came from — read as a failure. The expectation
-- was obsolete, not the test.
--
-- The test's real purpose is preserved exactly: EVERY PRIVATE COLUMN STAYS
-- HIDDEN. That is why it is written as a whole-list assertion rather than a list
-- of absences. A list of absences passes when a column nobody thought of is
-- added; a pinned list fails on any addition and forces a human to decide
-- whether the new column is another `claimed` or another B14. Adding a column to
-- a public view is a decision, and this test is the place it gets made.
--
-- `claimed` is now expected on BOTH views: 0009 added it to the public profile
-- and 0010 added it to the paid directory, for the same stated reason.
-- =============================================================================
select t.suite('130 view column boundary');

do $$
declare
  v_paid uuid := t.mk_paid_homeowner();
  v_pa   uuid;
  c      text;
begin
  v_pa := t.authid(v_paid);

  -- ── the PUBLIC profile view: anon-readable, so the list is the whole rule ──
  -- Restated to expect `claimed` (0009) while still pinning every other column.
  perform t.assert_columns(
    'public-profile-column-list',
    '2a: a public profile may show who the company is, where it works and what it builds, and nothing else',
    'public.builders_public_profile',
    array[
      'id', 'slug', 'name', 'description',
      'state', 'city', 'cities', 'service_states',
      'specialties', 'service_types', 'build_methods', 'build_approach',
      'turnkey', 'licensed_states', 'website',
      'verified',
      'logo_path', 'photos',
      -- Added by 0009, deliberately: the page has to be able to say that an
      -- unclaimed listing is a record ADUAtlas compiled from public information.
      'claimed'
    ],
    'the anon-readable profile view changed shape. An added column is published to the whole internet and to every crawler, so it is a decision, not a refactor: either the column belongs on a public page and this list should be updated, or it is a leak');

  -- ── the PAID directory view ───────────────────────────────────────────────
  perform t.assert_columns(
    'paid-directory-column-list',
    '2a and 2d: the paid directory carries directory columns only',
    'public.builders_public',
    array[
      'id', 'slug', 'name', 'description', 'logo_path', 'website', 'external_link',
      'contact_email', 'contact_phone',
      'state', 'city', 'cities', 'service_zips',
      'service_states', 'specialties', 'service_types', 'build_approach',
      'build_methods', 'turnkey', 'licensed_states', 'photos', 'videos',
      'featured', 'created_at',
      'verified',
      -- Added by 0010 alongside the contact gating, so a directory card can fail
      -- closed and the four listing states stay distinct.
      'claimed'
    ],
    'the paid directory view changed shape; check whether the new column is a deliberate addition or a private field that escaped');

  -- ── every private column, named, on both views ───────────────────────────
  -- Belt to the pinned list's braces, and the failure message names the column.
  foreach c in array array[
    'claim_code', 'claimed_at', 'verified_by', 'external_tracking_url',
    'relationship_type', 'owner_user_id', 'profile_status', 'approved_at',
    'approved_by', 'admin_notes', 'commercial_terms', 'referral_code',
    'membership_price_cents', 'success_fee_cents', 'intro_days',
    'contact_name', 'address_line', 'zip', 'joined_at'
  ]
  loop
    perform t.assert_denied(
      'public-profile-hides-' || c,
      '2a: a public profile may never show claim codes, referral or tracking information, internal verification data, analytics, homeowner information, or private contact and conversation details',
      'anon', null,
      format('select %I from public.builders_public_profile', c),
      format('the anon-readable public profile exposes %s', c));
  end loop;

  foreach c in array array[
    'claim_code', 'claimed_at', 'verified_by', 'external_tracking_url',
    'relationship_type', 'owner_user_id', 'profile_status', 'approved_at',
    'approved_by', 'admin_notes', 'commercial_terms', 'referral_code',
    'membership_price_cents', 'success_fee_cents', 'intro_days',
    'contact_name', 'address_line'
  ]
  loop
    perform t.assert_denied(
      'paid-directory-hides-' || c,
      'the paid directory carries directory columns only: no internal, commercial or approval-audit fields',
      'authenticated', v_pa,
      format('select %I from public.builders_public', c),
      format('the paid directory view exposes %s to a paying homeowner', c));
  end loop;

  -- ── the private columns still exist on the table ─────────────────────────
  -- Withheld by the view, not deleted from the record. A test suite that let
  -- somebody "fix" a leak by dropping the column would be worse than no test.
  foreach c in array array[
    'claim_code', 'claimed_at', 'verified_at', 'verified_by', 'relationship_type',
    'external_tracking_url', 'owner_user_id', 'profile_status', 'admin_notes',
    'commercial_terms', 'referral_code', 'contact_email', 'contact_phone',
    'membership_price_cents', 'success_fee_cents', 'intro_days'
  ]
  loop
    perform t.assert(
      'record-keeps-' || c,
      'private columns are WITHHELD by the view, never deleted from the record',
      t.has_column('public.builders', c),
      format('builders.%s no longer exists. Amy maintains this data in the admin console (decision 2f); a leak is fixed by narrowing the view, never by dropping the column', c));
  end loop;

  -- ── the views are the only homeowner route ───────────────────────────────
  perform t.assert_denied(
    'no-table-grant-authenticated',
    'homeowners read the views; the table grant stays revoked',
    'authenticated', v_pa,
    'select id from public.builders',
    'the authenticated role has a select grant on public.builders again, which bypasses every column decision made in the two views');

  perform t.assert_denied(
    'no-table-grant-anon',
    'homeowners read the views; the table grant stays revoked',
    'anon', null,
    'select id from public.builders',
    'the anon role has a select grant on public.builders');

  -- ── RLS is on, on every table that holds somebody's data ─────────────────
  declare
    tbl text;
  begin
    foreach tbl in array array[
      'users', 'leads', 'stripe_events', 'builders', 'saved_builders',
      'intro_requests', 'studies', 'support_messages', 'referral_events',
      'site_content', 'site_content_versions'
    ]
    loop
      perform t.assert(
        'rls-enabled-' || tbl,
        'every table holding somebody''s data has row level security enabled',
        (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = tbl),
        format('row level security is NOT enabled on public.%s, so the only thing standing between a client and the whole table is a grant', tbl));
    end loop;

    -- The 0011 messaging tables, probed so this suite still runs where 0011 is
    -- not applied. A conversation is two named people's private correspondence,
    -- so it is the last table in the schema that may rely on a grant alone.
    foreach tbl in array array['builder_conversations', 'builder_messages']
    loop
      if t.has_relation('public.' || tbl) then
        perform t.assert(
          'rls-enabled-' || tbl,
          'every table holding somebody''s data has row level security enabled',
          (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = tbl),
          format('row level security is NOT enabled on public.%s, so every signed-in account with the table grant reads every conversation in the marketplace', tbl));
      else
        perform t.skip(
          'rls-enabled-' || tbl,
          'every table holding somebody''s data has row level security enabled',
          format('public.%s does not exist; migration 0011 is not applied to this database', tbl));
      end if;
    end loop;
  end;
end
$$;
