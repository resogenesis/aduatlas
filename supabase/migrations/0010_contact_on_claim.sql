-- =============================================================================
-- 0010 — Builder contact details are gated on the CLAIM, not on the plan
--
-- Phase 1 spec, decision 2d (2026-09-26): "An unclaimed listing's direct email
-- and phone are hidden from everyone, including a paying homeowner. A claimed
-- listing may show contact details to a paying homeowner through the existing
-- directory flow. An anonymous visitor never gains contact details, whether or
-- not the listing is claimed."
--
-- THE DEFECT THIS CLOSES (B14). builders_public, created in 0006 and recreated
-- in 0007, selected b.contact_email and b.contact_phone with no condition on
-- ownership. Every row in that view is an approved, active listing and the only
-- gate on the view is that the reader is a paid homeowner, so a $79 purchase
-- handed out the scraped email address and phone number of a company that had
-- never heard of ADUAtlas. The Arizona seed makes that concrete: 86 records,
-- every one of them unclaimed, every one of them carrying a real person's
-- direct contact details taken from the company's own website.
--
-- ADUAtlas may describe a company from public material. That is not the same as
-- publishing its inbox and phone line inside a paid product as though the
-- company had agreed to receive the traffic. Until somebody at the company
-- claims the listing, ADUAtlas passes a homeowner's message on by hand through
-- intro_requests and nothing routes around that.
--
-- WHAT CHANGES. One view, builders_public, the paid homeowner directory:
--
--   contact_email   null unless owner_user_id is not null
--   contact_phone   null unless owner_user_id is not null
--   claimed         appended: (owner_user_id is not null)
--
-- Nothing else moves. Same rows (approved, active, reader is a paid homeowner),
-- same column names, same types, same order, one column added at the end, so
-- CREATE OR REPLACE VIEW is legal and every existing reader keeps working.
--
-- WHY `claimed` IS ADDED HERE. Two reasons, both about not blurring states.
--   1. The homeowner surfaces have to be able to fail closed. The paid profile
--      page and the directory card decide what to render from the row in hand;
--      without an ownership flag they cannot tell an unclaimed listing from a
--      claimed one and would have to trust the view alone.
--   2. Decision 2e requires the four listing states to stay distinct wherever a
--      builder appears and the design supports it. builders_public_profile
--      already exposes `claimed` (0009) so the public profile can state where an
--      unclaimed record came from; the paid directory result needs the same fact
--      for the same reason.
-- `claimed` says that SOMEBODY owns the row, never who: no user id, no email,
-- no name, no claim code, no claim date. It is the same boolean 0009 settled on.
--
-- WHAT DOES NOT CHANGE.
--   • builders_public_profile (0007, 0009) has never carried contact_email or
--     contact_phone and still does not. An anonymous visitor gains nothing here.
--   • `verified` keeps its definition, verified_at is not null AND owner_user_id
--     is not null: the badge is "claimed and checked" (decision 2e), so a
--     listing whose account was removed stops reading as Verified.
--   • claim_code, claimed_at, verified_by, external_tracking_url,
--     relationship_type, owner_user_id, profile_status, admin_notes and
--     commercial_terms stay out of both views.
--   • No table, column, grant, policy, RPC, referral code or money changes. An
--     unclaimed listing still has no referral link, no dashboard, no analytics
--     access, no badge and no way to open a conversation (decision 2c).
--   • The admin console reads the builders table itself through the service
--     role, so Amy keeps every contact field she has to be able to maintain
--     (decision 2f). This file does not hide anything from the console.
--   • intro_requests is untouched. The homeowner still starts every
--     conversation, and an introduction against an unclaimed listing is still
--     ADUAtlas passing a message on by hand.
-- =============================================================================

-- =============================================================================
-- builders_public: the paid homeowner directory, with contact details gated on
-- the claim and ownership stated outright.
-- =============================================================================
create or replace view public.builders_public as
  select
    b.id, b.slug, b.name, b.description, b.logo_path, b.website, b.external_link,
    -- Decision 2d. A paying homeowner is not the gate; the claim is. The column
    -- keeps its name, type and position, so this is a legal replace.
    case when b.owner_user_id is not null then b.contact_email end as contact_email,
    case when b.owner_user_id is not null then b.contact_phone end as contact_phone,
    b.state, b.city, b.cities, b.service_zips,
    b.service_states, b.specialties, b.service_types, b.build_approach,
    b.build_methods, b.turnkey, b.licensed_states, b.photos, b.videos,
    b.featured, b.created_at,
    (b.verified_at is not null and b.owner_user_id is not null) as verified,
    -- Appended last, so the replace stays legal and column order holds.
    (b.owner_user_id is not null) as claimed
  from public.builders b
  where b.profile_status = 'approved'
    and b.active
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid() and public.users_is_paid(u)
    );

comment on view public.builders_public is 'The paid homeowner directory. Directory columns only, approved and active listings only, readable only by a paid homeowner. contact_email and contact_phone are null unless a builder account owns the listing (decision 2d); `claimed` and `verified` are booleans about the listing, never about who owns it.';

-- Replacing a view keeps its privileges. Restated so this file stands alone if
-- the view is ever dropped and rebuilt from these migrations.
revoke all on public.builders_public from anon, authenticated;
grant select on public.builders_public to authenticated;

-- =============================================================================
-- What the durable suite (decision 2g) should assert about this file
--
--   1. An approved, active, UNCLAIMED listing read through builders_public by a
--      paid homeowner returns contact_email null and contact_phone null, while
--      the same row in public.builders still holds both values. Withheld in the
--      view, not deleted from the record.
--   2. The same listing, once owner_user_id is set, returns both values to the
--      same paid homeowner.
--   3. builders_public_profile returns no contact column at all, claimed or not,
--      to anon and to a signed-in homeowner.
--   4. An anonymous reader and a signed-in unpaid reader get no rows from
--      builders_public at all, before and after a claim.
--   5. `claimed` is true exactly when owner_user_id is not null, and clearing
--      owner_user_id turns it false again in both views.
--   6. `verified` requires verified_at AND owner_user_id, so clearing the owner
--      drops the badge even with verified_at set.
--   7. builders_public still exposes no claim_code, claimed_at, verified_by,
--      external_tracking_url, relationship_type, owner_user_id, profile_status,
--      admin_notes or commercial_terms column.
--   8. turnkey and build_approach come through null when the company never
--      stated them (0008), for a claimed and an unclaimed listing alike.
-- =============================================================================
