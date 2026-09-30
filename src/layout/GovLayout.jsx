import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router-dom";
import { FiAward, FiCheckCircle, FiClock, FiFileText, FiHome, FiLogOut, FiMenu, FiPlusCircle, FiTool, FiX } from "react-icons/fi";
import Logomark from "../components/brand/Logomark";
import { usePageTitle } from "../hooks/usePageTitle";
import { currentUser, logout } from "../stores/authStore";
import { myGovernmentContext, rememberGovClaimTarget } from "../lib/regulatory";

// Government portal shell (/gov/*) — Phase 1 spec, decisions 2m, 2o and 2p.
//
// THE UI GUARD IS NOT THE AUTHORIZATION. The database is the boundary: every
// table and view under the participation layer is closed by RLS, the submission
// policy asks for a verified membership AND an explicit jurisdiction grant, and
// publication is service_role only (migration 0012). This layout exists so a
// person who holds nothing does not stare at an empty workspace, and so the two
// states that must never merge are rendered as two separate facts. Removing it
// would change what a stranger SEES and nothing about what they can DO.
//
// The membership it reads comes from the SERVER — my_government_context(), which
// is granted to authenticated and runs security definer — never from a role
// string in localStorage. A revoked member has no live membership, so they reach
// the claim page and nothing else, which is the point of modelling membership at
// all: revocation is an event, not a deleted login.
//
// TWO STATES, NEVER ONE. This shell carries two chips, and they answer different
// questions:
//   identity     "has ADUAtlas verified this account is controlled by the stated
//                government?" — the badge is "Verified Government Account".
//   partnership  "has this verified entity activated an ADUAtlas education
//                partnership?" — the label is "ADUAtlas Education Partner" and it
//                is never called verified.
// Identity verification NEVER activates a partnership. A verified non-partner
// gets NO partnership tooling: the nav item below is absent, not disabled.
//
// WHY THE PARTNERSHIP LIBRARY IS RESOLVED AND NOT IMPORTED. src/lib/
// govPartnership.js belongs to the partnership schema package (migration 0014),
// which lands separately. import.meta.glob resolves it when it exists and yields
// an empty object when it does not, so this portal builds and runs either way.
// FAIL CLOSED is the rule: with no library there is no partnership status, and no
// status is treated as no partnership, never as an active one. Swap this for a
// plain import once 0014 and the library are in the tree.
const PARTNERSHIP_LIB = Object.values(
  import.meta.glob("../lib/govPartnership.js", { eager: true })
)[0] || null;

// Used only when the library above is absent. The library's own
// PARTNERSHIP_STATUS_LABELS wins wherever it exists, because the states belong to
// the schema that stores them (2p: no partnership, pending, active, inactive or
// suspended).
const FALLBACK_STATUS_LABELS = {
  none: "No partnership",
  pending: "Partnership pending",
  active: "Active partnership",
  inactive: "Partnership inactive",
  suspended: "Partnership suspended",
};

// The partnership row out of whatever shape the library returns, without
// guessing a status that is not there.
const partnershipRowOf = (result) => {
  if (!result || typeof result !== "object") return null;
  if (result.ok === false) return null;
  if ("partnership" in result) return result.partnership || null;
  if ("data" in result && !("status" in result)) return result.data || null;
  if ("status" in result || "entity_id" in result) return result;
  return null;
};

const errorOf = (result) =>
  result && typeof result === "object" && result.ok === false ? result.error || "unavailable" : null;

const NavItem = ({ to, label, Icon, end, onClick }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
        isActive ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper hover:bg-surface-1-solid"
      }`
    }
  >
    <Icon className="text-base shrink-0" />
    <span className="flex-1">{label}</span>
  </NavLink>
);

// Two chips, two questions, never one merged badge.
const StateChip = ({ kind, tone, label }) => (
  <span className="flex flex-col gap-0.5">
    <span className="text-paper-dim text-[0.6rem] uppercase tracking-wider">{kind}</span>
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
        tone === "verified" ? "text-accent" : tone === "pending" ? "text-gold" : "text-paper-dim"
      }`}
    >
      {tone === "verified" ? <FiCheckCircle aria-hidden /> : tone === "pending" ? <FiClock aria-hidden /> : null}
      {label}
    </span>
  </span>
);

