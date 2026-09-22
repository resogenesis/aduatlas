// Which registry keys the admin content editor may change right now.
// Richard, 2026-09-21: "admin can't update the front-facing site, just the
// course for now." Public-site copy (home, about, how-to, FAQ, ADU types,
// course outline, legal, methodology) stays code-owned; only course content
// (chapters, intro, module titles/blurbs — every key starts with "course.")
// is editable. Widen the list here when the public site opens up again.
//
// No imports on purpose: the serverless admin API imports this file too.
export const ADMIN_EDITABLE_KEY_PREFIXES = ["course."];

export const isAdminEditable = (key) =>
  typeof key === "string" && ADMIN_EDITABLE_KEY_PREFIXES.some((p) => key.startsWith(p));
