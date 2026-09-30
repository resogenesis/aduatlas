-- =============================================================================
-- 0012 — ADU Rules and Resources: the nationwide regulatory database (2l) and
--        the government participation layer (2m). Phase 1, fifth pass.
--        Applied after 0011.
--
-- This file is long because the feature is designed, not improvised. Read the
-- five rules below before changing anything in it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- RULE 1. AUTHORITY IS EXPLICIT, NEVER GEOGRAPHIC.
--
--   public.jurisdictions is a geographic tree: country → state → county →
--   municipality. That tree is GEOGRAPHY AND DISPLAY. It is never permission.
--
--   Permission is a row in public.government_jurisdiction_grants: this entity,
--   that jurisdiction record, granted by a named person, for a recorded reason.
--   A verified State of Arizona account gains NOTHING over the Phoenix record.
--   A verified City of Phoenix account gains NOTHING over Arizona's rules or
--   over Tempe's. A county gains nothing over its cities. An entity does not
--   even reach ITS OWN jurisdiction record without a grant row: claiming, being
--   verified and being granted a scope are three separate acts, in that order,
--   and verification confers no scope at all.
--
--   This is the single property most likely to be got wrong, because
--   containment is one join away: jurisdictions.parent_id is right there. So:
--   NO policy, NO authority function and NO trigger in this file reads
--   parent_id. The only parent walk in the file is
--   public.jurisdiction_ancestors(), which is display-only, is called from a
--   display-only view, and must never appear in a policy. That is checkable:
--
--     select count(*) from pg_policies
--      where schemaname = 'public'
--        and (coalesce(qual,'') || coalesce(with_check,'')) like '%ancestor%';
--     -- must be 0
--
--     select count(*) from pg_policies
--      where schemaname = 'public'
--        and (coalesce(qual,'') || coalesce(with_check,'')) like '%parent_id%';
--     -- must be 0
--
-- RULE 2. A LOGIN IS NEVER SYNONYMOUS WITH A GOVERNMENT. Three tables, not one:
--   government_entities (the institution), government_users (a person) and
--   government_memberships (the join, carrying role, status, verified and
--   revoked dates). People leave; the institution does not change when they do.
--
-- RULE 3. EVERY FIELD IS ONE OF THREE STATES, NEVER BLURRED:
--   verified_from_source · source_did_not_state · not_yet_researched.
--   See the header of PART 2 for how the third one is represented and why it is
--   queryable rather than implied.
--
-- RULE 4. FOUR DATES, FOUR COLUMNS, NEVER COLLAPSED. "Verified January 2025"
--   and "effective January 2026" mean opposite things. See PART 5.
--
-- RULE 5. SUBMIT → REVIEW → PUBLISH, AND HISTORY IS NEVER OVERWRITTEN.
--   A verified member SUBMITS into public.regulatory_submissions. Amy reviews.
--   ADUAtlas publishes into public.regulatory_provisions. Both rows survive,
--   because a state agency may legitimately assert that a city ordinance
--   conflicts with state law and the product must be able to show the
--   disagreement instead of silently deciding which row disappears.
--   Verification is identity, not a publishing right, and not legal
--   correctness.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HOW 2l's FIELD LIST MAPS ONTO 2m's STRUCTURE
--
-- 2l lists the fields a jurisdiction record holds (max ADU size, setbacks,
-- parking, owner occupancy, permit URL, planning department, phone …). 2m then
-- forbids storing them as one row: "REGULATORY PROVISION: an INDIVIDUAL sourced
-- rule, never a blob" and "GOVERNMENT RESOURCE: an official link or contact,
-- first class alongside rules". So every field in 2l's list lands in exactly one
-- of three places, and 2m wins where they differ:
--
--   state / county / city / official name / slug   → public.jurisdictions
--   ADU allowed, sizes, lot, setbacks, height,
--   parking, owner occupancy, restrictions         → public.regulatory_provisions
--                                                    (one row per topic, each
--                                                     with its own source and
--                                                     its own four dates)
--   planning/zoning URL, ADU page, permit URL,
--   zoning map, department name, phone, email      → public.government_resources
--   "last verified date" (one field)               → REJECTED. It became four
--                                                    dates; see PART 5.
--   "a verification or status field" (one field)   → became three orthogonal
--                                                    ones: field_state (what we
--                                                    know), review_status (where
--                                                    it is in our workflow) and
--                                                    verification_status (who
--                                                    checked it).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE ACCESS MATRIX THIS FILE IMPLEMENTS
--
--   anon              published regulatory data through the _public views only.
--                     No table grant of any kind. Never a draft, never a
--                     submission, never an internal note.
--   homeowner         EXACTLY anonymous, plus nothing. The paid plan buys
--                     course, worksheets, builders and property work; it buys no
--                     regulatory power. Table selects return zero rows.
--   government member reads and submits ONLY for jurisdictions their entity holds
--                     an explicit, unrevoked grant on, and only while their
--                     membership is verified and unrevoked. Revocation takes
--                     effect on the next statement. A claimed-but-unverified
--                     member reaches nothing but their own claim.
--   Amy (service key) the three of her five areas (2f) that this file covers:
--                     regulatory resources, government entity claims, and reviewing
--                     and publishing government submissions. Through the admin_*
--                     functions, which are granted to service_role alone.
--   nobody            may rewrite history. public.regulatory_record_versions and
--                     public.regulatory_audit_log take no INSERT, UPDATE or
--                     DELETE from anon, authenticated OR service_role. They are
--                     written only by the triggers in PART 8, which run as the
--                     table owner. A stolen service key can change what ADUAtlas
--                     publishes next; it cannot make the previous version or the
--                     audit row disappear through the API.
--
-- Nothing in this file bills anything. Government accounts are free and there is
-- no government billing (2m).
-- =============================================================================


-- =============================================================================
-- PART 0 — the two helpers the whole file leans on
-- =============================================================================

-- The three states of decision 2b applied to regulation, as ONE definition used
-- by both content tables, so the vocabulary cannot drift between them.
--
--   verified_from_source  ADUAtlas read an authoritative source and it states
--                         this. The value is present and the source is cited.
--   source_did_not_state  ADUAtlas read the authoritative source and it is
--                         SILENT on this point. This is knowledge, not absence:
--                         it costs a researcher the same work as a value, and it
--                         requires a source and a checked date.
--   not_yet_researched    ADUAtlas has not looked. No value, no source, no
--                         checked date, and never publishable.
create domain public.regulatory_field_state as text
  not null
  constraint regulatory_field_state_vocabulary
    check (value in ('verified_from_source', 'source_did_not_state', 'not_yet_researched'));

comment on domain public.regulatory_field_state is
  'Decision 2b applied to regulation. verified_from_source = a source states it. source_did_not_state = the source was read and is silent, which is knowledge and requires a source plus a checked date. not_yet_researched = ADUAtlas has not looked, and is never publishable. The three are never blurred and never inferred from one another.';

-- Who is writing? Used by the guard triggers to refuse a regulatory write that
-- did not come from ADUAtlas.
--
-- current_user is the role the statement is running as: 'anon' or
-- 'authenticated' for a browser request (PostgREST does SET LOCAL ROLE),
-- 'service_role' for the admin API and the webhook, and the migration owner for
-- a SECURITY DEFINER function or a psql session.
--
-- THE ONE HOLE, STATED PLAINLY: inside a SECURITY DEFINER function current_user
-- is that function's owner, so any definer function could write past this guard.
-- That is why the definer functions in this file are counted and named: the
-- claim RPC (which writes memberships and a claimed_at, never a verification),
-- the read-only context RPCs, the audit and version writers, and the admin_*
-- functions, which are granted to service_role alone. No definer function in
-- this file publishes on behalf of a caller who is not service_role.
create or replace function public.regulatory_writer_is_aduatlas()
returns boolean
language sql
stable
as $$
  select current_user not in ('anon', 'authenticated');
$$;

comment on function public.regulatory_writer_is_aduatlas() is
  'False for a browser request (anon/authenticated), true for service_role, the migration owner and SECURITY DEFINER bodies. The guard triggers use it so "only ADUAtlas publishes" is a database fact and not an API convention.';

revoke execute on function public.regulatory_writer_is_aduatlas() from public;
grant  execute on function public.regulatory_writer_is_aduatlas() to anon, authenticated, service_role;


-- =============================================================================
-- PART 1 — jurisdictions: the geographic tree, nationwide from day one
--
-- All fifty states are seeded BY THIS MIGRATION, so "nationwide" is a fact in
-- the database rather than a claim in marketing copy. Counties and
-- municipalities are added progressively, launch markets first.
--
-- parent_id is geography. It is used for breadcrumbs and for the rule stack a
-- homeowner sees (Arizona, Maricopa County and Phoenix as three DISTINCT sourced
-- answers, never merged into one invented answer). It is never used for
-- permission. See RULE 1 at the top of this file.
-- =============================================================================
create table public.jurisdictions (
  id                uuid primary key default gen_random_uuid(),

  -- country, state, federal_district (DC) and territory are the national level.
  -- county and municipality are the local levels. tribal and special_district
  -- exist because ADU authority genuinely sits with bodies that are neither a
  -- city nor a county, and inventing a row type later would mean a migration
  -- against live data.
  jurisdiction_type text not null
    check (jurisdiction_type in ('country', 'state', 'federal_district', 'territory',
                                 'county', 'municipality', 'tribal', 'special_district', 'other')),

  -- GEOGRAPHY AND DISPLAY ONLY. Never permission.
  parent_id         uuid references public.jurisdictions (id) on delete restrict,

  name              text not null,          -- 'Arizona', 'Maricopa County', 'Phoenix'
  official_name     text,                   -- 'State of Arizona', 'City of Phoenix'. Null = never established; 2b, do not invent one.
  slug              text not null
                      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- The canonical URL key is (state_code, slug), NOT path, because a city added
  -- before its county row exists is parented to the state and re-parented later;
  -- path changes then, and a URL must not.
  state_code        char(2)
                      check (state_code ~ '^[A-Z]{2}$'),

  -- Breadcrumb material: 'arizona', 'arizona/maricopa-county', 'arizona/maricopa-county/phoenix'.
  -- Derived from the IMMEDIATE parent by the trigger below. Display only.
  path              text not null,

  county_fips       text,
  place_fips        text,

  -- Null = ADUAtlas has not published a page for this jurisdiction. The _public
  -- views join on this, so an unpublished jurisdiction leaks nothing, including
  -- its provisions and resources.
  published_at      timestamptz,

  -- A jurisdiction-specific sentence for a page with little or nothing verified.
  -- The GENERIC sentence is product copy and lives in src/lib/regulatory.js, not
  -- here, so it is written once. Null is the normal case.
  research_note     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint jurisdictions_country_is_root
    check ((jurisdiction_type = 'country') = (parent_id is null)),
  -- A state-level row carries its own two-letter code; the local levels inherit
  -- it from their parent in the trigger below (one hop, geography, not authority).
  constraint jurisdictions_state_level_has_code
    check (jurisdiction_type not in ('state', 'federal_district') or state_code is not null)
);

-- Canonical page lookup. Covers the state rows too ('AZ','arizona'), which is
-- why a municipality may not take its own state's slug.
create unique index jurisdictions_state_slug_uidx on public.jurisdictions (state_code, slug);
create unique index jurisdictions_path_uidx       on public.jurisdictions (path);
create unique index jurisdictions_parent_slug_uidx on public.jurisdictions (parent_id, slug);
create index jurisdictions_parent_idx  on public.jurisdictions (parent_id);
create index jurisdictions_type_idx    on public.jurisdictions (jurisdiction_type);
create index jurisdictions_state_idx   on public.jurisdictions (state_code, jurisdiction_type);
create index jurisdictions_published_idx on public.jurisdictions (published_at) where published_at is not null;

comment on table public.jurisdictions is
  'The geographic tree (2m): country, state, county, municipality or other local authority. GEOGRAPHY AND DISPLAY, NEVER EDITING AUTHORITY. Permission lives in government_jurisdiction_grants and is granted against a specific row here.';
comment on column public.jurisdictions.parent_id is
  'Geographic containment, for breadcrumbs and for displaying state, county and city answers side by side. NEVER read by a policy, an authority function or a trigger. Authority is an explicit grant row, never inferred from containment.';
comment on column public.jurisdictions.published_at is
  'When ADUAtlas published a page for this jurisdiction. Null = not public; the _public views withhold the jurisdiction and everything hanging off it. Publication is not the same thing as indexability: see jurisdiction_coverage_public.is_indexable.';
comment on column public.jurisdictions.state_code is
  'Two-letter state code. Set explicitly on a state-level row and inherited from the immediate parent by jurisdictions_derive_placement(). Part of the canonical URL key (state_code, slug) and of search. Geography, not authority.';

-- ── path and state_code, derived from the IMMEDIATE parent ───────────────────
-- One hop, not a recursive walk, and deliberately not a policy input. A county
-- or city row therefore cannot be created in the wrong state by hand, and the
-- breadcrumb is always consistent with the tree.
create or replace function public.jurisdictions_derive_placement()
returns trigger
language plpgsql
as $$
declare
  p record;
begin
  if new.parent_id is null then
    new.path := new.slug;
    return new;
  end if;

  select jurisdiction_type, path, state_code into p
    from public.jurisdictions where id = new.parent_id;
  if p is null then
    raise exception 'parent jurisdiction % does not exist', new.parent_id;
  end if;

  -- Legal geography only. A state hangs off the country; a county off a state; a
  -- municipality off a state or a county (a city is added before its county row
  -- exists often enough that forbidding it would push data out of the product).
  if new.jurisdiction_type in ('state', 'federal_district', 'territory')
     and p.jurisdiction_type <> 'country' then
    raise exception 'a % must hang off the country row, not off a %',
      new.jurisdiction_type, p.jurisdiction_type;
  end if;
  if new.jurisdiction_type = 'county' and p.jurisdiction_type not in ('state', 'federal_district', 'territory') then
    raise exception 'a county must hang off a state, not off a %', p.jurisdiction_type;
  end if;
  if new.jurisdiction_type in ('municipality', 'tribal', 'special_district', 'other')
     and p.jurisdiction_type not in ('state', 'federal_district', 'territory', 'county') then
    raise exception 'a % must hang off a state or a county, not off a %',
      new.jurisdiction_type, p.jurisdiction_type;
  end if;

  if p.jurisdiction_type = 'country' then
    new.path := new.slug;                       -- states are the top of a URL
  else
    new.path := p.path || '/' || new.slug;
  end if;

  if new.jurisdiction_type not in ('state', 'federal_district', 'territory') then
    new.state_code := p.state_code;             -- geography, one hop
  end if;

  return new;
end;
$$;

create trigger jurisdictions_derive_placement
  before insert or update of parent_id, slug, jurisdiction_type on public.jurisdictions
  for each row execute function public.jurisdictions_derive_placement();

create trigger jurisdictions_set_updated_at
  before update on public.jurisdictions
  for each row execute function public.set_updated_at();

-- ── DISPLAY ONLY: the ancestor chain ────────────────────────────────────────
-- The one parent walk in this file. A homeowner looking at Phoenix must see
-- Arizona, Maricopa County and Phoenix as three distinct sourced answers, so the
-- product needs the chain. It is used by jurisdiction_rule_stack() below and by
-- nothing else.
--
-- IT MUST NEVER APPEAR IN A POLICY OR IN AN AUTHORITY FUNCTION. If it ever does,
-- authority has become geographic and the central guarantee of 2m is gone. The
-- two pg_policies queries at the top of this file are how that is checked.
create or replace function public.jurisdiction_ancestors(p_jurisdiction_id uuid)
returns table (id uuid, jurisdiction_type text, name text, official_name text,
               slug text, state_code char(2), path text, depth int)
language sql
stable
set search_path = public
as $$
  with recursive up as (
    select j.id, j.jurisdiction_type, j.name, j.official_name, j.slug,
           j.state_code, j.path, j.parent_id, 0 as depth
      from public.jurisdictions j
     where j.id = p_jurisdiction_id
    union all
    select j.id, j.jurisdiction_type, j.name, j.official_name, j.slug,
           j.state_code, j.path, j.parent_id, up.depth + 1
      from public.jurisdictions j
      join up on up.parent_id = j.id
  )
  select id, jurisdiction_type, name, official_name, slug, state_code, path, depth
    from up
   where jurisdiction_type <> 'country'
   order by depth desc;
$$;

comment on function public.jurisdiction_ancestors(uuid) is
  'DISPLAY ONLY. The geographic chain from the state down to this jurisdiction, so the product can show state, county and city answers side by side without merging them. Never referenced by a policy or by an authority function: authority is an explicit grant, never containment.';

grant execute on function public.jurisdiction_ancestors(uuid) to anon, authenticated, service_role;


