import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { FiCheck, FiCopy } from "react-icons/fi";
import {
  createPartnerCode,
  createPartnerLink,
  deactivatePartnerCode,
  deactivatePartnerLink,
  fetchPartnerAnalytics,
  fetchPartnerCodes,
  fetchPartnerLinks,
  isActivePartner,
  partnershipStatusLabel,
  residentAccessIssuance,
  sponsoredEmbedSnippet,
  sponsoredEntryUrl,
} from "../../lib/govPartnership";

// Resident access for an ACTIVE ADUAtlas education partnership (Phase 1 spec,
// decision 2p).
//
// THE GATE IS THE DATABASE, NOT THIS FILE. Nothing on this page can create a
// partnership, activate one, or grant an entitlement. The sponsored grant is
// redeem_partner_access(), a service-role-only RPC that api/partner-redeem.js
// calls on the server. Issuing a link or a code is the partner's own insert, and
// 0014's row policy and guard trigger refuse it unless the partnership is ACTIVE,
// the identity VERIFIED, the member a contributor or administrator, and the
// jurisdiction granted. residentAccessIssuance() mirrors those conditions so this
// page never offers a control the database will refuse; hiding a control is not
// what stops anybody.
//
// A VERIFIED NON-PARTNER SEES NO TOOLING. Not a disabled button, not a preview:
// the layout leaves the nav item out, and if this route is opened directly it says
// plainly why resident access cannot be issued and stops. Identity verification
// never activates a partnership, and this page is where that would be tempting to
// blur.
//
// TWO DISTRIBUTION METHODS, ONE SYSTEM. A link and a code resolve to the same
// sponsored entitlement and the same attribution through the same endpoint. They
// are two doors, not two implementations.
//
// ANALYTICS STAY AGGREGATE. This page renders NUMBERS from the analytics payload
// and drops anything else, so a partner cannot learn who redeemed what even if a
// future payload carries more than it should.
//
// WHAT THE COPY MAY NEVER SAY. A partner sponsors education. It does not endorse
// ADUAtlas, any builder, any feasibility result or any construction project.
//
// UNKNOWN MEANS UNKNOWN. A read that failed is reported as a failed read, never as
// "no links yet": an empty list and an unanswered question are different facts.

const Card = ({ children, className = "" }) => (
  <div className={`bg-canvas border border-stroke rounded-3xl p-6 sm:p-8 ${className}`}>{children}</div>
);

const Eyebrow = ({ children }) => (
  <p className="text-paper-dim text-[0.6rem] uppercase tracking-wider mb-2">{children}</p>
);

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

// The columns public.partner_analytics actually has (migration 0014), in the order
// a partner reads them. Anything else the payload carries is rendered only if it is
// a plain number, and never if its key names a person.
const ANALYTICS_LABELS = {
  active_links: "Active links",
  active_codes: "Active codes",
  link_visits: "Link visits",
  link_redemptions: "Link redemptions",
  code_redemptions: "Code redemptions",
  sponsored_activations: "Sponsored activations",
  course_starts: "Course starts",
  course_completions: "Course completions",
};
const ANALYTICS_ORDER = Object.keys(ANALYTICS_LABELS);

// THE UNMEASURED ZERO. partner_analytics carries course_progress_instrumented for
// one reason: a zero next to false means "ADUAtlas has not recorded a course event
// yet", and a zero next to true means "no resident started". Printing the first as
// the second would be a fabricated number on a government's dashboard, which is
// exactly what 2b forbids one layer up.
const COURSE_KEYS = new Set(["course_starts", "course_completions"]);

const numberFields = (payload) => {
  if (!payload || typeof payload !== "object") return [];
  const IDENTIFYING = /email|first_name|last_name|full_name|address|phone|user_id|resident|homeowner|auth/i;
  const instrumented = payload.course_progress_instrumented !== false;
  const rows = Object.entries(payload)
    .filter(([key, value]) => typeof value === "number" && Number.isFinite(value) && !IDENTIFYING.test(key))
    .map(([key, value]) => ({
      key,
      value,
      measured: instrumented || !COURSE_KEYS.has(key),
      label: ANALYTICS_LABELS[key] || key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    }));
  const rank = (key) => {
    const at = ANALYTICS_ORDER.indexOf(key);
    return at === -1 ? ANALYTICS_ORDER.length : at;
  };
  return rows.sort((a, b) => rank(a.key) - rank(b.key));
};

