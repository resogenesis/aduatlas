import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight, FiMapPin } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { AdminEditableSection } from "../../lib/adminEditBridge";
import { STATES } from "../../lib/usStates";
import { fetchLookupPlaces } from "../../lib/regulatory";

// Free rules lookup, directly under the hero. The hero keeps its one package
// button (locked decision); this is the free door into ADU Rules and Resources.
// A city or county is only offered when it has a published page that holds
// records (fetchLookupPlaces), so the lookup never lands a homeowner on an empty
// page. Anything typed that does not match one goes to the state's page, which
// lists every place we cover there.
const EDIT_KEYS = ["home.rules.heading", "home.rules.body", "home.rules.button", "home.rules.note"];
const MAX_SUGGESTIONS = 6;

const TYPE_LABELS = { county: "County", parish: "Parish", borough: "Borough", city: "City", town: "Town", township: "Township", village: "Village", municipality: "Municipality" };

const RulesLookup = () => {
  const ref = useReveal();
  const navigate = useNavigate();
  const heading = useContentText("home.rules.heading");
  const body = useContentText("home.rules.body");
  const button = useContentText("home.rules.button");
  const note = useContentText("home.rules.note");

  const [state, setState] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState({ state: "", places: [] });
  const blurTimer = useRef(null);

  useEffect(() => {
    if (!state) return undefined;
    let live = true;
    fetchLookupPlaces(state)
      .then((result) => live && setLoaded({ state, places: result.ok ? result.places : [] }))
      .catch(() => live && setLoaded({ state, places: [] }));
    return () => {
      live = false;
    };
  }, [state]);

  const places = useMemo(() => (loaded.state === state ? loaded.places : []), [loaded, state]);
  const loading = Boolean(state) && loaded.state !== state;
  const stateName = STATES.find((s) => s.code === state)?.name || "";

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return places.filter((p) => String(p.name).toLowerCase().includes(needle)).slice(0, MAX_SUGGESTIONS);
  }, [places, query]);

  const go = (place) => {
    if (!state) return navigate("/rules");
    if (place) return navigate(`/rules/${state.toLowerCase()}/${place.slug}`);
    const needle = query.trim().toLowerCase();
    const exact = needle ? places.find((p) => String(p.name).toLowerCase() === needle) : null;
    const only = needle && suggestions.length === 1 ? suggestions[0] : null;
    const match = exact || only;
    return navigate(match ? `/rules/${state.toLowerCase()}/${match.slug}` : `/rules/${state.toLowerCase()}`);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    go(null);
  };

  const placeholder = !state
    ? "Choose a state first"
    : loading
      ? "Loading…"
      : places.length
        ? "City or county (optional)"
        : `No city pages in ${stateName} yet`;

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Free rules lookup">
      <section className="bg-canvas border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-4xl py-12 sm:py-14">
          <div ref={ref} className="text-center mb-7">
            <h2 className="font-display text-paper text-2xl sm:text-3xl leading-tight mb-2">{heading}</h2>
            <p className="text-paper-dim text-sm sm:text-base max-w-2xl mx-auto">{body}</p>
          </div>

          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]" role="search" aria-label="Look up ADU rules">
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setQuery("");
              }}
              aria-label="State"
              className="w-full bg-surface-1-solid border border-stroke rounded-xl px-4 py-3 text-paper text-sm focus:outline-none focus:border-accent"
            >
              <option value="">State</option>
              {STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="relative">
              <FiMapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-paper-dim pointer-events-none" aria-hidden />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                  blurTimer.current = setTimeout(() => setOpen(false), 150);
                }}
                disabled={!state || (!loading && !places.length)}
                placeholder={placeholder}
                aria-label="City or county"
                aria-autocomplete="list"
                aria-expanded={open && suggestions.length > 0}
                autoComplete="off"
                className="w-full bg-surface-1-solid border border-stroke rounded-xl pl-10 pr-4 py-3 text-paper text-sm placeholder:text-paper-dim focus:outline-none focus:border-accent disabled:opacity-60"
              />
              {open && suggestions.length > 0 && (
                <ul role="listbox" className="absolute z-20 left-0 right-0 mt-1.5 bg-canvas border border-stroke rounded-xl shadow-lg overflow-hidden">
                  {suggestions.map((p) => (
                    <li key={p.id} role="option" aria-selected="false">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          clearTimeout(blurTimer.current);
                          go(p);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-surface-1-solid flex items-baseline justify-between gap-3"
                      >
                        <span className="text-paper text-sm">{p.name}</span>
                        <span className="text-paper-dim text-xs shrink-0">{TYPE_LABELS[p.type] || ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="submit"
              className="press inline-flex items-center justify-center gap-1.5 bg-accent text-white font-medium text-sm rounded-xl px-6 py-3 hover:opacity-90"
            >
              {button} <FiArrowRight aria-hidden />
            </button>
          </form>

          <p className="text-paper-dim text-xs text-center mt-4 max-w-2xl mx-auto">{note}</p>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default RulesLookup;
