// 720 — the homeowner resource card shows the department and the notes written
// for homeowners (RC3 triage R3-24).
//
// RC3: a government submitted, and ADUAtlas published, a permit resource with
// department "j4 Planning and Zoning Division" and the note "apply online; a
// pre-application meeting is recommended". Both are columns of
// government_resources_public, but ResourceList in RulesJurisdiction.jsx never
// read them, so the homeowner's card dropped the department to ask for and the
// note written for them. A resource supplied by a verified government account
// also carried the rule sentence "That is an identity check, not a review of the
// rule."
//
// Read only: rows are found through the same anon views the page reads, and the
// jurisdiction pages are opened signed out.
export const meta = {
  name: "720 resource card shows department and notes",
  rules: [
    "R3-24: a published resource's department name appears on the homeowner resource card",
    "R3-24: a published resource's homeowner notes appear on the resource card",
    "R3-24: a resource supplied by a verified government account is not described as a rule",
  ],
};

export default async function (ctx) {
  const headers = { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}` };
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const pathOf = async (jurisdictionId) => {
    const j = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/jurisdictions_public?select=state_code,slug&id=eq.${jurisdictionId}`, { headers });
    const row = Array.isArray(j.body) ? j.body[0] : null;
    return row?.slug && row?.state_code ? `/rules/${String(row.state_code).toLowerCase()}/${row.slug}` : null;
  };
  // Government-supplied resources carry a department; those are the ones whose
  // card has something to show and an attribution to word.
  const rows = await ctx.fetchJson(
    `${ctx.supabaseUrl}/rest/v1/government_resources_public?select=id,jurisdiction_id,department_name,notes&department_name=not.is.null&limit=50`,
    { headers }
  );
  const list = Array.isArray(rows.body) ? rows.body : [];
  const out = [];
  const browser = await ctx.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const open = async (path) => {
      await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
      await page.locator("main h1").first().waitFor();
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
    };
    const cardText = async (id) => {
      const card = page.locator(`li[data-record="resource"][data-resource-id="${id}"]`).first();
      return (await card.count()) ? norm(await card.textContent()) : null;
    };

    // 1 and 2: a row that has both.
    const both = list.find((r) => norm(r.department_name) && norm(r.notes));
    const bothPath = both ? await pathOf(both.jurisdiction_id) : null;
    if (!both || !bothPath) {
      const why = `no published resource with both a department and notes sits on a public page (HTTP ${rows.status})`;
      out.push({ name: "department-shown", rule: meta.rules[0], status: "skip", detail: why });
      out.push({ name: "notes-shown", rule: meta.rules[1], status: "skip", detail: why });
    } else {
      await open(bothPath);
      const text = await cardText(both.id);
      const dept = Boolean(text) && text.includes(norm(both.department_name));
      const notes = Boolean(text) && text.includes(norm(both.notes));
      out.push({ name: "department-shown", rule: meta.rules[0], status: dept ? "pass" : "fail", detail: `${bothPath}: card found: ${text !== null}; department "${both.department_name}" shown: ${dept}` });
      out.push({ name: "notes-shown", rule: meta.rules[1], status: notes ? "pass" : "fail", detail: `${bothPath}: card found: ${text !== null}; notes shown: ${notes}` });
    }

    // 3: the first card that carries the verified-account attribution.
    let judged = null;
    const seen = new Set();
    for (const r of list) {
      if (seen.has(r.jurisdiction_id)) continue;
      seen.add(r.jurisdiction_id);
      if (seen.size > 12) break;
      const path = await pathOf(r.jurisdiction_id);
      if (!path) continue;
      await open(path);
      const found = await page.evaluate(() => {
        for (const li of document.querySelectorAll('li[data-record="resource"]')) {
          const p = li.querySelector('[data-attribution="participation"]');
          if (p) return { id: li.dataset.resourceId, text: p.textContent };
        }
        return null;
      });
      if (found) {
        judged = { path, ...found };
        break;
      }
    }
    if (!judged) {
      out.push({ name: "attribution-fits-a-resource", rule: meta.rules[2], status: "skip", detail: "no resource card on a public page carries the verified-account attribution" });
    } else {
      const rule = /review of the rule/.test(judged.text);
      out.push({
        name: "attribution-fits-a-resource",
        rule: meta.rules[2],
        status: rule ? "fail" : "pass",
        detail: `${judged.path} resource ${judged.id}: "${norm(judged.text).slice(0, 160)}"`,
      });
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return out;
}
