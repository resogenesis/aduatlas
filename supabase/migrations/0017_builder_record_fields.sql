-- =============================================================================
-- 0017 — The builder record fields 2f names and the table never had
--
-- Phase 1 spec, decision 2f: "Builder management covers company name, category,
-- ADU and product types, state, location and service area, website, phone and
-- email, turnkey, PRICING, RESIDENTIAL OR COMMERCIAL, description, media where
-- the profile supports it, affiliate tracking configuration, relationship type,
-- claimed status, verification status, the Verified on ADUAtlas state, and
-- FACTUAL PROVENANCE."
--
-- Three of those attributes had no column, so Amy had nowhere to put them and no
-- admin form could exist for them. Verified by grep before this file was written:
-- src/pages/admin/AdminBuilders.jsx mentions provenance or source 0 times,
-- pricing 0 times and residential or commercial 0 times.
--
-- PRICING IS NOT THE RECORDED TERMS. builders already carries
-- membership_price_cents ($49) and success_fee_cents ($500) from 0006. Those are
-- what a BUILDER PAYS ADUAtlas. This file records what a builder charges a
-- HOMEOWNER, which is a different fact about a different party, and the two must
-- never be read as one. Nothing below touches either recorded-terms column and no
-- money moves anywhere in this file.
--
-- WHY PROVENANCE MATTERS MOST. data/seed/builders-az.json already holds, for all
-- 96 researched companies, `research.pages_read` (every page of that company's own
-- site that was read for the record) and `research.attributes[field].stated` (a
-- field-by-field record of whether the company actually said the thing). There was
-- nowhere to put any of it, so scripts/seed-builders.mjs discarded the evidence at
-- import: the seed file's own loader_rules said "research and aduatlas_account are
-- provenance and must not be written" precisely BECAUSE no provenance column
-- existed. 2l already demands a source and a checked date for a regulatory fact
-- ("provenance is maintained so a claim cannot silently lose its source"). A
-- BUILDER fact had none, which is the weaker half of the same promise: the public
-- profile page describes a company in ADUAtlas's own words, and until now the
-- record could not say which page of whose website that description came from.
--
-- ── THE SIX COLUMNS ─────────────────────────────────────────────────────────
--
--   source_urls        text[] not null default '{}'
--                      The pages of the COMPANY'S OWN site a fact came from.
--                      Empty is the honest starting state: no source recorded,
--                      which is not a claim that none exists.
--   sources_checked_on date
--                      When ADUAtlas last looked at them. Null = never recorded.
--   pricing_note       text
--                      What the company ITSELF publishes about price. Null = not
--                      established.
--   pricing_source_url text
--                      Where that pricing claim came from.
--   serves_residential boolean   NULLABLE TRI-STATE: true / false / null
--   serves_commercial  boolean   NULLABLE TRI-STATE: true / false / null
--
-- ── UNKNOWN MEANS UNKNOWN (2b) IS THE HARD CONSTRAINT HERE ──────────────────
--
-- THE TRI-STATES ARE NOT TWO BOOLEANS DEFAULTING TO FALSE. "We do not know" and
-- "they told us no" are different facts and the record must be able to tell them
-- apart. A `not null default false` here would manufacture a claim about every
-- company in the directory — "this company does not build residential" printed
-- against 96 businesses none of which said so — which is exactly the defect 0008
-- had to undo for turnkey (`not null default false`, so every seeded listing said
-- it does not take a project end to end) and build_approach (`not null default
-- 'both'`, so every seeded listing claimed the broadest capability of the three).
-- That correction cost a data migration and nulled a column across the table. The
-- cheapest possible time to get a tri-state right is the migration that creates
-- it, so both columns arrive nullable, with NO DEFAULT, and null means one thing
-- only: the company never stated it.
--
-- PRICING IS RECORDED ONLY WHERE THE COMPANY ESTABLISHED IT. Never derived, never
-- estimated, never inferred from a build method or a square-foot rule of thumb. If
-- nothing is known the attribute is ABSENT — not 0, not "contact for pricing", not
-- an empty string, each of which is a manufactured answer wearing the clothes of a
-- missing one. That is why pricing_note refuses a blank below: a form that posts
-- an empty field must leave the attribute unestablished, and a non-null column
-- holding '' would render as a price nobody quoted. Two Arizona records describe
-- companies whose sites MENTION pricing ("the site lists plan pricing") without
-- stating any; that is not an established price and this file's loader change does
-- not record one.
--
-- AMY IS NEVER FORCED TO FILL A FIELD BECAUSE IT EXISTS (2f). Six nullable or
-- empty-defaulted columns, no NOT NULL among the five that carry a fact, and no
-- constraint that requires one of them to be present before another can be. A new
-- builder starts unknown on all three attributes and stays that way until somebody
-- establishes something.
--
-- ── ARE ANY OF THESE PUBLIC? NO, NOT IN THIS PASS. THE REASONING, IN FULL ───
--
-- This file creates no view, replaces no view, changes no accessor and grants
-- nothing. All six columns are SERVICE-ROLE WRITABLE AND SERVICE-ROLE READABLE
-- ONLY, exactly like every other builders column since 0006, and they reach the
-- anonymous profile, the paid directory, the featured teaser and the signed-in
-- free account's read of builders_public_profile not at all. That last surface is
-- easy to forget and is named deliberately: 0015 revoked anon's grant on that view
-- and kept the `authenticated` one on purpose, so a column added there is
-- published to every signed-in account without a crawler ever seeing it.
-- Withholding all six is a decision, not an omission, so here is the argument.
--
--   1. 2a's public list is CLOSED, and these are not on it. "A public profile may
--      show the company name, city and state and service area, builder category
--      and type, ADU types where the company's own material supports them, a short
--      description, imagery only where we have permission, the website where
--      appropriate, and a call to action into ADUAtlas." Price, residential or
--      commercial capability and a research trail appear nowhere in that sentence,
--      and the next one reserves "richer builder information" for THE PAID
--      ACCOUNT. 0015 spent a whole migration narrowing the anonymous surface to
--      exactly that list after the search-readiness audit found the entire
--      directory anonymously browsable. Widening it again in the same phase, for
--      columns no page renders yet, would undo that work by accident.
--
--   2. 2d's sentence about pricing and residential or commercial is about WHICH
--      LISTINGS may carry a fact, not about WHICH AUDIENCE sees it. Its subject is
--      stated in its first line: "Builder contact details are gated on the CLAIM,
--      not on the plan." It then says an unclaimed listing "may still carry
--      everything ADUAtlas can independently source and has established", which
--      answers the objection that an unclaimed company's record must stay thin —
--      the surfaces it describes are the ones it names, "a paying homeowner
--      through the existing directory flow" and an anonymous visitor who "never
--      gains contact details". Read as a grant of new anonymous columns it would
--      silently overrule 2a's closed list, which it never claims to do.
--
--   3. ADDING A COLUMN TO A PUBLIC VIEW IS A DECISION WITH A PLACE WHERE IT GETS
--      MADE. 130_view_column_boundary.sql pins the whole column list of both
--      builders_public_profile and builders_public for exactly this reason, in its
--      own words: "A list of absences passes when a column nobody
--      thought of is added; a pinned list fails on any addition and forces a human
--      to decide whether the new column is another `claimed` or another B14."
--      The gap 2f names is that AMY HAS NOWHERE TO PUT THESE FACTS. That gap is
--      closed by the six columns and her editor. Publishing them is a separate,
--      reversible decision that belongs at that pinned list, with a renderer that
--      knows how to omit an unknown, and with Richard's sign-off on what a public
--      page says about a company's prices.
--
--   4. source_urls and sources_checked_on are ADUAtlas's OWN RESEARCH TRAIL, which
--      is closer to the "internal verification data" 2a explicitly keeps off a
--      public profile than to a fact about the company. The public page's
--      provenance duty under 2a is already discharged by 0009: `claimed` plus the
--      company's own website link let the page say the record was compiled by
--      ADUAtlas from public information and imply no relationship. The builder-side
--      analogue is government_entities.source_url, which 0015 deliberately keeps
--      out of the public entity view because it is the evidence Amy judges a record
--      WITH. Same reasoning, same answer.
--
--   5. THE 0008 LESSON POINTS THE SAME WAY. "A view that turns unknown into an
--      answer is how 'No. Ask this builder about the scope they take on' got
--      printed about companies that never said so." On the day a tri-state is
--      created, the configuration that cannot possibly reproduce that defect is the
--      one where no public renderer can read the column at all. When one of these
--      does go public, the null must pass through as null so the page can OMIT the
--      attribute, and the view change, the renderer and the 130 expectation belong
--      in the same commit, reviewed together.
--
-- WHAT THIS MEANS IN PRACTICE, said plainly so nobody has to infer it: Amy's admin
-- console reads and writes all six with the service role (api/admin/_builders.js
-- already selects the whole row for her list), the builder portal and every
-- homeowner surface see none of them, and 230_builder_record_fields.sql asserts
-- that rule IN BOTH DIRECTIONS — the values are on the record, and they are on no
-- anon or paid-homeowner surface.
--
-- ONE READER GETS THEM THAT IS WORTH NAMING. my_builder() and save_my_builder()
-- return `public.builders` as a rowtype, so the six ride along to THE ACCOUNT THAT
-- OWNS THAT LISTING, the way every column added to this table since 0006 has. That
-- is deliberate: it is ADUAtlas's record about that company, shown to that company,
-- and it is the opposite of a leak — a builder who disagrees with a recorded price
-- or capability can see it. It stays UNWRITABLE there, because save_my_builder
-- updates a closed column list and this file does not extend it: 2f puts these
-- three attributes in Amy's hands, so a builder's own answer arrives by asking her,
-- not by patching. 230 proves both halves of that.
--
-- ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
--   • No view, no policy, no grant, no RPC, no trigger, no index, no money.
--   • No fourth attribute. 2f's list is the scope; "does this company serve
--     residential or commercial" is one question asked twice, not an invitation to
--     model service lines.
--   • No loader change beyond provenance. scripts/seed-builders.mjs now maps
--     research.pages_read into source_urls and research.collected into
--     sources_checked_on — the evidence for 96 companies that was being discarded
--     at import because there was nowhere to put it — and it REFUSES to write the
--     other four columns at all, saying so out loud when a research file states
--     one. Source URLs are merged rather than replaced, so a source an admin
--     recorded by hand survives a re-run (2l: a claim must not silently lose its
--     source), and sources_checked_on only ever moves forward.
--   • No backfill, and no inference. Not one Arizona record establishes a price or
--     a residential/commercial answer, so every seeded row keeps null on all three
--     attributes. 0008 had to null a column across the table because a default had
--     already manufactured answers; there is nothing here to correct, and
--     manufacturing values from `description` text or from build_methods is the
--     exact mistake the seed file's own unknown_rule records and forbids ("Do not
--     re-derive it from build_methods").
--   • No monotonicity trigger on sources_checked_on, and the asymmetry with 0016 is
--     on purpose. invited_at is a FIRST-contact fact, so 0016 makes the first write
--     win and a later caller cannot move it. sources_checked_on is a LATEST-
--     observation fact: it is supposed to move forward every time ADUAtlas looks
--     again, and Amy has to be able to correct a date she mistyped. A guard that
--     refused a smaller value would block the correction while protecting nothing —
--     the fact is "when did we last look", and the person maintaining the record is
--     the authority on it. The seed loader still refuses to move it backwards,
--     because a re-run of an OLD research file is not a fresh look.
-- =============================================================================

