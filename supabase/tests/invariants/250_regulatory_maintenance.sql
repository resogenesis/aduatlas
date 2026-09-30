-- =============================================================================
-- INVARIANT: ADUAtlas can always maintain its published rules, and a published
-- rule never tells a homeowner something untrue.
--
-- Three defects found 2026-09-26. They surfaced while comparing the frozen Rules
-- and Resources schema against a competitor's city pages, but nothing here comes
-- from the competitor: each one is a defect in OUR schema, reproduced by this file
-- against the unfixed chain before any fix was written.
--
--   E1  Publishing a rule whose effective date is in the FUTURE superseded the
--       rule in force immediately. A homeowner saw a rule that did not apply yet
--       and lost the one that did. 0012 documents future effective dates as "a
--       real and common shape" because "a homeowner planning a build needs to
--       know which rule applies to them". Retiring a rule with a future repeal
--       date hid it the same way.
--   E2  Once a government's identity verification was WITHDRAWN (0020, 2s D4),
--       ADUAtlas could no longer supersede or retract a rule that government had
--       supplied: the guard re-checked "the supplier is verified" on every update,
--       including the move to superseded or retracted. A wrong rule could not be
--       pulled and a corrected one could not be published, exactly when the
--       supplier's standing had just been withdrawn.
--   E3  A government resource claimed "official government source" from its
--       source URL alone, while a rule needs a source URL AND a source type.
--       Every allowed source type is an official one, so the type is what makes
--       the claim true (the separation of fact classes, 2t).
--
-- What must NOT change, and is asserted here as well: a suspended government is
-- never credited with new or edited content, and ordinary publishing still
-- supersedes the rule it replaces.
-- =============================================================================
select t.suite('250 regulatory maintenance (2l, 2m, 2s)');

-- ── the government fixtures this file needs ─────────────────────────────────
-- Exact copies of the helpers 190, 200 and 240 define (byte-identical there).
-- Every file carries its own, because files must not depend on each other or on
-- their order, and run.sh --target runs each one alone.
create or replace function t.gov_jur(p_type text, p_parent uuid, p_name text, p_state text default null)
returns uuid
language plpgsql
as $fn$
declare
  v_id uuid;
begin
  if p_parent is null then
    select id into v_id from public.jurisdictions
     where state_code = p_state and jurisdiction_type = p_type limit 1;
    if v_id is not null then return v_id; end if;
    select id into p_parent from public.jurisdictions where jurisdiction_type = 'country' limit 1;
  end if;
  insert into public.jurisdictions (jurisdiction_type, parent_id, name, official_name, slug, state_code, published_at)
  values (p_type, p_parent, p_name, p_name, t.nextlabel('gov-jur'), p_state, now())
  returning id into v_id;
  return v_id;
end
$fn$;

create or replace function t.gov_entity(p_jurisdiction uuid, p_type text, p_name text)
returns uuid
language plpgsql
as $fn$
declare v_id uuid;
begin
  insert into public.government_entities
    (name, entity_type, jurisdiction_id, official_website_url, official_domains, source_url)
  values (p_name || ' ' || t.nextlabel('ent'), p_type, p_jurisdiction,
          'https://www.example.gov/planning', array['example.gov'],
          'https://www.example.gov/planning')
  returning id into v_id;
  return v_id;
end
$fn$;

create or replace function t.gov_claim(p_entity uuid)
returns void
language sql
as $fn$
  update public.government_entities set claimed_at = now(), claim_note = 'claimed through the form'
   where id = p_entity;
$fn$;

create or replace function t.gov_verify(p_entity uuid)
returns void
language sql
as $fn$
  update public.government_entities
     set verification_status = 'verified', verified_at = now()
   where id = p_entity;
$fn$;


