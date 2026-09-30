-- =============================================================================
-- 0013 — Worksheet and Ready Score entitlement: a real authorization boundary.
--        Decision 2n. Applied after 0012.
--
-- THE HOLE THIS FILE CLOSES.
--   0001_init.sql granted
--       grant update (completed_chapters, builder_packet, knowledge_result)
--         on public.users to authenticated;
--   with NO tier condition, and the worksheets, the ADU Ready Score and the lot
--   geometry all lived INSIDE users.builder_packet. So any signed-in account —
--   a Golden buyer, a refunded buyer, a free signup — could read and write the
--   whole Platinum worksheet set straight through PostgREST. PaidGate and the
--   browser were the entire boundary, which is not a boundary. Decision 2n
--   calls that a Phase 1 launch blocker and it was the durable suite's single
--   remaining skip.
--
-- WHAT users.builder_packet HELD, AND WHERE EACH PART NOW LIVES.
--   PROJECT BRIEF — the twelve PACKET_FIELDS (zip, lotSize, budget, purpose,
--     timeline, address, aduType, desiredSqft, stories, siteAccess,
--     utilityNotes, hoaNotes) plus turnkey. STAYS in users.builder_packet,
--     writable by the signed-in owner exactly as before. It is the twelve
--     questions every builder asks and it is not the Platinum deliverable.
--   WORKSHEETS — builder_packet.worksheets{}: the seven preparation worksheets
--     AND the ADU Ready Score, which is the key 'readyScore' INSIDE that same
--     map (src/pages/tools/ReadyScore.jsx calls saveWorksheet("readyScore", …)).
--     MOVES to public.homeowner_worksheets. Platinum and Concierge only.
--   LOT — builder_packet.lot: the lot geometry behind the buildable envelope
--     and the Property Report. Neither a worksheet nor a brief field, and the
--     part a naive split leaves behind in the ungated column. MOVES to
--     public.homeowner_worksheets.lot. Platinum and Concierge only.
--   COURSE PROGRESS and QUIZ RESULTS — the separate columns
--     users.completed_chapters and users.knowledge_result. UNTOUCHED. They are
--     course entitlement, a Golden buyer owns them, and this file must not cost
--     them their progress: RLS is per-row, not per-column, so simply demanding
--     Platinum on the users UPDATE policy would have blocked a Golden learner
--     from saving a finished chapter. That is why the Platinum data moves to its
--     own table instead.
--
-- NO CONCIERGE-SPECIFIC DATA SITS IN THIS STRUCTURE, verified rather than
--   assumed: Concierge is 60 minutes of consultation plus written support
--   (decision 4), and both live elsewhere — studies.consult_minutes_used and
--   studies.consult_link on the studies table (0003), and public.support_messages
--   for the written thread. Nothing Concierge-only was ever a builder_packet
--   key, so nothing here inherits a Concierge entitlement it should own
--   separately. public.homeowner_worksheets holds exactly two payload columns
--   and the durable suite pins that shape, so a later migration cannot quietly
--   park Concierge data behind the Platinum predicate.
--
-- THE AUTHORITY. public.has_worksheet_entitlement() reads ONLY trusted server
--   state: auth.uid() from the platform-verified JWT, and the billing columns
--   paid_at, paid_tier and refunded_at, which 0001 leaves out of the column
--   UPDATE grant and which the Stripe webhook alone writes with the service
--   role. It takes NO arguments, deliberately: there is no parameter for a
--   client to substitute, no header, no payload and no local value that can
--   change the answer. A sponsored Golden entitlement (2p) is 'roadmap' and is
--   therefore excluded by the same predicate, with no extra rule to maintain.
--
-- WHAT THIS FILE IS NOT. It does not change what any tier is sold, does not
--   rename a tier id, does not touch pricing, and adds no product scope. It
--   moves data that was already Platinum-and-Concierge-only behind a database
--   boundary and leaves every other entitlement exactly where it was.
-- =============================================================================


-- =============================================================================
-- PART 1 — the entitlement predicate: trusted server state, no arguments.
-- =============================================================================

