import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiCheck, FiDownload, FiFileText, FiPaperclip, FiUpload } from "react-icons/fi";
import { loadPacket } from "../../stores/courseStore";
import { STUDY_STEPS, fetchMyStudy, saveDraft, signedUrl, studyStatus, submitStudy, uploadIntakeFile } from "../../lib/studies";
import { supabaseEnabled } from "../../lib/supabase";
import { INTAKE_FIELDS } from "../../lib/studyIntake";
import { TIERS, getPaidTier, hasTier } from "../../stores/paymentStore";
import { currentUser } from "../../stores/authStore";
import { PLAN_IDS, planById } from "../../lib/plans";

// Feasibility study: property intake, then status until the report and the
// site plan in two versions are delivered.
//
// TWO ACTIONS, NOT ONE (decision 2q, migration 0018). Saving intake as a DRAFT
// is free at every tier, because a half-filled intake is the on-ramp to an
// upgrade. SUBMITTING it is what makes it an order, and only a live Platinum or
// Concierge entitlement may do that.
//
// hasTier() below is a client-side UX hint and nothing more: it decides which
// button to draw. The boundary is the RLS policy in 0018, and a refusal from it
// comes back as "not-entitled" and is shown as the upgrade it is. The submit
// action is never a silent no-op — either it sends the write, or the page offers
// the upgrade instead of a button that does nothing.
//
// ANY SIGNED-IN HOMEOWNER may open this page and save a draft (2q, R3-03): the
// route no longer asks for Platinum. So the page itself says, next to the submit
// control, why a Golden or free account cannot submit yet and what it can do
// now, instead of leaving that to a paywall in front of the whole page.


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
  const [saving, setSaving] = useState(""); // "" | "draft" | "submit"
  const [savedDraft, setSavedDraft] = useState(false);
  const [error, setError] = useState("");
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const platinum = planById(PLAN_IDS.PLATINUM);
  const canSubmit = hasTier(TIERS.REPORT);
  const heldPlan = planById(getPaidTier());
  const signedIn = Boolean(currentUser());

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

  // One writer for both actions, because they differ in exactly one thing:
  // whether the study becomes an order. Saving is free at every tier; submitting
  // is the gated transition, and a refusal from that gate is an upgrade to offer
  // rather than an error to print.
  const write = async (mode) => {
    setSaving(mode);
    setError("");
    setSavedDraft(false);
    setNeedsUpgrade(false);
    const r = mode === "submit" ? await submitStudy({ intake, homeownerNote: note }) : await saveDraft({ intake, homeownerNote: note });
    setSaving("");
    if (!r.ok) {
      if (r.error === "not-entitled") {
        // The database refused to make this study an order. The draft itself is
        // saved, so say what happened and where the upgrade is.
        if (r.study) setStudy(r.study);
        setNeedsUpgrade(true);
        return;
      }
      if (r.error === "locked") {
        // Work has moved past the point where the intake can be changed. Show
        // the real state rather than an error the customer cannot act on.
        if (r.study) setStudy(r.study);
        setEditing(false);
        setError("Your details are locked because we have started work on your study. Send us a message and we will update it for you.");
        return;
      }
      const what = mode === "submit" ? "submit" : "save";
      setError(
        r.error === "supabase-disabled"
          ? "Submissions are not connected in this environment."
          : r.error === "not-signed-in"
            ? "You are signed out, so your details were not saved. Sign in and save them again."
            : `Could not ${what}: ${r.error}`
      );
      return;
    }
    setStudy(r.study);
    if (mode === "submit") {
      setEditing(false);
      return;
    }
    // A draft save leaves the customer where they were, still working, with a
    // plain confirmation. Nothing has been sent to ADUAtlas.
    setSavedDraft(true);
  };

  // A draft has no status card worth showing, so the form is the page until it
  // becomes an order.
  const isDraft = Boolean(study && study.status === "draft");
  const showForm = study === null || isDraft || editing;
  const status = study ? studyStatus(study.status) : null;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">Feasibility study</h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-4">
        Tell us about your property. We prepare a feasibility study and a site plan in two versions, what could fit and the arrangement you want, and deliver them here.
      </p>
      <p className="text-paper-dim text-sm max-w-2xl mb-10">
        Saving your details costs nothing and you can come back to them whenever you like. The feasibility study and the site
        plan are part of {platinum?.name || "Platinum"} and Concierge, so submitting your details for review needs one of those two plans.
      </p>

      {!supabaseEnabled && (
        <p className="mb-8 text-sm text-paper-dim bg-surface-1-solid border border-stroke rounded-2xl px-5 py-4">
          Study submissions need the account service, which is not connected in this environment.
        </p>
      )}

      {!signedIn && (
        <p className="mb-8 text-sm text-paper-dim bg-surface-1-solid border border-stroke rounded-2xl px-5 py-4">
          <Link to="/login" state={{ from: "/study" }} className="text-accent hover:underline underline-offset-2">Sign in</Link> to save your property details. Saving them costs nothing.
        </p>
      )}

      {study === undefined && <p className="text-paper-dim text-sm">Loading your study…</p>}

      {study && !showForm && (
        <section className="mb-10">
          <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9">
            <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {STUDY_STEPS.map((label, i) => {
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
            {study.work_started_at && (
              <div className="bg-canvas border border-stroke rounded-2xl p-5 mb-5">
                <p className="text-paper text-sm font-semibold mb-1">
                  Work began on {new Date(study.work_started_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                </p>
                <p className="text-paper-dim text-sm leading-relaxed">
                  That is the date we started the work on your feasibility study and site plan. From that date those two
                  items are non-refundable. The 48 hour refund on the rest of your package still applies. See the{" "}
                  <Link to="/legal#refund" className="text-accent hover:underline underline-offset-2">refund policy</Link>.
                </p>
              </div>
            )}
            {study.admin_note && (
              <div className="bg-canvas border border-stroke rounded-2xl p-5 mb-5">
                <p className="text-paper text-sm font-semibold mb-1">A note from your ADUAtlas reviewer</p>
                <p className="text-paper-dim text-sm whitespace-pre-line">{study.admin_note}</p>
              </div>
            )}
            {study.status === "ready" && (
              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                {study.report_path && <Deliverable label="Feasibility study (PDF)" path={study.report_path} />}
                {study.site_plan_path && <Deliverable label="Site plan in two versions" path={study.site_plan_path} />}
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
                  Open the site plan in two versions
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {isDraft && (
        <div className="mb-6 bg-surface-1-solid border border-stroke rounded-2xl px-5 py-4">
          <p className="text-paper text-sm font-semibold mb-1">{status.label}</p>
          <p className="text-paper-dim text-sm leading-relaxed">{status.note}</p>
        </div>
      )}

      {showForm && study !== undefined && (
        // Enter saves a draft. Turning an intake into an order is a deliberate
        // click on its own button, never something a keystroke in a text field
        // does by accident.
        <form
          onSubmit={(e) => {
            e.preventDefault();
            write("draft");
          }}
          className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9"
        >
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

          {/* The gate said no. The details are saved either way, and the next
              step is a price, not an error. */}
          {needsUpgrade && (
            <div role="alert" className="mt-5 bg-canvas border border-stroke rounded-2xl p-5">
              <p className="text-paper text-sm font-semibold mb-1">Your details are saved. Submitting them needs {platinum?.name || "Platinum"}.</p>
              <p className="text-paper-dim text-sm leading-relaxed mb-4">
                The feasibility study and the site plan in two versions are part of {platinum?.name || "Platinum"} and Concierge. Your saved
                details stay exactly as they are, and the same intake is submitted once your plan covers it.
              </p>
              <Link
                to={`/unlock?tier=${PLAN_IDS.PLATINUM}`}
                state={{ from: "/study", tier: PLAN_IDS.PLATINUM }}
                className="inline-flex px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors"
              >
                See {platinum?.name || "Platinum"}
              </Link>
            </div>
          )}

          {/* Next to the controls, for an account that cannot submit: why, and
              what it can do now. */}
          {!canSubmit && (
            <p data-testid="study-submit-requirement" className="mt-6 text-sm text-paper-dim leading-relaxed">
              Submitting your details for review is part of {platinum?.name || "Platinum"} and Concierge, because that is what
              starts your feasibility study and site plan.{" "}
              {heldPlan
                ? `Your plan is ${heldPlan.name}, so you can save your details now and submit them after you upgrade.`
                : "You do not have a plan yet, so you can save your details now and submit them once your plan includes the study."}
            </p>
          )}

          {/* The same button saves a draft and saves a change to an order that
              has already been submitted, so the confirmation has to say which
              one happened. "Nothing has been sent to us" is true of a draft and
              false of an order. */}
          {savedDraft && !needsUpgrade && (
            <p role="status" className="mt-5 text-sm text-paper-dim">
              {isDraft ? "Saved. Nothing has been sent to us yet." : "Saved. Your reviewer sees the updated details."}
            </p>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={Boolean(saving) || !supabaseEnabled}
              className="px-6 py-3 rounded-xl border border-stroke text-paper font-semibold text-sm hover:border-accent transition disabled:opacity-60"
            >
              {saving === "draft" ? "Saving…" : "Save my details"}
            </button>

            {canSubmit ? (
              <button
                type="button"
                onClick={() => write("submit")}
                disabled={Boolean(saving) || !supabaseEnabled}
                className="px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
              >
                {saving === "submit" ? "Submitting…" : study && !isDraft ? "Resubmit details" : "Submit for review"}
              </button>
            ) : (
              // No disabled submit button and no no-op: the action a homeowner
              // without the entitlement can actually take is the upgrade.
              <Link
                to={`/unlock?tier=${PLAN_IDS.PLATINUM}`}
                state={{ from: "/study", tier: PLAN_IDS.PLATINUM }}
                className="px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors"
              >
                {heldPlan ? "Upgrade to" : "Get"} {platinum?.name || "Platinum"} to submit
              </Link>
            )}

            {study && !isDraft && (
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
