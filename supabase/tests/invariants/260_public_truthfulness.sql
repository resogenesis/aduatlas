-- =============================================================================
-- INVARIANT: what the public views, the government portal's context and the
-- partner tools say is true, and stays true after a government's verification is
-- withdrawn.
--
-- Written for migration 0022 (a correctness exception under PHASE_1.md 2t). Each
-- group reproduces a defect the RC1 launch gate proved on staging by behaviour,
-- and each group's key assertions FAIL against the chain without 0022. Nothing
-- here comes from competitor research.
--
--   T1  DEF-02  After withdrawal, a government-supplied rule read exactly like
--               ADUAtlas research: the public views exposed no supplier kind.
--   T2  DEF-04  government_resources_public had no verification_status, so a
--               disputed resource could only be shown as checked.
--   T3  DEF-03  "This jurisdiction publishes none" resources made a page with
--               nothing verified indexable.
--   T4  DEF-22  my_government_context() kept offering granted jurisdictions, with
--               may_submit true, after the entity's verification was withdrawn,
--               while the database refused every use of them.
--   T5  DEF-18, DEF-24
--               A link or code a partner issued recorded neither who issued it
--               nor an audit row.
--   T6  DEF-17  anon could execute jurisdiction_rule_stack() and
--               jurisdiction_ancestors(), which always failed for anon.
--
-- The seven facts of 2t stay separate throughout: government-supplied
-- information (supplied_by) is asserted apart from government identity
-- verification (provided_by_entity_*), and neither is read off the other.
-- =============================================================================
select t.suite('260 public truthfulness (2b, 2l, 2m, 2p, 2t)');

-- ── the government fixtures this file needs ─────────────────────────────────
-- Exact copies of the helpers 190, 200, 240 and 250 define (byte-identical
-- there). Every file carries its own, because files must not depend on each other
-- or on their order, and run.sh --target runs each one alone.
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

-- This file's own helpers, prefixed pt_ so they can never be mistaken for, or
-- overwrite, another file's.

-- A verified member of an entity, put in the way ADUAtlas's admin path leaves one:
-- a person record and a membership that is verified in the same write.
create or replace function t.pt_member(p_entity uuid, p_role text default 'contributor')
returns uuid
language plpgsql
as $fn$
declare
  v_user uuid := t.mk_account('homeowner');
  v_gov  uuid;
begin
  insert into public.government_users (user_id, full_name, job_title, work_email)
  values (v_user, 'Test Official', 'ADU coordinator', t.nextlabel('official') || '@example.gov')
  returning id into v_gov;
  insert into public.government_memberships
    (entity_id, government_user_id, membership_role, status, verified_at)
  values (p_entity, v_gov, p_role, 'verified', now());
  return v_user;
end
$fn$;

create or replace function t.pt_grant(p_entity uuid, p_jurisdiction uuid, p_may_submit boolean default true)
returns uuid
language plpgsql
as $fn$
declare v_id uuid;
begin
  insert into public.government_jurisdiction_grants (entity_id, jurisdiction_id, may_submit, grant_basis)
  values (p_entity, p_jurisdiction, p_may_submit,
          'the regression suite granted this scope explicitly, which is the only way scope is ever granted')
  returning id into v_id;
  return v_id;
end
$fn$;

-- A view's columns IN ORDER. Order is the contract here, not decoration: Postgres
-- lets a view gain columns only at the end, and the frontend reads these views by
-- name, so an existing column that moved or vanished is a broken page.
create or replace function t.pt_cols(p_relation text)
returns text
language sql
stable
as $fn$
  select coalesce(string_agg(a.attname::text, ',' order by a.attnum), '<missing>')
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname || '.' || c.relname = p_relation
     and a.attnum > 0 and not a.attisdropped;
$fn$;


