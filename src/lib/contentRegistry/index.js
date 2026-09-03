// Single source of truth for every admin-editable field on the site: what
// exists, which page it belongs to, its type, and its default value (the
// exact copy the page rendered before this feature existed). Consumed by:
//   - src/lib/content.js's hooks (fallback when nothing's published yet)
//   - the admin UI (src/pages/admin/AdminContent.jsx) to list every editable
//     field, grouped by `page`
//
// Structure (which fields exist, block/array order and shape) is owned here
// and in code — only each entry's *value* is ever admin-editable. To add a
// new editable field: add one entry below (or in the relevant page module)
// and call the matching hook (useContentText/useContentBlocks/useContentImage)
// at the render site with the same key.
//
// Entry shape: { page, label, type: 'text' | 'image' | 'blocks', default }
//   - text:   default is a string. A single "\n" renders as <br/>; "\n\n"
//             (see paragraphs() in content.js) separates <p> blocks.
//   - image:  default is { src, alt } (src is the bundled asset import).
//   - blocks: default is an array of { p } | { h, p } | { h, list } |
//             { remember } objects (same shape as courseContent.js).
import { HOME_CONTENT } from "./home";
import { ABOUT_CONTENT } from "./about";
import { HOW_TO_ADU_CONTENT } from "./howToAdu";
import { FAQ_CONTENT } from "./faq";
import { ADU_TYPES_CONTENT } from "./aduTypes";
import { CHOOSE_STATE_CONTENT } from "./chooseState";
import { VIDEOS_CONTENT } from "./videos";
import { COURSE_OUTLINE_CONTENT } from "./courseOutline";
import { LEGAL_CONTENT } from "./legal";
import { METHODOLOGY_CONTENT } from "./methodology";
import { COURSE_CONTENT } from "./course";

export const CONTENT = {
  ...HOME_CONTENT,
  ...ABOUT_CONTENT,
  ...HOW_TO_ADU_CONTENT,
  ...FAQ_CONTENT,
  ...ADU_TYPES_CONTENT,
  ...CHOOSE_STATE_CONTENT,
  ...VIDEOS_CONTENT,
  ...COURSE_OUTLINE_CONTENT,
  ...LEGAL_CONTENT,
  ...METHODOLOGY_CONTENT,
  ...COURSE_CONTENT,
};
