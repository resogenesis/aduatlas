import { useEffect, useMemo, useRef, useState } from "react";
import { FiExternalLink, FiRefreshCw, FiSend, FiUpload, FiX } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";
import { INTAKE_FIELDS } from "../../lib/studyIntake";
import { planById } from "../../lib/plans";
import { PACKET_FIELDS } from "../../stores/courseStore";
import { NAPE_GRADES, NAPE_TOTAL_ITEMS, scoreNape } from "../../stores/worksheetStore";

// Two surfaces on one screen.
//
// STUDIES — the fulfilment queue (decision 2i). Richard produces the feasibility
// study and the site plan himself in Phase 1, so this is the whole workflow and
// it is deliberately the minimum: every paid order, the brief the customer
// filled in, and the controls to move the order along, message the customer,
// upload the two deliverables and deliver them. Nothing resembling project
// management software: no assignees, no due dates, no priorities, no tasks.
//
// SUPPORT — every support thread, standing on its own. Concierge is sold as 60
// minutes of consultation plus written support through the portal, and written
// support is not a property of a study: a Concierge customer who has written
// but has never submitted a study still has to be answerable. So the threads
// list reads support_messages directly, shows who is waiting, and replies into
// the same thread the customer sees in their portal.
//
// TWO KINDS OF THREAD (C1). Concierge support and refund requests are different
// things with different readers: a support reply appears on /support, which only
// a live Concierge plan opens, and a refund reply appears with the refund request
// on the customer's settings page, whatever their plan. Each thread says which it
// is, every reply is written with the kind of the thread it answers, and a thread
// whose customer could not read a reply says so instead of offering a box that
// reaches nobody. The server refuses such a reply too.
const TABS = [
  ["studies", "Studies"],
  ["support", "Support"],
];

