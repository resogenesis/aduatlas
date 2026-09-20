import { useEffect, useState } from "react";
import { FiCheck, FiAlertCircle, FiMapPin } from "react-icons/fi";

// A looping sample "property check" that runs over the bottom of the hero
// photo: rows appear one at a time, a result lands, then the next sample
// address starts. Every figure here is illustrative and labeled as a sample;
// the real check runs on /property.
const SAMPLES = [
  {
    address: "1247 Mulberry Ln, Pasadena, CA",
    rows: [
      { ok: true, label: "Zoning", value: "ADU permitted on this lot" },
      { ok: true, label: "Size", value: "Up to 1,000 sq ft detached" },
      { ok: true, label: "Setbacks", value: "4 ft side and rear" },
      { ok: false, label: "Utilities", value: "Sewer distance to verify" },
    ],
    result: "Likely feasible",
  },
  {
    address: "88 Ocean View Dr, San Diego, CA",
    rows: [
      { ok: true, label: "Zoning", value: "ADU and JADU permitted" },
      { ok: true, label: "Size", value: "Garage conversion or 800 sq ft new" },
      { ok: false, label: "Slope", value: "Grade change to verify" },
      { ok: true, label: "Parking", value: "No replacement required" },
    ],
    result: "Possible with verification",
  },
  {
    address: "512 Elmwood Ave, Sacramento, CA",
    rows: [
      { ok: true, label: "Zoning", value: "Detached ADU permitted" },
      { ok: true, label: "Size", value: "Up to 1,200 sq ft" },
      { ok: true, label: "Height", value: "16 ft, 18 ft near transit" },
      { ok: true, label: "Utilities", value: "Water and sewer at rear" },
    ],
    result: "Likely feasible",
  },
];

const STEP_MS = 900;
const HOLD_MS = 2600;
const prefersReducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

const LiveCheck = () => {
  const [sample, setSample] = useState(0);
  const [step, setStep] = useState(0); // 0..rows.length = rows shown; rows.length+1 = result
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || reduced) return undefined;
    let timer;
    const total = SAMPLES[sample].rows.length + 1;
    if (step < total) {
      timer = setTimeout(() => setStep((s) => s + 1), step === 0 ? 700 : STEP_MS);
    } else {
      timer = setTimeout(() => {
        setStep(0);
        setSample((i) => (i + 1) % SAMPLES.length);
      }, HOLD_MS);
    }
    return () => clearTimeout(timer);
  }, [sample, step, reduced]);

  const current = SAMPLES[sample];
  const shown = reduced ? current.rows.length + 1 : step;
  const done = shown > current.rows.length;

  return (
    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
      <div className="rounded-2xl bg-forest-deep/45 backdrop-blur-2xl border border-white/15 text-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium truncate">
            <FiMapPin className="text-gold shrink-0" aria-hidden />
            <span className="truncate">{current.address}</span>
          </p>
          <span className="shrink-0 text-[0.6rem] font-semibold tracking-[0.2em] uppercase text-white/50">Sample check</span>
        </div>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {current.rows.map((r, i) => {
            const visible = i < shown;
            return (
              <li key={`${sample}-${i}`} className="relative h-6 flex items-center">
                <span
                  className={`absolute inset-y-1.5 left-0 right-6 rounded bg-white/10 animate-pulse transition-opacity duration-300 ${
                    visible ? "opacity-0" : "opacity-100"
                  }`}
                  aria-hidden
                />
                <span
                  className={`flex items-center gap-2.5 text-xs sm:text-[0.8rem] w-full transition-all duration-500 ${
                    visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 ${
                      r.ok ? "bg-white/15 text-gold" : "bg-gold/20 text-gold"
                    }`}
                  >
                    {r.ok ? <FiCheck className="text-[0.7rem]" aria-hidden /> : <FiAlertCircle className="text-[0.7rem]" aria-hidden />}
                  </span>
                  <span className="text-white/60 w-14 shrink-0">{r.label}</span>
                  <span className="text-white truncate">{r.value}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <div
          className={`mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-3 transition-all duration-500 ${
            done ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
          }`}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-gold" aria-hidden />
            {current.result}
          </span>
          <span className="text-[0.7rem] text-white/60">Verify with your city before you spend</span>
        </div>
      </div>
    </div>
  );
};

export default LiveCheck;