-- ── the seed: the country row, all fifty states, and DC ─────────────────────
-- "Nationwide from day one" (decision 1, restated in 2l) is a STRUCTURAL claim,
-- and a structural claim belongs in the schema rather than in a backlog. Every
-- state page exists from the moment this migration runs, carries no fabricated
-- requirement, and reports its own coverage honestly through
-- jurisdiction_coverage_public.
--
-- official_name is the state's actual constitutional style. Four states are
-- Commonwealths (Kentucky, Massachusetts, Pennsylvania, Virginia) and calling
-- them States here would be a small fabrication in a file whose entire subject is
-- not fabricating things.
--
-- Territories are NOT seeded. The promise is fifty states; a territory row can be
-- added later with one insert and no schema change, and seeding empty territory
-- pages would be exactly the thin-page padding 2l forbids.
insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug, state_code, path, published_at)
values ('country', null, 'United States', 'United States of America', 'united-states', null, 'united-states', now());

insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug, state_code, published_at)
select s.kind,
       (select id from public.jurisdictions where jurisdiction_type = 'country'),
       s.name,
       s.official_name,
       s.slug,
       s.code,
       now()
  from (values
    ('state', 'AL', 'Alabama',        'State of Alabama',              'alabama'),
    ('state', 'AK', 'Alaska',         'State of Alaska',               'alaska'),
    ('state', 'AZ', 'Arizona',        'State of Arizona',              'arizona'),
    ('state', 'AR', 'Arkansas',       'State of Arkansas',             'arkansas'),
    ('state', 'CA', 'California',     'State of California',           'california'),
    ('state', 'CO', 'Colorado',       'State of Colorado',             'colorado'),
    ('state', 'CT', 'Connecticut',    'State of Connecticut',          'connecticut'),
    ('state', 'DE', 'Delaware',       'State of Delaware',             'delaware'),
    ('state', 'FL', 'Florida',        'State of Florida',              'florida'),
    ('state', 'GA', 'Georgia',        'State of Georgia',              'georgia'),
    ('state', 'HI', 'Hawaii',         'State of Hawaii',               'hawaii'),
    ('state', 'ID', 'Idaho',          'State of Idaho',                'idaho'),
    ('state', 'IL', 'Illinois',       'State of Illinois',             'illinois'),
    ('state', 'IN', 'Indiana',        'State of Indiana',              'indiana'),
    ('state', 'IA', 'Iowa',           'State of Iowa',                 'iowa'),
    ('state', 'KS', 'Kansas',         'State of Kansas',               'kansas'),
    ('state', 'KY', 'Kentucky',       'Commonwealth of Kentucky',      'kentucky'),
    ('state', 'LA', 'Louisiana',      'State of Louisiana',            'louisiana'),
    ('state', 'ME', 'Maine',          'State of Maine',                'maine'),
    ('state', 'MD', 'Maryland',       'State of Maryland',             'maryland'),
    ('state', 'MA', 'Massachusetts',  'Commonwealth of Massachusetts', 'massachusetts'),
    ('state', 'MI', 'Michigan',       'State of Michigan',             'michigan'),
    ('state', 'MN', 'Minnesota',      'State of Minnesota',            'minnesota'),
    ('state', 'MS', 'Mississippi',    'State of Mississippi',          'mississippi'),
    ('state', 'MO', 'Missouri',       'State of Missouri',             'missouri'),
    ('state', 'MT', 'Montana',        'State of Montana',              'montana'),
    ('state', 'NE', 'Nebraska',       'State of Nebraska',             'nebraska'),
    ('state', 'NV', 'Nevada',         'State of Nevada',               'nevada'),
    ('state', 'NH', 'New Hampshire',  'State of New Hampshire',        'new-hampshire'),
    ('state', 'NJ', 'New Jersey',     'State of New Jersey',           'new-jersey'),
    ('state', 'NM', 'New Mexico',     'State of New Mexico',           'new-mexico'),
    ('state', 'NY', 'New York',       'State of New York',             'new-york'),
    ('state', 'NC', 'North Carolina', 'State of North Carolina',       'north-carolina'),
    ('state', 'ND', 'North Dakota',   'State of North Dakota',         'north-dakota'),
    ('state', 'OH', 'Ohio',           'State of Ohio',                 'ohio'),
    ('state', 'OK', 'Oklahoma',       'State of Oklahoma',             'oklahoma'),
    ('state', 'OR', 'Oregon',         'State of Oregon',               'oregon'),
    ('state', 'PA', 'Pennsylvania',   'Commonwealth of Pennsylvania',  'pennsylvania'),
    ('state', 'RI', 'Rhode Island',   'State of Rhode Island',         'rhode-island'),
    ('state', 'SC', 'South Carolina', 'State of South Carolina',       'south-carolina'),
    ('state', 'SD', 'South Dakota',   'State of South Dakota',         'south-dakota'),
    ('state', 'TN', 'Tennessee',      'State of Tennessee',            'tennessee'),
    ('state', 'TX', 'Texas',          'State of Texas',                'texas'),
    ('state', 'UT', 'Utah',           'State of Utah',                 'utah'),
    ('state', 'VT', 'Vermont',        'State of Vermont',              'vermont'),
    ('state', 'VA', 'Virginia',       'Commonwealth of Virginia',      'virginia'),
    ('state', 'WA', 'Washington',     'State of Washington',           'washington'),
    ('state', 'WV', 'West Virginia',  'State of West Virginia',        'west-virginia'),
    ('state', 'WI', 'Wisconsin',      'State of Wisconsin',            'wisconsin'),
    ('state', 'WY', 'Wyoming',        'State of Wyoming',              'wyoming'),
    ('federal_district', 'DC', 'District of Columbia', 'District of Columbia', 'district-of-columbia')
  ) as s(kind, code, name, official_name, slug);


-- =============================================================================
-- PART 2 — the topic catalogue, and how "not yet researched" is QUERYABLE
--
-- THE PROBLEM. Decision 2l requires the product to distinguish three things and
-- never blur them: verified from a source, the source did not state it, and not
-- yet researched. The first two are properties of a row that exists. The third is
-- the ABSENCE of knowledge, and an absence cannot carry a status column.
--
-- THE CHOSEN REPRESENTATION. Provisions are one row per (jurisdiction, topic),
-- and this table enumerates every topic ADUAtlas claims to cover. So:
--
--   verified_from_source  a published provision row with field_state =
--                         'verified_from_source' and a value and a source.
--   source_did_not_state  a published provision row with field_state =
--                         'source_did_not_state', a source and a checked date,
--                         and NO value.
--   not_yet_researched    NO published provision row for that (jurisdiction,
--                         topic) pair. The catalogue is what makes this a
--                         QUERY rather than an implication: LEFT JOIN the
--                         catalogue against the published provisions and the
--                         missing pairs are the third state, by name, in SQL.
--                         public.jurisdiction_topic_coverage does exactly that
--                         and is the only place the third state is produced.
--
-- A 'not_yet_researched' provision row is also allowed, as a DRAFT research
-- to-do, and the coverage view folds it into the same third state. It may never
-- be published: a published record must say something ADUAtlas actually knows,
-- and "we have not looked" is already said by the absence.
--
-- Every topic is expected at every level. Deliberately no per-level filter: a
-- filter saying "setbacks are not expected at state level" would let coverage
-- look better than it is by declaring the gap irrelevant, which is the same
-- failure as fabricating a value.
-- =============================================================================
create table public.regulatory_topics (
  key           text primary key
                  check (key ~ '^[a-z0-9_]+$'),
  category      text not null
                  check (category in ('eligibility', 'size', 'siting', 'parking',
                                      'occupancy', 'process', 'fees', 'other')),
  label         text not null,       -- 'Maximum ADU size'
  question      text not null,       -- the plain-English question a homeowner is actually asking
  value_kind    text not null
                  check (value_kind in ('boolean', 'number', 'text', 'choice')),
  value_unit    text,                -- 'sq ft', 'ft', 'spaces'. Null for boolean/text.
  sort_order    int not null default 100,
  created_at    timestamptz not null default now()
);

comment on table public.regulatory_topics is
  'The enumerated topics a jurisdiction record can answer. Its purpose is not tidiness: LEFT JOINing it against the published provisions is what turns "not yet researched" into a queryable state instead of an implied one. Adding a topic widens the honest gap on every existing page, which is correct.';

insert into public.regulatory_topics (key, category, label, question, value_kind, value_unit, sort_order) values
  ('adu_allowed',              'eligibility', 'ADUs allowed',                 'Does this jurisdiction allow an ADU at all?',                              'boolean', null,      10),
  ('detached_allowed',         'eligibility', 'Detached ADU allowed',         'Is a detached ADU allowed?',                                               'boolean', null,      20),
  ('attached_allowed',         'eligibility', 'Attached ADU allowed',         'Is an ADU attached to the house allowed?',                                 'boolean', null,      30),
  ('conversion_allowed',       'eligibility', 'Garage or interior conversion','Can an existing garage or interior space be converted?',                    'boolean', null,      40),
  ('jadu_allowed',             'eligibility', 'Junior ADU allowed',           'Is a junior ADU (a bedroom-sized unit inside the house) allowed?',          'boolean', null,      50),
  ('number_allowed',           'eligibility', 'How many allowed',             'How many ADUs are allowed on one lot?',                                    'number',  'units',   60),
  ('zoning_districts',         'eligibility', 'Zoning districts',             'Which zoning districts allow an ADU?',                                     'text',    null,      70),
  ('max_size',                 'size',        'Maximum ADU size',             'How large can the ADU be?',                                                'number',  'sq ft',  100),
  ('max_size_share',           'size',        'Maximum share of the house',   'Is the ADU capped as a share of the primary house?',                       'number',  '%',      110),
  ('min_size',                 'size',        'Minimum ADU size',             'Is there a minimum size?',                                                 'number',  'sq ft',  120),
  ('min_lot_size',             'size',        'Minimum lot size',             'Is there a minimum lot size for an ADU?',                                  'number',  'sq ft',  130),
  ('max_lot_coverage',         'size',        'Maximum lot coverage',         'How much of the lot may be covered?',                                      'number',  '%',      140),
  ('height_limit',             'siting',      'Height limit',                 'How tall can the ADU be?',                                                 'number',  'ft',     200),
  ('stories_allowed',          'siting',      'Stories allowed',              'How many stories are allowed?',                                            'number',  'stories',210),
  ('setback_front',            'siting',      'Front setback',                'How far back from the front property line?',                               'number',  'ft',     220),
  ('setback_side',             'siting',      'Side setback',                 'How far from the side property lines?',                                     'number',  'ft',     230),
  ('setback_rear',             'siting',      'Rear setback',                 'How far from the rear property line?',                                      'number',  'ft',     240),
  ('separation_required',      'siting',      'Separation from the house',    'Must the ADU stand a distance from the primary house?',                     'number',  'ft',     250),
  ('parking_required',         'parking',     'Parking required',             'Does the ADU need its own parking space?',                                  'number',  'spaces', 300),
  ('parking_exemptions',       'parking',     'Parking exemptions',           'When is parking not required (transit, historic, permit district)?',        'text',    null,     310),
  ('owner_occupancy_required', 'occupancy',   'Owner occupancy required',     'Must the owner live on the property?',                                      'boolean', null,     400),
  ('short_term_rental_allowed','occupancy',   'Short-term rental allowed',    'May the ADU be rented short term?',                                        'boolean', null,     410),
  ('separate_sale_allowed',    'occupancy',   'Separate sale allowed',        'Can the ADU be sold separately from the house?',                            'boolean', null,     420),
  ('deed_restriction_required','occupancy',   'Deed restriction required',    'Is a recorded deed restriction or covenant required?',                      'boolean', null,     430),
  ('permit_type',              'process',     'Permit type',                  'Which permit or review applies, and is it by right?',                       'text',    null,     500),
  ('review_timeline',          'process',     'Review timeline',              'How long does the jurisdiction have to decide?',                            'number',  'days',   510),
  ('design_standards_apply',   'process',     'Design standards apply',       'Are there design or materials standards the ADU must meet?',                'boolean', null,     520),
  ('preapproved_plans',        'process',     'Pre-approved plans offered',   'Does the jurisdiction offer pre-approved ADU plans?',                       'boolean', null,     530),
  ('utility_connection',       'process',     'Utility connection',           'Is a separate water, sewer or electrical connection required?',             'text',    null,     540),
  ('fire_sprinklers_required', 'process',     'Fire sprinklers required',     'Are fire sprinklers required in the ADU?',                                  'boolean', null,     550),
  ('permit_fees',              'fees',        'Permit fees',                  'What does the permit cost?',                                               'text',    null,     600),
  ('impact_fees',              'fees',        'Impact or capacity fees',      'Are impact, capacity or connection fees charged?',                          'text',    null,     610),
  ('other_restrictions',       'other',       'Other restrictions',           'Anything else the jurisdiction requires that a homeowner must know?',       'text',    null,     900);


-- =============================================================================
-- PART 3 — the government participation layer: THREE things, never one
--
-- The mistake 2m exists to prevent is one login standing for an entire city. So
-- the institution, the person and the relationship between them are three tables:
--
--   government_entities      the institution. City of Phoenix. Arizona
--                            Department of Housing. It exists whether or not
--                            anybody from it has ever heard of ADUAtlas.
--   government_users         a person, who is an ORDINARY authenticated user.
--                            No new users.role value: a government person signs
--                            up the same way anybody does, and their government
--                            capability comes from a membership, never from a
--                            role on their account. A row here grants NOTHING
--                            by itself.
--   government_memberships   the join: user, entity, role, status, verified and
--                            revoked dates. Several people may represent one
--                            entity. People leave and are revoked without
--                            touching the entity.
--
-- THE THREE STATES (2m), computed in ONE place, public.government_entity_state():
--   unclaimed  ADUAtlas created the record from authoritative public sources.
--              NOTHING in the product may imply the government takes part.
--   claimed    a representative has claimed it; their authority is NOT verified.
--   verified   ADUAtlas confirmed the member is authorised to represent the
--              entity. IDENTITY ONLY. It never means ADUAtlas checked that the
--              information is legally correct.
--
-- CLAIMING NEVER PRODUCES VERIFICATION. The claim RPC in PART 11 writes
-- claimed_at and a pending membership and cannot write verification_status; the
-- guard trigger below refuses a verification written by a browser request even if
-- a future migration grants one by accident.
--
-- The badge is "Verified Government Account", shown with the entity name beneath
-- it. It is NEVER the builder badge "Verified on ADUAtlas" (2e). The strings live
-- in src/lib/regulatory.js so they are written once.
-- =============================================================================

