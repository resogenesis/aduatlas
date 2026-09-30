import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import { hasPendingPartnerEntry, isSponsoredEntryPath, landingAfterSignIn, safeNextPath, signup } from "../../stores/authStore";
import { hasGovClaimTarget, recallGovClaimTarget } from "../../lib/regulatory";
import { PENDING_CLAIM_KEY } from "../builder/BuilderProfileEdit";

// One signup card, two audiences. /create-account creates a homeowner and
// sends them to the plans. /builders/join (or ?role=pro) creates a builder,
// which is a user with role "pro": the account lands in the builder portal
// and never in the homeowner app. The role is clamped server-side to
// homeowner|pro, so nothing here can mint an admin.
//
// An invitation link may carry the claim code for a listing ADUAtlas already
// created (/builders/join?claim=ABCD2345). A well-formed code implies a
// builder signup; it is parked in the browser on success so the claim panel
// in the portal is prefilled after the email confirmation round trip. The
// claim itself happens in the portal (claim_my_builder), never here.
const CLAIM_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const readClaim = (params) => {
  const raw = (params.get("claim") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CLAIM_CODE_RE.test(raw) ? raw : "";
};

// The address Stripe billed, handed over by /welcome as
// /create-account?email=<address>. This page used to ignore it and start the
// field empty, and because the email column IS the identity, a buyer who
// retyped a different address created a second, unpaid row while the purchase
// sat on the first one. So: read it, prefill it, and name it on the page.
//
// It stays editable. Someone who paid from a work address and wants the account
// on a personal one must be able to say so, and the warning below tells them
// plainly what that costs rather than letting them find out later.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const readEmail = (params) => {
  const raw = (params.get("email") || "").trim().toLowerCase();
  return EMAIL_RE.test(raw) ? raw : "";
};
const OPS_EMAIL = "hello@aduatlas.com";
const COPY = {
  homeowner: {
    title: "Start your ADU plan.",
    subtitle: "One account for your course, worksheets, feasibility study, and builder introductions.",
    button: "Create my account",
    confirmed: "Check your email to confirm your account, then log in.",
    // After a sign-up that returns a session, a homeowner goes where
    // landingAfterSignIn() says: `next`, a remembered sponsored entry, or the
    // plans for an account that holds nothing yet.
    next: "/unlock",
  },
  pro: {
    title: "Create your builder account",
    subtitle: "List your company in the ADUAtlas directory and get a referral link that tracks the homeowners you send our way.",
    button: "Create my builder account",
    confirmed: "Check your email to confirm your builder account, then log in to finish your company profile.",
    next: "/builder/profile",
  },
};

