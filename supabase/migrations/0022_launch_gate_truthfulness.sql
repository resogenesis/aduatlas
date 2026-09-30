-- =============================================================================
-- 0022_launch_gate_truthfulness.sql
--
-- CORRECTNESS EXCEPTIONS UNDER PHASE_1.md 2t. The Rules and Resources schema is
-- frozen and changes only for an actual correctness or security defect. Each item
-- below is one: the adversarial launch gate reproduced it on staging against
-- release candidate RC1, by behaviour, and supabase/tests/invariants/
-- 260_public_truthfulness.sql fails against the chain without this file. Nothing
-- here comes from competitor research. No stored row changes. No existing column
-- of any view changes name, type or position, and the two views that gain columns
-- gain them at the END, which is the only change Postgres allows a view to take in
-- place. Two outputs are corrected on purpose and say so where they are defined:
-- jurisdiction_coverage_public.is_indexable (T3) and the may_submit key of
-- my_government_context() (T4). Every other column keeps its meaning.
--
--   T1  DEF-02  After a government's identity verification was withdrawn, a rule
--               it supplied was column for column the same as ADUAtlas research
--               in regulatory_provisions_public, because the view exposed only
--               provided_by_entity_*, and those are rightly gated on a CURRENTLY
--               verified entity. 2t keeps "government-supplied information" and
--               "government identity verification" as two facts, and the view
--               silently erased the first whenever the second ended. Both public
--               views now carry supplied_by, the stored supplier kind.
--               provided_by_entity_* stay gated on a verified entity exactly as
--               before.
--   T2  DEF-04  government_resources_public did not carry verification_status, so
--               a disputed or unchecked resource could only be shown as if
--               ADUAtlas had checked it. It now does, as the rules view already
--               did.
--   T3  DEF-03  jurisdiction_coverage_public.is_indexable counted every published
--               resource, including "this jurisdiction publishes none" findings
--               (field_state = source_did_not_state). Three of those made a page
--               with no verified content indexable, which is the thin page 2l
--               forbids. It now counts resources verified from source only.
--               resources_published keeps its meaning (every published resource).
--   T4  DEF-22  my_government_context() listed an entity's granted jurisdictions,
--               with may_submit true, after the entity's identity verification
--               was withdrawn, while government_may_read_jurisdiction() and the
--               submission policy refused every use of them. The portal therefore
--               offered authority the database refuses. The list now holds only
--               grants the caller can actually use, and may_submit is the
--               submission predicate itself, government_may_submit_as(), so it can
--               never again say yes where the policy says no (this also covers a
--               viewer-role member, whose grant never let them submit).
--   T5  DEF-18, DEF-24
--               A link or code a partner issued (the insert 0014 grants to a
--               verified member of an active partner) carried no record of who
--               issued it: created_by_app_user_id was never stamped, and no
--               regulatory_audit_log row was written. Only the admin_issue_partner_*
--               RPCs recorded either. Now the database stamps the issuer from the
--               caller's verified identity on every client insert, a client can
--               never set or move it, and ONE trigger writes the partner_link.issued
--               or partner_code.issued audit row for every issue, whoever issued
--               it. The two admin RPCs therefore stop writing their own copy, so
--               an admin issue still produces exactly one row, identical to before.
--   T6  DEF-17  jurisdiction_rule_stack() and jurisdiction_ancestors() were
--               executable by anon and always failed for anon (they read the
--               jurisdictions base table, which anon cannot read). No page uses
--               them. EXECUTE is revoked from anon and PUBLIC; authenticated and
--               service_role keep it.
--
-- Everything below is copied from the CURRENT definition (0012, 0014 or 0021, as
-- named at each object) and changed ONLY where marked "0022".
-- =============================================================================


-- ── T1: the rules view (current definition: 0012) ────────────────────────────
create or replace view public.regulatory_provisions_public as
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
         p.superseded_or_repealed_date,
         -- 0022 (T1). WHO SUPPLIED IT, as stored: aduatlas_research or
         -- government_account. A separate fact from provided_by_entity_*, which
         -- name the government only while its identity is verified. After a
         -- withdrawal this still says government_account with no name beside it,
         -- so the rule can never read as ADUAtlas research.
         p.supplied_by
    from public.regulatory_provisions p
    join public.jurisdictions j     on j.id = p.jurisdiction_id and j.published_at is not null
    join public.regulatory_topics t on t.key = p.topic_key
    left join public.government_entities e on e.id = p.supplied_by_entity_id
   where p.is_published;

