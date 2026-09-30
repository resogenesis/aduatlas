-- =============================================================================
-- INVARIANT: a builder account never gets the homeowner database.
--
-- Spec: decisions 8 and 2h, section 5.6. "Builders never browse homeowner leads
-- and never see homeowner identity." The builder's own analytics are COUNTS, and
-- a count is the most a builder is entitled to.
--
-- The tests below walk every route a builder account actually has: its own row,
-- its own stats, the referral event ledger, the leads table, the users table,
-- the studies and support tables, and the conversation tables from 0011. A
-- builder that can reach a homeowner's identity through any one of them is the
-- same failure whichever route it was.
-- =============================================================================
select t.suite('060 builder isolation');

do $$
declare
  v_b     uuid := t.mk_claimed_builder();
  v_pro   uuid;
  v_pauth uuid;
  v_home  uuid := t.mk_paid_homeowner();
  v_code  text;
begin
  v_pro   := t.owner_of(v_b);
  v_pauth := t.owner_authid(v_b);
  select referral_code into v_code from public.builders where id = v_b;

  -- Give the builder something real to be curious about: an attributed lead, an
  -- attributed account, a saved builder and an introduction request.
  perform public.capture_lead('isolation-lead@example.test'::citext, 'unlock', null, v_code);
  update public.users set referred_by_builder_id = v_b, referred_at = now() where id = v_home;
  insert into public.saved_builders (user_id, builder_id) values (v_home, v_b);
  insert into public.intro_requests (user_id, builder_id, message) values (v_home, v_b, 'interested');

  -- ── the homeowner tables ──────────────────────────────────────────────────
  perform t.assert_denied(
    'builder-cannot-read-leads',
    'builders never browse homeowner leads',
    'authenticated', v_pauth,
    'select email from public.leads',
    'a builder account can read the leads table, which is the homeowner lead list itself');

  perform t.assert_count(
    'builder-cannot-read-users',
    'builders never see homeowner identity',
    'authenticated', v_pauth,
    'select 1 from public.users',
    1,
    'a builder account can read more than its own row of the users table, so it can enumerate homeowners');

  perform t.assert_scalar(
    'builder-sees-only-own-user-row',
    'builders never see homeowner identity',
    'authenticated', v_pauth,
    'select (id = public.current_app_user_id()) as r from public.users',
    'true',
    'the one row a builder account reads from users is not its own');

  perform t.assert_denied(
    'builder-cannot-read-events',
    'a builder gets counts, never the underlying homeowner events',
    'authenticated', v_pauth,
    format('select user_id from public.referral_events where builder_id = %L', v_b),
    'a builder account can read the referral_events ledger, which carries the user_id of every attributed homeowner');

  perform t.assert_count(
    'builder-cannot-read-studies',
    'builders never see homeowner property work',
    'authenticated', v_pauth,
    'select 1 from public.studies',
    0,
    'a builder account can read homeowner feasibility studies, including intake addresses');

  perform t.assert_count(
    'builder-cannot-read-support',
    'builders never see homeowner support threads',
    'authenticated', v_pauth,
    'select 1 from public.support_messages',
    0,
    'a builder account can read homeowner Concierge support messages');

  perform t.assert_count(
    'builder-cannot-read-saved',
    'builders never learn which homeowners saved them',
    'authenticated', v_pauth,
    'select 1 from public.saved_builders',
    0,
    'a builder account can see which homeowners saved it, which is a lead list by another name');

  perform t.assert_count(
    'builder-cannot-read-intros',
    'builders never browse introduction requests',
    'authenticated', v_pauth,
    'select 1 from public.intro_requests',
    0,
    'a builder account can read introduction requests, exposing the homeowners behind them');

  -- ── the builder's own dashboard is counts only ────────────────────────────
  perform t.assert_scalar(
    'own-stats-available',
    'a claimed builder reads its own marketplace counts',
    'authenticated', v_pauth,
    'select (public.my_referral_stats() is not null) as r',
    'true',
    'a claimed builder cannot read its own dashboard counts');

  perform t.assert_scalar(
    'own-stats-are-counts',
    'a builder gets counts, never homeowner identity',
    'authenticated', v_pauth,
    'select (public.my_referral_stats()->>''referred_users_count'') as r',
    '1',
    'the builder dashboard does not report the attributed account count it is supposed to');

  perform t.assert_scalar(
    'own-stats-no-identity',
    'a builder gets counts, never homeowner identity',
    'authenticated', v_pauth,
    'select (public.my_referral_stats()::text not ilike ''%@%'') as r',
    'true',
    'the builder dashboard payload contains an email address');

  perform t.assert_scalar(
    'own-stats-no-user-ids',
    'a builder gets counts, never homeowner identity',
    'authenticated', v_pauth,
    format('select (public.my_referral_stats()::text not like %L) as r', '%' || v_home::text || '%'),
    'true',
    'the builder dashboard payload contains a homeowner user id');

  -- ── one builder cannot read another builder's dashboard ───────────────────
  declare
    v_other_b   uuid := t.mk_claimed_builder();
    v_other_auth uuid := t.owner_authid(v_other_b);
  begin
    perform t.assert_scalar(
      'stats-scoped-to-own-listing',
      'a builder reads only its own listing''s counts',
      'authenticated', v_other_auth,
      'select (public.my_referral_stats()->>''referred_users_count'') as r',
      '0',
      'a builder account can see another builder''s attributed account count');
  end;

  -- ── the admin-only ledger view is admin-only ──────────────────────────────
  perform t.assert_denied(
    'referral-stats-not-for-builders',
    'the cross-builder admin ledger is service-role only',
    'authenticated', v_pauth,
    'select * from public.referral_stats()',
    'a builder account can call referral_stats(), the cross-builder admin ledger');

  perform t.assert_denied(
    'referral-stats-not-for-homeowners',
    'the cross-builder admin ledger is service-role only',
    'authenticated', t.authid(v_home),
    'select * from public.referral_stats()',
    'a homeowner can call the cross-builder admin ledger');

  -- ── a builder cannot write a project_signed for itself ────────────────────
  perform t.assert_denied(
    'builder-cannot-record-own-fee',
    'the $500 event is recorded by ADUAtlas, never claimed by the builder',
    'authenticated', v_pauth,
    format('select public.admin_mark_project_signed(%L, %L, ''builder'', current_date, ''self-reported'')', v_b, v_home),
    'a builder account can record its own signed project, which is the one event with no machine evidence behind it');

  -- ── a builder cannot reach around the RPCs to its own row ─────────────────
  perform t.assert_denied(
    'builder-cannot-write-table',
    'a builder edits its listing through save_my_builder, never the table',
    'authenticated', v_pauth,
    format('update public.builders set verified_at = now() where id = %L', v_b),
    'a builder account can write the builders table directly, so it could verify itself');

  -- save_my_builder writes a WHITELIST of fields, so a patch naming a field it
  -- does not own is accepted and ignored rather than refused. Both halves are
  -- asserted, because the pair is the actual guarantee: the RPC stays usable
  -- (a stray key is not a hard error the portal has to handle) and the
  -- privileged field does not move. If the whitelist ever became a blacklist,
  -- the second assertion is the one that catches it.
  perform t.assert_ok(
    'self-verify-patch-tolerated',
    'save_my_builder writes a whitelist, so an unknown key is ignored rather than fatal',
    'authenticated', v_pauth,
    'select public.save_my_builder(''{"verified_at": "2026-01-01T00:00:00Z", "description": "patched"}''::jsonb)',
    'save_my_builder refused a patch containing a field it does not own, so one stray key breaks the builder portal');

  perform t.assert_scalar(
    'self-verify-had-no-effect',
    'verification is the admin''s step, never the builder''s',
    'service_role', null,
    format('select verified_at is null as r from public.builders where id = %L', v_b),
    'true',
    'a builder patch set verified_at on its own listing, so any company can award itself the Verified on ADUAtlas badge');

  perform t.assert_scalar(
    'self-verify-patch-did-write-own-field',
    'save_my_builder still writes the fields the builder does own',
    'service_role', null,
    format('select description from public.builders where id = %L', v_b),
    'patched',
    'the patch was accepted but the builder''s own editable field did not change, so the previous assertion proves nothing');

  perform t.assert_denied(
    'builder-cannot-self-set-terms',
    'the recorded commercial terms are not the builder''s to write',
    'authenticated', v_pauth,
    format('update public.builders set success_fee_cents = 0 where id = %L', v_b),
    'a builder account can write its own success fee directly on the table');
end
$$;
