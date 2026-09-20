import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiCheck, FiDownload, FiFileText, FiPaperclip, FiUpload } from "react-icons/fi";
import { loadPacket } from "../../stores/courseStore";
import { STUDY_STATUS, fetchMyStudy, signedUrl, submitIntake, uploadIntakeFile } from "../../lib/studies";
import { supabaseEnabled } from "../../lib/supabase";
import { INTAKE_FIELDS } from "../../lib/studyIntake";

// Feasibility study: property intake, then status until the report and site
// plan are delivered. Platinum and Concierge only (route is gated).


const emptyIntake = () => {
  const packet = loadPacket();
  const base = Object.fromEntries(INTAKE_FIELDS.map((f) => [f.key, ""]));
  return { ...base, address: packet.address || "", budget: packet.budget || "", timeline: packet.timeline || "", files: [] };
};

const Field = ({ f, value, onChange }) => (
  <label className={f.short ? "sm:col-span-1" : "sm:col-span-2"}>
    <span className="block text-paper text-sm font-medium mb-1.5">{f.label}</span>
    {f.type === "textarea" ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={f.placeholder}
        rows={3}
        className="w-full px-4 py-3 bg-canvas border border-stroke rounded-xl text-paper placeholder:text-paper-dim/60 focus:outline-none focus:ring-2 focus:ring-accent"
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={f.placeholder}
        className="w-full px-4 py-3 bg-canvas border border-stroke rounded-xl text-paper placeholder:text-paper-dim/60 focus:outline-none focus:ring-2 focus:ring-accent"
      />
    )}
  </label>
);

const Deliverable = ({ label, path }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    signedUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noreferrer"
      aria-disabled={!url}
      className={`flex items-center justify-between gap-3 px-5 py-4 rounded-2xl border border-stroke bg-canvas hover:border-accent transition ${url ?"":"opacity-60 pointer-events-none"}`}
    >
      <span className="inline-flex items-center gap-3 text-paper font-medium">
        <FiFileText className="text-accent" /> {label}
      </span>
      <FiDownload className="text-paper-dim" />
    </a>
  );
};

const Study = () => {
  const [study, setStudy] = useState(undefined); // undefined = loading, null = none yet
  const [intake, setIntake] = useState(emptyIntake);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = () =>
    fetchMyStudy().then((r) => {
      if (!r.ok) {
        setStudy(null);
        return;
      }
      setStudy(r.study);
      if (r.study) {
        setIntake({ ...emptyIntake(), ...r.study.intake });
        setNote(r.study.homeowner_note || "");
      }
    });

  useEffect(() => {
    load();
  }, []);

  const setField = (key, value) => setIntake((p) => ({ ...p, [key]: value }));

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError("");
    for (const f of files.slice(0, 6)) {
      const r = await uploadIntakeFile(f);
      if (r.ok) setIntake((p) => ({ ...p, files: [...(p.files || []), { path: r.path, name: r.name, size: r.size, type: r.type }] }));
      else setError(r.error === "not-signed-in" ? "Sign in to upload files." : `Upload failed: ${r.error}`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const r = await submitIntake({ intake, homeownerNote: note });
    setSaving(false);
    if (!r.ok) {
      setError(r.error === "supabase-disabled" ? "Submissions are not connected in this environment." : `Could not submit: ${r.error}`);
      return;
    }
    setStudy(r.study);
    setEditing(false);
  };

  const showForm = study === null || editing || (study && study.status === "needs_info" && editing);
  const status = study ? STUDY_STATUS[study.status] : null;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">Feasibility study</h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-10">
        Tell us about your property. We prepare a feasibility study and a visual site plan for it and deliver both here.
      </p>

      {!supabaseEnabled && (
        <p className="mb-8 text-sm text-paper-dim bg-surface-1-solid border border-stroke rounded-2xl px-5 py-4">
          Study submissions need the account service, which is not connected in this environment.
        </p>
      )}

      {study === undefined && <p className="text-paper-dim text-sm">Loading your study…</p>}

      {study && !showForm && (
        <section className="mb-10">
          <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9">
            <ol className="grid grid-cols-3 gap-3 mb-6">
              {["Submitted", "In review", "Ready"].map((label, i) => {
                const done = status.step >= i + 1;
                return (
                  <li key={label} className="flex items-center gap-2 text-sm">
                    <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center ${done ?"bg-accent text-accent-fg":"border border-stroke text-paper-dim"}`}>
                      {done ? <FiCheck /> : i + 1}
                    </span>
                    <span className={done ? "text-paper font-medium" : "text-paper-dim"}>{label}</span>
                  </li>
                );
              })}
            </ol>
            <h2 className="font-primary font-extrabold tracking-tight text-paper text-2xl mb-2">{status.label}</h2>
            <p className="text-paper-dim text-sm leading-relaxed mb-5">{status.note}</p>
            {study.admin_note && (
              <div className="bg-canvas border border-stroke rounded-2xl p-5 mb-5">
                <p className="text-paper text-sm font-semibold mb-1">A note from your ADUAtlas reviewer</p>
                <p className="text-paper-dim text-sm whitespace-pre-line">{study.admin_note}</p>
              </div>
            )}
            {study.status === "ready" && (
              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                {study.report_path && <Deliverable label="Feasibility study (PDF)" path={study.report_path} />}
                {study.site_plan_path && <Deliverable label="Visual site plan" path={study.site_plan_path} />}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              {(study.status === "submitted" || study.status === "needs_info") && (
                <button type="button" onClick={() => setEditing(true)} className="px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors">
                  {study.status === "needs_info" ? "Update my details" : "Edit my details"}
                </button>
              )}
              {study.status === "ready" && (
                <Link to="/site-plan" className="px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors">
                  Open the site plan
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {showForm && study !== undefined && (
        <form onSubmit={submit} className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9">
          <div className="grid sm:grid-cols-2 gap-5">
            {INTAKE_FIELDS.map((f) => (
              <Field key={f.key} f={f} value={intake[f.key] || ""} onChange={(v) => setField(f.key, v)} />
            ))}
            <label className="sm:col-span-2">
              <span className="block text-paper text-sm font-medium mb-1.5">Anything else we should know?</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full px-4 py-3 bg-canvas border border-stroke rounded-xl text-paper focus:outline-none focus:ring-2 focus:ring-accent" />
            </label>
          </div>

          <div className="mt-6">
            <p className="text-paper text-sm font-medium mb-2">Photos and documents</p>
            <p className="text-paper-dim text-xs mb-3">Backyard photos, a survey or plot plan, utility bills showing service size. PDF, JPG, PNG or WebP, up to 8 MB each.</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stroke bg-canvas text-sm font-medium text-paper cursor-pointer hover:border-accent transition">
                <FiUpload /> {uploading ? "Uploading…" : "Add files"}
                <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" onChange={onFiles} className="hidden" disabled={uploading} />
              </label>
              {(intake.files || []).map((f) => (
                <span key={f.path} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-stroke text-xs text-paper-dim">
                  <FiPaperclip /> {f.name}
                </span>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-5 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <button type="submit" disabled={saving || !supabaseEnabled} className="px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors disabled:opacity-60">
              {saving ? "Submitting…" : study ? "Resubmit details" : "Submit for review"}
            </button>
            {study && (
              <button type="button" onClick={() => setEditing(false)} className="px-6 py-3 rounded-xl border border-stroke text-paper text-sm font-medium hover:bg-canvas transition">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
};

export default Study;
