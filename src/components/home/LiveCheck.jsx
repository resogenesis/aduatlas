import { useEffect, useState } from "react";
import { FiCheck, FiAlertCircle, FiMapPin } from "react-icons/fi";

// A looping sample of the FREE property check over the bottom of the hero
// photo: public-record facts appear one at a time, unknowns are flagged, and
// the closing line points to the paid feasibility study. Figures are
// illustrative and labeled as a sample; the real check runs on /property.
const SAMPLES = [
  {
    address: "1247 Mulberry Ln, Pasadena, CA",
    rows: [
      { ok: true, label: "Lot", value: "7,200 sq ft, public record" },
      { ok: true, label: "Home", value: "1,640 sq ft, built 1962" },
      { ok: true, label: "Type", value: "Single-family residential" },
      { ok: false, label: "Zoning", value: "Confirm with the city" },
    ],
    result: "Ready for a feasibility study",
  },
  {
    address: "88 Ocean View Dr, San Diego, CA",
    rows: [
      { ok: true, label: "Lot", value: "5,400 sq ft, public record" },
      { ok: true, label: "Home", value: "1,210 sq ft, built 1978" },
      { ok: true, label: "Garage", value: "Detached, 2-car" },
      { ok: false, label: "Slope", value: "Grade change to verify" },
    ],
    result: "Ready for a feasibility study",
  },
  {
    address: "512 Elmwood Ave, Sacramento, CA",
    rows: [
      { ok: true, label: "Lot", value: "9,100 sq ft, public record" },
      { ok: true, label: "Home", value: "1,880 sq ft, built 1955" },
      { ok: true, label: "Type", value: "Single-family residential" },
      { ok: false, label: "Utilities", value: "Sewer distance to verify" },
    ],
    result: "Ready for a feasibility study",
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
          <span className="shrink-0 text-[0.65rem] font-medium text-white/50">Sample</span>
        </div>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {current.rows.map((r, i) => {
            const visible = i < shown;
            return (
              <li key={`${sample}-${i}`} className="relative h-6 flex items-center">
                <span
                  className={`absolute inset-y-1.5 left-0 right-6 rounded bg-white/10 animate-pulse transition-opacity duration-300 ${ visible ?"opacity-0":"opacity-100"}`}
                  aria-hidden
                />
                <span
                  className={`flex items-center gap-2.5 text-xs sm:text-[0.8rem] w-full transition-all duration-500 ${ visible ?"opacity-100 translate-y-0":"opacity-0 translate-y-1"}`}
                >
                  <span
                    className={`w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 ${ r.ok ?"bg-white/15 text-gold":"bg-gold/20 text-gold"}`}
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
          className={`mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-3 transition-all duration-500 ${ done ?"opacity-100 translate-y-0":"opacity-0 translate-y-1"}`}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-gold" aria-hidden />
            {current.result}
          </span>
          <span className="text-[0.7rem] text-white/60">Full study and site plan with Platinum</span>
        </div>
      </div>
    </div>
  );
};

export default LiveCheck;
