-- =============================================================================
-- 0016 — Builder outreach: the invitation, and the introduction that arrives
--
-- Phase 1 spec, section 5.2: "The acquisition funnel is therefore: ADUAtlas
-- creates the basic listing, THE BUILDER RECEIVES AN INVITATION, the builder
-- claims the profile, ADUAtlas verifies it, the ninety day membership starts,
-- tracking is activated..." — and decision 8: "The homeowner initiates every
-- conversation."
--
-- THE TWO GAPS THIS CLOSES, both found by a blind-spot audit of the seeded
-- Arizona directory and both about the same thing: a record existed and nothing
-- ever left the building.
--
--   1. NOTHING COULD INVITE A BUILDER TO CLAIM ITS LISTING. 0007 built the whole
--      claim, verify, track and $500 lifecycle, and the issue-claim-code route
--      returned the code in one HTTP response and nowhere else. api/send-email.js
--      held five templates and its AUTH map refused any template not listed, and
--      no builder code path called it at all. ADUAtlas could seed 86 Arizona
--      companies and had no way to tell a single one of them. The funnel had no
--      entry point, so the only state a listing could ever reach was the state it
--      was seeded in.
--
--   2. A HOMEOWNER INTRODUCTION REACHED NOBODY. requestIntro() inserted an
--      intro_requests row and logged a builder_contacted event, and that was the
--      entire effect. The admin Introductions tab printed the builder's contact
--      details as text with no forward action, so a homeowner who asked for an
--      introduction saw "Introduction requested" for ever, and the company on the
--      other side never learned that somebody wanted to talk to them.
--
-- WHAT THIS FILE ADDS. Two timestamps, one on each side of that funnel, and
-- nothing else:
--
--   builders.invited_at              when ADUAtlas asked this company to claim
--                                    its listing
--   intro_requests.forwarded_at      when a homeowner's introduction actually
--                                    reached the builder
--
-- Both are timestamptz, nullable, default null, because null is the honest
-- starting state under decision 2b: not invited yet, not forwarded yet. Neither
-- is derivable from anything already stored. `claimed_at` says a builder took the
-- listing over and says nothing about whether anyone ever asked; status 'sent' on
-- an introduction is a word with no date behind it, and a date is what makes
-- outreach trackable and a promise to a homeowner checkable.
--
-- WHY A TIMESTAMP AND NOT A BOOLEAN. An invitation that cannot be dated cannot be
-- audited: "did we already contact this company, and when" is the question an
-- outreach list is for, and a boolean answers only the first half. Same on the
-- other side: 2h makes the ADUAtlas thread the system of record and email only a
-- notification, so the record has to be able to say WHEN the notification went.
--
-- ── WHAT NEITHER COLUMN IS ────────────────────────────────────────────────────
--
-- NEITHER COLUMN IS A PUBLIC FACT, AND invited_at IS NOT PARTICIPATION (2a).
-- "An unclaimed public profile must carry no implication that the company has
-- partnered with, endorsed or joined ADUAtlas." Being invited is something
-- ADUAtlas did, not something the company agreed to, and a company that ignored
-- an email is in exactly the state it was in before the email. So invited_at goes
-- nowhere near a public surface: not builders_public_profile, not the
-- get_public_builder accessor behind it (0015), not get_featured_builders, not the
-- paid directory builders_public. This file creates no view, replaces no view and
-- grants nothing, which is precisely how it stays out of all four: adding a column
-- to a table does not change a view that names its columns, and anon and
-- authenticated hold no privilege on public.builders to inherit (0006 revoked the
-- table grant; homeowners read the views).
--
-- NEITHER COLUMN IS WRITABLE BY A CLIENT. Only the service role — the admin API,
-- which authenticates the caller as an admin the way api/_admin.js already does —
-- may stamp either one. A builder that could set its own invited_at could forge a
-- relationship ADUAtlas never started; a homeowner or a builder that could set
-- forwarded_at could claim an introduction was delivered when nothing was sent.
-- Both are closed by the grants that already exist rather than by new policy:
-- public.builders has no insert or update grant for anon or authenticated at all,
-- and public.intro_requests grants authenticated SELECT plus INSERT on exactly
-- (user_id, builder_id, message) and no UPDATE whatsoever, so a column added to
-- either table is unreachable from a client the day it is created. 220_builder_
-- outreach.sql proves that rather than assuming it.
--
-- forwarded_at IS READABLE BY THE HOMEOWNER WHOSE INTRODUCTION IT IS, and that is
-- deliberate: intro_requests grants authenticated a table-level SELECT and the
-- intro_requests_select_own policy limits it to that homeowner's own rows. Their
-- own introduction, their own date. It is the fact that lets the portal stop
-- saying "Introduction requested" for ever. It reaches no other homeowner, and no
-- builder: the same policy keys on user_id, so a builder account cannot read the
-- introductions addressed to its own listing (decision 8 and 2h — the ADUAtlas
-- thread is the system of record and a builder never browses homeowners).
--
-- NEITHER COLUMN CARRIES CONTACT DETAILS. Decision 8 says contact details reach a
-- builder only if the homeowner volunteers them, so the introduction that gets
-- forwarded carries the homeowner's MESSAGE and never their email address or
-- name. That is a property of the row as well as of the email: intro_requests
-- holds user_id, builder_id, message, status, admin_note and dates, and no
-- homeowner email, name or phone column. This file adds none.
--
-- ── THE TWO GUARDS ────────────────────────────────────────────────────────────
--
-- FIRST WRITE WINS ON BOTH COLUMNS. Each records the first time something
-- happened, and overwriting it destroys the fact rather than updating it. A
-- re-sent invitation is still allowed (a bounce, a second address, a follow-up):
-- it simply does not move the date ADUAtlas first asked, so the outreach record
-- cannot be reset by accident and nobody is invited twice believing it is the
-- first time. The same on the other side: forwarding an introduction a second
-- time does not double-stamp it and does not lose the first delivery date, and
-- forwarded_at can never be cleared back to null. This is the same doctrine 0005
-- and 0007 apply to referral attribution ("first touch wins"), for the same
-- reason: a first-contact date that a later caller can overwrite is not a record.
--
-- 'sent' AND forwarded_at CAN NEVER DISAGREE. intro_requests.status has allowed
-- 'sent' since 0004 and nothing ever set it. Forwarding is now what 'sent' means,
-- so the transition into 'sent' stamps forwarded_at if the caller did not, at the
-- one choke point every write passes through. A status that says an introduction
-- was delivered and a null date next to it would be the same class of defect as
-- the legal copy in 2i that promised an event the product could not prove.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   • No new table, view, policy, grant, RPC, index, referral code or money.
--   • No product scope. It does not write email copy (that is api/send-email.js
--     and the wording rules in 5.2: "increase your visibility to homeowners",
--     never "we will generate traffic", and no promise of leads or sales), and it
--     does not build a portal reply for the builder, because 2h has no interface
--     for one yet and the forwarded mail must not promise one.
--   • It does not activate anything. Inviting a company does not claim its
--     listing, does not verify it, does not switch tracking on and does not put a
--     badge anywhere: builder_tracking_active stays owner plus approved (0007),
--     and `claimed` and `verified` stay exactly what 0009 and 0010 defined.
--   • It does not delete or expire an uninvited or unclaimed listing. 5.2 raised
--     deleting listings unclaimed after thirty days and walked it straight back,
--     "because ADUAtlas needs the directory regardless".
-- =============================================================================