create table public.government_entities (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,        -- 'City of Phoenix', 'State of California'
  entity_type         text not null
                        check (entity_type in ('city', 'county', 'state', 'state_agency',
                                               'regional', 'tribal', 'special_district', 'other')),
  -- The entity's own seat. GEOGRAPHY AND DISPLAY. Being the City of Phoenix entity
  -- does NOT confer authority over the Phoenix jurisdiction record: that takes a
  -- grant row in PART 4. This column is one join from containment and is the most
  -- tempting shortcut in the schema, which is why no policy reads it.
  jurisdiction_id     uuid not null references public.jurisdictions (id) on delete restrict,

  official_website_url text,
  -- Official government domains, e.g. {phoenix.gov, phoenixaz.gov}. Used to help
  -- Amy judge a claim (does this person's work email match?). It is EVIDENCE, not
  -- verification: a matching domain never verifies anybody automatically.
  official_domains    text[] not null default '{}',

  -- Where ADUAtlas got the entity record itself, so an unclaimed record can say
  -- honestly where it came from.
  source_url          text,

  -- Claimed: a representative has claimed the entity. Says nothing about whether
  -- their authority has been checked.
  claimed_at          timestamptz,
  claim_note          text,                 -- internal. Never in a _public view.

  -- Verified: ADUAtlas confirmed a member is authorised to represent the entity.
  verification_status text not null default 'unverified'
                        check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verified_at         timestamptz,
  verified_by_app_user_id uuid references public.users (id) on delete set null,
  verification_note   text,                 -- internal. Never in a _public view.

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Verification cannot exist without a claim, and cannot exist without a date.
  constraint government_entities_verified_needs_claim
    check (verification_status <> 'verified' or (claimed_at is not null and verified_at is not null)),
  constraint government_entities_verified_at_matches
    check ((verified_at is not null) = (verification_status = 'verified'))
);

create index government_entities_jurisdiction_idx on public.government_entities (jurisdiction_id);
create index government_entities_state_idx on public.government_entities (verification_status);

comment on table public.government_entities is
  'The institution (2m), not a login and not an account. A row exists for a city ADUAtlas has never spoken to; that is the UNCLAIMED state and nothing in the product may imply participation. Several people may represent one entity through government_memberships.';
comment on column public.government_entities.jurisdiction_id is
  'The entity''s own seat, for display and for Amy''s search. NEVER authority: the City of Phoenix entity cannot read or submit against the Phoenix jurisdiction record without an explicit row in government_jurisdiction_grants. No policy reads this column.';
comment on column public.government_entities.official_domains is
  'Official government domains, used as EVIDENCE when a claim is reviewed. A matching email domain never verifies anybody: verification is a person at ADUAtlas confirming the claimant is authorised to represent the entity.';
comment on column public.government_entities.claimed_at is
  'When a representative claimed this entity. CLAIMED, not verified. Claiming never produces verification (2m).';
comment on column public.government_entities.verification_status is
  'IDENTITY ONLY. verified means ADUAtlas confirmed a member is authorised to represent this entity. It never means ADUAtlas checked that the entity''s regulatory information is legally correct, and it is never the builder badge "Verified on ADUAtlas" (2e).';

-- ── the three states, computed in exactly one place ─────────────────────────
-- SECURITY DEFINER because government_entities_public calls it for an anonymous
-- visitor. A function called inside a view runs as the CALLER, not as the view's
-- owner, so without this the public surface would depend on anon holding a grant on
-- the base table — and the base table is where the internal claim and verification
-- notes live. Definer keeps the three states computed in one place AND keeps anon
-- off the table. It returns nothing the view does not already show.
create or replace function public.government_entity_state(p_entity_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when e.verification_status = 'verified' then 'verified'
           when e.claimed_at is not null           then 'claimed'
           else 'unclaimed'
         end
    from public.government_entities e
   where e.id = p_entity_id;
$$;

comment on function public.government_entity_state(uuid) is
  'The three states of 2m in one place: unclaimed, claimed, verified. No surface invents a fourth, and "claimed" never reads as "verified".';

grant execute on function public.government_entity_state(uuid) to anon, authenticated, service_role;

-- ── government_users: a person, and nothing more ────────────────────────────
create table public.government_users (
  id             uuid primary key default gen_random_uuid(),
  -- An ORDINARY authenticated user. One row per person, not per entity: the same
  -- person may represent two entities through two memberships.
  user_id        uuid not null unique references public.users (id) on delete cascade,
  full_name      text,
  job_title      text,
  -- The person's work email, kept here rather than on users.email because the
  -- account email may be personal and Amy judges a claim against this one.
  work_email     citext,
  phone          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.government_users is
  'A person who acts in a government capacity (2m). An ORDINARY authenticated user: no users.role value is added, because a login must never be synonymous with a government. It carries the government-specific details Amy judges a claim against (name, job title, work email), and it grants NOTHING at all: every capability comes from a verified membership plus an explicit jurisdiction grant.';

-- ── government_memberships: the join that carries the authority to be verified ─
create table public.government_memberships (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid not null references public.government_entities (id) on delete cascade,
  government_user_id    uuid not null references public.government_users (id) on delete cascade,

  -- viewer reads the entity's workspace and submits nothing. contributor submits.
  -- administrator additionally sees who else represents the entity. No role here
  -- publishes: publication is ADUAtlas's, never a member's (2m).
  membership_role       text not null default 'contributor'
                          check (membership_role in ('viewer', 'contributor', 'administrator')),

  -- pending  = claimed, authority NOT yet verified. Reaches nothing but its own claim.
  -- verified = ADUAtlas confirmed this person may represent this entity.
  -- revoked  = the person left, or the authority behind the login went away.
  -- rejected = Amy refused the claim.
  status                text not null default 'pending'
                          check (status in ('pending', 'verified', 'revoked', 'rejected')),

  requested_at          timestamptz not null default now(),
  request_note          text,
  verified_at           timestamptz,
  verified_by_app_user_id uuid references public.users (id) on delete set null,
  revoked_at            timestamptz,
  revoked_by_app_user_id  uuid references public.users (id) on delete set null,
  revoked_reason         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint government_memberships_status_dates check (
    case status
      when 'pending'  then verified_at is null     and revoked_at is null
      when 'verified' then verified_at is not null  and revoked_at is null
      when 'revoked'  then revoked_at  is not null
      when 'rejected' then verified_at is null
    end
  )
);

-- One live membership per person per entity. A revoked or rejected one stays as
-- history, which is the point of modelling membership at all: a person leaving is
-- a recorded event, not a deleted login.
create unique index government_memberships_live_uidx
  on public.government_memberships (entity_id, government_user_id)
  where status in ('pending', 'verified');

create index government_memberships_entity_idx on public.government_memberships (entity_id, status);
create index government_memberships_user_idx   on public.government_memberships (government_user_id, status);

comment on table public.government_memberships is
  'The join of 2m: user, entity, role, status, verified and revoked dates. Several people may represent one entity; one may be read-only while another submits; and revocation is a real event with a date rather than a deleted login, which is why "a revoked member loses access immediately" is testable.';
comment on column public.government_memberships.status is
  'pending = the entity is CLAIMED and this person''s authority is not verified: they reach nothing but their own claim. verified = ADUAtlas confirmed they may represent the entity. revoked = access ends on the next statement. Verification is identity, and it is not a publishing right.';


-- =============================================================================
-- PART 4 — EXPLICIT AUTHORITY. The heart of 2m.
--
-- "Permission is a stored grant against specific jurisdiction records. Delegated
-- authority, if ever wanted, is an explicit relationship, never inferred from
-- containment."
--
-- One row = one entity may work on one jurisdiction record. That is all. There is
-- no wildcard, no "and everything beneath it", and no derivation:
--
--   • The State of Arizona entity holding a grant on the Arizona record reaches
--     the Arizona record. Not Maricopa County. Not Phoenix. Not Tempe.
--   • Maricopa County holding a grant on the county record reaches the county
--     record. Not the cities inside it.
--   • The City of Phoenix entity whose jurisdiction_id IS Phoenix reaches
--     NOTHING until a grant row exists. Its own seat is not authority either:
--     government_entities.jurisdiction_id is edited freely in the admin console,
--     and if it were a permission input a corrected seat would silently move
--     authority. Verification says who somebody is; a grant says what they may
--     work on; the two are recorded separately because they are separate facts.
--   • Delegation is representable: if Arizona should one day speak for Phoenix,
--     Amy inserts a grant row for (Arizona entity, Phoenix jurisdiction) with the
--     reason recorded. That is an explicit relationship, which is exactly what
--     2m permits and what inference is not.
--
-- grant_basis is NOT NULL on purpose. Authority that nobody can explain is
-- authority nobody can audit.
-- =============================================================================
create table public.government_jurisdiction_grants (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid not null references public.government_entities (id) on delete cascade,
  -- EQUALITY, always. Never "is a descendant of".
  jurisdiction_id     uuid not null references public.jurisdictions (id) on delete restrict,

  -- A read-only grant is representable: an entity may be allowed to see what
  -- ADUAtlas has staged for a jurisdiction without being allowed to submit.
  may_submit          boolean not null default true,

  -- Why this entity may speak for this record. Free text, required, written by the
  -- person who granted it: 'the city clerk confirmed by phone on 2026-09-26 that
  -- J. Reyes is the planning department contact for ADU ordinances'.
  grant_basis         text not null check (length(btrim(grant_basis)) > 0),

  granted_at          timestamptz not null default now(),
  granted_by_app_user_id uuid references public.users (id) on delete set null,
  revoked_at          timestamptz,
  revoked_by_app_user_id uuid references public.users (id) on delete set null,
  revoked_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One live grant per (entity, jurisdiction). A revoked grant stays as history.
create unique index government_jurisdiction_grants_live_uidx
  on public.government_jurisdiction_grants (entity_id, jurisdiction_id)
  where revoked_at is null;

create index government_jurisdiction_grants_entity_idx on public.government_jurisdiction_grants (entity_id) where revoked_at is null;
create index government_jurisdiction_grants_jurisdiction_idx on public.government_jurisdiction_grants (jurisdiction_id) where revoked_at is null;

comment on table public.government_jurisdiction_grants is
  'THE ONLY SOURCE OF GOVERNMENT AUTHORITY (2m). One row = one entity may work on one jurisdiction record. No wildcard, no descendants, no inference from jurisdictions.parent_id or from government_entities.jurisdiction_id. An entity does not reach even its own seat without a row here. Written by service_role alone; a government account can read its own grants and can never widen them.';
comment on column public.government_jurisdiction_grants.jurisdiction_id is
  'Matched by EQUALITY in every authority function. If a query in this file ever compares it with anything other than =, authority has become geographic and the central guarantee of 2m is gone.';
comment on column public.government_jurisdiction_grants.grant_basis is
  'Why this authority was granted, in the words of whoever granted it. NOT NULL because authority nobody can explain is authority nobody can audit.';

-- A grant may only attach to a VERIFIED entity. A claimed-but-unverified entity
-- holding authority would make claiming equal verification, which 2m forbids.
create or replace function public.government_jurisdiction_grants_guard()
returns trigger
language plpgsql
as $$
begin
  if not public.regulatory_writer_is_aduatlas() then
    raise exception 'jurisdiction authority is granted by ADUAtlas only; a government account cannot widen its own scope'
      using errcode = '42501';
  end if;
  if new.revoked_at is null and not exists (
       select 1 from public.government_entities e
        where e.id = new.entity_id and e.verification_status = 'verified') then
    raise exception 'authority cannot be granted to an entity that is not verified: claiming never produces verification'
      using errcode = '23514';
  end if;
  -- The jurisdiction and the entity are never silently moved under a live grant.
  if tg_op = 'UPDATE' and (new.entity_id <> old.entity_id or new.jurisdiction_id <> old.jurisdiction_id) then
    raise exception 'a grant is not re-pointed; revoke it and grant the new scope explicitly'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger government_jurisdiction_grants_guard
  before insert or update on public.government_jurisdiction_grants
  for each row execute function public.government_jurisdiction_grants_guard();

create trigger government_jurisdiction_grants_set_updated_at
  before update on public.government_jurisdiction_grants
  for each row execute function public.set_updated_at();

create trigger government_entities_set_updated_at
  before update on public.government_entities
  for each row execute function public.set_updated_at();
create trigger government_users_set_updated_at
  before update on public.government_users
  for each row execute function public.set_updated_at();
create trigger government_memberships_set_updated_at
  before update on public.government_memberships
  for each row execute function public.set_updated_at();

-- ── the caller's government identity ────────────────────────────────────────
-- Resolved from public.current_app_user_id() (migration 0003), because the person
-- is an ordinary authenticated user and there is no separate government login.
create or replace function public.current_government_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select gu.id
    from public.government_users gu
    join public.users u on u.id = gu.user_id
   where u.auth_user_id = auth.uid();
$$;

comment on function public.current_government_user_id() is
  'The caller''s government_users.id, or null. Being non-null grants NOTHING: it means only that this person has identified themselves as acting in a government capacity.';

revoke execute on function public.current_government_user_id() from public, anon;
grant  execute on function public.current_government_user_id() to authenticated, service_role;

-- ── THE AUTHORITY PREDICATES ────────────────────────────────────────────────
-- Read these two functions as the whole of the government permission model. Four
-- conditions must all hold, and none of them is geographic:
--
--   1. the caller has a membership of the entity, and it is VERIFIED and not
--      revoked                                    → a revoked member is out on
--                                                   the next statement
--   2. the entity itself is VERIFIED               → claiming is not verification
--   3. a LIVE GRANT exists for (entity, jurisdiction), matched by EQUALITY
--   4. for a submission, that grant carries may_submit and the membership role is
--      contributor or administrator
--
-- There is no recursive CTE here and there must never be one. There is no read of
-- jurisdictions.parent_id and no read of government_entities.jurisdiction_id.
create or replace function public.government_may_read_jurisdiction(p_jurisdiction_id uuid)
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
      join public.government_entities e on e.id = m.entity_id
      join public.government_jurisdiction_grants g on g.entity_id = m.entity_id
     where u.auth_user_id = auth.uid()
       and m.status = 'verified'
       and m.revoked_at is null
       and e.verification_status = 'verified'
       and g.jurisdiction_id = p_jurisdiction_id     -- EQUALITY. never a parent walk
       and g.revoked_at is null
  );
$$;

-- The same, for one named entity, because a submission names the entity it is made
-- on behalf of and the grant must belong to THAT entity rather than to any entity
-- the person happens to be a member of.
create or replace function public.government_may_submit_as(p_entity_id uuid, p_jurisdiction_id uuid)
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
      join public.government_entities e on e.id = m.entity_id
      join public.government_jurisdiction_grants g on g.entity_id = m.entity_id
     where u.auth_user_id = auth.uid()
       and m.entity_id = p_entity_id
       and m.status = 'verified'
       and m.revoked_at is null
       and m.membership_role in ('contributor', 'administrator')
       and e.verification_status = 'verified'
       and g.jurisdiction_id = p_jurisdiction_id     -- EQUALITY. never a parent walk
       and g.revoked_at is null
       and g.may_submit
  );
$$;

-- Does the caller have any membership of this entity at all? Used for reading the
-- entity row and their own claim, which a PENDING member is allowed to do and which
-- is the ONLY thing a pending member is allowed to do.
create or replace function public.is_government_member_of(p_entity_id uuid)
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
       and m.status in ('pending', 'verified')
       and m.revoked_at is null
  );
$$;

-- Verified membership of this entity, any role. Used for reading the entity's
-- submissions and its grants.
create or replace function public.is_verified_government_member_of(p_entity_id uuid)
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
      join public.government_entities e on e.id = m.entity_id
     where u.auth_user_id = auth.uid()
       and m.entity_id = p_entity_id
       and m.status = 'verified'
       and m.revoked_at is null
       and e.verification_status = 'verified'
  );
$$;

-- Is the caller an ADMINISTRATOR of this entity? Used by the membership policy so an
-- entity administrator can see who else represents the entity.
--
-- IT HAS TO BE A FUNCTION. A policy ON government_memberships that asks
-- government_memberships a question re-enters its own policy and Postgres raises
-- "infinite recursion detected in policy". The first draft of this file did exactly
-- that, and the failure mode is worse than a crash: every read of the table by a
-- signed-in person is refused, and a suite that asserts "a government must not see
-- another government's members" passes for entirely the wrong reason. SECURITY
-- DEFINER runs the lookup as the table owner, who is not subject to the policy, so
-- the question is answered once instead of recursing.
create or replace function public.is_government_entity_administrator(p_entity_id uuid)
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
       and m.membership_role = 'administrator'
  );
$$;

comment on function public.government_may_read_jurisdiction(uuid) is
  'True only when the caller holds a VERIFIED, unrevoked membership of a VERIFIED entity that holds a LIVE grant on THIS jurisdiction record, matched by equality. No parent walk, no containment, no wildcard. A revoked member is refused on the next statement.';
comment on function public.is_government_entity_administrator(uuid) is
  'True when the caller administers this entity. Read by the membership policy, and a SECURITY DEFINER function rather than a subquery because a policy that queries its own table recurses.';
comment on function public.government_may_submit_as(uuid, uuid) is
  'The submission predicate. The grant must belong to the entity the submission names, the membership must be verified and allowed to submit, and the grant must be for exactly this jurisdiction. A member of the Arizona entity is refused against the Phoenix record BY THIS FUNCTION, through the RLS policy that calls it.';

revoke execute on function public.government_may_read_jurisdiction(uuid)   from public, anon;
revoke execute on function public.government_may_submit_as(uuid, uuid)     from public, anon;
revoke execute on function public.is_government_member_of(uuid)            from public, anon;
revoke execute on function public.is_government_entity_administrator(uuid)  from public, anon;
revoke execute on function public.is_verified_government_member_of(uuid)   from public, anon;
grant  execute on function public.government_may_read_jurisdiction(uuid)   to authenticated, service_role;
grant  execute on function public.government_may_submit_as(uuid, uuid)     to authenticated, service_role;
grant  execute on function public.is_government_member_of(uuid)            to authenticated, service_role;
grant  execute on function public.is_government_entity_administrator(uuid)  to authenticated, service_role;
grant  execute on function public.is_verified_government_member_of(uuid)   to authenticated, service_role;


