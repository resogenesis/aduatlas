-- =============================================================================
-- 0024_support_kind_and_forward_truth.sql
--
-- CORRECTNESS AND SECURITY EXCEPTIONS UNDER PHASE_1.md 2t, found at the RC3
-- staging rehearsal. 2t freezes the schema except for an actual correctness or
-- security defect, and each item below is one: a rehearsal journey reproduced it
-- on staging against release candidate RC3, by behaviour, and
-- supabase/tests/invariants/290_support_kind_and_forward_truth.sql fails against
-- the chain without this file. Nothing here adds product scope, a plan, a price
-- or a table.
--
--   S1  R3-01 (SECURITY)  Concierge written support had no server-side
--       entitlement gate. 0003's support_messages_insert_own policy checked only
--       "my own row, written as the homeowner", so ANY signed-in account, an
--       unpaid signup included, could write into the Concierge support queue
--       straight through PostgREST. The only boundary was PaidGate on /support,
--       which a forged localStorage tier copy defeats (journey j7: HTTP 201 for a
--       Golden and for an unpaid account). Concierge is the $500 plan, and
--       written support is half of what it sells (decision 4). The worksheets
--       (0013) and the study submission (0018) already refuse from trusted
--       server state; this was the one paid write that did not.
--
--       Coupled with it: the refund request on /settings is filed as a
--       support_messages row, by ANY paying homeowner, so the same table carries
--       a second, different thing. Gating the table on Concierge alone would
--       have silently broken every Golden and Platinum refund request, and not
--       gating it is the hole above. So the row now says which of the two it is.
--
--       support_messages.kind   'support'         Concierge written support
--                               'refund_request'  a refund request and its replies
--
--       A homeowner may write 'support' only while holding a live Concierge
--       entitlement (the LEVEL; a comped Concierge holds Concierge, as 0023
--       says), and 'refund_request' only while holding a live entitlement that
--       MONEY BOUGHT (the ORIGIN; not a sponsorship, not an admin comp, per
--       0019 and 0023). Level and origin stay two facts (2r): each kind reads
--       the one it is about and nothing else. The homeowner still reads their
--       own messages of both kinds. An admin reply is written by the service
--       role with the kind of the thread it answers.
--
--   S2  R3-06 (CORRECTNESS)  A manual status change recorded a delivery that
--       never happened. 0016's intro_requests_on_forward() stamped forwarded_at
--       on ANY transition to 'sent'. The RC3 admin console offered 'sent'
--       ("Introduction sent") in a free status select that calls
--       builders/intro-update, which sends no mail. With Resend down on staging
--       the admin used that select as the fallback (journeys j3 and j5): the row
--       gained forwarded_at, the console hid the Forward button, the real
--       forward was refused 409 "already forwarded", and the builder had
--       received nothing. forwarded_at is documented as "when a homeowner's
--       introduction actually reached the builder", so a status word was
--       manufacturing that fact. Now ONLY a write that states forwarded_at
--       records it, which is what the real forward path
--       (api/admin/_builders.js introForward) already does:
--           update({ status: "sent", forwarded_at: <now> }).is("forwarded_at", null)
--       0016's rule that 'sent' and forwarded_at never disagree is KEPT, in the
--       honest direction: a status-only move into 'sent' is now REFUSED instead
--       of being given a date nothing earned. So the homeowner's "Introduction
--       sent" (which reads the status) stays true, and the manual status select
--       can no longer claim a delivery or block the real forward.
--       First write wins and never-cleared are kept exactly as 0016 wrote them.
--
-- BASED ON THE CURRENT DEFINITIONS, checked by grep over 0001 through 0023:
--   public.support_messages and its policy support_messages_insert_own: 0003,
--     never altered since.
--   public.intro_requests_on_forward() and its trigger: 0016, never redefined.
--   public.my_qualifying_paid_plan(): 0019 (its comment restated by 0023), and
--     the qualifying_paid_plan(uuid) it calls: 0023. Reused, not redefined.
--   public.has_worksheet_entitlement() (0013) and has_study_entitlement() (0018)
--     are the pattern for the one new helper; neither is changed.
-- Each CREATE OR REPLACE below is the named definition with the change marked
-- "0024", not a rewrite from memory.
--
-- WHAT DOES NOT CHANGE. No view reads support_messages and no RPC writes it, so
-- nothing else has to learn the column in the database. The select policy is
-- untouched, so a homeowner reads their own rows of both kinds, and a refunded
-- or lapsed customer can still read an old thread. No stored intro_requests row
-- is rewritten (see the residue note at S2).
-- =============================================================================


