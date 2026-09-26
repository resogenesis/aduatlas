import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { FiArrowRight, FiCheckCircle, FiClock, FiCopy, FiEye, FiEyeOff, FiFileText, FiLink, FiMessageSquare, FiSlash } from "react-icons/fi";
import { PROFILE_STATUS_LABELS, fetchMyBuilder, fetchMyReferralStats } from "../../lib/builders";

// Builder dashboard: the builder's own profile status and aggregate referral
// counts. Nothing on this page identifies a homeowner. The numbers come from
// my_referral_stats(), which returns counts only (migration 0006), and the
// labels stay honest: a profile view is not a lead and a link visit is not a
// lead. ADUAtlas only ever says "generated" about money that was actually
// paid through a referral.
//
// The referral link matches the one the admin console prints, so the builder
// and ADUAtlas always share the same URL.
const REFERRAL_BASE = "https://aduatlas.com/?ref=";

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

// my_referral_stats() returns jsonb: counts by event kind plus
// referred_users_count and purchased_amount_cents.
const readStats = (r) => {
  const raw = r && typeof r === "object" ? ("ok" in r ? (r.ok ? r.stats ?? r.data ?? {} : null) : r.stats ?? r) : {};
  if (raw === null) return null;
  const counts = raw.counts && typeof raw.counts === "object" ? raw.counts : raw;
  return {
    visits: num(counts.link_visited ?? raw.visits),
    emails: num(counts.email_captured ?? raw.emails),
    signups: num(counts.account_created ?? raw.accounts),
    purchases: num(counts.package_purchased ?? raw.purchases),
    profileViews: num(counts.builder_profile_viewed ?? raw.profile_views),
    contacts: num(counts.builder_contacted ?? raw.contacts),
    projectsSigned: num(counts.project_signed ?? raw.projects_signed),
    referredUsers: num(raw.referred_users_count),
    amountCents: num(raw.purchased_amount_cents ?? raw.purchase_amount_cents),
  };
};

const money = (cents) => `$${Math.round(cents / 100).toLocaleString()}`;
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const Tile = ({ Icon, label, value, hint }) => (
  <div className="bg-canvas border border-stroke rounded-3xl p-6">
    <p className="inline-flex items-center gap-2 text-paper-dim text-sm mb-2">
      <Icon aria-hidden /> {label}
    </p>
    <p className="font-display text-paper text-3xl leading-none mb-1">{value.toLocaleString()}</p>
    {hint && <p className="text-paper-dim text-xs">{hint}</p>}
  </div>
);

// `view` is the displayed state. It is the profile_status except for an
// approved row whose `active` flag is off: that row is not in the directory
// and its referral code does not resolve, so it must not be shown as live.
const StatusCard = ({ status, view = status, children }) => {
  const tone = {
    draft: { Icon: FiFileText, heading: "Finish your profile and submit it for review" },
    pending: { Icon: FiClock, heading: "Under review" },
    approved: { Icon: FiCheckCircle, heading: "Your listing is live" },
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

const BuilderDashboard = () => {
  const [state, setState] = useState({ loading: true, builder: null, error: "" });
  const [stats, setStats] = useState(undefined);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchMyBuilder().then((r) => {
      if (cancelled) return;
      const { builder, error } = unwrapBuilder(r);
      setState({ loading: false, builder, error });
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

  const { loading, builder, error } = state;

  if (loading) return <div className="px-5 sm:px-8 lg:px-12 py-14 text-paper-dim text-sm">Loading your dashboard…</div>;

  // The account exists but the profile does not yet: the profile form is the
  // only useful place to be, so go there directly.
  if (!builder && !error) return <Navigate to="/builder/profile" replace />;

  const status = builder?.profile_status || "draft";
  // Approved but switched off by an admin: not in the directory, link paused.
  const hidden = status === "approved" && builder?.active === false;
  const live = status === "approved" && !hidden;
  const referralLink = builder?.referral_code ? `${REFERRAL_BASE}${builder.referral_code}` : "";

  const copyLink = async () => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError("Copy did not work in this browser. Select the link and copy it by hand.");
    }
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] mb-2">{builder?.name || "Your builder dashboard"}</h1>
        <p className="text-paper-dim text-base">This page shows your profile status, your referral link and the counts that came through it.</p>
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
          <StatusCard status="approved">
            <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-5 max-w-xl">
              Homeowners can find you in the directory. Share your referral link wherever you talk to homeowners. Anyone who arrives through it is attributed to you when they leave an email or buy a plan.
            </p>
            <p className="text-paper-dim text-xs mb-2 inline-flex items-center gap-1.5">
              <FiLink aria-hidden /> Your referral link
            </p>
            {referralLink ? (
              <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                <input readOnly value={referralLink} onFocus={(e) => e.target.select()} aria-label="Referral link" className="flex-1 bg-canvas border border-stroke rounded-xl px-4 py-3 text-paper font-mono text-sm" />
                <button type="button" onClick={copyLink} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim whitespace-nowrap press">
                  <FiCopy /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
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
            <h2 className="font-display text-paper text-xl mb-1">Your referrals</h2>
            {stats === undefined && <p className="text-paper-dim text-sm">Loading counts…</p>}
            {stats === null && <p className="text-paper-dim text-sm">Counts are not available right now.</p>}
            {stats && (
              <>
                <p className="text-paper text-base sm:text-lg mb-5">
                  {plural(stats.visits, "visit", "visits")}, {plural(stats.signups, "sign up", "sign ups")}, {plural(stats.purchases, "purchase", "purchases")}, {money(stats.amountCents)} generated.
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Tile Icon={FiEye} label="Profile views" value={stats.profileViews} hint="Signed in homeowners who opened your profile" />
                  <Tile Icon={FiLink} label="Link visits" value={stats.visits} hint="Times your referral link was opened" />
                  <Tile Icon={FiMessageSquare} label="Homeowner inquiries" value={stats.contacts} hint="Introduction requests through ADUAtlas" />
                  <Tile Icon={FiCheckCircle} label="Signed projects" value={stats.projectsSigned} hint="Recorded by ADUAtlas when a referral signs" />
                </div>
                <p className="text-paper-dim text-xs mt-4 leading-relaxed max-w-2xl">
                  These are counts only. ADUAtlas does not share who any of these homeowners are. When a homeowner wants to talk to you, they request an introduction and ADUAtlas passes it on.
                </p>
              </>
            )}
          </section>
        </>
      )}

      {builder && (
        <section className="bg-canvas border border-stroke rounded-3xl p-7">
          <h2 className="font-display text-paper text-xl mb-3">How the directory works</h2>
          <ul className="text-paper-dim text-sm leading-relaxed space-y-2 list-disc pl-5">
            <li>Homeowners browse builders by state, ADU type and turnkey preference, and read your profile.</li>
            <li>A homeowner who wants to talk to you requests an introduction, and ADUAtlas passes it on to the contact details on your profile.</li>
            <li>Your first 90 days after approval are free. Membership terms are shared with you at approval, and you are never charged per lead.</li>
          </ul>
        </section>
      )}
    </div>
  );
};

export default BuilderDashboard;