-- =============================================================================
-- PART 5 — regulatory_provisions: individual sourced rules, and FOUR DATES
--
-- One row = one rule, for one jurisdiction, on one topic, with its own source and
-- its own dates. Never one blob per city (2m). A homeowner asking "how big can it
-- be in Phoenix?" is answered by one row that can be cited, dated and superseded
-- on its own.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE FOUR DATES, AND WHY CONFLATING THEM MISLEADS
--
--   effective_date              WHEN THE RULE LEGALLY TOOK EFFECT. The
--                               government's date. It may be in the future: an
--                               ordinance adopted in November 2025 taking effect
--                               in January 2026 is a real and common shape, and a
--                               homeowner planning a build needs to know which
--                               rule applies to them.
--   source_checked_date         WHEN ADUATLAS LAST LOOKED AT THE SOURCE. Ours.
--                               It says how stale our reading is, and nothing
--                               about the law.
--   record_published_at         WHEN ADUATLAS LAST CHANGED ITS OWN PUBLISHED
--                               RECORD. Ours. It moves when we correct a typo,
--                               which changes nothing about the law and nothing
--                               about when we last read the source.
--   superseded_or_repealed_date WHEN THE RULE STOPPED APPLYING, per the
--                               government. The row is KEPT: history is never
--                               overwritten, and a homeowner who acted under the
--                               old rule needs to be able to see it.
--
-- "Verified January 2025" and "effective January 2026" mean opposite things. One
-- says we read a page; the other says the law changed. Rendering them alike, or
-- storing them in one "last_verified" column, is how a product like this tells a
-- homeowner a rule is current when nobody has looked in a year, or tells them a
-- rule applies today when it does not apply until next year. That is why 2m
-- rejects the single field, and why this table has four columns instead.
--
-- retracted_at is a FIFTH date and is deliberately not one of the four: it records
-- that ADUAtlas pulled its own record because OUR record was wrong. A repeal is
-- the government's act; a retraction is ours; collapsing them would blame a
-- government for our mistake.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THREE ORTHOGONAL STATUSES, none of which is a synonym for another
--
--   field_state          WHAT WE KNOW: verified_from_source, source_did_not_state
--                        or not_yet_researched (PART 2).
--   review_status        WHERE IT IS IN OUR WORKFLOW: draft, in_review,
--                        published, superseded, retracted, rejected.
--   verification_status  WHO CHECKED IT: source_checked (a person at ADUAtlas
--                        opened the cited source), unverified (recorded from a
--                        submission and not yet checked against the source) or
--                        disputed (another authority contradicts it, and the
--                        product must show the disagreement rather than pick).
-- =============================================================================
create table public.regulatory_provisions (
  id                  uuid primary key default gen_random_uuid(),
  jurisdiction_id     uuid not null references public.jurisdictions (id) on delete restrict,
  topic_key           text not null references public.regulatory_topics (key) on delete restrict,

  -- WHAT WE KNOW. The three states of 2b, never blurred.
  field_state         public.regulatory_field_state default 'not_yet_researched',

  -- The rule itself. value_text is what a homeowner reads; the typed columns are
  -- what the feasibility workflow will eventually read, so the dataset is not an
  -- isolated content island (2l). All null unless field_state is
  -- verified_from_source: a value with no source is exactly what 2l forbids.
  value_text          text,
  value_numeric       numeric,
  value_unit          text,
  value_boolean       boolean,
  -- Nuance a number cannot carry: 'or 75% of the primary dwelling, whichever is
  -- less'. Shown with the value, never instead of it.
  value_qualifier     text,

  -- THE SOURCE. 2l: a regulatory claim is backed by city, county or state
  -- government, an official planning or zoning department, or official municipal
  -- or state code. Never a blog, a lead-generation site, builder marketing or an
  -- AI summary presented as a verified rule.
  source_url          text,
  source_document_title text,      -- 'Phoenix Zoning Ordinance § 608.E'. Null = never established; never invented (2b).
  source_citation     text,        -- the section or page, when the URL is a whole document
  source_type         text
                        check (source_type in ('state_statute', 'state_agency', 'county_code',
                                               'city_code', 'municipal_ordinance', 'planning_department',
                                               'building_department', 'official_permit_system',
                                               'other_official')),

  -- WHO SUPPLIED IT. This is NOT the same statement as "the source is an official
  -- government website", and the two must never be collapsed (2m). A published
  -- rule sourced from phoenix.gov by an ADUAtlas researcher says
  -- "Source: Official government website". A rule a verified City of Phoenix
  -- account submitted says "Provided by City of Phoenix" AS WELL. Using a
  -- government's website as a source does not mean that government takes part.
  supplied_by         text not null default 'aduatlas_research'
                        check (supplied_by in ('aduatlas_research', 'government_account')),
  supplied_by_entity_id uuid references public.government_entities (id) on delete restrict,
  source_submission_id uuid,       -- set by PART 7 (declared there to avoid a circular FK)

  -- WHERE IT IS IN OUR WORKFLOW.
  review_status       text not null default 'draft'
                        check (review_status in ('draft', 'in_review', 'published',
                                                 'superseded', 'retracted', 'rejected')),

  -- WHO CHECKED IT.
  verification_status text not null default 'unverified'
                        check (verification_status in ('unverified', 'source_checked', 'disputed')),

  -- ── the four dates ───────────────────────────────────────────────────────
  effective_date              date,
  source_checked_date         date,
  record_published_at         timestamptz,
  superseded_or_repealed_date date,
  -- ── and the two that are not among them ──────────────────────────────────
  first_published_at  timestamptz,           -- bookkeeping: stamped once, never moved
  retracted_at        timestamptz,           -- ADUAtlas pulled its own record
  retraction_reason   text,

  superseded_by_provision_id uuid references public.regulatory_provisions (id) on delete set null,

  -- ONE DERIVED ANSWER to "is this what the public sees". Generated, so it cannot
  -- drift from the three columns that decide it and cannot be written by anybody,
  -- including the admin API: publication is the result of a workflow state, a
  -- supersession date and a retraction, never a flag somebody sets.
  is_published        boolean generated always as (
                        review_status = 'published'
                        and superseded_or_repealed_date is null
                        and retracted_at is null) stored,

  admin_note          text,                  -- internal. Never in a _public view.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A value exists only when a source states it. This is 2b in a constraint: no
  -- column default and no half-filled draft can become a claim about a government.
  constraint regulatory_provisions_value_needs_verified_state check (
    field_state = 'verified_from_source'
    or (value_text is null and value_numeric is null and value_boolean is null and value_qualifier is null)
  ),
  -- THE THREE STATES, AND WHAT EACH ONE OWES, IN ONE CONSTRAINT. The domain closes
  -- the vocabulary; this says what each state requires, on the table, where anybody
  -- reading \d regulatory_provisions can see all three tokens at once:
  --   verified_from_source  a value, guarded by the constraint below
  --   source_did_not_state  KNOWLEDGE, not absence: we read a specific source on a
  --                         specific date and it was silent, so both are required
  --   not_yet_researched    we have not looked, so a source or a checked date would
  --                         be a contradiction in terms
  -- ELSE false closes the set a second time: a token nobody has defined cannot be
  -- stored even if a later migration widens the domain by accident.
  constraint regulatory_provisions_field_state_is_one_of_three check (
    case field_state
      when 'verified_from_source' then true
      when 'source_did_not_state' then source_url is not null and source_checked_date is not null
      when 'not_yet_researched'   then source_url is null and source_checked_date is null
      else false
    end
  ),
  -- A published rule is sourced. Always.
  constraint regulatory_provisions_published_needs_source check (
    review_status <> 'published'
    or (source_url is not null and source_type is not null and source_checked_date is not null
        and record_published_at is not null)
  ),
  -- A published record says something ADUAtlas knows. "We have not looked" is said
  -- by the ABSENCE of a published row and computed in jurisdiction_topic_coverage,
  -- so publishing it here would be a second, contradictable representation of the
  -- same state.
  constraint regulatory_provisions_published_is_knowledge check (
    review_status <> 'published' or field_state <> 'not_yet_researched'
  ),
  constraint regulatory_provisions_verified_state_needs_value check (
    field_state <> 'verified_from_source'
    or review_status <> 'published'
    or (value_text is not null or value_numeric is not null or value_boolean is not null)
  ),
  -- "Provided by a verified government account" must be true when it is said.
  constraint regulatory_provisions_government_supplied_names_entity check (
    (supplied_by = 'government_account') = (supplied_by_entity_id is not null)
  ),
  constraint regulatory_provisions_superseded_has_date check (
    review_status <> 'superseded' or superseded_or_repealed_date is not null
  ),
  constraint regulatory_provisions_retracted_has_reason check (
    (review_status = 'retracted') = (retracted_at is not null)
  )
);

-- AT MOST ONE CURRENT PUBLISHED RULE per (jurisdiction, topic). Publishing a new
-- one supersedes the old one, which is KEPT. Without this index a page could show
-- two different maximum sizes for the same city and the product would have no way
-- to know which is current.
create unique index regulatory_provisions_current_uidx
  on public.regulatory_provisions (jurisdiction_id, topic_key)
  where review_status = 'published' and superseded_or_repealed_date is null;

-- At most one open draft per (jurisdiction, topic), so Amy's queue cannot hold two
-- competing edits of the same rule.
create unique index regulatory_provisions_open_draft_uidx
  on public.regulatory_provisions (jurisdiction_id, topic_key)
  where review_status in ('draft', 'in_review');

create index regulatory_provisions_jurisdiction_idx on public.regulatory_provisions (jurisdiction_id, review_status);
create index regulatory_provisions_published_idx on public.regulatory_provisions (jurisdiction_id, topic_key) where is_published;
create index regulatory_provisions_topic_idx        on public.regulatory_provisions (topic_key, review_status);
create index regulatory_provisions_stale_idx        on public.regulatory_provisions (source_checked_date) where review_status = 'published';
create index regulatory_provisions_entity_idx       on public.regulatory_provisions (supplied_by_entity_id) where supplied_by_entity_id is not null;

comment on table public.regulatory_provisions is
  'One sourced rule, for one jurisdiction, on one topic (2m). Never one blob per city: a rule must be citable, datable and supersedable on its own. What ADUAtlas PUBLISHES. What a government SUBMITTED is in regulatory_submissions, and both are kept, because a state may legitimately assert that a city ordinance conflicts with state law and the product must show the disagreement rather than silently pick a winner.';
comment on column public.regulatory_provisions.field_state is
  'Decision 2b: verified_from_source, source_did_not_state, or not_yet_researched. Never blurred and never inferred. "not yet researched" is not publishable here; its published representation is the ABSENCE of a row, computed in jurisdiction_topic_coverage.';
comment on column public.regulatory_provisions.effective_date is
  'WHEN THE RULE LEGALLY TOOK EFFECT, per the government. May be in the future. This is NOT when ADUAtlas checked anything: "effective January 2026" and "verified January 2025" mean opposite things and must never render alike.';
comment on column public.regulatory_provisions.source_checked_date is
  'WHEN ADUATLAS LAST LOOKED AT THE SOURCE. Says how stale our reading is and nothing about the law. Conflating it with effective_date would tell a homeowner a rule is in force when we have only read a page, or that it is current when nobody has looked in a year.';
comment on column public.regulatory_provisions.record_published_at is
  'WHEN ADUATLAS LAST CHANGED ITS OWN PUBLISHED RECORD. Ours, not the government''s. It moves for a corrected typo, which changes neither the law nor when we last read the source. Stamped by the guard trigger, never by a client.';
comment on column public.regulatory_provisions.superseded_or_repealed_date is
  'WHEN THE RULE STOPPED APPLYING, per the government. The row is KEPT and never deleted: a homeowner who acted under the old rule must still be able to see it.';
comment on column public.regulatory_provisions.retracted_at is
  'NOT one of the four regulatory dates. It records that ADUAtlas withdrew its OWN record because our record was wrong. A repeal is the government''s act; a retraction is ours. Collapsing them would blame a government for our mistake.';
comment on column public.regulatory_provisions.supplied_by is
  'Who gave ADUAtlas this rule. A SEPARATE statement from source_type: "Source: Official government website" and "Provided by City of Phoenix" are different facts and must never be collapsed. Using a government website as a source does not mean that government participates in ADUAtlas.';
comment on column public.regulatory_provisions.is_published is
  'Derived, never written: true only while this row is the published, un-superseded, un-retracted record. The _public views read it, so "what the public sees" has one definition and a new column cannot quietly disagree with it.';
comment on column public.regulatory_provisions.verification_status is
  'Who checked it. source_checked = a person at ADUAtlas opened the cited source. unverified = recorded from a submission and not yet checked. disputed = another authority contradicts it, and the product shows the disagreement rather than choosing.';


-- =============================================================================
-- PART 6 — government_resources: first class alongside rules
--
-- "This is why the feature is Rules AND Resources" (2m). A homeowner who cannot
-- find the permit application is stuck whether or not we know the setback, and the
-- official ADU page is often more useful than anything we could summarise. So a
-- resource is not a column on a jurisdiction row; it is a record with its own
-- source, its own checked date and the SAME three field states as a rule.
--
-- field_state on a resource reads the same way it does on a rule:
--   verified_from_source  ADUAtlas found the jurisdiction's own ADU handbook and
--                         here is the link.
--   source_did_not_state  ADUAtlas looked and this jurisdiction publishes no ADU
--                         handbook. That is a real answer for a homeowner and it
--                         is not the same as not having looked.
--   not_yet_researched    nobody has looked. Draft only, never published.
-- =============================================================================
create table public.government_resources (
  id                  uuid primary key default gen_random_uuid(),
  jurisdiction_id     uuid not null references public.jurisdictions (id) on delete restrict,

  -- The list in 2l and 2m, together. official_adu_page first because it is the one
  -- link a homeowner most often needs.
  resource_type       text not null
                        check (resource_type in ('official_adu_page', 'planning_zoning_page',
                                                 'ordinance', 'permit_application', 'application_portal',
                                                 'zoning_map', 'planning_department', 'building_department',
                                                 'adu_contact', 'adu_handbook', 'fee_schedule',
                                                 'design_standards', 'preapproved_plans', 'faq', 'other')),

  field_state         public.regulatory_field_state default 'not_yet_researched',

  label               text,          -- 'ADU permit application (PDF)'
  url                 text,          -- the official link itself
  phone               text,
  email               citext,
  contact_name        text,          -- an official ADU contact person, where the jurisdiction publishes one
  contact_title       text,
  department_name     text,
  address             text,
  hours               text,
  notes               text,

  -- Where ADUAtlas found this resource. Usually the same host as url, and not
  -- always the same page: a handbook PDF is often linked from the planning page.
  source_url          text,
  source_type         text
                        check (source_type in ('state_statute', 'state_agency', 'county_code',
                                               'city_code', 'municipal_ordinance', 'planning_department',
                                               'building_department', 'official_permit_system',
                                               'other_official')),

  supplied_by         text not null default 'aduatlas_research'
                        check (supplied_by in ('aduatlas_research', 'government_account')),
  supplied_by_entity_id uuid references public.government_entities (id) on delete restrict,
  source_submission_id uuid,

  review_status       text not null default 'draft'
                        check (review_status in ('draft', 'in_review', 'published',
                                                 'superseded', 'retracted', 'rejected')),
  verification_status text not null default 'unverified'
                        check (verification_status in ('unverified', 'source_checked', 'disputed')),

  -- The same dates as a rule, and for the same reason. effective_date is usually
  -- null here: a phone number does not take legal effect. An ordinance link does,
  -- which is why the column exists rather than being assumed away.
  effective_date              date,
  source_checked_date         date,
  record_published_at         timestamptz,
  superseded_or_repealed_date date,
  first_published_at  timestamptz,
  retracted_at        timestamptz,
  retraction_reason   text,


  -- ONE DERIVED ANSWER to "is this what the public sees". Generated, so it cannot
  -- drift from the three columns that decide it and cannot be written by anybody,
  -- including the admin API: publication is the result of a workflow state, a
  -- supersession date and a retraction, never a flag somebody sets.
  is_published        boolean generated always as (
                        review_status = 'published'
                        and superseded_or_repealed_date is null
                        and retracted_at is null) stored,
  sort_order          int not null default 100,
  admin_note          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A resource ADUAtlas claims to have found must actually lead somewhere: a link,
  -- a phone, an email or a named contact.
  constraint government_resources_found_leads_somewhere check (
    field_state <> 'verified_from_source'
    or (url is not null or phone is not null or email is not null or contact_name is not null)
  ),
  -- The three states and what each one owes, as on provisions. "This jurisdiction
  -- publishes none" is a finding: it needs a source and a date, and it carries no
  -- link, because a link would contradict it.
  constraint government_resources_field_state_is_one_of_three check (
    case field_state
      when 'verified_from_source' then true
      when 'source_did_not_state' then source_url is not null and source_checked_date is not null
                                       and url is null and phone is null and email is null and contact_name is null
      when 'not_yet_researched'   then source_url is null and source_checked_date is null
                                       and url is null and phone is null and email is null
      else false
    end
  ),
  constraint government_resources_published_needs_source check (
    review_status <> 'published'
    or (source_url is not null and source_checked_date is not null and record_published_at is not null)
  ),
  constraint government_resources_published_is_knowledge check (
    review_status <> 'published' or field_state <> 'not_yet_researched'
  ),
  constraint government_resources_government_supplied_names_entity check (
    (supplied_by = 'government_account') = (supplied_by_entity_id is not null)
  ),
  constraint government_resources_superseded_has_date check (
    review_status <> 'superseded' or superseded_or_repealed_date is not null
  ),
  constraint government_resources_retracted_has_reason check (
    (review_status = 'retracted') = (retracted_at is not null)
  )
);

-- A jurisdiction may publish several ordinances or two contacts, so there is no
-- one-per-type rule. But it may not simultaneously publish "here is the handbook"
-- and "this jurisdiction publishes no handbook": at most one "none published" row
-- per type, and the guard trigger refuses the contradiction directly.
create unique index government_resources_silence_uidx
  on public.government_resources (jurisdiction_id, resource_type)
  where review_status = 'published' and field_state = 'source_did_not_state';

create index government_resources_jurisdiction_idx on public.government_resources (jurisdiction_id, review_status, resource_type);
create index government_resources_stale_idx on public.government_resources (source_checked_date) where review_status = 'published';