-- =============================================================================
-- S1, PART 1. The column. Not null, default 'support', two values.
--
-- Every row that exists today becomes 'support': adding a NOT NULL column with a
-- constant default fills it on every existing row in the same statement. That
-- is the contract, and it is also the truthful reading of what the table held:
-- until now the table WAS the Concierge support thread, and a refund request
-- filed through it was filed as support. A row whose body happens to carry the
-- /settings refund wording is not reclassified by guesswork (2b).
--
-- The default is 'support' so that a writer which predates this file (the
-- current src/lib/studies.js sendMessage sends no kind) is judged by the
-- STRICTER of the two rules, never the looser one.
-- =============================================================================
alter table public.support_messages
  add column kind text not null default 'support';

alter table public.support_messages
  add constraint support_messages_kind_known
  check (kind in ('support', 'refund_request'));

comment on column public.support_messages.kind is
  'Which conversation this row belongs to (0024). ''support'' = Concierge written support (decision 4); a homeowner may write it only while holding a live Concierge entitlement. ''refund_request'' = a refund request and its replies; a homeowner may write it only while holding a live entitlement that money bought (not a sponsorship, not an admin comp: public.my_qualifying_paid_plan() is not null). An admin reply is written by the service role with the kind of the thread it answers. The homeowner reads their own rows of both kinds.';


-- =============================================================================
-- S1, PART 2. The Concierge level predicate. No arguments, trusted state only.
--
-- NEEDED because no existing function answers "live Concierge": 0013's
-- has_worksheet_entitlement() and 0018's has_study_entitlement() both answer
-- "Platinum OR Concierge", which would hand the $500 written support to every
-- $279 buyer. Written exactly as those two are: auth.uid() from the verified
-- JWT and the billing columns the browser cannot write, no parameter a client
-- could substitute, SECURITY DEFINER with a fixed search_path so a policy can
-- call it without the caller needing any grant on public.users.
--
-- It reads the LEVEL and nothing about the origin, on purpose (2r, 0019's
-- closing note): a comped Concierge holds Concierge and gets the written support
-- an admin granted. 'concierge' is the Concierge plan id (src/lib/plans.js);
-- every unpaid, refunded, Golden, Platinum or unknown-tier state fails CLOSED.
-- =============================================================================
create or replace function public.has_concierge_entitlement()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.users u
     where u.auth_user_id = auth.uid()
       and u.paid_at is not null
       and u.refunded_at is null
       and u.paid_tier = 'concierge'
  );
$$;

revoke all on function public.has_concierge_entitlement() from public, anon;
grant execute on function public.has_concierge_entitlement() to authenticated, service_role;

comment on function public.has_concierge_entitlement() is
  '0024 (R3-01): true only for a live Concierge entitlement on the requesting account, whatever its origin. Reads auth.uid() and the service-role-only billing columns. Takes no arguments so no client value can influence it. The gate on writing Concierge written support (support_messages kind ''support'').';


-- =============================================================================
-- S1, PART 3. The homeowner insert policy (current definition: 0003).
--
-- 0003:   with check (user_id = public.current_app_user_id() and author = 'homeowner')
-- 0024:   the same two conditions, AND one of:
--           kind 'support'         with a live Concierge entitlement (level)
--           kind 'refund_request'  with a live entitlement money bought (origin)
--
-- The refund arm reuses public.my_qualifying_paid_plan() (0019, rules extended
-- by 0023) and adds no rule of its own, so "did this homeowner pay" is answered
-- in ONE place for the credit, the revenue figure and the refund request alike.
-- That function already returns null for: no paid_at, a refund (either shape),
-- a sponsorship recorded in the column OR only in partner_redemptions, and an
-- admin comp. It returns the tier for a recorded purchase and for 0019's rule 5
-- (origin not recorded, no sponsorship evidence), so an ordinary buyer whose row
-- predates the webhook's origin stamp can still ask for their money back.
--
-- ALTER POLICY rather than drop and create: the policy keeps its name, its role
-- and its command, and there is no instant in which the table has no insert
-- policy at all. It stays the ONE insert policy for authenticated; a second
-- permissive policy would be OR-ed with this one and reopen the hole, which the
-- suite asserts.
-- =============================================================================
alter policy support_messages_insert_own on public.support_messages
  with check (
    user_id = public.current_app_user_id()
    and author = 'homeowner'
    and (
      (kind = 'support' and public.has_concierge_entitlement())            -- 0024
      or (kind = 'refund_request' and public.my_qualifying_paid_plan() is not null)   -- 0024
    )
  );


-- =============================================================================
-- S1, PART 4. The column grant. 0003 granted insert (user_id, author, body);
-- the browser now also names the kind it is writing. Nothing else is added:
-- still no UPDATE and no DELETE for anon or authenticated, so a row cannot be
-- moved from one kind to the other after the policy judged it, and the table
-- level SELECT 0003 granted already covers the new column.
-- =============================================================================
grant insert (kind) on public.support_messages to authenticated;