do $$
declare
  v_admin   uuid := t.mk_account('admin');
  v_home    uuid := t.mk_account('homeowner');
  v_state   uuid;
  v_j1      uuid;   -- the government that is later withdrawn
  v_j2      uuid;   -- three "publishes none" resources only
  v_j3      uuid;   -- three verified resources
  v_j4      uuid;   -- two verified and three "publishes none"
  v_j5      uuid;   -- the education partner's jurisdiction
  v_e1      uuid;
  v_e1_name text;
  v_e2      uuid;
  v_m1      uuid;   -- contributor of e1
  v_m2      uuid;   -- viewer of e1
  v_m3      uuid;   -- contributor of e2, the partner
  v_topic_g text;
  v_topic_a text;
  v_p_gov   uuid;
  v_p_res   uuid;
  v_r_gov   uuid;
  v_r_res   uuid;
  v_r_chk   uuid;
  v_part    uuid;
  v_label   text;
  v_id      uuid;
  v_secret  text;
  v_admin_link jsonb;
  v_admin_code jsonb;
  v_expected text;
begin
  -- ── fixtures ──────────────────────────────────────────────────────────────
  v_state := t.gov_jur('state', null, 'Arizona', 'AZ');
  v_j1    := t.gov_jur('municipality', v_state, 'Truthville');
  v_j2    := t.gov_jur('municipality', v_state, 'Silentburg');
  v_j3    := t.gov_jur('municipality', v_state, 'Linkton');
  v_j4    := t.gov_jur('municipality', v_state, 'Mixedale');
  v_j5    := t.gov_jur('municipality', v_state, 'Partnerfield');

  v_e1 := t.gov_entity(v_j1, 'city', 'Truthville Planning');
  perform t.gov_claim(v_e1);
  perform t.gov_verify(v_e1);
  select name into v_e1_name from public.government_entities where id = v_e1;
  v_m1 := t.pt_member(v_e1, 'contributor');
  v_m2 := t.pt_member(v_e1, 'viewer');
  perform t.pt_grant(v_e1, v_j1, true);

  -- =========================================================================
  -- T1, T2: the two public views carry the supplier kind and who checked it,
  -- appended at the end, with every existing column where it was.
  -- =========================================================================
  v_expected := 'id,jurisdiction_id,state_code,jurisdiction_path,jurisdiction_name,jurisdiction_official_name,'
             || 'jurisdiction_type,topic_key,topic_category,topic_label,topic_question,value_kind,value_unit,'
             || 'field_state,value_text,value_numeric,value_boolean,value_qualifier,source_url,'
             || 'source_document_title,source_citation,source_type,source_is_official_government,'
             || 'provided_by_entity_name,provided_by_entity_id,verification_status,effective_date,'
             || 'source_checked_date,record_published_at,superseded_or_repealed_date,supplied_by';
  perform t.assert(
    'rules-view-columns-in-order',
    '2t: government-supplied information is its own public fact (supplied_by), added at the end so every column the page already reads stays where it is',
    t.pt_cols('public.regulatory_provisions_public') = v_expected,
    format('regulatory_provisions_public columns are [%s], expected [%s]',
           t.pt_cols('public.regulatory_provisions_public'), v_expected));

  v_expected := 'id,jurisdiction_id,state_code,jurisdiction_path,jurisdiction_name,jurisdiction_type,'
             || 'resource_type,field_state,label,url,phone,email,contact_name,contact_title,department_name,'
             || 'address,hours,notes,source_url,source_type,source_is_official_government,'
             || 'provided_by_entity_name,effective_date,source_checked_date,record_published_at,'
             || 'superseded_or_repealed_date,sort_order,supplied_by,verification_status';
  perform t.assert(
    'resources-view-columns-in-order',
    '2t, 2m: a resource carries who supplied it and who checked it, exactly as a rule does, added at the end',
    t.pt_cols('public.government_resources_public') = v_expected,
    format('government_resources_public columns are [%s], expected [%s]',
           t.pt_cols('public.government_resources_public'), v_expected));

  v_expected := 'jurisdiction_id,state_code,jurisdiction_path,jurisdiction_type,name,topics_tracked,'
             || 'topics_verified,topics_source_silent,topics_not_researched,resources_published,'
             || 'last_source_checked_date,last_record_published_at,is_indexable';
  perform t.assert(
    'coverage-view-columns-unchanged',
    '2l: the coverage view changes one rule, not its shape',
    t.pt_cols('public.jurisdiction_coverage_public') = v_expected,
    format('jurisdiction_coverage_public columns are [%s], expected [%s]',
           t.pt_cols('public.jurisdiction_coverage_public'), v_expected));

  -- A rule and a resource a VERIFIED government supplied, beside a rule and a
  -- resource ADUAtlas researched, all published on the same page.
  v_topic_g := t.free_topic(v_j1, 'max_size');
  v_topic_a := t.free_topic(v_j1, 'height_limit');
  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status, supplied_by, supplied_by_entity_id)
  values (v_j1, v_topic_g, 'verified_from_source', '800 sq ft', 'https://www.example.gov/truthville/adu',
          'Truthville ADU Ordinance', 'city_code', current_date - 10, 'published', 'source_checked',
          'government_account', v_e1)
  returning id into v_p_gov;

  insert into public.regulatory_provisions
    (jurisdiction_id, topic_key, field_state, value_text, source_url, source_document_title,
     source_type, source_checked_date, review_status, verification_status)
  values (v_j1, v_topic_a, 'verified_from_source', '16 ft', 'https://www.example.gov/truthville/adu',
          'Truthville ADU Ordinance', 'city_code', current_date - 10, 'published', 'source_checked')
  returning id into v_p_res;

  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, label, url, source_url, source_type,
     source_checked_date, review_status, verification_status, supplied_by, supplied_by_entity_id)
  values (v_j1, 'official_adu_page', 'verified_from_source', 'Truthville ADU page',
          'https://www.example.gov/truthville/adu', 'https://www.example.gov/truthville/adu', 'city_code',
          current_date - 10, 'published', 'source_checked', 'government_account', v_e1)
  returning id into v_r_gov;

  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, label, url, source_url, source_type,
     source_checked_date, review_status, verification_status)
  values (v_j1, 'fee_schedule', 'verified_from_source', 'Truthville fee schedule',
          'https://www.example.gov/truthville/fees', 'https://www.example.gov/truthville/fees', 'city_code',
          current_date - 10, 'published', 'disputed')
  returning id into v_r_res;

  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, label, url, source_url, source_type,
     source_checked_date, review_status, verification_status)
  values (v_j1, 'zoning_map', 'verified_from_source', 'Truthville zoning map',
          'https://www.example.gov/truthville/map', 'https://www.example.gov/truthville/map', 'city_code',
          current_date - 10, 'published', 'source_checked')
  returning id into v_r_chk;

  perform t.assert_scalar(
    'verified-government-rule-says-who-supplied-it',
    '2m: "Provided by <government>" names a government only while its identity is verified, and the supplier kind says the same thing',
    'anon', null,
    format($q$select supplied_by || '/' || coalesce(provided_by_entity_name, '<none>') || '/' || coalesce(provided_by_entity_id::text, '<none>')
                from public.regulatory_provisions_public where id = %L$q$, v_p_gov),
    'government_account/' || v_e1_name || '/' || v_e1::text,
    'a rule supplied by a verified government does not read as government-supplied, or does not name the government');

  perform t.assert_scalar(
    'aduatlas-rule-reads-as-research',
    '2t: ADUAtlas research is its own fact and never borrows a government''s name',
    'anon', null,
    format($q$select supplied_by || '/' || coalesce(provided_by_entity_name, '<none>') || '/' || coalesce(provided_by_entity_id::text, '<none>')
                from public.regulatory_provisions_public where id = %L$q$, v_p_res),
    'aduatlas_research/<none>/<none>',
    'a rule ADUAtlas researched does not read as ADUAtlas research');

  perform t.assert_scalar(
    'verified-government-resource-says-who-supplied-it',
    '2m: a resource a verified government supplied names it, and says it supplied it',
    'anon', null,
    format($q$select supplied_by || '/' || coalesce(provided_by_entity_name, '<none>')
                from public.government_resources_public where id = %L$q$, v_r_gov),
    'government_account/' || v_e1_name,
    'a resource supplied by a verified government does not read as government-supplied');

  -- ── T2: who checked a resource ──────────────────────────────────────────
  perform t.assert_scalar(
    'disputed-resource-reads-disputed',
    '0012 verification_status: disputed means another authority contradicts it, and the product shows the disagreement rather than choosing',
    'anon', null,
    format('select verification_status from public.government_resources_public where id = %L', v_r_res),
    'disputed',
    'a disputed resource cannot be told apart from a checked one on the public page');

  perform t.assert_scalar(
    'control-checked-resource-reads-checked',
    'control: a resource ADUAtlas checked reads source_checked, so the assertion above is not a constant',
    'anon', null,
    format('select verification_status from public.government_resources_public where id = %L', v_r_chk),
    'source_checked',
    'a checked resource does not read source_checked');

  -- ── T4 controls, before the withdrawal ────────────────────────────────────
  perform t.assert_scalar(
    'control-verified-contributor-may-submit',
    'control: a verified contributor of a verified entity with a live grant sees that grant, with may_submit true',
    'authenticated', t.authid(v_m1),
    $q$select count(*) filter (where (j->>'may_submit')::boolean)::text || '/' || count(*)::text
         from jsonb_array_elements(public.my_government_context()->'memberships') m,
              jsonb_array_elements(m->'jurisdictions') j$q$,
    '1/1',
    'the working case does not list its one grant as submittable, so the refusals below prove nothing');

  perform t.assert_scalar(
    'viewer-sees-grant-and-may-not-submit',
    '2m: a viewer submits nothing, so the portal must not offer a viewer a submit form the database will refuse',
    'authenticated', t.authid(v_m2),
    $q$select count(*) filter (where (j->>'may_submit')::boolean)::text || '/' || count(*)::text
         from jsonb_array_elements(public.my_government_context()->'memberships') m,
              jsonb_array_elements(m->'jurisdictions') j$q$,
    '0/1',
    'a viewer-role member is told may_submit true, though government_may_submit_as() and the submission policy refuse a viewer');

  perform t.assert_scalar(
    'viewer-context-agrees-with-the-submission-predicate',
    '2m: what the portal is told and what the database decides are one answer',
    'authenticated', t.authid(v_m2),
    format('select public.government_may_submit_as(%L, %L)::text', v_e1, v_j1),
    'false',
    'the submission predicate lets a viewer submit');

  -- =========================================================================
  -- The government's identity verification is withdrawn (0020, 2s D4).
  -- =========================================================================
  perform t.x('service_role', null,
    format('select public.admin_withdraw_government_verification(%L, %L, %L)',
           v_e1, v_admin, 'test: authority to represent the city withdrawn'));

  perform t.assert_scalar(
    'withdrawal-took-effect',
    '2s D4: the fixture really did withdraw the government''s identity verification',
    'service_role', null,
    format('select verification_status from public.government_entities where id = %L', v_e1),
    'suspended',
    'the entity is not suspended, so every withdrawal assertion below would prove nothing');

  -- ── T1: a withdrawn government's rule never reads as ADUAtlas research ─────
  perform t.assert_scalar(
    'withdrawn-government-rule-still-reads-government-supplied',
    '2t: government-supplied information and government identity verification are separate facts; withdrawing the second never erases the first',
    'anon', null,
    format($q$select supplied_by || '/' || coalesce(provided_by_entity_name, '<none>') || '/' || coalesce(provided_by_entity_id::text, '<none>')
                from public.regulatory_provisions_public where id = %L$q$, v_p_gov),
    'government_account/<none>/<none>',
    'after the withdrawal the rule either lost its supplier kind (so it reads as ADUAtlas research) or still names a government that is no longer verified');

  perform t.assert_scalar(
    'withdrawn-government-rule-distinguishable-from-research',
    '2t: a rule a government supplied and a rule ADUAtlas researched never look the same to a homeowner',
    'anon', null,
    format($q$select count(distinct supplied_by)::text from public.regulatory_provisions_public
               where id in (%L, %L)$q$, v_p_gov, v_p_res),
    '2',
    'after the withdrawal the government-supplied rule and the ADUAtlas rule on the same page are indistinguishable in the public view');

  perform t.assert_scalar(
    'control-research-rule-unchanged-by-withdrawal',
    'control: withdrawing a government changes nothing about ADUAtlas''s own rule',
    'anon', null,
    format($q$select supplied_by || '/' || coalesce(provided_by_entity_name, '<none>')
                from public.regulatory_provisions_public where id = %L$q$, v_p_res),
    'aduatlas_research/<none>',
    'the ADUAtlas rule changed when a government was withdrawn');

  perform t.assert_scalar(
    'withdrawn-government-resource-still-reads-government-supplied',
    '2t: the same separation holds for official links and contacts',
    'anon', null,
    format($q$select supplied_by || '/' || coalesce(provided_by_entity_name, '<none>')
                from public.government_resources_public where id = %L$q$, v_r_gov),
    'government_account/<none>',
    'after the withdrawal the resource lost its supplier kind, or still names the government');

  -- ── T4: the portal offers nothing the database refuses ─────────────────────
  perform t.assert_scalar(
    'withdrawn-entity-reports-no-may-submit',
    '2s D4: after a withdrawal the portal must not offer to submit on any jurisdiction, because the database refuses every submission',
    'authenticated', t.authid(v_m1),
    $q$select count(*)::text
         from jsonb_array_elements(public.my_government_context()->'memberships') m,
              jsonb_array_elements(m->'jurisdictions') j
        where (j->>'may_submit')::boolean$q$,
    '0',
    'my_government_context() still says may_submit true for a jurisdiction of an entity whose verification was withdrawn');

  perform t.assert_scalar(
    'withdrawn-entity-lists-no-grant-it-cannot-use',
    '2m: what is listed is what the caller can use; a withdrawn entity cannot read or submit on any record',
    'authenticated', t.authid(v_m1),
    $q$select count(*)::text
         from jsonb_array_elements(public.my_government_context()->'memberships') m,
              jsonb_array_elements(m->'jurisdictions') j$q$,
    '0',
    'my_government_context() still lists granted jurisdictions for an entity whose verification was withdrawn');

  perform t.assert_scalar(
    'control-database-refuses-the-withdrawn-entity',
    'control: the database itself refuses the withdrawn entity, which is what the context must agree with',
    'authenticated', t.authid(v_m1),
    format('select public.government_may_read_jurisdiction(%L)::text || ''/'' || public.government_may_submit_as(%L, %L)::text',
           v_j1, v_e1, v_j1),
    'false/false',
    'the read or submission predicate still lets a withdrawn entity in');

  perform t.assert_scalar(
    'withdrawn-entity-keeps-the-rest-of-its-context',
    '2s D4: the person still sees their membership and the entity''s public state; only the unusable authority is gone',
    'authenticated', t.authid(v_m1),
    $q$select string_agg((m->>'entity_state') || '/' || (m->>'membership_status') || '/' || (m->>'membership_role'), ',')
         from jsonb_array_elements(public.my_government_context()->'memberships') m$q$,
    'claimed/verified/contributor',
    'the withdrawal removed more than the unusable grants from the context');

  -- =========================================================================
  -- T3: "publishes none" answers the question and does not make a page indexable
  -- =========================================================================
  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, source_url, source_type, source_checked_date, review_status, verification_status)
  select v_j2, rt, 'source_did_not_state', 'https://www.example.gov/silentburg', 'city_code', current_date - 3, 'published', 'source_checked'
    from unnest(array['adu_handbook', 'fee_schedule', 'preapproved_plans']) rt;

  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, label, url, source_url, source_type, source_checked_date, review_status, verification_status)
  select v_j3, rt, 'verified_from_source', 'Linkton ' || rt, 'https://www.example.gov/linkton/' || rt,
         'https://www.example.gov/linkton/' || rt, 'city_code', current_date - 3, 'published', 'source_checked'
    from unnest(array['official_adu_page', 'permit_application', 'zoning_map']) rt;

  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, label, url, source_url, source_type, source_checked_date, review_status, verification_status)
  select v_j4, rt, 'verified_from_source', 'Mixedale ' || rt, 'https://www.example.gov/mixedale/' || rt,
         'https://www.example.gov/mixedale/' || rt, 'city_code', current_date - 3, 'published', 'source_checked'
    from unnest(array['official_adu_page', 'permit_application']) rt;
  insert into public.government_resources
    (jurisdiction_id, resource_type, field_state, source_url, source_type, source_checked_date, review_status, verification_status)
  select v_j4, rt, 'source_did_not_state', 'https://www.example.gov/mixedale', 'city_code', current_date - 3, 'published', 'source_checked'
    from unnest(array['adu_handbook', 'fee_schedule', 'preapproved_plans']) rt;

  perform t.assert_scalar(
    'publishes-none-resources-do-not-make-a-page-indexable',
    '2l: a jurisdiction page is indexable only where there is enough VERIFIED content to justify one',
    'anon', null,
    format('select is_indexable::text || ''/'' || topics_verified::text from public.jurisdiction_coverage_public where jurisdiction_id = %L', v_j2),
    'false/0',
    'three "this jurisdiction publishes none" records made a page with nothing verified indexable');

  perform t.assert_scalar(
    'publishes-none-resources-do-not-top-up-verified-ones',
    '2l: only resources verified from source count toward the resource threshold',
    'anon', null,
    format('select is_indexable::text from public.jurisdiction_coverage_public where jurisdiction_id = %L', v_j4),
    'false',
    'two verified resources and three "publishes none" records were counted as enough verified content');

  perform t.assert_scalar(
    'control-three-verified-resources-are-indexable',
    'control: three resources verified from source still make a page indexable, so the rule is a bar and not a wall',
    'anon', null,
    format('select is_indexable::text from public.jurisdiction_coverage_public where jurisdiction_id = %L', v_j3),
    'true',
    'three verified resources no longer make a page indexable');

  perform t.assert_scalar(
    'resources-published-keeps-its-meaning',
    '2l: coverage counts every published resource, "publishes none" included; only indexability changed',
    'anon', null,
    format('select resources_published::text from public.jurisdiction_coverage_public where jurisdiction_id = %L', v_j4),
    '5',
    'resources_published no longer counts every published resource');

  -- =========================================================================
  -- T5: a resident link or code a partner issues records who issued it
  -- =========================================================================
  v_e2 := t.gov_entity(v_j5, 'city', 'Partnerfield Planning');
  perform t.gov_claim(v_e2);
  perform t.gov_verify(v_e2);
  v_m3 := t.pt_member(v_e2, 'contributor');
  perform t.pt_grant(v_e2, v_j5, true);
  perform public.admin_set_partnership_status(v_e2, 'active', v_admin, 'test partnership');
  select id into v_part from public.government_partnerships where entity_id = v_e2;

  -- The link, inserted exactly as the portal's client would: the 0014 insert grant,
  -- as the partner, naming nothing but the partnership, jurisdiction and label.
  v_label := t.nextlabel('pt-link');
  perform t.assert_ok(
    'control-partner-issues-a-link',
    'control: an active partner issues a resident link through its own insert grant',
    'authenticated', t.authid(v_m3),
    format('insert into public.partner_access_links (partnership_id, jurisdiction_id, label) values (%L, %L, %L)',
           v_part, v_j5, v_label),
    'the partner cannot issue a link at all, so every attribution assertion below proves nothing');
  select id, token into v_id, v_secret from public.partner_access_links where label = v_label;

  perform t.assert_scalar(
    'partner-issued-link-records-who-issued-it',
    '2p: resident access is attributable; the database records which person issued a link',
    'service_role', null,
    format('select coalesce(created_by_app_user_id::text, ''<none>'') from public.partner_access_links where id = %L', v_id),
    v_m3::text,
    'a link the partner issued carries no issuer');

  perform t.assert_scalar(
    'partner-issued-link-is-audited-once',
    '2p, 2m: every issue of resident access writes one audit row, whoever issued it',
    'service_role', null,
    format($q$select count(*)::text || '/' || coalesce(max(actor_app_user_id::text), '<none>') || '/' || coalesce(max(actor_api_role), '<none>')
                || '/' || coalesce(max(actor_government_user_id::text), '<none>')
                from public.regulatory_audit_log where action = 'partner_link.issued' and record_id = %L$q$, v_id),
    '1/' || v_m3::text || '/authenticated/' || (select id::text from public.government_users where user_id = v_m3),
    'a link the partner issued has no partner_link.issued audit row, or one that does not name the issuer');

  perform t.assert_scalar(
    'partner-issued-link-audit-matches-the-admin-shape',
    '2p: a partner''s issue is recorded exactly as an admin''s issue is: changed field, label and nothing more',
    'service_role', null,
    format($q$select changed_fields::text || '/' || coalesce(before_value::text, '<null>') || '/' || coalesce(after_value::text, '<null>') || '/' || coalesce(note, '<none>')
                from public.regulatory_audit_log where action = 'partner_link.issued' and record_id = %L$q$, v_id),
    '{token}/<null>/' || jsonb_build_object('label', v_label)::text || '/' || v_label,
    'the partner''s audit row differs in shape from the one admin_issue_partner_link() writes');

  v_label := t.nextlabel('pt-code');
  perform t.assert_ok(
    'control-partner-issues-a-code',
    'control: an active partner issues a resident code through its own insert grant',
    'authenticated', t.authid(v_m3),
    format('insert into public.partner_access_codes (partnership_id, jurisdiction_id, label) values (%L, %L, %L)',
           v_part, v_j5, v_label),
    'the partner cannot issue a code at all');
  select id, code into v_id, v_secret from public.partner_access_codes where label = v_label;

  perform t.assert_scalar(
    'partner-issued-code-records-who-issued-it',
    '2p: the database records which person issued a code',
    'service_role', null,
    format('select coalesce(created_by_app_user_id::text, ''<none>'') from public.partner_access_codes where id = %L', v_id),
    v_m3::text,
    'a code the partner issued carries no issuer');

  perform t.assert_scalar(
    'partner-issued-code-is-audited-once',
    '2p, 2m: every issue of resident access writes one audit row, whoever issued it',
    'service_role', null,
    format($q$select count(*)::text || '/' || coalesce(max(actor_app_user_id::text), '<none>')
                from public.regulatory_audit_log where action = 'partner_code.issued' and record_id = %L$q$, v_id),
    '1/' || v_m3::text,
    'a code the partner issued has no partner_code.issued audit row');

  perform t.assert_scalar(
    'the-code-itself-is-never-audited',
    '0014: a code is a secret; the audit log is read far more widely than a code is issued, so it never holds one',
    'service_role', null,
    format($q$select count(*)::text from public.regulatory_audit_log
               where record_id = %L
                 and position(%L in coalesce(before_value::text, '') || coalesce(after_value::text, '') || coalesce(note, '')) > 0$q$,
           v_id, v_secret),
    '0',
    'the plaintext resident code was written into the audit log');

  -- A client can never write the issuer itself, on insert or afterwards.
  perform t.assert_error(
    'client-cannot-name-the-issuer-of-a-link',
    '2p: who issued resident access is the database''s record, never the client''s claim',
    'authenticated', t.authid(v_m3),
    format('insert into public.partner_access_links (partnership_id, jurisdiction_id, label, created_by_app_user_id) values (%L, %L, %L, %L)',
           v_part, v_j5, t.nextlabel('pt-forged'), v_admin),
    'permission denied',
    'a partner can insert a link that names somebody else as its issuer');

  perform t.assert_error(
    'client-cannot-move-the-issuer-of-a-code',
    '2p: the issuer of a code never moves',
    'authenticated', t.authid(v_m3),
    format('update public.partner_access_codes set created_by_app_user_id = %L where id = %L', v_admin, v_id),
    'permission denied',
    'a partner can rewrite who issued a code');

  -- The admin path still records exactly one row, naming the admin.
  v_admin_link := t.q('service_role', null,
    format('select public.admin_issue_partner_link(%L, %L, %L, %L) as r', v_e2, v_j5, v_admin, t.nextlabel('pt-admin-link')));
  v_id := ((v_admin_link->'rows'->0->'r')->>'link_id')::uuid;
  perform t.assert_scalar(
    'admin-issued-link-is-audited-once',
    '2p: an admin issue is recorded once, naming the admin, exactly as before 0022',
    'service_role', null,
    format($q$select (select coalesce(created_by_app_user_id::text, '<none>') from public.partner_access_links where id = %L)
                || '/' || count(*)::text || '/' || coalesce(max(actor_app_user_id::text), '<none>') || '/' || coalesce(max(actor_api_role), '<none>')
                from public.regulatory_audit_log where action = 'partner_link.issued' and record_id = %L$q$, v_id, v_id),
    v_admin::text || '/1/' || v_admin::text || '/service_role',
    format('admin_issue_partner_link() did not issue, or did not record exactly one audit row naming the admin (result %s)', v_admin_link::text));

  v_admin_code := t.q('service_role', null,
    format('select public.admin_issue_partner_code(%L, %L, %L, %L) as r', v_e2, v_j5, v_admin, t.nextlabel('pt-admin-code')));
  v_id := ((v_admin_code->'rows'->0->'r')->>'code_id')::uuid;
  perform t.assert_scalar(
    'admin-issued-code-is-audited-once',
    '2p: an admin issue is recorded once, naming the admin, exactly as before 0022',
    'service_role', null,
    format($q$select (select coalesce(created_by_app_user_id::text, '<none>') from public.partner_access_codes where id = %L)
                || '/' || count(*)::text || '/' || coalesce(max(actor_app_user_id::text), '<none>')
                from public.regulatory_audit_log where action = 'partner_code.issued' and record_id = %L$q$, v_id, v_id),
    v_admin::text || '/1/' || v_admin::text,
    format('admin_issue_partner_code() did not issue, or did not record exactly one audit row naming the admin (result %s)', v_admin_code::text));

  -- =========================================================================
  -- T6: two display functions are not an anonymous surface
  -- =========================================================================
  perform t.assert(
    'anon-cannot-execute-the-rule-stack',
    '2l: every anonymous surface answers; a function granted to anon that always fails for anon is removed from anon',
    not has_function_privilege('anon', 'public.jurisdiction_rule_stack(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.jurisdiction_ancestors(uuid)', 'execute'),
    'anon still holds EXECUTE on jurisdiction_rule_stack(uuid) or jurisdiction_ancestors(uuid), directly or through PUBLIC');

  perform t.assert_error(
    'anon-rule-stack-refused-at-the-function',
    '2l: anon is refused at the function, not halfway through it',
    'anon', null,
    format('select * from public.jurisdiction_rule_stack(%L)', v_j1),
    'permission denied for function jurisdiction_rule_stack',
    'anon can still start jurisdiction_rule_stack()');

  perform t.assert_error(
    'anon-ancestors-refused-at-the-function',
    '2l: anon is refused at the function, not halfway through it',
    'anon', null,
    format('select * from public.jurisdiction_ancestors(%L)', v_j1),
    'permission denied for function jurisdiction_ancestors',
    'anon can still start jurisdiction_ancestors()');

  perform t.assert_count(
    'control-signed-in-rule-stack-still-works',
    'control: a signed-in person still reads the rule stack, so the revoke is scoped to anon',
    'authenticated', t.authid(v_home),
    format('select 1 from public.jurisdiction_rule_stack(%L) where jurisdiction_id = %L', v_j1, v_j1),
    2,
    'the rule stack no longer answers a signed-in person');

  perform t.assert(
    'control-service-role-keeps-both-functions',
    'control: the admin API keeps both display functions',
    has_function_privilege('service_role', 'public.jurisdiction_rule_stack(uuid)', 'execute')
      and has_function_privilege('service_role', 'public.jurisdiction_ancestors(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.jurisdiction_ancestors(uuid)', 'execute'),
    'service_role or authenticated lost EXECUTE on a display function');
end
$$;
