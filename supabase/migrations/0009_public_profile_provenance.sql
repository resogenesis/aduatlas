-- =============================================================================
-- 0009 — Provenance on the public builder profile
--
-- Phase 1 spec, decision 2a: "An unclaimed public profile must carry no
-- implication that the company has partnered with, endorsed or joined
-- ADUAtlas. It is a listing ADUAtlas compiled from public information, and it
-- must read that way."
--
-- The public page could not read that way, because it could not tell the two
-- kinds of listing apart. builders_public_profile (0007) exposes `verified`,
-- which is claimed AND checked, and a listing can be claimed for days before
-- verification finishes. Absent any other signal the page treated every
-- listing as a participant: it closed with "Work with <company> through
-- ADUAtlas" and printed ADUAtlas's own research prose under "About <company>".
--
-- This adds ONE boolean to the view: claimed. A builder account owns the row.
--
--   claimed = false  ADUAtlas seeded the listing from the company's own public
--                    material. Nobody at the company has agreed to anything.
--                    The page states where the record came from, attributes the
--                    description to ADUAtlas, and implies no relationship.
--   claimed = true   A builder account has taken the row over. Today's wording
--                    stands.
--
-- What `claimed` is NOT:
--   • It is not `verified`. Claimed is ownership; Verified is ownership plus the
--     business check, and it stays the only badge (decision 10, never
--     "Certified").
--   • It is not the owner. No user id, email, name, claim code, claim date or
--     verification internal joins the view. The boolean says that someone
--     claimed the listing, never who.
--   • It is not new information. The same fact is already visible through the
--     view's imagery rule (logo_path and photos are exposed only for a claimed
--     listing) and through `verified`. This makes it legible instead of
--     something the page has to infer.
--
-- Not a privacy step backwards: decision 2a wants a visitor to know a listing
-- is unclaimed. Withholding it is what misleads.
--
-- Same rows (active and approved), same column order, one column appended, so
-- create-or-replace is legal and every existing reader is unaffected. Nothing
-- else changes: no new table, no new grant, no money, no tracking. An unclaimed
-- listing still has no referral link, no dashboard, no analytics access, no
-- badge and no ability to start a conversation (decision 2c); this file only
-- lets the page say so.
-- =============================================================================

create or replace view public.builders_public_profile as
  select
    b.id, b.slug, b.name, b.description,
    b.state, b.city, b.cities, b.service_states,
    b.specialties, b.service_types, b.build_methods, b.build_approach,
    b.turnkey, b.licensed_states, b.website,
    (b.verified_at is not null and b.owner_user_id is not null) as verified,
    case when b.owner_user_id is not null then b.logo_path end             as logo_path,
    case when b.owner_user_id is not null then b.photos else '{}'::text[] end as photos,
    -- Appended last, so the replace is a legal add and column order holds.
    (b.owner_user_id is not null) as claimed
  from public.builders b
  where b.active
    and b.profile_status = 'approved';

comment on view public.builders_public_profile is 'The public builder profile page. Anon-safe: no contact details, no commercial or internal fields, imagery only for a claimed listing, and `claimed` so the page can state where an unclaimed listing came from.';

-- Replacing a view keeps its privileges; restated so the file stands alone if
-- the view is ever dropped and rebuilt from these migrations.
revoke all on public.builders_public_profile from anon, authenticated;
grant select on public.builders_public_profile to anon, authenticated;

-- =============================================================================
-- Notes
--   • src/lib/builders.js adds "claimed" to PUBLIC_PROFILE_COLUMNS, and
--     src/pages/BuilderProfile.jsx reads it. The page treats an explicit false
--     as "unclaimed" and anything else as "not known", so a database that has
--     not applied this file yet never asserts that a company failed to claim a
--     listing it may in fact own.
--   • builders_public (the paid homeowner directory) is untouched: no `claimed`
--     column, no change to what a paid homeowner sees.
--   • The homeowner still always initiates contact, and an introduction request
--     against an unclaimed listing is still ADUAtlas passing a message on by
--     hand, not a conversation the company joined.
-- =============================================================================
