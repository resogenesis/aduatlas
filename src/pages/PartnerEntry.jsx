import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FiCheckCircle, FiInfo } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import { HEADER_REFRESH_EVENT } from "../components/common/Header";
import {
  PARTNER_ENTRY_KEY,
  accessToken,
  currentUser,
  isPortalUser,
  logout,
  portalForUser,
  refreshEntitlement,
} from "../stores/authStore";
import { getSessionId } from "../lib/referral";

// Where a resident lands from a partner link, and where a partner code is entered
// (Phase 1 spec, decision 2p).
//
// THE BROWSER DECIDES NOTHING. This page collects a link token or a typed code and
// posts it to /api/partner-redeem, which verifies the caller's session, resolves
// the app user server side and calls redeem_partner_access(). There is no tier,
// plan, price or role in the request, so there is nothing here to tamper with. The
// entitlement is a constant inside the database function, and the answer this page
// renders is the server's answer, in the server's own words.
//
// CONTEXT COMES FROM THE SERVER, OR NOT AT ALL. The partner and jurisdiction named
// on this page are read through the endpoint's context call, which answers only for
// a link that is redeemable right now and returns nothing for anything else. So a
// fabricated, expired or switched-off link cannot make this page assert that a
// government is sponsoring anybody: with no context, the page says what it is, in
// general terms, and asks for a code.
//
// A CODE IS NEVER RESOLVED BEFORE IT IS REDEEMED. A code is a secret; looking one
// up to decorate a page would be an oracle for guessing them. A link is public by
// design and a code is not, and that difference is why this page contextualises one
// and not the other.
//
// WHAT THE WORDING MUST NEVER IMPLY. A city, county or state that sponsors
// education is not endorsing ADUAtlas, not endorsing any builder, not endorsing any
// feasibility result and not approving any project. It is paying for a course.
// Every sentence here is written to keep that distinction, because this is the one
// screen where a resident could reasonably misread it.
//
// THE SPONSORED BENEFIT IS THE $79 GOLDEN EDUCATIONAL ACCESS AND NOTHING ELSE.
// Platinum, Concierge, feasibility studies and site plans stay priced, and the
// upgrade path is normal and explicit.
//
// NOTHING IS A FALLBACK. An invalid, expired, disabled or already-spent link or
// code grants nothing: no trial, no partial course, no "we will sort it out". The
// three cases where the token was fine and the ACCOUNT was not — already sponsored,
// already paid, needs a look — are shown as what they are rather than as a failure,
// because telling somebody who already has access that their link is broken would
// be a lie the server has already given us the words to avoid.
//
// THE RESUME. A resident who has to create an account first would otherwise lose
// the link: signup's destination belongs to the signup page, not to this one. The
// entry is therefore remembered in this browser and used when they come back, which
// is a convenience and not a credential: the token still has to pass the server,
// and nothing is granted by remembering it. The sign-in and signup links below
// carry this page's own path as `next`, and the sign-in pages also look for the
// remembered entry (landingAfterSignIn in authStore), so a resident comes back
// here after signing in rather than landing on the $79 plans.
//
// NOT FOR PORTAL ACCOUNTS. Sponsored access is for residents. Staff, builders and
// government users are sent to their own portal after signing in, and this page
// does not redeem for them either, whether they arrive from the sign-in page, in
// any spelling of this path, or open a link directly while signed in: no automatic
// redemption and no code form. It tells them the access is for residents and
// offers to log out and continue with a resident account. /api/partner-redeem has
// no role check (an owner decision), so this is the page's rule, not a boundary.

const STORE_KEY = PARTNER_ENTRY_KEY;

const readStored = () => {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.token && (parsed.kind === "link" || parsed.kind === "code") ? parsed : null;
  } catch {
    return null;
  }
};

const writeStored = (entry) => {
  try {
    if (entry) window.localStorage.setItem(STORE_KEY, JSON.stringify(entry));
    else window.localStorage.removeItem(STORE_KEY);
  } catch {
    // A browser that refuses storage still redeems; it just cannot resume.
  }
};

// T4-04 (RC4 rehearsal): the header decides between "Finish sponsored access",
// "See Packages" and "Your portal" from the remembered entry and the session
// mirror, read when it renders. This page changes both in place, without a route
// change, so once the server has answered it tells the header to render again.
// Before this the header kept "Finish sponsored access" on the grant page, and
// following it offered a code form to an account that already held Golden.
const refreshHeader = () => {
  try {
    window.dispatchEvent(new Event(HEADER_REFRESH_EVENT));
  } catch {
    // No window: nothing is rendered to refresh.
  }
};

