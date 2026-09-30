import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiArchive, FiAward, FiBarChart2, FiCheck, FiClock, FiExternalLink, FiKey, FiLink2, FiMapPin, FiPause, FiPlay, FiPlus, FiRefreshCw, FiSearch, FiShield, FiSlash, FiUserCheck, FiUserX, FiX } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";

// ADU Rules and Resources, the admin side (decisions 2l and 2m).
//
// Three surfaces and nothing resembling a general CMS, because Amy's scope in
// 2f is five things and three of them are here:
//   RULES AND RESOURCES  a structured editor for jurisdiction records, for the
//                        individual sourced provisions beneath them, and for
//                        the official resources beside them.
//   GOVERNMENT ACCOUNTS  the entities, their claims and their memberships:
//                        verify a person's authority, revoke it.
//   REVIEW QUEUE         what a government submitted beside what ADUAtlas
//                        publishes, then publish or decline with a reason.
//
// THREE STATES, NEVER BLURRED. Every field offers verified from source, source
// did not state, and not yet researched, and NOT YET RESEARCHED IS THE DEFAULT
// for anything new. Nobody is nudged into inventing a value to fill a box, and
// no field is mandatory because it exists. The server enforces the same rule,
// so a hand-built request cannot store a value under "source did not state".
//
// FOUR DATES, NEVER ONE. Effective, source checked, published or updated, and
// superseded. "Verified January 2025" and "effective January 2026" are
// different facts and this screen never lets one read as the other.
//
// AUTHORITY IS EXPLICIT, NEVER GEOGRAPHIC. The parent of a jurisdiction is
// shown so a record can be read in context. It is never editing authority: a
// state account gains nothing over a city record and a county gains nothing
// over its cities. When a submission arrives for a jurisdiction that is not the
// submitting entity's own record, this screen says so and the server refuses to
// publish it until the mismatch is acknowledged.
//
// VERIFICATION MEANS IDENTITY, NOT LEGAL CORRECTNESS. The words are "Verified
// Government Account" with the entity name beneath. They are never the
// builder's "Verified on ADUAtlas", and they never say ADUAtlas checked that a
// rule is legally right.
//
// The vocabularies come from GET /api/admin/regulatory/meta rather than from
// src/lib/regulatory.js. The server has to validate every write anyway, so its
// lists are the authority for what can be stored and this screen reads them
// from the same place, which is also why the console renders and explains
// itself on a database where migration 0012 is not applied yet.

const TABS = [
  ["rules", "Rules and resources"],
  ["government", "Government accounts"],
  ["review", "Review queue"],
  // 2p. Reviewing a government claim, verifying or rejecting identity, granting
  // explicit jurisdiction authority, and administering an education partnership.
  // Its own tab because identity and partnership are two different facts and this
  // is where the pair is worked on.
  ["partners", "Claims and partnerships"],
];

const onDay = (v) => (v ? new Date(v).toLocaleDateString() : "");
const when = (v) => (v ? new Date(v).toLocaleString() : "");

// ── shared bits, in the console's existing design language ──────────────────
const input = "mt-1 w-full bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper";
const inputRO = `${input} opacity-70 cursor-default`;
const ghostButton = "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-stroke text-sm text-paper hover:border-accent whitespace-nowrap disabled:opacity-60";
const primaryButton = "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors disabled:opacity-60";

const Field = ({ label, hint, children }) => (
  <label className="block text-sm">
    <span className="text-paper-dim text-xs">{label}</span>
    {children}
    {hint && <span className="block text-paper-dim text-[0.7rem] mt-1">{hint}</span>}
  </label>
);

const Section = ({ title, hint, right, children }) => (
  <section className="pt-5 border-t border-stroke first:pt-0 first:border-t-0 space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-paper text-sm font-semibold">{title}</h3>
        {hint && <p className="text-paper-dim text-xs mt-0.5">{hint}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

const PILL_TONE = {
  dim: "bg-stone-500/15 text-stone-700",
  accent: "bg-accent/15 text-accent",
  warn: "bg-amber-500/15 text-amber-700",
  bad: "bg-red-500/15 text-red-700",
  info: "bg-sky-500/15 text-sky-700",
};
const Pill = ({ tone = "dim", title, children }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${PILL_TONE[tone]}`}>
    {children}
  </span>
);

const Drawer = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex justify-end">
    <div className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-2xl h-full bg-surface-1-solid border-l border-stroke overflow-y-auto px-6 py-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          {subtitle && <p className="text-paper-dim text-xs mb-1">{subtitle}</p>}
          <h2 className="font-primary font-extrabold tracking-tight text-paper text-2xl">{title}</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-paper-dim hover:text-paper hover:bg-canvas" aria-label="Close">
          <FiX />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const Alert = ({ tone = "bad", children }) =>
  children ? (
    <p
      role={tone === "bad" ? "alert" : undefined}
      className={`text-sm rounded-xl px-4 py-3 ${
        tone === "bad" ? "text-red-700 bg-red-500/10 border border-red-500/30" : tone === "warn" ? "text-amber-700 bg-amber-500/10 border border-amber-500/30" : "text-paper bg-accent/10 border border-accent/30"
      }`}
    >
      {children}
    </p>
  ) : null;

// The one thing this screen must never let anyone forget: three different
// questions, three different answers, and a published rule is not permission to
// build anything.
const ScopeNote = () => (
  <p className="text-paper-dim text-xs leading-relaxed max-w-3xl">
    This database says what the relevant governments currently publish. It is not a statement about a particular property,
    and it is not a permit determination. Parcel, zoning, overlays, easements, utilities and local interpretation decide
    what a specific lot can do, and only the jurisdiction approves a real project.
  </p>
);

// ── the three field states ──────────────────────────────────────────────────
const STATE_TONE = { verified_from_source: "accent", source_did_not_state: "info", not_yet_researched: "dim" };
const STATE_HELP = {
  verified_from_source: "ADUAtlas read this in an authoritative source and recorded the source and the date it was checked.",
  source_did_not_state: "ADUAtlas read the source and the source does not address this. That is a fact worth recording, and it carries no value.",
  not_yet_researched: "Nobody has looked yet. It carries no value, no source and no dates, and the homeowner page says so plainly.",
};

const FieldStatePicker = ({ meta, value, onChange }) => (
  <div>
    <span className="text-paper-dim text-xs">What ADUAtlas knows about this field</span>
    <div className="mt-1 flex flex-wrap gap-2">
      {meta.field_states.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${
            value === key ? "bg-accent text-accent-fg border-accent" : "border-stroke text-paper-dim hover:text-paper"
          }`}
        >
          {meta.field_state_labels[key]}
        </button>
      ))}
    </div>
    <p className="text-paper-dim text-[0.7rem] mt-1.5 leading-relaxed">{STATE_HELP[value]}</p>
  </div>
);

const FieldStatePill = ({ meta, state }) => (
  <Pill tone={STATE_TONE[state] || "dim"} title={STATE_HELP[state]}>
    {meta.field_state_labels[state] || state}
  </Pill>
);

// ── who checked it: the record's verification status (DEF-04) ───────────────
// A different question from the field state. The field state says what the
// source says; this says whether a person at ADUAtlas opened that source. The
// values and their labels come from the API (meta.record_verification_statuses),
// never a list of our own.
const VERIFICATION_HELP = {
  unverified: "Nobody at ADUAtlas has opened the cited source to check this yet.",
  source_checked: "You, or someone at ADUAtlas, opened the cited source and it says this.",
  disputed: "Another official source disagrees. The homeowner page shows the disagreement instead of picking a side.",
};
const VERIFICATION_TONE = { unverified: "warn", source_checked: "accent", disputed: "bad" };

// The status a record should carry after its field state changes, unless the
// admin has already chosen one in this form. Moving a field from "not yet
// researched" to a researched state means the admin is entering the source and
// the date she checked it right now, so it starts as checked. Moving it back
// means nobody has checked anything.
const verificationAfter = (fromState, toState, current, chosen) => {
  if (toState === "not_yet_researched") return "unverified";
  if (fromState === "not_yet_researched" && !chosen) return "source_checked";
  return current || "unverified";
};

const VerificationPicker = ({ meta, value, disabled, onChange }) => {
  const options = meta.record_verification_statuses || [];
  const labels = meta.record_verification_status_labels || {};
  return (
    <Field label="Checked by ADUAtlas" hint={disabled ? "Nothing has been researched, so nothing has been checked." : VERIFICATION_HELP[value]}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={disabled ? inputRO : input}>
        {options.map((v) => (
          <option key={v} value={v}>
            {labels[v] || v}
          </option>
        ))}
      </select>
    </Field>
  );
};

const VerificationPill = ({ meta, status }) =>
  status ? (
    <Pill tone={VERIFICATION_TONE[status] || "dim"} title={VERIFICATION_HELP[status]}>
      {(meta.record_verification_status_labels || {})[status] || status}
    </Pill>
  ) : null;

// Provenance, stated the way 2m requires: an official website used as a source
// is NOT the government taking part in ADUAtlas.
const ProvenanceLine = ({ meta, row, entityName }) =>
  row.supplied_by === "government_account" ? (
    <span className="text-paper-dim text-xs">Provided by verified government account{entityName ? `: ${entityName}` : ""}</span>
  ) : (
    <span className="text-paper-dim text-xs">
      Source: {row.source_type ? meta.source_type_labels[row.source_type] || row.source_type : "official government source"}
    </span>
  );

// ── history ─────────────────────────────────────────────────────────────────
const History = ({ targetKind, targetId }) => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const load = () =>
    adminGet(`regulatory/versions?target_kind=${targetKind}&target_id=${targetId}`)
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));

  return (
    <div className="mt-3">
      <button
        type="button"
        className="text-xs text-accent hover:underline underline-offset-2"
        onClick={() => {
          setOpen((v) => !v);
          if (!items) load();
        }}
      >
        {open ? "Hide history" : "History"}
      </button>
      {open && (
        <div className="mt-2 bg-canvas border border-stroke rounded-xl p-3">
          {error && <p className="text-red-700 text-xs">{error}</p>}
          {!items && !error && <p className="text-paper-dim text-xs">Loading…</p>}
          {items && items.length === 0 && <p className="text-paper-dim text-xs">No earlier version recorded.</p>}
          <ul className="space-y-1.5">
            {(items || []).map((v) => (
              <li key={v.id} className="text-xs text-paper-dim">
                <span className="text-paper">v{v.version}</span> · {when(v.created_at)}
                {v.change_note ? ` · ${v.change_note}` : ""}
                {v.source === "government_submission" ? " · from a government submission" : ""}
              </li>
            ))}
          </ul>
          <p className="text-paper-dim text-[0.7rem] mt-2">Earlier versions are kept. Nothing here overwrites one.</p>
        </div>
      )}
    </div>
  );
};

// ── retiring a record: two different facts ─────────────────────────────────
// A rule or a resource that no longer applies is KEPT, and the console asks which
// of two different facts is true (2m), because they blame different parties:
//   Superseded  the government replaced or repealed it, on a date.
//   Retracted   ADUAtlas's own record was wrong, and the reason is recorded.
// The server requires the date for the first and the reason for the second, and
// refuses a retirement it cannot record before writing anything.
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const RetirePanel = ({ noun, record, busy, onRetire, children }) => {
  const [how, setHow] = useState("");
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const status = record.review_status;
  const retracted = status === "retracted";
  const superseded = status === "superseded";
  const name = `retire-${record.id}`;
  return (
    <Section
      title={`Retire this ${noun}`}
      hint={`A ${noun} that no longer applies is kept, never deleted: the version history and anyone who read it still need it. Say which of two different facts is true.`}
    >
      {superseded && (
        <p className="text-paper-dim text-xs">
          Superseded or repealed on {record.superseded_or_repealed_date || record.superseded_date || "a date not recorded"}. If ADUAtlas's record was
          wrong all along, retract it as well, with the reason.
        </p>
      )}
      {retracted && (
        <p className="text-paper-dim text-xs">
          Retracted by ADUAtlas{record.retracted_at ? ` on ${onDay(record.retracted_at)}` : ""}.
          {record.retraction_reason ? ` Reason: ${record.retraction_reason}` : " No reason was recorded."}
        </p>
      )}
      {!retracted && (
        <div className="space-y-4">
          <div className="space-y-2">
            {!superseded && (
              <label className="flex items-start gap-2 text-sm text-paper">
                <input type="radio" name={name} checked={how === "supersede"} onChange={() => setHow("supersede")} className="mt-1" />
                <span>
                  The government changed it
                  <span className="block text-paper-dim text-xs">Superseded or repealed by the jurisdiction, on the date it happened.</span>
                </span>
              </label>
            )}
            <label className="flex items-start gap-2 text-sm text-paper">
              <input type="radio" name={name} checked={how === "retract"} onChange={() => setHow("retract")} className="mt-1" />
              <span>
                ADUAtlas's record was wrong
                <span className="block text-paper-dim text-xs">Retracted by ADUAtlas, with the reason. The government did nothing.</span>
              </span>
            </label>
          </div>
          {how === "supersede" && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Superseded or repealed on" hint="Not in the future: a repeal that has not happened yet is recorded on the day it happens.">
                  <input type="date" value={day} max={localDay()} onChange={(e) => setDay(e.target.value)} className={input} />
                </Field>
                <Field label="What replaced it" hint="Optional. For ADUAtlas.">
                  <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
                </Field>
              </div>
              <button type="button" onClick={() => onRetire({ action: "supersede", superseded_date: day, note })} disabled={!day || busy} className={ghostButton}>
                <FiArchive /> {busy ? "Saving…" : "Record as superseded"}
              </button>
            </div>
          )}
          {how === "retract" && (
            <div className="space-y-3">
              <Field label="Why ADUAtlas's record was wrong" hint="Required. Internal: no homeowner page shows it.">
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
              </Field>
              <button type="button" onClick={() => onRetire({ action: "retract", reason })} disabled={!reason.trim() || busy} className={ghostButton}>
                <FiArchive /> {busy ? "Saving…" : "Retract"}
              </button>
            </div>
          )}
        </div>
      )}
      {children}
    </Section>
  );
};
const reviewTone = (status) => (status === "published" ? "accent" : status === "superseded" || status === "retracted" ? "dim" : "warn");

// ── provision editor ────────────────────────────────────────────────────────
const emptyProvision = (meta) => ({
  topic: "",
  field_state: meta.default_field_state,
  value_text: "",
  // Recorded on a rule (a government submission carries them) but not edited
  // here. The form carries them through a save unchanged, because a field the
  // save leaves out is cleared by the server.
  value_numeric: "",
  value_unit: "",
  value_boolean: "",
  value_qualifier: "",
  source_citation: "",
  source_url: "",
  source_document_title: "",
  source_type: "",
  effective_date: "",
  source_checked_date: "",
  superseded_date: "",
  verification_status: "unverified",
  review_status: "draft",
  notes: "",
});