const CopyRow = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="grid gap-2">
      {label && <span className="text-paper-dim text-xs">{label}</span>}
      <div className="flex items-center gap-2">
        <code className="flex-1 px-4 py-3 rounded-xl bg-surface-1-solid border border-stroke text-paper text-xs break-all">
          {value}
        </code>
        <button
          onClick={copy}
          className="px-4 py-3 rounded-xl border border-stroke text-paper-dim text-xs hover:border-accent hover:text-paper transition-colors press shrink-0"
          aria-label={`Copy ${label || "value"}`}
        >
          {copied ? <FiCheck aria-hidden /> : <FiCopy aria-hidden />}
        </button>
      </div>
    </div>
  );
};

// Switching a link or code off asks once, because it cannot be undone from here
// and a printed code may already be on a counter.
const SwitchOff = ({ kind, pending, asking, onAsk, onCancel, onConfirm }) =>
  asking ? (
    <div className="grid gap-2">
      <p className="text-paper-dim text-xs leading-relaxed">
        Switch this {kind} off? New residents will not get access through it. Residents who already have access keep
        it.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onConfirm}
          disabled={pending}
          className="px-4 py-2 rounded-xl border border-stroke text-paper text-xs font-medium hover:border-accent transition press disabled:opacity-50"
        >
          {pending ? "Switching off" : `Yes, switch this ${kind} off`}
        </button>
        <button
          onClick={onCancel}
          disabled={pending}
          className="px-4 py-2 rounded-xl text-paper-dim text-xs hover:text-paper transition-colors disabled:opacity-50"
        >
          Keep it on
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={onAsk}
      className="justify-self-start px-4 py-2 rounded-xl border border-stroke text-paper-dim text-xs hover:border-accent hover:text-paper transition-colors press"
    >
      Switch this {kind} off
    </button>
  );

