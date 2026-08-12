import { useEffect, useMemo, useRef, useState } from "react";
import WorksheetBar from "../../components/tools/WorksheetBar";
import { loadPacket } from "../../stores/courseStore";
import { loadWorksheet, saveWorksheet } from "../../stores/worksheetStore";

// Project Timelines Worksheet — the "builder, permit, inspection, and city
// timelines" deliverable of the $399 Feasibility Report. Phases follow the
// course's 10-step process; durations are the HOMEOWNER'S estimates, entered
// in weeks, because (per Module 5) every project timeline is different —
// some cities approve plans in two weeks, others take two months. Ask yours.

const PHASES = [
  { label: "Research & feasibility", hint: "This course, your feasibility study, and early city questions" },
  { label: "Design & engineering", hint: "Plans, structural work, and any studies your site triggers" },
  { label: "Permit application & plan check", hint: "Varies widely by city — some take two weeks, others two months. Ask yours." },
  { label: "Builder selection & contract", hint: "Proposals, comparisons, and signing — builder availability drives this" },
  { label: "Site preparation", hint: "Clearing, grading, access work" },
  { label: "Foundation", hint: "Weather can move this phase" },
  { label: "Construction / factory build & delivery", hint: "Depends heavily on the ADU type you chose" },
  { label: "Utility connections", hint: "Coordination with utility providers adds calendar time" },
  { label: "Inspections", hint: "City inspection scheduling varies by municipality" },
  { label: "Final approval & occupancy", hint: "Certificate of occupancy and move-in" },
];

const emptyPhases = () => PHASES.map(() => ({ low: 0, high: 0, notes: "" }));

const fmtWeeks = (w) => {
  if (!w) return "—";
  const months = w / 4.345;
  return months >= 2 ? `${w} wk (~${Math.round(months)} mo)` : `${w} wk`;
};

const TimelineWorksheet = () => {
  const [phases, setPhases] = useState(() => {
    const saved = loadWorksheet("timeline");
    return saved?.phases?.length === PHASES.length ? saved.phases : emptyPhases();
  });
  const [savedAt, setSavedAt] = useState(null);
  const packet = useMemo(() => loadPacket(), []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      saveWorksheet("timeline", { phases });
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [phases]);

  const update = (idx, field, val) =>
    setPhases((arr) =>
      arr.map((p, i) =>
        i === idx ? { ...p, [field]: field === "notes" ? val : Number(val) || 0 } : p
      )
    );

  const totals = useMemo(
    () => ({
      low: phases.reduce((s, p) => s + (p.low || 0), 0),
      high: phases.reduce((s, p) => s + (p.high || 0), 0),
    }),
    [phases]
  );

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Feasibility Report · Worksheet
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-4">
        Project timelines.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-4">
        Every ADU timeline is different — projects commonly run anywhere from 8 months to 2 years
        end to end, and seasons, permits, and builder availability all move the dates. Enter your
        estimates in weeks as you learn them from your city and your builder candidates.
      </p>
      {packet.timeline && (
        <p className="text-paper-dim text-sm mb-8">
          Your timeline goal (from My Property): <span className="text-paper font-medium">{packet.timeline}</span>
        </p>
      )}

      <div className="overflow-x-auto bg-surface-1-solid rounded-2xl border border-stroke mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-paper-dim text-xs uppercase tracking-[0.15em] border-b border-stroke">
              <th className="px-4 py-4 text-left font-medium">Phase</th>
              <th className="px-4 py-4 text-right font-medium">Low (wk)</th>
              <th className="px-4 py-4 text-right font-medium">High (wk)</th>
              <th className="px-4 py-4 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {PHASES.map((ph, i) => (
              <tr key={ph.label} className="border-b border-stroke/60 align-top">
                <td className="px-4 py-3 min-w-52">
                  <span className="text-paper">{ph.label}</span>
                  <p className="text-paper-dim/70 text-xs mt-0.5">{ph.hint}</p>
                </td>
                {["low", "high"].map((f) => (
                  <td key={f} className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min="0"
                      value={phases[i][f] || ""}
                      placeholder="0"
                      onChange={(e) => update(i, f, e.target.value)}
                      className="w-16 px-2 py-1 rounded-lg bg-canvas border border-stroke text-paper text-sm text-right focus:outline-none focus:border-accent transition"
                    />
                  </td>
                ))}
                <td className="px-4 py-3 min-w-44">
                  <input
                    type="text"
                    value={phases[i].notes}
                    placeholder="Who told you, and when"
                    onChange={(e) => update(i, "notes", e.target.value)}
                    className="w-full px-2 py-1 rounded-lg bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/40 focus:outline-none focus:border-accent transition"
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-accent/10">
              <td className="px-4 py-4 font-display text-paper text-base">Estimated total</td>
              <td className="px-4 py-4 text-right font-display text-accent text-base tabular-nums whitespace-nowrap">{fmtWeeks(totals.low)}</td>
              <td className="px-4 py-4 text-right font-display text-accent text-base tabular-nums whitespace-nowrap">{fmtWeeks(totals.high)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-paper-dim text-xs leading-relaxed">
        Planning worksheet, not a schedule. Phases can overlap (a factory build can run during plan
        check), so your calendar total may be shorter than the sum. No builder will commit to exact
        dates — expect estimates, ask your city and builder for their typical ranges, and complete
        each step in the proper order to reduce delays.
      </p>
    </div>
  );
};

export default TimelineWorksheet;
