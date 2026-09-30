// 199 — takes this run's rules fixture (100) back off the public site by
// unpublishing its jurisdictions, which removes every rule and resource under them
// from the public views. The rows, the government entities and the version history
// stay, as the product keeps them. Runs only when this run built the fixture.
import { rulesFixture } from "./100_rules_fixture.mjs";

export const meta = { name: "199 rules fixture cleanup", rules: ["fixtures made by a run do not stay on the public site"] };

export default async function (ctx) {
  let f;
  try {
    f = await rulesFixture(ctx);
  } catch (e) {
    return [{ name: "rules fixture unpublished", rule: meta.rules[0], status: "skip", detail: `no fixture this run: ${String(e?.message || e).slice(0, 200)}` }];
  }
  const failures = [];
  for (const j of f.published) {
    const r = await f.api("POST", "jurisdiction-save", {
      jurisdiction: { id: j.id, type: "city", name: j.name, official_name: j.official_name, parent_id: j.parent, is_published: false },
    });
    if (r.status !== 200) failures.push(`${j.name}: HTTP ${r.status}`);
  }
  return [
    {
      name: "rules fixture unpublished",
      rule: meta.rules[0],
      status: failures.length ? "fail" : "pass",
      detail: failures.length ? failures.join("; ") : `${f.published.length} fixture jurisdictions unpublished (${f.prefix})`,
    },
  ];
}
