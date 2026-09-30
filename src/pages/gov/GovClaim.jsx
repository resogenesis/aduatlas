import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { FiCheckCircle, FiClock } from "react-icons/fi";
import {
  JURISDICTION_TYPE_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  claimGovernmentEntity,
  entityStateDisclosure,
  fetchGovernmentEntities,
  fetchJurisdictionsInState,
  fetchStates,
  forgetGovClaimTarget,
  govClaimTargetFrom,
  govClaimTargetQuery,
  hasGovClaimTarget,
  recallGovClaimTarget,
} from "../../lib/regulatory";
import { refreshEntitlement } from "../../stores/authStore";

// Claiming a government entity (Phase 1 spec, decisions 2m and 2o).
//
// WHAT A CLAIM IS. A recorded request, and nothing else. claim_government_entity()
// creates the person record, a PENDING membership and the entity's claimed_at, and
// its own return value carries verified:false and the next-step sentence so no
// interface can dress it up. This screen therefore never says "verified",
// "approved", "activated" or "you can now", and the success state is deliberately
// a waiting state.
//
// WHY THE BAR IS HIGHER THAN AN ACCOUNT (2o). Holding an email address is not
// authority, and knowing a jurisdiction's name is not authority. ADUAtlas records
// the official government domains on the entity and a person at ADUAtlas confirms
// the claimant is authorised to represent it. A matching work-email domain is
// EVIDENCE that helps that review; it verifies nobody, and this page says so
// rather than implying a domain check is the check.
//
// WHAT THIS SCREEN CANNOT DO, by construction rather than by choice: verify a
// claim, grant authority over any jurisdiction record, publish anything, or
// activate a partnership. All four are refused by the database for every browser
// request (migration 0012, PART 8 and PART 11).
//
// A REVOKED OR REJECTED person may claim again: the unique index only covers a
// live membership, so their history stays in the record and a new claim starts a
// new review. Their previous memberships are listed below rather than hidden.

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
    {hint && <span className="mt-1.5 block text-xs text-paper-dim">{hint}</span>}
  </label>
);

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-surface-1-solid border border-stroke text-paper text-sm placeholder:text-paper-dim/60 focus:outline-none focus:border-accent transition";

const domainOf = (email) => {
  const at = String(email || "").lastIndexOf("@");
  return at > 0 ? String(email).slice(at + 1).trim().toLowerCase() : "";
};

// THE CONFIRMATION, in three pieces: the heading, one card per recorded claim
// (the entity, the next step and the membership's state), and what a claim does
// not do. Shown right after a claim is sent, and again whenever the page opens
// while the server returns a pending membership, which is what a reload is
// (T4-12). One set of components, so the two can never say different things.
const ClaimRecordedHeader = () => (
  <header>
    <p className="text-paper-dim text-xs uppercase tracking-wider">Government portal</p>
    <h1 className="font-display text-paper text-3xl sm:text-4xl mt-2 leading-tight flex items-start gap-3">
      <FiClock className="text-gold mt-1 shrink-0" aria-hidden />
      Claim recorded
    </h1>
  </header>
);

const ClaimDoesNotCard = () => (
  <Card className="bg-surface-1-solid">
    <p className="text-paper-dim text-sm leading-relaxed">
      Two things a claim does not do, said plainly: it does not verify this account, and it does not create an
      ADUAtlas education partnership. Those are separate decisions, and neither follows from the other.
    </p>
  </Card>
);

// What the card says is about THIS claim, not the account: the same person may
// already hold a verified membership of another entity, with its badge and its
// grants, and a claim changes none of that. The public page does change: a claim
// sets the entity's claimed_at, so its profile reads as claimed rather than
// unclaimed (government_entity_state, 0012), unless the entity was already
// verified through someone else, in which case the claim changes nothing there.
// entityState is my_government_context()'s entity_state for the membership.
const ClaimRecordedCard = ({ entityName, nextStep, membershipStatus, entityState }) => {
  const name = entityName || "this entity";
  return (
    <Card>
      <p className="text-paper text-sm font-medium">{entityName}</p>
      <p className="text-paper-dim text-sm leading-relaxed mt-3">
        {nextStep ||
          "ADUAtlas reviews the claim and confirms your authority to represent this entity. A claim is not a verification, and verification is not a publishing right."}
      </p>
      <p className="text-paper-dim text-sm leading-relaxed mt-3">
        Your membership is{" "}
        <span className="text-paper">{MEMBERSHIP_STATUS_LABELS[membershipStatus] || "awaiting verification"}</span>
        . Until ADUAtlas confirms it, this claim gives you no badge for {name} and no way to submit anything for it.{" "}
        {entityState === "verified"
          ? `The public page already shows ${name} as a verified government account, and this claim does not change it.`
          : `On the public page, ${name} now shows as claimed and not verified. The rules on that page do not change.`}
      </p>
    </Card>
  );
};