-- Live, un-refunded Platinum or Concierge, for the caller of this request and
-- nobody else. 'report' is Platinum and 'concierge' is Concierge; the ids
-- predate the plan names (src/lib/plans.js) and are NOT renamed here. 'roadmap'
-- (Golden) is absent on purpose, and so is every unpaid, refunded or
-- unknown-tier state, which therefore fails CLOSED.
create or replace function public.has_worksheet_entitlement()
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

revoke all on function public.has_worksheet_entitlement() from public, anon;
grant execute on function public.has_worksheet_entitlement() to authenticated, service_role;

comment on function public.has_worksheet_entitlement() is
  'Decision 2n: true only for a live Platinum or Concierge entitlement on the requesting account. Reads auth.uid() and the service-role-only billing columns. Takes no arguments so no client value can influence it.';


-- =============================================================================
-- PART 2 — the table. One row per homeowner, holding the Platinum-and-Concierge
--          part of the packet.
--
-- lot lives here beside worksheets because it carries the SAME entitlement,
-- not because it is a worksheet. Two payload columns, no more: the suite
-- asserts the column list so nothing else is parked behind this predicate.
-- =============================================================================
create table public.homeowner_worksheets (
  user_id    uuid primary key references public.users (id) on delete cascade,
  worksheets jsonb not null default '{}'::jsonb,   -- the seven worksheets + 'readyScore'
  lot        jsonb,                                -- feasibility lot geometry + parcel snapshot
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homeowner_worksheets_worksheets_is_object
    check (jsonb_typeof(worksheets) = 'object'),
  constraint homeowner_worksheets_lot_is_object
    check (lot is null or jsonb_typeof(lot) = 'object')
);

create trigger homeowner_worksheets_set_updated_at
  before update on public.homeowner_worksheets
  for each row execute function public.set_updated_at();

comment on table public.homeowner_worksheets is
  'Decision 2n: the Platinum and Concierge part of the homeowner packet — the seven preparation worksheets, the ADU Ready Score (the readyScore key inside worksheets) and the lot geometry. Separated out of users.builder_packet because RLS is per-row and the brief, the course progress and the quiz results belong to tiers that must keep working.';


-- =============================================================================
-- PART 3 — row level security. Own row AND live entitlement, both, on every
--          verb. There is no DELETE policy and no DELETE grant: an entitlement
--          that lapses must lose ACCESS without destroying the customer's work.
-- =============================================================================
alter table public.homeowner_worksheets enable row level security;

revoke all on public.homeowner_worksheets from anon, authenticated;
grant select, insert, update on public.homeowner_worksheets to authenticated;

create policy homeowner_worksheets_select_own on public.homeowner_worksheets
  for select to authenticated
  using (user_id = public.current_app_user_id() and public.has_worksheet_entitlement());

create policy homeowner_worksheets_insert_own on public.homeowner_worksheets
  for insert to authenticated
  with check (user_id = public.current_app_user_id() and public.has_worksheet_entitlement());

create policy homeowner_worksheets_update_own on public.homeowner_worksheets
  for update to authenticated
  using (user_id = public.current_app_user_id() and public.has_worksheet_entitlement())
  with check (user_id = public.current_app_user_id() and public.has_worksheet_entitlement());


