import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { FiArrowRight, FiCheckCircle, FiClock, FiExternalLink } from "react-icons/fi";
import {
  FEASIBILITY_BOUNDARY,
  FIELD_STATE,
  FIELD_STATE_LABELS,
  GOVERNMENT_BADGE_DOES_NOT_MEAN,
  GOVERNMENT_BADGE_LABEL,
  GOVERNMENT_BADGE_MEANS,
  JURISDICTION_TYPE_LABELS,
  MEMBERSHIP_ROLE_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  SUBMISSION_PROMISE,
  fetchJurisdiction,
  jurisdictionUrl,
} from "../../lib/regulatory";
import { identityWithdrawn, residentAccessIssuance } from "../../lib/govPartnership";

// The government portal's home page (Phase 1 spec, decisions 2m, 2o and 2p).
//
// WHAT THIS PAGE IS FOR: showing a government user the truth about their own
// account, in the two states that must never merge, plus the authority they
// actually hold. It grants nothing, publishes nothing and verifies nothing.
//
// IDENTITY AND PARTNERSHIP ARE TWO CARDS. Not one card with two lines, not one
// badge with two meanings:
//   "Verified Government Account"  = identity. ADUAtlas confirmed this account is
//                                   controlled by the stated government. It says
//                                   nothing about endorsement, nothing about any
//                                   builder, and nothing about whether a rule is
//                                   legally correct.
//   "ADUAtlas Education Partner"   = partnership. A separate agreement that a
//                                   verified entity activated. It is NEVER called
//                                   verified, and identity verification does not
//                                   produce it.
// A third fact, regulatory source verification, is held per record and per field
// and is not an account state at all. All three are named on this page so the
// difference is unavoidable.
//
// A CLAIMED BUT UNVERIFIED USER IS PROMISED NOTHING. The pending card says what
// is true: the claim was recorded, ADUAtlas has not confirmed their authority,
// and there is nothing to do here yet.

// The five identity states of 2p, read from stored state and never computed into
// a sixth. The database keeps them in two columns on purpose: the entity's
// verification_status and this person's membership status. The badge needs BOTH
// to be verified, which fails closed if one is ever ahead of the other.
//
// WITHDRAWN (0020, stored as 'suspended') is the state where they disagree: the
// membership is still verified and the entity is not. It used to fall through to
// "Not claimed", which told a government ADUAtlas had once verified that it had
// never taken part at all (DEF-22). identityWithdrawn() names it.
const identityStateOf = (membership) => {
  const entityState = membership?.entity_state || "unclaimed";
  const status = membership?.membership_status || "pending";
  if (identityWithdrawn(membership)) {
    return {
      key: "identity_withdrawn",
      tone: "none",
      heading: "Verification withdrawn",
      body: "ADUAtlas verified this entity and has since withdrawn that verification. While it is withdrawn, this account carries no badge, cannot submit rules or resources, and cannot issue resident access links or codes. Your membership is kept on record. Contact ADUAtlas if you think this is wrong.",
    };
  }
  if (status === "verified" && entityState === "verified") {
    return {
      key: "identity_verified",
      tone: "verified",
      heading: GOVERNMENT_BADGE_LABEL,
      body: `${GOVERNMENT_BADGE_MEANS} ${GOVERNMENT_BADGE_DOES_NOT_MEAN}`,
    };
  }
  if (status === "rejected") {
    return {
      key: "verification_rejected",
      tone: "none",
      heading: "Verification not accepted",
      body: "ADUAtlas reviewed this claim and did not confirm authority to represent the entity. Nothing about the record changed, and you can contact us if you believe this is wrong.",
    };
  }
  if (status === "revoked") {
    return {
      key: "suspended",
      tone: "none",
      heading: "Access ended",
      body: "This membership was revoked, so it reaches nothing. A person who represents the entity again claims it again; the previous membership stays in the record with its date.",
    };
  }
  if (status === "pending") {
    return {
      key: "claim_pending",
      tone: "pending",
      heading: "Claim pending",
      body: "Your claim is recorded and ADUAtlas has not yet confirmed your authority to represent this entity. This state carries no badge, no publishing right and no authority over any record. A claim is not a verification.",
    };
  }
  return {
    key: "unclaimed",
    tone: "none",
    heading: "Not claimed",
    body: "ADUAtlas compiled this record from public government sources. Nothing here implies the government takes part in ADUAtlas.",
  };
};

