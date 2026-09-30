-- =============================================================================
-- 0021_regulatory_maintenance.sql
--
-- Three CORRECTNESS defects in the frozen Rules and Resources schema (0012),
-- each reproduced by supabase/tests/invariants/250_regulatory_maintenance.sql
-- against the unfixed chain (8 failing assertions) before this file was written.
-- Under PHASE_1.md 2t the schema changes only for an actual correctness or
-- security defect; these are that, and nothing else. No column, table, index or
-- stored row changes meaning. Nothing here comes from competitor research.
--
--   E1  A rule with a FUTURE effective date, once published, superseded the rule
--       in force immediately, so the public page showed a rule that did not apply
--       yet and hid the one that did. A future repeal date hid a rule the same
--       way. Both are now refused until the date arrives (Phase 2 shows upcoming
--       rules and scheduled repeals honestly).
--   E2  After a government's identity verification was WITHDRAWN (0020, 2s D4),
--       ADUAtlas could not supersede or retract any rule or resource that
--       government had supplied. A pure retirement, with nothing it said changed,
--       now passes the supplier check. Every other write still does not.
--   E3  government_resources_public called a resource "official government
--       source" from its source URL alone. It now needs an official source type
--       too, exactly as regulatory_provisions_public already does.
--
-- Everything below is copied from 0012 and changed ONLY where marked "0021".
-- =============================================================================

-- ── the one helper ──────────────────────────────────────────────────────────
-- True when an UPDATE moves a published record out of publication (superseded or
-- retracted) and changes nothing except the columns that act records. Compared as
-- whole row images, so a column added later is covered without editing this.
-- is_published is generated and is not yet computed inside a BEFORE trigger.
create or replace function public.regulatory_is_pure_retirement(p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
           p_old ->> 'review_status' = 'published'
       and p_new ->> 'review_status' in ('superseded', 'retracted')
       and (p_old - array['review_status', 'superseded_or_repealed_date', 'superseded_by_provision_id',
                          'retracted_at', 'retraction_reason', 'admin_note', 'updated_at', 'is_published'])
         = (p_new - array['review_status', 'superseded_or_repealed_date', 'superseded_by_provision_id',
                          'retracted_at', 'retraction_reason', 'admin_note', 'updated_at', 'is_published']),
         false);
$$;

-- Trigger plumbing only; never an API.
revoke all on function public.regulatory_is_pure_retirement(jsonb, jsonb) from public, anon, authenticated;

-- ── E1, E2: the provisions guard ─────────────────────────────────────────────
create or replace function public.regulatory_provisions_guard()
returns trigger
language plpgsql
as $$
declare
  v_content_changed boolean := false;
  v_pure_retirement boolean := false;
begin
  if not public.regulatory_writer_is_aduatlas() then
    raise exception 'regulatory provisions are published by ADUAtlas only. A verified government account SUBMITS (regulatory_submissions); it never publishes.'
      using errcode = '42501';
  end if;

  -- "Provided by a verified government account" must be true whenever it is said.
  -- 0021 (E2). EXCEPT when the only thing happening is that a published record
  -- leaves publication, superseded or retracted, with nothing it said changed.
  -- That statement credits the government with nothing new: it is ADUAtlas taking
  -- a record down or replacing it, and after a withdrawal (0020, 2s D4) it is
  -- exactly what must still be possible. Any other write, including a retirement
  -- that also changes a single word, is still refused for a supplier that is not
  -- verified.
  if tg_op = 'UPDATE' then
    v_pure_retirement := public.regulatory_is_pure_retirement(to_jsonb(old), to_jsonb(new));
  end if;
  if new.supplied_by = 'government_account' and not v_pure_retirement and not exists (
       select 1 from public.government_entities e
        where e.id = new.supplied_by_entity_id and e.verification_status = 'verified') then
    raise exception 'a provision cannot be attributed to a government account that is not verified'
      using errcode = '23514';
  end if;

  -- 0021 (E1). Nothing is presented as current before it takes effect, and
  -- nothing current is hidden before it is repealed. The public view shows exactly
  -- the records that are published with no repeal date, so a record may be
  -- published only once its effective date has arrived, and a repeal date may be
  -- recorded only once it has arrived. Either one in the future would change what
  -- the page says TODAY about a rule that has not changed yet. Showing
  -- adopted-but-not-yet-effective records and scheduled repeals honestly is
  -- Phase 2 (PHASE_1.md 2t).
  if new.review_status = 'published' and new.effective_date > current_date then
    if tg_op = 'INSERT' then
      raise exception 'this provision takes effect on %; publishing it now would present it as current before then. Publish it on or after its effective date.', new.effective_date
        using errcode = '23514';
    elsif old.review_status is distinct from 'published' or new.effective_date is distinct from old.effective_date then
      raise exception 'this provision takes effect on %; publishing it now would present it as current, and replace the provision in force, before then. Publish it on or after its effective date.', new.effective_date
        using errcode = '23514';
    end if;
  end if;
  -- Only a record that is or was PUBLISHED: a draft's dates are not on the page.
  if new.superseded_or_repealed_date > current_date then
    if tg_op = 'INSERT' then
      if new.review_status = 'published' then
        raise exception 'a repeal or supersession dated % has not happened yet; record it on or after that date', new.superseded_or_repealed_date
          using errcode = '23514';
      end if;
    elsif (old.review_status = 'published' or new.review_status = 'published')
          and new.superseded_or_repealed_date is distinct from old.superseded_or_repealed_date then
      raise exception 'a repeal or supersession dated % has not happened yet; recording it now would take a provision that is still in force off the public page. Record it on or after that date.', new.superseded_or_repealed_date
        using errcode = '23514';
    end if;
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