-- =============================================================================
-- S2. The forwarding trigger function (current definition: 0016).
--
-- 0016 had two arms. The first is kept byte for byte: the first delivery date
-- is the record, a second forward does not move it, and nothing clears it.
-- The second arm is REPLACED (0024). 0016: "the transition into 'sent' stamps
-- forwarded_at if the caller did not". That arm is exactly how a manual status
-- change came to claim a delivery. A status is what an admin SAYS about an
-- introduction; forwarded_at is what ADUAtlas DID, and only the path that did
-- it may write it. 0016's reason for the arm stands ("a status that says an
-- introduction was delivered and a null date next to it" is the defect 2i
-- names), so the transition into 'sent' still may not leave a null date; it is
-- now refused rather than filled in. Only the TRANSITION is judged, as in 0016:
-- a row already 'sent', or one whose forward is already recorded, is not
-- touched by this rule, and neither is any other status change.
--
-- What the real forward must send, which api/admin/_builders.js introForward
-- already sends after the mail has left: status 'sent' AND forwarded_at in the
-- same update, filtered on forwarded_at is null. Nothing in that route needs to
-- change for this file. What must NOT write forwarded_at is intro-update, the
-- manual status route; it patches only status and admin_note, and after this
-- file a manual 'sent' through it is refused by the database with the message
-- below (the console should refuse it first, in plain words).
--
-- The trigger itself (before update of status, forwarded_at, 0016) is left as
-- it is: it already fires on exactly the two columns this function judges, so
-- re-creating it would change nothing.
--
-- RESIDUE, recorded and not guessed at (2b). A row stamped by the old arm before
-- this file carries a forwarded_at that reads like a real forward, and no table
-- records a sent mail. The only hint is precision: the forward path sends a
-- JavaScript timestamp (milliseconds), the old arm wrote now() (microseconds).
-- That is evidence for an operator to weigh, not a rule a migration should
-- apply to every environment, so this file rewrites no stored row. Staging holds
-- three such rows from the RC3 rehearsal (journeys j3 and j5 among them), and
-- staging never had Resend configured, so no real forward ever succeeded there.
-- Correcting them is an operator decision, not a migration.
-- =============================================================================
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
  -- 0024: a status change alone never records a delivery; only a write that
  -- states forwarded_at does (the real forward path). A move INTO 'sent' that
  -- would leave no delivery date is refused instead of being given one.
  if new.status = 'sent'
     and old.status is distinct from 'sent'
     and new.forwarded_at is null then
    raise exception 'an introduction reads sent only when ADUAtlas forwarded it: the forward records forwarded_at in the same write, and a status change alone cannot'
      using errcode = '23514',
            hint = 'Use Forward to builder, which records the delivery; a status chosen by hand is requested or declined.';
  end if;
  return new;
end;
$$;

comment on function public.intro_requests_on_forward() is
  'Keeps intro_requests.forwarded_at as the FIRST delivery date: never overwritten, never cleared. Since 0024 (R3-06) it never stamps forwarded_at itself: a manual status change is something an admin said, not proof the introduction reached the builder, so only the real forward path (which writes status ''sent'' and forwarded_at together, after the mail left) records a delivery. A transition into ''sent'' that would leave forwarded_at null is refused (23514), so ''sent'' and the delivery date still never disagree.';

revoke execute on function public.intro_requests_on_forward() from public, anon, authenticated;

comment on column public.intro_requests.forwarded_at is
  'When ADUAtlas actually forwarded the homeowner''s introduction to the builder. Null means not forwarded by ADUAtlas yet. Written ONLY by the real forward path (api/admin/_builders.js intro-forward, service role, together with status ''sent'' and only after the mail left). Since 0024 a status change never stamps it, and a move into ''sent'' without it is refused, so status ''sent'' always means ADUAtlas forwarded the introduction. First write wins and it can never be cleared. The homeowner whose introduction it is may read it (intro_requests_select_own); no other homeowner and no builder account can. The forwarded message carries the homeowner''s words and never their email address or name (decision 8).';


-- =============================================================================
-- Notes for whoever is next.
--   * Anything that asks "may this homeowner write Concierge support" reads
--     has_concierge_entitlement(); anything that asks "did money buy this"
--     reads my_qualifying_paid_plan() / qualifying_paid_plan(). Do not rebuild
--     either from the columns.
--   * The browser must now send kind 'refund_request' when it files a refund
--     request (src/lib/studies.js, src/pages/app/Settings.jsx). A writer that
--     sends no kind is judged as 'support', so an old client's refund request
--     from a non-Concierge buyer is REFUSED, and /settings already tells the
--     customer to email within the window when filing fails.
--   * The admin API (api/admin/_studies.js) must read kind, keep the two kinds
--     as separate threads, and write each reply with the kind of the thread it
--     answers. The service role bypasses the policy, so the database cannot
--     choose the kind for it.
--   * The homeowner builder profile reads intro_requests.status. After this
--     file 'sent' can only be written together with forwarded_at, so that copy
--     is true for every NEW row. Rows stamped by 0016's removed arm before this
--     file still read 'sent' (see the residue note at S2).
-- =============================================================================