-- ── the six columns ─────────────────────────────────────────────────────────
alter table public.builders
  -- Provenance. text[] not null default '{}' matches every other array on this
  -- table (cities, specialties, photos), and an empty array is "no source
  -- recorded", never "this fact has no source".
  add column source_urls        text[] not null default '{}',
  add column sources_checked_on date,
  add column pricing_note       text
        check (pricing_note is null or btrim(pricing_note) <> ''),
  -- Same rule as external_tracking_url (0007): rendered as an href in the admin
  -- console, so it must be an absolute http(s) URL.
  add column pricing_source_url text
        check (pricing_source_url is null or pricing_source_url ~* '^https?://'),
  -- NULLABLE, NO DEFAULT. See "the tri-states are not two booleans" above.
  add column serves_residential boolean,
  add column serves_commercial  boolean;

-- Every entry is an absolute http(s) URL, and no entry is null or blank.
--
-- Postgres allows no subquery in a check constraint, so the per-element rule is
-- expressed on the joined array: a URL may not contain whitespace, which makes a
-- single space an unambiguous separator, so the joined string is a sequence of
-- whitespace-free http(s) tokens or it is empty. array_to_string drops nulls and
-- flattens '' to nothing, so neither would be caught by the regex alone; the first
-- two terms catch them. There is no cardinality cap: evidence is not rationed, and
-- a company whose site took nine pages to read is not a data-quality problem.
alter table public.builders
  add constraint builders_source_urls_are_links
  check (
    source_urls = array_remove(source_urls, null)
    and '' <> all (source_urls)
    and array_to_string(source_urls, ' ') ~ '^(https?://[^[:space:]]+([[:space:]]https?://[^[:space:]]+)*)?$'
  );

