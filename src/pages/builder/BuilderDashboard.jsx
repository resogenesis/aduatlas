import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiCheckCircle, FiClock, FiCopy, FiEye, FiEyeOff, FiFileText, FiLink, FiMessageCircle, FiMessageSquare, FiShoppingBag, FiSlash } from "react-icons/fi";
import { PROFILE_STATUS_LABELS, VERIFIED_BADGE_LABEL, VERIFIED_HELP, VERIFIED_LIMITS, fetchMyBuilder, fetchMyReferralStats, isVerified, referralLinkFor } from "../../lib/builders";
import { listConversationSummaries } from "../../lib/builderMessaging";
import { ClaimCodePanel } from "./BuilderProfileEdit";
import { VerifiedBadge } from "../BuilderProfile";

// Builder dashboard: the builder's own profile status, referral link and
// aggregate counts. Nothing on this page identifies a homeowner. The numbers
// come from my_referral_stats(), which returns counts only (migrations 0006
// and 0007), and the labels stay honest (Phase 1 spec 5.3): a profile view is
// not a lead and a link click is not a lead, so neither word appears here.
// The tiles run in the locked order: profile views, referral link clicks,
// homeowner inquiries, conversations, signed projects; then purchases with
// the gross and the net amount after refunds.
//
// Two kinds of listing. An account with no profile sees the claim panel
// (ADUAtlas may already list the company) and a link to set up a new
// profile. A claimed, approved listing has a working referral link even
// before ADUAtlas has verified the business information; the badge, which reads
// "Verified on ADUAtlas" (decision 2e), is the separate admin step, and this
// page renders the same VerifiedBadge component the homeowner sees so the wording
// cannot drift between the two sides. An affiliate with its own tracking link is
// told that clicks are counted by the partner program rather than shown 0, and is
// never told that the arrangement counts as verification.
//
// MESSAGES (decision 2h). The Messages card links to /builder/messages, where
// the builder replies to conversations homeowners started. The Conversations
// tile counts those threads from the messaging tables themselves, because
// my_referral_stats() still reports conversations as 0 (0007, 0011's closing
// notes). A thread counts once the homeowner has written in it. Only threads
// on THIS listing are read (listConversationSummaries with builderId). RC4a
// review, finding 21: RLS also returns an account's own HOMEOWNER threads (an
// account an admin made a builder after it had messaged builders as a
// homeowner), and unscoped they were counted as this listing's conversations,
// and an empty one of them was taken off this listing's inquiries.
//
// HOMEOWNER INQUIRIES. T4-16 (RC4 rehearsal): the tile showed my_referral_stats'
// builder_contacted count as it stood, and 0011's log_builder_conversation_
// opened() records that event when a thread is CREATED, before any message
// exists. A homeowner who opened a thread and never wrote (or whose first
// message failed after the thread was made) therefore counted as an inquiry,
// while the Conversations tile, rightly, did not count the thread. The funnel
// counts a conversation only once a homeowner has written in it, so the tile now
// subtracts the threads on this listing that have no message at all. Each such
// thread wrote at most one builder_contacted row when it was created (threads
// are unique per homeowner and listing), and nothing else here can be matched to
// an event: referral_events is service-role only. The one case this cannot
// separate is a homeowner who requested an introduction AND opened an empty
// thread on the same UTC day, which the daily unique index had already folded
// into one event; the tile then counts that homeowner as zero rather than one,
// so the number can be low by that, never high. The exact count needs the event
// written on the first homeowner message instead of on the thread insert, which
// is a database change and outside this pass. Until the thread list has loaded,
// the tile waits, and if it cannot load the tile says so rather than showing
// the uncorrected number.
//
// What claiming does and does not switch on, said plainly on this page because
// the builder-facing copy used to get it wrong. ADUAtlas records a profile view
// and an introduction request for every listing it publishes, claimed or not
// (log_builder_event and intro_requests, 0006), so a builder who claims an
// older listing may find counts that predate the claim. The referral link is
// the part that needs the claim: builder_tracking_active in 0007 requires an
// owner and an approved status before a code resolves.

// The lib wrappers follow the {ok, ...} convention used across src/lib, but
// this page also accepts a bare row or array so a shape change in the data
// layer degrades to "no profile yet" instead of a blank page.
const unwrapBuilder = (r) => {
  if (!r) return { builder: null, error: "" };
  if (Array.isArray(r)) return { builder: r[0] || null, error: "" };
  if (typeof r !== "object") return { builder: null, error: "" };
  if ("ok" in r) return { builder: r.ok ? r.builder ?? null : null, error: r.ok ? "" : String(r.error || "unavailable") };
  if ("builder" in r) return { builder: r.builder ?? null, error: "" };
  return { builder: r.id ? r : null, error: "" };
};

