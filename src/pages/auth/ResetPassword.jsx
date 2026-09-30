import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiCheckCircle, FiLock } from "react-icons/fi";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import { supabase } from "../../lib/supabase";
import { refreshEntitlement, routeForUser } from "../../stores/authStore";

// The second half of password recovery. /forgot-password asks Supabase to mail
// a recovery link; that link lands here, and this page is where the new
// password is actually set. Before this existed there was no /reset-password
// route at all and no resetPasswordForEmail call anywhere in the repository,
// so a forgotten password was permanent.
//
// HOW THE LINK ARRIVES. Supabase sends the recovery through its own /verify
// endpoint, which redirects here. Which shape it uses depends on the project
// and on the flow the client was built with, so all of them are handled:
//   - fragment tokens (#access_token=…&type=recovery): the default for this
//     client, whose flowType is implicit. supabase-js consumes these itself
//     while the app boots (detectSessionInUrl is on), so by the time this page
//     renders the recovery session usually already exists;
//   - ?code=… : the PKCE shape, exchanged for a session here;
//   - ?token_hash=…&type=recovery : the server-verification shape;
//   - an error carried back in the fragment or the query (an expired or
//     already-used link), which is reported rather than swallowed.
//
// A recovery session IS a session, so the visitor is signed in while this page
// is open. That is Supabase's design, not a shortcut: the link is the proof of
// address ownership, and the session it opens is what authorises the password
// change. Once the password is saved we re-read entitlement from the server and
// send them to their own home, so nobody has to type the new password straight
// back in.
const MIN_PASSWORD = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const paramsFrom = (raw) => new URLSearchParams(raw.startsWith("#") || raw.startsWith("?") ? raw.slice(1) : raw);

const readableError = (value) => {
  if (!value) return "";
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  } catch {
    return String(value);
  }
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // checking → ready → saved, or invalid (no usable recovery session), or
  // unavailable (no Supabase in this environment at all).
  const [phase, setPhase] = useState(supabase ? "checking" : "unavailable");
  const [problem, setProblem] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [destination, setDestination] = useState("/login");
  // The token exchange below must happen once per link: StrictMode runs effects
  // twice in development and a code or token_hash is single-use. The ref holds
  // the link it already consumed, so a genuinely new link (a second recovery
  // email opened while this page is still mounted) is still read, while a repeat
  // run over the same one is not.
  const consumed = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    const linkKey = `${location.search}|${location.hash}`;
    if (consumed.current === linkKey) return;
    consumed.current = linkKey;

    const fail = (message) => {
      setProblem(message || "");
      setPhase("invalid");
    };

    const run = async () => {
      // Every phase change below happens inside this async function, never
      // synchronously in the effect body, so a second link read while this page
      // is mounted keeps showing the previous verdict for one tick rather than
      // cascading a render.
      const hash = paramsFrom(window.location.hash || "");
      const query = paramsFrom(window.location.search || "");

      const carriedError =
        hash.get("error_description") ||
        query.get("error_description") ||
        hash.get("error") ||
        query.get("error");
      if (carriedError) {
        fail(readableError(carriedError));
        return;
      }

      const code = query.get("code");
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (err) {
          fail(err.message);
          return;
        }
        setPhase("ready");
        return;
      }

      const tokenHash = query.get("token_hash");
      if (tokenHash) {
        const { error: err } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: query.get("type") || "recovery",
        });
        if (err) {
          fail(err.message);
          return;
        }
        setPhase("ready");
        return;
      }

      // Fragment shape, or an already-signed-in visitor changing their password
      // deliberately. Poll briefly: initAuth() normally finishes the fragment
      // exchange before first paint, but it is asynchronous.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          setPhase("ready");
          return;
        }
        await sleep(400);
      }
      fail("");
    };

    run();
  }, [location.search, location.hash]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError("");

    if (password.length < MIN_PASSWORD) {
      setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (err) {
      // The recovery session can expire between opening the link and saving.
      if (err.status === 401 || /session|jwt|expired|token/i.test(err.message || "")) {
        setProblem("Your reset link expired before the new password was saved.");
        setPhase("invalid");
        return;
      }
      setError(err.message || "We could not save that password. Try again.");
      return;
    }

    // Mirror the server's view of this account (role, tier, paid state) before
    // choosing where to send them, so a builder lands in the builder portal and
    // a paid homeowner in the app rather than back on the plans.
    const user = await refreshEntitlement();
    setDestination(user ? routeForUser(user) : "/login");
    setPhase("saved");
  };

  if (phase === "unavailable") {
    return (
      <AuthCard
        title="Password reset is unavailable here."
        subtitle="Setting a new password needs the ADUAtlas server, which is not configured in this environment."
        footer={
          <Link to="/login" className="text-accent hover:text-paper transition-colors font-medium">
            Back to log in
          </Link>
        }
      >
        <p className="text-sm text-paper-dim leading-relaxed">
          Nothing was changed. On the live site this page is reached from the link in the password reset email.
        </p>
      </AuthCard>
    );
  }

  if (phase === "checking") {
    return (
      <AuthCard title="Checking your link…" subtitle="One moment while we confirm the reset link you opened.">
        <p role="status" className="text-sm text-paper-dim leading-relaxed">
          If this page does not move on, the link may have expired. You can always request a new one.
        </p>
      </AuthCard>
    );
  }

  if (phase === "invalid") {
    return (
      <AuthCard
        title="This reset link won't work."
        subtitle="A reset link can be used once and it expires. Request a new one and we'll send another."
        footer={
          <>
            Know your password?{" "}
            <Link to="/login" className="text-accent hover:text-paper transition-colors font-medium">
              Log in
            </Link>
          </>
        }
      >
        {problem && (
          <p className="mb-5 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {problem}
          </p>
        )}
        <Link
          to="/forgot-password"
          className="block w-full text-center py-3.5 px-5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors"
        >
          Send me a new reset link
        </Link>
      </AuthCard>
    );
  }

  if (phase === "saved") {
    return (
      <AuthCard title="Your password is set." subtitle="You're signed in with the new password.">
        <p role="status" className="mb-6 text-sm text-paper-dim leading-relaxed inline-flex items-start gap-2">
          <FiCheckCircle className="text-accent mt-0.5 shrink-0" />
          <span>
            The old password no longer works, and the reset link you used is spent. Keep the new one somewhere safe.
          </span>
        </p>
        <PrimaryButton type="button" onClick={() => navigate(destination, { replace: true })}>
          Continue
        </PrimaryButton>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password."
      subtitle="This replaces the old one everywhere. You stay signed in on this device."
      footer={
        <>
          Changed your mind?{" "}
          <Link to="/login" className="text-accent hover:text-paper transition-colors font-medium">
            Back to log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSave}>
        <FormField
          label="New password"
          type="password"
          placeholder="••••••••••••"
          required
          hint={`At least ${MIN_PASSWORD} characters`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormField
          label="New password again"
          type="password"
          placeholder="••••••••••••"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && (
          <p className="mb-4 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <PrimaryButton type="submit">
          <span className="inline-flex items-center gap-2 justify-center">
            <FiLock /> {saving ? "Saving…" : "Save new password"}
          </span>
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default ResetPassword;
