import { useEffect, useMemo, useState } from "react";
import { identityWithdrawn } from "../../lib/govPartnership";
import { Link, useOutletContext } from "react-router-dom";
import { FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import {
  FEASIBILITY_BOUNDARY,
  FIELD_STATE,
  FIELD_STATE_LABELS,
  JURISDICTION_TYPE_LABELS,
  PROVISION_DATES,
  RESOURCE_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  SUBMISSION_PROMISE,
  SUBMISSION_STATUS_LABELS,
  fetchTopics,
  fetchWorkspaceProvisions,
  fetchWorkspaceResources,
  isSourceType,
  mySubmissions,
  provisionValue,
  submitProvision,
  submitResource,
  withdrawSubmission,
} from "../../lib/regulatory";

// The government side of ADU Rules and Resources (Phase 1 spec, decisions 2l, 2m
// and 2p): SUBMIT, never publish.
//
// THERE IS NO PUBLISH BUTTON ON THIS PAGE, and there could not be one. A verified
// member holds INSERT on regulatory_submissions and nothing else; the two content
// tables grant no write to any browser role, and publication is a service_role RPC
// Amy's console calls (migration 0012, PART 9 and PART 11). What the interface
// shows is therefore the truth of the model: you send a statement, ADUAtlas
// reviews it, and both sides of the record are kept.
//
// SCOPE IS THE GRANT, NEVER THE MAP. The jurisdiction picker lists exactly the
// records this entity was granted. There is no "and everything beneath it": a
// state account with a grant on the state record sees the state record. If a
// jurisdiction is missing from the picker, ADUAtlas did not grant it, and asking
// the database for it returns zero rows rather than an error to work around.
//
// TWO OF THE THREE FIELD STATES ARE SUBMITTABLE. "Verified from source" and "the
// source did not state it" are both statements somebody can make on a date. "Not
// yet researched" is the ABSENCE of a published row, so there is nothing to
// submit: offering it would invite a member to file emptiness as a fact.
//
// THE DATES ARE NOT ONE FIELD. A submission carries the EFFECTIVE date, because
// that is the jurisdiction's fact. When ADUAtlas last read a source and when
// ADUAtlas last changed its own record are ADUAtlas's facts and are recorded
// separately. "Effective January 2026" and "checked January 2025" mean opposite
// things, and this form never lets one stand in for the other.
//
// NOTHING IS SENT THAT PUBLISH WOULD REFUSE FOR A MISSING SOURCE FIELD (T4-13,
// RC4 rehearsal). A rule sent as "Verified from source" with no source type passed
// this page, and ADUAtlas publish then refused it. The review drawer cannot add a
// source field, so the only way out was to decline it and wait for a
// resubmission. The page now refuses, before sending, what publish refuses
// (provisionFields, resourceFields and the two publish blockers in
// api/admin/_regulatory.js):
//   a rule, in either state, without a source link or a source type;
//   a resource without a source link, or without a link, phone, email or named
//   contact (the portal sends a resource as verified from source);
//   a link that is not a full http(s) address, or an email that is not one.
// The resource form also asks for a source type, one of the nine in
// SOURCE_TYPE_LABELS. Resource publish does not check that field; the page asks
// for it because a resource is shown as coming from an official government
// source only when it has one. The resource form disables its send button until
// a source type is chosen and refuses the rest on send. The rule form keeps its
// button enabled and refuses on send, because it has to explain each missing
// piece in words (regress 432 sends it with no value and expects that
// explanation, not a button it cannot press).

const Card = ({ children, className = "" }) => (
  <div className={`bg-canvas border border-stroke rounded-3xl p-6 sm:p-8 ${className}`}>{children}</div>
);

const Field = ({ label, hint, required, children }) => (
  <label className="block">
    <span className="block text-paper text-xs font-medium mb-2">
      {label}
      {required && " *"}
    </span>
    {children}
    {hint && <span className="mt-1.5 block text-xs text-paper-dim leading-relaxed">{hint}</span>}
  </label>
);

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-surface-1-solid border border-stroke text-paper text-sm placeholder:text-paper-dim/60 focus:outline-none focus:border-accent transition";

// What the page says when a submission has no source type (T4-13).
const RULE_NEEDS_SOURCE_TYPE =
  "A rule needs its source type, the kind of official source you read it in. ADUAtlas does not publish a rule without one. Nothing was sent.";
const RESOURCE_NEEDS_SOURCE_TYPE =
  "A resource needs its source type, the kind of official source that publishes it. ADUAtlas shows a resource as coming from an official government source only when it has one. Nothing was sent.";
const RULE_NEEDS_SOURCE_LINK =
  "A rule read from a source needs the link to that source. ADUAtlas does not publish a requirement without one. Nothing was sent.";
const SILENT_RULE_NEEDS_SOURCE_LINK = `A rule marked "${FIELD_STATE_LABELS[FIELD_STATE.SILENT]}" needs the link to the source you read. ADUAtlas does not publish it without one. Nothing was sent.`;
const RESOURCE_NEEDS_SOURCE_LINK =
  "A resource needs the source link, the page where your entity publishes it. ADUAtlas does not publish a resource without one. Nothing was sent.";
const RESOURCE_NEEDS_A_WAY_IN =
  "A resource needs a way for a homeowner to reach it: a link, a phone number, an email address or a named contact. ADUAtlas does not publish one without it. Nothing was sent.";
const LINK_NOT_A_WEB_ADDRESS = (field) =>
  `The ${field} needs to be a full web address that starts with https:// or http://. Nothing was sent.`;
const EMAIL_NOT_AN_ADDRESS = "The email is not a complete email address. Nothing was sent.";

// The same shapes publish accepts (link() and email() in api/admin/_regulatory.js).
const isWebAddress = (value) => /^https?:\/\/\S+$/i.test(value);
const isEmailAddress = (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

// The two states a member may assert, with the wording a SUBMITTER needs. The
// homeowner-facing sentences in src/lib/regulatory.js speak in ADUAtlas's voice
// about a published record, which is a different sentence from the one a person
// filing the statement is answering, so they are not reused here. The LABELS are,
// because a state must be called the same thing everywhere.
const SUBMITTABLE_STATES = [
  {
    key: FIELD_STATE.VERIFIED,
    hint: "You read this in your jurisdiction's own published source, and that source is linked below.",
  },
  {
    key: FIELD_STATE.SILENT,
    hint: "Your published source does not address this. ADUAtlas records that silence as a fact rather than filling the gap with a guess.",
  },
];

const emptyProvision = {
  topicKey: "",
  fieldState: FIELD_STATE.VERIFIED,
  valueText: "",
  valueNumeric: "",
  valueBoolean: "",
  valueQualifier: "",
  effectiveDate: "",
  sourceUrl: "",
  sourceDocumentTitle: "",
  sourceCitation: "",
  sourceType: "",
  targetProvisionId: "",
  conflictsWithProvisionId: "",
  note: "",
};

const emptyResource = {
  resourceType: "",
  label: "",
  url: "",
  phone: "",
  email: "",
  contactName: "",
  contactTitle: "",
  departmentName: "",
  notes: "",
  sourceUrl: "",
  sourceType: "",
  targetResourceId: "",
  note: "",
};

const GovRegulatory = () => {
  const { context, membership, identityVerified } = useOutletContext();
  const withdrawn = identityWithdrawn(membership);

  // The person, not the institution. my_government_context() returns the
  // government_user beside the memberships, and the insert policy checks
  // submitted_by_government_user_id against current_government_user_id(), so this
  // id is read from the server's answer rather than assembled in the browser.
  const governmentUserId = context?.government_user?.id || null;

  const jurisdictions = useMemo(() => membership?.jurisdictions || [], [membership]);
  const submittable = useMemo(() => jurisdictions.filter((j) => j.may_submit), [jurisdictions]);

  // The record the person PICKED. The one in use is derived below, so the first
  // granted record is the default without an effect writing state mid-render.
  const [jurisdictionChoice, setJurisdictionChoice] = useState("");
  const [topics, setTopics] = useState([]);
  // Both reads are stored with the key they were read for, and the render derives
  // from that: one jurisdiction's drafts can never show under another's name, and
  // no effect has to clear anything synchronously.
  const [heldState, setHeldState] = useState({ key: "", provisions: [], resources: [] });
  // `ok` is kept with the rows: a failed read is not an empty history (R3-23c).
  const [submissionsState, setSubmissionsState] = useState({ key: "", rows: [], ok: false });
  const [submissionsNonce, setSubmissionsNonce] = useState(0);
  const [tab, setTab] = useState("rule");
  const [provisionForm, setProvisionForm] = useState(emptyProvision);
  const [resourceForm, setResourceForm] = useState(emptyResource);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState("");

  const jurisdictionId = jurisdictions.some((j) => j.jurisdiction_id === jurisdictionChoice)
    ? jurisdictionChoice
    : jurisdictions[0]?.jurisdiction_id || "";
  const entityId = membership?.entity_id || null;

  useEffect(() => {
    let live = true;
    fetchTopics().then((res) => {
      if (live) setTopics(res.topics || []);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!jurisdictionId) return undefined;
    let alive = true;
    Promise.all([fetchWorkspaceProvisions(jurisdictionId), fetchWorkspaceResources(jurisdictionId)])
      .then(([p, r]) => {
        if (alive) setHeldState({ key: jurisdictionId, provisions: p.provisions || [], resources: r.resources || [] });
      })
      .catch(() => {
        if (alive) setHeldState({ key: jurisdictionId, provisions: [], resources: [] });
      });
    return () => {
      alive = false;
    };
  }, [jurisdictionId]);

  // Re-read after every submit and withdrawal, because the answer beside a
  // submission is ADUAtlas's and not this page's to predict.
  useEffect(() => {
    if (!entityId) return undefined;
    let alive = true;
    mySubmissions(entityId)
      .then((res) => {
        if (alive) setSubmissionsState({ key: entityId, rows: res.submissions || [], ok: Boolean(res.ok) });
      })
      .catch(() => {
        if (alive) setSubmissionsState({ key: entityId, rows: [], ok: false });
      });
    return () => {
      alive = false;
    };
  }, [entityId, submissionsNonce]);

  const held = useMemo(
    () => (heldState.key === jurisdictionId ? heldState : { provisions: [], resources: [] }),
    [heldState, jurisdictionId]
  );
  const submissions = useMemo(
    () => (submissionsState.key === entityId ? submissionsState.rows : []),
    [submissionsState, entityId]
  );
  const reloadSubmissions = () => setSubmissionsNonce((n) => n + 1);

  const jurisdiction = jurisdictions.find((j) => j.jurisdiction_id === jurisdictionId) || null;
  const maySubmitHere = Boolean(jurisdiction?.may_submit);
  const topic = topics.find((t) => t.key === provisionForm.topicKey) || null;

  const setP = (key) => (event) => setProvisionForm((prev) => ({ ...prev, [key]: event.target.value }));
  const setR = (key) => (event) => setResourceForm((prev) => ({ ...prev, [key]: event.target.value }));

  const sendProvision = async (event) => {
    event.preventDefault();
    setError("");
    setMessage(null);
    if (!provisionForm.topicKey) {
      setError("Choose which requirement this is about.");
      return;
    }
    if (!governmentUserId) {
      setError("The server did not return your government person record, so nothing was sent. Reload the portal and try again.");
      return;
    }
    // T4-13: publish refuses a rule without its source link in either state. A
    // rule marked "Source did not state" names the source that was read.
    const sourceUrl = provisionForm.sourceUrl.trim();
    if (!sourceUrl) {
      setError(provisionForm.fieldState === FIELD_STATE.SILENT ? SILENT_RULE_NEEDS_SOURCE_LINK : RULE_NEEDS_SOURCE_LINK);
      return;
    }
    if (!isWebAddress(sourceUrl)) {
      setError(LINK_NOT_A_WEB_ADDRESS("source link"));
      return;
    }
    const verified = provisionForm.fieldState === FIELD_STATE.VERIFIED;
    const kind = topic?.value_kind || "text";
    // "Verified from source" is a statement that the source gives a value, so it
    // is not sent without one. The field was marked required and nothing checked
    // it: a parking rule went to review as verified with no number, and was only
    // caught when ADUAtlas tried to publish it.
    if (verified) {
      const missingValue =
        kind === "boolean"
          ? provisionForm.valueBoolean === ""
          : kind === "number"
            ? String(provisionForm.valueNumeric).trim() === "" || !Number.isFinite(Number(provisionForm.valueNumeric))
            : !provisionForm.valueText.trim();
      if (missingValue) {
        setError(
          `A rule marked "${FIELD_STATE_LABELS[FIELD_STATE.VERIFIED]}" needs the value the source gives. Enter it, or choose "${FIELD_STATE_LABELS[FIELD_STATE.SILENT]}" if the source does not give one. Nothing was sent.`
        );
        return;
      }
    }
    // T4-13: publish refuses every rule without a source type, in either state
    // (provisionPublishBlocker in api/admin/_regulatory.js), so it is not sent
    // without one.
    if (!isSourceType(provisionForm.sourceType)) {
      setError(RULE_NEEDS_SOURCE_TYPE);
      return;
    }
    setBusy(true);
    const res = await submitProvision({
      entityId: membership.entity_id,
      jurisdictionId,
      governmentUserId,
      topicKey: provisionForm.topicKey,
      fieldState: provisionForm.fieldState,
      // A statement that the source is silent carries no value, and nothing here
      // manufactures one to fill the column.
      valueText: verified && (kind === "text" || kind === "choice") ? provisionForm.valueText.trim() || null : null,
      valueNumeric: verified && kind === "number" && provisionForm.valueNumeric !== "" ? Number(provisionForm.valueNumeric) : null,
      valueUnit: verified && kind === "number" ? topic?.value_unit || null : null,
      valueBoolean: verified && kind === "boolean" && provisionForm.valueBoolean !== "" ? provisionForm.valueBoolean === "yes" : null,
      valueQualifier: verified ? provisionForm.valueQualifier.trim() || null : null,
      effectiveDate: provisionForm.effectiveDate || null,
      sourceUrl: provisionForm.sourceUrl.trim() || null,
      sourceDocumentTitle: provisionForm.sourceDocumentTitle.trim() || null,
      sourceCitation: provisionForm.sourceCitation.trim() || null,
      sourceType: provisionForm.sourceType || null,
      targetProvisionId: provisionForm.targetProvisionId || null,
      conflictsWithProvisionId: provisionForm.conflictsWithProvisionId || null,
      note: provisionForm.note.trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(
        "The database did not accept this submission. That happens when the entity holds no live submit grant on this record, or the session has ended. Nothing was recorded."
      );
      return;
    }
    setProvisionForm(emptyProvision);
    setMessage(res.promise || SUBMISSION_PROMISE);
    reloadSubmissions();
  };

  const sendResource = async (event) => {
    event.preventDefault();
    setError("");
    setMessage(null);
    if (!resourceForm.resourceType || !resourceForm.label.trim()) {
      setError("A resource needs a type and a label a homeowner will understand.");
      return;
    }
    // T4-13: the send button is disabled until a source type is chosen; this
    // refuses a send that reaches the form some other way.
    if (!isSourceType(resourceForm.sourceType)) {
      setError(RESOURCE_NEEDS_SOURCE_TYPE);
      return;
    }
    // T4-13: what resource publish refuses. A resource is sent as verified from
    // source, so it carries its source link and leads somewhere.
    const sourceUrl = resourceForm.sourceUrl.trim();
    const url = resourceForm.url.trim();
    const email = resourceForm.email.trim();
    if (!sourceUrl) {
      setError(RESOURCE_NEEDS_SOURCE_LINK);
      return;
    }
    if (!isWebAddress(sourceUrl)) {
      setError(LINK_NOT_A_WEB_ADDRESS("source link"));
      return;
    }
    if (url && !isWebAddress(url)) {
      setError(LINK_NOT_A_WEB_ADDRESS("link"));
      return;
    }
    if (email && !isEmailAddress(email)) {
      setError(EMAIL_NOT_AN_ADDRESS);
      return;
    }
    if (!url && !resourceForm.phone.trim() && !email && !resourceForm.contactName.trim()) {
      setError(RESOURCE_NEEDS_A_WAY_IN);
      return;
    }
    if (!governmentUserId) {
      setError("The server did not return your government person record, so nothing was sent. Reload the portal and try again.");
      return;
    }
    setBusy(true);
    const res = await submitResource({
      entityId: membership.entity_id,
      jurisdictionId,
      governmentUserId,
      resourceType: resourceForm.resourceType,
      label: resourceForm.label.trim(),
      url: resourceForm.url.trim() || null,
      phone: resourceForm.phone.trim() || null,
      email: resourceForm.email.trim() || null,
      contactName: resourceForm.contactName.trim() || null,
      contactTitle: resourceForm.contactTitle.trim() || null,
      departmentName: resourceForm.departmentName.trim() || null,
      notes: resourceForm.notes.trim() || null,
      sourceUrl: resourceForm.sourceUrl.trim() || null,
      sourceType: resourceForm.sourceType || null,
      targetResourceId: resourceForm.targetResourceId || null,
      note: resourceForm.note.trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(
        "The database did not accept this submission. That happens when the entity holds no live submit grant on this record, or the session has ended. Nothing was recorded."
      );
      return;
    }
    setResourceForm(emptyResource);
    setMessage(res.promise || SUBMISSION_PROMISE);
    reloadSubmissions();
  };

  const withdraw = async (id) => {
    setBusy(true);
    await withdrawSubmission(id);
    setBusy(false);
    reloadSubmissions();
  };

  const submissionsRead = submissionsState.key === entityId;
  const submissionsFailed = submissionsRead && !submissionsState.ok;

  // A read that failed says so and offers another, rather than reading as an
  // empty history.
  const historyUnread = (
    <div className="mt-4 grid gap-2" data-history-unread>
      <p className="text-paper-dim text-sm leading-relaxed">
        The history of what you sent could not be read just now. Nothing was deleted.
      </p>
      <button
        type="button"
        onClick={reloadSubmissions}
        className="tap-target justify-self-start text-accent text-sm font-medium underline underline-offset-2"
      >
        Try again
      </button>
    </div>
  );

  // What this entity has sent, with ADUAtlas's answer beside each. Shown on the
  // working page and, after a withdrawal, whenever the database still returns the
  // rows: withdrawal stops the future and keeps the past (2s D5).
  // A withdrawn entity is not offered "Withdraw this submission": since 0026 the
  // submitter can READ their own rows after a withdrawal (R3-23c), and the
  // database refuses the withdrawal itself until the verification is restored.
  const historyList = (canWithdraw) => (
    <ul className="mt-4 grid gap-3">
      {submissions.map((s) => (
        <li key={s.id} className="border border-stroke rounded-2xl p-4 grid gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-paper text-sm font-medium">
              {s.kind === "provision"
                ? topics.find((t) => t.key === s.topic_key)?.label || s.topic_key
                : s.payload?.label || RESOURCE_TYPE_LABELS[s.resource_type] || s.resource_type}
            </span>
            <span className="text-paper-dim text-xs">
              {s.kind === "provision" ? "Rule" : "Resource"} ·{" "}
              {new Date(s.submitted_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </span>
            <span className="text-paper-dim text-xs ml-auto">
              {s.withdrawn_at ? SUBMISSION_STATUS_LABELS.withdrawn : SUBMISSION_STATUS_LABELS[s.status] || s.status}
            </span>
          </div>
          {s.review_note && <p className="text-paper-dim text-xs leading-relaxed">ADUAtlas: {s.review_note}</p>}
          {(s.resulting_provision_id || s.resulting_resource_id) && (
            <p className="text-paper-dim text-xs">ADUAtlas published a record from this submission.</p>
          )}
          {canWithdraw && s.status === "submitted" && !s.withdrawn_at && (
            <button
              onClick={() => withdraw(s.id)}
              disabled={busy}
              className="justify-self-start mt-1 text-paper-dim text-xs underline hover:text-paper transition-colors disabled:opacity-50"
            >
              Withdraw this submission
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  // ── nothing granted, or nothing verified: say which, and stop ────────────
  if (!identityVerified || jurisdictions.length === 0) {
    return (
      <div className="px-5 sm:px-8 py-10 sm:py-14 max-w-3xl grid gap-6">
        <header>
          <p className="text-paper-dim text-xs uppercase tracking-wider">Government portal</p>
          <h1 className="font-display text-paper text-3xl sm:text-4xl mt-2 leading-tight">Rules and resources</h1>
        </header>
        <Card>
          <p className="text-paper-dim text-sm leading-relaxed">
            {!identityVerified && withdrawn
              ? "ADUAtlas has withdrawn this entity's verification, so there is nothing to submit against until it is verified again."
              : !identityVerified
              ? "ADUAtlas has not yet confirmed your authority to represent this entity, so there is nothing to submit against. A pending claim reaches only itself, and that is deliberate rather than a loading state."
              : "This entity holds no jurisdiction grant yet. Authority is granted one record at a time with the reason recorded, and it is never inferred from geography, so there is nothing listed here until ADUAtlas grants it."}
          </p>
          <Link to="/gov" className="mt-5 inline-block text-accent text-sm font-medium">
            Back to the portal
          </Link>
        </Card>
        {withdrawn && (
          <Card>
            <h2 className="font-display text-paper text-xl">What you have sent</h2>
            {submissions.length > 0 ? (
              historyList(false)
            ) : submissionsFailed ? (
              historyUnread
            ) : submissionsRead ? (
              // Since 0026 (R3-23c) a submitter reads their OWN submissions after a
              // withdrawal, so an empty list here means this account sent nothing.
              // What colleagues at the entity sent stays in the record but is
              // theirs to see, so the page says where it is rather than implying
              // there was none.
              <p className="text-paper-dim text-sm leading-relaxed mt-2">
                You have not sent anything from this account. Anything others at this entity sent before the
                withdrawal stays in the ADUAtlas record, with any answer ADUAtlas gave, and nothing was deleted.
              </p>
            ) : (
              <p className="text-paper-dim text-sm mt-2">Reading what this entity has sent.</p>
            )}
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 sm:px-8 py-10 sm:py-14 max-w-4xl grid gap-6">
      <header>
        <p className="text-paper-dim text-xs uppercase tracking-wider">Government portal</p>
        <h1 className="font-display text-paper text-3xl sm:text-4xl mt-2 leading-tight">Rules and resources</h1>
        <p className="text-paper-dim text-sm leading-relaxed mt-4">{SUBMISSION_PROMISE}</p>
      </header>

      <Card>
        <Field label="Which record" hint="Exactly the jurisdictions ADUAtlas granted this entity. Nothing beneath them is included.">
          <select value={jurisdictionId} onChange={(event) => setJurisdictionChoice(event.target.value)} className={inputClass}>
            {jurisdictions.map((j) => (
              <option key={j.jurisdiction_id} value={j.jurisdiction_id}>
                {j.name} · {JURISDICTION_TYPE_LABELS[j.jurisdiction_type] || j.jurisdiction_type}
                {j.may_submit ? "" : " (read only)"}
              </option>
            ))}
          </select>
        </Field>
        {!maySubmitHere && (
          <p className="text-paper-dim text-sm leading-relaxed mt-4 flex gap-2">
            <FiAlertCircle className="text-gold mt-0.5 shrink-0" aria-hidden />
            This grant is read only. You can see what ADUAtlas holds for this record and you cannot submit against it.
          </p>
        )}
        {submittable.length === 0 && (
          <p className="text-paper-dim text-sm leading-relaxed mt-4">
            Every grant this entity holds is read only, so nothing here can be submitted.
          </p>
        )}
      </Card>

      {/* ── WHAT ADUAtlas HOLDS TODAY, drafts included ─────────────────────── */}
      <Card>
        <h2 className="font-display text-paper text-xl">What ADUAtlas holds for this record</h2>
        <p className="text-paper-dim text-sm leading-relaxed mt-2">
          Including anything not yet published. A rule ADUAtlas researched from your own website carries the source
          and the date it was read; that is not the same as your account having supplied it, and the two attributions
          are kept apart on the public page.
        </p>
        {held.provisions.length === 0 ? (
          <p className="text-paper-dim text-sm mt-4">No rules recorded for this record yet.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {held.provisions.map((p) => {
              const value = provisionValue(p);
              const label = topics.find((t) => t.key === p.topic_key)?.label || p.topic_key;
              return (
                <li key={p.id} className="border border-stroke rounded-2xl px-4 py-3 flex flex-wrap gap-x-3 gap-y-1 items-baseline">
                  <span className="text-paper text-sm">{label}</span>
                  <span className="text-paper-dim text-sm">
                    {value.known ? value.text : FIELD_STATE_LABELS[p.field_state] || "Unknown"}
                  </span>
                  <span className="text-paper-dim text-xs ml-auto">
                    {p.is_published ? "Published" : p.review_status || "Not published"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {held.resources.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {held.resources.map((r) => (
              <li key={r.id} className="border border-stroke rounded-2xl px-4 py-3 flex flex-wrap gap-x-3 gap-y-1 items-baseline">
                <span className="text-paper text-sm">{r.label}</span>
                <span className="text-paper-dim text-xs">{RESOURCE_TYPE_LABELS[r.resource_type] || r.resource_type}</span>
                <span className="text-paper-dim text-xs ml-auto">
                  {r.is_published ? "Published" : r.review_status || "Not published"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── SUBMIT ────────────────────────────────────────────────────────── */}
      {maySubmitHere && (
        <Card>
          <div className="flex flex-wrap gap-2 mb-6">
            {[
              ["rule", "Submit a rule"],
              ["resource", "Submit an official resource"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  tab === key ? "bg-accent text-accent-fg" : "border border-stroke text-paper-dim hover:text-paper"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {message && (
            <p className="text-paper text-sm leading-relaxed mb-5 flex gap-2">
              <FiCheckCircle className="text-accent mt-0.5 shrink-0" aria-hidden />
              {message}
            </p>
          )}
          {error && <p className="text-gold text-sm mb-5">{error}</p>}

          {tab === "rule" ? (
            <form onSubmit={sendProvision} className="grid gap-5">
              <Field label="Which requirement" required>
                <select value={provisionForm.topicKey} onChange={setP("topicKey")} className={inputClass}>
                  <option value="">Choose a requirement</option>
                  {topics.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              {topic && <p className="text-paper-dim text-xs leading-relaxed -mt-3">{topic.question}</p>}

              <fieldset className="grid gap-2">
                <legend className="text-paper text-xs font-medium mb-1">What are you telling us? *</legend>
                {SUBMITTABLE_STATES.map((state) => (
                  <label key={state.key} className="flex gap-3 items-start">
                    <input
                      type="radio"
                      name="fieldState"
                      value={state.key}
                      checked={provisionForm.fieldState === state.key}
                      onChange={setP("fieldState")}
                      className="mt-1 accent-accent"
                    />
                    <span>
                      <span className="text-paper text-sm">{FIELD_STATE_LABELS[state.key]}</span>
                      <span className="block text-paper-dim text-xs leading-relaxed">{state.hint}</span>
                    </span>
                  </label>
                ))}
                <p className="text-paper-dim text-xs leading-relaxed mt-1">
                  There is no third option here on purpose. "{FIELD_STATE_LABELS[FIELD_STATE.UNRESEARCHED]}" is the
                  absence of a record rather than something to file.
                </p>
              </fieldset>

              {provisionForm.fieldState === FIELD_STATE.VERIFIED && (
                <>
                  {topic?.value_kind === "boolean" ? (
                    <Field label="The answer" required>
                      <select value={provisionForm.valueBoolean} onChange={setP("valueBoolean")} className={inputClass}>
                        <option value="">Choose</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </Field>
                  ) : topic?.value_kind === "number" ? (
                    <Field label={`The number${topic?.value_unit ? ` (${topic.value_unit})` : ""}`} required>
                      <input
                        type="number"
                        step="any"
                        value={provisionForm.valueNumeric}
                        onChange={setP("valueNumeric")}
                        className={inputClass}
                      />
                    </Field>
                  ) : (
                    <Field label="What the source says" required>
                      <textarea value={provisionForm.valueText} onChange={setP("valueText")} rows={3} className={inputClass} />
                    </Field>
                  )}
                  <Field
                    label="Conditions or exceptions"
                    hint="Where the rule holds only in some cases. A qualifier is kept beside the value rather than folded into it."
                  >
                    <input value={provisionForm.valueQualifier} onChange={setP("valueQualifier")} className={inputClass} />
                  </Field>
                </>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Source link" required hint="The jurisdiction's own page, code section, ordinance or permit system.">
                  <input value={provisionForm.sourceUrl} onChange={setP("sourceUrl")} className={inputClass} placeholder="https://" />
                </Field>
                <Field label="Source type" required hint="The kind of official source this rule comes from.">
                  <select
                    value={provisionForm.sourceType}
                    onChange={setP("sourceType")}
                    aria-required="true"
                    className={inputClass}
                  >
                    <option value="">Choose</option>
                    {Object.entries(SOURCE_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Document title" hint="What the source is called, as it is titled.">
                  <input value={provisionForm.sourceDocumentTitle} onChange={setP("sourceDocumentTitle")} className={inputClass} />
                </Field>
                <Field label="Citation" hint="Section or ordinance number, where there is one.">
                  <input value={provisionForm.sourceCitation} onChange={setP("sourceCitation")} className={inputClass} />
                </Field>
                <Field label={PROVISION_DATES[0].label} hint={PROVISION_DATES[0].means}>
                  <input type="date" value={provisionForm.effectiveDate} onChange={setP("effectiveDate")} className={inputClass} />
                </Field>
                {held.provisions.length > 0 && (
                  <Field
                    label="Correcting something ADUAtlas publishes"
                    hint="Optional. Naming the record you are correcting keeps the previous version readable instead of replacing it."
                  >
                    <select value={provisionForm.targetProvisionId} onChange={setP("targetProvisionId")} className={inputClass}>
                      <option value="">A new rule</option>
                      {held.provisions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {topics.find((t) => t.key === p.topic_key)?.label || p.topic_key}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              <p className="text-paper-dim text-xs leading-relaxed">
                {PROVISION_DATES[1].label}: {PROVISION_DATES[1].means} {PROVISION_DATES[2].label}: {PROVISION_DATES[2].means}
              </p>

              <Field label="Anything else for the reviewer">
                <textarea value={provisionForm.note} onChange={setP("note")} rows={3} className={inputClass} />
              </Field>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press disabled:opacity-50"
                >
                  {busy ? "Sending" : "Send to ADUAtlas for review"}
                </button>
                <p className="text-paper-dim text-xs max-w-xs leading-relaxed">
                  This sends a statement. It does not publish anything, and what you send is kept alongside what
                  ADUAtlas publishes even where the two differ.
                </p>
              </div>
            </form>
          ) : (
            <form onSubmit={sendResource} className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Resource type" required>
                  <select value={resourceForm.resourceType} onChange={setR("resourceType")} className={inputClass}>
                    <option value="">Choose</option>
                    {Object.entries(RESOURCE_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Label" required hint="What a homeowner should see, in their words.">
                  <input value={resourceForm.label} onChange={setR("label")} className={inputClass} placeholder="ADU permit application" />
                </Field>
                <Field label="Link">
                  <input value={resourceForm.url} onChange={setR("url")} className={inputClass} placeholder="https://" />
                </Field>
                <Field label="Department">
                  <input value={resourceForm.departmentName} onChange={setR("departmentName")} className={inputClass} />
                </Field>
                <Field label="Phone">
                  <input value={resourceForm.phone} onChange={setR("phone")} className={inputClass} />
                </Field>
                <Field label="Email">
                  <input value={resourceForm.email} onChange={setR("email")} className={inputClass} />
                </Field>
                <Field label="Contact name" hint="Only a role or a person your entity publishes publicly.">
                  <input value={resourceForm.contactName} onChange={setR("contactName")} className={inputClass} />
                </Field>
                <Field label="Contact title">
                  <input value={resourceForm.contactTitle} onChange={setR("contactTitle")} className={inputClass} />
                </Field>
                <Field label="Source link" required hint="Where this resource is published on your own site.">
                  <input value={resourceForm.sourceUrl} onChange={setR("sourceUrl")} className={inputClass} placeholder="https://" />
                </Field>
                <Field label="Source type" required hint="The kind of official source that publishes this resource.">
                  <select
                    value={resourceForm.sourceType}
                    onChange={setR("sourceType")}
                    aria-required="true"
                    className={inputClass}
                  >
                    <option value="">Choose</option>
                    {Object.entries(SOURCE_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Notes a homeowner needs">
                <textarea value={resourceForm.notes} onChange={setR("notes")} rows={3} className={inputClass} />
              </Field>
              {held.resources.length > 0 && (
                <Field label="Correcting a resource ADUAtlas publishes" hint="Optional.">
                  <select value={resourceForm.targetResourceId} onChange={setR("targetResourceId")} className={inputClass}>
                    <option value="">A new resource</option>
                    {held.resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Anything else for the reviewer">
                <textarea value={resourceForm.note} onChange={setR("note")} rows={3} className={inputClass} />
              </Field>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  disabled={busy || !isSourceType(resourceForm.sourceType)}
                  className="px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? "Sending" : "Send to ADUAtlas for review"}
                </button>
                {!isSourceType(resourceForm.sourceType) && (
                  <p data-source-type-needed className="text-paper-dim text-xs max-w-xs leading-relaxed">
                    Choose a source type above to send this resource.
                  </p>
                )}
              </div>
            </form>
          )}
        </Card>
      )}

      {/* ── BOTH SIDES OF THE RECORD ──────────────────────────────────────── */}
      <Card>
        <h2 className="font-display text-paper text-xl">What you have sent</h2>
        <p className="text-paper-dim text-sm leading-relaxed mt-2">
          Every submission stays in the record with ADUAtlas's answer beside it, including a rejection and its
          reason. A submission is a statement somebody made on a date, so it is never edited: if you change your
          mind, withdraw it and send another, and both statements remain readable.
        </p>
        {submissions.length > 0 ? (
          historyList(true)
        ) : submissionsFailed ? (
          historyUnread
        ) : submissionsRead ? (
          <p className="text-paper-dim text-sm mt-4">Nothing sent yet.</p>
        ) : (
          <p className="text-paper-dim text-sm mt-4">Reading what you have sent.</p>
        )}
      </Card>

      <p className="text-paper-dim text-xs leading-relaxed">{FEASIBILITY_BOUNDARY}</p>
    </div>
  );
};

export default GovRegulatory;
