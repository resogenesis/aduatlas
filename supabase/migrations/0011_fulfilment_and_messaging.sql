-- =============================================================================
-- 0011 — The paid-work lifecycle (decision 2i) and homeowner→builder messaging
--        (decision 2h). Phase 1, fourth pass. Applied after 0010.
--
-- Two things, both deliberately small.
--
-- 1. THE FULFILMENT LIFECYCLE. Richard produces the feasibility study and the
--    site plan himself in Phase 1. He needs the minimum workflow that lets him
--    see a paid order and move it forward, and nothing resembling project
--    management software. So this file adds TWO status values and ONE
--    timestamp to public.studies. No assignees, no estimated dates, no
--    priorities, no tasks, no second table.
--
--    WHY work_started_at IS NOT OPTIONAL. src/lib/contentRegistry/legal.js
--    already sells the customer this promise:
--
--      "It stays refundable until ADUAtlas has actually begun substantive work
--       on it. We will tell you when that starts, and from that point the study
--       and the site plan are non-refundable."
--
--    Decision 2i: "Legal copy must never depend on an event the product cannot
--    prove." Before this file the product could not prove it. work_started_at
--    is stamped by a trigger on the first transition into 'work_started', can
--    never be moved and can never be cleared, so the date the customer is shown
--    is the date the refund boundary actually moved.
--
-- 2. MESSAGING. A homeowner starts a conversation from a CLAIMED builder
--    profile. The builder may reply only once that conversation carries a
--    homeowner message. A builder can never browse homeowners, can never open a
--    conversation, and can never read who the homeowner is. Those rules live in
--    the DATABASE here, not only in the UI, and they are modelled on the
--    support_messages pattern in 0003: lock the tables down, grant back named
--    columns, and put the rule in an RLS policy.
--
--    A thread and messages. No presence, no typing indicators, no attachments,
--    no group threads, no subject line. The ADUAtlas thread is the system of
--    record; builder_messages.notified_at exists only so an email notifier can
--    tell a participant that a message is waiting without becoming the channel.
--
-- Nothing here bills anything, computes a balance or moves money.
-- =============================================================================


-- =============================================================================
-- PART 1 — the fulfilment lifecycle on public.studies
-- =============================================================================

-- ── The six states of decision 2i, and where each one lives ─────────────────
--
--   Paid                 DERIVED, not stored. A Platinum or Concierge buyer
--                        with no studies row yet: paid_at is set, refunded_at
--                        is null, paid_tier is 'report' or 'concierge', and no
--                        study exists. /api/admin/studies/list synthesises the
--                        row so the queue shows the order that is waiting on
--                        the customer rather than on Richard. Storing a 'paid'
--                        status would mean inventing a studies row for a
--                        customer who has submitted nothing, and there is no
--                        intake to put in it.
--   Intake Complete      status 'submitted'      (+ submitted_at, 0003)
--   Ready for Review     status 'in_review'      (0003)
--   Work Started         status 'work_started'   (+ work_started_at, NEW HERE)
--   Deliverables Ready   status 'deliverables_ready'  (NEW HERE)
--   Delivered            status 'ready'          (+ ready_at, 0003)
--
-- The three reused tokens are NOT renamed. src/pages/app/SitePlan.jsx gates the
-- delivered site plan on status = 'ready' and src/pages/app/Dashboard.jsx reads
-- the status straight out of STUDY_STATUS, so renaming 'submitted' to
-- 'intake_complete' or 'ready' to 'delivered' would silently break two pages
-- and would need a data migration for no behavioural gain. The operator labels
-- live in one place in the UI (STUDY_STATUS in src/lib/studies.js), and the
-- column comment below is the mapping.
--
--   'needs_info' stays exactly as 0003 defined it. It is the off-ramp, not a
--   lifecycle stage: Richard asks the customer for something and the customer
--   resubmits, which returns the row to 'submitted'.

-- 0003 declared the check inline, so Postgres named it studies_status_check.
-- Dropped by inspection rather than by that name alone, in case an earlier hand
-- edit renamed it: any check constraint on public.studies that mentions the
-- 0003 status vocabulary is the one being replaced.
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
  check (status in ('submitted', 'in_review', 'needs_info',
                    'work_started', 'deliverables_ready', 'ready'));