comment on view public.regulatory_provisions_public is
  'The published regulatory database, and the only route an anonymous visitor or a homeowner has into it. Drafts, submissions, internal notes and superseded rules are not here. source_is_official_government and provided_by_entity_name are deliberately two columns: a rule read off a government website is not a rule a government participated in. supplied_by (0022) is a third, separate fact: who supplied the rule, which stays true after a government''s identity verification is withdrawn, when provided_by_entity_* go null.';


-- ── T1, T2: the resources view (current definition: 0021) ────────────────────
create or replace view public.government_resources_public as
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
         -- 0021 (E3): the same test as a rule. Every allowed source_type is an
         -- official one, so the TYPE is what makes "official source" true; a URL
         -- alone records nothing about who published it.
         (r.source_url is not null and r.source_type is not null) as source_is_official_government,
         case when r.supplied_by = 'government_account' and e.verification_status = 'verified'
              then e.name end as provided_by_entity_name,
         r.effective_date,
         r.source_checked_date,
         r.record_published_at,
         r.superseded_or_repealed_date,
         r.sort_order,
         -- 0022 (T1). Who supplied it, as stored, exactly as on a rule.
         r.supplied_by,
         -- 0022 (T2). Who checked it: source_checked, unverified or disputed. The
         -- rules view has always carried this; without it a disputed resource
         -- could only be shown as checked.
         r.verification_status
    from public.government_resources r
    join public.jurisdictions j on j.id = r.jurisdiction_id and j.published_at is not null
    left join public.government_entities e on e.id = r.supplied_by_entity_id
   where r.is_published;

comment on view public.government_resources_public is
  'Published official links and contacts. A row with field_state = source_did_not_state is ADUAtlas saying it looked and this jurisdiction publishes no such resource, which is an answer; it is never rendered as a missing link. supplied_by and verification_status (0022) carry the same two facts the rules view carries: who supplied it, and who checked it.';


-- ── T3: coverage (current definition: 0012) ──────────────────────────────────
create or replace view public.jurisdiction_coverage_public as
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
         --
         -- 0022 (T3): resources count toward it only when verified from source. A
         -- "this jurisdiction publishes none" record is an answer, and a true one,
         -- but it is not content that justifies an indexable page.
         (count(*) filter (where c.field_state = 'verified_from_source') >= 5
          or (select count(*) from public.government_resources_public r
               where r.jurisdiction_id = j.id
                 and r.field_state = 'verified_from_source') >= 3)
           as is_indexable
    from public.jurisdictions j
    left join public.jurisdiction_topic_coverage c on c.jurisdiction_id = j.id
   where j.published_at is not null
   group by j.id, j.state_code, j.path, j.jurisdiction_type, j.name;

comment on view public.jurisdiction_coverage_public is
  'Coverage counted from the published rows, never stored. topics_not_researched is a first-class number the product is expected to show: incomplete is allowed and fabrication is not. is_indexable is the 2l search rule (enough verified content to justify a page: five verified topics, or three resources verified from source), which is a different question from whether the page is published. resources_published counts every published resource, including "publishes none" findings.';


-- ── T4: what can I do here? (current definition: 0012) ───────────────────────
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
               --
               -- 0022 (T4). What is listed is also what the caller can USE. The
               -- filter below is government_may_read_jurisdiction()'s, for THIS
               -- entity: a verified, unrevoked membership of an entity whose
               -- identity is verified NOW. After a withdrawal the list is empty,
               -- as every read and submission is refused. may_submit is the
               -- submission predicate itself, so it cannot disagree with the
               -- policy that decides.
               'jurisdictions', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'jurisdiction_id', j.id, 'name', j.name, 'path', j.path,
                           'jurisdiction_type', j.jurisdiction_type,
                           'may_submit', public.government_may_submit_as(e.id, j.id))
                           order by j.path)
                    from public.government_jurisdiction_grants g
                    join public.jurisdictions j on j.id = g.jurisdiction_id
                   where g.entity_id = e.id
                     and g.revoked_at is null
                     and m.status = 'verified'
                     and m.revoked_at is null
                     and e.verification_status = 'verified'), '[]'::jsonb))
               order by e.name)
        from public.government_memberships m
        join public.government_users gu on gu.id = m.government_user_id
        join public.users u on u.id = gu.user_id
        join public.government_entities e on e.id = m.entity_id
       where u.auth_user_id = auth.uid()), '[]'::jsonb));