comment on table public.government_resources is
  'Official links and contacts (2m), first class alongside rules: ADU page, ordinance, permit application, zoning map, planning and building departments, ADU contact, handbook, fee schedule, design standards, pre-approved plans, portal, FAQ. Same three field states and same dates as a provision, because "we looked and this city publishes no handbook" is an answer and "nobody has looked" is not.';
comment on column public.government_resources.field_state is
  'verified_from_source = we found it, here it is. source_did_not_state = we looked and this jurisdiction publishes no such resource, which is a real answer for a homeowner. not_yet_researched = nobody has looked; draft only.';
comment on column public.government_resources.url is
  'The official link itself. source_url is where ADUAtlas found it, which is often a different page on the same government site.';


-- =============================================================================
-- PART 7 — regulatory_submissions: what a government SENT US, kept forever
--
-- "A government member SUBMITS; Amy reviews; ADUAtlas publishes; previous versions
-- are retained immutably. Verification is not a publishing right." (2m)
--
-- This table is the government's side of the record and the provisions table is
-- ADUAtlas's side. BOTH ARE KEPT. The reason is in the spec and it is not
-- hypothetical: a state agency may find that a city ordinance conflicts with state
-- law. If accepting one submission deleted the other record, the database would
-- have silently decided which government is right. Instead:
--
--   • the submission is retained with its status and Amy's review note,
--   • conflicts_with_provision_id lets a submission say exactly which published
--     rule it contradicts,
--   • and the published provision can be marked verification_status = 'disputed'
--     so the product shows the disagreement.
--
-- THE PAYLOAD IS IMMUTABLE. A submission is a statement somebody made on a date.
-- Nobody edits it afterwards, including ADUAtlas: the trigger below refuses any
-- change to what was submitted, even from service_role. A member who has changed
-- their mind withdraws and submits again, which leaves both statements in the
-- record. This is also what makes a compromised government account bounded: it can
-- add submissions, and it cannot alter or remove what was submitted before, and
-- nothing it submits is published by anybody but ADUAtlas.
-- =============================================================================
create table public.regulatory_submissions (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('provision', 'resource')),

  jurisdiction_id     uuid not null references public.jurisdictions (id) on delete restrict,
  -- The entity the submission is made ON BEHALF OF. The authority check is against
  -- THIS entity, not against any entity the person belongs to.
  entity_id           uuid not null references public.government_entities (id) on delete restrict,
  submitted_by_government_user_id uuid not null references public.government_users (id) on delete restrict,

  topic_key           text references public.regulatory_topics (key) on delete restrict,
  resource_type       text,

  -- Proposing a change to something ADUAtlas already publishes.
  target_provision_id uuid references public.regulatory_provisions (id) on delete set null,
  target_resource_id  uuid references public.government_resources (id) on delete set null,
  -- "What you publish conflicts with what we publish." The disagreement, stored.
  conflicts_with_provision_id uuid references public.regulatory_provisions (id) on delete set null,

  -- EXACTLY WHAT WAS SUBMITTED. Immutable. The shape is built in one place,
  -- src/lib/regulatory.js, and documented there:
  --   provision: field_state, value_text, value_numeric, value_unit, value_boolean,
  --              value_qualifier, effective_date, source_url,
  --              source_document_title, source_citation, source_type
  --   resource:  label, url, phone, email, contact_name, contact_title,
  --              department_name, address, hours, notes, source_url, source_type
  payload             jsonb not null,
  submitter_note      text,

  status              text not null default 'submitted'
                        check (status in ('submitted', 'in_review', 'accepted',
                                          'partially_accepted', 'rejected', 'withdrawn')),
  review_note         text,           -- Amy's words back to the entity
  reviewed_by_app_user_id uuid references public.users (id) on delete set null,
  reviewed_at         timestamptz,
  -- What ADUAtlas published as a result, if anything. Null on a rejected submission
  -- AND on an accepted one that has not been published yet: verification is not a
  -- publishing right and acceptance is not publication either.
  resulting_provision_id uuid references public.regulatory_provisions (id) on delete set null,
  resulting_resource_id  uuid references public.government_resources (id) on delete set null,

  withdrawn_at        timestamptz,
  submitted_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint regulatory_submissions_payload_is_object
    check (jsonb_typeof(payload) = 'object' and payload <> '{}'::jsonb),
  constraint regulatory_submissions_kind_target check (
    case kind
      when 'provision' then topic_key is not null and resource_type is null
      when 'resource'  then resource_type is not null and topic_key is null
    end
  ),
  constraint regulatory_submissions_reviewed_has_reviewer check (
    status in ('submitted', 'withdrawn') or (reviewed_at is not null)
  ),
  constraint regulatory_submissions_withdrawn_has_date
    check ((status = 'withdrawn') = (withdrawn_at is not null))
);

create index regulatory_submissions_entity_idx       on public.regulatory_submissions (entity_id, status, submitted_at desc);
create index regulatory_submissions_jurisdiction_idx on public.regulatory_submissions (jurisdiction_id, status);
create index regulatory_submissions_queue_idx        on public.regulatory_submissions (submitted_at) where status in ('submitted', 'in_review');

comment on table public.regulatory_submissions is
  'What a verified government member SENT ADUAtlas (2m). Kept forever, alongside what ADUAtlas publishes, because the two can legitimately differ: a state agency may assert that a city ordinance conflicts with state law, and deleting either row would have the database silently decide which government is right. Submitting is not publishing and acceptance is not publication.';
comment on column public.regulatory_submissions.payload is
  'Exactly what was submitted, immutable after insert, including against service_role. A submission is a statement somebody made on a date; a member who changed their mind withdraws and submits again, leaving both statements in the record.';
comment on column public.regulatory_submissions.conflicts_with_provision_id is
  'The published provision this submission says is wrong. This is how the database represents a disagreement between two governments instead of resolving it.';
comment on column public.regulatory_submissions.entity_id is
  'The entity this submission is made on behalf of. The authority check (government_may_submit_as) is against THIS entity and THIS jurisdiction, so a person who represents two entities cannot borrow one entity''s grant to submit as the other.';

-- The two content tables point back at the submission that produced them. Declared
-- here rather than inline above because the dependency runs both ways.
alter table public.regulatory_provisions
  add constraint regulatory_provisions_source_submission_fkey
  foreign key (source_submission_id) references public.regulatory_submissions (id) on delete set null;
alter table public.government_resources
  add constraint government_resources_source_submission_fkey
  foreign key (source_submission_id) references public.regulatory_submissions (id) on delete set null;

comment on column public.regulatory_provisions.source_submission_id is
  'The government submission this published rule came from, when it came from one. Its presence is what makes "Provided by City of Phoenix" a traceable claim rather than a label.';


-- =============================================================================
-- PART 8 — history that is never overwritten, and an audit trail
--
-- Two append-only tables, and they are append-only for EVERY API role including
-- service_role:
--
--   regulatory_record_versions  every state a provision or a resource has ever
--                               been in, as a snapshot. Publishing a correction
--                               does not lose what was published before.
--   regulatory_audit_log        who changed what and when, across every table in
--                               this file, including memberships and grants.
--
-- WHY THE REVOKE FROM service_role MATTERS. The admin API and any compromised
-- service key can change what ADUAtlas publishes NEXT. Neither can make the
-- previous version or the audit row disappear, because neither holds INSERT,
-- UPDATE or DELETE on these two tables. The triggers write them as the table
-- owner, which no API key is. A superuser with direct database access can still
-- rewrite anything, which is true of every audit trail in every database and is
-- why database credentials are in 2k rather than in this file.
--
-- THE ACTOR. actor_api_role is read from the verified JWT claim PostgREST sets,
-- which a browser cannot forge, and reads 'direct' when the write did not come
-- through the API at all (a migration, psql, a job). actor_app_user_id is the
-- signed-in person where there is one; the admin_* functions take Amy's user id
-- explicitly, because "the service key did it" is not an answer to who did it.
-- =============================================================================
create table public.regulatory_record_versions (
  id                uuid primary key default gen_random_uuid(),
  record_type       text not null check (record_type in ('provision', 'resource')),
  -- Deliberately NOT a foreign key. An audit row must survive the record it
  -- describes; a cascade would let deleting a record delete its own history.
  record_id         uuid not null,
  version_no        int  not null check (version_no > 0),
  -- How this version came to be recorded. insert/update/delete are the database's
  -- own triggers. api_snapshot is a snapshot the admin console appended beside its
  -- own edit, with the operator's note: see the compatibility view in PART 10.
  change_kind       text not null default 'api_snapshot'
                      check (change_kind in ('insert', 'update', 'delete', 'api_snapshot')),

  jurisdiction_id   uuid,
  topic_or_type     text,          -- topic_key for a provision, resource_type for a resource
  field_state       text,
  review_status     text,
  value_summary     text,          -- value_text, or the typed value rendered, for reading history at a glance
  source_url        text,
  effective_date              date,
  source_checked_date         date,
  record_published_at         timestamptz,
  superseded_or_repealed_date date,

  -- The whole row as it stood after the change. The columns above are duplicated out
  -- of it so history is queryable without digging through jsonb.
  snapshot          jsonb not null,

  -- The operator's words beside a change, and where the row came from. Written by
  -- the admin console through the compatibility view; null on a row the database
  -- wrote by itself, because a trigger has no opinion about why.
  change_note       text,
  source            text,
  submission_id     uuid references public.regulatory_submissions (id) on delete set null,

  actor_api_role    text not null,
  actor_app_user_id uuid references public.users (id) on delete set null,
  recorded_at       timestamptz not null default now(),

  constraint regulatory_record_versions_unique unique (record_type, record_id, version_no)
);

create index regulatory_record_versions_record_idx on public.regulatory_record_versions (record_type, record_id, version_no desc);
create index regulatory_record_versions_published_idx
  on public.regulatory_record_versions (record_type, record_id, record_published_at desc)
  where review_status = 'published';

comment on table public.regulatory_record_versions is
  'Immutable version history for provisions and resources (2m: "previous versions are retained immutably"). Append-only for anon, authenticated AND service_role: written only by the triggers below, which run as the table owner. A compromised government account, and a compromised service key, can change what is published next; neither can erase what was published before.';

create table public.regulatory_audit_log (
  id                bigint generated always as identity primary key,
  occurred_at       timestamptz not null default now(),
  action            text not null,            -- 'provision.published', 'membership.revoked', 'grant.created', …
  table_name        text not null,
  record_id         uuid,
  jurisdiction_id   uuid,
  entity_id         uuid,
  actor_api_role    text not null,
  actor_app_user_id uuid references public.users (id) on delete set null,
  actor_government_user_id uuid references public.government_users (id) on delete set null,
  changed_fields    text[],
  before_value      jsonb,
  after_value       jsonb,
  note              text
);

create index regulatory_audit_log_record_idx on public.regulatory_audit_log (table_name, record_id, occurred_at desc);
create index regulatory_audit_log_entity_idx on public.regulatory_audit_log (entity_id, occurred_at desc) where entity_id is not null;
create index regulatory_audit_log_time_idx   on public.regulatory_audit_log (occurred_at desc);

comment on table public.regulatory_audit_log is
  'Who changed what and when, across the regulatory and government tables. Append-only for every API role including service_role. actor_api_role comes from the verified JWT claim, which a browser cannot forge; "direct" means the write did not come through the API.';

-- ── the actor, read from the verified request context ───────────────────────
create or replace function public.regulatory_actor_api_role()
returns text
language sql
stable
as $$
  select coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           'direct'
         );
$$;

-- The default exists so the admin console can append a snapshot through the
-- compatibility view in PART 10 without being able to claim it came from somewhere
-- else: the role is read from the verified request context, not from the payload.
alter table public.regulatory_record_versions
  alter column actor_api_role set default public.regulatory_actor_api_role();

create or replace function public.regulatory_actor_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where auth_user_id = auth.uid();
$$;

revoke execute on function public.regulatory_actor_app_user_id() from public, anon, authenticated;

