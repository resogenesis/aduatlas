import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import { signup } from "../../stores/authStore";

const Signup = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    // Real Supabase Auth when configured; mock otherwise. Email is the
    // identity — display name derives from it in the auth store.
    const res = await signup({ email, password, role: "homeowner" });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Email-confirmation flow: no session yet — tell them to check their inbox.
    if (res.needsConfirmation) {
      setNotice("Check your email to confirm your account, then log in.");
      return;
    }
    // Account created: choose a plan next (Phase 1 funnel).
    navigate("/unlock", { replace: true });
  };

  return (
    <AuthCard
      title="Start your ADU plan."
      subtitle="One account for your course, worksheets, feasibility study, and builder introductions."
      footer={
        <>
          Already a member?{" "}
          <Link to="/login" className="text-accent hover:text-paper transition-colors font-medium">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <FormField
          label="Email"
          type="email"
          placeholder="you@email.com"
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

        <PrimaryButton type="submit">
          Create my account
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default Signup;