-- ── builders.invited_at ─────────────────────────────────────────────────────
alter table public.builders
  add column invited_at timestamptz;

comment on column public.builders.invited_at is
  'When ADUAtlas asked this company to claim its listing (section 5.2: the builder receives an invitation). Null means nobody has been contacted yet, so outreach is trackable and a company is not invited twice by accident. Service role only, and NOT participation: an invitation is something ADUAtlas did, never something the company agreed to, so it never appears on a public profile, in the paid directory or in the featured teaser (decision 2a), and it activates nothing — no claim, no verification, no tracking, no badge.';

-- ── intro_requests.forwarded_at ─────────────────────────────────────────────
alter table public.intro_requests
  add column forwarded_at timestamptz;

comment on column public.intro_requests.forwarded_at is
  'When a homeowner''s introduction actually reached the builder. Null means the introduction is recorded and not yet delivered, which is the state the homeowner portal must be able to tell apart from delivered. Set only by the service role, alongside status ''sent''. The homeowner whose introduction it is may read it (their own row, through intro_requests_select_own); no other homeowner and no builder account can. The forwarded message carries the homeowner''s words and never their email address or name (decision 8), and the ADUAtlas thread stays the system of record — email only notifies (2h).';

-- ── first write wins: invited_at is a first-contact fact ────────────────────
-- Preserve rather than refuse. A second invitation is a legitimate thing to send;
-- silently resetting the date ADUAtlas first asked is not, and a caller that
-- writes `set invited_at = now()` without checking is the normal case, not the
-- exceptional one. Written here so every future caller inherits it instead of
-- each one having to remember.
create or replace function public.builders_keep_first_invited_at()
returns trigger
language plpgsql
as $$
begin
  if old.invited_at is not null then
    new.invited_at := old.invited_at;
  end if;
  return new;
