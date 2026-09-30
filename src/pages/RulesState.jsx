import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiExternalLink, FiSearch } from "react-icons/fi";
import {
  ENTITY_STATE,
  fetchEntity,
  fetchJurisdictions,
  fetchProvisions,
  fetchResources,
  fetchStateCoverage,
  fetchStates,
  fetchTopicCoverage,
  holdsRecords,
} from "../lib/regulatory";
import {
  ConceptsApartNotice,
  GovernmentEntityCard,
  NotResearchedNotice,
  ProvisionCard,
  ResourceList,
  ScopeNotice,
  ThreeStateLegend,
  UnresearchedTopics,
} from "./RulesJurisdiction";
import { setHead, setRobots } from "../lib/head";
import { placeNameForCode, stateCodeFromParam } from "../lib/usStates";

// ONE state in ADU Rules and Resources (Phase 1 spec, decisions 2l and 2m).
//
// Two jobs, kept apart on the page because they are different answers:
//   1. THE STATE'S OWN REQUIREMENTS. What the state publishes, as sourced rules
//      with their own dates, exactly as a city's rules appear on a jurisdiction
//      page. State law is not a summary of what happens locally.
//   2. THE JURISDICTIONS BENEATH IT. A list, organised by level, with honest
//      coverage. This is geography and navigation. It is NOT authority: the
//      state's record gives it no standing over any city's record, and this page
//      never presents state rules as the answer for a city (2m).
//
// Every state in the union has a page, whether or not anybody has researched it
// yet, because the architecture is nationwide from day one and the data is
// progressive (2l). A state we have not researched says so plainly instead of
// rendering an empty table that reads like "no requirements".
//
// The display components come from RulesJurisdiction.jsx so a rule, a source,
// a date and a government badge read identically on both surfaces. The three
// field states and the four dates are that file's rules; nothing is restyled
// here.
//
// The row readers below are duplicated from RulesJurisdiction.jsx because a page
// file may only export components. The state list and the rule for reading a
// state out of the url live in src/lib/usStates.js, shared with the index and
// the jurisdiction page, so the three pages read "/rules/mo" and
// "/rules/missouri" the same way.
//
// COVERAGE IS COUNTED FROM PUBLISHED ROWS (jurisdiction_coverage_public), never
// read off the existence of a structural record: a jurisdiction with a published
// row and nothing under it says "Not yet researched" (DEF-16). The same view
// decides indexing: a state page asks to be indexed when the state or one of its
// jurisdictions is indexable by 2l's threshold, and asks not to be otherwise
// (DEF-03). That is the rule api/sitemap.js documents for listing a state page.

