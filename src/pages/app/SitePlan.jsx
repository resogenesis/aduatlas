import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiDownload } from "react-icons/fi";
import { fetchMyStudy, signedUrl } from "../../lib/studies";

// Visual site plan: the delivered drawing when the study is ready; until
// then, the self-serve envelope tool as a way to start reasoning about the
// lot. Platinum and Concierge only (route is gated).
const SitePlan = () => {
  const [study, setStudy] = useState(undefined);
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyStudy().then(async (r) => {
      if (cancelled) return;
      const s = r.ok ? r.study : null;
      setStudy(s);
      if (s?.site_plan_path) {
        const u = await signedUrl(s.site_plan_path);
        if (!cancelled) setUrl(u);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const delivered = study?.status === "ready" && study?.site_plan_path;
  const isPdf = (study?.site_plan_path || "").toLowerCase().endsWith(".pdf");

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">Site plan</h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-10">
        Your property drawn to a consistent scale: the main house, setbacks, the proposed ADU placement, and the space around it.
      </p>

      {delivered ? (
        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-4 sm:p-6">
          {url ? (
            isPdf ? (
              <iframe title="Visual site plan" src={url} className="w-full h-[70vh] rounded-2xl bg-white" />
            ) : (
              <img src={url} alt="Visual site plan for your property" className="w-full rounded-2xl bg-white" />
            )
          ) : (
            <p className="text-paper-dim text-sm p-4">Loading your site plan…</p>
          )}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors">
              <FiDownload /> Download
            </a>
          )}
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9">
            <h2 className="font-primary font-extrabold tracking-tight text-paper text-2xl mb-2">
              {study === undefined ? "Checking your study…" : study ? "Your site plan is being prepared" : "Start your feasibility study"}
            </h2>
            <p className="text-paper-dim text-sm leading-relaxed mb-6">
              {study
                ? "The drawing is delivered with your feasibility study. You will find both here when they are ready."
                : "Submit your property details and we will prepare the study and site plan for your lot."}
            </p>
            <Link to="/study" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors">
              {study ? "See study status" : "Start the study"} <FiArrowRight />
            </Link>
          </div>
          <div className="bg-canvas border border-stroke rounded-3xl p-7 sm:p-9">
            <h2 className="font-primary font-extrabold tracking-tight text-paper text-2xl mb-2">Sketch it yourself while you wait</h2>
            <p className="text-paper-dim text-sm leading-relaxed mb-6">
              The buildable-envelope tool lets you enter your lot dimensions and setbacks and see a rough footprint. It is a planning estimate, not a survey.
            </p>
            <Link to="/feasibility" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stroke text-paper text-sm font-medium hover:border-accent transition">
              Open the envelope tool <FiArrowRight />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default SitePlan;
