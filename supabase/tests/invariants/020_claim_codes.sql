-- =============================================================================
-- INVARIANT: a claim code is a one-time secret that proves somebody at the
-- company received the invitation, and it never tells an attacker anything.
--
-- Spec: decision 10 and section 5.2. A code works once. A wrong code and a
-- spent code are INDISTINGUISHABLE, because a distinguishable pair turns the
-- claim endpoint into an oracle for which codes exist. Homeowners cannot claim.
-- One builder account holds one listing. Claim codes and verification internals
-- never leave the database.
-- =============================================================================
select t.suite('020 claim codes');

do $$
declare
  v_b    uuid := t.mk_builder();
  v_code text := t.issue_claim_code(v_b);
  v_pro  uuid := t.mk_account('pro');
begin
  -- ── the code is not readable by anyone but the service role ───────────────
  perform t.assert_denied(
    'claim-code-not-readable-pro',
    'claim codes stay private: never exposed to homeowners or to the builder',
    'authenticated', t.authid(v_pro),
    'select claim_code from public.builders',
    'a signed-in builder account can read claim_code off the builders table, so it could claim any listing it likes');

  perform t.assert_denied(
    'claim-code-not-readable-anon',
    'claim codes stay private: never exposed to homeowners or to the builder',
    'anon', null,
    'select claim_code from public.builders',
    'claim_code is readable anonymously');

  -- ── only a builder account may claim ──────────────────────────────────────
  declare
    v_home uuid := t.mk_paid_homeowner();
  begin
    perform t.assert_error(
      'homeowner-cannot-claim',
      'homeowners cannot claim builder listings',
      'authenticated', t.authid(v_home),
      format('select public.claim_my_builder(%L)', v_code),
      'only builder accounts can claim',
      'a homeowner account claimed a builder listing');

    perform t.assert_scalar(
      'homeowner-claim-left-no-trace',
      'homeowners cannot claim builder listings',
      'service_role', null,
      format('select owner_user_id is null as r from public.builders where id = %L', v_b),
      'true',
      'a refused homeowner claim still took ownership of the listing');
  end;

  perform t.assert_denied(
    'anon-cannot-claim',
    'claiming requires a signed-in builder account',
    'anon', null,
    format('select public.claim_my_builder(%L)', v_code),
    'the anonymous role can execute claim_my_builder');

  -- ── the happy path ────────────────────────────────────────────────────────
  perform t.assert_ok(
    'pro-claims',
    'a builder account with a valid code takes over the listing',
    'authenticated', t.authid(v_pro),
    format('select public.claim_my_builder(%L)', v_code),
    'a builder account with a valid code could not claim the listing');

  perform t.assert_scalar(
    'claim-sets-owner',
    'a builder account with a valid code takes over the listing',
    'service_role', null,
    format('select (owner_user_id = %L) as r from public.builders where id = %L', v_pro, v_b),
    'true',
    'the claim did not set owner_user_id');

  perform t.assert_scalar(
    'claim-stamps-claimed-at',
    'every claim path stamps claimed_at (the start of the 90 day free period)',
    'service_role', null,
    format('select claimed_at is not null as r from public.builders where id = %L', v_b),
    'true',
    'a claim left claimed_at null, so the 90 day clock has no start');

  -- ── the code is spent ─────────────────────────────────────────────────────
  perform t.assert_scalar(
    'claim-code-spent',
    'a claim code is one-time: it is null on the row once used',
    'service_role', null,
    format('select claim_code is null as r from public.builders where id = %L', v_b),
    'true',
    'the claim code survived the claim, so the invitation could be replayed');

  -- ── a wrong code and a spent code are indistinguishable ───────────────────
  declare
    v_pro2 uuid := t.mk_account('pro');
    v_never text := 'ZZZZ9999';   -- valid shape, never issued
  begin
    -- Guard the fixture: the "never issued" code must really not exist.
    perform t.assert_count(
      'never-issued-code-absent',
      'the indistinguishability test needs a code that was truly never issued',
      'service_role', null,
      format('select 1 from public.builders where claim_code = %L', v_never),
      0,
      'the fixture code collided with a real claim code');

    perform t.assert_same_error(
      'wrong-and-spent-identical',
      'a wrong code and an already used code return identical text, so the endpoint is not an oracle for which codes exist',
      'authenticated', t.authid(v_pro2),
      format('select public.claim_my_builder(%L)', v_never),   -- never issued
      format('select public.claim_my_builder(%L)', v_code),    -- spent a moment ago
      'the two refusals differ, so an attacker can enumerate valid claim codes');

    -- A malformed code must join them rather than reveal a validation stage.
    perform t.assert_same_error(
      'malformed-and-spent-identical',
      'a wrong code and an already used code return identical text, so the endpoint is not an oracle for which codes exist',
      'authenticated', t.authid(v_pro2),
      'select public.claim_my_builder(''nope'')',
      format('select public.claim_my_builder(%L)', v_code),
      'a malformed code is refused with a different message from a spent one');

    perform t.assert_error(
      'spent-code-message',
      'a wrong code and an already used code return identical text, so the endpoint is not an oracle for which codes exist',
      'authenticated', t.authid(v_pro2),
      format('select public.claim_my_builder(%L)', v_code),
      'invalid or already used claim code',
      'the refusal wording changed; the product promises one sentence for both cases');
  end;

  -- ── one pro, one listing ──────────────────────────────────────────────────
  declare
    v_b2    uuid := t.mk_builder();
    v_code2 text := t.issue_claim_code(v_b2);
  begin
    perform t.assert_error(
      'one-pro-one-listing',
      'one builder account cannot hold two listings',
      'authenticated', t.authid(v_pro),
      format('select public.claim_my_builder(%L)', v_code2),
      'already owns a builder profile',
      'a builder account claimed a second listing');

    perform t.assert_scalar(
      'second-listing-untouched',
      'one builder account cannot hold two listings',
      'service_role', null,
      format('select owner_user_id is null as r from public.builders where id = %L', v_b2),
      'true',
      'the refused second claim still took ownership');

    perform t.assert_scalar(
      'second-code-unspent',
      'a refused claim does not spend the code',
      'service_role', null,
      format('select (claim_code = %L) as r from public.builders where id = %L', v_code2, v_b2),
      'true',
      'a refused claim spent the code, so the real company could never use its invitation');

    -- The database constraint behind the rule, independent of the RPC.
    perform t.assert_denied(
      'owner-unique-constraint',
      'one builder account cannot hold two listings',
      'service_role', null,
      format('update public.builders set owner_user_id = %L where id = %L', v_pro, v_b2),
      'the service role could give one account a second listing; owner_user_id must be unique');
  end;

  -- ── an admin can never issue a code for a listing that is already claimed ─
  perform t.assert_error(
    'no-code-for-claimed-row',
    'a code is never issued for a listing that already has an owner',
    'service_role', null,
    format('update public.builders set claim_code = %L where id = %L', 'ABCD2345', v_b),
    'already claimed',
    'a claim code was issued for an already claimed listing, so an admin could hand out a code that cannot work');

  -- ── verification internals stay private ──────────────────────────────────
  perform t.assert_denied(
    'verified-by-private',
    'verification internals stay private',
    'authenticated', t.authid(v_pro),
    'select verified_by from public.builders',
    'verified_by is readable by a signed-in account');

  perform t.assert_denied(
    'admin-notes-private',
    'verification internals stay private',
    'authenticated', t.authid(v_pro),
    'select admin_notes from public.builders',
    'admin_notes is readable by a signed-in account');

  -- my_builder() is the owner's own row, and it must arrive scrubbed.
  perform t.assert_scalar(
    'my-builder-no-claim-code',
    'claim codes stay private: never exposed to homeowners or to the builder',
    'authenticated', t.authid(v_pro),
    'select claim_code is null as r from public.my_builder()',
    'true',
    'my_builder() returned a claim code to the builder');

  perform t.assert_scalar(
    'my-builder-no-admin-notes',
    'verification internals stay private',
    'authenticated', t.authid(v_pro),
    'select admin_notes is null as r from public.my_builder()',
    'true',
    'my_builder() returned internal admin notes to the builder');

  perform t.assert_scalar(
    'my-builder-no-commercial-terms',
    'verification internals stay private',
    'authenticated', t.authid(v_pro),
    'select commercial_terms is null as r from public.my_builder()',
    'true',
    'my_builder() returned the internal commercial terms text to the builder');

  -- A builder sees only its OWN row through my_builder().
  declare
    v_other uuid := t.mk_claimed_builder();
  begin
    perform t.assert_count(
      'my-builder-own-row-only',
      'a builder account reads only its own listing',
      'authenticated', t.authid(v_pro),
      'select 1 from public.my_builder()',
      1,
      'my_builder() returned more than the caller''s own listing');
  end;
end
$$;