const Card = ({ children, className = "" }) => (
  <div className={`bg-canvas border border-stroke rounded-3xl p-6 sm:p-8 ${className}`}>{children}</div>
);

const NotAnEndorsement = ({ sponsor }) => (
  <Card className="bg-surface-1-solid">
    <h2 className="font-display text-paper text-xl">What this is, and what it is not</h2>
    <ul className="mt-4 grid gap-2.5 text-paper-dim text-sm leading-relaxed">
      <li>
        {sponsor || "The sponsor"} is paying for homeowner education so residents understand ADU rules, costs and the
        process before they start spending money.
      </li>
      <li>
        It is not an endorsement of ADUAtlas, of any builder in the ADUAtlas directory, of any cost estimate or of any
        project. ADUAtlas is a private company and says so.
      </li>
      <li>
        Nothing in the course is a permit decision or an approval. Only your jurisdiction can approve what you build,
        and only your own parcel decides what fits.
      </li>
      <li>
        {sponsor || "The sponsor"} sees counts, not people: how many residents came through, and nothing about you,
        your address, your property or your progress.
      </li>
    </ul>
  </Card>
);

const WhatIsIncluded = () => (
  <Card>
    <h2 className="font-display text-paper text-xl">What the sponsored access includes</h2>
    <p className="text-paper-dim text-sm leading-relaxed mt-3">
      The Golden plan, normally $79: the full homeowner course and the builder directory. Platinum and Concierge, which
      add a feasibility study, a site plan and the preparation worksheets, are not part of the sponsorship and keep
      their normal price. You are never charged for the sponsored access, and you are never enrolled in anything that
      renews.
    </p>
  </Card>
);

// The network half of a redemption: no state, no decisions, just the server's
// answer in a shape the component can apply. Kept out of the component so the
// effect that fires it never touches state synchronously.
const postRedemption = async (kind, token) => {
  let res;
  try {
    const bearer = await accessToken();
    res = await fetch("/api/partner-redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ kind, token }),
    });
  } catch {
    return {
      status: "error",
      message:
        "We could not reach ADUAtlas just now. Nothing has been added to your account. Please try again in a moment.",
      body: null,
    };
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    return {
      status: "idle",
      message: body.message || "Create your account or sign in first, then open this link again.",
      body: null,
    };
  }
  if (res.status === 429) {
    return {
      status: "limited",
      message: body.message || "Too many attempts. Wait a few minutes and try again.",
      body: null,
    };
  }
  if (body.granted) return { status: "granted", message: body.message || "", body };
  // The token resolved and the account did not need a grant. Not a failure, and
  // the sentence is the server's.
  if (body.outcome) return { status: "already", message: body.message || "", body };
  return {
    status: "nothing",
    message:
      body.message ||
      "This access link or code is not available. Nothing has been added to your account, and no plan has been started.",
    body: null,
  };
};

// What the entry page may show for a LINK before anything is redeemed. The
// endpoint answers only for a link that is redeemable right now.
const fetchContext = async (token) => {
  try {
    const params = new URLSearchParams({ token });
    // The browser id the referral tracker already keeps, which is the shape the
    // visit counter wants. It carries no identity: one visit a day per link per
    // browser, and no user id or address is stored against it.
    const sid = getSessionId();
    if (sid) params.set("sid", sid);
    const res = await fetch(`/api/partner-redeem?${params.toString()}`);
    const body = await res.json().catch(() => ({}));
    return body?.context || null;
  } catch {
    return null;
  }
};

const rulesPath = (source) => {
  const state = String(source?.state_code || "").toLowerCase();
  if (!state) return null;
  return source?.jurisdiction_slug ? `/rules/${state}/${source.jurisdiction_slug}` : `/rules/${state}`;
};