const GovLayout = () => {
  usePageTitle();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  const user = currentUser();

  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The entity the person CHOSE, which may be nothing. The active membership is
  // derived below rather than defaulted into state, so no effect writes state
  // during a render pass.
  const [entityChoice, setEntityChoice] = useState(null);
  // The partnership is stored WITH the entity it was read for. Keying it is what
  // lets the read be derived: a row from a previous entity is never shown for the
  // current one, and nothing has to be cleared by an effect.
  const [partnershipState, setPartnershipState] = useState({ entityId: null, row: null, error: null });
  const [partnershipNonce, setPartnershipNonce] = useState(0);
  const [nonce, setNonce] = useState(0);

  // The portal is never indexed: a government workspace is not public, and
  // public/robots.txt has no rule for /gov yet (it is not this package's file).
  // The tag is removed on unmount so it never follows the visitor to a public
  // page.
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow";
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);

  // A signed-out visitor on a claim link is sent to sign in below, with the
  // preselection in `next`. An email confirmation drops `next`, so the
  // preselection is also kept in this browser, and /gov/claim reads it back
  // when it opens with nothing preselected (T4-06). Record ids only; the claim
  // is still decided by the server.
  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn && pathname === "/gov/claim" && search) rememberGovClaimTarget(search);
  }, [signedIn, pathname, search]);

  // THE SERVER'S ANSWER, and nothing else, decides what this shell shows. The
  // read happens in the effect's promise callback rather than in its body: a
  // setState reached synchronously from an effect cascades renders, so the
  // "reading your access" state is the initial state and the retry path bumps a
  // nonce from an event handler.
  // A failed RE-read keeps the previous answer on screen and reports the failure
  // above the page (see staleError below) rather than replacing it: GovClaim's
  // "Claim recorded" is local state, and a claim the server already recorded
  // must not look lost because the read after it did not answer. An ended
  // session is the exception, because there is nothing left to show it to.
  useEffect(() => {
    let alive = true;
    const settleFailure = (reason) => {
      setError(reason);
      setCtx((prev) => (prev && reason !== "logged-out" ? prev : null));
      setLoading(false);
    };
    myGovernmentContext()
      .then((res) => {
        if (!alive) return;
        if (!res.ok) {
          settleFailure(res.error || "unavailable");
          return;
        }
        setError(null);
        setCtx(res.context || { memberships: [] });
        setLoading(false);
      })
      .catch(() => {
        if (alive) settleFailure("unavailable");
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  // Re-reads the caller's access from the server. Called from event handlers only
  // (the retry button here, a completed claim in GovClaim), which is why it may
  // set state directly. A re-read with an answer already on screen keeps the
  // page mounted (see firstRead below): GovClaim holds its "Claim recorded"
  // confirmation in its own state, and replacing the outlet with the waiting line
  // unmounted it, so the claimant saw a wiped form instead of the confirmation.
  const reload = () => {
    setLoading(true);
    setError(null);
    setNonce((n) => n + 1);
  };

  const memberships = useMemo(() => ctx?.memberships || [], [ctx]);
  // A live membership is pending or verified. Revoked and rejected rows stay in
  // the record and are shown on the claim page as history; they are not access.
  const live = useMemo(
    () => memberships.filter((m) => m.membership_status === "pending" || m.membership_status === "verified"),
    [memberships]
  );

  // The first live membership unless the person picked another one. Derived, so a
  // person who represents two entities never sees one entity's state under the
  // other's name while an effect catches up.
  const membership = useMemo(
    () => live.find((m) => m.entity_id === entityChoice) || live[0] || null,
    [live, entityChoice]
  );
  const activeEntityId = membership?.entity_id || null;

  useEffect(() => {
    if (!PARTNERSHIP_LIB?.fetchMyPartnership || !activeEntityId) return undefined;
    let alive = true;
    // The entity id is passed even though the library may scope by session on its
    // own: an extra argument is harmless, and a library that needs it gets it.
    Promise.resolve(PARTNERSHIP_LIB.fetchMyPartnership(activeEntityId))
      .then((res) => {
        if (alive) setPartnershipState({ entityId: activeEntityId, row: partnershipRowOf(res), error: errorOf(res) });
      })
      .catch((err) => {
        if (alive) setPartnershipState({ entityId: activeEntityId, row: null, error: err?.message || "unavailable" });
      });
    return () => {
      alive = false;
    };
  }, [activeEntityId, partnershipNonce]);

  const partnershipRead = partnershipState.entityId === activeEntityId;
  const partnership = partnershipRead ? partnershipState.row : null;
  const partnershipError = partnershipRead ? partnershipState.error : null;
  const partnershipLoading = Boolean(PARTNERSHIP_LIB && activeEntityId && !partnershipRead);
  const reloadPartnership = () => setPartnershipNonce((n) => n + 1);

  const statusLabels = PARTNERSHIP_LIB?.PARTNERSHIP_STATUS_LABELS || FALLBACK_STATUS_LABELS;
  // Fails closed twice over: no library means no active partnership, and an
  // unrecognised status is not active either.
  const activePartner = Boolean(
    partnership &&
      (typeof PARTNERSHIP_LIB?.isActivePartner === "function"
        ? PARTNERSHIP_LIB.isActivePartner(partnership)
        : partnership.status === "active")
  );
  const partnershipStatus = partnership?.status || "none";

  const identityVerified =
    membership?.membership_status === "verified" && membership?.entity_state === "verified";

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const nav = [
    { to: "/gov", label: "Portal", Icon: FiHome, end: true },
    { to: "/gov/regulatory", label: "Rules and resources", Icon: FiFileText },
    // Present ONLY for an active partnership. A verified non-partner sees no
    // partnership tooling at all (2p), so there is nothing here to click.
    ...(activePartner ? [{ to: "/gov/partnership", label: "Resident access", Icon: FiAward }] : []),
    { to: "/gov/claim", label: "Claim an entity", Icon: FiPlusCircle },
  ];

  const sidebar = (onLinkClick) => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-7 border-b border-stroke">
        <NavLink to="/gov" onClick={onLinkClick} className="text-paper hover:text-accent transition-colors inline-block mb-3">
          <Logomark className="h-7" />
        </NavLink>
        <p className="text-paper-dim text-[0.65rem]">Government portal</p>
      </div>

      {live.length > 1 && (
        <div className="px-5 pt-5">
          <label className="block">
            <span className="text-paper-dim text-[0.6rem] uppercase tracking-wider">Working as</span>
            <select
              value={membership?.entity_id || ""}
              onChange={(event) => setEntityChoice(event.target.value)}
              className="mt-1.5 w-full px-3 py-2 rounded-xl bg-surface-1-solid border border-stroke text-paper text-xs focus:outline-none focus:border-accent"
            >
              {live.map((m) => (
                <option key={m.entity_id} value={m.entity_id}>
                  {m.entity_name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {membership && (
        <div className="px-5 pt-5 grid gap-3">
          <p className="text-paper text-sm font-medium leading-snug">{membership.entity_name}</p>
          <StateChip
            kind="Identity"
            tone={identityVerified ? "verified" : membership.membership_status === "pending" ? "pending" : "none"}
            label={
              identityVerified
                ? "Verified Government Account"
                : membership.membership_status === "pending"
                  ? "Claim pending"
                  : membership.membership_status === "rejected"
                    ? "Verification rejected"
                    : PARTNERSHIP_LIB?.identityWithdrawn?.(membership)
                      ? "Verification withdrawn"
                      : "Not verified"
            }
          />
          <StateChip
            kind="Partnership"
            tone={activePartner ? "verified" : partnershipStatus === "pending" ? "pending" : "none"}
            label={
              activePartner
                ? "ADUAtlas Education Partner"
                : PARTNERSHIP_LIB?.identityWithdrawn?.(membership)
                  ? // Withdrawal suspends the partnership (0020, D5): no new
                    // resident access, and residents already granted keep it.
                    "No resident access"
                : !identityVerified
                  ? // A pending member cannot read the partnership row at all
                    // (0014 scopes it to a verified membership), so the chip says
                    // "not shown yet" rather than asserting there is none.
                    "Not shown yet"
                  : PARTNERSHIP_LIB
                    ? statusLabels[partnershipStatus] || "No partnership"
                    : "Not available"
            }
          />
        </div>
      )}

      <nav className="flex-1 px-3 py-6 space-y-1">
        {nav.map((item) => (
          <NavItem key={item.to} {...item} onClick={onLinkClick} />
        ))}
      </nav>

      {user && (
        <div className="px-3 pb-5 border-t border-stroke pt-4">
          <div className="px-4 py-3">
            <p className="text-paper text-sm font-medium truncate">{ctx?.government_user?.full_name || user.username}</p>
            <p className="text-paper-dim text-xs truncate">{ctx?.government_user?.work_email || user.email}</p>
          </div>
          {/* A government user who also bought a homeowner plan now lands here
              after signing in (routeForUser), so the way to their own homeowner
              portal sits with the account. Navigation only: the homeowner app
              gates on the server's paid state as before. A builder is left out:
              BuilderRedirect sends a builder from /dashboard to /builder, which
              has its own link below. */}
          {user.paid && user.role !== "pro" && (
            <NavLink
              to="/dashboard"
              onClick={onLinkClick}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-paper-dim hover:text-paper hover:bg-surface-1-solid transition-colors"
            >
              <FiHome className="text-base shrink-0" />
              Your homeowner portal
            </NavLink>
          )}
          {/* T4-07 (RC4 rehearsal): a builder account that also represents a
              government entity reached /gov from the builder sidebar and had no
              way back. The builder sidebar links here when the account holds a
              membership, and this is the return link, shown for role "pro"
              (currentUser(), the same mirror BuilderLayout gates on).
              Navigation only: BuilderLayout and the builder RPCs decide what a
              builder may see and do. */}
          {user.role === "pro" && (
            <NavLink
              to="/builder"
              onClick={onLinkClick}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-paper-dim hover:text-paper hover:bg-surface-1-solid transition-colors"
            >
              <FiTool className="text-base shrink-0" />
              Builder portal
            </NavLink>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-paper-dim hover:text-paper hover:bg-surface-1-solid transition-colors"
          >
            <FiLogOut className="text-base shrink-0" />
            Log out
          </button>
        </div>
      )}
    </div>
  );

  // Signed out is the one thing decided without the server: there is no token to
  // ask with. The sign-in page brings the person back to the page they asked for.
  // The query string goes with it, so a claim link that preselected a record
  // (/gov/claim?state=..&jurisdiction=..&entity=.., T4-06) survives sign-in. A
  // sign-up that waits for an email confirmation loses `next`; the preselection
  // kept above covers that case.
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`${pathname}${search}`)}`} replace />;

  const outletContext = {
    loading,
    error,
    context: ctx,
    memberships,
    liveMemberships: live,
    membership,
    entityId: activeEntityId,
    setEntityId: setEntityChoice,
    identityVerified,
    partnership,
    partnershipStatus,
    partnershipStatusLabels: statusLabels,
    partnershipAvailable: Boolean(PARTNERSHIP_LIB),
    partnershipLib: PARTNERSHIP_LIB,
    partnershipError,
    partnershipLoading,
    activePartner,
    reload,
    reloadPartnership,
  };

  // No live membership, and this is not the claim page: the claim page is the one
  // door in. A redirect is not a permission check; the database already refused
  // everything else before this render happened.
  const needsClaim = !loading && !error && live.length === 0 && pathname !== "/gov/claim";

  // Only the FIRST read (no answer yet) replaces the page with the waiting line.
  // A re-read keeps the current page mounted with the previous answer until the
  // new one lands; the outlet context carries `loading` for a page that cares.
  const firstRead = loading && !ctx;
  // A re-read that failed while an earlier answer is on screen. The page stays,
  // and a line above it says the access shown is from the last read. What the
  // person may do is still decided by the database on every request.
  const staleError = Boolean(error && ctx);

  return (
    <div className="theme-light min-h-screen bg-canvas">
      <div className="lg:hidden sticky top-0 z-40 bg-canvas/85 backdrop-blur-md border-b border-stroke">
        <div className="flex items-center justify-between px-5 py-3">
          <Logomark className="h-7 text-paper" />
          <button onClick={() => setMobileOpen((v) => !v)} className="p-2 text-paper" aria-label="Toggle menu">
            {mobileOpen ? <FiX className="text-2xl" /> : <FiMenu className="text-2xl" />}
          </button>
        </div>
      </div>

      <div className="flex">
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-stroke flex-col fixed inset-y-0">
          {sidebar()}
        </aside>

        {mobileOpen && (
          // T4-21 (RC4 rehearsal): above the sticky top bar (z-40), which used
          // to cover the drawer's own logo row. The backdrop still closes it,
          // including where the menu toggle sits.
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-canvas/80 backdrop-blur-sm" onClick={close} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-canvas border-r border-stroke overflow-y-auto">
              {sidebar(close)}
            </aside>
          </div>
        )}

        {/* min-w-0: a flex item defaults to its min-content width, which let wide
            content push the portal wider than a phone (index.css). */}
        <main className="flex-1 min-w-0 lg:pl-64">
          {firstRead ? (
            <div className="px-5 sm:px-8 py-14 max-w-3xl">
              <p className="text-paper-dim text-sm">Reading your government access from the server.</p>
            </div>
          ) : error && !staleError ? (
            <div className="px-5 sm:px-8 py-14 max-w-3xl grid gap-4">
              <h1 className="font-display text-paper text-2xl">We could not read your access</h1>
              <p className="text-paper-dim text-sm leading-relaxed">
                {error === "logged-out"
                  ? "Your session has ended. Sign in again to open the portal."
                  : error === "supabase-disabled"
                    ? "This environment has no ADUAtlas database configured, so there is no access to read. Nothing is assumed in the meantime."
                    : "The server did not answer. Nothing has been assumed about what you may do here; try again in a moment."}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={reload}
                  className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press"
                >
                  Try again
                </button>
                <NavLink to="/login" className="px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
                  Sign in
                </NavLink>
              </div>
            </div>
          ) : needsClaim ? (
            <Navigate to="/gov/claim" replace />
          ) : (
            <>
              {staleError && (
                <div role="status" data-gov-reread-failed className="px-5 sm:px-8 pt-6 max-w-3xl">
                  <p className="bg-surface-1-solid border border-stroke rounded-xl px-4 py-3 text-paper-dim text-sm leading-relaxed">
                    We could not re-read your access just now, so this page shows it as it was when last read.{" "}
                    <button type="button" onClick={reload} className="font-medium text-accent underline underline-offset-2">
                      Try again
                    </button>
                  </p>
                </div>
              )}
              <Outlet context={outletContext} />
            </>
          )}
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
};

export default GovLayout;