-- The event the refund copy promises. Written once, by the triggers below.
alter table public.studies
  add column if not exists work_started_at timestamptz;

comment on column public.studies.status is
  'Fulfilment lifecycle (decision 2i). submitted = Intake Complete, in_review = Ready for Review, work_started = Work Started, deliverables_ready = Deliverables Ready, ready = Delivered. needs_info is the off-ramp. "Paid" is derived from users (no row yet), never stored here.';
comment on column public.studies.work_started_at is
  'When substantive work on this order actually began. Stamped once; never moved, never cleared. The refund copy in src/lib/contentRegistry/legal.js promises the customer we will tell them when this happens, so it is a real event and not a label.';

-- ── work_started_at: stamp once, then immutable ─────────────────────────────
-- Enforced in the database rather than in the API, so a bug in the console, a
-- second writer or a hand-run SQL statement cannot reopen a refund boundary the
-- customer has already been told about. A re-entry into 'work_started' (the
-- operator steps back from Deliverables Ready and forward again) keeps the
-- original date, because the original date is when work actually began.
create or replace function public.studies_stamp_work_started()
returns trigger
language plpgsql
as $$
begin
  -- OLD is only touched under UPDATE. A nested IF rather than one condition,
  -- because plpgsql does not promise to short-circuit `and` and OLD is an
  -- unassigned record on INSERT.
  if tg_op = 'UPDATE' then
    if old.work_started_at is not null then
      -- Immutable once set: ignore any attempt to move or clear it.
      new.work_started_at := old.work_started_at;
      return new;
    end if;
  end if;
  if new.status = 'work_started' and new.work_started_at is null then
    new.work_started_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists studies_stamp_work_started on public.studies;
create trigger studies_stamp_work_started
  before insert or update on public.studies
  for each row execute function public.studies_stamp_work_started();

-- The homeowner's grants and policies from 0003 are deliberately unchanged.
-- studies_update_own still requires status in ('submitted', 'needs_info') to
-- update and pins the result to 'submitted', so a customer can edit their
-- intake before review and NEVER after work has started, and can never write
-- any of the three operator-only states.

create index if not exists studies_work_started_idx
  on public.studies (work_started_at)
  where work_started_at is not null;


-- =============================================================================
-- PART 2 — homeowner→builder messaging (decision 2h)
-- =============================================================================
--
-- THE FOUR RULES, and where each is enforced:
--
--   1. Only a paid homeowner may open a conversation, and only against a
--      CLAIMED, approved, active listing.
--        → can_start_builder_conversation(), in the INSERT policy on
--          builder_conversations. Decisions 2c and 2h: an unclaimed listing has
--          "no ability to start a conversation with a homeowner", and 2a keeps
--          messaging behind the paid account.
--   2. A builder can never OPEN a conversation.
--        → there is exactly one INSERT policy on builder_conversations and it
--          requires homeowner_user_id = the caller, who must have role
--          'homeowner'.
--   3. A builder can only reply once a homeowner message exists.
--        → conversation_has_homeowner_message(), in the INSERT policy on
--          builder_messages.
--   4. A builder can never learn who the homeowner is, and can never browse
--      homeowners.
--        → homeowner_user_id is NOT in the SELECT grant, so no client reads it;
--          and a builder's SELECT policy reaches only threads on the builder row
--          they own. There is no path from a builder account to a list of
--          homeowners.
--
-- The helper functions are security definer because they read public.users and
-- public.builders, which the authenticated role has no grant on (0006 revoked
-- select on builders; homeowners read a view). Each one answers a single yes/no
-- question about the CALLER and leaks nothing else.

-- ── builder_conversations ───────────────────────────────────────────────────
-- One thread per (builder, homeowner). No subject, no participants table, no
-- group threads: the pair IS the thread.
create table public.builder_conversations (
  id                uuid primary key default gen_random_uuid(),
  builder_id        uuid not null references public.builders (id) on delete cascade,
  -- Filled from the caller's own identity by DEFAULT, and never granted to the
  -- authenticated role for insert or select. A client cannot name someone else
  -- as the homeowner and cannot read who the homeowner is.
  homeowner_user_id uuid not null default public.current_app_user_id()
                      references public.users (id) on delete cascade,
  created_at        timestamptz not null default now(),
  last_message_at   timestamptz not null default now(),
  unique (builder_id, homeowner_user_id)
);

