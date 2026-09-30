// DEF-07, the second anonymous path: published course edits.
//
// Chapter bodies and the course introduction are admin-editable, and a
// published edit is stored in public.site_content. The public RPC
// get_site_content() (0002) returns EVERY published row to the anon role, so a
// published "course.chapter.<id>" or "course.intro" value is readable by
// anyone with the public anon key, without the bundle and without buying.
//
// This check publishes one fixture row under a key no page uses
// ("course.chapter.<ctx.prefix>"), calls the RPC anonymously, and asserts the
// row is NOT returned; then it removes the row. It stays red until the database
// stops serving course.chapter.* and course.intro through the anon RPC (a
// migration outside this work package; /api/course reads those rows with the
// service role, so learners lose nothing when the RPC drops them).
//
// A control row under a public, non-course fixture key must still come back,
// so a broken RPC or a wrong key can never pass as "not exposed".
export const meta = { name: "803 course edits not exposed by the public content RPC", rules: ["DEF-07"] };

export default async function (ctx) {
  const out = [];
  const push = (name, ok, detail) =>
    out.push({ name, rule: "DEF-07: paid course text is not readable anonymously by any path", status: ok ? "pass" : "fail", detail });

  // Read-only half first: nothing published today may leak.
  const rpc = () =>
    ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/rpc/get_site_content`, {
      method: "POST", headers: { apikey: ctx.anonKey, "Content-Type": "application/json" }, body: "{}",
    });
  const isCourseBody = (k) => typeof k === "string" && (k.startsWith("course.chapter.") || k === "course.intro");
  const now = await rpc();
  const leaked = Array.isArray(now.body) ? now.body.filter((r) => isCourseBody(r.key)).map((r) => r.key) : null;
  push("no published chapter body or course intro is returned to anon today", Array.isArray(leaked) && leaked.length === 0, leaked ? `course body keys returned: ${JSON.stringify(leaked)}` : `rpc status=${now.status}`);

  if (!ctx.serviceKey) {
    push("a published course chapter edit is not returned to anon", false, "no service key: cannot publish the fixture row");
    return out;
  }
  const svc = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  const courseKey = `course.chapter.${ctx.prefix}`;
  const controlKey = `${ctx.prefix}.public-control`;
  const marker = `${ctx.prefix} fixture lesson text`;
  try {
    const ins = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/site_content`, {
      method: "POST", headers: svc,
      body: JSON.stringify([
        { key: courseKey, page: "regress", label: ctx.prefix, type: "blocks", published_value: [{ p: marker }], published_by: ctx.prefix },
        { key: controlKey, page: "regress", label: ctx.prefix, type: "text", published_value: { text: marker }, published_by: ctx.prefix },
      ]),
    });
    if (ins.status >= 300) throw new Error(`fixture publish failed: status=${ins.status} ${JSON.stringify(ins.body).slice(0, 200)}`);
    const after = await rpc();
    const keys = Array.isArray(after.body) ? after.body.map((r) => r.key) : [];
    push("control: a published non-course fixture row IS returned to anon", keys.includes(controlKey), `rpc status=${after.status}, control returned=${keys.includes(controlKey)}`);
    push("a published course chapter edit is not returned to anon", Array.isArray(after.body) && !keys.includes(courseKey), `rpc status=${after.status}, ${courseKey} returned=${keys.includes(courseKey)}`);
  } catch (e) {
    push("a published course chapter edit is not returned to anon", false, String(e?.message || e).slice(0, 300));
  } finally {
    await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/site_content?key=in.(${encodeURIComponent(`"${courseKey}","${controlKey}"`)})`, {
      method: "DELETE", headers: svc,
    }).catch(() => null);
  }
  return out;
}