const tierLabel = (tier) => planById(tier)?.name || tier || "-";
const KIND_LABEL = { support: "Concierge support", refund_request: "Refund request" };
const KIND_TONE = { support: "bg-sky-500/15 text-sky-700", refund_request: "bg-amber-500/15 text-amber-700" };
const KindPill = ({ kind }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${KIND_TONE[kind] || KIND_TONE.support}`}>{KIND_LABEL[kind] || kind}</span>
);
const when = (ts) => (ts ? new Date(ts).toLocaleString() : "-");
const onDay = (ts) => (ts ? new Date(ts).toLocaleDateString() : "-");

// The six states of decision 2i, in order, plus the off-ramp. "Paid" is not in
// the select: it means no studies row exists yet, and the only thing that moves
// an order out of it is the customer submitting their intake.
//
// The stored token for three of these predates the decision ('submitted',
// 'in_review', 'ready'); migration 0011 carries the mapping and explains why
// they were not renamed. These are the operator's words for them.
const LIFECYCLE = [
  ["submitted", "Intake Complete"],
  ["in_review", "Ready for Review"],
  ["work_started", "Work Started"],
  ["deliverables_ready", "Deliverables Ready"],
  ["ready", "Delivered"],
  ["needs_info", "Needs Info"],
];
const STATUS_LABEL = { paid: "Paid", ...Object.fromEntries(LIFECYCLE) };
const STATUS_TONE = {
  paid: "bg-stone-500/15 text-stone-700",
  submitted: "bg-amber-500/15 text-amber-700",
  in_review: "bg-sky-500/15 text-sky-700",
  work_started: "bg-indigo-500/15 text-indigo-700",
  deliverables_ready: "bg-violet-500/15 text-violet-700",
  needs_info: "bg-red-500/15 text-red-700",
  ready: "bg-accent/15 text-accent",
};

const PACKET_LABEL = Object.fromEntries(PACKET_FIELDS.map((f) => [f.key, f.label]));
const LOT_LABEL = {
  lotWidth: "Lot width (ft)",
  lotDepth: "Lot depth (ft)",
  front: "Front setback (ft)",
  rear: "Rear setback (ft)",
  side: "Side setback (ft)",
  houseDepth: "House depth (ft)",
};

// ── The project brief ───────────────────────────────────────────────────────
// /my-property tells the customer these twelve questions "flow into your
// feasibility study". Until now they stopped at the database: the queue never
// selected users.builder_packet, so nine of the fields, the lot dimensions and
// the ADU Ready Score reached no reader.
//
// Nothing here fills a gap. A field the customer left blank is omitted by the
// API and is not printed at all (decision 2b), and a lot dimension the customer
// never entered is labelled as an estimate derived from a public record rather
// than shown as their answer.
const ProjectBrief = ({ brief }) => {
  if (!brief) {
    return (
      <section className="mb-6">
        <h3 className="text-paper text-sm font-semibold mb-2">Project brief</h3>
        <p className="text-paper-dim text-sm">
          The customer has not filled in their project brief. Nothing is assumed on their behalf.
        </p>
      </section>
    );
  }

  const entries = Object.entries(brief.fields || {});
  const lot = brief.lot;
  const rs = brief.ready_score;
  // Recomputed from the answers when they are there, so the grade shown is the
  // grade the scoring rules give rather than a number cached in a browser.
  const scored = rs?.answers ? scoreNape(rs.answers) : null;
  const grade = scored ? scored.grade : rs?.grade || null;
  const points = scored ? scored.points : rs?.points ?? null;
  const noGo = scored ? scored.noGoFlags : [];
  const answered = scored ? scored.answered : null;

  return (
    <section className="mb-6">
      <h3 className="text-paper text-sm font-semibold mb-3">Project brief</h3>

      {entries.length > 0 ? (
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {entries.map(([key, value]) => (
            <div key={key} className={value.length > 60 ? "sm:col-span-2" : ""}>
              <dt className="text-paper-dim text-xs">{PACKET_LABEL[key] || key}</dt>
              <dd className="text-paper whitespace-pre-line">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-paper-dim text-sm">No brief answers yet.</p>
      )}

      {lot && (
        <div className="mt-4 bg-canvas border border-stroke rounded-2xl p-4">
          <p className="text-paper text-xs font-semibold mb-2">Lot and setbacks</p>
          {lot.input ? (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2 text-sm">
              {Object.entries(lot.input).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-paper-dim text-xs">{LOT_LABEL[key] || key}</dt>
                  <dd className="text-paper">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-paper-dim text-sm">No dimensions entered.</p>
          )}
          {lot.dims_estimated && (
            <p className="mt-2 text-amber-700 text-xs">
              The width and depth above were estimated from a recorded lot area. The customer did not enter them, and the
              setbacks were left blank because the record says nothing about them.
            </p>
          )}
          {lot.lookup && (lot.lookup.lot_size || lot.lookup.building_size) && (
            <p className="mt-2 text-paper-dim text-xs">
              Public records{lot.lookup.fetched_at ? ` (${onDay(lot.lookup.fetched_at)})` : ""}:
              {lot.lookup.lot_size ? ` lot ${lot.lookup.lot_size.toLocaleString()} sq ft` : ""}
              {lot.lookup.building_size ? `, existing building ${lot.lookup.building_size.toLocaleString()} sq ft` : ""}. Not
              entered by the customer.
            </p>
          )}
          {lot.address && lot.address !== brief.fields?.address && (
            <p className="mt-2 text-paper-dim text-xs">Address used for the lookup: {lot.address}</p>
          )}
        </div>
      )}

      {rs && (
        <div className="mt-4 bg-canvas border border-stroke rounded-2xl p-4">
          <p className="text-paper text-xs font-semibold mb-2">ADU Ready Score</p>
          {grade ? (
            <p className="text-paper text-sm">
              <span className="font-semibold">Grade {grade}</span>
              {points != null && <span className="text-paper-dim"> · {points} / 100</span>}
              <span className="text-paper-dim"> · {NAPE_GRADES[grade]?.label}</span>
            </p>
          ) : (
            <p className="text-paper-dim text-sm">
              Started but not finished{answered != null ? ` (${answered} of ${NAPE_TOTAL_ITEMS} answered)` : ""}, so there is
              no grade yet.
            </p>
          )}
          {noGo.length > 0 && (
            <div className="mt-2">
              <p className="text-red-700 text-xs font-semibold mb-1">
                {noGo.length} automatic no-go answered "No"
              </p>
              <ul className="list-disc pl-5 text-paper-dim text-xs space-y-0.5">
                {noGo.map((it) => (
                  <li key={it.id}>{it.q}</li>
                ))}
              </ul>
            </div>
          )}
          {rs.completed_at && <p className="mt-2 text-paper-dim text-xs">Completed {onDay(rs.completed_at)}</p>}
        </div>
      )}

      {brief.worksheets?.length > 1 && (
        <p className="mt-3 text-paper-dim text-xs">
          Worksheets saved: {brief.worksheets.filter((k) => k !== "readyScore").length + (brief.worksheets.includes("readyScore") ? 1 : 0)}{" "}
          ({brief.worksheets.join(", ")})
        </p>
      )}
      <p className="mt-3 text-paper-dim text-xs">
        Anything the customer left blank is left out above rather than filled in with a guess.
      </p>
    </section>
  );
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

  // The study drawer answers the customer's Concierge support thread. A refund
  // request is answered from the Support tab, in its own thread.
  const loadMessages = () =>
    adminGet(`studies/messages?user_id=${study.user_id}&kind=support`)
      .then((d) => setMessages(d.messages))
      .catch(() => {});
  const canMessage = study.written_support !== false;
  useEffect(() => {
    loadMessages();
  }, [study.user_id]);

  // Moving a DELIVERED study back changes what the customer's portal shows, so it
  // is confirmed first; the server refuses it without the confirmation. The
  // delivery date is kept either way.
  const reopening = study.status === "ready" && status !== "ready";
  const save = async () => {
    if (reopening && !window.confirm(`This study was delivered${study.ready_at ? ` on ${onDay(study.ready_at)}` : ""}. Move it back to ${STATUS_LABEL[status] || status}? The customer's portal will show ${STATUS_LABEL[status] || status} instead of Delivered. The delivery date stays on record.`)) return;
    setBusy("save");
    setError("");
    try {
      await adminPost("studies/update", { id: study.id, status, admin_note: adminNote, consult_minutes_used: Number(minutes), consult_link: link, ...(reopening ? { reopen: true } : {}) });
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
    setError("");
    try {
      // Replying marks the customer's support messages read on the server.
      await adminPost("studies/reply", { user_id: study.user_id, body: reply.trim(), kind: "support" });
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
            <p className="text-paper-dim text-xs mb-1">{study.email} · {tierLabel(study.paid_tier)}</p>
            <h2 className="font-primary font-extrabold tracking-tight text-paper text-2xl">
              {intake.address || study.brief?.fields?.address || "No address"}
            </h2>
            <p className="text-paper-dim text-xs mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[study.status] || ""}`}>
                {STATUS_LABEL[study.status] || study.status}
              </span>
              <span className="ml-2">Intake complete {when(study.submitted_at)}</span>
            </p>
            {/* The refund copy tells the customer we will tell them when
                substantive work began, so the recorded date is shown here as
                well as in their portal. Migration 0011 stamps it once and makes
                it immutable; this is a read. */}
            {study.work_started_at && (
              <p className="text-paper text-xs mt-1">Work started {when(study.work_started_at)}</p>
            )}
            {study.ready_at && <p className="text-paper-dim text-xs mt-1">Delivered {when(study.ready_at)}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-paper-dim hover:text-paper hover:bg-canvas" aria-label="Close">
            <FiX />
          </button>
        </div>

        <ProjectBrief brief={study.brief} />

        <section className="mb-6">
          <h3 className="text-paper text-sm font-semibold mb-3">Intake</h3>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {INTAKE_FIELDS.map((f) => (
              <div key={f.key} className={f.short ? "" : "sm:col-span-2"}>
                <dt className="text-paper-dim text-xs">{f.label}</dt>
                <dd className="text-paper whitespace-pre-line">{intake[f.key] || <span className="text-paper-dim/60">-</span>}</dd>
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
            <span className="text-paper-dim text-xs">Stage</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full bg-surface-1-solid border border-stroke rounded-lg px-3 py-2 text-paper">
              {LIFECYCLE.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {reopening && (
            <p className="text-amber-700 text-xs">
              This study was delivered. Saving moves it back and the customer sees the new stage; you will be asked to confirm. The delivery date is kept.
            </p>
          )}
          {status === "work_started" && !study.work_started_at && (
            <p className="text-paper-dim text-xs">
              Saving this records the date work began. The customer is told that date, and it cannot be changed afterwards.
            </p>
          )}
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
          <h3 className="text-paper text-sm font-semibold mb-1">Messages</h3>
          <p className="text-paper-dim text-xs mb-3">The customer's Concierge support thread. A refund request is answered from the Support tab.</p>
          <ul className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {messages.length === 0 && <li className="text-paper-dim text-sm">No messages.</li>}
            {messages.map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.author ==="admin"?"ml-auto bg-accent/15 text-paper":"bg-surface-1-solid text-paper"}`}>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className="text-[0.65rem] text-paper-dim mt-1">{m.author} · {new Date(m.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
          {canMessage ? (
            <form onSubmit={sendReply} className="flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the homeowner" aria-label="Reply" className="flex-1 bg-surface-1-solid border border-stroke rounded-lg px-3 py-2 text-paper text-sm" />
              <button type="submit" disabled={busy === "reply"} className="px-3 py-2 rounded-lg bg-accent text-accent-fg" aria-label="Send">
                <FiSend />
              </button>
            </form>
          ) : (
            <p className="text-paper-dim text-xs">
              Written support is part of Concierge. This customer is on {tierLabel(study.paid_tier)} and has no page where a message from here would
              appear, so nothing can be sent from this box. The note to the homeowner above is shown in their portal.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

// ── Study queue ─────────────────────────────────────────────────────────────
const StudyQueue = () => {
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
    if (filter === "mine") return list.filter((s) => s.status !== "ready" && s.status !== "paid");
    if (filter === "ready") return list.filter((s) => s.status === "ready");
    return list;
  }, [items, filter]);
  // Only a real studies row can be opened. A "Paid" row has no study behind it
  // yet, so there is nothing to show and nothing to edit.
  const active = (items || []).find((s) => s.id && s.id === activeId) || null;
  const awaitingIntake = (items || []).filter((s) => s.status === "paid").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <p className="text-paper-dim text-sm">
          Every paid order and the controls behind it.
          {awaitingIntake > 0 && ` ${awaitingIntake} waiting on the customer's intake.`}
        </p>
        <div className="flex items-center gap-2">
          {["open", "mine", "ready", "all"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-xl text-xs font-medium ${filter === f ?"bg-accent text-accent-fg":"text-paper-dim hover:text-paper border border-stroke"}`}>
              {f === "open" ? "Open" : f === "mine" ? "On me" : f === "ready" ? "Delivered" : "All"}
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
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Intake</th>
                <th className="px-4 py-3">Work started</th>
                <th className="px-4 py-3">Files</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const openable = Boolean(s.id);
                return (
                  <tr
                    key={s.id || `paid-${s.user_id}`}
                    onClick={openable ? () => setActiveId(s.id) : undefined}
                    className={`border-t border-stroke ${openable ?"hover:bg-surface-1-solid cursor-pointer":""}`}
                  >
                    <td className="px-4 py-3 text-paper">{s.email}</td>
                    <td className="px-4 py-3 text-paper-dim">
                      {s.intake?.address || s.brief?.fields?.address || (openable ? "-" : "Waiting on intake")}
                    </td>
                    <td className="px-4 py-3 text-paper-dim">{tierLabel(s.paid_tier)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[s.status] || ""}`}>
                        {STATUS_LABEL[s.status] || s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-paper-dim whitespace-nowrap">{onDay(s.submitted_at)}</td>
                    <td className="px-4 py-3 text-paper-dim whitespace-nowrap">{onDay(s.work_started_at)}</td>
                    <td className="px-4 py-3 text-paper-dim">
                      {[s.report_path && "study", s.site_plan_path && "plan"].filter(Boolean).join(" + ") || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {active && <Detail key={active.id + active.updated_at} study={active} onClose={() => setActiveId(null)} onChanged={load} />}
    </div>
  );
};

// ── Support threads ─────────────────────────────────────────────────────────
// One row per customer who has written, newest first. Opening a thread marks
// the customer's messages read, so "unread" means nobody has looked yet.
const SupportThread = ({ thread, onClose, onChanged }) => {
  const [messages, setMessages] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const kind = thread.kind || "support";
  const load = () =>
    adminGet(`studies/messages?user_id=${thread.user_id}&kind=${kind}`)
      .then((d) => setMessages(d.messages))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    if (thread.unread > 0) {
      adminPost("studies/mark-read", { user_id: thread.user_id, kind })
        .then(() => onChanged())
        .catch(() => {});
    }
  }, [thread.thread_id]);

  const send = async (e) => {
    e.preventDefault();
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      await adminPost("studies/reply", { user_id: thread.user_id, body, kind });
      setReply("");
      await load();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-surface-1-solid border-l border-stroke overflow-y-auto px-6 py-6 flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-paper-dim text-xs mb-1 flex flex-wrap items-center gap-2">
              <KindPill kind={kind} /> {tierLabel(thread.paid_tier)}
            </p>
            <h2 className="font-primary font-extrabold tracking-tight text-paper text-2xl break-all">{thread.email || "Unknown account"}</h2>
            <p className="text-paper-dim text-xs mt-1">{thread.messages} message{thread.messages === 1 ? "" : "s"} · last {when(thread.last_at)}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-paper-dim hover:text-paper hover:bg-canvas" aria-label="Close">
            <FiX />
          </button>
        </div>

        <section className="bg-canvas border border-stroke rounded-2xl p-5 flex-1 flex flex-col min-h-0">
          <h3 className="text-paper text-sm font-semibold mb-3">Conversation</h3>
          <ul className="space-y-2 mb-4 flex-1 overflow-y-auto">
            {messages === null && <li className="text-paper-dim text-sm">Loading…</li>}
            {messages !== null && messages.length === 0 && <li className="text-paper-dim text-sm">No messages.</li>}
            {(messages || []).map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.author ==="admin"?"ml-auto bg-accent/15 text-paper":"bg-surface-1-solid text-paper"}`}>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className="text-[0.65rem] text-paper-dim mt-1">{m.author === "admin" ? "ADUAtlas" : "Customer"} · {when(m.created_at)}</p>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-red-700 mb-2">
              {error}
            </p>
          )}
          {thread.customer_can_read === false ? (
            <p className="text-paper-dim text-xs">
              This customer has no live Concierge plan, so there is no page where a support reply would reach them, and nothing can be sent from
              here.
            </p>
          ) : (
            <>
              <p className="text-paper-dim text-xs mb-2">
                {kind === "refund_request"
                  ? "Your reply appears with the refund request on the customer's settings page."
                  : "Your reply appears in the customer's Concierge support page."}
              </p>
              <form onSubmit={send} className="flex gap-2">
                <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the customer" aria-label="Reply" className="flex-1 bg-surface-1-solid border border-stroke rounded-lg px-3 py-2 text-paper text-sm" />
                <button type="submit" disabled={busy || !reply.trim()} className="px-3 py-2 rounded-lg bg-accent text-accent-fg disabled:opacity-60" aria-label="Send">
                  <FiSend />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

const SupportThreads = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeId, setActiveId] = useState(null);

  const load = () =>
    adminGet("studies/threads")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const threadId = (t) => t.thread_id || `${t.user_id}:${t.kind || "support"}`;
  const visible = useMemo(() => {
    const list = items || [];
    if (filter === "unread") return list.filter((t) => t.unread > 0);
    if (filter === "refunds") return list.filter((t) => t.kind === "refund_request");
    if (filter === "support") return list.filter((t) => (t.kind || "support") === "support");
    return list;
  }, [items, filter]);
  const active = (items || []).find((t) => threadId(t) === activeId) || null;
  const refundThreads = (items || []).filter((t) => t.kind === "refund_request").length;
  const unreadThreads = (items || []).filter((t) => t.unread > 0).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <p className="text-paper-dim text-sm">
          Concierge written support and refund requests, each in its own thread. {unreadThreads} thread{unreadThreads === 1 ? "" : "s"} waiting on a reply
          {refundThreads > 0 ? `, ${refundThreads} refund request${refundThreads === 1 ? "" : "s"} in all` : ""}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["all", "All"],
            ["unread", "Unread"],
            ["support", "Concierge support"],
            ["refunds", "Refund requests"],
          ].map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-xl text-xs font-medium ${filter === f ?"bg-accent text-accent-fg":"text-paper-dim hover:text-paper border border-stroke"}`}>
              {label}
            </button>
          ))}
          <button onClick={load} className="p-2 rounded-full text-paper-dim hover:text-paper border border-stroke" aria-label="Refresh">
            <FiRefreshCw />
          </button>
        </div>
      </div>

      {error && <p className="mb-6 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>}
      {items === null && !error && <p className="text-paper-dim text-sm">Loading…</p>}
      {items && visible.length === 0 && (
        <p className="text-paper-dim text-sm">{filter === "unread" ? "Nothing unread." : filter === "refunds" ? "No refund requests." : "No support messages yet."}</p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto border border-stroke rounded-2xl">
          <table className="w-full text-sm">
            <thead className="text-paper-dim text-xs text-left">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Thread</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Last message</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Unread</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={threadId(t)} data-thread-kind={t.kind || "support"} onClick={() => setActiveId(threadId(t))} className="border-t border-stroke hover:bg-surface-1-solid cursor-pointer">
                  <td className="px-4 py-3 text-paper break-all">{t.email || "-"}</td>
                  <td className="px-4 py-3">
                    <KindPill kind={t.kind || "support"} />
                  </td>
                  <td className="px-4 py-3 text-paper-dim">{tierLabel(t.paid_tier)}</td>
                  <td className="px-4 py-3 text-paper-dim max-w-md">
                    <span className="text-paper-dim/70">{t.last_author === "admin" ? "ADUAtlas: " : "Customer: "}</span>
                    <span className="line-clamp-2">{t.last_body || "-"}</span>
                  </td>
                  <td className="px-4 py-3 text-paper-dim whitespace-nowrap">{when(t.last_at)}</td>
                  <td className="px-4 py-3">
                    {t.unread > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700">{t.unread} unread</span>
                    ) : (
                      <span className="text-paper-dim text-xs">Read</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && <SupportThread key={threadId(active)} thread={{ ...active, thread_id: threadId(active) }} onClose={() => setActiveId(null)} onChanged={load} />}
    </div>
  );
};

const AdminStudies = () => {
  const [tab, setTab] = useState("studies");
  return (
    <div className="px-5 sm:px-8 lg:px-12 py-8 sm:py-10">
      <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05] mb-6">
        {tab === "studies" ? "Feasibility studies" : "Support"}
      </h1>
      <div className="inline-flex rounded-xl border border-stroke p-0.5 mb-8">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === key ?"bg-accent text-accent-fg":"text-paper-dim hover:text-paper"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "studies" ? <StudyQueue /> : <SupportThreads />}
    </div>
  );
};

export default AdminStudies;
