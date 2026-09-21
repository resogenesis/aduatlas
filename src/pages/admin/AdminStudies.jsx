import { useEffect, useMemo, useRef, useState } from "react";
import { FiExternalLink, FiRefreshCw, FiSend, FiUpload, FiX } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";
import { INTAKE_FIELDS } from "../../lib/studyIntake";

// Feasibility-study queue: every submitted study, its intake, and the
// controls to review it, message the homeowner, upload the report and site
// plan, and mark it ready.
const STATUS_LABEL = { submitted: "Submitted", in_review: "In review", needs_info: "Needs info", ready: "Ready" };
const STATUS_TONE = {
  submitted: "bg-amber-500/15 text-amber-700",
  in_review: "bg-sky-500/15 text-sky-700",
  needs_info: "bg-red-500/15 text-red-700",
  ready: "bg-accent/15 text-accent",
};

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const FileLink = ({ path, label }) => {
  const open = async () => {
    const { url } = await adminGet(`studies/file?path=${encodeURIComponent(path)}`);
    window.open(url, "_blank", "noreferrer");
  };
  return (
    <button type="button" onClick={open} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline underline-offset-2">
      <FiExternalLink /> {label}
    </button>
  );
};

const Detail = ({ study, onClose, onChanged }) => {
  const [status, setStatus] = useState(study.status);
  const [adminNote, setAdminNote] = useState(study.admin_note || "");
  const [minutes, setMinutes] = useState(study.consult_minutes_used || 0);
  const [link, setLink] = useState(study.consult_link || "");
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const reportRef = useRef(null);
  const planRef = useRef(null);

  const loadMessages = () => adminGet(`studies/messages?user_id=${study.user_id}`).then((d) => setMessages(d.messages)).catch(() => {});
  useEffect(() => {
    loadMessages();
  }, [study.user_id]);

  const save = async () => {
    setBusy("save");
    setError("");
    try {
      await adminPost("studies/update", { id: study.id, status, admin_note: adminNote, consult_minutes_used: Number(minutes), consult_link: link });
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const upload = async (kind, file) => {
    if (!file) return;
    setBusy(kind);
    setError("");
    try {
      const dataUrl = await readAsDataUrl(file);
      await adminPost("studies/upload", { id: study.id, kind, dataUrl, filename: file.name });
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy("reply");
    try {
      await adminPost("studies/reply", { user_id: study.user_id, body: reply.trim() });
      setReply("");
      await loadMessages();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const intake = study.intake || {};

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-surface-1-solid border-l border-stroke overflow-y-auto px-6 py-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-paper-dim text-xs mb-1">{study.email} · {study.paid_tier}</p>
            <h2 className="font-primary font-extrabold tracking-tight text-paper text-2xl">{intake.address || "No address"}</h2>
            <p className="text-paper-dim text-xs mt-1">Submitted {new Date(study.submitted_at).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-paper-dim hover:text-paper hover:bg-canvas" aria-label="Close">
            <FiX />
          </button>
        </div>

        <section className="mb-6">
          <h3 className="text-paper text-sm font-semibold mb-3">Intake</h3>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {INTAKE_FIELDS.map((f) => (
              <div key={f.key} className={f.short ? "" : "sm:col-span-2"}>
                <dt className="text-paper-dim text-xs">{f.label}</dt>
                <dd className="text-paper whitespace-pre-line">{intake[f.key] || <span className="text-paper-dim/60">—</span>}</dd>
              </div>
            ))}
            {study.homeowner_note && (
              <div className="sm:col-span-2">
                <dt className="text-paper-dim text-xs">Homeowner note</dt>
                <dd className="text-paper whitespace-pre-line">{study.homeowner_note}</dd>
              </div>
            )}
          </dl>
          {(intake.files || []).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {intake.files.map((f) => (
                <FileLink key={f.path} path={f.path} label={f.name} />
              ))}
            </div>
          )}
        </section>

        <section className="mb-6 bg-canvas border border-stroke rounded-2xl p-5 space-y-4">
          <h3 className="text-paper text-sm font-semibold">Review</h3>
          <label className="block text-sm">
            <span className="text-paper-dim text-xs">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full bg-surface-1-solid border border-stroke rounded-lg px-3 py-2 text-paper">
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-paper-dim text-xs">Note to the homeowner (shown in their portal)</span>
            <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={3} className="mt-1 w-full bg-surface-1-solid border border-stroke rounded-lg px-3 py-2 text-paper" />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-paper-dim text-xs">Consultation minutes used (0-60)</span>
              <input type="number" min="0" max="60" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="mt-1 w-full bg-surface-1-solid border border-stroke rounded-lg px-3 py-2 text-paper" />
            </label>
            <label className="block text-sm">
              <span className="text-paper-dim text-xs">Scheduling link</span>
              <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className="mt-1 w-full bg-surface-1-solid border border-stroke rounded-lg px-3 py-2 text-paper" />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-paper-dim text-xs mb-1">Feasibility study (PDF)</p>
              {study.report_path && <FileLink path={study.report_path} label="Current file" />}
              <label className="mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke text-sm text-paper cursor-pointer hover:border-accent">
                <FiUpload /> {busy === "report" ? "Uploading…" : study.report_path ? "Replace" : "Upload"}
                <input ref={reportRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => upload("report", e.target.files?.[0])} />
              </label>
            </div>
            <div>
              <p className="text-paper-dim text-xs mb-1">Visual site plan (PDF or image)</p>
              {study.site_plan_path && <FileLink path={study.site_plan_path} label="Current file" />}
              <label className="mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke text-sm text-paper cursor-pointer hover:border-accent">
                <FiUpload /> {busy === "site_plan" ? "Uploading…" : study.site_plan_path ? "Replace" : "Upload"}
                <input ref={planRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => upload("site_plan", e.target.files?.[0])} />
              </label>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button onClick={save} disabled={busy === "save"} className="px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors disabled:opacity-60">
            {busy === "save" ? "Saving…" : "Save review"}
          </button>
        </section>

        <section className="bg-canvas border border-stroke rounded-2xl p-5">
          <h3 className="text-paper text-sm font-semibold mb-3">Messages</h3>
          <ul className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {messages.length === 0 && <li className="text-paper-dim text-sm">No messages.</li>}
            {messages.map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.author ==="admin"?"ml-auto bg-accent/15 text-paper":"bg-surface-1-solid text-paper"}`}>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className="text-[0.65rem] text-paper-dim mt-1">{m.author} · {new Date(m.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
          <form onSubmit={sendReply} className="flex gap-2">
            <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the homeowner" className="flex-1 bg-surface-1-solid border border-stroke rounded-lg px-3 py-2 text-paper text-sm" />
            <button type="submit" disabled={busy === "reply"} className="px-3 py-2 rounded-lg bg-accent text-accent-fg" aria-label="Send">
              <FiSend />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

const AdminStudies = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("open");
  const [activeId, setActiveId] = useState(null);

  const load = () =>
    adminGet("studies/list")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const list = items || [];
    if (filter === "open") return list.filter((s) => s.status !== "ready");
    if (filter === "ready") return list.filter((s) => s.status === "ready");
    return list;
  }, [items, filter]);
  const active = (items || []).find((s) => s.id === activeId) || null;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05]">Feasibility studies</h1>
        </div>
        <div className="flex items-center gap-2">
          {["open", "ready", "all"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-xl text-xs font-medium ${filter === f ?"bg-accent text-accent-fg":"text-paper-dim hover:text-paper border border-stroke"}`}>
              {f === "open" ? "Open" : f === "ready" ? "Ready" : "All"}
            </button>
          ))}
          <button onClick={load} className="p-2 rounded-full text-paper-dim hover:text-paper border border-stroke" aria-label="Refresh">
            <FiRefreshCw />
          </button>
        </div>
      </div>

      {error && <p className="mb-6 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>}
      {items === null && !error && <p className="text-paper-dim text-sm">Loading…</p>}
      {items && visible.length === 0 && <p className="text-paper-dim text-sm">Nothing here.</p>}

      {visible.length > 0 && (
        <div className="overflow-x-auto border border-stroke rounded-2xl">
          <table className="w-full text-sm">
            <thead className="text-paper-dim text-xs text-left">
              <tr>
                <th className="px-4 py-3">Homeowner</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Files</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} onClick={() => setActiveId(s.id)} className="border-t border-stroke hover:bg-surface-1-solid cursor-pointer">
                  <td className="px-4 py-3 text-paper">{s.email}</td>
                  <td className="px-4 py-3 text-paper-dim">{s.intake?.address || "—"}</td>
                  <td className="px-4 py-3 text-paper-dim">{s.paid_tier}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-paper-dim">{new Date(s.submitted_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-paper-dim">
                    {[s.report_path && "study", s.site_plan_path && "plan"].filter(Boolean).join(" + ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && <Detail key={active.id + active.updated_at} study={active} onClose={() => setActiveId(null)} onChanged={load} />}
    </div>
  );
};

export default AdminStudies;
