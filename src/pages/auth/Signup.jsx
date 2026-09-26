import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import { signup } from "../../stores/authStore";

// One signup card, two audiences. /create-account creates a homeowner and
// sends them to the plans. /builders/join (or ?role=pro) creates a builder,
// which is a user with role "pro": the account lands in the builder portal
// and never in the homeowner app. The role is clamped server-side to
// homeowner|pro, so nothing here can mint an admin.
const COPY = {
  homeowner: {
    title: "Start your ADU plan.",
    subtitle: "One account for your course, worksheets, feasibility study, and builder introductions.",
    button: "Create my account",
    confirmed: "Check your email to confirm your account, then log in.",
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
  const role = roleProp === "pro" || searchParams.get("role") === "pro" ? "pro" : "homeowner";
  const copy = COPY[role];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    // Email-confirmation flow: no session yet. After they confirm and log in,
    // routeForUser sends a builder to /builder and a homeowner to the plans.
    if (res.needsConfirmation) {
      setNotice(copy.confirmed);
      return;
    }
    // Homeowner: choose a plan next (Phase 1 funnel). Builder: complete the
    // company profile so it can be submitted for review.
    navigate(copy.next, { replace: true });
  };

  return (
    <AuthCard
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        <>
          <p>
            Already a member?{" "}
            <Link to="/login" className="text-accent hover:text-paper transition-colors font-medium">
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
        <FormField
          label="Password"
          type="password"
          placeholder="••••••••••••"
          required
          hint="At least 4 characters"
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

        {role === "pro" && (
          <p className="mt-4 text-xs text-paper-dim leading-relaxed">
            Your profile starts as a draft. ADUAtlas reviews it before it appears in the directory, and your referral link is generated on approval.
          </p>
        )}
      </form>
    </AuthCard>
  );
};

export default Signup;