comment on column public.builders.source_urls is
  'FACTUAL PROVENANCE (2f): the pages of the COMPANY''S OWN site the facts in this record came from, as absolute http(s) URLs. Every entry is evidence somebody can check. Empty means no source has been recorded — the honest starting state, and never a claim that this record has no source. ADUAtlas''s own research trail, so it is service-role only and appears on no public or paid homeowner surface; the public page states provenance the way 0009 defined it, through `claimed` and the company''s own website link.';

comment on column public.builders.sources_checked_on is
  'When ADUAtlas last looked at source_urls. Null means never recorded, which is not the same as "checked and found nothing" (2b). A LATEST-observation date, deliberately unlike builders.invited_at: it moves forward every time the sources are read again, and an admin may correct it. It is not an effective date, not a verification, and not a claim that anything on those pages is still true today — 2m''s warning that "verified January 2025" and "effective January 2026" mean completely different things applies here as much as to a regulatory rule.';

comment on column public.builders.pricing_note is
  'What the COMPANY ITSELF publishes about what it charges a HOMEOWNER, in its own terms, recorded only where the company established it. Never derived, never estimated, never inferred from a build method. Null means not established, and the interface omits the attribute (2b): absent is the answer, never 0 and never "contact for pricing". A blank string is refused by check constraint, because a non-null empty value would render as a price nobody quoted. This is NOT membership_price_cents or success_fee_cents (0006) — those are ADUAtlas''s recorded terms for what a BUILDER pays ADUAtlas, and confusing the two would print ADUAtlas''s own fee as the company''s price.';

