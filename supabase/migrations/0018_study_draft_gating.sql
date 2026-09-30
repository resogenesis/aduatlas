-- =============================================================================
-- 0018 — Feasibility intake is free to SAVE as a draft; only Platinum and
--        Concierge may SUBMIT it. Decision 2q (D1). Applied after 0017.
--
-- THE HOLE THIS FILE CLOSES.
--   0003_studies.sql granted
--       grant insert (user_id, intake, homeowner_note) on public.studies
--         to authenticated;
--   and studies_insert_own asked for two things only: the caller's own user_id
--   and status = 'submitted'. There was NO tier condition anywhere on the
--   table, and api/admin/_studies.js selected every studies row with no tier
--   filter. So a FREE signup or a GOLDEN buyer could fill in the property
--   intake, land in the fulfilment queue as an order, and be shown to the
--   person producing a $279 Platinum deliverable they never bought. 0013's
--   closing notes reported that hole and deliberately did not guess at the
--   product rule; 2q is the decision, and this file is the boundary.
--
-- WHAT 2q DECIDES, AND WHAT IT DOES NOT.
--   A homeowner at ANY tier, including free and Golden, may begin and SAVE
--   intake as a DRAFT. Nothing about drafting is gated, because a half-filled
--   intake is the natural on-ramp to an upgrade. What is gated is the
--   TRANSITION from draft to submitted: only a live Platinum or Concierge
--   entitlement may make a study actionable and put it into Amy's fulfilment
--   workflow.
--
--   So the gate is NOT on the insert. Gating the insert would block drafting,
--   which 2q explicitly permits, and would recreate the same wall one step
--   earlier. studies_insert_own now pins a new row to 'draft' and asks nothing
--   else; studies_update_own carries the entitlement condition on the result
--   'submitted'.
--
-- THE AUTHORITY. public.has_study_entitlement() mirrors
--   public.has_worksheet_entitlement() from 0013: SECURITY DEFINER, stable, and
--   it reads ONLY trusted server state — auth.uid() out of the
--   platform-verified JWT, plus users.paid_at, users.paid_tier and
--   users.refunded_at, which 0001 leaves out of every column UPDATE grant and
--   which the Stripe webhook alone writes with the service role. It takes NO
--   ARGUMENTS, for the same reason 0013's does: there is no parameter for a
--   caller to substitute, no header, no payload and no local value that can
--   change the answer. Unpaid, refunded and unknown-tier states all fail
--   CLOSED. A sponsored Golden entitlement (2p) is 'roadmap' and is therefore
--   excluded by the same predicate with no extra rule to maintain.
--
--   It is a SEPARATE function from has_worksheet_entitlement() rather than an
--   alias of it. The two answer the same question today because 2 sells the
--   worksheets and the feasibility study to the same two packages, but they are
--   two different entitlements in the offer table and a later decision may move
--   one without the other. The suite pins both by tier so a divergence has to
--   be deliberate.
--
-- THE ONE-STUDY MODEL IS PRESERVED, and it is the trap in this work.
--   public.studies.user_id is UNIQUE. A Golden homeowner who saves a draft has
--   already occupied their only study row, so an upgrade must TRANSITION that
--   existing row. Anything that tries to create a second study on the way to
--   'submitted' fails on the unique violation and the upgrade path dies. The
--   transition is therefore the only route into 'submitted' for everybody,
--   whatever they bought and whenever they bought it, and
--   150_fulfilment_lifecycle.sql walks that whole path as a named test rather
--   than assuming it.
--
-- DATES: a draft was never submitted, so it carries no submission time (2b).
--   0003 declared submitted_at NOT NULL DEFAULT now(), which on a draft would
--   have been a column default standing in as a claim about an event that never
--   happened — and the fulfilment queue orders by exactly that column. The
--   column becomes nullable with no default, and the trigger below owns it: a
--   draft's submitted_at is forced to NULL, and any row that is not a draft is
--   stamped if it has no stamp yet. So "submitted_at is null" and "status =
--   'draft'" are the same fact for every row, for every writer, service role
--   included, and the suite asserts that as a whole-table invariant.
--
-- A SUBMITTED STUDY NEVER GOES BACK TO BEING A DRAFT. RLS WITH CHECK cannot
--   see OLD, so without the trigger below a customer could set their own
--   submitted order back to 'draft' and quietly remove a bought order from the
--   fulfilment queue. That is refused, not silently pinned, because no
--   legitimate flow does it and a silent pin would tell the caller it worked.
--
-- WHAT THIS FILE DOES NOT DO.
--   • It does not change what any package is sold, rename a tier id, touch
--     pricing, or add product scope.
--   • It does not gate SELECT. A draft must be readable by its owner at any
--     tier, and a customer who is downgraded or refunded AFTER submitting must
--     keep seeing the order they already bought: 0003's studies_select_own is
--     left exactly as it was.
--   • It does not revoke submitted_at from the homeowner's column UPDATE grant.
--     The trigger makes the client's value unnecessary, but a DEPLOYED frontend
--     can be older than the deployed database (decision 2j lane C, which is on
--     the books because exactly that happened), and the stale bundle sends
--     submitted_at in its resubmit. Revoking the column would turn that into
--     "permission denied for column submitted_at" and fail a paying customer's
--     resubmission, which is the same trap 0013 PART 5 avoided by stripping
--     rather than raising.
--   • It adds no lifecycle stage. 'draft' is the CUSTOMER's state before an
--     order exists, not an operator step, so it is deliberately absent from the
--     LIFECYCLE map in api/admin/_studies.js and from Amy's status control.
--
-- DEPLOYMENT ORDER, worth stating because this migration and the frontend are
--   one change. A bundle that predates this file inserts a study with no status
--   and therefore creates a DRAFT, where before it created a submitted order.
--   An entitled customer on the stale bundle has to press the (re)submit action
--   once more for the order to enter the queue. Nothing is lost, but the
--   frontend should ship with this migration rather than after it.
-- =============================================================================


