-- =============================================================================
-- 0020 — the government IDENTITY axis, completed: withdrawal and suspension.
--
-- Decision 2s (D3, D4, D5), amending 2m and 2p. Three connected contracts, and
-- one of them is the one most likely to be built backwards.
--
--   D3  SUSPENDED is a REAL identity state, and it is REACHABLE.
--   D4  An identity verification is WITHDRAWABLE by an authorised admin, and the
--       action records WHO, WHEN and WHY. The historical verification record is
--       NEVER destroyed: the event is APPENDED to the history.
--   D5  Withdrawal STOPS THE FUTURE and PRESERVES THE PAST. No new sponsored
--       links, no new codes, no new sponsored activation. Entitlements ALREADY
--       GRANTED to residents REMAIN INTACT.
--
-- ── WHAT WAS ACTUALLY MISSING, WHICH IS NOT QUITE WHAT 2s SAYS ───────────────
--
-- 2s (D3) reads "2p (i) already named five internal states while
-- government_entities.verification_status could hold only four". That was true of
-- 0012 and it is NOT true of the migration chain as it stands: 0014 PART 1
-- already drops and re-adds government_entities_verification_status_check with
-- 'suspended' in it, for exactly the reason 2s gives, and says so in its own
-- comment. The CONTRACT in 2s holds; its diagnosis of the remaining work is one
-- migration out of date. So this file does NOT re-state 0014's DDL. It ASSERTS
-- that the five states are permitted (PART 0), so a later narrowing of that
-- constraint fails here with D3's name on it rather than silently, and then
-- builds the two things that were genuinely absent:
--
--   1. A PATH TO THE STATE. Nothing in the repository could write 'suspended'.
--      0012 ships seven admin_* RPCs and not one of them moves an entity OUT of
--      verified; govIdentityReject in api/admin/_regulatory.js writes 'rejected',
--      which is a different fact (a claim ADUAtlas refused, not a verification
--      ADUAtlas took back). A state with no door is a column value, not a state.
--
--   2. A HISTORY THAT SURVIVES THE TRANSITION. 0012's verification guard nulls
--      verified_at whenever verification_status leaves 'verified' — deliberately,
--      because "a date that outlives the verification behind it is a lie with a
--      timestamp on it". That is right, and it means the withdrawal has to write
--      the verification down somewhere before it goes. This file appends it.
--
-- ── D5 IS ALREADY HALF BUILT, AND THIS FILE DRIVES IT RATHER THAN REPEATING IT ─
--
-- 0014 ships government_entities_partnership_cascade: when verification LEAVES
-- 'verified', an ACTIVE partnership is suspended. Everything D5 asks for then
-- follows from machinery that already exists and is already tested:
--
--   new links and codes    partner_access_guard refuses an insert unless the
--                          partnership is ACTIVE and the identity is VERIFIED.
--   new activations        redeem_partner_access re-checks BOTH facts and
--                          refuses with the same opaque sentence as every other
--                          refusal.
--   the past               partner_redemptions is append-only for every role
--                          including service_role, has no revoked_at and no way
--                          to acquire one, and users.paid_tier is not touched by
--                          anything in the withdrawal path.
--
-- So the RPC below performs ONE UPDATE on ONE column and lets the existing
-- triggers do their work. It does not suspend the partnership itself. Writing
-- that second statement by hand is how the two axes start to drift, and a
-- withdrawal path that reached into government_partnerships directly would be
-- the beginning of exactly the collapse 2p (ii) exists to prevent.
--
-- ── IDENTITY IS NOT PARTNERSHIP, AT EVERY LAYER ──────────────────────────────
--
-- The RPC returns the two states as TWO FIELDS and never as one. The API module
-- and the console do the same. A suspended identity with a suspended partnership
-- and a verified identity with no partnership at all are both ordinary, and one
-- status pill cannot say either of them.
--
-- ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────
--
--   • It does not invent a sixth identity state. 2p (i) names five. "Withdraw"
--     and "suspend" are the same act on the same axis and both land on
--     'suspended', which is the word 0014 already defined as "a verification
--     ADUAtlas withdrew from an entity it had confirmed".
--   • It does not add a reinstatement RPC. Re-verifying is
--     admin_verify_government_membership, which already exists, and which
--     deliberately does NOT bring a partnership back: verification arriving at
--     'verified' activates nothing (2p).
--   • It does not touch a resident's account, tier, course access or
--     attribution. Not one statement in this file reads public.users except to
--     check that the acting admin exists.
--   • It does not strip a membership. A person leaving and an institution being
--     suspended are different facts and 2s (D3) says to keep them apart.
--   • It does not overwrite verification_note. That note records what was
--     CHECKED when identity was verified; the reason for the withdrawal is a
--     different sentence and it goes in the event row.
-- =============================================================================


