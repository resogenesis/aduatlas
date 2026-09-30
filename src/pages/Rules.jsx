import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiSearch } from "react-icons/fi";
import { fetchJurisdictionsWithRecords } from "../lib/regulatory";
import { ConceptsApartNotice, ThreeStateLegend } from "./RulesJurisdiction";
import PageHeader from "../components/common/PageHeader";
import { STATES } from "../lib/usStates";

// THE INDEX of ADU Rules and Resources: all fifty states, plus the District of
// Columbia, with honest coverage (Phase 1 spec, decision 2l).
//
// NATIONWIDE IN ARCHITECTURE, PROGRESSIVE IN DATA. Every state is listed from
// day one because the structure supports every state from day one. Listing a
// state is not a claim that ADUAtlas has researched it: a state we hold nothing
// for says so on its card, in those words, and does not link anywhere, because
// 2l forbids generating thin pages that carry essentially no verified
// information.
//
// COVERAGE IS COUNTED, NEVER ESTIMATED. "We hold records here" is said of a
// state only when jurisdiction_coverage_public shows at least one published rule
// or resource in it, at the state level or below. The structural state rows
// that migration 0012 publishes for all fifty states and DC are NOT records, and
// reading their existence as coverage is how this index once claimed all 51
// (DEF-16). There is no "coverage: 94%" anywhere, no progress bar standing in
// for research nobody has done, and no total that includes a state we have not
// opened. If coverage cannot be read, the cards say nothing about it.
//
// NEVER IMPLY COMPLETENESS. The copy says outright that this is what we have
// verified so far, that it is filled in where our homeowners are, and that a
// missing jurisdiction means unresearched rather than unregulated.
//
// The state and jurisdiction pages are RulesState.jsx and
// RulesJurisdiction.jsx; the shared legend and the boundary notice come from
// RulesJurisdiction.jsx so the three surfaces use one set of words.

const STATE_LEVELS = ["state", "federal_district", "territory"];