const pick = (row, keys) => {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

const asRows = (result) => {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") return [];
  for (const key of ["data", "rows", "states", "jurisdictions", "provisions", "resources", "items"]) {
    if (Array.isArray(result[key])) return result[key];
  }
  return [];
};

const asRow = (result) => {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  if (result.ok === false) return null;
  for (const key of ["data", "row", "jurisdiction", "entity", "record"]) {
    const value = result[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return "id" in result || "slug" in result || "name" in result ? result : null;
};

const idOf = (row) => pick(row, ["id", "jurisdiction_id", "uuid"]);
const nameOf = (row) => pick(row, ["official_name", "name", "jurisdiction_name", "display_name", "title"]);
const slugOf = (row) => pick(row, ["slug", "jurisdiction_slug"]);
const levelOf = (row) => String(pick(row, ["type", "jurisdiction_type", "level", "kind"]) || "").toLowerCase();
const codeOf = (row) => {
  const raw = pick(row, ["state_code", "state_abbr", "code", "state"]);
  return typeof raw === "string" ? raw.toUpperCase().slice(0, 2) : "";
};

const LEVEL_LABELS = {
  county: "County",
  parish: "Parish",
  borough: "Borough",
  city: "City",
  town: "Town",
  township: "Township",
  village: "Village",
  municipality: "Municipality",
  local: "Local authority",
  local_authority: "Local authority",
  other: "Local authority",
};

const humanize = (key) =>
  String(key || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

const levelLabel = (row) => {
  const level = levelOf(row);
  return LEVEL_LABELS[level] || (level ? humanize(level) : "Jurisdiction");
};

const safeHref = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }
  if (/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+(\/|\?|$)/i.test(value)) return `https://${value}`;
  return null;
};

// A row whose own status says it is not published is not rendered, whatever the
// database handed over. Defence in depth behind RLS, never instead of it.
const isShowable = (row) => {
  const status = String(pick(row, ["review_status", "publication_status", "status", "state"]) || "").toLowerCase();
  if (!status) return true;
  return !/(draft|submitted|pending|in_review|under_review|rejected|declined|archived|deleted|withdrawn)/.test(status);
};

// What a listing says about one jurisdiction, from its coverage row. Counted from
// published rows only. Where the coverage read failed there is no row, and the
// listing says nothing rather than guessing.
const coverageText = (row) => {
  if (!row) return null;
  if (!holdsRecords(row)) return "Not yet researched";
  const topics = Number(row.topics_verified || 0) + Number(row.topics_source_silent || 0);
  const links = Number(row.resources_published || 0);
  return [
    topics ? `${topics} ${topics === 1 ? "topic" : "topics"} recorded` : null,
    links ? `${links} official ${links === 1 ? "link" : "links"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

const RulesState = () => {
  const { stateCode: param = "" } = useParams();
  // "" when the segment names no state; that page is "not a state we recognise".
  const code = stateCodeFromParam(param);
  const [loaded, setLoaded] = useState(null);
  const [query, setQuery] = useState("");

  const fallbackName = placeNameForCode(code);

  // One state object, stamped with the state it was loaded for, read through a
  // staleness check at render time instead of being reset inside the effect.
  // Resetting state synchronously in an effect cascades renders, and a stamped
  // result can never be rendered under another state's name.
  const EMPTY = { status: "loading", stateRow: null, provisions: [], resources: [], entity: null, jurisdictions: [], topics: [], coverage: null };
  const view = !code ? { key: code, ...EMPTY, status: "unknown-state" } : loaded && loaded.key === code ? loaded : { key: code, ...EMPTY };
  const { status, stateRow, provisions, resources, entity, jurisdictions, topics, coverage } = view;

  useEffect(() => {
    if (!code) return undefined;
    let live = true;

    const run = async () => {
      const [statesResult, jurisdictionRows, coverageResult] = await Promise.all([
        fetchStates(),
        fetchJurisdictions(code).then(asRows).catch(() => []),
        fetchStateCoverage(code).catch(() => null),
      ]);
      if (!live) return;
      // A failed read is an error, not an empty state: an empty state would
      // tell a homeowner we hold nothing for the state.
      if (!statesResult || statesResult.ok === false) {
        setLoaded({ key: code, ...EMPTY, status: "error" });
        return;
      }
      const states = asRows(statesResult);
      const match = states.find((row) => codeOf(row) === code) || null;
      // Coverage per jurisdiction id, or null when it could not be read.
      const coverageRows = coverageResult?.ok ? coverageResult.coverage : null;

      // The state's own record, if the state list did not carry it: a state
      // level row inside its own jurisdiction list is the same thing.
      const resolved = match || jurisdictionRows.find((row) => levelOf(row) === "state") || null;
      const stateId = idOf(resolved);
      let stateProvisions = [];
      let stateResources = [];
      let stateEntity = null;

      let stateTopics = [];

      if (stateId !== undefined) {
        const [provisionRows, resourceRows, entityRow, topicRows] = await Promise.all([
          fetchProvisions(stateId).then(asRows).catch(() => []),
          fetchResources(stateId).then(asRows).catch(() => []),
          fetchEntity(stateId).then(asRow).catch(() => null),
          fetchTopicCoverage(stateId)
            .then((result) => (result?.ok ? result.topics || [] : null))
            .catch(() => null),
        ]);
        if (!live) return;
        // fetchProvisions may answer with more than the level asked about. Only
        // the state's own rows belong in the state block; a city's rule is
        // never shown as the state's.
        const own = (row) => {
          const owner = pick(row, ["jurisdiction_id", "jurisdiction"]);
          return owner === undefined || String(owner) === String(stateId);
        };
        stateProvisions = provisionRows.filter(own).filter(isShowable);
        stateResources = resourceRows.filter(own);
        stateEntity = entityRow;
        stateTopics = topicRows;
      }

      setLoaded({
        key: code,
        status: "ready",
        stateRow: resolved,
        provisions: stateProvisions,
        resources: stateResources,
        entity: stateEntity,
        topics: stateTopics,
        coverage: coverageRows,
        jurisdictions: jurisdictionRows.filter(
          (row) => levelOf(row) !== "state" && String(idOf(row)) !== String(stateId) && pick(row, ["is_published"]) !== false,
        ),
      });
    };

    run().catch(() => {
      if (live) setLoaded({ key: code, ...EMPTY, status: "error" });
    });
    return () => {
      live = false;
    };
    // EMPTY is a literal shape, recreated each render and never read as state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const officialName = nameOf(stateRow) || fallbackName || "This state";
  const name = fallbackName || pick(stateRow, ["name"]) || officialName;

  // Coverage per jurisdiction id, for the listings and for indexing.
  const coverageById = useMemo(() => new Map((coverage || []).map((row) => [String(row.jurisdiction_id), row])), [coverage]);
  const withRecords = jurisdictions.filter((row) => holdsRecords(coverageById.get(String(idOf(row))))).length;

  useEffect(() => {
    // A url segment that names no state describes no page: the head points at
    // the index rather than titling a page "ADU rules in This state".
    if (status === "unknown-state") {
      setHead({
        title: "ADU rules and resources · ADUAtlas",
        description: "What state, county and city governments publish about ADUs, with the official source and its dates beside every rule.",
        path: "/rules",
      });
      return;
    }
    if (status !== "ready") return;
    setHead({
      title: `ADU rules in ${name} · ADUAtlas`,
      description: provisions.length
        ? `State-level ADU requirements ADUAtlas holds for ${name}, with the official source behind each one, and the ${withRecords} ${withRecords === 1 ? "jurisdiction" : "jurisdictions"} in ${name} we hold records for.`
        : `What ADUAtlas holds on ADU rules in ${name}. Where we have not researched a requirement in an official source, the page says so instead of filling the gap.`,
      path: `/rules/${code.toLowerCase()}`,
    });
  }, [status, name, provisions.length, withRecords, code]);

  // Indexing (2l, DEF-03): only when the state or a jurisdiction in it clears
  // the indexable threshold. A segment naming no state, a failed read and an
  // unreadable coverage answer all ask not to be indexed.
  const indexable = status === "ready" && Array.isArray(coverage) && coverage.some((row) => row?.is_indexable === true);
  const noindex = status !== "loading" && !indexable;
  useEffect(() => {
    if (!noindex) return undefined;
    setRobots("noindex");
    return () => setRobots(null);
  }, [noindex]);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? jurisdictions.filter((row) => String(nameOf(row) || "").toLowerCase().includes(needle) || String(pick(row, ["county", "county_name"]) || "").toLowerCase().includes(needle))
      : jurisdictions;
    const buckets = new Map();
    for (const row of filtered) {
      const label = levelLabel(row);
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(row);
    }
    const order = ["County", "Parish", "Borough", "City", "Town", "Township", "Village", "Municipality", "Local authority"];
    return [...buckets.entries()]
      .sort((a, b) => {
        const rankA = order.indexOf(a[0]);
        const rankB = order.indexOf(b[0]);
        return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB);
      })
      .map(([label, rows]) => [label, rows.sort((a, b) => String(nameOf(a) || "").localeCompare(String(nameOf(b) || "")))]);
  }, [jurisdictions, query]);

  const website = safeHref(pick(stateRow, ["website_url", "official_website", "website", "official_url"]));
  const hasStateContent = provisions.length > 0 || resources.length > 0;

  // T4-06: the state page is a state agency's own page (RulesJurisdiction sends a
  // state-level record here), so it carries the same invitation as a city or
  // county page. The in-app link opens /gov/claim with the state's record and its
  // entity preselected; with no entity recorded, the way on is the email asking
  // ADUAtlas to add one, because a claim never creates an entity. A claimed or
  // verified entity is not asked again. A claim is still only a request, and
  // verification is unchanged.
  const stateId = idOf(stateRow);
  const entityState = entity?.entity_state;
  const invitesClaim = stateId !== undefined && (!entity || entityState === ENTITY_STATE.UNCLAIMED);
  const claimInApp = invitesClaim && Boolean(entity) && idOf(entity) !== undefined;
  const claimHref = `/gov/claim?${new URLSearchParams({
    state: code,
    ...(stateId !== undefined ? { jurisdiction: String(stateId) } : {}),
    ...(claimInApp ? { entity: String(idOf(entity)) } : {}),
  }).toString()}`;
  const governmentAccountMail = `mailto:hello@aduatlas.com?subject=${encodeURIComponent(`Government account: ${name}`)}`;

  if (status === "loading") return <div className="container mx-auto px-5 sm:px-8 max-w-4xl py-20 text-paper-dim text-sm">Loading…</div>;

  // A url segment that is not a state at all ("/rules/zz"). Saying so beats
  // rendering "ADU rules in This state" over an empty page.
  if (status === "unknown-state")
    return (
      <div className="container mx-auto px-5 sm:px-8 max-w-3xl py-20">
        <h1 className="font-display text-paper text-3xl mb-3">That is not a state we recognise</h1>
        <p className="text-paper-dim text-sm leading-relaxed mb-6">
          ADUAtlas covers the fifty states and the District of Columbia. Pick yours from the index and we will show you exactly what we hold for it.
        </p>
        <Link to="/rules" className="text-accent font-medium text-sm inline-flex items-center gap-1">
          <FiArrowLeft aria-hidden /> All states
        </Link>
      </div>
    );

  if (status === "error")
    return (
      <div className="container mx-auto px-5 sm:px-8 max-w-3xl py-20">
        <h1 className="font-display text-paper text-3xl mb-3">We could not load this state</h1>
        <p className="text-paper-dim text-sm leading-relaxed mb-6">
          Something went wrong reading our regulatory records. We would rather show you nothing than something we cannot source. Please try again.
        </p>
        <Link to="/rules" className="text-accent font-medium text-sm inline-flex items-center gap-1">
          <FiArrowLeft aria-hidden /> All states
        </Link>
      </div>
    );

  return (
    <div>
      <section className="bg-surface-1-solid border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl py-12 sm:py-16">
          <nav aria-label="Where this is" className="flex items-center gap-2 text-xs text-paper-dim mb-4">
            <Link to="/rules" className="hover:text-paper">ADU rules</Link>
            <span aria-hidden>/</span>
            <span className="text-paper">{name}</span>
          </nav>
          <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05]">ADU rules in {name}</h1>
          <p className="text-paper-dim text-base leading-relaxed mt-4 max-w-2xl">
            {hasStateContent
              ? `What ${name} publishes at the state level, and the jurisdictions in ${name} ADUAtlas holds records for. State requirements and local ordinances are recorded separately, because they are separate rules from separate governments.`
              : `ADUAtlas supports every state from day one and researches them progressively. Here is exactly what we hold for ${name} so far.`}
          </p>
          {website && (
            <p className="mt-4">
              <a href={website} target="_blank" rel="noopener noreferrer" className="text-accent font-medium text-sm inline-flex items-center gap-1 break-all">
                Official {name} website <FiExternalLink aria-hidden />
              </a>
            </p>
          )}
        </div>
      </section>

      <section className="container mx-auto px-5 sm:px-8 max-w-5xl py-10 sm:py-14 grid gap-6">
        {hasStateContent && <ScopeNotice where={name} />}
        {hasStateContent && <ThreeStateLegend />}

        {/* 1. The state's own requirements. Presented as the STATE's rules, not
            as the rules for anywhere in it. */}
        <section aria-label={`State requirements: ${officialName}`} className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
            <h2 className="font-display text-paper text-2xl">{officialName}</h2>
            <span className="text-paper-dim text-xs uppercase tracking-wide">State level</span>
          </div>
          <p className="text-paper-dim text-sm leading-relaxed mb-5">
            State requirements only. Counties and local jurisdictions adopt their own ordinances, and ADUAtlas never merges the two into a single answer.
          </p>
          {hasStateContent ? (
            <>
              {provisions.length > 0 ? (
                <ul className="grid gap-4">
                  {provisions.map((provision, index) => (
                    <ProvisionCard
                      key={pick(provision, ["id"]) || `state-${index}`}
                      provision={provision}
                      jurisdictionName={officialName}
                      levelText="State"
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-paper-dim text-sm leading-relaxed">No state-level rules are recorded yet. The official links below are what we hold for {name}.</p>
              )}
              <UnresearchedTopics topics={topics} name={officialName} />
              <ResourceList resources={resources} jurisdictionName={officialName} />
            </>
          ) : (
            <NotResearchedNotice name={name} scope="state" note={stateRow?.research_note} />
          )}
          <GovernmentEntityCard entity={entity} jurisdictionName={officialName} />
          {invitesClaim && (
            <div className="mt-6">
              <p className="text-paper-dim text-sm leading-relaxed">
                If you work for a state agency in {name} and want to keep this record accurate, ADUAtlas offers free government accounts. A claim is not verification: we confirm that you are authorised to represent the entity before anything is attributed to it, and ADUAtlas reviews and publishes what you submit.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3">
                {claimInApp ? (
                  <>
                    <Link to={claimHref} className="tap-target text-accent font-medium text-sm">
                      Claim this government profile
                    </Link>
                    <a href={governmentAccountMail} className="tap-target text-paper-dim hover:text-paper font-medium text-sm">
                      Questions about a government account? Write to us
                    </a>
                  </>
                ) : (
                  <a href={governmentAccountMail} className="tap-target text-accent font-medium text-sm">
                    Ask ADUAtlas to add this government profile
                  </a>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 2. The jurisdictions beneath. Navigation and geography. The note says
            outright that this list is not authority and not coverage of the
            whole state. */}
        <section aria-label={`Jurisdictions in ${name}`} className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-paper text-2xl mb-2">Jurisdictions in {name}</h2>
          <p className="text-paper-dim text-sm leading-relaxed mb-5">
            {jurisdictions.length > 0
              ? `${jurisdictions.length} ${jurisdictions.length === 1 ? `jurisdiction in ${name} has a page` : `jurisdictions in ${name} have pages`} on ADUAtlas. Each one says what we have researched there, and this is not a list of every city and county in ${name}. A place on this list is geography and nothing more: no government on it has any standing over another's rules.`
              : `We have not created pages for any county or city in ${name} yet.`}
          </p>

          {jurisdictions.length > 8 && (
            <label className="block mb-5">
              <span className="sr-only">Search jurisdictions in {name}</span>
              <span className="relative block">
                <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-paper-dim" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${name} cities and counties`}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-1-solid border border-stroke text-paper placeholder:text-paper-dim text-sm focus:outline-none focus:border-accent"
                />
              </span>
            </label>
          )}

          {grouped.length === 0 ? (
            <p className="text-paper-dim text-sm leading-relaxed">
              {jurisdictions.length === 0
                ? `Check with your local planning or zoning department for current requirements while we research ${name}.`
                : `Nothing in ${name} matches "${query}". We may simply not have researched it yet.`}
            </p>
          ) : (
            <div className="grid gap-6">
              {grouped.map(([label, rows]) => (
                <div key={label}>
                  <h3 className="text-paper-dim text-[0.7rem] uppercase tracking-wide mb-3">{label === "County" ? "Counties" : `${label} level`}</h3>
                  <ul className="grid sm:grid-cols-2 gap-3">
                    {rows.map((row) => {
                      const slug = slugOf(row);
                      const rowName = nameOf(row) || "Jurisdiction";
                      const county = pick(row, ["county_name"]);
                      const coverageLine = coverageText(coverageById.get(String(idOf(row))));
                      const inner = (
                        <>
                          <p className="text-paper font-semibold text-sm">{rowName}</p>
                          <p className="text-paper-dim text-xs mt-0.5">
                            {[levelLabel(row), county ? `${county} County` : null, coverageLine].filter(Boolean).join(" · ")}
                          </p>
                        </>
                      );
                      return (
                        <li key={String(idOf(row) || slug || rowName)}>
                          {slug ? (
                            <Link
                              to={`/rules/${code.toLowerCase()}/${slug}`}
                              className="block bg-surface-1-solid border border-stroke rounded-2xl p-4 hover:border-accent transition-colors"
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div className="block bg-surface-1-solid border border-stroke rounded-2xl p-4">{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <p className="text-paper-dim text-xs leading-relaxed mt-6">
            Not seeing your city? We add jurisdictions as we research them, in the places our homeowners are. Until yours is here, your planning or zoning department is the authority to ask.
          </p>
        </section>

        <ConceptsApartNotice />

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-paper text-xl mb-3">Rules are the start, not the plan</h2>
          <p className="text-paper-dim text-sm leading-relaxed mb-5">
            Knowing what {name} allows does not tell you what fits on your lot, what it costs or who should build it. The ADUAtlas course walks the whole process, and a feasibility study looks at your property specifically.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/course-outline" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
              See the course <FiArrowRight aria-hidden />
            </Link>
            <Link to="/feasibility-study" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
              How a feasibility study works
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default RulesState;
