-- =============================================================================
-- INVARIANT: paid course text is never readable without buying the course.
--
-- DEF-07, found at the RC1 launch gate: the whole paid course shipped in the
-- anonymously served JS bundle. The bundle half is fixed in code (api/course.js
-- serves chapter bodies and quizzes to entitled callers only; scripts/regress
-- check 800 proves the bundle no longer carries them). THIS file proves the
-- database half: the public get_site_content() RPC must not hand an anonymous or
-- unpaid caller a published edit of a course chapter or of the introduction,
-- while every public key (module titles, page copy) still comes through.
-- =============================================================================
select t.suite('270 course text not public (DEF-07)');

do $$
declare
  v_home uuid := t.mk_account('homeowner');
begin
  insert into public.site_content (key, page, label, type, published_value, published_at)
  values ('course.chapter.t270c1', 'course', 't270 chapter', 'blocks', '[{"type":"p","text":"t270 PAID CHAPTER TEXT"}]'::jsonb, now()),
         ('course.intro',          'course', 't270 intro',   'blocks', '[{"type":"p","text":"t270 PAID INTRO TEXT"}]'::jsonb, now()),
         ('course.module.t270.title', 'course', 't270 module title', 'text', '"t270 public module title"'::jsonb, now()),
         ('t270.public.copy',      'home',   't270 public copy', 'text', '"t270 public page copy"'::jsonb, now())
  on conflict (key) do update set published_value = excluded.published_value, published_at = excluded.published_at;

  perform t.assert_count(
    'anon-gets-no-published-chapter-edit',
    'DEF-07: a published course chapter edit is paid content and is never returned to an anonymous caller',
    'anon', null,
    $q$select 1 from public.get_site_content() where key like 'course.chapter.%'$q$,
    0,
    'get_site_content() returns a published course chapter to anon, so anyone can read an edited chapter without buying the course');

  perform t.assert_count(
    'anon-gets-no-published-intro',
    'DEF-07: the course introduction is part of the paid course',
    'anon', null,
    $q$select 1 from public.get_site_content() where key = 'course.intro'$q$,
    0,
    'get_site_content() returns the published course introduction to anon');

  perform t.assert_count(
    'unpaid-gets-no-published-chapter-edit',
    'DEF-07: signing in without buying does not unlock course text either',
    'authenticated', t.authid(v_home),
    $q$select 1 from public.get_site_content() where key like 'course.chapter.%' or key = 'course.intro'$q$,
    0,
    'an unpaid signed-in account receives published course text through get_site_content()');

  -- Controls: the RPC still works for everything that IS public. Without these,
  -- "nothing came back" could mean the RPC is simply broken.
  perform t.assert_count(
    'control-module-title-still-public',
    'control: module titles are public course metadata and still come through',
    'anon', null,
    $q$select 1 from public.get_site_content() where key = 'course.module.t270.title'$q$,
    1,
    'get_site_content() no longer returns public course metadata, so the refusals above may be a broken RPC');

  perform t.assert_count(
    'control-public-copy-still-public',
    'control: ordinary page copy still comes through',
    'anon', null,
    $q$select 1 from public.get_site_content() where key = 't270.public.copy'$q$,
    1,
    'get_site_content() no longer returns public page copy');
end
$$;