-- ── the audit writer ────────────────────────────────────────────────────────
-- SECURITY DEFINER so the triggers can write a table that no API role may write.
-- Revoked from every API role so it cannot be called directly to forge a row.
create or replace function public.regulatory_audit(
  p_action text, p_table text, p_record_id uuid, p_jurisdiction_id uuid, p_entity_id uuid,
  p_changed text[], p_before jsonb, p_after jsonb, p_note text default null,
  p_actor_app_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.regulatory_audit_log (
    action, table_name, record_id, jurisdiction_id, entity_id,
    actor_api_role, actor_app_user_id, actor_government_user_id,
    changed_fields, before_value, after_value, note)
  values (
    p_action, p_table, p_record_id, p_jurisdiction_id, p_entity_id,
    public.regulatory_actor_api_role(),
    coalesce(p_actor_app_user_id, public.regulatory_actor_app_user_id()),
    public.current_government_user_id(),
    p_changed, p_before, p_after, p_note);
end;
$$;

revoke execute on function public.regulatory_audit(text, text, uuid, uuid, uuid, text[], jsonb, jsonb, text, uuid)
  from public, anon, authenticated, service_role;

-- ── the version writer, shared by both content tables ───────────────────────
create or replace function public.regulatory_record_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type   text := case tg_table_name when 'regulatory_provisions' then 'provision' else 'resource' end;
  v_row    jsonb := to_jsonb(coalesce(new, old));
  v_id     uuid  := (v_row ->> 'id')::uuid;
  v_kind   text  := lower(tg_op);
  v_next   int;
  v_summary text;
begin
  select coalesce(max(version_no), 0) + 1 into v_next
    from public.regulatory_record_versions
   where record_type = v_type and record_id = v_id;

  v_summary := coalesce(
    v_row ->> 'value_text',
    case when v_row ? 'value_numeric' and v_row ->> 'value_numeric' is not null
         then (v_row ->> 'value_numeric') || coalesce(' ' || (v_row ->> 'value_unit'), '') end,
    case when v_row ->> 'value_boolean' is not null then v_row ->> 'value_boolean' end,
    v_row ->> 'label',
    v_row ->> 'url');

  insert into public.regulatory_record_versions (
    record_type, record_id, version_no, change_kind,
    jurisdiction_id, topic_or_type, field_state, review_status, value_summary, source_url,
    effective_date, source_checked_date, record_published_at, superseded_or_repealed_date,
    snapshot, actor_api_role, actor_app_user_id)
  values (
    v_type, v_id, v_next, v_kind,
    (v_row ->> 'jurisdiction_id')::uuid,
    coalesce(v_row ->> 'topic_key', v_row ->> 'resource_type'),
    v_row ->> 'field_state',
    v_row ->> 'review_status',
    v_summary,
    v_row ->> 'source_url',
    (v_row ->> 'effective_date')::date,
    (v_row ->> 'source_checked_date')::date,
    (v_row ->> 'record_published_at')::timestamptz,
    (v_row ->> 'superseded_or_repealed_date')::date,
    v_row,
    public.regulatory_actor_api_role(),
    public.regulatory_actor_app_user_id());

  perform public.regulatory_audit(
    v_type || '.' || v_kind, tg_table_name, v_id,
    (v_row ->> 'jurisdiction_id')::uuid,
    (v_row ->> 'supplied_by_entity_id')::uuid,
    null,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end);

  return null;
end;
$$;

-- ── the provisions guard: transitions, immutability, and the stamping ───────
create or replace function public.regulatory_provisions_guard()
returns trigger
language plpgsql
as $$
declare
  v_content_changed boolean := false;
begin
  if not public.regulatory_writer_is_aduatlas() then
    raise exception 'regulatory provisions are published by ADUAtlas only. A verified government account SUBMITS (regulatory_submissions); it never publishes.'
      using errcode = '42501';
  end if;

  -- "Provided by a verified government account" must be true whenever it is said.
  if new.supplied_by = 'government_account' and not exists (
       select 1 from public.government_entities e
        where e.id = new.supplied_by_entity_id and e.verification_status = 'verified') then
    raise exception 'a provision cannot be attributed to a government account that is not verified'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    -- A published rule is never silently moved to another jurisdiction or topic.
    if old.first_published_at is not null
       and (new.jurisdiction_id <> old.jurisdiction_id or new.topic_key <> old.topic_key) then
      raise exception 'a published provision is never moved between jurisdictions or topics; supersede it and publish a new record'
        using errcode = '23514';
    end if;
    -- Published records leave the published state only forwards: superseded (the
    -- government changed the rule) or retracted (our record was wrong). Never back
    -- to a draft, which would make a published rule vanish without a trace.
    if old.review_status = 'published'
       and new.review_status not in ('published', 'superseded', 'retracted') then
      raise exception 'a published provision moves only to superseded or retracted, never back to %; history is never overwritten', new.review_status
        using errcode = '23514';
    end if;
    -- first_published_at is stamped once and never moved.
    if old.first_published_at is not null and new.first_published_at is distinct from old.first_published_at then
      raise exception 'first_published_at is stamped once and never moved'
        using errcode = '23514';
    end if;

    v_content_changed :=
         new.field_state         is distinct from old.field_state
      or new.value_text          is distinct from old.value_text
      or new.value_numeric       is distinct from old.value_numeric
      or new.value_unit          is distinct from old.value_unit
      or new.value_boolean       is distinct from old.value_boolean
      or new.value_qualifier     is distinct from old.value_qualifier
      or new.source_url          is distinct from old.source_url
      or new.source_document_title is distinct from old.source_document_title
      or new.source_citation     is distinct from old.source_citation
      or new.source_type         is distinct from old.source_type
      or new.effective_date      is distinct from old.effective_date
      or new.source_checked_date is distinct from old.source_checked_date
      or new.verification_status is distinct from old.verification_status
      or new.review_status       is distinct from old.review_status
      or new.superseded_or_repealed_date is distinct from old.superseded_or_repealed_date;
  end if;

  -- record_published_at is OURS and the database owns it: it is the date the product
  -- shows as "ADUAtlas last updated this record", so a client must not be able to
  -- pick it. It moves only while the record is published and only when the record
  -- actually changed.
  if new.review_status = 'published' then
    if new.first_published_at is null then
      new.first_published_at := now();
    end if;
    if tg_op = 'INSERT' or v_content_changed or new.record_published_at is null then
      new.record_published_at := now();
    end if;
  end if;

  return new;
end;
$$;

-- The same rules for resources, minus the topic-specific parts.
create or replace function public.government_resources_guard()
returns trigger
language plpgsql
as $$
declare
  v_content_changed boolean := false;
begin
  if not public.regulatory_writer_is_aduatlas() then
    raise exception 'government resources are published by ADUAtlas only. A verified government account SUBMITS; it never publishes.'
      using errcode = '42501';
  end if;

  if new.supplied_by = 'government_account' and not exists (
       select 1 from public.government_entities e
        where e.id = new.supplied_by_entity_id and e.verification_status = 'verified') then
    raise exception 'a resource cannot be attributed to a government account that is not verified'
      using errcode = '23514';
  end if;

  -- A jurisdiction cannot publish "here is the handbook" and "this jurisdiction
  -- publishes no handbook" at the same time. The partial unique index stops two
  -- silences; this stops a silence beside a found resource.
  if new.review_status = 'published' then
    if new.field_state = 'source_did_not_state' and exists (
         select 1 from public.government_resources r
          where r.jurisdiction_id = new.jurisdiction_id
            and r.resource_type = new.resource_type
            and r.review_status = 'published'
            and r.field_state = 'verified_from_source'
            and r.id <> new.id) then
      raise exception 'cannot publish "the source did not state" for % while a found % is published for this jurisdiction', new.resource_type, new.resource_type
        using errcode = '23514';
    end if;
    if new.field_state = 'verified_from_source' and exists (
         select 1 from public.government_resources r
          where r.jurisdiction_id = new.jurisdiction_id
            and r.resource_type = new.resource_type
            and r.review_status = 'published'
            and r.field_state = 'source_did_not_state'
            and r.id <> new.id) then
      raise exception 'this jurisdiction publishes a "none published" record for %; supersede it before publishing a found resource', new.resource_type
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.review_status = 'published'
       and new.review_status not in ('published', 'superseded', 'retracted') then
      raise exception 'a published resource moves only to superseded or retracted, never back to %', new.review_status
        using errcode = '23514';
    end if;
    if old.first_published_at is not null and new.first_published_at is distinct from old.first_published_at then
      raise exception 'first_published_at is stamped once and never moved' using errcode = '23514';
    end if;
    v_content_changed :=
         new.field_state is distinct from old.field_state
      or new.url is distinct from old.url
      or new.label is distinct from old.label
      or new.phone is distinct from old.phone
      or new.email is distinct from old.email
      or new.contact_name is distinct from old.contact_name
      or new.contact_title is distinct from old.contact_title
      or new.department_name is distinct from old.department_name
      or new.notes is distinct from old.notes
      or new.source_url is distinct from old.source_url
      or new.source_checked_date is distinct from old.source_checked_date
      or new.review_status is distinct from old.review_status
      or new.verification_status is distinct from old.verification_status
      or new.superseded_or_repealed_date is distinct from old.superseded_or_repealed_date;
  end if;

  if new.review_status = 'published' then
    if new.first_published_at is null then new.first_published_at := now(); end if;
    if tg_op = 'INSERT' or v_content_changed or new.record_published_at is null then
      new.record_published_at := now();
    end if;
  end if;

  return new;
end;
$$;

-- ── nothing that has been published is ever deleted ─────────────────────────
-- A rule a homeowner may have acted on does not disappear. It is superseded or
-- retracted, both of which keep the row and both of which are dated. A draft that
-- was never published may be deleted, and its versions stay.
create or replace function public.regulatory_no_delete_after_publish()
returns trigger
language plpgsql
as $$
begin
  if old.first_published_at is not null then
    raise exception 'a record that has been published is never deleted (it was first published %); supersede or retract it instead', old.first_published_at
      using errcode = '42501';
  end if;
  if not public.regulatory_writer_is_aduatlas() then
    raise exception 'only ADUAtlas may remove a regulatory draft' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger regulatory_provisions_guard
  before insert or update on public.regulatory_provisions
  for each row execute function public.regulatory_provisions_guard();
create trigger regulatory_provisions_no_delete
  before delete on public.regulatory_provisions
  for each row execute function public.regulatory_no_delete_after_publish();
create trigger regulatory_provisions_set_updated_at
  before update on public.regulatory_provisions
  for each row execute function public.set_updated_at();
create trigger regulatory_provisions_version
  after insert or update or delete on public.regulatory_provisions
  for each row execute function public.regulatory_record_version();

create trigger government_resources_guard
  before insert or update on public.government_resources
  for each row execute function public.government_resources_guard();
create trigger government_resources_no_delete
  before delete on public.government_resources
  for each row execute function public.regulatory_no_delete_after_publish();
create trigger government_resources_set_updated_at
  before update on public.government_resources
  for each row execute function public.set_updated_at();
create trigger government_resources_version
  after insert or update or delete on public.government_resources
  for each row execute function public.regulatory_record_version();

-- ── a submission is a statement, and a statement is not edited ──────────────
create or replace function public.regulatory_submissions_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.kind <> old.kind
     or new.jurisdiction_id <> old.jurisdiction_id
     or new.entity_id <> old.entity_id
     or new.submitted_by_government_user_id <> old.submitted_by_government_user_id
     or new.topic_key is distinct from old.topic_key
     or new.resource_type is distinct from old.resource_type
     or new.payload <> old.payload
     or new.submitter_note is distinct from old.submitter_note
     or new.submitted_at <> old.submitted_at then
    raise exception 'what was submitted is immutable, including for ADUAtlas. Review it, or have the member withdraw and submit again, so both statements stay in the record.'
      using errcode = '42501';
  end if;
  -- Withdrawal is the one thing a member may do to their own submission, and it
  -- moves the status rather than editing the content.
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    new.status := 'withdrawn';
  end if;
  return new;
end;
$$;

create trigger regulatory_submissions_immutable
  before update on public.regulatory_submissions
  for each row execute function public.regulatory_submissions_immutable();

create trigger regulatory_submissions_set_updated_at
  before update on public.regulatory_submissions
  for each row execute function public.set_updated_at();

-- A submission is never deleted either: it is the government's side of the record.
create or replace function public.regulatory_submissions_no_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'a government submission is never deleted; it is the other half of the record (2m)'
    using errcode = '42501';
end;
$$;

create trigger regulatory_submissions_no_delete
  before delete on public.regulatory_submissions
  for each row execute function public.regulatory_submissions_no_delete();

-- ── audit for the participation layer: entities, memberships, grants ────────
-- SECURITY DEFINER for one reason: the audit tables take no INSERT from any API
-- role, so an authenticated member's own submission could not be logged by a
-- trigger running as `authenticated`. The definer body writes the log as the table
-- owner. It records the caller through regulatory_actor_api_role(), which reads the
-- verified JWT claim rather than current_user, so running as the owner does not
-- lose who actually did it.
create or replace function public.government_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  perform public.regulatory_audit(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    (v_row ->> 'jurisdiction_id')::uuid,
    coalesce((v_row ->> 'entity_id')::uuid, case when tg_table_name = 'government_entities' then (v_row ->> 'id')::uuid end),
    null,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end;
$$;

create trigger government_entities_audit
  after insert or update or delete on public.government_entities
  for each row execute function public.government_audit();
create trigger government_memberships_audit
  after insert or update or delete on public.government_memberships
  for each row execute function public.government_audit();
create trigger government_jurisdiction_grants_audit
  after insert or update or delete on public.government_jurisdiction_grants
  for each row execute function public.government_audit();
create trigger regulatory_submissions_audit
  after insert or update on public.regulatory_submissions
  for each row execute function public.government_audit();

-- ── verification is never written by a browser request ──────────────────────
-- The claim RPC writes claimed_at and a pending membership. It cannot verify, and
-- neither can anything else that runs as anon or authenticated. This is the
-- database half of "claiming never produces verification".
create or replace function public.government_entities_verification_guard()
returns trigger
language plpgsql
as $$
begin
  if public.regulatory_writer_is_aduatlas() then
    -- verified_at is OURS and the database owns it, the way record_published_at and
    -- 0011's work_started_at are owned: the date a government account was verified is
    -- shown to homeowners, so it is stamped where verification actually happens
    -- rather than passed in by whoever remembered the column. Un-verifying clears it,
    -- because a date that outlives the verification behind it is a lie with a
    -- timestamp on it. claimed_at is filled in for the same reason: ADUAtlas cannot
    -- verify an entity nobody claimed, so verification implies a claim by now.
    if new.verification_status = 'verified' then
      new.verified_at := coalesce(new.verified_at, now());
    else
      new.verified_at := null;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'government entities are created by ADUAtlas from authoritative public sources'
      using errcode = '42501';
  end if;
  if new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at
     or new.verification_note is distinct from old.verification_note
     or new.official_domains is distinct from old.official_domains
     or new.name is distinct from old.name
     or new.jurisdiction_id is distinct from old.jurisdiction_id then
    raise exception 'verification is ADUAtlas confirming authority, not a field a claimant can set. Claiming never produces verification (2m).'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger government_entities_verification_guard
  before insert or update on public.government_entities
  for each row execute function public.government_entities_verification_guard();



-- Membership verification and revocation are ADUAtlas's, for the same reason.
create or replace function public.government_memberships_guard()
returns trigger
language plpgsql
as $$
begin
  if public.regulatory_writer_is_aduatlas() then
    -- A revoked date and a live status must never disagree, however the revocation
    -- was written: a membership whose status still reads verified while a revoked
    -- date sits beside it is exactly the "permission that survives the authority
    -- behind it" that 2m calls the failure mode that matters. Either half implies
    -- the other, in the same statement.
    if new.revoked_at is not null and new.status <> 'revoked' then
      new.status := 'revoked';
    elsif new.status = 'revoked' and new.revoked_at is null then
      new.revoked_at := now();
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and (
       new.status is distinct from old.status
    or new.membership_role is distinct from old.membership_role
    or new.verified_at is distinct from old.verified_at
    or new.entity_id is distinct from old.entity_id
    or new.government_user_id is distinct from old.government_user_id) then
    raise exception 'a membership''s role, status and verification are set by ADUAtlas, never by the member'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger government_memberships_guard
  before insert or update on public.government_memberships
  for each row execute function public.government_memberships_guard();


-- =============================================================================
-- PART 9 — Row-Level Security
--
-- Supabase's ALTER DEFAULT PRIVILEGES hands anon and authenticated ALL on every
-- new table in schema public, so every table above is wide open until the revokes
-- below run. That is why each one is revoked first and granted back by name. A
-- forgotten revoke here is not a missing feature; it is the whole feature
-- inverted.
--
-- The shape, for all eleven tables:
--   anon             nothing. Not one table grant. The published data reaches an
--                    anonymous visitor only through the _public views in PART 10.
--   authenticated    named columns, RLS-scoped, on the government workspace only.
--   service_role     everything except writing history.
-- =============================================================================
alter table public.jurisdictions                    enable row level security;
alter table public.regulatory_topics                enable row level security;
alter table public.government_entities              enable row level security;
alter table public.government_users                 enable row level security;
alter table public.government_memberships           enable row level security;
alter table public.government_jurisdiction_grants   enable row level security;
alter table public.regulatory_provisions            enable row level security;
alter table public.government_resources             enable row level security;
alter table public.regulatory_submissions           enable row level security;
alter table public.regulatory_record_versions       enable row level security;
alter table public.regulatory_audit_log             enable row level security;

revoke all on public.jurisdictions                  from anon, authenticated;
revoke all on public.regulatory_topics              from anon, authenticated;
revoke all on public.government_entities            from anon, authenticated;
revoke all on public.government_users               from anon, authenticated;
revoke all on public.government_memberships         from anon, authenticated;
revoke all on public.government_jurisdiction_grants from anon, authenticated;
revoke all on public.regulatory_provisions          from anon, authenticated;
revoke all on public.government_resources           from anon, authenticated;
revoke all on public.regulatory_submissions         from anon, authenticated;

-- HISTORY IS APPEND-ONLY FOR EVERYBODY, INCLUDING THE ADMIN API. The triggers in
-- PART 8 write these two tables as the table owner, which no API key is. A stolen
-- service key can change what ADUAtlas publishes next; it cannot erase what was
-- published before, and it cannot delete the audit row that records the attempt.
revoke all on public.regulatory_record_versions from anon, authenticated, service_role;
revoke all on public.regulatory_audit_log       from anon, authenticated, service_role;
grant select on public.regulatory_record_versions to service_role;
grant select on public.regulatory_audit_log       to service_role;

-- ── jurisdictions: published geography is public data ───────────────────────
-- A signed-in person sees exactly the published rows an anonymous visitor sees
-- through jurisdictions_public. A government member additionally sees a
-- jurisdiction they hold a grant on before its page is published, because that is
-- the record they were asked to help with. Nobody else sees an unpublished row.
grant select (id, jurisdiction_type, parent_id, name, official_name, slug,
              state_code, path, county_fips, place_fips, published_at, research_note)
  on public.jurisdictions to authenticated;

create policy jurisdictions_select_published on public.jurisdictions
  for select to authenticated
  using (published_at is not null or public.government_may_read_jurisdiction(id));

-- ── regulatory_topics: a vocabulary, not data ───────────────────────────────
-- Readable by everyone, because the coverage view is built by LEFT JOINing it and
-- the client needs the labels to render a gap honestly.
grant select on public.regulatory_topics to anon, authenticated;
create policy regulatory_topics_select_all on public.regulatory_topics
  for select to anon, authenticated using (true);

-- ── government_entities: a member sees their own institution ────────────────
-- Internal columns (claim_note, verification_note, verified_by) are withheld by the
-- column grant, not by a view, so a SELECT * from a member returns only what they
-- may see. The public name and state reach anon through government_entities_public.
grant select (id, name, entity_type, jurisdiction_id, official_website_url,
              official_domains, source_url, claimed_at, verification_status,
              verified_at, created_at)
  on public.government_entities to authenticated;

create policy government_entities_select_member on public.government_entities
  for select to authenticated
  using (public.is_government_member_of(id));

-- ── government_users: your own person record ────────────────────────────────
grant select (id, user_id, full_name, job_title, work_email, phone, created_at)
  on public.government_users to authenticated;
grant update (full_name, job_title, work_email, phone)
  on public.government_users to authenticated;

create policy government_users_select_own on public.government_users
  for select to authenticated
  using (user_id = public.current_app_user_id());
create policy government_users_update_own on public.government_users
  for update to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
-- No INSERT policy: a person record is created by claim_government_entity(), which
-- is the one path that also records what they claimed and why.

-- ── government_memberships: your own, and your entity's if you administer it ─
grant select (id, entity_id, government_user_id, membership_role, status,
              requested_at, verified_at, revoked_at, created_at)
  on public.government_memberships to authenticated;

create policy government_memberships_select_own on public.government_memberships
  for select to authenticated
  using (
    government_user_id = public.current_government_user_id()
    or public.is_government_entity_administrator(entity_id)
  );
-- No INSERT, UPDATE or DELETE policy. A claim arrives through the RPC; a role,
-- a verification and a revocation are ADUAtlas's, and the PART 8 guard refuses
-- them from a browser even if a future migration grants the column by accident.

-- ── government_jurisdiction_grants: read your authority, never widen it ─────
grant select (id, entity_id, jurisdiction_id, may_submit, grant_basis,
              granted_at, revoked_at, revoked_reason)
  on public.government_jurisdiction_grants to authenticated;

create policy government_jurisdiction_grants_select_member on public.government_jurisdiction_grants
  for select to authenticated
  using (public.is_verified_government_member_of(entity_id));
-- No write policy of any kind. Authority is granted by ADUAtlas alone.

-- ── regulatory_provisions: the government workspace, scoped BY GRANT ────────
-- THIS IS THE POLICY THE WHOLE FEATURE RESTS ON. A member of the Arizona entity
-- selecting the Phoenix record gets ZERO ROWS, because the predicate asks whether
-- a live grant exists for exactly that jurisdiction id. It does not ask whether
-- Phoenix is inside Arizona, and jurisdictions.parent_id is not in the policy.
--
-- Published data is not withheld from them as people: they read it through
-- regulatory_provisions_public like any visitor. What the table withholds is the
-- MANAGEMENT view, which includes drafts, internal notes and everything not yet
-- published.
grant select on public.regulatory_provisions to authenticated;
create policy regulatory_provisions_select_granted on public.regulatory_provisions
  for select to authenticated
  using (public.government_may_read_jurisdiction(jurisdiction_id));
-- No INSERT, UPDATE or DELETE grant and no such policy, for any role but
-- service_role. A verified member SUBMITS; ADUAtlas publishes.

grant select on public.government_resources to authenticated;
create policy government_resources_select_granted on public.government_resources
  for select to authenticated
  using (public.government_may_read_jurisdiction(jurisdiction_id));

-- ── regulatory_submissions: submit inside your grant, read your own entity's ─
grant select (id, kind, jurisdiction_id, entity_id, submitted_by_government_user_id,
              topic_key, resource_type, target_provision_id, target_resource_id,
              conflicts_with_provision_id, payload, submitter_note, status,
              review_note, reviewed_at, resulting_provision_id, resulting_resource_id,
              withdrawn_at, submitted_at)
  on public.regulatory_submissions to authenticated;
grant insert (kind, jurisdiction_id, entity_id, submitted_by_government_user_id,
              topic_key, resource_type, target_provision_id, target_resource_id,
              conflicts_with_provision_id, payload, submitter_note)
  on public.regulatory_submissions to authenticated;
-- The ONE column a member may change afterwards. status follows it by trigger, and
-- the immutability trigger refuses everything else.
grant update (withdrawn_at) on public.regulatory_submissions to authenticated;

create policy regulatory_submissions_select_own_entity on public.regulatory_submissions
  for select to authenticated
  using (public.is_verified_government_member_of(entity_id));

-- Four conditions, all explicit: the row is submitted as this person, on behalf of
-- an entity they are a verified contributor of, for a jurisdiction that entity holds
-- a live submit grant on, and in a state that has not already been reviewed.
create policy regulatory_submissions_insert_granted on public.regulatory_submissions
  for insert to authenticated
  with check (
    submitted_by_government_user_id = public.current_government_user_id()
    and public.government_may_submit_as(entity_id, jurisdiction_id)
    and status = 'submitted'
    and reviewed_at is null
    and resulting_provision_id is null
    and resulting_resource_id is null
    and withdrawn_at is null
  );

create policy regulatory_submissions_withdraw_own on public.regulatory_submissions
  for update to authenticated
  using (
    submitted_by_government_user_id = public.current_government_user_id()
    and status = 'submitted'
    and withdrawn_at is null
  )
  with check (submitted_by_government_user_id = public.current_government_user_id());


-- =============================================================================
-- PART 10 — the public surface: views, and only published rows
--
-- These views are the ONLY way an anonymous visitor or a homeowner reaches
-- regulatory data. They are owned by the migration role, so they read past RLS by
-- design; every one of them therefore filters review_status = 'published',
-- excludes a superseded or retracted record, and joins the jurisdiction on
-- published_at so an unpublished jurisdiction leaks nothing hanging off it.
--
-- They also withhold every internal column: admin_note, claim_note,
-- verification_note, source_submission_id and the reviewer identities are in none
-- of them.
--
-- TWO ATTRIBUTIONS, NEVER ONE COLUMN. source_is_official_government says the rule
-- was read off an official government source. provided_by_entity_name is non-null
-- ONLY when a verified government account supplied it. A rule ADUAtlas read off
-- phoenix.gov has the first and not the second, because using a government's
-- website as a source does not mean that government takes part in ADUAtlas (2m).
-- =============================================================================

create view public.jurisdictions_public as
  select j.id,
         j.jurisdiction_type,
         j.parent_id,
         j.name,
         j.official_name,
         j.slug,
         j.state_code,
         j.path,
         j.research_note,
         j.published_at
    from public.jurisdictions j
   where j.published_at is not null;

comment on view public.jurisdictions_public is
  'Published jurisdictions. All fifty states and DC are published by migration 0012, so the tree an anonymous visitor can browse is nationwide on day one. parent_id is here for breadcrumbs: display, never permission.';

create view public.regulatory_provisions_public as
  select p.id,
         p.jurisdiction_id,
         j.state_code,
         j.path            as jurisdiction_path,
         j.name            as jurisdiction_name,
         j.official_name   as jurisdiction_official_name,
         j.jurisdiction_type,
         p.topic_key,
         t.category        as topic_category,
         t.label           as topic_label,
         t.question        as topic_question,
         t.value_kind,
         coalesce(p.value_unit, t.value_unit) as value_unit,
         -- The three states, exactly as stored. The interface must render
         -- source_did_not_state differently from a value and must never fill it in.
         p.field_state,
         p.value_text,
         p.value_numeric,
         p.value_boolean,
         p.value_qualifier,
         -- provenance, as two separate facts
         p.source_url,
         p.source_document_title,
         p.source_citation,
         p.source_type,
         (p.source_url is not null and p.source_type is not null) as source_is_official_government,
         case when p.supplied_by = 'government_account'
                   and e.verification_status = 'verified'
              then e.name end as provided_by_entity_name,
         case when p.supplied_by = 'government_account'
                   and e.verification_status = 'verified'
              then e.id end   as provided_by_entity_id,
         p.verification_status,
         -- the four dates, four columns, never merged
         p.effective_date,
         p.source_checked_date,
         p.record_published_at,
         p.superseded_or_repealed_date
    from public.regulatory_provisions p
    join public.jurisdictions j     on j.id = p.jurisdiction_id and j.published_at is not null
    join public.regulatory_topics t on t.key = p.topic_key
    left join public.government_entities e on e.id = p.supplied_by_entity_id
   where p.is_published;

comment on view public.regulatory_provisions_public is
  'The published regulatory database, and the only route an anonymous visitor or a homeowner has into it. Drafts, submissions, internal notes and superseded rules are not here. source_is_official_government and provided_by_entity_name are deliberately two columns: a rule read off a government website is not a rule a government participated in.';

create view public.government_resources_public as
  select r.id,
         r.jurisdiction_id,
         j.state_code,
         j.path          as jurisdiction_path,
         j.name          as jurisdiction_name,
         j.jurisdiction_type,
         r.resource_type,
         r.field_state,
         r.label, r.url, r.phone, r.email,
         r.contact_name, r.contact_title, r.department_name, r.address, r.hours, r.notes,
         r.source_url,
         r.source_type,
         (r.source_url is not null) as source_is_official_government,
         case when r.supplied_by = 'government_account' and e.verification_status = 'verified'
              then e.name end as provided_by_entity_name,
         r.effective_date,
         r.source_checked_date,
         r.record_published_at,
         r.superseded_or_repealed_date,
         r.sort_order
    from public.government_resources r
    join public.jurisdictions j on j.id = r.jurisdiction_id and j.published_at is not null
    left join public.government_entities e on e.id = r.supplied_by_entity_id
   where r.is_published;

comment on view public.government_resources_public is
  'Published official links and contacts. A row with field_state = source_did_not_state is ADUAtlas saying it looked and this jurisdiction publishes no such resource, which is an answer; it is never rendered as a missing link.';

-- ── the three states, per jurisdiction and per topic, INCLUDING THE ABSENT ONE ─
-- The LEFT JOIN is the point. Every (published jurisdiction × topic) pair gets a
-- row, and a pair with no published provision comes back as 'not_yet_researched'
-- BY NAME. That is what makes the third state queryable rather than implied, and it
-- is why the product can be honest about coverage without anybody maintaining a
-- "percent complete" column that could drift from the data.
create view public.jurisdiction_topic_coverage as
  select j.id            as jurisdiction_id,
         j.state_code,
         j.path          as jurisdiction_path,
         j.jurisdiction_type,
         t.key           as topic_key,
         t.category      as topic_category,
         t.label         as topic_label,
         t.question      as topic_question,
         t.sort_order,
         coalesce(p.field_state, 'not_yet_researched') as field_state,
         p.id            as provision_id,
         p.source_checked_date,
         p.record_published_at
    from public.jurisdictions j
   cross join public.regulatory_topics t
    left join public.regulatory_provisions p
           on p.jurisdiction_id = j.id
          and p.topic_key = t.key
          and p.is_published
   where j.published_at is not null;

comment on view public.jurisdiction_topic_coverage is
  'Every topic for every published jurisdiction, in exactly one of the three states of decision 2b. A pair with no published provision returns not_yet_researched BY NAME: this view is the single place the third state is produced, which is what makes "source did not state" and "not yet researched" distinguishable by query rather than by inference.';

-- ── coverage, derived rather than stored ────────────────────────────────────
-- Nothing here is a column somebody maintains. A stored "coverage" or "complete"
-- flag is exactly the thing that drifts from the data and starts making a page look
-- researched when it is not, so coverage is counted from the published rows every
-- time it is asked for.
create view public.jurisdiction_coverage_public as
  select j.id as jurisdiction_id,
         j.state_code,
         j.path as jurisdiction_path,
         j.jurisdiction_type,
         j.name,
         (select count(*) from public.regulatory_topics) as topics_tracked,
         count(*) filter (where c.field_state = 'verified_from_source')  as topics_verified,
         count(*) filter (where c.field_state = 'source_did_not_state')  as topics_source_silent,
         count(*) filter (where c.field_state = 'not_yet_researched')    as topics_not_researched,
         (select count(*) from public.government_resources_public r where r.jurisdiction_id = j.id)
           as resources_published,
         max(c.source_checked_date)  as last_source_checked_date,
         max(c.record_published_at)  as last_record_published_at,
         -- INDEXABILITY IS NOT PUBLICATION (2l: "does not generate thousands of thin
         -- pages carrying essentially no verified information"). A state page exists
         -- for all fifty states from day one; it asks search engines to index it only
         -- once it carries real verified content. One threshold, one place.
         (count(*) filter (where c.field_state = 'verified_from_source') >= 5
          or (select count(*) from public.government_resources_public r where r.jurisdiction_id = j.id) >= 3)
           as is_indexable
    from public.jurisdictions j
    left join public.jurisdiction_topic_coverage c on c.jurisdiction_id = j.id
   where j.published_at is not null
   group by j.id, j.state_code, j.path, j.jurisdiction_type, j.name;

comment on view public.jurisdiction_coverage_public is
  'Coverage counted from the published rows, never stored. topics_not_researched is a first-class number the product is expected to show: incomplete is allowed and fabrication is not. is_indexable is the 2l search rule (enough verified content to justify a page), which is a different question from whether the page is published.';

-- ── the entity, publicly, with its state and nothing implied ────────────────
create view public.government_entities_public as
  select e.id,
         e.name,
         e.entity_type,
         e.jurisdiction_id,
         j.path as jurisdiction_path,
         e.official_website_url,
         public.government_entity_state(e.id) as entity_state,
         e.verified_at
    from public.government_entities e
    join public.jurisdictions j on j.id = e.jurisdiction_id;

comment on view public.government_entities_public is
  'Entities as the product may show them. entity_state is unclaimed, claimed or verified, and an UNCLAIMED row must never be rendered in a way that implies the government participates in ADUAtlas: ADUAtlas compiled it from public sources. The badge copy ("Verified Government Account", with the entity name beneath it) lives in src/lib/regulatory.js so it is written once and is never confused with the builder badge.';

-- ── history a homeowner may see: what this rule said before ─────────────────
create view public.regulatory_provision_history_public as
  select v.record_id as provision_id,
         v.version_no,
         v.jurisdiction_id,
         v.topic_or_type as topic_key,
         v.field_state,
         v.value_summary,
         v.source_url,
         v.effective_date,
         v.source_checked_date,
         v.record_published_at,
         v.superseded_or_repealed_date
    from public.regulatory_record_versions v
    join public.jurisdictions j on j.id = v.jurisdiction_id and j.published_at is not null
   where v.record_type = 'provision'
     and v.review_status = 'published';

comment on view public.regulatory_provision_history_public is
  'What a published rule said before it was corrected or superseded. Only versions that were themselves published: a draft that was never public never becomes public through history. This is the visible half of "previous versions are retained immutably".';

-- ── the display stack: state, county and city, side by side, never merged ───
-- 2m: "A homeowner viewing Phoenix sees Arizona, Maricopa County and Phoenix as
-- distinct sourced answers, and property-specific as not determined. Conflicting
-- rules are never merged into one invented answer."
--
-- So this returns ONE ROW PER (level, topic) and deliberately does NOT pick a
-- winner. If Arizona and Phoenix both answer max_size with different numbers, the
-- caller receives both, each with its own source and its own dates, and the
-- interface shows both. Choosing would be inventing an answer no government gave.
--
-- It is built on the ancestor chain, which is DISPLAY. It grants nothing: every row
-- it can return is already published and already readable by anyone.
create or replace function public.jurisdiction_rule_stack(p_jurisdiction_id uuid)
returns table (
  level_depth int, jurisdiction_id uuid, jurisdiction_name text, jurisdiction_type text,
  topic_key text, topic_category text, topic_label text, topic_question text,
  field_state text, value_text text, value_numeric numeric, value_unit text,
  value_boolean boolean, value_qualifier text,
  source_url text, source_document_title text, source_type text,
  source_is_official_government boolean, provided_by_entity_name text,
  effective_date date, source_checked_date date, record_published_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select a.depth, p.jurisdiction_id, a.name, a.jurisdiction_type,
         p.topic_key, p.topic_category, p.topic_label, p.topic_question,
         p.field_state, p.value_text, p.value_numeric, p.value_unit,
         p.value_boolean, p.value_qualifier,
         p.source_url, p.source_document_title, p.source_type,
         p.source_is_official_government, p.provided_by_entity_name,
         p.effective_date, p.source_checked_date, p.record_published_at
    from public.jurisdiction_ancestors(p_jurisdiction_id) a
    join public.regulatory_provisions_public p on p.jurisdiction_id = a.id
   order by p.topic_key, a.depth;
$$;

comment on function public.jurisdiction_rule_stack(uuid) is
  'The rules that a homeowner looking at one jurisdiction should see: this jurisdiction and every jurisdiction above it, ONE ROW PER LEVEL PER TOPIC, never merged and never resolved. If a state and a city disagree, the caller gets both with their sources. DISPLAY, built on the display-only ancestor chain; it grants nothing, because every row is already published.';

-- ── the version history, under the name the admin console uses ──────────────
-- api/admin/_regulatory.js reads and appends history as `regulatory_versions`, with
-- its own column names, and aborts a save when it cannot record one ("history
-- lost"). This view is that surface, mapped onto the one real table, so there is
-- ONE history rather than two that can disagree.
--
-- APPEND IS NOT REWRITE. The view carries SELECT and INSERT for service_role and
-- nothing else: no UPDATE, no DELETE, and nothing at all for anon or authenticated.
-- The admin console may add a snapshot with the operator's note beside the row the
-- database wrote by itself; it cannot alter or remove either. That is the whole of
-- the guarantee in 2m, and it survives a stolen service key: history can grow and
-- can never be edited or erased through the API.
create view public.regulatory_versions as
  select v.id,
         v.record_type  as target_kind,
         v.record_id    as target_id,
         v.version_no   as version,
         v.snapshot,
         v.change_note,
         v.source,
         v.submission_id,
         v.actor_app_user_id as created_by,
         v.recorded_at  as created_at,
         v.change_kind,
         v.jurisdiction_id,
         v.topic_or_type,
         v.field_state,
         v.review_status,
         v.value_summary
    from public.regulatory_record_versions v;

comment on view public.regulatory_versions is
  'The admin console''s name and column spelling for public.regulatory_record_versions, so the console and the database share one history instead of keeping two. SELECT and INSERT for service_role only: appending a snapshot is allowed, and altering or deleting one is not, for anybody, through any API role.';

revoke all on public.regulatory_versions from anon, authenticated, service_role;
grant select, insert on public.regulatory_versions to service_role;

revoke all on public.jurisdictions_public                  from anon, authenticated;
revoke all on public.regulatory_provisions_public          from anon, authenticated;
revoke all on public.government_resources_public           from anon, authenticated;
revoke all on public.jurisdiction_topic_coverage           from anon, authenticated;
revoke all on public.jurisdiction_coverage_public          from anon, authenticated;
revoke all on public.government_entities_public            from anon, authenticated;
revoke all on public.regulatory_provision_history_public   from anon, authenticated;

grant select on public.jurisdictions_public                to anon, authenticated;
grant select on public.regulatory_provisions_public        to anon, authenticated;
grant select on public.government_resources_public         to anon, authenticated;
grant select on public.jurisdiction_topic_coverage         to anon, authenticated;
grant select on public.jurisdiction_coverage_public        to anon, authenticated;
grant select on public.government_entities_public          to anon, authenticated;
grant select on public.regulatory_provision_history_public to anon, authenticated;

grant execute on function public.jurisdiction_rule_stack(uuid) to anon, authenticated, service_role;


-- =============================================================================
-- PART 11 — the two functions a signed-in person may call, and the seven Amy's
--           console may call
--
-- The government side has exactly two entry points, both narrow:
--   claim_government_entity()  claims an entity, which produces a CLAIM and a
--                              PENDING membership, and never a verification.
--   my_government_context()    read-only: who am I, which entities, which
--                              memberships, which grants. It is the honest answer
--                              to "what can I do here", and for a pending member
--                              the answer is "wait".
--
-- The admin side is granted to service_role ONLY, which is the credential
-- /api/admin/* holds. They are SECURITY DEFINER because the audit log takes no
-- insert from any API role, and every one of them takes p_actor_app_user_id: "the
-- service key did it" is not an answer to who did it.
-- =============================================================================

-- ── claiming: a claim, never a verification ─────────────────────────────────
create or replace function public.claim_government_entity(
  p_entity_id  uuid,
  p_full_name  text,
  p_job_title  text,
  p_work_email citext,
  p_phone      text default null,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app_user uuid := public.current_app_user_id();
  v_gov_user uuid;
  v_entity   record;
  v_membership uuid;
  v_existing text;
begin
  if v_app_user is null then
    raise exception 'sign in before claiming a government entity' using errcode = '42501';
  end if;
  select id, name, claimed_at, verification_status into v_entity
    from public.government_entities where id = p_entity_id;
  if v_entity.id is null then
    raise exception 'that government entity does not exist' using errcode = 'no_dat';
  end if;
  if p_full_name is null or length(btrim(p_full_name)) = 0
     or p_work_email is null or position('@' in p_work_email) = 0 then
    raise exception 'a claim needs your name and your work email address' using errcode = '22023';
  end if;

  insert into public.government_users (user_id, full_name, job_title, work_email, phone)
  values (v_app_user, btrim(p_full_name), p_job_title, lower(p_work_email), p_phone)
  on conflict (user_id) do update
    set full_name  = coalesce(excluded.full_name, public.government_users.full_name),
        job_title  = coalesce(excluded.job_title, public.government_users.job_title),
        work_email = coalesce(excluded.work_email, public.government_users.work_email),
        phone      = coalesce(excluded.phone, public.government_users.phone),
        updated_at = now()
  returning id into v_gov_user;

  -- A live membership already exists: report its state rather than creating a
  -- second one. Re-claiming is not an escalation path.
  select id, status into v_membership, v_existing
    from public.government_memberships
   where entity_id = p_entity_id
     and government_user_id = v_gov_user
     and status in ('pending', 'verified');

  if v_membership is null then
    insert into public.government_memberships
      (entity_id, government_user_id, membership_role, status, request_note)
    values (p_entity_id, v_gov_user, 'contributor', 'pending', p_note)
    returning id, status into v_membership, v_existing;
  end if;

  -- The entity becomes CLAIMED. verification_status is deliberately untouched:
  -- claiming never produces verification, and the PART 8 guard would refuse it here
  -- anyway if this function tried.
  if v_entity.claimed_at is null then
    update public.government_entities
       set claimed_at = now(),
           claim_note = coalesce(p_note, claim_note)
     where id = p_entity_id;
  end if;

  perform public.regulatory_audit(
    'government_entity.claimed', 'government_entities', p_entity_id, null, p_entity_id,
    array['claimed_at'], null,
    jsonb_build_object('membership_id', v_membership, 'government_user_id', v_gov_user),
    p_note, v_app_user);

  return jsonb_build_object(
    'ok', true,
    'entity_id', p_entity_id,
    'entity_name', v_entity.name,
    'entity_state', public.government_entity_state(p_entity_id),
    'membership_id', v_membership,
    'membership_status', v_existing,
    -- Said plainly in the return value so no interface can imply otherwise.
    'verified', false,
    'next_step', 'ADUAtlas reviews the claim and confirms your authority to represent this entity. A claim is not a verification, and verification is not a publishing right.');
end;
$$;

comment on function public.claim_government_entity(uuid, text, text, citext, text, text) is
  'Claims a government entity: creates the person record, a PENDING membership and the entity''s claimed_at. It cannot verify anybody and it cannot grant authority over any jurisdiction. Claiming never produces verification (2m).';

revoke execute on function public.claim_government_entity(uuid, text, text, citext, text, text) from public, anon;
grant  execute on function public.claim_government_entity(uuid, text, text, citext, text, text) to authenticated;

-- ── what can I do here? ─────────────────────────────────────────────────────
create or replace function public.my_government_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'government_user', (
      select jsonb_build_object('id', gu.id, 'full_name', gu.full_name,
                                'job_title', gu.job_title, 'work_email', gu.work_email)
        from public.government_users gu
        join public.users u on u.id = gu.user_id
       where u.auth_user_id = auth.uid()),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'membership_id', m.id,
               'entity_id', e.id,
               'entity_name', e.name,
               'entity_type', e.entity_type,
               'entity_state', public.government_entity_state(e.id),
               'membership_role', m.membership_role,
               'membership_status', m.status,
               'verified_at', m.verified_at,
               'revoked_at', m.revoked_at,
               -- The authority, enumerated. Never derived, so there is nothing to
               -- infer here either: what is listed is what exists.
               'jurisdictions', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'jurisdiction_id', j.id, 'name', j.name, 'path', j.path,
                           'jurisdiction_type', j.jurisdiction_type,
                           'may_submit', g.may_submit)
                           order by j.path)
                    from public.government_jurisdiction_grants g
                    join public.jurisdictions j on j.id = g.jurisdiction_id
                   where g.entity_id = e.id
                     and g.revoked_at is null
                     and m.status = 'verified'), '[]'::jsonb))
               order by e.name)
        from public.government_memberships m
        join public.government_users gu on gu.id = m.government_user_id
        join public.users u on u.id = gu.user_id
        join public.government_entities e on e.id = m.entity_id
       where u.auth_user_id = auth.uid()), '[]'::jsonb));
$$;

comment on function public.my_government_context() is
  'Read-only: who the caller is, which entities they have a membership of, in which state, and the EXPLICIT list of jurisdictions each verified membership may work on. A pending member sees their claim and an empty jurisdiction list, which is the honest answer.';

revoke execute on function public.my_government_context() from public, anon;
grant  execute on function public.my_government_context() to authenticated;

-- =============================================================================
-- the admin surface: service_role only. Five areas, per decision 2f, and this file
-- touches two of them: government entity claims, and reviewing and publishing
-- government submissions.
-- =============================================================================

create or replace function public.admin_verify_government_membership(
  p_membership_id uuid, p_actor_app_user_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare m record;
begin
  select * into m from public.government_memberships where id = p_membership_id;
  if m.id is null then raise exception 'no such membership'; end if;
  if m.status = 'revoked' then raise exception 'a revoked membership is not verified; the person claims again'; end if;

  update public.government_memberships
     set status = 'verified', verified_at = now(), verified_by_app_user_id = p_actor_app_user_id
   where id = p_membership_id;

  -- The entity becomes VERIFIED because a person authorised to represent it has been
  -- confirmed. Note what this does NOT do: it grants authority over no jurisdiction,
  -- not even the entity's own seat. That is a separate, explicit act below.
  update public.government_entities
     set verification_status = 'verified',
         verified_at = coalesce(verified_at, now()),
         verified_by_app_user_id = p_actor_app_user_id,
         verification_note = coalesce(p_note, verification_note),
         claimed_at = coalesce(claimed_at, now())
   where id = m.entity_id;

  perform public.regulatory_audit('membership.verified', 'government_memberships', p_membership_id,
    null, m.entity_id, array['status','verified_at'], to_jsonb(m), null, p_note, p_actor_app_user_id);

  return jsonb_build_object('ok', true, 'membership_id', p_membership_id,
    'entity_state', public.government_entity_state(m.entity_id),
    'jurisdictions_granted', 0,
    'note', 'Verification is identity. It is not a publishing right and it grants authority over no jurisdiction: use admin_grant_jurisdiction_authority for that, one record at a time.');
end;
$$;

create or replace function public.admin_revoke_government_membership(
  p_membership_id uuid, p_actor_app_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare m record;
begin
  select * into m from public.government_memberships where id = p_membership_id;
  if m.id is null then raise exception 'no such membership'; end if;

  update public.government_memberships
     set status = 'revoked', revoked_at = now(),
         revoked_by_app_user_id = p_actor_app_user_id, revoked_reason = p_reason
   where id = p_membership_id;

  perform public.regulatory_audit('membership.revoked', 'government_memberships', p_membership_id,
    null, m.entity_id, array['status','revoked_at'], to_jsonb(m), null, p_reason, p_actor_app_user_id);

  -- The entity is untouched. This is the point of modelling membership separately:
  -- a person leaving is not an institution leaving, and the entity's other members
  -- keep working.
  return jsonb_build_object('ok', true, 'membership_id', p_membership_id,
    'entity_state', public.government_entity_state(m.entity_id));
end;
$$;

create or replace function public.admin_grant_jurisdiction_authority(
  p_entity_id uuid, p_jurisdiction_id uuid, p_actor_app_user_id uuid,
  p_grant_basis text, p_may_submit boolean default true)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.government_jurisdiction_grants
    (entity_id, jurisdiction_id, may_submit, grant_basis, granted_by_app_user_id)
  values (p_entity_id, p_jurisdiction_id, p_may_submit, p_grant_basis, p_actor_app_user_id)
  returning id into v_id;

  perform public.regulatory_audit('grant.created', 'government_jurisdiction_grants', v_id,
    p_jurisdiction_id, p_entity_id, array['jurisdiction_id','may_submit'], null,
    jsonb_build_object('may_submit', p_may_submit), p_grant_basis, p_actor_app_user_id);
  return v_id;
end;
$$;

comment on function public.admin_grant_jurisdiction_authority(uuid, uuid, uuid, text, boolean) is
  'Grants ONE entity authority over ONE jurisdiction record, with a recorded reason. There is no bulk form and no "and everything beneath it": granting a state authority over its cities means inserting a row per city, deliberately, because that is what delegating authority actually is.';

create or replace function public.admin_revoke_jurisdiction_authority(
  p_grant_id uuid, p_actor_app_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare g record;
begin
  select * into g from public.government_jurisdiction_grants where id = p_grant_id;
  if g.id is null then raise exception 'no such grant'; end if;
  update public.government_jurisdiction_grants
     set revoked_at = now(), revoked_by_app_user_id = p_actor_app_user_id, revoked_reason = p_reason
   where id = p_grant_id;
  perform public.regulatory_audit('grant.revoked', 'government_jurisdiction_grants', p_grant_id,
    g.jurisdiction_id, g.entity_id, array['revoked_at'], to_jsonb(g), null, p_reason, p_actor_app_user_id);
  return jsonb_build_object('ok', true, 'grant_id', p_grant_id);
end;
$$;

-- ── publication: the only route, and service_role only ──────────────────────
create or replace function public.admin_publish_provision(
  p_provision_id uuid, p_actor_app_user_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p record;
  v_superseded uuid;
begin
  select * into p from public.regulatory_provisions where id = p_provision_id;
  if p.id is null then raise exception 'no such provision'; end if;
  if p.review_status not in ('draft', 'in_review') then
    raise exception 'only a draft or a record in review is published; this one is %', p.review_status;
  end if;

  -- Supersede the rule this one replaces. THE OLD ROW IS KEPT: it is dated, it is
  -- linked forwards, and regulatory_provision_history_public can still show what it
  -- said. Nothing is overwritten and nothing disappears.
  update public.regulatory_provisions
     set review_status = 'superseded',
         superseded_or_repealed_date = coalesce(p.effective_date, current_date),
         superseded_by_provision_id  = p_provision_id
   where jurisdiction_id = p.jurisdiction_id
     and topic_key = p.topic_key
     and review_status = 'published'
     and superseded_or_repealed_date is null
     and id <> p_provision_id
  returning id into v_superseded;

  update public.regulatory_provisions
     set review_status = 'published'
   where id = p_provision_id;

  perform public.regulatory_audit('provision.published', 'regulatory_provisions', p_provision_id,
    p.jurisdiction_id, p.supplied_by_entity_id, array['review_status','record_published_at'],
    to_jsonb(p), null, p_note, p_actor_app_user_id);

  return jsonb_build_object('ok', true, 'provision_id', p_provision_id,
    'superseded_provision_id', v_superseded);
end;
$$;

create or replace function public.admin_publish_resource(
  p_resource_id uuid, p_actor_app_user_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  select * into r from public.government_resources where id = p_resource_id;
  if r.id is null then raise exception 'no such resource'; end if;
  if r.review_status not in ('draft', 'in_review') then
    raise exception 'only a draft or a record in review is published; this one is %', r.review_status;
  end if;
  update public.government_resources set review_status = 'published' where id = p_resource_id;
  perform public.regulatory_audit('resource.published', 'government_resources', p_resource_id,
    r.jurisdiction_id, r.supplied_by_entity_id, array['review_status'], to_jsonb(r), null,
    p_note, p_actor_app_user_id);
  return jsonb_build_object('ok', true, 'resource_id', p_resource_id);
end;
$$;

-- ── reviewing a submission, WITHOUT destroying either side of the record ────
create or replace function public.admin_review_submission(
  p_submission_id uuid, p_actor_app_user_id uuid, p_decision text,
  p_note text default null,
  p_resulting_provision_id uuid default null,
  p_resulting_resource_id  uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare s record;
begin
  if p_decision not in ('in_review', 'accepted', 'partially_accepted', 'rejected') then
    raise exception 'decision must be in_review, accepted, partially_accepted or rejected';
  end if;
  select * into s from public.regulatory_submissions where id = p_submission_id;
  if s.id is null then raise exception 'no such submission'; end if;
  if s.status = 'withdrawn' then raise exception 'that submission was withdrawn'; end if;

  -- Only the review columns move. The payload, the submitter and the date are
  -- immutable, and the PART 8 trigger refuses a change to them even from here: a
  -- rejected submission stays legible so the entity can see what it said and what
  -- ADUAtlas said back.
  update public.regulatory_submissions
     set status = p_decision,
         review_note = coalesce(p_note, review_note),
         reviewed_by_app_user_id = p_actor_app_user_id,
         reviewed_at = now(),
         resulting_provision_id = coalesce(p_resulting_provision_id, resulting_provision_id),
         resulting_resource_id  = coalesce(p_resulting_resource_id, resulting_resource_id)
   where id = p_submission_id;

  perform public.regulatory_audit('submission.' || p_decision, 'regulatory_submissions',
    p_submission_id, s.jurisdiction_id, s.entity_id, array['status','review_note'],
    to_jsonb(s), null, p_note, p_actor_app_user_id);

  return jsonb_build_object('ok', true, 'submission_id', p_submission_id, 'status', p_decision,
    'note', 'Accepting a submission does not publish it. What the government submitted and what ADUAtlas publishes are both kept.');
end;
$$;

revoke execute on function public.admin_verify_government_membership(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_revoke_government_membership(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_grant_jurisdiction_authority(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_revoke_jurisdiction_authority(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_publish_provision(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_publish_resource(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_review_submission(uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.admin_verify_government_membership(uuid, uuid, text) to service_role;
grant execute on function public.admin_revoke_government_membership(uuid, uuid, text) to service_role;
grant execute on function public.admin_grant_jurisdiction_authority(uuid, uuid, uuid, text, boolean) to service_role;
grant execute on function public.admin_revoke_jurisdiction_authority(uuid, uuid, text) to service_role;
grant execute on function public.admin_publish_provision(uuid, uuid, text) to service_role;
grant execute on function public.admin_publish_resource(uuid, uuid, text) to service_role;
grant execute on function public.admin_review_submission(uuid, uuid, text, text, uuid, uuid) to service_role;


-- =============================================================================
-- PART 12 — what 0012 deliberately does NOT do
--
--   • No government billing, no plan, no price. Government accounts are free (2m).
--   • No automatic verification from an email domain. official_domains is evidence
--     for Amy, and a matching domain verifies nobody.
--   • No authority derived from geography, in any form: no wildcard grant, no
--     "and its children", no trigger that grants an entity its own seat. Every
--     capability is one row naming one jurisdiction.
--   • No property or parcel data, and no feasibility determination. The typed value
--     columns exist so the dataset can feed that workflow later; a jurisdiction rule
--     is never proof that a particular property can build (2l, 2m).
--   • No permit determination. That is a jurisdiction approving a real project and
--     ADUAtlas does not represent it at all.
--   • No new users.role value. A government person is an ordinary authenticated
--     user; their capability lives in a membership, so the 0001 signup clamp and the
--     admin bootstrap in 0010 are untouched.
--   • No delete path for anything published, and no edit path for a submission.
--   • No county or city rows. Fifty states and DC are seeded because "nationwide" is
--     structural; counties and municipalities are data, added progressively through
--     Amy's console, launch markets first.
--   • No seeded regulatory provision. Not one. A single invented setback would be
--     worse than an empty database, and every page can already say honestly that a
--     jurisdiction has not been researched yet.
-- =============================================================================