end;
$$;

comment on function public.builders_keep_first_invited_at() is
  'First write wins on builders.invited_at: once ADUAtlas has recorded asking a company to claim its listing, that date cannot be moved or cleared. A re-sent invitation is allowed and simply does not change it.';

-- A trigger function is invoked by the trigger, never called directly.
revoke execute on function public.builders_keep_first_invited_at() from public, anon, authenticated;

create trigger builders_keep_first_invited_at
  before update of invited_at on public.builders
  for each row execute function public.builders_keep_first_invited_at();

-- ── forwarding: stamped once, and never out of step with 'sent' ─────────────
create or replace function public.intro_requests_on_forward()
returns trigger
language plpgsql
as $$
begin
  -- The first delivery date is the record. A second forward does not double-stamp
  -- it, and nothing clears it back to null.
  if old.forwarded_at is not null then
    new.forwarded_at := old.forwarded_at;
  end if;
  -- Forwarding is what 'sent' means. The transition into it carries a date even
  -- when the caller supplied none, so the two can never disagree. Only the
  -- TRANSITION stamps: a row that was already 'sent' and being updated for some
  -- other reason is not re-dated as though it were delivered today.
  if new.status = 'sent'
     and old.status is distinct from 'sent'
     and new.forwarded_at is null then
    new.forwarded_at := now();
  end if;
  return new;
end;
$$;

comment on function public.intro_requests_on_forward() is
  'The one choke point every intro_requests write passes through. Keeps forwarded_at as the FIRST delivery date (never overwritten, never cleared) and stamps it when status transitions to ''sent'', so a status claiming an introduction was delivered can never sit next to a null date.';

revoke execute on function public.intro_requests_on_forward() from public, anon, authenticated;

create trigger intro_requests_on_forward
  before update of status, forwarded_at on public.intro_requests
  for each row execute function public.intro_requests_on_forward();

-- =============================================================================
-- What the durable suite (decision 2g) asserts about this file
-- — supabase/tests/invariants/220_builder_outreach.sql
--
--   1. Both columns exist, are timestamptz, and default null on a freshly
--      seeded listing and a freshly requested introduction.
--   2. The service role CAN stamp each one. This is the positive control, and it
--      comes first in every group: a refusal and a crashed query look identical,
--      and a column nobody can write would make every denial below pass while the
--      feature did not exist.
--   3. Neither column is writable by a builder account (including the account
--      that owns the listing), by a homeowner (including the homeowner whose
--      introduction it is), or by anon — not by UPDATE and not by INSERT.
--   4. Neither column appears on any relation anon can read, and neither is in
--      get_public_builder's return signature or get_featured_builders'.
--   5. An invited but unclaimed listing still reads claimed = false and
--      verified = false on the public profile, its payload carries no invitation
--      fact, and tracking is still off (2a, 2c, 2e).
--   6. First write wins on both sides: a second invitation does not move the date
--      ADUAtlas first asked, and forwarding moves status to 'sent' and stamps
--      forwarded_at while a second forward neither double-stamps nor loses the
--      first timestamp. forwarded_at cannot be cleared, a status of 'sent' always
--      carries a date, and 'sent' is the whole vocabulary — no new status was
--      invented for forwarding.
--   6a. Each of those guards was mutation-tested: dropping either trigger, or
--      granting a client role a real write path to invited_at, or adding the
--      column to builders_public_profile, each turns the matching assertion red.
--      An untested guard is a comment.
--   7. The homeowner's message survives forwarding, and intro_requests carries no
--      homeowner email, name or phone column for the forward to leak.
--   8. The intro row still belongs to exactly ONE homeowner and ONE builder:
--      both keys not null, both foreign keys intact, the pair still unique, and
--      forwarding moves neither of them.
-- =============================================================================