-- =============================================================================
-- PART 1 — the entitlement predicate: trusted server state, no arguments.
-- =============================================================================

-- Live, un-refunded Platinum or Concierge, for the caller of this request and
-- nobody else. 'report' is Platinum and 'concierge' is Concierge; the ids
-- predate the plan names (src/lib/plans.js) and are NOT renamed here. 'roadmap'
-- (Golden, whether bought or sponsored) is absent on purpose, and so is every
-- unpaid, refunded or unknown-tier state.
create or replace function public.has_study_entitlement()
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
       and u.paid_tier in ('report', 'concierge')
  );
$$;

revoke all on function public.has_study_entitlement() from public, anon;
grant execute on function public.has_study_entitlement() to authenticated, service_role;

comment on function public.has_study_entitlement() is
  'Decision 2q: true only for a live Platinum or Concierge entitlement on the requesting account. Reads auth.uid() and the service-role-only billing columns. Takes no arguments so no client value can influence it. Mirrors has_worksheet_entitlement() (0013) and is kept separate from it because the worksheets and the feasibility study are two entitlements in the offer table.';


-- =============================================================================
-- PART 2 — 'draft' becomes a real status, and the status a new row starts in.
-- =============================================================================

-- 0003 declared the check inline and 0011 replaced it; both were found by
-- inspection rather than by name, in case a hand edit renamed one. Any check
-- constraint on public.studies that mentions the status vocabulary is the one
-- being replaced.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'studies'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%needs_info%'
  loop
    execute format('alter table public.studies drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.studies
  add constraint studies_status_check
  check (status in ('draft', 'submitted', 'in_review', 'needs_info',
                    'work_started', 'deliverables_ready', 'ready'));

-- A study begins as a draft. The homeowner's INSERT grant does not include the
-- status column (0003), so this default is what every client insert gets and
-- studies_insert_own below pins it: the only route into 'submitted' is the
-- gated transition, for every tier.
alter table public.studies alter column status set default 'draft';

-- A draft was never submitted (2b). See the header: the trigger in PART 3 owns
-- this column from here, and no row that is not a draft is left without a stamp.
alter table public.studies alter column submitted_at drop not null;
alter table public.studies alter column submitted_at drop default;

comment on column public.studies.status is
  'Fulfilment lifecycle (decisions 2i and 2q). draft = the customer''s saved intake, free at any tier and NOT an order; submitted = Intake Complete; in_review = Ready for Review; work_started = Work Started; deliverables_ready = Deliverables Ready; ready = Delivered. needs_info is the off-ramp. "Paid" is derived from users (no row yet), never stored here. Only a live Platinum or Concierge entitlement may move a row from draft to submitted.';
comment on column public.studies.submitted_at is
  'When the customer submitted the intake, i.e. when the draft became an order. NULL for exactly as long as the row is a draft, because a default must never stand in as a claim that an event happened (2b). Stamped by studies_enforce_draft_rules() on the way out of draft.';


-- =============================================================================
-- PART 3 — the two things RLS cannot say, because WITH CHECK cannot see OLD.
--
--   1. A submitted study never returns to being a draft. Refused outright: no
--      legitimate flow does it, and silently pinning the status would tell the
--      caller their order was withdrawn when it was not.
--   2. submitted_at is exactly "the row is not a draft". Enforced for EVERY
--      writer, the service role and a hand-run statement included, so the
--      column the fulfilment queue orders by cannot drift from the status it is
--      supposed to belong to.
-- =============================================================================
create or replace function public.studies_enforce_draft_rules()
returns trigger
language plpgsql
as $$
begin
  -- OLD is only assigned under UPDATE.
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and new.status = 'draft' then
      raise exception
        'a submitted study cannot be returned to draft (study %, status %)', old.id, old.status
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'draft' then
    new.submitted_at := null;
  elsif new.submitted_at is null then
    new.submitted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists studies_enforce_draft_rules on public.studies;
create trigger studies_enforce_draft_rules
  before insert or update on public.studies
  for each row execute function public.studies_enforce_draft_rules();

comment on function public.studies_enforce_draft_rules() is
  'Decision 2q: a draft carries no submitted_at and a submitted study never goes back to being a draft. Both are things an RLS WITH CHECK cannot express, because it cannot see the row''s previous status.';


-- =============================================================================
-- PART 4 — row level security. The INSERT is open to every tier and pinned to
--          'draft'; the entitlement condition sits on the result 'submitted'.
--
-- The WITH CHECK asks about the ROW THE STATEMENT LEAVES BEHIND, which is the
-- only thing RLS can see. That covers the transition 2q gates, and it also
-- means a customer whose entitlement has since lapsed cannot re-submit or keep
-- editing a submitted intake. That is deliberate: the order itself stays
-- visible and stays in the fulfilment workflow (the work was already bought),
-- but writing to it again asks for an entitlement the account no longer holds.
--
-- The three operator states, and needs_info, remain unwritable by the customer:
-- they appear in neither branch of the WITH CHECK. 'draft' is the only value
-- added to the USING clause, so the customer can edit their draft before it is
-- an order exactly as they can edit their intake before review.
-- =============================================================================

drop policy if exists studies_insert_own on public.studies;
create policy studies_insert_own on public.studies
  for insert to authenticated
  with check (
    user_id = public.current_app_user_id()
    and status = 'draft'
  );

drop policy if exists studies_update_own on public.studies;
create policy studies_update_own on public.studies
  for update to authenticated
  using (
    user_id = public.current_app_user_id()
    and status in ('draft', 'submitted', 'needs_info')
  )
  with check (
    user_id = public.current_app_user_id()
    and (
      status = 'draft'
      or (status = 'submitted' and public.has_study_entitlement())
    )
  );

-- 0003's column grants are unchanged and are restated here so the boundary can
-- be read in one place: the client may write the intake side and the status, and
-- may never write an admin note, a deliverable path, consult minutes, the
-- consult link, ready_at or work_started_at.
--   grant insert (user_id, intake, homeowner_note)
--   grant update (intake, homeowner_note, status, submitted_at)


-- =============================================================================
-- Notes for whoever is next.
--   • Amy's queue: api/admin/_studies.js excludes 'draft' from BOTH reads — the
--     studies query and the awaiting-intake query that synthesises the derived
--     "Paid" rows — so an unfinished draft is never presented as an order. The
--     database boundary above is what makes that filter a tidy-up rather than
--     the guarantee: a free or Golden account cannot reach 'submitted' at all.
--   • 'draft' is not in the LIFECYCLE map in that file and not in Amy's status
--     control, so the console cannot push an order back to draft either.
--   • The /study route is still gated in the router (requireTier="report",
--     src/router/router.jsx). 2q says a homeowner at ANY tier may save a draft,
--     so that router gate now contradicts the decision it used to implement.
--     It is not this file's to change and it is reported rather than guessed at:
--     the database boundary is the part 2q puts in the database, and the router
--     is the part that decides who is shown the form.
-- =============================================================================
