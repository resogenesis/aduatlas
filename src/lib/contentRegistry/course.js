// Editable content for the course app (CourseIntro, CourseIndex, CourseChapter).
// Built programmatically from the existing course data files so there is zero
// risk of transcription drift — every `default` value here is the actual
// object already exported by courseContent.js / courseStore.js, not retyped
// text. Structure (which chapters/modules exist, their order, ids, block
// shape within a chapter) stays code-owned — only the string leaves inside
// each block, and each module's title/blurb, are admin-editable.
import { CHAPTER_CONTENT, COURSE_INTRO } from "../../stores/courseContent";
import { modules } from "../../stores/courseStore";

const PAGE = "Course";

// One `blocks` entry per authored chapter — same { p } | { h, p } | { h, list }
// | { remember } shape CourseChapter.jsx already renders via <Sections>.
const chapterEntries = Object.fromEntries(
  Object.entries(CHAPTER_CONTENT).map(([chapterId, blocks]) => [
    `course.chapter.${chapterId}`,
    { page: PAGE, label: `Chapter ${chapterId}`, type: "blocks", default: blocks },
  ])
);

const introEntry = {
  "course.intro": { page: PAGE, label: "Course intro", type: "blocks", default: COURSE_INTRO },
};

// Module title/blurb only — id, n, intro, framework, tag, and the chapters
// array itself stay code-owned (structure, not prose copy shown as a title).
const moduleEntries = Object.fromEntries(
  modules.flatMap((m) => [
    [`course.module.${m.id}.title`, { page: PAGE, label: `${m.id} title`, type: "text", default: m.title }],
    [`course.module.${m.id}.blurb`, { page: PAGE, label: `${m.id} blurb`, type: "text", default: m.blurb }],
  ])
);

export const COURSE_CONTENT = { ...chapterEntries, ...introEntry, ...moduleEntries };