do $$
declare
  v_admin   uuid := t.mk_account('admin');
  v_state   uuid;
  v_j       uuid;   -- the withdrawn government's city
  v_j2      uuid;   -- the future-dated-rule city
  v_e       uuid;
  v_topic2  text;
  v_topic3  text;
  v_topic4  text;
  v_p1      uuid;   -- government-supplied, later superseded by a correction
  v_p1b     uuid;   -- the correction
  v_p2      uuid;   -- government-supplied, later retracted
  v_p4      uuid;   -- government-supplied, stays published
  v_r1      uuid;   -- government-supplied resource, later retired
  v_now     uuid;   -- in force
  v_future  uuid;   -- adopted, not yet in force
  v_now2    uuid;   -- in force, later "retired" with a future repeal date
  v_res_bare uuid;  -- resource with a source URL but no source type
  v_res_ok   uuid;  -- resource with both
begin
  v_state := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_j     := t.gov_jur('municipality', v_state, 'Maintainville');
  v_j2    := t.gov_jur('municipality', v_state, 'Futureton');
  v_e     := t.gov_entity(v_j, 'city', 'Maintainville Planning');
  perform t.gov_claim(v_e);
  perform t.gov_verify(v_e);

  select key into v_topic2 from public.regulatory_topics where key <> 'max_size' order by sort_order, key limit 1;
  select key into v_topic3 from public.regulatory_topics where key not in ('max_size', v_topic2) order by sort_order, key limit 1;
  select key into v_topic4 from public.regulatory_topics where key not in ('max_size', v_topic2, v_topic3) order by sort_order, key limit 1;

  -- ── rules and a resource supplied by a VERIFIED government ────────────────
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status, supplied_by, supplied_by_entity_id)
  values (v_j, 'max_size', 'verified_from_source', '800 sq ft', 'https://www.example.gov/maintainville/adu',
          'Maintainville ADU Ordinance', 'city_code', current_date - 10, 'draft', 'source_checked',
          'government_account', v_e)
  returning id into v_p1;
  perform public.admin_publish_provision(v_p1, v_admin, 'supplied by Maintainville');

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status, supplied_by, supplied_by_entity_id)
  values (v_j, v_topic2, 'verified_from_source', 'as supplied', 'https://www.example.gov/maintainville/adu',
          'Maintainville ADU Ordinance', 'city_code', current_date - 10, 'published', 'source_checked',
          'government_account', v_e)
  returning id into v_p2;

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status, supplied_by, supplied_by_entity_id)
  values (v_j, v_topic3, 'verified_from_source', 'as supplied', 'https://www.example.gov/maintainville/adu',
          'Maintainville ADU Ordinance', 'city_code', current_date - 10, 'published', 'source_checked',
          'government_account', v_e)
  returning id into v_p4;

  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, label, url, source_url, source_type,
     source_checked_date, review_status, verification_status, supplied_by, supplied_by_entity_id)
  values (v_j, 'official_adu_page', 'verified_from_source', 'Maintainville ADU page',
          'https://www.example.gov/maintainville/adu', 'https://www.example.gov/maintainville/adu', 'city_code',
          current_date - 10, 'published', 'source_checked', 'government_account', v_e)
  returning id into v_r1;

  -- ── the government's verification is withdrawn (2s D4) ─────────────────────
  perform public.admin_withdraw_government_verification(v_e, v_admin, 'test: authority to represent the city withdrawn');

  perform t.assert_scalar(
    'withdrawal-took-effect',
    '2s D4: the fixture really did withdraw the government''s identity verification',
    'service_role', null,
    format('select verification_status from public.government_entities where id = %L', v_e),
    'suspended',
    'the entity is not suspended, so every E2 assertion below would prove nothing');

  -- ── E2: ADUAtlas can still correct and pull that government's rules ──────
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_j, 'max_size', 'verified_from_source', '750 sq ft', 'https://www.example.gov/maintainville/adu',
          'Maintainville ADU Ordinance (amended)', 'city_code', current_date - 1, 'draft', 'source_checked')
  returning id into v_p1b;

  perform t.assert_ok(
    'withdrawn-supplier-rule-can-be-superseded',
    '2l, 2s D4: ADUAtlas publishes a correction to a rule whose supplier''s verification was withdrawn',
    'service_role', null,
    format('select public.admin_publish_provision(%L, %L, %L)', v_p1b, v_admin, 'correction after withdrawal'),
    'publishing a corrected rule fails because the rule it replaces was supplied by a government that is now suspended. The wrong rule stays up and the correction cannot go out, at exactly the moment the supplier''s standing was withdrawn');

  perform t.assert_scalar(
    'superseded-rule-keeps-its-provenance',
    '2m: history is never rewritten; a superseded rule still says who supplied it',
    'service_role', null,
    format('select review_status || ''/'' || supplied_by || ''/'' || (supplied_by_entity_id = %L)::text from public.regulatory_provisions where id = %L', v_e, v_p1),
    'superseded/government_account/true',
    'the old rule was not superseded, or it lost the record of which government supplied it');

  perform t.assert_ok(
    'withdrawn-supplier-rule-can-be-retracted',
    '2l, 2s D4: ADUAtlas can pull a wrong rule whatever its supplier''s standing',
    'service_role', null,
    format($q$update public.regulatory_provisions
                 set review_status = 'retracted', retracted_at = now(),
                     retraction_reason = 'supplier withdrawn; rule under review'
               where id = %L$q$, v_p2),
    'a rule supplied by a now-suspended government cannot be retracted, so a rule ADUAtlas knows may be wrong stays published');

  perform t.assert_ok(
    'withdrawn-supplier-resource-can-be-retired',
    '2l, 2s D4: the same holds for official links and contacts',
    'service_role', null,
    format($q$update public.government_resources
                 set review_status = 'superseded', superseded_or_repealed_date = current_date,
                     admin_note = 'supplier withdrawn'
               where id = %L$q$, v_r1),
    'a resource supplied by a now-suspended government cannot be retired');

  -- What must NOT loosen: a suspended government is never credited with content.
  perform t.assert_error(
    'suspended-government-not-credited-with-new-rule',
    '2m: "Provided by a verified government account" must be true when it is said',
    'service_role', null,
    format($q$insert into public.regulatory_provisions
                (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
                 source_type, source_checked_date, review_status, verification_status, supplied_by, supplied_by_entity_id)
              values (%L, %L, 'verified_from_source', 'new', 'https://www.example.gov/x', 'x', 'city_code',
                      current_date, 'draft', 'source_checked', 'government_account', %L)$q$, v_j, v_topic4, v_e),
    'not verified',
    'a new rule can be attributed to a government whose verification was withdrawn');

  perform t.assert_error(
    'suspended-government-not-credited-with-edited-rule',
    '2m: an edit to a rule credited to a suspended government would put words in its mouth',
    'service_role', null,
    format('update public.regulatory_provisions set value_text = ''rewritten after withdrawal'' where id = %L', v_p4),
    'not verified',
    'a published rule still credited to a suspended government can be rewritten, so the page would credit that government with text it never supplied');

  perform t.assert_error(
    'retirement-cannot-smuggle-an-edit',
    '2m: the exemption is for moving a rule out of publication, never for changing what it said',
    'service_role', null,
    format($q$update public.regulatory_provisions
                 set review_status = 'superseded', superseded_or_repealed_date = current_date,
                     value_text = 'changed on the way out'
               where id = %L$q$, v_p4),
    'not verified',
    'a status change can carry a content change past the supplier check');

  -- ── E1: the rule in force is never hidden by one that is not in force yet ──
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, effective_date, review_status, verification_status)
  values (v_j2, 'max_size', 'verified_from_source', '1000 sq ft', 'https://www.example.gov/futureton/code',
          'Futureton Zoning Code', 'city_code', current_date - 5, current_date - 400, 'published', 'source_checked')
  returning id into v_now;

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, effective_date, review_status, verification_status)
  values (v_j2, 'max_size', 'verified_from_source', '1200 sq ft', 'https://www.example.gov/futureton/amend',
          'Futureton Ordinance 2027-1', 'city_code', current_date - 1, current_date + 60, 'draft', 'source_checked')
  returning id into v_future;

  perform t.x('service_role', null,
    format('select public.admin_publish_provision(%L, %L, %L)', v_future, v_admin, 'adopted, effective in 60 days'));

  perform t.assert_scalar(
    'rule-in-force-not-hidden-by-a-future-rule',
    '0012 four dates: a homeowner planning a build needs to know which rule applies to them TODAY',
    'anon', null,
    format('select string_agg(id::text, '','') from public.regulatory_provisions_public where jurisdiction_id = %L and topic_key = ''max_size''', v_j2),
    v_now::text,
    'publishing a rule that takes effect in 60 days removed the rule in force from the public page and put the not-yet-effective rule in its place');

  perform t.assert_count(
    'no-future-rule-shown-as-current',
    '0012 four dates: nothing on the public page is presented as current before it takes effect',
    'anon', null,
    format('select 1 from public.regulatory_provisions_public where jurisdiction_id = %L and effective_date > current_date', v_j2),
    0,
    'the public page presents a rule as current although its effective date has not arrived');

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, effective_date, review_status, verification_status)
  values (v_j2, v_topic2, 'verified_from_source', 'in force', 'https://www.example.gov/futureton/code',
          'Futureton Zoning Code', 'city_code', current_date - 5, current_date - 400, 'published', 'source_checked')
  returning id into v_now2;

  perform t.x('service_role', null,
    format($q$update public.regulatory_provisions
                 set review_status = 'superseded', superseded_or_repealed_date = current_date + 30
               where id = %L$q$, v_now2));

  perform t.assert_count(
    'rule-not-hidden-before-its-repeal-date',
    '0012 four dates: a rule repealed next month still applies this month',
    'anon', null,
    format('select 1 from public.regulatory_provisions_public where id = %L', v_now2),
    1,
    'retiring a rule with a repeal date 30 days out removed it from the public page today, while it is still the law');

  -- Control: the SAME adopted rule publishes once its effective date arrives, and
  -- then it does supersede the rule in force. This is the Phase 1 workflow, and
  -- without it "nothing was hidden" above could simply mean publishing no longer
  -- works at all.
  update public.regulatory_provisions set effective_date = current_date where id = v_future;

  perform t.assert_ok(
    'control-publish-on-the-effective-date-works',
    'control: on its effective date the adopted rule publishes',
    'service_role', null,
    format('select public.admin_publish_provision(%L, %L, %L)', v_future, v_admin, 'effective today'),
    'the adopted rule cannot be published even on its effective date, so the refusals above are a blanket block and prove nothing');

  perform t.assert_scalar(
    'control-publish-supersedes-the-old-rule',
    'control: publishing replaces the rule in force, and the page shows only the new one',
    'anon', null,
    format('select string_agg(id::text, '','') from public.regulatory_provisions_public where jurisdiction_id = %L and topic_key = ''max_size''', v_j2),
    v_future::text,
    'publishing the adopted rule on its effective date did not replace the rule in force');

  -- ── E3: "official government source" needs an official source type ───────
  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, label, url, source_url, source_type,
     source_checked_date, review_status, verification_status)
  values (v_j2, 'zoning_map', 'verified_from_source', 'Zoning map', 'https://maps.example.test/futureton',
          'https://maps.example.test/futureton', null, current_date - 3, 'published', 'source_checked')
  returning id into v_res_bare;

  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, label, url, source_url, source_type,
     source_checked_date, review_status, verification_status)
  values (v_j2, 'planning_department', 'verified_from_source', 'Planning department', 'https://www.example.gov/futureton/planning',
          'https://www.example.gov/futureton/planning', 'planning_department', current_date - 3, 'published', 'source_checked')
  returning id into v_res_ok;

  perform t.assert_scalar(
    'resource-without-source-type-not-called-official',
    '2m, 2t: an official-source claim needs an official source type, exactly as a rule does',
    'anon', null,
    format('select coalesce(source_is_official_government, false)::text from public.government_resources_public where id = %L', v_res_bare),
    'false',
    'a resource with only a source URL is presented as coming from an official government source, although nothing records that the URL is official');

  perform t.assert_scalar(
    'control-resource-with-source-type-is-official',
    'control: a resource with an official source type is still called official',
    'anon', null,
    format('select source_is_official_government::text from public.government_resources_public where id = %L', v_res_ok),
    'true',
    'a resource with an official source type is not called official, so the assertion above passes for the wrong reason');
end
$$;