const ProvisionDrawer = ({ meta, jurisdiction, provision, entity, onClose, onSaved }) => {
  const [f, setF] = useState(() => (provision ? { ...emptyProvision(meta), ...stripNulls(provision) } : emptyProvision(meta)));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  // Whether the admin picked the verification status herself in this form. Until
  // she does, a field state change may set the sensible starting value.
  const [vsChosen, setVsChosen] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const verified = f.field_state === "verified_from_source";
  const researched = f.field_state !== "not_yet_researched";

  // Changing the state clears what that state cannot carry, so the screen and
  // the stored row always agree.
  const setState = (state) =>
    setF((p) => ({
      ...p,
      field_state: state,
      value_text: state === "verified_from_source" ? p.value_text : "",
      value_numeric: state === "verified_from_source" ? p.value_numeric : "",
      value_unit: state === "verified_from_source" ? p.value_unit : "",
      value_boolean: state === "verified_from_source" ? p.value_boolean : "",
      value_qualifier: state === "verified_from_source" ? p.value_qualifier : "",
      source_citation: state === "not_yet_researched" ? "" : p.source_citation,
      effective_date: state === "verified_from_source" ? p.effective_date : "",
      superseded_date: state === "verified_from_source" ? p.superseded_date : "",
      source_url: state === "not_yet_researched" ? "" : p.source_url,
      source_type: state === "not_yet_researched" ? "" : p.source_type,
      source_document_title: state === "not_yet_researched" ? "" : p.source_document_title,
      source_checked_date: state === "not_yet_researched" ? "" : p.source_checked_date,
      verification_status: verificationAfter(p.field_state, state, p.verification_status, vsChosen),
    }));

  const save = async () => {
    setBusy("save");
    setError("");
    setWarning("");
    try {
      const out = await adminPost("regulatory/provision-save", {
        // Only the fields this form owns. published_updated_date is NOT sent:
        // the server stamps the date it changed its own record, and echoing
        // the stored value back would freeze it at the last edit.
        provision: {
          id: provision?.id,
          jurisdiction_id: jurisdiction.id,
          topic: f.topic,
          field_state: f.field_state,
          value_text: f.value_text,
          value_numeric: f.value_numeric,
          value_unit: f.value_unit,
          value_boolean: f.value_boolean,
          value_qualifier: f.value_qualifier,
          source_citation: f.source_citation,
          source_url: f.source_url,
          source_document_title: f.source_document_title,
          source_type: f.source_type,
          effective_date: f.effective_date,
          source_checked_date: f.source_checked_date,
          superseded_date: f.superseded_date,
          // Always sent, so a save states what Amy sees on screen. The server
          // also keeps the stored value when an older client sends nothing.
          verification_status: f.verification_status,
          review_status: f.review_status,
          notes: f.notes,
        },
      });
      if (out.warning) setWarning(out.warning);
      await onSaved();
      if (!out.warning) onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const retire = async (how) => {
    setBusy("retire");
    setError("");
    try {
      await adminPost("regulatory/provision-retire", { id: provision.id, ...how });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <Drawer
      title={provision ? meta.provision_topic_labels[provision.topic] || provision.topic : "Add a provision"}
      subtitle={`${jurisdiction.name} · one sourced rule, not a page of them`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <Section title="The rule" hint="One provision is one rule. Add a second row rather than writing two rules into one.">
          <Field label="Topic">
            <select value={f.topic} onChange={(e) => set("topic", e.target.value)} className={input}>
              <option value="">Choose a topic</option>
              {meta.provision_topics.map((t) => (
                <option key={t} value={t}>
                  {meta.provision_topic_labels[t] || t}
                </option>
              ))}
            </select>
          </Field>

          <FieldStatePicker meta={meta} value={f.field_state} onChange={setState} />

          <Field
            label="What the source states"
            hint={verified ? "In the source's own terms. No rounding, no interpretation." : "Only a field verified from a source carries a value."}
          >
            <textarea
              rows={3}
              value={f.value_text}
              disabled={!verified}
              onChange={(e) => set("value_text", e.target.value)}
              className={verified ? input : inputRO}
              placeholder={verified ? "1,000 sq ft maximum, or 4 ft side and rear setback" : ""}
            />
          </Field>
          <AlsoRecorded
            items={[
              ["Number", f.value_numeric === "" ? "" : `${f.value_numeric}${f.value_unit ? ` ${f.value_unit}` : ""}`],
              ["Yes or no", f.value_boolean === "" ? "" : f.value_boolean ? "Yes" : "No"],
              ["Qualifier", f.value_qualifier],
              ["Citation", f.source_citation],
            ]}
          />
        </Section>

        <Section
          title="Source"
          hint="A city, county or state government, an official planning or zoning department, or official code or ordinance. Never a blog, a lead site, builder marketing or an AI summary."
        >
          <Field label="Official source URL">
            <input
              type="url"
              value={f.source_url}
              disabled={!researched}
              onChange={(e) => set("source_url", e.target.value)}
              className={researched ? input : inputRO}
              placeholder="https://"
            />
          </Field>
          <Field label="Source document title" hint="Optional. The ordinance or page as it names itself.">
            <input
              value={f.source_document_title}
              disabled={!researched}
              onChange={(e) => set("source_document_title", e.target.value)}
              className={researched ? input : inputRO}
            />
          </Field>
          <Field label="Source type">
            <select value={f.source_type} disabled={!researched} onChange={(e) => set("source_type", e.target.value)} className={researched ? input : inputRO}>
              <option value="">Not recorded</option>
              {meta.source_types.map((t) => (
                <option key={t} value={t}>
                  {meta.source_type_labels[t] || t}
                </option>
              ))}
            </select>
          </Field>
          <VerificationPicker
            meta={meta}
            value={f.verification_status}
            disabled={!researched}
            onChange={(v) => {
              setVsChosen(true);
              set("verification_status", v);
            }}
          />
          {provision && (
            <p className="text-paper-dim text-xs">
              <ProvenanceLine meta={meta} row={provision} entityName={entity?.name} />
            </p>
          )}
        </Section>

        <Section title="The four dates" hint="They mean different things and none of them stands in for another.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Effective date" hint="When the rule legally took effect.">
              <input type="date" value={f.effective_date} disabled={!verified} onChange={(e) => set("effective_date", e.target.value)} className={verified ? input : inputRO} />
            </Field>
            <Field label="Source checked" hint="When ADUAtlas last looked at the source.">
              <input
                type="date"
                value={f.source_checked_date}
                disabled={!researched}
                onChange={(e) => set("source_checked_date", e.target.value)}
                className={researched ? input : inputRO}
              />
            </Field>
            <Field label="ADUAtlas record updated" hint="Stamped when you save. It is not a statement about the law.">
              <input value={provision?.published_updated_date || "Stamped on save"} readOnly className={inputRO} />
            </Field>
            <Field label="Superseded or repealed" hint="Set this from Retire below rather than by hand.">
              <input value={f.superseded_date || "Not superseded"} readOnly className={inputRO} />
            </Field>
          </div>
        </Section>

        <Section title="Publication" hint="Draft is invisible to homeowners. Published is the record the public page reads.">
          <Field label="Review status">
            <select value={f.review_status} onChange={(e) => set("review_status", e.target.value)} className={input}>
              {meta.review_statuses.map((s) => (
                <option key={s} value={s}>
                  {meta.review_status_labels[s] || s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Internal note" hint="For ADUAtlas. Not a homeowner surface.">
            <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={input} />
          </Field>
        </Section>

        <Alert tone="warn">{warning}</Alert>
        <Alert>{error}</Alert>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={busy === "save"} className={primaryButton}>
            {busy === "save" ? "Saving…" : provision ? "Save provision" : "Add provision"}
          </button>
          <span className="text-paper-dim text-xs">Nothing here is required. A field you cannot answer stays not yet researched.</span>
        </div>

        {provision && (
          <RetirePanel noun="rule" record={provision} busy={busy === "retire"} onRetire={retire}>
            <History targetKind="provision" targetId={provision.id} />
          </RetirePanel>
        )}
      </div>
    </Drawer>
  );
};

// What a record carries that this form shows but does not edit. Kept visible so
// a save never looks like it could not have touched them.
const AlsoRecorded = ({ items }) => {
  const shown = items.filter(([, v]) => v !== "" && v !== null && v !== undefined);
  if (!shown.length) return null;
  return (
    <div className="text-paper-dim text-xs">
      <p>Also recorded on this record, and kept as it is when you save:</p>
      <ul className="mt-1 space-y-0.5">
        {shown.map(([k, v]) => (
          <li key={k}>
            {k}: <span className="text-paper">{String(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// An empty string is what a text input holds; null is what the database holds.
// Turning nulls into empty strings on the way in keeps React inputs controlled
// without turning "not recorded" into a value.
function stripNulls(row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? "" : v]));
}

// ── resource editor ─────────────────────────────────────────────────────────
const emptyResource = (meta) => ({
  kind: "",
  title: "",
  url: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  // Recorded on a resource (a government submission carries them) but not
  // edited here, and carried through a save unchanged.
  contact_title: "",
  department_name: "",
  address: "",
  hours: "",
  effective_date: "",
  field_state: meta.default_field_state,
  source_url: "",
  source_type: "",
  source_checked_date: "",
  verification_status: "unverified",
  review_status: "draft",
  notes: "",
});

const ResourceDrawer = ({ meta, jurisdiction, resource, entity, onClose, onSaved }) => {
  const [f, setF] = useState(() => (resource ? { ...emptyResource(meta), ...stripNulls(resource) } : emptyResource(meta)));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [vsChosen, setVsChosen] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const verified = f.field_state === "verified_from_source";
  const researched = f.field_state !== "not_yet_researched";

  const setState = (state) =>
    setF((p) => ({
      ...p,
      field_state: state,
      url: state === "verified_from_source" ? p.url : "",
      contact_name: state === "verified_from_source" ? p.contact_name : "",
      contact_phone: state === "verified_from_source" ? p.contact_phone : "",
      contact_email: state === "verified_from_source" ? p.contact_email : "",
      source_url: state === "not_yet_researched" ? "" : p.source_url,
      source_type: state === "not_yet_researched" ? "" : p.source_type,
      source_checked_date: state === "not_yet_researched" ? "" : p.source_checked_date,
      verification_status: verificationAfter(p.field_state, state, p.verification_status, vsChosen),
    }));

  const save = async () => {
    setBusy("save");
    setError("");
    setWarning("");
    try {
      const out = await adminPost("regulatory/resource-save", {
        // Same rule as a provision: the server stamps the record's own date.
        resource: {
          id: resource?.id,
          jurisdiction_id: jurisdiction.id,
          kind: f.kind,
          title: f.title,
          url: f.url,
          contact_name: f.contact_name,
          contact_phone: f.contact_phone,
          contact_email: f.contact_email,
          contact_title: f.contact_title,
          department_name: f.department_name,
          address: f.address,
          hours: f.hours,
          effective_date: f.effective_date,
          field_state: f.field_state,
          // Where ADUAtlas found it. A published resource needs it (DEF-12).
          source_url: f.source_url,
          source_type: f.source_type,
          source_checked_date: f.source_checked_date,
          verification_status: f.verification_status,
          review_status: f.review_status,
          notes: f.notes,
        },
      });
      if (out.warning) setWarning(out.warning);
      await onSaved();
      if (!out.warning) onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const retire = async (how) => {
    setBusy("retire");
    setError("");
    try {
      await adminPost("regulatory/resource-retire", { id: resource.id, ...how });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <Drawer
      title={resource ? meta.resource_kind_labels[resource.kind] || resource.kind : "Add a government resource"}
      subtitle={`${jurisdiction.name} · resources are first class, beside the rules`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <Section title="The resource" hint="The official page, form, map, handbook, portal or contact a homeowner needs.">
          <Field label="Kind">
            <select value={f.kind} onChange={(e) => set("kind", e.target.value)} className={input}>
              <option value="">Choose a kind</option>
              {meta.resource_kinds.map((k) => (
                <option key={k} value={k}>
                  {meta.resource_kind_labels[k] || k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label" hint="Optional. What the jurisdiction calls it.">
            <input value={f.title} onChange={(e) => set("title", e.target.value)} className={input} />
          </Field>
          <FieldStatePicker meta={meta} value={f.field_state} onChange={setState} />
          <Field label="Official link" hint={verified ? "The government's own page, not a copy of it." : "Only a resource verified from source carries a link."}>
            <input type="url" value={f.url} disabled={!verified} onChange={(e) => set("url", e.target.value)} className={verified ? input : inputRO} placeholder="https://" />
          </Field>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Contact name">
              <input value={f.contact_name} disabled={!verified} onChange={(e) => set("contact_name", e.target.value)} className={verified ? input : inputRO} />
            </Field>
            <Field label="Official phone">
              <input value={f.contact_phone} disabled={!verified} onChange={(e) => set("contact_phone", e.target.value)} className={verified ? input : inputRO} />
            </Field>
            <Field label="Official email">
              <input type="email" value={f.contact_email} disabled={!verified} onChange={(e) => set("contact_email", e.target.value)} className={verified ? input : inputRO} />
            </Field>
          </div>
          <AlsoRecorded
            items={[
              ["Contact title", f.contact_title],
              ["Department", f.department_name],
              ["Address", f.address],
              ["Hours", f.hours],
              ["Effective date", f.effective_date],
            ]}
          />
        </Section>

        <Section title="Source and date" hint="A resource is sourced like a rule. To publish it, record the page where you found it and the date you checked it.">
          <Field label="Where ADUAtlas found it" hint="The official page that lists this resource. For a resource the jurisdiction does not publish, the page you read.">
            <input
              type="url"
              value={f.source_url}
              disabled={!researched}
              onChange={(e) => set("source_url", e.target.value)}
              className={researched ? input : inputRO}
              placeholder="https://"
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Source type">
              <select value={f.source_type} disabled={!researched} onChange={(e) => set("source_type", e.target.value)} className={researched ? input : inputRO}>
                <option value="">Not recorded</option>
                {meta.source_types.map((t) => (
                  <option key={t} value={t}>
                    {meta.source_type_labels[t] || t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source checked" hint="When ADUAtlas last opened it.">
              <input
                type="date"
                value={f.source_checked_date}
                disabled={!researched}
                onChange={(e) => set("source_checked_date", e.target.value)}
                className={researched ? input : inputRO}
              />
            </Field>
          </div>
          <VerificationPicker
            meta={meta}
            value={f.verification_status}
            disabled={!researched}
            onChange={(v) => {
              setVsChosen(true);
              set("verification_status", v);
            }}
          />
          {resource && (
            <p className="text-paper-dim text-xs">
              <ProvenanceLine meta={meta} row={resource} entityName={entity?.name} /> · ADUAtlas record updated {resource.published_updated_date || "not recorded"}
            </p>
          )}
        </Section>

        <Section title="Publication">
          <Field label="Review status">
            <select value={f.review_status} onChange={(e) => set("review_status", e.target.value)} className={input}>
              {meta.review_statuses.map((s) => (
                <option key={s} value={s}>
                  {meta.review_status_labels[s] || s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Internal note">
            <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={input} />
          </Field>
        </Section>

        <Alert tone="warn">{warning}</Alert>
        <Alert>{error}</Alert>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={busy === "save"} className={primaryButton}>
            {busy === "save" ? "Saving…" : resource ? "Save resource" : "Add resource"}
          </button>
        </div>
        {resource && (
          <RetirePanel noun="resource" record={resource} busy={busy === "retire"} onRetire={retire}>
            <History targetKind="resource" targetId={resource.id} />
          </RetirePanel>
        )}
      </div>
    </Drawer>
  );
};

// ── jurisdiction editor ─────────────────────────────────────────────────────
// ONLY WHAT THE SCHEMA STORES (R3-13). 0012 gives a jurisdiction its type, parent,
// name, official name, slug, publication and one public note, and nothing else. A
// county is its own jurisdiction record, which a city sits inside. The website,
// permit page, zoning map and contacts are Resources, one sourced row each.
// Coverage is DERIVED from the published rules every time it is asked for (2l),
// so it is shown here and never typed in. The form used to offer County, Official
// website and Research state as inputs, accept what Amy typed, and store none of
// it; they are gone rather than kept as inputs that go nowhere.
//
// The default type is a REAL option. The form used to hold "city", which is not
// in the vocabulary, so the select fell back to its first option and showed
// Country while the server saved a municipality.
const STATE_LEVEL_FALLBACK = ["state", "federal_district", "territory"];
const emptyJurisdiction = (defaults) => ({
  type: "municipality",
  name: "",
  slug: "",
  state_code: "",
  official_name: "",
  parent_id: "",
  is_published: false,
  notes: "",
  ...defaults,
});

// Coverage as the server derives it: the topics with a published answer against
// the topics tracked, with no invented threshold.
const coverageText = (meta, provisions) => {
  const answered = new Set((provisions || []).filter((p) => p.is_published).map((p) => p.topic_key || p.topic)).size;
  const tracked = (meta.provision_topics || []).length;
  if (!answered) return "Not researched: nothing published yet";
  if (tracked && answered >= tracked) return "Researched: every tracked topic has a published answer";
  return `In progress: ${answered} of ${tracked} topics have a published answer`;
};

const JurisdictionForm = ({ meta, value, parents, coverage, onChange, children }) => {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const stateLevel = (meta.state_level_types || STATE_LEVEL_FALLBACK).includes(value.type);
  // There is one country row, the root of the tree, so a new record is never one.
  const types = meta.jurisdiction_types.filter((t) => t !== "country" || value.type === "country");
  const parentState = parents.find((p) => p.id === value.parent_id)?.state_code || value.state_code || "";
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Type" hint="Geography and display. It is not editing authority.">
          <select value={value.type} onChange={(e) => set("type", e.target.value)} className={input}>
            {types.map((t) => (
              <option key={t} value={t}>
                {meta.jurisdiction_type_labels[t] || t}
              </option>
            ))}
          </select>
        </Field>
        {stateLevel ? (
          <Field label="State" hint="A state, district or territory carries its own two-letter code.">
            <select value={value.state_code} onChange={(e) => set("state_code", e.target.value)} className={input}>
              <option value="">Choose a state</option>
              {Object.entries(meta.us_states).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="State" hint="Taken from the record this one sits inside.">
            <input value={parentState ? meta.us_states[parentState] || parentState : "Set by Sits inside"} readOnly className={inputRO} />
          </Field>
        )}
      </div>
      <Field label="Name" hint="What a homeowner would search for.">
        <input value={value.name} onChange={(e) => set("name", e.target.value)} className={input} />
      </Field>
      <Field label="Official jurisdiction name" hint="Optional. The legal name, for example City of Phoenix, Arizona.">
        <input value={value.official_name} onChange={(e) => set("official_name", e.target.value)} className={input} />
      </Field>
      {value.type !== "country" && (
        <Field label="Sits inside" hint="Context for the reader, and where the state comes from. It grants nobody any authority. A county is its own record: add the county, then choose it here.">
          <select value={value.parent_id} onChange={(e) => set("parent_id", e.target.value)} className={input}>
            <option value="">Choose the record it sits inside</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({meta.jurisdiction_type_labels[p.type] || p.type})
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Research coverage" hint="Counted from the published rules every time. It is never typed in.">
          <input value={coverage} readOnly className={inputRO} />
        </Field>
        <Field label="Public page" hint="A page is published where there is enough verified content to justify one.">
          <select value={value.is_published ? "yes" : "no"} onChange={(e) => set("is_published", e.target.value === "yes")} className={input}>
            <option value="no">Not published</option>
            <option value="yes">Published</option>
          </select>
        </Field>
      </div>
      <Field
        label="Note shown on the public page"
        hint="Optional, and PUBLIC. Homeowners see it on this jurisdiction's page in place of the standard sentence that requirements are not verified yet. Leave it empty to use the standard sentence. Not for internal notes."
      >
        <textarea rows={2} value={value.notes} onChange={(e) => set("notes", e.target.value)} className={input} />
      </Field>
      <p className="text-paper-dim text-xs">
        The official website, permit page, zoning map and contacts are Resources, each with its own source and checked date. Add them under
        Resources once the record exists.
      </p>
      {children}
    </div>
  );
};

// A new entity's type follows the jurisdiction it represents, from the entity
// vocabulary, so the select shows what will be saved.
const ENTITY_TYPE_FOR = { municipality: "city", county: "county", state: "state", federal_district: "state", territory: "state", tribal: "tribal", special_district: "special_district" };
const entityTypeFor = (meta, jurisdictionType) => {
  const t = ENTITY_TYPE_FOR[jurisdictionType] || "other";
  return meta.entity_types.includes(t) ? t : meta.entity_types[0];
};

const JurisdictionDrawer = ({ meta, id: openedId, defaults, parents, onClose, onSaved }) => {
  // The record this drawer shows. A drawer opened to ADD a jurisdiction moves onto
  // the new record when the server answers with a warning, so the warning stays
  // on screen next to what it is about instead of vanishing with the drawer.
  const [id, setId] = useState(openedId);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(() => emptyJurisdiction(defaults));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [provision, setProvision] = useState(null); // {} for a new one, row for an edit
  const [resource, setResource] = useState(null);
  const [entityForm, setEntityForm] = useState(null);

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    return adminGet(`regulatory/jurisdiction?id=${id}`)
      .then((d) => {
        setDetail(d);
        setForm({ ...emptyJurisdiction({}), ...stripNulls(d.jurisdiction), is_published: Boolean(d.jurisdiction.is_published) });
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Only the columns 0012 stores, each sent once, under the column's own name.
  // The loaded row carries the note twice (research_note and the older alias
  // notes), and the server reads research_note first, so the edit travels as
  // research_note and the alias is never sent beside it.
  const save = async () => {
    setBusy("save");
    setError("");
    setWarning("");
    const stateLevel = (meta.state_level_types || STATE_LEVEL_FALLBACK).includes(form.type);
    try {
      const out = await adminPost("regulatory/jurisdiction-save", {
        jurisdiction: {
          id,
          type: form.type,
          name: form.name,
          slug: form.slug,
          ...(stateLevel ? { state_code: form.state_code } : {}),
          official_name: form.official_name,
          parent_id: form.type === "country" ? "" : form.parent_id,
          is_published: form.is_published,
          research_note: form.notes,
        },
      });
      if (out.warning) setWarning(out.warning);
      await onSaved();
      if (id) await load();
      else if (out.warning && out.jurisdiction?.id) setId(out.jurisdiction.id);
      else onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  // The entity form edits the website under the COLUMN's name and sends only the
  // fields it owns (R3-09). It used to be seeded with the whole stored row, which
  // carries the website twice (official_website_url and website_url), while the
  // input edited only website_url, so the stale copy was the one saved.
  const saveEntity = async () => {
    setBusy("entity");
    setError("");
    setWarning("");
    try {
      const out = await adminPost("regulatory/entity-save", {
        entity: {
          id: detail?.entity?.id,
          jurisdiction_id: id,
          name: entityForm.name,
          entity_type: entityForm.entity_type,
          official_website_url: entityForm.official_website_url,
          official_domains: entityForm.official_domains,
        },
      });
      if (out.warning) setWarning(out.warning);
      setEntityForm(null);
      await load();
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const j = detail?.jurisdiction || { id, name: form.name || "New jurisdiction" };
  const provisions = detail?.provisions || [];
  const resources = detail?.resources || [];

  return (
    <Drawer
      title={id ? j.name : "Add a jurisdiction"}
      subtitle={id ? [meta.jurisdiction_type_labels[j.type] || j.type, detail?.parent ? `inside ${detail.parent.name}` : null].filter(Boolean).join(" · ") : "Nationwide by design, filled in progressively"}
      onClose={onClose}
    >
      <div className="space-y-6">
        <Section title="The record">
          <JurisdictionForm meta={meta} value={form} parents={parents.filter((p) => p.id !== id)} coverage={coverageText(meta, detail?.provisions)} onChange={setForm} />
          <Alert tone="warn">{warning}</Alert>
          <Alert>{error}</Alert>
          <button type="button" onClick={save} disabled={busy === "save"} className={primaryButton}>
            {busy === "save" ? "Saving…" : id ? "Save jurisdiction" : "Create jurisdiction"}
          </button>
        </Section>

        {id && (
          <>
            <Section
              title={`Provisions (${provisions.length})`}
              hint="Individual sourced rules. Never one blob for a whole city."
              right={
                <button type="button" onClick={() => setProvision({})} className={ghostButton}>
                  <FiPlus /> Add
                </button>
              }
            >
              {provisions.length === 0 && (
                <p className="text-paper-dim text-sm">
                  Nothing recorded yet. That is what the homeowner page will say: ADUAtlas has not verified detailed requirements for
                  this jurisdiction, check with the local planning or zoning department.
                </p>
              )}
              <ul className="space-y-2">
                {provisions.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setProvision(p)}
                      className="w-full text-left bg-canvas border border-stroke rounded-xl px-4 py-3 hover:border-accent"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-paper text-sm font-medium">{meta.provision_topic_labels[p.topic] || p.topic}</span>
                        <FieldStatePill meta={meta} state={p.field_state} />
                        {p.field_state !== "not_yet_researched" && <VerificationPill meta={meta} status={p.verification_status} />}
                        <Pill tone={reviewTone(p.review_status)}>
                          {meta.review_status_labels[p.review_status] || p.review_status}
                        </Pill>
                        {p.supplied_by === "government_account" && <Pill tone="info">From a government account</Pill>}
                      </div>
                      {p.value_text && <p className="text-paper-dim text-sm mt-1 line-clamp-2">{p.value_text}</p>}
                      <p className="text-paper-dim text-[0.7rem] mt-1">
                        {p.effective_date ? `Effective ${p.effective_date}. ` : ""}
                        {p.source_checked_date ? `Source checked ${p.source_checked_date}. ` : ""}
                        {p.published_updated_date ? `Record updated ${p.published_updated_date}.` : ""}
                        {p.superseded_date ? ` Superseded ${p.superseded_date}.` : ""}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title={`Resources (${resources.length})`}
              hint="Official pages, forms, maps, handbooks, portals and contacts."
              right={
                <button type="button" onClick={() => setResource({})} className={ghostButton}>
                  <FiPlus /> Add
                </button>
              }
            >
              {resources.length === 0 && <p className="text-paper-dim text-sm">No official resources recorded yet.</p>}
              <ul className="space-y-2">
                {resources.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setResource(r)}
                      className="w-full text-left bg-canvas border border-stroke rounded-xl px-4 py-3 hover:border-accent"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-paper text-sm font-medium">{meta.resource_kind_labels[r.kind] || r.kind}</span>
                        <FieldStatePill meta={meta} state={r.field_state} />
                        {r.field_state !== "not_yet_researched" && <VerificationPill meta={meta} status={r.verification_status} />}
                        <Pill tone={reviewTone(r.review_status)}>
                          {meta.review_status_labels[r.review_status] || r.review_status}
                        </Pill>
                      </div>
                      {r.title && <p className="text-paper-dim text-sm mt-1">{r.title}</p>}
                      {r.url && <p className="text-accent text-xs mt-1 break-all">{r.url}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title="Government entity"
              hint="The institution, not a login. Three states: unclaimed, claimed, verified. Claiming never verifies."
              right={
                <button
                  type="button"
                  onClick={() =>
                    setEntityForm(
                      detail?.entity
                        ? {
                            name: detail.entity.name || "",
                            entity_type: detail.entity.entity_type || entityTypeFor(meta, j.type),
                            official_website_url: detail.entity.official_website_url || "",
                            official_domains: (detail.entity.official_domains || []).join(", "),
                          }
                        : { name: j.official_name || j.name, entity_type: entityTypeFor(meta, j.type), official_website_url: "", official_domains: "" },
                    )
                  }
                  className={ghostButton}
                >
                  {detail?.entity ? "Edit" : <><FiPlus /> Create</>}
                </button>
              }
            >
              {!detail?.entity && !entityForm && (
                <p className="text-paper-dim text-sm">
                  No entity record. ADUAtlas can keep this jurisdiction's rules and resources with no government account attached,
                  and the page must not imply the government takes part.
                </p>
              )}
              {detail?.entity && <EntityCard meta={meta} entity={detail.entity} memberships={detail.memberships} onChanged={load} />}
              {entityForm && (
                <div className="bg-canvas border border-stroke rounded-2xl p-4 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Entity name" hint="For example City of Phoenix.">
                      <input value={entityForm.name} onChange={(e) => setEntityForm({ ...entityForm, name: e.target.value })} className={input} />
                    </Field>
                    <Field label="Type">
                      <select value={entityForm.entity_type} onChange={(e) => setEntityForm({ ...entityForm, entity_type: e.target.value })} className={input}>
                        {meta.entity_types.map((t) => (
                          <option key={t} value={t}>
                            {meta.entity_type_labels[t] || t}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Official website">
                    <input type="url" value={entityForm.official_website_url} onChange={(e) => setEntityForm({ ...entityForm, official_website_url: e.target.value })} className={input} placeholder="https://" />
                  </Field>
                  <Field label="Official government domains" hint="Comma separated, for example phoenix.gov. Used when checking who a person says they are.">
                    <input value={entityForm.official_domains} onChange={(e) => setEntityForm({ ...entityForm, official_domains: e.target.value })} className={input} />
                  </Field>
                  <div className="flex gap-3">
                    <button type="button" onClick={saveEntity} disabled={busy === "entity"} className={primaryButton}>
                      {busy === "entity" ? "Saving…" : "Save entity"}
                    </button>
                    <button type="button" onClick={() => setEntityForm(null)} className={ghostButton}>
                      Cancel
                    </button>
                  </div>
                  <p className="text-paper-dim text-xs">
                    Creating a record does not claim it and does not verify it. Claim status follows the people who represent it.
                  </p>
                </div>
              )}
            </Section>

            {detail?.submissions?.length > 0 && (
              <Section title="Submissions for this jurisdiction" hint="Nothing a government submits reaches the public before you act.">
                <ul className="space-y-1.5">
                  {detail.submissions.map((s) => (
                    <li key={s.id} className="text-xs text-paper-dim">
                      {onDay(s.created_at)} · {s.target_kind} · {meta.submission_status_labels[s.status] || s.status}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>

      {provision && (
        <ProvisionDrawer
          meta={meta}
          jurisdiction={j}
          entity={detail?.entity}
          provision={provision.id ? provision : null}
          onClose={() => setProvision(null)}
          onSaved={async () => {
            await load();
            await onSaved();
          }}
        />
      )}
      {resource && (
        <ResourceDrawer
          meta={meta}
          jurisdiction={j}
          entity={detail?.entity}
          resource={resource.id ? resource : null}
          onClose={() => setResource(null)}
          onSaved={async () => {
            await load();
            await onSaved();
          }}
        />
      )}
    </Drawer>
  );
};

// ── government entity card: claims, verification, revocation ────────────────
const ClaimPill = ({ meta, status }) =>
  status === "verified" ? (
    <Pill tone="accent" title="ADUAtlas confirmed this account is authorised to represent the entity. It is not a statement that the information is legally correct.">
      <FiShield aria-hidden /> Verified Government Account
    </Pill>
  ) : (
    <Pill tone={status === "claimed" ? "warn" : "dim"}>{meta.claim_status_labels[status] || status}</Pill>
  );

const EntityCard = ({ meta, entity, memberships, onChanged }) => {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [verifyFor, setVerifyFor] = useState(null);
  const [verifyForm, setVerifyForm] = useState({ checked: "", method: "" });
  const [revokeFor, setRevokeFor] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");

  const status = entity.claim_status || "unclaimed";
  const live = (memberships || []).filter((m) => !m.revoked_at);
  const revoked = (memberships || []).filter((m) => m.revoked_at);

  const run = async (key, fn) => {
    setBusy(key);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const verify = () =>
    run("verify", async () => {
      await adminPost("regulatory/membership-verify", { id: verifyFor, checked: verifyForm.checked, method: verifyForm.method });
      setVerifyFor(null);
      setVerifyForm({ checked: "", method: "" });
    });

  const revoke = () =>
    run("revoke", async () => {
      await adminPost("regulatory/membership-revoke", { id: revokeFor, reason: revokeReason });
      setRevokeFor(null);
      setRevokeReason("");
    });

  return (
    <div className="bg-canvas border border-stroke rounded-2xl p-4 space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <ClaimPill meta={meta} status={status} />
          <Pill>{meta.entity_type_labels[entity.entity_type] || entity.entity_type}</Pill>
        </div>
        {/* The badge is shown with the entity name beneath it, so one system
            serves cities, counties and states without inventing badges. */}
        <p className="text-paper text-sm font-medium mt-2">{entity.name}</p>
        {entity.official_website_url && (
          <a href={entity.official_website_url} target="_blank" rel="noreferrer" className="text-accent text-xs hover:underline underline-offset-2 inline-flex items-center gap-1">
            <FiExternalLink /> {entity.official_website_url}
          </a>
        )}
        {(entity.official_domains || []).length > 0 && (
          <p className="text-paper-dim text-xs mt-1">Official domains: {(entity.official_domains || []).join(", ")}</p>
        )}
        {status === "unclaimed" && (
          <p className="text-paper-dim text-xs mt-2">
            ADUAtlas built this record from public sources. Nothing on the site may suggest this government has joined, partnered
            with or endorsed ADUAtlas.
          </p>
        )}
        {status === "claimed" && (
          <p className="text-amber-700 text-xs mt-2">
            Someone has claimed this entity. Their authority is not verified, so they hold no verified capability and no badge.
          </p>
        )}
      </div>

      <div>
        {/* No "invite a claim" control (DEF-23). The schema has no claim-code
            invitation, so the button could only ever fail. A government claims its
            own entity from the public claim page with a work email at one of the
            official domains recorded above. */}
        <p className="text-paper text-xs font-semibold">People representing this entity</p>
        {live.length === 0 && revoked.length === 0 && <p className="text-paper-dim text-sm mt-2">Nobody. The record stands on its own.</p>}
        <ul className="mt-2 space-y-2">
          {[...live, ...revoked].map((m) => (
            <li key={m.id} className="border border-stroke rounded-xl px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-paper text-sm">{m.user_email || m.user_name || m.user_id}</span>
                <Pill tone={m.revoked_at ? "bad" : m.status === "verified" ? "accent" : "warn"}>
                  {m.revoked_at ? "Revoked" : meta.membership_status_labels[m.status] || m.status}
                </Pill>
                <Pill>{meta.membership_role_labels[m.role] || m.role}</Pill>
              </div>
              <p className="text-paper-dim text-[0.7rem] mt-1">
                {m.verified_at ? `Verified ${onDay(m.verified_at)}. ` : ""}
                {m.revoked_at ? `Revoked ${onDay(m.revoked_at)}. ` : ""}
                {m.revoked_reason ? `Reason: ${m.revoked_reason}` : ""}
              </p>
              {m.verification_note && !m.revoked_at && <p className="text-paper-dim text-[0.7rem] mt-1">Checked: {m.verification_note}</p>}
              {!m.revoked_at && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {m.status !== "verified" && (
                    <button type="button" onClick={() => setVerifyFor(m.id)} className={ghostButton}>
                      <FiCheck /> Verify authority
                    </button>
                  )}
                  <button type="button" onClick={() => setRevokeFor(m.id)} className={ghostButton}>
                    <FiSlash /> Revoke
                  </button>
                </div>
              )}

              {verifyFor === m.id && (
                <div className="mt-3 space-y-3">
                  <Field label="What did you check" hint="The government domain, the staff directory, the phone call, the letter. Verification means identity, not that the rules are legally correct.">
                    <textarea rows={2} value={verifyForm.checked} onChange={(e) => setVerifyForm({ ...verifyForm, checked: e.target.value })} className={input} />
                  </Field>
                  <Field label="How" hint="Optional shorthand, for example email domain, phone call.">
                    <input value={verifyForm.method} onChange={(e) => setVerifyForm({ ...verifyForm, method: e.target.value })} className={input} />
                  </Field>
                  <div className="flex gap-2">
                    <button type="button" onClick={verify} disabled={!verifyForm.checked.trim() || busy === "verify"} className={primaryButton}>
                      {busy === "verify" ? "Verifying…" : "Verify this person"}
                    </button>
                    <button type="button" onClick={() => setVerifyFor(null)} className={ghostButton}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {revokeFor === m.id && (
                <div className="mt-3 space-y-3">
                  <Field label="Why" hint="Revocation takes effect immediately. The membership and its history are kept; the entity is untouched.">
                    <textarea rows={2} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} className={input} />
                  </Field>
                  <div className="flex gap-2">
                    <button type="button" onClick={revoke} disabled={!revokeReason.trim() || busy === "revoke"} className={primaryButton}>
                      {busy === "revoke" ? "Revoking…" : "Revoke access"}
                    </button>
                    <button type="button" onClick={() => setRevokeFor(null)} className={ghostButton}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <Alert>{error}</Alert>
    </div>
  );
};

// ── tab 1: rules and resources ──────────────────────────────────────────────
const RulesTab = ({ meta, onMetaRefresh }) => {
  const [stateCode, setStateCode] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(null);

  const load = useCallback(() => {
    const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : stateCode ? `?state=${stateCode}` : "";
    return adminGet(`regulatory/jurisdictions${qs}`)
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }, [stateCode, query]);

  useEffect(() => {
    load();
  }, [load]);

  const parents = useMemo(() => {
    const seen = new Map();
    for (const s of meta.states || []) seen.set(s.id, s);
    for (const j of items || []) seen.set(j.id, j);
    return [...seen.values()];
  }, [meta.states, items]);

  const coverage = meta.coverage;
  const missing = useMemo(() => {
    const have = new Set((meta.states || []).map((s) => s.state_code));
    return Object.entries(meta.us_states).filter(([code]) => !have.has(code));
  }, [meta.states, meta.us_states]);

  const refresh = async () => {
    await load();
    await onMetaRefresh();
  };

  return (
    <div className="space-y-6">
      <ScopeNote />

      {coverage && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["Jurisdictions", coverage.jurisdictions],
            ["States with a record", `${coverage.states_with_records} of ${coverage.states_expected}`],
            ["Provisions published", `${coverage.provisions_published} of ${coverage.provisions}`],
            ["Verified government accounts", coverage.entities_verified],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface-1-solid border border-stroke rounded-2xl px-4 py-3">
              <p className="text-paper-dim text-xs">{label}</p>
              <p className="text-paper text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-paper-dim text-xs">
        All fifty states are supported structurally. Data is filled in progressively, and a state with no record yet says exactly
        that on the public site rather than showing an invented requirement.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={stateCode}
          onChange={(e) => {
            setStateCode(e.target.value);
            setQuery("");
          }}
          className="bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper text-sm"
        >
          <option value="">States</option>
          {Object.entries(meta.us_states).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every jurisdiction by name"
          className="flex-1 min-w-[12rem] bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper text-sm"
        />
        <button
          type="button"
          onClick={() =>
            setCreating({
              type: stateCode ? "municipality" : "state",
              state_code: stateCode || "",
              parent_id: stateCode ? (meta.states || []).find((s) => s.state_code === stateCode)?.id || "" : "",
            })
          }
          className={ghostButton}
        >
          <FiPlus /> Add a jurisdiction
        </button>
        <button type="button" onClick={refresh} className="p-2 rounded-full text-paper-dim hover:text-paper border border-stroke" aria-label="Refresh">
          <FiRefreshCw />
        </button>
      </div>

      <Alert>{error}</Alert>
      {items === null && !error && <p className="text-paper-dim text-sm">Loading…</p>}
      {items && items.length === 0 && (
        <p className="text-paper-dim text-sm">
          {query.trim() ? "No jurisdiction matches that name." : stateCode ? "No record for that state yet. Coverage is transparent, so nothing is invented to fill it." : "No state records yet."}
        </p>
      )}

      {items && items.length > 0 && (
        <div className="overflow-x-auto border border-stroke rounded-2xl">
          <table className="w-full text-sm">
            <thead className="text-paper-dim text-xs text-left">
              <tr>
                <th className="px-4 py-3">Jurisdiction</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Provisions</th>
                <th className="px-4 py-3">Resources</th>
                <th className="px-4 py-3">Research</th>
                <th className="px-4 py-3">Public page</th>
                <th className="px-4 py-3">Government</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr key={j.id} onClick={() => setOpenId(j.id)} className="border-t border-stroke hover:bg-surface-1-solid cursor-pointer">
                  <td className="px-4 py-3 text-paper">
                    {j.name}
                    {j.state_code ? <span className="text-paper-dim"> · {j.state_code}</span> : null}
                    {j.counts.submissions_waiting > 0 && (
                      <span className="ml-2">
                        <Pill tone="warn">
                          <FiClock aria-hidden /> {j.counts.submissions_waiting} waiting
                        </Pill>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-paper-dim">{meta.jurisdiction_type_labels[j.type] || j.type}</td>
                  <td className="px-4 py-3 text-paper-dim">
                    {j.counts.provisions === 0 ? "None" : `${j.counts.published} published of ${j.counts.provisions}`}
                  </td>
                  <td className="px-4 py-3 text-paper-dim">{j.counts.resources || "None"}</td>
                  <td className="px-4 py-3 text-paper-dim">
                    {j.coverage_status === "researched" ? "Researched" : j.coverage_status === "in_progress" ? "In progress" : "Not researched"}
                  </td>
                  <td className="px-4 py-3">{j.is_published ? <Pill tone="accent">Published</Pill> : <Pill>Not published</Pill>}</td>
                  <td className="px-4 py-3">{j.entity ? <ClaimPill meta={meta} status={j.entity.claim_status} /> : <span className="text-paper-dim text-xs">No record</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!stateCode && !query.trim() && missing.length > 0 && (
        <p className="text-paper-dim text-xs">
          No jurisdiction record yet for {missing.length} of the {Object.keys(meta.us_states).length} states and territories:{" "}
          {missing.map(([, name]) => name).join(", ")}.
        </p>
      )}

      {openId && (
        <JurisdictionDrawer meta={meta} id={openId} defaults={{}} parents={parents} onClose={() => setOpenId(null)} onSaved={refresh} />
      )}
      {creating && (
        <JurisdictionDrawer meta={meta} id={null} defaults={creating} parents={parents} onClose={() => setCreating(null)} onSaved={refresh} />
      )}
    </div>
  );
};

// ── tab 2: government accounts ──────────────────────────────────────────────
const GovernmentTab = ({ meta, onMetaRefresh }) => {
  const [filter, setFilter] = useState("");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  const load = useCallback(
    () =>
      adminGet(`regulatory/entities${filter ? `?claim_status=${filter}` : ""}`)
        .then((d) => setItems(d.items))
        .catch((e) => setError(e.message)),
    [filter],
  );
  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    await load();
    await onMetaRefresh();
  };
  const open = (items || []).find((e) => e.id === openId) || null;

  return (
    <div className="space-y-6">
      <p className="text-paper-dim text-xs leading-relaxed max-w-3xl">
        Three separate things, because a login is never the same as a city government: the ENTITY is the institution, a
        GOVERNMENT USER is an ordinary person with an account, and a MEMBERSHIP joins one person to one entity with a role and a
        status. People leave and are revoked without touching the entity. Verifying confirms that a person is authorised to
        represent the entity. It never means ADUAtlas checked that their rules are legally correct, and it is not a right to
        publish: every submission still comes here for review.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {[["", "All"], ...meta.claim_statuses.map((s) => [s, meta.claim_status_labels[s]])].map(([key, label]) => (
          <button
            key={key || "all"}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium ${filter === key ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper border border-stroke"}`}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={refresh} className="p-2 rounded-full text-paper-dim hover:text-paper border border-stroke" aria-label="Refresh">
          <FiRefreshCw />
        </button>
      </div>

      <Alert>{error}</Alert>
      {items === null && !error && <p className="text-paper-dim text-sm">Loading…</p>}
      {items && items.length === 0 && (
        <p className="text-paper-dim text-sm">
          No entity records here. An entity is created from its jurisdiction record, under Rules and resources.
        </p>
      )}

      <ul className="space-y-2">
        {(items || []).map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => setOpenId(e.id)} className="w-full text-left bg-surface-1-solid border border-stroke rounded-2xl px-4 py-3 hover:border-accent">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-paper text-sm font-medium">{e.name}</span>
                <ClaimPill meta={meta} status={e.claim_status} />
                <Pill>{meta.entity_type_labels[e.entity_type] || e.entity_type}</Pill>
                {e.derived_claim_status !== e.claim_status && (
                  <Pill tone="bad" title="The stored status disagrees with the memberships that exist. The memberships are the truth.">
                    <FiAlertTriangle aria-hidden /> Recheck: memberships say {meta.claim_status_labels[e.derived_claim_status]}
                  </Pill>
                )}
              </div>
              <p className="text-paper-dim text-xs mt-1">
                {e.jurisdiction ? `${e.jurisdiction.name} · ${meta.jurisdiction_type_labels[e.jurisdiction.type] || e.jurisdiction.type}` : "No jurisdiction"}
                {" · "}
                {(e.memberships || []).filter((m) => !m.revoked_at).length} active, {(e.memberships || []).filter((m) => m.revoked_at).length} revoked
              </p>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <Drawer title={open.name} subtitle={open.jurisdiction?.name} onClose={() => setOpenId(null)}>
          <EntityCard meta={meta} entity={open} memberships={open.memberships} onChanged={refresh} />
          <p className="text-paper-dim text-xs mt-4">
            Authority is explicit. This entity can be granted nothing by geography: a state account gains nothing over a city
            record, and a county gains nothing over its cities.
          </p>
        </Drawer>
      )}
    </div>
  );
};

// ── tab 3: review and publish ───────────────────────────────────────────────
// [key the published record uses, label, keys the government's payload uses].
// The payload is spelled the way src/lib/regulatory.js builds it (label, phone,
// email), not the console's spelling, so each row reads the government's own
// key. The date the source was checked is NOT here: it is ADUAtlas's fact, never
// the government's, and it is entered below when publishing (DEF-09, DEF-10).
const PROVISION_COMPARE = [
  ["field_state", "Field state", ["field_state"]],
  ["value_text", "Value", ["value_text"]],
  ["value_numeric", "Number", ["value_numeric"]],
  ["value_unit", "Unit", ["value_unit"]],
  ["value_boolean", "Yes or no", ["value_boolean"]],
  ["value_qualifier", "Qualifier", ["value_qualifier"]],
  ["source_url", "Source URL", ["source_url"]],
  ["source_document_title", "Source document", ["source_document_title"]],
  ["source_citation", "Citation", ["source_citation"]],
  ["source_type", "Source type", ["source_type"]],
  ["effective_date", "Effective date", ["effective_date"]],
  ["superseded_date", "Superseded", ["superseded_or_repealed_date", "superseded_date"]],
];
const RESOURCE_COMPARE = [
  ["title", "Label", ["label", "title"]],
  ["field_state", "Field state", ["field_state"]],
  ["url", "Link", ["url"]],
  ["contact_name", "Contact", ["contact_name"]],
  ["contact_phone", "Phone", ["phone", "contact_phone"]],
  ["contact_email", "Email", ["email", "contact_email"]],
  ["source_url", "Where it was found", ["source_url"]],
  ["source_type", "Source type", ["source_type"]],
  ["public_notes", "Public note", ["notes"]],
];
// The payload keys that are ADUAtlas's to state. The server ignores them in a
// submission (and lists what it ignored); this only lets the screen say so.
const ADUATLAS_ONLY_KEYS = ["source_checked_date", "verification_status"];
const ADUATLAS_ONLY_WORDS = {
  source_checked_date: "the date the source was checked",
  verification_status: "whether it was checked",
};
const fromPayload = (payload, keys) => {
  for (const k of keys) {
    if (payload && payload[k] !== undefined && payload[k] !== null && payload[k] !== "") return payload[k];
  }
  return "";
};
const localToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

const cell = (meta, key, value) => {
  if (value === null || value === undefined || value === "") return "";
  if (key === "field_state") return meta.field_state_labels[value] || value;
  if (key === "topic") return meta.provision_topic_labels[value] || value;
  if (key === "kind") return meta.resource_kind_labels[value] || value;
  if (key === "source_type") return meta.source_type_labels[value] || value;
  return String(value);
};

const ReviewDrawer = ({ meta, id, onClose, onDone }) => {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  // ADUAtlas's own facts for the record this publishes. Both are asked for here
  // and neither is ever taken from the government's submission.
  const [checkedDate, setCheckedDate] = useState("");
  const [checkedStatus, setCheckedStatus] = useState("");

  useEffect(() => {
    adminGet(`regulatory/submission?id=${id}`)
      .then(setD)
      .catch((e) => setError(e.message));
  }, [id]);

  const act = async (key, path, body) => {
    setBusy(key);
    setError("");
    try {
      await adminPost(path, body);
      await onDone();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  if (!d) {
    return (
      <Drawer title="Submission" onClose={onClose}>
        <Alert>{error}</Alert>
        {!error && <p className="text-paper-dim text-sm">Loading…</p>}
      </Drawer>
    );
  }

  const sub = d.submission;
  const payload = sub.payload || {};
  const isResource = sub.target_kind === "resource";
  const rows = isResource ? RESOURCE_COMPARE : PROVISION_COMPARE;
  const waiting = sub.status === "submitted";
  const authority = d.submitter_authority;
  const ignored = d.ignored_from_submission || ADUATLAS_ONLY_KEYS.filter((k) => fromPayload(payload, [k]) !== "");
  const whatLabel = isResource
    ? meta.resource_kind_labels[sub.resource_type] || sub.resource_type
    : meta.provision_topic_labels[sub.topic_key] || sub.topic_key;
  const saidNote = sub.submitter_note || sub.message;

  return (
    <Drawer
      title={`${sub.target_kind === "resource" ? "Resource" : "Provision"} submitted`}
      subtitle={`${d.entity?.name || "Unknown entity"} · ${d.jurisdiction?.name || "no jurisdiction"} · ${onDay(sub.created_at)}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={waiting ? "warn" : sub.status === "accepted" ? "accent" : "dim"}>{meta.submission_status_labels[sub.status] || sub.status}</Pill>
          {whatLabel && <Pill>{whatLabel}</Pill>}
          {authority === "verified" && <ClaimPill meta={meta} status="verified" />}
          {authority === "unverified" && <Pill tone="warn">Submitter not verified</Pill>}
          {authority === "revoked" && <Pill tone="bad">Submitter revoked</Pill>}
          {authority === "none" && <Pill tone="bad">No membership found</Pill>}
        </div>
        {d.entity && authority === "verified" && (
          <p className="text-paper-dim text-xs">
            Provided by verified government account: {d.entity.name}. That is a different statement from using a government
            website as a source, and the homeowner page keeps them apart.
          </p>
        )}

        {d.authority_mismatch && (
          <Alert tone="warn">
            This entity is registered to a different jurisdiction record than the one it submitted for. Containment grants nothing:
            a state entity has no authority over a city record and a county none over its cities. Publish only if ADUAtlas has an
            explicit reason, and say so in the note.
          </Alert>
        )}

        <Section title="What was submitted, beside what ADUAtlas publishes" hint="Both are kept. Publishing writes a new version and destroys neither.">
          <div className="overflow-x-auto border border-stroke rounded-2xl">
            <table className="w-full text-sm">
              <thead className="text-paper-dim text-xs text-left">
                <tr>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Submitted by the government</th>
                  <th className="px-3 py-2">ADUAtlas publishes now</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([key, label, payloadKeys]) => {
                  const a = cell(meta, key, fromPayload(payload, payloadKeys));
                  const b = cell(meta, key, d.current ? d.current[key] : "");
                  const changed = a !== b;
                  return (
                    <tr key={key} className={`border-t border-stroke ${changed ? "bg-amber-500/5" : ""}`}>
                      <td className="px-3 py-2 text-paper-dim text-xs">{label}</td>
                      <td className="px-3 py-2 text-paper break-words">{a || <span className="text-paper-dim/60">Not given</span>}</td>
                      <td className="px-3 py-2 text-paper-dim break-words">{b || <span className="text-paper-dim/60">{d.current ? "Not recorded" : "No published record"}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {saidNote && (
            <Field label="What the government said">
              <textarea readOnly rows={3} value={saidNote} className={inputRO} />
            </Field>
          )}
        </Section>

        {waiting ? (
          <Section title="Decide" hint="Nothing reaches a homeowner until you do. A declined submission is kept with its reason.">
            {d.authority_mismatch && (
              <label className="flex items-start gap-2 text-sm text-paper">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" />
                <span>I have an explicit reason to accept this entity's submission for a jurisdiction it is not registered to.</span>
              </label>
            )}
            <div className="bg-canvas border border-stroke rounded-2xl p-4 space-y-4">
              <div>
                <p className="text-paper text-sm font-semibold">What ADUAtlas records</p>
                <p className="text-paper-dim text-xs mt-0.5">
                  Open the source the government cited before you publish. The date you checked it and whether it checks out are
                  ADUAtlas facts. They come from you, never from the submission.
                </p>
              </div>
              {ignored.length > 0 && (
                <Alert tone="warn">
                  The submission also set {ignored.map((k) => ADUATLAS_ONLY_WORDS[k] || k.replace(/_/g, " ")).join(" and ")}. Those are
                  ADUAtlas facts, so they are not used. Enter your own below.
                </Alert>
              )}
              {sub.conflicts_with_provision_id && (
                <Alert tone="warn">
                  The government says this contradicts a rule ADUAtlas publishes now. If another official source disagrees with what
                  you are about to publish, choose Disputed so the homeowner page shows the disagreement.
                </Alert>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="Date you checked the source"
                  hint={d.current?.source_checked_date ? `The record ADUAtlas publishes now was checked ${d.current.source_checked_date}.` : "Required to publish."}
                >
                  <input type="date" value={checkedDate} max={localToday()} onChange={(e) => setCheckedDate(e.target.value)} className={input} />
                </Field>
                <Field label="Checked by ADUAtlas" hint={checkedStatus ? VERIFICATION_HELP[checkedStatus] : "Required to publish."}>
                  <select value={checkedStatus} onChange={(e) => setCheckedStatus(e.target.value)} className={input}>
                    <option value="">Choose one</option>
                    {(meta.record_verification_statuses || []).map((v) => (
                      <option key={v} value={v}>
                        {(meta.record_verification_status_labels || {})[v] || v}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <Field label="Publication note" hint="Recorded on the version this creates.">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
            </Field>
            <button
              type="button"
              onClick={() =>
                act("publish", "regulatory/submission-publish", {
                  id,
                  note,
                  acknowledge_authority_mismatch: ack,
                  source_checked_date: checkedDate,
                  verification_status: checkedStatus,
                })
              }
              disabled={busy === "publish" || authority !== "verified" || (d.authority_mismatch && !ack) || !checkedDate || !checkedStatus}
              className={primaryButton}
            >
              {busy === "publish" ? "Publishing…" : "Publish this"}
            </button>
            {authority === "verified" && (!checkedDate || !checkedStatus) && (
              <p className="text-paper-dim text-xs">To publish, enter the date you checked the source and whether it checks out.</p>
            )}
            {authority !== "verified" && (
              <p className="text-paper-dim text-xs">
                Only a verified representative's submission is published. Verify their authority under Government accounts, or
                decline this with a reason.
              </p>
            )}
            <Field label="Reason for declining" hint="Required. The government sees that ADUAtlas declined and why.">
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
            </Field>
            <button
              type="button"
              onClick={() => act("decline", "regulatory/submission-decline", { id, reason })}
              disabled={!reason.trim() || busy === "decline"}
              className={ghostButton}
            >
              <FiSlash /> {busy === "decline" ? "Declining…" : "Decline"}
            </button>
          </Section>
        ) : (
          <Section title="Already reviewed">
            <p className="text-paper-dim text-sm">
              {meta.submission_status_labels[sub.status] || sub.status}
              {sub.reviewed_at ? ` on ${when(sub.reviewed_at)}` : ""}.
              {sub.decline_reason ? ` Reason: ${sub.decline_reason}` : ""}
              {sub.review_note ? ` Note: ${sub.review_note}` : ""}
            </p>
            <p className="text-paper-dim text-xs">The submission and its payload are kept exactly as they arrived.</p>
          </Section>
        )}

        <Alert>{error}</Alert>
      </div>
    </Drawer>
  );
};

const ReviewTab = ({ meta, onMetaRefresh }) => {
  const [filter, setFilter] = useState("submitted");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  const load = useCallback(
    () =>
      adminGet(`regulatory/submissions${filter ? `?status=${filter}` : ""}`)
        .then((d) => setItems(d.items))
        .catch((e) => setError(e.message)),
    [filter],
  );
  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    await load();
    await onMetaRefresh();
  };

  return (
    <div className="space-y-6">
      <p className="text-paper-dim text-xs leading-relaxed max-w-3xl">
        A verified member submits, you review, ADUAtlas publishes. Verification is not a publishing right, nothing submitted
        reaches a homeowner before you act, and both records survive: what the government submitted and what ADUAtlas publishes.
        A state that finds a local ordinance conflicts with state law is a disagreement to represent, not a row to delete.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {[["submitted", "Waiting on review"], ["accepted", "Published"], ["rejected", "Declined"], ["", "All"]].map(([key, label]) => (
          <button
            key={key || "all"}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium ${filter === key ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper border border-stroke"}`}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={refresh} className="p-2 rounded-full text-paper-dim hover:text-paper border border-stroke" aria-label="Refresh">
          <FiRefreshCw />
        </button>
      </div>

      <Alert>{error}</Alert>
      {items === null && !error && <p className="text-paper-dim text-sm">Loading…</p>}
      {items && items.length === 0 && <p className="text-paper-dim text-sm">Nothing here.</p>}

      {items && items.length > 0 && (
        <div className="overflow-x-auto border border-stroke rounded-2xl">
          <table className="w-full text-sm">
            <thead className="text-paper-dim text-xs text-left">
              <tr>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Jurisdiction</th>
                <th className="px-4 py-3">What</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} onClick={() => setOpenId(s.id)} className="border-t border-stroke hover:bg-surface-1-solid cursor-pointer">
                  <td className="px-4 py-3 text-paper-dim whitespace-nowrap">{onDay(s.created_at)}</td>
                  <td className="px-4 py-3 text-paper">
                    {s.entity?.name || "Unknown"}
                    {s.authority_mismatch && (
                      <span className="ml-2">
                        <Pill tone="warn">
                          <FiAlertTriangle aria-hidden /> Not its jurisdiction
                        </Pill>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-paper-dim">{s.jurisdiction?.name || "-"}</td>
                  <td className="px-4 py-3 text-paper-dim">{s.target_kind === "resource" ? "Resource" : "Provision"}</td>
                  <td className="px-4 py-3">
                    <Pill tone={s.status === "submitted" ? "warn" : s.status === "accepted" ? "accent" : "dim"}>
                      {meta.submission_status_labels[s.status] || s.status}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <ReviewDrawer meta={meta} id={openId} onClose={() => setOpenId(null)} onDone={refresh} />}
    </div>
  );
};

// ── the page ────────────────────────────────────────────────────────────────
// ── tab 4: government claims, explicit authority and education partnerships ──
// Decision 2p, and the three concepts it exists to keep apart.
//
// IDENTITY and PARTNERSHIP ARE TWO COLUMNS ON THIS SCREEN AND THEY NEVER MERGE.
// "Verified Government Account but not an Education Partner" is an ordinary
// Tuesday, not an edge case, so every row carries two badges that are free to
// disagree and there is no combined status pill anywhere in this file. The
// filters are two filters for the same reason: filtering by a merged status
// would be inventing the merged status.
//
// The third concept, REGULATORY SOURCE VERIFICATION, lives per record and per
// field on the Rules and resources tab. A verified account does not make one of
// its rules verified, and this screen never suggests it does.
//
// IDENTITY NEVER ACTIVATES A PARTNERSHIP. There is no control here that does
// both, and verifying a claim leaves the partnership column exactly where it
// was. A PARTNERSHIP NEVER ACTIVATES WITHOUT VERIFIED IDENTITY: the button is
// not offered, the endpoint refuses it, and migration 0014 refuses it in the
// database. The database is the boundary; the other two exist so Amy is never
// offered something that cannot work.
//
// AUTHORITY IS EXPLICIT, NEVER GEOGRAPHIC. Granting is one entity, one
// jurisdiction record, one written reason. The breadcrumb is shown so Amy can
// see which record she is choosing, and it grants nothing: there is no "and
// everything beneath it" control here because there is no such grant.
const IDENTITY_TONE = {
  unclaimed: "dim",
  claim_pending: "warn",
  identity_verified: "accent",
  verification_rejected: "bad",
  suspended: "bad",
};
const PARTNERSHIP_TONE = {
  none: "dim",
  pending: "warn",
  active: "info",
  inactive: "dim",
  suspended: "bad",
};

// Two badges, two components, deliberately not one component with a mode.
const IdentityBadge = ({ govMeta, state }) => (
  <Pill tone={IDENTITY_TONE[state] || "dim"} title={govMeta.identity_state_help?.[state]}>
    {state === "identity_verified" ? <FiShield aria-hidden /> : null}
    {govMeta.identity_state_labels[state] || state}
  </Pill>
);

const PartnershipBadge = ({ govMeta, state }) => (
  <Pill tone={PARTNERSHIP_TONE[state] || "dim"} title={govMeta.partnership_state_help?.[state]}>
    {state === "active" ? <FiAward aria-hidden /> : null}
    {govMeta.partnership_state_labels[state] || state}
  </Pill>
);

// The sentence that keeps the two apart wherever both are shown.
const TwoFactsNote = () => (
  <p className="text-paper-dim text-xs leading-relaxed max-w-3xl">
    Two separate facts, and they are allowed to disagree. IDENTITY answers "has ADUAtlas verified that this account is
    controlled by the stated government?", and the badge means only that. PARTNERSHIP answers "has this verified entity
    activated an ADUAtlas education partnership?", which unlocks sponsored resident access and is never called verified.
    Verifying identity does not create a partnership, and a partnership cannot activate without verified identity.
    Withdrawing a verification suspends an active partnership, and verifying again does not bring that partnership back:
    reactivating is a separate decision. So the two pills often disagree, and neither of them is the other one out of date.
    Whether ADUAtlas holds sourced regulations for a jurisdiction is a third question again, answered per record and per
    field under Rules and resources.
  </p>
);

// T4-05 (RC4 rehearsal): why an enabled, unexpired link or code still grants
// nothing today, or null when it can grant. The server's is_live answers for the
// row alone (enabled and not expired), but redeem_partner_access also requires an
// ACTIVE partnership and a VERIFIED identity (0014, 0020). After a suspension or
// a withdrawn verification every row was refused while this screen still called
// it "Live".
// The two causes are named apart. A withdrawal cascades only an ACTIVE
// partnership to suspended (0020), so an ended (inactive) partnership stays
// inactive when the verification is withdrawn afterwards, and the row must not
// say the partnership is suspended when the block is the withdrawn verification.
const accessBlockedBy = (partnershipState, identityState) => {
  if (partnershipState === "suspended") return "suspended";
  if (identityState === "suspended") return "withdrawn";
  if (partnershipState !== "active" || identityState !== "identity_verified") return "inactive";
  return null;
};
const BLOCKED_PILL = {
  suspended: { label: "Suspended", tone: "bad", title: "Enabled, but it grants nothing while the partnership is suspended." },
  withdrawn: { label: "Verification withdrawn", tone: "bad", title: "Enabled, but it grants nothing while the entity's verification is withdrawn." },
  inactive: { label: "Not live", tone: "dim", title: "Enabled, but it grants nothing until the partnership is active and the identity is verified." },
};

const AccessRow = ({ row, kind, busy, onToggle, blocked = null }) => (
  <li className="border border-stroke rounded-xl px-3 py-2" data-access-row={kind} data-access-status={row.is_live ? blocked || "live" : row.is_active ? "expired" : "disabled"}>
    <div className="flex flex-wrap items-center gap-2">
      {kind === "link" ? <FiLink2 className="text-paper-dim" aria-hidden /> : <FiKey className="text-paper-dim" aria-hidden />}
      <span className="text-paper text-sm">{row.label || (kind === "link" ? "Resident access link" : "Resident access code")}</span>
      {/* Enabled and usable are two questions. A disabled link and an expired one
          are both dead, for different reasons, and this says which. So is one
          whose partnership cannot grant anything today (T4-05). */}
      {row.is_live && blocked ? (
        <Pill tone={BLOCKED_PILL[blocked].tone} title={BLOCKED_PILL[blocked].title}>
          {BLOCKED_PILL[blocked].label}
        </Pill>
      ) : row.is_live ? (
        <Pill tone="accent">Live</Pill>
      ) : row.is_active ? (
        <Pill tone="warn">Expired</Pill>
      ) : (
        <Pill tone="dim">Disabled</Pill>
      )}
    </div>
    <p className="text-paper-dim text-[0.7rem] mt-1">
      {row.created_at ? `Created ${onDay(row.created_at)}. ` : ""}
      {row.expires_at ? `Expires ${onDay(row.expires_at)}. ` : ""}
      {row.max_redemptions != null ? `Limit ${row.max_redemptions}. ` : ""}
      {row.deactivated_at ? `Disabled ${onDay(row.deactivated_at)}. ` : ""}
      {/* The token and the code are never sent to this screen. A partner takes its
          own from the partner portal; a sponsored entitlement that leaks out of an
          admin list is one somebody else can spend. */}
      The link or code itself is not shown here.
    </p>
    <button type="button" onClick={() => onToggle(row, !row.is_active)} disabled={busy} className={`${ghostButton} mt-2`}>
      {row.is_active ? (
        <>
          <FiPause /> Disable
        </>
      ) : (
        <>
          <FiPlay /> {blocked ? "Enable" : "Make live"}
        </>
      )}
    </button>
  </li>
);

const GovEntityDrawer = ({ govMeta, id, onClose, onChanged }) => {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState("");
  const [verifyFor, setVerifyFor] = useState(null);
  const [verifyForm, setVerifyForm] = useState({ checked: "" });
  const [rejectFor, setRejectFor] = useState(null);
  const [revokeFor, setRevokeFor] = useState(null);
  const [revokeGrantFor, setRevokeGrantFor] = useState(null);
  const [reason, setReason] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantQuery, setGrantQuery] = useState("");
  const [grantResults, setGrantResults] = useState(null);
  const [grantForm, setGrantForm] = useState({ jurisdiction_id: "", jurisdiction_label: "", grant_basis: "", may_submit: true });
  const [suspending, setSuspending] = useState(false);
  const [activateNote, setActivateNote] = useState("");
  // Withdrawal gets its OWN reason field rather than sharing `reason` with reject
  // and revoke. Those act on a PERSON's claim; this acts on the INSTITUTION's
  // identity, and a half-typed revocation reason arriving on an entity-level
  // withdrawal is the same conflation decision 2s exists to prevent, wearing a
  // React hook.
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");

  const load = useCallback(
    () =>
      adminGet(`regulatory/gov-entity?id=${encodeURIComponent(id)}`)
        .then((next) => {
          setD(next);
          setError("");
        })
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    setError("");
    setWarning("");
    try {
      const out = await fn();
      if (out?.warning) setWarning(out.warning);
      await load();
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const searchJurisdictions = async () => {
    setError("");
    try {
      const out = await adminGet(`regulatory/gov-jurisdictions?q=${encodeURIComponent(grantQuery)}`);
      setGrantResults(out.items || []);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!d) {
    return (
      <Drawer title="Government account" onClose={onClose}>
        <Alert>{error}</Alert>
        {!error && <p className="text-paper-dim text-sm">Loading…</p>}
      </Drawer>
    );
  }

  const e = d.entity;
  const claims = d.memberships.filter((m) => m.status === "pending");
  const verified = d.memberships.filter((m) => m.status === "verified" && !m.revoked_at);
  const closed = d.memberships.filter((m) => m.status === "revoked" || m.status === "rejected" || m.revoked_at);
  const liveGrants = d.grants.filter((g) => !g.revoked_at);
  const pastGrants = d.grants.filter((g) => g.revoked_at);
  const partnershipState = d.partnership?.state || "none";
  // Why no link or code below can grant anything today, or null (T4-05).
  const accessBlocked = accessBlockedBy(partnershipState, e.identity_state);
  const identityHistory = d.identity_history || [];
  const historyReady = d.schema?.identity_history !== false;
  const lastWithdrawal = identityHistory.find((h) => h.to_status === "suspended") || null;

  return (
    <Drawer title={e.name} subtitle={e.jurisdiction ? e.jurisdiction.path || e.jurisdiction.name : undefined} onClose={onClose}>
      <div className="space-y-6">
        {/* Two badges, side by side, first thing on the screen. */}
        <div className="flex flex-wrap items-center gap-2">
          <IdentityBadge govMeta={govMeta} state={e.identity_state} />
          <PartnershipBadge govMeta={govMeta} state={partnershipState} />
          <Pill>{govMeta.entity_type_labels[e.entity_type] || e.entity_type}</Pill>
        </div>
        <TwoFactsNote />
        <Alert>{error}</Alert>
        <Alert tone="warn">{warning}</Alert>
        {d.schema?.partnership === false && (
          <Alert tone="warn">
            {d.schema.partnership_error} The partnership controls stay closed rather than pretending to save.
          </Alert>
        )}

        <Section title="The institution" hint="An account represents the institution, never an individual employee.">
          <div className="text-sm space-y-1">
            {e.official_website_url && (
              <a href={e.official_website_url} target="_blank" rel="noreferrer" className="text-accent text-xs hover:underline underline-offset-2 inline-flex items-center gap-1">
                <FiExternalLink /> {e.official_website_url}
              </a>
            )}
            {(e.official_domains || []).length > 0 && (
              <p className="text-paper-dim text-xs">
                Official domains: {(e.official_domains || []).join(", ")}. Evidence when you judge a claim, and never a verification on its own.
              </p>
            )}
            <p className="text-paper-dim text-xs">
              {e.claimed_at ? `Claimed ${onDay(e.claimed_at)}. ` : "Never claimed. "}
              {e.verified_at ? `Identity verified ${onDay(e.verified_at)}.` : "Identity not verified."}
            </p>
            {e.identity_state === "unclaimed" && (
              <p className="text-paper-dim text-xs">
                ADUAtlas built this record from authoritative public sources. Nothing on the site may imply this government has
                joined, partnered with or endorsed ADUAtlas.
              </p>
            )}
          </div>
        </Section>

        {/* ── IDENTITY. Verifying moves identity and nothing else. ── */}
        <Section
          title="Identity verification"
          hint="Does this account belong to the government it names? Verifying grants authority over no jurisdiction and creates no partnership."
          right={
            e.identity_state === "identity_verified" && historyReady ? (
              <button
                type="button"
                onClick={() => {
                  setWithdrawing((v) => !v);
                  setWithdrawReason("");
                }}
                className={ghostButton}
              >
                <FiAlertTriangle /> Withdraw verification
              </button>
            ) : null
          }
        >
          {claims.length === 0 && verified.length === 0 && closed.length === 0 && (
            <p className="text-paper-dim text-sm">Nobody has claimed this entity. The record stands on its own.</p>
          )}
          <ul className="space-y-2">
            {[...claims, ...verified, ...closed].map((m) => (
              <li key={m.id} className="border border-stroke rounded-xl px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-paper text-sm">{m.person?.full_name || m.person?.work_email || m.person?.account_email || "Unnamed person"}</span>
                  <Pill tone={m.revoked_at || m.status === "revoked" ? "bad" : m.status === "rejected" ? "bad" : m.status === "verified" ? "accent" : "warn"}>
                    {govMeta.membership_status_labels[m.status] || m.status}
                  </Pill>
                  <Pill>{govMeta.membership_role_labels[m.membership_role] || m.membership_role}</Pill>
                </div>
                <p className="text-paper-dim text-[0.7rem] mt-1">
                  {m.person?.job_title ? `${m.person.job_title}. ` : ""}
                  {m.person?.work_email ? `Work email ${m.person.work_email}. ` : ""}
                  {m.person?.account_email && m.person.account_email !== m.person.work_email ? `Account ${m.person.account_email}. ` : ""}
                  {m.requested_at ? `Claimed ${onDay(m.requested_at)}. ` : ""}
                  {m.verified_at ? `Verified ${onDay(m.verified_at)}. ` : ""}
                  {m.revoked_at ? `Revoked ${onDay(m.revoked_at)}. ` : ""}
                  {m.revoked_reason ? `Reason: ${m.revoked_reason}` : ""}
                </p>
                {m.request_note && <p className="text-paper-dim text-[0.7rem] mt-1">They wrote: {m.request_note}</p>}
                {m.status === "pending" && (
                  <p className={`text-[0.7rem] mt-1 ${m.work_email_matches_official_domain ? "text-paper-dim" : "text-amber-700"}`}>
                    {m.work_email_matches_official_domain
                      ? "Their work email is on an official domain for this entity. That is a reason to look, not a verification."
                      : "Their work email is not on an official domain for this entity. Holding an email address was never sufficient."}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mt-2">
                  {m.status === "pending" && (
                    <>
                      <button type="button" onClick={() => { setVerifyFor(m.id); setRejectFor(null); setRevokeFor(null); }} className={ghostButton}>
                        <FiUserCheck /> Verify identity
                      </button>
                      <button type="button" onClick={() => { setRejectFor(m.id); setVerifyFor(null); setRevokeFor(null); setReason(""); }} className={ghostButton}>
                        <FiUserX /> Reject claim
                      </button>
                    </>
                  )}
                  {m.status === "verified" && !m.revoked_at && (
                    <button type="button" onClick={() => { setRevokeFor(m.id); setVerifyFor(null); setRejectFor(null); setReason(""); }} className={ghostButton}>
                      <FiSlash /> Revoke
                    </button>
                  )}
                </div>

                {verifyFor === m.id && (
                  <div className="mt-3 space-y-3">
                    <Field
                      label="What did you check"
                      hint="The official domain, the staff directory, the phone call, the letter. Verification means identity and control. It never means ADUAtlas checked that this jurisdiction's rules are legally correct, and it is not a right to publish."
                    >
                      <textarea rows={2} value={verifyForm.checked} onChange={(ev) => setVerifyForm({ ...verifyForm, checked: ev.target.value })} className={input} />
                    </Field>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!verifyForm.checked.trim() || busy === "verify"}
                        className={primaryButton}
                        onClick={() =>
                          run("verify", async () => {
                            const out = await adminPost("regulatory/gov-identity-verify", { membership_id: m.id, checked: verifyForm.checked });
                            setVerifyFor(null);
                            setVerifyForm({ checked: "" });
                            return out;
                          })
                        }
                      >
                        {busy === "verify" ? "Verifying…" : "Verify this person"}
                      </button>
                      <button type="button" onClick={() => setVerifyFor(null)} className={ghostButton}>
                        Cancel
                      </button>
                    </div>
                    <p className="text-paper-dim text-xs">
                      This moves identity only. It does not create or activate a partnership, and it grants authority over no
                      jurisdiction: both of those are separate, deliberate acts below.
                    </p>
                  </div>
                )}

                {rejectFor === m.id && (
                  <div className="mt-3 space-y-3">
                    <Field label="Why is the claim refused" hint="The claim and the reason are kept. The entity record stays: ADUAtlas compiled it from public sources and it is useful with no account attached.">
                      <textarea rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} className={input} />
                    </Field>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!reason.trim() || busy === "reject"}
                        className={primaryButton}
                        onClick={() =>
                          run("reject", async () => {
                            const out = await adminPost("regulatory/gov-identity-reject", { membership_id: m.id, reason });
                            setRejectFor(null);
                            setReason("");
                            return out;
                          })
                        }
                      >
                        {busy === "reject" ? "Rejecting…" : "Reject this claim"}
                      </button>
                      <button type="button" onClick={() => setRejectFor(null)} className={ghostButton}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {revokeFor === m.id && (
                  <div className="mt-3 space-y-3">
                    <Field label="Why" hint="Revocation takes effect immediately. The membership and its history are kept, and the entity is untouched: a person leaving is not an institution leaving.">
                      <textarea rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} className={input} />
                    </Field>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!reason.trim() || busy === "revoke"}
                        className={primaryButton}
                        onClick={() =>
                          run("revoke", async () => {
                            const out = await adminPost("regulatory/gov-membership-revoke", { membership_id: m.id, reason });
                            setRevokeFor(null);
                            setReason("");
                            return out;
                          })
                        }
                      >
                        {busy === "revoke" ? "Revoking…" : "Revoke access"}
                      </button>
                      <button type="button" onClick={() => setRevokeFor(null)} className={ghostButton}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* WHAT A SUSPENSION ACTUALLY MEANS, said where Amy is looking at it.
              The label alone reads like a dead end; the two halves of decision 2s
              (D5) are that the future stops and the past does not. */}
          {e.identity_state === "suspended" && (
            <Alert tone="warn">
              Verification withdrawn{lastWithdrawal ? ` on ${onDay(lastWithdrawal.occurred_at)}` : ""}
              {lastWithdrawal?.actor_email ? ` by ${lastWithdrawal.actor_email}` : ""}.{" "}
              {lastWithdrawal?.reason
                ? `Reason: ${lastWithdrawal.reason}`
                : "No reason is recorded against this transition, which means ADUAtlas does not know why rather than that there was no reason."}{" "}
              This entity can issue no new resident links or codes and no new sponsored activation can happen through it.
              Residents already sponsored keep their Golden access. Verifying a representative again restores the identity
              and does not reactivate the partnership.
            </Alert>
          )}

          {withdrawing && (
            <div className="space-y-3 border border-stroke rounded-xl px-3 py-3">
              <Field
                label="Why is the verification being withdrawn"
                hint="Required, and it is kept permanently on the identity record beside the verification it ends. This is not a rejected claim and it is not a revoked person: it suspends the institution. New links, new codes and new sponsored activations stop immediately; every resident already sponsored keeps their access."
              >
                <textarea rows={3} value={withdrawReason} onChange={(ev) => setWithdrawReason(ev.target.value)} className={input} />
              </Field>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!withdrawReason.trim() || busy === "withdraw"}
                  className={primaryButton}
                  onClick={() =>
                    run("withdraw", async () => {
                      const out = await adminPost("regulatory/gov-identity-withdraw", { entity_id: e.id, reason: withdrawReason });
                      setWithdrawing(false);
                      setWithdrawReason("");
                      return out;
                    })
                  }
                >
                  {busy === "withdraw" ? "Withdrawing…" : "Withdraw verification"}
                </button>
                <button type="button" onClick={() => setWithdrawing(false)} className={ghostButton}>
                  Cancel
                </button>
              </div>
              <p className="text-paper-dim text-xs">
                If this entity has an active education partnership it is suspended in the same step, because a partnership
                cannot stand on an unverified identity. Nothing is deleted: the verification, who granted it and what they
                checked all stay on the record below.
              </p>
            </div>
          )}

          {/* THE HISTORY. It lives here rather than in an audit screen because the
              question Amy asks in this drawer is "was this ever verified, and what
              happened to it". After a withdrawal the entity row cannot answer it:
              verified_at is cleared the moment the status leaves verified. */}
          {!historyReady ? (
            <p className="text-paper-dim text-xs">
              {d.schema.identity_history_error} The identity history and the withdraw control stay closed rather than
              offering an action that could not record who did it or why.
            </p>
          ) : identityHistory.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-paper text-xs font-semibold flex items-center gap-1.5">
                <FiClock className="text-paper-dim" aria-hidden /> Identity history
              </h4>
              <p className="text-paper-dim text-[0.7rem]">
                Every change of identity state, newest first, and it is append only. A withdrawal is added to this list and
                never removes what came before it.
              </p>
              <ul className="space-y-2">
                {identityHistory.map((h) => (
                  <li key={h.id} className="border border-stroke rounded-xl px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={h.to_status === "verified" ? "accent" : h.to_status === "suspended" || h.to_status === "rejected" ? "bad" : "dim"}>
                        {h.to_label}
                      </Pill>
                      <span className="text-paper-dim text-[0.7rem]">
                        {onDay(h.occurred_at)}. Previously {h.from_label}.
                      </span>
                    </div>
                    <p className="text-paper-dim text-[0.7rem] mt-1">
                      {h.actor_email ? `By ${h.actor_email}.` : "ADUAtlas does not know who performed this transition."}
                      {h.reason ? ` Reason: ${h.reason}` : ""}
                    </p>
                    {/* The verification this event ENDED. Kept here because the
                        entity row no longer holds it. */}
                    {h.prior_verified_at && (
                      <p className="text-paper-dim text-[0.7rem] mt-1">
                        It had been verified {onDay(h.prior_verified_at)}
                        {h.prior_verified_by_email ? ` by ${h.prior_verified_by_email}` : ""}.
                        {h.prior_verification_note ? ` Checked then: ${h.prior_verification_note}` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        {/* ── EXPLICIT AUTHORITY. One record at a time, with a reason. ── */}
        <Section
          title="Jurisdiction authority"
          hint="The only thing that lets this entity work on a record. Never inferred from the hierarchy: a state account gains nothing over a city, a county gains nothing over its cities, and the entity does not reach its own seat without a row here."
          right={
            e.identity_state === "identity_verified" ? (
              <button type="button" onClick={() => setGranting((v) => !v)} className={ghostButton}>
                <FiPlus /> Grant authority
              </button>
            ) : null
          }
        >
          {e.identity_state !== "identity_verified" && (
            <p className="text-paper-dim text-xs">
              Authority is granted to a verified entity only. Claiming never produces verification, so verify a representative
              first.
            </p>
          )}
          {liveGrants.length === 0 && <p className="text-paper-dim text-sm">No authority granted. This entity can work on nothing.</p>}
          <ul className="space-y-2">
            {[...liveGrants, ...pastGrants].map((g) => (
              <li key={g.id} className="border border-stroke rounded-xl px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <FiMapPin className="text-paper-dim" aria-hidden />
                  <span className="text-paper text-sm">{g.jurisdiction?.name || "Unknown record"}</span>
                  <Pill tone={g.revoked_at ? "bad" : "accent"}>{g.revoked_at ? "Revoked" : g.may_submit ? "May submit" : "Read only"}</Pill>
                  {g.jurisdiction?.jurisdiction_type && <Pill>{govMeta.jurisdiction_type_labels[g.jurisdiction.jurisdiction_type] || g.jurisdiction.jurisdiction_type}</Pill>}
                </div>
                <p className="text-paper-dim text-[0.7rem] mt-1">
                  {g.jurisdiction?.path ? `${g.jurisdiction.path}. ` : ""}
                  Granted {onDay(g.granted_at)}. {g.revoked_at ? `Revoked ${onDay(g.revoked_at)}. ${g.revoked_reason || ""}` : ""}
                </p>
                <p className="text-paper-dim text-[0.7rem] mt-1">Why: {g.grant_basis}</p>
                {!g.revoked_at && revokeGrantFor !== g.id && (
                  <button
                    type="button"
                    className={`${ghostButton} mt-2`}
                    onClick={() => {
                      setRevokeGrantFor(g.id);
                      setReason("");
                    }}
                  >
                    <FiSlash /> Revoke this authority
                  </button>
                )}
                {revokeGrantFor === g.id && (
                  <div className="mt-3 space-y-3">
                    <Field label="Why is this authority being revoked" hint="The grant is kept with its reason. Revocation takes effect on the next statement, and a permission that survives the authority behind it is the failure that matters.">
                      <textarea rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} className={input} />
                    </Field>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!reason.trim() || busy === `grant-revoke-${g.id}`}
                        className={primaryButton}
                        onClick={() =>
                          run(`grant-revoke-${g.id}`, async () => {
                            const out = await adminPost("regulatory/gov-authority-revoke", { grant_id: g.id, reason });
                            setRevokeGrantFor(null);
                            setReason("");
                            return out;
                          })
                        }
                      >
                        Revoke this authority
                      </button>
                      <button type="button" onClick={() => setRevokeGrantFor(null)} className={ghostButton}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {granting && e.identity_state === "identity_verified" && (
            <div className="border border-stroke rounded-xl p-3 space-y-3">
              <Field label="Find the jurisdiction record" hint="Search by name. One record is granted at a time, and nothing beneath it is included.">
                <div className="flex gap-2">
                  <input value={grantQuery} onChange={(ev) => setGrantQuery(ev.target.value)} className={input} placeholder="Phoenix" />
                  <button type="button" onClick={searchJurisdictions} disabled={!grantQuery.trim()} className={`${ghostButton} mt-1`}>
                    <FiSearch /> Search
                  </button>
                </div>
              </Field>
              {grantResults && grantResults.length === 0 && <p className="text-paper-dim text-sm">No jurisdiction record matches that. It may not exist yet.</p>}
              {grantResults && grantResults.length > 0 && (
                <ul className="space-y-1 max-h-56 overflow-y-auto">
                  {grantResults.map((j) => (
                    <li key={j.id}>
                      <button
                        type="button"
                        onClick={() => setGrantForm({ ...grantForm, jurisdiction_id: j.id, jurisdiction_label: j.path || j.name })}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${grantForm.jurisdiction_id === j.id ? "border-accent text-paper" : "border-stroke text-paper-dim hover:text-paper"}`}
                      >
                        {j.name}
                        <span className="text-paper-dim text-xs"> · {govMeta.jurisdiction_type_labels[j.jurisdiction_type] || j.jurisdiction_type} · {j.path || j.state_code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Field label="Why may this entity speak for that record" hint="Required. Authority nobody can explain is authority nobody can audit.">
                <textarea rows={2} value={grantForm.grant_basis} onChange={(ev) => setGrantForm({ ...grantForm, grant_basis: ev.target.value })} className={input} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-paper">
                <input type="checkbox" checked={grantForm.may_submit} onChange={(ev) => setGrantForm({ ...grantForm, may_submit: ev.target.checked })} />
                They may submit updates for this record. Unchecked is read only.
              </label>
              <button
                type="button"
                disabled={!grantForm.jurisdiction_id || !grantForm.grant_basis.trim() || busy === "grant"}
                className={primaryButton}
                onClick={() =>
                  run("grant", async () => {
                    const out = await adminPost("regulatory/gov-authority-grant", {
                      entity_id: e.id,
                      jurisdiction_id: grantForm.jurisdiction_id,
                      grant_basis: grantForm.grant_basis,
                      may_submit: grantForm.may_submit,
                    });
                    setGranting(false);
                    setGrantForm({ jurisdiction_id: "", jurisdiction_label: "", grant_basis: "", may_submit: true });
                    setGrantResults(null);
                    setGrantQuery("");
                    return out;
                  })
                }
              >
                {busy === "grant" ? "Granting…" : grantForm.jurisdiction_label ? `Grant authority over ${grantForm.jurisdiction_label}` : "Grant authority"}
              </button>
              <p className="text-paper-dim text-xs">
                Granting a state authority over its cities means granting each city deliberately. There is no bulk form, because
                that is what delegating authority actually is.
              </p>
            </div>
          )}
        </Section>

        {/* ── THE PARTNERSHIP. A different question entirely. ── */}
        <Section
          title="ADUAtlas education partnership"
          hint="Whether this verified entity has activated a partnership. Never called verified, because verification already means something else."
        >
          <div className="flex flex-wrap items-center gap-2">
            <PartnershipBadge govMeta={govMeta} state={partnershipState} />
            {d.partnership?.activated_at && <span className="text-paper-dim text-xs">Activated {onDay(d.partnership.activated_at)}</span>}
            {d.partnership?.suspended_at && <span className="text-paper-dim text-xs">Suspended {onDay(d.partnership.suspended_at)}</span>}
          </div>
          <p className="text-paper-dim text-xs">{govMeta.partnership_state_help?.[partnershipState]}</p>

          {d.schema?.partnership !== false && (
            <>
              {!d.partnership_gate?.identity_verified && (
                <Alert tone="warn">{d.partnership_gate?.reason}</Alert>
              )}
              <div className="flex flex-wrap gap-2">
                {/* Offered only when identity is verified. The endpoint refuses it
                    otherwise and the database refuses it regardless. */}
                {d.partnership_gate?.identity_verified && partnershipState !== "active" && (
                  <button
                    type="button"
                    disabled={busy === "activate"}
                    className={primaryButton}
                    onClick={() =>
                      run("activate", () =>
                        adminPost(partnershipState === "none" ? "regulatory/gov-partnership-activate" : "regulatory/gov-partnership-reactivate", {
                          entity_id: e.id,
                          note: activateNote,
                        }),
                      )
                    }
                  >
                    {/* A partnership that was arranged and never started is
                        activated; one that was suspended or ended is reactivated,
                        and reactivating asks the identity question again. */}
                    <FiAward /> {partnershipState === "none" || partnershipState === "pending" ? "Activate the partnership" : "Reactivate the partnership"}
                  </button>
                )}
                {partnershipState === "active" && (
                  <button type="button" onClick={() => setSuspending((v) => !v)} className={ghostButton}>
                    <FiPause /> Suspend the partnership
                  </button>
                )}
              </div>

              {d.partnership_gate?.identity_verified && (partnershipState === "none" || partnershipState === "pending") && (
                <Field label="Note" hint="Optional. Why this partnership was activated.">
                  <input value={activateNote} onChange={(ev) => setActivateNote(ev.target.value)} className={input} />
                </Field>
              )}

              {suspending && partnershipState === "active" && (
                <div className="border border-stroke rounded-xl p-3 space-y-3">
                  <Field
                    label="Why"
                    hint="Suspending refuses NEW sponsored activations from the next request. Homeowners who already entered through this partner keep their accounts."
                  >
                    <textarea rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} className={input} />
                  </Field>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!reason.trim() || busy === "suspend"}
                      className={primaryButton}
                      onClick={() =>
                        run("suspend", async () => {
                          const out = await adminPost("regulatory/gov-partnership-suspend", { entity_id: e.id, reason });
                          setSuspending(false);
                          setReason("");
                          return out;
                        })
                      }
                    >
                      {busy === "suspend" ? "Suspending…" : "Suspend sponsored access"}
                    </button>
                    <button type="button" onClick={() => setSuspending(false)} className={ghostButton}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <p className="text-paper-dim text-xs leading-relaxed">
                The sponsored benefit is the $79 Golden educational entitlement and nothing else. Platinum does not become free,
                Concierge does not become free, feasibility studies do not become free, and builder marketplace terms are
                untouched. A sponsored homeowner who later wants Platinum or Concierge pays the published price.
              </p>
            </>
          )}
        </Section>

        {/* ── LINKS AND CODES. Status, and the switch for one of them. ── */}
        <Section
          title="Resident access links and codes"
          hint="Two distribution methods, one underlying system: a link and a code resolve to the same sponsored entitlement and the same attribution."
        >
          {d.schema?.partnership === false ? (
            <p className="text-paper-dim text-sm">{d.schema.partnership_error}</p>
          ) : (
            <>
              {accessBlocked && (
                <p className="text-amber-700 text-xs">
                  Sponsored resident access is live only while the partnership is active and the identity is verified.
                  Every link and code below grants nothing today.
                </p>
              )}
              {d.access.links.length === 0 && d.access.codes.length === 0 && (
                <p className="text-paper-dim text-sm">
                  None. A partner generates its own links and codes in the partner portal; this screen sees their status.
                </p>
              )}
              {d.access.links.length > 0 && (
                <ul className="space-y-2">
                  {d.access.links.map((row) => (
                    <AccessRow
                      key={row.id}
                      row={row}
                      kind="link"
                      blocked={accessBlocked}
                      busy={busy === `toggle-${row.id}`}
                      onToggle={(r, active) => run(`toggle-${r.id}`, () => adminPost("regulatory/gov-access-toggle", { kind: "link", id: r.id, active }))}
                    />
                  ))}
                </ul>
              )}
              {d.access.codes.length > 0 && (
                <ul className="space-y-2">
                  {d.access.codes.map((row) => (
                    <AccessRow
                      key={row.id}
                      row={row}
                      kind="code"
                      blocked={accessBlocked}
                      busy={busy === `toggle-${row.id}`}
                      onToggle={(r, active) => run(`toggle-${r.id}`, () => adminPost("regulatory/gov-access-toggle", { kind: "code", id: r.id, active }))}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </Section>

        <Section
          title="Sponsored entries"
          hint="Aggregate, and aggregate is the whole design. Sponsoring somebody's education never makes them the partner's business, and it is not Amy's either."
        >
          {!d.analytics ? (
            <p className="text-paper-dim text-sm">No partnership, so there is nothing to count.</p>
          ) : (
            <>
              <p className="text-paper text-sm inline-flex items-center gap-2">
                <FiBarChart2 className="text-paper-dim" aria-hidden />
                {/* Separate numbers, because 2p lists them separately: a visit is
                    not an entry, and an entry that found somebody already paying
                    is a redemption and not a sponsored activation. */}
                {d.analytics.link_visits} link visit{d.analytics.link_visits === 1 ? "" : "s"} · {d.analytics.link_redemptions} link and{" "}
                {d.analytics.code_redemptions} code redemption{d.analytics.code_redemptions === 1 ? "" : "s"} ·{" "}
                {d.analytics.sponsored_activations} sponsored activation{d.analytics.sponsored_activations === 1 ? "" : "s"}
              </p>
              <p className="text-paper-dim text-xs">
                {d.analytics.course_progress_instrumented
                  ? `${d.analytics.course_starts} course start${d.analytics.course_starts === 1 ? "" : "s"}, ${d.analytics.course_completions} completion${d.analytics.course_completions === 1 ? "" : "s"}.`
                  : "Course starts and completions are not measured yet, which is a different fact from nobody starting."}
              </p>
              <p className="text-paper-dim text-xs">
                A redemption is somebody entering; a sponsored activation is the $79 Golden entitlement actually being granted.
                A resident who already held a paid plan is counted as the first and never as the second, because a sponsorship
                must never reduce what somebody paid for. No resident is named on this screen.
              </p>
            </>
          )}
        </Section>
      </div>
    </Drawer>
  );
};

const GovernmentPartnersTab = () => {
  const [govMeta, setGovMeta] = useState(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [identity, setIdentity] = useState("");
  const [partnership, setPartnership] = useState("");
  const [claimsOnly, setClaimsOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  const loadMeta = useCallback(
    () =>
      adminGet("regulatory/gov-meta")
        .then(setGovMeta)
        .catch((e) => setError(e.message)),
    [],
  );
  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (identity) params.set("identity", identity);
    if (partnership) params.set("partnership", partnership);
    if (claimsOnly) params.set("claims", "waiting");
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    return adminGet(`regulatory/gov-entities${qs ? `?${qs}` : ""}`)
      .then((d) => {
        setItems(d.items);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [identity, partnership, claimsOnly, query]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);
  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    await load();
    await loadMeta();
  };

  if (!govMeta) {
    return (
      <div className="space-y-4">
        <Alert>{error}</Alert>
        {!error && <p className="text-paper-dim text-sm">Loading…</p>}
      </div>
    );
  }

  const counts = govMeta.counts;

  return (
    <div className="space-y-6">
      <TwoFactsNote />

      {govMeta.schema?.government === false && <Alert tone="warn">{govMeta.schema.government_error}</Alert>}
      {govMeta.schema?.partnership === false && (
        <Alert tone="warn">
          {govMeta.schema.partnership_error} Identity and claims work; the partnership column reads "No partnership" for every
          entity until it is applied, and the partnership controls stay closed rather than pretending to save.
        </Alert>
      )}

      {counts && (
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Two panels, because these are two different facts. Never one row of
              combined numbers. */}
          <div className="bg-canvas border border-stroke rounded-2xl px-4 py-3">
            <p className="text-paper text-xs font-semibold mb-1">Identity</p>
            <p className="text-paper-dim text-xs">
              {govMeta.identity_states.map((s) => `${govMeta.identity_state_labels[s]}: ${counts.identity?.[s] || 0}`).join(" · ")}
            </p>
          </div>
          <div className="bg-canvas border border-stroke rounded-2xl px-4 py-3">
            <p className="text-paper text-xs font-semibold mb-1">Partnership</p>
            <p className="text-paper-dim text-xs">
              {counts.partnership
                ? govMeta.partnership_states.map((s) => `${govMeta.partnership_state_labels[s]}: ${counts.partnership[s] || 0}`).join(" · ")
                : "Migration 0014 is not applied yet."}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-paper-dim text-xs w-20">Identity</span>
          {[["", "All"], ...govMeta.identity_states.map((s) => [s, govMeta.identity_state_labels[s]])].map(([key, label]) => (
            <button
              key={key || "all"}
              onClick={() => setIdentity(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium ${identity === key ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper border border-stroke"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-paper-dim text-xs w-20">Partnership</span>
          {[["", "All"], ...govMeta.partnership_states.map((s) => [s, govMeta.partnership_state_labels[s]])].map(([key, label]) => (
            <button
              key={key || "all"}
              onClick={() => setPartnership(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium ${partnership === key ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper border border-stroke"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setClaimsOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium ${claimsOnly ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper border border-stroke"}`}
          >
            Claims waiting{counts?.claims_waiting ? ` (${counts.claims_waiting})` : ""}
          </button>
          <input value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Search by name" className="bg-canvas border border-stroke rounded-lg px-3 py-1.5 text-paper text-sm" />
          <button type="button" onClick={refresh} className="p-2 rounded-full text-paper-dim hover:text-paper border border-stroke" aria-label="Refresh">
            <FiRefreshCw />
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>
      {items === null && !error && <p className="text-paper-dim text-sm">Loading…</p>}
      {items && items.length === 0 && <p className="text-paper-dim text-sm">No government entity matches those two filters.</p>}

      <ul className="space-y-2">
        {(items || []).map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => setOpenId(e.id)} className="w-full text-left bg-surface-1-solid border border-stroke rounded-2xl px-4 py-3 hover:border-accent">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-paper text-sm font-medium">{e.name}</span>
                {/* The two columns. Separated in the markup and in the reading,
                    because they are two answers to two questions. */}
                <IdentityBadge govMeta={govMeta} state={e.identity_state} />
                <span className="text-paper-dim text-xs" aria-hidden>
                  |
                </span>
                <PartnershipBadge govMeta={govMeta} state={e.partnership_state} />
                {e.counts.claims_waiting > 0 && (
                  <Pill tone="warn">
                    <FiClock aria-hidden /> {e.counts.claims_waiting} claim{e.counts.claims_waiting === 1 ? "" : "s"} waiting
                  </Pill>
                )}
              </div>
              <p className="text-paper-dim text-xs mt-1">
                {e.jurisdiction ? `${e.jurisdiction.path || e.jurisdiction.name} · ${govMeta.jurisdiction_type_labels[e.jurisdiction.jurisdiction_type] || e.jurisdiction.jurisdiction_type}` : "No jurisdiction"}
                {" · "}
                {e.counts.jurisdictions_granted} record{e.counts.jurisdictions_granted === 1 ? "" : "s"} granted
                {" · "}
                {e.counts.verified_members} verified {e.counts.verified_members === 1 ? "person" : "people"}
                {" · "}
                {/* Live means it can grant today, which also needs an active
                    partnership and a verified identity (T4-05). */}
                {accessBlockedBy(e.partnership_state, e.identity_state) ? 0 : e.counts.links_live}/{e.counts.links_total} links live ·{" "}
                {accessBlockedBy(e.partnership_state, e.identity_state) ? 0 : e.counts.codes_live}/{e.counts.codes_total} codes live ·{" "}
                {e.counts.sponsored_activations} sponsored
              </p>
            </button>
          </li>
        ))}
      </ul>

      {openId && <GovEntityDrawer govMeta={govMeta} id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
};

const AdminRegulatory = () => {
  const [tab, setTab] = useState("rules");
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");

  const loadMeta = useCallback(
    () =>
      adminGet("regulatory/meta")
        .then(setMeta)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const waiting = meta?.coverage?.submissions_waiting || 0;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-8 sm:py-10">
      <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05] mb-6">ADU rules and resources</h1>

      <div className="inline-flex flex-wrap max-w-full rounded-xl border border-stroke p-0.5 mb-8">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === key ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper"}`}
          >
            {label}
            {key === "review" && waiting > 0 ? ` (${waiting})` : ""}
          </button>
        ))}
      </div>

      <Alert>{error}</Alert>
      {meta && meta.schema_ready === false && (
        <div className="mb-6">
          <Alert tone="warn">
            {meta.schema_error || "The regulatory tables are not in this database yet."} The editor stays closed rather than
            pretending to save.
          </Alert>
        </div>
      )}
      {!meta && !error && <p className="text-paper-dim text-sm">Loading…</p>}

      {meta && meta.schema_ready !== false && (
        <>
          {tab === "rules" && <RulesTab meta={meta} onMetaRefresh={loadMeta} />}
          {tab === "government" && <GovernmentTab meta={meta} onMetaRefresh={loadMeta} />}
          {tab === "review" && <ReviewTab meta={meta} onMetaRefresh={loadMeta} />}
          {/* Loads its own vocabularies from gov-meta, so it renders and explains
              itself on a database where migration 0014 is not applied yet. */}
          {tab === "partners" && <GovernmentPartnersTab />}
        </>
      )}
    </div>
  );
};

export default AdminRegulatory;