$$;

comment on function public.my_government_context() is
  'Read-only: who the caller is, which entities they have a membership of, in which state, and the EXPLICIT list of jurisdictions each membership can use today. A pending member, a revoked member, and a member of an entity whose identity verification was withdrawn all see their membership and an empty jurisdiction list, which is the honest answer. may_submit is government_may_submit_as() for that entity and jurisdiction (0022).';


-- ── T5: who issued a resident link or code ───────────────────────────────────
-- BEFORE trigger, and deliberately NOT security definer: it must see the role the
-- statement really runs as, which is how regulatory_writer_is_aduatlas() (0012)
-- tells a browser request from ADUAtlas. A definer body would always look like
-- ADUAtlas.
--
--   a client (anon/authenticated)  created_by_app_user_id is the caller, from the
--                                  verified JWT, on INSERT; on UPDATE it cannot
--                                  move. 0014's column grants already keep the
--                                  column out of a client's INSERT and UPDATE;
--                                  this makes the stamp the database's own act.
--   ADUAtlas (service_role, a      unchanged. admin_issue_partner_*() pass the
--   SECURITY DEFINER RPC, psql)    acting admin, which is the truth for that path.
create or replace function public.partner_access_issuer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.regulatory_writer_is_aduatlas() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by_app_user_id := public.current_app_user_id();
  else
    new.created_by_app_user_id := old.created_by_app_user_id;
  end if;
  return new;
end;
$$;

comment on function public.partner_access_issuer() is
  '0022: stamps partner_access_links/codes.created_by_app_user_id from the caller on a client insert and keeps it fixed on a client update, so who issued a resident link or code is the database''s record and never the client''s claim. ADUAtlas writers (service_role, the admin RPCs) keep the actor they pass.';

-- AFTER INSERT, SECURITY DEFINER because regulatory_audit() is revoked from every
-- API role. The row it writes is exactly the row admin_issue_partner_*() wrote
-- before this file: the same action, changed field, label and actor. The code or
-- token itself is never written to the audit log.
create or replace function public.partner_access_issued_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.regulatory_audit(
    case when tg_table_name = 'partner_access_links' then 'partner_link.issued'
         else 'partner_code.issued' end,
    tg_table_name, new.id, new.jurisdiction_id, new.entity_id,
    case when tg_table_name = 'partner_access_links' then array['token']
         else array['code'] end,
    null, jsonb_build_object('label', new.label), new.label, new.created_by_app_user_id);
  return null;
end;
$$;

comment on function public.partner_access_issued_audit() is
  '0022: the one writer of partner_link.issued and partner_code.issued audit rows, for every issue whoever made it (a partner through the 0014 insert grant, or ADUAtlas through admin_issue_partner_*). Never records the token or code.';

revoke all on function public.partner_access_issuer()       from public, anon, authenticated, service_role;
revoke all on function public.partner_access_issued_audit() from public, anon, authenticated, service_role;

create trigger partner_access_links_issuer
  before insert or update on public.partner_access_links
  for each row execute function public.partner_access_issuer();
create trigger partner_access_codes_issuer
  before insert or update on public.partner_access_codes
  for each row execute function public.partner_access_issuer();

create trigger partner_access_links_issued_audit
  after insert on public.partner_access_links
  for each row execute function public.partner_access_issued_audit();
create trigger partner_access_codes_issued_audit
  after insert on public.partner_access_codes
  for each row execute function public.partner_access_issued_audit();