comment on column public.builders.pricing_source_url is
  'Where the pricing_note claim came from: the company''s own page that stated it, as an absolute http(s) URL. Kept beside the claim so a recorded price cannot silently lose its source (the builder-side reading of 2l''s source standard). Null means no source recorded.';

comment on column public.builders.serves_residential is
  'Does this company serve RESIDENTIAL work, as the company itself stated it. THREE STATES, and NULL IS NOT FALSE: true = the company said yes, false = THE COMPANY SAID NO, null = THE COMPANY NEVER STATED IT, so the interface omits the attribute entirely (2b). The column is nullable with no default for exactly this reason. A `not null default false` would record "does not serve residential" against every company ADUAtlas seeds, which is a claim nobody made — the defect 0008 had to undo for turnkey across the whole table. A residential-only filter matches true and nothing else: unknown is not a match, and neither is No.';

comment on column public.builders.serves_commercial is
  'Does this company serve COMMERCIAL work, as the company itself stated it. Same three states and the same rule as serves_residential: true = yes, false = the company said no, null = never stated, so the attribute is omitted (2b). The two columns are independent — a company that stated residential said nothing about commercial by doing so, and an answer to one may never be inferred from the other.';

-- =============================================================================
-- What the durable suite (decision 2g) asserts about this file
-- — supabase/tests/invariants/230_builder_record_fields.sql
--
--   1. All six columns exist with the intended type, and each one's default is
--      UNKNOWN: '{}' for source_urls, nothing at all for the other five. The two
--      tri-states are nullable with no default, asserted as the shape of the
--      column and not just as the value of a row.
--   2. The service role CAN write and read back every one of them. This is the
--      positive control and it opens every group: a refusal and a crashed query
--      look identical, and six columns nobody can write would make almost every
--      denial in the file pass while Amy still had nowhere to put a price.
--   3. The tri-states accept true, false AND null, and null is DISTINGUISHABLE
--      from false by query: `= false` does not match the unknown row, `is null`
--      does not match the No row, and a capability filter matches only true.
--   4. A newly created builder starts unknown on all three attributes.
--   5. Pricing records only what somebody established: a blank pricing_note is
--      refused, a non-http pricing_source_url is refused, and a new listing has
--      no price rather than a zero or a placeholder.
--   6. source_urls holds links or nothing: a null entry, a blank entry and a
--      non-http entry are each refused, and an empty array is accepted.
--   7. No client role writes any of the six — not a builder account (including on
--      the listing it owns), not a paying homeowner, not anon — and
--      save_my_builder ignores all six keys rather than becoming a side door.
--   8. THE PUBLIC-SURFACE RULE IN BOTH DIRECTIONS. No relation anon can read
--      carries any of the six, neither get_public_builder's return signature nor
--      get_featured_builders' does, the anonymous payload contains none of the
--      recorded VALUES, and the paid directory exposes none of the six to a paying
--      homeowner — while the service role reads every one of them back off the
--      record, so the rule is "withheld from those surfaces", not "not stored".
-- =============================================================================