-- =============================================================================
-- PART 4 — the write path.
--
-- SECURITY INVOKER, which is the default and is the entire point: the caller's
-- own grants and the policies above decide the outcome, so this function is
-- ergonomics (the browser never has to know its public.users id) and never a
-- way round the boundary. If anybody ever marks it SECURITY DEFINER the suite
-- fails, because that single word would hand every signed-in account the
-- Platinum worksheet set.
--
-- Merge semantics, because two devices and two independent callers write here:
-- a null argument means "leave this alone", and the worksheets map is merged
-- per key rather than replaced, so saving the Ready Score never drops the
-- pre-site estimate.
-- =============================================================================
create or replace function public.save_homeowner_worksheets(
  p_worksheets jsonb default null,
  p_lot        jsonb default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := public.current_app_user_id();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_worksheets is not null and jsonb_typeof(p_worksheets) <> 'object' then
    raise exception 'worksheets must be a json object' using errcode = '22023';
  end if;
  if p_lot is not null and jsonb_typeof(p_lot) <> 'object' then
    raise exception 'lot must be a json object' using errcode = '22023';
  end if;

  insert into public.homeowner_worksheets as hw (user_id, worksheets, lot)
  values (v_user, coalesce(p_worksheets, '{}'::jsonb), p_lot)
  on conflict (user_id) do update
     set worksheets = case
                        when p_worksheets is null then hw.worksheets
                        else hw.worksheets || p_worksheets
                      end,
         lot        = coalesce(p_lot, hw.lot);
end
$$;

revoke all on function public.save_homeowner_worksheets(jsonb, jsonb) from public, anon;
grant execute on function public.save_homeowner_worksheets(jsonb, jsonb) to authenticated, service_role;

comment on function public.save_homeowner_worksheets(jsonb, jsonb) is
  'Decision 2n: the homeowner write path for worksheets, the Ready Score and the lot. SECURITY INVOKER on purpose — the RLS policies on public.homeowner_worksheets are the boundary, and a null argument leaves that part unchanged.';


-- =============================================================================
-- PART 5 — users.builder_packet is the PROJECT BRIEF, and stays that way.
--
-- Moving the data is only half the job. While the ungated jsonb column can
-- still HOLD a worksheets or lot key, the hole is open: a Golden account writes
-- the Platinum set straight back into the column it is allowed to update, and
-- reads it back on its own row. So the two keys are stripped on every write to
-- public.users, for every role, service_role and the migration itself included.
-- There is no bypass switch, because a bypass switch is the bug.
--
-- STRIP rather than REJECT, deliberately. A raise would turn a stale deployed
-- bundle that still mirrors the whole packet into a failed project-brief save
-- for a paying customer (lane C of decision 2j is a separate state from lane
-- B). Stripping neutralises the write — the keys never persist — and lets the
-- brief half of that same write land.
-- =============================================================================
create or replace function public.builder_packet_brief_only(p_packet jsonb)
returns jsonb
language sql
immutable
as $$
  select case
           when p_packet is null then null
           when jsonb_typeof(p_packet) <> 'object' then p_packet
           else p_packet - array['worksheets', 'lot']
         end;
$$;

grant execute on function public.builder_packet_brief_only(jsonb) to anon, authenticated, service_role;

create or replace function public.users_builder_packet_brief_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.builder_packet := public.builder_packet_brief_only(new.builder_packet);
  return new;
end
$$;

grant execute on function public.users_builder_packet_brief_only() to anon, authenticated, service_role;

create trigger users_builder_packet_brief_only
  before insert or update on public.users
  for each row execute function public.users_builder_packet_brief_only();

comment on function public.builder_packet_brief_only(jsonb) is
  'Decision 2n: users.builder_packet holds the project brief only. The worksheets and lot keys moved to public.homeowner_worksheets and are stripped from every write.';


-- =============================================================================
-- PART 6 — the migration of existing data. Idempotent, and a callable function
--          rather than a one-shot block so the durable suite can prove it on
--          real rows instead of taking the migration's word for it.
--
-- Nothing is discarded: an existing homeowner_worksheets row WINS per key over
-- the legacy copy (it is the newer write), and the legacy copy fills only what
-- is missing. Then, and only then, the two keys leave users.builder_packet.
-- =============================================================================
create or replace function public.backfill_worksheet_packet()
returns integer
language plpgsql
as $$
declare
  v_moved integer := 0;
begin
  with legacy as (
    select u.id as user_id,
           case when jsonb_typeof(u.builder_packet -> 'worksheets') = 'object'
                then u.builder_packet -> 'worksheets'
                else '{}'::jsonb
           end as worksheets,
           case when jsonb_typeof(u.builder_packet -> 'lot') = 'object'
                then u.builder_packet -> 'lot'
                else null
           end as lot
      from public.users u
     where jsonb_typeof(u.builder_packet) = 'object'
       and u.builder_packet ?| array['worksheets', 'lot']
  ),
  moved as (
    insert into public.homeowner_worksheets as hw (user_id, worksheets, lot)
    select l.user_id, l.worksheets, l.lot
      from legacy l
    on conflict (user_id) do update
       set worksheets = excluded.worksheets || hw.worksheets,
           lot        = coalesce(hw.lot, excluded.lot),
           updated_at = now()
    returning hw.user_id
  )
  select count(*) into v_moved from moved;

  update public.users u
     set builder_packet = public.builder_packet_brief_only(u.builder_packet)
   where jsonb_typeof(u.builder_packet) = 'object'
     and u.builder_packet ?| array['worksheets', 'lot'];

  return v_moved;
end
$$;

revoke all on function public.backfill_worksheet_packet() from public, anon, authenticated;
grant execute on function public.backfill_worksheet_packet() to service_role;

comment on function public.backfill_worksheet_packet() is
  'Decision 2n: moves any legacy users.builder_packet worksheets/lot into public.homeowner_worksheets and strips the keys. Idempotent; an existing row wins per key so nothing already saved is overwritten.';

do $$
declare
  v_moved integer;
begin
  v_moved := public.backfill_worksheet_packet();
  raise notice '0013: moved worksheets/lot out of users.builder_packet for % account(s)', v_moved;
end
$$;


-- =============================================================================
-- PART 7 — study production keeps the whole packet.
--
-- api/admin/_studies.js builds the feasibility-study brief from
-- users.builder_packet and reads packet.lot and packet.worksheets.readyScore
-- out of it. Those keys are no longer in that column, so this view hands the
-- service role the merged shape projectBrief() already expects. It is
-- service_role ONLY — anon and authenticated are revoked, and the suite proves
-- it — because it deliberately joins a homeowner's Platinum data to their email.
-- =============================================================================
create or replace view public.homeowner_packet_full as
select u.id                                                as user_id,
       u.email,
       u.paid_tier,
       u.paid_at,
       u.refunded_at,
       coalesce(public.builder_packet_brief_only(u.builder_packet), '{}'::jsonb)
         || case when w.worksheets is null or w.worksheets = '{}'::jsonb
                 then '{}'::jsonb
                 else jsonb_build_object('worksheets', w.worksheets)
            end
         || case when w.lot is null
                 then '{}'::jsonb
                 else jsonb_build_object('lot', w.lot)
            end                                            as builder_packet
  from public.users u
  left join public.homeowner_worksheets w on w.user_id = u.id;

revoke all on public.homeowner_packet_full from anon, authenticated;
grant select on public.homeowner_packet_full to service_role;

comment on view public.homeowner_packet_full is
  'Decision 2n: the project brief merged with the entitled worksheets and lot, for study production only. service_role only — it joins Platinum data to a homeowner email.';


-- =============================================================================
-- Notes for whoever is next.
--   • The browser writes worksheets and the lot through
--     save_homeowner_worksheets() and reads them from
--     public.homeowner_worksheets; src/lib/supabase.js does both and strips the
--     two keys client-side before mirroring the brief, so nothing relies on the
--     trigger to be correct — the trigger is there for everything that is not
--     this frontend.
--   • Entitlement for the /packet/* routes is still checked in the browser as a
--     UX gate (PaidGate). That stays a hint. The database is now the boundary.
--   • An admin previewing a gated page with the anon key holds no worksheet
--     entitlement, by design: Amy's scope (2f) is course content, builder
--     records, regulatory resources and government claims, never a homeowner's
--     private property work. Study production reaches it with the service role
--     through PART 7.
--
-- TWO THINGS FOUND WHILE DOING THIS AND DELIBERATELY NOT DECIDED HERE, because
-- inventing a business rule is worse than reporting one:
--   • public.studies has no tier condition either. 0003 grants
--     "insert (user_id, intake, homeowner_note) on public.studies to
--     authenticated" and studies_insert_own asks only for the caller's own
--     user_id and status = 'submitted', so a Golden or free account can create a
--     feasibility-study order and submit intake — the Platinum deliverable —
--     and appear in Amy's fulfilment queue. That is the same SHAPE of hole as
--     2n, in a neighbouring flow, but 2n names the worksheets and the Ready
--     Score and nothing else, and whether an unpaid account may park an intake
--     ahead of an upgrade is a product question. Reported, not guessed at.
--   • users.builder_packet stays writable by any signed-in account, paid or
--     not, exactly as it was before this file. The project brief is described as
--     a paid-tier surface and /my-property is gated in the router; whether the
--     brief should also be tier-gated in the database is not something 2 or 2n
--     answers, and tightening it would silently break the pre-account quiz flow
--     that fills brief fields. Left as found.
-- =============================================================================