-- The admin RPCs (current definition: 0014). Changed ONLY by removing their own
-- regulatory_audit() call, which the trigger above now makes for them. Signature,
-- grants, comments and return value are unchanged.
create or replace function public.admin_issue_partner_link(
  p_entity_id uuid, p_jurisdiction_id uuid, p_actor_app_user_id uuid,
  p_label text default null, p_expires_at timestamptz default null,
  p_max_redemptions integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_p uuid; v_id uuid; v_token text;
begin
  select id into v_p from public.government_partnerships where entity_id = p_entity_id;
  if v_p is null then raise exception 'this entity has no ADUAtlas Education Partnership'; end if;
  insert into public.partner_access_links
    (partnership_id, entity_id, jurisdiction_id, token, label, expires_at,
     max_redemptions, created_by_app_user_id)
  values (v_p, p_entity_id, p_jurisdiction_id, 'placeholder', p_label, p_expires_at,
          p_max_redemptions, p_actor_app_user_id)
  returning id, token into v_id, v_token;
  -- 0022 (T5): the partner_link.issued audit row is written by
  -- partner_access_issued_audit(), from created_by_app_user_id = p_actor_app_user_id.
  return jsonb_build_object('ok', true, 'link_id', v_id, 'token', v_token);
end;
$$;

create or replace function public.admin_issue_partner_code(
  p_entity_id uuid, p_jurisdiction_id uuid, p_actor_app_user_id uuid,
  p_label text default null, p_expires_at timestamptz default null,
  p_max_redemptions integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_p uuid; v_id uuid; v_code text;
begin
  select id into v_p from public.government_partnerships where entity_id = p_entity_id;
  if v_p is null then raise exception 'this entity has no ADUAtlas Education Partnership'; end if;
  insert into public.partner_access_codes
    (partnership_id, entity_id, jurisdiction_id, code, label, expires_at,
     max_redemptions, created_by_app_user_id)
  values (v_p, p_entity_id, p_jurisdiction_id, 'AAAAAAAA', p_label, p_expires_at,
          p_max_redemptions, p_actor_app_user_id)
  returning id, code into v_id, v_code;
  -- 0022 (T5): the partner_code.issued audit row is written by
  -- partner_access_issued_audit(), from created_by_app_user_id = p_actor_app_user_id.
  -- The code is returned to Amy because she has to hand it over. It is never
  -- written into the audit log, which is read far more widely than it is issued.
  return jsonb_build_object('ok', true, 'code_id', v_id, 'code', v_code);
end;
$$;


-- ── T6: two display functions anon could call and never use ──────────────────
-- Revoked from PUBLIC as well as anon, because a function's default EXECUTE is
-- PUBLIC's and anon would keep it through PUBLIC. authenticated and service_role
-- hold their own grants from 0012; they are restated so this file says plainly
-- who keeps it.
revoke execute on function public.jurisdiction_rule_stack(uuid) from public, anon;
revoke execute on function public.jurisdiction_ancestors(uuid)  from public, anon;
grant  execute on function public.jurisdiction_rule_stack(uuid) to authenticated, service_role;
grant  execute on function public.jurisdiction_ancestors(uuid)  to authenticated, service_role;


-- ── T7 (DEF-07, database half): paid course text is not public ───────────────
-- Added at integration by the orchestrator, after WP-H moved every chapter body
-- and quiz out of the public JS bundle into api/course.js. get_site_content()
-- (0002) returned EVERY published site_content row to anon, so a published edit
-- of a course chapter ("course.chapter.<id>") or of the course introduction
-- ("course.intro") was readable by anyone without buying the course. Those keys
-- are now served only by api/course.js, which applies the published override
-- itself with the service role, for an entitled caller. Module titles and blurbs
-- ("course.module.*") and every non-course key stay public, as before. Same
-- signature, same grants.
create or replace function public.get_site_content()
returns table (key text, type text, value jsonb)
language sql
security definer
set search_path = public
stable
as $$
  select key, type, published_value
  from public.site_content
  where published_value is not null
    and key not like 'course.chapter.%'
    and key <> 'course.intro';
$$;

grant execute on function public.get_site_content() to anon, authenticated;
