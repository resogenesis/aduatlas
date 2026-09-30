// Editable content for the course app (CourseIntro, CourseIndex, CourseChapter).
// Keys come from the course outline in courseStore.js, so every chapter that
// exists has exactly one entry and nothing is retyped. Structure (which
// chapters/modules exist, their order, ids, block shape within a chapter)
// stays code-owned; only the string leaves inside each block, and each
// module's title/blurb, are admin-editable.
//
// THE COURSE TEXT IS NOT IN THIS REGISTRY (DEF-07). The chapter bodies and the
// course introduction are paid content and live server-side in
// api/_course/content.js. Their entries here carry `default: null` (the bundle
// does not hold the text, so it does not pretend to) and a `loadDefault()` that
// fetches the text from /api/course with the signed-in session's token. The
// admin editor calls it for a key that has no saved row yet; learners get the
// text from /api/course directly (see useCourseItem in courseStore.js).
//
// Published rows in site_content still win: /api/course applies a published
// "course.chapter.<id>" or "course.intro" value before it answers, the same
// rule useContentBlocks() applies on the client. course.intro in particular has
// a published row in production carrying the superseded offer wording
// ("Report" as a package name), and it will keep rendering until an admin
// republishes it from the default in api/_course/content.js.
import { chapters, modules, fetchCourseItem } from "../../stores/courseStore";

const PAGE = "Course";

// The server's current text for one course id, or null when it cannot be read
// (signed out, not entitled, network). Never a made-up placeholder.
const loadFromServer = (id) => async () => {
  const r = await fetchCourseItem(id);
  return r.ok && Array.isArray(r.data?.sections) ? r.data.sections : null;
};

// One `blocks` entry per chapter (quizzes are not admin-editable). Same
// { p } | { h, p } | { h, list } | { remember } shape CourseChapter.jsx renders
// via <Sections>.
const chapterEntries = Object.fromEntries(
  chapters
    .filter((c) => c.kind !== "quiz")
    .map((c) => [
      `course.chapter.${c.id}`,
      { page: PAGE, label: `Chapter ${c.id}`, type: "blocks", default: null, loadDefault: loadFromServer(c.id) },
    ])
);

const introEntry = {
  "course.intro": { page: PAGE, label: "Course intro", type: "blocks", default: null, loadDefault: loadFromServer("intro") },
};

// Module title/blurb only. id, n, tag and the chapters array itself stay
// code-owned (structure, not prose copy shown as a title).
const moduleEntries = Object.fromEntries(
  modules.flatMap((m) => [
    [`course.module.${m.id}.title`, { page: PAGE, label: `${m.id} title`, type: "text", default: m.title }],
    [`course.module.${m.id}.blurb`, { page: PAGE, label: `${m.id} blurb`, type: "text", default: m.blurb }],
  ])
);

export const COURSE_CONTENT = { ...chapterEntries, ...introEntry, ...moduleEntries };