create index builder_conversations_builder_idx
  on public.builder_conversations (builder_id, last_message_at desc);
create index builder_conversations_homeowner_idx
  on public.builder_conversations (homeowner_user_id, last_message_at desc);

comment on table public.builder_conversations is
  'Decision 2h. One message thread per claimed builder and paying homeowner. The homeowner opens it; the builder can only reply. The thread is the system of record and email only notifies.';
comment on column public.builder_conversations.homeowner_user_id is
  'Never granted to the authenticated role. A builder must never learn who the homeowner is (spec 5.6: builders never get the homeowner database).';

-- ── builder_messages ────────────────────────────────────────────────────────
create table public.builder_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.builder_conversations (id) on delete cascade,
  author          text not null check (author in ('homeowner', 'builder')),
  body            text not null check (length(body) between 1 and 4000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  -- Set by whatever sends the notification email. Service role only: it is
  -- delivery bookkeeping, not part of the conversation, and the thread stays
  -- the system of record whether or not the email ever went out.
  notified_at     timestamptz
);

create index builder_messages_conversation_idx
  on public.builder_messages (conversation_id, created_at);
create index builder_messages_unnotified_idx
  on public.builder_messages (created_at)
  where notified_at is null;

comment on column public.builder_messages.notified_at is
  'Email-notification bookkeeping, service role only. Decision 2h: email notifies that a message is waiting and is not the channel itself.';

-- ── the four rules, as functions ────────────────────────────────────────────

-- Is the caller a paid homeowner who may open a conversation with this builder?
create or replace function public.can_start_builder_conversation(p_builder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.users u
            where u.id = public.current_app_user_id()
              and u.role = 'homeowner'
              and public.users_is_paid(u)
         )
     and exists (
           select 1 from public.builders b
            where b.id = p_builder_id
              and b.active
              and b.profile_status = 'approved'
              and b.owner_user_id is not null   -- claimed. Decisions 2c and 2h.
         );
$$;

-- Is the caller the homeowner on this thread?
create or replace function public.is_conversation_homeowner(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.builder_conversations c
     where c.id = p_conversation_id
       and c.homeowner_user_id = public.current_app_user_id()
  );
$$;

-- Does the caller own the builder on this thread? A claim that is given up
-- (owner_user_id set to null) takes the builder's access to the thread with it,
-- the same way it takes the Verified badge in 0007.
create or replace function public.owns_builder_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.builder_conversations c
      join public.builders b on b.id = c.builder_id
     where c.id = p_conversation_id
       and b.owner_user_id is not null
       and b.owner_user_id = public.current_app_user_id()
  );
$$;

-- Has the homeowner written yet? This is the whole of rule 3.
create or replace function public.conversation_has_homeowner_message(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.builder_messages m
     where m.conversation_id = p_conversation_id
       and m.author = 'homeowner'
  );
$$;

revoke execute on function public.can_start_builder_conversation(uuid)     from public, anon;
revoke execute on function public.is_conversation_homeowner(uuid)          from public, anon;
revoke execute on function public.owns_builder_conversation(uuid)          from public, anon;
revoke execute on function public.conversation_has_homeowner_message(uuid) from public, anon;
grant  execute on function public.can_start_builder_conversation(uuid)     to authenticated;
grant  execute on function public.is_conversation_homeowner(uuid)          to authenticated;
grant  execute on function public.owns_builder_conversation(uuid)          to authenticated;
grant  execute on function public.conversation_has_homeowner_message(uuid) to authenticated;

-- ── builder_conversations: policies and grants ──────────────────────────────
alter table public.builder_conversations enable row level security;

-- Either participant reads the thread. The homeowner branch is inlined rather
-- than routed through a helper so the row policy is self-evident.
create policy builder_conversations_select_participant on public.builder_conversations
  for select to authenticated
  using (
    homeowner_user_id = public.current_app_user_id()
    or public.owns_builder_conversation(id)
  );

-- RULE 1 and RULE 2. The only INSERT policy on this table.
create policy builder_conversations_insert_homeowner on public.builder_conversations
  for insert to authenticated
  with check (
    homeowner_user_id = public.current_app_user_id()
    and public.can_start_builder_conversation(builder_id)
  );