const Rules = () => {
  // Coverage rows for every jurisdiction that holds a published record, or null
  // while loading. `failed` means the read did not succeed, which is not the
  // same as "nothing held" and is never shown as it.
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    fetchJurisdictionsWithRecords()
      .then((result) => {
        if (!live) return;
        if (!result?.ok) {
          setRows([]);
          setFailed(true);
          return;
        }
        setRows(result.coverage || []);
      })
      .catch(() => {
        if (live) {
          setRows([]);
          setFailed(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  // One card per state, always. The database decides what a card SAYS; it never
  // decides whether a state exists.
  const cards = useMemo(() => {
    const byCode = new Map();
    for (const row of rows || []) {
      const code = String(row?.state_code || "").toUpperCase();
      if (!code) continue;
      if (!byCode.has(code)) byCode.set(code, { stateLevel: false, local: 0 });
      const entry = byCode.get(code);
      if (STATE_LEVELS.includes(row.jurisdiction_type)) entry.stateLevel = true;
      else entry.local += 1;
    }
    return STATES.map((state) => {
      const held = byCode.get(state.code) || null;
      return {
        ...state,
        stateLevel: Boolean(held?.stateLevel),
        local: held?.local || 0,
        held: Boolean(held),
      };
    });
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((card) => card.name.toLowerCase().includes(needle) || card.code.toLowerCase() === needle);
  }, [cards, query]);

  const heldCount = cards.filter((card) => card.held).length;
  const loading = rows === null;

  return (
    <div>
      <PageHeader
        title="ADU rules and resources"
        subtitle="What state, county and city governments actually publish about accessory dwelling units, with a link to the source for every rule. All fifty states are here from day one. The detail is filled in jurisdiction by jurisdiction, and this page shows you exactly where we hold records and where we do not."
      />

      <section className="container mx-auto px-5 sm:px-8 max-w-6xl py-10 sm:py-14 grid gap-6">
        <div className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-paper text-xl sm:text-2xl mb-3">What this is, and what it is not</h2>
          <p className="text-paper-dim text-sm leading-relaxed mb-3">
            Every rule here is recorded from an authoritative source: a city, county or state government, an official planning or zoning department, or official municipal or state code. We do not populate requirements from blogs, lead generation sites, builder marketing or summaries written by a machine, and we do not fill a gap with a guess so a page looks finished.
          </p>
          <p className="text-paper-dim text-sm leading-relaxed">
            {loading
              ? "Loading our current coverage."
              : failed
                ? "We could not load our coverage just now. Please try again in a moment."
                : heldCount === 0
                  ? "We are researching our first jurisdictions now, so this index is structure without much data behind it yet. That is the honest state of it."
                  : `We hold records in ${heldCount} of the fifty states and the District of Columbia. The rest are listed below because the system supports them, not because we have researched them.`}
          </p>
        </div>

        <ThreeStateLegend />

        <div>
          <label className="block mb-5">
            <span className="sr-only">Search states</span>
            <span className="relative block max-w-md">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-paper-dim" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by state"
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-1-solid border border-stroke text-paper placeholder:text-paper-dim text-sm focus:outline-none focus:border-accent"
              />
            </span>
          </label>

          {visible.length === 0 ? (
            <p className="text-paper-dim text-sm">No state matches that. Try the two letter code, or the full name.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((card) => {
                // What the card says is counted from published rows: whether
                // the state itself has records, and how many jurisdictions in it
                // do. Nothing is estimated and no bar is drawn.
                const detail = [
                  "We hold records here",
                  card.stateLevel ? "state rules or links" : null,
                  card.local ? `${card.local} local ${card.local === 1 ? "jurisdiction" : "jurisdictions"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                // A state with nothing behind it does not link: 2l says ADUAtlas
                // does not generate pages that carry no verified information.
                // While coverage is loading, or when it could not be read, the
                // card links and claims nothing either way.
                return (
                  <li key={card.code} data-state-card={card.code} data-held={failed || loading ? "unknown" : card.held ? "yes" : "no"}>
                    {failed || loading ? (
                      <Link
                        to={`/rules/${card.code.toLowerCase()}`}
                        className="flex flex-col h-full bg-canvas border border-stroke rounded-2xl p-5 hover:border-accent transition-colors lift"
                      >
                        <span className="text-paper font-semibold">{card.name}</span>
                        <span className="text-accent text-xs font-medium mt-3 inline-flex items-center gap-1">
                          Open {card.code} <FiArrowRight aria-hidden />
                        </span>
                      </Link>
                    ) : card.held ? (
                      <Link
                        to={`/rules/${card.code.toLowerCase()}`}
                        className="flex flex-col h-full bg-canvas border border-stroke rounded-2xl p-5 hover:border-accent transition-colors lift"
                      >
                        <span className="text-paper font-semibold">{card.name}</span>
                        <span className="text-paper-dim text-xs mt-1">{detail}</span>
                        <span className="text-accent text-xs font-medium mt-3 inline-flex items-center gap-1">
                          Open {card.code} <FiArrowRight aria-hidden />
                        </span>
                      </Link>
                    ) : (
                      <div className="flex flex-col h-full bg-canvas border border-dashed border-stroke rounded-2xl p-5">
                        <span className="text-paper font-semibold">{card.name}</span>
                        <span className="text-paper-dim text-xs mt-1">Not yet researched</span>
                        <span className="text-paper-dim text-xs mt-3">Check with your local planning or zoning department.</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <ConceptsApartNotice />

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-paper text-xl mb-3">Work for a city, county or state?</h2>
          <p className="text-paper-dim text-sm leading-relaxed mb-4">
            Government accounts on ADUAtlas are free. ADUAtlas seeds a page from public information; an agency can later claim its profile and keep the record accurate. A claim is not verification, and verification is an identity check, not a review of whether the information is legally correct. What you submit is reviewed by ADUAtlas before it is published, and previous versions are kept.
          </p>
          {/* tap-target: 44px on a touch screen (R3-30, T4-22). items-center keeps
              the two links' text aligned when they share a line. */}
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/gov/claim" className="tap-target text-accent font-medium text-sm">
              Claim a government profile
            </Link>
            <a href="mailto:hello@aduatlas.com?subject=Government%20account" className="tap-target text-paper-dim hover:text-paper font-medium text-sm">
              Questions? Write to us
            </a>
          </div>
        </div>

        <div className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-paper text-xl mb-3">Rules are the start, not the plan</h2>
          <p className="text-paper-dim text-sm leading-relaxed mb-5">
            This index complements the ADUAtlas course; it does not replace it. Knowing what your jurisdiction publishes is the first of nine things you need before you talk to a builder.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/course-outline" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
              See the course <FiArrowRight aria-hidden />
            </Link>
            <Link to="/unlock" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
              See plans and pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Rules;