-- =============================================================================
-- PART 0 — D3, asserted rather than restated.
--
-- The five internal identity states of 2p (i) must all be storable. 0014 made
-- that true; this block makes it a thing 0020 depends on out loud, so narrowing
-- the constraint later breaks the migration chain with the decision's name in the
-- message instead of breaking the withdrawal path at runtime.
-- =============================================================================
do $$
declare
  v_def  text;
  v_miss text[] := '{}';
  s      text;
begin
  select pg_get_constraintdef(k.oid) into v_def
    from pg_constraint k
   where k.conrelid = 'public.government_entities'::regclass
     and k.conname = 'government_entities_verification_status_check';
  if v_def is null then
    raise exception 'government_entities has no verification_status vocabulary constraint, so the five identity states of 2p (i) are not enforced at all';
  end if;
  foreach s in array array['unverified', 'pending', 'verified', 'rejected', 'suspended'] loop
    if position('''' || s || '''' in v_def) = 0 then
      v_miss := v_miss || s;
    end if;
  end loop;
  if v_miss <> '{}' then
    raise exception 'decision 2s (D3): government_entities.verification_status must be able to hold all five identity states of 2p (i). Missing: %. Found: %',
      array_to_string(v_miss, ', '), v_def;
  end if;
end
$$;


-- =============================================================================
-- PART 1 — the identity history: append only, one row per transition.
--
-- WHY A TABLE AND NOT JUST THE AUDIT LOG. regulatory_audit_log already records a
-- before and after snapshot of every government_entities update, and it stays as
-- the second, independent copy. But it is a general log keyed by table name: the
-- question "was this entity ever verified, when, by whom, and why was that taken
-- back" would be answered by parsing jsonb out of a log whose shape is nobody's
-- contract. D4 makes who / when / why first-class, so they are columns.
--
-- EVERY TRANSITION, NOT ONLY WITHDRAWALS. The trigger in PART 2 fires on any
-- change of verification_status, whoever made it, so the history cannot be
-- avoided by a future code path that writes the column some other way. A row
-- recording a verification is what makes the later withdrawal row legible.
--
-- TRANSITIONS ONLY, NOT CREATIONS. Creating an entity is not a transition: it
-- lands on 'unverified', which is the absence of a verification, and
-- government_entities.created_at and the audit row already say when the record
-- was compiled. Firing on INSERT as well would also make EVERY seeded entity
-- undeletable through the restrict below, which is a bigger claim than this
-- decision makes.
-- =============================================================================
create table public.government_identity_events (
  id                bigint generated always as identity primary key,

  -- RESTRICT, not cascade. An entity whose identity state has MOVED is not
  -- deleted out from under its own history, for the reason partner_redemptions
  -- gives about the link that earned an attribution: deletion is not the
  -- operation. Nothing in the product deletes a government entity — 0012 PART 12
  -- says the record stays because ADUAtlas compiled it from public sources and is
  -- useful with no account attached — no endpoint or migration issues such a
  -- delete, and partner_redemptions already makes a sponsored entity undeletable.
  -- A never-claimed seeded entity has no rows here and stays deletable.
  entity_id         uuid not null references public.government_entities (id) on delete restrict,

  -- WHEN. The database's, never the caller's.
  occurred_at       timestamptz not null default now(),

  -- WHAT MOVED. Both halves, so a row is readable without the row before it.
  from_status       text not null,
  to_status         text not null,

  -- WHO. Recorded from the acting RPC, which takes the admin's users.id because
  -- "the service key did it" is not an answer to who did it. Null means UNKNOWN
  -- (2b): a transition written by a path that did not say who made it is recorded
  -- as not knowing, never as somebody.
  --
  -- on delete set null matches every other actor column in the chain
  -- (government_entities.verified_by_app_user_id, the grant and membership actor
  -- columns, regulatory_audit_log.actor_app_user_id). It is the one weakness this
  -- table shares with all of them and it is not a new one.
  actor_app_user_id uuid references public.users (id) on delete set null,
  -- Which key the statement came through, from the verified JWT claim rather than
  -- from current_user, so a SECURITY DEFINER body does not lose the caller.
  -- 'direct' means the write did not come through the API at all.
  actor_api_role    text not null default public.regulatory_actor_api_role(),

  -- WHY. Required by the withdrawal RPC in PART 4. Null where the transition
  -- carried no stated reason, which is again unknown rather than manufactured.
  reason            text,

  -- THE VERIFICATION THIS EVENT ENDED, copied off the row before 0012's guard
  -- clears the date. This is the half of D4 that the entity row cannot keep:
  -- after a withdrawal government_entities.verified_at is null, correctly, and
  -- these three columns are where "it WAS verified, then, by them, having checked
  -- this" survives.
  prior_verified_at             timestamptz,
  prior_verified_by_app_user_id uuid references public.users (id) on delete set null,
  prior_verification_note       text,

  -- A transition that did not transition is not an event.
  constraint government_identity_events_actually_moved
    check (from_status is distinct from to_status)
);

create index government_identity_events_entity_idx
  on public.government_identity_events (entity_id, occurred_at desc, id desc);
create index government_identity_events_to_status_idx
  on public.government_identity_events (to_status, occurred_at desc);

comment on table public.government_identity_events is
  'The IDENTITY history of a government entity (2s D4): every change of government_entities.verification_status, with who made it, when, why, and the verification it ended. Append only for every role including service_role: a withdrawal is an event APPENDED to the history and never an erasure of it, for the same reason 0014 keeps a submission beside the published value. It says nothing whatsoever about the partnership axis (2p ii), which has its own status, its own dates and its own audit rows.';
comment on column public.government_identity_events.actor_app_user_id is
  'The acting person''s public.users.id, as every admin_* RPC takes it. NULL means ADUAtlas does not know who made this transition, which is a different statement from nobody and is never printed as one (2b).';
comment on column public.government_identity_events.reason is
  'WHY, as the acting admin wrote it. Required for a withdrawal by admin_withdraw_government_verification. NULL means no reason was recorded with this transition.';
comment on column public.government_identity_events.prior_verified_at is
  'The verification this event ended. 0012''s guard nulls government_entities.verified_at the moment the status leaves verified, deliberately, so this column is where the fact that the entity WAS verified survives the withdrawal.';

-- ── append only, for everybody, including the service role ───────────────────
-- The same shape as 0014's partner_ledger_append_only and for the same reason:
-- "the history is never destroyed" is a property of the schema rather than a rule
-- a code path remembers. A stolen service key can append a lie; it cannot remove
-- the truth.
create or replace function public.government_identity_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'public.government_identity_events is append only: a verification that happened, and a withdrawal that happened, are never edited or deleted, by any role (2s D4)'
    using errcode = '42501';
end;
$$;

create trigger government_identity_events_append_only
  before update or delete on public.government_identity_events
  for each row execute function public.government_identity_events_append_only();


-- =============================================================================
-- PART 2 — the writer: one trigger, so no path can move the state without
--          leaving a record.
--
-- WHO AND WHY REACH A TRIGGER THROUGH TRANSACTION-LOCAL SETTINGS. A trigger
-- takes no arguments from the statement that fired it, so the RPC in PART 4 puts
-- the acting admin and the reason in two transaction-local GUCs and this reads
-- them back. Stated plainly because it is the first thing a reviewer should
-- challenge: can somebody forge the actor by setting the GUC?
--
--   No usefully. The GUC is only ever READ during a change to
--   verification_status, and 0012's government_entities_verification_guard
--   refuses such a change from anon and from authenticated outright. What remains
--   is service_role and the SECURITY DEFINER bodies it can reach — and a caller
--   holding the service key can already name any actor it likes by passing
--   p_actor_app_user_id to any of the eight admin_* RPCs. The GUC adds no
--   surface that the service key did not already have, and it adds none at all
--   for a browser.
--
-- The fallbacks are ordered so a transition made by an existing 0012 path is
-- still attributed honestly without this file editing that path:
--   1. the setting the acting RPC recorded;
--   2. verified_by_app_user_id, when the transition is INTO verified — which is
--      the same statement admin_verify_government_membership writes it in;
--   3. the signed-in person, where there is one;
--   4. null, meaning unknown.
-- =============================================================================
create or replace function public.government_identity_actor()
returns uuid
language plpgsql
stable
as $$
begin
  return nullif(btrim(coalesce(current_setting('aduatlas.identity_actor', true), '')), '')::uuid;
exception when others then
  -- An unparseable setting is not an actor and must never abort a verification.
  return null;
end;
$$;

create or replace function public.government_identity_reason()
returns text
language sql
stable
as $$
  select nullif(btrim(coalesce(current_setting('aduatlas.identity_reason', true), '')), '');
$$;

comment on function public.government_identity_actor() is
  'The acting admin for an identity transition, carried from the RPC to the history trigger in a transaction-local setting. Only ever read while verification_status is changing, which 0012''s guard already refuses to anon and authenticated, so it is not a forgery surface for a browser.';

revoke execute on function public.government_identity_actor() from public, anon, authenticated;
revoke execute on function public.government_identity_reason() from public, anon, authenticated;
grant  execute on function public.government_identity_actor()  to service_role;
grant  execute on function public.government_identity_reason() to service_role;

create or replace function public.government_entities_identity_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SECURITY DEFINER for the reason 0012's government_audit() gives: the history
  -- table takes no INSERT from any API role, so a trigger running as the caller
  -- could not write it. The body records the caller rather than the owner.
  insert into public.government_identity_events (
    entity_id, from_status, to_status,
    actor_app_user_id, actor_api_role, reason,
    prior_verified_at, prior_verified_by_app_user_id, prior_verification_note)
  values (
    new.id,
    old.verification_status,
    new.verification_status,
    coalesce(
      public.government_identity_actor(),
      case when new.verification_status = 'verified' then new.verified_by_app_user_id end,
      public.regulatory_actor_app_user_id()),
    public.regulatory_actor_api_role(),
    public.government_identity_reason(),
    old.verified_at,
    old.verified_by_app_user_id,
    old.verification_note);
  return null;
end;
$$;

comment on function public.government_entities_identity_history() is
  'Appends one row to government_identity_events for every change of government_entities.verification_status, whoever made it and by whatever path (2s D4). AFTER the row is final, so it records what the database actually stored rather than what a caller asked for. It does not fire on INSERT: creating a record is not a transition.';

-- AFTER, so the guard trigger has already had its say and the recorded state is
-- the state that was stored. WHEN, so an ordinary edit to a name or a domain list
-- writes no identity event: this table is transitions, not updates.
create trigger government_entities_identity_history
  after update on public.government_entities
  for each row
  when (new.verification_status is distinct from old.verification_status)
  execute function public.government_entities_identity_history();


-- =============================================================================
-- PART 3 — who may read it. Nobody but ADUAtlas.
--
-- Supabase's ALTER DEFAULT PRIVILEGES hands anon and authenticated ALL on every
-- new table in schema public, so the revoke below is what makes this table
-- private; without it the identity history would be world-readable and every
-- withdrawal reason ADUAtlas ever wrote would be on the public API.
--
-- A government member reads NOTHING here, not even their own entity's history.
-- The reason is 2p and 0012's treatment of verification_note and claim_note:
-- these are ADUAtlas's internal review sentences about an institution's claim,
-- and a partner portal that showed them would be publishing Amy's notes. If the
-- product later wants to show a partner "your verification was withdrawn on this
-- date", that is a narrow read of two columns through a view and a deliberate
-- decision, not this table.
-- =============================================================================
alter table public.government_identity_events enable row level security;
revoke all on public.government_identity_events from anon, authenticated;
-- No policy for anon or authenticated, so RLS denies them even if a future
-- default privilege hands the grant back.


-- =============================================================================
-- PART 4 — D4: the withdrawal, and the only door to the SUSPENDED state.
--
-- The eighth admin_* RPC, in the shape of the other seven: service_role only,
-- SECURITY DEFINER, takes the acting person's users.id, writes the audit row no
-- API role may insert, returns jsonb.
--
-- It is STRICTER than the other seven in two ways, and both are 2s (D4) read
-- literally rather than this file being clever. The others accept a null note or
-- a null reason. A withdrawal does not: "the action records WHO performed it,
-- WHEN and WHY". An unattributed withdrawal and an unexplained one are the two
-- things this decision exists to prevent, so they are refusals.
--
-- WHAT IT DELIBERATELY DOES NOT WRITE:
--   • government_partnerships. 0014's cascade does that, and driving it rather
--     than duplicating it is the whole point (see the header).
--   • public.users, partner_redemptions, partner_access_links,
--     partner_access_codes. D5 preserves the past, and the cheapest way to keep
--     that promise is for the withdrawal path to contain no statement that could
--     break it.
--   • verification_note. That is what was checked at verification. The reason for
--     the withdrawal is a different sentence and it is in the event row.
-- =============================================================================
create or replace function public.admin_withdraw_government_verification(
  p_entity_id uuid,
  p_actor_app_user_id uuid,
  p_reason text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  e        record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_event  bigint;
  v_part   text;
begin
  -- WHO, and it is not optional.
  if p_actor_app_user_id is null then
    raise exception 'a withdrawal records WHO performed it: pass the acting admin''s users.id. "the service key did it" is not an answer to who did it (2s D4)'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = p_actor_app_user_id) then
    raise exception 'no such acting user, so this withdrawal could not be attributed to anybody'
      using errcode = '23503';
  end if;
  -- WHY, and it is not optional either.
  if v_reason is null then
    raise exception 'a withdrawal records WHY: write the reason this government identity verification is being withdrawn (2s D4)'
      using errcode = '22023';
  end if;

  select * into e from public.government_entities where id = p_entity_id for update;
  if e.id is null then
    raise exception 'no such government entity' using errcode = '23503';
  end if;
  -- Only a verification that EXISTS is withdrawn. A claim that was never verified
  -- is REJECTED, which 0012 and 2p (i) keep as a separate word for a separate
  -- event, and re-suspending an already suspended entity would append a second
  -- withdrawal of nothing.
  if e.verification_status <> 'verified' then
    raise exception 'only a VERIFIED government identity is withdrawn; this entity''s identity state is %. A claim that was never verified is REJECTED, which is a different event (2p i)', e.verification_status
      using errcode = '23514';
  end if;

  -- WHO and WHY, carried to the history trigger for this transaction only.
  perform set_config('aduatlas.identity_actor', p_actor_app_user_id::text, true);
  perform set_config('aduatlas.identity_reason', v_reason, true);

  -- ONE statement, ONE column. It drives, in this order:
  --   government_entities_partnership_cascade  suspends an ACTIVE partnership, so
  --                                            new sponsored activations stop on
  --                                            the next statement (D5's future).
  --   government_entities_verification_guard   clears verified_at, because the
  --                                            date must not outlive the fact.
  --   government_entities_audit                the independent second record.
  --   government_entities_identity_history     the appended event (D4).
  -- Nothing below repeats any of that work.
  update public.government_entities
     set verification_status = 'suspended'
   where id = p_entity_id;

  -- Cleared so a later statement in the same transaction cannot inherit this
  -- withdrawal's actor and reason.
  perform set_config('aduatlas.identity_actor', '', true);
  perform set_config('aduatlas.identity_reason', '', true);

  select ev.id into v_event
    from public.government_identity_events ev
   where ev.entity_id = p_entity_id
   order by ev.id desc
   limit 1;

  perform public.regulatory_audit('entity.identity_withdrawn', 'government_entities',
    p_entity_id, null, p_entity_id,
    array['verification_status', 'verified_at'], to_jsonb(e), null,
    v_reason, p_actor_app_user_id);

  v_part := public.government_partnership_status(p_entity_id);

  -- THE TWO STATES, AS TWO FIELDS. There is no combined status in this payload
  -- and there is not going to be one: 2p (ii) and 2s (D3) both say identity state
  -- and partnership state stay separate at every layer, and a caller that wants
  -- one pill would have to invent it here in the open.
  return jsonb_build_object(
    'ok', true,
    'entity_id', p_entity_id,
    'identity_state', 'suspended',
    'public_entity_state', public.government_entity_state(p_entity_id),
    'partnership_state', v_part,
    'identity_event_id', v_event,
    'withdrawn_verification_at', e.verified_at,
    'residents_affected', 0,
    'note', 'Identity verification withdrawn. New sponsored links, new codes and new sponsored activations stop from the next statement. Residents already sponsored through this partnership keep their Golden access: they did nothing wrong and the sponsorship was granted once. Re-verifying a representative does not bring the partnership back; that is a separate, deliberate act.');
end;
$$;

comment on function public.admin_withdraw_government_verification(uuid, uuid, text) is
  'Decision 2s (D4, D5): an authorised admin withdraws a government identity verification, recording WHO, WHEN and WHY, and the verification is appended to government_identity_events rather than erased. It performs ONE update on ONE column and lets 0014''s government_entities_partnership_cascade suspend an active partnership, so the two axes cannot drift. It touches no resident: nothing already granted is taken away.';

revoke execute on function public.admin_withdraw_government_verification(uuid, uuid, text)
  from public, anon, authenticated;
grant  execute on function public.admin_withdraw_government_verification(uuid, uuid, text)
  to service_role;


-- =============================================================================
-- PART 5 — what 0020 deliberately does NOT do
--
--   • No sixth identity state. 2p (i) names five and "withdrawn" is 'suspended'.
--   • No reinstatement RPC. admin_verify_government_membership already
--     re-verifies, and it deliberately does not reactivate a partnership.
--   • No change to redeem_partner_access, partner_access_guard,
--     government_entities_partnership_cascade or partner_redemptions. Every one
--     of them already refuses or preserves exactly what D5 asks for, and editing
--     them to say it twice would create the second place to get it wrong.
--   • No resident-facing change of any kind. A resident is never told, moved,
--     downgraded or logged out because the government relationship changed.
--   • No partner-portal read of the identity history. Amy's console reads it.
-- =============================================================================