const Signup = ({ role: roleProp }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const claim = readClaim(searchParams);
  const role = roleProp === "pro" || searchParams.get("role") === "pro" || claim ? "pro" : "homeowner";
  const copy = COPY[role];
  const purchaseEmail = readEmail(searchParams);
  // Where the person was before they were asked for an account (a sponsored
  // entry sends its own path). An in-app path only (safeNextPath).
  const next = safeNextPath(searchParams.get("next"));
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  const [email, setEmail] = useState(purchaseEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // The ?email= parameter is prefilled for either audience, because an invited
  // builder may be sent one too. The PURCHASE sentences below are homeowner
  // only: a builder has not bought a package, and telling one that a purchase is
  // attached to their address would be a claim the product cannot support.
  const showsPurchase = Boolean(purchaseEmail) && role === "homeowner";
  // True once the buyer has typed over the address their purchase is on. The
  // comparison is on the trimmed, lowercased value, so casing or a stray space
  // is not treated as a different person.
  const emailChanged = showsPurchase && email.trim().toLowerCase() !== purchaseEmail;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    // Real Supabase Auth when configured; mock otherwise. Email is the
    // identity; the display name derives from it in the auth store.
    const res = await signup({ email, password, role });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (claim) {
      try {
        window.localStorage.setItem(PENDING_CLAIM_KEY, claim);
      } catch {
        // best effort only; the code can be typed in the portal
      }
    }
    // Email-confirmation flow: no session yet. After they confirm and log in,
    // routeForUser sends a builder to /builder and a homeowner to the plans.
    if (res.needsConfirmation) {
      // A resident who came from a sponsored link is told the way back: the
      // entry is remembered in this browser, and logging in here returns to it.
      // A confirmation link that signs them in on the home page instead leaves
      // the header's "Finish sponsored access" pointing at it (Header.jsx).
      const sponsored = role === "homeowner" && (isSponsoredEntryPath(next) || hasPendingPartnerEntry());
      // A government claimant: the record they chose is kept in this browser
      // (T4-06), and logging in here returns them to it.
      const claiming = role === "homeowner" && !sponsored && hasGovClaimTarget(recallGovClaimTarget());
      setNotice(
        sponsored
          ? `${copy.confirmed} When you log in from this browser, we bring you back to your sponsored access to finish it.`
          : claiming
          ? `${copy.confirmed} When you log in from this browser, we bring you back to your claim.`
          : copy.confirmed
      );
      return;
    }
    // Builder: complete the company profile so it can be submitted for review,
    // or, with a claim code in hand, the dashboard where the claim panel is
    // prefilled. Homeowner: back to where they came from (a sponsored entry),
    // otherwise the plans (Phase 1 funnel), or the portal for an account that
    // already holds a plan.
    navigate(claim ? "/builder" : role === "pro" ? copy.next : landingAfterSignIn(res.user, next), { replace: true });
  };

  return (
    <AuthCard
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        <>
          <p>
            Already a member?{" "}
            <Link to={`/login${nextQuery}`} className="text-accent hover:text-paper transition-colors font-medium">
              Log in
            </Link>
          </p>
          <p className="mt-2">
            {role === "pro" ? (
              <>
                Planning an ADU for your own property?{" "}
                <Link to="/create-account" className="text-accent hover:text-paper transition-colors font-medium">
                  Create a homeowner account
                </Link>
              </>
            ) : (
              <>
                Are you a builder?{" "}
                <Link to="/builders/join" className="text-accent hover:text-paper transition-colors font-medium">
                  Create a builder account
                </Link>
              </>
            )}
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <FormField
          label={role === "pro" ? "Work email" : "Email"}
          type="email"
          placeholder={role === "pro" ? "you@company.com" : "you@email.com"}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {showsPurchase && !emailChanged && (
          <p className="-mt-2 mb-5 text-xs text-paper-dim leading-relaxed bg-accent/5 border border-accent/20 rounded-xl px-4 py-3">
            Your purchase is attached to{" "}
            <span className="text-paper font-medium break-all">{purchaseEmail}</span>. Keep this address and the
            account unlocks as soon as you confirm it.
          </p>
        )}
        {showsPurchase && emailChanged && (
          <p className="-mt-2 mb-5 text-xs text-paper-dim leading-relaxed bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            Your purchase is attached to{" "}
            <span className="text-paper font-medium break-all">{purchaseEmail}</span>, not the address above. Creating
            the account on a different address makes a second, unpaid account. Use the address you paid with, or write
            to{" "}
            <a href={`mailto:${OPS_EMAIL}`} className="text-accent hover:text-paper transition-colors">
              {OPS_EMAIL}
            </a>{" "}
            and we will move the purchase across.
          </p>
        )}
        <FormField
          label="Password"
          type="password"
          placeholder="••••••••••••"
          required
          hint="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p className="mb-4 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-4 text-sm text-accent bg-accent/10 border border-accent/30 rounded-xl px-4 py-3">
            {notice}
          </p>
        )}

        <PrimaryButton type="submit">{copy.button}</PrimaryButton>

        {role === "pro" && claim && (
          <p className="mt-4 text-xs text-paper-dim leading-relaxed">
            Claim code <span className="font-mono text-paper tracking-widest">{claim}</span> is ready for you. After you create your account and log in, enter it in your builder portal to take over your listing.
          </p>
        )}
        {role === "pro" && !claim && (
          <p className="mt-4 text-xs text-paper-dim leading-relaxed">
            Already listed on ADUAtlas? Enter the claim code from our invitation in your portal after you log in. Otherwise your profile starts as a draft, ADUAtlas reviews it before it appears in the directory, and your referral link switches on at approval.
          </p>
        )}
      </form>
    </AuthCard>
  );
};

export default Signup;
