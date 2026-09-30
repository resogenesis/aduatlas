// 104 — DEF-04. Who checked a rule is shown beside what we know about it. Only a
// row ADUAtlas checked earns the "Verified from source" check mark; an unchecked
// row says so (including a "source did not state" row), a disputed row says
// another official source disagrees, and the legend stays true of every card.
//
// On RC1 every verified_from_source rule showed the same green "Verified from
// source" chip whether it was source_checked, unverified or disputed, the legend
// said ADUAtlas read and checked every one, and a disputed resource showed nothing
// (evidence: d4, refute-d4).
//
// Assertions read the CHIPS (the rounded labels in the card header), not the free
// text of the card, so a value that happens to contain a word cannot pass or fail
// it (refute-d4 critique 5). Fixture values avoid those words anyway.
import { cardFor, openPage, resourceCardFor, rulesFixture } from "./100_rules_fixture.mjs";

export const meta = {
  name: "104 rules: checked, unchecked and disputed are told apart",
  rules: [
    "DEF-04: a rule ADUAtlas checked keeps the Verified from source chip and the ADUAtlas-checked date label",
    "DEF-04: an unchecked rule shows From source, not yet checked by ADUAtlas, never the check mark, and its date label does not claim ADUAtlas checked it",
    "DEF-04: a disputed rule shows a Disputed chip and says another official source disagrees",
    "DEF-04: a source-did-not-state rule that ADUAtlas has not checked says so",
    "DEF-04: resources show the same disputed and unchecked chips",
    "DEF-04: the legend names the disputed and unchecked chips and no longer says ADUAtlas checked every silent source",
  ],
};

const VERIFIED = /^Verified from source$/i;
const UNCHECKED = /not yet checked by ADUAtlas/i;
const DISPUTED = /^Disputed$/i;
const ADUATLAS_CHECKED_LABEL = /ADUAtlas.*checked/i;

export default async function (ctx) {
  const f = await rulesFixture(ctx);
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    const snap = await openPage(browser, ctx, f.rich.url);
    const jName = f.rich.official_name;
    const card = (key) => cardFor(snap, f.publicRow.get(f.provisions[key].id), jName);
    const sourceLabel = (c) => c?.dates.find((d) => /source/i.test(d.label))?.label || null;
    const show = (c) => (c ? `chips ${JSON.stringify(c.chips)}; source date label "${sourceLabel(c)}"` : "no card");

    const P1 = card("P1");
    add(
      "source_checked rule keeps the check mark",
      meta.rules[0],
      Boolean(P1) && P1.chips.some((t) => VERIFIED.test(t)) && !P1.chips.some((t) => UNCHECKED.test(t) || DISPUTED.test(t)) && ADUATLAS_CHECKED_LABEL.test(sourceLabel(P1) || ""),
      show(P1),
    );

    const P2 = card("P2");
    add(
      "unverified rule is not shown as checked",
      meta.rules[1],
      Boolean(P2) && P2.chips.some((t) => UNCHECKED.test(t)) && !P2.chips.some((t) => VERIFIED.test(t)) && !ADUATLAS_CHECKED_LABEL.test(sourceLabel(P2) || ""),
      show(P2),
    );

    const P3 = card("P3");
    add(
      "disputed rule shows the disagreement",
      meta.rules[2],
      Boolean(P3) && P3.chips.some((t) => DISPUTED.test(t)) && !P3.chips.some((t) => VERIFIED.test(t)) && /Another official source disagrees/i.test(P3.text),
      show(P3),
    );

    const P4 = card("P4");
    add(
      "unchecked source-did-not-state rule says it is unchecked",
      meta.rules[3],
      Boolean(P4) && P4.chips.some((t) => /Source did not state/i.test(t)) && P4.chips.some((t) => UNCHECKED.test(t)) && !/The source ADUAtlas checked/i.test(P4.text) && !ADUATLAS_CHECKED_LABEL.test(sourceLabel(P4) || ""),
      `${show(P4)}; text "${P4?.text.slice(0, 200)}"`,
    );

    const R1 = resourceCardFor(snap, f.publicResource.get(f.resources.R1.id));
    const R3 = resourceCardFor(snap, f.publicResource.get(f.resources.R3.id));
    add(
      "disputed resource shows the Disputed chip",
      meta.rules[4],
      Boolean(R1) && R1.chips.some((t) => DISPUTED.test(t)),
      R1 ? `chips ${JSON.stringify(R1.chips)}` : "no card",
    );
    add(
      "unverified resource is not shown as checked by ADUAtlas",
      meta.rules[4],
      Boolean(R3) && R3.chips.some((t) => UNCHECKED.test(t)) && !/ADUAtlas last checked this/i.test(R3.text),
      R3 ? `chips ${JSON.stringify(R3.chips)}; text "${R3.text.slice(0, 200)}"` : "no card",
    );

    const legendChips = snap.legend.flatMap((entry) => entry.chips);
    const legendText = snap.legend.map((entry) => entry.text).join(" ");
    add(
      "legend covers disputed and unchecked, and every sentence stays true",
      meta.rules[5],
      snap.legend.length > 0 && legendChips.some((t) => DISPUTED.test(t)) && legendChips.some((t) => UNCHECKED.test(t)) && !/We checked the source and it does not address this/i.test(legendText),
      `legend chips ${JSON.stringify(legendChips)}; old silent-source sentence ${/We checked the source and it does not address this/i.test(legendText) ? "PRESENT" : "absent"}`,
    );
  } finally {
    await browser.close();
  }
  return out;
}