// A government ENTITY's type, in words. These are the entity types of 0012
// (government_entities.entity_type), which are not jurisdiction types: the portal
// used to look them up in the jurisdiction map, found nothing for "city" and
// printed the raw key. The admin console's words (api/admin/_regulatory.js), with
// "government" added where the console's one-word label would read as a place
// rather than as the body a person represents. An unknown type is shown as an
// unnamed government body rather than as a database key.
const ENTITY_TYPE_LABELS = {
  city: "City government",
  county: "County government",
  state: "State government",
  state_agency: "State agency",
  regional: "Regional body",
  tribal: "Tribal government",
  special_district: "Special district",
  other: "Other government body",
};
const entityTypeLabel = (type) => ENTITY_TYPE_LABELS[type] || "Government body";

// The membership roles whose label (MEMBERSHIP_ROLE_LABELS) says the person can
// submit. Used by the header's role line (T4-10).
const SUBMITTING_ROLES = ["contributor", "administrator"];

const Card = ({ children, className = "" }) => (
  <div className={`bg-canvas border border-stroke rounded-3xl p-6 sm:p-8 ${className}`}>{children}</div>
);

const Eyebrow = ({ children }) => (
  <p className="text-paper-dim text-[0.6rem] uppercase tracking-wider mb-2">{children}</p>
);

// The last segment of a jurisdiction path is its slug, which is the identifier the
// public rules page is fetched by. Derived rather than guessed: the path is built
// from the slugs by the database trigger in migration 0012.
const slugOf = (path) => String(path || "").split("/").filter(Boolean).pop() || null;