const GovClaim = () => {
  const { memberships, reload } = useOutletContext();

  // A claim link from a jurisdiction page preselects its record (T4-06). When the
  // page opens with nothing preselected, the preselection GovLayout kept in this
  // browser before sending a signed-out visitor to sign in is used instead: an
  // email confirmation on the way loses the query string. Only shapes are
  // checked here. What the page SHOWS decides what can be sent: a jurisdiction
  // counts only once it is one of the state's options, and an entity only once
  // it is in that jurisdiction's list (selectedEntity below). The server decides
  // what a claim is.
  const [searchParams, setSearchParams] = useSearchParams();
  const [preselect] = useState(() => {
    const fromLink = govClaimTargetFrom(searchParams);
    if (hasGovClaimTarget(fromLink)) return { ...fromLink, restored: false };
    const kept = recallGovClaimTarget();
    return kept ? { ...kept, restored: true } : { ...fromLink, restored: false };
  });
  const [statesState, setStatesState] = useState({ read: false, rows: [] });
  const [stateCode, setStateCode] = useState(preselect.state);
  const [jurisdictionId, setJurisdictionId] = useState(preselect.jurisdiction);
  const [entityId, setEntityId] = useState(preselect.entity);

  // The kept preselection has reached the page it was kept for, so it is
  // forgotten. A restored one is written into the address, so a reload keeps it.
  const restoredQuery = preselect.restored ? govClaimTargetQuery(preselect) : "";
  const keptHandled = useRef(false);
  useEffect(() => {
    if (keptHandled.current) return;
    keptHandled.current = true;
    forgetGovClaimTarget();
    if (restoredQuery) setSearchParams(restoredQuery, { replace: true });
  }, [restoredQuery, setSearchParams]);
  // Each read is stored WITH the key it was read for, and the render derives from
  // that. A stale list is therefore impossible without an effect clearing state
  // synchronously, which would cascade renders: if the key does not match, the
  // list is empty and the page is honestly still loading.
  const [localsState, setLocalsState] = useState({ code: "", rows: [] });
  const [entitiesState, setEntitiesState] = useState({ jurisdictionId: "", rows: [] });

  const [form, setForm] = useState({ fullName: "", jobTitle: "", workEmail: "", phone: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetchStates()
      .then((res) => {
        if (live) setStatesState({ read: true, rows: res.states || [] });
      })
      .catch(() => {
        if (live) setStatesState({ read: true, rows: [] });
      });
    return () => {
      live = false;
    };
  }, []);

  const states = statesState.rows;
  const stateRow = useMemo(() => states.find((s) => s.state_code === stateCode) || null, [states, stateCode]);

  useEffect(() => {
    if (!stateCode) return undefined;
    let live = true;
    fetchJurisdictionsInState(stateCode)
      .then((res) => {
        if (live) setLocalsState({ code: stateCode, rows: res.jurisdictions || [] });
      })
      .catch(() => {
        if (live) setLocalsState({ code: stateCode, rows: [] });
      });
    return () => {
      live = false;
    };
  }, [stateCode]);

  useEffect(() => {
    if (!jurisdictionId) return undefined;
    let live = true;
    fetchGovernmentEntities(jurisdictionId)
      .then((res) => {
        if (live) setEntitiesState({ jurisdictionId, rows: res.entities || [] });
      })
      .catch(() => {
        if (live) setEntitiesState({ jurisdictionId, rows: [] });
      });
    return () => {
      live = false;
    };
  }, [jurisdictionId]);

  const localsRead = localsState.code === stateCode;
  const locals = useMemo(() => (localsRead ? localsState.rows : []), [localsRead, localsState]);

  // The state's own record plus everything beneath it. A state agency is seated
  // in the state record; a city in the city record. Being seated somewhere is
  // geography, and it is not authority over that record either.
  const jurisdictionOptions = useMemo(() => {
    const rows = [];
    if (stateRow) rows.push(stateRow);
    return rows.concat(locals);
  }, [stateRow, locals]);

  // A preselected jurisdiction that is not one of the chosen state's options is
  // treated as not chosen: the select shows its placeholder, so no entity list
  // for it is shown either. While the options are still being read it is
  // neither accepted nor dropped.
  const optionsLoading = Boolean(stateCode) && (!statesState.read || !localsRead);
  const jurisdictionRow = jurisdictionOptions.find((j) => j.id === jurisdictionId) || null;
  const entitiesRead = entitiesState.jurisdictionId === jurisdictionId;
  const entities = jurisdictionRow && entitiesRead ? entitiesState.rows : [];
  const entitiesLoading = Boolean(jurisdictionId) && (optionsLoading || (Boolean(jurisdictionRow) && !entitiesRead));

  // The entity a claim is sent for is the one checked on screen, never an id
  // that only came in the query string (a stale or hand-made link can name an
  // entity in another jurisdiction). Nothing checked, nothing sent.
  const selectedEntity = entities.find((e) => e.id === entityId) || null;
  const alreadyClaimed =
    selectedEntity &&
    memberships.find(
      (m) =>
        m.entity_id === selectedEntity.id && (m.membership_status === "pending" || m.membership_status === "verified")
    );
  // No entity recorded here: the way on is to ask ADUAtlas to add one, with the
  // place in the subject so the request can be matched to its record.
  const addEntityHref = `mailto:hello@aduatlas.com?subject=${encodeURIComponent(
    `Government account: ${jurisdictionRow?.name || "a jurisdiction"}${stateCode ? `, ${stateCode}` : ""}`
  )}`;
  const history = (memberships || []).filter(
    (m) => m.membership_status === "revoked" || m.membership_status === "rejected"
  );
  // T4-12 (RC4 rehearsal): "Claim recorded" lived only in this page's state, so a
  // reload showed an empty claim form and only the sidebar chip still said the
  // claim was pending. The claims waiting for review now come from the server's
  // memberships (GovLayout's my_government_context() read), which a reload does
  // not lose, and each is confirmed above the form with the same card.
  const pendingClaims = (memberships || []).filter((m) => m.membership_status === "pending");

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!selectedEntity) {
      setError("Choose the entity you represent.");
      return;
    }
    if (!form.fullName.trim() || !form.workEmail.includes("@")) {
      setError("A claim needs your name and your work email address.");
      return;
    }
    setSubmitting(true);
    const res = await claimGovernmentEntity({
      entityId: selectedEntity.id,
      fullName: form.fullName.trim(),
      jobTitle: form.jobTitle.trim() || null,
      workEmail: form.workEmail.trim(),
      phone: form.phone.trim() || null,
      note: form.note.trim() || null,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(
        res.error === "logged-out"
          ? "Your session has ended. Sign in again and the claim will send."
          : res.error === "supabase-disabled"
            ? "This environment has no ADUAtlas database configured, so the claim cannot be recorded."
            : "The claim was not recorded. Nothing changed; try again in a moment."
      );
      return;
    }
    setClaim(res.claim || { verified: false });
    // The portal's membership list comes from the server, so it is re-read rather
    // than patched locally: the new membership is pending, and only the server
    // decides that. GovLayout keeps this page mounted during the re-read, which
    // is what keeps the "Claim recorded" confirmation below on screen.
    if (typeof reload === "function") reload();
    // The session mirror learns that this account now holds a membership, so the
    // header and the sign-in route point to /gov from now on. Navigation only.
    refreshEntitlement().catch(() => {});
  };

  // ── after a successful claim ─────────────────────────────────────────────
  if (claim) {
    return (
      <div className="px-5 sm:px-8 py-10 sm:py-14 max-w-3xl grid gap-6">
        <ClaimRecordedHeader />
        <ClaimRecordedCard
          entityName={claim.entity_name || selectedEntity?.name}
          nextStep={claim.next_step}
          membershipStatus={claim.membership_status}
          entityState={selectedEntity?.entity_state === "verified" ? "verified" : "claimed"}
        />
        <ClaimDoesNotCard />
        <div className="flex flex-wrap gap-3">
          <Link to="/gov" className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
            Open the portal
          </Link>
          <button
            onClick={() => {
              setClaim(null);
              setEntityId("");
            }}
            className="px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press"
          >
            Claim another entity
          </button>
        </div>
      </div>
    );
  }

  // With a claim waiting for review, the page opens on its confirmation, as it
  // did the moment the claim was sent (T4-12), and the form follows it for a
  // second entity. The form's heading steps down to h2 so the confirmation is
  // the page's one h1.
  const hasPending = pendingClaims.length > 0;
  const FormHeading = hasPending ? "h2" : "h1";

  return (
    <div className="px-5 sm:px-8 py-10 sm:py-14 max-w-3xl grid gap-6">
      {hasPending && (
        <>
          <ClaimRecordedHeader />
          {pendingClaims.map((m) => (
            <ClaimRecordedCard
              key={m.membership_id || m.entity_id}
              entityName={m.entity_name}
              membershipStatus={m.membership_status}
              entityState={m.entity_state}
            />
          ))}
          <ClaimDoesNotCard />
          <div className="flex flex-wrap gap-3">
            <Link to="/gov" className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
              Open the portal
            </Link>
          </div>
        </>
      )}

      <header className={hasPending ? "mt-6" : ""}>
        {!hasPending && <p className="text-paper-dim text-xs uppercase tracking-wider">Government portal</p>}
        <FormHeading
          className={`font-display text-paper leading-tight ${hasPending ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl mt-2"}`}
        >
          Claim a government entity
        </FormHeading>
        <p className="text-paper-dim text-sm leading-relaxed mt-4">
          {hasPending &&
            `${pendingClaims.length > 1 ? "Your claims above need" : "Your claim above needs"} nothing more from you. Use this form only to claim a different entity as well. `}
          ADUAtlas creates a jurisdiction record from authoritative public sources before any government account
          exists. Claiming associates your account with the record that is already there. It does not create a
          second one, and it does not change the rules the public page shows.
        </p>
      </header>

      <Card className="bg-surface-1-solid">
        <h2 className="font-display text-paper text-xl">How ADUAtlas reviews a claim</h2>
        <ul className="mt-4 grid gap-2.5 text-paper-dim text-sm leading-relaxed">
          <li>
            A claim is a request, not an approval. Holding an email address is not authority, and knowing a
            jurisdiction's name is not authority.
          </li>
          <li>
            ADUAtlas records each entity's official government domains and a person here confirms you are authorised
            to represent it. A work email on an official domain is evidence that helps; it verifies nobody
            automatically.
          </li>
          <li>
            Verification is an identity check. It never means ADUAtlas checked that your information is legally
            correct, and it is never a right to publish.
          </li>
          <li>
            Authority over a jurisdiction record is granted separately and one record at a time, with the reason
            recorded. Verification alone grants none.
          </li>
          <li>Government accounts are free, and there is no government billing.</li>
        </ul>
      </Card>

      <form onSubmit={submit} className="grid gap-6">
        <Card>
          <h2 className="font-display text-paper text-xl mb-5">Which entity do you represent?</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="State" required>
              <select
                value={stateCode}
                onChange={(event) => {
                  setStateCode(event.target.value);
                  setJurisdictionId("");
                  setEntityId("");
                }}
                className={inputClass}
              >
                <option value="">Choose a state</option>
                {states.map((s) => (
                  <option key={s.id} value={s.state_code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Jurisdiction" required hint="The record the entity is seated in.">
              <select
                value={jurisdictionId}
                onChange={(event) => {
                  setJurisdictionId(event.target.value);
                  setEntityId("");
                }}
                disabled={!stateCode}
                className={inputClass}
              >
                <option value="">{stateCode ? "Choose a jurisdiction" : "Choose a state first"}</option>
                {jurisdictionOptions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} · {JURISDICTION_TYPE_LABELS[j.jurisdiction_type] || j.jurisdiction_type}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {jurisdictionId && (jurisdictionRow || optionsLoading) && (
            <div className="mt-6">
              {entitiesLoading ? (
                <p className="text-paper-dim text-sm">Reading the entities recorded here.</p>
              ) : entities.length === 0 ? (
                <div className="grid gap-2">
                  <p className="text-paper-dim text-sm leading-relaxed">
                    ADUAtlas holds no government entity record for this jurisdiction yet, so there is nothing here to
                    claim. Write to ADUAtlas and one is created from official sources. An entity is never created by a
                    claim, because a claim would then be creating the thing it claims.
                  </p>
                  <a href={addEntityHref} className="tap-target justify-self-start text-accent font-medium text-sm">
                    Ask ADUAtlas to add this government profile
                  </a>
                </div>
              ) : (
                <fieldset className="grid gap-3">
                  <legend className="text-paper text-xs font-medium mb-2">The entity *</legend>
                  {entities.map((entity) => (
                    <label
                      key={entity.id}
                      className={`flex gap-3 border rounded-2xl p-4 cursor-pointer transition-colors ${
                        entityId === entity.id ? "border-accent" : "border-stroke hover:border-paper-dim"
                      }`}
                    >
                      <input
                        type="radio"
                        name="entity"
                        value={entity.id}
                        checked={entityId === entity.id}
                        onChange={() => setEntityId(entity.id)}
                        className="mt-1 accent-accent"
                      />
                      <span className="grid gap-1">
                        <span className="text-paper text-sm font-medium flex items-center gap-2">
                          {entity.name}
                          {entity.entity_state === "verified" && (
                            <FiCheckCircle className="text-accent" aria-hidden />
                          )}
                        </span>
                        <span className="text-paper-dim text-xs leading-relaxed">
                          {entityStateDisclosure(entity.entity_state, entity.name)}
                        </span>
                        {entity.official_website_url && (
                          <span className="text-paper-dim text-xs break-all">{entity.official_website_url}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}

          {alreadyClaimed && (
            <p className="text-paper-dim text-sm leading-relaxed mt-5">
              You already hold a membership of this entity:{" "}
              {MEMBERSHIP_STATUS_LABELS[alreadyClaimed.membership_status] || alreadyClaimed.membership_status}.
              Claiming again reports that state rather than creating a second membership; re-claiming is not a way to
              speed anything up.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-paper text-xl mb-5">Who are you?</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your full name" required>
              <input value={form.fullName} onChange={set("fullName")} className={inputClass} placeholder="Jordan Ellis" />
            </Field>
            <Field label="Job title" hint="Your role at the entity, as it would appear in a directory.">
              <input value={form.jobTitle} onChange={set("jobTitle")} className={inputClass} placeholder="Planner II" />
            </Field>
            <Field
              label="Work email"
              required
              hint={
                selectedEntity
                  ? "Use your government work address. ADUAtlas compares it with the entity's official domains as evidence, and a match is not a verification."
                  : "Use your government work address, not a personal one."
              }
            >
              <input
                type="email"
                value={form.workEmail}
                onChange={set("workEmail")}
                className={inputClass}
                placeholder="you@city.gov"
              />
            </Field>
            <Field label="Phone" hint="A direct line at the entity helps ADUAtlas reach you through official channels.">
              <input value={form.phone} onChange={set("phone")} className={inputClass} placeholder="(602) 555-0142" />
            </Field>
          </div>
          <div className="mt-5">
            <Field
              label="Anything ADUAtlas should know"
              hint="Your department, who else should have access, or how we can confirm your role through the entity's own channels."
            >
              <textarea value={form.note} onChange={set("note")} rows={4} className={inputClass} />
            </Field>
          </div>
          {form.workEmail.includes("@") && domainOf(form.workEmail) && (
            <p className="text-paper-dim text-xs leading-relaxed mt-1">
              ADUAtlas will check {domainOf(form.workEmail)} against the official domains recorded for this entity.
              That check is evidence for a person reviewing the claim, not the decision.
            </p>
          )}
        </Card>

        {error && <p className="text-gold text-sm">{error}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={submitting || !selectedEntity}
            className="px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Sending the claim" : "Send this claim for review"}
          </button>
          <p className="text-paper-dim text-xs max-w-sm leading-relaxed">
            Sending this records a claim and a pending membership. It does not verify your account and does not
            create a partnership.
          </p>
        </div>
      </form>

      {history.length > 0 && (
        <Card>
          <h2 className="font-display text-paper text-xl mb-3">Your previous memberships</h2>
          <ul className="grid gap-2">
            {history.map((m) => (
              <li key={m.membership_id} className="text-paper-dim text-sm">
                {m.entity_name} · {MEMBERSHIP_STATUS_LABELS[m.membership_status] || m.membership_status}
              </li>
            ))}
          </ul>
          <p className="text-paper-dim text-xs leading-relaxed mt-3">
            A membership that ended stays in the record with its date. If you represent one of these entities again,
            claim it again and ADUAtlas reviews the new claim.
          </p>
        </Card>
      )}
    </div>
  );
};

export default GovClaim;
