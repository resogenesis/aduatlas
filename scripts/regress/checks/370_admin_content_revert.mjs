// R3-10 (the B09 mechanism): Amy can undo the FIRST publish of a course key, and
// the learner is served the text written with the course again.
//
// On RC3 the first publish of a key archived nothing (there was no earlier
// published value), History said "No prior published versions yet", there was
// no revert or unpublish route, and every published value overrode the code
// default for good, so a later fix to the course text never reached a learner
// (j5). Course chapter defaults are served by api/course.js, which reads the
// published override first.
//
// Fixture: one course chapter key that has NO site_content row on the target
// (the check refuses to touch a key somebody has edited). A marker is published
// through the admin API, the golden_purchased persona reads the chapter through
// /api/course, and the key is taken back to its default. The row the check
// created is deleted with the service role at the end, whatever happened.
export const meta = {
  name: "370 admin content: the first publish of a course key can be undone, back to the default",
  rules: [
    "R3-10: the console's content API can take a published course key back to its default",
    "R3-10: after that the learner is served the default text again (api/course.js)",
    "R3-10: the text that was taken down is kept in History, where it can be restored",
  ],
};

const CANDIDATES = ["m3c3", "m3c2", "m2c9", "m2c8"];

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `revert-${i + 1}`, rule, status: "skip", detail: "no service role key; the fixture cannot be removed afterwards" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const adminToken = await ctx.token("admin");
  const learner = await ctx.token("golden_purchased");
  const api = (route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/content/${route}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${adminToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const chapter = async (id) => ctx.fetchJson(`${ctx.base}/api/course?id=${id}`, { headers: { Authorization: `Bearer ${learner}` } });

  // A chapter nobody has edited on this target.
  let id = null;
  for (const c of CANDIDATES) {
    const row = await ctx.fetchJson(`${rest}/site_content?key=eq.course.chapter.${c}&select=key`, { headers: H });
    if (Array.isArray(row.body) && row.body.length === 0) {
      id = c;
      break;
    }
  }
  if (!id) return meta.rules.map((rule, i) => ({ name: `revert-${i + 1}`, rule, status: "skip", detail: `every candidate chapter (${CANDIDATES.join(", ")}) already has an edited row here; the check does not touch real edits` }));
  const key = `course.chapter.${id}`;
  const marker = `${ctx.prefix} 370 temporary edit`;

  try {
    const base = await chapter(id);
    if (base.status !== 200) throw new Error(`golden_purchased cannot read ${id}: HTTP ${base.status}`);
    const defaultText = JSON.stringify(base.body.sections);

    const draft = await api("save-draft", { key, type: "blocks", page: "Course", label: `Chapter ${id}`, value: [{ p: marker }] });
    const pub = await api("publish", { keys: [key] });
    const live = await chapter(id);
    if (draft.status !== 200 || pub.status !== 200 || !JSON.stringify(live.body?.sections || []).includes(marker)) {
      throw new Error(`positive control failed: the published edit did not reach the learner (save ${draft.status}, publish ${pub.status}, read ${live.status})`);
    }

    const revert = await api("revert-to-default", { key });
    add(
      "back to default",
      meta.rules[0],
      revert.status === 200,
      `content/revert-to-default -> HTTP ${revert.status} ${JSON.stringify(revert.body).slice(0, 160)}`,
    );

    const after = await chapter(id);
    const afterText = JSON.stringify(after.body?.sections || []);
    add(
      "learner sees the default again",
      meta.rules[1],
      after.status === 200 && afterText === defaultText && !afterText.includes(marker),
      after.status !== 200 ? `HTTP ${after.status}` : afterText.includes(marker) ? "the learner is still served the edit" : afterText === defaultText ? "the learner is served the default text" : "the learner is served something that is neither the edit nor the default",
    );

    const versions = await api(`versions?key=${encodeURIComponent(key)}`);
    const kept = (versions.body?.versions || []).some((v) => JSON.stringify(v.value || "").includes(marker));
    add(
      "removed text kept in History",
      meta.rules[2],
      revert.status === 200 && kept,
      `${(versions.body?.versions || []).length} version(s) in History; the taken-down edit ${kept ? "is" : "is NOT"} among them`,
    );
  } finally {
    // Only ever the row this check created: the key had no row when it started.
    await ctx.fetchJson(`${rest}/site_content?key=eq.${encodeURIComponent(key)}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
  }
  return out;
}