const PartnerEntry = () => {
  const { token: routeToken } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // This page, as the place to come back to after signing in or signing up (for
  // a resident; see landingAfterSignIn).
  const backHere = `?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  const navigate = useNavigate();
  const user = currentUser();
  const signedIn = Boolean(user);
  // A staff, builder or government account: shown what this is, never redeemed.
  const portalUser = isPortalUser(user);
  const portal = portalForUser(user);

  const [typedCode, setTypedCode] = useState("");
  const [status, setStatus] = useState("idle"); // idle | working | granted | already | nothing | limited | error
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  // What this browser remembered, read once. It is a convenience, not a
  // credential: the token still has to pass the server.
  const [stored] = useState(() => readStored());
  const [cleared, setCleared] = useState(false);
  const [contextState, setContextState] = useState({ token: "", row: null, done: false });
  const attempted = useRef("");

  // A sponsored-entry url carries a token. It is not indexed and it is not
  // followed: a token in a search result is a token in the wrong place.
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow";
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);

  // What this visit is carrying: the path, then the query.
  const incoming = useMemo(() => {
    const queryCode = searchParams.get("code");
    const queryToken = searchParams.get("token");
    if (routeToken) return { kind: "link", token: routeToken };
    if (queryToken) return { kind: "link", token: queryToken };
    if (queryCode) return { kind: "code", token: queryCode };
    return null;
  }, [routeToken, searchParams]);

  // Derived, never copied into state: the url is the source of truth for this
  // visit, and "cleared" is the one thing a person can change from a button.
  const entry = cleared ? null : incoming || stored;

  // Remembering the entry is a side effect on storage, not on state.
  useEffect(() => {
    if (incoming) writeStored(incoming);
  }, [incoming]);

  // The partner behind a LINK, read from the server. Never attempted for a code.
  const linkToken = entry?.kind === "link" ? entry.token : "";
  useEffect(() => {
    if (!linkToken) return undefined;
    let alive = true;
    fetchContext(linkToken).then((row) => {
      if (alive) setContextState({ token: linkToken, row, done: true });
    });
    return () => {
      alive = false;
    };
  }, [linkToken]);

  const context = contextState.token === linkToken ? contextState.row : null;

  // Applying the server's answer. Called from a promise callback or an event
  // handler, never synchronously from an effect body.
  const applyResult = useCallback((outcome) => {
    setStatus(outcome.status);
    setMessage(outcome.message);
    if (outcome.status === "granted" || outcome.status === "already") {
      setResult(outcome.body);
      writeStored(null);
    }
    // A token the server refused is not worth keeping: remembering it would only
    // replay the same refusal on the next visit. A 401 is different and keeps it,
    // because that resident still has an account to create.
    if (outcome.status === "nothing") writeStored(null);
    if (outcome.status === "granted") {
      // The entitlement is re-read from the server rather than assumed: the grant
      // happened in the database, and this only refreshes what this browser knows.
      // The header renders again once that read has settled, so it names the
      // portal the grant opened rather than the plans (T4-04).
      Promise.resolve(refreshEntitlement())
        .catch(() => null)
        .then(refreshHeader);
    } else if (outcome.status === "already" || outcome.status === "nothing") {
      // The remembered entry is gone, so the header stops pointing back to it.
      refreshHeader();
    }
  }, []);

  // A signed-in resident arriving with a link should not have to press anything.
  // The ref keeps the double effect invocation in development from sending twice.
  useEffect(() => {
    if (!signedIn || portalUser || !entry?.token || status !== "idle") return undefined;
    const key = `${entry.kind}:${entry.token}`;
    if (attempted.current === key) return undefined;
    attempted.current = key;
    let alive = true;
    postRedemption(entry.kind, entry.token).then((outcome) => {
      if (alive) applyResult(outcome);
    });
    return () => {
      alive = false;
    };
  }, [signedIn, portalUser, entry, status, applyResult]);

  // In flight: signed in, carrying a token, and the server has not answered yet.
  const checking = signedIn && !portalUser && Boolean(entry?.token) && status === "idle";

  // Log out here and stay on this page, which then offers the resident's way in
  // (create an account or sign in, then back here). The entry stays remembered.
  const continueAsResident = async () => {
    await logout({ keepPartnerEntry: true });
    navigate(`${location.pathname}${location.search}`, { replace: true });
  };

  const sponsor = result?.entity_name || context?.entity_name || null;
  const place = result?.jurisdiction_name || context?.jurisdiction_name || null;
  const rules = rulesPath(result) || rulesPath(context);

  // ── granted ───────────────────────────────────────────────────────────────
  if (status === "granted") {
    return (
      <div>
        <PageHeader
          title="Your sponsored course access is ready"
          subtitle={
            sponsor
              ? `${sponsor} is sponsoring ADU education for its residents. Your ADUAtlas course access is on your account at no cost to you.`
              : "Your ADUAtlas course access is on your account at no cost to you."
          }
        />
        <section className="container mx-auto px-5 sm:px-8 max-w-3xl py-10 sm:py-14 grid gap-6">
          <Card>
            <p className="text-paper text-sm font-medium flex items-start gap-2">
              <FiCheckCircle className="text-accent mt-0.5 shrink-0" aria-hidden />
              {message}
            </p>
            <p className="text-paper-dim text-sm leading-relaxed mt-4">
              That is the Golden educational plan: the full homeowner course and the builder directory. A feasibility
              study, a site plan and the preparation worksheets are part of Platinum and Concierge, which stay at
              their normal price. If you want one later, the upgrade is a normal purchase with the price shown before
              you buy.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/course" className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
                Start the course
              </Link>
              <Link to="/dashboard" className="px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
                Go to your account
              </Link>
            </div>
          </Card>
          <NotAnEndorsement sponsor={sponsor} />
          {rules && (
            <Card>
              <h2 className="font-display text-paper text-xl">The rules where you live</h2>
              <p className="text-paper-dim text-sm leading-relaxed mt-3">
                What {place || "your state, county and city"} publishes about ADUs, with the official source beside
                every rule and the date ADUAtlas last read it. Those are the jurisdiction's rules, not a decision
                about your property.
              </p>
              <Link to={rules} className="mt-4 inline-block text-accent text-sm font-medium">
                Open the rules page
              </Link>
            </Card>
          )}
        </section>
      </div>
    );
  }

  // ── the token was fine and the account needed no grant ───────────────────
  if (status === "already") {
    const needsReview = result?.outcome === "needs_review";
    return (
      <div>
        <PageHeader
          title={needsReview ? "This one needs a look from ADUAtlas" : "Your account already has access"}
          subtitle={message}
        />
        <section className="container mx-auto px-5 sm:px-8 max-w-3xl py-10 sm:py-14 grid gap-6">
          <Card>
            <p className="text-paper-dim text-sm leading-relaxed flex items-start gap-2">
              <FiInfo className="text-paper-dim mt-0.5 shrink-0" aria-hidden />
              {needsReview
                ? "Nothing on your account was changed. Contact ADUAtlas support and we will sort it out with you."
                : "Nothing on your account was changed, and nothing was charged. Sponsored access is granted once per person, and a plan you have already paid for is never reduced to make room for it."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {needsReview ? (
                <a href="mailto:hello@aduatlas.com?subject=Sponsored%20access" className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
                  Email ADUAtlas
                </a>
              ) : (
                <Link to="/course" className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
                  Open your course
                </Link>
              )}
              <Link to="/dashboard" className="px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
                Go to your account
              </Link>
            </div>
          </Card>
          {sponsor && <NotAnEndorsement sponsor={sponsor} />}
        </section>
      </div>
    );
  }

  // ── nothing granted, rate limited, or a transport failure ────────────────
  if (status === "nothing" || status === "limited" || status === "error") {
    return (
      <div>
        <PageHeader
          title={status === "limited" ? "Too many attempts" : "This link or code does not give access"}
          subtitle={message}
        />
        <section className="container mx-auto px-5 sm:px-8 max-w-3xl py-10 sm:py-14 grid gap-6">
          <Card>
            <h2 className="font-display text-paper text-xl">What to do next</h2>
            <ul className="mt-4 grid gap-2.5 text-paper-dim text-sm leading-relaxed">
              <li>Check the address or code against what your city, county or state published, including the spelling.</li>
              <li>Ask them for the current link: a sponsor can turn one off or let it expire.</li>
              <li>
                Nothing has been added to your account and nothing has been charged. ADUAtlas does not start a trial or
                a partial plan when a code does not work.
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  attempted.current = "";
                  setStatus("idle");
                  setMessage("");
                  setCleared(true);
                  setTypedCode("");
                  writeStored(null);
                  refreshHeader();
                }}
                className="px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press"
              >
                Enter a code instead
              </button>
              <Link to="/unlock" className="px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
                See plans and pricing
              </Link>
            </div>
          </Card>
        </section>
      </div>
    );
  }

  // ── idle: contextualise, then either wait on the server or take a code ───
  return (
    <div>
      <PageHeader
        title={place ? `ADU education, sponsored for ${place} residents` : "Sponsored ADU education"}
        subtitle={
          sponsor
            ? `${sponsor} is an ADUAtlas Education Partner and is sponsoring the $79 homeowner course for its residents. It costs you nothing.`
            : "If your city, county or state sponsors ADUAtlas education, a link or a code from them gives you the full homeowner course at no cost to you."
        }
      />
      <section className="container mx-auto px-5 sm:px-8 max-w-3xl py-10 sm:py-14 grid gap-6">
        {checking || status === "working" ? (
          <Card>
            <p className="text-paper-dim text-sm">Checking this with ADUAtlas.</p>
          </Card>
        ) : signedIn && portalUser ? (
          <Card>
            <div data-partner-entry="portal-account">
              <h2 className="font-display text-paper text-xl">Sponsored access is for residents</h2>
              <p className="text-paper-dim text-sm leading-relaxed mt-3">
                You are signed in with an account that has its own portal
                {portal ? `, the ${portal.label.toLowerCase()}` : ""}. Sponsored access goes onto a resident&apos;s own
                ADUAtlas account, so this page does not apply it to this one. Nothing has been added to this account and
                nothing has been charged.
              </p>
              <p className="text-paper-dim text-sm leading-relaxed mt-3">
                If you are also a resident and want the course for yourself, log out and continue here with your own
                resident account.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={continueAsResident}
                  className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press"
                >
                  Log out and continue as a resident
                </button>
                {portal && (
                  <Link to={portal.to} className="px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
                    Go to the {portal.label.toLowerCase()}
                  </Link>
                )}
              </div>
            </div>
          </Card>
        ) : !signedIn ? (
          <Card>
            <h2 className="font-display text-paper text-xl">Create your account first</h2>
            <p className="text-paper-dim text-sm leading-relaxed mt-3">
              The sponsored access goes onto an ADUAtlas account, so there has to be one. Create it or sign in, and
              you come back to this page, where the access is applied. If you end up somewhere else, open this link
              again. {message}
            </p>
            <p className="text-paper-dim text-xs leading-relaxed mt-3">
              This browser remembers the link so you can come back to it. Remembering it grants nothing on its own:
              the check still happens on our server.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={`/create-account${backHere}`} className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
                Create your account
              </Link>
              <Link to={`/login${backHere}`} className="px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
                Sign in
              </Link>
            </div>
          </Card>
        ) : (
          <Card>
            <h2 className="font-display text-paper text-xl">Enter your access code</h2>
            <p className="text-paper-dim text-sm leading-relaxed mt-3">
              A code from your city, county or state gives the same access as their link, through the same check. Eight
              characters, as it was printed.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const token = typedCode.trim();
                if (!token) return;
                attempted.current = `code:${token}`;
                writeStored({ kind: "code", token });
                setStatus("working");
                setMessage("");
                postRedemption("code", token).then(applyResult);
              }}
              className="mt-5 flex flex-col sm:flex-row gap-3"
            >
              <label className="flex-1">
                <span className="sr-only">Access code</span>
                <input
                  value={typedCode}
                  onChange={(event) => setTypedCode(event.target.value.toUpperCase())}
                  placeholder="ABCD2345"
                  autoComplete="off"
                  spellCheck="false"
                  maxLength={12}
                  className="w-full px-4 py-3.5 rounded-xl bg-surface-1-solid border border-stroke text-paper text-sm tracking-widest placeholder:text-paper-dim/60 placeholder:tracking-normal focus:outline-none focus:border-accent transition"
                />
              </label>
              <button
                type="submit"
                className="px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press"
              >
                Claim the access
              </button>
            </form>
            {message && <p className="text-paper-dim text-sm mt-4">{message}</p>}
          </Card>
        )}

        <NotAnEndorsement sponsor={sponsor} />
        <WhatIsIncluded />

        {rules && (
          <Card>
            <h2 className="font-display text-paper text-xl">The rules where you live</h2>
            <p className="text-paper-dim text-sm leading-relaxed mt-3">
              You can read what {place} publishes about ADUs without an account, with the official source beside every
              rule.
            </p>
            <Link to={rules} className="mt-4 inline-block text-accent text-sm font-medium">
              Open the rules page
            </Link>
          </Card>
        )}
      </section>
    </div>
  );
};

export default PartnerEntry;
