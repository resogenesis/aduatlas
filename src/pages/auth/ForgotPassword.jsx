import { useState } from "react";
import { Link } from "react-router-dom";
import { FiMail } from "react-icons/fi";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import { supabase } from "../../lib/supabase";

// Password recovery, for real.
//
// This page used to render `<form onSubmit={(e) => e.preventDefault()}>` under
// the promise "We'll send a magic link." Nothing was sent and nothing was
// reset, and api/admin/_update_user.js accepts only role and tier, so an admin
// could not reset a password either. Anyone who forgot theirs was locked out
// permanently, including a paying Concierge customer and Amy. It now asks
// Supabase Auth for a recovery link that lands on /reset-password, where the
// new password is actually set.
//
// Two rules this page keeps:
//
//  1. It never reveals whether an address has an ADUAtlas account. Both cases
//     return the one neutral sentence below, so the form cannot be used to
//     enumerate customers or builders.
//  2. It says what it does. There is no magic link and no passwordless
//     sign-in: the link sets a new password. Where mail cannot be sent at all
//     (no Supabase configured, which is the local mock), it says so instead of
//     claiming a send that did not happen. Unknown means unknown, and so does
//     "did not happen" (Phase 1 spec, decision 2b).
const NEUTRAL_CONFIRMATION =
  "If an ADUAtlas account uses that address, a link to set a new password is on its way. The link opens a page where you choose the new password, it works once, and it expires. If it has not arrived in a few minutes, check your spam folder.";

// Supabase answers a reset request for an unknown address exactly as it answers
// one for a real customer, which is what makes rule 1 hold. This pattern is a
// second line of defence only: if the backend ever does say "no such user",
// this page still must not repeat that back to whoever is typing.
const LOOKS_LIKE_NOT_FOUND = /user not found|no user|not registered/i;

// The auth server REFUSED THE ADDRESS ITSELF (R3-19): its format, or a domain it
// will not send to. That says nothing about whether an account uses the address,
// so rule 1 still holds, but it is not a passing failure either: sending the
// same address again cannot work, and "try again in a moment" sent people round
// in a circle. Supabase reports it as a 400 with one of these codes; the message
// test covers an older server that sends only the sentence ("Unable to validate
// email address: invalid format", 'Email address "..." is invalid').
const ADDRESS_REFUSED_CODES = new Set(["email_address_invalid", "validation_failed", "email_address_not_authorized"]);
const LOOKS_LIKE_ADDRESS_REFUSED = /unable to validate email|email address .* is invalid|invalid format|not authorized/i;
const addressRefused = (err) =>
  ADDRESS_REFUSED_CODES.has(err?.code) || (err?.status === 400 && LOOKS_LIKE_ADDRESS_REFUSED.test(err?.message || ""));

const ADDRESS_REFUSED =
  "We could not accept that email address, so no reset link was sent. Check it for typing mistakes and send it again. If the address is right, write to hello@aduatlas.com from it and we will help you reset your password.";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (state === "sending") return;
    setError("");

    // No Supabase in this environment means no auth server and no mail.
    if (!supabase) {
      setState("error");
      setError(
        "Password recovery needs the ADUAtlas server, which is not configured in this environment. Nothing was sent."
      );
      return;
    }

    setState("sending");
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/reset-password` }
    );

    if (err && addressRefused(err)) {
      setState("error");
      setError(ADDRESS_REFUSED);
      return;
    }

    if (err && !LOOKS_LIKE_NOT_FOUND.test(err.message || "")) {
      setState("error");
      setError(
        err.status === 429
          ? "That is too many reset requests from here. Wait a minute and try again."
          : "We could not send the reset link just now. Try again in a moment, and write to hello@aduatlas.com if it keeps failing."
      );
      return;
    }

    setState("sent");
  };

  const sent = state === "sent";

  return (
    <AuthCard
      title={sent ? "Check your email." : "Reset your password."}
      subtitle={
        sent
          ? undefined
          : "Enter the email on your ADUAtlas account and we'll send you a link to set a new password."
      }
      footer={
        <>
          Remember it now?{" "}
          <Link to="/login" className="text-accent hover:text-paper transition-colors font-medium">
            Log in
          </Link>
        </>
      }
    >
      {sent ? (
        <>
          <p role="status" className="text-sm text-paper-dim leading-relaxed">
            {NEUTRAL_CONFIRMATION}
          </p>
          <button
            type="button"
            onClick={() => {
              setState("idle");
              setError("");
            }}
            className="mt-5 text-xs text-paper-dim hover:text-paper transition-colors"
          >
            Use a different email address
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <FormField
            label="Email"
            type="email"
            placeholder="you@email.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {error && (
            <p role="alert" className="mb-4 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <PrimaryButton type="submit">
            <span className="inline-flex items-center gap-2 justify-center">
              <FiMail /> {state === "sending" ? "Sending…" : "Send reset link"}
            </span>
          </PrimaryButton>
        </form>
      )}

      <p className="mt-5 text-center text-xs text-paper-dim leading-relaxed">
        New here?{" "}
        <Link to="/create-account" className="text-paper hover:text-accent transition-colors">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
};

export default ForgotPassword;
