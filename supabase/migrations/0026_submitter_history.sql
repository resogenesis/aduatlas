-- =============================================================================
-- 0026_submitter_history.sql
--
-- CORRECTNESS EXCEPTION UNDER PHASE_1.md 2t, carried from the RC3 rehearsal
-- (R3-23 part c) and decided by Richard for RC4a: "Open the read path."
-- supabase/tests/invariants/310_submitter_history.sql fails against the chain
-- without this file. Nothing here adds product scope, a plan, a price or a table.
--
-- THE DEFECT. regulatory_submissions is readable through one policy (0012):
-- is_verified_government_member_of(entity_id), a VERIFIED member of a VERIFIED
-- entity. When ADUAtlas withdraws an entity's identity verification (0020), its
-- members stop being verified members, so the person who sent a submission can
-- no longer see it, or ADUAtlas's answer to it. RC4's portal said so honestly.
-- The decision: withdrawal stops the future; it does not erase the submitter's
-- view of what they sent.
--
-- THE FIX, and its boundary.
--   READ: a second SELECT policy. A person reads the submissions THEY
--         submitted (submitted_by_government_user_id = the caller's own
--         government identity) while they still hold a LIVE membership of that
--         entity (verified and not revoked), whatever the ENTITY's verification
--         state. A withdrawal suspends the entity and leaves memberships as they
--         were (0020), so the submitter keeps their history. A person whose
--         membership was revoked (they left, or the authority behind the login
--         went away) reads nothing, as 0012 promises: "a revoked member is out
--         on the next statement". Nothing else either: not a colleague's
--         submission, not another entity's. The column grant is unchanged
--         (0012), so no column becomes visible that was not.
--   ACT:  withdrawing a submission now also requires the caller to be a verified
--         member of the entity. Before this file a de-verified member could not
--         reach the rows at all, so the new read path must not become a new
--         write path; submitting already required live authority (0012) and
--         still does.
-- =============================================================================

-- A live membership of the entity: verified and not revoked. Unlike
-- is_verified_government_member_of (0012) it does not ask whether the ENTITY is
-- verified, because a withdrawal must not take a person's own history away.
create or replace function public.holds_live_government_membership_of(p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.government_memberships m
      join public.government_users gu on gu.id = m.government_user_id
      join public.users u             on u.id = gu.user_id
     where u.auth_user_id = auth.uid()
       and m.entity_id = p_entity_id
       and m.status = 'verified'
       and m.revoked_at is null
  );
$$;

revoke all on function public.holds_live_government_membership_of(uuid) from public, anon;
grant execute on function public.holds_live_government_membership_of(uuid) to authenticated, service_role;

comment on function public.holds_live_government_membership_of(uuid) is
  'R3-23c (0026): the caller holds a verified, unrevoked membership of this entity, whatever the entity''s verification state. Gates a submitter''s read of their own submissions after a withdrawal; a revoked member reads nothing.';

create policy regulatory_submissions_select_own_submitted on public.regulatory_submissions
  for select to authenticated
  using (
    submitted_by_government_user_id = public.current_government_user_id()
    and public.holds_live_government_membership_of(entity_id)
  );

drop policy if exists regulatory_submissions_withdraw_own on public.regulatory_submissions;

create policy regulatory_submissions_withdraw_own on public.regulatory_submissions
  for update to authenticated
  using (
    submitted_by_government_user_id = public.current_government_user_id()
    and public.is_verified_government_member_of(entity_id)
    and status = 'submitted'
    and withdrawn_at is null
  )
  with check (submitted_by_government_user_id = public.current_government_user_id());