const GovPartnership = () => {
  const { membership, partnership, identityVerified, partnershipLoading, partnershipError } = useOutletContext();

  // THE TWO GATES. Reading the partnership's links, codes and numbers needs an
  // ACTIVE partnership of a VERIFIED entity. Issuing or switching off needs that
  // and the rest of residentAccessIssuance(): an issuing role and a granted
  // jurisdiction.
  const issuance = residentAccessIssuance({ membership, partnership });
  const showTools = Boolean(identityVerified && isActivePartner(partnership));
  const mayIssue = showTools && issuance.allowed;

  const partnershipId = partnership?.id || null;
  const jurisdictions = useMemo(() => membership?.jurisdictions || [], [membership]);

  // One keyed read for all three fetches, keyed by PARTNERSHIP, which is what the
  // library filters on. Keying it is what lets the render derive the lists instead
  // of an effect clearing them.
  const [read, setRead] = useState({ key: null, links: [], codes: [], analytics: null, error: null });
  const [nonce, setNonce] = useState(0);
  const [form, setForm] = useState({ jurisdictionId: "", label: "" });
  const [busy, setBusy] = useState("");
  const [asking, setAsking] = useState("");
  const [notice, setNotice] = useState({ tone: "", text: "" });

  useEffect(() => {
    if (!showTools || !partnershipId) return undefined;
    let alive = true;
    Promise.all([
      fetchPartnerLinks(partnershipId),
      fetchPartnerCodes(partnershipId),
      fetchPartnerAnalytics(partnershipId),
    ])
      .then(([l, c, a]) => {
        if (!alive) return;
        setRead({
          key: partnershipId,
          links: l.ok ? l.links : [],
          codes: c.ok ? c.codes : [],
          analytics: a.ok ? a.analytics : null,
          error: !l.ok || !c.ok ? l.error || c.error || "unavailable" : null,
        });
      })
      .catch(() => {
        if (alive) setRead({ key: partnershipId, links: [], codes: [], analytics: null, error: "unavailable" });
      });
    return () => {
      alive = false;
    };
  }, [showTools, partnershipId, nonce]);

  const ready = read.key === partnershipId;
  const links = ready ? read.links : [];
  const codes = ready ? read.codes : [];
  const analytics = ready ? read.analytics : null;
  const readError = ready ? read.error : null;
  const loading = showTools && Boolean(partnershipId) && !ready;

  const jurisdictionName = (id) => jurisdictions.find((j) => j.jurisdiction_id === id)?.name || null;
  const entryUrl = (row) => row?.url || (row?.token ? sponsoredEntryUrl(row.token) : "");
  const entryBase = sponsoredEntryUrl();

  const analyticsRows = useMemo(() => numberFields(analytics), [analytics]);
  // The embed uses a link that works today. A switched-off link on a government's
  // own page would be a dead link with the government's name on it.
  const primaryLink = links.find((row) => row.is_active) || null;
  const primaryUrl = primaryLink ? entryUrl(primaryLink) : "";

  const selectedJurisdiction = form.jurisdictionId || jurisdictions[0]?.jurisdiction_id || "";

  const create = async (kind) => {
    if (!mayIssue || !partnershipId || !selectedJurisdiction) return;
    setBusy(kind);
    setNotice({ tone: "", text: "" });
    let res;
    try {
      const fn = kind === "code" ? createPartnerCode : createPartnerLink;
      res = await fn({ partnershipId, jurisdictionId: selectedJurisdiction, label: form.label });
    } catch (err) {
      res = { ok: false, error: err?.message || "failed" };
    }
    setBusy("");
    if (!res?.ok) {
      setNotice({
        tone: "error",
        text:
          res?.error === "logged-out"
            ? "Your session has ended. Sign in again, then try once more. Nothing was created."
            : "ADUAtlas did not accept that, so nothing was created. A link or code can be created only for a jurisdiction ADUAtlas granted this entity, while the entity is verified and the partnership is active.",
      });
      return;
    }
    setForm((prev) => ({ ...prev, label: "" }));
    setNotice({
      tone: "ok",
      text: kind === "code" ? "Your new code is listed under resident access codes." : "Your new link is listed under resident access links.",
    });
    setNonce((n) => n + 1);
  };

  const switchOff = async (kind, id) => {
    if (!mayIssue) return;
    setBusy(`off:${id}`);
    setNotice({ tone: "", text: "" });
    let res;
    try {
      res = kind === "code" ? await deactivatePartnerCode(id) : await deactivatePartnerLink(id);
    } catch (err) {
      res = { ok: false, error: err?.message || "failed" };
    }
    setBusy("");
    setAsking("");
    if (!res?.ok) {
      setNotice({
        tone: "error",
        text: `ADUAtlas did not accept that, so the ${kind} is still on. Try again, or contact ADUAtlas if it keeps happening.`,
      });
      return;
    }
    setNotice({ tone: "ok", text: `The ${kind} is switched off.` });
    setNonce((n) => n + 1);
  };

  // ── the partnership has not been read, or could not be: say so ───────────
  // Until the read lands there is no partnership row, and treating that as "no
  // partnership" would tell an active partner, for a moment, that it has none.
  if (identityVerified && (partnershipLoading || partnershipError)) {
    return (
      <div className="px-5 sm:px-8 py-10 sm:py-14 max-w-3xl grid gap-6">
        <header>
          <p className="text-paper-dim text-xs uppercase tracking-wider">Government portal</p>
          <h1 className="font-display text-paper text-3xl sm:text-4xl mt-2 leading-tight">Resident access</h1>
        </header>
        <Card>
          <p className="text-paper-dim text-sm leading-relaxed">
            {partnershipLoading
              ? "Reading your partnership."
              : "We could not read this entity's partnership just now, so this page cannot say whether resident access can be issued. Reload the page to try again."}
          </p>
        </Card>
      </div>
    );
  }

  // ── no active partnership, or no verified identity: say why, and stop ────
  if (!showTools) {
    const heading =
      issuance.reason === "withdrawn"
        ? "Verification withdrawn"
        : issuance.reason === "unverified"
          ? "Not available yet"
          : partnershipStatusLabel(partnership);
    return (
      <div className="px-5 sm:px-8 py-10 sm:py-14 max-w-3xl grid gap-6">
        <header>
          <p className="text-paper-dim text-xs uppercase tracking-wider">Government portal</p>
          <h1 className="font-display text-paper text-3xl sm:text-4xl mt-2 leading-tight">Resident access</h1>
        </header>
        <Card>
          <p className="text-paper text-sm font-medium">{heading}</p>
          <p className="text-paper-dim text-sm leading-relaxed mt-3">
            {issuance.sentence ||
              "This entity does not have an active ADUAtlas Education Partnership, so resident access links and codes cannot be issued."}
          </p>
          {(issuance.reason === "none" || issuance.reason === "unverified") && (
            <p className="text-paper-dim text-sm leading-relaxed mt-3">
              Verifying a government identity does not activate a partnership. A partnership is a separate agreement,
              it is never described as a verification, and it cannot be switched on from this portal.
            </p>
          )}
          <Link to="/gov" className="mt-5 inline-block text-accent text-sm font-medium">
            Back to the portal
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-5 sm:px-8 py-10 sm:py-14 max-w-4xl grid gap-6">
      <header>
        <p className="text-paper-dim text-xs uppercase tracking-wider">Government portal</p>
        <h1 className="font-display text-paper text-3xl sm:text-4xl mt-2 leading-tight">Resident access</h1>
        <p className="text-paper-dim text-sm leading-relaxed mt-4">
          {membership?.entity_name} is an ADUAtlas Education Partner. Residents who arrive through a link or enter a
          code below receive the $79 Golden educational access at no cost to them.
        </p>
      </header>

      {/* ── THE COMMERCIAL RULE, where a partner will read it ──────────────── */}
      <Card className="bg-surface-1-solid">
        <Eyebrow>What the sponsorship covers</Eyebrow>
        <ul className="grid gap-2.5 text-paper-dim text-sm leading-relaxed">
          <li>The Golden educational access, normally $79. That is the whole of it.</li>
          <li>
            Platinum and Concierge are not included and do not become free. Feasibility studies and site plans are
            not included. Builder marketplace terms are untouched.
          </li>
          <li>
            A sponsored resident who later wants Platinum or Concierge upgrades at the normal published price, with
            the price shown before they buy.
          </li>
          <li>
            Sponsoring education is not an endorsement. Nothing ADUAtlas publishes may say or imply that{" "}
            {membership?.entity_name} endorses ADUAtlas, a builder, a feasibility result or a project, and the page a
            resident lands on says so in plain words.
          </li>
        </ul>
      </Card>

      {/* ── ISSUE, only where the database will accept it ────────────────── */}
      <Card>
        <h2 className="font-display text-paper text-xl sm:text-2xl">Create a link or a code</h2>
        {mayIssue ? (
          <>
            <p className="text-paper-dim text-sm leading-relaxed mt-3">
              You can create one for any jurisdiction ADUAtlas granted this entity. ADUAtlas generates the link
              address and the code itself. Nobody chooses one, so a link cannot be made to look like another
              jurisdiction&apos;s.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-paper text-xs font-medium mb-2">Jurisdiction</span>
                <select
                  value={selectedJurisdiction}
                  onChange={(event) => setForm((prev) => ({ ...prev, jurisdictionId: event.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-surface-1-solid border border-stroke text-paper text-sm focus:outline-none focus:border-accent transition"
                >
                  {jurisdictions.map((j) => (
                    <option key={j.jurisdiction_id} value={j.jurisdiction_id}>
                      {j.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-paper text-xs font-medium mb-2">Label</span>
                <input
                  value={form.label}
                  maxLength={120}
                  onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="Spring mailer"
                  className="w-full px-4 py-3 rounded-xl bg-surface-1-solid border border-stroke text-paper text-sm placeholder:text-paper-dim/60 focus:outline-none focus:border-accent transition"
                />
                <span className="mt-1.5 block text-xs text-paper-dim">
                  For your own records. Residents never see it.
                </span>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => create("link")}
                disabled={Boolean(busy)}
                className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press disabled:opacity-50"
              >
                {busy === "link" ? "Creating the link" : "Create a link"}
              </button>
              <button
                onClick={() => create("code")}
                disabled={Boolean(busy)}
                className="px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press disabled:opacity-50"
              >
                {busy === "code" ? "Creating the code" : "Create a code"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-paper-dim text-sm leading-relaxed mt-3">{issuance.sentence}</p>
        )}
        {notice.text && (
          <p role="status" className={`text-sm mt-4 ${notice.tone === "error" ? "text-gold" : "text-paper"}`}>
            {notice.text}
          </p>
        )}
      </Card>

      {readError && (
        <Card>
          <p className="text-paper-dim text-sm leading-relaxed">
            We could not read your links and codes just now, so this page cannot say which ones exist. Reload the page
            to try again.
          </p>
        </Card>
      )}

      {/* ── LINKS ─────────────────────────────────────────────────────────── */}
      <Card>
        <Eyebrow>Resident access links</Eyebrow>
        <h2 className="font-display text-paper text-xl sm:text-2xl">A link for your own website</h2>
        <p className="text-paper-dim text-sm leading-relaxed mt-3">
          A link and a code do the same thing through the same server check. Neither one decides what a resident
          receives: the server does, and an invalid, expired or switched-off link grants nothing at all.
        </p>
        {loading ? (
          <p className="text-paper-dim text-sm mt-4">Reading your links.</p>
        ) : readError ? null : links.length === 0 ? (
          <p className="text-paper-dim text-sm leading-relaxed mt-4">
            No resident access link exists yet.{mayIssue ? " Create one above." : ""}
          </p>
        ) : (
          <ul className="mt-5 grid gap-5">
            {links.map((row) => {
              const url = entryUrl(row);
              const active = Boolean(row.is_active);
              const place = jurisdictionName(row.jurisdiction_id);
              return (
                <li key={row.id} data-partner-link={row.id} className="border border-stroke rounded-2xl p-4 grid gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-paper text-sm font-medium">{row.label || "Resident access link"}</span>
                    <span className={`text-xs font-medium ${active ? "text-accent" : "text-paper-dim"}`}>
                      {active ? "Active" : "Switched off"}
                    </span>
                    {place && <span className="text-paper-dim text-xs">{place}</span>}
                    {row.expires_at && <span className="text-paper-dim text-xs">Expires {formatDate(row.expires_at)}</span>}
                    {typeof row.max_redemptions === "number" && (
                      <span className="text-paper-dim text-xs">Limit {row.max_redemptions}</span>
                    )}
                  </div>
                  {url ? (
                    <CopyRow value={url} label="Link" />
                  ) : (
                    <p className="text-paper-dim text-xs">This link has no address recorded, so there is nothing to share.</p>
                  )}
                  {!active && (
                    <p className="text-paper-dim text-xs leading-relaxed">
                      A switched-off link grants nothing. Residents who already have sponsored access keep it.
                    </p>
                  )}
                  {active && mayIssue && (
                    <SwitchOff
                      kind="link"
                      pending={busy === `off:${row.id}`}
                      asking={asking === `link:${row.id}`}
                      onAsk={() => setAsking(`link:${row.id}`)}
                      onCancel={() => setAsking("")}
                      onConfirm={() => switchOff("link", row.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── CODES ─────────────────────────────────────────────────────────── */}
      <Card>
        <Eyebrow>Resident access codes</Eyebrow>
        <h2 className="font-display text-paper text-xl sm:text-2xl">A code for print and counter</h2>
        <p className="text-paper-dim text-sm leading-relaxed mt-3">
          A code suits a mailer, a permit counter handout or a workshop slide. It resolves to the same sponsored
          access and the same attribution as a link. Codes are checked on the server, and guessing at one is
          rate limited and recorded rather than quietly allowed.
        </p>
        {loading ? (
          <p className="text-paper-dim text-sm mt-4">Reading your codes.</p>
        ) : readError ? null : codes.length === 0 ? (
          <p className="text-paper-dim text-sm leading-relaxed mt-4">
            No resident access code exists yet.{mayIssue ? " Create one above." : ""}
          </p>
        ) : (
          <ul className="mt-5 grid gap-4">
            {codes.map((row) => {
              const active = Boolean(row.is_active);
              const place = jurisdictionName(row.jurisdiction_id);
              return (
                <li key={row.id} data-partner-code={row.id} className="border border-stroke rounded-2xl p-4 grid gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-paper text-sm font-medium tracking-wide">{row.code || "No code recorded"}</span>
                    <span className={`text-xs font-medium ${active ? "text-accent" : "text-paper-dim"}`}>
                      {active ? "Active" : "Switched off"}
                    </span>
                    {row.label && <span className="text-paper-dim text-xs">{row.label}</span>}
                    {place && <span className="text-paper-dim text-xs">{place}</span>}
                    {typeof row.max_redemptions === "number" && (
                      <span className="text-paper-dim text-xs">Limit {row.max_redemptions}</span>
                    )}
                    {row.expires_at && <span className="text-paper-dim text-xs">Expires {formatDate(row.expires_at)}</span>}
                  </div>
                  <p className="text-paper-dim text-xs leading-relaxed">Residents enter it at {entryBase}.</p>
                  {active && mayIssue && (
                    <SwitchOff
                      kind="code"
                      pending={busy === `off:${row.id}`}
                      asking={asking === `code:${row.id}`}
                      onAsk={() => setAsking(`code:${row.id}`)}
                      onCancel={() => setAsking("")}
                      onConfirm={() => switchOff("code", row.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── EMBED, for the government's own site ──────────────────────────── */}
      {primaryUrl && (
        <Card>
          <Eyebrow>For your own website</Eyebrow>
          <h2 className="font-display text-paper text-xl sm:text-2xl">Copy this onto your ADU page</h2>
          <p className="text-paper-dim text-sm leading-relaxed mt-3">
            Plain HTML, with no script and nothing that tracks your visitors. The link text says that{" "}
            {membership?.entity_name || "your government"} sponsors the course, because that is what is true.
          </p>
          <div className="mt-5 grid gap-4">
            <CopyRow value={primaryUrl} label="Link" />
            <CopyRow
              value={sponsoredEmbedSnippet({ token: primaryLink.token, entityName: membership?.entity_name })}
              label="HTML"
            />
          </div>
        </Card>
      )}

      {/* ── ANALYTICS, aggregate by construction ──────────────────────────── */}
      <Card>
        <Eyebrow>Usage</Eyebrow>
        <h2 className="font-display text-paper text-xl sm:text-2xl">How many residents came through</h2>
        {analyticsRows.length === 0 ? (
          <p className="text-paper-dim text-sm leading-relaxed mt-3">
            {loading ? "Reading your usage." : "No usage recorded yet."}
          </p>
        ) : (
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {analyticsRows.map((row) => (
              <div key={row.key} className="border border-stroke rounded-2xl p-4">
                <dt className="text-paper-dim text-xs">{row.label}</dt>
                {row.measured ? (
                  <dd className="text-paper text-2xl font-display mt-1">{row.value.toLocaleString("en-US")}</dd>
                ) : (
                  <dd className="text-paper-dim text-sm mt-2 leading-relaxed">
                    Not measured yet. ADUAtlas is not recording course starts and completions against sponsored
                    residents yet, so this is not a count of zero.
                  </dd>
                )}
              </div>
            ))}
          </dl>
        )}
        <p className="text-paper-dim text-xs leading-relaxed mt-5">
          These are counts and nothing else. ADUAtlas never shows a partner an individual resident&apos;s name, email,
          address, property or progress, and sponsoring somebody&apos;s access does not change that.
        </p>
      </Card>

      {partnership?.suspended_at && (
        <Card>
          <p className="text-paper-dim text-sm leading-relaxed">
            This partnership records a suspension on {formatDate(partnership.suspended_at)}. While a partnership is
            suspended, new sponsored activations stop and the accounts of residents who already have access are left
            exactly as they are.
          </p>
        </Card>
      )}
    </div>
  );
};

export default GovPartnership;
