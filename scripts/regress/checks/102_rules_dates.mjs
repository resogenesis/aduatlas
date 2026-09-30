// 102 — DEF-05. Every date on a rule card and a resource card is read from its own
// column. "ADUAtlas record updated" is record_published_at, never "Not recorded"
// while that column is set; "took legal effect" is effective_date; the source date
// is source_checked_date.
//
// On RC1 every rule card said "ADUAtlas record updated: Not recorded" although the
// view returned record_published_at (the page read five other names), on 100% of
// published rules (evidence: d5, refute-d5).
//
// Fixture (100): the Rich Falls rules and resources, compared with the public view
// as an anonymous visitor reads it.
import { cardFor, fmtDay, openPage, resourceCardFor, rulesFixture } from "./100_rules_fixture.mjs";

export const meta = {
  name: "102 rules: each date from its own column",
  rules: [
    "DEF-05: ADUAtlas record updated shows record_published_at, never Not recorded while it is set",
    "DEF-05: took legal effect shows effective_date, Not recorded when it is empty",
    "DEF-05: the source date shows source_checked_date",
    "DEF-05: a resource card's source date is its own source_checked_date",
  ],
};

const dateCell = (card, pattern) => card?.dates.find((d) => pattern.test(d.label))?.value ?? null;

export default async function (ctx) {
  const f = await rulesFixture(ctx);
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    const snap = await openPage(browser, ctx, f.rich.url);
    const jName = f.rich.official_name;
    for (const [key, p] of Object.entries(f.provisions)) {
      if (!p || key === "PR" || key === "PW") continue;
      const row = f.publicRow.get(p.id);
      if (!row) {
        add(`${key} is public`, meta.rules[0], false, `rule ${p.id} is not in regulatory_provisions_public`);
        continue;
      }
      const card = cardFor(snap, row, jName);
      if (!card) {
        add(`${key} card found`, meta.rules[0], false, `no card for ${row.topic_key} on ${f.rich.url}`);
        continue;
      }
      const updated = dateCell(card, /record updated/i);
      const want = fmtDay(row.record_published_at);
      add(
        `${key} (${row.topic_key}) record updated`,
        meta.rules[0],
        Boolean(want) && updated === want,
        `card says "${updated}", record_published_at ${row.record_published_at} -> "${want}"`,
      );
      const effective = dateCell(card, /legal effect/i);
      const wantEffective = fmtDay(row.effective_date) || "Not recorded";
      add(`${key} (${row.topic_key}) took legal effect`, meta.rules[1], effective === wantEffective, `card says "${effective}", effective_date ${row.effective_date} -> "${wantEffective}"`);
      const source = dateCell(card, /checked the source|source read|source date/i);
      const wantSource = fmtDay(row.source_checked_date);
      add(`${key} (${row.topic_key}) source date`, meta.rules[2], source === wantSource, `card says "${source}", source_checked_date ${row.source_checked_date} -> "${wantSource}"`);
    }
    for (const [key, r] of Object.entries(f.resources)) {
      if (!r) continue;
      const row = f.publicResource.get(r.id);
      const card = row ? resourceCardFor(snap, row) : null;
      const want = fmtDay(row?.source_checked_date);
      add(
        `${key} resource source date`,
        meta.rules[3],
        Boolean(card) && Boolean(want) && card.text.includes(want),
        card ? `card: "${card.text.slice(0, 220)}"; want "${want}"` : `no card for resource ${r.id}`,
      );
    }
  } finally {
    await browser.close();
  }
  return out;
}
