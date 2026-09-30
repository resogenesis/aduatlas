-- =============================================================================
-- 0025_paid_directory_actions.sql
--
-- SECURITY EXCEPTION UNDER PHASE_1.md 2t, found at the RC4 staging rehearsal
-- (T4-02). 2t freezes the schema except for an actual correctness or security
-- defect, and this is one: supabase/tests/invariants/300_paid_directory_actions
-- .sql fails against the chain without this file. Nothing here adds product
-- scope, a plan, a price or a table.
--
-- THE DEFECT. Decision 2a: "The paid account keeps search, filters, saving,
-- richer builder information, recommendations, messaging and introductions."
-- Messaging holds that line in the database (0011, can_start_builder_
-- conversation). Saving a builder and requesting an introduction did not:
--
--   saved_builders_own          (0004)  for all, user_id = the caller
--   intro_requests_insert_own   (0004)  user_id = the caller and status 'requested'
--
-- Neither asked whether the caller holds a plan, so any signed-in account,
-- free, refunded or a builder's, could save builders and file introduction
-- requests through the API, and only the page's paywall said otherwise. The
-- principle (2n) is that authorization lives on the server.
--
-- THE FIX. One predicate, the same one messaging uses: a HOMEOWNER account
-- holding a live paid entitlement (users_is_paid: paid and not refunded), any
-- plan, bought or sponsored. It gates the two WRITES only:
--
--   saved_builders   INSERT needs the predicate. SELECT and DELETE stay on the
--                    caller's own rows, so a refunded homeowner can still see
--                    and clear what they saved, and nothing already saved is
--                    touched.
--   intro_requests   INSERT needs the predicate. SELECT is unchanged (0004).
--
-- No existing row is deleted or rewritten. What the page offers is unchanged:
-- the find-a-builder pages already show saving and introductions only on the
-- paid directory; this makes that the database's rule too.
-- =============================================================================

create or replace function public.has_paid_directory_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.users u
     where u.id = public.current_app_user_id()
       and u.role = 'homeowner'
       and public.users_is_paid(u)
  );
$$;

revoke all on function public.has_paid_directory_access() from public, anon;
grant execute on function public.has_paid_directory_access() to authenticated, service_role;

comment on function public.has_paid_directory_access() is
  'Decision 2a (0025, T4-02): true only for a homeowner account holding a live paid plan, bought or sponsored, on the requesting account. The same rule as can_start_builder_conversation() (0011). Gates saving a builder and requesting an introduction. Takes no arguments so no client value can influence it.';

-- ── saved_builders: split the FOR ALL policy so only INSERT needs a plan ─────
drop policy if exists saved_builders_own on public.saved_builders;

create policy saved_builders_select_own on public.saved_builders
  for select to authenticated
  using (user_id = public.current_app_user_id());

create policy saved_builders_delete_own on public.saved_builders
  for delete to authenticated
  using (user_id = public.current_app_user_id());

create policy saved_builders_insert_paid on public.saved_builders
  for insert to authenticated
  with check (user_id = public.current_app_user_id() and public.has_paid_directory_access());

-- ── intro_requests: the insert needs a plan ─────────────────────────────────
drop policy if exists intro_requests_insert_own on public.intro_requests;

create policy intro_requests_insert_paid on public.intro_requests
  for insert to authenticated
  with check (user_id = public.current_app_user_id() and status = 'requested' and public.has_paid_directory_access());