const GovPortal = () => {
  const {
    membership,
    liveMemberships,
    memberships,
    identityVerified,
    partnership,
    partnershipStatus,
    partnershipStatusLabels,
    partnershipAvailable,
    partnershipLoading,
    partnershipError,
    activePartner,
  } = useOutletContext();

  const [publicUrls, setPublicUrls] = useState({});

  const jurisdictions = useMemo(() => membership?.jurisdictions || [], [membership]);
  const identity = identityStateOf(membership);
  const withdrawn = identity.key === "identity_withdrawn";
  // A grant is authority only while the identity behind it is verified. The
  // database refuses a submission from a withdrawn entity whatever may_submit
  // says, so this page never shows one as submittable (DEF-22).
  const submitGrants = identityVerified ? jurisdictions.filter((j) => j.may_submit) : [];
  const issuance = residentAccessIssuance({ membership, partnership });
  // T4-10 (RC4 rehearsal): a verified entity with no jurisdiction grant was
  // headed "Can submit" while the card below said there was nothing to submit
  // against. A role whose label promises submitting is shown only when the
  // entity holds a live grant that my_government_context() marks may_submit
  // (that flag is the submission predicate itself, 0022). Otherwise the line
  // says what the grants are. With grants but none that may submit, it says so
  // about submitting and nothing more: it is not the viewer's "Read only",
  // because the same contributor may still issue resident access under an
  // active partnership (partner_may_manage_access, 0014, has no may_submit
  // condition).
  const role = membership?.membership_role;
  const roleLine =
    SUBMITTING_ROLES.includes(role) && submitGrants.length === 0
      ? jurisdictions.length === 0
        ? "No jurisdiction grant yet"
        : "No submit grant yet"
      : MEMBERSHIP_ROLE_LABELS[role] || role;

  // The public page for a granted jurisdiction, resolved by SLUG through the
  // public view and accepted only when the row that comes back is the same
  // record. A jurisdiction whose page is not published has no public url, and
  // this page then shows no link rather than a link that would 404.
  useEffect(() => {
    let live = true;
    const resolve = async () => {
      const found = {};
      for (const j of jurisdictions) {
        const slug = slugOf(j.path);
        if (!slug) continue;
        const res = await fetchJurisdiction(slug);
        if (!res.ok) continue;
        const rows = res.ambiguous || (res.jurisdiction ? [res.jurisdiction] : []);
        const match = rows.find((row) => row.id === j.jurisdiction_id);
        if (match) found[j.jurisdiction_id] = jurisdictionUrl(match);
      }
      if (live) setPublicUrls(found);
    };
    resolve();
    return () => {
      live = false;
    };
  }, [jurisdictions]);

  const history = (memberships || []).filter(
    (m) => m.membership_status === "revoked" || m.membership_status === "rejected"
  );

  if (!membership) {
    return (
      <div className="px-5 sm:px-8 py-14 max-w-3xl grid gap-4">
        <h1 className="font-display text-paper text-3xl">Government portal</h1>
        <p className="text-paper-dim text-sm leading-relaxed">
          You do not hold a live membership of a government entity. Claiming one is how that starts, and a claim is
          reviewed by ADUAtlas before it means anything.
        </p>
        <Link to="/gov/claim" className="justify-self-start px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
          Claim a government entity
        </Link>
      </div>
    );
  }

  return (
    <div className="px-5 sm:px-8 py-10 sm:py-14 max-w-4xl grid gap-6">
      <header>
        <p className="text-paper-dim text-xs uppercase tracking-wider">Government portal</p>
        <h1 className="font-display text-paper text-3xl sm:text-4xl mt-2 leading-tight">{membership.entity_name}</h1>
        {/* The role says what this person could do. It is shown only while the
            identity is verified, because "Can submit" on a pending or withdrawn
            account names a power the database will refuse. */}
        <p className="text-paper-dim text-sm mt-2">
          {entityTypeLabel(membership.entity_type)} ·{" "}
          {identityVerified ? `${roleLine} · ` : ""}
          {withdrawn
            ? "Verification withdrawn"
            : MEMBERSHIP_STATUS_LABELS[membership.membership_status] || membership.membership_status}
        </p>
        <p className="text-paper-dim text-xs mt-3">
          Government accounts on ADUAtlas are free, and there is no government billing.
        </p>
      </header>

      {/* ── IDENTITY. One of five stored states, and a badge only when the
          entity and this membership are both verified. ───────────────────── */}
      <Card>
        <Eyebrow>Government identity verification</Eyebrow>
        <h2 className="font-display text-paper text-xl sm:text-2xl flex items-center gap-2">
          {identity.tone === "verified" ? (
            <FiCheckCircle className="text-accent shrink-0" aria-hidden />
          ) : identity.tone === "pending" ? (
            <FiClock className="text-gold shrink-0" aria-hidden />
          ) : null}
          {identity.heading}
        </h2>
        {identity.tone === "verified" && (
          <p className="text-paper text-sm font-medium mt-1">{membership.entity_name}</p>
        )}
        <p className="text-paper-dim text-sm leading-relaxed mt-3">{identity.body}</p>
        <p className="text-paper-dim text-xs leading-relaxed mt-3">
          This is not the builder badge. "Verified on ADUAtlas" belongs to a builder listing and means something
          else entirely.
        </p>
      </Card>

      {/* ── PARTNERSHIP. A separate question with a separate answer, and no
          tooling at all unless it is active. ─────────────────────────────── */}
      <Card>
        <Eyebrow>ADUAtlas education partnership</Eyebrow>
        <h2 className="font-display text-paper text-xl sm:text-2xl">
          {activePartner
            ? "ADUAtlas Education Partner"
            : withdrawn
              ? "No resident access"
              : !identityVerified
                ? "Not shown yet"
                : partnershipLoading
                  ? "Reading the partnership"
                  : partnershipError
                    ? "Partnership status unavailable"
                    : partnershipAvailable
                      ? partnershipStatusLabels[partnershipStatus] || "No partnership"
                      : "Partnership status unavailable"}
        </h2>
        <p className="text-paper-dim text-sm leading-relaxed mt-3">
          {activePartner
            ? "An active partnership lets this entity sponsor the $79 Golden educational access for its residents. It is a partnership, not a verification, and it is never described as one."
            : withdrawn
              ? // A withdrawn entity cannot read its partnership row (0014 scopes it
                // to a verified entity), so this says what the withdrawal itself
                // guarantees: issuance stops (2s D5). T4-11 (RC4 rehearsal): it no
                // longer speaks of "links and codes issued earlier" to an entity
                // that never had any; residentAccessIssuance() adds that sentence
                // only when the row it was given shows the partnership was active.
                issuance.sentence
              : !identityVerified
                ? // The partnership row is readable only to a VERIFIED member (migration
                  // 0014), so a pending member is told what they cannot see rather than
                  // told there is nothing. Asserting "no partnership" here would be a
                  // claim this page has no way to check.
                  "Whether this entity has an ADUAtlas education partnership is not readable until ADUAtlas confirms your authority to represent it. Nothing here says there is one and nothing says there is not. Either way, a partnership never follows from a verification."
                : partnershipLoading
                  ? // Until the read lands there is no row, and "no partnership"
                    // would be a claim this page has not checked yet.
                    "Reading this entity's partnership from the server."
                  : partnershipError
                    ? "The partnership state could not be read just now, so nothing is assumed about it. Reload the page to try again."
                    : partnershipAvailable
                      ? `${issuance.sentence || ""} Verifying an identity does not activate a partnership. It is a separate agreement, and it cannot be activated from this portal.`.trim()
                      : "The partnership service is not available in this environment, so no partnership state can be read. Nothing is assumed in the meantime, which means no partnership tooling."}
        </p>
        {activePartner ? (
          <Link
            to="/gov/partnership"
            className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press"
          >
            Resident access <FiArrowRight aria-hidden />
          </Link>
        ) : withdrawn ? null : (
          <p className="text-paper-dim text-xs leading-relaxed mt-3">
            If sponsoring resident education is something this {ENTITY_TYPE_LABELS[membership.entity_type]?.toLowerCase() || "entity"} wants to discuss, contact ADUAtlas. Identity verification comes first, and the partnership is agreed separately.
          </p>
        )}
        {partnership?.activated_at && (
          <p className="text-paper-dim text-xs mt-3">
            Activated {new Date(partnership.activated_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
          </p>
        )}
        {partnership?.suspended_at && (
          <p className="text-paper-dim text-xs mt-1">
            Suspended {new Date(partnership.suspended_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. New sponsored activations stop; residents who already have access keep it.
          </p>
        )}
      </Card>

      {/* ── AUTHORITY. Enumerated, never derived from geography. ─────────── */}
      <Card>
        <Eyebrow>What this entity may work on</Eyebrow>
        <h2 className="font-display text-paper text-xl sm:text-2xl">Authority is granted record by record</h2>
        <p className="text-paper-dim text-sm leading-relaxed mt-3">
          ADUAtlas grants authority against a specific jurisdiction record. It is never inferred from geography: a
          state account gains nothing over a city's record, and a city account gains nothing over the state's rules
          or another city's. Records may be DISPLAYED together so a homeowner understands what applies, which is
          presentation and not permission.
        </p>
        {withdrawn && (
          // Nothing is listed below in this state: my_government_context() returns
          // no jurisdictions for a withdrawn entity (0022), so the sentence says
          // what is true without pointing at a list that is not there.
          <p className="text-paper-dim text-sm leading-relaxed mt-3">
            While this entity&apos;s verification is withdrawn, it has no authority over any jurisdiction record and
            cannot submit anything. No grant it held is in effect while the verification is withdrawn.
          </p>
        )}
        {jurisdictions.length === 0 ? (
          withdrawn ? null : (
            <p className="text-paper-dim text-sm leading-relaxed mt-4">
              {membership.membership_status === "verified"
                ? "This entity holds no jurisdiction grant yet, so there is nothing to submit against. ADUAtlas adds a grant one record at a time, with the reason recorded."
                : "No jurisdiction is listed because verification comes first. A pending claim reaches nothing but itself, and that is the honest answer rather than an empty workspace."}
            </p>
          )
        ) : (
          <ul className="mt-5 grid gap-3">
            {jurisdictions.map((j) => (
              <li key={j.jurisdiction_id} className="border border-stroke rounded-2xl p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-paper text-sm font-medium">{j.name}</span>
                <span className="text-paper-dim text-xs">{JURISDICTION_TYPE_LABELS[j.jurisdiction_type] || j.jurisdiction_type}</span>
                <span className={`text-xs font-medium ${identityVerified && j.may_submit ? "text-accent" : "text-paper-dim"}`}>
                  {!identityVerified ? "Not in effect" : j.may_submit ? "May submit" : "Read only"}
                </span>
                {publicUrls[j.jurisdiction_id] ? (
                  <Link to={publicUrls[j.jurisdiction_id]} className="text-paper-dim text-xs inline-flex items-center gap-1 hover:text-accent transition-colors ml-auto">
                    See the public page <FiExternalLink aria-hidden />
                  </Link>
                ) : (
                  <span className="text-paper-dim text-xs ml-auto">No public page published yet</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── WHAT TO DO NEXT. Submission only; publication is never a
          membership right. ───────────────────────────────────────────────── */}
      <Card className="bg-surface-1-solid">
        <Eyebrow>Rules and resources</Eyebrow>
        <h2 className="font-display text-paper text-xl sm:text-2xl">Send ADUAtlas what your jurisdiction publishes</h2>
        <p className="text-paper-dim text-sm leading-relaxed mt-3">{SUBMISSION_PROMISE}</p>
        {identityVerified && submitGrants.length > 0 ? (
          <Link
            to="/gov/regulatory"
            className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press"
          >
            Open rules and resources <FiArrowRight aria-hidden />
          </Link>
        ) : (
          <p className="text-paper-dim text-xs leading-relaxed mt-4">
            {withdrawn
              ? "Submitting is not available while this entity's verification is withdrawn."
              : identityVerified
                ? "Submitting opens once ADUAtlas grants this entity authority over a jurisdiction record."
                : "Submitting opens once ADUAtlas confirms your authority to represent this entity."}
          </p>
        )}
      </Card>

      {/* ── THE THREE FACTS, NAMED. ──────────────────────────────────────── */}
      <Card>
        <Eyebrow>Three separate facts</Eyebrow>
        <h2 className="font-display text-paper text-xl sm:text-2xl">What each of these does and does not mean</h2>
        <dl className="mt-4 grid gap-4">
          <div>
            <dt className="text-paper text-sm font-medium">{GOVERNMENT_BADGE_LABEL}</dt>
            <dd className="text-paper-dim text-sm leading-relaxed mt-1">
              Identity and control, checked by ADUAtlas. {GOVERNMENT_BADGE_DOES_NOT_MEAN}
            </dd>
          </div>
          <div>
            <dt className="text-paper text-sm font-medium">ADUAtlas Education Partner</dt>
            <dd className="text-paper-dim text-sm leading-relaxed mt-1">
              A separate agreement to sponsor homeowner education. It is not a verification, it does not follow from
              one, and it says nothing about ADUAtlas endorsing the government or the government endorsing ADUAtlas,
              any builder or any result.
            </dd>
          </div>
          <div>
            <dt className="text-paper text-sm font-medium">Regulatory source verification</dt>
            <dd className="text-paper-dim text-sm leading-relaxed mt-1">
              Held per record and per field: {FIELD_STATE_LABELS[FIELD_STATE.VERIFIED].toLowerCase()},{" "}
              {FIELD_STATE_LABELS[FIELD_STATE.SILENT].toLowerCase()}, or{" "}
              {FIELD_STATE_LABELS[FIELD_STATE.UNRESEARCHED].toLowerCase()}. A verified account does not make any of
              its regulatory content verified, and ADUAtlas may hold sourced rules for a government that has never
              created an account.
            </dd>
          </div>
        </dl>
        <p className="text-paper-dim text-xs leading-relaxed mt-5">{FEASIBILITY_BOUNDARY}</p>
      </Card>

      {/* ── PRIVACY, stated where a government user will look for it. ───── */}
      <Card>
        <Eyebrow>What this portal does not reach</Eyebrow>
        <p className="text-paper-dim text-sm leading-relaxed">
          A government account never reaches a homeowner's private information, a builder's private information,
          payments, course administration or ADUAtlas administration, and never another government's management
          area. That is enforced by the database, not by this interface. Partnership analytics are aggregate:
          sponsoring a resident's access does not reveal who they are or what they entered.
        </p>
      </Card>

      {history.length > 0 && (
        <Card>
          <Eyebrow>Previous memberships</Eyebrow>
          <ul className="grid gap-2">
            {history.map((m) => (
              <li key={m.membership_id} className="text-paper-dim text-sm">
                {m.entity_name} · {MEMBERSHIP_STATUS_LABELS[m.membership_status] || m.membership_status}
                {m.revoked_at ? ` · ${new Date(m.revoked_at).toLocaleDateString("en-US")}` : ""}
              </li>
            ))}
          </ul>
          <p className="text-paper-dim text-xs mt-3">
            Kept because a person leaving is a recorded event rather than a deleted login.
          </p>
        </Card>
      )}

      {liveMemberships.length > 1 && (
        <p className="text-paper-dim text-xs">
          You represent {liveMemberships.length} entities. Everything on this page is about the one selected in the
          sidebar; authority never carries from one to another.
        </p>
      )}
    </div>
  );
};

export default GovPortal;