-- No UPDATE and no DELETE policy: last_message_at is moved by the trigger below
-- (which runs as the table owner), and a thread is a record, not a draft.

revoke all on public.builder_conversations from anon, authenticated;
grant select (id, builder_id, created_at, last_message_at)
  on public.builder_conversations to authenticated;
grant insert (builder_id) on public.builder_conversations to authenticated;

-- ── builder_messages: policies and grants ───────────────────────────────────
alter table public.builder_messages enable row level security;

create policy builder_messages_select_participant on public.builder_messages
  for select to authenticated
  using (
    public.is_conversation_homeowner(conversation_id)
    or public.owns_builder_conversation(conversation_id)
  );

-- RULE 3. A homeowner writes as the homeowner on their own thread. A builder
-- writes as the builder on a thread for the builder they own, AND ONLY once
-- that thread already carries a homeowner message. Neither side can forge the
-- other's author value: a builder inserting author = 'homeowner' fails the first
-- branch (they are not the thread's homeowner), which is what stops a builder
-- from manufacturing the homeowner message that would unlock its own reply.
create policy builder_messages_insert_participant on public.builder_messages
  for insert to authenticated
  with check (
    (author = 'homeowner' and public.is_conversation_homeowner(conversation_id))
    or (
      author = 'builder'
      and public.owns_builder_conversation(conversation_id)
      and public.conversation_has_homeowner_message(conversation_id)
    )
  );

-- Marking the OTHER side's message read. The column grant below is what keeps
-- this from being an edit: read_at is the only column the role may write, so a
-- body can never be changed or rewritten after it is sent.
create policy builder_messages_mark_read on public.builder_messages
  for update to authenticated
  using (
    (author = 'builder' and public.is_conversation_homeowner(conversation_id))
    or (author = 'homeowner' and public.owns_builder_conversation(conversation_id))
  )
  with check (
    (author = 'builder' and public.is_conversation_homeowner(conversation_id))
    or (author = 'homeowner' and public.owns_builder_conversation(conversation_id))
  );

revoke all on public.builder_messages from anon, authenticated;
grant select (id, conversation_id, author, body, created_at, read_at)
  on public.builder_messages to authenticated;
grant insert (conversation_id, author, body) on public.builder_messages to authenticated;
grant update (read_at) on public.builder_messages to authenticated;

-- ── last_message_at, so a thread list can be ordered ────────────────────────
create or replace function public.builder_conversation_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.builder_conversations
     set last_message_at = new.created_at
   where id = new.conversation_id
     and last_message_at < new.created_at;
  return new;
end;
$$;

create trigger builder_messages_touch_conversation
  after insert on public.builder_messages
  for each row execute function public.builder_conversation_touch();

-- ── "builder contacted", recorded once per homeowner per builder per day ────
-- Spec 5.6: "messaging or requesting an introduction records builder
-- contacted". Recorded from a trigger rather than from the client so the
-- marketplace count cannot be skipped or inflated by whoever calls the API.
-- referral_events is service-role only (0006), so the trigger is security
-- definer; the daily unique index there makes the insert idempotent.
create or replace function public.log_builder_conversation_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.referral_events (builder_id, kind, user_id)
  values (new.builder_id, 'builder_contacted', new.homeowner_user_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger builder_conversations_log_contact
  after insert on public.builder_conversations
  for each row execute function public.log_builder_conversation_opened();

-- =============================================================================
-- What 0011 deliberately does NOT do
--
--   • No change to my_referral_stats() or referral_stats(). Both still report
--     conversations as 0 (0007). Wiring the real count belongs with whoever owns
--     those functions next; the data is now there to read (count(*) from
--     builder_conversations for that builder).
--   • No email. notified_at is the hook; nothing in the database sends.
--   • No admin view of a builder↔homeowner thread. Decision 2f keeps the console
--     narrow, and reading private conversations is not one of the two things Amy
--     is responsible for. The service role can read the tables if a support case
--     ever requires it.
--   • No unread counter column on the conversation row. read_at on the message
--     is enough for a count, and a denormalised counter is a second source of
--     truth to keep in step.
-- =============================================================================