const num = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// my_referral_stats() returns jsonb: counts by event kind, referred_users_count,
// purchased_amount_cents (gross), refunded_amount_cents, net_amount_cents and
// the conversations placeholder. Older shapes are read leniently; net falls
// back to gross minus refunds.
const readStats = (r) => {
  const raw = r && typeof r === "object" ? ("ok" in r ? (r.ok ? r.stats ?? r.data ?? {} : null) : r.stats ?? r) : {};
  if (raw === null) return null;
  const counts = raw.counts && typeof raw.counts === "object" ? raw.counts : raw;
  const gross = num(raw.purchased_amount_cents ?? raw.purchase_amount_cents);
  const refunded = num(raw.refunded_amount_cents);
  const net = raw.net_amount_cents != null ? num(raw.net_amount_cents) : gross - refunded;
  return {
    profileViews: num(counts.builder_profile_viewed ?? raw.profile_views),
    clicks: num(counts.link_visited ?? raw.visits),
    inquiries: num(counts.builder_contacted ?? raw.contacts),
    conversations: num(raw.conversations ?? counts.conversations),
    projectsSigned: num(counts.project_signed ?? raw.projects_signed),
    signups: num(counts.account_created ?? raw.accounts),
    purchases: num(counts.package_purchased ?? raw.purchases),
    grossCents: gross,
    netCents: net,
  };
};

const money = (cents) => `$${Math.round(cents / 100).toLocaleString()}`;
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const Tile = ({ Icon, label, value, hint }) => (
  <div className="bg-canvas border border-stroke rounded-3xl p-6">
    <p className="inline-flex items-center gap-2 text-paper-dim text-sm mb-2">
      <Icon aria-hidden /> {label}
    </p>
    <p className="font-display text-paper text-3xl leading-none mb-1">{typeof value === "number" ? value.toLocaleString() : value}</p>
    {hint && <p className="text-paper-dim text-xs leading-relaxed">{hint}</p>}
  </div>
);

// `view` is the displayed state. It is the profile_status except for an
// approved row whose `active` flag is off (not in the directory, link
// paused) and an approved row ADUAtlas has verified.
const StatusCard = ({ status, view = status, children }) => {
  const tone = {
    draft: { Icon: FiFileText, heading: "Finish your profile and submit it for review" },
    pending: { Icon: FiClock, heading: "Under review" },
    approved: { Icon: FiCheckCircle, heading: "Your listing is live" },
    verified: { Icon: FiCheckCircle, heading: `Your listing is live and ${VERIFIED_BADGE_LABEL}` },
    hidden: { Icon: FiEyeOff, heading: "Your listing is approved but hidden" },
    inactive: { Icon: FiSlash, heading: "Your listing is inactive" },
  }[view] || { Icon: FiFileText, heading: "Your profile" };
  const label = PROFILE_STATUS_LABELS?.[status] || status;
  return (
    <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9 mb-6">
      <p className="inline-flex items-center gap-2 text-paper-dim text-sm mb-3">
        <tone.Icon aria-hidden /> Profile status: {view === "hidden" ? `${label}, hidden` : label}
      </p>
      <h2 className="font-display text-paper text-2xl sm:text-3xl leading-tight mb-3">{tone.heading}</h2>
      {children}
    </section>
  );
};

// The recorded terms on the builder row (0006: intro_days,
// membership_price_cents, success_fee_cents) shown back to a marketplace
// builder. Nothing here bills anything; the terms are settled by hand.
const termsFor = (b) => {
  const relationship = b?.relationship_type || "marketplace";
  if (relationship === "affiliate") {
    return [
      "You work with ADUAtlas as an affiliate, under your own agreement and your own tracking link. The standard marketplace fee does not apply to you.",
      "ADUAtlas still records a signed project that came through the platform, so your numbers are complete.",
    ];
  }
  if (relationship === "partner") {
    return ["You work with ADUAtlas as a partner, under the terms in your agreement. The standard marketplace fee does not apply to you."];
  }
  const days = num(b?.intro_days) || 90;
  const monthly = num(b?.membership_price_cents) || 4900;
  const fee = num(b?.success_fee_cents) || 50000;
  return [
    `Your first ${days} days of membership are free. After that, marketplace membership is ${money(monthly)} a month.`,
    "There is no charge for profile views, link clicks or homeowner inquiries, and no promised number of any of them.",
    `When a homeowner ADUAtlas referred signs a project with you, the referral fee is ${money(fee)}. ADUAtlas records the signing. Membership and fees are settled with you directly, and nothing is charged through this portal.`,
  ];
};