-- ── E1, E2: the resources guard ──────────────────────────────────────────────
create or replace function public.government_resources_guard()
returns trigger
language plpgsql
as $$
declare
  v_content_changed boolean := false;
  v_pure_retirement boolean := false;
begin
  if not public.regulatory_writer_is_aduatlas() then
    raise exception 'government resources are published by ADUAtlas only. A verified government account SUBMITS; it never publishes.'
      using errcode = '42501';
  end if;

  -- 0021 (E2). EXCEPT when the only thing happening is that a published record
  -- leaves publication, superseded or retracted, with nothing it said changed.
  -- That statement credits the government with nothing new: it is ADUAtlas taking
  -- a record down or replacing it, and after a withdrawal (0020, 2s D4) it is
  -- exactly what must still be possible. Any other write, including a retirement
  -- that also changes a single word, is still refused for a supplier that is not
  -- verified.
  if tg_op = 'UPDATE' then
    v_pure_retirement := public.regulatory_is_pure_retirement(to_jsonb(old), to_jsonb(new));
  end if;
  if new.supplied_by = 'government_account' and not v_pure_retirement and not exists (
       select 1 from public.government_entities e
        where e.id = new.supplied_by_entity_id and e.verification_status = 'verified') then
    raise exception 'a resource cannot be attributed to a government account that is not verified'
      using errcode = '23514';
  end if;

  -- 0021 (E1). Nothing is presented as current before it takes effect, and
  -- nothing current is hidden before it is repealed. The public view shows exactly
  -- the records that are published with no repeal date, so a record may be
  -- published only once its effective date has arrived, and a repeal date may be
  -- recorded only once it has arrived. Either one in the future would change what
  -- the page says TODAY about a resource that has not changed yet. Showing
  -- adopted-but-not-yet-effective records and scheduled repeals honestly is
  -- Phase 2 (PHASE_1.md 2t).
  if new.review_status = 'published' and new.effective_date > current_date then
    if tg_op = 'INSERT' then
      raise exception 'this resource takes effect on %; publishing it now would present it as current before then. Publish it on or after its effective date.', new.effective_date
        using errcode = '23514';
    elsif old.review_status is distinct from 'published' or new.effective_date is distinct from old.effective_date then
      raise exception 'this resource takes effect on %; publishing it now would present it as current, and replace the resource in force, before then. Publish it on or after its effective date.', new.effective_date
        using errcode = '23514';
    end if;
  end if;
  -- Only a record that is or was PUBLISHED: a draft's dates are not on the page.
  if new.superseded_or_repealed_date > current_date then
    if tg_op = 'INSERT' then
      if new.review_status = 'published' then
        raise exception 'a repeal or supersession dated % has not happened yet; record it on or after that date', new.superseded_or_repealed_date
          using errcode = '23514';
      end if;
    elsif (old.review_status = 'published' or new.review_status = 'published')
          and new.superseded_or_repealed_date is distinct from old.superseded_or_repealed_date then
      raise exception 'a repeal or supersession dated % has not happened yet; recording it now would take a resource that is still in force off the public page. Record it on or after that date.', new.superseded_or_repealed_date
        using errcode = '23514';
    end if;
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

-- ── E3: the resources view ───────────────────────────────────────────────────
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
         r.sort_order
    from public.government_resources r
    join public.jurisdictions j on j.id = r.jurisdiction_id and j.published_at is not null
    left join public.government_entities e on e.id = r.supplied_by_entity_id
   where r.is_published;

