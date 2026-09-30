import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import { landingAfterSignIn, login, safeNextPath } from "../../stores/authStore";

const Login = () => {
  const navigate = useNavigate();
  // Where the person was before they were asked to sign in, when the page that
  // sent them here said so (a sponsored entry, or a portal that needs a
  // session). An in-app path only; anything else is dropped (safeNextPath).
  const [searchParams] = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    // Real Supabase Auth when configured; mock otherwise. The destination is
    // `next` when there is one, then the person's own portal (a government user
    // lands in /gov), then a remembered sponsored entry for a resident, then the
    // role default (landingAfterSignIn).
    const res = await login({ email, password });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate(landingAfterSignIn(res.user, next), { replace: true });
  };


  return (
    <AuthCard
      title="Pick up where you left off."
      subtitle="Log in to access your course, worksheets, and feasibility study."
      footer={
        <>
          New to ADUAtlas?{" "}
          <Link to={`/create-account${nextQuery}`} className="text-accent hover:text-paper transition-colors font-medium">
            Create an account
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex justify-end mb-6">
          <Link
            to="/forgot-password"
            className="tap-target text-xs text-paper-dim hover:text-paper transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <PrimaryButton type="submit">Log in</PrimaryButton>
      </form>

    </AuthCard>
  );
};

export default Login;
