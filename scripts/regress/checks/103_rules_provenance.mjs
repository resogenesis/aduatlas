// 103 — DEF-02, DEF-14, DEF-11. Who supplied a rule, where it was read, and the
// government entity's own state are separate statements, each true.
//
// On RC1 "Provided by <entity>" never rendered (the page read columns the view does
// not have), "Compiled by ADUAtlas" never rendered either, "Source: Official
// government website" never rendered although the view said so, and the entity card
// read nonexistent fields: a claimed or withdrawn government was described as one
// that "has not claimed a profile here and does not take part in ADUAtlas", its
// website link never showed, and "Claim this government profile" was offered for a
// verified entity (evidence: d2, refute-d2).
//
// Fixture (100): Rich Falls (a verified entity supplies one rule and one resource)
// and Withdrawn Falls (the supplying entity's verification is withdrawn).
import { cardFor, openPage, resourceCardFor, rulesFixture, targetSection } from "./100_rules_fixture.mjs";

export const meta = {
  name: "103 rules: provided by, compiled by, official source, entity state",
  rules: [
    "DEF-02/2m: a rule or resource a verified government account supplied reads Provided by <entity>",
    "DEF-02/2t: Compiled by ADUAtlas appears on ADUAtlas research and only there",
    "DEF-02/2t: a withdrawn government's rule says it came through an account not currently verified, never ADUAtlas research",
    "DEF-14: Source: Official government website comes from the view's source_is_official_government",
    "DEF-11: a claimed or withdrawn entity is never described as never having claimed, and its website link renders",
    "DEF-11: Claim this government profile is not offered for a claimed or verified entity",
  ],
};

const COMPILED = /Compiled by ADUAtlas/i;
const PROVIDED = /Provided by /i;

export default async function (ctx) {
  const f = await rulesFixture(ctx);
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const skip = (name, rule, detail) => out.push({ name, rule, status: "skip", detail });
  const clip = (card) => (card ? `"${card.text.slice(0, 260)}"` : "no card");
  const browser = await ctx.launch();
  try {
    // ── Rich Falls ──────────────────────────────────────────────────────────
    const rich = await openPage(browser, ctx, f.rich.url);
    const jName = f.rich.official_name;
    const row = (p) => (p ? f.publicRow.get(p.id) : null);
    const P1 = cardFor(rich, row(f.provisions.P1), jName);
    const P5 = f.provisions.P5 ? cardFor(rich, row(f.provisions.P5), jName) : null;

    if (f.provisions.P5) {
      add(
        "government-supplied rule reads Provided by <entity>",
        meta.rules[0],
        Boolean(P5) && P5.text.includes(`Provided by ${f.entityA.name}`) && !COMPILED.test(P5.text),
        `want "Provided by ${f.entityA.name}" and no "Compiled by ADUAtlas"; card ${clip(P5)}`,
      );
    } else skip("government-supplied rule reads Provided by <entity>", meta.rules[0], f.govSupplyError);
    add(
      "ADUAtlas-researched rule reads Compiled by ADUAtlas, not Provided by",
      meta.rules[1],
      Boolean(P1) && /Compiled by ADUAtlas from the source above/i.test(P1.text) && !PROVIDED.test(P1.text),
      `card ${clip(P1)}`,
    );
    const official = [P1, P5].filter(Boolean);
    add(
      "rules read Source: Official government website",
      meta.rules[3],
      official.length > 0 && official.every((c) => /Source: Official government website/i.test(c.text)) && row(f.provisions.P1)?.source_is_official_government === true,
      `view source_is_official_government=${row(f.provisions.P1)?.source_is_official_government}; ${official.map(clip).join(" | ")}`,
    );

    const R2row = f.resources.R2 ? f.publicResource.get(f.resources.R2.id) : null;
    const R1row = f.publicResource.get(f.resources.R1.id);
    const R2 = R2row ? resourceCardFor(rich, R2row) : null;
    const R1 = resourceCardFor(rich, R1row);
    if (R2row) {
      add(
        "government-supplied resource reads Provided by <entity>",
        meta.rules[0],
        Boolean(R2) && R2.text.includes(`Provided by ${f.entityA.name}`),
        `card ${clip(R2)}`,
      );
    } else skip("government-supplied resource reads Provided by <entity>", meta.rules[0], f.govSupplyError);
    add("ADUAtlas-researched resource has no Provided by", meta.rules[1], Boolean(R1) && !PROVIDED.test(R1.text), `card ${clip(R1)}`);

    // The verified entity: badge on its card, and no invitation to claim it.
    const claimLinks = (snap) => snap.links.filter((l) => /Claim this government profile/i.test(l.text));
    add(
      "verified entity is not invited to claim its profile",
      meta.rules[5],
      /Verified Government Account/.test(rich.text) && claimLinks(rich).length === 0,
      `badge ${/Verified Government Account/.test(rich.text) ? "shown" : "MISSING"}; claim links ${claimLinks(rich).length}`,
    );

    // ── Withdrawn Falls ─────────────────────────────────────────────────────
    const wd = await openPage(browser, ctx, f.wd.url);
    const wName = f.wd.official_name;
    const PW = f.provisions.PW ? cardFor(wd, row(f.provisions.PW), wName) : null;
    const PR = cardFor(wd, row(f.provisions.PR), wName);
    if (f.provisions.PW) {
      add(
        "withdrawn government's rule is not ADUAtlas research",
        meta.rules[2],
        Boolean(PW) && /not currently verified by ADUAtlas/i.test(PW.text) && !COMPILED.test(PW.text) && !PROVIDED.test(PW.text),
        `view provided_by_entity_name=${row(f.provisions.PW)?.provided_by_entity_name ?? null} supplied_by=${row(f.provisions.PW)?.supplied_by ?? "(not in view)"}; card ${clip(PW)}`,
      );
    } else skip("withdrawn government's rule is not ADUAtlas research", meta.rules[2], f.govSupplyError);
    add("research control beside it reads Compiled by ADUAtlas", meta.rules[1], Boolean(PR) && COMPILED.test(PR.text), `card ${clip(PR)}`);

    // The entity card sits in the jurisdiction's own block.
    const neverClaimed = /has not claimed a profile here|does not take part in ADUAtlas/i;
    const own = targetSection(wd, wName);
    // The entity's own website link (its official_website_url exactly), not a
    // rule's source link on the same domain.
    const website = wd.links.find((l) => String(l.href).replace(/\/$/, "") === f.entityW.website.replace(/\/$/, ""));
    add(
      "withdrawn (claimed) entity is not described as never having claimed, and its website link renders",
      meta.rules[4],
      Boolean(own) && own.text.includes(f.entityW.name) && !neverClaimed.test(own.text) && Boolean(website),
      `entity card ${own?.text.includes(f.entityW.name) ? "found" : "MISSING"}; "has not claimed" copy ${neverClaimed.test(own?.text || "") ? "PRESENT" : "absent"}; website link to ${f.entityW.website} ${website ? "present" : "MISSING"}`,
    );
    add("claimed entity is not invited to claim its profile", meta.rules[5], claimLinks(wd).length === 0, `claim links ${claimLinks(wd).length}`);
  } finally {
    await browser.close();
  }
  return out;
}