const BuilderDashboard = () => {
  const [state, setState] = useState({ loading: true, builder: null, error: "" });
  const [stats, setStats] = useState(undefined);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  // Every conversation summary on this listing, empty threads included, for the
  // Messages card, the Conversations tile and the inquiries correction (T4-16).
  // Scoped to the listing's id (finding 21), so a thread the account holds as a
  // homeowner is never among them. undefined while loading, null when they
  // could not be read.
  const [threads, setThreads] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchMyBuilder().then((r) => {
      if (cancelled) return;
      const { builder, error } = unwrapBuilder(r);
      setState({ loading: false, builder, error });
      if (builder) {
        listConversationSummaries({ as: "builder", builderId: builder.id }).then((t) => {
          if (!cancelled) setThreads(t.ok ? t.conversations : null);
        });
      }
      if (builder?.profile_status === "approved" && builder.active !== false) {
        fetchMyReferralStats().then((s) => {
          if (!cancelled) setStats(readStats(s));
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClaimed = (builder) => {
    setState({ loading: false, builder, error: "" });
    listConversationSummaries({ as: "builder", builderId: builder?.id }).then((t) => setThreads(t.ok ? t.conversations : null));
    if (builder?.profile_status === "approved" && builder.active !== false) {
      fetchMyReferralStats().then((s) => setStats(readStats(s)));
    }
  };

  const { loading, builder, error } = state;

  if (loading) return <div className="px-5 sm:px-8 lg:px-12 py-14 text-paper-dim text-sm">Loading your dashboard…</div>;

  // The account exists but owns no profile yet. ADUAtlas may already list the
  // company, so the claim code comes first; a new profile is the other door.
  if (!builder && !error) {
    return (
      <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] mb-2">Welcome to your builder portal</h1>
          <p className="text-paper-dim text-base max-w-2xl">Two ways to get your listing: claim the one ADUAtlas already created for you, or set up a new profile.</p>
        </div>
        <ClaimCodePanel onClaimed={onClaimed}>
          <p className="text-paper-dim text-sm mt-5">
            Not listed yet?{" "}
            <Link to="/builder/profile" className="text-accent font-medium inline-flex items-center gap-1">
              Set up a new profile <FiArrowRight />
            </Link>{" "}
            and submit it for review.
          </p>
        </ClaimCodePanel>
      </div>
    );
  }

  const status = builder?.profile_status || "draft";
  // Approved but switched off by an admin: not in the directory, link paused.
  const hidden = status === "approved" && builder?.active === false;
  const live = status === "approved" && !hidden;
  const verified = Boolean(builder) && isVerified(builder);
  const affiliateLink = builder?.relationship_type === "affiliate" && Boolean(builder?.external_tracking_url);
  // referralLinkFor: the affiliate's own link when it has one, otherwise the
  // ADUAtlas link once the listing is claimed and approved, otherwise null.
  const link = builder ? referralLinkFor(builder) : null;

  // Threads a homeowner has written in: what the Messages card and the
  // Conversations tile count. The rest were opened and never written in.
  const started = Array.isArray(threads) ? threads.filter((t) => t.has_messages) : null;
  const emptyThreads = Array.isArray(threads) ? threads.length - started.length : 0;
  const conversationCount = started ? started.length : null;
  const unreadCount = started ? started.reduce((n, t) => n + (t.unread || 0), 0) : 0;
  // T4-16: inquiries without the threads nobody wrote in (see the note at the
  // top of this file for why this is a subtraction and when it can be low).
  const inquiryValue = (s) => (threads === undefined ? "…" : threads === null ? "Not available" : Math.max(0, s.inquiries - emptyThreads));

  const copyLink = async () => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError("Copy did not work in this browser. Select the link and copy it by hand.");
    }
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05]">{builder?.name || "Your builder dashboard"}</h1>
          {verified && <VerifiedBadge />}
        </div>
        <p className="text-paper-dim text-base">This page shows your profile status, your referral link and the counts that came through ADUAtlas.</p>
      </div>

      {error && (
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9 mb-6">
          <h2 className="font-display text-paper text-2xl leading-tight mb-3">The builder portal is not available right now</h2>
          <p className="text-paper-dim text-sm leading-relaxed mb-4">
            {error === "supabase-disabled"
              ? "The account service is not connected in this environment."
              : "We could not load your profile. Try again in a minute, and write to us if it keeps happening."}
          </p>
          <a href="mailto:hello@aduatlas.com?subject=Builder%20portal" className="text-accent text-sm font-medium">
            hello@aduatlas.com
          </a>
        </section>
      )}

      {builder && (
        <section aria-label="Messages" className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-7 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="inline-flex items-center gap-2 text-paper font-medium mb-1">
              <FiMessageCircle aria-hidden /> Messages
            </p>
            <p className="text-paper-dim text-sm leading-relaxed">
              {threads === undefined
                ? "Loading your conversations…"
                : threads === null
                  ? "Your conversations could not be loaded right now."
                  : conversationCount === 0
                    ? "No homeowner has messaged you yet. Homeowners start every conversation, and you can reply to any they start."
                    : `${plural(conversationCount, "conversation", "conversations")} with homeowners${unreadCount ? `, ${plural(unreadCount, "new message", "new messages")} to read` : ""}.`}
            </p>
          </div>
          <Link to="/builder/messages" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors press shrink-0">
            Open messages <FiArrowRight aria-hidden />
          </Link>
        </section>
      )}

      {builder && status === "draft" && (
        <StatusCard status="draft">
          <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-5 max-w-xl">
            Your profile is saved as a draft and is not in the directory yet. Complete the company details, then submit it. ADUAtlas reviews new profiles within a few business days.
          </p>
          <Link to="/builder/profile" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors">
            Open my profile <FiArrowRight />
          </Link>
        </StatusCard>
      )}

      {builder && status === "pending" && (
        <StatusCard status="pending">
          <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-5 max-w-xl">
            ADUAtlas is reviewing your profile. When it is approved, your listing goes live and your referral link appears here. You can keep editing your profile in the meantime.
          </p>
          <Link to="/builder/profile" className="inline-flex items-center gap-2 text-accent text-sm font-medium">
            Edit my profile <FiArrowRight />
          </Link>
        </StatusCard>
      )}

      {builder && status === "inactive" && (
        <StatusCard status="inactive">
          <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-5 max-w-xl">
            Your listing is inactive, so homeowners cannot see it and the referral link is paused. Contact us to reactivate it.
          </p>
          <a href="mailto:hello@aduatlas.com?subject=Reactivate%20my%20builder%20listing" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors">
            Contact us
          </a>
        </StatusCard>
      )}

      {builder && hidden && (
        <StatusCard status="approved" view="hidden">
          <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-5 max-w-xl">
            Your listing is approved but currently hidden from the directory. Contact us to restore it.
          </p>
          <a href="mailto:hello@aduatlas.com?subject=Restore%20my%20builder%20listing" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors">
            Contact us
          </a>
        </StatusCard>
      )}

      {builder && live && (
        <>
          <StatusCard status="approved" view={verified ? "verified" : "approved"}>
            {verified ? (
              <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-5 max-w-xl">
                Homeowners can find you in the directory, and your profile carries the {VERIFIED_BADGE_LABEL} badge: {VERIFIED_HELP}. {VERIFIED_LIMITS}
              </p>
            ) : (
              <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-5 max-w-xl">
                <span className="text-paper font-medium">Claimed. Verification pending. Your referral link is active.</span> Homeowners can find you in the directory now. ADUAtlas is checking your business information, and the {VERIFIED_BADGE_LABEL} badge appears on your profile when that is done.
              </p>
            )}
            <p className="text-paper-dim text-xs mb-2 inline-flex items-center gap-1.5">
              <FiLink aria-hidden /> {affiliateLink ? "Your partner tracking link" : "Your referral link"}
            </p>
            {link ? (
              <>
                <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                  <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label={affiliateLink ? "Partner tracking link" : "Referral link"} className="flex-1 bg-canvas border border-stroke rounded-xl px-4 py-3 text-paper font-mono text-sm" />
                  <button type="button" onClick={copyLink} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim whitespace-nowrap press">
                    <FiCopy /> {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-paper-dim text-xs leading-relaxed mt-3 max-w-xl">
                  {affiliateLink
                    ? "This is the link from your affiliate program. Share it as you do today. Its clicks are counted by your partner program, not by ADUAtlas."
                    : "Share it wherever you talk to homeowners. Anyone who arrives through it is attributed to you when they leave an email or buy a plan."}
                </p>
              </>
            ) : (
              <p className="text-paper-dim text-sm">Your link is being generated. Check back shortly.</p>
            )}
            {copyError && (
              <p role="alert" className="text-sm text-red-700 mt-2">
                {copyError}
              </p>
            )}
          </StatusCard>

          <section className="mb-6">
            <h2 className="font-display text-paper text-xl mb-1">Your numbers</h2>
            {stats === undefined && <p className="text-paper-dim text-sm">Loading counts…</p>}
            {stats === null && <p className="text-paper-dim text-sm">Counts are not available right now.</p>}
            {stats && (
              <>
                <p className="text-paper text-base sm:text-lg mb-5">
                  {affiliateLink ? "" : `${plural(stats.clicks, "referral link click", "referral link clicks")}, `}
                  {plural(stats.signups, "sign up", "sign ups")}, {plural(stats.purchases, "purchase", "purchases")}. {money(stats.grossCents)} gross, {money(stats.netCents)} net after refunds.
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Tile Icon={FiEye} label="Profile views" value={stats.profileViews} hint="Signed in homeowners who opened your profile" />
                  <Tile
                    Icon={FiLink}
                    label="Referral link clicks"
                    value={affiliateLink ? "Partner program" : stats.clicks}
                    hint={affiliateLink ? "Clicks on your affiliate link are counted by your partner program, not by ADUAtlas." : "Times your ADUAtlas referral link was opened"}
                  />
                  <Tile
                    Icon={FiMessageSquare}
                    label="Homeowner inquiries"
                    value={inquiryValue(stats)}
                    hint="Introduction requests and conversations where a homeowner has written to you"
                  />
                  <Tile
                    Icon={FiMessageCircle}
                    label="Conversations"
                    value={threads === undefined ? "…" : conversationCount ?? "Not available"}
                    hint="Conversations homeowners started with you in ADUAtlas messages"
                  />
                  <Tile Icon={FiCheckCircle} label="Signed projects" value={stats.projectsSigned} hint="Recorded by ADUAtlas when a referred homeowner signs with you" />
                  <div className="bg-canvas border border-stroke rounded-3xl p-6">
                    <p className="inline-flex items-center gap-2 text-paper-dim text-sm mb-2">
                      <FiShoppingBag aria-hidden /> Purchases
                    </p>
                    <p className="font-display text-paper text-3xl leading-none mb-3">{stats.purchases.toLocaleString()}</p>
                    <dl className="grid grid-cols-2 gap-3 text-sm mb-1">
                      <div>
                        <dt className="text-paper-dim text-xs">Gross</dt>
                        <dd className="text-paper font-medium">{money(stats.grossCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-paper-dim text-xs">Net after refunds</dt>
                        <dd className="text-paper font-medium">{money(stats.netCents)}</dd>
                      </div>
                    </dl>
                    <p className="text-paper-dim text-xs leading-relaxed">Plans bought by homeowners who arrived through your link.</p>
                  </div>
                </div>
                <p className="text-paper-dim text-xs mt-4 leading-relaxed max-w-2xl">
                  These are counts only. ADUAtlas does not share who any of these homeowners are. When a homeowner wants to talk to you, they message you here in ADUAtlas, or they request an introduction and ADUAtlas passes their message on.
                </p>
                <p className="text-paper-dim text-xs mt-2 leading-relaxed max-w-2xl">
                  Profile views and homeowner inquiries are recorded for a published listing from the day it goes into the directory, so if ADUAtlas listed your company before you claimed it, some of these happened before you arrived. Your referral link is the part that needed the claim, and its clicks and purchases count from the day you claimed.
                </p>
              </>
            )}
          </section>
        </>
      )}

      {builder && (
        <section className="bg-canvas border border-stroke rounded-3xl p-7">
          <h2 className="font-display text-paper text-xl mb-3">How the marketplace works for you</h2>
          <ul className="text-paper-dim text-sm leading-relaxed space-y-2 list-disc pl-5">
            <li>Homeowners browse builders by state, ADU type and turnkey preference, and read your profile.</li>
            <li>A homeowner on a plan can message you from your profile, and you reply from Messages in this portal. A homeowner can also request an introduction, and ADUAtlas passes their message on to the contact details on your profile. The homeowner always makes the first move, and you cannot start a conversation.</li>
            <li>Your email address and phone number are shown to a homeowner on a plan only because you claimed this listing. ADUAtlas does not hand out the contact details of a company that has not claimed its profile.</li>
            <li>ADUAtlas records profile views and introduction requests for any listing it publishes, whether or not the company has claimed it. Claiming is what gives you this dashboard to read them in, your referral link and the {VERIFIED_BADGE_LABEL} badge.</li>
            {termsFor(builder).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default BuilderDashboard;
